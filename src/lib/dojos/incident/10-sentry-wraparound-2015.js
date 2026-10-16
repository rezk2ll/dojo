const POST = 'https://blog.sentry.io/transaction-id-wraparound-in-postgres/';
const DOCS = 'https://www.postgresql.org/docs/9.4/routine-vacuuming.html';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'sentry-wraparound-2015',
	part: 'Data',
	title: 'Sentry 2015: PostgreSQL transaction ID wraparound',
	minutes: 10,
	hook: [
		'Monday 20 July 2015, US working hours. The main PostgreSQL database of hosted Sentry stops accepting writes.',
		'Sentry is very write-heavy: every event it receives needs at least one row in Postgres. Events keep arriving in the queue, and none can be stored.',
		'You are on the Sentry team. Reads still work, but every write fails.'
	],
	terms: [
		{ term: 'XID', def: 'A PostgreSQL transaction ID: a 32-bit counter that Postgres compares to decide which row versions a transaction can see.' },
		{ term: 'Transaction ID wraparound', def: 'The XID counter wraps around to zero, and rows written in the past suddenly look like they are in the future.' },
		{ term: 'VACUUM', def: 'The Postgres maintenance command that, among other work, marks old rows as frozen so they stay visible after wraparound. Autovacuum runs it automatically.' },
		{ term: 'Single-user mode', def: 'A way to start the Postgres server outside normal operation. The wraparound shutdown does not apply there, so the docs ask for it to run VACUUM.' }
	],
	incident: {
		org: 'Sentry',
		title: 'Transaction ID Wraparound in Postgres',
		date: '2015-07-20',
		url: POST,
		steps: [
			{
				situation: [
					'The team finds the cause: the XID wraparound protection has kicked in. Postgres refuses commands when fewer than one million transactions are left before the maximum XID.',
					'Sentry has just provisioned new database machines, with much more memory and CPU set aside for maintenance work such as vacuuming.'
				],
				q: 'Where do you run the vacuum?',
				options: [
					'Fail the primary over to the new hardware and vacuum there',
					'Restore last night\'s backup onto the old primary',
					'Add read replicas and wait for traffic to drop',
					'Keep the old primary and vacuum one table at a time'
				],
				answer: 0,
				why: '"Immediately when we identified the XID issue we had failed the primary master over to the new hardware, which is where we\'d been running the vacuums." The new machines had the extra memory and CPU that vacuuming needed.'
			},
			{
				situation: [
					'Postgres already runs autovacuums on the big tables. Nobody knows if a VACUUM can resume after a restart, or how long these will take.',
					'The usual advice is to stop the database and restart in single-user mode. A restart could also add 100 GB of memory for maintenance.'
				],
				q: 'What do you do with the running autovacuums?',
				options: [
					'Restart now in single-user mode, as the docs advise',
					'Let the running autovacuums finish with the current settings',
					'Restart with 100 GB more maintenance memory and vacuum again',
					'Kill them and run a manual VACUUM table by table'
				],
				answer: 1,
				why: 'Sentry bet that it "was better to let autovacuum finish with our current configuration than to risk interrupting it", for fear that a restart would make the downtime longer. Two days later, a test machine on the old hardware was still running a single-user vacuum after almost 24 hours.'
			},
			{
				situation: [
					'The application reads from replicas, so users see their data but nothing new gets in. The backlog of events in the queue grows, and the Redis buffers are getting out of control.'
				],
				q: 'What do you do about the backlog?',
				options: [
					'Keep buffering until Postgres takes writes again',
					'Add Redis memory so the buffers can grow further',
					'Write the queued events to the replicas instead',
					'Flush the whole backlog of queued events'
				],
				answer: 3,
				why: 'The team "decided to flush the entire backlog of events" to stop the queue and Redis from failing too. The flushed events were dropped. Replicas are read-only, so they cannot take the writes.'
			},
			{
				situation: [
					'Nearly 3 hours in. The autovacuums have finished, the logs show no failure, and Postgres still refuses writes.',
					'Postgres\' internal statistics show every relation vacuumed except one. It is a huge table that maps each event to its rollup, used only to look up an event by ID and to catch duplicate events.'
				],
				q: 'What do you do?',
				options: [
					'Restart in single-user mode and vacuum that table',
					'Restore that table from a replica and vacuum again',
					'Truncate that table and accept losing its rows',
					'Wait for autovacuum to pick the table up again'
				],
				answer: 2,
				why: 'Sentry "made the call to truncate the table. Five minutes later, the system was fully restored." The table only served non-critical features, and the replicas held full copies of it.'
			},
			{
				situation: [
					'Postgres accepts writes again. Before the outage Sentry ran with too high an autovacuum_freeze_max_age, the default 3 autovacuum workers, and a long delay between vacuum steps.'
				],
				q: 'What do you change in the configuration?',
				options: [
					'Turn off autovacuum and vacuum by hand at night',
					'Lower autovacuum_freeze_max_age and use 6 workers with no cost delay',
					'Raise autovacuum_freeze_max_age so forced vacuums run less often',
					'Raise the delay so autovacuum puts less load on the system'
				],
				answer: 1,
				why: 'The new settings: autovacuum_freeze_max_age = 500000000, autovacuum_max_workers = 6, autovacuum_naptime = \'15s\', autovacuum_vacuum_cost_delay = 0 and maintenance_work_mem = \'10GB\'. The post calls turning off autovacuum or running it at low traffic times "awful advice".'
			}
		],
		outcome: [
			'Every transaction that writes rows takes a new XID from a 32-bit counter. Postgres must vacuum each table at least once every two billion transactions to freeze old rows. Sentry\'s write load used XIDs faster than autovacuum froze its largest tables.',
			'When fewer than one million XIDs were left, Postgres stopped accepting commands. Hosted Sentry was down for most of the US working day on 20 July 2015, and the queued events were flushed.',
			'Writes came back five minutes after the team truncated the one table autovacuum had not finished. The fixes: new hardware with 256 GB of memory, half of it added for vacuum, a more aggressive autovacuum configuration, and a plan to split relations across several databases.'
		]
	},
	quiz: [
		{
			q: 'What does PostgreSQL do when fewer than one million XIDs are left before wraparound?',
			options: [
				'It wraps the counter to zero and keeps running',
				'It stops accepting commands until the database is vacuumed',
				'It starts an autovacuum and keeps writing at reduced speed',
				'It switches the database to a new 64-bit counter'
			],
			answer: 1,
			why: 'Postgres refuses commands so that old rows never appear "in the future". The docs: the error reads "database is not accepting commands to avoid wraparound data loss", and the fix is VACUUM in single-user mode.'
		},
		{
			q: 'How does VACUUM protect old rows from wraparound?',
			options: [
				'It copies them into a new table with fresh XIDs',
				'It deletes rows older than two billion transactions',
				'It marks them frozen, so they count as older than every normal XID',
				'It resets the XID counter of the whole cluster to zero'
			],
			answer: 2,
			why: 'A frozen row is treated as written by FrozenTransactionId, which "is always considered older than every normal XID". It stays visible to every transaction, however far the counter moves.'
		},
		{
			q: 'Why could Sentry truncate the last unvacuumed table with little risk?',
			options: [
				'The table held only event lookups by ID and duplicate checks',
				'Postgres keeps a copy of truncated tables for 24 hours',
				'The table was empty after the backlog was flushed',
				'Autovacuum had already frozen most of its rows'
			],
			answer: 0,
			why: 'The table mapped events to rollups and was used only to look up an event by ID and to catch duplicates. Those features were not critical, and the replicas held full backups.'
		}
	],
	recall: {
		q: 'How did Sentry get writes back on 20 July 2015?',
		a: 'It truncated the one huge table autovacuum had not finished, the map of events to rollups. Five minutes later the system was fully restored, after nearly 3 hours of waiting on autovacuum.'
	},
	sources: [
		{ title: 'Sentry, Transaction ID Wraparound in Postgres', url: POST },
		{ title: 'PostgreSQL 9.4 documentation, Routine Vacuuming (preventing transaction ID wraparound)', url: DOCS }
	]
};
