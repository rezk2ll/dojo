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
		],
		steps: [
			{
				title: 'Build the image',
				questions: [
					{ q: 'Which Dockerfile shape fits the kata?', options: ['One stage with the full build toolchain, run as root', 'Multi-stage, small base, non-root user, with a `.dockerignore`', 'A base image you update by hand inside the container', 'Any shape, since Kubernetes rebuilds it'], answer: 1, why: 'Build tools stay in the builder stage, the final image is small, and it does not run as root.' },
					{ q: 'Which tag does the registry get for a push to `main`?', options: ['`latest` only', '`main` only', '`prod`', '`sha-<commit>`, an immutable tag'], answer: 3, why: 'A SHA tag never moves, so the config names exactly one image to run or roll back to.' },
					{ q: 'Why is a `main` tag alone a problem for GitOps?', options: ['It moves with every push, so the same values file can mean two deploys', 'Registries refuse branch names', 'Kubernetes caches a branch tag forever and never pulls a newer image for it', 'It makes the image larger'], answer: 0, why: 'metadata-action\'s default tag for `main` moves. Add `tags: type=sha` for an immutable one.' },
					{ q: 'How do you check this link before the next one?', options: ['Wait for Argo CD to sync', 'Read the Dockerfile again', 'Run the image locally and hit `/healthz`', 'Push it and hope'], answer: 2, why: 'Check each link before the next: does the image run locally?' }
				]
			},
			{
				title: 'Wire CI',
				questions: [
					{ q: 'What does CI do on a pull request?', options: ['Tests and builds, without pushing the image', 'Builds, pushes and deploys to production', 'Nothing until merge', 'Pushes the image tagged `pr`'], answer: 0, why: 'A PR checks that the image builds, and never publishes it.' },
					{ q: 'On `main`, after build and push, what is CI\'s last step?', options: ['`helm upgrade` on staging with the new tag, using a staging kubeconfig','`kubectl apply` of the chart', 'Commit the new tag to `values-staging.yaml` in the config repo', 'Page on-call that a deploy happened'], answer: 2, why: 'CI does not deploy. Its commit asks for the deploy, and a teammate can review or revert it.' },
					{ q: 'A test fails. What reaches the registry?', options: ['The image, tagged `broken`', 'Nothing: CI stops before the build', 'Half the layers', 'The image, but not the tag'], answer: 1, why: 'Tests run first. A failure stops CI before anything is built or pushed.' },
					{ q: 'Why pin each third-party action to a full commit SHA?', options: ['SHAs run faster', 'GitHub requires it', 'It hides the action from others', 'A tag on someone else\'s repo can be moved'], answer: 3, why: 'The same reason you pin image digests: a SHA always means the same code.' }
				]
			},
			{
				title: 'Package and deploy',
				questions: [
					{ q: 'What goes in the Deployment template of the chart?', options: ['2 replicas, requests and limits, a readiness probe on `/healthz`', '1 replica, no probes, and all settings written straight into the template', 'A hard-coded `latest` tag', 'The cluster-admin kubeconfig'], answer: 0, why: 'Two copies, resources the scheduler can count, and traffic only once the app answers.' },
					{ q: 'Which object keeps one pod up during a node drain?', options: ['A ResourceQuota', 'A HorizontalPodAutoscaler', 'A PodDisruptionBudget', 'An Ingress'], answer: 2, why: 'A PDB limits how many pods a drain may evict at once.' },
					{ q: 'How is the Argo CD side set up?', options: ['One Application for all environments, manual sync', 'One Application per environment, automated sync, prune and self-heal on', 'No Application: CI runs `kubectl`', 'One Application per Pod'], answer: 1, why: 'Each environment follows its own values file, and Git wins over hand edits.' },
					{ q: 'How does a release reach production?', options: ['Rebuild the image with production settings', 'Push the image again tagged `prod`', 'Copy pods from staging', 'A pull request that copies the tested tag into production values'], answer: 3, why: 'Promotion moves the same image. A rebuild could pull different dependencies.' }
				]
			},
			{
				title: 'Alert and drill',
				questions: [
					{ q: 'What should the one alert page on?', options: ['CPU over 80%', 'The 5xx ratio burning the error budget, over a long and a short window', 'Any pod restart, since each restart means users saw an error at that moment', 'Disk over 85%'], answer: 1, why: 'Page on a symptom users feel, and on how fast the budget burns.' },
					{ q: 'What is the first step in its runbook?', options: ['Revert the last config commit', 'SSH into a node', 'Delete the pods', 'Rebuild from source'], answer: 0, why: 'The last config commit is the likely cause, and reverting it is one safe command.' },
					{ q: 'With self-heal on, why not roll back with `kubectl rollout undo`?', options: ['It only rolls back the ReplicaSet, and the Service keeps the new endpoints', 'It needs root', 'Argo CD undoes it, because Git still names the bad tag', 'It deletes the Service'], answer: 2, why: 'Change the desired state with `git revert`, and Argo CD syncs the old tag back.' },
					{ q: 'What closes the drill?', options: ['Deleting the alert so it stays quiet', 'Turning off self-heal', 'A long report naming who broke it', 'A short blameless postmortem of your own drill'], answer: 3, why: 'Write down what happened and what to change, without blame. It is practice for the real thing.' }
				]
			}
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
	lab: {
		minutes: 45,
		goal: 'Run the whole chain on your machine with Docker and Git: build once, deploy by commit, catch a bad release, roll back with `git revert`.',
		steps: [
			'Set up two repos and a registry: `mkdir -p ~/capstone-lab/{app,config} && git -C ~/capstone-lab/app init -b main && git -C ~/capstone-lab/config init -b main`, then `docker run -d --rm --name capstone-registry -p 5001:5000 registry:2`.',
			'In `app`, write `server.py` (an `http.server` app on port 8000 that answers 200 and `hello`), a `Dockerfile` (`FROM python:3.12-alpine`, copy the file, `USER nobody`, run it) and `ci.sh`. `ci.sh` checks `python3 -m py_compile server.py`, builds and pushes `localhost:5001/web:sha-<commit>`, and commits `tag: sha-<commit>` to `../config/values-staging.yaml`. Commit the app, then run `bash ci.sh`.',
			'In `config`, write `deploy.sh`, which plays Argo CD: it reads the tag from `values-staging.yaml` and replaces the container `capstone-web` with one from that image, on `-p 8081:8000`. Write `alert.sh`, which plays Prometheus: it prints `PAGE` when `localhost:8081/` does not answer 200. Run `bash deploy.sh`, then `bash alert.sh`.',
			'Ship a bad release: in `server.py`, return 500 on every path except `/healthz`. Commit, run `bash ci.sh` in `app`, then `bash deploy.sh` and `bash alert.sh` in `config`.',
			'Roll back in `config`: `git revert --no-edit HEAD`, then `bash deploy.sh` and `bash alert.sh`. Write a three-line blameless postmortem of the drill. Clean up with `docker rm -f capstone-web && docker stop capstone-registry && rm -rf ~/capstone-lab`.'
		],
		done: [
			'`curl -s localhost:5001/v2/web/tags/list` lists two `sha-` tags, one per app commit.',
			'After the bad release, `curl -s -o /dev/null -w "%{http_code}" localhost:8081/healthz` still prints 200, but `alert.sh` prints `PAGE`.',
			'After the revert, `values-staging.yaml` names the first tag again and `alert.sh` prints `ok`, with no rebuild.',
			'`git log --oneline` in `config` shows one commit per deploy, with the revert on top.',
			'`docker exec capstone-web id` shows `uid=65534(nobody)`.'
		],
		solution: [
			'`server.py`: a `BaseHTTPRequestHandler` whose `do_GET` sets `code = 200`, then calls `self.send_response(code)`, `self.end_headers()` and `self.wfile.write(b"hello\\n")`. Serve it with `HTTPServer(("", 8000), Handler).serve_forever()`. The bad release is `code = 200 if self.path == "/healthz" else 500`.',
			'`ci.sh`: `set -euo pipefail`, `python3 -m py_compile server.py`, `tag=sha-$(git rev-parse --short HEAD)`, `docker build -t localhost:5001/web:$tag .`, `docker push localhost:5001/web:$tag`, then `cd ../config && echo "tag: $tag" > values-staging.yaml && git add values-staging.yaml && git commit -m "staging: $tag"`.',
			'`deploy.sh`: `set -euo pipefail`, `tag=$(sed -n "s/^tag: //p" values-staging.yaml)`, `docker rm -f capstone-web 2>/dev/null || true`, then `docker run -d --name capstone-web -p 8081:8000 localhost:5001/web:$tag`. CI never runs it: the deploy follows the config repo.',
			'`alert.sh`: `code=$(curl -s -o /dev/null -w "%{http_code}" localhost:8081/)`, then `[ "$code" = 200 ] && echo ok || echo "PAGE: / returned $code"`. It watches what users get. `/healthz` stays green in the bad release, so a probe alone would not page.',
			'The rollback rebuilds nothing: the old image is still in the registry under its immutable tag, and the revert points the config back at it. On the real stack, `deploy.sh` is an Argo CD Application with self-heal and `alert.sh` is a burn-rate rule in Prometheus.'
		]
	},
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
