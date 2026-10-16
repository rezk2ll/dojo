const REPO = 'https://github.com/discourse/discourse/blob/9252651c5c25df36cb0a3cf3f06e0c9c30974d5a';
const MULTISITE = 'https://github.com/discourse/rails_multisite/blob/86c6ce96e2599d5fe20dd6024f1cdcc76f795da3';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'multi-tenancy',
	part: 'Inside a service',
	title: 'Multi-tenancy: whose data is this?',
	minutes: 10,
	hook: [
		'You host forums for a hundred customers. One Discourse install can serve all of them: Discourse calls this **multisite**. Before it does anything with a request, it has to answer one question: **whose data is this?** Get it wrong once and one customer reads another\'s private topics.',
		'Discourse answers from the **host name** of the request. `forum.shop-a.example` is one site, `forum.shop-b.example` another. From there the site travels with every call: to its own PostgreSQL database, to every Redis key, into every background job.',
		'How much tenants share is not yes or no. It is a **spectrum**: from everything shared to one deployment per tenant. Discourse multisite sits in the middle, on purpose, and pays for it in a specific way.'
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
				note: 'Redis is one server for all sites. `DiscourseRedis` prefixes every key with the current site. To share a key between sites, code must call `without_namespace` on purpose.'
			},
			{
				add: ['mw -->|"Jobs.enqueue adds current_site_id"| sk["Shared Sidekiq queues and workers"]', 'sk -->|"with_connection(site)"| pg'],
				highlight: ['sk'],
				note: 'Background jobs from every site go to the **same queues**. Each job carries `current_site_id`, and the worker connects to that site\'s database before it runs. This is where a noisy neighbour hurts.'
			},
			{
				add: ['s1["Shared everything: one DB, tenant_id column"] -->|more isolation| s2["Shared processes, DB per tenant: Discourse multisite"] -->|more isolation| s3["Deployment per tenant"]'],
				highlight: ['s1', 's2', 's3'],
				note: 'The spectrum. Left: cheapest, one bad `WHERE` leaks data. Right: strongest isolation, one deployment to run and upgrade per customer. Multisite sits in the **middle**: isolated data, shared compute.'
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
			'The **site is the tenant key**, and it is added for you. Code that enqueues a job never has to name the site. The queue comes from `opts[:queue]` or the job class, never from the site.',
			'On the worker side, [`Jobs::Base#perform`](https://github.com/discourse/discourse/blob/9252651c5c25df36cb0a3cf3f06e0c9c30974d5a/app/jobs/base.rb#L289-L300) runs the job inside `with_connection(db)` for that one site. With no `current_site_id`, it loops over `all_dbs`: **every site**.',
			'"No tenant" is said out loud. `all_sites: true` is an explicit flag, and [`without_namespace`](https://github.com/discourse/discourse/blob/9252651c5c25df36cb0a3cf3f06e0c9c30974d5a/lib/discourse_redis.rb#L23-L26) carries the comment "Only use this if you want to store and fetch data that\'s shared between sites".',
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
			'Shared Sidekiq queues mean noisy neighbours. One site\'s burst of jobs waits in the same queues as the other sites\' jobs.',
			'Every code path must carry the site. A job pushed straight to Sidekiq without `current_site_id` would run on every site.'
		]
	},
	task: {
		prompt: 'A large customer asks: "Can our forum run on servers no other customer uses?" Place three answers on the spectrum from the diagram, and give one cost of each.',
		hint: 'Each site already has its own database. What else could be separated: the database server, Redis and the workers, the whole deployment?',
		answer: [
			'Their own **PostgreSQL server**: each entry in `multisite.yml` is a database config (`adapter`, `database`), so it can name its own database `host`. Cost: one more server to run, while Redis and Sidekiq stay shared.',
			'Their own **workers**: nothing in the multisite code you read gives one site its own queues. The queue comes from the job or the caller, not from the site. Getting this means a separate install.',
			'A **dedicated deployment**: their own app, PostgreSQL, Redis and Sidekiq. Cost: one more full stack to upgrade and watch, for one customer.',
			'The architect\'s move: ask what they actually fear (another tenant **reading** their data, or another tenant **slowing them down**) before picking. The first is already handled. The second needs separate compute.'
		]
	},
	quiz: [
		{
			q: 'In a multi-tenant system, what is a noisy neighbour?',
			options: ['A tenant who can read another tenant\'s data because a query forgot the tenant filter', 'A tenant whose load slows the others down, because they share compute, workers or a database', 'A tenant who sends so many support tickets that the team has no time left for the others', 'A server placed next to another in the same rack, so a hardware fault takes both down'],
			answer: 1,
			why: 'Data leaks are an isolation problem. A noisy neighbour is a performance problem, caused by whatever the tenants still share.'
		},
		{
			q: 'Discourse multisite gives each site its own database but shares Sidekiq. Which risk does that leave open?',
			options: ['A query returning another site\'s topics', 'Restoring one site without the others', 'One site\'s burst of jobs delaying the others', 'Moving one site to another database server'],
			answer: 2,
			why: 'Separate databases stop data leaks and make per-site restore easy. The shared queues are where the noisy neighbour lives.'
		},
		{
			q: 'Why does `Jobs.enqueue` add `current_site_id` to every job by default?',
			options: ['For logging only, so each job line in the logs shows which site it came from', 'Because Sidekiq refuses to enqueue a job that has no site id in its payload', 'To route jobs from big sites to a faster queue with more workers behind it', 'So the shared worker runs the job in that site\'s database, not on every site'],
			answer: 3,
			why: 'Workers serve all sites. Without the site id, `perform` loops over `all_dbs`. With it, the job runs inside that one site\'s connection.'
		}
	],
	takeaway: 'Decide where tenants are separated (data, cache, compute) and make the tenant impossible to forget in code.',
	sources: [
		{ title: 'Discourse docs, Set up a multisite development environment', url: `${REPO}/docs/developer-guides/docs/02-development-environments/09-multisite-setup.md` },
		{ title: 'Discourse, app/jobs/base.rb, Jobs.enqueue', url: `${REPO}/app/jobs/base.rb#L379-L392` },
		{ title: 'Discourse, lib/discourse_redis.rb, keys namespaced per site', url: `${REPO}/lib/discourse_redis.rb#L1-L26` },
		{ title: 'rails_multisite, middleware.rb', url: `${MULTISITE}/lib/rails_multisite/middleware.rb#L9-L30` },
		{ title: 'AWS Well-Architected SaaS Lens, Silo, Pool, and Bridge Models', url: 'https://docs.aws.amazon.com/wellarchitected/latest/saas-lens/silo-pool-and-bridge-models.html' }
	]
};
