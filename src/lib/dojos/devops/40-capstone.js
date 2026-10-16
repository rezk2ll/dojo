const SW = 'https://github.com/actions/starter-workflows/blob/e3c451d60f119b71caebf13c98ac45da6e15b4b7';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'capstone',
	part: 'Running in production',
	title: 'Capstone: from git push to a paged alert',
	minutes: 10,
	hook: [
		'Forty days ago you deployed by ssh and hand. Today you wire the whole chain for one small web app: **a git push ends up running in Kubernetes**, and if it breaks, someone gets paged.',
		'No new tool today. Only choices, and the reasons behind them.'
	],
	terms: [
		{ term: 'App repo', def: 'Holds the code, the Dockerfile and the CI workflow. A push here builds an image.' },
		{ term: 'Config repo', def: 'Holds the Helm values per environment. Argo CD watches it. A commit here is a deploy.' },
		{ term: 'Immutable tag', def: 'An image tag that never moves, like `sha-ad132f5`. Unlike `main` or `latest`, it always means the same image.' },
		{ term: 'Promotion', def: 'Moving the same image from staging to production by changing one value in Git, never by rebuilding it.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: [
					'push["git push to main"] --> ci["CI: test, build"]',
					'ci -->|"image sha-ad132f5"| reg[("Registry")]',
					'class reg ext'
				],
				highlight: ['push', 'ci', 'reg'],
				note: 'CI runs the tests, builds the image once and pushes it with an **immutable tag** taken from the commit. Fail fast: a red test never reaches the registry.'
			},
			{
				add: [
					'ci -->|"commit new tag"| cfg[("Config repo: Helm values")]'
				],
				highlight: ['cfg'],
				note: 'CI does **not** deploy. It commits the new tag to the staging values file in the config repo. That commit is the deploy request, reviewed and revertable.'
			},
			{
				add: [
					'subgraph k8s["Kubernetes cluster"]',
					'argo["Argo CD"]',
					'app["App: Deployment, Service, Ingress"]',
					'end',
					'argo -->|"pulls"| cfg',
					'argo -->|"helm template, sync"| app',
					'app -.->|"pulls image"| reg'
				],
				highlight: ['argo', 'app'],
				note: 'Argo CD sees the commit, renders the **Helm chart** with the new values and syncs. The Deployment does a rolling update, gated by its readiness probe.'
			},
			{
				add: [
					'prom["Prometheus: error ratio, latency"]',
					'oncall["On-call"]',
					'prom -->|"scrapes"| app',
					'prom -->|"burn rate alert"| oncall',
					'class oncall ext'
				],
				highlight: ['prom', 'oncall'],
				note: 'Prometheus watches the **symptoms**. If the new version burns the error budget, on-call is paged and rolls back with `git revert` on the config repo. Argo CD does the rest.'
			}
		]
	},
	example: {
		title: 'ci/docker-publish.yml',
		repo: 'actions/starter-workflows',
		url: `${SW}/ci/docker-publish.yml#L8-L83`,
		lang: 'yaml',
		code: `on:
  schedule:
    - cron: $cron-daily
  push:
    branches: [ $default-branch ]
    # Publish semver tags as releases.
    tags: [ 'v*.*.*' ]
  pull_request:
    branches: [ $default-branch ]

env:
  # Use docker.io for Docker Hub if empty
  REGISTRY: ghcr.io
  # github.repository as <account>/<repo>
  IMAGE_NAME: \${{ github.repository }}
…
      # Extract metadata (tags, labels) for Docker
      # https://github.com/docker/metadata-action
      - name: Extract Docker metadata
        id: meta
        uses: docker/metadata-action@96383f45573cb7f253c731d3b3ab81c87ef81934 # v5.0.0
        with:
          images: \${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}

      # Build and push Docker image with Buildx (don't push on PR)
      # https://github.com/docker/build-push-action
      - name: Build and push Docker image
        id: build-and-push
        uses: docker/build-push-action@0565240e2d4ab88bba5387d719585280857ece09 # v5.0.0
        with:
          context: .
          push: \${{ github.event_name != 'pull_request' }}
          tags: \${{ steps.meta.outputs.tags }}
          labels: \${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max`,
		notes: [
			'GitHub\'s own starter for "build an image and push it to a registry". `$default-branch` and `$cron-daily` are placeholders GitHub fills in when you pick the template.',
			'`push` is false on pull requests: a PR builds the image to prove it builds, but never publishes it.',
			'With no `tags` input, metadata-action uses its [default tags](https://github.com/docker/metadata-action/blob/96383f45573cb7f253c731d3b3ab81c87ef81934/README.md#L415-L423): a push to `main` gets the tag `main`, which **moves** with every push. For GitOps, add `tags: type=sha` to get an immutable `sha-ad132f5` tag.',
			'Every third-party action is pinned to a **full commit SHA**, for the same reason you pin image digests: a tag on someone else\'s repo can be moved.'
		]
	},
	tradeoff: {
		gain: [
			'Every deploy is a commit in the config repo: who, what, when, and a one-line rollback.',
			'The image is built once and promoted, so production runs exactly the bytes staging tested.',
			'CI never holds cluster credentials, and a paged human has a clear first move: revert.'
		],
		cost: [
			'Two repos and a bot that commits to one of them. More moving parts than `helm upgrade` from CI.',
			'A deploy now takes a CI run plus an Argo CD sync. Minutes, not seconds.',
			'The alert is only as good as the SLO behind it. Pick the number with whoever owns the product.'
		]
	},
	task: {
		prompt: 'The kata. Take a small web app (any language, one HTTP port, a `/healthz` route) and ship it end to end. 1. Dockerfile. 2. CI that tests, builds and pushes an image. 3. A Helm chart. 4. An Argo CD Application. 5. One alert. Write down each choice you make and why.',
		hint: 'Work down the chain, and check each link before the next: does the image run locally, does the chart render with `helm template`, does Argo CD show Synced, does the alert fire when you break the app on purpose?',
		answer: [
			'**Image**: multi-stage Dockerfile, small base, non-root user, a `.dockerignore`. Tagged `sha-<commit>` in the registry, never only `latest`.',
			'**CI**: on pull requests run tests and build without pushing. On `main`, build, push, then commit the new tag to `values-staging.yaml` in the config repo.',
			'**Chart**: Deployment with 2 replicas, requests and limits, readiness probe on `/healthz`, a Service and an Ingress. A PodDisruptionBudget so node drains keep one pod up.',
			'**GitOps**: one Argo CD Application per environment, automated sync, prune and self-heal on. Promotion to production is a pull request that copies the tag.',
			'**Alert**: page when the 5xx ratio burns the error budget over a long and a short window, with a `runbook_url` whose first step is "revert the last config commit".',
			'**Break it on purpose**: deploy a version that returns 500, watch the alert fire, roll back with `git revert`, and write a short blameless postmortem of your own drill.'
		]
	},
	quiz: [
		{
			q: 'In a GitOps pipeline, why should CI tag images with the commit SHA rather than only with `main` or `latest`?',
			options: [
				'Because registries reject the tag `latest`',
				'Because a SHA tag never moves, so the config repo always names one exact image, and a rollback brings back that exact image',
				'Because SHA tags make images smaller',
				'Because Kubernetes cannot pull branch-named tags'
			],
			answer: 1,
			why: 'A branch tag points at a new image after every push, so the same values file can mean two different deploys. An immutable tag makes Git a true record of what runs.'
		},
		{
			q: 'The new version is live and the error-budget alert fires. With the setup from this kata, what is the fastest safe rollback?',
			options: [
				'`kubectl rollout undo` on the Deployment',
				'`git revert` the tag commit in the config repo and let Argo CD sync',
				'Rebuild the old version from source and push it',
				'Delete the pods so Kubernetes restarts them'
			],
			answer: 1,
			why: 'With self-heal on, a `kubectl` rollback is undone, because Git still names the bad tag. Reverting the commit changes the desired state, and Argo CD applies it.'
		},
		{
			q: 'Staging passed. How should the same release reach production?',
			options: [
				'Rebuild the image from the same commit with production settings',
				'Change the image tag in the production values to the one staging ran, through a pull request',
				'Copy the running pods from the staging cluster',
				'Push the image again with the tag `prod`'
			],
			answer: 1,
			why: 'Build once, promote the same image. A rebuild can pull different dependencies, so production would run bytes nobody tested.'
		}
	],
	takeaway: 'A push builds one immutable image, a commit to Git deploys it, Argo CD applies it, and an alert on symptoms tells a human when to revert. Every step is a choice you can explain.',
	sources: [
		{ title: 'GitHub docs, Publishing Docker images', url: 'https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images' },
		{ title: 'Helm docs', url: 'https://helm.sh/docs/' },
		{ title: 'Argo CD docs, Getting started', url: 'https://argo-cd.readthedocs.io/en/stable/getting_started/' },
		{ title: 'Google SRE workbook, Alerting on SLOs', url: 'https://sre.google/workbook/alerting-on-slos/' },
		{ title: 'DORA', url: 'https://dora.dev/' }
	]
};
