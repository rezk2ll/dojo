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
		],
		steps: [
			{
				title: 'Wait for the matrix',
				questions: [
					{ q: 'Which key makes `deploy` wait for the build job?', options: ['`runs-on: build`', '`strategy: build`', '`needs: build`', '`uses: build`'], answer: 2, why: '`needs` orders jobs. `runs-on` picks a runner and `uses` calls an action.' },
					{ q: 'The build job has a matrix of three Node.js versions. What does `needs: build` wait for?', options: ['Every matrix copy of the build job', 'Only the first copy to finish', 'Only the 22.x copy', 'Nothing: matrix copies count as separate workflows'], answer: 0, why: 'The matrix makes three jobs under one job id. `needs` waits for all of them.' },
					{ q: 'The 18.x copy fails. What does `deploy` do?', options: ['It runs with the 20.x and 22.x results', 'It waits for someone to rerun 18.x', 'It runs, marked with a warning', 'It is skipped'], answer: 3, why: 'A job is skipped when a job it `needs` fails.' },
					{ q: 'Without `needs`, when would `deploy` start?', options: ['After the build jobs anyway, because it is lower in the file', 'Right away, in parallel with the build jobs', 'Never, because it has no trigger', 'Only after the whole workflow ends'], answer: 1, why: 'Jobs run in parallel unless one `needs` another. The order in the file does not matter.' }
				]
			},
			{
				title: 'Limit it to main',
				questions: [
					{ q: 'Which line keeps `deploy` to pushes on `main`?', options: ['`if: github.event_name == \'push\' && github.ref == \'refs/heads/main\'`', '`if: github.event_name == \'pull_request\'`', '`if: github.ref == \'main\' || github.event_name == \'push\'`', '`if: matrix.node-version == \'22.x\'`'], answer: 0, why: 'Both checks must hold: the event is a push, and the ref is the `main` branch.' },
					{ q: 'Why not just remove `pull_request` from the workflow\'s `on:`?', options: ['GitHub refuses a workflow with only `push`', 'Secrets need a `pull_request` trigger', 'The build and tests still have to run on pull requests', 'The matrix only works on pull requests'], answer: 2, why: 'You want every pull request tested. Only the `deploy` job is limited.' },
					{ q: 'Someone pushes to a branch called `feature-x`. Does `deploy` run?', options: ['Yes, it is a push', 'Yes, but without secrets', 'Only if all matrix jobs pass', 'No: the ref is not `refs/heads/main`'], answer: 3, why: 'The event check passes, the branch check fails, so the `if` is false.' },
					{ q: 'Where does the `if` go?', options: ['On the `deploy` job, next to `needs`', 'Inside the build job\'s matrix', 'On the `actions/checkout` step', 'Under the workflow\'s `on:` key'], answer: 0, why: 'A job-level `if` decides whether that one job runs. The build jobs are not affected.' }
				]
			},
			{
				title: 'Store the key',
				questions: [
					{ q: 'Where does `DEPLOY_KEY` live?', options: ['In the YAML, under `env:`', 'In the repo settings, as a secret', 'In a file committed under `.github/`', 'In the runner image'], answer: 1, why: 'Secrets live in the repo settings, outside the YAML, so the key is never in the code.' },
					{ q: 'How does the deploy step read the key?', options: ['`run: cat DEPLOY_KEY`', '`with: secrets.DEPLOY_KEY`', '`uses: secrets/DEPLOY_KEY`', '`env: DEPLOY_KEY: ${{ secrets.DEPLOY_KEY }}`'], answer: 3, why: 'The `secrets` context holds the value. `env:` hands it to the step\'s shell.' },
					{ q: 'The key ends up in a log line. What does GitHub do?', options: ['It masks the value, on a best effort basis', 'It deletes the whole log', 'It fails the job and rotates the key', 'Nothing: logs show secrets as they are'], answer: 0, why: 'GitHub masks secrets in logs. A transformed secret (encoded, or inside JSON) can still leak.' },
					{ q: 'Why not paste the key into the workflow file?', options: ['YAML cannot hold multi-line strings', 'Anyone who can read the repo could read the key', 'The runner deletes YAML values before it starts', 'GitHub rejects files longer than a key'], answer: 1, why: 'The workflow is code in the repo. Secrets stay in the settings so the code can be shared and reviewed.' }
				]
			},
			{
				title: 'Check the forks',
				questions: [
					{ q: 'A stranger opens a pull request from a fork. What does `secrets.DEPLOY_KEY` hold in that run?', options: ['The real key', 'The real key, shown as ***', 'No value', 'An error before the first step'], answer: 2, why: 'GitHub does not pass secrets to runs from a fork.' },
					{ q: 'Which token does a run from a fork still get?', options: ['`DEPLOY_KEY`, made read-only', '`GITHUB_TOKEN`, read-only there', 'Every secret, made read-only', 'None at all'], answer: 1, why: '`GITHUB_TOKEN` is the one exception, and it is read-only for a fork.' },
					{ q: 'The `pull_request_target` event runs in your repo\'s context, with your secrets. What must you never do in it?', options: ['Read `GITHUB_TOKEN`', 'Use a matrix', 'Run on `ubuntu-latest`', 'Build the pull request\'s code'], answer: 3, why: 'The pull request\'s code would run next to your secrets and could print them.' },
					{ q: 'Why does GitHub hold secrets back from fork runs?', options: ['Otherwise anyone could open a pull request that prints them', 'Fork runs are too slow to use secrets', 'Forks always run on self-hosted runners', 'Masking does not work in forks'], answer: 0, why: 'A pull request can change the workflow steps. Without this rule, one `echo` would leak your key.' }
				]
			}
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
	lab: {
		minutes: 25,
		goal: 'Run a workflow with a matrix, a gated `deploy` job and a secret on your laptop, with `act` and Docker.',
		steps: [
			'Install [act](https://github.com/nektos/act), which runs GitHub workflows in local Docker containers: `brew install act` on macOS, or unpack `act_Linux_x86_64.tar.gz` from its releases page.',
			'Make a repo: `mkdir -p ~/gha-lab/.github/workflows && cd ~/gha-lab && git init -b main`.',
			'Write `.github/workflows/ci.yml`: `on: [push, pull_request]`, a `build` job with a matrix `version: [18, 20, 22]` and one step `run: echo "testing on $VERSION"` (with `env: VERSION: ${{ matrix.version }}`), and a `deploy` job with the `needs`, `if` and secret lines from the task. Its step runs `echo "key is $DEPLOY_KEY"`. Commit it.',
			'Run `act push -P ubuntu-latest=node:24-slim --secret DEPLOY_KEY=s3cr3t`, then the same with `act pull_request`.',
			'Make the 18 copy fail: change the build step to `run: test "$VERSION" != 18` and run the same `act push` command again, with its `-P` and `--secret` flags.'
		],
		done: [
			'The push run prints `testing on 18`, `20` and `22`, then `key is ***`: the value is masked.',
			'The `pull_request` run shows only the three build jobs. `deploy` never appears.',
			'With the 18 copy failing, act ends with `Error: Job \'build\' failed` and `deploy` does not start.'
		],
		solution: [
			'`deploy:` then `needs: build`, `if: github.event_name == \'push\' && github.ref == \'refs/heads/main\'`, `runs-on: ubuntu-latest`.',
			'Its step: `- run: echo "key is $DEPLOY_KEY"` with `env:` then `DEPLOY_KEY: ${{ secrets.DEPLOY_KEY }}`.',
			'`-P ubuntu-latest=node:24-slim` maps the runner label to a small image that has `bash`. On GitHub the same file runs on a real Ubuntu VM.',
			'On GitHub the value comes from the repo settings. `--secret` is act\'s stand-in for that page.'
		]
	},
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
