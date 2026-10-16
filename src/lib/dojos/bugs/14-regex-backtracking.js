const RAILS = 'https://github.com/rails/rails';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'regex-backtracking',
	part: 'Inputs',
	title: 'An email with too few words',
	minutes: 10,
	hook: [
		'`String#truncate_words` was new in Rails 4.2. It keeps the first N words of a text and adds `...`. A user called it on the body of an inbound email, with 30 as the limit, and **the Rails console hung**. With 20 it returned at once.',
		'The email had 23 words, so there was nothing to cut. The method finds the cut point with one regular expression, built from the separator and the word count.'
	],
	terms: [
		{ term: 'Backtracking', def: 'When part of a regex fails, the engine goes back and tries another way to match the earlier parts.' },
		{ term: 'Lazy quantifier `+?`', def: 'Matches as few characters as possible first, and takes one more each time the engine backtracks into it.' },
		{ term: 'Atomic group `(?>...)`', def: 'Once the group has matched, the engine never goes back into it to try another way.' }
	],
	bug: {
		title: 'Fix a backtracking problem in String#truncate_words',
		repo: 'rails/rails',
		url: `${RAILS}/blob/5a6868b6175167d91fcfaed82b4d4627281a4878/activesupport/lib/active_support/core_ext/string/filters.rb#L93-L101`,
		fix: `${RAILS}/commit/ece0d25c2b64b1bc1f1b4b6343a7f5b909d75f06`,
		lang: 'ruby',
		code: `def truncate_words(words_count, options = {})
  sep = options[:separator] || /\\s+/
  sep = Regexp.escape(sep.to_s) unless Regexp === sep
  if self =~ /\\A((?:.+?#{sep}){#{words_count - 1}}.+?)#{sep}.*/m
    $1 + (options[:omission] || '...')
  else
    dup
  end
end`,
		lines: [4],
		diff: `     sep = options[:separator] || /\\s+/
     sep = Regexp.escape(sep.to_s) unless Regexp === sep
-    if self =~ /\\A((?:.+?#{sep}){#{words_count - 1}}.+?)#{sep}.*/m
+    if self =~ /\\A((?>.+?#{sep}){#{words_count - 1}}.+?)#{sep}.*/m
       $1 + (options[:omission] || '...')`,
		notes: [
			'**A piece can hold anything.** For `truncate_words(30)` the regex is `\\A((?:.+?\\s+){29}.+?)\\s+.*`. Each of the 29 pieces is `.+?` then whitespace. With the `/m` flag, `.` matches any character, spaces and newlines included. So one piece can be one word, three words, or a single space taken out of a run like `"\\n    "`.',
			'**Where it breaks.** The text has 23 words and the regex needs 29 pieces, then one more word and a separator. No split works. The engine only knows that after it has tried the splits: each lazy `.+?` grows one character at a time, and every run of spaces adds places to cut. With 20 as the limit, the very first split already matches, so the call returns at once.',
			'**The fix.** `(?>.+?#{sep})` makes each piece atomic. The lazy `.+?` stops at the first whitespace, `\\s+` takes the whole run, and the engine never reopens the piece. Each piece is now one word and the spaces after it, so a text with too few words fails after a single pass.',
			'**How it was found.** Issue [#19070](' + RAILS + '/issues/19070): "When you cut and paste the following into rails console with Rails 4.2. It hangs..." The reporter was parsing inbound emails: "The hanging is causing 504s to happen eventually". The pull request added a test that wraps the call in `Timeout.timeout(10)`.'
		]
	},
	quiz: [
		{
			q: 'A text has 23 words. Which call is the slow one with the buggy regex?',
			options: ['`truncate_words(5)`', '`truncate_words(20)`', '`truncate_words(30)`', 'All three, the regex is slow on any text'],
			answer: 2,
			why: 'With 5 or 20 the first split finds enough words and matches. With 30 there are not enough words, and the engine tries the other splits before it gives up.'
		},
		{
			q: 'What does `(?>...)` change in the fixed regex?',
			options: [
				'Once a piece has matched, it is never retried another way',
				'It makes `.+?` greedy, so it takes the whole text',
				'It stops `.` from matching newlines in the text',
				'It caches the result for the next call with the same text'
			],
			answer: 0,
			why: 'An atomic group throws away its saved positions once it matches. The engine cannot go back into it, so the number of attempts stops growing.'
		},
		{
			q: 'You review a regex with a repeated group like `(?:.+?\\s+){n}`. Which input should a test use?',
			options: [
				'Text with fewer than n words and runs of spaces',
				'Text with exactly n words and single spaces',
				'An empty string',
				'Text with many more than n words'
			],
			answer: 0,
			why: 'A regex that matches can stop at the first success. A regex that fails has to try every split first, and runs of spaces give it more splits to try.'
		}
	],
	takeaway: 'When a repeated group can also match its own separator, a text that does not match can take a very long time. Test the regex on input that fails, and use an atomic group or a plain `split` instead.',
	sources: [
		{ title: 'rails issue #19070', url: `${RAILS}/issues/19070` },
		{ title: 'rails pull request #19076', url: `${RAILS}/pull/19076` }
	]
};
