const FIX_SHA = '505826b469b16ab36693360da9e11fd13213421b';
const DJ = `https://github.com/django/django/blob/${FIX_SHA}`;
const FIX = `https://github.com/django/django/commit/${FIX_SHA}`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'sql-injection',
	part: 'Input and output',
	title: 'SQL injection',
	minutes: 10,
	hook: [
		'On 3 February 2020, Django released 3.0.3, 2.2.10 and 1.11.28 for CVE-2020-7471. The release notes: "`StringAgg` aggregation function was subject to SQL injection, using a suitably crafted `delimiter`."',
		'`StringAgg(\'name\', delimiter=\', \')` asks PostgreSQL for `STRING_AGG(name, \', \')`: all names joined into one string. Django pasted the delimiter into the SQL text, between two quotes. A delimiter that contains a `\'` closes the quoted string early, and the database reads the rest as SQL.',
		'The fix was a few lines: send the delimiter as a query parameter instead of as SQL text.'
	],
	terms: [
		{ term: 'SQL injection', def: 'User input is glued into the text of an SQL statement, so characters like `\'` or `--` in that input change what the statement does.' },
		{ term: 'Parameterized query', def: 'The SQL text holds placeholders such as `%s`, and the values go to the driver in a separate list: `cursor.execute(sql, [value])`.' },
		{ term: 'Placeholder', def: 'The marker for one value in a parameterized query: `%s` in Django, `?` in a Java `PreparedStatement`. It can stand for a value only, never for a table or column name.' },
		{ term: 'Allow-list', def: 'A fixed list of accepted inputs in the code, such as `{"name": "last_name", "age": "age"}`. The code refuses any input that is not a key of that list.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['input["q = x\' OR \'1\'=\'1"] --> concat["Concatenation: WHERE last_name = \' + q + \'"]'],
				highlight: ['input', 'concat'],
				note: 'The search box sends the textbook payload `x\' OR \'1\'=\'1`. The code builds the statement by string concatenation, with quotes around the value.'
			},
			{
				add: ['concat --> parsed["WHERE last_name = \'x\' OR \'1\'=\'1\'"]', 'parsed --> all["Every row matches"]'],
				highlight: ['parsed', 'all'],
				note: 'The first `\'` of the input closes the string literal. `OR \'1\'=\'1\'` is now part of the condition, and it is true for every row. The database parses the whole text and cannot tell which characters came from the user.'
			},
			{
				add: ['input --> param["cursor.execute(sql with WHERE last_name = %s, [q])"]', 'param --> literal["Matches last_name equal to the whole string, 0 rows"]'],
				highlight: ['param', 'literal'],
				note: 'With a parameterized query, the SQL text never contains `q`. Django\'s docs: parameters "are escaped by the underlying database driver". The OWASP cheat sheet: the query then looks for a value that "literally matches the entire string".'
			},
			{
				add: ['sort["?sort=age"] --> allow["ORDER BY needs a column name: check it against an allow-list"]'],
				highlight: ['sort', 'allow'],
				note: 'A placeholder carries a value only. OWASP lists the parts that "can\'t use bind variables, such as table names, column names, or sort order indicators (ASC or DESC)". For those, map the input to a name written in the code.'
			}
		]
	},
	example: {
		title: 'django/contrib/postgres/aggregates/general.py: StringAgg after the CVE-2020-7471 fix',
		repo: 'django/django',
		url: `${DJ}/django/contrib/postgres/aggregates/general.py#L53-L65`,
		lang: 'python',
		code: `class StringAgg(OrderableAggMixin, Aggregate):
    function = 'STRING_AGG'
    template = '%(function)s(%(distinct)s%(expressions)s %(ordering)s)'
    allow_distinct = True

    def __init__(self, expression, delimiter, **extra):
        delimiter_expr = Value(str(delimiter))
        super().__init__(expression, delimiter_expr, **extra)

    def convert_value(self, value, expression, connection):
        if not value:
            return ''
        return value`,
		notes: [
			'Line 3 is the fixed template. [Before the fix](' + FIX + ') it read `"%(function)s(%(distinct)s%(expressions)s, \'%(delimiter)s\'%(ordering)s)"`. Python `%` formatting put the delimiter between two quotes in the SQL text, the same mistake as step 1 of the diagram.',
			'Line 7 wraps the delimiter in `Value(str(delimiter))`. The delimiter is now an expression like the column, so it goes into `%(expressions)s` with the other arguments.',
			'[`Value.as_sql`](' + DJ + '/django/db/models/expressions.py#L664-L680) ends with `return \'%s\', [val]`: a placeholder in the SQL text and the value in the parameter list. The driver receives the delimiter as data.',
			'The commit adds a test with `delimiter="\'"`, the character that broke out before. It expects `"Foo1\'Foo2\'Foo4\'Foo3"`: the quote now appears between the names as plain text.'
		]
	},
	tradeoff: {
		gain: [
			'Django\'s docs: querysets "are protected from SQL injection since their queries are constructed using query parameterization". `Person.objects.filter(last_name=q)` needs no extra care.',
			'A review can search for the few risky calls: `raw(`, `extra(`, `RawSQL(` and `cursor.execute(` with `%` or an f-string in the first argument.'
		],
		cost: [
			'Table names, column names and `ASC`/`DESC` cannot be placeholders. Each one needs an allow-list written by hand.',
			'In `raw()` and `cursor.execute()`, the developer writes the placeholders. Django\'s docs warn against "string formatting on raw queries" and against quotes around `%s`.',
			'The ORM itself can have holes: Django\'s security archive lists 16 SQL injection fixes in Django itself between August 2019 and February 2026, CVE-2020-7471 among them.'
		]
	},
	task: {
		prompt: 'Find both holes in this Django view and rewrite the query. `q = request.GET.get("q", "")`, `sort = request.GET.get("sort", "last_name")`, then `Person.objects.raw(f"SELECT * FROM app_person WHERE last_name = \'{q}\' ORDER BY {sort}")`.',
		hint: 'One input is a value and can go in the params list. The other is a column name. Which one can a placeholder carry?',
		answer: [
			'Hole 1: `q` is pasted into the SQL text between quotes. `?q=x\' OR \'1\'=\'1` returns every person. Fix: `WHERE last_name = %s` with `[q]` as the params argument, and no quotes around `%s`, as the Django docs require.',
			'Hole 2: `sort` is pasted after `ORDER BY`. A placeholder cannot carry a column name, so parameters do not help here.',
			'Fix for `sort`: `columns = {"name": "last_name", "age": "age"}` and `column = columns.get(sort, "last_name")`. Only strings written in the code reach the SQL.',
			'Result: `Person.objects.raw("SELECT * FROM app_person WHERE last_name = %s ORDER BY " + column, [q])`. Without raw SQL: `Person.objects.filter(last_name=q).order_by(column)`, still with the allow-list for `column`.'
		],
		steps: [
			{
				title: 'Find the inputs',
				questions: [
					{ q: 'Which request values reach the SQL text?', options: ['Only `q`', 'Only `sort`', 'Both `q` and `sort`', 'Neither: `raw` escapes them'], answer: 2, why: 'The f-string pastes `q` between quotes and `sort` after `ORDER BY`.' },
					{ q: 'What is `q` in the statement?', options: ['A value compared with `last_name`', 'A column name', 'A table name', 'A keyword'], answer: 0, why: 'It sits on the right of `last_name =`, where SQL expects a value.' },
					{ q: 'What is `sort` in the statement?', options: ['A value', 'A string literal', 'A placeholder', 'A column name after `ORDER BY`'], answer: 3, why: 'It names the column to sort by, so it is part of the SQL structure, not data.' },
					{ q: 'Why is pasting input into the SQL text a risk?', options: ['It makes the query slower', 'Characters like `\'` or `--` in the input change what the statement does', 'The database refuses f-strings', 'It only fails on PostgreSQL'], answer: 1, why: 'Once input is part of the SQL text, the database cannot tell it from the code you wrote.' }
				]
			},
			{
				title: 'Close the hole in `q`',
				questions: [
					{ q: 'What does `?q=x\' OR \'1\'=\'1` do to the query?', options: ['It finds no one named `x`', 'It raises a syntax error', 'It closes the quote, and `OR \'1\'=\'1` makes the filter true for every row', 'It is escaped by Django'], answer: 2, why: 'The first `\'` ends the string early, and the rest is read as SQL. Every person is returned.' },
					{ q: 'Which change closes it?', options: ['`WHERE last_name = %s` with `[q]` as params', '`WHERE last_name = \'%s\'` with `[q]` as params', 'Double every `\'` in `q` first', 'Strip spaces from `q`'], answer: 0, why: 'The value goes to the driver in a separate list, as data. That is what Django’s `StringAgg` fix did with `Value()`.' },
					{ q: 'Why no quotes around `%s`?', options: ['They make the query slower', 'SQLite needs them, PostgreSQL does not', 'Django adds a second pair', 'The docs say quoting the placeholder puts you at risk for SQL injection'], answer: 3, why: 'The driver quotes the value itself. "You must not include quotes around the %s placeholders in the SQL string."' },
					{ q: 'Why not escape quotes by hand instead?', options: ['It is too slow', 'OWASP marks escaping "STRONGLY DISCOURAGED"', 'Python has no way to do it', 'It breaks `ORDER BY`'], answer: 1, why: 'Hand escaping is easy to get wrong. A parameter never enters the SQL text at all.' }
				]
			},
			{
				title: 'Close the hole in `sort`',
				questions: [
					{ q: 'Can `ORDER BY %s` with `[sort]` carry the column name?', options: ['Yes, on every database', 'Yes, with named parameters', 'No: a placeholder stands for a value, never a column name', 'No: `ORDER BY` takes no input at all'], answer: 2, why: 'OWASP lists column names among the parts that "can\'t use bind variables". The query would sort by a constant string.' },
					{ q: 'So what protects `sort`?', options: ['An allow-list in the code that maps input to known column names', 'Escaping it', 'Checking its length', 'Making it upper case'], answer: 0, why: 'Only strings written in the code reach the SQL, whatever the user sends.' },
					{ q: 'What does `columns.get(sort, "last_name")` return for an unknown input?', options: ['`None`', 'The input itself', 'An error', '`"last_name"`'], answer: 3, why: 'The default keeps the query valid and the input out of the SQL.' },
					{ q: 'What else does OWASP put in the same group as column names?', options: ['Numbers', '`ASC` and `DESC`', 'Dates', 'Email addresses'], answer: 1, why: 'Sort direction is also SQL structure, so it needs an allow-list too.' }
				]
			},
			{
				title: 'Rewrite the query',
				questions: [
					{ q: 'Which `raw` call is safe?', options: ['`raw(f"... WHERE last_name = %s ORDER BY {sort}", [q])`', '`raw("... WHERE last_name = %s ORDER BY " + column, [q])`', '`raw("... WHERE last_name = \'%s\' ORDER BY " + column, [q])`', '`raw("... WHERE last_name = %s ORDER BY %s", [q, sort])`'], answer: 1, why: '`q` is a parameter, and `column` comes from the allow-list.' },
					{ q: 'Why is adding `column` with `+` safe here when adding `sort` was not?', options: ['`+` escapes its input', 'Django checks it later', '`column` can only be one of the strings in the code', 'It is not safe either'], answer: 2, why: 'The allow-list means user input picks a key. It never becomes SQL text itself.' },
					{ q: 'What is the ORM form?', options: ['`Person.objects.filter(last_name=q).order_by(column)`', '`Person.objects.filter(last_name=q).order_by(sort)`', '`Person.objects.extra(where=[q])`', '`Person.objects.raw(q)`'], answer: 0, why: 'The ORM parameterizes `q`. `order_by` still gets the allow-listed column.' },
					{ q: 'Does the ORM remove the need for the allow-list on `sort`?', options: ['Yes: the ORM validates all input', 'Yes, for `order_by` only', 'No, only for `filter`', 'No: keep the allow-list for the user-chosen column'], answer: 3, why: 'The ORM has had its own SQL injection holes: Django lists 16 fixes between August 2019 and February 2026. With the allow-list, the user only picks among columns you chose.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'A developer writes `cursor.execute("SELECT * FROM person WHERE last_name = \'%s\'", [name])`. What do Django\'s docs say about it?',
			options: [
				'It is safe, because the value is passed in the params list',
				'Remove the quotes around `%s`: quoting the placeholder is a risk',
				'Replace `%s` with an f-string, because the driver ignores quotes',
				'It is safe on PostgreSQL but not on SQLite, which lacks params'
			],
			answer: 1,
			why: 'The docs: "you must not include quotes around the %s placeholders in the SQL string", and "If you use string interpolation or quote the placeholder, you’re at risk for SQL injection." An f-string would paste the value into the SQL text again.'
		},
		{
			q: 'Why does `ORDER BY %s` with `[request.GET["sort"]]` not give a safe, user-chosen sort column?',
			options: [
				'Placeholders carry values, so a column name needs an allow-list',
				'It works, but only on databases that support named parameters',
				'The driver rejects any parameter that looks like a column name',
				'`ORDER BY` is evaluated before parameters are bound, so it errors'
			],
			answer: 0,
			why: 'A bind variable stands for a value, like a string or a number. OWASP lists column names and `ASC`/`DESC` among the parts that "can\'t use bind variables", so the code must map the input to a column name it already knows.'
		},
		{
			q: 'How did Django fix CVE-2020-7471 in `StringAgg`?',
			options: [
				'It doubled every `\'` in the delimiter before formatting the template',
				'It accepted only one-character delimiters made of punctuation',
				'It passed the delimiter as `Value()`, which compiles to `%s`',
				'It removed the `delimiter` argument and always used a comma'
			],
			answer: 2,
			why: 'The commit removed `\'%(delimiter)s\'` from the template and passed `Value(str(delimiter))` as an extra expression. `Value.as_sql` returns `\'%s\', [val]`, so the delimiter reaches the driver as a parameter. Doubling quotes by hand is the "escaping" approach OWASP marks "STRONGLY DISCOURAGED".'
		}
	],
	lab: {
		minutes: 15,
		goal: 'On a local SQLite file, see a pasted value change the query, a parameter keep it as data, and an allow-list handle the sort column.',
		steps: [
			'Make a small table: `mkdir -p ~/sqli-lab && cd ~/sqli-lab && sqlite3 people.db "CREATE TABLE app_person (id INTEGER PRIMARY KEY, last_name TEXT, age INTEGER); INSERT INTO app_person (last_name, age) VALUES (\'Curie\', 66), (\'Lovelace\', 36), (\'Turing\', 41);"`.',
			'Run the task’s pasted query with the input from the answer: `python3 -c "import sqlite3, sys; q = sys.argv[1]; print(sqlite3.connect(\'people.db\').execute(f\\"SELECT last_name FROM app_person WHERE last_name = \'{q}\'\\").fetchall())" "x\' OR \'1\'=\'1"`.',
			'Run it with a parameter instead (SQLite’s placeholder is `?`, Django’s is `%s`): `python3 -c "import sqlite3, sys; print(sqlite3.connect(\'people.db\').execute(\'SELECT last_name FROM app_person WHERE last_name = ?\', [sys.argv[1]]).fetchall())" "x\' OR \'1\'=\'1"`. Then the same with `Turing`.',
			'Try a placeholder for the sort column: `python3 -c "import sqlite3, sys; print(sqlite3.connect(\'people.db\').execute(\'SELECT last_name FROM app_person ORDER BY ?\', [sys.argv[1]]).fetchall())" age`.',
			'Use an allow-list: `python3 -c "import sqlite3, sys; col = {\'name\': \'last_name\', \'age\': \'age\'}.get(sys.argv[1], \'last_name\'); print(sqlite3.connect(\'people.db\').execute(\'SELECT last_name FROM app_person ORDER BY \' + col).fetchall())" age`. Then try it with `nonsense`.'
		],
		done: [
			'Step 2 prints all three names.',
			'Step 3 prints `[]` for the crafted input and `[(\'Turing\',)]` for `Turing`.',
			'Step 4 prints the rows in insertion order: `ORDER BY ?` sorted by a constant, not by `age`.',
			'Step 5 prints `Lovelace`, `Turing`, `Curie` for `age`, and sorts by name for `nonsense`.'
		],
		solution: [
			'In step 2 the `\'` in the input closes the string, and `OR \'1\'=\'1` is read as SQL.',
			'In step 3 the driver sends the whole input as one value, so the database looks for a person literally named `x\' OR \'1\'=\'1`.',
			'Step 4 shows why a placeholder cannot carry a column name: it is bound as the string `\'age\'`, the same for every row. Step 5 only ever puts `last_name` or `age` into the SQL. Clean up with `rm -rf ~/sqli-lab`.'
		]
	},
	recall: {
		q: 'In Django\'s CVE-2020-7471, which argument reached the SQL text, and what replaced it?',
		a: 'The `delimiter` of `StringAgg`, pasted between quotes by the template. Django 3.0.3 sends it as `Value(str(delimiter))`, which compiles to a `%s` placeholder plus a parameter.'
	},
	sources: [
		{ title: 'Django security releases, 3 February 2020 (CVE-2020-7471)', url: 'https://www.djangoproject.com/weblog/2020/feb/03/security-releases/' },
		{ title: 'Django fix commit 505826b, properly escaped StringAgg(delimiter)', url: FIX },
		{ title: 'Django docs, Performing raw SQL queries', url: 'https://docs.djangoproject.com/en/5.2/topics/db/sql/' },
		{ title: 'Django docs, Security in Django: SQL injection protection', url: 'https://docs.djangoproject.com/en/5.2/topics/security/#sql-injection-protection' },
		{ title: 'Django docs, Archive of security issues', url: 'https://docs.djangoproject.com/en/dev/releases/security/' },
		{ title: 'OWASP SQL Injection Prevention Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html' }
	]
};
