const EXAMPLES = 'https://github.com/kubernetes/examples/blob/d6b8cd27eacb51e651a1aa6f7c190a28713eff6e';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'ingress-and-storage',
	part: 'Kubernetes',
	title: 'Ingress et stockage : entrer depuis l’extérieur, garder les données',
	minutes: 10,
	hook: [
		'Dans ton ancienne archi, une machine nginx en frontal avait un vhost par site : `shop.example.com` va vers ces backends, `/api` vers ceux-là. Et le serveur de base de données avait un gros disque monté sur `/var/lib/mysql` que personne n’osait toucher.',
		'Kubernetes a les deux, sous forme d’objets. Un **Ingress**, c’est ce fichier vhost : des règles d’hôte et de chemin qui envoient le trafic HTTP vers des Services. Mais ce n’est qu’un souhait tant qu’un **ingress controller** (un vrai proxy qui tourne dans le cluster) ne le lit pas.',
		'Le stockage marche pareil. Un Pod demande « 10 GiB, en lecture écriture » avec un **PersistentVolumeClaim**, et le cluster trouve ou crée un disque pour lui. Le disque survit au Pod. C’est comme ça que les données survivent à un redémarrage.'
	],
	terms: [
		{ term: 'Ingress', def: 'Des règles de routage HTTP et HTTPS (hôte, chemin) depuis l’extérieur du cluster vers des Services. Ne fait rien tout seul.' },
		{ term: 'Ingress controller', def: 'Le proxy qui lit les objets Ingress et fait le routage. Tu dois en installer un. Créer un Ingress sans controller n’a aucun effet.' },
		{ term: 'PersistentVolume (PV)', def: 'Un morceau de stockage du cluster (un disque cloud, un partage NFS), avec sa propre vie, indépendante de tout Pod.' },
		{ term: 'PersistentVolumeClaim (PVC)', def: 'Une demande de stockage : une taille et un mode d’accès. Kubernetes la lie à un PV qui correspond.' },
		{ term: 'StorageClass', def: 'Un type de stockage que le cluster sait créer à la demande, comme « SSD rapide ». Un PVC qui le nomme se voit créer un nouveau PV.' },
		{ term: 'StatefulSet', def: 'Comme un Deployment, mais chaque Pod a un nom fixe (`db-0`, `db-1`) et garde son propre PVC.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: [
					'user["Navigateur : shop.example.com/api"]',
					'ic["Pods de l’ingress controller"]',
					'user --> ic',
					'class user ext'
				],
				highlight: ['ic'],
				note: 'Le trafic de l’extérieur arrive sur l’**ingress controller**, en général via un load balancer cloud ou un NodePort. C’est la machine nginx de ton ancienne archi, qui tourne maintenant en Pods.'
			},
			{
				add: [
					'ing["Ingress : host shop.example.com, path /api"]',
					'ing -.->|"lu par"| ic',
					'svc["Service api"]',
					'ic -->|"/api"| svc',
					'pods["Pods api"]',
					'svc --> pods'
				],
				highlight: ['ing', 'svc'],
				note: 'L’objet **Ingress** ne contient que des règles. Le controller le surveille et se configure. Chaque règle pointe vers un **Service**, jamais directement vers des Pods. Les labels et selectors d’hier font toujours le dernier saut.'
			},
			{
				add: [
					'pvc["PVC data, 10Gi, ReadWriteOnce"]',
					'pods --> pvc'
				],
				highlight: ['pvc'],
				note: 'Le spec du Pod nomme un **claim**, pas un disque. Le claim dit combien et comment c’est monté : `ReadWriteOnce` veut dire lecture écriture par un seul node.'
			},
			{
				add: [
					'sc["StorageClass fast"]',
					'pv["PersistentVolume, un disque cloud"]',
					'pvc -->|"lié à"| pv',
					'sc -.->|"crée"| pv'
				],
				highlight: ['sc', 'pv'],
				note: 'Pas de PV qui correspond ? Si le claim nomme une **StorageClass**, le cluster en crée un. Supprime le claim, et un PV créé ainsi suit la reclaim policy de la classe, `Delete` par défaut. Utilise `Retain` pour les données que tu ne peux pas perdre.'
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
			'La règle n’a pas de `host`, donc elle s’applique à tous les noms d’hôte. Les requêtes sous `/tf` vont au Service `tf-serving` sur le port 8501.',
			'L’annotation appartient à Ingress NGINX. Les annotations sont la façon dont chaque controller ajoute ses propres fonctions, donc un Ingress est **moins portable** qu’il n’en a l’air. Et Ingress NGINX lui-même a été [retiré en mars 2026, sans plus aucun correctif de sécurité](https://kubernetes.io/blog/2025/11/11/ingress-nginx-retirement/).',
			'Il n’y a pas d’`ingressClassName`, donc c’est l’IngressClass par défaut du cluster qui décide quel controller le prend. La doc dit que tu devrais en définir une.',
			'La même appli lit son modèle via un [claim](https://github.com/kubernetes/examples/blob/d6b8cd27eacb51e651a1aa6f7c190a28713eff6e/AI/model-serving-tensorflow/pvc.yaml#L1-L11) lié par son nom à un [PV](https://github.com/kubernetes/examples/blob/d6b8cd27eacb51e651a1aa6f7c190a28713eff6e/AI/model-serving-tensorflow/pv.yaml#L1-L12) avec `persistentVolumeReclaimPolicy: Retain` : provisionnement statique, fait à la main.',
			'Pour les bases de données, un **StatefulSet** donne à chaque Pod un nom stable et son propre claim, à partir de `volumeClaimTemplates`. L’[exemple Cassandra](https://github.com/kubernetes/examples/blob/d6b8cd27eacb51e651a1aa6f7c190a28713eff6e/databases/cassandra/cassandra-statefulset.yaml#L95-L107) obtient `cassandra-0`, `cassandra-1`, `cassandra-2`, chacun avec 1Gi. Par défaut, supprimer ou réduire le StatefulSet ne supprime **pas** ces volumes.'
		]
	},
	tradeoff: {
		gain: [
			'Les règles de routage vivent à côté de l’appli, dans Git, au lieu d’une config de proxy éditée à la main sur une machine.',
			'Les applis demandent du stockage par taille et par classe. Elles n’ont pas besoin de savoir quel disque ou quel cloud est derrière.',
			'Les données survivent au Pod : un Pod de base de données replanifié remonte le même volume.'
		],
		cost: [
			'Tu fais tourner et mets à jour l’ingress controller toi-même, et ses annotations t’y attachent. L’API Ingress est gelée et le projet recommande maintenant la **Gateway API**.',
			'`ReadWriteOnce` veut dire un seul node à la fois. Deux réplicas sur deux nodes ne peuvent pas monter le même volume en lecture écriture, donc le stockage limite ta façon de scaler.',
			'La reclaim policy `Delete` par défaut peut effacer un disque quand quelqu’un supprime un claim. Les applis stateful sur Kubernetes demandent toujours des sauvegardes et de l’attention.'
		]
	},
	task: {
		prompt: 'Tu appliques un Ingress pour `blog.example.com` qui pointe vers le Service `blog` sur le port 80. `kubectl get ingress` le liste, mais le site ne répond pas. Liste les vérifications, de l’extérieur vers l’intérieur.',
		hint: 'Suis la requête : le DNS, puis ce qui lit les objets Ingress, puis le Service, puis les Pods.',
		answer: [
			'Y a-t-il un ingress controller qui tourne, et prend-il en charge cet Ingress ? Vérifie `ingressClassName` et l’IngressClass par défaut du cluster. Sans controller, l’Ingress n’est que du texte stocké.',
			'Est-ce que `blog.example.com` résout vers l’adresse du load balancer du controller (la colonne ADDRESS de `kubectl get ingress`) ?',
			'Le Service `blog` existe-t-il dans le **même namespace** que l’Ingress, avec le port 80 ?',
			'Le Service a-t-il des endpoints prêts ? Sinon, c’est le problème de selector ou de readiness d’hier.'
		]
	},
	quiz: [
		{
			q: 'Tu crées un objet Ingress dans un cluster sans ingress controller. Que devient le trafic ?',
			options: [
				'L’API server le route lui-même',
				'Rien : un Ingress n’a aucun effet sans controller',
				'kube-proxy le transforme en NodePort',
				'Le Service devient automatiquement un LoadBalancer'
			],
			answer: 1,
			why: 'Un Ingress n’est qu’un ensemble de règles. La doc le dit : il faut un ingress controller pour satisfaire un Ingress, et créer la ressource seule n’a aucun effet.'
		},
		{
			q: 'À quoi un Pod fait-il référence pour obtenir du stockage persistant ?',
			options: [
				'Un PersistentVolumeClaim',
				'Une StorageClass directement',
				'L’ID du disque cloud',
				'Une ConfigMap avec le chemin de montage'
			],
			answer: 0,
			why: 'Le Pod nomme un claim. Le claim est lié à un PV, qui peut être créé à partir d’une StorageClass. Le Pod n’a jamais besoin de savoir de quel disque il s’agit.'
		},
		{
			q: 'Tu réduis un StatefulSet de 3 réplicas à 1. Que deviennent les volumes de `db-1` et `db-2` ?',
			options: [
				'Ils sont supprimés avec les Pods',
				'Ils sont rattachés à `db-0`',
				'Ils sont gardés : par défaut, les StatefulSets ne suppriment pas leurs volumes quand on les réduit',
				'Ils sont convertis en ConfigMaps'
			],
			answer: 2,
			why: 'Pour la sécurité des données, réduire ou supprimer un StatefulSet laisse ses PVC et ses volumes en place, sauf si tu règles `persistentVolumeClaimRetentionPolicy` sur `Delete`. Remonte à 3 et `db-1` retrouve ses anciennes données.'
		}
	],
	takeaway: 'Un Ingress est un fichier vhost qui a besoin d’un controller pour vouloir dire quelque chose. Un claim demande du stockage, un volume le fournit, et les données survivent au Pod.',
	sources: [
		{ title: 'Doc Kubernetes, Ingress', url: 'https://kubernetes.io/docs/concepts/services-networking/ingress/' },
		{ title: 'Doc Kubernetes, Ingress Controllers', url: 'https://kubernetes.io/docs/concepts/services-networking/ingress-controllers/' },
		{ title: 'Doc Kubernetes, Gateway API', url: 'https://kubernetes.io/docs/concepts/services-networking/gateway/' },
		{ title: 'Doc Kubernetes, Persistent Volumes', url: 'https://kubernetes.io/docs/concepts/storage/persistent-volumes/' },
		{ title: 'Doc Kubernetes, StatefulSets', url: 'https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/' }
	]
};
