const K = 'https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a';
const KUBE = 'https://github.com/kubernetes/kubernetes/blob/f28b4c9efbca5c5c0af716d9f2d5702667ee8a45';
const KRCL = `${KUBE}/pkg/kubelet/kuberuntime/kuberuntime_container_linux.go`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'swap',
	part: 'Memory',
	title: 'Swap',
	minutes: 10,
	hook: [
		'You add a node to a Kubernetes cluster. The kubelet exits at once with `running with swap on is not supported, please disable swap or set --fail-swap-on flag to false`. The kubelet read `/proc/swaps` at startup and found one swap partition listed there.',
		'The kubelet has refused swap by default since a [July 2017 commit](https://github.com/kubernetes/kubernetes/commit/71e8c8eba43a0fade6e4edfc739b331ba3cc658a) that added `--fail-swap-on=true`. The issue "Kubelet/Kubernetes should work with Swap Enabled" collected 238 thumbs up and 122 comments between October 2017 and July 2021.',
		'The swap design document gives the reason: "it is difficult to provide guarantees and account for pod memory utilization when swap is involved". The `NodeSwap` feature arrived as alpha in 1.22 and became GA in **1.34, where the kubelet still refuses swap unless you set `failSwapOn: false`**.'
	],
	terms: [
		{ term: 'Anonymous page', def: 'A page of memory with no file behind it: heap, stack, or `mmap` with `MAP_ANONYMOUS`. The kernel can free it only by writing it to swap.' },
		{ term: 'Swap', def: 'A partition or file where the kernel writes anonymous pages to free RAM. `swapon --show` lists them, and `/proc/meminfo` shows `SwapTotal` and `SwapFree`.' },
		{ term: 'vm.swappiness', def: 'A sysctl from 0 to 200, default 60, that tells reclaim how costly swap I/O is compared to reading file pages back.' },
		{ term: 'memory.swap.max', def: 'The cgroup v2 file that caps how much swap one cgroup may use. At 0, the cgroup\'s anonymous pages are never swapped out.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['write["A process writes to its heap"] --> anon["The kernel gives it a new anonymous page, marked dirty"]'],
				highlight: ['write', 'anon'],
				note: 'The kernel docs: "When the program performs a write, a regular physical page will be allocated to hold the written data." No file holds a copy of that page. If the kernel needs the RAM back, the page has to go to swap.'
			},
			{
				add: ['anon --> low["Free pages fall under the low watermark"]', 'low --> kswapd["kswapd scans pages to reclaim"]'],
				highlight: ['low', 'kswapd'],
				note: 'When free memory drops under the low watermark, an allocation wakes the `kswapd` kernel thread. It frees pages in the background. Under the min watermark, the allocating process does the reclaim itself and waits: that is direct reclaim.'
			},
			{
				add: ['kswapd -->|"file page"| drop["Clean page cache: dropped, read again from the file later"]', 'kswapd -->|"anonymous page"| swapout["Written to swap, vmstat so goes up"]'],
				highlight: ['drop', 'swapout'],
				note: 'Reclaim has two kinds of pages to take. `vm.swappiness` sets the balance: at 100 the kernel treats swap I/O and file I/O as equal, below 100 it prefers to drop page cache. The default is 60.'
			},
			{
				add: ['swapout --> touch["The process reads that address again"]', 'touch --> swapin["Major fault: page read back from swap, vmstat si goes up"]'],
				highlight: ['touch', 'swapin'],
				note: 'The page is no longer in RAM, so the access faults. The kernel loads the page from the swap device while the process waits. `/proc/<pid>/stat` counts it in `majflt`, "major faults ... which have required loading a memory page from disk".'
			},
			{
				add: ['swapin --> kube["Kubernetes LimitedSwap: kubelet writes memory.swap.max per container"]'],
				highlight: ['kube'],
				note: 'With `failSwapOn: false` and `swapBehavior: LimitedSwap`, the kubelet gives swap only to containers in Burstable pods. It writes the container\'s share to `memory.swap.max`. Every other container gets 0. The default behavior, `NoSwap`, gives 0 to every container.'
			}
		]
	},
	example: {
		title: 'kubelet kuberuntime_container_linux.go: the swap limit of one container',
		repo: 'kubernetes/kubernetes',
		url: `${KRCL}#L499-L527`,
		lang: 'go',
		code: `func (m swapConfigurationHelper) configureSwap(ctx context.Context, lcr *runtimeapi.LinuxContainerResources, swapMemory int64) {
	logger := klog.FromContext(ctx)
	if !isCgroup2UnifiedMode() {
		logger.Error(fmt.Errorf("swap configuration is not supported with cgroup v1"), "Swap configuration under cgroup v1 is unexpected")
		return
	}

	if lcr.Unified == nil {
		lcr.Unified = map[string]string{}
	}

	lcr.Unified[cm.Cgroup2MaxSwapFilename] = fmt.Sprintf("%d", swapMemory)
}

// The swap limit is calculated as (<containerMemoryRequest>/<nodeTotalMemory>)*<totalPodsSwapAvailable>.
// For more info, please look at the following KEP: https://kep.k8s.io/2400
func calcSwapForBurstablePods(containerMemoryRequest, nodeTotalMemory, totalPodsSwapAvailable int64) (int64, error) {
	if nodeTotalMemory <= 0 {
		return 0, fmt.Errorf("total node memory is 0")
	}
	if containerMemoryRequest > nodeTotalMemory {
		return 0, fmt.Errorf("container request %d is larger than total node memory %d", containerMemoryRequest, nodeTotalMemory)
	}

	containerMemoryProportion := float64(containerMemoryRequest) / float64(nodeTotalMemory)
	swapAllocation := containerMemoryProportion * float64(totalPodsSwapAvailable)

	return int64(swapAllocation), nil
}`,
		notes: [
			'Line 12 puts the limit into the `Unified` map under `Cgroup2MaxSwapFilename`, which is the string `"memory.swap.max"`. The container runtime writes that value into the container\'s cgroup. Lines 3 to 5 log an error and stop on cgroup v1.',
			'Lines 25 and 26 compute the share: memory request divided by node RAM, times the swap. On a node with 40 GB of RAM and 40 GB of swap, a container that requests 10 GB gets 10 GB of swap.',
			'The caller, [`ConfigureLimitedSwap`](' + KRCL + '#L472-L483), passes the machine\'s whole `SwapCapacity` as `totalPodsSwapAvailable`. When the calculation returns an error, it calls `ConfigureNoSwap`, which writes 0.',
			'Which containers get here is decided in [`GetContainerSwapBehavior`](' + KRCL + '#L223-L248): only Burstable pods, never critical pods, and never a container whose memory request equals its limit. Those get `NoSwap`, so line 12 writes 0.'
		]
	},
	tradeoff: {
		gain: [
			'Anonymous pages that a program wrote once at startup and never reads again can leave RAM. That RAM goes back to page cache or to other processes.',
			'A short spike above RAM can be absorbed by swap instead of ending in the OOM killer. The Kubernetes docs list this: swap "helps prevent Pods from being terminated during memory pressure spikes".'
		],
		cost: [
			'A page read back from swap costs a disk read in the middle of a request. The Kubernetes docs: swapping back is "sometimes slower by many orders of magnitude".',
			'The Kubernetes scheduler places pods by memory requests and does not count swap, so two swap-heavy pods can land on one node.',
			'Secrets in `tmpfs` volumes could be written to disk. The kubelet mounts them with the `noswap` option when the kernel supports it, from 6.3 on.'
		]
	},
	task: {
		prompt: 'On a Linux machine, run `swapon --show`, `cat /proc/sys/vm/swappiness` and `vmstat 1 3`. Is the machine short of memory? Use the `swpd`, `si` and `so` columns.',
		hint: '`swpd` is how much sits in swap now. `si` and `so` are how much moves in and out each second. Ignore the first `vmstat` line: it is an average since boot.',
		answer: [
			'Output captured in this session on a 27 GiB laptop: `swapon` shows `/dev/dm-2 partition 3.8G 2.3G`, swappiness is `60`, and `vmstat` shows `swpd` at about 2,452,988 kB with `free` near 3.3 GB and `cache` near 15 GB.',
			'The two lines after the first show `si` at 4 and 0, and `so` at 0 and 0. The 2.3 GB in swap stays there and nothing reads it back.',
			'The machine is not short of memory. The kernel moved pages that nobody used to swap and kept 15 GB of page cache in RAM instead. Trouble looks like `si` and `so` in the thousands on every line, with processes stalled on major faults.'
		],
		steps: [
			{
				title: 'Read the swap setup',
				questions: [
					{ q: '`swapon --show` prints `/dev/dm-2 partition 3.8G 2.3G`. What does the 2.3G say?', options: ['The swap is 2.3 GB too small', 'The kernel reads 2.3 GB per second from it', '2.3 GB of pages sit in swap right now', 'The machine has 2.3 GB of free RAM'], answer: 2, why: 'The columns are name, type, size and used. 2.3 GB of the 3.8 GB partition holds pages today.' },
					{ q: 'How full is the swap device?', options: ['About 2.3%', 'About 60%', 'About 38%', 'Full'], answer: 1, why: '2.3G used out of 3.8G is about 60%. On its own, that does not say swap is hurting.' },
					{ q: 'Swappiness reads `60`. What does that value set?', options: ['How costly swap I/O is compared to reading file pages back', 'The percent of RAM that can go to swap', 'The seconds a page waits before it is swapped', 'The swap size in GB'], answer: 0, why: '`vm.swappiness` goes from 0 to 200 and tells reclaim how costly swap I/O is. 60 is the default.' },
					{ q: 'At 60, which pages does reclaim prefer to take first?', options: ['Anonymous pages, written to swap', 'Pages of the busiest process', 'Neither: it waits for the OOM killer', 'Page cache, dropped without I/O'], answer: 3, why: 'At 100 swap and file I/O count the same. Below 100, the kernel prefers to drop page cache.' }
				]
			},
			{
				title: 'Read the vmstat lines',
				questions: [
					{ q: 'Which `vmstat 1 3` line do you skip?', options: ['The first one: it is an average since boot', 'The last one: it is cut short', 'The middle one: it repeats the first', 'None: they all mean the same'], answer: 0, why: 'The first line averages everything since boot. The next lines show each second.' },
					{ q: 'What does the `swpd` column show?', options: ['Pages swapped in each second', 'Pages swapped out each second', 'How much sits in swap now', 'The swap device name'], answer: 2, why: '`swpd` is the amount stored in swap. It says nothing about traffic.' },
					{ q: 'What do `si` and `so` show?', options: ['The swap partition and swap file sizes', 'How much moves in from swap and out to swap each second', 'Swap I/O errors in and out', 'The share of CPU spent on swap'], answer: 1, why: '`si` is swap in and `so` is swap out, both per second. They show the work, not the stock.' },
					{ q: 'A page in swap is read again. What does the process see?', options: ['A segmentation fault', 'A SIGKILL from the kernel', 'Nothing: swap is as fast as RAM', 'A major fault: it waits while the page is read from disk'], answer: 3, why: 'The page is not in RAM, so the access faults and the process waits. `si` goes up and `majflt` counts it.' }
				]
			},
			{
				title: 'Judge the traffic',
				questions: [
					{ q: 'After the first line, `si` reads 4 and 0, `so` reads 0 and 0. What do you conclude?', options: ['The 2.3 GB stays in swap and nobody reads it back', 'The machine is thrashing', 'The swap device has failed', 'The kernel is about to call the OOM killer'], answer: 0, why: 'Pages that sit in swap untouched cost no I/O. The traffic is close to zero.' },
					{ q: '`cache` sits near 15 GB. Why would the kernel keep it while 2.3 GB is in swap?', options: ['Page cache can never be dropped', 'Swappiness at 0 forbids dropping it', 'Swapped pages were not in use, while the cached files are read', 'Swap is always used before cache'], answer: 2, why: 'The kernel moved pages nobody used to swap and gave the RAM to page cache that serves reads.' },
					{ q: 'If processes did stall on swap, which per-process counter would climb?', options: ['`utime`', '`majflt` in `/proc/<pid>/stat`', '`nr_throttled` in `cpu.stat`', '`VmPTE` in `status`'], answer: 1, why: 'Each page read back from swap is a major fault, and `/proc/<pid>/stat` counts them in `majflt`.' },
					{ q: 'One line shows `si` at 4. What does that say?', options: ['4 GB came back from swap', '4 pages were written to swap', '4 processes live in swap', 'A small read back from swap during that second'], answer: 3, why: '`si` is the amount swapped in per second. 4, then 0, is a trickle: something touched a few parked pages.' }
				]
			},
			{
				title: 'Give the verdict',
				questions: [
					{ q: 'Is this laptop short of memory?', options: ['Yes: swap is more than half full', 'No: swap holds unused pages and barely moves', 'Yes: free RAM is only 3.3 GB', 'Cannot say without the OOM log'], answer: 1, why: 'Traffic is near zero and the kernel keeps 15 GB of page cache. Memory is not tight.' },
					{ q: 'A colleague wants to lower swappiness on this laptop. Does it help?', options: ['Yes: it frees the 2.3 GB in swap', 'Yes: it makes every file read faster', 'No: swap barely moves, so there is no cost to cut', 'No: swappiness only works above 100'], answer: 2, why: 'Swappiness changes what reclaim prefers the next time memory is short. With `si` and `so` near 0, swapping costs nothing here.' },
					{ q: 'A page written once at startup is never read again. Once it is in swap, what happens to the RAM it held?', options: ['It goes back to page cache or to other processes', 'It stays reserved for that page', 'The OOM killer takes it back', 'Only a reboot frees it'], answer: 0, why: 'Pages written once and never read again can leave RAM. That RAM goes back to page cache or to other processes.' },
					{ q: 'Which numbers do you put in your answer?', options: ['Only the swap size', 'Only swappiness', 'Only the `free` column', '`swpd`, plus `si` and `so` after the first line'], answer: 3, why: '`swpd` says how much is parked, `si` and `so` say whether it moves. Together they answer the question.' }
				]
			}
		]
	},
	quiz: [
		{
			q: '`vm.swappiness` is 0 on a server. What does the kernel do?',
			options: [
				'It never swaps, as if every swap device had been turned off',
				'It swaps once free and file pages fall under the high watermark',
				'It swaps every anonymous page out as soon as it is written',
				'It swaps only processes whose `oom_score_adj` is above 0'
			],
			answer: 1,
			why: 'The vm sysctl docs: "At 0, the kernel will not initiate swap until the amount of free and file-backed pages is less than the high watermark in a zone." Swap stays usable. Only `swapoff` or no swap device turns it off.'
		},
		{
			q: '`vmstat 1` shows `swpd` at 3 GB, while `si` and `so` stay at 0 for a minute. What does it mean?',
			options: [
				'The machine is thrashing and needs more RAM right now',
				'The swap device has failed, so the counters stopped moving',
				'3 GB of pages sit in swap and nobody is reading or writing them',
				'The kernel is about to start the OOM killer'
			],
			answer: 2,
			why: '`swpd` is the amount stored in swap. `si` and `so` are the amounts moved each second. Pages that sit in swap untouched cost no I/O. Slowness comes from pages moving in and out all the time.'
		},
		{
			q: 'A node runs with `swapBehavior: LimitedSwap`. A container in a pod has a memory request and limit of 4Gi. How much swap can it use?',
			options: [
				'4Gi, the same as its memory limit',
				'Its request divided by node RAM, times the node\'s swap',
				'All the free swap on the node',
				'None: the kubelet writes 0 to its `memory.swap.max`'
			],
			answer: 3,
			why: '`GetContainerSwapBehavior` returns `NoSwap` when the memory request equals the limit. Then `configureSwap` writes 0 as `memory.swap.max`, so the kernel never swaps out that container\'s anonymous pages.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Read swap the way the chapter does: what is parked, what moves, and how a cgroup caps it.',
		steps: [
			'On a Linux machine, read the setup: `swapon --show` and `cat /proc/sys/vm/swappiness`.',
			'Watch the traffic for five seconds: `vmstat 1 5`. Skip the first line and read `swpd`, `si` and `so`.',
			'Find who owns the parked pages: `for f in /proc/[0-9]*/status; do awk \'/^Name/{n=$2} /^VmSwap/{print $2, n}\' "$f"; done 2>/dev/null | sort -rn | head -5`.',
			'Read the swap cap of a container with no swap: `docker run --rm -m 64m --memory-swap 64m alpine cat /sys/fs/cgroup/memory.swap.max`.',
			'Do the same with Docker\'s default and with more room: `docker run --rm -m 64m alpine cat /sys/fs/cgroup/memory.swap.max`, then the same with `--memory-swap 192m`.'
		],
		done: [
			'You can say how much sits in swap and whether `si` and `so` move after the first line.',
			'The `VmSwap` list names the five processes with the most kB in swap.',
			'The first container prints `0`, the second `67108864`, the third `134217728`.'
		],
		solution: [
			'A large `swpd` with `si` and `so` near 0 means pages parked in swap. The processes at the top of the `VmSwap` list wrote those pages once and stopped reading them.',
			'Docker\'s `--memory-swap` is RAM plus swap. 64m and 64m leaves 0 for swap, which Docker writes to `memory.swap.max`, the same file the kubelet writes.',
			'With no `--memory-swap`, Docker allows as much swap as RAM: 64 MiB, or 67108864 bytes. 192m minus 64m leaves 128 MiB, or 134217728.'
		]
	},
	recall: {
		q: 'Which pages need swap to be freed, and which counters in `vmstat` show that swapping is hurting?',
		a: 'Anonymous pages: heap, stack, anonymous `mmap`. Page cache can be dropped without swap. `si` and `so` moving on every line hurt; a large `swpd` with `si` and `so` at 0 is pages parked in swap.'
	},
	sources: [
		{ title: 'Linux v6.12, Documentation/admin-guide/sysctl/vm.rst (swappiness)', url: `${K}/Documentation/admin-guide/sysctl/vm.rst` },
		{ title: 'Linux v6.12, Documentation/admin-guide/mm/concepts.rst (anonymous memory, reclaim)', url: `${K}/Documentation/admin-guide/mm/concepts.rst` },
		{ title: 'Kubernetes docs, Swap memory management', url: 'https://kubernetes.io/docs/concepts/cluster-administration/swap-memory-management/' },
		{ title: 'KEP-2400, Node system swap support', url: 'https://github.com/kubernetes/enhancements/blob/6ebe0a94771723b3f27cb4a757f0cc22f29e38a2/keps/sig-node/2400-node-swap/README.md' },
		{ title: 'kubernetes/kubernetes issue 53533: Kubelet/Kubernetes should work with Swap Enabled', url: 'https://github.com/kubernetes/kubernetes/issues/53533' },
		{ title: 'Kubernetes v1.34.0, NodeSwap feature gate history', url: `${KUBE}/pkg/features/kube_features.go#L1511-L1516` },
		{ title: 'vmstat(8), man7.org', url: 'https://man7.org/linux/man-pages/man8/vmstat.8.html' }
	]
};
