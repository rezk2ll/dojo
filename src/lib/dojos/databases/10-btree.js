const PG = 'https://github.com/postgres/postgres/blob/26bd08fb5c069fbdf55867adc398cfca0f55d5c8/src/backend/access/nbtree';
const README = `${PG}/README`;
const SEARCH = `${PG}/nbtsearch.c`;
const SPLITLOC = `${PG}/nbtsplitloc.c`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'btree',
	part: 'Inside the engine',
	title: 'B-tree indexes',
	minutes: 10,
	hook: [
		'`SELECT * FROM users WHERE id = 424242` on a table of a million rows answers in a fraction of a millisecond. Without an index, the same query reads all of the table\'s 7,300 pages. With one, it reads **four pages**.',
		'That index is a B-tree: a shallow tree of 8 KB pages, where each page splits the key range into a few hundred smaller ranges. **Each level you go down divides the search by a few hundred.** With a `bigint` key, a million rows fit in three levels, a hundred million in four.',
		'The same tree keeps its keys sorted, so it also serves `BETWEEN`, `ORDER BY ... LIMIT` and `UNIQUE`. In return, **every insert also writes to every index** on the table.'
	],
	terms: [
		{ term: 'B-tree', def: 'A balanced tree of pages. Every path from the root to a leaf has the same length, so every lookup costs the same number of page reads.' },
		{ term: 'Root, internal, leaf', def: 'The root is the top page. Internal pages hold separator keys and links to the level below. Leaf pages hold every key with the ctid of its row.' },
		{ term: 'Fan-out', def: 'How many children one internal page points to. With small keys it is in the hundreds, which keeps the tree only a few levels deep.' },
		{ term: 'Page split', def: 'When an insert does not fit on a leaf, part of its entries move to a new page and the parent gets a new separator. Splits can climb up to the root.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['root["Root page: 10 separator keys"]'],
				highlight: ['root'],
				note: 'The real index on `users(id)` with a million rows has one root page with 10 entries. Each entry says "keys from here to here are below this link". Inside a page, PostgreSQL finds the right entry with a binary search.'
			},
			{
				add: ['root -->|"424242 is in this range"| inner["Internal page: about 270 separators"]'],
				highlight: ['inner'],
				note: 'One level down, there are 10 internal pages, each pointing to about 270 leaves. The search reads exactly one page per level, so **the number of index pages read equals the number of levels**, three here.'
			},
			{
				add: ['inner --> leaf["Leaf page: sorted (key, ctid) pairs"]', 'leaf -->|"ctid (3119,58)"| heap[("Heap page 3119")]'],
				highlight: ['leaf', 'heap'],
				note: 'The leaf holds `424242` next to its ctid, `(3119,58)`: page 3119 of the table, line pointer 58 (day 9). One more read fetches that heap page. Root, internal, leaf, heap: four pages out of more than 7,000.'
			},
			{
				add: ['leaf -->|"right-link"| leaf2["Next leaf: the following keys"]'],
				highlight: ['leaf2'],
				note: 'Each page links to its left and right neighbor on the same level, in key order. For `id BETWEEN 1000 AND 1100`, PostgreSQL goes down once to 1000, then follows the right-links. The README: the scan "looks only at leaf pages and never at higher tree levels". The rows come out in key order, with no sort step.'
			},
			{
				add: ['ins["INSERT into a full leaf"] -->|"split: move entries to a new page"| leaf', 'leaf -.->|"new separator"| inner'],
				highlight: ['ins'],
				note: 'Every insert adds an entry to every index on the table. When a leaf is full it splits, and the parent gets a new separator. The docs: "Page splits must also insert a new downlink to the new page in the parent page, which may cause the parent to split in turn." A root split adds a level.'
			}
		]
	},
	example: {
		title: 'src/backend/access/nbtree/nbtsearch.c: _bt_search goes down one level per loop',
		repo: 'postgres/postgres',
		url: SEARCH + '#L101-L188',
		lang: 'c',
		code: `BTStack
_bt_search(Relation rel, Relation heaprel, BTScanInsert key, Buffer *bufP,
		   int access, bool returnstack)
{
…
	/* Get the root page to start with */
	*bufP = _bt_getroot(rel, heaprel, access);

	/* If index is empty and access = BT_READ, no root page is created. */
	if (!BufferIsValid(*bufP))
		return (BTStack) NULL;

	/* Loop iterates once per level descended in the tree */
	for (;;)
	{
		Page		page;
		BTPageOpaque opaque;
		OffsetNumber offnum;
		ItemId		itemid;
		IndexTuple	itup;
		BlockNumber child;
		BTStack		new_stack;

…
		*bufP = _bt_moveright(rel, heaprel, key, *bufP, (access == BT_WRITE),
							  stack_in, page_access);

		/* if this is a leaf page, we're done */
		page = BufferGetPage(*bufP);
		opaque = BTPageGetOpaque(page);
		if (P_ISLEAF(opaque))
			break;

		/*
		 * Find the appropriate pivot tuple on this page.  Its downlink points
		 * to the child page that we're about to descend to.
		 */
		offnum = _bt_binsrch(rel, key, *bufP);
		itemid = PageGetItemId(page, offnum);
		itup = (IndexTuple) PageGetItem(page, itemid);
		Assert(BTreeTupleIsPivot(itup) || !key->heapkeyspace);
		child = BTreeTupleGetDownLink(itup);
…
		/* drop the read lock on the page, then acquire one on its child */
		*bufP = _bt_relandgetbuf(rel, *bufP, child, page_access);

		/* okay, all set to move down a level */
	}`,
		notes: [
			'Line 13: "Loop iterates once per level descended in the tree". On each internal page, line 38, [`_bt_binsrch`](' + SEARCH + '#L155-L159) binary searches for the pivot tuple whose downlink covers the key, then line 45, `_bt_relandgetbuf`, drops the lock on this page and takes one on the child. Lines 31 and 32 stop the loop at the first leaf.',
			'Readers do not lock the path from the root. On line 25, `_bt_moveright` handles a race: its comment warns the page "may have split since we read its downlink in its parent page". The [README](' + README + '#L17-L22) explains the design taken from Lehman and Yao: a right-link and a "high key" on each page let a search detect a concurrent split and move right, which "allows the tree to be searched without holding any read locks (except to keep a single page from being modified while reading it)".',
			'A range scan never climbs back up. The [README](' + README + '#L70-L75) on scans: "once we have descended the tree to the correct start point for the scan, the scan looks only at leaf pages and never at higher tree levels". A left-link on each page allows the same walk backwards, for `ORDER BY id DESC`.',
			'Increasing keys fill pages well. When the rightmost leaf splits, [`nbtsplitloc.c`](' + SPLITLOC + '#L95-L99) leaves the left page fillfactor% full (90 by default for B-trees), so "when we are inserting successively increasing keys (consider sequences, timestamps, etc) we will end up with a tree whose pages are about fillfactor% full, instead of the 50% full result". The README adds a fast path that caches the rightmost leaf and skips the descent.'
		]
	},
	tradeoff: {
		gain: [
			'A lookup costs a few page reads, and that number grows by one each time the table grows a few hundred times.',
			'Keys are sorted: `<`, `<=`, `BETWEEN`, `IN`, `ORDER BY ... LIMIT` and `LIKE \'foo%\'` (with the right collation or operator class) can all use it.',
			'Only B-tree indexes can be declared unique in PostgreSQL, so every `UNIQUE` and `PRIMARY KEY` is one.'
		],
		cost: [
			'Every `INSERT` and `DELETE`, and every `UPDATE` that is not a heap-only tuple update, writes to every index. Five indexes, five extra writes per row.',
			'Indexes take space and cache: here, 21 MB of index for a 57 MB table, for one `bigint` column.',
			'Random keys such as UUIDv4 land on random leaves. Inserts touch pages all over the index and split them, instead of filling the rightmost leaf.',
			'A B-tree only helps when the query matches its order: `WHERE email LIKE \'%@example.com\'` still reads the whole table.'
		]
	},
	task: {
		prompt: 'In `psql`: create `users(id bigint, email text)`, insert a million rows with `generate_series`, `CREATE INDEX ON users(id)` and `VACUUM ANALYZE users`. Predict how many index levels there are and how many pages `id = 424242` reads, then check with `CREATE EXTENSION pageinspect; SELECT level FROM bt_metap(\'users_id_idx\');` and `EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM users WHERE id = 424242`. Last, on paper: how many levels for 100 million rows?',
		hint: 'A leaf holds about 370 `bigint` keys. An internal page points to a few hundred children. Count how many times you must divide.',
		answer: [
			'1,000,000 / 370 is about 2,700 leaf pages. An internal page points to a few hundred leaves, so about 10 internal pages, and one root above them. Three levels.',
			'`bt_metap` reports `level = 2`: levels are counted from 0 at the leaves, so 2 means root, one internal level, leaves. The index is about 2,750 pages.',
			'The plan shows an `Index Scan`. Run it twice: the second run says `Buffers: shared hit=4`, the root, one internal page, one leaf and one heap page. (The first run in a session reads a few more, such as the index metapage.) A `Seq Scan` would read every page of the table.',
			'100 million rows: about 270,000 leaves, about 1,000 internal pages above them, a few pages above those, then the root. Four levels: one more read for a table a hundred times bigger.'
		],
		steps: [
			{
				title: 'Predict the levels',
				questions: [
					{ q: 'A leaf holds about 370 `bigint` keys. How many leaf pages for a million rows?', options: ['About 370', 'About 2,700', 'About 27,000', 'About 7,300'], answer: 1, why: '1,000,000 / 370 is about 2,700.' },
					{ q: 'An internal page points to a few hundred children. How many internal pages sit above those leaves?', options: ['About 10', 'About 270', 'About 2,700', 'Exactly 1'], answer: 0, why: '2,700 leaves divided by a few hundred gives about 10 pages.' },
					{ q: 'How many levels does the tree have?', options: ['Two', 'Four', 'Five', 'Three'], answer: 3, why: 'Leaves, one internal level of about 10 pages, and one root above them.' },
					{ q: '`bt_metap` reports `level = 2`. Does that contradict three levels?', options: ['Yes, the tree has two levels', 'Yes, the root is not counted', 'No, levels are counted from 0 at the leaves', 'No, `level` counts the internal pages'], answer: 2, why: '0 is the leaves, 1 the internal level, 2 the root.' }
				]
			},
			{
				title: 'Predict the reads',
				questions: [
					{ q: 'How many pages does `WHERE id = 424242` read, heap included?', options: ['Four', 'Three', 'One', 'About 7,300'], answer: 0, why: 'Root, one internal page, one leaf, then the heap page the ctid points to.' },
					{ q: 'Why do the index pages read equal the number of levels?', options: ['Each level is cached as one page', 'The search reads exactly one page per level on the way down', 'The planner reads the root once per level', 'Leaves are read in bulk'], answer: 1, why: '`_bt_search` loops once per level, binary searches the page, and follows one downlink.' },
					{ q: 'You run the query twice. What does the second run show?', options: ['`Buffers: shared hit=1`', '`Buffers: shared read=7300`', '`Buffers: shared hit=7`', '`Buffers: shared hit=4`'], answer: 3, why: 'The four pages of the path are now in the cache, so they are hits.' },
					{ q: 'Why can the first run in a session read a few more pages?', options: ['The first run always scans the table', 'It also reads pages such as the index metapage', 'It builds the index on the fly', 'It reads every leaf once'], answer: 1, why: 'The metapage records where the root is (it is what `bt_metap` shows), and the first run reads it on top of the path. Later runs in the session touch only the four pages of the path.' }
				]
			},
			{
				title: 'Read the plan',
				questions: [
					{ q: 'Which plan node do you expect for `WHERE id = 424242`?', options: ['`Seq Scan`', '`Hash Join`', '`Index Scan`', '`Sort`'], answer: 2, why: 'The B-tree on `id` answers an equality in a few page reads.' },
					{ q: 'Without the index, what would the query read?', options: ['Every page of the table, more than 7,000', 'Half the table on average', 'Only the first page', 'Four pages, like with the index'], answer: 0, why: 'A `Seq Scan` reads all of the table\'s pages to find one row.' },
					{ q: 'Why does `ORDER BY id LIMIT 20` need no sort step?', options: ['The heap is stored sorted by `id`', 'The planner caches sorted results', 'The root holds the first 20 keys', 'Leaves keep keys in order and link to the next leaf'], answer: 3, why: 'The scan goes down once, then follows the right-links and stops after 20 rows.' },
					{ q: 'What does `WHERE email LIKE \'%@example.com\'` do with a B-tree on `email`?', options: ['It uses the index from the right', 'It still reads the whole table', 'It reads only the leaves', 'It reads four pages'], answer: 1, why: 'A B-tree helps only when the query matches its order, and a leading `%` gives no starting point.' }
				]
			},
			{
				title: 'Scale to 100 million rows',
				questions: [
					{ q: 'About how many leaf pages for 100 million `bigint` keys?', options: ['About 2,700', 'About 27 million', 'About 270,000', 'About 1,000'], answer: 2, why: '100,000,000 / 370 is about 270,000.' },
					{ q: 'How many internal pages sit right above those leaves?', options: ['About 1,000', 'About 10', 'About 270,000', 'Exactly 1'], answer: 0, why: '270,000 divided by a few hundred is about 1,000. A few more pages above those, then the root.' },
					{ q: 'How many levels in all?', options: ['Three', 'Five', 'Six', 'Four'], answer: 3, why: 'Leaves, about 1,000 internal pages, a few pages above them, and the root.' },
					{ q: 'What does a lookup cost compared with a million rows?', options: ['A hundred times more reads', 'One more page read', 'Twice as many reads', 'The same three index reads'], answer: 1, why: 'Each level divides by a few hundred, so a table a hundred times bigger adds one level.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'A table grows from 1 million to 100 million rows. Roughly how does the number of index pages read by `WHERE id = 42` change?',
			options: [
				'It grows a hundred times, like the table does',
				'It grows by about one page, from three levels to four',
				'It stays at exactly one page, since the key is unique',
				'It doubles, because the tree needs a second root'
			],
			answer: 1,
			why: 'Each level divides the key range by the fan-out, a few hundred. Multiplying the rows by a hundred adds at most one level, so a lookup reads one more page.'
		},
		{
			q: 'Why can `SELECT * FROM orders ORDER BY created_at LIMIT 20` use a B-tree on `created_at` without sorting?',
			options: [
				'The planner caches the sorted output of earlier queries',
				'The heap is kept physically sorted by every indexed column',
				'Leaves hold keys in order and link to the next leaf',
				'B-trees store the first 20 keys of each page in the root'
			],
			answer: 2,
			why: 'The scan goes down once to the smallest key, then follows the right-links along the leaves, in key order. It stops after 20 rows. The heap itself is in no particular order (day 9).'
		},
		{
			q: 'A table has six indexes. You insert one row. How many structures does PostgreSQL write to?',
			options: [
				'Only the heap; indexes are rebuilt later by autovacuum',
				'The heap and the primary key index, the others are lazy',
				'The heap and each of the six indexes, plus the WAL for all',
				'Only the WAL; heap and indexes are written at checkpoint'
			],
			answer: 2,
			why: 'Every index must point at the new row, so each one gets a new leaf entry, and maybe a page split. All of those changes are logged in the WAL. With six indexes, one insert makes six leaf writes, so drop the indexes no query uses.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Build a B-tree on a million rows, count its levels with `pageinspect`, and watch a lookup read four pages while a scan reads them all.',
		steps: [
			'Start a throwaway PostgreSQL: `docker run -d --name pg-btree -e POSTGRES_PASSWORD=lab postgres:18`, wait a few seconds, then `docker exec -it pg-btree psql -U postgres`.',
			'Build the table and index: `CREATE TABLE users (id bigint, email text); INSERT INTO users SELECT g, \'user\' || g || \'@example.com\' FROM generate_series(1, 1000000) g; CREATE INDEX ON users(id); VACUUM ANALYZE users;`',
			'Count the levels and pages: `CREATE EXTENSION pageinspect;` then `SELECT root, level FROM bt_metap(\'users_id_idx\');`, `SELECT live_items FROM bt_page_stats(\'users_id_idx\', (SELECT root FROM bt_metap(\'users_id_idx\'))::int);` and `SELECT pg_relation_size(\'users_id_idx\') / 8192 AS index_pages, pg_relation_size(\'users\') / 8192 AS table_pages;`',
			'Run `EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM users WHERE id = 424242;` twice and read the `Buffers` line of the second run.',
			'Compare with a query the index cannot help: `EXPLAIN (ANALYZE, BUFFERS) SELECT count(*) FROM users WHERE email LIKE \'%@example.com\';`, and with `EXPLAIN SELECT * FROM users ORDER BY id LIMIT 20;`. Quit with `\\q` and clean up with `docker rm -f pg-btree`.'
		],
		done: [
			'`bt_metap` shows `level` 2, and the root page has 10 `live_items`.',
			'The index is about 2,750 pages and the table about 7,350.',
			'The second lookup shows `Index Scan using users_id_idx` and `Buffers: shared hit=4`.',
			'The `LIKE` query shows a `Seq Scan` whose buffers add up to every table page, and the `ORDER BY ... LIMIT 20` plan has an `Index Scan` and no `Sort`.'
		],
		solution: [
			'Level 2 counted from 0 at the leaves means three levels: the root with 10 entries, 10 internal pages, about 2,700 leaves.',
			'The four buffer hits are the root, one internal page, one leaf and the heap page. The scan reads every page because a leading `%` gives the B-tree no place to start.',
			'For 100 million rows, the same math gives four levels: one more read per lookup.'
		]
	},
	recall: {
		q: 'How many pages does `WHERE id = 424242` read on a million-row `users` table with a B-tree on `id`, and why so few?',
		a: 'Four: the root, one internal page, one leaf, and the heap page. Each level divides the key range by a few hundred, so a million `bigint` keys need only three levels.'
	},
	sources: [
		{ title: 'PostgreSQL source, nbtsearch.c (_bt_moveright comment)', url: SEARCH + '#L130-L133' },
		{ title: 'PostgreSQL source, nbtree README (rightmost leaf fast path)', url: README + '#L494-L499' },
		{ title: 'PostgreSQL docs, B-Tree Indexes', url: 'https://www.postgresql.org/docs/current/btree.html' },
		{ title: 'PostgreSQL docs, Index Types', url: 'https://www.postgresql.org/docs/current/indexes-types.html' },
		{ title: 'PostgreSQL docs, Indexes and ORDER BY', url: 'https://www.postgresql.org/docs/current/indexes-ordering.html' },
		{ title: 'PostgreSQL source, src/backend/access/nbtree/README', url: README }
	]
};
