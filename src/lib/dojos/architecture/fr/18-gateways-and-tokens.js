const MASTODON = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'gateways-and-tokens',
	part: 'Entre les services',
	title: 'Gateways, tokens et SSO',
	minutes: 10,
	hook: [
		'Tu as cinq services, et chacun doit savoir qui l’appelle. Imagine que chacun construise sa propre page de connexion et stocke ses propres mots de passe. Tu obtiens cinq écrans de connexion, cinq stockages de mots de passe qui peuvent fuiter, et cinq implémentations où te tromper.',
		'À la place, un seul système, le SSO, vérifie le mot de passe et donne un token à l’appelant. Chaque service vérifie ensuite ce token pour savoir qui appelle, et cette vérification s’appelle l’**authentification**.',
		'Décider si cet appelant a le droit de faire cette action sur ces données, ça s’appelle l’autorisation. Le chapitre d’hier l’a placée chez le propriétaire des données. Une gateway, le service par lequel passe chaque requête, peut vérifier le token. Elle ne peut pas savoir si Alice a le droit de voir tel post privé.'
	],
	terms: [
		{ term: 'Authentification', def: 'Vérifier qui est l’appelant : un mot de passe une fois, puis un token à chaque requête.' },
		{ term: 'Autorisation', def: 'Décider ce que cet appelant peut faire sur ces données. Il faut les règles des données, donc c’est le propriétaire des données qui le fait.' },
		{ term: 'SSO / fournisseur d’identité', def: 'Une seule connexion pour plusieurs applis. Il émet des tokens auxquels les autres services font confiance. Keycloak est un fournisseur d’identité open source très utilisé.' },
		{ term: 'Token', def: 'Une preuve signée que l’appelant envoie à chaque requête. Un JWT porte ses propres claims, comme qui l’a émis, pour quelle audience, et jusqu’à quand.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['user(["Utilisateur"]) -->|"se connecte une fois"| sso["Keycloak : SSO"]', 'sso -->|"token OIDC"| app["Appli cliente"]', 'class sso ext'],
				highlight: ['user', 'sso', 'app'],
				note: 'Le SSO est le **seul endroit qui voit le mot de passe**. Il parle OpenID Connect et remet à l’appli un token signé à la place du mot de passe.'
			},
			{
				add: ['app -->|"Bearer token"| gw["Gateway : Envoy jwt_authn"]', 'gw -.->|"clés publiques, en cache"| sso'],
				highlight: ['gw'],
				note: 'La gateway fait l’authentification. Le filtre JWT d’Envoy vérifie la signature avec les clés publiées par le fournisseur (JWKS), puis l’émetteur, l’audience et l’expiration. Si une vérification échoue, la requête s’arrête à la gateway.'
			},
			{
				add: ['gw -->|"identité vérifiée"| svc["Service posts"]'],
				highlight: ['svc'],
				note: 'Le service reçoit une requête dont il sait qu’elle vient d’Alice. La doc d’Envoy dit que le payload « can be forwarded to the upstream for **further authorization** if desired ». Le service doit encore décider ce qu’Alice a le droit de faire.'
			},
			{
				add: ['svc --> pol["Policy : Alice peut-elle voir ce post ?"]', 'pol --> db[("Posts, abonnements, blocages")]'],
				highlight: ['pol', 'db'],
				note: 'Le propriétaire des données fait l’autorisation. Le post est-il public, privé ou direct ? Alice suit-elle l’auteur ? L’auteur l’a-t-il bloquée ? **Seul le service qui détient les posts et les abonnements peut répondre.**'
			}
		]
	},
	example: {
		title: 'app/policies/status_policy.rb : le propriétaire décide qui voit un post',
		repo: 'mastodon/mastodon',
		url: `${MASTODON}/app/policies/status_policy.rb#L4-L36`,
		lang: 'ruby',
		code: `  def show?
    return false if author.unavailable?

    if requires_mention?
      owned? || mention_exists?
    elsif private?
      owned? || following_author? || mention_exists?
    else
      current_account.nil? || (!author_blocking? && !author_blocking_domain?)
    end
  end
…
  def destroy?
    owned?
  end

  alias unreblog? destroy?

  def update?
    owned?
  end`,
		notes: [
			'L’authentification a lieu avant ce fichier, dans le [contrôleur](' + MASTODON + '/app/controllers/api/v1/statuses_controller.rb#L7-L8) : `doorkeeper_authorize! :write, :\'write:statuses\'` vérifie le token OAuth et son **scope**. Le scope dit que cette appli peut écrire des posts, mais pas lesquels.',
			'Les lignes 1 à 11 font l’autorisation. `show?` lit la visibilité du post, ses mentions, les abonnements et les blocages, des données que Mastodon stocke. Une gateway placée devant n’a aucune de ces données.',
			'Quand `show?` renvoie false, [`set_status`](' + MASTODON + '/app/controllers/api/v1/statuses_controller.rb#L99-L104) répond **not found**, exactement comme pour un post qui n’existe pas. Un inconnu ne peut même pas apprendre que le post privé existe.',
			'La vérification des tokens demande aussi de l’attention. La doc d’Envoy sur `audiences` : « If not specified, the audiences in JWT will not be checked. » Si tu l’oublies, un token que ton SSO a émis pour un service est accepté par un autre.'
		]
	},
	tradeoff: {
		gain: [
			'Les utilisateurs ont une seule connexion et un seul stockage de mots de passe, et tu ajoutes le MFA à un seul endroit.',
			'Les vérifications transverses (CORS, rate limits, signature et expiration du token) sont écrites et testées une seule fois, dans la gateway.',
			'Les services derrière font confiance à une identité vérifiée, et leur code ne vérifie que leurs propres règles, comme `StatusPolicy`.'
		],
		cost: [
			'Le SSO et la gateway sont sur le chemin de chaque requête, donc quand ils tombent, plus aucun service ne répond.',
			'Chaque requête fait un saut de plus, et un appel au fournisseur d’identité, sauf si ses clés ou ses réponses sont en cache (le chapitre de demain).',
			'Si tu recopies des règles d’autorisation dans la gateway, elles s’éloignent des données qu’elles protègent.'
		]
	},
	task: {
		prompt: 'Range ces cinq vérifications dans « gateway » ou « propriétaire des données » : (1) rate limit par IP, (2) preflight CORS, (3) ce token est-il signé par notre SSO et non expiré, (4) Alice peut-elle modifier cette facture, (5) ce token est-il destiné à l’API de facturation (son audience). Puis réponds : la gateway n’arrive pas à joindre le fournisseur d’identité pour vérifier un token. Doit-elle répondre 401 ou 503 ?',
		hint: 'Pour chaque vérification, demande-toi : faut-il lire les données pour décider ? Si oui, seul le propriétaire peut y répondre.',
		answer: [
			'Gateway : 1, 2, 3 et 5. Aucune n’a besoin de savoir quoi que ce soit sur la facture.',
			'Propriétaire des données : 4. Seul le service de facturation sait qui a créé la facture, si elle est déjà envoyée, et quel est le rôle d’Alice dans cette entreprise.',
			'503. La gateway ne sait pas si le token est mauvais, donc elle ne doit pas dire « unauthorized ». 401 veut dire « tes identifiants ne sont pas valides », et un client peut réagir en déconnectant l’utilisateur. 503 dit « réessaie plus tard ».',
			'Bonus : le propriétaire peut refaire 3 et 5 pour pas cher. Ça le protège si quelqu’un l’atteint sans passer par la gateway.'
		],
		steps: [
			{
				title: 'Choisis le critère',
				questions: [
					{ q: 'Quelle question range chaque vérification dans « gateway » ou « propriétaire des données » ?', options: ['La vérification est-elle rapide ?', 'Tourne-t-elle avant la connexion de l’utilisateur ?', 'Faut-il lire les données pour décider ?', 'Est-elle écrite dans le même langage que le service ?'], answer: 2, why: 'Si la vérification a besoin des données, seul le service qui les détient peut y répondre.' },
					{ q: 'Qu’est-ce que l’authentification ?', options: ['Décider ce qu’Alice peut faire sur cette facture', 'Vérifier qui est l’appelant', 'Limiter les requêtes par IP', 'Cacher un post privé aux inconnus'], answer: 1, why: 'Un mot de passe une fois, puis un token à chaque requête. Elle dit qui, pas ce qu’on a le droit de faire.' },
					{ q: 'Qu’est-ce que l’autorisation ?', options: ['Vérifier la signature d’un token', 'Se connecter une fois pour plusieurs applis', 'Répondre à un preflight CORS', 'Décider ce que cet appelant peut faire sur ces données'], answer: 3, why: 'Elle a besoin des règles des données, donc c’est le propriétaire des données qui la fait.' },
					{ q: 'Pourquoi une gateway ne peut-elle pas décider « Alice peut-elle voir ce post » ?', options: ['Elle n’a aucune des données dont la règle a besoin', 'Elle ne sait pas lire les tokens', 'Elle passe après le service', 'Elle n’a pas le droit de renvoyer 404'], answer: 0, why: 'La visibilité, les abonnements et les blocages vivent dans le service des posts. Une gateway placée devant n’a rien de tout ça.' }
				]
			},
			{
				title: 'Range les vérifications de la gateway',
				questions: [
					{ q: '(1) Un rate limit par IP. Où va-t-il ?', options: ['Gateway : il n’a besoin d’aucune donnée de facture', 'Propriétaire des données : il connaît les factures', 'Le SSO, au moment de la connexion', 'L’appli du navigateur, avant l’envoi'], answer: 0, why: 'Une vérification transverse, écrite et testée une seule fois, dans la gateway.' },
					{ q: '(2) Un preflight CORS. Où va-t-il ?', options: ['Le propriétaire des données, puisqu’il sert la facture', 'La gateway, une fois pour tous les services', 'Le SSO, avec le token', 'Chaque service, à sa façon'], answer: 1, why: 'Ça concerne la requête, pas la facture. Un seul endroit s’en charge pour tous les services.' },
					{ q: '(3) Ce token est-il signé par notre SSO et non expiré ?', options: ['Seul le propriétaire des données peut le vérifier', 'Le SSO le vérifie à chaque requête', 'La gateway, avec les clés publiées par le SSO', 'L’appli du navigateur, avant l’envoi'], answer: 2, why: 'Le filtre JWT d’Envoy vérifie la signature avec le JWKS, puis l’émetteur et l’expiration.' },
					{ q: '(5) Ce token est-il destiné à l’API de facturation ?', options: ['Propriétaire des données : il lui faut la facture pour le dire', 'Personne : Envoy vérifie les audiences par défaut', 'Le SSO, quand l’utilisateur se connecte', 'Gateway : règle `audiences`, car Envoy saute la vérification sans ça'], answer: 3, why: '« If not specified, the audiences in JWT will not be checked. » Un token destiné à un autre service passerait.' }
				]
			},
			{
				title: 'Confie le reste au propriétaire',
				questions: [
					{ q: '(4) Alice peut-elle modifier cette facture ?', options: ['La gateway, avec une copie de la règle', 'Le SSO, puisqu’il connaît Alice', 'Le service de facturation, propriétaire de la facture', 'L’appli du navigateur, avant l’envoi'], answer: 2, why: 'La règle a besoin des données de la facture, donc c’est le service qui les détient qui décide.' },
					{ q: 'Que sait le service de facturation que la gateway ignore ?', options: ['L’adresse IP d’Alice', 'Qui a créé la facture, si elle est déjà envoyée, et le rôle d’Alice', 'La signature du token', 'Les règles CORS'], answer: 1, why: 'Ce sont des faits sur la facture et l’entreprise. Ils vivent chez le propriétaire.' },
					{ q: 'Tu recopies aussi la règle de modification dans la gateway. Que se passe-t-il avec le temps ?', options: ['Elle s’éloigne des données qu’elle protège', 'Elle rend le service plus rapide', 'Le SSO la reprend à son compte', 'Rien, tant que les deux tournent'], answer: 0, why: 'Quand le propriétaire change sa règle, la copie dans la gateway n’est plus à jour.' },
					{ q: 'Dans Mastodon, que dit `doorkeeper_authorize! :write` au contrôleur ?', options: ['Qu’Alice possède le post', 'Que le post est public', 'Qu’Alice suit l’auteur', 'Que cette appli peut écrire des posts, mais pas lesquels'], answer: 3, why: 'Le scope fait partie de l’authentification. `StatusPolicy` décide encore pour chaque post.' }
				]
			},
			{
				title: 'Réponds à la panne',
				questions: [
					{ q: 'La gateway n’arrive pas à joindre le fournisseur d’identité. Que sait-elle du token ?', options: ['Qu’il est mauvais', 'Qu’il est bon', 'Rien : elle ne peut pas dire si le token est valide', 'Qu’il a expiré'], answer: 2, why: 'Pas de réponse du fournisseur, ce n’est pas un « non ». Le token est peut-être bon.' },
					{ q: 'Quel statut la gateway renvoie-t-elle ?', options: ['401', '403', '404', '503'], answer: 3, why: '503 dit « réessaie plus tard », et c’est la vérité ici.' },
					{ q: 'Pourquoi pas 401 ?', options: ['401 dit que les identifiants ne sont pas valides, et un client peut déconnecter l’utilisateur', '401 ne sert qu’aux mauvais mots de passe', '401 ne peut pas porter de corps', 'Les navigateurs gardent un 401 en cache pour toujours'], answer: 0, why: 'La gateway ne sait pas que le token est mauvais, donc elle ne doit pas dire « unauthorized ».' },
					{ q: 'Pourquoi le propriétaire devrait-il refaire aussi les vérifications 3 et 5 ?', options: ['Parce que la gateway ne les fait jamais', 'Pour se protéger si quelqu’un l’atteint sans passer par la gateway', 'Pour ralentir chaque requête exprès', 'Parce que le SSO exige deux vérifications'], answer: 1, why: 'Elles coûtent peu à refaire, et elles couvrent un chemin qui contourne la gateway.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Où faut-il décider « Alice peut-elle modifier cette facture partagée ? » ?',
			options: [
				'Dans le service qui possède la facture et ses règles de partage',
				'Dans la gateway, pour que la règle soit écrite une fois et s’applique à tous les services derrière',
				'Dans le SSO, parce qu’il sait qui est Alice',
				'Dans l’appli navigateur, avant l’envoi de la requête'
			],
			answer: 0,
			why: 'La gateway ou le SSO peuvent dire qui est Alice. La règle de modification a besoin des données de la facture, donc c’est le service de facturation qui décide. Une copie de cette règle dans une gateway n’est plus à jour dès que le service la change.'
		},
		{
			q: 'Une appli Mastodon a un token avec le scope `read:statuses`. Elle demande un post privé d’une personne que l’utilisateur ne suit pas. Que se passe-t-il ?',
			options: [
				'Le post est renvoyé, parce que le scope autorise la lecture des statuts',
				'401, parce que le token n’est pas valide pour les posts privés',
				'Not found : le scope passe, mais la policy du post dit non',
				'403, avec un message qui dit que le post est privé'
			],
			answer: 2,
			why: 'Le token et son scope passent la vérification du contrôleur. `StatusPolicy#show?` vérifie ensuite la visibilité et les abonnements, et renvoie false. Mastodon répond not found, donc l’existence du post n’est pas révélée.'
		},
		{
			q: 'Le filtre JWT d’Envoy est configuré sans `audiences`. Qu’accepte-t-il ?',
			options: [
				'Aucun token, le filtre rejette toutes les requêtes tant que les audiences ne sont pas définies',
				'Seulement les tokens sans claim `aud`, puisqu’il n’y a aucune audience à laquelle les comparer',
				'Seulement les tokens dont l’audience est le nom de la gateway elle-même, qu’Envoy remplit seul',
				'N’importe quel token avec une signature et un émetteur valides, quel que soit le service visé'
			],
			answer: 3,
			why: 'La doc dit : « If not specified, the audiences in JWT will not be checked. » Un token émis pour un autre service par le même SSO passe alors, donc renseigne `audiences`.'
		}
	],
	recall: {
		q: 'Chez Mastodon, quel code vérifie le token, et quel code décide si Alice peut voir un post privé ?',
		a: 'Le `doorkeeper_authorize!` du contrôleur vérifie le token OAuth et son scope. `StatusPolicy#show?` décide, à partir de la visibilité du post, des mentions, des abonnements et des blocages.'
	},
	sources: [
		{ title: 'Chris Richardson, API gateway pattern', url: 'https://microservices.io/patterns/apigateway.html' },
		{ title: 'OpenID Connect Core 1.0', url: 'https://openid.net/specs/openid-connect-core-1_0.html' },
		{ title: 'RFC 7519, JSON Web Token (JWT)', url: 'https://datatracker.ietf.org/doc/html/rfc7519' },
		{ title: 'Envoy docs, JWT Authentication filter', url: 'https://www.envoyproxy.io/docs/envoy/latest/configuration/http/http_filters/jwt_authn_filter' },
		{ title: 'Kubernetes docs, Controlling access to the Kubernetes API (authentication, then authorization)', url: 'https://kubernetes.io/docs/concepts/security/controlling-access/' }
	]
};
