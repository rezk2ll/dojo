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
		],
		steps: [
			{
				title: 'Ask, then assume',
				questions: [
					{ q: 'You start the timer. What is the first thing on your sheet?', options: ['The containers sketch', 'The questions you would ask the customer', 'The database choice', 'The 30-second pitch'], answer: 1, why: 'The rules say "When in doubt, ask." Two minutes of questions and assumptions come before any box.' },
					{ q: 'Which question is worth asking for this brief?', options: ['Which logo color the families prefer', 'Whether to use tabs or spaces', 'Are videos in scope, and how big?', 'How many stars the repo should get'], answer: 2, why: 'Videos change storage, upload and archive size, so the answer changes the design.' },
					{ q: 'Which question probes the tension between the two deployments?', options: ['Can a self-hosted family invite someone on the hosted service?', 'Which phone models do grandparents use?', 'Should the logo be round?', 'Which font should the album use?'], answer: 0, why: 'Home and hosted are separate installs. Whether an invite crosses between them changes the boundary you draw.' },
					{ q: 'Alone, who plays the moderator?', options: ['Nobody: you skip that step', 'A random brief generator', 'The first reader of your sheet', 'You: you write the questions down instead'], answer: 3, why: 'The moderator plays everybody except you. Alone, the written questions take that role.' }
				]
			},
			{
				title: 'Pick three characteristics',
				questions: [
					{ q: 'Which line of the brief drives data isolation?', options: ['"One family\'s photos must never be visible to another family"', '"A team of four developers"', '"Download everything as an archive"', '"Upload from a phone"'], answer: 0, why: 'That sentence is a hard rule, so isolation goes in the top three.' },
					{ q: 'Why is deployability in the top three?', options: ['Because every kata needs it', 'Because ten microservices need it', 'Because uploads are slow', 'The same code must run on one small home server and as a hosted service'], answer: 3, why: 'Two very different sizes from one codebase is the brief\'s unusual demand.' },
					{ q: 'Why is cost efficiency there?', options: ['The brief sets a budget in euros', 'Four developers, and photos take a lot of storage', 'Families pay per photo', 'Hosting is free'], answer: 1, why: 'A small team and heavy storage make cost a real driver, not a nice-to-have.' },
					{ q: 'Which scenario has the number the step asks for?', options: ['"The app should feel fast for grandparents."', '"The system scales to a billion users."', '"A grandparent on a slow phone connection sees the first thumbnail in under 3 seconds."', '"Photos load quickly."'], answer: 2, why: 'A scenario names who, what, and a number you can test. The others are wishes.' }
				]
			},
			{
				title: 'Sketch it and find the door',
				questions: [
					{ q: 'Which boxes sit outside the album on the context diagram?', options: ['Mail for invites, push notifications, object storage if hosted', 'The database and the web server', 'Kubernetes and a service mesh', 'The four developers'], answer: 0, why: 'A context diagram shows the system as one box with its people and external systems.' },
					{ q: 'On the context diagram, where does the invited relative go?', options: ['Inside the album box', 'Outside the box, as a person next to the family members', 'Nowhere: they are not a user', 'Inside the mail box, since the invite is an email'], answer: 1, why: 'A context diagram shows the people around the system. The relative uses the album, so they are a person there, even with access to one album only.' },
					{ q: 'Which decision is the one-way door?', options: ['The thumbnail size', 'The push notification provider', 'The archive format', 'How families are separated: a database per family or shared tables with a family id'], answer: 3, why: 'Day 13\'s tenancy models. Changing it later means moving every family\'s data.' },
					{ q: 'The invited relative from outside crosses that boundary. What follows?', options: ['Sharing with them must be a feature you design on purpose', 'They become a member of the family', 'They get read access to all albums', 'They need their own home server'], answer: 0, why: 'This is the brief\'s tension: "never visible" versus "invite from outside". Design the crossing explicitly.' }
				]
			},
			{
				title: 'Pitch and score it',
				questions: [
					{ q: 'How do you write the ADR for the one-way door?', options: ['As a full page of pros and cons', 'As a Y-statement, cost included', 'As a list of technologies', 'As a diagram only'], answer: 1, why: 'Days 4 and 5: one Y-statement that names the choice and what it costs.' },
					{ q: 'Like the director version on day 39, what must the pitch keep?', options: ['Every container name', 'Only the gain', 'One gain and one cost', 'The project timeline'], answer: 2, why: 'A pitch with only the gain hides the price of the one-way door. The director hears the cost later, from someone else.' },
					{ q: 'Alone, nobody votes on your sheet. What do you do instead?', options: ['Give yourself a thumbs up', 'Skip the score', 'Redo the kata until it feels right', 'Show it to one person, or compare it with a real system you know'], answer: 3, why: 'Without a vote you cannot see your blind spots, so borrow one outside reader or one real design to check against.' },
					{ q: 'What does a thumbs up need?', options: ['The confidence you could produce the diagrams given time', 'Finished diagrams for every container', 'A working prototype', 'Support for a billion users'], answer: 0, why: 'The rules say up does not need finished diagrams, only that confidence.' }
				]
			}
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
