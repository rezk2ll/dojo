const K8S = 'https://github.com/kubernetes/website/blob/2f85f2802e59eb2128543dbfbf114ad641db4be0';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'rbac-and-namespaces',
	part: 'Running in production',
	title: 'Namespaces and RBAC: sharing a cluster between teams',
	minutes: 10,
	hook: [
		'On a shared Linux server you never gave everyone root. You made groups, put people in them, and wrote a `sudoers` file that said who may restart which service.',
		'A Kubernetes cluster shared by three teams needs the same thing. Without it, the intern on team A can delete team B\'s database with one `kubectl delete`.',
		'Kubernetes splits the job in two. Namespaces say where resources live, and **RBAC** says who may do what in each namespace. A ResourceQuota caps what one namespace may use in total, so one team cannot take all the CPU.'
	],
	terms: [
		{ term: 'Namespace', def: 'A named folder for resources inside one cluster. Names must be unique inside a namespace, not across them. Nodes and PersistentVolumes are cluster-wide, not in any namespace.' },
		{ term: 'Role / ClusterRole', def: 'A list of allowed verbs (`get`, `list`, `create`, `delete`...) on resources. A Role lives in one namespace. A ClusterRole is cluster-wide.' },
		{ term: 'RoleBinding / ClusterRoleBinding', def: 'Gives a Role to subjects: users, groups or service accounts. A RoleBinding grants inside its own namespace, even when it points at a ClusterRole.' },
		{ term: 'Service account', def: 'An identity for a program, not a person. Each namespace gets one named `default`, and a pod that names none runs as it.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: [
					'subgraph nsa["Namespace team-a"]',
					'appa["team-a pods"]',
					'end',
					'subgraph nsb["Namespace team-b"]',
					'appb["team-b pods"]',
					'end'
				],
				highlight: ['appa', 'appb'],
				note: 'One cluster, one namespace per team. Each team can call its Deployment `api` without a clash. Namespaces alone **do not block anything**: they are only names until you add rules.'
			},
			{
				add: [
					'role["Role: edit pods in team-a"]',
					'rb["RoleBinding in team-a"]',
					'alice["User alice"]',
					'rb -->|"roleRef"| role',
					'rb -->|"subject"| alice',
					'class alice ext'
				],
				highlight: ['role', 'rb', 'alice'],
				note: 'The Role lists the allowed verbs, and the RoleBinding names who gets them. Alice can now work in `team-a`. RBAC **only grants rights** and has no deny rules, so in `team-b` she can do nothing at all.'
			},
			{
				add: [
					'sa["ServiceAccount ci-deployer"]',
					'rb -->|"subject"| sa',
					'sa -.->|"kubectl apply"| appa'
				],
				highlight: ['sa'],
				note: 'Your CI pipeline should not use a person\'s login. It gets a **service account** with a binding of its own. Its username looks like `system:serviceaccount:team-a:ci-deployer`.'
			},
			{
				add: [
					'quota["ResourceQuota: 1 CPU, 1Gi requested"]',
					'quota -.->|"caps"| nsa'
				],
				highlight: ['quota'],
				note: 'The quota caps the **sum** of all pods in the namespace. A pod that would go over it is rejected with `403 Forbidden`. With a CPU or memory quota on, every pod must also set requests or limits.'
			}
		]
	},
	example: {
		title: 'content/en/examples/access/simple-rolebinding-with-role.yaml',
		repo: 'kubernetes/website',
		url: `${K8S}/content/en/examples/access/simple-rolebinding-with-role.yaml#L1-L17`,
		lang: 'yaml',
		code: `apiVersion: rbac.authorization.k8s.io/v1
# This role binding allows "jane" to read pods in the "default" namespace.
# You need to already have a Role named "pod-reader" in that namespace.
kind: RoleBinding
metadata:
  name: read-pods
  namespace: default
subjects:
# You can specify more than one "subject"
- kind: User
  name: jane # "name" is case sensitive
  apiGroup: rbac.authorization.k8s.io
roleRef:
  # "roleRef" specifies the binding to a Role / ClusterRole
  kind: Role #this must be Role or ClusterRole
  name: pod-reader # this must match the name of the Role or ClusterRole you wish to bind to
  apiGroup: rbac.authorization.k8s.io`,
		notes: [
			'Line 16 names the Role `pod-reader`. That Role is [three lines of rules](https://github.com/kubernetes/website/blob/2f85f2802e59eb2128543dbfbf114ad641db4be0/content/en/examples/access/simple-role.yaml#L1-L9): `pods`, with the verbs `get`, `watch` and `list`, so Jane can only read.',
			'Line 7, `namespace: default`, limits Jane to one namespace. The same binding in `team-a` would give her read access there instead.',
			'Lines 8 to 12 hold `subjects`, which is a list. Add a `kind: Group` entry and you manage people the way you managed Unix groups, outside the cluster.',
			'Lines 13 to 17 hold `roleRef`, which **cannot be changed** after creation. To point the binding at another role, you delete it and create a new one.'
		]
	},
	tradeoff: {
		gain: [
			'One cluster for many teams: fewer control planes to upgrade and pay for.',
			'Roles and bindings are YAML in Git, so you review who got which right in a pull request.',
			'A ResourceQuota stops one runaway Deployment from taking the CPU and memory every other team needs.'
		],
		cost: [
			'By default every pod can reach every other pod, in any namespace, until you add NetworkPolicies.',
			'Each team adds bindings, and without a naming scheme nobody knows why a given binding exists.',
			'Teams still share the nodes and the kernel. For untrusted tenants, separate clusters are often the safer answer.'
		]
	},
	task: {
		prompt: 'Two teams, `shop` and `blog`, will share a cluster. The shop team must deploy only in its own namespace. Its CI must deploy too. The blog team must not use more than 2 CPUs. List the objects you create.',
		hint: 'Per team: where things live, who may act there, what the pipeline runs as, and how much it may use.',
		answer: [
			'Two namespaces: `shop` and `blog`.',
			'In `shop`: a Role (or the built-in `edit` ClusterRole) and a RoleBinding to the shop team\'s **group**, not to each person.',
			'In `shop`: a ServiceAccount for CI, with its own RoleBinding. The pipeline uses its token, never a human login.',
			'In `blog`: a ResourceQuota with `requests.cpu: "2"`. Pods without CPU requests will be rejected, so give the namespace a LimitRange with defaults, or tell the team.',
			'Check it: `kubectl auth can-i create deployments -n blog --as=system:serviceaccount:shop:ci` should answer `no`.'
		],
		steps: [
			{
				title: 'Give each team a place',
				questions: [
					{ q: 'What is the first object to create for each team?', options: ['A node pool', 'A ClusterRole', 'A namespace', 'A NetworkPolicy'], answer: 2, why: 'Namespaces say where resources live. Everything else for the team goes inside one.' },
					{ q: 'Both teams want a Deployment named `api`. Is that a clash?', options: ['No: names must be unique inside a namespace, not across them', 'Yes: names are cluster-wide', 'Only if they use the same image', 'Yes, unless one uses a StatefulSet'], answer: 0, why: 'Each namespace is its own set of names.' },
					{ q: 'With only the two namespaces, can the shop team delete a blog Deployment?', options: ['No: namespaces block access by themselves', 'Only with a ClusterRole', 'No: kubectl refuses other namespaces', 'Possibly: namespaces alone do not block anything'], answer: 3, why: 'Namespaces are only names until you add RBAC rules.' },
					{ q: 'Which of these is not in any namespace?', options: ['A Deployment', 'A node', 'A ServiceAccount', 'A ResourceQuota'], answer: 1, why: 'Nodes and PersistentVolumes are cluster-wide.' }
				]
			},
			{
				title: 'Let the shop team deploy',
				questions: [
					{ q: 'Which pair lets the shop team deploy in `shop` only?', options: ['A ClusterRoleBinding to `edit`', 'A Role and a RoleBinding in `shop`', 'A ResourceQuota in `shop`', 'A ServiceAccount named `shop`'], answer: 1, why: 'The Role lists the verbs, the RoleBinding names who gets them, inside `shop`.' },
					{ q: 'Can the RoleBinding point at the built-in `edit` ClusterRole?', options: ['Yes, and it still grants only inside `shop`', 'No: a RoleBinding can only use a Role', 'Yes, and it then grants in every namespace', 'Only for service accounts'], answer: 0, why: 'A RoleBinding grants inside its own namespace, even when it points at a ClusterRole.' },
					{ q: 'Who should the binding name?', options: ['Each person, one subject per name', 'The `default` service account', 'The cluster admin', 'The shop team\'s group'], answer: 3, why: 'Bind the group, and you manage people outside the cluster, like Unix groups.' },
					{ q: 'Later you want the shop binding to point at a custom Role instead of `edit`. How do you do it?', options: ['Edit `roleRef` in place with `kubectl edit`', 'Add a second `roleRef` to the same binding', 'Delete the RoleBinding and create a new one', 'Rename the custom Role to `edit`'], answer: 2, why: '`roleRef` cannot be changed after a binding is created. To point at another role, you replace the binding.' }
				]
			},
			{
				title: 'Give CI its own identity',
				questions: [
					{ q: 'What should the pipeline authenticate as?', options: ['The lead developer\'s login', 'A ServiceAccount made for it, like `ci` in `shop`', 'The `default` service account', 'The cluster admin'], answer: 1, why: 'A program gets an identity of its own, never a person\'s login. `default` is shared by every pod that names no account.' },
					{ q: 'What else does the CI ServiceAccount need?', options: ['Its own RoleBinding in `shop`', 'Nothing: service accounts can do everything', 'A ResourceQuota', 'A node of its own'], answer: 0, why: 'An identity with no binding has no rights. Bind it like any subject.' },
					{ q: 'What username does Kubernetes see for it?', options: ['`ci@shop`', '`shop/ci`', '`system:serviceaccount:shop:ci`', '`serviceaccount-ci`'], answer: 2, why: 'Service account usernames have the form `system:serviceaccount:<namespace>:<name>`.' },
					{ q: 'How do you check it cannot deploy into `blog`?', options: ['Run the pipeline and watch it', 'Read the Role YAML', '`kubectl get rolebindings -A`', '`kubectl auth can-i create deployments -n blog --as=system:serviceaccount:shop:ci`'], answer: 3, why: 'It asks the API server directly, and should answer `no`.' }
				]
			},
			{
				title: 'Cap the blog team',
				questions: [
					{ q: 'Which object caps the blog team at 2 CPUs?', options: ['A LimitRange', 'A ResourceQuota with `requests.cpu: "2"`', 'A PodDisruptionBudget', 'A Role with `cpu` in its rules'], answer: 1, why: 'A ResourceQuota caps the sum of all pods in the namespace.' },
					{ q: 'A pod would push the namespace over the quota. What happens?', options: ['It is rejected with `403 Forbidden`', 'It runs, throttled', 'It waits as `Pending`', 'It moves to another namespace'], answer: 0, why: 'The quota is checked when the pod is created, and the API server refuses it.' },
					{ q: 'Blog runs 4 pods that each request 500m and use about 100m. Can it start a fifth pod that requests 500m?', options: ['Yes: the pods only use 0.4 CPU', 'Yes, once the scheduler finds a node', 'No: the quota sums the requests, and 2 CPUs are already requested', 'Only if the pod sets no limit'], answer: 2, why: 'A ResourceQuota on `requests.cpu` counts what pods request, not what they use. 4 × 500m already reaches the cap of 2.' },
					{ q: 'The quota also rejects blog pods that set no CPU request. How do you spare the team those rejections?', options: ['Remove the quota', 'Give them a ClusterRole', 'Use a PDB', 'Add a LimitRange with default requests, or tell the team'], answer: 3, why: 'A LimitRange fills in defaults for pods that forget.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'What is the difference between a Role and a RoleBinding?',
			options: [
				'A Role is for human users, while a RoleBinding is the same list of rights for service accounts',
				'A Role lists allowed actions on resources. A RoleBinding gives that Role to users, groups or service accounts',
				'A Role is cluster-wide, while a RoleBinding is a copy of that Role limited to one namespace',
				'They are two names for the same object, kept apart only for older clients of the API'
			],
			answer: 1,
			why: 'The Role says what may be done. The binding says who gets it. The cluster-wide versions are ClusterRole and ClusterRoleBinding.'
		},
		{
			q: 'Alice has a RoleBinding in `team-a`. Nothing else mentions her. What can she do in `team-b`?',
			options: [
				'Read everything, because RBAC allows reading in every namespace by default',
				'The same as in `team-a`, because a RoleBinding follows the user everywhere',
				'Nothing, because RBAC only grants and there are no other grants for her there',
				'Everything, unless a deny rule in `team-b` blocks her'
			],
			answer: 2,
			why: 'RBAC only grants rights. A RoleBinding grants only inside its own namespace, and RBAC has no deny rules to reason about.'
		},
		{
			q: 'A namespace has a ResourceQuota on `requests.cpu`. A pod without any CPU request is submitted and no LimitRange sets a default. What happens?',
			options: [
				'The pod runs with unlimited CPU, since the quota only counts pods that set a request',
				'The pod may be rejected, because the quota needs every pod to set CPU requests or limits',
				'The quota is ignored for that pod, because there is no request to count',
				'Kubernetes moves the pod to the default namespace, where no quota applies'
			],
			answer: 1,
			why: 'With a CPU quota on, pods must state requests or limits so the quota can count them. A LimitRange can fill in defaults for teams that forget.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Set up two team namespaces with RBAC and a CPU quota, then prove each rule with `kubectl auth can-i` and a rejected pod.',
		steps: [
			'Start a local cluster with `minikube start`, then create the namespaces: `kubectl create namespace shop && kubectl create namespace blog`.',
			'Give the shop team\'s group the built-in `edit` role in `shop`: `kubectl -n shop create rolebinding shop-team-edit --clusterrole=edit --group=shop-team`.',
			'Give CI its own identity: `kubectl -n shop create serviceaccount ci && kubectl -n shop create rolebinding ci-edit --clusterrole=edit --serviceaccount=shop:ci`.',
			'Ask the API server, for both namespaces: `kubectl auth can-i create deployments -n shop --as=alice --as-group=shop-team`, then the same with `-n blog`, then `kubectl auth can-i create deployments -n blog --as=system:serviceaccount:shop:ci`.',
			'Cap `blog` with a small quota that fits a laptop: `kubectl -n blog create quota cpu --hard=requests.cpu=500m`. Run `kubectl -n blog create deployment web --image=nginx:1.27` and read `kubectl -n blog get events --field-selector reason=FailedCreate`. Then `kubectl -n blog set resources deployment web --requests=cpu=200m`, `kubectl -n blog scale deployment web --replicas=3`, and `kubectl -n blog describe quota cpu`. Clean up with `kubectl delete namespace shop blog`.'
		],
		done: [
			'`can-i` answers `yes` for Alice and for CI in `shop`, and `no` for both in `blog`.',
			'Before `set resources`, `kubectl -n blog get pods` shows nothing and the events say `must specify requests.cpu`.',
			'After scaling to 3, only 2 pods run, the quota shows `400m` used of `500m`, and the events say `exceeded quota`.'
		],
		solution: [
			'A RoleBinding grants only in its own namespace, even when it points at the `edit` ClusterRole. RBAC has no deny rule: Alice and CI are refused in `blog` because nothing grants them anything there.',
			'`--as` and `--as-group` impersonate a user, which is how you test rules without that user\'s login.',
			'With a CPU quota on, a pod without a CPU request is refused. Two pods at `200m` use `400m`, and a third would reach `600m`, over the `500m` cap. A LimitRange with a default request would have saved the first rejection.'
		]
	},
	recall: {
		q: 'Alice has a RoleBinding in `team-a` and nothing else. What can she do in `team-b`, and why?',
		a: 'Nothing. A RoleBinding grants rights only inside its own namespace, and RBAC has no deny rules, so with no binding in `team-b` she has no rights there.'
	},
	sources: [
		{ title: 'Kubernetes docs, Using RBAC authorization', url: 'https://kubernetes.io/docs/reference/access-authn-authz/rbac/' },
		{ title: 'Kubernetes docs, Namespaces', url: 'https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces/' },
		{ title: 'Kubernetes docs, Service accounts', url: 'https://kubernetes.io/docs/concepts/security/service-accounts/' },
		{ title: 'Kubernetes docs, Resource quotas', url: 'https://kubernetes.io/docs/concepts/policy/resource-quotas/' },
		{ title: 'Kubernetes docs, Multi-tenancy', url: 'https://kubernetes.io/docs/concepts/security/multi-tenancy/' }
	]
};
