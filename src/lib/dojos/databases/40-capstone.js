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
