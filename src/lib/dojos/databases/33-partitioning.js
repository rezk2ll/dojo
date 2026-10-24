const PARTMAN = 'https://github.com/pgpartman/pg_partman/blob/c737cc1d32a46a37120aa691f7dd0bce6ad07660';
const DOC = `${PARTMAN}/doc/pg_partman.md?plain=1`;
const PG = 'https://github.com/postgres/postgres/blob/26bd08fb5c069fbdf55867adc398cfca0f55d5c8/doc/src/sgml/ddl.sgml';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'partitioning',
	part: 'Beyond one server',
	title: 'Partitioning big tables',
	minutes: 10,
	hook: [
		'Your `events` table has two billion rows. Every night a job runs `DELETE FROM events WHERE created_at < now() - interval \'90 days\'`. It takes hours, the replicas lag, and the next morning **autovacuum is still cleaning up the dead rows** (day 16).',
		'Most queries only read the last week anyway. Yet the indexes cover two years, and they no longer fit in memory.',
		'Partitioning splits one big table into smaller tables, one per month for example, behind a single name. The app still writes to `events`, and a query on last week reads one partition. Removing a month of old rows takes **one `DROP TABLE` on one partition**, which finishes in a moment instead of hours.'
	],
	terms: [
		{ term: 'Partition key', def: 'The column (or columns) that decides which partition a row goes to. Often a timestamp for range, a region or tenant for list.' },
		{ term: 'Partition pruning', def: 'The planner proves from the `WHERE` clause that some partitions cannot hold matching rows, and leaves them out of the plan.' },
		{ term: 'Default partition', def: 'A catch-all for rows that fit no other partition. Without one, PostgreSQL rejects such an insert with an error.' },
		{ term: 'Retention', def: 'The rule that drops or detaches partitions once all their data is older than a limit. pg_partman runs it for you.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['app["INSERT INTO events"] --> parent["events, partitioned by created_at"]'],
				highlight: ['app', 'parent'],
				note: 'The app inserts into `events` as before. The parent has no storage: PostgreSQL routes each row to a partition by its `created_at`.'
			},
			{
				add: ['parent --> sep[("events_p2026_09")]', 'parent --> oct[("events_p2026_10")]', 'parent --> def[("events_default")]'],
				highlight: ['sep', 'oct', 'def'],
				note: 'A range partition includes its lower bound and excludes its upper one, so midnight on October 1 goes to October. A row that fits no partition goes to the default one. Without a default, the insert fails.'
			},
			{
				add: ['q["SELECT ... WHERE created_at >= \'2026-10-01\'"] -.->|"pruned to one partition"| oct'],
				highlight: ['q'],
				note: 'The planner reads each partition\'s bounds and drops from the plan those that cannot match. `EXPLAIN` (day 12) shows only `events_p2026_10`. A query that does not filter on `created_at` still reads every partition.'
			},
			{
				add: ['maint["pg_partman run_maintenance()"] -->|"premake: create ahead"| nov[("events_p2026_11")]', 'parent --> nov'],
				highlight: ['maint', 'nov'],
				note: 'pg_partman keeps a number of future partitions ready, `premake`, 4 by default. Run its maintenance from cron or its background worker, and November exists before the first November row.'
			},
			{
				add: ['maint -->|"retention: detach, or drop"| sep'],
				highlight: ['sep'],
				note: 'When a whole partition is older than the retention interval, maintenance detaches it, or drops it. No row is deleted one by one, so vacuum has no dead rows to clean afterwards.'
			}
		]
	},
	example: {
		title: 'pg_partman, sql/functions/drop_partition_time.sql: retention by detaching or dropping whole partitions',
		repo: 'pgpartman/pg_partman',
		url: `${PARTMAN}/sql/functions/drop_partition_time.sql#L158-L269`,
		lang: 'sql',
		code: `FOR v_row IN
    SELECT partition_schemaname, partition_tablename FROM @extschema@.show_partitions(p_parent_table, 'ASC')
LOOP
…
    IF (v_partition_timestamp + v_partition_interval) < (p_reference_timestamp - v_retention) THEN
…
        SELECT count(*) INTO v_count FROM @extschema@.show_partitions(p_parent_table);
        IF v_count = 1 AND v_sub_parent IS NULL THEN
            RAISE WARNING 'Attempt to drop final partition in partition set % as part of retention policy. If you see this message multiple times for the same table, advise reviewing retention policy and/or data entry into the partition set. Also consider setting "infinite_time_partitions = true" if there are large gaps in data insertion.).', p_parent_table;
            CONTINUE;
        END IF;
…
        IF v_retention_keep_table = true OR v_retention_schema IS NOT NULL THEN
…
            v_sql := format('ALTER TABLE %I.%I DETACH PARTITION %I.%I'
                , v_parent_schema
                , v_parent_tablename
                , v_row.partition_schemaname
                , v_row.partition_tablename);
            EXECUTE v_sql;
…
        IF v_retention_schema IS NULL THEN
            IF v_retention_keep_table = false THEN
                IF v_jobmon_schema IS NOT NULL THEN
                    v_step_id := add_step(v_job_id, format('Drop table %s.%s', v_row.partition_schemaname, v_row.partition_tablename));
                END IF;
                IF v_detach_before_drop THEN
                    v_sql := format('ALTER TABLE %I.%I DETACH PARTITION %I.%I'
                    , v_parent_schema
                    , v_parent_tablename
                    , v_row.partition_schemaname
                    , v_row.partition_tablename);
                    EXECUTE v_sql;
                END IF;
                v_sql := 'DROP TABLE %I.%I';
                EXECUTE format(v_sql, v_row.partition_schemaname, v_row.partition_tablename);`,
		notes: [
			'Lines 1 to 5: the loop walks the partitions oldest first. A partition goes only if its start plus one interval, its upper bound, is older than now minus `retention`. The [docs](' + DOC + '#L120): "any partitions containing only data older than that will be dropped". A partition with some rows newer than the limit stays.',
			'Lines 7 to 11: if only one partition is left, the function warns and skips it. The [docs](' + DOC + '#L126): "retention will never drop the last child table in a set".',
			'Lines 13 to 20 run when `retention_keep_table` is true, the [default](' + DOC + '#L118). The partition is only detached: it stays on disk as a plain table, outside the parent. The PostgreSQL docs suggest backing it up at that point with `COPY` or `pg_dump`, then dropping it.',
			'Lines 35 and 36 drop the table. `DROP TABLE` on a partition "can very quickly delete millions of records", but [it takes](' + PG + '#L4646-L4656) an `ACCESS EXCLUSIVE` lock on the parent, while `DETACH PARTITION ... CONCURRENTLY` needs only `SHARE UPDATE EXCLUSIVE`. As on day 26, a long query on `events` makes the drop wait, and every query queued behind the drop waits too.',
			'pg_partman always creates a [default partition](' + DOC + '#L14) and watches it with `check_default()`. Its authors prefer that to creating tables on demand and cleaning up "potentially hundreds or thousands of unwanted partitions". `run_maintenance()` creates the partitions ahead, and running it more often than needed is safe.'
		]
	},
	tradeoff: {
		gain: [
			'Deleting a month is one `DROP TABLE` or `DETACH` instead of millions of row deletes, and it leaves no dead rows for vacuum.',
			'Queries that filter on the key read only the partitions they need. Each partition has smaller indexes, more likely to fit in memory.',
			'Maintenance runs per partition: vacuum, reindex or move one month at a time, and leave old partitions alone.'
		],
		cost: [
			'A primary key or unique constraint must include the partition key. `PRIMARY KEY (id)` alone is refused; you get `(id, created_at)`, and global uniqueness of `id` is no longer enforced by the database.',
			'Queries that do not filter on the key now plan and scan every partition. The docs say the planner handles "up to a few thousand partitions fairly well" only if queries prune all but a few; past that, planning time and memory grow.',
			'Someone must create the next partitions on time. Without a job, or a default partition, inserts start failing at midnight on the first of the month.',
			'The docs say partitioning pays off "only when a table would otherwise be very large". A smaller table still carries the primary key rule, the planning cost and the job that creates partitions.'
		]
	},
	task: {
		prompt: 'In `psql`, turn this design into SQL: `events(id bigint, user_id bigint, created_at timestamptz, payload jsonb)`, partitioned by month on `created_at`, with October and November 2026 and a default partition. Then say which of these queries are pruned: (a) `WHERE created_at >= \'2026-10-05\' AND created_at < \'2026-10-06\'`, (b) `WHERE user_id = 42`. Last, write how you remove September once it is past retention.',
		hint: 'The primary key must contain the partition key. Range bounds are `FROM (lower) TO (upper)`, with the upper bound excluded.',
		answer: [
			'`CREATE TABLE events (id bigint, user_id bigint, created_at timestamptz NOT NULL, payload jsonb, PRIMARY KEY (id, created_at)) PARTITION BY RANGE (created_at);`',
			'`CREATE TABLE events_p2026_10 PARTITION OF events FOR VALUES FROM (\'2026-10-01\') TO (\'2026-11-01\');` and the same for November. `CREATE TABLE events_default PARTITION OF events DEFAULT;`',
			'(a) is pruned: the range fits inside October, so `EXPLAIN` (day 12) leaves out November and shows `events_p2026_10`. (b) reads every partition: the filter says nothing about `created_at`. An index on `user_id` helps inside each partition, but every partition is still visited.',
			'Removal: `ALTER TABLE events DETACH PARTITION events_p2026_09 CONCURRENTLY;`, back it up if you need to, then `DROP TABLE events_p2026_09;`. Fast whatever the row count, and nothing for vacuum to clean.'
		],
		steps: [
			{
				title: 'Create the parent table',
				questions: [
					{ q: 'Which primary key does PostgreSQL accept on `events`?', options: ['`PRIMARY KEY (id)`', '`PRIMARY KEY (id, created_at)`', '`PRIMARY KEY (user_id)`', 'None: a partitioned table cannot have one'], answer: 1, why: 'A unique constraint on a partitioned table must include the partition key, because each partition\'s index only sees its own rows.' },
					{ q: 'Which clause makes the table partitioned by month on `created_at`?', options: ['`PARTITION BY LIST (created_at)`', '`PARTITION BY HASH (id)`', '`PARTITION BY RANGE (created_at)`', '`CLUSTER BY created_at`'], answer: 2, why: 'Months are ranges of timestamps. List fits a region or a tenant, not a timestamp.' },
					{ q: 'What does the parent `events` store itself?', options: ['Nothing: each row is routed to a partition', 'A copy of every row, for safety', 'Only the rows that fit no partition', 'Only the indexes of the partitions'], answer: 0, why: 'The parent has no storage. The app writes to `events`, and PostgreSQL routes each row by its `created_at`.' },
					{ q: 'With `PRIMARY KEY (id, created_at)`, what does the database no longer enforce?', options: ['That `id` is not NULL', 'That each `(id, created_at)` pair is unique', 'That rows arrive in time order', 'That `id` is unique across the whole table'], answer: 3, why: 'Two partitions could hold the same `id` with different dates. Global uniqueness of `id` is now up to you.' }
				]
			},
			{
				title: 'Add the partitions',
				questions: [
					{ q: 'Which bounds give October 2026?', options: ['`FROM (\'2026-10-01\') TO (\'2026-10-31\')`', '`FROM (\'2026-10-01\') TO (\'2026-11-01\')`', '`FROM (\'2026-09-30\') TO (\'2026-10-31\')`', '`FROM (\'2026-10-02\') TO (\'2026-11-01\')`'], answer: 1, why: 'The upper bound is excluded, so `TO (\'2026-11-01\')` covers the whole of October 31 and nothing of November.' },
					{ q: 'A row has `created_at` exactly at midnight on November 1. Where does it go?', options: ['October', 'November', 'The default partition', 'Both, as a copy'], answer: 1, why: 'A range partition includes its lower bound and excludes its upper one. Midnight is November\'s lower bound.' },
					{ q: 'Which statement creates the default partition?', options: ['`CREATE TABLE events_default PARTITION OF events DEFAULT;`', '`ALTER TABLE events SET DEFAULT PARTITION;`', '`CREATE TABLE events_default (LIKE events);`', '`CREATE DEFAULT PARTITION ON events;`'], answer: 0, why: '`PARTITION OF ... DEFAULT` attaches a catch-all for rows that fit no other partition.' },
					{ q: 'Without the default partition, a row arrives for December 2. What happens?', options: ['PostgreSQL creates a December partition', 'The row goes into November', 'The insert fails with an error', 'The row waits in the parent table'], answer: 2, why: 'A row that maps to no partition is an error. That is why pg_partman pre-creates partitions and adds a default one.' }
				]
			},
			{
				title: 'Check the pruning',
				questions: [
					{ q: 'Which partitions does query (a), one day in October, read?', options: ['Only `events_p2026_10`', 'October and November', 'Every partition', 'Only the default partition'], answer: 0, why: 'The range fits inside October\'s bounds, so the planner proves the others cannot match and leaves them out.' },
					{ q: 'Which partitions does query (b), `WHERE user_id = 42`, read?', options: ['Only the newest one', 'Every partition', 'Only the default partition', 'None, it uses the primary key'], answer: 1, why: 'The filter says nothing about `created_at`, so no partition can be ruled out.' },
					{ q: 'How do you see which partitions a query reads?', options: ['`SELECT count(*)` on the query', '`VACUUM VERBOSE events`', '`pg_dump` of the parent', '`EXPLAIN` the query'], answer: 3, why: '`EXPLAIN` (day 12) lists only the partitions left in the plan.' },
					{ q: 'You add an index on `user_id`. What changes for (b)?', options: ['Each partition is searched faster, but all are still visited', 'The query is pruned to one partition', 'Nothing: partitioned tables cannot have indexes', 'Only the default partition is searched'], answer: 0, why: 'An index helps inside each partition. Pruning still needs a filter on the partition key.' }
				]
			},
			{
				title: 'Remove September',
				questions: [
					{ q: 'September is past retention. What is the cheapest way to remove it?', options: ['`DELETE FROM events WHERE created_at < \'2026-10-01\'`', 'Detach the partition, then drop it', '`TRUNCATE events`, then copy back October and November', 'Delete it in batches of 10,000 rows'], answer: 1, why: 'Dropping a partition removes all its rows at once, whatever their number.' },
					{ q: 'Why does a dropped partition leave vacuum nothing to do?', options: ['No row is deleted one by one, so there are no dead rows', 'Vacuum skips partitioned tables', 'The rows move to the default partition', 'Drop runs a `VACUUM FULL` first'], answer: 0, why: 'A big `DELETE` leaves millions of dead rows for autovacuum (day 16). A `DROP TABLE` removes the file.' },
					{ q: 'Which lock does `DROP TABLE` on a partition take on the parent?', options: ['`SHARE UPDATE EXCLUSIVE`', 'No lock at all', '`ACCESS EXCLUSIVE`', 'A row lock on each row'], answer: 2, why: 'So a long query on `events` makes the drop wait, and every query behind it waits too, as on day 26.' },
					{ q: 'Why detach first instead of dropping straight away?', options: ['`DROP TABLE` refuses an attached partition', 'Detach deletes the rows faster than drop', 'Retention only works on detached tables', 'The detached table stays on disk, so you can back it up first'], answer: 3, why: 'A detached partition becomes a plain table. The PostgreSQL docs suggest a `COPY` or `pg_dump` at that point, then the drop.' }
				]
			}
		]
	},
	quiz: [
		{
			q: '`events` is partitioned by range on `created_at`. Why does `ALTER TABLE events ADD PRIMARY KEY (id)` fail?',
			options: [
				'Each partition\'s index only sees its own rows, so the key must include created_at',
				'A partitioned table has no storage, so it cannot hold any index or constraint at all',
				'Primary keys on a partitioned table must be created on each partition one by one',
				'The id column must be declared as a hash partition key before it can be unique'
			],
			answer: 0,
			why: 'A unique constraint on a partitioned table is made of one index per partition, and each enforces uniqueness only within its partition. Only when the key contains the partition key can the structure itself rule out the same value in two partitions.'
		},
		{
			q: 'There is no default partition, and partitions exist up to the end of October. A row arrives with `created_at` on November 2. What happens?',
			options: [
				'PostgreSQL creates the November partition on the fly and stores the row in it',
				'The row goes into the October partition, the closest range that already exists',
				'The insert fails with an error until someone creates a partition that fits it',
				'The row is stored in the parent table until the next maintenance run moves it'
			],
			answer: 2,
			why: 'Inserting a row that maps to no partition is an error; the partition must be created first. pg_partman therefore pre-creates partitions with `premake` and adds a default partition as a safety net.'
		},
		{
			q: 'You must delete everything older than 90 days from a table partitioned by month. What is the cheapest correct way?',
			options: [
				'One `DELETE ... WHERE created_at < now() - interval \'90 days\'`, then a `VACUUM FULL`',
				'Detach and drop the partitions whose whole range is older than 90 days',
				'A `TRUNCATE` on the parent table, then copy back the rows of the last 90 days',
				'Delete in batches of 10,000 rows from each partition until no old row is left'
			],
			answer: 1,
			why: 'Dropping or detaching a partition removes its rows without touching them one by one, and leaves no dead rows for vacuum (day 16). The partition that is only partly older than 90 days stays until it is wholly past the limit.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Build a table partitioned by month, watch pruning in `EXPLAIN`, and remove a month with one `DROP TABLE`.',
		steps: [
			'Start PostgreSQL and open `psql`: `docker run -d --name part-lab -e POSTGRES_PASSWORD=lab postgres:16`, wait a few seconds, then `docker exec -it part-lab psql -U postgres`.',
			'Try the naive key first: `CREATE TABLE events (id bigint PRIMARY KEY, user_id bigint, created_at timestamptz NOT NULL, payload jsonb) PARTITION BY RANGE (created_at);`. Read the error, then create it with the key PostgreSQL accepts.',
			'Create September, October and November 2026 with `CREATE TABLE events_p2026_09 PARTITION OF events FOR VALUES FROM (\'2026-09-01\') TO (\'2026-10-01\');` and the same for the next two months. Insert a December row: `INSERT INTO events VALUES (1, 1, \'2026-12-02\', \'{}\');`.',
			'Add the default partition, run the same insert again, then load data: `INSERT INTO events SELECT g, g % 100, timestamptz \'2026-09-01\' + (g % 91) * interval \'1 day\', \'{}\' FROM generate_series(2, 30000) g;`. See where the rows went: `SELECT tableoid::regclass AS partition, count(*) FROM events GROUP BY 1 ORDER BY 1;`.',
			'Run `EXPLAIN (COSTS OFF)` on `SELECT * FROM events WHERE created_at >= \'2026-10-05\' AND created_at < \'2026-10-06\';` and on `SELECT * FROM events WHERE user_id = 42;`.',
			'Remove September: try `ALTER TABLE events DETACH PARTITION events_p2026_09 CONCURRENTLY;`, then run it without `CONCURRENTLY`, then `DROP TABLE events_p2026_09;` and count per partition again. When you are done: `docker rm -f part-lab`.'
		],
		done: [
			'`PRIMARY KEY (id)` fails with `unique constraint on partitioned table must include all partitioning columns`.',
			'The December insert fails with `no partition of relation "events" found for row` before the default partition exists, and lands in `events_default` after.',
			'The October query plan shows only `events_p2026_10`. The `user_id` plan has an `Append` over all four partitions.',
			'`DETACH ... CONCURRENTLY` fails with `cannot detach partitions concurrently when a default partition exists`, and the plain `DETACH` works.',
			'After the drop, the count per partition no longer lists `events_p2026_09`.'
		],
		solution: [
			'`CREATE TABLE events (id bigint, user_id bigint, created_at timestamptz NOT NULL, payload jsonb, PRIMARY KEY (id, created_at)) PARTITION BY RANGE (created_at);`',
			'`CREATE TABLE events_p2026_10 PARTITION OF events FOR VALUES FROM (\'2026-10-01\') TO (\'2026-11-01\');`, the same with `11` and `12` for November, and `CREATE TABLE events_default PARTITION OF events DEFAULT;`.',
			'`ALTER TABLE events DETACH PARTITION events_p2026_09;` then `DROP TABLE events_p2026_09;`. Between the two, the detached table is a plain table you can back up with `COPY` or `pg_dump`.',
			'The plain `DETACH` takes a stronger lock than `CONCURRENTLY`. With a default partition in place, PostgreSQL refuses the concurrent form, so plan the detach for a quiet moment.'
		]
	},
	recall: {
		q: '`events` is partitioned by month on `created_at`. How do you remove rows older than 90 days, and which partitions go?',
		a: 'Detach and drop each partition whose whole range is older than 90 days: `DETACH PARTITION ... CONCURRENTLY`, then `DROP TABLE`. A partition with some newer rows stays, and no dead rows are left for vacuum.'
	},
	sources: [
		{ title: 'PostgreSQL docs, Table Partitioning', url: 'https://www.postgresql.org/docs/current/ddl-partitioning.html' },
		{ title: 'PostgreSQL source docs, ddl.sgml: back up a detached partition', url: `${PG}#L4658-L4680` },
		{ title: 'pg_partman docs', url: `${PARTMAN}/doc/pg_partman.md` },
		{ title: 'pg_partman howto', url: `${PARTMAN}/doc/pg_partman_howto.md` }
	]
};
