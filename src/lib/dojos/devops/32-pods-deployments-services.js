const EXAMPLES = 'https://github.com/kubernetes/examples/blob/d6b8cd27eacb51e651a1aa6f7c190a28713eff6e';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'pods-deployments-services',
	part: 'Kubernetes',
	title: 'Pods, Deployments and Services',
	minutes: 10,
	hook: [
		'On your old servers, the web app lived at `10.0.3.17`. You wrote that IP in the load balancer config, and it stayed true for years.',
		'In Kubernetes, the thing that runs your app is a **Pod**, and Pods are disposable. They die, get replaced, and come back with a new name and a new IP. Writing a Pod IP anywhere is a bug waiting to happen.',
		'So Kubernetes splits the job in two. A **Deployment** keeps the right number of Pods alive. A **Service** gives them one stable name. And the glue between them is not an IP. It is a **label**.'
	],
	terms: [
		{ term: 'Pod', def: 'The smallest thing Kubernetes runs: one or more containers that share a network and storage, always placed on the same node.' },
		{ term: 'ReplicaSet', def: 'Keeps a set number of identical Pods running. You rarely touch it yourself.' },
		{ term: 'Deployment', def: 'Manages ReplicaSets for you, and rolls out a new version by creating a new ReplicaSet and scaling the old one down.' },
		{ term: 'Service', def: 'A stable name and virtual IP in front of a changing set of Pods. Default type is `ClusterIP`, reachable only inside the cluster.' },
		{ term: 'Label', def: 'A key and value stuck on an object, like `app: guestbook`. Free form, and meant for you.' },
		{ term: 'Selector', def: 'A query on labels, like "every Pod with `app: guestbook` and `tier: frontend`". It is how one object finds others.' }
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
				note: 'Three **Pods**, each with the labels `app: guestbook` and `tier: frontend`. Each gets its own IP. If one dies, its IP dies with it.'
			},
			{
				add: [
					'rs["ReplicaSet frontend-5f4d, replicas 3"]',
					'rs --> p1',
					'rs --> p2',
					'rs --> p3'
				],
				highlight: ['rs'],
				note: 'A **ReplicaSet** counts the Pods that match its selector. Fewer than 3? It creates one. More? It deletes one. That is the control loop from yesterday.'
			},
			{
				add: [
					'dep["Deployment frontend"]',
					'dep --> rs'
				],
				highlight: ['dep'],
				note: 'You write the **Deployment**. It creates the ReplicaSet from its Pod template. Change the image, and it creates a **second ReplicaSet** for the new version, then shifts Pods over. By default, at most 25% of the Pods are unavailable at any moment.'
			},
			{
				add: [
					'svc["Service frontend, selector app=guestbook, tier=frontend"]',
					'svc -.-> p1',
					'svc -.-> p2',
					'svc -.-> p3'
				],
				highlight: ['svc'],
				note: 'The **Service** does not know the Deployment exists. It only has a **selector**. Kubernetes keeps a list of the IPs of matching Pods, marks which ones are ready, and updates it as Pods come and go. Traffic only goes to the ready ones.'
			},
			{
				add: [
					'cli["Other Pod: curl http://frontend"]',
					'cli --> svc',
					'class cli ext'
				],
				highlight: ['cli'],
				note: 'Clients use the Service\'s **name**, resolved by the cluster DNS. Pods can be replaced all day: the name stays, and only the list behind it changes.'
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
			'The guestbook is the classic Kubernetes demo. `spec.selector` and `spec.template.metadata.labels` carry the **same two labels**. They must match, or the API server rejects the Deployment.',
			'`template` is a Pod, written inline. The Deployment stamps out 3 copies of it. You never write the Pods yourself.',
			'The [frontend Service](https://github.com/kubernetes/examples/blob/d6b8cd27eacb51e651a1aa6f7c190a28713eff6e/web/guestbook/frontend-service.yaml#L14-L18) selects `app: guestbook` and `tier: frontend` too. That shared pair of labels is the only link between the two files.',
			'A selector with two labels means **both**. The [Redis Deployment](https://github.com/kubernetes/examples/blob/d6b8cd27eacb51e651a1aa6f7c190a28713eff6e/web/guestbook/redis-master-deployment.yaml#L6-L17) of the same app uses `app: redis` and `tier: backend`, so its Pods can never land behind the frontend Service.'
		]
	},
	tradeoff: {
		gain: [
			'Pods can die and be replaced without anyone updating an IP anywhere.',
			'Rolling out a new image is one change to the Deployment, and the old ReplicaSet is kept so you can go back with `kubectl rollout undo`.',
			'Labels are flexible: one Service can span Pods from two Deployments, which is how canary releases are built.'
		],
		cost: [
			'Labels are loose glue. A typo in a selector fails silently: the Service just has no Pods behind it.',
			'A Deployment\'s selector cannot be changed after creation. Plan your labels up front, or delete and recreate.',
			'Three objects for one web app, plus the layers between them, means more places to look when traffic does not arrive.'
		]
	},
	task: {
		prompt: 'Your `shop` Service returns "connection refused" for everyone. `kubectl get pods -l app=shop` shows 3 Pods `Running`. `kubectl get endpointslices -l kubernetes.io/service-name=shop` shows **no endpoints**. What do you check, in order?',
		hint: 'The Service finds Pods only through its selector, and only uses Pods that are ready.',
		answer: [
			'Compare the Service selector (`kubectl get svc shop -o yaml`) with the Pod labels (`kubectl get pods --show-labels`). A typo like `app: shop` vs `app: shopp`, or an extra key in the selector, gives zero matches.',
			'Readiness is not the cause here: a Pod that is not ready still shows in the EndpointSlice, marked `ready: false`. Once the selector matches, check the Pods are **Ready** (the READY column), not just Running. Pods that are not ready get no traffic.',
			'Last, check the Service `targetPort` matches the port the container really listens on.'
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
				'Nothing until you delete the Pods by hand',
				'The Deployment creates a new ReplicaSet and scales it up while scaling the old one down',
				'The Service is recreated with a new IP'
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
	takeaway: 'Pods come and go. A Deployment keeps the count right, a Service keeps the name stable, and labels are the only thing tying them together.',
	sources: [
		{ title: 'Kubernetes docs, Pods', url: 'https://kubernetes.io/docs/concepts/workloads/pods/' },
		{ title: 'Kubernetes docs, Deployments', url: 'https://kubernetes.io/docs/concepts/workloads/controllers/deployment/' },
		{ title: 'Kubernetes docs, Service', url: 'https://kubernetes.io/docs/concepts/services-networking/service/' },
		{ title: 'Kubernetes docs, Labels and Selectors', url: 'https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/' },
		{ title: 'kubernetes/examples, Guestbook', url: `${EXAMPLES}/web/guestbook/README.md` }
	]
};
