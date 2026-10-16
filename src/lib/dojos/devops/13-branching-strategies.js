const SW = 'https://github.com/actions/starter-workflows/blob/e3c451d60f119b71caebf13c98ac45da6e15b4b7';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'branching-strategies',
	part: 'Git',
	title: 'Trunk-based development vs GitFlow',
	minutes: 10,
	hook: [
		'At an old job, a release was a weekend. Three months of work sat on a `develop` branch. Then a code freeze, a big merge, and a week of fixing what the merge broke.',
		'A **branching strategy** is the team rule for which branches exist, how long they live, and how code reaches production. Git does not care. Your team has to.',
		'Two well-known answers. **GitFlow**: several long-lived branches and planned releases. **Trunk-based development**: one main branch, and everybody merges into it at least once a day. DORA\'s research ties the second one to better delivery.'
	],
	terms: [
		{ term: 'Trunk', def: 'The one shared branch everybody merges into, usually `main`.' },
		{ term: 'Trunk-based development', def: 'Small changes merged into the trunk at least once a day, on short-lived branches or straight to the trunk.' },
		{ term: 'Short-lived branch', def: 'A branch that lives hours, at most a day or two, then merges and is deleted.' },
		{ term: 'GitFlow', def: 'A 2010 model with two permanent branches, `master` (often renamed `main` today) and `develop`, plus feature, release and hotfix branches.' },
		{ term: 'Feature flag', def: 'A switch in the code that turns a feature on or off without a deploy. A release toggle hides unfinished work.' },
		{ term: 'Code freeze', def: 'A period when nobody may merge, so the release can be stabilized. A sign of long-lived branches.' }
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
				note: 'In GitFlow, features merge into `develop`. A release branch is cut from `develop`, stabilized, then merged to `main`. Hotfixes branch from `main`. `develop` and `main` live **forever**, and each release is an event.'
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
				note: 'The trunk is always releasable. A feature that takes three weeks still merges every day, hidden behind a **feature flag** that stays off until it is done.'
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
			'This is GitHub\'s starter CI for Go. It watches **one** branch, the default branch. That is the trunk-based shape: one trunk, short branches into it.',
			'`pull_request` runs the tests on each pull request into the trunk, before the merge. `push` runs them again on the trunk after the merge. The trunk has to stay green, because everybody builds on it every day.',
			'`$default-branch` is a template placeholder. The [starter-workflows README](https://github.com/actions/starter-workflows/blob/e3c451d60f119b71caebf13c98ac45da6e15b4b7/README.md#L68) says GitHub replaces it with your repository\'s default branch, like `main`.',
			'With GitFlow you would also have to list `develop` and the release branches, and keep each of them green. More branches, more pipelines to watch.'
		]
	},
	tradeoff: {
		gain: [
			'Small daily merges: conflicts are small, and you find them the same day.',
			'No code freeze and no integration phase. DORA\'s research links dropping both to better delivery.',
			'The trunk is always releasable, so a deploy is a normal day, not a weekend.'
		],
		cost: [
			'It needs fast, trusted automated tests. A broken trunk blocks everybody.',
			'Feature flags add code paths to test, and each one has to be removed later. Fowler calls them inventory with a carrying cost.',
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
			why: 'One long-lived branch, small changes, merged daily. Review and CI still happen, they are just fast and frequent.'
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
	takeaway: 'Keep one trunk, merge small changes into it every day, and hide unfinished work behind feature flags. Long-lived branches belong only where you really ship several versions.',
	sources: [
		{ title: 'DORA, Trunk-based development', url: 'https://dora.dev/capabilities/trunk-based-development/' },
		{ title: 'trunkbaseddevelopment.com', url: 'https://trunkbaseddevelopment.com/' },
		{ title: 'Vincent Driessen, A successful Git branching model (with the 2020 note)', url: 'https://nvie.com/posts/a-successful-git-branching-model/' },
		{ title: 'Martin Fowler, Feature Toggles', url: 'https://martinfowler.com/articles/feature-toggles.html' },
		{ title: 'Martin Fowler, Patterns for Managing Source Code Branches', url: 'https://martinfowler.com/articles/branching-patterns.html' }
	]
};
