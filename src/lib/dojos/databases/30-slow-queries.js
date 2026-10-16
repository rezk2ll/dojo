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
		'The dashboard says the database is at 90% CPU. Every page is a little slower, and no single page is broken. **Which query is it?** The slow log shows one 8 second report. It is not the culprit.',
		'The culprit takes **3 milliseconds** and runs 40,000 times a minute: two minutes of database time every minute. No slow log catches it, because no single run is slow. **Only a sum shows it.**',
		'Today: `pg_stat_statements`, which adds up every query by its shape; `log_min_duration_statement` and `auto_explain`, which catch the single slow runs and their plans; and what to look at first.'
	],
	terms: [
		{ term: 'pg_stat_statements', def: 'A module shipped with PostgreSQL that counts calls, time, rows and blocks for every statement the server runs, and shows the totals as a view.' },
		{ term: 'Normalization', def: 'Constants in a query are replaced by `$1`, `$2`, so `id = 42` and `id = 43` share one row, keyed by a `queryid` hash.' },
		{ term: 'total_exec_time', def: 'The sum of execution time over all calls. Sort by it to see where the server spends its time; `mean_exec_time` alone hides fast queries that run often.' },
		{ term: 'log_min_duration_statement', def: 'Logs every statement that ran at least this long, with its duration and text. `-1`, the default, logs nothing.' },
		{ term: 'auto_explain', def: 'A module that writes the plan of slow statements to the log, so you see why a run was slow without running EXPLAIN by hand.' },
		{ term: 'Blocks hit and read', def: '`shared_blks_hit` counts pages found in shared buffers, `shared_blks_read` pages asked from the operating system. Many reads per call point at missing indexes or a cold cache.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['q1["SELECT * FROM orders WHERE id = 42"] --> norm["Shape: WHERE id = $1"]', 'q2["SELECT * FROM orders WHERE id = 43"] --> norm'],
				highlight: ['norm'],
				note: '**Group by shape.** The constants are replaced by a parameter symbol, so both runs get the same `queryid`. The view holds "one row for each distinct combination of database ID, user ID, query ID" and top level or not.'
			},
			{
				add: ['norm -->|"after each run: calls, time, rows, blocks"| pgss[("pg_stat_statements")]'],
				highlight: ['pgss'],
				note: '**Add up every run.** When a statement finishes, its counters grow: one more call, its time added to the total, the min, max, mean and standard deviation updated, its rows and blocks added. Nothing is kept per run, only sums.'
			},
			{
				add: ['top["ORDER BY total_exec_time DESC LIMIT 10"] -->|"read"| pgss'],
				highlight: ['top'],
				note: '**Look at the total first.** The docs\' own example sorts by `total_exec_time`. That puts the 3 ms query with 40,000 calls a minute above the 8 second report that runs once a night. Then read `calls`, `mean_exec_time` and `rows` to see which kind of problem it is.'
			},
			{
				add: ['slow["One run of 900 ms"] -->|"log_min_duration_statement = 250ms"| log["Server log"]'],
				highlight: ['slow', 'log'],
				note: '**Catch the bad run.** A sum cannot tell you that one call took 900 ms with these parameters. With `log_min_duration_statement` at 250ms, "all SQL statements that run 250ms or longer will be logged", with their duration.'
			},
			{
				add: ['ae["auto_explain, log_min_duration = 250ms"] -->|"the plan of that run"| log'],
				highlight: ['ae'],
				note: '**And its plan.** `auto_explain` logs the plan of each statement over its threshold, the same output EXPLAIN gives (day 12). The plan at the moment it was slow is often different from the one you get later in `psql`.'
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
			'**One entry per shape, per role, per database.** The hash key is `userid`, `dbid`, `queryid` and `toplevel`. The same query run by two roles is two rows. With no query ID, [`pgss_store` returns](' + PGSS + '#L1291-L1296) and records nothing; `compute_query_id = auto`, the default, turns it on when the module is loaded.',
			'**The text is normalized once.** For a new entry, [`generate_normalized_query`](' + PGSS + '#L1335-L1346) swaps the constants for `$1`, `$2`, and the text is appended to a file rather than kept in shared memory. The docs: the rest of the text "is that of the first query that had the particular queryid hash value".',
			'**Mean and spread with no history.** Each call adds to `calls` and `total_time` and moves the mean with Welford\'s method, so `stddev_exec_time` costs nothing extra. A large spread means "usually fast, sometimes awful": a plan that flips, or a lock wait (day 20).',
			'**Blocks show where the time went.** The same update adds `shared_blks_hit` and `shared_blks_read`. The docs\' example query computes a `hit_percent` from them. The `shared_blk_read_time` column stays at zero unless `track_io_timing` is enabled.',
			'**auto_explain decides early, and pays for it.** [`explain_ExecutorStart`](' + AE + '#L347-L365) turns on the timers **before** the statement runs, since it cannot know yet whether it will be slow. Only [`explain_ExecutorEnd`](' + AE + '#L434-L436) compares the duration with the threshold. Hence the docs\' warning that `log_analyze` "can have an extremely negative impact on performance".'
		]
	},
	tradeoff: {
		gain: [
			'Sums show where the time really goes, including fast queries that run millions of times and never reach a slow log.',
			'Normalization folds thousands of query texts into a short list of shapes you can read in one screen.',
			'The slow log and auto_explain keep the rare bad run with its text and plan, so you can see why it was slow, not just that it was.'
		],
		cost: [
			'The module goes in `shared_preload_libraries`, and "a server restart is needed to add or remove the module".',
			'Counters are totals since the last reset. A query you fixed last week still tops the list until you call `pg_stat_statements_reset()` or compare two snapshots.',
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
			'B is usually fast but sometimes takes seconds: mean 1.8 ms, stddev 40 ms. That smells like waiting, not work. While it spikes, look at `pg_stat_activity` for `wait_event_type = \'Lock\'`: two requests updating the same cart row (day 20). A new index will not help.',
			'C runs 30 times. Move it to a replica (day 28) or a materialized view refreshed at night (day 8), and set `log_min_duration_statement` with `auto_explain` to keep its plan if it gets worse.',
			'After each fix, `SELECT pg_stat_statements_reset();` (or save a snapshot) so the next reading shows the new state, not last week\'s.'
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
	takeaway: 'Sort `pg_stat_statements` by total time to find what costs the most, then use the slow log and `auto_explain` to see why one run was slow.',
	sources: [
		{ title: 'PostgreSQL docs, pg_stat_statements', url: 'https://www.postgresql.org/docs/current/pgstatstatements.html' },
		{ title: 'PostgreSQL docs, auto_explain', url: 'https://www.postgresql.org/docs/current/auto-explain.html' },
		{ title: 'PostgreSQL docs, log_min_duration_statement', url: 'https://www.postgresql.org/docs/current/runtime-config-logging.html#GUC-LOG-MIN-DURATION-STATEMENT' },
		{ title: 'PostgreSQL source, contrib/pg_stat_statements/pg_stat_statements.c', url: PGSS }
	]
};
