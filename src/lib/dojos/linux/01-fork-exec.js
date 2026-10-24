const BB = 'https://github.com/mirror/busybox/blob/371fe9f71d445d18be28c82a2a6d82115c8af19d';
const ASH = `${BB}/shell/ash.c`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'fork-exec',
	part: 'Processes',
	title: 'How a process starts',
	minutes: 10,
	hook: [
		'You run `./setenv.sh`, a script with two lines: `cd /tmp` and `export DB_URL=postgres://db/app`. It prints `in script: /tmp postgres://db/app`. Back at the prompt, `pwd` still prints your home directory and `echo $DB_URL` prints an empty line.',
		'The script ran in a second process. Bash called `fork()` to copy itself, and the copy called `execve()` to load `/bin/bash` on the script. In the test run, the script printed `pid=4044147 ppid=4044145`: its parent was the shell, PID 4044145.',
		'The `cd` and the `export` changed the working directory and the variables of process 4044147 only. **When that process exited, its directory and its variables were gone.** `. ./setenv.sh` runs the same two lines inside the shell itself, and then they stay.'
	],
	terms: [
		{ term: 'PID', def: 'Process ID: the number the kernel gives each process. The PPID is the PID of its parent, the process that created it.' },
		{ term: 'fork()', def: 'The system call that copies the calling process. It returns 0 in the new child and the child\'s PID in the parent.' },
		{ term: 'execve()', def: 'The system call that replaces the program running in the calling process with a new one. The PID stays the same.' },
		{ term: 'wait', def: 'The family of calls (`wait`, `waitpid`, `wait4`) a parent uses to block until a child ends and read its exit status.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['sh["bash, PID 4044145, reads ./setenv.sh"] --> fk["fork: glibc calls clone with SIGCHLD"]'],
				highlight: ['sh', 'fk'],
				note: 'Bash looks for a function, then a builtin, then a file in `PATH`. `./setenv.sh` contains a slash, so bash skips the search. It is not a builtin, so bash runs it "in a separate execution environment": a new process. Since glibc 2.3.3, the `fork()` wrapper calls `clone` with flags that give the same effect.'
			},
			{
				add: ['fk -->|"returns 4044147"| par["Parent: bash, PID 4044145"]', 'fk -->|"returns 0"| chi["Child: copy of bash, PID 4044147, PPID 4044145"]'],
				highlight: ['par', 'chi'],
				note: '`fork()` returns twice: the child\'s PID in the parent and 0 in the child. Both run the same code from the same point, and the return value tells each one which side it is. The child gets copies of the parent\'s memory and open file descriptors. Linux copies the pages only when one side writes to them.'
			},
			{
				add: ['chi --> ex["execve ./setenv.sh: the kernel reads #!/bin/bash and loads bash on the script"]'],
				highlight: ['ex'],
				note: 'The child calls `execve()`. The kernel sees the `#!` line and runs `/bin/bash ./setenv.sh` instead. The old program\'s stack, heap and memory mappings are replaced. The PID stays 4044147, and open file descriptors stay open unless they are marked close-on-exec.'
			},
			{
				add: ['ex --> run["cd /tmp and export DB_URL change process 4044147 only"]', 'run --> ext["exit_group 0: the child ends and waits as a zombie"]'],
				highlight: ['run', 'ext'],
				note: '`chdir()`, the call behind `cd`, "changes the current working directory of the calling process". Process 4044147 now sits in `/tmp` with `DB_URL` set. When the script ends, the child exits with status 0. Until its parent reads that status, the kernel keeps a small record of it: a zombie.'
			},
			{
				add: ['par --> wt["wait4: blocks, then reads status 0 and frees the zombie"]', 'ext -.->|"SIGCHLD"| wt'],
				highlight: ['wt'],
				note: 'The parent blocked in `wait4()` while the child ran. The child\'s exit wakes it, and the kernel sends it `SIGCHLD`. `wait4()` returns the child\'s PID and status, the zombie is removed, and bash stores the status in `$?`. The shell is still in your home directory, because nothing ever changed its own directory.'
			}
		]
	},
	example: {
		title: 'shell/ash.c: how BusyBox ash runs an external command',
		repo: 'mirror/busybox',
		url: `${ASH}#L10598-L10633`,
		lang: 'c',
		code: `		/* Can we avoid forking? For example, very last command
		 * in a script or a subshell does not need forking,
		 * we can just exec it.
		 */
		if (!(flags & EV_EXIT) || may_have_traps) {
			/* No, forking off a child is necessary */
			INT_OFF;
			get_tty_state();
			jp = makejob(/*cmd,*/ 1);
			if (forkshell(jp, cmd, FORK_FG) != 0) {
				/* parent */
				break;
			}
			/* child */
			FORCE_INT_ON;
			/* fall through to exec'ing external program */
		}
		shellexec(argv[0], argv, path, cmdentry.u.index);
		/* NOTREACHED */
	} /* default */
	case CMDBUILTIN:
		if (evalbltin(cmdentry.u.cmd, argc, argv, flags)
		 && !(exception_type == EXERROR && spclbltin <= 0)
		) {
 raise:
			longjmp(exception_handler->loc, 1);
		}
		break;

	case CMDFUNCTION:
		if (evalfun(cmdentry.u.func, argc, argv, flags))
			goto raise;
		break;
	} /* switch */

	status = waitforjob(jp);`,
		notes: [
			'Line 10 calls [`forkshell()`](' + ASH + '#L5330-L5350), which calls `fork()` and returns its result. In the parent the result is the child\'s PID, a positive number, so line 12 leaves the `switch`. In the child it is 0, and the code falls through to line 18.',
			'Line 18 runs only in the child. `shellexec()` builds the environment from exported variables only and tries `execve()` in each directory of `PATH` until one works. On success `execve()` never returns, which is what `NOTREACHED` on line 19 means. When every try fails, the status is 127 or 126 (chapter 4).',
			'Lines 21 to 28 run a builtin such as `cd` through `evalbltin()`, inside the shell\'s own process, with no fork. A `cd` program run in a child would change the child\'s directory and then exit.',
			'Line 36: the parent calls `waitforjob()` and blocks until the child ends. `waitforjob()` returns the child\'s exit status, which the shell then reports as `$?`.',
			'Lines 1 to 5: with `EV_EXIT` set (the shell exits after this command, as for the last command of a `-c` string), ash skips the fork and execs in its own process. Bash does the same. Captured in this session: `strace -f bash -c \'ls /nonexistent-dir\'` shows two `execve` calls in PID 4044141 and no `clone`.'
		]
	},
	tradeoff: {
		gain: [
			'Between `fork()` and `execve()` the child still runs shell code. File descriptors stay open across `execve()`, so the shell can point fd 1 at `out.log` and `ls` writes there without knowing.',
			'`fork()` is cheap on Linux: pages are copied on write, so the man page puts the cost at duplicating "the parent\'s page tables" and creating "a unique task structure for the child".'
		],
		cost: [
			'A program run by the shell cannot change the shell\'s directory or variables. `cd` and `export` are builtins, and a script that sets them must be run with `.` or `source`.',
			'After `fork()` in a multithreaded program, the child has one thread and "can safely call only async-signal-safe functions" until it calls `execve()`.'
		]
	},
	task: {
		prompt: 'Run `strace -f -e trace=clone,execve,wait4,exit_group bash -c \'ls /nonexistent-dir; echo done\'`. Which PID runs `ls`, which line is the fork, and what exit status does the shell read?',
		hint: 'Each line starts with a PID. Look for the first line that shows a new PID, and for the `wait4` line that resumes.',
		answer: [
			'Captured in this session on Linux 6.17 with bash 5.2.21: `4040495 execve("/usr/bin/bash", ...)` is the shell. `4040495 clone(child_stack=NULL, flags=CLONE_CHILD_CLEARTID|CLONE_CHILD_SETTID|SIGCHLD, ...) = 4040496` is the fork: glibc\'s `fork()` uses `clone`, and it returns the child\'s PID to the parent.',
			'`4040496 execve("/usr/bin/ls", ["ls", "/nonexistent-dir"], ...) = 0` is the child loading `ls`. The PID did not change between the fork and the exec.',
			'`4040496 exit_group(2)`: `ls` fails on the missing directory with status 2. The parent\'s `wait4(-1, ...)` resumes with `WEXITSTATUS(s) == 2` and returns 4040496, then `SIGCHLD` arrives.',
			'`echo done` produces no `clone` line: `echo` is a builtin, so bash runs it in PID 4040495 itself. With only `ls` in the `-c` string, bash would exec it without forking.'
		],
		steps: [
			{
				title: 'Read the trace',
				questions: [
					{ q: 'What does `-f` add to the `strace` command?', options: ['It shows only failed calls', 'It follows child processes, so their calls show up too', 'It prints the full path of each file', 'It forces the trace to start before bash loads'], answer: 1, why: 'Without `-f`, strace traces only the first process. The fork and the `ls` happen in a child, so you need it to see them.' },
					{ q: 'Once the child exists, lines carry a tag such as `[pid 4040496]`. What is that number?', options: ['The line number of the command inside the `-c` string', 'The exit status of the call', 'The PID of the process that made the call', 'The time the call took'], answer: 2, why: 'With `-f`, strace tags each line with the PID that made the call, so you can tell parent and child apart.' },
					{ q: 'The first line, `execve("/usr/bin/bash", ...)`, comes from PID 4040495. What is that process?', options: ['The shell that will run the `-c` string', 'The `ls` process', 'The `strace` process itself', 'A zombie left by an earlier command'], answer: 0, why: 'strace starts bash with `execve()`. Every line with that PID is the shell.' },
					{ q: 'Why does `-e trace=` list only `clone,execve,wait4,exit_group`?', options: ['strace refuses to trace other calls without root privileges', 'Bash makes no other system calls', 'Those are the only calls that change the PID', 'They cover a process\'s life: fork, exec, wait, exit'], answer: 3, why: 'The filter hides the noise (`read`, `mmap`, ...) and keeps the calls that create, load, end and reap a process.' }
				]
			},
			{
				title: 'Find the fork',
				questions: [
					{ q: 'Bash calls `fork()`, but the trace has no `fork` line. Which line is the fork?', options: ['The second `execve` line, the one that loads `ls`', 'The `clone(...) = 4040496` line', 'The `wait4` line, where the shell blocks', 'The `exit_group` line at the end of the trace'], answer: 1, why: 'Since glibc 2.3.3, the `fork()` wrapper calls `clone` with flags that give the same effect.' },
					{ q: 'The `clone` line ends with `= 4040496`. What does that number mean?', options: ['The new child\'s PID, returned to the parent', 'The PID of the parent, so the child can find it', 'The number of memory pages copied to the child', 'The exit status the child will return later'], answer: 0, why: '`fork()` returns the child\'s PID in the parent. The child sees 0.' },
					{ q: 'Which PID made the `clone` call?', options: ['4040496, the child', 'The kernel, PID 0', '4040495, the shell', 'PID 1, init'], answer: 2, why: 'The shell copies itself. Only the parent makes the call, and both processes return from it.' },
					{ q: 'Right after the fork, what is the child running?', options: ['`ls`, already loaded', 'Nothing until the kernel picks a program', 'A fresh empty process', 'A copy of bash, at the same point as the parent'], answer: 3, why: '`fork()` copies the caller. The child runs bash code until it calls `execve()`.' }
				]
			},
			{
				title: 'Follow the child',
				questions: [
					{ q: 'Which PID runs `ls`?', options: ['4040495', '4040496', 'A third PID made by `execve`', 'It depends on the scheduler'], answer: 1, why: 'The line `4040496 execve("/usr/bin/ls", ...) = 0` shows the child loading `ls`.' },
					{ q: 'Does the PID change between the `clone` and the `execve` of `ls`?', options: ['Yes, `execve` always gives the program a new PID', 'Yes, but only for programs that live in `/usr/bin`', 'No: the program changes inside the same process', 'No, because strace hides the new PID'], answer: 2, why: 'execve(2): "there is no new process". The program changes, the PID stays.' },
					{ q: '`echo done` produces no `clone` line. Why?', options: ['`echo` is a builtin: bash runs it itself', 'strace stops printing calls after the first error', '`echo` reuses the child process that ran `ls`', 'The `;` makes both commands share one fork'], answer: 0, why: 'Builtins run inside the shell, with no fork. That is also why `cd` must be a builtin.' },
					{ q: 'With only `ls /nonexistent-dir` in the `-c` string, what changes?', options: ['Bash forks twice, once for each part of the string', 'Bash refuses to run a `-c` string with one command', 'The trace shows two `clone` lines', 'Bash execs `ls` itself, with no `clone`'], answer: 3, why: 'For the last command of a `-c` string, bash skips the fork and execs directly, as ash does with `EV_EXIT`.' }
				]
			},
			{
				title: 'Read the status',
				questions: [
					{ q: 'The child ends with `exit_group(2)`. Where does 2 come from?', options: ['`ls` fails on the missing directory', 'The child is the second process', 'Bash adds 1 to every error', 'strace counts two syscalls'], answer: 0, why: '`ls` exits with status 2 when it cannot access a path you gave it.' },
					{ q: 'Which call lets the shell read that status?', options: ['`execve`, which hands back the status of the old program', '`clone`', '`wait4(-1, ...)` resuming with `WEXITSTATUS(s) == 2`', '`exit_group` in PID 4040495'], answer: 2, why: 'The parent blocks in `wait4()` until the child ends, then reads its status and frees the zombie.' },
					{ q: 'Between the child\'s exit and the parent\'s `wait4` return, what is the child?', options: ['Gone without a trace', 'A zombie, kept until the parent reads its status', 'An orphan, adopted by PID 1 until someone reaps it', 'Still running `ls`'], answer: 1, why: 'The kernel keeps a small record until the parent reads the status. Reading it removes the zombie.' },
					{ q: 'What does bash do with the status it read?', options: ['Prints it to stderr', 'Sends it back to `ls`', 'Ignores it unless `set -e` is on', 'Stores it in `$?`'], answer: 3, why: 'The status from `wait4()` becomes `$?` for the next command.' }
				]
			}
		]
	},
	quiz: [
		{
			q: '`./deploy.sh` runs `export RELEASE=42` and exits. In your shell, `echo $RELEASE` then prints an empty line. Why?',
			options: [
				'The script ran in a child process, and its variables ended with that process',
				'`export` saves the variable in `~/.bashrc`, which only new login shells read',
				'Bash clears every exported variable when a script exits with status 0',
				'The variable reached the parent, but `echo` reads it from a cached environment'
			],
			answer: 0,
			why: 'The shell ran the script in a separate process created by `fork()` and loaded with `execve()`. Exported variables go from a parent to its children at `execve()`, never back up. `. ./deploy.sh` runs the lines in the shell itself.'
		},
		{
			q: 'What does `fork()` return on success?',
			options: [
				'The child\'s PID in both processes, so each can find the other',
				'0 in the child and the child\'s PID in the parent',
				'The parent\'s PID in the child and 0 in the parent',
				'0 in both, and each process calls `getpid()` to tell them apart'
			],
			answer: 1,
			why: 'fork(2): "the PID of the child process is returned in the parent, and 0 is returned in the child." Both run the same code from the same point, so the return value is how each side picks its branch.'
		},
		{
			q: 'A process with PID 812 calls `execve("/usr/bin/ls", ...)` and the call succeeds. What is true afterwards?',
			options: [
				'The kernel gives `ls` a new PID, and PID 812 is its parent',
				'The old program\'s signal handlers still run when `ls` gets a signal',
				'`execve()` returns 0 to the old program, which then waits for `ls`',
				'`ls` runs as PID 812 with the file descriptors not marked close-on-exec'
			],
			answer: 3,
			why: 'execve(2): "there is no new process". The program is replaced inside the same process, so the PID stays 812. Caught signals are reset to the default action, and file descriptors stay open unless marked close-on-exec. On success the call does not return.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'See a script lose its `cd` and `export` in a child process, then watch the fork and the exec with strace.',
		steps: [
			'Make a scratch folder: `mkdir -p ~/fork-lab && cd ~/fork-lab`.',
			'Write the script: `printf \'#!/bin/bash\\ncd /tmp\\nexport DB_URL=postgres://db/app\\necho "in script: $PWD $DB_URL pid=$$ ppid=$PPID"\\n\' > setenv.sh && chmod +x setenv.sh`.',
			'Print your shell\'s PID with `echo $$`, then run `./setenv.sh`, `pwd` and `echo "[$DB_URL]"`.',
			'Now run it in the shell itself: `. ./setenv.sh`, then `pwd` and `echo "[$DB_URL]"` again. Run `cd ~/fork-lab` to come back.',
			'On Linux, trace it: `strace -f -e trace=clone,execve,wait4,exit_group bash -c \'ls /nonexistent-dir; echo done\'`. Then run the same with only `ls /nonexistent-dir` in the string.'
		],
		done: [
			'`./setenv.sh` prints a `ppid` equal to your `echo $$`, and `pwd` afterwards still shows `~/fork-lab`.',
			'After `. ./setenv.sh`, the script prints your shell\'s own PID and `echo "[$DB_URL]"` prints `[postgres://db/app]`.',
			'The first trace has one `clone` line, an `execve("/usr/bin/ls", ...)` in the child PID, `exit_group(2)` and a `wait4` that resumes with `WEXITSTATUS(s) == 2`.',
			'The trace with only `ls` has no `clone` line.'
		],
		solution: [
			'`./setenv.sh` runs in a child made by `fork()` and loaded by `execve()`. Its `cd` and `export` change that child only, and are gone when it exits.',
			'`.` runs the lines in the shell itself, so `$$` is your shell\'s PID and the changes stay.',
			'In the trace, `clone(...) = <pid>` is the fork. The same `<pid>` then calls `execve` on `ls`: the program changes, the PID does not. `echo done` is a builtin and forks nothing.',
			'With `ls` as the last command of the `-c` string, bash execs it in its own process, so no `clone` appears. On macOS there is no strace: the first four steps still work.'
		]
	},
	recall: {
		q: 'When bash runs `ls`, which two system calls start it, and what does the first one return in each process?',
		a: '`fork()` copies the shell and returns 0 in the child and the child\'s PID in the parent. The child then calls `execve("/usr/bin/ls", ...)`, which keeps the PID and does not return on success. The parent waits with `wait4()`.'
	},
	sources: [
		{ title: 'fork(2), Linux manual page', url: 'https://man7.org/linux/man-pages/man2/fork.2.html' },
		{ title: 'execve(2), Linux manual page', url: 'https://man7.org/linux/man-pages/man2/execve.2.html' },
		{ title: 'wait(2), Linux manual page', url: 'https://man7.org/linux/man-pages/man2/wait.2.html' },
		{ title: 'bash(1), COMMAND EXECUTION and COMMAND EXECUTION ENVIRONMENT', url: 'https://man7.org/linux/man-pages/man1/bash.1.html' },
		{ title: 'BusyBox source, shell/ash.c', url: 'https://github.com/mirror/busybox/blob/371fe9f71d445d18be28c82a2a6d82115c8af19d/shell/ash.c' }
	]
};
