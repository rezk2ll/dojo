/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'grep',
	part: 'The shell',
	title: 'Searching text',
	minutes: 10,
	hook: [
		'Customers report that some payments fail since 08:00. You have a shell in `~/shop` with GNU `grep`, the app log of this morning and the source code. You want the failing lines, how many there are, and where the code sets the payment timeout.',
		'`logs/app.log` has 8 lines, each starting with a date, a time and a level. 3 lines are `INFO`, 2 are `WARN`, 2 are `ERROR` ("payment failed: timeout" and "payment failed: card declined"), and 1 line says `error retrying payment` in lower case. `src/` holds `payment.js`, with the variable `timeoutMs` on lines 1 and 5 and the word `timeout` in a comment on line 4. It also holds `config.json`, a single line `{ "timeout": 5000, "retries": 3 }`, and `cart.js`, which does not mention timeouts. Every rep runs in `~/shop`.'
	],
	terms: [
		{ term: 'pattern', def: 'The text or regular expression `grep` looks for in each line, such as `ERROR` or `WARN|ERROR`.' },
		{ term: 'match', def: 'A line that contains the pattern. By default `grep` prints every match and nothing else.' },
		{ term: 'word character', def: 'A letter, a digit or `_`. `-w` uses them to decide where a word starts and ends.' }
	],
	reps: [
		{
			prompt: 'Print the lines of `logs/app.log` that contain `ERROR`.',
			accept: ['grep ERROR logs/app.log', "grep 'ERROR' logs/app.log", 'grep "ERROR" logs/app.log', 'grep -e ERROR logs/app.log'],
			why: '`grep ERROR logs/app.log` prints each line that contains `ERROR`. It prints 2 lines: the match is case-sensitive, so `error retrying payment` is left out.'
		},
		{
			prompt: 'Print the lines of `logs/app.log` that contain `error` in any case.',
			accept: [
				'grep -i error logs/app.log',
				'grep -i ERROR logs/app.log',
				"grep -i 'error' logs/app.log",
				'grep -i "error" logs/app.log',
				'grep --ignore-case error logs/app.log',
				'grep --ignore-case ERROR logs/app.log'
			],
			why: '`-i` makes upper and lower case letters match each other. The output now has 3 lines, including `error retrying payment`.'
		},
		{
			prompt: 'Print the `WARN` lines of `logs/app.log` with their line numbers.',
			accept: ['grep -n WARN logs/app.log', "grep -n 'WARN' logs/app.log", 'grep -n "WARN" logs/app.log', 'grep --line-number WARN logs/app.log'],
			why: '`-n` puts the line number and a colon before each match: `2:` and `8:`.'
		},
		{
			prompt: 'Print only the number of lines in `logs/app.log` that contain `ERROR`.',
			accept: ['grep -c ERROR logs/app.log', "grep -c 'ERROR' logs/app.log", 'grep -c "ERROR" logs/app.log', 'grep --count ERROR logs/app.log'],
			why: '`-c` replaces the lines with a count of matching lines and prints `2`. It counts lines, so a line with `ERROR` twice still counts once.'
		},
		{
			prompt: 'Print the lines of `logs/app.log` that do not contain `INFO`.',
			accept: ['grep -v INFO logs/app.log', "grep -v 'INFO' logs/app.log", 'grep -v "INFO" logs/app.log', 'grep --invert-match INFO logs/app.log'],
			why: '`-v` selects the lines that do not match. It prints the 5 lines that are not `INFO`: 2 `WARN`, 2 `ERROR` and the lower case `error` line.'
		},
		{
			prompt: 'Print the lines of `logs/app.log` that contain `WARN` or `ERROR`, with one extended regular expression.',
			accept: [
				"grep -E 'WARN|ERROR' logs/app.log",
				'grep -E "WARN|ERROR" logs/app.log',
				"grep -E 'ERROR|WARN' logs/app.log",
				'grep -E "ERROR|WARN" logs/app.log',
				"grep --extended-regexp 'WARN|ERROR' logs/app.log"
			],
			why: '`-E` reads the pattern as an extended regular expression, where `|` means or. The quotes keep the shell from reading `|` as a pipe. Without `-E`, `grep` would look for the literal text `WARN|ERROR` and print nothing.'
		},
		{
			prompt: 'Search every file under `src` for `timeout`.',
			accept: ['grep -r timeout src', 'grep -r timeout src/', "grep -r 'timeout' src", 'grep -r "timeout" src', 'grep -R timeout src', 'grep --recursive timeout src'],
			why: '`-r` reads every file under `src`, and each match starts with its file name, as in `src/config.json:`. It finds 4 lines, because `timeout` is also part of `timeoutMs`.'
		},
		{
			prompt: 'Print only the names of the files under `src` that contain `timeout`.',
			accept: [
				'grep -rl timeout src',
				'grep -lr timeout src',
				'grep -r -l timeout src',
				'grep -l -r timeout src',
				'grep -rl timeout src/',
				"grep -rl 'timeout' src",
				'grep -r --files-with-matches timeout src'
			],
			why: '`-l` prints each file name once instead of the lines, and stops reading a file at its first match. It prints `src/payment.js` and `src/config.json`.'
		},
		{
			prompt: 'Search every file under `src` for `timeout` as a whole word, so that `timeoutMs` does not match.',
			accept: [
				'grep -rw timeout src',
				'grep -wr timeout src',
				'grep -r -w timeout src',
				'grep -w -r timeout src',
				'grep -rw timeout src/',
				"grep -rw 'timeout' src",
				'grep -r --word-regexp timeout src'
			],
			why: '`-w` keeps a match only if the characters around it are not word characters. In `timeoutMs` the next character is `M`, so only 2 lines remain: the comment in `payment.js` and `"timeout"` in `config.json`.'
		},
		{
			prompt: 'Search for `timeout` under `src`, but only in files whose name ends in `.js`.',
			accept: [
				"grep -r --include='*.js' timeout src",
				'grep -r --include="*.js" timeout src',
				'grep -r --include=*.js timeout src',
				"grep -r timeout --include='*.js' src",
				"grep -r timeout src --include='*.js'",
				'grep -r timeout src --include="*.js"',
				"grep -r --include '*.js' timeout src"
			],
			why: '`--include=\'*.js\'` makes `grep -r` read only the files whose base name matches the glob. `config.json` is skipped, so the 3 lines all come from `src/payment.js`.'
		}
	],
	quiz: [],
	recall: {
		q: 'Which option stops `grep timeout` from matching `timeoutMs`, and what does it check?',
		a: '`-w`. It keeps a match only if the characters before and after it are not letters, digits or `_`. In `timeoutMs`, the `M` after the match is a letter.'
	},
	sources: [
		{ title: 'grep(1), GNU grep manual page', url: 'https://man7.org/linux/man-pages/man1/grep.1.html' },
		{ title: 'regex(7), POSIX regular expressions', url: 'https://man7.org/linux/man-pages/man7/regex.7.html' }
	]
};
