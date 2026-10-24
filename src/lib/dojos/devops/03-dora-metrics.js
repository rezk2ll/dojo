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
		],
		steps: [
			{
				title: 'Count the deployments',
				questions: [
					{ q: '20 deployments in 4 weeks. What is the deployment frequency?', options: ['About 20 per week', 'About 1 per week', 'About 5 per week', 'About 4 per week'], answer: 2, why: '20 divided by 4 weeks is 5 per week. It is counted per service.' },
					{ q: '3 of the 20 needed a rollback or hotfix right away. What is the change fail rate?', options: ['15%', '3%', '30%', '10%'], answer: 0, why: 'Failed deployments divided by all deployments: 3 / 20 = 15%.' },
					{ q: '2 of the 20 were unplanned hotfix deploys made because of production incidents. What is the deployment rework rate?', options: ['2%', '15%', '20%', '10%'], answer: 3, why: 'Unplanned deployments divided by all deployments: 2 / 20 = 10%.' },
					{ q: 'Change fail rate and deployment rework rate together measure what?', options: ['Throughput', 'Instability', 'Lead time', 'Uptime'], answer: 1, why: 'Those two measure instability. The other three measure throughput.' }
				]
			},
			{
				title: 'Compute the recovery time',
				questions: [
					{ q: 'One of the 3 failures was handled in a chat channel, with no issue labelled `Incident`. What does Four Keys do with its recovery time?', options: ['It counts it twice', 'It never reaches the numbers', 'It files it as an outside outage', 'It estimates it from the deploy log'], answer: 1, why: 'Four Keys only sees issues labelled `Incident` or PagerDuty events. A failure handled in chat leaves no event, so your median would be computed from two recoveries, not three.' },
					{ q: 'Recoveries took 30 min, 2 h and 40 min. What is the median?', options: ['30 min', '2 h', '40 min', '1 h 3 min'], answer: 2, why: 'Sorted: 30 min, 40 min, 2 h. The middle value is 40 min.' },
					{ q: 'Why use the median here rather than the average?', options: ['One bad incident moves a median less than an average', 'DORA forbids averages', 'The average is always lower', 'The median counts only planned deploys'], answer: 0, why: 'The 2 h incident would pull the average up. The median shows the typical recovery.' },
					{ q: 'In Four Keys, when does recovery time start?', options: ['When the issue is labelled', 'When someone opens a chat channel', 'When the hotfix is merged', 'At the deployment that caused the failure'], answer: 3, why: 'Four Keys takes the earlier of the deploy time and the issue time, so recovery runs from the bad deploy until the issue is closed.' }
				]
			},
			{
				title: 'Measure the lead time',
				questions: [
					{ q: 'Where do you find the data to measure the Monday to Thursday lead time?', options: ['In the incident tracker alone', 'In Git for the commit time, and in the deploy tool for when it reached production', 'In the ticket system, for when the work was planned', 'On the uptime dashboard'], answer: 1, why: 'The data is scattered across tools: the commit time lives in Git, the time it ran in production lives in the deploy tool. You join the two.' },
					{ q: 'A typical commit is merged Monday and deployed Thursday. What is the lead time?', options: ['At least 3 days, plus any review time before the merge', 'Exactly 1 day', 'Zero, since the code was already merged', 'Exactly 4 weeks'], answer: 0, why: 'Monday to Thursday is three days, and the commit may also have waited in review before the merge.' },
					{ q: 'What does a long lead time usually show?', options: ['That the pipeline is slow to run', 'That developers write too little code', 'That finished code is waiting: in review, in a queue, for a release window', 'That too many deploys fail'], answer: 2, why: 'Lead time shows how long finished code waits before users get it.' },
					{ q: 'Is 5 deploys a week with a 3-day lead time a contradiction?', options: ['Yes, frequent deploys always mean short lead time', 'Yes, one of the numbers must be wrong', 'No, because lead time only counts hotfixes', 'No: the service deploys often, but each commit still waits days to ship'], answer: 3, why: 'Frequency counts deploys. Lead time follows one commit, and each one still sits from Monday to Thursday.' }
				]
			},
			{
				title: 'Pick what to improve',
				questions: [
					{ q: 'Which metric do you work on first?', options: ['Lead time', 'Deployment frequency', 'Deployment rework rate', 'Recovery time'], answer: 0, why: 'Code that is done sits for three days. That is the biggest wait in the numbers.' },
					{ q: 'What question do you ask about the Monday to Thursday wait?', options: ['Who merged the code late', 'What the code waits for: a release day, a manual approval, a shared test environment', 'How to deploy less often', 'Which developer to blame'], answer: 1, why: 'Find what finished code waits for, then remove that wait.' },
					{ q: 'Why can a shorter lead time also lower the fail rate?', options: ['Because fewer deploys means fewer failures', 'Because hotfixes stop counting', 'Because shorter waits mean smaller batches', 'Because tests can be skipped'], answer: 2, why: 'Smaller batches mean each deploy holds less change, and in DORA\'s data speed and stability move together.' },
					{ q: 'Your manager wants to rank this service\'s lead time against another team\'s mobile app. What do you say?', options: ['Good idea, the lowest lead time wins', 'Compare only deployment frequency', 'Average both into one team score', 'Track this service against its own past numbers instead'], answer: 3, why: 'The numbers describe one application each, so a ranking across different apps misleads. Tracking one service over time shows whether a process change helped.' }
				]
			}
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
	lab: {
		minutes: 20,
		goal: 'Compute DORA numbers from a real project\'s git history, and find the ones git cannot give you.',
		steps: [
			'Clone the GitHub CLI with its history and tags, without the file contents: `mkdir -p ~/dora-lab && cd ~/dora-lab && git clone --filter=blob:none https://github.com/cli/cli.git && cd cli`.',
			'List its releases, newest first, as a CSV you can open in a spreadsheet: `git for-each-ref --sort=-creatordate --format=\'%(creatordate:short),%(refname:short)\' \'refs/tags/v*\' > ../releases.csv && head ../releases.csv`. Count each release as one deployment.',
			'Count the releases of the last 12 weeks, and the patch releases among them (a last number other than 0, like `v2.103.1`): `awk -F, -v since="$(date -d \'12 weeks ago\' +%F)" \'$1 >= since {n++; if ($2 !~ /\\.0$/) p++} END {print n " releases, " p " patch releases"}\' ../releases.csv`. On macOS, use `date -v-12w +%F`.',
			'Measure the change lead time of the latest minor release, from each commit to the release: `last=$(grep \'\\.0$\' ../releases.csv | sed -n 1p | cut -d, -f2); prev=$(grep \'\\.0$\' ../releases.csv | sed -n 2p | cut -d, -f2); t=$(git log -1 --format=%ct "$last"); git log --no-merges --format=%ct "$prev..$last" | awk -v t="$t" \'{print (t - $1) / 86400}\' | sort -n | awk \'{a[NR] = $1} END {print NR " commits, median " a[int((NR + 1) / 2)] " days"}\'`. Compare it with the days between `$prev` and `$last` in `releases.csv`.',
			'Write `~/dora-lab/notes.txt` with one line per metric: deployments per week, deployment rework rate, change lead time, and for change fail rate and recovery time, a number or the data you would need.'
		],
		done: [
			'`releases.csv` has one line per `v*` tag, newest first, each with a date.',
			'Step 3 prints two counts, and you turned them into releases per week (count / 12) and a share of patch releases.',
			'Step 4 prints a number of commits and a median in days.',
			'`notes.txt` has a line for each of the five metrics.'
		],
		solution: [
			'At the time of writing: 9 releases in 12 weeks (about 0.75 a week), 3 of them patches (33%), and a median lead time of 6 days over the 193 commits of `v2.103.0`. Your numbers will differ, because the project keeps releasing.',
			'A patch release is an unplanned fix, so patches / all releases is a deployment rework rate. For change fail rate, count the `.0` releases that got a `.1`: `v2.103.0` got two in two days.',
			'A commit merged just after a release waits for the next one, so the lead time follows the gap between releases. That wait is the release window from the lesson, not the build.',
			'Recovery time is not in git: you need when each failure started and ended, from an issue tracker or a pager. That is the Four Keys problem: the numbers count only what someone records.',
			'A tag is a release that users install themselves, not a deploy to a server. Use these numbers to follow one project over time, not to rank it against a web service. Clean up with `rm -rf ~/dora-lab`.'
		]
	},
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
