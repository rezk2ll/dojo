/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'activity-feed',
	part: 'Data',
	title: 'An activity feed',
	minutes: 10,
	hook: [
		'A running app has 5 million users. Lea finishes a 10 km run, and her 80 followers see "Lea ran 10 km" at the top of their feed.',
		'A marathon champion on the same app has 1 million followers. When she posts her race, every one of them opens the app within the hour to see it.',
		'Both posts go through the same feed code. Lea\'s 80 followers and the champion\'s million all expect the feed to open in under 200 ms.'
	],
	terms: [
		{ term: 'Fan-out on write', def: 'When an account posts, the system copies the event id into the feed of each follower, so a read only fetches one list.' },
		{ term: 'Fan-out on read', def: 'The event is stored once, under its author, and each reader collects events from the accounts they follow when they open the feed.' },
		{ term: 'Capped list', def: 'A list trimmed to a fixed length after each insert, so it keeps only the newest entries.' }
	],
	kata: {
		brief: [
			'Users follow other users. The feed shows the latest 50 events from the accounts a user follows, newest first. An event is a short record: "Lea ran 10 km", "Sam liked your run".',
			'5 million accounts, of which 2 million opened the app in the last 7 days. Users post 3 million events a day. An account has 100 followers on average.',
			'2 000 accounts have more than 10 000 followers. The largest has 1 million.',
			'At peak, 20 000 feeds are opened per second. A feed loads in under 200 ms, and a new event shows in followers\' feeds within 1 minute.'
		],
		minutes: 10,
		checklist: [
			'Your design says, step by step, what happens when the account with 1 million followers posts.',
			'Your design says where each user\'s latest 50 event ids are stored, and how much memory or disk that takes.',
			'Your design gives the number of feed writes per second on an average day.',
			'Your design says how a feed read gets events from accounts whose posts are not copied to followers.',
			'Your design says what a user who has not opened the app for a month sees on their first open, and how long it takes.',
			'Your design says how events from an account the user just unfollowed leave their feed.'
		],
		sample: [
			'The design uses fan-out on write for accounts under 10 000 followers, and fan-out on read for the 2 000 accounts above. Each user has a Redis list `feed:<user id>` holding the latest 50 event ids. A post runs `LPUSH feed:<id> <event id>` then `LTRIM feed:<id> 0 49` for each follower. The Redis docs say `LTRIM` used this way "is an O(1) operation" on average.',
			'Copies go only to followers who opened the app in the last 7 days. Mastodon does the same: "status fan-out to followers will include only people active within this time frame", with a default of 7 days. 3 million events times 100 followers is 300 million pushes a day. With 2 of 5 million users active, about 120 million remain, which is about 1 400 pushes per second.',
			'An account above 10 000 followers writes its event once, to its own capped list `posts:<account id>`. Copying a post from the 1 million account would take 1 million pushes. At 20 000 pushes per second that is 50 seconds, and every smaller post waits in the queue behind it.',
			'A feed read runs `LRANGE feed:<id> 0 49`, plus `LRANGE posts:<x> 0 49` for each big account the user follows. Event ids are sortable by time (kata 04), so the app merges the lists by id and keeps the top 50. Then it fetches the 50 event bodies by id from the events table.',
			'The `posts:` lists of the 2 000 big accounts are read by most users. Each app server keeps them in memory for 5 seconds, so Redis sees one read per list per server every 5 seconds.',
			'Memory: 2 million active feeds times 50 ids of 8 bytes is 800 MB of ids, before Redis\'s per-key overhead. An inactive user has no feed list. On their first open the app rebuilds the list from the events table and the follow table, which makes that one load slower than 200 ms.',
			'Unfollowed accounts are filtered at read time: the app drops ids whose author is no longer followed. The next posts from followed accounts push the old ids out of the 50.',
			'The two paths cost code: one for posting, one for reading. The 10 000 threshold is one number to tune, and an account that crosses it needs a switch from one path to the other. A user who follows 300 big accounts pays 301 list reads per open.'
		]
	},
	quiz: [],
	recall: {
		q: 'In the sample, which accounts skip fan-out on write, and where do their followers find their events?',
		a: 'Accounts with more than 10 000 followers. Their events go only to their own list `posts:<account id>`, which each follower reads and merges with `feed:<user id>` when the feed opens.'
	},
	sources: [
		{ title: 'Redis docs, LTRIM (the LPUSH and LTRIM pattern)', url: 'https://redis.io/docs/latest/commands/ltrim/' },
		{ title: 'Mastodon, fan-out only to users active in the last 7 days (app/models/concerns/user/activity.rb)', url: 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/models/concerns/user/activity.rb#L6-L12' },
		{ title: 'Mastodon, home feed trimmed to MAX_ITEMS in Redis (app/lib/feed_manager.rb)', url: 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/lib/feed_manager.rb#L454-L459' }
	]
};
