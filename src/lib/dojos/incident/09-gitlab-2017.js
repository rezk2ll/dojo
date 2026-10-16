const POST = 'https://about.gitlab.com/blog/postmortem-of-database-outage-of-january-31/';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'gitlab-2017',
	part: 'Data',
	title: 'GitLab 2017: the deleted database directory',
	minutes: 10,
	hook: [
		'Tuesday 31 January 2017, around 19:00 UTC. Database load on GitLab.com climbs, probably from spam. Many users cannot post comments on issues and merge requests.',
		'GitLab.com runs on one PostgreSQL primary, db1.cluster.gitlab.com, and one hot standby, db2.cluster.gitlab.com, used only for failover.',
		'Getting the load under control takes several hours. Around 23:00 UTC you are one of the engineers on it, and the standby falls behind.'
	],
	terms: [
		{ term: 'WAL segment', def: 'A file of PostgreSQL\'s write-ahead log. A standby replays these files to stay in step with the primary.' },
		{ term: 'Replication lag', def: 'How far the standby is behind the primary, in WAL it has not yet replayed.' },
		{ term: 'pg_basebackup', def: 'The PostgreSQL tool that copies a running database cluster over a replication connection, used to start a new standby.' },
		{ term: 'LVM snapshot', def: 'A copy of a disk volume at one moment, taken by the Linux volume manager. GitLab used these to copy production into staging.' }
	],
	incident: {
		org: 'GitLab',
		title: 'Postmortem of database outage of January 31',
		date: '2017-01-31',
		url: POST,
		steps: [
			{
				situation: [
					'23:00 UTC. Replication to db2 has failed: the WAL segments db2 needs are already removed from db1. GitLab.com does not use WAL archiving.',
					'db1 still serves all traffic.'
				],
				q: 'How do you get a working standby back?',
				options: [
					'Raise wal_keep_segments on db1 and wait for db2 to catch up',
					'Promote db2 to primary and rebuild db1 as the standby',
					'Empty db2\'s data directory and copy db1 with pg_basebackup',
					'Copy the missing WAL from db1\'s archive directory to db2'
				],
				answer: 2,
				why: 'The PostgreSQL docs: without an archive the primary "might recycle old WAL segments before the standby has received them", and then "the standby will need to be reinitialized from a new base backup." That needs an empty data directory. A promoted db2 would be missing data, and there is no archive to copy from.'
			},
			{
				situation: [
					'An engineer has wiped db2\'s data directory. pg_basebackup hangs with no output, even with --verbose. After a few tries it says db1 has too few replication connections: max_wal_senders is 3.',
					'The team raises max_wal_senders to 32. PostgreSQL on db1 now refuses to restart and reports too many semaphores. max_connections is set to 8000.'
				],
				q: 'What do you change to get db1 up again?',
				options: [
					'Set max_wal_senders back to 3 and retry',
					'Lower max_connections from 8000 to 2000',
					'Reboot the db1 machine to clear the semaphores',
					'Run pg_basebackup against db2 instead of db1'
				],
				answer: 1,
				why: 'Too many semaphores "can happen when, for example, max_connections is set too high". The value of 8000 had been applied almost a year earlier. Lowered to 2000, it let PostgreSQL restart "without issues". With 3 senders, pg_basebackup would hit the same connection error.'
			},
			{
				situation: [
					'23:30 UTC. pg_basebackup still sits silent. strace shows it blocked in a poll call.',
					'An engineer suspects that earlier attempts left files in db2\'s data directory, and wants to wipe it again.'
				],
				q: 'What do you do before the next rm?',
				options: [
					'Run it at once, since db2 holds no useful data',
					'Wipe the data directory on both hosts to start clean',
					'Check the hostname in the shell, then wipe only on db2',
					'Restart PostgreSQL on db1 so it drops the stuck connection'
				],
				answer: 2,
				why: 'The engineer wiped the directory "errantly thinking they were doing so on the secondary". It ran on db1 and removed about 300 GB before they stopped it a second or two later. The silence was normal: pg_basebackup waits for the primary to send data, which neither the runbooks nor the PostgreSQL docs clearly documented.'
			},
			{
				situation: [
					'db1 and db2 both have empty data directories. The S3 bucket meant for the daily pg_dump backups is empty. The database servers have no disk snapshots.',
					'Two LVM snapshots exist: the daily one for staging, almost 24 hours old, and one an engineer took by hand at about 17:20 UTC.'
				],
				q: 'What do you restore from?',
				options: [
					'The daily LVM snapshot taken for staging',
					'The LVM snapshot taken by hand at about 17:20',
					'The project data rebuilt from the Git repositories',
					'The last pg_dump file found on a developer laptop'
				],
				answer: 1,
				why: 'The team used the snapshot from 6 hours before the outage, "as it was our only option to reduce data loss as much as possible (the alternative was to lose almost 24 hours of data)". Git repositories hold code, and projects rebuilt from them came back without issues or merge requests.'
			},
			{
				situation: [
					'February 1. The copy from staging to production takes about 18 hours: the staging disks are throttled to around 60 Mbps. The copy is the state of 17:20 on January 31.',
					'Users created rows between 17:20 and the deletion. Those rows are lost, but their IDs were already handed out.'
				],
				q: 'What do you do before you reopen GitLab.com?',
				options: [
					'Reset all sequences to the values in the snapshot',
					'Increment every database sequence by 100,000',
					'Ask users to recreate what they posted after 17:20',
					'Reopen at once and fix ID clashes as users report them'
				],
				answer: 1,
				why: 'The recovery plan was to "Increment all database sequences by 100,000 so one can\'t re-use IDs that might have been used before the outage." The team also restored the webhooks, which the staging copy strips, from a separate copy of the snapshot. The final steps were done around 18:00 UTC on February 1.'
			}
		],
		outcome: [
			'An engineer ran the wipe meant for the secondary on the primary, db1. The chain behind it: spam plus a job deleting an employee wrongly flagged for abuse raised the load, replication fell behind, and the only fix was a manual re-sync that was not automated or documented properly.',
			'None of the backups worked. pg_dump ran on an application server with no PostgreSQL data directory, so Omnibus picked pg_dump 9.2 against a 9.6 database, and every run failed. The failure emails were rejected because they were not signed for DMARC. Nobody owned testing the backups.',
			'GitLab.com was down for about 18 hours. Database changes made between 17:20 and the deletion were lost: an estimated 5,000 projects, 5,000 comments and 700 new user accounts. Git repositories and wikis were not affected.',
			'Among the listed fixes: a shell prompt on every host that shows the host and environment, monitoring for backups, automated tests that restore PostgreSQL backups, and an owner for data durability. LVM snapshots of production now run every hour.'
		]
	},
	quiz: [
		{
			q: 'Why was the S3 bucket for pg_dump backups empty?',
			options: [
				'An S3 lifecycle rule deleted the backups after one day',
				'pg_dump 9.2 ran against a 9.6 database and failed every time',
				'The backup job ran on db2, which was empty after the wipe',
				'The credentials for the S3 bucket had expired'
			],
			answer: 1,
			why: 'The job ran on an application server with no data directory, so Omnibus defaulted to PostgreSQL 9.2 binaries. pg_dump refuses a different major version, and the error emails were rejected for missing DMARC, so nobody saw the failures.'
		},
		{
			q: 'Why could db2 not simply catch up once the load dropped?',
			options: [
				'db2 ran out of disk space during the spam',
				'db1 had removed the WAL segments db2 needed',
				'db2 ran an older PostgreSQL version than db1',
				'Replication had been turned off during the spam'
			],
			answer: 1,
			why: 'A standby replays WAL from the primary or from an archive. db1 had recycled the segments, and GitLab.com did not use WAL archiving, so db2 had to be rebuilt from a new base backup.'
		},
		{
			q: 'What made the restore take about 18 hours?',
			options: [
				'Replaying 24 hours of WAL on top of the snapshot',
				'Copying the data from staging disks throttled to about 60 Mbps',
				'Rebuilding every index after the copy',
				'Validating each of the 5,000 lost projects by hand'
			],
			answer: 1,
			why: 'The only usable snapshot lived on staging, which used cheap network disks to save cost. "There was no network or processor bottleneck, the bottleneck was in the drives."'
		}
	],
	recall: {
		q: 'What command went to the wrong host at GitLab on 31 January 2017, and what did it remove?',
		a: 'The wipe of the PostgreSQL data directory, meant for the secondary db2, ran on the primary db1 and removed about 300 GB before the engineer stopped it.'
	},
	sources: [
		{ title: 'GitLab, Postmortem of database outage of January 31', url: POST },
		{ title: 'PostgreSQL 9.6 documentation, Log-Shipping Standby Servers', url: 'https://www.postgresql.org/docs/9.6/warm-standby.html' },
		{ title: 'PostgreSQL 9.6 documentation, pg_basebackup', url: 'https://www.postgresql.org/docs/9.6/app-pgbasebackup.html' }
	]
};
