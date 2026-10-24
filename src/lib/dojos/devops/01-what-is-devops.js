const COMPOSE = 'https://github.com/docker/awesome-compose/blob/30f4b7f6a6c3b0c0ecf4d4efb0de203c48d11562';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'what-is-devops',
	part: 'The DevOps mindset',
	title: 'What DevOps is: dev and ops owning one service',
	minutes: 10,
	hook: [
		'Friday, 5 p.m. The dev team sends you a tarball and a README that says "deploy to prod". Saturday, 2 a.m., the app falls over. Monday, the developers say "it works on my machine", and you say "it never worked on mine".',
		'Both teams do their job. The devs are paid to ship features, and you are paid to keep things up. Most outages come from a change, so **each team\'s goal works against the other\'s**. Between you stands a wall made of tickets and handoffs.',
		'DevOps removes that wall. You do not install it and you do not hire it. The people who build the service and the people who run it own it together.'
	],
	terms: [
		{ term: 'DevOps', def: 'A mix of culture, practices and tools that lets one organization deliver and run software fast and reliably. Dev and ops share the goal instead of passing work over a wall.' },
		{ term: 'Silo', def: 'A team that works for its own goal, with its own tools and words, and talks to other teams only through tickets.' },
		{ term: 'CALMS', def: 'Culture, Automation, Lean, Measurement, Sharing. A checklist to see how far a team has really moved toward DevOps.' },
		{ term: 'DevOps team silo', def: 'The anti-pattern: a new team called "DevOps" placed between dev and ops. It adds a second wall and keeps dev and ops further apart.' }
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
				note: 'The classic split. The Google SRE book: devs want to launch, ops want the service not to break while they hold the pager, and **most outages are caused by some kind of change**. So each team is paid for a goal that works against the other team\'s goal.'
			},
			{
				add: [
					'ops --> gate["Change gates: reviews, freeze windows"]',
					'gate -.->|"slows down"| dev'
				],
				highlight: ['gate'],
				note: 'Ops defends the system with gates. Devs learn to route around them: fewer "launches", more small "flag flips". The SRE book calls this trench warfare. Each side acts sensibly for its own goal, and the service still breaks or ships late.'
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
				note: 'This step is Culture and Sharing, the C and the S of CALMS. Dev and ops work on the same files and carry the same pager. When it breaks at 2 a.m., the person who wrote the change is in the room.'
			},
			{
				add: [
					'code --> auto["Automated build, test and deploy"]',
					'auto --> users["Users"]',
					'users -.->|"metrics and incidents"| dev',
					'class users ext'
				],
				highlight: ['auto', 'users'],
				note: 'This step is Automation, Lean and Measurement. Machines do the repeatable steps, work moves in small pieces, and numbers from production flow back to the people who can fix the code. The next chapters take each of these in turn.'
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
			'An ops person used to keep these rules in a wiki or in their head: start the database first, check it answers, restart things that crash. Here they sit in **a file in the app repo**, next to the code, changed through the same review. You will learn Compose in part 4.',
			'Lines 19 to 21: `condition: service_healthy` tells Compose to wait until the `db` healthcheck on lines 7 to 11 passes before it starts `backend` ([Compose docs](https://docs.docker.com/reference/compose-file/services/)). Nobody has to remember the start order.',
			'Lines 6 and 17: `restart: always` restarts the container until it is removed. You know this from `Restart=always` in a systemd unit. Here the developer sees the setting too.',
			'Docker Compose is a tool, and installing it changes no team. The DevOps part is that **dev and ops both read, change and own this file**.'
		]
	},
	tradeoff: {
		gain: [
			'A change does not wait in a ticket queue between two teams.',
			'The person who wrote the change sees the incident and knows where to look.',
			'How the app runs is written in files both sides review, like `compose.yaml`, so nobody depends on one person\'s memory.'
		],
		cost: [
			'Devs have to learn operations and take part in on-call. Ops have to learn Git, code review and some programming.',
			'A reorg or a tool purchase alone does not change how people work, and people change their habits slowly.',
			'Renaming the ops team "DevOps team" gives you a new silo with a new name.'
		]
	},
	task: {
		prompt: 'Your company announces: "We are doing DevOps. We hired three DevOps engineers into a new DevOps team. They will own CI and all deployments." Devs and ops stay as they are. Using CALMS, say what will probably go wrong and what you would propose instead.',
		hint: 'Count the walls before and after. Then ask who gets paged when a deploy breaks, and who wrote the change.',
		answer: [
			'Before: one wall (dev to ops). After: two walls (dev to DevOps team to ops). DevOps Topologies calls this the **DevOps team silo** anti-pattern.',
			'Culture and Sharing: nothing changes. Devs still throw code over a wall, just a different one. Every release now waits on the new team.',
			'Automation: the pipeline may improve, but it belongs to one team, so nobody else learns or changes it.',
			'Proposal: make the new team **temporary**, with a mandate to make itself unnecessary. They build the pipeline with the dev team, pair with ops, then hand ownership back. Devs join the on-call rotation for their own service.',
			'Measurement: agree on a few shared numbers for the service (next chapters: DORA metrics), seen by dev and ops alike.'
		],
		steps: [
			{
				title: 'Count the walls',
				questions: [
					{ q: 'Before the announcement, how many walls stand between writing a change and running it?', options: ['None', 'One: dev to ops', 'Two: dev to CI, CI to ops', 'Three: one per team'], answer: 1, why: 'The classic split has one wall, made of tickets and handoffs, between the dev team and the ops team.' },
					{ q: 'After the new DevOps team takes over CI and all deployments, how many walls are there?', options: ['One, because the new team replaces the old wall', 'None, because the company now does DevOps', 'Two: dev to DevOps team, DevOps team to ops', 'Three: dev, DevOps team and ops each wall off CI'], answer: 2, why: 'Devs and ops stay as they are, and a new team sits between them. That adds a second wall.' },
					{ q: 'What does DevOps Topologies call this setup?', options: ['The DevOps team silo anti-pattern', 'A platform team', 'Shared ownership', 'The SRE model'], answer: 0, why: 'A new team called "DevOps" placed between dev and ops is the **DevOps team silo** anti-pattern.' },
					{ q: 'A deploy breaks at 2 a.m. Under the new plan, who is most likely missing from the room?', options: ['The DevOps team, who own deployments', 'The ops team, who run the servers', 'The on-call manager', 'The developer who wrote the change'], answer: 3, why: 'Devs still hand code over a wall and do not carry the pager, so the person who knows the change is not there.' }
				]
			},
			{
				title: 'Check Culture and Sharing',
				questions: [
					{ q: 'What does CALMS stand for?', options: ['Code, Automation, Linux, Monitoring, Security', 'Culture, Automation, Lean, Measurement, Sharing', 'Culture, Agile, Logging, Metrics, Support', 'CI, Automation, Lean, Monitoring, Sharing'], answer: 1, why: 'Culture, Automation, Lean, Measurement, Sharing: a checklist of how far a team has really moved toward DevOps.' },
					{ q: 'For Culture and Sharing, what changes for the devs under the new plan?', options: ['They now own their deployments', 'They join the on-call rotation', 'Nothing: they still throw code over a wall, just a different one', 'They review the ops team\'s config'], answer: 2, why: 'The devs\' habits stay the same. Only the team on the other side of the wall has a new name.' },
					{ q: 'What happens to every release once one team owns all deployments?', options: ['It waits on the new team', 'It ships faster, because experts do it', 'It skips review', 'It goes straight from dev to ops'], answer: 0, why: 'All deployments go through three people, so each release queues behind their tickets.' },
					{ q: 'Why does hiring a team not by itself change how people work?', options: ['Because DevOps engineers are too expensive to keep', 'Because a reorg or a tool purchase alone leaves habits in place', 'Because only ops can change culture', 'Because CALMS forbids new teams'], answer: 1, why: 'The chapter\'s trade-off: a reorg or a tool purchase alone does not change how people work, and habits change slowly.' }
				]
			},
			{
				title: 'Check Automation and Measurement',
				questions: [
					{ q: 'The new team builds a much better pipeline. What is the catch?', options: ['Pipelines cannot be automated', 'It slows the devs down by design', 'It belongs to one team, so nobody else learns or changes it', 'It replaces the need for tests'], answer: 2, why: 'Automation owned by one team is another silo: the others cannot read, change or fix it.' },
					{ q: 'In the shared ownership picture, where do the deploy steps live?', options: ['In one repo with the app and its config', 'In the DevOps team\'s private wiki', 'In the ops team\'s heads', 'In a ticket template'], answer: 0, why: 'App, config and deploy steps sit in one repo, changed through the same review, like the `compose.yaml` in the example.' },
					{ q: 'Which Measurement step does the chapter propose?', options: ['Count how many tickets each team closes', 'Measure each team against its own goal', 'Track the DevOps team\'s headcount', 'A few shared numbers for the service, seen by dev and ops alike'], answer: 3, why: 'Shared numbers (DORA metrics, in the next chapters) give both sides the same goal instead of opposite ones.' },
					{ q: 'In the diagram, where do metrics and incidents from users flow back to?', options: ['The change gate', 'The developers, who can fix the code', 'Only the ops team', 'The DevOps team'], answer: 1, why: 'Numbers from production flow back to the people who can fix the code.' }
				]
			},
			{
				title: 'Propose something better',
				questions: [
					{ q: 'What should happen to the new DevOps team?', options: ['Make it permanent and give it more people', 'Merge it into the ops team', 'Make it temporary, with a mandate to make itself unnecessary', 'Disband it before it starts'], answer: 2, why: 'A temporary team can build the pipeline with the others, then hand ownership back.' },
					{ q: 'How should that team work while it exists?', options: ['Build the pipeline with the dev team and pair with ops', 'Build the pipeline alone, then train everyone at the end', 'Take over on-call so devs can focus', 'Approve every deploy by hand'], answer: 0, why: 'Building together means the knowledge stays with dev and ops when the team hands back ownership.' },
					{ q: 'Who joins the on-call rotation for a service?', options: ['Only the DevOps team', 'Only ops, as before', 'A separate incident team', 'The devs who build that service, alongside ops'], answer: 3, why: 'One on-call rotation means the person who wrote the change sees the incident and knows where to look.' },
					{ q: 'What is the cost of this proposal for the devs?', options: ['They lose access to production', 'They have to learn operations and take part in on-call', 'They stop writing features', 'They must move to the ops team'], answer: 1, why: 'Shared ownership has a price: devs learn ops and carry the pager, ops learn Git and code review.' }
				]
			}
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
			why: 'DevOps is culture, practices and tools together, aimed at removing the wall between dev and ops. A title or a tool set leaves the wall in place, and an extra team in the middle adds a second wall.'
		},
		{
			q: 'In CALMS, what does the L stand for?',
			options: ['Lean', 'Linux', 'Logging', 'Load balancing'],
			answer: 0,
			why: 'Culture, Automation, Lean, Measurement, Sharing. Lean means working in small steps, removing waste and improving all the time.'
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
	recall: {
		q: 'What do the five letters of CALMS stand for, and what goes wrong when a company adds a "DevOps team" between dev and ops?',
		a: 'Culture, Automation, Lean, Measurement, Sharing. The new team adds a second wall (dev to DevOps team to ops), the DevOps team silo anti-pattern.'
	},
	sources: [
		{ title: 'AWS, What is DevOps?', url: 'https://aws.amazon.com/devops/what-is-devops/' },
		{ title: 'Atlassian, CALMS framework', url: 'https://www.atlassian.com/devops/frameworks/calms-framework' },
		{ title: 'Google SRE book, Introduction (the sysadmin approach and its costs)', url: 'https://sre.google/sre-book/introduction/' },
		{ title: 'DevOps Topologies, anti-types and team types', url: 'https://web.devopstopologies.com/' },
		{ title: 'Docker docs, Compose file services reference', url: 'https://docs.docker.com/reference/compose-file/services/' }
	]
};
