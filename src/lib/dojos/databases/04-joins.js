const DISCOURSE = 'https://github.com/discourse/discourse/blob/821e9e2f9f94483a3be8d1e077cde0fd94970479';
const JOB = `${DISCOURSE}/app/jobs/scheduled/reindex_search.rb`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'joins',
	part: 'Data and questions',
	title: 'Joins',
	minutes: 10,
	hook: [
		'Your forum\'s admin page shows each topic with its number of posts. It was right. Then someone added the topic\'s tags to the same query, and **a topic with 3 posts and 2 tags now shows 6 posts**.',
		'The database returned what the query asked for. **A join pairs rows**: each post meets each tag of its topic, so 3 posts times 2 tags gives 6 rows, and `count` counts rows.',
		'Joins are how a relational database answers any question that spans two tables. To use them without surprises, you need to know which rows survive a join, how many copies of each row it makes, and how to ask for rows that have no match at all.'
	],
	terms: [
		{ term: 'Inner join', def: '`A JOIN B ON ...` keeps only the pairs where the condition is true. A row of A with no match in B disappears.' },
		{ term: 'Left join', def: '`A LEFT JOIN B ON ...` keeps every row of A. When B has no match, the B columns are NULL.' },
		{ term: 'Fan-out', def: 'One row of A that matches 5 rows of B gives 5 rows in the result. Join two such tables and the counts multiply.' },
		{ term: 'Anti-join', def: 'Rows of A with no match in B: `NOT EXISTS (...)`, or a left join followed by `WHERE b.id IS NULL`.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['topics[("topics: 1, 2, 3")] -->|"JOIN ON posts.topic_id = topics.id"| inner["4 rows: topic 1 three times, topic 2 once"]', 'posts[("posts: 10, 11, 12 on topic 1, 20 on topic 2")] --> inner'],
				highlight: ['inner'],
				note: 'An inner join pairs matching rows. The docs: "For each row R1 of T1, the joined table has a row for each row in T2 that satisfies the join condition with R1." Topic 1 has three posts, so it appears three times. Topic 3 has none, so it is gone.'
			},
			{
				add: ['topics -->|"LEFT JOIN"| left["5 rows: topic 3 is back, with NULL post columns"]'],
				highlight: ['left'],
				note: 'A left join keeps every row of the left table: "The joined table always has at least one row for each row in T1." Topic 3 comes back once, with NULL in every posts column. `count(posts.id)` gives 0 for it, because count skips NULLs.'
			},
			{
				add: ['tags[("tags: x, y on topic 1")] -->|"LEFT JOIN tags too"| fan["topic 1: 3 posts x 2 tags = 6 rows"]', 'left --> fan'],
				highlight: ['fan'],
				note: 'Each of topic 1\'s three rows now meets both of its tags. `count(posts.id)` now says 6. The fix is `count(DISTINCT posts.id)`, or better, count posts and tags in separate subqueries and join the totals.'
			},
			{
				add: ['anti["NOT EXISTS: topics with no post"] -->|"keeps"| t3["topic 3"]', 'topics --> anti'],
				highlight: ['anti', 't3'],
				note: 'An anti-join keeps the rows with no match: `WHERE NOT EXISTS (SELECT 1 FROM posts WHERE posts.topic_id = topics.id)` keeps topics without a post. EXISTS stops at the first matching row. On PostgreSQL 18 the plan shows an Anti Join node.'
			}
		]
	},
	example: {
		title: 'app/jobs/scheduled/reindex_search.rb: Discourse finds search rows that lost their topic',
		repo: 'discourse/discourse',
		url: `${JOB}#L74-L148`,
		lang: 'ruby',
		code: `    def clean_topics
      puts "cleaning up topic search data" if @verbose

      # remove search data from deleted topics

      DB.exec(<<~SQL, deleted_at: @cleanup_grace_period)
        DELETE FROM topic_search_data
         WHERE topic_id IN (
          SELECT topic_id
            FROM topic_search_data
       LEFT JOIN topics ON topic_id = topics.id
           WHERE topics.id IS NULL
              OR (deleted_at IS NOT NULL AND deleted_at <= :deleted_at)
          )
      SQL
    end

    def clean_posts
      puts "cleaning up post search data" if @verbose

      # remove search data from deleted/empty posts

      DB.exec(<<~SQL, deleted_at: @cleanup_grace_period)
        DELETE FROM post_search_data
         WHERE post_id IN (
          SELECT post_id
            FROM post_search_data
       LEFT JOIN posts ON post_id = posts.id
            JOIN topics ON posts.topic_id = topics.id
           WHERE posts.id IS NULL
              OR posts.raw = ''
              OR (posts.deleted_at IS NOT NULL AND posts.deleted_at <= :deleted_at)
              OR (topics.deleted_at IS NOT NULL AND topics.deleted_at <= :deleted_at)
          )
      SQL
    end
…
    def load_problem_topic_ids(limit)
      Topic
        .joins("LEFT JOIN topic_search_data ON topic_id = topics.id")
        .where(
          "topic_search_data.locale IS NULL OR topic_search_data.locale != ? OR topic_search_data.version != ?",
          SiteSetting.default_locale,
          SearchIndexer::TOPIC_INDEX_VERSION,
        )
        .order("topics.id DESC")
        .limit(limit)
        .pluck(:id)
    end`,
		notes: [
			'Line 11 of `clean_topics` reads `topic_search_data LEFT JOIN topics`, which keeps every search row. When the topic is gone, `topics.id` is NULL, and `WHERE topics.id IS NULL` picks exactly those rows. The `OR` adds topics soft-deleted before [`@cleanup_grace_period`](' + JOB + '#L9), one day ago.',
			'In `clean_posts`, line 28 `LEFT JOIN posts` is followed by line 29 `JOIN topics ON posts.topic_id = topics.id`. A search row whose post is gone has NULL in `posts.topic_id`, and NULL matches no topic, so the inner join drops it. As written, `posts.id IS NULL` on line 30 can never be true, while the soft-delete branches still work. Making line 29 a LEFT JOIN brings the missing rows back.',
			'In lines 38 to 49, `load_problem_topic_ids` starts from `topics` and left joins the search data: a topic with no search row, or a stale `version`, needs reindexing. `topic_id` is the [primary key](' + DISCOURSE + '/app/models/topic_search_data.rb#L15) of `topic_search_data`, so each topic matches at most one row and the join cannot fan out.',
			'Both jobs could use `NOT EXISTS` instead of the left join. The docs describe how it runs: "The subquery will generally only be executed long enough to determine whether at least one row is returned". The left join form makes it easy to add more conditions with `OR`, as both jobs do.'
		]
	},
	tradeoff: {
		gain: [
			'One query answers a question across tables, and the database picks the join method (nested loop, hash or merge) for you.',
			'A left join keeps rows with no match, so "topics with 0 posts" shows up instead of silently vanishing.',
			'An anti-join finds orphans and gaps directly: rows to clean up, records still to index.'
		],
		cost: [
			'A join through two one-to-many relations multiplies rows, and `count` or `sum` overcount without any error.',
			'`count(DISTINCT ...)` hides the fan-out but still builds all the extra rows first.',
			'In a left join, moving a condition from ON to WHERE changes the result. The docs: a condition in ON "is processed before the join", one in WHERE "after the join", and "it matters a lot with outer joins".',
			'One inner join placed after a left join can quietly turn it back into an inner join, as Discourse\'s `clean_posts` shows.'
		]
	},
	task: {
		prompt: 'Tables: `topics(id)`, `posts(id, topic_id)`, `tags(topic_id, name)`. In `psql`, write: (1) every topic with its number of posts, including topics with none; (2) every topic with its post count and its tag count, with no overcounting; (3) the topics that have no post, two ways.',
		hint: 'For (2), ask what one row of the joined result stands for. If it stands for "a post and a tag", count something that is one row per post.',
		answer: [
			'(1) `SELECT t.id, count(p.id) FROM topics t LEFT JOIN posts p ON p.topic_id = t.id GROUP BY t.id;` Use `count(p.id)`, not `count(*)`: the unmatched row has a NULL `p.id` and must count as 0.',
			'(2) Aggregate before joining: `SELECT t.id, coalesce(p.n, 0) AS posts, coalesce(g.n, 0) AS tags FROM topics t LEFT JOIN (SELECT topic_id, count(*) AS n FROM posts GROUP BY topic_id) p ON p.topic_id = t.id LEFT JOIN (SELECT topic_id, count(*) AS n FROM tags GROUP BY topic_id) g ON g.topic_id = t.id;` Each subquery gives one row per topic, so nothing multiplies.',
			'(2, shortcut) `count(DISTINCT p.id)` and `count(DISTINCT g.name)` give the same numbers here, but the join still builds 3 x 2 rows for topic 1 before counting.',
			'(3) `SELECT t.id FROM topics t WHERE NOT EXISTS (SELECT 1 FROM posts p WHERE p.topic_id = t.id);` or `SELECT t.id FROM topics t LEFT JOIN posts p ON p.topic_id = t.id WHERE p.id IS NULL;` Check both against your data: topic 3 only.'
		]
	},
	quiz: [
		{
			q: 'A topic has 3 posts and 2 tags. `SELECT count(p.id) FROM topics t LEFT JOIN posts p ON ... LEFT JOIN tags g ON ... WHERE t.id = 1` returns what?',
			options: [
				'3, because count only looks at the posts table it was given',
				'5, because the joins add the tag rows after the post rows',
				'6, because each of the 3 post rows is paired with both tags',
				'2, because the last join decides how many rows come back'
			],
			answer: 2,
			why: 'Both joins start from the topic, so every post meets every tag: 3 x 2 = 6 rows, each with a non-NULL `p.id`. Count the posts in a subquery first, or use `count(DISTINCT p.id)`.'
		},
		{
			q: 'You want every topic with its count of posts written after Monday, 0 for the others. Where does `p.created_at > \'2026-10-12\'` go?',
			options: [
				'In WHERE, because filters on the joined table always belong there',
				'In the ON clause of the LEFT JOIN, so unmatched topics are kept',
				'In a HAVING clause, because the count is computed by GROUP BY',
				'Anywhere: with a left join, ON and WHERE give the same result'
			],
			answer: 1,
			why: 'In WHERE, the condition runs after the join, and a topic with no recent post has NULL there, so it is dropped. In ON, it only decides which posts match. The docs: it "matters a lot with outer joins".'
		},
		{
			q: 'Discourse\'s `clean_posts` reads `post_search_data LEFT JOIN posts ... JOIN topics ON posts.topic_id = topics.id WHERE posts.id IS NULL OR ...`. What happens to a search row whose post was hard-deleted?',
			options: [
				'It is deleted, because the left join gives it a NULL `posts.id`',
				'It is kept, because NULL `posts.topic_id` matches no topic in the inner join',
				'It is deleted, because the inner join falls back to a left join on NULL',
				'The query fails, because a JOIN cannot follow a LEFT JOIN in PostgreSQL'
			],
			answer: 1,
			why: 'The left join produces the row with NULL post columns, then the inner join needs `posts.topic_id = topics.id`, which is never true for NULL. The row is gone before WHERE runs. NULL comparisons get their own chapter (day 6).'
		}
	],
	recall: {
		q: 'A topic has 3 posts and 2 tags. Why does a query that left joins both tables count 6 posts, and how do you get 3?',
		a: 'Each post row pairs with each tag, so the join makes 3 x 2 = 6 rows. Count the posts per topic in a subquery before the join, or use `count(DISTINCT p.id)`.'
	},
	sources: [
		{ title: 'Discourse, reindex_search.rb (load_problem_topic_ids)', url: `${JOB}#L137-L148` },
		{ title: 'PostgreSQL docs, Joined Tables', url: 'https://www.postgresql.org/docs/current/queries-table-expressions.html#QUERIES-JOIN' },
		{ title: 'PostgreSQL docs, Subquery Expressions (EXISTS)', url: 'https://www.postgresql.org/docs/current/functions-subquery.html' },
		{ title: 'PostgreSQL tutorial, Joins Between Tables', url: 'https://www.postgresql.org/docs/current/tutorial-join.html' },
		{ title: 'PostgreSQL docs, Planner/Optimizer (join methods)', url: 'https://www.postgresql.org/docs/current/planner-optimizer.html' },
		{ title: 'PostgreSQL docs, Aggregate Functions (count)', url: 'https://www.postgresql.org/docs/current/functions-aggregate.html' }
	]
};
