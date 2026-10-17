const LMDB = 'https://github.com/LMDB/lmdb/blob/028f61b6832032174f893484719ed4848d8d60db/libraries/liblmdb';
const PAPER = 'https://db.cs.cmu.edu/papers/2022/cidr2022-p13-crotty.pdf';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'mmap',
	part: 'Memory',
	title: 'mmap',
	minutes: 10,
	hook: [
		'MongoDB\'s first storage engine, MMAPv1, read and wrote its data files through `mmap`. MongoDB made WiredTiger the default engine in 2015 and removed MMAPv1 in 2019.',
		'A [CIDR 2022 paper](' + PAPER + ') measured why. 100 threads read random pages from an NVMe SSD. `fio` with `pread` held close to 900K reads per second. **With `mmap`, reads matched it for 27 seconds, then dropped to nearly zero for about five seconds** when the page cache filled up, then recovered to about half.',
		'LMDB, the OpenLDAP project\'s key-value store, takes the other side. Its header says: "The entire database is exposed in a memory map, and all data fetches return data directly from the mapped memory".'
	],
	terms: [
		{ term: 'File mapping', def: 'A range of a process\'s virtual addresses that `mmap(2)` ties to a file. Reading an address there reads the file\'s bytes at the matching offset.' },
		{ term: 'MAP_SHARED', def: 'The mapping flag under which writes go to the file\'s pages in the page cache. Other processes that map the same file see them, and the kernel writes them to the file.' },
		{ term: 'MAP_PRIVATE', def: 'The flag for a copy-on-write mapping. The first write to a page gives the process its own copy, and the file never sees the change.' },
		{ term: 'Buffer pool', def: 'A cache of file pages that a database keeps in its own memory, reading and writing with `pread` and `pwrite`. It is what `mmap` replaces.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['call["p = mmap(NULL, 1 GB, PROT_READ, MAP_SHARED, fd, 0)"] --> vma["The kernel reserves 1 GB of addresses, reads nothing"]'],
				highlight: ['call', 'vma'],
				note: 'The call returns an address and no data moves yet. The CIDR paper: "The OS transparently loads pages only when the program references them." mmap(2) adds that the fd "can be closed immediately without invalidating the mapping".'
			},
			{
				add: ['vma --> read["The process reads p[4096]"]', 'read --> fault["Page fault: the kernel finds page 1 in the page cache or reads it from disk"]'],
				highlight: ['read', 'fault'],
				note: 'The first access to each page faults. The kernel puts the file page in the page cache if it is not there and maps that same page into the process. No copy is made: SQLite\'s docs say it "shares pages with the operating-system page cache".'
			},
			{
				add: ['fault -->|"MAP_SHARED write"| dirty["The page cache page is dirty, written to the file later"]', 'fault -->|"MAP_PRIVATE write"| cow["Copy-on-write: a private copy, the file unchanged"]'],
				highlight: ['dirty', 'cow'],
				note: 'With `MAP_SHARED`, a store changes the page cache page itself, so other processes see it, and writeback carries it to the file. `msync(2)` sets when. With `MAP_PRIVATE`, the kernel copies the page on the first write. The `rw-p` line for libc in `/proc/<pid>/maps` is such a mapping.'
			},
			{
				add: ['dirty --> evict["Memory runs short: the kernel unmaps pages and flushes the TLB of every CPU"]'],
				highlight: ['evict'],
				note: 'The kernel chooses which mapped pages to evict. Removing a page that other cores may have cached means an interrupt to flush their TLBs: a TLB shootdown, "thousands of cycles" each. The CIDR paper also found the single `kswapd` thread CPU-bound and the page table contended.'
			},
			{
				add: ['evict --> again["The next read of that page faults and waits for the disk"]', 'again -.->|"disk error"| bus["SIGBUS instead of an error code"]'],
				highlight: ['again', 'bus'],
				note: 'The program cannot tell a memory read from a disk read in advance. A read that hits an evicted page blocks inside the fault. If the read from disk fails, there is no return value to check: SQLite\'s docs say the I/O error "causes a signal which, if not caught by the application, results in a program crash".'
			}
		]
	},
	example: {
		title: 'LMDB mdb.c: mdb_env_map, the whole database in one mapping',
		repo: 'LMDB/lmdb',
		url: `${LMDB}/mdb.c#L4141-L4177`,
		lang: 'c',
		code: `	int mmap_flags = MAP_SHARED;
	int prot = PROT_READ;
#ifdef MAP_NOSYNC	/* Used on FreeBSD */
	if (flags & MDB_NOSYNC)
		mmap_flags |= MAP_NOSYNC;
#endif
	if (flags & MDB_WRITEMAP) {
		prot |= PROT_WRITE;
		if (ftruncate(env->me_fd, env->me_mapsize) < 0)
			return ErrCode();
	}
	env->me_map = mmap(addr, env->me_mapsize, prot, mmap_flags,
		env->me_fd, 0);
	if (env->me_map == MAP_FAILED) {
		env->me_map = NULL;
		return ErrCode();
	}

	if (flags & MDB_NORDAHEAD) {
		/* Turn off readahead. It's harmful when the DB is larger than RAM. */
#ifdef MADV_RANDOM
		madvise(env->me_map, env->me_mapsize, MADV_RANDOM);
#else
#ifdef POSIX_MADV_RANDOM
		posix_madvise(env->me_map, env->me_mapsize, POSIX_MADV_RANDOM);
#endif /* POSIX_MADV_RANDOM */
#endif /* MADV_RANDOM */
	}
#endif /* _WIN32 */

	/* Can happen because the address argument to mmap() is just a
	 * hint.  mmap() can pick another, e.g. if the range is in use.
	 * The MAP_FIXED flag would prevent that, but then mmap could
	 * instead unmap existing pages to make room for the new map.
	 */
	if (addr && env->me_map != addr)
		return EBUSY;	/* TODO: Make a new MDB_* error code? */`,
		notes: [
			'Lines 1 and 2 pick `MAP_SHARED` and `PROT_READ`: every process that opens the database sees the same page cache pages, and none can write through the mapping. The [header](' + LMDB + '/lmdb.h#L13-L16) says a read-only map means "database integrity cannot be corrupted by stray pointer writes from application code".',
			'Line 12 maps `me_mapsize` bytes of the file in one call. That size is also the largest the database can grow: the default is 10485760 bytes, 10 MB, and the docs say to choose it "as large as possible".',
			'Lines 7 to 11 handle `MDB_WRITEMAP`: they add `PROT_WRITE`, and `ftruncate` grows the file to the full map size first. Without that flag, LMDB writes changed pages with `pwrite` and `writev` and only reads through the map.',
			'Lines 19 to 28: with `MDB_NORDAHEAD`, `madvise(MADV_RANDOM)` tells the kernel not to read ahead. The comment on line 20 gives the reason: readahead is "harmful when the DB is larger than RAM".'
		]
	},
	tradeoff: {
		gain: [
			'A key lookup in LMDB returns a pointer into the mapped page, with no `malloc` and no `memcpy`.',
			'LMDB keeps file pages only in the kernel\'s page cache. Its header says the library "requires no page caching layer of its own".'
		],
		cost: [
			'The kernel decides which pages leave RAM and when. In the CIDR 2022 test, reads fell to nearly zero for about 5 seconds when eviction started.',
			'A disk error arrives as SIGBUS in whatever code touched the page. A buffer pool gets it as a return value from `pread`.',
			'The bytes in RAM must match the bytes on disk. The paper notes that MMAPv1 could not compress data on disk for that reason.'
		]
	},
	task: {
		prompt: 'Run `awk \'$6 ~ /libc\\.so/\' /proc/$$/maps` to see how your shell maps libc. The second column is the permissions. Why are all libc lines private (`p`), and what happens to the `rw-p` page when the shell writes a global variable?',
		hint: 'proc_pid_maps(5): "s = shared", "p = private (copy on write)". Each line is one mapping of the same file at a different offset.',
		answer: [
			'Output captured in this session: five lines for `/usr/lib/x86_64-linux-gnu/libc.so.6`, with permissions `r--p`, `r-xp`, `r--p`, `r--p` and `rw-p`. The `r-xp` line at offset `00028000` is the code.',
			'Each line maps one part of the same file at a different offset, with its own permissions. The `p` means copy-on-write: no write by the shell can reach the libc file on disk.',
			'The `rw-p` line holds libc\'s writable globals. The first write to one of those pages gives this shell its own copy, and the file and other processes keep the original.',
			'The same shell also has a shared mapping, `r--s` on `/usr/lib/x86_64-linux-gnu/gconv/gconv-modules.cache`: a read-only file that every process can share as is.'
		]
	},
	quiz: [
		{
			q: 'A process maps a file with `MAP_PRIVATE`, `PROT_READ | PROT_WRITE`, and writes 4 bytes at offset 0. What happens to the file on disk?',
			options: [
				'The 4 bytes reach the file at the next writeback, like any dirty page',
				'Nothing: the process got its own copy of the page on the first write',
				'The write fails with EACCES because private mappings are read-only',
				'The 4 bytes reach the file only after the process calls `msync`'
			],
			answer: 1,
			why: 'mmap(2): `MAP_PRIVATE` creates "a private copy-on-write mapping", and updates "are not carried through to the underlying file". `msync` only matters for `MAP_SHARED` mappings.'
		},
		{
			q: 'Two processes map the same file with `MAP_SHARED`. Process A writes a byte through its mapping. When does process B see it?',
			options: [
				'Only after A calls `msync` or `fsync`',
				'Only after the kernel writes the page to disk',
				'Right away, because both map the same page cache page',
				'Never, because each process got its own copy at fault time'
			],
			answer: 2,
			why: 'With `MAP_SHARED`, "Updates to the mapping are visible to other processes mapping the same region". Both page tables point at one physical page in the page cache. `msync` controls when the file on disk is updated. B reads the new byte before that.'
		},
		{
			q: 'A database reads through `mmap`. The page it needs was evicted a second ago. What does the reading thread do?',
			options: [
				'It gets EAGAIN from the read and retries the lookup later',
				'It reads stale data left behind in the TLB by the last access',
				'It reads zeros, because evicted pages are cleared before reuse',
				'It blocks inside a page fault while the kernel reads the page from disk'
			],
			answer: 3,
			why: 'An evicted page is no longer mapped, so the access faults and the kernel loads the file page again. The thread waits in the fault until the disk read completes. No error code or EAGAIN comes back to the caller.'
		}
	],
	recall: {
		q: 'With `mmap`, where do the bytes a process reads actually live, and what is the difference between `MAP_SHARED` and `MAP_PRIVATE` on a write?',
		a: 'In the kernel\'s page cache, mapped into the process with no copy. A `MAP_SHARED` write changes that page, other mappers see it and the file gets it. A `MAP_PRIVATE` write makes a private copy and the file never changes.'
	},
	sources: [
		{ title: 'mmap(2), man7.org', url: 'https://man7.org/linux/man-pages/man2/mmap.2.html' },
		{ title: 'proc_pid_maps(5), man7.org', url: 'https://man7.org/linux/man-pages/man5/proc_pid_maps.5.html' },
		{ title: 'SQLite docs, Memory-Mapped I/O', url: 'https://www.sqlite.org/mmap.html' },
		{ title: 'LMDB 0.9.36, libraries/liblmdb/lmdb.h', url: `${LMDB}/lmdb.h` },
		{ title: 'Crotty, Leis, Pavlo: Are You Sure You Want to Use MMAP in Your Database Management System? (CIDR 2022)', url: PAPER }
	]
};
