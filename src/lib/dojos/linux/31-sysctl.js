const LINUX = 'https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a';
const SYSTEMD = 'https://github.com/systemd/systemd/blob/84b71c1525e792c2ba44670d2171386af8605edd';
const REDIS = 'https://github.com/redis/redis/blob/e0bb9316848db7950c2b18cdc59c2058f62b8a3d';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'sysctl',
	part: 'The running system',
	title: 'Kernel parameters',
	minutes: 10,
	hook: [
		'Redis starts on a server with a kernel older than 5.4 and logs: "WARNING: The TCP backlog setting of 511 cannot be enforced because /proc/sys/net/core/somaxconn is set to the lower value of 128."',
		'Redis asks the kernel for a queue of 511 connections waiting for `accept()` (`tcp-backlog 511` in its default `redis.conf`). The listen(2) man page says what happens to a bigger request: "it is silently capped to that value". `listen()` still returns 0. Redis reads the file itself to warn you, and the kernel logs nothing.',
		'`/proc/sys/net/core/somaxconn` is one of the kernel parameters under `/proc/sys`. You read and change them with `sysctl`. **A value you write there is gone at the next boot** unless a file in `/etc/sysctl.d` sets it again.'
	],
	terms: [
		{ term: 'Kernel parameter', def: 'A setting the running kernel exposes as a file under `/proc/sys`, such as `/proc/sys/net/core/somaxconn`. Its sysctl name uses dots: `net.core.somaxconn`.' },
		{ term: 'sysctl', def: 'The procps-ng command that reads and writes kernel parameters: `sysctl net.core.somaxconn` reads, `sysctl -w net.core.somaxconn=4096` writes, `sysctl --system` loads every config file.' },
		{ term: '`/etc/sysctl.d`', def: 'A directory of `.conf` files with lines like `net.core.somaxconn = 4096`. At boot, `systemd-sysctl.service` applies them together with `/run/sysctl.d`, `/usr/local/lib/sysctl.d` and `/usr/lib/sysctl.d`.' },
		{ term: 'Listen backlog', def: 'The length of the queue of connections the kernel has accepted for a listening socket and the program has not yet taken with `accept()`. The program asks for it in `listen(fd, backlog)`.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['admin["sysctl -w net.core.somaxconn=4096"] -->|"write 4096"| file["/proc/sys/net/core/somaxconn"]'],
				highlight: ['admin', 'file'],
				note: 'sysctl(8) maps the name to a file: the parameters "are those listed under /proc/sys/". `echo 4096 > /proc/sys/net/core/somaxconn` as root does the same write. The new value applies at once, with no reboot.'
			},
			{
				add: ['file --> var["sysctl_somaxconn of this network namespace"]'],
				highlight: ['var'],
				note: 'The kernel declares `somaxconn` in `netns_core_table` in `net/core/sysctl_net_core.c`. Each network namespace has its own copy of the value. On the host, `sysctl -w` changes the copy of the host namespace only.'
			},
			{
				add: ['redis["Redis: listen(fd, 511)"] --> cap["__sys_listen_socket: if backlog > somaxconn, backlog = somaxconn"]', 'var --> cap'],
				highlight: ['redis', 'cap'],
				note: 'In `net/socket.c` lines 1887 to 1889, the kernel reads `sysctl_somaxconn` and lowers a bigger backlog to it. With `somaxconn` at 128, Redis gets 128 and `listen()` returns 0. The cap is applied when `listen()` runs, so a socket that is already listening keeps its old queue length until the program calls `listen()` again.'
			},
			{
				add: ['boot["Reboot"] -->|"value back to SOMAXCONN = 4096"| var', 'conf["/etc/sysctl.d/90-redis.conf"] -->|"systemd-sysctl.service at boot"| file'],
				highlight: ['boot', 'conf'],
				note: 'The value written by `sysctl -w` lives in kernel memory only. After a reboot it is the compiled default, `SOMAXCONN` 4096 since Linux 5.4 (128 before). A line in a file under `/etc/sysctl.d` is applied again early in every boot by `systemd-sysctl.service`.'
			},
			{
				add: ['pod["New container: its own network namespace"] -->|"starts at 4096"| var'],
				highlight: ['pod'],
				note: 'The kernel sets `sysctl_somaxconn = SOMAXCONN` for every new network namespace (`preinit_net_sysctl` in `net/core/net_namespace.c`). A container does not inherit the host value. In Kubernetes you set it per pod in `securityContext.sysctls`, and the node must allow it with `kubelet --allowed-unsafe-sysctls`.'
			}
		]
	},
	example: {
		title: 'src/core/main.c: systemd raises fs.file-max at boot',
		repo: 'systemd/systemd',
		url: `${SYSTEMD}/src/core/main.c#L1364-L1383`,
		lang: 'c',
		code: `static void bump_file_max_and_nr_open(void) {

        /* Let's bump fs.file-max and fs.nr_open to their respective maximums. On current kernels large
         * numbers of file descriptors are no longer a performance problem and their memory is properly
         * tracked by memcg, thus counting them and limiting them in another two layers of limits is
         * unnecessary and just complicates things. This function hence turns off 2 of the 4 levels of limits
         * on file descriptors, and makes RLIMIT_NOLIMIT (soft + hard) the only ones that really matter. */

#if BUMP_PROC_SYS_FS_FILE_MAX || BUMP_PROC_SYS_FS_NR_OPEN
        int r;
#endif

#if BUMP_PROC_SYS_FS_FILE_MAX
        /* The maximum the kernel allows for this since 5.2 is LONG_MAX, use that. (Previously things were
         * different, but the operation would fail silently.) */
        r = sysctl_write("fs/file-max", LONG_MAX_STR);
        if (r < 0)
                log_full_errno(ERRNO_IS_NEG_FS_WRITE_REFUSED(r) ? LOG_DEBUG : LOG_WARNING, r,
                               "Failed to bump fs.file-max, ignoring: %m");
#endif`,
		notes: [
			'Line 16 writes the largest `long` into `fs/file-max`. `sysctl_write` ends in [`sysctl_write_full`](' + SYSTEMD + '/src/basic/sysctl-util.c#L80-L100), which prefixes the name with `/proc/sys/` and writes the string to that file. systemd uses the same file interface as `sysctl -w`.',
			'`fs.file-max` is the number of open files the whole kernel will allocate. When it is reached, [`alloc_empty_file`](' + LINUX + '/fs/file_table.c#L191-L230) returns `ENFILE` and logs "VFS: file-max limit <number> reached". Processes with `CAP_SYS_ADMIN` can go above the limit.',
			'Without systemd\'s write, the kernel sizes `file-max` at boot to use at most 10% of memory for files, counting about 1 KB per file (`files_maxfiles_init`, lines 535 to 549 of the same file).',
			'Lines 3 to 7 explain the choice: with file-max and nr_open at their maximum, the per-process `RLIMIT_NOFILE` (chapter 5) is the limit that matters. On the machine this chapter was written on (kernel 6.17), `sysctl fs.file-max` prints `9223372036854775807`.'
		]
	},
	tradeoff: {
		gain: [
			'You change kernel behaviour on a running server with one write to `/proc/sys`, with no reboot and no kernel rebuild.',
			'Packages ship their settings in `/usr/lib/sysctl.d`, and your files in `/etc/sysctl.d` override them: a file with the same name replaces the vendor file, and a later name overrides single keys.'
		],
		cost: [
			'A value set with `sysctl -w` is lost at the next reboot. The server comes back with the old behaviour until someone writes it into `/etc/sysctl.d`.',
			'The `net.*` parameters are per network namespace. Raising `net.core.somaxconn` on the host does not change it inside a container.',
			'The kernel caps a too-large `listen()` backlog with no error and no log line. You see it only in a warning the program prints itself, like Redis does.',
			'`systemd-sysctl.service` runs early in boot. A parameter that appears later, when a kernel module loads, is not set unless a udev rule or `modules-load.d` loads the module first.'
		]
	},
	task: {
		prompt: 'On a Linux machine, run `sysctl net.core.somaxconn fs.file-max fs.file-nr` and `ls /usr/lib/sysctl.d /etc/sysctl.d`. Say what each of the five numbers counts. Then write the file that sets `net.core.somaxconn` to 8192 on every boot, the command that applies it now, and the command that checks it.',
		hint: '`fs.file-nr` has three numbers, documented in the kernel\'s `admin-guide/sysctl/fs` page. For the file name, the systemd docs recommend a two-digit prefix in the range 60 to 90 for `/etc`.',
		answer: [
			'Output on the machine this chapter was written on (kernel 6.17): `net.core.somaxconn = 4096`, `fs.file-max = 9223372036854775807`, `fs.file-nr = 17099 0 9223372036854775807`. 4096 is the kernel default since 5.4. The huge file-max is systemd\'s `LONG_MAX` write from the example.',
			'`fs.file-nr` is: open file handles allocated (17099), allocated but unused (always 0 since Linux 2.6), and the maximum (file-max).',
			'Create `/etc/sysctl.d/90-somaxconn.conf` with one line: `net.core.somaxconn = 8192`. Apply all files now with `sudo sysctl --system`, or this file only with `sudo sysctl -p /etc/sysctl.d/90-somaxconn.conf`. Check with `sysctl net.core.somaxconn` or `cat /proc/sys/net/core/somaxconn`.',
			'Restart Redis afterwards. Its socket got its queue length when it called `listen()`, so the new value only reaches sockets that call `listen()` after the change.'
		],
		steps: [
			{
				title: 'Read the numbers',
				questions: [
					{ q: '`net.core.somaxconn = 4096`. What does 4096 limit?', options: ['The number of sockets one process can open', 'The longest accept queue a `listen()` call can get', 'The number of TCP connections the whole machine can hold', 'The size in bytes of each socket\'s receive buffer'], answer: 1, why: 'A `listen()` backlog larger than `somaxconn` is lowered to it. 4096 is the kernel default since Linux 5.4.' },
					{ q: '`fs.file-max = 9223372036854775807`. Why is it so large?', options: ['The kernel sized it from 10% of memory', 'An admin raised it by hand after a crash', 'systemd wrote `LONG_MAX` into it at boot', 'It is unset, and the kernel prints the type\'s maximum'], answer: 2, why: 'systemd\'s `bump_file_max_and_nr_open` writes the largest `long` into `fs/file-max`. Without that write, the kernel would size it from memory.' },
					{ q: '`fs.file-nr = 17099 0 9223372036854775807`. What is 17099?', options: ['Open file handles allocated right now', 'Files opened since boot', 'Free file handles left before the limit', 'Open files of the current shell'], answer: 0, why: 'The first number of `fs.file-nr` is the count of allocated file handles. The third is the maximum, the same as `fs.file-max`.' },
					{ q: 'And the 0 in the middle of `fs.file-nr`?', options: ['Handles that failed to open since boot', 'Processes that hit their `RLIMIT_NOFILE`', 'Files waiting to be closed by the kernel', 'Allocated but unused handles, always 0 since Linux 2.6'], answer: 3, why: 'The kernel docs for `/proc/sys/fs` say Linux 2.6 and later always report 0 there. It is not an error: allocated handles match used handles.' }
				]
			},
			{
				title: 'Read the config directories',
				questions: [
					{ q: 'What applies the files in `/etc/sysctl.d` and `/usr/lib/sysctl.d` at boot?', options: ['The kernel, before it mounts the root filesystem', '`systemd-sysctl.service`, early in boot', 'The `sysctl` command, run by cron at startup', 'Each package\'s post-install script'], answer: 1, why: '`systemd-sysctl.service` reads the `sysctl.d` directories early in every boot and writes each key to `/proc/sys`.' },
					{ q: 'Who is meant to put files in `/usr/lib/sysctl.d`?', options: ['You, for settings that must survive upgrades', 'The kernel, when a module loads', 'Packages, for their default settings', 'systemd, to record values set with `sysctl -w`'], answer: 2, why: 'Packages ship their settings in `/usr/lib/sysctl.d`. Your own files go in `/etc/sysctl.d` and override them.' },
					{ q: 'A file in `/etc/sysctl.d` has the same name as one in `/usr/lib/sysctl.d`. What happens?', options: ['The `/etc` file replaces the vendor file', 'Both files are applied, `/usr/lib` last', 'systemd refuses to boot until one is removed', 'Only keys missing from the vendor file are used'], answer: 0, why: 'Same name means the file in `/etc` wins and the vendor file is not read. With different names, the latest name in sort order wins per key.' },
					{ q: 'Which two-digit prefix range do the systemd docs recommend for files in `/etc`?', options: ['00 to 09', '10 to 40', '95 to 99', '60 to 90'], answer: 3, why: 'sysctl.d(5) recommends 10 to 40 for vendor files and 60 to 90 for local ones, so local files sort after vendor defaults.' }
				]
			},
			{
				title: 'Write the file',
				questions: [
					{ q: 'Why not just run `sysctl -w net.core.somaxconn=8192`?', options: ['`sysctl -w` only works on kernels older than 5.4', 'The value takes effect only after a reboot', 'The value is lost at the next reboot', '`sysctl -w` cannot write `net.*` keys'], answer: 2, why: 'A value written with `sysctl -w` lives in kernel memory only. After a reboot the kernel starts again from its compiled default.' },
					{ q: 'Where does the file go?', options: ['`/etc/sysctl.d/90-somaxconn.conf`', '`/usr/lib/sysctl.d/90-somaxconn.conf`', '`/proc/sys/net/core/somaxconn.conf`', '`/run/sysctl.d/somaxconn`'], answer: 0, why: '`/etc/sysctl.d` is for local settings, and the `.conf` suffix and a 60 to 90 prefix match sysctl.d(5).' },
					{ q: 'What is the line inside it?', options: ['`/proc/sys/net/core/somaxconn = 8192`', '`sysctl -w net.core.somaxconn=8192`', '`somaxconn: 8192`', '`net.core.somaxconn = 8192`'], answer: 3, why: 'A `sysctl.d` line is the dotted name, `=`, and the value. The dotted name maps to the file under `/proc/sys`.' },
					{ q: 'On Kubernetes, Redis needs 8192 inside its pod. Where do you set it?', options: ['In `resources.limits`', 'In the pod\'s `securityContext.sysctls`', 'In `hostNetwork: true`', 'In an `/etc/sysctl.d` file baked into the image'], answer: 1, why: '`net.*` values belong to the pod\'s network namespace, so they are set per pod. Nothing reads a `sysctl.d` file inside the image at start.' }
				]
			},
			{
				title: 'Apply it and check',
				questions: [
					{ q: 'Which command loads every `sysctl.d` file now, without a reboot?', options: ['`sudo sysctl --system`', '`sudo systemctl daemon-reload`', '`sudo sysctl -a`', '`sudo modprobe sysctl`'], answer: 0, why: '`sysctl --system` reads all the config directories in the same order as at boot. `sysctl -a` only lists values.' },
					{ q: 'Which command applies only your new file?', options: ['`sudo sysctl -w /etc/sysctl.d/90-somaxconn.conf`', '`sudo sysctl -n /etc/sysctl.d/90-somaxconn.conf`', '`sudo sysctl -p /etc/sysctl.d/90-somaxconn.conf`', '`sudo cat /etc/sysctl.d/90-somaxconn.conf > /proc/sys`'], answer: 2, why: '`sysctl -p <file>` loads the settings from that one file.' },
					{ q: 'How do you check the running value?', options: ['`grep somaxconn /etc/sysctl.d/*.conf`', '`cat /proc/sys/net/core/somaxconn`', '`systemctl status systemd-sysctl`', '`journalctl -k | grep somaxconn`'], answer: 1, why: 'The file under `/proc/sys`, or `sysctl net.core.somaxconn`, shows what the kernel uses now. The config file only says what you asked for.' },
					{ q: 'Redis was already running before the change. What else do you do?', options: ['Nothing, its queue grows on the next connection', 'Run `sysctl --system` a second time', 'Reboot, because sockets read the value at boot', 'Restart Redis so it calls `listen()` again'], answer: 3, why: 'The cap is applied when `listen()` runs. A socket that is already listening keeps its old queue length.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Redis has `tcp-backlog 1024`. `/proc/sys/net/core/somaxconn` holds 128. What happens when Redis calls `listen()`?',
			options: [
				'`listen()` fails with `EINVAL` and Redis exits at startup',
				'`listen()` returns 0 and the queue is silently capped at 128',
				'The kernel raises `somaxconn` to 1024 for the whole machine',
				'The kernel uses 1024 and logs a warning in `dmesg`'
			],
			answer: 1,
			why: '`__sys_listen_socket` in `net/socket.c` replaces any backlog larger than `somaxconn` with `somaxconn` and goes on. No error is returned and the kernel writes no log line. The warning comes from Redis, which reads the file itself.'
		},
		{
			q: '`/usr/lib/sysctl.d/99-vendor.conf` sets `net.core.somaxconn = 512`. You add `/etc/sysctl.d/60-local.conf` with `net.core.somaxconn = 1024`. What does the server have after a reboot?',
			options: [
				'1024, because files in `/etc` always win over files in `/usr/lib`',
				'1024, because `/etc/sysctl.conf` is read before the other files',
				'512, because `99-vendor.conf` sorts after `60-local.conf` and is applied later',
				'4096, because `systemd-sysctl` refuses two files that set the same key'
			],
			answer: 2,
			why: 'All files are sorted by file name across the directories, and the lexicographically latest file wins for a key. `/etc` only wins over a file with the same name. For that reason sysctl.d(5) recommends 10 to 40 for vendor files and 60 to 90 for local ones.'
		},
		{
			q: 'You run `sysctl -w net.core.somaxconn=8192` on a Docker host and restart the Redis container. Redis inside it still sees a lower value. Why?',
			options: [
				'Docker copies the host values into a container only when the daemon starts',
				'The value needs a reboot before any process can read it',
				'The container sees the host value until its image is rebuilt',
				'The container has its own network namespace, which starts at 4096'
			],
			answer: 3,
			why: '`somaxconn` is stored per network namespace, and `preinit_net_sysctl` sets it to `SOMAXCONN` (4096) for each new one. The host write changed only the host namespace. Set it for the container, for example with `securityContext.sysctls` in a Kubernetes pod.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Watch the kernel cap a listen backlog with no error, make Redis warn about it, and write the file that keeps a value across reboots.',
		steps: [
			'Read the values: `sysctl net.core.somaxconn fs.file-max fs.file-nr`, then `cat /proc/sys/net/core/somaxconn`.',
			'Ask for a backlog of 10000 and read what you got: `python3 -c \'import socket,subprocess; s=socket.socket(); s.bind(("127.0.0.1",8099)); s.listen(10000); print(subprocess.run(["ss","-lnt","sport = :8099"],capture_output=True,text=True).stdout)\'`.',
			'Start Redis in a container whose network namespace has `somaxconn` at 128: `docker run --rm --sysctl net.core.somaxconn=128 redis:7-alpine sh -c \'redis-server --daemonize yes --logfile /tmp/r.log; sleep 1; grep -i backlog /tmp/r.log; cat /proc/sys/net/core/somaxconn\'`.',
			'Run the same command without `--sysctl net.core.somaxconn=128`, then `cat /proc/sys/net/core/somaxconn` on the host.',
			'Write the file that would set 8192 on every boot: `mkdir -p ~/sysctl-lab && printf \'net.core.somaxconn = 8192\\n\' > ~/sysctl-lab/90-somaxconn.conf`, then try it as a normal user: `sysctl -p ~/sysctl-lab/90-somaxconn.conf; sysctl net.core.somaxconn`.'
		],
		done: [
			'In step 2, the `Send-Q` column of the `LISTEN` line shows 4096 (your `somaxconn`), not 10000, and Python printed no error.',
			'In step 3, Redis logs "The TCP backlog setting of 511 cannot be enforced because /proc/sys/net/core/somaxconn is set to the lower value of 128", and the container reads 128.',
			'In step 4, Redis logs no backlog warning, the container reads 4096, and the host value did not change.',
			'In step 5, `sysctl -p` prints `permission denied on key "net.core.somaxconn", ignoring` (then echoes the line it read, `= 8192`), and the last `sysctl net.core.somaxconn` still prints 4096.'
		],
		solution: [
			'For a listening socket, `ss -lnt` shows the backlog in `Send-Q`. The kernel lowered 10000 to `somaxconn` in `__sys_listen_socket`, and `listen()` returned 0.',
			'`--sysctl` sets the value in the container\'s own network namespace. Without it, the namespace starts at `SOMAXCONN`, 4096, whatever the host has.',
			'`sysctl -p` read your file and tried to write it, but writing `/proc/sys` needs root, so it ignored the key. On a machine you own, copy the file to `/etc/sysctl.d/90-somaxconn.conf`, run `sudo sysctl --system`, and check with `sysctl net.core.somaxconn`.'
		]
	},
	recall: {
		q: 'A program calls `listen(fd, 511)` while `net.core.somaxconn` is 128. What queue length does it get, and where do you put a value that survives a reboot?',
		a: '128: the kernel caps the backlog in `__sys_listen_socket` with no error. To keep a new value, write `net.core.somaxconn = 4096` in a `.conf` file under `/etc/sysctl.d`, applied at boot by `systemd-sysctl.service` or now by `sysctl --system`.'
	},
	sources: [
		{ title: 'sysctl(8), man7.org', url: 'https://man7.org/linux/man-pages/man8/sysctl.8.html' },
		{ title: 'sysctl.d(5), systemd', url: 'https://www.freedesktop.org/software/systemd/man/latest/sysctl.d.html' },
		{ title: 'listen(2), man7.org', url: 'https://man7.org/linux/man-pages/man2/listen.2.html' },
		{ title: 'Linux kernel docs, IP sysctl (somaxconn)', url: 'https://docs.kernel.org/networking/ip-sysctl.html' },
		{ title: 'Linux kernel docs, Documentation for /proc/sys/fs/', url: 'https://docs.kernel.org/admin-guide/sysctl/fs.html' },
		{ title: 'Kubernetes docs, Using sysctls in a Kubernetes Cluster', url: 'https://kubernetes.io/docs/tasks/administer-cluster/sysctl-cluster/' },
		{ title: 'Redis source, redis.conf (tcp-backlog)', url: `${REDIS}/redis.conf#L141-L148` },
		{ title: 'Linux source, net/socket.c (__sys_listen_socket)', url: `${LINUX}/net/socket.c#L1883-L1895` }
	]
};
