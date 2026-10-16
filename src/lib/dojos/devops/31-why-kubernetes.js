const SAMPLE = 'https://github.com/kubernetes/sample-controller/blob/c99d43fac02d529e9b7421265d90162fcde92cf5';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'why-kubernetes',
	part: 'Kubernetes',
	title: 'Why Kubernetes: you describe, it keeps it true',
	minutes: 10,
	hook: [
		'You have a cron job that runs every minute: `systemctl is-active nginx || systemctl restart nginx`. It is ugly, and it works. It looks at what is, compares it to what should be, and fixes the gap.',
		'Now you have 30 machines and 40 apps. Which app runs where? Who moves it when a disk dies at 3 a.m.? Your cron job only knows its own machine.',
		'Kubernetes is that cron job for a whole cluster. You write down **what you want** (three copies of this image, reachable on port 80). Kubernetes keeps **comparing and fixing**, forever, on every machine at once.'
	],
	terms: [
		{ term: 'Desired state', def: 'What you asked for, written in an object\'s `spec`. For example: three replicas of this image.' },
		{ term: 'Current state', def: 'What is really running, reported in the object\'s `status`.' },
		{ term: 'Controller', def: 'A control loop that watches one kind of object and acts to bring the current state closer to the desired state.' },
		{ term: 'Control plane', def: 'The brain of the cluster: the API server, etcd, the scheduler and the controller manager.' },
		{ term: 'Node', def: 'A worker machine. Its kubelet makes sure the Pods assigned to it are running.' },
		{ term: 'kubectl', def: 'The command line tool that talks to the API server. It reads its settings from `~/.kube/config`.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: [
					'you["You: kubectl apply -f app.yaml"]',
					'subgraph cp["Control plane"]',
					'api["kube-apiserver"]',
					'etcd[("etcd")]',
					'end',
					'you --> api',
					'api --> etcd'
				],
				highlight: ['api', 'etcd'],
				note: 'You never ssh into a machine. You send your **desired state** to the **API server**, and it stores it in etcd, a key value store. Nothing runs yet. It is only written down.'
			},
			{
				add: [
					'cm["kube-controller-manager"]',
					'cm <-->|"watch and update"| api'
				],
				highlight: ['cm'],
				note: 'The controller manager runs the built-in **controllers**. Each one watches the API server, sees "three replicas wanted, zero exist", and asks the API server to create the missing Pods.'
			},
			{
				add: [
					'sch["kube-scheduler"]',
					'sch <-->|"bind Pod to node"| api'
				],
				highlight: ['sch'],
				note: 'The **scheduler** looks for Pods with no node yet, and picks a node for each one. It does not start anything. It only writes "this Pod goes on node 2".'
			},
			{
				add: [
					'subgraph wk["Worker nodes"]',
					'k1["node 1: kubelet + runtime"]',
					'k2["node 2: kubelet + runtime"]',
					'end',
					'k1 <-->|"my Pods?"| api',
					'k2 <-->|"my Pods?"| api'
				],
				highlight: ['k1', 'k2'],
				note: 'On each **node**, the kubelet asks the API server which Pods belong to it, then has the container runtime start them. It reports back what is really running: the **current state**.'
			},
			{
				add: [],
				highlight: ['cm', 'k1', 'k2'],
				note: 'Node 2 dies. After [about 50 seconds](https://kubernetes.io/docs/reference/command-line-tools-reference/kube-controller-manager/) without news, the control plane marks it unreachable. By default its Pods then stay bound to it for [5 more minutes](https://kubernetes.io/docs/concepts/scheduling-eviction/taint-and-toleration/), in case it comes back. Then they are evicted: current state two, desired state three. The controller creates a new Pod, and the scheduler places it on node 1. **Nobody was paged.**'
			}
		]
	},
	example: {
		title: 'sample-controller/controller.go',
		repo: 'kubernetes/sample-controller',
		url: `${SAMPLE}/controller.go#L266-L305`,
		lang: 'go',
		code: `	// Get the deployment with the name specified in Foo.spec
	deployment, err := c.deploymentsLister.Deployments(foo.Namespace).Get(deploymentName)
	// If the resource doesn't exist, we'll create it
	if errors.IsNotFound(err) {
		deployment, err = c.kubeclientset.AppsV1().Deployments(foo.Namespace).Create(ctx, newDeployment(foo), metav1.CreateOptions{FieldManager: FieldManager})
	}
…
	// If this number of the replicas on the Foo resource is specified, and the
	// number does not equal the current desired replicas on the Deployment, we
	// should update the Deployment resource.
	if foo.Spec.Replicas != nil && *foo.Spec.Replicas != *deployment.Spec.Replicas {
		logger.V(4).Info("Update deployment resource", "currentReplicas", *deployment.Spec.Replicas, "desiredReplicas", *foo.Spec.Replicas)
		deployment, err = c.kubeclientset.AppsV1().Deployments(foo.Namespace).Update(ctx, newDeployment(foo), metav1.UpdateOptions{FieldManager: FieldManager})
	}
…
	// Finally, we update the status block of the Foo resource to reflect the
	// current state of the world
	err = c.updateFooStatus(ctx, foo, deployment)`,
		notes: [
			'This is the official example controller from the Kubernetes project. It watches a made-up object called `Foo` and keeps a Deployment in line with it. You do not need to write Go: read it as a recipe, one block at a time. Lines starting with `//` are comments.',
			'**Get.** `deploymentsLister...Get(deploymentName)` reads the Deployment from a local copy (a cache) of what the API server holds. `deployment, err := ...` keeps two results: the Deployment, and an error if something went wrong.',
			'**Create if missing.** `errors.IsNotFound(err)` is true when no such Deployment exists. Then `...Create(ctx, newDeployment(foo), ...)` asks the API server to create it, and `newDeployment(foo)` builds the wanted Deployment from what `Foo.spec` says. You can skip `ctx` and the options at the end. The `…` lines are cut: they stop on errors and check that the Deployment belongs to this `Foo`.',
			'**Update if different.** `!=` means "not equal", `&&` means "and", `nil` means "not set", and a `*` in front of a name reads the value it points to. So: if `Foo` sets a replica count, and it differs from the Deployment\'s, send an `Update` with the wanted Deployment. `logger.V(4).Info` only writes a debug log line.',
			'**Report.** `updateFooStatus` writes what it saw into the `status` of `Foo`. The same three moves as your cron job: look, fix the gap, report.',
			'It does not run on a timer alone. It [registers handlers](https://github.com/kubernetes/sample-controller/blob/c99d43fac02d529e9b7421265d90162fcde92cf5/controller.go#L128-L153), so a change to a `Foo`, or to a Deployment, wakes it up right away.',
			'The built-in controllers that run Deployments and ReplicaSets follow the same pattern. Kubernetes is **many small loops**, each owning one kind of object.'
		]
	},
	tradeoff: {
		gain: [
			'Self-healing: a dead container or a dead node is fixed by a loop, not by you.',
			'One API for every app on every machine. You stop caring which server runs what.',
			'Your desired state is a YAML file, so it lives in Git and goes through review like any other change.'
		],
		cost: [
			'Many moving parts: API server, etcd, scheduler, controllers, kubelets. Each one can break, and you must learn to debug them.',
			'It is overkill for one app on two servers. A systemd unit and an Ansible playbook may be enough.',
			'You give up direct control. A change you make by hand on a node is undone by the next loop.'
		]
	},
	task: {
		prompt: 'Your colleague fixes a broken app by running `kubectl delete pod web-7d4b9c-x2k8p`. Ten seconds later, `kubectl get pods` shows a Pod called `web-7d4b9c-q9m3z`. He thinks the delete failed. Explain, step by step, which parts of the cluster did what.',
		hint: 'The Pod was created by a controller, not by him. What does that controller compare?',
		answer: [
			'The delete worked. The Pod was owned by a ReplicaSet, which wants (for example) 3 replicas.',
			'The ReplicaSet controller saw current state 2, desired state 3, and asked the API server to create a new Pod, with a new random name.',
			'The scheduler picked a node for it, and the kubelet on that node started the containers.',
			'To really remove the app, change the desired state: scale it to 0 or delete the Deployment that owns the ReplicaSet.'
		]
	},
	quiz: [
		{
			q: 'In Kubernetes, what does a controller do?',
			options: [
				'It runs the containers of each Pod directly on the node it manages',
				'It watches objects and acts to move the current state toward the desired state',
				'It stores the cluster data on disk so the state survives restarts',
				'It picks which node a new Pod runs on, based on free resources'
			],
			answer: 1,
			why: 'A controller is a control loop: compare desired and current state, then act. Running containers is the kubelet\'s job, storing data is etcd\'s, and choosing nodes is the scheduler\'s.'
		},
		{
			q: 'Which component chooses the node for a Pod that has none yet?',
			options: ['kubelet', 'kube-controller-manager', 'kube-scheduler', 'etcd'],
			answer: 2,
			why: 'The scheduler looks for Pods not yet bound to a node and assigns each one to a suitable node. The kubelet on that node then starts it.'
		},
		{
			q: 'Where does `kubectl` look for its cluster settings by default?',
			options: ['`/etc/kubernetes/kubectl.conf`', 'A file named `config` in `$HOME/.kube`', 'The `KUBECTL_HOME` environment variable', 'It asks the scheduler'],
			answer: 1,
			why: 'kubectl reads `$HOME/.kube/config`. You can point it elsewhere with the `KUBECONFIG` variable or the `--kubeconfig` flag.'
		}
	],
	takeaway: 'You stop giving orders and start describing outcomes. Controllers compare what you asked for with what runs, and fix the gap, all the time.',
	sources: [
		{ title: 'Kubernetes docs, Controllers', url: 'https://kubernetes.io/docs/concepts/architecture/controller/' },
		{ title: 'Kubernetes docs, Kubernetes Components', url: 'https://kubernetes.io/docs/concepts/overview/components/' },
		{ title: 'Kubernetes docs, Objects in Kubernetes (spec and status)', url: 'https://kubernetes.io/docs/concepts/overview/working-with-objects/' },
		{ title: 'Kubernetes docs, Command line tool (kubectl)', url: 'https://kubernetes.io/docs/reference/kubectl/' },
		{ title: 'kubernetes/sample-controller, controller.go', url: `${SAMPLE}/controller.go` }
	]
};
