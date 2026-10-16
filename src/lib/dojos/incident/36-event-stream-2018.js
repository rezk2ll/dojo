const NPM = 'https://blog.npmjs.org/post/180565383195/details-about-the-event-stream-incident';
const ISSUE = 'https://github.com/dominictarr/event-stream/issues/116';
const NODEMON = 'https://github.com/remy/nodemon/issues/1442';
const COPAY = 'https://github.com/bitpay/wallet/issues/9346';
const ES = 'https://github.com/dominictarr/event-stream/commit';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'event-stream-2018',
	part: 'Security',
	title: 'npm event-stream 2018: the new maintainer and the hidden payload',
	minutes: 10,
	hook: [
		'Tuesday 20 November 2018. You maintain a Node.js app and run it in development with nodemon. Since 29 October, an issue on the nodemon repository collects the same report from several users.',
		'Under Node.js 11, starting nodemon prints `[DEP0106] DeprecationWarning: crypto.createDecipher is deprecated.` Running the same script with plain `node` prints nothing. Your terminal shows the warning too.',
		'At 19:00 UTC, a user named FallingSnow posts the stack trace. The call comes from `node_modules/flatmap-stream/index.min.js`, loaded by line 11 of `node_modules/event-stream/index.js`.'
	],
	terms: [
		{ term: 'Transitive dependency', def: 'A package your project installs because one of your dependencies needs it. You never listed it in your own `package.json`.' },
		{ term: 'Caret range', def: 'A version rule like `^0.1.0` in `package.json`. npm installs the newest version that matches it, so a new patch release reaches every fresh install.' },
		{ term: 'Maintainer', def: 'An npm account with the right to publish new versions of a package.' },
		{ term: 'Payload', def: 'The part of malicious code that does the harm, here encrypted so that a reader cannot see what it does.' }
	],
	incident: {
		org: 'npm',
		title: 'Details about the event-stream incident',
		date: '2018-11-20',
		url: NPM,
		steps: [
			{
				situation: [
					'You have the stack trace. A stream library called flatmap-stream calls `crypto.createDecipher`, a Node.js function that decrypts data.',
					'The file in the trace is `index.min.js`, a minified file. The package also has a readable source file.'
				],
				q: 'What do you check first?',
				options: [
					'Start the app with `--no-deprecation` so the warning goes away',
					'Upgrade Node.js, since the warning is new in Node.js 11',
					'Compare the minified file with the readable source of the package',
					'Ask the nodemon maintainer to stop using `crypto.createDecipher`'
				],
				answer: 2,
				why: 'FallingSnow "followed the stack traces until I ran into some very strange code that looked like an obfuscated payload". The code was "not found in the unminified source of flatmap-stream@0.1.1 but found in the minified source". Hiding the warning would hide the only sign of the attack.'
			},
			{
				situation: [
					'The minified file reads an AES encrypted blob from `./test/data`, a file that looks like a test fixture. Nobody can decrypt it yet.',
					'The history of event-stream shows that a new maintainer, right9ctrl, made a first commit on 4 September 2018. On 9 September the new maintainer added `flatmap-stream` with the range `^0.1.0` and published event-stream 3.3.6. Your app asks for `event-stream` `^3.3.4`.'
				],
				q: 'The payload is still unknown. What do you do with your app?',
				options: [
					'Delete `node_modules` and run `npm install` to get a fresh copy',
					'Pin `event-stream` to exactly 3.3.4 and rebuild',
					'Wait until someone decrypts the payload before you change anything',
					'Ask the original author to remove the new maintainer'
				],
				answer: 1,
				why: 'The issue tells developers to "update your event-stream dependency to `event-stream@3.3.4`", the last release by the original author (July 2016). A fresh `npm install` with `^3.3.4` still picks 3.3.6, and `^0.1.0` still picks flatmap-stream 0.1.1. The original author wrote on 22 November: "I no longer have publish rights to this module on npm."'
			},
			{
				situation: [
					'Monday 26 November, 18:24 UTC. A user named maths22 decrypts the first payload. The key is the `npm_package_description` of the project that installs the package, and the one that works is "A Secure Bitcoin Wallet".',
					'The decrypted code runs only when `process.argv[2]` matches `build:.*-release`. It then appends code to `@zxing/library/.../ReedSolomonDecoder.js` inside `node_modules`, and puts the original file back when the process exits. The description belongs to the Copay Bitcoin wallet and its fork copay-dash.'
				],
				q: 'You know the target now. What do you do next?',
				options: [
					'Open an issue on the Copay repository with the decoded payload',
					'Publish a clean fork of flatmap-stream under a new name',
					'Keep posting in the event-stream issue until Copay finds it',
					'Report the package to npm and leave the rest to npm'
				],
				answer: 0,
				why: 'Twelve minutes later, at 18:36 UTC, issue 9346 "`event-stream` dependency attack steals wallets from users of copay" was open on Copay\'s repository. npm could pull the package from the registry, but only Copay could tell which of its released apps carried the code. npm\'s security team had been notified that morning.'
			},
			{
				situation: [
					'You are now on the Copay team. The payload ran when one of your release build scripts ran, and changed the code before it was bundled into the app.',
					'The payload wrote into a file under `node_modules` during the build and restored the file and its timestamps with `utimesSync` on exit.'
				],
				q: 'Where do you look to know which releases are affected?',
				options: [
					'In the git history of the Copay repository',
					'In `package.json`, to see if Copay lists flatmap-stream',
					'In a fresh build made today from the current code',
					'In the bundles of each released app version'
				],
				answer: 3,
				why: 'The payload left the source tree as it was, so only the built bundles held the code. Copay\'s first reply said the code "was not deployed in any platform". The same comment goes on: "Further examination of the code was relieved we did release some platforms with the affected code." Copay confirmed versions 5.0.2 through 5.1.0.'
			},
			{
				situation: [
					'The second payload checks each wallet balance. Above 100 Bitcoin or 1000 Bitcoin Cash, it sends the account data and private keys to a remote server. Version 5.2.0 without the dependency is ready for the app stores.',
					'You do not know yet whether any key was stolen.'
				],
				q: 'What do you tell Copay users?',
				options: [
					'Update to 5.2.0, which removes the code and keeps the keys safe',
					'Do not open 5.0.2 to 5.1.0, update, and move funds to a new wallet',
					'Restore the wallet in 5.2.0 from its twelve word phrase',
					'Wait for the end of the investigation before changing anything'
				],
				answer: 1,
				why: 'Copay wrote: "If you are using any version from 5.0.2 to 5.1.0, you should not run or open the Copay app." Users should send all funds to a new wallet with `Send Max` "and not by restoring using the wallet\'s twelve word phrase". A brand new wallet holds the funds under keys that the payload never saw.'
			}
		],
		outcome: [
			'The attack started as social engineering. The original author of event-stream wrote: "he emailed me and said he wanted to maintain the module, so I gave it to him." The new maintainer added flatmap-stream as a dependency. Its version 0.1.1 carried a payload in the minified file only.',
			'The payload ran only inside Copay\'s release builds and changed the bundled app. The final code harvested account data and private keys from wallets above 100 BTC or 1000 BCH. Copay shipped it in versions 5.0.2 through 5.1.0.',
			'npm\'s security team was notified on the morning of 26 November. It removed flatmap-stream and event-stream 3.3.6 from the registry and took ownership of event-stream. Copay released 5.2.0 and had the collection endpoints taken down.',
			'Copay listed its fixes: commit its dependencies to the repository so upgrades show a diff, lock `package-lock` for each major version, restrict network access in the app with a Content Security Policy from 5.3.0, and freeze critical classes against overwrite.'
		]
	},
	quiz: [
		{
			q: 'event-stream 3.3.6 was published on 9 September 2018 with `"flatmap-stream": "^0.1.0"`. How did apps get the malicious 0.1.1?',
			options: [
				'npm upgrades every installed package each night',
				'event-stream 3.3.6 pinned flatmap-stream 0.1.1 exactly',
				'A fresh install picks the newest version that matches `^0.1.0`',
				'npm audit replaced 0.1.0 with 0.1.1 as a security fix'
			],
			answer: 2,
			why: 'A caret range on 0.1.x accepts any later 0.1 patch. Each install without a lockfile entry resolves it again, so 0.1.1 reached every new install of event-stream 3.3.6.'
		},
		{
			q: 'Why did running the payload on a normal developer machine do nothing?',
			options: [
				'Its key was Copay\'s `npm_package_description`',
				'It checked the IP address of the machine against a list',
				'It waited 30 days after install before it ran',
				'It ran only on Node.js versions older than 11'
			],
			answer: 0,
			why: 'npm sets `npm_package_description` from the project being built. Only "A Secure Bitcoin Wallet" decrypted the payload into valid code, and that code then also checked `process.argv[2]` against `build:.*-release`.'
		},
		{
			q: 'Which Copay fix makes a changed dependency visible in code review?',
			options: [
				'A Content Security Policy in the app',
				'Freezing critical classes against overwrite',
				'Taking down the collection endpoints',
				'Committing the dependencies to the repository'
			],
			answer: 3,
			why: 'With the dependency files in the repository, an upgrade shows up as a diff that someone can read. Copay noted this "will be practical sometimes, be definitely not always".'
		}
	],
	recall: {
		q: 'Which package carried the event-stream payload, and which app did it target?',
		a: 'flatmap-stream 0.1.1, added to event-stream 3.3.6 by a new maintainer. It targeted the Copay wallet, versions 5.0.2 to 5.1.0.'
	},
	sources: [
		{ title: 'npm Blog, Details about the event-stream incident', url: NPM },
		{ title: 'dominictarr/event-stream issue 116, I don\'t know what to say.', url: ISSUE },
		{ title: 'remy/nodemon issue 1442, Deprecation warning at start', url: NODEMON },
		{ title: 'bitpay/wallet issue 9346, event-stream dependency attack steals wallets from users of copay', url: COPAY },
		{ title: 'event-stream commit e316336, add flat map', url: `${ES}/e3163361fed01384c986b9b4c18feb1fc42b8285` },
		{ title: 'node-semver README, Caret Ranges', url: 'https://github.com/npm/node-semver/blob/6e05b7637396ac66522cff8731f07cfe0ef49a29/README.md#L342-L360' }
	]
};
