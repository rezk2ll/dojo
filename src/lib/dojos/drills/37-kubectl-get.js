/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'kubectl-get',
	part: 'Ops tools',
	title: 'kubectl get and describe',
	minutes: 10,
	hook: [
		'The shop checkout fails for some users. Before you change anything, you look at what runs in the cluster. Your kubeconfig points at the namespace `default`, so every command about the shop needs the namespace `shop`.',
		'The namespace `shop` holds the Deployment `web` (3 pods with the label `app=web`, one container `nginx`), the Deployment `api` (2 pods with the label `app=api`, containers `api` and `log-shipper`, both pods in `CrashLoopBackOff`) and the StatefulSet `cache`, whose one pod is always named `cache-0`.'
	],
	terms: [
		{ term: 'namespace', def: 'A named group of objects in one cluster. `kubectl` looks in one namespace unless you name another with `-n`.' },
		{ term: 'label', def: 'A key and value stored on an object, like `app=web`. A label selector picks every object that has it.' },
		{ term: 'JSONPath', def: 'A path into an object’s fields, like `.status.podIP`. `-o jsonpath` and `--sort-by` take one.' }
	],
	reps: [
		{
			prompt: 'List the pods in the namespace `shop`.',
			accept: ['kubectl get pods -n shop', 'kubectl get pods --namespace shop', 'kubectl get pods --namespace=shop', 'kubectl -n shop get pods', 'kubectl get pod -n shop', 'kubectl get po -n shop'],
			why: '`get pods` prints one row per pod, with columns such as `STATUS` and `RESTARTS`. `-n shop` is short for `--namespace shop`; without it you see the pods of `default`.'
		},
		{
			prompt: 'List the same pods with their IP address and the node each one runs on.',
			accept: [
				'kubectl get pods -n shop -o wide',
				'kubectl get pods -o wide -n shop',
				'kubectl -n shop get pods -o wide',
				'kubectl get pods -n shop --output wide',
				'kubectl get pods -n shop --output=wide',
				'kubectl get pods -n shop -owide',
				'kubectl get po -n shop -o wide'
			],
			why: '`-o wide` adds four columns to the table, among them `IP` (the pod’s address) and `NODE` (the node that runs it).'
		},
		{
			prompt: 'List only the pods of the Deployment `web`, using their label.',
			accept: [
				'kubectl get pods -n shop -l app=web',
				'kubectl get pods -l app=web -n shop',
				'kubectl -n shop get pods -l app=web',
				'kubectl get pods -n shop --selector app=web',
				'kubectl get pods -n shop --selector=app=web',
				'kubectl get po -n shop -l app=web'
			],
			why: '`-l app=web` is a label selector: it keeps the 3 pods that carry `app=web`. Several pairs separated by commas must all match.'
		},
		{
			prompt: 'List the pods in `shop` with a column that shows all of their labels.',
			accept: ['kubectl get pods -n shop --show-labels', 'kubectl get pods --show-labels -n shop', 'kubectl -n shop get pods --show-labels', 'kubectl get po -n shop --show-labels'],
			why: '`--show-labels` adds a `LABELS` column at the end. It shows `app=api` and also labels the controllers add, like `pod-template-hash`.'
		},
		{
			prompt: 'Print the full Deployment `web` as YAML.',
			accept: [
				'kubectl get deployment web -n shop -o yaml',
				'kubectl get deploy web -n shop -o yaml',
				'kubectl get deployments web -n shop -o yaml',
				'kubectl get deployment/web -n shop -o yaml',
				'kubectl get deploy/web -n shop -o yaml',
				'kubectl get deployment web -o yaml -n shop',
				'kubectl -n shop get deployment web -o yaml',
				'kubectl get deployment web -n shop --output yaml',
				'kubectl get deployment web -n shop --output=yaml',
				'kubectl get deployment web -n shop -oyaml'
			],
			why: '`-o yaml` prints the whole object: your `spec`, plus the `status` and the metadata the cluster added, such as `deployment.kubernetes.io/revision`. `deploy` is the short name of `deployments`.'
		},
		{
			prompt: 'Print only the IP address of the pod `cache-0`, with a JSONPath.',
			accept: [
				"kubectl get pod cache-0 -n shop -o jsonpath='{.status.podIP}'",
				'kubectl get pod cache-0 -n shop -o jsonpath="{.status.podIP}"',
				'kubectl get pod cache-0 -n shop -o jsonpath={.status.podIP}',
				"kubectl get pod cache-0 -n shop -o=jsonpath='{.status.podIP}'",
				"kubectl get pod cache-0 -n shop --output=jsonpath='{.status.podIP}'",
				"kubectl get pods cache-0 -n shop -o jsonpath='{.status.podIP}'",
				"kubectl get po cache-0 -n shop -o jsonpath='{.status.podIP}'",
				"kubectl get pod/cache-0 -n shop -o jsonpath='{.status.podIP}'",
				"kubectl -n shop get pod cache-0 -o jsonpath='{.status.podIP}'",
				"kubectl get pod cache-0 -o jsonpath='{.status.podIP}' -n shop"
			],
			why: '`-o jsonpath` fills the template `{.status.podIP}` and prints only that value, here `10.244.0.4`, with no table header.'
		},
		{
			prompt: 'Show the details of the pod `cache-0`, with its recent events at the bottom.',
			accept: [
				'kubectl describe pod cache-0 -n shop',
				'kubectl describe pods cache-0 -n shop',
				'kubectl describe po cache-0 -n shop',
				'kubectl describe pod/cache-0 -n shop',
				'kubectl -n shop describe pod cache-0',
				'kubectl describe pod -n shop cache-0',
				'kubectl describe -n shop pod cache-0'
			],
			why: '`describe` prints the node, the labels, each container with its image and state, and then an `Events` table such as `Pulling image "redis:7.4"`.'
		},
		{
			prompt: 'List the pods of every namespace in the cluster.',
			accept: [
				'kubectl get pods --all-namespaces',
				'kubectl get pods -A',
				'kubectl get pod -A',
				'kubectl get po -A',
				'kubectl get pod --all-namespaces',
				'kubectl get po --all-namespaces',
				'kubectl get -A pods'
			],
			why: '`-A` is short for `--all-namespaces`. The table gets a `NAMESPACE` column, and it also lists the `kube-system` pods such as `coredns`.'
		},
		{
			prompt: 'List the events of `shop` sorted by creation time, oldest first.',
			accept: [
				'kubectl get events -n shop --sort-by=.metadata.creationTimestamp',
				'kubectl get events -n shop --sort-by .metadata.creationTimestamp',
				"kubectl get events -n shop --sort-by='.metadata.creationTimestamp'",
				'kubectl get events --sort-by=.metadata.creationTimestamp -n shop',
				'kubectl -n shop get events --sort-by=.metadata.creationTimestamp',
				'kubectl get ev -n shop --sort-by=.metadata.creationTimestamp',
				'kubectl get events -n shop --sort-by=metadata.creationTimestamp'
			],
			why: '`--sort-by` takes a JSONPath to a string or number field. With `.metadata.creationTimestamp`, the latest `BackOff` of the `api` pods is the last line.'
		},
		{
			prompt: 'List the pods in `shop`, then keep printing a line each time one of them changes.',
			accept: ['kubectl get pods -n shop -w', 'kubectl get pods -n shop --watch', 'kubectl get pods -w -n shop', 'kubectl -n shop get pods -w', 'kubectl get po -n shop -w'],
			why: '`-w` prints the table, then waits and prints a new row when a pod changes, for example when an `api` pod restarts.'
		}
	],
	quiz: [],
	recall: {
		q: 'Which flag adds the IP address and the node of each pod to `kubectl get pods`?',
		a: '`-o wide`. It adds the `IP` and `NODE` columns, among others.'
	},
	sources: [
		{ title: 'kubectl get reference', url: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_get/' },
		{ title: 'kubectl describe reference', url: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_describe/' },
		{ title: 'kubectl quick reference', url: 'https://kubernetes.io/docs/reference/kubectl/quick-reference/' },
		{ title: 'JSONPath support in kubectl', url: 'https://kubernetes.io/docs/reference/kubectl/jsonpath/' }
	]
};
