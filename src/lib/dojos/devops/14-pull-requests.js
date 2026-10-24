const NODE = 'https://github.com/nodejs/node/blob/f59539b514344ed0a0945f8790d61121df88a5d4';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'pull-requests',
	part: 'Git',
	title: 'Pull requests, protected branches and CODEOWNERS',
	minutes: 10,
	hook: [
		'On the old servers, change review was a chat message: "restarting nginx with the new config, ok?" Someone said "ok". Nobody saw the diff.',
		'A pull request (PR) is a proposal: "merge my branch into `main`". It shows the diff, runs CI and collects reviews, all **before** anything reaches `main`. GitLab calls the same thing a merge request.',
		'On a busy day someone skips the review, so you make GitHub enforce it. A **protected branch** can require a PR, an approval and green required checks before `main` moves. A CODEOWNERS file decides who gets asked to review.'
	],
	terms: [
		{ term: 'Pull request', def: 'A request to merge one branch into another, with the diff, the discussion, the reviews and the CI results in one place.' },
		{ term: 'Protected branch', def: 'A branch with rules: by default no force push and no deletion, plus optional rules like required reviews and checks.' },
		{ term: 'Required status check', def: 'A CI job that must end successful, skipped or neutral before the PR can merge.' },
		{ term: 'CODEOWNERS', def: 'A file mapping paths to people or teams. Owners are requested for review automatically when a PR, once out of draft, touches their files.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['br["feature branch"] -->|"open PR"| pr["Pull request: diff and discussion"]'],
				highlight: ['br', 'pr'],
				note: 'You push your branch and open a PR against `main`. Nothing has changed on `main` yet. Reviewers read the diff and comment in the PR.'
			},
			{
				add: ['pr --> ci["CI: lint, tests"]'],
				highlight: ['ci'],
				note: 'CI runs on the PR. The machine checks first, so humans review a change that already builds and passes tests.'
			},
			{
				add: ['co["CODEOWNERS"] -.->|"requests review"| rev["Reviewer: a code owner"]', 'rev -->|"approve or request changes"| pr'],
				highlight: ['co', 'rev'],
				note: 'The PR touches `prod/`. CODEOWNERS says `prod/` belongs to the ops team, so GitHub **requests their review automatically**.'
			},
			{
				add: [
					'subgraph prot["Branch protection on main"]',
					'gate{"Approved and checks green?"}',
					'end',
					'pr --> gate',
					'gate -->|yes| main["main"]',
					'gate -->|no| blocked["merge stays blocked"]'
				],
				highlight: ['gate', 'main', 'blocked'],
				note: 'The protection rule blocks the merge until the approvals are in and the required checks are green. With required reviews on, collaborators can change `main` **only through an approved PR**.'
			},
			{
				add: ['br -.->|"new push after approval"| pr'],
				highlight: ['br'],
				note: 'You push one more commit after the approval. With "dismiss stale pull request approvals" on, GitHub drops the old approval: the diff changed, so someone has to approve again.'
			}
		]
	},
	example: {
		title: '.github/CODEOWNERS',
		repo: 'nodejs/node',
		url: `${NODE}/.github/CODEOWNERS#L1-L23`,
		lang: 'ini',
		code: `# Node.js Project Codeowners

# This file does not define any requirements for landing PRs.
# Its purpose is to allow automation of courtesy pings to the
# relevant team(s) when any of the paths listed here are modified.
# Criteria for landing PRs are defined in
# https://github.com/nodejs/node/blob/main/doc/contributing/collaborator-guide.md#code-reviews.
#
# Codeowners must always be teams, never individuals.

# tsc

/.github/CODEOWNERS @nodejs/tsc
/.github/PULL_REQUEST_TEMPLATE.md @nodejs/tsc
/.github/ISSUE_TEMPLATE/* @nodejs/tsc
/CODE_OF_CONDUCT.md @nodejs/tsc
/CONTRIBUTING.md @nodejs/tsc
/doc/contributing/**/* @nodejs/tsc
/GOVERNANCE.md @nodejs/tsc
/SECURITY.md @nodejs/tsc
/BUILDING.md @nodejs/build @nodejs/tsc
/LICENSE @nodejs/tsc
/onboarding.md @nodejs/tsc`,
		notes: [
			'Lines 3 to 7 say this file sends **courtesy pings** and does not decide what can merge. CODEOWNERS on its own only requests reviews. It blocks a merge only when a branch protection rule (or a ruleset, GitHub\'s newer form of the same rules) turns on "Require review from Code Owners".',
			'Line 9: owners must be teams, never individuals. A team entry keeps working when one person leaves the project. GitHub also requires each owner, team or person, to have write access to the repository.',
			'Line 13 makes the file own itself: changing who owns what needs the `@nodejs/tsc` team. GitHub\'s docs call a CODEOWNERS in `.github/` that owns itself the most secure setup.',
			'Line 21: `/BUILDING.md` lists two teams. When code owner review is required, **an approval from any one owner** is enough.',
			'When two patterns match a file, the **last matching pattern wins**. Put a catch-all `*` line first and specific paths after it. A line with bad syntax is skipped, and GitHub shows the error when you open the file.'
		]
	},
	tradeoff: {
		gain: [
			'Every change to `main` is reviewed and tested before it lands on `main`.',
			'The discussion is kept next to the diff: six months later you can read why a change was made.',
			'CODEOWNERS sends each change to the people who know that area, without anyone routing by hand.'
		],
		cost: [
			'Each PR waits for a reviewer before it can merge. Keep PRs small: the [Kubernetes guide](https://github.com/kubernetes/community/blob/440e496d3a172234d81728df1bfe43849b589adf/contributors/guide/github-workflow.md#L141) says very large PRs are very difficult to review.',
			'By default, branch protection does not apply to admins unless you turn on "Do not allow bypassing the above settings".',
			'Branch protection is set in the repository settings and in no file in Git, so it is easy to forget when you create the next repository.'
		]
	},
	task: {
		prompt: 'You own a GitHub repo of Ansible playbooks that deploy production. Today anyone with write access pushes straight to `main`. Make it so: every change goes through a PR, the `lint` CI job must pass, anything under `prod/` needs approval from the `@acme/ops` team, and nobody (admins included) can force push `main`.',
		hint: 'One branch protection rule on `main` with three settings, plus a CODEOWNERS file where order matters.',
		answer: [
			'Branch protection rule on `main`: "Require pull request reviews before merging" with 1 approval, and "Require review from Code Owners".',
			'"Require status checks before merging", and select the `lint` check.',
			'Force pushes and deletions are already blocked by default on a protected branch: leave "Allow force pushes" off. Turn on "Do not allow bypassing the above settings" so admins follow the rules too.',
			'`.github/CODEOWNERS`: `* @acme/devs` first, then `/prod/ @acme/ops`, then `/.github/CODEOWNERS @acme/ops`. The last match wins, so `prod/` changes go to ops. Both teams need write access.'
		],
		steps: [
			{
				title: 'Require a reviewed PR',
				questions: [
					{ q: 'Where do you set the rules that stop direct pushes to `main`?', options: ['In a file at the root of the repo', 'In a branch protection rule on `main`, in the repo settings', 'In the `lint` CI job', 'In each developer\'s `.git/config`'], answer: 1, why: 'Branch protection lives in the repository settings, in no file in Git.' },
					{ q: 'Which setting makes every change to `main` go through a PR?', options: ['"Require status checks before merging"', '"Allow force pushes"', '"Dismiss stale pull request approvals"', '"Require pull request reviews before merging"'], answer: 3, why: 'With required reviews on, collaborators can change `main` only through an approved PR.' },
					{ q: 'Which setting makes the ops approval mandatory for `prod/`?', options: ['"Require review from Code Owners"', 'A CODEOWNERS file alone', '"Require status checks before merging"', '"Do not allow bypassing the above settings"'], answer: 0, why: 'CODEOWNERS on its own only requests reviews. This rule is what makes the owner\'s approval required.' },
					{ q: 'Someone pushes a new commit after the approval. With "dismiss stale pull request approvals" on, what happens?', options: ['The PR merges at once', 'The new commit is rejected', 'The old approval is dropped, so someone approves again', 'CI is skipped for that commit'], answer: 2, why: 'The diff changed, so the approval no longer covers what will merge.' }
				]
			},
			{
				title: 'Require the lint check',
				questions: [
					{ q: 'Which setting makes `lint` block the merge?', options: ['"Require review from Code Owners"', '"Require status checks before merging", with `lint` selected', '"Require pull request reviews before merging"', 'A `lint` line in CODEOWNERS'], answer: 1, why: 'A required status check is a CI job that must end successful, skipped or neutral before the PR can merge.' },
					{ q: 'Which results of `lint` let the PR merge?', options: ['Any result, once it has run', 'Only successful', 'Successful, or failed with an approval', 'Successful, skipped or neutral'], answer: 3, why: 'GitHub accepts a required check that ends successful, skipped or neutral. A failing one keeps the merge blocked.' },
					{ q: 'Why run CI on the PR before humans review?', options: ['So reviewers read a change that already passes the checks', 'So reviewers do not need to read the diff', 'So the PR merges without approval', 'So `main` gets the commit early'], answer: 0, why: 'The machine checks first. Humans then spend their time on a change that already builds and passes.' },
					{ q: 'Where does the `lint` job run in this flow?', options: ['Only on `main`, after the merge', 'Only on a developer\'s laptop', 'On the PR, before anything reaches `main`', 'Only when an admin starts it'], answer: 2, why: 'CI runs on the PR, so a broken change is caught before `main` moves.' }
				]
			},
			{
				title: 'Lock out force pushes',
				questions: [
					{ q: 'Are force pushes to a protected `main` blocked by default?', options: ['Yes: leave "Allow force pushes" off', 'No: you must add a CI job for it', 'No: only CODEOWNERS can block them', 'Only for users without write access'], answer: 0, why: 'A protected branch blocks force pushes and deletions by default.' },
					{ q: 'By default, do the protection rules apply to admins?', options: ['Yes, always', 'Only for force pushes', 'No, unless you turn on "Do not allow bypassing the above settings"', 'Only when they open a PR'], answer: 2, why: 'Admins can bypass branch protection by default. That setting makes them follow the rules too.' },
					{ q: 'The task says "admins included". Which setting covers that?', options: ['"Require review from Code Owners"', '"Allow force pushes"', '"Dismiss stale pull request approvals"', '"Do not allow bypassing the above settings"'], answer: 3, why: 'It is the one setting that removes the admin bypass.' },
					{ q: 'Next month you create a second playbook repo. What do you need to remember?', options: ['Nothing: protection is copied from the first repo', 'To set branch protection again, since it is in no Git file', 'To copy CODEOWNERS, which carries the protection', 'To re-run `lint` once'], answer: 1, why: 'Branch protection is set in the repository settings, so it is easy to forget on the next repo.' }
				]
			},
			{
				title: 'Write CODEOWNERS',
				questions: [
					{ q: 'Which line comes first in `.github/CODEOWNERS`?', options: ['`/prod/ @acme/ops`', '`/.github/CODEOWNERS @acme/ops`', '`* @acme/devs`', 'Any line: order does not matter'], answer: 2, why: 'The last matching pattern wins, so the catch-all goes first and the specific paths after.' },
					{ q: 'A PR changes only `prod/hosts.ini`. Who is requested for review?', options: ['`@acme/ops` only', 'Both teams', '`@acme/devs` only', 'Nobody, since two lines match'], answer: 0, why: '`/prod/ @acme/ops` comes after `*`, and the last match wins.' },
					{ q: 'Why add `/.github/CODEOWNERS @acme/ops`?', options: ['GitHub refuses the file without it', 'It makes ops the owner of every file', 'It hides the file from devs', 'Changing who owns what then needs ops approval'], answer: 3, why: 'GitHub\'s docs call a CODEOWNERS in `.github/` that owns itself the most secure setup.' },
					{ q: 'What must both `@acme/devs` and `@acme/ops` have for this to work?', options: ['Admin rights on the repo', 'Write access to the repository', 'Their own branch protection rule', 'A personal entry for each member'], answer: 1, why: 'GitHub requires each code owner, team or person, to have write access.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'What does a CODEOWNERS file do on its own, without branch protection?',
			options: [
				'It blocks merges until one of the listed owners approves the PR',
				'It gives the owners admin rights on the paths listed next to them',
				'It stops anyone who is not an owner from editing those files',
				'It requests the owners as reviewers on PRs that touch their files'
			],
			answer: 3,
			why: 'CODEOWNERS only routes review requests. A branch protection rule or a ruleset with "Require review from Code Owners" is what makes the approval mandatory.'
		},
		{
			q: 'CODEOWNERS has `* @acme/devs` on line 1 and `/prod/ @acme/ops` on line 2. A PR changes only `prod/hosts.ini`. Who is requested for review?',
			options: [
				'`@acme/ops` only, because the last matching pattern wins',
				'Both teams',
				'`@acme/devs` only, because the first matching pattern wins',
				'Nobody, because two lines match the same file'
			],
			answer: 0,
			why: 'In CODEOWNERS the last matching pattern takes precedence. The catch-all line applies only to files no later line matches.'
		},
		{
			q: 'A required status check is set on `main`. When can a PR merge?',
			options: [
				'As soon as the check has run, whatever its result',
				'When the check is successful, skipped or neutral',
				'As soon as one reviewer approves, checks are only advice',
				'Only after an admin re-runs the check by hand'
			],
			answer: 1,
			why: 'GitHub requires each required check to end successful, skipped or neutral. A failing check keeps the merge blocked.'
		}
	],
	recall: {
		q: 'CODEOWNERS lists `/prod/ @acme/ops`. What makes an ops approval mandatory before a change to `prod/` can merge?',
		a: 'A branch protection rule (or a ruleset) on `main` with "Require review from Code Owners" turned on. CODEOWNERS on its own only requests the review.'
	},
	sources: [
		{ title: 'GitHub Docs, About pull requests', url: 'https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/about-pull-requests' },
		{ title: 'GitHub Docs, About pull request reviews', url: 'https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/about-pull-request-reviews' },
		{ title: 'GitHub Docs, About protected branches', url: 'https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches' },
		{ title: 'GitHub Docs, About code owners', url: 'https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners' },
		{ title: 'GitLab Docs, Merge requests', url: 'https://docs.gitlab.com/user/project/merge_requests/' }
	]
};
