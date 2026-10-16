/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'payments',
	part: 'Reliability',
	title: 'Taking payments',
	minutes: 10,
	hook: [
		'Black Friday, 11 p.m. A customer taps Pay for a 240 € coffee machine. The spinner turns for 30 seconds, the page says "Something went wrong", and she taps Pay again.',
		'The next morning her bank app shows two charges of 240 €. The first request had reached the payment provider and charged her card. Only the answer was lost on its way back to the shop.',
		'The shop’s app sends a card charge to its provider with no memory of earlier attempts. Your job is a checkout where a lost answer or a second tap never charges a card twice.'
	],
	terms: [
		{ term: 'Unknown outcome', def: 'The state after a request times out: the provider may have charged the card, or may never have seen the request.' },
		{ term: 'Idempotency key', def: 'A unique value sent in the `Idempotency-Key` header. The provider runs the first request with a given key and answers every retry with the saved result.' },
		{ term: 'Webhook', def: 'An HTTP request the provider sends to your server when something happens on its side, such as a payment that succeeded.' }
	],
	kata: {
		brief: [
			'An online shop takes 20 000 card payments a day through Stripe, with a peak of 10 per second on sale days. The provider answers 99.9% of calls within 2 seconds. The shop’s timeout is 10 seconds, so about 20 calls a day get no answer.',
			'Customers tap Pay twice. App servers restart during deploys, sometimes in the middle of a payment call. Stripe also sends a webhook when a payment succeeds.',
			'Rules: a card is never charged twice for one order. An order is never shipped unpaid. A customer whose call timed out learns within 1 minute whether they paid.',
			'Design the checkout from the Pay tap to the order marked paid. Say what your code does after a timeout, after a crash and after a duplicate webhook.'
		],
		minutes: 10,
		checklist: [
			'Your design says where the idempotency key is created and stored, and that it exists before the first call to the provider.',
			'Your design says what a second tap on Pay sends to the provider.',
			'Your design says what the code does after a 10-second timeout, and which key the retry uses.',
			'Your design says how an app server that crashed mid-call finds out whether the card was charged.',
			'Your design says what happens when the same webhook arrives twice, or before the API answer.',
			'Your design says how long the provider keeps a key, and what your code does with an order still unknown after that.'
		],
		sample: [
			'The Pay tap first commits an `orders` row with `state = \'payment_pending\'` and a `payment_key` column holding a new UUID v4. Only after that commit does the server call Stripe, with `Idempotency-Key: <payment_key>`. A second tap sends the same order id, finds the row, and reuses its key. Stripe’s docs: "generate and persist a key for the operation and supply it to every attempt".',
			'Stripe "saves the status code and body of the first request made with a given idempotency key". A retry with the same key gets that saved answer and no second charge. After a timeout, the server retries up to 3 times with the same key, waiting 2 seconds, then 4, then 8. If Stripe answers `409`, the first request is still running, and the docs say to wait and retry "with that key and the same parameters".',
			'Never retry with a new key: the docs warn that "A new key can start a second operation". The cart is locked while the order is `payment_pending`. Stripe compares the parameters of a retry with the first request and returns an error if they differ.',
			'A server can crash after Stripe charged the card and before the answer was saved. A recovery job runs every 30 seconds and retries every order in `payment_pending` for more than 30 seconds, with its stored key. Stripe returns the saved answer, and the job sets the order to `paid` or `failed`. With 20 timeouts a day, this job does a handful of calls per day.',
			'Webhooks are a second path to the same answer. Stripe’s docs: "Webhook endpoints might occasionally receive the same event more than once", and Stripe does not guarantee their order. The handler inserts the event id into a table with a unique key and skips ids it has seen. It then runs `UPDATE orders SET state = \'paid\' WHERE id = <id> AND state = \'payment_pending\'`, so a late duplicate changes nothing.',
			'Stripe can remove keys once they are "at least 24 hours old", and a key reused after that starts a new request. So the recovery job stops retrying an order after 12 hours. It puts the order on a list for a person to check in the Stripe dashboard, and nothing retries it after that.',
			'This design costs one database commit before every payment call, 20 000 a day. A customer whose call timed out sees "Payment processing" for up to 1 minute, instead of an error and a Pay button. An order that stays unknown for 12 hours needs a person.'
		]
	},
	quiz: [],
	recall: {
		q: 'In the sample, which key does the retry after a 10-second timeout send, and where does it come from?',
		a: 'The same `payment_key` UUID, read from the `orders` row that was committed before the first call. Stripe answers the retry with the saved result of the first request, so the card is charged once.'
	},
	sources: [
		{ title: 'Stripe API reference: Idempotent requests', url: 'https://docs.stripe.com/api/idempotent_requests' },
		{ title: 'Stripe docs: Low-level error handling, idempotency and retries', url: 'https://docs.stripe.com/error-low-level' },
		{ title: 'Stripe docs: Webhooks, duplicate events and event ordering', url: 'https://docs.stripe.com/webhooks' }
	]
};
