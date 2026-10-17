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
