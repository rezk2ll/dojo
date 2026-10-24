const REPO = 'https://github.com/rails/rails/blob/8b25b80042db6c5498976ed0f5fd01b6764c0146';
const CACHE = `${REPO}/activesupport/test/cache`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'testing-strategy',
	part: 'Built to last',
	title: 'Testing strategy',
	minutes: 10,
	hook: [
		'Your shop\'s order service publishes `order.placed` with the customer\'s `firstName`. The email service uses it to write "Hello Ana". Both teams test their side, and both suites pass: the order service checks the message it publishes, and the email service feeds its handler a message written by hand.',
		'Now picture a cleanup in the order service: `firstName` is renamed to `givenName`, and its test is updated in the same commit, so it passes. The email service\'s hand-written message still says `firstName`, so its tests stay green too. In production every email starts with **"Hello ,"**. No test failed, because no test ever put the two sides together.',
		'More tests of each kind would not have caught it, because each new test would also use one side\'s copy of the message. A testing strategy says which test protects which decision. Fast tests guard what one service decides alone, and **contract tests** guard what two services agreed on. A few end-to-end tests check that the services are connected.'
	],
	terms: [
		{ term: 'Test double', def: 'A stand-in for something your code talks to: an in-memory store, a stub payment API, a hand-written message. It makes tests fast, and it is only as true as the last time someone compared it with the real thing.' },
		{ term: 'Contract test', def: 'A test that checks a double against the real thing it stands for. Fowler: "These check that all the calls against your test doubles return the same results as a call to the external service would."' },
		{ term: 'Consumer-driven contract', def: 'Each consumer writes down the part of a message or API it actually reads, and the producer runs those expectations in its own CI. The Pact tool implements this pattern.' },
		{ term: 'End-to-end test', def: 'The built system, driven the way a user would. Slow and broad, so keep a few that prove the pieces are wired together.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['unit["Unit: price rules, no I/O"] -->|"protects"| d1["A discount never makes a total negative"]'],
				highlight: ['unit', 'd1'],
				note: 'Unit tests are the many fast tests at the bottom of the test pyramid. The order service\'s price tests call pure functions with literal carts, in milliseconds. They guard a rule that lives **in one place**, so one fast test is enough.'
			},
			{
				add: ['integ["Integration: order service on a real Postgres"] -->|"protects"| d2["A retried order is saved once"]', 'integ -.->|"fakes"| fakes["Payment API, email service"]', 'class fakes ext'],
				highlight: ['integ', 'd2', 'fakes'],
				note: 'An integration test sits one level up. The "saved once" rule lives in a unique index and a transaction, so the test needs **the real database**. Everything the service does not own is a double: the payment API, the email service.'
			},
			{
				add: ['beh["CacheStoreBehavior: written once"] --> mem["MemoryStore"]', 'beh --> redis[("RedisCacheStore on a real Redis")]'],
				highlight: ['beh', 'mem', 'redis'],
				note: 'Rails has a contract test for a double it owns: it writes its cache tests once, as a module of behaviors. The memory store, the file store, Memcached and Redis each include it. Any test that uses the fast memory store can trust it to **behave like the real ones** on everything those shared modules test.'
			},
			{
				add: ['producer["Orders test: what it publishes"] -.->|"no test compares them"| consumer["Email fixture: what it reads"]', 'class producer ext'],
				highlight: ['producer', 'consumer'],
				note: 'The email fixture is a double of a message that the order service owns. The message exists in two hand-written copies, each checked only against its own code. This dotted line is where a **consumer-driven contract** belongs.'
			},
			{
				add: ['e2e["E2E: checkout in a browser, stub payment"] -->|"protects"| d5["A paid cart becomes an order and an email"]'],
				highlight: ['e2e', 'd5'],
				note: 'At the top are a handful of browser tests on the built system. Even they use doubles: a stub payment provider, maybe a fake mail inbox. With those stand-ins, the test checks that the services are connected, and never compares the real payment API with its stub.'
			}
		]
	},
	example: {
		title: 'activesupport/test/cache/stores/memory_store_test.rb: one contract, many stores',
		repo: 'rails/rails',
		url: `${CACHE}/stores/memory_store_test.rb#L7-L26`,
		lang: 'ruby',
		code: `class StoreTest < ActiveSupport::TestCase
  def lookup_store(options = {})
    ActiveSupport::Cache.lookup_store(:memory_store, options)
  end
end

class MemoryStoreTest < StoreTest
  include CacheStoreBehavior
  include CacheStoreVersionBehavior
  include CacheStoreCoderBehavior
  include CacheStoreCompressionBehavior
  include CacheStoreSerializerBehavior
  include CacheDeleteMatchedBehavior
  include CacheIncrementDecrementBehavior
  include CacheInstrumentationBehavior
  include CacheLoggingBehavior

  def setup
    @cache = lookup_store(expires_in: 60)
  end`,
		notes: [
			'Line 8 includes [`CacheStoreBehavior`](' + CACHE + '/behaviors/cache_store_behavior.rb#L6-L19), which opens with "Tests the base functionality that should be identical across all cache stores." Its tests only talk to `@cache`. Lines 18 to 20 build the store for this class in `setup`, and lines 8 to 16 include the behaviors.',
			'[`RedisCacheStoreCommonBehaviorTest`](' + CACHE + '/stores/redis_cache_store_test.rb#L231-L242) includes `CacheStoreBehavior` too, against a real Redis built in its `setup`. `MemCacheStoreTest` does the same against a real Memcached.',
			'Line 13 includes `CacheDeleteMatchedBehavior` for the memory store, and Memcached does not include it. Memcached includes `FailureSafetyBehavior` and `ConnectionPoolBehavior`, and the memory store does not. The contract is split into modules so a store can say exactly which parts it promises.',
			'The real stores need Redis and Memcached running. The Redis setup says `skip "Redis server is not up" unless REDIS_UP`, and [Memcached\'s](' + CACHE + '/stores/mem_cache_store_test.rb#L63-L64) does the same. A machine without them still runs the memory store\'s tests, and skips the comparison without failing.',
			'Two services in two repos cannot share a Ruby module, so consumer-driven contracts write the expectation down as data (a pact). In Pact\'s terms, for queues "the consumer is the application that reads the message" and the provider is the one that writes it. For messages, each interaction holds "the minimal expected message", the parts the consumer wants to use. For HTTP, in provider verification the provider\'s real response "is compared with the minimal expected response".'
		]
	},
	tradeoff: {
		gain: [
			'Most tests run in milliseconds or seconds, with no other team\'s service up. A red test points at one function or one handler.',
			'Doubles let each team test and ship on its own schedule.',
			'A contract test catches the renamed field in the producer\'s CI, before the deploy, instead of in production.',
			'Keeping end-to-end tests few keeps them fast enough to run on every pull request.'
		],
		cost: [
			'Each double copies someone else\'s behavior, and the copy drifts when the original changes (day 17). The `order.placed` message has two copies, so a rename must be made in both.',
			'A contract test needs both teams: the consumer writes the expectation, the producer runs it, and someone must own a red build in a repo that did not change.',
			'Tests on a real store need that store in CI. Rails skips its Redis and Memcached tests when they are not up, so a missing service can hide as a green run.',
			'An end-to-end suite that uses its own copy of a message stays green when the real message changes.'
		]
	},
	task: {
		prompt: 'For each decision in the shop, name the cheapest test that protects it, which service\'s CI runs it, and what is real or a double. (a) A discount never makes a total negative. (b) A retried order is saved once. (c) The in-memory order repository behaves like the Postgres one. (d) `order.placed` still carries every field the email service reads. (e) A paid cart in the browser becomes an order and an email.',
		hint: 'Ask who owns the decision. If one service owns it alone, its own CI can guard it. If two services share it, the test has to run where the change would be made.',
		answer: [
			'(a) A **unit** test of the price function in the order service. It needs no double, because the function does no I/O.',
			'(b) An **integration** test in the order service: the handler on a real Postgres, because the rule lives in a unique index and a transaction. The payment API and the email service are doubles.',
			'(c) An **adapter contract** test in the order service: one shared set of repository tests, run against the memory version and against Postgres in Docker, the way Rails runs `CacheStoreBehavior` against its memory, file, Memcached and Redis stores.',
			'(d) A **consumer-driven contract**. The email service publishes the fields it reads (a pact or a schema). The order service\'s CI runs its real published message through it. A cheaper first step: the order service writes its captured message to a fixture file, and the email service loads that file instead of a hand-written copy.',
			'(e) An **end-to-end** test on the built system, with a stub payment provider. Keep it few: it is the slowest of the five.',
			'If you put (d) in the end-to-end suite, look again: a suite that publishes its own copy of the message stays green.'
		],
		steps: [
			{
				title: 'Ask who owns each decision',
				questions: [
					{ q: 'Who owns (a), the rule that a discount never makes a total negative?', options: ['The email service', 'Both services together', 'The order service alone', 'The payment provider'], answer: 2, why: 'The price rule lives in one place, in the order service, so its own CI can guard it.' },
					{ q: 'Who owns (d), the fields of `order.placed` that the email service reads?', options: ['The order service alone, since it publishes', 'Both: the order service writes it and the email service reads it', 'The email service alone, since it reads', 'Nobody, since it is only a message'], answer: 1, why: 'Two services agreed on that shape. A shared decision needs a test that puts the two sides together.' },
					{ q: 'If one service owns a decision alone, where does its test run?', options: ['In that service\'s own CI', 'In a shared end-to-end suite', 'In every consumer\'s CI', 'Only in production monitoring'], answer: 0, why: 'A rule that lives in one service is guarded by one fast test in that service.' },
					{ q: 'If two services share a decision, where must the test run?', options: ['Only in the consumer\'s CI', 'In a nightly job owned by nobody', 'In the end-to-end suite only', 'Where the change would be made'], answer: 3, why: 'The test has to fail in the CI of the team that is about to break it, before the deploy.' }
				]
			},
			{
				title: 'Guard what one service owns',
				questions: [
					{ q: 'Which test protects (a)?', options: ['An integration test on Postgres', 'A unit test of the price function', 'An end-to-end checkout test', 'A contract test with the email service'], answer: 1, why: 'The price function does no I/O. A unit test with literal carts runs in milliseconds.' },
					{ q: 'What does the (a) test need as doubles?', options: ['A fake database', 'A stub payment API', 'Nothing: the function does no I/O', 'A hand-written `order.placed` message'], answer: 2, why: 'Pure functions take plain inputs. There is nothing to stand in for.' },
					{ q: 'Which test protects (b), a retried order saved once?', options: ['An integration test on a real Postgres', 'A unit test with an in-memory store', 'An end-to-end test in the browser', 'A consumer-driven contract'], answer: 0, why: 'The rule lives in a unique index and a transaction, so the test needs the real database.' },
					{ q: 'In the (b) test, what is a double?', options: ['The Postgres database', 'The order handler', 'The unique index', 'The payment API and the email service'], answer: 3, why: 'Everything the order service does not own is a double. Its database is what the rule depends on, so it stays real.' }
				]
			},
			{
				title: 'Check the double against the real thing',
				questions: [
					{ q: 'What kind of test protects (c), the in-memory repository behaving like Postgres?', options: ['An adapter contract test', 'A unit test of the memory repository alone', 'A consumer-driven contract', 'An end-to-end test'], answer: 0, why: 'A contract test checks a double against the real thing it stands for.' },
					{ q: 'How is that test built?', options: ['Two separate test files, one per repository', 'One shared set of tests, run against the memory version and against Postgres', 'A comparison of the two source files', 'A test that runs only against Postgres'], answer: 1, why: 'Rails writes `CacheStoreBehavior` once and includes it in the memory, file, Memcached and Redis store tests.' },
					{ q: 'Where does Postgres come from in that CI run?', options: ['A production replica', 'A shared staging database', 'Docker', 'The memory repository itself'], answer: 2, why: 'The real store must be running in CI. Docker gives each run its own Postgres.' },
					{ q: 'Rails skips its Redis tests when Redis is not up. What is the risk?', options: ['The memory store tests fail too', 'Redis gets the wrong data', 'The test suite runs twice', 'A missing service can hide as a green run'], answer: 3, why: 'A skip is not a failure. If the real store never starts, the comparison silently never happens.' }
				]
			},
			{
				title: 'Guard the shared message and the wiring',
				questions: [
					{ q: 'Which test protects (d)?', options: ['A consumer-driven contract', 'An end-to-end test', 'A unit test in the email service', 'An integration test in the order service'], answer: 0, why: 'The email service writes down the fields it reads, and the order service\'s CI checks its real message against them.' },
					{ q: 'What is a cheaper first step for (d)?', options: ['More hand-written messages in the email service', 'A code review rule for renames', 'The order service writes its captured message to a fixture file the email service loads', 'A shared Slack channel between the teams'], answer: 2, why: 'The email service then tests against the real message instead of its own copy.' },
					{ q: 'Which test protects (e), a paid cart becoming an order and an email?', options: ['A unit test of the cart', 'An end-to-end test on the built system, with a stub payment provider', 'A contract test of the payment API', 'An integration test of the email service'], answer: 1, why: 'Only the built system, driven like a user, shows that the services are wired together.' },
					{ q: 'Why not put (d) in the end-to-end suite?', options: ['End-to-end tests cannot read messages', 'It would make the suite too fast', 'The email service owns that suite', 'A suite that publishes its own copy of the message stays green'], answer: 3, why: 'If the test uses its own copy, it never compares the producer with the consumer, which is the whole point of (d).' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'What does a contract test check?',
			options: [
				'That a service answers within its agreed latency under load',
				'That every line of a service is covered by at least one test',
				'That the whole system works when driven through its user interface',
				'That a test double behaves the same as the real thing it stands for'
			],
			answer: 3,
			why: 'Fowler\'s definition: the calls against your doubles "return the same results as a call to the external service would". Without that check, the fast tests that use the double can pass while the real service behaves differently.'
		},
		{
			q: 'The order service renames `firstName` to `givenName` in `order.placed` and updates its own test. The email service tests its handler with a hand-written message. Which test fails?',
			options: [
				'The order service\'s test, because it compares the whole published message',
				'None of them: each side is tested against its own copy of the message',
				'The email service\'s tests, because they parse with the real schema',
				'The end-to-end suite, if it publishes its own sample of the message'
			],
			answer: 1,
			why: 'The producer\'s test changed with its code. The consumer\'s fixture still says `firstName`, so its handler is happy. An end-to-end suite with its own copy stays green too. Only a test that compares one side with the other would fail.'
		},
		{
			q: 'Rails includes `CacheStoreBehavior` in the tests of its memory, file, Memcached and Redis stores. What does that protect?',
			options: [
				'That the base cache operations behave the same in every store',
				'That Redis answers faster than Memcached on the same machine',
				'That every cache test runs twice, so flaky failures are caught',
				'That the cache is cleared between requests in production'
			],
			answer: 0,
			why: 'The module "Tests the base functionality that should be identical across all cache stores". Code tested against the memory store can then trust the same calls on Redis or Memcached.'
		}
	],
	recall: {
		q: 'The order service renames a field in `order.placed`. Which test catches it before production, and in whose CI does it run?',
		a: 'A consumer-driven contract. The email service writes down the fields it reads, and the order service\'s CI runs its real published message against them.'
	},
	sources: [
		{ title: 'Rails, redis_cache_store_test.rb (setup with a real Redis)', url: `${CACHE}/stores/redis_cache_store_test.rb#L205-L221` },
		{ title: 'Rails, mem_cache_store_test.rb (MemCacheStoreTest)', url: `${CACHE}/stores/mem_cache_store_test.rb#L87-L99` },
		{ title: 'Martin Fowler, TestPyramid', url: 'https://martinfowler.com/bliki/TestPyramid.html' },
		{ title: 'Ham Vocke, The Practical Test Pyramid', url: 'https://martinfowler.com/articles/practical-test-pyramid.html' },
		{ title: 'Martin Fowler, ContractTest', url: 'https://martinfowler.com/bliki/ContractTest.html' },
		{ title: 'Ian Robinson, Consumer-Driven Contracts: A Service Evolution Pattern', url: 'https://martinfowler.com/articles/consumerDrivenContracts.html' },
		{ title: 'Pact docs, How Pact works', url: 'https://docs.pact.io/getting_started/how_pact_works' }
	]
};
