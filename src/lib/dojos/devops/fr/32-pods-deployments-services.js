const EXAMPLES = 'https://github.com/kubernetes/examples/blob/d6b8cd27eacb51e651a1aa6f7c190a28713eff6e';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'pods-deployments-services',
	part: 'Kubernetes',
	title: 'Pods, Deployments et Services',
	minutes: 10,
	hook: [
		'Sur tes anciens serveurs, l’appli web vivait sur `10.0.3.17`. Tu avais écrit cette IP dans la config du load balancer, et elle est restée vraie pendant des années.',
		'Dans Kubernetes, ce qui fait tourner ton appli est un **Pod**, et les Pods sont jetables. Ils meurent, sont remplacés, et reviennent avec un nouveau nom et une nouvelle IP. Écrire une IP de Pod quelque part, c’est un bug qui attend son heure.',
		'Alors Kubernetes coupe le travail en deux. Un **Deployment** garde le bon nombre de Pods en vie. Un **Service** leur donne un nom stable. Et la colle entre les deux n’est pas une IP. C’est un **label**.'
	],
	terms: [
		{ term: 'Pod', def: 'La plus petite chose que Kubernetes fait tourner : un ou plusieurs conteneurs qui partagent réseau et stockage, toujours placés sur le même node.' },
		{ term: 'ReplicaSet', def: 'Garde un nombre fixé de Pods identiques en marche. Tu y touches rarement toi-même.' },
		{ term: 'Deployment', def: 'Gère les ReplicaSets pour toi, et déploie une nouvelle version en créant un nouveau ReplicaSet et en réduisant l’ancien.' },
		{ term: 'Service', def: 'Un nom stable et une IP virtuelle devant un ensemble de Pods qui change. Le type par défaut est `ClusterIP`, joignable seulement depuis le cluster.' },
		{ term: 'Label', def: 'Une clé et une valeur collées sur un objet, comme `app: guestbook`. Libre, et fait pour toi.' },
		{ term: 'Selector', def: 'Une requête sur les labels, comme « tous les Pods avec `app: guestbook` et `tier: frontend` ». C’est ainsi qu’un objet en trouve d’autres.' }
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
				note: 'Trois **Pods**, chacun avec les labels `app: guestbook` et `tier: frontend`. Chacun a sa propre IP. S’il meurt, son IP meurt avec lui.'
			},
			{
				add: [
					'rs["ReplicaSet frontend-5f4d, replicas 3"]',
					'rs --> p1',
					'rs --> p2',
					'rs --> p3'
				],
				highlight: ['rs'],
				note: 'Un **ReplicaSet** compte les Pods qui correspondent à son selector. Moins de 3 ? Il en crée un. Plus ? Il en supprime un. C’est la boucle de contrôle d’hier.'
			},
			{
				add: [
					'dep["Deployment frontend"]',
					'dep --> rs'
				],
				highlight: ['dep'],
				note: 'C’est toi qui écris le **Deployment**. Il crée le ReplicaSet à partir de son template de Pod. Change l’image, et il crée un **second ReplicaSet** pour la nouvelle version, puis bascule les Pods. Par défaut, au plus 25 % des Pods sont indisponibles à un instant donné.'
			},
			{
				add: [
					'svc["Service frontend, selector app=guestbook, tier=frontend"]',
					'svc -.-> p1',
					'svc -.-> p2',
					'svc -.-> p3'
				],
				highlight: ['svc'],
				note: 'Le **Service** ne sait pas que le Deployment existe. Il n’a qu’un **selector**. Kubernetes tient la liste des IP des Pods correspondants, marque ceux qui sont prêts, et la met à jour quand les Pods vont et viennent. Le trafic ne va qu’aux Pods prêts.'
			},
			{
				add: [
					'cli["Autre Pod : curl http://frontend"]',
					'cli --> svc',
					'class cli ext'
				],
				highlight: ['cli'],
				note: 'Les clients utilisent le **nom** du Service, résolu par le DNS du cluster. Les Pods peuvent être remplacés toute la journée : le nom reste, seule la liste derrière change.'
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
			'Le guestbook est la démo classique de Kubernetes. `spec.selector` et `spec.template.metadata.labels` portent **les deux mêmes labels**. Ils doivent correspondre, sinon l’API server refuse le Deployment.',
			'`template` est un Pod, écrit en ligne. Le Deployment en produit 3 copies. Tu n’écris jamais les Pods toi-même.',
			'Le [Service frontend](https://github.com/kubernetes/examples/blob/d6b8cd27eacb51e651a1aa6f7c190a28713eff6e/web/guestbook/frontend-service.yaml#L14-L18) sélectionne lui aussi `app: guestbook` et `tier: frontend`. Cette paire de labels est le seul lien entre les deux fichiers.',
			'Un selector à deux labels veut dire **les deux**. Le [Deployment Redis](https://github.com/kubernetes/examples/blob/d6b8cd27eacb51e651a1aa6f7c190a28713eff6e/web/guestbook/redis-master-deployment.yaml#L6-L17) de la même appli utilise `app: redis` et `tier: backend`, donc ses Pods ne peuvent jamais se retrouver derrière le Service frontend.'
		]
	},
	tradeoff: {
		gain: [
			'Les Pods peuvent mourir et être remplacés sans que personne ne mette à jour une IP nulle part.',
			'Déployer une nouvelle image, c’est un seul changement sur le Deployment, et l’ancien ReplicaSet est gardé pour revenir en arrière avec `kubectl rollout undo`.',
			'Les labels sont souples : un Service peut couvrir les Pods de deux Deployments, c’est comme ça qu’on construit un canary.'
		],
		cost: [
			'Les labels sont une colle lâche. Une faute de frappe dans un selector échoue en silence : le Service n’a simplement aucun Pod derrière.',
			'Le selector d’un Deployment ne peut pas changer après sa création. Prévois tes labels dès le départ, ou supprime et recrée.',
			'Trois objets pour une appli web, plus les couches entre eux, ça fait plus d’endroits où chercher quand le trafic n’arrive pas.'
		]
	},
	task: {
		prompt: 'Ton Service `shop` répond « connection refused » à tout le monde. `kubectl get pods -l app=shop` montre 3 Pods `Running`. `kubectl get endpointslices -l kubernetes.io/service-name=shop` ne montre **aucun endpoint**. Que vérifies-tu, et dans quel ordre ?',
		hint: 'Le Service ne trouve les Pods que par son selector, et n’utilise que les Pods prêts.',
		answer: [
			'Compare le selector du Service (`kubectl get svc shop -o yaml`) aux labels des Pods (`kubectl get pods --show-labels`). Une faute comme `app: shop` contre `app: shopp`, ou une clé en trop dans le selector, donne zéro correspondance.',
			'La readiness n’est pas la cause ici : un Pod pas prêt apparaît quand même dans l’EndpointSlice, marqué `ready: false`. Une fois le selector corrigé, vérifie que les Pods sont **Ready** (la colonne READY), pas seulement Running. Les Pods pas prêts ne reçoivent pas de trafic.',
			'Enfin, vérifie que le `targetPort` du Service correspond au port sur lequel le conteneur écoute vraiment.'
		]
	},
	quiz: [
		{
			q: 'Comment un Service décide-t-il quels Pods reçoivent son trafic ?',
			options: [
				'Il envoie à tous les Pods créés par le Deployment du même nom',
				'Avec un label selector, vers les Pods correspondants et prêts',
				'Tu listes les IP des Pods dans le spec du Service',
				'Il demande au scheduler quels Pods sont sur quel node'
			],
			answer: 1,
			why: 'Un Service n’a qu’un selector. Kubernetes tient sa liste d’endpoints à jour avec les Pods correspondants, et n’envoie le trafic qu’à ceux qui sont prêts.'
		},
		{
			q: 'Tu changes l’image du conteneur dans un Deployment. Que se passe-t-il ?',
			options: [
				'Les Pods existants sont modifiés sur place avec la nouvelle image',
				'Rien ne se passe tant que tu ne supprimes pas les Pods à la main',
				'Un nouveau ReplicaSet grandit pendant que l’ancien est réduit',
				'Le Service est recréé avec une nouvelle IP pour les nouveaux Pods'
			],
			answer: 2,
			why: 'Changer le template de Pod déclenche un rollout : un nouveau ReplicaSet pour le nouveau template, l’ancien réduit. L’ancien ReplicaSet est gardé, et c’est ce qui rend le rollback possible.'
		},
		{
			q: 'Quel est le type par défaut d’un Service quand tu ne mets pas `type` ?',
			options: ['`NodePort`', '`LoadBalancer`', '`ClusterIP`', '`ExternalName`'],
			answer: 2,
			why: '`ClusterIP` est le défaut : une IP virtuelle joignable seulement depuis le cluster. `NodePort` et `LoadBalancer` s’appuient dessus pour atteindre l’extérieur.'
		}
	],
	takeaway: 'Les Pods vont et viennent. Un Deployment garde le bon nombre, un Service garde le nom stable, et les labels sont la seule chose qui les relie.',
	sources: [
		{ title: 'Doc Kubernetes, Pods', url: 'https://kubernetes.io/docs/concepts/workloads/pods/' },
		{ title: 'Doc Kubernetes, Deployments', url: 'https://kubernetes.io/docs/concepts/workloads/controllers/deployment/' },
		{ title: 'Doc Kubernetes, Service', url: 'https://kubernetes.io/docs/concepts/services-networking/service/' },
		{ title: 'Doc Kubernetes, Labels and Selectors', url: 'https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/' },
		{ title: 'kubernetes/examples, Guestbook', url: `${EXAMPLES}/web/guestbook/README.md` }
	]
};
