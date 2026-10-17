/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'sql-changes',
	part: 'SQL',
	title: 'Changing data',
	minutes: 10,
	hook: [
		'You look after the database of a small online shop. Checkout lowers the stock as orders come in, and a supplier sends a product file every night. Today the import failed halfway, so you fix the rows by hand in `psql`. Each statement must touch only the rows you name.',
		'The database is PostgreSQL. The table is `products (sku text PRIMARY KEY, price numeric(8,2) NOT NULL, stock int NOT NULL DEFAULT 0)`. It holds 3 rows: `MUG-01` at 12.00 with stock 40, `TEE-02` at 20.00 with stock 15, and `CAP-03` at 15.00 with stock 0. Each rep starts from these 3 rows.'
	],
	terms: [
		{ term: 'RETURNING', def: 'A clause at the end of INSERT, UPDATE or DELETE that sends back columns of the rows the statement changed.' },
		{ term: 'conflict target', def: 'The column list after ON CONFLICT, such as `(sku)`. PostgreSQL uses it to pick the unique index that decides what counts as a duplicate.' },
		{ term: 'EXCLUDED', def: 'A special table name inside ON CONFLICT DO UPDATE. It holds the row that the INSERT tried to add.' }
	],
	reps: [
		{
			prompt: 'Add the product `BAG-04` with price `18.00` and stock `25`. Name the columns.',
			accept: [
				"INSERT INTO products (sku, price, stock) VALUES ('BAG-04', 18.00, 25)",
				"insert into products (sku, price, stock) values ('BAG-04', 18.00, 25)",
				"INSERT INTO products(sku, price, stock) VALUES ('BAG-04', 18.00, 25)",
				"insert into products(sku, price, stock) values ('BAG-04', 18.00, 25)",
				"INSERT INTO products (sku, price, stock) VALUES('BAG-04', 18.00, 25)",
				"insert into products (sku, price, stock) values('BAG-04', 18.00, 25)",
				"INSERT INTO products (sku, price, stock) VALUES ('BAG-04', 18, 25)",
				"insert into products (sku, price, stock) values ('BAG-04', 18, 25)"
			],
			why: '`(sku, price, stock)` lists the columns, and `VALUES` gives them values from left to right. Text goes in single quotes, numbers do not.'
		},
		{
			prompt: 'Add `KEY-05` (price `5.00`, stock `100`) and `PIN-06` (price `3.50`, stock `200`) in one statement.',
			accept: [
				"INSERT INTO products (sku, price, stock) VALUES ('KEY-05', 5.00, 100), ('PIN-06', 3.50, 200)",
				"insert into products (sku, price, stock) values ('KEY-05', 5.00, 100), ('PIN-06', 3.50, 200)",
				"INSERT INTO products(sku, price, stock) VALUES ('KEY-05', 5.00, 100), ('PIN-06', 3.50, 200)",
				"insert into products(sku, price, stock) values ('KEY-05', 5.00, 100), ('PIN-06', 3.50, 200)",
				"INSERT INTO products (sku, price, stock) VALUES ('KEY-05', 5, 100), ('PIN-06', 3.50, 200)",
				"insert into products (sku, price, stock) values ('KEY-05', 5, 100), ('PIN-06', 3.50, 200)"
			],
			why: '`VALUES` takes several rows, each in its own parentheses, separated by commas. Both rows go in with one statement and one round trip to the server.'
		},
		{
			prompt: 'Add `HAT-07` at price `22.00` and let `stock` take its default value.',
			accept: [
				"INSERT INTO products (sku, price) VALUES ('HAT-07', 22.00)",
				"insert into products (sku, price) values ('HAT-07', 22.00)",
				"INSERT INTO products(sku, price) VALUES ('HAT-07', 22.00)",
				"insert into products(sku, price) values ('HAT-07', 22.00)",
				"INSERT INTO products (sku, price, stock) VALUES ('HAT-07', 22.00, DEFAULT)",
				"insert into products (sku, price, stock) values ('HAT-07', 22.00, default)",
				"INSERT INTO products (sku, price) VALUES ('HAT-07', 22)",
				"insert into products (sku, price) values ('HAT-07', 22)"
			],
			why: '`stock` is not in the column list, so PostgreSQL fills it with its declared default, `0`. A column with no declared default gets NULL. The keyword `DEFAULT` in `VALUES` does the same for a column you do list.'
		},
		{
			prompt: 'Change the price of `MUG-01` to `14.00`.',
			accept: [
				"UPDATE products SET price = 14.00 WHERE sku = 'MUG-01'",
				"update products set price = 14.00 where sku = 'MUG-01'",
				"UPDATE products SET price=14.00 WHERE sku='MUG-01'",
				"update products set price=14.00 where sku='MUG-01'",
				"UPDATE products SET price = 14 WHERE sku = 'MUG-01'",
				"update products set price = 14 where sku = 'MUG-01'"
			],
			why: '`SET price = 14.00` names the column and its new value. `WHERE sku = \'MUG-01\'` limits the change to one row. Without the `WHERE`, all 3 products would cost 14.00.'
		},
		{
			prompt: 'Someone just bought one `TEE-02`. Lower its stock by 1.',
			accept: [
				"UPDATE products SET stock = stock - 1 WHERE sku = 'TEE-02'",
				"update products set stock = stock - 1 where sku = 'TEE-02'",
				"UPDATE products SET stock=stock-1 WHERE sku='TEE-02'",
				"update products set stock=stock-1 where sku='TEE-02'",
				"UPDATE products SET stock = stock-1 WHERE sku = 'TEE-02'",
				"update products set stock = stock-1 where sku = 'TEE-02'"
			],
			why: 'On the right of `=`, `stock` is the value the row has before the update, 15. The row ends with 14, and your app never had to read the old value first.'
		},
		{
			prompt: 'Sell one `TEE-02` and get its new stock back from the same statement. Return only the `stock` column.',
			accept: [
				"UPDATE products SET stock = stock - 1 WHERE sku = 'TEE-02' RETURNING stock",
				"update products set stock = stock - 1 where sku = 'TEE-02' returning stock",
				"UPDATE products SET stock=stock-1 WHERE sku='TEE-02' RETURNING stock",
				"update products set stock=stock-1 where sku='TEE-02' returning stock",
				"UPDATE products SET stock = stock-1 WHERE sku = 'TEE-02' RETURNING stock",
				"update products set stock = stock-1 where sku = 'TEE-02' returning stock"
			],
			why: '`RETURNING stock` sends back one row with the value 14. In an UPDATE, RETURNING shows the row after the change. You save the extra `SELECT` you would otherwise run.'
		},
		{
			prompt: 'Delete every product whose stock is `0`.',
			accept: [
				'DELETE FROM products WHERE stock = 0',
				'delete from products where stock = 0',
				'DELETE FROM products WHERE stock=0',
				'delete from products where stock=0'
			],
			why: '`DELETE FROM products` removes rows, and `WHERE stock = 0` picks `CAP-03` only. The docs: "If the WHERE clause is absent, the effect is to delete all rows in the table."'
		},
		{
			prompt: 'The nightly file sends `MUG-01` at `12.00` with stock `40` again. Insert it, and do nothing if that `sku` already exists.',
			accept: [
				"INSERT INTO products (sku, price, stock) VALUES ('MUG-01', 12.00, 40) ON CONFLICT (sku) DO NOTHING",
				"insert into products (sku, price, stock) values ('MUG-01', 12.00, 40) on conflict (sku) do nothing",
				"INSERT INTO products (sku, price, stock) VALUES ('MUG-01', 12.00, 40) ON CONFLICT DO NOTHING",
				"insert into products (sku, price, stock) values ('MUG-01', 12.00, 40) on conflict do nothing",
				"INSERT INTO products (sku, price, stock) VALUES ('MUG-01', 12.00, 40) ON CONFLICT(sku) DO NOTHING",
				"insert into products (sku, price, stock) values ('MUG-01', 12.00, 40) on conflict(sku) do nothing",
				"INSERT INTO products(sku, price, stock) VALUES ('MUG-01', 12.00, 40) ON CONFLICT (sku) DO NOTHING",
				"insert into products(sku, price, stock) values ('MUG-01', 12.00, 40) on conflict (sku) do nothing"
			],
			why: 'A plain INSERT here fails with the error `duplicate key value violates unique constraint`. `ON CONFLICT (sku) DO NOTHING` skips the row and inserts 0 rows. With DO NOTHING the conflict target `(sku)` is optional.'
		},
		{
			prompt: 'Insert `MUG-01` at `12.00` with stock `10`. If `MUG-01` already exists, add those 10 to its current stock instead.',
			accept: [
				"INSERT INTO products (sku, price, stock) VALUES ('MUG-01', 12.00, 10) ON CONFLICT (sku) DO UPDATE SET stock = products.stock + EXCLUDED.stock",
				"insert into products (sku, price, stock) values ('MUG-01', 12.00, 10) on conflict (sku) do update set stock = products.stock + excluded.stock",
				"INSERT INTO products (sku, price, stock) VALUES ('MUG-01', 12.00, 10) ON CONFLICT (sku) DO UPDATE SET stock = products.stock + excluded.stock",
				"INSERT INTO products (sku, price, stock) VALUES ('MUG-01', 12.00, 10) ON CONFLICT(sku) DO UPDATE SET stock = products.stock + EXCLUDED.stock",
				"insert into products (sku, price, stock) values ('MUG-01', 12.00, 10) on conflict(sku) do update set stock = products.stock + excluded.stock",
				"INSERT INTO products (sku, price, stock) VALUES ('MUG-01', 12.00, 10) ON CONFLICT (sku) DO UPDATE SET stock = EXCLUDED.stock + products.stock",
				"insert into products (sku, price, stock) values ('MUG-01', 12.00, 10) on conflict (sku) do update set stock = excluded.stock + products.stock"
			],
			why: '`products.stock` is the row already stored (40) and `EXCLUDED.stock` is the row you tried to insert (10), so `MUG-01` ends with a stock of 50. A bare `stock` fails with the error `column reference "stock" is ambiguous`. DO UPDATE requires the conflict target `(sku)`.'
		}
	],
	quiz: [],
	recall: {
		q: 'In `ON CONFLICT (sku) DO UPDATE SET ...`, how do you name the value that the INSERT tried to add?',
		a: 'Through the special table `EXCLUDED`, as in `EXCLUDED.stock`. The row already stored is `products.stock`, named after the table.'
	},
	sources: [
		{ title: 'PostgreSQL: INSERT', url: 'https://www.postgresql.org/docs/current/sql-insert.html' },
		{ title: 'PostgreSQL: UPDATE', url: 'https://www.postgresql.org/docs/current/sql-update.html' },
		{ title: 'PostgreSQL: DELETE', url: 'https://www.postgresql.org/docs/current/sql-delete.html' },
		{ title: 'PostgreSQL: Returning data from modified rows', url: 'https://www.postgresql.org/docs/current/dml-returning.html' }
	]
};
