/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'systemd',
	part: 'Ops tools',
	title: 'systemctl',
	minutes: 10,
	hook: [
		'You are logged in as root on the VM `web-1`, so no command needs `sudo`. The shop backend runs as `orders.service`, defined in `/etc/systemd/system/orders.service`. nginx runs as `nginx.service` in front of it. An hour ago a colleague changed the port in the `ExecStart=` line of `orders.service`, and now the site answers 502.',
		'You check the state of both services, load the edited unit file and restart the backend. A unit name without a suffix means `.service`: `systemctl status orders` and `systemctl status orders.service` do the same thing.'
	],
	terms: [
		{ term: 'Unit', def: 'One object systemd manages: a service, a timer, a socket, a mount. Its name ends with its type, as in `orders.service`.' },
		{ term: 'Unit file', def: 'The text file that defines a unit, such as `/etc/systemd/system/orders.service`, with sections like `[Service]` and `[Install]`.' },
		{ term: 'Active', def: 'The runtime state of a unit: `active` while the service runs, `inactive` when it is stopped, `failed` when it exited with an error.' },
		{ term: 'Enabled', def: 'A unit is enabled when systemd has created the symlinks listed in its `[Install]` section, so it starts at boot.' }
	],
	reps: [
		{
			prompt: 'Show whether `orders` is running, its main PID and its last log lines.',
			accept: [
				'systemctl status orders',
				'systemctl status orders.service',
				'sudo systemctl status orders',
				'sudo systemctl status orders.service'
			],
			why: '`status orders` prints the `Loaded:` and `Active:` lines, the main PID, then the most recent journal lines of the unit. It exits with 3 when the unit is not active.'
		},
		{
			prompt: 'Print only `active` or `inactive` for `orders`, the way a deploy script would check it.',
			accept: [
				'systemctl is-active orders',
				'systemctl is-active orders.service',
				'sudo systemctl is-active orders',
				'sudo systemctl is-active orders.service'
			],
			why: '`is-active orders` prints the state and exits with 0 only if the unit is active. Add `--quiet` and it prints nothing, so a script reads the exit code alone.'
		},
		{
			prompt: 'Print the unit file of `orders` as systemd sees it on disk, drop-in files included.',
			accept: ['systemctl cat orders', 'systemctl cat orders.service', 'sudo systemctl cat orders', 'sudo systemctl cat orders.service'],
			why: '`cat orders` prints each backing file of the unit, each one after a comment line with its path, such as `# /etc/systemd/system/orders.service`. It shows the files on disk, which can differ from what systemd loaded if you edited them since.'
		},
		{
			prompt: 'Make systemd load the edited `/etc/systemd/system/orders.service`.',
			accept: ['systemctl daemon-reload', 'sudo systemctl daemon-reload'],
			why: '`daemon-reload` reloads every unit file and rebuilds the dependency tree. Until you run it, a restart still uses the old `ExecStart=` line, and `systemctl status` warns that the unit file changed on disk.'
		},
		{
			prompt: 'Stop and start `orders` again in one command, so it runs the new `ExecStart=` line.',
			accept: [
				'systemctl restart orders',
				'systemctl restart orders.service',
				'sudo systemctl restart orders',
				'sudo systemctl restart orders.service'
			],
			why: '`restart orders` stops the unit and starts it again. On a stopped unit, `restart` only does the start.'
		},
		{
			prompt: '`nginx.service` stopped during the last deploy. Start it.',
			accept: ['systemctl start nginx', 'systemctl start nginx.service', 'sudo systemctl start nginx', 'sudo systemctl start nginx.service'],
			why: '`start nginx` activates `nginx.service` now. It does not change whether nginx starts at boot.'
		},
		{
			prompt: '`orders` does not come back after a reboot. Make it start at boot and start it now, in one command.',
			accept: [
				'systemctl enable --now orders',
				'systemctl enable --now orders.service',
				'systemctl enable orders --now',
				'systemctl enable orders.service --now',
				'sudo systemctl enable --now orders',
				'sudo systemctl enable --now orders.service'
			],
			why: '`enable orders` creates the symlinks named by the `WantedBy=` line of the `[Install]` section, but does not start the service. `--now` also starts it once the symlinks exist.'
		},
		{
			prompt: 'Check that the boot setting took: print `enabled` or `disabled` for `orders`.',
			accept: [
				'systemctl is-enabled orders',
				'systemctl is-enabled orders.service',
				'sudo systemctl is-enabled orders',
				'sudo systemctl is-enabled orders.service'
			],
			why: '`is-enabled orders` prints the enable state of the unit file and exits with 0 if it is enabled. `is-active` answers a different question: whether it runs now.'
		},
		{
			prompt: 'List every unit on `web-1` that is in the failed state.',
			accept: [
				'systemctl --failed',
				'systemctl list-units --failed',
				'systemctl --state=failed',
				'systemctl list-units --state=failed',
				'sudo systemctl --failed',
				'sudo systemctl list-units --failed'
			],
			why: '`--failed` filters the unit list to units in the failed state; it is the same as `--state=failed`. With no command, systemctl runs `list-units`, so both spellings print the same table.'
		}
	],
	quiz: [],
	recall: {
		q: 'You edited `/etc/systemd/system/orders.service`. Which command must run before `systemctl restart orders` uses the new file?',
		a: '`systemctl daemon-reload`. It reloads all unit files; without it, the restart uses the old definition.'
	},
	sources: [{ title: 'systemctl man page', url: 'https://www.freedesktop.org/software/systemd/man/latest/systemctl.html' }]
}
