/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'regex-basics',
	part: 'Text and data',
	title: 'Regex basics',
	minutes: 10,
	hook: [
		'The log viewer of your team has a filter box that takes a JavaScript regular expression, typed as `/pattern/flags`. A "keep" prompt asks for a regex that matches exactly the lines named. A "match" prompt asks for a regex whose first match in each line is exactly the text named.',
		'The payment service wrote 7 lines in the last minute: `ERROR order 4821 failed: timeout`, `INFO order 4822 paid`, `WARN disk 91% full`, `error order 77 failed: card declined`, `INFO user ana@example.com logged in`, `INFO order 4823 paid in 2 tries` and `DEBUG cache hit`.'
	],
	terms: [
		{ term: 'anchor', def: 'A part of a regex that matches a position instead of a character: `^` is the start of the input, `$` the end and `\\b` a word boundary.' },
		{ term: 'character class', def: 'A set of characters that matches one character, such as `[0-9]`, its shorthand `\\d`, or `[^ ]` for any character except a space.' },
		{ term: 'quantifier', def: 'A suffix that says how many times the item before it repeats: `+` for 1 or more, `*` for 0 or more, `{4}` for exactly 4.' }
	],
	reps: [
		{
			prompt: 'Keep only the lines that start with `INFO`.',
			accept: ['/^INFO/', '/^INFO /', '/^INFO\\b/', '/^INFO\\s/'],
			why: '`^` matches the start of the input, then `INFO` must follow at once. The 3 `INFO` lines match. A line with `INFO` in its middle would not.'
		},
		{
			prompt: 'Keep only the lines that end with `paid`.',
			accept: ['/paid$/', '/ paid$/', '/\\bpaid$/'],
			why: '`$` matches the end of the input. `INFO order 4822 paid` matches. `INFO order 4823 paid in 2 tries` has `paid` in the middle, so it does not.'
		},
		{
			prompt: 'Keep the lines that contain `error` in any case, `ERROR` or `error`. Use a flag.',
			accept: ['/error/i', '/ERROR/i', '/^error/i', '/^ERROR/i'],
			why: 'The `i` flag after the closing slash makes the search case-insensitive. Without it, `/error/` keeps only the line of order 77.'
		},
		{
			prompt: 'Keep the lines with `order`, a space, then exactly 4 digits. The line of order 77 must not match.',
			accept: ['/order \\d{4}/', '/order [0-9]{4}/', '/order \\d\\d\\d\\d/', '/order \\d{4}\\b/', '/order [0-9]{4}\\b/'],
			why: '`\\d` matches one digit, the same as `[0-9]`. `{4}` repeats it exactly 4 times, so orders 4821, 4822 and 4823 match and `order 77` does not.'
		},
		{
			prompt: 'Match a number of one or more digits followed by `%`. The match in the disk line must be `91%`.',
			accept: ['/\\d+%/', '/[0-9]+%/'],
			why: '`+` repeats `\\d` 1 or more times, so `\\d+` takes both digits of `91`. `%` has no special meaning in a regex, so it needs no backslash.'
		},
		{
			prompt: 'Match `failed: ` and the rest of the line. In the first line the match must be `failed: timeout`.',
			accept: ['/failed: .*/', '/failed: .*$/', '/failed:.*/', '/failed: .+/', '/failed: .+$/'],
			why: '`.` matches any character except a line break, and `*` repeats it 0 or more times. The match runs to the end of the line: `failed: card declined` for order 77.'
		},
		{
			prompt: 'Match `user ` and the characters after it up to the next space. The match must be `user ana@example.com`.',
			accept: ['/user [^ ]+/', '/user \\S+/', '/user [^\\s]+/'],
			why: '`[^ ]` is a negated class: it matches one character that is not a space. `+` repeats it until the space before `logged`. `\\S`, any character that is not whitespace, gives the same match here.'
		},
		{
			prompt: 'Match an email address as word characters, `@`, word characters, a literal dot, then word characters. The match must be `ana@example.com`.',
			accept: ['/\\w+@\\w+\\.\\w+/', '/\\w+@\\w+\\.[a-z]+/', '/[\\w.]+@\\w+\\.\\w+/'],
			why: '`\\w` matches a letter, a digit or `_`, the same as `[A-Za-z0-9_]`. `\\.` is a literal dot. An unescaped `.` would match any character, so `/\\w+@\\w+.\\w+/` also matches `ana@example-com`.'
		},
		{
			prompt: 'Keep the lines that contain `in` as a whole word. `declined` in the line of order 77 contains `in` and must not match.',
			accept: ['/\\bin\\b/'],
			why: '`\\b` matches a position where a word character has no word character on one side, such as between `n` and a space. It takes up no characters. `logged in` and `paid in 2 tries` match. In `declined`, `in` sits between `l` and `e`, so there is no boundary.'
		},
		{
			prompt: 'Keep the lines that start with `WARN` or with `ERROR`. Use a group with `|` inside it.',
			accept: ['/^(WARN|ERROR)/', '/^(ERROR|WARN)/', '/^(?:WARN|ERROR)/', '/^(?:ERROR|WARN)/'],
			why: '`|` has the lowest priority in a regex, so `/^WARN|ERROR/` means `^WARN` or `ERROR` anywhere. The group `( )` keeps `^` in front of both words. `(?:...)` groups without capturing and keeps the same 2 lines.'
		}
	],
	quiz: [],
	recall: {
		q: 'Why does `/^WARN|ERROR/` match a line with `ERROR` in the middle, and how do you fix it?',
		a: '`|` has the lowest priority, so the regex reads as `^WARN` or `ERROR` anywhere. A group fixes it: `/^(WARN|ERROR)/`.'
	},
	sources: [
		{ title: 'MDN: Regular expressions guide', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions' },
		{ title: 'MDN: Character classes', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions/Character_classes' },
		{ title: 'MDN: Assertions', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions/Assertions' },
		{ title: 'MDN: Quantifiers', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions/Quantifiers' },
		{ title: 'MDN: Disjunction', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Regular_expressions/Disjunction' }
	]
};
