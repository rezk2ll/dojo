const K8S = 'https://github.com/kubernetes/website/blob/2f85f2802e59eb2128543dbfbf114ad641db4be0';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'cluster-management',
	part: 'En production',
	title: 'Gérer un cluster : mettre à jour sans coupure',
	minutes: 10,
	hook: [
		'Tu connais la nuit de patchs. Tu passes un serveur en maintenance, tu bascules son trafic ailleurs, tu lances les mises à jour, tu redémarres, tu le remets en service. Une machine à la fois, pour que le service reste debout.',
		'Un cluster Kubernetes demande le même soin, et souvent : le projet ne maintient que les **trois dernières versions mineures**. Tu vas donc mettre à jour plusieurs fois par an.',
		'La bonne nouvelle : le mode maintenance est intégré. Tu fais un **cordon** sur un nœud, tu le **drain**, et un **PodDisruptionBudget** empêche le drain de tuer trop de copies d’une appli en même temps.'
	],
	terms: [
		{ term: 'Node pool', def: 'Un groupe de nœuds identiques (même type de machine, même version). Les clouds disent node pool ou node group. Tu mets à jour ou redimensionnes un pool d’un bloc.' },
		{ term: 'Cordon', def: 'Marquer un nœud comme non planifiable : aucun nouveau pod n’y arrive. Les pods déjà là continuent de tourner.' },
		{ term: 'Drain', def: 'Faire un cordon sur le nœud, puis évincer ses pods pour qu’ils redémarrent ailleurs. `kubectl drain` attend que chaque pod s’arrête proprement.' },
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
				note: 'L’ordre est fixe : **le control plane d’abord, les nœuds ensuite**. Un kubelet ne doit jamais être plus récent que l’API server. Il peut avoir jusqu’à trois versions mineures de retard, donc les anciens nœuds continuent de marcher pendant l’opération.'
			},
			{
				add: [
					'subgraph newp["Nouveau node pool, nouvelle version"]',
					'n3["node-3"]',
					'end',
					'cp --> n3'
				],
				highlight: ['n3'],
				note: 'Une méthode courante sur les clusters managés : créer un **nouveau node pool** à la nouvelle version, y déplacer les pods, supprimer l’ancien pool. On reconstruit, on ne répare pas. Le bétail, appliqué aux nœuds.'
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
				note: 'Deux autoscalers, deux niveaux. Le **HPA** change le nombre de pods. Quand ces pods ne rentrent pas, ils restent **Pending**, et le **cluster autoscaler** ajoute un nœud à un pool. Il retire aussi les nœuds sous-utilisés, ce qui est aussi un drain.'
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
			'Neuf lignes protègent un quorum ZooKeeper de trois nœuds. Le `selector` trouve les pods par **label**, comme le fait un Service.',
			'`minAvailable: 2` avec trois replicas veut dire **un seul pod à la fois** peut être évincé. La [doc sur le drain](https://kubernetes.io/docs/tasks/administer-cluster/safely-drain-node/) prend exactement ce cas : lance plusieurs drains en parallèle, Kubernetes garde quand même deux pods debout.',
			'Le même fichier existe avec [`maxUnavailable: 1`](https://github.com/kubernetes/website/blob/2f85f2802e59eb2128543dbfbf114ad641db4be0/content/en/examples/policy/zookeeper-pod-disruption-budget-maxunavailable.yaml#L1-L9) à la place. Tu choisis un des deux champs par PDB.',
			'Un PDB ne protège que des interruptions **volontaires** qui passent par l’API Eviction. Un nœud qui perd son alimentation, ou quelqu’un qui lance `kubectl delete pod`, passe à côté.'
		]
	},
	tradeoff: {
		gain: [
			'Les mises à jour deviennent une routine : cordon, drain, remplacement, un nœud à la fois, pendant que les applis restent debout.',
			'Les PDB laissent chaque équipe dire ce que son appli supporte, donc l’équipe cluster peut drainer des nœuds sans demander à tout le monde.',
			'L’autoscaling suit la vraie charge : plus de pods à midi, moins de nœuds la nuit, moins d’argent dépensé.'
		],
		cost: [
			'Un PDB trop strict (par exemple `minAvailable` égal au nombre de replicas) bloque le drain pour toujours. Quelqu’un doit le voir et le corriger.',
			'Il faut mettre à jour souvent. Si tu sors des trois versions mineures maintenues, tu perds les correctifs de sécurité.',
			'Le HPA a besoin d’une source de métriques (en général metrics-server) et de requests CPU sur les pods. Sans ça, il n’a rien à comparer.'
		]
	},
	task: {
		prompt: 'Ton cluster tourne en 1.30, control plane et nœuds. Tu dois arriver en 1.32. Une API de paiement tourne avec 3 replicas, un worker batch avec 1 replica. Écris le plan de mise à jour, dans l’ordre.',
		hint: 'L’API server peut-il sauter deux versions mineures d’un coup ? Que fait un drain à une appli avec un seul replica, et qu’est-ce qui protège celle à trois replicas ?',
		answer: [
			'Deux tours, **1.30 vers 1.31, puis 1.31 vers 1.32**. L’API server ne doit pas sauter de version mineure. Lis le changelog pour les API supprimées avant chaque tour.',
			'À chaque tour : le control plane d’abord, puis les nœuds. Des kubelets en 1.30 vont très bien tant que le control plane est en 1.31.',
			'Avant les drains, ajoute un PDB pour l’API de paiement (`minAvailable: 2`), pour qu’un drain ne déplace qu’un seul de ses pods à la fois.',
			'Le worker batch sera arrêté pendant que son pod bouge. Accepte-le, ou passe-le à deux replicas. Un PDB `minAvailable: 1` sur une appli à un replica bloquerait juste le drain.',
			'Nœuds : ajoute un pool à la nouvelle version, `kubectl drain --ignore-daemonsets` sur chaque ancien nœud, vérifie les applis, supprime l’ancien pool.'
		]
	},
	quiz: [
		{
			q: 'Que fait `kubectl drain` à un nœud avant d’évincer le moindre pod ?',
			options: [
				'Il redémarre le nœud',
				'Il marque le nœud non planifiable (cordon), pour qu’aucun nouveau pod n’y arrive',
				'Il supprime le nœud du cluster',
				'Il met à jour le kubelet du nœud'
			],
			answer: 1,
			why: 'Drain fait d’abord un cordon sur le nœud, puis évince ses pods. Quand tu as fini, `kubectl uncordon` rend le nœud de nouveau planifiable.'
		},
		{
			q: 'Une appli a 3 replicas et un PDB avec `minAvailable: 2`. Tu drains deux nœuds en parallèle, chacun avec un de ses pods. Que se passe-t-il ?',
			options: [
				'Les deux pods sont évincés d’un coup et l’appli tourne sur un seul pod',
				'Les deux drains échouent tout de suite avec une erreur',
				'Un pod est évincé. L’autre éviction attend qu’un pod de remplacement soit sain',
				'Le PDB est ignoré pendant un drain'
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
	takeaway: 'Mets à jour le control plane d’abord, puis remplace les nœuds un par un avec cordon et drain. Un PodDisruptionBudget, c’est la façon dont une appli dit au drain combien elle peut perdre.',
	sources: [
		{ title: 'Doc Kubernetes, Safely drain a node', url: 'https://kubernetes.io/docs/tasks/administer-cluster/safely-drain-node/' },
		{ title: 'Doc Kubernetes, Disruptions', url: 'https://kubernetes.io/docs/concepts/workloads/pods/disruptions/' },
		{ title: 'Doc Kubernetes, Version skew policy', url: 'https://kubernetes.io/releases/version-skew-policy/' },
		{ title: 'Doc Kubernetes, Horizontal Pod Autoscaling', url: 'https://kubernetes.io/docs/concepts/workloads/autoscaling/horizontal-pod-autoscale/' },
		{ title: 'Doc Kubernetes, Node autoscaling', url: 'https://kubernetes.io/docs/concepts/cluster-administration/node-autoscaling/' }
	]
};
