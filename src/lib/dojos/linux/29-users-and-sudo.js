const SUDO = 'https://github.com/sudo-project/sudo/blob/ec6d49dd08d7498b0a8a2d58b71976272a978368';
const SUDOERS_IN = `${SUDO}/plugins/sudoers/sudoers.in`;
const VISUDO_C = `${SUDO}/plugins/sudoers/visudo.c`;
const LOGGING_C = `${SUDO}/plugins/sudoers/logging.c`;
const DEBIAN_SUDOERS = 'https://salsa.debian.org/sudo-team/sudo/-/blob/7d2097aa5fbbbb2608f973bc04a9f7e4106cde7a/debian/etc/sudoers';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'users-and-sudo',
	part: 'The running system',
	title: 'Users, groups and sudo',
	minutes: 10,
	hook: [
		'Your CI logs in as `deploy` and runs `sudo systemctl restart shop`. You put the rule `deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart shop.service` in `/etc/sudoers.d/deploy.conf`. sudo answers `deploy is not in the sudoers file.` sudoers(5) explains: sudo reads each file in `/etc/sudoers.d`, "skipping file names that end in \'~\' or contain a \'.\' character".',
		'You rename the file to `/etc/sudoers.d/deploy`. Now sudo prints `Sorry, user deploy is not allowed to execute \'/usr/bin/systemctl restart shop\' as root on web1.` The rule says `shop.service` and the script typed `shop`. When a rule lists arguments, they must match the ones on the command line.',
		'A missing colon after `NOPASSWD` is the third trap. `visudo -c -f` on sudo 1.9.15p5 prints `bad.sudoers:1:67: syntax error` and exits with 1. The sudoers file that ships with sudo warns that editing without visudo "may result in syntax or file permission errors that prevent sudo from running."'
	],
	terms: [
		{ term: 'UID', def: 'The number the kernel uses for a user; names live in `/etc/passwd`. A process with effective UID 0, called root, bypasses all kernel permission checks.' },
		{ term: 'System user', def: 'An account for a daemon, created by `useradd --system` with a UID in the `SYS_UID_MIN` to `SYS_UID_MAX` range, below the first regular UID of 1000 by default, usually with `/usr/sbin/nologin` as its shell. `www-data` has UID 33.' },
		{ term: 'sudoers rule', def: 'A line `who where = (as_whom) tags: commands`, like `%sudo ALL=(ALL:ALL) ALL`. `%` marks a group, and the `(user:group)` part says whom the command may run as.' },
		{ term: 'visudo', def: 'The editor wrapper for sudoers files. It locks the file, parses your edit and refuses to install it while it has a syntax error.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['cmd["deploy (UID 1001) runs: sudo systemctl restart shop.service"] --> sudo["/usr/bin/sudo, setuid root: runs with effective UID 0"]'],
				highlight: ['cmd', 'sudo'],
				note: '`/usr/bin/sudo` has mode `4755`: the setuid bit makes it run with the file owner\'s UID, 0, whoever starts it. Before running anything, it decides whether `deploy` may run this exact command.'
			},
			{
				add: ['sudo --> read["Read /etc/sudoers, then /etc/sudoers.d/* in lexical order"]', 'read -.->|"skipped"| skip["deploy.conf, deploy~"]'],
				highlight: ['read', 'skip'],
				note: 'sudo parses `/etc/sudoers`. Its `@includedir /etc/sudoers.d` line pulls in every file there, sorted by name, skipping names that contain a `.` or end in `~`. `/etc/sudoers.d/deploy.conf` is never read, and nothing warns you.'
			},
			{
				add: ['read --> match{"Rules for deploy on this host: last match wins"}', 'match -->|"path and arguments match"| ok["NOPASSWD: no password asked"]', 'match -->|"no match"| deny["Sorry, user deploy is not allowed to execute ..."]'],
				highlight: ['match', 'ok', 'deny'],
				note: 'sudo compares every rule for `deploy` and this host in order, and the last match is used. A command is a full path. If the rule lists arguments, the user\'s arguments must match them, and `""` allows no arguments at all.'
			},
			{
				add: ['ok --> run["systemctl runs as UID 0, the command is logged"]'],
				highlight: ['run'],
				note: 'With `NOPASSWD:` sudo runs the command right away. Without it, sudo asks for the password of `deploy` itself and then skips the prompt for 5 minutes (`timestamp_timeout`). The rule `root ALL=(ALL:ALL) ALL` is why root can use sudo too.'
			}
		]
	},
	example: {
		title: 'plugins/sudoers/sudoers.in: the user rules in the sudoers file sudo ships',
		repo: 'sudo-project/sudo',
		url: `${SUDOERS_IN}#L119-L139`,
		lang: 'text',
		code: `##
## User privilege specification
##
root ALL=(ALL:ALL) ALL

## Uncomment to allow members of group wheel to execute any command
# %wheel ALL=(ALL:ALL) ALL

## Same thing without a password
# %wheel ALL=(ALL:ALL) NOPASSWD: ALL

## Uncomment to allow members of group sudo to execute any command
# %sudo ALL=(ALL:ALL) ALL

## Uncomment to allow any user to run sudo if they know the password
## of the user they are running the command as (root by default).
# Defaults targetpw  # Ask for the password of the target user
# ALL ALL=(ALL:ALL) ALL  # WARNING: only use this together with 'Defaults targetpw'

## Read drop-in files from @sysconfdir@/sudoers.d
@includedir @sysconfdir@/sudoers.d`,
		notes: [
			'Line 4 reads: user `root`, on `ALL` hosts, may run as any user and any group `(ALL:ALL)`, the command `ALL`. Every other rule in this file uses the same four parts.',
			'Lines 7 and 13 use `%` to give a whole group the same right. [Debian\'s packaged sudoers](' + DEBIAN_SUDOERS + '#L166) enables the `%sudo` line, so there `usermod -aG sudo alice` gives Alice admin rights. Line 10 adds the `NOPASSWD:` tag, which drops the password prompt for everything.',
			'Line 21 is the `@includedir` that reads `/etc/sudoers.d`. `@sysconfdir@` is replaced at build time, with `/etc` on most distributions. A package can drop a file there without editing `/etc/sudoers`.',
			'The header of this file says it "MUST be edited with the \'visudo\' command as root". After a syntax error, visudo\'s [whatnow()](' + VISUDO_C + '#L918-L949) asks `What now?`: `e` edits again, `x` exits without saving, `Q` saves anyway, marked `(DANGER!)`.'
		]
	},
	tradeoff: {
		gain: [
			'A rule like `deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart shop.service` lets CI do one thing as root, with no root password or SSH key for root.',
			'Every sudo call is logged with the user and the command, and refusals print the exact command that was refused.',
			'A file per rule in `/etc/sudoers.d/` can be added or removed by a config tool without touching `/etc/sudoers`.'
		],
		cost: [
			'A rule that allows `ALL`, an editor or a shell gives full root: the user can start a root shell from that command.',
			'Exact argument matching is strict: `restart shop` and `restart shop.service` are different commands to sudo.',
			'A file name with a dot in `/etc/sudoers.d/` is skipped without a warning, so the rule seems to vanish.'
		]
	},
	task: {
		prompt: 'Read these lines and answer. `/etc/passwd`: `www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin`. `/etc/group`: `sudo:x:27:alice,bob`. `/etc/sudoers.d/backup`: `backup ALL=(root) NOPASSWD: /usr/bin/rsync -a /srv/ /mnt/backup/`. (1) What do the 7 fields of the passwd line say? (2) Who may run any command as root? (3) May `backup` run `sudo rsync -a /srv/ /tmp/x/`? (4) Which command checks the sudoers file after your edit?',
		hint: 'passwd(5) lists the fields as `name:password:UID:GID:GECOS:directory:shell`. Arguments in a sudoers rule must match.',
		answer: [
			'(1) Name `www-data`, password `x` (the hash is in `/etc/shadow`), UID 33, GID 33, comment `www-data`, home `/var/www`, shell `/usr/sbin/nologin`, so nobody can log in to it with a shell.',
			'(2) `alice` and `bob`, if `/etc/sudoers` has `%sudo ALL=(ALL:ALL) ALL` as on Debian. They are in group `sudo` (GID 27). They type their own password.',
			'(3) No. The rule lists the arguments `-a /srv/ /mnt/backup/`, and `/tmp/x/` does not match, so sudo prints `Sorry, user backup is not allowed to execute ...`.',
			'(4) `visudo -c` checks `/etc/sudoers` and its includes. `visudo -c -f /etc/sudoers.d/backup` checks one file and prints `parsed OK` or the line and column of the error.'
		],
		steps: [
			{
				title: 'Read the passwd line',
				questions: [
					{ q: 'In `www-data:x:33:33:...`, what is the `x` in the second field?', options: ['The password is empty', 'The account is locked forever', 'The password hash is kept in `/etc/shadow`', 'The user may run setuid programs'], answer: 2, why: 'The second field is the password, and `x` points to `/etc/shadow`, where the hash lives.' },
					{ q: 'Which fields are the UID and the GID?', options: ['The third and the fourth: 33 and 33', 'The first and the second', 'The fifth and the sixth', 'Only the third: UID and GID share it'], answer: 0, why: 'passwd(5) lists `name:password:UID:GID:GECOS:directory:shell`.' },
					{ q: 'What do `/var/www` and `/usr/sbin/nologin` say?', options: ['The web root and the web server binary', 'The log folder and the log rotator', 'The home directory and the login shell', 'The mount point and its type'], answer: 2, why: 'The sixth field is the home directory, the seventh the program run at login.' },
					{ q: 'UID 33 is below 1000. What does that suggest about `www-data`?', options: ['It has root rights', 'It is a system user, made for a daemon', 'It cannot own files', 'It cannot be in a group'], answer: 1, why: '`useradd --system` picks UIDs below the first regular UID, 1000 by default. Such accounts run daemons such as the web server.' }
				]
			},
			{
				title: 'Read the group line',
				questions: [
					{ q: 'In `sudo:x:27:alice,bob`, what does the last field list?', options: ['The users allowed to edit the group', 'The group\'s administrators only', 'The users who were removed', 'The members of the group'], answer: 3, why: 'The last field of a group line is its member list: `alice` and `bob`.' },
					{ q: 'Does being in group `sudo` give root rights by itself?', options: ['Only if `/etc/sudoers` has a `%sudo` rule, as on Debian', 'Yes, on every Linux system', 'Yes, because GID 27 is a system group', 'No, never: only UID 0 can use sudo'], answer: 0, why: 'The group is just a name. Debian\'s packaged sudoers enables `%sudo ALL=(ALL:ALL) ALL`, and that rule gives the right.' },
					{ q: 'What does `%` mean in `%sudo ALL=(ALL:ALL) ALL`?', options: ['A comment', 'A wildcard for any user', 'A group name follows', 'The rule needs no password'], answer: 2, why: '`%` marks a group, so the rule applies to every member of `sudo`.' },
					{ q: 'Under that rule, whose password do alice and bob type?', options: ['Root\'s password', 'Their own password', 'No password at all', 'The password of group `sudo`'], answer: 1, why: 'Without `NOPASSWD:`, sudo asks for the calling user\'s own password, then skips the prompt for 5 minutes.' }
				]
			},
			{
				title: 'Match the backup rule',
				questions: [
					{ q: 'The rule lists `/usr/bin/rsync -a /srv/ /mnt/backup/`. What must `backup` type for it to match?', options: ['Any `rsync` command', 'Any command starting with `rsync -a`', '`rsync` with any destination under `/mnt`', 'Exactly `rsync -a /srv/ /mnt/backup/`'], answer: 3, why: 'When a rule lists arguments, the user\'s arguments must match them.' },
					{ q: 'Does `sudo rsync -a /srv/ /tmp/x/` match?', options: ['No: `/tmp/x/` is not `/mnt/backup/`', 'Yes: the program is the same', 'Yes: `NOPASSWD:` allows any arguments', 'Only after a password prompt'], answer: 0, why: 'The destination differs, so no rule matches.' },
					{ q: 'What does sudo print then?', options: ['`backup is not in the sudoers file.`', '`Sorry, user backup is not allowed to execute ...`', '`syntax error`', '`Permission denied`'], answer: 1, why: 'The user has rules, but none matches this command line, so sudo names the refused command.' },
					{ q: 'Why does the rule pin the arguments at all?', options: ['sudo needs arguments to find the binary', 'It makes the rule faster to parse', 'So the account can do exactly one thing as root', 'NOPASSWD only works with arguments'], answer: 2, why: 'Like the `deploy` rule for CI, a pinned rule gives one task as root, with no root password or root shell.' }
				]
			},
			{
				title: 'Check the file',
				questions: [
					{ q: 'Which command checks `/etc/sudoers` and every file it includes?', options: ['`sudo -l`', '`visudo -c`', '`sudoedit /etc/sudoers`', '`cat /etc/sudoers`'], answer: 1, why: '`visudo -c` parses the main file and its includes without opening an editor.' },
					{ q: 'And one file only?', options: ['`visudo -c -f /etc/sudoers.d/backup`', '`visudo /etc/sudoers.d/backup -n`', '`sudo -c /etc/sudoers.d/backup`', '`bash -n /etc/sudoers.d/backup`'], answer: 0, why: 'It prints `parsed OK`, or the line and column of the error and exit status 1.' },
					{ q: 'You forget the colon after `NOPASSWD`. What does `visudo -c -f` print?', options: ['`parsed OK`, the colon is optional', 'A warning, then it installs the file', 'Nothing, and exits with 0', '`<file>:1:<column>: syntax error`'], answer: 3, why: 'The hook shows it: `bad.sudoers:1:67: syntax error`, exit 1.' },
					{ q: 'Your editor left a copy named `/etc/sudoers.d/backup~`. Does sudo read it?', options: ['Yes, after `backup`', 'Yes, instead of `backup`', 'No: sudo skips names that end in `~`', 'Only if `visudo -c` passes'], answer: 2, why: 'sudo skips file names in `/etc/sudoers.d` that end in `~` or contain a `.`, so editor backups never become rules.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'You create `/etc/sudoers.d/ci.rules` with a valid rule for user `ci`. `sudo` still says `ci is not in the sudoers file.` Why?',
			options: [
				'sudo reads `/etc/sudoers.d` only after a reboot',
				'sudo skips file names in `/etc/sudoers.d` that contain a dot',
				'Files in `/etc/sudoers.d` must have mode `0755` to be read',
				'The user `ci` must also be added to the `sudo` group'
			],
			answer: 1,
			why: 'The `@includedir` directive reads each file in the directory but skips names that end in `~` or contain a `.`, to avoid package manager and editor backup files. Rename it to `/etc/sudoers.d/ci`.'
		},
		{
			q: 'A user has two matching rules: `alice ALL=(ALL) NOPASSWD: ALL` first, then `%sudo ALL=(ALL:ALL) ALL`, and Alice is in `sudo`. Is she asked for a password?',
			options: [
				'No, because the first matching rule wins',
				'No, because `NOPASSWD:` overrides any other rule',
				'Yes, because the last matching rule is the one used',
				'Yes, because group rules always come before user rules'
			],
			answer: 2,
			why: 'sudoers(5): when multiple entries match, "the last match is used (which is not necessarily the most specific match)". The `%sudo` line comes later, so its default of asking for a password applies.'
		},
		{
			q: 'Why does `www-data` have `/usr/sbin/nologin` as its shell?',
			options: [
				'So that nobody can get an interactive shell as that account',
				'So that nginx can start without reading `/etc/passwd`',
				'Because UIDs below 1000 cannot own any files',
				'Because the kernel refuses `execve()` for system users'
			],
			answer: 0,
			why: 'The last field of a passwd line is the program run at login. `nologin` prints a message and exits, so the account can own files and run a daemon, but a login as `www-data` gives no shell. The kernel treats UID 33 like any other non-zero UID.'
		}
	],
	lab: {
		minutes: 10,
		goal: 'Read real account lines on your machine and catch a sudoers syntax error with `visudo` before it can lock you out, all without root.',
		steps: [
			'Read the task\'s lines on your own system: `getent passwd www-data`, `getent group sudo` (on Fedora, try `getent group wheel`), and `id`.',
			'Look at why sudo can act as root: `stat -c "%a %U %n" /usr/bin/sudo`. On macOS, use `ls -l /usr/bin/sudo`.',
			'In a scratch folder, write a good rule: `printf \'backup ALL=(root) NOPASSWD: /usr/bin/rsync -a /srv/ /mnt/backup/\\n\' > good`.',
			'Write the same rule without the colon after `NOPASSWD`: `printf \'backup ALL=(root) NOPASSWD /usr/bin/rsync -a /srv/ /mnt/backup/\\n\' > bad`.',
			'Check both with `visudo -c -f good; echo $?` and `visudo -c -f bad; echo $?`. If `visudo` is not found, call it as `/usr/sbin/visudo`. Then `rm good bad`.'
		],
		done: [
			'`getent passwd www-data` prints 7 fields ending in `/usr/sbin/nologin`, if the account exists on your system.',
			'`stat` prints `4755 root /usr/bin/sudo`.',
			'`visudo -c -f good` prints `good: parsed OK` and exit status 0.',
			'`visudo -c -f bad` prints `bad:1:64: syntax error`, a `^` at the end of the line, and exit status 1.'
		],
		solution: [
			'`4755` is the setuid bit (4) plus `rwxr-xr-x`: sudo runs with its owner\'s UID, 0, whoever starts it.',
			'The caret sits at column 64, the end of the line, not under `NOPASSWD`: visudo only gives up when the line ends, so read the whole line to find the missing `:`. A file like `bad` installed by hand in `/etc/sudoers.d/` would stop sudo from parsing its rules.',
			'`visudo -c -f` only reads the file, so it works as a normal user on a scratch copy. Check a rule this way before you put it in `/etc/sudoers.d/`, under a name with no dot.'
		]
	},
	recall: {
		q: 'Name two reasons a correct-looking sudoers rule for `deploy` can be refused.',
		a: 'The file is in `/etc/sudoers.d/` with a dot in its name, like `deploy.conf`, so sudo skips it. Or the rule lists arguments, such as `restart shop.service`, and the command typed has different ones, such as `restart shop`.'
	},
	sources: [
		{ title: 'sudoers(5)', url: 'https://www.sudo.ws/docs/man/sudoers.man/' },
		{ title: 'visudo(8)', url: 'https://www.sudo.ws/docs/man/visudo.man/' },
		{ title: 'passwd(5)', url: 'https://man7.org/linux/man-pages/man5/passwd.5.html' },
		{ title: 'login.defs(5)', url: 'https://man7.org/linux/man-pages/man5/login.defs.5.html' },
		{ title: 'capabilities(7)', url: 'https://man7.org/linux/man-pages/man7/capabilities.7.html' },
		{ title: 'sudo source, plugins/sudoers/logging.c', url: LOGGING_C }
	]
};
