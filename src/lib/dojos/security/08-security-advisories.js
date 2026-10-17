const SEMVER = 'https://github.com/npm/node-semver/blob/717534ee353682f3bcf33e60a8af4292626d4441';
const RANGE = `${SEMVER}/classes/range.js`;
const RE = `${SEMVER}/internal/re.js`;
const SATISFIES = `${SEMVER}/functions/satisfies.js`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'security-advisories',
	part: 'Threats',
	title: 'Responding to an advisory',
	minutes: 10,
	hook: [
		'On 21 June 2023, GitHub published advisory GHSA-c2qf-rxjj-qqgw (CVE-2022-25883) for `semver`, the npm package that parses version ranges like `^1.2.3`. The npm registry counted about 873 million downloads of it in the week of 6 to 12 October 2026.',
		'The advisory says `new Range` is open to a regular expression denial of service "when untrusted user data is provided as a range". A crafted range string keeps the regex engine busy for a long time. Node.js runs it on the event loop, so the process answers no other request until it ends. The score is CVSS 7.5, with `A:H`: the impact is on availability only.',
		'Three lines are affected, with three fixes: 7.5.2, 6.3.1 and 5.7.2. Your lockfile probably holds more than one copy.'
	],
	terms: [
		{ term: 'Advisory', def: 'A published notice for one vulnerability: the package, the vulnerable version ranges, the first patched version for each, and a severity. GitHub gives each one a `GHSA-` id.' },
		{ term: 'Transitive dependency', def: 'A package you did not list in `package.json` that one of your dependencies pulls in. `npm explain semver` prints the chain that installed each copy.' },
		{ term: 'Patched version', def: 'The first release that has the fix on a given line. For semver: 7.5.2 for 7.x, 6.3.1 for 6.x and 5.7.2 for everything older.' },
		{ term: 'ReDoS', def: 'Regular expression denial of service: an input that makes a regex backtrack for a very long time, so the process spends its CPU on one string.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['alert["GHSA-c2qf-rxjj-qqgw: semver < 7.5.2, < 6.3.1, < 5.7.2"] --> find["1. Find: npm explain semver"]'],
				highlight: ['alert', 'find'],
				note: 'The alert comes from `npm audit`, Dependabot or the advisory page. Step one is a list of every installed copy. `npm explain semver` prints "the chain of dependencies causing a given package to be installed", one block per version. Write down each version and the package that pulled it in.'
			},
			{
				add: ['find --> assess["2. Assess: does untrusted input reach new Range?"]'],
				highlight: ['assess'],
				note: 'The advisory names the condition: untrusted data passed as a range. `semver.satisfies(version, range)` calls `new Range(range)` on its second argument. A build tool reading ranges from your own `package.json` does not take outside input. A public API that reads `?range=` from the query string does.'
			},
			{
				add: ['assess --> up["3. Upgrade: npm audit fix, or overrides in the root package.json"]'],
				highlight: ['up'],
				note: 'Run `npm audit fix` first. If the fix needs a dependency range to change all the way up to your project, the docs say it "will require the --force option". The other way is an `overrides` entry in the root `package.json`, which npm reads only there.'
			},
			{
				add: ['up --> verify["4. Verify: npm explain semver again, npm audit exits 0"]', 'verify --> ship["5. Ship, and note where untrusted input meets semver"]'],
				highlight: ['verify', 'ship'],
				note: 'Run `npm explain semver` again and check every copy against the patched version for its line. The docs: `npm audit` "will exit with a 0 exit code if no vulnerabilities were found". Then deploy, and record the code path from step 2 for the next advisory on this package.'
			}
		]
	},
	example: {
		title: 'classes/range.js at the fix commit: collapse whitespace before any regex runs',
		repo: 'npm/node-semver',
		url: `${RANGE}#L25-L49`,
		lang: 'javascript',
		code: `    this.options = options
    this.loose = !!options.loose
    this.includePrerelease = !!options.includePrerelease

    // First reduce all whitespace as much as possible so we do not have to rely
    // on potentially slow regexes like \\s*. This is then stored and used for
    // future error messages as well.
    this.raw = range
      .trim()
      .split(/\\s+/)
      .join(' ')

    // First, split on ||
    this.set = this.raw
      .split('||')
      // map the range to a 2d array of comparators
      .map(r => this.parseRange(r))
      // throw out any comparator lists that are empty
      // this generally means that it was not a valid range, which is allowed
      // in loose mode, but will still throw if the WHOLE range is invalid.
      .filter(c => c.length)

    if (!this.set.length) {
      throw new TypeError(\`Invalid SemVer Range: \${this.raw}\`)
    }`,
		notes: [
			'The advisory lists commit `717534e`, "fix: better handling of whitespace (#564)", as a reference. Lines 32 to 35 trim the input and collapse every run of spaces to one space before any range regex sees it.',
			'The same commit adds `safeRe` in [`internal/re.js`](' + RE + '#L12-L28). `createToken` rewrites each pattern, `\\s*` to `\\s{0,1}` and `\\s+` to `\\s`, and the classes import `safeRe` in place of `re`. The comment gives the reason: "Replace all greedy whitespace to prevent regex dos issues."',
			'The release dates on the npm registry: 7.5.2 on 15 June 2023, then 5.7.2 and 6.3.1 on 10 July 2023. For 19 days after the advisory, a project on 6.x had no fix inside its major version.',
			'[`satisfies`](' + SATISFIES + ') builds a `Range` from its second argument. Search your code for `satisfies(`, `validRange(` and `new Range(` to see which inputs reach this constructor.'
		]
	},
	tradeoff: {
		gain: [
			'Step 2 tells you how fast to move. A public endpoint that passes `?range=` to `satisfies` needs the fix today; a build script reading your own `package.json` can wait for the next routine upgrade.',
			'Upgrading inside the line (6.3.0 to 6.3.1) keeps the same major version, so the dependency that asked for `^6.0.0` gets a version it accepts.'
		],
		cost: [
			'An `overrides` entry outlives the advisory. If it forces `semver` to `^7.5.2`, a package that asked for `^5.0.0` now runs a major version it was never tested with.',
			'`npm audit` matches versions against ranges. It reports the build-tool copy with the same severity as the API copy, so step 2 stays manual.',
			'Backports arrive later than the main fix: 25 days between 7.5.2 and 6.3.1 here. Until then the choices are a major upgrade, an override, or a guard in your own code.'
		]
	},
	task: {
		prompt: 'Your `package-lock.json` has three copies: `node_modules/semver` at 7.5.1 (from your API), `node_modules/tool-a/node_modules/semver` at 6.3.0, and `node_modules/tool-b/node_modules/semver` at 5.7.1. Only the API calls `semver.satisfies(pkg.version, req.query.range)`. For each copy: vulnerable or not, the version to move to without changing its major, and how urgent it is.',
		hint: 'Compare each version with the three ranges in the advisory: `< 7.5.2`, `>= 6.0.0 < 6.3.1`, `< 5.7.2`. Then ask which copy receives `req.query.range`.',
		answer: [
			'7.5.1: vulnerable (`>= 7.0.0, < 7.5.2`). Move to 7.5.2 or later. Urgent: `req.query.range` is untrusted input and goes straight into `new Range` through `satisfies`.',
			'6.3.0: vulnerable (`>= 6.0.0, < 6.3.1`). Move to 6.3.1. Less urgent: `tool-a` gets its ranges from files you control. Run `npm explain semver` to see whether a newer `tool-a` already ships 6.3.1.',
			'5.7.1: vulnerable (`>= 2.0.0-alpha, < 5.7.2`). Move to 5.7.2, same reasoning as `tool-a`.',
			'Verify: `npm explain semver` lists 7.5.2, 6.3.1 and 5.7.2 or later, and `npm audit` exits 0. Patch the API copy first and deploy it on its own if the other two need more testing.'
		]
	},
	quiz: [
		{
			q: 'On 1 July 2023 a project depends on `semver@6.3.0` and cannot move to 7.x. Which release fixes CVE-2022-25883 on its line?',
			options: [
				'6.3.1, published the same day as 7.5.2',
				'None yet: 6.3.1 was published on 10 July 2023',
				'None: the 6.x line was declared end of life',
				'6.3.0 already has the fix, which was backported first'
			],
			answer: 1,
			why: 'The npm registry dates 7.5.2 to 15 June 2023 and 6.3.1 to 10 July 2023. The advisory lists 6.3.1 as the first patched version for 6.x, so on 1 July the 6.x line had no fixed release.'
		},
		{
			q: '`npm audit fix` reports that the remediation needs `--force`. What does that tell you?',
			options: [
				'The registry has no fixed version of the vulnerable package',
				'The vulnerable package is a dev dependency and is skipped',
				'The fix needs a dependency range changed all the way up to your project',
				'The lockfile is corrupt and must be deleted before the fix'
			],
			answer: 2,
			why: 'The npm docs: when the chain of meta-vulnerabilities reaches the root project and "cannot be updated without changing its dependency ranges", `npm audit fix` requires `--force`. That can mean a major version bump, so read the plan with `--dry-run` first.'
		},
		{
			q: 'Which code path is exposed to the semver ReDoS?',
			options: [
				'A CI script that calls `semver.satisfies` on versions from the lockfile',
				'A web endpoint that calls `semver.satisfies(v, req.query.range)`',
				'A build that runs `npm install` with a lockfile pinned to 7.5.1',
				'A script that calls `semver.valid` on the app\'s own version string'
			],
			answer: 1,
			why: 'The advisory requires "untrusted user data" as a range. `satisfies` passes its second argument to `new Range`, so the query string reaches the slow regexes. The other paths only parse strings that your own repository controls.'
		}
	],
	recall: {
		q: 'What are the five steps for an advisory, and which semver versions fix CVE-2022-25883?',
		a: 'Find every copy (`npm explain`), assess whether untrusted input reaches `new Range`, upgrade, verify (`npm audit` exits 0), ship. The fixes are 7.5.2, 6.3.1 and 5.7.2.'
	},
	sources: [
		{ title: 'GitHub Advisory GHSA-c2qf-rxjj-qqgw, semver ReDoS', url: 'https://github.com/advisories/GHSA-c2qf-rxjj-qqgw' },
		{ title: 'NVD, CVE-2022-25883', url: 'https://nvd.nist.gov/vuln/detail/CVE-2022-25883' },
		{ title: 'node-semver fix commit 717534e, better handling of whitespace', url: 'https://github.com/npm/node-semver/commit/717534ee353682f3bcf33e60a8af4292626d4441' },
		{ title: 'npm docs, npm audit', url: 'https://docs.npmjs.com/cli/v11/commands/npm-audit' },
		{ title: 'npm docs, npm explain', url: 'https://docs.npmjs.com/cli/v11/commands/npm-explain' },
		{ title: 'npm docs, package.json overrides', url: 'https://docs.npmjs.com/cli/v11/configuring-npm/package-json' },
		{ title: 'npm registry API, semver weekly downloads', url: 'https://api.npmjs.org/downloads/point/last-week/semver' },
		{ title: 'Node.js docs, Don\'t Block the Event Loop (REDOS)', url: 'https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop' }
	]
};
