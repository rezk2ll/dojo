const PIR = 'https://www.atlassian.com/blog/how-we-build/post-incident-review-april-2022-outage';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'atlassian-2022',
	part: 'Changes and config',
	title: 'Atlassian 2022: the script that deleted 883 sites',
	minutes: 10,
	hook: [
		'Tuesday 5 April 2022, 07:46 UTC. A customer of Atlassian Cloud opens a support ticket. Their users cannot reach Jira or Confluence.',
		'Internal monitoring has raised no alert. More customers lose Jira, Confluence, Opsgenie and Statuspage on their sites.',
		'At 08:17 UTC Atlassian starts its major incident process, and you join the incident team. Seven minutes later the incident is rated Critical.'
	],
	terms: [
		{ term: 'Multi-tenant data store', def: 'A database shared by many customers. Each shard holds the data of several tenants, isolated from each other.' },
		{ term: 'Soft delete', def: 'A deletion that only marks data as deleted. The data stays recoverable until a retention period ends.' },
		{ term: 'RTO', def: 'Recovery time objective: how quickly data must be recovered and returned to a customer.' },
		{ term: 'RPO', def: 'Recovery point objective: how much recent data a restore may lose, counted back from the failure.' }
	],
	incident: {
		org: 'Atlassian',
		title: 'Post-Incident Review on the Atlassian April 2022 outage',
		date: '2022-04-05',
		url: PIR,
		steps: [
			{
				situation: [
					'08:17 UTC. The first ticket came in at 07:46. Jira, Confluence, Opsgenie and Statuspage are all down on the affected sites.',
					'Internal monitoring shows nothing wrong.'
				],
				q: 'What do you check first?',
				options: [
					'Which scripts and changes touched those sites since 07:00 UTC',
					'Treat it as an attack and revoke all staff access first',
					'Wait for monitoring to confirm before you dig further',
					'Ask the customer to clear their cache and log in again'
				],
				answer: 0,
				why: 'At 08:53 UTC the team "confirmed that the customer support ticket and the script run were related". Monitoring had stayed quiet because "the sites were deleted via a standard workflow". The team also confirmed that this was not a cyberattack.'
			},
			{
				situation: [
					'08:53 UTC. A maintenance script deleted 883 sites between 07:38 and 08:01 UTC. About 700 belong to customers, the rest to Atlassian.',
					'Backups allow a restore to any point in the last 30 days. Each data store is multi-tenant: it also holds live data of customers who were not hit.',
					'The team has restored single deleted sites before. It has never restored hundreds at once.'
				],
				q: 'How do you start the restore?',
				options: [
					'Roll every shared database back to 07:30 UTC from backups',
					'Restore a few sites by hand while a second group automates the steps',
					'Assign one engineer per site and restore all 883 by hand',
					'Build a full batch restore tool before restoring any site'
				],
				answer: 1,
				why: 'The team split into a manual working group that restored a small number of sites and an automation working group that scripted the same steps for larger batches. A rollback of shared data stores would also erase the writes of every customer who was not affected.'
			},
			{
				situation: [
					'April 5, 11:13 UTC. Atlassian has posted on Statuspage that it found the root cause. Nobody can say yet how long the restore will take.',
					'The script also deleted each site\'s URL and its System Admin contacts. The support form requires a valid Cloud URL, so affected customers cannot file a ticket.'
				],
				q: 'What do you tell customers?',
				options: [
					'Post widely now with what you know and what you do not know yet',
					'Wait until you have a reliable restore date, then announce it',
					'Email the billing contacts on file and stay quiet in public',
					'Update only the support tickets that customers already filed'
				],
				answer: 0,
				why: 'Atlassian\'s first broad message was a tweet on April 7 at 00:56 UTC, and many billing contacts turned out to be outdated. The review says: "Rather than wait until we had a full picture, we should have been transparent about what we did know and what we didn\'t know."'
			},
			{
				situation: [
					'April 9. The current method creates a new site for each deleted one, with a new cloudId. It takes about 70 steps and about 48 hours per batch.',
					'Many systems store the cloudId inside their records, and third-party apps must be remapped site by site. At this pace, restoring everyone takes three weeks.'
				],
				q: 'What do you change?',
				options: [
					'Undelete the old records and keep the old site identifiers',
					'Add more engineers to run more batches of the same method',
					'Ask the app vendors to remap the new identifiers faster',
					'Restore the busiest sites and leave the free sites for later'
				],
				answer: 0,
				why: 'Restoration 2 re-created the deleted records, starting with the Catalogue Service, and reused the old identifiers. That "removed over half of the steps" and took about 12 hours per site, for 771 sites between April 14 and 17. Running two methods at once cost extra work: scripts had to be modified and validation was done twice.'
			},
			{
				situation: [
					'April 18. Every site is back. The script had passed peer review and a test in staging, and a first production run on 30 sites had gone fine.'
				],
				q: 'What do you fix first?',
				options: [
					'Make every deletion of customer data a soft delete with retention',
					'Add a second reviewer to every maintenance script',
					'Run every maintenance script on 30 sites before the full list',
					'Alert when more than 10 sites are deleted in one hour'
				],
				answer: 0,
				why: 'Atlassian "immediately blocked bulk sites deletes", then made soft deletes its first learning: "globally prevent the deletion of customer data and metadata that has not gone through a soft-delete process." The peer review focused on "which endpoint was being called and how", and the 30-site run used correct IDs, so neither checked what the new IDs named.'
			}
		],
		outcome: [
			'The script was meant to remove the legacy Insight app from customer sites. The team that requested it sent site IDs instead of app IDs. The API accepted both kinds of ID and deleted whatever the ID named, with no warning.',
			'The staging test could not catch it: "the IDs did not exist in the Staging environment." The first production run on 30 sites used IDs sourced before the miscommunication, so they were correct app IDs. A later update adds that the script also ran "with the wrong execution mode": permanent deletion instead of mark for deletion.',
			'883 sites of 775 customers were down for up to 14 days. The first sites came back on April 8 and the last on April 18. Data loss was capped at five minutes before the deletion, so Atlassian met its one hour RPO and missed its RTO. 57 customers restored early got some databases from an older point, and that data was recovered later.',
			'The listed fixes: soft deletes everywhere, with staged rollout and a tested rollback. Automated restores of many sites at once, practised in disaster recovery exercises. A playbook for large incidents and one for incident communications. Key contacts backed up outside the product, and a support path for customers without a valid site URL.'
		]
	},
	quiz: [
		{
			q: 'The script passed a test in staging. Why did that test not catch the wrong IDs?',
			options: [
				'The site IDs in the list did not exist in staging',
				'Staging ran an older version of the deletion API',
				'The test only checked the script\'s syntax',
				'Staging had no copy of the Insight app installed'
			],
			answer: 0,
			why: 'The review: the test "would not have detected that the IDs input were incorrect as the IDs did not exist in the Staging environment." A test with production IDs cannot run against data that only exists in production.'
		},
		{
			q: 'Why could Atlassian not roll the databases back to 07:37 UTC to bring the sites back?',
			options: [
				'The backups only kept the last 24 hours',
				'Each data store also holds live data of unaffected customers',
				'Point-in-time restore was turned off in production',
				'The script had also deleted the backups of those sites'
			],
			answer: 1,
			why: 'Each data store contains data from multiple customers, so the team had to "manually extract and restore individual pieces from our backups". A rollback would have erased hours of writes by every other customer on the same stores. The backups kept 30 days.'
		},
		{
			q: 'Which fix stops a wrong ID list from destroying data for good?',
			options: [
				'A second reviewer on every maintenance script',
				'An alert when many sites are deleted in an hour',
				'A soft delete that keeps the data until retention expires',
				'A dry run of each script against staging'
			],
			answer: 2,
			why: 'With a soft delete the data stays in production until a retention period expires, so a wrong deletion can be undone quickly. A reviewer, an alert or a staging run can all miss a list of valid but wrong IDs, as the April 2022 review and staging test did.'
		}
	],
	recall: {
		q: 'What did the deletion API do with the IDs it was given, and how many sites did it remove?',
		a: 'It received site IDs instead of Insight app IDs and deleted each whole site: 883 sites of 775 customers, between 07:38 and 08:01 UTC on 5 April 2022.'
	},
	sources: [
		{ title: 'Atlassian, Post-Incident Review on the Atlassian April 2022 outage', url: PIR },
		{ title: 'Atlassian, Update on the Atlassian outage affecting some customers (April 2022)', url: 'https://www.atlassian.com/blog/how-we-build/april-2022-outage-update' }
	]
};
