const COMPOSE = 'https://github.com/docker/awesome-compose/blob/30f4b7f6a6c3b0c0ecf4d4efb0de203c48d11562';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'docker-compose',
	part: 'Containers',
	title: 'Docker Compose: the whole stack in one file',
	minutes: 10,
	hook: [
		'Your app needs nginx, a backend and PostgreSQL. By hand that is three `docker run` lines with ports, a network, a volume and a password, typed in the right order. Miss one flag and the backend cannot find the database.',
		'**Compose** writes all of it down in one YAML file. `docker compose up -d` starts the stack, `docker compose down` removes it. Same file on your laptop and on the test server.',
		'The part that bites is **startup order**. Compose can start the database first, but "started" is not "ready". Today you learn how a **healthcheck** closes that gap.'
	],
	terms: [
		{ term: 'Service', def: 'One component of the app in `compose.yaml` (web, backend, db). Compose runs one or more containers for it.' },
		{ term: 'Network', def: 'Compose creates a default network for the project. Every service joins it and reaches the others **by service name**, like `db:5432`.' },
		{ term: 'Volume', def: 'Storage that outlives the container. A named volume (`db-data`) survives `docker compose down`. `down -v` removes it.' },
		{ term: 'Env file', def: 'Two kinds. A `.env` file in the project folder fills `${VAR}` in the compose file. `env_file:` on a service passes variables into its container.' },
		{ term: 'Healthcheck', def: 'A command the container runs on a schedule to say "I am ready". Its result is the container\'s health status.' },
		{ term: 'depends_on', def: 'Start order between services. With `condition: service_healthy`, Compose waits for the dependency\'s healthcheck to pass.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: [
					'subgraph net["Network: project_default"]',
					'proxy["proxy: nginx"] --> be["backend"]',
					'be --> db["db: postgres"]',
					'end',
					'user(["Browser"]) -->|port 80| proxy',
					'class user ext'
				],
				highlight: ['proxy', 'be', 'db'],
				note: 'Three **services** on one default **network**. Only `proxy` publishes a port to the host. The backend reaches the database by its service name, `db`.'
			},
			{
				add: [
					'vol[("Volume: db-data")]',
					'db --- vol'
				],
				highlight: ['vol'],
				note: 'The database writes to a **named volume**. Recreate the `db` container, upgrade it, run `down` and `up` again: the data stays.'
			},
			{
				add: [
					'hc["healthcheck: pg_isready"]',
					'hc -.->|healthy?| db'
				],
				highlight: ['hc'],
				note: 'A **healthcheck** runs `pg_isready` every 10 seconds. The process can be running for a while before PostgreSQL accepts connections. The healthcheck tells the two apart.'
			},
			{
				add: [
					'be -.->|waits for healthy| hc'
				],
				highlight: ['be', 'hc'],
				note: 'Plain `depends_on` only waits until the database container is **running**. With `condition: service_healthy`, the backend starts only once the healthcheck passes. No more "connection refused" on first boot.'
			},
			{
				add: [
					'sec["secret: db-password from a file"]',
					'sec -.-> be',
					'sec -.-> db',
					'class sec ext'
				],
				highlight: ['sec'],
				note: 'The password comes from a file and appears in both containers at `/run/secrets/db-password`. It is not in the YAML and not in the container environment.'
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
			'No `networks:` key at all. Compose puts the three services on the default network, so the backend connects to `db` by name.',
			'`expose: 5432` publishes nothing to the host. It only records the port: other services on the shared network can reach any port of `db` anyway. `ports: 80:80` on `proxy` is the one door from the host.',
			'`backend` waits for `db` to be **healthy**. `proxy` uses the short form, `depends_on: [backend]`, which only waits for the backend container to start.',
			'`POSTGRES_PASSWORD_FILE` points at the mounted secret, so the password never sits in `environment`. And `image: postgres` has no tag, so it means `latest`: pin it before this leaves your laptop (day 19).'
		]
	},
	tradeoff: {
		gain: [
			'The whole stack is one reviewed file in Git, not a list of `docker run` commands in someone\'s shell history.',
			'One command to start, stop or rebuild everything, the same way for every developer.',
			'Healthchecks and `depends_on` give a predictable startup order.'
		],
		cost: [
			'Compose runs on **one host**. No failover to another machine, no rolling deploys across a fleet. That is what Kubernetes is for.',
			'You write every healthcheck yourself. A weak one (the port is open, the app is not) gives false confidence.',
			'Two kinds of env files with two jobs is a classic source of "why is my variable empty".'
		]
	},
	task: {
		prompt: 'Your stack is `web` (a Python app) and `db` (PostgreSQL). On a fresh `docker compose up`, `web` crashes with "connection refused" about one time in three, then works after a restart. The compose file has `depends_on: [db]` on `web`. Fix it, and say how you would keep the database password out of the file.',
		hint: 'What does plain `depends_on` actually wait for? What would tell Compose the database is ready?',
		answer: [
			'Plain `depends_on` waits only until `db` is **running**, not until PostgreSQL accepts connections. That race explains the one in three.',
			'Add a `healthcheck` to `db` (for example `test: ["CMD", "pg_isready"]` with an `interval` and `retries`).',
			'Change `web` to `depends_on: { db: { condition: service_healthy } }`.',
			'Password: use a Compose `secret` from a file that is not committed, read through `POSTGRES_PASSWORD_FILE`. Or put it in a git-ignored `.env` and reference `${DB_PASSWORD}`.'
		]
	},
	quiz: [
		{
			q: 'In Compose, what does `depends_on: [db]` (without a condition) wait for before starting the dependent service?',
			options: [
				'Until the `db` container is running',
				'Until `db` accepts connections on its port',
				'Until the `db` healthcheck passes',
				'Nothing: it only documents the dependency'
			],
			answer: 0,
			why: 'Compose waits for the container to be running, not ready. You need a healthcheck and `condition: service_healthy` to wait for ready.'
		},
		{
			q: 'Your backend needs to reach the database in the same compose file. Which host name does it use?',
			options: [
				'`localhost`',
				'The host machine\'s IP address',
				'The database\'s service name, for example `db`',
				'Whatever IP `docker inspect` showed last time'
			],
			answer: 2,
			why: 'Every service joins the project network and is discoverable by its service name. `localhost` inside a container is the container itself.'
		},
		{
			q: 'You run `docker compose down` on a stack with a named volume `db-data`. What happens to the database files?',
			options: [
				'They are deleted with the containers',
				'They stay: `down` removes containers and networks, named volumes stay unless you add `-v`',
				'They are moved to the image',
				'They are kept only if the database was stopped cleanly'
			],
			answer: 1,
			why: 'By default `down` removes containers and the networks it created. Named volumes are removed only with `--volumes` (`-v`).'
		}
	],
	takeaway: 'Compose turns a pile of `docker run` commands into one file. Give stateful services a volume and a healthcheck, and make the rest wait for `service_healthy`.',
	sources: [
		{ title: 'Docker docs, Control startup order in Compose', url: 'https://docs.docker.com/compose/how-tos/startup-order/' },
		{ title: 'Docker docs, Networking in Compose', url: 'https://docs.docker.com/compose/how-tos/networking/' },
		{ title: 'Docker docs, Set environment variables in containers', url: 'https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/' },
		{ title: 'Docker docs, Compose file reference: services', url: 'https://docs.docker.com/reference/compose-file/services/' },
		{ title: 'Docker docs, docker compose down', url: 'https://docs.docker.com/reference/cli/docker/compose/down/' }
	]
};
