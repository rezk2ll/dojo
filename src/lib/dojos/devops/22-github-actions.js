const STARTER = 'https://github.com/actions/starter-workflows/blob/e3c451d60f119b71caebf13c98ac45da6e15b4b7';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'github-actions',
	part: 'CI/CD',
	title: 'GitHub Actions: a pipeline in the repo',
	minutes: 10,
	hook: [
		'You have a build server somewhere. A cron job, or a hook, runs `make test` and mails you when it breaks. You patch it, you upgrade it, and you are the only one who knows how it works.',
		'With GitHub Actions, the pipeline is **a YAML file in the repo**, under `.github/workflows/`. GitHub watches for events (a push, a pull request), starts a fresh machine, and runs your steps on it.',
		'Two settings cause trouble early: secrets, and the matrix that runs one job several times.'
	],
	terms: [
		{ term: 'Workflow', def: 'One YAML file in `.github/workflows/`. It says when to run (`on:`) and what to run (`jobs:`).' },
		{ term: 'Job and step', def: 'A job is a list of steps that run in order **on the same runner**. Jobs run in parallel unless one `needs` another.' },
		{ term: 'Runner', def: 'The machine that runs a job. GitHub-hosted runners are fresh virtual machines (Ubuntu, Windows, macOS). You can also host your own.' },
		{ term: 'Matrix', def: 'A list of values that makes GitHub run the same job once per value, like three Node.js versions, without copying the job.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['ev["Event: push or pull_request"] --> wf["Workflow: .github/workflows/node.js.yml"]'],
				highlight: ['ev', 'wf'],
				note: 'An event in the repo, a `push` or a `pull_request`, starts the **workflow**. You install no server and no hook: GitHub reads the file in `.github/workflows/` and nothing else.'
			},
			{
				add: ['wf --> job["Job: build"]', 'job -.->|runs-on| run["Runner: ubuntu-latest VM"]', 'class run ext'],
				highlight: ['job', 'run'],
				note: 'Each job asks for a **runner** with `runs-on`. On a GitHub-hosted runner the job starts on a clean machine, so it cannot depend on leftovers from yesterday\'s build.'
			},
			{
				add: [
					'subgraph steps["Steps, in order, same runner"]',
					's1["uses: actions/checkout"]',
					's2["uses: actions/setup-node"]',
					's3["run: npm ci, npm test"]',
					'end',
					'job --> s1',
					's1 --> s2',
					's2 --> s3'
				],
				highlight: ['s1', 's2', 's3'],
				note: 'The steps share the runner\'s disk, so step 3 sees the code that step 1 checked out. `uses:` calls an **action**, a reusable step someone packaged, like `actions/checkout`. `run:` runs plain shell commands.'
			},
			{
				add: ['mx["Matrix: one job per node-version, 18, 20, 22"]', 'wf --> mx', 'mx -.-> job'],
				highlight: ['mx'],
				note: 'The matrix runs the job three times in parallel, once per Node.js version. By default, if one of them fails, GitHub **cancels the others**.'
			},
			{
				add: ['sec["Secrets: secrets.DEPLOY_KEY"]', 'sec -.-> s3', 'class sec ext'],
				highlight: ['sec'],
				note: 'You store secrets in the repo settings, outside the YAML. A step reads one with `${{ secrets.NAME }}`, and GitHub masks its value in the logs. Masking is best effort: a transformed secret (encoded, or inside JSON) can still leak.'
			}
		]
	},
	example: {
		title: 'ci/node.js.yml',
		repo: 'actions/starter-workflows',
		url: `${STARTER}/ci/node.js.yml#L4-L31`,
		lang: 'yaml',
		code: `name: Node.js CI

on:
  push:
    branches: [ $default-branch ]
  pull_request:
    branches: [ $default-branch ]

jobs:
  build:

    runs-on: ubuntu-latest

    strategy:
      matrix:
        node-version: [18.x, 20.x, 22.x]
        # See supported Node.js release schedule at https://nodejs.org/en/about/releases/

    steps:
    - uses: actions/checkout@v4
    - name: Use Node.js \${{ matrix.node-version }}
      uses: actions/setup-node@v4
      with:
        node-version: \${{ matrix.node-version }}
        cache: 'npm'
    - run: npm ci
    - run: npm run build --if-present
    - run: npm test`,
		notes: [
			'GitHub offers this starter workflow for Node.js projects. On lines 5 and 7, `$default-branch` is a [placeholder](https://github.com/actions/starter-workflows/blob/e3c451d60f119b71caebf13c98ac45da6e15b4b7/README.md?plain=1#L68) that GitHub replaces with your branch name (`main`) when you add the template.',
			'Lines 14 to 16 make **three jobs**, one per Node.js version. [`strategy.fail-fast`](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategyfail-fast) defaults to `true`: if the 18.x job fails, GitHub cancels the 20.x and 22.x jobs still running or queued.',
			'Line 20, `actions/checkout@v4`, points at a **tag**, and the author can move a tag to other code. GitHub\'s [security guide](https://docs.github.com/en/actions/reference/security/secure-use) recommends pinning actions to a full commit SHA, and a tag only if you trust the author. Day 19 pinned images to a digest for the same reason.',
			'Line 25, `cache: \'npm\'`, makes `setup-node` cache npm\'s global package data between runs. Its [README](https://github.com/actions/setup-node/blob/949feb2413d6458794dcd2491c4babbbce0c15c1/README.md?plain=1#L162-L168) says it does not cache `node_modules`. `npm ci` then installs exactly what the lock file says.'
		]
	},
	tradeoff: {
		gain: [
			'No build server to patch: GitHub-hosted runners are fresh machines that someone else maintains.',
			'The pipeline is reviewed in the same pull request as the code it tests.',
			'Ready-made actions cover the common steps (checkout, language setup, cloud logins), so you write less shell.'
		],
		cost: [
			'Every `uses:` runs someone else\'s code with your token and secrets. You have to choose each action and pin it to a commit.',
			'The workflow syntax works only on GitHub. Moving to GitLab or Jenkins means rewriting the pipeline.',
			'A clean machine per run means nothing is cached unless you ask for it, so slow installs come back on every run.'
		]
	},
	task: {
		prompt: 'Add a `deploy` job to this workflow. It must run only after **all** matrix jobs pass, only on pushes to `main` (never on pull requests), and it needs an SSH key called `DEPLOY_KEY`. Write the key lines and say where the key lives.',
		hint: 'Look up `needs`, `if` and the `secrets` context. Think about what a pull request from a fork should be allowed to touch.',
		answer: [
			'`needs: build`: the job waits for the build job, including every matrix copy, and is skipped if any of them fails.',
			'`if: github.event_name == \'push\' && github.ref == \'refs/heads/main\'`: a pull request never deploys.',
			'The key lives in the repo settings as a secret, never in the YAML. The step reads it with `env: DEPLOY_KEY: ${{ secrets.DEPLOY_KEY }}`.',
			'Bonus: GitHub does not pass secrets (apart from `GITHUB_TOKEN`, which is read-only there) to workflows triggered from a fork. A stranger\'s pull request cannot read your deploy key. The `pull_request_target` event is the exception: it runs in your repo\'s context, with your secrets, so never build the pull request\'s code in it.'
		]
	},
	quiz: [
		{
			q: 'In GitHub Actions, what is a runner?',
			options: [
				'The YAML file in `.github/workflows/`',
				'The machine that executes a job',
				'A reusable step from the Marketplace',
				'The event that starts a workflow'
			],
			answer: 1,
			why: 'The workflow is the file, the event starts it, an action is a reusable step. The runner is the machine (GitHub-hosted or your own) where a job\'s steps actually run.'
		},
		{
			q: 'A matrix runs the same job on Node.js 18, 20 and 22. The workflow does not set `fail-fast`. The 18 job fails while the other two are still running. What happens?',
			options: [
				'The other two keep running, and the workflow is marked as passed',
				'GitHub cancels the jobs still running or queued in that matrix',
				'GitHub retries the 18 job three times',
				'The other two finish, then the 18 job is restarted'
			],
			answer: 1,
			why: '`strategy.fail-fast` defaults to `true`. One failed matrix job cancels the rest. Set it to `false` when you want every result, for example to see which versions break.'
		},
		{
			q: 'Someone opens a pull request from a fork of your repo. Your workflow runs on `pull_request` and reads `secrets.DEPLOY_KEY`. What does the job get?',
			options: [
				'The real key, because the workflow file in your repo is the one that runs',
				'The real key, but GitHub masks it as *** wherever it shows up in the logs',
				'No value: secrets other than `GITHUB_TOKEN` are not passed to runs from a fork',
				'An error that fails the workflow before its first step even starts'
			],
			answer: 2,
			why: 'GitHub does not send your secrets to a run started from a forked repository. Otherwise anyone could open a pull request that prints them.'
		}
	],
	recall: {
		q: 'In the Node.js starter workflow, the 18.x matrix job fails. What happens to the 20.x and 22.x jobs, and which setting controls it?',
		a: 'GitHub cancels them if they are still running or queued, because `strategy.fail-fast` defaults to `true`. Set it to `false` to get every result.'
	},
	sources: [
		{ title: 'GitHub docs, Understanding GitHub Actions', url: 'https://docs.github.com/en/actions/get-started/understand-github-actions' },
		{ title: 'GitHub docs, Workflow syntax for GitHub Actions', url: 'https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax' },
		{ title: 'GitHub docs, Using secrets in GitHub Actions', url: 'https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets' },
		{ title: 'GitHub docs, Running variations of jobs in a workflow (matrix)', url: 'https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/run-job-variations' },
		{ title: 'actions/starter-workflows, ci/node.js.yml', url: `${STARTER}/ci/node.js.yml` }
	]
};
