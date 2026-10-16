/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'first-kata',
	part: "The architect's job",
	title: 'Your first kata: a whole design in 15 minutes',
	minutes: 15,
	hook: [
		'Ted Neward asked: "So how are we supposed to get great architects, if they only get the chance to architect fewer than a half-dozen times in their career?" A real system takes years, so an architect designs about six of them in a career.',
		'His answer is the **architectural kata**: a short made-up brief, a timebox, a small group designs on paper, presents, and the others vote. The rules say the moderator plays "everybody except you": customer, boss, project manager, ops.',
		'You run this first one **alone, on paper, in 15 minutes**. Each step uses a day you already did, with no new theory.'
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
				note: 'Day 39: pitch it as you would to a director, in 30 seconds. Then score yourself as a peer would. Down means the team "made major assumptions that you think had no validity" or "never asked the customer any questions".'
			}
		]
	},
	tradeoff: {
		gain: [
			'At 15 minutes each, you can do dozens of designs a year instead of about six in a career.',
			'A bad kata design reaches no users, loses no data and costs no money.',
			'Each kata makes you practice the two habits real reviews punish most when they are missing: asking questions and stating assumptions.'
		],
		cost: [
			'A made-up brief has no politics, no legacy code and no existing team, and every real system has them.',
			'Alone, you get no vote, so show your sheet to one person, or compare it with a real system you know.',
			'It is easy to slip into interview-style "scale to a billion users" instead of what the brief actually asks.'
		]
	},
	task: {
		prompt: 'Set a 15-minute timer and do this kata on one sheet of paper. **Family Album.** A shared photo album for families. Users: 10,000 families of 2 to 15 people, from kids to grandparents. Requirements: upload from a phone. The family sees a new photo within a minute. Invite one relative from outside the family to a single album. Download everything as an archive. Additional context: it must run on one small home server for a single family, and as a hosted service for the 10,000. A team of four developers. One family\'s photos must never be visible to another family.',
		hint: 'Follow the diagram timeboxes: 2, 3, 3, 4, 2, 1 minutes. The tension in this brief is between "never visible to another family" and "invite a relative from outside". Look for the one-way door there.',
		answer: [
			'Questions, written down, for example: are videos in scope, and how big? Can a self-hosted family invite someone on the hosted service? Who pays for storage?',
			'Three characteristics, each with a why: data isolation (the "never visible" line), deployability from one small box to a hosted service (same code, two sizes), and cost efficiency (four devs, and photos take a lot of storage). Performance at 10,000 families is not a top driver.',
			'One scenario with a number, for example: a grandparent on a slow phone connection opens a new photo, and the first thumbnail shows in under 3 seconds.',
			'Context diagram: the album as one box; family members and the invited relative; external boxes for mail (invites), push notifications, and object storage if hosted.',
			'The one-way door: how families are separated. A database per family versus shared tables with a family id (day 13\'s tenancy models). The outside relative crosses that boundary, so sharing with them must be a feature you design on purpose.',
			'Assumptions, stated out loud when you present. Thumbs-down traps: Kubernetes and ten microservices for a home server, no questions asked, ignoring self-hosting.'
		]
	},
	quiz: [
		{
			q: 'According to the kata rules, what earns a **thumbs down**?',
			options: ['Major assumptions with no validity, and never asking the customer questions', 'Diagrams that are not finished', 'Choosing a database or framework that none of the voters has ever used in production', 'A presentation shorter than five minutes'],
			answer: 0,
			why: 'The rules say thumbs up does not need finished diagrams, only the confidence you could produce them. A team that guesses without asking the customer gets the thumbs down.'
		},
		{
			q: 'The brief says "one small home server" **and** "hosted for 10,000 families". Which earlier idea fits best?',
			options: ['One microservice per feature, so each part scales on its own in the hosted service', 'A stateless app that runs as one copy on one box, or as many copies behind a load balancer', 'One shared database for every family, so the hosted service stays simple to run', 'A different codebase for each deployment, one tuned for the home and one for hosting'],
			answer: 1,
			why: 'Keep the state in the database and storage, not in the app. Then the same code runs as one copy at home or as many copies in the hosted service. The other options either break isolation or double the work.'
		},
		{
			q: 'You do not know whether videos are in scope. What do the rules say?',
			options: ['Assume no, leave videos out of the design, and keep that choice to yourself', 'Design for 8K video to be safe, since over-building is never marked down', 'Drop the upload requirement, since the brief does not say which files count', 'Ask the moderator, and if you still assume, state it clearly when you present'],
			answer: 3,
			why: '"When in doubt, ask." The Moderator speaks for the customer. If you still have to assume, say so when you present: never asking and getting burned by a bad assumption earns a thumbs down.'
		}
	],
	recall: {
		q: 'What are the steps of a 15-minute kata, and what earns a thumbs down?',
		a: 'Questions and assumptions (2 min), three characteristics and one scenario (3), a context diagram (3), a containers sketch (4), one ADR for the one-way door (2), and a 30-second pitch (1). A thumbs down comes from major assumptions with no validity, or from never asking the customer questions.'
	},
	sources: [
		{ title: 'Architectural Katas (Ted Neward)', url: 'https://www.architecturalkatas.com/' },
		{ title: 'Architectural Katas, Rules (Ted Neward)', url: 'https://www.architecturalkatas.com/rules.html' },
		{ title: 'Neal Ford, Architectural Katas (with a random brief generator)', url: 'https://nealford.com/katas/' },
		{ title: 'The Kata Log, winners and finalists of the O\'Reilly architecture katas', url: 'https://github.com/TheKataLog' }
	]
};
