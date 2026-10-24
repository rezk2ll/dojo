const LINUX = 'https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a';
const INODE = `${LINUX}/fs/ext4/inode.c`;
const NAMEI = `${LINUX}/fs/ext4/namei.c`;
const LP = 'https://bugs.launchpad.net/ubuntu/+source/linux/+bug/317781';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'filesystems',
	part: 'Files and disks',
	title: 'Filesystems and journaling',
	minutes: 10,
	hook: [
		'January 2009, Ubuntu bug #317781, "Ext4 data loss". A Kubuntu Jaunty user crashes his machine while testing BIOS settings. After the reboot, "pretty much any file written to by any application (during the previous boot) was 0 bytes": KDE and Plasma config files, some MySQL databases.',
		'His ext4 used the defaults: "Barriers on, extents on, ordered data mode". Another reporter lost his Wine registry and GNOME settings, and fsck "removed 760+ orphaned inodes".',
		'In ordered mode, the ext4 journal covers directories, inodes and block maps. **The file contents never go through the journal.** Kernel 2.6.30 shipped the `auto_da_alloc` mount option, on by default, which pushes the data out before a rename over an existing file commits.'
	],
	terms: [
		{ term: 'Journal', def: 'A reserved area of the filesystem, usually inode 8 on ext4, where jbd2 writes each metadata change before writing it to its final place.' },
		{ term: 'Metadata', def: 'The filesystem\'s own records: inodes, directory entries, block and inode bitmaps. The bytes inside a file are its data.' },
		{ term: 'data=ordered', def: 'The ext4 default mode: only metadata goes through the journal, and a transaction\'s data blocks are written before its metadata commits.' },
		{ term: 'Delayed allocation', def: '`write(2)` only reserves space, and ext4 picks the disk blocks just before it writes the data out. The `delalloc` mount option, on by default.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['w["write(fd, config, 4 KB) to foo.new"] -->|"delalloc: no block chosen yet"| pc["Page cache: dirty page, i_size 4096"]'],
				highlight: ['w', 'pc'],
				note: 'With `delalloc`, ext4 defers block allocation "until just before ext4 writes out the block(s) in question". The 4 KB sit in the page cache. The inode already says 4096 bytes, and no disk block holds them.'
			},
			{
				add: ['ren["rename(foo.new, foo)"] -->|"metadata change"| tx["Running jbd2 transaction in memory: directory entry, inodes"]'],
				highlight: ['ren', 'tx'],
				note: 'The rename only changes metadata: the directory entry `foo` now points at the new inode, and the old inode loses its last link. jbd2 adds these changed blocks to the transaction that is open in memory.'
			},
			{
				add: ['tx -->|"every 5 s: commit=5"| jr[("Journal: metadata blocks, then a commit record")]', 'pc -.->|"data=ordered: data blocks first"| disk[("Data blocks in place")]'],
				highlight: ['jr', 'disk'],
				note: 'The `commit=5` default limits a transaction\'s age to 5 seconds. In `data=ordered`, "When it\'s time to write the new metadata out to disk, the associated data blocks are written first." Only data blocks that already have an allocation are part of that transaction.'
			},
			{
				add: ['crash["Power loss 3 s after the commit"] -->|"replay up to the last commit record"| rec["foo names the new inode, size 4096, no data blocks: 0 bytes"]'],
				highlight: ['crash', 'rec'],
				note: 'On the next mount, jbd2 replays the journal "all the way to the latest commit record". The directory entry and the inodes come back consistent. In 2009 the delayed blocks had not been allocated, so the data was not ordered before the rename, and `foo` came back empty.'
			},
			{
				add: ['fix["auto_da_alloc: rename over an existing file"] -->|"allocate and start writing foo.new first"| disk'],
				highlight: ['fix'],
				note: 'With `auto_da_alloc`, ext4 detects "the replace-via-rename and replace-via-truncate patterns" and forces the blocks out so that "the data blocks of the new file are forced to disk before the rename() operation is committed". A brand new file with no `fsync` can still come back empty.'
			}
		]
	},
	example: {
		title: 'fs/ext4/inode.c: ext4_alloc_da_blocks, the auto_da_alloc flush',
		repo: 'torvalds/linux',
		url: `${INODE}#L3077-L3116`,
		lang: 'c',
		code: `int ext4_alloc_da_blocks(struct inode *inode)
{
	trace_ext4_alloc_da_blocks(inode);

	if (!EXT4_I(inode)->i_reserved_data_blocks)
		return 0;

	/*
	 * We do something simple for now.  The filemap_flush() will
	 * also start triggering a write of the data blocks, which is
	 * not strictly speaking necessary (and for users of
	 * laptop_mode, not even desirable).  However, to do otherwise
	 * would require replicating code paths in:
	 *
	 * ext4_writepages() ->
	 *    write_cache_pages() ---> (via passed in callback function)
	 *        __mpage_da_writepage() -->
	 *           mpage_add_bh_to_extent()
	 *           mpage_da_map_blocks()
	 *
	 * The problem is that write_cache_pages(), located in
	 * mm/page-writeback.c, marks pages clean in preparation for
	 * doing I/O, which is not desirable if we're not planning on
	 * doing I/O at all.
	 *
	 * We could call write_cache_pages(), and then redirty all of
	 * the pages by calling redirty_page_for_writepage() but that
	 * would be ugly in the extreme.  So instead we would need to
	 * replicate parts of the code in the above functions,
	 * simplifying them because we wouldn't actually intend to
	 * write out the pages, but rather only collect contiguous
	 * logical block extents, call the multi-block allocator, and
	 * then update the buffer heads with the block allocations.
	 *
	 * For now, though, we'll cheat by calling filemap_flush(),
	 * which will map the blocks, and start the I/O, but not
	 * actually wait for the I/O to complete.
	 */
	return filemap_flush(inode->i_mapping);
}`,
		notes: [
			'[`ext4_rename`](' + NAMEI + '#L3869-L3870) calls this function when the target name already exists (`new.inode`) and the filesystem is not mounted `noauto_da_alloc`. It runs in the `rename("foo.new", "foo")` step, before the rename starts its journal handle.',
			'Lines 5 and 6 return at once when the inode has no reserved delayed blocks: its data already has disk blocks, and `data=ordered` covers it.',
			'Line 39 calls `filemap_flush`. The comment on lines 35 to 37 says what it does: it "will map the blocks, and start the I/O, but not actually wait for the I/O to complete". Once mapped, the blocks belong to the ordered data of the transaction.',
			'Ted Ts\'o in the bug: the fix "only protects against a file which is replaced via rename or truncate". For a file that did not exist before, an application still needs `fsync`, the subject of the next chapter.'
		]
	},
	tradeoff: {
		gain: [
			'After a crash, jbd2 replays the journal to the last commit record, so a directory or inode is never left halfway through an update.',
			'In `data=ordered`, a transaction\'s data blocks reach the disk before its metadata. The ext4 docs on `data=writeback`, which they compare to the metadata journaling of XFS: "A crash+recovery can cause incorrect data to appear in files which were written shortly before the crash."',
			'The `commit=5` default caps the loss: "you will lose as much as the latest 5 seconds of metadata changes (your filesystem will not be damaged though, thanks to the journaling)".'
		],
		cost: [
			'`data=ordered` journals metadata only. The jbd2 docs: "file data blocks are /not/ guaranteed to be in any consistent state after a crash."',
			'`data=journal` writes all data twice, first to the journal, then in place, and "will disable delayed allocation and O_DIRECT support".',
			'`nodelalloc` would have avoided the 2009 empty files. Ts\'o: "You will take a performance hit and your files will be more fragmented."'
		]
	},
	task: {
		prompt: 'On a machine with an ext4 root, run `findmnt -no SOURCE,FSTYPE,OPTIONS /`, then `ls /proc/fs/ext4/` and `cat /proc/fs/ext4/<dev>/options`. Which data mode and commit interval is the filesystem using, and is `auto_da_alloc` on? Which of the two commands tells you?',
		hint: 'Look for `data=`, `commit=` and `auto_da_alloc` in both outputs. The ext4 admin guide marks the default options with `(*)`.',
		answer: [
			'Output captured on a laptop for this chapter: `findmnt` printed `/dev/mapper/data-root ext4 rw,noatime,errors=remount-ro`. No data mode and no commit interval appear there.',
			'`/proc/fs/ext4/dm-0/options` listed `delalloc`, `auto_da_alloc`, `commit=5` and `data=ordered`, among 27 lines. These are the defaults marked `(*)` in the ext4 admin guide.',
			'So a crash loses at most about 5 seconds of metadata changes, file data is written before the metadata that points to it, and a rename over an existing file flushes the new data first.'
		],
		steps: [
			{
				title: 'Read findmnt',
				questions: [
					{ q: '`findmnt` printed `/dev/mapper/data-root ext4 rw,noatime,errors=remount-ro`. Which data mode does it show?', options: ['`data=ordered`', '`data=writeback`', 'None: the line has no `data=` option', '`data=journal`'], answer: 2, why: 'The line lists only `rw`, `noatime` and `errors=remount-ro`. No data mode and no commit interval appear.' },
					{ q: 'Why are `data=` and `commit=` missing from that line?', options: ['They are defaults, so the mount line does not repeat them', 'The filesystem has no journal', 'Only root can see them', '`findmnt` hides every ext4 option'], answer: 0, why: 'The ext4-specific file listed `data=ordered` and `commit=5`, the defaults marked `(*)` in the admin guide.' },
					{ q: 'What does the `ext4` column tell you about the journal?', options: ['That it journals file data', 'That it has none', 'That it commits every second', 'Nothing yet: you need the ext4 options to know the mode'], answer: 3, why: 'The type alone does not say which data mode is in use. ext4 can run `ordered`, `writeback` or `journal`.' },
					{ q: 'Which part of this filesystem does a jbd2 journal hold?', options: ['Every byte written to files', 'Only the free block bitmap', 'Metadata changes, before they go to their final place', 'A copy of the page cache'], answer: 2, why: 'jbd2 writes each metadata change to the journal first. In ordered mode, file contents never go through it.' }
				]
			},
			{
				title: 'Find the ext4 options',
				questions: [
					{ q: '`ls /proc/fs/ext4/` printed `dm-0`. What is that?', options: ['The name of the journal', 'The kernel name of the device that holds the ext4 filesystem', 'A mount option', 'The first inode'], answer: 1, why: 'ext4 keeps one folder per mounted filesystem, named after the block device. `/dev/mapper/data-root` is `dm-0`.' },
					{ q: 'Which file lists every option ext4 is really using?', options: ['`/proc/fs/ext4/dm-0/options`', '`/etc/fstab`', '`/proc/mounts`', '`/proc/fs/ext4/dm-0/journal`'], answer: 0, why: 'It listed 27 lines, defaults included, where `findmnt` showed three.' },
					{ q: 'So which of the two commands answers the task?', options: ['`findmnt`, because it reads the kernel', 'Both give the same lines', 'Neither: only `dumpe2fs` can', 'The `options` file, because it includes the defaults'], answer: 3, why: '`findmnt` left out every default. The `options` file showed `data=ordered`, `commit=5` and `auto_da_alloc`.' },
					{ q: 'Which inode usually holds the ext4 journal?', options: ['Inode 1', 'Inode 2', 'Inode 8', 'Inode 11'], answer: 2, why: 'The journal is a reserved area of the filesystem, usually inode 8 on ext4.' }
				]
			},
			{
				title: 'Read the options',
				questions: [
					{ q: 'What does `data=ordered` do?', options: ['Journals metadata only, and writes a transaction\'s data blocks before its metadata commits', 'Journals data and metadata, each written twice', 'Writes data in file order', 'Turns the journal off for data and metadata'], answer: 0, why: 'In ordered mode, only metadata goes through the journal. Data blocks that have an allocation are written first.' },
					{ q: 'What does `commit=5` limit?', options: ['The journal size to 5 MB', 'The age of the running transaction to 5 seconds', 'The number of `fsck` runs', 'The writes per second'], answer: 1, why: '`commit=nrsec` caps how old the open transaction can get before jbd2 writes it out.' },
					{ q: 'What does `delalloc` mean for a `write`?', options: ['The write waits for the disk', 'The write is journaled', 'The write is dropped after 5 s', 'It only reserves space; ext4 picks the blocks just before writing them out'], answer: 3, why: 'Delayed allocation defers block allocation "until just before ext4 writes out the block(s) in question".' },
					{ q: 'What does `auto_da_alloc` do on `rename(foo.new, foo)` when `foo` exists?', options: ['It refuses the rename', 'It journals the data of `foo.new`', 'It flushes the delayed blocks of `foo.new` before the rename commits', 'It keeps a backup of the old `foo`'], answer: 2, why: '`ext4_rename` calls `ext4_alloc_da_blocks`, which maps the blocks and starts the I/O, so the data is ordered before the rename.' }
				]
			},
			{
				title: 'Say what a crash costs',
				questions: [
					{ q: 'With `commit=5`, how much metadata can a power loss cost?', options: ['Up to the last 5 seconds of changes', 'Nothing at all', 'The whole filesystem', 'Every file opened since boot'], answer: 0, why: 'The ext4 docs: you lose "as much as the latest 5 seconds of metadata changes", and the filesystem is not damaged.' },
					{ q: 'After the crash, what state are directories and inodes in?', options: ['Half updated until `fsck` runs', 'Consistent, up to the last commit record', 'Empty', 'Rolled back to the last boot'], answer: 1, why: 'jbd2 replays the journal "all the way to the latest commit record", so no directory or inode is left halfway.' },
					{ q: 'A program saves a config with `foo.new` and `rename` over the old `foo`. Is it safe here without `fsync`?', options: ['No: it comes back 0 bytes, as in 2009', 'Yes, always, for any file', 'Only with `commit=1`', 'Yes for the rename over an existing file, thanks to `auto_da_alloc`'], answer: 3, why: 'The flush runs because the target name already exists, so the data reaches the disk before the rename commits.' },
					{ q: 'Which case does `auto_da_alloc` not cover?', options: ['A rename over an existing file', 'A truncate of an existing file', 'A brand new file written with no `fsync`', 'The KDE config save from 2009, renamed over the old file'], answer: 2, why: 'Ts\'o: the fix "only protects against a file which is replaced via rename or truncate". A new file still needs `fsync`.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'An ext4 filesystem in the default `data=ordered` mode loses power. What does the journal guarantee on the next mount?',
			options: [
				'Every byte written before the crash is on disk, in data and metadata',
				'Directories, inodes and bitmaps are consistent; recent file data may be lost',
				'Nothing until a full `fsck` has checked every block of the filesystem',
				'File data is consistent, but directories may need to be rebuilt'
			],
			answer: 1,
			why: 'In `data=ordered`, jbd2 journals metadata only, and replay brings it to the last commit record. The jbd2 docs say file data blocks are not guaranteed to be consistent. Full data journaling needs `data=journal`.'
		},
		{
			q: 'In 2009, on ext4 with delayed allocation, a program saved its config with `open("foo", O_TRUNC)`, `write`, `close` and no `fsync`. The machine crashed 3 s later. Why was `foo` 0 bytes?',
			options: [
				'The truncate was committed, but the new data had no disk blocks yet',
				'The journal was full, so ext4 dropped the write to make room',
				'`close` discards data that was never passed to `fsync`',
				'The crash corrupted the journal, so fsck emptied the file'
			],
			answer: 0,
			why: 'The truncate is a metadata change and went into a journal commit. With `delalloc`, the new data had no blocks yet, so `data=ordered` had nothing to write first. `auto_da_alloc` now catches this replace-via-truncate pattern.'
		},
		{
			q: 'You mount ext4 with `commit=60` to cut disk writes on a laptop. What can a power loss now cost you?',
			options: [
				'The whole filesystem, since the journal is replayed only every 60 s',
				'Nothing more, since `commit` only changes how often fsck runs',
				'Up to the last 60 s of metadata changes; the filesystem stays consistent',
				'Only files bigger than 60 MB that were open at the time'
			],
			answer: 2,
			why: '`commit=nrsec` limits the age of the running transaction. The ext4 docs: with the default 5 you lose "as much as the latest 5 seconds of metadata changes", and the journal keeps the filesystem undamaged. A larger value widens that window.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Build an ext4 filesystem in a file, without mounting it, and find its journal and its default data mode.',
		steps: [
			'Make a 64 MB image and format it: `mkdir -p ~/fs-lab && cd ~/fs-lab && truncate -s 64M disk.img && mke2fs -q -t ext4 -F disk.img`. On macOS, run the lab inside `docker run --rm -it debian:bookworm-slim bash`, which has e2fsprogs.',
			'Read the superblock: `dumpe2fs -h disk.img 2>/dev/null | grep -iE \'features|journal|mount options\'`.',
			'Look at the journal as a file: `debugfs -R \'stat <8>\' disk.img 2>/dev/null | head -5`.',
			'Store a different default data mode in the image, then read it back: `tune2fs -o journal_data disk.img` and `dumpe2fs -h disk.img 2>/dev/null | grep \'Default mount\'`.',
			'Make one with no journal: `truncate -s 64M nojournal.img && mke2fs -q -t ext4 -O ^has_journal -F nojournal.img && dumpe2fs -h nojournal.img 2>/dev/null | grep -ic journal`.',
			'On a Linux machine with ext4, compare with the mounted filesystem: `cat /proc/fs/ext4/*/options | grep -E \'^(data=|commit=|auto_da_alloc|delalloc)\'`.'
		],
		done: [
			'Step 2 shows `has_journal` in the features, `Journal inode: 8` and `Total journal size: 4096k`.',
			'Step 3 shows `Inode: 8   Type: regular` with `Size: 4194304`.',
			'Step 4 prints `Default mount options:    journal_data user_xattr acl`.',
			'Step 5 prints `0`, and step 6 prints `delalloc`, `auto_da_alloc`, `commit=5` and `data=ordered`.'
		],
		solution: [
			'The journal is a plain inode, number 8, that ext4 reserves at format time. jbd2 writes metadata changes there before their final place.',
			'`Journal start: 0` in step 2 means the journal is empty: nothing to replay. After a crash, the next mount replays it to the last commit record.',
			'`tune2fs -o` only stores a default in the superblock. Without it, a mount gets `data=ordered`, which is what step 6 shows on a live system.'
		]
	},
	recall: {
		q: 'In ext4\'s default mode, what goes through the journal, and what did `auto_da_alloc` add after the 2009 empty file reports?',
		a: '`data=ordered`: only metadata is journaled, and data blocks are written before their metadata commits. `auto_da_alloc` (default since 2.6.30) flushes a file\'s delayed blocks before a rename or truncate replaces an existing file.'
	},
	sources: [
		{ title: 'Ubuntu bug #317781, Ext4 data loss', url: LP },
		{ title: 'Linux kernel docs, ext4 General Information (mount options, data modes)', url: 'https://docs.kernel.org/admin-guide/ext4.html' },
		{ title: 'Linux kernel docs, ext4 Journal (jbd2)', url: 'https://docs.kernel.org/filesystems/ext4/journal.html' },
		{ title: 'ext4(5)', url: 'https://man7.org/linux/man-pages/man5/ext4.5.html' },
		{ title: 'Linux kernel docs, The SGI XFS Filesystem', url: 'https://docs.kernel.org/admin-guide/xfs.html' },
		{ title: 'Linux commit afd4672, ext4: Add auto_da_alloc mount option', url: 'https://github.com/torvalds/linux/commit/afd4672dc7610b7feef5190168aa917cc2e417e4' }
	]
};
