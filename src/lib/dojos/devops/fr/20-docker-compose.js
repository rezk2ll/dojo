const COMPOSE = 'https://github.com/docker/awesome-compose/blob/30f4b7f6a6c3b0c0ecf4d4efb0de203c48d11562';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'docker-compose',
	part: 'Les conteneurs',
	title: 'Docker Compose : toute la stack dans un seul fichier',
	minutes: 10,
	hook: [
		'Ton appli a besoin de nginx, d’un backend et de PostgreSQL. À la main, ça fait trois lignes `docker run` avec des ports, un réseau, un volume et un mot de passe, tapées dans le bon ordre. Oublie un flag et le backend ne trouve plus la base.',
		'Docker Compose écrit tout ça dans un seul fichier YAML. `docker compose up -d` démarre la stack, `docker compose down` la supprime. Le même fichier tourne sur ton portable et sur le serveur de test.',
		'Compose peut démarrer le conteneur de la base en premier, mais PostgreSQL n’accepte peut-être pas encore de connexions. Un **healthcheck** dit à Compose quand la base est prête.'
	],
	terms: [
		{ term: 'Service', def: 'Un composant de l’appli dans `compose.yaml` (web, backend, db). Compose fait tourner un ou plusieurs conteneurs pour lui.' },
		{ term: 'Volume', def: 'Un stockage qui survit au conteneur. Un volume nommé (`db-data`) survit à `docker compose down`. `down -v` le supprime.' },
		{ term: 'Healthcheck', def: 'Une commande que le conteneur lance à intervalle régulier pour dire « je suis prêt ». Son résultat donne l’état de santé du conteneur.' },
		{ term: 'depends_on', def: 'L’ordre de démarrage entre services. Avec `condition: service_healthy`, Compose attend que le healthcheck de la dépendance passe.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: [
					'subgraph net["Réseau : project_default"]',
					'proxy["proxy : nginx"] --> be["backend"]',
					'be --> db["db : postgres"]',
					'end',
					'user(["Navigateur"]) -->|port 80| proxy',
					'class user ext'
				],
				highlight: ['proxy', 'be', 'db'],
				note: 'Compose met les trois services sur un seul réseau par défaut, créé pour le projet. Seul `proxy` publie un port sur l’hôte. Le backend joint la base **par son nom de service**, `db`.'
			},
			{
				add: [
					'vol[("Volume : db-data")]',
					'db --- vol'
				],
				highlight: ['vol'],
				note: 'La base écrit dans un **volume nommé**. Recrée le conteneur `db`, mets-le à jour, fais `down` puis `up` : les données restent.'
			},
			{
				add: [
					'hc["healthcheck : pg_isready"]',
					'hc -.->|en bonne santé ?| db'
				],
				highlight: ['hc'],
				note: 'Le healthcheck lance `pg_isready` toutes les 10 secondes. Le processus peut tourner un moment avant que PostgreSQL accepte les connexions. `pg_isready` ne réussit qu’à partir de ce moment.'
			},
			{
				add: [
					'be -.->|attend healthy| hc'
				],
				highlight: ['be', 'hc'],
				note: 'Un `depends_on` simple attend seulement que le conteneur de la base **tourne**. Avec `condition: service_healthy`, le backend ne démarre qu’une fois le healthcheck passé, et sa première connexion ne reçoit pas de « connection refused ».'
			},
			{
				add: [
					'sec["secret : db-password depuis un fichier"]',
					'sec -.-> be',
					'sec -.-> db',
					'class sec ext'
				],
				highlight: ['sec'],
				note: 'Le mot de passe vient d’un fichier et apparaît dans les deux conteneurs sous `/run/secrets/db-password`. Il n’est ni dans le YAML ni dans l’environnement du conteneur.'
			}
		]
	},
	example: {
		title: 'nginx-golang-postgres/compose.yaml',
		repo: 'docker/awesome-compose',
		url: `${COMPOSE}/nginx-golang-postgres/compose.yaml#L1-L48`,
		lang: 'yaml',
		code: `services:
  backend:
    build:
      context: backend
      target: builder
    secrets:
      - db-password
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres
    restart: always
    user: postgres
    secrets:
      - db-password
    volumes:
      - db-data:/var/lib/postgresql/data
    environment:
      - POSTGRES_DB=example
      - POSTGRES_PASSWORD_FILE=/run/secrets/db-password
    expose:
      - 5432
    healthcheck:
      test: [ "CMD", "pg_isready" ]
      interval: 10s
      timeout: 5s
      retries: 5

  proxy:
    image: nginx
…
    ports:
      - 80:80
    depends_on:
      - backend

volumes:
  db-data:

secrets:
  db-password:
    file: db/password.txt`,
		notes: [
			'Le fichier n’a pas de clé `networks:`. Compose met les trois services sur le réseau par défaut, donc le backend se connecte à `db` par son nom.',
			'Les lignes 23 et 24, `expose: 5432`, ne publient rien sur l’hôte. Elles notent seulement le port : les autres services du réseau partagé peuvent de toute façon joindre n’importe quel port de `db`. Les lignes 34 et 35, `ports: 80:80` sur `proxy`, ouvrent le seul port accessible depuis l’hôte.',
			'Les lignes 8 à 10 font attendre `backend` jusqu’à ce que `db` soit **healthy**. Les lignes 36 et 37 donnent à `proxy` la forme courte, `depends_on: [backend]`, qui attend seulement que le conteneur du backend démarre.',
			'La ligne 22, `POSTGRES_PASSWORD_FILE`, pointe vers le secret monté, donc le mot de passe n’est jamais dans `environment`. La ligne 13, `image: postgres`, n’a pas de tag, donc Docker tire `latest` : fixe la version avant que ce fichier quitte ton portable (jour 19).'
		]
	},
	tradeoff: {
		gain: [
			'Toute la stack tient dans un fichier relu dans Git, pas dans une liste de commandes `docker run` perdues dans l’historique du shell de quelqu’un.',
			'Une seule commande pour démarrer, arrêter ou reconstruire le tout, de la même façon pour chaque développeur.',
			'Les healthchecks et `depends_on` donnent un ordre de démarrage prévisible.'
		],
		cost: [
			'Compose fait tourner tous les services sur **un seul hôte**, sans bascule vers une autre machine ni déploiement progressif sur un parc. Kubernetes s’en charge.',
			'Tu écris chaque healthcheck toi-même, et un healthcheck faible passe trop tôt : il vérifie que le port est ouvert alors que l’appli refuse encore les requêtes.',
			'Un fichier `.env` remplit les `${VAR}` du fichier compose, et `env_file:` sur un service passe des variables dans son conteneur. Confondre les deux mène souvent à « pourquoi ma variable est vide ».'
		]
	},
	task: {
		prompt: 'Ta stack, c’est `web` (une appli Python) et `db` (PostgreSQL). Sur un `docker compose up` à neuf, `web` plante avec « connection refused » environ une fois sur trois, puis marche après un redémarrage. Le fichier compose a `depends_on: [db]` sur `web`. Corrige-le, et dis comment tu garderais le mot de passe de la base hors du fichier.',
		hint: 'Qu’est-ce qu’un `depends_on` simple attend vraiment ? Qu’est-ce qui dirait à Compose que la base est prête ?',
		answer: [
			'Un `depends_on` simple attend seulement que `db` **tourne**, pas que PostgreSQL accepte les connexions. Cette course explique le une fois sur trois.',
			'Ajoute un `healthcheck` à `db` (par exemple `test: ["CMD", "pg_isready"]` avec un `interval` et des `retries`).',
			'Change `web` en `depends_on: { db: { condition: service_healthy } }`.',
			'Mot de passe : utilise un `secret` Compose depuis un fichier non commité, lu via `POSTGRES_PASSWORD_FILE`. Ou mets-le dans un `.env` ignoré par Git et référence `${DB_PASSWORD}`.'
		]
	},
	quiz: [
		{
			q: 'Dans Compose, qu’attend `depends_on: [db]` (sans condition) avant de démarrer le service qui en dépend ?',
			options: [
				'Que le conteneur `db` tourne',
				'Que `db` accepte les connexions sur son port',
				'Que le healthcheck de `db` passe',
				'Rien : ça documente seulement la dépendance'
			],
			answer: 0,
			why: 'Compose attend que le processus du conteneur tourne. Pour attendre que la base accepte les connexions, il te faut un healthcheck et `condition: service_healthy`.'
		},
		{
			q: 'Ton backend doit joindre la base définie dans le même fichier compose. Quel nom d’hôte utilise-t-il ?',
			options: [
				'`localhost`',
				'L’adresse IP de la machine hôte',
				'Le nom de service de la base, par exemple `db`',
				'L’IP que `docker inspect` affichait la dernière fois'
			],
			answer: 2,
			why: 'Chaque service rejoint le réseau du projet et se trouve par son nom de service. `localhost` dans un conteneur, c’est le conteneur lui-même.'
		},
		{
			q: 'Tu lances `docker compose down` sur une stack avec un volume nommé `db-data`. Qu’arrive-t-il aux fichiers de la base ?',
			options: [
				'Ils sont supprimés avec les conteneurs, puisque le volume nommé appartient à la stack',
				'Ils restent : `down` supprime conteneurs et réseaux, mais garde les volumes nommés sauf avec `-v`',
				'Ils sont déplacés dans l’image pour que le prochain `up` les restaure',
				'Ils sont gardés seulement si la base a été arrêtée proprement avant `down`'
			],
			answer: 1,
			why: 'Par défaut `down` supprime les conteneurs et les réseaux qu’il a créés. Les volumes nommés ne sont supprimés qu’avec `--volumes` (`-v`).'
		}
	],
	recall: {
		q: 'Qu’ajoutes-tu pour que le backend ne démarre qu’une fois que PostgreSQL accepte les connexions ?',
		a: 'Un healthcheck sur `db` (`pg_isready`, toutes les 10 secondes) et `depends_on: { db: { condition: service_healthy } }` sur le backend. Un `depends_on` simple attend seulement que le conteneur tourne.'
	},
	sources: [
		{ title: 'Doc Docker, contrôler l’ordre de démarrage dans Compose', url: 'https://docs.docker.com/compose/how-tos/startup-order/' },
		{ title: 'Doc Docker, le réseau dans Compose', url: 'https://docs.docker.com/compose/how-tos/networking/' },
		{ title: 'Doc Docker, définir des variables d’environnement dans les conteneurs', url: 'https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/' },
		{ title: 'Doc Docker, référence du fichier Compose : services', url: 'https://docs.docker.com/reference/compose-file/services/' },
		{ title: 'Doc Docker, docker compose down', url: 'https://docs.docker.com/reference/cli/docker/compose/down/' }
	]
};
