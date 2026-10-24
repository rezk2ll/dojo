const PG = 'https://github.com/postgres/postgres/blob/26bd08fb5c069fbdf55867adc398cfca0f55d5c8/src';
const HTUP = `${PG}/include/access/htup_details.h`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'pages-and-rows',
	part: 'Inside the engine',
	title: 'Pages and rows on disk',
	minutes: 10,
	hook: [
		'A table with two `int` columns and a million rows: 8 MB of data, you would think. `pg_relation_size` says 35 MB. You delete half the rows, and it still says 35 MB. The table file is a list of pages, and a delete leaves every page in it.',
		'PostgreSQL stores every table as **an array of 8 KB pages**. A page holds a header, a list of pointers, and the rows packed from the end. Reading one row means reading its whole page, from the cache or from disk.',
		'Each row also carries a 23-byte header that your ORM never shows you: who inserted it, who deleted it, where its newer version lives. This header and the page layout explain the 35 MB, and the next chapters on indexes and VACUUM build on them.'
	],
	terms: [
		{ term: 'Page', def: 'A fixed block of 8 KB (by default) in a table or index file. PostgreSQL reads, caches and writes whole pages.' },
		{ term: 'Tuple', def: 'One stored version of a row, with its header. An UPDATE writes a new tuple, so one row can have several.' },
		{ term: 'Line pointer', def: 'A 4-byte slot at the top of the page that holds the offset and length of one tuple. A row\'s address names this slot, and the byte position can change.' },
		{ term: 'TOAST', def: 'The storage for large values. A row wider than about 2 kB has its big fields compressed and, if needed, moved to a side table in chunks.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['file[("Table file: page 0, page 1, page 2 ...")]'],
				highlight: ['file'],
				note: 'The docs: "Every table and index is stored as an array of pages of a fixed size (usually 8 kB, although a different page size can be selected when compiling the server)." Page 0 is the first 8 KB of the file, page 1 the next, and so on.'
			},
			{
				add: ['file --> page["Page: 24-byte header, line pointers, free space, tuples"]'],
				highlight: ['page'],
				note: 'In this slotted page, line pointers grow down from the header, tuples grow up from the end. The source says "a page is full when nothing can be added between pd_lower and pd_upper", the two offsets that mark the free space in the middle.'
			},
			{
				add: ['page --> lp["Line pointer 3: offset and length"]', 'lp --> tup["Tuple at (0,3): 23-byte header, null bitmap, column data"]'],
				highlight: ['lp', 'tup'],
				note: 'Each tuple has an address, its `ctid`, shown by `SELECT ctid, * FROM t`. `(0,3)` means page 0, line pointer 3. Because the address names the pointer and not a byte offset, PostgreSQL can move tuples around inside the page to reclaim space without changing their address.'
			},
			{
				add: ['tup -->|"row wider than about 2 kB"| toast[("TOAST table: compressed, chunked values")]'],
				highlight: ['toast'],
				note: 'A tuple cannot span pages. So when a row would be wider than `TOAST_TUPLE_THRESHOLD` ("normally 2 kB"), PostgreSQL compresses its large fields and moves them out of line. The row keeps a small pointer to them.'
			},
			{
				add: ['upd["UPDATE qty = qty + 1"] -->|"writes a new tuple"| tup2["New version at (5,76)"]', 'tup -.->|"t_ctid points to the newer version"| tup2'],
				highlight: ['upd', 'tup2'],
				note: 'An UPDATE writes a new tuple. The old version stays on its page, marked with the updating transaction in `t_xmax`, and its `t_ctid` points to the new one. Readers who started earlier keep seeing the old version (day 18), and dead versions pile up until VACUUM removes them (day 16).'
			}
		]
	},
	example: {
		title: 'src/include/access/htup_details.h: the header every PostgreSQL row carries',
		repo: 'postgres/postgres',
		url: `${HTUP}#L65-L181`,
		lang: 'c',
		code: ` * The overall structure of a heap tuple looks like:
 *			fixed fields (HeapTupleHeaderData struct)
 *			nulls bitmap (if HEAP_HASNULL is set in t_infomask)
 *			alignment padding (as needed to make user data MAXALIGN'd)
 *			object ID (if HEAP_HASOID_OLD is set in t_infomask, not created
 *          anymore)
 *			user data fields
…
typedef struct HeapTupleFields
{
	TransactionId t_xmin;		/* inserting xact ID */
	TransactionId t_xmax;		/* deleting or locking xact ID */

	union
	{
		CommandId	t_cid;		/* inserting or deleting command ID, or both */
		TransactionId t_xvac;	/* old-style VACUUM FULL xact ID */
	}			t_field3;
} HeapTupleFields;
…
struct HeapTupleHeaderData
{
	union
	{
		HeapTupleFields t_heap;
		DatumTupleFields t_datum;
	}			t_choice;

	ItemPointerData t_ctid;		/* current TID of this or newer tuple (or a
								 * speculative insertion token) */

	/* Fields below here must match MinimalTupleData! */

#define FIELDNO_HEAPTUPLEHEADERDATA_INFOMASK2 2
	uint16		t_infomask2;	/* number of attributes + various flags */

#define FIELDNO_HEAPTUPLEHEADERDATA_INFOMASK 3
	uint16		t_infomask;		/* various flag bits, see below */

#define FIELDNO_HEAPTUPLEHEADERDATA_HOFF 4
	uint8		t_hoff;			/* sizeof header incl. bitmap, padding */

	/* ^ - 23 bytes - ^ */

#define FIELDNO_HEAPTUPLEHEADERDATA_BITS 5
	uint8		t_bits[FLEXIBLE_ARRAY_MEMBER];	/* bitmap of NULLs */

	/* MORE DATA FOLLOWS AT END OF STRUCT */
};`,
		notes: [
			'Lines 11 and 12: `t_xmin` is the transaction that inserted this version, `t_xmax` the one that deleted or locked it. Each transaction reads these two 4-byte IDs to decide which versions it can see (day 18).',
			'Line 29 holds the update chain. The [comment on `t_ctid`](' + HTUP + '#L86-L88) says: "whenever a new tuple is stored on disk, its t_ctid is initialized with its own TID (location). If the tuple is ever updated, its t_ctid is changed to point to the replacement version of the tuple."',
			'Line 46 is the null bitmap. Its [comment](' + HTUP + '#L114-L116) says it "is *not* stored if t_infomask shows that there are no nulls in the tuple". When it is there, it has one bit per column, and a NULL column takes no space for its value.',
			'[`bufpage.h`](' + PG + '/include/storage/bufpage.h#L24-L47) draws the page around the tuple: header, then `linp1 linp2 ...`, then free space, then tuples "added backwards". Each line pointer is the `ItemIdData` bit field: 15 bits of offset, 2 of flags, 15 of length.',
			'The TOAST threshold of 2 kB comes from [`heaptoast.h`](' + PG + '/include/access/heaptoast.h#L20-L48), which sets `TOAST_TUPLES_PER_PAGE` to 4 and defines the threshold as the largest tuple size for which four fit on one heap page. On 8 KB pages that is about 2 kB.'
		]
	},
	tradeoff: {
		gain: [
			'Disk reads, the shared buffer cache and the WAL all work in the same 8 KB pages.',
			'Line pointers give each row a stable address inside its page, so tuples can be compacted without breaking the indexes that point to them.',
			'TOAST keeps big values out of the row. A scan that never reads `body` reads small rows and fewer pages.'
		],
		cost: [
			'Every tuple pays about 28 bytes before its first column (23-byte header, aligned to 24, plus a 4-byte line pointer). A table of two `int` columns spends more space on overhead than on data.',
			'Reading one row means reading its whole 8 KB page. Rows scattered over many pages cost many reads.',
			'An UPDATE writes a full new tuple, even to change one boolean. The old one stays until VACUUM cleans it.',
			'Column order can waste space: types are aligned, so a `boolean` followed by a `bigint` leaves padding between them.'
		]
	},
	task: {
		prompt: 'A table `t(id bigint, qty int, flag boolean)` has no NULLs. Using a 24-byte page header, a 23-byte tuple header, 8-byte alignment of each tuple and a 4-byte line pointer, how many rows fit in one 8 KB page? Then check in `psql`: insert 1000 rows and run `SELECT ctid, id FROM t WHERE id IN (185, 186)` and `SELECT pg_relation_size(\'t\') / 8192`.',
		hint: 'Header plus data, rounded up to a multiple of 8, plus the line pointer. Then divide the space after the page header.',
		answer: [
			'Tuple: 23-byte header padded to 24, then 8 + 4 + 1 = 13 bytes of data: 37 bytes, rounded up to 40.',
			'Each row costs 40 + 4 = 44 bytes of the page. (8192 - 24) / 44 = 185.6, so 185 rows per page.',
			'In `psql`: id 185 is at `(0,185)` and id 186 at `(1,1)`, the first slot of page 1. 1000 rows need 6 pages, so `pg_relation_size` is 49152 bytes.',
			'Run `UPDATE t SET qty = qty + 1 WHERE id = 1` and look at its `ctid` again: it moved to a free slot at the end of the table, because the update wrote a new tuple.'
		],
		steps: [
			{
				title: 'Size one tuple',
				questions: [
					{ q: 'The row has no NULLs. How many bytes come before the first column?', options: ['23', '24', '28', '32'], answer: 1, why: 'The 23-byte header is padded to 24, so the column data starts aligned.' },
					{ q: 'Why is there no null bitmap in this tuple?', options: ['Bitmaps are only for text columns', 'The table is too small', 'It is not stored when the tuple has no NULLs', 'It lives in the page header instead'], answer: 2, why: 'The source: the bitmap "is *not* stored if t_infomask shows that there are no nulls in the tuple".' },
					{ q: 'How many bytes of column data does `(bigint, int, boolean)` take?', options: ['13', '16', '12', '24'], answer: 0, why: '8 for the `bigint`, 4 for the `int`, 1 for the `boolean`.' },
					{ q: 'Header plus data is 37 bytes. What does the tuple take with 8-byte alignment?', options: ['37', '38', '48', '40'], answer: 3, why: '37 rounded up to the next multiple of 8 is 40.' }
				]
			},
			{
				title: 'Fill the page',
				questions: [
					{ q: 'What does each row cost of the page, line pointer included?', options: ['40 bytes', '44 bytes', '41 bytes', '48 bytes'], answer: 1, why: '40 for the tuple, plus a 4-byte line pointer at the top of the page.' },
					{ q: 'How much space is left after the page header?', options: ['8192 bytes', '8000 bytes', '8168 bytes', '8144 bytes'], answer: 2, why: '8192 minus the 24-byte page header.' },
					{ q: 'So how many rows fit in one page?', options: ['185', '186', '204', '630'], answer: 0, why: '8168 / 44 = 185.6. A tuple cannot span pages, so the page holds 185.' },
					{ q: 'Of those 44 bytes per row, how many are your data?', options: ['44', '40', '24', '13'], answer: 3, why: 'The rest is header, padding and the line pointer. On a table this narrow, overhead outweighs the data.' }
				]
			},
			{
				title: 'Check it in psql',
				questions: [
					{ q: 'After inserting ids 1 to 1000, where is id 186?', options: ['`(0,186)`', '`(1,1)`', '`(1,186)`', '`(0,1)`'], answer: 1, why: 'Page 0 is full after 185 rows, so id 186 takes the first slot of page 1.' },
					{ q: 'What does a `ctid` of `(1,1)` name?', options: ['Page 1, line pointer 1', 'Byte 1 of row 1', 'Transaction 1, command 1', 'Index entry 1 of page 1'], answer: 0, why: 'The address names the page and the slot, not a byte offset, so tuples can move inside the page.' },
					{ q: 'How many pages do 1000 rows need?', options: ['5', '4', '8', '6'], answer: 3, why: '1000 / 185 is about 5.4, so a sixth page holds the last rows.' },
					{ q: 'So what does `pg_relation_size(\'t\')` return in bytes?', options: ['8192', '40960', '49152', '44000'], answer: 2, why: 'Six pages of 8192 bytes. The file grows in whole pages.' }
				]
			},
			{
				title: 'Watch an update move the row',
				questions: [
					{ q: 'You run `UPDATE t SET qty = qty + 1 WHERE id = 1`. Where does the new version go?', options: ['It overwrites `(0,1)` in place', 'Into a free slot at the end of the table', 'Into the TOAST table', 'Into the WAL only, until VACUUM'], answer: 1, why: 'An UPDATE writes a new tuple. Page 0 is full, so it lands where there is room, like `(5,76)` in the diagram.' },
					{ q: 'What stays at `(0,1)` right after the update?', options: ['Nothing, the slot is freed at once', 'The new version', 'An empty tuple with only a header', 'The old version, with `t_xmax` set and `t_ctid` pointing to the new one'], answer: 3, why: 'Readers who started earlier may still need it. It stays until VACUUM removes it.' },
					{ q: 'You delete half the rows. What does `pg_relation_size` say?', options: ['The same 49152 bytes', 'About half, 24576 bytes', '0, until VACUUM runs', 'More, because of the deletes'], answer: 0, why: 'A delete marks tuples, it does not shrink the file. That is the hook\'s 35 MB that stays 35 MB.' },
					{ q: 'Which column of the old tuple says which transaction updated it?', options: ['`t_xmin`', '`t_hoff`', '`t_xmax`', '`t_bits`'], answer: 2, why: '`t_xmin` is the inserting transaction, `t_xmax` the one that deleted or locked it.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'A row has a nullable `int` column set to NULL, and another column also NULL. How much space does the NULL `int` take in that tuple?',
			options: [
				'Four bytes, the width of an int, filled with zeros',
				'One bit in the null bitmap, and no bytes for the value',
				'A pointer to a shared NULL value in the TOAST table',
				'Nothing at all, and the tuple stores no bitmap either'
			],
			answer: 1,
			why: 'When a tuple has any NULL, it carries a null bitmap with one bit per column. A NULL column is marked there and takes no space in the data area. With no NULLs at all, the bitmap is left out.'
		},
		{
			q: 'You run `UPDATE accounts SET active = false WHERE id = 42`. What does PostgreSQL write to the table file?',
			options: [
				'Only the changed byte, in place inside the existing tuple',
				'A small diff record in the TOAST table that points to the row',
				'A whole new version of the row, while the old one stays for now',
				'Nothing yet: the change lives only in the WAL until VACUUM'
			],
			answer: 2,
			why: 'An UPDATE writes a new tuple with every column. The old one gets the updating transaction in `t_xmax` and a `t_ctid` that points to the new one. It stays until VACUUM removes it, once no transaction can see it.'
		},
		{
			q: 'A `body text` column holds a 100 KB article. Where does that value live?',
			options: [
				'In TOAST, compressed or split into chunks, with a pointer in the row',
				'In the heap page, which grows past 8 KB to fit the whole row',
				'Across thirteen heap pages that are linked to each other in order',
				'Nowhere: PostgreSQL rejects any row larger than one 8 KB page'
			],
			answer: 0,
			why: 'A tuple cannot span pages. Above about 2 kB, TOAST compresses large fields and, if the row is still too wide, moves them to the table\'s TOAST table in chunks. The heap row keeps a pointer.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Check the 185-rows-per-page math on a real table, read a tuple header with `pageinspect`, and see that a delete does not shrink the file.',
		steps: [
			'Start a throwaway PostgreSQL: `docker run -d --name pg-pages -e POSTGRES_PASSWORD=lab postgres:18`, wait a few seconds, then `docker exec -it pg-pages psql -U postgres`.',
			'Create and fill the table: `CREATE TABLE t (id bigint, qty int, flag boolean); INSERT INTO t SELECT g, 1, true FROM generate_series(1, 1000) g;`',
			'Check the math: `SELECT ctid, id FROM t WHERE id IN (185, 186);` and `SELECT pg_relation_size(\'t\') / 8192 AS pages, pg_relation_size(\'t\') AS bytes;`',
			'Look inside page 0 while an update is still open: `CREATE EXTENSION pageinspect;` then `BEGIN; UPDATE t SET qty = qty + 1 WHERE id = 1; SELECT lp, lp_len, t_xmin, t_xmax, t_ctid FROM heap_page_items(get_raw_page(\'t\', 0)) LIMIT 2; SELECT ctid FROM t WHERE id = 1; COMMIT;`',
			'Delete half the rows and measure again: `DELETE FROM t WHERE id % 2 = 0;` then `SELECT pg_relation_size(\'t\');`. Quit with `\\q` and clean up with `docker rm -f pg-pages`.'
		],
		done: [
			'id 185 is at `(0,185)` and id 186 at `(1,1)`; the table is 6 pages, 49152 bytes.',
			'`heap_page_items` shows `lp_len` 37 for each tuple: the 24-byte header plus 13 bytes of data, before alignment.',
			'Line pointer 1 has a `t_xmax` that is not 0 and a `t_ctid` that matches the new `ctid` of id 1.',
			'After deleting 500 rows, `pg_relation_size` still prints `49152`.'
		],
		solution: [
			'The 37 bytes round up to 40 on the page, plus 4 for the line pointer: 44 bytes a row, and 8168 / 44 gives 185 rows.',
			'The old version of id 1 stays on page 0 with the updating transaction in `t_xmax`, and its `t_ctid` points to the new tuple. The new `ctid` is on the last page, where there was room.',
			'A delete only marks the tuples, so every page stays in the file. Dead tuples pile up until VACUUM removes them (day 16).'
		]
	},
	recall: {
		q: 'What does `ctid = (0,3)` point to, and what happens to it when you UPDATE that row?',
		a: 'Page 0, line pointer 3, in the table\'s 8 KB pages. The UPDATE writes a new tuple at another ctid, and the old tuple\'s `t_ctid` points to it until VACUUM removes the old one.'
	},
	sources: [
		{ title: 'PostgreSQL source, itemid.h (ItemIdData)', url: `${PG}/include/storage/itemid.h#L25-L30` },
		{ title: 'PostgreSQL docs, Database Page Layout', url: 'https://www.postgresql.org/docs/current/storage-page-layout.html' },
		{ title: 'PostgreSQL docs, TOAST', url: 'https://www.postgresql.org/docs/current/storage-toast.html' },
		{ title: 'PostgreSQL docs, pageinspect', url: 'https://www.postgresql.org/docs/current/pageinspect.html' }
	]
};
