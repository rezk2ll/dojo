const SYSTEMD = 'https://github.com/systemd/systemd/blob/84b71c1525e792c2ba44670d2171386af8605edd';
const RATE_LIMIT = `${SYSTEMD}/src/journal/journald-rate-limit.c`;
const MANAGER = `${SYSTEMD}/src/journal/journald-manager.c`;
const MAN = 'https://www.freedesktop.org/software/systemd/man/latest';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'journald',
	part: 'The running system',
	title: 'The journal',
	minutes: 10,
	hook: [
		'At 03:12 the database behind `app.service` goes away, and the app logs one error per failed request: 3,000 lines a second. The next morning, `journalctl -u app` shows about 13 seconds of errors, then a gap of about 17 seconds. The next line is from journald: `Suppressed N messages from app.service`, with the count in place of N. The pattern repeats every 30 seconds.',
		'journald drops those lines on purpose. By default each service may log 10,000 messages per 30 seconds (`RateLimitBurst=10000`, `RateLimitIntervalSec=30s`). journald multiplies the burst by a factor that grows with the free disk space for the journal: 4 when it has 4 GB. That gives 40,000 lines, which at 3,000 a second last about 13 seconds.',
		'`journalctl --disk-usage` on a laptop prints `Archived and active journals take up 885.6M in the file system.` By default the journal may use 10% of its file system, capped at 4G, and leaves 15% free.'
	],
	terms: [
		{ term: 'Journal', def: 'The structured, indexed log files that `systemd-journald` writes under `/var/log/journal/` (kept across reboots) or `/run/log/journal/` (lost at reboot). Each entry is a set of fields such as `MESSAGE=`, `PRIORITY=` and `_SYSTEMD_UNIT=`.' },
		{ term: 'Priority', def: 'The syslog level of an entry, from 0 (`emerg`) to 7 (`debug`), with 3 for `err` and 6 for `info`. `journalctl -p err` shows level 3 and every lower number.' },
		{ term: 'Rate limit', def: 'More than `RateLimitBurst=` messages from one service within `RateLimitIntervalSec=` are dropped until the interval ends. journald then logs how many it dropped.' },
		{ term: 'SystemMaxUse=', def: 'The most disk space the journal files in `/var/log/journal/` may take. Defaults to 10% of the file system, capped at 4G.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['app["app.service writes to stdout"] -->|"stream socket"| jd["systemd-journald adds _PID=, _SYSTEMD_UNIT=, PRIORITY="]'],
				highlight: ['app', 'jd'],
				note: 'By default, systemd starts every service with stdout and stderr connected to journald. journald splits the stream at each newline into entries and adds fields the process cannot fake, such as `_PID=` and `_SYSTEMD_UNIT=app.service`. A plain `echo` arrives with `PRIORITY=6` (info).'
			},
			{
				add: ['jd --> rl{"Rate limit: under the burst for this unit and priority group?"}'],
				highlight: ['rl'],
				note: 'journald keeps one counter per unit, and inside it one per priority group: errors, warnings and info have separate budgets. With the defaults and 4 GB of free journal space, the first 40,000 messages of a group in a 30 second window pass.'
			},
			{
				add: ['rl -->|"over the burst"| drop["Dropped, counted in suppressed"]', 'drop -->|"first message after the 30 s window"| note1["Suppressed N messages from app.service"]'],
				highlight: ['drop', 'note1'],
				note: 'journald drops each message over the burst and adds 1 to the `suppressed` counter. When the next message arrives after the window has ended, journald writes `Suppressed N messages from app.service` before it, with the count in an `N_DROPPED=` field. The dropped lines cannot be recovered.'
			},
			{
				add: ['rl -->|"under the burst"| file[("/var/log/journal/MACHINE_ID/system.journal")]', 'file -->|"over SystemMaxUse="| vac["Oldest archived files deleted"]'],
				highlight: ['file', 'vac'],
				note: 'Accepted entries go to the active `system.journal`. When the files reach `SystemMaxUse=` or would leave less than `SystemKeepFree=`, journald deletes the oldest archived files. It never deletes the active file, so usage can stay above the limit for a while.'
			},
			{
				add: ['file -->|"journalctl -u app -b -1 -p err"| read["Errors of app.service from the previous boot"]'],
				highlight: ['read'],
				note: '`journalctl` filters on fields, with no `grep`. `-u app` matches `_SYSTEMD_UNIT=app.service`, `-b -1` matches the `_BOOT_ID=` of the boot before the current one, and `-p err` keeps priorities 0 to 3.'
			}
		]
	},
	example: {
		title: 'src/journal/journald-rate-limit.c: the rate limit check journald runs for each message',
		repo: 'systemd/systemd',
		url: `${RATE_LIMIT}#L148-L238`,
		lang: 'c',
		code: `static unsigned burst_modulate(unsigned burst, uint64_t available) {
        unsigned k;

        /* Modulates the burst rate a bit with the amount of available
         * disk space */

        k = log2u64(available);

        /* 1MB */
        if (k <= 20)
                return burst;

        burst = (burst * (k-16)) / 4;
…
int journal_ratelimit_test(
                OrderedHashmap **groups_by_id,
                const char *id,
                usec_t rl_interval,
                unsigned rl_burst,
                int priority,
                uint64_t available) {
…
        if (rl_interval == 0 || rl_burst == 0)
                return 1;

        burst = burst_modulate(rl_burst, available);

        p = &g->pools[priority_map[priority]];

        if (p->begin <= 0) {
                p->suppressed = 0;
                p->num = 1;
                p->begin = ts;
                return 1;
        }

        if (usec_add(p->begin, rl_interval) < ts) {
                unsigned s;

                s = p->suppressed;
                p->suppressed = 0;
                p->num = 1;
                p->begin = ts;

                return 1 + s;
        }

        if (p->num < burst) {
                p->num++;
                return 1;
        }

        p->suppressed++;
        return 0;
}`,
		notes: [
			'Line 13 scales the burst with the free journal space. For 4 GB, `log2u64` gives 32, so the default burst of 10,000 is scaled to 10,000 × (32 − 16) / 4 = 40,000. Lines 10 and 11 return the plain burst when less than 2 MB is free (`k <= 20`).',
			'Lines 23 and 24 turn the limit off when `RateLimitIntervalSec=` or `RateLimitBurst=` is 0, as journald.conf(5) says. Line 28 picks the counter for the message\'s priority group, so an info flood does not use up the budget for errors.',
			'Lines 37 to 45 run when the window has expired: the counter restarts and the function returns `1 + s`, the dropped count plus one. Lines 48 to 54 let a message through while the count is under the burst, and otherwise count it as suppressed and return 0.',
			'The [caller in journald-manager.c](' + MANAGER + '#L1282-L1298) returns early on 0. On a value above 1 it first writes `Suppressed %i messages from %s` with `N_DROPPED=`, then stores the message.'
		]
	},
	tradeoff: {
		gain: [
			'One service in a loop can fill only its own budget: two services that log "do not interfere with each other\'s limits".',
			'Every entry carries `_SYSTEMD_UNIT=`, `_BOOT_ID=` and `PRIORITY=`, so `journalctl -u app -b -1 -p err` finds last boot\'s errors with no regular expression.',
			'`SystemMaxUse=` and `SystemKeepFree=` stop the journal from filling the disk, with no logrotate job to set up.'
		],
		cost: [
			'Lines over the burst are gone, and only their count stays. During an outage you may lose the very lines that explain it.',
			'On a 40 GB VM disk, the defaults let the journal take 4G. Vacuuming deletes only archived files, so usage can stay above a lower limit you set.'
		]
	},
	task: {
		prompt: 'A VM has a 40 GB root file system. `journalctl --disk-usage` says the journals take 3.9G, and the team wants 500M at most. Explain the 3.9G, give the config change and the command that frees the space now. Then write the command that shows only the errors of `nginx.service` from the boot before the current one.',
		hint: 'Work out 10% of 40 GB, and compare it with the 4G cap. Local changes go in a drop-in under `/etc/systemd/journald.conf.d/`.',
		answer: [
			'10% of 40 GB is 4 GB, which is also the cap, so the journal is allowed up to 4G. 3.9G is the journal doing what its defaults allow.',
			'Create `/etc/systemd/journald.conf.d/60-size.conf` with `[Journal]` and `SystemMaxUse=500M`, then run `systemctl restart systemd-journald`. The journald page says restarting it is safe: service log streams survive the restart.',
			'`journalctl --vacuum-size=500M` deletes the oldest archived files until they use less than 500M. The active file is not touched, so `--disk-usage` may stay a little higher.',
			'Errors from the previous boot: `journalctl -u nginx -b -1 -p err`. This needs persistent storage in `/var/log/journal/`: with only `/run/log/journal/`, older boots are lost.'
		],
		steps: [
			{
				title: 'Explain the 3.9G',
				questions: [
					{ q: 'What is the default `SystemMaxUse=`?', options: ['500M', '10% of the file system, capped at 4G', '15% of the file system', '4G on every machine'], answer: 1, why: 'journald.conf(5) sets it to 10% of the file system, with a 4G cap.' },
					{ q: 'What is 10% of the 40 GB root?', options: ['4 GB', '400 MB', '40 GB', '10 GB'], answer: 0, why: '40 × 0.1 = 4 GB, which is exactly the cap.' },
					{ q: 'So what does 3.9G of journals mean?', options: ['journald is broken and ignores its limit', 'The rate limit failed', 'The journal is within what its defaults allow', 'The disk is about to fill up'], answer: 2, why: 'The journal is allowed 4G here, and 3.9G is under that.' },
					{ q: 'Which command printed the 3.9G?', options: ['`du -sh /var/log`', '`df -h /var/log/journal`', '`journalctl --vacuum-size=0`', '`journalctl --disk-usage`'], answer: 3, why: 'It prints `Archived and active journals take up ... in the file system.`' }
				]
			},
			{
				title: 'Lower the limit',
				questions: [
					{ q: 'Where does the local change go?', options: ['Edit `/usr/lib/systemd/journald.conf`', 'A drop-in under `/etc/systemd/journald.conf.d/`', 'The `[Service]` section of `nginx.service`', '`/etc/logrotate.d/journal`'], answer: 1, why: 'The hint says local changes go in a drop-in under `/etc/systemd/journald.conf.d/`.' },
					{ q: 'What does the drop-in contain?', options: ['`[Journal]` and `SystemMaxUse=500M`', '`[Service]` and `LogRateLimitBurst=500`', '`[Journal]` and `SystemKeepFree=500M`', '`[Journal]` and `RuntimeMaxUse=500M`'], answer: 0, why: '`SystemMaxUse=` caps the files in `/var/log/journal/`. `SystemKeepFree=` would set the space to leave free instead.' },
					{ q: 'How do you make journald read it?', options: ['Reboot the VM', '`systemctl daemon-reload`', '`systemctl restart systemd-journald`', '`journalctl --rotate` only'], answer: 2, why: 'Restarting journald applies it. The journald page says service log streams survive the restart.' },
					{ q: 'Does restarting journald lose the logs of running services?', options: ['Yes, every stream is cut', 'Yes, until each service restarts', 'Only for services with `Type=notify`', 'No: their log streams survive the restart'], answer: 3, why: 'The systemd-journald page says the restart is safe for that reason.' }
				]
			},
			{
				title: 'Free the space now',
				questions: [
					{ q: 'Which command deletes old files down to 500M right away?', options: ['`journalctl --vacuum-size=500M`', '`rm /var/log/journal/*/*.journal`', '`journalctl --disk-usage=500M`', '`systemctl clean systemd-journald`'], answer: 0, why: 'It deletes the oldest archived files until they use less than 500M.' },
					{ q: 'Which files does vacuuming never delete?', options: ['The oldest archived files', 'The active journal files', 'Files from the previous boot', 'Files over 100M'], answer: 1, why: 'Only archived files are removed. The active `system.journal` stays.' },
					{ q: 'After the vacuum, `--disk-usage` shows 540M. Is something wrong?', options: ['Yes: the drop-in was ignored', 'Yes: the vacuum failed halfway', 'No: the active files are counted too', 'No: `--disk-usage` rounds up by 10%'], answer: 2, why: 'journalctl(1) says the vacuum has "only an indirect effect" on that number, because active files count.' },
					{ q: 'Why not just `rm` the files by hand?', options: ['`rm` cannot delete journal files', 'journald would recreate them at once', 'Journal files are read-only, even for root', '`--vacuum-size` picks the oldest archived files and leaves the active one alone'], answer: 3, why: 'The vacuum removes files in age order and never touches the active file journald is writing.' }
				]
			},
			{
				title: 'Find last boot\'s nginx errors',
				questions: [
					{ q: 'Which option picks the boot before the current one?', options: ['`-b`', '`-b 1`', '`-b -1`', '`--since -1`'], answer: 2, why: '`-b -1` matches the `_BOOT_ID=` of the boot before the current one. `-b` alone is the current boot and `-b 1` the first recorded.' },
					{ q: 'Which option keeps only errors and worse?', options: ['`-p err`', '`-p 3..7`', '`-p info`', '`--errors`'], answer: 0, why: '`-p err` keeps priorities 0 to 3. `3..7` would add warnings, notices, info and debug.' },
					{ q: 'So the full command is...', options: ['`journalctl nginx -b -1 | grep error`', '`journalctl -u nginx -b -p err`', '`journalctl -u nginx -b 1 -p 3`', '`journalctl -u nginx -b -1 -p err`'], answer: 3, why: '`-u nginx` matches `_SYSTEMD_UNIT=nginx.service`, and the filters work on fields, with no `grep`.' },
					{ q: 'The command prints nothing for any earlier boot. What is the likely cause?', options: ['nginx had no errors', 'The journal lives only in `/run/log/journal/`, lost at reboot', 'The 500M limit deleted last night\'s files', '`-p err` hides nginx messages'], answer: 1, why: 'Older boots need persistent storage in `/var/log/journal/`.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'A service logs 100,000 lines in 10 seconds. The journal has 2 GB of free space and uses the default rate limit. What ends up in the journal?',
			options: [
				'All 100,000 lines, because the limit only applies to kernel messages',
				'The first 37,500 lines, and later a line with the dropped count',
				'The last 10,000 lines, because the oldest are dropped first',
				'Nothing from that service until the 30 second window resets'
			],
			answer: 1,
			why: 'For 2 GB, `log2u64` gives 31, so the burst is 10,000 × (31 − 16) / 4 = 37,500. The first 37,500 messages pass, the other 62,500 are counted and dropped, and the next message after the window brings `Suppressed N messages`.'
		},
		{
			q: 'Which command shows only the errors of `ssh.service` from the boot before the current one?',
			options: [
				'`journalctl -u ssh -b -p err`',
				'`journalctl -u ssh -b 1 -p 3..7`',
				'`journalctl -u ssh -b -1 -p err`',
				'`journalctl -u ssh --since -1 -p 3`'
			],
			answer: 2,
			why: '`-b -1` is the boot before the last one in the journal, while `-b` alone or `-b 1` means the current boot or the first recorded one. `-p err` shows priority 3 and everything more important, 0 to 3. `-p 3..7` would include warnings, notices, info and debug.'
		},
		{
			q: '`SystemMaxUse=` is 500M. You run `journalctl --vacuum-size=500M`, and `--disk-usage` still says 540M. Why?',
			options: [
				'Vacuuming deletes only archived files, and the active journal is not one',
				'The new limit needs a reboot before vacuuming can use it',
				'`--disk-usage` counts the files in `/run/log/journal/` twice',
				'journald keeps a 15% reserve that vacuuming never touches'
			],
			answer: 0,
			why: 'Vacuuming removes the oldest archived files until those fall below the size. `--disk-usage` adds the active files, which are never deleted. journalctl(1) says the vacuum has "only an indirect effect" on that number.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Write entries with a priority, find them by field instead of `grep`, and read your machine\'s journal size and limits.',
		steps: [
			'Read the size and the defaults: `journalctl --disk-usage`, then `systemd-analyze cat-config systemd/journald.conf | grep -E "SystemMaxUse|RateLimit"`.',
			'Check where the journal is kept: `ls -d /var/log/journal/*/ /run/log/journal 2>/dev/null`.',
			'Write two entries with different priorities: `systemd-cat -t dojo-lab -p err echo "database connection refused"` and `systemd-cat -t dojo-lab -p info echo "request served"`.',
			'Filter them: `journalctl -t dojo-lab -o cat`, then `journalctl -t dojo-lab -p err -o cat`, then look at the fields of the error with `journalctl -t dojo-lab -p err -n 1 -o verbose`.',
			'List the boots with `journalctl --list-boots | tail -3`, then read the last errors of the previous one: `journalctl -b -1 -p err -n 5`.'
		],
		done: [
			'The first filter prints both lines, the `-p err` filter prints only `database connection refused`.',
			'`-o verbose` shows `PRIORITY=3`, `SYSLOG_IDENTIFIER=dojo-lab` and a `_BOOT_ID=`.',
			'`--list-boots` shows a line with index `-1`, and `-b -1 -p err` prints entries from that boot (or nothing if the journal is only in `/run`).'
		],
		solution: [
			'On the test laptop, `--disk-usage` printed `798.2M` and `cat-config` showed the commented defaults `#RateLimitIntervalSec=30s`, `#RateLimitBurst=10000` and `#SystemMaxUse=`: an empty value means 10% of the file system, capped at 4G.',
			'The journal lived in `/var/log/journal/<machine-id>/`, so older boots were kept and `-b -1` worked.',
			'`-t` matches `SYSLOG_IDENTIFIER=`, `-p err` matches `PRIORITY=` 0 to 3. A normal user sees their own entries. Members of the `adm` or `systemd-journal` group see the system ones too.'
		]
	},
	recall: {
		q: 'With default settings, how many messages may one service log to the journal per 30 seconds when the journal has 4 GB free, and what line marks the dropped ones?',
		a: '10,000 × 4 = 40,000, from `RateLimitBurst=10000` scaled by the free space. The next message after the window is preceded by `Suppressed N messages from app.service`.'
	},
	sources: [
		{ title: 'journald.conf(5)', url: `${MAN}/journald.conf.html` },
		{ title: 'journalctl(1)', url: `${MAN}/journalctl.html` },
		{ title: 'systemd-journald.service(8)', url: `${MAN}/systemd-journald.service.html` },
		{ title: 'systemd.exec(5), LogRateLimitIntervalSec=', url: `${MAN}/systemd.exec.html` },
		{ title: 'systemd source, src/journal/journald-manager.c', url: MANAGER }
	]
};
