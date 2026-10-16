const PM = 'https://mailchimp.com/what-we-learned-from-the-recent-mandrill-outage/';
const PG = 'https://www.postgresql.org/docs/18/routine-vacuuming.html';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'mandrill-2019',
	part: 'Data',
	title: 'Mandrill 2019: the shard that stopped taking writes',
	minutes: 10,
	hook: [
		'Monday 4 February 2019. Mandrill is Mailchimp\'s service for transactional email: password resets, receipts, order confirmations that apps send through an API.',
		'At 05:35 UTC an exception lands in the central error reporting. Exceptions from other systems arrive in the same place overnight, and nobody picks this one out.',
		'Mandrill stores its data in several PostgreSQL databases used as one key/value store, sharded by key. By late morning, one of them, shard4, is under a load much higher than usual.'
	],
	terms: [
		{ term: 'Transaction ID (XID)', def: 'A 32-bit counter PostgreSQL assigns to each write. Rows store the XID that wrote them, and visibility rules compare XIDs.' },
		{ term: 'Wraparound', def: 'After about 2 billion new XIDs, an old XID would look like it is in the future. PostgreSQL stops assigning XIDs before that happens.' },
		{ term: 'VACUUM', def: 'The PostgreSQL command that, among other jobs, marks old rows as frozen so their XIDs no longer count. Autovacuum runs it in the background.' },
		{ term: 'Shard', def: 'One of several databases that each hold part of the keys. At Mandrill a hashing algorithm picks the shard for each key.' }
	],
	incident: {
		org: 'Mailchimp',
		title: 'What We Learned from the Recent Mandrill Outage',
		date: '2019-02-04',
		url: PM,
		steps: [
			{
				situation: [
					'11:58 UTC. Mandrill engineers open an investigation. Writes to shard4 fail, and apps retry them, so the load on shard4 keeps climbing.',
					'The first exception was logged more than 6 hours ago, at 05:35, among unrelated exceptions from other systems.'
				],
				q: 'What do you look at first?',
				options: [
					'The error that shard4 returns to a failed write',
					'The query plans of the slowest queries on shard4',
					'The CPU graphs of the Mandrill app servers',
					'The deploy log for changes since Friday'
				],
				answer: 0,
				why: 'The retries are a symptom: they exist because writes fail. The team spent an hour on the load first: "responders began looking for the source of the spiking load. An hour later, at 12:56 UTC, the wraparound was discovered."'
			},
			{
				situation: [
					'12:56 UTC. Shard4 reached the XID limit at 05:35 and went into what the postmortem calls "safety shutdown mode". It refuses every command that needs a new XID, so it takes no writes.',
					'The other shards work. Jobs that need to write to shard4 fail.'
				],
				q: 'How do you bring shard4 back?',
				options: [
					'Put it in standalone mode and run VACUUM',
					'Restart PostgreSQL to clear the shutdown',
					'Delete old rows with DELETE to free XIDs',
					'Restore last night\'s backup on a new server'
				],
				answer: 0,
				why: 'The postmortem: "it needs to be put into standalone mode and cleaned using the VACUUM command." A restart keeps the same old XIDs on disk, and a DELETE is a write that needs an XID. The team started the vacuum at 14:16 UTC.'
			},
			{
				situation: [
					'The vacuum is running. The team stops it, restarts it with configuration tweaks that speed it up, and estimates again. The answer is still days or weeks, and the highest estimate is 40 days.',
					'Two tables, Search and Url, are on the order of terabytes. Most other tables hold a few megabytes each.'
				],
				q: 'What do you start while the vacuum runs?',
				options: [
					'A dump and restore of shard4 without Search and Url',
					'A second VACUUM on the same tables in parallel',
					'A dump and restore of every table on shard4',
					'Nothing: let the vacuum run and post updates'
				],
				answer: 0,
				why: 'A dump and restore writes a new copy of the data, which gets fresh XIDs. The team ran one beside the vacuum and "omitted the Search and Url tables" to make it faster, but it "was still disastrously slow".'
			},
			{
				situation: [
					'Jobs that fail to write to shard4 queue on disk on the Mandrill app servers. Those jobs and the logs of their failures fill the disks, and disk space runs low on every app server.',
					'Mandrill writes its logs to a local disk on each server.'
				],
				q: 'What do you do about the disks?',
				options: [
					'Replace the storage volumes on the app servers',
					'Delete the jobs queued on disk to free space',
					'Turn off logging until shard4 is back',
					'Leave them: the jobs drain once shard4 is back'
				],
				answer: 0,
				why: 'The queued jobs are mail that customers are waiting for, and the logs are the team\'s view of the failures. The team "spun up a separate track of work to replace storage volumes across app servers". Running in the cloud let them expand storage quickly.'
			},
			{
				situation: [
					'16:30 UTC on 5 February, about 35 hours in. Mandrill deletes queued mail older than 48 hours by default. The vacuum and the dump are both still far from done.',
					'The team has checked that the app can run without the Search and Url tables.'
				],
				q: 'What do you do now?',
				options: [
					'Check that TRUNCATE frees their XIDs, then truncate both',
					'Delete the rows of Search and Url in small batches',
					'Wait for the dump and restore to finish',
					'Raise the 48-hour limit and keep the vacuum running'
				],
				answer: 0,
				why: 'The postmortem: "After verifying that this would free the associated XIDs, we decided to truncate the tables." They ran it at 19:12 UTC: "The vacuum completed roughly an hour after the truncation." The PostgreSQL docs name this as the one reason to use single-user mode in a wraparound: to "TRUNCATE or DROP unneeded tables to avoid needing to VACUUM them".'
			}
		],
		outcome: [
			'The hashing algorithm that spreads keys across shards favored shard4, so it took more writes than the others. Its autovacuum "likely fell behind due to the higher load, though it may have failed outright". At 05:35 UTC on 4 February its XID hit the limit.',
			'The team had seen the risk. In November 2018 the XIDs were "climbing to approximately half their total limit during peak load". They judged it not an immediate threat and put a ticket in the backlog for more monitoring.',
			'Sending from the backlog started at 21:36 UTC on 5 February, and the queues were back to normal by 01:00 UTC on 6 February. During the outage Mandrill sent only 80% of queued emails. Mailchimp refunded affected users for Mandrill purchases made between 1 January and 13 February 2019.',
			'By 22:40 UTC on 5 February the team had alerting for XID wraparound in place. The review also lists what slowed the response: access to Mandrill systems held by a few people, logging that needs a writable local disk, API errors mixed with application errors in the logs, and little view of job health.'
		]
	},
	quiz: [
		{
			q: 'Mandrill had several shards with the same schema. Why did only shard4 reach the XID limit?',
			options: [
				'The hashing favored shard4, so it took more writes and used XIDs faster',
				'Shard4 served the most reads, and each read uses an XID',
				'Shard4 ran an older PostgreSQL version with a smaller XID counter',
				'Autovacuum was turned off on shard4 to save disk space'
			],
			answer: 0,
			why: 'Each write consumes an XID. A shard with more writes reaches the limit first unless autovacuum keeps up. Shard4 was "hotter than the others", and its autovacuum fell behind or failed.'
		},
		{
			q: 'Why did truncating Search and Url let the vacuum finish in about an hour?',
			options: [
				'TRUNCATE removed terabytes of rows that the vacuum would have had to scan and freeze',
				'TRUNCATE resets the XID counter of the whole database to zero',
				'TRUNCATE moved the two tables to another shard with free XIDs',
				'TRUNCATE ended the long transactions that were holding the vacuum back'
			],
			answer: 0,
			why: 'The vacuum has to freeze every old row before the oldest XID can move forward. With the terabyte tables gone, only megabyte tables were left. The postmortem notes that the deleted data "included the largest table holding up the vacuum."'
		},
		{
			q: 'You run PostgreSQL. Which query tells you how close each database is to wraparound?',
			options: [
				'SELECT datname, age(datfrozenxid) FROM pg_database;',
				'SELECT datname, xact_commit FROM pg_stat_database;',
				'SELECT relname, n_dead_tup FROM pg_stat_user_tables;',
				'SELECT pid, backend_xid FROM pg_stat_activity;'
			],
			answer: 0,
			why: 'The docs: `datfrozenxid` "is a lower bound on the unfrozen XIDs appearing in that database", and `age()` counts transactions from it to now. Alert well before 2 billion: PostgreSQL warns at 40 million transactions from the limit and refuses new XIDs at 3 million.'
		}
	],
	recall: {
		q: 'What let shard4\'s vacuum finish about 37 hours into the outage?',
		a: 'Truncating the Search and Url tables, terabytes in size, at 19:12 UTC on 5 February. The vacuum completed about an hour later.'
	},
	sources: [
		{ title: 'Mailchimp: What We Learned from the Recent Mandrill Outage (2019)', url: PM },
		{ title: 'PostgreSQL docs: Preventing Transaction ID Wraparound Failures', url: PG }
	]
};
