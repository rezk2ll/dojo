const SAMPLE = 'https://github.com/kubernetes/sample-controller/blob/c99d43fac02d529e9b7421265d90162fcde92cf5';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'why-kubernetes',
	part: 'Kubernetes',
	title: 'Pourquoi Kubernetes : contrôleurs et état désiré',
	minutes: 10,
	hook: [
		'Tu as un cron qui tourne chaque minute : `systemctl is-active nginx || systemctl restart nginx`. Il vérifie que nginx tourne, et le redémarre sinon.',
		'Maintenant tu as 30 machines et 40 applis. Quelle appli tourne où ? Qui la déplace quand un disque lâche à 3 h du matin ? Ton cron ne connaît que sa propre machine.',
		'Kubernetes fait ce genre de vérification pour tout un cluster. Tu écris ce que tu veux, par exemple trois copies de cette image joignables sur le port 80. Kubernetes compare avec ce qui tourne sur **chaque machine**, et corrige chaque écart qu’il trouve.'
	],
	terms: [
		{ term: 'État désiré', def: 'Ce que tu as demandé, écrit dans le `spec` d’un objet. Par exemple : trois réplicas de cette image.' },
		{ term: 'État actuel', def: 'Ce qui tourne vraiment, remonté dans le `status` de l’objet.' },
		{ term: 'Contrôleur', def: 'Une boucle de contrôle qui surveille un type d’objet et agit pour rapprocher l’état actuel de l’état désiré.' },
		{ term: 'Node', def: 'Une machine de travail. Son kubelet s’assure que les Pods qui lui sont attribués tournent.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: [
					'you["Toi : kubectl apply -f app.yaml"]',
					'subgraph cp["Control plane"]',
					'api["kube-apiserver"]',
					'etcd[("etcd")]',
					'end',
					'you --> api',
					'api --> etcd'
				],
				highlight: ['api', 'etcd'],
				note: 'Tu ne fais jamais de ssh sur une machine. `kubectl` lit sa config dans `~/.kube/config` et envoie ton état désiré à l’**API server**, qui le stocke dans etcd, une base clé valeur. Le control plane regroupe l’API server, etcd, le scheduler et le controller manager. À ce stade, aucun conteneur ne tourne sur aucun node.'
			},
			{
				add: [
					'cm["kube-controller-manager"]',
					'cm <-->|"watch et mise à jour"| api'
				],
				highlight: ['cm'],
				note: 'Le controller manager fait tourner les **contrôleurs** intégrés. Chacun surveille l’API server, voit « trois réplicas voulus, zéro existant », et demande à l’API server de créer les Pods manquants.'
			},
			{
				add: [
					'sch["kube-scheduler"]',
					'sch <-->|"lie le Pod à un node"| api'
				],
				highlight: ['sch'],
				note: 'Le **scheduler** cherche les Pods qui n’ont pas encore de node, et en choisit un pour chacun. Il ne démarre rien. Il écrit seulement « ce Pod va sur le node 2 ».'
			},
			{
				add: [
					'subgraph wk["Nodes de travail"]',
					'k1["node 1 : kubelet + runtime"]',
					'k2["node 2 : kubelet + runtime"]',
					'end',
					'k1 <-->|"mes Pods ?"| api',
					'k2 <-->|"mes Pods ?"| api'
				],
				highlight: ['k1', 'k2'],
				note: 'Sur chaque node, le kubelet demande à l’API server quels Pods sont pour lui, puis les fait démarrer par le container runtime. Il remonte ce qui tourne vraiment : l’**état actuel**.'
			},
			{
				add: [],
				highlight: ['cm', 'k1', 'k2'],
				note: 'Le node 2 meurt. Après [environ 50 secondes](https://kubernetes.io/docs/reference/command-line-tools-reference/kube-controller-manager/) sans nouvelles, le control plane le marque injoignable. Par défaut, ses Pods lui restent alors attachés 5 minutes de plus, au cas où il revienne. Puis ils sont évincés : état actuel deux, état désiré trois. Le contrôleur crée un nouveau Pod, le scheduler le place sur le node 1, et personne n’a été réveillé.'
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
			'Le projet Kubernetes publie ce contrôleur d’exemple. Il surveille un objet inventé appelé `Foo` et garde un Deployment aligné dessus. Pas besoin d’écrire du Go : lis un bloc à la fois. Les lignes qui commencent par `//` sont des commentaires.',
			'La ligne 2 lit le Deployment dans une copie locale (un cache) de ce que contient l’API server. `deployment, err := ...` garde deux résultats : le Deployment, et une erreur si quelque chose a mal tourné.',
			'Les lignes 4 à 6 s’exécutent quand `errors.IsNotFound(err)` est vrai, donc quand ce Deployment n’existe pas. `...Create(ctx, newDeployment(foo), ...)` demande alors à l’API server de le créer, et `newDeployment(foo)` le construit à partir de `Foo.spec` (tu peux ignorer `ctx` et les options). Les lignes `…` coupées s’arrêtent sur les erreurs et vérifient que le Deployment appartient bien à ce `Foo`.',
			'Les lignes 11 à 14 mettent le Deployment à jour. `!=` veut dire « différent de », `&&` veut dire « et », `nil` veut dire « pas défini », et une `*` devant un nom lit la valeur vers laquelle il pointe. Si `Foo` fixe un nombre de réplicas différent de celui du Deployment, la ligne 13 envoie un `Update` avec le Deployment voulu. La ligne 12, `logger.V(4).Info`, écrit seulement une ligne de log de debug.',
			'La ligne 18, `updateFooStatus`, écrit ce que le contrôleur a vu dans le `status` de `Foo`. Ton cron faisait les trois mêmes gestes : regarder, corriger l’écart, rendre compte.',
			'Il ne tourne pas seulement sur un minuteur. Il [enregistre des handlers](https://github.com/kubernetes/sample-controller/blob/c99d43fac02d529e9b7421265d90162fcde92cf5/controller.go#L128-L153), donc un changement sur un `Foo`, ou sur un Deployment, le réveille tout de suite.',
			'Les contrôleurs intégrés des Deployments et des ReplicaSets marchent de la même façon. Kubernetes fait tourner beaucoup de ces boucles, une par type d’objet.'
		]
	},
	tradeoff: {
		gain: [
			'Un contrôleur remplace un conteneur mort, ou les Pods d’un node mort, sans que personne ne tape de commande.',
			'Tu déploies toutes les applis sur toutes les machines par une seule API, et le scheduler choisit le serveur.',
			'Ton état désiré est un fichier YAML, donc il vit dans Git et passe en revue comme n’importe quel changement.'
		],
		cost: [
			'Beaucoup de pièces : API server, etcd, scheduler, contrôleurs, kubelets. Chacune peut casser, et tu dois apprendre à les déboguer.',
			'Pour une appli sur deux serveurs, une unité systemd et un playbook Ansible peuvent suffire, sans cluster à faire tourner.',
			'Un changement fait à la main sur un node est défait au prochain passage de la boucle.'
		]
	},
	task: {
		prompt: 'Ton collègue répare une appli cassée avec `kubectl delete pod web-7d4b9c-x2k8p`. Dix secondes plus tard, `kubectl get pods` montre un Pod `web-7d4b9c-q9m3z`. Il pense que la suppression a échoué. Explique, étape par étape, quelle partie du cluster a fait quoi.',
		hint: 'Un contrôleur a créé ce Pod. Qu’est-ce que ce contrôleur compare ?',
		answer: [
			'La suppression a marché. Le Pod appartenait à un ReplicaSet, qui veut (par exemple) 3 réplicas.',
			'Le contrôleur du ReplicaSet a vu état actuel 2, état désiré 3, et a demandé à l’API server de créer un nouveau Pod, avec un nouveau nom aléatoire.',
			'Le scheduler lui a choisi un node, et le kubelet de ce node a démarré les conteneurs.',
			'Pour vraiment retirer l’appli, change l’état désiré : scale à 0 ou supprime le Deployment qui possède le ReplicaSet.'
		]
	},
	quiz: [
		{
			q: 'Dans Kubernetes, que fait un contrôleur ?',
			options: [
				'Il fait tourner les conteneurs de chaque Pod directement sur son node',
				'Il surveille des objets et agit pour rapprocher l’état actuel de l’état désiré',
				'Il stocke les données du cluster sur disque pour survivre aux redémarrages',
				'Il choisit sur quel node tourne un nouveau Pod, selon les ressources libres'
			],
			answer: 1,
			why: 'Un contrôleur est une boucle de contrôle : comparer état désiré et état actuel, puis agir. Faire tourner les conteneurs est le travail du kubelet, stocker les données celui d’etcd, et choisir les nodes celui du scheduler.'
		},
		{
			q: 'Quel composant choisit le node d’un Pod qui n’en a pas encore ?',
			options: ['kubelet', 'kube-controller-manager', 'kube-scheduler', 'etcd'],
			answer: 2,
			why: 'Le scheduler cherche les Pods pas encore liés à un node et attribue à chacun un node adapté. Le kubelet de ce node le démarre ensuite.'
		},
		{
			q: 'Où `kubectl` cherche-t-il sa configuration de cluster par défaut ?',
			options: ['`/etc/kubernetes/kubectl.conf`', 'Un fichier nommé `config` dans `$HOME/.kube`', 'La variable d’environnement `KUBECTL_HOME`', 'Il demande au scheduler'],
			answer: 1,
			why: 'kubectl lit `$HOME/.kube/config`. Tu peux pointer ailleurs avec la variable `KUBECONFIG` ou le flag `--kubeconfig`.'
		}
	],
	recall: {
		q: 'Tu supprimes un Pod d’un ReplicaSet qui veut 3 réplicas. Quels composants agissent, et dans quel ordre ?',
		a: 'Le contrôleur du ReplicaSet voit état actuel 2 et état désiré 3, et demande un nouveau Pod à l’API server. Le scheduler le lie à un node, et le kubelet de ce node le démarre.'
	},
	sources: [
		{ title: 'Doc Kubernetes, Taints and Tolerations (éviction par défaut après 300 secondes)', url: 'https://kubernetes.io/docs/concepts/scheduling-eviction/taint-and-toleration/' },
		{ title: 'Doc Kubernetes, Controllers', url: 'https://kubernetes.io/docs/concepts/architecture/controller/' },
		{ title: 'Doc Kubernetes, Kubernetes Components', url: 'https://kubernetes.io/docs/concepts/overview/components/' },
		{ title: 'Doc Kubernetes, Objects in Kubernetes (spec et status)', url: 'https://kubernetes.io/docs/concepts/overview/working-with-objects/' },
		{ title: 'Doc Kubernetes, Command line tool (kubectl)', url: 'https://kubernetes.io/docs/reference/kubectl/' },
		{ title: 'kubernetes/sample-controller, controller.go', url: `${SAMPLE}/controller.go` }
	]
};
