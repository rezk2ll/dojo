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
