const K8S = 'https://github.com/kubernetes/website/blob/2f85f2802e59eb2128543dbfbf114ad641db4be0';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'cluster-management',
	part: 'En production',
	title: 'Gérer un cluster : mettre à jour sans coupure',
	minutes: 10,
	hook: [
		'Tu connais la nuit de patchs. Tu passes un serveur en maintenance, tu bascules son trafic ailleurs, tu lances les mises à jour, tu redémarres, tu le remets en service. Tu traites une machine à la fois, pour que le service reste debout.',
		'Un cluster Kubernetes demande les mêmes étapes, plusieurs fois par an : le projet ne maintient que les **trois dernières versions mineures**.',
		'Kubernetes intègre ces étapes. Tu fais un cordon sur un nœud, tu le draines, et un PodDisruptionBudget empêche le drain d’arrêter trop de copies d’une appli en même temps.'
	],
	terms: [
		{ term: 'Drain', def: 'Marquer un nœud non planifiable (cordon), pour qu’aucun nouveau pod n’y arrive, puis évincer ses pods pour qu’ils redémarrent ailleurs. `kubectl drain` attend que chaque pod s’arrête proprement.' },
		{ term: 'PodDisruptionBudget (PDB)', def: 'Une règle pour une appli : combien de ses pods doivent rester debout (`minAvailable`) ou peuvent être absents (`maxUnavailable`) pendant une interruption volontaire comme un drain.' },
		{ term: 'HPA', def: 'HorizontalPodAutoscaler : ajoute ou retire des pods d’un Deployment selon une métrique, en général l’usage CPU comparé aux requests des pods.' },
		{ term: 'Cluster autoscaler', def: 'Ajoute des nœuds quand des pods restent en attente faute de place, et retire les nœuds sous-utilisés.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: [
					'cp["Control plane : mis à jour en premier"]',
					'subgraph oldp["Ancien node pool"]',
					'n1["node-1"]',
					'n2["node-2"]',
					'end',
					'cp --> n1',
					'cp --> n2'
				],
				highlight: ['cp'],
				note: 'Tu mets à jour **le control plane d’abord, les nœuds ensuite**. Un kubelet ne doit jamais être plus récent que l’API server. Il peut avoir jusqu’à trois versions mineures de retard, donc les anciens nœuds continuent de marcher pendant la mise à jour.'
			},
			{
				add: [
					'subgraph newp["Nouveau node pool, nouvelle version"]',
					'n3["node-3"]',
					'end',
					'cp --> n3'
				],
				highlight: ['n3'],
				note: 'Sur les clusters managés, une méthode courante consiste à créer un **nouveau node pool** à la nouvelle version, y déplacer les pods, puis supprimer l’ancien pool. Un node pool regroupe des nœuds identiques, que tu mets à jour ou redimensionnes d’un bloc. Tu remplaces les nœuds au lieu de les patcher sur place.'
			},
			{
				add: [
					'you["kubectl drain node-1"] -->|"1. cordon"| n1',
					'you -->|"2. éviction des pods"| pdb["Vérification du PodDisruptionBudget"]',
					'pdb -->|"autorisé"| n3'
				],
				highlight: ['you', 'pdb'],
				note: '`kubectl drain` marque le nœud non planifiable, puis demande à l’**API Eviction** de retirer chaque pod. L’API refuse une éviction qui violerait un PDB, et drain réessaie jusqu’à pouvoir continuer.'
			},
			{
				add: [
					'hpa["HPA : plus de pods"]',
					'ca["Cluster autoscaler : plus de nœuds"]',
					'hpa -.->|"pods en attente, pas de place"| ca',
					'ca -.->|"ajoute un nœud"| newp'
				],
				highlight: ['hpa', 'ca'],
				note: 'Le HPA change le nombre de pods. Quand ces pods ne rentrent sur aucun nœud, ils restent **Pending**, et le cluster autoscaler ajoute un nœud à un pool. Il retire aussi les nœuds sous-utilisés, et il les draine d’abord.'
			}
		]
	},
	example: {
		title: 'content/en/examples/policy/zookeeper-pod-disruption-budget-minavailable.yaml',
		repo: 'kubernetes/website',
		url: `${K8S}/content/en/examples/policy/zookeeper-pod-disruption-budget-minavailable.yaml#L1-L9`,
		lang: 'yaml',
		code: `apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: zk-pdb
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: zookeeper`,
		notes: [
			'Ces neuf lignes protègent un quorum ZooKeeper de trois nœuds. Le `selector` trouve les pods par **label**, comme le fait un Service.',
			'Avec trois replicas, `minAvailable: 2` autorise l’éviction d’**un seul pod à la fois**. La [doc sur le drain](https://kubernetes.io/docs/tasks/administer-cluster/safely-drain-node/) prend exactement ce cas : tu lances plusieurs drains en parallèle, et Kubernetes garde quand même deux pods debout.',
			'Le même fichier existe avec [`maxUnavailable: 1`](https://github.com/kubernetes/website/blob/2f85f2802e59eb2128543dbfbf114ad641db4be0/content/en/examples/policy/zookeeper-pod-disruption-budget-maxunavailable.yaml#L1-L9) à la place. Tu choisis un des deux champs par PDB.',
			'Un PDB ne protège que des interruptions **volontaires** qui passent par l’API Eviction. Un nœud qui perd son alimentation, ou quelqu’un qui lance `kubectl delete pod`, passe à côté.'
		]
	},
	tradeoff: {
		gain: [
			'Tu répètes les mêmes étapes à chaque mise à jour : cordon, drain, remplacement, un nœud à la fois, pendant que les applis restent debout.',
			'Chaque équipe écrit un PDB une fois, et l’équipe cluster peut drainer des nœuds sans demander à tout le monde.',
			'Le HPA et le cluster autoscaler suivent la charge : plus de pods à midi, moins de nœuds la nuit.'
		],
		cost: [
			'Un PDB trop strict (par exemple `minAvailable` égal au nombre de replicas) bloque le drain pour toujours. Quelqu’un doit le voir et le corriger.',
			'Un cluster qui sort des trois versions mineures maintenues ne reçoit plus de correctifs de sécurité, donc tu mets à jour plusieurs fois par an.',
			'Le HPA a besoin d’une source de métriques (en général metrics-server) et de requests CPU sur les pods. Sans ça, il n’a rien à comparer.'
		]
	},
	task: {
		prompt: 'Le control plane et les nœuds de ton cluster sont en 1.30. Tu dois arriver en 1.32. Une API de paiement tourne avec 3 replicas, un worker batch avec 1 replica. Écris le plan de mise à jour, dans l’ordre.',
		hint: 'L’API server peut-il sauter deux versions mineures d’un coup ? Que fait un drain à une appli avec un seul replica, et qu’est-ce qui protège celle à trois replicas ?',
		answer: [
			'Deux tours, **1.30 vers 1.31, puis 1.31 vers 1.32**. L’API server ne doit pas sauter de version mineure. Lis le changelog pour les API supprimées avant chaque tour.',
			'À chaque tour : le control plane d’abord, puis les nœuds. Des kubelets en 1.30 fonctionnent tant que le control plane est en 1.31.',
			'Avant les drains, ajoute un PDB pour l’API de paiement (`minAvailable: 2`), pour qu’un drain ne déplace qu’un seul de ses pods à la fois.',
			'Le worker batch sera arrêté pendant que son pod bouge. Accepte-le, ou passe-le à deux replicas. Un PDB `minAvailable: 1` sur une appli à un replica bloquerait juste le drain.',
			'Nœuds : ajoute un pool à la nouvelle version, `kubectl drain --ignore-daemonsets` sur chaque ancien nœud, vérifie les applis, supprime l’ancien pool.'
		],
		steps: [
			{
				title: 'Planifie le chemin de versions',
				questions: [
					{ q: 'Un collègue dit : « Seule la 1.32 nous intéresse, on peut sauter les notes de la 1.31. » Quel est le risque ?', options: ['Aucun : seule la version cible compte', 'Les notes de la 1.32 répètent tout ce qu’il y a dans la 1.31', 'Une API supprimée en 1.31 casse tes manifests dès le premier tour', 'Les clusters managés ne publient pas de notes pour la 1.31'], answer: 2, why: 'Tu passes par la 1.31 en chemin, et chaque version mineure peut supprimer des API. C’est le changelog de la 1.31 qui te prévient avant le premier tour.' },
					{ q: 'Combien de tours de mise à jour ça fait ?', options: ['Un', 'Deux', 'Trois', 'Un par nœud'], answer: 1, why: 'Deux versions mineures, un tour chacune.' },
					{ q: 'Que lis-tu avant chaque tour ?', options: ['Le changelog, pour les API supprimées', 'Les métriques du HPA', 'La facture du node pool', 'Le PDB de chaque appli'], answer: 0, why: 'Un tour peut supprimer des API que tes manifestes utilisent encore. Trouve-les avant la mise à jour, pas après.' },
					{ q: 'Pourquoi mettre à jour plusieurs fois par an ?', options: ['Les nouvelles versions sont plus rapides', 'Les nœuds ne démarrent plus après un an', 'Le HPA a besoin de la dernière version', 'Seules les trois versions mineures les plus récentes reçoivent des correctifs'], answer: 3, why: 'Un cluster qui sort des trois versions mineures maintenues ne reçoit plus de correctifs de sécurité.' }
				]
			},
			{
				title: 'Ordonne control plane et nœuds',
				questions: [
					{ q: 'Au premier tour, tu ajoutes un nouveau node pool. Quelle version reçoivent ses nœuds ?', options: ['1.32, la cible', '1.31, la version du control plane', '1.30, comme l’ancien pool', 'N’importe laquelle, le kubelet s’adapte'], answer: 1, why: 'Le control plane est en 1.31 au premier tour. Un kubelet en 1.32 serait plus récent que l’API server, ce qui est interdit.' },
					{ q: 'Pourquoi le control plane passe-t-il avant les nœuds à chaque tour ?', options: ['Un kubelet ne doit jamais être plus récent que l’API server', 'Le scheduler ne tourne que sur les nouveaux nœuds', 'Les nœuds se mettent à jour seuls après le control plane', 'etcd refuse les vieux kubelets'], answer: 0, why: 'Les kubelets peuvent être plus vieux que l’API server, jamais plus récents.' },
					{ q: 'Le control plane est en 1.31 et les nœuds en 1.30. Est-ce sûr ?', options: ['Non : toutes les versions doivent correspondre', 'Seulement pendant une heure', 'Oui : un kubelet peut avoir jusqu’à trois versions mineures de retard', 'Seulement si aucun pod ne redémarre avant que les nœuds soient aussi en 1.31'], answer: 2, why: 'Les anciens nœuds continuent de marcher pendant la mise à jour, c’est ce qui te permet d’avancer nœud par nœud.' },
					{ q: 'Quel état ne serait pas supporté ?', options: ['Control plane 1.31, nœuds 1.30', 'Control plane 1.31, nœuds 1.32', 'Control plane 1.32, nœuds 1.31', 'Control plane 1.32, nœuds 1.32'], answer: 1, why: 'Des nœuds plus récents que l’API server cassent la règle. Mettre à jour les nœuds d’abord t’y amènerait.' }
				]
			},
			{
				title: 'Protège les applis',
				questions: [
					{ q: 'Comment le PDB de l’API de paiement trouve-t-il les pods de paiement ?', options: ['Par le nom du Deployment dans `metadata.name`', 'Par le nœud où ils tournent', 'Grâce à `minAvailable`', 'Par son `selector`, qui correspond aux labels des pods'], answer: 3, why: 'Un PDB choisit ses pods par label, comme un Service. Ni son nom ni son budget ne désignent un pod.' },
					{ q: 'Pendant le drain, quelqu’un lance `kubectl delete pod` sur un pod de paiement pour aller plus vite. Le PDB l’arrête-t-il ?', options: ['Non : un delete ne passe pas par l’Eviction API, donc le PDB ne le voit jamais', 'Oui : le PDB bloque toute façon de retirer un pod', 'Oui, mais seulement pendant une mise à jour', 'Seulement si le nœud est cordonné'], answer: 0, why: 'Un PDB ne protège que les perturbations volontaires qui passent par l’Eviction API. `kubectl delete pod` et un nœud qui perd son courant le contournent.' },
					{ q: 'Pourquoi ne pas mettre `minAvailable: 1` sur le worker batch à 1 replica ?', options: ['Les PDB ne marchent que sur des Deployments à 3 pods', 'Il bloquerait le drain pour toujours', 'Il supprimerait le worker', 'Il doublerait les replicas'], answer: 1, why: 'Aucune interruption n’est jamais permise, donc le drain ne peut jamais évincer ce pod.' },
					{ q: 'Quelles sont tes vraies options pour le worker batch ?', options: ['Ajouter un PDB avec `maxUnavailable: 0`', 'Ne pas drainer son nœud', 'Accepter une courte coupure pendant qu’il bouge, ou passer à deux replicas', 'Le supprimer pendant la mise à jour'], answer: 2, why: 'Un seul replica veut dire une coupure quand il bouge. Accepte-la, ou donne-lui une deuxième copie.' }
				]
			},
			{
				title: 'Remplace les nœuds',
				questions: [
					{ q: 'Sur un cluster managé, comment passes-tu les nœuds à la nouvelle version ?', options: ['Patcher chaque nœud sur place en SSH', 'Ajouter un pool à la nouvelle version, déplacer les pods, supprimer l’ancien pool', 'Réinstaller le kubelet sur tous les nœuds d’un coup', 'Attendre que le cluster autoscaler remplace peu à peu les anciens nœuds par des nouveaux'], answer: 1, why: 'Tu remplaces les nœuds au lieu de les patcher. Un node pool se met à jour ou se redimensionne d’un bloc.' },
					{ q: 'Quelle commande vide un ancien nœud ?', options: ['`kubectl delete node`', '`kubectl cordon` seul', '`kubectl uncordon`', '`kubectl drain --ignore-daemonsets`'], answer: 3, why: 'Le drain fait un cordon sur le nœud, puis évince ses pods par l’Eviction API, qui respecte les PDB.' },
					{ q: 'Pourquoi `--ignore-daemonsets` ?', options: ['Les pods de DaemonSet tournent sur chaque nœud, donc les évincer ne les déplacerait pas', 'Il saute les vérifications de PDB pour les pods système, pour que le drain ne bloque jamais dessus', 'Il accélère le drain en supprimant les pods', 'Les DaemonSets bloquent les mises à jour'], answer: 0, why: 'Un DaemonSet garde un pod par nœud. Le drain les laisse, et ils partent avec le nœud.' },
					{ q: 'Après avoir drainé un ancien nœud, que fais-tu avant de supprimer l’ancien pool ?', options: ['Retirer tous les PDB', 'Faire un uncordon sur l’ancien nœud', 'Vérifier que les applis tournent sur les nouveaux nœuds', 'Redémarrer le control plane'], answer: 2, why: 'Vérifie les applis après chaque drain. Ensuite seulement, supprime l’ancien pool.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Que fait `kubectl drain` à un nœud avant d’évincer le moindre pod ?',
			options: [
				'Il redémarre le nœud pour que les pods repartent proprement ailleurs',
				'Il marque le nœud non planifiable (cordon), pour qu’aucun nouveau pod n’y arrive',
				'Il supprime le nœud du cluster pour que le scheduler l’oublie',
				'Il met à jour le kubelet du nœud pour suivre le control plane'
			],
			answer: 1,
			why: 'Drain fait d’abord un cordon sur le nœud, puis évince ses pods. Quand tu as fini, `kubectl uncordon` rend le nœud de nouveau planifiable.'
		},
		{
			q: 'Une appli a 3 replicas et un PDB avec `minAvailable: 2`. Tu drains deux nœuds en parallèle, chacun avec un de ses pods. Que se passe-t-il ?',
			options: [
				'Les deux pods sont évincés d’un coup et l’appli tourne un moment sur un seul pod',
				'Les deux drains échouent tout de suite avec une erreur sur le PDB',
				'Un pod est évincé. L’autre éviction attend qu’un pod de remplacement soit sain',
				'Le PDB est ignoré pendant un drain, donc les deux pods partent d’un coup'
			],
			answer: 2,
			why: 'Seuls replicas moins minAvailable (ici 1) pods peuvent être indisponibles à la fois. L’API Eviction refuse la deuxième éviction tant que l’appli n’a pas retrouvé trois pods sains.'
		},
		{
			q: 'Le HPA demande 10 pods, mais 4 restent `Pending` parce qu’aucun nœud n’a de place. Quel composant règle ça ?',
			options: [
				'Le HPA, en baissant les requests CPU',
				'Le contrôleur de Deployment, en recréant les pods en attente',
				'Le cluster autoscaler, en ajoutant un nœud à un node pool',
				'Le kubelet, en créant plus de mémoire'
			],
			answer: 2,
			why: 'Le HPA ne change que le nombre de pods. Le cluster autoscaler surveille les pods qui ne peuvent pas être planifiés et ajoute des nœuds pour qu’ils rentrent.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Drainer un nœud et voir deux PodDisruptionBudgets à l’œuvre : un qui laisse un pod bouger, un qui bloque le drain pour de bon.',
		steps: [
			'Démarre un cluster local à un nœud avec `minikube start`. Lance une API de paiement à 3 replicas et un worker à 1 replica : `kubectl create deployment pay --image=nginx:1.27 --replicas=3` et `kubectl create deployment batch --image=nginx:1.27`.',
			'Ajoute un PDB à chacun : `kubectl create pdb pay --selector=app=pay --min-available=2` et `kubectl create pdb batch --selector=app=batch --min-available=1`. Puis `kubectl get pdb`.',
			'Draine le nœud, limité à ces deux applis pour que les pods système restent : `kubectl drain $(kubectl get nodes -o name | head -n 1) --ignore-daemonsets --pod-selector="app in (pay,batch)" --timeout=40s`.',
			'Regarde ce qui s’est passé : `kubectl get pods -l "app in (pay,batch)"`, `kubectl get pdb` et `kubectl get nodes`.',
			'Remets le nœud en service : `kubectl uncordon $(kubectl get nodes -o name | head -n 1)`, puis `kubectl get pods -l "app in (pay,batch)"`. Nettoie avec `kubectl delete pdb pay batch && kubectl delete deployment pay batch`.'
		],
		done: [
			'Avant le drain, `kubectl get pdb` montre ALLOWED DISRUPTIONS à `1` pour `pay` et `0` pour `batch`.',
			'Le drain affiche `Cannot evict pod as it would violate the pod\'s disruption budget.`, réessaie, et s’arrête au timeout.',
			'Pendant le drain, un pod `pay` est `Pending`, le nœud montre `Ready,SchedulingDisabled`, et le pod `batch` n’a jamais bougé.',
			'Après `uncordon`, les quatre pods sont `Running`.'
		],
		solution: [
			'`pay` a 3 replicas et `minAvailable: 2`, donc une éviction est permise. Son remplaçant reste `Pending` parce que le seul nœud est en cordon, et le PDB refuse alors l’éviction suivante.',
			'`batch` a 1 replica et `minAvailable: 1` : aucune interruption n’est jamais permise, donc le drain ne peut jamais l’évincer. Sur un vrai cluster, accepte la courte coupure ou passe à deux replicas.',
			'Sur un cluster à plusieurs nœuds, le remplaçant démarrerait sur un autre nœud, et le drain avancerait un pod à la fois.'
		]
	},
	recall: {
		q: 'Dans quel ordre mets-tu à jour un cluster, et qu’est-ce qui empêche un drain d’évincer trop de pods d’une même appli ?',
		a: 'Le control plane d’abord, puis les nœuds, une version mineure par tour. Un PodDisruptionBudget : avec 3 replicas et `minAvailable: 2`, l’API Eviction ne laisse partir qu’un pod à la fois.'
	},
	sources: [
		{ title: 'Doc Kubernetes, Safely drain a node', url: 'https://kubernetes.io/docs/tasks/administer-cluster/safely-drain-node/' },
		{ title: 'Doc Kubernetes, Disruptions', url: 'https://kubernetes.io/docs/concepts/workloads/pods/disruptions/' },
		{ title: 'Doc Kubernetes, Version skew policy', url: 'https://kubernetes.io/releases/version-skew-policy/' },
		{ title: 'Doc Kubernetes, Horizontal Pod Autoscaling', url: 'https://kubernetes.io/docs/concepts/workloads/autoscaling/horizontal-pod-autoscale/' },
		{ title: 'Doc Kubernetes, Node autoscaling', url: 'https://kubernetes.io/docs/concepts/cluster-administration/node-autoscaling/' }
	]
};
