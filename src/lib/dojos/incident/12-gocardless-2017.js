const PM = 'https://gocardless.com/blog/incident-review-api-and-dashboard-outage-on-10th-october/';
const REPO = 'https://github.com/gocardless/our-postgresql-setup/blob/c88edd055253f303bac4058d7e2e1a808797a23a/README.md#running-a-zero-downtime-migration';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'gocardless-2017',
	part: 'Data',
	title: 'GoCardless 2017: the database cluster that did not fail over',
	minutes: 10,
	hook: [
		'Tuesday 10 October 2017, 15:09 British Summer Time. Monitoring at GoCardless, a payments company, reports a total outage: every request to the API and the Dashboard returns an error.',
		'Payments, merchants and customer details live in one PostgreSQL cluster of 3 nodes: a primary, a synchronous replica and an asynchronous replica. A tool called Pacemaker runs on each node and promotes a replica when the primary fails.',
		'When that promotion works, an outage like this one lasts 1 or 2 minutes.'
	],
	terms: [
		{ term: 'Synchronous replica', def: 'A replica the primary waits for: a write is confirmed to the client only after this replica has received it.' },
		{ term: 'Pacemaker', def: 'Cluster software that runs on each node, decides where each resource (a Postgres process, an IP address) runs, and moves it when a node fails.' },
		{ term: 'Virtual IP (VIP)', def: 'An IP address that Pacemaker moves between nodes. The Rails apps connect to the VIP, so they always reach the current primary.' },
		{ term: 'Colocation rule', def: 'A Pacemaker rule that says two resources must, or must never, run on the same node.' }
	],
	incident: {
		org: 'GoCardless',
		title: 'Incident review: API and Dashboard outage on 10 October 2017',
		date: '2017-10-10',
		url: PM,
		steps: [
			{
				situation: [
					'15:11. The team sees evidence of a disk array failure on the primary. The cluster has not failed over to the synchronous replica, and nobody knows why yet.',
					'The primary is still powered on, with a broken disk array.'
				],
				q: 'What do you do first?',
				options: [
					'Power off the broken primary node',
					'Reboot the primary and hope the array comes back',
					'Restore last night\'s backup on a spare server',
					'Wait 10 more minutes for Pacemaker to act'
				],
				answer: 0,
				why: 'At 15:17 the team powered it off "so that we don\'t have a machine in the cluster that is online, but with a broken disk array." They expected Pacemaker to promote a replica once only the two replicas were left. Pacemaker promoted neither.'
			},
			{
				situation: [
					'15:18. The primary is off. The team runs `crm resource cleanup` to clear Pacemaker\'s error counts so it rediscovers the state of the Postgres instances. Nothing changes.',
					'You plan to promote a replica by hand. Two are left: the synchronous one and the asynchronous one.'
				],
				q: 'Which replica do you promote?',
				options: [
					'The synchronous replica',
					'The asynchronous replica',
					'Whichever replica has the lower load',
					'Neither: build a new node from the WAL archive'
				],
				answer: 0,
				why: 'The primary waits for the synchronous replica before it confirms a write, so that replica "is guaranteed to have a copy of every write (e.g. new payment) that the primary accepted." The asynchronous one can be missing the last payments.'
			},
			{
				situation: [
					'For an hour the team tries to promote the synchronous replica through Pacemaker. They set `maintenance-mode=true`, remove the replica flag from `recovery.conf`, and take the cluster out of maintenance mode.',
					'Every time, Pacemaker brings the replica back with its original `recovery.conf`, and there is still no primary. It is 16:18.'
				],
				q: 'What do you do now?',
				options: [
					'Leave Pacemaker in maintenance mode and start the new primary by hand',
					'Try the `recovery.conf` edit again with Pacemaker stopped on one node',
					'Reinstall Pacemaker on the two replicas and let it start from scratch',
					'Open a ticket with the Pacemaker maintainers and wait for advice'
				],
				answer: 0,
				why: 'The team decided "our attempts at this approach have run on for too long". They set maintenance mode "one last time, configure the synchronous replica to be a primary, and start Postgres ourselves."'
			},
			{
				situation: [
					'Postgres runs as primary on the old synchronous replica. Pacemaker manages the VIP the apps connect to, and Pacemaker is in maintenance mode.'
				],
				q: 'How do the apps reach the new primary?',
				options: [
					'Point the apps at the real IP address of the new primary',
					'Take Pacemaker out of maintenance mode so it moves the VIP',
					'Restart the apps so they reconnect to the same VIP',
					'Add a DNS name for the cluster and wait for caches to expire'
				],
				answer: 0,
				why: 'Out of maintenance mode, Pacemaker had reverted the promotion every time. The team reconfigured the backend apps "to connect to the actual IP address of the new primary". The change was rolling out at 16:46, and monitoring showed the API and Dashboard back at 16:59.'
			},
			{
				situation: [
					'16:59. The service is back on one primary and one replica. Pacemaker is still in maintenance mode, so no failover happens if a node dies now. The team expects to run like this for days, maybe a week or two.'
				],
				q: 'What do you do first?',
				options: [
					'Add a third node as a replica and a VIP you move by hand',
					'Take Pacemaker out of maintenance mode on this cluster',
					'Start the root cause hunt and leave the cluster as it is',
					'Fail back to the old primary once its disks are replaced'
				],
				answer: 0,
				why: 'The next priority "was to restore the database cluster to its usual level of redundancy": a third node as an asynchronous replica, and a new VIP "to be managed manually by the infrastructure team". The next day they judged they had "taken too much manual intervention on our existing database cluster" to bring Pacemaker back on it.'
			}
		],
		outcome: [
			'The outage lasted 1 hour and 50 minutes, and every request to the API and the Dashboard failed. The trigger: the RAID controller on the primary "logged the simultaneous loss of 3 disks from the array". Pacemaker saw Postgres was unhealthy, but "each time it couldn\'t decide where that primary should run."',
			'The team rebuilt the cluster in Docker containers and scripted failures until they had three conditions that together broke promotion. A non-zero `default-resource-stickiness`. A Backup VIP with a -INF colocation rule against the Postgres primary, running on the synchronous replica. And a Postgres subprocess crash on the synchronous replica at almost the same time as the primary failed.',
			'The fix was to write the rule the other way round: an INF preference between the Backup VIP and a replica, instead of -INF between the Backup VIP and the primary. With that, the cluster promoted the synchronous replica under the same failures. An invalid WAL file in the logs turned out to play no part.',
			'The team then moved to a new cluster managed by Pacemaker. They used PgBouncer to pause incoming queries during the switch, and announced a maintenance window as a precaution. They also planned harsher fault injection, because Pacemaker had handled failures for two years and the team\'s manual skills had faded.'
		]
	},
	quiz: [
		{
			q: 'Which change made the rebuilt cluster promote the synchronous replica under the same failures?',
			options: [
				'Writing the Backup VIP rule as INF with a replica instead of -INF with the primary',
				'Setting `default-resource-stickiness` higher so the primary stays put',
				'Removing the `restore_command` so replicas never read the WAL archive',
				'Adding a fourth node so the Backup VIP always has somewhere to run'
			],
			answer: 0,
			why: 'Both rules seem to say the same thing: keep the Backup VIP off the primary. Pacemaker handled them differently during promotion. With the -INF rule it could not place the new primary, even though the asynchronous replica was free to take the Backup VIP.'
		},
		{
			q: 'GoCardless always had at least 2 copies of a payment before it answered the API call. Where was the second copy?',
			options: [
				'On the synchronous replica, which the primary waits for before confirming',
				'On the asynchronous replica, which gets every write a few seconds later',
				'In the WAL archive on the backup server, written by `archive_command`',
				'In PgBouncer\'s queue, which holds queries until the replica confirms'
			],
			answer: 0,
			why: 'With synchronous replication the primary waits until the replica has received the WAL for a write. Only then does the query return, so a confirmed payment is on two machines.'
		},
		{
			q: 'The bug only showed up when two processes crashed at almost the same moment. How did the team find it?',
			options: [
				'They ran the cluster in Docker and scripted failures until it broke the same way',
				'They read the Pacemaker source until they found the colocation code path',
				'They waited for the next disk failure in production with more logging on',
				'They matched the invalid WAL log line against the Postgres source'
			],
			answer: 0,
			why: 'Clusters in containers start and stop quickly, so the team could try many failure combinations, then remove steps until three conditions were left. The WAL log line was matched against the Postgres source too, but it was a red herring.'
		}
	],
	recall: {
		q: 'Which Pacemaker rule stopped GoCardless\'s cluster from promoting a new primary?',
		a: 'A colocation rule with -INF between the Backup VIP and the Postgres primary, while the Backup VIP ran on the synchronous replica. Rewritten as INF between the Backup VIP and a replica, promotion worked.'
	},
	sources: [
		{ title: 'GoCardless: Incident review: API and Dashboard outage on 10 October 2017', url: PM },
		{ title: 'gocardless/our-postgresql-setup: Running a zero-downtime migration', url: REPO }
	]
};
