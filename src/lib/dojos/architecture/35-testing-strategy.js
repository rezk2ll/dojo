const REPO = 'https://github.com/rails/rails/blob/8b25b80042db6c5498976ed0f5fd01b6764c0146';
const CACHE = `${REPO}/activesupport/test/cache`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'testing-strategy',
	part: 'Built to last',
	title: 'Testing strategy',
	minutes: 10,
	hook: [
		'Your shop\'s order service publishes `order.placed` with the customer\'s `firstName`. The email service turns it into "Hello Ana". Both teams test their side: the order service checks the message it publishes, and the email service feeds its handler a message written by hand. **Both suites are green.**',
		'Now picture a cleanup in the order service: `firstName` becomes `givenName`, and its test is updated in the same commit. Still green. The email service\'s hand-written message still says `firstName`, so its tests stay green too. In production every email starts with **"Hello ,"**. No test failed, because no test ever put the two sides together.',
		'More tests of the same kind would not have caught it. A testing strategy is not "how many tests". It is **which test protects which decision**. Fast tests guard what one service decides alone. **Contract tests** guard what two services agreed on. A few end-to-end tests check the wiring. Tomorrow\'s chapter (day 36) applies the same idea to the architecture itself.'
	],
	terms: [
		{ term: 'Test pyramid', def: 'Many fast, narrow tests at the bottom, fewer broad ones on top. Fowler: "many more low-level UnitTests than high level BroadStackTests running through a GUI."' },
		{ term: 'Test double', def: 'A stand-in for something your code talks to: an in-memory store, a stub payment API, a hand-written message. It makes tests fast, and it is only as true as the last time someone compared it with the real thing.' },
		{ term: 'Integration test', def: 'One service with its real infrastructure (its own database) and doubles for every service it does not own.' },
		{ term: 'Contract test', def: 'A test that checks a double against the real thing it stands for. Fowler: "These check that all the calls against your test doubles return the same results as a call to the external service would."' },
		{ term: 'Consumer-driven contract', def: 'Each consumer writes down the part of a message or API it actually reads, and the producer runs those expectations in its own CI. Pact is a tool built for it.' },
		{ term: 'End-to-end test', def: 'The built system, driven the way a user would. Slow and broad, so keep a few that prove the pieces are wired together.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['unit["Unit: price rules, no I/O"] -->|"protects"| d1["A discount never makes a total negative"]'],
				highlight: ['unit', 'd1'],
				note: 'The bottom of the pyramid. The order service\'s price tests call pure functions with literal carts, in milliseconds. They guard a rule that lives **in one place**, so one fast test is enough.'
			},
			{
				add: ['integ["Integration: order service on a real Postgres"] -->|"protects"| d2["A retried order is saved once"]', 'integ -.->|"fakes"| fakes["Payment API, email service"]', 'class fakes ext'],
				highlight: ['integ', 'd2', 'fakes'],
				note: 'One level up. The "saved once" rule lives in a unique index and a transaction, so the test needs **the real database**. **Everything the service does not own is a double**: the payment API, the email service.'
			},
			{
				add: ['beh["CacheStoreBehavior: written once"] --> mem["MemoryStore"]', 'beh --> redis[("RedisCacheStore on a real Redis")]'],
				highlight: ['beh', 'mem', 'redis'],
				note: 'A contract test for a double **you own**. Rails writes its cache tests once, as a module of behaviors. The memory store, the file store, Memcached and Redis each include it. Any test that uses the fast memory store can trust it to **behave like the real ones** on everything those shared modules test.'
			},
			{
				add: ['producer["Orders test: what it publishes"] -.->|"no test compares them"| consumer["Email fixture: what it reads"]', 'class producer ext'],
				highlight: ['producer', 'consumer'],
				note: 'A double **someone else owns** the truth of. The message exists in two hand-written copies, each checked only against its own code. This dotted line is where a **consumer-driven contract** belongs.'
			},
			{
				add: ['e2e["E2E: checkout in a browser, stub payment"] -->|"protects"| d5["A paid cart becomes an order and an email"]'],
				highlight: ['e2e', 'd5'],
				note: 'The top: a handful of browser tests on the built system. Even they use doubles: a stub payment provider, maybe a fake mail inbox. **An end-to-end test with stand-ins tests the wiring, not the contract.**'
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
			'**The contract is a module.** [`CacheStoreBehavior`](' + CACHE + '/behaviors/cache_store_behavior.rb#L6-L19) opens with "Tests the base functionality that should be identical across all cache stores." Its tests only talk to `@cache`. Each store\'s test class says how to build one, in `setup`, and includes the behaviors.',
			'**The real store runs the same tests.** [`RedisCacheStoreCommonBehaviorTest`](' + CACHE + '/stores/redis_cache_store_test.rb#L231-L242) includes `CacheStoreBehavior` too, against a real Redis built in [its `setup`](' + CACHE + '/stores/redis_cache_store_test.rb#L205-L221). So does [`MemCacheStoreTest`](' + CACHE + '/stores/mem_cache_store_test.rb#L87-L99), against a real Memcached.',
			'**Each store signs only what it can keep.** The memory store includes `CacheDeleteMatchedBehavior`, Memcached does not. Memcached includes `FailureSafetyBehavior` and `ConnectionPoolBehavior`, the memory store does not. The contract is split into modules so a store can say exactly which parts it promises.',
			'**The real thing costs infrastructure.** The Redis setup says `skip "Redis server is not up" unless REDIS_UP`, and [Memcached\'s](' + CACHE + '/stores/mem_cache_store_test.rb#L63-L64) does the same. A machine without them still runs the memory store\'s tests, and quietly skips the comparison.',
			'**Across teams, the same idea needs a tool.** Inside one repo, Rails can include one module in every store. Two services cannot share a module, so consumer-driven contracts write the expectation down as data (a pact). In Pact\'s terms, for queues "the consumer is the application that reads the message" and the provider is the one that writes it. For messages, each interaction holds "the minimal expected message", the parts the consumer wants to use. For HTTP, in provider verification the provider\'s real response "is compared with the minimal expected response".'
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
			'**Every double is a copy** of someone else\'s behavior, and copies drift (day 17). Two copies of one message means two places to forget.',
			'**A contract test needs both teams.** The consumer writes the expectation, the producer runs it, and someone must own a red build in a repo that did not change.',
			'Tests on a real store need that store in CI. Rails skips its Redis and Memcached tests when they are not up, so a missing service can hide as a green run.',
			'End-to-end tests with stand-ins look like a guarantee and are not one. They prove the wiring, against copies.'
		]
	},
	task: {
		prompt: 'For each decision in the shop, name the cheapest test that protects it, which service\'s CI runs it, and what is real or a double. (a) A discount never makes a total negative. (b) A retried order is saved once. (c) The in-memory order repository behaves like the Postgres one. (d) `order.placed` still carries every field the email service reads. (e) A paid cart in the browser becomes an order and an email.',
		hint: 'Ask who owns the decision. If one service owns it alone, its own CI can guard it. If two services share it, the test has to run where the change would be made.',
		answer: [
			'(a) A **unit** test of the price function in the order service. Nothing to fake: it is pure code.',
			'(b) An **integration** test in the order service: the handler on a real Postgres, because the rule lives in a unique index and a transaction. The payment API and the email service are doubles.',
			'(c) An **adapter contract** test in the order service: one shared set of repository tests, run against the memory version and against Postgres in Docker, the way Rails runs `CacheStoreBehavior` against its memory, file, Memcached and Redis stores.',
			'(d) A **consumer-driven contract**. The email service publishes the fields it reads (a pact or a schema). The order service\'s CI runs its real published message through it. A cheaper first step: the order service writes its captured message to a fixture file, and the email service loads that file instead of a hand-written copy.',
			'(e) An **end-to-end** test on the built system, with a stub payment provider. Keep it few: it is the slowest of the five.',
			'If you put (d) in the end-to-end suite, look again: a suite that publishes its own copy of the message stays green.'
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
			why: 'Fowler\'s definition: the calls against your doubles "return the same results as a call to the external service would". It is what keeps the fast tests that use the double honest.'
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
	takeaway: 'Test what one service decides alone with fast tests, test what two services agreed on with a contract test, and keep a few end-to-end tests for the wiring.',
	sources: [
		{ title: 'Martin Fowler, TestPyramid', url: 'https://martinfowler.com/bliki/TestPyramid.html' },
		{ title: 'Ham Vocke, The Practical Test Pyramid', url: 'https://martinfowler.com/articles/practical-test-pyramid.html' },
		{ title: 'Martin Fowler, ContractTest', url: 'https://martinfowler.com/bliki/ContractTest.html' },
		{ title: 'Ian Robinson, Consumer-Driven Contracts: A Service Evolution Pattern', url: 'https://martinfowler.com/articles/consumerDrivenContracts.html' },
		{ title: 'Pact docs, How Pact works', url: 'https://docs.pact.io/getting_started/how_pact_works' }
	]
};
