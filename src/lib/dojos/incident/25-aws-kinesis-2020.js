const PM = 'https://aws.amazon.com/message/11201/';
const CELLS = 'https://docs.aws.amazon.com/wellarchitected/latest/reducing-scope-of-impact-with-cell-based-architecture/what-is-a-cell-based-architecture.html';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'aws-kinesis-2020',
	part: 'Capacity and cascades',
	title: 'AWS Kinesis 2020: the capacity addition that hit an OS thread limit',
	minutes: 10,
	hook: [
		'Wednesday 25 November 2020, Northern Virginia (US-EAST-1). Between 2:44 and 3:47 a.m. PST, the Kinesis team adds a small amount of capacity to the Kinesis front-end fleet.',
		'At 5:15 a.m. PST, the first alarms fire: errors on putting and getting Kinesis records. Kinesis is a streaming data service, and other AWS services use it too. CloudWatch and EventBridge start returning errors at 5:15 too.'
	],
	terms: [
		{ term: 'Front-end fleet', def: 'The Kinesis servers that handle authentication, throttling and routing of each request to the right shard. It has many thousands of servers.' },
		{ term: 'Shard-map', def: 'The cache each front-end server keeps of which back-end cluster owns which shard. Without a complete shard-map, a server cannot route requests.' },
		{ term: 'OS thread limit', def: 'An operating system setting that caps how many threads a server may run. A process that needs more threads than the cap cannot create them.' },
		{ term: 'Cell', def: 'One of several isolated copies of a service. Each copy handles a subset of the requests, so a failure stays inside that copy.' }
	],
	incident: {
		org: 'Amazon Web Services',
		title: 'Summary of the Amazon Kinesis Event in the Northern Virginia (US-EAST-1) Region',
		date: '2020-11-25',
		url: PM,
		steps: [
			{
				situation: [
					'It is 5:15 a.m. PST. The capacity addition to the front-end fleet ended at 3:47. The team is reading logs.',
					'The errors come in many kinds, from both old and new front-end servers. Some of them look unrelated to the new capacity, and would likely continue even if the new capacity were removed.'
				],
				q: 'What do you do with the new capacity?',
				options: [
					'Keep it, since several errors have nothing to do with it',
					'Remove it as a precaution, and keep researching the other errors',
					'Add more servers to the front-end fleet to absorb the errors',
					'Restart the whole front-end fleet with the new servers in it'
				],
				answer: 1,
				why: 'The capacity was the most recent change, even if it might not explain every error. AWS: "Still, as a precaution, we began removing the new capacity while researching the other errors." Adding more servers would have made the real problem worse.'
			},
			{
				situation: [
					'You are on the Cognito team. Cognito sends API access data to Kinesis on a best effort basis, with a local buffer for short Kinesis outages.',
					'Cognito’s web servers have started to block on the backlogged Kinesis buffers. Users cannot sign in or get temporary AWS credentials. Adding servers to buffer more calls helped at first, but at 7:01 a.m. error rates rose sharply.'
				],
				q: 'What do you do next?',
				options: [
					'Add more Cognito servers again to hold a bigger buffer',
					'Change Cognito so that its requests stop depending on Kinesis',
					'Wait for Kinesis to recover, since Cognito itself is fine',
					'Restart all Cognito servers to empty their buffers'
				],
				answer: 1,
				why: 'More buffer only delays the moment it fills while Kinesis stays down. The Cognito team was already "working in parallel on a change to Cognito to reduce the dependency on Kinesis". It deployed at 10:15 a.m., and Cognito was normal by 2:18 p.m.'
			},
			{
				situation: [
					'7:51 a.m. The team has narrowed the cause to a couple of candidates. The leading one is an issue that seems to create memory pressure. Every candidate fix means changing the config of every front-end server and restarting the fleet.',
					'A front-end server fills its shard-map with the same resources it uses to serve requests. Servers brought back too fast serve slowly, get marked unhealthy and are removed. A full restart is long and careful, and a wrong fix means a second restart.'
				],
				q: 'What do you do?',
				options: [
					'Apply the memory pressure fix and restart now',
					'Restart the whole fleet at once to save time',
					'Keep confirming the cause while preparing a faster bootstrap',
					'Roll back every front-end server to last week’s build'
				],
				answer: 2,
				why: 'A wrong guess would "double the recovery time". In parallel with the investigation, AWS added a config so that servers load their data "directly from the authoritative metadata store rather than from front-end server neighbors" at bootstrap. At 9:39 the cause turned out not to be memory pressure.'
			},
			{
				situation: [
					'9:39 a.m. The cause is confirmed. Each front-end server creates one OS thread for every other server in the fleet. The new capacity pushed every server above the maximum number of threads allowed by an OS setting.',
					'Above the limit, shard-map construction fails, and servers cannot route requests. The removal of the new capacity has just finished.'
				],
				q: 'What do you change before the restart?',
				options: [
					'Raise the OS thread limit on every server, then restart',
					'Add the new capacity back so the fleet has more servers',
					'Nothing more: with the capacity removed, the thread count fits',
					'Lower each server’s thread count by turning off its throttling'
				],
				answer: 2,
				why: 'Fewer servers means fewer threads per server, so the fleet fits under the limit again. AWS "didn’t want to increase the operating system limit without further testing", and with the capacity gone it "determined that the thread count would no longer exceed the operating system limit".'
			},
			{
				situation: [
					'10:07 a.m. The first group of restarted front-end servers takes Kinesis traffic. The fleet has many thousands of servers.',
					'Each server returning to service must build its shard-map while it serves requests.'
				],
				q: 'How fast do you bring servers back?',
				options: [
					'All of them at once, to end the outage sooner',
					'Half now and half in one hour',
					'A few hundred per hour, watching the error rate',
					'One server per hour, to be completely safe'
				],
				answer: 2,
				why: 'Too fast, and servers fight over resources, slow down and get removed as unhealthy, which sets recovery back. AWS "could only add servers at the rate of a few hundred per hour". The error rate fell steadily from noon, and Kinesis was normal at 10:23 p.m.'
			}
		],
		outcome: [
			'Kinesis returned errors from 5:15 a.m. to 10:23 p.m. PST. Every front-end server keeps one thread per other server, so its thread count is "directly proportional to the number of servers in the fleet". The small addition pushed all servers over the OS thread limit at once.',
			'Several AWS services built on Kinesis failed too. CloudWatch could not process most metrics until its recovery began at 5:47 p.m., which delayed reactive AutoScaling. Lambda’s local buffering of metrics caused memory contention from 6:15 a.m. until a fix at 10:36 a.m. EventBridge delays held up ECS and EKS cluster work until about 4:15 p.m.',
			'AWS could not update the Service Health Dashboard at first, because the posting tool uses Cognito. The backup tool worked, but support operators knew it less well, and early posts were delayed.',
			'Kinesis fixes: larger servers so the fleet has fewer servers and threads, alarms on thread use, tests of a higher thread limit, a dedicated fleet for the shard-map cache, a separate front-end fleet for CloudWatch, and faster cellularization of the front end. Cognito now survives Kinesis errors without filling its buffers, and CloudWatch keeps 3 hours of metrics in a local store.'
		]
	},
	quiz: [
		{
			q: 'Why did a small capacity addition push every front-end server over the thread limit, not only the new ones?',
			options: [
				'The new servers ran a build with a thread leak that spread to the others',
				'Each server opens one thread per other server, so every server needed more',
				'The new servers sent so many requests that the others spawned threads',
				'The OS limit was shared across the fleet, and the new servers used it up'
			],
			answer: 1,
			why: 'Each front-end server creates an OS thread for every other server in the fleet. Adding servers raised the thread count on all existing servers, and all of them crossed the same limit.'
		},
		{
			q: 'Cognito used Kinesis only for best effort analytics. Why did Cognito users fail to sign in?',
			options: [
				'Cognito stored its user pools in Kinesis streams',
				'A latent bug made web servers block on the backlogged Kinesis buffer',
				'Cognito’s servers ran on the same front-end fleet as Kinesis',
				'AWS shut down Cognito to free capacity for Kinesis'
			],
			answer: 1,
			why: 'The buffer was meant to absorb short Kinesis outages. The long outage "triggered a latent bug in this buffering code" and the web servers blocked on it. An optional dependency stopped the main request path.'
		},
		{
			q: 'How does splitting the Kinesis front end into cells help with this kind of limit?',
			options: [
				'Each cell gets its own OS, so the thread limit no longer exists',
				'Each cell has a bounded server count, so threads stay in a tested range',
				'Cells let AWS route all traffic to another region during a failure',
				'Cells share one shard-map, so servers no longer need threads'
			],
			answer: 1,
			why: 'Threads per server grow with the number of servers they talk to. A cell keeps its server count within a tested range, so no server has to talk to the whole fleet. AWS: cellularization "will provide better protection against any future unknown scaling limit."'
		}
	],
	recall: {
		q: 'What limit did the Kinesis front-end servers hit on 25 November 2020, and why?',
		a: 'The OS limit on threads per server. Each front-end server runs one thread per other server, and the new capacity pushed every server over the limit, so shard-maps failed to build.'
	},
	sources: [
		{ title: 'AWS: Summary of the Amazon Kinesis Event in the Northern Virginia (US-EAST-1) Region', url: PM },
		{ title: 'AWS Well-Architected: What is a cell-based architecture?', url: CELLS }
	]
};
