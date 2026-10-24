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
		],
		steps: [
			{
				title: 'Check the filter is on',
				questions: [
					{ q: 'The default run prints `Seccomp: 2`. What does 2 mean?', options: ['Two profiles are stacked', 'A seccomp filter is active', 'seccomp is in strict mode', 'The filter has blocked 2 calls so far'], answer: 1, why: 'proc_pid_status(5): 2 is filter mode. `Seccomp_filters: 1` says one filter is attached.' },
					{ q: 'With `--security-opt seccomp=unconfined`, what do the two lines show?', options: ['`Seccomp: 2`, `Seccomp_filters: 0`', '`Seccomp: 1`, `Seccomp_filters: 1`', 'Both lines are missing', 'Both 0'], answer: 3, why: 'Unconfined means Docker attaches no filter, so the process has none.' },
					{ q: 'When does Docker attach the default profile?', options: ['To every container, unless you pass `seccomp=unconfined`', 'Only to containers that run as root', 'Only when the image asks for it', 'Only on hosts with AppArmor'], answer: 0, why: 'Docker applies the profile to every container unless you opt out with `--security-opt seccomp=unconfined`.' },
					{ q: 'A process in the container forks and runs `sh`. Does `sh` have the filter?', options: ['No, `execve` clears it', 'Only if `sh` is setuid', 'Yes, children keep it and it survives `execve`', 'Only until `sh` calls `prctl`'], answer: 2, why: 'seccomp(2): children are "constrained to the same system call filters as the parent", and filters are "preserved across a call to execve(2)".' }
				]
			},
			{
				title: 'Call it under the default profile',
				questions: [
					{ q: 'What does `libc.syscall(425, 8, buf)` return there?', options: ['-1 with "Operation not permitted"', '-1 with "Function not implemented"', '3, a file descriptor', '0, with nothing set up'], answer: 0, why: 'In this session it returned -1 and errno `EPERM` under the default profile.' },
					{ q: 'Which errno number does that call set?', options: ['38', '13', '0', '1'], answer: 3, why: '`EPERM` is errno 1, "Operation not permitted". 38 is `ENOSYS` and 13 is `EACCES`.' },
					{ q: 'Which seccomp action would have killed the process instead of returning an error?', options: ['`SECCOMP_RET_ALLOW`', '`SECCOMP_RET_ERRNO`', '`SECCOMP_RET_KILL_PROCESS`', '`SECCOMP_RET_LOG`'], answer: 2, why: 'seccomp(2) lists the actions from `SECCOMP_RET_KILL_PROCESS` down to `SECCOMP_RET_ALLOW`. Docker\'s default uses `ERRNO`, so the program lives on.' },
					{ q: 'Why does the profile leave `io_uring_setup` out?', options: ['It does not exist on x86-64', 'It was judged unsafe: moby/moby#46762 quotes "io_uring to be unsafe"', 'It needs `CAP_SYS_ADMIN`', 'It is too slow inside containers'], answer: 1, why: 'Since moby/moby#46762 in 2023, `io_uring_*` calls have no rule, citing containerd: "Security experts generally believe io_uring to be unsafe."' }
				]
			},
			{
				title: 'Call it unconfined',
				questions: [
					{ q: 'With `seccomp=unconfined`, what does the same call return?', options: ['-1 with `EPERM`', '3, a new file descriptor for the ring', '-1 with `ENOSYS`', 'The container fails to start'], answer: 1, why: 'With no filter, the kernel ran the call and returned the descriptor of the new ring.' },
					{ q: 'What does that result prove?', options: ['The default profile, not the kernel, refused the call', 'The call needs root on the host', 'Python caches syscall results', 'The kernel lacks io_uring support'], answer: 0, why: 'Same kernel, same image, same code: only the filter changed between the two runs.' },
					{ q: 'What else does `unconfined` open?', options: ['Only `io_uring_*`', 'Only calls that need a capability', 'Every call the default profile blocks, such as `keyctl` and `kexec_load`', 'Nothing, capabilities still block all of them'], answer: 2, why: '`unconfined` removes the whole filter, so the roughly 44 calls Docker blocks are back. Capability checks still apply, but not the filter.' },
					{ q: 'In Kubernetes, a pod sets no `seccompProfile` and the kubelet has no `--seccomp-default`. What does it get?', options: ['Docker\'s default profile', 'A profile that blocks everything', '`RuntimeDefault`', '`Unconfined`'], answer: 3, why: 'Kubernetes runs pods `Unconfined` unless the pod sets `RuntimeDefault` or the kubelet runs with `--seccomp-default`.' }
				]
			},
			{
				title: 'Try CAP_SYS_ADMIN',
				questions: [
					{ q: 'With `--cap-add=SYS_ADMIN`, what does `grep Seccomp /proc/self/status` print?', options: ['`Seccomp: 0`', '`Seccomp: 1`', '`Seccomp: 2`', 'No `Seccomp` line'], answer: 2, why: 'Adding a capability changes which rules match, not whether the filter is attached. The default profile is still on.' },
					{ q: 'What does `CAP_SYS_ADMIN` change in the profile?', options: ['It allows a list of 26 calls such as `mount`, `unshare` and `setns`', 'It switches the default action to allow', 'It removes the filter', 'Nothing, the profile ignores capabilities'], answer: 0, why: 'The rule with `Includes: Caps: CAP_SYS_ADMIN` adds those 26 calls. "The default seccomp profile will adjust to the selected capabilities".' },
					{ q: 'What about `clone3` with `CAP_SYS_ADMIN`?', options: ['Still `ENOSYS`', 'Allowed: the `CAP_SYS_ADMIN` rule names it, and the `ENOSYS` rule excludes that capability', 'Blocked with `EPERM`', 'Killed with `SIGSYS`'], answer: 1, why: 'The `ENOSYS` rule has `Excludes: Caps: CAP_SYS_ADMIN`, and line 6 lists `clone3` in the allowed rule.' },
					{ q: 'A service really needs io_uring. What lets the call through and keeps the rest of the filter?', options: ['`--cap-add=ALL`', '`--privileged` is the only way', 'Running the container as root', 'A custom profile that allows `io_uring_setup`'], answer: 3, why: 'Only a custom profile or `unconfined` lets it through, and a custom profile keeps every other rule.' }
				]
			}
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
	lab: {
		minutes: 20,
		goal: 'See the default profile answer `EPERM` and `ENOSYS`, then write a small profile of your own and watch it block one call.',
		steps: [
			'Check the filter: `docker run --rm alpine:3.20 grep Seccomp /proc/self/status`, then the same with `--security-opt seccomp=unconfined` before the image name.',
			'Save a test that calls `io_uring_setup` (425) and `clone3` (435) on x86-64: `PY=\'import ctypes,os; libc=ctypes.CDLL(None,use_errno=True); b=ctypes.create_string_buffer(120); r=libc.syscall(425,8,b); print("io_uring_setup", r, os.strerror(ctypes.get_errno()) if r<0 else "fd"); r=libc.syscall(435,None,0); print("clone3", r, os.strerror(ctypes.get_errno()))\'`.',
			'Run it three ways: `docker run --rm python:3.12-alpine python -c "$PY"`, then with `--security-opt seccomp=unconfined`, then with `--cap-add=SYS_ADMIN`.',
			'Write a profile that allows everything except `mkdir`: `mkdir -p ~/seccomp-lab && cd ~/seccomp-lab && printf \'{"defaultAction":"SCMP_ACT_ALLOW","syscalls":[{"names":["mkdir","mkdirat"],"action":"SCMP_ACT_ERRNO"}]}\\n\' > no-mkdir.json`.',
			'Use it: `docker run --rm --security-opt seccomp="$PWD/no-mkdir.json" alpine:3.20 sh -c \'mkdir /tmp/x; echo "exit $?"; touch /tmp/y && echo touch ok\'`.'
		],
		done: [
			'Step 1 prints `Seccomp: 2` and `Seccomp_filters: 1`, then 0 and 0.',
			'Default profile: `io_uring_setup -1 Operation not permitted` and `clone3 -1 Function not implemented`.',
			'Unconfined: `io_uring_setup 3 fd`, and `clone3` fails with `Invalid argument`, the kernel\'s own answer to a NULL argument.',
			'With `SYS_ADMIN`: `io_uring_setup` still says `Operation not permitted`, and `clone3` now says `Invalid argument`.',
			'Your profile: `mkdir` fails with `Operation not permitted`, while `touch ok` prints.'
		],
		solution: [
			'`EPERM` is the default action for calls with no rule. `ENOSYS` is the `errnoRet` of the `clone3` rule, so glibc falls back to `clone`.',
			'`Invalid argument` comes from the kernel itself: the filter let `clone3` through and the kernel rejected the empty arguments. With `SYS_ADMIN`, the profile allows `clone3` but still has no rule for `io_uring_setup`.',
			'A rule with `SCMP_ACT_ERRNO` and no `errnoRet` returns `EPERM`. Both `mkdir` and `mkdirat` are named because the program may use either one. Real profiles do the opposite: `SCMP_ACT_ERRNO` by default and an allowlist, like Docker\'s.'
		]
	},
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
