const LINUX = 'https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a';
const SHOW_MEM = `${LINUX}/mm/show_mem.c`;
const PROC_RST = `${LINUX}/Documentation/filesystems/proc.rst`;
const COMMIT = 'https://github.com/torvalds/linux/commit/34e431b0ae398fc54ea69ff85ec700722c9da773';
const SYSCTL_VM = `${LINUX}/Documentation/admin-guide/sysctl/vm.rst`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'page-cache',
	part: 'Memory',
	title: 'The page cache',
	minutes: 10,
	hook: [
		'`free -h` on the laptop used for this chapter: `total 27Gi`, `used 6.1Gi`, `free 1.6Gi`, `buff/cache 20Gi`, `available 20Gi`. Only 1.6 GiB is free, and 20 GiB is still available to programs.',
		'The 20 GiB under buff/cache is file and disk data the kernel has read, plus kernel caches. **The kernel keeps file pages in RAM in case someone reads them again, and gives them back when a program needs memory.** The `available` column estimates how much a new program can get without swapping.',
		'In 2014 Rik van Riel added `MemAvailable` to `/proc/meminfo`. His commit message explains why: programs estimated free memory "by adding up "free" and "cached", which was fine ten years ago, but is pretty much guaranteed to be wrong today."'
	],
	terms: [
		{ term: 'Page cache', def: 'RAM pages that hold the contents of files, filled when a process reads or writes a file. `/proc/meminfo` shows it as `Cached`, together with tmpfs and shared memory.' },
		{ term: 'MemFree', def: 'RAM that holds nothing at all. `free` prints it in the `free` column.' },
		{ term: 'MemAvailable', def: 'The kernel\'s estimate "of how much memory is available for starting new applications, without swapping": free pages, plus the page cache and slab memory it can reclaim. `free` prints it as `available`.' },
		{ term: 'Dirty page', def: 'A page cache page changed by a `write` and not yet written to disk. The kernel must write it back before it can reuse the page.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['r1["First read of med.bin, 256 MiB"] -->|"page not in cache"| disk[("Disk")]', 'disk --> pc["Page cache: 65536 pages of med.bin"]', 'pc --> u1["Copy into the reader\'s buffer"]'],
				highlight: ['r1', 'disk', 'pc'],
				note: 'The kernel looks for each page of the file in the page cache, misses, reads it from disk into a free page and copies it to the process. `/proc/self/io` showed `read_bytes` 268435456: every byte came from the disk. The read took 0.07 s.'
			},
			{
				add: ['r2["Second read, from a new process"] -->|"page found"| pc'],
				highlight: ['r2'],
				note: 'A second Python process read the same file. `read_bytes` was 0, `rchar` still 268435564, and the read took 0.01 s. The page cache belongs to the kernel, so any process that reads the file gets the cached pages.'
			},
			{
				add: ['pc --> meminfo["/proc/meminfo: Cached grows, MemFree shrinks"]'],
				highlight: ['meminfo'],
				note: 'Those pages leave `MemFree` and count in `Cached`. `free` adds `Buffers`, `Cached` and `SReclaimable` into buff/cache: 7061852 + 10194356 + 3816928 = 21073136 kB on this laptop.'
			},
			{
				add: ['app["A program asks for 2 GiB"] -->|"not enough MemFree"| reclaim["Kernel reclaims clean cache pages"]', 'reclaim --> pc'],
				highlight: ['app', 'reclaim'],
				note: 'When a program needs more pages than are free, the kernel takes them from the page cache. A clean page is the same as the file on disk, so the kernel can drop it with no write. The `drop_caches` docs say even a manual cache drop "will not free any dirty objects": those must go to disk first. `Dirty` was 1248 kB here.'
			},
			{
				add: ['reclaim --> avail["MemAvailable = free + part of file cache + part of slab"]', 'avail --> used["free: used = total - available"]'],
				highlight: ['avail', 'used'],
				note: '`si_mem_available()` assumes some cache must stay and subtracts it before adding the rest to the free pages. `free` then prints `used` as total minus available: 28365352 - 22012500 = 6352852 kB, the `6.1Gi` in the hook.'
			}
		]
	},
	example: {
		title: 'mm/show_mem.c (Linux v6.12): si_mem_available, the MemAvailable estimate',
		repo: 'torvalds/linux',
		url: `${SHOW_MEM}#L32-L72`,
		lang: 'c',
		code: `long si_mem_available(void)
{
	long available;
	unsigned long pagecache;
	unsigned long wmark_low = 0;
	unsigned long reclaimable;
	struct zone *zone;

	for_each_zone(zone)
		wmark_low += low_wmark_pages(zone);

	/*
	 * Estimate the amount of memory available for userspace allocations,
	 * without causing swapping or OOM.
	 */
	available = global_zone_page_state(NR_FREE_PAGES) - totalreserve_pages;

	/*
	 * Not all the page cache can be freed, otherwise the system will
	 * start swapping or thrashing. Assume at least half of the page
	 * cache, or the low watermark worth of cache, needs to stay.
	 */
	pagecache = global_node_page_state(NR_ACTIVE_FILE) +
		global_node_page_state(NR_INACTIVE_FILE);
	pagecache -= min(pagecache / 2, wmark_low);
	available += pagecache;

	/*
	 * Part of the reclaimable slab and other kernel memory consists of
	 * items that are in use, and cannot be freed. Cap this estimate at the
	 * low watermark.
	 */
	reclaimable = global_node_page_state_pages(NR_SLAB_RECLAIMABLE_B) +
		global_node_page_state(NR_KERNEL_MISC_RECLAIMABLE);
	reclaimable -= min(reclaimable / 2, wmark_low);
	available += reclaimable;

	if (available < 0)
		available = 0;
	return available;
}`,
		notes: [
			'Lines 9 and 10 add up the "low" watermark of every zone. The sysctl docs tie the watermarks to when `kswapd`, the background reclaim thread, wakes up. The estimate uses this sum as the most cache it holds back.',
			'Line 16 starts from the free pages and subtracts `totalreserve_pages`, which `calculate_totalreserve_pages()` builds from each zone\'s high watermark and lowmem reserve.',
			'Lines 23 to 26 add the file cache: the active and inactive file lists. Line 25 keeps back half of it or the low watermark, whichever is smaller. The comment says why: "Not all the page cache can be freed, otherwise the system will start swapping or thrashing."',
			'Lines 33 to 36 do the same for reclaimable slab, kernel objects "like dentries and inodes" in the sysctl docs, because some of them "are in use, and cannot be freed". `free` reads the result from the `MemAvailable` line of [`/proc/meminfo`](' + PROC_RST + '#L1076-L1084).'
		]
	},
	tradeoff: {
		gain: [
			'A second read of a cached file costs no disk I/O: 0 bytes from storage and 0.01 s for 256 MiB, against 0.07 s the first time.',
			'RAM that no program uses holds file data instead of sitting empty, and the kernel can take it back without writing anything for clean pages.'
		],
		cost: [
			'`free` and dashboards that plot `MemFree` show a machine at 1.6 GiB free out of 27 GiB that has 20 GiB available.',
			'The kernel can reuse a dirty page only after writing it to disk, so a cache full of dirty pages frees memory at the speed of the disk.',
			'When the kernel drops the pages of a file that is read again, the next read goes back to the disk: 0.07 s instead of 0.01 s for 256 MiB here.'
		]
	},
	task: {
		prompt: 'A server prints `MemTotal 28365352 kB`, `MemFree 1670320`, `MemAvailable 22012500`, `Buffers 7061852`, `Cached 10194356`, `SReclaimable 3816928`, `Active(file) 1814824`, `Inactive(file) 15170572`. Your monitoring pages you at "94% memory used". Is the server short of memory? Rebuild the `used` and `buff/cache` columns of `free`, then estimate MemAvailable by hand.',
		hint: 'free(1): `used` is total minus available, and buff/cache is Buffers + Cached + SReclaimable. The kernel adds the file lists and reclaimable slab to the free pages, minus a reserve.',
		answer: [
			'The alert used MemFree: 1670320 / 28365352 is 5.9% free, so "94% used". That number counts the page cache as used.',
			'`used` = 28365352 - 22012500 = 6352852 kB (6.1 GiB, 22%). buff/cache = 7061852 + 10194356 + 3816928 = 21073136 kB.',
			'By hand: 1670320 free + 16985396 of file lists + 3816928 of slab = 22472644 kB. The kernel reports 22012500 kB, 460144 kB less: the reserve and the cache it keeps back.',
			'The server is fine: 21 GiB is available. Alert on `MemAvailable`, or on swap and OOM kills (chapters 11 and 12), instead of `MemFree`.'
		],
		steps: [
			{
				title: 'Check what the alert measured',
				questions: [
					{ q: 'Which line gives "94% used"?', options: ['`MemAvailable` over `MemTotal`', '`MemFree`: 5.9% free', '`Cached` over `MemTotal`', '`SReclaimable`'], answer: 1, why: '100% minus 5.9% free is about 94%. The alert read `MemFree`.' },
					{ q: 'What does `MemFree` leave out?', options: ['Swap that is in use', 'RAM that holds nothing at all', 'Page cache it can hand back', 'Memory used by root processes'], answer: 2, why: 'File pages kept in case they are read again leave `MemFree`, even though programs can still get them.' },
					{ q: 'Traffic stops for the night. Does the alert stop firing?', options: ['No: the cached file data stays in RAM until something needs the memory', 'Yes: the kernel empties the cache when the server is idle', 'Yes: `MemFree` is reset every minute', 'Yes: page cache expires after 15 minutes'], answer: 0, why: 'The kernel takes cache back only when memory is needed. On a quiet server `MemFree` stays low, and an alert on it keeps firing.' },
					{ q: 'Which column of `free -h` shows the same number as `MemFree`?', options: ['`available`', '`buff/cache`', '`used`', '`free`'], answer: 3, why: 'The `free` column is `MemFree`: 1670320 kB, about 1.6 GiB. The alert was built on that number.' }
				]
			},
			{
				title: 'Rebuild used',
				questions: [
					{ q: 'If `used` were total minus `MemFree`, as the alert assumes, what would it be?', options: ['6352852 kB', '26695032 kB', '21073136 kB', '1670320 kB'], answer: 1, why: '28365352 - 1670320 = 26695032 kB, 94% of RAM: the alert\'s number.' },
					{ q: 'free(1) subtracts `MemAvailable` instead of `MemFree`. By how much does that lower `used`?', options: ['1670320 kB', '22012500 kB', '20342180 kB', '6352852 kB'], answer: 2, why: '22012500 - 1670320 = 20342180 kB, about 19.4 GiB that the kernel can hand back to programs.' },
					{ q: 'free\'s `used` comes to 6352852 kB. What share of RAM is that?', options: ['About 22%', 'About 94%', 'About 6%', 'About 78%'], answer: 0, why: '6352852 / 28365352 is about 22%, far from the 94% in the alert.' },
					{ q: 'How much is available to new programs?', options: ['About 1.6 GiB', 'About 6.1 GiB', 'About 10 GiB', 'About 21 GiB'], answer: 3, why: '`MemAvailable` is 22012500 kB, about 21 GiB.' }
				]
			},
			{
				title: 'Rebuild buff/cache',
				questions: [
					{ q: 'Which three lines add up to buff/cache?', options: ['`Buffers`, `Cached`, `SReclaimable`', '`MemFree`, `Cached`, `Buffers`', '`Active(file)`, `Inactive(file)`, `Cached`', '`Cached`, `SReclaimable`, `MemAvailable`'], answer: 0, why: 'free(1) adds `Buffers`, `Cached` and `SReclaimable`.' },
					{ q: 'What is buff/cache here?', options: ['17256208 kB', '21073136 kB', '22012500 kB', '16985396 kB'], answer: 1, why: '7061852 + 10194356 + 3816928 = 21073136 kB.' },
					{ q: 'What share of RAM is buff/cache here?', options: ['About 22%', 'About 94%', 'About 74%', 'About 6%'], answer: 2, why: '21073136 / 28365352 is about 74%: most of the RAM the alert called used holds cache.' },
					{ q: 'What must happen before the kernel can reuse a dirty page?', options: ['Nothing, it drops it', 'A process must close the file', 'The page must be swapped out', 'It must be written to disk'], answer: 3, why: 'A dirty page differs from the file on disk, so it is written back first.' }
				]
			},
			{
				title: 'Estimate MemAvailable',
				questions: [
					{ q: 'Which lines make the file lists the kernel counts?', options: ['`Active(file)` and `Inactive(file)`', '`Cached` and `Buffers`', '`Cached` only', '`Buffers` and `SReclaimable`'], answer: 0, why: '`si_mem_available()` adds `NR_ACTIVE_FILE` and `NR_INACTIVE_FILE`.' },
					{ q: 'What is that sum here?', options: ['10194356 kB', '15170572 kB', '16985396 kB', '21073136 kB'], answer: 2, why: '1814824 + 15170572 = 16985396 kB.' },
					{ q: 'Free + file lists + reclaimable slab gives what?', options: ['22012500 kB', '22472644 kB', '21073136 kB', '28365352 kB'], answer: 1, why: '1670320 + 16985396 + 3816928 = 22472644 kB.' },
					{ q: 'The kernel reports 22012500 kB, 460144 kB less. Why?', options: ['Rounding in `free` to the nearest MiB', 'The dirty pages waiting for disk', 'Swap in use', 'It keeps back a reserve, cache and slab'], answer: 3, why: 'It subtracts `totalreserve_pages` and holds back half of each pool or the low watermark, whichever is smaller.' }
				]
			}
		]
	},
	quiz: [
		{
			q: '`free -h` shows `free 1.6Gi` and `available 20Gi` on a 27 GiB machine. What does that mean?',
			options: [
				'The machine is out of memory and about to start swapping',
				'Most RAM holds file cache that the kernel can hand to programs',
				'20 GiB is reserved for the kernel and cannot be used',
				'A program is leaking memory and will be OOM killed soon'
			],
			answer: 1,
			why: 'The page cache keeps file pages in RAM, which lowers `MemFree`. `MemAvailable` adds back the cache and slab the kernel can reclaim, so about 20 GiB can go to new programs without swapping.'
		},
		{
			q: 'A process reads a 256 MiB file twice. `/proc/self/io` shows `read_bytes` 268435456 after the first read and 0 more after the second. Why?',
			options: [
				'The second read was served from the page cache, with no disk access',
				'The process kept the file in its own heap after the first read',
				'`read_bytes` only counts the first read of each file',
				'The disk has its own cache, and `read_bytes` ignores it'
			],
			answer: 0,
			why: '`read_bytes` counts bytes "really fetched from the storage layer". The first read filled the page cache. The second found every page there and copied it from RAM, as `rchar` shows.'
		},
		{
			q: 'Why does the kernel not count all of `Cached` as available?',
			options: [
				'`Cached` is measured in pages and `MemAvailable` in kB',
				'Cached pages belong to the process that read them first',
				'Some of it is tmpfs or shared memory, and some cache must stay',
				'`Cached` is only refreshed once a minute'
			],
			answer: 2,
			why: '`Cached` includes tmpfs and shared memory, which the kernel cannot drop. `si_mem_available()` counts only the file lists, minus half of them or the low watermark, so the system keeps enough cache to run.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Read a file from disk and then from the page cache, and rebuild the columns of `free` from `/proc/meminfo`.',
		steps: [
			'Make a scratch folder and a 256 MiB file: `mkdir -p ~/cache-lab && cd ~/cache-lab && head -c 268435456 /dev/urandom > med.bin && sync`. This lab needs Linux.',
			'Write a script that drops this one file from the cache, no root needed: `printf \'import os, sys\\nfd = os.open(sys.argv[1], os.O_RDONLY)\\nos.posix_fadvise(fd, 0, 0, os.POSIX_FADV_DONTNEED)\\n\' > evict.py`.',
			'Write a script that reads a file and prints its disk bytes: `printf \'import sys, time\\nt = time.time()\\nwith open(sys.argv[1], "rb") as f:\\n    while f.read(1 << 20): pass\\nio = dict(l.split(": ") for l in open("/proc/self/io").read().split("\\\\n") if l)\\nprint("read_bytes", io["read_bytes"], "seconds", round(time.time() - t, 3))\\n\' > readit.py`.',
			'Evict, then read twice: `python3 evict.py med.bin; python3 readit.py med.bin; python3 readit.py med.bin`.',
			'Rebuild `free`: run `free -k` and `grep -E \'^(MemTotal|MemFree|MemAvailable|Buffers|Cached|SReclaimable):\' /proc/meminfo`. Clean up with `rm med.bin`.'
		],
		done: [
			'The first read prints `read_bytes 268435456`, and the second prints `read_bytes 0` and takes less time.',
			'`free`\'s `used` equals `MemTotal` minus `MemAvailable`, give or take the few kB that changed between the two commands.',
			'`free`\'s `buff/cache` equals `Buffers` + `Cached` + `SReclaimable`, with the same small drift.'
		],
		solution: [
			'`read_bytes` counts bytes "really fetched from the storage layer". The first read filled the page cache, and the second process found every page there.',
			'The cache belongs to the kernel, not to the process, so a new process gets the cached pages.',
			'`posix_fadvise(POSIX_FADV_DONTNEED)` asks the kernel to drop the clean cached pages of this one file. `drop_caches` does it for the whole machine and needs root.',
			'`used` is total minus available, so it leaves out the cache the kernel can hand back.'
		]
	},
	recall: {
		q: 'Which `/proc/meminfo` line tells you how much memory a new program can get without swapping, and how does `free` compute `used` from it?',
		a: '`MemAvailable`, the `available` column. `used` = total - available, for example 28365352 - 22012500 = 6352852 kB.'
	},
	sources: [
		{ title: 'free(1), Linux manual page', url: 'https://man7.org/linux/man-pages/man1/free.1.html' },
		{ title: 'Linux v6.12, Documentation/filesystems/proc.rst (meminfo)', url: PROC_RST },
		{ title: 'Linux commit 34e431b0ae39, /proc/meminfo: provide estimated available memory', url: COMMIT },
		{ title: 'Linux v6.12, mm/show_mem.c', url: SHOW_MEM },
		{ title: 'Linux v6.12, Documentation/admin-guide/sysctl/vm.rst (drop_caches, watermark_scale_factor)', url: SYSCTL_VM },
		{ title: 'proc_pid_io(5), Linux manual page', url: 'https://man7.org/linux/man-pages/man5/proc_pid_io.5.html' }
	]
};
