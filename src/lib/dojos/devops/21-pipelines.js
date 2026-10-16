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
