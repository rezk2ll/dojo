const K8S = 'https://github.com/kubernetes/website/blob/2f85f2802e59eb2128543dbfbf114ad641db4be0';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'cluster-management',
	part: 'Running in production',
	title: 'Cluster management: upgrade without an outage',
	minutes: 10,
	hook: [
		'You know the patch night. You put a server in maintenance, move its traffic away, run the updates, reboot, and bring it back. One machine at a time, so the service stays up.',
		'A Kubernetes cluster needs the same care, and it needs it often: the project only maintains the **three most recent minor releases**. So you will upgrade a few times a year.',
		'The good news: Kubernetes has the maintenance mode built in. You **cordon** a node, **drain** it, and a **PodDisruptionBudget** stops the drain from taking down too many copies of an app at once.'
	],
	terms: [
		{ term: 'Node pool', def: 'A group of identical nodes (same machine type, same version). Clouds call it a node pool or a node group. You upgrade or resize a pool as one unit.' },
		{ term: 'Cordon', def: 'Mark a node unschedulable: no new pods land on it. Pods already there keep running.' },
		{ term: 'Drain', def: 'Cordon the node, then evict its pods so they restart elsewhere. `kubectl drain` waits for each pod to stop gracefully.' },
		{ term: 'PodDisruptionBudget (PDB)', def: 'A rule for one app: how many of its pods must stay up (`minAvailable`) or may be down (`maxUnavailable`) during a voluntary disruption like a drain.' },
		{ term: 'HPA', def: 'HorizontalPodAutoscaler: adds or removes pods of a Deployment based on a metric, usually CPU use compared to the pods\' requests.' },
		{ term: 'Cluster autoscaler', def: 'Adds nodes when pods are pending because no node has room for them, and removes nodes that sit underused.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: [
					'cp["Control plane: upgraded first"]',
					'subgraph oldp["Old node pool"]',
					'n1["node-1"]',
					'n2["node-2"]',
					'end',
					'cp --> n1',
					'cp --> n2'
				],
				highlight: ['cp'],
				note: 'The order is fixed: **control plane first, nodes after**. A kubelet must never be newer than the API server. It may be up to three minor versions older, so old nodes keep working while you go.'
			},
			{
				add: [
					'subgraph newp["New node pool, new version"]',
					'n3["node-3"]',
					'end',
					'cp --> n3'
				],
				highlight: ['n3'],
				note: 'A common pattern on managed clusters: create a **new node pool** at the new version, move the pods over, delete the old pool. Rebuild, do not repair. Same idea as cattle, applied to nodes.'
			},
			{
				add: [
					'you["kubectl drain node-1"] -->|"1. cordon"| n1',
					'you -->|"2. evict pods"| pdb["PodDisruptionBudget check"]',
					'pdb -->|"allowed"| n3'
				],
				highlight: ['you', 'pdb'],
				note: '`kubectl drain` marks the node unschedulable, then asks the **Eviction API** to remove each pod. The API refuses an eviction that would break a PDB, and drain retries until it can go on.'
			},
			{
				add: [
					'hpa["HPA: more pods"]',
					'ca["Cluster autoscaler: more nodes"]',
					'hpa -.->|"pods pending, no room"| ca',
					'ca -.->|"adds a node"| newp'
				],
				highlight: ['hpa', 'ca'],
				note: 'Two autoscalers, two levels. The **HPA** changes the number of pods. When those pods cannot fit, they stay **pending**, and the **cluster autoscaler** adds a node to a pool. It also removes nodes that are underused, which is a drain too.'
			}
		]
	},
	example: {
		title: 'content/en/examples/policy/zookeeper-pod-disruption-budget-minavailable.yaml',
		repo: 'kubernetes/website',
		url: `${K8S}/content/en/examples/policy/zookeeper-pod-disruption-budget-minavailable.yaml#L1-L9`,
		lang: 'yaml',
		code: `apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: zk-pdb
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: zookeeper`,
		notes: [
			'Nine lines protect a three-node ZooKeeper quorum. The `selector` finds the pods by **label**, the same way a Service does.',
			'`minAvailable: 2` with three replicas means **one pod at a time** may be evicted. The [drain docs](https://kubernetes.io/docs/tasks/administer-cluster/safely-drain-node/) use this exact case: run several drains in parallel and Kubernetes still keeps two pods up.',
			'The same file exists with [`maxUnavailable: 1`](https://github.com/kubernetes/website/blob/2f85f2802e59eb2128543dbfbf114ad641db4be0/content/en/examples/policy/zookeeper-pod-disruption-budget-maxunavailable.yaml#L1-L9) instead. You pick one of the two fields per PDB.',
			'A PDB only guards **voluntary** disruptions that go through the Eviction API. A node that loses power, or someone running `kubectl delete pod`, bypasses it.'
		]
	},
	tradeoff: {
		gain: [
			'Upgrades become a routine: cordon, drain, replace, one node at a time, while apps stay up.',
			'PDBs let app owners say what they can survive, so the cluster team can drain nodes without asking each team first.',
			'Autoscaling follows real load: more pods at noon, fewer nodes at night, less money spent.'
		],
		cost: [
			'A strict PDB (say `minAvailable` equal to the replica count) blocks the drain forever. Someone has to notice and fix it.',
			'You must upgrade often. Fall behind the three supported minor releases and you lose security patches.',
			'The HPA needs a metrics source (usually metrics-server) and CPU requests on the pods. Without them it has nothing to compare against.'
		]
	},
	task: {
		prompt: 'Your cluster runs 1.30 on control plane and nodes. You must reach 1.32. A payment API runs 3 replicas, a batch worker runs 1 replica. Write the upgrade plan, in order.',
		hint: 'Can the API server jump two minor versions at once? What does a drain do to an app with only one replica, and what protects the three-replica one?',
		answer: [
			'Two rounds, **1.30 to 1.31, then 1.31 to 1.32**. The API server must not skip minor versions. Read the changelog for removed APIs before each round.',
			'Each round: control plane first, then nodes. Kubelets on 1.30 are fine while the control plane is on 1.31.',
			'Before the drains, add a PDB for the payment API (`minAvailable: 2`), so a drain moves only one of its pods at a time.',
			'The batch worker will be down while its pod moves. Accept that, or run two replicas. A PDB on a one-replica app with `minAvailable: 1` would just block the drain.',
			'Nodes: add a pool at the new version, `kubectl drain --ignore-daemonsets` each old node, check the apps, delete the old pool.'
		]
	},
	quiz: [
		{
			q: 'What does `kubectl drain` do to a node before it evicts any pods?',
			options: [
				'It reboots the node',
				'It marks the node unschedulable (cordon), so no new pods land on it',
				'It deletes the node from the cluster',
				'It upgrades the kubelet on the node'
			],
			answer: 1,
			why: 'Drain first cordons the node, then evicts its pods. When you are done, `kubectl uncordon` makes the node schedulable again.'
		},
		{
			q: 'An app has 3 replicas and a PDB with `minAvailable: 2`. You drain two nodes in parallel, each holding one of its pods. What happens?',
			options: [
				'Both pods are evicted at once and the app runs on one pod',
				'Both drains fail immediately with an error',
				'One pod is evicted. The other eviction waits until a replacement pod is healthy',
				'The PDB is ignored during a drain'
			],
			answer: 2,
			why: 'Only replicas minus minAvailable (here 1) may be unavailable at a time. The Eviction API refuses the second eviction until the app is back to three healthy pods.'
		},
		{
			q: 'The HPA asks for 10 pods, but 4 stay `Pending` because no node has room. Which component fixes that?',
			options: [
				'The HPA, by lowering CPU requests',
				'The Deployment controller, by recreating the pending pods',
				'The cluster autoscaler, by adding a node to a node pool',
				'The kubelet, by creating more memory'
			],
			answer: 2,
			why: 'The HPA only changes the pod count. The cluster autoscaler watches for pods that cannot be scheduled and adds nodes so they fit.'
		}
	],
	takeaway: 'Upgrade the control plane first, then replace nodes one at a time with cordon and drain. A PodDisruptionBudget is how an app tells the drain how much it can lose.',
	sources: [
		{ title: 'Kubernetes docs, Safely drain a node', url: 'https://kubernetes.io/docs/tasks/administer-cluster/safely-drain-node/' },
		{ title: 'Kubernetes docs, Disruptions', url: 'https://kubernetes.io/docs/concepts/workloads/pods/disruptions/' },
		{ title: 'Kubernetes docs, Version skew policy', url: 'https://kubernetes.io/releases/version-skew-policy/' },
		{ title: 'Kubernetes docs, Horizontal Pod Autoscaling', url: 'https://kubernetes.io/docs/concepts/workloads/autoscaling/horizontal-pod-autoscale/' },
		{ title: 'Kubernetes docs, Node autoscaling', url: 'https://kubernetes.io/docs/concepts/cluster-administration/node-autoscaling/' }
	]
};
