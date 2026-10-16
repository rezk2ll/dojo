const PG = 'https://github.com/postgres/postgres/blob/92d47d544bf64274b6a7aa8775f7b35bcf71f339';
const AV = `${PG}/src/backend/postmaster/autovacuum.c`;
const MAINT = `${PG}/doc/src/sgml/maintenance.sgml`;
const CONFIG = `${PG}/doc/src/sgml/config.sgml`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'vacuum',
	part: 'Inside the engine',
	title: 'Dead rows and VACUUM',
	minutes: 10,
	hook: [
		'Your `jobs` table never holds more than a few thousand rows. Workers update each row three or four times: queued, running, done. A month later **the table takes gigabytes on disk** and a plain `SELECT count(*)` has slowed down.',
		'The reason: in PostgreSQL, **an UPDATE does not overwrite the row**. It writes a new version and leaves the old one where it was. A DELETE leaves the row too. Another transaction may still be reading the old version, so it cannot go yet.',
		'Someone has to come back and clear those **dead rows** once nobody can see them. That is VACUUM, and most of the time a background process called **autovacuum** runs it for you. This chapter is about when it runs, what it frees, and the one job it must never skip.'
	],
	terms: [
		{ term: 'Dead row', def: 'An old row version left by an UPDATE or a DELETE. It still takes space in its page (day 9) until VACUUM removes it.' },
		{ term: 'Bloat', def: 'Space in a table or index taken by dead rows or left empty after them. The table is bigger on disk than its live data.' },
		{ term: 'VACUUM', def: 'Removes dead row versions that no transaction can see and marks the space free for new rows in the same table. It does not lock out reads or writes.' },
		{ term: 'VACUUM FULL', def: 'Rewrites the whole table into a new file with no dead space. Returns disk to the operating system, but holds an ACCESS EXCLUSIVE lock the whole time.' },
		{ term: 'Autovacuum', def: 'A launcher process plus worker processes that check each table and run VACUUM and ANALYZE when enough rows have changed.' },
		{ term: 'Transaction ID (XID)', def: 'A 32-bit number every writing transaction gets. Row versions record the XID that created them, and visibility compares XIDs.' },
		{ term: 'Freezing', def: 'VACUUM marks old rows as visible to every transaction, so their XID no longer needs comparing. This is what protects against wraparound.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['upd["UPDATE jobs SET state = done"] --> v2["New row version: live"]', 'upd --> v1["Old row version: dead"]'],
				highlight: ['upd', 'v1', 'v2'],
				note: '**Two versions, one row.** The UPDATE writes a new version of the row and marks the old one as replaced. The docs: an UPDATE or DELETE "does not immediately remove the old version of the row". Both versions sit in the table\'s pages.'
			},
			{
				add: ['tx["Transaction opened earlier"] -.->|"may still read"| v1'],
				highlight: ['tx'],
				note: '**Why it cannot go yet.** A transaction that started before the UPDATE may still need the old version. The row version "must not be deleted while it is still potentially visible to other transactions". **One long open transaction holds back cleanup** for every table it could read.'
			},
			{
				add: ['av["Autovacuum worker"] -->|"dead rows over threshold"| v1'],
				highlight: ['av'],
				note: '**When autovacuum comes.** A worker visits each database every `autovacuum_naptime` (1 minute by default). It vacuums a table when its dead rows pass 50 + 20% of the table\'s rows. A big table can collect a lot of dead rows before that.'
			},
			{
				add: ['v1 --> free["Free space in the page, reused by new rows"]'],
				highlight: ['free'],
				note: '**Space is reused, not returned.** Plain VACUUM removes the dead versions and marks the space free for future rows of the same table. It gives the disk back only when whole pages at the end of the table are empty. The file usually stays the same size.'
			},
			{
				add: ['av -->|"marks old rows frozen"| frozen["Frozen rows: safe from XID wraparound"]'],
				highlight: ['frozen'],
				note: '**The job it must not skip.** XIDs are 32 bits and compared in a circle, so a row older than about two billion transactions would suddenly look like it is in the future. VACUUM freezes old rows before that. Autovacuum forces this pass even on tables where you turned it off.'
			}
		]
	},
	example: {
		title: 'src/backend/postmaster/autovacuum.c: how a worker decides a table needs VACUUM',
		repo: 'postgres/postgres',
		url: `${AV}#L2939-L3147`,
		lang: 'c',
		code: ` * A table needs to be vacuumed if the number of dead tuples exceeds a
 * threshold.  This threshold is calculated as
 *
 * threshold = vac_base_thresh + vac_scale_factor * reltuples
 * if (threshold > vac_max_thresh)
 *     threshold = vac_max_thresh;
…
	/* Force vacuum if table is at risk of wraparound */
	xidForceLimit = recentXid - freeze_max_age;
	if (xidForceLimit < FirstNormalTransactionId)
		xidForceLimit -= FirstNormalTransactionId;
	relfrozenxid = classForm->relfrozenxid;
	force_vacuum = (TransactionIdIsNormal(relfrozenxid) &&
					TransactionIdPrecedes(relfrozenxid, xidForceLimit));
…
	*wraparound = force_vacuum;
…
		vacthresh = (float4) vac_base_thresh + vac_scale_factor * reltuples;
		if (vac_max_thresh >= 0 && vacthresh > (float4) vac_max_thresh)
			vacthresh = (float4) vac_max_thresh;
…
		/* Determine if this table needs vacuum or analyze. */
		*dovacuum = force_vacuum || (vactuples > vacthresh) ||
			(vac_ins_base_thresh >= 0 && instuples > vacinsthresh);
		*doanalyze = (anltuples > anlthresh);`,
		notes: [
			'**The threshold in numbers.** The [docs give the same formula](' + MAINT + '#L925-L935) and the defaults: a base of [50 rows](' + CONFIG + '#L9074-L9077), a scale factor of [0.2](' + CONFIG + '#L9136-L9140), and a cap of [100,000,000](' + CONFIG + '#L9198-L9204). So a table with 1 million rows waits for 200,050 dead rows, and a table with 1 billion rows hits the cap.',
			'**Where the count comes from.** `vactuples` is read from [`tabentry->dead_tuples`](' + AV + '#L3097-L3099), the cumulative statistics. The docs call it "an eventually-consistent count updated by each UPDATE, DELETE and INSERT operation" ([source](' + MAINT + '#L960-L962)). You can read the same number as `n_dead_tup` in `pg_stat_user_tables`.',
			'**Wraparound wins over your settings.** `force_vacuum` is computed first, from `relfrozenxid` and `freeze_max_age`. Then the [early return](' + AV + '#L3075-L3081) for a table with autovacuum disabled is skipped when the table is at risk: "(But ignore if at risk)". The docs say the same: the forced run happens ["even if autovacuum is disabled"](' + MAINT + '#L530-L534).',
			'**If it still falls behind.** At forty million transactions from wraparound, the server logs a [warning per database](' + MAINT + '#L670-L678). At three million, it ["will refuse to assign new XIDs"](' + MAINT + '#L684-L694): only read-only transactions can start. The fix list starts with [ending long-running transactions and dropping old replication slots](' + MAINT + '#L709-L723), because they hold old rows in place.'
		]
	},
	tradeoff: {
		gain: [
			'Readers never wait for writers: an UPDATE leaves the old version in place, so a reader that needs it still finds it.',
			'An UPDATE or DELETE is cheap at commit time. The cleanup happens later, in the background, off the request path.',
			'Plain VACUUM runs next to normal traffic. SELECT, INSERT, UPDATE and DELETE keep working while it runs.'
		],
		cost: [
			'A table that is updated often grows bigger than its live data, and plain VACUUM does not shrink the file.',
			'Shrinking it takes VACUUM FULL, which needs an ACCESS EXCLUSIVE lock and extra disk for the new copy. No read or write gets through while it runs.',
			'One forgotten transaction, or a replication slot for a server that is gone, blocks cleanup for the whole cluster.',
			'VACUUM itself costs I/O. The docs warn it "can cause poor performance for other active sessions", which is why autovacuum pauses as it works (`autovacuum_vacuum_cost_delay`, 2 ms by default).'
		]
	},
	task: {
		prompt: 'With the default settings, how many dead rows does each table collect before autovacuum vacuums it: `sessions` (10,000 rows), `orders` (1,000,000 rows), `events` (1,000,000,000 rows)? Then write the query you would run in `psql` to find the tables with the most dead rows, and one change for `events`.',
		hint: 'Threshold = 50 + 0.2 × rows, capped at 100,000,000. The counts live in a statistics view.',
		answer: [
			'`sessions`: 50 + 0.2 × 10,000 = 2,050 dead rows. Small tables are vacuumed often.',
			'`orders`: 50 + 0.2 × 1,000,000 = 200,050 dead rows.',
			'`events`: 50 + 0.2 × 1,000,000,000 = 200,000,050, above the cap, so 100,000,000 dead rows. That is a lot of bloat to wait for.',
			'In `psql`: `SELECT relname, n_live_tup, n_dead_tup, last_autovacuum FROM pg_stat_user_tables ORDER BY n_dead_tup DESC LIMIT 10;`',
			'For `events`, lower its own scale factor: `ALTER TABLE events SET (autovacuum_vacuum_scale_factor = 0.01);` makes the threshold 10,000,050. And look for transactions that stay open for hours: no setting helps while one of them holds the old rows.'
		]
	},
	quiz: [
		{
			q: 'You run `UPDATE jobs SET state = \'done\' WHERE id = 7` and commit. What happens to the old version of the row?',
			options: [
				'It stays in the table until VACUUM removes it, once no transaction can see it',
				'It is overwritten in place, and the old value is kept only in the WAL',
				'It is moved to a separate undo area, which the next checkpoint empties',
				'It is removed at commit, so only transactions still open lose sight of it'
			],
			answer: 0,
			why: 'PostgreSQL keeps old row versions in the table itself. A transaction that started earlier may still need it, so only VACUUM, later, removes it and marks the space free.'
		},
		{
			q: 'A table has 1,000,000 rows and default autovacuum settings. About how many dead rows must it collect before autovacuum vacuums it?',
			options: [
				'50, the base threshold, whatever the size of the table',
				'1,000,050, once every row has been replaced one time',
				'200,050, that is 50 plus 20% of the rows in the table',
				'100,000,000, the maximum threshold set for all tables'
			],
			answer: 2,
			why: 'The threshold is the base (50) plus the scale factor (0.2) times `reltuples`, capped at `autovacuum_vacuum_max_threshold`. For a million rows that is 200,050, well under the cap.'
		},
		{
			q: 'You set `autovacuum_enabled = false` on a large table that is never updated. Months later, autovacuum vacuums it anyway. Why?',
			options: [
				'Autovacuum ignores per-table settings and only reads `postgresql.conf`',
				'Inserts count as dead rows, so the table crossed its vacuum threshold',
				'Its oldest unfrozen XID passed `autovacuum_freeze_max_age`, so a run is forced',
				'ANALYZE needed fresh statistics, and it always runs as part of VACUUM'
			],
			answer: 2,
			why: 'XIDs wrap around after about two billion transactions. To stop old rows from looking like future ones, autovacuum forces a freezing run once `relfrozenxid` is older than `autovacuum_freeze_max_age`, even if autovacuum is off for that table.'
		}
	],
	takeaway: 'Every UPDATE and DELETE leaves a dead row behind. Let autovacuum clear them, tune it per table for big ones, and never leave transactions open for hours, or it cannot free anything.',
	sources: [
		{ title: 'PostgreSQL docs, Routine Vacuuming', url: 'https://www.postgresql.org/docs/18/routine-vacuuming.html' },
		{ title: 'PostgreSQL docs, Automatic Vacuuming settings', url: 'https://www.postgresql.org/docs/18/runtime-config-vacuum.html' },
		{ title: 'PostgreSQL docs, The Cumulative Statistics System (pg_stat_all_tables)', url: 'https://www.postgresql.org/docs/18/monitoring-stats.html' },
		{ title: 'PostgreSQL source, autovacuum.c', url: `${AV}` }
	]
};
