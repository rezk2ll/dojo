const K8S = 'https://github.com/kubernetes/kubernetes/blob/8d9877ea2fe0c69580c5d730bccab6dc16a5c841';
const CACHE = `${K8S}/staging/src/k8s.io/apiserver/pkg/authentication/token/cache/cached_token_authenticator.go`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'caching',
	part: 'Entre les services',
	title: 'Le cache',
	minutes: 10,
	hook: [
		'La gateway d’hier vérifiait elle-même les JWT, avec des clés en cache. Mais certains tokens sont opaques : seul le fournisseur d’identité peut dire s’ils sont valides. Sans cache, ça veut dire lui poser la question à chaque requête. Un appel réseau, sur le chemin de chaque clic, vers un système que tous les services partagent.',
		'La solution évidente : retenir la réponse un moment. Un token valide ne coûte alors plus qu’une vérification toutes les quelques minutes. Mais le jour où un admin révoque ce token, **la gateway continue de dire oui** jusqu’à ce que l’entrée expire.',
		'Un cache est une **copie de données que tu ne possèdes pas** (jour 17). Chaque cache doit donc répondre à deux questions : **qu’est-ce qui rend une entrée périmée**, et **qui l’invalide**. La phrase de Phil Karlton est célèbre pour une bonne raison : « Il n’y a que deux choses difficiles en informatique : l’invalidation de cache et le nommage des choses. »'
	],
	terms: [
		{ term: 'Hit / miss', def: 'Hit : la réponse est dans le cache. Miss : tu paies l’appel lent, puis en général tu stockes le résultat.' },
		{ term: 'TTL', def: 'Time to live, durée de vie. Combien de temps on fait confiance à une entrée avant de la jeter. L’invalidation la plus simple : personne ne fait rien, c’est le temps qui s’en charge.' },
		{ term: 'Périmé (stale)', def: 'La réponse en cache ne correspond plus aux données du propriétaire. Tout cache est périmé de temps en temps ; la question, c’est combien de temps et à quel point.' },
		{ term: 'Invalidation', def: 'Retirer ou rafraîchir une entrée parce que la source a changé. Il faut quelqu’un qui sache qu’elle a changé.' },
		{ term: 'Request coalescing', def: 'Quand dix appelants font un miss en même temps, envoyer une seule requête et donner la même réponse aux dix.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['client["kubectl ou un pod"] -->|"Bearer token"| api["kube-apiserver"]', 'api --> tc[("Cache de tokens : HMAC du token vers l’utilisateur")]', 'api -->|"seulement sur un miss"| hook["Webhook de tokens"]', 'class hook ext'],
				highlight: ['client', 'api', 'tc', 'hook'],
				note: 'Kubernetes peut demander à un **webhook** externe si un token est valide. L’API server garde chaque réponse **dans sa propre mémoire**, indexée par un hash à clé du token. Un hit ne coûte rien.'
			},
			{
				add: ['many["Dix requêtes, même token"] -->|"toutes en miss en même temps"| api'],
				highlight: ['many'],
				note: '**Coalescing.** Les dix miss partagent un seul appel au webhook, grâce au `singleflight` de Go. Sans ça, un cache froid envoie une rafale d’appels identiques pile au moment où le webhook est le plus chargé.'
			},
			{
				add: ['ttl["TTL, 2 minutes par défaut"] -.->|"fait expirer les entrées"| tc'],
				highlight: ['ttl'],
				note: 'Quand un token est révoqué, **personne** n’invalide son entrée. Seul le TTL le fait : `--authentication-token-webhook-cache-ttl`, deux minutes par défaut. C’est la **fenêtre de révocation**.'
			},
			{
				add: ['owner["Appli Rails : produit enregistré"] -->|"updated_at change"| key["Clé de cache : products/233-20140225..."]', 'key -.->|"l’ancienne clé n’est plus jamais lue"| store[("Cache de fragments")]'],
				highlight: ['owner', 'key', 'store'],
				note: 'L’autre approche : **le propriétaire invalide**. Rails met le `updated_at` de l’enregistrement dans la clé de cache. Enregistrer le produit change la clé, donc la lecture suivante fait un miss et reconstruit. Personne n’a rien à supprimer.'
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
			'**La clé** est un [HMAC du token et de ses audiences](' + CACHE + '#L231-L254), avec un secret aléatoire généré au démarrage. Les tokens bruts ne sont jamais gardés : le commentaire dit que ça « keeps tokens out of memory ». Le même token pour deux audiences donne deux entrées.',
			'**Coalescing** : `a.group.DoChan(key, ...)` lance une seule recherche par clé, quel que soit le nombre de requêtes qui attendent dessus. À l’intérieur, il revérifie le cache, parce qu’un autre appelant a pu le remplir entre-temps.',
			'**Périmé quand** le token est révoqué. **Invalidé par** le temps seulement : `successTTL` pour un oui, `failureTTL` pour un non. Pour le webhook, [les deux prennent la valeur du même flag](' + K8S + '/pkg/kubeapiserver/authenticator/config.go#L416), deux minutes par défaut.',
			'**Les erreurs ne sont pas mises en cache** pour le webhook (`cacheErrs` y vaut `false`). Si le webhook est en panne, la requête suivante réessaie au lieu d’échouer pendant deux minutes. Un token rejeté, en revanche, reste mémorisé comme rejeté.',
			'**Pas de limite de taille** : le cache est [découpé en 32 parts](' + CACHE + '#L112-L119) pour répartir la contention sur les verrous, et chaque part est une map à expiration sans limite d’entrées. Le commentaire parle encore d’« a 32k entry cache », mais seul le TTL retire des entrées. Les commentaires dérivent du code : vérifie avant de faire confiance à une taille.'
		]
	},
	tradeoff: {
		gain: [
			'Latence : un hit, c’est de la mémoire locale au lieu d’un appel réseau.',
			'Charge : le fournisseur d’identité ou la base voit une requête par TTL au lieu d’une par action utilisateur.',
			'Un peu d’abri face à une dépendance lente : les hits continuent de marcher pendant qu’elle est brièvement lente.'
		],
		cost: [
			'Des réponses périmées. Pour les tokens, ça veut dire qu’un utilisateur révoqué garde l’accès pendant jusqu’à un TTL.',
			'De la mémoire, et une limite de taille à choisir. Plusieurs copies, une par processus serveur, qui peuvent ne pas être d’accord entre elles.',
			'Du code d’invalidation difficile à tester. Un TTL est simple mais aveugle ; des clés ou des événements pilotés par le propriétaire sont précis mais demandent que le propriétaire participe.'
		]
	},
	task: {
		prompt: 'Pour chacun de ces trois caches, écris quatre choses : la clé, ce qui rend une entrée périmée, qui l’invalide, et le pire cas pendant qu’elle est périmée. (a) Le cache de tokens webhook de kube-apiserver. (b) Une gateway qui met en cache les clés publiques du fournisseur d’identité (JWKS) pendant 5 minutes. (c) Un cache de fragments Rails avec une clé `cache_key_with_version`.',
		hint: 'Pour « qui invalide », la réponse honnête est souvent « personne, c’est le TTL ». C’est permis. Demande-toi alors combien dure le TTL.',
		answer: [
			'(a) Clé : HMAC du token et des audiences. Périmé : token révoqué. Invalidé par : le TTL, 2 minutes par défaut. Pire cas : un token révoqué continue de marcher jusqu’à 2 minutes, pour chaque API server.',
			'(b) Clé : l’URL du JWKS. Périmé : le fournisseur fait une rotation de ses clés. Invalidé par : le TTL. Pire cas : les tokens signés avec la nouvelle clé sont rejetés pendant jusqu’à 5 minutes. Une correction courante : refaire un fetch une fois quand un token cite un id de clé (`kid`) absent du jeu en cache.',
			'(c) Clé : classe, id et `updated_at`. Périmé : jamais pour cet enregistrement, puisqu’un changement crée une nouvelle clé. Invalidé par : le propriétaire, en enregistrant. Pire cas : un fragment englobant qui l’embarque reste périmé, sauf si l’enfant utilise `touch: true`.',
			'Si tu as trouvé un cache pour lequel tu n’as pas su répondre à « qui invalide », c’est celui-là qu’il faut regarder en premier.'
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
			why: 'Rien ne prévient le serveur de la révocation. Seul le temps invalide ses entrées, donc la fenêtre de révocation, c’est le TTL. C’est le prix à payer pour ne pas interroger le fournisseur d’identité à chaque fois.'
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
			why: 'C’est du request coalescing. Les 32 parts, c’est le cache découpé, une autre chose. Un token est quand même revérifié après chaque TTL.'
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
			why: 'La clé contient la version. L’ancienne entrée n’est plus jamais lue et finit simplement par expirer. C’est l’écriture du propriétaire lui-même qui a fait l’invalidation.'
		}
	],
	takeaway: 'Avant d’ajouter un cache, écris ce qui rend une entrée périmée et qui l’invalide. Si la réponse est « personne », le TTL est ta fenêtre de risque.',
	sources: [
		{ title: 'Martin Fowler, TwoHardThings', url: 'https://martinfowler.com/bliki/TwoHardThings.html' },
		{ title: 'RFC 9111, HTTP Caching', url: 'https://datatracker.ietf.org/doc/html/rfc9111' },
		{ title: 'Kubernetes docs, Webhook token authentication', url: 'https://kubernetes.io/docs/reference/access-authn-authz/authentication/' },
		{ title: 'Rails Guides, Caching with Rails', url: 'https://guides.rubyonrails.org/caching_with_rails.html' },
		{ title: 'Kubernetes, cached_token_authenticator.go', url: `${CACHE}#L144-L216` }
	]
};
