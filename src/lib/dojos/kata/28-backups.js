/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'backups',
	part: 'Reliability',
	title: 'A backup plan',
	minutes: 10,
	hook: [
		'Tuesday, 14:20. A developer runs a cleanup script against the wrong database and deletes 3 million invoices from a 2 TB PostgreSQL. The replicas delete them too, a few milliseconds later.',
		'The team has a nightly `pg_dump`. Nobody has restored it in a year. The first try takes 9 hours and fails at 80% on a full disk. The second try works, and the invoices created since 2 a.m. are gone.',
		'The board now asks for numbers: how much data can the company lose, how long a restore takes, and proof that it works.'
	],
	terms: [
		{ term: 'RPO', def: 'Recovery point objective: the most data, counted in time, the business accepts to lose. Here, 5 minutes.' },
		{ term: 'RTO', def: 'Recovery time objective: the longest the business accepts to wait from the decision to restore until the database is back. Here, 2 hours.' },
		{ term: 'WAL archiving', def: 'PostgreSQL hands each finished write-ahead log segment, 16 MB by default, to a command that copies it off the server. A base backup plus those segments can rebuild the database at any moment in between.' }
	],
	kata: {
		brief: [
			'An invoicing company runs one PostgreSQL database of **2 TB**. It writes about 20 GB of WAL a day, with a quiet night from 1 a.m. to 6 a.m. About 25 GB of table and index files change each day. Backups must be kept 30 days.',
			'The company accepts to lose at most 5 minutes of data, and the database must be back in **under 2 hours** after someone decides to restore. That includes restoring to a moment before a bad script ran, like 14:19 on a Tuesday.',
			'In this brief, a restore server reads from the backup server at 400 MB/s with 8 parallel processes, and replays one day of WAL in 15 minutes. The plan must also prove, every month, that a restore works and fits in 2 hours.'
		],
		minutes: 10,
		checklist: [
			'Your design says the longest time a commit can sit on the primary before a copy exists elsewhere, and it is under 5 minutes.',
			'Your design adds up the restore time (download, then WAL replay) with the brief’s numbers, and the sum is under 2 hours.',
			'Your design says how to restore to 14:19, and not to the latest state.',
			'Your design keeps a copy that survives the loss of the whole datacenter.',
			'Your design gives the backup storage needed for 30 days.',
			'Your design says who or what runs the monthly restore test, and what counts as a pass.'
		],
		sample: [
			'The sample uses pgBackRest with two repositories: repo1 on a backup server in the same datacenter for fast restores, and repo2 in an object store in another region. A full backup runs every Sunday at 6:30 and a differential backup Monday to Saturday at 6:30. A differential copies only the files changed since the last full.',
			'WAL. PostgreSQL runs `archive_command = \'pgbackrest --stanza=main archive-push %p\'` for each finished 16 MB segment. During the quiet night, a segment can take hours to fill, so a commit could wait hours before it is copied. The sample sets `archive_timeout = 60`: PostgreSQL then switches to a new segment after 60 seconds if there was any activity, so the worst loss is about **1 minute** plus the copy time.',
			'The cost of `archive_timeout`: a segment closed early is still 16 MB on disk. In the worst case that is 1 440 segments a day, about 23 GB, close to the normal 20 GB of WAL, so the archive at most doubles.',
			'Restore time, worst case on Saturday afternoon. The full backup is 2 TB at 400 MB/s: 5 000 seconds, about 83 minutes. The differential holds 6 days of changes, 150 GB, about 6 minutes. Then PostgreSQL replays the WAL since 6:30 that morning, under 15 minutes. Total: about **104 minutes**, 16 minutes under the target.',
			'Point in time. The restore runs `pgbackrest --stanza=main --type=time "--target=2026-10-13 14:19:00+00" --target-action=promote restore`. PostgreSQL replays the WAL up to 14:19 and stops there, so the delete at 14:20 is never applied.',
			'Storage per repository, before compression. `repo1-retention-full=6` keeps 6 full backups, so right after a Sunday full the oldest is 35 days old: 12 TB. `repo1-retention-diff=6` keeps the last 6 differentials, 25 + 50 + ... + 150 GB, about 0.5 TB. The WAL for 42 days at 20 GB a day adds under 1 TB.',
			'Proof. On the first Monday of each month a scheduled job restores repo1 to a spare server at "1 hour ago". It passes when PostgreSQL accepts connections in under 2 hours and the count of invoices created before that moment matches production. A failed or slow test pages the database team.',
			'The main choice is daily differentials. With only a weekly full, a Saturday restore would replay 6 days of WAL, about 90 minutes, and the total would pass 2 hours. The sample gives up the same speed for old targets: a restore to 3 weeks ago uses an older full and up to 6 days of WAL, so it takes over 2 hours.'
		]
	},
	quiz: [],
	recall: {
		q: 'In the sample, what keeps the data loss under 5 minutes, and how long does the worst restore take?',
		a: '`archive_timeout = 60` closes a WAL segment at least every minute. The worst restore, on a Saturday, takes about 104 minutes: 83 for the full, 6 for the differential, 15 for WAL.'
	},
	sources: [
		{ title: 'PostgreSQL documentation, Continuous Archiving and Point-in-Time Recovery', url: 'https://www.postgresql.org/docs/current/continuous-archiving.html' },
		{ title: 'PostgreSQL documentation, Write Ahead Log settings (archive_timeout)', url: 'https://www.postgresql.org/docs/current/runtime-config-wal.html' },
		{ title: 'pgBackRest User Guide', url: 'https://pgbackrest.org/user-guide.html' }
	]
};
