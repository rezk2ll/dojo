const KP = 'https://github.com/prometheus-operator/kube-prometheus/blob/f81c076ab8f542c457840cd4c62656b8d6b4f43a';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'observability-and-incidents',
	part: 'Running in production',
	title: 'Observability and incidents: page on what users feel',
	minutes: 10,
	hook: [
		'You have had the 3 a.m. page that said "disk 81% on db-02". You got up, looked, and the site was fine. The next week the site was down for an hour and **nothing paged** at all.',
		'The disk alert watched a **cause**. A system has a thousand possible causes of trouble, and most of them hurt nobody. Users feel only a few symptoms: errors, slowness, pages that do not load.',
		'Prometheus collects metrics and turns them into alerts on those symptoms. After the page, the on-call engineer limits the damage, and the team writes a blameless postmortem.'
	],
	terms: [
		{ term: 'Four golden signals', def: 'From the Google SRE book: latency, traffic, errors, saturation. If you can only measure four things on a user-facing system, measure these.' },
		{ term: 'Symptom vs cause', def: 'The symptom is what is broken for users ("HTTP 500s"). The cause is why ("database refuses connections"). Page on symptoms, use dashboards to find causes.' },
		{ term: 'SLO and error budget', def: 'An SLO is a target, like 99% of requests succeed and are fast. The error budget is what is left: 1% may fail. The **burn rate** says how fast you spend it.' },
		{ term: 'Blameless postmortem', def: 'A written review of an incident that looks for contributing causes without blaming a person. It assumes everyone acted in good faith with what they knew.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: [
					'app["App pods: /metrics"]',
					'prom["Prometheus"]',
					'prom -->|"scrapes"| app'
				],
				highlight: ['app', 'prom'],
				note: 'Prometheus **pulls** metrics, numbers over time like requests per second. At a fixed interval (one minute by default) it fetches `/metrics` from each target and stores the numbers. Logs (records of events) and traces (one request followed through every service) go to their own stores. Most alert rules query the metrics in Prometheus.'
			},
			{
				add: [
					'rule["Alert rule: error ratio too high, for 2m"]',
					'prom --> rule'
				],
				highlight: ['rule'],
				note: 'An alerting rule is a PromQL query plus a `for` duration. While the condition is true but the time has not passed, the alert is pending. Once the condition has held for the whole `for` duration, the alert **fires**. A blip shorter than the `for` duration never pages anyone.'
			},
			{
				add: [
					'am["Alertmanager"]',
					'oncall["On-call engineer"]',
					'rule -->|"firing"| am',
					'am -->|"page"| oncall',
					'class oncall ext'
				],
				highlight: ['am', 'oncall'],
				note: 'Prometheus sends firing alerts to **Alertmanager**, which deduplicates and groups them, applies silences and routes them to a receiver, for example a pager for critical alerts and email or a ticket for warnings. On-call is a rotation, and many teams have both a primary and a secondary.'
			},
			{
				add: [
					'fix["Mitigate, then fix"]',
					'pm["Blameless postmortem"]',
					'oncall --> fix',
					'fix --> pm',
					'pm -.->|"action items"| rule'
				],
				highlight: ['fix', 'pm'],
				note: 'First limit the damage for users (roll back, scale up), then find the cause. Afterwards, write the **postmortem**: timeline, impact, contributing causes, action items. One of the action items often changes an alert rule.'
			}
		]
	},
	example: {
		title: 'manifests/kubernetesControlPlane-prometheusRule.yaml',
		repo: 'prometheus-operator/kube-prometheus',
		url: `${KP}/manifests/kubernetesControlPlane-prometheusRule.yaml#L603-L630`,
		lang: 'yaml',
		code: `    - alert: KubeAPIErrorBudgetBurn
      annotations:
        description: The Kube API server is burning too much error budget on cluster {{ $labels.cluster }}.
        runbook_url: https://runbooks.prometheus-operator.dev/runbooks/kubernetes/kubeapierrorbudgetburn
        summary: The Kube API server is burning too much error budget.
      expr: |
        sum by(cluster) (apiserver_request:burnrate1h) > (14.40 * 0.01000)
        and on(cluster)
        sum by(cluster) (apiserver_request:burnrate5m) > (14.40 * 0.01000)
      for: 2m
      labels:
        long: 1h
        severity: critical
        short: 5m
    - alert: KubeAPIErrorBudgetBurn
      annotations:
        description: The Kube API server is burning too much error budget on cluster {{ $labels.cluster }}.
        runbook_url: https://runbooks.prometheus-operator.dev/runbooks/kubernetes/kubeapierrorbudgetburn
        summary: The Kube API server is burning too much error budget.
      expr: |
        sum by(cluster) (apiserver_request:burnrate6h) > (6.00 * 0.01000)
        and on(cluster)
        sum by(cluster) (apiserver_request:burnrate30m) > (6.00 * 0.01000)
      for: 15m
      labels:
        long: 6h
        severity: critical
        short: 30m`,
		notes: [
			'Line 7 reads `burnrate1h`, a [recording rule](https://github.com/prometheus-operator/kube-prometheus/blob/f81c076ab8f542c457840cd4c62656b8d6b4f43a/manifests/kubernetesControlPlane-prometheusRule.yaml#L1146-L1172): requests that were **too slow or failed with a 5xx**, divided by all requests. So the alert measures a symptom that clients of the Kubernetes API server feel.',
			'On line 7, `0.01000` is the error budget of a [99% target](https://github.com/kubernetes-monitoring/kubernetes-mixin/blob/f57ebcd21d8fb67fe9708b7f6d1d30aed26b2be4/config.libsonnet#L18-L21). `14.40` is the burn rate: spending the budget 14.4 times faster than allowed. The SRE workbook says that rate over one hour uses **2% of a 30-day budget**.',
			'Lines 7 to 9 join two windows with `and`. The long one (1h) shows the error rate has lasted long enough to matter, and the short one (5m) shows it is **still happening**. The workbook suggests a short window of 1/12 of the long one, and 5m is 1/12 of 1h.',
			'Lines 4 and 18 give each alert a `runbook_url`. The person paged at 3 a.m. gets a link to what to check first, along with the alert name.'
		]
	},
	tradeoff: {
		gain: [
			'On-call gets fewer pages, and each page means users see errors or slowness right now.',
			'Burn-rate alerts catch a slow leak and a sudden outage with the same rule set.',
			'In a blameless postmortem people report what they really did, so the action items address the real causes.'
		],
		cost: [
			'Before you write the alert rules, you must agree on an SLO with the product owner.',
			'Disk and CPU metrics move to dashboards and tickets, and someone still has to read them.',
			'Metrics, logs and traces need three systems to run, store and pay for. Too many label values (high cardinality) can overload Prometheus.'
		]
	},
	task: {
		prompt: 'Your checkout service has these alerts: CPU over 80%, pod restarted, disk over 85%, and error ratio over 5% for 10 minutes. On-call gets 30 pages a week and ignores most of them. Redesign the alerting.',
		hint: 'Sort each alert: does a user feel it right now? Then ask what the page should carry so the on-call person can act.',
		answer: [
			'Keep paging on the **symptom**: the error ratio. Better, define an SLO (say 99.5% of checkouts succeed in under 1 s) and page on burn rate over two windows.',
			'Add a **latency** symptom: slow checkouts hurt users as much as failed ones.',
			'Move CPU and pod restarts to **dashboard panels** or low-priority tickets, with no page. They help find the cause once you are paged.',
			'Disk at 85% is a real future problem: alert on "disk full in 4 hours" as a ticket, not on a fixed percentage at night.',
			'Each remaining alert gets a summary, a severity and a `runbook_url`. After the next incident, the postmortem checks whether the alert fired early enough.'
		]
	},
	quiz: [
		{
			q: 'According to the Google SRE book, which are the four golden signals?',
			options: [
				'CPU, memory, disk, network',
				'Latency, traffic, errors, saturation',
				'Metrics, logs, traces, events',
				'Uptime, downtime, MTTR, MTBF'
			],
			answer: 1,
			why: 'Latency, traffic, errors and saturation describe what users of a service experience. CPU and disk are causes you look at once one of these goes wrong.'
		},
		{
			q: 'An alert rule has `for: 10m`. The condition becomes true and stays true for 4 minutes, then goes back to normal. What happens?',
			options: [
				'The alert fires after 4 minutes',
				'The alert fires and stays firing for 10 minutes',
				'The alert is pending for 4 minutes, then goes away without firing',
				'Prometheus pages anyway because the condition was true once'
			],
			answer: 2,
			why: 'An active alert stays pending until the condition has held for the full `for` duration. A 4-minute blip never reaches firing.'
		},
		{
			q: 'What makes a postmortem blameless?',
			options: [
				'It is written anonymously, so nobody can tell who wrote each part',
				'It skips the timeline so no names appear and nobody is singled out',
				'It looks for contributing causes without blaming any person or team, assuming good faith',
				'It is only shared with the team that caused the incident, never the whole company'
			],
			answer: 2,
			why: 'Blame makes people hide what they did, and then the real causes stay hidden. The SRE book defines blameless as finding causes without indicting anyone.'
		}
	],
	recall: {
		q: 'Which alerts should page the on-call engineer, and how does `KubeAPIErrorBudgetBurn` decide to fire?',
		a: 'Only alerts on symptoms users feel, like errors and latency. `KubeAPIErrorBudgetBurn` fires when the error budget of a 99% target burns 14.4 times too fast over both 1 hour and 5 minutes, for 2 minutes.'
	},
	sources: [
		{ title: 'Google SRE book, Monitoring distributed systems', url: 'https://sre.google/sre-book/monitoring-distributed-systems/' },
		{ title: 'Google SRE workbook, Alerting on SLOs', url: 'https://sre.google/workbook/alerting-on-slos/' },
		{ title: 'Prometheus docs, Alerting rules', url: 'https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/' },
		{ title: 'Prometheus docs, Alerting best practices', url: 'https://prometheus.io/docs/practices/alerting/' },
		{ title: 'Google SRE book, Postmortem culture', url: 'https://sre.google/sre-book/postmortem-culture/' }
	]
};
