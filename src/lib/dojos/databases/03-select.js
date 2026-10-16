const EQB = 'https://github.com/miniflux/v2/blob/c317f84bc3779bc5d936b75408b631589983c81a/internal/storage/entry_query_builder.go';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'select',
	part: 'Data and questions',
	title: 'Asking with SELECT',
	minutes: 10,
	hook: [
		'You want the long articles in a feed reader. You write `SELECT title, reading_time * 60 AS seconds FROM entries WHERE seconds > 600`. PostgreSQL answers: `column "seconds" does not exist`, though the alias sits a few words earlier in the same query.',
		'PostgreSQL does not run the clauses in the order you type them. You write SELECT first, but the database computes it near the end, after it has already filtered the rows with WHERE. At the time WHERE runs, `seconds` has not been made yet.',
		'The real order is FROM, WHERE, then SELECT, then ORDER BY, then LIMIT. It explains three surprises: **why an alias works in ORDER BY but not in WHERE, why page 2 shows a row you saw on page 1, and why a total can ignore LIMIT**.'
	],
	terms: [
		{ term: 'SELECT list', def: 'The expressions after SELECT: the columns and computed values each output row will have. `AS` gives one a name, an alias.' },
		{ term: 'ORDER BY', def: 'The clause that sorts the result. Without it, PostgreSQL returns rows "in whatever order the system finds fastest to produce".' },
		{ term: 'Logical order', def: 'The order in which the clauses take effect, which the SELECT docs list step by step. It decides what each clause can see.' },
		{ term: 'Keyset pagination', def: 'Asking for "the next rows after the last one I saw" with a WHERE on the sort key, instead of skipping rows with OFFSET.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['from["FROM entries, JOIN feeds, users"]'],
				highlight: ['from'],
				note: 'The database starts from the tables in FROM, joined together. Every column of every joined table is available here, but no alias from the SELECT list exists yet. Joins get their own chapter tomorrow (day 4).'
			},
			{
				add: ['from --> where["WHERE e.user_id = $1 AND e.status = $2"]'],
				highlight: ['where'],
				note: 'WHERE drops rows. The docs: "all rows that do not satisfy the condition are eliminated from the output." WHERE sees table columns only, so `WHERE seconds > 600` fails. Write the expression `reading_time * 60 > 600` instead.'
			},
			{
				add: ['where --> list["SELECT list: e.title, f.title AS feed_title, count(*) OVER()"]'],
				highlight: ['list'],
				note: 'The SELECT list is computed for each row that passed WHERE. Aliases like `feed_title` exist from this step on. A window function such as `count(*) OVER()` also runs here, over all the surviving rows.'
			},
			{
				add: ['list --> order["ORDER BY published_at DESC, id DESC"]'],
				highlight: ['order'],
				note: 'ORDER BY runs after the SELECT list, so `ORDER BY seconds` works. The docs add one catch: an output column name "has to stand alone", so `ORDER BY seconds + 1` fails again.'
			},
			{
				add: ['order --> limit["LIMIT 100 OFFSET 200"]', 'limit --> out[("20 rows to the app")]'],
				highlight: ['limit'],
				note: 'LIMIT runs last, so it keeps the first rows of whatever order you asked for. With no unique order, the docs warn you "will get an unpredictable subset of the query\'s rows".'
			}
		]
	},
	example: {
		title: 'internal/storage/entry_query_builder.go: Miniflux builds one SELECT from small pieces',
		repo: 'miniflux/v2',
		url: `${EQB}#L294-L551`,
		lang: 'go',
		code: `// fetchEntries is the shared implementation for GetEntries and GetEntriesWithCount.
// When withCount is true, count(*) OVER() is included in the SELECT and the total
// count of matching rows is returned; otherwise the returned count is 0.
func (e *EntryQueryBuilder) fetchEntries(withCount bool) (model.Entries, int, error) {
	countColumn := ""
	if withCount {
		countColumn = "count(*) OVER(),"
	}

	query := \`
		SELECT
			\` + countColumn + \`
			e.id,
			e.user_id,
…
			entries e
		INNER JOIN
			feeds f ON f.id=e.feed_id
		INNER JOIN
			categories c ON c.id=f.category_id
		LEFT JOIN
			feed_icons fi ON fi.feed_id=f.id
		LEFT JOIN
			icons i ON i.id=fi.icon_id
		INNER JOIN
			users u ON u.id=e.user_id
		WHERE \` + e.buildCondition() + " " + e.buildSorting()

	rows, err := e.store.db.Query(query, e.args...)
…
func (e *EntryQueryBuilder) buildCondition() string {
	return strings.Join(e.conditions, " AND ")
}

func (e *EntryQueryBuilder) buildSorting() string {
	var parts string

	if len(e.sortExpressions) > 0 {
		parts += " ORDER BY " + strings.Join(e.sortExpressions, ", ")
	}

	if e.limit > 0 {
		parts += " LIMIT " + strconv.Itoa(e.limit)
	}

	if e.offset > 0 {
		parts += " OFFSET " + strconv.Itoa(e.offset)
	}

	return parts
…
// NewEntryQueryBuilder returns a new EntryQueryBuilder.
func (s *Storage) NewEntryQueryBuilder(userID int64) *EntryQueryBuilder {
	return &EntryQueryBuilder{
		store:      s,
		args:       []any{userID},
		conditions: []string{"e.user_id = $1"},
	}
}`,
		notes: [
			'Each `With...` method appends one condition to a list. Lines 31 to 33 join the list with `" AND "`, and line 27 puts it after WHERE. Line 57 starts the list with `e.user_id = $1`, so every query is about one user\'s entries.',
			'Conditions such as `BeforeEntryID` add `$2`, `$3` and pass the value separately. A sort column cannot be a parameter: the PREPARE docs define parameters as "values that are substituted into the statement". So [`WithSorting`](' + EQB + '#L191-L200) quotes the column name and accepts only ASC or DESC.',
			'Line 7 puts `count(*) OVER()` in the SELECT list, which is computed before the ORDER BY and LIMIT of lines 38 to 44. Every returned row carries the number of rows that passed WHERE, so one query gives a page and the total for the pager.',
			'Line 43 appends the LIMIT. [`WithLimit`](' + EQB + '#L202-L206) clamps a missing or huge limit to `model.MaxEntryLimit` "so callers cannot request an unbounded result set". OFFSET is supported too, but the docs warn: "a large OFFSET might be inefficient", because skipped rows are still computed.'
		]
	},
	tradeoff: {
		gain: [
			'One SELECT replaces a loop over rows: you say what you want, and the database finds the fastest way to produce it.',
			'Knowing the logical order explains most "column does not exist" errors before you search for them.',
			'ORDER BY with a unique tie-breaker makes paging stable: the same request returns the same rows.',
			'A window function like `count(*) OVER()` gives the page and the total in one round trip.'
		],
		cost: [
			'You write SELECT first, but it runs after WHERE, so `WHERE seconds > 600` fails with `column "seconds" does not exist`.',
			'You repeat expressions: WHERE needs `reading_time * 60` because it cannot see the alias. A subquery or a CTE can name it once, at the price of one more level.',
			'OFFSET gets slower the further you page, because "the rows skipped by an OFFSET clause still have to be computed inside the server".',
			'`count(*) OVER()` still counts every matching row, even if you only show 20 of them.'
		]
	},
	task: {
		prompt: 'Miniflux-style table: `entries(id bigint primary key, user_id bigint, title text, status text, published_at timestamptz, reading_time int)`. In `psql`, write: (1) user 7\'s 20 newest unread entries, stable across pages; (2) the next page after the last row you got, without OFFSET; (3) a fix for `SELECT title, reading_time * 60 AS seconds FROM entries WHERE seconds > 600 ORDER BY seconds DESC`.',
		hint: 'Several entries can share one `published_at`. What makes the order unique? And for page 2, which values of the last row do you still have?',
		answer: [
			'(1) `SELECT id, title, published_at FROM entries WHERE user_id = 7 AND status = \'unread\' ORDER BY published_at DESC, id DESC LIMIT 20;` The `id` breaks ties, so no row can move between pages.',
			'(2) Keep the last row\'s `published_at` and `id`, then add `AND (published_at, id) < ($1, $2)` with the same ORDER BY and LIMIT. In this keyset pagination, the row comparison matches the sort order, and it does not read the rows it skips.',
			'(3) Repeat the expression in WHERE and keep the alias in ORDER BY: `... WHERE reading_time * 60 > 600 ORDER BY seconds DESC`. WHERE runs before the alias exists, ORDER BY runs after.',
			'Check: run (3) with the alias in WHERE and read the error, `column "seconds" does not exist`. Then try `ORDER BY seconds + 0` and see that an alias must stand alone.'
		]
	},
	quiz: [
		{
			q: 'Why does `SELECT price * qty AS total FROM lines WHERE total > 100` fail in PostgreSQL?',
			options: [
				'WHERE is applied to input rows before the SELECT list computes `total`',
				'An alias can only be used once the query has a GROUP BY clause in it',
				'Aliases are only visible to the client, never inside the SQL statement',
				'`total` is a reserved word, so it needs double quotes to be used here'
			],
			answer: 0,
			why: 'In the logical order, WHERE removes rows first, then the SELECT list is computed. The docs say an output column\'s name can be used "in ORDER BY and GROUP BY clauses, but not in the WHERE or HAVING clauses".'
		},
		{
			q: 'Miniflux runs its entry query with `count(*) OVER()` and `LIMIT 100`. 730 entries pass the WHERE clause. What does the count column hold in each returned row?',
			options: [
				'100, because LIMIT is applied before the SELECT list is computed',
				'730, because the window function runs before ORDER BY and LIMIT',
				'1 to 100, because `count(*) OVER()` numbers the rows in order',
				'The number of rows in the whole entries table, for all users'
			],
			answer: 1,
			why: 'The SELECT list, window functions included, is computed for every row that passed WHERE. LIMIT comes last and only drops output rows, so one query can return a page and the total.'
		},
		{
			q: 'Page 1 is `ORDER BY published_at DESC LIMIT 20`, page 2 adds `OFFSET 20`. Many entries share a timestamp. A user sees one entry on both pages. What fixes it?',
			options: [
				'Wrapping the two pages in one transaction, so both see the same data',
				'Adding an index on `published_at`, so that the sort is done the same way',
				'Adding `id DESC` to the ORDER BY, so that every row has one fixed place',
				'Switching to `SELECT DISTINCT`, so that a row cannot appear twice'
			],
			answer: 2,
			why: 'Rows with equal sort keys may come back in any order, and that order can differ between two runs. The docs: use "an ORDER BY clause that constrains the result rows into a unique order". A unique tie-breaker like `id` does that.'
		}
	],
	recall: {
		q: 'In which order does PostgreSQL apply FROM, WHERE, SELECT, ORDER BY and LIMIT, and why does `WHERE seconds > 600` fail?',
		a: 'FROM, WHERE, the SELECT list, ORDER BY, then LIMIT. WHERE runs before the SELECT list creates the alias `seconds`, so it must repeat `reading_time * 60`. ORDER BY runs after and can use the alias.'
	},
	sources: [
		{ title: 'Miniflux, entry_query_builder.go (BeforeEntryID)', url: `${EQB}#L100-L106` },
		{ title: 'PostgreSQL docs, SELECT', url: 'https://www.postgresql.org/docs/current/sql-select.html' },
		{ title: 'PostgreSQL docs, Sorting Rows (ORDER BY)', url: 'https://www.postgresql.org/docs/current/queries-order.html' },
		{ title: 'PostgreSQL docs, LIMIT and OFFSET', url: 'https://www.postgresql.org/docs/current/queries-limit.html' },
		{ title: 'PostgreSQL docs, Window Function Processing', url: 'https://www.postgresql.org/docs/current/queries-table-expressions.html#QUERIES-WINDOW' },
		{ title: 'PostgreSQL docs, PREPARE', url: 'https://www.postgresql.org/docs/current/sql-prepare.html' }
	]
};
