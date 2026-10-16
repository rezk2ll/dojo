const DJANGO = 'https://github.com/django/django/blob/d430084791a61b31cecec132bce3dca19194f7f2';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'what-is-architecture',
	part: 'Thinking like an architect',
	title: 'Architecture is the decisions that are expensive to change',
	minutes: 10,
	hook: [
		'Django\'s FAQ answers "Does Django scale?" with a yes, and this reason: Django uses a **"shared-nothing" architecture**, so you can add hardware at any level, database servers, caching servers or web servers.',
		'That one decision shapes every app built on it. A Django process keeps nothing between requests that another process would need. Sessions go to the database by default, not into memory. Change that rule late, and half your code has to move.',
		'That is what architecture is: **the few decisions that are expensive to change later, and that every other decision has to live with**. Your job as an architect is to make those decisions on purpose, and to know what each one costs.'
	],
	terms: [
		{ term: 'Architecture', def: 'The decisions that are hard to change later and shape everything else: how the system is split, where state lives, how parts talk.' },
		{ term: 'Trade-off', def: 'What you give up to get what you want. Every architecture decision has one.' },
		{ term: 'First law', def: '"Everything in software architecture is a trade-off." If you think you found a decision with no downside, you have not found the downside yet.' },
		{ term: 'Second law', def: '"Why is more important than how." Anyone can read **how** in the code. Only a written decision keeps the **why**.' },
		{ term: 'Stateless', def: 'A server that keeps nothing between requests. Any copy can answer any request because the state lives elsewhere.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['users(["Shoppers: browser and mobile"]) -->|HTTPS| lb["Load balancer"]', 'lb --> app1["Django app"]', 'app1 --> db[("PostgreSQL: orders, sessions")]'],
				highlight: ['users', 'lb', 'app1', 'db'],
				note: '**Launch day for a small online shop.** One app process, one database. Sessions live in the database, because that is Django\'s default.'
			},
			{
				add: ['app1 --> cache[("Redis: shared cache")]'],
				highlight: ['cache'],
				note: '**The shop gets busy.** Pages are cached. The cache is a separate server, not the app\'s own memory, so every process sees the same cached pages.'
			},
			{
				add: ['lb --> app2["Django app 2"]', 'lb --> app3["Django app 3"]', 'app2 --> db', 'app2 --> cache', 'app3 --> db', 'app3 --> cache'],
				highlight: ['app2', 'app3'],
				note: '**Black Friday.** Run more copies of the same app behind the load balancer. This only works because the app is **stateless**: any copy can serve any shopper, the state lives in PostgreSQL and Redis.'
			},
			{
				add: [],
				note: 'Notice what did **not** change between the three steps: the code. The decision "no state in the app process" is what made growing from one box to many a deployment change, not a rewrite.'
			}
		]
	},
	example: {
		title: 'django/conf/global_settings.py',
		repo: 'django/django',
		url: `${DJANGO}/django/conf/global_settings.py#L509-L526`,
		lang: 'python',
		code: `# The module to store session data
SESSION_ENGINE = "django.contrib.sessions.backends.db"
…
# The cache backends to use.
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
    }
}`,
		notes: [
			'Sessions default to the **database**. Any process can read any shopper\'s session, so the load balancer can send each request anywhere.',
			'The cache defaults to **local memory**. The Django docs are blunt about it: ["each process will have its own private cache instance, which means no cross-process caching is possible"](https://github.com/django/django/blob/d430084791a61b31cecec132bce3dca19194f7f2/docs/topics/cache.txt?plain=1#L426-L429). They call it "nice for development".',
			'So one default keeps the shared-nothing promise and one quietly breaks it once you run two copies. Moving the cache to Redis or Memcached is a small settings change on day one, and a hunt for stale data on day 300.',
			'Defaults are decisions too. Read them before you scale out.'
		]
	},
	tradeoff: {
		gain: [
			'You scale by adding copies. No copy is special.',
			'A copy can crash or be replaced during a deploy, and shoppers do not lose their cart.',
			'Each copy is simple: it reads state, does the work, writes state, forgets.'
		],
		cost: [
			'Every request pays a network trip to the database or cache for state that could have been in memory.',
			'The shared stores become the hard part. Adding app copies is easy, adding database capacity is not.',
			'Anything that wants to live in memory, like a local cache or an upload in progress, has to be moved out on purpose.'
		]
	},
	task: {
		prompt: 'A teammate on a video platform proposes keeping half-uploaded video chunks in the app\'s memory until the upload finishes, because it is faster. On the setup from step 3, what breaks?',
		hint: 'Look at step 3. Which copy receives the second chunk?',
		answer: [
			'The load balancer can send chunk 2 to **app 2**, which never saw chunk 1. The upload fails or corrupts.',
			'It breaks the "stateless app" decision. You would need sticky sessions (always the same copy per user) or a shared store for chunks.',
			'Sticky sessions are a new trade-off: a copy that dies takes its users\' uploads with it, and load spreads unevenly.',
			'The architect\'s move: not "no", but "this changes a decision we rely on, here is what it costs, is it worth it?"'
		]
	},
	quiz: [
		{
			q: 'Why can a shared-nothing web app run as several identical copies behind one load balancer?',
			options: ['Because each user gets their own server', 'Because the load balancer copies memory between the app processes', 'Because the app process keeps no state between requests, it all lives in shared stores like the database', 'Because the language runtime is fast'],
			answer: 2,
			why: 'Stateless processes are interchangeable. Any copy can answer any request, so you add copies to scale.'
		},
		{
			q: 'What makes a decision an **architecture** decision?',
			options: ['It is expensive to change later and other decisions depend on it', 'It is about the technology stack', 'It was taken by a senior person', 'It is written in an ADR'],
			answer: 0,
			why: 'Choosing a library can be architecture or not. The test is the cost of changing your mind later.'
		},
		{
			q: 'A Django app runs as two processes with the default `CACHES` setting. Process 1 caches a page. The next request for that page goes to process 2. What happens?',
			options: ['Process 2 reads the page from process 1\'s memory', 'Django copies the cache to the database', 'The request fails with an error', 'Process 2 misses the cache, because each process has its own private local-memory cache'],
			answer: 3,
			why: 'The default `LocMemCache` is per process. It keeps state in the app process, which is exactly what shared-nothing forbids. Point `CACHES` at a shared server before you run a second copy.'
		}
	],
	takeaway: 'Architecture is the short list of expensive-to-change decisions. For each one, know what it buys and what it costs.',
	sources: [
		{ title: 'Django FAQ, Does Django scale?', url: `${DJANGO}/docs/faq/general.txt?plain=1#L55-L66` },
		{ title: 'Django, global_settings.py: session and cache defaults', url: `${DJANGO}/django/conf/global_settings.py#L509-L526` },
		{ title: 'Django docs, Local-memory caching', url: `${DJANGO}/docs/topics/cache.txt?plain=1#L401-L429` },
		{ title: 'Richards & Ford, Fundamentals of Software Architecture, 2nd ed. (O\'Reilly, 2025)', url: 'https://www.developertoarchitect.com/books.html' },
		{ title: 'The laws of software architecture (DevIQ)', url: 'https://deviq.com/laws/laws-software-architecture/' }
	]
};
