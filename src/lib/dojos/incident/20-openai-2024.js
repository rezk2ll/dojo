const PM = 'https://status.openai.com/incidents/ctrsv3lwd797';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'openai-2024',
	part: 'Networks and DNS',
	title: 'OpenAI 2024: a telemetry service that overloaded the Kubernetes control planes',
	minutes: 10,
	hook: [
		'Wednesday 11 December 2024. OpenAI runs hundreds of Kubernetes clusters around the world. Since 2:51 PM PST, the deployment pipeline has been applying one change to all of them.',
		'At 3:13 PM alerts fire and engineers are notified. At 3:16 PM, ChatGPT, the API and Sora start to degrade.'
	],
	terms: [
		{ term: 'Control plane', def: 'The part of a Kubernetes cluster that manages its state. OpenAI uses it for cluster administration.' },
		{ term: 'Data plane', def: 'The nodes that run the workloads, such as model inference. They can keep running for a while without the control plane.' },
		{ term: 'Kubernetes API server', def: 'The control plane component that exposes the Kubernetes HTTP API. Removing a service from a cluster goes through it.' },
		{ term: 'Service discovery', def: 'How one service finds the address of another. At OpenAI it goes through Kubernetes DNS, which Kubernetes programs from the API server.' }
	],
	incident: {
		org: 'OpenAI',
		title: 'API, ChatGPT & Sora Facing Issues',
		date: '2024-12-11',
		url: PM,
		steps: [
			{
				situation: [
					'The change deploys a new telemetry service that collects detailed Kubernetes control plane metrics. It was deployed at 3:12 PM.',
					'It ran in a staging cluster the day before with no issues. Before the rollout, the team checked CPU and memory use in every cluster.'
				],
				q: 'What do you do first?',
				options: [
					'Watch for 30 minutes, since staging showed no issues',
					'Add nodes to the clusters that are alerting',
					'Remove the new telemetry service from the clusters',
					'Restart the DNS pods in every cluster'
				],
				answer: 2,
				why: 'The alerts started one minute after the service landed, so it is the first suspect. OpenAI identified it as the root cause at 3:16 PM. The fix "required us to remove the offending service", which turned out to be the hard part.'
			},
			{
				situation: [
					'You try to remove the service, and the Kubernetes API servers do not answer. Every node in each cluster is running expensive Kubernetes API operations whose cost grows with cluster size.',
					'Thousands of nodes run them at once, and the control plane is down in most large clusters. To remove the service you need that control plane.'
				],
				q: 'How do you get control back?',
				options: [
					'Retry `kubectl delete` until one request gets through',
					'Wait for the API servers to finish their queued requests',
					'Cut the API load and add API server capacity, in parallel',
					'Rebuild every cluster from scratch in another region'
				],
				answer: 2,
				why: 'Each retry adds to the load that keeps the API servers down. OpenAI ran three workstreams in parallel: scaling down cluster size, "blocking network access to Kubernetes admin APIs", and scaling up the API servers. That "eventually restored enough control to remove the offending service."'
			},
			{
				situation: [
					'DNS caches on the nodes hide the damage for a while. As cached records expire over about 20 minutes, services can no longer find each other and start failing.',
					'Some clusters are still healthy. Regaining control of the others will take time.'
				],
				q: 'What do you do with user traffic meanwhile?',
				options: [
					'Move traffic away from the broken clusters to healthy ones',
					'Keep it where it is, so the healthy clusters are not overloaded',
					'Return errors to all users until every cluster is back',
					'Raise the DNS cache time on every node'
				],
				answer: 0,
				why: 'Healthy clusters could serve requests while the broken ones were repaired. At 3:27 PM "engineers began moving traffic away from impacted clusters". Maximum customer impact came at 3:40 PM, and the first cluster recovered at 4:36 PM.'
			},
			{
				situation: [
					'All clusters are back at 7:38 PM. The impact appeared only in clusters above a certain size, so the staging cluster never showed it.',
					'The rollout watched service health only. No one assessed the load on the Kubernetes API servers, and the DNS caches let the rollout reach every cluster before services failed.'
				],
				q: 'How do you roll out the next infrastructure change?',
				options: [
					'Test longer in the same staging cluster before going out',
					'Roll out in phases, watching control plane health as well',
					'Deploy to all clusters at night when traffic is lowest',
					'Keep the rollout, and add a second reviewer to the merge'
				],
				answer: 1,
				why: 'Phases limit a bad change to the first clusters, and control plane monitoring sees the overload without waiting for DNS caches to expire. OpenAI writes that infrastructure changes will follow "a robust phased rollout process", with monitoring that both the workloads and "the clusters (including the Kubernetes control plane) are healthy."'
			},
			{
				situation: [
					'OpenAI\'s tools did detect the bad deployment a few minutes before customers saw impact. The team still could not roll it back, because the overloaded API servers locked them out.'
				],
				q: 'What do you build so engineers can act next time?',
				options: [
					'A dashboard of API server load for every cluster',
					'More API server replicas in every cluster, all the time',
					'Break-glass access to the API servers that works under any load',
					'An alert that pages the whole team when a rollout starts'
				],
				answer: 2,
				why: 'The tools spotted the bad deployment, but no engineer could reach the API servers to remove it. OpenAI writes: "We do not yet have a mechanism to ensure access to the API server when the data plane is putting too much pressure on the control plane." It will build "break-glass mechanisms to ensure that engineers can access Kubernetes API servers in any circumstances."'
			}
		],
		outcome: [
			'The root cause was "a new telemetry service configuration that unexpectedly generated massive Kubernetes API load across large clusters". The load took down the control plane, and DNS-based service discovery broke with it.',
			'From 3:16 PM to 7:38 PM PST, all OpenAI services were badly degraded or unavailable. ChatGPT substantially recovered at 5:45 PM and fully at 7:01 PM, and the API fully recovered at 7:38 PM.',
			'Recovery was slow because engineers were locked out of the control plane they needed. Once they got back in, some clusters stayed degraded because many services downloaded resources at the same time and hit resource limits.',
			'OpenAI listed five measures: phased rollouts that watch the control plane, fault injection tests where the data plane runs without the control plane, break-glass access to the API servers, decoupling the data plane from the control plane, and faster cluster startup with caching and dynamic rate limiters.'
		]
	},
	quiz: [
		{
			q: 'The workloads run on the data plane. Why did they fail when only the control plane was overloaded?',
			options: [
				'The model inference pods ran on the control plane nodes',
				'Services find each other through DNS, and DNS needs the API server',
				'The telemetry service used all the CPU on every node',
				'Kubernetes stops all pods when the API server is down'
			],
			answer: 1,
			why: 'Kubernetes programs DNS records from what the API server publishes about Pods and Services. With the API servers down, DNS resolution failed, and services broke once their cached records expired.'
		},
		{
			q: 'Why did the rollout reach every cluster before services started failing?',
			options: [
				'The pipeline ignored the alerts that fired at 3:13 PM',
				'The staging cluster was larger than the production clusters',
				'DNS caches kept stale records working for about 20 minutes',
				'The change was applied to every cluster in the same second'
			],
			answer: 2,
			why: 'Each node kept serving cached DNS records while the control plane was already down. The failures showed up as the records expired, by which time the change had been applied to all clusters, between 2:51 and 3:20 PM.'
		},
		{
			q: 'The team knew the cause at 3:16 PM. Why did the first cluster take until 4:36 PM to recover?',
			options: [
				'Removing the service needed the API servers it had overloaded',
				'The root cause had to be confirmed by a second team',
				'The deployment pipeline had no rollback button',
				'The telemetry service restarted itself after each removal'
			],
			answer: 0,
			why: 'Removing a Kubernetes service is a call to the API server, and those servers were overloaded by requests from thousands of nodes. The team first had to cut that load and add capacity before the removal could go through.'
		}
	],
	recall: {
		q: 'What overloaded OpenAI\'s Kubernetes API servers on 11 December 2024?',
		a: 'A new telemetry service whose configuration made every node in each cluster run expensive Kubernetes API operations, with a cost that grew with cluster size.'
	},
	sources: [
		{ title: 'OpenAI Status: API, ChatGPT & Sora Facing Issues (write-up)', url: PM },
		{ title: 'Kubernetes docs: Kubernetes Components', url: 'https://kubernetes.io/docs/concepts/overview/components/' },
		{ title: 'Kubernetes docs: DNS for Services and Pods', url: 'https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/' }
	]
};
