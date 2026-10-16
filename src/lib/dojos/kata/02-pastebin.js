/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'pastebin',
	part: 'Small services',
	title: 'A paste service',
	minutes: 10,
	hook: [
		'A developer has a 900-line stack trace and a colleague on the other side of a chat. Chat cuts long messages and breaks the indentation. So the developer pastes the trace into a paste service, gets a link, and sends the link.',
		'The colleague opens the link once, finds the bad line, and nobody looks at the paste again. The developer picked "expire after 1 day", so the trace, with a database host name in it, should be gone tomorrow.'
	],
	terms: [
		{ term: 'Expiry time', def: 'The moment after which a paste must no longer be served. The author picks it when creating the paste.' },
		{ term: 'TOAST', def: 'PostgreSQL’s storage for large field values: it compresses them or moves them into a side table, without any change to your queries.' },
		{ term: 'Dead row version', def: 'In PostgreSQL, the old copy of a deleted or updated row. It keeps its disk space until `VACUUM` marks that space free for reuse.' }
	],
	kata: {
		brief: [
			'Anyone can paste text and get back a link that is hard to guess. A paste holds up to 1 MB of text. The author picks an expiry: 10 minutes, 1 day or 30 days.',
			'Users create **10 000 pastes a day**, 20 KB on average. There are 50 000 reads a day, and most pastes are read once or never.',
			'An expired paste must stop being served at its expiry time, to the second. Its row must be deleted within a day after that.'
		],
		minutes: 10,
		checklist: [
			'Your design says where the text of a paste is stored, and how much space that takes at the longest expiry.',
			'Your design says what stops an expired paste from being served between its expiry time and its deletion.',
			'Your design says what deletes expired pastes, how often it runs, and how many rows each run removes.',
			'Your design says where a paste over 1 MB is refused.',
			'Your design says how long a paste link is, and why nobody can list other pastes from it.',
			'Your design says whether reads go through a cache, using the fact that most pastes are read once.'
		],
		sample: [
			'Numbers first. 10 000 pastes of 20 KB is 200 MB a day. If every author picked 30 days, the service would hold 6 GB. In the worst case, every paste is 1 MB: 10 GB a day and 300 GB at 30 days. 50 000 reads a day is less than one read per second.',
			'Everything goes in one PostgreSQL table: `pastes(code, body text, expires_at, created_at)`, with `code` as the primary key. A 20 KB body is wider than the 2 kB at which TOAST starts, so PostgreSQL compresses it or moves it out of the row by itself. The app refuses a body over 1 MB before it opens a transaction.',
			'The link is 8 random base62 characters, about 218 trillion values. Codes are random, so nobody can find other pastes by changing one character of their own link.',
			'The read query is `SELECT body FROM pastes WHERE code = $1 AND expires_at > now()`. An expired paste returns nothing at its expiry time, even if the row is still on disk.',
			'An hourly job runs `DELETE FROM pastes WHERE expires_at < now()`, which removes about 400 rows per run. A deleted row stays on disk as a dead row version. Autovacuum then marks that space free, and new pastes reuse it. The table stays near its 6 GB size. The disk file does not shrink, since a standard VACUUM does not return the space to the operating system.',
			'There is no cache. A paste read once would enter the cache and never be read from it, and the database serves less than one read per second.',
			'The main choice is keeping paste bodies inside the database, which costs backup size: every backup and replica carries all live pastes, up to 300 GB in the worst case. The PostgreSQL docs say dropping a partition with `DROP TABLE` "is far faster than a bulk operation" and avoids the VACUUM work of a bulk DELETE. At 100 times this volume, daily partitions would replace the hourly DELETE.'
		]
	},
	quiz: [],
	recall: {
		q: 'In the sample, what stops a paste from being served one minute after its expiry, while its row is still on disk?',
		a: 'The read query itself: `WHERE code = $1 AND expires_at > now()`. The hourly DELETE only frees the space later.'
	},
	sources: [
		{ title: 'PostgreSQL documentation, TOAST', url: 'https://www.postgresql.org/docs/current/storage-toast.html' },
		{ title: 'PostgreSQL documentation, Routine Vacuuming', url: 'https://www.postgresql.org/docs/current/routine-vacuuming.html' },
		{ title: 'PostgreSQL documentation, Table Partitioning', url: 'https://www.postgresql.org/docs/current/ddl-partitioning.html' }
	]
};
