const PM = 'https://blog.cloudflare.com/details-of-the-cloudflare-outage-on-july-2-2019/';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'cloudflare-regex-2019',
	part: 'Changes and config',
	title: 'Cloudflare 2019: the WAF rule that used all the CPU',
	minutes: 10,
	hook: [
		'Tuesday 2 July 2019, 13:45 UTC. You are an SRE at Cloudflare. PagerDuty fires: a synthetic test that checks the web application firewall (WAF) from outside Cloudflare is failing.',
		'More pages follow fast. Many other end to end tests fail, a global traffic drop alert fires, and visitors get 502 errors. Points of presence (PoPs) in cities around the world report CPU exhaustion.',
		'A leader in Solutions Engineering says Cloudflare has lost 80% of its traffic.'
	],
	terms: [
		{ term: 'WAF', def: 'Web application firewall: code on every Cloudflare server that checks each HTTP request against rules and blocks the ones that look like attacks.' },
		{ term: 'Backtracking', def: 'What a regex engine like PCRE does when a match fails: it goes back and tries another way to split the input. Some patterns make it try a very large number of ways.' },
		{ term: 'Global terminate', def: 'A mechanism built into Cloudflare that disables a single component on every server worldwide.' },
		{ term: 'Staged rollout', def: 'Deploying a change to a few locations first and to the world last. Cloudflare software goes to DOG (staff only), then PIG (some free traffic), then 3 Canary PoPs, then everywhere.' }
	],
	incident: {
		org: 'Cloudflare',
		title: 'Details of the Cloudflare outage on July 2, 2019',
		date: '2019-07-02',
		url: PM,
		steps: [
			{
				situation: [
					'Your dashboards show alerts many times every day, and most are about a small issue in one place. This time the WAF test, the end to end tests, the traffic drop and CPU exhaustion fire together, in PoPs worldwide.',
					'Some people in the room think it is a new kind of attack.'
				],
				q: 'What do you do first?',
				options: [
					'Handle each PoP alert from the dashboard, as on a normal day',
					'Declare a P0 incident and escalate to engineering leadership',
					'Turn on attack mitigation for every customer',
					'Wait 15 minutes to see whether the traffic comes back'
				],
				answer: 1,
				why: 'The postmortem: the pattern "indicated that something gravely serious had happened, and SRE immediately declared a P0 incident and escalated to engineering leadership and systems engineering." In London, an internal tech talk was stopped and the engineers met in one room.'
			},
			{
				situation: [
					'You have two stories. One is an attack. The other is a change: at 13:42, three minutes before the first page, the firewall team deployed a minor change to the XSS detection rules through an automatic process.',
					'The Performance Team can pull live CPU data from a server in a PoP.'
				],
				q: 'How do you decide between attack and change?',
				options: [
					'Block the networks that send the most requests and watch the CPU',
					'Roll back every deploy of the last 24 hours',
					'Look at which process uses the CPU on one server',
					'Ask the largest customers whether they are under attack'
				],
				answer: 2,
				why: 'At 14:00 the WAF was found to be the cause and an attack was ruled out. "The Performance Team pulled live CPU data from a machine that clearly showed the WAF was responsible." Another engineer confirmed it with `strace`, and a third team saw WAF errors in the logs.'
			},
			{
				situation: [
					'It is 14:02. The WAF is using the CPU that serves HTTP and HTTPS on every server. The new rule went to every PoP in seconds through Quicksilver, Cloudflare\'s key value store.',
					'The rollback plan on the change ticket needs the complete WAF build to run twice.'
				],
				q: 'How do you stop the damage?',
				options: [
					'Run the rollback plan from the change ticket',
					'Use the global terminate to switch the WAF off worldwide',
					'Restart the HTTP servers in every PoP',
					'Turn the WAF off for the largest customers one by one'
				],
				answer: 1,
				why: 'At 14:02 the team proposed a global terminate of the WAF. The postmortem lists "The rollback plan required running the complete WAF build twice taking too long." With the WAF off, the rest of Cloudflare\'s protections kept running.'
			},
			{
				situation: [
					'To run the global terminate, you log in to the internal control panel. You cannot: Cloudflare uses its own products, and its Access service is down.',
					'Jira and the build system are out of reach too. There is a bypass mechanism, but the team rarely uses it.'
				],
				q: 'What do you do?',
				options: [
					'Wait until Access recovers, then log in as usual',
					'Use the bypass mechanism to reach the control panel',
					'Log in to every server by SSH and stop the WAF by hand',
					'Ask the Access team to turn off authentication for all staff'
				],
				answer: 1,
				why: 'The team used "a bypass mechanism that wasn\'t frequently used". A team member ran the global WAF termination at 14:07, and by 14:09 traffic and CPU were back to normal worldwide. Some SREs had also lost access, because a security feature disables credentials that are not used often.'
			},
			{
				situation: [
					'It is 14:09. Traffic is back, and no server runs the WAF. Customers have no WAF protection until it comes back.',
					'You have rolled back the 13:42 rule.'
				],
				q: 'How do you bring the WAF back?',
				options: [
					'Turn it back on everywhere now that the rule is gone',
					'Leave it off until the new regex engine is in place',
					'Test it in one city, without paying customers\' traffic, before going global',
					'Turn it back on for paying customers first, then for free ones'
				],
				answer: 2,
				why: 'Cloudflare ran negative tests ("was it really that particular change that caused the problem?") and positive tests (did the rollback work) in a single city, on a subset of traffic, after moving paying customers\' traffic away. The WAF was turned back on globally at 14:52.'
			}
		],
		outcome: [
			'The new rule held a regular expression that "backtracked enormously". The key part was `.*(?:.*=.*)`. The Lua WAF "uses PCRE internally, and it uses backtracking for matching and has no mechanism to protect against a runaway expression." A protection against excessive CPU use by a regex had been removed by mistake during a WAF refactoring weeks before.',
			'The rule was meant to run in simulate mode, which blocks nothing, but simulated rules still execute. The SOP for rule changes allowed a global push with no staged rollout, and Quicksilver distributes a change to every machine with a p99 of 2.29 seconds. CI passed, because the test suite did not measure CPU use.',
			'HTTP and HTTPS were down for 27 minutes, and visitors to any Cloudflare domain saw 502 errors. Customers could not reach the Cloudflare Dashboard or API, because both pass through the same edge.',
			'Cloudflare stopped all WAF release work. It put the CPU protection back, inspected all 3,868 WAF Managed Rules for backtracking, and planned to add performance profiling to the test suite and to move to the re2 or Rust regex engine. It is changing the SOP so that rules roll out in stages, with a global push kept for active attacks.'
		]
	},
	quiz: [
		{
			q: 'The rule was deployed in simulate mode, which blocks nothing. Why did it still take Cloudflare down?',
			options: [
				'Simulate mode logs every request, and the logs filled the disks',
				'In simulate mode the rule still runs its regex on real traffic',
				'Simulate mode was switched to block mode by Quicksilver',
				'Simulate mode sends a copy of each request to a central server'
			],
			answer: 1,
			why: 'Simulate mode measures false positives on real traffic, so the rule must execute. The postmortem: "even in the simulate mode the rules actually need to execute". The regex used up the CPU whether or not it blocked anything.'
		},
		{
			q: 'Matching `x=` plus 20 x\'s against `.*.*=.*` takes PCRE 555 steps. Which fix removes this kind of blowup for every pattern?',
			options: [
				'Making every `.*` lazy, like `.*?`',
				'A regex engine with run-time guarantees, like re2',
				'Adding more attack samples to the test suite',
				'Running the WAF on more CPU cores per server'
			],
			answer: 1,
			why: 'Cloudflare chose re2 or the Rust regex engine, which both "have run-time guarantees". The appendix shows the method, from Ken Thompson in 1968: a state machine that is in every possible state at once reads each character once, in linear time. Lazy `.*?` does not save `.*?.*?=.*?;`, which still takes 5,353 steps.'
		},
		{
			q: 'CI ran a large collection of HTTP requests against the new rule and passed. Why did it miss the problem?',
			options: [
				'The new rule was not included in the CI build',
				'The CI servers had a newer PCRE without backtracking',
				'CI checked only what was blocked and let through, never CPU use',
				'CI only tested requests from the DOG PoP'
			],
			answer: 2,
			why: 'The suite sends requests that must be blocked and requests that must pass. The postmortem: "What it didn\'t do was test for runaway CPU utilization by the WAF". Logs show no rise in suite run time with the bad rule.'
		}
	],
	recall: {
		q: 'How did one WAF rule reach every Cloudflare server at once, and how did the team switch it off?',
		a: 'The SOP let rule changes skip staged rollout, so Quicksilver pushed the rule worldwide in seconds. At 14:07 a team member ran the global terminate for the WAF, through a rarely used bypass, and traffic was back by 14:09.'
	},
	sources: [
		{ title: 'Cloudflare, Details of the Cloudflare outage on July 2, 2019', url: PM },
		{ title: 'Russ Cox, Regular Expression Matching Can Be Simple And Fast', url: 'https://swtch.com/~rsc/regexp/regexp1.html' }
	]
};
