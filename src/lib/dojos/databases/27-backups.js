const BR = 'https://github.com/pgbackrest/pgbackrest/blob/4c65010e7d28ea68571732fb275d91266a97ad80';
const CONF = `${BR}/src/command/restore/config.c.inc`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'backups',
	part: 'Keeping it running',
	title: 'Backups you can restore',
	minutes: 10,
	hook: [
		'Wednesday, 14:03. Someone runs `DELETE FROM orders` in the wrong terminal, with no `WHERE`. Your backup is a nightly `pg_dump` from 02:00. **Twelve hours of orders are gone**, whatever you do next.',
		'And that dump: has anyone ever loaded it into a fresh server? If nobody has, today is the first test of the restore, with twelve hours of orders already lost.',
		'PostgreSQL knows two kinds of backup: a logical dump and a base backup. A base backup plus the archived WAL brings you back to **14:02:59**. pgBackRest, a popular backup tool, shows what a restore actually writes.'
	],
	terms: [
		{ term: 'Logical dump', def: 'What `pg_dump` makes: SQL or an archive that rebuilds the tables. A consistent snapshot of one moment, portable across versions, but you cannot replay WAL on top of it.' },
		{ term: 'Base backup', def: 'A copy of the whole data directory, taken while the server runs (`pg_basebackup`, or a tool like pgBackRest). The starting point for replaying WAL.' },
		{ term: 'WAL archive', def: 'Every finished WAL segment, copied somewhere safe by `archive_command`. Together with a base backup, it holds every change since that backup.' },
		{ term: 'Point-in-time recovery', def: 'PITR for short: you restore a base backup, replay WAL, and stop at a chosen moment, the recovery target, such as `recovery_target_time`.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['db[("Primary: data files and pg_wal")] -->|"pgbackrest backup, Sunday 01:00"| base["Base backup"]'],
				highlight: ['db', 'base'],
				note: 'The base backup copies the data directory while the server keeps running. The docs: "We do not need a perfectly consistent file system backup as the starting point." WAL replay fixes whatever moved during the copy.'
			},
			{
				add: ['db -->|"archive_command, every finished segment"| arch[("WAL archive")]'],
				highlight: ['arch'],
				note: 'Each WAL segment, once full, goes to the archive. The command must exit 0 only when the copy really worked, because on zero PostgreSQL removes or recycles the segment. Together, the base backup and the archive hold every change since Sunday.'
			},
			{
				add: ['oops["Wednesday 14:03: DELETE with no WHERE"] -.-> db'],
				highlight: ['oops'],
				note: 'The `DELETE` is in the WAL too, like every other change. A dump from 02:00 cannot help past 02:00. The archive can bring you back to any moment before 14:03, because it holds the minutes in between.'
			},
			{
				add: ['base -->|"restore the files"| new[("New server")]', 'arch -->|"restore_command, replay until 14:02:59"| new'],
				highlight: ['new'],
				note: 'Restore the base backup on a new server, set `restore_command` and `recovery_target_time`, create `recovery.signal`, start. The server fetches and replays WAL from Sunday on, then stops at the target. The target must be after the end of the base backup: replay only goes forward.'
			},
			{
				add: ['new -->|"paused: check the rows"| check["Count orders, then resume"]'],
				highlight: ['check'],
				note: 'The default `recovery_target_action` is `pause`, so you can query the rows first. If the target was too early, set a later one and restart; replay goes on. If the rows are right, `pg_wal_replay_resume()` ends recovery and a new timeline begins. The timeline ID is in the WAL file names, so WAL written after the restore never overwrites the old history.'
			}
		]
	},
	example: {
		title: 'src/command/restore/config.c.inc: what pgBackRest writes so the server can recover',
		repo: 'pgbackrest/pgbackrest',
		url: `${CONF}#L81-L131`,
		lang: 'c',
		code: `        // Write restore_command
        if (!strLstExists(recoveryOptionKey, RESTORE_COMMAND_STR))
        {
…
            KeyValue *const optionReplace = kvNew();
…
            kvPut(
                result, VARSTRDEF(RESTORE_COMMAND),
                VARSTR(
                    strNewFmt(
                        "%s %s %%f \\"%%p\\"", strZ(cfgOptionStr(cfgOptCmd)),
                        strZ(strLstJoin(cfgExecParam(cfgCmdArchiveGet, cfgCmdRoleMain, optionReplace, true, true), " ")))));
        }

        // If recovery type is immediate
        if (cfgOptionSeq(cfgOptType) == CFGOPTVAL_RESTORE_TYPE_IMMEDIATE)
        {
            kvPut(result, VARSTRDEF(RECOVERY_TARGET), VARSTRDEF(CFGOPTVAL_RESTORE_TYPE_IMMEDIATE_Z));
        }
        // Else recovery type is standby
        else if (cfgOptionSeq(cfgOptType) == CFGOPTVAL_RESTORE_TYPE_STANDBY)
        {
            // Write standby_mode for PostgreSQL versions that support it
            if (pgVersion < PG_VERSION_RECOVERY_GUC)
                kvPut(result, VARSTR(STANDBY_MODE_STR), VARSTRDEF("on"));
        }
        // Else recovery type is not default so write target options
        else if (cfgOptionSeq(cfgOptType) != CFGOPTVAL_RESTORE_TYPE_DEFAULT)
        {
            // Write the recovery target
            kvPut(
                result, VARSTR(strNewFmt(RECOVERY_TARGET "_%s", strZ(cfgOptionDisplay(cfgOptType)))),
                VARSTR(cfgOptionStr(cfgOptTarget)));

            // Write recovery_target_inclusive
            if (cfgOptionTest(cfgOptTargetExclusive) && cfgOptionBool(cfgOptTargetExclusive))
                kvPut(result, VARSTRDEF(RECOVERY_TARGET_INCLUSIVE), VARSTR(FALSE_STR));
        }`,
		notes: [
			'Lines 1 to 13: unless you set your own, pgBackRest writes a `restore_command` that runs its own `archive-get` with `%f "%p"`. Recovery runs that shell command to fetch each archived WAL segment, with `%f` set to the file name it wants and `%p` to the path to copy it to. It drops options that only made sense for the restore; the [comment](' + CONF + '#L84-L86) says this "seems better than, for example, passing --process-max=32 to archive-get because it was specified for restore."',
			'Lines 27 to 37: pgBackRest writes `--type=time --target=...` as `recovery_target_` plus the type name, so `recovery_target_time`. `--target-exclusive` adds `recovery_target_inclusive = false`, which stops just before the target instead of just after. Each option is then [written as](' + CONF + '#L184-L194) `key = \'value\'`.',
			'Before appending, the restore [rewrites postgresql.auto.conf](' + CONF + '#L262-L283) and prefixes any old `recovery_target*` line with "# Removed by pgBackRest restore on". A second restore never inherits the first one\'s stop point. Then it creates `recovery.signal` (in the sources), which tells PostgreSQL to recover.',
			'The [user guide](https://pgbackrest.org/user-guide.html#pitr) restores a cluster with `--type=time` and prints the result: `restore_command = \'pgbackrest --stanza=demo archive-get %f "%p"\'` and a `recovery_target_time` line. Its words: "pgBackRest has generated the recovery settings in postgresql.auto.conf so PostgreSQL can be started immediately."',
			'Pick a backup that ended before the target. The same guide then tries a backup taken after the table was dropped, and warns: "PostgreSQL can only play forward, not backward." The PostgreSQL docs say it too: "The stop point must be after the ending time of the base backup".'
		]
	},
	tradeoff: {
		gain: [
			'Recovery to any moment since the base backup: a bad `DELETE` costs you seconds of data, not a day.',
			'You do not need a full copy every day. The docs: "continuous backup can be achieved simply by continuing to archive the WAL files."',
			'The base backup does not need a frozen file system or a snapshot feature; WAL replay repairs what changed during the copy.'
		],
		cost: [
			'It restores a whole cluster or nothing: the method "can only support restoration of an entire database cluster, not a subset". One lost table means a restore elsewhere and a copy back.',
			'A base backup restores only onto the server version that made it. A `pg_dump` can "generally be re-loaded into newer versions of PostgreSQL", so keep dumps for moving between versions.',
			'Storage: the base backup is bulky, and a busy server sends many megabytes of WAL to the archive.',
			'Replay cannot go past a missing WAL segment. Recovery needs "a continuous sequence of archived WAL files", and only a test restore proves you have one.'
		]
	},
	task: {
		prompt: 'Base backups run Sunday 01:00 and WAL is archived all the time. On Wednesday at 14:03:10 someone runs `DROP TABLE orders`. Write the recovery: which backup, which settings, what you check, and how `orders` gets back to production. Then say what a nightly `pg_dump` at 02:00 would have cost.',
		hint: 'You do not want to roll the whole cluster back: other tables took writes after 14:03. Recover somewhere else first.',
		answer: [
			'Take Sunday\'s base backup: the newest one that ended before 14:03:10. Restore it to a **new** server or data directory, never over the primary, which keeps running.',
			'Set `restore_command` to fetch from the archive, `recovery_target_time = \'2026-10-14 14:03:00+00\'` (Wednesday\'s date, with the time zone), leave `recovery_target_action` at its default `pause`, and create an empty `recovery.signal` in the data directory. Start the server.',
			'It replays Sunday to Wednesday 14:03:00 and pauses. Check: `SELECT count(*), max(created_at) FROM orders;`. If the newest order is too old, set a later target and restart; replay continues. If you went past the drop, start again from the base backup.',
			'Copy the table back: `pg_dump -t orders` from the recovered server, load it into the primary. The rows written between 14:03:00 and the drop are the only ones lost.',
			'With only the 02:00 dump: the same copy-back, but every order from 02:00 to 14:03 is gone, about twelve hours.'
		],
		steps: [
			{
				title: 'Pick the backup and the place',
				questions: [
					{ q: 'Which base backup do you restore?', options: ['Any backup, since WAL can replay backward', 'Sunday 01:00: the newest one that ended before 14:03:10', 'The next base backup, taken after the drop', 'None: replay the WAL archive alone'], answer: 1, why: 'Replay starts from a base backup and only goes forward. The stop point must be after the backup ended.' },
					{ q: 'Where do you restore it?', options: ['Over the primary, to roll everything back', 'On a read replica that follows the primary', 'On a new server or data directory, while the primary keeps running', 'Into a new schema on the primary'], answer: 2, why: 'Other tables took writes after 14:03. Rolling the whole cluster back would lose them.' },
					{ q: 'Why can\'t you restore just the `orders` table from the base backup?', options: ['It restores a whole cluster or nothing', 'Tables are stored in the WAL, not in the backup', 'pgBackRest encrypts each table separately', 'You can, with `--table=orders`'], answer: 0, why: 'The docs: the method "can only support restoration of an entire database cluster, not a subset". So you recover elsewhere and copy the table back.' },
					{ q: 'What must the archive hold for this to work?', options: ['Only the WAL from Wednesday', 'Only the last WAL segment before the drop', 'The WAL of the primary\'s `pg_wal` directory', 'Every segment from Sunday\'s backup to 14:03, with no gap'], answer: 3, why: 'Recovery needs "a continuous sequence of archived WAL files". One missing segment stops replay there.' }
				]
			},
			{
				title: 'Write the recovery settings',
				questions: [
					{ q: 'What does `restore_command` do?', options: ['It copies the base backup into place', 'It fetches each archived WAL segment, `%f` the file name, `%p` where to copy it', 'It writes WAL segments to the archive', 'It stops replay at the target'], answer: 1, why: 'Recovery runs that shell command for each segment it needs. pgBackRest writes one that calls its own `archive-get`.' },
					{ q: 'Which target do you set?', options: ['`recovery_target_time = \'2026-10-14 14:03:00+00\'`', '`recovery_target_time = \'14:03:10\'`', '`recovery_target = \'immediate\'`', '`recovery_target_time = \'2026-10-14 14:04:00+00\'`'], answer: 0, why: 'Just before the drop, with Wednesday\'s date and the time zone. 14:04 would replay the drop too.' },
					{ q: 'What happens at the target if you leave `recovery_target_action` alone?', options: ['The server promotes at once', 'The server shuts down', 'Replay keeps going to the end of the WAL', 'The server pauses, so you can query first'], answer: 3, why: 'The default is `pause`. You check the rows before you end recovery.' },
					{ q: 'What tells PostgreSQL to recover at startup?', options: ['A `recovery.conf` file with `standby_mode = on`', 'Starting it with `--recover`', 'An empty `recovery.signal` file in the data directory', 'The `restore_command` setting alone'], answer: 2, why: 'pgBackRest creates `recovery.signal` too. Without it, the server starts normally and ignores the target.' }
				]
			},
			{
				title: 'Check before you resume',
				questions: [
					{ q: 'Replay paused. What do you run first?', options: ['`SELECT count(*), max(created_at) FROM orders;`', '`SELECT pg_wal_replay_resume();`', '`DROP TABLE orders;`', '`pg_basebackup` of the new server'], answer: 0, why: 'The count and the newest order show whether you stopped at the right moment.' },
					{ q: 'The newest order is from 13:40, too early. What now?', options: ['Start over from Sunday\'s backup', 'Set a later target and restart: replay goes on', 'Accept the loss', 'Run `pg_wal_replay_resume()`'], answer: 1, why: 'Replay only moves forward, and it has not passed the drop yet, so a later target just continues.' },
					{ q: 'You set the target too late and the table is gone again. What now?', options: ['Set an earlier target and restart', 'Run `pg_rewind`', 'Undo the drop with `ROLLBACK`', 'Start again from the base backup'], answer: 3, why: '"PostgreSQL can only play forward, not backward." Past the drop, only a fresh restore gets back before it.' },
					{ q: 'The rows look right and you call `pg_wal_replay_resume()`. What happens?', options: ['Replay continues to the end of the archive', 'The server shuts down cleanly', 'Recovery ends and a new timeline begins', 'The primary receives the restored rows'], answer: 2, why: 'The new timeline ID goes into the WAL file names, so WAL written after the restore never overwrites the old history.' }
				]
			},
			{
				title: 'Bring `orders` home and count the cost',
				questions: [
					{ q: 'How does `orders` get back to production?', options: ['Promote the recovered server and point the app at it', '`pg_dump -t orders` from the recovered server, loaded into the primary', 'Copy its data files into the primary\'s data directory', 'Replay the archive on the primary'], answer: 1, why: 'A logical dump of one table copies cleanly into the running primary, and the other tables keep their writes.' },
					{ q: 'Which rows are lost with this recovery?', options: ['Only those written between 14:03:00 and the drop', 'Everything since Sunday 01:00', 'None at all', 'All of Wednesday\'s orders'], answer: 0, why: 'Replay stopped at 14:03:00, so only the seconds before the drop are missing.' },
					{ q: 'With only a `pg_dump` at 02:00, what would it cost?', options: ['The same few seconds, using the WAL archive', 'Nothing, the dump has every order', 'Every order from 02:00 to 14:03, about twelve hours', 'Every order since Sunday'], answer: 2, why: 'A dump is a snapshot of one moment, and nothing can be replayed on top of it.' },
					{ q: 'Why can\'t you replay WAL on top of the 02:00 dump?', options: ['WAL is deleted at each checkpoint', 'pg_dump stops WAL writing while it runs', 'Replay works only for tables with a primary key', 'A dump is logical, and WAL replay needs the data files'], answer: 3, why: 'WAL describes changes to pages, so it needs a file-level base backup to apply them to.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Your only backup is a nightly `pg_dump`. Why can you not replay the archived WAL on top of it to reach 14:02?',
			options: [
				'A dump is a logical copy, and WAL replay needs a file-level base backup',
				'WAL is deleted at each checkpoint, so there is nothing to replay since 02:00',
				'pg_dump stops WAL from being written while it runs, so there is a gap',
				'Replay works on a dump, but only for the tables that have a primary key'
			],
			answer: 0,
			why: 'The docs: dumps "do not produce file-system-level backups and cannot be used as part of a continuous-archiving solution. Such dumps are logical and do not contain enough information to be used by WAL replay." WAL describes changes to pages (day 15), so it needs the pages.'
		},
		{
			q: 'A base backup finished Sunday 01:20. A table was dropped Sunday 01:10. Can this backup bring the table back?',
			options: [
				'Yes: set `recovery_target_time` to 01:09 and replay from this backup',
				'Yes, but only with `recovery_target_inclusive` set to `false`',
				'No: base backups skip any table that is dropped during the copy',
				'No: the target must be after the backup ended, so use the one before'
			],
			answer: 3,
			why: '"The stop point must be after the ending time of the base backup." Replay starts from the backup and only moves forward, so a moment before it ended is out of reach. Take the previous base backup and replay the archive from there.'
		},
		{
			q: 'Your `archive_command` is a script that always exits 0, even when the copy fails. What goes wrong?',
			options: [
				'PostgreSQL retries forever and `pg_wal` grows until the disk is full',
				'PostgreSQL recycles WAL segments that never reached the archive',
				'Nothing: PostgreSQL checks the archive for each file after the copy',
				'The primary refuses new commits until the archive confirms a segment'
			],
			answer: 1,
			why: 'The docs: "Upon getting a zero result, PostgreSQL will assume that the file has been successfully archived, and will remove or recycle it." The chain now has a hole, and you learn it during the restore. A nonzero exit is the safe failure: PostgreSQL retries.'
		}
	],
	lab: {
		minutes: 30,
		goal: 'Drop a table, then bring it back as it was seconds before, with a base backup, a WAL archive and `recovery_target_time`.',
		steps: [
			'Start a primary that archives WAL into a volume: `docker volume create dojo-archive` then `docker run -d --name dojo-pg -e POSTGRES_PASSWORD=dojo -v dojo-archive:/archive postgres:17 -c archive_mode=on -c "archive_command=test ! -f /archive/%f && cp %p /archive/%f"`. Wait for `docker exec dojo-pg pg_isready`, then `docker exec dojo-pg chown postgres /archive`.',
			'Take the base backup: `docker exec -u postgres dojo-pg pg_basebackup -D /archive/base`.',
			'Write after the backup: `docker exec dojo-pg psql -U postgres -c "CREATE TABLE orders (id serial PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now())" -c "INSERT INTO orders (created_at) SELECT now() FROM generate_series(1, 100)"`. Then note the time: `docker exec dojo-pg psql -U postgres -At -c "SELECT now()"`.',
			'Wait a few seconds, then the accident: `docker exec dojo-pg psql -U postgres -c "INSERT INTO orders (created_at) SELECT now() FROM generate_series(1, 5)" -c "DROP TABLE orders" -c "SELECT pg_switch_wal()"`. The switch pushes the current segment to the archive. Check with `docker exec dojo-pg ls /archive`.',
			'Prepare the restore next to the primary: `docker exec -u postgres dojo-pg cp -a /archive/base /archive/restore`. Then add the settings, with your time from step 3: `docker exec -u postgres dojo-pg sh -c "echo \\"restore_command = \'cp /archive/%f %p\'\\" >> /archive/restore/postgresql.auto.conf && echo \\"recovery_target_time = \'<your time>\'\\" >> /archive/restore/postgresql.auto.conf && touch /archive/restore/recovery.signal"`',
			'Start a second server on the restored directory: `docker run -d --name dojo-restore -e PGDATA=/archive/restore -v dojo-archive:/archive postgres:17`. Read `docker logs dojo-restore`, then check: `docker exec dojo-restore psql -U postgres -c "SELECT pg_get_wal_replay_pause_state()" -c "SELECT count(*), max(created_at) FROM orders"`.',
			'Copy the table home: `docker exec dojo-restore pg_dump -U postgres -t orders | docker exec -i dojo-pg psql -U postgres`. Then end recovery: `docker exec dojo-restore psql -U postgres -c "SELECT pg_wal_replay_resume()"`.'
		],
		done: [
			'`ls /archive` lists WAL segments, a `.backup` file and `base`.',
			'The restore logs show `restored log file ... from archive`, `recovery stopping before commit` and `pausing at the end of recovery`.',
			'On `dojo-restore`, the pause state is `paused` and `orders` has 100 rows: the 5 written after your target are not there.',
			'On `dojo-pg`, `SELECT count(*) FROM orders;` returns 100, and `docker logs dojo-restore` now shows `selected new timeline ID: 2` and `archive recovery complete`.'
		],
		solution: [
			'Replay started from the base backup, fetched each segment with `restore_command`, and stopped at the first commit after the target. That commit was the INSERT of 5 rows, so the DROP was never replayed either.',
			'The default `recovery_target_action` is `pause`, which is why you could count rows before deciding. If the count were wrong, a later target and a restart would carry on.',
			'The primary kept running the whole time. Only `orders` came back, through `pg_dump`, so other tables keep their newer writes.',
			'Clean up with `docker rm -f dojo-restore dojo-pg` and `docker volume rm dojo-archive`.'
		]
	},
	recall: {
		q: 'A `DELETE` hit `orders` at 14:03. What do you need to bring the rows back as of 14:02:59, and why can a nightly `pg_dump` not get you there?',
		a: 'A base backup that ended before 14:03, plus every archived WAL segment since, replayed with `recovery_target_time`. WAL replay needs the data files, so it cannot run on top of a logical dump.'
	},
	sources: [
		{ title: 'PostgreSQL docs, Continuous Archiving and Point-in-Time Recovery', url: 'https://www.postgresql.org/docs/current/continuous-archiving.html' },
		{ title: 'PostgreSQL docs, SQL Dump', url: 'https://www.postgresql.org/docs/current/backup-dump.html' },
		{ title: 'PostgreSQL docs, Recovery Target settings', url: 'https://www.postgresql.org/docs/current/runtime-config-wal.html#RUNTIME-CONFIG-WAL-RECOVERY-TARGET' },
		{ title: 'pgBackRest User Guide', url: 'https://pgbackrest.org/user-guide.html' },
		{ title: 'pgBackRest source, src/command/restore/config.c.inc', url: CONF },
		{ title: 'pgBackRest source, creating recovery.signal', url: `${CONF}#L346-L355` }
	]
};
