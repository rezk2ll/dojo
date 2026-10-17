const PROCPS = 'https://gitlab.com/procps-ng/procps/-/blob/66b48a3720d46f304f0fa76f720ca925fa48d97e';
const READPROC = `${PROCPS}/library/readproc.c`;
const OUTPUT = `${PROCPS}/src/ps/output.c`;
const PIDS = `${PROCPS}/library/pids.c`;
const MAN = 'https://man7.org/linux/man-pages/man5';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'proc',
	part: 'Processes',
	title: 'Reading /proc',
	minutes: 10,
	hook: [
		'`ps -o pid,stat,rss,args -p 4124475` prints one line: `4124475 SN 2320 sleep 300`. Run it under `strace -e trace=openat` (chapter 07) and it makes no special call to the kernel. It opens text files.',
		'On the machine used for this chapter, that one `ps` opened `/proc/<pid>/stat` 749 times, once per process, plus `status` and `cmdline` for each. Its tries on `/proc/1/environ` and the other root processes failed with `EACCES`.',
		'You can read the same files with `cat`. **`RSS` is the `VmRSS:  2320 kB` line of `/proc/4124475/status`**, and `COMMAND` is `/proc/4124475/cmdline` with its null bytes turned into spaces.'
	],
	terms: [
		{ term: '/proc', def: 'A pseudo-filesystem: proc(5) calls it "an interface to kernel data structures". The files in it are not stored on any disk. The kernel writes the text of a file at the moment you read it.' },
		{ term: '/proc/<pid>', def: 'One directory per process, named by its PID, with files such as `stat`, `status`, `cmdline`, `environ`, `limits` and the `fd/` directory (chapter 05). `/proc/self` points at the reader\'s own directory.' },
		{ term: 'RSS', def: 'Resident set size: the memory of a process that is in RAM right now, in kB in the `VmRSS` line of `status`. Chapter 09 compares it to the virtual size.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['ps["ps -o pid,stat,rss,args -p 4124475"] -->|"openat /proc, O_DIRECTORY"| dir["/proc: 1, 2, 3 ... 4124475"]'],
				highlight: ['ps', 'dir'],
				note: '`ps` opens `/proc` as a directory and reads its entries. Each numeric name is a running process. Even with `-p 4124475`, procps-ng 4.0.4 walked all 749 of them on this machine.'
			},
			{
				add: ['dir --> stat["/proc/4124475/stat: one line, field 3 = S"]'],
				highlight: ['stat'],
				note: 'For each PID, `ps` reads `stat` first, always: the comment in procps says it does so "to ensure a \'cmd\' name as a minimum". `stat` is one line of space-separated fields. Field 3 is the state, `S` for sleeping, and `ps` prints it in the `STAT` column.'
			},
			{
				add: ['dir --> status["/proc/4124475/status: VmRSS: 2320 kB, PPid, Uid, Threads"]'],
				highlight: ['status'],
				note: 'Next it reads `status`, which holds much of the data of `stat` and `statm` with a name on each line. The `RSS` column is `VmRSS` from this file: 2320 kB. The man page warns that `VmRSS` "is inaccurate" because of a scalability shortcut, and points to `smaps_rollup` for exact numbers.'
			},
			{
				add: ['dir --> cmd["/proc/4124475/cmdline: sleep\\0300\\0"]', 'cmd --> out["COMMAND: sleep 300"]'],
				highlight: ['cmd', 'out'],
				note: '`cmdline` holds the arguments separated by null bytes: `od -c` shows `s l e e p \\0 3 0 0 \\0`. `ps` joins them with spaces. Kernel threads have an empty `cmdline`, so `ps` prints the name in brackets, like `[kthreadd]` for PID 2.'
			},
			{
				add: ['out --> line["4124475 SN 2320 sleep 300"]'],
				highlight: ['line'],
				note: '`ps` prints one line from the three files. The process can rewrite its own `argv` strings, and `cmdline` shows the new text: the man page calls it "the command line that the process wants you to see".'
			}
		]
	},
	example: {
		title: 'library/readproc.c (procps-ng v4.0.7): simple_readproc, the files ps opens',
		repo: 'procps-ng/procps',
		url: `${READPROC}#L1240-1321`,
		lang: 'c',
		code: `static proc_t *simple_readproc(PROCTAB *restrict const PT, proc_t *restrict const p) {
    static __thread struct utlbuf_s ub = { NULL, 0 };    // buf for stat,statm,status,cgroup
    static __thread struct stat sb;     // stat() buffer
    unsigned flags = PT->flags;
    int rc = 0;

    if (fstat(PT->pidfd, &sb) == -1)              /* no such dirent (anymore) */
        goto next_proc;

    if ((flags & PROC_UID) && !XinLN(uid_t, sb.st_uid, PT->uids, PT->nuid))
        goto next_proc;                      /* not one of the requested uids */

    p->euid = sb.st_uid;                        /* need a way to get real uid */
    p->egid = sb.st_gid;                        /* need a way to get real gid */

    /* this attempted read of 'stat' is now unconditional to ensure a 'cmd' name
       as a minimum. this prevents a NULL 'cmdline' pointer for kernel threads
       in case the 'status' file is missing or not otherwise read ... */
    if (file2str(PT->pidfd, "stat", &ub) == -1)
        goto next_proc;
    rc += stat2proc(ub.buf, p);
…
    if (flags & PROC_FILLMEM) {                 // read /proc/#/statm
        if (file2str(PT->pidfd, "statm", &ub) != -1)
            statm2proc(ub.buf, p);
    }

    if (flags & PROC_FILLSTATUS) {              // read /proc/#/status
        if (file2str(PT->pidfd, "status", &ub) != -1){
            rc += status2proc(ub.buf, p, 1);
…
        }
    }

    if (flags & PROC_FILLENV)                   // read /proc/#/environ
        if (!(p->environ_v = file2strvec(PT->pidfd, "environ")))
            rc += vectorize_dash_rc(&p->environ_v);
    if (flags & PROC_EDITENVRCVT)
        rc += fill_environ_cvt(PT->pidfd, p);

    if (flags & PROC_FILLARG)                   // read /proc/#/cmdline
        if (!(p->cmdline_v = file2strvec(PT->pidfd, "cmdline")))
            rc += vectorize_dash_rc(&p->cmdline_v);
    if (flags & PROC_EDITCMDLCVT)
        rc += fill_cmdline_cvt(PT->pidfd, p);`,
		notes: [
			'Line 7 calls `fstat` on the `/proc/<pid>` directory. Lines 13 and 14 take the owner of that directory as the effective UID and GID: the comment "need a way to get real uid" says the real UID comes later, from `status`.',
			'Lines 19 to 21 read `stat` for every process, with no flag check. A process that exits between the directory listing and this read makes `file2str` fail, and line 20 skips it.',
			'Lines 28 to 30 read `status` only when a column needs it. In [`pids.c`](' + PIDS + '#L625), `VM_RSS` is marked `f_status`, so asking for `rss` sets this flag. [`pr_rss()`](' + OUTPUT + '#L1036-1039) prints that number as the `RSS` column.',
			'Lines 35 and 41 read `environ` and `cmdline` with `file2strvec`, which splits the file on null bytes. When `environ` is refused, as it was for PID 1 here, line 37 fills in a `-` instead of failing.'
		]
	},
	tradeoff: {
		gain: [
			'`grep -E \'State|PPid|VmRSS|Threads\' /proc/<pid>/status` works in a minimal container image that has no `ps` installed.',
			'`/proc/<pid>/limits` shows the limits the running process has, which can differ from what `ulimit -n` says in your shell.'
		],
		cost: [
			'Each `ps` reads at least one file per process: 749 `stat` files here, even for `-p` with one PID. A monitoring agent that runs `ps` every second does that work every second.',
			'A process can change what `cmdline` shows, so the `COMMAND` column is not proof of what binary runs. `ls -l /proc/<pid>/exe` shows the real file.',
			'`environ` shows only the environment given at `execve`, and `putenv()` calls made later do not appear in it.'
		]
	},
	task: {
		prompt: 'Start `sleep 300 &` and note its PID. Read `/proc/<pid>/status`, `/proc/<pid>/cmdline` (pipe it through `tr \'\\0\' \' \'`) and the `Max open files` line of `/proc/<pid>/limits`. Then run `ps -o pid,stat,rss,args -p <pid>`. Match each `ps` column to a line you read.',
		hint: '`grep -E \'State|PPid|VmRSS|Threads\' /proc/<pid>/status` keeps the lines you need.',
		answer: [
			'Run for this chapter: `State: S (sleeping)`, `PPid: 4124473` (the shell), `Threads: 1`, `VmRSS: 2320 kB`. `cmdline` gives `sleep 300`.',
			'`limits` shows `Max open files 1048576 1048576 files`: the soft limit, the hard limit and the unit.',
			'`ps` printed `4124475 SN 2320 sleep 300`. `S` is the state from `stat`, `2320` is `VmRSS` from `status`, and `sleep 300` is `cmdline` joined with spaces.',
			'The `N` after `S` is "low-priority" in ps(1). `ps -o ni` printed `5` for a background `sleep` on this machine, so the shell started it with a nice value of 5.'
		]
	},
	quiz: [
		{
			q: 'Where does `ps` get the number in its `RSS` column on Linux?',
			options: [
				'From the `VmRSS` line of `/proc/<pid>/status`',
				'From a system call that asks the kernel for the memory of one process',
				'From `/proc/meminfo`, divided between the running processes',
				'From the size of `/proc/<pid>/mem` on disk'
			],
			answer: 0,
			why: 'In procps-ng, the `rss` column is `PIDS_VM_RSS`, which the library fills from `status`. `ps` has no special kernel call: it opens and parses text files under `/proc`.'
		},
		{
			q: '`cat /proc/1234/cmdline` prints `nginx: worker process`. What does that prove about the binary?',
			options: [
				'The binary file is named `nginx: worker process`',
				'The kernel checked the binary against its argv when it started',
				'Nothing: the process can rewrite argv, and `cmdline` shows that',
				'The process was started by a shell with that exact command line'
			],
			answer: 2,
			why: '`cmdline` shows the argv memory of the process. If the process modifies those strings after `execve`, the change appears in the file. `/proc/1234/exe` is a link to the binary that really runs.'
		},
		{
			q: 'As a normal user, `cat /proc/1/environ` fails with `Permission denied` while `cat /proc/1/status` works. Why?',
			options: [
				'`environ` is stored on disk with mode 600, readable by root only',
				'`environ` passes a ptrace access check first, and you fail it for root',
				'PID 1 has no environment, so the kernel returns an error instead',
				'Only `cmdline` and `environ` are protected, to save memory'
			],
			answer: 1,
			why: 'proc_pid_environ(5): access is "governed by a ptrace access mode PTRACE_MODE_READ_FSCREDS check". Your user cannot pass it for a root process. `status` has no such check.'
		}
	],
	recall: {
		q: 'Which three files under `/proc/<pid>` give `ps -o stat,rss,args` its three columns?',
		a: '`stat` (field 3, the state), `status` (the `VmRSS` line, in kB) and `cmdline` (arguments separated by null bytes).'
	},
	sources: [
		{ title: 'proc(5), Linux manual page', url: `${MAN}/proc.5.html` },
		{ title: 'proc_pid_status(5), Linux manual page', url: `${MAN}/proc_pid_status.5.html` },
		{ title: 'proc_pid_cmdline(5), Linux manual page', url: `${MAN}/proc_pid_cmdline.5.html` },
		{ title: 'proc_pid_environ(5), Linux manual page', url: `${MAN}/proc_pid_environ.5.html` },
		{ title: 'proc_pid_limits(5), Linux manual page', url: `${MAN}/proc_pid_limits.5.html` },
		{ title: 'procps-ng v4.0.7, library/readproc.c', url: READPROC }
	]
};
