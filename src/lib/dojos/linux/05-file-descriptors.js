const GO = 'https://github.com/golang/go/blob/c3a068eec992b5ae783abce1a9d03f617b671ea2/src/syscall';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'file-descriptors',
	part: 'Processes',
	title: 'File descriptors',
	minutes: 10,
	hook: [
		'A Python script opens `/dev/null` in a loop under `ulimit -Sn 1024`. Run in this session, it got 1021 files, and the next `open()` failed with `OSError: [Errno 24] Too many open files`. Its error handler then failed too: `os.listdir("/proc/self/fd")` needs one more descriptor to open the directory.',
		'Each process has a table of numbered file descriptors. Numbers 0, 1 and 2 were already taken by stdin, stdout and stderr, so 1021 more fit under a limit of 1024: the last file got fd 1023. **The limit is on descriptor numbers**: while the soft limit stays at 1024, the process cannot get fd 1024.',
		'systemd starts services with a soft limit of 1024 and a hard limit of 524288 by default. A program may raise its own soft limit up to the hard limit, and the Go runtime does exactly that at startup.'
	],
	terms: [
		{ term: 'File descriptor', def: 'A small integer that indexes the process\'s table of open files, sockets and pipes. `read()`, `write()` and `close()` take it as their first argument.' },
		{ term: 'RLIMIT_NOFILE', def: 'The per-process resource limit on descriptors: "one greater than the maximum file descriptor number that can be opened". `ulimit -n` reads and sets it in a shell.' },
		{ term: 'Soft and hard limit', def: 'The kernel enforces the soft limit. An unprivileged process may raise its soft limit up to the hard limit, which only a process with `CAP_SYS_RESOURCE` can raise.' },
		{ term: 'EMFILE', def: 'Error 24, "Too many open files": the call needed a new descriptor and the process already uses every number below its soft limit.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['proc["Process starts: fd 0 stdin, fd 1 stdout, fd 2 stderr"]'],
				highlight: ['proc'],
				note: 'stdin(3): "On program startup, the integer file descriptors associated with the streams stdin, stdout, and stderr are 0, 1, and 2". They come from the parent: a child inherits copies of its parent\'s descriptors at `fork()`, and they stay open across `execve()`.'
			},
			{
				add: ['proc -->|"open /dev/null"| fd3["open returns 3, the lowest free number"]'],
				highlight: ['fd3'],
				note: 'open(2): the new descriptor is "the lowest-numbered file descriptor not currently open for the process". `/proc/<pid>/fd/3` is now a symlink to `/dev/null`. A socket shows up there as `socket:[2248868]`, with the socket\'s inode number.'
			},
			{
				add: ['fd3 -->|"1020 more opens"| top["fd 1023 in use: numbers 0 to 1023 all taken"]'],
				highlight: ['top'],
				note: 'The soft limit is 1024, and RLIMIT_NOFILE is "one greater than the maximum file descriptor number". The highest number the process can get is 1023. `cat /proc/<pid>/limits` shows the line `Max open files 1024 524288 files`: soft, hard, unit.'
			},
			{
				add: ['top -->|"next open, accept, pipe or socket"| err["EMFILE: Too many open files, errno 24"]'],
				highlight: ['err'],
				note: 'Every call that creates a descriptor now fails with `EMFILE`: `open()`, `accept()` on a listening socket, `pipe()`, `socket()`. A server stops taking connections, and even opening `/proc/self/fd` to look at the problem fails inside the process.'
			},
			{
				add: ['lim["setrlimit: soft limit raised to the hard limit, 524288"] --> ok["open returns 1024"]'],
				highlight: ['lim', 'ok'],
				note: 'The process may raise its soft limit up to the hard limit with `setrlimit()`. systemd\'s docs say why the default soft limit stays at 1024: "select(2) cannot function with file descriptors above 1023 on Linux". Programs that use `poll()` or `epoll` should raise the soft limit themselves.'
			}
		]
	},
	example: {
		title: 'src/syscall/rlimit.go: the Go runtime raises its own soft limit',
		repo: 'golang/go',
		url: `${GO}/rlimit.go#L13-L47`,
		lang: 'go',
		code: `// origRlimitNofile, if non-nil, is the original soft RLIMIT_NOFILE.
var origRlimitNofile atomic.Pointer[Rlimit]

// Some systems set an artificially low soft limit on open file count, for compatibility
// with code that uses select and its hard-coded maximum file descriptor
// (limited by the size of fd_set).
//
// Go does not use select, so it should not be subject to these limits.
// On some systems the limit is 256, which is very easy to run into,
// even in simple programs like gofmt when they parallelize walking
// a file tree.
//
// After a long discussion on go.dev/issue/46279, we decided the
// best approach was for Go to raise the limit unconditionally for itself,
// and then leave old software to set the limit back as needed.
// Code that really wants Go to leave the limit alone can set the hard limit,
// which Go of course has no choice but to respect.
func init() {
	var lim Rlimit
	if err := Getrlimit(RLIMIT_NOFILE, &lim); err == nil && lim.Max > 0 && lim.Cur < lim.Max-1 {
		origRlimitNofile.Store(&lim)
		nlim := lim

		// We set Cur to Max - 1 so that we are more likely to
		// detect cases where another process uses prlimit
		// to change our resource limits. The theory is that
		// using prlimit to change to Cur == Max is more likely
		// than using prlimit to change to Cur == Max - 1.
		// The place we check for this is in exec_linux.go.
		nlim.Cur = nlim.Max - 1

		adjustFileLimit(&nlim)
		setrlimit(RLIMIT_NOFILE, &nlim)
	}
}`,
		notes: [
			'Lines 4 to 8 give the reason for the low default: `select()` takes an `fd_set` of fixed size, `FD_SETSIZE` (1024) on Linux. The comment on line 8 draws the conclusion: Go does not use `select`, so the low limit only gets in its way.',
			'Line 20 reads the current limits with `getrlimit()`. Under systemd\'s default of 1024:524288, `lim.Cur` is 1024 and `lim.Max` is 524288, so the condition is true.',
			'Line 30 sets the soft limit to `Max - 1`, here 524287. The comment on lines 24 to 29 explains the minus one: if the value later differs, another process changed it with `prlimit`. Line 33 needs no privilege, because the new soft limit stays under the hard limit.',
			'Line 21 keeps the original limit. Before `execve()` in a child, [`exec_linux.go`](' + GO + '/exec_linux.go#L670-L686) puts the original soft limit back, so an old program started by a Go binary still gets 1024 and its `select()` keeps working.'
		]
	},
	tradeoff: {
		gain: [
			'With a soft limit of 1024, no descriptor number reaches 1024, so old code that passes descriptors to `select()` keeps working.',
			'`open()` always returns the lowest free number, so `ls -l /proc/<pid>/fd` lists every open file and socket of a process, and `ls /proc/<pid>/fd | wc -l` counts them.'
		],
		cost: [
			'A server that holds more than about 1,020 connections gets `EMFILE` on `accept()` unless it raises its soft limit, as the Go runtime does at startup.',
			'Limits are per process and inherited at `fork()`. `ulimit -n 65536` in your shell does nothing for a service that systemd already started.'
		]
	},
	task: {
		prompt: 'A service logs `Too many open files`. `cat /proc/<pid>/limits` shows `Max open files 1024 524288 files`, and `ls /proc/<pid>/fd | wc -l` prints 1024. What do these numbers tell you, and what do you check next?',
		hint: 'Compare the count with the soft limit. Then look at what the descriptors point to with `ls -l /proc/<pid>/fd`.',
		answer: [
			'The soft limit is 1024 and the hard limit is 524288. 1024 entries means every number from 0 to 1023 is in use, so the next `open()` or `accept()` gets `EMFILE`.',
			'`ls -l /proc/<pid>/fd` shows what each number is: `socket:[...]` for connections, a path for files, `pipe:[...]` for pipes. Thousands of the same path, or a count that keeps climbing at steady traffic, point to a descriptor leak, and a higher limit would only push the error later.',
			'If the count matches real load, the program needs a higher soft limit. systemd\'s docs suggest the program raise its own soft limit to the hard limit, as Go does, as long as it does not use `select()`.',
			'For comparison, captured in this session: under `ulimit -Sn 1024`, Python opened 1021 files (fds 3 to 1023), and the next open failed with errno 24.'
		]
	},
	quiz: [
		{
			q: 'A process has fds 0, 1 and 2 open and a soft limit of 1024. It opens files in a loop and never closes them. Which open fails first?',
			options: [
				'The 1024th open, the one that would get fd 1026',
				'The 1022nd open, once fds 0 to 1023 are all in use',
				'The 1025th open, one past the limit of 1024 files',
				'None, until the machine runs out of memory'
			],
			answer: 1,
			why: 'RLIMIT_NOFILE is one more than the highest allowed fd, so fds 0 to 1023 are usable. Three are taken at start, so 1021 opens succeed (fds 3 to 1023) and the 1022nd gets `EMFILE`.'
		},
		{
			q: 'A process has fds 0 to 6 open. It closes fd 4, then calls `open()`. Which fd does it get?',
			options: [
				'7, the next number after the highest one in use',
				'4, the lowest number not currently open',
				'A random free number, to make fds hard to guess',
				'1024, the first number above the soft limit'
			],
			answer: 1,
			why: 'open(2): the call returns "the lowest-numbered file descriptor not currently open for the process". Number 4 is free again, so it is reused before 7.'
		},
		{
			q: 'Why does systemd default to a soft limit of 1024 while the hard limit is 524288?',
			options: [
				'Each descriptor reserves 1 MB of kernel memory, so 1024 caps the cost at 1 GB',
				'The kernel cannot track more than 1024 descriptors per process unless root asks',
				'`select()` cannot handle fd numbers of 1024 or more, and programs using it would break',
				'A low limit stops a fork bomb from creating too many processes'
			],
			answer: 2,
			why: 'systemd.exec(5): "select(2) cannot function with file descriptors above 1023 on Linux". The hard limit stays high so that programs which use `poll()` or `epoll` can raise their own soft limit.'
		}
	],
	recall: {
		q: 'With a soft RLIMIT_NOFILE of 1024, what is the highest fd a process can get, and what does the next `open()` return?',
		a: 'fd 1023, because the limit is one more than the highest fd number. The next `open()` fails with `EMFILE`, errno 24, "Too many open files".'
	},
	sources: [
		{ title: 'open(2), Linux manual page', url: 'https://man7.org/linux/man-pages/man2/open.2.html' },
		{ title: 'getrlimit(2), RLIMIT_NOFILE', url: 'https://man7.org/linux/man-pages/man2/getrlimit.2.html' },
		{ title: 'proc_pid_fd(5), /proc/pid/fd', url: 'https://man7.org/linux/man-pages/man5/proc_pid_fd.5.html' },
		{ title: 'select(2), FD_SETSIZE', url: 'https://man7.org/linux/man-pages/man2/select.2.html' },
		{ title: 'systemd.exec(5), LimitNOFILE=', url: 'https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html' },
		{ title: 'systemd-system.conf(5), DefaultLimitNOFILE=', url: 'https://www.freedesktop.org/software/systemd/man/latest/systemd-system.conf.html' },
		{ title: 'Go source, src/syscall/rlimit.go', url: 'https://github.com/golang/go/blob/c3a068eec992b5ae783abce1a9d03f617b671ea2/src/syscall/rlimit.go' }
	]
};
