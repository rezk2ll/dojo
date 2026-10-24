const STRACE = 'https://github.com/strace/strace/blob/195ac8ddbf6fad16ff1ff125b0feb725b6c46dcf';
const STRACE_C = `${STRACE}/src/strace.c`;
const FILTER_C = `${STRACE}/src/filter_seccomp.c`;
const GREGG = 'https://www.brendangregg.com/blog/2014-05-11/strace-wow-much-syscall.html';
const YAMA = 'https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/Documentation/admin-guide/LSM/Yama.rst';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'strace',
	part: 'Processes',
	title: 'Watching system calls with strace',
	minutes: 10,
	hook: [
		'A script runs `sh -c \'cat /etc/shadow\'` and prints `Permission denied`. You want the exact call that failed. `strace -f -e trace=execve,openat` prints it: `openat(AT_FDCWD, "/etc/shadow", O_RDONLY) = -1 EACCES (Permission denied)`, from the child process that runs `cat`.',
		'Brendan Gregg measured the price in 2014. `dd if=/dev/zero of=/dev/null bs=1 count=500k` took 0.103851 s. Under `strace -eaccept`, which matches no call that `dd` makes, it took 45.9599 s: **442 times slower**.',
		'The same `dd` run for this chapter, with strace 6.8 on Linux 6.17: 0.092 s alone, 6.90 s under `strace -e trace=accept`, and 0.088 s with `--seccomp-bpf` added.'
	],
	terms: [
		{ term: 'System call', def: 'A request from a process to the kernel, such as `openat` to open a file or `connect` to open a socket. Each one returns a value, and -1 with an `errno` code on failure.' },
		{ term: 'ptrace', def: 'The kernel interface strace uses: a tracer process can stop another process, the tracee, and read its registers and memory while it is stopped.' },
		{ term: 'errno', def: 'The error code a failed system call leaves, such as `ENOENT` (no such file) or `EACCES` (permission denied). strace prints it after `= -1`.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['st["strace -f -e trace=openat sh -c \'cat /etc/shadow\'"] -->|"starts and traces"| tee["Tracee: sh, then cat"]'],
				highlight: ['st', 'tee'],
				note: 'strace starts the command as its tracee. With `-f` it also traces every child created by `fork`, `vfork` or `clone`, so it follows `sh` into the `cat` it starts. Without `-f`, this run prints no `openat` line at all, because `cat` is a child of `sh`.'
			},
			{
				add: ['tee -->|"calls openat"| entry["syscall-entry-stop: kernel stops cat"]', 'entry --> pr1["strace prints openat(AT_FDCWD, /etc/shadow, O_RDONLY"]'],
				highlight: ['entry', 'pr1'],
				note: 'When `cat` enters `openat`, the kernel stops it before running the call and wakes strace. strace reads the arguments from the stopped process and prints the first half of the line.'
			},
			{
				add: ['pr1 -->|"PTRACE_SYSCALL"| run["Kernel runs openat: permission check fails"]', 'run --> exit["syscall-exit-stop: cat stops again"]'],
				highlight: ['run', 'exit'],
				note: 'strace restarts `cat` with `PTRACE_SYSCALL`, which the ptrace(2) man page describes as "stopped at the next entry to or exit from a system call". The kernel runs `openat`, the permission check fails, and `cat` stops a second time on the way out.'
			},
			{
				add: ['exit --> pr2["strace prints = -1 EACCES (Permission denied)"]', 'pr2 -->|"PTRACE_SYSCALL"| tee'],
				highlight: ['pr2'],
				note: 'strace reads the return value, prints `= -1 EACCES (Permission denied)` and restarts `cat` again. Every system call costs two stops and two wake-ups of strace. The filter `-e trace=openat` only decides what strace prints: it still stops `cat` at every other call.'
			},
			{
				add: ['bpf["--seccomp-bpf: a filter in the kernel"] -.->|"stop only on traced calls"| tee'],
				highlight: ['bpf'],
				note: 'With `--seccomp-bpf` (it needs `-f`), strace installs a seccomp filter in the tracee. The filter lets untraced calls run with no stop, and stops the tracee only for the calls you asked for. With the filter, `dd` went from 6.90 s back to 0.088 s.'
			}
		]
	},
	example: {
		title: 'src/strace.c (strace v7.2): two stops per call, and the restart',
		repo: 'strace/strace',
		url: `${STRACE_C}#L4048-L4088`,
		lang: 'c',
		code: `static int
trace_syscall(struct tcb *tcp, unsigned int *sig)
{
	if (entering(tcp)) {
		int res = syscall_entering_decode(tcp);
		switch (res) {
		case 0:
			return 0;
		case 1:
			res = syscall_entering_trace(tcp, sig);
		}
		syscall_entering_finish(tcp, res);
		return res;
	} else {
		struct timespec ts = {};
		int res = syscall_exiting_decode(tcp, &ts);
		if (res != 0) {
			res = syscall_exiting_trace(tcp, &ts, res);
		}
		syscall_exiting_finish(tcp);
		return res;
	}
}

/* Returns true iff the main trace loop has to continue. */
static bool
dispatch_event(const struct tcb_wait_data *wd)
{
	unsigned int restart_op;
	unsigned int restart_sig = 0;
	enum trace_event te = wd ? wd->te : TE_BREAK;
	/*
	 * Copy wd->status to a non-const variable to workaround glibc bugs
	 * around union wait fixed by glibc commit glibc-2.24~391
	 */
	int status = wd ? wd->status : 0;

	if (current_tcp && has_seccomp_filter(current_tcp))
		restart_op = seccomp_filter_restart_operator(current_tcp);
	else
		restart_op = PTRACE_SYSCALL;`,
		notes: [
			'Line 4 picks the half of the call: `entering()` is true while the `TCB_INSYSCALL` flag of that process is clear. Lines 5 and 10 run at the entry stop, decode the arguments and print `openat(...`. Lines 16 and 18 run at the exit stop and print `= -1 EACCES`.',
			'Line 41 is the default way to restart the tracee: `PTRACE_SYSCALL`, so it stops again at the next entry or exit. The tracee stops twice for every system call, whatever `-e trace=` says.',
			'Lines 38 and 39 run when `--seccomp-bpf` installed a filter. In [`seccomp_filter_restart_operator()`](' + FILTER_C + '#L698-L705), strace returns `PTRACE_CONT` unless the call that just ended is traced. With `PTRACE_CONT`, the tracee runs until the filter returns `SECCOMP_RET_TRACE` for a traced call.',
			'The strace(1) man page lists the cost under BUGS: "A traced process runs more slowly than a non-traced one. The performance impact can be mitigated by using the --seccomp-bpf option."'
		]
	},
	tradeoff: {
		gain: [
			'`strace -p PID` attaches to a running process and shows each call with its arguments and its `errno`. You need neither the source code nor a restart.',
			'`-e status=failed` (or `-Z`) prints only the calls that failed. With `LANG=C`, it cuts a run of `sh -c \'cat /etc/myapp.conf\'` down to the one `openat` that returned `ENOENT`.'
		],
		cost: [
			'A busy process slows down: `dd` with 1 byte writes ran 75 times slower here, and 442 times slower in Gregg\'s test. A server with latency alarms can fail over while you trace it.',
			'`--seccomp-bpf` removes most of the cost, but it needs `-f` and does not work with `-p`, so it cannot help on a process that is already running.',
			'With `kernel.yama.ptrace_scope = 1`, as on the machine used for this chapter, `strace -p` on a process that is not your child fails with `Operation not permitted`. The Yama docs say `strace -p PID` still works as root.'
		]
	},
	task: {
		prompt: 'Run `strace -e trace=execve,openat sh -c \'cat /etc/shadow\'` as a normal user, then the same with `-f` added. Which line appears only with `-f`? Which process made the failing call, and what does `EACCES` tell you that `ENOENT` would not?',
		hint: 'Look for lines that start with `[pid N]`. `sh` runs `cat` in a child process.',
		answer: [
			'Without `-f` (run for this chapter): `sh`\'s own `execve` and its `openat` of `/etc/ld.so.cache` and `libc.so.6`, then the `Permission denied` message and a `SIGCHLD` line. strace never saw the call that failed.',
			'With `-f`: `strace: Process 4084412 attached`, then `[pid 4084412] execve("/usr/bin/cat", ["cat", "/etc/shadow"], ...)`, the library opens, and `[pid 4084412] openat(AT_FDCWD, "/etc/shadow", O_RDONLY) = -1 EACCES (Permission denied)`.',
			'The child `cat`, PID 4084412 here, made the failing `openat`. `EACCES` means the file exists and the permission check refused it. `ENOENT` would mean the path does not exist, as with `/etc/myapp.conf`.',
			'`stat -c \'%a %U %G\' /etc/shadow` printed `640 root shadow` on the machine used for this chapter: only root and the `shadow` group may read it.'
		],
		steps: [
			{
				title: 'Run it without -f',
				questions: [
					{ q: 'Without `-f`, which process does strace trace?', options: ['Only `sh`, the process it started', '`sh` and `cat`', 'Only `cat`', 'Every process of your user'], answer: 0, why: 'Without `-f`, strace traces the command it starts and none of its children.' },
					{ q: 'Which `openat` lines do you see without `-f`?', options: ['The one on `/etc/shadow`', '`sh` opening `/etc/ld.so.cache` and `libc.so.6`', 'None at all', 'Only `cat` loading `libc.so.6` and its other libraries'], answer: 1, why: 'Those are `sh`\'s own calls. `cat` runs in a child that strace does not stop.' },
					{ q: 'The `Permission denied` message still prints. Who wrote it?', options: ['strace', 'The kernel', '`cat`, in the child that strace did not trace', '`sh`, after it tried to read `/etc/shadow` itself'], answer: 2, why: 'The child ran normally, untraced, and printed its error. strace only saw `SIGCHLD` when it ended.' },
					{ q: 'What tells you a child existed?', options: ['A `[pid N]` prefix', 'The `execve` of `/usr/bin/cat`', 'An `EACCES` line', 'The `SIGCHLD` line'], answer: 3, why: '`sh` gets `SIGCHLD` when its child ends, and strace prints that signal.' }
				]
			},
			{
				title: 'Add -f',
				questions: [
					{ q: 'Which new line shows strace following the child?', options: ['`strace: Process 4084412 attached`', '`+++ exited with 1 +++`', '`--- SIGCHLD ...`', '`execve("/usr/bin/sh", ...)`'], answer: 0, why: 'With `-f`, strace attaches to every child created by `fork`, `vfork` or `clone`.' },
					{ q: 'Which line appears only with `-f` and shows the program change?', options: ['`execve("/usr/bin/sh", ["sh", "-c", "cat /etc/shadow"], ...)`', '`openat(... "/etc/ld.so.cache" ...)`', '`[pid 4084412] execve("/usr/bin/cat", ...)`', '`cat: /etc/shadow: Permission denied`'], answer: 2, why: 'The child loads `cat` with `execve`, and strace now sees it.' },
					{ q: 'What does `[pid 4084412]` at the start of a line mean?', options: ['The call took 4084412 ns to complete', 'The call came from process 4084412', 'It is the 4084412th call', 'The PID of strace'], answer: 1, why: 'With `-f`, strace tags lines from other processes with their PID.' },
					{ q: 'Even with `-f`, no `clone` line shows how `sh` made the child. Why?', options: ['`sh` runs `cat` without forking', '`-f` hides the fork it follows', '`clone` is not a system call', '`-e trace=execve,openat` prints only those two calls'], answer: 3, why: 'The filter limits what strace prints. `sh` still forks, and the `Process 4084412 attached` line shows the new child.' }
				]
			},
			{
				title: 'Find the failing call',
				questions: [
					{ q: 'Which line is the failure?', options: ['`openat(... "/etc/shadow" ...) = -1 EACCES`', '`execve("/usr/bin/cat", ["cat", "/etc/shadow"], ...) = 0`', '`openat(... "libc.so.6" ...) = 3`', '`+++ exited with 1 +++`'], answer: 0, why: '`= -1` means the call failed, and strace appends the `errno`.' },
					{ q: 'Which process made it?', options: ['strace', '`sh`, the parent', 'The kernel', 'The child `cat`, PID 4084412 here'], answer: 3, why: 'The line carries the child\'s `[pid 4084412]` prefix.' },
					{ q: 'Why does `openat` return 3 for `libc.so.6`?', options: ['3 is an error code', 'The library has 3 parts', 'It succeeded and returned file descriptor 3', 'It was the third try'], answer: 2, why: 'A successful `openat` returns the new file descriptor, the lowest free number after 0, 1 and 2.' },
					{ q: 'Which part of the failing `openat` shows that `cat` only asked to read?', options: ['`AT_FDCWD`', '`O_RDONLY`', '`= -1`', '`EACCES`'], answer: 1, why: '`O_RDONLY` asks for read access only, and even that was refused.' }
				]
			},
			{
				title: 'Read the errno',
				questions: [
					{ q: 'What does `EACCES` tell you?', options: ['The file exists, but access was refused', 'The path does not exist', 'The disk holding the file is full or read-only', 'strace blocked the call'], answer: 0, why: '`EACCES` is permission denied: the path was found, the access was not allowed.' },
					{ q: 'Does `EACCES` here mean that strace lacked a permission?', options: ['Yes: strace needs root to trace `cat`', 'Yes: `-f` causes the error', 'Only when `-e trace=` is set', 'No: the kernel refused `cat`, and strace only prints the result'], answer: 3, why: 'strace prints the return value of the call that `cat` made. Without strace, `cat` gets the same error and prints `Permission denied`.' },
					{ q: '`stat -c \'%a %U %G\' /etc/shadow` prints `640 root shadow`. Who may read it?', options: ['Everyone', 'Only root', 'Root and the `shadow` group', 'Any user in `sudo`'], answer: 2, why: 'Mode 640: owner read and write, group read, others nothing.' },
					{ q: 'Which option prints only the calls that failed?', options: ['`-c`', '`-e status=failed` or `-Z`', '`-T`', '`-p`'], answer: 1, why: 'It cuts the trace down to the calls that returned an error.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'You trace a busy service with `strace -e trace=connect -p PID`. Only 2 `connect` lines appear per minute. Why does the service still slow down?',
			options: [
				'strace still stops the process at the entry and exit of every system call',
				'strace copies the whole memory of the process at each `connect` it prints',
				'strace lowers the priority of the process while it is attached',
				'strace runs `connect` a second time to read the return value'
			],
			answer: 0,
			why: 'strace restarts the tracee with `PTRACE_SYSCALL`, so the kernel stops it at every system call entry and exit. `-e trace=` only filters what strace prints. `--seccomp-bpf` would skip untraced calls, but it does not work with `-p`.'
		},
		{
			q: '`strace -e trace=openat sh -c \'./app\'` shows no `openat` from `app`. What is missing?',
			options: ['`-c`, to count the calls', '`-f`, to follow child processes', '`-Z`, to show failed calls', '`-T`, to show call durations'],
			answer: 1,
			why: '`sh` starts `./app` in a child process. Without `-f`, strace traces only `sh` and never stops the child, so the child\'s calls are not printed.'
		},
		{
			q: 'strace prints `openat(AT_FDCWD, "/etc/app/config.yml", O_RDONLY) = -1 ENOENT (No such file or directory)`. What happened?',
			options: [
				'The file exists, but the process user may not read it',
				'The file was opened, and file descriptor -1 was returned for it',
				'No file exists at that path when the process tries to open it',
				'strace blocked the call, because tracing a file open needs root'
			],
			answer: 2,
			why: '`-1` means the call failed, and strace appends the `errno`. `ENOENT` is "No such file or directory": nothing exists at that path. A permission problem would show `EACCES`.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Find a failing system call in a child process, then measure what strace costs and what `--seccomp-bpf` saves.',
		steps: [
			'Make a scratch folder: `mkdir -p ~/strace-lab && cd ~/strace-lab`. This lab needs Linux and `strace`.',
			'Trace without `-f`: `strace -e trace=execve,openat sh -c \'cat /etc/shadow\'`. Then add `-f`: `strace -f -e trace=execve,openat sh -c \'cat /etc/shadow\'`.',
			'Print only the failures for a missing file: `LANG=C strace -f -Z -e trace=openat sh -c \'cat ./myapp.conf\'`.',
			'Time `dd` alone: `time dd if=/dev/zero of=/dev/null bs=1 count=200k`.',
			'Time it under strace, with and without the filter: `time strace -f -e trace=accept dd if=/dev/zero of=/dev/null bs=1 count=200k`, then the same with `--seccomp-bpf` after `-f`.'
		],
		done: [
			'Without `-f` there is no line on `/etc/shadow`. With `-f` you see `Process N attached` and `[pid N] openat(AT_FDCWD, "/etc/shadow", O_RDONLY) = -1 EACCES (Permission denied)`.',
			'The `-Z` run prints `openat(AT_FDCWD, "./myapp.conf", O_RDONLY) = -1 ENOENT (No such file or directory)` and no successful opens.',
			'`dd` under strace takes many times longer than alone, though it makes no `accept` call.',
			'With `--seccomp-bpf`, the time drops back close to the time without strace.'
		],
		solution: [
			'`sh` runs `cat` in a child, so only `-f` traces the `openat` that fails. `EACCES` says the file exists and the permission check refused it. `ENOENT` says nothing is there.',
			'`-e trace=accept` only filters what strace prints. It still stops `dd` twice at each of its system calls, and with `bs=1` that is hundreds of thousands of calls.',
			'`--seccomp-bpf` puts a filter in the kernel, so `dd` stops only on traced calls. It needs `-f` and does not work with `-p`.'
		]
	},
	recall: {
		q: 'How many times does strace stop a process for one system call, and which option makes the kernel skip the calls you did not ask for?',
		a: 'Twice: at syscall entry and at syscall exit, restarted each time with `PTRACE_SYSCALL`. `--seccomp-bpf` (with `-f`) installs a filter so only traced calls stop: `dd` went from 6.90 s to 0.088 s.'
	},
	sources: [
		{ title: 'strace(1), Linux manual page', url: 'https://man7.org/linux/man-pages/man1/strace.1.html' },
		{ title: 'ptrace(2), Linux manual page', url: 'https://man7.org/linux/man-pages/man2/ptrace.2.html' },
		{ title: 'Brendan Gregg, strace Wow Much Syscall (2014)', url: GREGG },
		{ title: 'strace v7.2, src/strace.c', url: STRACE_C },
		{ title: 'Linux v6.12, Documentation/admin-guide/LSM/Yama.rst', url: YAMA }
	]
};
