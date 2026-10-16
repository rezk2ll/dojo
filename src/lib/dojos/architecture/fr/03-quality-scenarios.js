const MASTODON = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';
const RACK_ATTACK = 'https://github.com/rack/rack-attack/blob/65f1ead3bc648b1e972fd8df0078949f056699d9';
const RAILS = 'https://github.com/rails/rails/blob/c3466ea00d7121798e3aa3144ffdf7174b81d8cb';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'quality-scenarios',
	part: 'Penser en architecte',
	title: '« Sécurisé » n’est pas une exigence. Un scénario, si.',
	minutes: 10,
	hook: [
		'Hier, tu as choisi trois caractéristiques. Le problème du jour : « le système doit être sécurisé » ne peut pas être testé, ne peut pas être discuté, et ne peut pas te dire quand tu as fini.',
		'Prends un serveur Mastodon. Quelqu’un récupère une liste de mots de passe qui ont fuité et les essaie, l’un après l’autre, sur le formulaire de connexion. L’un d’eux finira par marcher pour un utilisateur qui l’a réutilisé ailleurs.',
		'« Protéger les comptes contre la devinette de mots de passe » est un souhait. Un **scénario de qualité** le transforme en une phrase en six parties, qui se termine par un nombre que tu peux tester. Mastodon fournit le mécanisme, et sa configuration contient les nombres.'
	],
	terms: [
		{ term: 'Scénario', def: 'Une histoire courte et testable : qui fait quoi à quelle partie, dans quelle situation, ce que le système doit faire, et comment tu le mesures.' },
		{ term: 'Stimulus', def: 'L’événement qui frappe le système : une rafale de connexions, un crash, un pic de trafic, une attaque.' },
		{ term: 'Mesure de réponse', def: 'Le nombre qui dit réussi ou raté. Sans lui, ça reste un souhait.' },
		{ term: 'Rate limit', def: 'Un plafond sur ce qu’un appelant peut faire dans une fenêtre de temps. Ici : les tentatives de connexion par adresse IP et par compte.' },
		{ term: 'Fail open, fail closed', def: 'Ce que fait un contrôle quand il ne peut pas s’exécuter. Fail open laisse passer la requête. Fail closed la refuse.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['source["Source : attaquant avec des mots de passe fuités"] -->|envoie| stimulus["Stimulus : 1000 connexions en 5 minutes"]'],
				highlight: ['source', 'stimulus'],
				note: '**Qui** agit, et **ce qu’il** fait. Pas « un acteur malveillant », mais un script qui essaie de vrais mots de passe, une connexion à la fois.'
			},
			{
				add: ['stimulus -->|frappe| artifact["Artefact : limites de connexion dans Rack::Attack"]'],
				highlight: ['artifact'],
				note: '**Quelle partie** du système est touchée. Pas « le serveur », mais le middleware Rack::Attack qui voit chaque `POST /auth/sign_in` avant que Rails vérifie le mot de passe.'
			},
			{
				add: ['env["Environnement : charge normale, Redis en marche"] -.->|pendant| artifact', 'class env ext'],
				highlight: ['env'],
				note: '**Dans quelle situation.** Les compteurs vivent dans Redis, via le cache Rails. Charge normale ? Pendant un déploiement ? Avec Redis en panne ? Le même stimulus peut demander une réponse différente dans chaque cas.'
			},
			{
				add: ['artifact -->|doit| response["Réponse : 429 Too Many Requests"]'],
				highlight: ['response'],
				note: '**Ce qui doit se passer.** Les tentatives sous la limite arrivent à la vérification du mot de passe comme d’habitude. Les autres reçoivent un `429` avec `X-RateLimit-Reset`, pour que les clients honnêtes sachent quand réessayer.'
			},
			{
				add: ['response -->|testé par| measure["Mesure : au plus 25 par IP et par fenêtre de 5 minutes atteignent la vérification du mot de passe"]'],
				highlight: ['measure'],
				note: '**Comment tu vérifies.** La limite de Mastodon est de 25 par IP toutes les 5 minutes, comptées en fenêtres fixes, donc une rafale à cheval sur deux fenêtres en obtient 25 dans chacune. La QA peut en envoyer 1000 depuis une seule IP et compter par fenêtre. Maintenant, tu discutes du nombre, pas de l’adjectif.'
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
			'La **mesure** est une donnée, pas de la logique : `limit: 25, period: 5.minutes`. Change le nombre, et la ligne de réussite du scénario bouge avec.',
			'La **réponse**, c’est le responder : un `429` et trois en-têtes qui donnent la limite, ce qui reste, et quand la fenêtre se réinitialise.',
			'Deux limites, parce qu’un second scénario a trouvé un second stimulus. Un attaquant qui répartit ses essais sur un même compte depuis de nombreuses IP passe sous la limite par IP, donc la limite par compte (25 par heure) le rattrape. Et [`throttleable_remote_ip`](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/config/initializers/rack_attack.rb#L20-L30) compte tout un `/64` IPv6 comme une seule adresse, donc faire tourner les adresses à l’intérieur d’un même réseau n’aide pas non plus.',
			'L’**environnement** se cache dans le stockage. Le cache de production de Mastodon, c’est Redis. Si Redis tombe, le cache Rails [avale l’erreur et renvoie `nil`](https://github.com/rails/rails/blob/c3466ea00d7121798e3aa3144ffdf7174b81d8cb/activesupport/lib/active_support/cache/redis_cache_store.rb#L490-L503), et Rack::Attack [traite `nil` comme un compte de 1](https://github.com/rack/rack-attack/blob/65f1ead3bc648b1e972fd8df0078949f056699d9/lib/rack/attack/cache.rb#L76-L89). Chaque tentative ressemble à la première. C’est du « fail open ». Le vouloir ou pas, c’est une question de scénario.'
		]
	},
	tradeoff: {
		gain: [
			'Les mots flous deviennent des tests. « Protéger les comptes » devient « au plus 25 essais par IP et par fenêtre de 5 minutes atteignent la vérification du mot de passe ».',
			'Les désaccords deviennent concrets : on discute de 25 ou 100 tentatives, pas de « assez sécurisé ».',
			'Les scénarios font de bons tests d’acceptation et de bonnes checklists de revue. Ils trouvent aussi les cas manquants, comme un attaquant avec un millier d’adresses IP.'
		],
		cost: [
			'Les écrire demande une vraie réflexion, et ils te forcent à découvrir ce que tu ne sais pas (que deviennent les limites quand Redis est en panne ?).',
			'Trop de scénarios, c’est du bruit. Écris-les d’abord pour tes trois caractéristiques principales.',
			'Un nombre peut être faux. Mets la limite trop bas, et tout un bureau derrière une seule adresse IP se retrouve bloqué.'
		]
	},
	task: {
		prompt: 'Écris le scénario pour le même attaquant, mais **avec Redis en panne**. Puis choisis ce que la limite de connexion doit faire : fail open (le comportement actuel), fail closed, ou se rabattre sur un compteur dans la mémoire de chaque processus applicatif.',
		hint: 'Chaque choix protège une caractéristique différente. Demande-toi qui souffre pendant la panne : l’attaquant, ou chaque utilisateur honnête qui veut se connecter.',
		answer: [
			'**Source :** attaquant avec des mots de passe fuités. **Stimulus :** 1000 connexions en 5 minutes. **Artefact :** les limites de connexion. **Environnement :** Redis injoignable pendant 10 minutes.',
			'**Fail open** (ce que fait le code aujourd’hui) : les connexions continuent de marcher pour tout le monde, et l’attaquant a 10 minutes sans limite. La disponibilité gagne, la sécurité perd.',
			'**Fail closed :** refuser toutes les connexions tant que le compteur est injoignable. L’attaquant est arrêté, et chaque utilisateur honnête aussi. La sécurité gagne, la disponibilité perd.',
			'**Repli local :** chaque processus compte dans sa propre mémoire. Les limites s’appliquent toujours, mais elles sont multipliées par le nombre de processus, et un redémarrage les remet à zéro. Une réponse intermédiaire, avec plus de code à maintenir.',
			'**Réponse et mesure**, par exemple : « les connexions continuent de marcher ; au plus 25 × (nombre de processus web) tentatives par IP toutes les 5 minutes atteignent la vérification du mot de passe tant que Redis est en panne. » La tienne peut être différente. Ce qui compte, c’est qu’elle ait un nombre.'
		]
	},
	quiz: [
		{
			q: 'Qu’est-ce qui transforme « le système doit être rapide » en quelque chose de testable ?',
			options: [
				'L’écrire comme exigence dans un ADR que toute l’équipe valide',
				'Réécrire le chemin critique dans un langage plus rapide, comme Go ou Rust',
				'Une mesure de réponse, comme « p95 sous 300 ms à 200 requêtes par seconde »',
				'Ajouter un cache devant la base pour que la plupart des lectures soient rapides'
			],
			answer: 2,
			why: 'La mesure, c’est la ligne entre réussi et raté. Sans elle, personne ne peut dire si la conception répond au besoin.'
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
			why: 'Le cache Redis de Rails renvoie `nil` sur les erreurs de connexion, et Rack::Attack lit `nil` comme un compte de 1. Le contrôle fait du fail open. Un scénario avec « Redis en panne » comme environnement, c’est ce qui te permet de décider si c’est ce que tu veux.'
		}
	],
	takeaway: 'S’il n’y a pas de nombre, c’est un souhait. Source, stimulus, artefact, environnement, réponse, mesure.',
	sources: [
		{ title: 'Mastodon, config/initializers/rack_attack.rb', url: `${MASTODON}/config/initializers/rack_attack.rb#L148-L172` },
		{ title: 'Mastodon docs, API rate limits', url: 'https://docs.joinmastodon.org/api/rate-limits/' },
		{ title: 'rack-attack 6.8.0, Cache#do_count', url: `${RACK_ATTACK}/lib/rack/attack/cache.rb#L76-L89` },
		{ title: 'Rails 8.1.4, RedisCacheStore failsafe', url: `${RAILS}/activesupport/lib/active_support/cache/redis_cache_store.rb#L490-L503` },
		{ title: 'SEI, Quality Attribute Workshops, 3rd ed. (the six parts of a scenario)', url: 'https://www.sei.cmu.edu/documents/716/2003_005_001_14249.pdf' }
	]
};
