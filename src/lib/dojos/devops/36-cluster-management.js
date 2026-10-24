const K8S = 'https://github.com/kubernetes/website/blob/2f85f2802e59eb2128543dbfbf114ad641db4be0';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'cluster-management',
	part: 'Running in production',
	title: 'Cluster management: upgrade without an outage',
	minutes: 10,
	hook: [
		'You know the patch night. You put a server in maintenance, move its traffic away, run the updates, reboot, and bring it back. You do one machine at a time, so the service stays up.',
		'A Kubernetes cluster needs the same steps, several times a year: the project only maintains the **three most recent minor releases**.',
		'Kubernetes has the maintenance steps built in. You cordon a node and drain it, and a PodDisruptionBudget stops the drain from taking down too many copies of an app at once.'
	],
	terms: [
		{ term: 'Drain', def: 'Mark a node unschedulable (cordon), so no new pods land on it, then evict its pods so they restart elsewhere. `kubectl drain` waits for each pod to stop gracefully.' },
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
				note: 'You upgrade the **control plane first, the nodes after**. A kubelet must never be newer than the API server. It may be up to three minor versions older, so old nodes keep working during the upgrade.'
			},
			{
				add: [
					'subgraph newp["New node pool, new version"]',
					'n3["node-3"]',
					'end',
					'cp --> n3'
				],
				highlight: ['n3'],
				note: 'On managed clusters a common method is to create a **new node pool** at the new version, move the pods over, and delete the old pool. A node pool is a group of identical nodes that you upgrade or resize as one unit. You replace the nodes instead of patching them in place.'
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
				note: 'The HPA changes the number of pods. When those pods cannot fit, they stay **pending**, and the cluster autoscaler adds a node to a pool. It also removes nodes that are underused, and it drains them first.'
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
			'These nine lines protect a three-node ZooKeeper quorum. The `selector` finds the pods by **label**, the same way a Service does.',
			'`minAvailable: 2` with three replicas means **one pod at a time** may be evicted. The [drain docs](https://kubernetes.io/docs/tasks/administer-cluster/safely-drain-node/) use this exact case: you run several drains in parallel and Kubernetes still keeps two pods up.',
			'The same file exists with [`maxUnavailable: 1`](https://github.com/kubernetes/website/blob/2f85f2802e59eb2128543dbfbf114ad641db4be0/content/en/examples/policy/zookeeper-pod-disruption-budget-maxunavailable.yaml#L1-L9) instead. You pick one of the two fields per PDB.',
			'A PDB only guards **voluntary** disruptions that go through the Eviction API. A node that loses power, or someone running `kubectl delete pod`, bypasses it.'
		]
	},
	tradeoff: {
		gain: [
			'You upgrade with the same steps each time: cordon, drain, replace, one node at a time, while apps stay up.',
			'App owners write a PDB once, so the cluster team can drain nodes without asking each team first.',
			'The HPA and the cluster autoscaler follow load: more pods at noon, fewer nodes at night.'
		],
		cost: [
			'A strict PDB (say `minAvailable` equal to the replica count) blocks the drain forever. Someone has to notice and fix it.',
			'A cluster that falls behind the three supported minor releases gets no more security patches, so you upgrade a few times a year.',
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
		],
		steps: [
			{
				title: 'Plan the version path',
				questions: [
					{ q: 'Can you go from 1.30 straight to 1.32?', options: ['Yes, if every node is drained first', 'Yes, on a managed cluster', 'No: the API server must not skip a minor version', 'No: you must reinstall the cluster'], answer: 2, why: 'You go one minor version at a time: 1.30 to 1.31, then 1.31 to 1.32.' },
					{ q: 'How many upgrade rounds does that make?', options: ['One', 'Two', 'Three', 'One per node'], answer: 1, why: 'Two minor versions, one round each.' },
					{ q: 'What do you read before each round?', options: ['The changelog, for removed APIs', 'The HPA metrics', 'The node pool bill', 'The PDB of every app'], answer: 0, why: 'A round can remove APIs your manifests still use. Find them before the upgrade, not after.' },
					{ q: 'Why upgrade a few times a year at all?', options: ['New versions are faster', 'Nodes stop booting after a year', 'The HPA needs the newest version', 'Only the three most recent minor releases get patches'], answer: 3, why: 'A cluster that falls behind the three supported minor releases gets no more security patches.' }
				]
			},
			{
				title: 'Order control plane and nodes',
				questions: [
					{ q: 'In each round, what goes first?', options: ['The nodes', 'The control plane', 'The apps', 'Whatever has the most pods'], answer: 1, why: 'Control plane first, nodes after.' },
					{ q: 'Why that order?', options: ['A kubelet must never be newer than the API server', 'The scheduler only runs on new nodes', 'Nodes upgrade themselves after the control plane', 'etcd refuses old kubelets'], answer: 0, why: 'Kubelets may be older than the API server, never newer.' },
					{ q: 'The control plane is on 1.31 and nodes are on 1.30. Is that safe?', options: ['No: all versions must match', 'Only for one hour', 'Yes: a kubelet may be up to three minor versions older', 'Only if no pod restarts until the nodes reach 1.31 as well'], answer: 2, why: 'Old nodes keep working during the upgrade, which is what lets you move one node at a time.' },
					{ q: 'Which state would be unsupported?', options: ['Control plane 1.31, nodes 1.30', 'Control plane 1.31, nodes 1.32', 'Control plane 1.32, nodes 1.31', 'Control plane 1.32, nodes 1.32'], answer: 1, why: 'Nodes newer than the API server break the rule. Upgrading nodes first would land you there.' }
				]
			},
			{
				title: 'Protect the apps',
				questions: [
					{ q: 'Which PDB fits the 3-replica payment API?', options: ['`minAvailable: 3`', '`minAvailable: 0`', '`maxUnavailable: 3`', '`minAvailable: 2`'], answer: 3, why: 'Two must stay up, so a drain moves only one of its pods at a time.' },
					{ q: 'Two drains run in parallel, each node holds one payment pod. What happens?', options: ['One pod is evicted, the other waits for a healthy replacement', 'Both pods go at once', 'Both drains fail at once with an error about the PDB, and you retry', 'The PDB is ignored during upgrades'], answer: 0, why: 'The Eviction API refuses an eviction that would break the PDB, and drain retries until it can go on.' },
					{ q: 'Why not put `minAvailable: 1` on the 1-replica batch worker?', options: ['PDBs only work on Deployments with 3 pods', 'It would block the drain forever', 'It would delete the worker', 'It would double the replicas'], answer: 1, why: 'Zero disruptions are ever allowed, so the drain can never evict that pod.' },
					{ q: 'What are your real options for the batch worker?', options: ['Add a PDB with `maxUnavailable: 0`', 'Skip draining its node', 'Accept a short outage while it moves, or run two replicas', 'Delete it during the upgrade'], answer: 2, why: 'One replica means downtime when it moves. Either accept that, or give it a second copy.' }
				]
			},
			{
				title: 'Replace the nodes',
				questions: [
					{ q: 'On a managed cluster, how do you move nodes to the new version?', options: ['Patch each node in place over SSH', 'Add a new pool at the new version, move the pods, delete the old pool', 'Reinstall the kubelet on every node at once', 'Wait for the cluster autoscaler to replace the old nodes with new ones over time'], answer: 1, why: 'You replace nodes instead of patching them. A node pool is upgraded or resized as one unit.' },
					{ q: 'Which command empties an old node?', options: ['`kubectl delete node`', '`kubectl cordon` alone', '`kubectl uncordon`', '`kubectl drain --ignore-daemonsets`'], answer: 3, why: 'Drain cordons the node, then evicts its pods through the Eviction API, which honours the PDBs.' },
					{ q: 'Why `--ignore-daemonsets`?', options: ['DaemonSet pods run on every node, so evicting them would not move them', 'It skips the PDB checks for system pods, so the drain never gets stuck on them', 'It makes the drain faster by deleting pods', 'DaemonSets block upgrades'], answer: 0, why: 'A DaemonSet keeps one pod per node. Drain leaves them, and they go away with the node.' },
					{ q: 'After draining an old node, what do you do before deleting the old pool?', options: ['Remove all PDBs', 'Uncordon the old node', 'Check the apps run on the new nodes', 'Restart the control plane'], answer: 2, why: 'Check the apps after each drain. Only then delete the old pool.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'What does `kubectl drain` do to a node before it evicts any pods?',
			options: [
				'It reboots the node so the pods restart cleanly elsewhere',
				'It marks the node unschedulable (cordon), so no new pods land on it',
				'It deletes the node from the cluster so the scheduler forgets it',
				'It upgrades the kubelet on the node to match the control plane'
			],
			answer: 1,
			why: 'Drain first cordons the node, then evicts its pods. When you are done, `kubectl uncordon` makes the node schedulable again.'
		},
		{
			q: 'An app has 3 replicas and a PDB with `minAvailable: 2`. You drain two nodes in parallel, each holding one of its pods. What happens?',
			options: [
				'Both pods are evicted at once and the app runs on one pod for a while',
				'Both drains fail immediately with an error about the PDB',
				'One pod is evicted. The other eviction waits until a replacement pod is healthy',
				'The PDB is ignored during a drain, so both pods go at once'
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
	lab: {
		minutes: 15,
		goal: 'Drain a node and watch two PodDisruptionBudgets at work: one that lets a pod move, one that blocks the drain for good.',
		steps: [
			'Start a one-node local cluster with `minikube start`. Run a 3-replica payment API and a 1-replica worker: `kubectl create deployment pay --image=nginx:1.27 --replicas=3` and `kubectl create deployment batch --image=nginx:1.27`.',
			'Add a PDB to each: `kubectl create pdb pay --selector=app=pay --min-available=2` and `kubectl create pdb batch --selector=app=batch --min-available=1`. Then `kubectl get pdb`.',
			'Drain the node, limited to these two apps so the system pods stay: `kubectl drain $(kubectl get nodes -o name | head -n 1) --ignore-daemonsets --pod-selector="app in (pay,batch)" --timeout=40s`.',
			'Look at what happened: `kubectl get pods -l "app in (pay,batch)"`, `kubectl get pdb` and `kubectl get nodes`.',
			'Bring the node back: `kubectl uncordon $(kubectl get nodes -o name | head -n 1)`, then `kubectl get pods -l "app in (pay,batch)"`. Clean up with `kubectl delete pdb pay batch && kubectl delete deployment pay batch`.'
		],
		done: [
			'Before the drain, `kubectl get pdb` shows ALLOWED DISRUPTIONS `1` for `pay` and `0` for `batch`.',
			'The drain prints `Cannot evict pod as it would violate the pod\'s disruption budget.`, retries, and stops at the timeout.',
			'During the drain, one `pay` pod is `Pending`, the node shows `Ready,SchedulingDisabled`, and the `batch` pod never moved.',
			'After `uncordon`, all four pods are `Running`.'
		],
		solution: [
			'`pay` has 3 replicas and `minAvailable: 2`, so one eviction is allowed. Its replacement stays `Pending` because the only node is cordoned, and the PDB then refuses the next eviction.',
			'`batch` has 1 replica and `minAvailable: 1`: zero disruptions are ever allowed, so the drain can never evict it. On a real cluster, accept the short outage or run two replicas.',
			'On a multi-node cluster the replacement would start on another node, and the drain would go on one pod at a time.'
		]
	},
	recall: {
		q: 'In which order do you upgrade a cluster, and what stops a drain from evicting too many pods of one app?',
		a: 'The control plane first, then the nodes, one minor version per round. A PodDisruptionBudget: with 3 replicas and `minAvailable: 2`, the Eviction API lets only one pod go at a time.'
	},
	sources: [
		{ title: 'Kubernetes docs, Safely drain a node', url: 'https://kubernetes.io/docs/tasks/administer-cluster/safely-drain-node/' },
		{ title: 'Kubernetes docs, Disruptions', url: 'https://kubernetes.io/docs/concepts/workloads/pods/disruptions/' },
		{ title: 'Kubernetes docs, Version skew policy', url: 'https://kubernetes.io/releases/version-skew-policy/' },
		{ title: 'Kubernetes docs, Horizontal Pod Autoscaling', url: 'https://kubernetes.io/docs/concepts/workloads/autoscaling/horizontal-pod-autoscale/' },
		{ title: 'Kubernetes docs, Node autoscaling', url: 'https://kubernetes.io/docs/concepts/cluster-administration/node-autoscaling/' }
	]
};
