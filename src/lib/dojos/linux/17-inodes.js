const LINUX = 'https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a';
const IALLOC = `${LINUX}/fs/ext4/ialloc.c`;
const NAMEI = `${LINUX}/fs/ext4/namei.c`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'inodes',
	part: 'Files and disks',
	title: 'Inodes and links',
	minutes: 10,
	hook: [
		'June 2026, Rancher issue #55479. A Rancher install in Docker stops starting overnight. The Docker daemon logs `mkdir /var/lib/docker/tmp: no space left on device`, but `df -h` shows free space.',
		'`df -i /var/lib/docker` shows `IUse%` at 100. One directory holds 169,582 socket files, and k3s has kept years of `tls-*` folders. Each file and each folder takes one inode, and the filesystem has run out of them.',
		'After the reporter deletes the old `tls-*` folders, inode use drops from 100% to 32% and 6 GB of data is freed. **The disk refused new files while it still had room for their bytes.**'
	],
	terms: [
		{ term: 'Inode', def: 'The record a filesystem keeps for one file: type and mode, owner, size, timestamps, link count and where the data blocks are. It has a number and no name.' },
		{ term: 'Directory entry', def: 'One line in a directory that maps a name to an inode number. `ls -i` prints that number next to the name.' },
		{ term: 'Hard link', def: 'A second directory entry with the same inode number as the first. The inode\'s link count goes up by one.' },
		{ term: 'Symbolic link', def: 'A separate file, with its own inode, whose content is a path string. The kernel follows that path when you open the link.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['touch["echo hello > report.txt"] -->|"free bit in an inode bitmap"| ino["Inode 55646733: mode 0664, uid 1000, size 6, links 1"]', 'dir["Directory entry: report.txt to 55646733"] --> ino'],
				highlight: ['touch', 'ino', 'dir'],
				note: 'ext4 takes a free inode from one block group and writes the metadata there. The ext4 docs say the inode "stores all the metadata pertaining to the file", and the name is in the directory entry. The name `report.txt` lives in the parent directory, next to the number 55646733.'
			},
			{
				add: ['hard["ln report.txt copy.txt"] -->|"same number, links 2"| ino'],
				highlight: ['hard'],
				note: 'link(2) adds a directory entry and allocates no inode. `ls -li` then prints 55646733 for both names, with a link count of 2. link(2): "it is impossible to tell which name was the \'original\'."'
			},
			{
				add: ['soft["ln -s report.txt link.txt"] --> sino["Inode 55646734: symlink, size 10, content report.txt"]', 'sino -.->|"path lookup at open"| dir'],
				highlight: ['soft', 'sino'],
				note: 'A symbolic link uses its own inode, 55646734 here. inode(7): the size of a symlink "is the length of the pathname it contains", and `report.txt` is 10 bytes. The link stores a name, so it can cross filesystems and point at directories.'
			},
			{
				add: ['rm["rm report.txt"] -->|"links 2 to 1"| ino', 'rm -.->|"name gone: dangling"| sino'],
				highlight: ['rm'],
				note: 'unlink(2) removes one name and lowers the link count to 1. `cat copy.txt` still prints `hello`. `cat link.txt` fails with `No such file or directory`, because the path it holds no longer exists.'
			},
			{
				add: ['last["rm copy.txt, no process has it open"] -->|"links 0: inode and blocks freed"| free["Inode back in the bitmap"]'],
				highlight: ['last', 'free'],
				note: 'unlink(2): "If that name was the last link to a file and no processes have the file open, the file is deleted and the space it was using is made available for reuse." Only then does `df -i` show one more free inode.'
			},
			{
				add: ['full["IFree = 0 in every block group"] -->|"open(O_CREAT), mkdir, socket bind"| err["ENOSPC: No space left on device"]'],
				highlight: ['full', 'err'],
				note: 'mke2fs creates one inode per 16384 bytes of disk by default, and the count is fixed at format time. When every inode is used, any call that creates a file fails with `ENOSPC`, whatever `df -h` says about blocks.'
			}
		]
	},
	example: {
		title: 'fs/ext4/ialloc.c: __ext4_new_inode, searching the block groups for a free inode',
		repo: 'torvalds/linux',
		url: `${IALLOC}#L1019-L1118`,
		lang: 'c',
		code: `got_group:
	EXT4_I(dir)->i_last_alloc_group = group;
	err = -ENOSPC;
	if (ret2 == -1)
		goto out;

	/*
	 * Normally we will only go through one pass of this loop,
	 * unless we get unlucky and it turns out the group we selected
	 * had its last inode grabbed by someone else.
	 */
	for (i = 0; i < ngroups; i++, ino = 0) {
		err = -EIO;

		gdp = ext4_get_group_desc(sb, group, &group_desc_bh);
		if (!gdp)
			goto out;

		/*
		 * Check free inodes count before loading bitmap.
		 */
		if (ext4_free_inodes_count(sb, gdp) == 0)
			goto next_group;
…
		ret2 = find_inode_bit(sb, group, inode_bitmap_bh, &ino);
		if (!ret2)
			goto next_group;
…
		ino++;		/* the inode bitmap is zero-based */
		if (!ret2)
			goto got; /* we grabbed the inode! */

next_group:
		if (++group == ngroups)
			group = 0;
	}
	err = -ENOSPC;
	goto out;`,
		notes: [
			'Line 12 loops over every block group of the filesystem, starting from the group the allocator picked. Line 22 reads the group\'s free inode count from its descriptor and skips the group when it is 0, before loading any bitmap.',
			'Line 25 searches the group\'s inode bitmap for a clear bit. A clear bit is an unused slot in that group\'s inode table, and line 31 jumps to `got` to claim it.',
			'Lines 37 and 38 run when no group has a free inode. They return `-ENOSPC`, which errno(3) names "No space left on device". Nothing in this loop looks at free data blocks, so the free bytes in `df -h` do not help.',
			'A hard link never reaches this code. [`__ext4_link`](' + NAMEI + '#L3453-L3488) raises the link count with `ext4_inc_count` and adds a directory entry with `ext4_add_entry`, using the inode that already exists.'
		]
	},
	tradeoff: {
		gain: [
			'ext4 finds an inode from its number alone: the group is `(inode_number - 1) / s_inodes_per_group`, and the offset in that group\'s table is the remainder of the same division.',
			'The default ratio gives plenty of inodes for ordinary files. On a 934 GB root filesystem, `df -i` shows 62,251,008 inodes with 31% used, close to one per 16 KiB.',
			'A hard link costs a directory entry and no inode, and the data stays reachable until the last name is removed.'
		],
		cost: [
			'mke2fs(8): "it is not possible to change this ratio on a file system after it is created". Millions of tiny files, such as the 169,582 sockets in the Rancher report, can use up the inodes first.',
			'Each ext4 inode record is 256 bytes by default, so the inode tables take 256 / 16384, about 1.6% of the disk, used or not.',
			'Hard links stay inside one filesystem (`EXDEV` otherwise) and cannot point at directories. A symbolic link can do both, but it breaks when its target is renamed or removed.'
		]
	},
	task: {
		prompt: 'In an empty directory on ext4, run `echo hello > report.txt`, `ln report.txt copy.txt`, `ln -s report.txt link.txt`, then `ls -li`. Before you look, predict the inode numbers, link counts and the size of `link.txt`. Then run `rm report.txt` and predict what `cat copy.txt` and `cat link.txt` print. Last, run `df -i .` and say how many more files this filesystem can hold.',
		hint: 'Count the inodes: which commands create a new one? A symlink\'s size is the length of the path it stores.',
		answer: [
			'Output captured on an ext4 laptop for this chapter: `55646733 -rw-rw-r-- 2 ... 6 copy.txt`, `55646734 lrwxrwxrwx 1 ... 10 link.txt -> report.txt`, `55646733 -rw-rw-r-- 2 ... 6 report.txt`. Two names share inode 55646733 with link count 2. The symlink has its own inode and a size of 10, the length of `report.txt`.',
			'After `rm report.txt`, `copy.txt` shows link count 1 and `cat copy.txt` prints `hello`. `cat link.txt` prints `No such file or directory`: the symlink still exists, the name it points to does not.',
			'`df -i .` printed `62251008` inodes, `18931731` used, `43319277` free, `31%`. That filesystem can take about 43 million more files, directories, symlinks or sockets, whatever the free bytes.'
		],
		steps: [
			{
				title: 'Count the inodes',
				questions: [
					{ q: 'Which of the three commands allocate a new inode?', options: ['All three', '`echo` and `ln -s`', 'Only `echo`', '`echo` and `ln`'], answer: 1, why: '`echo > report.txt` creates a file. `ln -s` creates a symlink, a separate file with its own inode. `ln` only adds a directory entry.' },
					{ q: 'What inode number will `copy.txt` show?', options: ['The same as `report.txt`', 'The next free number', 'The same as `link.txt`', 'None: hard links have no inode'], answer: 0, why: 'A hard link is a second directory entry with the same inode number as the first.' },
					{ q: 'Where is the name `report.txt` stored?', options: ['In the inode', 'In the data blocks of the file', 'In the parent directory, next to the inode number', 'In the inode bitmap'], answer: 2, why: 'The inode has a number and no name. The directory entry maps the name to that number.' },
					{ q: 'Which of the two names is the original after `ln`?', options: ['`report.txt`, because it came first', '`copy.txt`, because it is newer', 'The one with the lower link count', 'Neither: both entries point at the same inode'], answer: 3, why: 'link(2): "it is impossible to tell which name was the \'original\'."' }
				]
			},
			{
				title: 'Predict the counts',
				questions: [
					{ q: 'What link count does `ls -li` show for `report.txt` and `copy.txt`?', options: ['1 each', '2 each', '3 each', '2 for `report.txt`, 1 for `copy.txt`'], answer: 1, why: 'Both names share one inode, and that inode\'s link count went up by one with `ln`.' },
					{ q: 'Does the symlink raise the link count of `report.txt`?', options: ['Yes, by one', 'Yes, by two', 'No: it has its own inode and stores a path', 'Only while it is open'], answer: 2, why: 'A symlink is a separate file. It holds a path string and never touches the target\'s link count.' },
					{ q: 'What size does `ls -l` show for `link.txt`?', options: ['6, the size of the target', '0', '4096, one block', '10, the length of `report.txt`'], answer: 3, why: 'inode(7): the size of a symlink "is the length of the pathname it contains". `report.txt` is 10 bytes.' },
					{ q: 'What size do `report.txt` and `copy.txt` show?', options: ['6 each: `hello` and a newline', '12: 6 for each name', '6 for one, 0 for the other', '10 each'], answer: 0, why: 'They are the same inode, so the same 6 bytes. Two names do not double the data.' }
				]
			},
			{
				title: 'Predict the rm',
				questions: [
					{ q: 'After `rm report.txt`, what link count does `copy.txt` show?', options: ['0', '2', '1', 'It is gone'], answer: 2, why: 'unlink(2) removes one name and lowers the link count by one.' },
					{ q: 'What does `cat copy.txt` print?', options: ['`hello`', 'Nothing: the file is empty', '`No such file or directory`', 'Random bytes from freed blocks'], answer: 0, why: 'The inode still has one link, so its blocks are still there.' },
					{ q: 'What does `cat link.txt` print?', options: ['`hello`, through `copy.txt`', 'An empty line', '`Permission denied`', '`No such file or directory`'], answer: 3, why: 'The symlink still exists, but the path it holds, `report.txt`, does not. It is dangling.' },
					{ q: 'When does the inode go back to the bitmap?', options: ['Now: one name is gone', 'When the link count reaches 0 and no process has the file open', 'At the next reboot', 'When `fsck` runs'], answer: 1, why: 'unlink(2): the file is deleted only when the last link is gone and no process has it open.' }
				]
			},
			{
				title: 'Read df -i',
				questions: [
					{ q: '`df -i .` shows `62251008` inodes, `18931731` used. About how many more files fit?', options: ['About 18 million', 'About 62 million', 'About 43 million', 'It depends on the free bytes'], answer: 2, why: '62251008 − 18931731 = 43319277 free inodes, one per new file.' },
					{ q: 'Which of these also uses up one of those inodes?', options: ['A new directory, symlink or socket', 'A new hard link', 'Writing more bytes to an existing file', 'Reading a file'], answer: 0, why: 'Every file, directory, symlink and socket needs an inode. A hard link reuses one.' },
					{ q: 'Can you add inodes to this ext4 filesystem later?', options: ['Yes, with `df -i --grow`', 'Yes, they grow with the free bytes', 'Only by deleting directories', 'No: the count is fixed at mkfs time'], answer: 3, why: 'mke2fs(8): "it is not possible to change this ratio on a file system after it is created".' },
					{ q: 'All inodes are used and `df -h` shows 40% free. What does `touch new` print?', options: ['Nothing: it succeeds', '`No space left on device`', '`Too many open files`', '`Read-only file system`'], answer: 1, why: '`__ext4_new_inode` returns `-ENOSPC` when no block group has a free inode. It never looks at free data blocks.' }
				]
			}
		]
	},
	quiz: [
		{
			q: '`touch /data/x` fails with `No space left on device`, and `df -h /data` shows 40% used. What do you check next?',
			options: [
				'`df -i /data`, because each new file needs a free inode',
				'`free -h`, because the page cache may be full',
				'`ulimit -n`, because the shell may have too many open files',
				'`dmesg`, because the disk may be mounted read-only'
			],
			answer: 0,
			why: 'ext4 returns `ENOSPC` from `__ext4_new_inode` when no block group has a free inode, whatever the free blocks. open(2) reports too many open files as `EMFILE` and a read-only filesystem as `EROFS`, and `free -h` is about RAM.'
		},
		{
			q: 'Two names in `ls -li` show the same inode number and a link count of 2. You run `rm` on one of them. What happens to the data?',
			options: [
				'It is deleted, and the other name now points to freed blocks',
				'It stays: the inode drops to 1 link and the other name still reads it',
				'It moves to the other name, which gets a new inode number',
				'It stays only if the other name was created first'
			],
			answer: 1,
			why: 'unlink(2) removes one directory entry and lowers the link count. The inode and its blocks are freed only when the count reaches 0 and no process has the file open. link(2) says neither name is the original.'
		},
		{
			q: 'You need a second path to `/etc/app/config.yaml` from `/home/me/`, which is on another filesystem. Which works, and why?',
			options: [
				'A hard link, because it copies the inode to the other filesystem',
				'A hard link, because inode numbers are unique on the machine',
				'A symbolic link, because it stores the path and not an inode number',
				'Neither, because links only work inside one directory'
			],
			answer: 2,
			why: 'A directory entry holds an inode number, and inode numbers are unique only inside one filesystem, so link(2) fails with `EXDEV`. A symlink holds the path string `/etc/app/config.yaml` and the kernel resolves it at open time.'
		}
	],
	lab: {
		minutes: 10,
		goal: 'Run a filesystem out of inodes while it still has free bytes, and get `No space left on device`.',
		steps: [
			'Start a container with a small `tmpfs` that has room for 10 MB but only 200 inodes: `docker run --rm -it --tmpfs /small:size=10m,nr_inodes=200 alpine sh`.',
			'Inside it, go there and read both views: `cd /small && df -i . && df -h .`.',
			'Create empty files until it refuses: `i=0; while touch f$i 2>/dev/null; do i=$((i+1)); done; echo $i`.',
			'Read both views again, then try one more: `df -i . && df -h . && touch extra`.',
			'Remove one file and try again: `rm f1 && touch extra && echo ok`. Then `exit`.'
		],
		done: [
			'Step 3 prints 199: the directory itself took the first inode.',
			'Step 4 shows `Use%` at 100% in `df -i` and 0% in `df -h`, then `touch: extra: No space left on device`.',
			'Step 5 prints `ok`.'
		],
		solution: [
			'Empty files take no data blocks, so `df -h` never moves. Each one still takes an inode, and the 200 run out.',
			'The error is `ENOSPC`, the same as a full disk. Only `df -i` tells the two apart.',
			'Removing the last name of a file that no process has open frees its inode, so one more file fits.'
		]
	},
	recall: {
		q: 'Why can `df -h` show free space while creating a file fails with `ENOSPC`, and which command shows it?',
		a: 'Every file, directory, symlink and socket needs an inode, and ext4 fixes the inode count at mkfs time, one per 16384 bytes by default. `df -i` shows `IUse%`, which was 100 in the Rancher report.'
	},
	sources: [
		{ title: 'Rancher issue #55479, inodes exhausted by tls folders and sockets', url: 'https://github.com/rancher/rancher/issues/55479' },
		{ title: 'inode(7)', url: 'https://man7.org/linux/man-pages/man7/inode.7.html' },
		{ title: 'link(2)', url: 'https://man7.org/linux/man-pages/man2/link.2.html' },
		{ title: 'unlink(2)', url: 'https://man7.org/linux/man-pages/man2/unlink.2.html' },
		{ title: 'symlink(7)', url: 'https://man7.org/linux/man-pages/man7/symlink.7.html' },
		{ title: 'mke2fs(8)', url: 'https://man7.org/linux/man-pages/man8/mke2fs.8.html' },
		{ title: 'e2fsprogs, misc/mke2fs.conf.in (inode_ratio = 16384)', url: 'https://github.com/tytso/e2fsprogs/blob/8fd79523d051d5ea881237f27eb1c664486e0078/misc/mke2fs.conf.in#L1-L8' },
		{ title: 'Linux kernel docs, ext4 Index Nodes', url: 'https://docs.kernel.org/filesystems/ext4/inodes.html' },
		{ title: 'Linux kernel docs, ext4 Directory Entries', url: 'https://docs.kernel.org/filesystems/ext4/directory.html' }
	]
};
