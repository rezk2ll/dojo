const EXAMPLES = 'https://github.com/kubernetes/examples/blob/d6b8cd27eacb51e651a1aa6f7c190a28713eff6e';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'pods-deployments-services',
	part: 'Kubernetes',
	title: 'Pods, Deployments and Services',
	minutes: 10,
	hook: [
		'On your old servers, the web app lived at `10.0.3.17`. You wrote that IP in the load balancer config, and it stayed true for years.',
		'In Kubernetes, the thing that runs your app is a **Pod**, and Pods are disposable. They die, get replaced, and come back with a new name and a new IP. A Pod IP written in a config file breaks the next time that Pod is replaced.',
		'So Kubernetes splits the job in two. A Deployment keeps the right number of Pods alive. A Service gives them one stable name, and finds them by **label**, like `app: guestbook`, never by IP.'
	],
	terms: [
		{ term: 'Pod', def: 'The smallest thing Kubernetes runs: one or more containers that share a network and storage, always placed on the same node.' },
		{ term: 'Deployment', def: 'Manages ReplicaSets for you, and rolls out a new version by creating a new ReplicaSet and scaling the old one down.' },
		{ term: 'Service', def: 'A stable name and virtual IP in front of a changing set of Pods. Default type is `ClusterIP`, reachable only inside the cluster.' },
		{ term: 'Label and selector', def: 'A label is a key and value on an object, like `app: guestbook`. A selector is a query on labels, like "every Pod with `app: guestbook` and `tier: frontend`".' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: [
					'p1["Pod frontend-a"]',
					'p2["Pod frontend-b"]',
					'p3["Pod frontend-c"]'
				],
				highlight: ['p1', 'p2', 'p3'],
				note: 'Three **Pods**, each with the labels `app: guestbook` and `tier: frontend`. Each gets its own IP. When a Pod dies, its IP goes with it, and the replacement Pod gets a new one.'
			},
			{
				add: [
					'rs["ReplicaSet frontend-5f4d, replicas 3"]',
					'rs --> p1',
					'rs --> p2',
					'rs --> p3'
				],
				highlight: ['rs'],
				note: 'A **ReplicaSet** keeps a set number of identical Pods running: it counts the Pods that match its selector. Fewer than 3? It creates one. More? It deletes one, like the controller loop of the previous chapter.'
			},
			{
				add: [
					'dep["Deployment frontend"]',
					'dep --> rs'
				],
				highlight: ['dep'],
				note: 'You write the Deployment. It creates the ReplicaSet from its Pod template. Change the image, and it creates a **second ReplicaSet** for the new version, then shifts Pods over. By default, at most 25% of the Pods are unavailable at any moment.'
			},
			{
				add: [
					'svc["Service frontend, selector app=guestbook, tier=frontend"]',
					'svc -.-> p1',
					'svc -.-> p2',
					'svc -.-> p3'
				],
				highlight: ['svc'],
				note: 'The **Service** does not know the Deployment exists. It only has a selector. Kubernetes keeps a list of the IPs of matching Pods, marks which ones are ready, and updates it as Pods come and go. Traffic only goes to the ready ones.'
			},
			{
				add: [
					'cli["Other Pod: curl http://frontend"]',
					'cli --> svc',
					'class cli ext'
				],
				highlight: ['cli'],
				note: 'Clients use the Service\'s **name**, resolved by the cluster DNS. When Pods are replaced, the name `frontend` stays the same, and only the list of IPs behind it changes.'
			}
		]
	},
	example: {
		title: 'web/guestbook/frontend-deployment.yaml',
		repo: 'kubernetes/examples',
		url: `${EXAMPLES}/web/guestbook/frontend-deployment.yaml#L1-L19`,
		lang: 'yaml',
		code: `apiVersion: apps/v1 #  for k8s versions before 1.9.0 use apps/v1beta2  and before 1.8.0 use extensions/v1beta1
kind: Deployment
metadata:
  name: frontend
spec:
  selector:
    matchLabels:
      app: guestbook
      tier: frontend
  replicas: 3
  template:
    metadata:
      labels:
        app: guestbook
        tier: frontend
    spec:
      containers:
      - name: php-redis
        image: gcr.io/google-samples/gb-frontend:v5`,
		notes: [
			'The guestbook is the classic Kubernetes demo. Lines 6 to 9 (`spec.selector`) and lines 13 to 15 (`spec.template.metadata.labels`) carry the **same two labels**. They must match, or the API server rejects the Deployment.',
			'Lines 11 to 19, under `template`, are a Pod written inline. Line 10 asks the Deployment for 3 copies of it. You never write the Pods yourself.',
			'The [frontend Service](https://github.com/kubernetes/examples/blob/d6b8cd27eacb51e651a1aa6f7c190a28713eff6e/web/guestbook/frontend-service.yaml#L14-L18) selects `app: guestbook` and `tier: frontend` too. That shared pair of labels is the only link between the two files.',
			'A selector with two labels means **both**. The [Redis Deployment](https://github.com/kubernetes/examples/blob/d6b8cd27eacb51e651a1aa6f7c190a28713eff6e/web/guestbook/redis-master-deployment.yaml#L6-L17) of the same app uses `app: redis` and `tier: backend`, so its Pods can never land behind the frontend Service.'
		]
	},
	tradeoff: {
		gain: [
			'Pods can die and be replaced without anyone updating an IP anywhere.',
			'Rolling out a new image is one change to the Deployment, and the old ReplicaSet is kept so you can go back with `kubectl rollout undo`.',
			'One Service can select Pods from two Deployments, which is how canary releases are built.'
		],
		cost: [
			'A typo in a selector raises no error. The Service simply gets no Pods behind it.',
			'A Deployment\'s selector cannot be changed after creation. To change it, you delete the Deployment and create it again.',
			'When traffic does not arrive, you check three objects (Deployment, Pods, Service) and the labels between them.'
		]
	},
	task: {
		prompt: 'Your `shop` Service returns "connection refused" for everyone. `kubectl get pods -l app=shop` shows 3 Pods `Running`. `kubectl get endpointslices -l kubernetes.io/service-name=shop` shows **no endpoints**. What do you check, in order?',
		hint: 'The Service finds Pods only through its selector, and only uses Pods that are ready.',
		answer: [
			'Compare the Service selector (`kubectl get svc shop -o yaml`) with the Pod labels (`kubectl get pods --show-labels`). A typo like `app: shop` vs `app: shopp`, or an extra key in the selector, gives zero matches.',
			'A Pod that is not ready still shows in the EndpointSlice, marked `ready: false`, so readiness does not explain zero endpoints. Once the selector matches, check the READY column of `kubectl get pods`: a Pod can be Running and still not **Ready**. The Service sends no traffic to a Pod that is not ready.',
			'Last, check the Service `targetPort` matches the port the container really listens on.'
		],
		steps: [
			{
				title: 'Read the symptom',
				questions: [
					{ q: 'Three Pods are `Running`, yet the Service has no endpoints. Where is the break?', options: ['Inside the containers', 'In the cluster DNS', 'On the node\'s disk', 'Between the Service and the Pods'], answer: 3, why: 'The Pods run, so the break is in the link that ties the Service to them.' },
					{ q: '`kubectl get pods -l app=shop` lists 3 Pods. Why does that not prove the Service selects them?', options: ['The Service selector may use another value, or add a key the Pods lack', 'kubectl hides Pods that are not ready', 'Pods listed with `-l` always run on another node', 'It does prove it, so the break must be in DNS'], answer: 0, why: 'Your `-l app=shop` is your own query. The Service runs its own selector, and only that one decides its endpoints.' },
					{ q: 'Traffic does not arrive. Which objects, and what between them, do you have to check?', options: ['The node, the kubelet and etcd', 'The Ingress, the DNS and the firewall', 'The Deployment, the Pods and the Service, and the labels between them', 'The ConfigMap, the Secret and the volume'], answer: 2, why: 'The Deployment makes the Pods, the Service finds them by label. A wrong label anywhere in that chain leaves the Service empty.' },
					{ q: 'Could readiness alone explain **zero** endpoints here?', options: ['Yes: Pods that are not ready are dropped from the list', 'Yes: Running Pods are never ready at first', 'No: only the port can cause it', 'No: a Pod that is not ready still shows, marked `ready: false`'], answer: 3, why: 'An unready Pod stays in the EndpointSlice with `ready: false`. Zero endpoints points to the selector.' }
				]
			},
			{
				title: 'Compare selector and labels',
				questions: [
					{ q: 'Which command shows the Service selector?', options: ['`kubectl get svc shop -o yaml`', '`kubectl logs svc/shop`', '`kubectl get nodes`', '`kubectl rollout status shop`'], answer: 0, why: 'The full YAML of the Service shows its `spec.selector`.' },
					{ q: 'Which command shows the labels on the Pods?', options: ['`kubectl describe svc shop`', '`kubectl get pods --show-labels`', '`kubectl get endpointslices`', '`kubectl top pods`'], answer: 1, why: '`--show-labels` adds a column with every label on each Pod.' },
					{ q: 'The Pods carry `app: shopp` because the Deployment\'s selector and template say so. You want `app: shop`. What must you do with the Deployment?', options: ['Edit `spec.selector` in place with `kubectl edit`', 'Relabel the running Pods by hand with `kubectl label`', 'Delete the Deployment and create it again with the right labels', 'Restart the Pods with `kubectl rollout restart`'], answer: 2, why: 'A Deployment\'s selector cannot be changed after creation. Relabeled Pods would drop out of the ReplicaSet, and a restart keeps the same template.' },
					{ q: 'The Service selects `app: shop` and `tier: web`. The Pods only have `app: shop`. What happens?', options: ['The Pods match, since one label is enough', 'No Pod matches: every key in the selector must match', 'The Service adds `tier: web` to the Pods', 'The API server rejects the Service'], answer: 1, why: 'A selector is "every Pod with all these labels". An extra key in the selector gives zero matches.' }
				]
			},
			{
				title: 'Check readiness',
				questions: [
					{ q: 'The selector now matches. Which column shows whether each Pod is ready?', options: ['STATUS', 'RESTARTS', 'AGE', 'READY'], answer: 3, why: 'STATUS can say Running while READY still says `0/1`.' },
					{ q: 'Once fixed, you roll out a new image to 4 `shop` Pods with the default settings. At most how many may be unavailable at once?', options: ['1', '2', '0', '4'], answer: 0, why: 'By default a Deployment keeps at most 25% of its Pods unavailable during a rollout: one Pod out of four.' },
					{ q: 'How does a not-ready Pod show up in the EndpointSlice?', options: ['It does not show at all', 'With `ready: false`', 'With a new IP address', 'As a duplicate entry'], answer: 1, why: 'It stays in the list, marked not ready, so you can see it is selected but not used.' },
					{ q: 'Why check readiness only after the selector?', options: ['Readiness checks are slow to run', 'kubectl cannot show readiness before a fix', 'With no match, no Pod is in the list to be ready or not', 'Readiness depends on the Service type'], answer: 2, why: 'Fix the link first. Readiness only matters for Pods the Service already selects.' }
				]
			},
			{
				title: 'Check the port last',
				questions: [
					{ q: 'Which Service field must match the port the container listens on?', options: ['`port`', '`targetPort`', '`nodePort`', '`clusterIP`'], answer: 1, why: '`targetPort` is where the Service sends traffic on the Pod.' },
					{ q: 'Endpoints exist and are ready, but the app listens on 8080 and `targetPort` is 80. What do clients see?', options: ['Traffic reaches the Pod but nothing answers on 80', 'The Service picks port 8080 for you', 'The endpoints vanish', 'Kubernetes rejects the Service'], answer: 0, why: 'The Service sends to the wrong port. The Pod is selected and ready, and still nobody listens there.' },
					{ q: 'What is the right order of the checks?', options: ['Port, readiness, selector', 'Readiness, port, selector', 'Selector, port, readiness', 'Selector, readiness, port'], answer: 3, why: 'Zero endpoints points at the selector first. Then readiness decides which Pods get traffic, then the port.' },
					{ q: 'Clients call `shop` by name. What changes for them when you fix the labels and the Pods get replaced?', options: ['They must use the new Pod IPs', 'Nothing: the name stays, only the IPs behind it change', 'They must restart to refresh DNS', 'They switch to a new Service IP'], answer: 1, why: 'The Service name stays stable. Only the list of Pod IPs behind it changes.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'How does a Service decide which Pods receive its traffic?',
			options: [
				'It sends to every Pod created by the Deployment with the same name',
				'It uses a label selector and sends to the matching Pods that are ready',
				'You list the Pod IPs in the Service spec',
				'It asks the scheduler which Pods are on which node'
			],
			answer: 1,
			why: 'A Service only has a selector. Kubernetes keeps its list of endpoints up to date with the matching Pods, and only sends traffic to those that are ready.'
		},
		{
			q: 'You change the container image in a Deployment. What happens?',
			options: [
				'The existing Pods are patched in place with the new image',
				'Nothing happens until you delete the old Pods by hand',
				'A new ReplicaSet is scaled up while the old one is scaled down',
				'The Service is recreated with a new IP for the new Pods'
			],
			answer: 2,
			why: 'Changing the Pod template triggers a rollout: a new ReplicaSet for the new template, old one scaled down. The old ReplicaSet is kept, which is what makes rollback possible.'
		},
		{
			q: 'What is the default type of a Service when you do not set `type`?',
			options: ['`NodePort`', '`LoadBalancer`', '`ClusterIP`', '`ExternalName`'],
			answer: 2,
			why: '`ClusterIP` is the default: a virtual IP reachable only from inside the cluster. `NodePort` and `LoadBalancer` build on it to reach the outside.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Break a Service with a one-letter selector typo, see that nothing complains, then find and fix it.',
		steps: [
			'Start a local cluster with `minikube start`, then run three Pods: `kubectl create deployment shop --image=nginx:1.27 --replicas=3` and `kubectl rollout status deployment shop`.',
			'Create a Service with a typo in its selector: `kubectl expose deployment shop --port=80 --selector=app=shopp`.',
			'Call it from inside the cluster: `kubectl run probe --rm -i --restart=Never --image=busybox:1.36 -- wget -qO- -T 5 http://shop`. Then look at `kubectl get endpointslices -l kubernetes.io/service-name=shop`.',
			'Compare the two sides: `kubectl get svc shop -o jsonpath=\'{.spec.selector}\'` and `kubectl get pods -l app=shop --show-labels`.',
			'Fix the selector: `kubectl set selector service shop app=shop`. Wait a few seconds and run the same `kubectl run probe ...` command again. Clean up with `kubectl delete deployment,service shop`.'
		],
		done: [
			'Before the fix, the EndpointSlice shows `<unset>` under ENDPOINTS and `wget` fails at once with `Connection refused`, while all three Pods are `Running`.',
			'No command along the way printed an error about the selector.',
			'After the fix, the EndpointSlice lists three Pod IPs on port 80 and `wget` prints the `Welcome to nginx!` page.'
		],
		solution: [
			'The Service selects `{"app":"shopp"}` and the Pods carry `app=shop`. Labels match exactly, so the Service gets zero endpoints.',
			'`kubectl set selector` replaces the Service\'s `spec.selector`. Kubernetes then fills the EndpointSlice with the matching Pods that are ready.',
			'In a real repo, fix the YAML file in Git instead, so the next `kubectl apply` does not bring the typo back.'
		]
	},
	recall: {
		q: 'A Service selects `app: shop`, and its Pods carry `app: shopp`. How many endpoints does the Service get, and what error do you see?',
		a: 'Zero endpoints, and no error. A Service finds Pods only through its label selector, so the typo leaves it with no Pods behind it.'
	},
	sources: [
		{ title: 'Kubernetes docs, Pods', url: 'https://kubernetes.io/docs/concepts/workloads/pods/' },
		{ title: 'Kubernetes docs, Deployments', url: 'https://kubernetes.io/docs/concepts/workloads/controllers/deployment/' },
		{ title: 'Kubernetes docs, Service', url: 'https://kubernetes.io/docs/concepts/services-networking/service/' },
		{ title: 'Kubernetes docs, Labels and Selectors', url: 'https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/' },
		{ title: 'kubernetes/examples, Guestbook', url: `${EXAMPLES}/web/guestbook/README.md` }
	]
};
