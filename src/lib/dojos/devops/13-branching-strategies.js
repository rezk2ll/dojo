const SW = 'https://github.com/actions/starter-workflows/blob/e3c451d60f119b71caebf13c98ac45da6e15b4b7';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'branching-strategies',
	part: 'Git',
	title: 'Trunk-based development vs GitFlow',
	minutes: 10,
	hook: [
		'At an old job, a release was a weekend. Three months of work sat on a `develop` branch. Then a code freeze, a big merge, and a week of fixing what the merge broke.',
		'A **branching strategy** is the team rule for which branches exist, how long they live, and how code reaches production.',
		'GitFlow uses several long-lived branches and planned releases. In **trunk-based development**, everybody merges small changes into one main branch at least once a day. DORA\'s research ties trunk-based development to better delivery.'
	],
	terms: [
		{ term: 'Trunk', def: 'The one shared branch everybody merges into, usually `main`.' },
		{ term: 'Short-lived branch', def: 'A branch that lives hours, at most a day or two, then merges and is deleted.' },
		{ term: 'GitFlow', def: 'A 2010 model with two permanent branches, `master` (often renamed `main` today) and `develop`, plus feature, release and hotfix branches.' },
		{ term: 'Feature flag', def: 'A switch in the code that turns a feature on or off without a deploy. A release toggle hides unfinished work.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: [
					'subgraph gf["GitFlow"]',
					'gfeat["feature/x"] --> gdev["develop"]',
					'gdev --> grel["release/1.2"] --> gmain["main: production"]',
					'ghot["hotfix/1.2.1"] --> gmain',
					'end'
				],
				highlight: ['gdev', 'gmain'],
				note: 'In GitFlow, features merge into `develop`. A release branch is cut from `develop`, stabilized, then merged to `main`. Hotfixes branch from `main`. `develop` and `main` live **forever**.'
			},
			{
				add: [
					'subgraph tb["Trunk-based"]',
					'tb1["short branch, under a day"] -->|"PR and CI"| trunk["main, the trunk"]',
					'tb2["another short branch"] -->|"PR and CI"| trunk',
					'end'
				],
				highlight: ['tb1', 'tb2', 'trunk'],
				note: 'In trunk-based development there is **one** long-lived branch. Each change is small, reviewed, tested by CI and merged the same day. Conflicts stay small because nobody drifts far.'
			},
			{
				add: [
					'trunk -->|"any green commit"| prod["production"]',
					'flag["feature flag: off"] -.-> prod'
				],
				highlight: ['prod', 'flag'],
				note: 'Any commit on `main` with green CI can go to production. A feature that takes three weeks still merges every day, hidden behind a **feature flag** that stays off until it is done.'
			}
		]
	},
	example: {
		title: 'ci/go.yml',
		repo: 'actions/starter-workflows',
		url: `${SW}/ci/go.yml#L4-L28`,
		lang: 'yaml',
		code: `name: Go

on:
  push:
    branches: [ $default-branch ]
  pull_request:
    branches: [ $default-branch ]

jobs:

  build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4

    - name: Set up Go
      uses: actions/setup-go@v4
      with:
        go-version: '1.20'

    - name: Build
      run: go build -v ./...

    - name: Test
      run: go test -v ./...`,
		notes: [
			'GitHub\'s starter CI for Go. Lines 3 to 7 watch **one** branch, the default branch, which is the trunk in trunk-based development.',
			'Line 6 (`pull_request`) runs the tests on each pull request into the trunk, before the merge. Line 4 (`push`) runs them again on the trunk after the merge. Everybody branches from the trunk every day, so a red trunk blocks them all.',
			'Lines 5 and 7: `$default-branch` is a template placeholder. The [starter-workflows README](https://github.com/actions/starter-workflows/blob/e3c451d60f119b71caebf13c98ac45da6e15b4b7/README.md#L68) says GitHub replaces it with your repository\'s default branch, like `main`.',
			'With GitFlow, lines 5 and 7 would also list `develop` and the release branches, and each of them needs green CI.'
		]
	},
	tradeoff: {
		gain: [
			'Small daily merges: conflicts are small, and you find them the same day.',
			'DORA\'s research links dropping the code freeze and the integration phase to better delivery.',
			'Any green commit on the trunk can be released, so you deploy on any day without a release weekend.'
		],
		cost: [
			'Every merge relies on fast, trusted automated tests, because a broken trunk blocks everybody.',
			'Feature flags add code paths to test. Fowler calls them inventory with a carrying cost: each flag costs work until someone removes it.',
			'If you must support several released versions at once, you still need release branches. GitFlow\'s author says it fits that case.'
		]
	},
	task: {
		prompt: 'Your team: 6 developers, one web app. Releases every two months from `develop` through a `release/*` branch, with a one-week code freeze. One feature (a new billing page) will take three weeks. Plan the move to trunk-based development in 4 steps.',
		hint: 'One long-lived branch. Small merges every day. Unfinished work merged but switched off. Measure it.',
		answer: [
			'Make `main` the trunk. Merge `develop` into it one last time, then delete `develop`.',
			'New rule: branches live less than a day, merge through a pull request with CI green. DORA\'s guidance: merge to trunk at least once a day.',
			'Billing page: merge it in small pieces behind a feature flag that is off. Turn it on when it is done, then **delete the flag**.',
			'Deploy from `main`, no freeze. Keep a release branch only if you must patch an old version. Track the number of active branches: DORA says three or fewer.'
		],
		steps: [
			{
				title: 'Pick the trunk',
				questions: [
					{ q: 'Which branch becomes the trunk?', options: ['`develop`, since all features already merge there', '`main`', 'A new `trunk` branch next to `develop`', 'The current `release/*` branch'], answer: 1, why: 'The trunk is the one shared branch everybody merges into, usually `main`.' },
					{ q: 'What do you do with `develop`?', options: ['Merge it into `main` one last time, then delete it', 'Keep it as a backup of `main`', 'Rename it to `main` and delete the old `main`', 'Freeze it until the billing page is done'], answer: 0, why: 'Trunk-based development has **one** long-lived branch. Keeping `develop` keeps two.' },
					{ q: 'Why does a long-lived `develop` hurt this team today?', options: ['GitHub cannot run CI on it', 'It needs more disk on the server', 'Work drifts for weeks, so the release merge is big and breaks things', 'Only one developer can push to it'], answer: 2, why: 'Two months on `develop` end in a big merge and days of fixing. Small daily merges keep conflicts small.' },
					{ q: 'Which branches does the CI workflow watch once you switch?', options: ['`develop` and every `release/*` branch', 'Every feature branch, on push only', 'Only branches whose name starts with `feature/`', 'The trunk, on push and on pull requests into it'], answer: 3, why: 'The starter workflow watches one branch, the default branch. With GitFlow it would also list `develop` and the release branches.' }
				]
			},
			{
				title: 'Set the branch rule',
				questions: [
					{ q: 'How long may a branch live under the new rule?', options: ['Until the feature is finished', 'Less than a day', 'One sprint', 'Until the next release'], answer: 1, why: 'A short-lived branch lives hours, at most a day or two, then merges and is deleted.' },
					{ q: 'How often should each developer merge into the trunk, per DORA?', options: ['Once a week', 'Once per release', 'Only when a feature is complete', 'At least once a day'], answer: 3, why: 'DORA\'s guidance is to merge to trunk at least once a day.' },
					{ q: 'How does a change get into `main`?', options: ['Through a pull request, with CI green', 'By a direct push, to save time', 'Through `develop`, as before', 'Once a week, in a batch'], answer: 0, why: 'Review and CI still run on every pull request. Trunk-based does not mean skipping them.' },
					{ q: 'What must the team trust before daily merges are safe?', options: ['A long manual test phase', 'A weekly code freeze', 'Fast automated tests they believe', 'One person who approves every merge'], answer: 2, why: 'Every merge relies on fast, trusted tests, because a broken trunk blocks everybody.' }
				]
			},
			{
				title: 'Ship the billing page dark',
				questions: [
					{ q: 'The billing page takes three weeks. How does its code reach `main`?', options: ['On one feature branch, merged after three weeks', 'In small pieces every day, behind a feature flag that is off', 'On `develop`, merged at the next release', 'Directly to production, visible to users'], answer: 1, why: 'The work merges daily so the branch stays short. The flag keeps users from seeing it.' },
					{ q: 'What does the flag being off mean in production?', options: ['The code is not deployed at all', 'The tests for it are skipped', 'Only the billing team can deploy', 'The code is deployed but users do not see it'], answer: 3, why: 'A release toggle lets incomplete code ship to production as latent code. The flag decides what users see.' },
					{ q: 'The page is done and the flag is on. What is left?', options: ['Delete the flag', 'Keep the flag forever, in case', 'Add a second flag for the next version', 'Cut a release branch for the page'], answer: 0, why: 'Fowler calls flags inventory with a carrying cost. Each one costs work until someone removes it.' },
					{ q: 'Why not test only the "flag on" path?', options: ['Because flags are removed before deploy', 'Because CI cannot read flags', 'Because a flag adds code paths, and both run in production', 'Because the flag only exists on the branch'], answer: 2, why: 'Flags add code paths to test. Until the flag goes, both paths are real.' }
				]
			},
			{
				title: 'Deploy and measure',
				questions: [
					{ q: 'Which commit can go to production?', options: ['Only a commit on a `release/*` branch', 'Only a commit after a code freeze', 'Only a tagged commit on `develop`', 'Any commit on `main` with green CI'], answer: 3, why: 'In trunk-based development any green commit on the trunk can be released, so you deploy on any day.' },
					{ q: 'What happens to the one-week code freeze?', options: ['It moves to the day before each deploy', 'It goes away', 'It becomes two weeks to be safe', 'It applies only to the billing page'], answer: 1, why: 'DORA\'s research links dropping the code freeze and the integration phase to better delivery.' },
					{ q: 'When do you still keep a release branch?', options: ['When you must patch an old released version', 'For every deploy, out of habit', 'When a feature takes more than a week', 'When CI is slow'], answer: 0, why: 'Supporting several released versions at once still needs release branches. That is the case GitFlow\'s author says it fits.' },
					{ q: 'Which number do you track to see the move is working?', options: ['The number of tags', 'Lines of code per developer', 'The number of active branches, three or fewer', 'The length of the code freeze'], answer: 2, why: 'DORA suggests tracking active branches. Three or fewer means nobody drifts far from the trunk.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'What does trunk-based development ask of every developer?',
			options: [
				'Keep a personal branch for each release',
				'Push straight to production without review or tests',
				'Merge small changes into the one shared trunk at least once a day',
				'Work on `develop` and merge to `main` once per release'
			],
			answer: 2,
			why: 'Each change is small and merged the same day into the one long-lived branch. Review and CI still run on every pull request.'
		},
		{
			q: 'Unfinished code is merged into `main`, but users must not see it yet. What hides it?',
			options: [
				'A long-lived feature branch',
				'A feature flag that is off',
				'A code freeze',
				'A lightweight tag'
			],
			answer: 1,
			why: 'A release toggle lets incomplete code ship to production as latent code. The branch stays short, and the flag decides what users see.'
		},
		{
			q: 'In his 2020 note, when does GitFlow\'s author say it still fits?',
			options: [
				'Software that is explicitly versioned, or with several versions supported in the wild',
				'A web app deployed many times a day, where each release needs its own branch',
				'Any team that hosts its code on GitHub and reviews changes with pull requests',
				'A team with no automated tests, which needs long manual release phases'
			],
			answer: 0,
			why: 'For continuously delivered web apps he suggests a simpler flow. GitFlow is for explicitly versioned software, or when you support several versions at once.'
		}
	],
	recall: {
		q: 'A feature takes three weeks. In trunk-based development, how does its work reach `main` without users seeing it?',
		a: 'You merge it into `main` in small pieces at least once a day, behind a feature flag that stays off until the feature is done. Then you delete the flag.'
	},
	sources: [
		{ title: 'DORA, Trunk-based development', url: 'https://dora.dev/capabilities/trunk-based-development/' },
		{ title: 'trunkbaseddevelopment.com', url: 'https://trunkbaseddevelopment.com/' },
		{ title: 'Vincent Driessen, A successful Git branching model (with the 2020 note)', url: 'https://nvie.com/posts/a-successful-git-branching-model/' },
		{ title: 'Martin Fowler, Feature Toggles', url: 'https://martinfowler.com/articles/feature-toggles.html' },
		{ title: 'Martin Fowler, Patterns for Managing Source Code Branches', url: 'https://martinfowler.com/articles/branching-patterns.html' }
	]
};
