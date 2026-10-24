const COREUTILS = 'https://github.com/coreutils/coreutils/blob/cc8689a07c8cfece66707936e3b914174912bd36';
const CHMOD = `${COREUTILS}/src/chmod.c`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'permissions',
	part: 'Files and disks',
	title: 'Permissions beyond rwx',
	minutes: 10,
	hook: [
		'January 25, 2022. Qualys publishes PwnKit, CVE-2021-4034: any local user can get full root privileges through `pkexec`. The advisory calls it "a SUID-root program that is installed by default on every major Linux distribution", and the bug has been there "since its creation, in May 2009".',
		'Qualys exploited it on Ubuntu, Debian, Fedora and CentOS. For systems with no patch yet, the advisory gives one command: `chmod 0755 /usr/bin/pkexec`.',
		'That command clears one bit. With `-rwsr-xr-x`, every user who runs `pkexec` gets root as the effective user, so a memory bug in its argument handling hands root to anyone. **The `s` in place of the owner\'s `x` is the set-user-ID bit.**'
	],
	terms: [
		{ term: 'Set-user-ID bit', def: 'Mode bit 04000, shown as `s` in the owner\'s execute slot. When a program with it is executed, execve sets the process\'s effective user ID to the file owner\'s.' },
		{ term: 'Set-group-ID bit', def: 'Mode bit 02000, shown as `s` in the group\'s execute slot. On a program it sets the effective group ID; on a directory, new files there take the directory\'s group.' },
		{ term: 'Sticky bit', def: 'Mode bit 01000, shown as `t` in the others\' execute slot. In a directory, only a file\'s owner, the directory\'s owner or a privileged process can delete or rename that file.' },
		{ term: 'umask', def: 'A per-process mask of permission bits that `open` and `mkdir` turn off on every new file. The usual value is `022`.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['run["uid 1000 runs /usr/bin/passwd, -rwsr-xr-x root"] -->|"execve: set-user-ID bit"| proc["Process: real UID 1000, effective UID 0"]'],
				highlight: ['run', 'proc'],
				note: 'execve(2): "the effective user ID of the calling process is changed to that of the owner of the program file". The real UID stays 1000, so the program knows who called it. On this chapter\'s Ubuntu laptop, 11 programs in `/usr/bin` are set-user-ID root, `passwd`, `sudo` and `pkexec` among them.'
			},
			{
				add: ['proc -.->|"ignored if mounted nosuid or no_new_privs is set"| plain["Process keeps effective UID 1000"]'],
				highlight: ['plain'],
				note: 'execve(2) lists the cases where the bit is ignored: the thread has `no_new_privs` set, or the filesystem is mounted `nosuid`. A setuid file on a USB stick mounted `nosuid` runs as the user who started it.'
			},
			{
				add: ['sgid["mkdir shared; chgrp docker shared; chmod g+s shared"] --> drw["drwxrwsr-x lea docker shared"]', 'drw -->|"touch shared/after.txt"| f["-rw-rw-r-- lea docker after.txt"]'],
				highlight: ['sgid', 'drw', 'f'],
				note: 'inode(7): files created in a set-group-ID directory "inherit their group ID from the directory", and new subdirectories get the bit too. In the test for this chapter, `before.txt`, made before `g+s`, has group `lea`. `after.txt` has group `docker`.'
			},
			{
				add: ['tmp["/tmp: drwxrwxrwt root root, mode 1777"] -->|"bob runs rm /tmp/alice.log"| deny["Operation not permitted"]'],
				highlight: ['tmp', 'deny'],
				note: 'Mode 777 lets every user create files in `/tmp`, and the extra 1 is the sticky bit. Because of it, only alice, root (the directory owner) or a privileged process can delete or rename `alice.log`. The file\'s own mode does not matter for deletion.'
			},
			{
				add: ['mask["umask 022"] -->|"open(..., 0666)"| file["0666 & ~022 = 0644: -rw-r--r--"]', 'mask -->|"mkdir(..., 0777)"| dir2["0777 & ~022 = 0755: drwxr-xr-x"]'],
				highlight: ['mask', 'file', 'dir2'],
				note: 'umask(2): "permissions in the umask are turned off from the mode argument to open(2) and mkdir(2)." `touch` asks for 0666 and gets 0644; `mkdir` asks for 0777 and gets 0755. In a shared setgid directory, `022` leaves the group without write access, so teams set `002`.'
			}
		]
	},
	example: {
		title: 'coreutils src/chmod.c: process_file, applying the mode and catching umask surprises',
		repo: 'coreutils/coreutils',
		url: `${CHMOD}#L304-L358`,
		lang: 'c',
		code: `  if (ch.status == CH_NOT_APPLIED)
    {
      ch.old_mode = file_stats->st_mode;
      ch.new_mode = mode_adjust (ch.old_mode, S_ISDIR (ch.old_mode) != 0,
                                 umask_value, change, nullptr);
      bool follow_symlink = !!dereference;
      if (dereference == -1) /* -H with/without -R, -P without -R.  */
        follow_symlink = ent->fts_level == 0;
      if (fchmodat (fts->fts_cwd_fd, file, ch.new_mode,
                    follow_symlink ? 0 : AT_SYMLINK_NOFOLLOW) == 0)
        ch.status = CH_SUCCEEDED;
      else
        {
          if (! is_ENOTSUP (errno))
            {
              if (! force_silent)
                error (0, errno, _("changing permissions of %s"),
                       quoteaf (file_full_name));

              ch.status = CH_FAILED;
            }
          /* else treat not supported as not applied.  */
        }
    }
…
  if (CH_NO_CHANGE_REQUESTED <= ch.status && diagnose_surprises)
    {
      mode_t naively_expected_mode =
        mode_adjust (ch.old_mode, S_ISDIR (ch.old_mode) != 0,
                     0, change, nullptr);
      if (ch.new_mode & ~naively_expected_mode)
        {
          char new_perms[12];
          char naively_expected_perms[12];
          strmode (ch.new_mode, new_perms);
          strmode (naively_expected_mode, naively_expected_perms);
          new_perms[10] = naively_expected_perms[10] = '\\0';
          error (0, 0,
                 _("%s: new permissions are %s, not %s"),
                 quotef (file_full_name),
                 new_perms + 1, naively_expected_perms + 1);
          ch.status = CH_FAILED;
        }
    }`,
		notes: [
			'Lines 4 and 5 compute the new mode from the old one, the requested change and `umask_value`. `main` reads that value with `umask (0)` on line 632 of the file. chmod(1): with no `u`, `g`, `o` or `a`, "bits that are set in the umask are not affected".',
			'Line 9 calls `fchmodat` once with the full mode, special bits included. chmod(1) warns that the kernel can drop them: it "clears the set-group-ID bit of a regular file if the file\'s group ID does not match the user\'s effective group ID". [`mode_changed`](' + CHMOD + '#L126-L145) then calls `fstatat` again to see what really stuck.',
			'Lines 26 to 44 run for a mode like `-w`. Lines 28 to 30 compute the mode again with a umask of 0, and line 31 compares the two. Run for this chapter with umask 022 on a 0666 file: `chmod -w f` printed `f: new permissions are r--rw-rw-, not r--r--r--` and exited with 1.'
		]
	},
	tradeoff: {
		gain: [
			'A set-user-ID root program lets any user do one root task with no `sudo` rule, such as `passwd`, mode 4755 and owned by root.',
			'A set-group-ID directory keeps every new file in the team\'s group. In the test, `after.txt` got group `docker` without any `chgrp`.',
			'The sticky bit lets all users share one world-writable `/tmp` (mode 1777) while each user can only delete their own files there.'
		],
		cost: [
			'A bug in a set-user-ID root program is a root bug for every local user. PwnKit sat in `pkexec` from May 2009 until January 2022.',
			'A umask of `022` makes new files in a shared setgid directory `-rw-r--r--`, so the group can read but not write. Each member must run with `002` or fix the mode after each write.',
			'`chmod` can silently lose a set-group-ID bit when you are not in the file\'s group, and `chmod -w` under a umask leaves group and other write bits in place.'
		]
	},
	task: {
		prompt: 'On your machine run `stat -c \'%A %a %U %G %n\' /tmp /usr/bin/passwd /usr/bin/crontab /var/mail`, then `umask`, then `find /usr/bin -perm -4000 -printf \'%M %u %p\\n\'`. For each line of `stat`, name the special bit and say what it does. From `umask`, compute the mode of a new file and a new directory.',
		hint: 'Read the first digit of the octal mode: 4 is set-user-ID, 2 is set-group-ID, 1 is sticky. `s` in the group slot means setgid, `t` in the last slot means sticky.',
		answer: [
			'Output on an Ubuntu 24.04 laptop: `drwxrwxrwt 1777 root root /tmp`. The 1 is the sticky bit: anyone may create files, only a file\'s owner, root or a privileged process may delete them.',
			'`-rwsr-xr-x 4755 root root /usr/bin/passwd`: the 4 is set-user-ID, so `passwd` runs with effective UID 0 for any caller. `-rwxr-sr-x 2755 root crontab /usr/bin/crontab`: the 2 is set-group-ID, so it runs with effective group `crontab`.',
			'`drwxrwsr-x 2775 root mail /var/mail`: set-group-ID on a directory, so each new mailbox gets group `mail`.',
			'`umask` printed `002`: a new file gets 0666 & ~002 = 0664 (`-rw-rw-r--`), a new directory 0775. `find` listed 11 set-user-ID root programs, among them `sudo`, `su`, `mount` and `pkexec`.'
		],
		steps: [
			{
				title: 'Read the /tmp line',
				questions: [
					{ q: '`drwxrwxrwt 1777 root root /tmp`. Which special bit is set?', options: ['Set-user-ID', 'Set-group-ID', 'Sticky', 'None: `t` is a file type'], answer: 2, why: 'The first octal digit is 1, shown as `t` in the others\' execute slot: the sticky bit.' },
					{ q: 'What does the 777 part let users do in `/tmp`?', options: ['Create files there', 'Delete any file there', 'Read every file there', 'Run every file there as root'], answer: 0, why: 'Write and execute on a directory let every user add entries to it.' },
					{ q: 'Bob tries to delete a file alice made in `/tmp`, mode 0666. What happens?', options: ['It works: the file is writable by all', 'It works: `/tmp` is writable by all', 'It works only at boot', 'It fails: the sticky bit limits deletion to the owners'], answer: 3, why: 'Deleting changes the directory, so the directory decides. Only the file\'s owner, root or a privileged process may delete it.' },
					{ q: 'Why does the file\'s own mode not matter for deletion?', options: ['The kernel checks the file mode after the delete', 'Deleting removes a directory entry, so the directory\'s mode decides', 'Files in `/tmp` have no mode', 'Because root owns `/tmp`'], answer: 1, why: 'A name lives in the parent directory. Removing it is a write to that directory.' }
				]
			},
			{
				title: 'Read the two programs',
				questions: [
					{ q: '`-rwsr-xr-x 4755 root root /usr/bin/passwd`. What does the 4 do?', options: ['It makes the file readable by root only', 'Set-user-ID: the process runs with effective UID 0 for any caller', 'Set-group-ID: it runs with group root', 'It marks the file sticky in memory'], answer: 1, why: 'execve sets the effective user ID to the file owner\'s, root here. The real UID stays the caller\'s.' },
					{ q: 'User 1000 runs `passwd`. What is the process\'s real UID?', options: ['0', '1000', '4755', 'The UID of the last user who ran it'], answer: 1, why: 'Only the effective UID changes. The real UID stays 1000, so the program knows who called it.' },
					{ q: '`-rwxr-sr-x 2755 root crontab /usr/bin/crontab`. What does the 2 do?', options: ['It runs with effective group `crontab`', 'It runs with effective user `crontab`', 'Only the group can run it', 'New files take group `crontab`'], answer: 0, why: 'The `s` in the group slot on a program is set-group-ID: it sets the effective group ID to the file\'s group.' },
					{ q: 'When would `passwd` keep effective UID 1000 despite the bit?', options: ['When the caller is in group `root`', 'When the umask is `022`', 'When its filesystem is mounted `nosuid`, or `no_new_privs` is set', 'Never'], answer: 2, why: 'execve(2) ignores the set-user-ID bit on a `nosuid` mount or when the thread has `no_new_privs`.' }
				]
			},
			{
				title: 'Read the directory and the list',
				questions: [
					{ q: '`drwxrwsr-x 2775 root mail /var/mail`. What does the `s` do on a directory?', options: ['Programs inside run as `mail`', 'Only `mail` can list it', 'New files there take group `mail`', 'Files there cannot be deleted'], answer: 2, why: 'inode(7): files created in a set-group-ID directory "inherit their group ID from the directory".' },
					{ q: 'A new subdirectory under `/var/mail`. Does it get the bit too?', options: ['Yes: new subdirectories inherit it', 'No: only files inherit', 'Only if made by root', 'Only with umask `002`'], answer: 0, why: 'New subdirectories of a set-group-ID directory get the bit as well, so the rule carries down.' },
					{ q: '`find /usr/bin -perm -4000` listed 11 programs. What do they share?', options: ['They are all sticky', 'They all belong to group `mail`', 'They cannot be run by users', 'They all run with the owner\'s UID, root here, for any caller'], answer: 3, why: '`-perm -4000` matches files with the set-user-ID bit. Each one runs as root for every user.' },
					{ q: 'Why does that list matter after PwnKit?', options: ['Each program on it slows down boot', 'A bug in any of them is a root bug for every local user', 'Each one leaks the umask', 'They ignore `nosuid`'], answer: 1, why: '`pkexec` was on such a list from May 2009 to January 2022. The fix cleared its bit with `chmod 0755`.' }
				]
			},
			{
				title: 'Compute from umask',
				questions: [
					{ q: '`umask` prints `002`. What mode does `touch` ask for?', options: ['0777', '0644', '0666', '0002'], answer: 2, why: '`touch` asks `open` for 0666. The umask then turns bits off.' },
					{ q: 'What mode does the new file get?', options: ['0664, `-rw-rw-r--`', '0644, `-rw-r--r--`', '0666, `-rw-rw-rw-`', '0775, `-rwxrwxr-x`'], answer: 0, why: '0666 & ~002 = 0664. Only others lose write.' },
					{ q: 'What mode does a new directory get?', options: ['0664', '0755', '0777', '0775'], answer: 3, why: '`mkdir` asks for 0777, and 0777 & ~002 = 0775.' },
					{ q: 'Why do teams in a shared setgid directory pick `002` over `022`?', options: ['`022` blocks the setgid bit', 'With `022` new files are `-rw-r--r--`, so the group cannot write', '`002` makes files executable', '`022` hides files from the group'], answer: 1, why: 'The setgid directory gives the group, but the umask decides if the group can write.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'User 1000 runs a program whose mode is `-rwsr-xr-x` and owner is root. What are the process\'s IDs?',
			options: [
				'Real UID 0 and effective UID 0, since the file belongs to root',
				'Real UID 1000 and effective UID 1000, since only root can use the bit',
				'Real UID 1000 and effective UID 0, set by execve from the file owner',
				'Real UID 0 and effective UID 1000, swapped back after the program starts'
			],
			answer: 2,
			why: 'execve(2) changes only the effective user ID to the owner of the program file. The real UID stays that of the caller. On a `nosuid` mount or with `no_new_privs`, even the effective UID stays 1000.'
		},
		{
			q: '`/tmp` has mode `1777`. Bob runs `rm /tmp/alice.log`, a file owned by alice with mode 0666. What happens?',
			options: [
				'It works, because `/tmp` is writable by everyone',
				'It works, because the file itself is writable by everyone',
				'It fails, because the sticky bit limits deletion to the owners',
				'It fails, because files in `/tmp` can only be deleted at boot'
			],
			answer: 2,
			why: 'Deleting a file changes the directory, so the directory\'s mode decides. The sticky bit on `/tmp` allows deletion only by the file\'s owner, the directory\'s owner or a privileged process. The 0666 mode of the file plays no part.'
		},
		{
			q: 'A service runs with `umask 027`. What mode does a file get when the service creates it with `open(..., 0666)`?',
			options: ['0640, `-rw-r-----`', '0750, `-rwxr-x---`', '0627, `-rw--w-rwx`', '0644, `-rw-r--r--`'],
			answer: 0,
			why: 'open(2) turns off the umask bits: 0666 & ~027 = 0640. The group loses write and others lose everything. 0750 is what `mkdir` would give, since it starts from 0777.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Watch each special bit act, as two users in a throwaway container where you are root.',
		steps: [
			'Start the container. `--tmpfs` adds a scratch mount that Docker mounts `nosuid`: `docker run --rm -it --tmpfs /ns:exec debian:bookworm-slim bash`.',
			'Make two users and a group: `useradd -m alice; useradd -m bob; groupadd team; usermod -aG team alice`.',
			'Sticky bit: `mkdir /shared && chmod 1777 /shared`, then `su alice -c \'touch /shared/alice.log && chmod 666 /shared/alice.log\'` and `su bob -c \'rm /shared/alice.log\'`.',
			'Set-group-ID directory: `mkdir /team && chgrp team /team && chmod 2775 /team`, then `su alice -c \'touch /team/a.txt\'` and `stat -c \'%A %U %G %n\' /team /team/a.txt`.',
			'umask: `su alice -c \'umask 027; touch /tmp/f; mkdir /tmp/d\'` and `stat -c \'%a %n\' /tmp/f /tmp/d`.',
			'Set-user-ID: `cp /usr/bin/id /usr/local/bin/myid && chmod 4755 /usr/local/bin/myid` and `su bob -c myid`. Then the same file on the `nosuid` mount: `cp /usr/bin/id /ns/myid && chmod 4755 /ns/myid` and `su bob -c /ns/myid`. Then `exit`.'
		],
		done: [
			'Step 3 prints `Operation not permitted` although the file is mode 666.',
			'Step 4 shows `/team` as `drwxrwsr-x` and `a.txt` with group `team`.',
			'Step 5 prints `640 /tmp/f` and `750 /tmp/d`.',
			'`su bob -c myid` prints `euid=0(root)`, and `su bob -c /ns/myid` does not.'
		],
		solution: [
			'The sticky bit on `/shared` lets only alice, root or a privileged process remove `alice.log`. The file\'s mode is not checked.',
			'`a.txt` took the directory\'s group. It is `-rw-r--r--` because the default umask `022` took away the group\'s write bit.',
			'0666 & ~027 = 0640 and 0777 & ~027 = 0750.',
			'execve set bob\'s effective UID to the file owner, root, and left the real UID at bob. On the `nosuid` mount, execve ignored the bit.'
		]
	},
	recall: {
		q: 'What do the octal digits 4, 2 and 1 in front of a mode like `4755` mean, and which one did the PwnKit fix remove from `pkexec`?',
		a: '4 is set-user-ID, 2 is set-group-ID, 1 is the sticky bit. `chmod 0755 /usr/bin/pkexec` removed the 4, so `pkexec` no longer ran as root for every user.'
	},
	sources: [
		{ title: 'Qualys advisory, PwnKit: local privilege escalation in polkit\'s pkexec (CVE-2021-4034)', url: 'https://www.qualys.com/2022/01/25/cve-2021-4034/pwnkit.txt' },
		{ title: 'inode(7), file type and mode', url: 'https://man7.org/linux/man-pages/man7/inode.7.html' },
		{ title: 'execve(2)', url: 'https://man7.org/linux/man-pages/man2/execve.2.html' },
		{ title: 'chmod(1)', url: 'https://man7.org/linux/man-pages/man1/chmod.1.html' },
		{ title: 'umask(2)', url: 'https://man7.org/linux/man-pages/man2/umask.2.html' },
		{ title: 'unlink(2), EPERM in a sticky directory', url: 'https://man7.org/linux/man-pages/man2/unlink.2.html' },
		{ title: 'coreutils 9.5 source, src/chmod.c', url: CHMOD }
	]
};
