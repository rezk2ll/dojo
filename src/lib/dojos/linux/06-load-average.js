const LINUX = 'https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a';
const LOADAVG_C = `${LINUX}/kernel/sched/loadavg.c`;
const LOADAVG_H = `${LINUX}/include/linux/sched/loadavg.h`;
const PROC_LOADAVG = `${LINUX}/fs/proc/loadavg.c`;
const GREGG = 'https://www.brendangregg.com/blog/2017-08-08/linux-load-averages.html';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'load-average',
	part: 'Processes',
	title: 'Load average and the scheduler',
	minutes: 10,
	hook: [
		'Brendan Gregg starts `tar` on an idle 8-CPU machine to archive files that are not in memory. `pidstat` shows `tar` at 32.62% of one CPU. `uptime` prints `load average: 1.19, 1.17, 1.06`.',
		'One process uses a third of one CPU, and the load says 1.19. **On Linux the load average also counts tasks waiting for the disk.** Gregg splits the 1.19: 0.33 from `tar` on the CPU, 0.67 from `tar` waiting for disk reads, 0.11 from kernel threads flushing writes, 0.04 from other processes.',
		'He also ran a two-CPU mail server that sat at a load of 11 to 16 all day. Latency was fine and no one complained. He adds that most systems suffer at a load of just 2 per CPU.'
	],
	terms: [
		{ term: 'Load average', def: 'Three numbers in `/proc/loadavg`, also printed by `uptime` and `top`: a damped average of the tasks that are runnable or in uninterruptible sleep, with 1, 5 and 15 minute constants.' },
		{ term: 'Runnable (R)', def: 'A task that is running on a CPU or waiting in a CPU run queue for its turn. `ps` shows it as `R`.' },
		{ term: 'Uninterruptible sleep (D)', def: 'A task blocked in the kernel that a signal cannot wake, usually waiting for disk I/O. `ps` shows it as `D`, "uninterruptible sleep (usually I/O)".' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['r["Task in R: on a CPU or in its run queue"] --> rq["Per-CPU counters: nr_running and nr_uninterruptible"]', 'd["Task in D: waiting for a disk read"] --> rq'],
				highlight: ['r', 'd', 'rq'],
				note: 'Each CPU run queue keeps two counters. `nr_running` counts the R tasks on that CPU. `nr_uninterruptible` counts tasks that went into D state there. A task sleeping in S state, like a web server waiting on `accept()`, is in neither.'
			},
			{
				add: ['rq -->|"every 5 s, at a scheduler tick"| fold["calc_global_load_tick: add this CPU\'s change to calc_load_tasks"]'],
				highlight: ['fold'],
				note: '`LOAD_FREQ` is `5*HZ+1`, a little over 5 seconds. When a CPU passes that point, `calc_global_load_tick()` computes `nr_running + nr_uninterruptible` for itself and adds the difference since last time to one global counter, `calc_load_tasks`. No CPU has to read the others.'
			},
			{
				add: ['fold -->|"10 ticks later"| calc["calc_global_load: one sample of active tasks"]'],
				highlight: ['calc'],
				note: '`calc_global_load()` waits 10 ticks after the 5 second mark so every CPU has folded its count. It then reads `calc_load_tasks`: the number of R plus D tasks on the whole machine at that moment. With 1 `tar` reading the disk and nothing else, that sample is 1.'
			},
			{
				add: ['calc --> avg["avenrun[0..2] = old x e + sample x (1 - e)"]'],
				highlight: ['avg'],
				note: 'The kernel blends each sample into three running values with `EXP_1 = 1884`, `EXP_5 = 2014` and `EXP_15 = 2037`, out of 2048. For the 1 minute value, each sample keeps 92% of the old load. One thread starting on an idle machine pushes the 1 minute load to about 0.62 after 60 seconds.'
			},
			{
				add: ['avg --> proc["/proc/loadavg: 3 values, runnable/total, last PID"]'],
				highlight: ['proc'],
				note: 'Reading `/proc/loadavg` prints the three values with two decimals, then runnable tasks right now over all tasks, then the last PID created. Gregg\'s busy server printed `25.72 23.19 23.35 42/3411 43603`. `uptime` and `top` print the same three numbers. The kernel keeps one `avenrun` array for the whole machine, so a container reading `/proc/loadavg` gets the host\'s numbers.'
			}
		]
	},
	example: {
		title: 'kernel/sched/loadavg.c (Linux v6.12): calc_global_load',
		repo: 'torvalds/linux',
		url: `${LOADAVG_C}#L349-L379`,
		lang: 'c',
		code: `void calc_global_load(void)
{
	unsigned long sample_window;
	long active, delta;

	sample_window = READ_ONCE(calc_load_update);
	if (time_before(jiffies, sample_window + 10))
		return;

	/*
	 * Fold the 'old' NO_HZ-delta to include all NO_HZ CPUs.
	 */
	delta = calc_load_nohz_read();
	if (delta)
		atomic_long_add(delta, &calc_load_tasks);

	active = atomic_long_read(&calc_load_tasks);
	active = active > 0 ? active * FIXED_1 : 0;

	avenrun[0] = calc_load(avenrun[0], EXP_1, active);
	avenrun[1] = calc_load(avenrun[1], EXP_5, active);
	avenrun[2] = calc_load(avenrun[2], EXP_15, active);

	WRITE_ONCE(calc_load_update, sample_window + LOAD_FREQ);

	/*
	 * In case we went to NO_HZ for multiple LOAD_FREQ intervals
	 * catch up in bulk.
	 */
	calc_global_nohz();
}`,
		notes: [
			'Lines 6 to 8 return early until 10 ticks after the sample time. The comment at the top of the file says the kernel assumes "10 ticks is sufficient time for every CPU" to have added its count.',
			'Line 17 reads the global count. Each CPU fills it in [`calc_load_fold_active()`](' + LOADAVG_C + '#L78-L91) from `nr_running` plus `nr_uninterruptible`. That sum is why D tasks raise the load on Linux.',
			'Line 18 multiplies the count by `FIXED_1`, 2048, so 3 tasks are stored as 6144. `FSHIFT` is 11, so the low 11 bits hold the fraction.',
			'Lines 20 to 22 update the 1, 5 and 15 minute values. [`calc_load()`](' + LOADAVG_H + '#L18-L38) computes `load * exp + active * (FIXED_1 - exp)`, divided by 2048. With `EXP_1 = 1884`, 1884 / 2048 is 0.92 of the old value kept every 5 seconds.',
			'Line 24 schedules the next sample `LOAD_FREQ` later. [`loadavg_proc_show()`](' + PROC_LOADAVG + '#L14-L27) formats `avenrun` with `%lu.%02lu` when you read `/proc/loadavg`.'
		]
	},
	tradeoff: {
		gain: [
			'One number covers demand for CPU, disk and some kernel locks. Gregg\'s `tar` shows 1.19 where a CPU only count would show 0.37.',
			'A 1 minute load far below the 15 minute load tells you the spike ended before you logged in.'
		],
		cost: [
			'Load 6 on 4 CPUs can be 6 runnable threads, or 1 runnable thread and 5 waiting for the disk. The number alone does not tell you which.',
			'You cannot divide it by the CPU count on Linux, because D tasks use no CPU. Gregg compares it to the same server\'s usual value instead.',
			'The damping hides short bursts: a 10 second spike of 40 runnable threads covers 2 samples and lifts the 1 minute value from 0 to about 6.'
		]
	},
	task: {
		prompt: 'A 4-CPU VM is slow. `cat /proc/loadavg` prints `6.12 5.90 5.31 1/388 20417`. `vmstat 1` shows `r` at 1, `b` at 6, `id` at 50 and `wa` at 45. Are the CPUs the bottleneck? Which command lists the tasks behind the load?',
		hint: 'The fourth field and the `r` column count runnable tasks. `b` counts processes blocked waiting for I/O.',
		answer: [
			'Only 1 task is runnable right now (`1/388` and `r` = 1), and the CPUs are idle 50% of the time. More CPUs would not make this VM faster.',
			'The load of about 6 is mostly D tasks: `vmstat` shows 6 processes blocked on I/O, and the CPUs spend 45% of their time waiting for I/O.',
			'`ps -eo stat,pid,comm | grep ^D` lists the tasks in uninterruptible sleep. Then look at the disk with `iostat -x 1` (chapter 22).',
			'On your own machine, run `cat /proc/loadavg; nproc; vmstat 1 5` and split the load the same way between `r` and `b`.'
		]
	},
	quiz: [
		{
			q: 'What does the Linux load average count?',
			options: [
				'Tasks running or waiting for a CPU, plus tasks in uninterruptible sleep',
				'The percentage of time the CPUs were busy, averaged over 1, 5 and 15 minutes',
				'Tasks running or waiting for a CPU, and nothing else',
				'Every task that exists, including those sleeping on a socket'
			],
			answer: 0,
			why: 'Each CPU adds `nr_running + nr_uninterruptible` to `calc_load_tasks` every 5 seconds, and the kernel averages that count. Tasks in S state, such as a server blocked in `accept()`, are not counted.'
		},
		{
			q: 'An idle machine starts one thread in a busy loop. What is the 1 minute load average 60 seconds later?',
			options: ['Exactly 1.00', 'About 0.62', 'About 0.08', 'About 1.62'],
			answer: 1,
			why: 'Every 5 seconds the kernel keeps 1884/2048, about 92%, of the old value and adds 8% of the new sample. After 12 samples the value has climbed to about 0.62, and it reaches 1.0 only after several minutes.'
		},
		{
			q: 'The disk under a database stalls. The load average climbs to 40 while `top` shows the CPUs 95% idle. Why?',
			options: [
				'The kernel counts the time spent retrying the disk as CPU time',
				'Processes waiting for disk reads are in D state, which the load counts',
				'`top` stops sampling the CPUs while the disk is stalled',
				'The load average is wrong until the disk answers again'
			],
			answer: 1,
			why: 'Processes blocked on the disk wait in uninterruptible sleep, and `nr_uninterruptible` goes into the load sum. They use no CPU, so `top` shows the CPUs idle while the load climbs.'
		}
	],
	recall: {
		q: 'Which two task states does the Linux load average count, and how often does the kernel take a sample?',
		a: 'R (running or waiting in a run queue) and D (uninterruptible sleep, usually disk I/O), sampled every 5 seconds in `calc_global_load()` with the constants 1884, 2014 and 2037.'
	},
	sources: [
		{ title: 'Brendan Gregg, Linux Load Averages: Solving the Mystery (2017)', url: GREGG },
		{ title: 'proc_loadavg(5), Linux manual page', url: 'https://man7.org/linux/man-pages/man5/proc_loadavg.5.html' },
		{ title: 'Linux v6.12, kernel/sched/loadavg.c', url: LOADAVG_C },
		{ title: 'Linux v6.12, include/linux/sched/loadavg.h', url: LOADAVG_H },
		{ title: 'vmstat(8), Linux manual page', url: 'https://man7.org/linux/man-pages/man8/vmstat.8.html' },
		{ title: 'ps(1), Linux manual page (PROCESS STATE CODES)', url: 'https://man7.org/linux/man-pages/man1/ps.1.html' }
	]
};
