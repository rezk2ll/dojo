const REPO = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'containers',
	part: 'Voir le système',
	title: 'Les conteneurs : ce qui tourne vraiment',
	minutes: 10,
	hook: [
		'Hier, le diagramme de contexte dessinait le serveur Mastodon en une seule boîte. Maintenant quelqu’un te demande : « si je te donne une nouvelle machine pour lui, tu installes quoi ? » Le diagramme de contexte ne sait pas répondre. Il faut ouvrir la boîte.',
		'Le niveau 2 de C4 fait exactement ça. Dans la boîte du système, tu dessines les **conteneurs** : chaque chose qui doit tourner pour que le système marche. Un processus serveur, une base de données, une appli qui tourne dans le navigateur, un worker en arrière-plan.',
		'Ici, « conteneur » ne veut **pas** dire Docker. Simon Brown a choisi ce mot pour qu’il ne dise rien de la manière dont la chose tourne. Il désigne une **frontière d’exécution** : un processus ou un stockage de données séparé, quelque chose que tu démarres, arrêtes, déploies et surveilles indépendamment. Mastodon rend la différence facile à voir : une seule image Docker dans son `docker-compose.yml` tourne comme **deux** conteneurs.'
	],
	terms: [
		{ term: 'Conteneur (C4)', def: 'Quelque chose qui doit tourner pour que le système marche : une appli serveur, une base de données, une appli navigateur, un worker. Un processus ou un stockage de données.' },
		{ term: 'Diagramme de conteneurs', def: 'Niveau 2 de C4. Les conteneurs dans ton système, la technologie de chacun, et la façon dont ils se parlent.' },
		{ term: 'Frontière de processus', def: 'Le code des deux côtés ne peut pas partager de mémoire. Il communique par le réseau, une file ou un fichier, et chaque côté peut planter seul.' },
		{ term: 'Image', def: 'Un build empaqueté, comme `ghcr.io/mastodon/mastodon`. Ce n’est pas un conteneur : la même image peut démarrer plusieurs processus différents.' },
		{ term: 'Composant', def: 'Une partie à l’intérieur d’un conteneur, comme la classe `PostStatusService`. Il ne tourne pas tout seul. C’est le niveau 3.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: [
					'spa(["Navigateur : appli web React"]) -->|"API REST, HTTPS"| web["web : Rails sous Puma"]',
					'spa -->|"WebSocket, mises à jour en direct"| stream["streaming : Node.js"]'
				],
				highlight: ['spa', 'web', 'stream'],
				note: 'La boîte, ouverte. L’appli React est un **conteneur** à part entière : elle tourne dans le navigateur de l’utilisateur. L’API, c’est Rails, servi par Puma. Les mises à jour en direct viennent d’un **deuxième serveur**, écrit dans un autre langage, avec sa propre image.'
			},
			{
				add: [
					'web -->|"comptes, posts, abonnements"| pg[("PostgreSQL")]',
					'web -->|"fils, cache, files de jobs"| redis[("Redis")]',
					'stream -->|"vérifie les tokens d’accès"| pg',
					'redis -->|"pub/sub : nouveaux posts"| stream'
				],
				highlight: ['pg', 'redis'],
				note: 'Deux stockages de données. PostgreSQL garde ce qui ne doit jamais être perdu. Redis garde les fils d’accueil et les files de jobs, et c’est aussi le **câble** vers le serveur de streaming : celui-ci s’abonne à des canaux Redis et pousse ce qui arrive vers les WebSockets ouvertes.'
			},
			{
				add: ['sidekiq["sidekiq : même image que web, commande worker"] -->|"prend les jobs"| redis', 'sidekiq --> pg'],
				highlight: ['sidekiq'],
				note: 'Un **deuxième conteneur depuis la même image** : `sidekiq` lance `ghcr.io/mastodon/mastodon` avec une autre commande. Même code, processus séparé. Il remplit les fils d’accueil, envoie les e-mails, et livre les posts aux autres serveurs.'
			},
			{
				add: ['web --> files[("Médias : volume local ou bucket S3")]', 'sidekiq --> files', 'web -.->|"recherche, optionnelle"| es[("Elasticsearch")]'],
				highlight: ['files', 'es'],
				note: 'Deux stockages de plus. Les fichiers médias, sur un volume partagé ou dans un bucket. Un bucket reste un conteneur : quelqu’un d’autre l’héberge, mais tu possèdes les données. **Elasticsearch** est optionnel : Mastodon propose la recherche plein texte « quand Elasticsearch est disponible ». Un conteneur optionnel reste une boîte, dessinée en pointillés.'
			},
			{
				add: ['fedi["Autres serveurs du fédivers"] -->|"POST /inbox"| web', 'sidekiq -->|"livraisons ActivityPub"| fedi', 'class fedi ext'],
				highlight: ['fedi'],
				note: 'La boîte externe d’hier, maintenant rattachée au **conteneur** qui lui parle. Les autres serveurs frappent à la porte de `web`. Les livraisons vers eux partent de `sidekiq`, une fois que la requête de l’utilisateur a déjà reçu sa réponse.'
			}
		]
	},
	example: {
		title: 'docker-compose.yml, une image, deux conteneurs',
		repo: 'mastodon/mastodon',
		url: `${REPO}/docker-compose.yml#L59-L108`,
		lang: 'yaml',
		code: `  web:
…
    image: ghcr.io/mastodon/mastodon:v4.7.3
    restart: always
    env_file: .env.production
    command: bundle exec puma -C config/puma.rb
…
  streaming:
…
    image: ghcr.io/mastodon/mastodon-streaming:v4.7.3
    restart: always
    env_file: .env.production
    command: node ./streaming/index.js
…
  sidekiq:
…
    image: ghcr.io/mastodon/mastodon:v4.7.3
    restart: always
    env_file: .env.production
    command: bundle exec sidekiq`,
		notes: [
			'`web` et `sidekiq` désignent la **même image** et ne diffèrent que par `command`. Sur un diagramme de conteneurs, ça fait deux boîtes : elles démarrent, plantent et passent à l’échelle séparément. Le [Dockerfile principal](' + REPO + '/Dockerfile#L412-L416) se termine par un `ENTRYPOINT` sans `CMD`, donc c’est celui qui lance l’image qui choisit le rôle.',
			'`streaming` est une autre image, construite depuis [son propre Dockerfile](' + REPO + '/streaming/Dockerfile#L109-L111). Autre langage, autre port (4000), autre histoire de passage à l’échelle.',
			'Le `Procfile` pour Heroku le dit clairement : « pour l’API de streaming, il te faut une appli séparée qui partage Postgres et Redis » ([Procfile](' + REPO + '/Procfile#L4-L14)). Deux conteneurs, deux stockages partagés.',
			'Le serveur de streaming lit PostgreSQL directement, pour [vérifier le token d’accès](' + REPO + '/streaming/index.js#L383) de chaque connexion. Deux conteneurs sur une même base, ça veut dire que le schéma est un contrat entre eux.'
		]
	},
	tradeoff: {
		gain: [
			'Les WebSockets longue durée dans leur propre processus. Le guide de passage à l’échelle dimensionne Puma pour des requêtes courtes et le serveur de streaming pour des connexions ouvertes, et tu fais grandir chacun séparément.',
			'Web et worker depuis une seule image : un build, une version, deux rôles.',
			'Le travail lent dans Sidekiq : un serveur distant qui met 30 secondes à répondre ralentit un job, pas le clic d’un utilisateur.'
		],
		cost: [
			'Plus de boîtes à faire tourner. Le [guide d’installation](https://docs.joinmastodon.org/admin/install/) met en place PostgreSQL et Redis, puis démarre `mastodon-web`, `mastodon-sidekiq` et `mastodon-streaming`, et demande aussi un serveur SMTP.',
			'Les stockages partagés deviennent des contrats. Web, Sidekiq et streaming lisent tous la même base et le même Redis. Un changement là-dedans touche les trois.',
			'Si Sidekiq s’arrête, rien ne lève d’erreur. Les posts sont enregistrés, mais les fils et les autres serveurs ne les reçoivent plus tant que les jobs ne tournent pas.'
		]
	},
	task: {
		prompt: 'Range ces éléments en « conteneur » ou « pas un conteneur » pour un serveur Mastodon. La liste : PostgreSQL, le processus Sidekiq, l’image `ghcr.io/mastodon/mastodon`, le serveur de streaming, l’appli web React, la classe `PostStatusService`, Elasticsearch, le bucket S3 pour les médias.',
		hint: 'Pose la question pour chacun : est-ce qu’il tourne (ou stocke des données) tout seul ? Peut-il planter pendant que le reste continue ?',
		answer: [
			'Conteneurs : PostgreSQL, le processus Sidekiq, le serveur de streaming, l’appli web React (elle tourne dans le navigateur), Elasticsearch (quand il est activé), et le bucket S3 (tu possèdes ses données).',
			'Pas des conteneurs : l’image (un build, qui devient deux conteneurs : `web` et `sidekiq`) et `PostStatusService` (une classe dans l’appli Rails, un composant au niveau 3).',
			'Le piège, c’est l’image. Même code ne veut pas dire même conteneur. Sidekiq peut mourir pendant que l’API continue de répondre.'
		]
	},
	quiz: [
		{
			q: 'Dans le `docker-compose.yml` de Mastodon, `web` et `sidekiq` utilisent tous les deux l’image `ghcr.io/mastodon/mastodon`. Combien de boîtes ont-ils sur un diagramme de **conteneurs** ?',
			options: [
				'Une : même image, même conteneur',
				'Aucune : les images n’ont leur place que sur le diagramme de déploiement',
				'Une, imbriquée dans la boîte Redis parce que Sidekiq lit ses jobs dans Redis',
				'Deux : chacun tourne comme son propre processus et peut tomber seul'
			],
			answer: 3,
			why: 'Un conteneur est une frontière d’exécution, pas un artefact de build. Des commandes différentes donnent des processus différents, donc ce sont deux conteneurs qui partagent du code.'
		},
		{
			q: 'Dans le modèle C4, qu’est-ce qui fait de quelque chose un conteneur ?',
			options: [
				'Il est empaqueté comme une image Docker',
				'Il doit tourner (ou stocker des données) pour que le système marche, comme un processus ou un stockage à part',
				'Il a son propre dépôt Git',
				'Il expose une API REST'
			],
			answer: 1,
			why: 'Simon Brown définit un conteneur comme quelque chose qui doit tourner pour que le système marche. Une base de données sans API et une appli navigateur sans image Docker sont toutes deux des conteneurs.'
		},
		{
			q: 'Sidekiq est arrêté, mais `web` continue de tourner. Un utilisateur publie un post. Que se passe-t-il ?',
			options: [
				'L’API refuse le post avec une erreur',
				'Le post est enregistré et renvoyé, mais les fils et les autres serveurs ne le reçoivent qu’une fois Sidekiq relancé',
				'Le processus web exécute les jobs lui-même à la place',
				'Le post est perdu au redémarrage de Sidekiq'
			],
			answer: 1,
			why: 'La requête enregistre le post et se contente de **mettre en file** les jobs de livraison dans Redis. Rien ne les exécute tant qu’un processus Sidekiq ne les prend pas. Des conteneurs séparés tombent séparément, et celui-ci tombe en silence.'
		}
	],
	takeaway: 'Un conteneur, c’est ce que tu dois garder en marche. Dessine une boîte par processus ou par stockage de données, pas par image ni par fonctionnalité.',
	sources: [
		{ title: 'C4 model, Container diagram', url: 'https://c4model.com/diagrams/container' },
		{ title: 'C4 model, what a container is', url: 'https://c4model.com/abstractions/container' },
		{ title: 'mastodon, docker-compose.yml', url: `${REPO}/docker-compose.yml` },
		{ title: 'mastodon, streaming/Dockerfile', url: `${REPO}/streaming/Dockerfile` },
		{ title: 'Mastodon docs, Scaling up your server (the three process types)', url: 'https://docs.joinmastodon.org/admin/scaling/' }
	]
};
