const REPO = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';
const SCALING = 'https://docs.joinmastodon.org/admin/scaling/';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'deployment',
	part: 'Seeing the system',
	title: 'Deployment: boxes on machines',
	minutes: 10,
	hook: [
		'It is 3 a.m. One machine stops answering. The question that matters is not "which container is on it" but **"does everybody go down, or only some?"**',
		'The container diagram cannot answer, because it says nothing about machines. The C4 **deployment diagram** does: it puts container instances on deployment nodes (servers, VMs, clusters) for one environment, like "production".',
		'Today we draw a Mastodon server grown past one machine, following its official scaling guide, and hunt its **single points of failure**. Some boxes are easy to copy. One box must **never** be copied.'
	],
	terms: [
		{ term: 'Deployment diagram', def: 'Where container instances run, on which machines or clusters, for one environment.' },
		{ term: 'Deployment node', def: 'A place things run: a physical server, a VM, a Kubernetes cluster, a pod, a browser. Nodes can be nested.' },
		{ term: 'Single point of failure (SPOF)', def: 'One box that, if it dies, takes the whole service down with it.' },
		{ term: 'Redundancy', def: 'Two or more copies so one can die. Only real if the copies do not share something that can also die.' },
		{ term: 'Singleton', def: 'A box that must run as exactly one copy. You cannot fix it by adding a second one.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: [
					'users(["Users and apps"]) --> lb["Load balancer, checks /health"]',
					'lb --> web["web VMs: Puma x2"]',
					'lb --> st["streaming: 3 processes, ports 4000 to 4002"]'
				],
				highlight: ['lb', 'web', 'st'],
				note: 'The guide puts several Puma servers behind a load balancer that watches `/health`, and runs several streaming processes behind nginx. Both are stateless: any copy can answer. **Lose one, the others keep serving.**'
			},
			{
				add: [
					'sk["sidekiq VMs: default, push, ingress, mailers, pull"]',
					'sch["sidekiq: scheduler queue, exactly 1"]'
				],
				highlight: ['sk', 'sch'],
				note: 'Sidekiq processes can be split by queue and multiplied. One rule from the guide: the `scheduler` queue "should never be run in more than one Sidekiq process at a time". A **singleton**, drawn once on purpose.'
			},
			{
				add: [
					'pgb["PgBouncer"] --> pg[("PostgreSQL primary")]',
					'pg -->|"streaming replication"| rep[("Read replica")]',
					'web --> pgb',
					'sk --> pgb'
				],
				highlight: ['pgb', 'pg', 'rep'],
				note: 'The guide counts about one database connection per Puma, Sidekiq and streaming thread. **More copies means more connections**, so the guide adds PgBouncer. A read replica takes some reads. Writes still go to **one** primary.'
			},
			{
				add: [
					'redis[("Redis, one instance")]',
					'web --> redis',
					'st --> redis',
					'sk --> redis',
					'sch --> redis'
				],
				highlight: ['redis'],
				note: 'Every process talks to Redis: feeds, job queues, the pub/sub that feeds streaming. The guide is blunt: if that one instance "goes down it can bring the entire Mastodon instance down as well". Its fix: Redis Sentinel.'
			},
			{
				add: [],
				highlight: ['redis', 'pg', 'sch'],
				note: 'Copied: web, streaming, most of Sidekiq. Drawn once: **Redis** and the **PostgreSQL primary**, which take everything down, and the **scheduler**, which takes nothing down at once but quietly stops the clock. The stateless boxes were the easy part.'
			}
		]
	},
	example: {
		title: 'config/sidekiq.yml, where the singleton is declared',
		repo: 'mastodon/mastodon',
		url: `${REPO}/config/sidekiq.yml#L1-L18`,
		lang: 'yaml',
		code: `---
:concurrency: <%= ENV.fetch('SIDEKIQ_CONCURRENCY', 5) %>
:queues:
  - [default, 8]
  - [push, 6]
  - [ingress, 4]
  - [mailers, 2]
  - [pull]
  - [scheduler]
  - [fasp]

:scheduler:
  :listened_queues_only: true
  :schedule:
    scheduled_statuses_scheduler:
      every: '5m'
      class: Scheduler::ScheduledStatusesScheduler
      queue: scheduler`,
		notes: [
			'By default **one** Sidekiq process listens to all seven queues. The [scaling guide](' + SCALING + '#sidekiq-queues) shows how to start separate processes with `-q`, so a flood of incoming activity (`ingress`) does not delay your own users\' jobs (`default`).',
			'`:listened_queues_only: true` is a [sidekiq-scheduler option](https://github.com/sidekiq-scheduler/sidekiq-scheduler/blob/abd0dbe43e25a0b23b8b507c69de1b709e0cc9bf/README.md?plain=1#L96): a process only pushes the cron jobs whose queue it listens to. So the process that listens to `scheduler` **is** the clock.',
			'What stops if the clock dies? Among others, [`ScheduledStatusesScheduler`](' + REPO + '/app/workers/scheduler/scheduled_statuses_scheduler.rb#L8-L20), every five minutes, which publishes posts users scheduled for later. Nobody gets an error. Scheduled posts just stop going out.',
			'`concurrency` defaults to 5 threads, and the guide says each thread "requires a database connection", so `DB_POOL` must be at least the thread count. On a deployment diagram, every new box also adds load on the one database.'
		]
	},
	tradeoff: {
		gain: [
			'Stateless web and streaming processes: one can die, or roll to a new version, while the load balancer sends traffic to the others.',
			'Sidekiq split by queue: incoming traffic from other servers cannot starve the jobs your own users wait for.',
			'PgBouncer and a read replica let you add processes without running PostgreSQL out of connections.'
		],
		cost: [
			'Redis stays a single point of failure until you add Sentinel, and Sentinel itself is more boxes to run.',
			'The scheduler is a singleton. You cannot make it redundant by copying it, so you must notice when it dies.',
			'More boxes, more moving parts: PgBouncer needs transaction pooling and `PREPARED_STATEMENTS=false`, and the guide says you cannot run `db:migrate` through it.'
		]
	},
	task: {
		prompt: 'A server runs: two web VMs behind a load balancer, one streaming process, one Sidekiq process with every queue (the default config), one PostgreSQL, one Redis. List the single points of failure, ranked by who they hurt, and say what you would change first.',
		hint: 'For each box drawn once, ask: if it dies, does the site go down, do live updates stop, or does some background work wait?',
		answer: [
			'**Redis** and **PostgreSQL**: either one down takes the whole server down. The worst ones.',
			'The **single Sidekiq process**: posts are still saved, but feeds, emails and deliveries to other servers wait. It also holds the scheduler, so scheduled posts stop.',
			'The **single streaming process**: apps stop getting live updates, but posting and reading still work.',
			'First change: Redis Sentinel (or a managed Redis with failover), because it is cheap next to the blast radius. Then a second Sidekiq process **without** the `scheduler` queue, so jobs survive one crash. Never a second one **with** it.'
		]
	},
	quiz: [
		{
			q: 'Two Puma servers sit behind a load balancer that checks `/health`. One of them crashes. What happens to users?',
			options: [
				'Everybody is logged out, because sessions lived on that server',
				'The site goes down until the server is restarted',
				'Requests go to the other server, and users keep working',
				'Half of the users get errors until the DNS changes'
			],
			answer: 2,
			why: 'Any Puma copy can answer any request: the session is in a cookie, the data in PostgreSQL, Redis and media storage that both copies share. The health check takes the dead copy out, and the other one answers.'
		},
		{
			q: 'What does Mastodon\'s scaling guide say about the `scheduler` Sidekiq queue?',
			options: [
				'It should run in as many processes as possible, for safety',
				'It should never run in more than one Sidekiq process at a time',
				'It must run on the same machine as PostgreSQL',
				'It is optional and can be removed'
			],
			answer: 1,
			why: 'The guide lets you run as many Sidekiq processes as you need, with one exception: the `scheduler` queue runs in one process only. It is a singleton, not something you make redundant by copying.'
		},
		{
			q: 'A Mastodon server runs a single Redis instance. Per the scaling guide, what can happen if it goes down, and what does the guide offer?',
			options: [
				'Only caching stops, feeds and jobs keep running. Nothing to do',
				'Only the streaming server stops. Add more streaming processes',
				'It can bring the whole instance down. Use Redis Sentinel for failover',
				'Sidekiq falls back to PostgreSQL for its job queues. Nothing to do'
			],
			answer: 2,
			why: 'Feeds, job queues and streaming all depend on Redis, so the guide calls it critical. Sentinel watches the instances and points clients to a new primary when one goes down.'
		}
	],
	takeaway: 'For each box on the deployment diagram, ask "if this dies, who goes down?" Stateless boxes are easy to double. Shared stores and singletons are the ones to design for.',
	sources: [
		{ title: 'C4 model, Deployment diagram', url: 'https://c4model.com/diagrams/deployment' },
		{ title: 'Mastodon docs, Scaling up your server', url: SCALING },
		{ title: 'Mastodon docs, Redis Sentinel for high availability', url: `${SCALING}#redis-sentinel` },
		{ title: 'mastodon, config/sidekiq.yml', url: `${REPO}/config/sidekiq.yml` },
		{ title: 'mastodon, docker-compose.yml', url: `${REPO}/docker-compose.yml` }
	]
};
