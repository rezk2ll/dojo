/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'sql-select',
	part: 'SQL',
	title: 'SELECT basics',
	minutes: 10,
	hook: [
		'You run the database of a small online tea shop. The person who buys the stock sends you questions all morning: what is cheap, what is out of stock, what is in the green tea range. You answer each one with a query in `psql`, on PostgreSQL.',
		'The table is `products (id int PRIMARY KEY, name text UNIQUE, category text, price numeric(6,2), stock int)`. Its 10 rows: in `green`, Sencha 12.50 (stock 40), Gyokuro 28.00 (0) and Jasmine Pearls 19.90 (15); in `black`, Earl Grey 9.50 (60), Earl Grey Cream 11.00 (25) and Assam 8.00 (0); in `oolong`, Tie Guan Yin 22.00 (12) and Da Hong Pao 34.00 (5); in `teaware`, Glass Teapot 24.50 (8) and Bamboo Whisk 15.00 (30). No two products have the same price.'
	],
	terms: [
		{ term: 'select list', def: 'The expressions between SELECT and FROM. Each one gives one column of the result.' },
		{ term: 'pattern', def: 'The text on the right of LIKE. `%` matches any run of characters, even none, and `_` matches exactly one character.' },
		{ term: 'OFFSET', def: 'The number of sorted rows to skip before LIMIT starts counting the rows it returns.' }
	],
	reps: [
		{
			prompt: 'Show the name and the price of every product, in that column order.',
			accept: ['SELECT name, price FROM products', 'select name, price from products'],
			why: 'The select list `name, price` picks two columns, in that order. With no WHERE, every one of the 10 rows comes back, and with no ORDER BY their order is unspecified.'
		},
		{
			prompt: 'Show the names of the products in the `green` category.',
			accept: ["SELECT name FROM products WHERE category = 'green'", "select name from products where category = 'green'"],
			why: 'WHERE keeps the 3 rows for which `category = \'green\'` is true. Text values go in single quotes; double quotes would make `"green"` a column name, and PostgreSQL would answer `column "green" does not exist`.'
		},
		{
			prompt: 'Show the name and price of every product, most expensive first.',
			accept: ['SELECT name, price FROM products ORDER BY price DESC', 'select name, price from products order by price desc'],
			why: '`ORDER BY price` sorts the result, and `DESC` puts the largest value first. Without `DESC` the sort is ascending, which is the default.'
		},
		{
			prompt: 'Show the name and price of the 3 cheapest products.',
			accept: [
				'SELECT name, price FROM products ORDER BY price LIMIT 3',
				'select name, price from products order by price limit 3',
				'SELECT name, price FROM products ORDER BY price ASC LIMIT 3',
				'select name, price from products order by price asc limit 3',
				'SELECT name, price FROM products ORDER BY price FETCH FIRST 3 ROWS ONLY',
				'select name, price from products order by price fetch first 3 rows only'
			],
			why: '`ORDER BY price` puts the cheapest first, then `LIMIT 3` keeps the first 3 rows: Assam, Earl Grey and Earl Grey Cream. Without the ORDER BY, LIMIT would return 3 rows in no promised order.'
		},
		{
			prompt: 'List each category once.',
			accept: ['SELECT DISTINCT category FROM products', 'select distinct category from products'],
			why: '`DISTINCT` goes right after SELECT and removes duplicate rows from the result. The 10 products give 4 rows: `green`, `black`, `oolong` and `teaware`.'
		},
		{
			prompt: 'Show the names that start with `Earl`. The match is case-sensitive.',
			accept: ["SELECT name FROM products WHERE name LIKE 'Earl%'", "select name from products where name like 'Earl%'"],
			why: 'In `\'Earl%\'`, `%` matches any characters after `Earl`, including none. LIKE must match the whole string, so `\'Earl\'` alone would find no row here.'
		},
		{
			prompt: 'Show the names that contain `tea` anywhere, in any case.',
			accept: ["SELECT name FROM products WHERE name ILIKE '%tea%'", "select name from products where name ilike '%tea%'"],
			why: 'A `%` on each side lets `tea` sit anywhere in the name. `ILIKE` is the case-insensitive LIKE of PostgreSQL, so it finds `Glass Teapot`, which LIKE would miss because of the capital T.'
		},
		{
			prompt: 'Show the name and category of the products in the `green` or the `oolong` category. Use IN.',
			accept: [
				"SELECT name, category FROM products WHERE category IN ('green', 'oolong')",
				"select name, category from products where category in ('green', 'oolong')",
				"SELECT name, category FROM products WHERE category IN ('oolong', 'green')",
				"select name, category from products where category in ('oolong', 'green')",
				"SELECT name, category FROM products WHERE category IN ('green','oolong')",
				"select name, category from products where category in ('green','oolong')"
			],
			why: '`category IN (\'green\', \'oolong\')` is true when the category equals any value in the list. It means the same as `category = \'green\' OR category = \'oolong\'` and returns 5 rows.'
		},
		{
			prompt: 'Show the name and price of the products that cost from 10 to 20, both included. Use BETWEEN.',
			accept: [
				'SELECT name, price FROM products WHERE price BETWEEN 10 AND 20',
				'select name, price from products where price between 10 and 20',
				'SELECT name, price FROM products WHERE price BETWEEN 10.00 AND 20.00',
				'select name, price from products where price between 10.00 and 20.00'
			],
			why: '`BETWEEN 10 AND 20` means `price >= 10 AND price <= 20`: both ends count. It returns Sencha, Jasmine Pearls, Earl Grey Cream and Bamboo Whisk.'
		},
		{
			prompt: 'Show the name and price of the green teas that are in stock (`stock > 0`), cheapest first.',
			accept: [
				"SELECT name, price FROM products WHERE category = 'green' AND stock > 0 ORDER BY price",
				"select name, price from products where category = 'green' and stock > 0 order by price",
				"SELECT name, price FROM products WHERE stock > 0 AND category = 'green' ORDER BY price",
				"select name, price from products where stock > 0 and category = 'green' order by price",
				"SELECT name, price FROM products WHERE category = 'green' AND stock > 0 ORDER BY price ASC",
				"select name, price from products where category = 'green' and stock > 0 order by price asc"
			],
			why: '`AND` keeps a row only when both conditions are true, so Gyokuro (stock 0) drops out. ORDER BY comes after WHERE and sorts the 2 rows left: Sencha, then Jasmine Pearls.'
		},
		{
			prompt: 'Show page 2 of the product names in alphabetical order, 5 names per page.',
			accept: [
				'SELECT name FROM products ORDER BY name LIMIT 5 OFFSET 5',
				'select name from products order by name limit 5 offset 5',
				'SELECT name FROM products ORDER BY name OFFSET 5 LIMIT 5',
				'select name from products order by name offset 5 limit 5',
				'SELECT name FROM products ORDER BY name OFFSET 5 ROWS FETCH NEXT 5 ROWS ONLY',
				'select name from products order by name offset 5 rows fetch next 5 rows only'
			],
			why: '`OFFSET 5` skips the 5 names of page 1, then `LIMIT 5` returns the next 5, from Glass Teapot to Tie Guan Yin. The skipped rows are still computed by the server, so a large OFFSET costs time.'
		}
	],
	quiz: [],
	recall: {
		q: 'You want the 3 cheapest products. Why is `SELECT name FROM products LIMIT 3` not enough?',
		a: 'Without `ORDER BY price`, PostgreSQL returns rows in an unspecified order, so LIMIT 3 keeps 3 rows in no promised order. You need `ORDER BY price LIMIT 3`.'
	},
	sources: [
		{ title: 'PostgreSQL docs, Lexical Structure', url: 'https://www.postgresql.org/docs/current/sql-syntax-lexical.html' },
		{ title: 'PostgreSQL docs, Select Lists', url: 'https://www.postgresql.org/docs/current/queries-select-lists.html' },
		{ title: 'PostgreSQL docs, Sorting Rows (ORDER BY)', url: 'https://www.postgresql.org/docs/current/queries-order.html' },
		{ title: 'PostgreSQL docs, LIMIT and OFFSET', url: 'https://www.postgresql.org/docs/current/queries-limit.html' },
		{ title: 'PostgreSQL docs, Comparison Functions and Operators', url: 'https://www.postgresql.org/docs/current/functions-comparison.html' },
		{ title: 'PostgreSQL docs, Pattern Matching', url: 'https://www.postgresql.org/docs/current/functions-matching.html' },
		{ title: 'PostgreSQL docs, Row and Array Comparisons', url: 'https://www.postgresql.org/docs/current/functions-comparisons.html' }
	]
};
