/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'degradation',
	part: 'Reliability',
	title: 'When a dependency is down',
	minutes: 10,
	hook: [
		'Black Friday, 10:02. The recommendation service of an online bookshop stops answering. It still accepts connections, but it sends nothing back.',
		'Each product page waits for the "You may also like" block. After 2 seconds every worker thread of every app server is waiting on it. The product pages, the cart and the checkout all time out, though none of them needs recommendations to work.',
		'The team wants the product page to load in under a second while the recommendation service is down.'
	],
	terms: [
		{ term: 'Timeout', def: 'The longest a caller waits for an answer before it gives up and moves on. Here, a setting on the HTTP client that calls the recommendation service.' },
		{ term: 'Fallback', def: 'What the code returns when a call fails or times out, like a stored list of best sellers instead of personal recommendations.' },
		{ term: 'Circuit breaker', def: 'A wrapper around a call that counts recent failures. Above a threshold it stops making the call for a while and fails at once, so the caller goes straight to its fallback.' }
	],
	kata: {
		brief: [
			'An online bookshop serves 3 000 product pages per second at peak from 30 app servers, so 100 pages per second each. Each server has 200 worker threads, and a page holds one thread until it is sent.',
			'A product page needs the book from the database (40 ms), price and stock (30 ms), and the recommendation block from a separate service (80 ms usually, 150 ms at the 99th percentile). Rendering takes 50 ms. Today the HTTP client waits up to 30 seconds for the recommendation service.',
			'The recommendation service can fail in two ways: it answers errors at once, or it accepts connections and never replies. In both cases the product page must load in **under 1 second** and still show some books under "You may also like".'
		],
		minutes: 10,
		checklist: [
			'Your design gives a number for how long a page waits for recommendations, and the page total stays under 1 second.',
			'Your design counts the threads held per server when the service hangs, and the count is under 200.',
			'Your design says what the page shows in the recommendation block when the call fails.',
			'Your design says how the app servers stop calling a service that keeps failing, and when they try it again.',
			'Your design says how the team learns that pages are showing the fallback.'
		],
		sample: [
			'The problem first. With a 30 second wait and 100 pages per second, a server needs 100 × 30 = 3 000 waiting threads when the service hangs. It has 200, so after 2 seconds every thread waits on recommendations and no page of any kind gets served.',
			'Time limit. The page calls the database, price and stock, and recommendations in parallel. The HTTP client for recommendations gets a **250 ms** timeout, above the 150 ms of the 99th percentile. The worst page is then 250 ms plus 50 ms of rendering: 300 ms. When the service hangs, each server holds 100 × 0.25 = 25 threads on it, out of 200.',
			'Fallback. Each app server keeps in memory the 20 best-selling books of each category, reloaded every 10 minutes from the database. When the call fails or times out, the block shows those books for the page’s category. This follows the Hystrix advice to "provide a generic response, without any network dependency, from an in-memory cache".',
			'Circuit breaker. The call goes through a Resilience4j `CircuitBreaker` with `failureRateThreshold` 50 (the default) over the last 100 calls, and `slowCallDurationThreshold` 250 ms with `slowCallRateThreshold` 50. By default every exception counts as a failure, timeouts included. At 100 calls per second, a dead service opens the breaker on each server in under 2 seconds.',
			'While the breaker is open, the call is rejected at once with `CallNotPermittedException`, and the page goes to the fallback with no 250 ms wait. After `waitDurationInOpenState`, set to 30 seconds, the breaker goes half open and lets 10 calls through (the default `permittedNumberOfCallsInHalfOpenState`). Below the thresholds it closes again, otherwise it stays open another 30 seconds.',
			'Seeing it. Each server counts fallbacks per minute and the state of its breaker, and an alert fires when more than 5% of pages used the fallback for 5 minutes. The 30 breakers decide alone, so for a few seconds some servers show personal books and others best sellers.',
			'The cost. During the outage every reader of a category sees the same 20 books, chosen without what that reader looked at before. A slow minute where the service answers in 300 ms also opens the breakers, and readers get best sellers for at least 30 seconds though the service still works.'
		]
	},
	quiz: [],
	recall: {
		q: 'In the sample, how many threads per server does a hung recommendation service hold, with the old wait and with the new one?',
		a: 'With 30 seconds: 100 × 30 = 3 000, more than the 200 threads, so the server stops. With the 250 ms timeout: 100 × 0.25 = 25 threads.'
	},
	sources: [
		{ title: 'Resilience4j documentation, CircuitBreaker', url: 'https://resilience4j.readme.io/docs/circuitbreaker' },
		{ title: 'Netflix Hystrix wiki, How it Works (Get the Fallback)', url: 'https://github.com/Netflix/Hystrix/wiki/How-it-Works' }
	]
};
