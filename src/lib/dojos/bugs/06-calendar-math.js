const DISCOURSE = 'https://github.com/discourse/discourse';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'calendar-math',
	part: 'Counting',
	title: 'The last Thursday of February',
	minutes: 10,
	hook: [
		'A Discourse event starts on **Thursday 26 February 2026** and repeats every month. Its email says **"The last Thursday of every month"**. It should say the fourth Thursday.',
		'In February 2026 the two mean the same day. In April 2026 they do not: the fourth Thursday is the 23rd and the last is the 30th. The code below picks the word for the email from the start date of the event.'
	],
	terms: [
		{ term: 'Ordinal', def: 'The position of a weekday in its month: first, second, third, fourth, or last.' },
		{ term: '`Date.new(year, month, -1)`', def: 'In Ruby, day -1 means the last day of that month. `.day` then gives the number of days in the month.' },
		{ term: 'BYDAY', def: 'The part of a repeat rule (RRULE) that names the weekday. `BYDAY=4TH` is the fourth Thursday, `BYDAY=-1TH` the last one.' }
	],
	bug: {
		title: 'FIX: only treat a fifth weekday as last in monthly recurrences (#42852)',
		repo: 'discourse/discourse',
		url: `${DISCOURSE}/blob/50b44d80293d87e635c27b0805b8417faf6a55e5/plugins/discourse-events/lib/discourse_post_event/email_renderer.rb#L3-L210`,
		fix: `${DISCOURSE}/commit/b6e8cdad93506447ff0ef99c1d719c9d6a630231`,
		lang: 'ruby',
		code: `module DiscoursePostEvent
  class EmailRenderer
    RECURRENCE_ORDINALS = %w[first second third fourth]
…
    def recurrence_context
      ref = recurrence_ref
      return {} if ref.nil?

      { weekday: ref.strftime("%A"), ordinal: recurrence_ordinal(ref) }
    end
…
    def recurrence_ordinal(ref)
      day_of_month = ref.mday
      days_in_month = Date.new(ref.year, ref.month, -1).day
      is_last = day_of_month + 7 > days_in_month
      key = is_last ? "last" : RECURRENCE_ORDINALS[(day_of_month / 7.0).ceil - 1]
      card_t("builder_modal.recurrence.ordinals.#{key}")
    end`,
		lines: [15],
		diff: `     def recurrence_ordinal(ref)
-      day_of_month = ref.mday
-      days_in_month = Date.new(ref.year, ref.month, -1).day
-      is_last = day_of_month + 7 > days_in_month
-      key = is_last ? "last" : RECURRENCE_ORDINALS[(day_of_month / 7.0).ceil - 1]
+      # Mirrors RRuleConfigurator: a fifth occurrence is expressed as "last",
+      # since not every month has one.
+      nth = (ref.mday / 7.0).ceil
+      key = nth == 5 ? "last" : RECURRENCE_ORDINALS[nth - 1]
       card_t("builder_modal.recurrence.ordinals.#{key}")`,
		notes: [
			'**The check looks at one month only.** `day_of_month + 7 > days_in_month` asks whether there is another Thursday later in this month. For 26 February 2026 that is 26 + 7 = 33, more than 28, so the code says "last". But the event repeats in other months, and the word must be true in all of them.',
			'**Where it goes wrong.** The 26th is the fourth Thursday: `(26 / 7.0).ceil` is 4. February 2026 has Thursdays on 5, 12, 19 and 26, so the fourth is also the last. April 2026 has Thursdays on 2, 9, 16, 23 and 30. "Last" now means the 30th, a fifth Thursday, one week after the fourth.',
			'**The same check made the repeat rule.** The commit fixed it in three places: this email text, the label in the browser, and `RRuleConfigurator`, which built the rule. The pull request: "a monthly event created on a fourth weekday that was also the last one (ie. short months like February) in its month generated `BYDAY=-1`, moving the series to the fifth weekday in every month that had one."',
			'**The fix.** The position comes from the day number alone: days 1 to 7 are first, 22 to 28 fourth, 29 to 31 fifth. Only a fifth becomes "last", because some months have no fifth Thursday and "last" still finds one day in each month. A new test runs the rule from 26 February 2026 and expects 26 February, 26 March and 23 April.'
		]
	},
	quiz: [
		{
			q: 'An event starts on Thursday 26 February 2026. Which text does the buggy code put in the email?',
			options: [
				'The fourth Thursday of every month',
				'The last Thursday of every month',
				'The fifth Thursday of every month',
				'The third Thursday of every month'
			],
			answer: 1,
			why: 'February 2026 has 28 days. 26 + 7 = 33 is more than 28, so `is_last` is true and the key is "last".'
		},
		{
			q: 'The rule `BYDAY=-1TH` starts on 26 February 2026. On which day does the April event fall?',
			options: ['2 April', '23 April', '30 April', '26 April'],
			answer: 2,
			why: 'April 2026 has Thursdays on 2, 9, 16, 23 and 30. `-1` picks the last one, the 30th, instead of the fourth, the 23rd.'
		},
		{
			q: 'Which start date should a test for this code use first?',
			options: [
				'A fourth weekday that is also the last one in its month',
				'The first day of a month that starts on a Monday',
				'A date in a leap year, like 29 February 2028',
				'An event that starts at midnight UTC'
			],
			answer: 0,
			why: 'That is the only case where "fourth" and "last" are the same in the start month and differ in a month with five of that weekday.'
		}
	],
	takeaway: 'A word like "last" or a day like the 31st can be right in the start month and wrong in the next one. Test a repeating date over months of 28, 30 and 31 days, and check that it keeps the same position.',
	sources: [
		{ title: 'discourse pull request #42852', url: `${DISCOURSE}/pull/42852` },
		{ title: 'The fix commit, with the three changed files', url: `${DISCOURSE}/commit/b6e8cdad93506447ff0ef99c1d719c9d6a630231` }
	]
};
