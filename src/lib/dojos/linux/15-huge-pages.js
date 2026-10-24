const K = 'https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a';
const THP = `${K}/Documentation/admin-guide/mm/transhuge.rst`;
const REDIS = 'https://github.com/redis/redis/blob/4fa8bf356b4bf0f1ce345286a4f02d022a4badcb';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'huge-pages',
	part: 'Memory',
	title: 'Huge pages',
	minutes: 10,
	hook: [
		'Redis checks `/sys/kernel/mm/transparent_hugepage/enabled` at startup. When the file reads `[always]`, the log says: "You have Transparent Huge Pages (THP) support enabled in your kernel. This will create latency and memory usage issues with Redis."',
		'MongoDB\'s 7.0 manual says to turn THP off: "database workloads often perform poorly with THP enabled, because they tend to have sparse rather than contiguous memory access patterns". **The 8.0 manual says to make sure THP is enabled before `mongod` starts**, because 8.0 ships an upgraded TCMalloc with per-CPU caches.',
		'Both pieces of advice are about one kernel setting, which lets a single page table entry cover 2 MB instead of 4 KB.'
	],
	terms: [
		{ term: 'TLB', def: 'The Translation Lookaside Buffer, the CPU\'s cache of recent virtual-to-physical address translations. The kernel docs call it "pretty scarce resource".' },
		{ term: 'Huge page', def: 'A page mapped from a higher level of the page table. On x86 that gives 2 MB or 1 GB pages next to the normal 4 KB ones.' },
		{ term: 'THP', def: 'Transparent Huge Pages: the kernel backs anonymous memory with 2 MB pages on its own, without the program asking. Set in `/sys/kernel/mm/transparent_hugepage/enabled` to `always`, `madvise` or `never`.' },
		{ term: 'khugepaged', def: 'The kernel thread that scans memory and collapses runs of 512 small pages into one 2 MB page after the fact.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['va["Load from a virtual address"] --> tlb{"In the TLB?"}', 'tlb -->|"hit"| pa["Physical address, no memory read for it"]'],
				highlight: ['va', 'tlb', 'pa'],
				note: 'Every memory access needs its virtual address translated. The kernel docs say the translation "requires several memory accesses", so the CPU caches recent translations in the TLB.'
			},
			{
				add: ['tlb -->|"miss"| walk["Page table walk: several memory reads"]', 'walk --> pa'],
				highlight: ['walk'],
				note: 'The TLB holds a fixed number of entries. With 4 KB pages each entry covers 4 KB, with a 2 MB page it covers 512 times more. A process that touches gigabytes at random misses the TLB far less with 2 MB pages.'
			},
			{
				add: ['pa --> touch["The process touches a new 2 MB range of heap"]', 'touch -->|"THP allowed here"| huge["One 2 MB page: one fault, one TLB entry"]'],
				highlight: ['touch', 'huge'],
				note: 'With `always`, any anonymous range can get a huge page. With `madvise`, only ranges the program marked with `madvise(MADV_HUGEPAGE)`. The kernel docs: a single fault per 2 MB region cuts kernel entries "by a 512 times factor".'
			},
			{
				add: ['touch -->|"no free 2 MB block"| defrag["defrag setting: compact memory now, or fall back to 4 KB"]'],
				highlight: ['defrag'],
				note: 'A 2 MB page needs 2 MB of contiguous free physical memory. With `defrag` set to `always`, the program "will stall on allocation failure and directly reclaim pages and compact memory". The default, `madvise`, stalls only for marked ranges, others fall back and `thp_fault_fallback` goes up by 1.'
			},
			{
				add: ['huge --> fork["fork() for a snapshot, then the parent writes 1 byte"]', 'fork --> cow["Copy-on-write copies 2 MB, not 4 KB"]'],
				highlight: ['fork', 'cow'],
				note: 'After `fork`, parent and child share every page until one writes. Redis forks to save its data to disk. Its latency docs: with huge pages, "a few thousand of pages" written by commands cause "the copy on write of almost the whole process memory".'
			}
		]
	},
	example: {
		title: 'Redis server.c: turning THP off for the Redis process only',
		repo: 'redis/redis',
		url: `${REDIS}/src/server.c#L6604-L6636`,
		lang: 'c',
		code: `#ifdef __linux__
#include <sys/prctl.h>
/* since linux-3.5, kernel supports to set the state of the "THP disable" flag
 * for the calling thread. PR_SET_THP_DISABLE is defined in linux/prctl.h */
static int THPDisable(void) {
    int ret = -EINVAL;

    if (!server.disable_thp)
        return ret;

#ifdef PR_SET_THP_DISABLE
    ret = prctl(PR_SET_THP_DISABLE, 1, 0, 0, 0);
#endif

    return ret;
}

void linuxMemoryWarnings(void) {
    sds err_msg = NULL;
    if (checkOvercommit(&err_msg) < 0) {
        serverLog(LL_WARNING,"WARNING %s", err_msg);
        sdsfree(err_msg);
    }
    if (checkTHPEnabled(&err_msg) < 0) {
        server.thp_enabled = 1;
        if (THPDisable() == 0) {
            server.thp_enabled = 0;
        } else {
            serverLog(LL_WARNING, "WARNING %s", err_msg);
        }
        sdsfree(err_msg);
    }
}`,
		notes: [
			'Line 24 calls [`checkTHPEnabled`](' + REDIS + '/src/syscheck.c#L146-L170), which reads `/sys/kernel/mm/transparent_hugepage/enabled` and fails only when it finds `[always]`. With `madvise` or `never`, Redis does nothing.',
			'Line 12 sets the THP disable flag on the Redis process with `prctl`. The [man page](https://man7.org/linux/man-pages/man2/PR_SET_THP_DISABLE.2const.html) says the flag is "inherited by a child created via fork(2)", so the child that writes the snapshot has no THP either.',
			'Lines 8 and 9 skip the `prctl` when the `disable-thp` config option is `no`. `redis.conf` ships it as `disable-thp yes`. Line 29 logs the warning only when the `prctl` call failed or was skipped.',
			'Line 25 sets `thp_enabled` before trying. The value is used later: the [child](' + REDIS + '/src/server.c#L6994-L6995) skips `madvise(MADV_DONTNEED)` because it "may not work if Transparent Huge Pages is enabled".'
		]
	},
	tradeoff: {
		gain: [
			'One TLB entry covers 2 MB instead of 4 KB, so a process with a large working set takes fewer TLB misses and fewer page table walks.',
			'The first touch of a 2 MB range costs one page fault instead of 512.',
			'The kernel docs say of THP: "It requires no modifications for applications to take advantage of it."'
		],
		cost: [
			'A program that maps a large range and touches 1 byte of it can get a 2 MB page "instead of a 4k page for no good", in the kernel docs\' words.',
			'Finding 2 MB of contiguous free memory may mean compaction inside the page fault, a stall in the middle of a request.',
			'After `fork`, a 1-byte write copies a 2 MB page. A Redis snapshot under write load can double its memory use, as its latency docs describe.'
		]
	},
	task: {
		prompt: 'Run `cat /sys/kernel/mm/transparent_hugepage/enabled`, `grep AnonHugePages /proc/meminfo` and `grep -E "thp_fault_(alloc|fallback) " /proc/vmstat`. With THP in `madvise` mode, why is `AnonHugePages` not 0, and which process holds those pages?',
		hint: 'In `madvise` mode only ranges marked with `MADV_HUGEPAGE` get huge pages. proc_pid_smaps(5) lists a mapping\'s `AnonHugePages` and its `VmFlags`, where `hg` is the "huge page advise flag".',
		answer: [
			'Output captured in this session on a 6.17 kernel: `always [madvise] never`, `AnonHugePages: 36864 kB`, `thp_fault_alloc 110653`, `thp_fault_fallback 11882`. 36864 kB is 18 pages of 2 MB.',
			'Summing `AnonHugePages` in every `/proc/<pid>/smaps` found two `node` processes running `vite preview`, with 18432 kB each, 9 huge pages.',
			'In both, the pages sit in one mapping named `[anon:mimalloc]` whose `VmFlags` include `hg`. The mimalloc allocator called `madvise(MADV_HUGEPAGE)` on its heap, so the kernel gave that range 2 MB pages.',
			'The vmstat counters run since boot. 11882 of 122535 huge page faults, about 1 in 10, found no free 2 MB block and fell back to 4 KB pages.'
		],
		steps: [
			{
				title: 'Read the mode',
				questions: [
					{ q: 'The file reads `always [madvise] never`. Which mode is active?', options: ['`always`', '`never`', '`madvise`', 'All three, one per CPU'], answer: 2, why: 'The kernel puts brackets around the active value.' },
					{ q: 'In `madvise` mode, which memory can get huge pages?', options: ['Any anonymous range larger than 2 MB', 'Only ranges marked with `madvise(MADV_HUGEPAGE)`', 'Only files on disk', 'Nothing: `madvise` is the same as `never`'], answer: 1, why: 'The kernel docs: huge pages are "only enabled inside MADV_HUGEPAGE regions". Size plays no part.' },
					{ q: 'What does one 2 MB page change for the TLB?', options: ['One entry covers 512 times more memory', 'The TLB gets 512 more entries', 'The TLB is turned off for that range', 'Nothing: the TLB only caches files'], answer: 0, why: 'With 4 KB pages each entry covers 4 KB. A 2 MB page covers 512 times more with one entry.' },
					{ q: 'Would Redis print its THP warning on this machine?', options: ['Yes: THP is supported', 'Yes: `AnonHugePages` is not 0', 'Only if `defrag` is `always`', 'No: `checkTHPEnabled` fails only on `[always]`'], answer: 3, why: 'Redis reads the same file and warns only when it finds `[always]`. With `madvise` it does nothing.' }
				]
			},
			{
				title: 'Read the counters',
				questions: [
					{ q: '`AnonHugePages: 36864 kB`. How many 2 MB pages is that?', options: ['18', '36', '9', '512'], answer: 0, why: '36864 kB divided by 2048 kB gives 18 huge pages.' },
					{ q: 'Why is that number not 0 in `madvise` mode?', options: ['`madvise` mode still gives huge pages to large heaps', '`khugepaged` ignores the mode', 'Some process marked a range with `MADV_HUGEPAGE`', 'The counter includes page cache'], answer: 2, why: 'In `madvise` mode, a non-zero count means a program asked for huge pages on some range.' },
					{ q: 'Over what period do `thp_fault_alloc` and `thp_fault_fallback` count?', options: ['The last second', 'Since boot', 'Since the last `cat`', 'Since THP was set to `madvise`'], answer: 1, why: 'The `/proc/vmstat` counters only go up from boot.' },
					{ q: 'What does `thp_fault_fallback` count?', options: ['Huge pages split back into small ones', 'Huge pages freed by the OOM killer', 'Faults that hit the TLB', 'Huge page faults that found no free 2 MB block and used 4 KB pages'], answer: 3, why: 'When no 2 MB block is free and the range is not set to stall, the fault falls back to 4 KB and the counter goes up by 1.' }
				]
			},
			{
				title: 'Find the owner',
				questions: [
					{ q: 'Which file tells you how many huge pages one process holds?', options: ['`/proc/<pid>/smaps`', '`/proc/<pid>/status`', '`/proc/<pid>/oom_score`', '`/proc/<pid>/cmdline`'], answer: 0, why: 'proc_pid_smaps(5) lists `AnonHugePages` for each mapping of the process.' },
					{ q: 'Summing them finds two `node` processes with 18432 kB each. Does that match the total?', options: ['No: it is half the total', 'No: smaps counts in pages', 'Only if swap is off', 'Yes: 2 × 18432 kB is 36864 kB'], answer: 3, why: 'Two processes with 9 huge pages each give the 18 pages that `/proc/meminfo` shows.' },
					{ q: 'The pages sit in a mapping whose `VmFlags` include `hg`. What does `hg` mean?', options: ['The mapping is in swap', 'The huge page advise flag is set', 'The mapping is shared', 'The mapping is a hugetlbfs file'], answer: 1, why: 'proc_pid_smaps(5) calls `hg` the "huge page advise flag": someone called `madvise(MADV_HUGEPAGE)` on it.' },
					{ q: 'The mapping is named `[anon:mimalloc]`. Who asked for the huge pages?', options: ['The kernel, on its own', 'The `vite` config file', 'The mimalloc allocator, on its heap', 'systemd, for every service'], answer: 2, why: 'mimalloc called `madvise(MADV_HUGEPAGE)` on its heap, so the kernel gave that range 2 MB pages.' }
				]
			},
			{
				title: 'Explain the fallbacks',
				questions: [
					{ q: '11882 fallbacks out of 122535 huge page faults. About how often did a fault fall back?', options: ['About 1 in 100', 'About 1 in 2', 'Never', 'About 1 in 10'], answer: 3, why: '11882 over 122535 is close to one tenth.' },
					{ q: 'What does a 2 MB page need that a 4 KB page does not?', options: ['2 MB of contiguous free physical memory', 'A file on disk behind it', 'Root privileges', 'A free TLB entry on every CPU'], answer: 0, why: 'A huge page is one physical block. When memory is fragmented, no such block may be free.' },
					{ q: 'On a machine with THP set to `always` and `defrag` at its default, `madvise`, a range not marked with `MADV_HUGEPAGE` faults and no free 2 MB block exists. What happens?', options: ['The fault stalls and compacts memory', 'The process gets SIGBUS', 'It falls back to 4 KB pages at once', 'The allocation fails with ENOMEM'], answer: 2, why: 'The default stalls only for marked ranges. Others fall back and `thp_fault_fallback` goes up.' },
					{ q: 'Which kernel thread can still turn those 4 KB pages into a huge page later?', options: ['`kswapd`', '`khugepaged`', '`oom_reaper`', '`kworker`'], answer: 1, why: '`khugepaged` scans memory and collapses runs of 512 small pages into one 2 MB page after the fact.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'THP is set to `madvise`. A program `malloc`s 1 GB, never calls `madvise`, and writes to all of it. What page size backs that memory?',
			options: [
				'4 KB pages: only ranges marked `MADV_HUGEPAGE` get huge pages',
				'2 MB pages, since the allocation is much larger than 2 MB',
				'1 GB pages, since the allocation is exactly 1 GB in size',
				'4 KB pages for the first fault, then 2 MB pages after it'
			],
			answer: 0,
			why: 'The kernel docs: `madvise` mode means huge pages are "only enabled inside MADV_HUGEPAGE regions". The size of the allocation plays no part. THP gives 2 MB pages or smaller ones, and 1 GB pages come from hugetlbfs.'
		},
		{
			q: 'Redis runs with THP `always` and `disable-thp no`. It forks to write a snapshot while clients keep writing. Why does memory grow faster than with 4 KB pages?',
			options: [
				'The child process reads the dataset into its own new 2 MB buffers',
				'Each write to a shared page copies 2 MB instead of 4 KB',
				'`khugepaged` doubles every huge page the moment `fork` returns',
				'The TLB has to hold a second copy of every mapping for the child'
			],
			answer: 1,
			why: 'After `fork`, pages are shared copy-on-write. The first write to a shared page copies the whole page, and with THP that page is 2 MB. Redis\'s docs say this causes "the copy on write of almost the whole process memory".'
		},
		{
			q: '`defrag` is set to `always`. THP is `always`. A program touches a new 2 MB range of heap, and no free 2 MB block exists. What does the program see?',
			options: [
				'A SIGBUS, because the huge page could not be allocated',
				'An ENOMEM from `malloc`, which then retries with smaller pages',
				'Its fault stalls while the kernel reclaims and compacts memory',
				'Nothing, the kernel gives 4 KB pages at once and khugepaged fixes it later'
			],
			answer: 2,
			why: 'The kernel docs: with `always`, the application "will stall on allocation failure and directly reclaim pages and compact memory in an effort to allocate a THP immediately". Falling back right away is what `defer` and `never` do.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Get huge pages in `madvise` mode by asking for them, and see where they show up.',
		steps: [
			'On Linux, check the mode and the counters: `cat /sys/kernel/mm/transparent_hugepage/enabled` and `grep -E "thp_fault_(alloc|fallback) " /proc/vmstat`. The lab expects `madvise` or `always`.',
			'Write 64 MB of anonymous memory without asking for huge pages: `python3 -c "import mmap; n = 64 << 20; m = mmap.mmap(-1, n, flags=mmap.MAP_PRIVATE | mmap.MAP_ANONYMOUS); m.write(b\'x\' * n); print(open(\'/proc/self/smaps_rollup\').read())" | grep AnonHuge`.',
			'Do the same, but mark the range first: add `m.madvise(mmap.MADV_HUGEPAGE);` just before `m.write`.',
			'Find the marked mapping in the full list: run step 3 again with `/proc/self/smaps` instead of `smaps_rollup`, and pipe it to `grep -E \'^(AnonHugePages|VmFlags)\' | grep -B1 \' hg\'`.',
			'Read the vmstat counters again and compare them with step 1.'
		],
		done: [
			'In `madvise` mode, step 2 prints `AnonHugePages: 0 kB`.',
			'Step 3 prints a value above 0, a multiple of 2048 kB.',
			'Step 4 prints one `AnonHugePages` line above a `VmFlags` line that contains `hg`.',
			'`thp_fault_alloc` went up between step 1 and step 5.'
		],
		solution: [
			'Without `MADV_HUGEPAGE`, `madvise` mode gives 4 KB pages however big the range is. With it, each 2 MB stretch can be one page.',
			'The value in step 3 is often below 65536 kB. Parts of the range are not 2 MB aligned, and some faults found no free 2 MB block: those went to `thp_fault_fallback`.',
			'`hg` is the flag that `madvise(MADV_HUGEPAGE)` sets. It is how the chapter traced the 18 huge pages to mimalloc.'
		]
	},
	recall: {
		q: 'Why do 2 MB pages cut TLB misses, and why does Redis turn THP off for its own process?',
		a: 'One TLB entry covers 512 times more memory than with 4 KB pages. Redis forks to save snapshots, and after `fork` each write to a shared huge page copies 2 MB, which costs latency and memory.'
	},
	sources: [
		{ title: 'Linux v6.12, Documentation/admin-guide/mm/transhuge.rst', url: THP },
		{ title: 'Linux v6.12, Documentation/admin-guide/mm/concepts.rst (Huge Pages)', url: `${K}/Documentation/admin-guide/mm/concepts.rst` },
		{ title: 'Redis 8.2.0, src/server.c', url: `${REDIS}/src/server.c` },
		{ title: 'Redis docs, Diagnosing latency issues', url: 'https://redis.io/docs/latest/operate/oss_and_stack/management/optimization/latency/' },
		{ title: 'MongoDB 7.0 manual, Disable Transparent Huge Pages', url: 'https://www.mongodb.com/docs/v7.0/tutorial/transparent-huge-pages/' },
		{ title: 'MongoDB manual, TCMalloc Performance Optimization', url: 'https://www.mongodb.com/docs/manual/administration/tcmalloc-performance/' },
		{ title: 'proc_pid_smaps(5), man7.org', url: 'https://man7.org/linux/man-pages/man5/proc_pid_smaps.5.html' }
	]
};
