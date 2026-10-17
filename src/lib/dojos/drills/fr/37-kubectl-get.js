/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'kubectl-get',
	part: 'Outils d’exploitation',
	title: 'kubectl get et describe',
	minutes: 10,
	hook: [
		'Le paiement de la boutique échoue pour une partie des clients. Avant de toucher à quoi que ce soit, tu regardes ce qui tourne dans le cluster. Ton kubeconfig pointe sur le namespace `default` : chaque commande sur la boutique doit donc viser le namespace `shop`.',
		'Le namespace `shop` contient le Deployment `web` (3 pods avec le label `app=web`, un conteneur `nginx`), le Deployment `api` (2 pods avec le label `app=api`, conteneurs `api` et `log-shipper`, les deux pods en `CrashLoopBackOff`) et le StatefulSet `cache`, dont l’unique pod s’appelle toujours `cache-0`.'
	],
	terms: [
		{ term: 'namespace', def: 'Un groupe nommé d’objets dans un cluster. `kubectl` cherche dans un seul namespace, sauf si tu en donnes un autre avec `-n`.' },
		{ term: 'label', def: 'Une clé et une valeur posées sur un objet, comme `app=web`. Un sélecteur de labels retient tous les objets qui l’ont.' },
		{ term: 'JSONPath', def: 'Un chemin vers un champ d’un objet, comme `.status.podIP`. `-o jsonpath` et `--sort-by` en prennent un.' }
	],
	reps: [
		{
			prompt: 'Liste les pods du namespace `shop`.',
			accept: ['kubectl get pods -n shop', 'kubectl get pods --namespace shop', 'kubectl get pods --namespace=shop', 'kubectl -n shop get pods', 'kubectl get pod -n shop', 'kubectl get po -n shop'],
			why: '`get pods` affiche une ligne par pod, avec des colonnes comme `STATUS` et `RESTARTS`. `-n shop` est la forme courte de `--namespace shop` ; sans lui, tu vois les pods de `default`.'
		},
		{
			prompt: 'Liste les mêmes pods avec leur adresse IP et le nœud où chacun tourne.',
			accept: [
				'kubectl get pods -n shop -o wide',
				'kubectl get pods -o wide -n shop',
				'kubectl -n shop get pods -o wide',
				'kubectl get pods -n shop --output wide',
				'kubectl get pods -n shop --output=wide',
				'kubectl get pods -n shop -owide',
				'kubectl get po -n shop -o wide'
			],
			why: '`-o wide` ajoute quatre colonnes au tableau, dont `IP` (l’adresse du pod) et `NODE` (le nœud qui le fait tourner).'
		},
		{
			prompt: 'Liste seulement les pods du Deployment `web`, grâce à leur label.',
			accept: [
				'kubectl get pods -n shop -l app=web',
				'kubectl get pods -l app=web -n shop',
				'kubectl -n shop get pods -l app=web',
				'kubectl get pods -n shop --selector app=web',
				'kubectl get pods -n shop --selector=app=web',
				'kubectl get po -n shop -l app=web'
			],
			why: '`-l app=web` est un sélecteur de labels : il garde les 3 pods qui portent `app=web`. Si tu mets plusieurs paires séparées par des virgules, un pod doit les avoir toutes.'
		},
		{
			prompt: 'Liste les pods de `shop` avec une colonne qui montre tous leurs labels.',
			accept: ['kubectl get pods -n shop --show-labels', 'kubectl get pods --show-labels -n shop', 'kubectl -n shop get pods --show-labels', 'kubectl get po -n shop --show-labels'],
			why: '`--show-labels` ajoute une colonne `LABELS` en dernier. Tu y vois `app=api`, et aussi les labels que posent les contrôleurs, comme `pod-template-hash`.'
		},
		{
			prompt: 'Affiche le Deployment `web` complet en YAML.',
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
			why: '`-o yaml` affiche l’objet entier : ton `spec`, plus le `status` et les métadonnées ajoutées par le cluster, comme `deployment.kubernetes.io/revision`. `deploy` est le nom court de `deployments`.'
		},
		{
			prompt: 'Affiche seulement l’adresse IP du pod `cache-0`, avec un JSONPath.',
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
			why: '`-o jsonpath` remplit le modèle `{.status.podIP}` et n’affiche que cette valeur, ici `10.244.0.4`, sans ligne d’en-tête.'
		},
		{
			prompt: 'Affiche le détail du pod `cache-0`, avec ses événements récents en bas.',
			accept: [
				'kubectl describe pod cache-0 -n shop',
				'kubectl describe pods cache-0 -n shop',
				'kubectl describe po cache-0 -n shop',
				'kubectl describe pod/cache-0 -n shop',
				'kubectl -n shop describe pod cache-0',
				'kubectl describe pod -n shop cache-0',
				'kubectl describe -n shop pod cache-0'
			],
			why: '`describe` affiche le nœud, les labels, chaque conteneur avec son image et son état, puis un tableau `Events` avec des lignes comme `Pulling image "redis:7.4"`.'
		},
		{
			prompt: 'Liste les pods de tous les namespaces du cluster.',
			accept: [
				'kubectl get pods --all-namespaces',
				'kubectl get pods -A',
				'kubectl get pod -A',
				'kubectl get po -A',
				'kubectl get pod --all-namespaces',
				'kubectl get po --all-namespaces',
				'kubectl get -A pods'
			],
			why: '`-A` est la forme courte de `--all-namespaces`. Le tableau gagne une colonne `NAMESPACE` et montre aussi les pods de `kube-system`, comme `coredns`.'
		},
		{
			prompt: 'Liste les événements de `shop` triés par date de création, du plus ancien au plus récent.',
			accept: [
				'kubectl get events -n shop --sort-by=.metadata.creationTimestamp',
				'kubectl get events -n shop --sort-by .metadata.creationTimestamp',
				"kubectl get events -n shop --sort-by='.metadata.creationTimestamp'",
				'kubectl get events --sort-by=.metadata.creationTimestamp -n shop',
				'kubectl -n shop get events --sort-by=.metadata.creationTimestamp',
				'kubectl get ev -n shop --sort-by=.metadata.creationTimestamp',
				'kubectl get events -n shop --sort-by=metadata.creationTimestamp'
			],
			why: '`--sort-by` prend un JSONPath vers un champ texte ou nombre. Avec `.metadata.creationTimestamp`, le dernier `BackOff` des pods `api` arrive sur la dernière ligne.'
		},
		{
			prompt: 'Liste les pods de `shop`, puis continue d’afficher une ligne à chaque changement de l’un d’eux.',
			accept: ['kubectl get pods -n shop -w', 'kubectl get pods -n shop --watch', 'kubectl get pods -w -n shop', 'kubectl -n shop get pods -w', 'kubectl get po -n shop -w'],
			why: '`-w` affiche le tableau, puis attend et ajoute une ligne quand un pod change, par exemple quand un pod `api` redémarre.'
		}
	],
	quiz: [],
	recall: {
		q: 'Quelle option ajoute l’adresse IP et le nœud de chaque pod à `kubectl get pods` ?',
		a: '`-o wide`. Elle ajoute entre autres les colonnes `IP` et `NODE`.'
	},
	sources: [
		{ title: 'Référence de kubectl get (en anglais)', url: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_get/' },
		{ title: 'Référence de kubectl describe (en anglais)', url: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_describe/' },
		{ title: 'Aide-mémoire kubectl (en anglais)', url: 'https://kubernetes.io/docs/reference/kubectl/quick-reference/' },
		{ title: 'JSONPath dans kubectl (en anglais)', url: 'https://kubernetes.io/docs/reference/kubectl/jsonpath/' }
	]
};
