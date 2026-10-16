const RUBY = 'https://github.com/ruby/ruby';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'daylight-saving',
	part: 'Counting',
	title: 'October lasts one hour longer',
	minutes: 10,
	hook: [
		'Ruby’s `Logger` can rotate its file once a month: `Logger.new("app.log", "monthly")`. At the end of each month it renames `app.log` and starts a new one.',
		'In 2016 a pull request reported a problem on machines in a time zone where the clocks go back in October. **During October, every single line written rotated the log file again.**',
		'The logger rotates when `now >= @next_rotate_time`. The method below computes that next rotation time. `Time.mktime` builds a time on the local clock of the machine.'
	],
	terms: [
		{ term: 'Daylight saving time (DST)', def: 'Clocks move one hour forward in spring and one hour back in autumn. The day they go back lasts 25 hours on the local clock.' },
		{ term: 'Time.mktime', def: 'Builds a Ruby `Time` from year, month, day (and more) in the local time zone.' },
		{ term: 'Log rotation', def: 'Renaming the current log file and starting a new one, here once per day, week or month.' }
	],
	bug: {
		title: 'logger: fix monthly log rotate with DST',
		repo: 'ruby/ruby',
		url: `${RUBY}/blob/d94ea30a576136d93b122b6eb69971b18be927d5/lib/logger.rb#L623-L643`,
		fix: `${RUBY}/commit/8fc170a34eff0190533b669b3e9f6b6aba42e48c`,
		lang: 'ruby',
		code: `SiD = 24 * 60 * 60

def next_rotate_time(now, shift_age)
  case shift_age
  when 'daily'
    t = Time.mktime(now.year, now.month, now.mday) + SiD
  when 'weekly'
    t = Time.mktime(now.year, now.month, now.mday) + SiD * (7 - now.wday)
  when 'monthly'
    t = Time.mktime(now.year, now.month, 1) + SiD * 31
    return Time.mktime(t.year, t.month, 1) if t.mday > 1
  else
    return now
  end
  if t.hour.nonzero? or t.min.nonzero? or t.sec.nonzero?
    hour = t.hour
    t = Time.mktime(t.year, t.month, t.mday)
    t += SiD if hour > 12
  end
  t
end`,
		lines: [10, 11],
		diff: `       when 'monthly'
-        t = Time.mktime(now.year, now.month, 1) + SiD * 31
-        return Time.mktime(t.year, t.month, 1) if t.mday > 1
+        t = Time.mktime(now.year, now.month, 1) + SiD * 32
+        return Time.mktime(t.year, t.month, 1)
       else`,
		notes: [
			'**A day is not always 86,400 seconds.** `SiD * 31` adds 31 times 86,400 seconds to midnight on the 1st. In Europe the clocks go back on the last Sunday of October, so October lasts 31 days and one hour. October 1 at 00:00 plus 31 × 86,400 seconds is **October 31 at 23:00** on the local clock, not November 1.',
			'**Where it breaks.** `t.mday` is 31, so `t.mday > 1` is true and the method returns `Time.mktime(t.year, t.month, 1)`: October 1, the start of the current month. That time is already past, so `now >= @next_rotate_time` is true on the next write, and on the one after. The pull request: "which lead every single line of log during october to rotate the log file."',
			'**Why the other months worked.** With European clock changes, a 30-day month such as April gives May 2, and the `t.mday > 1` branch returns May 1. A 31-day month without a clock change gives the 1st at 00:00 and falls through. In March the clocks go forward, so the result is April 1 at 01:00, and the hour check below rounds it down to April 1.',
			'**The fix.** 32 days from the 1st always lands in the next month: no month is longer than 31 days and one hour, and February 1 plus 32 days is March 5. So `Time.mktime(t.year, t.month, 1)` is always the 1st of the next month, and the `if` is no longer needed.',
			'**How it was found.** A user sent the fix as [pull request #1458](' + RUBY + '/pull/1458). Its description says "With DST the month of october can actually last more than 31 days. It can last 31 days plus 1 hour."'
		]
	},
	quiz: [
		{
			q: 'Clocks go back one hour on October 30, 2016. What is `Time.mktime(2016, 10, 1) + SiD * 31` on the local clock?',
			options: ['November 1 at 00:00', 'October 31 at 23:00', 'November 1 at 01:00', 'October 31 at 00:00'],
			answer: 1,
			why: 'October has 31 days plus the extra hour from the clock change. 31 × 86,400 seconds is one hour short of the end of October, so the result is October 31 at 23:00.'
		},
		{
			q: 'In March the clocks go forward one hour. Why did the bug not show in March?',
			options: [
				'The result is April 1 at 01:00, and the hour check rounds it down',
				'March has fewer seconds than October, so 31 days reach May',
				'Ruby ignores clock changes in spring when it adds seconds to a Time',
				'The monthly branch is skipped when the month starts on a Sunday'
			],
			answer: 0,
			why: 'March loses an hour, so 31 × 86,400 seconds lands at 01:00 on April 1. `t.mday` is 1, the `if` does not return, and the code below sets the time back to 00:00 on April 1.'
		},
		{
			q: 'You test a function that adds days to a local time. Which setup finds this kind of bug?',
			options: [
				'Run it with TZ=UTC so the result is the same on every machine',
				'Call it once with the current time and check it by hand',
				'Run it in a time zone with DST, for the 1st of every month',
				'Run it with a fake clock set to noon on a weekday'
			],
			answer: 2,
			why: 'UTC never changes its clocks, so it hides the bug. A zone with DST and a start date in every month includes October 1, the input that fails.'
		}
	],
	takeaway: 'Adding 86,400 seconds per day to a local time is wrong on the days the clocks change. Build the date you want from year, month and day, and test it in a time zone with DST.',
	sources: [
		{ title: 'ruby pull request #1458', url: `${RUBY}/pull/1458` },
		{ title: 'The fix commit', url: `${RUBY}/commit/8fc170a34eff0190533b669b3e9f6b6aba42e48c` }
	]
};
