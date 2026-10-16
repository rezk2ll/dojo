/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'order-saga',
	part: 'Architecture',
	title: 'An order across services',
	minutes: 10,
	hook: [
		'Lucas orders the last pair of boots in size 43. The payment service charges his card for 120 euros. Then the stock service answers: someone else got the boots two seconds earlier.',
		'Each service has its own database, so one SQL transaction cannot cover all three. Support refunds Lucas by hand the next morning. That week, the team counts 400 orders that ended half done.',
		'The rule from the business: every order ends either paid and shipped, or cancelled with no money taken and the stock back on the shelf.'
	],
	terms: [
		{ term: 'Saga', def: 'A sequence of local transactions, one per service, where each completed step has a compensating step that undoes it if a later step fails.' },
		{ term: 'Compensating transaction', def: 'The step that undoes an earlier one: release the reserved stock, cancel the card authorization.' },
		{ term: 'Orchestrator', def: 'One component that stores the saga\'s state and tells each service which step to run next.' },
		{ term: 'Authorize and capture', def: 'Two card calls: the authorization holds the amount on the card, the capture takes the money later.' }
	],
	kata: {
		brief: [
			'Four services, each with its own PostgreSQL database: Orders, Stock, Payment (it calls Stripe) and Shipping (it books a pickup with a carrier). The shop takes 20 000 orders a day.',
			'Out of 100 orders, 2 fail on stock because two buyers race for the last item, 3 fail because the card is declined, and 1 in 200 fails because the carrier rejects the address. The warehouse hands a parcel to the carrier within 2 days.',
			'Any service can be down for up to 10 minutes during a deploy. A network call can time out after the other side has already done the work.',
			'Design the order flow: the order of the steps, what undoes each one, where the state of an order lives, and what the buyer sees while the order is in progress.'
		],
		minutes: 10,
		checklist: [
			'Your design lists the steps in order, and says why the step that is hardest to undo is near the end.',
			'Your design gives each step a compensating step, or says why it does not need one.',
			'Your design says where the state of one order is stored, and what that row says after a crash halfway.',
			'Your design says what happens when Payment times out and you do not know whether the card was charged.',
			'Your design says what the orchestrator does while Stock is down for 10 minutes.',
			'Your design says what the buyer sees right after clicking "Pay", before every step is done.',
			'Your design says how many orders a day end cancelled, and at which step.'
		],
		sample: [
			'The Orders service is the orchestrator. Each order has a row with a `state` column: `STOCK_PENDING`, `AUTH_PENDING`, `SHIP_PENDING`, `CAPTURE_PENDING`, then `DONE` or `CANCELLED`. The state change and the next command are written in one local transaction, into the row and an outbox table. A relay reads the outbox and publishes the command, so a crash never leaves a state change without its command.',
			'Step one reserves the stock: it is cheap to undo by releasing it. Step two authorizes the card with Stripe `capture_method` set to `manual`. Stripe\'s docs: "Authorizing a payment guarantees the amount by holding it on the customer’s payment method." The compensation is to cancel the PaymentIntent, and the buyer is never charged.',
			'Step three books the carrier pickup. Step four captures the payment when the carrier scans the parcel. Stripe\'s docs: "Usually, an authorization for an online card payment is valid for 7 days." The 2-day warehouse window fits. A backorder that would pass day 6 cancels the authorization instead.',
			'Every command carries a key made of the order id and the step, like `ord_8812:authorize`. Payment passes it to Stripe as the idempotency key. Stripe\'s docs: "Retries with the same key return the saved response, including 500 errors." After a timeout, the orchestrator sends the same command again, and the card is not charged twice.',
			'While Stock is down, the command waits in the queue and the order stays in `STOCK_PENDING`. The buyer gets `202 Accepted` with the order id at once. The order page polls `GET /orders/{id}` and shows "confirming" until the state reaches `SHIP_PENDING` or `CANCELLED`.',
			'Per day, 400 orders stop at step one with nothing to undo. About 600 are declined at step two and release their stock. About 100 fail at step three: they cancel the authorization, then release the stock. The order rows add 20 000 × 365 = 7.3 million rows a year, about 7 GB at 1 KB each.',
			'What this design costs: a declined order holds its pair of boots for a few seconds, and another buyer may see "out of stock" in that time. The microservices.io page calls this the "Lack of isolation" of sagas. If the capture fails after the parcel has left, no compensation exists, and the order goes to a support queue for a human.'
		]
	},
	quiz: [],
	recall: {
		q: 'Why does the card get an authorization at step two and a capture only at step four?',
		a: 'Cancelling an authorization releases the hold, so the buyer is never charged. On Stripe, an online card authorization is usually valid for 7 days, enough for the 2-day warehouse window.'
	},
	sources: [
		{ title: 'microservices.io: Pattern: Saga', url: 'https://microservices.io/patterns/data/saga.html' },
		{ title: 'Stripe docs: Place a hold on a payment method', url: 'https://docs.stripe.com/payments/place-a-hold-on-a-payment-method' },
		{ title: 'Stripe API reference: Idempotent requests', url: 'https://docs.stripe.com/api/idempotent_requests' }
	]
};
