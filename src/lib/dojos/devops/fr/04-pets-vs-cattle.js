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
		],
		steps: [
			{
				title: 'Trie les trois machines',
				questions: [
					{ q: 'Laquelle des trois tourne déjà en plus d’un exemplaire ?', options: ['`bob`, le serveur mail', 'Les serveurs web derrière HAProxy', 'Le primaire PostgreSQL', 'Aucune'], answer: 1, why: '`web01` et `web02` sont derrière HAProxy. Les deux autres sont des machines uniques.' },
					{ q: 'Laquelle garde les données que tu ne peux pas perdre ?', options: ['`web01`', '`web02`', 'Le primaire PostgreSQL', 'HAProxy'], answer: 2, why: 'La base garde les données, donc tu ne peux pas simplement la jeter et en démarrer une neuve.' },
					{ q: 'Qu’est-ce qui fait de `bob` le pet par excellence ?', options: ['Il a un nom, c’est une seule machine, et on le répare à la main', 'Il fait tourner le mail', 'Il est derrière HAProxy', 'Il tourne dans un conteneur'], answer: 0, why: 'Un pet a un nom, on le répare à la main, et on le traite comme unique et indispensable.' },
					{ q: 'Quelle question distingue un pet du cattle pour chaque machine ?', options: ['Est-elle dans un cloud public ?', 'Fait-elle tourner des conteneurs ?', 'Tourne-t-elle depuis longtemps ?', 'Pourrais-je la reconstruire depuis un fichier si son disque lâchait ce soir ?'], answer: 3, why: 'Ce qui compte, c’est de pouvoir jeter le serveur et le reconstruire depuis une recette.' }
				]
			},
			{
				title: 'Choisis laquelle convertir',
				questions: [
					{ q: 'Laquelle transformes-tu en cattle ce trimestre ?', options: ['Le primaire PostgreSQL', '`bob`', 'Les serveurs web', 'Les trois d’un coup'], answer: 2, why: 'Ils ne gardent pas de données et tu en as déjà deux, donc en remplacer un n’interrompt rien.' },
					{ q: 'Pourquoi « pas de données sur le serveur » compte-t-il autant ?', options: ['Tu peux supprimer n’importe quel serveur sans perdre de données', 'Un serveur sans données démarre plus vite', 'HAProxy n’accepte que des serveurs vides', 'Ça rend le serveur moins cher'], answer: 0, why: 'Le cattle ne marche que si les données vivent ailleurs : une base, un volume, des logs centralisés.' },
					{ q: 'Qu’est-ce qui s’est accumulé sur des serveurs modifiés à la main comme `web01` ?', options: ['Des réplicas', 'Des versions d’image', 'Des règles de répartiteur de charge', 'De la dérive de configuration : des changements non enregistrés que personne ne sait reconstruire'], answer: 3, why: 'Chaque correction manuelle non reportée dans une recette éloigne le serveur de ce que tu sais reconstruire.' },
					{ q: 'Pourquoi ne pas commencer par PostgreSQL ?', options: ['Il ne se sauvegarde pas', 'Il garde les données, donc le jeter n’est pas encore une option', 'Il est trop récent', 'Les bases n’ont jamais besoin de correctifs'], answer: 1, why: 'Remplacer une machine avec de l’état demande d’abord du travail : sauvegardes testées, réplication ou service managé.' }
				]
			},
			{
				title: 'Dis comment',
				questions: [
					{ q: 'Où va d’abord la configuration des serveurs web ?', options: ['Une page de wiki', 'Une image testée sur `web01`', 'Une recette dans Git', 'Un modèle de ticket'], answer: 2, why: 'Toute la configuration du serveur est écrite sous forme de recette et gardée dans le gestionnaire de versions. Chaque changement passe par là.' },
					{ q: 'Dans quel ordre remplaces-tu les serveurs web ?', options: ['Construire un serveur neuf depuis la recette, le mettre derrière HAProxy, retirer un ancien, recommencer', 'Retirer les deux anciens, puis construire les nouveaux', 'Copier le disque de `web01` sur une nouvelle machine', 'Corriger `web01` et `web02` sur place'], answer: 0, why: 'Un à la fois derrière HAProxy, le site reste debout jusqu’à ce qu’il ne reste aucun serveur web fait à la main.' },
					{ q: 'Une nouvelle image, v43, tourne maintenant sur un des deux serveurs web derrière HAProxy, et les erreurs montent. Comment reviens-tu en arrière ?', options: ['Te connecter en SSH et défaire le changement à la main', 'Corriger v43 sur le serveur en marche', 'Le redémarrer et voir si les erreurs s’arrêtent', 'Remplacer ce serveur par un neuf construit depuis v42, l’image précédente'], answer: 3, why: 'On ne modifie jamais un serveur une fois déployé. Revenir en arrière, c’est le même geste qu’avancer : un serveur neuf depuis l’image qui marchait, mis derrière HAProxy.' },
					{ q: 'Quel est le coût de cette méthode pour une correction d’une ligne ?', options: ['On ne peut pas en faire un rollback', 'Elle passe par build, test et remplacement, donc c’est plus lent', 'Il faut un nouveau répartiteur de charge', 'Il faut un serveur plus gros'], answer: 1, why: 'C’est plus lent pour un seul changement, et ce sont les mêmes étapes à chaque fois.' }
				]
			},
			{
				title: 'Gère les deux autres',
				questions: [
					{ q: 'Que fais-tu pour PostgreSQL ce trimestre ?', options: ['Le remplacer depuis une image', 'Le garder en pet, et t’assurer que les sauvegardes marchent et sont testées', 'Le mettre derrière HAProxy', 'Arrêter de le sauvegarder tant qu’il n’est pas du cattle'], answer: 1, why: 'Il reste un pet pour l’instant. Ce sont les sauvegardes testées qui te sauvent s’il meurt.' },
					{ q: 'Quelles options futures le chapitre donne-t-il pour la base ?', options: ['La réplication, ou un service de base de données managé', 'Plus de RAM', 'Un deuxième HAProxy', 'Modifier sa config à la main avec plus de soin'], answer: 0, why: 'Ces deux options viennent plus tard. D’ici là, ce sont les sauvegardes testées qui te protègent si le primaire meurt.' },
					{ q: 'Que fais-tu pour `bob`, même s’il reste une seule machine ?', options: ['Rien, il marche', 'Le redémarrer chaque semaine', 'Écrire sa configuration sous forme de recette dans Git', 'Le renommer `mail001`'], answer: 2, why: 'Si son disque lâche, tu le reconstruis depuis cette recette.' },
					{ q: 'Quelle règle s’applique aux trois machines ?', options: ['Les redémarrer chaque nuit', 'Leur donner des noms numérotés', 'Les passer dans le cloud', 'Arrêter de modifier les serveurs à la main : les changements passent d’abord par la recette'], answer: 3, why: 'Les modifications à la main sont le début de la dérive, quelle que soit la machine.' }
				]
			}
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
	lab: {
		minutes: 20,
		goal: 'Sentir la différence : perdre une correction faite à la main sur un conteneur pet, puis remplacer des conteneurs cattle construits depuis une recette.',
		steps: [
			'Démarre un pet et corrige-le à la main : `mkdir -p ~/cattle-lab && cd ~/cattle-lab`, puis `docker run -d --name pet -p 8081:80 nginx:1.27-alpine` et `docker exec pet sh -c \'echo hand-edited > /usr/share/nginx/html/index.html\'`. Vérifie avec `curl -s localhost:8081`.',
			'Fais « mourir » le pet et reconstruis-le : `docker rm -f pet && docker run -d --name pet -p 8081:80 nginx:1.27-alpine`, puis `curl -s localhost:8081 | grep -o "Welcome to nginx"`. La correction à la main a disparu.',
			'Écris la recette : `echo \'from the recipe v1\' > index.html`, puis `printf \'FROM nginx:1.27-alpine\\nCOPY index.html /usr/share/nginx/html/index.html\\n\' > Dockerfile`, et `docker build -t web:v1 .`.',
			'Lance deux cattle depuis cette image : `docker run -d --name www001 -p 8082:80 web:v1` et `docker run -d --name www002 -p 8083:80 web:v1`.',
			'Change la recette, pas le serveur : `echo \'from the recipe v2\' > index.html && docker build -t web:v2 .`, puis remplaces-en un : `docker rm -f www001 && docker run -d --name www003 -p 8082:80 web:v2`.',
			'Nettoie : `docker rm -f pet www002 www003 && docker rmi web:v1 web:v2`.'
		],
		done: [
			'Après l’étape 2, `curl -s localhost:8081` affiche la page nginx par défaut, pas `hand-edited`.',
			'`curl -s localhost:8082 localhost:8083` affiche deux fois `from the recipe v1` après l’étape 4.',
			'Après l’étape 5, `curl -s localhost:8082` affiche `from the recipe v2` et `docker ps --filter name=www --format \'{{.Names}} {{.Image}}\'` liste `www003 web:v2` et `www002 web:v1`.'
		],
		solution: [
			'La correction du pet ne vivait que dans le conteneur, comme une modification sur `web01`. Personne ne pouvait la reconstruire.',
			'La correction cattle vit dans `index.html` et le `Dockerfile`, que tu garderais dans Git. N’importe quelle copie se jette et se reconstruit à l’identique.',
			'Refais l’étape 5 pour `www002` pour finir le remplacement progressif. Si la page gardait des fichiers envoyés par les utilisateurs, il faudrait d’abord un volume hors des conteneurs.'
		]
	},
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
