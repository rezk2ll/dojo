/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'chat',
	part: 'Real time',
	title: 'Group chat',
	minutes: 10,
	hook: [
		'Ines runs a climbing club of 480 members. Every Friday at 18:00 she posts the weekend meeting point in the club group, and within a minute 60 people reply with "in" or "out".',
		'If her post reaches half the members five minutes late, ten people drive to the wrong crag. If a reply vanishes, someone loses their seat in a car. Members scroll back to last month to find the gear list.',
		'You design the app that carries those messages for a million people a day.'
	],
	terms: [
		{ term: 'Gateway', def: 'A server that holds open WebSocket connections to clients and pushes new messages down them.' },
		{ term: 'Pub/Sub', def: 'Redis channels: a publisher sends a message to a channel name, and Redis passes it to every client subscribed to that name at that moment.' },
		{ term: 'Fan-out', def: 'Turning one sent message into one delivery per member of the group.' },
		{ term: 'Partition key', def: 'The part of a row’s key that decides which node stores the row. Rows with the same partition key sit together on disk.' }
	],
	kata: {
		brief: [
			'1 million people use the app each day. At the evening peak, 300 000 of them are connected at once. Each user sends about 40 messages a day, and traffic at peak is 3 times the daily average.',
			'A group has 2 to 500 members, 30 on average. A message must appear on every connected member’s screen within 1 second. History is kept forever and loads newest first when a member scrolls up.',
			'Your load tests show one gateway server holds 50 000 open connections. A message is about 200 bytes. Message ids come from a service that hands out sortable 64-bit ids, so a larger id means a later message.',
			'A phone loses its connection for 30 seconds in a tunnel. When it comes back, it must show every message it missed, in order, with none twice.'
		],
		minutes: 10,
		checklist: [
			'Your design says how many gateway servers you run at peak, worked out from 300 000 and 50 000.',
			'Your design says where a message is written before anyone is told about it.',
			'Your design says how a message reaches members who are connected to different gateways.',
			'Your design says how the phone back from the tunnel finds the messages it missed.',
			'Your design says what stops a message from showing twice when the sender’s app retries.',
			'Your design gives the storage per year, worked out from the message count and 200 bytes.',
			'Your design says how the history of a 5 year old group is split so that no single storage partition grows forever.'
		],
		sample: [
			'Clients keep a WebSocket open to a gateway. 300 000 connections at 50 000 per gateway is 6 servers; the sample runs 8 so that one can fail and the rest stay under 50 000 each. A gateway keeps, for each group, the list of its own connections that belong to that group.',
			'Sending is an HTTP call to a chat service. The app sends a client id with the message. The service writes the message to the store with a new sortable id and keeps the client id, so a retry with the same client id returns the stored message instead of writing it again. Only after that write does the service publish the message to the Redis channel `group:<group_id>`.',
			'Each gateway subscribes to `group:<group_id>` for every group that has at least one of its users online. A message to the 480 member club goes to Redis once, then to at most 8 gateways, and each gateway writes it to its own sockets. The fan-out to 480 phones happens inside the gateways.',
			'Numbers at peak: 1 million users at 40 messages is 40 million a day, 463 per second on average and about 1 400 per second at peak. With 30 members per group, that is 42 000 deliveries per second, about 5 250 per gateway. Storage: 40 million times 200 bytes is 8 GB a day, about 2.9 TB a year before replicas.',
			'The store uses the key Discord described for its Cassandra messages table: `((channel_id, bucket), message_id)`, with the bucket worked out from the message id. Discord chose about 10 days per bucket to keep each partition under 100 MB. Loading history reads the newest bucket first and walks back.',
			'Redis docs state that Pub/Sub delivers at most once: a subscriber that disconnects loses the message for good. So Pub/Sub is only the fast path. Each phone remembers the largest message id it has seen per group. After the tunnel, it asks the chat service for messages with a larger id, gets them in id order, and skips any id it already has.',
			'The cost of this choice: a gateway that loses its Redis connection drops live messages for all of its users. Those users see the messages only after their app asks for history, which takes longer than 1 second.'
		]
	},
	quiz: [],
	recall: {
		q: 'In the sample, how does the phone coming out of the tunnel get the messages Pub/Sub dropped?',
		a: 'It sends the largest message id it saw in each group and asks the chat service for every message with a larger id, read from the store.'
	},
	sources: [
		{ title: 'Discord: How Discord Stores Billions of Messages (2017)', url: 'https://discord.com/blog/how-discord-stores-billions-of-messages' },
		{ title: 'Redis docs: Redis Pub/Sub', url: 'https://redis.io/docs/latest/develop/pubsub/' }
	]
};
