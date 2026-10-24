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
					{ q: 'All 6 developers follow DORA\'s guidance. How many merges into `main` does a normal working day bring?', options: ['About one, from whoever finishes first', 'One per sprint, from the whole team', 'None until the billing page is done', 'At least six, one or more per developer'], answer: 3, why: 'DORA\'s guidance is that each developer merges to trunk at least once a day, so six people make at least six small merges.' },
					{ q: 'How does a change get into `main`?', options: ['Through a pull request, with CI green', 'By a direct push, to save time', 'Through `develop`, as before', 'Once a week, in a batch'], answer: 0, why: 'Review and CI still run on every pull request. Trunk-based does not mean skipping them.' },
					{ q: 'What must the team trust before daily merges are safe?', options: ['A long manual test phase', 'A weekly code freeze', 'Fast automated tests they believe', 'One person who approves every merge'], answer: 2, why: 'Every merge relies on fast, trusted tests, because a broken trunk blocks everybody.' }
				]
			},
			{
				title: 'Ship the billing page dark',
				questions: [
					{ q: 'Which kind of feature flag hides the half-built billing page?', options: ['A permission flag for admins', 'A release toggle', 'A kill switch for outages', 'A branch protection rule'], answer: 1, why: 'A release toggle is the flag that hides unfinished work while its code already sits in `main`.' },
					{ q: 'The billing page is ready. How do users get it?', options: ['You merge `feature/billing` into `main`', 'You cut a `release/*` branch for it', 'You wait for the next two-month release', 'Someone turns the flag on, without a new deploy'], answer: 3, why: 'A feature flag turns a feature on or off without a deploy. The code has been in production for weeks already.' },
					{ q: 'Six months later the billing flag is still in the code, always on. What does it cost?', options: ['Work: an extra code path to keep and test until someone removes it', 'Nothing, since it is always on', 'A slower deploy, since flags block CI', 'A long-lived branch, since flags live on branches'], answer: 0, why: 'Fowler calls flags inventory with a carrying cost. Each one costs work until someone removes it.' },
					{ q: 'Why not test only the "flag on" path?', options: ['Because flags are removed before deploy', 'Because CI cannot read flags', 'Because a flag adds code paths, and both run in production', 'Because the flag only exists on the branch'], answer: 2, why: 'Flags add code paths to test. Until the flag goes, both paths are real.' }
				]
			},
			{
				title: 'Deploy and measure',
				questions: [
					{ q: 'Which commit can go to production?', options: ['Only a commit on a `release/*` branch', 'Only a commit after a code freeze', 'Only a tagged commit on `develop`', 'Any commit on `main` with green CI'], answer: 3, why: 'In trunk-based development any green commit on the trunk can be released, so you deploy on any day.' },
					{ q: 'What happens to the one-week code freeze?', options: ['It moves to the day before each deploy', 'It goes away', 'It becomes two weeks to be safe', 'It applies only to the billing page'], answer: 1, why: 'DORA\'s research links dropping the code freeze and the integration phase to better delivery.' },
					{ q: 'This team runs one web app, and users only ever see the version in production. Does it keep `release/*` branches?', options: ['No: there is no older released version to patch', 'Yes, one per deploy, as before', 'Yes, but only for the billing page', 'Only while a feature flag is off'], answer: 0, why: 'Release branches are for patching old versions that are still in use. A single web app has only the version on `main` in production.' },
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
	lab: {
		minutes: 15,
		goal: 'Pay for a long-lived branch once, then ship unfinished work to the trunk behind a flag that is off, and remove the flag when it is done.',
		steps: [
			'Make a repo where a long-lived branch rewrites every line while `main` moves on too: `mkdir -p ~/branch-lab/long && cd ~/branch-lab/long && git init -q -b main && seq 1 10 > app.txt && git add app.txt && git commit -qm start`, then `git switch -c feature/billing && seq 1 10 | sed \'s/$/ billing/\' > app.txt && git commit -qam "billing, three weeks"`, then `git switch main && seq 1 10 | sed \'s/$/ hotfix/\' > app.txt && git commit -qam "fixes on main"`.',
			'Merge it at the end, as in GitFlow: `git merge feature/billing`. Count the lines you would have to read to resolve it with `sed -n \'/^<<<<<<</,/^>>>>>>>/p\' app.txt | wc -l`, then back out with `git merge --abort`.',
			'Start a trunk-based repo and a short branch: `mkdir -p ~/branch-lab/trunk && cd ~/branch-lab/trunk && git init -q -b main && git commit -q --allow-empty -m start && git switch -c billing-flag`. Write `app.sh`: it prints `billing v1`, or `billing v2 (unfinished)` when `BILLING_V2=on`.',
			'Merge it the same day and delete the branch: `git add app.sh && git commit -qm "billing v2 behind a flag, off" && git switch main && git merge --ff-only billing-flag && git branch -d billing-flag`. Run `bash app.sh`, then `BILLING_V2=on bash app.sh`.',
			'The feature is done, so remove the flag through another short branch: `git switch -c remove-flag`, make `app.sh` print only `billing v2`, commit, then `git switch main && git merge --ff-only remove-flag && git branch -d remove-flag`.'
		],
		done: [
			'Step 2 counts 23 lines: all 10 lines twice, plus three markers.',
			'From the same commit on `main`, `bash app.sh` prints `billing v1` and `BILLING_V2=on bash app.sh` prints `billing v2 (unfinished)`.',
			'After step 5, `app.sh` has no `if`, `git branch` lists only `main`, and `git log --oneline` shows three small commits.'
		],
		solution: [
			'Both branches changed the same 10 lines while apart, so Git cannot pick a side. The longer a branch lives, the more lines both sides touch. Short branches keep that number near zero.',
			'`app.sh`: `if [ "${BILLING_V2:-off}" = on ]; then echo "billing v2 (unfinished)"; else echo "billing v1"; fi`.',
			'The unfinished code was on `main` and could be deployed, but users would see v1. The flag decided what users see, not the branch.',
			'Step 5 pays the carrying cost Fowler warns about: until you delete it, the flag doubles the paths to test. Clean up with `rm -rf ~/branch-lab`.'
		]
	},
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
