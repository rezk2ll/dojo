const ANKI = 'https://github.com/ankitects/anki/blob/c3139c607373c99c81854d61f1ddc45e4606343c/rslib/src/storage/sqlite.rs';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'why-a-database',
	part: 'Data and questions',
	title: 'Why not just files?',
	minutes: 10,
	hook: [
		'Your side project keeps its data in `tasks.json`. Load the file, change the list, write the file back. It works for months.',
		'Then the laptop dies halfway through a save. Or two browser tabs save at the same moment, and **one tab\'s changes vanish without an error**. Or someone asks for "every task due this week", and the only way to answer is **to read the whole file and loop**.',
		'You could write a fix for each one yourself. A database is **those fixes, written once, tested for years**. And sometimes the right database is still a single file: SQLite\'s own docs say it "does not compete with client/server databases. SQLite competes with fopen()."'
	],
	terms: [
		{ term: 'Atomic commit', def: 'A group of changes lands completely or not at all. A crash halfway leaves the old state, never a mix.' },
		{ term: 'Durability', def: 'Once the database says "committed", the change survives a crash or a power cut. It is on disk, not only in a cache.' },
		{ term: 'Concurrent access', def: 'Several readers and writers use the same data at once without corrupting it or silently losing writes.' },
		{ term: 'Query', def: 'Asking for data by what it looks like ("tasks due this week") instead of by where it sits in a file.' },
		{ term: 'Rollback journal', def: 'SQLite\'s classic trick: copy the original pages to a side file first, change the database, delete the side file to commit.' },
		{ term: 'Embedded database', def: 'A database that is a library inside your program, reading and writing one file. SQLite is one. PostgreSQL, by contrast, is a server you connect to.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['app["App: BEGIN, change 3 pages"] -->|"copy original pages"| journal[("rollback journal")]'],
				highlight: ['app', 'journal'],
				note: '**Save the old version first.** Before touching the database file, SQLite "creates a separate rollback journal file and writes into the rollback journal the original content of the database pages that are to be altered". The journal holds everything needed to undo the change.'
			},
			{
				add: ['journal -->|"fsync"| disk1["journal on disk"]'],
				highlight: ['disk1'],
				note: '**Force it to disk.** A new file usually lives only in the OS cache. SQLite flushes the journal to storage, often with two `fsync()` calls, before it changes anything else. The docs call this "a critical step in insuring that the database can survive an unexpected power loss".'
			},
			{
				add: ['app -->|"write new pages, fsync"| db[("database file")]'],
				highlight: ['db'],
				note: '**Now change the real file.** With an exclusive lock held, SQLite writes the new pages and flushes again. The two flushes take most of the time of a commit. That is the price of crash safety.'
			},
			{
				add: ['db -->|"delete journal"| commit["Committed"]'],
				highlight: ['commit'],
				note: '**One delete is the commit.** "This is the instant where the transaction commits." Deleting a file looks atomic to a process: the journal is either there or not. No journal means the change is complete.'
			},
			{
				add: ['crash["Crash before the delete"] -.->|"hot journal found on next open"| journal', 'journal -.->|"play back old pages"| db'],
				highlight: ['crash'],
				note: '**Recovery is automatic.** On the next open, SQLite sees a leftover "hot journal" and copies the original pages back. The database looks as if the transaction never started. Your `tasks.json` has no such journal.'
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
			'**SQLite as a file format.** Anki does not write its own file format. A collection is one SQLite file, opened with `Connection::open(path)`. SQLite\'s docs list this use by name: the File/Open menu "calls sqlite3_open() to attach to the database file", and "the File/Save menu option becomes superfluous".',
			'**One app owns the file.** [`locking_mode` exclusive](' + ANKI + '#L64) keeps the file lock for as long as the connection is open. The pragma docs give that as the first reason to use it: "The application wants to prevent other processes from accessing the database file." With [`busy_timeout` of zero](' + ANKI + '#L62), a second process gets `SQLITE_BUSY` at once instead of waiting.',
			'**WAL needs a checkpoint before a copy.** [`journal_mode` wal](' + ANKI + '#L68) writes changes to a separate `-wal` file first. That is why [`checkpoint`](' + ANKI + '#L559-L569) exists: "Flush data from WAL file into DB, so the DB is safe to copy." The [backup code](https://github.com/ankitects/anki/blob/c3139c607373c99c81854d61f1ddc45e4606343c/rslib/src/collection/backup.rs#L41-L42) calls it right before reading the file.',
			'**All or nothing, from the app side.** Creating or upgrading a collection runs inside [`begin exclusive`](' + ANKI + '#L505-L508), so a crash mid-upgrade leaves the old schema. Normal edits go through [`begin_trx` and `commit_trx`](' + ANKI + '#L585-L595), and the code [says plainly](' + ANKI + '#L607-L608) that Anki "uses long-running transactions as an undo mechanism".',
			'**Trust, but check.** On request, the open path runs [`integrity_check`](' + ANKI + '#L499-L503) and refuses a file that does not answer "ok". A hand-rolled JSON format would need its own checksum to do the same.'
		]
	},
	tradeoff: {
		gain: [
			'Crash safety for free: a change lands completely or not at all, and recovery runs by itself on the next open.',
			'Concurrent use without hand-written locks: SQLite serializes writers, a server like PostgreSQL lets many write at once.',
			'Questions instead of loops: "tasks due this week" is one query, and an index makes it fast without reading everything.',
			'SQLite keeps the simple parts of a file: one file to copy, mail or back up, and no server to run.'
		],
		cost: [
			'Durability costs time: each commit waits for the disk. SQLite\'s FAQ: it "will easily do 50,000 or more INSERT statements per second" but "only do a few dozen transactions per second". Group many changes in one transaction.',
			'A database file is not human-readable. You need `sqlite3` or a tool to look inside, where a JSON file opens in any editor.',
			'SQLite has limits on purpose: "it will only allow one writer at any instant in time", and it should not sit on a network filesystem shared by many computers.',
			'A server database (PostgreSQL) adds a process to run, upgrade, back up and secure.'
		]
	},
	task: {
		prompt: 'Pick a storage for each case: a plain file, SQLite, or PostgreSQL. Give the one reason that decides it. (1) A CLI tool\'s settings, read once at start. (2) A desktop notes app with search and tags. (3) A web shop with 4 app servers taking orders at the same time. (4) A nightly CSV export someone opens in a spreadsheet.',
		hint: 'Ask three questions: does a crash halfway hurt, does more than one process write, and do you need to find data by what it contains?',
		answer: [
			'(1) A plain file. It is read once, written rarely, by one process, and a person may want to edit it by hand.',
			'(2) SQLite. One user, one machine, but edits must survive a crash and search must not read every note. This is the "application file format" case, like Anki.',
			'(3) PostgreSQL. Four servers write at once over the network. SQLite\'s docs say to "avoid using SQLite in situations where the same database will be accessed directly (without an intervening application server) and simultaneously from many computers over a network".',
			'(4) A plain file. Its job is to be read by another program. A database can produce it, but the export itself is a file.'
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
	takeaway: 'A database is crash safety, safe sharing and questions you do not have to code yourself; SQLite gives you that in a single file, a server earns its place when many machines write at once.',
	sources: [
		{ title: 'SQLite docs, Appropriate Uses For SQLite', url: 'https://www.sqlite.org/whentouse.html' },
		{ title: 'SQLite docs, Atomic Commit In SQLite', url: 'https://www.sqlite.org/atomiccommit.html' },
		{ title: 'SQLite docs, SQLite As An Application File Format', url: 'https://www.sqlite.org/appfileformat.html' },
		{ title: 'SQLite docs, Write-Ahead Logging', url: 'https://www.sqlite.org/wal.html' },
		{ title: 'SQLite FAQ, INSERT is really slow', url: 'https://www.sqlite.org/faq.html#q19' },
		{ title: 'SQLite docs, PRAGMA locking_mode', url: 'https://www.sqlite.org/pragma.html#pragma_locking_mode' }
	]
};
