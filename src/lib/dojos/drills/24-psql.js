/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'psql',
	part: 'SQL',
	title: 'psql',
	minutes: 10,
	hook: [
		'Support says the order history page of one customer, id 42, takes seconds to load. You open a terminal on your laptop and connect with `psql shop`. You need to see the tables, time the slow query, ask PostgreSQL for its plan and pull the rows into a CSV file for the bug report.',
		'The database `shop` has one table: `orders (id bigint PRIMARY KEY, customer_id bigint NOT NULL, region text NOT NULL, total numeric(10,2) NOT NULL)` with 3 rows. Your current directory on the laptop holds `new_orders.csv`, with the header line `id,customer_id,region,total` and 2 orders. Reps 1 to 9 are typed at the `shop=>` prompt, reps 10 and 11 in your shell.'
	],
	terms: [
		{ term: 'meta-command', def: 'A psql command that starts with a backslash, such as `\\dt`. psql runs it itself and never sends it to the server.' },
		{ term: '\\copy', def: 'The psql meta-command that moves rows between a table and a file on the machine where psql runs, here your laptop.' },
		{ term: 'plan', def: 'The steps PostgreSQL picks to run a query, such as a sequential scan of `orders` or an index scan. `EXPLAIN` prints it.' }
	],
	reps: [
		{
			prompt: 'List the tables of the database, and only the tables.',
			accept: ['\\dt'],
			why: '`\\d` is the describe family and `t` means tables. A bare `\\d` also lists views, materialized views, sequences and foreign tables. By default only the objects you created are shown, not the system tables.'
		},
		{
			prompt: 'List the tables again, this time with their size on disk.',
			accept: ['\\dt+'],
			why: 'The `+` adds columns to the listing: persistence, the size on disk and the description. It works on the other `\\d` commands too, such as `\\d+ orders`.'
		},
		{
			prompt: 'Show the columns, types, indexes and constraints of `orders`.',
			accept: ['\\d orders', '\\d public.orders'],
			why: '`\\d orders` prints each column with its type, nullability and default, then the indexes. Here the only index is `orders_pkey` on `id`, so nothing indexes `customer_id`.'
		},
		{
			prompt: 'psql prints results as a table right now. Switch expanded display on, so each column of a row prints on its own line.',
			accept: ['\\x on', '\\x'],
			why: '`\\x on` sets expanded mode, and psql answers `Expanded display is on`. A bare `\\x` toggles it, so it also turns it on when it was off. `\\x auto` expands only the results wider than the screen.'
		},
		{
			prompt: 'Make psql print how long each statement takes.',
			accept: ['\\timing on', '\\timing'],
			why: 'psql answers `Timing is on`, then prints a line such as `Time: 0.512 ms` after each statement. The time is in milliseconds. A bare `\\timing` toggles the setting.'
		},
		{
			prompt: 'Export the whole `orders` table to `orders.csv` on your laptop, as CSV with a header line.',
			accept: [
				"\\copy orders TO 'orders.csv' WITH (FORMAT csv, HEADER)",
				"\\copy orders to 'orders.csv' with (format csv, header)",
				"\\copy orders TO 'orders.csv' (FORMAT csv, HEADER)",
				"\\copy orders TO 'orders.csv' WITH (FORMAT csv, HEADER true)",
				"\\copy orders TO 'orders.csv' CSV HEADER",
				"\\copy orders to 'orders.csv' csv header",
				"\\copy orders TO 'orders.csv' WITH CSV HEADER",
				"\\copy orders to 'orders.csv' with csv header"
			],
			why: '`\\copy` runs a `COPY` on the server, and psql writes the file on your laptop with your own permissions. `FORMAT csv` separates fields with commas and `HEADER` writes the column names first. The SQL `COPY orders TO \'orders.csv\'` would write the file on the database server instead.'
		},
		{
			prompt: 'Load the 2 orders of `new_orders.csv` into `orders`. The file is CSV and its first line is a header.',
			accept: [
				"\\copy orders FROM 'new_orders.csv' WITH (FORMAT csv, HEADER)",
				"\\copy orders from 'new_orders.csv' with (format csv, header)",
				"\\copy orders FROM 'new_orders.csv' (FORMAT csv, HEADER)",
				"\\copy orders FROM 'new_orders.csv' WITH (FORMAT csv, HEADER true)",
				"\\copy orders FROM 'new_orders.csv' CSV HEADER",
				"\\copy orders from 'new_orders.csv' csv header",
				"\\copy orders FROM 'new_orders.csv' WITH CSV HEADER",
				"\\copy orders from 'new_orders.csv' with csv header"
			],
			why: '`FROM` reads the file and inserts its rows, and psql prints `COPY 2`. With `HEADER`, the first line is skipped. Without it, the load stops on `invalid input syntax for type bigint: "id"` and inserts no row.'
		},
		{
			prompt: 'Export only the orders of customer 42 to `customer42.csv`, as CSV with a header line.',
			accept: [
				"\\copy (SELECT * FROM orders WHERE customer_id = 42) TO 'customer42.csv' WITH (FORMAT csv, HEADER)",
				"\\copy (select * from orders where customer_id = 42) to 'customer42.csv' with (format csv, header)",
				"\\copy (SELECT * FROM orders WHERE customer_id = 42) TO 'customer42.csv' (FORMAT csv, HEADER)",
				"\\copy (SELECT * FROM orders WHERE customer_id = 42) TO 'customer42.csv' CSV HEADER",
				"\\copy (select * from orders where customer_id = 42) to 'customer42.csv' csv header",
				"\\copy (SELECT * FROM orders WHERE customer_id = 42) TO 'customer42.csv' WITH CSV HEADER",
				"\\copy (SELECT * FROM orders WHERE customer_id=42) TO 'customer42.csv' WITH (FORMAT csv, HEADER)"
			],
			why: 'In place of a table name, `\\copy` takes a query in parentheses, but only with `TO`. The file gets the header and orders 1 and 3. psql reads the whole rest of the line as the `\\copy` arguments, so the command must fit on one line.'
		},
		{
			prompt: 'Show the plan of `SELECT * FROM orders WHERE customer_id = 42` with the real time and row count of each step.',
			accept: [
				'EXPLAIN ANALYZE SELECT * FROM orders WHERE customer_id = 42',
				'explain analyze select * from orders where customer_id = 42',
				'EXPLAIN (ANALYZE) SELECT * FROM orders WHERE customer_id = 42',
				'explain (analyze) select * from orders where customer_id = 42',
				'EXPLAIN ANALYZE SELECT * FROM orders WHERE customer_id=42',
				'explain analyze select * from orders where customer_id=42'
			],
			why: '`EXPLAIN` alone prints the plan with estimates. `ANALYZE` really runs the query and adds the actual time and rows of each step, here a `Seq Scan on orders`. On an `UPDATE` or `DELETE`, the change happens too, so wrap it in `BEGIN` and `ROLLBACK`.'
		},
		{
			prompt: 'From your shell, run `SELECT count(*) FROM orders` on the database `shop` and exit.',
			accept: [
				"psql -d shop -c 'SELECT count(*) FROM orders'",
				'psql -d shop -c "SELECT count(*) FROM orders"',
				"psql shop -c 'SELECT count(*) FROM orders'",
				'psql shop -c "SELECT count(*) FROM orders"',
				"psql -c 'SELECT count(*) FROM orders' shop",
				'psql -c "SELECT count(*) FROM orders" shop',
				"psql -d shop -c 'select count(*) from orders'",
				"psql shop -c 'select count(*) from orders'"
			],
			why: '`-c` runs one command string and exits without reading standard input. `-d shop` names the database, and a bare `shop` with no option in front does the same. psql prints the result as a table, with the `count` header and `(1 row)`.'
		},
		{
			prompt: 'Run the same count for a shell script: print only the number `3`, with no header, no `(1 row)` footer and no padding.',
			accept: [
				"psql -d shop -At -c 'SELECT count(*) FROM orders'",
				"psql -d shop -tA -c 'SELECT count(*) FROM orders'",
				"psql -d shop -Atc 'SELECT count(*) FROM orders'",
				"psql -d shop -A -t -c 'SELECT count(*) FROM orders'",
				"psql shop -At -c 'SELECT count(*) FROM orders'",
				"psql shop -tA -c 'SELECT count(*) FROM orders'",
				"psql -At -d shop -c 'SELECT count(*) FROM orders'",
				'psql -d shop -At -c "SELECT count(*) FROM orders"'
			],
			why: '`-t` (tuples only) drops the column names and the row count footer. `-A` (no align) drops the spaces psql adds to line up columns. The output is the line `3`, ready for `count=$(psql ...)`.'
		}
	],
	quiz: [],
	recall: {
		q: 'You run `\\copy orders TO \'orders.csv\' WITH (FORMAT csv, HEADER)` in psql on your laptop. On which machine does `orders.csv` appear, and why?',
		a: 'On your laptop. psql reads the rows from the server and writes the file itself, with your local permissions. The SQL `COPY` would write it on the database server.'
	},
	sources: [
		{ title: 'PostgreSQL: psql', url: 'https://www.postgresql.org/docs/current/app-psql.html' },
		{ title: 'PostgreSQL: COPY', url: 'https://www.postgresql.org/docs/current/sql-copy.html' },
		{ title: 'PostgreSQL: EXPLAIN', url: 'https://www.postgresql.org/docs/current/sql-explain.html' }
	]
};
