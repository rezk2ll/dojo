/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'capstone-checkout',
	part: 'Architecture',
	title: 'Capstone: an online shop’s checkout',
	minutes: 10,
	hook: [
		'A shop sells home electronics online. On a normal day it takes about 30 orders a minute. Next Friday it runs a sale: 2 000 TVs at half price, announced to 400 000 newsletter readers at 9 a.m.',
		'Last year’s sale went wrong in three ways. Two customers got the last TV of a model. One card was charged twice after a timeout. Confirmation emails arrived an hour late.',
		'This exercise puts earlier katas together: stock that cannot go below zero, payments that cannot run twice, and work that leaves the checkout through a queue. Take 15 minutes for it.'
	],
	terms: [
		{ term: 'Reservation', def: 'Stock taken off the available count when an order is placed, before it is paid, and put back if payment never happens.' },
		{ term: 'Idempotency key', def: 'A unique string sent with a request, so the server can recognise a retry and return the first result instead of doing the work again.' },
		{ term: 'Outbox', def: 'A table written in the same transaction as the order, holding the messages (like emails) that a worker sends afterwards.' }
	],
	kata: {
		brief: [
			'The shop runs 6 app servers and one PostgreSQL primary. Card payments go through Stripe. A Stripe call usually takes 1 to 2 seconds.',
			'On a normal day: 500 requests per second, 30 orders per minute, 3 items per order. On the sale day, plan for 20 times that: 10 000 requests per second and 600 orders per minute, most of them for the same TV.',
			'Rules: a unit is never sold twice; a card is never charged twice for one order; the confirmation email leaves within one minute of payment; an unpaid order gives its stock back after 15 minutes.',
			'Design the cart, the order and stock step, the payment step, the emails, and how the sale day fits on this hardware.'
		],
		minutes: 15,
		checklist: [
			'Your design writes the SQL or the rule that stops the TV count from going below zero.',
			'Your design says whether the Stripe call runs inside the database transaction that holds the stock row.',
			'Your design says what key the payment retry sends, and what Stripe does when it sees that key twice.',
			'Your design says how the confirmation email is recorded so that a crash after payment does not lose it.',
			'Your design says how two email workers avoid sending the same email.',
			'Your design gives orders per second on the sale day, and what part of the 10 000 requests per second reaches PostgreSQL.',
			'Your design says what happens to the stock of an order that is never paid.'
		],
		sample: [
			'Keep the cart in a PostgreSQL `carts` table: it is only written when someone adds an item. Product pages and listings come from a cache in front of the app, so most of the 10 000 requests per second never reach PostgreSQL. The sale needs 600 orders a minute, which is 10 orders per second.',
			'Placing an order is one short transaction: insert the order with status `pending_payment`, then for each line run `UPDATE stock SET available = available - 1 WHERE sku = $1 AND available >= 1`. If it updates 0 rows, the item is sold out and the transaction rolls back. In Read Committed, a second `UPDATE` on the same row waits for the first to commit, then checks the `WHERE` again on the new value, so the count cannot go below zero.',
			'The Stripe call happens after that commit, never inside it. Inside, every buyer of the TV would wait 1 to 2 seconds for the row lock held during the previous buyer’s payment, so the TV row would take about one order per second instead of 10.',
			'Send the order id as the Stripe `Idempotency-Key`. On a timeout, the app retries with the same key. Stripe saves the status code and body of the first request and returns them for each retry, so the card is charged once. Stripe can prune keys after 24 hours, so retries stop well before that.',
			'When Stripe confirms, one transaction sets the order to `paid` and inserts a row into `outbox`. If the app crashes after this commit, the row is still there. Two email workers each run `SELECT ... FROM outbox WHERE sent_at IS NULL LIMIT 50 FOR UPDATE SKIP LOCKED`, so each takes rows the other has not locked. At 10 orders per second, that is 10 emails per second, well within a minute.',
			'A job runs every minute and cancels `pending_payment` orders older than 15 minutes, adding their units back to `available` in the same transaction.',
			'The cost: a TV held by a buyer who walks away is shown as sold out for up to 15 minutes. A worker that crashes after sending an email and before setting `sent_at` sends it again, so a customer may get two confirmations.'
		]
	},
	quiz: [],
	recall: {
		q: 'Why does the Stripe call happen after the stock transaction commits, and what key does the retry send?',
		a: 'Inside the transaction, each 1 to 2 second Stripe call would hold the TV row lock, so that row would take about one order per second instead of 10. The retry sends the order id as the `Idempotency-Key`, so Stripe returns the first result.'
	},
	sources: [
		{ title: 'Stripe API, Idempotent requests', url: 'https://docs.stripe.com/api/idempotent_requests' },
		{ title: 'PostgreSQL, Transaction isolation (Read Committed)', url: 'https://www.postgresql.org/docs/current/transaction-iso.html' },
		{ title: 'PostgreSQL, SELECT (the locking clause and SKIP LOCKED)', url: 'https://www.postgresql.org/docs/current/sql-select.html' }
	]
};
