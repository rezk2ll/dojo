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
