const PROCPS = 'https://gitlab.com/procps-ng/procps/-/blob/9bd4021f13bc3148e5753d4195669917dad14135';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'capstone',
	part: 'Containers from the kernel up',
	title: 'A slow server in 60 seconds',
	minutes: 10,
	hook: [
		'Brendan Gregg\'s 2015 post on the Netflix tech blog opens with a question: "You login to a Linux server with a performance issue: what do you check in the first minute?" His answer is ten commands: `uptime`, `dmesg | tail`, `vmstat 1`, `mpstat -P ALL 1`, `pidstat 1`, `iostat -xz 1`, `free -m`, `sar -n DEV 1`, `sar -n TCP,ETCP 1` and `top`.',
		'The output in this chapter comes from the 16-CPU laptop used to write it, on Linux 6.17. Two containers, `dojo-slow` and `dojo-slow2`, each run 32 shell loops that never sleep. Six and a half minutes after the first one starts, `uptime` prints `load average: 73.08, 50.69, 24.90`.',
		'The post says to "look for errors and saturation metrics" first, and defines saturation as a resource that "has more load than it can handle". The ten commands below find **which resource is saturated**, clear the others, and lead to the process and the container.'
	],
	terms: [
		{ term: 'Saturation', def: 'Work that a resource cannot take yet, so it waits. The post: it can be seen "either as the length of a request queue, or time spent waiting". For CPUs, the queue is the runnable tasks.' },
		{ term: 'USE method', def: 'Gregg\'s checklist: for every resource (CPUs, memory, disks, network), check utilization, saturation and errors. Each resource you clear narrows the search.' },
		{ term: 'Runnable task', def: 'A task running on a CPU or waiting for one. vmstat counts them in the `r` column, from `procs_running` in `/proc/stat`.' },
		{ term: '%wait', def: 'A pidstat column: the share of CPU time a task spent "waiting to run". It counts time in the run queue. Time waiting for disk shows up elsewhere, as `wa` in vmstat.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['up["uptime: 73.08, 50.69, 24.90"] --> dm["dmesg | tail: Operation not permitted"]'],
				highlight: ['up', 'dm'],
				note: 'The 1-minute average is three times the 15-minute one, so the load is rising (chapter 6). Load counts tasks waiting for disk too, so it does not name the resource yet. `dmesg` fails because `kernel.dmesg_restrict = 1` requires CAP_SYSLOG (chapter 36); with sudo it shows kernel messages, and Gregg\'s example has an OOM kill (chapter 11).'
			},
			{
				add: ['dm --> vm["vmstat 1: r 67 to 80, us 96 to 98, id 0, wa 0"]'],
				highlight: ['vm'],
				note: 'Gregg: "an “r” value greater than the CPU count is saturation". Here `r` is 67 to 80 on 16 CPUs. `us` is 96 to 98 and `wa` is 0, so the CPUs run user code and no task waits for disk. `so` is 0 after the first line, and `si` is 0 except two seconds at 148 and 4 (chapter 12).'
			},
			{
				add: ['vm --> mp["mpstat: all CPUs at 92 to 100 %usr"]', 'mp --> pid["pidstat: 64 sh processes, %wait 78 on average"]'],
				highlight: ['mp', 'pid'],
				note: 'mpstat shows `all` at 98.37 %usr and each CPU between 92 and 100, so the load is spread out and not one hot thread. pidstat lists 64 `sh` processes as root. Their average is 21 %usr and 78.5 %wait: each loop spends most of its time in the run queue.'
			},
			{
				add: ['pid --> clear["iostat, free, sar: disk, memory and network cleared"]'],
				highlight: ['clear'],
				note: '`iostat -xz 1`: nvme0n1 at 0.50 %util and `aqu-sz` 0.01 (chapter 22). `free -m`: 19,122 MB available, 17,198 MB in buff/cache (chapter 10). `sar -n DEV 1`: 0.35 rxkB/s on the Wi-Fi interface. `sar -n TCP,ETCP 1`: `retrans/s` 0.00.'
			},
			{
				add: ['clear --> top["top: 65 running, sh at 100 %CPU"]', 'top --> cg["/proc/102713/cgroup: docker-99bc8f06....scope"]'],
				highlight: ['top', 'cg'],
				note: '`top` agrees with the rolling tools: `65 running`, 0.0 id, `sh` processes at 50 to 100 %CPU. The cgroup file of one `sh` PID names `/system.slice/docker-99bc8f06fddc....scope`, and `docker ps --no-trunc` maps that ID to `dojo-slow` (chapter 34).'
			}
		]
	},
	example: {
		title: 'procps src/vmstat.c: why the first line of vmstat 1 is different',
		repo: 'procps-ng/procps',
		url: `${PROCPS}/src/vmstat.c#L469-L571`,
		lang: 'c',
		code: `#define V(n) fields[n].value
	V( 0) = SYSv(stat_PRU);
	V( 1) = SYSv(stat_PBL);
	V( 2) = unitConvert(MEMv(mem_SUS));
	V( 3) = unitConvert(MEMv(mem_FREE));
	V( 4) = unitConvert((a_option?MEMv(mem_INA):MEMv(mem_BUF)));
	V( 5) = unitConvert((a_option?MEMv(mem_ACT):MEMv(mem_CAC)));
	V( 6) = (unsigned)( unitConvert(VMSTAT_GET(vm_info, VMSTAT_PSWPIN, ul_int)  * kb_per_page) / uptime );
	V( 7) = (unsigned)( unitConvert(VMSTAT_GET(vm_info, VMSTAT_PSWPOUT, ul_int)  * kb_per_page) / uptime );
	V( 8) = (unsigned)( VMSTAT_GET(vm_info, VMSTAT_PGPGIN, ul_int) / uptime );
	V( 9) = (unsigned)( VMSTAT_GET(vm_info, VMSTAT_PGPGOUT, ul_int) / uptime );
	V(10) = (unsigned)( SYSv(stat_INT) / uptime );
	V(11) = (unsigned)( SYSv(stat_CTX) / Div );
	V(12) = (100*cpu_use + divo2) / Div;
	V(13) = (100*cpu_sys + divo2) / Div;
	V(14) = (100*cpu_idl + divo2) / Div;
	V(15) = (100*cpu_iow + divo2) / Div;
	V(16) = (100*cpu_sto + divo2) / Div;
	V(17) = (100*cpu_gue + divo2) / Div;
#undef V

	output_line(fields, timebuf);
…
#define V(n) fields[n].value
	V( 0) = SYSv(stat_PRU);
	V( 1) = SYSv(stat_PBL);
	V( 2) = unitConvert(MEMv(mem_SUS));
	V( 3) = unitConvert(MEMv(mem_FREE));
	V( 4) = unitConvert((a_option?MEMv(mem_INA):MEMv(mem_BUF)));
	V( 5) = unitConvert((a_option?MEMv(mem_ACT):MEMv(mem_CAC)));
	V( 6) = (unsigned)( ( unitConvert((pswpin [tog] - pswpin [!tog])*kb_per_page)+sleep_half )/sleep_time );
	V( 7) = (unsigned)( ( unitConvert((pswpout [tog] - pswpout [!tog])*kb_per_page)+sleep_half )/sleep_time );
	V( 8) = (unsigned)( (  pgpgin [tog] - pgpgin [!tog]           +sleep_half )/sleep_time );
	V( 9) = (unsigned)( (  pgpgout[tog] - pgpgout[!tog]           +sleep_half )/sleep_time );
	V(10) = (unsigned)( (  DSYSv(stat_INT)           +sleep_half )/sleep_time );
	V(11) = (unsigned)( (  DSYSv(stat_CTX)           +sleep_half )/sleep_time );
	V(12) = (100*cpu_use + divo2) / Div;
	V(13) = (100*cpu_sys + divo2) / Div;
	V(14) = (100*cpu_idl + divo2) / Div;
	V(15) = (100*cpu_iow + divo2) / Div;
	V(16) = (100*cpu_sto + divo2) / Div;
	V(17) = (100*cpu_gue + divo2) / Div;
#undef V

	output_line(fields, timebuf);`,
		notes: [
			'Lines 2 and 3 fill `r` and `b` with `procs_running` and `procs_blocked` from `/proc/stat`, which proc_stat(5) defines as tasks "in runnable state" and tasks "blocked waiting for I/O to complete". The vmstat(8) man page: these reports "are instantaneous".',
			'Lines 8 and 9 compute `si` and `so` for the first line: all pages swapped since boot, divided by `uptime`. The man page: "The first report produced gives averages since the last reboot." This is why Gregg says to skip the first line.',
			'Line 13 divides the context switch total by `Div`, the sum of CPU ticks since boot, where lines 8 to 12 divide by `uptime`. In the capture, the first line shows `cs` 41, and the next ones 45,563 to 304,830.',
			'Lines 31, 32 and 36 belong to the loop: each line subtracts the previous sample and divides by `sleep_time`, which is the `1` in `vmstat 1`. The result is a rate per second over the last interval.',
			'Lines 37 to 42 turn CPU ticks into percentages of `Div`, the user, system, idle, iowait and stolen ticks of the interval. `us` 98 and `id` 0 mean almost every tick ran user code.'
		]
	},
	tradeoff: {
		gain: [
			'The ten commands read counters the kernel already keeps, such as `/proc/stat`, and print in seconds without installing a tracer.',
			'In the capture, `iostat`, `free` and `sar` cleared disk, memory and network in under a minute, which left the CPUs and the 64 `sh` processes.'
		],
		cost: [
			'Four of the ten need the sysstat package. On this laptop `mpstat`, `pidstat`, `iostat` and `sar` were missing; they ran from an `alpine:3.20` container with `--pid=host --network host` and `apk add sysstat`.',
			'`dmesg` needs CAP_SYSLOG when `kernel.dmesg_restrict` is 1, which was the case here.',
			'The commands name the saturated resource and the process using it. To see which code runs, the post\'s follow-on section points to a tutorial on profiling and tracing (chapters 7 and 39).',
			'`top` clears the screen, so the post warns that evidence of intermittent issues "can also be lost". `vmstat` and `pidstat` print rolling lines you can paste into notes.'
		]
	},
	task: {
		prompt: 'This output is from Gregg\'s post, on a server with 32 CPUs. `uptime`: `load average: 30.02, 26.43, 19.02`. `vmstat 1`: `r` 32 to 34, `b` 0, `us` 96 to 99, `wa` 0, `si` and `so` 0. `pidstat 1`: two `java` processes at 1591 and 1573 %CPU. Name the saturated resource, if any, the process, and the next command you would run.',
		hint: 'Compare `r` to the CPU count, and read the %CPU of the java lines as a number of CPUs.',
		answer: [
			'The load is rising: 30 for 1 minute against 19 for 15 minutes. `wa` 0 and `b` 0 rule out disk, and `si`/`so` 0 rule out swapping.',
			'`r` is 32 to 34 on 32 CPUs: the CPUs are fully used and right at saturation. The post: "This isn’t necessarily a problem; check for the degree of saturation using the “r” column."',
			'pidstat\'s %CPU is summed across CPUs, so 1591 % is almost 16 CPUs for one java process, and the two together hold nearly all 32.',
			'Next: run `mpstat -P ALL 1` to check the load is spread across CPUs, then profile the java processes to see which code uses the CPU.'
		],
		steps: [
			{
				title: 'Read uptime',
				questions: [
					{ q: '`load average: 30.02, 26.43, 19.02`. What does the trend say?', options: ['The load is falling', 'The load is rising: 30 for 1 minute against 19 for 15', 'The load has been flat for 15 minutes', 'The server just rebooted'], answer: 1, why: 'The three numbers are the 1, 5 and 15 minute averages. The 1-minute one is the highest, so load is going up.' },
					{ q: 'Does the load average name the busy resource?', options: ['Yes, load counts only tasks on a CPU', 'Yes, a load above the CPU count means disk', 'No, Linux load also counts tasks waiting for disk', 'No, load only counts network waits'], answer: 2, why: 'Linux load averages include tasks "blocked in uninterruptible I/O", so load alone cannot tell CPU from disk.' },
					{ q: 'A load of 30 on 32 CPUs. Is that saturation by itself?', options: ['You cannot tell yet, you need a column that splits CPU from disk', 'Yes, any load over 16 saturates 32 CPUs', 'No, load is only a problem above 100', 'Yes, the 1-minute value is always saturation'], answer: 0, why: 'Load mixes runnable and disk-blocked tasks. The next command, `vmstat 1`, splits them into `r` and `b`.' },
					{ q: 'Your next command, `dmesg | tail`, fails with `Operation not permitted`. Why?', options: ['The kernel log is empty', '`dmesg` needs the sysstat package', 'The load is too high to read the log', '`kernel.dmesg_restrict` is 1, so it needs CAP_SYSLOG'], answer: 3, why: 'With `kernel.dmesg_restrict` at 1, reading the kernel log needs CAP_SYSLOG. Run it with `sudo`.' }
				]
			},
			{
				title: 'Read vmstat',
				questions: [
					{ q: '`r` is 32 to 34 on 32 CPUs. What does it say?', options: ['The CPUs are idle', 'The CPUs are fully used, right at saturation', 'The disks are saturated', 'Memory is running out'], answer: 1, why: 'Gregg: an `r` value greater than the CPU count is saturation. 32 to 34 on 32 CPUs is right at the edge.' },
					{ q: 'What do `b` 0 and `wa` 0 rule out?', options: ['Disk: no task is blocked on I/O', 'Network: no packets are queued', 'Swapping: no pages move', 'CPU: no task is waiting'], answer: 0, why: '`b` counts tasks "blocked waiting for I/O to complete", and `wa` is CPU time waiting for disk. Both at 0 clear the disk.' },
					{ q: 'What do `si` and `so` at 0 rule out?', options: ['Disk reads', 'Network retransmits', 'Swapping', 'CPU steal'], answer: 2, why: '`si` and `so` are pages swapped in and out per second. Zero after the first line means no swapping.' },
					{ q: '`us` is 96 to 99. Where is the CPU time going?', options: ['Into the kernel', 'Into waiting for disk', 'To other virtual machines', 'Into user code'], answer: 3, why: '`us` is the share of ticks that ran user code. Almost every tick ran application code.' }
				]
			},
			{
				title: 'Read pidstat',
				questions: [
					{ q: 'A `java` process shows 1591 %CPU. How many CPUs is that?', options: ['About 1.6', 'About 16', 'About 159', 'About 32'], answer: 1, why: 'pidstat\'s %CPU is summed across CPUs, so 100% is one CPU and 1591% is almost 16.' },
					{ q: 'What do the two java lines together hold?', options: ['Nearly all 32 CPUs', 'About half the CPUs', 'One CPU each', 'Less than the idle time'], answer: 0, why: '1591% plus 1573% is about 31.6 CPUs out of 32.' },
					{ q: 'So which process do you name?', options: ['The kernel', 'Whichever process has the lowest PID', 'The two `java` processes', '`pidstat` itself'], answer: 2, why: 'They hold the CPU time that `vmstat` showed as `us`.' },
					{ q: 'Which resource is saturated, if any?', options: ['Disk', 'Memory', 'Network', 'CPU, right at its limit'], answer: 3, why: '`r` matches the CPU count, `us` is near 100, and disk and swap are clear. The CPUs are the busy resource.' }
				]
			},
			{
				title: 'Pick the next command',
				questions: [
					{ q: 'Is `r` at the CPU count always a problem?', options: ['Not necessarily: check the degree of saturation with `r`', 'Yes, it always means an outage', 'No, `r` never matters on Linux', 'Only if `wa` is also high'], answer: 0, why: 'The post: "This isn’t necessarily a problem; check for the degree of saturation using the “r” column."' },
					{ q: 'Which command checks that the load is spread across CPUs?', options: ['`iostat -xz 1`', '`mpstat -P ALL 1`', '`free -m`', '`sar -n TCP,ETCP 1`'], answer: 1, why: '`mpstat -P ALL 1` prints each CPU. Even numbers mean the work is spread out, not one hot thread.' },
					{ q: 'After that, how do you find which code uses the CPU?', options: ['Run `top` for longer', 'Add more CPUs and compare', 'Profile the java processes', 'Read `dmesg` again'], answer: 2, why: 'The ten commands name the resource and the process. A profiler shows which code runs.' },
					{ q: 'Why paste `vmstat` and `pidstat` lines into your notes rather than a `top` screen?', options: ['`top` cannot show %CPU', '`top` needs the sysstat package', '`top` hides the java processes', '`top` clears the screen, so evidence of an intermittent issue can be lost'], answer: 3, why: 'The post warns that with `top`, evidence of intermittent issues "can also be lost". `vmstat` and `pidstat` print rolling lines.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'The first line of `vmstat 1` shows `si 3 so 56`, and every line after shows 0. Why?',
			options: [
				'The first line averages all swapping since boot over the uptime',
				'The first line counts swapping during vmstat\'s own startup',
				'The kernel resets the swap counters after the first read',
				'The first line shows pages, the later lines show kilobytes'
			],
			answer: 0,
			why: 'vmstat.c divides the swap totals by the uptime for the first line, and the man page says "The first report produced gives averages since the last reboot." Later lines subtract the previous sample and divide by the interval.'
		},
		{
			q: 'Load average is 73 on a 16-CPU server. Which number tells you the CPUs are saturated, without counting tasks waiting for disk?',
			options: [
				'The `wa` column of `vmstat 1`',
				'The `r` column of `vmstat 1`, compared to the CPU count',
				'The 15-minute load average, compared to the 1-minute one',
				'The `%util` column of `iostat -xz 1`'
			],
			answer: 1,
			why: 'Linux load averages include tasks "blocked in uninterruptible I/O". Gregg: `r` "provides a better signal than load averages for determining CPU saturation, as it does not include I/O". In the capture, `r` was 67 to 80 on 16 CPUs.'
		},
		{
			q: 'pidstat shows an `sh` process at 21 %usr and 78 %wait. What was it doing most of the time?',
			options: [
				'Waiting for a disk read to complete',
				'Sleeping in a `wait` call for its child processes',
				'Runnable and waiting in the queue for a CPU',
				'Stopped by the cgroup CPU limit of its container'
			],
			answer: 2,
			why: 'pidstat(1) defines %wait as the "Percentage of CPU spent by the task while waiting to run". With 64 busy loops on 16 CPUs, each loop ran about a fifth of the time and waited the rest.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Saturate your own CPUs from a container, then find the resource, the process and the container with the first-minute commands.',
		steps: [
			'Start twice as many busy loops as you have CPUs: `N=$(( $(nproc) * 2 )); docker run -d --name slow-lab -e N=$N busybox sh -c \'for i in $(seq $N); do (while :; do :; done) & done; wait\'`. Your laptop will be slow until the last step.',
			'Wait half a minute, then run `uptime` and `vmstat 1 5`. Compare `r` with `nproc`, and read `us`, `id` and `wa`.',
			'Clear memory and disk: `free -m`, and `iostat -xz 1 3` if sysstat is installed.',
			'Find a busy process and its cgroup: `PID=$(ps -eo pid,comm,pcpu --sort=-pcpu | awk \'$2=="sh"{print $1; exit}\'); cat /proc/$PID/cgroup`.',
			'Map the cgroup to a container: `ID=$(sed \'s/.*docker-\\(.*\\)\\.scope/\\1/\' /proc/$PID/cgroup); docker ps --no-trunc --format \'{{.ID}} {{.Names}}\' | grep "$ID"`. Stop the load with `docker rm -f slow-lab`.'
		],
		done: [
			'The 1-minute load average is above the 15-minute one and climbing.',
			'After the first line, `vmstat` shows `r` at about twice `nproc` or more, `us` above 80, `id` at 0 and `wa` at 0.',
			'`free -m` still shows memory available, and `iostat` (if run) shows low `%util`.',
			'`/proc/$PID/cgroup` names a `docker-<id>.scope`, and the `docker ps` line prints `slow-lab`.'
		],
		solution: [
			'`r` above the CPU count with `wa` 0 is CPU saturation, not disk: Gregg says `r` "does not include I/O", unlike the load average.',
			'The first `vmstat` line averages since boot, so read from the second line on.',
			'A container is a cgroup on the host (chapter 34), so the cgroup path of any busy PID leads to the container ID, and `docker ps --no-trunc` turns that ID into a name.'
		]
	},
	recall: {
		q: 'Name Gregg\'s ten commands in order, and the column that shows CPU saturation.',
		a: '`uptime`, `dmesg | tail`, `vmstat 1`, `mpstat -P ALL 1`, `pidstat 1`, `iostat -xz 1`, `free -m`, `sar -n DEV 1`, `sar -n TCP,ETCP 1`, `top`. The `r` column of vmstat, when it is higher than the CPU count.'
	},
	sources: [
		{ title: 'Netflix Tech Blog, Linux Performance Analysis in 60,000 Milliseconds (2015), copy on brendangregg.com', url: 'https://www.brendangregg.com/Articles/Netflix_Linux_Perf_Analysis_60s.pdf' },
		{ title: 'vmstat(8), Linux manual page', url: 'https://man7.org/linux/man-pages/man8/vmstat.8.html' },
		{ title: 'proc_stat(5), Linux manual page', url: 'https://man7.org/linux/man-pages/man5/proc_stat.5.html' },
		{ title: 'pidstat(1), Linux manual page', url: 'https://man7.org/linux/man-pages/man1/pidstat.1.html' },
		{ title: 'Linux kernel docs, sysctl kernel: dmesg_restrict', url: 'https://docs.kernel.org/admin-guide/sysctl/kernel.html#dmesg-restrict' },
		{ title: 'procps, src/vmstat.c', url: `${PROCPS}/src/vmstat.c` }
	]
};
