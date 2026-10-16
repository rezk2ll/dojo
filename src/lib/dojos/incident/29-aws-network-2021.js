const PM = 'https://aws.amazon.com/message/12721/';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'aws-network-2021',
	part: 'Capacity and cascades',
	title: 'AWS 2021: congestion on the internal network in us-east-1',
	minutes: 10,
	hook: [
		'Tuesday 7 December 2021, 7:30 a.m. PST, Northern Virginia (US-EAST-1). You are on an AWS operations team. AWS runs monitoring, internal DNS, authorization and parts of the EC2 control plane on an internal network.',
		'Networking devices connect that internal network to the main AWS network, where most AWS services and all customer applications run. At 7:30 those devices start to slow down the traffic between the two networks.',
		'At 7:33 the EC2 APIs that launch and describe instances return more errors and answer slowly. Your real-time monitoring data stops coming in.'
	],
	terms: [
		{ term: 'Internal network', def: 'The AWS network that hosts foundational services: monitoring, internal DNS, authorization and parts of the EC2 control plane. Customer applications do not run on it.' },
		{ term: 'Control plane', def: 'The APIs that create and manage AWS resources, such as launching an EC2 instance. Running instances keep working without it.' },
		{ term: 'Backoff', def: 'A client waits longer after each failed try before it retries. Without it, retries add load to a system that is already failing.' },
		{ term: 'Service Health Dashboard', def: 'The public AWS page where AWS posts the status of its services in each region.' }
	],
	incident: {
		org: 'Amazon Web Services',
		title: 'Summary of the AWS Service Event in the Northern Virginia (US-EAST-1) Region',
		date: '2021-12-07',
		url: PM,
		steps: [
			{
				situation: [
					'Shortly after 7:30. The devices between the internal network and the main network are congested. Latency and errors rise for every service that talks across them.',
					'The congestion also cuts off your real-time monitoring data. Your dashboards do not show where the traffic comes from.'
				],
				q: 'How do you look for the source of the congestion?',
				options: [
					'Wait for the monitoring data to come back, then read the dashboards',
					'Read the service logs to find which errors are rising',
					'Roll back the latest deploy of every service in the region',
					'Move all us-east-1 customer traffic to another region'
				],
				answer: 1,
				why: 'The summary: "Operators instead relied on logs to understand what was happening and initially identified elevated internal DNS errors." The monitoring data was still not visible to the team after 9:28 a.m.'
			},
			{
				situation: [
					'You need to post on the Service Health Dashboard. Its tooling should fail over to a standby region, but the congestion blocks that failover. You get it working by 8:22.',
					'Many AWS services are hit, and all the impact comes from one root cause.'
				],
				q: 'How do you post the update?',
				options: [
					'One global banner at the top of the dashboard',
					'An entry on each affected service, saying what fails',
					'Nothing until the root cause is fixed',
					'A post on social media only, linking to nothing'
				],
				answer: 1,
				why: 'AWS chose a global banner because the impact "all stemmed from a single root cause". It later wrote that the banner "makes it difficult for some customers to find information about this issue". AWS planned a new Service Health Dashboard that makes it easier to understand service impact.'
			},
			{
				situation: [
					'The logs show elevated internal DNS errors. Internal DNS is foundational for all services, and its traffic seems to add to the congestion.'
				],
				q: 'What do you do with internal DNS?',
				options: [
					'Restart the internal DNS servers one at a time',
					'Ask service teams to cache DNS answers for one day',
					'Move internal DNS traffic away from the congested paths',
					'Leave DNS alone until the congestion clears'
				],
				answer: 2,
				why: 'The teams moved internal DNS traffic off the congested paths and finished at 9:28 a.m. DNS resolution errors fully recovered. The change reduced the load on the devices and improved several services, but "did not fully resolve the AWS service impact or eliminate the congestion".'
			},
			{
				situation: [
					'9:28. The devices are still congested, and monitoring data is still not visible. Your internal deployment systems run on the internal network, so they are impaired too.',
					'Many AWS services on the main network and many customer applications still work normally.'
				],
				q: 'How do you reduce the congestion?',
				options: [
					'Push one large network change to all the devices at the same time',
					'Restart every networking device between the two networks',
					'Block all traffic from the internal network for ten minutes',
					'Isolate top traffic sources and add capacity, one step at a time'
				],
				answer: 3,
				why: 'The operators isolated the top traffic sources on dedicated devices, disabled some heavy services and brought more capacity online. They went slowly because "we wanted to be extremely deliberate while making changes to avoid impacting functioning workloads." Congestion improved a lot by 1:34 p.m., and all devices recovered by 2:22 p.m.'
			},
			{
				situation: [
					'The review finds the trigger. At 7:30, an automated activity scaled the capacity of an AWS service on the main network. That caused a large number of clients on the internal network to open connections at once.',
					'The connection delays caused more connection attempts and retries. These clients have back-off code, but it did not slow them down this time.'
				],
				q: 'Which fix stops this exact chain from coming back?',
				options: [
					'Never scale any service on the main network again',
					'Fix the latent bug that kept the clients from backing off',
					'Double the number of devices between the two networks',
					'Move the monitoring service onto the main AWS network'
				],
				answer: 1,
				why: 'AWS wrote that "a latent issue prevented these clients from adequately backing off during this event" and planned to deploy a fix within two weeks. It also paused the scaling activities until all fixes were out and added network configuration that protects the devices from a similar surge.'
			}
		],
		outcome: [
			'Root cause: an automated scaling activity on the main AWS network triggered "an unexpected behavior from a large number of clients inside the internal network". Their connections overwhelmed the devices between the two networks. Delays caused more retries, and a latent bug kept the clients from backing off.',
			'Running EC2 instances were not affected. EC2 APIs had errors from 7:33 a.m., and launches of new instances only recovered at 2:40 p.m. Route 53 APIs were impaired from 7:30 a.m. to 2:30 p.m., but existing DNS records kept answering.',
			'Other services needed more time. API Gateway largely recovered by 4:37 p.m., and EventBridge delivered events late until 6:40 p.m. Support cases could not be created from 7:33 a.m. to 2:25 p.m., because the Support Contact Center relies on the internal network.',
			'The fixes AWS listed: the scaling activities stay off until all fixes are out, a fix for the client back-off bug, network configuration that protects the devices, a new Service Health Dashboard, and a support system that runs across several AWS regions.'
		]
	},
	quiz: [
		{
			q: 'The surge of connections started at 7:30. Why were the devices still congested hours later?',
			options: [
				'The scaling activity kept running in a loop until 2:22 p.m.',
				'Delays made clients retry, and a latent bug kept them from backing off',
				'The devices crashed and needed a manual reboot one by one',
				'Customer traffic on the main network kept growing all day'
			],
			answer: 1,
			why: 'Each delay led to "even more connection attempts and retries", which added load to the same devices. Back-off code should have spread those retries out, but a latent issue stopped it from working.'
		},
		{
			q: 'Running EC2 instances kept working all day. Why could customers not launch new ones?',
			options: [
				'All us-east-1 hosts were full after the scaling activity',
				'The EC2 control plane uses services on the internal network',
				'Route 53 could not give names to new instances',
				'New instances need S3, and S3 was down in us-east-1'
			],
			answer: 1,
			why: 'The summary: these control planes "use services hosted in the internal network". Running instances live on the main network, so they did not need the congested devices.'
		},
		{
			q: '10,000 clients retry a failed call every second with no wait. The server is overloaded. What change to the clients helps it recover?',
			options: [
				'Retry with a shorter timeout so failures come back faster',
				'Wait longer after each failure, with a random delay added',
				'Retry the same call on two servers at once',
				'Keep retrying until the call succeeds, with no limit'
			],
			answer: 1,
			why: 'The AWS Builders’ Library: "When failures are caused by overload, retries that increase load can make matters significantly worse." Exponential backoff spaces the retries out, and jitter spreads them so they do not all arrive at the same moment.'
		}
	],
	recall: {
		q: 'Why did an automated scaling activity on 7 December 2021 keep the us-east-1 internal network congested for hours?',
		a: 'It set off a surge of connections from clients on the internal network. Delays caused more retries, and a latent bug kept those clients from backing off, so the devices only fully recovered at 2:22 p.m. PST.'
	},
	sources: [
		{ title: 'AWS, Summary of the AWS Service Event in the Northern Virginia (US-EAST-1) Region (10 December 2021)', url: PM },
		{ title: 'Amazon Builders’ Library, Timeouts, retries, and backoff with jitter', url: 'https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/' }
	]
};
