/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'sql-windows',
	part: 'SQL',
	title: 'Window functions',
	minutes: 10,
	hook: [
		'The sales lead wants a weekly report: each order with its rank, the running total of its region, and the change from the order before. A `GROUP BY region` gives one row per region and loses the orders. A window function computes over a group of rows and still returns every order.',
		'The database is PostgreSQL. The table is `orders (id int PRIMARY KEY, region text, day date, amount int)` with 6 rows. In `north`: id 1 on `2026-10-01` for 100, id 2 on `2026-10-02` for 250, id 3 on `2026-10-03` for 250. In `south`: id 4 on `2026-10-01` for 80, id 5 on `2026-10-02` for 300, id 6 on `2026-10-03` for 120.'
	],
	terms: [
		{ term: 'OVER', def: 'The clause right after a function that makes it a window function. Inside it, PARTITION BY and ORDER BY say which rows the function sees and in what order.' },
		{ term: 'partition', def: 'The group of rows that share the same PARTITION BY value, here one per region. Without PARTITION BY, the whole result is one partition.' },
		{ term: 'peer', def: 'A row with the same ORDER BY value as the current row, such as ids 2 and 3 with 250 each.' }
	],
	reps: [
		{
			prompt: 'Number the `north` orders by `day`, oldest first. Return `id` and the number as `n`.',
			accept: [
				"SELECT id, ROW_NUMBER() OVER (ORDER BY day) AS n FROM orders WHERE region = 'north'",
				"SELECT id, row_number() OVER (ORDER BY day) AS n FROM orders WHERE region = 'north'",
				"select id, row_number() over (order by day) as n from orders where region = 'north'",
				"SELECT id, ROW_NUMBER() OVER (ORDER BY day) n FROM orders WHERE region = 'north'",
				"select id, row_number() over (order by day) n from orders where region = 'north'",
				"SELECT id, ROW_NUMBER() OVER(ORDER BY day) AS n FROM orders WHERE region = 'north'",
				"select id, row_number() over(order by day) as n from orders where region = 'north'"
			],
			why: '`ROW_NUMBER()` counts rows from 1 in the order that `OVER (ORDER BY day)` gives. The `WHERE` runs first, so the function sees only the 3 `north` rows and numbers them 1 to 3.'
		},
		{
			prompt: 'Number the orders by `day` inside each region, starting again at 1 for each region. Return `id`, `region` and the number as `n`.',
			accept: [
				'SELECT id, region, ROW_NUMBER() OVER (PARTITION BY region ORDER BY day) AS n FROM orders',
				'SELECT id, region, row_number() OVER (PARTITION BY region ORDER BY day) AS n FROM orders',
				'select id, region, row_number() over (partition by region order by day) as n from orders',
				'SELECT id, region, ROW_NUMBER() OVER (PARTITION BY region ORDER BY day) n FROM orders',
				'select id, region, row_number() over (partition by region order by day) n from orders',
				'SELECT id, region, ROW_NUMBER() OVER(PARTITION BY region ORDER BY day) AS n FROM orders',
				'select id, region, row_number() over(partition by region order by day) as n from orders'
			],
			why: '`PARTITION BY region` splits the rows into a `north` partition and a `south` partition. The numbering restarts in each one, so ids 1 and 4 both get 1.'
		},
		{
			prompt: 'Rank all orders by `amount`, largest first, so that equal amounts share a rank. Return `id`, `amount` and the rank as `r`.',
			accept: [
				'SELECT id, amount, RANK() OVER (ORDER BY amount DESC) AS r FROM orders',
				'SELECT id, amount, rank() OVER (ORDER BY amount DESC) AS r FROM orders',
				'select id, amount, rank() over (order by amount desc) as r from orders',
				'SELECT id, amount, RANK() OVER (ORDER BY amount DESC) r FROM orders',
				'select id, amount, rank() over (order by amount desc) r from orders',
				'SELECT id, amount, RANK() OVER(ORDER BY amount DESC) AS r FROM orders',
				'select id, amount, rank() over(order by amount desc) as r from orders'
			],
			why: 'Ids 2 and 3 are peers at 250 and both get rank 2. `RANK()` then skips 3, so id 6 at 120 gets rank 4. `ROW_NUMBER()` would give the two 250 orders 2 and 3, in no fixed order.'
		},
		{
			prompt: 'Rank the orders by `amount`, largest first, with no gap after a tie: 300 is 1, 250 is 2, 120 is 3. Return `id`, `amount` and the rank as `r`.',
			accept: [
				'SELECT id, amount, DENSE_RANK() OVER (ORDER BY amount DESC) AS r FROM orders',
				'SELECT id, amount, dense_rank() OVER (ORDER BY amount DESC) AS r FROM orders',
				'select id, amount, dense_rank() over (order by amount desc) as r from orders',
				'SELECT id, amount, DENSE_RANK() OVER (ORDER BY amount DESC) r FROM orders',
				'select id, amount, dense_rank() over (order by amount desc) r from orders',
				'SELECT id, amount, DENSE_RANK() OVER(ORDER BY amount DESC) AS r FROM orders',
				'select id, amount, dense_rank() over(order by amount desc) as r from orders'
			],
			why: '`DENSE_RANK()` counts groups of peers, so the rank after the two 250 orders is 3. The smallest order, id 4 at 80, gets 5 here and 6 with `RANK()`.'
		},
		{
			prompt: 'Show the running total of `amount` inside each region, by `day`. Return `id`, `region`, `day` and the total as `running`.',
			accept: [
				'SELECT id, region, day, SUM(amount) OVER (PARTITION BY region ORDER BY day) AS running FROM orders',
				'SELECT id, region, day, sum(amount) OVER (PARTITION BY region ORDER BY day) AS running FROM orders',
				'select id, region, day, sum(amount) over (partition by region order by day) as running from orders',
				'SELECT id, region, day, SUM(amount) OVER (PARTITION BY region ORDER BY day) running FROM orders',
				'select id, region, day, sum(amount) over (partition by region order by day) running from orders',
				'SELECT id, region, day, SUM(amount) OVER(PARTITION BY region ORDER BY day) AS running FROM orders',
				'select id, region, day, sum(amount) over(partition by region order by day) as running from orders'
			],
			why: 'With an `ORDER BY` inside `OVER`, `SUM` adds the rows from the start of the partition up to the current row and its peers. `north` reads 100, 350, 600 and `south` reads 80, 380, 500.'
		},
		{
			prompt: 'Next to each order, show the total `amount` of its region, keeping one row per order. Return `id`, `region` and the total as `region_total`.',
			accept: [
				'SELECT id, region, SUM(amount) OVER (PARTITION BY region) AS region_total FROM orders',
				'SELECT id, region, sum(amount) OVER (PARTITION BY region) AS region_total FROM orders',
				'select id, region, sum(amount) over (partition by region) as region_total from orders',
				'SELECT id, region, SUM(amount) OVER (PARTITION BY region) region_total FROM orders',
				'select id, region, sum(amount) over (partition by region) region_total from orders',
				'SELECT id, region, SUM(amount) OVER(PARTITION BY region) AS region_total FROM orders',
				'select id, region, sum(amount) over(partition by region) as region_total from orders'
			],
			why: 'With no `ORDER BY` inside `OVER`, `SUM` adds every row of the partition. All 3 `north` rows show 600 and all 3 `south` rows show 500, and the query still returns 6 rows.'
		},
		{
			prompt: 'For each order, show the amount of the order before it in the same region, by `day`. Return `id`, `amount` and that amount as `prev`.',
			accept: [
				'SELECT id, amount, LAG(amount) OVER (PARTITION BY region ORDER BY day) AS prev FROM orders',
				'SELECT id, amount, lag(amount) OVER (PARTITION BY region ORDER BY day) AS prev FROM orders',
				'select id, amount, lag(amount) over (partition by region order by day) as prev from orders',
				'SELECT id, amount, LAG(amount) OVER (PARTITION BY region ORDER BY day) prev FROM orders',
				'select id, amount, lag(amount) over (partition by region order by day) prev from orders',
				'SELECT id, amount, LAG(amount) OVER(PARTITION BY region ORDER BY day) AS prev FROM orders',
				'select id, amount, lag(amount) over(partition by region order by day) as prev from orders'
			],
			why: '`LAG(amount)` reads `amount` from the row 1 position earlier in the partition. The first order of each region has no row before it, so ids 1 and 4 get NULL.'
		},
		{
			prompt: 'Show how much each order went up or down from the order before it in the same region, by `day`. Return `id` and the change as `diff`.',
			accept: [
				'SELECT id, amount - LAG(amount) OVER (PARTITION BY region ORDER BY day) AS diff FROM orders',
				'SELECT id, amount - lag(amount) OVER (PARTITION BY region ORDER BY day) AS diff FROM orders',
				'select id, amount - lag(amount) over (partition by region order by day) as diff from orders',
				'SELECT id, amount - LAG(amount) OVER (PARTITION BY region ORDER BY day) diff FROM orders',
				'select id, amount - lag(amount) over (partition by region order by day) diff from orders',
				'SELECT id, amount - LAG(amount) OVER(PARTITION BY region ORDER BY day) AS diff FROM orders',
				'select id, amount - lag(amount) over(partition by region order by day) as diff from orders'
			],
			why: 'The window function goes inside an ordinary expression: `amount - LAG(...)`. Id 5 gives 300 - 80 = 220 and id 6 gives 120 - 300 = -180. Ids 1 and 4 give NULL, because a number minus NULL is NULL.'
		},
		{
			prompt: 'Return the `id` and `amount` of the 2 largest orders in each region. Number them with ROW_NUMBER as `n` in a subquery named `t`.',
			accept: [
				'SELECT id, amount FROM (SELECT id, amount, ROW_NUMBER() OVER (PARTITION BY region ORDER BY amount DESC) AS n FROM orders) AS t WHERE n <= 2',
				'SELECT id, amount FROM (SELECT id, amount, row_number() OVER (PARTITION BY region ORDER BY amount DESC) AS n FROM orders) AS t WHERE n <= 2',
				'select id, amount from (select id, amount, row_number() over (partition by region order by amount desc) as n from orders) as t where n <= 2',
				'SELECT id, amount FROM (SELECT id, amount, ROW_NUMBER() OVER (PARTITION BY region ORDER BY amount DESC) AS n FROM orders) t WHERE n <= 2',
				'select id, amount from (select id, amount, row_number() over (partition by region order by amount desc) as n from orders) t where n <= 2',
				'SELECT id, amount FROM (SELECT id, amount, ROW_NUMBER() OVER (PARTITION BY region ORDER BY amount DESC) n FROM orders) t WHERE n <= 2',
				'SELECT id, amount FROM (SELECT id, amount, ROW_NUMBER() OVER(PARTITION BY region ORDER BY amount DESC) AS n FROM orders) AS t WHERE n <= 2',
				'SELECT id, amount FROM (SELECT id, amount, ROW_NUMBER() OVER (PARTITION BY region ORDER BY amount DESC) AS n FROM orders) AS t WHERE n < 3',
				'select id, amount from (select id, amount, row_number() over (partition by region order by amount desc) as n from orders) as t where n < 3'
			],
			why: 'PostgreSQL forbids window functions in `WHERE`, because they run after it. The subquery `t` computes `n` first, and the outer `WHERE n <= 2` keeps ids 2 and 3 in `north` and ids 5 and 6 in `south`.'
		}
	],
	quiz: [],
	recall: {
		q: 'Why does `SUM(amount) OVER (PARTITION BY region ORDER BY day)` give a running total, while `SUM(amount) OVER (PARTITION BY region)` gives the region total?',
		a: 'With ORDER BY, `SUM` adds the rows from the start of the partition up to the current row and its peers. Without ORDER BY, `SUM` adds every row of the partition: 600 for every `north` row.'
	},
	sources: [
		{ title: 'PostgreSQL tutorial: Window functions', url: 'https://www.postgresql.org/docs/current/tutorial-window.html' },
		{ title: 'PostgreSQL: Window functions reference', url: 'https://www.postgresql.org/docs/current/functions-window.html' }
	]
};
