const GITEA = 'https://github.com/go-gitea/gitea/blob/078198d38dc02a05156b817648817799f11ebea2';
const ISSUE = `${GITEA}/models/issues/issue.go`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'tables-and-keys',
	part: 'Data and questions',
	title: 'Tables, rows and keys',
	minutes: 10,
	hook: [
		'A customer signs up twice with the same email, once in lower case and once with a capital letter. Now there are **two accounts, two carts, and a support ticket** asking which one is real.',
		'Or the reverse: you used the email as the key, the customer changes it, and **every order, invoice and log line still points at the old one**.',
		'Both bugs come from one question you answer on day one, often without noticing: **what identifies a row?** A key is that answer, written down so the database can enforce it.'
	],
	terms: [
		{ term: 'Primary key', def: 'The column or columns that identify a row. PostgreSQL requires them to be unique and not null, and builds a unique B-tree index on them.' },
		{ term: 'Foreign key', def: 'A column whose value must match a key in another table. The database rejects an order that points at a customer who does not exist.' },
		{ term: 'Natural key', def: 'A key taken from the real world: an email, an ISBN, "issue 42 of this repo". People can change it, like when a customer changes their email.' },
		{ term: 'Surrogate key', def: 'A key with no meaning, made by the database: 1, 2, 3 from a sequence, or a random UUID. It never needs to change.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['repo[("repository: id = 7")]'],
				highlight: ['repo'],
				note: 'Gitea\'s repository and issue tables both start with an `ID int64` marked `pk autoincr`, a surrogate key. The number 7 stores no fact about the repo, so no fact has to stay the same for the key to stay valid.'
			},
			{
				add: ['issue[("issue: id = 9001, repo_id = 7, index = 42")]', 'issue -->|"repo_id"| repo'],
				highlight: ['issue'],
				note: 'The issue row has two keys: its own surrogate `id`, and the unique pair `(repo_id, index)`. The `index` is the "#42" in the URL. It is a natural key: people type it, link it, and expect it to stay the same.'
			},
			{
				add: ['url["URL: /owner/repo/issues/42"] -->|"GetIssueByIndex(7, 42)"| issue'],
				highlight: ['url'],
				note: 'People use the natural key. The [issue page handler](' + GITEA + '/routers/web/repo/issue.go#L183) calls `GetIssueByIndex` with the current repo\'s ID and the number from the URL. Inside the database, other rows point at the surrogate `issue.ID` instead.'
			},
			{
				add: ['counter[("issue_index: group_id = 7, max_index = 42")]', 'counter -.->|"next number, same transaction"| issue'],
				highlight: ['counter'],
				note: 'A sequence numbers rows across the whole table, so it cannot give each repo its own 1, 2, 3. Gitea keeps one counter row per repo and bumps it in the same transaction that inserts the issue.'
			},
			{
				add: ['comment[("comment: issue_id = 9001")]', 'comment -->|"issue_id"| issue'],
				highlight: ['comment'],
				note: 'A comment stores the surrogate `issue_id`, and never `(repo_id, index)`. Gitea\'s struct tag on `Comment.IssueID` asks for an index and no foreign key. So when an issue is deleted, Gitea\'s own code has to delete every child row.'
			}
		]
	},
	example: {
		title: 'models/issues/issue.go: Gitea\'s issue, with a surrogate key and a natural key',
		repo: 'go-gitea/gitea',
		url: `${ISSUE}#L54-L509`,
		lang: 'go',
		code: `type Issue struct {
	ID                int64                  \`xorm:"pk autoincr"\`
	RepoID            int64                  \`xorm:"INDEX UNIQUE(repo_index)"\`
	Repo              *repo_model.Repository \`xorm:"-"\`
	Index             int64                  \`xorm:"UNIQUE(repo_index)"\` // Index in one repository.
	PosterID          int64                  \`xorm:"INDEX"\`
…
func GetIssueByIndex(ctx context.Context, repoID, index int64) (*Issue, error) {
	if index < 1 {
		return nil, ErrIssueNotExist{}
	}
	issue, has, err := db.Get[Issue](ctx, builder.Eq{"repo_id": repoID, "\`index\`": index})
	if err != nil {
		return nil, err
	} else if !has {
		return nil, ErrIssueNotExist{0, repoID, index}
	}
	return issue, nil
}`,
		notes: [
			'Line 2 marks `ID` as `pk autoincr`, the surrogate key. Lines 3 and 5 put `RepoID` and `Index` in `UNIQUE(repo_index)`, a two-column unique constraint on the natural key. The database itself rejects a second issue numbered 42 in the same repo, whatever the Go code does.',
			'Line 12 is the lookup: `GetIssueByIndex` filters on `repo_id` and `index`. A unique index backs that pair, so the lookup reads a few index pages instead of the whole table.',
			'On PostgreSQL, Gitea gets the next number for a repo from [`postgresGetNextResourceIndex`](' + GITEA + '/models/db/index.go#L56-L67), an upsert: `INSERT ... ON CONFLICT (group_id) DO UPDATE SET max_index = %s.max_index+1 RETURNING max_index`. Its caller `GetNextResourceIndex` warns that "it must run in the same transaction where the resource is created", and `NewIssue` does that (both in the sources).',
			'With no foreign keys, Gitea cleans up by hand. [`deleteIssue`](' + GITEA + '/services/issue/issue.go#L199-L253) lists 18 deletes of child rows, all in one transaction. A few lines down, `DeleteOrphanedIssues` will "delete issues without a repo", rows that a foreign key would never let exist.'
		]
	},
	tradeoff: {
		gain: [
			'A primary key gives every row an address that never moves, and PostgreSQL indexes it for you.',
			'A foreign key makes "an order for a customer who does not exist" impossible, whatever code path writes it.',
			'A surrogate key lets the natural one change: a new email or a renamed repo is one UPDATE, not a rewrite of every table that points at it.',
			'A unique constraint on the natural key still catches the duplicate, even when the primary key is a meaningless number.'
		],
		cost: [
			'Two keys per table means two indexes to keep up to date on every insert.',
			'A foreign key does not index the referencing side. The docs: "the declaration of a foreign key constraint does not automatically create an index on the referencing columns", so a delete on the parent may scan the child table.',
			'Random UUIDs land at random places in a B-tree. RFC 9562: UUIDv4 has "poor database-index locality", so inserts "are performed at random locations". PostgreSQL 18 offers `uuidv7()`, which is time-ordered.',
			'A bigint from a sequence leaks order and volume (order 1041 came after order 1040), and the docs warn there may be "holes" or gaps.'
		]
	},
	task: {
		prompt: 'Sketch the keys for a small shop in `psql`: `customers`, `products` (each has a SKU printed on the box), `orders` and `order_items`. For each table, write the primary key, any foreign keys with their ON DELETE action, and any extra unique constraint. Then say which index PostgreSQL will not create for you.',
		hint: 'Give each table a meaningless key, then ask what real-world value must still never repeat. For ON DELETE, ask whether the child can exist without its parent.',
		answer: [
			'`customers`: `id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY`, plus `CREATE UNIQUE INDEX ON customers (lower(email))`, so "Ana@x.io" and "ana@x.io" collide.',
			'`products`: surrogate `id`, plus `sku text UNIQUE NOT NULL`. The SKU is the natural key people search by. It stays out of the foreign keys, so it can be corrected later.',
			'`orders`: surrogate `id`, `customer_id bigint NOT NULL REFERENCES customers ON DELETE RESTRICT`. An order is a record of a sale and must not vanish with an account.',
			'`order_items`: `order_id REFERENCES orders ON DELETE CASCADE`, `product_id REFERENCES products ON DELETE RESTRICT`, `PRIMARY KEY (order_id, product_id)`. A line is part of its order, as in the docs\' own example.',
			'Missing indexes: `orders.customer_id` and `order_items.product_id`. The primary keys and unique constraints are indexed, the referencing columns are not. Add `CREATE INDEX ON orders (customer_id)` and `CREATE INDEX ON order_items (product_id)`.'
		]
	},
	quiz: [
		{
			q: 'Gitea opens `/owner/repo/issues/42`. Which columns does it use to find the row?',
			options: [
				'`id`, because 42 is the primary key of the issue table',
				'`repo_id` and `index`, the pair covered by `UNIQUE(repo_index)`',
				'`index` alone, because issue numbers are unique across Gitea',
				'`poster_id` and `index`, because each user numbers their issues'
			],
			answer: 1,
			why: '`GetIssueByIndex(ctx, repoID, index)` filters on `repo_id` and `index`. The number in the URL is unique only inside one repository, so it needs the repo to identify a row. The surrogate `id` is what other tables store.'
		},
		{
			q: 'You add `order_id bigint REFERENCES orders` to `order_items`. Which index does PostgreSQL create for this constraint?',
			options: [
				'An index on `order_items.order_id`, so that joins and deletes stay fast',
				'A unique index on `order_items.order_id`, since it points at a primary key',
				'None for the foreign key; `orders.id` is already indexed as the primary key',
				'Both, one on each side, because the constraint is checked from both tables'
			],
			answer: 2,
			why: 'The referenced side must be a primary key or unique, so it always has an index. The referencing side gets none: the docs say "the declaration of a foreign key constraint does not automatically create an index on the referencing columns". Add it yourself if you delete parents or join often.'
		},
		{
			q: 'A table with 500 million rows uses a random UUIDv4 as primary key. Why do inserts get slower than with a bigint from a sequence?',
			options: [
				'Each new key lands at a random place in the B-tree, so more pages are touched',
				'PostgreSQL checks each new UUID against all others with a full table scan',
				'UUIDs are stored as 36-character text, so each index entry is much larger',
				'The uuid type cannot be indexed by a B-tree, so PostgreSQL uses a hash index'
			],
			answer: 0,
			why: 'RFC 9562: UUIDv4 values "are not close to each other in the index; thus, they require inserts to be performed at random locations". A sequence always adds at the right edge, and for time-ordered UUIDs like v7 "the new values are near each other in the index". B-trees come back on day 10.'
		}
	],
	recall: {
		q: 'Gitea stores issue #42 of repo 7 as row id 9001. Which key do comments store, and what stops a second #42 in repo 7?',
		a: 'Comments store the surrogate key, `issue_id = 9001`. The unique constraint `UNIQUE(repo_index)` on `(repo_id, index)` rejects a second issue 42 in repo 7.'
	},
	sources: [
		{ title: 'Gitea, models/db/index.go (GetNextResourceIndex)', url: `${GITEA}/models/db/index.go#L114` },
		{ title: 'Gitea, models/issues/issue_update.go (NewIssue)', url: `${GITEA}/models/issues/issue_update.go#L452-L461` },
		{ title: 'Gitea, services/issue/issue.go (DeleteOrphanedIssues)', url: `${GITEA}/services/issue/issue.go#L256-L257` },
		{ title: 'PostgreSQL docs, Constraints (primary and foreign keys)', url: 'https://www.postgresql.org/docs/current/ddl-constraints.html' },
		{ title: 'PostgreSQL docs, Identity Columns', url: 'https://www.postgresql.org/docs/current/ddl-identity-columns.html' },
		{ title: 'PostgreSQL docs, UUID Type', url: 'https://www.postgresql.org/docs/current/datatype-uuid.html' },
		{ title: 'PostgreSQL docs, UUID Functions', url: 'https://www.postgresql.org/docs/current/functions-uuid.html' },
		{ title: 'PostgreSQL docs, Serial Types', url: 'https://www.postgresql.org/docs/current/datatype-numeric.html#DATATYPE-SERIAL' },
		{ title: 'RFC 9562, Universally Unique IDentifiers (UUIDs)', url: 'https://www.rfc-editor.org/rfc/rfc9562' }
	]
};
