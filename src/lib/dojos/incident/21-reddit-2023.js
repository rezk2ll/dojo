const PM = 'https://www.reddit.com/r/RedditEng/comments/11xx5o0/you_broke_reddit_the_piday_outage/';
const K8S_124 = 'https://github.com/kubernetes/kubernetes/blob/53fa80f55b15df3612f84b4ca8add27af9361379/CHANGELOG/CHANGELOG-1.24.md#L2484';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'reddit-2023',
	part: 'Networks and DNS',
	title: 'Reddit 2023: the Kubernetes upgrade that removed a node label',
	minutes: 10,
	hook: [
		'Tuesday 14 March 2023, just after 19:00 UTC. You are on Reddit’s Compute team. An engineer starts upgrading one Kubernetes cluster from version 1.23 to 1.24.',
		'The cluster runs the legacy part of Reddit’s stack, the code behind Old Reddit. The team built it years ago with the `kubeadm` tool. Upgrades run first on dedicated test clusters, then on production clusters from lowest criticality to highest.',
		'About 2 minutes after the upgrade starts, requests at the CDN edge stop succeeding. Users get an error page with Reddit’s mascot, or a homepage with no posts.'
	],
	terms: [
		{ term: 'Control plane', def: 'The nodes that run the Kubernetes API server and its etcd database. This cluster has three.' },
		{ term: 'Node label', def: 'A key and value on a Kubernetes node, such as `node-role.kubernetes.io/master`. Other resources pick nodes by matching their labels.' },
		{ term: 'Admission webhook', def: 'An HTTP call the API server makes to another service before it accepts a write. If that service does not answer, the write times out.' },
		{ term: 'Route reflector', def: 'A Calico node that exchanges pod routes (over BGP) with every other node, so the other nodes only need to talk to the reflectors.' }
	],
	incident: {
		org: 'Reddit',
		title: 'You Broke Reddit: The Pi-Day Outage',
		date: '2023-03-14',
		url: PM,
		steps: [
			{
				situation: [
					'The incident is open and responders are on the call by T+3 minutes. The CDN edge graph of requests by status code shows that the site has stopped.',
					'The upgraded cluster has lost all of its metrics. Its dashboards are empty, so you cannot see which Pods or nodes are failing.'
				],
				q: 'Where do you look first?',
				options: [
					'Wait for the cluster’s metrics to come back before you change anything',
					'Use the edge graphs and the logs, which do not run on the broken cluster',
					'Start a second upgrade on a test cluster to reproduce the problem',
					'Restart the metrics stack inside the cluster and wait for dashboards'
				],
				answer: 1,
				why: 'The edge stats were "intentionally separated" from the cluster, and the logging agent kept working because Reddit’s logs are "very low-level". The postmortem: "Our metrics are entirely k8s native", so they died with the cluster.'
			},
			{
				situation: [
					'Inside the cluster, DNS lookups fail for Consul records (Reddit’s cross environment DNS) and for in-cluster records. Public DNS records resolve fine. No earlier upgrade or test showed this.',
					'For a failed deployment, Reddit’s first plan is to revert. But Kubernetes runs schema and data migrations during an upgrade and has no supported downgrade. Going back means restoring the control plane from the backup taken before the upgrade.',
					'That restore procedure is several years old. It was tested on pilot clusters but never run on a production cluster. The first estimates are hours of guaranteed downtime.'
				],
				q: 'What do you do?',
				options: [
					'Start the restore now and stop all debugging',
					'Keep debugging, and send a small group to prepare the restore',
					'Run `kubeadm upgrade apply` again with version 1.23',
					'Keep debugging and plan to look at the restore tomorrow'
				],
				answer: 1,
				why: 'The team first chose to "attempt to fix forward". About 60 minutes in, with leads but no fix, they "picked a subset of the Compute team to fork off to another call and prepare all the steps to restore from backup". Rerunning the upgrade with 1.23 is not a downgrade path.'
			},
			{
				situation: [
					'Pods take a very long time to start and stop. Pulling an image under 100 MB takes minutes on a multi gigabit link. The Calico Pods, which run pod networking, are unhealthy.',
					'You deleted the `calico-typha` Pods and no new ones were created. A rolling restart of the control plane changed nothing. Turning the whole control plane off and on changed nothing.',
					'Now the API server logs show timeouts on writes. The timeouts happen when the API server calls admission webhooks. The only webhook that watches all resources is Open Policy Agent (OPA), and OPA is down.'
				],
				q: 'What do you do about the timeouts?',
				options: [
					'Raise the API server’s webhook timeout to 5 minutes',
					'Delete OPA’s webhook configurations so writes stop calling it',
					'Add two more control plane nodes to absorb the load',
					'Restart the API server again and watch the logs'
				],
				answer: 1,
				why: 'With OPA down, every write waits on a call that cannot succeed. The team deleted its webhook configurations. The postmortem: "The timeouts disappeared instantly… But the cluster didn’t recover." The webhook was a second problem, not the cause.'
			},
			{
				situation: [
					'After more than two hours, the team restores from the backup. They terminate every worker node first (about 20 minutes of API calls), then restore the backup onto the first control plane node.',
					'The first node comes up and nodes start joining as the autoscaler restarts, so networking works again. The team turns the autoscaler off until the cluster has three control plane nodes.',
					'Two new control plane nodes launch, but they never join. They hang with no error, unable to connect to etcd on the first node. The backup script runs on any control plane node. The restore must run on the node the backup came from. Nodes keep AWS default hostnames like `ip-10-1-0-42.ec2.internal`.'
				],
				q: 'What do you check?',
				options: [
					'The etcd TLS certificate on the first node and its hostname',
					'The AWS quota for the control plane instance type in this region',
					'The Calico route tables and BGP sessions on the two new nodes',
					'The CRI-O version on the two new nodes'
				],
				answer: 0,
				why: 'The backup came from a different node than the one restored. The postmortem: "the TLS certificates being presented by the working node weren’t valid for anything else to talk to it, because of the hostname mismatch." The team generated new certificates and the nodes joined.'
			},
			{
				situation: [
					'The control plane has three nodes again. Reddit’s web tier sits behind many caches, and services that sat idle during the outage have scaled down to save resources.',
					'Some fragile legacy services were stopped by hand before traffic returns.'
				],
				q: 'How do you bring users back?',
				options: [
					'Open 100% of traffic at once so the caches fill fast',
					'Open 50% now and the other 50% after 10 minutes',
					'Start at about 1% and raise it in small steps to 100%',
					'Wait until the autoscaler has added every node before any traffic'
				],
				answer: 2,
				why: 'A sudden 100% can cause a "thundering herd": cold caches send every request to downstream services that have scaled down. The team started "at about 1%", then went to 5%, 10%, 20%, 35%, 55%, 80% and 100%.'
			}
		],
		outcome: [
			'The outage lasted 314 minutes. Reddit’s newer API layers stayed up, but this cluster held "the most critical legacy node in our dependency graph", so most user flows failed.',
			'The cause was found after the restore. Calico’s logs showed that 2 seconds before the failure, `calico-node` on every node began dropping routes to all nodes, not only to the control plane node being upgraded.',
			'Large Reddit clusters use Calico route reflectors instead of a full mesh, and the control plane nodes were the reflectors. The BGPPeer selectors chose them with the label `node-role.kubernetes.io/master`. During an upgrade to 1.24, `kubeadm upgrade apply` removes that label from control plane nodes. No node matched those selectors any more, so the peerings with the reflectors disappeared and every route was dropped.',
			'The route reflector config was "committed nowhere", and everyone who set it up had left the team. One engineer remembered the feature during the postmortem. Reddit’s fixes: codify cluster config, document what cannot be codified, add pre-production clusters, build tooling to manage whole clusters, and make cluster upgrades safe.'
		]
	},
	quiz: [
		{
			q: 'Why did removing one label from three control plane nodes break pod networking on every node?',
			options: [
				'The label also set each node’s IP address, so the nodes lost their addresses',
				'kube-proxy uses the label to pick which node runs each Service',
				'The BGPPeer selectors matched no node, so no node had a peer to get routes from',
				'Calico restarts every agent when any node label changes'
			],
			answer: 2,
			why: 'With route reflectors, nodes do not peer with each other. They peer with the nodes a BGPPeer selector picks, and the selector used the removed label. With no match, the peerings ended and `calico-node` dropped its routes.'
		},
		{
			q: 'Why could Reddit not simply roll the cluster back to 1.23?',
			options: [
				'AWS does not allow older Kubernetes versions on its instances',
				'Kubernetes migrates stored data during an upgrade, with no way back',
				'The 1.23 container images had been deleted from the registry',
				'The upgrade had already updated every worker node to 1.24'
			],
			answer: 1,
			why: 'The postmortem: "Because a number of schema and data migrations are performed automatically by Kubernetes during an upgrade, there’s no reverse path defined." A downgrade meant restoring etcd from the backup.'
		},
		{
			q: 'The 1.24 changelog announced the label removal. What check before the upgrade would have caught it on Reddit’s cluster?',
			options: [
				'Read the Calico release notes for the version in use',
				'Run the upgrade first on a small test cluster that uses a full mesh',
				'Search every resource in the live cluster for `node-role.kubernetes.io/master`',
				'Check that all three control plane nodes report Ready before starting'
			],
			answer: 2,
			why: 'The BGPPeer lived only in the cluster, edited with Calico’s CLI and stored in no repo. A search of the live resources finds every selector on the removed label. The postmortem says only the largest and most legacy clusters still used route reflectors.'
		}
	],
	recall: {
		q: 'Which node label did Reddit’s Calico route reflector config select, and what removed it?',
		a: '`node-role.kubernetes.io/master`. Running `kubeadm upgrade apply` to Kubernetes 1.24 removes it from control plane nodes, so the BGPPeer matched no reflectors.'
	},
	sources: [
		{ title: 'Reddit Engineering: You Broke Reddit: The Pi-Day Outage', url: PM },
		{ title: 'Kubernetes CHANGELOG-1.24: kubeadm removes the master label', url: K8S_124 },
		{ title: 'Calico docs: Configure BGP peering (full mesh and route reflectors)', url: 'https://docs.tigera.io/calico/latest/networking/configuring/bgp' }
	]
};
