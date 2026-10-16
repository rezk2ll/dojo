const REPORT = 'https://status.cloud.google.com/incidents/ow5i3PPK96RduMcb1SsW';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'google-cloud-2025',
	part: 'Changes and config',
	title: 'Google Cloud 2025: the quota policy with blank fields',
	minutes: 10,
	hook: [
		'Thursday 12 June 2025, 10:49 PDT. External API requests to Google Cloud and Google Workspace start failing with 503 errors.',
		'The errors come from every region at the same time. API and console access fails on and off for Cloud Storage, IAM, BigQuery and dozens of other products.',
		'You are on Google\'s Site Reliability Engineering team. You start triage at 10:51, two minutes after the first errors.'
	],
	terms: [
		{ term: 'Service Control', def: 'The Google binary that checks whether each incoming API request is authorized and within quota. It reads quota and policy data from a regional datastore.' },
		{ term: 'Feature flag', def: 'A switch that turns new code on gradually, region by region and project by project, starting with internal projects.' },
		{ term: 'Fail open', def: 'When a check fails, the service still serves the request instead of rejecting it.' },
		{ term: 'Randomized exponential backoff', def: 'Each retry waits longer than the last, plus a random delay, so clients that failed together do not retry together.' }
	],
	incident: {
		org: 'Google Cloud',
		title: 'Multiple GCP products are experiencing Service issues',
		date: '2025-06-12',
		url: REPORT,
		steps: [
			{
				situation: [
					'10:51 PDT. Service Control tasks crash and restart in every region at once.',
					'The last Service Control binary release started on May 29. It went out region by region, and no region had trouble with it for two weeks.'
				],
				q: 'What do you look for first?',
				options: [
					'A change that reached every region in the last few minutes',
					'A region where the May 29 binary rollout went wrong',
					'A spike of incoming traffic from one large customer',
					'A failed disk or network link in one data center'
				],
				answer: 0,
				why: 'A crash in every region within the same minutes points at something replicated globally. At about 10:45 a policy change was written to the Spanner tables Service Control reads, and "this metadata was replicated globally within seconds". The root cause was identified within 10 minutes.'
			},
			{
				situation: [
					'11:00 PDT. The new policy has blank fields. The May 29 code added a quota check that reads them and hits a null pointer, so every task crashes as soon as it loads the policy.',
					'That code has no feature flag. It does ship with a red button that turns off the new policy serving path.'
				],
				q: 'How do you stop the crashes?',
				options: [
					'Restart every Service Control task in every region',
					'Roll out the red button to turn off the new serving path',
					'Send API traffic to the region with the fewest errors',
					'Wait for the crash loop to slow down by itself'
				],
				answer: 1,
				why: 'A restarted task reads the same policy and crashes again, and every region is failing. The red button was ready to roll out about 25 minutes after the start and fully rolled out within 40 minutes. Smaller regions recovered first.'
			},
			{
				situation: [
					'About 11:30 PDT. Most regions recover. In us-central1, the Service Control tasks restart at the same time and all hit the same Spanner table.',
					'The table is overloaded. Service Control has no randomized exponential backoff, so the tasks retry together.'
				],
				q: 'What do you do in us-central1?',
				options: [
					'Restart all tasks again so they come up on fresh machines',
					'Throttle task creation and move reads to multi-region databases',
					'Add more Service Control tasks to absorb the load',
					'Wait for the tasks to finish their retries on their own'
				],
				answer: 1,
				why: 'The team "throttled task creation to minimize the impact on the underlying infrastructure and routed traffic to multi-regional databases to reduce the load". More tasks or another mass restart add load to the same table. Full recovery in us-central1 still took up to about 2 hours 40 minutes.'
			},
			{
				situation: [
					'Customers have no update yet. Cloud Service Health, Google\'s status page, is down because of this outage.',
					'Some customers run their monitoring on Google Cloud, so their own alerts are failing too.'
				],
				q: 'How do you reach customers?',
				options: [
					'Wait until Cloud Service Health is back, then post there',
					'Post on a channel that does not run on Google Cloud',
					'Answer each support case one by one as it arrives',
					'Send an update once the root cause analysis is complete'
				],
				answer: 1,
				why: 'Google posted its first report "about ~1h after the start of the crashes, due to the Cloud Service Health infrastructure being down due to this outage." For that hour, some customers had no signal at all. The fixes include keeping monitoring and communication up "even when Google Cloud and our primary monitoring products are down".'
			},
			{
				situation: [
					'Afternoon, 12 June. Service Control and API serving are back in all regions. Some products still work through backlogs.'
				],
				q: 'What do you do first?',
				options: [
					'Push a corrected version of the policy right away',
					'Resume the planned Service Control releases on schedule',
					'Freeze Service Control changes and manual policy pushes',
					'Move all quota policies to a single global database'
				],
				answer: 2,
				why: 'The report: "Immediately upon recovery, we froze all changes to the Service Control stack and manual policy pushes until we can completely remediate the system." Any new policy could again reach the same unprotected code path.'
			}
		],
		outcome: [
			'On May 29, 2025, Google added a quota policy check to Service Control. The rollout went region by region, but the new code path only ran when a policy used it, so the rollout never exercised it. The code had no error handling and no feature flag: "If this had been flag protected, the issue would have been caught in staging."',
			'On June 12 at about 10:45 PDT, a policy with "unintended blank fields" was written to the regional Spanner tables and replicated globally within seconds. The new check read the blank fields, hit a null pointer, and Service Control crashed in a loop in every region.',
			'Google Cloud, Google Workspace and Google Security Operations returned 503 errors on external API requests. All regions except us-central1 were mitigated by 12:48 PDT, and the first report puts the end of the incident at 13:49 PDT. Existing streaming and IaaS resources kept running.',
			'The listed fixes: Service Control fails open when a check fails. Globally replicated data is propagated incrementally, with time to detect problems. Changes to critical binaries are feature flag protected and off by default. Systems use randomized exponential backoff, and monitoring and status pages stay up when Google Cloud is down.'
		]
	},
	quiz: [
		{
			q: 'The May 29 code went through a region by region rollout. Why did the rollout not catch the bug?',
			options: [
				'The rollout skipped the largest regions',
				'The crashing code path only ran when a policy used the new check',
				'The rollout used a staging copy of the policy tables',
				'The rollout ran during low traffic hours'
			],
			answer: 1,
			why: 'The report: "the code path that failed was never exercised during this rollout due to needing a policy change that would trigger the code." A slow binary rollout only tests the code paths that the data of that moment reaches.'
		},
		{
			q: 'Why did one policy change crash Service Control in every region within minutes?',
			options: [
				'Each region pulled the policy from one central server',
				'The policy data was replicated globally within seconds',
				'An engineer pushed the policy to each region by hand',
				'The crash in one region spread through cross-region calls'
			],
			answer: 1,
			why: 'Quota policies are global, so the metadata replicated to every regional datastore "within seconds". Each regional Service Control then read the blank fields from its own datastore. One of the fixes is to propagate such data incrementally, with time to validate it.'
		},
		{
			q: 'Why did us-central1 take up to 2 hours 40 minutes while smaller regions recovered sooner?',
			options: [
				'us-central1 received the red button last',
				'Its restarting tasks overloaded the Spanner table they all read',
				'us-central1 still ran the binary from before May 29',
				'Its Spanner table held a second bad policy'
			],
			answer: 1,
			why: 'In large regions, many tasks restarted at once and created "a herd effect" on the Spanner table they depend on. Without randomized exponential backoff, their retries arrived together and kept the table overloaded until the team throttled task creation.'
		}
	],
	recall: {
		q: 'What made Service Control crash on 12 June 2025, and how did Google stop it?',
		a: 'A quota policy with blank fields, replicated to every region in seconds, hit a null pointer in the check added on May 29. Google rolled out the red button that turned off that serving path, within 40 minutes.'
	},
	sources: [
		{ title: 'Google Cloud Service Health, Incident Report for the 12 June 2025 outage', url: REPORT },
		{ title: 'Site Reliability Engineering, Addressing Cascading Failures (randomized exponential backoff)', url: 'https://sre.google/sre-book/addressing-cascading-failures/' }
	]
};
