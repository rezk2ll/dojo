/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'presence',
	part: 'Real time',
	title: 'Online status',
	minutes: 10,
	hook: [
		'Sofia opens her messaging app on the train to ask a colleague about tonight’s release. Next to each of her 300 contacts is a green dot or a grey one. She writes to Karim because his dot is green.',
		'Karim closed his laptop 40 minutes ago, and his dot stayed green because his app never said goodbye. Sofia waits for an answer that does not come.',
		'You design the service that keeps those dots right, to within 30 seconds, for every user.'
	],
	terms: [
		{ term: 'Heartbeat', def: 'A small message a connection sends on a fixed interval to say "this user is still here".' },
		{ term: 'TTL', def: 'Time to live: the number of seconds after which Redis removes a key on its own.' },
		{ term: 'Status change', def: 'A user going from offline to online or from online to offline. A heartbeat from a user who is already online does not count as one.' },
		{ term: 'Expired event', def: 'A Redis keyspace notification published when Redis deletes a key whose TTL ran out.' }
	],
	kata: {
		brief: [
			'The app has 4 million users. At the evening peak, 800 000 are connected, each through a WebSocket to one of 16 gateway servers. Every user has about 300 contacts.',
			'A user changes status about 10 times a day, and the peak hour has 3 times the average rate. When a contact changes status, a connected user must see the new dot within 30 seconds. A phone that loses signal in a tunnel for 10 seconds should not flash grey.',
			'Presence lives in Redis. Your load tests show one Redis shard handles 150 000 key operations per second.',
			'Gateways can crash. When one does, nobody is left to report that its users went offline.'
		],
		minutes: 10,
		checklist: [
			'Your design says what a gateway writes, and how often, to show that a user is still online.',
			'Your design says how a user’s dot turns grey within 30 seconds when their gateway crashes.',
			'Your design says why a 10 second tunnel does not send a status change to 300 contacts.',
			'Your design says who receives a status change: all 300 contacts, only the online ones, or only those looking at the screen.',
			'Your design gives the Redis operations per second at peak and the number of shards they need.',
			'Your design says what a user sees when they open the app and load 300 dots at once.'
		],
		sample: [
			'Each gateway writes `SET presence:<user_id> <gateway_id> EX 30` every 15 seconds for each of its connected users. The key exists while the user is online and stores which gateway holds them. If heartbeats stop, Redis removes the key after at most 30 seconds.',
			'When a socket closes, the gateway stops the heartbeats and runs `GET presence:<user_id>` 30 seconds later. When `GET` finds no key, the gateway reports the user offline. If the user came back from the tunnel within those 30 seconds, a gateway has refreshed the key, so nothing is reported and no contact sees a grey dot.',
			'A crashed gateway checks nothing. As a backup, the presence service subscribes to Redis expired events and reports every expired `presence:` key as offline. Redis docs warn that the expired event comes when Redis deletes the key, and that this can be "a significant delay" after the TTL reaches zero. So for users of a crashed gateway, the 30 second target can slip.',
			'On a status change, the presence service loads the user’s 300 contact ids and reads their presence keys, one batch per shard. About 60 of them are online. It groups those 60 by gateway id and sends one message per gateway, and each gateway pushes the new dot to its own users. At login, the app reads its 300 contacts’ keys the same way to draw the first screen.',
			'Numbers at peak: heartbeats are 800 000 every 15 seconds, 53 000 writes per second. Status changes are 4 million times 10 a day, 463 per second on average and 1 400 at peak. Each change reads 300 keys: 420 000 reads per second. Logins are half of the changes, 700 per second, and read 300 keys each: 210 000 more. That totals about 683 000 operations per second, so 6 shards run at 114 000 each, under 150 000.',
			'The choice this sample makes is to push every status change to every online contact, about 60 pushes per change and 84 000 per second at peak. Most of those users are not looking at their contact list. Slack’s RTM API made the other choice in January 2018: an app only receives `presence_change` events for users it named in a `presence_sub` message, and Slack suggests at most 500 users. That cuts the pushes, but every client has to keep its list of names up to date as the user scrolls.'
		]
	},
	quiz: [],
	recall: {
		q: 'In the sample, why does a 10 second tunnel not turn the user’s dot grey for their contacts?',
		a: 'The gateway waits 30 seconds after the socket closes before checking `presence:<user_id>`. The phone reconnected within 10 seconds and a gateway refreshed the key, so no offline change is sent.'
	},
	sources: [
		{ title: 'Redis docs: SET (the EX option)', url: 'https://redis.io/docs/latest/commands/set/' },
		{ title: 'Redis docs: Keyspace notifications (timing of expired events)', url: 'https://redis.io/docs/latest/develop/pubsub/keyspace-notifications/' },
		{ title: 'Slack docs: User presence and status', url: 'https://docs.slack.dev/apis/web-api/user-presence-and-status' }
	]
};
