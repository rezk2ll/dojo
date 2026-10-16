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
		'With event sourcing, each change is appended as an **event** to the order\'s history. The current state is what you get by replaying that history from the first event.',
		'Replaying on every read costs time, and the screens want other shapes anyway. So you split the model that changes data from the model that reads it. That split is **CQRS**, and it works with or without event sourcing.'
	],
	terms: [
		{ term: 'Event', def: 'A fact that happened, named in the past tense and never edited: `OrderCancelled`. The store keeps events in order and numbers them per stream.' },
		{ term: 'Event store', def: 'An append-only log of events, one stream per aggregate. Replaying a stream gives the aggregate\'s current state.' },
		{ term: 'Projection (read model)', def: 'Data derived from the writes, shaped for one kind of read. You can delete it and rebuild it from the source of truth.' },
		{ term: 'CQRS', def: 'Command Query Responsibility Segregation: one model to change data, another to read it. Martin Fowler credits Greg Young with describing it. It does not require event sourcing.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['post["POST a new post"] -->|"save"| db[("statuses table")]', 'post -.->|"after save"| fan["fan-out job"]', 'fan -->|"one insert per follower"| feed[("Redis: feed:home:id")]', 'class feed ext'],
				highlight: ['post', 'db', 'fan', 'feed'],
				note: 'On Mastodon\'s write side, a new post is saved to the database, the source of truth. Then a background job pushes its id into the **home feed** of each follower, kept in Redis. The feed is a read model, built at write time.'
			},
			{
				add: ['get["GET the home timeline"] -->|"newest ids"| feed', 'get -->|"load those posts"| db'],
				highlight: ['get'],
				note: 'On the read side, a home timeline request never joins "all the people I follow". It takes the newest ids from the Redis feed and loads only those posts. Mastodon has two models, each shaped for its job, and **no event store anywhere**.'
			},
			{
				add: ['es[("event stream: order-1042")] -.->|"replay: Placed, Paid, Cancelled"| agg["Order, rebuilt"]', 'agg -.->|"append event n+1"| es'],
				highlight: ['es', 'agg'],
				note: 'In your shop, event sourcing could work like this. Instead of overwriting a row, the `CancelOrder` command appends `OrderCancelled` to the order\'s stream. To decide the next command, you start from an empty order and apply each past event in order.'
			},
			{
				add: ['w2["second writer, also at version n"] -.->|"append refused, reload, retry"| es'],
				highlight: ['w2'],
				note: 'With optimistic concurrency, each append says which version it expects the stream to be at. If someone else already wrote event n+1, the store refuses the append. The second writer reloads the history and decides again, and no writer ever holds a lock.'
			},
			{
				add: ['es --> proj["projection"]', 'proj --> rt[("read table: orders by customer")]'],
				highlight: ['proj', 'rt'],
				note: 'A projection reads the events and keeps a table shaped for one screen. The table lags a little behind the stream. Because the events are the source of truth, you can drop the table and rebuild it by replaying them.'
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
			'This method rebuilds a projection: it fills a user\'s home feed from scratch, reading posts from the database. Lines 7 to 9 add the user\'s own posts, and lines 11 to 28 add those of each account they follow. The day-to-day path is cheaper: [`push_to_home`](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/lib/feed_manager.rb#L74-L83) adds one new post to one feed, then trims it.',
			'Mastodon can throw a feed away and rebuild it. A feed keeps at most `MAX_ITEMS = 800` ids, and only users who signed in recently get pushes. When an inactive user comes back, Mastodon queues a regeneration. The admin command [`tootctl feeds build`](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/lib/mastodon/cli/feeds.rb#L15-L43) rebuilds feeds "stored in Redis from the database".',
			'The app can see the lag: while a feed is being rebuilt, the home timeline API [answers `206` instead of `200`](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/controllers/api/v1/timelines/home_controller.rb#L11-L23), so the app knows the list may be incomplete.',
			'Mastodon is CQRS **without** event sourcing: its source of truth is the current state of each post. For event sourcing at scale, look at Temporal: every workflow keeps an [Event History](' + TEMPORAL + '/workflow-execution/event), "an append-only log of Events". A worker that crashes replays the code against that history to rebuild its state.'
		]
	},
	tradeoff: {
		gain: [
			'Each change is a stored fact, in order, so "why was 1042 cancelled?" has an answer. Temporal says its Event History "also serves as an audit log for debugging".',
			'Two writers at the same version cannot both append event n+1, and neither of them holds a lock.',
			'Each read model is shaped for one screen and can be rebuilt from the source of truth. Mastodon\'s home feed is a short list of ids, read in one call.'
		],
		cost: [
			'Replay time grows with the history: Temporal terminates a workflow whose Event History exceeds 51,200 events. Its answer, [Continue-As-New](' + TEMPORAL + '/workflow-execution/continue-as-new), checkpoints the state and starts a fresh history, which works like a snapshot.',
			'Every event type you ever stored must stay readable, and every projection must handle it, for as long as you keep the log.',
			'You keep two models in step: the read model lags behind the writes, and a bug in it means a rebuild. Fowler warns: "for most systems CQRS adds risky complexity."'
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
				'A status column on the aggregate\'s row, overwritten on every change',
				'Replaying the events of its stream in order, possibly starting from a snapshot',
				'The read model table that serves the screens, since it always holds the latest state',
				'The client, which sends the full state with each command'
			],
			answer: 1,
			why: 'The event stream is the source of truth: you start empty, or from a snapshot, and apply each event in order. Read models are derived from the events and may lag, so commands do not decide from them.'
		},
		{
			q: 'Mastodon saves posts in its database and keeps each user\'s home feed as a list of post ids in Redis, rebuilt from the database when needed. No events are stored. Is that CQRS?',
			options: [
				'No: CQRS requires event sourcing, and here no events are stored at all',
				'No: CQRS requires the read side to keep its own full copy of every field in the post',
				'Only if the feed runs in a separate service with its own database',
				'Yes: separate models for writing and reading are the whole idea; an event store is one option'
			],
			answer: 3,
			why: 'CQRS means one model to change data and another to read it. Fowler notes the two models may even share a database. Event sourcing is one way to feed a read side, not a requirement.'
		},
		{
			q: 'Two requests load order 1042 at version 7, and both try to append an event. The store uses optimistic concurrency. What happens?',
			options: [
				'The first append becomes event 8; the second gets a conflict, so it reloads and decides again',
				'Both are stored as event 8, and replay keeps whichever one was written later',
				'The second request waits on a lock until the first one commits, then appends',
				'Both are stored, as events 8 and 9, and neither writer finds out about the other'
			],
			answer: 0,
			why: 'Each append states the version it expects. Only one writer can turn version 7 into 8. The other gets a conflict and retries on fresh history, so no decision is made on stale state and no lock is held.'
		}
	],
	recall: {
		q: 'Mastodon keeps home feeds in Redis and stores no events. Is that CQRS, and where does an event-sourced order get its current state?',
		a: 'Yes: CQRS only needs one model for writes and another for reads. An event-sourced order gets its state by replaying the events of its stream in order, from the first event or from a snapshot.'
	},
	sources: [
		{ title: 'Martin Fowler, CQRS', url: 'https://martinfowler.com/bliki/CQRS.html' },
		{ title: 'Martin Fowler, Event Sourcing', url: 'https://martinfowler.com/eaaDev/EventSourcing.html' },
		{ title: 'mastodon/mastodon, app/lib/feed_manager.rb', url: `${REPO}/app/lib/feed_manager.rb#L335-L375` },
		{ title: 'mastodon/mastodon, feed_manager.rb: MAX_ITEMS', url: `${REPO}/app/lib/feed_manager.rb#L7-L8` },
		{ title: 'mastodon/mastodon, user.rb: regenerate the feed of a returning user', url: `${REPO}/app/models/user.rb#L532-L553` },
		{ title: 'Temporal docs, Event History', url: `${TEMPORAL}/workflow-execution/event` },
		{ title: 'Temporal docs, Event History and replay', url: `${TEMPORAL}/encyclopedia/event-history` },
		{ title: 'Temporal docs, Continue-As-New', url: `${TEMPORAL}/workflow-execution/continue-as-new` }
	]
};
