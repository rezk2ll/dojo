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
		],
		steps: [
			{
				title: 'Read the two runs',
				questions: [
					{ q: 'Both runs use `dd iflag=direct`. Why does that matter here?', options: ['It makes each read 4 KiB larger', 'It turns off `%util` accounting', 'Every read skips the page cache and reaches the device', 'It lets `dd` keep 64 reads in flight'], answer: 2, why: 'Direct I/O uses `O_DIRECT`, so no read is served from memory. The counters see every one.' },
					{ q: 'Run A reads 71,008 blocks of 4 KiB per second. About what throughput is that?', options: ['About 71 MB/s', 'About 291 MB/s', 'About 3578 MB/s', 'About 4 MB/s'], answer: 1, why: '71,008 × 4096 bytes is about 291 million bytes per second, the 291 MB/s of the single `dd`.' },
					{ q: 'Run B reads 873,584 blocks of 4 KiB per second. About what throughput is that?', options: ['About 3578 MB/s', 'About 291 MB/s', 'About 873 MB/s', 'About 64 MB/s'], answer: 0, why: '873,584 × 4096 bytes is about 3578 million bytes per second, twelve times run A.' },
					{ q: 'What does `aqu-sz` tell you?', options: ['The size of each request in kB', 'The number of requests rejected per second', 'The number of processes reading the disk', 'The average number of requests in flight'], answer: 3, why: '`aqu-sz` is the queue depth the device sees, averaged over the interval.' }
				]
			},
			{
				title: 'Compute run A',
				questions: [
					{ q: 'How do you get the average queue depth from r/s and r_await?', options: ['r/s ÷ r_await', 'r/s × r_await ÷ 1000 ms', 'r_await × 1000 ÷ r/s', 'r/s × %util ÷ 100'], answer: 1, why: 'Each second the reads spend r/s × await milliseconds waiting in total. Divided by the 1000 ms of the second, that is how many were in flight on average.' },
					{ q: 'Run A: 71,008 r/s × 0.012 ms is about how much waiting per second?', options: ['85 ms', '8,520 ms', '852 ms', '71 ms'], answer: 2, why: '71,008 × 0.012 = 852 ms of waiting in each second.' },
					{ q: 'So `aqu-sz` for run A is about...', options: ['0.85', '8.5', '1', '85'], answer: 0, why: '852 ms ÷ 1000 ms gives about 0.85. The test measured 0.83.' },
					{ q: 'Why is run A under 1?', options: ['The SSD drops some reads', '`%util` caps the queue at 81.5%', 'Direct I/O halves the queue depth', 'One `dd` keeps at most one read in flight, with gaps between reads'], answer: 3, why: 'A single reader issues one read, waits for it, then spends a little time in `dd` itself before the next one.' }
				]
			},
			{
				title: 'Compute run B',
				questions: [
					{ q: 'Run B: 873,584 r/s × 0.064 ms is about how much waiting per second?', options: ['55,909 ms', '5,591 ms', '559 ms', '873 ms'], answer: 0, why: '873,584 × 0.064 = 55,909 ms of waiting in each second.' },
					{ q: 'So `aqu-sz` for run B is about...', options: ['5.6', '64', '55.9', '0.064'], answer: 2, why: '55,909 ms ÷ 1000 ms gives about 55.9. The test measured 55.51.' },
					{ q: 'Why is it close to 64?', options: ['iostat rounds the queue to the reader count', '64 readers each keep about one read in flight', 'The NVMe queue is 64 entries long', '`%util` rose to 64%'], answer: 1, why: 'Each `dd` has one read in flight at a time, so 64 of them give a queue depth near 64.' },
					{ q: 'How much did `r_await` grow from A to B?', options: ['It stayed at 0.012 ms', 'From 0.012 to 0.64 ms', 'It dropped to 0.006 ms', 'From 0.012 to 0.064 ms'], answer: 3, why: 'About 5 times longer per read, for a queue near 56 instead of under 1. The device served them in parallel.' }
				]
			},
			{
				title: 'Find the headroom',
				questions: [
					{ q: 'Does `%util` show that run A had room for more work?', options: ['Yes: 81.5% leaves 18.5% free', 'Yes: it is higher than run B', 'No: it is about the same in both runs', 'No: it only counts writes'], answer: 2, why: '`%util` went from 81.5 to 73.0 while the reads per second grew 12 times. It does not see parallel requests.' },
					{ q: 'Which numbers do show the headroom?', options: ['r/s grew 12 times while `r_await` only rose to 0.064 ms', '`%util` dropped from 81.5 to 73.0', '`aqu-sz` stayed under 1 in run A', 'The request size stayed at 4 KiB'], answer: 0, why: 'More work got done with little extra wait per read, so the disk was not saturated in run A.' },
					{ q: 'On a disk that serves one request at a time, what would 64 readers do?', options: ['Raise r/s 12 times, like the SSD', 'Lower `aqu-sz` below 1', 'Keep `await` the same and lower `%util`', 'Keep r/s flat and make `await` grow with the queue'], answer: 3, why: 'A serial device cannot do more per second, so the extra requests wait in line.' },
					{ q: 'How would you see this on your own disk?', options: ['`iostat -x 1` in one terminal, `dd ... iflag=direct` in another, then more `dd` with different `skip=`', '`df -h` before and after one `dd`', 'One `dd` without `iflag=direct`, twice in a row', '`du -sh big.file` while `dd` runs'], answer: 0, why: 'Adding readers with different offsets raises the queue depth, and iostat shows how r/s and `await` respond.' }
				]
			}
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
	lab: {
		minutes: 20,
		goal: 'Compute `await`, `%util` and `aqu-sz` yourself from `/sys/block/<dev>/stat`, with one reader and then eight.',
		steps: [
			'Work in a folder on a real disk, under your home (not `/tmp`, which can be a tmpfs where `O_DIRECT` fails). Make a test file and flush it to disk, so its writes do not land in your samples: `head -c 512M /dev/urandom > big.file && sync`.',
			'Find the device behind the folder: `dev=$(basename "$(readlink -f "$(findmnt -no SOURCE -T .)")"); echo $dev; cat /sys/class/block/$dev/stat`. The 1st field is reads, the 4th read ticks (ms), the 10th `io_ticks`, the 11th `time_in_queue`.',
			'One reader: `cat /sys/class/block/$dev/stat > before; dd if=big.file of=/dev/null bs=4k iflag=direct; cat /sys/class/block/$dev/stat > after`. Note the seconds `dd` prints.',
			'Compare the two samples: `awk \'NR==1{for(i=1;i<=NF;i++)a[i]=$i} NR==2{r=$1-a[1]; print "reads",r,"await_ms",($4-a[4])/r,"io_ticks_ms",$10-a[10],"queue_ms",$11-a[11]}\' before after`.',
			'Eight readers on different parts of the file, in bash: `cat /sys/class/block/$dev/stat > before; time (for i in 0 1 2 3 4 5 6 7; do dd if=big.file of=/dev/null bs=4k iflag=direct skip=$((i*16384)) count=16384 2>/dev/null & done; wait); cat /sys/class/block/$dev/stat > after`, then the same `awk`. Clean up with `rm big.file before after`.'
		],
		done: [
			'You have `await` in ms for both runs, from the read ticks divided by the reads.',
			'You have `%util` for both runs: `io_ticks_ms` divided by the elapsed ms.',
			'You have `aqu-sz` for both runs: `queue_ms` divided by the elapsed ms, around 1 for one reader and several times higher for eight.'
		],
		solution: [
			'On the test laptop, one reader took 3.21 s: 131,903 reads, `await` 0.020 ms, `io_ticks` 2524 ms (79% util), `time_in_queue` 2843 ms (`aqu-sz` 0.89).',
			'Eight readers read the same 512 MB in 0.97 s: `await` 0.054 ms, `io_ticks` 970 ms (100% util), `time_in_queue` 7115 ms (`aqu-sz` 7.3).',
			'Throughput went up about 3.3 times while `%util` only went from 79% to 100%. The disk had room that `%util` did not show. Other processes write to the disk during the run, so expect a little noise in the counts.'
		]
	},
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
