const MOBY = 'https://github.com/moby/moby/blob/3f38b15147b14ce0ce7b11558a1aa9e9f14db103';
const DOCKER_SERVICE = `${MOBY}/contrib/init/systemd/docker.service`;
const MAN = 'https://www.freedesktop.org/software/systemd/man/latest';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'systemd-units',
	part: 'The running system',
	title: 'systemd units',
	minutes: 10,
	hook: [
		'A service with `Restart=on-failure` reads a broken config file and exits with status 1 at every start. In a test run for this chapter on systemd 255, the journal for that service ends with `restart counter is at 5`, then `Start request repeated too quickly.` All of it carries the same timestamp, `01:49:50`. The unit stays `failed`, and systemd tries no more.',
		'The numbers come from the defaults. `RestartSec=` is 100 ms, and the manager allows 5 starts in 10 seconds (`DefaultStartLimitBurst=5`, `DefaultStartLimitIntervalSec=10s`). Five starts 100 ms apart fit easily inside 10 seconds.',
		'A second trap, from the same test run: you change `ExecStart=` in the unit file and run `systemctl restart`. systemctl prints `Warning: The unit file, source configuration file or drop-ins of dojo-sleep.service changed on disk.` The service restarts with the old command line, `/bin/sleep 600`, until you run `systemctl daemon-reload`.'
	],
	terms: [
		{ term: 'Unit file', def: 'An ini-style file such as `/etc/systemd/system/app.service` with a `[Unit]`, a `[Service]` and an `[Install]` section. systemd reads it at boot and at `systemctl daemon-reload`.' },
		{ term: 'Ordering dependency', def: '`After=` and `Before=`. `After=b.service` in `a.service` means: if both are being started, `a` waits until `b` has finished starting. It starts nothing by itself.' },
		{ term: 'Requirement dependency', def: '`Wants=` and `Requires=`. Starting the unit also starts the listed units. With `Requires=`, explicitly stopping or restarting a listed unit also stops or restarts this one.' },
		{ term: 'Start limit', def: '`StartLimitBurst=` starts allowed per `StartLimitIntervalSec=`. A unit that goes over it is refused with `Start request repeated too quickly.`, and `Restart=` stops trying.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['file["/etc/systemd/system/app.service"] -->|"systemctl daemon-reload"| pid1["systemd (PID 1): reloads every unit file, rebuilds the dependency tree"]'],
				highlight: ['file', 'pid1'],
				note: 'systemd reads unit files once and keeps them in memory. `systemctl daemon-reload` reruns the generators, reloads every unit file and recreates the dependency tree. Until then, an edited file on disk has no effect on the next start.'
			},
			{
				add: ['pid1 -->|"systemctl start app"| job["Start job: Wants= and Requires= pull in db.service"]', 'job -->|"After=db.service"| db["db.service started first"]'],
				highlight: ['job', 'db'],
				note: '`systemctl start app` creates a transaction. `Wants=db.service` or `Requires=db.service` adds a start job for `db.service`. Without `After=db.service`, both units start at the same time, because requirement dependencies do not order anything.'
			},
			{
				add: ['db --> fork["fork() and execve() of ExecStart="]', 'fork -->|"Type=notify: wait for READY=1"| up["app.service active"]'],
				highlight: ['fork', 'up'],
				note: 'When `db.service` has finished starting, systemd forks and runs the `ExecStart=` command. `Type=` decides when `app` counts as started: right after `fork()` for `simple`, after `execve()` for `exec`, when the process sends `READY=1` for `notify`. Units with `After=app.service` wait for that moment.'
			},
			{
				add: ['up -->|"exits with status 1"| restart["Restart=on-failure: new start after RestartSec=100ms"]', 'restart --> fork'],
				highlight: ['restart'],
				note: 'The main process exits with status 1. With `Restart=on-failure`, a non-zero exit code or a signal other than `SIGHUP`, `SIGINT`, `SIGTERM` or `SIGPIPE` triggers a restart after `RestartSec=`. A `systemctl stop` never triggers one.'
			},
			{
				add: ['restart -->|"6th start within 10 s"| failed["Start request repeated too quickly: unit stays failed"]'],
				highlight: ['failed'],
				note: 'Every start counts toward the start limit, manual ones too. With the defaults, the sixth start inside 10 seconds is refused. `systemctl reset-failed app` clears the counter, and a manual start works again once the interval has passed.'
			}
		]
	},
	example: {
		title: 'contrib/init/systemd/docker.service: the unit file Docker ships',
		repo: 'moby/moby',
		url: `${DOCKER_SERVICE}#L1-L38`,
		lang: 'ini',
		code: `[Unit]
Description=Docker Application Container Engine
Documentation=https://docs.docker.com
After=network-online.target nss-lookup.target docker.socket firewalld.service containerd.service time-set.target
Wants=network-online.target containerd.service
Requires=docker.socket
StartLimitBurst=3
StartLimitIntervalSec=60

[Service]
Type=notify
# the default is not to use systemd for cgroups because the delegate issues still
# exists and systemd currently does not support the cgroup feature set required
# for containers run by docker
ExecStart=/usr/bin/dockerd -H fd:// --containerd=/run/containerd/containerd.sock
ExecReload=/bin/kill -s HUP $MAINPID
TimeoutStartSec=0
RestartSec=2
Restart=always

# Having non-zero Limit*s causes performance problems due to accounting overhead
# in the kernel. We recommend using cgroups to do container-local accounting.
LimitNPROC=infinity
LimitCORE=infinity

# Comment TasksMax if your systemd version does not support it.
# Only systemd 226 and above support this option.
TasksMax=infinity

# set delegate yes so that systemd does not reset the cgroups of docker containers
Delegate=yes

# kill only the docker process, not all processes in the cgroup
KillMode=process
OOMScoreAdjust=-500

[Install]
WantedBy=multi-user.target`,
		notes: [
			'Line 4 orders `dockerd` after `containerd.service` and five other units. Line 5 pulls in `containerd.service` with `Wants=`: if containerd fails to start, Docker still starts. Line 6 uses `Requires=docker.socket`: stopping the socket explicitly also stops `docker.service`.',
			'Lines 7, 8, 18 and 19 set the restart policy. `Restart=always` restarts `dockerd` 2 seconds after any exit that `systemctl stop` did not cause. The start limit allows 3 starts in 60 seconds, so after three quick crashes the fourth start is refused and the unit stays failed.',
			'Line 11, `Type=notify`, makes systemd wait for `dockerd` to send `READY=1`. A unit with `After=docker.service` therefore starts only once `dockerd` reports that it has finished starting up. With `Type=simple`, it would start right after the `fork()`.',
			'Line 38 is read by `systemctl enable docker`. It creates a symlink in `multi-user.target.wants/`, which adds `Wants=docker.service` to `multi-user.target`, so Docker starts at boot.'
		]
	},
	tradeoff: {
		gain: [
			'`Restart=on-failure` brings a crashed process back after `RestartSec=`, with no wrapper script or cron job watching it.',
			'`Wants=` with `After=` gives Docker its order: containerd starts first when both start, and Docker still starts if containerd fails.',
			'A drop-in file in `/etc/systemd/system/docker.service.d/` overrides single settings of the packaged unit file without editing that file.'
		],
		cost: [
			'With the default `RestartSec=100ms` and 5 starts per 10 seconds, a service that fails at start is given up within a second. Set `RestartSec=` to a few seconds if the cause can clear by itself, like a database still booting.',
			'`Requires=` stops your unit whenever someone explicitly stops or restarts the listed unit, so a restart of the database also restarts your app.',
			'An edit to a unit file applies only after `systemctl daemon-reload`. `systemctl restart` without it starts the old definition and prints only a warning.'
		]
	},
	task: {
		prompt: 'Your app `/usr/local/bin/shop` reads from PostgreSQL. Write `/etc/systemd/system/shop.service` so that: `postgresql.service` is started with it and before it; the app restarts 5 seconds after a crash; systemd gives up after 10 starts in 5 minutes; the app starts at boot. Then give the commands to install and start it, and the commands to run after you later change `ExecStart=`.',
		hint: '`StartLimitIntervalSec=` and `StartLimitBurst=` belong in the `[Unit]` section. `systemctl enable` reloads the manager configuration by itself.',
		answer: [
			'`[Unit]`: `Wants=postgresql.service`, `After=postgresql.service`, `StartLimitIntervalSec=300`, `StartLimitBurst=10`. `Wants=` pulls PostgreSQL in, `After=` makes `shop` wait for it.',
			'`[Service]`: `ExecStart=/usr/local/bin/shop`, `Restart=on-failure`, `RestartSec=5`. `[Install]`: `WantedBy=multi-user.target`.',
			'Install and start: `systemctl enable --now shop`. `enable` creates the symlink in `multi-user.target.wants/` and reloads the configuration, and `--now` starts the unit too.',
			'After an edit: `systemctl daemon-reload`, then `systemctl restart shop`. `systemctl show shop -p NeedDaemonReload` prints `NeedDaemonReload=yes` while the reload is missing.'
		],
		steps: [
			{
				title: 'Bring in PostgreSQL',
				questions: [
					{ q: 'Which line makes `postgresql.service` start when `shop` starts?', options: ['`After=postgresql.service`', '`Before=postgresql.service`', '`Wants=postgresql.service`', '`WantedBy=postgresql.service`'], answer: 2, why: '`Wants=` adds a start job for the listed unit to the transaction. `After=` alone starts nothing.' },
					{ q: 'Which line makes `shop` wait until PostgreSQL has finished starting?', options: ['`After=postgresql.service`', '`Requires=postgresql.service`', '`Wants=postgresql.service`', '`Before=postgresql.service`'], answer: 0, why: 'Ordering comes only from `After=` and `Before=`. `After=b` means `a` waits for `b` when both start.' },
					{ q: 'With both lines in place, PostgreSQL fails to start. What happens to `shop`?', options: ['systemd does not start it', 'It waits until PostgreSQL comes up', 'systemd retries PostgreSQL 5 times first', 'It still starts, once the PostgreSQL job has finished'], answer: 3, why: '`Wants=` is the weak form: if the wanted unit fails, this one starts anyway. `After=` only makes it wait for the job to end.' },
					{ q: 'Why prefer `Wants=` over `Requires=` here?', options: ['`Requires=` does not start the unit', 'With `Requires=`, restarting PostgreSQL also restarts `shop`', '`Wants=` also orders the units', '`Requires=` only works at boot'], answer: 1, why: 'With `Requires=`, explicitly stopping or restarting the listed unit also stops or restarts this one.' }
				]
			},
			{
				title: 'Set the restart policy',
				questions: [
					{ q: 'Which `[Service]` lines restart the app 5 seconds after a crash?', options: ['`Restart=always` and `TimeoutStartSec=5`', '`Restart=on-failure` and `RestartSec=5`', '`Restart=on-abort` and `StartLimitBurst=5`', '`Restart=no` and `RestartSec=5`'], answer: 1, why: '`on-failure` restarts after a non-zero exit or an unclean signal. `RestartSec=` sets the delay before the new start.' },
					{ q: 'Without `RestartSec=`, how long does systemd wait before a restart?', options: ['100 ms', '5 seconds', '10 seconds', 'It does not restart'], answer: 0, why: '`RestartSec=` defaults to 100 ms, which is why a broken service hits the start limit in under a second.' },
					{ q: 'How do you write "give up after 10 starts in 5 minutes"?', options: ['`StartLimitBurst=5` and `StartLimitIntervalSec=10`', '`RestartSec=300` and `StartLimitBurst=10`', '`StartLimitIntervalSec=5m` and `RestartSec=10`', '`StartLimitIntervalSec=300` and `StartLimitBurst=10`'], answer: 3, why: '`StartLimitBurst=` is the number of starts, `StartLimitIntervalSec=` the window: 300 seconds is 5 minutes.' },
					{ q: 'In which section do the two start-limit lines go?', options: ['`[Service]`', '`[Install]`', '`[Unit]`', 'Either section works'], answer: 2, why: 'The hint says so: `StartLimitIntervalSec=` and `StartLimitBurst=` belong in `[Unit]`.' }
				]
			},
			{
				title: 'Start it at boot',
				questions: [
					{ q: 'Which line makes `shop` start at boot once enabled?', options: ['`WantedBy=multi-user.target`', '`After=multi-user.target`', '`Wants=multi-user.target`', '`Before=default.target`'], answer: 0, why: '`systemctl enable` reads `[Install]` and adds a symlink in `multi-user.target.wants/`, so the target pulls `shop` in.' },
					{ q: 'Which one command installs and starts it now?', options: ['`systemctl start shop`', '`systemctl daemon-reload shop`', '`systemctl link shop`', '`systemctl enable --now shop`'], answer: 3, why: '`enable` creates the symlink and reloads the configuration, and `--now` starts the unit too.' },
					{ q: 'Do you need `systemctl daemon-reload` before `enable` for a new file?', options: ['Yes, or `enable` fails', 'No: `enable` reloads the manager configuration by itself', 'Yes, and a reboot as well', 'Only if the unit has `Wants=`'], answer: 1, why: 'The hint states it: `systemctl enable` reloads the manager configuration on its own.' },
					{ q: 'What does `systemctl start shop` alone not do?', options: ['Start PostgreSQL first', 'Run `ExecStart=`', 'Make `shop` start at the next boot', 'Apply the restart policy'], answer: 2, why: '`start` runs the unit now. Only `enable` creates the `.wants/` symlink that brings it back at boot.' }
				]
			},
			{
				title: 'Apply a later change',
				questions: [
					{ q: 'You save a new `ExecStart=` while `shop` is running, and run nothing yet. What does the running process do?', options: ['It keeps running the old command', 'It restarts with the new command', 'It stops', 'systemd reloads the file and restarts it within 5 s'], answer: 0, why: 'Saving a file sends nothing to systemd or to the process. The change only applies after a reload and a restart.' },
					{ q: 'What do you run after the edit?', options: ['`systemctl reset-failed shop`, then `systemctl start shop`', '`systemctl enable --now shop` again', '`systemctl reload shop`', '`systemctl daemon-reload`, then `systemctl restart shop`'], answer: 3, why: '`daemon-reload` reloads every unit file and rebuilds the dependency tree. The restart then uses the new definition.' },
					{ q: 'Which command tells you a reload is still missing?', options: ['`systemctl is-failed shop`', '`systemctl show shop -p NeedDaemonReload`', '`systemctl list-dependencies shop`', '`systemctl cat shop`'], answer: 1, why: 'It prints `NeedDaemonReload=yes` while the file on disk differs from what systemd has loaded.' },
					{ q: 'After a burst of crashes the unit is `failed` with `Start request repeated too quickly.` What clears it?', options: ['`systemctl daemon-reload`', '`systemctl restart shop`, right away', '`systemctl reset-failed shop`', '`systemctl enable shop`'], answer: 2, why: '`reset-failed` clears the start counter. Every start counts toward the limit, manual ones too.' }
				]
			}
		]
	},
	quiz: [
		{
			q: '`app.service` has `Wants=db.service` and no `After=` or `Before=`. You run `systemctl start app`. What happens?',
			options: [
				'systemd starts `db.service` first and waits until it is fully started',
				'systemd starts both units at the same time, with no delay between them',
				'systemd starts only `app.service`, because `Wants=` is a hint for boot',
				'systemd refuses the job until you add `Requires=db.service`'
			],
			answer: 1,
			why: 'Requirement dependencies only decide which units join the transaction. The order comes from `After=` or `Before=`. With neither, systemd starts both units simultaneously.'
		},
		{
			q: 'You change `ExecStart=` in `/etc/systemd/system/app.service` and run `systemctl restart app`. Which command line runs?',
			options: [
				'The new one, because `restart` reads the unit file from disk first',
				'None: the unit fails to load until you run `systemctl daemon-reload`',
				'The old one, and systemctl prints a warning to run `daemon-reload`',
				'The new one, but only after the next reboot of the machine'
			],
			answer: 2,
			why: 'systemd keeps the parsed unit in memory. Only `systemctl daemon-reload` reloads the files and rebuilds the dependency tree, so `restart` starts the definition it already has.'
		},
		{
			q: 'A service with `Restart=on-failure` and default settings exits with status 1 at every start. What do you see after a second?',
			options: [
				'It keeps restarting every 100 ms until someone runs `systemctl stop`',
				'It restarts once, then stays failed, because `on-failure` retries once',
				'It is not restarted, because status 1 counts as a clean exit',
				'After 5 starts in 10 seconds, `Start request repeated too quickly.`'
			],
			answer: 3,
			why: '`RestartSec=` defaults to 100 ms, and the manager allows 5 starts per 10 seconds. The sixth start falls inside the interval, so systemd refuses it and leaves the unit failed until `systemctl reset-failed` or the interval passes.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Hit the start limit and the `daemon-reload` trap yourself, with user units that need no root.',
		steps: [
			'Make the user unit folder: `mkdir -p ~/.config/systemd/user`. Create `~/.config/systemd/user/dojo-crash.service` with a `[Service]` section holding `ExecStart=/bin/sh -c \'echo reading config; exit 1\'` and `Restart=on-failure`.',
			'Load and start it: `systemctl --user daemon-reload && systemctl --user start dojo-crash`. Wait two seconds, then run `systemctl --user show dojo-crash -p NRestarts -p ActiveState` and `journalctl --user -u dojo-crash -n 4 --no-pager`.',
			'Fix the policy: add a `[Unit]` section with `StartLimitIntervalSec=300` and `StartLimitBurst=10`, and `RestartSec=5` under `[Service]`. Run `systemctl --user daemon-reload`, `systemctl --user reset-failed dojo-crash`, start it again, and check the same two values after about 12 seconds.',
			'Now the reload trap: create `dojo-sleep.service` with `ExecStart=/bin/sleep 600`, reload, start it. Change `600` to `700` in the file, then run `systemctl --user restart dojo-sleep` and `systemctl --user show dojo-sleep -p NeedDaemonReload`. Check the running command with `ps -o args= -p $(systemctl --user show dojo-sleep -p MainPID --value)`.',
			'Run `systemctl --user daemon-reload`, restart again and check the command. Clean up: `systemctl --user stop dojo-crash dojo-sleep`, delete both files, `systemctl --user daemon-reload`.'
		],
		done: [
			'With the defaults, `NRestarts=5`, the unit is `failed`, and the last journal lines show `restart counter is at 5` and `Start request repeated too quickly.`',
			'With the fix, after 12 seconds the unit shows `ActiveState=activating` and only 2 restarts.',
			'The first `restart` of `dojo-sleep` prints `Warning: The unit file ... changed on disk`, `NeedDaemonReload=yes`, and `ps` still shows `/bin/sleep 600`.',
			'After `daemon-reload`, `ps` shows `/bin/sleep 700`.'
		],
		solution: [
			'The default `RestartSec=` of 100 ms burns the 5 starts allowed per 10 seconds in well under a second. The journal shows `restart counter is at 5`, then the refusal.',
			'With `RestartSec=5` and 10 starts per 300 seconds, the unit keeps trying in `auto-restart` instead of giving up: the case of a database that is still booting.',
			'The fixed `dojo-crash.service` reads: `[Unit]`, `StartLimitIntervalSec=300`, `StartLimitBurst=10`, then `[Service]`, `ExecStart=...`, `Restart=on-failure`, `RestartSec=5`.',
			'`systemctl --user` talks to your own systemd manager, so the units, their limits and `daemon-reload` behave as on the system manager, with no `sudo`.'
		]
	},
	recall: {
		q: 'With default settings, how many starts does systemd allow a crashing `Restart=on-failure` service, and what line ends its journal?',
		a: '5 starts within 10 seconds (`DefaultStartLimitBurst=5`, `DefaultStartLimitIntervalSec=10s`), 100 ms apart. Then `Start request repeated too quickly.` and the unit stays failed until `systemctl reset-failed`.'
	},
	sources: [
		{ title: 'systemd.service(5)', url: `${MAN}/systemd.service.html` },
		{ title: 'systemd.unit(5)', url: `${MAN}/systemd.unit.html` },
		{ title: 'systemd-system.conf(5), DefaultStartLimitIntervalSec=', url: `${MAN}/systemd-system.conf.html` },
		{ title: 'systemctl(1)', url: `${MAN}/systemctl.html` },
		{ title: 'moby/moby, contrib/init/systemd/docker.service', url: DOCKER_SERVICE }
	]
};
