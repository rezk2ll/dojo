const GO = 'https://github.com/golang/go/blob/c3a068eec992b5ae783abce1a9d03f617b671ea2';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'time',
	part: 'The running system',
	title: 'Clocks and NTP',
	minutes: 10,
	hook: [
		'At midnight UTC on 1 January 2017, a leap second was inserted. On Cloudflare\'s DNS servers, the time went back one second, and RRDNS, their DNS server written in Go, started to panic.',
		'RRDNS timed each upstream resolver with `rtt := time.Now().Sub(start)`. Those resolvers answer in a few milliseconds, so a one-second step back made the result negative. After smoothing, the value reached `rand.Int63n()`, which panics on a negative argument. At peak 0.2% of DNS queries failed, and the fix was rolled out worldwide by 06:45 UTC.',
		'Go had no monotonic clock then (issue 12914). **Linux has two clocks for this**: `CLOCK_REALTIME`, which NTP and root can set, and `CLOCK_MONOTONIC`, which never goes back. Go 1.9 started reading both in every `time.Now()`.'
	],
	terms: [
		{ term: 'Wall clock', def: '`CLOCK_REALTIME`: the date and time, counted in seconds since 1970-01-01 00:00 UTC without leap seconds. Root, `date -s` and NTP daemons can set it, forwards or backwards.' },
		{ term: 'Monotonic clock', def: '`CLOCK_MONOTONIC`: on Linux, the time since boot, minus any time spent in suspend. Nobody can set it, and consecutive reads never go backwards.' },
		{ term: 'Slew', def: 'Correcting the wall clock by running it slightly faster or slower until the offset is gone. chronyd does this by default, at most 83333 ppm (one twelfth).' },
		{ term: 'Step', def: 'Setting the wall clock to a new value at once, so it jumps forward or back. chronyd steps only when `makestep` allows it, and the kernel steps back one second for an inserted leap second.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['app["Go: time.Now()"] -->|"CLOCK_REALTIME"| rt["Wall clock: 2017-01-01 00:00:00.004 UTC"]', 'app -->|"CLOCK_MONOTONIC"| mono["Monotonic clock: 86400.004 s since boot"]'],
				highlight: ['app'],
				note: 'On linux/amd64, Go\'s `time.now` calls `clock_gettime` twice: `CLOCK_REALTIME` (line 52 of `runtime/time_linux_amd64.s`) and `CLOCK_MONOTONIC` (line 59). The `Time` value keeps both readings. The dates in the boxes are example values for 4 ms after midnight.'
			},
			{
				add: ['chrony["chronyd: clock 0.5 s ahead of the NTP server"] -->|"slew: run slower, up to 83333 ppm"| rt', 'chrony -.->|"same rate change"| mono'],
				highlight: ['chrony'],
				note: 'chronyd normally corrects an offset "by slowing down or speeding up the clock as required". The wall clock keeps moving forward, only at a slightly different rate. clock_gettime(2) says `CLOCK_MONOTONIC` is "affected by frequency adjustments" too, but it never jumps.'
			},
			{
				add: ['step["makestep 1 3: offset over 1 s in the first 3 updates"] -->|"step: jump"| rt'],
				highlight: ['step', 'rt'],
				note: 'A clock that is far off at boot would take hours to slew. `makestep 1 3` lets chronyd step the clock when the offset is above 1 second, but only during its first three clock updates. The chrony docs advise stepping "only on boot, before starting programs that rely on time advancing monotonically forwards". A step changes `CLOCK_REALTIME` only.'
			},
			{
				add: ['leap["Leap second at 00:00:00 UTC"] -->|"kernel steps back 1 s"| rt', 'rt --> neg["RRDNS: time.Now().Sub(start) is negative"]'],
				highlight: ['leap', 'neg'],
				note: 'With chrony\'s default `leapsecmode system`, "the kernel steps the system clock backwards by one second when the clock gets to 00:00:00 UTC". A start time read at 23:59:59.998 and an end time read 4 ms later, after the step, at 23:59:59.002 give a difference of -996 ms.'
			},
			{
				add: ['mono --> pos["Go 1.9+: Sub uses both monotonic readings, rtt is 4 ms"]'],
				highlight: ['pos'],
				note: 'Since Go 1.9, `t.Sub(u)` uses the monotonic readings when both values have one, so the result stays positive across the step. Log timestamps still come from the wall clock: a line written just after the step shows an earlier time than the line before it. POSIX also says that setting `CLOCK_REALTIME` has no effect on relative sleeps such as `nanosleep()`.'
			}
		]
	},
	example: {
		title: 'src/time/time.go: Time.Sub prefers the monotonic reading',
		repo: 'golang/go',
		url: `${GO}/src/time/time.go#L1194-L1223`,
		lang: 'go',
		code: `// Sub returns the duration t-u. If the result exceeds the maximum (or minimum)
// value that can be stored in a [Duration], the maximum (or minimum) duration
// will be returned.
// To compute t-d for a duration d, use t.Add(-d).
func (t Time) Sub(u Time) Duration {
	if t.wall&u.wall&hasMonotonic != 0 {
		return subMono(t.ext, u.ext)
	}
	d := Duration(t.sec()-u.sec())*Second + Duration(t.nsec()-u.nsec())
	// Check for overflow or underflow.
	switch {
	case u.Add(d).Equal(t):
		return d // d is correct
	case t.Before(u):
		return minDuration // t - u is negative out of range
	default:
		return maxDuration // t - u is positive out of range
	}
}

func subMono(t, u int64) Duration {
	d := Duration(t - u)
	if d < 0 && t > u {
		return maxDuration // t - u is positive out of range
	}
	if d > 0 && t < u {
		return minDuration // t - u is negative out of range
	}
	return d
}`,
		notes: [
			'Line 6 checks the `hasMonotonic` bit in both values. The [`Time` struct comment](' + GO + '/src/time/time.go#L140-L153) says that when the bit is set, `ext` holds "a signed 64-bit monotonic clock reading, nanoseconds since process start". Line 7 subtracts those two numbers and ignores the wall clock.',
			'Line 9 is the fallback when one value has no monotonic reading: it subtracts wall-clock seconds and nanoseconds, the kind of subtraction that went negative in RRDNS. Values from `time.Unix`, `time.Parse` or `UnmarshalJSON` have no monotonic reading, and `t.UTC()`, `t.In()` and `t.Round(0)` strip it.',
			'Lines 21 to 29 subtract the raw nanosecond counts and clamp an overflow to `maxDuration` or `minDuration`. A wall-clock step cannot change `ext`, because it comes from `CLOCK_MONOTONIC`.',
			'The [Go 1.9 release notes](https://go.dev/doc/go1.9#monotonic-time) describe the change: the package "now transparently tracks monotonic time in each Time value, making computing durations between two Time values a safe operation in the presence of wall clock adjustments".'
		]
	},
	tradeoff: {
		gain: [
			'Durations and timeouts measured on `CLOCK_MONOTONIC` stay positive and correct when NTP, root or a leap second steps the wall clock.',
			'Slewing keeps the wall clock moving forward, so log timestamps and file times stay in order while chronyd corrects a small offset.'
		],
		cost: [
			'A monotonic reading means nothing outside the process or after a reboot. Go drops it from JSON, gob and text forms, so durations against stored times use the wall clock.',
			'Slewing is slow: at the default maximum of one twelfth, a 1 hour offset takes 12 hours to remove, so a badly wrong clock at boot needs `makestep`.',
			'`CLOCK_MONOTONIC` does not count time the machine is suspended. A laptop that slept for an hour measures that hour as zero, and `CLOCK_BOOTTIME` exists for that case.'
		]
	},
	task: {
		prompt: 'A Go 1.22 service runs four snippets. Say which ones can return a wrong or negative duration if the wall clock steps back 1 second in the middle. (a) `start := time.Now()` ... `time.Since(start)`. (b) `start := time.Now().UTC()` ... `time.Since(start)`. (c) `exp := time.Unix(row.ExpiresAt, 0)` ... `time.Until(exp)`. (d) `start := time.Now().Round(0)` ... `time.Now().Sub(start)`. Then run `timedatectl timesync-status` (systemd-timesyncd) or `chronyc tracking` (chrony) and read the offset.',
		hint: 'For each snippet, ask whether both `Time` values still carry a monotonic reading. Read the "Monotonic Clocks" section of the `time` package docs.',
		answer: [
			'(a) is safe: both values come from `time.Now()` with a monotonic reading, so `Since` subtracts the monotonic counts.',
			'(b) and (d) are exposed: `UTC()` and `Round(0)` strip the monotonic reading, so `Sub` falls back to the wall clock and a step back can give a negative result, the RRDNS bug.',
			'(c) uses the wall clock by design: `time.Unix` has no monotonic reading. An expiry stored in a database must mean the same instant on every machine, so the wall clock is the right choice there. A step moves the result by the size of the step.',
			'Output of `timedatectl timesync-status` on the machine this chapter was written on: `Offset: +1.620ms`, `Frequency: -1.233ppm`, server `ntp.ubuntu.com`, stratum 2. The clock is 1.6 ms off its server, small enough for a slew. In `chronyc tracking`, the offset is the `System time` line, and `Frequency` is "the rate by which the system\'s clock would be wrong if chronyd was not correcting it".'
		],
		steps: [
			{
				title: 'Check what each value carries',
				questions: [
					{ q: '(a) `start := time.Now()`. Does `start` carry a monotonic reading?', options: ['No, `time.Now()` reads the wall clock only', 'Yes, `time.Now()` reads both clocks', 'Only when the program runs as root', 'Only on Go versions before 1.9'], answer: 1, why: 'Since Go 1.9, `time.Now()` calls `clock_gettime` for `CLOCK_REALTIME` and `CLOCK_MONOTONIC`, and the `Time` value keeps both.' },
					{ q: '(b) `start := time.Now().UTC()`. What does `UTC()` do to the monotonic reading?', options: ['It strips it', 'It converts it to UTC', 'It keeps it unchanged', 'It doubles its precision'], answer: 0, why: 'The `time` docs list `t.UTC()`, `t.In()` and `t.Round(0)` as calls that strip the monotonic reading.' },
					{ q: '(c) `exp := time.Unix(row.ExpiresAt, 0)`. Does `exp` have a monotonic reading?', options: ['Yes, `time.Unix` reads `CLOCK_MONOTONIC`', 'Yes, but only if the row was written by the same process', 'No, a value built from a number has none', 'No, because `ExpiresAt` is in the future'], answer: 2, why: 'Values from `time.Unix`, `time.Parse` or `UnmarshalJSON` have no monotonic reading. A monotonic count means nothing outside the process.' },
					{ q: '(d) `start := time.Now().Round(0)`. What is left in `start`?', options: ['Both readings, rounded to the second', 'The monotonic reading only', 'Nothing, `Round(0)` returns the zero time', 'The wall-clock reading only'], answer: 3, why: '`Round(0)` is the documented way to strip the monotonic reading and keep the wall clock.' }
				]
			},
			{
				title: 'Follow a step back',
				questions: [
					{ q: 'In (a), how does `time.Since(start)` compute the result?', options: ['It subtracts the two monotonic readings', 'It subtracts the two wall-clock readings', 'It asks chronyd for the current offset', 'It reads `/proc/uptime` twice'], answer: 0, why: '`Sub` checks the `hasMonotonic` bit in both values and calls `subMono`. A wall-clock step cannot change `CLOCK_MONOTONIC`.' },
					{ q: 'In (b), the wall clock steps back 1 s during a 4 ms call. What can `time.Since(start)` return?', options: ['4 ms, because Go corrects the step', 'A negative duration, about -996 ms', 'Zero, because Go clamps negative values', 'A panic, because the clocks disagree'], answer: 1, why: 'One value has no monotonic reading, so `Sub` subtracts wall-clock times. A 1 s step back between two reads 4 ms apart gives -996 ms, the RRDNS bug.' },
					{ q: 'In (c), what does the same step do to `time.Until(exp)`?', options: ['It makes the result negative', 'Nothing, `Until` is always monotonic', 'It moves the result by the size of the step', 'It makes Go fall back to `CLOCK_BOOTTIME`'], answer: 2, why: '`time.Until` subtracts wall-clock times here. A 1 s step back makes the expiry look 1 s further away.' },
					{ q: 'Why is the wall clock the right choice in (c)?', options: ['It is faster to read than the monotonic clock', 'The monotonic clock is not available in containers', 'The wall clock never jumps on a server with NTP', 'A stored expiry must mean the same instant on every machine'], answer: 3, why: 'A monotonic reading counts from process start, so it cannot be stored in a database and read elsewhere. An expiry needs a real date.' }
				]
			},
			{
				title: 'Name the exposed snippets',
				questions: [
					{ q: 'Which snippets can return a negative duration after a 1 s step back?', options: ['(b) and (d)', '(a) and (c)', 'Only (c)', 'All four'], answer: 0, why: 'In (b) and (d), `start` lost its monotonic reading, so `Sub` takes the wall-clock path. (c) moves by the step but stays a wall-clock comparison by design.' },
					{ q: 'Which snippet is safe as written?', options: ['(b), because UTC has no leap seconds', '(d), because the value is rounded', '(c), because it reads a database', '(a), because both values are from `time.Now()`'], answer: 3, why: 'Only (a) keeps two monotonic readings, so the result stays positive across the step.' },
					{ q: 'How do you fix (b) and still log the start in UTC?', options: ['Call `UTC()` on the end time too', 'Time with the plain `time.Now()` value and call `UTC()` only when you format it', 'Replace `time.Since` with `time.Until`', 'Add `Round(0)` to both values'], answer: 1, why: 'Keep the value from `time.Now()` for the subtraction. Converting a copy for display does not touch the value you measure with.' },
					{ q: 'After the fix, a log line written just after the step shows an earlier time than the line before. Why?', options: ['The fix broke the logger', 'Go reorders log lines by monotonic time', 'Log timestamps still come from the wall clock', 'The kernel writes logs before the step'], answer: 2, why: 'The monotonic reading fixes durations only. Timestamps you print are wall-clock times, so they jump with the clock.' }
				]
			},
			{
				title: 'Read the sync status',
				questions: [
					{ q: 'On a machine with systemd-timesyncd, which command shows the offset?', options: ['`timedatectl timesync-status`', '`date --offset`', '`hwclock --show`', '`sysctl kernel.time`'], answer: 0, why: '`timedatectl timesync-status` prints the server, stratum, `Offset` and `Frequency` of systemd-timesyncd. With chrony, run `chronyc tracking`.' },
					{ q: 'The output shows `Offset: +1.620ms`. What will the daemon do?', options: ['Step the clock back 1.6 ms at once', 'Wait for a reboot to apply it', 'Ignore it, offsets below 1 s are never corrected', 'Slew it away by changing the clock rate a little'], answer: 3, why: '1.6 ms is small enough for a slew, so the wall clock keeps moving forward. Steps are for large offsets, such as a clock far off at boot.' },
					{ q: 'In `chronyc tracking`, which line holds the offset?', options: ['`Frequency`', '`System time`', '`Stratum`', '`Reference ID`'], answer: 1, why: 'The chronyc docs put the offset of the system clock on the `System time` line.' },
					{ q: 'What does `Frequency` mean in that output?', options: ['How often the daemon polls its server', 'How many leap seconds are scheduled', 'How fast the clock would drift if the daemon stopped correcting it', 'How many servers the daemon trusts'], answer: 2, why: 'chronyc(1): the rate by which the clock "would be wrong if chronyd was not correcting it", in ppm.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'chronyd has run for three days with `makestep 1 3`. It now measures the clock 0.5 s ahead of its NTP servers. What does it do?',
			options: [
				'Steps the clock back 0.5 s at once, because the offset is known',
				'Runs the clock slightly slower until the 0.5 s offset is gone',
				'Stops and exits, because the offset is above its maximum',
				'Waits for the next reboot, when `makestep` can apply'
			],
			answer: 1,
			why: '`makestep 1 3` allows a step only for offsets above 1 s, and only in the first three updates. Otherwise chronyd slews, changing the clock rate up to `maxslewrate`. The wall clock never jumps.'
		},
		{
			q: 'A worker calls `nanosleep()` for 5 seconds. During the sleep, root runs `date -s` and sets the clock one hour back. When does the worker wake up?',
			options: [
				'After 1 hour and 5 seconds, when the wall clock reaches the old target',
				'At once, because a clock change wakes every sleeping thread',
				'After 5 seconds, because a relative sleep ignores clock changes',
				'Never, because the sleep target is now in the past'
			],
			answer: 2,
			why: 'POSIX, quoted in clock_gettime(2): setting `CLOCK_REALTIME` "shall have no effect on threads that are blocked waiting for a relative time service", including `nanosleep()`. The sleep expires when the requested interval has elapsed.'
		},
		{
			q: 'Go code does `start := time.Now().UTC()` and later `time.Since(start)`. A leap second steps the clock back during the call. What can `time.Since` return?',
			options: [
				'A negative duration, because `UTC()` stripped the monotonic reading',
				'The correct positive duration, because `time.Now()` is always monotonic',
				'A panic, because Go refuses to subtract across a leap second',
				'Zero, because Go clamps any negative result to zero'
			],
			answer: 0,
			why: '`t.UTC()` strips the monotonic reading, so `Sub` takes the wall-clock path on line 9 of the example. A one-second step back between the two reads makes the difference negative. Without `UTC()`, both values have monotonic readings and the result stays positive.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Read the two clocks side by side, see which Go values keep a monotonic reading, and read your machine\'s NTP offset.',
		steps: [
			'Read the wall clock, the monotonic clock and the uptime: `python3 -c \'import time; print(time.clock_gettime(time.CLOCK_REALTIME), time.clock_gettime(time.CLOCK_MONOTONIC))\'; cat /proc/uptime`.',
			'Make a folder: `mkdir -p ~/clock-lab && cd ~/clock-lab`. Write `main.go` (package `main`, imports `fmt` and `time`) whose `main` prints four values with `fmt.Println`: `time.Now()`, `time.Now().UTC()`, `time.Now().Round(0)` and `time.Unix(time.Now().Unix(), 0)`.',
			'Run it: `go run main.go`. Look at the end of each line.',
			'Read the sync status: `timedatectl timesync-status` with systemd-timesyncd, or `chronyc tracking` with chrony.'
		],
		done: [
			'On a machine that has not been suspended since boot, the monotonic value from Python is close to the first number of `/proc/uptime`, and the wall-clock value is about 1.79 billion seconds or more.',
			'Only the `time.Now()` line ends with `m=+0.0000...`. The `UTC()`, `Round(0)` and `time.Unix` lines have no `m=` part.',
			'You can read an `Offset` line (timesyncd) or a `System time` line (chrony) and say whether it is small enough to slew.'
		],
		solution: [
			'`CLOCK_MONOTONIC` counts from boot, minus suspend, so on a server it tracks `/proc/uptime`. `CLOCK_REALTIME` counts seconds since 1970.',
			'`main.go`: `package main`, `import ("fmt"; "time")`, then `func main() { fmt.Println(time.Now()); fmt.Println(time.Now().UTC()); fmt.Println(time.Now().Round(0)); fmt.Println(time.Unix(time.Now().Unix(), 0)) }`.',
			'Go prints `m=+<seconds>` when a value carries a monotonic reading. The other three lines lost it, so `Sub` on them falls back to the wall clock, like snippets (b), (c) and (d) of the task.',
			'An offset of a few milliseconds is normal and gets slewed. You cannot step the clock without root, and you should not on a shared machine: the lesson is that only values with `m=` survive a step.'
		]
	},
	recall: {
		q: 'Which Linux clock should code use to measure a timeout, and what went wrong in Cloudflare\'s RRDNS on 1 January 2017?',
		a: '`CLOCK_MONOTONIC`, which never goes back. RRDNS subtracted two wall-clock readings across the leap second, got a negative duration, and `rand.Int63n()` panicked; 0.2% of DNS queries failed at peak.'
	},
	sources: [
		{ title: 'Cloudflare blog, How and why the leap second affected Cloudflare DNS (2017)', url: 'https://blog.cloudflare.com/how-and-why-the-leap-second-affected-cloudflare-dns/' },
		{ title: 'clock_gettime(2), man7.org', url: 'https://man7.org/linux/man-pages/man2/clock_gettime.2.html' },
		{ title: 'chrony 4.6 docs, chrony.conf(5)', url: 'https://chrony-project.org/doc/4.6/chrony.conf.html' },
		{ title: 'chrony 4.6 docs, chronyc(1)', url: 'https://chrony-project.org/doc/4.6/chronyc.html' },
		{ title: 'Go time package, Monotonic Clocks', url: 'https://pkg.go.dev/time#hdr-Monotonic_Clocks' },
		{ title: 'Go issue 12914, time: use monotonic clock to measure elapsed time', url: 'https://github.com/golang/go/issues/12914' },
		{ title: 'Go source, runtime/time_linux_amd64.s', url: `${GO}/src/runtime/time_linux_amd64.s#L52-L62` }
	]
};
