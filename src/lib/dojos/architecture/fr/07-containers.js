const REPO = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'containers',
	part: 'Voir le système',
	title: 'Les conteneurs : ce qui tourne vraiment',
	minutes: 10,
	hook: [
		'Hier, le diagramme de contexte dessinait le serveur Mastodon en une seule boîte. Maintenant quelqu’un te demande : « si je te donne une nouvelle machine pour lui, tu installes quoi ? » Le diagramme de contexte ne répond pas, car il ne montre rien de l’intérieur de la boîte.',
		'Le niveau 2 de C4 ouvre la boîte. Dans la boîte du système, tu dessines les **conteneurs** : chaque chose qui doit tourner pour que le système marche. Un processus serveur, une base de données, une appli qui tourne dans le navigateur, un worker en arrière-plan.',
		'Ici, « conteneur » ne veut pas dire Docker. Simon Brown a choisi ce mot pour qu’il ne dise rien de la manière dont la chose tourne. Il désigne une **frontière d’exécution** : un processus ou un stockage de données séparé, que tu démarres, arrêtes, déploies et surveilles à part. Dans le `docker-compose.yml` de Mastodon, une seule image Docker tourne comme deux conteneurs.'
	],
	terms: [
		{ term: 'Conteneur (C4)', def: 'Quelque chose qui doit tourner pour que le système marche, sous forme d’un processus ou d’un stockage de données : une appli serveur, une base de données, une appli navigateur, un worker.' },
		{ term: 'Diagramme de conteneurs', def: 'Niveau 2 de C4. Les conteneurs dans ton système, la technologie de chacun, et la façon dont ils communiquent.' },
		{ term: 'Frontière de processus', def: 'Le code des deux côtés ne peut pas partager de mémoire. Il communique par le réseau, une file ou un fichier, et chaque côté peut planter seul.' },
		{ term: 'Image', def: 'Un build empaqueté, comme `ghcr.io/mastodon/mastodon`. La même image peut démarrer plusieurs processus différents, donc une image peut donner plusieurs conteneurs.' }
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
				note: 'L’appli React compte comme un conteneur à part entière, parce qu’elle tourne dans le navigateur de l’utilisateur. L’API tourne sous Rails, servie par Puma. Les mises à jour en direct viennent d’un **deuxième serveur**, écrit dans un autre langage, avec sa propre image.'
			},
			{
				add: [
					'web -->|"comptes, posts, abonnements"| pg[("PostgreSQL")]',
					'web -->|"fils, cache, files de jobs"| redis[("Redis")]',
					'stream -->|"vérifie les tokens d’accès"| pg',
					'redis -->|"pub/sub : nouveaux posts"| stream'
				],
				highlight: ['pg', 'redis'],
				note: 'PostgreSQL garde les comptes, les posts et les abonnements, les données à ne jamais perdre. Redis garde les fils d’accueil et les files de jobs. Le serveur de streaming s’abonne aussi à des canaux Redis et pousse **ce qui y arrive** vers les WebSockets ouvertes.'
			},
			{
				add: ['sidekiq["sidekiq : même image que web, commande worker"] -->|"prend les jobs"| redis', 'sidekiq --> pg'],
				highlight: ['sidekiq'],
				note: '`sidekiq` lance la même image, `ghcr.io/mastodon/mastodon`, avec une autre commande : tu as donc un **deuxième conteneur issu de la même image**. Il remplit les fils d’accueil, envoie les e-mails et livre les posts aux autres serveurs.'
			},
			{
				add: ['web --> files[("Médias : volume local ou bucket S3")]', 'sidekiq --> files', 'web -.->|"recherche, optionnelle"| es[("Elasticsearch")]'],
				highlight: ['files', 'es'],
				note: 'Les fichiers médias vont sur un volume partagé ou dans un bucket. Un bucket compte comme un conteneur : quelqu’un d’autre l’héberge, mais tu possèdes les données. Mastodon propose la recherche plein texte « quand Elasticsearch est disponible », alors tu dessines **Elasticsearch** en pointillés.'
			},
			{
				add: ['fedi["Autres serveurs du fédivers"] -->|"POST /inbox"| web', 'sidekiq -->|"livraisons ActivityPub"| fedi', 'class fedi ext'],
				highlight: ['fedi'],
				note: 'La boîte externe d’hier se branche maintenant sur le **conteneur** qui lui parle. Les autres serveurs envoient leurs posts à `web`. Les livraisons vers eux partent de `sidekiq`, une fois que la requête de l’utilisateur a déjà reçu sa réponse.'
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
			'Les lignes 3 et 17 donnent la **même image** à `web` et à `sidekiq`, et seules les lignes 6 et 20 (`command`) changent. Ils démarrent, plantent et passent à l’échelle séparément, donc tu dessines deux boîtes. Le [Dockerfile principal](' + REPO + '/Dockerfile#L412-L416) se termine par un `ENTRYPOINT` sans `CMD` : celui qui lance l’image choisit le rôle.',
			'Ligne 10 : `streaming` utilise une autre image, construite depuis [son propre Dockerfile](' + REPO + '/streaming/Dockerfile#L109-L111). Il tourne sous Node.js sur le port 4000, et tu le fais grandir à part.',
			'Le [`Procfile`](' + REPO + '/Procfile#L4-L14) pour Heroku : « pour l’API de streaming, il te faut une appli séparée qui partage Postgres et Redis ». L’appli Rails et l’appli de streaming forment deux conteneurs branchés sur les mêmes PostgreSQL et Redis.',
			'Le serveur de streaming lit PostgreSQL directement, pour [vérifier le token d’accès](' + REPO + '/streaming/index.js#L383) de chaque connexion. Avec deux conteneurs sur une même base, un changement de schéma doit marcher pour les deux.'
		]
	},
	tradeoff: {
		gain: [
			'Les WebSockets longue durée tournent dans leur propre processus. Le guide de passage à l’échelle dimensionne Puma pour des requêtes courtes et le serveur de streaming pour des connexions ouvertes, et tu fais grandir chacun séparément.',
			'Web et worker sortent d’une seule image : un build et une version pour deux rôles.',
			'Le travail lent tourne dans Sidekiq : un serveur distant qui met 30 secondes à répondre ralentit un job, et le clic de l’utilisateur reçoit quand même une réponse rapide.'
		],
		cost: [
			'Tu fais tourner plus de processus. Le [guide d’installation](https://docs.joinmastodon.org/admin/install/) met en place PostgreSQL et Redis, puis démarre `mastodon-web`, `mastodon-sidekiq` et `mastodon-streaming`, et demande aussi un serveur SMTP.',
			'Web, Sidekiq et streaming lisent tous la même base et le même Redis. Si tu changes ce qu’ils y stockent, le changement doit marcher pour les trois.',
			'Quand Sidekiq s’arrête, aucune requête n’échoue. Les posts sont enregistrés, mais les fils et les autres serveurs ne les reçoivent plus tant que les jobs ne tournent pas.'
		]
	},
	task: {
		prompt: 'Range ces éléments en « conteneur » ou « pas un conteneur » pour un serveur Mastodon. La liste : PostgreSQL, le processus Sidekiq, l’image `ghcr.io/mastodon/mastodon`, le serveur de streaming, l’appli web React, la classe `PostStatusService`, Elasticsearch, le bucket S3 pour les médias.',
		hint: 'Pose la question pour chacun : est-ce qu’il tourne (ou stocke des données) tout seul ? Peut-il planter pendant que le reste continue ?',
		answer: [
			'Conteneurs : PostgreSQL, le processus Sidekiq, le serveur de streaming, l’appli web React (elle tourne dans le navigateur), Elasticsearch (quand il est activé), et le bucket S3 (tu possèdes ses données).',
			'Pas des conteneurs : l’image (un seul build qui tourne comme deux conteneurs, `web` et `sidekiq`) et `PostStatusService` (une classe dans l’appli Rails, un composant au niveau 3).',
			'Le piège, c’est l’image. `web` et `sidekiq` partagent le code mais tournent dans des processus séparés : Sidekiq peut mourir pendant que l’API continue de répondre.'
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
			why: 'Un conteneur est un processus ou un stockage qui tourne, et une image n’est que le build dont il part. Des commandes différentes lancent des processus différents : ce sont deux conteneurs qui partagent du code.'
		},
		{
			q: 'Dans le modèle C4, qu’est-ce qui fait de quelque chose un conteneur ?',
			options: [
				'Il est empaqueté comme une image Docker, qu’on peut démarrer et arrêter toute seule',
				'Il doit tourner (ou garder des données) pour que le système marche, en processus ou stockage à part',
				'Il vit dans son propre dépôt Git, et une seule équipe le construit et le publie',
				'Il expose une API REST que les autres parties du système appellent en HTTPS'
			],
			answer: 1,
			why: 'Simon Brown définit un conteneur comme quelque chose qui doit tourner pour que le système marche. Une base de données sans API et une appli navigateur sans image Docker sont toutes deux des conteneurs.'
		},
		{
			q: 'Sidekiq est arrêté, mais `web` continue de tourner. Un utilisateur publie un post. Que se passe-t-il ?',
			options: [
				'L’API refuse le post avec une erreur, car aucun worker ne peut prendre ses jobs',
				'Le post est enregistré, mais les fils et les autres serveurs ne le reçoivent qu’une fois Sidekiq relancé',
				'Le processus web voit que Sidekiq est arrêté et exécute lui-même les jobs de livraison',
				'Le post est enregistré, mais ses jobs en file sont perdus au redémarrage de Sidekiq'
			],
			answer: 1,
			why: 'La requête enregistre le post et se contente de **mettre en file** les jobs de livraison dans Redis. Rien ne les exécute tant qu’un processus Sidekiq ne les prend pas, et l’utilisateur ne voit aucune erreur en attendant.'
		}
	],
	recall: {
		q: 'Le `docker-compose.yml` de Mastodon utilise une seule image pour `web` et `sidekiq`. Ça fait combien de conteneurs, et pourquoi ?',
		a: 'Deux. Ils lancent des commandes différentes (`puma` et `sidekiq`), donc ce sont des processus séparés qui démarrent, plantent et passent à l’échelle chacun de leur côté. C4 dessine une boîte par processus ou stockage de données, pas par image.'
	},
	sources: [
		{ title: 'C4 model, Container diagram', url: 'https://c4model.com/diagrams/container' },
		{ title: 'C4 model, what a container is', url: 'https://c4model.com/abstractions/container' },
		{ title: 'mastodon, docker-compose.yml', url: `${REPO}/docker-compose.yml` },
		{ title: 'mastodon, streaming/Dockerfile', url: `${REPO}/streaming/Dockerfile` },
		{ title: 'Mastodon docs, Scaling up your server (the three process types)', url: 'https://docs.joinmastodon.org/admin/scaling/' }
	]
};
