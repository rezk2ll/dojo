const RCA = 'https://stripe.com/rcas/2019-07-10';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'stripe-2019',
	part: 'Data',
	title: 'Stripe 2019: a shard that could not elect a primary',
	minutes: 10,
	hook: [
		'Wednesday 10 July 2019, 16:35 UTC. You are on call for the Stripe API. The primary node of one database shard has just failed.',
		'At 16:36 the alert reaches you, and API requests are failing.',
		'Stripe runs node failovers routinely during upgrades and maintenance. This time the shard gets no new primary on its own.'
	],
	terms: [
		{ term: 'Shard', def: 'One slice of a database cluster. Stripe splits data by kind into clusters and by quantity into shards, and each shard has several redundant nodes.' },
		{ term: 'Primary', def: 'The one node of a shard that accepts writes. The other nodes copy its data.' },
		{ term: 'Election', def: 'The step where the remaining nodes of a shard choose a new primary after the old one fails.' },
		{ term: 'Circuit breaker', def: 'A wrapper around a remote call that counts failures. Past a threshold it returns an error at once, without making the call.' }
	],
	incident: {
		org: 'Stripe',
		title: 'Root cause analysis: significantly elevated error rates on 2019-07-10',
		date: '2019-07-10',
		url: RCA,
		steps: [
			{
				situation: [
					'16:36 UTC. Monitoring reports that the shard has failed its election and has no primary. Without a primary, the shard accepts no writes.',
					'Many applications write to this shard, the API among them. Their writes wait until they time out.',
					'Three months ago the databases moved to a new minor version. Since then that version went through many successful failovers.'
				],
				q: 'What do you do first?',
				options: [
					'Roll every cluster back to the old minor version right away',
					'Find how to force a new primary on this shard, even with a restart',
					'Wait for the nodes to retry the election on their own',
					'Add API servers so the waiting requests have more room'
				],
				answer: 1,
				why: 'The API cannot write until the shard has a primary, so getting one back comes first. The team "identified forcing the election of a new primary as the fastest remediation available, but this required restarting the database cluster." The election had already failed once, and no evidence yet pointed at the minor version.'
			},
			{
				situation: [
					'17:00 UTC. The team restarts all nodes of the cluster and the election succeeds. The API is fully back at 17:02, 27 minutes after the start.',
					'20:13 UTC. While looking for the root cause, the team finds a code path in the new minor version of the election protocol that likely caused the bug.',
					'The old version ran before the upgrade, three months ago. The production shards also carry a configuration setting introduced recently.'
				],
				q: 'How do you remove the suspect version?',
				options: [
					'Revert one shard first and watch it with the current configuration',
					'Revert every shard of the cluster at once, the old version is known',
					'Keep the new version and restart the cluster each time it fails',
					'Jump to the newest minor version the maintainers have released'
				],
				answer: 0,
				why: 'The old version had never run with the recent configuration setting, so it was untested in this setup. The original upgrade had been rolled out in phases, "starting with less critical clusters". For the revert, the team "decided to revert to the previous known stable version for all shards of the impacted cluster" and deployed it within four minutes.'
			},
			{
				situation: [
					'21:14 UTC. Alerts fire again: some shards of the cluster are unavailable, including the shard from the first event. The API returns errors.',
					'The symptoms look the same as at 16:35. The revert finished rolling out about half an hour ago.'
				],
				q: 'What do you do?',
				options: [
					'Restart all nodes again, the same fix as at 17:00',
					'Page the database maintainers and wait for their analysis',
					'Check the shards\' CPU and the revert before you reapply the fix',
					'Switch the API to read only until the shards come back'
				],
				answer: 2,
				why: 'The only change since 17:02 was the revert, and this time several shards failed together. The team "initially assumed that the same issue had reoccurred on multiple shards" and "followed the same mitigation playbook". The cause was different: the reverted version "interacted poorly with a recently-introduced configuration change", which caused "CPU starvation on all affected shards".'
			},
			{
				situation: [
					'21:26 UTC. The team links the CPU starvation to the old election protocol combined with the recent configuration setting. Pushing the corrected configuration is slow, partly because the nodes are short of CPU.',
					'22:34 UTC. The new configuration is rolled out and the cluster\'s nodes are restarted. The cluster reports healthy.'
				],
				q: 'How do you bring the API traffic back?',
				options: [
					'Open all traffic at once so customers recover sooner',
					'Ramp traffic up, starting with the services that user API calls need',
					'Keep traffic off until the queued background jobs have drained',
					'Restart the cluster once more before you let traffic in'
				],
				answer: 1,
				why: 'The shards had just come out of CPU starvation, and the services that serve user requests matter most. Stripe writes: "we began ramping traffic back up, prioritizing services required for user-initiated API requests." The API fully recovered at 22:47.'
			},
			{
				situation: [
					'The review finds what set up the first failure. Four days before, two nodes of the shard stalled. They stopped emitting their replication lag metrics but still answered active health checks as healthy.',
					'The new minor version had a fault in its failover system that appears only when several nodes are stalled.'
				],
				q: 'Which alert would have shown this state four days early?',
				options: [
					'An alert when a node\'s health check fails twice in a row',
					'An alert when a node stops reporting its replication lag',
					'An alert when replication lag goes above 10 seconds',
					'An alert when a shard\'s primary changes more than once a day'
				],
				answer: 1,
				why: 'The stalled nodes passed health checks, and no lag value arrived to cross any threshold. A missing metric was the only sign. Stripe added monitoring "to alert us when nodes stop reporting replication lag".'
			}
		],
		outcome: [
			'The first period, 16:35 to 17:02 UTC, came from two failure modes Stripe had not seen before: two stalled nodes, and a fault in the new minor version\'s failover system that appears only with several stalled nodes. The shard could not elect a primary.',
			'The second period, 21:14 to 22:47 UTC, came from the fix. The reverted election protocol, combined with a recent configuration change, starved all affected shards of CPU.',
			'In both windows "a substantial majority of API requests" failed. One shard took the whole API down because its timed out writes "starved compute resources for the API". Stripe emailed every user who had five or more failed POST requests.',
			'Stripe listed these fixes: alerts when nodes stop reporting replication lag or a shard enters the state that triggers the fault, work with the database maintainers on that fault, and more circuit breaking on failed operations to particular clusters. It also planned to limit resources used by clients that retry failed requests, and tooling to make rapid configuration changes during an incident safer.'
		]
	},
	quiz: [
		{
			q: 'Only one shard lost its primary. Why did most of the Stripe API fail?',
			options: [
				'The API read every response from that shard\'s primary',
				'The failover moved all traffic to one remaining node',
				'Requests waiting on writes to it used up the API\'s compute',
				'The shard\'s nodes sent errors to every other shard'
			],
			answer: 2,
			why: 'Many applications wrote to that shard. Each write hung until its timeout and held API resources meanwhile, so requests that never touched the shard also failed. Stripe\'s answer is circuit breaking on failed operations to a cluster.'
		},
		{
			q: 'Two nodes stalled four days before the outage. Why did no alert fire?',
			options: [
				'Their replication lag stayed under the alert threshold',
				'They passed health checks and stopped sending lag metrics',
				'The monitoring system was down during those four days',
				'Stalled nodes are removed from the shard automatically'
			],
			answer: 1,
			why: 'An alert on a threshold needs a value to compare. The nodes sent no lag value and still answered active checks, so nothing crossed a line. The fix alerts on the absence of the metric.'
		},
		{
			q: 'The revert went back to a "known stable version". Why did it cause the second outage?',
			options: [
				'That version had never run with the recently added config setting',
				'The revert script skipped the shard from the first event',
				'Rolling back a version always deletes the data written since',
				'The old version could not read the newer data format'
			],
			answer: 0,
			why: 'The old election protocol had been stable before a configuration change that came later. Together they starved the shards of CPU. Its stable record came from before that configuration change existed.'
		}
	],
	recall: {
		q: 'What started the second Stripe outage on 10 July 2019, from 21:14 to 22:47 UTC?',
		a: 'The revert to the previous election protocol version, which interacted with a recently introduced configuration setting and starved all affected shards of CPU.'
	},
	sources: [
		{ title: 'Stripe: Root cause analysis, significantly elevated error rates on 2019-07-10', url: RCA },
		{ title: 'Martin Fowler: Circuit Breaker', url: 'https://martinfowler.com/bliki/CircuitBreaker.html' }
	]
};
