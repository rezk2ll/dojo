const SYSSTAT = 'https://github.com/sysstat/sysstat/blob/efd0c445b89dab7cf2db69ffaedf94ccbbc5bc90';
const RD_STATS = `${SYSSTAT}/rd_stats.c`;
const IOSTAT_C = `${SYSSTAT}/iostat.c`;
const LINUX = 'https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a';
const MAN = 'https://man7.org/linux/man-pages';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'io-performance',
	part: 'Files and disks',
	title: 'Disk I/O and iostat',
	minutes: 10,
	hook: [
		'One `dd` reads a 2 GB file in 4 KiB blocks with `iflag=direct` from an NVMe SSD. It gets 291 MB/s, and the disk shows 81.5% busy. With 64 copies of `dd` reading the same file in parallel, the disk delivers 3578 MB/s, twelve times more, and shows 73.0% busy. These numbers come from a test run for this chapter on Linux 6.17.',
		'iostat(1) warns about this column: "for devices serving requests in parallel, such as RAID arrays and modern SSDs, this number does not reflect their performance limits." **`%util` counts the time with at least one request in flight, whatever the number of requests.**',
		'The column to watch for slowness is `await`. Brendan Gregg describes it as "the time that the application suffers, as it includes both time queued and time being serviced." In the same test, `r_await` went from 0.012 ms with one reader to 0.064 ms with 64.'
	],
	terms: [
		{ term: '%util', def: 'The share of the interval during which the device had at least one I/O request in flight. iostat computes it from the kernel\'s `io_ticks` counter.' },
		{ term: 'await', def: 'The average time in milliseconds from the moment a request is created in the block layer to its completion: queue time plus device time. `r_await` is for reads, `w_await` for writes.' },
		{ term: 'aqu-sz', def: 'The average number of requests in flight during the interval: the queue depth seen by the device. It was called `avgqu-sz` in older iostat versions.' },
		{ term: 'Direct I/O', def: 'Reads and writes opened with `O_DIRECT`, which go between the program\'s buffer and the disk and skip the page cache. `dd iflag=direct` uses it, so every read reaches the device.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['app["dd calls read() on a file opened with O_DIRECT"] --> rq["Block layer allocates a request: the clock starts"]'],
				highlight: ['app', 'rq'],
				note: 'The kernel iostats docs say the time of a read is "measured from blk_mq_alloc_request() to __blk_mq_end_request()". The clock starts when the block layer creates the request, before the device sees it. Any wait in the queue counts toward `await`.'
			},
			{
				add: ['rq --> dev["Driver issues it to the device: in_flight + 1"]', 'dev --> many["An NVMe SSD works on many requests at once"]'],
				highlight: ['dev', 'many'],
				note: 'The `in_flight` field "counts the number of I/O requests that have been issued to the device driver but have not yet completed". iostat(1) sets "devices serving requests serially" apart from "RAID arrays and modern SSDs", which serve requests in parallel. The test SSD served 64 readers at 12 times the throughput of one.'
			},
			{
				add: ['many --> done["Completion: read I/Os + 1, read ticks + its wait"]', 'done -->|"delta ticks / delta I/Os"| await["await"]'],
				highlight: ['done', 'await'],
				note: 'At completion the kernel adds 1 to `read I/Os` and adds the request\'s wait to `read ticks` in `/sys/block/<dev>/stat`. The kernel docs give an example: "if 60 read requests wait for an average of 30 ms, the read_ticks field will increase by 60*30 = 1800". iostat divides the change in ticks by the change in I/Os to get `await`.'
			},
			{
				add: ['dev --> busy["io_ticks: ms with at least one request queued"]', 'busy -->|"delta / interval"| util["%util"]'],
				highlight: ['busy', 'util'],
				note: '`io_ticks` "counts the number of milliseconds during which the device has had I/O requests queued". One request in flight for the whole second gives 1000 ms, and so do 64 requests in flight. In the test, `%util` stayed between 73% and 82% while throughput went from 291 to 3578 MB/s.'
			},
			{
				add: ['done --> wq["time_in_queue: ms times requests waiting"]', 'wq -->|"delta / interval"| aqu["aqu-sz"]'],
				highlight: ['wq', 'aqu'],
				note: '`time_in_queue` grows by the number of waiting requests for every millisecond, so its change per second is the average queue depth. You can check it with r/s times await: 873,584 reads/s × 0.064 ms = 55.9, and the run measured `aqu-sz` 55.51. Gregg: "Values greater than 1 can be evidence of saturation" on a device that serves one request at a time.'
			}
		]
	},
	example: {
		title: 'sysstat rd_stats.c: compute_ext_disk_stats, %util and await from two samples',
		repo: 'sysstat/sysstat',
		url: `${RD_STATS}#L619-L636`,
		lang: 'c',
		code: `void compute_ext_disk_stats(struct stats_disk *sdc, struct stats_disk *sdp,
			    unsigned long long itv, struct ext_disk_stats *xds)
{
	xds->util  = sdc->tot_ticks < sdp->tot_ticks ?
		     0.0 :
		     S_VALUE(sdp->tot_ticks, sdc->tot_ticks, itv);
	/*
	 * Kernel gives ticks already in milliseconds for all platforms
	 * => no need for further scaling.
	 * Origin (unmerged) flush operations are counted as writes.
	 */
	xds->await = (sdc->nr_ios > sdp->nr_ios) ?
		((sdc->rd_ticks - sdp->rd_ticks) + (sdc->wr_ticks - sdp->wr_ticks) + (sdc->dc_ticks - sdp->dc_ticks)) /
		((double) (sdc->nr_ios - sdp->nr_ios)) : 0.0;
	xds->arqsz = (sdc->nr_ios > sdp->nr_ios) ?
		((sdc->rd_sect - sdp->rd_sect) + (sdc->wr_sect - sdp->wr_sect) + (sdc->dc_sect - sdp->dc_sect)) /
		((double) (sdc->nr_ios - sdp->nr_ios)) : 0.0;
}`,
		notes: [
			'`sdc` is the current sample of the stat file and `sdp` the previous one. iostat reads both with one `fscanf` of 17 fields; [line 432 of iostat.c](' + IOSTAT_C + '#L430-L434) stores field 10 as `tot_ticks` (the kernel\'s `io_ticks`) and field 11 as `rq_ticks` (`time_in_queue`).',
			'Lines 4 to 6 compute `util` from the change in `tot_ticks` over the interval `itv`. `S_VALUE` in common.h is `(n - m) / p * 100`, and iostat later divides the result by 10 to print a percentage. Nothing in it looks at how many requests were in flight.',
			'Lines 12 to 14 compute `await`: the change in read, write and discard ticks, divided by the change in completed I/Os. The comment on lines 8 and 9 notes that the kernel already gives ticks in milliseconds.',
			'Lines 15 to 17 compute `arqsz`, the average request size in 512-byte sectors. iostat prints it as `areq-sz` in kB after dividing by 2. A jump from 4 kB to 512 kB requests changes what a given r/s means.'
		]
	},
	tradeoff: {
		gain: [
			'`/sys/block/<dev>/stat` gives 17 counters in one line, so one read of the file is a consistent snapshot of the device.',
			'`await` and `aqu-sz` come from the same counters and tell you whether requests wait: 64 readers raised `r_await` from 0.012 to 0.064 ms.'
		],
		cost: [
			'`%util` hides the headroom of an SSD or a RAID array: the test disk showed 81.5% busy at 291 MB/s and 73.0% at 3578 MB/s.',
			'Every column is an average over the 1 second interval of `iostat -x 1`. A one-second sample can hide a 50 ms stall that hit a few requests.',
			'Since Linux 5.0, `io_ticks` "counts jiffies when at least one request was started or completed", so the kernel docs warn that some I/O time "might be not accounted" for long concurrent requests.'
		]
	},
	task: {
		prompt: 'Two runs of 4 KiB direct reads on the same NVMe SSD. Run A, 1 reader: r/s 71,008, r_await 0.012 ms, %util 81.5. Run B, 64 readers: r/s 873,584, r_await 0.064 ms, %util 73.0. Compute the average queue depth of each run from r/s and r_await. Then say which number shows that the disk had room for more work in run A.',
		hint: 'Each second, the reads spend r/s × await milliseconds waiting in total. Divide by 1000 ms to get how many were in flight on average.',
		answer: [
			'Run A: 71,008 × 0.012 ms = 852 ms of waiting per second, so `aqu-sz` is about 0.85. The test measured 0.83. One `dd` keeps at most one read in flight, and the gaps between reads (time spent in `dd` itself) explain why it is under 1.',
			'Run B: 873,584 × 0.064 ms = 55,909 ms per second, so `aqu-sz` is about 55.9. The test measured 55.51, close to the 64 readers.',
			'`%util` does not show the headroom: it is about the same in both runs. Run B shows it: 12 times the reads per second, and `r_await` only rose from 0.012 to 0.064 ms. On a disk that serves one request at a time, r/s would stay flat and `await` would grow with the queue.',
			'To try it, run `iostat -x 1 nvme0n1` in one terminal and `dd if=big.file of=/dev/null bs=4k iflag=direct` in another, then start more `dd` processes with different `skip=` values.'
		]
	},
	quiz: [
		{
			q: 'An NVMe SSD shows `%util` 100 in `iostat -x 1`. What do you know for sure?',
			options: [
				'The device reached its maximum throughput for that second',
				'At least one request was in flight during the whole second',
				'The request queue is full and new requests are rejected',
				'Requests wait longer in the queue than on the device itself'
			],
			answer: 1,
			why: '`%util` comes from `io_ticks`, which counts milliseconds with requests in flight. One request or 64 requests give the same count. A device that serves requests in parallel can still take more.'
		},
		{
			q: '`r_await` on a database volume rises from 0.5 ms to 9 ms while `r/s` stays at 2000. What does `r_await` measure?',
			options: [
				'Only the time the device itself took to serve each read request',
				'The time the application spent between two of its read calls',
				'Queue time plus device time, from request creation to completion',
				'The time the page cache took to look up the block on a miss'
			],
			answer: 2,
			why: 'The kernel measures read time from `blk_mq_alloc_request()` to `__blk_mq_end_request()`, and iostat divides the change in read ticks by the change in reads. Time spent waiting in the queue is part of it.'
		},
		{
			q: 'A disk does 2000 reads per second with an `r_await` of 4 ms. About what `aqu-sz` should iostat print?',
			options: ['0.5', '8', '2000', '4'],
			answer: 1,
			why: 'Each second, the reads spend 2000 × 4 ms = 8000 ms waiting in total. Divided by 1000 ms, that is 8 requests in flight on average, which is what the `time_in_queue` counter measures.'
		}
	],
	recall: {
		q: 'What does iostat\'s `%util` count, and why can an NVMe SSD at 80% `%util` still serve 12 times more reads?',
		a: 'The time with at least one request in flight (`io_ticks`), whatever the number of requests. An SSD serves many requests in parallel: in the test, 64 readers got 3578 MB/s against 291 MB/s for one, at about the same `%util`.'
	},
	sources: [
		{ title: 'iostat(1), Linux manual page', url: `${MAN}/man1/iostat.1.html` },
		{ title: 'Linux v6.12, Documentation/admin-guide/iostats.rst', url: `${LINUX}/Documentation/admin-guide/iostats.rst` },
		{ title: 'Linux v6.12, Documentation/block/stat.rst', url: `${LINUX}/Documentation/block/stat.rst` },
		{ title: 'Brendan Gregg, Linux Performance Analysis in 60,000 Milliseconds (Netflix Tech Blog, PDF copy)', url: 'https://www.brendangregg.com/Articles/Netflix_Linux_Perf_Analysis_60s.pdf' },
		{ title: 'open(2), Linux manual page (O_DIRECT)', url: `${MAN}/man2/open.2.html` }
	]
};
