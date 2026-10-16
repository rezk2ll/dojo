const PG = 'https://github.com/postgres/postgres/blob/26bd08fb5c069fbdf55867adc398cfca0f55d5c8/src';
const HTUP = `${PG}/include/access/htup_details.h`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'pages-and-rows',
	part: 'Inside the engine',
	title: 'Pages and rows on disk',
	minutes: 10,
	hook: [
		'A table with two `int` columns and a million rows: 8 MB of data, you would think. `pg_relation_size` says 35 MB. You delete half the rows, and it still says 35 MB. **The disk does not hold "rows". It holds pages.**',
		'PostgreSQL stores every table as **an array of 8 KB pages**. A page holds a header, a list of pointers, and the rows packed from the end. Reading one row means reading its whole page, from the cache or from disk.',
		'Each row also carries **a 23-byte header** that your ORM never shows you: who inserted it, who deleted it, where its newer version lives. Once you know this layout, table sizes, slow updates and the next chapters on indexes and VACUUM stop being magic.'
	],
	terms: [
		{ term: 'Page', def: 'A fixed block of 8 KB (by default) in a table or index file. The unit PostgreSQL reads, caches and writes.' },
		{ term: 'Heap', def: 'The table file itself: pages of rows in no particular order. A new row goes wherever there is free space.' },
		{ term: 'Tuple', def: 'One stored version of a row, with its header. An UPDATE writes a new tuple, so one row can have several.' },
		{ term: 'Line pointer', def: 'A 4-byte slot at the top of the page: offset and length of one tuple. Rows are addressed through it, not by byte position.' },
		{ term: 'ctid', def: 'A tuple\'s address: (page number, line pointer number). `SELECT ctid, * FROM t` shows it.' },
		{ term: 'TOAST', def: 'Where large values go. A row wider than about 2 kB has its big fields compressed and, if needed, moved to a side table in chunks.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['file[("Table file: page 0, page 1, page 2 ...")]'],
				highlight: ['file'],
				note: '**A table is an array of pages.** The docs: "Every table and index is stored as an array of pages of a fixed size (usually 8 kB, although a different page size can be selected when compiling the server)." Page 0 is the first 8 KB of the file, page 1 the next, and so on.'
			},
			{
				add: ['file --> page["Page: 24-byte header, line pointers, free space, tuples"]'],
				highlight: ['page'],
				note: '**A slotted page.** Line pointers grow down from the header, tuples grow up from the end. The source says "a page is full when nothing can be added between pd_lower and pd_upper", the two offsets that mark the free space in the middle.'
			},
			{
				add: ['page --> lp["Line pointer 3: offset and length"]', 'lp --> tup["Tuple at (0,3): 23-byte header, null bitmap, column data"]'],
				highlight: ['lp', 'tup'],
				note: '**A row has an address.** `(0,3)` means page 0, line pointer 3. Because the address names the pointer and not a byte offset, PostgreSQL can move tuples around inside the page to reclaim space without changing their address.'
			},
			{
				add: ['tup -->|"row wider than about 2 kB"| toast[("TOAST table: compressed, chunked values")]'],
				highlight: ['toast'],
				note: '**Big values live elsewhere.** A tuple cannot span pages. So when a row would be wider than `TOAST_TUPLE_THRESHOLD` ("normally 2 kB"), PostgreSQL compresses its large fields and moves them out of line. The row keeps a small pointer to them.'
			},
			{
				add: ['upd["UPDATE qty = qty + 1"] -->|"writes a new tuple"| tup2["New version at (5,76)"]', 'tup -.->|"t_ctid points to the newer version"| tup2'],
				highlight: ['upd', 'tup2'],
				note: '**An update is a new tuple.** The old version stays on its page, marked with the updating transaction in `t_xmax`, and its `t_ctid` points to the new one. That is how readers keep seeing the old row (day 18), and why dead rows pile up until VACUUM (day 16).'
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
			'**Who wrote it, who removed it.** `t_xmin` is the transaction that inserted this version, `t_xmax` the one that deleted or locked it. Two 4-byte transaction IDs on every tuple: that is what lets each transaction decide which versions it can see (day 18).',
			'**The update chain.** The [comment on `t_ctid`](' + HTUP + '#L86-L88) says: "whenever a new tuple is stored on disk, its t_ctid is initialized with its own TID (location). If the tuple is ever updated, its t_ctid is changed to point to the replacement version of the tuple."',
			'**A NULL costs one bit.** The [null bitmap](' + HTUP + '#L114-L116) "is *not* stored if t_infomask shows that there are no nulls in the tuple". When it is there, it has one bit per column, and a NULL column takes no space for its value.',
			'**The page around it.** [`bufpage.h`](' + PG + '/include/storage/bufpage.h#L24-L47) draws the slotted page: header, then `linp1 linp2 ...`, then free space, then tuples "added backwards". Each line pointer is the [`ItemIdData`](' + PG + '/include/storage/itemid.h#L25-L30) bit field: 15 bits of offset, 2 of flags, 15 of length.',
			'**Where 2 kB comes from.** [`heaptoast.h`](' + PG + '/include/access/heaptoast.h#L20-L48) sets `TOAST_TUPLES_PER_PAGE` to 4 and defines the threshold as the largest tuple size for which four fit on one heap page. On 8 KB pages that is about 2 kB.'
		]
	},
	tradeoff: {
		gain: [
			'One unit for everything: disk reads, the shared buffer cache and the WAL all work in pages, which keeps each of them simple.',
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
	takeaway: 'A table is an array of 8 KB pages; each row is a tuple with a 23-byte header, reached through a line pointer, and big values go to TOAST. Every UPDATE writes a new tuple, and every read pays for a whole page.',
	sources: [
		{ title: 'PostgreSQL docs, Database Page Layout', url: 'https://www.postgresql.org/docs/current/storage-page-layout.html' },
		{ title: 'PostgreSQL docs, TOAST', url: 'https://www.postgresql.org/docs/current/storage-toast.html' },
		{ title: 'PostgreSQL docs, pageinspect', url: 'https://www.postgresql.org/docs/current/pageinspect.html' }
	]
};
