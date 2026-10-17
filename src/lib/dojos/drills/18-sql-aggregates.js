/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'sql-aggregates',
	part: 'SQL',
	title: 'Counting in SQL',
	minutes: 10,
	hook: [
		'It is the end of the month at the online tea shop, and the owner wants numbers: how many orders, how much money, which customers come back. A spreadsheet export would take an hour to clean. You answer each question with one query in `psql`, on PostgreSQL.',
		'The table `orders (id int PRIMARY KEY, customer_id int, status text, total numeric(8,2), ordered_at date)` holds 9 orders. `status` is `paid`, `shipped` or `cancelled`. Customer 1 has 3 orders, customers 2 and 3 have 2 each (one of them cancelled), customer 4 has 1, and order 107 was a guest checkout, so its `customer_id` is NULL. The table `order_items (order_id int, product_id int, quantity int)` holds one row per product in an order.'
	],
	terms: [
		{ term: 'aggregate function', def: 'A function such as `count`, `sum` or `avg` that reads many rows and returns one value.' },
		{ term: 'group', def: 'The set of rows that have the same values in the GROUP BY columns. The query returns one row per group.' },
		{ term: 'HAVING', def: 'A condition checked on each group after the aggregates are computed. A WHERE condition runs on each row, before the rows are grouped.' }
	],
	reps: [
		{
			prompt: 'Count all the orders.',
			accept: ['SELECT COUNT(*) FROM orders', 'select count(*) from orders', 'SELECT count(*) FROM orders'],
			why: '`count(*)` counts the input rows, whatever their columns hold. With no GROUP BY, the whole table is one group, so the query returns one row: `9`.'
		},
		{
			prompt: 'Add up the `total` of the orders whose status is `shipped`.',
			accept: [
				"SELECT SUM(total) FROM orders WHERE status = 'shipped'",
				"select sum(total) from orders where status = 'shipped'",
				"SELECT sum(total) FROM orders WHERE status = 'shipped'"
			],
			why: 'WHERE keeps the 4 shipped orders first, then `sum(total)` adds their totals: `137.00`. If no row passed the WHERE, `sum` would return NULL, not 0.'
		},
		{
			prompt: 'Show the smallest and the largest order `total`, in that order, in one row.',
			accept: ['SELECT MIN(total), MAX(total) FROM orders', 'select min(total), max(total) from orders', 'SELECT min(total), max(total) FROM orders'],
			why: '`min` and `max` each read all the rows and return one value, so two aggregates in the select list give one row with two columns: `9.50` and `59.00`.'
		},
		{
			prompt: 'Show the average order `total`, rounded to 2 decimals.',
			accept: [
				'SELECT ROUND(AVG(total), 2) FROM orders',
				'select round(avg(total), 2) from orders',
				'SELECT round(avg(total), 2) FROM orders',
				'SELECT ROUND(AVG(total),2) FROM orders',
				'select round(avg(total),2) from orders',
				'SELECT round(avg(total),2) FROM orders'
			],
			why: '`avg(total)` returns `27.3777…` for these 9 orders, as a numeric with many decimals. `round(…, 2)` keeps 2 of them: `27.38`.'
		},
		{
			prompt: 'Show each status with its number of orders.',
			accept: [
				'SELECT status, COUNT(*) FROM orders GROUP BY status',
				'select status, count(*) from orders group by status',
				'SELECT status, count(*) FROM orders GROUP BY status'
			],
			why: '`GROUP BY status` makes one group per status value, and `count(*)` counts the rows in each group: 3 groups here. `status` may sit in the select list because it has one value per group.'
		},
		{
			prompt: 'From `order_items`, show each `product_id` with the total quantity sold.',
			accept: [
				'SELECT product_id, SUM(quantity) FROM order_items GROUP BY product_id',
				'select product_id, sum(quantity) from order_items group by product_id',
				'SELECT product_id, sum(quantity) FROM order_items GROUP BY product_id'
			],
			why: 'Each product gets one group, and `sum(quantity)` adds the quantities of its rows. A product that is in no order has no row in `order_items`, so it does not appear at all.'
		},
		{
			prompt: 'Show each `customer_id` with the sum of its order totals, highest sum first.',
			accept: [
				'SELECT customer_id, SUM(total) FROM orders GROUP BY customer_id ORDER BY SUM(total) DESC',
				'select customer_id, sum(total) from orders group by customer_id order by sum(total) desc',
				'SELECT customer_id, sum(total) FROM orders GROUP BY customer_id ORDER BY sum(total) DESC',
				'SELECT customer_id, SUM(total) FROM orders GROUP BY customer_id ORDER BY 2 DESC',
				'select customer_id, sum(total) from orders group by customer_id order by 2 desc',
				'SELECT customer_id, sum(total) FROM orders GROUP BY customer_id ORDER BY 2 DESC'
			],
			why: 'ORDER BY runs after grouping, so it can sort on `sum(total)`, or on `2`, the second output column. The guest order forms its own group with a NULL `customer_id`, at `9.50`.'
		},
		{
			prompt: 'How many different customers placed an order? Print one number. The guest order must not count.',
			accept: [
				'SELECT COUNT(DISTINCT customer_id) FROM orders',
				'select count(distinct customer_id) from orders',
				'SELECT count(DISTINCT customer_id) FROM orders'
			],
			why: '`count(DISTINCT customer_id)` counts the distinct non-null values: customers 1, 2, 3 and 4, so `4`. The NULL of order 107 is skipped, because `count` with a column ignores NULLs.'
		},
		{
			prompt: 'Show each `customer_id` with its number of orders, only for customers with more than 2 orders.',
			accept: [
				'SELECT customer_id, COUNT(*) FROM orders GROUP BY customer_id HAVING COUNT(*) > 2',
				'select customer_id, count(*) from orders group by customer_id having count(*) > 2',
				'SELECT customer_id, count(*) FROM orders GROUP BY customer_id HAVING count(*) > 2',
				'SELECT customer_id, COUNT(*) FROM orders GROUP BY customer_id HAVING COUNT(*) >= 3',
				'select customer_id, count(*) from orders group by customer_id having count(*) >= 3',
				'SELECT customer_id, count(*) FROM orders GROUP BY customer_id HAVING count(*) >= 3'
			],
			why: 'HAVING drops whole groups after `count(*)` is known, which leaves customer 1 with 3 orders. `WHERE count(*) > 2` fails with `aggregate functions are not allowed in WHERE`, because WHERE runs before the groups exist.'
		},
		{
			prompt: 'Not counting cancelled orders, show each `customer_id` with its number of orders, only for customers with at least 2 such orders.',
			accept: [
				"SELECT customer_id, COUNT(*) FROM orders WHERE status <> 'cancelled' GROUP BY customer_id HAVING COUNT(*) >= 2",
				"select customer_id, count(*) from orders where status <> 'cancelled' group by customer_id having count(*) >= 2",
				"SELECT customer_id, count(*) FROM orders WHERE status <> 'cancelled' GROUP BY customer_id HAVING count(*) >= 2",
				"SELECT customer_id, COUNT(*) FROM orders WHERE status != 'cancelled' GROUP BY customer_id HAVING COUNT(*) >= 2",
				"select customer_id, count(*) from orders where status != 'cancelled' group by customer_id having count(*) >= 2",
				"SELECT customer_id, count(*) FROM orders WHERE status != 'cancelled' GROUP BY customer_id HAVING count(*) >= 2",
				"SELECT customer_id, COUNT(*) FROM orders WHERE status <> 'cancelled' GROUP BY customer_id HAVING COUNT(*) > 1",
				"select customer_id, count(*) from orders where status <> 'cancelled' group by customer_id having count(*) > 1",
				"SELECT customer_id, count(*) FROM orders WHERE status <> 'cancelled' GROUP BY customer_id HAVING count(*) > 1",
				"SELECT customer_id, COUNT(*) FROM orders WHERE status != 'cancelled' GROUP BY customer_id HAVING COUNT(*) > 1",
				"select customer_id, count(*) from orders where status != 'cancelled' group by customer_id having count(*) > 1",
				"SELECT customer_id, count(*) FROM orders WHERE status != 'cancelled' GROUP BY customer_id HAVING count(*) > 1"
			],
			why: 'WHERE removes the 2 cancelled rows before grouping, then HAVING keeps the groups with 2 rows or more. Only customer 1 is left; customers 2 and 3 drop to 1 order each.'
		}
	],
	quiz: [],
	recall: {
		q: 'You want the customers with more than 2 orders. Why does `WHERE count(*) > 2` fail, and what do you write instead?',
		a: 'WHERE filters rows before the groups and their counts exist, so PostgreSQL rejects an aggregate there. You write `GROUP BY customer_id HAVING count(*) > 2`.'
	},
	sources: [
		{ title: 'PostgreSQL docs, Aggregate Functions (tutorial)', url: 'https://www.postgresql.org/docs/current/tutorial-agg.html' },
		{ title: 'PostgreSQL docs, Aggregate Functions', url: 'https://www.postgresql.org/docs/current/functions-aggregate.html' },
		{ title: 'PostgreSQL docs, Table Expressions (GROUP BY and HAVING)', url: 'https://www.postgresql.org/docs/current/queries-table-expressions.html' },
		{ title: 'PostgreSQL docs, Value Expressions (aggregate expressions)', url: 'https://www.postgresql.org/docs/current/sql-expressions.html' }
	]
};
