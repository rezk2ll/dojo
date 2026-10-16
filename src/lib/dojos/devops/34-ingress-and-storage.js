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
