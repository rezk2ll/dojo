const PM = 'https://developer.squareup.com/blog/incident-summary-2017-03-16/';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'square-2017',
	part: 'Capacity and cascades',
	title: 'Square 2017: retries that overloaded merchant authentication',
	minutes: 10,
	hook: [
		'Thursday 16 March 2017, 9:55 a.m. Pacific time. Square deploys its services over 250 times a day, and a team starts rolling out a change to Roster, the service that holds customer identity, in one datacenter.',
		'At 10:02, Multipass starts reporting timeouts to on-call engineers. Multipass is the service that authenticates merchants, and most of Square’s products call it.',
		'At 10:06, Roster pages its on-call engineer. At 10:08, external monitoring reports that api.squareup.com is down.'
	],
	terms: [
		{ term: 'active-active', def: 'A service runs and serves traffic in several datacenters at once, so one datacenter can fail while the others keep answering.' },
		{ term: 'optimistic transaction', def: 'A Redis transaction that `WATCH`es keys and aborts at `EXEC` if another client changed one of them. The client then runs it again.' },
		{ term: 'backoff', def: 'A wait before each retry, usually longer after each failure, so retries do not hit the server as fast as the client can send them.' },
		{ term: 'cgroup', def: 'A Linux feature that caps the CPU and memory a group of processes can use on a machine.' }
	],
	incident: {
		org: 'Square',
		title: 'Incident Summary: 2017-03-16',
		date: '2017-03-16',
		url: PM,
		steps: [
			{
				situation: [
					'10:10. Engineers across Square report failures in every service that needs merchant identity. It is now clear to the team that this is a major outage.',
					'The Roster rollout started at 9:55, seven minutes before the first timeouts. Multipass depends on Roster, and Roster runs active-active in several datacenters.'
				],
				q: 'What do you do first with the recent changes?',
				options: [
					'Leave Roster alone until someone proves the Roster change broke Multipass',
					'Roll back every change made before the incident, Roster included',
					'Finish the Roster rollout in the other datacenters so all run the same version',
					'Move all Roster traffic to the datacenter that got the new version'
				],
				answer: 1,
				why: 'Square calls a rollback "a non-negotiable response to any customer-impacting event": engineers undo any change that came before an incident "regardless of how plausible it is that the change caused the issue."'
			},
			{
				situation: [
					'10:23. The Roster rollback is complete, and Multipass still times out. The outage goes on.'
				],
				q: 'What do you check next?',
				options: [
					'Roll Roster back one more version, in case the previous one also had the bug',
					'Restart Roster in every datacenter, since its rollback may have left caches cold',
					'Look at the load on Multipass’s own dependencies, such as its database',
					'Wait for the rollback to settle for 30 minutes before trying anything else'
				],
				answer: 2,
				why: 'Roster had been serving from its other datacenters the whole time, so the fault sat closer to Multipass. At 10:25 the team restarted Multipass on the theory that Roster had left it in a bad state: "This theory was proven false." Between 10:30 and 11:30 they found that Multipass’s Redis had "peaked out on capacity."'
			},
			{
				situation: [
					'Multipass’s Redis database has suddenly hit its full capacity. You do not know yet which requests cause the load.'
				],
				q: 'How do you find what is hitting Redis?',
				options: [
					'Run `SLOWLOG` and `MONITOR` on Redis and trace the top operations to code',
					'Add a Redis replica and send half the reads to it, then compare the load',
					'Fail Redis over to its replica, which clears whatever state it is stuck in',
					'Run `FLUSHALL` so Redis starts empty and the load drops back to normal'
				],
				answer: 0,
				why: '`SLOWLOG` logs the commands that ran longer than a set time, and `MONITOR` streams back every command Redis processes. Square used both and traced the load to "a specific code path in Multipass which retries a Redis optimistic transaction."'
			},
			{
				situation: [
					'The retry loop has a high upper bound, 500 attempts, and no backoff. A fix that lets you reduce the retries is written, reviewed, built and tested by 11:45.',
					'Multipass runs in a West coast datacenter, an East coast datacenter and a Japan datacenter.'
				],
				q: 'How do you ship the fix?',
				options: [
					'Hold it until the next day’s release train, since a rushed fix may break something else',
					'Deploy it to all three datacenters at the same moment to end the outage sooner',
					'Turn the fix on for payment requests only and leave logins on the old loop',
					'Deploy it to one datacenter, watch its Redis, then deploy to the other two'
				],
				answer: 3,
				why: 'One datacenter first shows whether the fix works while the other two keep the old code. Square deployed West coast at 11:48, and "multipass-redis immediately recovered as the improvement rolled out." East coast followed at 11:59 and Japan at 12:00.'
			},
			{
				situation: [
					'12:00. Merchants can log in again. Engineers test the sign-out and sign-in flow and find that two-factor authentication codes are not reaching customers by SMS.',
					'Merchants who could not log in for almost two hours are all logging in again at the same time.'
				],
				q: 'What do you do about the SMS codes?',
				options: [
					'Turn off 2FA for every account until the SMS backlog clears on its own',
					'Work with the SMS vendor to add capacity, such as more sending numbers',
					'Restart Multipass again, since the codes come from the login service',
					'Ask merchants on the status page to stop logging in for an hour'
				],
				answer: 1,
				why: 'The codes were stuck behind a rush of SMS from the rush of logins, a capacity limit at the sending side. Square and its vendor found that "a rebalancing of our outbound SMS phone numbers would increase capacity": new numbers went in at 12:32, old ones out at 12:42, and SMS codes worked for everyone at 13:12.'
			}
		],
		outcome: [
			'Root cause, in the summary: "Merchant authentication service unrecoverably overloaded due to bug in adjacent service." A Multipass code path retried a Redis optimistic transaction up to 500 times with no backoff, which built a feedback loop on Redis.',
			'All merchants had a service outage from 10:02 to 11:55, and 2FA by SMS was down until 13:12. Payments, Point of Sale, Dashboard, Appointments and Payroll were affected.',
			'While the fix was built, the team lifted the cgroup limits of the services critical to payment processing, so they got the full CPU and memory of their machines. The status page was updated every 15 minutes until full resolution.',
			'Action items include: check whether the single datacenter Roster outage made the Redis retries worse, audit every other retry loop for the same flaw, audit cgroup limits, write a Redis runbook, and hold a second postmortem on the SMS issue.'
		]
	},
	quiz: [
		{
			q: 'Square rolled Roster back at 10:23 and Multipass kept failing. Why did the rollback not help?',
			options: [
				'The rollback reached only one of the three datacenters before it stopped',
				'Roster stayed available from its other datacenters, so it was not the bottleneck',
				'The old Roster version had a bug of its own that also broke Multipass',
				'Multipass had cached the bad Roster answers and served them for an hour'
			],
			answer: 1,
			why: 'Roster runs active-active. The postmortem: "Roster continued to be available for the duration, serving out of other datacenters, as designed." The deploy and the outage lined up in time, but the load was on Multipass’s Redis.'
		},
		{
			q: 'Why do more Redis optimistic transactions fail as the load on Redis grows?',
			options: [
				'Redis rejects any `EXEC` once its CPU passes a fixed threshold',
				'`WATCH` takes a lock, and other clients wait on it until they time out',
				'Slower commands leave more time for another client to change a watched key',
				'Redis drops the `MULTI` block when its memory is full and returns an error'
			],
			answer: 2,
			why: 'If a watched key changes between `WATCH` and `EXEC`, the whole transaction aborts. Under load that window gets longer, so more attempts abort and retry, and each retry adds load. With up to 500 retries and no backoff, the loop fed itself.'
		},
		{
			q: 'Your service retries a failed write to a shared store. Which change lowers the load that retries put on the store during an overload?',
			options: [
				'Raise the retry limit so fewer requests end in an error for the user',
				'Retry right away so the request finishes before the next one arrives',
				'Send each retry to a different replica of the store in round robin',
				'Wait longer after each failed attempt, with a low cap on attempts'
			],
			answer: 3,
			why: 'Backoff spaces the retries out and a low cap bounds them, so a slow store gets fewer requests. Square’s fix added "the ability to reduce retries on Redis transactions", and an action item audits every other retry loop for the same flaw.'
		}
	],
	recall: {
		q: 'What in Multipass overloaded its Redis on 16 March 2017?',
		a: 'A code path that retried a Redis optimistic transaction up to 500 times with no backoff.'
	},
	sources: [
		{ title: 'Square Engineering, Incident Summary: 2017-03-16', url: PM },
		{ title: 'Redis docs, Transactions: optimistic locking using check-and-set', url: 'https://redis.io/docs/latest/develop/using-commands/transactions/' },
		{ title: 'Redis docs, SLOWLOG', url: 'https://redis.io/docs/latest/commands/slowlog/' },
		{ title: 'Redis docs, MONITOR', url: 'https://redis.io/docs/latest/commands/monitor/' }
	]
};
