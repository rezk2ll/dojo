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
		'En réunion, quelqu’un dit « on devrait passer aux microservices ». Quelqu’un d’autre répond « on a déjà un monolithe modulaire ». Personne ne vérifie ce qu’est vraiment le code. La dispute porte sur des étiquettes.',
		'Un **style d’architecture** est une forme nommée pour un système entier : comment il est découpé, comment les parties se parlent, comment il est déployé. Richards & Ford en dressent le catalogue : en couches, monolithe modulaire, pipeline, microkernel, service-based, event-driven, space-based, SOA pilotée par l’orchestration, microservices. Chacun vient avec des **forces connues et des faiblesses connues**.',
		'La compétence utile, ce n’est pas de connaître la liste. C’est de **regarder du vrai code, nommer son style honnêtement, et confronter ce style aux caractéristiques que tu as dites importantes** (jour 2). La plupart des vrais systèmes sont un mélange. Aujourd’hui : Discourse, le logiciel de forum, et une démo de microservices pour comparer.'
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
				note: '**Un monolithe, découpé par couche.** Un seul back end Rails, avec Postgres et Redis. Les dossiers sous `app/` sont des couches techniques : controllers, models, serializers, services, jobs. Les topics, les posts et les utilisateurs vivent chacun dans plusieurs d’entre eux. C’est un monolithe en couches, pas un monolithe modulaire.'
			},
			{
				add: ['pc["PostCreator : enregistre dans une transaction"]', 'evt["DiscourseEvent.trigger :post_created"]', 'models --> pc', 'pc -->|"après le commit, dans le processus"| evt'],
				highlight: ['pc', 'evt'],
				note: '**Event-driven, à l’intérieur du monolithe.** Après la transaction, `PostCreator` déclenche `:post_created`. `DiscourseEvent` est une table de blocs en mémoire. Il les appelle un par un, dans le même processus, avant que `create` ne rende la main.'
			},
			{
				add: ['sq["Workers Sidekiq"]', 'pc -->|"enqueue_jobs"| sq', 'class sq ext'],
				highlight: ['sq'],
				note: '**Les jobs en arrière-plan.** Le travail lent part vers Sidekiq via Redis : `enqueue_jobs` s’exécute juste après les événements. Même base de code, un deuxième type de processus. `app/jobs` contient plus d’une centaine de jobs ordinaires et plus d’une centaine de jobs planifiés.'
			},
			{
				add: ['poll["plugins/poll"]', 'chat["plugins/chat"]', 'poll -->|"on(:post_created)"| evt', 'poll -->|"prepend dans Post, User"| models', 'chat -->|"API de plugin"| app'],
				highlight: ['poll', 'chat'],
				note: '**Microkernel, portes grandes ouvertes.** Le dépôt embarque 46 plugins, de `poll` à `chat`. Chacun a un `plugin.rb` qui appelle l’API de plugin : `on(event)`, `add_to_serializer`, `add_to_class`. Le plugin poll fait aussi un prepend de ses propres modules dans les classes `Post` et `User` du cœur.'
			},
			{
				add: ['boutique["Online Boutique : 11 services, plusieurs langages, gRPC"]', 'class boutique ext'],
				highlight: ['boutique'],
				note: '**Pour comparer, des microservices.** La démo Online Boutique de Google, ce sont « 11 microservices written in different languages that talk to each other over gRPC » (11 microservices écrits dans des langages différents qui se parlent en gRPC). Chacun est construit et déployé séparément. Compare : dans Discourse, une nouvelle fonctionnalité, c’est un dossier de plugin et une nouvelle release d’une seule appli.'
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
			'Trois points d’entrée. Un **réglage** qui active ou désactive le plugin. Un **hook** sur un événement du cœur. Une **extension** d’une classe ou d’un serializer du cœur. À eux trois, ils forment le contrat entre le cœur et le plugin.',
			'Le cœur enveloppe chaque hook dans l’interrupteur : [`on`](' + REPO + '/lib/plugin/instance.rb#L691-L694) enregistre auprès de `DiscourseEvent` un bloc qui ne s’exécute que `if enabled?`. [`add_to_class`](' + REPO + '/lib/plugin/instance.rb#L474-L491) définit une méthode sur n’importe quelle classe du cœur, protégée de la même façon.',
			'`prepend` n’a ni cette protection ni contrat fixe. Le plugin peut changer n’importe quelle méthode de `Post`. Voilà le coût du microkernel, en entier : les plugins sont indépendants jusqu’au jour où une classe du cœur change sous leurs pieds.',
			'Les événements s’exécutent en ligne. [`DiscourseEvent.trigger`](' + REPO + '/lib/discourse_event.rb#L11-L18) appelle chaque bloc l’un après l’autre et relance l’exception sauf avec `continue_on_error`. [`PostCreator`](' + REPO + '/lib/post_creator.rb#L203-L280) passe `continue_on_error: true` pour `:post_created`, donc un plugin cassé donne un avertissement, pas un post raté.'
		]
	},
	tradeoff: {
		gain: [
			'Discourse (monolithe) : **simple** à exploiter. Une appli, une base, une seule chose à déployer et à déboguer, et une seule transaction autour d’un nouveau post.',
			'Plugins (microkernel) : chaque site active des fonctionnalités avec un réglage. De la personnalisation sans fork.',
			'Événements dans le processus : une nouvelle réaction à « post créé » est un hook, pas une modification de `PostCreator`.'
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
			'Vérifie : est-ce que tu l’as nommé d’après le **code**, et pas d’après le wiki ou ce que l’équipe aimerait ?',
			'Vérifie : des dossiers de premier niveau nommés `controllers/services/repositories` veulent dire partitionnement technique. Des dossiers nommés d’après les zones métier veulent dire partitionnement par domaine.',
			'Vérifie : au moins une caractéristique a pris un **moins**. Chaque style en a un, et faire semblant du contraire viole la première loi (jour 1 : tout est compromis).',
			'Bonus : écris une phrase sur ce qui devrait changer pour passer au style suivant. Cette phrase, c’est un ADR qui attend d’être écrit.'
		]
	},
	quiz: [
		{
			q: 'Un système est une seule unité déployable dont les dossiers de premier niveau sont `controllers/`, `models/` et `jobs/`, avec les zones métier éparpillées dans chacun. Quelle étiquette est la plus honnête ?',
			options: ['Des microservices, un par dossier de premier niveau', 'Un pur monolithe modulaire, partitionné d’abord par domaine métier', 'Une architecture space-based', 'Un monolithe en couches : partitionnement technique d’abord'],
			answer: 3,
			why: 'Le premier découpage est technique (des couches), donc ce n’est pas un monolithe modulaire. C’est une seule unité déployable, donc ce ne sont pas des microservices. Nomme ce que le code montre.'
		},
		{
			q: 'Qu’est-ce qui fait du système de plugins de Discourse un microkernel ?',
			options: ['Il stocke chaque plugin dans sa propre base, séparée de celle du cœur', 'Une appli cœur charge des plugins qui ajoutent des hooks, des réglages et des extensions', 'Chaque plugin tourne comme un service à part et communique avec le cœur en gRPC', 'Il envoie chaque événement à Sidekiq pour que les plugins le traitent'],
			answer: 1,
			why: 'Microkernel veut dire un cœur plus des plugins. Chaque `plugin.rb` déclare ce qu’il ajoute via l’API de plugin. Les plugins tournent dans le même processus Rails.'
		},
		{
			q: '`DiscourseEvent` garde ses handlers en mémoire et les appelle en ligne, après l’enregistrement du post. Quel est le compromis ?',
			options: ['Bon marché et simple, mais un handler lent retarde l’appelant et rien ne le rejoue après un crash', 'Il lui faut un processus broker séparé pour tourner, ce qui ajoute une unité déployable', 'Les handlers s’exécutent avant le commit de la transaction, donc ils peuvent annuler le post', 'Il n’y a pas vraiment d’inconvénient, puisque chaque processus enregistre les mêmes handlers au démarrage'],
			answer: 0,
			why: 'Les événements dans le processus ne coûtent rien à mettre en place. Ils n’apportent aussi ni durabilité ni isolation : le handler s’exécute dans l’appelant, et un crash le perd. Le travail qui doit survivre part dans un job Sidekiq.'
		}
	],
	takeaway: 'Nomme le style d’après le code, attends-toi à un mélange, et note-le sur tes propres caractéristiques, moins compris.',
	sources: [
		{ title: 'Richards & Ford, Fundamentals of Software Architecture, 2nd ed., table of contents', url: 'https://nealford.com/books/SAF2e.html' },
		{ title: 'Richards & Ford, Fundamentals of Software Architecture, 2nd ed. (O\'Reilly)', url: 'https://www.oreilly.com/library/view/fundamentals-of-software/9781098175504/' },
		{ title: 'Discourse, lib/plugin/instance.rb: the plug-in API', url: `${REPO}/lib/plugin/instance.rb#L691-L694` },
		{ title: 'Discourse, plugins/: the bundled plug-ins', url: `${TREE}/plugins` },
		{ title: 'Online Boutique, README: architecture', url: `${BOUTIQUE}/README.md#architecture` }
	]
};
