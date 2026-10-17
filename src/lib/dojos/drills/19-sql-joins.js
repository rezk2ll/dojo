/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'sql-joins',
	part: 'SQL',
	title: 'Joins',
	minutes: 10,
	hook: [
		'The tea shop wants to email the customers who signed up but never ordered, and to thank the people who brought friends. The names are in one table and the orders in another, so each answer needs a join. You write them in `psql`, on PostgreSQL.',
		'`customers (id, name, city, referred_by)`: Ana Costa (Lyon), Ben Okafor (Paris, referred by Ana), Chloé Martin (Lyon, referred by Ana), Dmitri Ivanov (no city, referred by Ben), Emma Schulz (Lille) and Farid Benali (Paris). `referred_by` holds the `id` of another customer, or NULL.',
		'`orders (id, customer_id, status, ordered_at)` holds 9 orders; Emma and Farid have none, and the guest order 107 has a NULL `customer_id`. `order_items (order_id, product_id, quantity)` links orders to `products (id, name)`, and the `name` column of both `customers` and `products` is UNIQUE. Write the aliases `c`, `o`, `oi`, `p` and `r` without AS, as in `customers c`.'
	],
	terms: [
		{ term: 'join condition', def: 'The test after ON, such as `o.customer_id = c.id`. A pair of rows goes into the result when it is true.' },
		{ term: 'LEFT JOIN', def: 'A join that keeps every row of the left table. When no right row matches, the right columns are NULL.' },
		{ term: 'table alias', def: 'A short name for a table in one query, such as `c` in `customers c`. A self join needs two aliases for the same table.' }
	],
	reps: [
		{
			prompt: 'Show each order `id` with the name of its customer: `o.id`, then `c.name`.',
			accept: [
				'SELECT o.id, c.name FROM orders o JOIN customers c ON c.id = o.customer_id',
				'SELECT o.id, c.name FROM orders o JOIN customers c ON o.customer_id = c.id',
				'SELECT o.id, c.name FROM orders o INNER JOIN customers c ON c.id = o.customer_id',
				'SELECT o.id, c.name FROM orders o INNER JOIN customers c ON o.customer_id = c.id',
				'select o.id, c.name from orders o join customers c on c.id = o.customer_id',
				'select o.id, c.name from orders o join customers c on o.customer_id = c.id',
				'select o.id, c.name from orders o inner join customers c on c.id = o.customer_id',
				'select o.id, c.name from orders o inner join customers c on o.customer_id = c.id'
			],
			why: '`JOIN … ON c.id = o.customer_id` pairs each order with the customer whose `id` matches. JOIN is an inner join: order 107 has a NULL `customer_id`, which matches no customer, so 8 of the 9 orders come back.'
		},
		{
			prompt: 'Show the `id` of the orders placed by customers who live in Lyon.',
			accept: [
				"SELECT o.id FROM orders o JOIN customers c ON c.id = o.customer_id WHERE c.city = 'Lyon'",
				"SELECT o.id FROM orders o JOIN customers c ON o.customer_id = c.id WHERE c.city = 'Lyon'",
				"SELECT o.id FROM orders o INNER JOIN customers c ON c.id = o.customer_id WHERE c.city = 'Lyon'",
				"SELECT o.id FROM orders o INNER JOIN customers c ON o.customer_id = c.id WHERE c.city = 'Lyon'",
				"select o.id from orders o join customers c on c.id = o.customer_id where c.city = 'Lyon'",
				"select o.id from orders o join customers c on o.customer_id = c.id where c.city = 'Lyon'",
				"select o.id from orders o inner join customers c on c.id = o.customer_id where c.city = 'Lyon'",
				"select o.id from orders o inner join customers c on o.customer_id = c.id where c.city = 'Lyon'"
			],
			why: 'The join puts the customer’s columns next to each order, then `WHERE c.city = \'Lyon\'` filters the joined rows. Ana and Chloé live in Lyon, which gives 5 orders.'
		},
		{
			prompt: 'Show every customer’s name with the `id` of each of their orders, including customers with no order: `c.name`, then `o.id`.',
			accept: [
				'SELECT c.name, o.id FROM customers c LEFT JOIN orders o ON o.customer_id = c.id',
				'SELECT c.name, o.id FROM customers c LEFT JOIN orders o ON c.id = o.customer_id',
				'SELECT c.name, o.id FROM customers c LEFT OUTER JOIN orders o ON o.customer_id = c.id',
				'SELECT c.name, o.id FROM customers c LEFT OUTER JOIN orders o ON c.id = o.customer_id',
				'select c.name, o.id from customers c left join orders o on o.customer_id = c.id',
				'select c.name, o.id from customers c left join orders o on c.id = o.customer_id',
				'select c.name, o.id from customers c left outer join orders o on o.customer_id = c.id',
				'select c.name, o.id from customers c left outer join orders o on c.id = o.customer_id'
			],
			why: '`LEFT JOIN` keeps every row of `customers`, the table on its left. Emma and Farid match no order, so each gets one row with `o.id` NULL.'
		},
		{
			prompt: 'Show the names of the customers who never ordered. Use a LEFT JOIN.',
			accept: [
				'SELECT c.name FROM customers c LEFT JOIN orders o ON o.customer_id = c.id WHERE o.id IS NULL',
				'SELECT c.name FROM customers c LEFT JOIN orders o ON o.customer_id = c.id WHERE o.customer_id IS NULL',
				'SELECT c.name FROM customers c LEFT JOIN orders o ON c.id = o.customer_id WHERE o.id IS NULL',
				'SELECT c.name FROM customers c LEFT JOIN orders o ON c.id = o.customer_id WHERE o.customer_id IS NULL',
				'SELECT c.name FROM customers c LEFT OUTER JOIN orders o ON o.customer_id = c.id WHERE o.id IS NULL',
				'SELECT c.name FROM customers c LEFT OUTER JOIN orders o ON o.customer_id = c.id WHERE o.customer_id IS NULL',
				'SELECT c.name FROM customers c LEFT OUTER JOIN orders o ON c.id = o.customer_id WHERE o.id IS NULL',
				'SELECT c.name FROM customers c LEFT OUTER JOIN orders o ON c.id = o.customer_id WHERE o.customer_id IS NULL',
				'select c.name from customers c left join orders o on o.customer_id = c.id where o.id is null',
				'select c.name from customers c left join orders o on o.customer_id = c.id where o.customer_id is null',
				'select c.name from customers c left join orders o on c.id = o.customer_id where o.id is null',
				'select c.name from customers c left join orders o on c.id = o.customer_id where o.customer_id is null',
				'select c.name from customers c left outer join orders o on o.customer_id = c.id where o.id is null',
				'select c.name from customers c left outer join orders o on o.customer_id = c.id where o.customer_id is null',
				'select c.name from customers c left outer join orders o on c.id = o.customer_id where o.id is null',
				'select c.name from customers c left outer join orders o on c.id = o.customer_id where o.customer_id is null'
			],
			why: 'After the LEFT JOIN, a customer with no order has NULL in every `o` column. `WHERE o.id IS NULL` keeps just those rows: Emma Schulz and Farid Benali. `o.id = NULL` would keep none, because `=` with a NULL input yields NULL, never true.'
		},
		{
			prompt: 'For each customer who was referred, show their name and the name of the customer who referred them. Use the alias `r` for the referrer.',
			accept: [
				'SELECT c.name, r.name FROM customers c JOIN customers r ON r.id = c.referred_by',
				'SELECT c.name, r.name FROM customers c JOIN customers r ON c.referred_by = r.id',
				'SELECT c.name, r.name FROM customers c INNER JOIN customers r ON r.id = c.referred_by',
				'SELECT c.name, r.name FROM customers c INNER JOIN customers r ON c.referred_by = r.id',
				'select c.name, r.name from customers c join customers r on r.id = c.referred_by',
				'select c.name, r.name from customers c join customers r on c.referred_by = r.id',
				'select c.name, r.name from customers c inner join customers r on r.id = c.referred_by',
				'select c.name, r.name from customers c inner join customers r on c.referred_by = r.id'
			],
			why: 'A self join reads `customers` twice under 2 aliases. `ON r.id = c.referred_by` finds the referrer’s row, which gives 3 pairs: Ben and Ana, Chloé and Ana, Dmitri and Ben.'
		},
		{
			prompt: 'Starting from `orders o`, show the order date, the product name and the quantity of every order line: `o.ordered_at`, `p.name`, `oi.quantity`.',
			accept: [
				'SELECT o.ordered_at, p.name, oi.quantity FROM orders o JOIN order_items oi ON oi.order_id = o.id JOIN products p ON p.id = oi.product_id',
				'SELECT o.ordered_at, p.name, oi.quantity FROM orders o JOIN order_items oi ON oi.order_id = o.id JOIN products p ON oi.product_id = p.id',
				'SELECT o.ordered_at, p.name, oi.quantity FROM orders o JOIN order_items oi ON o.id = oi.order_id JOIN products p ON p.id = oi.product_id',
				'SELECT o.ordered_at, p.name, oi.quantity FROM orders o JOIN order_items oi ON o.id = oi.order_id JOIN products p ON oi.product_id = p.id',
				'SELECT o.ordered_at, p.name, oi.quantity FROM orders o INNER JOIN order_items oi ON oi.order_id = o.id INNER JOIN products p ON p.id = oi.product_id',
				'SELECT o.ordered_at, p.name, oi.quantity FROM orders o INNER JOIN order_items oi ON oi.order_id = o.id INNER JOIN products p ON oi.product_id = p.id',
				'SELECT o.ordered_at, p.name, oi.quantity FROM orders o INNER JOIN order_items oi ON o.id = oi.order_id INNER JOIN products p ON p.id = oi.product_id',
				'SELECT o.ordered_at, p.name, oi.quantity FROM orders o INNER JOIN order_items oi ON o.id = oi.order_id INNER JOIN products p ON oi.product_id = p.id',
				'select o.ordered_at, p.name, oi.quantity from orders o join order_items oi on oi.order_id = o.id join products p on p.id = oi.product_id',
				'select o.ordered_at, p.name, oi.quantity from orders o join order_items oi on oi.order_id = o.id join products p on oi.product_id = p.id',
				'select o.ordered_at, p.name, oi.quantity from orders o join order_items oi on o.id = oi.order_id join products p on p.id = oi.product_id',
				'select o.ordered_at, p.name, oi.quantity from orders o join order_items oi on o.id = oi.order_id join products p on oi.product_id = p.id',
				'select o.ordered_at, p.name, oi.quantity from orders o inner join order_items oi on oi.order_id = o.id inner join products p on p.id = oi.product_id',
				'select o.ordered_at, p.name, oi.quantity from orders o inner join order_items oi on oi.order_id = o.id inner join products p on oi.product_id = p.id',
				'select o.ordered_at, p.name, oi.quantity from orders o inner join order_items oi on o.id = oi.order_id inner join products p on p.id = oi.product_id',
				'select o.ordered_at, p.name, oi.quantity from orders o inner join order_items oi on o.id = oi.order_id inner join products p on oi.product_id = p.id'
			],
			why: 'The first JOIN adds the order lines to each order, and the second adds the product of each line. Each JOIN has its own ON. The result has one row per row of `order_items`, 11 here.'
		},
		{
			prompt: 'Show each product name with the total quantity sold. Group by `p.name`.',
			accept: [
				'SELECT p.name, SUM(oi.quantity) FROM products p JOIN order_items oi ON oi.product_id = p.id GROUP BY p.name',
				'SELECT p.name, SUM(oi.quantity) FROM products p JOIN order_items oi ON p.id = oi.product_id GROUP BY p.name',
				'SELECT p.name, SUM(oi.quantity) FROM products p INNER JOIN order_items oi ON oi.product_id = p.id GROUP BY p.name',
				'SELECT p.name, SUM(oi.quantity) FROM products p INNER JOIN order_items oi ON p.id = oi.product_id GROUP BY p.name',
				'SELECT p.name, sum(oi.quantity) FROM products p JOIN order_items oi ON oi.product_id = p.id GROUP BY p.name',
				'SELECT p.name, sum(oi.quantity) FROM products p JOIN order_items oi ON p.id = oi.product_id GROUP BY p.name',
				'SELECT p.name, sum(oi.quantity) FROM products p INNER JOIN order_items oi ON oi.product_id = p.id GROUP BY p.name',
				'SELECT p.name, sum(oi.quantity) FROM products p INNER JOIN order_items oi ON p.id = oi.product_id GROUP BY p.name',
				'select p.name, sum(oi.quantity) from products p join order_items oi on oi.product_id = p.id group by p.name',
				'select p.name, sum(oi.quantity) from products p join order_items oi on p.id = oi.product_id group by p.name',
				'select p.name, sum(oi.quantity) from products p inner join order_items oi on oi.product_id = p.id group by p.name',
				'select p.name, sum(oi.quantity) from products p inner join order_items oi on p.id = oi.product_id group by p.name'
			],
			why: 'The join gives one row per order line with its product name, and `GROUP BY p.name` adds up `oi.quantity` per name. An inner join drops the products that were never ordered, so 8 of the 10 products appear.'
		},
		{
			prompt: 'Show each customer’s name with their number of orders, with `0` for the customers who never ordered. Group by `c.name`.',
			accept: [
				'SELECT c.name, COUNT(o.id) FROM customers c LEFT JOIN orders o ON o.customer_id = c.id GROUP BY c.name',
				'SELECT c.name, COUNT(o.id) FROM customers c LEFT JOIN orders o ON c.id = o.customer_id GROUP BY c.name',
				'SELECT c.name, COUNT(o.id) FROM customers c LEFT OUTER JOIN orders o ON o.customer_id = c.id GROUP BY c.name',
				'SELECT c.name, COUNT(o.id) FROM customers c LEFT OUTER JOIN orders o ON c.id = o.customer_id GROUP BY c.name',
				'SELECT c.name, count(o.id) FROM customers c LEFT JOIN orders o ON o.customer_id = c.id GROUP BY c.name',
				'SELECT c.name, count(o.id) FROM customers c LEFT JOIN orders o ON c.id = o.customer_id GROUP BY c.name',
				'SELECT c.name, count(o.id) FROM customers c LEFT OUTER JOIN orders o ON o.customer_id = c.id GROUP BY c.name',
				'SELECT c.name, count(o.id) FROM customers c LEFT OUTER JOIN orders o ON c.id = o.customer_id GROUP BY c.name',
				'select c.name, count(o.id) from customers c left join orders o on o.customer_id = c.id group by c.name',
				'select c.name, count(o.id) from customers c left join orders o on c.id = o.customer_id group by c.name',
				'select c.name, count(o.id) from customers c left outer join orders o on o.customer_id = c.id group by c.name',
				'select c.name, count(o.id) from customers c left outer join orders o on c.id = o.customer_id group by c.name'
			],
			why: '`count(o.id)` counts the non-null `o.id` values, so the NULL row of Emma or Farid counts `0`. `count(*)` would count that row and print `1` for them.'
		},
		{
			prompt: 'Show every customer’s name with the `id` of their cancelled orders, and NULL for customers with no cancelled order. Put the status test in the ON clause.',
			accept: [
				"SELECT c.name, o.id FROM customers c LEFT JOIN orders o ON o.customer_id = c.id AND o.status = 'cancelled'",
				"SELECT c.name, o.id FROM customers c LEFT JOIN orders o ON c.id = o.customer_id AND o.status = 'cancelled'",
				"SELECT c.name, o.id FROM customers c LEFT JOIN orders o ON o.status = 'cancelled' AND o.customer_id = c.id",
				"SELECT c.name, o.id FROM customers c LEFT JOIN orders o ON o.status = 'cancelled' AND c.id = o.customer_id",
				"SELECT c.name, o.id FROM customers c LEFT OUTER JOIN orders o ON o.customer_id = c.id AND o.status = 'cancelled'",
				"SELECT c.name, o.id FROM customers c LEFT OUTER JOIN orders o ON c.id = o.customer_id AND o.status = 'cancelled'",
				"SELECT c.name, o.id FROM customers c LEFT OUTER JOIN orders o ON o.status = 'cancelled' AND o.customer_id = c.id",
				"SELECT c.name, o.id FROM customers c LEFT OUTER JOIN orders o ON o.status = 'cancelled' AND c.id = o.customer_id",
				"select c.name, o.id from customers c left join orders o on o.customer_id = c.id and o.status = 'cancelled'",
				"select c.name, o.id from customers c left join orders o on c.id = o.customer_id and o.status = 'cancelled'",
				"select c.name, o.id from customers c left join orders o on o.status = 'cancelled' and o.customer_id = c.id",
				"select c.name, o.id from customers c left join orders o on o.status = 'cancelled' and c.id = o.customer_id",
				"select c.name, o.id from customers c left outer join orders o on o.customer_id = c.id and o.status = 'cancelled'",
				"select c.name, o.id from customers c left outer join orders o on c.id = o.customer_id and o.status = 'cancelled'",
				"select c.name, o.id from customers c left outer join orders o on o.status = 'cancelled' and o.customer_id = c.id",
				"select c.name, o.id from customers c left outer join orders o on o.status = 'cancelled' and c.id = o.customer_id"
			],
			why: 'In ON, `o.status = \'cancelled\'` decides which orders match before the LEFT JOIN adds the NULL rows, so all 6 customers stay. In WHERE, the same test would run after the join and drop every customer without a cancelled order, leaving Ben and Chloé.'
		}
	],
	quiz: [],
	recall: {
		q: 'You LEFT JOIN `customers c` to `orders o`. Which WHERE condition keeps only the customers who never ordered, and why does it work?',
		a: '`WHERE o.id IS NULL`. A customer with no matching order gets one row whose `o` columns are all NULL.'
	},
	sources: [
		{ title: 'PostgreSQL docs, Joins Between Tables (tutorial)', url: 'https://www.postgresql.org/docs/current/tutorial-join.html' },
		{ title: 'PostgreSQL docs, Table Expressions (joined tables)', url: 'https://www.postgresql.org/docs/current/queries-table-expressions.html' }
	]
};
