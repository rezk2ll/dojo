const NPM = 'https://github.com/npm/cli/blob/ae98c62586b6fea44114f72e249e246a2981de70';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'lockfiles',
	part: 'Secrets and supply chain',
	title: 'Pinning what you install',
	minutes: 10,
	hook: [
		'On 9 February 2021, Alex Birsan published "Dependency Confusion". He had found names of internal packages used at PayPal, Apple, Yelp, Tesla and others, often inside `package.json` files bundled into public JavaScript. He uploaded packages with those names to npm, PyPI and RubyGems. Each one reported back over DNS the username, hostname and current path of the machine that installed it.',
		'He detected the problem "inside more than 35 organizations", all of which had a bug bounty or a private agreement allowing the test. Shopify\'s build system installed a gem named `shopify-cloud` "only a few hours" after the upload and ran its code. Shopify, Apple and PayPal each paid $30,000.',
		'For Python he named the main cause: `pip install --extra-index-url`. The pip install docs: "There is no priority in the locations that are searched."'
	],
	terms: [
		{ term: 'Lockfile', def: 'A file that records the exact tree an install produced: every package, its version, where it came from and a hash. npm writes `package-lock.json`, which is "intended to be committed into source repositories".' },
		{ term: 'Integrity', def: 'The `integrity` field of a lockfile entry: a `sha512` or `sha1` Subresource Integrity string of the tarball that was unpacked.' },
		{ term: 'Typosquatting', def: 'Publishing a package under a name close to a popular one, such as `crossenv` for `cross-env`, so that a typo installs it.' },
		{ term: 'Dependency confusion', def: 'Publishing a public package under the name of a company\'s internal package, with a higher version, so that a build that checks both registries installs the public one.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['leak["Public bundle.js contains an internal package.json"] --> name["Name found: acme-billing, internal 1.4.2"]'],
				highlight: ['leak', 'name'],
				note: 'Birsan wrote that the best place to find private names "turned out to be… inside javascript files": build steps embed internal `package.json` files in public scripts. A name alone is not a secret, so do not count on hiding it.'
			},
			{
				add: ['name --> pub["Attacker publishes acme-billing 9000.0.0 on the public index"]', 'pub --> build["CI: pip install --extra-index-url internal acme-billing"]'],
				highlight: ['pub', 'build'],
				note: 'The build asks for `acme-billing` with no exact version. With `--extra-index-url`, pip looks in PyPI and in the internal index together. The `9000.0.0` version is chosen by the attacker so that it wins any version comparison.'
			},
			{
				add: ['build -->|"both indexes have the name, highest version wins"| run["9000.0.0 is installed and its install code runs on the CI runner"]'],
				highlight: ['run'],
				note: 'pip checks every location and picks the "best" match by version number. Birsan\'s packages ran during installation: on npm through a `preinstall` script, which runs before your own code is ever imported.'
			},
			{
				add: ['run -.->|"defence 1: one source per name"| src["pip --index-url internal only, npm @acme:registry"]'],
				highlight: ['src'],
				note: 'Give each name a single source. For pip, `--index-url` replaces PyPI instead of adding to it. For npm, put internal packages under a scope: once `@acme:registry` is set, "any `npm install` for a package with that scope will request packages from that registry instead".'
			},
			{
				add: ['src -.->|"defence 2: exact versions and hashes"| lock["requirements.txt with == and --hash, or package-lock.json with npm ci"]'],
				highlight: ['lock'],
				note: 'Record the exact version and hash of every package, including transitive ones, and install only that. A `9000.0.0` appearing on a registry changes nothing for a build that asks for `==1.4.2` with a `sha256` of the file you reviewed.'
			}
		]
	},
	example: {
		title: 'lib/commands/ci.js: npm ci refuses a lockfile that disagrees with package.json',
		repo: 'npm/cli',
		url: `${NPM}/lib/commands/ci.js#L74-L114`,
		lang: 'js',
		code: `    // generate an inventory from the virtual tree in the lockfile
    const virtualArb = new Arborist(opts)
    try {
      await virtualArb.loadVirtual()
    } catch (err) {
      log.verbose('loadVirtual', err.stack)
      const msg =
        'The \`npm ci\` command can only install with an existing\\n' +
        'package-lock.json with lockfileVersion >= 1. Run an install with npm@5\\n' +
        'or later to generate a package-lock.json file, then try again.'
      throw this.usageError(msg)
    }
    const virtualInventory = new Map(virtualArb.virtualTree.inventory)

    // Now we make our real Arborist.
    // We need a new one because the virtual tree from the lockfile can have extraneous dependencies in it that won't install on this platform
    const arb = new Arborist(opts)
    await arb.buildIdealTree()
    await strictAllowScriptsPreflight({ arb, npm: this.npm, idealTreeOpts: opts })

    // Verifies that the packages from the ideal tree will match the same versions that are present in the virtual tree (lock file).
    const errors = validateLockfile(virtualInventory, arb.idealTree.inventory)
    // Verifies that the root packageExtensions state matches the lockfile and is still consistent with the locked tree.
    errors.push(...validatePackageExtensions(virtualArb.virtualTree, arb.idealTree))
    // Verifies that the root .npm-extension file matches the lockfile hash.
    // The hash comes from discovering the file (no import or execution), so this holds even under ignore-extension/ignore-scripts.
    const { NpmExtension } = require('@npmcli/arborist')
    let fileHash = null
    try {
      fileHash = new NpmExtension({ root: where, extensionFile: opts.extensionFile }).hash
    } catch (err) {
      errors.push(\`Invalid: \${err.message}\`)
    }
    errors.push(...validateNpmExtension(virtualArb.virtualTree, fileHash))
    if (errors.length) {
      throw this.usageError(
        '\`npm ci\` can only install packages when your package.json and package-lock.json are in sync. ' +
        'Please update your lock file with \`npm install\` before continuing.\\n\\n' +
        errors.join('\\n')
      )
    }`,
		notes: [
			'`loadVirtual()` reads only `package-lock.json`. With no lockfile, `npm ci` stops with a usage error. Earlier in the same function, `opts` sets `packageLock: true` and `save: false`: `npm ci` never writes `package.json` or the lockfile.',
			'`buildIdealTree()` computes the tree that `package.json` asks for. `validateLockfile` then compares both inventories entry by entry and records `Missing: ... from lock file` or `Invalid: lock file\'s ...` for each mismatch.',
			'Any error stops the install before `node_modules` is touched: the deletion of `node_modules` comes after this block. `npm install` in the same situation would update the lockfile instead.',
			'Each locked entry carries an `integrity` hash. pacote, the package fetcher npm uses, hands it to `cacache` and `ssri`, which raise `EINTEGRITY` when the downloaded tarball does not match.'
		]
	},
	tradeoff: {
		gain: [
			'CI installs the tree you reviewed: same versions, same tarballs, whatever was published to the registry since.',
			'A new `9000.0.0` on a public index cannot enter a build that requires `==1.4.2` with a hash.',
			'Changes to dependencies show up as a lockfile diff in a pull request, where a reviewer can see a new package or a changed `resolved` URL.'
		],
		cost: [
			'Pinned versions stay vulnerable until someone updates them: a lockfile freezes old bugs as well as good code, so it needs the scanning from the previous chapter.',
			'pip hash-checking is "all-or-nothing": one `--hash` turns it on, and then every requirement, including each transitive one, must be pinned with `==` and hashed.',
			'A package with wheels for several platforms needs one hash per file you might install, so the requirements file has several `--hash` lines per package.',
			'A lockfile pins whatever was installed when it was written. If someone typed `crossenv` instead of `cross-env`, the lock records the typo with a valid hash.'
		]
	},
	task: {
		prompt: 'Your CI runs `pip install --extra-index-url https://pypi.internal.example/simple acme-billing`. The internal index has `acme-billing` 1.4.2. Someone publishes `acme-billing` 9000.0.0 on PyPI. Which version does the next build install, and why? Then write the two changes that stop it, and say which of them also stops an attacker who publishes 1.4.2 on PyPI. 10 minutes, on paper.',
		hint: 'The pip install docs: "There is no priority in the locations that are searched. Rather they are all checked, and the \'best\' match for the requirements (in terms of version number...) is selected."',
		answer: [
			'The build installs 9000.0.0. pip searches PyPI and the extra index with no priority and picks the highest version that satisfies `acme-billing`, which has no version constraint.',
			'Change 1: replace `--extra-index-url` with `--index-url https://pypi.internal.example/simple`, so pip asks only the internal index. Change 2: put `acme-billing==1.4.2 --hash=sha256:...` in `requirements.txt` with every dependency pinned and hashed, and install with `--require-hashes`.',
			'Against a fake 1.4.2, the `==` pin alone is not enough, since both indexes now have a 1.4.2. The hash is what stops it: the PyPI file has a different `sha256`, so pip refuses it. Change 1 stops it too, because PyPI is no longer searched.',
			'Use both. The hash also catches a tampered file on the internal index, and the single index also covers a new package you forgot to hash.'
		],
		steps: [
			{
				title: 'Predict the install',
				questions: [
					{ q: 'Which version does the next build install?', options: ['1.4.2, from the internal index', '9000.0.0, from PyPI', 'Neither: pip stops on the name clash', 'Whichever index answers first'], answer: 1, why: 'pip looks in both places and picks the highest version that fits.' },
					{ q: 'Does pip prefer the index given in `--extra-index-url`?', options: ['Yes, extra indexes are always searched first', 'Only for names that PyPI does not have', 'Only when PyPI is down or slow', 'No: "There is no priority" between them'], answer: 3, why: 'Every location is checked, and the "best" match by version number is selected.' },
					{ q: 'What lets 9000.0.0 win here?', options: ['The requirement `acme-billing` has no version constraint', 'PyPI has a higher priority', 'The internal index is slower', 'pip caches PyPI results'], answer: 0, why: 'With no `==`, any version satisfies the requirement, so the highest one wins.' },
					{ q: 'In Birsan’s tests, when did the uploaded packages run their code?', options: ['Only when an app imported them', 'Never: the registries only stored them', 'During installation, on the machine that installed them', 'Only on production servers'], answer: 2, why: 'Birsan’s packages ran during installation (on npm through a `preinstall` script), before anyone’s own code was imported.' }
				]
			},
			{
				title: 'Give the name one source',
				questions: [
					{ q: 'Which flag makes pip ask only the internal index?', options: ['`--extra-index-url` twice', '`--index-url https://pypi.internal.example/simple`', '`--no-deps`', '`--pre`'], answer: 1, why: '`--index-url` replaces PyPI instead of adding to it.' },
					{ q: 'With only the internal index, what does the build install?', options: ['1.4.2', '9000.0.0', 'Nothing, the name is blocked', 'Both versions'], answer: 0, why: 'PyPI is no longer searched, so the public 9000.0.0 is never seen.' },
					{ q: 'What is the npm version of the same fix?', options: ['`npm audit` in CI to flag unknown names', '`--ignore-scripts` on every install', 'A higher internal version like 9999.0.0', 'Scoped names with `@acme:registry` set'], answer: 3, why: 'Once the scope has a registry, "any `npm install` for a package with that scope will request packages from that registry instead".' },
					{ q: 'Why not just keep the internal names secret?', options: ['Names are case insensitive', 'They leak, for example inside public JavaScript bundles', 'PyPI publishes every private name', 'pip logs them publicly'], answer: 1, why: 'Birsan found many names inside public JavaScript files. A name alone is not a secret.' }
				]
			},
			{
				title: 'Pin and hash',
				questions: [
					{ q: 'What goes in `requirements.txt`?', options: ['`acme-billing>=1.4.2`', '`acme-billing==1.4.2 --hash=sha256:...`', '`acme-billing`', '`acme-billing~=1.4`'], answer: 1, why: 'The exact version and the hash of the file you reviewed.' },
					{ q: 'Do you need hashes for the transitive dependencies too?', options: ['No, only for the top package', 'Only for packages from PyPI', 'Yes: one `--hash` turns the mode on for every requirement', 'Only when `--require-hashes` is passed'], answer: 2, why: 'pip hash-checking is "all-or-nothing": every requirement, including each transitive one, must be pinned and hashed.' },
					{ q: 'Which install flag goes with it?', options: ['`--require-hashes`', '`--force-reinstall`', '`--user`', '`--upgrade`'], answer: 0, why: '`--require-hashes` makes pip refuse any package without a matching hash.' },
					{ q: 'What does the `==1.4.2` pin alone do against 9000.0.0?', options: ['Nothing, the higher version still wins', 'It blocks it: 9000.0.0 does not satisfy `==1.4.2`', 'It installs both', 'It makes pip ask PyPI first'], answer: 1, why: 'A `9000.0.0` changes nothing for a build that asks for `==1.4.2`.' }
				]
			},
			{
				title: 'Test against a fake 1.4.2',
				questions: [
					{ q: 'The attacker now publishes `acme-billing` 1.4.2 on PyPI. Does the `==` pin alone stop it?', options: ['Yes, the version is the same', 'Yes, pip prefers internal files', 'Only on Linux', 'No: both indexes now have a 1.4.2'], answer: 3, why: 'The pin names a version, and both files claim that version.' },
					{ q: 'Which part of change 2 stops the fake?', options: ['The hash: the PyPI file has a different `sha256`', 'The version pin', 'The file name', 'The order of lines'], answer: 0, why: 'pip compares the file’s hash with the one you recorded and refuses a mismatch.' },
					{ q: 'Does change 1 stop the fake too?', options: ['No, the version matches', 'Only with `--require-hashes`', 'Yes, because PyPI is no longer searched', 'Only for wheels'], answer: 2, why: 'With a single internal index, the PyPI file is never a candidate.' },
					{ q: 'Why use both changes?', options: ['pip refuses `--require-hashes` with a single index', 'Each covers a gap: a tampered internal file, an unhashed package', 'Together they make installs faster on CI', 'The hash only works when PyPI is also searched'], answer: 1, why: 'Each closes a gap the other leaves open.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'A `requirements.txt` has a `--hash` on one line out of ten. What does pip do?',
			options: [
				'It checks that one hash and installs the nine other packages as usual',
				'It turns on hash-checking for everything and fails on the nine unhashed lines',
				'It ignores the hash unless the command line also passes `--require-hashes`',
				'It downloads the nine others from PyPI and writes their hashes into the file'
			],
			answer: 1,
			why: 'The pip docs: "Specifying `--hash` against any requirement will activate this mode globally", and then "Hashes are required for all requirements" and for all dependencies. pip 26.2 adds `--no-require-hashes` to opt out.'
		},
		{
			q: 'CI runs `npm ci` and `package.json` asks for a version that `package-lock.json` does not have. What happens?',
			options: [
				'npm installs the version from `package.json` and rewrites `package-lock.json`',
				'npm installs the locked version and prints a warning about the mismatch',
				'npm exits with an error and asks you to update the lockfile with `npm install`',
				'npm deletes `node_modules` first, then resolves the tree again from the registry'
			],
			answer: 2,
			why: '`validateLockfile` collects each mismatch, and `npm ci` throws "can only install packages when your package.json and package-lock.json are in sync" before it removes `node_modules`. It never writes either file.'
		},
		{
			q: 'Your internal npm packages have plain names like `billing-client`. Which change stops a public `billing-client` from being installed in their place?',
			options: [
				'Run `npm audit` in CI so that unknown packages show up as warnings',
				'Raise the internal version to 9999.0.0 so it always wins comparisons',
				'Rename them to `@acme/billing-client` and set `@acme:registry` to the internal registry',
				'Add `--ignore-scripts` so that public packages cannot run install code'
			],
			answer: 2,
			why: 'A scope points to one registry: "any `npm install` for a package with that scope will request packages from that registry instead". `--ignore-scripts` blocks the install hook, but the code still loads when your app imports it.'
		}
	],
	lab: {
		minutes: 25,
		goal: 'Run the dependency confusion from the task between two package indexes on localhost, then stop it with one index and with a hash.',
		steps: [
			'Set up: `mkdir ~/confusion-lab && cd ~/confusion-lab && python3 -m venv .venv`.',
			'Build the internal 1.4.2: `mkdir -p src-internal/acme_billing && echo "print(\'acme-billing 1.4.2 from internal\')" > src-internal/acme_billing/__init__.py && printf \'%s\\n\' \'[project]\' \'name = "acme-billing"\' \'version = "1.4.2"\' > src-internal/pyproject.toml && .venv/bin/pip wheel --no-deps -w internal/simple/acme-billing ./src-internal`.',
			'Build the attacker’s 9000.0.0 the same way, with `src-public`, the message `acme-billing 9000.0.0 from public`, `version = "9000.0.0"` and `-w public/simple/acme-billing`.',
			'Serve both indexes, each in its own terminal: `python3 -m http.server 8001 -d internal` and `python3 -m http.server 8002 -d public`.',
			'Install the way the CI does: `.venv/bin/pip install --no-cache-dir --index-url http://localhost:8001/simple --extra-index-url http://localhost:8002/simple acme-billing && .venv/bin/python -c \'import acme_billing\'`.',
			'Change 1: `.venv/bin/pip uninstall -y acme-billing`, then install again with only `--index-url http://localhost:8001/simple`.',
			'Change 2: `echo "acme-billing==1.4.2 $(.venv/bin/pip hash internal/simple/acme-billing/*.whl | tail -1)" > requirements.txt`. Build a fake 1.4.2 into `public/simple/acme-billing` from a `src-fake` folder, uninstall, and run `.venv/bin/pip install --no-cache-dir --index-url http://localhost:8002/simple -r requirements.txt`.'
		],
		done: [
			'Step 5 prints `acme-billing 9000.0.0 from public`.',
			'Step 6 prints `acme-billing 1.4.2 from internal`.',
			'Step 7 fails with `THESE PACKAGES DO NOT MATCH THE HASHES FROM THE REQUIREMENTS FILE`, with an `Expected sha256` and a different `Got`.'
		],
		solution: [
			'pip checks both indexes with no priority and takes the highest version, so the public 9000.0.0 wins and its code runs as soon as it is imported.',
			'With `--index-url` alone, the public index is never asked.',
			'The fake has the right name and version but not the right bytes, so the recorded `sha256` refuses it. The same `requirements.txt` against port 8001 installs the internal 1.4.2.'
		]
	},
	recall: {
		q: 'Why does `pip install --extra-index-url` allow dependency confusion?',
		a: 'pip searches the main index and the extra one with no priority and installs the best match by version number. A public package with the internal name and a higher version wins.'
	},
	sources: [
		{ title: 'Alex Birsan, Dependency Confusion (9 February 2021)', url: 'https://medium.com/@alex.birsan/dependency-confusion-4a5d60fec610' },
		{ title: 'pip docs, Secure installs', url: 'https://pip.pypa.io/en/stable/topics/secure-installs/' },
		{ title: 'pip docs, pip install', url: 'https://pip.pypa.io/en/stable/cli/pip_install/' },
		{ title: 'npm docs, npm-ci', url: 'https://docs.npmjs.com/cli/v12/commands/npm-ci/' },
		{ title: 'npm docs, package-lock.json', url: 'https://docs.npmjs.com/cli/v12/configuring-npm/package-lock-json/' },
		{ title: 'npm docs, scope', url: 'https://docs.npmjs.com/cli/v12/using-npm/scope/' },
		{ title: 'npm Blog, crossenv malware on the npm registry (2 August 2017)', url: 'https://blog.npmjs.org/post/163723642530/crossenv-malware-on-the-npm-registry' }
	]
};
