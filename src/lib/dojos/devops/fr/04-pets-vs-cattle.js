const K8S = 'https://github.com/kubernetes/website/blob/2f85f2802e59eb2128543dbfbf114ad641db4be0';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'pets-vs-cattle',
	part: 'L’état d’esprit DevOps',
	title: 'Pets vs cattle : reconstruire plutôt que réparer',
	minutes: 10,
	hook: [
		'Il y a un serveur qui s’appelle `web01`. Il tourne depuis 900 jours. Quatre admins ont modifié son nginx.conf à la main au fil des ans. Personne n’ose le redémarrer, et **personne ne saurait le reconstruire** si son disque lâchait ce soir.',
		'`web01` est un **pet**, un animal de compagnie. Il a un nom, on s’en occupe à la main, et quand il est malade tout le monde lâche ce qu’il fait.',
		'L’autre approche : des serveurs numérotés de `www001` à `www100`, tous construits par la même recette automatisée. Quand l’un d’eux va mal, **tu le jettes et tu en démarres un neuf**. Ça, c’est du **cattle**, du bétail. Aujourd’hui : pourquoi c’est plus sûr, et ce que ça coûte.'
	],
	terms: [
		{ term: 'Pet', def: 'Un serveur traité comme unique et indispensable, construit et réparé à la main. S’il tombe, c’est l’urgence.' },
		{ term: 'Cattle', def: 'Des serveurs construits par automatisation, tous pareils, conçus pour que n’importe lequel puisse tomber ou être remplacé sans que personne ne le remarque.' },
		{ term: 'Snowflake server', def: 'Un serveur dont la configuration est unique et non documentée, résultat d’années de changements manuels. Difficile à reproduire, effrayant à modifier.' },
		{ term: 'Dérive de configuration', def: 'Des changements ponctuels de la configuration d’un serveur que personne n’enregistre. C’est la dérive qui transforme peu à peu un serveur propre en snowflake.' },
		{ term: 'Serveur immuable', def: 'Un serveur qu’on ne modifie jamais une fois déployé. Pour le changer, tu construis une nouvelle image et tu remplaces le serveur.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['you["Toi, en SSH"] -->|"apt upgrade, vim nginx.conf"| pet["web01 : modifié à la main depuis des années"]'],
				highlight: ['pet'],
				note: 'La méthode que tu connais. Chaque correction est raisonnable le jour où tu la fais. Après quelques années, le serveur est un **snowflake** : son état exact n’existe nulle part ailleurs que sur ce disque.'
			},
			{
				add: ['pet -.->|"dérive"| unknown["Personne ne connaît la vraie config"]'],
				highlight: ['unknown'],
				note: '**Dérive de configuration.** Les changements non enregistrés s’accumulent. Impossible de monter une copie de test vraiment identique, et les mises à jour ont des effets de bord que personne ne peut prévoir.'
			},
			{
				add: ['repo["Recette dans Git"] --> image["Image testée v42"]'],
				highlight: ['repo', 'image'],
				note: 'L’approche cattle commence ici. Toute la configuration du serveur est écrite sous forme de recette et gardée dans le gestionnaire de versions. Chaque changement passe par la recette, est testé, et produit une nouvelle image.'
			},
			{
				add: ['image --> w1["www001"]', 'image --> w2["www002"]', 'image --> w3["www003"]'],
				highlight: ['w1', 'w2', 'w3'],
				note: 'Chaque serveur sort de la même image, donc ils sont identiques. Ils ont des numéros, pas des noms. Personne ne se connecte dessus pour les modifier.'
			},
			{
				add: [
					'w2 -.->|"cassé ou obsolète"| w4["www004 depuis l’image v43"]',
					'data[("Données : gardées hors des serveurs")]',
					'w1 --> data',
					'w3 --> data',
					'w4 --> data'
				],
				highlight: ['w4', 'data'],
				note: '**Reconstruire plutôt que réparer.** Un serveur cassé ou obsolète est remplacé par un neuf, construit depuis la dernière image. Ça ne marche que si **les données vivent ailleurs** : une base, un volume, des logs centralisés. Des serveurs jetables, des données durables.'
			}
		]
	},
	example: {
		title: 'content/en/examples/controllers/nginx-deployment.yaml',
		repo: 'kubernetes/website',
		url: `${K8S}/content/en/examples/controllers/nginx-deployment.yaml#L1-L21`,
		lang: 'yaml',
		code: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-deployment
  labels:
    app: nginx
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
      - name: nginx
        image: nginx:1.14.2
        ports:
        - containerPort: 80`,
		notes: [
			'C’est du cattle écrit dans un fichier. Tu apprendras Kubernetes dans la partie 7. Aujourd’hui, lis juste l’idée : `replicas: 3` dit « je veux trois copies identiques », pas « ces trois serveurs-là ».',
			'Le Deployment crée un ReplicaSet, dont le rôle est de maintenir un ensemble stable de Pods répliqués ([doc ReplicaSet](https://kubernetes.io/docs/concepts/workloads/controllers/replicaset/)). Si l’un disparaît, un nouveau est démarré pour revenir à trois. Personne ne répare l’ancien.',
			'Les Pods reçoivent des noms générés comme `nginx-deployment-1564180365-khku8` (tiré de l’exemple de sortie de la doc). Des numéros, pas des noms d’animaux de compagnie.',
			'Pour mettre nginx à jour, tu ne te connectes nulle part. Tu changes `image: nginx:1.14.2` en `nginx:1.16.1`. Kubernetes crée un **nouveau** ReplicaSet, le monte à 3 et descend l’ancien à 0 ([doc Deployment](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)). Les anciens Pods sont remplacés, jamais modifiés : c’est l’infrastructure immuable.'
		]
	},
	tradeoff: {
		gain: [
			'Perdre un serveur n’est plus un événement. Le remplacer est une routine, pas un week-end d’archéologie.',
			'Pas de dérive : test et prod sortent de la même recette, donc « ça marche en staging » veut dire quelque chose.',
			'Chaque changement est dans le gestionnaire de versions : tu peux le relire, l’auditer et en faire un rollback.'
		],
		cost: [
			'Il faut d’abord construire l’automatisation : recettes, images, un moyen de remplacer les serveurs. C’est un vrai travail avant le moindre bénéfice.',
			'Les données et l’état doivent quitter les serveurs (bases, volumes, logs centralisés). Certaines vieilles applis supposent un disque local et résistent.',
			'Une correction d’une ligne passe maintenant par build, test et remplacement. Plus lent pour un changement, mais identique à chaque fois.'
		]
	},
	task: {
		prompt: 'Tu gères trois choses aujourd’hui : `bob`, le serveur mail de la boîte (une seule machine), `web01` et `web02` derrière HAProxy, et un unique primaire PostgreSQL. Tu peux en transformer **un seul** en cattle ce trimestre. Lequel, comment, et que fais-tu des deux autres ?',
		hint: 'Commence là où il n’y a pas d’état sur le serveur et déjà plus d’une copie. Puis, pour chaque machine restante, demande-toi : « pourrais-je la reconstruire depuis un fichier si son disque lâchait ce soir ? »',
		answer: [
			'**Les serveurs web d’abord.** Ils ne gardent pas de données et tu en as déjà deux. Écris leur configuration sous forme de recette dans Git, construis un nouveau serveur à partir d’elle, mets-le derrière HAProxy, retire un ancien. Recommence jusqu’à ce qu’il ne reste aucun serveur web fait à la main.',
			'**PostgreSQL** garde les données, donc on ne peut pas simplement le jeter. Garde-le en pet pour l’instant, mais assure-toi que les sauvegardes marchent et sont testées. Plus tard : réplication, ou un service de base de données managé.',
			'**bob** est le pet par excellence. Même s’il reste une seule machine, écris sa configuration sous forme de recette dans Git. Le reconstruire devient alors un plan, pas un espoir.',
			'Dans les trois cas, arrête de modifier les serveurs à la main. Les changements passent d’abord par la recette.'
		]
	},
	quiz: [
		{
			q: 'Qu’est-ce qui fait d’un serveur du « cattle » plutôt qu’un « pet » ?',
			options: [
				'Il tourne dans un cloud public',
				'Il est construit par automatisation et peut être détruit et remplacé à tout moment sans drame',
				'Il a plus d’une interface réseau',
				'Il fait tourner des conteneurs au lieu de paquets système'
			],
			answer: 1,
			why: 'La frontière, c’est le caractère jetable, pas l’endroit ni la technologie. Une VM cloud modifiée à la main reste un pet. Un serveur physique construit depuis une recette peut être du cattle.'
		},
		{
			q: 'Qu’est-ce que la dérive de configuration ?',
			options: [
				'Le temps entre un commit et un déploiement',
				'L’horloge d’un serveur qui perd peu à peu sa précision',
				'Des changements ponctuels non enregistrés qui font qu’un serveur s’écarte de sa configuration connue',
				'Le déplacement d’une VM d’un hôte à un autre'
			],
			answer: 2,
			why: 'Chaque correction manuelle qui n’est pas reportée dans la recette éloigne un peu plus le serveur de ce que quelqu’un sait reconstruire.'
		},
		{
			q: 'Tes serveurs web sont immuables. Un correctif de sécurité pour nginx sort. Que fais-tu ?',
			options: [
				'Construire une nouvelle image avec le correctif, la tester, puis remplacer les serveurs en marche par des neufs',
				'Te connecter en SSH sur chaque serveur et lancer la mise à jour du paquet',
				'Corriger un serveur à la main, puis copier son disque sur les autres',
				'Attendre le prochain redémarrage prévu pour l’appliquer'
			],
			answer: 0,
			why: 'Immuable veut dire que tu ne modifies jamais un serveur en marche. La correction va dans l’image, et les serveurs construits depuis l’ancienne image sont remplacés.'
		}
	],
	takeaway: 'Traite les serveurs comme des copies remplaçables construites depuis une recette dans Git. Quand l’un est cassé ou obsolète, reconstruis-le au lieu de le réparer, et garde les données ailleurs.',
	sources: [
		{ title: 'Randy Bias, The History of Pets vs Cattle and How to Use the Analogy Properly', url: 'https://cloudscaling.com/blog/cloud-computing/the-history-of-pets-vs-cattle/' },
		{ title: 'Martin Fowler, SnowflakeServer', url: 'https://martinfowler.com/bliki/SnowflakeServer.html' },
		{ title: 'Martin Fowler, PhoenixServer', url: 'https://martinfowler.com/bliki/PhoenixServer.html' },
		{ title: 'Kief Morris, ImmutableServer', url: 'https://martinfowler.com/bliki/ImmutableServer.html' },
		{ title: 'Doc Kubernetes, Deployments', url: 'https://kubernetes.io/docs/concepts/workloads/controllers/deployment/' }
	]
};
