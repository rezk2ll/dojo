const EXAMPLES = 'https://github.com/kubernetes/examples/blob/d6b8cd27eacb51e651a1aa6f7c190a28713eff6e';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'pods-deployments-services',
	part: 'Kubernetes',
	title: 'Pods, Deployments et Services',
	minutes: 10,
	hook: [
		'Sur tes anciens serveurs, l’appli web vivait sur `10.0.3.17`. Tu avais écrit cette IP dans la config du load balancer, et elle est restée vraie pendant des années.',
		'Dans Kubernetes, ce qui fait tourner ton appli est un **Pod**, et les Pods sont jetables. Ils meurent, sont remplacés, et reviennent avec un nouveau nom et une nouvelle IP. Une IP de Pod écrite dans un fichier de config casse au prochain remplacement de ce Pod.',
		'Kubernetes coupe donc le travail en deux. Un Deployment garde le bon nombre de Pods en vie. Un Service leur donne un nom stable, et les trouve par **label**, comme `app: guestbook`, jamais par IP.'
	],
	terms: [
		{ term: 'Pod', def: 'La plus petite chose que Kubernetes fait tourner : un ou plusieurs conteneurs qui partagent réseau et stockage, toujours placés sur le même node.' },
		{ term: 'Deployment', def: 'Gère les ReplicaSets pour toi, et déploie une nouvelle version en créant un nouveau ReplicaSet et en réduisant l’ancien.' },
		{ term: 'Service', def: 'Un nom stable et une IP virtuelle devant un ensemble de Pods qui change. Le type par défaut est `ClusterIP`, joignable seulement depuis le cluster.' },
		{ term: 'Label et selector', def: 'Un label est une clé et une valeur posées sur un objet, comme `app: guestbook`. Un selector est une requête sur les labels, comme « tous les Pods avec `app: guestbook` et `tier: frontend` ».' }
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
				note: 'Trois **Pods**, chacun avec les labels `app: guestbook` et `tier: frontend`. Chacun a sa propre IP. Quand un Pod meurt, son IP disparaît avec lui, et le Pod qui le remplace en reçoit une nouvelle.'
			},
			{
				add: [
					'rs["ReplicaSet frontend-5f4d, replicas 3"]',
					'rs --> p1',
					'rs --> p2',
					'rs --> p3'
				],
				highlight: ['rs'],
				note: 'Un **ReplicaSet** garde un nombre fixé de Pods identiques en marche : il compte les Pods qui correspondent à son selector. Moins de 3 ? Il en crée un. Plus ? Il en supprime un, comme la boucle du contrôleur du chapitre précédent.'
			},
			{
				add: [
					'dep["Deployment frontend"]',
					'dep --> rs'
				],
				highlight: ['dep'],
				note: 'Tu écris le Deployment. Il crée le ReplicaSet à partir de son template de Pod. Change l’image, et il crée un **second ReplicaSet** pour la nouvelle version, puis bascule les Pods. Par défaut, au plus 25 % des Pods sont indisponibles à un instant donné.'
			},
			{
				add: [
					'svc["Service frontend, selector app=guestbook, tier=frontend"]',
					'svc -.-> p1',
					'svc -.-> p2',
					'svc -.-> p3'
				],
				highlight: ['svc'],
				note: 'Le **Service** ne sait pas que le Deployment existe. Il n’a qu’un selector. Kubernetes tient la liste des IP des Pods correspondants, marque ceux qui sont prêts, et la met à jour quand les Pods vont et viennent. Le trafic ne va qu’aux Pods prêts.'
			},
			{
				add: [
					'cli["Autre Pod : curl http://frontend"]',
					'cli --> svc',
					'class cli ext'
				],
				highlight: ['cli'],
				note: 'Les clients utilisent le **nom** du Service, résolu par le DNS du cluster. Quand des Pods sont remplacés, le nom `frontend` ne change pas, seule la liste des IP derrière lui change.'
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
			'Le guestbook est la démo classique de Kubernetes. Les lignes 6 à 9 (`spec.selector`) et 13 à 15 (`spec.template.metadata.labels`) portent **les deux mêmes labels**. Ils doivent correspondre, sinon l’API server refuse le Deployment.',
			'Les lignes 11 à 19, sous `template`, décrivent un Pod écrit en ligne. La ligne 10 demande au Deployment 3 copies de ce Pod. Tu n’écris jamais les Pods toi-même.',
			'Le [Service frontend](https://github.com/kubernetes/examples/blob/d6b8cd27eacb51e651a1aa6f7c190a28713eff6e/web/guestbook/frontend-service.yaml#L14-L18) sélectionne lui aussi `app: guestbook` et `tier: frontend`. Cette paire de labels est le seul lien entre les deux fichiers.',
			'Un selector à deux labels veut dire **les deux**. Le [Deployment Redis](https://github.com/kubernetes/examples/blob/d6b8cd27eacb51e651a1aa6f7c190a28713eff6e/web/guestbook/redis-master-deployment.yaml#L6-L17) de la même appli utilise `app: redis` et `tier: backend`, donc ses Pods ne peuvent jamais se retrouver derrière le Service frontend.'
		]
	},
	tradeoff: {
		gain: [
			'Les Pods peuvent mourir et être remplacés sans que personne ne mette à jour une IP nulle part.',
			'Déployer une nouvelle image, c’est un seul changement sur le Deployment, et l’ancien ReplicaSet est gardé pour revenir en arrière avec `kubectl rollout undo`.',
			'Un Service peut sélectionner les Pods de deux Deployments, et c’est ainsi qu’on construit un canary.'
		],
		cost: [
			'Une faute de frappe dans un selector ne lève aucune erreur. Le Service n’a simplement aucun Pod derrière lui.',
			'Le selector d’un Deployment ne peut pas changer après sa création. Pour le changer, tu supprimes le Deployment et tu le recrées.',
			'Quand le trafic n’arrive pas, tu vérifies trois objets (Deployment, Pods, Service) et les labels qui les relient.'
		]
	},
	task: {
		prompt: 'Ton Service `shop` répond « connection refused » à tout le monde. `kubectl get pods -l app=shop` montre 3 Pods `Running`. `kubectl get endpointslices -l kubernetes.io/service-name=shop` ne montre **aucun endpoint**. Que vérifies-tu, et dans quel ordre ?',
		hint: 'Le Service ne trouve les Pods que par son selector, et n’utilise que les Pods prêts.',
		answer: [
			'Compare le selector du Service (`kubectl get svc shop -o yaml`) aux labels des Pods (`kubectl get pods --show-labels`). Une faute comme `app: shop` contre `app: shopp`, ou une clé en trop dans le selector, donne zéro correspondance.',
			'Un Pod pas prêt apparaît quand même dans l’EndpointSlice, marqué `ready: false`, donc la readiness n’explique pas zéro endpoint. Une fois le selector corrigé, regarde la colonne READY de `kubectl get pods` : un Pod peut être Running sans être **Ready**. Le Service n’envoie aucun trafic à un Pod pas prêt.',
			'Enfin, vérifie que le `targetPort` du Service correspond au port sur lequel le conteneur écoute vraiment.'
		],
		steps: [
			{
				title: 'Lis le symptôme',
				questions: [
					{ q: 'Trois Pods sont `Running`, et pourtant le Service n’a aucun endpoint. Où est la coupure ?', options: ['Dans les conteneurs', 'Dans le DNS du cluster', 'Sur le disque du node', 'Entre le Service et les Pods'], answer: 3, why: 'Les Pods tournent, donc la coupure est dans le lien qui rattache le Service à eux.' },
					{ q: 'Quelle est la seule chose qui relie un Service à ses Pods ?', options: ['Son selector de labels', 'Le nom du Deployment', 'Une liste d’IP de Pods dans le spec du Service', 'Le node où tournent les Pods'], answer: 0, why: 'Un Service ne sait pas que le Deployment existe. Il n’a qu’un selector.' },
					{ q: 'Un selector ne correspond à aucun Pod. Quelle erreur donne Kubernetes ?', options: ['L’API server rejette le Service', 'Les Pods plantent en `CrashLoopBackOff`', 'Aucune : le Service n’a simplement pas de Pods', 'Un avertissement dans `kubectl get pods`'], answer: 2, why: 'Une faute dans un selector ne lève aucune erreur. Le Service a juste zéro endpoint.' },
					{ q: 'La readiness seule peut-elle expliquer **zéro** endpoint ici ?', options: ['Oui : les Pods pas prêts sont retirés de la liste', 'Oui : un Pod Running n’est jamais prêt au début', 'Non : seul le port peut causer ça', 'Non : un Pod pas prêt apparaît quand même, marqué `ready: false`'], answer: 3, why: 'Un Pod pas prêt reste dans l’EndpointSlice avec `ready: false`. Zéro endpoint désigne le selector.' }
				]
			},
			{
				title: 'Compare selector et labels',
				questions: [
					{ q: 'Quelle commande montre le selector du Service ?', options: ['`kubectl get svc shop -o yaml`', '`kubectl logs svc/shop`', '`kubectl get nodes`', '`kubectl rollout status shop`'], answer: 0, why: 'Le YAML complet du Service montre son `spec.selector`.' },
					{ q: 'Quelle commande montre les labels des Pods ?', options: ['`kubectl describe svc shop`', '`kubectl get pods --show-labels`', '`kubectl get endpointslices`', '`kubectl top pods`'], answer: 1, why: '`--show-labels` ajoute une colonne avec tous les labels de chaque Pod.' },
					{ q: 'Le Service sélectionne `app: shop`, les Pods portent `app: shopp`. Combien d’endpoints ?', options: ['Trois, un par Pod', 'Un, le premier Pod trouvé', 'Zéro', 'Trois, mais tous marqués pas prêts'], answer: 2, why: 'Les labels doivent correspondre exactement. Une lettre en trop et plus rien ne correspond.' },
					{ q: 'Le Service sélectionne `app: shop` et `tier: web`. Les Pods n’ont que `app: shop`. Que se passe-t-il ?', options: ['Les Pods correspondent, un label suffit', 'Aucun Pod ne correspond : chaque clé du selector doit correspondre', 'Le Service ajoute `tier: web` aux Pods', 'L’API server rejette le Service'], answer: 1, why: 'Un selector veut dire « chaque Pod qui a tous ces labels ». Une clé en trop dans le selector donne zéro correspondance.' }
				]
			},
			{
				title: 'Vérifie la readiness',
				questions: [
					{ q: 'Le selector correspond maintenant. Quelle colonne montre si chaque Pod est prêt ?', options: ['STATUS', 'RESTARTS', 'AGE', 'READY'], answer: 3, why: 'STATUS peut dire Running alors que READY affiche encore `0/1`.' },
					{ q: 'Un Pod est `Running` mais pas prêt. Le Service lui envoie-t-il du trafic ?', options: ['Non : le trafic ne va qu’aux Pods prêts', 'Oui : Running suffit', 'Oui, mais deux fois moins', 'Seulement depuis le même node'], answer: 0, why: 'Kubernetes marque quels endpoints sont prêts, et le Service n’envoie qu’à ceux-là.' },
					{ q: 'Comment un Pod pas prêt apparaît-il dans l’EndpointSlice ?', options: ['Il n’apparaît pas du tout', 'Avec `ready: false`', 'Avec une nouvelle adresse IP', 'En double'], answer: 1, why: 'Il reste dans la liste, marqué pas prêt, donc tu vois qu’il est sélectionné mais pas utilisé.' },
					{ q: 'Pourquoi vérifier la readiness seulement après le selector ?', options: ['Les checks de readiness sont lents', 'kubectl ne peut pas montrer la readiness avant un correctif', 'Sans correspondance, aucun Pod n’est dans la liste, prêt ou pas', 'La readiness dépend du type de Service'], answer: 2, why: 'Répare d’abord le lien. La readiness ne compte que pour les Pods que le Service sélectionne déjà.' }
				]
			},
			{
				title: 'Vérifie le port en dernier',
				questions: [
					{ q: 'Quel champ du Service doit correspondre au port où écoute le conteneur ?', options: ['`port`', '`targetPort`', '`nodePort`', '`clusterIP`'], answer: 1, why: '`targetPort` est le port du Pod où le Service envoie le trafic.' },
					{ q: 'Les endpoints existent et sont prêts, mais l’appli écoute sur 8080 et `targetPort` vaut 80. Que voient les clients ?', options: ['Le trafic arrive au Pod mais rien ne répond sur 80', 'Le Service choisit le port 8080 pour toi', 'Les endpoints disparaissent', 'Kubernetes rejette le Service'], answer: 0, why: 'Le Service envoie sur le mauvais port. Le Pod est sélectionné et prêt, et personne n’écoute là.' },
					{ q: 'Quel est le bon ordre des vérifications ?', options: ['Port, readiness, selector', 'Readiness, port, selector', 'Selector, port, readiness', 'Selector, readiness, port'], answer: 3, why: 'Zéro endpoint désigne d’abord le selector. Ensuite la readiness décide quels Pods reçoivent du trafic, puis le port.' },
					{ q: 'Les clients appellent `shop` par son nom. Qu’est-ce qui change pour eux quand tu corriges les labels et que les Pods sont remplacés ?', options: ['Ils doivent utiliser les nouvelles IP des Pods', 'Rien : le nom reste, seules les IP derrière changent', 'Ils doivent redémarrer pour rafraîchir le DNS', 'Ils passent à une nouvelle IP de Service'], answer: 1, why: 'Le nom du Service reste stable. Seule la liste des IP de Pods derrière lui change.' }
				]
			}
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
	lab: {
		minutes: 15,
		goal: 'Casser un Service avec une faute d’une lettre dans le selector, voir que rien ne se plaint, puis trouver et corriger.',
		steps: [
			'Démarre un cluster local avec `minikube start`, puis lance trois Pods : `kubectl create deployment shop --image=nginx:1.27 --replicas=3` et `kubectl rollout status deployment shop`.',
			'Crée un Service avec une faute dans son selector : `kubectl expose deployment shop --port=80 --selector=app=shopp`.',
			'Appelle-le depuis le cluster : `kubectl run probe --rm -i --restart=Never --image=busybox:1.36 -- wget -qO- -T 5 http://shop`. Puis regarde `kubectl get endpointslices -l kubernetes.io/service-name=shop`.',
			'Compare les deux côtés : `kubectl get svc shop -o jsonpath=\'{.spec.selector}\'` et `kubectl get pods -l app=shop --show-labels`.',
			'Corrige le selector : `kubectl set selector service shop app=shop`. Attends quelques secondes et relance la même commande `kubectl run probe ...`. Nettoie avec `kubectl delete deployment,service shop`.'
		],
		done: [
			'Avant la correction, l’EndpointSlice montre `<unset>` sous ENDPOINTS et `wget` échoue tout de suite avec `Connection refused`, alors que les trois Pods sont `Running`.',
			'Aucune commande n’a affiché d’erreur sur le selector.',
			'Après la correction, l’EndpointSlice liste trois IP de Pods sur le port 80 et `wget` affiche la page `Welcome to nginx!`.'
		],
		solution: [
			'Le Service sélectionne `{"app":"shopp"}` et les Pods portent `app=shop`. Les labels doivent correspondre exactement, donc le Service a zéro endpoint.',
			'`kubectl set selector` remplace le `spec.selector` du Service. Kubernetes remplit alors l’EndpointSlice avec les Pods correspondants qui sont prêts.',
			'Dans un vrai dépôt, corrige plutôt le fichier YAML dans Git, pour que le prochain `kubectl apply` ne ramène pas la faute.'
		]
	},
	recall: {
		q: 'Un Service sélectionne `app: shop`, et ses Pods portent `app: shopp`. Combien d’endpoints reçoit le Service, et quelle erreur vois-tu ?',
		a: 'Zéro endpoint, et aucune erreur. Un Service ne trouve ses Pods que par son label selector, donc la faute de frappe le laisse sans aucun Pod.'
	},
	sources: [
		{ title: 'Doc Kubernetes, Pods', url: 'https://kubernetes.io/docs/concepts/workloads/pods/' },
		{ title: 'Doc Kubernetes, Deployments', url: 'https://kubernetes.io/docs/concepts/workloads/controllers/deployment/' },
		{ title: 'Doc Kubernetes, Service', url: 'https://kubernetes.io/docs/concepts/services-networking/service/' },
		{ title: 'Doc Kubernetes, Labels and Selectors', url: 'https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/' },
		{ title: 'kubernetes/examples, Guestbook', url: `${EXAMPLES}/web/guestbook/README.md` }
	]
};
