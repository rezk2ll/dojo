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
		'GROUP BY lets the database do the counting where the data lives. **It folds many rows into one row per group**, and aggregates like `count` and `sum` say what each group adds up to. The tricky part is the bounce rate: it is a fact about a visit, not about an event, so **you group twice**.'
	],
	terms: [
		{ term: 'Aggregate', def: 'A function that turns many rows into one value: `count`, `sum`, `min`, `max`, `avg`. Except for `count`, they return NULL when no rows come in.' },
		{ term: 'GROUP BY', def: 'Splits the rows into groups that share the same values, then returns one row per group. Every other column in the SELECT list must be inside an aggregate, unless it depends on a grouped primary key.' },
		{ term: 'HAVING', def: 'A filter on groups, after the aggregates are computed. WHERE filters rows before grouping and cannot use aggregates.' },
		{ term: 'count(DISTINCT x)', def: 'Counts the different values of `x` in a group, not the rows. Visitors are distinct session ids, not events.' },
		{ term: 'Window function', def: 'An aggregate-like calculation with `OVER (...)` that does not fold rows: each row keeps its identity and gets a value computed from related rows.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['events[("website_event: one row per event")] -->|"WHERE website_id, date range"| rows["the week\'s events"]'],
				highlight: ['events', 'rows'],
				note: '**WHERE picks the input.** First the rows of one site and one week are selected. The docs: "WHERE selects input rows before groups and aggregates are computed". An aggregate in WHERE fails with `aggregate functions are not allowed in WHERE`.'
			},
			{
				add: ['rows -->|"GROUP BY session_id, visit_id"| visits["one row per visit: c = page views, has_custom_event"]'],
				highlight: ['visits'],
				note: '**The first fold: events into visits.** Grouping by session and visit gives one row per visit. Inside each group, `sum(case ... then 1 else 0 end)` counts the events that are not custom events or performance timings.'
			},
			{
				add: ['visits -->|"HAVING c > 0"| kept["visits with at least one view"]'],
				highlight: ['kept'],
				note: '**HAVING drops whole groups.** A visit made only of custom events has `c = 0`. HAVING removes it after the sums are known, which WHERE cannot do: when WHERE runs, the sums do not exist yet.'
			},
			{
				add: ['kept -->|"aggregate with no GROUP BY"| totals["one row: pageviews, visitors, visits, bounces"]'],
				highlight: ['totals'],
				note: '**The second fold: visits into totals.** The outer query has aggregates but no GROUP BY, so the whole input is one group. `count(distinct session_id)` gives visitors, and a bounce is a visit with exactly one view and no custom event.'
			},
			{
				add: ['rows -.->|"row_number() OVER (PARTITION BY visit_id ORDER BY created_at)"| numbered["each event keeps its row, plus its step number"]'],
				highlight: ['numbered'],
				note: '**A window does not fold.** For user journeys, Umami numbers the events of each visit with `row_number()`. The docs: window functions "do not cause rows to become grouped into a single output row". Every event stays, with its position in the visit.'
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
			'**This is the PostgreSQL path.** Umami picks `relationalQuery` when [`runQuery`](' + UMAMI + '/src/lib/db.ts#L37-L39) sees a PostgreSQL URL, and a ClickHouse query otherwise. Event types come from [`EVENT_TYPE`](' + UMAMI + '/src/lib/constants.ts#L119-L125): 2 is a custom event and 5 a performance timing, so `NOT IN (2, 5)` keeps page views, link events and pixel events.',
			'**`group by 1, 2` uses positions.** The numbers point at the first and second SELECT list items, `session_id` and `visit_id`. The docs allow "the name or ordinal number of an output column". The HAVING clause repeats the full `sum(case ...)` instead of the alias `c`.',
			'**`coalesce` because sum can be NULL.** The outer query always returns one row, even for a site with no traffic. The docs: "sum of no rows returns null, not zero as one might expect". `coalesce(sum(t.c), 0)` turns that into 0, while `count(distinct ...)` already returns 0.',
			'**Time on site from two aggregates.** Each visit keeps `min` and `max` of `created_at`. [`getTimestampDiffSQL`](' + UMAMI + '/src/lib/prisma.ts#L127-L129) turns the gap into seconds with `extract(epoch from ...)`, and the outer `sum` adds the visits up.',
			'**A window for journeys.** [`getJourney`](' + UMAMI + '/src/queries/sql/journeys/getJourney.ts#L112-L117) uses `row_number() OVER (PARTITION BY visit_id ORDER BY website_event.created_at)`. Same grouping idea, but without folding: each event gets its step number inside its visit.'
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
			'Aggregates read every matching row. On a busy site, a dashboard query over a year scans a year of events. Analytics engines exist for this (day 38).',
			'NULL rules are easy to forget: `count(x)` skips NULLs, `count(*)` does not, and `sum` of nothing is NULL.'
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
	takeaway: 'GROUP BY folds rows into one row per group and HAVING filters those groups; when a fact belongs to a visit and not to an event, group by visit first, then aggregate again.',
	sources: [
		{ title: 'PostgreSQL docs, GROUP BY and HAVING Clauses', url: 'https://www.postgresql.org/docs/current/queries-table-expressions.html#QUERIES-GROUP' },
		{ title: 'PostgreSQL tutorial, Aggregate Functions', url: 'https://www.postgresql.org/docs/current/tutorial-agg.html' },
		{ title: 'PostgreSQL docs, Aggregate Functions', url: 'https://www.postgresql.org/docs/current/functions-aggregate.html' },
		{ title: 'PostgreSQL tutorial, Window Functions', url: 'https://www.postgresql.org/docs/current/tutorial-window.html' },
		{ title: 'PostgreSQL docs, Aggregate Expressions (FILTER)', url: 'https://www.postgresql.org/docs/current/sql-expressions.html#SYNTAX-AGGREGATES' }
	]
};
