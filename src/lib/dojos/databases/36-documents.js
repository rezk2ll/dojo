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
		'Your team needed a few settings per customer, and nobody wanted a migration. So you added one `settings` column of type `jsonb` and moved on. **It felt free.**',
		'Six months later, the billing page filters on `settings->>\'plan\' = \'pro\'` and reads every row of the table. One customer has `"plan": "Pro"`, another has `"plan": null`, a third has no `plan` key at all. **No constraint saw any of it**, because to the database the whole document is one value.',
		'JSONB is not a mistake. It is a real tool with a clear shape: **a binary document that PostgreSQL can search with a GIN index**, next to typed columns that keep their rules. The skill is knowing which fact goes where.'
	],
	terms: [
		{ term: 'json', def: 'Stores the exact input text. Keeps white space, key order and duplicate keys. Every function call parses it again.' },
		{ term: 'jsonb', def: 'Stores a parsed, binary form. Drops white space and duplicate keys, does not keep key order, and can be indexed.' },
		{ term: 'Containment (@>)', def: '`a @> b` is true when every key and value of `b` is found in `a`, at the same place. The main operator a GIN index on jsonb can answer.' },
		{ term: 'jsonb_ops', def: 'The default GIN operator class. One index entry per key and per value. Supports `@>` and the key-exists operators `?`, `?|`, `?&`.' },
		{ term: 'jsonb_path_ops', def: 'A smaller GIN operator class. One hashed entry per path to a value. Supports `@>`, `@?` and `@@`, but not `?`.' },
		{ term: '->> and ->', def: '`->` returns a field as jsonb, `->>` returns it as text. A plain GIN index on the column does not help a filter on `doc->>\'key\'`.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['app["App sends JSON text"] --> parse["Parse once on input"]', 'parse --> row[("Row: typed columns + jsonb detail")]'],
				highlight: ['parse', 'row'],
				note: '**Parse once, read many times.** The docs say `jsonb` is "slightly slower to input due to added conversion overhead, but significantly faster to process, since no reparsing is needed". The document sits in the row next to ordinary columns, and a large one is moved to TOAST like any big value (day 9).'
			},
			{
				add: ['row --> gin["GIN index, jsonb_path_ops: one hash per path to a value"]'],
				highlight: ['gin'],
				note: '**An inverted index over the document.** A GIN index (day 11) stores entries that point back to rows. With `jsonb_path_ops`, `{"foo": {"bar": "baz"}}` becomes one hash of `foo`, `bar` and `baz` together. The index is small and very specific, but it cannot tell whether a key exists on its own.'
			},
			{
				add: ['q1["WHERE detail @> type FeatureFlag"] -->|"index scan"| gin'],
				highlight: ['q1'],
				note: '**Containment uses the index.** A query of the shape `detail @> \'{"type": "FeatureFlag"}\'` turns into hashes, looks them up in GIN, then rechecks the rows it found. This is the query the index was built for.'
			},
			{
				add: ['q2["WHERE detail->>name = x"] -.->|"no index, reads every row"| row'],
				highlight: ['q2'],
				note: '**A key lookup does not.** The docs explain that an operator only uses the index when it is "applied directly to the indexed column". `detail->>\'name\' = \'x\'` compares a text value, so the plan falls back to a sequential scan unless you add an expression index on exactly that expression.'
			},
			{
				add: ['col["Hot key promoted to a column"] -->|"B-tree, NOT NULL, CHECK"| row'],
				highlight: ['col'],
				note: '**When a column beats a key.** If you filter, sort, join or enforce a rule on a value, give it a real column. It gets a type, a NOT NULL, a foreign key (day 22) and a plain B-tree. Keep in jsonb only the part whose shape really varies.'
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
			'**Columns for what the app filters on.** `team_id`, `scope`, `item_id`, `activity` and `created_at` are typed columns with B-tree indexes and a CHECK constraint. Only `detail`, whose shape changes with each scope, is a document. Django maps `JSONField` to [`jsonb`](' + DJANGO + '/django/db/backends/postgresql/base.py#L123) on PostgreSQL.',
			'**The opclass is a choice.** The comment picks `jsonb_path_ops` because no query uses `?`. That matches the [docs](' + JSON_DOC + '#L527-L537): a `jsonb_path_ops` index "is usually much smaller than a `jsonb_ops` index over the same data, and the specificity of searches is better".',
			'**The known blind spot.** The comment warns that `detail @> \'{"changes": []}\'` falls back to a full index scan. The [docs](' + JSON_DOC + '#L572-L577) say the same: `jsonb_path_ops` "produces no index entries for JSON structures not containing any values", and such a search "will require a full-index scan, which is quite slow".',
			'**The index was built online.** Migration 0854 creates it with raw [`CREATE INDEX CONCURRENTLY ... USING GIN (detail jsonb_path_ops)`](' + PH + '/posthog/migrations/0854_add_activitylog_detail_gin_path_ops_index.py#L28-L33), so writes to the log keep flowing while it builds (day 26). The partial index `idx_alog_org_scope_created_at` above is built the same way, with [`WHERE detail IS NOT NULL AND jsonb_typeof(detail) = \'object\'`](' + PH + '/posthog/migrations/0850_add_activitylog_org_scope_created_at.py#L26-L31).'
		]
	},
	tradeoff: {
		gain: [
			'Fields that differ per row (an audit diff, a webhook payload, per-plugin settings) fit in one column with no migration per new key.',
			'A GIN index answers containment queries over any key in the document, without one index per field.',
			'The document is read back in one piece, with no join, which suits data the app always loads whole.'
		],
		cost: [
			'No types, no NOT NULL, no foreign key inside the document. Bad values arrive silently unless you add CHECK constraints or validate in the app.',
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
			why: 'Filtering, sorting and a rule the database enforces are all things a column does well and a key inside a document does not. App-side validation alone can be bypassed and can race (day 22).'
		}
	],
	takeaway: 'Use jsonb for the part of a row whose shape really varies, index it with GIN for containment, and give every value you filter, sort or enforce its own typed column.',
	sources: [
		{ title: 'PostgreSQL docs, JSON Types', url: 'https://www.postgresql.org/docs/current/datatype-json.html' },
		{ title: 'PostgreSQL docs, JSON Functions and Operators', url: 'https://www.postgresql.org/docs/current/functions-json.html' },
		{ title: 'PostgreSQL docs, Indexes on Expressions', url: 'https://www.postgresql.org/docs/current/indexes-expressional.html' },
		{ title: 'Django docs, JSONField', url: 'https://docs.djangoproject.com/en/stable/ref/models/fields/#jsonfield' }
	]
};
