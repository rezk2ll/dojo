const LEMMY = 'https://github.com/LemmyNet/lemmy/blob/fc640cf86a130bc897d83dbd06d84c3c7d9b16e3/migrations';
const MOVE = `${LEMMY}/2022-10-06-183632_move_blocklist_to_db/up.sql`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'normalization',
	part: 'Data and questions',
	title: 'Normalization',
	minutes: 10,
	hook: [
		'A customer changes their email in their profile. The next invoice still goes to the old address. The `orders` table had **its own copy of the email**, and nothing updated it.',
		'One fact stored in two places and changed in only one is an update anomaly. There are two more kinds. Insert anomaly: you cannot record a fact until some other row exists to carry it. Delete anomaly: you delete the last order, and the customer\'s address goes with it.',
		'Normalization stores each fact in one place. William Kent: a record is in second and third normal form "if every field is either part of the key or provides a (single-valued) fact about exactly the whole key and nothing else". First, second and third normal form (1NF, 2NF, 3NF) are three checks you run on each table.'
	],
	terms: [
		{ term: 'Anomaly', def: 'A change that the table shape makes hard or wrong: a fact that must be updated in many rows (update), cannot be stored yet (insert), or disappears with another row (delete).' },
		{ term: 'Functional dependency', def: 'Column B depends on column A when one value of A always goes with one value of B. A warehouse has one address: `warehouse` determines `address`.' },
		{ term: '2NF', def: 'Second normal form: with a composite key, no column is a fact about only part of the key.' },
		{ term: '3NF', def: 'Third normal form: no column that is not part of the key is a fact about another such column.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['tags["post.tags = \'sql,db\'"] -->|"1NF"| pt[("post_tag: post_id, tag")]'],
				highlight: ['tags', 'pt'],
				note: '1NF asks for one value per column: no comma-separated lists, no `tag1`, `tag2`, `tag3` columns. A list in `post.tags` cannot carry a foreign key per tag, and finding every post tagged `db` means string matching. Kent: "First normal form excludes variable repeating fields and groups." One `post_tag` row per post and tag fixes both.'
			},
			{
				add: ['inv[("inventory: part, warehouse, quantity, warehouse_address")]'],
				highlight: ['inv'],
				note: 'This table is Kent\'s own example. The key is `(part, warehouse)`. `quantity` depends on both, but `warehouse_address` depends on the warehouse alone. So the address is repeated on every row for that warehouse.'
			},
			{
				add: ['inv -->|"address changes"| upd["Update every row of that warehouse"]', 'inv -->|"warehouse is empty"| lost["No row to keep its address"]'],
				highlight: ['upd', 'lost'],
				note: 'When the address changes, every row of that warehouse must change, and missing one leaves two addresses for one warehouse. And in Kent\'s words: "If at some point in time there are no parts stored in the warehouse, there may be no record in which to keep the warehouse\'s address."'
			},
			{
				add: ['inv --> stock[("stock: part, warehouse, quantity")]', 'inv --> wh[("warehouse: warehouse, address")]'],
				highlight: ['stock', 'wh'],
				note: 'The 2NF fix splits the table by what each fact is about. Quantity is about a part in a warehouse, so it stays with the full key. The address is about a warehouse, so it moves to a table keyed by warehouse. That table has one row per warehouse to change, and an empty warehouse keeps its row.'
			},
			{
				add: ['emp[("employee: employee, department, location")] --> emp2[("employee: employee, department")]', 'emp --> dept[("department: department, location")]'],
				highlight: ['emp', 'dept'],
				note: 'The 3NF check looks for a fact about another non-key column. The key is `employee`. If each department sits in one place, `location` is a fact about the department. It moves to the department table, and moving a department takes one update.'
			}
		]
	},
	example: {
		title: 'Lemmy migrations/2022-10-06-183632_move_blocklist_to_db/up.sql: one row per instance',
		repo: 'LemmyNet/lemmy',
		url: `${MOVE}#L3-L94`,
		lang: 'sql',
		code: `CREATE TABLE instance (
    id serial PRIMARY KEY,
    domain varchar(255) NOT NULL UNIQUE,
    published timestamp NOT NULL DEFAULT now(),
    updated timestamp NULL
);
…
INSERT INTO instance (DOMAIN)
SELECT DISTINCT
    substring(p.actor_id FROM '(?:.*://)?(?:www\\.)?([^/?]*)')
FROM (
    SELECT
        actor_id
    FROM
        site
    UNION
    SELECT
        actor_id
    FROM
        person
    UNION
    SELECT
        actor_id
    FROM
        community) AS p;
…
ALTER TABLE person
    ADD COLUMN instance_id int REFERENCES instance ON UPDATE CASCADE ON DELETE CASCADE;
…
UPDATE
    person
SET
    instance_id = i.id
FROM
    instance i
WHERE
    substring(actor_id FROM '(?:.*://)?(?:www\\.)?([^/?]*)') = i.domain;
…
ALTER TABLE person
    ALTER COLUMN instance_id SET NOT NULL;
…
CREATE TABLE federation_blocklist (
    id serial PRIMARY KEY,
    instance_id int REFERENCES instance ON UPDATE CASCADE ON DELETE CASCADE NOT NULL UNIQUE,
    published timestamp NOT NULL DEFAULT now(),
    updated timestamp NULL
);`,
		notes: [
			'Lemmy is a federated forum: people and communities come from many servers. Before this migration there is no table of servers. Lines 8 to 25 dig each domain out of the `actor_id` URLs, where it is repeated on every person and community from that server. With no row for the server itself, a fact about it had nowhere to go: an insert anomaly.',
			'Lines 1 to 6 build one `instance` row per distinct domain (`domain ... UNIQUE`). Lines 27 to 40 add `instance_id` with a foreign key, fill it with `UPDATE ... FROM instance`, and only then set it `NOT NULL`. The [full file](' + MOVE + '#L30-L79) does this for `site`, `person` and `community`.',
			'Lines 42 to 47 create the block list. It and the allow list reference `instance_id`, so blocking a server is one row. A [later migration](' + LEMMY + '/2023-02-13-221303_add_instance_software_and_version/up.sql#L1-L6) adds `software` and `version` to `instance`: two columns on one row per server, instead of a copy on every user.',
			'`actor_id` still holds the full URL, domain included, so the domain is now written in two places. The migration that adds [`instance_block`](' + LEMMY + '/2023-08-09-101305_user_instance_block/up.sql#L1-L50) also copies `community.instance_id` into `post_aggregates`, and its trigger fills it in for every new post. Lemmy makes that copy on purpose, and the next chapter covers why.'
		]
	},
	tradeoff: {
		gain: [
			'Changing a warehouse address updates one row. No job has to hunt down every copy, and no two rows can disagree.',
			'The database checks the facts: a foreign key on `instance_id`, a `UNIQUE` on `domain`. A domain copied into a text column gets no check.',
			'A new attribute of a warehouse or a server is one column on one table, like Lemmy\'s `software` and `version`.',
			'Rows are narrow, so writes touch less data and an update changes one row instead of thousands.'
		],
		cost: [
			'A page that shows posts with their server name now joins three tables.',
			'Pushed too far, a schema splits into many tiny tables, and every simple screen pays for it in joins.',
			'An invoice must keep the address it was sent to, even after the customer moves. That address is a different fact, and moving it to `customers` loses the history.',
			'Changing an existing schema means a migration with a backfill, often over several releases (expand and contract).'
		]
	},
	task: {
		prompt: 'Your shop has one table: `order_lines(order_id, product_id, quantity, product_name, unit_price, customer_id, customer_email, shipped_to)`, with key `(order_id, product_id)`. For each column, say what it is a fact about. Then split it into tables that each hold one kind of fact.',
		hint: 'Ask, for each column: does it depend on the whole key, on `order_id` alone, on `product_id` alone, or on another non-key column?',
		answer: [
			'`quantity` depends on the whole key: it stays on `order_lines(order_id, product_id, quantity, unit_price)`.',
			'`product_name` depends on `product_id` alone (a 2NF break): move it to `products(product_id, name, price)`.',
			'`customer_id` and `shipped_to` depend on `order_id` alone (2NF): move them to `orders(order_id, customer_id, shipped_to)`.',
			'`customer_email` depends on `customer_id`, a non-key column of the order (a 3NF break): move it to `customers(customer_id, email)`. The invoice bug from the hook disappears.',
			'Keep `unit_price` on the line, and `shipped_to` on the order, on purpose: they record what was true at the time of the order, which the current product price or customer address cannot tell you.'
		],
		steps: [
			{
				title: 'Say what each column is about',
				questions: [
					{ q: 'What is `quantity` a fact about?', options: ['The order alone', 'The product alone', 'The customer', 'The whole key: this product in this order'], answer: 3, why: 'The same product can come in different quantities in different orders. It needs both parts of the key.' },
					{ q: 'What is `product_name` a fact about?', options: ['`product_id` alone', 'The whole key', '`order_id` alone', '`customer_id`'], answer: 0, why: 'A product has one name, whatever order it is in.' },
					{ q: 'What is `customer_id` a fact about?', options: ['`product_id` alone', '`order_id` alone', 'The whole key', '`customer_email`'], answer: 1, why: 'An order has one customer, so every line of the order repeats the same value.' },
					{ q: 'What is `customer_email` a fact about?', options: ['`order_id` alone', 'The whole key', '`customer_id`, a column outside the key', '`product_id` alone'], answer: 2, why: 'A customer has one email. It depends on the order only through `customer_id`.' }
				]
			},
			{
				title: 'Name the broken rule',
				questions: [
					{ q: '`product_name` depends on part of the key. Which form does it break?', options: ['1NF', '2NF', '3NF', 'None'], answer: 1, why: '2NF: with a composite key, no column is a fact about only part of the key.' },
					{ q: 'Say you first move the order facts to `orders(order_id, customer_id, customer_email)`. There, `customer_email` depends on `customer_id`, which is not the key. Which form does that break?', options: ['3NF', '1NF', '2NF', 'None'], answer: 0, why: '3NF: no column outside the key is a fact about another such column. In the flat table, the email also hangs on `order_id` alone, so the 3NF break only shows once the order facts have their own table.' },
					{ q: 'The customer changes their email, and the next invoice goes to the old one. Which anomaly is that?', options: ['An insert anomaly', 'A delete anomaly', 'A lost update', 'An update anomaly'], answer: 3, why: 'One fact stored in many rows, changed in only some of them.' },
					{ q: 'You add a new product nobody has ordered yet. Where does its name go in this table?', options: ['On a line with a NULL `order_id`', 'Nowhere: no row exists to carry it', 'In `shipped_to`', 'On the newest order'], answer: 1, why: 'That is an insert anomaly: a fact cannot be stored until another row exists. `order_id` is part of the key, so it cannot be NULL.' }
				]
			},
			{
				title: 'Split the table',
				questions: [
					{ q: 'What stays in `order_lines`?', options: ['`(order_id, product_id, quantity, unit_price)`', '`(order_id, product_id, quantity, product_name)`', '`(order_id, customer_id, quantity)`', '`(order_id, product_id, customer_email)`'], answer: 0, why: 'Only the facts about the whole key stay, plus the price of the moment, kept on purpose.' },
					{ q: 'Where does `product_name` go?', options: ['`orders(order_id, product_name)`', '`customers(customer_id, product_name)`', '`products(product_id, name, price)`', 'It stays on the line'], answer: 2, why: 'A table keyed by product holds facts about the product, once.' },
					{ q: 'Where do `customer_id` and `shipped_to` go?', options: ['`customers(customer_id, shipped_to)`', '`orders(order_id, customer_id, shipped_to)`', '`products(product_id, customer_id)`', 'They stay on the line'], answer: 1, why: 'They depend on `order_id` alone, so they live on a table keyed by order.' },
					{ q: 'Where does `customer_email` go?', options: ['`orders(order_id, customer_email)`', 'It stays on the line', '`products(product_id, customer_email)`', '`customers(customer_id, email)`'], answer: 3, why: 'Keyed by customer, the email is stored once. The invoice bug from the hook disappears.' }
				]
			},
			{
				title: 'Keep the facts of the moment',
				questions: [
					{ q: 'Why keep `unit_price` on the line when `products` has a price?', options: ['It saves a join on every read', 'It records the price at the time of the order', 'Prices are part of the key', 'It is a 2NF requirement'], answer: 1, why: 'The current price cannot tell you what this customer paid. The two are different facts.' },
					{ q: 'Why keep `shipped_to` on the order and not on `customers`?', options: ['The address the order went to is a different fact from the customer\'s current one', 'Addresses are too long for the customers table', '3NF forbids addresses on customers', 'It makes orders faster to insert'], answer: 0, why: 'When the customer moves, an old order must still say where it was shipped.' },
					{ q: 'After the split, the customer changes their email. How many rows change?', options: ['One per order', 'One per order line', 'None, emails are read-only', 'One, in `customers`'], answer: 3, why: 'Each fact is stored in one place, so one UPDATE is enough and no two rows can disagree.' },
					{ q: 'What does the split cost?', options: ['A screen that shows lines with the customer email now joins several tables', 'The database can no longer check the email', 'Each line is now wider', 'Updates touch more rows'], answer: 0, why: 'Normalized tables are narrow and checked, but reading them back together takes joins.' }
				]
			}
		]
	},
	quiz: [
		{
			q: '`enrollment(student_id, course_id, grade, course_room)` has the key `(student_id, course_id)`. Which rule does `course_room` break?',
			options: [
				'Second normal form: the room is a fact about the course alone',
				'First normal form: a room is not a single atomic value',
				'Third normal form: the room is a fact about the grade',
				'None: every column here depends on the full key'
			],
			answer: 0,
			why: 'The room depends on `course_id`, which is only part of the key. It is repeated for every student in the course, and changes in many rows when the course moves. It belongs in `courses(course_id, room)`.'
		},
		{
			q: 'You delete a customer\'s last order, and their phone number is gone from the database. What happened?',
			options: [
				'An update anomaly: the number was changed in one row but not the others',
				'A delete anomaly: the number was only stored on the order rows',
				'An insert anomaly: the number was never written in the first place',
				'A lost update: two transactions wrote the customer at the same time'
			],
			answer: 1,
			why: 'The phone number is a fact about the customer, stored with each order. With no order left, there is no row to carry it. A `customers` table keyed by customer keeps it whether or not they have orders.'
		},
		{
			q: 'Your `invoices` table stores the billing address as it was on the day of the sale, next to `customer_id`. Is that a normalization mistake?',
			options: [
				'Yes, it breaks 3NF and should be read from `customers` with a join',
				'Yes, any column that copies another table is redundant data',
				'No, because the address on the invoice is a different fact from the current one',
				'No, because normal forms only apply to tables with composite keys'
			],
			answer: 2,
			why: 'The customer\'s current address and the address an invoice was sent to are two facts. When the customer moves, the old invoice must not change. Each of the two facts is stored once, so the table is normalized even though the two addresses are often equal.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Cause the hook\'s update anomaly in a flat table, find it with a query, and split the table so the database refuses it.',
		steps: [
			'Make the flat table in SQLite: `mkdir -p ~/db-lab && cd ~/db-lab && sqlite3 shop.db "CREATE TABLE order_lines (order_id int, product_id int, quantity int, product_name text, unit_price numeric, customer_id int, customer_email text, shipped_to text, PRIMARY KEY (order_id, product_id)); INSERT INTO order_lines VALUES (1, 100, 2, \'Mug\', 8, 7, \'Ana@x.io\', \'1 Main St\'), (1, 101, 1, \'Tea\', 5, 7, \'Ana@x.io\', \'1 Main St\'), (2, 100, 1, \'Mug\', 9, 7, \'Ana@x.io\', \'9 New Rd\');"`',
			'Cause the anomaly: the app updates the email only on the newest order. `sqlite3 shop.db "UPDATE order_lines SET customer_email = \'[REDACTED-EMAIL-cba73a69]\' WHERE order_id = 2;"`',
			'Find facts that now have two values: `sqlite3 shop.db "SELECT customer_id, count(DISTINCT customer_email) FROM order_lines GROUP BY customer_id HAVING count(DISTINCT customer_email) > 1;"`, then `sqlite3 shop.db "SELECT product_id, count(DISTINCT product_name) AS names, count(DISTINCT unit_price) AS prices FROM order_lines GROUP BY product_id;"`.',
			'Create a `customers` table keyed by customer and fill it from the flat table: `sqlite3 shop.db "CREATE TABLE customers (customer_id int PRIMARY KEY, email text NOT NULL); INSERT INTO customers SELECT DISTINCT customer_id, customer_email FROM order_lines;"`',
			'Fix the data with `UPDATE order_lines SET customer_email = \'[REDACTED-EMAIL-cba73a69]\' WHERE customer_id = 7;`, rerun the insert, then create and fill `products`, `orders` and `lines` the same way.'
		],
		done: [
			'Step 3 lists customer `7` with 2 emails, and product `100` with 1 name but 2 prices.',
			'Step 4 fails with `UNIQUE constraint failed: customers.customer_id`.',
			'After step 5, `sqlite3 shop.db "SELECT * FROM customers;"` prints one row, `7|[REDACTED-EMAIL-cba73a69]`.'
		],
		solution: [
			'`CREATE TABLE products (product_id int PRIMARY KEY, name text NOT NULL); INSERT INTO products SELECT DISTINCT product_id, product_name FROM order_lines;`',
			'`CREATE TABLE orders (order_id int PRIMARY KEY, customer_id int NOT NULL REFERENCES customers, shipped_to text); INSERT INTO orders SELECT DISTINCT order_id, customer_id, shipped_to FROM order_lines;`',
			'`CREATE TABLE lines (order_id int REFERENCES orders, product_id int REFERENCES products, quantity int, unit_price numeric, PRIMARY KEY (order_id, product_id)); INSERT INTO lines SELECT order_id, product_id, quantity, unit_price FROM order_lines;`',
			'Two prices for product 100 is not a bug: `unit_price` records what was paid at the time, so it stays on the line. Two emails for one customer was the bug, and the key on `customers` now makes it impossible.'
		]
	},
	recall: {
		q: 'In `inventory(part, warehouse, quantity, warehouse_address)` with key `(part, warehouse)`, which column breaks 2NF, and where does it go?',
		a: '`warehouse_address`: it depends on `warehouse` alone, part of the key. It moves to `warehouse(warehouse, address)`, one row per warehouse.'
	},
	sources: [
		{ title: 'PostgreSQL docs, Foreign Keys (tutorial)', url: 'https://www.postgresql.org/docs/current/tutorial-fk.html' },
		{ title: 'PostgreSQL docs, Constraints', url: 'https://www.postgresql.org/docs/current/ddl-constraints.html' },
		{ title: 'William Kent, A Simple Guide to Five Normal Forms in Relational Database Theory (Communications of the ACM, 1983)', url: 'https://doi.org/10.1145/358024.358054' }
	]
};
