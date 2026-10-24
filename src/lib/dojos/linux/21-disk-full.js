const LINUX = 'https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a';
const BALLOC = `${LINUX}/fs/ext4/balloc.c`;
const SUPER = `${LINUX}/fs/ext4/super.c`;
const MAN = 'https://man7.org/linux/man-pages';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'disk-full',
	part: 'Files and disks',
	title: 'A full disk with free space',
	minutes: 10,
	hook: [
		'A process holds a 500 MB file on `/dev/shm` open for writing. You run `rm big.log`. `ls` says the file is gone and `du -sh /dev/shm` prints `248K`, yet `df -h` still prints `501M` used. These lines come from a test run for this chapter on Linux 6.17.',
		'unlink(2) explains it: "If the name was the last link to a file but any processes still have the file open, the file will remain in existence until the last file descriptor referring to it is closed." `rm` removed the name. **The blocks stay used until the process closes the file.**',
		'Two more cases print `No space left on device` while some space looks free. The filesystem can run out of inodes, or only the space reserved for root is left. On the same laptop, `df` on a 934 GB ext4 root prints `568G` used and `319G` available: the 47 GB gap matches the default 5% reserve.'
	],
	terms: [
		{ term: 'ENOSPC', def: 'The error code a system call returns when the device has no room. Its message is `No space left on device`. `write` returns it when blocks run out, `open` when a new file cannot be created.' },
		{ term: 'Link count', def: 'The number of directory entries (names) that point to an inode. `rm` lowers it by one. The kernel frees the inode and its blocks when the count is 0 and no process has the file open.' },
		{ term: 'Reserved blocks', def: 'A share of an ext4 filesystem that only root (or the user and group set with `tune2fs -u` and `-g`) may allocate. `mke2fs` sets it to 5% by default.' },
		{ term: 'Inode', def: 'The record that holds a file\'s metadata: its owner, its mode, its link count. ext4 creates a fixed number of them at `mke2fs` time, so a disk can run out of inodes with gigabytes still free.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['app["App calls write() or open()"] --> err["Kernel returns ENOSPC: No space left on device"]'],
				highlight: ['app', 'err'],
				note: 'write(2) returns `ENOSPC` when "The device containing the file referred to by fd has no room for the data". open(2) returns it when a new file is needed and the device "has no room for the new file". Both print the same message. The next three steps tell the causes apart with `df -h`, `du` and `df -i`.'
			},
			{
				add: ['err --> held["df shows full, du adds up to much less"]', 'held -->|"lsof +L1"| fd["A process still has a deleted file open"]'],
				highlight: ['held', 'fd'],
				note: '`df` asks the filesystem how many blocks are used, and `du` walks the directory tree. A deleted file that is still open has no name left, so `du` cannot see it. lsof(8) says `+L1` will "select open files that have been unlinked". In the test run it printed `sleep 4049392 lea 3w REG 0,28 524288000 0 3835 /dev/shm/big.log (deleted)`: 524,288,000 bytes, link count 0.'
			},
			{
				add: ['err --> rsv["df shows Avail 0 and Use 100%, but Size minus Used is 5%"]', 'rsv --> root["Only root or CAP_SYS_RESOURCE may use the reserve"]'],
				highlight: ['rsv', 'root'],
				note: 'ext4 hides the reserve from `Avail`: it reports free blocks minus the reserved count. A process running as `postgres` or `www-data` gets `ENOSPC` when that number hits 0. A process running as root can still write into the 5%. tune2fs(8) keeps it "to allow system daemons, such as syslogd(8), to continue to function correctly after non-privileged processes are prevented from writing to the file system".'
			},
			{
				add: ['err --> ino["df -h shows space, df -i shows IUse 100%"]', 'ino --> fixed["Inode count fixed at mke2fs time"]'],
				highlight: ['ino', 'fixed'],
				note: 'Each file and directory takes one inode. `mke2fs` creates one inode per `inode_ratio` bytes, 16384 by default in `/etc/mke2fs.conf`. The test laptop\'s 1 TB root has 62,251,008 inodes, one per 16 KiB. Millions of small files (a cache, a mail queue, session files) use them up first. mke2fs(8) warns: "it is not possible to change this ratio on a file system after it is created".'
			},
			{
				add: ['fd --> fix1["Restart or signal the process to reopen its log, or truncate /proc/PID/fd/N"]', 'root --> fix2["Free space, or lower the reserve with tune2fs -m"]', 'fixed --> fix3["Delete small files, or rebuild with mke2fs -i or -N"]'],
				highlight: ['fix1', 'fix2', 'fix3'],
				note: 'In the test run, `: > /proc/4049392/fd/3` cut the deleted file to 0 bytes and `df` dropped from `501M` to `248K` used, with the process still running. logrotate\'s `copytruncate` truncates the log in place for a program that "cannot be told to close its logfile". `tune2fs -m 1` keeps 1% instead of 5% on a data disk.'
			}
		]
	},
	example: {
		title: 'fs/ext4/balloc.c: who may allocate the reserved blocks',
		repo: 'torvalds/linux',
		url: `${BALLOC}#L620-L676`,
		lang: 'c',
		code: `static int ext4_has_free_clusters(struct ext4_sb_info *sbi,
				  s64 nclusters, unsigned int flags)
{
	s64 free_clusters, dirty_clusters, rsv, resv_clusters;
	struct percpu_counter *fcc = &sbi->s_freeclusters_counter;
	struct percpu_counter *dcc = &sbi->s_dirtyclusters_counter;

	free_clusters  = percpu_counter_read_positive(fcc);
	dirty_clusters = percpu_counter_read_positive(dcc);
	resv_clusters = atomic64_read(&sbi->s_resv_clusters);

	/*
	 * r_blocks_count should always be multiple of the cluster ratio so
	 * we are safe to do a plane bit shift only.
	 */
	rsv = (ext4_r_blocks_count(sbi->s_es) >> sbi->s_cluster_bits) +
	      resv_clusters;
…
	/* Check whether we have space after accounting for current
	 * dirty clusters & root reserved clusters.
	 */
	if (free_clusters >= (rsv + nclusters + dirty_clusters))
		return 1;

	/* Hm, nope.  Are (enough) root reserved clusters available? */
	if (uid_eq(sbi->s_resuid, current_fsuid()) ||
	    (!gid_eq(sbi->s_resgid, GLOBAL_ROOT_GID) && in_group_p(sbi->s_resgid)) ||
	    capable(CAP_SYS_RESOURCE) ||
	    (flags & EXT4_MB_USE_ROOT_BLOCKS)) {

		if (free_clusters >= (nclusters + dirty_clusters +
				      resv_clusters))
			return 1;
	}
	/* No free blocks. Let's see if we can dip into reserved pool */
	if (flags & EXT4_MB_USE_RESERVED) {
		if (free_clusters >= (nclusters + dirty_clusters))
			return 1;
	}

	return 0;
}
…
int ext4_claim_free_clusters(struct ext4_sb_info *sbi,
			     s64 nclusters, unsigned int flags)
{
	if (ext4_has_free_clusters(sbi, nclusters, flags)) {
		percpu_counter_add(&sbi->s_dirtyclusters_counter, nclusters);
		return 0;
	} else
		return -ENOSPC;
}`,
		notes: [
			'Line 16 builds `rsv`: the reserved block count from the superblock (the number `tune2fs -m` or `-r` sets), plus `s_resv_clusters`. The kernel ext4 docs set that second pool to "2% or 4096 clusters, whichever is smaller". Without the `bigalloc` feature, one cluster is one block.',
			'Line 22 is the normal case: there are enough free clusters left after the reserve and the clusters already promised to dirty pages. If not, lines 26 to 29 let the request into the reserve only for the reserve UID (root by default), a member of a reserve group set with `tune2fs -g`, a process with `CAP_SYS_RESOURCE`, or a kernel caller passing `EXT4_MB_USE_ROOT_BLOCKS`.',
			'Line 51 is where a full disk reaches user space: `ext4_claim_free_clusters` returns `-ENOSPC`, and the `write` call fails with `No space left on device`.',
			'`df` reads its `Avail` column from the `f_bavail` field of statfs(2), "Free blocks available to unprivileged user". In [`ext4_statfs`](' + SUPER + '#L6815-L6818), ext4 fills it with free blocks minus the reserve, and with 0 when the reserve is all that is left.'
		]
	},
	tradeoff: {
		gain: [
			'Root daemons keep writing logs after an unprivileged process has filled the disk, so you can still log in and read why.',
			'A deleted file stays readable for the processes that have it open: a running program whose binary or log is replaced keeps working.',
			'`df -i` gives an early warning: inode use is a separate number you can alert on, like block use.'
		],
		cost: [
			'5% of a 1 TB data disk is about 50 GB that a database running as a non-root user never gets to use.',
			'Space held by a deleted open file is invisible to `du` and to `ls`. You need `lsof +L1` or a look through `/proc/<pid>/fd` to find it.',
			'The ext4 inode count is fixed at creation. A filesystem full of small files needs to be rebuilt with a smaller `-i` ratio, or the files moved.'
		]
	},
	task: {
		prompt: 'Reproduce the hook without root, on `/dev/shm`: create a 500 MB file, keep it open in the background with `(exec 3>>/dev/shm/big.log; sleep 300) &`, then delete it. Check `du -sh /dev/shm` and `df -h /dev/shm`. Find the file with `lsof +L1` and give the space back without killing the process.',
		hint: '`head -c 500M /dev/zero > /dev/shm/big.log` creates the file. lsof prints the PID and the file descriptor (`3w`). The file is still reachable as `/proc/<pid>/fd/3`.',
		answer: [
			'After `rm`, `du -sh /dev/shm` prints `248K` and `df -h /dev/shm` still prints `501M` used: the name is gone, the inode and its blocks are not.',
			'`lsof +L1` prints one line ending in `/dev/shm/big.log (deleted)`, with SIZE `524288000`, NLINK `0` and FD `3w` (descriptor 3, open for writing). The COMMAND is `sleep`, which inherited descriptor 3 from the subshell.',
			'`: > /proc/<pid>/fd/3` truncates the file through the open descriptor. `df -h` drops to `248K` used while `sleep` still runs, and lsof now shows SIZE `0`.',
			'On a real server the holder is often a daemon whose log was deleted by hand. Restarting it, or sending the signal it uses to reopen logs, closes the old descriptor and frees the blocks.'
		],
		steps: [
			{
				title: 'Set up the held file',
				questions: [
					{ q: 'Why does the task use `/dev/shm`?', options: ['It is the only place `rm` keeps the blocks', 'You can write there without root', 'It has no inodes, so only blocks count', 'It never appears in `df`'], answer: 1, why: 'The prompt asks to reproduce the hook without root. `/dev/shm` is writable by any user, so you can fill it and delete from it yourself.' },
					{ q: 'Which command creates the 500 MB file?', options: ['`touch -s 500M /dev/shm/big.log`', '`du -c 500M /dev/shm/big.log`', '`head -c 500M /dev/zero > /dev/shm/big.log`', '`df --create 500M /dev/shm/big.log`'], answer: 2, why: '`head -c 500M` copies 500 MB of zeros from `/dev/zero` into the new file.' },
					{ q: 'What does `(exec 3>>/dev/shm/big.log; sleep 300) &` do?', options: ['Opens the file on descriptor 3 and keeps it open while `sleep` runs', 'Writes the file 3 times, then waits 300 seconds', 'Locks the file so `rm` cannot delete it', 'Copies the file to descriptor 3 and closes it'], answer: 0, why: '`exec 3>>` opens the file for appending on descriptor 3. `sleep` inherits it and holds it open for 300 seconds.' },
					{ q: 'You now run `rm /dev/shm/big.log`. What did `rm` remove?', options: ['The inode and all its blocks', 'Only the blocks, the name stays', 'The open descriptor in the process', 'The name, which lowers the link count to 0'], answer: 3, why: '`rm` removes a directory entry. unlink(2) says the file "will remain in existence until the last file descriptor referring to it is closed".' }
				]
			},
			{
				title: 'Compare du and df',
				questions: [
					{ q: 'After `rm`, what does `du -sh /dev/shm` print in the test run?', options: ['`501M`', '`248K`', '`0`', '`500M`'], answer: 1, why: '`du` walks the directory tree. The file has no name left, so `du` cannot count it.' },
					{ q: 'And `df -h /dev/shm`?', options: ['Still `501M` used', '`248K` used, like `du`', 'An error, since the file is gone', '`0` used and 100% free'], answer: 0, why: '`df` asks the filesystem how many blocks are used. The blocks are still allocated to the open inode.' },
					{ q: 'Why do `du` and `df` disagree?', options: ['`df` caches its numbers for a few minutes', '`du` rounds small files down to zero', '`df` counts used blocks, `du` only counts files it can reach by name', '`du` skips files owned by other users'], answer: 2, why: 'A deleted file that is still open has blocks but no name. Only `df` sees it.' },
					{ q: 'Running `sync` now would...', options: ['Free the 500 MB at once', 'Change nothing: the process still holds the file', 'Make `du` show 501M too', 'Close descriptor 3 in `sleep`'], answer: 1, why: 'The space is held by an open descriptor, not by pending writes. Only closing or truncating the file gives it back.' }
				]
			},
			{
				title: 'Find the holder',
				questions: [
					{ q: 'Which command lists open files that have been deleted?', options: ['`df -i`', '`du --deleted`', '`ls -la /dev/shm`', '`lsof +L1`'], answer: 3, why: 'lsof(8) says `+L1` will "select open files that have been unlinked": link count below 1.' },
					{ q: 'The lsof line ends in `/dev/shm/big.log (deleted)`. What does NLINK `0` tell you?', options: ['No name points to the inode any more', 'The file is empty', 'No process has the file open', 'The file is a hard link'], answer: 0, why: 'NLINK is the link count. 0 means `rm` removed the last name, and only the open descriptor keeps the inode alive.' },
					{ q: 'The COMMAND column says `sleep`, not `bash`. Why?', options: ['`sleep` opened the file itself', 'lsof always shows the youngest process', '`sleep` inherited descriptor 3 from the subshell', 'The subshell renamed itself to `sleep`'], answer: 2, why: 'A child gets copies of its parent\'s descriptors. The subshell opened descriptor 3, then `sleep` inherited it.' },
					{ q: 'The FD column says `3w`. What does it mean?', options: ['3 writers share the file', 'Descriptor 3, open for writing', 'The file was written 3 times', 'Descriptor 3 is waiting on a lock'], answer: 1, why: 'lsof prints the descriptor number, then the access mode: `w` for write.' }
				]
			},
			{
				title: 'Give the space back',
				questions: [
					{ q: 'How do you free the blocks without killing `sleep`?', options: ['`: > /proc/<pid>/fd/3`', '`rm /proc/<pid>/fd/3`', '`touch /dev/shm/big.log`', '`kill -STOP <pid>`'], answer: 0, why: 'The file is still reachable as `/proc/<pid>/fd/3`. Truncating it through that path frees the blocks while the descriptor stays open.' },
					{ q: 'After the truncate, what does `df -h /dev/shm` show?', options: ['Still `501M` used until `sleep` exits', '`248K` used', 'An error: the descriptor is closed', '`0` used'], answer: 1, why: 'In the test run `df` dropped to `248K` used with the process still running, and lsof showed SIZE `0`.' },
					{ q: 'On a real server, a daemon holds a log someone deleted by hand. What is the usual fix?', options: ['Run `fsck` to reclaim orphaned blocks', 'Delete the rotated `.gz` logs next to it', 'Wait for the next reboot', 'Restart it, or send the signal that makes it reopen its logs'], answer: 3, why: 'Closing the old descriptor frees the blocks. A reopen signal does it without downtime.' },
					{ q: 'A program cannot be told to close its log. Which logrotate option fits?', options: ['`compress`', '`copytruncate`', '`delaycompress`', '`missingok`'], answer: 1, why: '`copytruncate` copies the log and truncates it in place, for a program that "cannot be told to close its logfile".' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'You delete a 20 GB log file that nginx is still writing to. `df` still shows the disk full. What frees the space?',
			options: [
				'Running `sync` so the deletion is flushed from the page cache',
				'Making nginx close the file, by reopening its logs or restarting',
				'Running `fsck` on the filesystem to reclaim the orphaned blocks',
				'Deleting the rotated `.gz` logs next to it to make room'
			],
			answer: 1,
			why: 'unlink removes the name, but the inode and its blocks live until the last open descriptor is closed. nginx still holds one, so the space comes back only when it closes the file.'
		},
		{
			q: 'An app running as user `app` gets `No space left on device`. `df -h` prints Size 1.0T, Used 950G, Avail 0, Use 100%. Why can it not use the last 50 GB?',
			options: [
				'The journal takes the last 5% and is never shown in df',
				'The disk has run out of inodes, which df -h reports as Avail 0',
				'ext4 keeps about 5% for root, and Avail leaves those blocks out',
				'The page cache holds 50 GB of dirty data not yet written out'
			],
			answer: 2,
			why: 'ext4 reports `f_bavail` as free blocks minus the reserved count. `ext4_has_free_clusters` lets only the reserve UID or GID, or a process with `CAP_SYS_RESOURCE`, allocate from the reserve.'
		},
		{
			q: '`df -h /var` shows 40% used, but `touch /var/spool/x` fails with `No space left on device`. Which command confirms the cause?',
			options: [
				'`df -i /var`, to see whether every inode is in use',
				'`du -sh /var`, to compare with what df reports',
				'`lsof +L1 /var`, to find deleted files still open',
				'`tune2fs -m 0`, to release the reserved blocks'
			],
			answer: 0,
			why: 'Creating a file needs a free inode, and open(2) returns ENOSPC when the device "has no room for the new file". With 60% of the blocks free, a deleted open file or the reserve cannot explain it. `df -i` shows IUse 100%.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'See the two other `No space left on device` causes: running out of inodes, and the root reserve.',
		steps: [
			'Start a container with a tiny tmpfs that allows only 200 inodes: `docker run --rm -it --tmpfs /data:size=10m,nr_inodes=200 alpine:3.20 sh`.',
			'Inside, check both numbers: `df -h /data` and `df -i /data`.',
			'Fill the inodes with empty files: `i=0; while touch /data/f$i 2>/dev/null; do i=$((i+1)); done; echo $i`. Then try `touch /data/x`, and run `df -h /data` and `df -i /data` again. Leave with `exit`.',
			'Back on your laptop, in a scratch folder, make a 100 MB ext4 image (no root needed, nothing is mounted): `truncate -s 100M disk.img && mkfs.ext4 -q -F disk.img`.',
			'Read the reserve with `tune2fs -l disk.img | grep -E "^(Block count|Reserved block count)"`, lower it with `tune2fs -m 1 disk.img`, read it again, then `rm disk.img`. On some distros `tune2fs` lives in `/usr/sbin`, so call it by that path if it is not found.'
		],
		done: [
			'`touch /data/x` fails with `No space left on device` while `df -h /data` still shows the 10 MB free.',
			'`df -i /data` shows all 200 inodes used, 100%.',
			'The image reports `Reserved block count: 1280` out of `Block count: 25600` (5%), then 256 after `tune2fs -m 1`.'
		],
		solution: [
			'The loop stops at 199 files: the root directory of `/data` takes the 200th inode.',
			'Empty files use no blocks, only inodes, which is why `df -h` stays at 0 used. `df -i` is the only command that shows the cause.',
			'1280 is 5% of 25600, the `mke2fs` default. `tune2fs -m 1` sets it to 1%, the change you would make on a data disk where no root daemon needs the room.'
		]
	},
	recall: {
		q: 'You deleted a big log, `du` adds up to much less than `df`, and the disk is still full. Where is the space, and which command finds it?',
		a: 'A process still has the deleted file open, so its blocks stay used until the last descriptor closes. `lsof +L1` lists open files with link count 0, marked `(deleted)`.'
	},
	sources: [
		{ title: 'unlink(2), Linux manual page', url: `${MAN}/man2/unlink.2.html` },
		{ title: 'lsof(8), Linux manual page', url: `${MAN}/man8/lsof.8.html` },
		{ title: 'tune2fs(8), Linux manual page', url: `${MAN}/man8/tune2fs.8.html` },
		{ title: 'mke2fs(8), Linux manual page', url: `${MAN}/man8/mke2fs.8.html` },
		{ title: 'statfs(2), Linux manual page', url: `${MAN}/man2/statfs.2.html` },
		{ title: 'logrotate(8), Linux manual page', url: `${MAN}/man8/logrotate.8.html` },
		{ title: 'Linux v6.12, Documentation/admin-guide/ext4.rst', url: `${LINUX}/Documentation/admin-guide/ext4.rst` }
	]
};
