const PROFILES = 'https://github.com/moby/profiles/blob/4b8214fc4971e06172938a1f1554ccff6647ee80';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'seccomp',
	part: 'Containers from the kernel up',
	title: 'seccomp',
	minutes: 10,
	hook: [
		'July 2021, a Fedora 34 host. A user runs `docker run -it registry.fedoraproject.org/fedora:rawhide curl google.com` and gets `curl: (6) getaddrinfo() thread failed to start`. curl cannot start the thread that resolves the host name.',
		'strace shows the failing call: `clone3(...) = -1 EPERM (Operation not permitted)`. The report in moby/moby#42680 explains that the new glibc tries `clone3` first: "it will look for ENOSYS errno and fallback to "clone". The EPERM errno meanwhile is treated as a fatal error."',
		'The EPERM came from Docker\'s default seccomp profile, a filter that answers every system call missing from its list with EPERM. **The fix, merged on 30 July 2021, makes the profile return `ENOSYS` for `clone3`**, so glibc falls back to `clone` and curl starts its thread.'
	],
	terms: [
		{ term: 'seccomp filter', def: 'A small BPF program attached to a process. The kernel runs it on each system call, with the call number and arguments, before the call executes. `Seccomp: 2` in `/proc/<pid>/status` means a filter is active.' },
		{ term: 'Default action', def: 'What the profile does with a system call that no rule names. In Docker\'s default profile it is `SCMP_ACT_ERRNO` with `EPERM`: the call fails with "Operation not permitted" and does not run.' },
		{ term: '`errnoRet`', def: 'The error number a rule returns instead of running the call. Docker\'s profile sets it to `ENOSYS` (38, "Function not implemented") for `clone3`.' },
		{ term: 'RuntimeDefault', def: 'The Kubernetes name for the container runtime\'s default profile, set in `securityContext.seccompProfile.type`.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['run["docker run python:3.12-alpine"] --> proc["container process: Seccomp 2, Seccomp_filters 1"]'],
				highlight: ['run', 'proc'],
				note: 'Docker turns its default profile into a filter and the container\'s process starts with it attached. `grep Seccomp /proc/self/status` prints `Seccomp: 2` (filter mode) and `Seccomp_filters: 1`. With `--security-opt seccomp=unconfined`, both lines show 0.'
			},
			{
				add: ['proc -->|"syscall(nr, args)"| filt{"filter: which rule matches nr?"}'],
				highlight: ['filt'],
				note: 'Each system call enters the kernel and goes through the filter first. The filter sees the call number for this architecture and its arguments, and returns an action. seccomp(2) lists them, from `SECCOMP_RET_KILL_PROCESS` down to `SECCOMP_RET_ALLOW`.'
			},
			{
				add: ['filt -->|"read, openat, clone: allowed"| run2["the call runs as usual"]'],
				highlight: ['run2'],
				note: 'Most calls a program makes are on the allowlist, and the filter returns allow. The kernel then runs the call with its usual checks, including the capability checks from the previous chapter.'
			},
			{
				add: ['filt -->|"io_uring_setup: no rule"| eperm["-1 EPERM, call not executed"]', 'filt -->|"clone3: errnoRet ENOSYS"| enosys["-1 ENOSYS, glibc falls back to clone"]'],
				highlight: ['eperm', 'enosys'],
				note: 'A call that no rule names gets the default action. In this session, `io_uring_setup` returned -1 with "Operation not permitted" in the container and a file descriptor (3) on the host. `clone3` returned "Function not implemented", the `ENOSYS` its rule asks for.'
			},
			{
				add: ['proc -->|"fork, execve"| child["child process: same filter"]'],
				highlight: ['child'],
				note: 'seccomp(2): with fork allowed, "any child processes will be constrained to the same system call filters as the parent", and the filters are "preserved across a call to execve(2)". A process in the container cannot remove the filter it inherited.'
			}
		]
	},
	example: {
		title: 'seccomp/default_linux.go: rules of Docker\'s default profile',
		repo: 'moby/profiles',
		url: `${PROFILES}/seccomp/default_linux.go#L782-L1029`,
		lang: 'go',
		code: `		{
			LinuxSyscall: specs.LinuxSyscall{
				Names: []string{
					"bpf",
					"clone",
					"clone3",
					"fanotify_init",
					"fsconfig",
					"fsmount",
					"fsopen",
					"fspick",
					"lookup_dcookie",
					"lsm_get_self_attr", // kernel v6.8, libseccomp v2.6.0
					"lsm_list_modules",  // kernel v6.8, libseccomp v2.6.0
					"lsm_set_self_attr", // kernel v6.8, libseccomp v2.6.0
					"mount",
					"mount_setattr",
					"move_mount",
					"open_tree",
					"perf_event_open",
					"quotactl",
					"quotactl_fd",
					"setdomainname",
					"sethostname",
					"setns",
					"syslog",
					"umount",
					"umount2",
					"unshare",
				},
				Action: specs.ActAllow,
			},
			Includes: &Filter{
				Caps: []string{"CAP_SYS_ADMIN"},
			},
		},
…
		{
			LinuxSyscall: specs.LinuxSyscall{
				Names: []string{
					"clone3",
				},
				Action:   specs.ActErrno,
				ErrnoRet: &nosys,
			},
			Excludes: &Filter{
				Caps: []string{"CAP_SYS_ADMIN"},
			},
		},
…
	errnoRet := uint(unix.EPERM)
	return &Seccomp{
		LinuxSeccomp: specs.LinuxSeccomp{
			DefaultAction:   specs.ActErrno,
			DefaultErrnoRet: &errnoRet,
		},
		ArchMap:  arches(),
		Syscalls: syscalls,
	}`,
		notes: [
			'Lines 4 to 29 name 26 calls, including `mount`, `unshare`, `setns` and `bpf`. Lines 33 to 35 add the rule only when the container has `CAP_SYS_ADMIN`. Docker\'s docs: "The default seccomp profile will adjust to the selected capabilities".',
			'Lines 38 to 49 are the 2021 fix: `clone3` gets `ActErrno` with `ErrnoRet: &nosys`, so it fails with `ENOSYS` instead of `EPERM`. Lines 46 and 47 exclude containers with `CAP_SYS_ADMIN`: they get `clone3` from the rule on lines 1 to 36 (line 6).',
			'Lines 54 and 55 set the default action: `ActErrno` with `EPERM`. Any call with no rule in the file ends there. `io_uring_setup` has no rule since [moby/moby#46762](https://github.com/moby/moby/pull/46762) (2023), which quotes containerd: "Security experts generally believe io_uring to be unsafe."',
			'Docker\'s docs describe the result as an allowlist that "disables around 44 system calls out of 300+". Their table gives a reason for each blocked call, for example `keyctl`: "Prevent containers from using the kernel keyring, which is not namespaced."'
		]
	},
	tradeoff: {
		gain: [
			'Code paths in the kernel behind blocked calls are out of reach from the container: `io_uring_*`, `keyctl`, `kexec_load`, `open_by_handle_at` (which Docker\'s docs call the "Cause of an old container breakout").',
			'Docker applies the profile to every container unless you pass `--security-opt seccomp=unconfined`.'
		],
		cost: [
			'A new system call in a new libc can break an old profile: Fedora rawhide\'s glibc called `clone3` in 2021 and curl could not start a thread.',
			'The error names no filter. curl printed `getaddrinfo() thread failed to start`, and only strace showed `clone3` returning `EPERM`.',
			'Kubernetes runs pods `Unconfined` unless the pod sets `RuntimeDefault` or the kubelet runs with `--seccomp-default`.'
		]
	},
	task: {
		prompt: 'Run `docker run --rm alpine:3.20 grep Seccomp /proc/self/status`, then the same with `--security-opt seccomp=unconfined`. Then, in `python:3.12-alpine` on x86-64, call `io_uring_setup` (system call 425) with `ctypes`: `libc.syscall(425, 8, buf)`, where `buf` is 120 zero bytes. Do it with the default profile, with `seccomp=unconfined`, and with `--cap-add=SYS_ADMIN`. Explain each result.',
		hint: 'Search `default_linux.go` for `io_uring`. Then check which rules in the profile depend on `CAP_SYS_ADMIN`.',
		answer: [
			'Default profile: `Seccomp: 2` and `Seccomp_filters: 1`. Unconfined: both 0, no filter.',
			'Default profile: `io_uring_setup` returns -1 with "Operation not permitted". No rule names it, so the default action returns `EPERM` and the call never runs.',
			'Unconfined: it returns 3, a new file descriptor for the ring. The kernel ran the call.',
			'With `--cap-add=SYS_ADMIN` it still returns `EPERM`. That capability unlocks the 26 calls of the `CAP_SYS_ADMIN` rule, and `io_uring_setup` is not one of them. Only a custom profile or `unconfined` lets it through.'
		]
	},
	quiz: [
		{
			q: 'In a container with Docker\'s default profile, a program calls a system call that the profile does not name. What happens?',
			options: [
				'The kernel kills the process with `SIGSYS` and a core dump',
				'The call runs, and the kernel writes a line to the audit log',
				'The call returns -1 with `EPERM` and does not run',
				'The call returns -1 with `ENOSYS`, like `clone3`'
			],
			answer: 2,
			why: 'The profile\'s `defaultAction` is `SCMP_ACT_ERRNO` with `DefaultErrnoRet` set to `EPERM`. The filter returns that errno to the program without executing the call. `ENOSYS` is only for calls with their own `errnoRet`, such as `clone3`.'
		},
		{
			q: 'Why did the 2021 fix make `clone3` return `ENOSYS` instead of allowing it?',
			options: [
				'Because `ENOSYS` makes the kernel retry the call as `clone`',
				'Because glibc falls back to `clone` on `ENOSYS`, and `clone`\'s rules check its flags',
				'Because `clone3` did not exist on the kernels Docker supported in 2021',
				'Because seccomp can only return `ENOSYS` or `EPERM`'
			],
			answer: 1,
			why: 'The `clone` rules allow the call only when the namespace flags in its first argument are clear. A filter sees the call number and six argument values, and `clone3` passes its flags inside `struct clone_args` in memory. The profile answers "not implemented", and glibc uses `clone`, whose flags it can check.'
		},
		{
			q: 'A service in a container fails on `io_uring_setup` with `EPERM`. You add `--cap-add=SYS_ADMIN`. What happens?',
			options: [
				'It now works, because the profile adapts to `CAP_SYS_ADMIN`',
				'It fails with `ENOSYS` instead, as `clone3` does',
				'Docker refuses to start the container with that capability',
				'It still fails with `EPERM`, because no rule names `io_uring_setup`'
			],
			answer: 3,
			why: 'The `CAP_SYS_ADMIN` rule allows 26 calls such as `mount` and `unshare`. `io_uring_setup` is in none of the rules, so the default action still answers `EPERM`. In this session it failed the same way with the capability added.'
		}
	],
	recall: {
		q: 'What does Docker\'s default seccomp profile return for a system call it does not name, and what does it return for `clone3`?',
		a: '`EPERM` ("Operation not permitted"), the default action, without running the call. For `clone3` it returns `ENOSYS`, so glibc falls back to `clone` (the fix for moby/moby#42680 in July 2021).'
	},
	sources: [
		{ title: 'seccomp(2), Linux manual page', url: 'https://man7.org/linux/man-pages/man2/seccomp.2.html' },
		{ title: 'proc_pid_status(5), Linux manual page', url: 'https://man7.org/linux/man-pages/man5/proc_pid_status.5.html' },
		{ title: 'clone(2), Linux manual page', url: 'https://man7.org/linux/man-pages/man2/clone.2.html' },
		{ title: 'Docker docs, Seccomp security profiles for Docker', url: 'https://docs.docker.com/engine/security/seccomp/' },
		{ title: 'moby/moby#42680, clone3 blocked by the default seccomp profile', url: 'https://github.com/moby/moby/issues/42680' },
		{ title: 'moby/moby#42681, seccomp: add support for "clone3" syscall in default policy', url: 'https://github.com/moby/moby/pull/42681' },
		{ title: 'moby/moby#46762, seccomp: block io_uring_* syscalls in default profile', url: 'https://github.com/moby/moby/pull/46762' },
		{ title: 'Kubernetes docs, Restrict a Container\'s Syscalls with seccomp', url: 'https://kubernetes.io/docs/tutorials/security/seccomp/' }
	]
};
