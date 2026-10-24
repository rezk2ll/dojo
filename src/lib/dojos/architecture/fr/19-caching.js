const K8S = 'https://github.com/kubernetes/kubernetes/blob/8d9877ea2fe0c69580c5d730bccab6dc16a5c841';
const CACHE = `${K8S}/staging/src/k8s.io/apiserver/pkg/authentication/token/cache/cached_token_authenticator.go`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'caching',
	part: 'Entre les services',
	title: 'Le cache',
	minutes: 10,
	hook: [
		'La gateway d’hier vérifiait elle-même les JWT, avec des clés en cache. Mais certains tokens sont opaques : seul le fournisseur d’identité peut dire s’ils sont valides. Sans cache, la gateway l’interroge à chaque requête. Chaque vérification est un appel réseau, sur le chemin de chaque clic, vers un système que tous les services partagent.',
		'Tu peux retenir la réponse quelques minutes, et un token valide ne coûte alors qu’une vérification toutes les quelques minutes. Mais le jour où un admin révoque ce token, **la gateway continue de dire oui** jusqu’à ce que l’entrée expire.',
		'Un cache est une copie de données que tu ne possèdes pas (jour 17). Pour chaque cache, tu dois donc dire **ce qui rend une entrée périmée, et qui l’invalide**. Phil Karlton : « Il n’y a que deux choses difficiles en informatique : l’invalidation de cache et le nommage des choses. »'
	],
	terms: [
		{ term: 'Hit / miss', def: 'Un hit trouve la réponse dans le cache. Un miss paie l’appel lent, puis stocke en général le résultat.' },
		{ term: 'TTL', def: 'Time to live, durée de vie : combien de temps une entrée reste valable avant d’être jetée. Avec un TTL, personne n’a à retirer l’entrée, c’est l’horloge qui le fait.' },
		{ term: 'Périmé (stale)', def: 'La réponse en cache ne correspond plus aux données du propriétaire. Tout cache est périmé de temps en temps, donc tu dois savoir pendant combien de temps et ce que ça casse.' },
		{ term: 'Invalidation', def: 'Retirer ou rafraîchir une entrée parce que la source a changé. Quelqu’un doit savoir qu’elle a changé.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['client["kubectl ou un pod"] -->|"Bearer token"| api["kube-apiserver"]', 'api --> tc[("Cache de tokens : HMAC du token vers l’utilisateur")]', 'api -->|"seulement sur un miss"| hook["Webhook de tokens"]', 'class hook ext'],
				highlight: ['client', 'api', 'tc', 'hook'],
				note: 'Kubernetes peut demander à un webhook externe si un token est valide. L’API server garde chaque réponse **dans sa propre mémoire**, indexée par un hash à clé du token. Un hit ne fait aucun appel réseau.'
			},
			{
				add: ['many["Dix requêtes, même token"] -->|"toutes en miss en même temps"| api'],
				highlight: ['many'],
				note: 'Les dix miss partagent un seul appel au webhook, grâce au `singleflight` de Go. On appelle ça le **request coalescing**. Sans lui, un cache froid envoie dix appels identiques au moment où le webhook est le plus chargé.'
			},
			{
				add: ['ttl["TTL, 2 minutes par défaut"] -.->|"fait expirer les entrées"| tc'],
				highlight: ['ttl'],
				note: 'Quand un token est révoqué, aucun code n’invalide son entrée. Seul le TTL le fait : `--authentication-token-webhook-cache-ttl`, deux minutes par défaut. Pendant jusqu’à deux minutes, **le token révoqué marche encore**.'
			},
			{
				add: ['owner["Appli Rails : produit enregistré"] -->|"updated_at change"| key["Clé de cache : products/233-20140225..."]', 'key -.->|"l’ancienne clé n’est plus jamais lue"| store[("Cache de fragments")]'],
				highlight: ['owner', 'key', 'store'],
				note: 'Dans Rails, **le propriétaire invalide** : le `updated_at` de l’enregistrement fait partie de la clé de cache. Enregistrer le produit change la clé, donc la lecture suivante fait un miss et reconstruit. Personne n’a rien à supprimer.'
			}
		]
	},
	example: {
		title: 'apiserver/…/token/cache/cached_token_authenticator.go',
		repo: 'kubernetes/kubernetes',
		url: `${CACHE}#L144-L216`,
		lang: 'go',
		code: `func (a *cachedTokenAuthenticator) doAuthenticateToken(ctx context.Context, token string) *cacheRecord {
…
	auds, audsOk := authenticator.AudiencesFrom(ctx)

	key := keyFunc(a.hashPool, auds, token)
	if record, ok := a.cache.get(key); ok {
		// Record cache hit
		doneAuthenticating(true)
		return record
	}
…
	c := a.group.DoChan(key, func() (val interface{}, _ error) {
…
		// Check again for a cached record. We may have raced with a fetch.
		if record, ok := a.cache.get(key); ok {
			return record, nil
		}
…
		record.resp, record.ok, record.err = a.authenticator.AuthenticateToken(ctx, token)
…
		if !a.cacheErrs && record.err != nil {
			return record, nil
		}

		switch {
		case record.ok && a.successTTL > 0:
			a.cache.set(key, record, a.successTTL)
		case !record.ok && a.failureTTL > 0:
			a.cache.set(key, record, a.failureTTL)
		}`,
		notes: [
			'La ligne 5 construit la clé, un [HMAC du token et de ses audiences](' + CACHE + '#L231-L254) avec un secret aléatoire généré au démarrage. Les tokens bruts ne sont jamais gardés : le commentaire dit que ça « keeps tokens out of memory ». Un token envoyé pour deux audiences occupe deux entrées.',
			'La ligne 12 regroupe les appels : `a.group.DoChan(key, ...)` lance une seule recherche par clé, quel que soit le nombre de requêtes qui attendent. Les lignes 15 à 17 revérifient le cache, parce qu’un autre appelant a pu le remplir entre-temps.',
			'Les lignes 25 à 30 stockent la réponse avec un TTL : `successTTL` pour un oui, `failureTTL` pour un non. Un token révoqué reste en cache jusqu’à la fin de ce TTL. Pour le webhook, [les deux prennent la valeur du même flag](' + K8S + '/pkg/kubeapiserver/authenticator/config.go#L416), deux minutes par défaut.',
			'Les lignes 21 à 23 écartent les erreurs : pour le webhook, `cacheErrs` vaut `false`. Si le webhook est en panne, la requête suivante réessaie au lieu d’échouer pendant deux minutes. Un token que le webhook a rejeté reste quand même en cache comme rejeté.',
			'Le cache n’a pas de limite de taille. Il est [découpé en 32 parts](' + CACHE + '#L112-L119) pour répartir la contention sur les verrous, et chaque part est une map à expiration sans limite d’entrées. Un commentaire parle encore d’« a 32k entry cache », mais seul le TTL retire des entrées, donc vérifie le code avant de croire une taille écrite en commentaire.'
		]
	},
	tradeoff: {
		gain: [
			'Un hit lit la mémoire locale au lieu de faire un appel réseau.',
			'Le fournisseur d’identité ou la base reçoit une requête par TTL au lieu d’une par action utilisateur.',
			'Quand une dépendance ralentit un moment, les hits répondent toujours à la vitesse de la mémoire.'
		],
		cost: [
			'Le cache sert des réponses périmées : un token révoqué continue de marcher pendant jusqu’à un TTL.',
			'Le cache prend de la mémoire, et tu dois choisir une limite de taille. Chaque processus serveur garde sa propre copie, et deux copies peuvent ne pas être d’accord.',
			'Un TTL ne demande aucun code mais ignore les changements. Des clés ou des événements pilotés par le propriétaire suivent chaque changement, mais le code du propriétaire doit y participer, et ce code est difficile à tester.'
		]
	},
	task: {
		prompt: 'Pour chacun de ces trois caches, écris quatre choses : la clé, ce qui rend une entrée périmée, qui l’invalide, et le pire cas pendant qu’elle est périmée. (a) Le cache de tokens webhook de kube-apiserver. (b) Une gateway qui met en cache les clés publiques du fournisseur d’identité (JWKS) pendant 5 minutes. (c) Un cache de fragments Rails avec une clé `cache_key_with_version`.',
		hint: 'Pour « qui invalide », la bonne réponse est souvent « personne, c’est le TTL ». Demande-toi alors combien dure le TTL.',
		answer: [
			'(a) Clé : HMAC du token et des audiences. Périmé : token révoqué. Invalidé par : le TTL, 2 minutes par défaut. Pire cas : un token révoqué continue de marcher jusqu’à 2 minutes, pour chaque API server.',
			'(b) Clé : l’URL du JWKS. Périmé : le fournisseur fait une rotation de ses clés. Invalidé par : le TTL. Pire cas : les tokens signés avec la nouvelle clé sont rejetés pendant jusqu’à 5 minutes. Une correction courante : refaire un fetch une fois quand un token cite un id de clé (`kid`) absent du jeu en cache.',
			'(c) Clé : classe, id et `updated_at`. Périmé : jamais pour cet enregistrement, puisqu’un changement crée une nouvelle clé. Invalidé par : le propriétaire, en enregistrant. Pire cas : un fragment englobant qui l’embarque reste périmé, sauf si l’enfant utilise `touch: true`.',
			'Si tu n’as pas su répondre à « qui invalide » pour un de tes propres caches, regarde celui-là en premier.'
		],
		steps: [
			{
				title: 'Nomme les clés',
				questions: [
					{ q: '(a) Quelle est la clé du cache de tokens de kube-apiserver ?', options: ['Le token brut', 'Un HMAC du token et de ses audiences', 'Le nom d’utilisateur de la réponse', 'L’URL du webhook'], answer: 1, why: '`keyFunc` hache le token avec ses audiences et un secret aléatoire généré au démarrage.' },
					{ q: 'Pourquoi (a) ne prend-il pas le token brut comme clé ?', options: ['Un hash se compare plus vite', 'Les tokens bruts sont trop courts pour être uniques', 'Les maps Go ne gardent pas les longues chaînes', 'Ça garde les tokens hors de la mémoire'], answer: 3, why: 'Le commentaire du code le dit. Un dump du cache ne fait pas fuiter de tokens utilisables.' },
					{ q: '(b) Quelle est la clé du cache JWKS de la gateway ?', options: ['La signature de chaque token', 'L’id d’utilisateur dans le token', 'L’URL du JWKS', 'L’heure du dernier fetch'], answer: 2, why: 'La gateway garde un jeu de clés par fournisseur, récupéré à cette URL.' },
					{ q: '(c) Qu’est-ce qui entre dans une clé `cache_key_with_version` ?', options: ['La classe, l’id et le `updated_at` de l’enregistrement', 'L’URL de la page', 'Un id aléatoire par requête', 'Le nom du fichier de vue'], answer: 0, why: 'La version vient de `updated_at`, donc la clé change à chaque enregistrement.' }
				]
			},
			{
				title: 'Dis ce qui la périme',
				questions: [
					{ q: '(a) Quand une réponse de token en cache est-elle périmée ?', options: ['Quand le webhook redémarre', 'Quand le token est révoqué', 'Quand l’utilisateur se reconnecte', 'Quand une deuxième requête arrive'], answer: 1, why: 'Le cache dit encore oui, mais le propriétaire, le webhook, dirait maintenant non.' },
					{ q: '(b) Quand le jeu de clés en cache est-il périmé ?', options: ['Quand un utilisateur se déconnecte', 'Quand un token expire', 'Quand la gateway redémarre', 'Quand le fournisseur fait une rotation de ses clés'], answer: 3, why: 'Les nouveaux tokens sont alors signés avec une clé que le jeu en cache n’a pas.' },
					{ q: '(c) Un script change un prix avec un `UPDATE` SQL brut qui ne touche pas à `updated_at`. Qu’affiche la page ?', options: ['Le nouveau prix : Rails surveille la table', 'L’ancien prix : la clé n’a pas changé, donc l’ancien fragment est toujours lu', 'Une erreur, jusqu’à ce qu’on vide le cache', 'Un fragment vide'], answer: 1, why: 'La clé ne bouge que quand `updated_at` bouge. Une écriture qui le saute laisse une entrée périmée sous la clé actuelle.' },
					{ q: 'En général, que veut dire « périmé » ?', options: ['La réponse en cache ne correspond plus aux données du propriétaire', 'L’entrée a plus d’un jour', 'La recherche a fait un miss', 'Personne n’a encore lu l’entrée'], answer: 0, why: 'L’âge seul n’est pas le critère. Ce qui compte, c’est si la source a changé.' }
				]
			},
			{
				title: 'Dis qui invalide',
				questions: [
					{ q: '(a) Tu baisses `--authentication-token-webhook-cache-ttl` à 10 secondes. Que paies-tu pour cette fenêtre plus courte ?', options: ['Rien : un TTL plus court est gratuit', 'Les erreurs sont mises en cache à la place', 'Plus d’appels au webhook : chaque token actif est revérifié toutes les 10 secondes', 'Moins d’appels au webhook'], answer: 2, why: 'Le TTL est la seule invalidation ici, donc un TTL plus court veut dire plus de miss, et chaque miss est un appel au webhook.' },
					{ q: '(b) Qui rafraîchit le jeu de clés quand le fournisseur fait une rotation ?', options: ['Le fournisseur, en poussant les nouvelles clés', 'Personne : c’est le TTL de 5 minutes', 'Chaque service derrière la gateway', 'L’admin du SSO, à la main'], answer: 1, why: 'La gateway ne refait un fetch que quand l’entrée expire.' },
					{ q: '(c) Ici, c’est le propriétaire qui invalide, pas un TTL. Qu’est-ce que ça coûte ?', options: ['Le code du propriétaire doit participer à chaque écriture, et ce code est dur à tester', 'Rien : Rails surveille la base pour voir les changements', 'Un cron qui compare les fragments aux lignes', 'Un TTL sur chaque vue en plus'], answer: 0, why: 'Les clés pilotées par le propriétaire attrapent chaque changement, mais seulement quand chaque écriture passe par le code du propriétaire.' },
					{ q: 'Dans (a), le webhook est en panne et renvoie une erreur. Cette réponse est-elle mise en cache ?', options: ['Oui, pendant deux minutes', 'Oui, jusqu’au retour du webhook', 'Seulement comme token rejeté', 'Non : `cacheErrs` vaut false, donc la requête suivante réessaie'], answer: 3, why: 'Les erreurs sont écartées, donc une courte panne ne fait pas échouer les requêtes pendant tout un TTL.' }
				]
			},
			{
				title: 'Nomme le pire cas',
				questions: [
					{ q: '(a) Le webhook rejette un token, puis un admin répare le compte de l’utilisateur. Que voit l’utilisateur ?', options: ['L’accès tout de suite : les rejets ne sont pas mis en cache', 'Un 503 jusqu’au redémarrage du webhook', 'Toujours rejeté jusqu’à l’expiration du « non » en cache, jusqu’à 2 minutes', 'L’accès, mais seulement en anonyme'], answer: 2, why: 'Un rejet est mis en cache avec `failureTTL`, réglé par le même flag. Seules les erreurs sont écartées.' },
					{ q: '(b) Quel est le pire cas pendant que le jeu de clés est périmé ?', options: ['Les tokens signés avec la nouvelle clé sont rejetés pendant jusqu’à 5 minutes', 'Les vieux tokens marchent pour toujours', 'Chaque requête refait un fetch des clés', 'Les tokens révoqués passent encore'], answer: 0, why: 'La gateway ne peut pas vérifier une signature faite avec une clé qu’elle n’a pas.' },
					{ q: 'Comment réduis-tu le pire cas de (b) ?', options: ['Revérifie la signature avec les clés en cache', 'Refais un fetch une fois quand un token cite un `kid` absent du jeu en cache', 'Garde les clés en cache une journée', 'Rejette chaque token qui a un `kid`'], answer: 1, why: 'Un id de clé inconnu est le signe d’une rotation, donc un seul fetch règle le problème tout de suite.' },
					{ q: '(c) Quel est le pire cas ?', options: ['Le produit affiche un vieux prix pour toujours', 'Chaque page est rendue deux fois', 'L’enregistrement du produit échoue', 'Un fragment englobant qui l’embarque reste périmé, sauf si l’enfant utilise `touch: true`'], answer: 3, why: 'La clé englobante porte le `updated_at` du parent, qui ne bouge pas quand seul l’enfant change.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Un admin révoque le token d’Alice. Un API server a accepté ce token il y a une minute et met en cache les réponses sur les tokens pendant 2 minutes. Que se passe-t-il ?',
			options: [
				'Ses requêtes continuent de marcher pendant environ une minute de plus, jusqu’à l’expiration de l’entrée',
				'Le serveur rejette sa prochaine requête, parce qu’il est prévenu de la révocation',
				'Le serveur revérifie de toute façon le token à chaque requête, donc le cache est contourné',
				'L’entrée de cache est supprimée, parce que le hash d’un token révoqué change'
			],
			answer: 0,
			why: 'Rien ne prévient le serveur de la révocation. Seul le TTL de 2 minutes retire l’entrée, stockée il y a une minute, donc Alice garde l’accès environ une minute de plus.'
		},
		{
			q: 'Le cache de tokens de Kubernetes utilise `singleflight`. Quel problème ça résout ?',
			options: [
				'Il ne garde qu’une seule entrée de cache par utilisateur, quel que soit le token envoyé avec la requête',
				'Il garantit que chaque token n’est vérifié qu’une seule fois dans sa vie, puis accepté pour toujours',
				'Quand plusieurs requêtes avec le même token font un miss en même temps, un seul appel au webhook est fait',
				'Il répartit les entrées sur 32 parts pour que les requêtes concurrentes ne se battent pas pour un verrou'
			],
			answer: 2,
			why: '`singleflight` fait du request coalescing : un appel par clé, partagé par toutes les requêtes qui attendent. Les 32 parts viennent du cache découpé, un autre bout de code. Un token est quand même revérifié après chaque TTL.'
		},
		{
			q: 'Une vue Rails met en cache un produit avec `cache_key_with_version`. Le prix du produit change. Pourquoi la page affiche-t-elle le nouveau prix sans que personne ait supprimé l’ancienne entrée ?',
			options: [
				'Rails vide tous les fragments en cache d’un modèle dès qu’une de ses lignes est enregistrée',
				'Enregistrer change `updated_at`, qui fait partie de la clé, donc la lecture suivante cherche une nouvelle clé',
				'Le stockage de cache compare l’entrée avec la ligne en base avant chaque lecture',
				'Les caches de fragments ne vivent que le temps d’une requête, donc chaque page est recalculée'
			],
			answer: 1,
			why: 'La clé contient la version tirée de `updated_at`. Après l’enregistrement, aucune lecture ne demande l’ancienne clé, et le stockage de cache l’évince plus tard. L’écriture du propriétaire a fait l’invalidation.'
		}
	],
	recall: {
		q: 'kube-apiserver met en cache les réponses du webhook de tokens. Qui invalide une entrée quand le token est révoqué, et combien de temps le token révoqué peut-il encore marcher ?',
		a: 'Personne. Seul le TTL la retire : `--authentication-token-webhook-cache-ttl`, 2 minutes par défaut, donc le token marche jusqu’à 2 minutes par API server.'
	},
	sources: [
		{ title: 'Martin Fowler, TwoHardThings', url: 'https://martinfowler.com/bliki/TwoHardThings.html' },
		{ title: 'RFC 9111, HTTP Caching', url: 'https://datatracker.ietf.org/doc/html/rfc9111' },
		{ title: 'Kubernetes docs, Webhook token authentication', url: 'https://kubernetes.io/docs/reference/access-authn-authz/authentication/' },
		{ title: 'Rails Guides, Caching with Rails', url: 'https://guides.rubyonrails.org/caching_with_rails.html' },
		{ title: 'Kubernetes, cached_token_authenticator.go', url: `${CACHE}#L144-L216` }
	]
};
