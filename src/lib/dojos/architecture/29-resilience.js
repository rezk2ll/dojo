const R4J = 'https://github.com/resilience4j/resilience4j/blob/b7c0069802e373ed72dff0b817c270fbb6e966ba';
const ENVOY = 'https://github.com/envoyproxy/envoy/blob/76dfb8422a093b3c742360593176f46a0a9378bb';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'resilience',
	part: 'The pattern toolbox',
	title: 'Resilience: stop one failure from spreading',
	minutes: 10,
	hook: [
		'Black Friday, 9 a.m. The recommendations service of your online shop is slow. Each call takes 8 seconds instead of 80 milliseconds.',
		'Shoppers can still buy without recommendations, so the delay alone costs little. The real question is **whether the slowness spreads to other features**. If the product page and checkout share one pool of threads, checkout now waits behind recommendations, and nobody can pay.',
		'Day 15 covered timeouts and retries for a single call. The patterns here put limits between kinds of calls, so a slow dependency only blocks the feature that uses it. Michael Nygard calls them "stability patterns".'
	],
	terms: [
		{ term: 'Bulkhead', def: 'Separate pools, queues or limits per kind of work, so one kind can fill up without starving the others. Named after the walls in a ship\'s hull.' },
		{ term: 'Circuit breaker', def: 'After too many failures, stop calling a dependency for a while and fail at once. Then let a few trial calls through to see if it healed.' },
		{ term: 'Graceful degradation', def: 'The app keeps serving what still works and leaves out what does not. The page shows no recommendations, and checkout still works.' },
		{ term: 'Liveness vs readiness', def: 'A failed liveness probe makes Kubernetes restart the container. A failed readiness probe only stops traffic to the pod. A readiness problem checked in the liveness probe restarts healthy pods.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: [
					'shop["shop app"] -->|"25 calls at once max"| bhR["bulkhead: recommendations"]',
					'shop -->|"25 calls at once max"| bhP["bulkhead: payments"]',
					'bhP --> pay["payment provider"]',
					'class pay ext'
				],
				highlight: ['bhR', 'bhP'],
				note: 'Each dependency gets its own bulkhead, a limit on calls in flight. In resilience4j the default is [25 calls with no waiting](https://github.com/resilience4j/resilience4j/blob/b7c0069802e373ed72dff0b817c270fbb6e966ba/resilience4j-bulkhead/src/main/java/io/github/resilience4j/bulkhead/BulkheadConfig.java#L33-L34). Slow recommendations fill their own 25 slots, and payments still has its 25.'
			},
			{
				add: [
					'bhR --> cb["circuit breaker: recommendations"]',
					'cb -->|"slow today"| recs["recommendations service"]',
					'class recs ext'
				],
				highlight: ['cb', 'recs'],
				note: 'The circuit breaker watches the last calls. In resilience4j it opens when the failure rate [reaches 50% over the last 100 calls](https://github.com/resilience4j/resilience4j/blob/b7c0069802e373ed72dff0b817c270fbb6e966ba/resilience4j-circuitbreaker/src/main/java/io/github/resilience4j/circuitbreaker/CircuitBreakerConfig.java#L43-L48), and only after at least 100 calls. Open, it refuses calls for 60 seconds by default, then lets 10 trial calls through.'
			},
			{
				add: ['cb -.->|"open: fail at once"| fb["product page without recommendations"]'],
				highlight: ['fb'],
				note: 'When the breaker is open, a refused call returns at once instead of after 8 seconds. The shop catches it and renders the page without the recommendations box. The shopper sees a slightly emptier page, **not an error page**.'
			},
			{
				add: [
					'users(["shoppers and scrapers"]) -->|"over the limit: 429"| gw["gateway rate limit"]',
					'gw --> shop'
				],
				highlight: ['users', 'gw'],
				note: 'At the edge, a scraper hitting 50 pages a second gets fast `429`s from the gateway rate limit, before it costs a thread in the shop. A proxy can push back too (backpressure): when Envoy\'s limits on connections or pending requests overflow, it fails fast and sets the `x-envoy-overloaded` header.'
			},
			{
				add: ['probe["Kubernetes probes"] -.->|"liveness: is the process stuck?"| shop'],
				highlight: ['probe'],
				note: 'A failed liveness probe restarts the container. Restarting the shop does not heal the recommendations service, so an open breaker must not fail liveness. resilience4j\'s health indicator reports an open breaker as [`CIRCUIT_OPEN`, not `DOWN`](https://github.com/resilience4j/resilience4j/blob/b7c0069802e373ed72dff0b817c270fbb6e966ba/resilience4j-spring-boot3/src/main/java/io/github/resilience4j/springboot3/circuitbreaker/monitoring/health/CircuitBreakersHealthIndicator.java#L85-L98), unless you set `allowHealthIndicatorToFail`.'
			}
		]
	},
	example: {
		title: 'CircuitBreakerStateMachine.java, OpenState.tryAcquirePermission',
		repo: 'resilience4j/resilience4j',
		url: `${R4J}/resilience4j-circuitbreaker/src/main/java/io/github/resilience4j/circuitbreaker/internal/CircuitBreakerStateMachine.java#L739-L755`,
		lang: 'java',
		code: `        @Override
        public boolean tryAcquirePermission() {
            // Thread-safe
            if (clock.instant().isAfter(retryAfterWaitDuration)) {
                toHalfOpenState();
                // Check if the call is allowed to run in HALF_OPEN state after state transition
                // super.tryAcquirePermission() doesn't work right that's why the code is copied
                boolean callPermitted = stateReference.get().tryAcquirePermission();
                if (!callPermitted) {
                    publishCallNotPermittedEvent();
                    circuitBreakerMetrics.onCallNotPermitted();
                }
                return callPermitted;
            }
            circuitBreakerMetrics.onCallNotPermitted();
            return false;
        }`,
		notes: [
			'This method runs in the **open** state. Before the wait time is over, lines 15 and 16 return `false`, and the dependency is never touched. The caller then gets a [`CallNotPermittedException`](https://github.com/resilience4j/resilience4j/blob/b7c0069802e373ed72dff0b817c270fbb6e966ba/resilience4j-circuitbreaker/src/main/java/io/github/resilience4j/circuitbreaker/internal/CircuitBreakerStateMachine.java#L757-L763), and your code catches it to show the degraded page.',
			'Once the wait is over, line 5 moves the breaker to half-open on the first call that arrives. Half-open hands out a [fixed number of trial permits](https://github.com/resilience4j/resilience4j/blob/b7c0069802e373ed72dff0b817c270fbb6e966ba/resilience4j-circuitbreaker/src/main/java/io/github/resilience4j/circuitbreaker/internal/CircuitBreakerStateMachine.java#L1116-L1124), 10 by default, and line 8 asks for one. Calls beyond those 10 are refused.',
			'The results of the trial calls set the next state. [At or over the failure threshold, the breaker opens again, and below it, the breaker closes](https://github.com/resilience4j/resilience4j/blob/b7c0069802e373ed72dff0b817c270fbb6e966ba/resilience4j-circuitbreaker/src/main/java/io/github/resilience4j/circuitbreaker/internal/CircuitBreakerStateMachine.java#L1188-L1195).',
			'The state lives in an `AtomicReference` inside one process, so **each instance has its own breaker**: with 6 pods, there are 6 breakers that learn on their own. Envoy\'s docs say its limits are "fully distributed (not coordinated)".'
		]
	},
	tradeoff: {
		gain: [
			'A slow or broken dependency hurts only the feature that needs it, so checkout keeps working while recommendations recover.',
			'Fast refusals (`429`, an open breaker, a full bulkhead) free threads and memory at once, instead of holding them for 8 seconds each.',
			'A broken dependency gets fewer calls while it is down, which gives it room to recover.'
		],
		cost: [
			'A bulkhead isolates only the pools you split: two bulkheads still share the same CPU, memory and database. If the shared part is the slow one, the limits do not help.',
			'Every limit is a number to tune: 25 in flight is too low for a fast service and too high for a fragile one. The breaker\'s 100-call minimum means a low-traffic endpoint can fail for a long time before it trips.',
			'A breaker that trips too early refuses work a healthy service could do. Each pod has its own breaker, so for a while some pods refuse calls that others still send.'
		]
	},
	task: {
		prompt: 'Your SaaS invoicing app calls an external tax-rate API for every invoice. The tax API goes down for 10 minutes. Today each invoice waits 10 seconds, then fails with a `500`. Sketch a circuit breaker for that call: which errors count, what the user gets while it is open, and how it closes again.',
		hint: 'Three states: closed, open, half-open. Think about which errors mean "the tax API is sick" and which mean "this request was wrong". Is there a fallback that is still correct?',
		answer: [
			'Count only failures that say the tax API is sick: timeouts, connection errors, 5xx. A `400` for a bad address is the caller\'s fault and must not trip it. In resilience4j that is `recordExceptions` and `ignoreExceptions`.',
			'Count slow calls too, with a `slowCallDurationThreshold` well below the 10 seconds. A hanging API hurts as much as a failing one.',
			'While open, fail at once. Degrade honestly: save the invoice as a draft marked "tax pending" and finish it later. Never guess a tax rate.',
			'After a wait (`waitDurationInOpenState`), go half-open and let a few trial calls through. Good results close the breaker, bad ones reopen it.',
			'Make it visible: log every state change and graph it, so "tax API down" shows on a dashboard before support tickets arrive. Keep it out of the liveness probe.'
		],
		steps: [
			{
				title: 'Choose which errors count',
				questions: [
					{ q: 'Which failures should count toward tripping the breaker?', options: ['Timeouts, connection errors and 5xx', 'Every exception, `400` included', 'Only `400` answers', 'Only calls slower than 60 seconds'], answer: 0, why: 'Those say the tax API is sick. Other errors say something else.' },
					{ q: 'The tax API answers `400` for a bad address. Does it count?', options: ['Yes: an error is an error', 'No: it is the caller\'s fault, not a sick API', 'Only after 100 of them', 'Only in the half-open state'], answer: 1, why: 'A wrong request says nothing about the API\'s health, so it must not trip the breaker.' },
					{ q: 'In resilience4j, which settings choose what counts?', options: ['`waitDurationInOpenState`', '`allowHealthIndicatorToFail`', '`recordExceptions` and `ignoreExceptions`', 'Only `slowCallDurationThreshold`'], answer: 2, why: 'One lists the exceptions to record, the other the ones to ignore.' },
					{ q: 'Should slow calls count too?', options: ['No: only errors count', 'Yes, but only past the 10 seconds', 'Only when the answer is a 5xx', 'Yes, with a `slowCallDurationThreshold` well below the 10 seconds'], answer: 3, why: 'A hanging API hurts as much as a failing one.' }
				]
			},
			{
				title: 'Decide what the user gets',
				questions: [
					{ q: 'The breaker is open. What does the tax call do?', options: ['Fail at once', 'Wait 10 seconds, then fail', 'Retry until the API answers', 'Call the API anyway'], answer: 0, why: 'An open breaker refuses the call without touching the dependency, so no thread waits.' },
					{ q: 'What happens to the invoice?', options: ['It uses the last known tax rate', 'It is saved as a draft marked "tax pending" and finished later', 'It uses a 0% rate', 'The user gets a `500` page'], answer: 1, why: 'The draft keeps the work, and the tax is added once the API is back.' },
					{ q: 'Why never guess a tax rate?', options: ['Guessing is slower than waiting', 'The breaker blocks any guess', 'A fallback must stay correct, and a guessed rate may be wrong', 'The API would reject the invoice later'], answer: 2, why: 'Degrade honestly: leave the tax out rather than put a wrong one on an invoice.' },
					{ q: 'What is that behavior called?', options: ['Backpressure', 'A bulkhead', 'Rate limiting', 'Graceful degradation'], answer: 3, why: 'The app keeps serving what still works and leaves out what does not.' }
				]
			},
			{
				title: 'Close it again',
				questions: [
					{ q: 'After `waitDurationInOpenState`, which state comes next?', options: ['Closed', 'Half-open', 'Open again', 'Disabled'], answer: 1, why: 'The breaker does not trust the API at once. It tests it first.' },
					{ q: 'What happens in half-open?', options: ['A few trial calls go through', 'All calls go through', 'No call goes through', 'Calls go to a backup API'], answer: 0, why: 'resilience4j hands out a fixed number of trial permits, 10 by default.' },
					{ q: 'The trial calls go well. What next?', options: ['The breaker opens again', 'It stays half-open for good', 'The breaker closes', 'The pod restarts'], answer: 2, why: 'Below the failure threshold, the breaker closes and normal traffic resumes.' },
					{ q: 'The trial calls fail. What next?', options: ['The breaker closes', 'The pod restarts', 'It stays half-open for good', 'The breaker opens again'], answer: 3, why: 'At or over the failure threshold, it opens again and waits once more.' }
				]
			},
			{
				title: 'Make it visible',
				questions: [
					{ q: 'How do you make the breaker visible?', options: ['Log every state change and graph it', 'Log only the `500`s', 'Email support for each failed invoice', 'You do not: it heals on its own'], answer: 0, why: 'A state change is the moment the tax API got sick or got better.' },
					{ q: 'What does the graph give you?', options: ['A slower breaker', 'A threshold that tunes itself', 'Fewer calls to the tax API', '"Tax API down" on a dashboard before support tickets arrive'], answer: 3, why: 'You hear it from your own data, not from your customers.' },
					{ q: 'Should an open breaker fail the liveness probe?', options: ['Yes: the app is unhealthy', 'No: restarting the app does not heal the tax API', 'Yes, after 10 minutes', 'No: liveness only checks the disk'], answer: 1, why: 'A failed liveness probe restarts the container, and that fixes nothing here.' },
					{ q: 'The app runs on 6 pods. How many breakers are there?', options: ['1, shared by all pods', 'One per invoice', '6, each learning on its own', 'None: Kubernetes runs the breaker'], answer: 2, why: 'The state lives inside each process, so for a while some pods refuse calls that others still send.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'The recommendations service is slow. The shop gives recommendations and payments separate bulkheads of 25 calls each. What happens to checkout?',
			options: [
				'It slows down too, because both bulkheads share one pool of 25 threads',
				'It stops until recommendations recover, so pages stay consistent',
				'It keeps working: recommendations fill only their own 25 slots',
				'Its calls are refused too, because a full bulkhead opens every circuit breaker'
			],
			answer: 2,
			why: 'Each bulkhead has its own limit. Slow recommendation calls use up their own slots, and extra ones are refused. Payment calls still have their own 25.'
		},
		{
			q: 'Which check belongs in a **liveness** probe, the one that restarts the container?',
			options: [
				'A worker thread has been deadlocked for over a minute',
				'The circuit breaker to the recommendations service is open',
				'The database is not answering `select 1`',
				'The pod is still warming its cache'
			],
			answer: 0,
			why: 'Liveness should fail only when a restart is the fix, like a deadlock. A restart does not heal another service or the database. A warming cache is a readiness question: do not send traffic yet.'
		},
		{
			q: 'A resilience4j circuit breaker has been open for its full wait time. What happens on the next call?',
			options: [
				'It closes and lets all traffic through again',
				'It stays open until an operator resets it by hand',
				'It sends one call to every instance of the dependency at once',
				'It moves to half-open and lets a limited number of trial calls through'
			],
			answer: 3,
			why: 'In the open state, each call checks the clock. Once the wait is over, it moves to half-open, which hands out a fixed number of trial permits (10 by default). Their results decide whether it closes or opens again.'
		}
	],
	recall: {
		q: 'With resilience4j defaults, when does a circuit breaker open, and what does it do once it is open?',
		a: 'It opens when 50% of the last 100 calls failed, after at least 100 calls. It refuses calls for 60 seconds, then goes half-open and lets 10 trial calls decide whether it closes or opens again.'
	},
	sources: [
		{ title: 'Michael Nygard, Release It! Second Edition (Pragmatic Bookshelf)', url: 'https://pragprog.com/titles/mnee2/release-it-second-edition/' },
		{ title: 'Martin Fowler, CircuitBreaker', url: 'https://martinfowler.com/bliki/CircuitBreaker.html' },
		{ title: 'resilience4j, CircuitBreakerStateMachine.java', url: `${R4J}/resilience4j-circuitbreaker/src/main/java/io/github/resilience4j/circuitbreaker/internal/CircuitBreakerStateMachine.java#L687-L838` },
		{ title: 'Envoy docs, circuit breaking', url: `${ENVOY}/docs/root/intro/arch_overview/upstream/circuit_breaking.rst?plain=1#L6-L10` },
		{ title: 'Kubernetes, Liveness, readiness and startup probes', url: 'https://kubernetes.io/docs/concepts/workloads/pods/probes/' }
	]
};
