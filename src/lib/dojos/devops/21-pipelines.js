const GITLAB = 'https://github.com/gitlabhq/gitlabhq/blob/b795e7ababc193e9fe85de324f8dc3bb79d2ea90';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'pipelines',
	part: 'CI/CD',
	title: 'Pipelines: your deploy runbook, run by a machine',
	minutes: 10,
	hook: [
		'You know this deploy. You ssh into the server, `git pull`, run the tests if you remember, restart the service, and watch the logs. It works. It also depends on **you**, on a good day, doing every step in the right order.',
		'A **pipeline** is that runbook written down as code and run by a machine on every push. Same steps, same order, every time. If one step fails, it **stops**, before the broken code reaches anyone.',
		'Today: what CI, continuous delivery and continuous deployment really mean, and how stages, artifacts and fail fast fit together.'
	],
	terms: [
		{ term: 'Pipeline', def: 'The automated path a change takes from `git push` to production: a list of stages run in order.' },
		{ term: 'Stage', def: 'One step of the pipeline, like build, test or deploy. Jobs in the same stage can run in parallel. The next stage waits for this one to pass.' },
		{ term: 'Artifact', def: 'A file a job produces and hands to later jobs: a binary, a tarball, a test report. Build it once, use it everywhere.' },
		{ term: 'Continuous integration (CI)', def: 'Everyone merges small changes often, and every change is built and tested automatically.' },
		{ term: 'Continuous delivery', def: 'Every change that passes the pipeline **could** go to production at any time. A human decides when.' },
		{ term: 'Continuous deployment', def: 'Every change that passes the pipeline **does** go to production, with no human in between.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['push["git push"] --> build["Build: compile once"]'],
				highlight: ['push', 'build'],
				note: 'A push starts the pipeline. The first stage builds the code **once**. This is the step you used to do by hand on the server.'
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
				note: 'Jobs in the same stage run **in parallel**. Put the fast checks early: a lint error should cost you seconds, not the full test suite.'
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
				note: 'The build output is saved as an **artifact**. Staging gets that exact file, not a rebuild. What you tested is what you ship.'
			},
			{
				add: ['stg --> gate["Approval: a human clicks"]', 'gate --> prod["Deploy to production"]'],
				highlight: ['gate', 'prod'],
				note: 'With the approval button, this is **continuous delivery**: always ready, released on demand. Remove the button and every green change goes out: **continuous deployment**.'
			},
			{
				add: ['stop["Lint fails: later stages never start"]', 'lint -.-> stop', 'class stop ext'],
				highlight: ['stop'],
				note: '**Fail fast.** One red job and the pipeline stops. Nothing after it runs, so a broken change cannot reach staging, let alone production.'
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
			'This is GitLab\'s starter pipeline. The `echo` lines stand in for real commands. Replace them with your build, test and deploy, and **the shape stays the same**.',
			'`stages` sets the order. The [GitLab docs](https://docs.gitlab.com/ci/yaml/#stages) say it plainly: jobs in the same stage run in parallel, and if any job fails, **jobs in later stages do not start**. That is fail fast, built in.',
			'One detail: when `lint-test-job` fails after 10 seconds, `unit-test-job` in the same stage keeps running to the end. Only the **later** stages are skipped.',
			'`environment: production` marks `deploy-job` as a deployment, so GitLab can show what is deployed where. Day 23 comes back to it.'
		]
	},
	tradeoff: {
		gain: [
			'Every change goes through the same checks. No more "I forgot to run the tests".',
			'Small changes, tested on every push, are easier to fix: when it breaks, you know which commit did it.',
			'The deploy steps live in the repo, reviewed like code, instead of in one person\'s head.'
		],
		cost: [
			'A slow pipeline is a tax on every push. You have to keep it fast, or people start working around it.',
			'Flaky tests hurt more: a random red job blocks everyone, and people learn to ignore red.',
			'Someone has to own the pipeline, its runners and its secrets. It is a system like any other.'
		]
	},
	task: {
		prompt: 'Your deploy runbook today: ssh to the server, `git pull`, `make test`, `make build`, run the database migration, `systemctl restart app`. Rewrite it as pipeline stages. Say what becomes an artifact, what runs in parallel, and where a human approval goes if you want continuous delivery, not continuous deployment.',
		hint: 'Ask of each step: does it need the code, or the built output? Does it depend on another step, or can it run beside it?',
		answer: [
			'**Build stage:** `make build` once, in the pipeline, not on the server. The output (a tarball, a binary, later a container image) is the **artifact**.',
			'**Test stage:** `make test` and a linter, in parallel. If either fails, nothing after it runs.',
			'**Deploy to staging:** copy the artifact, run the migration, restart. Same commands as your runbook, run by the machine.',
			'**Approval, then deploy to production** with the **same artifact**. The approval is what makes it continuous delivery. Drop it once you trust the pipeline, and it becomes continuous deployment.',
			'`git pull` on the server disappears: the server no longer builds anything, it only receives what the pipeline built.'
		]
	},
	quiz: [
		{
			q: 'What is the difference between continuous delivery and continuous deployment?',
			options: [
				'Continuous delivery builds the code, continuous deployment also tests it',
				'With continuous delivery every passing change is ready for production and a human decides when to release. With continuous deployment every passing change goes out automatically',
				'Continuous deployment is for containers, continuous delivery is for virtual machines',
				'They are two names for the same practice'
			],
			answer: 1,
			why: 'Both keep every change releasable. The only difference is the last step: a human button (delivery) or no button (deployment). You need delivery before you can do deployment.'
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
			why: 'Jobs in a stage start only when every job in the earlier stages passed. One red job and the later stages are skipped. That is fail fast.'
		},
		{
			q: 'Why does a pipeline build the artifact once and pass it to staging and production, instead of building again for each?',
			options: [
				'Because building twice is not allowed by CI tools',
				'To save disk space on the runner',
				'So the file you deploy to production is exactly the file you tested',
				'Because production servers cannot run a compiler'
			],
			answer: 2,
			why: 'A rebuild can pull a different dependency or use a different compiler. Then production runs something nobody tested. One artifact, promoted from stage to stage, removes that gap.'
		}
	],
	takeaway: 'A pipeline is your runbook as code: build once, test early and fast, stop at the first failure, and deploy the same artifact you tested.',
	sources: [
		{ title: 'Martin Fowler, Continuous Delivery', url: 'https://martinfowler.com/bliki/ContinuousDelivery.html' },
		{ title: 'Martin Fowler, Deployment Pipeline', url: 'https://martinfowler.com/bliki/DeploymentPipeline.html' },
		{ title: 'GitLab docs, CI/CD YAML syntax: stages', url: 'https://docs.gitlab.com/ci/yaml/#stages' },
		{ title: 'GitLab, Getting-Started.gitlab-ci.yml template', url: `${GITLAB}/lib/gitlab/ci/templates/Getting-Started.gitlab-ci.yml` },
		{ title: 'DORA, Continuous delivery capability', url: 'https://dora.dev/capabilities/continuous-delivery/' }
	]
};
