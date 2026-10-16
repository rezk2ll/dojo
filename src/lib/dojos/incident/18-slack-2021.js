const PM = 'https://slack.engineering/slacks-outage-on-january-4th-2021/';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'slack-2021',
	part: 'Networks and DNS',
	title: 'Slack 2021: an overloaded Transit Gateway on the first workday of the year',
	minutes: 10,
	hook: [
		'Monday 4 January 2021, the first working day of the year for many people around the world. The day in Asia Pacific and the morning in Europe go by quietly.',
		'During the Americas\' morning, an external monitoring service pages you: error rates are creeping up. The errors keep getting worse, so the team starts its incident process.'
	],
	terms: [
		{ term: 'VPC', def: 'Virtual Private Cloud: an isolated network inside AWS. Slack runs its services in separate AWS accounts and dedicated VPCs.' },
		{ term: 'Transit Gateway (TGW)', def: 'An AWS network hub that interconnects VPCs. AWS manages and scales it, and Slack uses TGWs to link its VPCs.' },
		{ term: 'Web tier', def: 'Slack\'s fleet of web servers. Autoscaling adds or removes instances based on CPU use and on busy Apache worker threads.' },
		{ term: 'provision-service', def: 'The Slack service that configures and tests every new instance before it serves traffic.' }
	],
	incident: {
		org: 'Slack',
		title: 'Slack’s Outage on January 4th 2021',
		date: '2021-01-04',
		url: PM,
		steps: [
			{
				situation: [
					'Early in the investigation, Slack\'s dashboarding and alerting service goes down.',
					'You still have internal consoles, status pages, some command line tools and the logs. The metrics backends are still up.'
				],
				q: 'How do you keep investigating?',
				options: [
					'Wait until the dashboards are back before you change anything',
					'Page the monitoring team, and query the metrics backends directly',
					'Roll back every service to its version from last week',
					'Move the investigation to the status page reports from users'
				],
				answer: 1,
				why: 'The data still existed, only the dashboards over it were gone. Slack "immediately paged in our monitoring team" and queried the metrics backends directly, which "is nowhere near as efficient as using our dashboards with their pre-built queries".'
			},
			{
				situation: [
					'The team rolls back some changes pushed that day, and the errors continue. The infrastructure seems to be up, but you see signs of widespread network degradation.',
					'At 6:57am PST, 99% of Slack messages are sent successfully. The usual rate is above 99.999%.'
				],
				q: 'What do you do next?',
				options: [
					'Roll back the changes from the previous week as well',
					'Escalate the network degradation to AWS, the cloud provider',
					'Restart the whole web tier to clear bad connections',
					'Post on the status page that Slack is fully down'
				],
				answer: 1,
				why: 'Rolling back the day\'s changes did not help, and the degradation was in the network, which AWS runs for Slack. Slack "escalated to AWS, our main cloud provider". AWS engineers later found the trigger in Slack\'s AWS networking.'
			},
			{
				situation: [
					'At 7:00am PST, the usual mini-peak at the top of the hour hits. With the packet loss, calls from the web tier to its backends slow down, the web tier saturates, and Slack goes down.',
					'Autoscaling removes web instances and replaces ones marked unhealthy. Several responders were logged into those instances over SSH, and their sessions end abruptly.'
				],
				q: 'What do you do with autoscaling?',
				options: [
					'Leave it alone, it reacts faster than people can',
					'Turn off all autoscaling, both up and down',
					'Scale the web tier down further to spare the backends',
					'Disable downscaling, and keep scale-up running'
				],
				answer: 3,
				why: 'Downscaling cut serving capacity and the instances the responders were working on. Slack "disabled the downscaling to facilitate investigation and to preserve our serving capacity." Scale-up still mattered, because the saturated web tier was short of capacity.'
			},
			{
				situation: [
					'Between 7:01 and 7:15am PST, autoscaling tries to add 1,200 servers. provision-service, working over the same slow network, hits the Linux open files limit and an AWS quota limit.',
					'Most new instances are never fully provisioned and serve nothing. The broken instances fill the web tier up to its autoscaling group size limits.'
				],
				q: 'What do you fix first?',
				options: [
					'Raise the autoscaling group size limits to fit more instances',
					'Repair provision-service and clear out the broken instances',
					'Ask for another 1,200 servers once the quota resets',
					'Lower the open files limit so instances fail faster'
				],
				answer: 1,
				why: 'Raising the size limits would only add more instances that provision-service could not finish. Slack repaired provision-service while "some responders cleared these broken instances up". Healthy instances entered service once provision-service was back, around 8:15am PST.'
			},
			{
				situation: [
					'By 10:40am PST the network is normal again. Slack\'s dashboard and alerting services had failed because they ran in a different VPC from their backend databases, so they depended on the same AWS network path that failed.'
				],
				q: 'How do you protect the dashboards next time?',
				options: [
					'Run the dashboard service in the same VPC as its database',
					'Add a second dashboard service in yet another VPC',
					'Cache the dashboards in the browser for 24 hours',
					'Move the dashboards behind the same load balancer as Slack'
				],
				answer: 0,
				why: 'Each extra VPC crossing adds a dependency on the network between them. Slack writes: "Running the dashboard service instances in the same VPC as their database will remove this dependency."'
			}
		],
		outcome: [
			'AWS found the trigger: one of Slack\'s AWS Transit Gateways was overloaded and dropping packets. Slack goes "from our quietest time of the whole year to one of our biggest days quite literally overnight", and client caches are cold after the holidays. The TGWs "did not scale fast enough."',
			'Slack was unavailable from the 7:00am PST mini-peak. By 9:15am it was degraded but serving, helped by the load balancers\' "panic mode", retries and circuit breaking. AWS engineers raised the TGW capacity by hand, and by 10:40am PST the network, error rates and latency were back to normal.',
			'AWS is reviewing the TGW scaling algorithms "for large packet-per-second increases". Slack set itself a reminder to ask for a preemptive TGW upscaling at the end of the next holiday season.',
			'Slack also listed its own fixes: move the dashboard service into the same VPC as its database, load test provision-service regularly, and review the health check and autoscaling settings so they do not overload provision-service again.'
		]
	},
	quiz: [
		{
			q: 'Before 7:00am, autoscaling first removed web servers while the network got worse. Why?',
			options: [
				'Traffic was low after the holidays, so fewer servers were needed',
				'Threads spent more time waiting on the network, so CPU use dropped',
				'The health checks marked every web server as idle',
				'A scheduled job always scales down at the start of the hour'
			],
			answer: 1,
			why: 'Slack scales the web tier on CPU and on busy Apache worker threads. Threads blocked on slow backend calls use little CPU, so the CPU signal asked for fewer servers while the thread signal soon asked for more.'
		},
		{
			q: 'Why did Slack lose its dashboards during a network outage it was trying to debug?',
			options: [
				'The dashboard servers ran out of disk space',
				'The dashboards used Slack messages to fetch their data',
				'They reached their databases in another VPC, across the TGWs',
				'The monitoring team had turned them off for maintenance'
			],
			answer: 2,
			why: 'Traffic between two VPCs passes through a Transit Gateway. The overloaded TGW cut the dashboards off from their databases, at the moment the responders needed them most.'
		},
		{
			q: 'Why did the Transit Gateway overload on 4 January and not on an ordinary Monday?',
			options: [
				'AWS ran maintenance on the TGWs that morning',
				'A Slack deploy that day doubled the size of every message',
				'Traffic jumped overnight from the year\'s low, with cold client caches',
				'Slack had moved all its services into one VPC over the holidays'
			],
			answer: 2,
			why: 'Traffic was low over the holidays, and on the first Monday back clients pulled more data than usual on their first connection. The TGWs scale by themselves, but not as fast as that jump.'
		}
	],
	recall: {
		q: 'Which AWS component was dropping Slack\'s packets on 4 January 2021, and how was it fixed?',
		a: 'One of Slack\'s AWS Transit Gateways was overloaded. AWS engineers raised its capacity by hand, and the network was normal by 10:40am PST.'
	},
	sources: [
		{ title: 'Slack Engineering: Slack’s Outage on January 4th 2021', url: PM },
		{ title: 'AWS: What is AWS Transit Gateway for Amazon VPC?', url: 'https://docs.aws.amazon.com/vpc/latest/tgw/what-is-transit-gateway.html' }
	]
};
