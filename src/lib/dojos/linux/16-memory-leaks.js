const LINUX = 'https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a';
const TASK_MMU = `${LINUX}/fs/proc/task_mmu.c`;
const GLIBC = 'https://github.com/bminor/glibc/blob/74f59e9271cbb4071671e5a474e7d4f1622b186f';
const ISSUE = 'https://github.com/goauthentik/authentik/issues/25683';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'memory-leaks',
	part: 'Memory',
	title: 'Finding a memory leak',
	minutes: 10,
	hook: [
		'September 2026, authentik issue #25683. A gunicorn web worker holds 2 GiB while it serves no traffic. Its `/proc/<pid>/smaps_rollup` reads `Rss: 2110844 kB`, `Private_Dirty: 2002740 kB` and `Anonymous: 2090156 kB`. A week later, a new pod is OOMKilled 7 minutes after start, `exit code 137`, at a 4 GiB limit.',
		'The reporter sets `MALLOC_ARENA_MAX=2` and `MALLOC_TRIM_THRESHOLD_=131072`. The memory kept after a burst drops from about 2 GiB to about 640 MiB. He reads this as memory glibc kept after Python had freed it.',
		'Later he corrects himself: gunicorn restarts each worker after about 1000 requests, and the replacement workers sit at 282 MiB under the same load. **Each worker\'s memory belonged to that process and went away with it.** The lines of `smaps` and the names of the mappings tell you which kind of memory grew.'
	],
	terms: [
		{ term: 'RSS', def: 'Resident set size: the part of a process\'s mappings that is in RAM right now, the `Rss:` line of `smaps` and `VmRSS` in `status`.' },
		{ term: 'Anonymous memory', def: 'Pages that belong to no file: the heap, the stacks, `mmap` with `MAP_ANONYMOUS`, and private copies of file pages the process wrote to.' },
		{ term: 'Private_Dirty', def: 'Pages mapped by this process only and written since they were loaded. The kernel cannot drop them, only swap them out.' },
		{ term: 'Arena', def: 'A pool of memory that glibc `malloc` hands out from, with its own lock. The main arena grows the `[heap]` with `brk`; other arenas live in `mmap`ed regions of up to 64 MiB.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['small["Main thread: malloc(100)"] -->|"brk grows the heap"| heap["[heap] mapping: the main arena"]'],
				highlight: ['small', 'heap'],
				note: 'malloc(3): "Normally, malloc() allocates memory from the heap, and adjusts the size of the heap as required, using sbrk(2)." The kernel prints `[heap]` in `/proc/<pid>/maps` for the mapping between `start_brk` and `brk`.'
			},
			{
				add: ['big["malloc(1 MB)"] -->|"at least 128 kB: mmap"| anon1["Private anonymous mapping, no name in maps"]'],
				highlight: ['big', 'anon1'],
				note: 'glibc serves a block of 128 kB or more from its own private anonymous mapping. It has no name in `maps`, only an empty path column. That 128 kB threshold moves up when the program frees larger blocks, up to 32 MiB on 64-bit.'
			},
			{
				add: ['threads["8 threads call malloc at the same time"] -->|"lock contention: new arenas"| anon2["More unnamed mappings, up to 64 MiB each"]'],
				highlight: ['threads', 'anon2'],
				note: 'When threads wait on the arena lock, glibc creates more arenas. On 64-bit the limit is 8 arenas per CPU, so 48 on a 6 CPU node. Each arena outside the main one is an `mmap`ed heap of up to 64 MiB, another unnamed anonymous mapping.'
			},
			{
				add: ['anon2 -->|"first write: page fault"| rss["Rss, Anonymous, Private_Dirty grow"]', 'heap --> rss'],
				highlight: ['rss'],
				note: 'A mapping only reserves addresses. The kernel docs: "When the program performs a write, a regular physical page will be allocated to hold the written data." That page now counts in `Rss`, in `Anonymous`, and in `Private_Dirty` since no other process maps it.'
			},
			{
				add: ['free["free() of most objects"] -->|"chunks go back to the arena free lists"| rss'],
				highlight: ['free'],
				note: 'A freed chunk goes back into its arena for the next `malloc`. mallopt(3): "the heap can be trimmed only if memory is freed at the top end". One live object near the top of an arena keeps the pages below it, so `Rss` stays high after the objects are gone.'
			},
			{
				add: ['read["cat /proc/PID/smaps_rollup"] -->|"kernel walks every mapping and sums"| rss'],
				highlight: ['read'],
				note: '`smaps_rollup` holds the same fields as `smaps`, summed over all mappings, plus `Pss_Anon`, `Pss_File` and `Pss_Shmem`. The kernel docs say `smaps` gives the same totals "at a significantly higher cost". Read `smaps` when you need the per mapping split.'
			}
		]
	},
	example: {
		title: 'fs/proc/task_mmu.c: smaps_account, how each page lands in the smaps lines',
		repo: 'torvalds/linux',
		url: `${TASK_MMU}#L703-L749`,
		lang: 'c',
		code: `static void smaps_account(struct mem_size_stats *mss, struct page *page,
		bool compound, bool young, bool dirty, bool locked,
		bool present)
{
	struct folio *folio = page_folio(page);
	int i, nr = compound ? compound_nr(page) : 1;
	unsigned long size = nr * PAGE_SIZE;

	/*
	 * First accumulate quantities that depend only on |size| and the type
	 * of the compound page.
	 */
	if (folio_test_anon(folio)) {
		mss->anonymous += size;
		if (!folio_test_swapbacked(folio) && !dirty &&
		    !folio_test_dirty(folio))
			mss->lazyfree += size;
	}

	if (folio_test_ksm(folio))
		mss->ksm += size;

	mss->resident += size;
	/* Accumulate the size in pages that have been accessed. */
	if (young || folio_test_young(folio) || folio_test_referenced(folio))
		mss->referenced += size;

	/*
	 * Then accumulate quantities that may depend on sharing, or that may
	 * differ page-by-page.
	 *
	 * refcount == 1 for present entries guarantees that the folio is mapped
	 * exactly once. For large folios this implies that exactly one
	 * PTE/PMD/... maps (a part of) this folio.
	 *
	 * Treat all non-present entries (where relying on the mapcount and
	 * refcount doesn't make sense) as "maybe shared, but not sure how
	 * often". We treat device private entries as being fake-present.
	 *
	 * Note that it would not be safe to read the mapcount especially for
	 * pages referenced by migration entries, even with the PTL held.
	 */
	if (folio_ref_count(folio) == 1 || !present) {
		smaps_page_accumulate(mss, folio, size, size << PSS_SHIFT,
				      dirty, locked, present);
		return;
	}`,
		notes: [
			'The kernel calls this function for each page it finds while walking the page tables of one mapping. A page that sits in swap adds to the `Swap:` line in `smaps_pte_entry` and never reaches this function, so `Rss` does not count it.',
			'Lines 13 and 14 add the page to `Anonymous` when it belongs to no file. The kernel docs add that a written page of a `MAP_PRIVATE` file mapping is "replaced by a private anonymous copy", so it counts here too.',
			'Line 23 adds every page that reaches this point to `resident`, printed as `Rss:`. File pages, such as a mapped `libc.so.6`, count there as well, which is why `Anonymous` is the line to watch for a leak.',
			'Lines 43 to 45 handle a page mapped by this process only. [`smaps_page_accumulate`](' + TASK_MMU + '#L673-L700) gives it its full size in `Pss` and adds it to `Private_Dirty` when the page is dirty. Shared pages fall through to a loop that divides `Pss` by the number of mappers.'
		]
	},
	tradeoff: {
		gain: [
			'`MALLOC_ARENA_MAX=2` caps glibc at 2 arenas. In the authentik report it cut the memory kept after a burst from about 2 GiB to about 640 MiB, and the idle baseline from about 850 MiB to about 480 MiB.',
			'gunicorn `max_requests` restarts a worker after that many requests, "a simple method to help limit the damage of memory leaks". authentik sets 1000, and the fresh workers ran at 282 MiB against 1.1 GiB for the old ones.',
			'One read of `smaps_rollup` gives the totals for a process. You can log it every minute and plot `Anonymous` without parsing hundreds of mappings.'
		],
		cost: [
			'mallopt(3) on arenas: "The more arenas you have, the lower the per-thread contention, but the higher the memory usage." With 2 arenas, 8 threads share 2 arena locks.',
			'In the same report, a new worker\'s first events request costs about 100 MiB to load a 63 MB GeoLite2 reader, and later requests are cheap once it is loaded.',
			'With `max_requests`, a worker can still reach the 4 GiB limit before its restart: one admin session added 1.3 GiB in 15 seconds. Neither setting shows which code allocates.'
		]
	},
	task: {
		prompt: 'Two readings of `/proc/<pid>/smaps_rollup` from the authentik issue, same workload. Old worker, pid 49: `Rss 1196664 kB`, `Private_Dirty 1096568 kB`, `Anonymous 1178592 kB`, `Shared_Clean 17692 kB`. Its replacement after a restart, pid 2179: `Rss 282820 kB`, `Private_Dirty 181156 kB`, `Anonymous 265636 kB`. Answer: what share of pid 49\'s Rss is anonymous? Can shared libraries or file pages explain the gap? Which command shows the mappings that hold it?',
		hint: 'Divide `Anonymous` by `Rss`. `Shared_Clean` is where mapped libraries mostly land. For the last part, the mapping header line of `smaps` has the name in its 6th column.',
		answer: [
			'1178592 / 1196664 = 98.5 % of the resident memory is anonymous. File-backed pages make up at most about 18 MB of it.',
			'`Shared_Clean` is 17692 kB, about 17 MiB: the libraries and other clean shared pages are small. The gap between the two workers is 1196664 − 282820 = 913844 kB, about 892 MiB, and the `Anonymous` gap is 912956 kB. Almost all of the gap is anonymous memory the old process wrote.',
			'The restart freed it, so the kernel and the page cache did not hold it: the process did, as live Python objects or as freed chunks kept in glibc arenas.',
			'List mappings by size: `awk \'/^[0-9a-f]+-[0-9a-f]+ /{n=($6==""?"[anon]":$6)} /^Rss:/{print $2, n}\' /proc/49/smaps | sort -n | tail`. The reporter found 61 anonymous mappings of 1 MiB or more, 1039848 kB in total, against 76392 kB for the largest `[heap]`.'
		],
		steps: [
			{
				title: 'Compute the share',
				questions: [
					{ q: 'Which two numbers give the anonymous share of pid 49\'s memory?', options: ['`Private_Dirty` over `Shared_Clean`', '`Anonymous` over `Rss`', '`Rss` over `Anonymous`', '`Anonymous` over `Private_Dirty`'], answer: 1, why: '`Rss` is all resident memory. `Anonymous` is the part that belongs to no file.' },
					{ q: '1178592 / 1196664 is about what?', options: ['98.5 %', '85 %', '50 %', '9.8 %'], answer: 0, why: 'The two numbers differ by about 18 MB out of 1.2 GB.' },
					{ q: 'Same ratio for the fresh worker: 265636 / 282820 is about what?', options: ['About 50 %', 'About 98.5 %', 'About 9 %', 'About 94 %'], answer: 3, why: 'The fresh worker is mostly anonymous memory too. What differs between the two is the size, not the kind.' },
					{ q: '`Private_Dirty` is 1096568 kB. What does that add?', options: ['Those pages are shared with other workers', 'Those pages can be dropped at any time', 'Those pages are mapped by this process only and were written', 'Those pages sit in swap'], answer: 2, why: 'Private dirty pages belong to this process alone. The kernel cannot drop them, only swap them out.' }
				]
			},
			{
				title: 'Rule out files',
				questions: [
					{ q: 'Where do mapped libraries mostly land in `smaps_rollup`?', options: ['`Shared_Clean`', '`Private_Dirty`', '`Anonymous`', '`Swap`'], answer: 0, why: 'Libraries are file pages that many processes map and nobody writes.' },
					{ q: '`Shared_Clean` is 17692 kB. What does that tell you?', options: ['Libraries hold most of the 1.2 GB', 'Libraries and clean shared pages are about 17 MiB, a small part', 'The worker leaks file descriptors', 'The page cache is full'], answer: 1, why: '17 MiB out of 1.2 GB cannot explain the growth.' },
					{ q: 'What is the `Rss` gap between pid 49 and pid 2179?', options: ['About 282 MiB', 'About 1.2 GiB', 'About 17 MiB', 'About 892 MiB'], answer: 3, why: '1196664 − 282820 = 913844 kB, about 892 MiB.' },
					{ q: 'The `Anonymous` gap is 912956 kB. What do you conclude?', options: ['The gap is mostly libraries', 'The gap is mostly page cache', 'Almost all of the gap is anonymous memory the old process wrote', 'The two readings cannot be compared'], answer: 2, why: 'The anonymous gap is within 1 MB of the `Rss` gap. File pages play no real part.' }
				]
			},
			{
				title: 'Say who held it',
				questions: [
					{ q: 'The restart freed the memory. What does that rule out?', options: ['The kernel or the page cache holding it', 'A leak in the Python code', 'glibc arenas keeping freed chunks', 'Nothing: restarts free kernel memory too'], answer: 0, why: 'Memory that leaves with the process belonged to that process, not to the kernel or the page cache.' },
					{ q: 'Inside the process, what two things could hold the anonymous pages?', options: ['Open sockets and pipes', 'Live Python objects, or freed chunks kept in glibc arenas', 'Shared libraries and the page cache', 'The stack of the main thread only'], answer: 1, why: 'Both are anonymous memory the process wrote. The numbers alone cannot tell them apart.' },
					{ q: 'Which test helps tell those two apart?', options: ['Read `smaps_rollup` again', 'Compare the `Shared_Clean` values', 'Restart the worker', 'Rerun with `MALLOC_ARENA_MAX=2` and see if the kept memory drops'], answer: 3, why: 'Fewer arenas leave fewer freed chunks to keep. In the report the memory kept after a burst fell from about 2 GiB to about 640 MiB. A restart frees both kinds at once.' },
					{ q: 'What does gunicorn `max_requests` do about it?', options: ['It caps each arena at 64 MiB', 'It finds the code that allocates', 'It restarts a worker after that many requests', 'It turns off glibc arenas'], answer: 2, why: 'It is "a simple method to help limit the damage of memory leaks". It does not show which code allocates.' }
				]
			},
			{
				title: 'Find the mappings',
				questions: [
					{ q: 'Which file has the per-mapping split?', options: ['`/proc/49/smaps_rollup`', '`/proc/49/status`', '`/proc/49/smaps`', '`/proc/49/maps`'], answer: 2, why: '`smaps_rollup` sums all mappings. `smaps` keeps one block per mapping, with its own `Rss:`.' },
					{ q: 'In the `awk` command, why test `$6==""`?', options: ['An empty 6th column means an unnamed anonymous mapping', 'It skips the `[heap]` line', 'It skips mappings in swap', 'It keeps only shared libraries'], answer: 0, why: 'The name sits in the 6th column of the header line. Large `malloc` blocks and extra arenas have no name.' },
					{ q: 'A `malloc(1 MB)` in glibc lands where?', options: ['In `[heap]`, grown with `brk`', 'In its own private anonymous mapping', 'In `[stack]`', 'In the page cache'], answer: 1, why: 'glibc serves a block of 128 kB or more from its own `mmap`. It shows up with no name.' },
					{ q: 'The reporter found 61 unnamed mappings of 1 MiB or more, 1039848 kB in total. About how large is one on average?', options: ['About 1 MiB', 'About 64 MiB', 'About 128 kB', 'About 17000 kB'], answer: 3, why: '1039848 / 61 is about 17046 kB. 61 single 1 MiB blocks would add up to only about 61 MiB.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'An idle worker shows `Rss: 2110844 kB` and `Anonymous: 2090156 kB` in `smaps_rollup`. Where is that memory?',
			options: [
				'In the page cache, holding the files the worker read during the burst',
				'In memory the process wrote: heap, malloc arenas and anonymous mmap blocks',
				'In the shared libraries, counted once for each worker that maps them',
				'In kernel slab objects that the kernel charges to the worker\'s RSS'
			],
			answer: 1,
			why: '`smaps_account` adds a page to `Anonymous` only when it belongs to no file. 2090156 of 2110844 kB leaves about 20 MB for file pages such as libraries. Kernel slab memory is not in a process\'s mappings at all.'
		},
		{
			q: 'A C program allocates 500 MB in 100 byte objects, frees all but the last one allocated, and `Rss` stays near 500 MB. Why?',
			options: [
				'The kernel keeps freed pages in the RSS until the machine runs short of memory',
				'free() only marks objects, and a later garbage collection pass returns them',
				'glibc keeps freed chunks in the heap, and it can only trim from the top end',
				'The program still has a leak, since every freed byte should leave the RSS'
			],
			answer: 2,
			why: 'Small blocks come from the `brk` heap. free() puts them on the arena\'s free lists, and glibc gives pages back with `sbrk` only from the top of the heap. The one live object near the top keeps the whole heap below it.'
		},
		{
			q: 'A process with 8 threads grows. In `/proc/<pid>/maps`, where do you expect most of the growth from those threads\' small `malloc` calls?',
			options: [
				'In unnamed anonymous mappings: the extra glibc arenas, up to 64 MiB each',
				'In the `[heap]` mapping, which every thread grows with `brk`',
				'In the `[stack]` mapping, since each thread allocates on the main stack',
				'In `[vdso]`, the shared area the kernel gives every process'
			],
			answer: 0,
			why: 'Threads that contend on the main arena lock get their own arenas, up to 8 per CPU on 64-bit. Those arenas are `mmap`ed heaps of up to 64 MiB with no name in `maps`. Only the main arena grows `[heap]`.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Start a process that leaks on purpose, watch `smaps_rollup` grow, and find the mapping that holds it.',
		steps: [
			'On Linux, start a Python process that keeps 1 MiB more every 50 ms, up to 400 MiB, then idles: `python3 -c "import time; keep = []; [(keep.append(bytearray(1 << 20)), time.sleep(0.05)) for _ in range(400)]; time.sleep(120)" & pid=$!`.',
			'Read the totals three times: `for i in 1 2 3; do grep -E \'^(Rss|Anonymous|Private_Dirty|Shared_Clean)\' /proc/$pid/smaps_rollup; echo; sleep 3; done`.',
			'List the mappings by resident size: `awk \'/^[0-9a-f]+-[0-9a-f]+ /{n=($6==""?"[anon]":$6)} /^Rss:/{print $2, n}\' /proc/$pid/smaps | sort -n | tail -5`.',
			'Stop it: `kill $pid`.'
		],
		done: [
			'`Rss`, `Anonymous` and `Private_Dirty` grow on each reading, while `Shared_Clean` stays at a few MB.',
			'`Anonymous` stays within a few MB of `Rss`.',
			'The last line of step 3 is `[anon]`, far above `python3` and `libc.so.6`.'
		],
		solution: [
			'Each `bytearray(1 << 20)` is a 1 MiB block, above glibc\'s 128 kB threshold, so it gets its own anonymous `mmap`. Writing zeros into it faults the pages in.',
			'The kernel merges anonymous mappings that sit next to each other with the same flags, so the 1 MiB blocks can show up as one big `[anon]` line instead of hundreds.',
			'This is the chapter\'s method: `smaps_rollup` says the growth is anonymous memory the process wrote, and `smaps` names where it sits. Neither says which line of code allocates.'
		]
	},
	recall: {
		q: 'Which file gives a process\'s memory totals in one read, and which line shows that the growth is memory the process wrote itself?',
		a: '`/proc/<pid>/smaps_rollup`, and its `Anonymous:` line, with `Private_Dirty:` next to it. The idle authentik worker had 2090156 kB `Anonymous` out of 2110844 kB `Rss`.'
	},
	sources: [
		{ title: 'authentik issue #25683, server memory and glibc arena retention', url: ISSUE },
		{ title: 'Linux kernel docs, The /proc Filesystem (smaps, smaps_rollup)', url: 'https://docs.kernel.org/filesystems/proc.html' },
		{ title: 'proc_pid_smaps(5)', url: 'https://man7.org/linux/man-pages/man5/proc_pid_smaps.5.html' },
		{ title: 'malloc(3)', url: 'https://man7.org/linux/man-pages/man3/malloc.3.html' },
		{ title: 'mallopt(3)', url: 'https://man7.org/linux/man-pages/man3/mallopt.3.html' },
		{ title: 'Linux kernel docs, Concepts overview (anonymous memory)', url: 'https://docs.kernel.org/admin-guide/mm/concepts.html' },
		{ title: 'glibc 2.41 source, malloc/arena.c (mmap heaps for threads)', url: `${GLIBC}/malloc/arena.c#L26-L42` },
		{ title: 'glibc 2.41 source, malloc/malloc.c (8 arenas per core on 64-bit)', url: `${GLIBC}/malloc/malloc.c#L1923-L1924` },
		{ title: 'gunicorn source, max_requests setting', url: 'https://github.com/benoitc/gunicorn/blob/afc7d2fd5dd9f1de455b1be6c10044030c0adf8e/gunicorn/config.py#L851-L868' }
	]
};
