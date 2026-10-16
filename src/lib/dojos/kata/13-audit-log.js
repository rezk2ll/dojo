/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'audit-log',
	part: 'Data',
	title: 'An audit log',
	minutes: 10,
	hook: [
		'A payroll product stores salaries for 2 000 companies. In March, an employee at one of them finds that her salary dropped by 300 euros, and nobody in HR admits to the change.',
		'Her company asks the vendor: who changed this field, when, and from which account? They also ask how the vendor can show that nobody edited the answer afterwards, including the vendor\'s own database admins.',
		'The contract with each customer says the vendor keeps that history for 7 years.'
	],
	terms: [
		{ term: 'Hash chain', def: 'Each record stores a hash computed over its own content and the previous record\'s hash, so changing one record changes every hash after it.' },
		{ term: 'Anchor', def: 'A copy of the latest hash written to a place the database admins cannot change, used later to check the chain.' },
		{ term: 'Tamper evident', def: 'A change to stored records can be detected afterwards. It does not mean the change was prevented.' }
	],
	kata: {
		brief: [
			'Every admin action is recorded: who did it, when, on which object, the old and new values. 500 000 actions a day, about 1 KB each, with a peak of 50 per second.',
			'Records are kept 7 years, then deleted. An action that succeeded must have its record; an action whose record could not be written must fail.',
			'An auditor searches by user and date range: "all actions by user 1234 in March 2025". The answer comes back in under 2 seconds.',
			'A database admin who rewrites or deletes records must be caught by a check that runs every night.'
		],
		minutes: 10,
		checklist: [
			'Your design says how the audit record and the admin action are written together, so one cannot exist without the other.',
			'Your design gives the storage for 7 years, and how records older than 7 years are removed.',
			'Your design says which index or layout answers "user 1234 in March 2025" without reading all 7 years.',
			'Your design says what a database admin with full rights would have to change to hide an edit, and why the nightly check still finds it.',
			'Your design says how long an edit can stay undetected.',
			'Your design says the maximum number of audit records per second it can write, and what limits it.'
		],
		sample: [
			'The audit table lives in the same PostgreSQL database as the product. The admin action and its audit insert run in one transaction, so either both commit or neither does. The app\'s database role gets only `INSERT` and `SELECT` on the audit table.',
			'Each row stores `hash = SHA-256(previous_hash || row content)`. To read the previous hash safely, the insert first calls `pg_advisory_xact_lock(42)`. The PostgreSQL docs say a transaction-level lock is "automatically released at the end of the transaction". At the default Read Committed level, the next insert then reads the hash the previous one committed.',
			'That lock is the main cost: one audit insert at a time across all servers. The insert goes last in the transaction, just before commit. If the lock is held 5 ms, the ceiling is 200 rows per second, 4 times the peak of 50.',
			'Storage: 500 000 rows of 1 KB is 500 MB a day, about 183 GB a year, about 1.3 TB for 7 years. The table is partitioned by month, so 84 partitions of about 15 GB. Each partition has an index on `(user_id, created_at)`.',
			'"User 1234 in March 2025" names one month. PostgreSQL partition pruning skips the other 83 partitions, and the index finds the rows in the March one. After 7 years, a job drops the oldest partition: the docs say `DROP TABLE` on a partition "can very quickly delete millions of records".',
			'A database admin with full rights can rewrite a row and recompute every later hash. Anchors stop that. Every 10 minutes a job writes the latest `(id, hash)` to an S3 bucket with Object Lock in compliance mode and a 7-year retention.',
			'The S3 docs: in compliance mode, an object "can\'t be overwritten or deleted by any user, including the root user". The nightly check recomputes the day\'s chain and compares it with that day\'s 144 anchors. A rewritten row gives a different hash at the next anchor.',
			'Rows written since the last anchor can be rewritten without detection, for up to 10 minutes. The nightly check finds an edit, but it cannot bring back the original values: those need a backup.'
		]
	},
	quiz: [],
	recall: {
		q: 'In the sample, what stops a database admin from rewriting a row and recomputing the whole hash chain?',
		a: 'Every 10 minutes the latest hash is written to an S3 bucket with Object Lock in compliance mode, which nobody can overwrite. The nightly check compares the recomputed chain with those 144 anchors a day.'
	},
	sources: [
		{ title: 'Amazon S3 docs, Locking objects with Object Lock (compliance mode)', url: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html' },
		{ title: 'PostgreSQL docs, Advisory Locks', url: 'https://www.postgresql.org/docs/current/explicit-locking.html' },
		{ title: 'PostgreSQL docs, Table Partitioning (pruning and dropping partitions)', url: 'https://www.postgresql.org/docs/current/ddl-partitioning.html' }
	]
};
