/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'xargs',
	part: 'The shell',
	title: 'xargs',
	minutes: 10,
	hook: [
		'The disk of a build server is at 97%. `find` and `grep` give you lists of file names, one per line, but `rm`, `gzip` and `cp` want the names as arguments. `xargs` reads the list on standard input and builds those command lines for you.',
		'The reps use one folder. `logs/` holds `api.log` (3 lines, one of them `FATAL db down`), `web.log` (2 lines), `old report.log`, `stale.tmp` and `cache 1.tmp`; 2 of those names contain a space. `files.txt` lists `logs/api.log` and `logs/web.log`, one per line. `paths.txt` lists 3 full paths: `/var/log/nginx/access.log`, `/var/log/nginx/error.log` and `/var/log/syslog`. `hosts.txt` lists `web1`, `web2` and `db1`.'
	],
	terms: [
		{ term: 'item', def: 'One word `xargs` reads from standard input. By default, blanks and newlines separate items, so `cache 1.tmp` gives 2 items.' },
		{ term: 'null character', def: 'The byte with value 0. `find -print0` and `xargs -0` use it to separate file names, so a space or a newline inside a name stays part of the name.' },
		{ term: '-print0', def: 'A `find` action that prints each file name followed by a null character instead of a newline.' }
	],
	reps: [
		{
			prompt: 'Print the 3 host names of `hosts.txt` on one line, separated by spaces.',
			accept: ['xargs < hosts.txt', 'cat hosts.txt | xargs', 'xargs echo < hosts.txt', 'cat hosts.txt | xargs echo', '< hosts.txt xargs', 'xargs -a hosts.txt', 'xargs <hosts.txt'],
			why: 'With no command, `xargs` runs `echo` with every item as an argument. The output is `web1 web2 db1`.'
		},
		{
			prompt: 'Count the lines of each file listed in `files.txt` with a single `wc -l` call.',
			accept: [
				'xargs wc -l < files.txt',
				'cat files.txt | xargs wc -l',
				'< files.txt xargs wc -l',
				'xargs wc -l <files.txt',
				'xargs -a files.txt wc -l',
				'xargs --arg-file=files.txt wc -l'
			],
			why: '`xargs` appends the items after `wc -l`, so it runs `wc -l logs/api.log logs/web.log`. `wc` prints 3 lines: one count per file and a `total` line.'
		},
		{
			prompt: 'Delete the files listed in `files.txt` and print the `rm` command on standard error before it runs.',
			accept: ['xargs -t rm < files.txt', 'cat files.txt | xargs -t rm', 'xargs --verbose rm < files.txt', 'xargs -a files.txt -t rm', '< files.txt xargs -t rm', 'xargs -t -a files.txt rm'],
			why: '`-t` prints `rm logs/api.log logs/web.log` on standard error, then runs it. Use it to see what `xargs` builds before you trust it with `rm`.'
		},
		{
			prompt: 'Print the file name of each path in `paths.txt` with `basename`, which takes one path per call.',
			accept: [
				'xargs -n 1 basename < paths.txt',
				'xargs -n1 basename < paths.txt',
				'cat paths.txt | xargs -n 1 basename',
				'cat paths.txt | xargs -n1 basename',
				'xargs --max-args=1 basename < paths.txt',
				'xargs -L 1 basename < paths.txt',
				'xargs -a paths.txt -n 1 basename',
				'< paths.txt xargs -n 1 basename'
			],
			why: '`-n 1` puts at most 1 item on each command line, so `basename` runs 3 times and prints `access.log`, `error.log`, `syslog`. Without it, `xargs` runs `basename` once with 3 paths and `basename` stops with `extra operand`.'
		},
		{
			prompt: 'Copy each file listed in `files.txt` to the same name with `.bak` appended, such as `logs/api.log.bak`.',
			accept: [
				'xargs -I {} cp {} {}.bak < files.txt',
				'xargs -I{} cp {} {}.bak < files.txt',
				'cat files.txt | xargs -I {} cp {} {}.bak',
				'cat files.txt | xargs -I{} cp {} {}.bak',
				"xargs -I '{}' cp '{}' '{}'.bak < files.txt",
				'xargs -I % cp % %.bak < files.txt',
				'xargs -a files.txt -I {} cp {} {}.bak',
				'< files.txt xargs -I {} cp {} {}.bak'
			],
			why: '`-I {}` runs the command once per input line and replaces each `{}` with that line. The first run is `cp logs/api.log logs/api.log.bak`.'
		},
		{
			prompt: 'Delete every `.tmp` file under `logs/`, including `cache 1.tmp`, whose name has a space.',
			accept: [
				"find logs -name '*.tmp' -print0 | xargs -0 rm",
				'find logs -name "*.tmp" -print0 | xargs -0 rm',
				'find logs -name \\*.tmp -print0 | xargs -0 rm',
				"find logs -name '*.tmp' -print0 | xargs --null rm",
				"find logs -name '*.tmp' -print0 | xargs -0 rm -f",
				"find logs/ -name '*.tmp' -print0 | xargs -0 rm",
				"find logs -type f -name '*.tmp' -print0 | xargs -0 rm",
				"find logs -name '*.tmp' -type f -print0 | xargs -0 rm"
			],
			why: '`-print0` ends each name with a null character and `-0` makes `xargs` split on that character only, so `logs/cache 1.tmp` stays one item. With plain `| xargs rm`, `rm` gets `logs/cache` and `1.tmp` and finds neither.'
		},
		{
			prompt: 'Gzip the `.log` files directly in `logs/` that contain `FATAL`. When none of them match, do not run `gzip` at all.',
			accept: [
				'grep -l FATAL logs/*.log | xargs -r gzip',
				"grep -l 'FATAL' logs/*.log | xargs -r gzip",
				'grep -l "FATAL" logs/*.log | xargs -r gzip',
				'grep -l FATAL logs/*.log | xargs --no-run-if-empty gzip',
				'grep -l FATAL logs/*.log|xargs -r gzip'
			],
			why: '`grep -l` prints `logs/api.log` and `xargs` runs `gzip logs/api.log`. `-r` skips the run when the input is empty; without it, GNU `xargs` runs `gzip` once with no file name.'
		},
		{
			prompt: 'Gzip every `.log` file under `logs/`, one file per `gzip` call and 4 calls at a time. Some names contain a space.',
			accept: [
				"find logs -name '*.log' -print0 | xargs -0 -P 4 -n 1 gzip",
				"find logs -name '*.log' -print0 | xargs -0 -n 1 -P 4 gzip",
				"find logs -name '*.log' -print0 | xargs -0 -P4 -n1 gzip",
				"find logs -name '*.log' -print0 | xargs -0 -n1 -P4 gzip",
				"find logs -name '*.log' -print0 | xargs -P 4 -n 1 -0 gzip",
				"find logs -name '*.log' -print0 | xargs -n 1 -P 4 -0 gzip",
				'find logs -name "*.log" -print0 | xargs -0 -P 4 -n 1 gzip',
				"find logs -name '*.log' -print0 | xargs --null --max-procs=4 --max-args=1 gzip"
			],
			why: '`-P 4` lets `xargs` run up to 4 `gzip` processes at once. `-n 1` gives each process one file; without `-n`, all 3 names fit on one command line and only one `gzip` runs.'
		}
	],
	quiz: [],
	recall: {
		q: 'Why does `find logs -name \'*.tmp\' | xargs rm` fail on `logs/cache 1.tmp`, and which 2 flags fix it?',
		a: '`xargs` splits items on blanks, so `rm` gets `logs/cache` and `1.tmp`. `find -print0` with `xargs -0` separates names with a null character instead.'
	},
	sources: [
		{ title: 'xargs(1)', url: 'https://man7.org/linux/man-pages/man1/xargs.1.html' },
		{ title: 'find(1): -print0', url: 'https://man7.org/linux/man-pages/man1/find.1.html' }
	]
};
