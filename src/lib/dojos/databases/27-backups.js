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
