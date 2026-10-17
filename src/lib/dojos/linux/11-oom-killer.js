const K = 'https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a';
const OOM = `${K}/mm/oom_kill.c`;
const ISSUE = 'https://github.com/systemd/systemd/issues/38492';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'oom-killer',
	part: 'Memory',
	title: 'The OOM killer',
	minutes: 10,
	hook: [
		'A Debian 13 machine runs out of memory at 01:16:37. The journal shows `Out of memory: Killed process 1905 (pipewire-pulse)`, a sound server with 34,260 kB of anonymous memory. In the next 18 seconds the kernel kills 21 more processes.',
		'The last line is a Firefox content process with 249,960 kB of anonymous memory, seven times more than the first victim. The first 21 victims all carry `oom_score_adj:200`. The Firefox process carries `oom_score_adj:167`.',
		'The reporter filed this as [systemd issue 38492](' + ISSUE + '). The kernel followed its code: each score gets a share of RAM plus swap added, sized by `oom_score_adj`. **The 33 extra units on the sound server counted for more than the 215 MB the Firefox process used on top.**'
	],
	terms: [
		{ term: 'OOM killer', def: 'Kernel code in `mm/oom_kill.c` that picks one process and sends it SIGKILL when an allocation fails after reclaim found no memory.' },
		{ term: 'Badness', def: 'The score `oom_badness()` gives each process: resident pages, plus swapped-out pages, plus page table pages, plus the `oom_score_adj` share. The highest score is killed.' },
		{ term: 'oom_score_adj', def: 'A per-process value from -1000 to 1000 in `/proc/<pid>/oom_score_adj`. Each unit adds one thousandth of the allowed memory to the badness. -1000 means never pick this process.' },
		{ term: 'oom_score', def: 'The read-only file `/proc/<pid>/oom_score`: the badness scaled for display. 0 means the process is exempt.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['alloc["A process touches a new page: the allocator needs a free page"] --> reclaim["Reclaim: drop page cache, write to swap"]', 'reclaim -->|"nothing freed"| oom["__alloc_pages_may_oom calls out_of_memory()"]'],
				highlight: ['alloc', 'oom'],
				note: 'The page allocator first tries to free memory: it drops clean page cache and writes anonymous pages to swap. When that frees nothing, `__alloc_pages_may_oom` calls `out_of_memory()`. A comment there reads "We have already exhausted all our reclaim opportunities without any success".'
			},
			{
				add: ['oom --> shortcut["Is the caller already dying? Is panic_on_oom set?"]'],
				highlight: ['shortcut'],
				note: 'If the current process already has a pending SIGKILL, the kernel lets it exit and free its memory. With `vm.panic_on_oom = 1` the kernel panics instead of killing. The default is 0, so the kernel picks a victim.'
			},
			{
				add: ['shortcut -->|"default"| scan["select_bad_process: oom_badness() for every process"]'],
				highlight: ['scan'],
				note: '`select_bad_process` walks every process, or only the processes of one cgroup when a memory cgroup hit its limit. PID 1 and kernel threads are skipped. A process with `oom_score_adj` -1000 gets `LONG_MIN` and can never win.'
			},
			{
				add: ['scan --> kill["oom_kill_process: SIGKILL, then the log line"]', 'kill --> log["Out of memory: Killed process 1905 (pipewire-pulse) ... oom_score_adj:200"]'],
				highlight: ['kill', 'log'],
				note: 'The kernel sends SIGKILL to the process with the highest score. The process cannot catch it. The kernel then prints one line with the victim\'s memory sizes and its `oom_score_adj`. With `vm.oom_dump_tasks = 1`, the default, a table of every task comes just before it.'
			},
			{
				add: ['log --> reap["oom_reaper frees the victim\'s memory"]', 'reap -.->|"still short"| oom'],
				highlight: ['reap'],
				note: 'A kernel thread, the OOM reaper, unmaps the victim\'s anonymous memory without waiting for it to exit and logs `oom_reaper: reaped process 1905`. If the next allocation still fails, the whole loop runs again. The machine in the hook went through this loop 22 times in 18 seconds.'
			}
		]
	},
	example: {
		title: 'mm/oom_kill.c: oom_badness, the score of one process',
		repo: 'torvalds/linux',
		url: `${OOM}#L202-L240`,
		lang: 'c',
		code: `long oom_badness(struct task_struct *p, unsigned long totalpages)
{
	long points;
	long adj;

	if (oom_unkillable_task(p))
		return LONG_MIN;

	p = find_lock_task_mm(p);
	if (!p)
		return LONG_MIN;

	/*
	 * Do not even consider tasks which are explicitly marked oom
	 * unkillable or have been already oom reaped or the are in
	 * the middle of vfork
	 */
	adj = (long)p->signal->oom_score_adj;
	if (adj == OOM_SCORE_ADJ_MIN ||
			test_bit(MMF_OOM_SKIP, &p->mm->flags) ||
			in_vfork(p)) {
		task_unlock(p);
		return LONG_MIN;
	}

	/*
	 * The baseline for the badness score is the proportion of RAM that each
	 * task's rss, pagetable and swap space use.
	 */
	points = get_mm_rss(p->mm) + get_mm_counter(p->mm, MM_SWAPENTS) +
		mm_pgtables_bytes(p->mm) / PAGE_SIZE;
	task_unlock(p);

	/* Normalize to oom_score_adj units */
	adj *= totalpages / 1000;
	points += adj;

	return points;
}`,
		notes: [
			'Line 6 calls `oom_unkillable_task()`, which returns true for PID 1 and for kernel threads. Lines 19 to 23 return `LONG_MIN` for a process with `oom_score_adj` equal to -1000, so the caller in `oom_evaluate_task` never selects it.',
			'Lines 30 and 31 count pages: resident pages (`get_mm_rss`), pages in swap (`MM_SWAPENTS`) and page table pages. CPU time, age and process count play no part in this code.',
			'Line 35 turns `oom_score_adj` into pages: `totalpages / 1000` per unit. For a system OOM, `totalpages` is RAM plus swap. For a memory cgroup, [`constrained_alloc`](' + OOM + '#L252-L262) sets it to the cgroup limit.',
			'Worked example with a guessed size of 8 GiB RAM plus swap (the issue does not give it): 2,097,152 pages, so 2,097 pages per unit. pipewire-pulse scores 9,927 resident pages plus 200 × 2,097, about 429,000. The Firefox process scores 64,640 plus 167 × 2,097, about 415,000. The kernel kills pipewire-pulse first.'
		]
	},
	tradeoff: {
		gain: [
			'With `panic_on_oom = 0` the machine keeps running: one SIGKILL frees a whole address space and the other processes continue.',
			'`oom_score_adj = -1000` protects a process you need to reach the machine. On the box used for this chapter, `sshd` has -1000 and an `oom_score` of 0.',
			'The kubelet sets -997 for containers in Guaranteed pods and 1000 for BestEffort pods, so BestEffort containers go first.'
		],
		cost: [
			'The victim gets SIGKILL: no handler runs, no buffer is flushed, open transactions are cut. A database server that wins the score loses its connections at once.',
			'The score counts pages and `oom_score_adj` only. A 34 MB service with `oom_score_adj` 200 can be killed before the 250 MB process that is growing, as in the hook.',
			'A process with -1000 that leaks memory is never chosen. The kernel kills other processes one by one, and panics with "System is deadlocked on memory" if none is left.'
		]
	},
	task: {
		prompt: 'In a terminal, run `for p in $$ $(pgrep -o -x sshd); do echo $p $(cat /proc/$p/comm) $(cat /proc/$p/oom_score_adj) $(cat /proc/$p/oom_score); done`. Columns: PID, name, `oom_score_adj`, `oom_score`. Which of the two would the kernel kill first, and why is one score exactly 0?',
		hint: '`proc_oom_score()` in `fs/proc/base.c` prints `(1000 + badness * 1000 / totalpages) * 2 / 3`, and prints 0 when `oom_badness()` returned `LONG_MIN`.',
		answer: [
			'Output captured in this session on a 6.17 kernel with 27 GiB of RAM and 3.8 GiB of swap: `4049997 zsh 100 733` and `2313 sshd -1000 0`.',
			'The shell uses 4,748 kB, a tiny share of 8 million pages, so its badness is almost all the adjustment: 100 units. (1000 + 100) × 2 / 3 gives 733.',
			'sshd has -1000, so `oom_badness()` returns `LONG_MIN` and the file shows 0. It cannot be chosen. The shell would go first, and any process with a higher `oom_score` would go before it.',
			'The 100 on the shell comes from systemd: `user@.service` sets `OOMScoreAdjust=100` for the user manager, and the issue in the hook shows services under it at 200.'
		]
	},
	quiz: [
		{
			q: 'The whole machine runs out of memory with default sysctls. Which process does the OOM killer pick?',
			options: [
				'The process whose allocation failed, because it triggered the OOM',
				'The process with the most pages in RAM and swap, plus its `oom_score_adj` share',
				'The process that used the most CPU time in the last minute',
				'The most recently started process, because it has done the least work'
			],
			answer: 1,
			why: '`select_bad_process` calls `oom_badness()` for each process and keeps the highest. Killing the caller only happens with `vm.oom_kill_allocating_task` set to non-zero, and its default is 0. The formula in `oom_badness()` reads no CPU time and no start time.'
		},
		{
			q: 'You write -1000 to `/proc/<pid>/oom_score_adj` for your database. What does that do?',
			options: [
				'It lowers the score by 1000 points, so the database dies only after the others',
				'It makes the kernel refuse new allocations from the database',
				'It removes the database from the candidates: `oom_badness()` returns `LONG_MIN`',
				'It moves the database pages to swap first under memory pressure'
			],
			answer: 2,
			why: '`OOM_SCORE_ADJ_MIN` is -1000, and `oom_badness()` returns `LONG_MIN` for it, which `oom_evaluate_task` always skips. The process is never chosen, however much memory it uses.'
		},
		{
			q: 'dmesg shows `Memory cgroup out of memory: Killed process 4242 (java)`, while `free -h` on the host shows 20 GB available. What happened?',
			options: [
				'The host ran out of memory for a moment and then freed 20 GB',
				'The kernel killed java because it had the highest CPU usage on the host',
				'`free` is wrong, because it does not count the page cache',
				'The container reached its cgroup memory limit, and only its own processes were scored'
			],
			answer: 3,
			why: 'For a memory cgroup OOM, `out_of_memory()` prints "Memory cgroup out of memory" and `select_bad_process` scans only that cgroup\'s tasks. `totalpages` is the cgroup limit, so the host\'s free memory plays no part.'
		}
	],
	recall: {
		q: 'What does `oom_badness()` add up for each process, and what does `oom_score_adj` -1000 do?',
		a: 'Resident pages, swapped-out pages and page table pages, plus `oom_score_adj` × `totalpages` / 1000. The highest score gets SIGKILL. -1000 returns `LONG_MIN`, so that process is never picked.'
	},
	sources: [
		{ title: 'Linux v6.12, mm/oom_kill.c', url: OOM },
		{ title: 'Linux v6.12, Documentation/admin-guide/sysctl/vm.rst (panic_on_oom, oom_kill_allocating_task)', url: `${K}/Documentation/admin-guide/sysctl/vm.rst` },
		{ title: 'proc_pid_oom_score_adj(5), man7.org', url: 'https://man7.org/linux/man-pages/man5/proc_pid_oom_score_adj.5.html' },
		{ title: 'systemd issue 38492: the default oom_score_adj=200 for user services', url: ISSUE },
		{ title: 'systemd-system.conf(5), DefaultOOMScoreAdjust=', url: 'https://www.freedesktop.org/software/systemd/man/latest/systemd-system.conf.html' },
		{ title: 'Kubernetes docs, Node-pressure eviction (oom_score_adj per QoS class)', url: 'https://kubernetes.io/docs/concepts/scheduling-eviction/node-pressure-eviction/' }
	]
};
