const POST = 'https://blog.cloudflare.com/18-november-2025-outage/';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'cloudflare-bot-file-2025',
	part: 'Changes and config',
	title: 'Cloudflare 2025: the Bot Management feature file that doubled in size',
	minutes: 10,
	hook: [
		'Tuesday 18 November 2025, 11:28 UTC. Visitors of sites behind Cloudflare start getting an error page that points at a failure inside Cloudflare\'s network.',
		'At 11:31 an automated test flags the problem. At 11:32 engineers start looking, and at 11:35 the incident call opens. You are on it.',
		'The HTTP 5xx error rate across the network jumps far above its usual baseline.'
	],
	terms: [
		{ term: 'Core proxy', def: 'The Cloudflare system, called FL and in its new version FL2, that every request passes through. Bot Management is one of the modules it runs.' },
		{ term: 'Feature file', def: 'The configuration file that lists the features (traits of a request) the Bot Management model uses. It is regenerated every few minutes and sent to every machine.' },
		{ term: 'Distributed table', def: 'A ClickHouse table in the default database that queries the underlying tables, stored in the r0 database on each shard.' },
		{ term: 'Panic', def: 'In Rust, a crash of the current thread. Calling unwrap() on a Result that holds an Err triggers one.' }
	],
	incident: {
		org: 'Cloudflare',
		title: 'Cloudflare outage on November 18, 2025',
		date: '2025-11-18',
		url: POST,
		steps: [
			{
				situation: [
					'Shortly after 11:32 UTC. The 5xx errors spike, then the network recovers for a while, then fails again. That pattern is unusual for an internal error.',
					'Cloudflare\'s status page, hosted off Cloudflare\'s infrastructure, is also down. Cloudflare has recently seen a spate of high volume Aisuru DDoS attacks.'
				],
				q: 'What do you work on first?',
				options: [
					'Treat it as a DDoS attack and tighten traffic filtering',
					'List every change deployed since 11:00 and what it touches',
					'Move the status page to a second hosting provider',
					'Wait for the next good period to collect clean logs'
				],
				answer: 1,
				why: 'The fluctuation and the status page "led us to believe this might be caused by an attack". The status page outage "turned out to be a coincidence". A database permissions change had gone out at 11:05, and the team was sure of the trigger only at 13:37.'
			},
			{
				situation: [
					'Later, before 13:05 UTC. Workers KV returns many 5xx errors, and Access and the dashboard depend on it. The team has tried traffic manipulation and account limiting on Workers KV, and errors continue.',
					'Requests to Workers KV\'s front end go through the core proxy. An older version of the core proxy shows smaller impact.'
				],
				q: 'How do you reduce the damage for Workers KV and Access?',
				options: [
					'Limit more accounts until Workers KV error rates drop',
					'Add Workers KV capacity to absorb the retries',
					'Bypass the new core proxy and fall back to the prior version',
					'Restart every Workers KV gateway in sequence'
				],
				answer: 2,
				why: 'At 13:05 the team used internal bypasses so Workers KV and Access "fell back to a prior version of our core proxy". The bug was in both versions, but the impact was smaller in the old one. Workers KV errors had come from the proxy, so limiting accounts did not help.'
			},
			{
				situation: [
					'13:37 UTC. The team is confident the trigger is the Bot Management feature file. A new copy is generated every five minutes and sent to the whole network.',
					'The proxy fails after it loads the new file.'
				],
				q: 'What is the fastest way to stop the errors?',
				options: [
					'Stop new feature files and push the last known good one',
					'Fix the query, then wait for the next file it generates',
					'Roll every proxy back to last month\'s binary',
					'Edit the current file by hand on each machine'
				],
				answer: 0,
				why: 'At 14:24 the team "stopped automatic deployment of new Bot Management configuration files" and tested an old file. At 14:30 a correct file was deployed globally and core traffic largely flowed again. A new file every five minutes would have overwritten any single repair.'
			},
			{
				situation: [
					'14:40 UTC. Core traffic flows again. Users who were locked out all try to log in to the dashboard at once, and their clients retry.',
					'Dashboard latency rises and availability drops.'
				],
				q: 'What do you do?',
				options: [
					'Roll back the feature file a second time',
					'Scale up the control plane\'s concurrency',
					'Turn off Turnstile on the login page',
					'Ask users on social media to wait an hour'
				],
				answer: 1,
				why: 'The backlog of logins plus retries caused the second dashboard dip. "Scaling control plane concurrency restored availability at approximately 15:30." The feature file was already correct by then.'
			},
			{
				situation: [
					'17:06 UTC. All services are back. Duplicate rows pushed the feature file past the proxy\'s limit of 200 features, and FL2 panicked on an unhandled error.'
				],
				q: 'What do you change so the next bad file does not take down the proxy?',
				options: [
					'Raise the feature limit from 200 to 400',
					'Add a filter on the database name to that one query',
					'Validate internal config files like user input',
					'Regenerate the feature file once a day'
				],
				answer: 2,
				why: 'The first listed fix is "Hardening ingestion of Cloudflare-generated configuration files in the same way we would for user-generated input". A higher limit or a query filter only covers this one bad file. A daily file would stop Bot Management from reacting to new bot attacks within minutes.'
			}
		],
		outcome: [
			'At 11:05 Cloudflare changed ClickHouse permissions so users could see the metadata of the r0 tables they could already query. The feature file query read system.columns without a filter on the database name, so it now got every column twice: once from default, once from r0.',
			'The file more than doubled to over 200 features, above the limit the proxy preallocates memory for. On FL2 the check ended in "called Result::unwrap() on an Err value" and a 5xx for any traffic that depended on the bots module. On the old FL proxy, bot scores were all zero, so customers who blocked bots saw false positives.',
			'The ClickHouse cluster was updated gradually, so each five minute run produced a good or a bad file. That made the network recover and fail in turn, until every node produced the bad file. Core traffic was largely back at 14:30 and every service at 17:06. Cloudflare calls it its worst outage since 2019.',
			'The listed fixes: validate generated configuration files like user input, add more global kill switches for features, stop core dumps and error reports from overwhelming system resources, and review error handling in every core proxy module.'
		]
	},
	quiz: [
		{
			q: 'Why did the network keep recovering and failing again in the first two hours?',
			options: [
				'An attacker was turning the traffic flood on and off',
				'Each five minute run hit an updated or a not yet updated ClickHouse node',
				'The proxy restarted every few minutes and loaded a cached file',
				'The status page outage hid the recovery periods'
			],
			answer: 1,
			why: 'The permissions change rolled out to the ClickHouse cluster gradually. "Bad data was only generated if the query ran on a part of the cluster which had been updated", so every five minutes a good or bad file went out, until all nodes were updated.'
		},
		{
			q: 'Why did the feature file query start returning duplicate rows after the 11:05 change?',
			options: [
				'The query read system.columns without filtering on the database name',
				'ClickHouse replicated the http_requests_features table twice',
				'Two copies of the generation job ran at the same time',
				'The new permissions corrupted the existing column metadata'
			],
			answer: 0,
			why: 'The query filtered on table = \'http_requests_features\' only. Once users could see the metadata of the r0 tables, system.columns returned each column for both default and r0, which more than doubled the rows.'
		},
		{
			q: 'Why did one bad file take down the proxy instead of only degrading bot scores?',
			options: [
				'The file was signed with an expired key',
				'Bot Management ran on its own machines that ran out of disk',
				'The proxy hit its 200 feature limit and FL2 called unwrap() on the error',
				'The file was too big to fit in the network\'s cache'
			],
			answer: 2,
			why: 'Bot Management preallocates memory for at most 200 features. The FL2 code turned the limit error into a panic with unwrap(), so every request that used the bots module got a 5xx.'
		}
	],
	recall: {
		q: 'What made the Bot Management feature file double in size on 18 November 2025?',
		a: 'A ClickHouse permissions change at 11:05 UTC let the query on system.columns also see the r0 tables. With no filter on the database name, it returned each feature twice and pushed the file past the 200 feature limit.'
	},
	sources: [
		{ title: 'Cloudflare, Cloudflare outage on November 18, 2025', url: POST },
		{ title: 'The Rust Programming Language, Recoverable Errors with Result (unwrap)', url: 'https://doc.rust-lang.org/book/ch09-02-recoverable-errors-with-result.html' }
	]
};
