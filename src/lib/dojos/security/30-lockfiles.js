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
