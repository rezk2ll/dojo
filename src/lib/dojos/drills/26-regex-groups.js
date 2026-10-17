/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'regex-groups',
	part: 'Text and data',
	title: 'Regex groups',
	minutes: 10,
	hook: [
		'You are writing a small Node script that reads `access.log` from an API server and turns each line into an object. You need the date, the client IP, the method and the path out of every line. Parentheses in a JavaScript regex do that: each pair keeps the text it matched, and you read it back by number or by name.',
		'The reps use three strings. A line of `access.log`: `2026-10-14 09:12:03 10.0.0.12 GET /api/users/42 200 18ms`. A line of `README.md` with a typo: `Run the the tests before you push.` A line of `app.conf`: `name="api" region="eu-west-1"`. Write each answer as a regex literal, `/.../`, with no flags unless the prompt asks for one.'
	],
	terms: [
		{ term: 'Capturing group', def: '`(...)` in a regex. It keeps the text it matched, numbered 1, 2, 3 in the order of the opening parentheses.' },
		{ term: 'Non-capturing group', def: '`(?:...)` in a regex. It groups a part of the pattern for `|` or a quantifier and keeps nothing.' },
		{ term: 'Backreference', def: '`\\1` or `\\k<name>` inside a pattern. It matches the same text that a group earlier in the pattern matched.' },
		{ term: 'Lazy quantifier', def: 'A quantifier followed by `?`, like `*?` or `+?`. It matches as few characters as it can.' }
	],
	reps: [
		{
			prompt: 'Capture the year, month and day of `2026-10-14` as groups 1, 2 and 3.',
			accept: [
				'/(\\d{4})-(\\d{2})-(\\d{2})/',
				'/^(\\d{4})-(\\d{2})-(\\d{2})/',
				'/(\\d\\d\\d\\d)-(\\d\\d)-(\\d\\d)/',
				'/([0-9]{4})-([0-9]{2})-([0-9]{2})/',
				'/(\\d+)-(\\d+)-(\\d+)/'
			],
			why: 'Each `(...)` is a capturing group. MDN: "Capturing groups are numbered by the order of their opening parentheses." On the log line, `exec()` returns `2026`, `10` and `14` at indexes 1, 2 and 3, and the whole match at index 0.'
		},
		{
			prompt: 'Same date, but name the groups `year`, `month` and `day`.',
			accept: [
				'/(?<year>\\d{4})-(?<month>\\d{2})-(?<day>\\d{2})/',
				'/^(?<year>\\d{4})-(?<month>\\d{2})-(?<day>\\d{2})/',
				'/(?<year>\\d\\d\\d\\d)-(?<month>\\d\\d)-(?<day>\\d\\d)/',
				'/(?<year>[0-9]{4})-(?<month>[0-9]{2})-(?<day>[0-9]{2})/',
				'/(?<year>\\d+)-(?<month>\\d+)-(?<day>\\d+)/'
			],
			why: '`(?<year>...)` is a named capturing group. The match puts `2026` in `m.groups.year`. The group still has its number too, so `m[1]` is also `2026`.'
		},
		{
			prompt: 'Type the replacement string for `line.replace(/(\\d{4})-(\\d{2})-(\\d{2})/, ...)` that turns `2026-10-14` into `14/10/2026`.',
			accept: ["'$3/$2/$1'", '"$3/$2/$1"', '`$3/$2/$1`', '$3/$2/$1'],
			why: 'In a replacement string, `$3` inserts the text of group 3, here the day `14`. `$2` is the month and `$1` the year. The slashes between them are literal.'
		},
		{
			prompt: 'Now with the named groups from rep 2: type the replacement string that turns `2026-10-14` into `14/10/2026`.',
			accept: ["'$<day>/$<month>/$<year>'", '"$<day>/$<month>/$<year>"', '`$<day>/$<month>/$<year>`', '$<day>/$<month>/$<year>'],
			why: '`$<day>` inserts the text of the group named `day`. MDN notes that `$n` and `$<Name>` work only when the first argument of `replace()` is a regex; with a plain string pattern they stay as literal text.'
		},
		{
			prompt: 'Match the IP `10.0.0.12` with a non-capturing group repeated 3 times.',
			accept: [
				'/\\d+(?:\\.\\d+){3}/',
				'/(?:\\d+\\.){3}\\d+/',
				'/\\d{1,3}(?:\\.\\d{1,3}){3}/',
				'/(?:\\d{1,3}\\.){3}\\d{1,3}/'
			],
			why: '`(?:\\.\\d+)` groups a dot and a number so that `{3}` repeats both. The `(?:` start means the group keeps nothing, so `m[1]` does not exist and the match is just `10.0.0.12`. The dot is escaped because a bare `.` matches any character.'
		},
		{
			prompt: 'Match `GET` or `POST`, a space, then capture the path as group 1. Do not capture the method.',
			accept: [
				'/(?:GET|POST) (\\S+)/',
				'/(?:POST|GET) (\\S+)/',
				'/(?:GET|POST)\\s(\\S+)/',
				'/(?:POST|GET)\\s(\\S+)/',
				'/(?:GET|POST) ([^ ]+)/',
				'/(?:POST|GET) ([^ ]+)/'
			],
			why: 'MDN: "A disjunction has the lowest precedence in a regular expression." Without the group, `/GET|POST (\\S+)/` means `GET` alone or `POST` followed by a path. `(?:GET|POST)` limits the `|` to the method, and `(\\S+)` captures `/api/users/42` as group 1.'
		},
		{
			prompt: 'In the `README.md` line, find a word written twice in a row (`the the`). Use a numbered backreference.',
			accept: [
				'/\\b(\\w+) \\1\\b/',
				'/\\b(\\w+)\\s\\1\\b/',
				'/\\b(\\w+)\\s+\\1\\b/',
				'/\\b(\\w+) \\1\\b/i',
				'/\\b(\\w+)\\s+\\1\\b/i'
			],
			why: '`(\\w+)` captures a word, and `\\1` matches the exact text that group 1 matched, here `the`. The `\\b` at both ends stops a match on `the theory`, where `the` is only the start of a longer word.'
		},
		{
			prompt: 'Same search, with a group named `word` and a named backreference.',
			accept: [
				'/\\b(?<word>\\w+) \\k<word>\\b/',
				'/\\b(?<word>\\w+)\\s\\k<word>\\b/',
				'/\\b(?<word>\\w+)\\s+\\k<word>\\b/',
				'/\\b(?<word>\\w+) \\k<word>\\b/i',
				'/\\b(?<word>\\w+)\\s+\\k<word>\\b/i'
			],
			why: '`\\k<word>` matches the same text as the group named `word`. It does the same job as `\\1`, but it still points at the right group if you add another group in front of it later.'
		},
		{
			prompt: 'In the `app.conf` line, capture `api`, the text between the first pair of double quotes. Use a lazy quantifier.',
			accept: ['/"(.*?)"/', '/"(.+?)"/', '/name="(.*?)"/', '/name="(.+?)"/'],
			why: '`.*` alone is greedy: `/"(.*)"/` runs to the last quote and captures `api" region="eu-west-1`. The `?` in `.*?` makes it lazy, so it stops at the first closing quote and group 1 is `api`.'
		},
		{
			prompt: 'Give the lazy regex from rep 9 (`/"(.*?)"/`) the flag that `line.matchAll()` needs, so it returns both quoted values.',
			accept: ['/"(.*?)"/g', '/"(.+?)"/g'],
			why: 'The `g` flag makes the regex search the whole string. MDN: `matchAll()` throws a `TypeError` if the regex does not have the `g` flag. With it, the matches give `api` and `eu-west-1` as group 1.'
		}
	],
	quiz: [],
	recall: {
		q: 'What does the `?` after `.*` change in `/"(.*?)"/` on `name="api" region="eu-west-1"`?',
		a: 'It makes `.*` lazy: it matches as few characters as possible, so group 1 stops at the first closing quote and is `api`. Without it, group 1 is `api" region="eu-west-1`.'
	},
	sources: [
		{ title: 'MDN: Capturing group', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Regular_expressions/Capturing_group' },
		{ title: 'MDN: Named capturing group', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Regular_expressions/Named_capturing_group' },
		{ title: 'MDN: Non-capturing group', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Regular_expressions/Non-capturing_group' },
		{ title: 'MDN: Backreference', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Regular_expressions/Backreference' },
		{ title: 'MDN: Named backreference', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Regular_expressions/Named_backreference' },
		{ title: 'MDN: Quantifier', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Regular_expressions/Quantifier' },
		{ title: 'MDN: String.prototype.replace()', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replace' },
		{ title: 'MDN: String.prototype.matchAll()', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/matchAll' }
	]
};
