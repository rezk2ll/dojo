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
		'After a crash, PostgreSQL rebuilds the missing page changes by **replaying** the log from the last checkpoint. SQLite has a WAL mode built on the same rule.'
	],
	terms: [
		{ term: 'WAL', def: 'Write-ahead log: an append-only record of every change to tables and indexes, in the files under `pg_wal`. A change is logged before the data page it describes may reach the disk.' },
		{ term: 'LSN', def: 'Log sequence number: a position in the WAL. Each data page remembers the LSN of the last WAL record that changed it.' },
		{ term: 'Checkpoint', def: 'A point where every dirty page in memory has been written to the data files. Recovery starts from the last one, and older WAL can be recycled. Every 5 minutes or 1 GB of WAL by default.' },
		{ term: 'Full-page write', def: 'The first change to a page after a checkpoint logs a copy of the whole 8 kB page, so a page torn by a crash mid-write can be rebuilt.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['tx["UPDATE accounts SET balance = balance - 10"] --> buf["Shared buffer: the 8 kB page changed in memory, marked dirty"]'],
				highlight: ['tx', 'buf'],
				note: 'PostgreSQL reads the page into shared buffers, changes the row there and marks the page dirty. Nothing goes to the data file yet. The change in memory is fast, and a crash at this point would wipe it out.'
			},
			{
				add: ['buf --> rec["WAL record appended, page stamped with its LSN"]', 'rec -->|"COMMIT: flush up to the commit record"| wal[("pg_wal: written in order")]'],
				highlight: ['rec', 'wal'],
				note: 'A WAL record describing the change goes into the WAL buffers, and the page is stamped with that record\'s position, its LSN. At `COMMIT`, the server flushes the WAL up to the commit record and waits for the disk. One sequential flush can cover many small transactions at once.'
			},
			{
				add: ['wal --> ok["Client receives COMMIT"]'],
				highlight: ['ok'],
				note: 'With the default `synchronous_commit = on`, `COMMIT` is reported only after the WAL is flushed to disk. The data page itself may stay dirty in memory for minutes. After a crash, the log is enough to rebuild it.'
			},
			{
				add: ['ckpt["Checkpoint: every 5 min or 1 GB of WAL"] -->|"write all dirty pages"| data[("Data files: tables and indexes")]', 'buf -.->|"only once WAL is flushed up to the page LSN"| data'],
				highlight: ['ckpt', 'data'],
				note: 'Before the buffer manager writes a dirty page to the data files, it checks that the WAL is flushed at least up to the page\'s LSN. A checkpoint writes every dirty page, spread over time to avoid an I/O burst, and records where recovery may start. WAL before that point can be recycled.'
			},
			{
				add: ['crash["After a crash: redo from the last checkpoint"] --> wal', 'crash -->|"reapply records newer than each page"| data'],
				highlight: ['crash'],
				note: 'On restart, PostgreSQL runs redo: it reads the WAL from the last checkpoint\'s redo point and reapplies each record to its page, skipping pages whose LSN shows the change is already there. Committed transfers come back. Uncommitted ones have no commit record and stay invisible.'
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
			'The [WAL coding rules](' + README + '#L437-L469) in the README list the steps this code follows, in order: lock the buffer, `START_CRIT_SECTION()` (line 2), apply the change (lines 4 and 5), `MarkBufferDirty()` (line 7), build and insert the WAL record (lines 13 to 21), `PageSetLSN()` (line 23), `END_CRIT_SECTION()` (line 29).',
			'Lines 2 and 29 open and close a critical section. The README says any error in those steps "must cause a PANIC because the shared buffers will contain unlogged changes, which we have to ensure don\'t get to disk". The comment on line 1 says the same: no `ERROR` until the change is logged.',
			'Line 23 stamps the page with the LSN of its WAL record. The [same README](' + README + '#L407-L415) states the base rule: "log entries must reach stable storage before the data-page changes they describe". That stamp enforces it: "Before the bufmgr can write out a dirty page, it must ensure that xlog has been flushed to disk at least up to the page\'s LSN."',
			'In [`RecordTransactionCommit`](' + XACT + '#L1502-L1533), a transaction that wrote WAL with `synchronous_commit` on calls `XLogFlush(XactLastRecEnd)` before the commit is visible. With it off, `XLogSetAsyncXactLSN` only tells the WAL writer to flush soon. The docs put the risk window at "three times wal_writer_delay": 600 ms with the default of 200 ms.',
			'SQLite follows the same rule in WAL mode: "the changes are appended into a separate WAL file" and "A COMMIT occurs when a special record indicating a commit is appended to the WAL". It checkpoints by default when the WAL reaches 1000 pages. With `PRAGMA synchronous=NORMAL` it skips the sync at commit: commits are faster, and the last ones can be lost on a power loss.'
		]
	},
	tradeoff: {
		gain: [
			'Fast commits: one sequential flush of the log instead of random writes to every changed page, and one `fsync` can commit many concurrent transactions.',
			'Crash safety: after a power cut, replaying the WAL brings back every committed transaction and none of the uncommitted ones.',
			'The same log feeds backups to a point in time and streaming replicas (days 27 and 28).'
		],
		cost: [
			'Every change is written twice: once to the WAL, later to the data file. Full-page writes add a whole 8 kB page for the first change after each checkpoint.',
			'Frequent checkpoints mean shorter recovery but more page writes and more full-page images. Rare ones mean less I/O but a longer replay after a crash.',
			'The guarantee holds only if `fsync` returns after the data is really on stable storage. A disk or controller with a volatile write-back cache can report a write as done and lose it on power loss.',
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
			'The docs warn that a smaller checkpoint interval "increases the volume of output to the WAL". The images let recovery rebuild a page that was half written when the power went out.'
		],
		steps: [
			{
				title: 'Set up the test',
				questions: [
					{ q: 'Why run `CHECKPOINT` before the first update?', options: ['To empty the WAL so the numbers start at zero', 'To make the updates run faster', 'So the next change to each page is the first one since a checkpoint', 'So the table is locked during the test'], answer: 2, why: 'The full-page rule counts from the last checkpoint. Right after one, every page you touch pays for an image.' },
					{ q: 'Which command prints the WAL each update wrote?', options: ['`EXPLAIN (ANALYZE, WAL) UPDATE ...`', '`EXPLAIN (BUFFERS) UPDATE ...`', '`SELECT * FROM pg_wal`', '`SHOW wal_level`'], answer: 0, why: 'The `WAL` option adds a `WAL:` line with records, full-page images and bytes to each node.' },
					{ q: 'What does a checkpoint do?', options: ['It flushes the WAL of every open transaction and commits them', 'It writes every dirty page to the data files and marks where recovery may start', 'It copies the data files into a backup that recovery starts from', 'It removes the dead rows of every table and frees their space'], answer: 1, why: 'Recovery starts from the last checkpoint, and WAL before that point can be recycled.' },
					{ q: 'In the `WAL:` line, what does `fpi` count?', options: ['Failed page inserts that the server retried', 'Fsync calls the commit made to flush the WAL', 'Free pages left in the table after the update', 'Full-page images: whole 8 kB pages copied into the WAL'], answer: 3, why: '`fpi` is the number of full-page images the statement logged.' }
				]
			},
			{
				title: 'Read the first update',
				questions: [
					{ q: 'What does `id = 1`, right after the checkpoint, show on PostgreSQL 18?', options: ['`WAL: records=2 bytes=127`', '`WAL: records=4 fpi=3 bytes=19737`', '`WAL: records=1 fpi=1 bytes=8342`', 'No WAL line, since nothing is written until commit'], answer: 1, why: 'Four records, three full-page images, about 19.7 kB for a change of a few bytes.' },
					{ q: 'Why so many bytes for one small change?', options: ['Three pages are touched for the first time since the checkpoint, and each logs a full image', 'The update rewrites every row of the table, and each row is logged', 'The WAL stores the full SQL text and the result of the statement', 'The checkpoint is still running and adds its own records to the line'], answer: 0, why: 'Each page touched for the first time since the checkpoint has its whole image logged: three images here.' },
					{ q: 'About how big is one full-page image?', options: ['127 bytes', '1 GB', '8 kB, one whole page', '19.7 kB'], answer: 2, why: 'An image is a copy of the whole 8 kB page. Three of them account for most of the 19,737 bytes.' },
					{ q: 'Why log a whole page instead of just the change?', options: ['To make commits faster', 'To let replicas skip the data files', 'Because the WAL cannot store small records', 'So a page torn by a crash mid-write can be rebuilt'], answer: 3, why: 'If the power goes out while a page is half written, the image in the WAL lets recovery rebuild it.' }
				]
			},
			{
				title: 'Compare the next two',
				questions: [
					{ q: 'What does `id = 2`, on the same page with no checkpoint in between, show?', options: ['`WAL: records=4 fpi=3 bytes=19737`', '`WAL: records=1 fpi=1 bytes=8342`', '`WAL: records=2 bytes=127`', '`WAL: records=0 bytes=0`'], answer: 2, why: 'No full-page image: only the small change is logged.' },
					{ q: 'Why no full-page image this time?', options: ['Updates of id 2 are never logged', 'The page already has a full image in the WAL since the last checkpoint', 'The first update is still holding the page', 'The WAL buffers were full'], answer: 1, why: 'The image is needed once per page per checkpoint. The update of `id = 1` already paid for it.' },
					{ q: 'What does `id = 3`, after a new `CHECKPOINT`, show?', options: ['`fpi=1 bytes=8342`', '`fpi=0 bytes=127`', '`fpi=3 bytes=19737`', '`fpi=2 bytes=16000`'], answer: 0, why: 'One full-page image, about 8 kB, plus the change itself.' },
					{ q: 'What made `id = 3` pay for an image again?', options: ['A different row on a new page', 'A bigger change than the first two', 'Autovacuum running in between', 'The new checkpoint reset the rule'], answer: 3, why: 'The checkpoint resets the rule, and the first change to the page after it logs a full image again.' }
				]
			},
			{
				title: 'Explain the difference',
				questions: [
					{ q: 'You lower `checkpoint_timeout`. What happens to the WAL?', options: ['It grows: more first changes after a checkpoint log a full image', 'It shrinks: each checkpoint deletes WAL', 'Nothing: full images do not depend on checkpoints', 'Commits stop writing to it'], answer: 0, why: 'The docs warn that a smaller checkpoint interval "increases the volume of output to the WAL".' },
					{ q: 'What does a longer checkpoint interval cost instead?', options: ['Slower commits', 'Less durable commits', 'A longer replay after a crash', 'More full-page images'], answer: 2, why: 'Rare checkpoints mean less I/O, but recovery has more WAL to replay.' },
					{ q: 'When the `UPDATE` of `id = 1` commits, what is on disk for sure?', options: ['The changed page in the data file', 'The WAL up to the commit record', 'Nothing until the next checkpoint', 'Only the full-page images'], answer: 1, why: 'With `synchronous_commit = on`, the commit waits for the WAL flush. The data page can stay dirty in memory.' },
					{ q: 'After a crash, how does PostgreSQL get that change back?', options: ['From a copy of the change the client keeps until it is written', 'From the replica, which sends back the pages it already has', 'By rerunning the SQL statements found in the server log', 'By replaying the WAL from the last checkpoint onto each page'], answer: 3, why: 'Redo reads the WAL from the last checkpoint and reapplies each record, skipping pages whose LSN shows the change is already there.' }
				]
			}
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
			why: 'Once the WAL record is durable, the page can be rebuilt from it after a crash. The buffer manager only has to make sure the WAL is flushed up to the page\'s LSN before it writes the page.'
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
	lab: {
		minutes: 20,
		goal: 'Kill PostgreSQL mid-work and watch the WAL bring back the committed changes, and only those.',
		steps: [
			'Start PostgreSQL 18 without `--rm`, so its data survives a kill: `docker run -d --name pg-wal -e POSTGRES_PASSWORD=lab postgres:18`, wait a few seconds, then `docker exec -it pg-wal psql -U postgres`.',
			'Create the table and note the WAL position: `CREATE TABLE accounts (id int primary key, balance int not null); INSERT INTO accounts SELECT i, 100 FROM generate_series(1, 100000) i; CHECKPOINT; SELECT pg_current_wal_lsn();`',
			'Commit a transfer and look again: `BEGIN; UPDATE accounts SET balance = balance - 10 WHERE id = 1; UPDATE accounts SET balance = balance + 10 WHERE id = 2; COMMIT; SELECT pg_current_wal_lsn(), pg_walfile_name(pg_current_wal_lsn());`. In another terminal, list the WAL files: `docker exec pg-wal ls /var/lib/postgresql/18/docker/pg_wal`.',
			'In a second `psql` (`docker exec -it pg-wal psql -U postgres`), start a change and do not commit: `BEGIN; UPDATE accounts SET balance = 0 WHERE id <= 50;`',
			'Pull the plug: `docker kill pg-wal` (no clean shutdown), then `docker start pg-wal`, wait a few seconds, and read the log: `docker logs pg-wal 2>&1 | grep -E "not properly shut down|redo"`. Reconnect and run `SELECT id, balance FROM accounts WHERE id <= 2;` and `SELECT count(*) FROM accounts WHERE balance = 0;`. Clean up with `docker rm -f pg-wal`.'
		],
		done: [
			'The LSN after the transfer is higher than the one after the checkpoint.',
			'The log shows `database system was not properly shut down; automatic recovery in progress`, then `redo starts at` and `redo done at`.',
			'After the restart, accounts 1 and 2 hold 90 and 110, and the count of `balance = 0` is 0.'
		],
		solution: [
			'`COMMIT` waited for the WAL to reach the disk, not for the data pages. The changed pages may still have been only in memory when the kill came.',
			'On restart, redo replayed the WAL from the last checkpoint and reapplied the transfer to its pages.',
			'The uncommitted update has no commit record in the WAL, so its row versions stay invisible: no account is at 0.'
		]
	},
	recall: {
		q: 'With default settings, what is on disk when the client receives `COMMIT`, and how does PostgreSQL get the changed pages back after a crash?',
		a: 'The WAL up to the commit record, flushed by `XLogFlush`. The changed pages may still be in memory. After a crash, redo replays the WAL from the last checkpoint and reapplies each record to its page.'
	},
	sources: [
		{ title: 'PostgreSQL 18 docs, Write-Ahead Logging (WAL)', url: 'https://www.postgresql.org/docs/18/wal-intro.html' },
		{ title: 'PostgreSQL 18 docs, WAL Configuration', url: 'https://www.postgresql.org/docs/18/wal-configuration.html' },
		{ title: 'PostgreSQL 18 docs, Asynchronous Commit', url: 'https://www.postgresql.org/docs/18/wal-async-commit.html' },
		{ title: 'PostgreSQL source, src/backend/access/transam/README', url: 'https://github.com/postgres/postgres/blob/92d47d544bf64274b6a7aa8775f7b35bcf71f339/src/backend/access/transam/README' },
		{ title: 'SQLite docs, Write-Ahead Logging', url: 'https://www.sqlite.org/wal.html' }
	]
};
