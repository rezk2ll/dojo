const PG = 'https://github.com/postgres/postgres/blob/26bd08fb5c069fbdf55867adc398cfca0f55d5c8';
const JSON_DOC = `${PG}/doc/src/sgml/json.sgml`;
const PH = 'https://github.com/PostHog/posthog/blob/c105d57fd7fc59f40458556be6f5171e29e9adfe';
const DJANGO = 'https://github.com/django/django/blob/d430084791a61b31cecec132bce3dca19194f7f2';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'documents',
	part: 'Beyond one server',
	title: 'Documents and JSONB',
	minutes: 10,
	hook: [
		'Your team needed a few settings per customer, and nobody wanted a migration. So you added one `settings` column of type `jsonb` and moved on.',
		'Six months later, the billing page filters on `settings->>\'plan\' = \'pro\'` and reads every row of the table. One customer has `"plan": "Pro"`, another has `"plan": null`, a third has no `plan` key at all. **No constraint caught any of it**, because the database sees the whole document as one value.',
		'PostgreSQL stores a `jsonb` value as a binary document that it can search with a GIN index. Typed columns next to it keep their types and constraints. A value you filter, sort or constrain goes in a column, and the part whose shape varies goes in the document.'
	],
	terms: [
		{ term: 'jsonb', def: 'Stores a parsed, binary form. Drops white space and duplicate keys, does not keep key order, and can be indexed. The `json` type keeps the exact input text instead.' },
		{ term: 'Containment (@>)', def: '`a @> b` is true when every key and value of `b` is found in `a`, at the same place. The main operator a GIN index on jsonb can answer.' },
		{ term: 'jsonb_path_ops', def: 'A smaller GIN operator class. One hashed entry per path to a value. Supports `@>`, `@?` and `@@`, but not `?`. The default class, `jsonb_ops`, also supports `?`.' },
		{ term: '->> and ->', def: '`->` returns a field as jsonb, `->>` returns it as text. A plain GIN index on the column does not help a filter on `doc->>\'key\'`.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['app["App sends JSON text"] --> parse["Parse once on input"]', 'parse --> row[("Row: typed columns + jsonb detail")]'],
				highlight: ['parse', 'row'],
				note: 'PostgreSQL parses the JSON text once, on input. The docs say `jsonb` is "slightly slower to input due to added conversion overhead, but significantly faster to process, since no reparsing is needed". The document sits in the row next to ordinary columns, and a large one is moved to TOAST like any big value (day 9).'
			},
			{
				add: ['row --> gin["GIN index, jsonb_path_ops: one hash per path to a value"]'],
				highlight: ['gin'],
				note: 'A GIN index (day 11) is an inverted index: it stores entries that point back to rows. With `jsonb_path_ops`, `{"foo": {"bar": "baz"}}` gives a single entry, one hash of the path `foo.bar.baz`. The index is small and very specific, but it cannot tell whether a key exists on its own.'
			},
			{
				add: ['q1["WHERE detail @> type FeatureFlag"] -->|"index scan"| gin'],
				highlight: ['q1'],
				note: 'A containment query uses the index. PostgreSQL hashes the paths in `detail @> \'{"type": "FeatureFlag"}\'`, looks the hashes up in GIN, then rechecks the rows it found.'
			},
			{
				add: ['q2["WHERE detail->>name = x"] -.->|"no index, reads every row"| row'],
				highlight: ['q2'],
				note: 'A key lookup with `->>` does not use the index. The docs explain that an operator only uses the index when it is "applied directly to the indexed column". `detail->>\'name\' = \'x\'` compares a text value, so the plan falls back to a sequential scan unless you add an expression index on exactly that expression.'
			},
			{
				add: ['col["Hot key promoted to a column"] -->|"B-tree, NOT NULL, CHECK"| row'],
				highlight: ['col'],
				note: 'If you filter, sort, join or enforce a rule on a value, give it a real column. It gets a type, a NOT NULL, a foreign key (day 22) and a plain B-tree. Keep in jsonb only the part whose shape really varies.'
			}
		]
	},
	example: {
		title: 'posthog/models/activity_logging/activity_log.py: typed columns around one jsonb document',
		repo: 'PostHog/posthog',
		url: `${PH}/posthog/models/activity_logging/activity_log.py#L195-L294`,
		lang: 'python',
		code: `class ActivityLog(UUIDTModel):
    class Meta:
        constraints = [
            models.CheckConstraint(
                name="must_have_team_or_organization_id",
                condition=models.Q(team_id__isnull=False) | models.Q(organization_id__isnull=False),
            ),
        ]
        indexes = [
            models.Index(fields=["team_id", "scope", "item_id"]),
            models.Index(
                fields=["organization_id", "scope", "-created_at"],
                name="idx_alog_org_scope_created_at",
                condition=models.Q(detail__isnull=False) & models.Q(detail__jsonb_typeof="object"),
            ),
            models.Index(
                fields=["organization_id"],
                name="idx_alog_org_detail_exists",
                condition=models.Q(detail__isnull=False) & models.Q(detail__jsonb_typeof="object"),
            ),
            # Serves whole-column containment (\`detail @> ...\`), the only detail lookup an index
            # can answer. Key-path lookups and the \`detail::text\` search are not GIN-servable
            # under any opclass. \`jsonb_path_ops\` stores one hash per root-to-leaf path, so it is
            # smaller and cheaper to maintain than \`jsonb_ops\`, whose only extra operators are the
            # key-existence family (\`?\`, \`?|\`, \`?&\`) that no query path uses. It also stores no
            # entry for a JSON structure that holds no scalar, so containment against an empty
            # object or array (\`detail @> '{"changes": []}'\`) falls back to a full index scan.
            GinIndex(
                name="idx_alog_detail_gin_path_ops",
                fields=["detail"],
                opclasses=["jsonb_path_ops"],
            ),
…
    activity = models.fields.CharField(max_length=79, null=False)
    # if scoped to a model this activity log holds the id of the model being logged
    # if not scoped to a model this log might not hold an item_id
    # this might be a numerical id, short id, or UUID, so each will be converted to string
    # it will be used to lookup rows with exactly matching item_ids
    # it probably only needs to be 36 characters in order to hold a GUID
    # but 72 may be useful to avoid a migration in future
    item_id = models.fields.CharField(max_length=72, null=True)
    # e.g. FeatureFlags - this will often be the name of a model class
    scope = models.fields.CharField(max_length=79, null=False)
    detail = models.JSONField(encoder=ActivityDetailEncoder, null=True)
    created_at = models.DateTimeField(default=timezone.now)`,
		notes: [
			'Lines 3 to 10 add a CHECK constraint and a B-tree on `team_id`, `scope` and `item_id`, and lines 34 to 45 declare `activity`, `scope` and `created_at` as typed columns. Only `detail` (line 44), whose shape changes with each scope, is a document. Django maps `JSONField` to [`jsonb`](' + DJANGO + '/django/db/backends/postgresql/base.py#L123) on PostgreSQL.',
			'The comment on lines 21 to 27 picks `jsonb_path_ops` because no query uses `?`. That matches the [docs](' + JSON_DOC + '#L527-L537): a `jsonb_path_ops` index "is usually much smaller than a `jsonb_ops` index over the same data, and the specificity of searches is better".',
			'Lines 25 to 27 warn that `detail @> \'{"changes": []}\'` falls back to a full index scan. The [docs](' + JSON_DOC + '#L572-L577) say the same: `jsonb_path_ops` "produces no index entries for JSON structures not containing any values", and such a search "will require a full-index scan, which is quite slow".',
			'Migration 0854 builds the GIN index of lines 28 to 32 with raw [`CREATE INDEX CONCURRENTLY ... USING GIN (detail jsonb_path_ops)`](' + PH + '/posthog/migrations/0854_add_activitylog_detail_gin_path_ops_index.py#L28-L33), so writes to the log keep flowing while it builds (day 26). Migration 0850 (in the sources) builds the partial index of lines 11 to 15 the same way, with `WHERE detail IS NOT NULL AND jsonb_typeof(detail) = \'object\'`.'
		]
	},
	tradeoff: {
		gain: [
			'Fields that differ per row (an audit diff, a webhook payload, per-plugin settings) fit in one column with no migration per new key.',
			'A GIN index answers containment queries over any key in the document, without one index per field.',
			'The document is read back in one piece, with no join, which suits data the app always loads whole.'
		],
		cost: [
			'The database checks no type, NOT NULL or foreign key inside the document. A `"plan": "Pro"` is stored without an error unless you add CHECK constraints or validate in the app.',
			'A plain GIN index does not serve `->>` filters, sorting or ranges. Each hot key needs its own expression index or its own column.',
			'Updating one key writes a new version of the whole row, and the docs warn that "any update acquires a row-level lock on the whole row" (days 18 and 20).',
			'Keys are repeated in every document, so a table of many small documents is larger than the same data in columns.'
		]
	},
	task: {
		prompt: 'Table `customers(id bigint, settings jsonb)`. The billing page runs `WHERE settings->>\'plan\' = \'pro\'` and is slow. Support also searches for customers whose settings contain `{"beta": true}`. Write the indexes or schema changes you would make, and say which query each one serves.',
		hint: 'Ask, for each query, whether its operator is applied to the column itself or to an expression. Then ask whether `plan` deserves rules a document cannot give it.',
		answer: [
			'For the support search, `CREATE INDEX ON customers USING GIN (settings jsonb_path_ops)`. Rewrite the query as `settings @> \'{"beta": true}\'` so it is a containment on the indexed column.',
			'For billing, the GIN index does not help: `settings->>\'plan\'` is an expression. Quick fix: `CREATE INDEX ON customers ((settings->>\'plan\'))`, a B-tree on exactly that expression.',
			'Better fix: `plan` is filtered on and has a fixed set of values, so promote it. Add `plan text NOT NULL DEFAULT \'free\' CHECK (plan IN (\'free\', \'pro\', \'team\'))`, backfill it from `settings` in batches, switch the code, then remove the key (expand and contract).',
			'Check with `EXPLAIN` (day 12) that each query now shows an index scan or a bitmap index scan on the index you meant.'
		],
		steps: [
			{
				title: 'Read each query',
				questions: [
					{ q: 'How do you write the support search for settings containing `{"beta": true}`?', options: ['`settings @> \'{"beta": true}\'`', '`settings ? \'beta\'`', '`settings::text LIKE \'%beta%\'`', '`settings->\'beta\' IS NOT NULL`'], answer: 0, why: 'Containment checks the key and its value, at that place. `?` and `IS NOT NULL` only check that the key is there.' },
					{ q: 'What does the billing filter `settings->>\'plan\' = \'pro\'` compare?', options: ['The whole document with a jsonb value', 'A text value pulled out of the column by an expression', 'A typed `plan` column', 'The keys of the document'], answer: 1, why: '`->>` returns the field as text. The comparison is on that expression, not on the column itself.' },
					{ q: 'Why does the billing page read every row of the table today?', options: ['`pro` is too common for an index', 'jsonb values cannot be filtered', 'No index stores the value of `settings->>\'plan\'`', 'GIN indexes stop working on large tables'], answer: 2, why: 'With nothing indexed on that expression, the plan falls back to a sequential scan.' },
					{ q: 'How did a customer end up with `"plan": "Pro"`?', options: ['jsonb changes the case of values', 'Duplicate keys were merged on input', 'The GIN index rewrote the value', 'The database checks no type or rule inside the document'], answer: 3, why: 'PostgreSQL sees the document as one value. No CHECK or NOT NULL reaches the keys inside it unless you add one.' }
				]
			},
			{
				title: 'Index the support search',
				questions: [
					{ q: 'Which index serves `settings @> \'{"beta": true}\'`?', options: ['`CREATE INDEX ON customers USING GIN (settings jsonb_path_ops)`', '`CREATE INDEX ON customers (settings)`, a B-tree', '`CREATE INDEX ON customers ((settings->>\'beta\'))`', '`CREATE INDEX ON customers USING HASH (settings)`'], answer: 0, why: 'A GIN index on the column answers containment over any key in the document.' },
					{ q: 'Why pick `jsonb_path_ops` over the default `jsonb_ops`?', options: ['Only `jsonb_path_ops` supports `@>`', 'It is usually much smaller and more specific, and no query here needs `?`', 'It also serves `->>` filters', 'It needs no recheck of the rows'], answer: 1, why: 'The docs say a `jsonb_path_ops` index is usually much smaller over the same data. Its one limit, no `?`, costs nothing here.' },
					{ q: 'What can a `jsonb_path_ops` index not answer?', options: ['`@>`', '`@?`', '`?`, whether a key exists on its own', '`@@`'], answer: 2, why: 'It stores one hash per path to a value, so it cannot tell whether a key exists by itself.' },
					{ q: 'How does PostgreSQL answer the support search with that index?', options: ['It reads every document and parses the JSON', 'It walks a B-tree of text values', 'It reads a cached copy of the last result', 'It hashes the paths in the query, looks them up in GIN, then rechecks the rows'], answer: 3, why: 'GIN is an inverted index: entries point back to rows, and the rows found are rechecked.' }
				]
			},
			{
				title: 'Fix the billing filter',
				questions: [
					{ q: '`customers` takes writes all day. How do you build the billing index on `((settings->>\'plan\'))` without blocking them?', options: ['`CREATE INDEX ON customers ((settings->>\'plan\'))` inside a transaction', '`CREATE INDEX CONCURRENTLY ON customers ((settings->>\'plan\'))`', '`REINDEX TABLE customers` first', '`VACUUM FULL customers`, then the index'], answer: 1, why: 'A concurrent build lets writes flow while it runs (day 26), which is how PostHog builds its GIN and partial indexes.' },
					{ q: 'A customer upgrades, and the app changes only the `plan` key inside `settings`. What does PostgreSQL write?', options: ['Only the changed key, in place', 'A new entry in the expression index, and nothing in the table', 'A new version of the whole row, under a lock on the whole row', 'Nothing until the next `VACUUM`'], answer: 2, why: 'A jsonb value is rewritten whole. The docs warn that "any update acquires a row-level lock on the whole row".' },
					{ q: 'Which queries can that expression index serve?', options: ['Any filter on `settings`', 'Only filters on exactly `settings->>\'plan\'`', 'Containment queries with `@>`', 'Any key read with `->>`'], answer: 1, why: 'It indexes one expression. Each hot key needs its own, which is a sign the key wants a column.' },
					{ q: 'Which rewrite would let the GIN index from step 2 serve billing instead?', options: ['`settings->\'plan\' = \'"pro"\'`', '`lower(settings->>\'plan\') = \'pro\'`', '`settings::text LIKE \'%"pro"%\'`', '`settings @> \'{"plan": "pro"}\'`'], answer: 3, why: 'Containment is applied to the column itself, so the GIN index can answer it.' }
				]
			},
			{
				title: 'Promote `plan` to a column',
				questions: [
					{ q: 'Once `plan` has its own column, what stays in `settings`?', options: ['The keys whose shape varies per customer, such as `beta`', 'Nothing: drop the `settings` column', 'A copy of `plan`, kept in sync for safety', 'Every key, so the old code keeps working for good'], answer: 0, why: 'Keep in jsonb only the part whose shape varies. The support search on `{"beta": true}` still runs on the GIN index.' },
					{ q: 'Which column definition stops `"Pro"` and missing plans?', options: ['`plan jsonb`', '`plan text`, validated by the app', '`plan text NOT NULL DEFAULT \'free\' CHECK (plan IN (\'free\', \'pro\', \'team\'))`', '`plan text UNIQUE`'], answer: 2, why: 'NOT NULL, a default and a CHECK are applied by the database on every write. App checks alone can be bypassed.' },
					{ q: 'In which order do you make the change?', options: ['Remove the key, then add the column', 'Add the column, backfill in batches, switch the code, then remove the key', 'Switch the code first, then add the column', 'Add, backfill and remove in one long transaction'], answer: 1, why: 'Expand and contract: old and new code both work at every step, and the backfill in batches keeps locks short.' },
					{ q: 'How do you check that each query uses the index you meant?', options: ['Count the rows it returns', 'Time it on a laptop', 'Read the index size', '`EXPLAIN` shows an index scan or bitmap index scan on it'], answer: 3, why: '`EXPLAIN` (day 12) names the index in the plan. A fast run on small data proves nothing.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'You insert `{"a": 1, "a": 2}` into a `jsonb` column and read it back. What do you get?',
			options: [
				'`{"a": 2}`, because jsonb keeps only the last value of a duplicate key',
				'`{"a": 1}`, because jsonb keeps only the first value of a duplicate key',
				'`{"a": 1, "a": 2}`, because jsonb keeps the input text exactly as sent',
				'An error, because jsonb rejects any document with a duplicate key'
			],
			answer: 0,
			why: 'The docs: jsonb "does not keep duplicate object keys. If duplicate keys are specified in the input, only the last value is kept." It is the `json` type that keeps the text exactly, duplicates included.'
		},
		{
			q: 'A table has `CREATE INDEX ON events USING GIN (data)`. Which filter can use that index?',
			options: [
				'`WHERE data->>\'country\' = \'FR\'`',
				'`WHERE data @> \'{"country": "FR"}\'`',
				'`WHERE (data->\'country\')::text = \'"FR"\'`',
				'`WHERE data::text LIKE \'%FR%\'`'
			],
			answer: 1,
			why: 'The GIN operator classes for jsonb serve operators applied to the indexed column itself, such as `@>`. The other filters compare an expression built from the column, which this index does not store.'
		},
		{
			q: 'Your app filters on `status`, sorts by it, and must never store an unknown value. Where should `status` live?',
			options: [
				'In the jsonb document, with a GIN index using jsonb_ops',
				'In the jsonb document, with a GIN index using jsonb_path_ops',
				'In its own typed column, with a CHECK constraint and a B-tree',
				'In the jsonb document, validated by the app before each write'
			],
			answer: 2,
			why: 'A typed column gets a B-tree for filtering and sorting, and a CHECK constraint that the database applies on every write. App-side validation alone can be bypassed and can race (day 22).'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Index a local `customers.settings` jsonb column, watch which filters use which index, and promote `plan` to a checked column.',
		steps: [
			'Start PostgreSQL and open `psql`: `docker run -d --name doc-lab -e POSTGRES_PASSWORD=lab postgres:16`, wait a few seconds, then `docker exec -it doc-lab psql -U postgres`.',
			'Load 200,000 customers, then break two of them the way the hook describes: `CREATE TABLE customers (id bigint PRIMARY KEY, settings jsonb); INSERT INTO customers SELECT g, jsonb_build_object(\'plan\', (ARRAY[\'free\',\'free\',\'free\',\'pro\',\'team\'])[1 + g % 5], \'beta\', g % 50 = 0, \'theme\', \'dark\') FROM generate_series(1, 200000) g; UPDATE customers SET settings = settings || \'{"plan": "Pro"}\' WHERE id = 7; UPDATE customers SET settings = settings - \'plan\' WHERE id = 8;`',
			'Add the GIN index, named `customers_settings_gin`, and run `ANALYZE customers;`. Then `EXPLAIN (COSTS OFF)` both queries: `SELECT id FROM customers WHERE settings @> \'{"beta": true}\';` and `SELECT id FROM customers WHERE settings->>\'plan\' = \'pro\';`.',
			'Add the expression index for `plan`, `ANALYZE` again, and explain the billing query again. Then look at the data: `SELECT settings->>\'plan\' AS plan, count(*) FROM customers GROUP BY 1 ORDER BY 1;`.',
			'Promote `plan`: add the checked column, then backfill with `UPDATE customers SET plan = settings->>\'plan\' WHERE settings->>\'plan\' IS NOT NULL;`. Read the error, fix the backfill, add a B-tree on `plan`, and try `INSERT INTO customers (id, settings, plan) VALUES (0, \'{}\', \'Pro\');`.',
			'When you are done: `docker rm -f doc-lab`.'
		],
		done: [
			'The `@>` plan shows `Bitmap Index Scan on customers_settings_gin`.',
			'Before the expression index, the `->>` plan shows a `Seq Scan` with a `Filter`. After it, it shows a bitmap index scan on the expression index.',
			'The `GROUP BY` lists `Pro` and an empty plan next to `free`, `pro` and `team`.',
			'The first backfill fails with `violates check constraint "customers_plan_check"` on row 7, and the insert of `\'Pro\'` fails the same way.',
			'`EXPLAIN SELECT id FROM customers WHERE plan = \'pro\';` uses the B-tree on `plan`.'
		],
		solution: [
			'`CREATE INDEX customers_settings_gin ON customers USING GIN (settings jsonb_path_ops);` and `CREATE INDEX customers_plan_expr ON customers ((settings->>\'plan\'));`',
			'`ALTER TABLE customers ADD COLUMN plan text NOT NULL DEFAULT \'free\' CHECK (plan IN (\'free\', \'pro\', \'team\'));` Row 8, with no key, keeps the default `free`.',
			'Fixed backfill: `UPDATE customers SET plan = lower(settings->>\'plan\') WHERE settings->>\'plan\' IS NOT NULL;`, then `CREATE INDEX ON customers (plan);`. On a real table, run the backfill in batches.',
			'The bad values were in the document all along. The column turned them into errors on the first write.'
		]
	},
	recall: {
		q: 'Which jsonb filter can a GIN index on the column serve, and what does a `->>` filter need instead?',
		a: 'Containment applied to the column itself, like `settings @> \'{"beta": true}\'`. A `->>` filter needs an expression index on that exact expression, or the key moved to a typed column with a B-tree.'
	},
	sources: [
		{ title: 'PostgreSQL docs, JSON Types', url: 'https://www.postgresql.org/docs/current/datatype-json.html' },
		{ title: 'PostgreSQL docs, JSON Functions and Operators', url: 'https://www.postgresql.org/docs/current/functions-json.html' },
		{ title: 'PostgreSQL docs, Indexes on Expressions', url: 'https://www.postgresql.org/docs/current/indexes-expressional.html' },
		{ title: 'Django docs, JSONField', url: 'https://docs.djangoproject.com/en/stable/ref/models/fields/#jsonfield' },
		{ title: 'PostHog, migration 0850 (partial index on activity log)', url: `${PH}/posthog/migrations/0850_add_activitylog_org_scope_created_at.py#L26-L31` }
	]
};
