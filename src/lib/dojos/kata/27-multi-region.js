/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'multi-region',
	part: 'Reliability',
	title: 'Serving two regions',
	minutes: 10,
	hook: [
		'A recipe site runs in Frankfurt. A user in Singapore opens a recipe page, and the app makes 6 database queries to build it. Each query goes to Frankfurt and back in 160 ms, so the queries alone take 960 ms.',
		'Users in Europe see the same page in 80 ms. Asia is now 40% of the traffic, and the Asian users stop at page two.',
		'The team wants the Asian pages as fast as the European ones. Saving a recipe or a comment may stay slower.'
	],
	terms: [
		{ term: 'Hot standby', def: 'A PostgreSQL replica that accepts read-only queries while it replays the changes it receives from the primary.' },
		{ term: 'Replication lag', def: 'The time between a commit on the primary and the moment that change is visible on a replica.' },
		{ term: 'LSN', def: 'Log sequence number: a position in PostgreSQL’s write-ahead log, like `16/B374D848`. A replica that has replayed up to an LSN has every change written before it.' }
	],
	kata: {
		brief: [
			'A recipe site has 4 million users: 2.4 million in Europe and 1.6 million in Asia. At peak it serves 6 000 reads per second and 150 writes per second (new recipes, comments, ratings). The database is one PostgreSQL of 300 GB.',
			'Every page must answer in **under 100 ms** for users in both regions. A write may take up to 1 second. The team runs one datacenter in Frankfurt and one in Singapore. In this brief, a network round trip between them takes 160 ms.',
			'A user who posts a comment and reloads the page must see their own comment. Other users may see it a few seconds later.'
		],
		minutes: 10,
		checklist: [
			'Your design says where a page read from Singapore is answered, and that no step crosses the 160 ms link.',
			'Your design says where writes are committed, and how long an Asian write takes in milliseconds.',
			'Your design counts the round trips of an Asian write, not only the first one.',
			'Your design says how a user sees their own comment right after posting it.',
			'Your design says how the team measures replication lag, and at what value someone is told.',
			'Your design says what Asian users can still do when the link to Frankfurt is cut.'
		],
		sample: [
			'Frankfurt runs the PostgreSQL primary and one replica. Singapore runs two hot standby replicas fed by streaming replication. Each region has its own app servers, and geographic DNS sends each user to the nearest region. Connections to a hot standby are read-only, so all 150 writes per second go to Frankfurt.',
			'Reads. An app server in Singapore queries a replica in the same datacenter, so the 6 queries of a recipe page never cross the link. That keeps the page under 100 ms in both regions. Singapore takes its share of the 6 000 reads per second, and the two replicas there split it.',
			'Writes. If a Singapore app server opened a database connection to Frankfurt, a transaction with `BEGIN`, two statements and `COMMIT` would cost 4 round trips: 640 ms. Instead it forwards the whole HTTP request to an app server in Frankfurt. That costs **one round trip, 160 ms**, plus the local transaction, inside the 1 second budget.',
			'Lag. PostgreSQL ships changes to the replicas after the commit returns, unless synchronous replication is configured. The PostgreSQL docs say the delay is "typically under one second assuming the standby is powerful enough to keep up with the load". The team graphs `replay_lag` from `pg_stat_replication` on the primary and pages someone when it stays above 5 seconds.',
			'Seeing your own comment. After the commit, the Frankfurt app runs `SELECT pg_current_wal_lsn()` and returns that LSN, which Singapore keeps in the user’s session for 30 seconds. On the next page, the app compares it with `pg_last_wal_replay_lsn()` on the local replica. If the replica is behind, that one page reads from Frankfurt and takes about 160 ms more.',
			'The main choice is one primary, in Frankfurt. No two users can write conflicting versions of the same row, because only one server takes writes. The cost is that every Asian write pays 160 ms, and Asian users can only read while the link is cut.',
			'Promoting a Singapore replica during a Frankfurt outage is possible, but PostgreSQL docs say the data lost "is proportional to the replication delay at the time of failover". The sample keeps that step manual, decided by a person who checks the lag first.'
		]
	},
	quiz: [],
	recall: {
		q: 'In the sample, how long does a write from Singapore take, and why only that long?',
		a: 'About 160 ms plus the local transaction: Singapore forwards the HTTP request to Frankfurt in one round trip, instead of 4 database round trips (640 ms).'
	},
	sources: [
		{ title: 'PostgreSQL documentation, Log-Shipping Standby Servers (streaming replication)', url: 'https://www.postgresql.org/docs/current/warm-standby.html' },
		{ title: 'PostgreSQL documentation, Hot Standby', url: 'https://www.postgresql.org/docs/current/hot-standby.html' },
		{ title: 'PostgreSQL documentation, System Administration Functions (WAL locations)', url: 'https://www.postgresql.org/docs/current/functions-admin.html' }
	]
};
