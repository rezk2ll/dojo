const ZULIP = 'https://github.com/zulip/zulip/blob/e45560dfcfc40c786c689b454ef6f4e7dc0f3eaf';
const MODELS = `${ZULIP}/zerver/models/messages.py`;
const DISC = 'https://github.com/discourse/discourse/blob/821e9e2f9f94483a3be8d1e077cde0fd94970479';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'composite-indexes',
	part: 'Inside the engine',
	title: 'Composite, partial and covering indexes',
	minutes: 10,
	hook: [
		'Your chat app shows "unread messages" for each user. The table has an index on `user_id` and one on `message_id`. The query still reads every message the user ever got, then throws away the read ones, then sorts.',
		'An index on `(user_id, message_id)` is sorted by user, then by message inside each user, so **the unread page reads one short range that is already sorted**. Add `WHERE unread` to the index itself and it holds only the rows that page asks for.',
		'The example is Zulip, whose message tables carry a comment on almost every index.'
	],
	terms: [
		{ term: 'Composite index', def: 'An index on several columns, sorted by the first, then by the second within equal firsts, and so on. Like a phone book sorted by last name, then first name.' },
		{ term: 'Leftmost prefix', def: 'The leading columns of a composite index. A B-tree on `(a, b, c)` works best when the query constrains `a`, or `a` and `b`. It can serve `(a)` alone, so a separate index on `a` is redundant.' },
		{ term: 'Partial index', def: 'An index with a `WHERE` clause: it holds only the rows that match. Smaller, cheaper to update, and usable only by queries whose condition implies that clause.' },
		{ term: 'Covering index', def: 'An index that holds every column a query needs. With `INCLUDE`, extra columns are stored in the leaf entries as payload, not as search keys.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['idx["B-tree on (realm_id, recipient_id, id): sorted by realm, then recipient, then id"]'],
				highlight: ['idx'],
				note: 'A composite index has one sort order. Entries are sorted by `realm_id`; inside one realm by `recipient_id`; inside one recipient by `id`.'
			},
			{
				add: ['q1["WHERE realm_id = 2 AND recipient_id = 9 ORDER BY id"] -->|"one contiguous range, already in id order"| idx'],
				highlight: ['q1'],
				note: 'The docs\' rule: equality on leading columns, plus an inequality on the first column without one, limit the part of the index that is scanned. Here the scan reads one slice and rows come out in `id` order: no sort node, and a `LIMIT` stops early.'
			},
			{
				add: ['q2["WHERE recipient_id = 9 only"] -.->|"no leading column: one search per realm, or a seq scan"| idx'],
				highlight: ['q2'],
				note: 'This query skips the first column, so matching rows are spread over every realm. PostgreSQL 18 can run a skip scan, one B-tree search per `realm_id`, which pays off only when there are few distinct realms. Otherwise the planner prefers another index or a sequential scan.'
			},
			{
				add: ['part["Partial: (user_profile_id, message_id) WHERE flags & 1 = 0"] -->|"only unread rows are in it"| unread["WHERE user_profile_id = 42 AND flags & 1 = 0"]'],
				highlight: ['part', 'unread'],
				note: 'Most messages are read, and the unread page never asks for them. This partial index holds only unread rows, so it is small, and a row marked read gets no entry in it. The query must contain the same condition, or the planner cannot prove the index has all the rows.'
			},
			{
				add: ['cov["(thread_id, id) INCLUDE (user_id)"] -.->|"index-only scan, no visit"| heap[("table pages")]'],
				highlight: ['cov', 'heap'],
				note: 'The search uses `thread_id` and `id`, and `INCLUDE` stores `user_id` in the leaf entries. A query that reads only those three columns can run an index-only scan and skip the table, as long as the pages are marked all-visible. Payload columns are not search keys and are not checked for uniqueness.'
			}
		]
	},
	example: {
		title: 'zerver/models/messages.py: the indexes of Zulip\'s Message table',
		repo: 'zulip/zulip',
		url: `${MODELS}#L188-L219`,
		lang: 'python',
		code: `    class Meta:
        indexes = [
            GinIndex("search_tsvector", fastupdate=False, name="zerver_message_search_tsvector"),
            models.Index(
                # For moving messages between streams or marking
                # streams as read.  The "id" at the end makes it easy
                # to scan the resulting messages in order, and perform
                # batching.
                "realm_id",
                "recipient_id",
                "id",
                name="zerver_message_realm_recipient_id",
            ),
            models.Index(
                # For generating digest emails and message archiving,
                # which both group by stream.
                "realm_id",
                "recipient_id",
                "date_sent",
                name="zerver_message_realm_recipient_date_sent",
            ),
            models.Index(
                # For exports, which want to limit both sender and
                # receiver.  The prefix of this index (realm_id,
                # sender_id) can be used for scrubbing users and/or
                # deleting users' messages.
                # Also used in send_welcome_bot_response
                "realm_id",
                "sender_id",
                "recipient_id",
                name="zerver_message_realm_sender_recipient",
            ),`,
		notes: [
			'Lines 4 to 13 serve moving the messages of a stream and marking a stream as read. Both pick one realm and one recipient, so `realm_id` and `recipient_id` lead. `id` goes last because, as the comment says, it "makes it easy to scan the resulting messages in order, and perform batching". With `id` first, the rows of every realm would be mixed together.',
			'The comment on lines 23 to 27 says the prefix `(realm_id, sender_id)` "can be used for scrubbing users and/or deleting users\' messages". Zulip goes further on [UserMessage](' + MODELS + '#L459-L466) and turns off Django\'s default index on `user_profile`. The unique index on `(user_profile_id, message_id)` covers it, "is always going to produce sorted message-id rows", and stops PostgreSQL from picking an unsorted index and sorting afterwards.',
			'The UserMessage indexes (in the sources) include `zerver_usermessage_unread_message_id` on `(user_profile, message)` with `flags__andz=...read.mask`. The matching [`where_unread()`](' + MODELS + '#L534-L539) writes the predicate as literal SQL, `flags & 1 = 0` with the constant in the text. The docs say matching "takes place at query planning time", so "parameterized query clauses do not work with a partial index".',
			'A [Discourse migration](' + DISC + '/plugins/chat/db/migrate/20260421061908_add_covering_index_on_chat_messages_thread_id.rb#L9-L14) builds `(thread_id, id)` with `include: %i[user_id]` and `where: "deleted_at IS NULL"`: a composite, covering and partial index in one Rails statement.'
		]
	},
	tradeoff: {
		gain: [
			'One well-ordered composite index can serve a filter, a sort and a `LIMIT` at once, and replace the single-column index on its first column.',
			'A partial index can be a small fraction of the full one. In a test with 2 million rows and 3% unread, the full `(user_profile_id, message_id)` index was 60 MB and the unread one 1.8 MB.',
			'A covering index turns a scan that jumps across the table into an index-only scan, with `Heap Fetches: 0` on a table vacuumed recently.'
		],
		cost: [
			'The column order that suits one query can be useless for another, and each extra index is written on every insert and on many updates.',
			'A partial index is invisible to queries that do not repeat its condition, including queries where that condition is a bind parameter.',
			'`INCLUDE` columns make every leaf entry bigger. The docs advise to "be conservative about adding non-key payload columns", and it helps only if the table changes slowly enough for pages to stay all-visible.',
			'Skip scan in PostgreSQL 18 can hide a bad column order: it is cheap when the leading column has a handful of values, and runs one search per value when it has thousands (5,001 searches in the task below).'
		]
	},
	task: {
		prompt: 'In `psql`, create `usermessage(id bigint generated always as identity primary key, user_profile_id int not null, message_id bigint not null, flags bigint not null default 0)` with 2 million rows: 5,000 users, `flags = 1` (read) for 97% of rows. Add `UNIQUE (user_profile_id, message_id)` and run `VACUUM ANALYZE`. For each query, predict the plan, then check with `EXPLAIN (ANALYZE)`: (a) the 50 latest messages of user 42; (b) the user of `message_id = 123456`; (c) the unread messages of user 42 in order. Then add a partial index for (c) and run it again, once as a plain query and once as a prepared statement with the flag as a parameter.',
		hint: 'Write each WHERE clause, then ask: does it constrain the leading column with `=`? Does the index order match the ORDER BY? For the partial index, compare its predicate with the query text.',
		answer: [
			'(a) `WHERE user_profile_id = 42 ORDER BY message_id DESC LIMIT 50` gives `Limit` over `Index Only Scan Backward using` the unique index. Equality on the first column, sort on the second: the index is read backwards, no sort.',
			'(b) `WHERE message_id = 123456` skips the leading column. On PostgreSQL 18 it ran as a skip scan: `Index Searches: 5001` and about 15,000 buffers for one row. With fewer users it would be cheap; here it needs its own index on `message_id`.',
			'(c) Before: a Bitmap Index Scan on the unique index for all 400 rows of user 42, `Rows Removed by Filter: 382`, then a `Sort`. After `CREATE INDEX ON usermessage (user_profile_id, message_id) WHERE flags & 1 = 0`: `Index Only Scan` on the partial index, 18 rows, no filter, no sort, 5 buffers. It is 1.8 MB against 60 MB for the full one.',
			'Prepared with `flags & $2 = 0` and a generic plan, the planner falls back to the unique index plus a filter: at planning time `$2` could be any value, so it cannot prove the query only wants unread rows. Keep the constant in the SQL text, as Zulip\'s `where_unread()` does.'
		]
	},
	quiz: [
		{
			q: 'A table has an index on `(tenant_id, created_at)`. Which query uses it best?',
			options: [
				'`WHERE created_at > now() - interval \'1 day\'` across all tenants',
				'`WHERE tenant_id = 7 ORDER BY created_at DESC LIMIT 20`',
				'`WHERE tenant_id > 7 AND created_at = \'2026-01-01\'`',
				'`ORDER BY created_at DESC LIMIT 20` with no WHERE clause'
			],
			answer: 1,
			why: 'Equality on the leading column, then a sort on the next one, reads one slice of the index already in order, and the LIMIT stops after 20 entries. The other queries either skip `tenant_id` or use a range on it, so the `created_at` order is broken up.'
		},
		{
			q: 'You have `CREATE INDEX ... ON jobs (run_at) WHERE state = \'queued\'`. Which query can the planner answer with it?',
			options: [
				'`SELECT * FROM jobs WHERE run_at < now() ORDER BY run_at`',
				'`SELECT * FROM jobs WHERE state = $1 AND run_at < now()`',
				'`SELECT * FROM jobs WHERE state = \'queued\' AND run_at < now()`',
				'`SELECT * FROM jobs WHERE state <> \'done\' AND run_at < now()`'
			],
			answer: 2,
			why: 'A partial index is usable only when the query\'s WHERE clause implies the index predicate at planning time. Without the condition, with a bind parameter, or with a different condition that is not proved to imply it, the planner cannot know the index holds every matching row.'
		},
		{
			q: 'Why add `INCLUDE (user_id)` to an index on `(thread_id, id)` instead of making it `(thread_id, id, user_id)`?',
			options: [
				'Payload columns stay out of the search key, so a unique index stays unique on its key alone',
				'INCLUDE columns are compressed, so the index is always smaller than the three-column one',
				'Only INCLUDE columns can be returned by an index-only scan, key columns never are',
				'INCLUDE makes PostgreSQL keep the column out of the table, so each row is stored once'
			],
			answer: 0,
			why: 'INCLUDE columns are stored only in the leaf entries and are not part of the key. A unique index then checks uniqueness on the key columns only, and the upper levels of the tree stay small. Key columns can be returned by an index-only scan too, and the table still holds every column.'
		}
	],
	recall: {
		q: 'In which order do you put the columns of an index for `WHERE realm_id = 2 AND recipient_id = 9 ORDER BY id`, and why?',
		a: '`(realm_id, recipient_id, id)`: the equality columns first, then the sort column. The scan reads one contiguous slice already in `id` order, so there is no sort node and a `LIMIT` stops early.'
	},
	sources: [
		{ title: 'Zulip, zerver/models/messages.py, UserMessage indexes', url: `${MODELS}#L591-L596` },
		{ title: 'PostgreSQL 18 docs, Multicolumn Indexes', url: 'https://www.postgresql.org/docs/18/indexes-multicolumn.html' },
		{ title: 'PostgreSQL 18 docs, Partial Indexes', url: 'https://www.postgresql.org/docs/18/indexes-partial.html' },
		{ title: 'PostgreSQL 18 docs, Index-Only Scans and Covering Indexes', url: 'https://www.postgresql.org/docs/18/indexes-index-only-scans.html' },
		{ title: 'Django docs, Index options (condition, include)', url: 'https://docs.djangoproject.com/en/5.2/ref/models/indexes/' }
	]
};
