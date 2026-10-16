const PM = 'https://www.datadoghq.com/blog/2023-03-08-multiregion-infrastructure-connectivity-issue/';
const IMPACT = 'https://www.datadoghq.com/blog/engineering/2023-03-08-deep-dive-into-platform-level-impact/';
const RESPONSE = 'https://www.datadoghq.com/blog/engineering/2023-03-08-deep-dive-into-incident-response/';
const NETWORKD = 'https://github.com/systemd/systemd/blob/84b71c1525e792c2ba44670d2171386af8605edd/man/networkd.conf.xml#L75-L82';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'datadog-2023',
	part: 'Networks and DNS',
	title: 'Datadog 2023: the automatic OS update that cut nodes off the network',
	minutes: 10,
	hook: [
		'Wednesday 8 March 2023, 06:08 UTC, about 1:08 a.m. for the first teams paged. Datadog’s internal monitoring fired its first alert at 06:03.',
		'Two teams get paged. The APM team’s automation sees that their Kubernetes pods are not restarting properly. Another team gets pages from the out-of-band monitors that watch Datadog’s own alerting.',
		'Datadog runs five regions (US1, EU1, US3, US4 and US5) on three cloud providers. The regions share no network and no control plane, and every change rolls out one region at a time.'
	],
	terms: [
		{ term: 'Out-of-band monitoring', def: 'Checks that run completely outside your own infrastructure and call your public APIs like a user does. They still alert when your own monitoring is down.' },
		{ term: 'Unattended upgrades', def: 'The Ubuntu feature that installs security updates on a timer, with no operator. Datadog’s hosts used the Ubuntu defaults: upgrades at 06:00 UTC plus up to 60 minutes of random delay.' },
		{ term: 'systemd-networkd', def: 'The systemd service that configures network interfaces, routes and routing policy rules on a Linux host from `.network` files.' },
		{ term: 'IP rule', def: 'A routing policy rule that picks which route table a packet uses, for example by its source address. Cilium adds IP rules so pod traffic leaves through the right interface.' }
	],
	incident: {
		org: 'Datadog',
		title: '2023-03-08 Incident: Infrastructure connectivity issue affecting multiple regions',
		date: '2023-03-08',
		url: PM,
		steps: [
			{
				situation: [
					'You are on the team paged by the out-of-band monitors. Within minutes you see substantial issues across Datadog’s products, not in one service.',
					'The APM team, paged at the same time, has decided its problem is local to its own service. No large compute incident is open yet.'
				],
				q: 'What do you do?',
				options: [
					'Leave it with the APM team, since they were paged first',
					'Declare a high-severity incident so the incident commander is paged',
					'Restart your alerting services and see if the pages stop',
					'Wait 30 minutes to see if the problem clears on its own'
				],
				answer: 1,
				why: 'Problems across many products are a reason to page the high-severity rotation, whose engineer takes the incident commander role. The team did, but the incident tool itself was failing at times, so opening the incident took "about 10 minutes (which was longer than usual)".'
			},
			{
				situation: [
					'The incident commander has paged the on-call executive and customer support. Users cannot reach the platform through the browser or the APIs, and monitors are not alerting.',
					'The regions behave differently. Some fail to load the web page, others load it. Most of Datadog’s own monitoring is down, so the full scope is unclear.'
				],
				q: 'What goes on the status page first?',
				options: [
					'Nothing until every region’s impact is measured',
					'The worst symptom any region shows, posted now',
					'A detailed note for each region, after each team checks in',
					'A note that only the regions with loading issues are affected'
				],
				answer: 1,
				why: 'Customers need to know quickly, and details depend on a diagnosis that does not exist yet. Datadog "chose the “worst behavior” message" (the web page loading issues) to post as fast as possible. The first public update went out at 06:31 UTC.'
			},
			{
				situation: [
					'Pods are failing to start or stuck in restart loops in several regions at once, on different cloud providers.',
					'The web UI team made the last change to a shared configuration utility. Nobody on the call knows of any channel that can change all regions at the same time.'
				],
				q: 'Where do you look for the trigger?',
				options: [
					'Debug each region alone, since regions share no infrastructure',
					'Roll back the web UI team’s config change in every region',
					'Look on the hosts for anything that ran on all of them near 06:00',
					'Wait until internal monitoring is back to read the usual graphs'
				],
				answer: 2,
				why: 'Failures that start together in isolated regions need a common cause that runs on every host. Datadog pulled in networking, web UI and compute teams; from about 06:40 it took "about 30-40 minutes" to find failure across the Kubernetes nodes. The postmortem: "Diagnosing the failure required imagination and suspension of disbelief."'
			},
			{
				situation: [
					'Tens of thousands of nodes lost their network between 06:00 and 07:00. On AWS, status checks marked them unhealthy and Auto Scaling replaced them: by 08:00, about 60% of the instances in US1 were new.',
					'On Google Cloud, the broken instances are still running, with their local disks, because Datadog does not enable HTTP health checks there. Many stateless services on Google Cloud are still down, so it looks worse than AWS.',
					'Datadog’s data stores, coordination systems and caches keep much of their data on local disks.'
				],
				q: 'What do you do with the broken Google Cloud instances?',
				options: [
					'Restart them through the cloud API so they keep their disks',
					'Terminate them so fresh nodes replace them, as on AWS',
					'Enable HTTP health checks so Google Cloud replaces them',
					'Leave them for Kubernetes to replace once the control plane is back'
				],
				answer: 0,
				why: 'A restart keeps the local disks, so the data stores come back with their data. On AWS that data was gone with the terminated instances. Datadog later found AWS "much harder to recover from", and the postmortem: "rebooting the instances was the quickest path to recover the data still present on local disks."'
			},
			{
				situation: [
					'The trigger is now clear. A systemd security patch (249.11-0ubuntu3.7) reached Ubuntu repositories on 7 March. Installing it restarts systemd-networkd.',
					'On Ubuntu 22.04 (systemd v249), systemd-networkd deletes IP rules it does not know about when it starts. That deleted the rules Cilium had added, and the hosts lost their network. Ubuntu 20.04 hosts were not hit.'
				],
				q: 'What do you change to stop it happening again?',
				options: [
					'Roll the whole fleet back to Ubuntu 20.04, which runs systemd v245',
					'Pin systemd on every host to the version before the 7 March patch',
					'Turn off unattended upgrades and set networkd to keep foreign rules',
					'Disable Cilium’s IP rules and use an overlay network'
				],
				answer: 2,
				why: 'Datadog disabled the "legacy security update channel" in every affected region and configured systemd-networkd "so that it leaves the routing table unchanged upon restart". Security patches still arrive through node replacement, which rolls out region by region. A pinned systemd still deletes foreign rules at its next restart.'
			}
		],
		outcome: [
			'All services in US1, EU1, US3, US4 and US5 were affected. Web access returned at 09:13 UTC and the first major service was operational at 16:44. All services were operational at 08:58 UTC on 9 March, and the backfill of historical data ended at 06:25 UTC on 10 March.',
			'The root cause goes back to December 2020. systemd v248 made systemd-networkd flush IP rules it did not know about on start, and v249 added the `ManageForeignRoutingPolicyRules` setting to opt out. Ubuntu 22.04 ships v249 with that setting on (its default), and ran on more than 90% of Datadog’s fleet.',
			'A fresh or rebooted node never shows the bug, because systemd-networkd starts before Cilium installs its rules. Only a restart on a running node does. The Ubuntu default timer ran the upgrade on every host between 06:00 and 07:00 UTC, so isolated regions failed together.',
			'Datadog disabled the update channel, changed the systemd-networkd config and audited its infrastructure for similar legacy update channels. It also plans chaos tests at this scale of disruption, a degraded mode that keeps live data first, status pages per product and more out-of-band monitoring per product.'
		]
	},
	quiz: [
		{
			q: 'Why did no test catch the systemd-networkd behavior before 8 March?',
			options: [
				'Datadog never tested Ubuntu 22.04 before using it in production',
				'Only a restart of systemd-networkd on a running node deletes Cilium’s rules',
				'The bug only appears on AWS, and the test clusters ran on Google Cloud',
				'The rules are deleted only when the node has more than 100 pods'
			],
			answer: 1,
			why: 'At boot, systemd-networkd starts before Cilium adds its IP rules, so there is nothing foreign to delete. A security patch restarts systemd-networkd after Cilium has run, and only then are the rules removed.'
		},
		{
			q: 'Datadog’s regions share no network and roll out changes one at a time. How did they fail within the same hour?',
			options: [
				'A global load balancer sent all traffic to the first broken region',
				'The same timer on every host installed the same patch between 06:00 and 07:00 UTC',
				'A shared Kubernetes control plane pushed the patch to all regions',
				'The cloud providers all patched their hypervisors at the same time'
			],
			answer: 1,
			why: 'Each host ran Ubuntu’s default `apt-daily-upgrade` timer: 06:00 UTC plus up to 60 minutes of random delay. The change did not go through Datadog’s rollout tooling, so nothing staged it region by region.'
		},
		{
			q: 'Which systemd-networkd setting keeps IP rules that other software added?',
			options: [
				'`ManageForeignRoutingPolicyRules=no` in networkd.conf',
				'`KeepConfiguration=static` in the .network file',
				'`IgnoreCarrierLoss=yes` in the .network file',
				'`ManageForeignRoutes=no` in networkd.conf'
			],
			answer: 0,
			why: 'The systemd docs: "When false, it will not remove any foreign rules, keeping them even if they are not configured in a .network file. Defaults to yes." The setting exists since v249.'
		}
	],
	recall: {
		q: 'What restarted systemd-networkd on Datadog’s nodes, and what did the restart delete?',
		a: 'Ubuntu’s unattended upgrades installed the systemd patch 249.11-0ubuntu3.7 between 06:00 and 07:00 UTC. The restart deleted Cilium’s IP rules, because `ManageForeignRoutingPolicyRules` defaults to yes.'
	},
	sources: [
		{ title: 'Datadog: 2023-03-08 Incident: Infrastructure connectivity issue affecting multiple regions', url: PM },
		{ title: 'Datadog: 2023-03-08 incident: A deep dive into the platform-level impact', url: IMPACT },
		{ title: 'Datadog: 2023-03-08 incident: A deep dive into our incident response', url: RESPONSE },
		{ title: 'systemd networkd.conf(5): ManageForeignRoutingPolicyRules', url: NETWORKD }
	]
};
