const COMPOSE = 'https://github.com/docker/awesome-compose/blob/30f4b7f6a6c3b0c0ecf4d4efb0de203c48d11562';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'docker-compose',
	part: 'Containers',
	title: 'Docker Compose: the whole stack in one file',
	minutes: 10,
	hook: [
		'Your app needs nginx, a backend and PostgreSQL. By hand that is three `docker run` lines with ports, a network, a volume and a password, typed in the right order. Miss one flag and the backend cannot find the database.',
		'Docker Compose writes all of it down in one YAML file. `docker compose up -d` starts the stack, `docker compose down` removes it. The same file runs on your laptop and on the test server.',
		'Compose can start the database container first, but PostgreSQL may not accept connections yet. A **healthcheck** tells Compose when the database is ready.'
	],
	terms: [
		{ term: 'Service', def: 'One component of the app in `compose.yaml` (web, backend, db). Compose runs one or more containers for it.' },
		{ term: 'Volume', def: 'Storage that outlives the container. A named volume (`db-data`) survives `docker compose down`. `down -v` removes it.' },
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
				note: 'Compose puts the three services on one default network for the project. Only `proxy` publishes a port to the host. The backend reaches the database **by its service name**, `db`.'
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
				note: 'The healthcheck runs `pg_isready` every 10 seconds. The process can be running for a while before PostgreSQL accepts connections. `pg_isready` passes only once it does.'
			},
			{
				add: [
					'be -.->|waits for healthy| hc'
				],
				highlight: ['be', 'hc'],
				note: 'Plain `depends_on` only waits until the database container is **running**. With `condition: service_healthy`, the backend starts only once the healthcheck passes, so its first connection does not get "connection refused".'
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
			'The file has no `networks:` key. Compose puts the three services on the default network, so the backend connects to `db` by name.',
			'Lines 23 and 24, `expose: 5432`, publish nothing to the host. They only record the port: other services on the shared network can reach any port of `db` anyway. Lines 34 and 35, `ports: 80:80` on `proxy`, are the only port open to the host.',
			'Lines 8 to 10 make `backend` wait for `db` to be **healthy**. Lines 36 and 37 give `proxy` the short form, `depends_on: [backend]`, which only waits for the backend container to start.',
			'Line 22, `POSTGRES_PASSWORD_FILE`, points at the mounted secret, so the password never sits in `environment`. Line 13, `image: postgres`, has no tag, so it means `latest`: pin it before this leaves your laptop (day 19).'
		]
	},
	tradeoff: {
		gain: [
			'The whole stack is one reviewed file in Git, not a list of `docker run` commands in someone\'s shell history.',
			'One command to start, stop or rebuild everything, the same way for every developer.',
			'Healthchecks and `depends_on` give a predictable startup order.'
		],
		cost: [
			'Compose runs every service on **one host**, with no failover to another machine and no rolling deploys across a fleet. Kubernetes handles those.',
			'You write every healthcheck yourself, and a weak one passes too early: it checks that the port is open while the app still refuses requests.',
			'A `.env` file fills `${VAR}` in the compose file, and `env_file:` on a service passes variables into its container. Mixing the two up is a classic cause of "why is my variable empty".'
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
		],
		steps: [
			{
				title: 'Explain the crash',
				questions: [
					{ q: '`web` logs "connection refused" from `db`. What does that tell you about `db` at that moment?', options: ['The password is wrong', 'Nothing accepted connections yet: PostgreSQL was still starting', '`web` used the wrong host name', 'The volume is full'], answer: 1, why: 'The name resolved and the packet arrived, but nothing accepted it. A wrong password would fail later, after the connection.' },
					{ q: 'Why does `web` fail only about one time in three?', options: ['It is a race: sometimes PostgreSQL is ready in time, sometimes not', 'The network drops one packet in three', 'Compose starts services in random order', 'The password is wrong one time in three'], answer: 0, why: 'The database process can run for a while before it accepts connections. Whether `web` connects first depends on timing.' },
					{ q: 'Why does it work after a restart?', options: ['Restarting clears the volume', 'Compose switches to a healthcheck', 'By then PostgreSQL is accepting connections', 'The restart picks a new port'], answer: 2, why: 'The second try comes later, after the database finished starting.' },
					{ q: '`db` has no `ports:` line. How can `web` still reach it on 5432?', options: ['It cannot: add `ports: 5432:5432`', 'Through the host\'s port 5432', 'Only after `expose: 5432` is added', 'Services on the project network reach any port of each other'], answer: 3, why: '`ports:` only publishes a port to the host. Inside the shared network, other services can reach any port of `db`.' }
				]
			},
			{
				title: 'Add a healthcheck',
				questions: [
					{ q: 'The check runs with `interval: 10s` and `retries: 5`. About how long can PostgreSQL fail it before `db` is marked unhealthy?', options: ['About 50 seconds', '10 seconds', '5 seconds', 'Forever: retries only add log lines'], answer: 0, why: 'Five failures in a row, ten seconds apart, mark the container unhealthy.' },
					{ q: 'You add the healthcheck to `db`, but `web` keeps plain `depends_on: [db]`. Does the crash stop?', options: ['Yes: Compose now waits for the check', 'No: plain `depends_on` ignores the health status', 'Yes, but only on the first `up`', 'No: healthchecks only run in Kubernetes'], answer: 1, why: 'The health status changes nothing until a service asks for it with `condition: service_healthy`.' },
					{ q: 'What do `interval` and `retries` set?', options: ['How long `web` waits before starting', 'How often the volume is backed up', 'How often the check runs, and how many failures mark it unhealthy', 'The connection timeout of `web`'], answer: 2, why: 'The container runs the command on a schedule. Its result is the health status.' },
					{ q: 'Why not just check that port 5432 is open?', options: ['Compose cannot test ports', 'Port checks need root', 'Port 5432 is never open inside the network', 'A weak check passes too early, while the app still refuses requests'], answer: 3, why: 'You write each healthcheck yourself. A weak one says "ready" before the service really is.' }
				]
			},
			{
				title: 'Wait for healthy',
				questions: [
					{ q: 'The password file is wrong, so `db` never becomes healthy. What happens to `web` on `docker compose up`?', options: ['It starts after a timeout anyway', 'It does not start, because `db` never passes its check', 'It starts and crashes, as before', 'Compose restarts `db` until it works'], answer: 1, why: 'With `condition: service_healthy`, `web` starts only once the check passes. A broken `db` now shows up as an unhealthy dependency, not as a crash in `web`.' },
					{ q: 'Later you put an nginx `proxy` in front, with `condition: service_healthy` on `web`. `web` has no healthcheck. Does that work?', options: ['No: `web` needs its own healthcheck first', 'Yes: Compose checks the port itself', 'Yes: `web` inherits the `db` healthcheck', 'Only with `restart: always`'], answer: 0, why: 'A service is healthy only by the result of its own healthcheck command. Without one, there is no status to wait for.' },
					{ q: 'With the fix, what does `web` see on its first connection?', options: ['"connection refused" once, then success', 'A timeout', 'A database that already accepts connections', 'An empty volume'], answer: 2, why: 'Compose starts `web` only after `pg_isready` passed.' },
					{ q: 'Does this make Compose fit for a fleet of servers?', options: ['Yes, with healthchecks it fails over', 'Yes, if each host runs the same file', 'Only with `depends_on`', 'No: Compose runs every service on one host'], answer: 3, why: 'Compose has no failover to another machine and no rolling deploys across a fleet. Kubernetes handles those.' }
				]
			},
			{
				title: 'Keep the password out',
				questions: [
					{ q: 'Which option keeps the password out of `compose.yaml` and out of the container environment?', options: ['A Compose `secret` read from a file, with `POSTGRES_PASSWORD_FILE`', '`POSTGRES_PASSWORD` under `environment`', 'A comment in the YAML', 'A build argument'], answer: 0, why: 'The secret appears in the container at `/run/secrets/...`, not in the YAML and not in the environment.' },
					{ q: 'Where does the secret file live?', options: ['Committed next to `compose.yaml`', 'Inside the image', 'In a file that is not committed', 'In the volume'], answer: 2, why: 'If the file is in Git, the password is in Git.' },
					{ q: 'You choose a git-ignored `.env` instead. How does the compose file use it?', options: ['`env_file: .env` fills `${DB_PASSWORD}` in the YAML', 'It references `${DB_PASSWORD}`, which Compose fills from `.env`', 'Compose ignores `.env`', 'You copy it into the image'], answer: 1, why: 'A `.env` file fills `${VAR}` in the compose file. `env_file:` is a different thing: it passes variables into a container.' },
					{ q: '`db` lists the secret under `secrets:`. `web` must log in with the same password. What does `web` need?', options: ['Nothing: secrets are shared with every service', 'The password under its `environment`', 'A copy of `db`\'s volume', 'Its own `secrets:` entry for the same secret'], answer: 3, why: 'A secret is mounted only in the services that list it. Listed on both, it appears in each at `/run/secrets/...`.' }
				]
			}
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
			why: 'Compose waits for the container process to be running. To wait until the database accepts connections, you need a healthcheck and `condition: service_healthy`.'
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
				'They are deleted with the containers, since the volume belongs to the stack',
				'They stay: `down` removes containers and networks, named volumes stay unless you add `-v`',
				'They are moved into the image so the next `up` can restore them',
				'They are kept only if the database was stopped cleanly before `down`'
			],
			answer: 1,
			why: 'By default `down` removes containers and the networks it created. Named volumes are removed only with `--volumes` (`-v`).'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Reproduce the "connection refused" race, fix it with a healthcheck, and check where the password and the data live.',
		steps: [
			'Make the project and a secret: `mkdir -p ~/compose-lab && cd ~/compose-lab && echo lab-secret > password.txt`.',
			'Write the racy file, where `web` is a client that connects once: `printf \'services:\\n  db:\\n    image: postgres:16\\n    environment:\\n      POSTGRES_PASSWORD_FILE: /run/secrets/db-password\\n    secrets: [db-password]\\n    volumes: [db-data:/var/lib/postgresql/data]\\n  web:\\n    image: postgres:16\\n    command: [pg_isready, -h, db, -U, postgres]\\n    depends_on: [db]\\nvolumes:\\n  db-data:\\nsecrets:\\n  db-password:\\n    file: password.txt\\n\' > compose.yaml`. Run `docker compose run --rm web; echo "exit=$?"`, then `docker compose down -v`.',
			'Fix it: rewrite the file with a healthcheck and a condition: `printf \'services:\\n  db:\\n    image: postgres:16\\n    environment:\\n      POSTGRES_PASSWORD_FILE: /run/secrets/db-password\\n    secrets: [db-password]\\n    volumes: [db-data:/var/lib/postgresql/data]\\n    healthcheck:\\n      test: [CMD, pg_isready, -U, postgres]\\n      interval: 2s\\n      retries: 15\\n  web:\\n    image: postgres:16\\n    command: [pg_isready, -h, db, -U, postgres]\\n    depends_on:\\n      db:\\n        condition: service_healthy\\nvolumes:\\n  db-data:\\nsecrets:\\n  db-password:\\n    file: password.txt\\n\' > compose.yaml`. Run `docker compose run --rm web; echo "exit=$?"` and `docker compose ps`.',
			'Find the password: `docker compose exec db env | grep POSTGRES`, then `docker compose exec db cat /run/secrets/db-password`.',
			'Test the volume: `docker compose exec db psql -U postgres -c "CREATE TABLE notes (t text); INSERT INTO notes VALUES (\'kept\');"`, then `docker compose down && docker compose up -d --wait db && docker compose exec db psql -U postgres -c "SELECT * FROM notes;"`. Finish with `docker compose down -v`.'
		],
		done: [
			'In step 2, `web` prints `db:5432 - no response` and `exit=2`.',
			'In step 3, `web` prints `db:5432 - accepting connections` and `exit=0`, and `docker compose ps` shows `db` as `(healthy)`.',
			'In step 4, `env` shows only `POSTGRES_PASSWORD_FILE=/run/secrets/db-password`, and the secret file holds `lab-secret`.',
			'In step 5, the `SELECT` after `down` and `up` still returns `kept`.'
		],
		solution: [
			'Plain `depends_on` started `web` as soon as the `db` container ran, before PostgreSQL accepted connections.',
			'The healthcheck plus `condition: service_healthy` made Compose wait for `pg_isready` to pass.',
			'The password never appears in the YAML or the environment, and the named volume survived `down`. Only `down -v` removes it.'
		]
	},
	recall: {
		q: 'What do you add so the backend starts only once PostgreSQL accepts connections?',
		a: 'A healthcheck on `db` (`pg_isready`, every 10 seconds) and `depends_on: { db: { condition: service_healthy } }` on the backend. Plain `depends_on` only waits for the container to run.'
	},
	sources: [
		{ title: 'Docker docs, Control startup order in Compose', url: 'https://docs.docker.com/compose/how-tos/startup-order/' },
		{ title: 'Docker docs, Networking in Compose', url: 'https://docs.docker.com/compose/how-tos/networking/' },
		{ title: 'Docker docs, Set environment variables in containers', url: 'https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/' },
		{ title: 'Docker docs, Compose file reference: services', url: 'https://docs.docker.com/reference/compose-file/services/' },
		{ title: 'Docker docs, docker compose down', url: 'https://docs.docker.com/reference/cli/docker/compose/down/' }
	]
};
