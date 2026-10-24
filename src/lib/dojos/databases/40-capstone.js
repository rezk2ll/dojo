const SALEOR = 'https://github.com/saleor/saleor/blob/0c0e2697cc72aa999f7786ae8aeda7665bd4285f';
const PG = 'https://github.com/postgres/postgres/blob/26bd08fb5c069fbdf55867adc398cfca0f55d5c8/doc/src/sgml';
const DJ = 'https://github.com/django/django/blob/d430084791a61b31cecec132bce3dca19194f7f2';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'capstone',
	part: 'Beyond one server',
	title: 'Capstone: the data of a shop',
	minutes: 10,
	hook: [
		'A friend sells mugs online. Orders live in a spreadsheet, stock is a number she updates by hand, and last month **two people paid for the last blue mug**.',
		'She asks you to build the database behind her new shop. You design it **from the keys to the backups**, and every choice points back to a day you already did.'
	],
	terms: [
		{ term: 'Checkout transaction', def: 'One transaction that creates the order, its lines, the stock change and the confirmation job. All of it commits, or none of it (day 17).' },
		{ term: 'Idempotency key', def: 'A value the client sends with a request so a retry is recognized. A unique constraint on it turns the second try into a no-op (day 23).' },
		{ term: 'Guarded update', def: 'An UPDATE whose WHERE also checks the rule, like `stock >= 1`. If it touches no row, the rule failed and the transaction rolls back.' },
		{ term: 'Outbox job', def: 'A row in a jobs table, written in the same transaction as the order. A worker picks it up later, so an email never goes out for an order that rolled back (day 24).' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['cust[("customers")] --> orders[("orders")]', 'orders --> lines[("order_lines")]', 'prod[("products")] --> lines'],
				highlight: ['orders', 'lines'],
				note: 'The shop needs four tables. Every table has a surrogate primary key, and the facts people type have their own unique constraint: a customer\'s email, a product\'s SKU (day 2). Foreign keys tie lines to orders and products, and you index them yourself (day 22).'
			},
			{
				add: ['app["Checkout request"] -->|"one transaction"| orders', 'app -->|"stock = stock - 1 where stock >= 1"| prod'],
				highlight: ['app', 'prod'],
				note: 'Checkout runs in one transaction. It inserts the order with its idempotency key, decrements stock with a guarded update, and adds the lines. A `CHECK (stock >= 0)` stays behind as the last guard if a code path forgets the WHERE (day 22).'
			},
			{
				add: ['orders -->|"same commit"| jobs[("jobs")]', 'worker["Email worker"] -->|"FOR UPDATE SKIP LOCKED"| jobs'],
				highlight: ['jobs', 'worker'],
				note: 'The checkout does not send the email itself: it writes a job row in the same transaction. Workers claim jobs with `SKIP LOCKED` so two workers never take the same one (day 24). If the checkout rolls back, the job row is rolled back with it and no email goes out.'
			},
			{
				add: ['orders -.->|"WAL stream"| replica[("Read replica")]', 'replica --> report["Monthly revenue report"]'],
				highlight: ['replica', 'report'],
				note: 'The monthly revenue query scans every order of the year. It runs on a replica, so it never competes with checkouts (day 28). When it grows too big for row storage, copy the orders to a columnar store (day 38).'
			},
			{
				add: ['orders -.->|"base backup + WAL archive"| backup[("Backup repository")]'],
				highlight: ['backup'],
				note: 'A nightly base backup plus archived WAL lets you restore to any second, for example one second before someone dropped a table (day 27). A replica is not a backup: it replays the drop too.'
			}
		]
	},
	example: {
		title: 'saleor/order/models.py: how an open-source shop stores orders',
		repo: 'saleor/saleor',
		url: `${SALEOR}/saleor/order/models.py#L102-L428`,
		lang: 'python',
		code: `def get_order_number():
    with connection.cursor() as cursor:
        cursor.execute("SELECT nextval('order_order_number_seq')")
        result = cursor.fetchone()
        return result[0]


class Order(ModelWithMetadata, ModelWithExternalReference):
    id = models.UUIDField(primary_key=True, editable=False, unique=True, default=uuid4)
    number = models.IntegerField(unique=True, default=get_order_number, editable=False)
    use_old_id = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=now, editable=False)
    updated_at = models.DateTimeField(auto_now=True, editable=False, db_index=True)
…
    user = models.ForeignKey(
        "account.User",
        blank=True,
        null=True,
        related_name="orders",
        on_delete=models.SET_NULL,
    )
…
    channel = models.ForeignKey(
        Channel,
        related_name="orders",
        on_delete=models.PROTECT,
    )
…
        indexes = [
            *ModelWithMetadata.Meta.indexes,
            GinIndex(
                name="order_search_gin",
                # \`opclasses\` and \`fields\` should be the same length
                fields=["search_document"],
                opclasses=["gin_trgm_ops"],
            ),
            GinIndex(
                name="order_tsearch",
                fields=["search_vector"],
            ),
            GinIndex(
                name="order_email_search_gin",
                # \`opclasses\` and \`fields\` should be the same length
                fields=["user_email"],
                opclasses=["gin_trgm_ops"],
            ),
            models.Index(fields=["created_at"], name="idx_order_created_at"),
            GinIndex(fields=["voucher_code"], name="order_voucher_code_idx"),
            GinIndex(
                fields=["user_email", "user_id"],
                name="order_user_email_user_id_idx",
            ),
            BTreeIndex(fields=["checkout_token"], name="checkout_token_btree_idx"),`,
		notes: [
			'Line 9 makes `id` a UUID primary key, safe to show in a URL. Line 10 makes `number` a short integer for humans, taken by lines 1 to 5 from a sequence that [migration 0129](' + SALEOR + '/saleor/order/migrations/0129_alter_order_number.py#L22-L24) creates (day 2). Expect holes: the PostgreSQL docs say a value from `nextval` "is not reclaimed for re-use if the calling transaction later aborts" (func-sequence, in the sources).',
			'Each foreign key picks what a delete does. Deleting a user keeps its orders and sets `user` to NULL (line 20). Deleting a channel that has orders is refused (`PROTECT`, line 26). The [Django docs](' + DJ + '/docs/ref/models/fields.txt#L1753-L1756) note that, apart from the `DB_*` variants, these "values make Django perform the relevant actions": the database alone does not run them.',
			'Each index serves a screen of the admin. Trigram GIN indexes (lines 31 to 36 and 41 to 46) back the search box on `search_document` and `user_email` (day 11), a GIN index on `search_vector` (lines 37 to 40) backs full-text search (day 37), and a B-tree on `created_at` (line 47) serves lists sorted by date. Django [indexes every `ForeignKey`](' + DJ + '/docs/ref/models/fields.txt#L1714) for you, and PostgreSQL alone does not (ddl, in the sources).',
			'Saleor never stores money as a float. Totals such as `total_net_amount` are `DecimalField`s with [20 digits, 3 after the point](' + SALEOR + '/saleor/settings.py#L485-L486), which Django stores as `numeric`. PostgreSQL recommends numeric "for storing monetary amounts and other quantities where exactness is required" (datatype, in the sources).'
		]
	},
	tradeoff: {
		gain: [
			'The rules that matter (no negative stock, one order per payment attempt, every line has an order) hold even when the app has a bug, because the database checks them.',
			'With one transaction per checkout, a crash leaves either the whole order or nothing.',
			'The queue, the search and the reports all live in PostgreSQL at first: one system to back up, monitor and restore.'
		],
		cost: [
			'Every constraint and index is paid on each write, and every schema change on a busy table needs a careful migration (day 26).',
			'A guarded stock update makes checkouts for the same product wait on one row lock. For a flash sale on one item, that row is the bottleneck (day 20).',
			'The queue and the reports add load to the main database. Watch the dead rows that deleted jobs leave in the job table (day 16), and move the reports out when checkouts slow down while they run.'
		]
	},
	task: {
		prompt: 'Design the database for the mug shop. It needs: customers, products with stock, orders with lines, a payment provider that retries its callback, a confirmation email per order, a monthly revenue report, and a way back if someone drops the orders table at 14:05. Write the DDL, the checkout transaction and the report query, and next to each choice, the day it comes from.',
		hint: 'Go in the order of the diagram: tables and keys, then what checkout writes in one transaction, then what runs later (jobs, reports), then how you get it all back.',
		answer: [
			'Keys (day 2): `id bigint generated always as identity primary key` on every table, plus `customers.email` and `products.sku` unique. Orders also get a `public_id uuid unique` for URLs, so order counts do not leak.',
			'Constraints (days 6, 22): `NOT NULL` wherever the business has no "unknown". `products.stock integer not null check (stock >= 0)`, `price numeric(12,2) check (price >= 0)`, `order_lines.quantity check (quantity > 0)`, `orders.status check (status in (\'pending\', \'paid\', \'shipped\', \'cancelled\'))`. `order_lines` has `primary key (order_id, product_id)` and copies `unit_price`, because the product price will change later (day 8).',
			'Indexes (days 12, 14): `orders (customer_id, created_at desc)` for "my orders, newest first", `order_lines (product_id)` because PostgreSQL does not index a foreign key for you, `jobs (run_at)` for the queue. Check each with EXPLAIN on realistic data, not on ten rows.',
			'Checkout (days 17, 23): in one transaction, `insert into orders (..., idempotency_key) values (...) on conflict (idempotency_key) do nothing returning id`. No row back means a retry: return the existing order. Then `update products set stock = stock - $2 where id = $1 and stock >= $2`; zero rows updated means sold out, so roll back. Then the lines, then `insert into jobs (kind, payload) values (\'order_confirmation\', ...)`.',
			'Payment callback (day 23): the provider\'s event id is unique in a `payments` table, so a retried callback inserts nothing and changes nothing.',
			'Queue (day 24): a worker runs `select id, kind, payload from jobs where run_at <= now() order by run_at limit 10 for update skip locked`, sends the email, deletes the row, commits.',
			'Report (days 28, 38): `select date_trunc(\'month\', created_at) as month, sum(total) from orders where status <> \'cancelled\' group by 1 order by 1`, run on the replica. When it gets slow, export orders to a columnar file and query that.',
			'Backups (day 27): base backups plus WAL archiving to another machine, and a monthly restore drill: restore last night\'s backup to a spare server to prove it works. For the 14:05 drop, restore to 14:04:59 with point-in-time recovery, then copy the orders table back.'
		],
		steps: [
			{
				title: 'Lay out the tables and keys',
				questions: [
					{ q: 'Which primary key does every table get?', options: ['`id bigint generated always as identity primary key`', 'The customer\'s email, or the product\'s SKU', 'A `text` id built by the app', 'None: unique constraints are enough'], answer: 0, why: 'A surrogate key never changes. The facts people type, like an email or a SKU, get their own unique constraint (day 2).' },
					{ q: 'Why do orders also get a `public_id uuid unique` for URLs?', options: ['UUIDs make joins faster', 'So the URL does not leak how many orders the shop has', 'Foreign keys need a UUID', 'Identity columns cannot be shown'], answer: 1, why: 'An order number in the URL tells anyone the order count. A random UUID tells nothing.' },
					{ q: 'Why does `order_lines` copy `unit_price` instead of reading the product\'s price?', options: ['It makes the join to products faster', 'Foreign keys cannot point at prices', 'The product price will change, and the order must keep what was paid', 'To avoid NULL prices'], answer: 2, why: 'The order is a record of a past sale. The product row only knows today\'s price (day 8).' },
					{ q: 'Which index must you create yourself?', options: ['One on `orders.id`', 'One on `products.sku`', 'One on `customers.email`', 'One on `order_lines (product_id)`'], answer: 3, why: 'Primary keys and unique constraints come with an index. PostgreSQL does not index a foreign key for you (day 22).' }
				]
			},
			{
				title: 'Write the checkout',
				questions: [
					{ q: 'Which statement runs first in the checkout transaction?', options: ['The insert of the confirmation job', 'The order insert with `on conflict (idempotency_key) do nothing returning id`', 'The insert of the order lines', 'The stock update'], answer: 1, why: 'A retried checkout stops right there, before it touches the stock, the lines or the email job.' },
					{ q: 'A customer buys 3 mugs at once. How does the guarded stock update change?', options: ['`set stock = stock - $2 where id = $1 and stock >= $2`', '`set stock = stock - 3 where id = $1 and stock >= 1`', '`set stock = $2 where id = $1`', '`set stock = stock - $2 where id = $1`, and let the CHECK catch the rest'], answer: 0, why: 'The guard must test the whole quantity. With `stock >= 1`, a stock of 2 would hit the CHECK and fail with an error instead of a clean "sold out".' },
					{ q: 'The order insert uses `on conflict (idempotency_key) do nothing returning id` and returns no row. What happened?', options: ['The insert failed and the stock is wrong', 'The idempotency key is missing', 'This is a retry of a checkout that already went through: return the existing order', 'The database lost the order'], answer: 2, why: 'The unique constraint turned the second try into a no-op (day 23).' },
					{ q: 'A future code path forgets the `stock >= 1` guard. What still stops negative stock?', options: ['The unique index on `sku`', 'The foreign key from `order_lines`', 'The idempotency key', '`check (stock >= 0)` on `products`'], answer: 3, why: 'The CHECK is the last guard. The update fails with a constraint error instead of selling a mug that does not exist.' }
				]
			},
			{
				title: 'Handle what runs later',
				questions: [
					{ q: 'How does checkout trigger the confirmation email?', options: ['It inserts a job row in the same transaction', 'It sends the email before the commit', 'The payment provider sends it from its callback', 'A nightly job emails the day\'s orders'], answer: 0, why: 'If the checkout rolls back, the job row rolls back with it, so no email goes out for an order that does not exist (day 24).' },
					{ q: 'How do two workers avoid sending the same email twice?', options: ['Each reads the jobs with a plain `select`', 'They claim jobs with `for update skip locked`', 'They pick jobs with `order by random()`', 'They take turns, one per minute'], answer: 1, why: 'A row locked by one worker is skipped by the other, so each job is taken once (day 24).' },
					{ q: 'A worker sends the email, then crashes before it deletes the job row and commits. What happens?', options: ['The email is never sent', 'The job is lost for good', 'The rollback keeps the row, so another worker sends the email again', 'The order is cancelled with it'], answer: 2, why: 'The delete never committed, so the job is still there once the lock is gone. A job may run twice, so it must be safe to repeat (day 24).' },
					{ q: 'Which query computes the monthly revenue?', options: ['`select date_trunc(\'month\', created_at), sum(total) from orders group by 1`', '`select created_at, sum(total) from orders group by created_at`', '`select sum(total) over (order by created_at) from orders`', '`select date_trunc(\'month\', created_at) as month, sum(total) from orders where status <> \'cancelled\' group by 1 order by 1`'], answer: 3, why: 'One row per month, with cancelled orders left out of the revenue. Grouping by `created_at` would give one row per timestamp.' }
				]
			},
			{
				title: 'Plan the way back',
				questions: [
					{ q: 'What lets you restore the database to any second?', options: ['Base backups plus archived WAL', 'A streaming replica', 'A nightly `pg_dump` alone', 'RAID on the database disk'], answer: 0, why: 'A base backup is the start point, and replaying archived WAL brings it forward to the second you pick (day 27).' },
					{ q: 'Why is the replica no help after the `orders` table is dropped?', options: ['It lags a few seconds behind', 'It replays the drop too', 'It is read-only', 'It holds only the indexes'], answer: 1, why: 'A replica copies every change, mistakes included. A replica is not a backup.' },
					{ q: 'The table was dropped at 14:05. Which recovery target do you pick?', options: ['Last night\'s backup, with no WAL', '14:06, to be safe', '14:04:59', 'The latest WAL, to lose nothing'], answer: 2, why: 'Stop one second before the drop, then copy the orders table back into the live database.' },
					{ q: 'How do you know the backups will work on the day you need them?', options: ['The backup job exits with 0', 'The backup files have the right size', 'The WAL archive is on another machine', 'A monthly drill restores last night\'s backup to a spare server'], answer: 3, why: 'Only a restore proves a backup. The other checks show that files exist, not that they bring the shop back.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Two customers check out the last blue mug at the same moment. Which design makes sure only one of them gets it?',
			options: [
				'Update stock with `where id = $1 and stock >= 1`, and roll back if no row changed',
				'Read the stock with a plain SELECT first, then update it if it is still above zero',
				'Add a unique index on `order_lines (product_id)` so each product sells once',
				'Keep the stock in an app-side cache and decrement it before writing the order'
			],
			answer: 0,
			why: 'The guarded update re-checks the stock on the row it locks, so the second checkout sees 0 and updates nothing. A plain SELECT then UPDATE lets both read 1 before either writes (day 20).'
		},
		{
			q: 'The payment provider calls your callback twice for the same payment, a second apart. What makes the second call harmless?',
			options: [
				'Checking in the app whether a payment was saved in the last few seconds',
				'A unique constraint on the provider\'s event id, inserted with ON CONFLICT DO NOTHING',
				'A sequence for payment numbers, so the second call gets a different number',
				'A CHECK constraint that the amount of every payment is above zero'
			],
			answer: 1,
			why: 'Only the unique constraint is checked by the database at insert time, across concurrent transactions. An app-side check races: both calls can look before either inserts (day 23).'
		},
		{
			q: 'The monthly revenue report now takes a minute and checkouts get slower while it runs. What is the best first move?',
			options: [
				'Add a B-tree index on every column the report groups or filters by',
				'Run the report inside the checkout transaction so it reads fresh data',
				'Run it on a read replica, and move it to a columnar copy when it outgrows that',
				'Store a running revenue total in a JSONB column on every order row'
			],
			answer: 2,
			why: 'A report that reads every order is a scan no index removes. A replica takes the load off the primary (day 28), and a columnar copy makes the scan itself cheap (day 38).'
		}
	],
	lab: {
		minutes: 25,
		goal: 'Build the mug shop\'s core tables and prove four rules for real: one buyer for the last mug, a retried checkout is a no-op, a rolled-back order sends no email, and two workers never take the same job.',
		steps: [
			'Start PostgreSQL: `docker run -d --name shop-lab -e POSTGRES_PASSWORD=lab postgres:16`, wait a few seconds, then open two terminals, A and B, each running `docker exec -it shop-lab psql -U postgres`.',
			'In A, create the tables: `CREATE TABLE products (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, sku text NOT NULL UNIQUE, price numeric(12,2) NOT NULL CHECK (price >= 0), stock integer NOT NULL CHECK (stock >= 0)); CREATE TABLE orders (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, idempotency_key text NOT NULL UNIQUE, status text NOT NULL DEFAULT \'pending\' CHECK (status IN (\'pending\', \'paid\', \'shipped\', \'cancelled\')), total numeric(12,2) NOT NULL, created_at timestamptz NOT NULL DEFAULT now()); CREATE TABLE jobs (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, kind text NOT NULL, payload jsonb NOT NULL, run_at timestamptz NOT NULL DEFAULT now()); INSERT INTO products (sku, price, stock) VALUES (\'MUG-BLUE\', 12.00, 1);`. Then try `UPDATE products SET stock = stock - 2 WHERE sku = \'MUG-BLUE\';`.',
			'The last mug: in A, `BEGIN; UPDATE products SET stock = stock - 1 WHERE sku = \'MUG-BLUE\' AND stock >= 1;`. In B, run the same two statements and watch it wait. In A, `COMMIT;`. Read B\'s result, then `ROLLBACK;` in B.',
			'The retried checkout: in A, run `INSERT INTO orders (idempotency_key, total) VALUES (\'pay-7f3a\', 12.00) ON CONFLICT (idempotency_key) DO NOTHING RETURNING id;` twice.',
			'The outbox: in A, `BEGIN; INSERT INTO orders (idempotency_key, total) VALUES (\'pay-9c01\', 12.00); INSERT INTO jobs (kind, payload) VALUES (\'order_confirmation\', \'{}\'); ROLLBACK; SELECT count(*) FROM jobs;`.',
			'Two workers: in A, `INSERT INTO jobs (kind, payload) SELECT \'order_confirmation\', jsonb_build_object(\'n\', g) FROM generate_series(1, 3) g;`. Then in A and in B, `BEGIN; SELECT id FROM jobs WHERE run_at <= now() ORDER BY run_at LIMIT 2 FOR UPDATE SKIP LOCKED;`, A first. `COMMIT;` in both. When you are done: `docker rm -f shop-lab`.'
		],
		done: [
			'`stock - 2` fails with `violates check constraint "products_stock_check"`.',
			'B waits until A commits, then prints `UPDATE 0`, and `SELECT stock FROM products` shows 0.',
			'The first idempotent insert returns an id and `INSERT 0 1`. The second returns no row and `INSERT 0 0`.',
			'After the rollback, `SELECT count(*) FROM jobs` is 0.',
			'A gets two job ids, B gets the third one: no id appears in both.'
		],
		solution: [
			'B\'s `UPDATE 0` is the sold-out signal: the app rolls back and tells the second customer. Nobody paid for a mug that was not there.',
			'In the app, an empty `RETURNING` means a retry: look up the order by its `idempotency_key` and return it.',
			'Insert one more order and look at its id: it gets 4, not 2, because the conflicting insert and the rolled-back order still used up identity values. `orders.id` has holes. That is expected, and one more reason to show `public_id` instead.',
			'Point-in-time recovery needs WAL archiving and a second server, so it is left out here. Day 27 walks through it.'
		]
	},
	recall: {
		q: 'Two customers buy the last blue mug at once. Which statement in the checkout transaction stops the second one, and what happens to its order?',
		a: '`update products set stock = stock - 1 where id = $1 and stock >= 1`. For the second checkout it updates zero rows, so the transaction rolls back, and its order, lines and email job are never committed.'
	},
	sources: [
		{ title: 'PostgreSQL docs source, func-sequence.sgml (nextval values are not reclaimed)', url: `${PG}/func/func-sequence.sgml#L183-L185` },
		{ title: 'PostgreSQL docs source, ddl.sgml (foreign keys are not indexed for you)', url: `${PG}/ddl.sgml#L1398-L1401` },
		{ title: 'PostgreSQL docs source, datatype.sgml (numeric for money)', url: `${PG}/datatype.sgml#L520-L523` },
		{ title: 'saleor/saleor, Order.total_net_amount', url: `${SALEOR}/saleor/order/models.py#L270-L274` },
		{ title: 'PostgreSQL docs, Constraints', url: 'https://www.postgresql.org/docs/current/ddl-constraints.html' },
		{ title: 'PostgreSQL docs, SELECT, the locking clause', url: 'https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE' },
		{ title: 'PostgreSQL docs, Continuous archiving and point-in-time recovery', url: 'https://www.postgresql.org/docs/current/continuous-archiving.html' },
		{ title: 'saleor/saleor, order models', url: 'https://github.com/saleor/saleor/blob/0c0e2697cc72aa999f7786ae8aeda7665bd4285f/saleor/order/models.py' }
	]
};
