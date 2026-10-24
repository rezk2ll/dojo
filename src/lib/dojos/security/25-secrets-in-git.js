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
		],
		steps: [
			{
				title: 'Find what is still exposed',
				questions: [
					{ q: 'From what time could anyone on the internet copy the key?', options: ['From 17:25, when the fix was pushed', 'Only while the developer’s laptop is online', 'From 17:10, when `a1b2c3d` reached the public repo', 'Never: GitHub hides `.env` files'], answer: 2, why: 'The push at 17:10 made the commit public. The 17:25 commit does not shorten that window, and the window stays open until the key is rotated.' },
					{ q: 'On Monday, someone opens the GitHub page of commit `a1b2c3d`. What do they see?', options: ['The diff that adds `config/.env`, key included', 'A 404: the file was removed', 'The commit message without its diff', 'Only the later commit "remove .env"'], answer: 0, why: 'GitHub serves a commit page by its SHA, and `e4f5a6b` did not change `a1b2c3d`.' },
					{ q: 'Besides the AWS key, what else in `config/.env` do you treat as exposed?', options: ['Nothing: only the AWS key is a secret', 'Only values that start with `AKIA`', 'Only the file name', 'Every other value in the file, since the whole file was public'], answer: 3, why: 'The commit holds the full file. Any other token or password in it leaked the same way and needs its own rotation.' },
					{ q: 'Why does a gitleaks scan still find the key?', options: ['It reads the working tree twice', 'It scans patches with `git log -p`', 'It asks GitHub for deleted files', 'It reads the reflog only'], answer: 1, why: 'The README: "gitleaks uses the `git log -p` command to scan patches", so the commit that added the key shows up.' }
				]
			},
			{
				title: 'Pick the first move',
				questions: [
					{ q: 'It is 17:30 and the key is still active. What can someone who cloned the repo at 17:12 do with it?', options: ['Nothing until they decrypt it', 'Only read the repo', 'Only use it from GitHub Actions', 'Call AWS as `ci-deploy`, with all of its permissions'], answer: 3, why: 'A secret grants access on its own, with no other check. Every minute the key stays active is a minute anyone with a copy can use it.' },
					{ q: 'Why not rewrite history first?', options: ['A rewrite does nothing for copies taken since 17:10', 'Git cannot rewrite a public repo', 'A rewrite deletes the IAM user', '`git-filter-repo` only works on private repos'], answer: 0, why: 'GitHub’s docs: "as a first step you need to revoke and/or rotate that secret."' },
					{ q: 'Why not just make the repo private?', options: ['It deletes the repo', 'Clones and forks already have the key', 'It costs money', 'It disables push protection'], answer: 1, why: 'A private repo hides the page, not the copies people already took.' },
					{ q: 'Rotation breaks any program that still holds the old key. Which one must move to the new key in this story?', options: ['The developer’s editor', 'GitHub push protection', 'The deploy that runs as `ci-deploy`', 'The gitleaks hook'], answer: 2, why: 'The key belongs to `ci-deploy`, the user your deploy runs as. Turn the old key off before the deploy moves, and the next deploy fails.' }
				]
			},
			{
				title: 'Rotate the key',
				questions: [
					{ q: 'Which command comes first?', options: ['`aws iam create-access-key --user-name ci-deploy`', '`aws iam delete-access-key` on the leaked key', '`aws iam update-access-key --status Inactive` on the leaked key', '`git push --force`'], answer: 0, why: 'Create the new key and move the deploy to it first, so turning the old one off breaks nothing.' },
					{ q: 'What do you check before turning the old key off?', options: ['That gitleaks passes', 'That the repo is private', 'That the IAM user has no other keys', 'That a deploy works with the new key'], answer: 3, why: 'Rotation breaks every program that still holds the old secret. Check the new one works first.' },
					{ q: 'What does `--status Inactive` do?', options: ['Hides the key from the console', 'The key cannot be used', 'Deletes the key after 30 days', 'Limits the key to read only'], answer: 1, why: 'The AWS docs: "Inactive means that the key cannot be used."' },
					{ q: '`get-access-key-last-used` shows a use at 17:20 by your own deploy. Are you sure nobody else used the key?', options: ['Yes: the last use is yours', 'Yes: AWS would have alerted', 'No: it returns only the last request, so it can hide an earlier one', 'No: it only shows uses from the console'], answer: 2, why: 'It returns the date, service and Region of the last request only. A use that is not yours is an incident.' }
				]
			},
			{
				title: 'Close the door',
				questions: [
					{ q: 'Once the key is rotated, is a history rewrite required?', options: ['Yes, or AWS keeps the key alive', 'Yes, GitHub requires it', 'No: GitHub says rotation "may be sufficient"', 'No: rewrites are not possible on GitHub'], answer: 2, why: 'A rewrite is optional, and it changes the SHA of every later commit.' },
					{ q: 'If you do rewrite, which command removes the file?', options: ['`git rm --cached config/.env`', '`git revert a1b2c3d`', '`git commit --amend`', '`git-filter-repo --sensitive-data-removal --invert-paths --path config/.env`'], answer: 3, why: '`git-filter-repo` rebuilds every commit without the file. A revert or a new commit leaves the old one intact.' },
					{ q: 'What stops the next key before the commit exists?', options: ['A gitleaks pre-commit hook', 'A weekly scan of the default branch', 'A code review on the pull request', 'Branch protection on `main`'], answer: 0, why: 'The hook marks "Detect hardcoded secrets" as Failed and `git commit` stops.' },
					{ q: 'What stops it at the push, on GitHub’s side?', options: ['Dependabot', 'Push protection', 'A `.gitattributes` rule', 'Signed commits'], answer: 1, why: 'Push protection scans a push for known secret formats and blocks it before the commits reach the repository.' }
				]
			}
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
	lab: {
		minutes: 15,
		goal: 'Commit a fake AWS key in a local repo, delete it, and see that git history and gitleaks still have it.',
		steps: [
			'Make a throwaway repo: `mkdir ~/leak-lab && cd ~/leak-lab && git init`.',
			'Write a fake key in the AWS format (random, valid nowhere): `mkdir config && echo "AWS_ACCESS_KEY_ID=AKIA$(LC_ALL=C tr -dc \'A-Z2-7\' </dev/urandom | head -c 16)" > config/.env`.',
			'Commit it, then delete it the way the developer did: `git add config/.env && git commit -m "add config" && git rm config/.env && git commit -m "remove .env"`.',
			'Look for it: `ls config`, then `git show HEAD~1:config/.env`, then `git log -p | grep AKIA`.',
			'Scan with gitleaks in docker: `docker run --rm -v "$PWD:/repo" ghcr.io/gitleaks/gitleaks:v8.24.2 git /repo -v --redact`, then the same with `dir /repo` in place of `git /repo`.',
			'Add AWS’s documented sample key, `echo "key = AKIAIOSFODNN7EXAMPLE" > sample.txt`, commit it, and run the `git` scan again.'
		],
		done: [
			'`ls config` fails, but `git show HEAD~1:config/.env` still prints the key.',
			'The `git` scan reports `RuleID: aws-access-token` in `config/.env` and ends with `leaks found: 1`.',
			'The `dir` scan says `no leaks found`, and after step 6 the `git` scan still finds only 1 leak.'
		],
		solution: [
			'`git rm` only adds a snapshot without the file. The commit that added it is unchanged, and `gitleaks git` reads it through `git log -p`.',
			'`dir` scans only the files on disk, so it misses a key that lives only in history.',
			'The sample key matches the pattern but ends in `EXAMPLE`, so the rule’s allowlist `.+EXAMPLE$` drops it.',
			'With a real key, the next step is rotation in AWS, not anything in this repo.'
		]
	},
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
