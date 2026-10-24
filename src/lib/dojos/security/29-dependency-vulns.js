const VULN = 'https://github.com/golang/vuln/blob/e672cbe8fbc8c76e28fcb6db0efd9ce354e0dac5';
const INSIGHTS = 'https://security.googleblog.com/2021/12/understanding-impact-of-apache-log4j.html';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'dependency-vulns',
	part: 'Secrets and supply chain',
	title: 'Vulnerable dependencies',
	minutes: 10,
	hook: [
		'On 10 December 2021, GitHub published GHSA-jfh8-c2jp-5v3q (CVE-2021-44228, Log4Shell) with a CVSS score of 10.0. Through Log4j\'s JNDI lookups, "An attacker who can control log messages or log message parameters can execute arbitrary code loaded from LDAP servers".',
		'On 16 December, Google\'s Open Source Insights team [counted](' + INSIGHTS + ') 35,863 Maven Central artifacts depending on affected log4j code, over 8% of the repository. Direct dependencies were about 7,000 of them: "The majority of affected artifacts come from indirect dependencies". A later note narrowed the count to over 17,000 packages for `log4j-core` alone.',
		'For most of those artifacts, log4j was "not explicitly defined as a dependency".'
	],
	terms: [
		{ term: 'Transitive dependency', def: 'A package you did not list yourself but that one of your dependencies (or theirs) pulls in. It appears in your lockfile, not in `package.json` or `go.mod` `require` lines you wrote.' },
		{ term: 'OSV record', def: 'A vulnerability in the Open Source Vulnerability JSON format: an `id`, `aliases` such as the CVE, and `affected` entries naming a package and the version ranges it is vulnerable in.' },
		{ term: 'Reachability', def: 'Whether your program can actually call the vulnerable function. govulncheck checks it on the call graph built from your source.' },
		{ term: 'Override', def: 'A root `package.json` entry that forces one version of a package everywhere in the tree, whatever version your dependencies ask for.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['app["your app: package.json lists bar"] --> bar["bar 1.3.0: depends on foo@^1.1.0"]', 'bar --> foo["foo 1.4.0: in the lockfile only"]'],
				highlight: ['app', 'bar', 'foo'],
				note: 'This tree extends the example in the npm docs. You chose `bar`. `bar` asks for `foo@^1.1.0`, and npm installed `foo` 1.4.0. Nothing in your `package.json` names `foo`, yet its code runs in your process.'
			},
			{
				add: ['foo --> osv["OSV record: foo, events introduced 1.0.2, fixed 2.0.0"]'],
				highlight: ['osv'],
				note: 'A scanner sends the full list from your lockfile to a database and matches each version against ranges. In OSV, a range is a list of `events`: version 1.4.0 is affected because it is at or above `introduced` (1.0.2) and below `fixed` (2.0.0). `npm audit` needs a `package-lock.json` for this step by default.'
			},
			{
				add: ['osv -->|"bar can only install a vulnerable foo"| meta["npm audit: bar is a meta-vulnerability"]', 'meta -->|"fix needs a range change at the root"| force["npm audit fix --force: SemVer-major update"]'],
				highlight: ['meta', 'force'],
				note: 'Because `^1.1.0` never allows `foo` 2.0.0, npm also flags `bar`: "a dependency that is vulnerable by virtue of dependence on vulnerable versions of a vulnerable package". When the fix needs a new range in your own `package.json`, `npm audit fix` requires `--force`, which may install a SemVer-major update.'
			},
			{
				add: ['scan["govulncheck ./..."] --> mod["module level: a vulnerable version is required"]', 'mod --> pkg["package level: you import the vulnerable package"]', 'pkg --> sym["symbol level: main calls the vulnerable function"]'],
				highlight: ['scan', 'sym'],
				note: 'govulncheck goes one step further for Go code. It reports at three levels, and only the last one says your code reaches the bug. A finding reads like "main.go:[line]:[column]: mypackage.main calls golang.org/x/text/language.Parse". A module you require but never import stays at the first level, and a package you import but never call stays at the second.'
			},
			{
				add: ['sym --> fix["Upgrade bar to a version needing foo 2.x, or override foo in the root package.json"]', 'fix -->|"re-run the scan, run the tests"| done["Lockfile shows foo 2.0.0"]'],
				highlight: ['fix', 'done'],
				note: 'Two ways out. Upgrade `bar` to a release whose range allows `foo` 2.0.0. Or, while `bar` has no such release, add `"overrides": { "foo": "2.0.0" }` in your root `package.json`. `bar`\'s maintainers never tested it with `foo` 2.0.0, so your own tests have to.'
			}
		]
	},
	example: {
		title: 'internal/vulncheck/source.go: from modules to packages to called functions',
		repo: 'golang/vuln',
		url: `${VULN}/internal/vulncheck/source.go#L68-L110`,
		lang: 'go',
		code: `	mv, err := FetchVulnerabilities(ctx, client, graph.Modules())
	if err != nil {
		return nil, err
	}

	// Emit OSV entries immediately in their raw unfiltered form.
	if err := emitOSVs(handler, mv); err != nil {
		return nil, err
	}

	if err := handler.Progress(&govulncheck.Progress{Message: checkingSrcVulnsMessage}); err != nil {
		return nil, err
	}

	affVulns := affectingVulnerabilities(mv, "", "")
	if err := emitModuleFindings(handler, affVulns); err != nil {
		return nil, err
	}

	if !cfg.ScanLevel.WantPackages() || len(affVulns) == 0 {
		return &Result{}, nil
	}

	impVulns := importedVulnPackages(affVulns, graph)
	// Emit information on imported vulnerable packages now as
	// call graph computation might take a while.
	if err := emitPackageFindings(handler, impVulns); err != nil {
		return nil, err
	}

	// Return result immediately if not in symbol mode or
	// if there are no vulnerabilities imported.
	if !cfg.ScanLevel.WantSymbols() || len(impVulns) == 0 {
		return &Result{Vulns: impVulns}, nil
	}

	wg.Wait() // wait for build to finish
	if buildErr != nil {
		return nil, err
	}

	entryFuncs, callVulns := calledVulnSymbols(entries, affVulns, cg, graph)
	return &Result{EntryFunctions: entryFuncs, Vulns: callVulns}, nil`,
		notes: [
			'`FetchVulnerabilities(ctx, client, graph.Modules())` sends only module paths to `vuln.go.dev`. The command docs: requests "contain only module paths with vulnerabilities already known to the database, not code or other properties of your program".',
			'`affectingVulnerabilities` drops withdrawn records and keeps those whose ranges include the module version you require. `emitModuleFindings` reports them. `npm audit` stops at this level: a matching version in the tree.',
			'`importedVulnPackages` walks `pkg.Imports` from your top packages and keeps records whose vulnerable package you actually import. A module can contain the bug in a package you never load.',
			'`calledVulnSymbols` intersects the call graph backwards from the vulnerable functions with the graph forwards from your entry points. What is left is the call stack govulncheck prints. The docs warn that calls through `reflect` "are not visible to static analysis", so a miss there is a false negative.'
		]
	},
	tradeoff: {
		gain: [
			'A scanner fed by the lockfile finds `foo` 1.4.0 even though no file you wrote mentions it, which is how Log4Shell sat in most affected artifacts.',
			'The OSV format gives every ecosystem the same `introduced` and `fixed` events, so the same query to `api.osv.dev` works for npm, PyPI, Maven and Go packages.',
			'Symbol-level results from govulncheck let you patch first the services whose code calls the vulnerable function.'
		],
		cost: [
			'A version match says nothing about use: `npm audit` reports `foo` even if your code never reaches the vulnerable function.',
			'A record is fixed for one id only. log4j-core 2.15.0 is outside the CVE-2021-44228 range and still matches CVE-2021-45046.',
			'`npm audit fix --force` can install a new major version of a top-level package, with breaking changes your tests must catch.',
			'An override pins `foo` under `bar` without `bar`\'s maintainers having tested that pair.'
		]
	},
	task: {
		prompt: 'The OSV record GHSA-jfh8-c2jp-5v3q lists three ranges for `org.apache.logging.log4j:log4j-core`: introduced `2.13.0` fixed `2.15.0`, introduced `2.0-beta9` fixed `2.3.1`, introduced `2.4` fixed `2.12.2`. Four services ship `log4j-core` 2.14.1, 2.12.2, 2.3 and 2.15.0. Which ones does this record affect? Then say what you would check before calling the others safe. 10 minutes, on paper or with `curl`.',
		hint: 'A version is affected when it is at or above `introduced` and below `fixed` in one range. To check all records, `curl -d \'{"package":{"name":"org.apache.logging.log4j:log4j-core","ecosystem":"Maven"},"version":"2.15.0"}\' https://api.osv.dev/v1/query`.',
		answer: [
			'2.14.1: affected, inside `[2.13.0, 2.15.0)`. 2.3: affected, inside `[2.0-beta9, 2.3.1)`. 2.12.2: not affected, because `fixed` is exclusive and 2.12.2 is the fix of the third range. 2.15.0: not affected by this record.',
			'Querying OSV on 17 October 2026 for 2.15.0 returns GHSA-7rjr-3q55-vv33 (CVE-2021-45046). The GitHub advisory explains why: "Log4j version 2.15.0 contained an earlier fix for the vulnerability, but that patch did not disable attacker-controlled JNDI lookups in all situations."',
			'The same query for 2.12.2 still returns CVE-2021-44832 and CVE-2021-45105, among others. A version outside one record is not a version with no records.',
			'So: query every version you ship against every record, pick a target version, query it too (2.17.1 still lists CVE-2025-68161 among three), and confirm with the dependency tree that no other copy of `log4j-core` stays behind.'
		],
		steps: [
			{
				title: 'Read the ranges',
				questions: [
					{ q: 'GHSA-jfh8-c2jp-5v3q is the GitHub id of this record. Which CVE do its three ranges describe?', options: ['CVE-2021-45046', 'CVE-2021-44228, Log4Shell', 'CVE-2021-44832', 'CVE-2025-68161'], answer: 1, why: 'These are the CVE-2021-44228 ranges, with 2.15.0 as the first `fixed`. Each of the other CVEs has its own record and its own ranges.' },
					{ q: 'A fifth service ships 2.3.2. Does this record affect it?', options: ['Yes, inside `[2.0-beta9, 2.3.1)`', 'Yes, inside `[2.4, 2.12.2)`', 'No: it falls between the second range and the third', 'Yes: it lies between `2.0-beta9` and `2.12.2`'], answer: 2, why: '2.3.2 is at or above the `fixed` 2.3.1 and below the `introduced` 2.4, so no range covers it. The ranges are separate, not one span from the lowest `introduced` to the highest `fixed`.' },
					{ q: 'How many ranges does this record list for `log4j-core`?', options: ['Three', 'One', 'Two', 'Four'], answer: 0, why: '`[2.13.0, 2.15.0)`, `[2.0-beta9, 2.3.1)` and `[2.4, 2.12.2)`.' },
					{ q: 'A version must fall in how many of them to be affected?', options: ['All three', 'At least two', 'Exactly the last one', 'At least one'], answer: 3, why: 'Each range is a separate stretch of vulnerable versions. One match is enough.' }
				]
			},
			{
				title: 'Place each version',
				questions: [
					{ q: 'Is 2.14.1 affected by this record?', options: ['Yes, inside `[2.13.0, 2.15.0)`', 'No, it is above 2.13.0', 'No, it is below 2.15.0', 'Yes, inside `[2.4, 2.12.2)`'], answer: 0, why: '2.14.1 is at or above 2.13.0 and below 2.15.0.' },
					{ q: 'Is 2.12.2 affected by this record?', options: ['Yes, inside `[2.4, 2.12.2)`', 'Yes, inside `[2.13.0, 2.15.0)`', 'No: 2.12.2 is the `fixed` of the third range', 'No: it is below `2.0-beta9`'], answer: 2, why: '`fixed` is exclusive, and 2.12.2 is the fix of that range.' },
					{ q: 'Is 2.3 affected by this record?', options: ['No, it is too old', 'Yes, inside `[2.0-beta9, 2.3.1)`', 'No, it equals a `fixed` value', 'Yes, inside `[2.4, 2.12.2)`'], answer: 1, why: '2.3 is at or above `2.0-beta9` and below 2.3.1.' },
					{ q: 'Is 2.15.0 affected by this record?', options: ['Yes, it is the `fixed` version', 'Yes, inside `[2.4, 2.12.2)`', 'Yes, inside `[2.13.0, 2.15.0)`', 'No'], answer: 3, why: '2.15.0 is the `fixed` of the first range and falls in no other.' }
				]
			},
			{
				title: 'Query the others',
				questions: [
					{ q: 'So 2.12.2 and 2.15.0 are safe?', options: ['Not yet: they are only outside this one record', 'Yes, the record says so', 'Yes, once the CVE is closed', 'Only 2.15.0 is'], answer: 0, why: 'A version outside one record is not a version with no records.' },
					{ q: 'What does OSV return for 2.15.0, queried on 17 October 2026?', options: ['Nothing', 'GHSA-7rjr-3q55-vv33 (CVE-2021-45046)', 'Only CVE-2021-44228', 'A withdrawn record'], answer: 1, why: 'The 2.15.0 patch "did not disable attacker-controlled JNDI lookups in all situations."' },
					{ q: 'And for 2.12.2?', options: ['Nothing, it is a fix release', 'Only CVE-2021-45046', 'CVE-2021-44832 and CVE-2021-45105, among others', 'Only GHSA-jfh8-c2jp-5v3q'], answer: 2, why: 'Being the fix for one range does not clear the version of other records.' },
					{ q: 'Which call lists every record for one version?', options: ['`npm audit`', 'The `GHSA-jfh8-c2jp-5v3q` page', '`mvn dependency:tree`', '`curl -d \'{"package": ..., "version": "2.15.0"}\' https://api.osv.dev/v1/query`'], answer: 3, why: 'The OSV query takes a package and a version and returns every record that matches.' }
				]
			},
			{
				title: 'Say what you check',
				questions: [
					{ q: 'What do you query, for each service?', options: ['Every version you ship, against every record', 'Only the newest version', 'Only the record in the news', 'Only direct dependencies'], answer: 0, why: 'Each version can match records the others do not.' },
					{ q: 'You pick 2.17.1 as the target. What next?', options: ['Ship it, it is newer', 'Query it too, since it still lists CVE-2025-68161', 'Skip tests, it is a patch release', 'Wait for the next CVE'], answer: 1, why: 'A target version can carry its own records. Query it like the others.' },
					{ q: 'Why look at the dependency tree after upgrading?', options: ['To count lines of code', 'To find the license', 'To confirm no other copy of `log4j-core` stays behind', 'To check the build time'], answer: 2, why: 'Most affected artifacts got log4j through indirect dependencies, so a second copy can hide deeper in the tree.' },
					{ q: 'Where does a scanner find a transitive copy?', options: ['In `package.json` or the `require` lines you wrote', 'In the README of each dependency', 'In the CVE text', 'In the lockfile'], answer: 3, why: 'A transitive dependency appears in the lockfile, not in the files you wrote.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'An OSV range has `{"introduced": "2.13.0"}, {"fixed": "2.15.0"}`. Which version does it mark as affected?',
			options: [
				'2.15.0, because the `fixed` event names the last vulnerable version',
				'2.12.0, because every version below `introduced` is affected too',
				'2.14.1, because it is at or above 2.13.0 and below 2.15.0',
				'2.16.0, because no `limit` event closes the range'
			],
			answer: 2,
			why: 'In the OSV evaluation, `IsVulnerable` sets `vulnerable = true` at `introduced` and back to `false` at `fixed`. The range is `[2.13.0, 2.15.0)`. `last_affected` is the event that names an included last version.'
		},
		{
			q: 'govulncheck lists a vulnerability for a module you require, but shows no call stack for it. What does that tell you?',
			options: [
				'Your code does not call the vulnerable function, as far as static analysis can see',
				'The vulnerability is in a test file, which govulncheck never reads',
				'The database has no fixed version yet, so it hides the call stack',
				'govulncheck failed to build the call graph and skipped the module'
			],
			answer: 0,
			why: 'govulncheck reports at the module, package and symbol levels. A call stack comes only from the symbol level, when a path exists from your entry points to the vulnerable function. Calls through `reflect` are not visible, so treat it as likely safe, not proven safe.'
		},
		{
			q: '`npm audit fix` says a fix needs `--force`. What will `--force` do that the plain command will not?',
			options: [
				'Delete `package-lock.json` and resolve the whole tree again from scratch',
				'Install a SemVer-major update of a top-level dependency if the fix needs one',
				'Patch the vulnerable file inside `node_modules` without changing any version',
				'Mark the advisory as accepted so `npm audit` exits with code 0'
			],
			answer: 1,
			why: 'Plain `npm audit fix` updates within the ranges you declared. When the chain of meta-vulnerabilities reaches your root and needs a new range, only `--force` changes it, which can mean a new major version.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Build the chapter’s `bar` and `foo` tree with a real package, let `npm audit` find the transitive copy, then fix it with an override.',
		steps: [
			'Make a local `bar` that pins an old lodash: `mkdir -p ~/audit-lab/bar && cd ~/audit-lab && printf \'%s\\n\' \'{"name": "bar", "version": "1.3.0", "dependencies": {"lodash": "4.17.20"}}\' > bar/package.json && npm pack ./bar`.',
			'Install it in an app: `npm init -y && npm install ./bar-1.3.0.tgz`, then `npm ls lodash` and `grep lodash package.json`.',
			'Scan: `npm audit`. Note the version range it reports for lodash, and why it says `No fix available`.',
			'Ask OSV directly: `curl -s -d \'{"package":{"name":"lodash","ecosystem":"npm"},"version":"4.17.20"}\' https://api.osv.dev/v1/query`.',
			'Override lodash in the root with its latest release: `npm pkg set overrides.lodash=$(npm view lodash version) && npm install`, then `npm ls lodash` and `npm audit` again.'
		],
		done: [
			'`npm ls lodash` shows `bar@1.3.0` with `lodash@4.17.20` under it, and `grep lodash package.json` finds nothing.',
			'`npm audit` lists `lodash` and also `bar`, with "Depends on vulnerable versions of lodash".',
			'The OSV query returns a `vulns` list with GHSA ids.',
			'After the override, `npm ls lodash` shows `overridden` and `npm audit` prints `found 0 vulnerabilities`.'
		],
		solution: [
			'`bar` is the meta-vulnerability: it pins `4.17.20` exactly, so no release of `bar` and no `npm audit fix` can move lodash. That is why `npm audit` says `No fix available`.',
			'With npm 11.9 in October 2026, `npm audit` reported `lodash <=4.17.23`, and `npm view lodash version` gave `4.18.1`, so the override was `npm pkg set overrides.lodash=4.18.1`.',
			'`bar`’s maintainers never tested that pair. Run your own tests after an override.'
		]
	},
	recall: {
		q: 'How does an OSV record say which versions of a package are affected?',
		a: 'With `affected[].ranges[].events`: a version is affected from `introduced` up to, not including, `fixed`. For CVE-2021-44228, log4j-core has introduced 2.13.0 and fixed 2.15.0, among other ranges.'
	},
	sources: [
		{ title: 'GHSA-jfh8-c2jp-5v3q, Remote code injection in Log4j (CVE-2021-44228)', url: 'https://github.com/advisories/GHSA-jfh8-c2jp-5v3q' },
		{ title: 'Google Security Blog, Understanding the Impact of Apache Log4j Vulnerability', url: 'https://security.googleblog.com/2021/12/understanding-impact-of-apache-log4j.html' },
		{ title: 'OSV schema', url: 'https://ossf.github.io/osv-schema/' },
		{ title: 'OSV API, Query affected', url: 'https://google.github.io/osv.dev/post-v1-query/' },
		{ title: 'govulncheck command docs', url: 'https://pkg.go.dev/golang.org/x/vuln/cmd/govulncheck' },
		{ title: 'npm docs, npm-audit', url: 'https://docs.npmjs.com/cli/commands/npm-audit' },
		{ title: 'npm docs, package.json overrides', url: 'https://docs.npmjs.com/cli/configuring-npm/package-json#overrides' }
	]
};
