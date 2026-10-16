/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'db-failover',
	part: 'Reliability',
	title: 'Database failover',
	minutes: 10,
	hook: [
		'3:04 a.m. The power supply of the PostgreSQL primary of an online shop fails. The two replicas are fine. The 12 app servers still point at the dead machine, and every checkout fails with a connection error.',
		'The on-call engineer wakes up at 3:11, logs in at 3:19 and promotes a replica by hand at 3:26. The shop took no orders for 22 minutes, and nobody knows if the last orders before the crash reached the replica.',
		'The shop wants the next failover to happen with no person involved, in under 30 seconds.'
	],
	terms: [
		{ term: 'Leader key', def: 'A key in a small coordination store, like etcd, that only the current primary may hold. It has a time to live, and the primary must renew it before it expires.' },
		{ term: 'Synchronous replication', def: 'The primary reports a commit as done only after a replica confirms it has the change. A write the client saw succeed is then on two machines.' },
		{ term: 'Split brain', def: 'Two servers both accept writes as primary at the same time. Their data diverges, and one side has to be thrown away or merged by hand.' }
	],
	kata: {
		brief: [
			'An online shop runs one PostgreSQL primary and two streaming replicas, each on its own server in one datacenter. 12 app servers send 400 writes per second at peak and read from the replicas.',
			'The primary dies at 3 a.m. with nobody awake. Writes may be refused for **at most 30 seconds**, counted from the crash to the first accepted write on the new primary.',
			'An order the customer saw confirmed must not be lost. The old primary may come back on its own after a reboot, and it must not take writes again. The app servers must find the new primary without anyone editing their config.'
		],
		minutes: 10,
		checklist: [
			'Your design names the component that decides the primary is dead, and after how many seconds it decides.',
			'Your design adds up the seconds from the crash to the first accepted write, and the sum is under 30.',
			'Your sketch shows how the 12 app servers reach the new primary with no config change.',
			'Your design says whether a commit confirmed just before the crash can be lost, and why.',
			'Your design says what stops the old primary from taking writes when it reboots.',
			'Your design says what the app does with the writes that fail during the switch.'
		],
		sample: [
			'Each database server runs Patroni next to PostgreSQL, and three small machines run etcd. The primary holds a leader key in etcd with a time to live (`ttl`) and renews it every `loop_wait` seconds. When the key expires, a replica takes it and promotes its PostgreSQL.',
			'Timing. Patroni requires `loop_wait + 2 * retry_timeout <= ttl`, and `ttl` cannot go below 20. The sample sets `ttl: 20`, `loop_wait: 5` and `retry_timeout: 7`: 5 + 14 = 19. In the worst case the dead primary renewed its key just before the crash, so the key expires 20 seconds later. A replica checks on its next loop, at most 5 seconds after that.',
			'The app servers connect to HAProxy, not to a database. HAProxy calls `GET /primary` on each Patroni every second. Patroni answers 200 there only on the node that runs as primary and holds the leader key. With `inter 1s rise 2`, the new primary gets traffic about 2 seconds after it answers 200.',
			'Sum: 20 + 5 + 2 = **27 seconds**, which leaves about 3 seconds for the promotion itself. At 400 writes per second, 27 seconds is about 10 800 refused writes. The app retries each failed write every 2 seconds for 30 seconds, then shows the customer an error.',
			'Lost commits. With the default asynchronous replication, the Patroni docs say the loss is bounded by `maximum_lag_on_failover` bytes plus what was written in the last `ttl` seconds. The sample turns on `synchronous_mode`. Patroni then promotes a standby only if it is sure that standby has every commit that returned success to a client.',
			'The cost of `synchronous_mode`: each commit waits for one replica to confirm, so every checkout write is slower by one network round trip. If the synchronous replica crashes, commits block until Patroni switches, up to `ttl` seconds in the worst case.',
			'The old primary. When it reboots, another node holds the leader key, so its `GET /primary` does not return 200 and HAProxy sends it no writes.',
			'The short timers have a cost too. Patroni ignores trouble reaching etcd only if it lasts less than `retry_timeout`, 7 seconds here. A longer network glitch can demote a healthy primary and refuse writes for a failover nobody needed.'
		]
	},
	quiz: [],
	recall: {
		q: 'In the sample, which settings fix the failover time, and what is the worst case?',
		a: '`ttl: 20` and `loop_wait: 5`, plus HAProxy checking every second: 20 + 5 + 2 = 27 seconds before the new primary takes writes.'
	},
	sources: [
		{ title: 'Patroni documentation, Dynamic configuration settings', url: 'https://patroni.readthedocs.io/en/latest/dynamic_configuration.html' },
		{ title: 'Patroni documentation, Replication modes', url: 'https://patroni.readthedocs.io/en/latest/replication_modes.html' },
		{ title: 'Patroni documentation, REST API (health check endpoints)', url: 'https://patroni.readthedocs.io/en/latest/rest_api.html' }
	]
};
