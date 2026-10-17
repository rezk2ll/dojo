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
