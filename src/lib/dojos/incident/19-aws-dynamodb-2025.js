const AWS = 'https://aws.amazon.com/message/101925/';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'aws-dynamodb-2025',
	part: 'Networks and DNS',
	title: 'AWS us-east-1 2025: a race in DynamoDB\'s DNS automation',
	minutes: 10,
	hook: [
		'Sunday 19 October 2025, 11:48 PM PDT. In the N. Virginia (us-east-1) Region, Amazon DynamoDB starts returning API errors.',
		'Customers cannot open new connections to DynamoDB. AWS services that depend on it fail too: Lambda and STS errors start at 11:51 PM.',
		'You are on one of the engineering teams engaged at once.'
	],
	terms: [
		{ term: 'DNS Planner', def: 'The DynamoDB component that watches load balancer health and capacity and regularly writes a new DNS plan: a set of load balancers and weights for each endpoint.' },
		{ term: 'DNS Enactor', def: 'The component that applies a DNS plan in Amazon Route53, one transaction per endpoint. Three copies run independently, in three Availability Zones.' },
		{ term: 'Race condition', def: 'A bug that appears only when two processes act in one particular order. Here, two DNS Enactors worked on the same endpoint at nearly the same time.' },
		{ term: 'Droplet lease', def: 'The lease that EC2\'s DropletWorkflow Manager (DWFM) holds on each physical server, or droplet. A droplet without an active lease cannot take new instances.' }
	],
	incident: {
		org: 'Amazon Web Services',
		title: 'Summary of the Amazon DynamoDB Service Disruption in the Northern Virginia (US-EAST-1) Region',
		date: '2025-10-19',
		url: AWS,
		steps: [
			{
				situation: [
					'11:48 PM PDT. Every system that reaches DynamoDB through the public regional endpoint fails to connect, customer traffic and internal AWS traffic alike.',
					'Customers with DynamoDB global tables can still send requests to their replica tables in other Regions.'
				],
				q: 'What do you check first?',
				options: [
					'The health of the DynamoDB storage nodes in us-east-1',
					'What `dynamodb.us-east-1.amazonaws.com` resolves to right now',
					'The last code deploy to DynamoDB\'s request routers',
					'The IAM policies of the services that call DynamoDB'
				],
				answer: 1,
				why: 'New connections fail everywhere at once, while other Regions answer, which points at how clients find the endpoint. The systems "immediately began experiencing DNS failures". By 12:38 AM, engineers "had identified DynamoDB’s DNS state as the source of the outage."'
			},
			{
				situation: [
					'The DNS record for `dynamodb.us-east-1.amazonaws.com` is empty: it lists no IP addresses. The active DNS plan has been deleted.',
					'In this state, no DNS Enactor can apply a later plan, so the record stays empty.'
				],
				q: 'How do you get the endpoint back?',
				options: [
					'Wait for the DNS Planner\'s next plan to overwrite the empty record',
					'Restart the three DNS Enactors so they reload the latest plan',
					'Have operators repair the DNS state by hand, outside the automation',
					'Tell every customer to switch to their global table replicas'
				],
				answer: 2,
				why: 'The inconsistent state blocked every Enactor, so the automation could not repair itself. AWS writes that it "ultimately required manual operator intervention to correct." By 1:15 AM some internal services could connect again, and by 2:25 AM all DNS information was restored.'
			},
			{
				situation: [
					'2:25 AM PDT. DynamoDB is back, but new EC2 launches fail with "insufficient capacity" errors. Between 11:48 PM and 2:24 AM, the DWFM leases on droplets slowly timed out, because the DWFM state checks depend on DynamoDB.',
					'DWFM now tries to re-establish leases on the whole fleet. Each attempt takes so long that it times out before it completes, and the retries are queued as more work. No operational procedure exists for this state.'
				],
				q: 'What do you do with DWFM?',
				options: [
					'Throttle incoming work and restart some DWFM hosts selectively',
					'Leave DWFM alone until its queue drains by itself',
					'Restart every DWFM host in the Region at the same time',
					'Add more DWFM hosts so the queue is shared across more workers'
				],
				answer: 0,
				why: 'A queue of retries that time out never shrinks, so the work had to be cut and the queues cleared. At 4:14 AM "engineers throttled incoming work and began selective restarts of DWFM hosts". The restarts cleared the queues, and by 5:28 AM DWFM held leases on all droplets in the Region.'
			},
			{
				situation: [
					'New instances now launch, but Network Manager has a large backlog of network configurations to push to them. Network Load Balancer health checks start bringing these instances into service before their network state has propagated.',
					'At 6:52 AM, monitoring detects NLB health checks that alternate between failing and passing. The flapping overloads the health check subsystem, which triggers automatic AZ DNS failover and removes capacity from multi-AZ load balancers.'
				],
				q: 'What do you do about the NLB failovers?',
				options: [
					'Lower the health check threshold so nodes fail sooner',
					'Disable automatic health check failover for NLB until EC2 recovers',
					'Add more NLB nodes in every Availability Zone',
					'Ask customers to move their load balancers to another Region'
				],
				answer: 1,
				why: 'The nodes and targets were healthy, and the failing checks came from network state that had not arrived yet. At 9:36 AM "engineers disabled automatic health check failovers for NLB", which brought the healthy capacity back. They re-enabled it at 2:09 PM, after EC2 recovered.'
			},
			{
				situation: [
					'The review finds the race. One DNS Enactor was badly delayed while applying an old plan. Another Enactor applied a much newer plan, then ran its clean-up of old plans.',
					'The delayed Enactor wrote its old plan over the newer one, and the clean-up then deleted that old plan, emptying the record. The same Planner and Enactor automation runs in other Regions.'
				],
				q: 'What do you do with the DNS automation?',
				options: [
					'Keep it running, since the race needs a very unlikely timing',
					'Disable it in us-east-1 only, where the race happened',
					'Disable it worldwide until the race is fixed and guarded',
					'Keep it running and add an alert for empty DNS records'
				],
				answer: 2,
				why: 'The same code could hit the same timing in any Region. AWS writes: "We have already disabled the DynamoDB DNS Planner and the DNS Enactor automation worldwide." Before turning it back on, AWS will fix the race and "add additional protections to prevent the application of incorrect DNS plans."'
			}
		],
		outcome: [
			'The root cause was "a latent race condition in the DynamoDB DNS management system". An Enactor checks once, before it starts, that its plan is newer than the applied one. Its delays made that check stale, so its old plan overwrote the newer one, and the other Enactor\'s clean-up deleted it.',
			'The event ran from 11:48 PM PDT on 19 October to 2:20 PM on 20 October. DynamoDB API errors lasted until 2:40 AM. New EC2 launches failed from 2:25 AM to 10:36 AM, and some NLBs had connection errors from 5:30 AM to 2:09 PM.',
			'Lambda, STS, IAM sign-in to the console, Redshift, Amazon Connect, ECS, EKS and Fargate were among the services hit in us-east-1. Some Redshift clusters stayed unavailable until 4:05 AM PDT on 21 October.',
			'AWS listed these fixes: fix the race and add protections before re-enabling the DNS automation, a velocity control to limit how much capacity one NLB can remove during AZ failover, a test suite that exercises the DWFM recovery workflow, and throttling in EC2 data propagation based on the size of the waiting queue.'
		]
	},
	quiz: [
		{
			q: 'The DNS Enactor checks that its plan is newer than the applied plan. Why did that check let an old plan through?',
			options: [
				'The check compared plan sizes instead of plan generations',
				'It ran once at the start, and long delays made it stale',
				'The newer plan had been deleted before the check ran',
				'The check only ran in one of the three Availability Zones'
			],
			answer: 1,
			why: 'The check happened before the Enactor started working through the endpoints. It then spent a long time retrying blocked transactions, and by the time it wrote the regional endpoint, newer plans had been applied. Each Route53 transaction applies all of its changes or none, but it does not check which plan is newer.'
		},
		{
			q: 'DynamoDB was back at 2:25 AM. Why did new EC2 launches keep failing for hours?',
			options: [
				'DNS caches on EC2 hosts kept the empty DynamoDB record for hours',
				'The droplets had been powered off to protect running instances',
				'Customers launched so many instances that the Region ran out of servers',
				'DWFM had to renew leases on every droplet and timed out trying'
			],
			answer: 3,
			why: 'A droplet without an active lease is not a candidate for new launches. With the whole fleet to renew, each lease attempt took longer than its timeout and was queued again. AWS calls this state "congestive collapse".'
		},
		{
			q: 'Why did NLB health checks fail on nodes and targets that were healthy?',
			options: [
				'The new instances had no network configuration yet',
				'The health check subsystem was reading stale DynamoDB data',
				'The targets were rejecting connections during a deploy',
				'The checks used the empty DynamoDB DNS record'
			],
			answer: 0,
			why: 'Network Manager had a backlog of network state to push, so new instances came into service before they could communicate. The checks failed, then passed, and each failure pulled nodes out of DNS.'
		}
	],
	recall: {
		q: 'How did the DNS record for `dynamodb.us-east-1.amazonaws.com` end up empty on 19 October 2025?',
		a: 'A delayed DNS Enactor applied an old plan over a newer one, then another Enactor\'s clean-up deleted that old plan, which removed every IP address from the record.'
	},
	sources: [
		{ title: 'AWS: Summary of the Amazon DynamoDB Service Disruption in the Northern Virginia (US-EAST-1) Region', url: AWS },
		{ title: 'Amazon Route 53 API Reference: ChangeResourceRecordSets', url: 'https://docs.aws.amazon.com/Route53/latest/APIReference/API_ChangeResourceRecordSets.html' }
	]
};
