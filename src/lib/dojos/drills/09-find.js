/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'find',
	part: 'The shell',
	title: 'Finding files',
	minutes: 10,
	hook: [
		'The disk of the `shop` server is 97% full, and the app stops writing orders when it reaches 100%. You have a shell in `~/shop` and GNU `find`. You want to know which files take the space, which logs are old, and what you can delete safely.',
		'`~/shop` holds `README.md`, `docs/readme.txt` and 4 directories. `logs/` has `app.log` (3 MB), `app.log.1` (240 MB) and `worker.log` (2 MB, last written 35 days ago), plus `logs/old/2026-08-30.log` and `logs/old/2026-08-31.log` (1 MB each, written 48 and 47 days ago). `src/` has `index.js` (3 lines), `cart.js` (2 lines) and `cart.test.js` (1 line). `tmp/` has `cache-1.tmp`, `cache-2.tmp`, `cache-3.tmp` and a 150 MB `upload-7f3a.bin`. Every other file was written today. Every rep runs in `~/shop`, starting from this state.'
	],
	terms: [
		{ term: 'starting point', def: 'The directory you give `find` first, such as `.` or `logs`. It searches that directory and everything below it.' },
		{ term: 'test', def: 'A condition such as `-name` or `-size` that is true or false for each file. `find` prints a file only if every test is true.' },
		{ term: 'glob', def: 'A shell pattern where `*` matches any characters and `?` matches one, such as `*.log`.' }
	],
	reps: [
		{
			prompt: 'List every file below `.` whose name ends in `.log`.',
			accept: [
				"find . -name '*.log'",
				'find . -name "*.log"',
				'find . -name \\*.log',
				"find -name '*.log'",
				'find -name "*.log"',
				"find . -type f -name '*.log'",
				'find . -type f -name "*.log"',
				"find . -name '*.log' -type f",
				'find . -name "*.log" -type f'
			],
			why: '`-name \'*.log\'` matches the glob against the file name without its directories. The quotes stop the shell from expanding `*.log` itself. `app.log.1` is not listed, because its name ends in `.1`.'
		},
		{
			prompt: 'List `README.md` and `docs/readme.txt` with one test: names that start with `readme` in any case.',
			accept: [
				"find . -iname 'readme*'",
				'find . -iname "readme*"',
				"find . -iname 'README*'",
				'find . -iname "README*"',
				"find -iname 'readme*'",
				'find -iname "readme*"'
			],
			why: '`-iname` works like `-name` but ignores case, so `readme*` matches both `README.md` and `readme.txt`.'
		},
		{
			prompt: 'List every directory below `.`, and `.` itself.',
			accept: ['find . -type d', 'find -type d'],
			why: '`-type d` is true only for directories. The output includes `.` because `find` tests the starting point too, then lists the 5 directories below it.'
		},
		{
			prompt: 'List the files bigger than 100 MiB.',
			accept: [
				'find . -size +100M',
				'find -size +100M',
				'find . -type f -size +100M',
				'find . -size +100M -type f',
				'find -type f -size +100M',
				'find -size +100M -type f'
			],
			why: '`-size +100M` is true when the size, rounded up to whole MiB, is more than 100. It finds `./logs/app.log.1` and `./tmp/upload-7f3a.bin`. The `+` means more than; `-100M` would mean less than.'
		},
		{
			prompt: 'List the files in `logs` and its subdirectories that were last modified more than 30 days ago.',
			accept: [
				'find logs -mtime +30',
				'find logs -type f -mtime +30',
				'find logs -mtime +30 -type f',
				'find logs/ -mtime +30',
				'find ./logs -mtime +30',
				'find logs/ -type f -mtime +30',
				'find ./logs -type f -mtime +30'
			],
			why: '`-mtime +30` counts whole 24-hour periods since the last change and is true above 30. It finds `worker.log` and the 2 files in `logs/old`.'
		},
		{
			prompt: 'List the `.log` files directly in `logs`, without going into `logs/old`.',
			accept: [
				"find logs -maxdepth 1 -name '*.log'",
				'find logs -maxdepth 1 -name "*.log"',
				"find logs -maxdepth 1 -type f -name '*.log'",
				'find logs -maxdepth 1 -type f -name "*.log"',
				"find logs/ -maxdepth 1 -name '*.log'",
				"find ./logs -maxdepth 1 -name '*.log'"
			],
			why: '`-maxdepth 1` stops 1 level below the starting point, so `find` lists `logs/app.log` and `logs/worker.log` and never reads `logs/old`. `-maxdepth 0` would test only `logs` itself.'
		},
		{
			prompt: 'Delete the 3 `.tmp` files in `tmp`, and nothing else.',
			accept: [
				"find tmp -name '*.tmp' -delete",
				'find tmp -name "*.tmp" -delete',
				"find tmp -type f -name '*.tmp' -delete",
				'find tmp -type f -name "*.tmp" -delete',
				"find tmp -name '*.tmp' -type f -delete",
				"find . -name '*.tmp' -delete",
				'find . -name "*.tmp" -delete'
			],
			why: '`find` reads the line from left to right, so `-delete` runs only on files that passed `-name \'*.tmp\'`. Placed first, as in `find tmp -delete -name \'*.tmp\'`, it would delete `upload-7f3a.bin` and `tmp` itself.'
		},
		{
			prompt: 'Count the lines of every `.js` file in `src` with a single run of `wc -l`, so you also get the total.',
			accept: [
				"find src -name '*.js' -exec wc -l {} +",
				'find src -name "*.js" -exec wc -l {} +',
				"find src -name '*.js' -exec wc -l '{}' +",
				"find src -type f -name '*.js' -exec wc -l {} +",
				'find src -type f -name "*.js" -exec wc -l {} +'
			],
			why: 'With `{} +`, `find` appends all the file names to one `wc -l` command line. `wc` prints one line per file and then `6 total`.'
		},
		{
			prompt: 'Compress with `gzip` each `.log` file in `logs` older than 30 days, running `gzip` once per file.',
			accept: [
				"find logs -name '*.log' -mtime +30 -exec gzip {} \\;",
				'find logs -name "*.log" -mtime +30 -exec gzip {} \\;',
				"find logs -name '*.log' -mtime +30 -exec gzip {} ';'",
				"find logs -mtime +30 -name '*.log' -exec gzip {} \\;",
				'find logs -mtime +30 -name "*.log" -exec gzip {} \\;',
				"find logs -type f -name '*.log' -mtime +30 -exec gzip {} \\;"
			],
			why: 'With `{} \\;`, `find` runs the command once for each file, putting the file name in place of `{}`. The backslash passes `;` to `find` instead of letting the shell end the command there. `gzip` replaces the 3 old logs with `worker.log.gz` and 2 more `.gz` files.'
		},
		{
			prompt: 'Delete the `.log` files in `logs` and its subdirectories that are older than 30 days.',
			accept: [
				"find logs -name '*.log' -mtime +30 -delete",
				'find logs -name "*.log" -mtime +30 -delete',
				"find logs -mtime +30 -name '*.log' -delete",
				'find logs -mtime +30 -name "*.log" -delete',
				"find logs -type f -name '*.log' -mtime +30 -delete",
				"find logs -type f -mtime +30 -name '*.log' -delete"
			],
			why: 'Both tests must be true before `-delete` runs, so `find` deletes `worker.log` and the 2 files in `logs/old`. `app.log` stays because it is recent, and `app.log.1` stays because its name does not match `*.log`.'
		}
	],
	quiz: [],
	recall: {
		q: 'Why must `-delete` come last in `find tmp -name \'*.tmp\' -delete`?',
		a: '`find` evaluates the line from left to right. Placed first, `-delete` runs before `-name` is tested and deletes every file below `tmp`, then `tmp` itself.'
	},
	sources: [{ title: 'find(1), GNU findutils manual page', url: 'https://man7.org/linux/man-pages/man1/find.1.html' }]
};
