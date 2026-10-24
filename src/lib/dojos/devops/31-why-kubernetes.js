const SAMPLE = 'https://github.com/kubernetes/sample-controller/blob/c99d43fac02d529e9b7421265d90162fcde92cf5';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'why-kubernetes',
	part: 'Kubernetes',
	title: 'Why Kubernetes: controllers and desired state',
	minutes: 10,
	hook: [
		'You have a cron job that runs every minute: `systemctl is-active nginx || systemctl restart nginx`. It checks whether nginx runs, and restarts it if it does not.',
		'Now you have 30 machines and 40 apps. Which app runs where? Who moves it when a disk dies at 3 a.m.? Your cron job only knows its own machine.',
		'Kubernetes runs the same kind of check for a whole cluster. You write down what you want, for example three copies of this image reachable on port 80. Kubernetes compares that with what runs on **every machine**, and fixes any difference it finds.'
	],
	terms: [
		{ term: 'Desired state', def: 'What you asked for, written in an object\'s `spec`. For example: three replicas of this image.' },
		{ term: 'Current state', def: 'What is really running, reported in the object\'s `status`.' },
		{ term: 'Controller', def: 'A control loop that watches one kind of object and acts to bring the current state closer to the desired state.' },
		{ term: 'Node', def: 'A worker machine. Its kubelet makes sure the Pods assigned to it are running.' }
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
				note: 'You never ssh into a machine. `kubectl` reads its settings from `~/.kube/config` and sends your desired state to the **API server**, which stores it in etcd, a key value store. The control plane is the API server, etcd, the scheduler and the controller manager. At this point no container runs on any node.'
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
				note: 'On each node, the kubelet asks the API server which Pods belong to it, then has the container runtime start them. It reports back what is really running: the **current state**.'
			},
			{
				add: [],
				highlight: ['cm', 'k1', 'k2'],
				note: 'Node 2 dies. After [about 50 seconds](https://kubernetes.io/docs/reference/command-line-tools-reference/kube-controller-manager/) without news, the control plane marks it unreachable. By default its Pods then stay bound to it for 5 more minutes, in case it comes back. Then they are evicted: current state two, desired state three. The controller creates a new Pod, the scheduler places it on node 1, and nobody was paged.'
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
			'The Kubernetes project publishes this example controller. It watches a made-up object called `Foo` and keeps a Deployment in line with it. You do not need to write Go: read one block at a time. Lines starting with `//` are comments.',
			'Line 2 reads the Deployment from a local copy (a cache) of what the API server holds. `deployment, err := ...` keeps two results: the Deployment, and an error if something went wrong.',
			'Lines 4 to 6 run when `errors.IsNotFound(err)` is true, that is when no such Deployment exists. `...Create(ctx, newDeployment(foo), ...)` then asks the API server to create it, and `newDeployment(foo)` builds it from `Foo.spec` (you can skip `ctx` and the options). The cut `…` lines stop on errors and check that the Deployment belongs to this `Foo`.',
			'Lines 11 to 14 update the Deployment. `!=` means "not equal", `&&` means "and", `nil` means "not set", and a `*` in front of a name reads the value it points to. So if `Foo` sets a replica count that differs from the Deployment\'s, line 13 sends an `Update` with the wanted Deployment. Line 12, `logger.V(4).Info`, only writes a debug log line.',
			'Line 18, `updateFooStatus`, writes what the controller saw into the `status` of `Foo`. Your cron job did the same three things: look, fix the difference, report.',
			'It does not run on a timer alone. It [registers handlers](https://github.com/kubernetes/sample-controller/blob/c99d43fac02d529e9b7421265d90162fcde92cf5/controller.go#L128-L153), so a change to a `Foo`, or to a Deployment, wakes it up right away.',
			'The built-in controllers for Deployments and ReplicaSets work the same way. Kubernetes runs many of these loops, one for each kind of object.'
		]
	},
	tradeoff: {
		gain: [
			'A controller replaces a dead container, or the Pods of a dead node, without anyone running a command.',
			'You deploy every app on every machine through one API, and the scheduler picks the server.',
			'Your desired state is a YAML file, so it lives in Git and goes through review like any other change.'
		],
		cost: [
			'Many moving parts: API server, etcd, scheduler, controllers, kubelets. Each one can break, and you must learn to debug them.',
			'For one app on two servers, a systemd unit and an Ansible playbook may be enough, with no cluster to run.',
			'A change you make by hand on a node is undone by the next pass of the loop.'
		]
	},
	task: {
		prompt: 'Your colleague fixes a broken app by running `kubectl delete pod web-7d4b9c-x2k8p`. Ten seconds later, `kubectl get pods` shows a Pod called `web-7d4b9c-q9m3z`. He thinks the delete failed. Explain, step by step, which parts of the cluster did what.',
		hint: 'A controller created that Pod. What does that controller compare?',
		answer: [
			'The delete worked. The Pod was owned by a ReplicaSet, which wants (for example) 3 replicas.',
			'The ReplicaSet controller saw current state 2, desired state 3, and asked the API server to create a new Pod, with a new random name.',
			'The scheduler picked a node for it, and the kubelet on that node started the containers.',
			'To really remove the app, change the desired state: scale it to 0 or delete the Deployment that owns the ReplicaSet.'
		],
		steps: [
			{
				title: 'Read what happened',
				questions: [
					{ q: 'After `kubectl delete pod web-7d4b9c-x2k8p`, did the delete work?', options: ['No: the API server refused it', 'Yes: the old Pod is gone, a new one replaced it', 'No: the Pod only restarted under a new name', 'Only on the node where the Pod ran'], answer: 1, why: 'The new Pod has a different name, `q9m3z`. The old Pod was removed, and something created a new one.' },
					{ q: 'Why does the new Pod have a new random name?', options: ['kubelet renames a Pod each time it restarts', 'etcd adds a suffix when it saves an object again', 'The scheduler gives each Pod a name for its node', 'It is a brand new Pod, created from the same template'], answer: 3, why: 'The controller asked for a new Pod. It is a new object, so it gets a new random suffix.' },
					{ q: 'What does the name `web-7d4b9c-...` tell you about who owns the Pod?', options: ['A ReplicaSet named `web-7d4b9c`', 'A node named `web-7d4b9c`', 'Nothing: Pod names are fully random', 'A Service named `web`'], answer: 0, why: 'The Pod belongs to a ReplicaSet, and its name starts with that ReplicaSet\'s name.' },
					{ q: 'Which field holds what the owner wants, such as 3 replicas?', options: ['The object\'s `status`', 'The node\'s kubelet config', 'The object\'s `spec`', 'The file `~/.kube/config`'], answer: 2, why: 'The desired state lives in `spec`. What really runs is reported in `status`.' }
				]
			},
			{
				title: 'Find the loop that acted',
				questions: [
					{ q: 'Which component noticed that a Pod was missing?', options: ['The kube-scheduler', 'The ReplicaSet controller, in the controller manager', 'The kubelet on the old node', 'etcd'], answer: 1, why: 'A controller watches its kind of object and compares desired with current state. Here it saw 2 running for 3 wanted.' },
					{ q: 'What did that controller compare?', options: ['CPU use on each node', 'Desired state 3 with current state 2', 'The image tag with the latest one in the registry', 'The Pod name with the Deployment name'], answer: 1, why: 'A controller is a loop: compare desired and current state, then act on the difference.' },
					{ q: 'How did the controller create the new Pod?', options: ['It started a container on a node by itself', 'It wrote the Pod straight into etcd', 'It sent a request to the API server', 'It asked kubectl to apply the file again'], answer: 2, why: 'Controllers talk to the API server, which stores the object in etcd. They do not start containers.' },
					{ q: 'Why did this take seconds, not a full timer cycle?', options: ['Controllers watch the API server, so a change wakes them up', 'The controller polls every second', 'kubectl told the controller about the delete', 'The scheduler restarts the controller after each delete'], answer: 0, why: 'Controllers register handlers on the objects they watch. A deleted Pod wakes the loop right away.' }
				]
			},
			{
				title: 'Follow the new Pod to a node',
				questions: [
					{ q: 'The new Pod exists in the API but has no node yet. Who picks one?', options: ['The ReplicaSet controller', 'The kube-scheduler', 'The kubelet with the most free memory', 'The API server, at random'], answer: 1, why: 'The scheduler looks for Pods with no node and binds each one to a node. It does not start anything.' },
					{ q: 'What does the scheduler write?', options: ['A new container image', 'A new replica count', 'The Pod\'s logs', '"This Pod goes on node 2"'], answer: 3, why: 'It only records the binding. Starting the containers is another component\'s job.' },
					{ q: 'Who starts the containers on that node?', options: ['The scheduler, over SSH', 'The controller manager', 'The kubelet, through the container runtime', 'etcd'], answer: 2, why: 'Each node\'s kubelet asks the API server which Pods are its own, then has the runtime start them.' },
					{ q: 'How does the cluster learn that the new Pod really runs?', options: ['The kubelet reports it back as current state', 'The scheduler checks the node every minute', 'kubectl asks the container runtime directly', 'The controller pings the Pod on port 80'], answer: 0, why: 'The kubelet reports what really runs. That is the current state the controller compares next time.' }
				]
			},
			{
				title: 'Remove the app for real',
				questions: [
					{ q: 'Your colleague wants the app gone. What does he change?', options: ['He deletes the Pods faster than they come back', 'The desired state: scale to 0, or delete the Deployment', 'He stops the kubelet on every node', 'He edits the Pod\'s `status` to say stopped'], answer: 1, why: 'The loop keeps fixing any difference from the desired state. Change the desired state, and the loop removes the Pods for you.' },
					{ q: 'Why delete the Deployment and not only the ReplicaSet?', options: ['The Deployment owns the ReplicaSet and would recreate it', 'A ReplicaSet cannot be deleted', 'Deleting a ReplicaSet also deletes the node', 'The ReplicaSet has no Pods'], answer: 0, why: 'The same rule one level up: the Deployment\'s controller would bring its ReplicaSet back.' },
					{ q: 'He ssh-es into the node and stops the container with the runtime. What happens next?', options: ['The app stays down until someone restarts it', 'The scheduler moves the app to the control plane', 'The kubelet sees the Pod is not running and starts it again', 'The Deployment is deleted for him'], answer: 2, why: 'A change made by hand on a node is undone by the next pass of the loop.' },
					{ q: 'Which command changes the desired state to zero copies?', options: ['`kubectl delete pod web-7d4b9c-q9m3z`', '`kubectl get pods`', '`kubectl describe node`', '`kubectl scale deployment web --replicas=0`'], answer: 3, why: '`scale` edits the replica count in the Deployment\'s `spec`. The controllers then remove the Pods.' }
				]
			}
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
	lab: {
		minutes: 15,
		goal: 'Delete a Pod, watch a controller bring it back, then change the desired state so it stays gone.',
		steps: [
			'Start a local cluster: `minikube start` (it runs in Docker). Check it with `kubectl get nodes`.',
			'Ask for three copies of nginx: `kubectl create deployment web --image=nginx:1.27 --replicas=3`, then `kubectl rollout status deployment web` and `kubectl get pods -l app=web`. Note the three names.',
			'Delete one Pod: `kubectl delete $(kubectl get pods -l app=web -o name | head -n 1)`, then run `kubectl get pods -l app=web` right away.',
			'Find who did it: `kubectl get rs -l app=web` and `kubectl get events --field-selector reason=SuccessfulCreate`.',
			'Change the desired state: `kubectl scale deployment web --replicas=0`, then `kubectl get pods -l app=web`. Clean up with `kubectl delete deployment web`.'
		],
		done: [
			'After the delete, `kubectl get pods -l app=web` shows three Pods again, one with a new name and a younger AGE.',
			'The events list a `SuccessfulCreate` from `replicaset/web-...` for the new Pod.',
			'After the scale, `kubectl get pods -l app=web` prints `No resources found`, and `kubectl get deploy web` shows `0/0`.'
		],
		solution: [
			'The new Pod is not a restart: it is a new object, created by the ReplicaSet controller because current state (2) differed from desired state (3).',
			'`kubectl get pod <name> -o jsonpath=\'{.metadata.ownerReferences[0].name}\'` prints the owning ReplicaSet, `web-` plus a hash.',
			'Deleting Pods never wins against the loop. `kubectl scale` edits the Deployment\'s `spec`, and the controllers remove the Pods for you.'
		]
	},
	recall: {
		q: 'You delete one Pod of a ReplicaSet that wants 3 replicas. Which components act, in which order?',
		a: 'The ReplicaSet controller sees current state 2 and desired state 3, and asks the API server for a new Pod. The scheduler binds it to a node, and that node\'s kubelet starts it.'
	},
	sources: [
		{ title: 'Kubernetes docs, Taints and Tolerations (default 300 second eviction)', url: 'https://kubernetes.io/docs/concepts/scheduling-eviction/taint-and-toleration/' },
		{ title: 'Kubernetes docs, Controllers', url: 'https://kubernetes.io/docs/concepts/architecture/controller/' },
		{ title: 'Kubernetes docs, Kubernetes Components', url: 'https://kubernetes.io/docs/concepts/overview/components/' },
		{ title: 'Kubernetes docs, Objects in Kubernetes (spec and status)', url: 'https://kubernetes.io/docs/concepts/overview/working-with-objects/' },
		{ title: 'Kubernetes docs, Command line tool (kubectl)', url: 'https://kubernetes.io/docs/reference/kubectl/' },
		{ title: 'kubernetes/sample-controller, controller.go', url: `${SAMPLE}/controller.go` }
	]
};
