/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'zero-downtime-deploy',
	part: 'Reliability',
	title: 'Deploying without downtime',
	minutes: 10,
	hook: [
		'A food delivery app renames the column `orders.address` to `orders.shipping_address`. The migration and the new code ship together at 11:00 on a weekday.',
		'The migration runs first and takes a second. The new code then rolls out to 40 servers, 4 at a time. For 9 minutes, the servers still on the old code send `SELECT address FROM orders`, and PostgreSQL rejects every one of those queries because the column is gone.',
		'The team now wants releases that change the schema and the code with no failed request.'
	],
	terms: [
		{ term: 'Rolling deploy', def: 'Servers get the new version a few at a time, while the others keep serving. For a while, old and new code run side by side against the same database.' },
		{ term: 'Expand and contract', def: 'A schema change split into steps. First add the new shape next to the old one, then move code and data to it, and only then remove the old shape.' },
		{ term: 'Backfill', def: 'A job that fills a new column for rows that existed before it, in small batches.' }
	],
	kata: {
		brief: [
			'A food delivery app runs on 40 identical app servers behind a load balancer. Traffic during the day is 2 000 requests per second, and one server handles up to 60.',
			'One release must rename `orders.address` to `orders.shipping_address` and make it `NOT NULL`. The `orders` table in PostgreSQL has **50 million rows**.',
			'No request may fail during the release. If the new code misbehaves, the team must be able to go back to the old code within 10 minutes. A backfill batch of 10 000 rows takes 0.2 seconds in this brief.'
		],
		minutes: 10,
		checklist: [
			'Your design says which code versions run at the same time during the rollout, and that each one works with the schema at that moment.',
			'Your design splits the rename into steps, and says which release ships each step.',
			'Your design says how many servers are out of the pool at once, and that the others can carry 2 000 requests per second.',
			'Your design says how the 50 million existing rows get the new column, and how long that takes.',
			'Your design adds `NOT NULL` without a long lock that blocks writes to `orders`.',
			'Your design says how to go back to the old code at each step.'
		],
		sample: [
			'A one-step rename cannot work with a rolling deploy: during the rollout, old code and new code query the same table, and each expects a different column name. The sample uses expand and contract over three releases.',
			'Release 1, expand. The migration runs `SET lock_timeout = \'2s\'` then `ALTER TABLE orders ADD COLUMN shipping_address text`. With no default, PostgreSQL needs no rewrite of the table, so the `ACCESS EXCLUSIVE` lock lasts a moment. Without `lock_timeout`, the `ALTER` would wait with no limit behind a long report query. The new code writes both columns and reads `shipping_address`, or `address` when it is NULL.',
			'Rollout. The load balancer stops sending new requests to 4 servers, waits 30 seconds for their open requests to finish, and they restart on the new code. 36 servers × 60 = 2 160 requests per second, just above the 2 000 of traffic. 10 batches of about a minute is 10 minutes. Going back means deploying the old code, which ignores the new column.',
			'Backfill. A job runs `UPDATE orders SET shipping_address = address WHERE id BETWEEN $1 AND $2 AND shipping_address IS NULL` in ranges of 10 000 ids. 50 million rows make 5 000 batches at 0.2 seconds each, about **17 minutes**. Each batch is its own transaction, so no row stays locked for more than a fraction of a second.',
			'NOT NULL. `ADD CONSTRAINT shipping_address_set CHECK (shipping_address IS NOT NULL) NOT VALID` skips the scan of existing rows. `VALIDATE CONSTRAINT shipping_address_set` then scans with only a `SHARE UPDATE EXCLUSIVE` lock, so inserts and updates continue. After that, `SET NOT NULL` skips its own scan, because the PostgreSQL docs say a valid CHECK constraint that "proves no NULL can exist" is enough.',
			'Release 2 ships code that reads and writes only `shipping_address`. Release 3, a week later, runs `ALTER TABLE orders DROP COLUMN address`. PostgreSQL only hides a dropped column, so the drop is quick. The docs say the space is "reclaimed over time as existing rows are updated".',
			'Going back has limits. The original code inserts orders without `shipping_address`, so it breaks once `NOT NULL` is set: the sample runs that step only after release 1 has run a day without trouble. After release 3, going back to release 1 needs the `address` column restored from a backup.',
			'The cost: one rename takes three releases and a week, and release 1 carries code that writes two columns and reads with a fallback.'
		]
	},
	quiz: [],
	recall: {
		q: 'In the sample, how is `NOT NULL` added to 50 million rows without blocking writes?',
		a: 'A CHECK constraint added `NOT VALID`, then `VALIDATE CONSTRAINT` under a `SHARE UPDATE EXCLUSIVE` lock, then `SET NOT NULL`, which skips its scan because the valid CHECK proves no NULL exists.'
	},
	sources: [
		{ title: 'PostgreSQL documentation, ALTER TABLE', url: 'https://www.postgresql.org/docs/current/sql-altertable.html' },
		{ title: 'PostgreSQL documentation, Explicit Locking (table-level lock modes)', url: 'https://www.postgresql.org/docs/current/explicit-locking.html' },
		{ title: 'PostgreSQL documentation, Client Connection Defaults (lock_timeout)', url: 'https://www.postgresql.org/docs/current/runtime-config-client.html' }
	]
};
