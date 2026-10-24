const LINUX = 'https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a';
const UTIL = `${LINUX}/mm/util.c`;
const OVERCOMMIT = `${LINUX}/Documentation/mm/overcommit-accounting.rst`;
const SYSCTL_VM = `${LINUX}/Documentation/admin-guide/sysctl/vm.rst`;
const MEMINFO = `${LINUX}/fs/proc/meminfo.c`;
const PAGE_TABLES = `${LINUX}/Documentation/mm/page_tables.rst`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'virtual-memory',
	part: 'Memory',
	title: 'Virtual memory',
	minutes: 10,
	hook: [
		'The machine used for this chapter is a laptop with 27 GiB of RAM and 3.8 GiB of swap. A Python script calls `mmap` for 100 GiB of anonymous memory, and the call returns at once. `/proc/self/status` then shows `VmSize: 104918924 kB` and `VmRSS: 10748 kB`.',
		'The process owns a 100 GiB range of addresses and uses 10 MiB of RAM. **The kernel gives a process RAM one 4 KiB page at a time, on the first write to that page.** The script writes one byte every 4096 bytes over 200 MiB: `VmRSS` grows by 204800 kB, and the process takes 51200 page faults.',
		'The Go FAQ answers the same surprise for Go programs: "The Go memory allocator reserves a large region of virtual memory as an arena for allocations", and "the reservation does not deprive other processes of memory". It tells you to read the RES column of `top` instead.'
	],
	terms: [
		{ term: 'Page', def: 'The unit the kernel maps memory in: 4096 bytes here (`getconf PAGESIZE`). A page of a process is either backed by a page of RAM or not yet.' },
		{ term: 'Page table', def: 'The per-process table the CPU reads to turn a virtual address into a RAM address. The `VmPTE` line of `status` gives its size.' },
		{ term: 'VSZ and RSS', def: 'VSZ (`VmSize`) is the size of every address range the process has mapped. RSS (`VmRSS`) is the part of it that is in RAM now. `ps` prints both, in KiB.' },
		{ term: 'Overcommit', def: 'Letting processes map more memory than RAM plus swap, on the bet that they will not touch all of it. `vm.overcommit_memory` picks the policy.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['map["mmap(100 GiB, MAP_PRIVATE, MAP_ANONYMOUS)"] --> acct["__vm_enough_memory: may the process commit 26214400 pages?"]'],
				highlight: ['map', 'acct'],
				note: 'A private, writable, anonymous mapping costs its full size in the kernel\'s commit count. Before it creates the mapping, the kernel adds the pages to `Committed_AS` and checks the overcommit policy. 100 GiB is 26214400 pages of 4 KiB.'
			},
			{
				add: ['acct -->|"mode 1 here: always yes"| vma["New address range: VmSize +100 GiB, VmRSS unchanged"]', 'acct -.->|"mode 0: more than RAM + swap"| enomem["mmap fails with ENOMEM"]'],
				highlight: ['vma', 'enomem'],
				note: 'This laptop runs `vm.overcommit_memory = 1`, so the answer is yes. In the default mode 0, the kernel refuses one request bigger than total RAM plus swap: 100 GiB is more than 27 + 3.8 GiB, so the same `mmap` would fail. Either way, no RAM is used yet.'
			},
			{
				add: ['vma -->|"first write at offset 0"| fault["Page fault: no page table entry for this address"]', 'fault --> page["Kernel takes a zeroed 4 KiB page, writes the entry, resumes the write"]'],
				highlight: ['fault', 'page'],
				note: 'On the first write, the MMU finds no translation for the address and raises a page fault. The kernel docs call this "Lazy Allocation". The kernel gives the address a page of RAM, which starts as zeros for `MAP_ANONYMOUS`, and the write runs again. `getrusage` counts it in `ru_minflt`, a fault "serviced without any I/O activity".'
			},
			{
				add: ['page -->|"51200 writes, 4096 bytes apart"| rss["VmRSS +204800 kB, VmPTE 80 to 488 kB, minflt +51200"]'],
				highlight: ['rss'],
				note: '200 MiB divided by 4 KiB is 51200 pages, and the script took exactly 51200 more minor faults. RSS grew by 204800 kB, the size of the touched pages. The page table grew from 80 kB to 488 kB to hold the new entries.'
			},
			{
				add: ['rss --> left["99.8 GiB never touched: no RAM, but counted in Committed_AS"]'],
				highlight: ['left'],
				note: 'The other 99.8 GiB cost no RAM. They still count in `Committed_AS`, which read 24291668 kB on this laptop against a `CommitLimit` of 18183952 kB. Only mode 2 enforces that limit: there, new mappings fail once `Committed_AS` would pass it.'
			}
		]
	},
	example: {
		title: 'mm/util.c (Linux v6.12): __vm_enough_memory, the overcommit check',
		repo: 'torvalds/linux',
		url: `${UTIL}#L1032-L1076`,
		lang: 'c',
		code: `int __vm_enough_memory(struct mm_struct *mm, long pages, int cap_sys_admin)
{
	long allowed;
	unsigned long bytes_failed;

	vm_acct_memory(pages);

	/*
	 * Sometimes we want to use more memory than we have
	 */
	if (sysctl_overcommit_memory == OVERCOMMIT_ALWAYS)
		return 0;

	if (sysctl_overcommit_memory == OVERCOMMIT_GUESS) {
		if (pages > totalram_pages() + total_swap_pages)
			goto error;
		return 0;
	}

	allowed = vm_commit_limit();
	/*
	 * Reserve some for root
	 */
	if (!cap_sys_admin)
		allowed -= sysctl_admin_reserve_kbytes >> (PAGE_SHIFT - 10);

	/*
	 * Don't let a single process grow so big a user can't recover
	 */
	if (mm) {
		long reserve = sysctl_user_reserve_kbytes >> (PAGE_SHIFT - 10);

		allowed -= min_t(long, mm->total_vm / 32, reserve);
	}

	if (percpu_counter_read_positive(&vm_committed_as) < allowed)
		return 0;
error:
	bytes_failed = pages << PAGE_SHIFT;
	pr_warn_ratelimited("%s: pid: %d, comm: %s, bytes: %lu not enough memory for the allocation\\n",
			    __func__, current->pid, current->comm, bytes_failed);
	vm_unacct_memory(pages);

	return -ENOMEM;
}`,
		notes: [
			'Line 6 adds the request to `vm_committed_as` before any check. [`meminfo.c`](' + MEMINFO + '#L128) prints that counter as `Committed_AS`. Line 42 takes the pages back off when the request fails.',
			'Lines 11 and 12 are mode 1, `OVERCOMMIT_ALWAYS`: the function returns 0 and every mapping succeeds. The sysctl docs say the kernel "pretends there is always enough memory until it actually runs out".',
			'Lines 14 to 17 are mode 0, the default. Line 15 compares this one request with total RAM pages plus swap pages. A 100 GiB `mmap` on this 27 GiB laptop with 3.8 GiB swap fails here, and a 20 GiB one passes, however much is already committed.',
			'Lines 20 to 37 are mode 2. `vm_commit_limit()` returns RAM times `overcommit_ratio` / 100, plus swap, minus reserves for root and for the process. Line 36 refuses the request once the committed total reaches that limit, and line 40 logs "not enough memory for the allocation".'
		]
	},
	tradeoff: {
		gain: [
			'A process pays RAM only for the pages it writes: 200 MiB of writes cost 204800 kB of RSS, out of a 100 GiB mapping.',
			'Programs can reserve large ranges up front, like the Go allocator\'s arena, without taking memory from other processes.'
		],
		cost: [
			'Every first write to a page is a trap into the kernel: 51200 minor faults to fill 200 MiB.',
			'With overcommit, `mmap` and `malloc` succeed for memory that may not exist. When processes do write it all, the kernel cannot fail the call any more and the OOM killer ends a process instead (chapter 11).',
			'A dashboard that plots VSZ shows 100 GiB for a process that uses 210 MiB of RAM.'
		]
	},
	task: {
		prompt: 'On a box with `vm.overcommit_memory = 1`, a process reports `VmSize: 104918924 kB`, `VmRSS: 215548 kB` and `VmPTE: 488 kB`. `/proc/meminfo` shows `CommitLimit: 18183952 kB` and `Committed_AS: 24291668 kB`. How much RAM does the process use? What would its 100 GiB `mmap` have done under mode 0, and under mode 2?',
		hint: 'Mode 0 compares one request with RAM plus swap (27 GiB + 3.8 GiB here). Mode 2 compares the committed total with `CommitLimit`.',
		answer: [
			'RAM: about 210 MiB, the `VmRSS` value, plus 488 kB of page tables. `VmSize` counts addresses that have no RAM behind them.',
			'Mode 0: 100 GiB is more than 27 GiB of RAM plus 3.8 GiB of swap, so line 15 of `__vm_enough_memory` rejects it and `mmap` returns `ENOMEM`.',
			'Mode 2: `Committed_AS` is already 24291668 kB, above the `CommitLimit` of 18183952 kB, so this mapping and any other new commit fail with `ENOMEM`.',
			'Check your own box with `sysctl vm.overcommit_memory` and `grep -i commit /proc/meminfo`. The default is 0.'
		],
		steps: [
			{
				title: 'Read the process lines',
				questions: [
					{ q: 'How many 4 KiB pages does `VmRSS: 215548 kB` stand for?', options: ['215548', '53887', '51200', '862192'], answer: 1, why: '215548 kB / 4 kB = 53887 pages that have RAM behind them. The 200 MiB the process wrote account for 51200 of them.' },
					{ q: '`VmRSS: 215548 kB` is about how much?', options: ['About 210 MiB', 'About 2 GiB', 'About 21 MiB', 'About 100 GiB'], answer: 0, why: '215548 kB divided by 1024 is about 210 MiB.' },
					{ q: 'What does `VmSize: 104918924 kB` count?', options: ['RAM plus swap used by the process', 'The pages the process wrote to', 'Every mapped range, with RAM or not', 'The memory of all its threads in RAM'], answer: 2, why: 'VSZ is the size of every mapping, including the 100 GiB the process never wrote.' },
					{ q: 'What is `VmPTE: 488 kB`?', options: ['Memory that went out to swap', 'Shared libraries it maps', 'The stack of the main thread', 'Its page tables'], answer: 3, why: 'The page table grows with the pages that have RAM. Add it to RSS for the real cost.' }
				]
			},
			{
				title: 'Read the commit lines',
				questions: [
					{ q: 'What does `Committed_AS` count?', options: ['RAM in use right now by all processes', 'Memory promised by mappings, written or not', 'Swap in use right now', 'The page cache holding file data'], answer: 1, why: '`__vm_enough_memory` adds each private writable mapping to `vm_committed_as`, printed as `Committed_AS`.' },
					{ q: '`Committed_AS` is 24291668 kB and `CommitLimit` is 18183952 kB. Is that an error?', options: ['No: in mode 1, only mode 2 enforces the limit', 'Yes: the kernel is out of memory', 'Yes: the OOM killer will run now', 'No: the two numbers are in different units'], answer: 0, why: 'Only mode 2 refuses new commits past `CommitLimit`. Mode 1 never checks.' },
					{ q: 'In mode 1, what does the kernel answer to the 100 GiB `mmap`?', options: ['It asks for root', 'No, if RAM plus swap is smaller', 'Yes, but only the first 27 GiB', 'Always yes'], answer: 3, why: '`OVERCOMMIT_ALWAYS` returns 0 at once: the kernel "pretends there is always enough memory".' },
					{ q: 'By how much is `Committed_AS` above `CommitLimit` here?', options: ['It is not: it is below', 'About 18 GiB', 'About 5.8 GiB: 6107716 kB', 'About 100 GiB'], answer: 2, why: '24291668 - 18183952 = 6107716 kB, about 5.8 GiB. Mode 1 lets that pass, since it never checks the limit.' }
				]
			},
			{
				title: 'Apply mode 0',
				questions: [
					{ q: 'What does mode 0 compare one request with?', options: ['Total RAM plus total swap', 'Free RAM only', '`CommitLimit`', 'The process\'s RSS'], answer: 0, why: 'Line 15 of `__vm_enough_memory`: `pages > totalram_pages() + total_swap_pages`.' },
					{ q: 'RAM is 27 GiB and swap is 3.8 GiB. What happens to a 100 GiB `mmap`?', options: ['It passes, the check is per page', 'It passes, only writes are checked', 'It fails with `ENOMEM`', 'The OOM killer runs'], answer: 2, why: '100 GiB is more than 27 + 3.8 GiB, so the request is refused.' },
					{ q: 'Under mode 0, would a 20 GiB `mmap` pass on the same laptop?', options: ['No, `Committed_AS` is above the limit', 'No, any request above free RAM fails', 'Only for root', 'Yes, however much is already committed'], answer: 3, why: 'Mode 0 looks at the one request only, not the committed total.' },
					{ q: 'Under mode 0, which kernel function turns down the 100 GiB request?', options: ['`vm_commit_limit()`', '`__vm_enough_memory()`', '`oom_badness()`', '`calc_global_load()`'], answer: 1, why: 'Line 15 of `__vm_enough_memory` compares the one request with total RAM pages plus swap pages, and returns an error.' }
				]
			},
			{
				title: 'Apply mode 2',
				questions: [
					{ q: 'What does mode 2 compare?', options: ['The committed total with `CommitLimit`', 'One request with RAM plus swap', 'RSS with VSZ', 'Free RAM with the request'], answer: 0, why: 'Line 36 refuses the request once `vm_committed_as` reaches the limit.' },
					{ q: 'Here `Committed_AS` is already above `CommitLimit`. What does the 100 GiB `mmap` do?', options: ['It passes, since RAM is free', 'It passes, then the OOM killer runs', 'It waits for memory to free up', 'It fails with `ENOMEM`'], answer: 3, why: 'The committed total is past the limit, so every new commit is refused.' },
					{ q: 'And a 1 MiB private writable `mmap` from another process?', options: ['It passes: small requests are exempt', 'It fails too: any new commit is refused', 'It passes for any user', 'It is moved to swap'], answer: 1, why: 'Mode 2 checks the total, and the total is already past the limit, so small requests fail too.' },
					{ q: 'In mode 2, which change raises `CommitLimit` without adding RAM?', options: ['A lower `vm.swappiness`', 'Setting `vm.overcommit_memory` back to 0', 'A higher `vm.overcommit_ratio`, or more swap', 'A smaller page size'], answer: 2, why: '`vm_commit_limit()` returns RAM times `overcommit_ratio` / 100, plus swap, so raising either term raises the limit.' }
				]
			}
		]
	},
	quiz: [
		{
			q: '`ps` shows a process with VSZ 100 GiB and RSS 210 MiB on a 27 GiB machine. How much RAM does it use?',
			options: [
				'100 GiB, and the rest of it is in swap',
				'About 210 MiB, the RSS',
				'100 GiB minus 210 MiB',
				'Nothing, because the memory is virtual'
			],
			answer: 1,
			why: 'RSS counts the pages that are in RAM now. VSZ counts every mapped address, including the ones the process never wrote and that have no page of RAM behind them.'
		},
		{
			q: 'A program calls `malloc(1 GiB)` and writes nothing into it. What happens to its RSS?',
			options: [
				'It grows by 1 GiB at once, because `malloc` zeroes the memory',
				'It stays about the same until the program writes into the pages',
				'It grows by 1 GiB, and the kernel takes it back after a minute',
				'It shrinks, because the kernel swaps out other pages to make room'
			],
			answer: 1,
			why: 'A large `malloc` maps address space. The kernel gives the process a page of RAM only when it first writes to that page, through a page fault, so RSS grows with the writes.'
		},
		{
			q: 'You set `vm.overcommit_memory = 2`. What changes when memory runs short?',
			options: [
				'The OOM killer runs earlier and picks the largest process',
				'The kernel stops counting `Committed_AS`',
				'Swap is turned off, so pages stay in RAM',
				'New allocations fail with `ENOMEM` once the commit limit is reached'
			],
			answer: 3,
			why: 'In mode 2, `__vm_enough_memory` refuses a request when `Committed_AS` reaches swap plus `overcommit_ratio` percent of RAM. The program sees a failed `mmap` or a NULL from `malloc` instead of being killed later.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Map a large range of memory, watch RSS stay flat, then pay for it one page fault at a time.',
		steps: [
			'Make a scratch folder: `mkdir -p ~/vm-lab && cd ~/vm-lab`. This lab needs Linux.',
			'Check the policy and the page size: `sysctl vm.overcommit_memory; getconf PAGESIZE; grep -i commit /proc/meminfo`.',
			'Write the script: `printf \'import mmap, resource, sys\\ndef show(label):\\n    f = [" ".join(l.split()) for l in open("/proc/self/status") if l.startswith(("VmSize", "VmRSS", "VmPTE"))]\\n    print(label, f, "minflt", resource.getrusage(resource.RUSAGE_SELF).ru_minflt)\\nshow("start")\\nm = mmap.mmap(-1, int(sys.argv[1]) << 30, flags=mmap.MAP_PRIVATE | mmap.MAP_ANONYMOUS)\\nshow("mapped")\\nfor off in range(0, 200 << 20, 4096): m[off] = 1\\nshow("touched")\\n\' > vm.py`.',
			'Map 2 GiB and touch 200 MiB of it: `python3 vm.py 2`.',
			'Now ask for 100 GiB: `python3 vm.py 100`.'
		],
		done: [
			'After `mapped`, `VmSize` has grown by about 2097152 kB and `VmRSS` has barely moved.',
			'From `mapped` to `touched`, `VmRSS` grows by about 204800 kB, `VmPTE` grows, and `minflt` goes up by exactly 51200.',
			'With 100 GiB: in mode 0, on a machine with less than 100 GiB of RAM plus swap, `mmap` fails with `[Errno 12] Cannot allocate memory`. In mode 1, it succeeds and `VmSize` shows about 104900000 kB.'
		],
		solution: [
			'`mmap` only creates an address range. The kernel gives a page of RAM on the first write to it, through a minor page fault.',
			'200 MiB divided by 4 KiB pages is 51200 pages, so 51200 faults and 204800 kB of RSS. The page table grows to hold the new entries.',
			'Mode 0 compares one request with RAM plus swap, and refuses 100 GiB on a laptop. Mode 1 says yes to everything. Mode 2 would compare `Committed_AS` with `CommitLimit`.'
		]
	},
	recall: {
		q: 'A process maps 100 GiB and then writes 200 MiB of it. What are its VSZ and RSS, and when did it get each page of RAM?',
		a: 'VSZ about 100 GiB, RSS about 200 MiB more than before. Each 4 KiB page got RAM on its first write, through a page fault: 51200 faults for 200 MiB.'
	},
	sources: [
		{ title: 'Linux v6.12, Documentation/mm/overcommit-accounting.rst', url: OVERCOMMIT },
		{ title: 'Linux v6.12, Documentation/admin-guide/sysctl/vm.rst (overcommit_memory)', url: SYSCTL_VM },
		{ title: 'Linux v6.12, mm/util.c', url: UTIL },
		{ title: 'Linux v6.12, Documentation/mm/page_tables.rst (MMU, TLB, and Page Faults)', url: PAGE_TABLES },
		{ title: 'proc_pid_status(5), Linux manual page', url: 'https://man7.org/linux/man-pages/man5/proc_pid_status.5.html' },
		{ title: 'getrusage(2), Linux manual page', url: 'https://man7.org/linux/man-pages/man2/getrusage.2.html' },
		{ title: 'Go FAQ, Why does my Go process use so much virtual memory?', url: 'https://go.dev/doc/faq#Why_does_my_Go_process_use_so_much_virtual_memory' }
	]
};
