const RUNC = 'https://github.com/opencontainers/runc/blob/d2691cb3cb12a0d830d8bb65c3156e2c966d6f99';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'namespaces',
	part: 'Containers from the kernel up',
	title: 'Namespaces',
	minutes: 10,
	hook: [
		'You start a container with `docker run -d --name nsdemo busybox sleep 300`. `docker exec nsdemo ps` shows `sleep 300` as PID 1. On the host, `ps` shows the same process as PID 4145502, and `grep NSpid /proc/4145502/status` prints `NSpid: 4145502 1`. (Output captured on the machine this chapter was written on, Docker 29.9 with runc 1.5.2.)',
		'One process has two PIDs because it lives in two PID namespaces, the host\'s and the container\'s. Inside, `hostname` prints `90f67579c52c` while the host is `thinkPad`, and `ip link` lists only `lo` and `eth0`.',
		'`readlink /proc/1/ns/user` inside the container printed `user:[4026531837]`, the same value as on the host. **This container shares the host\'s user namespace**, so its root is UID 0 on the host too.'
	],
	terms: [
		{ term: 'Namespace', def: 'A kernel object that gives the processes inside it their own copy of one global resource: process IDs, mounts, network stack, hostname, user IDs, IPC, cgroup root or clocks. namespaces(7) lists 8 types.' },
		{ term: '`/proc/<pid>/ns`', def: 'A directory with one symbolic link per namespace of a process, such as `net -> net:[4026531833]`. Two processes are in the same namespace when the numbers match.' },
		{ term: 'unshare', def: 'The `unshare(2)` system call moves the caller into new namespaces given by `CLONE_NEW*` flags. The util-linux command `unshare` runs a program that way.' },
		{ term: 'nsenter', def: 'The util-linux command that runs a program inside the namespaces of another process, `-t <pid>`, by calling `setns(2)` on its `/proc/<pid>/ns/*` files.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['runc["runc init, stage 1"] -->|"unshare(CLONE_NEWNS | NEWUTS | NEWIPC | NEWNET | NEWPID | NEWCGROUP)"| ns["6 new namespaces, each with an inode number"]'],
				highlight: ['runc', 'ns'],
				note: 'The runtime calls `unshare(2)` with one `CLONE_NEW*` flag per namespace it wants. In the output above, the container had new pid, net, mnt, uts, ipc and cgroup namespaces, for example `net:[4026534677]` against the host\'s `net:[4026531833]`. No flag was given for the user namespace, so it stayed the host\'s.'
			},
			{
				add: ['ns -->|"fork: first child"| init["sleep 300: PID 1 inside, 4145502 on the host"]'],
				highlight: ['init'],
				note: 'A new PID namespace applies to children only. pid_namespaces(7): "the first child created by a process after a call to unshare(2) using the CLONE_NEWPID flag has the PID 1". The kernel gives that child a PID in each namespace up to the root, which is what the two numbers in `NSpid` show.'
			},
			{
				add: ['init --> uts["UTS: hostname 90f67579c52c"]', 'init --> mnt["Mount: its own mount table and a /proc for the new PID namespace"]'],
				highlight: ['uts', 'mnt'],
				note: 'In the UTS namespace, `sethostname(2)` changes the name for that namespace only, and the host keeps `thinkPad`. The mount namespace has its own mount table, with a `proc` mounted for the new PID namespace. So `ps` inside listed only PID 1 and the `ps` command itself.'
			},
			{
				add: ['init --> net["Network: lo, plus eth0, one end of a veth pair"]'],
				highlight: ['net'],
				note: 'A new network namespace has its own devices, routes, firewall rules, ports and `/proc/sys/net` values. Inside, `ip link` shows `eth0@if530`. On the host, interface 530 is `veth6abf4fb`, attached to `docker0`: the two ends of one veth pair. Here `net.core.somaxconn` read 4096, the kernel default for a new namespace (chapter 31).'
			},
			{
				add: ['admin["nsenter -t 4145502 -n ss -lnt"] -->|"setns(/proc/4145502/ns/net)"| net'],
				highlight: ['admin'],
				note: '`nsenter -t 4145502 -n` opens `/proc/4145502/ns/net`, calls `setns(2)` and runs the program there. Only the network namespace changes, so `ss` comes from the host\'s filesystem and lists the container\'s sockets. A namespace is torn down when its last process exits, unless a file descriptor or bind mount still holds one of these files.'
			}
		]
	},
	example: {
		title: 'libcontainer/nsenter/nsexec.c: runc joins, then unshares, then forks',
		repo: 'opencontainers/runc',
		url: `${RUNC}/libcontainer/nsenter/nsexec.c#L1032-L1132`,
		lang: 'c',
		code: `			if (config.namespaces)
				join_namespaces(config.namespaces);
…
			if (config.cloneflags & CLONE_NEWUSER) {
				try_unshare(CLONE_NEWUSER, "user namespace");
				config.cloneflags &= ~CLONE_NEWUSER;
…
				/* Become root in the namespace proper. */
				if (setresuid(0, 0, 0) < 0)
					bail("failed to become root in user namespace");
			}
…
			try_unshare(config.cloneflags, "remaining namespaces");
…
			/*
			 * TODO: What about non-namespace clone flags that we're dropping here?
			 *
			 * We fork again because of PID namespace, setns(2) or unshare(2) don't
			 * change the PID namespace of the calling process, because doing so
			 * would change the caller's idea of its own PID (as reported by getpid()),
			 * which would break many applications and libraries, so we must fork
			 * to actually enter the new PID namespace.
			 */
			write_log(DEBUG, "spawn stage-2");
			stage2_pid = clone_parent(&env, STAGE_INIT);`,
		notes: [
			'Lines 1 and 2 join existing namespaces first, with `setns(2)`. In runc\'s config, a namespace with a `path` is joined, and [`CloneFlags`](' + RUNC + '/libcontainer/configs/namespaces_syscall.go#L22-L33) skips it when it builds the flags for new ones. Two containers can share one network namespace this way.',
			'Lines 4 to 6 create the user namespace on its own, before the others. The comment above them in the file says user namespaces "affect our ability to unshare other namespaces and are used as context for privilege checks". Line 9 then switches to UID 0 inside it, after the parent process has written the UID map.',
			'Line 13 creates all remaining namespaces in one `unshare(2)` call. `try_unshare` retries up to 5 times on `EINVAL`, a workaround for kernels before 4.3 described in the same file.',
			'Lines 15 to 23 explain the second fork: `unshare(2)` does not move the caller into the new PID namespace. The child created by `clone_parent` on line 25 is the first process there, so it gets PID 1 and later runs the container\'s command.'
		]
	},
	tradeoff: {
		gain: [
			'runc sets up a container with `unshare(2)` and two `clone` calls, on the same kernel as the host. No second kernel boots, and the process shows up in the host\'s `ps` with a normal PID.',
			'Each network namespace has its own ports and `/proc/sys/net` values, so two containers can both listen on port 80 and set different `net.core.somaxconn`.'
		],
		cost: [
			'All containers on a host run on the host\'s kernel, and the time namespace covers only the boot and monotonic clocks. So a privileged process that sets `CLOCK_REALTIME` changes the host\'s date too.',
			'Without a new user namespace, root in the container is UID 0 on the host. Docker maps it to an unprivileged range only when `userns-remap` is enabled on the daemon.',
			'`unshare --pid` without `--fork` leaves the command outside the new PID namespace. runc needs a second fork for the same reason.'
		]
	},
	task: {
		prompt: 'On a Docker host, run `docker run -d --name ns1 busybox sleep 600` and `P=$(docker inspect -f \'{{.State.Pid}}\' ns1)`. Then: (1) `grep NSpid /proc/$P/status`; (2) for each of `pid net mnt uts ipc user cgroup`, compare `readlink /proc/self/ns/<type>` on the host with `docker exec ns1 readlink /proc/1/ns/<type>`; (3) `sudo nsenter -t $P -n ip -brief link`. Say what each of the three results shows.',
		hint: 'The container\'s `/proc/1` is the host\'s `/proc/$P`, seen from inside its PID namespace. `nsenter -n` changes the network namespace only.',
		answer: [
			'(1) On the machine this chapter was written on: `NSpid: 4145502 1`. The process is PID 4145502 in the host\'s PID namespace and PID 1 in the container\'s.',
			'(2) Six types differ, for example `net:[4026531833]` on the host against `net:[4026534677]` in the container. `user` is the same, `user:[4026531837]`, because Docker did not create a user namespace: root inside is UID 0 on the host.',
			'(3) `nsenter` runs the host\'s `ip` inside the container\'s network namespace. It lists the container\'s `lo` and `eth0`, the same two devices `docker exec ns1 ip -o link` showed, and none of the host\'s interfaces.',
			'The busybox image has `ip`, but many images have no tools at all. `nsenter -t $P -n` lets you debug their network with the host\'s binaries.'
		]
	},
	quiz: [
		{
			q: 'A shell runs `unshare(CLONE_NEWPID)` as root and then prints its own PID with `echo $$`. What does it print?',
			options: [
				'1, because the caller is now the init process of the new namespace',
				'0, because the caller has no PID until it forks',
				'Its old PID, because the namespace applies only to its next child',
				'An error, because a process cannot unshare its PID namespace'
			],
			answer: 2,
			why: '`unshare(2)` with `CLONE_NEWPID` does not move the caller, because its PID would change under it. The first child it forks gets PID 1 in the new namespace. For the same reason `unshare --pid` needs `--fork`, and runc forks a second time.'
		},
		{
			q: 'A Docker container runs as root, and the daemon has no `userns-remap`. Which UID does that process have on the host?',
			options: [
				'0, because the container uses the host\'s user namespace',
				'100000, the first UID of the subordinate range in `/etc/subuid`',
				'65534, because Docker maps root to `nobody` on the host',
				'The UID of the user who typed `docker run`'
			],
			answer: 0,
			why: 'Without `CLONE_NEWUSER`, the container stays in the host\'s user namespace: `/proc/<pid>/ns/user` shows the same number inside and outside. UIDs are not translated, so root inside is root outside. A range like 100000 is used only with `userns-remap` or rootless mode.'
		},
		{
			q: 'You want to list the listening sockets of a container whose image has no `ss`. Which command does it?',
			options: [
				'`docker exec web ss -lnt`, which runs the host\'s `ss` inside the container',
				'`sudo nsenter -t <pid> -n ss -lnt`, with the PID of the container\'s process',
				'`sudo unshare -n ss -lnt`, which opens the container\'s network namespace',
				'`ss -lnt` on the host, which lists the sockets of every namespace'
			],
			answer: 1,
			why: '`nsenter -n` calls `setns(2)` on `/proc/<pid>/ns/net` and keeps the host\'s mount namespace, so the host\'s `ss` runs against the container\'s sockets. `docker exec` looks for `ss` in the image. `unshare -n` creates a new, empty network namespace.'
		}
	],
	recall: {
		q: 'Which file shows whether two processes share a network namespace, and why does `unshare --pid` need `--fork` to give a command PID 1?',
		a: '`/proc/<pid>/ns/net`: the same number, such as `net:[4026531833]`, means the same namespace. `CLONE_NEWPID` applies only to the caller\'s children, so the command must be a forked child to be PID 1.'
	},
	sources: [
		{ title: 'namespaces(7), man7.org', url: 'https://man7.org/linux/man-pages/man7/namespaces.7.html' },
		{ title: 'pid_namespaces(7), man7.org', url: 'https://man7.org/linux/man-pages/man7/pid_namespaces.7.html' },
		{ title: 'network_namespaces(7), man7.org', url: 'https://man7.org/linux/man-pages/man7/network_namespaces.7.html' },
		{ title: 'unshare(1), man7.org', url: 'https://man7.org/linux/man-pages/man1/unshare.1.html' },
		{ title: 'nsenter(1), man7.org', url: 'https://man7.org/linux/man-pages/man1/nsenter.1.html' },
		{ title: 'Docker docs, Isolate containers with a user namespace', url: 'https://docs.docker.com/engine/security/userns-remap/' },
		{ title: 'runc source, libcontainer/configs/namespaces_syscall.go', url: `${RUNC}/libcontainer/configs/namespaces_syscall.go` }
	]
};
