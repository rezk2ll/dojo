const DISCOURSE = 'https://github.com/discourse/discourse/blob/9252651c5c25df36cb0a3cf3f06e0c9c30974d5a';
const KEP = 'https://github.com/kubernetes/enhancements/blob/6ebe0a94771723b3f27cb4a757f0cc22f29e38a2/keps/sig-node/4781-kublet-restart-pod-status/README.md';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'three-audiences',
	part: "The architect's job",
	title: 'One decision, three audiences',
	minutes: 10,
	hook: [
		'Discourse, the forum software, can host many communities from one server. Each community, called a **site**, gets its own PostgreSQL database. Same week, three questions about that decision. A new developer asks why a migration runs dozens of times. A product manager asks why "one search across all our communities" is estimated in weeks. A director asks: **can one customer ever see another customer\'s posts?**',
		'Give all three the same answer and you lose two of them. The developer gets a slogan, the director gets a lecture on connection pools.',
		'Gregor Hohpe calls this **riding the Architect Elevator**: the architect connects the engine room, where the code lives, with the penthouse, where strategy is decided. **Same facts on every floor. Different words, different detail, different length.**'
	],
	terms: [
		{ term: 'Architect Elevator', def: 'Hohpe\'s image: the architect rides between the IT engine room and the executive penthouse, and keeps the two connected.' },
		{ term: 'Engine room', def: 'Where code and infrastructure live. People there need the mechanism, so they can build on it.' },
		{ term: 'Penthouse', def: 'Where strategy, budget and risk are decided. People there need the consequence, so they can decide.' },
		{ term: 'Altitude', def: 'How much detail an audience needs to act. Not how smart they are.' },
		{ term: 'Multisite', def: 'Discourse\'s mode where one server hosts many sites, each with its own database and host names.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['dec["Decision: one database per site"]'],
				highlight: ['dec'],
				note: 'One decision, already made (day 4). The facts do not change in this chapter. Only the telling does.'
			},
			{
				add: ['eng["Engine room: developer, 5 minutes"]', 'dec -.-> eng'],
				highlight: ['eng'],
				note: '**Developer, 5 min.** The request\'s host name picks the site, and the site picks its database. Every migration runs once per database. No SQL query can join two sites, so anything across sites is code that visits each database in turn.'
			},
			{
				add: ['mid["Middle floor: product manager, 2 minutes"]', 'eng <-->|elevator| mid', 'dec -.-> mid'],
				highlight: ['mid'],
				note: '**Product manager, 2 min.** Each community\'s data is fully separate, so a new community is a new database and one more config entry. The price: one search over all communities cannot be one database query, so it takes longer to build.'
			},
			{
				add: ['pent["Penthouse: director, 30 seconds"]', 'mid <-->|elevator| pent', 'dec -.-> pent'],
				highlight: ['pent'],
				note: '**Director, 30 s.** Each customer has a separate database: a page in one community only queries that community\'s database. The cost is more databases to upgrade and run: an operations budget line, not a risk.'
			},
			{
				add: [],
				highlight: ['eng', 'mid', 'pent'],
				note: 'Each version keeps **one gain and one cost**. Drop the cost on the top floor and you are selling, not informing. The elevator also goes down: bring back what the penthouse cares about, so the engine room optimizes the right thing.'
			}
		]
	},
	example: {
		title: 'config/multisite.yml.production-sample',
		repo: 'discourse/discourse',
		url: `${DISCOURSE}/config/multisite.yml.production-sample#L1-L28`,
		lang: 'yaml',
		code: `mlp:
  adapter: postgresql
  database: discourse_mlp
  username: discourse_mlp
  password: applejack
  host: dbhost
  pool: 5
  timeout: 5000
…
  host_names:
    - discourse.equestria.com
    - discourse.equestria.internal

drwho:
  adapter: postgresql
  database: discourse_who
  username: discourse_who
…
  host_names:
    - discuss.tardis.gallifrey`,
		notes: [
			`This is the engine-room fact behind every floor. Each site names **its own database, its own database user and its own host names**. The [developer guide](${DISCOURSE}/docs/developer-guides/docs/02-development-environments/09-multisite-setup.md#L7) says it plainly: "A multisite server uses a different DB and hostname for each site that it serves."`,
			`Check your penthouse claim against code before you make it. A [request spec](${DISCOURSE}/spec/integration/multisite_spec.rb#L10-L33) checks that each known host gets its own site\'s topic, and that an unknown host gets a 404 for a forum page.`,
			`The cost side is in the [migration task](${DISCOURSE}/lib/tasks/db.rake#L112-L187): it loops over every site database and migrates each one. The comment explains the concurrency option: "we have many sites", and it saves "huge amounts of time". That is the director\'s budget line, seen from below.`,
			'Notice the comment in the sample: change the host names and you must restart Sidekiq and rebake the posts. That kind of detail belongs in the developer version. The director never needs it.'
		]
	},
	tradeoff: {
		gain: [
			'Decisions get understood, funded and defended by people who will never read the code.',
			'Misunderstandings show up early: "wait, so search across communities is hard?" is better heard in a meeting than in a release.',
			'Preparing the short version forces you to find the one consequence that matters.'
		],
		cost: [
			'Three versions take preparation time. The 30-second one is the hardest to write.',
			'Simplifying can mislead. If the top-floor version hides the cost, you lose trust the first time it bites.',
			'Different stories to different floors is politics, not architecture. The facts must stay identical.'
		]
	},
	task: {
		prompt: 'Take yesterday\'s proposal, KEP-4781: the kubelet keeps each pod\'s last status across a restart instead of marking every pod not Ready. Write it for a platform developer (5 lines), a PM (2 lines), a director (1 sentence). Each version must keep one gain and one cost.',
		hint: 'Ask what each person will **do** with your answer. The developer builds and operates it, the PM plans upgrades and support, the director decides whether it matters to customers.',
		answer: [
			'**Developer:** after a restart, the kubelet keeps the `Started` and `Ready` status of containers that were already running, instead of resetting them to false. A pod that was not Ready before stays not Ready until its probe passes. The `ChangeContainerStatusOnKubeletRestart` gate brings the old behavior back. Cost: a container that broke while the kubelet was down keeps its Ready status until the next probe cycle.',
			'**PM:** restarting the node agent, for example during an upgrade, no longer takes healthy services out of rotation for a moment. Cost: a service that really broke during that restart is noticed one probe later.',
			'**Director:** "Routine node maintenance will stop causing brief false outages, at the price of a slightly slower reaction to a real failure in that window. It is the default from Kubernetes 1.35."',
			'Check: same facts in all three? One gain and one cost each? Nothing on the top floor you could not back with a line of the KEP?'
		]
	},
	quiz: [
		{
			q: 'A director asks: "Can one customer ever see another customer\'s data?" Which answer fits the floor?',
			options: ['It depends on PostgreSQL internals', 'We follow industry best practices', 'No: each customer\'s data sits in a separate database, so a query for one site never touches another\'s tables. The price is more databases to operate.', 'Walk through the connection lookup by host name and the migration task'],
			answer: 2,
			why: 'A direct answer, the reason in plain words, and one honest cost. The mechanism is true but useless at that altitude, and "best practices" says nothing.'
		},
		{
			q: 'What is Hohpe\'s Architect Elevator?',
			options: ['A load-balancing pattern', 'The architect riding between code (engine room) and strategy (penthouse), linking them', 'A career path where a developer rises floor by floor from the engine room into management', 'One of the C4 zoom levels'],
			answer: 1,
			why: 'The value is the connection: strategy that knows what the code can do, and code that knows what the business needs.'
		},
		{
			q: 'Between the developer, PM and director versions, what should change?',
			options: ['The detail and the consequence each audience acts on, while the facts stay identical', 'The facts', 'Only the length', 'The decision itself'],
			answer: 0,
			why: 'Altitude changes the words and the detail. If the facts change between floors, you have three decisions, and one day they will meet in the same meeting.'
		}
	],
	takeaway: 'Same facts on every floor. Give each audience the detail it needs to act, and always one gain and one cost.',
	sources: [
		{ title: 'Gregor Hohpe, The Architect Elevator', url: 'https://architectelevator.com/' },
		{ title: 'Gregor Hohpe, The Software Architect Elevator (book)', url: 'https://architectelevator.com/book/' },
		{ title: 'Discourse, config/multisite.yml.production-sample', url: `${DISCOURSE}/config/multisite.yml.production-sample#L1-L28` },
		{ title: 'Discourse, multisite migration task (lib/tasks/db.rake)', url: `${DISCOURSE}/lib/tasks/db.rake#L112-L187` },
		{ title: 'KEP-4781, Restarting kubelet does not change pod status (provisional)', url: KEP },
		{ title: 'Kubernetes v1.35.0, ChangeContainerStatusOnKubeletRestart feature gate', url: 'https://github.com/kubernetes/kubernetes/blob/66452049f3d692768c39c797b21b793dce80314e/pkg/features/kube_features.go#L1189-L1192' }
	]
};
