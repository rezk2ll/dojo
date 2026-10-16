/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'live-scores',
	part: 'Real time',
	title: 'Live sports scores',
	minutes: 10,
	hook: [
		'Sunday, 9 p.m., the cup final. 2 million people have your sports app’s match page open, on phones, at work, on a train. Many of them cannot watch the game, so the page is how they follow it.',
		'Today the page downloads a score file every 30 seconds. When the striker scores, a friend’s text message arrives before the page shows 1-0.',
		'The product owner wants a goal on every screen within 2 seconds of the operator in the stadium typing it in.'
	],
	terms: [
		{ term: 'Server-sent events (SSE)', def: 'One HTTP response that the server keeps open and writes events into, as `text/event-stream`. The browser reads it with `EventSource`.' },
		{ term: 'Fan-out', def: 'Sending one incoming message to many receivers. Here, one goal goes out to 2 million open connections.' },
		{ term: 'Last-Event-ID', def: 'The HTTP header a browser’s `EventSource` sends when it reconnects, holding the `id` of the last event it received.' },
		{ term: 'Reconnect storm', def: 'Thousands of clients reconnecting in the same second, after the server they were connected to stops.' }
	],
	kata: {
		brief: [
			'A score operator at each stadium types every event into a small web form: goal, card, substitution, whistle. One match produces about 150 events. Each event the page needs is about 200 bytes of JSON.',
			'On the night of the final, 2 million viewers watch the final and 20 other matches run at the same time. A viewer who opens the page at minute 70 must see the current score at once.',
			'A goal must reach every open page within 2 seconds of the operator pressing save. Your load test showed that one connection server holds 50 000 open, mostly idle connections.',
			'Design the path from the operator’s form to 2 million screens. Say what a viewer sees after losing signal in a tunnel for 20 seconds.'
		],
		minutes: 10,
		checklist: [
			'Your design says how many servers hold the 2 million open connections, and the number you divided by.',
			'Your design says how many messages leave your servers for one goal, and how many bytes that is.',
			'Your design says where the current score is stored, so a viewer who opens the page at minute 70 sees it at once.',
			'Your design says what a browser receives when it reconnects after 20 seconds without signal.',
			'Your design names the step that can lose a message, and how the viewer still ends up with the right score.',
			'Your design says what happens when one connection server dies and all its viewers reconnect in the same second.'
		],
		sample: [
			'The operator’s form posts to a score API. The API inserts the event into a PostgreSQL table `match_events`, whose `id` column only grows. It then runs `PUBLISH match:<id>` in Redis with the event and its `id`. The match page asks the API for the current state when it opens, then opens an SSE connection.',
			'2 000 000 viewers divided by 50 000 connections per server gives 40 connection servers. The sample runs 60, so losing a few still leaves room: about 33 000 viewers each. Each connection server runs one Redis `SUBSCRIBE` for the 21 matches. One `PUBLISH` therefore reaches 60 subscribers, and each server writes the goal to its own 33 000 connections.',
			'One goal is 2 million writes of 200 bytes: 400 MB leave the 60 servers, about 7 MB each. 150 events make about 60 GB for the whole final. The match clock does not need messages: the page counts the minutes itself from the kick-off time.',
			'The Redis docs: "Redis\' Pub/Sub exhibits at-most-once message delivery semantics." A connection server that loses its Redis link for 3 seconds misses every event sent in those 3 seconds. So each server keeps the last 200 events of each match in memory. After a Redis reconnect, it reads from `match_events` every row with an `id` above the last one it holds.',
			'Every SSE event carries `id: <id>`. When a viewer’s phone leaves the tunnel, `EventSource` reconnects and sends the `Last-Event-ID` header with the last id it saw. The server sends the events after that id from its memory, so a reconnect never reads PostgreSQL. 200 events times 200 bytes times 21 matches is about 840 KB per server.',
			'When one server dies, its 33 000 viewers reconnect. The SSE `retry` field sets how many milliseconds the browser waits before reconnecting. Each server sends every connection a random `retry` between 1 000 and 10 000. The 33 000 reconnects then spread over 9 seconds, about 3 700 per second across 59 servers.',
			'The page is served over HTTP/2. MDN warns that without it, a browser opens at most 6 SSE connections per domain across all its tabs. A fan with 7 tabs open on HTTP/1.1 gets no updates in the seventh.',
			'This design keeps 2 million connections open for the whole match. Each deploy of a connection server drops 33 000 of them, so deploys wait until after the final. The load balancer needs an idle timeout longer than the gap between two events, or a comment line (`:`) sent every 30 seconds.'
		]
	},
	quiz: [],
	recall: {
		q: 'In the sample, how does a phone that lost signal for 20 seconds get the goal it missed?',
		a: 'On reconnect, `EventSource` sends `Last-Event-ID` with the last event id it saw. The connection server sends every event after that id from the 200 it keeps in memory.'
	},
	sources: [
		{ title: 'Redis docs: Pub/Sub, delivery semantics', url: 'https://redis.io/docs/latest/develop/pubsub/' },
		{ title: 'MDN: Using server-sent events', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events' },
		{ title: 'HTML Living Standard: Server-sent events and the Last-Event-ID header', url: 'https://html.spec.whatwg.org/multipage/server-sent-events.html' }
	]
};
