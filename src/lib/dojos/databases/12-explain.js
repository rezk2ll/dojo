const GL = 'https://github.com/gitlabhq/gitlabhq/blob/28f70ed3725bbc2bb6cbfa635ab6dd9bfa57af9a';
const DOC = `${GL}/doc/development/database/understanding_explain_plans.md?plain=1`;
const PG = 'https://github.com/postgres/postgres/blob/92d47d544bf64274b6a7aa8775f7b35bcf71f339/doc/src/sgml';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'explain',
	part: 'Inside the engine',
	title: 'Reading EXPLAIN',
	minutes: 10,
	hook: [
		'A page that counts users takes 1.2 seconds. Someone adds an index. Now it takes 300 ms. Better, but still slow, and nobody can say why.',
		'Guessing is the usual next step: another index, a bigger server, a cache. **`EXPLAIN` prints the plan PostgreSQL chose**: which scans, in which order, how many rows it expected, and with `ANALYZE`, how many it really got and how many pages it touched.',
		'The plans below come from GitLab\'s own database guide: one count on a `users` table of about 2.5 million rows, before and after an index.'
	],
	terms: [
		{ term: 'Plan node', def: 'One step of the plan: a scan, a join, a sort, an aggregate. Nodes form a tree. The innermost ones run first and pass rows up to their parent.' },
		{ term: 'EXPLAIN ANALYZE', def: 'Runs the query for real and prints, next to each estimate, the actual time in milliseconds, actual rows and loops. It really executes: an UPDATE really updates.' },
		{ term: 'loops', def: 'How many times the node ran. Actual time and rows are averages per loop: multiply by loops to get the total.' },
		{ term: 'Buffers', def: 'Pages of 8 kB the node touched: `hit` in PostgreSQL\'s cache, `read` from the OS or disk. Included by default with ANALYZE since PostgreSQL 18.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['scan["Seq Scan on users"] -->|"rows go up"| agg["Aggregate: count(*)"]'],
				highlight: ['scan', 'agg'],
				note: 'You read a plan from the inside out: the most indented node runs first. Here a sequential scan reads `users` and hands its rows to an aggregate that counts them. GitLab\'s guide compares a plan to "nested function calls, returning their results as they unwind".'
			},
			{
				add: ['est["Estimate: cost=0.00..844969.99 rows=56087"] -.-> scan'],
				highlight: ['est'],
				note: 'The estimate gives the cost in planner units, where reading one page in order counts as 1.0. `rows=56087` is how many rows it expected the scan to **emit** after the filter. Plain `EXPLAIN` stops here: it does not run anything.'
			},
			{
				add: ['act["Actual: rows=51833 loops=1, 1265 ms"] -.-> scan'],
				highlight: ['act'],
				note: '`ANALYZE` runs the query and adds the actual numbers. 51,833 rows against 56,087 expected: a good estimate. The PostgreSQL docs say the thing to look for first "is whether the estimated row counts are reasonably close to reality". When they are far apart, the planner has chosen a plan for the wrong number of rows (day 13).'
			},
			{
				add: ['filt["Rows Removed by Filter: 2487813"] -.-> scan'],
				highlight: ['filt'],
				note: 'The filter line counts the rows the scan read and dropped. To emit 51,833 rows, the scan read about 2.5 million and threw 98% of them away. A large "Rows Removed" under a scan that returns few rows is the classic sign that an index could help.'
			},
			{
				add: ['buf["Buffers: shared hit=202662, about 1.6 GB of pages"] -.-> agg'],
				highlight: ['buf'],
				note: 'Each buffer is an 8 kB page, so 202,662 of them is about 1.6 GB touched to count 51,833 rows. Timing depends on what is cached; buffers do not. A parent\'s buffers include those of its children.'
			}
		]
	},
	example: {
		title: 'doc/development/database/understanding_explain_plans.md: one query, two plans',
		repo: 'gitlabhq/gitlabhq',
		url: `${DOC}#L312-L393`,
		lang: 'sql',
		code: `EXPLAIN (ANALYZE, BUFFERS)
SELECT COUNT(*)
FROM users
WHERE twitter != '';
…
Aggregate  (cost=845110.21..845110.22 rows=1 width=8) (actual time=1271.157..1271.158 rows=1 loops=1)
  Buffers: shared hit=202662
  ->  Seq Scan on users  (cost=0.00..844969.99 rows=56087 width=0) (actual time=0.019..1265.883 rows=51833 loops=1)
        Filter: ((twitter)::text <> ''::text)
        Rows Removed by Filter: 2487813
        Buffers: shared hit=202662
Planning time: 0.390 ms
Execution time: 1271.180 ms
…
CREATE INDEX CONCURRENTLY twitter_test ON users (twitter);
…
Aggregate  (cost=61002.82..61002.83 rows=1 width=8) (actual time=297.311..297.312 rows=1 loops=1)
  Buffers: shared hit=51854 dirtied=19
  ->  Index Only Scan using twitter_test on users  (cost=0.43..60873.13 rows=51877 width=0) (actual time=279.184..293.532 rows=51833 loops=1)
        Filter: ((twitter)::text <> ''::text)
        Rows Removed by Filter: 2487830
        Heap Fetches: 26037
        Buffers: shared hit=51854 dirtied=19
Planning time: 0.191 ms
Execution time: 297.334 ms`,
		notes: [
			'Line 19 reads the index instead of the table, yet line 21 still shows about 2.5 million `Rows Removed by Filter`. The index holds every value of `twitter`, empty strings included, so the scan still walks all of them and drops the empty ones. GitLab fixes it with a partial index, which is day 14.',
			'Line 22, `Heap Fetches: 26037`, counts the rows the index-only scan still had to fetch from the table. The guide notes that [in certain cases](' + DOC + '#L240-L244) "an index only scan might still fetch data from the table".',
			'Lines 7 and 18 give the buffers: 202,662 before the index, 51,854 after. GitLab\'s advice: timing ["can be too volatile to be used for comparison"](' + DOC + '#L461-L467), so "look at the number of buffers used (read and hit), and work on reducing these numbers". The drop in buffers holds whatever the cache contained.',
			'The same guide counts projects with `visibility_level IN (0, 20)`, which is [98% of the table](' + DOC + '#L540-L542): "there isn\'t really much we can do to improve this query, other than _not_ running it at all". The planner reads the whole table there because it has to return almost all of it, so the sequential scan is the right plan.',
			'The `EXPLAIN` reference warns that with `ANALYZE` ["the statement is actually executed"](' + PG + '/ref/explain.sgml#L90-L104) and its side effects happen. Wrap an `EXPLAIN ANALYZE` of an UPDATE or DELETE in `BEGIN` and `ROLLBACK`.'
		]
	},
	tradeoff: {
		gain: [
			'You see the plan the database chose instead of guessing: which index, which join, where the rows are thrown away.',
			'Estimated next to actual rows shows whether the planner was misled: 56,087 expected against 51,833 actual is a good estimate.',
			'Buffers give a number you can compare between two runs, two indexes or two servers, and it does not change with what the cache holds.'
		],
		cost: [
			'`EXPLAIN ANALYZE` executes the query: a slow query is still slow, and a write still writes unless you roll it back.',
			'The docs warn that "the measurement overhead added by EXPLAIN ANALYZE can be significant" on machines with slow clock calls. Use `TIMING OFF` when you only need rows and buffers.',
			'A plan depends on the data and the statistics. The docs warn that "results on a toy-sized table cannot be assumed to apply to large tables". GitLab engineers get their plans from a clone of the production database for that reason.'
		]
	},
	task: {
		prompt: 'In `psql`, create `orders(id bigint generated always as identity primary key, customer_id int not null, status text not null, total numeric not null)` with 1 million rows: `customer_id` random from 0 to 20,000, `status` `\'paid\'` 95% of the time and `\'refunded\'` otherwise. Run `VACUUM ANALYZE orders`. Then `EXPLAIN ANALYZE SELECT count(*) FROM orders WHERE customer_id = 42`. Read the plan. Add an index on `customer_id` and read it again. Last, index `status` and explain `sum(total)` for `\'paid\'` and for `\'refunded\'`.',
		hint: 'Look for `loops` on the scan node before you read its `rows`. Compare the `Buffers` line of the top node across the plans.',
		answer: [
			'Without an index (PostgreSQL 18, 2 workers): `Parallel Seq Scan on orders ... rows=16.33 loops=3`, `Rows Removed by Filter: 333317`, `Buffers: shared hit=6434`. The rows are averages per loop: 16.33 × 3 is about 49 rows found, out of a million read. The 6,434 buffers cover the whole table.',
			'With the index: `Index Only Scan using orders_customer_id_idx ... rows=49.00 loops=1`, `Heap Fetches: 0`, `Buffers: shared hit=1 read=3`. From 6,434 pages to 4. Heap fetches are 0 because `VACUUM` has just marked every page all-visible.',
			'`status = \'paid\'` keeps a Parallel Seq Scan even with the index: it matches about 95% of the rows, so reading the table in order is cheaper than jumping through the index for each one.',
			'`status = \'refunded\'` (about 5%) switches to `Index Scan using orders_status_idx`. Same index, same column: the planner chose by the estimated number of rows, which is what day 13 is about.'
		]
	},
	quiz: [
		{
			q: 'A plan shows `Index Scan ... (actual time=0.003..0.003 rows=1 loops=36)`. How many rows did this node return in total?',
			options: [
				'One row, because the rows value is the total for the node',
				'36 rows: rows is a per-loop average, so 1 times 36 loops',
				'0.003 rows per millisecond, which is too few to count',
				'It cannot be known without the BUFFERS option enabled'
			],
			answer: 1,
			why: 'For a node that runs several times, the actual time and rows are averages per execution. Multiply by `loops` to get the total. This is typical for the inner side of a nested loop, which runs once per outer row.'
		},
		{
			q: 'A query is slow. The plan has `Seq Scan ... rows=5746969`, `Rows Removed by Filter: 65677`. What does that suggest?',
			options: [
				'An index on the filtered column would make it fast, because a sequential scan is always the slow path',
				'The planner made a mistake, because it should never scan a table that has more than a million rows',
				'The query returns almost the whole table, so an index would not help and the scan is the right choice',
				'The table needs VACUUM, because the removed rows are dead rows that the filter had to skip'
			],
			answer: 2,
			why: 'The scan emits 5.7 million rows and drops only 65,677: it returns about 99% of what it reads. An index cannot avoid reading rows you have to return. GitLab\'s guide says the only fix for that query is not running it.'
		},
		{
			q: 'You compare two versions of a query. Version B ran faster, but its plan shows more buffers than version A. What should you trust?',
			options: [
				'The time, because the user only feels milliseconds and buffers are a detail',
				'The buffers, because the time of B may come from a warm cache, not from doing less work',
				'Neither, because EXPLAIN ANALYZE numbers are estimates that change on every run',
				'The cost, because it is the same unit as the time and includes the buffers too'
			],
			answer: 1,
			why: 'Timing moves with the cache state and the load. Buffers count the pages the query had to touch, which is the work itself. Cost is in planner units, not milliseconds, and ANALYZE numbers are measured, not estimated.'
		}
	],
	recall: {
		q: 'A scan node shows `rows=16.33 loops=3`. How many rows did it return, and which number do you compare between two versions of a query?',
		a: 'About 49 rows, because rows is a per-loop average: 16.33 × 3. You compare the buffers (8 kB pages touched), because the time changes with what is cached.'
	},
	sources: [
		{ title: 'PostgreSQL 18 docs, Using EXPLAIN', url: 'https://www.postgresql.org/docs/18/using-explain.html' },
		{ title: 'PostgreSQL 18 docs, EXPLAIN', url: 'https://www.postgresql.org/docs/18/sql-explain.html' },
		{ title: 'GitLab docs, Understanding EXPLAIN plans', url: 'https://docs.gitlab.com/development/database/understanding_explain_plans/' }
	]
};
