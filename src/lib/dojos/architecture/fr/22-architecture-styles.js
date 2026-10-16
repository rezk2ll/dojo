const REPO = 'https://github.com/discourse/discourse/blob/9252651c5c25df36cb0a3cf3f06e0c9c30974d5a';
const TREE = 'https://github.com/discourse/discourse/tree/9252651c5c25df36cb0a3cf3f06e0c9c30974d5a';
const BOUTIQUE = 'https://github.com/GoogleCloudPlatform/microservices-demo/blob/38e7348eb289eb5b87c0c6e8cb19ced0449dc389';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'architecture-styles',
	part: 'Domaines et frontières',
	title: 'Les styles d’architecture',
	minutes: 10,
	hook: [
		'En réunion, quelqu’un dit « on devrait passer aux microservices ». Quelqu’un d’autre répond « on a déjà un monolithe modulaire ». Personne n’ouvre le code pour vérifier lequel des deux c’est.',
		'Un **style d’architecture** est une forme nommée pour un système entier : comment il est découpé, comment les parties se parlent, comment il est déployé. Richards & Ford en dressent le catalogue : en couches, monolithe modulaire, pipeline, microkernel, service-based, event-driven, space-based, SOA pilotée par l’orchestration, microservices. Pour chaque style, tu peux trouver ses forces et ses faiblesses.',
		'Tu vas lire du vrai code, nommer son style, puis confronter ce style aux caractéristiques choisies au jour 2. La plupart des vrais systèmes mélangent plusieurs styles. Le code : Discourse, le logiciel de forum, et une démo de microservices pour comparer.'
	],
	terms: [
		{ term: 'Style', def: 'La forme globale d’un système : son découpage, sa communication et ses unités de déploiement. Un style a des compromis typiques que tu peux aller vérifier.' },
		{ term: 'Partitionnement technique ou par domaine', def: 'Découper le code par couche (controllers, models, jobs) ou par zone métier (topics, sondages, chat). C’est ce qui distingue un monolithe en couches d’un monolithe modulaire.' },
		{ term: 'Microkernel', def: 'Un petit cœur plus des plugins qui ajoutent des fonctionnalités. On dit aussi architecture à plugins.' },
		{ term: 'Event-driven', def: 'Pilotée par les événements : les parties réagissent à des événements au lieu de s’appeler directement. Bien pour découpler, plus dur à tracer et à tester.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['app["Discourse : une seule appli Rails"]', 'app --> ctrl["app/controllers"]', 'app --> models["app/models"]', 'app --> jobs["app/jobs"]'],
				highlight: ['app', 'ctrl', 'models', 'jobs'],
				note: 'Discourse est un seul back end Rails, avec Postgres et Redis. Les dossiers sous `app/` sont des couches techniques : controllers, models, serializers, services, jobs. Les topics, les posts et les utilisateurs sont répartis dans plusieurs de ces dossiers : tu as donc un monolithe en couches.'
			},
			{
				add: ['pc["PostCreator : enregistre dans une transaction"]', 'evt["DiscourseEvent.trigger :post_created"]', 'models --> pc', 'pc -->|"après le commit, dans le processus"| evt'],
				highlight: ['pc', 'evt'],
				note: 'Le monolithe utilise aussi des événements dans son propre processus. Après la transaction, `PostCreator` déclenche `:post_created`. `DiscourseEvent` garde une table de blocs en mémoire et les appelle un par un, avant que `create` ne rende la main.'
			},
			{
				add: ['sq["Workers Sidekiq"]', 'pc -->|"enqueue_jobs"| sq', 'class sq ext'],
				highlight: ['sq'],
				note: 'Le travail lent part vers Sidekiq via Redis : `enqueue_jobs` s’exécute juste après les événements. Les workers Sidekiq font tourner la même base de code, dans un deuxième type de processus. `app/jobs` contient plus d’une centaine de jobs ordinaires et plus d’une centaine de jobs planifiés.'
			},
			{
				add: ['poll["plugins/poll"]', 'chat["plugins/chat"]', 'poll -->|"on(:post_created)"| evt', 'poll -->|"prepend dans Post, User"| models', 'chat -->|"API de plugin"| app'],
				highlight: ['poll', 'chat'],
				note: 'Les plugins font aussi de Discourse un microkernel. Le dépôt embarque 46 plugins, de `poll` à `chat`, et chacun a un `plugin.rb` qui appelle l’API de plugin : `on(event)`, `add_to_serializer`, `add_to_class`. Le plugin poll fait aussi un prepend de ses propres modules dans les classes `Post` et `User` du cœur.'
			},
			{
				add: ['boutique["Online Boutique : 11 services, plusieurs langages, gRPC"]', 'class boutique ext'],
				highlight: ['boutique'],
				note: 'Pour comparer, la démo Online Boutique de Google, ce sont « 11 microservices written in different languages that talk to each other over gRPC » (11 microservices écrits dans des langages différents qui se parlent en gRPC). Chaque service est construit et déployé séparément. Dans Discourse, une nouvelle fonctionnalité, c’est un dossier de plugin et une nouvelle release d’une seule appli.'
			}
		]
	},
	example: {
		title: 'plugins/poll/plugin.rb : un plugin qui met les mains dans le cœur',
		repo: 'discourse/discourse',
		url: `${REPO}/plugins/poll/plugin.rb#L16-L208`,
		lang: 'ruby',
		code: `enabled_site_setting :poll_enabled
…
after_initialize do
  …
  reloadable_patch do
    Post.prepend(DiscoursePoll::PostExtension)
    User.prepend(DiscoursePoll::UserExtension)
  end
  …
  on(:post_created) do |post, _opts, user|
    guardian = Guardian.new(user)
    DiscoursePoll::Poll.schedule_jobs(post)
    …
  end
  …
  add_to_serializer(:current_user, :can_create_poll) do
    scope.user&.staff? || scope.user&.in_any_groups?(SiteSetting.poll_create_allowed_groups_map)
  end`,
		notes: [
			'Le plugin entre dans le cœur par trois points. La ligne 1 est un réglage qui l’active ou le désactive. La ligne 10 pose un hook sur un événement du cœur, et la ligne 16 étend un serializer du cœur. Ces appels forment le **contrat** entre le cœur et le plugin.',
			'Le cœur enveloppe chaque hook dans l’interrupteur : [`on`](' + REPO + '/lib/plugin/instance.rb#L691-L694) enregistre auprès de `DiscourseEvent` un bloc qui ne s’exécute que `if enabled?`. `add_to_class` définit une méthode sur n’importe quelle classe du cœur, avec la même protection.',
			'Les lignes 6 et 7 utilisent `prepend`, qui n’a ni cette protection ni contrat fixe. Le plugin peut changer n’importe quelle méthode de `Post`. Un refactoring de `Post` dans le cœur peut alors casser le plugin poll, alors que le cœur ne le mentionne jamais.',
			'Les événements s’exécutent en ligne. [`DiscourseEvent.trigger`](' + REPO + '/lib/discourse_event.rb#L11-L18) appelle chaque bloc l’un après l’autre et relance l’exception sauf avec `continue_on_error`. `PostCreator` passe `continue_on_error: true` pour `:post_created` : un plugin cassé écrit un avertissement dans le log, et le post est quand même enregistré.'
		]
	},
	tradeoff: {
		gain: [
			'Discourse tourne comme une seule appli avec une seule base : une seule chose à déployer et à déboguer, et une seule transaction autour d’un nouveau post.',
			'Avec les plugins, chaque site active des fonctionnalités par un réglage, et personne n’a besoin de forker Discourse.',
			'Pour réagir à « post créé », tu ajoutes un hook `on(:post_created)`, sans toucher à `PostCreator`.'
		],
		cost: [
			'Chaque changement livre toute l’appli, et un bug dans une zone peut toutes les faire tomber.',
			'Les plugins partagent le processus du cœur et peuvent patcher ses classes. Un plugin lent ou cassé ralentit ou casse tout le monde, et un refactoring du cœur peut casser des plugins qu’il ne mentionne jamais.',
			'Les événements en mémoire sont perdus si le processus meurt en pleine requête, et ils s’exécutent dans `create`, donc un handler lent ralentit chaque post. Ils sont aussi plus durs à suivre qu’un appel direct.'
		]
	},
	task: {
		prompt: 'Choisis un composant sur lequel tu travailles. En 3 minutes : nomme son style (un des noms de Richards & Ford, ou « X avec Y dedans »). Puis note-le sur tes 3 caractéristiques principales du jour 2 avec un +, un = ou un -.',
		hint: 'Regarde les dossiers de premier niveau (des noms de couches ou des noms métier ?), le nombre d’unités déployables, et comment les parties se parlent (appels, événements, hooks de plugin).',
		answer: [
			'Vérifie : est-ce que tu l’as nommé d’après le **code**, plutôt que d’après le wiki ou ce que l’équipe aimerait ?',
			'Vérifie : des dossiers de premier niveau nommés `controllers/services/repositories` indiquent un partitionnement technique. Des dossiers de premier niveau nommés d’après les zones métier indiquent un partitionnement par domaine.',
			'Vérifie : au moins une caractéristique a pris un moins. Chaque style en a un, et le jour 1 disait que chaque choix est un compromis.',
			'Bonus : écris une phrase sur ce qui devrait changer pour passer au style suivant. Tu peux en faire un ADR.'
		]
	},
	quiz: [
		{
			q: 'Un système est une seule unité déployable dont les dossiers de premier niveau sont `controllers/`, `models/` et `jobs/`, avec les zones métier éparpillées dans chacun. Quelle étiquette est la plus honnête ?',
			options: ['Des microservices, un par dossier de premier niveau', 'Un pur monolithe modulaire, partitionné d’abord par domaine métier', 'Une architecture space-based', 'Un monolithe en couches : partitionnement technique d’abord'],
			answer: 3,
			why: 'Les dossiers de premier niveau découpent le code par couche, donc ce n’est pas un monolithe modulaire. Le système se livre en une seule unité déployable, donc ce ne peut pas être des microservices.'
		},
		{
			q: 'Qu’est-ce qui fait du système de plugins de Discourse un microkernel ?',
			options: ['Il stocke chaque plugin dans sa propre base, séparée de celle du cœur', 'Une appli cœur charge des plugins qui ajoutent des hooks, des réglages et des extensions', 'Chaque plugin tourne comme un service à part et communique avec le cœur en gRPC', 'Il envoie chaque événement à Sidekiq pour que les plugins le traitent'],
			answer: 1,
			why: 'Dans un microkernel, une appli cœur charge des plugins au démarrage. Chaque `plugin.rb` déclare ce qu’il ajoute via l’API de plugin, et les plugins tournent dans le même processus Rails.'
		},
		{
			q: '`DiscourseEvent` garde ses handlers en mémoire et les appelle en ligne, après l’enregistrement du post. Quel est le compromis ?',
			options: ['Bon marché et simple, mais un handler lent retarde l’appelant et rien ne le rejoue après un crash', 'Il lui faut un processus broker séparé pour tourner, ce qui ajoute une unité déployable', 'Les handlers s’exécutent avant le commit de la transaction, donc ils peuvent annuler le post', 'Il n’y a pas vraiment d’inconvénient, puisque chaque processus enregistre les mêmes handlers au démarrage'],
			answer: 0,
			why: 'Les événements dans le processus ne demandent aucune mise en place. Ils ne sont ni stockés ni isolés : le handler s’exécute dans l’appelant, et un crash le perd. Le travail qui doit survivre part dans un job Sidekiq.'
		}
	],
	recall: {
		q: 'Quels deux styles Discourse mélange-t-il, et qu’est-ce qui montre chacun dans le code ?',
		a: 'Un monolithe en couches : une seule appli Rails dont les dossiers `app/` sont des couches (controllers, models, jobs). Un microkernel : 46 plugins, chacun avec un `plugin.rb` qui appelle `on`, `add_to_serializer` ou `add_to_class`.'
	},
	sources: [
		{ title: 'Richards & Ford, Fundamentals of Software Architecture, 2nd ed., table of contents', url: 'https://nealford.com/books/SAF2e.html' },
		{ title: 'Richards & Ford, Fundamentals of Software Architecture, 2nd ed. (O\'Reilly)', url: 'https://www.oreilly.com/library/view/fundamentals-of-software/9781098175504/' },
		{ title: 'Discourse, lib/plugin/instance.rb: the plug-in API', url: `${REPO}/lib/plugin/instance.rb#L691-L694` },
		{ title: 'Discourse, lib/plugin/instance.rb : add_to_class', url: `${REPO}/lib/plugin/instance.rb#L474-L491` },
		{ title: 'Discourse, lib/post_creator.rb', url: `${REPO}/lib/post_creator.rb#L203-L280` },
		{ title: 'Discourse, plugins/: the bundled plug-ins', url: `${TREE}/plugins` },
		{ title: 'Online Boutique, README: architecture', url: `${BOUTIQUE}/README.md#architecture` }
	]
};
