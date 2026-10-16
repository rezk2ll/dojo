const PM = 'https://aws.amazon.com/message/41926/';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'aws-s3-2017',
	part: 'Changes and config',
	title: 'AWS S3 2017: the command that removed too many servers',
	minutes: 10,
	hook: [
		'Tuesday 28 February 2017, Northern Virginia (US-EAST-1). You are on the Amazon S3 team. The S3 billing system is running more slowly than expected, and the team is debugging it.',
		'At 9:37 a.m. PST, a team member follows an established playbook and runs a command. It should take a small number of servers out of one S3 subsystem that the billing process uses.',
		'Then S3 in the region stops answering GET, LIST, PUT and DELETE requests. The S3 console fails. So do new EC2 instance launches and AWS Lambda.'
	],
	terms: [
		{ term: 'Index subsystem', def: 'The S3 subsystem that holds the metadata and location of every S3 object in the region. Every GET, LIST, PUT and DELETE needs it.' },
		{ term: 'Placement subsystem', def: 'The S3 subsystem that allocates storage for new objects during a PUT. It needs the index subsystem to work.' },
		{ term: 'Service Health Dashboard', def: 'The public AWS page (SHD) where AWS posts the status of each service in each region.' },
		{ term: 'Cell', def: 'One of several isolated copies of a service. Each copy serves only part of the requests, so a failure in one copy hits only that part.' }
	],
	incident: {
		org: 'Amazon Web Services',
		title: 'Summary of the Amazon S3 Service Disruption in the Northern Virginia (US-EAST-1) Region',
		date: '2017-02-28',
		url: PM,
		steps: [
			{
				situation: [
					'The 9:37 command took out far more servers than planned. AWS later wrote that "one of the inputs to the command was entered incorrectly and a larger set of servers was removed than intended."',
					'The removed servers carried a large part of the index subsystem and the placement subsystem. Both are down, and S3 serves no requests.'
				],
				q: 'What do you do with the two subsystems?',
				options: [
					'Run the same command again with the correct input',
					'Wait for both subsystems to rebalance on the servers they still have',
					'Restart both subsystems fully',
					'Add new servers to both subsystems while they keep running'
				],
				answer: 2,
				why: 'The postmortem: "Removing a significant portion of the capacity caused each of these systems to require a full restart." Running the command again would remove even more servers.'
			},
			{
				situation: [
					'You have to bring up two subsystems. The placement subsystem "requires the index subsystem to be functioning properly to correctly operate."',
					'GET, LIST and DELETE need only the index subsystem. PUT needs both.'
				],
				q: 'In which order do you restart them?',
				options: [
					'Placement first, so that customers can upload new objects again',
					'Index first, then placement once the index works',
					'Both at the same time, so that all four APIs return together',
					'The billing subsystem first, since the incident started there'
				],
				answer: 1,
				why: 'AWS restarted the index subsystem first. The placement subsystem "began recovery when the index subsystem was functional". A placement subsystem started without a working index cannot allocate storage.'
			},
			{
				situation: [
					'AWS reports outages on the Service Health Dashboard, where each service in each region has its own status.',
					'You try to update the S3 entry and cannot. The SHD administration console depends on Amazon S3, and S3 in US-EAST-1 is down.'
				],
				q: 'How do you tell customers what is happening?',
				options: [
					'Wait until S3 is back, then update the dashboard',
					'Post on the AWS Twitter feed and in the SHD banner text',
					'Mark every service in the region as red by hand in the database',
					'Email each customer in the region one by one'
				],
				answer: 1,
				why: 'From the start of the event until 11:37 a.m., AWS "used the AWS Twitter feed (@AWSCloud) and SHD banner text to communicate status". The per service entries stayed out of date until 11:37 a.m.'
			},
			{
				situation: [
					'The restarts are slow. AWS had "not completely restarted the index subsystem or the placement subsystem in our larger regions for many years", and S3 had grown a lot since.',
					'The restart includes safety checks that validate the integrity of the metadata. The checks take a long time.'
				],
				q: 'S3 has served nothing since 9:37 a.m. What do you do about the checks?',
				options: [
					'Skip the checks and serve requests as soon as the servers are up',
					'Run the checks on a sample of the metadata only',
					'Serve requests now and run the checks in the background',
					'Keep running the full checks before serving requests'
				],
				answer: 3,
				why: 'The postmortem calls them "the necessary safety checks to validate the integrity of the metadata". AWS ran them, and the restart "took longer than expected". GET came back at 12:26 p.m.'
			},
			{
				situation: [
					'By 12:26 p.m. PST, GET, LIST and DELETE work again. The index subsystem is fully back at 1:18 p.m. and the placement subsystem at 1:54 p.m.',
					'Some other AWS services still have a backlog of work from the outage. The team now plans what to change first.'
				],
				q: 'Which change stops a mistyped input from doing this again?',
				options: [
					'Make the capacity tool slower and stop it going below minimum capacity',
					'Remove the playbook so that nobody removes servers by hand',
					'Require two people to type the command together',
					'Add twice as many servers to the index subsystem'
				],
				answer: 0,
				why: 'AWS found that "the tool used allowed too much capacity to be removed too quickly." It now removes capacity more slowly and refuses to take any subsystem below its minimum required capacity. AWS: "This will prevent an incorrect input from triggering a similar event in the future."'
			}
		],
		outcome: [
			'The trigger was one mistyped input to a command from an established playbook. The command removed servers from the index and placement subsystems, and both needed a full restart. AWS wrote that the tool "allowed too much capacity to be removed too quickly."',
			'S3 in US-EAST-1 served no requests from 9:37 a.m. until 12:26 p.m. PST, almost 3 hours. PUT came back last, at 1:54 p.m. The S3 console, EC2 new instance launches, EBS volumes that needed data from an S3 snapshot, and Lambda were also hit.',
			'AWS changed the tool to remove capacity more slowly and to stop at each subsystem\'s minimum required capacity. It is auditing its other operational tools for the same kind of check.',
			'AWS moved up planned work to split the index subsystem into smaller cells, to "reduce blast radius and improve recovery". It also changed the SHD administration console to run across multiple AWS regions.'
		]
	},
	quiz: [
		{
			q: 'GET, LIST and DELETE worked again at 12:26 p.m., but PUT only at 1:54 p.m. Why did PUT take longer?',
			options: [
				'PUT requests were throttled on purpose to protect the billing system',
				'PUT also needs placement, which can only recover once the index works',
				'The removed servers stored the data of all new uploads',
				'AWS restarted the placement subsystem first and it failed'
			],
			answer: 1,
			why: 'PUT needs the index subsystem for the object\'s metadata and the placement subsystem to allocate storage for it. Placement depends on the index, so its recovery could only start after the index recovery.'
		},
		{
			q: 'The AWS status page could not show S3 as down because its admin console depended on S3. What change did AWS make?',
			options: [
				'It moved the console to a separate account in US-EAST-1',
				'It replaced the dashboard with the Twitter feed',
				'It made the console run across multiple AWS regions',
				'It cached the dashboard in every customer\'s browser'
			],
			answer: 2,
			why: 'AWS "changed the SHD administration console to run across multiple AWS regions". On 28 February the console could not update the per service status until 11:37 a.m., because S3 in US-EAST-1 was down.'
		},
		{
			q: 'A service runs as 10 cells and serves 100 requests. One cell fails. How many requests still succeed?',
			options: ['0, because the cells share one index', '50', '90', '99'],
			answer: 2,
			why: 'Each cell is independent and serves its own share of requests. AWS\'s guide on cells uses this exact case: with 10 cells serving 100 requests, a failure in one cell leaves 90% of requests unaffected.'
		}
	],
	recall: {
		q: 'What two changes did AWS make to its capacity removal tool after the S3 outage?',
		a: 'The tool now removes capacity more slowly, and it refuses to remove capacity when that would take any subsystem below its minimum required capacity level.'
	},
	sources: [
		{ title: 'AWS, Summary of the Amazon S3 Service Disruption in the Northern Virginia (US-EAST-1) Region', url: PM },
		{
			title: 'AWS Well-Architected, What is a cell-based architecture?',
			url: 'https://docs.aws.amazon.com/wellarchitected/latest/reducing-scope-of-impact-with-cell-based-architecture/what-is-a-cell-based-architecture.html'
		}
	]
};
