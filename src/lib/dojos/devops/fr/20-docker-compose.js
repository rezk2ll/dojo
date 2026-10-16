const COMPOSE = 'https://github.com/docker/awesome-compose/blob/30f4b7f6a6c3b0c0ecf4d4efb0de203c48d11562';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'docker-compose',
	part: 'Les conteneurs',
	title: 'Docker Compose : toute la stack dans un seul fichier',
	minutes: 10,
	hook: [
		'Ton appli a besoin de nginx, d’un backend et de PostgreSQL. À la main, ça fait trois lignes `docker run` avec des ports, un réseau, un volume et un mot de passe, tapées dans le bon ordre. Oublie un flag et le backend ne trouve plus la base.',
		'**Compose** écrit tout ça dans un seul fichier YAML. `docker compose up -d` démarre la stack, `docker compose down` la supprime. Le même fichier sur ton portable et sur le serveur de test.',
		'Le point qui pique, c’est **l’ordre de démarrage**. Compose sait démarrer la base en premier, mais « démarrée » ne veut pas dire « prête ». Aujourd’hui tu apprends comment un **healthcheck** comble cet écart.'
	],
	terms: [
		{ term: 'Service', def: 'Un composant de l’appli dans `compose.yaml` (web, backend, db). Compose fait tourner un ou plusieurs conteneurs pour lui.' },
		{ term: 'Réseau', def: 'Compose crée un réseau par défaut pour le projet. Chaque service le rejoint et joint les autres **par leur nom de service**, comme `db:5432`.' },
		{ term: 'Volume', def: 'Un stockage qui survit au conteneur. Un volume nommé (`db-data`) survit à `docker compose down`. `down -v` le supprime.' },
		{ term: 'Fichier env', def: 'Deux sortes. Un fichier `.env` dans le dossier du projet remplit les `${VAR}` du fichier compose. `env_file:` sur un service passe des variables dans son conteneur.' },
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
				note: 'Trois **services** sur un seul **réseau** par défaut. Seul `proxy` publie un port sur l’hôte. Le backend joint la base par son nom de service, `db`.'
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
				note: 'Un **healthcheck** lance `pg_isready` toutes les 10 secondes. Le processus peut tourner un moment avant que PostgreSQL accepte les connexions. Le healthcheck fait la différence entre les deux.'
			},
			{
				add: [
					'be -.->|attend healthy| hc'
				],
				highlight: ['be', 'hc'],
				note: 'Un `depends_on` simple attend seulement que le conteneur de la base **tourne**. Avec `condition: service_healthy`, le backend ne démarre qu’une fois le healthcheck passé. Fini les « connection refused » au premier démarrage.'
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
			'Aucune clé `networks:`. Compose met les trois services sur le réseau par défaut, donc le backend se connecte à `db` par son nom.',
			'`expose: 5432` ne publie rien sur l’hôte. Il note seulement le port : les autres services du réseau partagé peuvent de toute façon joindre n’importe quel port de `db`. `ports: 80:80` sur `proxy` est la seule porte depuis l’hôte.',
			'`backend` attend que `db` soit **healthy**. `proxy` utilise la forme courte, `depends_on: [backend]`, qui attend seulement que le conteneur du backend démarre.',
			'`POSTGRES_PASSWORD_FILE` pointe vers le secret monté, donc le mot de passe n’est jamais dans `environment`. Et `image: postgres` n’a pas de tag, donc ça veut dire `latest` : fixe-le avant que ça quitte ton portable (jour 19).'
		]
	},
	tradeoff: {
		gain: [
			'Toute la stack tient dans un fichier relu dans Git, pas dans une liste de commandes `docker run` perdues dans l’historique du shell de quelqu’un.',
			'Une seule commande pour démarrer, arrêter ou reconstruire le tout, de la même façon pour chaque développeur.',
			'Les healthchecks et `depends_on` donnent un ordre de démarrage prévisible.'
		],
		cost: [
			'Compose tourne sur **un seul hôte**. Pas de bascule vers une autre machine, pas de déploiement progressif sur un parc. C’est le rôle de Kubernetes.',
			'Tu écris chaque healthcheck toi-même. Un healthcheck faible (le port est ouvert, l’appli non) donne une fausse confiance.',
			'Deux sortes de fichiers env avec deux rôles différents, c’est une source classique de « pourquoi ma variable est vide ».'
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
			why: 'Compose attend que le conteneur tourne, pas qu’il soit prêt. Il faut un healthcheck et `condition: service_healthy` pour attendre qu’il soit prêt.'
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
				'Ils sont supprimés avec les conteneurs',
				'Ils restent : `down` supprime les conteneurs et les réseaux, les volumes nommés restent sauf si tu ajoutes `-v`',
				'Ils sont déplacés dans l’image',
				'Ils sont gardés seulement si la base a été arrêtée proprement'
			],
			answer: 1,
			why: 'Par défaut `down` supprime les conteneurs et les réseaux qu’il a créés. Les volumes nommés ne sont supprimés qu’avec `--volumes` (`-v`).'
		}
	],
	takeaway: 'Compose transforme un tas de commandes `docker run` en un seul fichier. Donne aux services avec état un volume et un healthcheck, et fais attendre le reste avec `service_healthy`.',
	sources: [
		{ title: 'Doc Docker, contrôler l’ordre de démarrage dans Compose', url: 'https://docs.docker.com/compose/how-tos/startup-order/' },
		{ title: 'Doc Docker, le réseau dans Compose', url: 'https://docs.docker.com/compose/how-tos/networking/' },
		{ title: 'Doc Docker, définir des variables d’environnement dans les conteneurs', url: 'https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/' },
		{ title: 'Doc Docker, référence du fichier Compose : services', url: 'https://docs.docker.com/reference/compose-file/services/' },
		{ title: 'Doc Docker, docker compose down', url: 'https://docs.docker.com/reference/cli/docker/compose/down/' }
	]
};
