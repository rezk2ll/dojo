const K = 'https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a';
const CG2 = `${K}/Documentation/admin-guide/cgroup-v2.rst`;
const CGROUPS = 'https://github.com/opencontainers/cgroups/blob/30a2293c0b0325280ea70a86fe991ec1e87b5d00';
const ISSUE = 'https://github.com/argoproj/argo-helm/issues/3895';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'memory-cgroups',
	part: 'Memory',
	title: 'Memory limits in containers',
	minutes: 10,
	hook: [
		'The Argo CD Helm chart starts Dex with an init container that runs `cp -n /usr/local/bin/argocd /shared/argocd-dex`. The binary is 219 MB. The init container has the chart\'s default memory limit, 64Mi.',
		'In [argo-helm issue 3895](' + ISSUE + '), the init container ends with `exitCode: 137` and `reason: OOMKilled`. The retry finds the half-written file, `cp -n` skips it and exits 0. Dex then runs the truncated binary and dies with exit code 139: **1100+ restarts over 4 days**.',
		'`cp` had no 219 MB buffer. The reporter wrote that "the page cache of the 219 MB `argocd` binary copy is accounted against the cgroup\'s `memory.max`". The fix merged in September 2026 changed `cp -n` to `cp -f`, so a retry rewrites the file.'
	],
	terms: [
		{ term: 'memory.max', def: 'The cgroup v2 hard limit, in bytes. When the cgroup\'s usage reaches it and reclaim cannot bring it down, the kernel runs the OOM killer inside that cgroup.' },
		{ term: 'memory.high', def: 'The cgroup v2 throttle limit. Above it the cgroup\'s processes are slowed down and made to reclaim, and the OOM killer never runs because of it.' },
		{ term: 'memory.current', def: 'What the cgroup uses now: anonymous memory, page cache including `tmpfs`, and kernel memory such as dentries, inodes and socket buffers.' },
		{ term: 'memory.events', def: 'Counters for the cgroup: `high` and `max` count hits on each limit, `oom` counts allocations about to fail, `oom_kill` counts processes killed.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['spec["Pod spec: limits.memory: 64Mi"] --> runc["runc writes 67108864 to memory.max"]'],
				highlight: ['spec', 'runc'],
				note: 'The kubelet passes the container\'s memory limit to the container runtime, and runc writes it in bytes to the container cgroup\'s `memory.max`. 64Mi is 67,108,864 bytes. Without a limit the file stays at its default, `max`.'
			},
			{
				add: ['runc --> charge["Every page the container creates is charged: anon, page cache, tmpfs"]'],
				highlight: ['charge'],
				note: 'The cgroup v2 docs list what counts: "page cache and anonymous memory", kernel structures "such as dentries and inodes", and TCP socket buffers. A file page is charged to the cgroup that first read or wrote it. Files in `tmpfs`, like a `medium: Memory` emptyDir, count as page cache.'
			},
			{
				add: ['charge --> full["memory.current reaches memory.max"]', 'full --> reclaim["Reclaim inside the cgroup: drop clean file pages, write dirty ones first"]'],
				highlight: ['full', 'reclaim'],
				note: 'The kernel does not kill anything yet: it reclaims pages from this cgroup only. It drops clean file pages at once, and writes dirty file pages to disk before dropping them. The `max` field of `memory.events` counts each time usage was about to go over the limit.'
			},
			{
				add: ['reclaim -->|"nothing left to free: anon or tmpfs, no swap"| oom["Memory cgroup out of memory: Killed process"]'],
				highlight: ['oom'],
				note: 'Anonymous pages and `tmpfs` pages have no file on disk to go back to. With `memory.swap.max` at 0 they cannot leave RAM. When reclaim frees nothing, the OOM killer picks a victim among this cgroup\'s processes only and `oom_kill` goes up by 1.'
			},
			{
				add: ['oom --> code["SIGKILL: exit code 128 + 9 = 137, reason OOMKilled"]'],
				highlight: ['code'],
				note: 'The victim gets SIGKILL, signal 9. A shell reports a process killed by signal N as 128 + N, so 137. The kubelet shows the container as `Terminated`, `Reason: OOMKilled`, `Exit Code: 137`.'
			}
		]
	},
	example: {
		title: 'opencontainers/cgroups fs2/memory.go: runc writes the limits',
		repo: 'opencontainers/cgroups',
		url: `${CGROUPS}/fs2/memory.go#L35-L78`,
		lang: 'go',
		code: `func setMemory(dirPath string, r *cgroups.Resources) error {
	if !isMemorySet(r) {
		return nil
	}

	if err := CheckMemoryUsage(dirPath, r); err != nil {
		return err
	}

	swap, err := cgroups.ConvertMemorySwapToCgroupV2Value(r.MemorySwap, r.Memory)
	if err != nil {
		return err
	}
	swapStr := numToStr(swap)
	if swapStr == "" && swap == 0 && r.MemorySwap > 0 {
		// memory and memorySwap set to the same value -- disable swap
		swapStr = "0"
	}
	// never write empty string to \`memory.swap.max\`, it means set to 0.
	if swapStr != "" {
		if err := cgroups.WriteFile(dirPath, "memory.swap.max", swapStr); err != nil {
			// If swap is not enabled, silently ignore setting to max or disabling it.
			if !(errors.Is(err, os.ErrNotExist) && (swapStr == "max" || swapStr == "0")) { //nolint:staticcheck // Ignore "QF1001: could apply De Morgan's law".
				return err
			}
		}
	}

	if val := numToStr(r.Memory); val != "" {
		if err := cgroups.WriteFile(dirPath, "memory.max", val); err != nil {
			return err
		}
	}

	// cgroup.Resources.KernelMemory is ignored

	if val := numToStr(r.MemoryReservation); val != "" {
		if err := cgroups.WriteFile(dirPath, "memory.low", val); err != nil {
			return err
		}
	}

	return nil
}`,
		notes: [
			'runc runs this cgroup v2 code: runc\'s `go.mod` requires `github.com/opencontainers/cgroups v0.1.0`, the commit linked here. Line 30 writes the container\'s memory limit in bytes to `memory.max`.',
			'Line 10 converts the swap setting. The OCI spec copies cgroup v1, where the swap value means memory plus swap. [`ConvertMemorySwapToCgroupV2Value`](' + CGROUPS + '/utils.go#L447-L472) returns `memorySwap - memory`: a 512 MB limit with a 1 GB memory+swap value gives 512 MB in `memory.swap.max`.',
			'Lines 15 to 17: when memory and memory+swap are equal, the difference is 0 and the code writes `"0"`, which turns swap off for the container. Line 19 explains why: an empty string written to that file also means 0.',
			'Line 38 writes the memory reservation to `memory.low`, a soft protection from reclaim. Nothing in this function writes `memory.high`.'
		]
	},
	tradeoff: {
		gain: [
			'A container with a 64Mi limit cannot take the node\'s RAM. The cgroup v2 docs: if the OOM killer runs in a cgroup, "it\'s not going to kill any tasks outside of this cgroup".',
			'Page cache counts against the container\'s own limit, so a container that reads 2 GB of logs keeps at most its limit in RAM.'
		],
		cost: [
			'`memory.current` includes page cache, so a container that reads many files shows close to 100% of its limit while it is healthy.',
			'Files in a `medium: Memory` emptyDir count against the pod\'s limit. Writing 100 MB to `tmpfs` under a 50 MB limit gets the writer killed.',
			'The victim gets SIGKILL in the middle of its work. A half-written file stays on disk, as in the hook, where the retry kept the truncated binary.'
		]
	},
	task: {
		prompt: 'On a systemd machine with cgroup v2, run two writes under a 50 MB limit with no swap: `systemd-run --user --scope -p MemoryMax=50M -p MemorySwapMax=0 sh -c \'head -c 200M /dev/zero > ~/big.bin; cat /sys/fs/cgroup$(cut -d: -f3 /proc/self/cgroup)/memory.events\'`, then the same with `/dev/shm/big.bin` and 100M. Why does one survive and the other not?',
		hint: 'Your home directory is on a disk, `/dev/shm` is `tmpfs`. Which pages can reclaim free?',
		answer: [
			'Output captured in this session on a 6.17 kernel. The 200 MB write to disk exits 0, and `memory.events` shows `max 955` and `oom_kill 0`. The same run also read `memory.stat`: `file 49397760`, and `memory.peak`: `52428800`.',
			'The file pages were charged to the cgroup up to the 50 MB limit. Each time the limit was hit, reclaim wrote file pages to disk and dropped them: 955 times, and the copy finished.',
			'The 100 MB write to `/dev/shm` prints `Killed` with exit status 137, and the file stops at 49.2 MB. systemd logs "A process of this unit has been killed by the OOM killer".',
			'`tmpfs` pages have no disk file behind them, and `MemorySwapMax=0` forbids swap. Reclaim freed nothing, so the OOM killer ran inside the cgroup.'
		],
		steps: [
			{
				title: 'Read the setup',
				questions: [
					{ q: 'What does `-p MemoryMax=50M` set for the scope?', options: ['A throttle: `memory.high` at 50 MB', 'A hard limit: `memory.max` at 50 MB', 'A reservation: `memory.low` at 50 MB', 'A cap on swap only'], answer: 1, why: '`MemoryMax` is the hard limit. When usage reaches it and reclaim cannot bring it down, the kernel runs the OOM killer in that cgroup.' },
					{ q: 'Why add `-p MemorySwapMax=0`?', options: ['So anonymous and `tmpfs` pages cannot leave RAM through swap', 'So the write goes faster', 'So page cache is not counted', 'So the OOM killer never runs'], answer: 0, why: 'With swap at 0, pages with no file behind them have nowhere to go. That makes the test clear.' },
					{ q: 'Next to `memory.events`, which file of the scope splits its usage into page cache and anonymous memory?', options: ['`memory.max`', '`memory.swap.max`', '`memory.stat`', '`/proc/meminfo`'], answer: 2, why: '`memory.stat` breaks `memory.current` down by type, with lines such as `file` and `anon`. `/proc/meminfo` covers the whole machine.' },
					{ q: 'What is the difference between `~/big.bin` and `/dev/shm/big.bin`?', options: ['The second one is compressed', 'Both are on disk, in different folders', 'The first one is in RAM, the second on disk', 'The first is on a disk, the second on `tmpfs`'], answer: 3, why: 'Your home directory sits on a disk. `/dev/shm` is `tmpfs`, so its files live only in memory.' }
				]
			},
			{
				title: 'Follow the disk write',
				questions: [
					{ q: '`head` writes 200 MB to `~/big.bin` under a 50 MB limit. Where do those pages go first?', options: ['Straight to disk, never in RAM', 'Into page cache, charged to the cgroup', 'Into swap', 'Into the host\'s free memory, charged to nobody'], answer: 1, why: 'A file page is charged to the cgroup that first wrote it. `memory.stat` showed `file 49397760` during the run.' },
					{ q: 'Usage reaches 50 MB. What does the kernel do first?', options: ['Reclaims inside the cgroup: writes dirty file pages, then drops them', 'Kills `head` at once', 'Lets the cgroup go over the limit', 'Fails the `write` call with ENOMEM'], answer: 0, why: 'The kernel does not kill anything yet. It writes dirty file pages to disk and drops them.' },
					{ q: '`memory.events` shows `max 955`. What is 955?', options: ['The number of OOM kills', 'The number of MB written', 'The number of times usage was about to go over the limit', 'The number of pages in swap'], answer: 2, why: 'The `max` field counts hits on the limit. Each hit ended in reclaim, not in a kill.' },
					{ q: 'The write is done. How much of `~/big.bin` is still in the cgroup\'s page cache?', options: ['All 200 MB', 'None of it', 'About 150 MB', 'At most about 50 MB: the rest was written out and dropped'], answer: 3, why: 'Reclaim kept usage under the 50 MB limit, so most of the file left RAM once it was on disk. The whole 200 MB file is on the disk.' }
				]
			},
			{
				title: 'Follow the tmpfs write',
				questions: [
					{ q: 'The 100 MB write to `/dev/shm` prints `Killed`. What exit status does the shell report?', options: ['137', '139', '1', '9'], answer: 0, why: 'SIGKILL is signal 9. A shell reports a process killed by signal N as 128 + N.' },
					{ q: 'The file stops at 49.2 MB. Why there?', options: ['`/dev/shm` is 49.2 MB in size', '`head` gave up at that size', 'Charged pages reached the 50 MB limit and could not be freed', 'The disk filled up'], answer: 2, why: 'The `tmpfs` pages stay charged to the cgroup. At the limit, reclaim had nothing to free.' },
					{ q: 'Why can reclaim not drop the `tmpfs` pages?', options: ['They are locked by `head`', 'They have no disk file behind them, and swap is 0', 'They belong to the kernel', 'They are huge pages'], answer: 1, why: 'Dropping a `tmpfs` page would lose the data. With `MemorySwapMax=0`, swap is not an option either.' },
					{ q: 'Which counter goes up in `memory.events` for this run?', options: ['Only `high`', 'Only `low`', 'Nothing: the kill is not counted', '`oom_kill`'], answer: 3, why: 'When the OOM killer picks a victim among the cgroup\'s processes, `oom_kill` goes up by 1.' }
				]
			},
			{
				title: 'Explain the difference',
				questions: [
					{ q: 'In one line, why does one survive?', options: ['Disk pages can be written back and dropped, `tmpfs` pages cannot', 'The disk write was slower, so the limit kept up', 'The disk file was smaller', 'systemd raises the limit for files in the home directory'], answer: 0, why: 'Reclaim frees file pages with a disk copy. `tmpfs` and anonymous pages need swap, and swap was 0.' },
					{ q: 'Would a higher `MemoryMax` have saved the `/dev/shm` run?', options: ['No: a `tmpfs` write is always killed', 'No: only swap can help', 'Yes, with a limit above the 100 MB file plus the shell\'s own usage', 'Yes, with any limit above 50 MB'], answer: 2, why: '`tmpfs` pages stay charged, so the limit must hold the whole file. Under 100 MB plus the rest, the writer dies again at the limit.' },
					{ q: 'The killed writer left its file in `/dev/shm`. What gives that RAM back?', options: ['`sync`', '`rm /dev/shm/big.bin`', '`echo 3 > /proc/sys/vm/drop_caches`', 'Nothing: the kernel frees it when the writer dies'], answer: 1, why: 'A `tmpfs` file lives only in RAM, and no disk copy exists to fall back on. It stays until you delete it, even after its writer is gone.' },
					{ q: 'The `tmpfs` writer was killed in the middle. What is left behind?', options: ['Nothing: the kernel deletes the file', 'The full 100 MB file', 'An empty file', 'A half-written file, as in the Argo CD hook'], answer: 3, why: 'SIGKILL stops the writer at once. The file stays at 49.2 MB, like the truncated binary in the hook.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'A container with a 512Mi limit holds 300 MB of heap and reads 2 GB of log files from disk. `memory.current` sits at 512Mi. What happens next?',
			options: [
				'The OOM killer kills the container as soon as it reaches 512Mi',
				'Reclaim drops clean file pages; the container keeps running and `max` rises in `memory.events`',
				'The kernel lets the container go over its limit, since page cache is not counted',
				'The kernel moves the page cache to the host and charges it to no cgroup'
			],
			answer: 1,
			why: 'Page cache is charged to the cgroup, so usage reaches the limit. Clean file pages can be dropped by reclaim, so the 300 MB of heap fits and no OOM happens. Each hit on the limit adds 1 to `max` in `memory.events`.'
		},
		{
			q: 'Which of these counts against a pod\'s `memory.max`?',
			options: [
				'Files the pod writes to an emptyDir with `medium: Memory`',
				'Memory the pod\'s image layers take on the registry',
				'The kubelet\'s own memory on that node',
				'Page cache of files that other pods read first'
			],
			answer: 0,
			why: 'A `medium: Memory` emptyDir is `tmpfs`, and the cgroup v2 `file` counter includes "tmpfs and shared memory". A page is charged to the cgroup that created it, so pages another pod read first stay charged to that pod.'
		},
		{
			q: 'You set `memory.high` to 400M and `memory.max` to 500M. The process goes to 450M. What happens?',
			options: [
				'The OOM killer kills the process at once, since 450M is over 400M',
				'Nothing happens until the process reaches 500M',
				'Its new allocations fail with ENOMEM until usage drops',
				'It is throttled and made to reclaim, with no OOM kill'
			],
			answer: 3,
			why: 'The cgroup v2 docs: over the high boundary "the processes of the cgroup are throttled and put under heavy reclaim pressure", and "Going over the high limit never invokes the OOM killer". Only `memory.max` leads to an OOM kill.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Run the chapter\'s two writes in a Docker container: page cache survives the limit, `tmpfs` does not.',
		steps: [
			'Write 200 MB to the container\'s disk under a 50 MB limit with no swap, then read the counters: `docker run --rm -m 50m --memory-swap 50m alpine sh -c \'head -c 200m /dev/zero > /big.bin; echo rc=$?; grep -E "^(max|oom_kill) " /sys/fs/cgroup/memory.events; grep "^file " /sys/fs/cgroup/memory.stat\'`.',
			'Write 100 MB to `tmpfs` under the same limit. `--shm-size` makes `/dev/shm` big enough, so only the memory limit can stop it: `docker run --name cg-lab -m 50m --memory-swap 50m --shm-size 200m alpine sh -c \'head -c 100m /dev/zero > /dev/shm/big.bin\'`, then `echo $?`.',
			'Ask Docker what happened: `docker inspect -f \'{{.State.OOMKilled}} {{.State.ExitCode}}\' cg-lab`. Then clean up with `docker rm cg-lab`.'
		],
		done: [
			'Step 1 prints `rc=0`, a `max` count in the hundreds, `oom_kill 0`, and a `file` value close to 50 MB.',
			'Step 2 prints 137.',
			'`docker inspect` prints `true 137`.'
		],
		solution: [
			'The disk write fills page cache up to the limit, and each hit on `memory.max` ends in reclaim: the kernel writes the pages to disk and drops them.',
			'The `tmpfs` pages have no file behind them and swap is 0, so reclaim frees nothing. The OOM killer runs inside the container\'s cgroup.',
			'Even a shell command after `head` can be killed in step 2: the `tmpfs` file stays charged at the limit, so the container has no room left. That is why step 3 asks Docker from the outside.'
		]
	},
	recall: {
		q: 'What does a container\'s `memory.current` count, and when does reaching `memory.max` end in exit code 137?',
		a: 'Anonymous memory, page cache including `tmpfs`, and kernel memory. Reaching `memory.max` first triggers reclaim. Only when reclaim frees nothing (anon or `tmpfs` pages, no swap) does the OOM killer send SIGKILL: 128 + 9 = 137.'
	},
	sources: [
		{ title: 'Linux v6.12, Documentation/admin-guide/cgroup-v2.rst (Memory)', url: CG2 },
		{ title: 'opencontainers/cgroups v0.1.0, fs2/memory.go', url: `${CGROUPS}/fs2/memory.go` },
		{ title: 'argo-helm issue 3895: copyutil init container OOMs on cgroup v2', url: ISSUE },
		{ title: 'argo-helm PR 4105: overwrite partial argocd-dex binary', url: 'https://github.com/argoproj/argo-helm/pull/4105' },
		{ title: 'Kubernetes docs, Resource Management for Pods and Containers', url: 'https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/' },
		{ title: 'bash(1), man7.org (EXIT STATUS)', url: 'https://man7.org/linux/man-pages/man1/bash.1.html' }
	]
};
