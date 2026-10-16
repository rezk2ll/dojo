const NODE = 'https://github.com/nodejs/node/blob/f59539b514344ed0a0945f8790d61121df88a5d4';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'pull-requests',
	part: 'Git',
	title: 'Pull requests, protected branches and CODEOWNERS',
	minutes: 10,
	hook: [
		'On the old servers, change review was a chat message: "restarting nginx with the new config, ok?" Someone said "ok". Nobody saw the diff.',
		'A **pull request** (PR) is a proposal: "merge my branch into `main`". It shows the diff, runs CI and collects reviews, all **before** anything reaches `main`. GitLab calls the same thing a merge request.',
		'Habits break on a busy day, so you turn them into rules. A **protected branch** on GitHub can require a PR, an approval and green **required checks** before `main` moves. A **CODEOWNERS** file decides who gets asked to review.'
	],
	terms: [
		{ term: 'Pull request', def: 'A request to merge one branch into another, with the diff, the discussion, the reviews and the CI results in one place.' },
		{ term: 'Review', def: 'A reviewer comments, approves, or requests changes. When reviews are required, the PR needs enough approvals to merge.' },
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
				note: 'You push your branch and open a PR against `main`. Nothing has changed on `main` yet. The PR is the place where the change is **looked at**.'
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
				note: 'The protection rule is the **gate**. Without the approvals and the green required checks, the merge stays blocked. With required reviews on, collaborators can change `main` **only through an approved PR**.'
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
			'The header says it plainly: this file sends **courtesy pings**, it does not decide what can merge. That is CODEOWNERS on its own. It only becomes a gate when a branch protection rule (or a ruleset, GitHub\'s newer form of the same rules) turns on "Require review from Code Owners".',
			'Owners are **teams, never individuals**. People change jobs, teams stay. GitHub also requires each owner, team or person, to have write access to the repository.',
			'Line 13 makes the file own itself: changing who owns what needs the `@nodejs/tsc` team. GitHub\'s docs call a CODEOWNERS in `.github/` that owns itself the most secure setup.',
			'`/BUILDING.md` lists two teams. When code owner review is required, **an approval from any one owner** is enough.',
			'Order matters: the **last matching pattern wins**. Put a catch-all `*` line first and specific paths after it. A line with bad syntax is skipped, and GitHub shows the error when you open the file.'
		]
	},
	tradeoff: {
		gain: [
			'Every change to `main` is reviewed and tested before it lands, not after it breaks.',
			'The discussion is kept next to the diff: six months later you can read why a change was made.',
			'CODEOWNERS sends each change to the people who know that area, without anyone routing by hand.'
		],
		cost: [
			'Waiting for review slows the flow. Keep PRs small: the [Kubernetes guide](https://github.com/kubernetes/community/blob/440e496d3a172234d81728df1bfe43849b589adf/contributors/guide/github-workflow.md#L141) says very large PRs are very difficult to review.',
			'Rules are only as strict as their settings. By default, branch protection does not apply to admins unless you say so.',
			'Branch protection lives in the repository settings, not in a file in Git, so it is easy to forget when you create the next repository.'
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
		]
	},
	quiz: [
		{
			q: 'What does a CODEOWNERS file do on its own, without branch protection?',
			options: [
				'It blocks merges until an owner approves',
				'It gives the owners admin rights on those paths',
				'It stops other people from editing those files',
				'It automatically requests the owners as reviewers on PRs that touch their files'
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
	takeaway: 'A PR puts the diff, CI and review in front of `main`. Branch protection makes it mandatory, and CODEOWNERS sends each change to the people who own that code.',
	sources: [
		{ title: 'GitHub Docs, About pull requests', url: 'https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/about-pull-requests' },
		{ title: 'GitHub Docs, About pull request reviews', url: 'https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/about-pull-request-reviews' },
		{ title: 'GitHub Docs, About protected branches', url: 'https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches' },
		{ title: 'GitHub Docs, About code owners', url: 'https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners' },
		{ title: 'GitLab Docs, Merge requests', url: 'https://docs.gitlab.com/user/project/merge_requests/' }
	]
};
