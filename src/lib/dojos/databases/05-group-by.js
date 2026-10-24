const UMAMI = 'https://github.com/umami-software/umami/blob/ec0ff50388c264ed8ce46f00967e92f7e71476ae';
const STATS = `${UMAMI}/src/queries/sql/getWebsiteStats.ts`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'group-by',
	part: 'Data and questions',
	title: 'Counting with GROUP BY',
	minutes: 10,
	hook: [
		'Your marketing team wants four numbers for last week: page views, visitors, visits, and the bounce rate. The data is a table with **one row per event**: a page view, a click, a sign-up.',
		'You could load every event into the app and count in a loop. With ten million events, **that is ten million rows over the network to produce four numbers**.',
		'GROUP BY lets the database count where the data lives. It folds many rows into one row per group, and aggregates like `count` and `sum` compute each group\'s values. The bounce rate is a fact about a visit, while each row is an event, so **you group twice**: events into visits, then visits into totals.'
	],
	terms: [
		{ term: 'Aggregate', def: 'A function that turns many rows into one value: `count`, `sum`, `min`, `max`, `avg`. Except for `count`, they return NULL when no rows come in.' },
		{ term: 'GROUP BY', def: 'Splits the rows into groups that share the same values, then returns one row per group. Every other column in the SELECT list must be inside an aggregate, unless it depends on a grouped primary key.' },
		{ term: 'HAVING', def: 'A filter on groups, after the aggregates are computed. WHERE filters rows before grouping and cannot use aggregates.' },
		{ term: 'Window function', def: 'An aggregate-like calculation with `OVER (...)` that does not fold rows: each row keeps its identity and gets a value computed from related rows.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['events[("website_event: one row per event")] -->|"WHERE website_id, date range"| rows["the week\'s events"]'],
				highlight: ['events', 'rows'],
				note: 'First, WHERE selects the rows of one site and one week. The docs: "WHERE selects input rows before groups and aggregates are computed". An aggregate in WHERE fails with `aggregate functions are not allowed in WHERE`.'
			},
			{
				add: ['rows -->|"GROUP BY session_id, visit_id"| visits["one row per visit: c = page views, has_custom_event"]'],
				highlight: ['visits'],
				note: 'Grouping by session and visit folds the events into one row per visit. Inside each group, `sum(case ... then 1 else 0 end)` counts the events that are not custom events or performance timings.'
			},
			{
				add: ['visits -->|"HAVING c > 0"| kept["visits with at least one view"]'],
				highlight: ['kept'],
				note: 'A visit made only of custom events has `c = 0`, and HAVING drops that whole group. HAVING runs after the sums are known, which WHERE cannot do: when WHERE runs, the sums do not exist yet.'
			},
			{
				add: ['kept -->|"aggregate with no GROUP BY"| totals["one row: pageviews, visitors, visits, bounces"]'],
				highlight: ['totals'],
				note: 'The outer query folds the visits into totals. It has aggregates but no GROUP BY, so the whole input is one group. `count(distinct session_id)` gives visitors, and a bounce is a visit with exactly one view and no custom event.'
			},
			{
				add: ['rows -.->|"row_number() OVER (PARTITION BY visit_id ORDER BY created_at)"| numbered["each event keeps its row, plus its step number"]'],
				highlight: ['numbered'],
				note: 'For user journeys, Umami numbers the events of each visit with `row_number()`, a window function. The docs: window functions "do not cause rows to become grouped into a single output row". Every event stays, with its position in the visit.'
			}
		]
	},
	example: {
		title: 'src/queries/sql/getWebsiteStats.ts: Umami\'s dashboard numbers in one PostgreSQL query',
		repo: 'umami-software/umami',
		url: `${STATS}#L26-L73`,
		lang: 'typescript',
		code: `async function relationalQuery(
  websiteId: string,
  filters: QueryFilters,
): Promise<WebsiteStatsData[]> {
…
  if (!hasEventFilters) {
    return rawQuery(
      \`
      select
        cast(coalesce(sum(t.c), 0) as bigint) as "pageviews",
        count(distinct t.session_id) as "visitors",
        count(distinct t.visit_id) as "visits",
        \${excludeBounce ? '0' : 'coalesce(sum(case when t.c = 1 and t.has_custom_event = 0 then 1 else 0 end), 0)'} as "bounces",
        cast(coalesce(sum(\${getTimestampDiffSQL('t.min_time', 't.max_time')}), 0) as bigint) as "totaltime"
      from (
        select
          website_event.session_id,
          website_event.visit_id,
          sum(case when website_event.event_type NOT IN (2, 5) then 1 else 0 end) as "c",
          min(case when website_event.event_type NOT IN (2, 5) then website_event.created_at end) as "min_time",
          max(case when website_event.event_type NOT IN (2, 5) then website_event.created_at end) as "max_time",
          max(case when website_event.event_type = \${EVENT_TYPE.customEvent} then 1 else 0 end) as "has_custom_event"
        from website_event
        \${cohortQuery}
        \${excludeBounceQuery}
        \${joinSessionQuery}
        where website_event.website_id = {{websiteId::uuid}}
          and website_event.created_at between {{startDate}} and {{endDate}}
          and website_event.event_type != \${EVENT_TYPE.performance}
          \${filterQuery}
        group by 1, 2
        having sum(case when website_event.event_type NOT IN (2, 5) then 1 else 0 end) > 0
      ) as t
      \`,
      queryParams,
      FUNCTION_NAME,
    ).then(result => result?.[0]);`,
		notes: [
			'Line 1, `relationalQuery`, is the PostgreSQL path. Umami picks it when [`runQuery`](' + UMAMI + '/src/lib/db.ts#L37-L39) sees a PostgreSQL URL, and a ClickHouse query otherwise. In `EVENT_TYPE` (in the sources), 2 is a custom event and 5 a performance timing, so `NOT IN (2, 5)` on line 19 keeps page views, link events and pixel events.',
			'Line 31, `group by 1, 2`, points at the first and second items of the inner SELECT list, `session_id` and `visit_id`. The docs allow "the name or ordinal number of an output column". Line 32 repeats the full `sum(case ...)` in HAVING instead of the alias `c`.',
			'The outer query always returns one row, even for a site with no traffic. The docs: "sum of no rows returns null, not zero as one might expect". Line 10, `coalesce(sum(t.c), 0)`, turns that NULL into 0, while `count(distinct ...)` on lines 11 and 12 already returns 0.',
			'Lines 20 and 21 keep the `min` and `max` of `created_at` for each visit. [`getTimestampDiffSQL`](' + UMAMI + '/src/lib/prisma.ts#L127-L129) turns the gap into seconds with `extract(epoch from ...)`, and the outer `sum` on line 14 adds the visits up.',
			'For journeys, [`getJourney`](' + UMAMI + '/src/queries/sql/journeys/getJourney.ts#L112-L117) uses `row_number() OVER (PARTITION BY visit_id ORDER BY website_event.created_at)`. It groups the events by visit without folding them: each event gets its step number inside its visit.'
		]
	},
	tradeoff: {
		gain: [
			'The database counts where the data is: four numbers cross the network instead of millions of rows.',
			'Two levels of grouping express facts about visits ("bounced") that no single event carries.',
			'Window functions add per-group numbers (rank, running total, step number) while keeping every row.'
		],
		cost: [
			'Every non-aggregated column must be in GROUP BY. PostgreSQL rejects the query otherwise: `must appear in the GROUP BY clause or be used in an aggregate function`.',
			'`count(DISTINCT ...)` costs more than `count(*)`. PostgreSQL\'s [executor](https://github.com/postgres/postgres/blob/26bd08fb5c069fbdf55867adc398cfca0f55d5c8/src/backend/executor/nodeAgg.c?plain=1#L33-L39) says: "we sort the input tuples and eliminate duplicates", and "partial aggregation is not supported in these cases".',
			'An aggregate reads every matching row, so on a busy site a dashboard query over a year scans a year of events. Analytics engines exist for this (day 38).',
			'Three NULL rules apply: `count(x)` skips NULLs, `count(*)` does not, and `sum` of nothing is NULL.'
		]
	},
	task: {
		prompt: 'Table `website_event(session_id, visit_id, event_type, created_at)`, with `event_type` 1 for a page view and 2 for a custom event. In `psql`, write: (1) page views per day; (2) visits with more than 5 page views; (3) the share of bounced visits; (4) page views per day with a running total.',
		hint: 'For each one, ask what one output row stands for: a day, a visit, or the whole week. For (3), you need a row per visit before you can count bounces.',
		answer: [
			'(1) `SELECT date_trunc(\'day\', created_at) AS day, count(*) AS views FROM website_event WHERE event_type = 1 GROUP BY 1 ORDER BY 1;` One row per day.',
			'(2) `SELECT visit_id, count(*) AS views FROM website_event WHERE event_type = 1 GROUP BY visit_id HAVING count(*) > 5;` WHERE keeps page views, HAVING keeps big visits. Swapping them fails: `aggregate functions are not allowed in WHERE`.',
			'(3) Group twice: `SELECT avg(CASE WHEN views = 1 THEN 1.0 ELSE 0 END) FROM (SELECT visit_id, count(*) FILTER (WHERE event_type = 1) AS views FROM website_event GROUP BY visit_id) v WHERE views > 0;` The inner query makes one row per visit. `FILTER` is the standard spelling of Umami\'s `sum(case ...)`.',
			'(4) `SELECT date_trunc(\'day\', created_at) AS day, count(*) AS views, sum(count(*)) OVER (ORDER BY date_trunc(\'day\', created_at)) AS running FROM website_event WHERE event_type = 1 GROUP BY 1 ORDER BY 1;` The window runs after GROUP BY, so it adds up the daily counts.'
		],
		steps: [
			{
				title: 'Count views per day',
				questions: [
					{ q: 'In (1), what does one output row stand for?', options: ['An event', 'A visit', 'A day', 'The whole week'], answer: 2, why: 'You group by the day, so each output row is one day with its count.' },
					{ q: 'Where does `event_type = 1` go?', options: ['In WHERE, so only page views reach the groups', 'In HAVING, after the count is known', 'In ORDER BY', 'Inside `date_trunc`'], answer: 0, why: 'It filters single rows, not groups. WHERE "selects input rows before groups and aggregates are computed".' },
					{ q: 'What does `GROUP BY 1` point at?', options: ['The first column of the table', 'The value 1, so all rows form one group', 'The rows where `event_type` is 1', 'The first item of the SELECT list, the day'], answer: 3, why: 'The docs allow "the name or ordinal number of an output column". Umami writes `group by 1, 2` the same way.' },
					{ q: 'You add `visit_id` to the SELECT list of (1) and change nothing else. What happens?', options: ['PostgreSQL picks one visit per day', 'It fails: `must appear in the GROUP BY clause or be used in an aggregate function`', 'It returns one row per visit instead', 'The column comes back as NULL'], answer: 1, why: 'Each output row is a day, and a day has many visits. PostgreSQL will not guess which one you meant.' }
				]
			},
			{
				title: 'Keep the big visits',
				questions: [
					{ q: 'In (2), what do you group by?', options: ['`visit_id`', '`event_type`', '`created_at`', 'Nothing, one group is enough'], answer: 0, why: 'The question is about visits, so one output row is one visit.' },
					{ q: 'Where does `count(*) > 5` go?', options: ['In WHERE', 'In ORDER BY', 'In HAVING', 'In the SELECT list'], answer: 2, why: 'HAVING filters groups after the aggregates are computed.' },
					{ q: 'You write `WHERE count(*) > 5` instead. What does PostgreSQL say?', options: ['It returns every visit, ignoring the filter', '`aggregate functions are not allowed in WHERE`', '`column "count" does not exist`', 'It works, but slower'], answer: 1, why: 'WHERE runs before groups exist, so there is no count yet to compare.' },
					{ q: 'Why keep `event_type = 1` in WHERE and not in HAVING?', options: ['HAVING cannot compare numbers', 'WHERE is always faster for any filter', 'HAVING only accepts `count`', 'It is a test on single rows, and `event_type` is not a grouped column'], answer: 3, why: 'Row filters go in WHERE, group filters in HAVING. In HAVING, `event_type` would need GROUP BY or an aggregate.' }
				]
			},
			{
				title: 'Group twice for bounces',
				questions: [
					{ q: 'Why does the bounce rate need two levels of grouping?', options: ['A bounce is a fact about a visit, but each row is an event', 'PostgreSQL allows only one aggregate per query', 'HAVING needs a subquery to run', 'Averages cannot be computed on events'], answer: 0, why: 'First fold events into visits, then fold visits into one share.' },
					{ q: 'What does the inner query return?', options: ['One row per event, with its number', 'One row with the total', 'One row per day', 'One row per visit, with its page views'], answer: 3, why: 'It groups by `visit_id` and counts the page views in each one.' },
					{ q: 'Which inner count matches Umami\'s `sum(case when ... then 1 else 0 end)`?', options: ['`count(event_type)`', '`count(*) FILTER (WHERE event_type = 1)`', '`count(DISTINCT event_type)`', '`max(event_type = 1)`'], answer: 1, why: '`FILTER` is the standard spelling: it counts only the rows that pass its condition.' },
					{ q: 'What does the outer `WHERE views > 0` drop?', options: ['Visits with exactly one page view', 'Days with no traffic', 'Visits made only of custom events', 'Visits of logged-in users'], answer: 2, why: 'A visit with no page view is not a visit for the dashboard. Umami drops it with `HAVING ... > 0`.' }
				]
			},
			{
				title: 'Add the running total',
				questions: [
					{ q: 'Which tool keeps one row per day and adds a running total?', options: ['A second GROUP BY', 'A window function with `OVER (ORDER BY ...)`', 'HAVING with `sum`', 'A self join on the day'], answer: 1, why: 'Window functions "do not cause rows to become grouped into a single output row". Each day keeps its row.' },
					{ q: 'Why does (4) write `sum(count(*)) OVER (...)`?', options: ['The window runs after GROUP BY, so it adds up the daily counts', '`count(*)` cannot run alone with a window', 'It counts each event twice on purpose', 'Without it, the days come back unsorted'], answer: 0, why: '`count(*)` gives each day its count, then the window `sum` adds those counts in day order.' },
					{ q: 'What is the difference between `count(*) ... GROUP BY visit_id` and `count(*) OVER (PARTITION BY visit_id)`?', options: ['There is none', 'The first is faster on every table', 'The second counts distinct visits', 'The second keeps every event row, each with its visit\'s total'], answer: 3, why: 'GROUP BY folds the rows. With a window, "the rows retain their separate identities".' },
					{ q: 'The week had no events at all. What does `sum` over no rows return?', options: ['0', 'No row', 'NULL', 'An error'], answer: 2, why: 'The docs: "sum of no rows returns null, not zero as one might expect". `count` returns 0, which is why Umami wraps only the sums in `coalesce`.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'You want sessions with more than 10 events in March. Why does `WHERE count(*) > 10` fail?',
			options: [
				'count(*) needs a column name inside it when it is used in a filter',
				'WHERE runs before groups exist, so there is no count yet to compare',
				'WHERE can only compare columns, and count(*) returns a whole table',
				'PostgreSQL needs ORDER BY before it can apply a filter on a count'
			],
			answer: 1,
			why: 'WHERE "selects input rows before groups and aggregates are computed". Keep the March filter in WHERE and move the count test to HAVING, which runs on the groups.'
		},
		{
			q: 'Umami\'s outer query runs `sum(t.c)` over a site with no events in the range. Without `coalesce`, what would `pageviews` be?',
			options: [
				'0, because sum starts from zero and adds nothing to it',
				'No row at all, because there was no group to return',
				'NULL, because sum over no rows returns NULL, not zero',
				'An error, because sum cannot run on an empty subquery'
			],
			answer: 2,
			why: 'An aggregate with no GROUP BY always returns one row, and the docs warn that "sum of no rows returns null, not zero as one might expect". `count` is the exception and returns 0, which is why only the sums are wrapped in `coalesce`.'
		},
		{
			q: 'What is the difference between `count(*) ... GROUP BY visit_id` and `count(*) OVER (PARTITION BY visit_id)`?',
			options: [
				'The first returns one row per visit, the second keeps every event row',
				'The first counts rows, the second counts distinct visit ids only',
				'The first runs after ORDER BY, the second runs before WHERE',
				'There is none: OVER is only another way to write GROUP BY'
			],
			answer: 0,
			why: 'GROUP BY folds each visit\'s rows into one. A window function computes the same count but "the rows retain their separate identities", so each event row carries its visit\'s total.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Compute a small analytics dashboard in SQL: views per day, big visits, the bounce rate and a running total.',
		steps: [
			'Start a throwaway PostgreSQL: `docker run -d --name pg-group -e POSTGRES_PASSWORD=lab postgres:18`, wait a few seconds, then `docker exec -it pg-group psql -U postgres`.',
			'Create the table: `CREATE TABLE website_event (session_id int, visit_id int, event_type int, created_at timestamptz);`',
			'Add 40 visits with 0 to 7 page views each, over three days: `INSERT INTO website_event SELECT v / 2, v, 1, timestamptz \'2024-03-01\' + (v % 3) * interval \'1 day\' + n * interval \'1 minute\' FROM generate_series(1, 40) v, generate_series(1, 7) n WHERE n <= v % 8;`. Then one custom event on every fifth visit: `INSERT INTO website_event SELECT v / 2, v, 2, timestamptz \'2024-03-01\' + (v % 3) * interval \'1 day\' FROM generate_series(5, 40, 5) v;`',
			'Write the task\'s four queries one by one. For (2), first try `WHERE count(*) > 5` and read the error.',
			'Check the empty case: `SELECT sum(x) FROM (SELECT 1 AS x WHERE false) t;` and `SELECT count(*) FROM website_event WHERE event_type = 9;`. Quit with `\\q` and clean up with `docker rm -f pg-group`.'
		],
		done: [
			'(1) returns three days with 49, 47 and 44 views.',
			'`WHERE count(*) > 5` fails with `aggregate functions are not allowed in WHERE`, and the HAVING version returns 10 visits.',
			'(3) returns about `0.1428`: 5 single-view visits out of 35 with a page view. With Umami\'s rule (no custom event either), it drops to about `0.1143`.',
			'(4) shows a running total of 49, 96, then 140.',
			'The empty `sum` prints an empty cell (NULL), the empty `count` prints `0`.'
		],
		solution: [
			'(1) `SELECT date_trunc(\'day\', created_at) AS day, count(*) AS views FROM website_event WHERE event_type = 1 GROUP BY 1 ORDER BY 1;`',
			'(2) `SELECT visit_id, count(*) AS views FROM website_event WHERE event_type = 1 GROUP BY visit_id HAVING count(*) > 5;`',
			'(3) `SELECT avg(CASE WHEN views = 1 THEN 1.0 ELSE 0 END) FROM (SELECT visit_id, count(*) FILTER (WHERE event_type = 1) AS views FROM website_event GROUP BY visit_id) v WHERE views > 0;`. Visit 40 has only a custom event, so the outer WHERE drops it.',
			'Umami\'s bounce also needs no custom event, and visit 25 has one view plus a custom event. Add `max(CASE WHEN event_type = 2 THEN 1 ELSE 0 END) AS custom` to the inner query and `AND custom = 0` to the CASE: 4 bounces out of 35.',
			'(4) `SELECT date_trunc(\'day\', created_at) AS day, count(*) AS views, sum(count(*)) OVER (ORDER BY date_trunc(\'day\', created_at)) AS running FROM website_event WHERE event_type = 1 GROUP BY 1 ORDER BY 1;`'
		]
	},
	recall: {
		q: 'Why does Umami\'s bounce count need two levels of grouping, and which clause drops the visits with no page view?',
		a: 'A bounce is a fact about a visit: one view and no custom event. The inner query groups events by `session_id, visit_id`, and `HAVING sum(...) > 0` drops visits with no view. The outer query then counts the bounces over those visits.'
	},
	sources: [
		{ title: 'Umami, src/lib/constants.ts (EVENT_TYPE)', url: `${UMAMI}/src/lib/constants.ts#L119-L125` },
		{ title: 'PostgreSQL docs, GROUP BY and HAVING Clauses', url: 'https://www.postgresql.org/docs/current/queries-table-expressions.html#QUERIES-GROUP' },
		{ title: 'PostgreSQL tutorial, Aggregate Functions', url: 'https://www.postgresql.org/docs/current/tutorial-agg.html' },
		{ title: 'PostgreSQL docs, Aggregate Functions', url: 'https://www.postgresql.org/docs/current/functions-aggregate.html' },
		{ title: 'PostgreSQL tutorial, Window Functions', url: 'https://www.postgresql.org/docs/current/tutorial-window.html' },
		{ title: 'PostgreSQL docs, Aggregate Expressions (FILTER)', url: 'https://www.postgresql.org/docs/current/sql-expressions.html#SYNTAX-AGGREGATES' }
	]
};
