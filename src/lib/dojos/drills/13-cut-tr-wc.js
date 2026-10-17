/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'cut-tr-wc',
	part: 'The shell',
	title: 'Cutting columns',
	minutes: 10,
	hook: [
		'You are on a server with no Python and no spreadsheet. Someone asks which accounts log in with a real shell, how many lines the app wrote today, and why the CSV import fails on every row. `cut`, `tr`, `wc`, `head` and `tail` answer each question with one line.',
		'The reps use 5 files. `passwd.txt` has 4 lines in the `/etc/passwd` format, 7 fields split by `:`, such as `deploy:x:1001:1001:Deploy User:/home/deploy:/bin/bash`. `app.log` has 200 lines like `2026-10-17T09:00:01 INFO request id=1`. `users.csv` has a `name,email` header and 3 rows. `export.csv` has the same kind of rows, but each line ends with a carriage return before the newline (CRLF). `ps.txt` has 3 lines of `name pid cpu`, padded with several spaces, such as `nginx     1201  0.5`.'
	],
	terms: [
		{ term: 'delimiter', def: 'The character that separates fields on a line, such as `:` in `passwd.txt`. `cut -d` sets it; the default is a tab.' },
		{ term: 'CRLF', def: 'A line ending made of a carriage return (`\\r`) and a newline (`\\n`). `cut` splits lines on the newline only, so the `\\r` stays at the end of the last field.' },
		{ term: 'follow', def: 'What `tail -f` does: it prints the last lines, then keeps the file open and prints new lines as they are appended.' }
	],
	reps: [
		{
			prompt: 'Print only the user names from `passwd.txt`, the 1st field.',
			accept: [
				'cut -d: -f1 passwd.txt',
				'cut -d : -f1 passwd.txt',
				"cut -d ':' -f1 passwd.txt",
				"cut -d':' -f1 passwd.txt",
				'cut -d: -f 1 passwd.txt',
				'cut -d : -f 1 passwd.txt',
				'cut -f1 -d: passwd.txt',
				'cut --delimiter=: --fields=1 passwd.txt'
			],
			why: '`-d:` makes `:` the delimiter and `-f1` keeps field 1. The output is `root`, `daemon`, `www-data`, `deploy`.'
		},
		{
			prompt: 'Print the user name and the login shell (the 7th field) of each line of `passwd.txt`.',
			accept: [
				'cut -d: -f1,7 passwd.txt',
				'cut -d : -f1,7 passwd.txt',
				"cut -d ':' -f1,7 passwd.txt",
				"cut -d':' -f1,7 passwd.txt",
				'cut -d: -f 1,7 passwd.txt',
				'cut -f1,7 -d: passwd.txt',
				'cut --delimiter=: --fields=1,7 passwd.txt'
			],
			why: '`-f1,7` keeps fields 1 and 7, and `cut` joins them with the input delimiter. The last line prints `deploy:/bin/bash`.'
		},
		{
			prompt: 'Print only the timestamp of each line of `app.log`: its first 19 characters.',
			accept: ['cut -c1-19 app.log', 'cut -c 1-19 app.log', 'cut -c-19 app.log', 'cut -c -19 app.log', 'cut --characters=1-19 app.log'],
			why: '`-c1-19` keeps characters 1 to 19 of each line, both included. The first line prints `2026-10-17T09:00:01`.'
		},
		{
			prompt: '`tr` takes no file name. Print `passwd.txt` in upper case.',
			accept: [
				'tr a-z A-Z < passwd.txt',
				"tr 'a-z' 'A-Z' < passwd.txt",
				"tr '[:lower:]' '[:upper:]' < passwd.txt",
				'tr "[:lower:]" "[:upper:]" < passwd.txt',
				'cat passwd.txt | tr a-z A-Z',
				"cat passwd.txt | tr 'a-z' 'A-Z'",
				"cat passwd.txt | tr '[:lower:]' '[:upper:]'",
				'< passwd.txt tr a-z A-Z'
			],
			why: '`tr` reads standard input only, so `< passwd.txt` feeds it the file. It maps each character of `a-z` to the character at the same place in `A-Z`.'
		},
		{
			prompt: 'Remove the carriage returns from `export.csv` and write the result to `clean.csv`.',
			accept: [
				"tr -d '\\r' < export.csv > clean.csv",
				'tr -d "\\r" < export.csv > clean.csv',
				"cat export.csv | tr -d '\\r' > clean.csv",
				"tr -d '\\015' < export.csv > clean.csv",
				"tr -d '\\r' <export.csv >clean.csv",
				"tr --delete '\\r' < export.csv > clean.csv"
			],
			why: '`-d` deletes every character in the set instead of translating it, and `\\r` is the carriage return. `clean.csv` gets the same 3 lines ending in a plain newline.'
		},
		{
			prompt: 'Print the pid column (2nd) of `ps.txt`. Squeeze the runs of spaces first, then cut on a single space.',
			accept: [
				"tr -s ' ' < ps.txt | cut -d' ' -f2",
				"tr -s ' ' < ps.txt | cut -d ' ' -f2",
				"tr -s ' ' < ps.txt | cut -d ' ' -f 2",
				'tr -s " " < ps.txt | cut -d" " -f2',
				'tr -s " " < ps.txt | cut -d " " -f2',
				"cat ps.txt | tr -s ' ' | cut -d' ' -f2",
				"cat ps.txt | tr -s ' ' | cut -d ' ' -f2"
			],
			why: '`tr -s \' \'` replaces each run of spaces with one space, so `tr` prints `nginx 1201` for `nginx     1201`. `cut -d\' \' -f2` then prints `1201`, `884`, `97`. Without the squeeze, field 2 is the empty string between the first two spaces.'
		},
		{
			prompt: 'Count the lines of `app.log`.',
			accept: ['wc -l app.log', 'wc --lines app.log'],
			why: '`wc -l` counts newline characters and prints the count with the file name: `200 app.log`.'
		},
		{
			prompt: 'Print the first 5 lines of `app.log`.',
			accept: ['head -n 5 app.log', 'head -5 app.log', 'head -n5 app.log', 'head --lines=5 app.log'],
			why: '`-n 5` prints 5 lines instead of the default 10. `-5` is an obsolete spelling that GNU `head` still accepts when it comes first.'
		},
		{
			prompt: 'Print the last 20 lines of `app.log`.',
			accept: ['tail -n 20 app.log', 'tail -20 app.log', 'tail -n20 app.log', 'tail --lines=20 app.log'],
			why: '`tail -n 20` prints the last 20 lines, from `id=181` to `id=200`.'
		},
		{
			prompt: 'Print every line of `users.csv` except the header line.',
			accept: ['tail -n +2 users.csv', 'tail -n+2 users.csv', 'tail --lines=+2 users.csv'],
			why: 'With a `+`, `tail -n +2` starts at line 2 instead of counting from the end. It prints the 3 rows and skips `name,email`.'
		},
		{
			prompt: 'Show the end of `app.log` and keep printing new lines as the app writes them.',
			accept: ['tail -f app.log', 'tail --follow app.log'],
			why: '`-f` prints the last 10 lines and then waits for appended data. Press Ctrl+C to stop it.'
		},
		{
			prompt: 'Follow `app.log` and keep following when log rotation renames it and creates a new `app.log`.',
			accept: ['tail -F app.log', 'tail --follow=name --retry app.log', 'tail --retry --follow=name app.log'],
			why: '`-F` is `--follow=name --retry`: `tail` tracks the name `app.log` and reopens it when a new file appears. Plain `-f` follows the open file, so it keeps reading the renamed old log.'
		}
	],
	quiz: [],
	recall: {
		q: 'Why does `cut -d\' \' -f2 ps.txt` print empty lines, and what fixes it?',
		a: 'The columns are padded with several spaces, so field 2 is the empty text between the first two spaces. `tr -s \' \'` squeezes each run to one space before `cut`.'
	},
	sources: [
		{ title: 'cut(1)', url: 'https://man7.org/linux/man-pages/man1/cut.1.html' },
		{ title: 'tr(1)', url: 'https://man7.org/linux/man-pages/man1/tr.1.html' },
		{ title: 'wc(1)', url: 'https://man7.org/linux/man-pages/man1/wc.1.html' },
		{ title: 'tail(1)', url: 'https://man7.org/linux/man-pages/man1/tail.1.html' },
		{ title: 'GNU coreutils: head invocation', url: 'https://www.gnu.org/software/coreutils/manual/html_node/head-invocation.html' }
	]
};
