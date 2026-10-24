const EXAMPLES = 'https://github.com/kubernetes/examples/blob/d6b8cd27eacb51e651a1aa6f7c190a28713eff6e';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'ingress-and-storage',
	part: 'Kubernetes',
	title: 'Ingress et stockage persistant',
	minutes: 10,
	hook: [
		'Dans ton ancienne archi, une machine nginx en frontal avait un vhost par site : `shop.example.com` va vers ces backends, `/api` vers ceux-là. Et le serveur de base de données avait un gros disque monté sur `/var/lib/mysql` que personne n’osait toucher.',
		'Kubernetes a les deux, sous forme d’objets. Un Ingress contient les règles d’hôte et de chemin de ce fichier vhost, et envoie le trafic HTTP vers des Services. Il ne fait rien tant qu’un **ingress controller**, un proxy qui tourne dans le cluster, ne le lit pas.',
		'Pour le stockage, un Pod demande « 10 GiB, en lecture écriture » avec un **PersistentVolumeClaim**, et le cluster trouve ou crée un disque pour lui. Le disque survit au Pod, donc les données sont encore là après un redémarrage.'
	],
	terms: [
		{ term: 'Ingress', def: 'Des règles de routage HTTP et HTTPS (hôte, chemin) depuis l’extérieur du cluster vers des Services. Ne fait rien tout seul.' },
		{ term: 'Ingress controller', def: 'Le proxy qui lit les objets Ingress et fait le routage. Tu dois en installer un. Créer un Ingress sans controller n’a aucun effet.' },
		{ term: 'PersistentVolume (PV)', def: 'Un morceau de stockage du cluster (un disque cloud, un partage NFS), avec sa propre vie, indépendante de tout Pod.' },
		{ term: 'PersistentVolumeClaim (PVC)', def: 'Une demande de stockage : une taille et un mode d’accès. Kubernetes la lie à un PV qui correspond.' }
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
				note: 'Le trafic de l’extérieur arrive sur l’**ingress controller**, en général via un load balancer cloud ou un NodePort. Ces Pods font le travail de la machine nginx de ton ancienne archi.'
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
				note: 'L’objet Ingress ne contient que des règles. Le controller le surveille et se configure. Chaque règle pointe vers un **Service**, jamais directement vers des Pods. Le Service choisit ensuite ses Pods avec son label selector.'
			},
			{
				add: [
					'pvc["PVC data, 10Gi, ReadWriteOnce"]',
					'pods --> pvc'
				],
				highlight: ['pvc'],
				note: 'Le spec du Pod nomme un **claim** et jamais un disque. Le claim dit combien de stockage il lui faut et comment il est monté : `ReadWriteOnce` veut dire lecture écriture par un seul node.'
			},
			{
				add: [
					'sc["StorageClass fast"]',
					'pv["PersistentVolume, un disque cloud"]',
					'pvc -->|"lié à"| pv',
					'sc -.->|"crée"| pv'
				],
				highlight: ['sc', 'pv'],
				note: 'Pas de PV qui correspond ? Si le claim nomme une **StorageClass**, un type de stockage comme « SSD rapide », le cluster en crée un. Supprime le claim, et un PV créé ainsi suit la reclaim policy de la classe, `Delete` par défaut. Utilise `Retain` pour les données que tu ne peux pas perdre.'
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
			'Les lignes 8 à 17 contiennent une seule règle, sans `host`, donc elle s’applique à tous les noms d’hôte. Les requêtes sous `/tf` (ligne 11) vont au Service `tf-serving` sur le port 8501 (lignes 15 à 17).',
			'L’annotation de la ligne 6 appartient à Ingress NGINX. Chaque controller ajoute ses propres fonctions par des annotations, donc un Ingress est **moins portable** qu’il n’en a l’air. Ingress NGINX lui-même a été [retiré en mars 2026, sans plus aucun correctif de sécurité](https://kubernetes.io/blog/2025/11/11/ingress-nginx-retirement/).',
			'Le `spec` de la ligne 7 n’a pas d’`ingressClassName`, donc l’IngressClass par défaut du cluster décide quel controller le prend. La doc dit que tu devrais en définir une.',
			'La même appli lit son modèle via un [claim](https://github.com/kubernetes/examples/blob/d6b8cd27eacb51e651a1aa6f7c190a28713eff6e/AI/model-serving-tensorflow/pvc.yaml#L1-L11) lié par son nom à un PV avec `persistentVolumeReclaimPolicy: Retain`. Quelqu’un a créé ce PV à la main : on appelle ça le provisionnement statique.',
			'Pour les bases de données, un **StatefulSet** marche comme un Deployment, mais donne à chaque Pod un nom stable et son propre claim, à partir de `volumeClaimTemplates`. L’[exemple Cassandra](https://github.com/kubernetes/examples/blob/d6b8cd27eacb51e651a1aa6f7c190a28713eff6e/databases/cassandra/cassandra-statefulset.yaml#L95-L107) obtient `cassandra-0`, `cassandra-1`, `cassandra-2`, chacun avec 1Gi. Par défaut, supprimer ou réduire le StatefulSet ne supprime pas ces volumes.'
		]
	},
	tradeoff: {
		gain: [
			'Les règles de routage vivent à côté de l’appli, dans Git, au lieu d’une config de proxy éditée à la main sur une machine.',
			'Les applis demandent du stockage par taille et par classe. Elles n’ont pas besoin de savoir quel disque ou quel cloud est derrière.',
			'Un Pod de base de données replanifié remonte le même volume, avec ses données.'
		],
		cost: [
			'Tu fais tourner et mets à jour l’ingress controller toi-même, et ses annotations t’y attachent. L’API Ingress est gelée et le projet recommande maintenant la **Gateway API**.',
			'`ReadWriteOnce` veut dire un seul node à la fois. Deux réplicas sur deux nodes ne peuvent pas monter le même volume en lecture écriture, donc le stockage limite ta façon de scaler.',
			'La reclaim policy `Delete` par défaut peut effacer un disque quand quelqu’un supprime un claim. Les applis stateful sur Kubernetes ont toujours besoin de sauvegardes.'
		]
	},
	task: {
		prompt: 'Tu appliques un Ingress pour `blog.example.com` qui pointe vers le Service `blog` sur le port 80. `kubectl get ingress` le liste, mais le site ne répond pas. Liste les vérifications, de l’extérieur vers l’intérieur.',
		hint: 'Suis la requête : le DNS, puis ce qui lit les objets Ingress, puis le Service, puis les Pods.',
		answer: [
			'Y a-t-il un ingress controller qui tourne, et prend-il en charge cet Ingress ? Vérifie `ingressClassName` et l’IngressClass par défaut du cluster. Sans controller, personne ne lit l’Ingress.',
			'Est-ce que `blog.example.com` résout vers l’adresse du load balancer du controller (la colonne ADDRESS de `kubectl get ingress`) ?',
			'Le Service `blog` existe-t-il dans le **même namespace** que l’Ingress, avec le port 80 ?',
			'Le Service a-t-il des endpoints prêts ? Sinon, compare le selector du Service aux labels des Pods, puis vérifie les readiness probes.'
		],
		steps: [
			{
				title: 'Vérifie le controller',
				questions: [
					{ q: '`kubectl get ingress` liste ton Ingress. Qu’est-ce que ça prouve ?', options: ['Le trafic arrive aux Pods `blog`', 'L’API server a stocké les règles, rien de plus', 'Le controller a chargé les règles', 'Le DNS pointe vers le cluster'], answer: 1, why: 'Un Ingress n’est qu’un ensemble de règles. Le lister montre que l’objet existe, pas que quelqu’un le lit.' },
					{ q: 'Seul ingress-nginx est installé, et ton Ingress met `ingressClassName: traefik`. Que devient `blog.example.com` ?', options: ['Aucun controller ne prend l’Ingress, donc il n’a aucun effet', 'ingress-nginx le gère quand même', 'L’API server rejette l’Ingress', 'Kubernetes installe Traefik pour toi'], answer: 0, why: 'Un controller ne lit que les Ingress de sa propre classe. Une classe que personne ne gère revient à ne pas avoir de controller : l’ADDRESS reste vide.' },
					{ q: 'Ton Ingress n’a pas d’`ingressClassName`. Quel controller le prend en charge ?', options: ['Tous les controllers du cluster', 'Aucun, jamais', 'Celui fixé par l’IngressClass par défaut du cluster', 'Celui du namespace `default`'], answer: 2, why: 'Sans nom de classe, c’est l’IngressClass par défaut qui décide. La doc dit que tu devrais en définir un.' },
					{ q: 'Pourquoi vérifier le controller avant le DNS ?', options: ['Les enregistrements DNS mettent des heures à se propager, c’est le plus lent à corriger', 'kubectl ne sait pas lire le DNS', 'Le controller choisit le port du Service', 'Sans controller, il n’y a aucune adresse vers laquelle pointer le DNS'], answer: 3, why: 'Le controller est le proxy qui reçoit le trafic. S’il manque, toutes les vérifications suivantes ne servent à rien.' }
				]
			},
			{
				title: 'Vérifie que le nom résout',
				questions: [
					{ q: 'Vers quoi doit pointer `blog.example.com` ?', options: ['Vers une des IP des Pods `blog`', 'Vers l’adresse du load balancer du controller', 'Vers l’API server, qui transmet le HTTP aux Services', 'Vers la ClusterIP du Service'], answer: 1, why: 'Le trafic de l’extérieur arrive d’abord à l’ingress controller, en général par un load balancer cloud ou un NodePort.' },
					{ q: 'Où `kubectl` montre-t-il cette adresse ?', options: ['La colonne ADDRESS de `kubectl get ingress`', 'La colonne STATUS de `kubectl get pods`', '`kubectl get nodes -o wide`', '`kubectl describe svc blog`'], answer: 0, why: 'Une fois qu’un controller prend l’Ingress en charge, il remplit l’adresse que le DNS doit utiliser.' },
					{ q: 'La colonne ADDRESS est vide. Qu’est-ce que ça suggère ?', options: ['Le DNS est faux', 'Les Pods `blog` ne sont pas prêts', 'Aucun controller n’a pris cet Ingress', 'Le port du Service est faux'], answer: 2, why: 'C’est le controller qui écrit cette adresse. Vide, ça renvoie à la première vérification.' },
					{ q: 'Pourquoi ne pas pointer le DNS sur l’IP d’un Pod pour sauter l’Ingress ?', options: ['Les IP de Pods sont toujours publiques', 'Les Pods n’acceptent pas le HTTP', 'Les Pods n’ont pas d’IP', 'Les IP de Pods changent quand les Pods sont remplacés'], answer: 3, why: 'Quand un Pod meurt, son IP part avec lui. Les noms stables vivent sur les Services et le controller devant.' }
				]
			},
			{
				title: 'Vérifie le Service',
				questions: [
					{ q: 'Chaque règle d’Ingress pointe vers quoi ?', options: ['Un Service, jamais directement des Pods', 'Un Deployment', 'Un node et un port', 'Une PersistentVolumeClaim'], answer: 0, why: 'La règle nomme un Service et un port. Le Service choisit ensuite ses Pods avec son selector.' },
					{ q: 'L’Ingress est dans `web` et le Service `blog` dans `default`. La règle marche-t-elle ?', options: ['Oui : un Ingress peut joindre un Service de n’importe quel namespace par son nom', 'Oui, si le port correspond', 'Non : le Service doit être dans le même namespace que l’Ingress', 'Seulement avec une StorageClass'], answer: 2, why: 'Une règle ne nomme le Service que par son nom, et le controller le cherche dans le namespace de l’Ingress.' },
					{ q: 'L’Ingress dit port 80. Que doit-on avoir côté Service ?', options: ['Il doit avoir `type: LoadBalancer`', 'Il doit exposer le port 80', 'Il doit s’appeler `blog-80`', 'Ses Pods doivent tourner sur le port 80 du node'], answer: 1, why: 'La règle envoie au Service sur un port donné. Ce port doit exister sur le Service.' },
					{ q: 'Quelle commande vérifie que le Service existe avec le bon port ?', options: ['`kubectl get svc blog -n <namespace>`', '`kubectl get ingressclass`', '`kubectl get pv`', '`kubectl logs blog`'], answer: 0, why: 'Elle montre le Service dans le namespace de l’Ingress, avec ses ports.' }
				]
			},
			{
				title: 'Vérifie les Pods derrière',
				questions: [
					{ q: 'Le Service existe. Que vérifies-tu ensuite ?', options: ['Le disque du node', 'La StorageClass', 'Le TTL du DNS', 'S’il a des endpoints prêts'], answer: 3, why: 'Un Service sans endpoint prêt n’envoie le trafic nulle part, quoi que dise l’Ingress.' },
					{ q: 'Il n’y a aucun endpoint. Que compares-tu en premier ?', options: ['Le selector du Service avec les labels des Pods', 'Le tag de l’image avec le registry', 'L’hôte de l’Ingress avec le nom du Pod', 'La request avec la limit'], answer: 0, why: 'Un Service ne trouve les Pods que par son selector. Une faute donne zéro endpoint, et aucune erreur.' },
					{ q: 'Des endpoints existent mais aucun n’est prêt. Où regardes-tu ?', options: ['Les annotations de l’ingress', 'Les readiness probes', '`ingressClassName`', 'La reclaim policy'], answer: 1, why: 'Un Pod qui échoue sa readiness ne reçoit aucun trafic de son Service.' },
					{ q: 'Pourquoi aller de l’extérieur vers l’intérieur ?', options: ['C’est l’ordre dans lequel `kubectl get all` affiche les objets d’un namespace', 'Les parties internes ne peuvent pas être vérifiées', 'Chaque vérification dépend de la précédente sur le chemin de la requête', 'Le controller se réinitialise si tu vérifies les Pods d’abord'], answer: 2, why: 'Suis la requête : controller et DNS, puis le Service, puis ses Pods. Une coupure au début cache tout ce qui suit.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Tu crées un objet Ingress dans un cluster sans ingress controller. Qu’arrive-t-il au trafic ?',
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
			q: 'Tu réduis un StatefulSet de 3 réplicas à 1. Qu’arrive-t-il aux volumes de `db-1` et `db-2` ?',
			options: [
				'Ils sont supprimés avec les Pods, puisque chaque claim appartient à son Pod',
				'Ils sont rattachés à `db-0`, pour que le réplica restant garde toutes les données',
				'Ils sont gardés : par défaut, les StatefulSets ne suppriment pas leurs volumes quand on les réduit',
				'Ils sont convertis en ConfigMaps pour que les données survivent sans disque'
			],
			answer: 2,
			why: 'Pour la sécurité des données, réduire ou supprimer un StatefulSet laisse ses PVC et ses volumes en place, sauf si tu règles `persistentVolumeClaimRetentionPolicy` sur `Delete`. Remonte à 3 et `db-1` retrouve ses anciennes données.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Router un nom d’hôte vers un Service via un ingress controller, et voir deux erreurs d’Ingress qui ne lèvent aucune erreur.',
		steps: [
			'Démarre un cluster local avec un ingress controller : `minikube start`, puis `minikube addons enable ingress`. Attends que `kubectl get pods -n ingress-nginx` montre le controller `Running`.',
			'Lance l’appli et son Service : `kubectl create deployment blog --image=nginx:1.27 && kubectl expose deployment blog --port=80`.',
			'Crée un Ingress pour une classe qu’aucun controller ne gère : `kubectl create ingress blog --class=traefik --rule="blog.example.com/*=blog:80"`. Dans un second terminal, ouvre le controller : `kubectl -n ingress-nginx port-forward svc/ingress-nginx-controller 8080:80`. De retour dans le premier, lance `curl -i -H "Host: blog.example.com" localhost:8080` et `kubectl get ingress blog`.',
			'Recrée-le sans classe, pour que l’IngressClass par défaut s’applique : `kubectl delete ingress blog && kubectl create ingress blog --rule="blog.example.com/*=blog:80"`. Attends environ une minute, puis relance le même `curl` et `kubectl get ingress blog`.',
			'Fais pointer un Ingress vers un Service d’un autre namespace : `kubectl create namespace web && kubectl -n web create ingress blog2 --rule="blog2.example.com/*=blog:80"`, puis `curl -i -H "Host: blog2.example.com" localhost:8080` et `kubectl -n web describe ingress blog2`. Nettoie avec `kubectl delete namespace web && kubectl delete ingress,service,deployment blog`.'
		],
		done: [
			'Avec `--class=traefik`, `curl` renvoie `404 Not Found` de nginx et la colonne ADDRESS reste vide.',
			'Sans classe, `kubectl get ingress blog` montre CLASS `nginx` et une ADDRESS, et `curl` renvoie `200 OK` avec `Welcome to nginx!`.',
			'L’Ingress `blog2` dans `web` renvoie `503 Service Temporarily Unavailable`, alors que `kubectl create` l’a accepté.'
		],
		solution: [
			'Un Ingress dont personne ne gère la classe est stocké et jamais lu. Le 404 vient du backend par défaut du controller, et l’ADDRESS vide est l’indice.',
			'`kubectl get ingressclass nginx -o yaml` montre l’annotation `ingressclass.kubernetes.io/is-default-class: "true"`, posée par minikube, donc un Ingress sans classe va vers lui.',
			'Une règle d’Ingress ne peut nommer qu’un Service de son propre namespace. Il n’y a pas de Service `blog` dans `web`, donc le controller ne sait pas où envoyer la requête.'
		]
	},
	recall: {
		q: 'Tu crées un Ingress et un PersistentVolumeClaim. Que doit-il exister dans le cluster pour que chacun ait un effet ?',
		a: 'L’Ingress a besoin d’un ingress controller, un proxy du cluster qui le lit. Le claim a besoin d’un PersistentVolume qui correspond, ou d’une StorageClass à partir de laquelle le cluster en crée un.'
	},
	sources: [
		{ title: 'kubernetes/examples, model-serving-tensorflow/pv.yaml', url: `${EXAMPLES}/AI/model-serving-tensorflow/pv.yaml#L1-L12` },
		{ title: 'Doc Kubernetes, Ingress', url: 'https://kubernetes.io/docs/concepts/services-networking/ingress/' },
		{ title: 'Doc Kubernetes, Ingress Controllers', url: 'https://kubernetes.io/docs/concepts/services-networking/ingress-controllers/' },
		{ title: 'Doc Kubernetes, Gateway API', url: 'https://kubernetes.io/docs/concepts/services-networking/gateway/' },
		{ title: 'Doc Kubernetes, Persistent Volumes', url: 'https://kubernetes.io/docs/concepts/storage/persistent-volumes/' },
		{ title: 'Doc Kubernetes, StatefulSets', url: 'https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/' }
	]
};
