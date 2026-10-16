const ESLINT = 'https://github.com/eslint/eslint';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'missing-check',
	part: 'Logic',
	title: 'An array that passes as a severity',
	minutes: 10,
	hook: [
		'ESLint validates every rule in a config before it lints anything. A rule entry is a severity, or an array with the severity first and the rule\'s options after it. The docs allow six severities: `0`, `1`, `2`, `"off"`, `"warn"` and `"error"`.',
		'A user passed `\'comma-dangle\': [[\'error\'], \'never\']` to `CLIEngine`. The severity is the array `[\'error\']`, and ESLint 2.3.0 **accepted it without an error**.'
	],
	terms: [
		{ term: 'Severity', def: 'How ESLint reports a rule: off, warning or error, written as 0, 1, 2 or as a string.' },
		{ term: 'Type coercion', def: 'JavaScript converting a value to another type on its own, for example an array to a string.' },
		{ term: 'RegExp.prototype.test', def: 'Returns true when the pattern matches. It converts a non-string argument to a string first.' }
	],
	bug: {
		title: 'Fix: validate the type of severity level (fixes #5499)',
		repo: 'eslint/eslint',
		url: `${ESLINT}/blob/d727f17f4efc888ed0e59259a4e4cac01a42f0d9/lib/config/config-validator.js#L64-L113`,
		fix: `${ESLINT}/commit/641b3f784098d109f29eb7ca2c94db6c1a641fd7`,
		lang: 'javascript',
		code: `function validateRuleOptions(id, options, source) {
    var validateRule = validators.rules[id],
        message,
        severity,
        localOptions,
        schema = getRuleOptionsSchema(id),
        validSeverity = true;
…
    // if it's not an array, it should be just a severity
    if (Array.isArray(options)) {
        localOptions = options.concat();    // clone
        severity = localOptions.shift();
    } else {
        severity = options;
        localOptions = [];
    }

    validSeverity = (severity === 0 || severity === 1 || severity === 2 || /^(?:off|warn|error)$/i.test(severity));

    if (validateRule) {
        validateRule(localOptions);
    }

    if ((validateRule && validateRule.errors) || !validSeverity) {
…
        throw new Error(message.join(""));
    }
}`,
		lines: [18],
		diff: `         localOptions = [];
     }

-    validSeverity = (severity === 0 || severity === 1 || severity === 2 || /^(?:off|warn|error)$/i.test(severity));
+    validSeverity = (
+        severity === 0 || severity === 1 || severity === 2 ||
+        (typeof severity === "string" && /^(?:off|warn|error)$/i.test(severity))
+    );

     if (validateRule) {`,
		notes: [
			'**The regex check has no type check.** The line assumes that anything that is not 0, 1 or 2 is a string. `RegExp.prototype.test` converts its argument to a string, so the check really asks whether `String(severity)` looks like a severity.',
			'**The input from the report, worked out.** `options` is `[[\'error\'], \'never\']`. `shift()` takes the first element, so `severity` is `[\'error\']`. It is not 0, 1 or 2. `String([\'error\'])` is `"error"`, the regex matches, `validSeverity` is `true`, and nothing is thrown. A two-element array like `[\'warn\', \'error\']` becomes `"warn,error"` and is still rejected, so only one-element arrays get through.',
			'**The fix** adds `typeof severity === "string"` before the regex. Numbers are still checked with `===`, strings with the regex, and every other type now fails.',
			'**How it was found.** [Issue #5499](' + ESLINT + '/issues/5499), "An array is unexpectedly regarded as a valid ESLint severity". The reporter explained the cause: "`String([\'error\'])` returns `\'error\'`. Unfortunately, that also matches `/^(?:off|warn|error)$/i`."'
		]
	},
	quiz: [
		{
			q: 'What does `/^(?:off|warn|error)$/i.test([\'error\'])` return?',
			options: [
				'`false`, because an array is not a string',
				'`true`, because the array is converted to the string `"error"`',
				'It throws a `TypeError` for a non-string argument',
				'`false`, because the converted string is `"[error]"`'
			],
			answer: 1,
			why: '`test` converts its argument with `String()`. A one-element array becomes its element, `"error"`, which matches the pattern.'
		},
		{
			q: 'Which of these severities does the buggy check reject?',
			options: [
				'`[\'off\']`, an array with one string',
				'`\'ERROR\'`, a string in capitals',
				'`2`, the number for an error',
				'`[\'warn\', \'error\']`, an array of two'
			],
			answer: 3,
			why: '`String([\'warn\', \'error\'])` is `"warn,error"`, which does not match. `[\'off\']` becomes `"off"` and wrongly passes. `\'ERROR\'` and `2` are valid severities.'
		},
		{
			q: 'You validate a value with a regex. What keeps other types from slipping through?',
			options: [
				'Adding the `u` flag so the regex is stricter',
				'Calling `String(value)` before the test, so it is always a string',
				'Wrapping the test in `try` and rejecting on an exception',
				'Checking `typeof value === "string"` before the regex test'
			],
			answer: 3,
			why: 'The regex only sees a string, whatever the input was. The type has to be checked separately, before the conversion happens.'
		}
	],
	takeaway: 'A regex test validates the string form of a value, not the value. When a check must accept only strings, test `typeof` first, then the pattern.',
	sources: [
		{ title: 'eslint issue #5499', url: `${ESLINT}/issues/5499` },
		{ title: 'eslint pull request #5527', url: `${ESLINT}/pull/5527` }
	]
};
