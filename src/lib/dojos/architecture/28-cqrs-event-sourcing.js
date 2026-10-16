const REPO = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';
const TEMPORAL = 'https://docs.temporal.io';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'cqrs-event-sourcing',
	part: 'The pattern toolbox',
	title: 'CQRS and event sourcing',
	minutes: 10,
	hook: [
		'A customer of your online shop writes to support: "Why was order 1042 cancelled?" The `orders` row says `Cancelled`. It does not say when, by whom, or what the order looked like before. **The row keeps the latest state and forgets how it got there.**',
		'**Event sourcing** keeps the "how". Each change is appended as an **event** to the order\'s history, and the current state is what you get by **replaying** that history.',
		'Replaying on every read costs time, and the screens want other shapes anyway. So you split the model that changes data from the model that reads it. That split is **CQRS**, and it works with or without event sourcing.'
	],
	terms: [
		{ term: 'Command', def: 'A request to change something, which may be refused. Imperative: `CancelOrder`.' },
		{ term: 'Event', def: 'A fact that happened, in the past tense, never edited: `OrderCancelled`. Stored in order, numbered per stream.' },
		{ term: 'Event store', def: 'An append-only log of events, one stream per aggregate. Current state is a replay of the stream.' },
		{ term: 'Snapshot', def: 'A saved copy of the state at some event number, so a replay can start there instead of at event zero.' },
		{ term: 'Projection (read model)', def: 'Data derived from the writes, shaped for one kind of read. It can be thrown away and rebuilt.' },
		{ term: 'CQRS', def: 'Command Query Responsibility Segregation: one model to change data, another to read it. Martin Fowler credits Greg Young with describing it. It does not require event sourcing.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['post["POST a new post"] -->|"save"| db[("statuses table")]', 'post -.->|"after save"| fan["fan-out job"]', 'fan -->|"one insert per follower"| feed[("Redis: feed:home:id")]', 'class feed ext'],
				highlight: ['post', 'db', 'fan', 'feed'],
				note: '**Write side, in Mastodon.** A new post is saved to the database, the source of truth. Then a background job pushes its id into the **home feed** of each follower, kept in Redis. The feed is a read model, built at write time.'
			},
			{
				add: ['get["GET the home timeline"] -->|"newest ids"| feed', 'get -->|"load those posts"| db'],
				highlight: ['get'],
				note: '**Read side, in Mastodon.** Reading a home timeline never joins "all the people I follow". It takes the newest ids from the Redis feed and loads only those posts. Two models, each shaped for its job, and **no event store anywhere**.'
			},
			{
				add: ['es[("event stream: order-1042")] -.->|"replay: Placed, Paid, Cancelled"| agg["Order, rebuilt"]', 'agg -.->|"append event n+1"| es'],
				highlight: ['es', 'agg'],
				note: '**Event sourcing, as a design for your shop.** Instead of overwriting a row, the command appends `OrderCancelled` to the order\'s stream. To decide the next command, you start from an empty order and apply each past event in order.'
			},
			{
				add: ['w2["second writer, also at version n"] -.->|"append refused, reload, retry"| es'],
				highlight: ['w2'],
				note: '**Optimistic concurrency.** Each append says which version it expects the stream to be at. If someone else already wrote event n+1, the store refuses the append. The loser reloads the history and decides again. No lock is held.'
			},
			{
				add: ['es --> proj["projection"]', 'proj --> rt[("read table: orders by customer")]'],
				highlight: ['proj', 'rt'],
				note: '**Read model.** A projection reads the events and keeps a table shaped for one screen. It lags a little behind the stream. And because the events are the truth, you can drop the table and rebuild it by replaying them.'
			}
		]
	},
	example: {
		title: 'app/lib/feed_manager.rb, populate_home',
		repo: 'mastodon/mastodon',
		url: `${REPO}/app/lib/feed_manager.rb#L335-L375`,
		lang: 'ruby',
		code: `  def populate_home(account)
    limit        = FeedManager::MAX_ITEMS / 2
    aggregate    = account.user&.aggregates_reblogs?
    timeline_key = key(:home, account.id)
    over_limit = false

    account.statuses.limit(limit).each do |status|
      add_to_feed(:home, account.id, status, aggregate_reblogs: aggregate)
    end

    account.following.includes(:account_stat).reorder(nil).find_each do |target_account|
      query = target_account.statuses.list_eligible_visibility.includes(reblog: :account).limit(limit)

      over_limit ||= redis.zcard(timeline_key) >= limit
…
      statuses = query.to_a
      next if statuses.empty?

      crutches = build_crutches(account.id, statuses)

      statuses.each do |status|
        next if filter_from_home(status, account.id, crutches)

        add_to_feed(:home, account.id, status, aggregate_reblogs: aggregate)
      end

      trim(:home, account.id)
    end
  end`,
		notes: [
			'**This is a projection rebuild.** It fills a user\'s home feed from scratch, reading posts from the database: the user\'s own, then those of each account they follow. The day-to-day path is cheaper: [`push_to_home`](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/lib/feed_manager.rb#L74-L83) adds one new post to one feed, then trims it.',
			'The read model is **disposable**. A feed keeps at most [`MAX_ITEMS = 800`](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/lib/feed_manager.rb#L7-L8) ids, and only users who signed in recently get pushes. When an inactive user comes back, Mastodon [queues a regeneration](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/models/user.rb#L532-L553). The admin command [`tootctl feeds build`](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/lib/mastodon/cli/feeds.rb#L15-L43) rebuilds feeds "stored in Redis from the database".',
			'**The lag is visible.** While a feed is being rebuilt, the home timeline API [answers `206` instead of `200`](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/controllers/api/v1/timelines/home_controller.rb#L11-L23), so the app knows the list may be incomplete.',
			'Mastodon is CQRS **without** event sourcing: the source of truth is the current state of each post, not a log of events. For event sourcing at scale, look at Temporal: every workflow keeps an [Event History](' + TEMPORAL + '/workflow-execution/event), "an append-only log of Events", and a worker that crashes [replays the code against it](' + TEMPORAL + '/encyclopedia/event-history) to rebuild its state.'
		]
	},
	tradeoff: {
		gain: [
			'A full history for free. Each change is a stored fact, in order, so "why was 1042 cancelled?" has an answer. Temporal says its Event History "also serves as an audit log for debugging".',
			'Concurrency without locks: two writers at the same version cannot both append event n+1.',
			'Read models shaped for one screen, which you can rebuild from the source of truth. Mastodon\'s home feed is a short list of ids, read in one call.'
		],
		cost: [
			'**Replay grows with history.** Temporal terminates a workflow whose Event History exceeds 51,200 events. Its answer, [Continue-As-New](' + TEMPORAL + '/workflow-execution/continue-as-new), checkpoints the state and starts a fresh history: a snapshot in all but name.',
			'**Old events outlive your code.** Every event type you ever stored must stay readable, and every projection must handle it, for as long as you keep the log.',
			'**Two models to keep in step.** A read model lags, and a bug in it means a rebuild. Fowler\'s warning: "for most systems CQRS adds risky complexity."'
		]
	},
	task: {
		prompt: 'Your shop event-sources its orders: one stream per order, two years of events. Product wants a new page, "cancellations per day". Write the steps to build its read model, in order, and say what the page shows if you only subscribe the projection to new events.',
		hint: 'A projection only sees the events it is fed. Where are the two years of old ones? And what happens to an event that arrives twice?',
		answer: [
			'Without a backfill, the page starts at zero on deploy day. Two years of cancellations look like they never happened.',
			'Step 1: create the table and write the projection so it is idempotent. Record the last event position it applied, or key each count by event id, so an event seen twice is counted once.',
			'Step 2: replay every past `OrderCancelled` from the start of the store into the projection. Then keep it subscribed from the position where the replay stopped, so nothing falls in the gap.',
			'Step 3: spot check a few days against a direct count over the event store. Keep the replay script: it is also how you rebuild after the next projection bug.'
		]
	},
	quiz: [
		{
			q: 'In an event-sourced system, where does an aggregate\'s current state come from when a command arrives?',
			options: [
				'A status column overwritten on every change',
				'Replaying the events of its stream in order, possibly starting from a snapshot',
				'The read model table that serves the screens',
				'The client, which sends the full state with each command'
			],
			answer: 1,
			why: 'The event stream is the truth. You start empty, or from a snapshot, and apply each event in order. Read models are derived from the events and may lag, so commands do not decide from them.'
		},
		{
			q: 'Mastodon saves posts in its database and keeps each user\'s home feed as a list of post ids in Redis, rebuilt from the database when needed. No events are stored. Is that CQRS?',
			options: [
				'No: CQRS requires event sourcing',
				'No: CQRS requires the read side to have its own copy of every field',
				'Only if the feed runs in a separate service',
				'Yes: separate models for writing and reading are the whole idea; an event store is one option'
			],
			answer: 3,
			why: 'CQRS means one model to change data and another to read it. Fowler notes the two models may even share a database. Event sourcing is one way to feed a read side, not a requirement.'
		},
		{
			q: 'Two requests load order 1042 at version 7, and both try to append an event. The store uses optimistic concurrency. What happens?',
			options: [
				'The first append becomes event 8; the second is refused because the stream is no longer at version 7, so it reloads and decides again',
				'Both are stored as event 8, and replay keeps the later one',
				'The second request waits on a lock until the first one commits, then appends',
				'Both are stored, as 8 and 9, without either writer seeing the other'
			],
			answer: 0,
			why: 'Each append states the version it expects. Only one writer can turn version 7 into 8. The other gets a conflict and retries on fresh history, so no decision is made on stale state and no lock is held.'
		}
	],
	takeaway: 'Split reads from writes when one shape cannot serve both. Store events only when the history is worth keeping. And plan how to rebuild every read model before you need to.',
	sources: [
		{ title: 'Martin Fowler, CQRS', url: 'https://martinfowler.com/bliki/CQRS.html' },
		{ title: 'Martin Fowler, Event Sourcing', url: 'https://martinfowler.com/eaaDev/EventSourcing.html' },
		{ title: 'mastodon/mastodon, app/lib/feed_manager.rb', url: `${REPO}/app/lib/feed_manager.rb#L335-L375` },
		{ title: 'Temporal docs, Event History', url: `${TEMPORAL}/workflow-execution/event` },
		{ title: 'Temporal docs, Continue-As-New', url: `${TEMPORAL}/workflow-execution/continue-as-new` }
	]
};
