const MASTODON = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';
const RACK_ATTACK = 'https://github.com/rack/rack-attack/blob/65f1ead3bc648b1e972fd8df0078949f056699d9';
const RAILS = 'https://github.com/rails/rails/blob/c3466ea00d7121798e3aa3144ffdf7174b81d8cb';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'quality-scenarios',
	part: 'Penser en architecte',
	title: 'Les scénarios de qualité : rendre « sécurisé » testable',
	minutes: 10,
	hook: [
		'Hier, tu as choisi trois caractéristiques, par exemple la sécurité. Personne ne peut tester « le système doit être sécurisé », et personne ne peut dire quand c’est fini.',
		'Prends un serveur Mastodon. Quelqu’un récupère une liste de mots de passe qui ont fuité et les essaie l’un après l’autre sur le formulaire de connexion. L’un d’eux marchera pour un utilisateur qui l’a réutilisé sur un autre site.',
		'Un **scénario de qualité** décrit cette attaque en une phrase de six parties, et la dernière partie est un nombre que la QA peut vérifier. Mastodon fournit le mécanisme, et sa configuration contient les nombres.'
	],
	terms: [
		{ term: 'Scénario', def: 'Une phrase testable : qui fait quoi à quelle partie, dans quelle situation, ce que le système doit faire, et comment tu le mesures.' },
		{ term: 'Stimulus', def: 'L’événement qui arrive sur le système : une rafale de connexions, un crash, un pic de trafic.' },
		{ term: 'Mesure de réponse', def: 'Le nombre qui tranche entre réussi et raté, par exemple « au plus 25 tentatives par IP en 5 minutes ».' },
		{ term: 'Fail open, fail closed', def: 'Ce que fait un contrôle quand il ne peut pas s’exécuter. Fail open laisse passer la requête. Fail closed la refuse.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['source["Source : attaquant avec des mots de passe fuités"] -->|envoie| stimulus["Stimulus : 1000 connexions en 5 minutes"]'],
				highlight: ['source', 'stimulus'],
				note: 'La source et le stimulus disent qui agit et ce qu’il fait. Ici, la source est un script, et le stimulus, ce sont 1000 connexions avec des mots de passe fuités, envoyées une par une.'
			},
			{
				add: ['stimulus -->|frappe| artifact["Artefact : limites de connexion dans Rack::Attack"]'],
				highlight: ['artifact'],
				note: 'L’artefact est la partie du système qui reçoit le coup. Ici, c’est le middleware Rack::Attack, qui voit chaque `POST /auth/sign_in` avant que Rails vérifie le mot de passe.'
			},
			{
				add: ['env["Environnement : charge normale, Redis en marche"] -.->|pendant| artifact', 'class env ext'],
				highlight: ['env'],
				note: 'L’environnement, c’est l’état du système quand le stimulus arrive. Les compteurs sont dans Redis, via le cache Rails. En charge normale, pendant un déploiement ou avec Redis en panne, la même attaque peut demander une réponse différente.'
			},
			{
				add: ['artifact -->|doit| response["Réponse : 429 Too Many Requests"]'],
				highlight: ['response'],
				note: 'La réponse dit ce qui doit se passer. Les tentatives sous la limite arrivent à la vérification du mot de passe comme d’habitude. Les autres reçoivent un `429` avec un en-tête `X-RateLimit-Reset`, pour que les clients honnêtes sachent quand réessayer.'
			},
			{
				add: ['response -->|testé par| measure["Mesure : au plus 25 par IP et par fenêtre de 5 minutes atteignent la vérification du mot de passe"]'],
				highlight: ['measure'],
				note: 'La mesure dit comment tu vérifies. Mastodon autorise 25 tentatives par IP toutes les 5 minutes, comptées en fenêtres fixes : une rafale à cheval sur deux fenêtres en obtient donc 25 dans chacune. La QA peut envoyer 1000 connexions depuis une IP et compter combien atteignent la vérification dans chaque fenêtre.'
			}
		]
	},
	example: {
		title: 'config/initializers/rack_attack.rb',
		repo: 'mastodon/mastodon',
		url: `${MASTODON}/config/initializers/rack_attack.rb#L148-L172`,
		lang: 'ruby',
		code: `  throttle('throttle_login_attempts/ip', limit: 25, period: 5.minutes) do |req|
    req.throttleable_remote_ip if req.post? && req.path_matches?('/auth/sign_in')
  end

  throttle('throttle_login_attempts/email', limit: 25, period: 1.hour) do |req|
    req.session[:attempt_user_id] || req.normalized_email if req.post? && req.path_matches?('/auth/sign_in')
  end
…
  self.throttled_responder = lambda do |request|
    now        = Time.now.utc
    match_data = request.env['rack.attack.match_data']

    headers = {
      'Content-Type' => 'application/json',
      'X-RateLimit-Limit' => match_data[:limit].to_s,
      'X-RateLimit-Remaining' => '0',
      'X-RateLimit-Reset' => (now + (match_data[:period] - (now.to_i % match_data[:period]))).iso8601(6),
    }

    [429, headers, [{ error: I18n.t('errors.429') }.to_json]]
  end`,
		notes: [
			'Les lignes 1 à 3 portent la mesure sous forme de données : `limit: 25, period: 5.minutes`. Change le nombre, et le seuil de réussite du scénario change avec.',
			'Les lignes 9 à 21 sont la réponse : un `429` et trois en-têtes qui donnent la limite, les tentatives restantes et l’heure de remise à zéro de la fenêtre.',
			'Les lignes 5 à 7 ajoutent une deuxième limite pour un deuxième stimulus. Un attaquant qui répartit les essais sur un compte entre beaucoup d’IP reste sous la limite par IP ; la limite de 25 par heure et par compte l’arrête. [`throttleable_remote_ip`](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/config/initializers/rack_attack.rb#L20-L30) compte aussi tout un `/64` IPv6 comme une seule adresse : changer d’adresse dans le même réseau ne sert à rien.',
			'L’environnement apparaît dans le stockage du cache. Si Redis tombe, le cache Rails [avale l’erreur et renvoie `nil`](https://github.com/rails/rails/blob/c3466ea00d7121798e3aa3144ffdf7174b81d8cb/activesupport/lib/active_support/cache/redis_cache_store.rb#L490-L503), et Rack::Attack compte `nil` comme 1 (`Cache#do_count`, dans les sources). Chaque tentative ressemble alors à la première : la limite fait du fail open.'
		]
	},
	tradeoff: {
		gain: [
			'La QA peut tester l’objectif : envoyer 1000 connexions depuis une IP et vérifier qu’au plus 25 par fenêtre de 5 minutes atteignent la vérification du mot de passe.',
			'L’équipe discute d’un nombre, 25 ou 100 tentatives, au lieu de discuter de « assez sécurisé ».',
			'Écrire un deuxième scénario a fait apparaître un deuxième attaquant, un compte attaqué depuis beaucoup d’IP, et Mastodon a une limite pour lui.'
		],
		cost: [
			'Chaque scénario demande de la réflexion, et il montre ce que tu ne sais pas encore, par exemple ce que fait la limite quand Redis est en panne.',
			'Chaque scénario demande un test et un responsable. Commence par tes trois caractéristiques principales.',
			'Avec une limite trop basse, tout un bureau derrière une seule adresse IP se retrouve bloqué.'
		]
	},
	task: {
		prompt: 'Écris le scénario pour le même attaquant, mais **avec Redis en panne**. Puis choisis ce que la limite de connexion doit faire : fail open (le comportement actuel), fail closed, ou se rabattre sur un compteur dans la mémoire de chaque processus applicatif.',
		hint: 'Chaque choix protège une caractéristique différente. Demande-toi qui souffre pendant la panne : l’attaquant, ou chaque utilisateur honnête qui veut se connecter.',
		answer: [
			'Source : un attaquant avec des mots de passe fuités. Stimulus : 1000 connexions en 5 minutes. Artefact : les limites de connexion. Environnement : Redis injoignable pendant 10 minutes.',
			'Fail open, ce que fait le code aujourd’hui : les connexions marchent pour tout le monde, et l’attaquant a 10 minutes sans limite.',
			'Fail closed : toutes les connexions sont refusées tant que le compteur est injoignable. L’attaquant est arrêté, et chaque utilisateur honnête aussi.',
			'Repli local : chaque processus compte dans sa propre mémoire. La limite s’applique toujours, mais elle est multipliée par le nombre de processus, et un redémarrage la remet à zéro. Tu as aussi plus de code à maintenir.',
			'Une réponse et une mesure possibles : « les connexions continuent de marcher ; au plus 25 × (nombre de processus web) tentatives par IP toutes les 5 minutes atteignent la vérification du mot de passe tant que Redis est en panne. » Tes nombres peuvent être différents, mais la mesure doit être un nombre.'
		]
	},
	quiz: [
		{
			q: 'Qu’est-ce qui rend « le système doit être rapide » testable ?',
			options: [
				'L’écrire comme exigence dans un ADR que toute l’équipe valide',
				'Réécrire le chemin critique dans un langage plus rapide, comme Go ou Rust',
				'Une mesure de réponse, comme « p95 sous 300 ms à 200 requêtes par seconde »',
				'Ajouter un cache devant la base pour que la plupart des lectures soient rapides'
			],
			answer: 2,
			why: 'Avec une mesure, un test de charge réussit ou échoue : le p95 reste sous 300 ms à 200 requêtes par seconde, ou pas. Sans elle, personne ne peut dire si la conception répond au besoin.'
		},
		{
			q: 'Dans un scénario de qualité, l’**environnement** décrit…',
			options: [
				'L’état du système quand le stimulus arrive : charge normale, déploiement, Redis en panne',
				'Le langage et le framework dans lesquels le service est écrit, comme Ruby on Rails',
				'L’étape où le scénario est testé, comme la préprod ou la prod',
				'L’équipe qui possède le service et qui reçoit les alertes quand il casse'
			],
			answer: 0,
			why: 'La même rafale de connexions demande une réponse quand Redis marche, et une autre quand il est en panne.'
		},
		{
			q: 'Mastodon compte les tentatives de connexion dans Redis via le cache Rails. Redis tombe. Que devient la limite de connexion ?',
			options: [
				'Toutes les connexions sont refusées avec un 429 jusqu’au retour de Redis',
				'Mastodon se met à compter les tentatives dans PostgreSQL en attendant le retour de Redis',
				'La limite lève une erreur, donc la connexion suivante échoue avec un 500',
				'Chaque tentative est comptée comme la première de sa fenêtre, donc rien n’est limité'
			],
			answer: 3,
			why: 'Le cache Redis de Rails renvoie `nil` sur les erreurs de connexion, et Rack::Attack lit `nil` comme un compte de 1. Aucune tentative n’est limitée tant que Redis est en panne.'
		}
	],
	recall: {
		q: 'Quelle partie d’un scénario de qualité le rend testable, et que vaut-elle pour la limite de connexion de Mastodon ?',
		a: 'La mesure de réponse. Pour Mastodon : au plus 25 tentatives de connexion par IP et par fenêtre de 5 minutes atteignent la vérification du mot de passe.'
	},
	sources: [
		{ title: 'Mastodon, config/initializers/rack_attack.rb', url: `${MASTODON}/config/initializers/rack_attack.rb#L148-L172` },
		{ title: 'Mastodon docs, API rate limits', url: 'https://docs.joinmastodon.org/api/rate-limits/' },
		{ title: 'rack-attack 6.8.0, Cache#do_count', url: `${RACK_ATTACK}/lib/rack/attack/cache.rb#L76-L89` },
		{ title: 'Rails 8.1.4, RedisCacheStore failsafe', url: `${RAILS}/activesupport/lib/active_support/cache/redis_cache_store.rb#L490-L503` },
		{ title: 'SEI, Quality Attribute Workshops, 3rd ed. (the six parts of a scenario)', url: 'https://www.sei.cmu.edu/documents/716/2003_005_001_14249.pdf' }
	]
};
