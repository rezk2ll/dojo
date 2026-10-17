const BPFTRACE = 'https://github.com/bpftrace/bpftrace/blob/62d1ff612c2c91fea4771357a34b9bd7411687e5';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'ebpf',
	part: 'Containers from the kernel up',
	title: 'eBPF in practice',
	minutes: 10,
	hook: [
		'Brendan Gregg ran `dd if=/dev/zero of=/dev/null bs=1 count=500k`: 512,000 one-byte reads and as many writes. It finished in 0.103851 seconds. Under `strace -eaccept`, which traces a call dd never makes, it took 45.9599 seconds. His post: "That\'s 442x slower."',
		'He explains the cost: "The performance overhead of strace is relative to the system call rate it is instrumenting." strace runs the process under ptrace(2), which stops it at the entry to and exit from system calls. In production, he warns, this could "cause the target to fail-over due to exceeding latency thresholds".',
		'With eBPF, **a small program runs inside the kernel at the event** and adds 1 to a counter in a map. `bpftrace -e \'tracepoint:raw_syscalls:sys_enter { @[comm] = count(); }\'` counts every system call by process name, and bpftrace prints only the totals when you press Ctrl-C.'
	],
	terms: [
		{ term: 'eBPF program', def: 'Bytecode loaded into the kernel with the bpf(2) system call and attached to an event, such as a tracepoint or the arrival of a network packet. It runs each time the event fires.' },
		{ term: 'Probe', def: 'The event a bpftrace program attaches to. `tracepoint:syscalls:sys_enter_openat` is a tracepoint, a fixed point in the kernel. `kprobe:vfs_read` is a kprobe, placed on any kernel function.' },
		{ term: 'Map', def: 'A key-value store in the kernel, shared between eBPF programs and the user process that loaded them. In bpftrace, a name starting with `@` is a map.' },
		{ term: 'Verifier', def: 'The part of the kernel that checks an eBPF program at load time and refuses it if it could read an unset register, an unchecked pointer or memory out of bounds.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['script["opensnoop.bt"] -->|"bpftrace compiles with LLVM"| bc["BPF bytecode"]'],
				highlight: ['script', 'bc'],
				note: 'bpftrace "uses LLVM as a compiler backend, and libbpf for interacting with the Linux BPF subsystem". LLVM turns the script into bytecode for the BPF virtual machine. bpftrace usually runs as root.'
			},
			{
				add: ['bc -->|"bpf(BPF_PROG_LOAD)"| ver{"verifier: simulate every instruction"}', 'ver -->|"unsafe"| rej["load refused, e.g. R0 invalid mem access"]'],
				highlight: ['ver', 'rej'],
				note: 'The verifier "descends all possible paths" and "simulates execution of every insn". A program that writes through the result of `map_lookup_elem()` without a NULL check is refused with `R0 invalid mem access \'map_value_or_null\'`. A refused program never runs.'
			},
			{
				add: ['ver -->|"safe"| attach["attached to sys_enter_openat and sys_exit_openat"]'],
				highlight: ['attach'],
				note: 'bpf(2) says the verifier "statically determines that the eBPF program terminates and is safe to execute". The program is then attached to its tracepoints. From now on it runs in the kernel each time any thread on the machine enters or leaves `openat`.'
			},
			{
				add: ['attach -->|"each openat: run in kernel"| map[("map @filename keyed by tid")]', 'map -->|"on exit: one line per open"| user["bpftrace prints PID COMM FD ERR PATH"]'],
				highlight: ['map', 'user'],
				note: 'At entry, the program stores the path pointer in a map under the thread ID. At exit, it reads it back, prints the file descriptor or the errno, then deletes the entry. Only the printed lines and the map contents reach user space.'
			},
			{
				add: ['user -->|"Ctrl-C, bpftrace exits"| gone["maps printed, programs unloaded"]'],
				highlight: ['gone'],
				note: 'The tutorial: "Maps are automatically printed when bpftrace ends". bpf(2): programs are "automatically unloaded when the process exits", unless a subsystem such as `tc` keeps a reference. Nothing stays in the kernel after a bpftrace session.'
			}
		]
	},
	example: {
		title: 'tools/opensnoop.bt: trace every open on the machine',
		repo: 'bpftrace/bpftrace',
		url: `${BPFTRACE}/tools/opensnoop.bt#L66-L103`,
		lang: 'c',
		code: `tracepoint:syscalls:sys_enter_open,
tracepoint:syscalls:sys_enter_openat,
tracepoint:syscalls:sys_enter_openat2
{
  @filename[tid] = args.filename;
}

macro sys_exit(ret, $file)
{
  $ret = ret;
  $fd = ($ret >= 0) ? $ret : (-1);
  $errno = ($ret >= 0) ? 0 : (-$ret);

  printf("%-6d %-16s %4d", pid, comm, $fd);

  if errname {
    printf(" %16s ", strerror($errno));
  } else {
    printf(" %3d ", $errno);
  }

  // Skip display cwd if path start with '/'.
  if ($file[0] != "/"[0]) {
    printf("%s\n", abs_path($file, max_path_depth));
  } else {
    printf("%s\n", $file);
  }
}

tracepoint:syscalls:sys_exit_open,
tracepoint:syscalls:sys_exit_openat,
tracepoint:syscalls:sys_exit_openat2
/@filename[tid]/
{
  $file = str(@filename[tid]);
  sys_exit(args.ret, $file);
  delete(@filename, tid);
}`,
		notes: [
			'Lines 1 to 3 attach one action to three tracepoints: `open`, `openat` and `openat2`. The tutorial notes that with glibc 2.26 or later "the `open` wrapper always calls the `openat` syscall".',
			'Line 5 stores the path pointer in the map `@filename`, keyed by `tid`. The tutorial explains the key: a thread can only be executing one system call at a time, so the thread ID is unique while the call is in flight.',
			'Lines 10 to 12: a return value of 0 or more is the new file descriptor; a negative one is minus the errno. Line 14 prints the PID, the process name and the descriptor. The header of the file shows a real line: `1400 systemd-oomd 13 0 /sys/fs/cgroup/.../memory.pressure`.',
			'Line 33 is a filter: the exit action runs only if the entry was seen. Without it, a call already in progress when bpftrace started would reach the exit with no stored path. Line 37 deletes the entry so the map does not grow.',
			'The file\'s usage line is `opensnoop.bt -- [--depth=<N>] [--errname]`. With `--errname`, line 17 prints `strerror($errno)`, such as "No such file or directory", in place of the number.'
		]
	},
	tradeoff: {
		gain: [
			'The counting happens in the kernel, and a bpftrace map sends only totals to user space. strace stops the traced process at system calls through ptrace, which cost 442x in Gregg\'s worst case.',
			'The verifier refuses unsafe code before it runs: an unset register, an unchecked map lookup, a stack access out of bounds.',
			'A script on `tracepoint:syscalls:sys_enter_openat` keeps working on new kernels: the tutorial says tracepoints "are preferred over kprobes" because they have a stable API.'
		],
		cost: [
			'The bpftrace man page says a command it starts "runs with the same privileges as bpftrace itself (usually root)". Linux 5.8 added `CAP_BPF` "to separate out BPF functionality from the overloaded CAP_SYS_ADMIN capability", and Docker\'s default seccomp profile allows `bpf` only with one of those two.',
			'A kprobe script can break on a new kernel: the tutorial gives "no guarantee that your kprobe/kretprobe will work between kernel versions".',
			'A probe on a hot event runs on every event. The tutorial samples stacks at 99 Hz, "not too frequent as to perturb performance".'
		]
	},
	task: {
		prompt: 'A service on a host starts but ignores its config file, and you suspect it looks for the file at a path that does not exist. Pick the bpftrace tool or one-liner from this chapter that answers it, write the exact command, and say which columns of the output you read.',
		hint: 'You want every open with its error code, for one process name, while the service starts. Look at the usage line of `opensnoop.bt`.',
		answer: [
			'Run `opensnoop.bt -- --errname` in one terminal, then start the service in another. Each `open`, `openat` or `openat2` on the machine prints one line: `PID COMM FD ERR PATH`.',
			'Read the lines whose `COMM` is the service. `FD` is -1 for a failed open, and `ERR` names the error, such as "No such file or directory", next to the `PATH` it tried.',
			'A long run of failed opens on paths like `/etc/<service>/<name>.conf` shows where it searches. The tool\'s header comment says the same: opensnoop "can be useful for discovering configuration and log files, if used during application startup".',
			'To count instead of list, `bpftrace -e \'tracepoint:raw_syscalls:sys_enter { @[comm] = count(); }\'` gives the number of system calls per process name at Ctrl-C.'
		]
	},
	quiz: [
		{
			q: 'Why can `bpftrace` count every system call on a busy host with far less slowdown than `strace -c`?',
			options: [
				'bpftrace samples one system call in every hundred and scales the counts up',
				'A program in the kernel updates a map, and bpftrace reads only the totals',
				'bpftrace attaches to the process with ptrace like strace, but only on one CPU',
				'The kernel already keeps per-process syscall counts in `/proc`, which bpftrace reads'
			],
			answer: 1,
			why: 'The `count()` runs in the kernel at the tracepoint and adds 1 to a map entry. The traced process is not stopped for a tracer in user space, as it is under strace\'s ptrace. strace\'s cost "is relative to the system call rate", 442x for Gregg\'s dd test.'
		},
		{
			q: 'Your eBPF program writes through the pointer returned by `map_lookup_elem()` without checking it for NULL. What happens?',
			options: [
				'The kernel runs it, and a NULL pointer crashes the machine',
				'The kernel runs it, and the write is silently dropped when the pointer is NULL',
				'The verifier refuses the program at load time with `R0 invalid mem access`',
				'bpftrace adds the NULL check for you, so the program loads anyway'
			],
			answer: 2,
			why: 'The verifier simulates every path, and after the lookup R0 has type `map_value_or_null`. Writing through it on the NULL path is unsafe, so the load fails with `R0 invalid mem access \'map_value_or_null\'`. The program never runs.'
		},
		{
			q: 'A bpftrace script on `kprobe:vfs_read` works on one server and fails on another with a newer kernel. What is the likely cause?',
			options: [
				'kprobes depend on kernel function names and arguments, which can change',
				'The newer kernel turned off eBPF for every program that reads files',
				'The verifier on newer kernels refuses any program attached to a kprobe',
				'The script must be recompiled with the newer version of bpftrace'
			],
			answer: 0,
			why: 'A kprobe attaches to an internal kernel function. The tutorial: "the function names, arguments, return values, and roles may change". A tracepoint has a stable interface, which is why the tutorial prefers it.'
		}
	],
	recall: {
		q: 'What does the kernel check before an eBPF program runs, and where does a bpftrace `count()` keep its numbers?',
		a: 'The verifier simulates every instruction on every path and refuses unsafe programs, for example with `R0 invalid mem access \'map_value_or_null\'`. `count()` adds to a map in the kernel, and bpftrace prints it when it exits.'
	},
	sources: [
		{ title: 'Brendan Gregg, strace Wow Much Syscall (2014)', url: 'https://www.brendangregg.com/blog/2014-05-11/strace-wow-much-syscall.html' },
		{ title: 'bpftrace, The bpftrace One-Liner Tutorial', url: `${BPFTRACE}/docs/tutorial_one_liners.md` },
		{ title: 'bpftrace, README', url: `${BPFTRACE}/README.md` },
		{ title: 'bpftrace, man page bpftrace(8)', url: `${BPFTRACE}/man/adoc/bpftrace.adoc` },
		{ title: 'Linux kernel docs, eBPF verifier', url: 'https://docs.kernel.org/bpf/verifier.html' },
		{ title: 'bpf(2), Linux manual page', url: 'https://man7.org/linux/man-pages/man2/bpf.2.html' },
		{ title: 'ptrace(2), Linux manual page', url: 'https://man7.org/linux/man-pages/man2/ptrace.2.html' },
		{ title: 'capabilities(7), Linux manual page', url: 'https://man7.org/linux/man-pages/man7/capabilities.7.html' }
	]
};
