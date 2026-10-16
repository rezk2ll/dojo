const GITLAB = 'https://github.com/gitlabhq/gitlabhq/blob/b795e7ababc193e9fe85de324f8dc3bb79d2ea90';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'gitlab-ci',
	part: 'CI/CD',
	title: 'GitLab CI: one file, your own runners',
	minutes: 10,
	hook: [
		'Many companies run their own GitLab, on their own servers. Often it is **you** who installed it. So when the team says "add CI", the pipeline will run on machines you manage too.',
		'GitLab CI reads one file at the root of the repo, `.gitlab-ci.yml`. It turns it into a pipeline of jobs grouped in stages, and hands each job to a **runner**: a small agent you install on a server, a VM or a Kubernetes cluster.',
		'Today: stages, jobs, runners, `rules`, the difference between **cache** and **artifacts**, and environments.'
	],
	terms: [
		{ term: 'Job', def: 'A named block in `.gitlab-ci.yml` with a `script`. The smallest thing GitLab runs.' },
		{ term: 'Runner', def: 'The GitLab Runner program that picks up jobs and runs them. On GitLab.com you can use hosted ones, on your own GitLab you install and manage them.' },
		{ term: 'rules', def: 'Conditions checked when the pipeline is created. They decide if a job is added to the pipeline, and how (for example `when: manual`).' },
		{ term: 'Cache', def: 'Files a job saves to speed up later runs, like downloaded packages. Nice to have: a job must still work without it.' },
		{ term: 'Artifacts', def: 'Files a job produces and GitLab stores, like a build output or a report. Later stages in the same pipeline download them.' },
		{ term: 'Environment', def: 'A named deploy target, like `staging` or `production`. GitLab records which commit was deployed there, and when.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['push["git push"] --> gl["GitLab reads .gitlab-ci.yml"]'],
				highlight: ['push', 'gl'],
				note: 'Every push creates a pipeline from `.gitlab-ci.yml` **at that commit**. Change the file in a branch, and only that branch\'s pipelines change.'
			},
			{
				add: [
					'subgraph ts["test stage, jobs in parallel"]',
					't["test"]',
					'r["run"]',
					'pg["pages: default branch only"]',
					'end',
					'gl --> ts'
				],
				highlight: ['t', 'r', 'pg'],
				note: 'The Python template sets no `stage` on these jobs, so GitLab puts them in the default **test** stage. `rules` decided that `pages` exists only on the default branch.'
			},
			{
				add: ['rn["Runner: runs each job in python:latest"]', 'ts -.->|picked up by| rn', 'class rn ext'],
				highlight: ['rn'],
				note: 'GitLab itself runs nothing. A **runner** asks for work, gets a job, runs its `script`, and sends back the log and the files. Runner `tags` let a job ask for a specific kind of machine.'
			},
			{
				add: [
					'ca[("Cache: .cache/pip")]',
					'ar[("Artifacts: build/*")]',
					't -.->|saves for next pipelines| ca',
					'r -->|stores in GitLab| ar'
				],
				highlight: ['ca', 'ar'],
				note: '**Cache** is for things you download, to go faster next time. **Artifacts** are for things you build, to pass them to the next stages. Mix them up, and deploys break when the cache is cold.'
			},
			{
				add: [
					'dep["deploy: environment production"]',
					'ts --> dep',
					'ar -.-> dep',
					'env["Environment page: what runs where, roll back"]',
					'dep --> env'
				],
				highlight: ['dep', 'env'],
				note: '`deploy` is in the **deploy** stage, so it starts only if every test-stage job passed. `environment: production` gives you a page with each deployment, and a way to roll back to an earlier one.'
			}
		]
	},
	example: {
		title: 'lib/gitlab/ci/templates/Python.gitlab-ci.yml',
		repo: 'gitlabhq/gitlabhq',
		url: `${GITLAB}/lib/gitlab/ci/templates/Python.gitlab-ci.yml#L8-L55`,
		lang: 'yaml',
		code: `image: python:latest

# Change pip's cache directory to be inside the project directory since we can
# only cache local items.
variables:
  PIP_CACHE_DIR: "$CI_PROJECT_DIR/.cache/pip"

# https://pip.pypa.io/en/stable/topics/caching/
cache:
  paths:
    - .cache/pip
…
test:
  script:
    - pip install ruff tox  # you can also use tox
    - pip install --editable ".[test]"
    - tox -e py,ruff

run:
  script:
    - pip install .
    # run the command here
  artifacts:
    paths:
      - build/*

pages:
  script:
…
  artifacts:
    paths:
      - public
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH

deploy:
  stage: deploy
  script: echo "Define your deployment script!"
  environment: production`,
		notes: [
			'There is no `stages:` list, so GitLab uses its [defaults](https://docs.gitlab.com/ci/yaml/#stages): `.pre`, `build`, `test`, `deploy`, `.post`. A job with no `stage` lands in `test`. That is why `deploy` waits for the three others.',
			'The comment above `PIP_CACHE_DIR` matters: cache and artifact paths are [relative to the project directory](https://docs.gitlab.com/ci/caching/#how-cache-is-different-from-artifacts) and cannot point outside it. So pip is told to keep its downloads inside the project.',
			'`run` keeps `build/*` as **artifacts**. By default, jobs in later stages download the artifacts of earlier stages, and they [expire after 30 days by default](https://docs.gitlab.com/ci/caching/#artifacts) (an instance setting) unless the job sets `expire_in`.',
			'`rules` are checked in order when the pipeline is created. Here the only rule matches on the default branch. On a feature branch nothing matches, so the [`pages` job is not added](https://docs.gitlab.com/ci/yaml/#rules) at all.',
			'`image: python:latest`: each job runs inside that container image. Remember day 19: `latest` today is not `latest` next month. Pin a version.'
		]
	},
	tradeoff: {
		gain: [
			'Self-hosted from end to end: GitLab, runners and artifacts can all stay on your network.',
			'Runners are yours, so a job can reach internal servers, use a GPU, or run on the exact OS you deploy to.',
			'Environments give you a deploy history per target, and a rollback button, for free.'
		],
		cost: [
			'You run the runners: install, upgrade, disk space for caches, capacity when ten pipelines start at once.',
			'A runner that can deploy to production is a target. Protect it like a production server.',
			'Cache is per runner unless you set up a shared one (S3 or similar). With several runners, cache hits get random.'
		]
	},
	task: {
		prompt: 'Change the Python template so that: stages are explicit (`build`, `test`, `deploy`), `run` builds in the `build` stage, and `deploy` runs **only on the default branch** and **only when a human clicks**. Write the lines you change.',
		hint: 'Look at `rules` with `when`. And remember that artifacts from an earlier stage are downloaded by default.',
		answer: [
			'Add `stages: [build, test, deploy]` at the top, and `stage: build` on `run`.',
			'On `deploy`: `rules:` then `- if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH` with `when: manual`. On other branches no rule matches, so the job is not in the pipeline.',
			'`deploy` gets `build/*` from `run` without any extra line: later stages download earlier artifacts by default.',
			'Keep `environment: production`. Now every click is recorded on the environment page, and you can roll back to the previous deployment from there.'
		]
	},
	quiz: [
		{
			q: 'In GitLab CI, a job compiles a binary that a deploy job in a later stage must use. Where should the binary go?',
			options: [
				'In `cache`, because it is faster',
				'In `artifacts`, because they are stored in GitLab and passed to later stages',
				'In a CI/CD variable',
				'Nowhere: the deploy job should compile it again'
			],
			answer: 1,
			why: 'Cache is for dependencies and may be missing. Artifacts are the way to hand build results to later stages of the same pipeline.'
		},
		{
			q: 'Your `.gitlab-ci.yml` has no `stages:` list, and a job has no `stage:` key. Which stage does the job run in?',
			options: ['`build`', '`.pre`', '`deploy`', '`test`'],
			answer: 3,
			why: 'GitLab\'s defaults are `.pre`, `build`, `test`, `deploy`, `.post`, and a job with no `stage` is assigned to `test`.'
		},
		{
			q: 'A job has `rules: - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH` and nothing else. You push to a feature branch. What happens to that job?',
			options: [
				'It runs and fails',
				'It shows up as skipped, waiting for a manual click',
				'It is not added to the pipeline',
				'It runs, because rules only apply to merge requests'
			],
			answer: 2,
			why: 'If no rule matches, the job is not added to the pipeline at all. That is how one file serves both feature branches and the default branch.'
		}
	],
	takeaway: 'One `.gitlab-ci.yml`, jobs grouped in stages, run by runners you control. Cache what you download, keep as artifacts what you build, and name your environments.',
	sources: [
		{ title: 'GitLab docs, CI/CD YAML syntax reference', url: 'https://docs.gitlab.com/ci/yaml/' },
		{ title: 'GitLab docs, Caching in GitLab CI/CD', url: 'https://docs.gitlab.com/ci/caching/' },
		{ title: 'GitLab docs, Environments', url: 'https://docs.gitlab.com/ci/environments/' },
		{ title: 'GitLab docs, GitLab Runner', url: 'https://docs.gitlab.com/runner/' },
		{ title: 'GitLab, Python.gitlab-ci.yml template', url: `${GITLAB}/lib/gitlab/ci/templates/Python.gitlab-ci.yml` }
	]
};
