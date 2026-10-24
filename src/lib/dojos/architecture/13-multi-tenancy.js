const REPO = 'https://github.com/discourse/discourse/blob/9252651c5c25df36cb0a3cf3f06e0c9c30974d5a';
const MULTISITE = 'https://github.com/discourse/rails_multisite/blob/86c6ce96e2599d5fe20dd6024f1cdcc76f795da3';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'multi-tenancy',
	part: 'Inside a service',
	title: 'Multi-tenancy: whose data is this?',
	minutes: 10,
	hook: [
		'You host forums for a hundred customers. One Discourse install can serve all of them: Discourse calls this **multisite**. Before it does anything with a request, it has to answer one question: whose data is this? If it answers wrong once, one customer reads another\'s private topics.',
		'Discourse answers from the **host name** of the request. `forum.shop-a.example` is one site, `forum.shop-b.example` another. From there the site travels with every call: to its own PostgreSQL database, to every Redis key, into every background job.',
		'Tenants can share anything from one set of tables to nothing but the code, with one deployment each. Discourse multisite sits in the **middle** of that range: it shares the processes and gives each site its own database.'
	],
	terms: [
		{ term: 'Tenant', def: 'One customer whose data must stay separate from the others. In Discourse multisite, one tenant is one site, found by its host name.' },
		{ term: 'Multi-tenancy', def: 'One running system serving many tenants, instead of one copy per tenant.' },
		{ term: 'Isolation level', def: 'What tenants share: same tables, same server but own databases, or own deployment. More isolation costs more to run.' },
		{ term: 'Noisy neighbour', def: 'One tenant\'s load slowing down the others, because they share CPU, workers or a database.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['a(["forum.shop-a.example"]) -->|host name| mw["RailsMultisite::Middleware"]', 'b(["forum.shop-b.example"]) -->|host name| mw'],
				highlight: ['a', 'b', 'mw'],
				note: 'One set of processes for everyone. The middleware looks up the request\'s host in `config/multisite.yml`. Unknown host: **404 "not found"**, before Rails runs any controller.'
			},
			{
				add: ['mw -->|"establish_connection"| pg[("PostgreSQL: one database per site")]'],
				highlight: ['pg'],
				note: 'Each entry in `multisite.yml` names its own `database` and its `host_names`. The middleware connects to that database for this request. A query cannot reach another site\'s rows: **they are in another database**.'
			},
			{
				add: ['mw --> redis["Shared Redis: every key prefixed with the site name"]'],
				highlight: ['redis'],
				note: 'All sites share one Redis server. `DiscourseRedis` prefixes every key with the current site. To share a key between sites, code must call `without_namespace` on purpose.'
			},
			{
				add: ['mw -->|"Jobs.enqueue adds current_site_id"| sk["Shared Sidekiq queues and workers"]', 'sk -->|"with_connection(site)"| pg'],
				highlight: ['sk'],
				note: 'Background jobs from every site go to the **same queues**. Each job carries `current_site_id`, and the worker connects to that site\'s database before it runs. A burst of jobs from one site delays the jobs of every other site in those queues.'
			},
			{
				add: ['s1["Shared everything: one DB, tenant_id column"] -->|more isolation| s2["Shared processes, DB per tenant: Discourse multisite"] -->|more isolation| s3["Deployment per tenant"]'],
				highlight: ['s1', 's2', 's3'],
				note: 'Left: the cheapest, and one bad `WHERE` leaks data. Right: the strongest isolation, with one deployment to run and upgrade per customer. Multisite sits in the **middle**: isolated data, shared compute.'
			}
		]
	},
	example: {
		title: 'app/jobs/base.rb, Jobs.enqueue',
		repo: 'discourse/discourse',
		url: `${REPO}/app/jobs/base.rb#L379-L392`,
		lang: 'ruby',
		code: `  def self.enqueue(job, opts = {})
    if job.instance_of?(Class)
      klass = job
    else
      klass = "::Jobs::#{job.to_s.camelcase}".constantize
    end

    # Unless we want to work on all sites
    unless opts.delete(:all_sites)
      opts[:current_site_id] ||= RailsMultisite::ConnectionManagement.current_db
    end

    delay = opts.delete(:delay_for)
    queue = opts.delete(:queue)`,
		notes: [
			'Line 10 adds the **site**, which is the tenant key, to every job. Code that enqueues a job never has to name the site. Line 14 takes the queue from `opts[:queue]`, or else the job class picks it, never the site.',
			'On the worker side, [`Jobs::Base#perform`](https://github.com/discourse/discourse/blob/9252651c5c25df36cb0a3cf3f06e0c9c30974d5a/app/jobs/base.rb#L289-L300) runs the job inside `with_connection(db)` for that one site. With no `current_site_id`, it loops over `all_dbs`: **every site**.',
			'Line 9 skips the site only when the caller passes `all_sites: true`. In Redis, [`without_namespace`](https://github.com/discourse/discourse/blob/9252651c5c25df36cb0a3cf3f06e0c9c30974d5a/lib/discourse_redis.rb#L23-L26) carries the comment "Only use this if you want to store and fetch data that\'s shared between sites".',
			'The request side lives in Discourse\'s own gem: [the middleware](https://github.com/discourse/rails_multisite/blob/86c6ce96e2599d5fe20dd6024f1cdcc76f795da3/lib/rails_multisite/middleware.rb#L9-L30) returns 404 for an unknown host, then connects to the site\'s database for the rest of the request.'
		]
	},
	tradeoff: {
		gain: [
			'A query bug cannot leak data across sites: the other site\'s data is in another database.',
			'One site is one database, so it can be backed up, restored or moved on its own.',
			'Processes, Redis and workers are shared, so a quiet forum costs almost nothing. One install can hold many small sites.'
		],
		cost: [
			'Every site has a database to create and migrate. The Discourse docs target one site with `RAILS_DB=alternate rake db:migrate`.',
			'All sites share the Sidekiq queues. One site\'s burst of jobs waits in the same queues as the other sites\' jobs.',
			'Every code path that queues work must carry `current_site_id`. A job pushed straight to Sidekiq without it would run on every site.'
		]
	},
	task: {
		prompt: 'A large customer asks: "Can our forum run on servers no other customer uses?" Place three answers on the spectrum from the diagram, and give one cost of each.',
		hint: 'Each site already has its own database. What else could be separated: the database server, Redis and the workers, the whole deployment?',
		answer: [
			'Their own **database server**: each entry in `multisite.yml` is a database config (`adapter`, `database`), so it can name its own database `host`. Cost: one more server to run, while Redis and Sidekiq stay shared.',
			'Their own **workers**: nothing in the multisite code you read gives one site its own queues. The queue comes from the job or the caller, not from the site. To get their own workers, they need a separate install.',
			'A **dedicated deployment**: their own app, PostgreSQL, Redis and Sidekiq. Cost: one more full stack to upgrade and watch, for one customer.',
			'The architect\'s move: before picking, ask what they fear. Another tenant reading their data is already blocked by separate databases. Another tenant **slowing them down** needs separate compute.'
		],
		steps: [
			{
				title: 'See what is shared',
				questions: [
					{ q: 'A request arrives for `forum.shop-c.example`, a host that is not in `multisite.yml`. What happens?', options: ['It falls back to the first site in the file', 'The middleware answers 404 before Rails runs any controller', 'Rails creates a new site for it', 'It reaches the controller with no database'], answer: 1, why: 'The middleware is the first thing a request meets. A host it cannot map to a site never reaches Rails.' },
					{ q: 'Which part of the large customer\'s forum can you already back up, restore or move on its own?', options: ['Its Redis keys', 'Its queued Sidekiq jobs', 'Its database', 'Its app processes'], answer: 2, why: 'One site is one database. Redis, the queues and the processes hold every site at once.' },
					{ q: 'A developer needs one Redis key that every site can read. What must the code call?', options: ['`all_sites: true`', '`with_connection(site)`', '`establish_connection`', '`without_namespace`'], answer: 3, why: '`DiscourseRedis` prefixes every key with the current site. Sharing a key across sites takes `without_namespace`, on purpose.' },
					{ q: 'Where does multisite sit on the spectrum?', options: ['Left: shared everything, one database', 'Middle: shared processes, a database per site', 'Right: a deployment per tenant', 'Off the spectrum: it shares nothing'], answer: 1, why: 'Isolated data, shared compute. That is the middle of the diagram.' }
				]
			},
			{
				title: 'Split the database server',
				questions: [
					{ q: 'Can one site get its own database server?', options: ['Yes, each `multisite.yml` entry is a database config and can name its own `host`', 'No, all sites must share one database server', 'Only with a separate install', 'Only by forking `rails_multisite`'], answer: 0, why: 'An entry has `adapter` and `database` like any database config, so a `host` fits there too.' },
					{ q: 'What does that cost?', options: ['One full stack per customer', 'A tenant filter on every query', 'One more server to run, while Redis and Sidekiq stay shared', 'Leaving multisite for good'], answer: 2, why: 'It moves only the data. The processes, Redis and the workers are still shared.' },
					{ q: 'A release adds a migration. How does the team run it on the customer\'s database alone?', options: ['`rake db:migrate` already runs only the first site', '`RAILS_DB=<their site> rake db:migrate`', 'It cannot: migrations run on every site or none', 'By removing the other sites from `multisite.yml`'], answer: 1, why: 'Every site is a database to migrate. The Discourse docs target one with `RAILS_DB`.' },
					{ q: 'Which risk was already blocked before this change?', options: ['A burst of jobs in shared queues', 'Load on the shared processes', 'Memory use on the shared Redis', 'Another tenant reading their data'], answer: 3, why: 'Separate databases already stop a query from reaching another site\'s rows.' }
				]
			},
			{
				title: 'Split the compute',
				questions: [
					{ q: 'Can multisite give one site its own Sidekiq queues?', options: ['Yes, set a queue per site in `multisite.yml`', 'Yes, `Jobs.enqueue` picks the queue from the site', 'No, the queue comes from the job or the caller, never the site', 'No, Sidekiq allows only one queue'], answer: 2, why: '`Jobs.enqueue` takes the queue from `opts[:queue]` or the job class. The site plays no part.' },
					{ q: 'So how do they get workers no one else uses?', options: ['Pass `all_sites: true` on their jobs', 'A separate install', 'Call `without_namespace`', 'Add a `queue` key to their `multisite.yml` entry'], answer: 1, why: 'Nothing in the multisite code you read splits the workers per site. A separate install does.' },
					{ q: 'What does a dedicated deployment give them?', options: ['Their own app, PostgreSQL, Redis and Sidekiq', 'Only their own database', 'Only their own Redis keys', 'A larger share of the shared workers'], answer: 0, why: 'It is the right end of the spectrum: nothing shared but the code.' },
					{ q: 'What does a dedicated deployment cost?', options: ['Data leaks through Redis', 'Jobs that run on every site', 'A 404 for their host name', 'One more full stack to upgrade and watch, for one customer'], answer: 3, why: 'The strongest isolation means one more deployment to run and upgrade.' }
				]
			},
			{
				title: 'Ask what they fear',
				questions: [
					{ q: 'Before picking one, what do you ask them?', options: ['Which cloud they prefer', 'What they fear: their data being read, or being slowed down', 'How many admins they have', 'Whether they already use Redis'], answer: 1, why: 'The two fears need different answers, and one is already handled.' },
					{ q: 'They fear another tenant reading their data. What do you answer?', options: ['Separate databases already block that', 'They need a dedicated deployment', 'They need their own Redis server', 'They need their own workers'], answer: 0, why: 'Another site\'s data is in another database. A query bug cannot cross that line.' },
					{ q: 'They fear another tenant slowing them down. What do you answer?', options: ['Their own database is enough', 'Prefix their Redis keys', 'They need separate compute, so their own install', 'Return 404 to every other host'], answer: 2, why: 'A noisy neighbour comes from shared compute. Only separate workers and processes remove it.' },
					{ q: 'Why not give every customer a dedicated deployment?', options: ['It leaks data through shared tables', 'It needs a `tenant_id` column on every table', 'Sidekiq cannot run per customer', 'Each is a full stack to run, while shared compute makes a quiet forum cost almost nothing'], answer: 3, why: 'More isolation costs more to run. Multisite lets one install hold many small sites.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'In a multi-tenant system, what is a noisy neighbour?',
			options: ['A tenant who can read another tenant\'s data because a query forgot the tenant filter', 'A tenant whose load slows the others down, because they share compute, workers or a database', 'A tenant who sends so many support tickets that the team has no time left for the others', 'A server placed next to another in the same rack, so a hardware fault takes both down'],
			answer: 1,
			why: 'A tenant reading another tenant\'s data is a failure of data isolation. A noisy neighbour is a performance problem: it comes from the CPU, workers or database the tenants still share.'
		},
		{
			q: 'Discourse multisite gives each site its own database but shares Sidekiq. Which risk does that leave open?',
			options: ['A query returning another site\'s topics', 'Restoring one site without the others', 'One site\'s burst of jobs delaying the others', 'Moving one site to another database server'],
			answer: 2,
			why: 'Separate databases stop data leaks and make per-site restore easy. The Sidekiq queues are still shared, so one site\'s jobs can delay the others.'
		},
		{
			q: 'Why does `Jobs.enqueue` add `current_site_id` to every job by default?',
			options: ['For logging only, so each job line in the logs shows which site it came from', 'Because Sidekiq refuses to enqueue a job that has no site id in its payload', 'To route jobs from big sites to a faster queue with more workers behind it', 'So the shared worker runs the job in that site\'s database, not on every site'],
			answer: 3,
			why: 'Workers serve all sites. Without the site id, `perform` loops over `all_dbs`. With it, the job runs inside that one site\'s connection.'
		}
	],
	recall: {
		q: 'In Discourse multisite, what do the sites share, and what does each site get on its own?',
		a: 'The sites share the processes, one Redis server with keys prefixed by site, and the Sidekiq queues. Each site gets its own PostgreSQL database, picked from the request\'s host name.'
	},
	sources: [
		{ title: 'Discourse docs, Set up a multisite development environment', url: `${REPO}/docs/developer-guides/docs/02-development-environments/09-multisite-setup.md` },
		{ title: 'Discourse, app/jobs/base.rb, Jobs.enqueue', url: `${REPO}/app/jobs/base.rb#L379-L392` },
		{ title: 'Discourse, lib/discourse_redis.rb, keys namespaced per site', url: `${REPO}/lib/discourse_redis.rb#L1-L26` },
		{ title: 'rails_multisite, middleware.rb', url: `${MULTISITE}/lib/rails_multisite/middleware.rb#L9-L30` },
		{ title: 'AWS Well-Architected SaaS Lens, Silo, Pool, and Bridge Models', url: 'https://docs.aws.amazon.com/wellarchitected/latest/saas-lens/silo-pool-and-bridge-models.html' }
	]
};
