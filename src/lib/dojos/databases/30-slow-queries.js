const PG = 'https://github.com/postgres/postgres/blob/26bd08fb5c069fbdf55867adc398cfca0f55d5c8';
const PGSS = `${PG}/contrib/pg_stat_statements/pg_stat_statements.c`;
const AE = `${PG}/contrib/auto_explain/auto_explain.c`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'slow-queries',
	part: 'Keeping it running',
	title: 'Finding slow queries',
	minutes: 10,
	hook: [
		'The dashboard says the database is at 90% CPU. Every page is a little slower, and no single page is broken. **Which query is it?** The slow log shows one 8 second report, and that report is not what fills the CPU.',
		'The culprit takes **3 milliseconds** and runs 40,000 times a minute: two minutes of database time every minute. No slow log catches it, because no single run is slow. You only see it when you add up the time of all its runs.',
		'`pg_stat_statements` adds up every query by its shape. `log_min_duration_statement` and `auto_explain` catch the single slow runs and their plans.'
	],
	terms: [
		{ term: 'pg_stat_statements', def: 'A module shipped with PostgreSQL that counts calls, time, rows and blocks for every statement the server runs, and shows the totals as a view.' },
		{ term: 'Normalization', def: 'Constants in a query are replaced by `$1`, `$2`, so `id = 42` and `id = 43` share one row, keyed by a `queryid` hash.' },
		{ term: 'total_exec_time', def: 'The sum of execution time over all calls. Sort by it to see where the server spends its time; `mean_exec_time` alone hides fast queries that run often.' },
		{ term: 'log_min_duration_statement', def: 'Logs every statement that ran at least this long, with its duration and text. `-1`, the default, logs nothing.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['q1["SELECT * FROM orders WHERE id = 42"] --> norm["Shape: WHERE id = $1"]', 'q2["SELECT * FROM orders WHERE id = 43"] --> norm'],
				highlight: ['norm'],
				note: 'The constants are replaced by a parameter symbol, so both runs get the same `queryid`. The view holds "one row for each distinct combination of database ID, user ID, query ID" and top level or not.'
			},
			{
				add: ['norm -->|"after each run: calls, time, rows, blocks"| pgss[("pg_stat_statements")]'],
				highlight: ['pgss'],
				note: 'When a statement finishes, its counters grow: one more call, its time added to the total, the min, max, mean and standard deviation updated, its rows and blocks added. The module keeps no record of single runs, only these sums.'
			},
			{
				add: ['top["ORDER BY total_exec_time DESC LIMIT 10"] -->|"read"| pgss'],
				highlight: ['top'],
				note: 'The docs\' own example sorts by `total_exec_time`. That puts the 3 ms query with 40,000 calls a minute above the 8 second report that runs once a night. Then read `calls`, `mean_exec_time` and `rows` to see which kind of problem it is.'
			},
			{
				add: ['slow["One run of 900 ms"] -->|"log_min_duration_statement = 250ms"| log["Server log"]'],
				highlight: ['slow', 'log'],
				note: 'A sum cannot tell you that one call took 900 ms with these parameters. With `log_min_duration_statement` at 250ms, "all SQL statements that run 250ms or longer will be logged", with their duration.'
			},
			{
				add: ['ae["auto_explain, log_min_duration = 250ms"] -->|"the plan of that run"| log'],
				highlight: ['ae'],
				note: '`auto_explain` is a module that logs the plan of each statement over its threshold, the same output EXPLAIN gives (day 12). The plan at the moment it was slow is often different from the one you get later in `psql`.'
			}
		]
	},
	example: {
		title: 'contrib/pg_stat_statements/pg_stat_statements.c: every run adds to one entry',
		repo: 'postgres/postgres',
		url: `${PGSS}#L1307-L1442`,
		lang: 'c',
		code: `	/* clear padding */
	memset(&key, 0, sizeof(pgssHashKey));

	key.userid = GetUserId();
	key.dbid = MyDatabaseId;
	key.queryid = queryId;
	key.toplevel = (nesting_level == 0);

	/* Lookup the hash table entry with shared lock. */
	LWLockAcquire(&pgss->lock.lock, LW_SHARED);

	entry = (pgssEntry *) hash_search(pgss_hash, &key, HASH_FIND, NULL);
…
	/* Increment the counts, except when jstate is not NULL */
	if (!jstate)
	{
		Assert(kind == PGSS_PLAN || kind == PGSS_EXEC);

		/*
		 * Grab the spinlock while updating the counters (see comment about
		 * locking rules at the head of the file)
		 */
		SpinLockAcquire(&entry->mutex);

		/* "Unstick" entry if it was previously sticky */
		if (IS_STICKY(entry->counters))
			entry->counters.usage = USAGE_INIT;

		entry->counters.calls[kind] += 1;
		entry->counters.total_time[kind] += total_time;

		if (entry->counters.calls[kind] == 1)
		{
			entry->counters.min_time[kind] = total_time;
			entry->counters.max_time[kind] = total_time;
			entry->counters.mean_time[kind] = total_time;
		}
		else
		{
			/*
			 * Welford's method for accurately computing variance. See
			 * <http://www.johndcook.com/blog/standard_deviation/>
			 */
			double		old_mean = entry->counters.mean_time[kind];

			entry->counters.mean_time[kind] +=
				(total_time - old_mean) / entry->counters.calls[kind];
			entry->counters.sum_var_time[kind] +=
				(total_time - old_mean) * (total_time - entry->counters.mean_time[kind]);

…
		entry->counters.rows += rows;
		entry->counters.shared_blks_hit += bufusage->shared_blks_hit;
		entry->counters.shared_blks_read += bufusage->shared_blks_read;
		entry->counters.shared_blks_dirtied += bufusage->shared_blks_dirtied;
		entry->counters.shared_blks_written += bufusage->shared_blks_written;`,
		notes: [
			'Lines 4 to 7: the hash key is `userid`, `dbid`, `queryid` and `toplevel`. The same query run by two roles is two rows. With no query ID, [`pgss_store` returns](' + PGSS + '#L1291-L1296) and records nothing; `compute_query_id = auto`, the default, turns it on when the module is loaded.',
			'For a new entry, [`generate_normalized_query`](' + PGSS + '#L1335-L1346) swaps the constants for `$1`, `$2`, and the text is appended to a file rather than kept in shared memory. The docs: the rest of the text "is that of the first query that had the particular queryid hash value".',
			'Lines 29 to 48: each call adds to `calls` and `total_time` and moves the mean with Welford\'s method, so `stddev_exec_time` costs nothing extra. A large spread means most calls are fast and a few are very slow: a plan that flips, or a lock wait (day 20).',
			'Lines 52 to 54: the same update adds `shared_blks_hit`, pages found in shared buffers, and `shared_blks_read`, pages asked from the operating system. Many reads per call point at a missing index or a cold cache. The docs\' example query computes a `hit_percent` from them. The `shared_blk_read_time` column stays at zero unless `track_io_timing` is enabled.',
			'In auto_explain, [`explain_ExecutorStart`](' + AE + '#L347-L365) turns on the timers **before** the statement runs, since it cannot know yet whether it will be slow. Only `explain_ExecutorEnd` (in the sources) compares the duration with the threshold. The docs therefore warn that `log_analyze` "can have an extremely negative impact on performance".'
		]
	},
	tradeoff: {
		gain: [
			'Sums show where the time really goes, including fast queries that run millions of times and never reach a slow log.',
			'Normalization folds thousands of query texts into a short list of shapes you can read in one screen.',
			'The slow log and auto_explain keep the rare bad run with its text and plan, so you can see why it was slow.'
		],
		cost: [
			'The module goes in `shared_preload_libraries`, and "a server restart is needed to add or remove the module".',
			'The counters add up from the last reset, so a query you fixed last week still tops the list until you call `pg_stat_statements_reset()` or compare two snapshots.',
			'`pg_stat_statements.max` caps the entries (5000 by default); past it, "information about the least-executed statements is discarded".',
			'`auto_explain.log_analyze` times every plan node of every statement, and a low threshold can fill the log disk.'
		]
	},
	task: {
		prompt: 'Your top three rows from `pg_stat_statements`, sorted by `total_exec_time`: (A) `SELECT * FROM products WHERE id = $1`, 2,400,000 calls, mean 0.9 ms, total 2,160 s. (B) `UPDATE carts SET updated_at = $1 WHERE id = $2`, 900,000 calls, mean 1.8 ms, stddev 40 ms, max 4,000 ms, total 1,620 s. (C) the nightly sales report, 30 calls, mean 8,000 ms, total 240 s. What do you look at for each, and in which order do you work on them?',
		hint: 'Each row is a different kind of problem: too many calls, an unsteady time, or one heavy job.',
		answer: [
			'Order by total: A, then B, then C. C is the star of the slow log, but it is about 6% of the time of the three.',
			'A is fast every time; the count is the problem. Find where the app calls it in a loop, one product per row, and load them in one query: `WHERE id = ANY($1)`. Check `rows / calls` is 1 and the hit percent is high, so it is not an index problem.',
			'B is usually fast but sometimes takes seconds: mean 1.8 ms, stddev 40 ms. That pattern points to waiting on something, not to slow work. While it spikes, look at `pg_stat_activity` for `wait_event_type = \'Lock\'`: two requests updating the same cart row (day 20). A new index will not help.',
			'C runs 30 times. Move it to a replica (day 28) or a materialized view refreshed at night (day 8), and set `log_min_duration_statement` with `auto_explain` to keep its plan if it gets worse.',
			'After each fix, `SELECT pg_stat_statements_reset();` (or save a snapshot) so the next reading shows the new state, not last week\'s.'
		],
		steps: [
			{
				title: 'Rank them by total time',
				questions: [
					{ q: 'In which order do you work on the three rows?', options: ['C, then B, then A', 'A, then B, then C', 'B, then A, then C', 'C, then A, then B'], answer: 1, why: 'Total time is where the server spends its time: 2,160 s, 1,620 s, then 240 s.' },
					{ q: 'About what share of the three totals is the report C?', options: ['About 60%', 'About 25%', 'About 6%', 'About 40%'], answer: 2, why: '240 s out of 4,020 s is about 6%. It is the star of the slow log, not of the CPU.' },
					{ q: 'Why sort by `total_exec_time` rather than `mean_exec_time`?', options: ['The mean hides fast queries that run very often', 'The mean is only computed for slow queries', 'The total is cheaper to compute', 'The mean resets every hour'], answer: 0, why: 'A 0.9 ms query called 2.4 million times costs more than an 8 second report run 30 times.' },
					{ q: 'A\'s calls come from two roles, the web app and an admin tool. How does A show up in `pg_stat_statements`?', options: ['As one row, since the constants become `$1`', 'As one row per distinct `id` value', 'Not at all, until both roles are granted the view', 'As two rows, one per role: add them to get A\'s real total'], answer: 3, why: 'The entry key holds `userid`, `dbid`, `queryid` and `toplevel`. The same query run by two roles is two rows, each with part of the time.' }
				]
			},
			{
				title: 'Read row A',
				questions: [
					{ q: 'Row A is fast every time. What is its problem?', options: ['A missing index', 'A lock wait', 'The number of calls', 'A bad plan'], answer: 2, why: '0.9 ms is fine. 2.4 million of them is not.' },
					{ q: 'Where do you look for the cause?', options: ['In the app: a loop that loads one product per row', 'In `pg_locks`', 'In the planner settings', 'In the WAL archive'], answer: 0, why: 'A query by id called that often usually comes from code that fetches rows one at a time.' },
					{ q: 'What is the fix?', options: ['An index on `products(id)`', 'Load the products in one query: `WHERE id = ANY($1)`', 'Raise `shared_buffers`', 'Move it to `auto_explain`'], answer: 1, why: 'One query for the whole list replaces many round trips. `id` is the primary key, so it is already indexed.' },
					{ q: 'Which numbers confirm it is not an index problem?', options: ['A high `stddev_exec_time`', 'A large `max_exec_time`', 'A low `calls` count', '`rows / calls` is 1 and the hit percent is high'], answer: 3, why: 'One row per call from cached pages means each run does little work. Many block reads per call would point at a missing index.' }
				]
			},
			{
				title: 'Read row B',
				questions: [
					{ q: 'Mean 1.8 ms, stddev 40 ms, max 4,000 ms. What does that pattern say?', options: ['Every call is slow', 'The query needs a new index', 'Most calls are fast and a few wait on something', 'The counters are broken'], answer: 2, why: 'A large spread means most runs are quick and a few are very slow: a plan that flips, or a lock wait.' },
					{ q: 'Where do you look while it spikes?', options: ['`pg_stat_activity`, for `wait_event_type = \'Lock\'`', '`pg_stat_replication`', 'The `rows` column', '`shared_blks_read`'], answer: 0, why: 'A lock wait shows up on the waiting backend, live.' },
					{ q: 'What is the likely cause for `UPDATE carts SET updated_at = $1 WHERE id = $2`?', options: ['A sequential scan of `carts`', 'Two requests updating the same cart row', 'A slow disk', 'Too many indexes on `carts`'], answer: 1, why: 'Two updates on one row: the second waits for the first to commit (day 20).' },
					{ q: 'Will a new index fix B?', options: ['Yes, on `updated_at`', 'Yes, on `id`', 'Only a GIN index', 'No: the time is spent waiting, not working'], answer: 3, why: 'The update already finds its row fast. The fix is in how the app writes the same cart at once.' }
				]
			},
			{
				title: 'Handle C, then measure again',
				questions: [
					{ q: 'Where does the nightly report go?', options: ['To a replica or a materialized view refreshed at night', 'Into a loop of smaller queries', 'Into `pg_stat_statements_reset()`', 'Nowhere: delete it'], answer: 0, why: 'It runs 30 times. Taking it off the primary is enough (days 28 and 8).' },
					{ q: 'How do you keep its plan if it gets worse?', options: ['Run EXPLAIN by hand each morning', 'Raise `pg_stat_statements.max`', 'Set `log_min_duration_statement` and `auto_explain`', 'Turn on `track_io_timing`'], answer: 2, why: 'auto_explain logs the plan of the slow run itself, which may differ from the one you get later in `psql`.' },
					{ q: 'You fixed A. Why does it still top the list next week?', options: ['The fix did not work', 'The counters add up from the last reset', 'pg_stat_statements caches the old plan', 'Normalization keeps the old text'], answer: 1, why: 'The sums include every call since the last reset. Old calls keep A on top.' },
					{ q: 'What do you run after each fix?', options: ['`VACUUM FULL`', 'A server restart', '`DROP EXTENSION pg_stat_statements`', '`SELECT pg_stat_statements_reset();`, or save a snapshot'], answer: 3, why: 'Then the next reading shows the new state, not last week\'s.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'With `log_min_duration_statement = 250ms`, why does a 3 ms query never show up in the log, even if it uses half the server?',
			options: [
				'The setting only logs statements that run inside an explicit transaction',
				'The setting logs single runs of 250 ms or more, and no single run is that slow',
				'Statements under 250 ms are logged, but to a separate file you must turn on',
				'The log keeps only the 5000 newest statements, so the fast ones roll off'
			],
			answer: 1,
			why: 'The docs describe it as: "Causes the duration of each completed statement to be logged if the statement ran for at least the specified amount of time." It looks at one run at a time. Only a sum over all runs, like `total_exec_time`, shows a fast query that runs very often.'
		},
		{
			q: 'Two app servers run `SELECT * FROM users WHERE email = \'a@x.io\'` and the same with `\'b@y.io\'`, as the same role, in the same database. How many rows in `pg_stat_statements`?',
			options: [
				'Two rows, because the two constants make the query texts different',
				'Two rows, because each app server has its own backend process',
				'No row until the query has run `pg_stat_statements.max` times',
				'One row with `calls = 2`, because the constant becomes `$1`'
			],
			answer: 3,
			why: 'Normalization replaces the constant with a parameter symbol, so both runs get the same `queryid`. The row is keyed by database, user, query ID and top level, not by client or process.'
		},
		{
			q: 'You load `auto_explain` with `log_min_duration = 500ms` and `log_analyze = on`. Why can every query get slower, even the fast ones?',
			options: [
				'Per-node timing runs for every statement, since slowness is known only at the end',
				'auto_explain runs a second EXPLAIN ANALYZE of each statement after it ends',
				'Every plan is written to the log first, and the fast ones are removed later',
				'The planner stops caching plans for prepared statements while it is loaded'
			],
			answer: 0,
			why: 'The docs: "per-plan-node timing occurs for all statements executed, whether or not they run long enough to actually get logged." The code turns the timers on in `ExecutorStart` and checks the duration in `ExecutorEnd`. Turning off `auto_explain.log_timing` lowers the cost.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Make a fast query that runs often outweigh one slow report, find it with `pg_stat_statements`, and catch the report with the slow log and `auto_explain`.',
		steps: [
			'Start PostgreSQL with both modules loaded: `docker run -d --name dojo-pg -e POSTGRES_PASSWORD=dojo postgres:17 -c shared_preload_libraries=pg_stat_statements,auto_explain -c log_min_duration_statement=250ms -c auto_explain.log_min_duration=250ms`. Wait until `docker exec dojo-pg pg_isready` prints `accepting connections`.',
			'Create the view and some data: `docker exec dojo-pg psql -U postgres -c "CREATE EXTENSION pg_stat_statements" -c "CREATE TABLE products (id int PRIMARY KEY, name text)" -c "INSERT INTO products SELECT g, \'p\' || g FROM generate_series(1, 10000) g"`',
			'Write a file `fast.sql` with two lines: `\\set id random(1, 10000)` and `SELECT * FROM products WHERE name = \'p\' || :id;`. Copy it in: `docker cp fast.sql dojo-pg:/tmp/fast.sql`.',
			'Start from zero, then run the fast query 5,000 times: `docker exec dojo-pg psql -U postgres -c "SELECT pg_stat_statements_reset()"` then `docker exec dojo-pg pgbench -U postgres -n -f /tmp/fast.sql -t 5000 postgres`.',
			'Run the "report" once: `docker exec dojo-pg psql -U postgres -c "SELECT count(*) FROM products a, products b WHERE a.id % 7 = b.id % 5"`',
			'Read the top list: `docker exec dojo-pg psql -U postgres -c "SELECT calls, round(total_exec_time::numeric) AS total_ms, round(mean_exec_time::numeric, 2) AS mean_ms, shared_blks_hit / calls AS hits_per_call, left(query, 45) AS query FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 3"`. Then the log: `docker logs dojo-pg 2>&1 | grep -A4 "duration:"`.',
			'Fix the fast query and measure again: `docker exec dojo-pg psql -U postgres -c "CREATE INDEX ON products (name)" -c "SELECT pg_stat_statements_reset()"`, then repeat the pgbench run and the top list.'
		],
		done: [
			'In step 6, the fast query is on top with `calls` 5000 and a sub-millisecond mean, above the report with `calls` 1. Its text reads `WHERE name = $1 || $2`.',
			'The log shows the report twice, once with `plan:` and its `Query Text`, and never the fast query.',
			'After step 7, the fast query\'s `hits_per_call` drops from dozens to a few, and its total falls far below the report\'s total from step 6.'
		],
		solution: [
			'Each fast run stays far under 250 ms, so the slow log never sees it. Only the sum in `pg_stat_statements` shows that it used more time than the report.',
			'Normalization folded 5,000 different names into one row, with the constants replaced by `$1` and `$2`.',
			'Dozens of buffer hits per call for a one-row lookup point at a scan: here a missing index on `name`. In the chapter\'s row A the lookup was already by primary key, so the fix there was fewer calls, not an index.',
			'Clean up with `docker rm -f dojo-pg`.'
		]
	},
	recall: {
		q: 'A 3 ms query runs 40,000 times a minute. Where do you see it, and why does `log_min_duration_statement = 250ms` never log it?',
		a: 'In `pg_stat_statements` sorted by `total_exec_time`: 40,000 × 3 ms is two minutes of database time per minute. `log_min_duration_statement` looks at one run at a time, and no single run reaches 250 ms.'
	},
	sources: [
		{ title: 'PostgreSQL docs, pg_stat_statements', url: 'https://www.postgresql.org/docs/current/pgstatstatements.html' },
		{ title: 'PostgreSQL docs, auto_explain', url: 'https://www.postgresql.org/docs/current/auto-explain.html' },
		{ title: 'PostgreSQL docs, log_min_duration_statement', url: 'https://www.postgresql.org/docs/current/runtime-config-logging.html#GUC-LOG-MIN-DURATION-STATEMENT' },
		{ title: 'PostgreSQL source, contrib/pg_stat_statements/pg_stat_statements.c', url: PGSS },
		{ title: 'PostgreSQL source, auto_explain.c, explain_ExecutorEnd', url: `${AE}#L434-L436` }
	]
};
