/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'webhooks',
	part: 'Small services',
	title: 'Webhook delivery',
	minutes: 10,
	hook: [
		'A small online shop uses an invoicing service. Each time an invoice is paid, the invoicing service sends a POST to `https://shop.example/hooks/invoices`, and the shop marks the order as ready to ship.',
		'On Tuesday the shop’s server is down from 2 a.m. to 8 a.m. for a disk swap. 300 invoices are paid in those 6 hours. If the invoicing service sends each POST once and gives up, 300 orders wait forever and nobody knows why.',
		'You work at the invoicing service. You design the part that sends those POSTs to every customer, including the ones that are slow or down.'
	],
	terms: [
		{ term: 'Webhook', def: 'An HTTP POST that your service sends to a URL the customer registered, when an event happens on your side.' },
		{ term: 'At-least-once delivery', def: 'Every event reaches the customer one or more times: the sender retries until it gets a `2xx`, so the customer can get a copy twice.' },
		{ term: 'Exponential backoff', def: 'Each retry waits twice as long as the previous one, starting at 1 minute.' },
		{ term: 'Signature', def: 'An HMAC of the request body, computed with a secret shared with the customer, that lets the customer check who sent the request.' }
	],
	kata: {
		brief: [
			'The invoicing service has 5 000 customers who registered a webhook URL. Together they get 2 million events a day. Traffic peaks at 5 times the daily average. Each event body is about 2 KB of JSON.',
			'About 1 customer URL in 10 takes over 5 seconds to answer. On any given day, a few dozen URLs are down for hours. A customer that is down must still get every event once it is back, for up to 3 days.',
			'A slow or broken customer must not delay events to the others. Customers must be able to check that a POST really comes from the invoicing service.'
		],
		minutes: 10,
		checklist: [
			'Your design says where an event is stored between the moment it happens and the moment a customer answers `2xx`.',
			'Your design says how long a sender waits for a slow URL before it counts the attempt as failed.',
			'Your design says how one customer down for 6 hours cannot slow down deliveries to the other 4 999.',
			'Your design gives the retry schedule and the point where it stops trying.',
			'Your design says what happens when a sender crashes after the POST but before it records the success, and how the customer spots the copy.',
			'Your design says how a customer checks that a POST comes from the invoicing service.',
			'Your design counts the events per second at peak.'
		],
		sample: [
			'2 million events a day is about 23 per second on average, so about 116 per second at the 5 times peak. When an invoice is paid, the same database transaction inserts one row in a `deliveries` table. If the transaction rolls back, no webhook exists. At 2 KB per row, one day takes about 4 GB, and 7 days of history take 28 GB.',
			'Each row holds the event id, the customer URL and the 2 KB body. It also holds an attempt count and `next_attempt_at`, the time of the next try.',
			'Sender workers take rows with `SELECT ... WHERE next_attempt_at <= now() ORDER BY next_attempt_at LIMIT 50 FOR UPDATE SKIP LOCKED`. The PostgreSQL docs say SKIP LOCKED "can be used to avoid lock contention with multiple consumers accessing a queue-like table". In the same transaction the worker pushes `next_attempt_at` 1 minute ahead as a lease, then commits. The HTTP call happens outside any transaction.',
			'Each POST has a 10 second timeout. A worker allows at most 5 POSTs in flight to one customer URL at a time. A customer that answers in 10 seconds then gets at most 5 events every 10 seconds, and its other rows wait in the table. The other customers keep their own 5 slots.',
			'A `2xx` answer marks the row delivered. Any other answer, or a timeout, schedules the next attempt with exponential backoff from 1 minute, capped at 6 hours. The first 9 retries cover about 8.5 hours, then one retry every 6 hours fills the 3 days: about 20 attempts in total. After 3 days the row is marked failed and the customer gets an email.',
			'A worker can crash after the customer answered `200` but before the row is marked delivered. The 1 minute lease runs out and another worker sends the same event again. Each POST carries the event id in a header, and the customer drops ids it already processed. Stripe asks its own customers for the same: "Track event IDs to identify duplicate deliveries".',
			'Each POST carries a header with a timestamp and an HMAC SHA-256 of the timestamp and the body, keyed with a secret per customer. The customer recomputes the HMAC and compares it. It also rejects a timestamp older than 5 minutes, the default tolerance of the Stripe libraries, so an attacker cannot replay an old request.',
			'The main choice is a PostgreSQL table as the queue: one place to see every pending event per customer, with no extra system to run. The table takes about 350 writes per second at peak, one insert and two updates per event. The cost is at-least-once delivery with no order: a retried event can arrive after a newer one, so customers must handle copies and order themselves.'
		]
	},
	quiz: [],
	recall: {
		q: 'In the sample, why can a customer receive the same event twice, and what does it use to drop the copy?',
		a: 'A worker can crash after the POST but before marking the row delivered, so the 1 minute lease expires and another worker resends it. The customer drops it by its event id.'
	},
	sources: [
		{ title: 'Stripe docs: Receive Stripe events in your webhook endpoint', url: 'https://docs.stripe.com/webhooks' },
		{ title: 'PostgreSQL docs: SELECT, the locking clause', url: 'https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE' }
	]
};
