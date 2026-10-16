const FOURKEYS = 'https://github.com/dora-team/fourkeys/blob/6cc642e037a95a280ed8d3b1624dd003b647d797';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'dora-metrics',
	part: 'The DevOps mindset',
	title: 'DORA metrics: is delivery getting better?',
	minutes: 10,
	hook: [
		'Your manager asks: "Are we getting better at this?" You show uptime (99.9%) and tickets closed (212). Neither number says **whether changes reach users faster, or break things less often**.',
		'DORA, a research program run by Google Cloud, has studied software teams for over a decade. It found a small set of numbers that describe software delivery and predict how well the organization does.',
		'In DORA\'s data, **speed and stability move together** for most teams. Top performers do well on all five numbers, and low performers do poorly on all five.'
	],
	terms: [
		{ term: 'Change lead time', def: 'Time from a change being committed to version control to that change running in production.' },
		{ term: 'Failed deployment recovery time', def: 'How long it takes to recover from a deployment that fails and needs immediate intervention.' },
		{ term: 'Change fail rate', def: 'The share of deployments that need immediate intervention afterwards, usually a rollback or a hotfix.' },
		{ term: 'Deployment rework rate', def: 'The share of deployments that someone made unplanned, because of an incident in production.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['commit["Commit in version control"] -->|"change lead time"| deploy["Running in production"]'],
				highlight: ['commit', 'deploy'],
				note: 'Change lead time starts at the commit, so the time a ticket spent in the backlog does not count. It shows how long finished code waits: in review, in a queue for the test environment, until the next release window.'
			},
			{
				add: ['deploy -->|"how often"| freq["Deployments per week"]'],
				highlight: ['freq'],
				note: 'Deployment frequency is counted per application or service. Frequent deploys usually mean small batches, which is why this number moves together with the others.'
			},
			{
				add: ['deploy -->|"needs rollback or hotfix"| fail["Failed deployment"]'],
				highlight: ['fail'],
				note: 'Change fail rate is failed deployments divided by all deployments. 1 failure out of 4 deploys is 25%. The hard part is deciding, for each incident, **which deployment caused it**.'
			},
			{
				add: ['fail -->|"failed deployment recovery time"| ok["Service recovered"]'],
				highlight: ['ok'],
				note: 'In 2023 DORA replaced "time to restore service" (MTTR) with failed deployment recovery time. The new metric only counts failures caused by a change. A data center outage you had no part in stays out of it.'
			},
			{
				add: ['fail -.->|"unplanned"| hotfix["Hotfix deployment"]', 'hotfix --> deploy'],
				highlight: ['hotfix'],
				note: 'DORA added deployment rework rate in 2024: the share of deployments that are unplanned fixes for production incidents. Together with change fail rate it measures **instability**. The other three measure throughput, for five metrics in total.'
			}
		]
	},
	example: {
		title: 'queries/incidents.sql (Four Keys)',
		repo: 'dora-team/fourkeys',
		url: `${FOURKEYS}/queries/incidents.sql#L1-L36`,
		lang: 'sql',
		code: `# Incidents Table
SELECT
source,
incident_id,
MIN(IF(root.time_created < issue.time_created, root.time_created, issue.time_created)) as time_created,
MAX(time_resolved) as time_resolved,
ARRAY_AGG(root_cause IGNORE NULLS) changes,
…
REGEXP_EXTRACT(metadata, r"root cause: ([[:alnum:]]*)") as root_cause,
CASE WHEN source LIKE "github%" THEN REGEXP_CONTAINS(JSON_EXTRACT(metadata, '$.issue.labels'), '"name":"Incident"')
     WHEN source LIKE "gitlab%" THEN REGEXP_CONTAINS(JSON_EXTRACT(metadata, '$.object_attributes.labels'), '"title":"Incident"')
     WHEN source LIKE "pagerduty%" THEN TRUE # All Pager Duty events are incident-related
     END AS bug,
…
LEFT JOIN (SELECT time_created, changes FROM four_keys.deployments d, d.changes) root on root.changes = root_cause
GROUP BY 1,2
HAVING max(bug) is True
;`,
		notes: [
			'Four Keys is an open-source project from the DORA team to compute the metrics in BigQuery from events sent by tools such as GitHub, GitLab or PagerDuty. The repo is **archived** and its README still lists the old four names, such as "Time to Restore Services". Use it to see how the numbers are computed, and take the current definitions from dora.dev.',
			'Lines 10 to 13: an incident is a GitHub or GitLab issue with the label `Incident`, or any PagerDuty event. **A failure handled in a chat channel, with no labelled issue, never reaches the numbers.**',
			'Line 9 links a failure to a deployment through plain text: the event must contain `root cause: <commit id>`. The `LEFT JOIN` on line 15 matches that id against the commits each deployment shipped. If nobody writes that line, the failure is never tied to a deploy.',
			'Line 5: `time_created` takes the earlier of the deploy time and the issue time. So recovery is measured from the deployment that caused the failure until the issue is closed, which is how the [README](https://github.com/dora-team/fourkeys/blob/6cc642e037a95a280ed8d3b1624dd003b647d797/README.md?plain=1#L416-L418) defines it.'
		]
	},
	tradeoff: {
		gain: [
			'A team that deploys more often by skipping tests sees it in its change fail rate, because DORA measures speed and stability side by side.',
			'Dev and ops look at the same five numbers for the same service.',
			'You can track one service over time and see whether a change to the process really helped.'
		],
		cost: [
			'When a metric is a target, people game it (Goodhart\'s law): they split one deploy into ten, or close incidents early.',
			'The data is scattered across Git, CI, the deploy tool and the incident tracker. A failure counts only if someone writes `root cause: <commit id>` on it.',
			'The numbers describe one application each, so ranking a mobile app against a mainframe system, or one team against another, misleads.'
		]
	},
	task: {
		prompt: 'One service, last four weeks: **20 deployments**. 3 of them needed a rollback or hotfix right away; recovery took 30 min, 2 h and 40 min. 2 of the 20 were unplanned hotfix deploys made because of production incidents. A typical commit is merged on Monday and deployed on Thursday. Compute the five metrics, then say which one you would work on first and why.',
		hint: 'A rate counts how many deployments out of all deployments. For recovery time, one bad incident moves a median less than an average.',
		answer: [
			'Deployment frequency: 20 in 4 weeks, so about 5 per week.',
			'Change fail rate: 3 / 20 = 15%. Deployment rework rate: 2 / 20 = 10%.',
			'Failed deployment recovery time: median of 30 min, 40 min, 2 h = 40 min.',
			'Change lead time: at least 3 days: Monday merge to Thursday deploy, plus any time the commit spent in review before the merge.',
			'Work on **lead time** first: code that is done sits for three days. Ask what it waits for (a release day? a manual approval? a shared test environment?). Shorter waits also mean smaller batches, which tends to lower the fail rate too. Do not announce a target number: improve the process and watch the metric.'
		]
	},
	quiz: [
		{
			q: 'What does DORA\'s change lead time measure?',
			options: [
				'The time from a commit in version control to that change running in production',
				'The time from opening a ticket to starting code review',
				'The time it takes to restore service after a deployment causes an outage',
				'How long the deploy pipeline runs, from the first build step to the last'
			],
			answer: 0,
			why: 'It starts at the commit and ends at production. It shows how long finished work waits before users get it.'
		},
		{
			q: 'In 2023 DORA replaced "time to restore service" (MTTR) with "failed deployment recovery time". What changed?',
			options: [
				'It now measures the time to detect a failure instead of the time to fix it',
				'It is now counted only for the database tier, where most production failures start',
				'It only counts recovery from failures caused by a change to production, not outside events',
				'It was dropped from DORA\'s metrics entirely and replaced by change failure rate'
			],
			answer: 2,
			why: 'The old metric mixed failures caused by a deployment with failures from outside. The new one focuses on recovering from a change that went wrong, like the other delivery metrics.'
		},
		{
			q: 'A director announces: "Every team must deploy ten times a day by the end of the year." Which pitfall from DORA\'s guide is this?',
			options: [
				'Using industry as a shield against improving',
				'Having siloed ownership of the metrics',
				'Focusing on measurement at the expense of improvement',
				'Setting metrics as a goal, which invites teams to game them'
			],
			answer: 3,
			why: 'DORA cites Goodhart\'s law: once the metric is the target, teams find ways to hit the number without improving delivery.'
		}
	],
	recall: {
		q: 'Which five numbers does DORA track per service, and why should a manager not set one of them as a target?',
		a: 'Change lead time, deployment frequency, failed deployment recovery time, change fail rate and deployment rework rate. A target invites gaming (Goodhart\'s law), like splitting one deploy into ten.'
	},
	sources: [
		{ title: 'DORA, Software delivery performance metrics', url: 'https://dora.dev/guides/dora-metrics/' },
		{ title: 'DORA, A history of DORA\'s software delivery metrics', url: 'https://dora.dev/insights/dora-metrics-history/' },
		{ title: 'Four Keys, README (metric definitions)', url: `${FOURKEYS}/README.md` },
		{ title: 'Four Keys, METRICS.md (how each metric is computed)', url: `${FOURKEYS}/METRICS.md` }
	]
};
