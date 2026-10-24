const PG = 'https://github.com/postgres/postgres/blob/92d47d544bf64274b6a7aa8775f7b35bcf71f339';
const FD = `${PG}/src/backend/storage/file/fd.c`;
const THREAD = 'https://www.postgresql.org/message-id/flat/CAMsr%2BYHh%2B5Oq4xziwwoEfhoTZgr07vdGG%2Bhu%3D1adXx59aTeaoQ%40mail.gmail.com';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'fsync',
	part: 'Files and disks',
	title: 'fsync and durability',
	minutes: 10,
	hook: [
		'March 28, 2018, pgsql-hackers. Craig Ringer reports a PostgreSQL database corrupted after a storage error on XFS. A background write to disk failed, and at the next checkpoint `fsync()` returned `EIO`. PostgreSQL marked the checkpoint as failed and tried again.',
		'The second `fsync()` succeeded, "because the prior fsync() *cleared the AS_EIO bad page flag*". His summary: "The write never made it to disk, but we completed the checkpoint, and merrily carried on our way. Whoops, data loss."',
		'PostgreSQL had assumed that a successful `fsync` covers "all writes since the last SUCCESSFUL fsync". **On Linux, a second call after a failure can return 0 while the failed pages are already gone.** In November 2018, PostgreSQL started to PANIC on the first `fsync` failure of a data file, back-patched to 9.4.'
	],
	terms: [
		{ term: 'fsync', def: 'The system call that writes a file\'s dirty pages and metadata from the page cache to the device, and returns only when the device reports the transfer complete.' },
		{ term: 'Writeback', def: 'The kernel writing dirty page cache pages to disk in the background, some time after `write(2)` has already returned.' },
		{ term: 'Durable', def: 'Still there after a crash or power loss. Data is durable once an `fsync` on it has returned 0.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['w["write(fd, 8 kB)"] -->|"returns at once"| pc["Page cache: dirty pages"]'],
				highlight: ['w', 'pc'],
				note: '`write(2)` copies the bytes into the page cache and returns before any of them reach the disk. A crash at this point loses the 8 kB, even though `write` reported success.'
			},
			{
				add: ['pc -->|"background writeback"| fail["Disk returns an I/O error"]', 'fail -->|"error recorded, pages marked clean"| gone["The 8 kB now exist nowhere"]'],
				highlight: ['fail', 'gone'],
				note: 'LWN on the Linux behavior in 2018: on a failed write, the kernel "usually includes discarding the data in the affected pages and marking them as being clean". The kernel keeps an error flag on the file, and nobody is told yet.'
			},
			{
				add: ['f1["fsync(fd) at the checkpoint"] -->|"reports the recorded error"| eio["-1, EIO"]'],
				highlight: ['f1', 'eio'],
				note: 'fsync(2) on `EIO`: "Since Linux 4.13, errors from write-back will be reported to all file descriptors that might have written the data which triggered the error." The first `fsync` after the failure gets the error.'
			},
			{
				add: ['f2["fsync(fd) again"] -->|"error already reported"| ok["0, success"]'],
				highlight: ['f2', 'ok'],
				note: 'The PostgreSQL wiki on Linux 4.14 and 4.16+: "you still only get the error once (so retrying fsync() is not OK)". The second call returns 0 and the lost 8 kB stay lost. PostgreSQL now panics instead and replays its WAL, which still holds the change.'
			},
			{
				add: ['tmp["write config.json.tmp, fsync(tmp)"] --> ren["rename(config.json.tmp, config.json)"]', 'ren --> dsync["fsync of the directory"]'],
				highlight: ['tmp', 'ren', 'dsync'],
				note: 'To replace a file safely: write a temp file in the same directory, `fsync` it, then `rename` it over the old name. rename(2): the target "will be atomically replaced, so that there is no point at which another process attempting to access newpath will find it missing".'
			},
			{
				add: ['dsync -->|"directory entry on disk"| done["After a crash: old or new config.json, never a mix"]'],
				highlight: ['done'],
				note: 'fsync(2): "Calling fsync() does not necessarily ensure that the entry in the directory containing the file has also reached disk. For that an explicit fsync() on a file descriptor for the directory is also needed." Without it, the rename itself can be lost in a crash.'
			}
		]
	},
	example: {
		title: 'src/backend/storage/file/fd.c: durable_rename, PostgreSQL\'s fsync, rename, fsync',
		repo: 'postgres/postgres',
		url: `${FD}#L781-L854`,
		lang: 'c',
		code: `int
durable_rename(const char *oldfile, const char *newfile, int elevel)
{
	int			fd;

	/*
	 * First fsync the old and target path (if it exists), to ensure that they
	 * are properly persistent on disk. Syncing the target file is not
	 * strictly necessary, but it makes it easier to reason about crashes;
	 * because it's then guaranteed that either source or target file exists
	 * after a crash.
	 */
	if (fsync_fname_ext(oldfile, false, false, elevel) != 0)
		return -1;
…
	/* Time to do the real deal... */
	if (rename(oldfile, newfile) < 0)
	{
		ereport(elevel,
				(errcode_for_file_access(),
				 errmsg("could not rename file \\"%s\\" to \\"%s\\": %m",
						oldfile, newfile)));
		return -1;
	}

	/*
	 * To guarantee renaming the file is persistent, fsync the file with its
	 * new name, and its containing directory.
	 */
	if (fsync_fname_ext(newfile, false, false, elevel) != 0)
		return -1;

	if (fsync_parent_path(newfile, elevel) != 0)
		return -1;

	return 0;
}`,
		notes: [
			'Line 13 fsyncs the source file before anything else, so its data is on disk before any name points to it. The lines left out open the existing target, if any, and fsync it too.',
			'Line 17 is the `rename(2)` itself. A reader opening `newfile` sees either the old file or the new one at every moment.',
			'Lines 30 and 33 make the rename durable: one `fsync` on the file under its new name, one on the directory that holds the entry. The header comment promises that a crash leaves "either the pre-existing or the moved file in place of the new file; no mixed state or truncated files are possible".',
			'Any `fsync` error here goes through [`data_sync_elevel`](' + FD + '#L4000-L4004), which returns `PANIC` unless `data_sync_retry` is on. Its comment: "A later attempt to fsync again might falsely report success."'
		]
	},
	tradeoff: {
		gain: [
			'Once `fsync` returns 0, the data and the file\'s metadata survive a crash or power loss. fsync(2) includes "writing through or flushing a disk cache if present".',
			'Temp file, `fsync`, `rename`, directory `fsync`: readers never see a half-written file, and after a crash the file is either the old one or the new one.',
			'Panicking on the first `fsync` error lets PostgreSQL redo the lost writes from WAL at restart, instead of finishing a checkpoint over missing pages.'
		],
		cost: [
			'"The call blocks until the device reports that the transfer has completed." Each `fsync` waits for the disk, so a program that calls it on every small write runs at the speed of the device.',
			'A Linux `fsync` reports a writeback error once. An application that retries gets 0 and loses data, so the only safe reaction is to rewrite the data from another copy.',
			'Every durable replace costs two `fsync` calls, one on the file and one on its directory.'
		]
	},
	task: {
		prompt: 'Save this as `save.py` and run `strace -e trace=openat,write,fsync,rename,close python3 save.py` in an empty directory: `import os; tmp = "config.json.tmp"; f = open(tmp, "w"); f.write(\'{"port": 8080}\\n\'); f.flush(); os.fsync(f.fileno()); f.close(); os.rename(tmp, "config.json"); d = os.open(".", os.O_RDONLY); os.fsync(d); os.close(d)`. Map each traced call to a step of the safe replace. Then say what a crash could leave behind without each of the two `fsync` calls.',
		hint: 'Both `fsync` lines use fd 3, but fd 3 is a different file each time. What does each one push to disk: the file\'s bytes, or the directory entry?',
		answer: [
			'Output captured on a laptop for this chapter, after the interpreter\'s own startup calls: `openat(AT_FDCWD, "config.json.tmp", O_WRONLY|O_CREAT|O_TRUNC|O_CLOEXEC, 0666) = 3`, `write(3, "{\\"port\\": 8080}\\n", 15) = 15`, `fsync(3) = 0`, `close(3) = 0`.',
			'Then `rename("config.json.tmp", "config.json") = 0`, `openat(AT_FDCWD, ".", O_RDONLY|O_CLOEXEC) = 3`, `fsync(3) = 0`, `close(3) = 0`. The first `fsync` covers the 15 bytes and the temp file\'s inode; the second covers the directory entry that the rename changed.',
			'Without the first `fsync`, the rename can reach the disk before the data, which is the 0-byte file of the previous chapter. Without the directory `fsync`, a crash can bring back the old `config.json`, as if the rename never happened.'
		],
		steps: [
			{
				title: 'Trace the temp file',
				questions: [
					{ q: 'The first traced call is `openat(..., "config.json.tmp", O_WRONLY|O_CREAT|O_TRUNC|O_CLOEXEC, 0666) = 3`. Which step is that?', options: ['Opening the old `config.json` to read it', 'Creating the temp file in the same directory', 'Opening the directory', 'Locking the config'], answer: 1, why: 'The safe replace starts with a temp file next to the target, so the later `rename` stays on one filesystem.' },
					{ q: '`write(3, ..., 15) = 15` returns. Where are the 15 bytes now?', options: ['On the disk', 'In the journal', 'In the page cache, as dirty pages', 'In the directory entry'], answer: 2, why: '`write(2)` copies the bytes into the page cache and returns before they reach the disk.' },
					{ q: 'Why must the temp file sit in the same directory, not in `/tmp`?', options: ['`rename` cannot move across filesystems', '`/tmp` has no page cache', 'Files in `/tmp` cannot be fsynced', 'Python refuses other paths'], answer: 0, why: '`rename` across filesystems fails with `EXDEV`. The same directory keeps both names on one filesystem.' },
					{ q: 'Why not open `config.json` with `O_TRUNC` and write in place?', options: ['It is slower', 'It needs root', 'It breaks `strace`', 'A crash mid-write leaves an empty or partial file'], answer: 3, why: 'The old content is gone as soon as the truncate lands. The temp file keeps the old one intact until the rename.' }
				]
			},
			{
				title: 'Map the first fsync',
				questions: [
					{ q: 'Which call makes the 15 bytes durable?', options: ['`write(3, ..., 15)`', 'The first `fsync(3) = 0`', '`close(3)`', '`rename`'], answer: 1, why: 'Data is durable once an `fsync` on it has returned 0. `write` and `close` do not wait for the disk.' },
					{ q: 'What does that first `fsync` cover?', options: ['The 15 bytes and the temp file\'s inode', 'The directory entry for `config.json`', 'Every file in the directory', 'Only the file size'], answer: 0, why: 'fsync writes a file\'s dirty pages and its metadata, and returns when the device reports the transfer complete.' },
					{ q: 'If that first `fsync` fails, which later step must the script not run?', options: ['The `close`', 'The second `openat`', 'The `rename`', 'The `strace` itself'], answer: 2, why: 'Renaming would point `config.json` at data that may not be on disk. Stopping before it leaves the old file in place.' },
					{ q: 'Why does `durable_rename` in PostgreSQL fsync the source file first?', options: ['To lock it', 'To check its size', 'To release its page cache', 'So its data is on disk before any name points to it'], answer: 3, why: 'Line 13 fsyncs the old file before the rename, so the new name never points at missing data.' }
				]
			},
			{
				title: 'Map the rename and the second fsync',
				questions: [
					{ q: 'What does `rename("config.json.tmp", "config.json") = 0` give readers?', options: ['The old file or the new one at every moment, never a missing name', 'A short window with no `config.json`', 'A copy of both files', 'A merged file'], answer: 0, why: 'rename(2): the target "will be atomically replaced", with no point where `newpath` is missing.' },
					{ q: 'The next `openat(AT_FDCWD, ".", O_RDONLY|O_CLOEXEC) = 3` opens what?', options: ['The new `config.json`', 'The temp file again', 'The current directory', 'The journal'], answer: 2, why: '`"."` is the directory that holds the entry the rename changed.' },
					{ q: 'Both `fsync` lines use fd 3. Is it the same file?', options: ['Yes: fd 3 always names one file', 'Yes: the kernel reuses the inode', 'No: the second is `config.json`', 'No: fd 3 was closed and reused for the directory'], answer: 3, why: '`close(3)` freed the number, and the next `openat` got it back for `"."`.' },
					{ q: 'What does the second `fsync` cover?', options: ['The directory entry that the rename changed', 'The 15 bytes again', 'The old `config.json` data', 'Nothing: directories cannot be fsynced'], answer: 0, why: 'fsync(2): syncing a file does not ensure its directory entry reached disk. An explicit `fsync` on the directory is needed.' }
				]
			},
			{
				title: 'Say what a crash leaves',
				questions: [
					{ q: 'In the empty directory, drop the first `fsync`. What can a crash leave?', options: ['The old file, always', 'A `config.json` with 0 bytes: the rename landed before the data', 'A file with half old and half new content', 'Two `config.json` files'], answer: 1, why: 'The rename can reach the disk before the data, which is the 0-byte file of the previous chapter. With no old `config.json` to replace, ext4\'s `auto_da_alloc` does not step in.' },
					{ q: 'Now an old `config.json` exists, the filesystem is ext4, and only the first `fsync` is dropped. What still keeps the new data from coming back empty?', options: ['Nothing: a 0-byte file is likely', 'The directory `fsync`', 'ext4\'s `auto_da_alloc`, which flushes before a rename over an existing file', 'The page cache'], answer: 2, why: 'The rename replaces an existing name, so ext4 writes the temp file\'s blocks first. Other filesystems give no such promise.' },
					{ q: 'Keep both. What can a crash leave?', options: ['A 0-byte file', 'Old or new `config.json`, never a mix', 'Always the old file', 'A temp file only'], answer: 1, why: 'Data first, then an atomic rename, then the directory entry on disk. `durable_rename` promises "no mixed state or truncated files".' },
					{ q: 'What does each durable replace cost?', options: ['Nothing extra', 'One `fsync` on the directory only', 'A full `sync` of the disk', 'Two `fsync` calls, each waiting for the device'], answer: 3, why: 'One on the file and one on its directory. "The call blocks until the device reports that the transfer has completed."' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'On Linux, `fsync(fd)` returns -1 with `EIO`. The application calls `fsync(fd)` again and gets 0. Is the data on disk?',
			options: [
				'Yes, the second call wrote the pages that failed the first time',
				'Yes, the kernel retries failed pages until a write succeeds',
				'No, the kernel may have marked the failed pages clean and dropped them',
				'No, because `EIO` means the file was deleted from the disk'
			],
			answer: 2,
			why: 'After a failed writeback, Linux can mark the pages clean and drop them, and it reports the error once. The PostgreSQL wiki: "retrying fsync() is not OK". The data must be rewritten from another copy, such as the WAL.'
		},
		{
			q: 'Which order replaces `config.json` so that a crash leaves either the old or the new file?',
			options: [
				'Open `config.json` with `O_TRUNC`, write, fsync, close',
				'Write `config.json.tmp`, fsync it, rename it to `config.json`, fsync the directory',
				'Write `config.json.tmp`, rename it to `config.json`, fsync `config.json`',
				'Write `/tmp/config.json`, fsync it, rename it into the app directory'
			],
			answer: 1,
			why: '`O_TRUNC` leaves an empty or partial file if the crash comes mid-write. Renaming before the `fsync` can put the name on disk before the data. `rename` cannot move across filesystems (`EXDEV`), so the temp file must sit in the same directory.'
		},
		{
			q: 'A program fsyncs its new file and renames it over the old one, but never fsyncs the directory. The power fails a second later. What can you find after reboot?',
			options: [
				'Always the new file, because the data was fsynced before the rename',
				'Possibly the old file, because the rename may not have reached the disk',
				'A file with half old and half new content',
				'No file at all, because the rename removed the old name first'
			],
			answer: 1,
			why: 'fsync(2) says syncing a file does not ensure its directory entry has reached disk. The rename changed the directory, and that change can be lost. `rename` itself never leaves the name missing or mixed.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Measure what `fsync` costs, and see why a program batches its writes before one `fsync`.',
		steps: [
			'Make a folder on a real disk, not `tmpfs`: `mkdir -p ~/fsync-lab && cd ~/fsync-lab`.',
			'Time 500 small writes with no `fsync`: `python3 -c "import os, time; fd = os.open(\'log.txt\', os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o644); t = time.time(); [os.write(fd, b\'event\\n\') for i in range(500)]; print(\'%.3f s\' % (time.time() - t))"`.',
			'Time the same with one `fsync` after each write: replace the list with `[(os.write(fd, b\'event\\n\'), os.fsync(fd)) for i in range(500)]`.',
			'Time it with all 500 writes, then one `fsync`: go back to the step 2 list and add `os.fsync(fd);` right after it.',
			'On Linux, count the calls: `strace -c -e trace=fsync python3 -c "import os; fd = os.open(\'log.txt\', os.O_WRONLY); [(os.write(fd, b\'event\\n\'), os.fsync(fd)) for i in range(500)]"`.'
		],
		done: [
			'Step 2 prints close to `0.000 s`.',
			'Step 3 takes far longer on the same disk, a large part of a second or more.',
			'Step 4 lands close to step 2.',
			'The `strace -c` table shows 500 `fsync` calls.'
		],
		solution: [
			'`write` only fills the page cache, so step 2 never waits for the disk. Each `fsync` blocks until the device reports the transfer complete, so step 3 runs at the speed of the device.',
			'One `fsync` after many writes makes all of them durable at once, for the price of one wait on the device.',
			'On `tmpfs` all three steps are fast: there is no device to wait for, and nothing survives a reboot anyway.'
		]
	},
	recall: {
		q: 'What did PostgreSQL change in November 2018 after the fsyncgate report, and why does it not just retry `fsync`?',
		a: 'It now PANICs on the first `fsync` failure of a data file (`data_sync_retry` off by default) and replays WAL at restart. Linux can drop the failed pages and report the error only once, so a second `fsync` can return 0 for lost data.'
	},
	sources: [
		{ title: 'pgsql-hackers, PostgreSQL\'s handling of fsync() errors is unsafe and risks data loss at least on XFS (2018)', url: THREAD },
		{ title: 'PostgreSQL wiki, Fsync Errors', url: 'https://wiki.postgresql.org/wiki/Fsync_Errors' },
		{ title: 'LWN, PostgreSQL\'s fsync() surprise', url: 'https://lwn.net/Articles/752063/' },
		{ title: 'PostgreSQL commit 9ccdd7f, PANIC on fsync() failure', url: 'https://github.com/postgres/postgres/commit/9ccdd7f66e3324d2b6d3dec282cfa9ff084083f1' },
		{ title: 'fsync(2)', url: 'https://man7.org/linux/man-pages/man2/fsync.2.html' },
		{ title: 'rename(2)', url: 'https://man7.org/linux/man-pages/man2/rename.2.html' }
	]
};
