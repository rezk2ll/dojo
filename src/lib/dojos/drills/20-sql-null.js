/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'sql-null',
	part: 'SQL',
	title: 'NULL in queries',
	minutes: 10,
	hook: [
		'The tea shop’s marketing report says 0 customers have never ordered, yet Emma and Farid have an account and no order. The query behind the report uses `NOT IN`, and one order has a NULL `customer_id`. You rewrite the report’s queries one by one in `psql`, on PostgreSQL.',
		'`customers (id, name, city, phone)` has 6 rows: Ana Costa, Ben Okafor, Chloé Martin, Dmitri Ivanov, Emma Schulz and Farid Benali. Ben, Dmitri and Farid have a NULL `phone`. Emma and Farid have no order.',
		'`orders (id, customer_id, status, coupon, shipped_at)` has 9 rows. Guest order 107 has a NULL `customer_id`. `coupon` is `WELCOME10` on 2 orders, `TEA5` on 2, NULL on 3, and an empty string `\'\'` on 2, saved by an old checkout form. `shipped_at` is a date on the 4 shipped orders and NULL on the other 5.'
	],
	terms: [
		{ term: 'NULL', def: 'The marker for a missing value. `=`, `<>` and the other comparison operators return NULL when one side is NULL, and WHERE drops a row whose condition is NULL.' },
		{ term: 'COALESCE', def: 'A function that returns the first of its arguments that is not NULL, such as `COALESCE(phone, \'none\')`.' },
		{ term: 'NULLIF', def: 'A function that returns NULL when its 2 arguments are equal, and its first argument otherwise.' }
	],
	reps: [
		{
			prompt: 'Show the names of the customers with no phone number.',
			accept: [
				'SELECT name FROM customers WHERE phone IS NULL',
				'select name from customers where phone is null'
			],
			why: '`IS NULL` is true for a missing value, so Ben, Dmitri and Farid come back. `phone = NULL` returns NULL for every row, and the query would return no row at all.'
		},
		{
			prompt: 'Show the `id` of the orders that have a `shipped_at` date.',
			accept: [
				'SELECT id FROM orders WHERE shipped_at IS NOT NULL',
				'select id from orders where shipped_at is not null'
			],
			why: '`IS NOT NULL` keeps the 4 rows where `shipped_at` holds a date. `shipped_at <> NULL` would again return NULL for every row and keep nothing.'
		},
		{
			prompt: 'Show each customer’s name and phone, with the text `none` when the phone is NULL.',
			accept: [
				"SELECT name, COALESCE(phone, 'none') FROM customers",
				"SELECT name, COALESCE(phone,'none') FROM customers",
				"SELECT name, coalesce(phone, 'none') FROM customers",
				"SELECT name, coalesce(phone,'none') FROM customers",
				"select name, coalesce(phone, 'none') from customers",
				"select name, coalesce(phone,'none') from customers"
			],
			why: '`COALESCE(phone, \'none\')` returns `phone` when it is not NULL, and `\'none\'` otherwise. The column itself is not changed; only the result shows `none`.'
		},
		{
			prompt: 'In one query with no WHERE, show the number of orders, then the number of orders whose `coupon` is not NULL.',
			accept: [
				'SELECT COUNT(*), COUNT(coupon) FROM orders',
				'SELECT count(*), count(coupon) FROM orders',
				'select count(*), count(coupon) from orders'
			],
			why: '`count(*)` counts rows: `9`. `count(coupon)` counts the rows where `coupon` is not NULL: `6`, because the 2 empty strings are values, not NULLs.'
		},
		{
			prompt: 'Show each order `id` with its `coupon`, turning the empty string `\'\'` into NULL.',
			accept: [
				"SELECT id, NULLIF(coupon, '') FROM orders",
				"SELECT id, NULLIF(coupon,'') FROM orders",
				"SELECT id, nullif(coupon, '') FROM orders",
				"SELECT id, nullif(coupon,'') FROM orders",
				"select id, nullif(coupon, '') from orders",
				"select id, nullif(coupon,'') from orders"
			],
			why: '`NULLIF(coupon, \'\')` returns NULL when `coupon` equals `\'\'`, and `coupon` otherwise. Orders 103 and 108 now show NULL like the 3 orders that never had a coupon.'
		},
		{
			prompt: 'With no WHERE, count the orders that have a real coupon code: neither NULL nor `\'\'`.',
			accept: [
				"SELECT COUNT(NULLIF(coupon, '')) FROM orders",
				"SELECT COUNT(NULLIF(coupon,'')) FROM orders",
				"SELECT count(nullif(coupon, '')) FROM orders",
				"SELECT count(nullif(coupon,'')) FROM orders",
				"select count(nullif(coupon, '')) from orders",
				"select count(nullif(coupon,'')) from orders"
			],
			why: '`NULLIF` turns the 2 empty strings into NULL, and `count` skips every NULL. The result is `4`: the 2 `WELCOME10` and the 2 `TEA5`.'
		},
		{
			prompt: 'Show each order `id` and `shipped_at`, the latest shipment first and the unshipped orders last.',
			accept: [
				'SELECT id, shipped_at FROM orders ORDER BY shipped_at DESC NULLS LAST',
				'select id, shipped_at from orders order by shipped_at desc nulls last'
			],
			why: 'PostgreSQL sorts NULL as larger than any date, so `DESC` alone would put the 5 unshipped orders first. `NULLS LAST` moves them to the end.'
		},
		{
			prompt: 'Show the `id` of every order whose coupon is not `WELCOME10`, including the orders with a NULL coupon.',
			accept: [
				"SELECT id FROM orders WHERE coupon IS DISTINCT FROM 'WELCOME10'",
				"SELECT id FROM orders WHERE coupon <> 'WELCOME10' OR coupon IS NULL",
				"SELECT id FROM orders WHERE coupon != 'WELCOME10' OR coupon IS NULL",
				"SELECT id FROM orders WHERE coupon IS NULL OR coupon <> 'WELCOME10'",
				"SELECT id FROM orders WHERE coupon IS NULL OR coupon != 'WELCOME10'",
				"select id from orders where coupon is distinct from 'WELCOME10'",
				"select id from orders where coupon <> 'WELCOME10' or coupon is null",
				"select id from orders where coupon != 'WELCOME10' or coupon is null",
				"select id from orders where coupon is null or coupon <> 'WELCOME10'",
				"select id from orders where coupon is null or coupon != 'WELCOME10'"
			],
			why: '`IS DISTINCT FROM` treats NULL as a value, so `NULL IS DISTINCT FROM \'WELCOME10\'` is true and the query returns 7 orders. `coupon <> \'WELCOME10\'` alone returns 4, because it drops the 3 NULL rows.'
		},
		{
			prompt: 'Show `c.name` for the customers who never ordered. Use NOT EXISTS.',
			accept: [
				'SELECT c.name FROM customers c WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id)',
				'SELECT c.name FROM customers c WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE c.id = o.customer_id)',
				'SELECT c.name FROM customers c WHERE NOT EXISTS (SELECT * FROM orders o WHERE o.customer_id = c.id)',
				'SELECT c.name FROM customers c WHERE NOT EXISTS (SELECT * FROM orders o WHERE c.id = o.customer_id)',
				'select c.name from customers c where not exists (select 1 from orders o where o.customer_id = c.id)',
				'select c.name from customers c where not exists (select 1 from orders o where c.id = o.customer_id)',
				'select c.name from customers c where not exists (select * from orders o where o.customer_id = c.id)',
				'select c.name from customers c where not exists (select * from orders o where c.id = o.customer_id)'
			],
			why: '`NOT EXISTS` is true when the subquery returns no row for that customer, which finds Emma and Farid. The NULL in order 107 matches no `c.id`, so it changes nothing here.'
		},
		{
			prompt: 'Show the names of the customers who never ordered, with `id NOT IN (…)` on a subquery over `orders`. Make it return Emma and Farid.',
			accept: [
				'SELECT name FROM customers WHERE id NOT IN (SELECT customer_id FROM orders WHERE customer_id IS NOT NULL)',
				'select name from customers where id not in (select customer_id from orders where customer_id is not null)'
			],
			why: 'Without the inner WHERE, the list holds the NULL of order 107, and `5 NOT IN (1, 2, 3, 4, NULL)` is NULL, not true: the query returns 0 rows. `WHERE customer_id IS NOT NULL` removes that NULL from the list.'
		}
	],
	quiz: [],
	recall: {
		q: 'Why does `WHERE id NOT IN (SELECT customer_id FROM orders)` return no customer when one order has a NULL `customer_id`?',
		a: 'For an `id` that is not in the list, NOT IN compares it with the NULL and gets NULL, not true, so WHERE drops every row. Filter the NULLs out of the subquery, or use NOT EXISTS.'
	},
	sources: [
		{ title: 'PostgreSQL docs, Comparison Functions and Operators', url: 'https://www.postgresql.org/docs/current/functions-comparison.html' },
		{ title: 'PostgreSQL docs, Conditional Expressions (COALESCE, NULLIF)', url: 'https://www.postgresql.org/docs/current/functions-conditional.html' },
		{ title: 'PostgreSQL docs, Subquery Expressions (EXISTS, NOT IN)', url: 'https://www.postgresql.org/docs/current/functions-subquery.html' },
		{ title: 'PostgreSQL docs, Aggregate Functions', url: 'https://www.postgresql.org/docs/current/functions-aggregate.html' },
		{ title: 'PostgreSQL docs, Sorting Rows (ORDER BY)', url: 'https://www.postgresql.org/docs/current/queries-order.html' }
	]
};
