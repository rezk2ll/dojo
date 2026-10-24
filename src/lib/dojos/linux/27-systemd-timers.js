const APT = 'https://github.com/Debian/apt/blob/6b128124271e94bdb0f4e7850d9286170d712b04';
const APT_TIMER = `${APT}/debian/apt-daily.timer`;
const APT_SERVICE = `${APT}/debian/apt-daily.service`;
const APT_UPGRADE_TIMER = `${APT}/debian/apt-daily-upgrade.timer`;
const MAN = 'https://www.freedesktop.org/software/systemd/man/latest';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'systemd-timers',
	part: 'The running system',
	title: 'Timers instead of cron',
	minutes: 10,
	hook: [
		'Root\'s crontab has `0 3 * * * /usr/local/bin/backup.sh`. The VM is shut down every night from 22:00 to 07:00 to save money. cron wakes up every minute and checks each command "to see if it should be run in the current minute". At 03:00 no cron is running, so the backup never runs.',
		'Debian\'s anacron(8) page names the gap: unlike cron, "it does not assume that the machine is running continuously". A systemd timer with `OnCalendar=*-*-* 03:00` and `Persistent=true` stores its last trigger time on disk. When the VM boots at 07:00, systemd sees that the 03:00 run was missed and starts the backup right away.',
		'The output goes somewhere you can read, too. cron mails it to the owner of the crontab. A service started by a timer writes to the journal by default (`DefaultStandardOutput=journal`), so `journalctl -u backup.service` shows every run with its exit status.'
	],
	terms: [
		{ term: 'Timer unit', def: 'A `.timer` file with a `[Timer]` section. When it elapses, it starts the service of the same name: `backup.timer` starts `backup.service`.' },
		{ term: 'OnCalendar=', def: 'A wall-clock schedule written as a calendar event, like `Mon..Fri *-*-* 02:30:00`. `systemd-analyze calendar` prints the next times it matches.' },
		{ term: 'Persistent=', def: 'With `true`, systemd stores the last trigger time on disk. If a run was due while the timer was inactive, for example with the machine off, the service starts as soon as the timer is active again.' },
		{ term: 'RandomizedDelaySec=', def: 'A random delay between 0 and the given time, drawn before each run and added to the scheduled time. It spreads timers that would all fire at the same moment.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['enable["systemctl enable --now backup.timer"] --> timer["backup.timer: WantedBy=timers.target"]', 'timer -.->|"automatic Before="| svc["backup.service"]'],
				highlight: ['enable', 'timer'],
				note: 'You enable and start `backup.timer`, and the timer starts the service. `WantedBy=timers.target` makes it start at boot. systemd adds a `Before=backup.service` dependency to the timer by itself, and a timer with `OnCalendar=` is also ordered after `time-sync.target`, so it waits for a set clock.'
			},
			{
				add: ['timer --> next["Next elapse: 03:00 + random delay, within AccuracySec=1min"]'],
				highlight: ['next'],
				note: 'systemd computes the next elapse from `OnCalendar=`. `RandomizedDelaySec=` adds a random amount, then `AccuracySec=` (1 minute by default) lets systemd shift the time inside a window to group wake-ups with other timers. The timer never fires before the scheduled time.'
			},
			{
				add: ['next -->|"elapses"| svc', 'svc -->|"stdout and stderr"| journal[("journal: journalctl -u backup.service")]'],
				highlight: ['svc', 'journal'],
				note: 'At the elapse, systemd starts `backup.service`, usually a `Type=oneshot` service. If the service is still running from the last time, systemd leaves it running and starts no second copy. Its output and exit status land in the journal.'
			},
			{
				add: ['off["Machine off at 03:00"] -->|"boot at 07:00, Persistent=true"| catchup["Stamp file says a run was missed: start now"]', 'catchup --> svc'],
				highlight: ['off', 'catchup'],
				note: 'With `Persistent=true`, the last trigger time is kept on disk (on Ubuntu 24.04, in `/var/lib/systemd/timers/` as `stamp-backup.timer`). At boot, if at least one run was due while the timer was inactive, systemd triggers the service at once. The catch-up still waits for `RandomizedDelaySec=`.'
			}
		]
	},
	example: {
		title: 'debian/apt-daily.timer: the timer that runs apt update on Debian and Ubuntu',
		repo: 'Debian/apt',
		url: `${APT_TIMER}#L1-L10`,
		lang: 'ini',
		code: `[Unit]
Description=Daily apt download activities

[Timer]
OnCalendar=*-*-* 6,18:00
RandomizedDelaySec=12h
Persistent=true

[Install]
WantedBy=timers.target`,
		notes: [
			'Line 5 sets two runs a day. `systemd-analyze calendar \'*-*-* 6,18:00\'` prints the normalized form `*-*-* 06,18:00:00` and the next elapse, `06:00:00`.',
			'Line 6 adds a random delay of 0 to 12 hours to each run. On a laptop based on Ubuntu 24.04, `systemctl list-timers` showed the next run of `apt-daily.timer` at `07:32:55` for the 06:00 slot.',
			'Line 7 catches up on a slot missed while the laptop was off. Line 9 starts the timer at boot through `timers.target`.',
			'The timer names no unit, so it starts [apt-daily.service](' + APT_SERVICE + '#L7-L10): a `Type=oneshot` service that runs `/usr/lib/apt/apt.systemd.daily update`. Its sibling `apt-daily-upgrade.timer` fires at 6:00 with up to 60 minutes of delay and runs the `install` step.'
		]
	},
	tradeoff: {
		gain: [
			'`Persistent=true` runs a job missed while the machine was off. A crontab line for 03:00 on a machine that is off at 03:00 never runs.',
			'Each run is a service: `journalctl -u backup.service` shows its output, and `systemctl status` shows its last exit code.',
			'A run that is still going when the next elapse comes is left alone, so two copies of `backup.sh` never run at once.'
		],
		cost: [
			'You write two files, a `.timer` and a `.service`, and run `systemctl enable --now`, where cron needed one crontab line.',
			'`Persistent=` works only with `OnCalendar=`. A timer built on `OnUnitActiveSec=` does not catch up after downtime.',
			'The default `AccuracySec=1min` can move the run by up to a minute. Set `AccuracySec=1us` if the second matters.'
		]
	},
	task: {
		prompt: 'Turn the crontab line `30 2 * * 1-5 /usr/local/bin/report` into a systemd timer that also runs a missed report after downtime. Write both files, the command that checks your schedule, and the commands that show when it last ran and what it printed.',
		hint: 'In crontab, the fifth field is the day of the week, and 1-5 is Monday to Friday. The schedule goes in `report.timer`, the command in `report.service`.',
		answer: [
			'`/etc/systemd/system/report.service`: `[Service]` with `Type=oneshot` and `ExecStart=/usr/local/bin/report`. No `[Install]` section: the timer starts it.',
			'`/etc/systemd/system/report.timer`: `[Timer]` with `OnCalendar=Mon..Fri 02:30` and `Persistent=true`, then `[Install]` with `WantedBy=timers.target`.',
			'Check: `systemd-analyze calendar \'Mon..Fri 02:30\'` prints `Normalized form: Mon..Fri *-*-* 02:30:00` and the next elapse. Then `systemctl enable --now report.timer`.',
			'Last and next run: `systemctl list-timers report.timer` (columns `NEXT`, `LEFT`, `LAST`, `PASSED`). Output: `journalctl -u report.service`.'
		],
		steps: [
			{
				title: 'Read the crontab line',
				questions: [
					{ q: 'In `30 2 * * 1-5`, what do `30` and `2` mean?', options: ['Day 30, month 2', 'Minute 30 of hour 2', 'Hour 30 is invalid, so minute 2', 'Every 30 minutes for 2 hours'], answer: 1, why: 'The first two crontab fields are the minute and the hour: 02:30.' },
					{ q: 'What does the fifth field, `1-5`, mean?', options: ['The 1st to the 5th of the month', 'January to May', 'Monday to Friday', 'Five runs in a row'], answer: 2, why: 'The hint says it: the fifth field is the day of the week, and 1-5 is Monday to Friday.' },
					{ q: 'What does this crontab line not do that the task asks for?', options: ['Run a report missed while the machine was off', 'Run on weekdays only', 'Run at a fixed minute', 'Run as root'], answer: 0, why: 'cron checks each minute whether a command is due. If the machine is off at 02:30, the run is lost.' },
					{ q: 'How many files does the timer version need?', options: ['One `.timer` file holding the command', 'One line in `timers.target`', 'Three: a timer, a service and a socket', 'Two: `report.timer` for the schedule, `report.service` for the command'], answer: 3, why: 'A timer starts the service of the same name. The schedule and the command live apart.' }
				]
			},
			{
				title: 'Write the service',
				questions: [
					{ q: 'Which `Type=` fits a report that runs and exits?', options: ['`Type=oneshot`', '`Type=notify`', '`Type=simple`', '`Type=forking`'], answer: 0, why: 'A timer usually starts a `Type=oneshot` service: it runs to the end, then the unit goes back to inactive.' },
					{ q: 'Which line runs the report?', options: ['`Exec=/usr/local/bin/report`', '`Command=/usr/local/bin/report`', '`ExecStart=/usr/local/bin/report`', '`Run=/usr/local/bin/report`'], answer: 2, why: '`ExecStart=` is the command systemd runs when the service starts.' },
					{ q: 'Does `report.service` need an `[Install]` section?', options: ['Yes, `WantedBy=multi-user.target`', 'No: the timer starts it', 'Yes, `WantedBy=report.timer`', 'Yes, or the timer cannot find it'], answer: 1, why: 'The timer starts the service at each elapse. Only the timer is enabled, so only the timer needs `[Install]`.' },
					{ q: 'You want one run now, outside the schedule. What do you type?', options: ['Nothing: only the timer can start it', '`systemctl start report.timer`', '`systemd-analyze calendar now`', '`systemctl start report.service`'], answer: 3, why: 'The service is an ordinary unit, so you can start it by hand. Starting the timer only arms the schedule.' }
				]
			},
			{
				title: 'Write the timer',
				questions: [
					{ q: 'Which `OnCalendar=` matches `30 2 * * 1-5`?', options: ['`OnCalendar=Mon..Fri 02:30`', '`OnCalendar=1-5 2:30`', '`OnCalendar=*-*-1..5 02:30`', '`OnCalendar=weekdays 30 2`'], answer: 0, why: 'A calendar event names the weekdays first, then the date and the time: `Mon..Fri *-*-* 02:30:00` in normalized form.' },
					{ q: 'Which line would spread the 02:30 start over up to 10 minutes, so many servers do not all run at once?', options: ['`Persistent=true`', '`WakeSystem=true`', '`RandomizedDelaySec=10min`', '`AccuracySec=1us`'], answer: 2, why: '`RandomizedDelaySec=` draws a random delay before each run and adds it to the scheduled time.' },
					{ q: 'Which `[Install]` line starts the timer at boot?', options: ['`WantedBy=multi-user.target`', '`WantedBy=timers.target`', '`After=time-sync.target`', '`Before=report.service`'], answer: 1, why: '`apt-daily.timer` does the same: `WantedBy=timers.target`.' },
					{ q: 'Would `Persistent=true` work with `OnUnitActiveSec=1d` instead?', options: ['Yes, it works with every timer', 'Yes, if you add `AccuracySec=`', 'Only after a reboot', 'No: `Persistent=` works only with `OnCalendar=`'], answer: 3, why: 'A timer built on `OnUnitActiveSec=` does not catch up after downtime.' }
				]
			},
			{
				title: 'Check and watch it',
				questions: [
					{ q: 'Which command checks your schedule before you enable it?', options: ['`systemctl cat report.timer`', '`systemd-analyze calendar \'Mon..Fri 02:30\'`', '`crontab -l`', '`systemctl list-units --type=timer`'], answer: 1, why: 'It prints `Normalized form: Mon..Fri *-*-* 02:30:00` and the next elapse.' },
					{ q: 'Which unit do you enable and start?', options: ['`report.service`', 'Both, one after the other', '`report.timer`', '`timers.target`'], answer: 2, why: '`systemctl enable --now report.timer`. The timer then starts the service at each elapse.' },
					{ q: 'Which command shows when it last ran and when it runs next?', options: ['`systemctl list-timers report.timer`', '`journalctl -u report.timer`', '`systemctl status report.service`', '`systemd-analyze blame`'], answer: 0, why: 'Its columns are `NEXT`, `LEFT`, `LAST` and `PASSED`.' },
					{ q: 'Right after you enable it, `list-timers` shows nothing under `LAST`. What does that say?', options: ['The timer is broken', 'The service failed', 'The schedule is invalid', 'The timer has not triggered yet'], answer: 3, why: '`LAST` and `PASSED` fill in after the first run. `NEXT` and `LEFT` already show the coming one.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'A timer has `OnCalendar=daily` and `Persistent=true`. The machine is off from 23:00 to 08:00. When does the service run that day?',
			options: [
				'At 00:00 the next night: missed runs are skipped',
				'Soon after boot, once any `RandomizedDelaySec=` has passed',
				'At 00:00 by the hardware clock, which wakes the machine',
				'Never, until someone runs `systemctl start` by hand'
			],
			answer: 1,
			why: '`daily` means `*-*-* 00:00:00`. With `Persistent=true`, systemd reads the stored last trigger time at boot, sees that the 00:00 run fell in the downtime and triggers the service immediately, subject to `RandomizedDelaySec=`. Waking the machine needs `WakeSystem=`.'
		},
		{
			q: '`backup.timer` fires every hour. One run of `backup.service` takes 90 minutes. What happens at the next elapse?',
			options: [
				'systemd starts a second copy of the service next to the first',
				'systemd kills the running copy and starts a fresh one',
				'systemd leaves the running service alone and starts no new copy',
				'The timer unit fails and stops firing until reset'
			],
			answer: 2,
			why: 'systemd.timer(5): when the unit to activate "is already active at the time the timer elapses it is not restarted, but simply left running". A service has one instance, so there is no second copy.'
		},
		{
			q: 'Where do you read what `/usr/local/bin/report` printed when `report.timer` last ran it?',
			options: [
				'`journalctl -u report.service`',
				'The mailbox of the user who owns the timer',
				'`/var/log/cron.log`',
				'`journalctl -u report.timer`'
			],
			answer: 0,
			why: 'The timer only starts `report.service`. The service\'s standard output goes to the journal by default (`DefaultStandardOutput=journal`) and is tagged with the service unit, so you filter on `report.service`.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Run a timer as your own user, read its output in the journal, and watch `Persistent=true` catch up on a missed run.',
		steps: [
			'Check the task\'s schedule first: `systemd-analyze calendar \'Mon..Fri 02:30\'`.',
			'Create `~/.config/systemd/user/dojo-report.service` with `[Service]`, `Type=oneshot` and `ExecStart=/bin/sh -c "date; echo report done"`.',
			'Create `~/.config/systemd/user/dojo-report.timer` with `[Timer]`, `OnCalendar=*:*:0/20` (every 20 seconds, so you do not wait until 02:30), `AccuracySec=1s` and `Persistent=true`. Then `systemctl --user daemon-reload && systemctl --user start dojo-report.timer`.',
			'After half a minute, run `systemctl --user list-timers dojo-report.timer` and `journalctl --user -u dojo-report.service -n 4 --no-pager`.',
			'Miss a run on purpose: `systemctl --user stop dojo-report.timer`, wait 30 seconds, `date +%T`, then `systemctl --user start dojo-report.timer` and read the journal again with `-o short-precise`. Clean up: stop the timer, delete both files and `~/.local/share/systemd/timers/stamp-dojo-report.timer`, then `systemctl --user daemon-reload`.'
		],
		done: [
			'`systemd-analyze calendar` prints `Normalized form: Mon..Fri *-*-* 02:30:00` and a next elapse on a weekday.',
			'`list-timers` shows a `LAST` time and a `NEXT` time 20 seconds apart.',
			'The journal shows `report done` lines for `dojo-report.service`.',
			'After the stop and start, a `report done` line appears within a second of the start, not at the next 20-second slot.'
		],
		solution: [
			'In the test run, the timer was stopped at 14:11:20, the 14:11:40 slot passed while it was inactive, and the service ran at 14:11:42, right after `start`.',
			'The catch-up comes from the stamp file: for a user timer, `Persistent=true` keeps it in `~/.local/share/systemd/timers/`. For a system timer, it is `/var/lib/systemd/timers/`.',
			'For the real task, the two files go in `/etc/systemd/system/` with `OnCalendar=Mon..Fri 02:30`, `[Install]` with `WantedBy=timers.target` in the timer, and `systemctl enable --now report.timer`.'
		]
	},
	recall: {
		q: 'Which `[Timer]` setting makes a job run after a boot if its slot passed while the machine was off, and where does systemd keep what it needs for that?',
		a: '`Persistent=true`, with `OnCalendar=`. systemd stores the last trigger time on disk, in `/var/lib/systemd/timers/stamp-<name>.timer` on Ubuntu, and starts the service at boot if a run was missed.'
	},
	sources: [
		{ title: 'systemd.timer(5)', url: `${MAN}/systemd.timer.html` },
		{ title: 'systemd.time(7), Calendar Events', url: `${MAN}/systemd.time.html` },
		{ title: 'systemctl(1), list-timers', url: `${MAN}/systemctl.html` },
		{ title: 'Debian cron(8)', url: 'https://manpages.debian.org/trixie/cron/cron.8.en.html' },
		{ title: 'Debian anacron(8)', url: 'https://manpages.debian.org/trixie/anacron/anacron.8.en.html' },
		{ title: 'Debian/apt, debian/apt-daily-upgrade.timer', url: APT_UPGRADE_TIMER }
	]
};
