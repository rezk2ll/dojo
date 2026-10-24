const FAIR = 'https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/kernel/sched/fair.c';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'cpu-throttling',
	part: 'Containers from the kernel up',
	title: 'CPU limits and throttling',
	minutes: 10,
	hook: [
		'In 2018, shortly after Linux 4.18, engineers at Indeed saw tail response times of their web applications go up while the CPU usage graphs looked fine. The slow responses lined up with periods of high CPU throttling. After the kernel fix, worst-case latency in one application went from over two seconds to 30 ms.',
		'The fix, kernel commit `de53fd7aedb1` (in Linux 5.4), describes the problem: "highly-threaded, non-cpu-bound applications running under cpu.cfs_quota_us constraints can hit a high percentage of periods throttled while simultaneously not consuming the allocated amount of quota." It cites Kubernetes issue 67577, "CFS quotas can lead to unnecessary throttling".',
		'A fixed kernel still counts the limit per period of 100 ms. On the machine this chapter was written on (kernel 6.17, 16 CPUs), four busy loops in a container with `--cpus 1` ran for 3 seconds. **`cpu.stat` showed 30 throttled periods out of 31.**'
	],
	terms: [
		{ term: 'Quota and period', def: 'The two numbers in `cpu.max`. In each period (microseconds), the group may use up to quota microseconds of CPU time, summed over all its threads and all CPUs. A Kubernetes limit of `1` CPU gives `100000 100000`.' },
		{ term: 'Throttling', def: 'What the scheduler does once the group\'s quota for the period is used up: its threads are taken off the CPU and "will not be able to run again until the next period when the quota is replenished".' },
		{ term: '`cpu.stat`', def: 'The cgroup file with the counters. `nr_periods` counts periods in which the group had work, `nr_throttled` counts the periods in which it was throttled, and `throttled_usec` adds up how long it was held back.' },
		{ term: 'Slice', def: 'The amount of quota a CPU takes from the group\'s pool at a time, 5 ms by default (`/proc/sys/kernel/sched_cfs_bandwidth_slice_us`). Each CPU running the group\'s threads spends its own slice.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['timer["Period timer, every 100 ms"] -->|"refill 100 ms"| pool["Group pool: quota 100 ms"]'],
				highlight: ['timer', 'pool'],
				note: 'The pod has a CPU limit of 1, so `cpu.max` holds `100000 100000`. At each period boundary the kernel refills the group\'s pool with the quota. A request arrives that needs 300 ms of CPU, split across 4 threads of 75 ms each.'
			},
			{
				add: ['pool -->|"slices"| cpus["4 CPUs run the 4 threads in parallel"]'],
				highlight: ['cpus'],
				note: 'Each CPU takes slices from the pool as its thread runs. Four threads in parallel spend 4 ms of quota per millisecond of wall time, so the 100 ms pool is empty after 25 ms (ignoring the slice rounding).'
			},
			{
				add: ['cpus -->|"pool empty"| thr["Throttled for 75 ms, nr_throttled + 1"]', 'thr -->|"next period"| timer'],
				highlight: ['thr'],
				note: 'With the pool empty, all four threads wait for the next refill. Three periods in a row go the same way: 25 ms of running, 75 ms of waiting. The request finishes after 225 ms. On 4 free CPUs without a limit it would take 75 ms.'
			},
			{
				add: ['thr --> graph["Average over 1 s: 0.3 CPU, 30% of the limit"]'],
				highlight: ['graph'],
				note: 'With one such request per second, the group uses 300 ms of CPU per second. A dashboard that averages usage over a minute shows 30% of the limit, and the request was still three times slower. Only `cpu.stat` shows it: `nr_throttled` grew by 3.'
			}
		]
	},
	example: {
		title: 'kernel/sched/fair.c: take quota from the pool, or get throttled',
		repo: 'torvalds/linux',
		url: `${FAIR}#L5772-L5828`,
		lang: 'c',
		code: `static int __assign_cfs_rq_runtime(struct cfs_bandwidth *cfs_b,
				   struct cfs_rq *cfs_rq, u64 target_runtime)
{
	u64 min_amount, amount = 0;

	lockdep_assert_held(&cfs_b->lock);

	/* note: this is a positive sum as runtime_remaining <= 0 */
	min_amount = target_runtime - cfs_rq->runtime_remaining;

	if (cfs_b->quota == RUNTIME_INF)
		amount = min_amount;
	else {
		start_cfs_bandwidth(cfs_b);

		if (cfs_b->runtime > 0) {
			amount = min(cfs_b->runtime, min_amount);
			cfs_b->runtime -= amount;
			cfs_b->idle = 0;
		}
	}

	cfs_rq->runtime_remaining += amount;

	return cfs_rq->runtime_remaining > 0;
}

/* returns 0 on failure to allocate runtime */
static int assign_cfs_rq_runtime(struct cfs_rq *cfs_rq)
{
	struct cfs_bandwidth *cfs_b = tg_cfs_bandwidth(cfs_rq->tg);
	int ret;

	raw_spin_lock(&cfs_b->lock);
	ret = __assign_cfs_rq_runtime(cfs_b, cfs_rq, sched_cfs_bandwidth_slice());
	raw_spin_unlock(&cfs_b->lock);

	return ret;
}

static void __account_cfs_rq_runtime(struct cfs_rq *cfs_rq, u64 delta_exec)
{
	/* dock delta_exec before expiring quota (as it could span periods) */
	cfs_rq->runtime_remaining -= delta_exec;

	if (likely(cfs_rq->runtime_remaining > 0))
		return;

	if (cfs_rq->throttled)
		return;
	/*
	 * if we're unable to extend our runtime we resched so that the active
	 * hierarchy can be throttled
	 */
	if (!assign_cfs_rq_runtime(cfs_rq) && likely(cfs_rq->curr))
		resched_curr(rq_of(cfs_rq));
}`,
		notes: [
			'`cfs_b` is the group\'s pool, shared by all CPUs. `cfs_rq` is the group\'s run queue on one CPU, with its own `runtime_remaining`. Line 44 takes the CPU time just used off that local balance.',
			'When the local balance reaches zero, line 55 asks the pool for more. Line 35 asks for one slice, `sched_cfs_bandwidth_slice()`, 5 ms by default. Lines 16 to 18 hand out what is left in the pool, possibly less than a slice.',
			'An unlimited group (`max` in `cpu.max`) gets what it asks for on line 12. A limited one with an empty pool gets nothing, `assign_cfs_rq_runtime` returns 0, and line 56 forces a reschedule so the run queue can be throttled.',
			'The pool is refilled once per period by [`__refill_cfs_bandwidth_runtime`](' + FAIR + '#L5748-L5764), which adds `cfs_b->quota`. In the same timer, [line 6307](' + FAIR + '#L6306-L6307) adds to `nr_throttled`.',
			'`throttled_usec` is summed per CPU run queue ([line 6034](' + FAIR + '#L6033-L6036)). Four run queues throttled together add four times the wall time.'
		]
	},
	tradeoff: {
		gain: [
			'A CPU limit is a ceiling the kernel enforces in every period: a pod with a limit of 1 cannot take more than 100 ms of CPU per 100 ms, whatever its neighbours on the node are doing.',
			'The cost of a request is easy to bound: with the quota known, the slowest case for a given amount of CPU work can be computed, as in the 225 ms of the diagram.',
			'`cpu.stat` gives the exact number of throttled periods, so the effect of the limit can be measured from the cgroup alone.'
		],
		cost: [
			'A multithreaded service spends its quota faster than wall time, so short bursts are throttled while the average usage stays far below the limit.',
			'Dashboards that average CPU usage over 30 or 60 seconds hide throttling that happens inside 100 ms periods. You need `nr_throttled` divided by `nr_periods` to see it.',
			'Raising the limit, lengthening the period (the kubelet\'s `cpuCFSQuotaPeriod`, behind a feature gate) or setting `cpu.max.burst` each trade some of the ceiling for lower latency.'
		]
	},
	task: {
		prompt: 'On the machine this chapter was written on, `docker run --rm --cpus 1 busybox` started 4 busy loops for 3 seconds, then printed `/sys/fs/cgroup/cpu.stat`: `usage_usec 3081196`, `nr_periods 31`, `nr_throttled 30`, `throttled_usec 8975156`. Compute the throttled percentage, the average CPU used, and explain why `throttled_usec` is about 9 s when the test lasted 3 s.',
		hint: 'Indeed\'s post defines the throttled percentage as `nr_throttled` divided by `nr_periods`. For the 9 s, look at the last note of the example.',
		answer: [
			'Throttled percentage: 30 / 31, about 97%. Nearly every period ended with the quota spent.',
			'Average CPU: 3.08 s of CPU in about 3.1 s (31 periods of 100 ms), close to 1 CPU, which is exactly the limit. The 4 loops wanted 4 CPUs on a machine with 16.',
			'Per period, the 4 run queues spent the 100 ms of quota in about 25 ms and then each waited about 75 ms. 30 periods × 4 run queues × 75 ms = 9 s, which matches `throttled_usec 8975156`, because the kernel adds the throttled time of each run queue.',
			'For a service, the same reading with a usage graph at 30% of the limit tells you requests are waiting inside periods. The limit or the number of busy threads has to change for latency to drop.'
		],
		steps: [
			{
				title: 'Read the counters',
				questions: [
					{ q: 'What does `usage_usec 3081196` count?', options: ['Wall time since the container started', 'CPU time used by the group, about 3.08 s', 'Time the group spent waiting for a CPU', 'The quota left in the current period'], answer: 1, why: '`usage_usec` is the CPU time the group used, summed over all its threads and CPUs, in microseconds.' },
					{ q: 'What does `nr_periods 31` count?', options: ['Periods in which the group had work to run', 'Periods in which the group was throttled', 'Threads that ran in the group', 'Times the quota was changed'], answer: 0, why: '`nr_periods` counts the periods of 100 ms in which the group had work. About 3.1 s of test gives 31.' },
					{ q: 'What does `nr_throttled 30` count?', options: ['Threads that were stopped at least once', 'Milliseconds lost per period', 'Seconds the group spent throttled', 'Periods in which the group ran out of quota'], answer: 3, why: 'A period counts as throttled when the pool ran dry and the group had to wait for the next refill.' },
					{ q: 'Which `cpu.max` does `--cpus 1` give the container?', options: ['`max 100000`', '`1 100000`', '`100000 100000`', '`100000 1`'], answer: 2, why: 'One CPU is a quota of 100 ms per 100 ms period, the same value a Kubernetes limit of `1` gives.' }
				]
			},
			{
				title: 'Compute the throttled percentage',
				questions: [
					{ q: 'How do you compute the throttled percentage?', options: ['`throttled_usec` divided by `usage_usec`', '`nr_throttled` divided by `nr_periods`', '`usage_usec` divided by the test length', '`nr_periods` divided by `nr_throttled`'], answer: 1, why: 'Indeed\'s post defines it as `nr_throttled` divided by `nr_periods`: the share of periods that ended with the quota spent.' },
					{ q: 'So what is it here?', options: ['About 3%', 'About 30%', 'About 97%', 'Over 100%'], answer: 2, why: '30 / 31 is about 97%. Nearly every period ended with the quota spent.' },
					{ q: 'Why are there about 31 periods in a 3 s test?', options: ['The period is 100 ms', 'The kernel counts one period per thread', 'The period is 1 s and each CPU counts once', 'Docker sets one period per 10 loops'], answer: 0, why: 'The default period is 100000 µs. 3.1 s of activity is 31 periods.' },
					{ q: 'A usage graph averaged per minute would show this container at what level?', options: ['Far below the limit, because it is idle most of the time', 'At about 4 CPUs, what the loops asked for', 'At zero, because throttled time is not counted', 'At about its limit, 1 CPU'], answer: 3, why: 'The group used 1 CPU on average, the full limit. A graph would show the limit reached, but not that 4 threads were waiting most of each period.' }
				]
			},
			{
				title: 'Compute the average CPU',
				questions: [
					{ q: '3.08 s of CPU in about 3.1 s of wall time is how many CPUs on average?', options: ['About 4', 'About 1', 'About 0.3', 'About 16'], answer: 1, why: 'CPU time divided by wall time: 3.08 / 3.1 is close to 1 CPU.' },
					{ q: 'How does that compare with the limit?', options: ['It is exactly the limit', 'It is a quarter of the limit', 'It is four times the limit', 'It is unrelated to the limit'], answer: 0, why: 'The limit is 1 CPU, and the kernel enforced it in every period.' },
					{ q: 'How many CPUs did the 4 busy loops want?', options: ['1', '2', '16', '4'], answer: 3, why: 'Each busy loop can keep one CPU busy, and the machine had 16 free. The limit held them to 1.' },
					{ q: 'How long does it take 4 parallel threads to spend 100 ms of quota?', options: ['100 ms', '400 ms', 'About 25 ms', '5 ms, one slice'], answer: 2, why: 'Four threads spend 4 ms of quota per millisecond of wall time, so 100 ms is gone after about 25 ms.' }
				]
			},
			{
				title: 'Explain the 9 s',
				questions: [
					{ q: 'After the pool is empty at about 25 ms, how long does each run queue wait?', options: ['About 75 ms, until the next refill', 'About 25 ms, one more slice', 'A full 100 ms period', 'It does not wait, it borrows from the next period'], answer: 0, why: 'All four threads wait for the refill at the period boundary: 100 ms minus the 25 ms they ran.' },
					{ q: 'With 2 busy loops instead of 4, about what would `throttled_usec` reach over 30 throttled periods?', options: ['About 9 s', 'About 1.5 s', 'About 3 s', 'About 6 s'], answer: 2, why: 'Two threads spend the 100 ms quota in about 50 ms, then each of 2 run queues waits about 50 ms: 30 × 2 × 50 ms is 3 s.' },
					{ q: 'Which product gives about 9 s?', options: ['31 periods × 100 ms × 3 s', '30 periods × 4 run queues × 75 ms', '4 loops × 3 s × 75%', '16 CPUs × 30 periods × 25 ms'], answer: 1, why: '30 × 4 × 75 ms is 9 s, which matches `throttled_usec 8975156`.' },
					{ q: 'A real service shows the same counters while its graph says 30% of the limit. What lowers its latency?', options: ['A dashboard with a shorter average', 'More memory for the pod', 'A restart of the pod', 'A higher limit or fewer busy threads'], answer: 3, why: 'Requests wait inside periods because threads spend the quota early. The limit or the number of busy threads has to change.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'A pod has a CPU limit of `500m`. Its usage graph, averaged per minute, shows 0.15 CPU, yet `nr_throttled / nr_periods` is 40%. What is going on?',
			options: [
				'The metrics disagree, so one of the two counters must be broken',
				'Bursts of threads spend the 50 ms quota early in some periods and wait for the next refill',
				'The node is overloaded, and throttling counts time spent waiting for a free CPU',
				'The pod uses more memory than its limit, and the kernel slows down its CPU'
			],
			answer: 1,
			why: '`500m` gives `cpu.max` of `50000 100000`. The quota is checked per 100 ms period and summed over threads. The minute average hides the periods where the threads used their 50 ms in a burst and then waited.'
		},
		{
			q: 'A single-threaded request needs 200 ms of CPU. The container has a limit of `0.4` CPU with a 100 ms period. How long does the request take?',
			options: [
				'200 ms, because the CPU is idle and the limit does not apply',
				'500 ms, because 200 ms at 40% gives 500 ms',
				'About 440 ms: four periods of 40 ms run and 60 ms wait, then 40 ms',
				'800 ms, because each 40 ms of work costs one full period of 200 ms'
			],
			answer: 2,
			why: 'The example from Indeed\'s post: 40 ms of run time per 100 ms period "even if the CPU has no other work to do". Four throttled periods cover 160 ms of work in 400 ms, and the last 40 ms finish the request at 440 ms.'
		},
		{
			q: 'A container ran for 3 seconds and its `cpu.stat` shows `throttled_usec 8975156`. How can it be throttled for longer than it ran?',
			options: [
				'The counter is in nanoseconds, so it means 8.9 ms',
				'It includes the time before the container started',
				'It sums the throttled time of each CPU run queue the group was on',
				'The counter is never reset, so it holds earlier containers too'
			],
			answer: 2,
			why: 'In `unthrottle_cfs_rq`, each per-CPU run queue adds its own throttled time to the group total. Four run queues throttled for 75 ms in the same period add 300 ms.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Reproduce the chapter\'s `cpu.stat` reading, then change the limit and the number of threads and watch throttling come and go.',
		steps: [
			'Check that you have at least 4 CPUs: `nproc`.',
			'Run 4 busy loops under a limit of 1 CPU for 3 seconds: `docker run --rm --cpus 1 busybox sh -c \'for i in 1 2 3 4; do (while :; do :; done) & done; sleep 3; grep -E "usage_usec|nr_|throttled_usec" /sys/fs/cgroup/cpu.stat\'`.',
			'Compute `nr_throttled / nr_periods`, the average CPU (`usage_usec` divided by about 3100000), and `throttled_usec` in seconds.',
			'Run one busy loop under the same limit: `docker run --rm --cpus 1 busybox sh -c \'(while :; do :; done) & sleep 3; grep -E "usage_usec|nr_|throttled_usec" /sys/fs/cgroup/cpu.stat\'`.',
			'Run the 4 loops again with `--cpus 4` instead of `--cpus 1`.'
		],
		done: [
			'Step 2: `nr_throttled` equals `nr_periods` or is one below it (about 30 of 31), `usage_usec` is about 3 million, and `throttled_usec` is between 8 and 9 million.',
			'Step 4: `usage_usec` is still about 3 million, and `throttled_usec` stays below 10000 (10 ms), even if `nr_throttled` counts some periods.',
			'Step 5: `usage_usec` is about 12 million, and `throttled_usec` stays below 10000 (10 ms), even if `nr_throttled` counts a few periods.'
		],
		solution: [
			'Step 2 is the chapter\'s reading: about 97% of periods throttled, an average of 1 CPU, and 8 to 9 s of throttled time, because 4 run queues each wait about 75 ms per period.',
			'With one thread, the loop spends the 100 ms quota over the whole period. It may run out a moment before the refill, but it never waits long, so `throttled_usec` stays tiny.',
			'With `--cpus 4`, the quota is 400 ms per period, enough for the 4 loops: 4 CPUs × 3 s is the 12 s of `usage_usec`, with almost no time throttled. The same work, a different limit.'
		]
	},
	recall: {
		q: 'Why can a container at 30% of its CPU limit still have slow requests, and which file shows it?',
		a: 'The quota in `cpu.max` is counted per period (100 ms) and summed over all threads. Several threads can spend it in a fraction of the period and then wait for the refill, while the average over a minute stays low. `cpu.stat` shows it: `nr_throttled` compared with `nr_periods`.'
	},
	sources: [
		{ title: 'Linux kernel docs, CFS Bandwidth Control', url: 'https://docs.kernel.org/scheduler/sched-bwc.html' },
		{ title: 'Linux kernel docs, Control Group v2 (cpu.max, cpu.stat)', url: 'https://docs.kernel.org/admin-guide/cgroup-v2.html' },
		{ title: 'Indeed Engineering, Unthrottled: Fixing CPU Limits in the Cloud', url: 'https://engineering.indeedblog.com/blog/2019/12/unthrottled-fixing-cpu-limits-in-the-cloud/' },
		{ title: 'Linux commit de53fd7aedb1, removing expiration of cpu-local slices', url: 'https://github.com/torvalds/linux/commit/de53fd7aedb100f03e5d2231cfce0e4993282425' },
		{ title: 'Kubernetes issue 67577, CFS quotas can lead to unnecessary throttling', url: 'https://github.com/kubernetes/kubernetes/issues/67577' },
		{ title: 'Kubernetes source, MilliCPUToQuota', url: 'https://github.com/kubernetes/kubernetes/blob/949f064e6d9e32f0a597795c265fcd50c6aad66e/pkg/kubelet/cm/helpers_linux.go#L117-L141' }
	]
};
