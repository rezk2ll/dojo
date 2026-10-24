const REPO = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'containers',
	part: 'Seeing the system',
	title: 'Containers: what actually runs',
	minutes: 10,
	hook: [
		'Yesterday\'s context diagram drew the Mastodon server as one box. Now someone asks: "if I give you a new machine for it, what do you install?" The context diagram has no answer, because it shows nothing inside the box.',
		'C4 level 2 opens the box. Inside the system box you draw the **containers**: each thing that has to be running for the system to work. A server process, a database, an app running in the browser, a background worker.',
		'"Container" here does not mean Docker. Simon Brown chose the word so it says nothing about how the thing is run. It means a **runtime boundary**: a separate process or data store that you start, stop, deploy and monitor on its own. In Mastodon\'s `docker-compose.yml`, one Docker image runs as two containers.'
	],
	terms: [
		{ term: 'Container (C4)', def: 'Something that must be running for the system to work, as one process or one data store: a server app, a database, a browser app, a worker.' },
		{ term: 'Container diagram', def: 'C4 level 2. The containers inside your system, what technology each one is, and how they talk.' },
		{ term: 'Process boundary', def: 'Code on the two sides of it cannot share memory. They talk over a network, a queue or a file, and either side can crash alone.' },
		{ term: 'Image', def: 'A packaged build, like `ghcr.io/mastodon/mastodon`. The same image can start several different processes, so one image can give several containers.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: [
					'spa(["Browser: React web app"]) -->|"REST API, HTTPS"| web["web: Rails under Puma"]',
					'spa -->|"WebSocket, live updates"| stream["streaming: Node.js"]'
				],
				highlight: ['spa', 'web', 'stream'],
				note: 'The React app is a container of its own, because it runs in the user\'s browser. The API is Rails, served by Puma. Live updates come from a **second server**, written in another language, with its own image.'
			},
			{
				add: [
					'web -->|"accounts, posts, follows"| pg[("PostgreSQL")]',
					'web -->|"feeds, cache, job queues"| redis[("Redis")]',
					'stream -->|"checks access tokens"| pg',
					'redis -->|"pub/sub: new posts"| stream'
				],
				highlight: ['pg', 'redis'],
				note: 'PostgreSQL holds accounts, posts and follows, the data that must never be lost. Redis holds home feeds and job queues. The streaming server also subscribes to Redis channels and pushes **what arrives there** to open WebSockets.'
			},
			{
				add: ['sidekiq["sidekiq: same image as web, worker command"] -->|"takes jobs"| redis', 'sidekiq --> pg'],
				highlight: ['sidekiq'],
				note: '`sidekiq` runs the same image, `ghcr.io/mastodon/mastodon`, with a different command, so it is a **second container from the same image**. It fills home feeds, sends emails, and delivers posts to other servers.'
			},
			{
				add: ['web --> files[("Media: local volume or S3 bucket")]', 'sidekiq --> files', 'web -.->|"search, optional"| es[("Elasticsearch")]'],
				highlight: ['files', 'es'],
				note: 'Media files go on a shared volume or in a bucket. A bucket counts as a container: someone else hosts it, but you own the data. Mastodon offers full-text search "when Elasticsearch is available", so **Elasticsearch** gets a dashed box.'
			},
			{
				add: ['fedi["Other fediverse servers"] -->|"POST /inbox"| web', 'sidekiq -->|"ActivityPub deliveries"| fedi', 'class fedi ext'],
				highlight: ['fedi'],
				note: 'Yesterday\'s external box now connects to the **container** that talks to it. Other servers send their posts to `web`. Deliveries to them go out from `sidekiq`, after the user\'s request has already been answered.'
			}
		]
	},
	example: {
		title: 'docker-compose.yml, one image, two containers',
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
			'Lines 3 and 17 name the **same image** for `web` and `sidekiq`, and only lines 6 and 20 (`command`) differ. They start, crash and scale apart, so they get two boxes. The [main Dockerfile](' + REPO + '/Dockerfile#L412-L416) ends on an `ENTRYPOINT` with no `CMD`, so whoever runs the image picks the role.',
			'Line 10: `streaming` is a different image, built from [its own Dockerfile](' + REPO + '/streaming/Dockerfile#L109-L111). It runs Node.js on port 4000, and you scale it on its own.',
			'The [`Procfile`](' + REPO + '/Procfile#L4-L14) for Heroku: "For the streaming API, you need a separate app that shares Postgres and Redis". The Rails app and the streaming app are two containers on the same PostgreSQL and Redis.',
			'The streaming server reads PostgreSQL directly, to [check the access token](' + REPO + '/streaming/index.js#L383) of each connection. With two containers on one database, a schema change has to work for both.'
		]
	},
	tradeoff: {
		gain: [
			'The long-lived WebSockets run in their own process. The scaling guide sizes Puma for short requests and the streaming server for open connections, and you scale each one apart.',
			'Web and worker come from one image: one build and one version for two roles.',
			'Slow work runs in Sidekiq: a remote server that takes 30 seconds to answer slows a job, and the user\'s click still gets a quick answer.'
		],
		cost: [
			'You run more processes. The [install guide](https://docs.joinmastodon.org/admin/install/) sets up PostgreSQL and Redis, then starts `mastodon-web`, `mastodon-sidekiq` and `mastodon-streaming`, and asks for an SMTP server too.',
			'Web, Sidekiq and streaming all read the same database and the same Redis. A change to what they store there has to work for all three.',
			'When Sidekiq stops, no request fails. Posts are saved, but feeds and other servers stop receiving them until the jobs run.'
		]
	},
	task: {
		prompt: 'Sort these into "a container" or "not a container" for a Mastodon server. The list: PostgreSQL, the Sidekiq process, the `ghcr.io/mastodon/mastodon` image, the streaming server, the React web app, the `PostStatusService` class, Elasticsearch, the S3 bucket for media.',
		hint: 'Ask of each one: does it run (or store data) on its own? Can it crash while the rest keeps going?',
		answer: [
			'Containers: PostgreSQL, the Sidekiq process, the streaming server, the React web app (it runs in the browser), Elasticsearch (when enabled), and the S3 bucket (you own its data).',
			'Not containers: the image (one build that runs as two containers, `web` and `sidekiq`) and `PostStatusService` (a class inside the Rails app, a component at level 3).',
			'The trap is the image. `web` and `sidekiq` share code but run as separate processes, so Sidekiq can die while the API keeps answering.'
		],
		steps: [
			{
				title: 'Set the test',
				questions: [
					{ q: 'Someone hands you a new machine for the Mastodon server. Which question does your sorted list answer?', options: ['Which external systems the server talks to', 'Which classes the Rails app holds', 'What to install and run on it', 'Who the users of the server are'], answer: 2, why: 'The context diagram shows nothing inside the box. The containers are what you install, start and monitor.' },
					{ q: 'Is a C4 "container" the same thing as a Docker container?', options: ['Yes: one box per Docker container', 'No: the word says nothing about how the thing is run', 'Yes, but only in production', 'No: it means a Kubernetes pod'], answer: 1, why: 'Simon Brown picked the word so it stays neutral about how things run. The React app, for one, runs in a browser.' },
					{ q: 'Two pieces of code sit on the two sides of a process boundary. What can they not do?', options: ['Talk over a network', 'Talk through a queue', 'Crash one without the other', 'Share memory'], answer: 3, why: 'They talk over a network, a queue or a file, and either side can crash alone.' },
					{ q: 'At which C4 level do containers appear?', options: ['Level 2', 'Level 1, context', 'Level 3, components', 'Level 4, code'], answer: 0, why: 'Level 2 opens the system box from the context diagram.' }
				]
			},
			{
				title: 'Sort what runs',
				questions: [
					{ q: 'PostgreSQL?', options: ['Not a container: it has no API of its own', 'A container: a data store that must be running', 'An external system', 'A component of `web`'], answer: 1, why: 'Accounts, posts and follows live there. A database with no API is still a container.' },
					{ q: 'The React web app?', options: ['Not a container: `web` serves it', 'Not a container: it has no Docker image', 'A container: it runs in the user\'s browser', 'An external system: the browser is not ours'], answer: 2, why: 'It runs on its own, in the browser, so it is a container of its own.' },
					{ q: 'The streaming server?', options: ['Part of the `web` container', 'A component inside Rails', 'An external system', 'A container: its own image, Node.js on port 4000'], answer: 3, why: 'It is built from its own Dockerfile and you scale it on its own.' },
					{ q: 'The Sidekiq process?', options: ['A container: it runs as its own process', 'Not a container: it shares the `web` image', 'A component of Redis', 'Part of the `web` container'], answer: 0, why: 'It starts, crashes and scales apart from `web`.' }
				]
			},
			{
				title: 'Sort the edge cases',
				questions: [
					{ q: 'Elasticsearch?', options: ['Never a container: it is optional', 'An external system', 'A container when enabled, drawn dashed', 'A component of PostgreSQL'], answer: 2, why: 'Mastodon offers search "when Elasticsearch is available", so it gets a dashed box.' },
					{ q: 'The S3 bucket for media?', options: ['A container: someone else hosts it, but you own the data', 'An external system: someone else hosts it', 'Not a container: it only holds files', 'A component of `web`'], answer: 0, why: 'What counts is who owns the data, not who runs the hardware.' },
					{ q: 'The `PostStatusService` class?', options: ['A container: it does work on its own', 'An external system', 'A container, since Sidekiq calls it', 'Not a container: a class inside the Rails app, a component at level 3'], answer: 3, why: 'A class runs inside a process. It cannot crash on its own.' },
					{ q: 'The streaming server reads PostgreSQL directly. Why does that matter?', options: ['It makes streaming part of `web`', 'A schema change has to work for both containers', 'It makes PostgreSQL an external system', 'It does not matter: reads are free'], answer: 1, why: 'Two containers on one database means one schema serves both.' }
				]
			},
			{
				title: 'Spot the image trap',
				questions: [
					{ q: 'The `ghcr.io/mastodon/mastodon` image?', options: ['A container: it is in `docker-compose.yml`', 'An external system: it lives on ghcr.io', 'Not a container: one build that runs as two containers, `web` and `sidekiq`', 'Two containers drawn in one box'], answer: 2, why: 'An image is only the build a container starts from.' },
					{ q: 'In `docker-compose.yml`, what differs between `web` and `sidekiq`?', options: ['The image', 'The `env_file`', 'The `restart` policy', 'The `command`'], answer: 3, why: 'Same image, different command: `puma` for one, `sidekiq` for the other.' },
					{ q: 'Sidekiq has been down for an hour. What does a graph of the API\'s error rate show?', options: ['Nothing unusual: no request fails', 'A spike of `500` errors', 'Failed logins for every user', 'Errors on every new post'], answer: 0, why: 'Separate processes fail apart. Posts are saved, and feeds and deliveries just stop, so you need to watch Sidekiq on its own.' },
					{ q: 'Mastodon\'s main Dockerfile ends on an `ENTRYPOINT` with no `CMD`. Why?', options: ['To make the image smaller', 'So whoever runs the image picks the role, web or worker', 'Because Sidekiq needs no command', 'So the image can run only one process'], answer: 1, why: 'The `command` line in `docker-compose.yml` picks `puma` or `sidekiq`, so one build serves both roles.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'In Mastodon\'s `docker-compose.yml`, `web` and `sidekiq` both use the image `ghcr.io/mastodon/mastodon`. How many boxes do they get on a **container** diagram?',
			options: [
				'One: same image, same container',
				'None: images belong on the deployment diagram only',
				'One, nested inside the Redis box because Sidekiq reads its jobs from Redis',
				'Two: each runs as its own process and can fail on its own'
			],
			answer: 3,
			why: 'A container is a running process or store, and an image is only the build it starts from. Different commands start different processes, so they are two containers that share code.'
		},
		{
			q: 'In the C4 model, what makes something a container?',
			options: [
				'It is packaged as a Docker image, so it can be started and stopped alone',
				'It must run (or hold data) for the system to work, as its own process or store',
				'It lives in its own Git repository and one team builds and releases it',
				'It exposes a REST API that the other parts of the system call over HTTPS'
			],
			answer: 1,
			why: 'Simon Brown defines a container as something that needs to be running for the system to work. A database with no API and a browser app with no Docker image are both containers.'
		},
		{
			q: 'Sidekiq is stopped, but `web` keeps running. A user publishes a post. What happens?',
			options: [
				'The API refuses the post with an error, because no worker can take its jobs',
				'The post is saved, but feeds and other servers get it only once Sidekiq runs again',
				'The web process sees Sidekiq is down and runs the delivery jobs itself',
				'The post is saved, but its queued jobs are dropped when Sidekiq restarts'
			],
			answer: 1,
			why: 'The request saves the post and only **enqueues** the delivery jobs in Redis. Nothing runs them until a Sidekiq process takes them, and the user sees no error in the meantime.'
		}
	],
	recall: {
		q: 'Mastodon\'s `docker-compose.yml` uses one image for `web` and `sidekiq`. How many containers is that, and why?',
		a: 'Two. They run different commands (`puma` and `sidekiq`), so they are separate processes that start, crash and scale apart. C4 draws one box per process or data store, not per image.'
	},
	sources: [
		{ title: 'C4 model, Container diagram', url: 'https://c4model.com/diagrams/container' },
		{ title: 'C4 model, what a container is', url: 'https://c4model.com/abstractions/container' },
		{ title: 'mastodon, docker-compose.yml', url: `${REPO}/docker-compose.yml` },
		{ title: 'mastodon, streaming/Dockerfile', url: `${REPO}/streaming/Dockerfile` },
		{ title: 'Mastodon docs, Scaling up your server (the three process types)', url: 'https://docs.joinmastodon.org/admin/scaling/' }
	]
};
