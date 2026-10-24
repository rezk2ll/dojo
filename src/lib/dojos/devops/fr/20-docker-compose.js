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
		],
		steps: [
			{
				title: 'Explique le plantage',
				questions: [
					{ q: '`web` logue « connection refused » de la part de `db`. Qu’est-ce que ça te dit de `db` à ce moment-là ?', options: ['Le mot de passe est faux', 'Rien n’acceptait encore les connexions : PostgreSQL démarrait encore', '`web` a utilisé le mauvais nom d’hôte', 'Le volume est plein'], answer: 1, why: 'Le nom a été résolu et le paquet est arrivé, mais rien ne l’a accepté. Un mauvais mot de passe échouerait plus tard, après la connexion.' },
					{ q: 'Pourquoi `web` plante-t-il seulement une fois sur trois environ ?', options: ['C’est une course : parfois PostgreSQL est prêt à temps, parfois non', 'Le réseau perd un paquet sur trois', 'Compose démarre les services dans un ordre au hasard', 'Le mot de passe est faux une fois sur trois'], answer: 0, why: 'Le processus de la base peut tourner un moment avant d’accepter les connexions. Que `web` se connecte avant ou après dépend du timing.' },
					{ q: 'Pourquoi ça marche après un redémarrage ?', options: ['Le redémarrage vide le volume', 'Compose passe à un healthcheck', 'À ce moment-là, PostgreSQL accepte les connexions', 'Le redémarrage choisit un nouveau port'], answer: 2, why: 'Le second essai arrive plus tard, une fois que la base a fini de démarrer.' },
					{ q: '`db` n’a pas de ligne `ports:`. Comment `web` peut-il quand même le joindre sur 5432 ?', options: ['Il ne peut pas : ajoute `ports: 5432:5432`', 'Par le port 5432 de l’hôte', 'Seulement après avoir ajouté `expose: 5432`', 'Les services du réseau du projet joignent n’importe quel port les uns des autres'], answer: 3, why: '`ports:` publie seulement un port vers l’hôte. Dans le réseau partagé, les autres services peuvent joindre n’importe quel port de `db`.' }
				]
			},
			{
				title: 'Ajoute un healthcheck',
				questions: [
					{ q: 'Le check tourne avec `interval: 10s` et `retries: 5`. Pendant combien de temps environ PostgreSQL peut-il l’échouer avant que `db` soit marqué unhealthy ?', options: ['Environ 50 secondes', '10 secondes', '5 secondes', 'Indéfiniment : les retries ajoutent seulement des lignes de log'], answer: 0, why: 'Cinq échecs d’affilée, à dix secondes d’écart, marquent le conteneur unhealthy.' },
					{ q: 'Tu ajoutes le healthcheck à `db`, mais `web` garde un `depends_on: [db]` simple. Le plantage s’arrête-t-il ?', options: ['Oui : Compose attend maintenant le check', 'Non : un `depends_on` simple ignore l’état de santé', 'Oui, mais seulement au premier `up`', 'Non : les healthchecks ne tournent que dans Kubernetes'], answer: 1, why: 'L’état de santé ne change rien tant qu’un service ne le demande pas avec `condition: service_healthy`.' },
					{ q: 'Que règlent `interval` et `retries` ?', options: ['Combien de temps `web` attend avant de démarrer', 'La fréquence des sauvegardes du volume', 'La fréquence du check, et combien d’échecs le marquent unhealthy', 'Le timeout de connexion de `web`'], answer: 2, why: 'Le conteneur lance la commande à intervalle régulier. Son résultat donne l’état de santé.' },
					{ q: 'Pourquoi ne pas juste vérifier que le port 5432 est ouvert ?', options: ['Compose ne sait pas tester les ports', 'Tester un port demande root', 'Le port 5432 n’est jamais ouvert dans le réseau', 'Un check faible passe trop tôt, alors que l’appli refuse encore les requêtes'], answer: 3, why: 'Tu écris chaque healthcheck toi-même. Un check faible dit « prêt » avant que le service le soit vraiment.' }
				]
			},
			{
				title: 'Attends l’état healthy',
				questions: [
					{ q: 'Le fichier du mot de passe est faux, donc `db` ne devient jamais healthy. Qu’arrive-t-il à `web` au `docker compose up` ?', options: ['Il démarre quand même après un timeout', 'Il ne démarre pas, car `db` ne passe jamais son check', 'Il démarre et plante, comme avant', 'Compose redémarre `db` jusqu’à ce que ça marche'], answer: 1, why: 'Avec `condition: service_healthy`, `web` ne démarre qu’une fois le check passé. Un `db` cassé apparaît maintenant comme une dépendance unhealthy, pas comme un plantage de `web`.' },
					{ q: 'Plus tard, tu mets un `proxy` nginx devant, avec `condition: service_healthy` sur `web`. `web` n’a pas de healthcheck. Est-ce que ça marche ?', options: ['Non : `web` a d’abord besoin de son propre healthcheck', 'Oui : Compose vérifie le port tout seul', 'Oui : `web` hérite du healthcheck de `db`', 'Seulement avec `restart: always`'], answer: 0, why: 'Un service n’est healthy que d’après le résultat de sa propre commande de healthcheck. Sans elle, il n’y a aucun état à attendre.' },
					{ q: 'Avec le correctif, que voit `web` à sa première connexion ?', options: ['Une fois « connection refused », puis ça marche', 'Un timeout', 'Une base qui accepte déjà les connexions', 'Un volume vide'], answer: 2, why: 'Compose ne démarre `web` qu’une fois `pg_isready` passé.' },
					{ q: 'Est-ce que ça rend Compose adapté à un parc de serveurs ?', options: ['Oui, avec les healthchecks il bascule', 'Oui, si chaque hôte a le même fichier', 'Seulement avec `depends_on`', 'Non : Compose fait tourner tous les services sur un seul hôte'], answer: 3, why: 'Compose n’a ni bascule vers une autre machine ni déploiement progressif sur un parc. Kubernetes s’en charge.' }
				]
			},
			{
				title: 'Garde le mot de passe dehors',
				questions: [
					{ q: 'Quelle option garde le mot de passe hors de `compose.yaml` et hors de l’environnement du conteneur ?', options: ['Un `secret` Compose lu depuis un fichier, avec `POSTGRES_PASSWORD_FILE`', '`POSTGRES_PASSWORD` sous `environment`', 'Un commentaire dans le YAML', 'Un argument de build'], answer: 0, why: 'Le secret apparaît dans le conteneur sous `/run/secrets/...`, ni dans le YAML ni dans l’environnement.' },
					{ q: 'Où vit le fichier du secret ?', options: ['Commité à côté de `compose.yaml`', 'Dans l’image', 'Dans un fichier non commité', 'Dans le volume'], answer: 2, why: 'Si le fichier est dans Git, le mot de passe est dans Git.' },
					{ q: 'Tu choisis plutôt un `.env` ignoré par Git. Comment le fichier compose l’utilise-t-il ?', options: ['`env_file: .env` remplit `${DB_PASSWORD}` dans le YAML', 'Il référence `${DB_PASSWORD}`, que Compose remplit depuis `.env`', 'Compose ignore `.env`', 'Tu le copies dans l’image'], answer: 1, why: 'Un fichier `.env` remplit les `${VAR}` du fichier compose. `env_file:` est autre chose : il passe des variables dans un conteneur.' },
					{ q: '`db` liste le secret sous `secrets:`. `web` doit se connecter avec le même mot de passe. De quoi `web` a-t-il besoin ?', options: ['De rien : les secrets sont partagés avec tous les services', 'Du mot de passe dans son `environment`', 'D’une copie du volume de `db`', 'De sa propre entrée `secrets:` pour le même secret'], answer: 3, why: 'Un secret n’est monté que dans les services qui le listent. Listé sur les deux, il apparaît dans chacun sous `/run/secrets/...`.' }
				]
			}
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
	lab: {
		minutes: 20,
		goal: 'Reproduire la course du « connection refused », la corriger avec un healthcheck, et vérifier où vivent le mot de passe et les données.',
		steps: [
			'Crée le projet et un secret : `mkdir -p ~/compose-lab && cd ~/compose-lab && echo lab-secret > password.txt`.',
			'Écris le fichier fragile, où `web` est un client qui se connecte une fois : `printf \'services:\\n  db:\\n    image: postgres:16\\n    environment:\\n      POSTGRES_PASSWORD_FILE: /run/secrets/db-password\\n    secrets: [db-password]\\n    volumes: [db-data:/var/lib/postgresql/data]\\n  web:\\n    image: postgres:16\\n    command: [pg_isready, -h, db, -U, postgres]\\n    depends_on: [db]\\nvolumes:\\n  db-data:\\nsecrets:\\n  db-password:\\n    file: password.txt\\n\' > compose.yaml`. Lance `docker compose run --rm web; echo "exit=$?"`, puis `docker compose down -v`.',
			'Corrige : réécris le fichier avec un healthcheck et une condition : `printf \'services:\\n  db:\\n    image: postgres:16\\n    environment:\\n      POSTGRES_PASSWORD_FILE: /run/secrets/db-password\\n    secrets: [db-password]\\n    volumes: [db-data:/var/lib/postgresql/data]\\n    healthcheck:\\n      test: [CMD, pg_isready, -U, postgres]\\n      interval: 2s\\n      retries: 15\\n  web:\\n    image: postgres:16\\n    command: [pg_isready, -h, db, -U, postgres]\\n    depends_on:\\n      db:\\n        condition: service_healthy\\nvolumes:\\n  db-data:\\nsecrets:\\n  db-password:\\n    file: password.txt\\n\' > compose.yaml`. Lance `docker compose run --rm web; echo "exit=$?"` et `docker compose ps`.',
			'Trouve le mot de passe : `docker compose exec db env | grep POSTGRES`, puis `docker compose exec db cat /run/secrets/db-password`.',
			'Teste le volume : `docker compose exec db psql -U postgres -c "CREATE TABLE notes (t text); INSERT INTO notes VALUES (\'kept\');"`, puis `docker compose down && docker compose up -d --wait db && docker compose exec db psql -U postgres -c "SELECT * FROM notes;"`. Termine avec `docker compose down -v`.'
		],
		done: [
			'À l’étape 2, `web` affiche `db:5432 - no response` et `exit=2`.',
			'À l’étape 3, `web` affiche `db:5432 - accepting connections` et `exit=0`, et `docker compose ps` montre `db` en `(healthy)`.',
			'À l’étape 4, `env` montre seulement `POSTGRES_PASSWORD_FILE=/run/secrets/db-password`, et le fichier du secret contient `lab-secret`.',
			'À l’étape 5, le `SELECT` après `down` puis `up` renvoie toujours `kept`.'
		],
		solution: [
			'Le `depends_on` simple a démarré `web` dès que le conteneur `db` tournait, avant que PostgreSQL accepte les connexions.',
			'Le healthcheck plus `condition: service_healthy` a fait attendre Compose jusqu’à ce que `pg_isready` passe.',
			'Le mot de passe n’apparaît ni dans le YAML ni dans l’environnement, et le volume nommé a survécu à `down`. Seul `down -v` le supprime.'
		]
	},
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
