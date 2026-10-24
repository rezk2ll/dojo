const DISC = 'https://github.com/discourse/discourse/blob/821e9e2f9f94483a3be8d1e077cde0fd94970479';
const PG = 'https://github.com/postgres/postgres/blob/92d47d544bf64274b6a7aa8775f7b35bcf71f339/doc/src/sgml';
const MIG = `${DISC}/db/migrate/20260610064425_introduce_permission_acl_tables.rb`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'index-types',
	part: 'Inside the engine',
	title: 'Index types: GIN, GiST, BRIN and Hash',
	minutes: 10,
	hook: [
		'Your forum stores who may see a category as an array: `allowed_user_ids = {3, 7, 42}`. The page "categories I can see" runs `WHERE allowed_user_ids @> ARRAY[42]`. It gets slower every month.',
		'You add a B-tree index on the column. Nothing changes. **A B-tree sorts whole values**, so it knows that `{3,7,42}` comes before `{3,8}`. It has no idea that 42 is inside.',
		'PostgreSQL ships other index types for questions a sorted list cannot answer. **GIN indexes each element inside a value**, GiST answers "does it overlap?" and "what is nearest?", BRIN keeps a min and max per 128 pages, and Hash serves only `=`.'
	],
	terms: [
		{ term: 'Operator class', def: 'The set of operators an index can serve for a column type. An index helps a WHERE clause only if the clause uses one of those operators on the indexed column.' },
		{ term: 'GIN', def: 'Generalized Inverted Index. One entry per element (array item, JSONB key, word) pointing at the rows that contain it. Made for "does this value contain that?".' },
		{ term: 'GiST', def: 'Generalized Search Tree. A balanced tree of bounding boxes or ranges. Answers overlap, containment and nearest neighbour for geometry, ranges and IP networks.' },
		{ term: 'BRIN', def: 'Block Range Index. Stores a summary, such as min and max, for each group of 128 table pages by default. It can return rows that do not match, so the executor rechecks each row of a matching range.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['q["What does the WHERE clause ask?"] -->|"= or a range on a sortable value"| btree["B-tree: sorted values (day 10)"]'],
				highlight: ['q', 'btree'],
				note: 'The docs say each index type suits "different types of indexable clauses", so you pick the type from the WHERE clause. For `=`, `<`, `BETWEEN` and `ORDER BY` on a sortable column, the B-tree from day 10 is the answer, and it is what `CREATE INDEX` builds by default.'
			},
			{
				add: ['q -->|"does it contain this element or key?"| gin["GIN: one entry per element, each with its list of rows"]'],
				highlight: ['gin'],
				note: 'GIN splits a value into its elements. The row `{3,7,42}` gives three index entries: 3, 7 and 42, each pointing back at the row. The array operator class serves `<@`, `@>`, `=` and `&&`. For `jsonb`, `jsonb_ops` is the default and `jsonb_path_ops` serves fewer operators, faster.'
			},
			{
				add: ['q -->|"does it overlap, or what is nearest?"| gist["GiST: a tree of bounding boxes and ranges"]'],
				highlight: ['gist'],
				note: 'GiST groups values by the space they cover. Each inner entry "represents all the given entries" below it, like a bounding box around its children, so a search skips any branch that cannot overlap. Built-in classes cover geometry, `range_ops`, `multirange_ops` and `inet_ops`. It also answers `ORDER BY location <-> point LIMIT 10`.'
			},
			{
				add: ['q -->|"a time window on a huge append-only table"| brin["BRIN: min and max per 128 pages"]', 'brin -.->|"recheck every row of each matching range"| heap[("table pages")]'],
				highlight: ['brin', 'heap'],
				note: 'BRIN stores one summary per block range, so a scan reads every page of each range whose summary might match. It works when the column follows the insert order, like `created_at` on a log. On a shuffled column, every range matches and you read the whole table.'
			},
			{
				add: ['q -->|"= only, never a range"| hash["Hash: a 32-bit hash code per row"]'],
				highlight: ['hash'],
				note: 'A Hash index stores a 32-bit hash of each value and "can only handle simple equality comparisons". It cannot sort, cannot serve a range, and cannot back a UNIQUE constraint: the docs say "Currently, only B-tree indexes can be declared unique."'
			}
		]
	},
	example: {
		title: 'db/migrate/20260610064425_introduce_permission_acl_tables.rb: two GIN indexes on id arrays',
		repo: 'discourse/discourse',
		url: `${MIG}#L3-L20`,
		lang: 'ruby',
		code: `  def up
    create_table :access_control_lists do |t|
      t.string :target_type, null: false, limit: 255
      t.bigint :target_id, null: false

      t.string :owner, null: false, limit: 100
      t.string :permission, null: false, limit: 100

      t.bigint :allowed_user_ids, array: true, null: false, default: []
      t.bigint :allowed_group_ids, array: true, null: false, default: []

      t.timestamps
    end

    add_index :access_control_lists, %i[target_type target_id permission], unique: true
    execute "CREATE INDEX idx_access_control_lists_allowed_user_ids ON access_control_lists USING GIN(allowed_user_ids)"
    execute "CREATE INDEX idx_access_control_lists_allowed_group_ids ON access_control_lists USING GIN(allowed_group_ids)"
  end`,
		notes: [
			'Line 15 serves "find the ACL for this category and permission", which is equality on whole values: a plain unique B-tree. Lines 16 and 17 serve "find every ACL that lets user 42 in", which looks inside an array: GIN. The unique index has to be a B-tree anyway, since only B-tree indexes can be declared unique.',
			'The model\'s [scopes](' + DISC + '/app/models/access_control_list.rb#L48-L55) query with `allowed_user_ids @> ARRAY[:user_id]::bigint[]` and `allowed_group_ids && ARRAY[:group_ids]::bigint[]`. Both `@>` and `&&` belong to the GIN array operator class. `42 = ANY(allowed_user_ids)` does not: on PostgreSQL 18 it plans as a sequential scan even with the GIN index in place.',
			'When a user is deleted, the job [`CleanupAclsForDeleted`](' + DISC + '/app/jobs/regular/cleanup_acls_for_deleted.rb#L20-L28) finds the rows with `allowed_user_ids @> ARRAY[?]::bigint[]` and rewrites the array with `array_remove`. Each rewrite also updates the GIN entries for that row.',
			'Another Discourse migration builds [two GIN indexes on id arrays](' + DISC + '/plugins/boards/db/migrate/20260407065612_add_kanban_sync_indexes.rb#L5-L9) without raw SQL, with `add_index ... using: :gin`.',
			'The GIN docs give the write cost: "inserting or updating one heap row can cause many inserts into the index (one for each key extracted from the indexed item)". With [`fastupdate`](' + PG + '/gin.sgml#L500-L527), on by default, new entries wait in a pending list that searches must also scan. Vacuum, autoanalyze or `gin_clean_pending_list` then merges them into the index.'
		]
	},
	tradeoff: {
		gain: [
			'Array and JSONB containment, range overlap and nearest neighbour can use an index scan, which a B-tree cannot serve.',
			'In a test with 2 million rows in time order, a BRIN on `created_at` took 24 kB where a B-tree took 43 MB.',
			'Each type is one `USING` keyword in `CREATE INDEX`, with no extension or new service, inside the same transactions and backups.'
		],
		cost: [
			'GIN writes are slow: one row can mean dozens of index entries. The pending list delays that work, and the insert that fills the list pays for the merge.',
			'An index serves only the operators of its operator class. Write the query another way (`= ANY` instead of `@>`) and the planner ignores the index without a warning.',
			'BRIN skips pages only while values follow the physical order of the rows. A backfill of old dates lands at the end of the table, an `UPDATE` can write the new row version on another page, and the ranges start to overlap.',
			'Hash, GIN, GiST and BRIN cannot enforce uniqueness. You still need a B-tree for that.'
		]
	},
	task: {
		prompt: 'In `psql`, create `events(id bigint generated always as identity, created_at timestamptz not null, payload text)` and fill it with 2 million rows, one per second from 2026-01-01, with `generate_series`. Build a BRIN and a B-tree on `created_at` and compare their sizes. Drop the B-tree, then run `EXPLAIN (ANALYZE, BUFFERS)` on a count for one day. What do you see, and why?',
		hint: '`pg_relation_size` gives the size of a table or an index. In the plan, look at the scan node under the aggregate and at the line "Heap Blocks".',
		answer: [
			'Fill: `INSERT INTO events (created_at, payload) SELECT timestamptz \'2026-01-01\' + i * interval \'1 second\', \'x\' FROM generate_series(1, 2000000) i;` then `CREATE INDEX ON events USING brin (created_at);` and `CREATE INDEX ON events (created_at);`.',
			'Sizes on PostgreSQL 18: the table is about 100 MB, the B-tree about 43 MB, the BRIN 24 kB. The BRIN holds one summary per 128 pages, the B-tree one entry per row.',
			'The plan is a Bitmap Index Scan on the BRIN under a Bitmap Heap Scan, with `Heap Blocks: lossy=640` and `Rows Removed by Index Recheck`. The index names whole page ranges, and the executor rechecks every row in them.',
			'It works because `created_at` grows with the insert order, so each range covers a short time window. Fill a second table with `random()` dates over the same 23 days and the same query marks every page of the table lossy (about 12,700 pages): each range now holds dates from the whole period.'
		],
		steps: [
			{
				title: 'Fill the table',
				questions: [
					{ q: 'Which expression gives one row per second from 2026-01-01?', options: ['`now() - i * interval \'1 second\'`', '`timestamptz \'2026-01-01\' + random() * interval \'23 days\'`', '`timestamptz \'2026-01-01\' + i * interval \'1 second\'`', '`timestamptz \'2026-01-01\' + i * interval \'1 day\'`'], answer: 2, why: 'With `i` from `generate_series(1, 2000000)`, each row is one second after the previous one, starting at 2026-01-01.' },
					{ q: 'Which statement builds the BRIN?', options: ['`CREATE INDEX ON events (created_at);`', '`CREATE INDEX ON events USING brin (created_at);`', '`CREATE INDEX ON events USING gin (created_at);`', '`CREATE INDEX ON events USING hash (created_at);`'], answer: 1, why: 'The index type is one `USING` keyword. Without it, `CREATE INDEX` builds a B-tree, which is the second index you need.' },
					{ q: 'Which function gives the size of the table or of one index?', options: ['`pg_relation_size`', '`count(*)`', '`EXPLAIN (BUFFERS)`', 'The `pg_stats` view'], answer: 0, why: '`pg_relation_size` returns the size on disk of one relation, a table or an index, as the hint says.' },
					{ q: 'Why does `created_at` follow the physical order of the rows here?', options: ['BRIN sorts the table by the indexed column when it is built', 'PostgreSQL always stores rows sorted by their primary key', 'The B-tree moves the rows into order when it is created', 'Rows go in one by one in time order, each after the last'], answer: 3, why: 'The insert walks the series in order, so each new row lands after the previous one, with a later time. Nothing sorts the table afterwards.' }
				]
			},
			{
				title: 'Compare the sizes',
				questions: [
					{ q: 'The table is about 100 MB on PostgreSQL 18. About how big is the B-tree on `created_at`?', options: ['24 kB', '43 MB', '100 MB', '4 MB'], answer: 1, why: 'The B-tree holds one entry per row, 2 million of them: about 43 MB.' },
					{ q: 'About how big is the BRIN?', options: ['24 kB', '43 MB', '4 MB', '640 kB'], answer: 0, why: 'In this test the BRIN takes 24 kB, against 43 MB for the B-tree.' },
					{ q: 'Why is the BRIN so much smaller?', options: ['It compresses each row entry better than a B-tree does', 'It indexes only the rows inserted after it was built', 'It keeps the values in memory and stores nothing on disk', 'It keeps one summary per 128 pages, not one entry per row'], answer: 3, why: 'BRIN stores a summary per block range, 128 table pages by default. The B-tree stores an entry for every row.' },
					{ q: 'What does a BRIN summary hold for a column like `created_at`?', options: ['The exact time of each row in the range', 'A hash of each value in the range', 'The min and the max of the range', 'The number of rows for each day'], answer: 2, why: 'For a sortable column, the summary is a min and a max per block range. That is all the index knows.' }
				]
			},
			{
				title: 'Read the plan',
				questions: [
					{ q: 'After you drop the B-tree, which scan nodes count the rows of one day?', options: ['A Bitmap Index Scan on the BRIN under a Bitmap Heap Scan', 'An Index Only Scan on the BRIN, with no table access', 'An Index Scan on the BRIN that returns one row at a time', 'A Seq Scan, because a BRIN cannot be used for a range'], answer: 0, why: 'BRIN returns page ranges, so the plan builds a bitmap of pages and the heap scan reads them.' },
					{ q: 'What does `Heap Blocks: lossy=640` tell you?', options: ['640 pages were missing from the cache and read from disk', '640 rows of the day were lost and have to be recounted', 'The index named whole pages, not rows, so each row in them is checked', 'The index is damaged on 640 pages and needs a REINDEX'], answer: 2, why: 'Lossy means the bitmap knows pages, not rows. The executor rechecks every row of those pages against the condition.' },
					{ q: 'Where do the `Rows Removed by Index Recheck` come from?', options: ['Dead rows that VACUUM has not removed yet', 'Rows in the matching ranges that fall outside the day', 'Rows that the B-tree had already counted before', 'Rows hidden from this query by an open transaction'], answer: 1, why: 'A matching range can hold times just before or after the day. The recheck drops them.' },
					{ q: '640 lossy pages is how many block ranges of 128 pages?', options: ['128', '640', '2', '5'], answer: 3, why: '640 / 128 = 5. The day sits in about five ranges, and the scan reads all their pages.' }
				]
			},
			{
				title: 'Explain why',
				questions: [
					{ q: 'The 2 million rows fill about 12,700 pages. About how much time does one range of 128 pages cover?', options: ['About one minute', 'About 5 to 6 hours', 'About one day', 'About the whole 23 days'], answer: 1, why: 'About 157 rows per page, so 128 pages hold about 20,000 rows, one per second: about 5.6 hours. That is why one day touches about five ranges.' },
					{ q: 'A second table gets `random()` dates over the same 23 days. What does the same query do?', options: ['It marks every page of the table lossy, about 12,700 pages', 'It reads the same 640 pages, since the dates are the same', 'It switches to an Index Only Scan on the BRIN', 'It fails, because BRIN needs values in sorted order'], answer: 0, why: 'Each range now holds dates from the whole period, so every summary matches the day.' },
					{ q: 'The table is in production. Which change slowly breaks the BRIN?', options: ['Adding a `payload` column', 'Running `ANALYZE` every night', 'A backfill of old dates and many `UPDATE`s', 'Counting a full week instead of a day'], answer: 2, why: 'A backfill lands at the end of the table, and an `UPDATE` can write the new version on another page. The ranges start to overlap.' },
					{ q: 'You also need `created_at` to be unique. What do you add?', options: ['A second BRIN with a smaller range size', 'A Hash index, which serves `=` exactly', 'A GIN index on `created_at`', 'A B-tree, the only type that can be unique'], answer: 3, why: 'The docs: "Currently, only B-tree indexes can be declared unique." BRIN, Hash, GIN and GiST cannot enforce it.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'A table has a GIN index on `allowed_user_ids bigint[]`. Which WHERE clause can use it?',
			options: [
				'`WHERE 42 = ANY(allowed_user_ids)`',
				'`WHERE allowed_user_ids @> ARRAY[42]::bigint[]`',
				'`WHERE allowed_user_ids[1] = 42`',
				'`WHERE array_length(allowed_user_ids, 1) > 2`'
			],
			answer: 1,
			why: 'An index serves a clause of the form "indexed column, operator of its operator class, value". The GIN array class has `<@`, `@>`, `=` and `&&`. `= ANY`, a subscript or a function call on the column do not have that shape.'
		},
		{
			q: 'When is a BRIN index on `created_at` a good fit?',
			options: [
				'When rows are inserted in time order and seldom moved, so each page range covers a short window',
				'When rows arrive in any order, because the summary keeps the exact time of every row',
				'When the column must be unique, because the summary rejects a second row with the same time',
				'When queries ask for one exact timestamp, because the summary points straight at that row'
			],
			answer: 0,
			why: 'BRIN stores a min and a max per block range and returns whole ranges. It skips pages only if values follow the physical order. It is lossy, so it never points at one row, and only B-trees can be unique.'
		},
		{
			q: 'A busy table gets a GIN index on a `jsonb` column. Writes slow down, and now and then one insert takes much longer than the others. Why?',
			options: [
				'GIN locks the whole table for each insert until the index has been rebuilt from scratch',
				'Each row adds one entry per key, and a full pending list is merged during one insert',
				'GIN sorts the jsonb values, so every insert has to move half the index pages',
				'GIN keeps a copy of each document, so every insert writes the row twice to disk'
			],
			answer: 1,
			why: 'One row yields one index entry per extracted key. With `fastupdate` on, entries wait in a pending list, and the insert that makes it too large pays for the merge. Vacuum and autoanalyze also merge it in the background. A B-tree (day 10) pays one entry per row.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'See a B-tree ignore an array containment query, and a GIN index serve it.',
		steps: [
			'Start a throwaway PostgreSQL 18 and open `psql`: `docker run --rm -d --name pg-lab -e POSTGRES_PASSWORD=lab postgres:18`, wait a few seconds, then `docker exec -it pg-lab psql -U postgres`.',
			'Create the hook\'s table with 200,000 rows of three random user ids: `CREATE TABLE acl (id bigint generated always as identity primary key, allowed_user_ids bigint[] not null);` then `INSERT INTO acl (allowed_user_ids) SELECT ARRAY[(random()*5000)::bigint, (random()*5000)::bigint, (random()*5000)::bigint] FROM generate_series(1, 200000);`',
			'Add a B-tree and look at the plan: `CREATE INDEX acl_btree ON acl (allowed_user_ids); VACUUM ANALYZE acl;` then `EXPLAIN (ANALYZE, BUFFERS) SELECT count(*) FROM acl WHERE allowed_user_ids @> ARRAY[42]::bigint[];`',
			'Add a GIN index and run the same `EXPLAIN` again: `CREATE INDEX acl_gin ON acl USING gin (allowed_user_ids);`',
			'Write the same question another way: `EXPLAIN (ANALYZE, BUFFERS) SELECT count(*) FROM acl WHERE 42 = ANY(allowed_user_ids);`. Compare sizes with `SELECT pg_size_pretty(pg_relation_size(\'acl_btree\')), pg_size_pretty(pg_relation_size(\'acl_gin\'));`. Stop with `docker stop pg-lab`.'
		],
		done: [
			'With only the B-tree, the `@>` plan is a `Seq Scan on acl` with about 200,000 `Rows Removed by Filter`.',
			'With the GIN index, the same query shows `Bitmap Index Scan on acl_gin` and about a hundred buffers instead of about 2,000.',
			'The `= ANY` version is a Seq Scan (maybe parallel) even with `acl_gin` in place.'
		],
		solution: [
			'The B-tree sorts whole arrays, so it cannot find 42 inside `{3,7,42}`. The planner reads the table.',
			'GIN stores one entry per element. `@>` is in its array operator class, so the clause has the shape "indexed column, operator, value" and the index serves it.',
			'`42 = ANY(allowed_user_ids)` puts the column on the wrong side of an operator that is not in the class, so the planner ignores the GIN index without a warning. Write `@>` in your queries.'
		]
	},
	recall: {
		q: 'Which index type serves `WHERE allowed_user_ids @> ARRAY[42]`, and why does a B-tree on the column not help?',
		a: 'GIN, through its array operator class (`<@`, `@>`, `=`, `&&`). A B-tree sorts whole arrays, so it cannot find 42 inside `{3,7,42}`.'
	},
	sources: [
		{ title: 'PostgreSQL 18 docs, Index Types', url: 'https://www.postgresql.org/docs/18/indexes-types.html' },
		{ title: 'PostgreSQL 18 docs, GIN Indexes', url: 'https://www.postgresql.org/docs/18/gin.html' },
		{ title: 'PostgreSQL 18 docs, GiST Indexes', url: 'https://www.postgresql.org/docs/18/gist.html' },
		{ title: 'PostgreSQL 18 docs, BRIN Indexes', url: 'https://www.postgresql.org/docs/18/brin.html' },
		{ title: 'PostgreSQL 18 docs, Indexes and operator classes', url: 'https://www.postgresql.org/docs/18/indexes-opclass.html' }
	]
};
