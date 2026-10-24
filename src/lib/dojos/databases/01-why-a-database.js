const ANKI = 'https://github.com/ankitects/anki/blob/c3139c607373c99c81854d61f1ddc45e4606343c/rslib/src/storage/sqlite.rs';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'why-a-database',
	part: 'Data and questions',
	title: 'Why use a database instead of a file',
	minutes: 10,
	hook: [
		'Your side project keeps its data in `tasks.json`. Load the file, change the list, write the file back. It works for months.',
		'Then the laptop dies halfway through a save. Or two browser tabs save at the same moment, and **one tab\'s changes vanish without an error**. Or someone asks for "every task due this week", and the only way to answer is to read the whole file and loop.',
		'You could write a fix for each of these three problems yourself. A database already ships all three fixes. And sometimes the right database is still a single file: SQLite\'s own docs say it "does not compete with client/server databases. SQLite competes with fopen()."'
	],
	terms: [
		{ term: 'Atomic commit', def: 'A group of changes lands completely or not at all. A crash halfway leaves the old state, never a mix.' },
		{ term: 'Durability', def: 'Once the database says "committed", the change survives a crash or a power cut. It is on disk, not only in a cache.' },
		{ term: 'Concurrent access', def: 'Several readers and writers use the same data at once without corrupting it or silently losing writes.' },
		{ term: 'Rollback journal', def: 'A side file where SQLite copies the original pages before it changes the database. Deleting the side file commits the change.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['app["App: BEGIN, change 3 pages"] -->|"copy original pages"| journal[("rollback journal")]'],
				highlight: ['app', 'journal'],
				note: 'Before it touches the database file, SQLite "creates a separate rollback journal file and writes into the rollback journal the original content of the database pages that are to be altered". The journal holds everything needed to undo the change.'
			},
			{
				add: ['journal -->|"fsync"| disk1["journal on disk"]'],
				highlight: ['disk1'],
				note: 'A new file usually lives only in the OS cache. SQLite then forces the journal to disk, often with two `fsync()` calls, before it changes anything else. The docs call this "a critical step in insuring that the database can survive an unexpected power loss".'
			},
			{
				add: ['app -->|"write new pages, fsync"| db[("database file")]'],
				highlight: ['db'],
				note: 'With an exclusive lock held, SQLite writes the new pages into the database file and flushes again. The two flushes take most of the time of a commit.'
			},
			{
				add: ['db -->|"delete journal"| commit["Committed"]'],
				highlight: ['commit'],
				note: 'Deleting the journal commits the transaction: "This is the instant where the transaction commits." To a process, a file delete looks atomic, so the journal is either there or not. Once it is gone, the new pages are the database.'
			},
			{
				add: ['crash["Crash before the delete"] -.->|"hot journal found on next open"| journal', 'journal -.->|"play back old pages"| db'],
				highlight: ['crash'],
				note: 'On the next open, SQLite finds the leftover "hot journal" and copies the original pages back. The database then looks as if the transaction never started. Your `tasks.json` has no journal to play back.'
			}
		]
	},
	example: {
		title: 'rslib/src/storage/sqlite.rs: Anki keeps every flashcard collection in one SQLite file',
		repo: 'ankitects/anki',
		url: `${ANKI}#L52-L595`,
		lang: 'rust',
		code: `fn open_or_create_collection_db(path: &Path) -> Result<Connection> {
    let db = Connection::open(path)?;
…
    db.busy_timeout(std::time::Duration::from_secs(0))?;

    db.pragma_update(None, "locking_mode", "exclusive")?;
    db.pragma_update(None, "page_size", 4096)?;
    db.pragma_update(None, "cache_size", -40 * 1024)?;
    db.pragma_update(None, "legacy_file_format", false)?;
    db.pragma_update(None, "journal_mode", "wal")?;
…

        if check_integrity {
            let s =
                db.pragma_query_value(None, "integrity_check", |row| row.get::<_, String>(0))?;
            require!(s == "ok", "corrupt: {s}");
        }

        let upgrade = ver != SCHEMA_MAX_VERSION;
        if create || upgrade {
            db.execute("begin exclusive", [])?;
        }
…
    /// Flush data from WAL file into DB, so the DB is safe to copy. Caller must
    /// not call this while there is an active transaction.
    pub(crate) fn checkpoint(&self) -> Result<()> {
        if !self.db.is_autocommit() {
            return Err(AnkiError::db_error(
                "active transaction",
                DbErrorKind::Other,
            ));
        }
        self.db
            .query_row_and_then("pragma wal_checkpoint(truncate)", [], |row| {
…
    pub(crate) fn begin_trx(&self) -> Result<()> {
        self.db.prepare_cached("begin exclusive")?.execute([])?;
        Ok(())
    }

    pub(crate) fn commit_trx(&self) -> Result<()> {
        if !self.db.is_autocommit() {
            self.db.prepare_cached("commit")?.execute([])?;
        }
        Ok(())
    }`,
		notes: [
			'Line 2 opens the collection with `Connection::open(path)`. Anki has no file format of its own: a collection is one SQLite file. SQLite\'s docs describe this use: the File/Open menu "calls sqlite3_open() to attach to the database file", and "the File/Save menu option becomes superfluous".',
			'Line 6 sets `locking_mode` exclusive, so Anki keeps the file lock for as long as the connection is open. The pragma docs give that as the first reason to use it: "The application wants to prevent other processes from accessing the database file." Line 4 sets `busy_timeout` to zero, so a second process gets `SQLITE_BUSY` at once instead of waiting.',
			'Line 10 turns on `journal_mode` wal, which writes changes to a separate `-wal` file first. Lines 24 to 34 hold `checkpoint`, which copies the `-wal` file into the database: "Flush data from WAL file into DB, so the DB is safe to copy." The [backup code](https://github.com/ankitects/anki/blob/c3139c607373c99c81854d61f1ddc45e4606343c/rslib/src/collection/backup.rs#L41-L42) calls it right before it reads the file.',
			'Line 21 runs the creation or upgrade of a collection inside `begin exclusive`, so a crash mid-upgrade leaves the old schema. Lines 36 to 46 open and commit the transaction for normal edits. A comment in the same file says Anki ["uses long-running transactions as an undo mechanism"](' + ANKI + '#L607-L608).',
			'Lines 13 to 16 run `integrity_check` when the caller asks for it, and refuse a file that does not answer "ok". A hand-rolled JSON format would need its own checksum to do the same.'
		]
	},
	tradeoff: {
		gain: [
			'A change lands completely or not at all, and SQLite runs the recovery itself on the next open.',
			'Concurrent use without hand-written locks: SQLite serializes writers, a server like PostgreSQL lets many write at once.',
			'"Tasks due this week" is one query, and an index answers it without reading every task.',
			'SQLite keeps the simple parts of a file: one file to copy, mail or back up, and no server to run.'
		],
		cost: [
			'Each commit waits for the disk. SQLite\'s FAQ: it "will easily do 50,000 or more INSERT statements per second" but "only do a few dozen transactions per second". Group many changes in one transaction.',
			'You need `sqlite3` or another tool to look inside a database file. A JSON file opens in any editor.',
			'SQLite "will only allow one writer at any instant in time", and it should not sit on a network filesystem shared by many computers.',
			'A server database (PostgreSQL) adds a process to run, upgrade, back up and secure.'
		]
	},
	task: {
		prompt: 'Pick a storage for each case: a plain file, SQLite, or PostgreSQL. Give the one reason that decides it. (1) A CLI tool\'s settings, read once at start. (2) A desktop notes app with search and tags. (3) A web shop with 4 app servers taking orders at the same time. (4) A nightly CSV export someone opens in a spreadsheet.',
		hint: 'Ask three questions: does a crash halfway hurt, does more than one process write, and do you need to find data by what it contains?',
		answer: [
			'(1) A plain file. It is read once, written rarely, by one process, and a person may want to edit it by hand.',
			'(2) SQLite. One user, one machine, but edits must survive a crash and search must not read every note. SQLite\'s docs call this an "application file format", and Anki uses SQLite this way.',
			'(3) PostgreSQL. Four servers write at once over the network. SQLite\'s docs say to "avoid using SQLite in situations where the same database will be accessed directly (without an intervening application server) and simultaneously from many computers over a network".',
			'(4) A plain file. Another program reads it. A database can produce it, but the export itself is a file.'
		],
		steps: [
			{
				title: 'Ask the three questions',
				questions: [
					{ q: 'Your app crashes halfway through rewriting `tasks.json`. What can you find on disk?', options: ['Always the old file: the OS rolls back a partial write', 'A file that may mix old and new data, or stop short', 'Always the new file: one write call is all or nothing', 'A rollback journal the app can play back on start'], answer: 1, why: 'A plain file has no journal. Nothing undoes a save that stopped halfway.' },
					{ q: 'Two browser tabs save `tasks.json` at the same moment. What happens?', options: ['The second save fails with a clear error', 'The file keeps both sets of changes, merged', 'One tab\'s changes vanish without an error', 'The OS locks the file until the first tab closes'], answer: 2, why: 'Each tab writes back its own copy of the list. The last write wins, and nothing warns you.' },
					{ q: 'Someone asks for "every task due this week". How does a JSON file answer?', options: ['You read the whole file and loop over every task', 'The OS keeps an index of the keys in the file', 'You jump to the right line, since JSON is sorted', 'You run one query, like with a database'], answer: 0, why: 'A file has no index. A database answers with one query, and an index avoids reading every task.' },
					{ q: 'Once you need a database, which question decides between SQLite and PostgreSQL?', options: ['Whether the data fits in memory', 'Whether you need to search by content', 'Whether the app is written in Rust or in Python', 'Whether many machines write at the same time'], answer: 3, why: 'SQLite "will only allow one writer at any instant in time". Many machines writing at once is the PostgreSQL case.' }
				]
			},
			{
				title: 'Settle the one-user cases',
				questions: [
					{ q: '(1) A CLI tool\'s settings, read once at start. What do you pick?', options: ['PostgreSQL', 'A plain file', 'SQLite', 'SQLite on a network share'], answer: 1, why: 'Read once, written rarely, by one process. A database solves problems this case does not have.' },
					{ q: 'What tips (1) toward a plain file, beyond its size?', options: ['A person may want to edit it by hand', 'Files are faster than SQLite for every read', 'SQLite cannot store key and value pairs', 'Settings must be shared with other machines'], answer: 0, why: 'A JSON or text file opens in any editor. A database file needs `sqlite3` or another tool.' },
					{ q: '(2) A desktop notes app with search and tags. What do you pick?', options: ['A plain file per note', 'PostgreSQL on the same laptop', 'SQLite', 'A nightly CSV export'], answer: 2, why: 'One user on one machine, but edits must survive a crash and search must not read every note. SQLite\'s docs call this an "application file format".' },
					{ q: 'Which app in this chapter uses SQLite the way (2) would?', options: ['Chrome, which keeps each tab in its own JSON file', 'Anki, which keeps each flashcard collection in one SQLite file', 'Firefox, which runs a PostgreSQL server for bookmarks', 'Anki, which writes a JSON file and checksums it'], answer: 1, why: 'Anki opens its collection with `Connection::open(path)`. It has no file format of its own.' }
				]
			},
			{
				title: 'Settle the shop',
				questions: [
					{ q: '(3) A web shop with 4 app servers taking orders at the same time. What do you pick?', options: ['SQLite on a shared network drive', 'One JSON file per order', 'SQLite on each app server', 'PostgreSQL'], answer: 3, why: 'Four servers write at once over the network. A server like PostgreSQL lets many write at once.' },
					{ q: 'Why not one SQLite file on a network filesystem for (3)?', options: ['File locking is buggy on many network filesystems, and that can corrupt the file', 'SQLite refuses to open a file that is not on a local disk', 'SQLite cannot store more than one table per file', 'Network filesystems do not support the `fsync()` call at all'], answer: 0, why: 'The docs warn that two clients might then write the same part of the file at once, "resulting in corruption".' },
					{ q: 'What does SQLite do when a second writer arrives while the first holds its write lock?', options: ['It merges both writes into one commit', 'It lets both write, then keeps the last one', 'It makes the second one wait or get `SQLITE_BUSY`', 'It writes the second change to a new file'], answer: 2, why: 'SQLite serializes writers: one at a time. Anki even sets `busy_timeout` to zero, so a second process gets `SQLITE_BUSY` at once.' },
					{ q: 'What does PostgreSQL cost you that SQLite does not?', options: ['A file you cannot copy or mail', 'A process to run, upgrade, back up and secure', 'No way to run a query with an index', 'No support for transactions'], answer: 1, why: 'A server database is one more service to look after. That is the price of many writers at once.' }
				]
			},
			{
				title: 'Settle the export',
				questions: [
					{ q: '(4) A nightly CSV export someone opens in a spreadsheet. What do you pick?', options: ['A plain file', 'SQLite', 'PostgreSQL', 'A rollback journal'], answer: 0, why: 'Another program reads it, and a spreadsheet opens a CSV file directly.' },
					{ q: 'The shop data lives in PostgreSQL. Does that change the answer for (4)?', options: ['Yes: the spreadsheet must connect to PostgreSQL', 'Yes: the export must become a SQLite file', 'No: a database can produce it, but the export itself is a file', 'No: CSV files are a kind of database'], answer: 2, why: 'Where the data lives and what the reader needs are two questions. The reader here needs a file.' },
					{ q: 'The notes app (2) crashes halfway through a save, in rollback journal mode. What does SQLite do on the next open?', options: ['It keeps the half-written pages and logs a warning', 'It asks the user which version of each note to keep', 'It refuses the file until you restore a backup', 'It finds the leftover journal and copies the original pages back'], answer: 3, why: 'The journal left behind is "hot". SQLite plays it back, and the database looks as if the save never started.' },
					{ q: 'Your notes app moves from JSON to SQLite. What does it cost the user?', options: ['They need `sqlite3` or another tool to look inside the file', 'They need a server running in the background', 'They can no longer copy the data as one file', 'They lose all edits made since the last backup'], answer: 0, why: 'SQLite keeps the one-file simplicity, but a JSON file opens in any editor and a database file does not.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'In SQLite\'s rollback journal mode, at what moment does a transaction count as committed?',
			options: [
				'When the new pages have been written into the OS cache of the database file',
				'When the rollback journal file is deleted after the database file was flushed',
				'When the rollback journal has been flushed to disk with its page count header',
				'When the writer has escalated its pending lock to an exclusive lock on the file'
			],
			answer: 1,
			why: 'The docs: "This is the instant where the transaction commits." A journal still on disk after a crash is a hot journal, and it is played back to undo the change.'
		},
		{
			q: 'Anki opens its collection with `locking_mode` exclusive. While Anki runs, a script opens the same file and runs a SELECT. What happens?',
			options: [
				'The SELECT waits until Anki commits its current transaction, then reads',
				'The SELECT reads the last committed data from the WAL file without a lock',
				'The SELECT returns SQLITE_BUSY, because Anki holds the file lock all along',
				'The SELECT works, and Anki gets SQLITE_BUSY on its next write to the file'
			],
			answer: 2,
			why: 'The WAL docs: "If another database connection has the database mode open in exclusive locking mode then all queries against the database will return SQLITE_BUSY." They note that Chrome and Firefox do the same with their own files.'
		},
		{
			q: 'Which case do SQLite\'s own docs steer away from SQLite and toward a client/server database?',
			options: [
				'A desktop app that stores each document as one file on the local disk',
				'A phone app that keeps a cache of server data for offline reading',
				'A website on one server whose pages mostly read and rarely write',
				'Many computers writing to one database file on a network filesystem'
			],
			answer: 3,
			why: 'File locking "is buggy in many network filesystem implementations", and two clients might then write the same part of the file at once, "resulting in corruption". The other three are cases the docs list as a good fit.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Crash SQLite in the middle of a transaction, and watch it keep the old state and turn away a second writer.',
		steps: [
			'Make a scratch folder and a table: `mkdir -p ~/db-lab && cd ~/db-lab && sqlite3 tasks.db "CREATE TABLE task(id INTEGER PRIMARY KEY, title TEXT NOT NULL);"`.',
			'Start a writer that opens a transaction and never commits: `(echo "BEGIN; INSERT INTO task(title) VALUES (\'buy milk\'), (\'call mom\');"; sleep 30) | sqlite3 tasks.db &`. Run `ls` right away: a `tasks.db-journal` file sits next to the database.',
			'Within the 30 seconds, try a second writer: `sqlite3 tasks.db "INSERT INTO task(title) VALUES (\'from tab 2\');"`.',
			'Crash the first writer with `kill -9 %1`, then count the rows: `sqlite3 tasks.db "SELECT count(*) FROM task;"` and check the file with `sqlite3 tasks.db "PRAGMA integrity_check;"`.',
			'Now do it with a commit: `sqlite3 tasks.db "BEGIN; INSERT INTO task(title) VALUES (\'buy milk\'), (\'call mom\'); COMMIT;"` and count again.'
		],
		done: [
			'The second writer in step 3 prints `database is locked`.',
			'After the crash, `SELECT count(*) FROM task;` prints `0` and `PRAGMA integrity_check;` prints `ok`.',
			'After the committed run, the count is `2`.'
		],
		solution: [
			'The journal holds what SQLite needs to undo the change, so the crash leaves the old state: no rows, and no half-written file.',
			'SQLite lets one writer in at a time. The second one gets `SQLITE_BUSY`, shown as `database is locked`, instead of silently losing a write like the two browser tabs.',
			'Only the `COMMIT` makes the rows count. Rewrite the same test with `tasks.json` and a `kill -9` in the middle of the save, and nothing protects you.'
		]
	},
	recall: {
		q: 'Which three problems of `tasks.json` does a database solve, and when do you pick PostgreSQL over SQLite?',
		a: 'A crash halfway through a save, two writers losing each other\'s changes, and reading the whole file to answer a question. Pick PostgreSQL when many machines write at once, because SQLite allows one writer at a time.'
	},
	sources: [
		{ title: 'SQLite docs, Appropriate Uses For SQLite', url: 'https://www.sqlite.org/whentouse.html' },
		{ title: 'SQLite docs, Atomic Commit In SQLite', url: 'https://www.sqlite.org/atomiccommit.html' },
		{ title: 'SQLite docs, SQLite As An Application File Format', url: 'https://www.sqlite.org/appfileformat.html' },
		{ title: 'SQLite docs, Write-Ahead Logging', url: 'https://www.sqlite.org/wal.html' },
		{ title: 'SQLite FAQ, INSERT is really slow', url: 'https://www.sqlite.org/faq.html#q19' },
		{ title: 'SQLite docs, PRAGMA locking_mode', url: 'https://www.sqlite.org/pragma.html#pragma_locking_mode' }
	]
};
