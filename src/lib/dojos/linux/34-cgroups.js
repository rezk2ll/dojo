const CG = 'https://github.com/opencontainers/cgroups/blob/19a241326c83a5100dff94732733791a0c9e4720';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'cgroups',
	part: 'Containers from the kernel up',
	title: 'cgroups v2',
	minutes: 10,
	hook: [
		'You run `docker run -d --cpus 0.5 --memory 256m busybox sleep 300`. On the host, `cat /proc/1786/cgroup` prints `0::/system.slice/docker-<id>.scope`, where `<id>` is the container\'s 64-character ID. (Output captured on the machine this chapter was written on, Docker 29.9 on systemd 255.)',
		'In that directory under `/sys/fs/cgroup`, `cpu.max` holds `50000 100000` and `memory.max` holds `268435456`. Docker turned `--cpus 0.5` into 50 ms of CPU per 100 ms period, and `--memory 256m` into 256 MiB in bytes.',
		'No daemon watches the container to apply these limits. **The kernel reads the two files**: the scheduler stops the group once it has used 50 ms in a period, and the OOM killer runs inside the group when it cannot stay under 256 MiB.'
	],
	terms: [
		{ term: 'cgroup', def: 'A directory under `/sys/fs/cgroup` that holds a group of processes, listed in its `cgroup.procs` file. cgroup v2 has a single tree, and each process is in exactly one cgroup of it.' },
		{ term: 'Controller', def: 'The kernel part that limits one resource for a cgroup: `cpu`, `memory`, `io`, `pids` and others. Its settings are files with its prefix, such as `cpu.max` or `memory.max`.' },
		{ term: '`cgroup.subtree_control`', def: 'The file where a cgroup turns controllers on for its children: `echo "+cpu +memory" > cgroup.subtree_control`. It creates the `cpu.*` and `memory.*` files in each child.' },
		{ term: 'Slice and scope', def: 'systemd\'s names for cgroups it creates: a slice groups other units (`system.slice`, `user.slice`), and a scope holds processes started outside systemd, such as a Docker container.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['root["/sys/fs/cgroup: the root cgroup"] -->|"subtree_control: +cpu +io +memory +pids ..."| sys["system.slice"]'],
				highlight: ['root', 'sys'],
				note: 'cgroup v2 is one filesystem, here mounted at `/sys/fs/cgroup` with type `cgroup2`. The root\'s `cgroup.controllers` lists what the kernel offers: `cpuset cpu io memory hugetlb pids rdma misc dmem` on this machine. The docs: "No controller is enabled by default." Writing `+cpu` into `cgroup.subtree_control` turns it on for the children.'
			},
			{
				add: ['sys -->|"subtree_control"| scope["docker-id.scope"]', 'sys --> svc["containerd.service, cron.service, ..."]'],
				highlight: ['scope'],
				note: 'A child can enable a controller only if its parent has it in `cgroup.subtree_control`: the docs call this the top-down constraint. A cgroup with domain controllers enabled for its children may hold no processes itself. So processes sit in the leaves, like the container\'s scope.'
			},
			{
				add: ['scope --> files["cpu.max = 50000 100000, memory.max = 268435456, io.max = (empty)"]'],
				highlight: ['files'],
				note: 'The runtime writes the limits into the scope\'s files. `cpu.max` is `$MAX $PERIOD` in microseconds, default `max 100000`. `memory.max` is a byte count, default `max`. `io.max` takes one line per device, for example `8:16 rbps=2097152 wiops=120`, and is empty here because no I/O limit was asked for.'
			},
			{
				add: ['scope --> procs["cgroup.procs: 1786"]', 'procs -->|"fork"| child["Child process: same cgroup"]'],
				highlight: ['procs', 'child'],
				note: 'Writing a PID into `cgroup.procs` moves that process, with all its threads, into the cgroup. "When a process forks a child process, the new process is born into the cgroup that the forking process belongs to". Everything the container\'s PID 1 starts stays under the same limits.'
			},
			{
				add: ['files --> kern["Kernel: CPU stopped after 50 ms per 100 ms, OOM killer at 256 MiB"]'],
				highlight: ['kern'],
				note: 'The scheduler counts the CPU time of every process in the group against `cpu.max` (chapter 35). The memory controller counts the group\'s memory, page cache included, against `memory.max`: "If a cgroup\'s memory usage reaches this limit and can\'t be reduced, the OOM killer is invoked in the cgroup" (chapter 13).'
			}
		]
	},
	example: {
		title: 'fs2/create.go: create the cgroup path and enable controllers on the way down',
		repo: 'opencontainers/cgroups',
		url: `${CG}/fs2/create.go#L85-L147`,
		lang: 'go',
		code: `	ctrs := strings.Fields(content)
	res := "+" + strings.Join(ctrs, " +")

	elements := strings.Split(path, "/")
	elements = elements[3:]
	current := "/sys/fs"
	for i, e := range elements {
		current = filepath.Join(current, e)
		if i > 0 {
			if err := os.Mkdir(current, 0o755); err != nil {
				if !os.IsExist(err) {
					return err
				}
			} else {
…
		}
		// enable all supported controllers
		if i < len(elements)-1 {
			if err := cgroups.WriteFile(current, cgStCtlFile, res); err != nil {
				// try write one by one
				for ctr := range strings.SplitSeq(res, " ") {
					_ = cgroups.WriteFile(current, cgStCtlFile, ctr)
				}
			}
			// Some controllers might not be enabled when rootless or containerized,
			// but we don't catch the error here. (Caught in setXXX() functions.)
		}
	}`,
		notes: [
			'`content` is the root\'s `cgroup.controllers`, read on [line 13](' + CG + '/fs2/create.go#L12-L14). Lines 1 and 2 turn `cpuset cpu io memory` into `+cpuset +cpu +io +memory`, the format `cgroup.subtree_control` expects.',
			'For `/sys/fs/cgroup/system.slice/docker-<id>.scope`, line 5 keeps `cgroup`, `system.slice` and the scope name. Line 10 creates each missing level with `mkdir`, the only call needed to make a cgroup, and an existing one is fine (line 11).',
			'Line 18 writes `cgroup.subtree_control` on every level except the last. The top-down constraint needs each parent to enable a controller before its child can use it. The last level is the leaf that will hold the processes, so it gets no `subtree_control` write.',
			'Lines 19 to 23 retry controller by controller. The docs say a write with several controllers is all or nothing: "either they all succeed or fail". One missing controller would otherwise block all the others.',
			'The limits come later, in [`setCPU`](' + CG + '/fs2/cpu.go#L54-L74): it writes `cpu.max` as quota and period, with a period of 100000 when none is given.'
		]
	},
	tradeoff: {
		gain: [
			'Each limit is a text file you can read: `cat /sys/fs/cgroup/<path>/cpu.max` shows what the kernel enforces, whether Docker, Kubernetes or systemd wrote it.',
			'Every process a container forks lands in the same cgroup, so the limit covers the whole process tree with no extra work from the runtime.',
			'systemd units use the same files: `CPUQuota=20%` in a service writes `cpu.max`, and `MemoryMax=` writes `memory.max`.'
		],
		cost: [
			'A cgroup with domain controllers enabled for its children cannot hold processes itself. A tool that puts a process in an inner cgroup gets errors or a `domain invalid` state, which the example has to handle.',
			'`memory.max` counts page cache too, so a container that reads big files can reach its limit with a small heap.',
			'A controller missing from the parent\'s `cgroup.subtree_control` means the child has no `cpu.max` file at all, and a rootless runtime may not be allowed to enable it.'
		]
	},
	task: {
		prompt: 'Run `docker run -d --name cg1 --cpus 1.5 --memory 512m busybox sleep 600`. Before you look, write down what `cpu.max` and `memory.max` will hold. Then find the cgroup with `cat /proc/$(docker inspect -f \'{{.State.Pid}}\' cg1)/cgroup` and read both files under `/sys/fs/cgroup`. Last, write the systemd drop-in that gives a service `myapp.service` the same two limits.',
		hint: 'Docker docs: `--cpus="1.5"` "is the equivalent of setting --cpu-period="100000" and --cpu-quota="150000"". The `m` suffix means MiB, so multiply by 1024 twice.',
		answer: [
			'`cpu.max` holds `150000 100000`: 150 ms of CPU per 100 ms period, one and a half CPUs. `memory.max` holds `536870912`, which is 512 × 1024 × 1024 bytes.',
			'For comparison, the `--cpus 0.5 --memory 256m` container on the machine this chapter was written on showed `50000 100000` and `268435456`, in `/sys/fs/cgroup/system.slice/docker-<id>.scope`. `systemctl show` on that scope printed `CPUQuotaPerSecUSec=500ms` and `MemoryMax=268435456`.',
			'The drop-in, in `/etc/systemd/system/myapp.service.d/limits.conf`: `[Service]`, then `CPUQuota=150%` and `MemoryMax=512M`. Run `systemctl daemon-reload` and restart the service, then check `cpu.max` under `/sys/fs/cgroup/system.slice/myapp.service`.',
			'`systemd-cgls /system.slice/myapp.service` lists the processes in that cgroup, like it listed `1786 sleep 300` for the container\'s scope.'
		],
		steps: [
			{
				title: 'Predict the values',
				questions: [
					{ q: 'What is the format of `cpu.max`?', options: ['A percentage of one CPU', 'Quota then period, in microseconds', 'Period then quota, in milliseconds', 'A number of CPUs, such as `1.5`'], answer: 1, why: '`cpu.max` is `$MAX $PERIOD` in microseconds, with a default of `max 100000`.' },
					{ q: 'So what will `cpu.max` hold for `--cpus 1.5`?', options: ['`1.5 100000`', '`100000 150000`', '`150000 100000`', '`max 150000`'], answer: 2, why: 'The Docker docs say `--cpus="1.5"` equals a period of 100000 and a quota of 150000: 150 ms of CPU per 100 ms period.' },
					{ q: 'What will `memory.max` hold for `--memory 512m`?', options: ['`536870912`', '`512000000`', '`512m`', '`524288`'], answer: 0, why: '`m` means MiB, and `memory.max` is a byte count: 512 × 1024 × 1024 = 536870912.' },
					{ q: 'Which part of the system enforces these numbers once they are written?', options: ['The Docker daemon, which polls the container', 'containerd, through a watchdog thread', 'systemd, which restarts the scope when it goes over', 'The kernel, which reads the cgroup files'], answer: 3, why: 'No daemon watches the container. The scheduler stops the group at its quota, and the OOM killer runs inside the group at its memory limit.' }
				]
			},
			{
				title: 'Find the cgroup',
				questions: [
					{ q: '`cat /proc/<pid>/cgroup` prints `0::/system.slice/docker-<id>.scope`. Where is the directory?', options: ['`/proc/<pid>/system.slice/docker-<id>.scope`', '`/sys/fs/cgroup/system.slice/docker-<id>.scope`', '`/var/lib/docker/cgroups/<id>`', '`/etc/systemd/system/docker-<id>.scope`'], answer: 1, why: 'cgroup v2 is one filesystem mounted at `/sys/fs/cgroup`, and the path in `/proc/<pid>/cgroup` is relative to it.' },
					{ q: 'Why is the container\'s cgroup a systemd "scope"?', options: ['A scope holds processes started outside systemd', 'Scopes are the only cgroups that accept limits', 'Docker runs the container as a systemd service', 'Scopes are faster than slices'], answer: 0, why: 'A slice groups other units, and a scope holds processes systemd did not start itself, such as a Docker container.' },
					{ q: 'Why does the container\'s process sit in a leaf of the tree, not in `system.slice`?', options: ['Leaves get more CPU than inner cgroups', 'The kernel only reads limits in leaves', 'Docker cannot write to `system.slice`', 'A cgroup that enables domain controllers for its children cannot hold processes'], answer: 3, why: 'That is a cgroup v2 rule. So processes live in the leaves, like the container\'s scope.' },
					{ q: 'The container\'s PID 1 forks a child. Which cgroup is the child in?', options: ['The root cgroup, until the runtime moves it', 'A new cgroup that Docker creates for it', 'The same scope as its parent', 'Whichever cgroup has the most free memory'], answer: 2, why: 'A forked child "is born into the cgroup that the forking process belongs to", so the limits cover the whole process tree.' }
				]
			},
			{
				title: 'Read the files',
				questions: [
					{ q: '`cpu.max` shows `150000 100000`. What does the scheduler do?', options: ['Pins the container to one and a half cores', 'Stops the group once it has used 150 ms of CPU in a 100 ms period', 'Gives the group 150% priority over other groups', 'Lets the group run for 100 ms, then pauses it for 150 ms'], answer: 1, why: 'The quota is CPU time across all CPUs per period. 150 ms per 100 ms means one and a half CPUs busy the whole period.' },
					{ q: 'What does `memory.max` count against the limit?', options: ['Only the heap of the main process', 'Only anonymous memory, not files', 'The group\'s memory, page cache included', 'Memory of the container\'s processes and of dockerd'], answer: 2, why: 'The memory controller counts page cache too, so a container that reads big files can reach its limit with a small heap.' },
					{ q: 'What happens when the group reaches `memory.max` and the kernel cannot reclaim enough?', options: ['The OOM killer runs inside the cgroup', 'The kernel raises the limit by 10%', 'The container is paused until memory frees up', 'Docker restarts the container with more memory'], answer: 0, why: 'The docs: "the OOM killer is invoked in the cgroup". It picks a process from that group, not from the whole machine.' },
					{ q: 'On another host, the scope has no `cpu.max` file at all. What is the likely cause?', options: ['The container has not used any CPU yet', 'The file appears only after a reboot', '`cpu.max` must be created with `touch` first', 'The parent did not enable `cpu` in its `cgroup.subtree_control`'], answer: 3, why: 'Enabling a controller in the parent\'s `subtree_control` creates its files in the children. Without it, the child has no `cpu.*` files.' }
				]
			},
			{
				title: 'Write the drop-in',
				questions: [
					{ q: 'Where does the drop-in for `myapp.service` go?', options: ['`/etc/systemd/system/myapp.service.d/limits.conf`', '`/sys/fs/cgroup/system.slice/myapp.service/limits.conf`', '`/usr/lib/systemd/limits.d/myapp.conf`', '`/etc/sysctl.d/myapp.conf`'], answer: 0, why: 'A `.d` directory next to the unit name holds drop-ins that add to the unit. systemd then writes the cgroup files for you.' },
					{ q: 'Which line gives the service one and a half CPUs?', options: ['`CPUQuota=1.5`', '`CPUQuota=150000`', '`CPUQuota=150%`', '`CPUMax=150000 100000`'], answer: 2, why: '`CPUQuota=` takes a percentage of one CPU. systemd writes `cpu.max` from it, as `CPUQuota=20%` does in the tradeoffs.' },
					{ q: 'Which line gives it 512 MiB?', options: ['`MemoryLimit=512`', '`MemoryMax=512M`', '`memory.max=536870912`', '`MemoryHigh=512%`'], answer: 1, why: '`MemoryMax=` writes `memory.max`. systemd reads the `M` suffix as MiB, so the file holds 536870912.' },
					{ q: 'You saved the file. What do you run before checking `cpu.max`?', options: ['`sysctl --system`', '`systemctl restart systemd-cgls`', 'Nothing, systemd reads drop-ins on every access', '`systemctl daemon-reload`, then restart the service'], answer: 3, why: 'systemd reloads unit files only on `daemon-reload`. Then check `cpu.max` under `/sys/fs/cgroup/system.slice/myapp.service`.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'A service forks 20 worker processes. Its cgroup has `memory.max` set to 1 GiB. What does the limit cover?',
			options: [
				'Only the main process, because the PID in `cgroup.procs` is the one written there',
				'All 21 processes together, because forked children are born into the same cgroup',
				'Each process separately, so the service can use 21 GiB in total',
				'Only the workers started after the limit was written'
			],
			answer: 1,
			why: 'The cgroup-v2 docs: a forked child "is born into the cgroup that the forking process belongs to". `memory.max` is a limit on the whole group, so the 21 processes share 1 GiB.'
		},
		{
			q: 'You create `/sys/fs/cgroup/app/web` and find no `cpu.max` file in `web`. The root has `cpu` in `cgroup.controllers`. What is missing?',
			options: [
				'`cpu` in `/sys/fs/cgroup/app/cgroup.subtree_control`, and in the root\'s',
				'A process in `web/cgroup.procs`, because the files appear with the first PID',
				'A reboot, because controllers are bound to cgroups at boot',
				'`cpu.max` must be created by hand with `touch` before it can be written'
			],
			answer: 0,
			why: 'Enabling a controller in a cgroup\'s `cgroup.subtree_control` creates its interface files in the children. `app` must enable `cpu` for `web`, and the root must enable it for `app` first: the top-down constraint.'
		},
		{
			q: 'Docker runs a container with `--cpus 2`. What does the container\'s `cpu.max` hold?',
			options: [
				'`2 100000`',
				'`max 100000`',
				'`100000 200000`',
				'`200000 100000`'
			],
			answer: 3,
			why: '`cpu.max` is quota then period, in microseconds. `--cpus 2` with the default period of 100000 µs gives a quota of 200000 µs: 200 ms of CPU time per 100 ms, which needs two CPUs running the whole period.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Read the limits Docker writes into a container\'s cgroup, watch the memory limit kill a process, and get the same files from systemd without root.',
		steps: [
			'Write down what you expect in `cpu.max` and `memory.max`, then start the container: `docker run -d --name cg-lab --cpus 1.5 --memory 512m busybox sleep 600`.',
			'Find its cgroup and read it: `P=$(docker inspect -f \'{{.State.Pid}}\' cg-lab); cat /proc/$P/cgroup; CG=/sys/fs/cgroup$(cut -d: -f3 /proc/$P/cgroup); cat $CG/cpu.max $CG/memory.max $CG/cgroup.procs`.',
			'Start a second process in the container and read `cgroup.procs` again: `docker exec -d cg-lab sleep 500; cat $CG/cgroup.procs`.',
			'Go over a memory limit: `docker run --name cg-oom --memory 64m python:3.12-alpine python -c \'x = bytearray(200 * 1024 * 1024)\'; echo "exit $?"`, then `docker inspect -f \'{{.State.OOMKilled}}\' cg-oom`.',
			'Ask systemd for the same limits in your own user session: `systemd-run --user --scope -p MemoryMax=64M -p CPUQuota=50% sh -c \'CG=/sys/fs/cgroup$(cut -d: -f3 /proc/self/cgroup); echo $CG; cat $CG/cpu.max $CG/memory.max\'`.',
			'Clean up: `docker rm -f cg-lab cg-oom`.'
		],
		done: [
			'Step 2 prints `0::/system.slice/docker-<id>.scope`, then `150000 100000`, `536870912` and one PID.',
			'Step 3 lists two PIDs in `cgroup.procs`.',
			'Step 4 prints `exit 137`, and `docker inspect` prints `true`.',
			'Step 5 prints a path ending in `run-<random>.scope`, then `50000 100000` and `67108864`.'
		],
		solution: [
			'`--cpus 1.5` is a quota of 150000 µs per 100000 µs period, and `512m` is 512 × 1024 × 1024 bytes. The kernel enforces both from these two files.',
			'`docker exec` puts the new process in the container\'s cgroup, so the limits cover it too, like any child the container forks.',
			'Python asked for 200 MiB in a 64 MiB group. The OOM killer ran inside the cgroup and killed it: exit code 137.',
			'`CPUQuota=50%` became `50000 100000` and `MemoryMax=64M` became `67108864`. A `myapp.service` drop-in with `CPUQuota=150%` and `MemoryMax=512M` writes the same files under `system.slice`.'
		]
	},
	recall: {
		q: 'Where does `docker run --cpus 0.5 --memory 256m` put its limits, and what values do the files hold?',
		a: 'In the container\'s cgroup directory, here `/sys/fs/cgroup/system.slice/docker-<id>.scope`: `cpu.max` holds `50000 100000` and `memory.max` holds `268435456`. The kernel enforces both for every process in the cgroup.'
	},
	sources: [
		{ title: 'Linux kernel docs, Control Group v2', url: 'https://docs.kernel.org/admin-guide/cgroup-v2.html' },
		{ title: 'systemd.resource-control(5)', url: 'https://www.freedesktop.org/software/systemd/man/latest/systemd.resource-control.html' },
		{ title: 'systemd-cgls(1)', url: 'https://www.freedesktop.org/software/systemd/man/latest/systemd-cgls.html' },
		{ title: 'Docker docs, Resource constraints', url: 'https://docs.docker.com/engine/containers/resource_constraints/' },
		{ title: 'opencontainers/cgroups source, fs2/cpu.go', url: `${CG}/fs2/cpu.go` }
	]
};
