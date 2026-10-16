const SW = 'https://github.com/actions/starter-workflows/blob/e3c451d60f119b71caebf13c98ac45da6e15b4b7';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'capstone',
	part: 'Running in production',
	title: 'Capstone: from git push to a paged alert',
	minutes: 10,
	hook: [
		'Forty days ago you deployed by ssh and by hand. The kata wires the whole chain for one small web app: **a git push ends up running in Kubernetes**, and if it breaks, someone gets paged.',
		'Every tool in the chain comes from an earlier chapter. For each link, you write down the choice you make and why.'
	],
	terms: [
		{ term: 'App repo', def: 'Holds the code, the Dockerfile and the CI workflow. A push here builds an image.' },
		{ term: 'Config repo', def: 'Holds the Helm values per environment. Argo CD watches it, and each commit here triggers a deploy.' },
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
				note: 'CI runs the tests, builds the image once and pushes it with an **immutable tag** taken from the commit. If a test fails, CI stops before the build, and nothing reaches the registry.'
			},
			{
				add: [
					'ci -->|"commit new tag"| cfg[("Config repo: Helm values")]'
				],
				highlight: ['cfg'],
				note: 'CI does **not** deploy. It commits the new tag to the staging values file in the config repo. That commit asks for the deploy: a teammate can review it, and `git revert` undoes it.'
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
				note: 'Prometheus watches the **symptoms**. If the new version burns the error budget, on-call is paged and rolls back with `git revert` on the config repo. Argo CD then syncs the old tag back to the cluster.'
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
			'GitHub ships this starter workflow for "build an image and push it to a registry". On lines 3 and 5, `$cron-daily` and `$default-branch` are placeholders GitHub fills in when you pick the template.',
			'Line 32 sets `push` to false on pull requests: a PR builds the image to check that it builds, and never publishes it.',
			'Line 33 takes its tags from metadata-action (line 21). With no `tags` input, metadata-action uses its [default tags](https://github.com/docker/metadata-action/blob/96383f45573cb7f253c731d3b3ab81c87ef81934/README.md#L415-L423): a push to `main` gets the tag `main`, which **moves** with every push. For GitOps, add `tags: type=sha` to get an immutable `sha-ad132f5` tag.',
			'Lines 21 and 29 pin each third-party action to a **full commit SHA**, for the same reason you pin image digests: a tag on someone else\'s repo can be moved.'
		]
	},
	tradeoff: {
		gain: [
			'Every deploy is a commit in the config repo: who, what, when, and a one-line rollback.',
			'The image is built once and promoted, so production runs exactly the bytes staging tested.',
			'CI never holds cluster credentials, and the paged engineer\'s first step is `git revert`.'
		],
		cost: [
			'Two repos and a bot that commits to one of them replace a single `helm upgrade` step in CI.',
			'A deploy now takes a CI run plus an Argo CD sync, which adds up to minutes.',
			'The alert pages on the SLO target you pick, so a wrong target pages too often or too late. Pick the number with whoever owns the product.'
		]
	},
	task: {
		prompt: 'The kata. Take a small web app (any language, one HTTP port, a `/healthz` route) and ship it end to end. 1. Dockerfile. 2. CI that tests, builds and pushes an image. 3. A Helm chart. 4. An Argo CD Application. 5. One alert. Write down each choice you make and why.',
		hint: 'Work down the chain, and check each link before the next: does the image run locally, does the chart render with `helm template`, does Argo CD show Synced, does the alert fire when you break the app on purpose?',
		answer: [
			'Image: multi-stage Dockerfile, small base, non-root user, a `.dockerignore`. Tagged `sha-<commit>` in the registry, never only `latest`.',
			'CI: on pull requests run tests and build without pushing. On `main`, build, push, then commit the new tag to `values-staging.yaml` in the config repo.',
			'Chart: Deployment with 2 replicas, requests and limits, readiness probe on `/healthz`, a Service and an Ingress. A PodDisruptionBudget so node drains keep one pod up.',
			'GitOps: one Argo CD Application per environment, automated sync, prune and self-heal on. Promotion to production is a pull request that copies the tag.',
			'Alert: page when the 5xx ratio burns the error budget over a long and a short window, with a `runbook_url` whose first step is "revert the last config commit".',
			'Break it on purpose: deploy a version that returns 500, watch the alert fire, roll back with `git revert`, and write a short blameless postmortem of your own drill.'
		]
	},
	quiz: [
		{
			q: 'In a GitOps pipeline, why should CI tag images with the commit SHA rather than only with `main` or `latest`?',
			options: [
				'Because registries reject the tag `latest` on pushes from CI',
				'Because a SHA tag never moves, so config names one exact image to roll back to',
				'Because SHA tags let the registry store smaller, deduplicated images',
				'Because Kubernetes cannot pull tags that are named after a branch'
			],
			answer: 1,
			why: 'A branch tag points at a new image after every push, so the same values file can mean two different deploys. With an immutable tag, the values file in Git names exactly the image that runs.'
		},
		{
			q: 'The new version is live and the error-budget alert fires. With the setup from this kata, what is the fastest safe rollback?',
			options: [
				'`kubectl rollout undo` on the Deployment, then watch the pods',
				'`git revert` the tag commit in the config repo, let Argo CD sync',
				'Rebuild the old version from source and push it to the registry',
				'Delete the pods so Kubernetes restarts them from a clean state'
			],
			answer: 1,
			why: 'With self-heal on, a `kubectl` rollback is undone, because Git still names the bad tag. Reverting the commit changes the desired state, and Argo CD applies it.'
		},
		{
			q: 'Staging passed. How should the same release reach production?',
			options: [
				'Rebuild the image from the same commit with production settings',
				'Set the production values to the image tag staging ran, through a pull request',
				'Copy the running pods from the staging cluster into production',
				'Push the image again with the tag `prod` and let production pull it'
			],
			answer: 1,
			why: 'Promotion copies the tag of the image staging tested. A rebuild can pull different dependencies, so production would run bytes nobody tested.'
		}
	],
	recall: {
		q: 'In this chain, what does CI commit after a push to `main`, and how does on-call roll back a bad release?',
		a: 'CI commits the immutable image tag, like `sha-ad132f5`, to the staging values file in the config repo, and Argo CD syncs it. To roll back, on-call runs `git revert` on that commit.'
	},
	sources: [
		{ title: 'GitHub docs, Publishing Docker images', url: 'https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images' },
		{ title: 'Helm docs', url: 'https://helm.sh/docs/' },
		{ title: 'Argo CD docs, Getting started', url: 'https://argo-cd.readthedocs.io/en/stable/getting_started/' },
		{ title: 'Google SRE workbook, Alerting on SLOs', url: 'https://sre.google/workbook/alerting-on-slos/' },
		{ title: 'DORA', url: 'https://dora.dev/' }
	]
};
