const PM = 'https://community.monzo.com/t/resolved-current-account-payments-may-fail-major-outage-27-10-2017/26296/95';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'monzo-2017',
	part: 'Capacity and cascades',
	title: 'Monzo 2017: linkerd, Kubernetes and a payments outage',
	minutes: 10,
	hook: [
		'Friday 27 October 2017, 14:10, at the bank Monzo. Its backend is several hundred microservices in Docker containers, run by Kubernetes on AWS nodes.',
		'Every call between two services goes through linkerd. Linkerd turns a name like `service.foo` into an IP address and port, using what Kubernetes tells it about where each service runs.',
		'An engineer deploys a small change to a service that current account payments need. Every request to that service starts to fail, and customers’ payments fail with it.'
	],
	terms: [
		{ term: 'linkerd', def: 'A proxy on each node that routes and load balances calls between services. It learns service addresses from the Kubernetes apiserver.' },
		{ term: 'apiserver', def: 'The Kubernetes process that every other component asks for the cluster’s state. It reads and writes that state in etcd.' },
		{ term: 'etcd', def: 'The distributed database where Kubernetes stores what is deployed and where. A write needs a majority of its nodes (a quorum).' },
		{ term: 'endpoints', def: 'The list of pod IP addresses behind a Kubernetes Service. A Service scaled to 0 replicas has an empty list.' }
	],
	incident: {
		org: 'Monzo',
		title: 'RESOLVED: Current account payments may fail - Major Outage (27/10/2017)',
		date: '2017-10-27',
		url: PM,
		steps: [
			{
				situation: [
					'14:10. The change went out through the usual release process. From that moment, all requests to the service fail and current account payments fail.',
					'The prepaid card does not use this service and still works. Monzo keeps interface changes backwards and forwards compatible, so a rollback is a safe operation.'
				],
				q: 'What do you do first?',
				options: [
					'Page the whole Platform team and start reading the linkerd logs on every node',
					'Roll back the change you just deployed, then watch the error rate',
					'Write a hotfix for the service and deploy it on top of the change',
					'Scale the service up to more replicas to absorb the failing requests'
				],
				answer: 1,
				why: 'The failures started with the deploy, and a rollback is safe by design here. The team rolled back at 14:12: "This is standard practice for deployments that don\'t go according to plan."'
			},
			{
				situation: [
					'14:12. The old version is running again. The errors persist and payments are still unavailable.',
					'Nobody has declared an incident yet. One engineer is working on what looked like a bad deploy.'
				],
				q: 'What do you do next?',
				options: [
					'Roll back again to the version from the day before, in case the old one was broken too',
					'Wait ten minutes, because the new pods may need time to warm up their caches',
					'Ask the engineer to redeploy the change with extra logging to see which call fails',
					'Declare an outage and gather people: the cause is outside the code you rolled back'
				],
				answer: 3,
				why: 'Code that worked before now fails too, so the fault sits in something the service depends on. The team declared an outage internally at 14:16, and people convened to establish the impact and debug.'
			},
			{
				situation: [
					'14:18. Engineers see linkerd in an unhealthy state. Linkerd never got the update from Kubernetes about where the new pods run, so it sends requests to IP addresses with no process behind them.',
					'There are several hundred linkerd instances, one per node. An internal tool can find single nodes with problems and restart them.'
				],
				q: 'How do you restart linkerd?',
				options: [
					'Restart a few linkerd instances, check they get fresh addresses, then do the rest',
					'Restart all several hundred instances at once, since they likely share the issue',
					'Leave linkerd alone and restart the payment service pods until linkerd notices them',
					'Stop linkerd on every node and let services call each other directly by IP'
				],
				answer: 0,
				why: 'Nobody knows yet why linkerd missed the update, and every restarted linkerd must load its routes again from Kubernetes. At 14:26 the team restarted all of them. The postmortem calls this "an unfortunate and poor decision that worsened the impact of the outage."'
			},
			{
				situation: [
					'14:26. While the restart runs, current account card payments and incoming bank transfers keep failing for customers.',
					'Monzo has internal processes designed to provide backup when its systems have problems.'
				],
				q: 'What do you do for customers right now?',
				options: [
					'Nothing until the platform is fixed, so engineers keep their focus on the outage',
					'Tell customers to use another bank\'s card until a full fix is deployed',
					'Activate the backup processes so most card payments can still succeed',
					'Freeze all current accounts so no payment fails halfway through'
				],
				answer: 2,
				why: 'The backup processes exist for this case, and other engineers can run them in parallel with the debugging. The team did: "most customers are still able to use their card successfully despite the ongoing instability."'
			},
			{
				situation: [
					'15:13. After the apiservers were restarted at 14:37, all linkerd pods are back, but no service receives traffic. The app shows no feed or balance, and the internal tools stop working.',
					'15:27. Linkerd logs a `NullPointerException` while parsing the service discovery response: this linkerd version fails to parse a Service with no endpoints. A newer linkerd with a fix has run in staging for weeks.',
					'One such Service exists: a team scaled a new service to 0 replicas the day before, and its Kubernetes Service is still there.'
				],
				q: 'What gets traffic flowing fastest?',
				options: [
					'Restart every linkerd instance again, now that the apiservers are healthy',
					'Delete the Service that has no endpoints, so linkerd can parse the response',
					'Roll out the newer linkerd from staging to all several hundred nodes',
					'Roll back the etcd cluster to the version that ran before the last upgrade'
				],
				answer: 1,
				why: 'Deleting one unused Service removes the input that crashes the parser, with no new rollout. The team started the linkerd rollout first, then at 15:31 deleted the Service: "linkerd is successfully able to load service discovery information."'
			}
		],
		outcome: [
			'Two weeks before, the Platform team upgraded etcd and grew it from three nodes to nine, three in each AWS zone. A bug in Kubernetes and the etcd client can make requests time out after that kind of reconfiguration.',
			'Because of those timeouts, linkerd never got the new addresses of the payment service and sent calls to IPs with no process behind them. Restarting every linkerd made each one load service discovery again, and they all failed on the Service with no endpoints.',
			'Current account payments failed from 14:10 to 15:31. From 15:13 to 15:31 no service on the platform could serve requests. The postmortem calls it "among the worst technical incidents that have happened in our history."',
			'The fixes listed: fix the Kubernetes timeout bug, roll out a linkerd version that parses empty Services, build better health checks, dashboards and alerts for these components, and communicate outages faster inside and outside the company.'
		]
	},
	quiz: [
		{
			q: 'Monzo rolled back the payment service at 14:12, yet requests kept failing. Why?',
			options: [
				'The rollback itself failed, so the broken version kept running on the nodes',
				'The old version had the same bug, since both shared the faulty code path',
				'The database rejected the old version because its schema had already changed',
				'Linkerd still sent calls to old pod IPs, since it had missed the Kubernetes update'
			],
			answer: 3,
			why: 'The rollback starts new pods at new addresses. Linkerd only learns those addresses from Kubernetes, and its updates were timing out, so every version of the service was unreachable.'
		},
		{
			q: 'Until 15:13, the outage hit current account payments. Why did restarting every linkerd stop all traffic?',
			options: [
				'Each new linkerd had to load service discovery and failed to parse the Service with no endpoints',
				'The restart deleted the Kubernetes Services, so no name could be resolved any more',
				'Hundreds of linkerds starting together used all CPU on the AWS nodes for an hour',
				'The restarted linkerds came up with an empty config file and refused all calls'
			],
			answer: 0,
			why: 'A fresh linkerd reads the full service list from the apiserver. The `NullPointerException` on the empty Service ([linkerd #1219](https://github.com/linkerd/linkerd/issues/1219)) hit every restarted instance, so one bad input reached the whole fleet at once.'
		},
		{
			q: 'Monzo\'s etcd ran 9 nodes, 3 in each of 3 zones. How many nodes can it lose and still accept writes?',
			options: [
				'2 nodes, because a cluster of 9 keeps a 7 node majority',
				'3 nodes, so exactly one zone and no more',
				'4 nodes, such as a whole zone plus one more node',
				'8 nodes, as long as one node is left to answer'
			],
			answer: 2,
			why: 'A quorum of 9 is 5. Losing a zone (3 nodes) and one more leaves 5, which is the "simultaneous loss of an entire zone and a single node in another zone" the postmortem describes.'
		}
	],
	recall: {
		q: 'What made the restarted linkerd instances fail at Monzo, and what fixed it at 15:31?',
		a: 'A Kubernetes Service scaled to 0 replicas, with no endpoints: linkerd threw a NullPointerException parsing it. Deleting that Service let traffic flow again.'
	},
	sources: [
		{ title: 'Monzo, RESOLVED: Current account payments may fail - Major Outage (27/10/2017), postmortem by the Head of Engineering', url: PM },
		{ title: 'linkerd issue #1219, NullPointerException on Kubernetes 1.6.1', url: 'https://github.com/linkerd/linkerd/issues/1219' },
		{ title: 'Kubernetes issue #47131, apiserver timeouts after rolling-update of etcd cluster', url: 'https://github.com/kubernetes/kubernetes/issues/47131' }
	]
};
