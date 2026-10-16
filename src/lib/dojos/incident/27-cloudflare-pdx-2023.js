const PM = 'https://blog.cloudflare.com/post-mortem-on-cloudflare-control-plane-and-analytics-outage/';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'cloudflare-pdx-2023',
	part: 'Capacity and cascades',
	title: 'Cloudflare 2023: the data center that lost all power',
	minutes: 10,
	hook: [
		'Thursday 2 November 2023, 11:44 UTC. You are on call at Cloudflare. The two routers that connect the data center PDX-04, near Hillsboro, Oregon, to the rest of the world go offline.',
		'Cloudflare runs its control plane and its analytics in three data centers around Hillsboro. PDX-04 is the largest of the three. A company called Flexential runs it, and Cloudflare rents space there.',
		'You cannot reach the two routers directly. You cannot reach them through out-of-band management either.'
	],
	terms: [
		{ term: 'Control plane', def: 'The customer-facing interface for all Cloudflare services: the dashboard website and the APIs. Customers change their settings through it.' },
		{ term: 'High availability cluster', def: 'The set of services that run in all three Hillsboro data centers at once and keep their data in sync. If one data center goes offline, the other two keep running them.' },
		{ term: 'Disaster recovery site', def: 'A Cloudflare facility in Europe that can run critical control plane services when the Hillsboro data centers cannot.' },
		{ term: 'Thundering herd', def: 'A service comes back, and all the requests that failed while it was down arrive at once and overload it.' }
	],
	incident: {
		org: 'Cloudflare',
		title: 'Post mortem on the Cloudflare Control Plane and Analytics Outage',
		date: '2023-11-02',
		url: PM,
		steps: [
			{
				situation: [
					'11:44 UTC. Both PDX-04 routers are unreachable, including through out-of-band management. Flexential has sent you no message about the facility.',
					'Traffic through the Cloudflare network keeps flowing. The control plane and analytics start to show errors.'
				],
				q: 'What do you do first?',
				options: [
					'Call Flexential and send your local team to the facility',
					'Fail the whole control plane over to Europe right away',
					'Wait for Flexential to send a notice about the facility',
					'Open a case with the router vendor about both routers'
				],
				answer: 0,
				why: 'Cloudflare tried to contact Flexential and sent its local team to the site. The first message from Flexential came at 12:28 UTC, 44 minutes after the routers went offline. Flexential had also not told Cloudflare that it switched to generator power at 08:50: "None of our observability tools were able to detect that the source of power had changed."'
			},
			{
				situation: [
					'12:28. Flexential reports "an issue with power" at PDX-04. At 12:48 its generators restart, but the circuit breakers for Cloudflare turn out to be faulty. Flexential has fewer spare breakers than it needs and cannot give a time for restoration.',
					'Most critical services run on in the two other data centers. But more services are down than the team planned for a PDX-04 failure.'
				],
				q: 'What do you do with the services that are down?',
				options: [
					'Wait for Flexential to replace the breakers and restore power',
					'Fail them over to the disaster recovery sites in Europe',
					'Start moving each of them into the high availability cluster now',
					'Ask Flexential to power the Cloudflare circuits one at a time'
				],
				answer: 1,
				why: 'The post: "Because more services were offline than we expected, and because Flexential could not give us a time for restoration of our services, we made the call at 13:40 UTC to fail over". Only a small part of the control plane needed to move, and the first services came up in Europe at 13:43.'
			},
			{
				situation: [
					'13:43. The first services are up at the disaster recovery site. Customers have been calling the API and the dashboard for two hours, and their calls failed.',
					'Now all those calls reach the newly started services at once, and the services are overwhelmed.'
				],
				q: 'What do you do?',
				options: [
					'Shut the services down again and wait for PDX-04',
					'Put rate limits on the incoming requests',
					'Restart the services until one of the restarts holds',
					'Move the services back to the two Hillsboro data centers'
				],
				answer: 1,
				why: 'The post calls it "a thundering herd problem" and says: "We implemented rate limits to get the request volume under control." Customers saw intermittent dashboard and API errors during this time. By 17:57 UTC the moved services were stable.'
			},
			{
				situation: [
					'22:48. Flexential has replaced the failed breakers, restored both utility feeds and confirmed clean power at PDX-04.',
					'Your team has worked on the incident since before 12:00 UTC. The services that moved to Europe have been stable since 17:57. Log processing and some APIs still wait for PDX-04.'
				],
				q: 'When do you start moving services back to PDX-04?',
				options: [
					'Now, with the team that has worked all day',
					'Tomorrow morning, after most of the team has slept',
					'Now, by powering on every PDX-04 server at once',
					'After a week, when Flexential has finished its own review'
				],
				answer: 1,
				why: 'Matthew Prince, who wrote the post: "I made the call that most of us should get some rest and start the move back to PDX-04 in the morning." He adds that it "delayed our full recovery, but I believe made it less likely that we\'d compound this situation with additional mistakes."'
			},
			{
				situation: [
					'3 November, morning. The team boots the PDX-04 network gear. Thousands of servers wait to be powered on.',
					'The power probably went off and on several times during the incident. Nobody knows what state the services on those servers are in.'
				],
				q: 'How do you bring the facility back?',
				options: [
					'Power on all servers and let each service resume where it stopped',
					'Rebuild the whole facility, starting with the configuration management servers',
					'Power on the Kafka and ClickHouse servers first and check their data',
					'Copy the disaster recovery state from Europe onto every PDX-04 server'
				],
				answer: 1,
				why: 'The post: "Our only safe process to recover was to follow a complete bootstrap of the entire facility." Rebuilding the configuration management servers took 3 hours. Each other server took between 10 minutes and 2 hours, and some services had to come back in order.'
			}
		],
		outcome: [
			'The power chain: at 08:50 UTC a utility maintenance event cut one of the power feeds into PDX-04, and Flexential started its generators. At about 11:40 a ground fault on a utility transformer shut down the facility generators too. The UPS batteries were meant to last about 10 minutes and started to fail after 4, and all customers in the facility lost power between 11:44 and 12:01.',
			'The Cloudflare side: some services in the high availability cluster depended on Kafka and ClickHouse, which ran only in PDX-04. Cloudflare had tested taking each of the two other facilities offline, but "we had never tested fully taking the entire PDX-04 facility offline." Newer products were not required to join the high availability cluster before general availability.',
			'Impact: the outage lasted from 11:44 UTC on 2 November to 04:25 UTC on 4 November. Most of the control plane was back at the disaster recovery site at 17:57 on 2 November. Traffic through the network was not affected, but log push logs for most of the event were never processed and are lost.',
			'Cloudflare declared "Code Orange" and moved non-critical engineering to the control plane. The listed changes include: no control plane dependency on the core data centers where possible, a tested disaster recovery plan for every generally available product, and chaos tests that remove each core facility completely.',
			'On 26 March 2024 the same facility lost power again at 14:58 UTC. This time the APIs and dashboards were operating normally by 15:05, "all without human intervention".'
		]
	},
	quiz: [
		{
			q: 'Only PDX-04 lost power, and the high availability cluster also ran in two other data centers. Why did parts of that cluster fail?',
			options: [
				'The two other data centers shared the same utility feed as PDX-04',
				'Some of its services depended on Kafka and ClickHouse, which ran only in PDX-04',
				'The cluster needs all three data centers online to accept any write',
				'The cluster could not reach its routers, which were all in PDX-04'
			],
			answer: 1,
			why: 'The post: Kafka and ClickHouse "were only available in PDX-04 but had services that depended on them that were running in the high availability cluster". A service in the cluster that calls a PDX-04 only service goes down with PDX-04.'
		},
		{
			q: 'Cloudflare had tested its high availability cluster before. Which test would have found these dependencies?',
			options: [
				'Taking each of the two other data centers offline',
				'Taking the high availability part of PDX-04 offline',
				'Taking the entire PDX-04 facility offline',
				'Failing over the control plane to Europe'
			],
			answer: 2,
			why: 'The first two tests had been run. Taking out only the high availability part of PDX-04 left Kafka and ClickHouse running, so the services that depended on them kept working during the test.'
		},
		{
			q: 'Your API has been down for two hours and clients kept retrying. You are about to start it on new servers. What do you prepare?',
			options: [
				'Nothing special, since the servers are new and empty',
				'Rate limits, because every pending request may arrive at once',
				'A larger database connection pool, set before the start',
				'A DNS change so that clients pick up the new servers slowly'
			],
			answer: 1,
			why: 'When Cloudflare started services in Europe, "the API calls that had been failing overwhelmed our services". Rate limits brought the request volume back to what the services could handle.'
		}
	],
	recall: {
		q: 'Why did parts of the Cloudflare high availability cluster fail when PDX-04 lost power on 2 November 2023?',
		a: 'They depended on Kafka and ClickHouse, which ran only in PDX-04. Cloudflare had never tested taking the whole PDX-04 facility offline, so nobody had seen those dependencies.'
	},
	sources: [
		{ title: 'Cloudflare blog, Post mortem on the Cloudflare Control Plane and Analytics Outage (4 November 2023)', url: PM },
		{ title: 'Cloudflare blog, Major data center power failure (again): Cloudflare Code Orange tested (2024)', url: 'https://blog.cloudflare.com/major-data-center-power-failure-again-cloudflare-code-orange-tested/' }
	]
};
