const PG = 'https://github.com/postgres/postgres/blob/92d47d544bf64274b6a7aa8775f7b35bcf71f339';
const VIS = `${PG}/src/backend/access/heap/heapam_visibility.c`;
const SNAP = `${PG}/src/include/utils/snapshot.h`;
const DDL = `${PG}/doc/src/sgml/ddl.sgml`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'mvcc',
	part: 'Many at once',
	title: 'MVCC: row versions and snapshots',
	minutes: 10,
	hook: [
		'At 10 in the morning, finance runs a report: `SELECT sum(total) FROM orders`, twenty minutes over a big table. The shop keeps taking orders the whole time. **No checkout waits for the report, and the report does not wait for checkouts.**',
		'The report\'s total does not count half of an order that was being written, or an order that came in at minute twelve. **It sees the table as it was when it started.**',
		'PostgreSQL keeps several versions of each row instead of locking rows for the report. Every UPDATE writes a new row version (day 16), and each version records which transaction created it and which one replaced it. **Each query holds a snapshot** that says which of those transactions count. The docs: "reading never blocks writing and writing never blocks reading".'
	],
	terms: [
		{ term: 'MVCC', def: 'Multiversion concurrency control. The database keeps several versions of a row, and each transaction reads the one that matches its snapshot.' },
		{ term: 'xmin', def: 'A hidden column on every row version: the ID of the transaction that inserted it. You can select it: `SELECT xmin, xmax, * FROM orders`.' },
		{ term: 'xmax', def: 'The ID of the transaction that deleted or replaced this version, or zero. A nonzero xmax on a visible row usually means that transaction has not committed, or rolled back.' },
		{ term: 'Snapshot', def: 'Three things: xmin (every older transaction is finished), xmax (every transaction from here on is invisible), and the list of transactions still running in between.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['t100["Tx 100: INSERT order 7, committed"] --> v1["Version A: xmin 100, xmax 0"]'],
				highlight: ['t100', 'v1'],
				note: 'Transaction 100 inserts order 7 and commits. The row version records `xmin = 100`. Its `xmax` is zero: nobody has deleted or replaced it.'
			},
			{
				add: ['t105["Tx 105: UPDATE order 7, still open"] -->|"sets xmax 105"| v1', 't105 --> v2["Version B: xmin 105, xmax 0"]'],
				highlight: ['t105', 'v2'],
				note: 'An UPDATE is a delete plus an insert. Transaction 105 changes order 7 and has not committed yet. It stamps `xmax = 105` on version A and writes version B with `xmin = 105`, so both versions are on disk.'
			},
			{
				add: ['snap["Report snapshot 103:106:105"] -.->|"105 still running: sees A"| v1', 'snap -.->|"skips B"| v2'],
				highlight: ['snap'],
				note: 'The report\'s snapshot is written `xmin:xmax:running`: every XID below 103 is finished, every XID from 106 is invisible, and 105 was still running. So the deleter of version A does not count yet, and A is visible. The inserter of B does not count either, so B is skipped. **Neither the report nor transaction 105 waited.**'
			},
			{
				add: ['t105 --> commit["Tx 105 commits"]', 'later["Query started after the commit"] -.->|"sees B"| v2'],
				highlight: ['commit', 'later'],
				note: 'After 105 commits, a new query takes a new snapshot where 105 is finished, and sees B. The report that started earlier keeps seeing A to the end, because its snapshot still lists 105 as running.'
			},
			{
				add: ['v1 -.->|"dead once no snapshot needs it"| vac["VACUUM"]'],
				highlight: ['vac'],
				note: 'Version A stays on disk as long as some snapshot might need it. When none can, it is dead and VACUUM removes it (day 16). So a twenty-minute report, or a transaction left open, keeps old versions on disk for as long as it runs.'
			}
		]
	},
	example: {
		title: 'src/backend/access/heap/heapam_visibility.c: is this row version visible to my snapshot?',
		repo: 'postgres/postgres',
		url: `${VIS}#L937-L1153`,
		lang: 'c',
		code: `/*
 * HeapTupleSatisfiesMVCC
 *		True iff heap tuple is valid for the given MVCC snapshot.
…
	if (!HeapTupleHeaderXminCommitted(tuple))
	{
		if (HeapTupleHeaderXminInvalid(tuple))
			return false;
…
		else if (XidInMVCCSnapshot(HeapTupleHeaderGetRawXmin(tuple), snapshot))
			return false;
		else if (TransactionIdDidCommit(HeapTupleHeaderGetRawXmin(tuple)))
			SetHintBits(tuple, buffer, HEAP_XMIN_COMMITTED,
						HeapTupleHeaderGetRawXmin(tuple));
		else
		{
			/* it must have aborted or crashed */
			SetHintBits(tuple, buffer, HEAP_XMIN_INVALID,
						InvalidTransactionId);
			return false;
		}
	}
	else
	{
		/* xmin is committed, but maybe not according to our snapshot */
		if (!HeapTupleHeaderXminFrozen(tuple) &&
			XidInMVCCSnapshot(HeapTupleHeaderGetRawXmin(tuple), snapshot))
			return false;		/* treat as still in progress */
	}
…
	/* by here, the inserting transaction has committed */

	if (tuple->t_infomask & HEAP_XMAX_INVALID)	/* xid invalid or aborted */
		return true;

	if (HEAP_XMAX_IS_LOCKED_ONLY(tuple->t_infomask))
		return true;
…
		if (XidInMVCCSnapshot(HeapTupleHeaderGetRawXmax(tuple), snapshot))
			return true;

		if (!TransactionIdDidCommit(HeapTupleHeaderGetRawXmax(tuple)))
		{
			/* it must have aborted or crashed */
			SetHintBits(tuple, buffer, HEAP_XMAX_INVALID,
						InvalidTransactionId);
			return true;
		}
…
	/* xmax transaction committed */

	return false;`,
		notes: [
			'The rules for a snapshot are in [`snapshot.h`](' + SNAP + '#L148-L165): "An MVCC snapshot can never see the effects of XIDs >= xmax. It can see the effects of all older XIDs except those listed in the snapshot." The list is `xip`, the transactions in progress when the snapshot was taken. The struct definition adds that the snapshot also sees "previous commands of this transaction", so a transaction always sees its own writes.',
			'Lines 5 to 22 check whether the inserter counts: if `xmin` is in the snapshot\'s running list (line 10), the version is invisible. If it committed, line 13 records that in the row header with `SetHintBits`, so the next reader skips the lookup. Otherwise "it must have aborted or crashed" (line 17), and the version is invisible. Setting a hint bit [marks the page dirty](' + VIS + '#L6-L11), so a plain SELECT can cause writes.',
			'Lines 23 to 29 cover a version whose `xmin` already has the committed hint bit. If that `xmin` is in this snapshot\'s list, the version is still skipped: "treat as still in progress", says the comment on line 28. A frozen row (day 16) skips that test, because it is old enough to be visible to everyone.',
			'Lines 33 to 52 check whether the deleter counts. No `xmax`, or an `xmax` that only locked the row (lines 33 to 37): visible. An `xmax` in the snapshot\'s running list, or one that aborted (lines 39 to 47): still visible. Only a deleter that committed before the snapshot hides the version (line 52), and the [docs on system columns](' + DDL + '#L1525-L1531) say the same about a nonzero `xmax` on a visible row.'
		]
	},
	tradeoff: {
		gain: [
			'A twenty-minute report and the checkouts run side by side, and neither waits for the other.',
			'Each query sees one consistent state of the database, without taking a single lock to get it.',
			'Rolling back is cheap: the aborted transaction\'s versions are never visible, and VACUUM clears them later.'
		],
		cost: [
			'Every UPDATE writes a whole new row version, and the old one stays until VACUUM removes it (day 16).',
			'A long query or an idle open transaction keeps old versions alive for the whole database, so tables grow.',
			'Checking visibility costs work on every row read, and setting hint bits can turn a read into a write to disk.',
			'Two transactions that update the same row still take turns: the second waits for the first to finish (row locks, day 20).'
		]
	},
	task: {
		prompt: 'Your snapshot is `103:106:105`. Transactions 90, 101, 104 and 107 have committed, 102 aborted, 105 is still running. For each row version, say if your query sees it: A (xmin 90, xmax 0), B (xmin 101, xmax 104), C (xmin 104, xmax 105), D (xmin 105, xmax 0), E (xmin 107, xmax 0), F (xmin 102, xmax 0).',
		hint: 'Two questions per version: does the inserter count for this snapshot, and if so, does the deleter? Below 103 means finished. 106 and above means invisible. 105 is in the running list.',
		answer: [
			'A: visible. 90 is below 103 and committed, and nobody deleted it.',
			'B: invisible. 101 committed, but 104 is under 106, not in the list, and committed: the delete counts.',
			'C: visible. 104 counts, and the deleter 105 is in the running list, so the delete does not count yet.',
			'D: invisible, inserted by 105, which is still running for this snapshot. E: invisible, 107 is at or above 106, even though it committed. F: invisible, 102 aborted.',
			'To watch it live: open two `psql` sessions, run `BEGIN ISOLATION LEVEL REPEATABLE READ; SELECT pg_current_snapshot(), xmin, xmax, * FROM accounts;` in one, update a row in the other, then select again in the first. It still sees the old version.'
		]
	},
	quiz: [
		{
			q: 'A twenty-minute report runs `SELECT sum(total) FROM orders` while checkouts keep updating orders. What happens?',
			options: [
				'Checkouts wait for the report to finish, so the sum cannot change under it',
				'The report waits on each row a checkout is updating until that checkout commits',
				'Both run without waiting, and the report sees the rows as of its own snapshot',
				'Both run, and the report adds each order in the state it has when it is read'
			],
			answer: 2,
			why: 'Under MVCC, reading never blocks writing and writing never blocks reading. The report uses its snapshot to pick, for each row, the version that was committed when it started.'
		},
		{
			q: 'Your snapshot is `103:106:105`. Transaction 105 commits one second after your query started. Does your query see the rows 105 inserted?',
			options: [
				'Yes, because 105 is below 106, the snapshot\'s xmax',
				'Yes, from the moment the hint bit is set on each row',
				'No, because 105 is listed as running in the snapshot',
				'No, because any XID above 103 is invisible to it'
			],
			answer: 2,
			why: 'A snapshot is fixed when it is taken. 105 is in its running list, so its rows stay invisible to that snapshot even after the commit. The visibility code treats such a version as still in progress, hint bit or not.'
		},
		{
			q: 'You select `xmin, xmax, *` and see a row with `xmax = 812` that your query still returns. What is the most likely reason?',
			options: [
				'Transaction 812 deleted or locked it, but has not committed a delete',
				'Transaction 812 deleted it, and VACUUM has not removed it yet',
				'Transaction 812 inserted a newer version that replaces this one',
				'The row is frozen, so its xmax is kept only for later forensics'
			],
			answer: 0,
			why: 'A committed delete that counts for your snapshot would hide the row. A visible row with a nonzero xmax means the deleter is still running, rolled back, or only took a row lock.'
		}
	],
	recall: {
		q: 'A twenty-minute report sums `orders` while checkouts update rows. How does it get a consistent total without making them wait?',
		a: 'Each row version records xmin (its inserter) and xmax (its deleter). The report\'s snapshot says which XIDs count, so it reads the versions committed when it started, while checkouts write new versions.'
	},
	sources: [
		{ title: 'PostgreSQL docs, Concurrency Control: Introduction', url: 'https://www.postgresql.org/docs/18/mvcc-intro.html' },
		{ title: 'PostgreSQL docs, System Columns', url: 'https://www.postgresql.org/docs/18/ddl-system-columns.html' },
		{ title: 'PostgreSQL docs, Transaction ID and Snapshot Information Functions', url: 'https://www.postgresql.org/docs/18/functions-info.html#FUNCTIONS-PG-SNAPSHOT' },
		{ title: 'PostgreSQL source, heapam_visibility.c', url: `${VIS}` },
		{ title: 'PostgreSQL source, snapshot.h (SnapshotData definition)', url: `${SNAP}#L33-L46` }
	]
};
