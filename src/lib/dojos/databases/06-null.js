const DJANGO = 'https://github.com/django/django/blob/d430084791a61b31cecec132bce3dca19194f7f2';
const QUERY = `${DJANGO}/django/db/models/sql/query.py`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'null',
	part: 'Data and questions',
	title: 'NULL in SQL: comparisons, NOT IN and unique keys',
	minutes: 10,
	hook: [
		'Your dashboard lists the projects that are not archived: `WHERE status <> \'archived\'`. A customer says three of their projects are missing. They are not archived. They never had a status at all: the column is NULL.',
		'In SQL, **NULL means "unknown"**. Is an unknown status different from `\'archived\'`? Nobody knows, so the answer is NULL too. And `WHERE` keeps a row only when the answer is true.',
		'Your ORM handles NULL in some places, and not always the same way raw SQL does. Two queries drop rows this way: `= NULL` and `NOT IN`.'
	],
	terms: [
		{ term: 'NULL', def: 'A marker for a missing or unknown value. It is not 0, the empty string or false.' },
		{ term: 'Three-valued logic', def: 'SQL conditions return true, false or NULL (unknown). `NULL AND false` is false, `NULL OR true` is true, almost everything else with a NULL is NULL.' },
		{ term: 'IS DISTINCT FROM', def: 'A comparison that treats NULL like an ordinary value. It always returns true or false, never NULL.' },
		{ term: 'NULLS NOT DISTINCT', def: 'A clause on a unique index or constraint (PostgreSQL 15 and later) that makes two NULLs count as equal, so only one is allowed.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['row["Row: status is NULL"] --> cmp["status != \'archived\'"]'],
				highlight: ['row', 'cmp'],
				note: 'A comparison with NULL gives NULL. The PostgreSQL docs: "7 = NULL yields null, as does 7 <> NULL". The same goes for `<`, `>` and `!=`. So `x = NULL` is NULL even when `x` is NULL, and only `x IS NULL` tests for a missing value.'
			},
			{
				add: ['cmp -->|"unknown"| where["WHERE keeps only true"]', 'where --> drop["Row dropped"]'],
				highlight: ['where', 'drop'],
				note: 'WHERE keeps a row only when the condition is true. The docs: "If the result of the condition is true, the row is kept in the output table, otherwise (i.e., if the result is false or null) it is discarded." So the project with no status disappears from both `status = \'archived\'` and `status != \'archived\'`.'
			},
			{
				add: ['notin["id NOT IN (1, NULL)"] -->|"never true"| where'],
				highlight: ['notin'],
				note: '`id NOT IN (1, NULL)` means `id <> 1 AND id <> NULL`. The second half is always NULL, so the whole condition is never true. With one NULL in the subquery, **NOT IN returns no rows at all**. `NOT EXISTS` still returns the rows that have no match when the subquery holds a NULL.'
			},
			{
				add: ['fix["IS NULL, IS DISTINCT FROM, COALESCE"] -->|"always true or false"| keep["Row kept"]'],
				highlight: ['fix', 'keep'],
				note: '`status IS DISTINCT FROM \'archived\'` is true for the NULL row. `COALESCE(status, \'none\')` returns its first argument that is not NULL, so it replaces the NULL with `\'none\'` before you compare. `status IS NULL` tests for the missing value directly. None of the three ever returns NULL.'
			},
			{
				add: ['uniq[("unique (user_id, team_id)")] -->|"(7, NULL) twice: both accepted"| dup["Duplicate rows"]', 'uniq -.->|"NULLS NOT DISTINCT"| one["Second insert rejected"]'],
				highlight: ['uniq', 'dup', 'one'],
				note: 'A unique index accepts many NULLs. By default "null values in a unique column are not considered equal, allowing multiple nulls in the column". So `(7, NULL)` can be stored twice. Since PostgreSQL 15, `NULLS NOT DISTINCT` makes the second insert fail.'
			}
		]
	},
	example: {
		title: 'django/db/models/sql/query.py: how the ORM makes NULL behave like Python None',
		repo: 'django/django',
		url: `${QUERY}#L1440-L1669`,
		lang: 'python',
		code: `        lookup = lookup_class(lhs, rhs)
        # Interpret '__exact=None' as the sql 'is NULL'; otherwise, reject all
        # uses of None as a query value unless the lookup supports it.
        if lookup.rhs is None and not lookup.can_use_none_as_rhs:
            if lookup_name not in ("exact", "iexact"):
                raise ValueError("Cannot use None as a query value")
            return lhs.get_lookup("isnull")(lhs, True)
…
        require_outer = False
        if lookup_type == "isnull":
            # Both \`NOT (field IS NOT NULL)\` and \`field IS NULL\` require an
            # OUTER JOIN to effectively include related \`NULL\` values.
            # Otherwise an INNER JOIN can be used as it excludes them.
            require_outer = (
                condition.rhs is False if current_negated else condition.rhs is True
            )
        elif current_negated and condition.rhs is not None:
            require_outer = True
            # The condition added below will be SQL like this:
            # \`NOT (col IS NOT NULL)\`, where the first NOT is added in
            # upper layers of code. The reason for addition is that if col
            # \`IS NULL\`, then \`col != someval\` will result in SQL "unknown"
            # which isn't the same as in Python. The Python None handling
            # is wanted, and it can be achieved by
            # \`(col != someval OR col IS NULL)\` which is equivalent to
            # \`NOT (col = someval AND col IS NOT NULL)\`. The second form is
            # required here as the condition is negated per \`current_negated\`.
            if (
                self.is_nullable(targets[0])
                or self.alias_map[join_list[-1]].join_type == LOUTER
            ):
                lookup_class = targets[0].get_lookup("isnull")
                col = self._get_col(targets[0], join_info.targets[0], alias)
                # Use OR + IS NULL when RHS \`in\` values include None.
                if (
                    lookup_type == "in"
                    # Check containers (not strings or bytes).
                    and isinstance(condition.rhs, Iterable)
                    and not isinstance(condition.rhs, (str, bytes))
                    and any(v is None for v in condition.rhs)
                ):
                    clause.add(lookup_class(col, True), OR)
                else:
                    clause.add(lookup_class(col, False), AND)
            # If someval is a nullable column, someval IS NOT NULL is
            # added.
            if isinstance(value, Col) and self.is_nullable(value.target):
                lookup_class = value.target.get_lookup("isnull")
                clause.add(lookup_class(value, False), AND)
        return clause, used_joins if not require_outer else ()`,
		notes: [
			'Lines 1 to 7: in [`build_lookup`](' + QUERY + '#L1440-L1446), `filter(status=None)` is rewritten to the `isnull` lookup, so Django never sends `status = NULL`. Any other lookup with `None`, like `status__gt=None`, raises `ValueError("Cannot use None as a query value")`.',
			'Lines 17 to 44: for a nullable column, [`build_filter`](' + QUERY + '#L1636-L1663) adds `col IS NOT NULL` inside the negation. Django sends `exclude(status="archived")` as `NOT (status = \'archived\' AND status IS NOT NULL)`, which is true for a NULL status. A hand-written `WHERE status <> \'archived\'` drops those rows.',
			'Lines 34 to 42 handle a None inside `in`. The [`In` lookup](' + DJANGO + '/django/db/models/lookups.py#L530-L539) says why: "Remove None from the list as NULL is never equal to anything." If nothing is left, it raises `EmptyResultSet` and no query is sent. When an `exclude(...__in=[...])` list holds a None, `build_filter` adds `OR col IS NULL` instead, so the NULL rows are excluded too.',
			'`UniqueConstraint(..., nulls_distinct=False)` is turned into SQL by [`_unique_index_nulls_distinct_sql`](' + DJANGO + '/django/db/backends/base/schema.py#L1847-L1852), which emits `NULLS NOT DISTINCT`. The Django docs warn: "Unique constraints with `nulls_distinct` are ignored for databases besides PostgreSQL."'
		]
	},
	tradeoff: {
		gain: [
			'NULL keeps a missing price out of `avg(price)` and `count(price)`. A stored 0 or `\'\'` would look like real data and pull the average down.',
			'A nullable foreign key stores an optional link with no fake value, and a nullable unique column accepts many rows that have no value yet.',
			'`IS NULL`, `IS DISTINCT FROM`, `COALESCE` and `NULLS NOT DISTINCT` let you say what a missing value means in each query and key.'
		],
		cost: [
			'Every condition on a nullable column has a third case, NULL. If you forget it, rows vanish from a report without any error.',
			'One NULL in a `NOT IN` subquery empties the result. The bug appears the day someone inserts that first NULL, and the query itself has not changed.',
			'Django\'s `exclude()` keeps the NULL rows, and the `<>` you write by hand drops them.',
			'Unique constraints let duplicates in when a column is NULL, until you add `NULLS NOT DISTINCT` or make the column `NOT NULL`.'
		]
	},
	task: {
		prompt: 'In `psql`, create `projects(id int, name text, status text)` with rows `(1, \'api\', \'active\')`, `(2, \'web\', \'archived\')`, `(3, \'docs\', NULL)`, and `members(user_id int, project_id int)` with rows `(10, 1)` and `(11, NULL)`. Predict, then run: (a) `SELECT count(*) FROM projects WHERE status <> \'archived\'`; (b) the same with `IS DISTINCT FROM`; (c) `SELECT name FROM projects WHERE id NOT IN (SELECT project_id FROM members)`; (d) `SELECT count(*), count(status) FROM projects`.',
		hint: 'For each row, write the condition as true, false or NULL. WHERE keeps only the true ones.',
		answer: [
			'(a) 1. Only `api`. For `docs`, `NULL <> \'archived\'` is NULL, so the row is dropped.',
			'(b) 2. `api` and `docs`. `IS DISTINCT FROM` treats the NULL as a value that differs from `\'archived\'`.',
			'(c) No rows, although `web` and `docs` have no members. The NULL in `members` makes every `NOT IN` NULL. `SELECT name FROM projects p WHERE NOT EXISTS (SELECT 1 FROM members m WHERE m.project_id = p.id)` returns `web` and `docs`.',
			'(d) 3 and 2. `count(*)` counts rows, `count(status)` counts the rows where status is not NULL.',
			'Bonus: `SELECT name, COALESCE(status, \'none\') FROM projects` shows `none` for `docs`, without changing the stored data.'
		],
		steps: [
			{
				title: 'Predict the `<>` count',
				questions: [
					{ q: 'For the `web` row, what is `status <> \'archived\'`?', options: ['true', 'false', 'NULL', 'An error'], answer: 1, why: '`\'archived\' <> \'archived\'` is a plain comparison of two equal values. No NULL is involved, so it is false.' },
					{ q: 'Which rows does WHERE keep?', options: ['Rows where the condition is true or NULL', 'Rows where the condition is true', 'Rows where the condition is not false', 'Every row, then it filters later'], answer: 1, why: 'The docs: if the result "is false or null, it is discarded". Only true survives.' },
					{ q: 'So what does (a) return?', options: ['1', '2', '3', '0'], answer: 0, why: 'Only `api`. `web` is false, and `docs` is NULL, so both are dropped.' },
					{ q: 'You try `WHERE status = NULL` to find `docs`. What do you get?', options: ['The `docs` row', 'An error about NULL', 'Every row', 'No rows'], answer: 3, why: '`x = NULL` is NULL even when `x` is NULL. Only `status IS NULL` tests for a missing value.' }
				]
			},
			{
				title: 'Keep the NULL row',
				questions: [
					{ q: 'What does (b), with `IS DISTINCT FROM`, return?', options: ['1', '2', '3', '0'], answer: 1, why: '`api` and `docs`. It treats the NULL as a value that differs from `\'archived\'`.' },
					{ q: 'What can `status IS DISTINCT FROM \'archived\'` return?', options: ['Only true or false, never NULL', 'True, false or NULL', 'Only NULL when `status` is NULL', 'The value of `status`'], answer: 0, why: 'That is its whole point: it compares NULL like an ordinary value.' },
					{ q: 'Which other condition also keeps `docs`?', options: ['`status <> \'archived\' AND status IS NOT NULL`', '`NOT (status = \'archived\')`', '`status != \'archived\'`', '`COALESCE(status, \'none\') <> \'archived\'`'], answer: 3, why: '`COALESCE` replaces the NULL with `\'none\'` before the compare. The other three still meet a NULL, or drop it on purpose.' },
					{ q: 'Which condition finds `docs` the way `status IS NULL` does?', options: ['`status = NULL`', '`status <> NULL`', '`status IS NOT DISTINCT FROM NULL`', '`NOT (status = NULL)`'], answer: 2, why: '`IS NOT DISTINCT FROM` compares NULL like an ordinary value, so NULL against NULL is true. The other three are NULL for every row.' }
				]
			},
			{
				title: 'Trace the NOT IN',
				questions: [
					{ q: 'The subquery returns `1` and `NULL`. What does `id NOT IN (1, NULL)` mean?', options: ['`id <> 1 OR id <> NULL`', '`id <> 1 AND id <> NULL`', '`id <> 1`, NULLs are skipped', '`id IS NOT NULL AND id <> 1`'], answer: 1, why: '`NOT IN` must differ from every value in the list, so the tests join with AND.' },
					{ q: 'For `web` (id 2), what is `2 <> 1 AND 2 <> NULL`?', options: ['true', 'false', 'An error', 'NULL'], answer: 3, why: '`true AND NULL` is NULL, so WHERE drops the row.' },
					{ q: 'Member 11\'s `project_id` is set to 3 instead of NULL. What does (c) return now?', options: ['No rows', '`web` only', '`web` and `docs`', '`docs` only'], answer: 1, why: 'The list is now `(1, 3)`, with no NULL. `2 <> 1 AND 2 <> 3` is true, so `web` stays, and `docs` (id 3) now has a member.' },
					{ q: 'Which query returns `web` and `docs`, as you meant?', options: ['`... WHERE id NOT IN (SELECT DISTINCT project_id FROM members)`', '`... WHERE id <> ALL (SELECT project_id FROM members)`', '`... WHERE NOT EXISTS (SELECT 1 FROM members m WHERE m.project_id = p.id)`', '`... WHERE id NOT IN (SELECT project_id FROM members ORDER BY 1)`'], answer: 2, why: '`NOT EXISTS` still returns the rows with no match when the subquery holds a NULL. The other three keep the NULL in the list.' }
				]
			},
			{
				title: 'Count the NULLs',
				questions: [
					{ q: 'What does (d), `count(*), count(status)`, return?', options: ['3 and 3', '2 and 2', '3 and 2', '3 and NULL'], answer: 2, why: '`count(*)` counts rows. `count(status)` counts the rows where status is not NULL.' },
					{ q: 'Why does NULL help `avg(price)` more than a stored 0?', options: ['It keeps the missing price out, while a 0 would pull the average down', 'Averages are faster on NULL columns', 'A 0 makes `avg` return NULL', 'There is no difference'], answer: 0, why: 'Aggregates skip NULLs. A 0 looks like real data.' },
					{ q: 'What does `SELECT name, COALESCE(status, \'none\') FROM projects` change in the table?', options: ['It writes `none` into the `docs` row', 'It adds a default to the column', 'It makes `status` NOT NULL', 'Nothing: it only changes what the query shows'], answer: 3, why: '`COALESCE` returns its first argument that is not NULL. It works on the output, not on the stored data.' },
					{ q: 'What does `SELECT count(DISTINCT status) FROM projects` return?', options: ['3', '2', '1', 'NULL'], answer: 1, why: 'Aggregates skip NULLs. It counts `active` and `archived`, and leaves out the NULL of `docs`.' }
				]
			}
		]
	},
	quiz: [
		{
			q: '`SELECT * FROM projects WHERE id NOT IN (SELECT project_id FROM members)` returns no rows, yet some projects have no members. What is the most likely cause?',
			options: [
				'At least one `members.project_id` is NULL, so NOT IN is never true',
				'The subquery returns too many rows, so PostgreSQL cuts it off',
				'NOT IN needs an index on `project_id` to return any rows',
				'The subquery sees an older snapshot than the outer query'
			],
			answer: 0,
			why: '`x NOT IN (a, NULL)` is `x <> a AND x <> NULL`. The second part is always NULL, so the whole test is NULL or false, never true, and WHERE drops every row. `NOT EXISTS` gives the answer you meant.'
		},
		{
			q: 'A table has `UNIQUE (user_id, team_id)`, created with the defaults. You insert `(7, NULL)` twice. What happens?',
			options: [
				'The second insert fails with a duplicate key error',
				'Both inserts succeed, and the table holds two such rows',
				'The first insert fails, because a unique column needs a value',
				'The second insert silently replaces the first row'
			],
			answer: 1,
			why: 'By default, NULLs in a unique index are not equal to each other, so the two rows do not clash. `UNIQUE NULLS NOT DISTINCT (user_id, team_id)` (PostgreSQL 15 and later) makes the second insert fail.'
		},
		{
			q: '`status` is nullable. Which rows does Django\'s `Project.objects.exclude(status="archived")` return?',
			options: [
				'Only the rows whose status is set and is not `archived`',
				'Only the rows whose status is NULL',
				'The rows whose status is not `archived`, NULL ones included',
				'None: Django refuses `exclude()` on a nullable column'
			],
			answer: 2,
			why: 'Django adds `IS NOT NULL` inside the negation, so the SQL is `NOT (status = \'archived\' AND status IS NOT NULL)`, which is true for a NULL status. A hand-written `status <> \'archived\'` would drop those rows.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Watch a NULL drop rows from `<>` and `NOT IN`, then keep them with the right test, and let a NULL slip past a unique constraint.',
		steps: [
			'Start a throwaway PostgreSQL: `docker run -d --name pg-null -e POSTGRES_PASSWORD=lab postgres:18`, wait a few seconds, then `docker exec -it pg-null psql -U postgres`.',
			'Create the task\'s data: `CREATE TABLE projects (id int, name text, status text); INSERT INTO projects VALUES (1, \'api\', \'active\'), (2, \'web\', \'archived\'), (3, \'docs\', NULL); CREATE TABLE members (user_id int, project_id int); INSERT INTO members VALUES (10, 1), (11, NULL);`',
			'Write your four predictions down, then run (a) to (d) from the task, and the `NOT EXISTS` version of (c).',
			'See the NULL itself: `SELECT NULL = NULL AS eq, NULL IS NULL AS is_null;`',
			'Try the unique key: `CREATE TABLE team_members (user_id int, team_id int, UNIQUE (user_id, team_id));` then run `INSERT INTO team_members VALUES (7, NULL);` twice. Then `CREATE TABLE team_members2 (user_id int, team_id int, UNIQUE NULLS NOT DISTINCT (user_id, team_id));` and the same two inserts into it. Quit with `\\q` and clean up with `docker rm -f pg-null`.'
		],
		done: [
			'(a) prints 1, (b) prints 2, (c) prints `(0 rows)`, and the `NOT EXISTS` version prints `web` and `docs`.',
			'(d) prints 3 and 2.',
			'`eq` is empty (NULL) and `is_null` is `t`.',
			'`team_members` holds two `(7, NULL)` rows; the second insert into `team_members2` fails with `duplicate key value violates unique constraint`.'
		],
		solution: [
			'(a) `SELECT count(*) FROM projects WHERE status <> \'archived\';` and (b) `SELECT count(*) FROM projects WHERE status IS DISTINCT FROM \'archived\';`',
			'(c) `SELECT name FROM projects WHERE id NOT IN (SELECT project_id FROM members);` then `SELECT name FROM projects p WHERE NOT EXISTS (SELECT 1 FROM members m WHERE m.project_id = p.id);`',
			'(d) `SELECT count(*), count(status) FROM projects;`',
			'The first three surprises have one cause: a comparison with NULL is NULL, and WHERE keeps only true. The last one is a default: a unique index does not count two NULLs as equal unless you say `NULLS NOT DISTINCT`.'
		]
	},
	recall: {
		q: 'A project has a NULL status. Why does `WHERE status <> \'archived\'` drop it, and which condition keeps it?',
		a: '`NULL <> \'archived\'` is NULL, and WHERE keeps only rows where the condition is true. `status IS DISTINCT FROM \'archived\'` is true for that row, so it keeps it.'
	},
	sources: [
		{ title: 'PostgreSQL docs, Comparison Functions and Operators', url: 'https://www.postgresql.org/docs/current/functions-comparison.html' },
		{ title: 'PostgreSQL docs, Subquery Expressions', url: 'https://www.postgresql.org/docs/current/functions-subquery.html' },
		{ title: 'PostgreSQL docs, Unique Indexes', url: 'https://www.postgresql.org/docs/current/indexes-unique.html' },
		{ title: 'PostgreSQL docs, Conditional Expressions (COALESCE)', url: 'https://www.postgresql.org/docs/current/functions-conditional.html' },
		{ title: 'Django docs, UniqueConstraint.nulls_distinct', url: 'https://docs.djangoproject.com/en/dev/ref/models/constraints/#nulls-distinct' }
	]
};
