const PG = 'https://github.com/postgres/postgres/blob/92d47d544bf64274b6a7aa8775f7b35bcf71f339';
const HEAPAM = `${PG}/src/backend/access/heap/heapam.c`;
const README = `${PG}/src/backend/access/transam/README`;
const XACT = `${PG}/src/backend/access/transam/xact.c`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'wal',
	part: 'Inside the engine',
	title: 'The write-ahead log',
	minutes: 10,
	hook: [
		'You move 10 euros between two accounts and get `COMMIT`. A second later the power goes out. When the server comes back, are the 10 euros in one account, the other, both or neither?',
		'Writing the changed pages to disk at every commit would answer "the right one", but slowly: one transfer can touch pages all over the table and its indexes, and each one is a random write. **PostgreSQL writes a log entry first and the pages later.** The log is one file written in order, and a commit only waits for that file to reach the disk.',
		'Today: the rule "log before data", what `COMMIT` really waits for, what a **checkpoint** does, and how a crash is repaired by **replaying** the log. Then the same idea in SQLite.'
	],
	terms: [
		{ term: 'WAL', def: 'Write-ahead log: an append-only record of every change to tables and indexes, in the files under `pg_wal`. A change is logged before the data page it describes may reach the disk.' },
		{ term: 'LSN', def: 'Log sequence number: a position in the WAL. Each data page remembers the LSN of the last WAL record that changed it.' },
		{ term: 'fsync', def: 'The system call that asks the OS to push a file\'s data to stable storage and wait until it is there. Without it, a "written" file may still sit in the OS cache.' },
		{ term: 'Checkpoint', def: 'A point where every dirty page in memory has been written to the data files. Recovery starts from the last one, and older WAL can be recycled. Every 5 minutes or 1 GB of WAL by default.' },
		{ term: 'Full-page write', def: 'The first change to a page after a checkpoint logs a copy of the whole 8 kB page, so a page torn by a crash mid-write can be rebuilt.' },
		{ term: 'Redo', def: 'Crash recovery: read the WAL from the last checkpoint and reapply every change whose page is older than the record.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['tx["UPDATE accounts SET balance = balance - 10"] --> buf["Shared buffer: the 8 kB page changed in memory, marked dirty"]'],
				highlight: ['tx', 'buf'],
				note: '**The change happens in memory.** PostgreSQL reads the page into shared buffers, changes the row there and marks the page dirty. Nothing goes to the data file yet. This is fast, and it is also exactly what a crash would wipe out.'
			},
			{
				add: ['buf --> rec["WAL record appended, page stamped with its LSN"]', 'rec -->|"COMMIT: flush up to the commit record"| wal[("pg_wal: written in order")]'],
				highlight: ['rec', 'wal'],
				note: '**The log entry comes first.** A WAL record describing the change goes into the WAL buffers, and the page is stamped with that record\'s position, its LSN. At `COMMIT`, the server flushes the WAL up to the commit record and waits for the disk. One sequential flush can cover many small transactions at once.'
			},
			{
				add: ['wal --> ok["Client receives COMMIT"]'],
				highlight: ['ok'],
				note: '**COMMIT means "the log is on disk".** With the default `synchronous_commit = on`, success is reported only after the WAL is flushed. The data page itself may stay dirty in memory for minutes. It does not matter: the log is enough to rebuild it.'
			},
			{
				add: ['ckpt["Checkpoint: every 5 min or 1 GB of WAL"] -->|"write all dirty pages"| data[("Data files: tables and indexes")]', 'buf -.->|"only once WAL is flushed up to the page LSN"| data'],
				highlight: ['ckpt', 'data'],
				note: '**Pages reach the data files later.** Before the buffer manager writes a dirty page, it checks that the WAL is flushed at least up to the page\'s LSN. A checkpoint writes every dirty page, spread over time to avoid an I/O burst, and records where recovery may start. WAL before that point can be recycled.'
			},
			{
				add: ['crash["After a crash: redo from the last checkpoint"] --> wal', 'crash -->|"reapply records newer than each page"| data'],
				highlight: ['crash'],
				note: '**Recovery replays the log.** On restart, PostgreSQL reads the WAL from the last checkpoint\'s redo point and reapplies each record to its page, skipping pages whose LSN shows the change is already there. Committed transfers come back. Uncommitted ones have no commit record and stay invisible.'
			}
		]
	},
	example: {
		title: 'src/backend/access/heap/heapam.c: heap_insert, change the page, then log it',
		repo: 'postgres/postgres',
		url: `${HEAPAM}#L2142-L2258`,
		lang: 'c',
		code: `	/* NO EREPORT(ERROR) from here till changes are logged */
	START_CRIT_SECTION();

	RelationPutHeapTuple(relation, buffer, heaptup,
						 (options & HEAP_INSERT_SPECULATIVE) != 0);
…
	MarkBufferDirty(buffer);

	/* XLOG stuff */
	if (RelationNeedsWAL(relation))
	{
…
		XLogBeginInsert();
		XLogRegisterData(&xlrec, SizeOfHeapInsert);
…
		XLogRegisterBuffer(HEAP_INSERT_BLKREF_HEAP, buffer,
						   REGBUF_STANDARD | bufflags);
		XLogRegisterBufData(HEAP_INSERT_BLKREF_HEAP, &xlhdr,
							SizeOfHeapHeader);
…
		recptr = XLogInsert(RM_HEAP_ID, info);

		PageSetLSN(page, recptr);

		if (vmbuffer_modified)
			PageSetLSN(BufferGetPage(vmbuffer), recptr);
	}

	END_CRIT_SECTION();`,
		notes: [
			'**The README spells out the recipe.** The [WAL coding rules](' + README + '#L437-L469) list the steps this code follows: lock the buffer, `START_CRIT_SECTION()`, apply the change, `MarkBufferDirty()`, build and insert the WAL record, `PageSetLSN()`, `END_CRIT_SECTION()`. heap_insert does them in that order.',
			'**Why a critical section.** The README says any error in those steps "must cause a PANIC because the shared buffers will contain unlogged changes, which we have to ensure don\'t get to disk". The comment at the top of the excerpt says the same: no `ERROR` until the change is logged.',
			'**The LSN stamp is the link.** The [same README](' + README + '#L407-L415) states the base rule: "log entries must reach stable storage before the data-page changes they describe". It is enforced by that stamp: "Before the bufmgr can write out a dirty page, it must ensure that xlog has been flushed to disk at least up to the page\'s LSN."',
			'**COMMIT is a flush.** In [`RecordTransactionCommit`](' + XACT + '#L1502-L1533), a transaction that wrote WAL with `synchronous_commit` on calls `XLogFlush(XactLastRecEnd)` before the commit is visible. With it off, `XLogSetAsyncXactLSN` only tells the WAL writer to flush soon. The docs put the risk window at "three times wal_writer_delay": 600 ms with the default of 200 ms.',
			'**SQLite has the same idea.** In WAL mode, "the changes are appended into a separate WAL file" and "A COMMIT occurs when a special record indicating a commit is appended to the WAL". It checkpoints by default when the WAL reaches 1000 pages. With `PRAGMA synchronous=NORMAL` it skips the sync at commit, trading durability after a power loss for speed.'
		]
	},
	tradeoff: {
		gain: [
			'Fast commits: one sequential flush of the log instead of random writes to every changed page, and one `fsync` can commit many concurrent transactions.',
			'Crash safety: after a power cut, replaying the WAL brings back every committed transaction and none of the uncommitted ones.',
			'The same log feeds backups to a point in time and streaming replicas (days 27 and 28), so one mechanism serves three needs.'
		],
		cost: [
			'Every change is written twice: once to the WAL, later to the data file. Full-page writes add a whole 8 kB page for the first change after each checkpoint.',
			'Checkpoints are a trade-off: frequent ones mean shorter recovery but more page writes and more full-page images; rare ones mean less I/O but a longer replay after a crash.',
			'The guarantee depends on `fsync` telling the truth. A disk or controller with a volatile write-back cache can report a write as done and lose it on power loss.',
			'`synchronous_commit = off` makes commits faster but can lose the last few hundred milliseconds of committed transactions in a crash.'
		]
	},
	task: {
		prompt: 'In `psql`: create `accounts(id int primary key, balance int not null)` with 100,000 rows, then run `CHECKPOINT`. Now run three updates with `EXPLAIN (ANALYZE, WAL)`: `UPDATE accounts SET balance = balance - 10 WHERE id = 1`, then the same for `id = 2` (same page), then `CHECKPOINT` again and `id = 3`. Compare the `WAL:` line of the top node. Explain the difference.',
		hint: 'Look at `fpi` (full-page images) and `bytes`. Which update is the first change to its page since the last checkpoint?',
		answer: [
			'`id = 1`, right after the checkpoint: `WAL: records=4 fpi=3 bytes=19737` on PostgreSQL 18. Each page touched for the first time since the checkpoint has its whole 8 kB image logged: three images here.',
			'`id = 2`, same page, no checkpoint in between: `WAL: records=2 bytes=127`. The page already has a full image in the WAL after the last checkpoint, so only the small change is logged.',
			'`id = 3` after a new `CHECKPOINT`: `fpi=1 bytes=8342`. The checkpoint resets the rule, and the first change to the page pays for a full image again.',
			'This is the cost the docs warn about: a smaller checkpoint interval "increases the volume of output to the WAL". The images are what lets recovery rebuild a page that was half written when the power went out.'
		]
	},
	quiz: [
		{
			q: 'With default settings, what has reached the disk when the client receives `COMMIT`?',
			options: [
				'Every table and index page the transaction changed, flushed with fsync',
				'The WAL up to the commit record; the changed pages may still be in memory',
				'Nothing yet: the WAL writer flushes the commit a few hundred milliseconds later',
				'Only the commit record itself, while the other WAL records wait for the checkpoint'
			],
			answer: 1,
			why: 'With `synchronous_commit = on`, `RecordTransactionCommit` calls `XLogFlush` up to the end of the commit record before reporting success. WAL is flushed in order, so every earlier record of the transaction is on disk too. Data pages follow at the next checkpoint or when the buffer manager evicts them.'
		},
		{
			q: 'Why may PostgreSQL leave a changed data page unwritten for minutes after the commit?',
			options: [
				'Because the page is written only when the next query reads it',
				'Because the client keeps a copy of the change until the page is written',
				'Because the WAL on disk holds everything needed to redo the change after a crash',
				'Because the data files are copied from a replica after a crash'
			],
			answer: 2,
			why: 'That is the whole point of a write-ahead log: once the record is durable, the page can be rebuilt from it. The buffer manager only has to make sure the WAL is flushed up to the page\'s LSN before it writes the page.'
		},
		{
			q: 'You lower `checkpoint_timeout` from 5 minutes to 30 seconds to make recovery faster. What else happens?',
			options: [
				'Commits get slower, because every commit now waits for a checkpoint',
				'The WAL grows, because more first changes after a checkpoint log a full page image',
				'Nothing else, because checkpoints only touch pages that are already clean',
				'Durability drops, because pages are written before their WAL records'
			],
			answer: 1,
			why: 'With full_page_writes on, the first change to each page after a checkpoint logs the whole page. More checkpoints means more of those images and more page writes. Commits still wait only for the WAL flush, and the WAL-before-data rule does not change.'
		}
	],
	takeaway: 'PostgreSQL logs every change before the page it touches can reach the disk, makes COMMIT wait only for that sequential log, writes pages later at checkpoints, and after a crash replays the log from the last checkpoint.',
	sources: [
		{ title: 'PostgreSQL 18 docs, Write-Ahead Logging (WAL)', url: 'https://www.postgresql.org/docs/18/wal-intro.html' },
		{ title: 'PostgreSQL 18 docs, WAL Configuration', url: 'https://www.postgresql.org/docs/18/wal-configuration.html' },
		{ title: 'PostgreSQL 18 docs, Asynchronous Commit', url: 'https://www.postgresql.org/docs/18/wal-async-commit.html' },
		{ title: 'PostgreSQL source, src/backend/access/transam/README', url: 'https://github.com/postgres/postgres/blob/92d47d544bf64274b6a7aa8775f7b35bcf71f339/src/backend/access/transam/README' },
		{ title: 'SQLite docs, Write-Ahead Logging', url: 'https://www.sqlite.org/wal.html' }
	]
};
