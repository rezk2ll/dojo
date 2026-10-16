/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'notifications',
	part: 'Real time',
	title: 'Notifications',
	minutes: 10,
	hook: [
		'Marc sells second hand bikes on a marketplace app. A buyer comments on his listing at 21:04. Marc wants a push on his phone, a badge in the app, and no email, because he turned email off in his settings.',
		'At 21:05 his phone buzzes three times for the same comment. The comment service had retried its event twice after a slow reply. Marc turns off all notifications, and the next buyer gets no answer.',
		'You design the service that decides who gets told what, on which channel, exactly once.'
	],
	terms: [
		{ term: 'Channel', def: 'One way to reach a user: email, push to a phone, or the list of notifications inside the app.' },
		{ term: 'Delivery', def: 'One row meaning "tell this user about this event on this channel". Its key is `(event_id, user_id, channel)`.' },
		{ term: 'At-least-once', def: 'A sender retries until it gets an acknowledgement, so the receiver may see the same event more than once.' },
		{ term: 'Collapse id', def: 'The APNs header `apns-collapse-id`. Push requests with the same value show as one notification on the phone.' }
	],
	kata: {
		brief: [
			'Other services send events such as "new comment on listing 8812" with a unique `event_id`. They deliver at least once: a timeout makes them send the same event again.',
			'The service sends 5 million deliveries a day: 2.5 million in-app, 2 million push and 0.5 million email. The evening peak is 6 times the daily average. Each user chooses, per category, which channels are on.',
			'The email provider accepts 50 emails per second on your plan. Push goes through APNs for iPhones. A delivery row is about 300 bytes, and in-app notifications are kept for 90 days.',
			'A user must never see the same notification twice on the same channel, and a channel the user turned off must stay silent.'
		],
		minutes: 10,
		checklist: [
			'Your design says what happens when the comment service sends event 8812 three times.',
			'Your design says where the user’s channel choices are checked, and what a change of choice does to notifications already waiting.',
			'Your design says how several workers share the waiting deliveries without two of them sending the same one.',
			'Your design says what happens when a worker crashes after the provider accepted a message but before the worker recorded it.',
			'Your design gives the email rate at peak and compares it with the provider’s 50 per second.',
			'Your design gives the storage for 90 days of deliveries.'
		],
		sample: [
			'Events land in a notification service. It reads the user’s choices for the event’s category, then inserts one row per enabled channel into a PostgreSQL `deliveries` table whose primary key is `(event_id, user_id, channel)`. The insert uses `ON CONFLICT DO NOTHING`. When event 8812 comes back a second time, PostgreSQL inserts no row, the command returns a count of 0, and the service stops there.',
			'The in-app channel needs no sender: the app reads the user’s newest 50 `in_app` rows from the same table. Push and email rows start as `pending`. Workers for each channel run `SELECT ... WHERE channel = \'push\' AND status = \'pending\' LIMIT 100 FOR UPDATE SKIP LOCKED`. PostgreSQL skips rows another worker has locked, so two workers never pick the same delivery.',
			'The service checks the choices once, when it inserts the rows. A user who turns push off at 21:05 still gets the pushes created at 21:04 that are waiting. The sample accepts that gap, because a worker check at send time would add a lookup to each of the 2 million daily pushes.',
			'A worker keeps its transaction open while it sends, then marks the row `sent` and commits. If it crashes between the send and the commit, the transaction ends without a commit, PostgreSQL releases the row lock, and another worker sends the row again. For push, the worker puts the delivery id in `apns-collapse-id`, so the second push merges with the first on the phone. Apple’s docs limit that value to 64 bytes. Email has no such merge in this design, so a crash at the wrong moment can send one duplicate email.',
			'Numbers: 5 million a day is 58 per second on average and about 350 at peak. Email is 0.5 million a day, 5.8 per second on average and about 35 at peak, under the provider’s 50. Storage: 5 million rows of 300 bytes is 1.5 GB a day, 135 GB for 90 days, plus indexes. A nightly job deletes rows older than 90 days.',
			'The cost of using one PostgreSQL table as the queue: every push and email is a lock, an update and a commit on the primary. Those 2.5 million a day make about 175 updates per second at peak, and the nightly job deletes 5 million rows.'
		]
	},
	quiz: [],
	recall: {
		q: 'In the sample, what stops the third copy of event 8812 from creating a third push?',
		a: 'The primary key `(event_id, user_id, channel)` with `INSERT ... ON CONFLICT DO NOTHING`: the duplicate inserts 0 rows, so no delivery is created.'
	},
	sources: [
		{ title: 'PostgreSQL docs: INSERT (ON CONFLICT)', url: 'https://www.postgresql.org/docs/current/sql-insert.html' },
		{ title: 'PostgreSQL docs: SELECT (the locking clause and SKIP LOCKED)', url: 'https://www.postgresql.org/docs/current/sql-select.html' },
		{ title: 'Apple docs: Sending notification requests to APNs', url: 'https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns' }
	]
};
