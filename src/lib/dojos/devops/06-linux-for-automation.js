const CADDY = 'https://github.com/caddyserver/dist/blob/f94a1d2626835ff4157e85296fb8e4fa5500e0fb';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'linux-for-automation',
	part: 'Fundamentals',
	title: 'Exit codes, streams and systemd: how tools talk',
	minutes: 10,
	hook: [
		'You run `systemctl restart caddy`. It prints nothing. You glance at the screen, see no error, and move on. **You** read the screen.',
		'A pipeline cannot read a screen. It runs your commands with nobody watching, and it decides from three things only: **the exit code**, what went to stdout, and what went to stderr.',
		'Services follow the same rule one level up. systemd starts the process, watches its exit code, and sends its output to the journal. Learn this contract once and every CI job you write later is just more of it.'
	],
	terms: [
		{ term: 'Process', def: 'A running program. It has a PID, a parent, an environment, and three open streams when it starts.' },
		{ term: 'Exit code', def: 'The number a process returns when it ends. `0` means success. Anything from 1 to 255 means failure, and the program chooses which number.' },
		{ term: 'stdout and stderr', def: 'Two output streams: stdout (file descriptor 1) for results, stderr (file descriptor 2) for errors and messages. stdin (descriptor 0) is the input.' },
		{ term: 'Unit', def: 'A file that tells systemd how to run something. A `.service` unit says which command to start, as which user, and what to do when it exits.' },
		{ term: 'Journal', def: 'The log store of systemd, run by journald. You read it with `journalctl`, filtered by unit, boot, time or priority.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['cmd["Process: caddy run"]', 'cmd -->|"fd 1"| out["stdout"]', 'cmd -->|"fd 2"| err["stderr"]'],
				highlight: ['cmd', 'out', 'err'],
				note: 'Every process starts with three streams: stdin, stdout and stderr. Keeping **results on stdout** and **errors on stderr** is what lets you pipe the results and still see the errors.'
			},
			{
				add: ['cmd -->|"on exit"| code["Exit code: 0 or 1 to 255"]'],
				highlight: ['code'],
				note: 'When it ends, the process returns a number. **0 is success, the rest is failure.** Bash adds a few of its own: 127 means command not found, 126 means found but not executable, 128+N means killed by signal N.'
			},
			{
				add: ['subgraph sd["systemd"]', 'unit["caddy.service"]', 'end', 'unit -->|"starts, watches"| cmd'],
				highlight: ['unit'],
				note: 'You stop starting daemons with `nohup` and PID files. systemd starts the process from the unit file, keeps track of it, and reads its exit code. The `Restart=` setting decides what happens next. **Its default is `no`.**'
			},
			{
				add: ['jr[("journald")]', 'out --> jr', 'err --> jr'],
				highlight: ['jr'],
				note: 'By default a service\'s stdout goes to the journal, and stderr goes where stdout goes. No log file to rotate. `journalctl -u caddy -f` follows it live, `-b` limits it to this boot.'
			},
			{
				add: ['auto["Your script or CI job"]', 'auto -.->|"systemctl is-active caddy"| unit'],
				highlight: ['auto'],
				note: 'Automation asks systemd, and the answer comes back as **an exit code again**: `systemctl is-active` returns 0 if the unit is active, non-zero otherwise. Every layer speaks the same contract.'
			}
		]
	},
	example: {
		title: 'init/caddy.service',
		repo: 'caddyserver/dist',
		url: `${CADDY}/init/caddy.service#L16-L35`,
		lang: 'ini',
		code: `[Unit]
Description=Caddy
Documentation=https://caddyserver.com/docs/
After=network.target network-online.target
Requires=network-online.target

[Service]
Type=notify
User=caddy
Group=caddy
ExecStart=/usr/bin/caddy run --environ --config /etc/caddy/Caddyfile
ExecReload=/usr/bin/caddy reload --config /etc/caddy/Caddyfile --force
TimeoutStopSec=5s
LimitNOFILE=1048576
PrivateTmp=true
ProtectSystem=full
AmbientCapabilities=CAP_NET_ADMIN CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target`,
		notes: [
			'`Type=notify`: systemd waits for Caddy to send `READY=1` before it calls the start done. So when `systemctl start caddy` returns, Caddy is really up, not just forked.',
			'`User=caddy` with `CAP_NET_BIND_SERVICE` in `AmbientCapabilities`: Caddy does not run as root, yet it may still bind ports below 1024, like 80 and 443.',
			'There is **no `Restart=` line**, so the default `no` applies: if Caddy crashes, it stays down. The [Caddy docs](https://caddyserver.com/docs/running) show how to add `Restart=on-failure` in an override.',
			'`--environ` prints the whole environment at startup, and that output lands in the journal. Anything secret you put in the environment ends up in your logs. Keep that in mind for day 10.',
			'`ExecReload` is what `systemctl reload caddy` runs. A reload applies the new config without stopping the server. A stop and start drops connections.'
		]
	},
	tradeoff: {
		gain: [
			'One contract for every tool: exit code plus two streams. Any script can drive any other program.',
			'systemd handles the user, the restart policy and the logs, so your scripts stop juggling `nohup`, PID files and log rotation.',
			'The journal can be filtered by unit, boot, time and priority, without grepping five files.'
		],
		cost: [
			'An exit code is one number. It says **that** something failed, not **why**. You still need stderr.',
			'Some tools exit 0 on what you call a failure. `curl` returns 0 on an HTTP 500 unless you pass `--fail`.',
			'Unit files have hundreds of options, and the defaults surprise people. `Restart=no` is the classic one.'
		]
	},
	task: {
		prompt: 'Caddy crashed at 3 a.m. and stayed down until you woke up. Using the unit above, make it restart by itself after 5 seconds without editing the packaged file. Then give the commands to see why it died.',
		hint: 'systemd can layer a small file on top of a unit. The Caddy docs have a "Restart on crash" section.',
		answer: [
			'`sudo systemctl edit caddy` opens a **drop-in** file (`override.conf` by default). systemd reloads the config by itself when you save.',
			'Put in it: `[Service]`, `Restart=on-failure`, `RestartSec=5s`. The Caddy docs also add `RestartPreventExitStatus=1`, so exit code 1 does not trigger a restart.',
			'The packaged unit stays untouched, so a package upgrade does not erase your change.',
			'Why it died: `systemctl status caddy` shows the last exit status and the last log lines. `journalctl -u caddy -b` shows the full story for this boot.'
		]
	},
	quiz: [
		{
			q: 'A step in your script exits with status 127. What does that mean in bash?',
			options: [
				'The process was killed by signal 127',
				'The command was not found',
				'The command succeeded with warnings',
				'A file could not be read'
			],
			answer: 1,
			why: 'Bash returns 127 when it cannot find the command, and 126 when it finds it but cannot execute it. A signal shows up as 128 plus the signal number.'
		},
		{
			q: 'You run `ls /nope 2>&1 > out.txt` in a terminal. Where does the error message go?',
			options: ['Into out.txt', 'To the terminal', 'Both into out.txt and the terminal', 'Nowhere, it is discarded'],
			answer: 1,
			why: 'Redirections apply left to right. `2>&1` copies stdout as it is at that moment (the terminal), and only then stdout moves to the file. Write `> out.txt 2>&1` to send both to the file.'
		},
		{
			q: 'The Caddy unit above has no `Restart=` line. The Caddy process crashes. What does systemd do?',
			options: [
				'Restarts it after 100 ms',
				'Leaves it stopped',
				'Restarts it 5 times, then gives up',
				'Reboots the machine'
			],
			answer: 1,
			why: '`Restart=` defaults to `no`: the service is not restarted. You opt in with `on-failure` or `always`.'
		}
	],
	takeaway: 'Automation cannot read your screen. It reads exit codes, stdout, stderr and the journal, so make every script and service speak that contract.',
	sources: [
		{ title: 'Bash manual, Exit Status', url: 'https://www.gnu.org/software/bash/manual/html_node/Exit-Status.html' },
		{ title: 'Bash manual, Redirections', url: 'https://www.gnu.org/software/bash/manual/html_node/Redirections.html' },
		{ title: 'systemd.service, Restart= and Type=', url: 'https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html' },
		{ title: 'journalctl manual', url: 'https://www.freedesktop.org/software/systemd/man/latest/journalctl.html' },
		{ title: 'Caddy docs, Keep Caddy running (systemd and restart on crash)', url: 'https://caddyserver.com/docs/running' }
	]
};
