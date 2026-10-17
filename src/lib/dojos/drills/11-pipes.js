/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'pipes',
	part: 'The shell',
	title: 'Pipes and redirects',
	minutes: 10,
	hook: [
		'The CI job failed and the ticket asks for the build output. You run `./build.sh` on your machine and 5 lines scroll past. You want them in a file, filtered, or both, and the error line keeps landing on the screen instead of in the file.',
		'The reps use one folder. `./build.sh` prints 4 lines on standard output: `step 1/3: compile api`, `step 2/3: compile web`, `warning: web/legacy.js is not used`, `step 3/3: package`. It prints 1 line on standard error: `error: API_KEY is not set`. `hosts.txt` holds 3 host names, one per line, and the variable `$BRANCH` holds `feature/login`.'
	],
	terms: [
		{ term: 'file descriptor', def: 'A number the shell gives each open stream of a command: 0 is standard input, 1 is standard output, 2 is standard error.' },
		{ term: 'standard error', def: 'Descriptor 2, where `./build.sh` writes its `error:` line. `>` and `|` leave it on the terminal unless you move it.' },
		{ term: 'pipe', def: 'The `|` operator: it connects the standard output of the command on its left to the standard input of the command on its right.' },
		{ term: 'here string', def: 'The `<<<` operator: the shell passes one word, plus a newline, to the command on standard input.' }
	],
	reps: [
		{
			prompt: 'Run `./build.sh` and save its standard output to `build.log`, replacing what the file held.',
			accept: ['./build.sh > build.log', './build.sh >build.log', './build.sh 1> build.log', './build.sh 1>build.log'],
			why: '`>` opens `build.log` on descriptor 1 and truncates it to zero size first. The `error:` line still prints on your terminal, because only descriptor 1 moved.'
		},
		{
			prompt: 'Run `./build.sh` again and add its standard output to the end of `build.log`, keeping the old lines.',
			accept: ['./build.sh >> build.log', './build.sh >>build.log', './build.sh 1>> build.log', './build.sh 1>>build.log'],
			why: '`>>` opens `build.log` for appending, so the 4 new lines go after the old ones. Bash creates the file if it does not exist.'
		},
		{
			prompt: 'Save only the error messages of `./build.sh` to `errors.log`. The normal output stays on the screen.',
			accept: ['./build.sh 2> errors.log', './build.sh 2>errors.log'],
			why: 'The `2` before `>` picks descriptor 2, standard error. `errors.log` gets the `error: API_KEY is not set` line and the 4 step lines stay on the terminal.'
		},
		{
			prompt: 'Run `./build.sh` and throw away its error messages. Keep the normal output on the screen.',
			accept: ['./build.sh 2>/dev/null', './build.sh 2> /dev/null'],
			why: '`2>` sends descriptor 2 to `/dev/null`, a special file that discards everything written to it. Only the 4 standard output lines appear.'
		},
		{
			prompt: 'Save both the standard output and the error messages of `./build.sh` to `build.log`.',
			accept: [
				'./build.sh > build.log 2>&1',
				'./build.sh >build.log 2>&1',
				'./build.sh 1> build.log 2>&1',
				'./build.sh 1>build.log 2>&1',
				'./build.sh &> build.log',
				'./build.sh &>build.log',
				'./build.sh >& build.log',
				'./build.sh >&build.log'
			],
			why: '`> build.log` points descriptor 1 at the file, then `2>&1` points descriptor 2 at the place descriptor 1 points to now. Bash applies redirections left to right, so `2>&1 > build.log` would leave the error on the terminal. `&>` is the short form the bash manual prefers.'
		},
		{
			prompt: 'Show only the lines of the standard output of `./build.sh` that contain `warning`.',
			accept: ['./build.sh | grep warning', './build.sh|grep warning', "./build.sh | grep 'warning'", './build.sh | grep "warning"'],
			why: '`|` connects the standard output of `./build.sh` to the standard input of `grep`, which keeps the 1 matching line. The `error:` line skips the pipe and still prints on the terminal.'
		},
		{
			prompt: 'Send both streams of `./build.sh` through the pipe and keep only the lines that contain `error`.',
			accept: [
				'./build.sh 2>&1 | grep error',
				"./build.sh 2>&1 | grep 'error'",
				'./build.sh 2>&1 | grep "error"',
				'./build.sh |& grep error',
				"./build.sh |& grep 'error'",
				'./build.sh |& grep "error"'
			],
			why: '`2>&1` points standard error at the pipe, so `grep` reads all 5 lines and prints `error: API_KEY is not set`. In bash, `|&` is shorthand for `2>&1 |`.'
		},
		{
			prompt: 'Watch the standard output of `./build.sh` on the screen and save a copy to `build.log` at the same time.',
			accept: ['./build.sh | tee build.log'],
			why: '`tee` copies its standard input to each file it is given and also to its standard output. You see the 4 lines and `build.log` holds the same 4.'
		},
		{
			prompt: 'Same as before, but add to the end of `build.log` instead of replacing it.',
			accept: ['./build.sh | tee -a build.log', './build.sh | tee --append build.log'],
			why: '`-a` makes `tee` append to the file. Without it, `tee` overwrites `build.log` like `>` does.'
		},
		{
			prompt: '`wc -l hosts.txt` prints `3 hosts.txt`. Print only `3` by giving the file to `wc -l` on standard input with `<`.',
			accept: ['wc -l < hosts.txt', 'wc -l <hosts.txt', '< hosts.txt wc -l', '<hosts.txt wc -l'],
			why: '`<` opens `hosts.txt` on descriptor 0. `wc` reads a stream with no name, so it prints the count alone.'
		},
		{
			prompt: '`$BRANCH` holds `feature/login`. Print `feature-login` by passing the variable to `tr / -` with a here string.',
			accept: [
				'tr / - <<< "$BRANCH"',
				'tr / - <<<"$BRANCH"',
				'tr / - <<< $BRANCH',
				"tr '/' '-' <<< \"$BRANCH\"",
				"tr '/' '-' <<< $BRANCH",
				'tr "/" "-" <<< "$BRANCH"',
				'tr "/" "-" <<< $BRANCH'
			],
			why: '`<<<` expands `$BRANCH` and passes `feature/login` plus a newline on standard input. `tr / -` replaces each `/` with `-`.'
		}
	],
	quiz: [],
	recall: {
		q: 'Why does `./build.sh 2>&1 > build.log` still print the error line on your terminal?',
		a: 'Bash applies redirections left to right. `2>&1` copies descriptor 1 while it still points at the terminal, and only then `> build.log` moves descriptor 1 to the file.'
	},
	sources: [
		{ title: 'bash(1): Pipelines and REDIRECTION', url: 'https://man7.org/linux/man-pages/man1/bash.1.html' },
		{ title: 'tee(1)', url: 'https://man7.org/linux/man-pages/man1/tee.1.html' },
		{ title: 'null(4): /dev/null', url: 'https://man7.org/linux/man-pages/man4/null.4.html' }
	]
};
