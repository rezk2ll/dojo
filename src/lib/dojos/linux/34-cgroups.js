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
