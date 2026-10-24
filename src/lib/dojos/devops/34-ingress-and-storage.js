const EXAMPLES = 'https://github.com/kubernetes/examples/blob/d6b8cd27eacb51e651a1aa6f7c190a28713eff6e';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'ingress-and-storage',
	part: 'Kubernetes',
	title: 'Ingress and persistent storage',
	minutes: 10,
	hook: [
		'On your old setup, one nginx box in front had a vhost per site: `shop.example.com` goes to these backends, `/api` goes to those. And the database server had a big disk mounted on `/var/lib/mysql` that nobody dared touch.',
		'Kubernetes has both, as objects. An Ingress holds the host and path rules of that vhost file, and sends HTTP traffic to Services. It does nothing until an **ingress controller**, a proxy running in the cluster, reads it.',
		'For storage, a Pod asks for "10 GiB, read write" with a **PersistentVolumeClaim**, and the cluster finds or creates a disk for it. The disk outlives the Pod, so the data is still there after a restart.'
	],
	terms: [
		{ term: 'Ingress', def: 'HTTP and HTTPS routing rules (host, path) from outside the cluster to Services. Does nothing on its own.' },
		{ term: 'Ingress controller', def: 'The proxy that reads Ingress objects and does the routing. You must install one. Creating an Ingress without one has no effect.' },
		{ term: 'PersistentVolume (PV)', def: 'A piece of storage in the cluster (a cloud disk, an NFS share), with a life of its own, independent of any Pod.' },
		{ term: 'PersistentVolumeClaim (PVC)', def: 'A request for storage: a size and an access mode. Kubernetes binds it to a matching PV.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: [
					'user["Browser: shop.example.com/api"]',
					'ic["Ingress controller Pods"]',
					'user --> ic',
					'class user ext'
				],
				highlight: ['ic'],
				note: 'Traffic from outside reaches the **ingress controller**, usually through a cloud load balancer or a NodePort. These Pods do the job of the nginx box from your old setup.'
			},
			{
				add: [
					'ing["Ingress: host shop.example.com, path /api"]',
					'ing -.->|"read by"| ic',
					'svc["Service api"]',
					'ic -->|"/api"| svc',
					'pods["api Pods"]',
					'svc --> pods'
				],
				highlight: ['ing', 'svc'],
				note: 'The Ingress object only holds rules. The controller watches it and configures itself. Each rule points to a **Service**, never to Pods directly. The Service then picks its Pods with its label selector.'
			},
			{
				add: [
					'pvc["PVC data, 10Gi, ReadWriteOnce"]',
					'pods --> pvc'
				],
				highlight: ['pvc'],
				note: 'The Pod spec names a **claim** and never a disk. The claim says how much storage it needs and how it is mounted: `ReadWriteOnce` means read write by a single node.'
			},
			{
				add: [
					'sc["StorageClass fast"]',
					'pv["PersistentVolume, a cloud disk"]',
					'pvc -->|"bound to"| pv',
					'sc -.->|"creates"| pv'
				],
				highlight: ['sc', 'pv'],
				note: 'No matching PV? If the claim names a **StorageClass**, a kind of storage like "fast SSD", the cluster creates one. Delete the claim, and a created PV follows the class\'s reclaim policy, `Delete` by default. Use `Retain` for data you cannot lose.'
			}
		]
	},
	example: {
		title: 'AI/model-serving-tensorflow/ingress.yaml',
		repo: 'kubernetes/examples',
		url: `${EXAMPLES}/AI/model-serving-tensorflow/ingress.yaml#L1-L17`,
		lang: 'yaml',
		code: `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: tf-serving-ingress
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /$2
spec:
  rules:
    - http:
        paths:
          - path: /tf(/|$)(.*)
            pathType: Prefix
            backend:
              service:
                name: tf-serving
                port:
                  number: 8501`,
		notes: [
			'Lines 8 to 17 hold one rule with no `host`, so it matches every host name. Requests under `/tf` (line 11) go to the `tf-serving` Service on port 8501 (lines 15 to 17).',
			'The annotation on line 6 belongs to Ingress NGINX. Each controller adds its own features through annotations, so an Ingress is **less portable** than it looks. Ingress NGINX itself was [retired in March 2026, with no more security fixes](https://kubernetes.io/blog/2025/11/11/ingress-nginx-retirement/).',
			'The `spec` on line 7 has no `ingressClassName`, so the cluster\'s default IngressClass decides which controller handles it. The docs say you should define one.',
			'The same app reads its model through a [claim](https://github.com/kubernetes/examples/blob/d6b8cd27eacb51e651a1aa6f7c190a28713eff6e/AI/model-serving-tensorflow/pvc.yaml#L1-L11) bound by name to a PV with `persistentVolumeReclaimPolicy: Retain`. Someone created that PV by hand, which is called static provisioning.',
			'For databases, a **StatefulSet** works like a Deployment, but gives each Pod a stable name and its own claim, from `volumeClaimTemplates`. The [Cassandra example](https://github.com/kubernetes/examples/blob/d6b8cd27eacb51e651a1aa6f7c190a28713eff6e/databases/cassandra/cassandra-statefulset.yaml#L95-L107) gets `cassandra-0`, `cassandra-1`, `cassandra-2`, each with 1Gi. By default, deleting or scaling down the StatefulSet does not delete those volumes.'
		]
	},
	tradeoff: {
		gain: [
			'Routing rules live next to the app, in Git, instead of in a hand-edited proxy config on one box.',
			'Apps ask for storage by size and class. They do not need to know which disk or which cloud is behind it.',
			'A rescheduled database Pod mounts the same volume again, with its data.'
		],
		cost: [
			'You run and upgrade the ingress controller yourself, and its annotations tie you to it. The Ingress API is frozen and the project now recommends the **Gateway API**.',
			'`ReadWriteOnce` means one node at a time. Two replicas on two nodes cannot both mount the same volume read write, so storage limits how you scale.',
			'The default `Delete` reclaim policy can wipe a disk when someone deletes a claim. Stateful apps on Kubernetes still need backups.'
		]
	},
	task: {
		prompt: 'You apply an Ingress for `blog.example.com` pointing to the `blog` Service on port 80. `kubectl get ingress` lists it, but the site does not answer. List the checks from the outside in.',
		hint: 'Follow the request: DNS, then the thing that reads Ingress objects, then the Service, then the Pods.',
		answer: [
			'Is there an ingress controller running at all, and does it handle this Ingress? Check `ingressClassName` and the cluster\'s default IngressClass. Without a controller, nothing reads the Ingress.',
			'Does `blog.example.com` resolve to the controller\'s load balancer address (the ADDRESS column of `kubectl get ingress`)?',
			'Does the `blog` Service exist in the **same namespace** as the Ingress, with port 80?',
			'Does the Service have ready endpoints? If not, check the Service selector against the Pod labels, then the readiness probes.'
		],
		steps: [
			{
				title: 'Check the controller',
				questions: [
					{ q: '`kubectl get ingress` lists your Ingress. What does that prove?', options: ['Traffic reaches the `blog` Pods', 'The API server stored the rules, nothing more', 'The controller has loaded the rules', 'DNS points to the cluster'], answer: 1, why: 'An Ingress is only a set of rules. Listing it shows the object exists, not that anything reads it.' },
					{ q: 'What happens to an Ingress in a cluster with no ingress controller?', options: ['Nothing: it has no effect', 'kube-proxy routes it instead', 'The API server answers for it', 'The Service becomes a LoadBalancer'], answer: 0, why: 'You must install a controller. Creating an Ingress without one has no effect.' },
					{ q: 'Your Ingress has no `ingressClassName`. Which controller handles it?', options: ['Every controller in the cluster', 'None, ever', 'The one set by the cluster\'s default IngressClass', 'The one in the `default` namespace'], answer: 2, why: 'Without a class name, the default IngressClass decides. The docs say you should define one.' },
					{ q: 'Why check the controller before DNS?', options: ['DNS records take hours to spread, so they are the slowest thing to fix', 'kubectl cannot read DNS', 'The controller decides the Service port', 'Without a controller, there is no address for DNS to point at'], answer: 3, why: 'The controller is the proxy that receives traffic. If it is missing, every later check is moot.' }
				]
			},
			{
				title: 'Check the name resolves',
				questions: [
					{ q: 'Where must `blog.example.com` point?', options: ['To one of the `blog` Pod IPs', 'To the controller\'s load balancer address', 'To the API server, which forwards HTTP to Services', 'To the Service\'s ClusterIP'], answer: 1, why: 'Traffic from outside reaches the ingress controller first, usually through a cloud load balancer or a NodePort.' },
					{ q: 'Where does `kubectl` show that address?', options: ['The ADDRESS column of `kubectl get ingress`', 'The STATUS column of `kubectl get pods`', '`kubectl get nodes -o wide`', '`kubectl describe svc blog`'], answer: 0, why: 'Once a controller handles the Ingress, it fills in the address that DNS should use.' },
					{ q: 'The ADDRESS column is empty. What does that suggest?', options: ['DNS is wrong', 'The `blog` Pods are not ready', 'No controller has picked up this Ingress', 'The Service port is wrong'], answer: 2, why: 'The controller writes that address. Empty points back to the first check.' },
					{ q: 'Why not point DNS at a Pod IP to skip the Ingress?', options: ['Pod IPs are always public', 'Pods do not accept HTTP', 'Pods have no IP', 'Pod IPs change when Pods are replaced'], answer: 3, why: 'When a Pod dies, its IP goes with it. Stable names live on Services and the controller in front.' }
				]
			},
			{
				title: 'Check the Service',
				questions: [
					{ q: 'Each Ingress rule points to what?', options: ['A Service, never Pods directly', 'A Deployment', 'A node and port', 'A PersistentVolumeClaim'], answer: 0, why: 'The rule names a Service and port. The Service then picks its Pods with its selector.' },
					{ q: 'The Ingress is in `web` and the `blog` Service in `default`. Does the rule work?', options: ['Yes: an Ingress can reach a Service in any namespace by its name', 'Yes, if the port matches', 'No: the Service must be in the same namespace as the Ingress', 'Only with a StorageClass'], answer: 2, why: 'A rule names a Service only by name, and the controller looks for it in the Ingress\'s own namespace.' },
					{ q: 'The Ingress says port 80. What must be true of the Service?', options: ['It must have `type: LoadBalancer`', 'It must expose port 80', 'It must be named `blog-80`', 'Its Pods must run on port 80 of the node'], answer: 1, why: 'The rule sends to the Service on a given port. That port must exist on the Service.' },
					{ q: 'Which command checks that the Service exists with the right port?', options: ['`kubectl get svc blog -n <namespace>`', '`kubectl get ingressclass`', '`kubectl get pv`', '`kubectl logs blog`'], answer: 0, why: 'It shows the Service in the Ingress\'s namespace and its ports.' }
				]
			},
			{
				title: 'Check the Pods behind it',
				questions: [
					{ q: 'The Service exists. What do you check next?', options: ['The node\'s disk', 'The StorageClass', 'The DNS TTL', 'Whether it has ready endpoints'], answer: 3, why: 'A Service with no ready endpoints sends traffic nowhere, whatever the Ingress says.' },
					{ q: 'There are no endpoints. What is the first thing to compare?', options: ['The Service selector with the Pod labels', 'The image tag with the registry', 'The Ingress host with the Pod name', 'The request with the limit'], answer: 0, why: 'A Service finds Pods only through its selector. A typo gives zero endpoints, and no error.' },
					{ q: 'Endpoints exist but none are ready. Where do you look?', options: ['At the ingress annotations', 'At the readiness probes', 'At `ingressClassName`', 'At the reclaim policy'], answer: 1, why: 'A Pod that fails readiness gets no traffic from its Service.' },
					{ q: 'Why go from the outside in?', options: ['It is the order in which `kubectl get all` prints the objects of a namespace', 'The inside parts cannot be checked', 'Each check depends on the one before it along the request path', 'The controller resets when you check Pods first'], answer: 2, why: 'Follow the request: controller and DNS, then the Service, then its Pods. A break early on hides everything after it.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'You create an Ingress object in a cluster with no ingress controller. What happens to traffic?',
			options: [
				'The API server routes it itself',
				'Nothing: an Ingress has no effect without a controller',
				'kube-proxy turns it into a NodePort',
				'The Service becomes a LoadBalancer automatically'
			],
			answer: 1,
			why: 'An Ingress is only a set of rules. The docs say: you must have an Ingress controller to satisfy an Ingress, and creating the resource alone has no effect.'
		},
		{
			q: 'What does a Pod reference to get persistent storage?',
			options: [
				'A PersistentVolumeClaim',
				'A StorageClass directly',
				'The disk ID of the cloud volume',
				'A ConfigMap with the mount path'
			],
			answer: 0,
			why: 'The Pod names a claim. The claim is bound to a PV, which may be created from a StorageClass. The Pod never needs to know which disk it is.'
		},
		{
			q: 'You scale a StatefulSet from 3 replicas to 1. What happens to the volumes of `db-1` and `db-2`?',
			options: [
				'They are deleted with the Pods, since each claim belongs to its Pod',
				'They are attached to `db-0`, so the remaining replica keeps all the data',
				'They are kept: by default, StatefulSets do not delete their volumes when scaled down',
				'They are converted to ConfigMaps so the data survives without a disk'
			],
			answer: 2,
			why: 'For data safety, scaling down or deleting a StatefulSet leaves its PVCs and volumes in place, unless you set `persistentVolumeClaimRetentionPolicy` to `Delete`. Scale back up and `db-1` gets its old data again.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Route a host name to a Service through an ingress controller, and see two Ingress mistakes that raise no error.',
		steps: [
			'Start a local cluster with an ingress controller: `minikube start`, then `minikube addons enable ingress`. Wait until `kubectl get pods -n ingress-nginx` shows the controller `Running`.',
			'Run the app and its Service: `kubectl create deployment blog --image=nginx:1.27 && kubectl expose deployment blog --port=80`.',
			'Create an Ingress for a class no controller handles: `kubectl create ingress blog --class=traefik --rule="blog.example.com/*=blog:80"`. In a second terminal, open the controller: `kubectl -n ingress-nginx port-forward svc/ingress-nginx-controller 8080:80`. Back in the first, run `curl -i -H "Host: blog.example.com" localhost:8080` and `kubectl get ingress blog`.',
			'Recreate it with no class, so the default IngressClass applies: `kubectl delete ingress blog && kubectl create ingress blog --rule="blog.example.com/*=blog:80"`. Wait about a minute, then run the same `curl` and `kubectl get ingress blog`.',
			'Point an Ingress at a Service in another namespace: `kubectl create namespace web && kubectl -n web create ingress blog2 --rule="blog2.example.com/*=blog:80"`, then `curl -i -H "Host: blog2.example.com" localhost:8080` and `kubectl -n web describe ingress blog2`. Clean up with `kubectl delete namespace web && kubectl delete ingress,service,deployment blog`.'
		],
		done: [
			'With `--class=traefik`, `curl` returns `404 Not Found` from nginx and the ADDRESS column stays empty.',
			'Without a class, `kubectl get ingress blog` shows CLASS `nginx` and an ADDRESS, and `curl` returns `200 OK` with `Welcome to nginx!`.',
			'The `blog2` Ingress in `web` returns `503 Service Temporarily Unavailable`, although `kubectl create` accepted it.'
		],
		solution: [
			'An Ingress with a class nobody handles is stored and never read. The 404 comes from the controller\'s default backend, and the empty ADDRESS is the clue.',
			'`kubectl get ingressclass nginx -o yaml` shows the annotation `ingressclass.kubernetes.io/is-default-class: "true"`, set by minikube, so an Ingress with no class goes to it.',
			'An Ingress rule can only name a Service in its own namespace. There is no `blog` Service in `web`, so the controller has nowhere to send the request.'
		]
	},
	recall: {
		q: 'You create an Ingress and a PersistentVolumeClaim. What must exist in the cluster for each one to have an effect?',
		a: 'The Ingress needs an ingress controller, a proxy in the cluster that reads it. The claim needs a matching PersistentVolume, or a StorageClass the cluster can create one from.'
	},
	sources: [
		{ title: 'kubernetes/examples, model-serving-tensorflow/pv.yaml', url: `${EXAMPLES}/AI/model-serving-tensorflow/pv.yaml#L1-L12` },
		{ title: 'Kubernetes docs, Ingress', url: 'https://kubernetes.io/docs/concepts/services-networking/ingress/' },
		{ title: 'Kubernetes docs, Ingress Controllers', url: 'https://kubernetes.io/docs/concepts/services-networking/ingress-controllers/' },
		{ title: 'Kubernetes docs, Gateway API', url: 'https://kubernetes.io/docs/concepts/services-networking/gateway/' },
		{ title: 'Kubernetes docs, Persistent Volumes', url: 'https://kubernetes.io/docs/concepts/storage/persistent-volumes/' },
		{ title: 'Kubernetes docs, StatefulSets', url: 'https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/' }
	]
};
