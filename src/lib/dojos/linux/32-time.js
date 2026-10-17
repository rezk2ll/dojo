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
