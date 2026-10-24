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
		],
		steps: [
			{
				title: 'Read the default run',
				questions: [
					{ q: 'The first run prints `CapEff: 00000000a80425fb`. Where does that set come from?', options: ['The kernel gives it to every UID 0 process', 'Docker\'s default list of 14 capabilities', 'The `alpine:3.20` image declares it', 'It is the host\'s own `CapEff` copied in'], answer: 1, why: 'With no flags, `TweakCapabilities` returns `basics`, the 14 names in `defaults.go`, from `CAP_CHOWN` to `CAP_AUDIT_WRITE`.' },
					{ q: 'How do you turn the mask into names?', options: ['`capsh --decode=00000000a80425fb`', '`getcap 00000000a80425fb`', '`setcap -d 00000000a80425fb`', '`grep a80425fb /etc/capabilities`'], answer: 0, why: '`capsh --decode` reads the hexadecimal mask and prints one name per set bit.' },
					{ q: 'Which bit does `cap_chown` use?', options: ['Bit 10', 'Bit 1', 'Bit 31', 'Bit 0'], answer: 3, why: '`capsh --decode=1` prints `cap_chown`, so it is bit 0, the lowest bit of the mask.' },
					{ q: 'Is `cap_chown` in this default `a80425fb` set?', options: ['No: bit 0 is clear', 'Only for files owned by root', 'Yes: the mask ends in `b`, so bit 0 is set', 'It depends on the image'], answer: 2, why: '`b` is binary 1011, so the lowest bit is 1. `capsh --decode` lists `cap_chown` first.' }
				]
			},
			{
				title: 'Read the dropped run',
				questions: [
					{ q: 'With `--cap-drop=ALL --cap-add=NET_BIND_SERVICE`, what list does Docker build?', options: ['The 14 defaults plus `NET_BIND_SERVICE`', 'The 14 defaults minus `NET_BIND_SERVICE`', 'Only `NET_BIND_SERVICE`', 'An empty list, because `ALL` wins'], answer: 2, why: 'When the drops contain `ALL`, Docker throws the default list away and keeps only the adds.' },
					{ q: 'The second run prints `0000000000000400` three times. What does it decode to?', options: ['`cap_net_bind_service`, bit 10', '`cap_net_raw`, bit 13', '`cap_chown`, bit 0', '`cap_sys_admin`, bit 21'], answer: 0, why: '0x400 is bit 10, which `capsh` decodes to `cap_net_bind_service`.' },
					{ q: 'Which three lines show it?', options: ['`CapInh`, `CapEff`, `CapAmb`', '`CapPrm`, `CapEff`, `CapBnd`', '`CapInh`, `CapPrm`, `CapBnd`', '`CapEff`, `CapBnd`, `CapAmb`'], answer: 1, why: 'Root keeps the capability in its permitted and effective sets, and the bounding set holds only that one too.' },
					{ q: 'A setuid-root binary in this container runs. Which capabilities can it gain?', options: ['All of them, because setuid root means full root', 'The 14 defaults', 'None, setuid is ignored in containers', 'At most `cap_net_bind_service`, what `CapBnd` allows'], answer: 3, why: 'The bounding set is ANDed with what a file grants during execve. Nothing outside `CapBnd` can come back.' }
				]
			},
			{
				title: 'Read the non-root run',
				questions: [
					{ q: 'With `--user 1000` added, what do `CapEff` and `CapBnd` show?', options: ['`CapEff` 0, `CapBnd` `0000000000000400`', 'Both `0000000000000400`', 'Both 0', '`CapEff` `0000000000000400`, `CapBnd` 0'], answer: 0, why: 'The process has no effective capability, but the bounding set still holds bit 10 as a ceiling.' },
					{ q: 'With `--user 0` in place of `--user 1000`, what would `CapEff` show?', options: ['`0000000000000000`', '`00000000a80425fb`', '`0000000000000400`', '`0000003fffffffff`'], answer: 2, why: 'Root gets the permitted set back, capped by the bounding set, which holds only `cap_net_bind_service`. That is the second run again.' },
					{ q: 'In that formula, which part would give `grep` the capability if it had one?', options: ['`CapBnd` alone', '`F(permitted) & P(bounding)`: a file capability, within the bounding set', 'The UID of the process', 'The capabilities of the Docker daemon'], answer: 1, why: 'A file capability set with `setcap` is ANDed with the bounding set. Bit 10 is in `CapBnd`, so such a file could gain it.' },
					{ q: 'Without file capabilities, which part of the formula could still carry the capability across execve?', options: ['`CapBnd` alone', '`no_new_privs`', 'A setgid bit on `grep`', 'The ambient set, `P\'(ambient)`'], answer: 3, why: 'The new permitted set is ORed with the ambient set. A capability placed there before execve survives it, with no file capability needed.' }
				]
			},
			{
				title: 'Give it to a non-root program',
				questions: [
					{ q: 'How does an image give `cap_net_bind_service` to one non-root binary?', options: ['`setcap cap_net_bind_service=+ep` on that binary', '`chmod u+s` on that binary', '`--cap-add=ALL` at run time', 'An `ENV CAP_NET_BIND_SERVICE=1` line'], answer: 0, why: '`setcap ... +ep` gives the file permitted and effective capabilities, so a process gains them when it runs that file.' },
					{ q: 'Where does `setcap` store this?', options: ['In `/etc/capabilities`', 'In the image\'s `config.json`', 'In the file\'s extended attribute `security.capability`', 'In the binary\'s ELF header'], answer: 2, why: 'File capabilities live in the `security.capability` extended attribute of the executable.' },
					{ q: 'In Docker, does a non-root process need this capability to bind port 80?', options: ['Yes, ports below 1024 always need it', 'No, Docker sets `ip_unprivileged_port_start` to 0 in the container', 'Only if the host has a firewall', 'Only with the default seccomp profile'], answer: 1, why: 'Docker sets `net.ipv4.ip_unprivileged_port_start` to 0 in each container with its own network namespace, so any UID can bind port 80.' },
					{ q: 'The binary has `cap_net_bind_service=+ep`, but the container runs with `--cap-drop=ALL` and no add. Does the binary get the capability?', options: ['Yes: file capabilities ignore Docker', 'Yes, if it runs as root', 'Only after a restart', 'No: the bounding set is empty, and the formula ANDs the file set with it'], answer: 3, why: 'The file part of the formula is `F(permitted) & P(bounding)`. With an empty bounding set, the file capability gives nothing.' }
				]
			}
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
	lab: {
		minutes: 20,
		goal: 'Read the capability sets Docker gives a container, then find the smallest list nginx needs by adding back one capability at a time.',
		steps: [
			'Read the default sets: `docker run --rm alpine:3.20 grep Cap /proc/self/status`, then decode `CapEff` on the host with `capsh --decode=00000000a80425fb` (`capsh` comes with libcap, the `libcap2-bin` package on Debian and Ubuntu).',
			'Run the same `grep` with `--cap-drop=ALL --cap-add=NET_BIND_SERVICE`, then again with `--user 1000` added before the image name.',
			'Start nginx with nothing: `docker run --rm --cap-drop=ALL nginx:1.27-alpine`. Read the last log line.',
			'Add one capability: `timeout 5 docker run --rm --cap-drop=ALL --cap-add=CHOWN nginx:1.27-alpine 2>&1 | grep emerg`.',
			'Add the missing ones and serve: `docker run -d --name cap-lab -p 8080:80 --cap-drop=ALL --cap-add=CHOWN --cap-add=SETUID --cap-add=SETGID nginx:1.27-alpine`, then `curl -I localhost:8080` and `docker exec cap-lab grep CapEff /proc/1/status`. Clean up with `docker rm -f cap-lab`.'
		],
		done: [
			'The default `CapEff` is `00000000a80425fb` and decodes to 14 names.',
			'With the drop and add, `CapPrm`, `CapEff` and `CapBnd` are `0000000000000400`. With `--user 1000`, `CapEff` is all zeros and `CapBnd` is still `0000000000000400`.',
			'nginx with nothing exits on `chown("/var/cache/nginx/client_temp", 101) failed (1: Operation not permitted)`. With `CHOWN`, the workers log `setgid(101) failed`.',
			'`curl -I localhost:8080` returns `HTTP/1.1 200 OK`, and nginx\'s `CapEff` is `00000000000000c1`.'
		],
		solution: [
			'`--cap-drop=ALL` throws Docker\'s list away, so root in the container fails the kernel\'s check for `CAP_CHOWN`.',
			'nginx reports only the first missing capability, so you add them one by one: `CHOWN` for the cache directory, then `SETGID` and `SETUID` for the workers to drop to UID 101.',
			'`capsh --decode=00000000000000c1` prints `cap_chown,cap_setgid,cap_setuid`: bits 0, 6 and 7, the three you added and nothing else.'
		]
	},
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
