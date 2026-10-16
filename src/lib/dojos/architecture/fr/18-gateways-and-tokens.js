const MASTODON = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'gateways-and-tokens',
	part: 'Entre les services',
	title: 'Gateways, tokens et SSO',
	minutes: 10,
	hook: [
		'Tu as cinq services. Chacun doit savoir qui l’appelle. Imagine que chacun construise sa propre page de connexion et stocke ses propres mots de passe. Tu obtiens cinq écrans de connexion, cinq fuites de mots de passe possibles, et cinq façons de te tromper.',
		'Alors tu découpes le travail. **Un seul système prouve qui tu es** (le SSO), et te donne un token. Chaque service vérifie le token. C’est l’**authentification** : qui appelle.',
		'Puis vient une deuxième question : **cet appelant a-t-il le droit de faire ça, sur ces données ?** C’est l’**autorisation**, et le chapitre d’hier t’a dit où elle se place : chez le propriétaire des données. Une gateway peut vérifier le token à l’entrée. Elle ne peut pas savoir si Alice a le droit de voir ce post privé-là.'
	],
	terms: [
		{ term: 'Authentification', def: 'Prouver qui est l’appelant. On y répond en vérifiant un mot de passe une fois, puis un token à chaque requête.' },
		{ term: 'Autorisation', def: 'Décider ce que cet appelant peut faire sur ces données. Il faut les règles des données, donc elle vit chez le propriétaire.' },
		{ term: 'SSO / fournisseur d’identité', def: 'Une seule connexion pour plusieurs applis. Il émet des tokens auxquels les autres services font confiance. Keycloak est un fournisseur open source bien connu.' },
		{ term: 'Token', def: 'Une preuve signée que l’appelant envoie à chaque requête. Un JWT porte ses propres claims, comme qui l’a émis, pour quelle audience, et jusqu’à quand.' },
		{ term: 'Gateway', def: 'Un service par lequel passe chaque requête, pour que les vérifications transverses (rate limits, vérification de token, CORS) soient écrites une seule fois.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['user(["Utilisateur"]) -->|"se connecte une fois"| sso["Keycloak : SSO"]', 'sso -->|"token OIDC"| app["Appli cliente"]', 'class sso ext'],
				highlight: ['user', 'sso', 'app'],
				note: 'Le SSO est le **seul endroit qui voit le mot de passe**. Il parle OpenID Connect et remet à l’appli un token signé, pas le mot de passe.'
			},
			{
				add: ['app -->|"Bearer token"| gw["Gateway : Envoy jwt_authn"]', 'gw -.->|"clés publiques, en cache"| sso'],
				highlight: ['gw'],
				note: 'La gateway **authentifie**. Le filtre JWT d’Envoy vérifie la signature avec les clés publiées par le fournisseur (JWKS), l’émetteur, l’audience et l’expiration. Token invalide : la requête s’arrête là.'
			},
			{
				add: ['gw -->|"identité vérifiée"| svc["Service posts"]'],
				highlight: ['svc'],
				note: 'Le service reçoit une requête dont il sait qu’elle vient d’Alice. La doc d’Envoy : le payload « can be forwarded to the upstream for **further authorization** if desired ». La gateway ne termine pas le travail.'
			},
			{
				add: ['svc --> pol["Policy : Alice peut-elle voir ce post ?"]', 'pol --> db[("Posts, abonnements, blocages")]'],
				highlight: ['pol', 'db'],
				note: 'C’est le propriétaire des données qui fait l’**autorisation**. Le post est-il public, privé ou direct ? Alice suit-elle l’auteur ? L’auteur l’a-t-il bloquée ? Seul le service qui détient les posts et les abonnements peut répondre.'
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
			'L’**authentification** vient en premier, dans le [contrôleur](' + MASTODON + '/app/controllers/api/v1/statuses_controller.rb#L7-L8) : `doorkeeper_authorize! :write, :\'write:statuses\'` vérifie le token OAuth et son **scope**. Un scope est grossier : il dit que cette appli peut écrire des posts, pas lesquels.',
			'L’**autorisation**, c’est cette policy. Elle lit la visibilité du post, ses mentions, les abonnements et les blocages. Ce sont toutes des données que Mastodon possède. Aucune gateway placée devant ne pourrait trancher.',
			'Quand `show?` dit non, [`set_status`](' + MASTODON + '/app/controllers/api/v1/statuses_controller.rb#L99-L104) répond **not found**, exactement comme pour un post qui n’existe pas. Un inconnu ne peut même pas apprendre qu’un post privé est là.',
			'La vérification des tokens a ses propres pièges. La doc d’Envoy sur `audiences` : « If not specified, the audiences in JWT will not be checked. » Oublie-le, et un token que ton SSO a émis pour un service est accepté par un autre.'
		]
	},
	tradeoff: {
		gain: [
			'Une seule connexion, un seul stockage de mots de passe, un seul endroit où ajouter le MFA.',
			'Les vérifications transverses (CORS, rate limits, signature et expiration du token) sont écrites et testées une seule fois, dans la gateway.',
			'Les services derrière restent petits : ils font confiance à une identité vérifiée et se concentrent sur leurs propres règles.'
		],
		cost: [
			'Le SSO et la gateway sont sur le chemin de chaque requête. S’ils tombent, tout tombe.',
			'Un saut de plus, et un appel au fournisseur d’identité, sauf si ses clés ou ses réponses sont en cache (le sujet de demain).',
			'La tentation de pousser l’autorisation dans la gateway. Ses règles s’éloignent alors des données qu’elles protègent.'
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
			why: 'L’authentification dit qui est Alice, et la gateway ou le SSO savent le faire. L’autorisation a besoin des règles des données, donc elle revient au propriétaire des données. Une copie de ces règles dans une gateway finit par dériver.'
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
			why: 'Le scope, c’est l’authentification plus une permission grossière. `StatusPolicy#show?` vérifie ensuite la visibilité et les abonnements. Mastodon répond not found, donc l’existence du post n’est pas révélée.'
		},
		{
			q: 'Le filtre JWT d’Envoy est configuré sans `audiences`. Qu’accepte-t-il ?',
			options: [
				'Aucun token, tant que les audiences ne sont pas définies',
				'Seulement les tokens sans claim `aud`',
				'Seulement les tokens dont l’audience est le nom de la gateway elle-même',
				'N’importe quel token avec une signature et un émetteur valides, quel que soit le service auquel il était destiné'
			],
			answer: 3,
			why: 'La doc dit : « If not specified, the audiences in JWT will not be checked. » Un token émis pour un autre service par le même SSO passe alors. Définis l’audience.'
		}
	],
	takeaway: 'Authentifie à l’entrée, une seule fois. Autorise là où vivent les données.',
	sources: [
		{ title: 'Chris Richardson, API gateway pattern', url: 'https://microservices.io/patterns/apigateway.html' },
		{ title: 'OpenID Connect Core 1.0', url: 'https://openid.net/specs/openid-connect-core-1_0.html' },
		{ title: 'RFC 7519, JSON Web Token (JWT)', url: 'https://datatracker.ietf.org/doc/html/rfc7519' },
		{ title: 'Envoy docs, JWT Authentication filter', url: 'https://www.envoyproxy.io/docs/envoy/latest/configuration/http/http_filters/jwt_authn_filter' },
		{ title: 'Kubernetes docs, Controlling access to the Kubernetes API (authentication, then authorization)', url: 'https://kubernetes.io/docs/concepts/security/controlling-access/' }
	]
};
