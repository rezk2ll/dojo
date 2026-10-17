/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'permissions',
	part: 'The shell',
	title: 'Permissions',
	minutes: 10,
	hook: [
		'You copied a small shop app to the server and its cron job fails with `./deploy.sh: Permission denied`. The app, running as the user `www-data`, cannot write its log either. The database password sits in a file that every user on the server can read. You are logged in as root, in `/srv/shop`.',
		'`deploy.sh` and `config/db.env` are both `-rw-r--r--`, owned by `alice:alice`. `releases/` and `releases/v1/` are `drwx------` and `releases/v1/app.js` is `-rw-------`, all owned by `alice:alice`. `logs/app.log` is `-rw-r--r--`, owned by `root:root`.',
		'The group `deploy` exists and alice is in it. The user `www-data` has a login group with the same name. Each rep starts from these files.'
	],
	terms: [
		{ term: 'mode', def: 'The 9 permission bits of a file: read, write and execute for the owner, for the group, and for everyone else (others).' },
		{ term: 'octal mode', def: 'The mode written as digits, one per class, each the sum of read (4), write (2) and execute (1). `640` is `rw-r-----`.' },
		{ term: 'symbolic mode', def: 'The mode written as who, an operator and letters, such as `u+x` or `go-rwx`. It changes only the bits it names.' },
		{ term: 'umask', def: 'A mask kept by the shell. Each bit set in it is turned off on files and directories that the shell’s commands create.' }
	],
	reps: [
		{
			prompt: 'Show `deploy.sh` in the long format of `ls`, with its mode and owner.',
			accept: ['ls -l deploy.sh', 'ls -l ./deploy.sh'],
			why: '`-l` is the long format. The first character is the file type (`-` for a regular file), then 3 groups of `rwx` for owner, group and others, then the number of hard links, the owner, the group, the size in bytes and the modification time. `-rw-r--r--` has no `x` at all, which is why the kernel refuses to run the script.'
		},
		{
			prompt: 'Show the long listing of the directory `releases` itself, not of the files inside it.',
			accept: ['ls -ld releases', 'ls -dl releases', 'ls -l -d releases', 'ls -d -l releases', 'ls -ld releases/', 'ls -dl releases/', 'ls -l --directory releases', 'ls --directory -l releases'],
			why: '`-d` lists the directory as one entry instead of its contents, and `-l` gives the long format. Here it prints `drwx------`: `d` for a directory, and only the owner can list it or enter it.'
		},
		{
			prompt: 'Let the owner run `deploy.sh`. Change no other bit.',
			accept: ['chmod u+x deploy.sh', 'chmod u+x ./deploy.sh'],
			why: '`u` is the owner, `+` adds bits, `x` is execute. The mode goes from `rw-r--r--` to `rwxr--r--`. A plain `chmod +x` would add `x` for all 3 classes, minus the bits set in the umask.'
		},
		{
			prompt: 'With an octal mode, set `deploy.sh` to `rwxr-xr-x`.',
			accept: ['chmod 755 deploy.sh', 'chmod 0755 deploy.sh', 'chmod 755 ./deploy.sh'],
			why: 'Each digit adds read (4), write (2) and execute (1) for one class. Owner `rwx` is 4+2+1 = 7, group `r-x` is 4+1 = 5, others `r-x` is 5. An octal mode sets all 9 bits at once, whatever they were before.'
		},
		{
			prompt: 'With an octal mode, make `config/db.env` readable and writable by its owner and by no one else.',
			accept: ['chmod 600 config/db.env', 'chmod 0600 config/db.env', 'chmod 600 ./config/db.env'],
			why: '`6` is read (4) plus write (2) for the owner, and the two `0` digits give the group and others nothing. `ls -l` then shows `-rw-------`.'
		},
		{
			prompt: 'With a symbolic mode, remove every permission of the group and others on `config/db.env`, so that the owner keeps `rw-`.',
			accept: [
				'chmod go-rwx config/db.env',
				'chmod og-rwx config/db.env',
				'chmod go= config/db.env',
				'chmod og= config/db.env',
				'chmod g-rwx,o-rwx config/db.env',
				'chmod o-rwx,g-rwx config/db.env',
				'chmod g=,o= config/db.env',
				'chmod o=,g= config/db.env'
			],
			why: '`go` selects the group and others, and `-rwx` removes read, write and execute from both. `go=` does the same: `=` sets exactly the letters that follow, and here there are none. The owner keeps `rw-`, so the file ends as `600`.'
		},
		{
			prompt: 'Recursively, let the group read every file under `releases` and enter every directory, without making plain files executable.',
			accept: [
				'chmod -R g+rX releases',
				'chmod -R g+Xr releases',
				'chmod -R g+rX releases/',
				'chmod --recursive g+rX releases',
				'chmod --recursive g+Xr releases',
				'chmod g+rX -R releases',
				'chmod -R g+r,g+X releases'
			],
			why: '`-R` walks the whole tree. Capital `X` adds execute only to directories and to files that already have an `x` for someone, so `releases/v1/` gets `r-x` for the group and `app.js` gets `r--`.'
		},
		{
			prompt: 'Make `www-data` the owner of `logs/app.log`, and `www-data` its group.',
			accept: ['chown www-data:www-data logs/app.log', 'chown www-data: logs/app.log', 'chown www-data:www-data ./logs/app.log'],
			why: '`chown OWNER:GROUP` sets both in one call. With `www-data:` and no group after the colon, chown uses that user’s login group, which is also `www-data` here.'
		},
		{
			prompt: 'Change only the group of `releases` and everything under it to `deploy`.',
			accept: [
				'chgrp -R deploy releases',
				'chgrp --recursive deploy releases',
				'chgrp -R deploy releases/',
				'chown -R :deploy releases',
				'chown --recursive :deploy releases',
				'chown -R :deploy releases/'
			],
			why: '`chgrp deploy` changes the group and leaves the owner `alice`. `chown :deploy` does the same, because an owner left out before the colon stays unchanged. `-R` applies it to every file and directory in the tree.'
		},
		{
			prompt: 'Set this shell’s umask so that new files come out as `rw-r-----` and new directories as `rwxr-x---`.',
			accept: ['umask 027', 'umask 0027', 'umask u=rwx,g=rx,o='],
			why: 'The umask lists the bits to turn off: `0` keeps everything for the owner, `2` removes write for the group, `7` removes all for others. After it, `touch new.txt` makes a `640` file and `mkdir newdir` a `750` directory. It sets the mask of the current shell only.'
		},
		{
			prompt: 'Print only the octal mode of `config/db.env`, such as `644`.',
			accept: [
				'stat -c %a config/db.env',
				"stat -c '%a' config/db.env",
				'stat -c "%a" config/db.env',
				'stat --format=%a config/db.env',
				"stat --format='%a' config/db.env",
				'stat --format="%a" config/db.env',
				'stat --format %a config/db.env'
			],
			why: '`-c` gives stat a format string instead of its long default report. `%a` is the permission bits in octal, so this prints `644` before your fix and `600` after.'
		},
		{
			prompt: 'Print the owner name and group name of `logs/app.log`, joined by a colon, such as `root:root`.',
			accept: [
				'stat -c %U:%G logs/app.log',
				"stat -c '%U:%G' logs/app.log",
				'stat -c "%U:%G" logs/app.log',
				'stat --format=%U:%G logs/app.log',
				"stat --format='%U:%G' logs/app.log",
				'stat --format="%U:%G" logs/app.log',
				'stat --format %U:%G logs/app.log'
			],
			why: '`%U` is the user name of the owner and `%G` the group name. Any other text in the format, here the `:`, is printed as it is.'
		}
	],
	quiz: [],
	recall: {
		q: 'In `chmod 640 config/db.env`, what does each of the 3 digits give, and to whom?',
		a: '6 = read (4) + write (2) for the owner, 4 = read for the group, 0 = nothing for others: `rw-r-----`.'
	},
	sources: [
		{ title: 'chmod(1) man page', url: 'https://man7.org/linux/man-pages/man1/chmod.1.html' },
		{ title: 'chown(1) man page', url: 'https://man7.org/linux/man-pages/man1/chown.1.html' },
		{ title: 'stat(1) man page', url: 'https://man7.org/linux/man-pages/man1/stat.1.html' },
		{ title: 'ls(1) man page', url: 'https://man7.org/linux/man-pages/man1/ls.1.html' },
		{ title: 'umask(1p) man page, POSIX', url: 'https://man7.org/linux/man-pages/man1/umask.1p.html' },
		{ title: 'umask(2) man page', url: 'https://man7.org/linux/man-pages/man2/umask.2.html' }
	]
};
