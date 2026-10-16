/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'first-kata',
	part: "The architect's job",
	title: 'Your first kata: a whole design in 15 minutes',
	minutes: 15,
	hook: [
		'Ted Neward asked an uncomfortable question. "So how are we supposed to get great architects, if they only get the chance to architect fewer than a half-dozen times in their career?" A real system takes years. You cannot learn from six of them.',
		'His answer is the **architectural kata**: a short made-up brief, a timebox, a small group designs on paper, presents, and the others vote. The rules say the moderator plays "everybody except you": customer, boss, project manager, ops.',
		'Today you run your first one **alone, on paper, in 15 minutes**. No new theory. Every step uses a day you already did.'
	],
	terms: [
		{ term: 'Kata', def: 'A practice brief: a description, the users, the requirements, some extra context. Small enough to sketch in one sitting.' },
		{ term: 'Moderator', def: 'Answers your questions as the customer, the boss and ops. Alone, you write the questions down instead.' },
		{ term: 'Assumption', def: 'The rules allow assumptions about technologies you do not know well, as long as you define them clearly when you present. Bad assumptions, never checked with the customer, earn a thumbs down.' },
		{ term: 'Peer vote', def: 'Thumbs up, "meh" or down. Up does not need finished diagrams, only the confidence you could produce them given time.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['brief["The brief"] --> ask["Questions and assumptions, 2 min"]'],
				highlight: ['brief', 'ask'],
				note: 'Read the brief once. Write the questions you would ask the customer, and the assumptions you will make if nobody answers. The rules say: "When in doubt, ask."'
			},
			{
				add: ['ask --> chars["Top 3 characteristics, one scenario, 3 min"]'],
				highlight: ['chars'],
				note: 'Days 2 and 3. Pick **three** characteristics, no more, each with a why from the brief. Turn the most important one into a scenario with a number.'
			},
			{
				add: ['chars --> ctx["Context diagram, 3 min"]', 'ctx --> sketch["Containers sketch, 4 min"]'],
				highlight: ['ctx', 'sketch'],
				note: 'Days 6 and 7. Your system as one box with its people and external systems. Then the containers that run inside it, and where the data lives.'
			},
			{
				add: ['sketch --> adr["One ADR for the one-way door, 2 min"]'],
				highlight: ['adr'],
				note: 'Days 4 and 5. Find the decision that is most expensive to undo and write it as a Y-statement, cost included.'
			},
			{
				add: ['adr --> pitch["30-second pitch, 1 min"]', 'pitch --> vote["Vote: up, meh, down"]'],
				highlight: ['pitch', 'vote'],
				note: 'Day 39: say it from the penthouse. Then score yourself as a peer would. Down means the team "made major assumptions that you think had no validity" or "never asked the customer any questions".'
			}
		]
	},
	tradeoff: {
		gain: [
			'Dozens of designs a year instead of a handful a career. Judgment comes from reps.',
			'Failing costs nothing: no users, no data, no money.',
			'It trains the two habits real reviews punish most: asking questions and stating assumptions.'
		],
		cost: [
			'Made-up briefs have no politics, no legacy and no existing team. Real systems have all three.',
			'Alone, nobody votes. Show your sheet to one person, or compare it with a real system you know.',
			'It is easy to slip into interview-style "scale to a billion users" instead of what the brief actually asks.'
		]
	},
	task: {
		prompt: 'Set a 15-minute timer and do this kata on one sheet of paper. **Family Album.** A shared photo album for families. Users: 10,000 families of 2 to 15 people, from kids to grandparents. Requirements: upload from a phone. The family sees a new photo within a minute. Invite one relative from outside the family to a single album. Download everything as an archive. Additional context: it must run on one small home server for a single family, and as a hosted service for the 10,000. A team of four developers. One family\'s photos must never be visible to another family.',
		hint: 'Follow the diagram timeboxes: 2, 3, 3, 4, 2, 1 minutes. The tension in this brief is between "never visible to another family" and "invite a relative from outside". Look for the one-way door there.',
		answer: [
			'**Questions** written down, for example: are videos in scope, and how big? Can a self-hosted family invite someone on the hosted service? Who pays for storage?',
			'**Three characteristics** with a why. Data isolation (the "never visible" line). Deployability from one small box to a hosted service (same code, two sizes). Cost efficiency (four devs, photos are heavy). Performance at 10,000 families is not a top driver.',
			'**One scenario with a number**, for example: a grandparent on a slow phone connection opens a new photo, the first thumbnail shows in under 3 seconds.',
			'**Context diagram**: the album as one box; family members and the invited relative; external boxes for mail (invites), push notifications, and object storage if hosted.',
			'**The one-way door**: how families are separated. A database per family versus shared tables with a family id (day 13\'s tenancy models). The outside relative crosses that boundary, so sharing is a deliberate feature, not a query.',
			'**Assumptions stated** out loud. Thumbs-down traps: Kubernetes and ten microservices for a home server, no questions asked, ignoring self-hosting.'
		]
	},
	quiz: [
		{
			q: 'According to the kata rules, what earns a **thumbs down**?',
			options: ['Major assumptions with no validity, and never asking the customer questions', 'Diagrams that are not finished', 'Choosing a database or framework that none of the voters has ever used in production', 'A presentation shorter than five minutes'],
			answer: 0,
			why: 'The rules say thumbs up does not need finished diagrams, only the confidence you could produce them. What sinks a team is guessing without asking.'
		},
		{
			q: 'The brief says "one small home server" **and** "hosted for 10,000 families". Which earlier idea fits best?',
			options: ['One microservice per feature', 'A stateless app that runs as one copy on one box, or as many copies behind a load balancer', 'One shared database for every family', 'A different codebase for each deployment'],
			answer: 1,
			why: 'Keep the state in the database and storage, not in the app. Then the same code runs as one copy at home or as many copies in the hosted service. The other options either break isolation or double the work.'
		},
		{
			q: 'You do not know whether videos are in scope. What do the rules say?',
			options: ['Assume no and say nothing', 'Design for 8K video to be safe', 'Drop the upload requirement', 'Ask the moderator, and if you assume, state the assumption clearly when you present'],
			answer: 3,
			why: '"When in doubt, ask." The Moderator speaks for the customer. If you still have to assume, say so when you present: never asking and getting burned by a bad assumption earns a thumbs down.'
		}
	],
	takeaway: 'Architects grow by designing often. A kata is a whole design in 15 minutes: ask, pick three, draw, decide one door, pitch.',
	sources: [
		{ title: 'Architectural Katas (Ted Neward)', url: 'https://www.architecturalkatas.com/' },
		{ title: 'Architectural Katas, Rules (Ted Neward)', url: 'https://www.architecturalkatas.com/rules.html' },
		{ title: 'Neal Ford, Architectural Katas (with a random brief generator)', url: 'https://nealford.com/katas/' },
		{ title: 'The Kata Log, winners and finalists of the O\'Reilly architecture katas', url: 'https://github.com/TheKataLog' }
	]
};
