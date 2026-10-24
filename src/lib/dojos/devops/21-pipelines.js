const GITLAB = 'https://github.com/gitlabhq/gitlabhq/blob/b795e7ababc193e9fe85de324f8dc3bb79d2ea90';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'pipelines',
	part: 'CI/CD',
	title: 'Pipelines: running the deploy runbook on every push',
	minutes: 10,
	hook: [
		'You know this deploy. You ssh into the server, `git pull`, run the tests if you remember, restart the service, and watch the logs. It works when you do every step, in the right order.',
		'A **pipeline** is that runbook written as code, and a machine runs it on every push. It runs the same steps in the same order each time. When one step fails, the pipeline stops before the broken code reaches any server.',
		'The pipeline has stages, it passes artifacts from one stage to the next, and it stops at the first failure. Where a human approves the release decides between continuous delivery and continuous deployment.'
	],
	terms: [
		{ term: 'Stage', def: 'One step of the pipeline, like build, test or deploy. Jobs in the same stage can run in parallel. The next stage waits for this one to pass.' },
		{ term: 'Artifact', def: 'A file a job produces and hands to later jobs: a binary, a tarball, a test report.' },
		{ term: 'Continuous delivery', def: 'Every change that passes the pipeline **could** go to production at any time. A human decides when.' },
		{ term: 'Continuous deployment', def: 'Every change that passes the pipeline goes to production, with no human in between.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['push["git push"] --> build["Build: compile once"]'],
				highlight: ['push', 'build'],
				note: 'A push starts the pipeline. The first stage builds the code **once**. You used to run this step by hand on the server.'
			},
			{
				add: [
					'subgraph tst["Test stage"]',
					'unit["Unit tests"]',
					'lint["Lint"]',
					'end',
					'build --> unit',
					'build --> lint'
				],
				highlight: ['unit', 'lint'],
				note: 'Jobs in the same stage run **in parallel**. Put the fast checks early, so a lint error shows up after seconds, before the full test suite has run.'
			},
			{
				add: [
					'art[("Artifact: app-1.4.2.tar.gz")]',
					'build -.-> art',
					'unit --> stg["Deploy to staging"]',
					'lint --> stg',
					'art -.-> stg'
				],
				highlight: ['art', 'stg'],
				note: 'The pipeline saves the build output as an artifact, `app-1.4.2.tar.gz`. Staging gets that exact file, and nothing is built again. Production later gets the same file that the tests ran against.'
			},
			{
				add: ['stg --> gate["Approval: a human clicks"]', 'gate --> prod["Deploy to production"]'],
				highlight: ['gate', 'prod'],
				note: 'With the approval button, this is **continuous delivery**: every green change is ready, and a human picks when it goes out. Remove the button and every green change goes to production, which is continuous deployment.'
			},
			{
				add: ['stop["Lint fails: later stages never start"]', 'lint -.-> stop', 'class stop ext'],
				highlight: ['stop'],
				note: 'When one job fails, the pipeline stops (fail fast). No later stage runs, so a broken change never reaches staging or production.'
			}
		]
	},
	example: {
		title: 'lib/gitlab/ci/templates/Getting-Started.gitlab-ci.yml',
		repo: 'gitlabhq/gitlabhq',
		url: `${GITLAB}/lib/gitlab/ci/templates/Getting-Started.gitlab-ci.yml#L18-L48`,
		lang: 'yaml',
		code: `stages:          # List of stages for jobs, and their order of execution
  - build
  - test
  - deploy

build-job:       # This job runs in the build stage, which runs first.
  stage: build
  script:
    - echo "Compiling the code..."
    - echo "Compile complete."

unit-test-job:   # This job runs in the test stage.
  stage: test    # It only starts when the job in the build stage completes successfully.
  script:
    - echo "Running unit tests... This will take about 60 seconds."
    - sleep 60
    - echo "Code coverage is 90%"

lint-test-job:   # This job also runs in the test stage.
  stage: test    # It can run at the same time as unit-test-job (in parallel).
  script:
    - echo "Linting code... This will take about 10 seconds."
    - sleep 10
    - echo "No lint issues found."

deploy-job:      # This job runs in the deploy stage.
  stage: deploy  # It only runs when *both* jobs in the test stage complete successfully.
  environment: production
  script:
    - echo "Deploying application..."
    - echo "Application successfully deployed."`,
		notes: [
			'GitLab ships this file as its starter pipeline. The `echo` lines stand in for real commands. You replace them with your build, test and deploy commands, and keep the stages and jobs as they are.',
			'Lines 1 to 4 set the order of the stages. The [GitLab docs](https://docs.gitlab.com/ci/yaml/#stages) say that jobs in the same stage run in parallel, and that if any job fails, **jobs in later stages do not start**.',
			'Lines 12 to 24 put two jobs in the test stage. When `lint-test-job` fails after 10 seconds, `unit-test-job` keeps running to the end. GitLab skips only the jobs of the later stages.',
			'Line 28, `environment: production`, marks `deploy-job` as a deployment, so GitLab can show what is deployed where. Day 23 comes back to it.'
		]
	},
	tradeoff: {
		gain: [
			'Every change goes through the same checks, so nobody ships without running the tests.',
			'Small changes, tested on every push, are easier to fix: when a job fails, you know which commit broke it.',
			'The deploy steps live in the repo and get reviewed like code. Nobody has to remember them.'
		],
		cost: [
			'Every push waits for the pipeline. If it gets slow, people start working around it.',
			'A flaky test fails at random and blocks everyone. After a few false failures, people stop reading red jobs.',
			'Someone has to own the pipeline, its runners and its secrets, and fix them when they break.'
		]
	},
	task: {
		prompt: 'Your deploy runbook today: ssh to the server, `git pull`, `make test`, `make build`, run the database migration, `systemctl restart app`. Rewrite it as pipeline stages. Say which output is the artifact, what runs in parallel, and where a human approval goes if you want continuous delivery and not continuous deployment.',
		hint: 'Ask of each step: does it need the code, or the built output? Does it depend on another step, or can it run beside it?',
		answer: [
			'Build stage: `make build` runs once, in the pipeline. The server builds nothing. The output (a tarball, a binary, later a container image) is the **artifact**.',
			'Test stage: `make test` and a linter run in parallel. If either fails, no later stage runs.',
			'Deploy to staging: copy the artifact, run the migration, restart. These are the commands from your runbook, now run by the machine.',
			'Approval, then deploy to production with the **same artifact**. The approval makes it continuous delivery. If you drop the approval once you trust the pipeline, you have continuous deployment.',
			'The `git pull` on the server goes away: the server only receives what the pipeline built.'
		],
		steps: [
			{
				title: 'Read the runbook',
				questions: [
					{ q: 'What is the weak point of today\'s runbook?', options: ['It needs a server with ssh access', 'It works only if a human does every step, in the right order', 'It runs the tests too often', 'It builds on a machine that is too slow'], answer: 1, why: 'The runbook is fine on paper. It fails the day someone skips `make test` or swaps two steps.' },
					{ q: 'In the pipeline, where does `make build` run?', options: ['On each server, after `git pull`', 'Once in staging, then again in production', 'Once, in the pipeline\'s build stage', 'Only after the tests have passed on the server'], answer: 2, why: 'The pipeline builds the code **once**. The server builds nothing.' },
					{ q: 'Which runbook step goes away completely?', options: ['The database migration', 'The `systemctl restart app`', '`make test`', 'The `git pull` on the server'], answer: 3, why: 'The server only receives what the pipeline built, so it never needs the source.' },
					{ q: 'Which commands still run against the server, now started by the machine?', options: ['Copy the artifact, run the migration, restart', '`git pull`, `make build`, restart', '`make test` and the linter', 'Only `make build`'], answer: 0, why: 'These are the commands from your runbook. The pipeline runs them in the deploy stage.' }
				]
			},
			{
				title: 'Group the stages',
				questions: [
					{ q: 'In what order do the stages go?', options: ['Test, build, deploy to staging, deploy to production', 'Build, test, deploy to staging, approval, production', 'Build, deploy to production, then test', 'Deploy to staging, build, test, production'], answer: 1, why: 'Each stage waits for the one before it to pass, so a broken change never reaches a server.' },
					{ q: 'What runs in parallel?', options: ['`make test` and a linter, in the test stage', 'The build and the deploy to staging', 'The migration and the restart', 'The deploys to staging and production'], answer: 0, why: 'Jobs in the same stage run in parallel. Neither check needs the other.' },
					{ q: 'The migration and `systemctl restart app` both belong to the deploy. Why not run them as two parallel jobs?', options: ['Parallel jobs cannot reach a server over ssh', 'GitLab allows only one job in a deploy stage', 'The restart must wait for the migration, so they run one after the other', 'The migration needs the linter\'s output'], answer: 2, why: 'Jobs in the same stage run in parallel, so use parallel jobs only for steps that do not depend on each other. The restarted app expects the migrated schema, so the restart comes after the migration.' },
					{ q: 'Why put the fast checks early?', options: ['Because the linter needs the build output', 'So the slow tests can be skipped', 'Because GitLab runs fast jobs first anyway', 'So a lint error shows up after seconds, not after the full suite'], answer: 3, why: 'Fail fast: the cheapest check that can catch a mistake should run first.' }
				]
			},
			{
				title: 'Name the artifact',
				questions: [
					{ q: 'Which output is the artifact?', options: ['The source tree that `git pull` fetched', 'The database after the migration', 'What `make build` produces: a tarball, a binary, later an image', 'The log of `systemctl restart app`'], answer: 2, why: 'An artifact is a file a job produces and hands to later jobs. Here it is the build output.' },
					{ q: 'What does staging receive?', options: ['The exact file the build stage made', 'A fresh build from the same commit', 'The repo, to build on the server', 'Only the test report'], answer: 0, why: 'Nothing is built again. Staging gets the file the tests ran against.' },
					{ q: 'What does production receive?', options: ['A new build with production flags', 'The code from a `git pull`', 'Whatever staging rebuilt', 'The same artifact staging got'], answer: 3, why: 'The pipeline promotes one artifact from stage to stage.' },
					{ q: 'How do you check that production got the file the tests ran against?', options: ['Check that both deploys ran on the same day', 'Compare the build output and the production copy byte for byte, for example with `cmp`', 'Run `git pull` on the server and diff the tree', 'Look for a green pipeline badge'], answer: 1, why: 'Production must receive the same artifact, so the two files are identical. In the lab, `cmp dist/app.tar.gz prod/app.tar.gz` prints nothing.' }
				]
			},
			{
				title: 'Place the approval',
				questions: [
					{ q: 'Where does the human approval go for continuous delivery?', options: ['Before the build stage', 'Between build and test', 'After staging, before production', 'After the deploy to production'], answer: 2, why: 'Every green change reaches staging. A human picks when it goes to production.' },
					{ q: 'With the approval in place, when does the database migration first run against a real database?', options: ['In the deploy to staging, before anyone clicks', 'Only in production, after the click', 'In the build stage, with `make build`', 'In the test stage, beside the linter'], answer: 0, why: 'The staging deploy runs the runbook commands: copy the artifact, run the migration, restart. The approval sits after staging, so the migration has already run there when a human decides.' },
					{ q: 'You remove the approval. What is left to stop a bad change before production?', options: ['The human who used to click', 'Nothing: production checks itself', 'The ops team reading the logs after the release', 'Only the jobs before production: build, tests, lint and the staging deploy'], answer: 3, why: 'With no human in between, every change that passes the pipeline goes out. The earlier jobs are the only filter left, which is why you drop the button only once you trust them.' },
					{ q: 'When is it safe to drop the approval?', options: ['On the first day, to ship faster', 'Once you trust the pipeline', 'When the tests get too slow', 'Never: continuous delivery requires it forever'], answer: 1, why: 'You need delivery working before you can do deployment.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'What is the difference between continuous delivery and continuous deployment?',
			options: [
				'Continuous delivery builds and packages the code, while continuous deployment also runs the full test suite on it',
				'Delivery keeps every passing change ready and a human decides when to release. Deployment ships every passing change automatically',
				'Continuous deployment is for container platforms, while continuous delivery is for teams that still ship virtual machines',
				'They are two names for the same practice, and both mean that every passing change is released to users by itself'
			],
			answer: 1,
			why: 'Both keep every change releasable. They differ only in the last step: a human button (delivery) or no button (deployment). You need delivery working before you can do deployment.'
		},
		{
			q: 'In GitLab\'s Getting-Started pipeline, `lint-test-job` fails. What happens to `deploy-job`?',
			options: [
				'It runs anyway, because it is in a different stage',
				'It runs, but marked with a warning',
				'It does not start: a failed job stops all later stages',
				'It waits until someone fixes lint, then starts by itself'
			],
			answer: 2,
			why: 'Jobs in a stage start only when every job in the earlier stages passed. After one failed job, GitLab skips the later stages.'
		},
		{
			q: 'Why does a pipeline build the artifact once and pass it to staging and production, instead of building again for each?',
			options: [
				'Because CI tools do not allow the same job to build twice in one pipeline',
				'To save disk space and build minutes on the shared runner',
				'So the file you deploy to production is exactly the file you tested',
				'Because production servers cannot run a compiler or fetch dependencies'
			],
			answer: 2,
			why: 'A rebuild can pull a different dependency or use a different compiler. Then production runs something nobody tested. When the pipeline promotes one artifact from stage to stage, production runs the tested file.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Write a tiny pipeline in bash that builds once, tests in parallel, stops at the first failure and waits for a human before production.',
		steps: [
			'Make a scratch app: `mkdir -p ~/pipe-lab && cd ~/pipe-lab && printf \'echo hello v1\\n\' > app.sh`.',
			'Write `pipeline.sh` with `set -euo pipefail` and four stages, each starting with a line like `echo "== build"`: build (`tar -czf dist/app.tar.gz app.sh`), test (two jobs started with `&`, then one `wait` per job), deploy to staging (copy and unpack the tarball in `staging/`), deploy to production (same tarball, in `prod/`).',
			'Before production, ask for approval: `read -r -p "Ship to production? [y/N] " ok` and stop unless the answer is `y`.',
			'Run `bash pipeline.sh` and answer `y`. Then break the app with `printf \'echo bye\\n\' > app.sh` and run it again.'
		],
		done: [
			'After the first run, `cmp dist/app.tar.gz prod/app.tar.gz` prints nothing: production got the file the tests ran against.',
			'After the broken run, `echo $?` right after `bash pipeline.sh` prints `1` and the output ends at `== test`.',
			'`bash prod/app.sh` still prints `hello v1`.'
		],
		solution: [
			'`mkdir -p dist && tar -czf dist/app.tar.gz app.sh`',
			'`(bash app.sh | grep -q hello) & unit=$!` and `bash -n app.sh & lint=$!`, then `wait "$unit"` and `wait "$lint"` on two separate lines. Joined with `&&`, a failure would not stop `set -e`.',
			'`mkdir -p staging && cp dist/app.tar.gz staging/ && tar -xzf staging/app.tar.gz -C staging`, and the same with `prod`.',
			'`[ "$ok" = y ] || { echo "stopped before production"; exit 0; }`. Delete that line and you have continuous deployment.'
		]
	},
	recall: {
		q: 'In GitLab\'s starter pipeline, the lint job fails. Which jobs still run, and what changes if you remove the approval before production?',
		a: 'The unit test job in the same stage runs to the end, and no job of a later stage starts. Without the approval, every passing change goes to production: that is continuous deployment.'
	},
	sources: [
		{ title: 'Martin Fowler, Continuous Delivery', url: 'https://martinfowler.com/bliki/ContinuousDelivery.html' },
		{ title: 'Martin Fowler, Deployment Pipeline', url: 'https://martinfowler.com/bliki/DeploymentPipeline.html' },
		{ title: 'GitLab docs, CI/CD YAML syntax: stages', url: 'https://docs.gitlab.com/ci/yaml/#stages' },
		{ title: 'GitLab, Getting-Started.gitlab-ci.yml template', url: `${GITLAB}/lib/gitlab/ci/templates/Getting-Started.gitlab-ci.yml` },
		{ title: 'DORA, Continuous delivery capability', url: 'https://dora.dev/capabilities/continuous-delivery/' }
	]
};
