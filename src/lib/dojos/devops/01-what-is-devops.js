const COMPOSE = 'https://github.com/docker/awesome-compose/blob/30f4b7f6a6c3b0c0ecf4d4efb0de203c48d11562';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'what-is-devops',
	part: 'The DevOps mindset',
	title: 'DevOps is a way of working, not a job title',
	minutes: 10,
	hook: [
		'Friday, 5 p.m. The dev team sends you a tarball and a README that says "deploy to prod". Saturday, 2 a.m., the app falls over. Monday, the developers say **"it works on my machine"**, and you say "it never worked on mine".',
		'Nobody here is lazy or stupid. The devs are paid to ship features. You are paid to keep things up. Most outages come from a change, so **your two goals pull against each other**. Between you stands a wall made of tickets and handoffs.',
		'DevOps is the decision to take that wall down. Not a tool you install, not a team you hire. A way of working where **the people who build the service and the people who run it own it together**.'
	],
	terms: [
		{ term: 'DevOps', def: 'A mix of culture, practices and tools that lets one organization deliver and run software fast and reliably. Dev and ops share the goal instead of passing work over a wall.' },
		{ term: 'Silo', def: 'A team that works for its own goal, with its own tools and words, and talks to other teams only through tickets.' },
		{ term: 'CALMS', def: 'Culture, Automation, Lean, Measurement, Sharing. A checklist to see how far a team has really moved toward DevOps.' },
		{ term: 'You build it, you run it', def: 'The people who write a service also take part in running it, pager included.' },
		{ term: 'DevOps team silo', def: 'The anti-pattern: a new team called "DevOps" placed between dev and ops. It becomes another silo and keeps dev and ops further apart.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: [
					'dev["Dev team: ship features"] -->|"release over the wall"| wall["The wall: tickets and handoffs"]',
					'wall --> ops["Ops team: nothing must break"]'
				],
				highlight: ['dev', 'wall', 'ops'],
				note: 'The classic split. The Google SRE book puts it plainly: devs want to launch, ops want the service not to break while they hold the pager, and **most outages are caused by some kind of change**. The goals are in tension by design.'
			},
			{
				add: [
					'ops --> gate["Change gates: reviews, freeze windows"]',
					'gate -.->|"slows down"| dev'
				],
				highlight: ['gate'],
				note: 'Ops defends the system with gates. Devs learn to route around them: fewer "launches", more small "flag flips". The SRE book calls this **trench warfare**. Both sides are acting rationally, and the service still loses.'
			},
			{
				add: [
					'subgraph shared["Shared ownership"]',
					'code["App, config and deploy steps in one repo"]',
					'pager["One on-call rotation"]',
					'end',
					'dev --> code',
					'ops --> code',
					'dev --> pager',
					'ops --> pager'
				],
				highlight: ['code', 'pager'],
				note: '**Culture** and **Sharing**, the C and the S of CALMS. Dev and ops work on the same files and carry the same pager. When it breaks at 2 a.m., the person who wrote the change is in the room.'
			},
			{
				add: [
					'code --> auto["Automated build, test and deploy"]',
					'auto --> users["Users"]',
					'users -.->|"metrics and incidents"| dev',
					'class users ext'
				],
				highlight: ['auto', 'users'],
				note: '**Automation**, **Lean** and **Measurement**. Machines do the repeatable steps, work moves in small pieces, and numbers from production flow back to the people who can fix the code. The next chapters take each of these in turn.'
			}
		]
	},
	example: {
		title: 'nginx-flask-mysql/compose.yaml',
		repo: 'docker/awesome-compose',
		url: `${COMPOSE}/nginx-flask-mysql/compose.yaml#L1-L41`,
		lang: 'yaml',
		code: `services:
  db:
    # We use a mariadb image which supports both amd64 & arm64 architecture
    image: mariadb:10-focal
…
    restart: always
    healthcheck:
      test: ['CMD-SHELL', 'mysqladmin ping -h 127.0.0.1 --password="$$(cat /run/secrets/db-password)" --silent']
      interval: 3s
      retries: 5
      start_period: 30s
…
  backend:
    build:
      context: backend
      target: builder
    restart: always
…
    depends_on:
      db:
        condition: service_healthy`,
		notes: [
			'This is knowledge an ops person used to keep in a wiki or in their head: start the database first, check it answers, restart things that crash. Here it is **a file in the app repo**, next to the code, changed through the same review. You will learn Compose in part 4.',
			'`condition: service_healthy` tells Compose to wait until the `db` healthcheck passes before it starts `backend` ([Compose docs](https://docs.docker.com/reference/compose-file/services/)). The start order is written down, not remembered.',
			'`restart: always` restarts the container until it is removed. You know this idea from `Restart=always` in a systemd unit. Same intent, now visible to the developer too.',
			'The file is not DevOps. Docker Compose is a tool. **DevOps is that dev and ops both read, change and own this file.** A tool can make sharing easier. It cannot make people share.'
		]
	},
	tradeoff: {
		gain: [
			'Fewer handoffs: a change does not wait in a ticket queue between two teams.',
			'Faster fixes: the person who wrote the change sees the incident and knows where to look.',
			'Fewer surprises: how the app runs is written down in files both sides review, not in one person\'s memory.'
		],
		cost: [
			'Devs have to learn operations and take part in on-call. Ops have to learn Git, code review and some programming.',
			'Culture changes slowly. You cannot buy it, and a reorg alone does not create it.',
			'It is easy to fake: rename the ops team "DevOps team" and you get a new silo with a trendy name.'
		]
	},
	task: {
		prompt: 'Your company announces: "We are doing DevOps. We hired three DevOps engineers into a new DevOps team. They will own CI and all deployments." Devs and ops stay as they are. Using CALMS, say what will probably go wrong and what you would propose instead.',
		hint: 'Count the walls before and after. Then ask who gets paged when a deploy breaks, and who wrote the change.',
		answer: [
			'Before: one wall (dev to ops). After: two walls (dev to DevOps team to ops). This is the **DevOps team silo** anti-pattern described by DevOps Topologies.',
			'**Culture and Sharing** do not move: devs still throw code over a wall, just a different wall. The new team becomes the bottleneck for every release.',
			'**Automation** may improve, but it belongs to one team, so nobody else learns or changes the pipeline.',
			'Proposal: make the new team **temporary**, with a mandate to make itself unnecessary. They build the pipeline with the dev team, pair with ops, then hand ownership back. Devs join the on-call rotation for their own service.',
			'**Measurement**: agree on a few shared numbers for the service (next chapters: DORA metrics), seen by dev and ops alike.'
		]
	},
	quiz: [
		{
			q: 'Which sentence best describes DevOps?',
			options: [
				'A job title for the engineer who maintains the CI server and the deploy scripts',
				'A way of working where dev and ops share ownership of delivering and running the service',
				'A set of tools such as Docker, Jenkins and Kubernetes that a team adopts together',
				'A team placed between developers and operations to handle every deployment'
			],
			answer: 1,
			why: 'DevOps is culture, practices and tools together, aimed at removing the wall between dev and ops. A title, a tool set or an extra team in the middle misses the point.'
		},
		{
			q: 'In CALMS, what does the L stand for?',
			options: ['Lean', 'Linux', 'Logging', 'Load balancing'],
			answer: 0,
			why: 'Culture, Automation, Lean, Measurement, Sharing. Lean is about small steps, removing waste and continuous improvement.'
		},
		{
			q: 'According to the Google SRE book, why are the goals of a classic dev team and a classic ops team in tension?',
			options: [
				'Because ops teams run a different operating system than the one devs build on',
				'Because developers rarely write tests, so ops must catch every bug in production',
				'Because most outages are caused by some kind of change, and devs are paid to make changes',
				'Because ops teams are larger than dev teams, so they win every priority call'
			],
			answer: 2,
			why: 'Devs want to launch features, ops want the service not to break. Since change is the main cause of outages, each side\'s goal works against the other\'s.'
		}
	],
	takeaway: 'DevOps is not a tool or a title. It is dev and ops owning one service together, with Culture, Automation, Lean, Measurement and Sharing as the checklist.',
	sources: [
		{ title: 'AWS, What is DevOps?', url: 'https://aws.amazon.com/devops/what-is-devops/' },
		{ title: 'Atlassian, CALMS framework', url: 'https://www.atlassian.com/devops/frameworks/calms-framework' },
		{ title: 'Google SRE book, Introduction (the sysadmin approach and its costs)', url: 'https://sre.google/sre-book/introduction/' },
		{ title: 'DevOps Topologies, anti-types and team types', url: 'https://web.devopstopologies.com/' },
		{ title: 'Docker docs, Compose file services reference', url: 'https://docs.docker.com/reference/compose-file/services/' }
	]
};
