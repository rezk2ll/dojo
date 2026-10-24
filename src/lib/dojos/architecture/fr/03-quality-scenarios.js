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
		],
		steps: [
			{
				title: 'Écris les quatre premières parties',
				questions: [
					{ q: 'Quelle partie change par rapport au scénario du chapitre ?', options: ['La source : un autre attaquant', 'Le stimulus : moins de connexions', 'L’environnement : Redis est injoignable', 'L’artefact : la vérification du mot de passe'], answer: 2, why: 'Même attaquant, même attaque. Seul l’état du système à son arrivée change.' },
					{ q: 'Quel est le stimulus ?', options: ['Un attaquant avec des mots de passe fuités', '1000 connexions en 5 minutes', 'Les limites de connexion', 'Redis injoignable pendant 10 minutes'], answer: 1, why: 'Le stimulus est l’événement qui arrive sur le système. L’attaquant, c’est la source.' },
					{ q: 'Quel est l’artefact ?', options: ['Les limites de connexion dans Rack::Attack', 'Le serveur Redis', 'La vérification du mot de passe dans Rails', 'Le formulaire de connexion dans le navigateur'], answer: 0, why: 'L’artefact est la partie qui reçoit le coup. Rack::Attack voit chaque `POST /auth/sign_in` en premier.' },
					{ q: 'Pourquoi écrire un scénario à part pour Redis en panne ?', options: ['Redis en panne, c’est un autre attaquant', 'La QA ne teste qu’un scénario par sprint', 'La mesure reste la même, seuls les mots changent', 'La même attaque peut demander une autre réponse dans un autre environnement'], answer: 3, why: 'En charge normale, pendant un déploiement ou avec Redis en panne, la même rafale peut demander sa propre réponse.' }
				]
			},
			{
				title: 'Regarde ce que fait le code aujourd’hui',
				questions: [
					{ q: 'Redis est en panne. Que renvoie le cache Rails pour le compteur ?', options: ['Une erreur qui arrête la requête', '`nil`, après avoir avalé l’erreur', 'Le dernier compte qu’il connaissait', 'Zéro, lu dans PostgreSQL'], answer: 1, why: 'Le cache Redis de Rails avale les erreurs de connexion et renvoie `nil`.' },
					{ q: 'Comment Rack::Attack lit-il ce `nil` ?', options: ['Comme un compte au-dessus de la limite', 'Comme une erreur à lever', 'Comme un compte de 1', 'Comme une raison de refuser la requête'], answer: 2, why: '`Cache#do_count` compte `nil` comme 1, donc chaque tentative ressemble à la première.' },
					{ q: 'Que fait donc la limite tant que Redis est en panne ?', options: ['Du fail open : rien n’est limité', 'Du fail closed : chaque connexion reçoit un `429`', 'Elle renvoie un `500` à chaque connexion', 'Elle compte dans PostgreSQL à la place'], answer: 0, why: 'Aucun compte ne dépasse jamais 1, donc aucune tentative n’est jamais arrêtée.' },
					{ q: 'En fail open, qui gagne pendant 10 minutes de panne de Redis ?', options: ['Les utilisateurs honnêtes, qui sont bloqués', 'La QA, qui peut lancer plus de tests', 'Personne, puisque les connexions s’arrêtent', 'L’attaquant, qui a 10 minutes sans limite'], answer: 3, why: 'Les connexions marchent pour tout le monde, attaquant compris.' }
				]
			},
			{
				title: 'Pèse les trois choix',
				questions: [
					{ q: 'Tu fais du fail closed. Que se passe-t-il ?', options: ['Seul l’attaquant est refusé', 'Toutes les connexions sont refusées : l’attaquant, et chaque utilisateur honnête aussi', 'Les connexions marchent sans limite', 'Chaque processus compte de son côté'], answer: 1, why: 'Sans le compteur, la limite ne distingue pas l’attaquant des autres.' },
					{ q: 'Tu te rabats sur un compteur dans la mémoire de chaque processus. Que devient la limite ?', options: ['25 par IP, exactement comme avant', 'Zéro, donc toute connexion est refusée', 'Multipliée par le nombre de processus, et remise à zéro par un redémarrage', 'Partagée entre les processus par la mémoire'], answer: 2, why: 'Chaque processus ne compte que ce qu’il voit, et sa mémoire disparaît au redémarrage.' },
					{ q: 'Quel autre coût apporte le repli local ?', options: ['Plus de code à maintenir', 'Un `429` à chaque connexion', 'Un `500` à chaque connexion', 'Une nouvelle dépendance à PostgreSQL'], answer: 0, why: 'Un deuxième chemin de comptage, c’est du code que quelqu’un doit posséder et tester.' },
					{ q: 'Quelle question t’aide à choisir entre les trois ?', options: ['Lequel demande le moins de lignes de code ?', 'Lequel Rails choisit-il par défaut ?', 'Lequel la QA teste-t-elle le plus vite ?', 'Qui souffre pendant la panne : l’attaquant, ou chaque utilisateur honnête ?'], answer: 3, why: 'Chaque choix protège une caractéristique différente. Nomme qui en paie le prix.' }
				]
			},
			{
				title: 'Écris la réponse et la mesure',
				questions: [
					{ q: 'Tu choisis le repli local. Quelle réponse convient ?', options: ['Chaque connexion reçoit un `429`', 'Les connexions continuent de marcher', 'Les connexions renvoient un `500`', 'Les connexions attendent le retour de Redis'], answer: 1, why: 'Le repli garde les connexions ouvertes et applique quand même une limite.' },
					{ q: 'Quelle mesure convient au repli local ?', options: ['Au plus 25 tentatives par IP toutes les 5 minutes, comme avant', 'Aucune tentative n’atteint la vérification du mot de passe', 'Au plus 25 × (nombre de processus web) tentatives par IP toutes les 5 minutes atteignent la vérification du mot de passe', 'La limite reste aussi sécurisée que possible'], answer: 2, why: 'C’est un nombre que la QA peut vérifier, et il dit honnêtement que la limite est multipliée.' },
					{ q: 'Pourquoi « 25 × nombre de processus » et pas 25 ?', options: ['Chaque processus ne compte que les tentatives qu’il voit', 'Redis multiplie la limite quand il redémarre', 'Rack::Attack double les limites en cas d’erreur', 'La limite par compte ajoute ses propres 25'], answer: 0, why: 'Un attaquant dont les tentatives se répartissent sur tous les processus en obtient 25 dans chacun.' },
					{ q: 'Un collègue écrit la mesure « la limite reste sécurisée ». Qu’est-ce qui ne va pas ?', options: ['Elle appartient à la partie stimulus', 'Elle nomme le mauvais environnement', 'Rien : elle nomme la caractéristique', 'Ce n’est pas un nombre que la QA peut vérifier'], answer: 3, why: 'La mesure tranche entre réussi et raté. Tes nombres peuvent être différents, mais ce doit être un nombre.' }
				]
			}
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
