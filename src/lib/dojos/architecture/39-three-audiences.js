const DISCOURSE = 'https://github.com/discourse/discourse/blob/9252651c5c25df36cb0a3cf3f06e0c9c30974d5a';
const KEP = 'https://github.com/kubernetes/enhancements/blob/6ebe0a94771723b3f27cb4a757f0cc22f29e38a2/keps/sig-node/4781-kublet-restart-pod-status/README.md';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'three-audiences',
	part: "The architect's job",
	title: 'One decision, three audiences',
	minutes: 10,
	hook: [
		'Discourse, the forum software, can host many communities from one server. Each community, called a site, gets its own PostgreSQL database. In the same week, three people ask about that decision. A new developer asks why a migration runs dozens of times. A product manager asks why "one search across all our communities" is estimated in weeks. A director asks: **can one customer ever see another customer\'s posts?**',
		'If all three get the same answer, two of them cannot use it. A one-line answer tells the developer nothing about migrations, and a talk on connection pools tells the director nothing about risk.',
		'Gregor Hohpe calls this **riding the Architect Elevator**: the architect connects the engine room, where the code lives, with the penthouse, where strategy is decided. The facts stay the same on every floor. The words, the detail and the length change with the person.'
	],
	terms: [
		{ term: 'Architect Elevator', def: 'Hohpe\'s image: the architect rides between the IT engine room and the executive penthouse, and keeps the two connected.' },
		{ term: 'Engine room', def: 'The floor where code and infrastructure live. People there need the mechanism, so they can build on it.' },
		{ term: 'Penthouse', def: 'The floor where people decide strategy, budget and risk. They need the consequence, so they can decide.' },
		{ term: 'Altitude', def: 'How much detail an audience needs to act on a decision.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['dec["Decision: one database per site"]'],
				highlight: ['dec'],
				note: 'One decision, already made (day 4): each site gets its own database. The next three steps tell these same facts to three people.'
			},
			{
				add: ['eng["Engine room: developer, 5 minutes"]', 'dec -.-> eng'],
				highlight: ['eng'],
				note: 'For the developer, in 5 minutes: the request\'s host name picks the site, and the site picks its database. Every migration runs once per database. No SQL query can join two sites, so anything across sites is code that visits each database in turn.'
			},
			{
				add: ['mid["Middle floor: product manager, 2 minutes"]', 'eng <-->|elevator| mid', 'dec -.-> mid'],
				highlight: ['mid'],
				note: 'For the product manager, in 2 minutes: each community\'s data is fully separate, so a new community is a new database and one more config entry. The price: one search over all communities cannot be one database query, so it takes longer to build.'
			},
			{
				add: ['pent["Penthouse: director, 30 seconds"]', 'mid <-->|elevator| pent', 'dec -.-> pent'],
				highlight: ['pent'],
				note: 'For the director, in 30 seconds: each customer has a separate database, and a page in one community only queries that community\'s database. The cost is more databases to upgrade and run, which is a line in the operations budget.'
			},
			{
				add: [],
				highlight: ['eng', 'mid', 'pent'],
				note: 'Each version keeps **one gain and one cost**. A director who hears only the gain learns about the extra databases later, from someone else. The elevator also goes down: bring back what the penthouse cares about, so the engine room optimizes for it.'
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
			`Lines 1 to 12 and 14 to 20 hold the engine-room fact behind every floor. Each site names **its own \`database\`, its own \`username\` and its own \`host_names\`**. The [developer guide](${DISCOURSE}/docs/developer-guides/docs/02-development-environments/09-multisite-setup.md#L7): "A multisite server uses a different DB and hostname for each site that it serves."`,
			`Check your penthouse claim against code before you make it. A [request spec](${DISCOURSE}/spec/integration/multisite_spec.rb#L10-L33) checks that each known host gets its own site\'s topic, and that an unknown host gets a 404 for a forum page.`,
			`The cost side is in the [migration task](${DISCOURSE}/lib/tasks/db.rake#L112-L187): it loops over every site database and migrates each one. The comment explains the concurrency option: "we have many sites", and it saves "huge amounts of time". One migration per site database is what the director sees as the operations budget line.`,
			'The full sample file has a comment: change the host names and you must restart Sidekiq and rebake the posts. That detail goes in the developer version only.'
		]
	},
	tradeoff: {
		gain: [
			'People who never read the code can understand, fund and defend the one-database-per-site decision.',
			'The PM\'s "wait, so search across communities is hard?" comes up in a planning meeting instead of after a release.',
			'Writing the 30-second version makes you pick one consequence: no customer can see another customer\'s posts.'
		],
		cost: [
			'Three versions take preparation time, and the 30-second one is the hardest to write.',
			'If the director\'s version hides the cost, the director stops trusting you the first time the extra databases cause work.',
			'If the PM hears that cross-community search is easy and the developer hears it is hard, the team ends up with two plans.'
		]
	},
	task: {
		prompt: 'Take yesterday\'s proposal, KEP-4781: the kubelet keeps each pod\'s last status across a restart instead of marking every pod not Ready. Write it for a platform developer (5 lines), a PM (2 lines), a director (1 sentence). Each version must keep one gain and one cost.',
		hint: 'Ask what each person will **do** with your answer. The developer builds and operates it, the PM plans upgrades and support, the director decides whether it matters to customers.',
		answer: [
			'Developer: after a restart, the kubelet keeps the `Started` and `Ready` status of containers that were already running, instead of resetting them to false. A pod that was not Ready before stays not Ready until its probe passes. The `ChangeContainerStatusOnKubeletRestart` gate brings the old behavior back. Cost: a container that broke while the kubelet was down keeps its Ready status until the next probe cycle.',
			'PM: restarting the node agent, for example during an upgrade, no longer takes healthy services out of rotation for a moment. Cost: a service that really broke during that restart is noticed one probe later.',
			'Director: "Routine node maintenance will stop causing brief false outages, at the price of a slightly slower reaction to a real failure in that window. It is the default from Kubernetes 1.35."',
			'Check: same facts in all three? One gain and one cost each? Nothing on the top floor you could not back with a line of the KEP?'
		],
		steps: [
			{
				title: 'Fix the facts first',
				questions: [
					{ q: 'What is the gain of KEP-4781, in one line?', options: ['Pods restart faster after a node upgrade', 'Probes run less often, so nodes use less CPU', 'A kubelet restart no longer marks every pod not Ready', 'Broken containers are found sooner'], answer: 2, why: 'The KEP keeps the last known status instead of resetting it, so healthy pods stay in rotation.' },
					{ q: 'What is the cost, in one line?', options: ['A container that broke while the kubelet was down stays Ready until the next probe cycle', 'Every pod restarts once after the kubelet restarts', 'The kubelet needs more memory', 'Readiness probes no longer work'], answer: 0, why: 'The KEP names this risk itself: traffic can go to a pod reported Ready that is no longer healthy.' },
					{ q: 'Between the three versions, what may change?', options: ['The facts, simplified on each floor', 'The decision, to fit each audience', 'Only the length, with the same detail', 'The detail and the consequence each person acts on'], answer: 3, why: 'Altitude changes words and detail. If the facts change, you have described three decisions.' },
					{ q: 'Before writing, what do you ask about each person?', options: ['How senior they are', 'What they will **do** with your answer', 'How much Kubernetes they know', 'Whether they read the KEP'], answer: 1, why: 'The developer builds and operates it, the PM plans upgrades and support, the director decides if it matters to customers.' }
				]
			},
			{
				title: 'Write the engine-room version',
				questions: [
					{ q: 'What does the developer need that the others do not?', options: ['The mechanism: which status fields are kept, and how to switch it off', 'The budget impact', 'A one-sentence risk summary', 'The release date only'], answer: 0, why: 'People in the engine room build on the mechanism, so they need it spelled out.' },
					{ q: 'Which statuses does the kubelet keep for containers that were already running?', options: ['Only `Ready`', '`Started` and `Ready`', 'Only `Started`', 'All statuses, including restart counts'], answer: 1, why: 'Instead of resetting them to false, the kubelet keeps both for containers that were running.' },
					{ q: 'A pod was not Ready before the restart. What happens to it?', options: ['It becomes Ready, since its status is kept', 'It is restarted', 'It is deleted', 'It stays not Ready until its probe passes'], answer: 3, why: 'Keeping the last status works both ways: not Ready stays not Ready.' },
					{ q: 'What brings the old behavior back?', options: ['Restarting the kubelet twice', 'Removing the readiness probe', 'The `ChangeContainerStatusOnKubeletRestart` gate', 'A flag on each pod'], answer: 2, why: 'The developer needs the off switch, so name the gate.' }
				]
			},
			{
				title: 'Write the PM version',
				questions: [
					{ q: 'Which gain fits the PM, in plain words?', options: ['The kubelet keeps `Started` and `Ready` fields', 'Restarting the node agent, during an upgrade, no longer takes healthy services out of rotation', 'Probes are more accurate', 'Kubernetes 1.35 is faster'], answer: 1, why: 'The PM plans upgrades and support, so the gain is told as what happens to services during an upgrade.' },
					{ q: 'Which cost fits the PM?', options: ['A service that really broke during that restart is noticed one probe later', 'Upgrades take twice as long', 'The feature costs extra licenses', 'Support must restart pods by hand'], answer: 0, why: 'Same cost as the developer\'s, told as what support will see.' },
					{ q: 'Why not give the PM the field names?', options: ['They are secret', 'They change every release', 'They are wrong at that altitude', 'The PM cannot act on them'], answer: 3, why: 'The mechanism is true, but useless for planning. Give the consequence instead.' },
					{ q: 'How long is the PM version?', options: ['One sentence', 'Five lines', 'Two lines', 'A full page'], answer: 2, why: 'The task sets it: 5 lines, 2 lines, 1 sentence, from the engine room up.' }
				]
			},
			{
				title: 'Write the penthouse version and check',
				questions: [
					{ q: 'Which sentence fits the director?', options: ['"The kubelet now keeps container status fields across restarts."', '"Routine node maintenance will stop causing brief false outages, at the price of a slightly slower reaction to a real failure in that window."', '"We follow best practices, so restarts are safe."', '"Node upgrades are now risk-free."'], answer: 1, why: 'One gain and one honest cost, in words a director can act on.' },
					{ q: 'Why keep the cost in the director\'s one sentence?', options: ['A director who hears only the gain learns the cost later, from someone else', 'Directors prefer bad news', 'The template requires it', 'It makes the sentence longer'], answer: 0, why: 'If the top-floor version hides the cost, trust goes the first time the cost shows up.' },
					{ q: 'Which fact can you add, backed by the sources?', options: ['It removes all outages', 'It ships in Kubernetes 2.0', 'It is the default from Kubernetes 1.35', 'It is still only a proposal'], answer: 2, why: 'The change has shipped in Kubernetes 1.35, as the chapter\'s sources show.' },
					{ q: 'What is the last check before you send?', options: ['That each version uses different facts', 'That the director\'s version is the longest', 'That the developer\'s version has no cost', 'Same facts in all three, one gain and one cost each, nothing you cannot back with the KEP'], answer: 3, why: 'The three people will sit in the same meeting one day. The facts must match.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'A director asks: "Can one customer ever see another customer\'s data?" Which answer fits the floor?',
			options: ['It depends on how PostgreSQL isolates rows and schemas internally', 'We follow industry best practices, so the risk is fully covered', 'No, each customer has a separate database. The cost: more databases to run', 'Walk through the connection lookup by host name and the migration task'],
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
			options: ['The detail and the consequence each audience acts on, never the facts', 'The facts, simplified a little more on each floor going up', 'Only the length, with the same detail packed into fewer lines', 'The decision itself, adjusted to what each audience wants to hear'],
			answer: 0,
			why: 'Altitude changes the words and the detail. If the facts change between floors, you have described three decisions, and the three people find out when they sit in the same meeting.'
		}
	],
	recall: {
		q: 'Discourse gives each site its own database. What does the director hear in 30 seconds, and what must match the developer\'s version?',
		a: 'Each customer has a separate database, so no customer sees another\'s posts, and the cost is more databases to upgrade and run. The facts and that one cost must match; the developer also hears that every migration runs once per database.'
	},
	sources: [
		{ title: 'Gregor Hohpe, The Architect Elevator', url: 'https://architectelevator.com/' },
		{ title: 'Gregor Hohpe, The Software Architect Elevator (book)', url: 'https://architectelevator.com/book/' },
		{ title: 'Discourse, config/multisite.yml.production-sample', url: `${DISCOURSE}/config/multisite.yml.production-sample#L1-L28` },
		{ title: 'Discourse, multisite migration task (lib/tasks/db.rake)', url: `${DISCOURSE}/lib/tasks/db.rake#L112-L187` },
		{ title: 'KEP-4781, Restarting kubelet does not change pod status (provisional)', url: KEP },
		{ title: 'Kubernetes v1.35.0, ChangeContainerStatusOnKubeletRestart feature gate', url: 'https://github.com/kubernetes/kubernetes/blob/66452049f3d692768c39c797b21b793dce80314e/pkg/features/kube_features.go#L1189-L1192' }
	]
};
