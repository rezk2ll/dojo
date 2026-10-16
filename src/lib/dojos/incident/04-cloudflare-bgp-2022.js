const PM = 'https://blog.cloudflare.com/cloudflare-outage-on-june-21-2022/';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'cloudflare-bgp-2022',
	part: 'Changes and config',
	title: 'Cloudflare 2022: the BGP policy change that took 19 data centers offline',
	minutes: 10,
	hook: [
		'Tuesday 21 June 2022, 06:27 UTC. You are a network engineer at Cloudflare. Since 03:56, a change to the BGP prefix advertisement policies has been rolling out, location by location. So far no location has had a problem.',
		'At 06:27 the rollout reaches the spines of the Multi-Colo PoP (MCP) data centers. Within moments, all 19 of them go offline: Amsterdam, Ashburn, Frankfurt, London, Singapore, Tokyo and 13 more.',
		'These 19 locations are 4% of Cloudflare\'s network. The graph of successful HTTP requests worldwide drops by half.'
	],
	terms: [
		{ term: 'Prefix', def: 'A range of adjacent IP addresses that a network advertises to its peers over BGP. A prefix that is no longer advertised is "withdrawn" and cannot be reached.' },
		{ term: 'MCP', def: 'Multi-Colo PoP, the architecture of Cloudflare\'s 19 busiest data centers. A layer of routers called spines connects the parts of each data center as a mesh.' },
		{ term: 'Policy term', def: 'One named rule inside a BGP policy. The router evaluates the terms in order, and the first one that accepts or rejects a prefix decides.' },
		{ term: 'Multimog', def: 'Cloudflare\'s internal load balancer in MCP data centers, a variant of Unimog. It spreads requests across the servers of a data center.' }
	],
	incident: {
		org: 'Cloudflare',
		title: 'Cloudflare outage on June 21, 2022',
		date: '2022-06-21',
		url: PM,
		steps: [
			{
				situation: [
					'The 19 MCP locations went offline at 06:27, the moment the policy change reached their spines. The same change has run on other locations since 03:56 with no impact.',
					'Visitors near those cities cannot reach sites behind Cloudflare. Elsewhere, Cloudflare works normally.'
				],
				q: 'What do you do first?',
				options: [
					'Turn on DDoS protection in the 19 locations',
					'Declare an incident and suspect the change on the spines',
					'Wait for BGP to move the traffic to other locations',
					'Restart the servers in the 19 data centers'
				],
				answer: 1,
				why: 'An internal incident was declared at 06:32. The timing points at the change: the outage began when it reached the MCP spines. Cloudflare: "This was our error and not the result of an attack or malicious activity."'
			},
			{
				situation: [
					'You try to log in to the routers in the affected locations. You cannot reach them. The withdrawn prefixes include the site-local prefixes that give Cloudflare direct access to each location.'
				],
				q: 'How do you get to the routers?',
				options: [
					'Wait until the prefixes come back by themselves',
					'Ask a transit provider to announce the prefixes for you',
					'Use the backup procedures to take control of the locations',
					'Push a fix to the spines through the rollout tool'
				],
				answer: 2,
				why: 'Cloudflare: "We have backup procedures for handling such an event and used them to take control of the affected locations." The withdrawal also made it harder for engineers to reach the locations to revert the change.'
			},
			{
				situation: [
					'You are on a spine router in one location. You think the policy change caused the outage, but you have not proved it yet.'
				],
				q: 'What is your next move?',
				options: [
					'Change one router to confirm the root cause',
					'Revert the change on all 19 locations at once by script',
					'Roll back every network change made this week',
					'Read the whole diff with two reviewers first'
				],
				answer: 0,
				why: 'At 06:51 the first change was made on a router "to verify the root cause". At 06:58 the root cause was "found and understood", and the reverts began. The check on one router took 7 minutes.'
			},
			{
				situation: [
					'Since 06:58, several engineers are reverting the change across the 19 locations. Some locations come back. Then the problem appears again, at random, in places that were already fixed.'
				],
				q: 'What do you check?',
				options: [
					'Whether peers are now rejecting your routes',
					'Whether another attack started during the revert',
					'Whether the routers are running out of memory',
					'Whether engineers are undoing each other\'s reverts'
				],
				answer: 3,
				why: 'The reverts were "delayed as network engineers walked over each other\'s changes, reverting the previous reverts, causing the problem to re-appear sporadically." The last revert was done at 07:42, 44 minutes after the root cause was found.'
			},
			{
				situation: [
					'The incident closes at 08:00. The change had a Change Request ticket, a dry run, a stepped rollout and peer review by several engineers. The stepped rollout reached an MCP location only in its final step.'
				],
				q: 'What do you change in the rollout process?',
				options: [
					'Add a third peer reviewer to every network change',
					'Move the 19 locations back to the old architecture',
					'Put an MCP site early in the steps and add commit-confirm',
					'Run the dry run twice before each network change'
				],
				answer: 2,
				why: 'Cloudflare will enforce "an improved stagger policy" and add an automated "commit-confirm" rollback. It wrote that the first "would have significantly lessened the overall impact" and the second "would have greatly reduced the Time-to-Resolve".'
			}
		],
		outcome: [
			'The change added BGP communities to site-local prefixes. On the spines, the diff also reordered the terms of the `AGGREGATES-OUT` policy. `4-ADV-SITE-LOCALS` and `6-ADV-SITE-LOCALS` moved below `REJECT-THE-REST`, a term that does `then reject`, so the spines stopped advertising the site-local prefixes.',
			'Without those prefixes, Cloudflare servers could not reach customer origins, and engineers lost direct access to the locations. Multimog, the internal load balancer, could not forward requests between servers in an MCP. Small compute clusters got as much traffic as the largest ones and overloaded.',
			'The outage lasted from 06:27 to 07:42 UTC. The 19 locations are 4% of the network, but the outage hit 50% of total requests.',
			'Cloudflare listed three fixes. Rollouts will get MCP specific test and deploy steps. The policy statement will be redesigned to prevent an unintentional incorrect ordering. Automation will enforce a better stagger policy and add a "commit-confirm" rollback.'
		]
	},
	quiz: [
		{
			q: 'The 19 MCP locations are 4% of Cloudflare\'s network. Why did their outage hit 50% of all requests?',
			options: [
				'The other locations sent their traffic to the MCP sites first',
				'They are the busiest locations and carry much of the traffic',
				'The withdrawn prefixes also covered every other location',
				'Each request passes through two MCP sites on its way'
			],
			answer: 1,
			why: 'Cloudflare moved its busiest locations to MCP. The postmortem: these locations "carry a significant proportion of the Cloudflare traffic, any problem here can have a very wide impact".'
		},
		{
			q: 'Inside each MCP, the small compute clusters overloaded. What caused that?',
			options: [
				'Multimog could not forward requests between servers',
				'The small clusters received the withdrawn prefixes twice',
				'Engineers moved all traffic to the small clusters by hand',
				'The DDoS filters ran only on the small clusters'
			],
			answer: 0,
			why: 'Multimog forwards requests between the servers of an MCP. Without the site-local prefixes it could no longer do that, and "our smaller compute clusters in an MCP received the same amount of traffic as our largest clusters".'
		},
		{
			q: 'In the spine diff, a line reads `! term REJECT-THE-REST { ... }`. What does the `!` mean in this diff format?',
			options: [
				'The term was deleted from the policy',
				'The term was disabled but kept in the file',
				'The term moved to a new position in the policy',
				'The term has a syntax error the router ignored'
			],
			answer: 2,
			why: 'The postmortem: "the exclamation marks in front of the terms indicate a re-ordering of the terms". At a first glance the diff looked like the harmless change on the other routers, but it moved the site-local terms behind the reject.'
		}
	],
	recall: {
		q: 'What in the spine config change withdrew Cloudflare\'s site-local prefixes?',
		a: 'The terms `4-ADV-SITE-LOCALS` and `6-ADV-SITE-LOCALS` moved below `REJECT-THE-REST`, which does `then reject`, so the spines stopped advertising those prefixes.'
	},
	sources: [
		{ title: 'Cloudflare, Cloudflare outage on June 21, 2022', url: PM },
		{ title: 'Cloudflare, Unimog: Cloudflare\'s edge load balancer', url: 'https://blog.cloudflare.com/unimog-cloudflares-edge-load-balancer/' }
	]
};
