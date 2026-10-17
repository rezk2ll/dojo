const MOBY = 'https://github.com/moby/moby/blob/3f38b15147b14ce0ce7b11558a1aa9e9f14db103';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'capabilities',
	part: 'Containers from the kernel up',
	title: 'Capabilities',
	minutes: 10,
	hook: [
		'The Kubernetes Restricted policy says containers "must drop ALL capabilities". You try it with `docker run --cap-drop=ALL nginx:1.27-alpine`, and the container exits at once. Its last log line: `chown("/var/cache/nginx/client_temp", 101) failed (1: Operation not permitted)`. Yet `id` in the same kind of container prints `uid=0(root)`.',
		'Since Linux 2.2, the kernel splits the power of root into separate capabilities. A privileged action checks the one capability it needs: chown(2) says only a process "with the CAP_CHOWN capability" may change the owner of a file. **Docker gives a container 14 capabilities by default**, and `--cap-drop=ALL` removes all 14.',
		'Adding `--cap-add=CHOWN` back moves nginx one step: its worker processes then fail on `setgid(101) failed (1: Operation not permitted)`. With `CHOWN`, `SETUID` and `SETGID` added, it serves its welcome page. These outputs come from Docker 29.9 on Linux 6.17, run while writing this chapter.'
	],
	terms: [
		{ term: 'Capability', def: 'One unit of root\'s power, named `CAP_` plus a word: `CAP_CHOWN` changes file owners, `CAP_NET_BIND_SERVICE` binds ports below 1024. Each thread has its own sets of them.' },
		{ term: 'Effective set', def: 'The capabilities the kernel checks when the thread asks for a privileged action. `CapEff` in `/proc/<pid>/status` shows it as a hexadecimal mask.' },
		{ term: 'Bounding set', def: 'A ceiling on the capabilities a thread can gain when it runs a new program with execve(2). `CapBnd` in `/proc/<pid>/status` shows it.' },
		{ term: 'File capability', def: 'Capabilities stored on an executable in the extended attribute `security.capability`, set with `setcap`. They let a non-root user\'s process gain a capability when it runs that file.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['run["docker run --cap-drop=ALL --cap-add=CHOWN nginx"] --> pid1["nginx master: uid 0, CapEff 0000000000000001"]'],
				highlight: ['run', 'pid1'],
				note: 'Docker passes the list of capabilities to the runtime, and the first process starts with only those. `capsh --decode=1` prints `cap_chown`: bit 0 of the mask. The process is still UID 0, but UID 0 alone no longer passes the kernel\'s checks.'
			},
			{
				add: ['pid1 -->|"chown(client_temp, 101)"| k1{"CAP_CHOWN in CapEff?"}', 'k1 -->|"yes"| ok1["directory now owned by uid 101"]'],
				highlight: ['k1', 'ok1'],
				note: 'nginx changes the owner of `/var/cache/nginx/client_temp` to its `nginx` user, UID 101. The kernel looks for `CAP_CHOWN` in the effective set, finds it, and the call returns 0.'
			},
			{
				add: ['pid1 -->|"fork, worker calls setgid(101)"| k2{"CAP_SETGID in CapEff?"}', 'k2 -->|"no"| err["EPERM: Operation not permitted"]'],
				highlight: ['k2', 'err'],
				note: 'A child made by fork(2) inherits copies of its parent\'s capability sets. Each worker then calls `setgid(101)` to drop to the nginx group. `CAP_SETGID` is missing, so the call fails with `EPERM` (errno 1) and nginx logs that the worker "cannot be respawned".'
			},
			{
				add: ['user["--user 1000 --cap-add=NET_BIND_SERVICE"] -->|"execve(grep)"| calc["new permitted set computed from file caps and ambient set"]', 'calc --> zero["CapEff 0, CapBnd 0000000000000400"]'],
				highlight: ['user', 'calc', 'zero'],
				note: 'At each execve(2), the kernel computes the new sets. For a non-root process running a file with no file capabilities, the formula in capabilities(7) gives an empty permitted set. `grep Cap /proc/self/status` as UID 1000 shows `CapEff: 0000000000000000`, while `CapBnd` still holds bit 10, `cap_net_bind_service`.'
			},
			{
				add: ['zero -->|"execve of a file with setcap or setuid root"| ceil["gains at most what CapBnd allows"]'],
				highlight: ['ceil'],
				note: 'The bounding set is ANDed with the file\'s permitted capabilities during execve. A setuid-root program or a file with `cap_sys_admin` set on it still gains nothing outside `CapBnd`. With `--cap-drop=ALL` and no add, `CapBnd` is 0, so no program in the container can gain a capability this way.'
			}
		]
	},
	example: {
		title: 'daemon/pkg/oci/caps/utils.go: how Docker builds the capability list',
		repo: 'moby/moby',
		url: `${MOBY}/daemon/pkg/oci/caps/utils.go#L81-L124`,
		lang: 'go',
		code: `func TweakCapabilities(basics, adds, drops []string, privileged bool) ([]string, error) {
	switch {
	case privileged:
		// Privileged containers get all capabilities
		return GetAllCapabilities(), nil
	case len(adds) == 0 && len(drops) == 0:
		// Nothing to tweak; we're done
		return basics, nil
	}

	capDrop, err := NormalizeLegacyCapabilities(drops)
	if err != nil {
		return nil, err
	}
	capAdd, err := NormalizeLegacyCapabilities(adds)
	if err != nil {
		return nil, err
	}

	var caps []string

	switch {
	case slices.Contains(capAdd, allCapabilities):
		// Add all capabilities except ones on capDrop
		for _, c := range GetAllCapabilities() {
			if !slices.Contains(capDrop, c) {
				caps = append(caps, c)
			}
		}
	case slices.Contains(capDrop, allCapabilities):
		// "Drop" all capabilities; use what's in capAdd instead
		caps = capAdd
	default:
		// First drop some capabilities
		for _, c := range basics {
			if !slices.Contains(capDrop, c) {
				caps = append(caps, c)
			}
		}
		// Then add the list of capabilities from capAdd
		caps = append(caps, capAdd...)
	}
	return caps, nil
}`,
		notes: [
			'Lines 3 to 5: `--privileged` returns every capability the kernel supports and ignores `--cap-add` and `--cap-drop`. Docker\'s docs add that it also opens all host devices and relaxes AppArmor or SELinux.',
			'Line 8: with no flags, the container gets `basics`, the 14 names in [`defaults.go`](' + MOBY + '/daemon/pkg/oci/caps/defaults.go#L4-L21), from `CAP_CHOWN` to `CAP_AUDIT_WRITE`. Inside `alpine:3.20`, `grep CapEff /proc/self/status` prints that list as `00000000a80425fb`.',
			'Lines 11 to 18 call `NormalizeLegacyCapabilities`, which upper-cases each name and adds the `CAP_` prefix. `--cap-add=net_raw` and `--cap-add=CAP_NET_RAW` give the same result, and an unknown name returns the error `unknown capability`.',
			'Lines 30 to 32: when the drops contain `ALL`, Docker throws the default list away and keeps only the adds. Lines 33 to 41 handle every other case: remove the drops from the defaults, then append the adds.',
			'`CAP_NET_BIND_SERVICE` matters less in Docker than its name suggests. Docker sets `net.ipv4.ip_unprivileged_port_start` to 0 in each container with its own network namespace ([oci_linux.go](' + MOBY + '/daemon/oci_linux.go#L772-L775)). In this session, `--cap-drop=ALL --user 1000` could still bind port 80; with `--sysctl net.ipv4.ip_unprivileged_port_start=1024` it got `Permission denied`.'
		]
	},
	tradeoff: {
		gain: [
			'With an empty effective set, root in the container gets `Operation not permitted` from `chown`, `setgid` and `setuid`, so a compromised process cannot take over other users\' files or identities.',
			'With `CapBnd` at 0, no setuid-root binary or `setcap` file in the image can give a process a capability back.',
			'The Kubernetes Restricted Pod Security Standard checks one field: containers "must drop ALL capabilities", and may add back only `NET_BIND_SERVICE`.'
		],
		cost: [
			'You find each image\'s list by trial. nginx 1.27 needs `CHOWN`, `SETUID` and `SETGID`, and it reports only the first missing one each time.',
			'A capability added for a non-root user does not reach the program\'s effective set: `--user 1000 --cap-add=NET_BIND_SERVICE` still shows `CapEff: 0000000000000000`. The binary needs `setcap` in the image.',
			'Adding `CAP_SYS_ADMIN` opens many calls at once. capabilities(7) says this capability "is overloaded": it covers `mount`, `sethostname`, `swapon` and many more calls.'
		]
	},
	task: {
		prompt: 'Run `docker run --rm alpine:3.20 grep Cap /proc/self/status`, then the same with `--cap-drop=ALL --cap-add=NET_BIND_SERVICE`, then the same again with `--user 1000` added. Decode each `CapEff` with `capsh --decode=<mask>`. Explain the third result.',
		hint: 'Compare `CapEff` and `CapBnd` in the third run. Then look at the execve formula in capabilities(7) for a process that is not root and a file with no file capabilities.',
		answer: [
			'First run: `CapEff: 00000000a80425fb`. `capsh` decodes it to 14 names, from `cap_chown` to `cap_setfcap`: Docker\'s default list.',
			'Second run: `CapPrm`, `CapEff` and `CapBnd` are all `0000000000000400`, which decodes to `cap_net_bind_service`, bit 10.',
			'Third run: `CapEff: 0000000000000000` and `CapBnd: 0000000000000400`. `grep` runs as UID 1000 and has no file capabilities, so the formula P\'(permitted) = (P(inheritable) & F(inheritable)) | (F(permitted) & P(bounding)) | P\'(ambient) gives 0. The capability stays in the bounding set as a ceiling.',
			'To give it to a non-root program, the image runs `setcap cap_net_bind_service=+ep` on that binary, which writes the `security.capability` attribute. For a port below 1024 in Docker you do not need it, because Docker sets `ip_unprivileged_port_start` to 0.'
		]
	},
	quiz: [
		{
			q: 'nginx runs as root in a container started with `--cap-drop=ALL` and logs `chown(...) failed (1: Operation not permitted)`. Why?',
			options: [
				'chown(2) checks for `CAP_CHOWN` in the effective set, and that set is empty',
				'`--cap-drop=ALL` also mounts the image\'s `/var/cache` directory read-only',
				'Docker maps root to UID 65534 whenever capabilities are dropped',
				'Docker\'s default seccomp profile blocks `chown` in every container'
			],
			answer: 0,
			why: 'The kernel checks one capability per privileged action, and changing a file\'s owner needs `CAP_CHOWN`. UID 0 alone passes no check once the effective set is empty. `CapEff` reads `0000000000000000` in that container.'
		},
		{
			q: 'You run a container with `--user 1000 --cap-add=NET_BIND_SERVICE`. `CapEff` is all zeros. Why?',
			options: [
				'Docker ignores `--cap-add` whenever `--user` is also set',
				'A non-root execve of a file without file capabilities gets an empty permitted set',
				'The capability only appears in `CapEff` after the first call to `bind`',
				'The kernel removes every capability from processes with a UID above 999'
			],
			answer: 1,
			why: 'At execve(2), the new permitted set comes from the file\'s capabilities, the inheritable set and the ambient set. For UID 1000 running `grep`, all three give nothing. `CapBnd` still shows bit 10, so a binary with `setcap cap_net_bind_service=+ep` could gain it.'
		},
		{
			q: 'Under the Kubernetes Restricted Pod Security Standard, which capabilities may a container add after dropping ALL?',
			options: [
				'The 14 capabilities in Docker\'s default list',
				'`NET_ADMIN` and `SYS_TIME`, for network and clock tools',
				'None: the `add` list must stay empty',
				'Only `NET_BIND_SERVICE`'
			],
			answer: 3,
			why: 'The Restricted policy says containers "must drop ALL capabilities, and are only permitted to add back the NET_BIND_SERVICE capability". The Baseline policy allows 13 names: Docker\'s default list without `NET_RAW`.'
		}
	],
	recall: {
		q: 'Root in a container started with `--cap-drop=ALL` calls `chown`. What happens, and what does `CapEff` show?',
		a: 'The call fails with `EPERM`, "Operation not permitted", because `CAP_CHOWN` is not in the effective set. `CapEff` is `0000000000000000`; Docker\'s default is `00000000a80425fb`, 14 capabilities.'
	},
	sources: [
		{ title: 'capabilities(7), Linux manual page', url: 'https://man7.org/linux/man-pages/man7/capabilities.7.html' },
		{ title: 'proc_pid_status(5), Linux manual page', url: 'https://man7.org/linux/man-pages/man5/proc_pid_status.5.html' },
		{ title: 'chown(2), Linux manual page', url: 'https://man7.org/linux/man-pages/man2/chown.2.html' },
		{ title: 'Docker docs, Running containers: runtime privilege and Linux capabilities', url: 'https://docs.docker.com/engine/containers/run/#runtime-privilege-and-linux-capabilities' },
		{ title: 'Kubernetes docs, Configure a Security Context for a Pod or Container', url: 'https://kubernetes.io/docs/tasks/configure-pod-container/security-context/' },
		{ title: 'Kubernetes docs, Pod Security Standards', url: 'https://kubernetes.io/docs/concepts/security/pod-security-standards/' },
		{ title: 'moby/moby, daemon/pkg/oci/caps/defaults.go', url: `${MOBY}/daemon/pkg/oci/caps/defaults.go` },
		{ title: 'Linux kernel docs, IP sysctl: ip_unprivileged_port_start', url: 'https://docs.kernel.org/networking/ip-sysctl.html' }
	]
};
