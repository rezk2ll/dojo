const GL = 'https://github.com/gitleaks/gitleaks/blob/b58d3f102cf3a2c84cb7f923d05c25c9b1aed84b';
const RSA = 'https://github.blog/news-insights/company-news/we-updated-our-rsa-ssh-host-key/';
const REMOVE = 'https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository';
const AWS_ROTATE = 'https://docs.aws.amazon.com/IAM/latest/UserGuide/id-credentials-access-keys-update.html';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'secrets-in-git',
	part: 'Secrets and supply chain',
	title: 'Secrets in git',
	minutes: 10,
	hook: [
		'On 23 March 2023 GitHub [announced](' + RSA + ') that "GitHub.com’s RSA SSH private key was briefly exposed in a public GitHub repository." With that key, an attacker could pose as github.com to `git` clients connecting over SSH.',
		'GitHub says it "immediately acted to contain the exposure", and then replaced the key: "At approximately 05:00 UTC on March 24, out of an abundance of caution, we replaced our RSA SSH host key". SSH clients that had saved the old RSA key printed "WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!", and their users had to run `ssh-keygen -R github.com`. GitHub Actions workflows using `actions/checkout` with the `ssh-key` option could fail.',
		'GitHub wrote on 1 April 2025 that "more than 39 million secrets were leaked across GitHub in 2024 alone." For each of them, a later commit that deletes the file changes nothing: the earlier commit still holds the secret, and so does every clone and fork made since the push.'
	],
	terms: [
		{ term: 'Secret', def: 'A string that grants access on its own, with no other check: an AWS access key, an API token, an SSH private key.' },
		{ term: 'Rotation', def: 'Issuing a new secret, moving every program to it, then disabling the old one. After that, the leaked copy is refused wherever it ends up.' },
		{ term: 'History rewrite', def: 'Rebuilding commits without a file, for example with `git-filter-repo`, then force pushing. Every later commit gets a new SHA.' },
		{ term: 'Push protection', def: 'A GitHub check that scans a push for known secret formats and blocks it before the commits reach the repository.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['add["Commit a1b2c3d adds .env: AWS_ACCESS_KEY_ID=AKIAEXAMPLEEXAMPLE00"] -->|"git push"| repo[("Public repo on GitHub")]'],
				highlight: ['add', 'repo'],
				note: 'A developer commits `.env` with an AWS access key and pushes to a public repository. From that second, anyone who clones, forks or opens the commit page has the key.'
			},
			{
				add: ['repo --> del["Commit e4f5a6b: git rm .env"]', 'del --> still["Still readable: git show a1b2c3d:.env, clones, forks"]'],
				highlight: ['del', 'still'],
				note: 'The next commit deletes the file, and the working tree looks clean. The first commit is unchanged, so `git show a1b2c3d:.env` still prints the key. GitHub’s docs add that a rewritten commit can stay reachable "In any clones or forks of your repository" and "Directly via their SHA-1 hashes in cached views".'
			},
			{
				add: ['still --> rotate["Rotate: create-access-key, deploy, update-access-key --status Inactive"]', 'rotate --> dead["The leaked key is refused everywhere"]'],
				highlight: ['rotate', 'dead'],
				note: 'You rotate the key inside AWS, so the change covers every copy at once. Create a second key, move the app to it, then set the leaked one to `Inactive`. The AWS docs: "Inactive means that the key cannot be used."'
			},
			{
				add: ['dead -.->|"optional"| rewrite["git-filter-repo --sensitive-data-removal, force push"]', 'dead --> guard["Next time: gitleaks pre-commit hook, push protection"]'],
				highlight: ['rewrite', 'guard'],
				note: 'GitHub’s docs on removing the key from history: once the secret is rotated, "that may be sufficient to solve your problem." A rewrite changes every later SHA. A gitleaks hook stops the next key before the commit exists, and push protection stops it at the push.'
			}
		]
	},
	example: {
		title: 'cmd/generate/config/rules/aws.go: the gitleaks rule for AWS access keys',
		repo: 'gitleaks/gitleaks',
		url: `${GL}/cmd/generate/config/rules/aws.go#L10-L32`,
		lang: 'go',
		code: `func AWS() *config.Rule {
	// define rule
	r := config.Rule{
		RuleID:      "aws-access-token",
		Description: "Identified a pattern that may indicate AWS credentials, risking unauthorized cloud resource access and data breaches on AWS platforms.",
		Regex:       regexp.MustCompile(\`\\b((?:A3T[A-Z0-9]|AKIA|ASIA|ABIA|ACCA)[A-Z2-7]{16})\\b\`),
		Entropy:     3,
		Keywords: []string{
			// https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_identifiers.html#identifiers-unique-ids
			"A3T",  // todo: might not be a valid AWS token
			"AKIA", // Access key
			"ASIA", // Temporary (AWS STS) access key
			"ABIA", // AWS STS service bearer token
			"ACCA", // Context-specific credential
		},
		Allowlists: []*config.Allowlist{
			{
				Regexes: []*regexp.Regexp{
					regexp.MustCompile(\`.+EXAMPLE$\`),
				},
			},
		},
	}`,
		notes: [
			'Line 6 is the pattern: a 4-character prefix such as `AKIA`, then 16 characters from `A-Z` and `2-7`, so 20 in all. The [AWS identifier table](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_identifiers.html) gives the same prefixes: `AKIA` is an "Access key" and `ASIA` a "Temporary (AWS STS) access key".',
			'Line 7 sets `Entropy: 3`. The gitleaks README defines it as the "minimum shannon entropy a regex group must have to be considered a secret". A string of one letter repeated after `AKIA` matches the pattern and is still skipped.',
			'Lines 8 to 15 are keywords, used "for pre-regex check filtering". A quick string compare checks that the content holds one of these 5 strings before gitleaks runs the regex.',
			'Lines 16 to 22 drop any match that ends in `EXAMPLE`. The README says an allowlist regex checks the secret by default, and AWS’s own docs write example keys with that ending, so code samples copied from the docs raise no finding.',
			'The README: "Under the hood, gitleaks uses the `git log -p` command to scan patches." `gitleaks git -v` therefore reads the commit that added a key, even after a later commit deleted the file.'
		]
	},
	tradeoff: {
		gain: [
			'Once the old key is `Inactive`, AWS refuses it, whether the caller copied it from a fork or from a stranger’s clone. Nobody has to find and delete those copies.',
			'gitleaks reads `git log -p`, so it finds a key in a commit from last year. As a pre-commit hook it marks "Detect hardcoded secrets" as Failed, and `git commit` stops before the commit exists.',
			'GitHub’s push protection for users "Is enabled by default" and "Stops you from pushing secrets to public repositories on GitHub", with no setup on your side.'
		],
		cost: [
			'Rotation breaks every program that still holds the old secret. GitHub’s new host key made every RSA client print the host identification warning, and some `actions/checkout` workflows failed.',
			'A rewrite changes the SHA of every later commit, removes commit signatures, and breaks the diff view of closed pull requests. GitHub’s docs list these and more side effects.',
			'`SKIP=gitleaks git commit` turns the gitleaks hook off. GitHub’s docs on push protection for repositories: by default, "anyone with write access to the repository can bypass push protection by specifying a bypass reason".'
		]
	},
	task: {
		prompt: 'Friday, 17:10. A developer pushes commit `a1b2c3d` to a public repo. It adds `config/.env` with the key of the IAM user `ci-deploy` (shown here as the placeholder `AKIAEXAMPLEEXAMPLE00`). At 17:25 they push `e4f5a6b`, "remove .env", and tell you it is fixed. Write down what is still exposed, then the commands you run, in order. 10 minutes, on paper.',
		hint: 'Ask where the string lives now, then which single action makes every copy useless at once.',
		answer: [
			'Still exposed: `git show a1b2c3d:config/.env` prints the key from any clone. Every clone and fork made between 17:10 and now has it, and GitHub serves the commit page by SHA. Deleting the file changed none of that.',
			'Rotate first: `aws iam create-access-key --user-name ci-deploy`, put the new key in the deploy secret store, and check that a deploy works. Then `aws iam update-access-key --access-key-id AKIAEXAMPLEEXAMPLE00 --status Inactive --user-name ci-deploy`. From then on, AWS refuses the leaked key.',
			'Check use: `aws iam get-access-key-last-used --access-key-id AKIAEXAMPLEEXAMPLE00` returns the date, service and Region of the last request only, so your own deploy at 17:20 would hide an earlier use. A last use that is not yours is an incident (day 38). Delete the key with `aws iam delete-access-key` once nothing breaks.',
			'Then decide on history. GitHub says a rotated secret "may be sufficient", and a rewrite with `git-filter-repo --sensitive-data-removal --invert-paths --path config/.env` changes every later SHA. Either way, add `.env` to `.gitignore`, install the gitleaks pre-commit hook, and turn on push protection for the repository.'
		]
	},
	quiz: [
		{
			q: 'A developer pushes `.env` with a token, then runs `git rm .env`, commits and pushes again. Where is the token now?',
			options: [
				'Nowhere on GitHub: a deleted file leaves the history once the deleting commit is pushed',
				'In the earlier commit, and in every clone and fork made since the first push',
				'Only in the developer’s local reflog, which git expires after 90 days by default',
				'In GitHub’s storage for 30 days, until garbage collection removes the blob'
			],
			answer: 1,
			why: 'A new commit adds a snapshot without the file and leaves the earlier commit as it was. `git show <sha>:.env` still prints the token, and each clone or fork holds its own copy of that commit.'
		},
		{
			q: 'Secret scanning reports a live AWS key that was pushed an hour ago. What do you do first?',
			options: [
				'Run `git-filter-repo` to remove the file from every commit, then force push',
				'Make the repository private so that nobody else can read the commit',
				'Create a new key, move the app to it, then set the leaked key to `Inactive`',
				'Close the alert, since the file is gone from the default branch already'
			],
			answer: 2,
			why: 'Once the leaked key is `Inactive`, AWS refuses it in every copy, including clones you cannot reach. A rewrite or a private repo does nothing for copies taken during that hour. GitHub’s docs: "as a first step you need to revoke and/or rotate that secret."'
		},
		{
			q: 'A test fixture contains AWS’s documented sample key, which ends in `EXAMPLE`. Why does the gitleaks `aws-access-token` rule not report it?',
			options: [
				'Any key that contains `EXAMPLE` has a Shannon entropy below 3',
				'The keyword list makes gitleaks skip files in a test folder',
				'An allowlist regex `.+EXAMPLE$` drops secrets that end in EXAMPLE',
				'gitleaks only scans the last commit unless you pass `--all`'
			],
			answer: 2,
			why: 'The rule’s `Allowlists` entry holds `.+EXAMPLE$`, and an allowlist regex checks the secret by default. Keywords only filter content before the regex runs, and `gitleaks git` reads the whole `git log -p`.'
		}
	],
	recall: {
		q: 'A key was pushed and then deleted in the next commit. What do you do first, and why is the delete not enough?',
		a: 'Rotate: create a new key, deploy it, then set the old one `Inactive` with `aws iam update-access-key`. The key is still in the first commit, in every clone and fork, and `git log -p` shows it.'
	},
	sources: [
		{ title: 'GitHub blog, We updated our RSA SSH host key (23 March 2023)', url: RSA },
		{ title: 'GitHub blog, The next evolution of GitHub Advanced Security (1 April 2025)', url: 'https://github.blog/security/application-security/next-evolution-github-advanced-security/' },
		{ title: 'GitHub docs, Removing sensitive data from a repository', url: REMOVE },
		{ title: 'GitHub docs, Push protection', url: 'https://docs.github.com/en/code-security/concepts/secret-security/push-protection' },
		{ title: 'GitHub docs, Secret scanning', url: 'https://docs.github.com/en/code-security/concepts/secret-security/secret-scanning' },
		{ title: 'gitleaks README', url: `${GL}/README.md` },
		{ title: 'AWS IAM docs, Update access keys', url: AWS_ROTATE },
		{ title: 'AWS CLI reference, iam update-access-key', url: 'https://docs.aws.amazon.com/cli/latest/reference/iam/update-access-key.html' }
	]
};
