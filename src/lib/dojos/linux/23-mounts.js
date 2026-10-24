const LINUX = 'https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a';
const EXEC = `${LINUX}/fs/exec.c`;
const NAMEI = `${LINUX}/fs/namei.c`;
const MAN = 'https://man7.org/linux/man-pages';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'mounts',
	part: 'Files and disks',
	title: 'Mounts and mount options',
	minutes: 10,
	hook: [
		'In a test container for this chapter, `/scratch` is a tmpfs mounted with `noexec`. `ls -l` shows `/scratch/hello.sh` as `-rwxr-xr-x`. Running `/scratch/hello.sh` prints `Permission denied` and bash exits with 126. Running `sh /scratch/hello.sh` prints `hello`.',
		'The file mode allows execution, and the mount forbids it. mount(8) defines `noexec` as "Do not permit direct execution of any binaries on the mounted filesystem". **At `execve` time, the kernel checks the mount flags as well as the file mode.** `sh` reads the script as plain data, which `noexec` does not block.',
		'The same container shows `nosuid` at work. A copy of `/usr/bin/id` with the setuid bit, run as user `nobody`, prints `euid=0(root)` from a normal tmpfs and no `euid` at all from a tmpfs mounted with `nosuid`.'
	],
	terms: [
		{ term: 'Mount', def: 'Attaching a filesystem to a directory, the mount point. After `mount /dev/sdb1 /data`, paths under `/data` lead into that filesystem. `findmnt` lists every mount with its options.' },
		{ term: 'Mount option', def: 'A flag set on one mount, such as `ro`, `noexec`, `nosuid` or `nodev`. The kernel checks it on each access through that mount. Two mounts of the same filesystem can have different options.' },
		{ term: 'Bind mount', def: 'A second mount of a directory that is already mounted, created with `mount --bind olddir newdir`. Both paths show the same files.' },
		{ term: 'Propagation', def: 'Whether a mount or unmount under one mount point is repeated in other mount namespaces. The types are shared, slave, private and unbindable.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['fstab["/etc/fstab: UUID=0f22... / ext4 noatime,errors=remount-ro 0 1"] --> boot["Mounted at boot with these options"]'],
				highlight: ['fstab', 'boot'],
				note: 'Each fstab line has six fields: the device, the mount point, the type, the options, a dump flag and the fsck order. That line comes from the test laptop: the root filesystem, mounted with `noatime`, checked first (`1`). fstab(5) adds that on systemd-based systems, "it\'s recommended to use systemctl daemon-reload after fstab modification".'
			},
			{
				add: ['boot --> opts["Each mount has its own flags: /run is rw,nosuid,nodev,noexec"]'],
				highlight: ['opts'],
				note: 'On the test laptop, `findmnt --target /run` shows the options `rw,nosuid,nodev,noexec,relatime,size=2836536k,mode=755,inode64`. `nodev` means "Do not interpret character or block special devices on the filesystem". These flags belong to the mount, so `findmnt` shows them per mount point.'
			},
			{
				add: ['opts --> ex["execve(/scratch/hello.sh)"]', 'ex -->|"path_noexec: MNT_NOEXEC set"| eacces["EACCES: Permission denied, bash exit 126"]'],
				highlight: ['ex', 'eacces'],
				note: 'execve(2) lists "EACCES The filesystem is mounted noexec." bash(1): "If a command is found but is not executable, the return status is 126." `sh hello.sh` works because `execve` runs `/bin/sh`, which lives on the root mount, and `sh` then opens the script with a plain `read`.'
			},
			{
				add: ['opts --> suid["execve of a setuid file on a nosuid mount"]', 'suid -->|"mnt_may_suid is false"| plain["Runs with the caller\'s UID: no euid=0"]'],
				highlight: ['suid', 'plain'],
				note: 'mount(8): `nosuid` means "Do not honor set-user-ID and set-group-ID bits or file capabilities when executing programs from this filesystem." The program still runs, as the user who started it. On the test laptop, `/dev/shm` and `/run` are mounted `nosuid`: a user who can write there cannot plant a working setuid root binary.'
			},
			{
				add: ['bind["mount --bind /scratch /ro"] --> rob["mount -o remount,bind,ro /ro"]', 'rob --> two["/ro is read-only, /scratch is still writable"]'],
				highlight: ['bind', 'rob', 'two'],
				note: 'mount(8): "After this call the same contents are accessible in two places." In the test container, `touch /ro/x` failed with `Read-only file system`, `touch /scratch/y` worked, and `ls /ro` then listed `y`. The `ro` flag sits on the `/ro` mount only, and the superblock stays writable.'
			},
			{
				add: ['two --> prop["Propagation: shared on most systems, private after unshare"]'],
				highlight: ['prop'],
				note: 'mount_namespaces(7): "systemd(1) automatically remounts all mounts as MS_SHARED on system startup." A mount made under a shared mount is repeated under every other mount of its peer group, in other namespaces too. On the test laptop, `findmnt` shows `shared` in the PROPAGATION column for `/`. unshare(1) does the reverse and runs the equivalent of `mount --make-rprivate /` in the new namespace.'
			}
		]
	},
	example: {
		title: 'fs/exec.c: do_open_execat refuses a file on a noexec mount',
		repo: 'torvalds/linux',
		url: `${EXEC}#L884-L916`,
		lang: 'c',
		code: `static struct file *do_open_execat(int fd, struct filename *name, int flags)
{
	struct file *file;
	struct open_flags open_exec_flags = {
		.open_flag = O_LARGEFILE | O_RDONLY | __FMODE_EXEC,
		.acc_mode = MAY_EXEC,
		.intent = LOOKUP_OPEN,
		.lookup_flags = LOOKUP_FOLLOW,
	};

	if ((flags & ~(AT_SYMLINK_NOFOLLOW | AT_EMPTY_PATH)) != 0)
		return ERR_PTR(-EINVAL);
	if (flags & AT_SYMLINK_NOFOLLOW)
		open_exec_flags.lookup_flags &= ~LOOKUP_FOLLOW;
	if (flags & AT_EMPTY_PATH)
		open_exec_flags.lookup_flags |= LOOKUP_EMPTY;

	file = do_filp_open(fd, name, &open_exec_flags);
	if (IS_ERR(file))
		return file;

	/*
	 * In the past the regular type check was here. It moved to may_open() in
	 * 633fb6ac3980 ("exec: move S_ISREG() check earlier"). Since then it is
	 * an invariant that all non-regular files error out before we get here.
	 */
	if (WARN_ON_ONCE(!S_ISREG(file_inode(file)->i_mode)) ||
	    path_noexec(&file->f_path)) {
		fput(file);
		return ERR_PTR(-EACCES);
	}

	return file;`,
		notes: [
			'`execve` reaches this function through `alloc_bprm`. Line 6 opens the file with `MAY_EXEC`. Inside `do_filp_open` (line 18), [`may_open`](' + NAMEI + '#L3359-L3364) returns `-EACCES` for a regular file when `path_noexec()` is true, then checks the file\'s `x` bits.',
			'Lines 27 and 28 check again once the file is open. [`path_noexec`](' + EXEC + '#L112-L116) returns true when the mount has `MNT_NOEXEC` or the superblock has `SB_I_NOEXEC`. Line 30 returns `-EACCES`, which bash prints as `Permission denied`.',
			'The check uses `file->f_path`, the mount the path went through. On a bind mount with `noexec`, the same file runs fine through the other path.',
			'`nosuid` is handled later in the same file: [`bprm_fill_uid`](' + EXEC + '#L1622-L1623) returns early when `mnt_may_suid()` is false, so the new program keeps the caller\'s UID and GID.'
		]
	},
	tradeoff: {
		gain: [
			'`noexec`, `nosuid` and `nodev` on `/tmp`, `/dev/shm` or an upload directory stop a user from running a dropped binary or a planted setuid file from there.',
			'A read-only bind mount gives a container or a chroot access to a directory without write access, while the original path stays writable.',
			'Shared propagation lets a mount made on the host (a USB disk, an NFS share) appear in containers that use slave or shared mounts.'
		],
		cost: [
			'`noexec` does not stop `sh script.sh` or `python3 script.py`: the interpreter lives on another mount and only reads the file.',
			'A `remount` resets the VFS flags you do not repeat: mount(8) says "The default kernel behavior for VFS mount flags (nodev,nosuid,noexec,ro) is to reset all unspecified flags on remount."',
			'A typo in `/etc/fstab` can stop the next boot at an emergency shell. `findmnt --verify` checks the file before you reboot.'
		]
	},
	task: {
		prompt: 'Write an `/etc/fstab` line that mounts a 2 GiB tmpfs on `/var/tmp` with no execution, no setuid and no device files. Give the commands to apply it without a reboot and to confirm the options.',
		hint: 'The six fields are device, mount point, type, options, dump, fsck order. tmpfs takes a `size=` option with a `k`, `m` or `g` suffix.',
		answer: [
			'`tmpfs /var/tmp tmpfs size=2g,nosuid,nodev,noexec 0 0`. The device field is just `tmpfs`. Dump and fsck order are 0: there is nothing to dump or check on a filesystem in memory.',
			'`sudo findmnt --verify` checks the file. Then `sudo systemctl daemon-reload`, as fstab(5) recommends on systemd systems, and `sudo mount /var/tmp`, which reads the rest of the line from fstab.',
			'`findmnt /var/tmp` should show `rw,nosuid,nodev,noexec` and the size. Test it: copy `/bin/true` there and run it. You should get `Permission denied` and exit status 126.',
			'Whatever was in `/var/tmp` before stays on the root filesystem, hidden under the new mount until you unmount it.'
		],
		steps: [
			{
				title: 'Fill in the fields',
				questions: [
					{ q: 'In what order do the six fstab fields come?', options: ['Mount point, device, type, options, fsck order, dump', 'Device, mount point, type, options, dump, fsck order', 'Type, device, mount point, options, dump, fsck order', 'Device, type, mount point, options, fsck order, dump'], answer: 1, why: 'fstab(5): the device, the mount point, the type, the options, a dump flag and the fsck order.' },
					{ q: 'What goes in the device field for a tmpfs?', options: ['`/dev/shm`', 'The UUID of the root disk', '`/dev/tmpfs0`', 'Just `tmpfs`'], answer: 3, why: 'A tmpfs lives in memory and has no block device. The field is just the word `tmpfs`.' },
					{ q: 'What do you put in the last two fields?', options: ['`0 0`', '`0 1`', '`1 1`', '`0 2`'], answer: 0, why: 'There is nothing to dump or check on a filesystem in memory. `1` is for the root filesystem, checked first.' },
					{ q: 'How do you write the 2 GiB size?', options: ['`size=2GiB`', '`blocks=2g`', '`size=2g`', '`maxsize=2048`'], answer: 2, why: 'tmpfs takes a `size=` option with a `k`, `m` or `g` suffix.' }
				]
			},
			{
				title: 'Pick the options',
				questions: [
					{ q: 'Which option stops a program on `/var/tmp` from being run directly?', options: ['`noexec`', '`ro`', '`nodev`', '`noatime`'], answer: 0, why: 'mount(8): `noexec` means "Do not permit direct execution of any binaries on the mounted filesystem".' },
					{ q: 'Which option makes the kernel ignore the setuid bit there?', options: ['`nodev`', '`nosuid`', '`noexec`', '`nouser`'], answer: 1, why: '`nosuid`: "Do not honor set-user-ID and set-group-ID bits or file capabilities". The program would run as its caller.' },
					{ q: 'Which option stops device files there from working?', options: ['`nosuid`', '`noexec`', '`private`', '`nodev`'], answer: 3, why: '`nodev`: "Do not interpret character or block special devices on the filesystem".' },
					{ q: 'So the full line is...', options: ['`/var/tmp tmpfs tmpfs size=2g,nosuid,nodev,noexec 0 0`', '`tmpfs /var/tmp ext4 size=2g,nosuid,nodev,noexec 0 1`', '`tmpfs /var/tmp tmpfs size=2g,nosuid,nodev,noexec 0 0`', '`tmpfs /var/tmp tmpfs size=2g,ro,noexec 0 0`'], answer: 2, why: 'Device `tmpfs`, mount point `/var/tmp`, type `tmpfs`, the size and the three options, then `0 0`.' }
				]
			},
			{
				title: 'Apply it without a reboot',
				questions: [
					{ q: 'What do you run first, before mounting anything?', options: ['`sudo reboot`', '`sudo findmnt --verify`', '`sudo mount -a --fake`', '`sudo fsck /var/tmp`'], answer: 1, why: 'A typo in fstab can stop the next boot at an emergency shell. `findmnt --verify` checks the file first.' },
					{ q: 'What does fstab(5) recommend after editing the file on a systemd system?', options: ['`sudo systemctl daemon-reload`', '`sudo systemctl restart fstab`', '`sudo update-fstab`', 'Nothing: systemd reads it on each mount'], answer: 0, why: 'fstab(5): "it\'s recommended to use systemctl daemon-reload after fstab modification".' },
					{ q: 'Which command mounts it with the options from the line?', options: ['`sudo mount --fake /var/tmp`', '`sudo mount -o remount /var/tmp`', '`sudo mount --bind /var/tmp /var/tmp`', '`sudo mount /var/tmp`'], answer: 3, why: 'Given only the mount point, `mount` reads the rest of the line from fstab.' },
					{ q: 'What happens to the files already in `/var/tmp`?', options: ['They are copied into the tmpfs', 'They are deleted', 'They stay on the root filesystem, hidden until you unmount', 'They move to `/tmp`'], answer: 2, why: 'A mount covers the directory. The old files are still on disk under it.' }
				]
			},
			{
				title: 'Confirm the options',
				questions: [
					{ q: 'Which command shows the options the mount really has?', options: ['`cat /etc/fstab`', '`findmnt /var/tmp`', '`ls -ld /var/tmp`', '`df -i /var/tmp`'], answer: 1, why: 'fstab is what you asked for. `findmnt` shows the live mount: `rw,nosuid,nodev,noexec` and the size.' },
					{ q: 'You copy `/bin/true` into `/var/tmp` and run it. What should you see?', options: ['`Permission denied` and exit status 126', 'Nothing, and exit status 0', '`Read-only file system`', '`Operation not permitted` and exit 1'], answer: 0, why: '`execve` returns `EACCES` on a noexec mount, and bash returns 126 for a command it found but cannot run.' },
					{ q: 'A user then runs `sh /var/tmp/script.sh`. What happens?', options: ['`Permission denied`, like `./script.sh`', 'The kernel kills `sh`', 'It runs only if the script is not setuid', 'The script runs'], answer: 3, why: '`execve` runs `/bin/sh` from the root mount, and `sh` only reads the script. `noexec` does not block that.' },
					{ q: 'A teammate expects `noexec` to block `python3 /var/tmp/x.py` too. Does it?', options: ['Yes: `noexec` blocks any program that reads the file', 'Yes, but only for scripts with mode `+x`', 'No: python3 lives on another mount and only reads the file', 'No: `noexec` only applies to setuid files'], answer: 2, why: '`noexec` is checked at `execve` for the file being executed. Here that file is `python3`, on the root mount, and the script is opened as data.' }
				]
			}
		]
	},
	quiz: [
		{
			q: '`/tmp` is mounted `noexec`. A user runs `bash /tmp/payload.sh`. What happens?',
			options: [
				'bash refuses with Permission denied and exits with 126',
				'The script runs, because bash only reads the file',
				'The kernel kills bash with SIGKILL for touching a noexec mount',
				'The script runs only if the user owns the file'
			],
			answer: 1,
			why: '`noexec` is checked in `execve` for the file being executed. Here `execve` runs `/bin/bash` from the root mount, and bash opens the script for reading. Only `/tmp/payload.sh` run directly gets `EACCES`.'
		},
		{
			q: 'You run `mount --bind /srv/data /mnt/ro` then `mount -o remount,bind,ro /mnt/ro`. An app writes to `/srv/data/log`. What happens?',
			options: [
				'The write works, and the new file shows up under /mnt/ro',
				'The write fails, because the filesystem is now read-only',
				'The write works, but /mnt/ro keeps showing the old contents',
				'The write fails until /mnt/ro is unmounted'
			],
			answer: 0,
			why: 'The `ro` flag is set on the `/mnt/ro` mount, and the superblock stays writable. Both mounts show the same files, so a write through `/srv/data` appears under `/mnt/ro`.'
		},
		{
			q: 'A setuid root program sits on a USB disk mounted with `nosuid`. An ordinary user runs it. What does the kernel do?',
			options: [
				'It refuses to run the program and returns EACCES',
				'It runs the program as root and logs a warning',
				'It runs the program with the caller\'s own user ID',
				'It strips the setuid bit from the file on the disk'
			],
			answer: 2,
			why: 'In `bprm_fill_uid`, `mnt_may_suid()` is false on a nosuid mount, so the function returns before it sets the effective UID from the file owner. The program runs, without the extra privilege.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Apply the task\'s fstab line in a throwaway container, then watch `noexec` and a read-only bind mount at work.',
		steps: [
			'Start a container that is allowed to mount (it changes nothing on your host): `docker run --rm -it --privileged debian:12-slim bash`.',
			'Add the line and check the file: `echo "tmpfs /var/tmp tmpfs size=2g,nosuid,nodev,noexec 0 0" >> /etc/fstab`, then `findmnt --verify`.',
			'Mount it from fstab and read the live options: `mount /var/tmp`, then `findmnt /var/tmp`.',
			'Try to run code from it: `cp /bin/true /var/tmp/true; /var/tmp/true; echo $?`. Then `printf \'#!/bin/sh\\necho hello\\n\' > /var/tmp/hello.sh; chmod +x /var/tmp/hello.sh`, and run both `/var/tmp/hello.sh` and `sh /var/tmp/hello.sh`.',
			'Make a read-only second view: `mkdir /ro; mount --bind /var/tmp /ro; mount -o remount,bind,ro /ro`. Run `touch /ro/x`, `touch /var/tmp/y`, `ls /ro`, then leave with `exit`.'
		],
		done: [
			'`findmnt --verify` prints `Success, no errors or warnings detected`.',
			'`findmnt /var/tmp` shows `rw,nosuid,nodev,noexec` and `size=2097152k`.',
			'`/var/tmp/true` prints `Permission denied` and `echo $?` prints `126`, while `sh /var/tmp/hello.sh` prints `hello`.',
			'`touch /ro/x` fails with `Read-only file system`, and `ls /ro` lists the `y` you created through `/var/tmp`.'
		],
		solution: [
			'`--privileged` gives the container the right to call `mount`. Without it, `mount` fails with `Permission denied`.',
			'`2g` is shown as `2097152k`: 2 × 1024 × 1024 KiB.',
			'The script with mode `-rwxr-xr-x` still fails when run directly: the mount flag wins over the file mode at `execve`. `sh` lives on the root mount and reads the script as data.',
			'`findmnt -o TARGET,OPTIONS /ro` shows `ro` on `/ro` while `/var/tmp` stays `rw`: the flag belongs to the mount, not to the filesystem.'
		]
	},
	recall: {
		q: 'A script on a `noexec` mount has mode `-rwxr-xr-x`. What do `./script.sh` and `sh script.sh` do, and why?',
		a: '`./script.sh` fails with `Permission denied` and exit 126: the exec open sees `MNT_NOEXEC` through `path_noexec` and returns `EACCES`. `sh script.sh` runs: `execve` runs `/bin/sh` from another mount, which reads the script as data.'
	},
	sources: [
		{ title: 'mount(8), Linux manual page', url: `${MAN}/man8/mount.8.html` },
		{ title: 'fstab(5), Linux manual page', url: `${MAN}/man5/fstab.5.html` },
		{ title: 'mount_namespaces(7), Linux manual page', url: `${MAN}/man7/mount_namespaces.7.html` },
		{ title: 'execve(2), Linux manual page', url: `${MAN}/man2/execve.2.html` },
		{ title: 'tmpfs(5), Linux manual page', url: `${MAN}/man5/tmpfs.5.html` },
		{ title: 'bash(1), Linux manual page (EXIT STATUS)', url: `${MAN}/man1/bash.1.html` }
	]
};
