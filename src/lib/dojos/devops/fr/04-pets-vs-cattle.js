const K8S = 'https://github.com/kubernetes/website/blob/2f85f2802e59eb2128543dbfbf114ad641db4be0';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'pets-vs-cattle',
	part: 'L’état d’esprit DevOps',
	title: 'Pets vs cattle : remplacer les serveurs au lieu de les réparer',
	minutes: 10,
	hook: [
		'Il y a un serveur qui s’appelle `web01`. Il tourne depuis 900 jours. Quatre admins ont modifié son nginx.conf à la main au fil des ans. Personne n’ose le redémarrer, et **personne ne saurait le reconstruire** si son disque lâchait ce soir.',
		'`web01` est un pet, un animal de compagnie. Il a un nom, on le répare à la main, et quand il est malade tout le monde lâche ce qu’il fait.',
		'L’autre approche : des serveurs numérotés de `www001` à `www100`, tous construits par la même recette automatisée. Quand l’un d’eux va mal, **tu le jettes et tu en démarres un neuf**. Ces serveurs-là sont du cattle, du bétail.'
	],
	terms: [
		{ term: 'Pet', def: 'Un serveur traité comme unique et indispensable, construit et réparé à la main. Quand il tombe, l’équipe lâche tout pour le sauver.' },
		{ term: 'Cattle', def: 'Des serveurs construits par automatisation, tous pareils, conçus pour que n’importe lequel puisse tomber ou être remplacé sans que personne ne le remarque.' },
		{ term: 'Dérive de configuration', def: 'Des changements ponctuels de la configuration d’un serveur que personne n’enregistre. Au bout d’un moment, plus personne ne sait reconstruire le serveur.' },
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
				note: 'Les changements non enregistrés s’accumulent : on appelle ça la dérive de configuration. Tu ne peux pas monter une copie de test vraiment identique, et personne ne peut prévoir les effets de bord d’une mise à jour.'
			},
			{
				add: ['repo["Recette dans Git"] --> image["Image testée v42"]'],
				highlight: ['repo', 'image'],
				note: 'L’approche cattle commence ici. Toute la configuration du serveur est écrite sous forme de recette et gardée dans le gestionnaire de versions. Chaque changement passe par la recette, est testé, et produit une nouvelle image.'
			},
			{
				add: ['image --> w1["www001"]', 'image --> w2["www002"]', 'image --> w3["www003"]'],
				highlight: ['w1', 'w2', 'w3'],
				note: 'Chaque serveur sort de la même image, donc ils sont identiques. Ils s’appellent `www001`, `www002`, `www003`. Personne ne se connecte dessus pour les modifier.'
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
				note: 'Un serveur cassé ou obsolète est remplacé par un neuf, construit depuis la dernière image : ici `www004`, depuis la v43. Ça ne marche que si **les données vivent ailleurs** : une base, un volume, des logs centralisés. Tu peux alors supprimer n’importe quel serveur sans perdre de données.'
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
			'Ce fichier décrit du cattle. Tu apprendras Kubernetes dans la partie 7. La ligne 8, `replicas: 3`, demande trois copies identiques sans nommer aucun serveur.',
			'Le Deployment crée un ReplicaSet, dont le rôle est de maintenir un ensemble stable de Pods répliqués ([doc ReplicaSet](https://kubernetes.io/docs/concepts/workloads/controllers/replicaset/)). Si l’un disparaît, un nouveau est démarré pour revenir à trois. Personne ne répare l’ancien.',
			'Les Pods reçoivent des noms générés comme `nginx-deployment-1564180365-khku8` (tiré de l’exemple de sortie de la doc). Personne ne choisit ces noms.',
			'Pour mettre nginx à jour, tu ne te connectes nulle part. Tu changes la ligne 19, de `image: nginx:1.14.2` à `nginx:1.16.1`. Kubernetes crée un **nouveau** ReplicaSet, le monte à 3 et descend l’ancien à 0 ([doc Deployment](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)). Les anciens Pods sont remplacés et jamais modifiés : c’est le sens d’infrastructure immuable.'
		]
	},
	tradeoff: {
		gain: [
			'Quand un serveur meurt, tu en démarres un neuf depuis la même recette. Personne ne passe un week-end à retrouver comment l’ancien était configuré.',
			'Test et prod sortent de la même recette, donc « ça marche en staging » veut dire quelque chose.',
			'Chaque changement est dans le gestionnaire de versions : tu peux le relire, l’auditer et en faire un rollback.'
		],
		cost: [
			'Il faut d’abord construire l’automatisation : recettes, images, un moyen de remplacer les serveurs. Tu fais ce travail avant d’en tirer le moindre bénéfice.',
			'Les données et l’état doivent quitter les serveurs (bases, volumes, logs centralisés). Certaines vieilles applis supposent un disque local et résistent.',
			'Une correction d’une ligne passe par build, test et remplacement. C’est plus lent pour un seul changement, et ce sont les mêmes étapes à chaque fois.'
		]
	},
	task: {
		prompt: 'Tu gères trois choses aujourd’hui : `bob`, le serveur mail de la boîte (une seule machine), `web01` et `web02` derrière HAProxy, et un unique primaire PostgreSQL. Tu peux en transformer **un seul** en cattle ce trimestre. Lequel, comment, et que fais-tu des deux autres ?',
		hint: 'Commence là où il n’y a pas d’état sur le serveur et déjà plus d’une copie. Puis, pour chaque machine restante, demande-toi : « pourrais-je la reconstruire depuis un fichier si son disque lâchait ce soir ? »',
		answer: [
			'Les serveurs web d’abord : ils ne gardent pas de données et tu en as déjà deux. Écris leur configuration sous forme de recette dans Git, construis un nouveau serveur à partir d’elle, mets-le derrière HAProxy, retire un ancien. Recommence jusqu’à ce qu’il ne reste aucun serveur web fait à la main.',
			'PostgreSQL : il garde les données, donc tu ne peux pas simplement le jeter. Garde-le en pet pour l’instant, mais assure-toi que les sauvegardes marchent et sont testées. Plus tard : réplication, ou un service de base de données managé.',
			'`bob` est le pet par excellence. Même s’il reste une seule machine, écris sa configuration sous forme de recette dans Git. Si son disque lâche, tu le reconstruis depuis cette recette.',
			'Dans les trois cas, arrête de modifier les serveurs à la main. Les changements passent d’abord par la recette.'
		]
	},
	quiz: [
		{
			q: 'Qu’est-ce qui fait d’un serveur du « cattle » plutôt qu’un « pet » ?',
			options: [
				'Il tourne dans un cloud public, où chaque VM se loue ou se libère à la demande',
				'Il est construit par automatisation et peut être détruit et remplacé à tout moment',
				'Il a plus d’une interface réseau, donc le trafic peut basculer sur une autre',
				'Il fait tourner des conteneurs au lieu de paquets système, donc rien n’est installé à la main'
			],
			answer: 1,
			why: 'Ce qui compte, c’est de pouvoir jeter le serveur et le reconstruire. Une VM cloud modifiée à la main reste un pet. Un serveur physique construit depuis une recette peut être du cattle.'
		},
		{
			q: 'Qu’est-ce que la dérive de configuration ?',
			options: [
				'Le temps entre un commit et son déploiement, qui grandit quand les pipelines sont lents',
				'L’horloge d’un serveur qui perd peu à peu sa précision, jusqu’à fausser certificats et logs',
				'Des changements ponctuels non enregistrés qui font qu’un serveur s’écarte de sa configuration connue',
				'Le déplacement d’une VM d’un hôte à un autre pendant qu’elle continue de tourner'
			],
			answer: 2,
			why: 'Chaque correction manuelle qui n’est pas reportée dans la recette éloigne un peu plus le serveur de ce que quelqu’un sait reconstruire.'
		},
		{
			q: 'Tes serveurs web sont immuables. Un correctif de sécurité pour nginx sort. Que fais-tu ?',
			options: [
				'Construire une nouvelle image avec le correctif, la tester, puis remplacer les serveurs en marche',
				'Te connecter en SSH sur chaque serveur, lancer la mise à jour du paquet, puis redémarrer nginx',
				'Corriger un serveur à la main, le tester, puis copier son image disque sur tous les autres',
				'Attendre le prochain redémarrage prévu, quand les serveurs récupèrent le correctif tout seuls'
			],
			answer: 0,
			why: 'Personne ne modifie un serveur immuable une fois lancé. La correction va dans l’image, et les serveurs construits depuis l’ancienne image sont remplacés.'
		}
	],
	recall: {
		q: 'Qu’est-ce qui fait d’un serveur du cattle, et où doivent vivre ses données pour que tu puisses le remplacer ?',
		a: 'Il est construit par automatisation depuis une recette dans Git, et tu peux le détruire et le remplacer à tout moment. Ses données vivent hors de lui : une base, un volume, des logs centralisés.'
	},
	sources: [
		{ title: 'Randy Bias, The History of Pets vs Cattle and How to Use the Analogy Properly', url: 'https://cloudscaling.com/blog/cloud-computing/the-history-of-pets-vs-cattle/' },
		{ title: 'Martin Fowler, SnowflakeServer', url: 'https://martinfowler.com/bliki/SnowflakeServer.html' },
		{ title: 'Martin Fowler, PhoenixServer', url: 'https://martinfowler.com/bliki/PhoenixServer.html' },
		{ title: 'Kief Morris, ImmutableServer', url: 'https://martinfowler.com/bliki/ImmutableServer.html' },
		{ title: 'Doc Kubernetes, Deployments', url: 'https://kubernetes.io/docs/concepts/workloads/controllers/deployment/' }
	]
};
