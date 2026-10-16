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
