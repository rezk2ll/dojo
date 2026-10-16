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
		'That is an **update anomaly**: one fact stored in two places, changed in one. It has two siblings. An **insert anomaly**: you cannot record a fact until some other row exists to carry it. A **delete anomaly**: you delete the last order, and the customer\'s address goes with it.',
		'Normalization is the cure, and the idea fits in one line: **one fact in one place**. William Kent put it this way: a record is in second and third normal form "if every field is either part of the key or provides a (single-valued) fact about exactly the whole key and nothing else". The normal forms are just names for the checks.'
	],
	terms: [
		{ term: 'Anomaly', def: 'A change that the table shape makes hard or wrong: a fact that must be updated in many rows (update), cannot be stored yet (insert), or disappears with another row (delete).' },
		{ term: 'Functional dependency', def: 'Column B depends on column A when one value of A always goes with one value of B. A warehouse has one address: `warehouse` determines `address`.' },
		{ term: '1NF', def: 'First normal form: every column holds one value. No comma-separated lists, no `tag1`, `tag2`, `tag3` columns.' },
		{ term: '2NF', def: 'Second normal form: with a composite key, no column is a fact about only part of the key.' },
		{ term: '3NF', def: 'Third normal form: no column that is not part of the key is a fact about another such column.' },
		{ term: 'Decomposition', def: 'Splitting a table in two, joined by a key, so each fact lives in one table. A join gives back the original rows.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['tags["post.tags = \'sql,db\'"] -->|"1NF"| pt[("post_tag: post_id, tag")]'],
				highlight: ['tags', 'pt'],
				note: '**One value per column.** A comma-separated list cannot carry a foreign key per tag, and finding every post tagged `db` means string matching. Kent: "First normal form excludes variable repeating fields and groups." One row per post and tag fixes both.'
			},
			{
				add: ['inv[("inventory: part, warehouse, quantity, warehouse_address")]'],
				highlight: ['inv'],
				note: '**A fact about part of the key.** This is Kent\'s own example. The key is `(part, warehouse)`. `quantity` depends on both, but `warehouse_address` depends on the warehouse alone. So the address is repeated on every row for that warehouse.'
			},
			{
				add: ['inv -->|"address changes"| upd["Update every row of that warehouse"]', 'inv -->|"warehouse is empty"| lost["No row to keep its address"]'],
				highlight: ['upd', 'lost'],
				note: '**The anomalies.** When the address changes, every row must change, and missing one leaves two addresses for one warehouse. And in Kent\'s words: "If at some point in time there are no parts stored in the warehouse, there may be no record in which to keep the warehouse\'s address."'
			},
			{
				add: ['inv --> stock[("stock: part, warehouse, quantity")]', 'inv --> wh[("warehouse: warehouse, address")]'],
				highlight: ['stock', 'wh'],
				note: '**Split by what the fact is about (2NF).** Quantity is about a part in a warehouse, so it stays with the full key. The address is about a warehouse, so it moves to a table keyed by warehouse. One row per warehouse, one place to change it, and an empty warehouse still has its row.'
			},
			{
				add: ['emp[("employee: employee, department, location")] --> emp2[("employee: employee, department")]', 'emp --> dept[("department: department, location")]'],
				highlight: ['emp', 'dept'],
				note: '**A fact about another non-key column (3NF).** The key is `employee`. If each department sits in one place, `location` is a fact about the department, not the employee. It moves to the department table, and moving a department becomes one update.'
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
			'**The fact had no home.** Lemmy is a federated forum: people and communities come from many servers. Before this migration there is no table of servers: the migration has to dig each domain out of the `actor_id` URLs, where it is repeated on every person and community from that server. There was no row where a fact about the server itself could live: an insert anomaly.',
			'**Decompose, then point at it.** The migration builds one `instance` row per distinct domain (`domain ... UNIQUE`), adds `instance_id` with a foreign key on `site`, `person` and `community`, fills it with `UPDATE ... FROM instance`, and only then sets it `NOT NULL`. The [full file](' + MOVE + '#L30-L79) does the same for all three tables.',
			'**New facts get one place.** The allow and block lists reference `instance_id`, so blocking a server is one row. A [later migration](' + LEMMY + '/2023-02-13-221303_add_instance_software_and_version/up.sql#L1-L6) adds `software` and `version` to `instance`: two columns on one row per server, not a copy on every user.',
			'**Normalization stops somewhere.** `actor_id` still holds the full URL, domain included, so the domain is now written in two places. And the migration that adds [`instance_block`](' + LEMMY + '/2023-08-09-101305_user_instance_block/up.sql#L1-L50) also copies `community.instance_id` into `post_aggregates`, and its trigger fills it in for every new post. That copy is on purpose: tomorrow\'s chapter.'
		]
	},
	tradeoff: {
		gain: [
			'One place to change a fact. No job that hunts down every copy, and no two rows that disagree.',
			'Constraints can do their work: a foreign key on `instance_id`, a `UNIQUE` on `domain`. A copy in a text column checks nothing.',
			'The schema takes new facts easily. A new attribute of a warehouse or a server is one column on one table.',
			'Rows are narrow, so writes touch less data and an update changes one row instead of thousands.'
		],
		cost: [
			'Reads need joins. A page that shows posts with their server name now joins three tables.',
			'Pushed too far, a schema splits into many tiny tables, and every simple screen pays for it in joins.',
			'Not every copy is a mistake. An invoice must keep the address it was sent to, even after the customer moves. That is a different fact, and normalizing it away loses history.',
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
			why: 'The customer\'s current address and the address an invoice was sent to are two facts. When the customer moves, the old invoice must not change. Normalization is about one fact in one place, not about never storing similar values.'
		}
	],
	takeaway: 'Store each fact once, in the table about the thing it describes: every column a fact about the key, the whole key and nothing else. Copy only when the copy is a different fact, like a price at the time of sale.',
	sources: [
		{ title: 'PostgreSQL docs, Foreign Keys (tutorial)', url: 'https://www.postgresql.org/docs/current/tutorial-fk.html' },
		{ title: 'PostgreSQL docs, Constraints', url: 'https://www.postgresql.org/docs/current/ddl-constraints.html' },
		{ title: 'William Kent, A Simple Guide to Five Normal Forms in Relational Database Theory (Communications of the ACM, 1983)', url: 'https://doi.org/10.1145/358024.358054' }
	]
};
