const REPO = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'containers',
	part: 'Seeing the system',
	title: 'Containers: what actually runs',
	minutes: 10,
	hook: [
		'Yesterday\'s context diagram drew the Mastodon server as one box. Now someone asks: "if I give you a new machine for it, what do you install?" The context diagram cannot answer. You need to open the box.',
		'C4 level 2 does that. Inside the system box you draw the **containers**: each thing that has to be running for the system to work. A server process, a database, an app running in the browser, a background worker.',
		'"Container" here does **not** mean Docker. Simon Brown chose the word so it says nothing about how the thing is run. It means a **runtime boundary**: a separate process or data store, something you start, stop, deploy and monitor on its own. Mastodon makes the difference easy to see: one Docker image in its `docker-compose.yml` runs as **two** containers.'
	],
	terms: [
		{ term: 'Container (C4)', def: 'Something that must be running for the system to work: a server app, a database, a browser app, a worker. One process or one data store.' },
		{ term: 'Container diagram', def: 'C4 level 2. The containers inside your system, what technology each one is, and how they talk.' },
		{ term: 'Process boundary', def: 'Code on the two sides of it cannot share memory. They talk over a network, a queue or a file, and either side can crash alone.' },
		{ term: 'Image', def: 'A packaged build, like `ghcr.io/mastodon/mastodon`. Not a container: the same image can start several different processes.' },
		{ term: 'Component', def: 'A part inside one container, like the `PostStatusService` class. It does not run on its own. That is level 3.' }
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
				note: 'The box, opened. The React app is a **container** of its own: it runs in the user\'s browser. The API is Rails, served by Puma. Live updates come from a **second server**, written in another language, with its own image.'
			},
			{
				add: [
					'web -->|"accounts, posts, follows"| pg[("PostgreSQL")]',
					'web -->|"feeds, cache, job queues"| redis[("Redis")]',
					'stream -->|"checks access tokens"| pg',
					'redis -->|"pub/sub: new posts"| stream'
				],
				highlight: ['pg', 'redis'],
				note: 'Two data stores. PostgreSQL holds what must never be lost. Redis holds home feeds and job queues, and it is also the **wire** to the streaming server: it subscribes to Redis channels and pushes what arrives to open WebSockets.'
			},
			{
				add: ['sidekiq["sidekiq: same image as web, worker command"] -->|"takes jobs"| redis', 'sidekiq --> pg'],
				highlight: ['sidekiq'],
				note: 'A **second container from the same image**: `sidekiq` runs `ghcr.io/mastodon/mastodon` with a different command. Same code, separate process. It fills home feeds, sends emails, and delivers posts to other servers.'
			},
			{
				add: ['web --> files[("Media: local volume or S3 bucket")]', 'sidekiq --> files', 'web -.->|"search, optional"| es[("Elasticsearch")]'],
				highlight: ['files', 'es'],
				note: 'Two more stores. Media files, on a shared volume or in a bucket. A bucket is still a container: someone else hosts it, but you own the data. **Elasticsearch** is optional: Mastodon supports full-text search "when Elasticsearch is available". An optional container is still a box, drawn dashed.'
			},
			{
				add: ['fedi["Other fediverse servers"] -->|"POST /inbox"| web', 'sidekiq -->|"ActivityPub deliveries"| fedi', 'class fedi ext'],
				highlight: ['fedi'],
				note: 'Yesterday\'s external box, now attached to **which container** talks to it. Other servers knock on `web`. Deliveries to them go out from `sidekiq`, after the user\'s request has already been answered.'
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
			'`web` and `sidekiq` name the **same image** and differ only by `command`. On a container diagram that is two boxes: they start, crash and scale apart. The [main Dockerfile](' + REPO + '/Dockerfile#L412-L416) ends on an `ENTRYPOINT` with no `CMD`, so whoever runs the image picks the role.',
			'`streaming` is a different image, built from [its own Dockerfile](' + REPO + '/streaming/Dockerfile#L109-L111). Different language, different port (4000), different scaling story.',
			'The `Procfile` for Heroku says it plainly: "For the streaming API, you need a separate app that shares Postgres and Redis" ([Procfile](' + REPO + '/Procfile#L4-L14)). Two containers, two shared stores.',
			'The streaming server reads PostgreSQL directly, to [check the access token](' + REPO + '/streaming/index.js#L383) of each connection. Two containers on one database means the schema is a contract between them.'
		]
	},
	tradeoff: {
		gain: [
			'Long-lived WebSockets in their own process. The scaling guide sizes Puma for short requests and the streaming server for open connections, and you scale each one apart.',
			'Web and worker from one image: one build, one version, two roles.',
			'Slow work in Sidekiq: a remote server that takes 30 seconds to answer slows a job, not a user\'s click.'
		],
		cost: [
			'More boxes to run. The [install guide](https://docs.joinmastodon.org/admin/install/) sets up PostgreSQL and Redis, then starts `mastodon-web`, `mastodon-sidekiq` and `mastodon-streaming`, and asks for an SMTP server too.',
			'Shared stores become contracts. Web, Sidekiq and streaming all read the same database and the same Redis. A change there touches all three.',
			'If Sidekiq stops, nothing errors. Posts are saved, but feeds and other servers stop receiving them until the jobs run.'
		]
	},
	task: {
		prompt: 'Sort these into "a container" or "not a container" for a Mastodon server. The list: PostgreSQL, the Sidekiq process, the `ghcr.io/mastodon/mastodon` image, the streaming server, the React web app, the `PostStatusService` class, Elasticsearch, the S3 bucket for media.',
		hint: 'Ask of each one: does it run (or store data) on its own? Can it crash while the rest keeps going?',
		answer: [
			'Containers: PostgreSQL, the Sidekiq process, the streaming server, the React web app (it runs in the browser), Elasticsearch (when enabled), and the S3 bucket (you own its data).',
			'Not containers: the image (a build, which becomes two containers: `web` and `sidekiq`) and `PostStatusService` (a class inside the Rails app, a component at level 3).',
			'The trap is the image. Same code does not mean same container. Sidekiq can die while the API keeps answering.'
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
			why: 'A container is a runtime boundary, not a build artifact. Different commands make different processes, so they are two containers that happen to share code.'
		},
		{
			q: 'In the C4 model, what makes something a container?',
			options: [
				'It is packaged as a Docker image',
				'It must be running (or storing data) for the system to work, as its own process or store',
				'It has its own Git repository',
				'It exposes a REST API'
			],
			answer: 1,
			why: 'Simon Brown defines a container as something that needs to be running for the system to work. A database with no API and a browser app with no Docker image are both containers.'
		},
		{
			q: 'Sidekiq is stopped, but `web` keeps running. A user publishes a post. What happens?',
			options: [
				'The API refuses the post with an error',
				'The post is saved and returned, but feeds and other servers get it only once Sidekiq runs again',
				'The web process runs the jobs itself instead',
				'The post is lost when Sidekiq restarts'
			],
			answer: 1,
			why: 'The request saves the post and only **enqueues** the delivery jobs in Redis. Nothing runs them until a Sidekiq process takes them. Separate containers fail separately, and this one fails quietly.'
		}
	],
	takeaway: 'A container is what you have to keep running. Draw one box per process or data store, not per image and not per feature.',
	sources: [
		{ title: 'C4 model, Container diagram', url: 'https://c4model.com/diagrams/container' },
		{ title: 'C4 model, what a container is', url: 'https://c4model.com/abstractions/container' },
		{ title: 'mastodon, docker-compose.yml', url: `${REPO}/docker-compose.yml` },
		{ title: 'mastodon, streaming/Dockerfile', url: `${REPO}/streaming/Dockerfile` },
		{ title: 'Mastodon docs, Scaling up your server (the three process types)', url: 'https://docs.joinmastodon.org/admin/scaling/' }
	]
};
