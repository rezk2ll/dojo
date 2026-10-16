const REPO = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'request-flow',
	part: 'Voir le système',
	title: 'Suivre une requête de bout en bout',
	minutes: 10,
	hook: [
		'Un utilisateur te dit : « publier un post bloque parfois plusieurs secondes, mais seulement quand je mentionne quelqu’un. » Le diagramme de conteneurs d’hier montre les boîtes. Il ne montre pas **quelles boîtes un clic touche**, ni dans quel ordre.',
		'Pour ça, C4 propose le diagramme dynamique : tu choisis un vrai cas d’usage et tu numérotes les étapes à mesure qu’il traverse les conteneurs. Ici, tu suis le cas « publier un post » dans le code de Mastodon.',
		'À chaque saut, la requête peut échouer ou attendre. Si tu listes les sauts dans l’ordre, tu sais où chercher les secondes perdues.'
	],
	terms: [
		{ term: 'Diagramme dynamique', def: 'Une vue C4 d’un cas d’usage à l’exécution : les mêmes boîtes que les diagrammes statiques, avec des étapes numérotées.' },
		{ term: 'Saut', def: 'Une étape où la requête passe dans une autre partie : une autre couche de code, ou un autre conteneur à travers le réseau, plus lent et qui peut tomber.' },
		{ term: 'Hot path (chemin critique)', def: 'Le code que chaque requête exécute avant de pouvoir répondre. Un appel lent à cet endroit fait attendre l’utilisateur.' },
		{ term: 'Fan-out', def: 'Un événement qui déclenche plein de jobs : un post copié dans le fil de chaque abonné, et envoyé au serveur de chaque abonné.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: [
					'app(["Appli web ou mobile"]) -->|"1. POST /api/v1/statuses"| api["web : StatusesController"]',
					'api -->|"2. vérifie le token OAuth"| pg[("PostgreSQL")]'
				],
				highlight: ['app', 'api', 'pg'],
				note: 'Avant que le moindre code de publication tourne, le contrôleur exige un token avec le scope `write` ou [`write:statuses`](' + REPO + '/app/controllers/api/v1/statuses_controller.rb#L8). Les tokens sont stockés dans PostgreSQL, dans `oauth_access_tokens`. Sans token valide, la requête s’arrête là.'
			},
			{
				add: [
					'api --> svc["3. PostStatusService"]',
					'svc -->|"4. mention distante inconnue ? on la cherche"| fedi["Autres serveurs du fédivers"]',
					'class fedi ext'
				],
				highlight: ['svc', 'fedi'],
				note: 'Le [service](' + REPO + '/app/services/post_status_service.rb#L94-L110) commence par chercher les mentions dans le texte. Pour un compte distant qu’il ne connaît pas encore, il envoie **tout de suite** une requête WebFinger à cet autre serveur. La requête de l’utilisateur attend alors un serveur que tu ne fais pas tourner.'
			},
			{
				add: ['svc -->|"5. enregistre le post, dans une transaction"| pg'],
				highlight: ['svc', 'pg'],
				note: 'Ensuite, `@status.save!` tourne dans `ApplicationRecord.transaction`, et le post **existe** dans PostgreSQL. Les étapes suivantes décident qui le voit.'
			},
			{
				add: [
					'svc -->|"6. met des jobs en file"| redis[("Redis")]',
					'api -->|"7. 200, le post en JSON"| app'
				],
				highlight: ['redis'],
				note: '[`postprocess_status!`](' + REPO + '/app/services/post_status_service.rb#L172-L181) traite les hashtags directement, puis **met en file** le reste : `DistributionWorker`, `ActivityPub::DistributionWorker`, une récupération d’aperçu de lien. La réponse repart sans attendre aucun d’eux.'
			},
			{
				add: [
					'sk["sidekiq : jobs de fan-out"] -->|"8. prend les jobs, remplit les fils d’accueil"| redis',
					'redis -->|"9. pub/sub"| stream["streaming"]',
					'sk -->|"10. une livraison par inbox"| fedi'
				],
				highlight: ['sk', 'stream'],
				note: 'Sidekiq exécute le **fan-out**. Un job par abonné écrit le post dans son fil d’accueil dans Redis, et un message sur un canal Redis demande au serveur de streaming de le pousser vers les applis ouvertes. Un autre job envoie le post à chaque inbox distante, [retenté pendant des jours](' + REPO + '/app/workers/activitypub/delivery_worker.rb#L11-L21) si un serveur est en panne.'
			}
		]
	},
	example: {
		title: 'app/services/process_mentions_service.rb, un saut qui peut cacher des secondes',
		repo: 'mastodon/mastodon',
		url: `${REPO}/app/services/process_mentions_service.rb#L25-L48`,
		lang: 'ruby',
		code: `  def scan_text!
    @status.text = @status.text.gsub(Account::MENTION_RE) do |match|
      username, domain = Regexp.last_match(1).split('@')

      domain = if TagManager.instance.local_domain?(domain)
                 nil
               else
                 TagManager.instance.normalize_domain(domain)
               end

      mentioned_account = Account.find_remote(username, domain)

      # Unapproved and unconfirmed accounts should not be mentionable
      next match if mentioned_account&.local? && !(mentioned_account.user_confirmed? && mentioned_account.user_approved?)

      # If the account cannot be found or isn't the right protocol,
      # first try to resolve it
      if mention_undeliverable?(mentioned_account)
        begin
          mentioned_account = ResolveAccountService.new.call(Regexp.last_match(1))
        rescue Webfinger::Error, *Mastodon::HTTP_CONNECTION_ERRORS, Mastodon::UnexpectedResponseError
          mentioned_account = nil
        end
      end`,
		notes: [
			'La ligne 20 correspond à l’étape 4. [`ResolveAccountService`](' + REPO + '/app/services/resolve_account_service.rb#L91-L105) lance une requête WebFinger sur l’autre serveur, puis récupère le compte. Ce sont **des appels réseau vers la machine de quelqu’un d’autre**, une fois par mention inconnue, avant même l’enregistrement du post.',
			'Le client HTTP de Mastodon fixe [`TIMEOUT = { connect_timeout: 5, read_timeout: 10, write_timeout: 10, read_deadline: 30 }`](' + REPO + '/app/lib/request.rb#L86). Un serveur lent ajoute des secondes à la requête. Un serveur qui ne répond jamais coûte au moins le timeout de connexion de 5 secondes, et le commentaire au-dessus de cette ligne estime le pire cas pour ouvrir une connexion à environ 15 secondes.',
			'Les lignes 21 et 22 rattrapent les erreurs de connexion et les mauvaises réponses, et mettent `mentioned_account = nil`. Le post est quand même publié, et la mention reste en **texte brut**. L’utilisateur ne voit aucune erreur, seulement l’attente.',
			'Tu ne trouves ça qu’en lisant le chemin saut par saut. Un dashboard afficherait « POST /api/v1/statuses p99 = 6 s » et rien de plus. Pour corriger, il faut d’abord savoir que l’étape 4 existe.'
		]
	},
	tradeoff: {
		gain: [
			'En enregistrant le post pendant la requête, tu donnes à l’utilisateur une réponse nette : 200 veut dire que le post existe.',
			'Le fan-out part en file, donc il n’ajoute rien au temps de réponse. Sidekiq absorbe le coût d’une grosse liste d’abonnés, et le clic revient aussi vite que pour une petite.',
			'Chaque saut (contrôleur, service, base, file) est un appel séparé : tu peux mettre un chrono autour de chacun.'
		],
		cost: [
			'La requête échoue dès qu’**un** de ses sauts synchrones est en panne : PostgreSQL ou Redis. Un serveur distant cité dans une mention ne peut pas la faire échouer (l’erreur est rattrapée), mais il peut la faire attendre.',
			'Les attentes s’additionnent, et un saut échappe à ton contrôle : un serveur distant lent fait attendre ton utilisateur.',
			'L’utilisateur ne reçoit aucune réponse sur la partie asynchrone. Si les livraisons s’entassent dans une file, le 200 qu’il a reçu ne lui en dit rien.'
		]
	},
	task: {
		prompt: 'À l’aide du diagramme, dis quelle étape explique chaque signalement : (a) « 401 quand je publie », (b) « mon post a mis 6 secondes », (c) « mon post est sur mon profil mais mes abonnés sur un autre serveur ne l’ont jamais vu », (d) « le post affiche ma mention en texte brut ».',
		hint: 'Parcours les étapes dans l’ordre et demande-toi à chacune : « qu’est-ce qui peut mal tourner ici, et est-ce que l’utilisateur s’en rend compte ? »',
		answer: [
			'(a) Étape 2 : le token est absent, révoqué ou invalide.',
			'(b) Vérifie chaque saut synchrone. Le premier suspect est l’étape 4 : une mention d’un compte distant inconnu, résolue par le réseau avant l’enregistrement.',
			'(c) Étape 10 : le job de livraison est en file ou en retry, ou Sidekiq ne tourne pas. La requête (étapes 1 à 7) a réussi, donc elle ne peut rien te dire.',
			'(d) Encore l’étape 4 : la résolution du compte a échoué, l’erreur a été rattrapée, et la mention est restée du texte.'
		]
	},
	quiz: [
		{
			q: 'Dans un **diagramme dynamique** C4, que montrent les numéros sur les flèches ?',
			options: [
				'Combien d’instances de chaque conteneur tournent',
				'L’ordre des interactions pour un cas d’usage',
				'La priorité de chaque conteneur',
				'La version de chaque API'
			],
			answer: 1,
			why: 'Un diagramme dynamique montre comment les éléments des diagrammes statiques collaborent à l’exécution pour une fonctionnalité ou un cas d’usage, et chaque numéro donne la place d’une interaction dans cette suite.'
		},
		{
			q: 'Quand Mastodon publie un post, lequel de ces traitements se fait **pendant** la requête HTTP de l’utilisateur ?',
			options: [
				'Écrire le post dans le fil d’accueil de chaque abonné',
				'Envoyer le post à l’inbox de chaque abonné distant',
				'Résoudre un compte distant mentionné qu’il ne connaît pas encore',
				'Récupérer la carte d’aperçu d’un lien du post'
			],
			answer: 2,
			why: 'La résolution des mentions tourne dans `ProcessMentionsService`, avant l’enregistrement du post. Le fan-out vers les fils, les livraisons et la récupération du lien sont tous mis en file dans `postprocess_status!` et tournent plus tard dans Sidekiq.'
		},
		{
			q: 'La résolution d’un compte distant mentionné échoue avec une erreur de connexion. Que fait Mastodon du post ?',
			options: [
				'Il publie le post, avec la mention laissée en texte brut',
				'Il répond 502 au client et n’enregistre pas le post',
				'Il retente la mention indéfiniment avant d’enregistrer',
				'Il garde le post en brouillon le temps de résoudre la mention'
			],
			answer: 0,
			why: 'Le `rescue` met `mentioned_account = nil`, et le code garde ensuite le texte original pour cette mention. L’utilisateur obtient son post, peut-être après une attente, et aucune erreur.'
		}
	],
	recall: {
		q: 'Quelle étape de « publier un post » peut faire attendre la requête de Mastodon sur un autre serveur, et que se passe-t-il si ce serveur échoue ?',
		a: 'L’étape 4 : `ProcessMentionsService` résout une mention distante inconnue par WebFinger avant d’enregistrer le post, avec un timeout de connexion de 5 secondes. Si l’appel échoue, l’erreur est rattrapée et la mention reste en texte brut.'
	},
	sources: [
		{ title: 'C4 model, Dynamic diagram', url: 'https://c4model.com/diagrams/dynamic' },
		{ title: 'mastodon, PostStatusService', url: `${REPO}/app/services/post_status_service.rb` },
		{ title: 'mastodon, ProcessMentionsService', url: `${REPO}/app/services/process_mentions_service.rb` },
		{ title: 'mastodon, FanOutOnWriteService', url: `${REPO}/app/services/fan_out_on_write_service.rb` },
		{ title: 'Mastodon docs, Scaling up your server (Sidekiq queues)', url: 'https://docs.joinmastodon.org/admin/scaling/' }
	]
};
