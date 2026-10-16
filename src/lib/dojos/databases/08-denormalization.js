const DISCOURSE = 'https://github.com/discourse/discourse/blob/821e9e2f9f94483a3be8d1e077cde0fd94970479';
const RAILS = 'https://github.com/rails/rails/blob/ccaef690ee7a1f1d02642edd5f710daf031e7e04/activerecord/lib/active_record';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'denormalization',
	part: 'Data and questions',
	title: 'Denormalization: copying data on purpose',
	minutes: 10,
	hook: [
		'A forum lists its tags with a number next to each one: "sql, 1,204 topics". Counting that from `topic_tags` on every page view means a join and a `count` for every tag, for every visitor.',
		'So Discourse **stores the count on the tag row**. That breaks yesterday\'s rule: the number is a second copy of a fact `topic_tags` already holds. Storing such a copy on purpose, for fast reads, is called denormalization.',
		'A copy can drift from its source: a write changes one and not the other. So each copy needs code that updates it on every write, and a job that finds and fixes the rows that are wrong.'
	],
	terms: [
		{ term: 'Denormalization', def: 'Storing a fact a second time, on purpose, so that reads are cheaper. The original stays the source of truth.' },
		{ term: 'Source of truth', def: 'The data a copy is computed from. If the two disagree, the source wins and the copy is rebuilt.' },
		{ term: 'Counter cache', def: 'A count stored on the parent row, like `tags.public_topic_count`, updated each time a child row is added or removed.' },
		{ term: 'Drift', def: 'The copy no longer matches its source, because some write changed one and not the other.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['src[("topic_tags: source of truth")] --> count["count per tag, on every page view"]'],
				highlight: ['src', 'count'],
				note: 'In the normalized schema, the number of topics per tag is already in `topic_tags`. Reading it means a join and a `GROUP BY` (day 5) each time. The result is always correct, and the query is too slow for a page every visitor loads.'
			},
			{
				add: ['src -->|"after_create +1, after_destroy -1"| cache[("tags.public_topic_count")]'],
				highlight: ['cache'],
				note: 'Discourse\'s `TopicTag` model has callbacks that add 1 or remove 1 from the tag\'s counters. Rails runs `save` and `destroy` callbacks inside the same transaction as the write, so the row and the count commit together.'
			},
			{
				add: ['bulk["update_all, raw SQL, a console fix"] -.->|"skips the callbacks"| src', 'cache --- wrong["Count is now wrong"]'],
				highlight: ['bulk', 'wrong'],
				note: 'The copy is only right if **every** write goes through the code that updates it. Rails says `update_all` "does not trigger Active Record callbacks or validations". A bulk delete, a migration or a hand-written SQL fix changes the source and leaves the counter behind, and none of them raises an error.'
			},
			{
				add: ['job["EnsureDbConsistency, every 12 hours"] -->|"recount, fix rows that differ"| cache'],
				highlight: ['job'],
				note: 'Discourse runs a job every 12 hours that recomputes counts from the source and writes only the rows that are wrong. A count that drifts stays wrong until the next run, up to 12 hours later.'
			},
			{
				add: ['mv[("materialized view")] -->|"REFRESH: recompute everything"| mv2["Fresh until the next write"]'],
				highlight: ['mv', 'mv2'],
				note: 'A materialized view is a second kind of copy: PostgreSQL stores a query result like a table. The docs: "REFRESH MATERIALIZED VIEW completely replaces the contents of a materialized view." Between refreshes it is stale. Without `CONCURRENTLY`, a refresh can block readers, and `CONCURRENTLY` needs a unique index on the view.'
			}
		]
	},
	example: {
		title: 'app/models/tag.rb: Discourse recounts topics per tag and fixes the rows that drifted',
		repo: 'discourse/discourse',
		url: `${DISCOURSE}/app/models/tag.rb#L83-L126`,
		lang: 'ruby',
		code: `  def self.ensure_consistency!
    update_topic_counts
  end

  def self.update_topic_counts
    DB.exec <<~SQL
      UPDATE tags t
         SET staff_topic_count = x.topic_count
        FROM (
             SELECT COUNT(topics.id) AS topic_count, tags.id AS tag_id
               FROM tags
          LEFT JOIN topic_tags ON tags.id = topic_tags.tag_id
          LEFT JOIN topics ON topics.id = topic_tags.topic_id
                          AND topics.deleted_at IS NULL
                          AND topics.archetype != 'private_message'
           GROUP BY tags.id
        ) x
       WHERE x.tag_id = t.id
         AND x.topic_count <> t.staff_topic_count
    SQL
…
    DB.exec <<~SQL
      UPDATE tags t
      SET public_topic_count = x.topic_count
      FROM (
        WITH tags_with_public_topics AS (
          SELECT
            COUNT(topics.id) AS topic_count,
            tags.id AS tag_id
          FROM tags
          INNER JOIN topic_tags ON tags.id = topic_tags.tag_id
          INNER JOIN topics ON topics.id = topic_tags.topic_id AND topics.deleted_at IS NULL AND topics.archetype != 'private_message'
          INNER JOIN categories ON categories.id = topics.category_id AND NOT categories.read_restricted
          GROUP BY tags.id
        )
        SELECT
          COALESCE(tags_with_public_topics.topic_count, 0 ) AS topic_count,
          tags.id AS tag_id
        FROM tags
        LEFT JOIN tags_with_public_topics ON tags_with_public_topics.tag_id = tags.id
      ) x
      WHERE x.tag_id = t.id
      AND x.topic_count <> t.public_topic_count;
    SQL`,
		notes: [
			'On the write path, [`TopicTag`](' + DISCOURSE + '/app/models/topic_tag.rb#L7-L47) calls `Tag.update_counters(tag.id, ...)` with `+1` after a create and `-1` after a destroy. Rails turns that into one statement, `SET comments_count = COALESCE(comments_count, 0) + 1`, so the database adds to the current value instead of the app writing back a number it read earlier.',
			'The Rails doc of [`reset_counters`](' + RAILS + '/counter_cache.rb#L14-L16) says it is for "when adding new counter caches, or if the counter has been corrupted or modified directly by SQL". Discourse writes its own recount, and it holds rules a plain count would miss: only live topics, no private messages, and for the public count, no read-restricted categories.',
			'Lines 1 to 3 are the entry point for the repair job. [`EnsureDbConsistency`](' + DISCOURSE + '/app/jobs/scheduled/ensure_db_consistency.rb#L5-L46) runs `every 12.hours` and calls `ensure_consistency!` on twenty models, `Tag` among them. Each call is wrapped in `rescue`, so one failing model is logged and the others still run.',
			'Line 19, `x.topic_count <> t.staff_topic_count`, skips the tags that are already right. PostgreSQL\'s normal behavior "always performs a physical row update regardless of whether or not the data has changed" (day 16), so this filter keeps a full recount cheap.',
			'Lines 26 to 35: in the public count, the `INNER JOIN` subquery only has tags that still have public topics. In lines 36 to 40, the outer `LEFT JOIN` from `tags` with `COALESCE(..., 0)` gives every other tag a 0. Without it, the recount would never reset a tag that lost its last public topic (NULL rules, day 6).'
		]
	},
	tradeoff: {
		gain: [
			'A read loads one column on a row you load anyway, instead of running a join and a count.',
			'You can index the copy, so "tags ordered by topic count" or "top products by reviews" reads a few index pages.',
			'A materialized view computes a heavy report once, and every reader shares the result.'
		],
		cost: [
			'Every write path must update the copy: the model, the bulk scripts, the migrations, the admin console. Miss one and the copy drifts without an error.',
			'You need a repair job, and it costs real load: Discourse recounts every tag twice a day.',
			'A counter on a popular parent row is a hot spot. Each new child updates the same row, and concurrent updates to one row wait for each other\'s locks.',
			'A materialized view is stale between refreshes, and a refresh without `CONCURRENTLY` can block the readers it was meant to help.'
		]
	},
	task: {
		prompt: 'Your shop shows "4.5 stars, 2 reviews" on every product card. Add a copy to `products(id, name)` so the card needs no join to `reviews(id, product_id, rating)`. Say which columns you add, which writes must update them, and write the SQL that finds and fixes drift.',
		hint: 'Can you keep an average correct with only +1 and -1 updates? What do you need to store instead?',
		answer: [
			'Add `reviews_count int NOT NULL DEFAULT 0` and `rating_sum int NOT NULL DEFAULT 0`, not an average. A sum and a count can be adjusted on each insert or delete. The card computes `rating_sum::numeric / NULLIF(reviews_count, 0)`.',
			'Writes to update: insert a review (+1, +rating), delete one (-1, -rating), and change a rating (add the difference). Do it in the same transaction as the review write, as one `UPDATE products SET reviews_count = reviews_count + 1, rating_sum = rating_sum + $1 WHERE id = $2`.',
			'Repair: `UPDATE products p SET reviews_count = x.n, rating_sum = x.s FROM (SELECT p2.id, count(r.id) AS n, COALESCE(sum(r.rating), 0) AS s FROM products p2 LEFT JOIN reviews r ON r.product_id = p2.id GROUP BY p2.id) x WHERE x.id = p.id AND (p.reviews_count <> x.n OR p.rating_sum <> x.s)`.',
			'Run it on a schedule, and log the number of rows it fixed. That number should be zero. When it is not, some write path forgot the copy, and the log tells you when it started.'
		]
	},
	quiz: [
		{
			q: 'A cleanup script runs `TopicTag.where(tag_id: 7).delete_all`. What happens to `tags.public_topic_count` for tag 7?',
			options: [
				'It keeps its old value until the next recount fixes it',
				'It drops by the number of deleted rows, through the callbacks',
				'The delete fails, because the counter still refers to those rows',
				'PostgreSQL recomputes it at once, as it does for indexes'
			],
			answer: 0,
			why: '`delete_all` sends one SQL statement and runs no callbacks, so the `after_destroy` that decrements the counter never fires. The counter has drifted, and only a recount like `EnsureDbConsistency` puts it right.'
		},
		{
			q: 'Why does Discourse\'s recount end with `AND x.topic_count <> t.public_topic_count`?',
			options: [
				'To avoid a division by zero for tags that have no topics',
				'Because `UPDATE ... FROM` needs an inequality to join two tables',
				'To rewrite only the tags that drifted, not every tag on each run',
				'To skip the tags that another transaction has locked'
			],
			answer: 2,
			why: 'Without it, every run would rewrite every tag, and each `UPDATE` in PostgreSQL leaves a new row version behind, even for the same value. With it, a run where nothing drifted writes nothing.'
		},
		{
			q: 'A dashboard reads a materialized view that a cron job refreshes each night with `REFRESH MATERIALIZED VIEW` (no `CONCURRENTLY`). What is true?',
			options: [
				'Readers always see live data, since the refresh only rebuilds indexes',
				'Between refreshes it shows last night\'s data, and a refresh can block reads',
				'The view updates itself after each write to the tables it reads from',
				'Each refresh adds only the rows that changed since the previous refresh'
			],
			answer: 1,
			why: 'PostgreSQL stores the view\'s result, and the result changes only on `REFRESH`, which replaces its whole contents. Without `CONCURRENTLY`, that refresh can block readers; with it, the view needs a unique index.'
		}
	],
	recall: {
		q: 'A script deletes rows with `delete_all`. Why is Discourse\'s `tags.public_topic_count` now wrong, and what fixes it?',
		a: '`delete_all` runs no callbacks, so the `-1` never runs. The `EnsureDbConsistency` job recounts from `topic_tags` every 12 hours and rewrites the tags whose count differs.'
	},
	sources: [
		{ title: 'Rails, counter_cache.rb update_counters', url: `${RAILS}/counter_cache.rb#L108-L124` },
		{ title: 'PostgreSQL docs, REFRESH MATERIALIZED VIEW', url: 'https://www.postgresql.org/docs/current/sql-refreshmaterializedview.html' },
		{ title: 'PostgreSQL docs, Materialized Views', url: 'https://www.postgresql.org/docs/current/rules-materializedviews.html' },
		{ title: 'Rails API, ActiveRecord::CounterCache', url: 'https://api.rubyonrails.org/classes/ActiveRecord/CounterCache/ClassMethods.html' },
		{ title: 'Rails Guides, Active Record Associations: counter_cache', url: 'https://guides.rubyonrails.org/association_basics.html#counter-cache' }
	]
};
