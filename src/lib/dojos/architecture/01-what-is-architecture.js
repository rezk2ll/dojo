const DJANGO = 'https://github.com/django/django/blob/d430084791a61b31cecec132bce3dca19194f7f2';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'what-is-architecture',
	part: 'Thinking like an architect',
	title: 'Software architecture: the decisions that are expensive to change',
	minutes: 10,
	hook: [
		'Django\'s FAQ answers "Does Django scale?" with a yes, and this reason: Django uses a **"shared-nothing" architecture**, so you can add hardware at any level, database servers, caching servers or web servers.',
		'Every app built on Django lives with that decision. A Django process keeps nothing between requests that another process would need. By default, sessions go to the database and stay out of process memory. If you change that rule late, half your code has to move.',
		'Architecture is the few decisions that are expensive to change later, and that every other decision depends on. As an architect, you make those decisions on purpose and you know what each one costs.'
	],
	terms: [
		{ term: 'Architecture', def: 'The decisions that are hard to change later and shape everything else: how the system is split, where state lives, how parts talk.' },
		{ term: 'Trade-off', def: 'What you give up to get what you want. The first law of software architecture says every decision has one: "Everything in software architecture is a trade-off."' },
		{ term: 'Stateless', def: 'A server that keeps nothing between requests. Any copy can answer any request because the state lives in another store.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['users(["Shoppers: browser and mobile"]) -->|HTTPS| lb["Load balancer"]', 'lb --> app1["Django app"]', 'app1 --> db[("PostgreSQL: orders, sessions")]'],
				highlight: ['users', 'lb', 'app1', 'db'],
				note: 'A small online shop launches with one app process and one database. Sessions are stored in the database, because that is Django\'s default.'
			},
			{
				add: ['app1 --> cache[("Redis: shared cache")]'],
				highlight: ['cache'],
				note: 'As traffic grows, the shop caches pages. The cache runs on a separate Redis server outside the app\'s memory, so every process sees the same cached pages.'
			},
			{
				add: ['lb --> app2["Django app 2"]', 'lb --> app3["Django app 3"]', 'app2 --> db', 'app2 --> cache', 'app3 --> db', 'app3 --> cache'],
				highlight: ['app2', 'app3'],
				note: 'On Black Friday, the shop runs more copies of the same app behind the load balancer. This works because the app is **stateless**: any copy can serve any shopper, and the state lives in PostgreSQL and Redis.'
			},
			{
				add: [],
				note: 'The code stayed the same across the three steps. Because the app process holds no state, going from one machine to three was a deployment change, with no rewrite.'
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
			'Line 2 stores sessions in the **database** by default. Any process can read any shopper\'s session, so the load balancer can send each request to any copy.',
			'Lines 4 to 8 put the cache in local memory by default. The Django docs: ["each process will have its own private cache instance, which means no cross-process caching is possible"](https://github.com/django/django/blob/d430084791a61b31cecec132bce3dca19194f7f2/docs/topics/cache.txt?plain=1#L426-L429). They call it "nice for development".',
			'The session default keeps the shared-nothing promise, and the cache default breaks it as soon as you run two copies. Moving the cache to Redis or Memcached is a small settings change on day one, and a hunt for stale data on day 300.',
			'Read the default settings of your framework before you run a second copy of the app.'
		]
	},
	tradeoff: {
		gain: [
			'You scale by adding identical copies, and the load balancer can send any request to any of them.',
			'A copy can crash or be replaced during a deploy, and shoppers keep their cart, because it is in the database.'
		],
		cost: [
			'Every request pays a network trip to the database or cache for state that could have been in memory.',
			'Adding app copies is easy, and adding capacity to the shared PostgreSQL and Redis servers is much harder.',
			'Anything that would sit in memory, like a local cache or an upload in progress, has to be moved to a shared store on purpose.'
		]
	},
	task: {
		prompt: 'A teammate on a video platform proposes keeping half-uploaded video chunks in the app\'s memory until the upload finishes, because it is faster. On the setup from step 3, what breaks?',
		hint: 'Look at step 3. Which copy receives the second chunk?',
		answer: [
			'The load balancer can send chunk 2 to **app 2**, which never saw chunk 1. The upload fails or ends up corrupted.',
			'The proposal puts state in the app process, against the "stateless app" decision. You would need sticky sessions (always the same copy per user) or a shared store for chunks.',
			'Sticky sessions bring a new trade-off: a copy that dies takes its users\' uploads with it, and load spreads unevenly.',
			'As the architect, you do not just say no. You say: "this changes a decision we rely on, here is what it costs, is it worth it?"'
		]
	},
	quiz: [
		{
			q: 'Why can a shared-nothing web app run as several identical copies behind one load balancer?',
			options: ['Because the load balancer pins each user to one copy, so no copy ever sees another user', 'Because the load balancer copies session memory between the app processes after each request', 'Because the app process keeps no state between requests, it all lives in shared stores like the database', 'Because each copy keeps its own sessions in memory and syncs them with the others in the background'],
			answer: 2,
			why: 'A stateless process reads all state from the shared stores. Any copy can answer any request, so you add copies to scale.'
		},
		{
			q: 'What makes a decision an **architecture** decision?',
			options: ['It is expensive to change later and other decisions depend on it', 'It is about the technology stack, like the language or framework', 'It was taken by a senior person, such as the lead architect', 'It is written down in an ADR and approved by the team'],
			answer: 0,
			why: 'Choosing a library can be architecture or not. The test is the cost of changing your mind later.'
		},
		{
			q: 'A Django app runs as two processes with the default `CACHES` setting. Process 1 caches a page. The next request for that page goes to process 2. What happens?',
			options: ['Process 2 reads the page from process 1\'s memory, since both share one cache', 'Django saves the cache to the database, so process 2 reads it from there', 'The request fails with an error, because process 1 holds a lock on the cache entry', 'Process 2 misses the cache, because each process has its own local-memory cache'],
			answer: 3,
			why: 'The default `LocMemCache` is per process. It keeps state in the app process, which is exactly what shared-nothing forbids. Point `CACHES` at a shared server before you run a second copy.'
		}
	],
	recall: {
		q: 'What makes a decision an architecture decision, and which Django decision is the example here?',
		a: 'It is expensive to change later and other decisions depend on it. In Django, the app process keeps no state between requests (sessions go to the database), so you scale by adding copies.'
	},
	sources: [
		{ title: 'Django FAQ, Does Django scale?', url: `${DJANGO}/docs/faq/general.txt?plain=1#L55-L66` },
		{ title: 'Django, global_settings.py: session and cache defaults', url: `${DJANGO}/django/conf/global_settings.py#L509-L526` },
		{ title: 'Django docs, Local-memory caching', url: `${DJANGO}/docs/topics/cache.txt?plain=1#L401-L429` },
		{ title: 'Richards & Ford, Fundamentals of Software Architecture, 2nd ed. (O\'Reilly, 2025)', url: 'https://www.developertoarchitect.com/books.html' },
		{ title: 'The laws of software architecture (DevIQ)', url: 'https://deviq.com/laws/laws-software-architecture/' }
	]
};
