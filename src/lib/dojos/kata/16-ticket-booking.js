/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'ticket-booking',
	part: 'Data',
	title: 'Booking concert tickets',
	minutes: 10,
	hook: [
		'A band announces one show in a 50 000 seat stadium. Tickets go on sale Saturday at 10:00. At 9:58, 400 000 fans have the page open and their thumb on the refresh button.',
		'Each fan picks seats on a map, then has 10 minutes to pay. If two fans pay for seat F12 in block 104, one of them stands in the aisle on the night, and support refunds them by hand.',
		'Your job is the part between the click on a seat and the paid ticket.'
	],
	terms: [
		{ term: 'Hold', def: 'A seat reserved for one fan for 10 minutes while they pay. Nobody else can hold or buy it until the hold ends.' },
		{ term: 'Conditional update', def: 'An `UPDATE` whose `WHERE` clause states the row must still be free. The returned row count tells you whether you got it.' },
		{ term: 'Waiting room', def: 'A queue in front of the seat map that lets fans in at a fixed rate and shows everyone else their place in line.' },
		{ term: 'Deadlock', def: 'Two transactions each hold a lock the other one waits for, so neither can finish.' }
	],
	kata: {
		brief: [
			'The stadium has 50 000 numbered seats. At 10:00, 400 000 fans try to enter the sale within 5 minutes. A fan may hold up to 4 seats at once; the average order is 2.5 seats.',
			'A hold lasts 10 minutes. If the fan has not paid by then, the seats go back on sale. Paying through the card provider takes the fan about 1 minute.',
			'No seat may be sold twice. Fans who are on the seat map should see a map that is at most 5 seconds old.',
			'You have one PostgreSQL primary with one replica. Your load tests show the primary handles 2 000 small single row updates per second on this hardware.'
		],
		minutes: 10,
		checklist: [
			'Your design says which single statement or lock decides that a seat belongs to one fan.',
			'Your design says what a second fan sees when they click a seat that was held one millisecond earlier.',
			'Your design says how a held seat goes back on sale 10 minutes later, including when no background job runs.',
			'Your design says what happens to a fan whose hold expires while the card provider is still charging them.',
			'Your design says what the 400 000 fans do while only some of them can be on the seat map.',
			'Your design gives the number of database writes per second at peak and compares it with 2 000.',
			'Your design says how two fans holding overlapping groups of seats avoid blocking each other forever.'
		],
		sample: [
			'One `seats` table in PostgreSQL holds one row per seat: `seat_id`, `held_by`, `held_until` and `order_id`. 50 000 rows of about 100 bytes is 5 MB, so the whole table stays in memory. The primary is the only place that decides who owns a seat.',
			'A hold is a conditional update: `UPDATE seats SET held_by = $fan, held_until = now() + interval \'10 minutes\' WHERE seat_id = $1 AND order_id IS NULL AND (held_until IS NULL OR held_until < now())`. PostgreSQL returns `UPDATE count`. A count of 1 means the fan has the seat, and a count of 0 means someone else does. For 3 seats, the app runs 3 updates in one transaction and rolls back if any returns 0.',
			'Two fans clicking F12 at once is safe in PostgreSQL’s default Read Committed level. The second `UPDATE` waits for the first to commit, then PostgreSQL re-evaluates the `WHERE` clause on the new row. `held_until` is now in the future, so the second fan gets 0 rows and the app shows "taken, pick another seat".',
			'Two fans holding {F12, F13} and {F13, F12} could deadlock. The app sorts `seat_id` before it updates, so every transaction locks seats in the same order. PostgreSQL’s docs name that as the best defense against deadlocks.',
			'Expiry needs no job. The `held_until < now()` test in the hold statement treats an old hold as free, and the seat map draws the seat as free with the same test. Payment ends with `UPDATE seats SET order_id = $order WHERE seat_id = $1 AND held_by = $fan AND held_until > now()`. If that returns 0, the hold ran out during payment: the app refunds the charge and tells the fan. That refund path is the cost of a strict 10 minute limit.',
			'A waiting room sits in front of the map and admits 2 000 fans per minute. 50 000 seats at 2.5 seats per order is 20 000 orders, so if most admitted fans buy, the sale lasts about 10 minutes. The other 380 000 fans watch their place in line and then see "sold out", without ever touching the database.',
			'Writes at peak: 2 000 fans per minute, each trying about 3 times at 2.5 seats, is 15 000 seat updates per minute, or 250 per second: an eighth of the 2 000 the primary handles. The seat map reads a snapshot of the table rebuilt every 2 seconds, so map views put no load on the primary. The cost: a fan can click a seat that was taken up to 2 seconds earlier and get "taken".',
			'If the primary fails, the sale stops until the replica is promoted, because only the primary decides who owns a seat. The waiting room also makes most fans wait about 10 minutes to learn they got nothing.'
		]
	},
	quiz: [],
	recall: {
		q: 'In the sample, what tells the app that a fan got the seat, and what makes an expired hold free without a job?',
		a: 'The `UPDATE` returns a row count of 1. The `held_until < now()` test in the same `WHERE` clause treats a hold older than 10 minutes as free.'
	},
	sources: [
		{ title: 'PostgreSQL docs: Transaction Isolation (Read Committed)', url: 'https://www.postgresql.org/docs/current/transaction-iso.html' },
		{ title: 'PostgreSQL docs: Explicit Locking (Deadlocks)', url: 'https://www.postgresql.org/docs/current/explicit-locking.html' },
		{ title: 'PostgreSQL docs: UPDATE', url: 'https://www.postgresql.org/docs/current/sql-update.html' }
	]
};
