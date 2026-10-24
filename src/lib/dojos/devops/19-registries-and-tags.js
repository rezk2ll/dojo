const STARTER = 'https://github.com/actions/starter-workflows/blob/e3c451d60f119b71caebf13c98ac45da6e15b4b7';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'registries-and-tags',
	part: 'Containers',
	title: 'Registries, tags and digests',
	minutes: 10,
	hook: [
		'You know apt repositories: a server holds packages, you pin `nginx=1.24.0-1` so every server gets the same build. A **registry** holds images the same way.',
		'`myapp:latest` looks like a version, but anyone who can push can point `latest` at a new image. Two servers that pulled `latest` a week apart can run different code under the same name.',
		'`latest` and `1.4.2` are tags: a push can move them to another image. A digest is a hash of the image content, and it always names the same bytes.'
	],
	terms: [
		{ term: 'Registry', def: 'A server that stores and serves images: Docker Hub, GitHub Container Registry (`ghcr.io`), your cloud\'s registry, or one you host. Each image name in it, like `ghcr.io/acme/myapp`, is a repository.' },
		{ term: 'Tag', def: 'A human name for one version, like `1.4.2` or `latest`. Tags are mutable: a push can point the same tag at a new image.' },
		{ term: 'Digest', def: 'A `sha256:...` hash of the image content. Two images with the same digest have the same bytes. A digest cannot be moved to other content.' },
		{ term: 'Pinning', def: 'Referring to an image by an exact version, ideally by digest (`myapp@sha256:...`), so every pull gets the same image.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: [
					'ci["CI builds image"] -->|docker push| reg[("Registry: ghcr.io/acme/myapp")]'
				],
				highlight: ['ci', 'reg'],
				note: 'CI builds the image and pushes it to a registry. Servers and clusters **pull** from there, instead of receiving tarballs over scp.'
			},
			{
				add: [
					'dg["sha256:aaa..."]',
					'reg --> dg',
					't1["tag 1.4.2"] -.-> dg',
					'tl["tag latest"] -.-> dg'
				],
				highlight: ['dg', 't1', 'tl'],
				note: 'The registry stores content by **digest**. Each tag is a name that points at one digest. Right now `1.4.2` and `latest` point at the same image.'
			},
			{
				add: [
					'dg2["sha256:bbb..."]',
					'reg --> dg2',
					't2["tag 1.5.0"] -.-> dg2',
					'tl -.->|moved| dg2'
				],
				highlight: ['dg2', 'tl'],
				note: 'Next release: push `1.5.0`, and **`latest` moves**. Anything that pulls `latest` from now on gets new code. Yesterday\'s `latest` and today\'s are different images.'
			},
			{
				add: [
					'srv["Server pulls myapp@sha256:aaa..."]',
					'srv -->|always the same bytes| dg',
					'class srv ext'
				],
				highlight: ['srv'],
				note: 'Pull **by digest** and you get exactly that image, forever, whatever happens to the tags. To roll back, you deploy the previous digest.'
			}
		]
	},
	example: {
		title: 'ci/docker-publish.yml',
		repo: 'actions/starter-workflows',
		url: `${STARTER}/ci/docker-publish.yml#L8-L98`,
		lang: 'yaml',
		code: `on:
  schedule:
    - cron: $cron-daily
  push:
    branches: [ $default-branch ]
    # Publish semver tags as releases.
    tags: [ 'v*.*.*' ]
…
env:
  # Use docker.io for Docker Hub if empty
  REGISTRY: ghcr.io
  # github.repository as <account>/<repo>
  IMAGE_NAME: \${{ github.repository }}
…
      - name: Extract Docker metadata
        id: meta
        uses: docker/metadata-action@96383f45573cb7f253c731d3b3ab81c87ef81934 # v5.0.0
        with:
          images: \${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}
…
          tags: \${{ steps.meta.outputs.tags }}
…
      - name: Sign the published Docker image
…
          TAGS: \${{ steps.meta.outputs.tags }}
          DIGEST: \${{ steps.build-and-push.outputs.digest }}
…
        run: echo "\${TAGS}" | xargs -I {} cosign sign --yes {}@\${DIGEST}`,
		notes: [
			'GitHub ships this starter workflow for publishing an image. Lines 11 and 13 push it to `ghcr.io`, GitHub\'s registry, under the repository\'s own name.',
			'Lines 15 to 19 take the tags from `docker/metadata-action` with its defaults: a branch push gives a tag named after the branch, a Git tag `v1.2.3` gives `v1.2.3` **and `latest`**, a nightly run gives `nightly`. Its [README](https://github.com/docker/metadata-action/blob/96383f45573cb7f253c731d3b3ab81c87ef81934/README.md#latest-tag) shows that `v2.0.8-beta.67` also gets `latest` this way, so `latest` can point at a beta.',
			'Line 28 signs `tag@digest` for each tag. A tag can move to another image later, and the signature stays tied to the digest that was built.',
			'Line 17 pins a third-party action by full commit SHA, with the version in a comment. The workflow does this for every third-party action (only GitHub\'s own `actions/checkout@v4` uses a tag), the same way you pin an image by digest.'
		]
	},
	tradeoff: {
		gain: [
			'A digest names exactly one image: same bytes in staging and in production, and a clean rollback target.',
			'Tags like `1.4.2` stay readable for humans and in release notes.',
			'A registry gives every server and cluster one place to pull from, with access control.'
		],
		cost: [
			'Digests are long and unreadable, so you need tooling (CI output, Renovate or Dependabot) to update them.',
			'Pinning a base image by digest means you no longer get security fixes automatically. Someone has to bump it.',
			'A registry is now part of your deploy path: if it is down or rate limited, nothing new can start.'
		]
	},
	task: {
		prompt: 'Your production servers run `docker pull acme/api:latest && docker compose up -d` from a cron job. On Monday two of five servers behave differently from the rest. Explain what probably happened, and change the deploy so it cannot happen again.',
		hint: 'What did `latest` point to when each server last pulled? What name would always mean the same image?',
		answer: [
			'Someone pushed a new image to `latest` between pulls. Servers that pulled before and after run **different images under the same name**.',
			'Stop deploying `latest`. CI tags each build with something unique (the Git tag or commit SHA) and records the **digest** from the push.',
			'The deploy uses `acme/api@sha256:...` (or at least an immutable version tag), set in Git, so every server pulls the same image.',
			'To roll back, put the previous digest back and redeploy.'
		],
		steps: [
			{
				title: 'Read the symptom',
				questions: [
					{ q: 'All five servers ran `docker pull acme/api:latest`. Does that mean they run the same image?', options: ['Yes: same name, same image', 'Yes, if they pulled the same day', 'No: `latest` may have pointed at different images when each one pulled', 'No: each server builds its own image'], answer: 2, why: 'A tag is a movable name. The same name can mean different images at different times.' },
					{ q: 'What does the cron job pull each time it runs?', options: ['Whatever `latest` points at in that moment', 'The image the server already has', 'The newest digest of the stable release', 'The image named in Git'], answer: 0, why: 'Pulling a tag asks the registry what the tag points at now.' },
					{ q: 'Who can move `acme/api:latest`?', options: ['Only Docker Hub staff', 'Nobody once it is pushed', 'Only the server that pulls it', 'Anyone who can push to the repository'], answer: 3, why: 'Anyone who can push can point `latest` at a new image.' },
					{ q: 'What would show you which image each server really runs?', options: ['The tag name', 'The image digest on each server', 'The cron schedule', 'The size of the compose file'], answer: 1, why: 'A digest is a hash of the content. Two images with the same digest have the same bytes.' }
				]
			},
			{
				title: 'Name the cause',
				questions: [
					{ q: 'What most likely happened before Monday?', options: ['Two servers have a corrupted disk', 'The registry served a random image', 'Someone pushed a new image to `latest` between the servers\' pulls', 'The compose file changed on two servers'], answer: 2, why: 'Servers that pulled before and after the push run different images under the same name.' },
					{ q: 'What does `latest` mean on a registry?', options: ['Just a tag, moved by whoever pushes it', 'The newest stable version', 'The image with the highest version number', 'The image most servers run'], answer: 0, why: '`latest` is a tag like any other. It looks like a version, but nothing guarantees it.' },
					{ q: 'With `docker/metadata-action` defaults, which Git tag can move `latest`?', options: ['Only a stable `v1.2.3`', 'Only a manual push', 'Branch pushes only', 'A tag like `v2.0.8-beta.67` too'], answer: 3, why: 'Its README shows a beta tag also gets `latest`, so `latest` can point at a beta.' },
					{ q: 'Why is this hard to see from the servers?', options: ['Docker hides the digest', 'All five report the same image name', 'The servers have no logs', 'Registries delete old images'], answer: 1, why: 'Every server says `acme/api:latest`. The name is the same, the bytes are not.' }
				]
			},
			{
				title: 'Change the deploy',
				questions: [
					{ q: 'How should CI tag each build?', options: ['With `latest` only', 'With the date of the week', 'With something unique, like the Git tag or commit SHA', 'With the server name'], answer: 2, why: 'A unique tag per build stops two builds from sharing one name.' },
					{ q: 'What should CI record after the push?', options: ['The image size', 'The digest of the pushed image', 'The cron schedule', 'The list of servers'], answer: 1, why: 'The digest names exactly the image that was built and pushed.' },
					{ q: 'Which reference should the servers deploy?', options: ['`acme/api:latest`', '`acme/api`, with no tag', '`acme/api:stable`', '`acme/api@sha256:...`, set in Git'], answer: 3, why: 'A digest cannot be moved to other content, so every server pulls the same image.' },
					{ q: 'What is the cost of deploying by digest?', options: ['Digests are long, so you need tooling to update them', 'Pulls get slower', 'The registry stops storing tags', 'You can no longer roll back'], answer: 0, why: 'Digests are unreadable, so CI output, Renovate or Dependabot keep them up to date.' }
				]
			},
			{
				title: 'Plan the rollback',
				questions: [
					{ q: 'The new digest is broken. How do you roll back?', options: ['Push the old image to `latest` again', 'Put the previous digest back in Git and redeploy', 'Delete the new image from the registry', 'Wait for the cron job'], answer: 1, why: 'The previous digest still names the old bytes, whatever happened to the tags.' },
					{ q: 'Why is the old digest a safe rollback target?', options: ['It always names the same bytes', 'It is shorter than a tag', 'Registries keep it on top', 'It skips the pull'], answer: 0, why: 'Pull by digest and you get exactly that image, forever.' },
					{ q: 'Why keep the digest in Git rather than only on the servers?', options: ['Git can pull images', 'Servers cannot store digests', 'Docker requires it', 'Every server reads the same value, and the change is reviewed'], answer: 3, why: 'One value in Git means one image everywhere, and the history shows what ran when.' },
					{ q: 'Which part of the deploy path can still stop a rollout?', options: ['The digest', 'Git', 'The registry, if it is down or rate limited', 'The tag name'], answer: 2, why: 'A registry is part of your deploy path. If it is unreachable, nothing new can start.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'What is the difference between an image tag and an image digest?',
			options: [
				'A tag is a hash of the content, a digest is a human name you can move to a new build',
				'A tag is a movable name, a digest is a hash of the content that always means the same image',
				'They are the same thing with two names, one short and one long',
				'A digest only exists for images on Docker Hub, other registries use tags only'
			],
			answer: 1,
			why: 'A push can point a tag at a new image. A digest (`sha256:...`) is computed from the content, so pulling by digest always returns the same image.'
		},
		{
			q: 'You run `docker pull nginx` with no tag and no registry. What do you get?',
			options: [
				'An error, because a tag is required',
				'`docker.io/library/nginx:latest`',
				'The newest stable version, chosen by Docker',
				'The version already installed on the host'
			],
			answer: 1,
			why: 'With no registry Docker uses Docker Hub (`docker.io`), with no namespace it uses `library`, and with no tag it uses `latest`.'
		},
		{
			q: 'Why does the GitHub starter workflow sign `tag@digest` instead of just the tag?',
			options: [
				'Because cosign cannot read tags, so it needs the digest to find the image',
				'Because tags can be moved to other content, the digest identifies the exact image that was built',
				'Because digests are shorter to store in the signature than full tag names',
				'To avoid pushing the tag twice when the workflow runs on both push and release'
			],
			answer: 1,
			why: 'A signature on a movable name would say nothing about what the name points to tomorrow. Signing the digest ties it to those exact bytes.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Run a registry on localhost, move `latest` under a "server", and pull the old image back by digest.',
		steps: [
			'Start a local registry: `docker run -d --name lab-registry -p 5001:5000 registry:2`.',
			'Build and push v1 as `1.0` and `latest`: `printf \'FROM busybox:1.36\\nCMD ["echo", "api v1"]\\n\' | docker build -t localhost:5001/api:1.0 - && docker tag localhost:5001/api:1.0 localhost:5001/api:latest && docker push localhost:5001/api:1.0 && docker push localhost:5001/api:latest`. Note the digest: `docker inspect --format \'{{index .RepoDigests 0}}\' localhost:5001/api:1.0`.',
			'Push v2 under `2.0` and the same `latest`: `printf \'FROM busybox:1.36\\nCMD ["echo", "api v2"]\\n\' | docker build -t localhost:5001/api:2.0 - && docker tag localhost:5001/api:2.0 localhost:5001/api:latest && docker push localhost:5001/api:2.0 && docker push localhost:5001/api:latest`.',
			'Play a fresh server: `docker rmi localhost:5001/api:1.0 localhost:5001/api:2.0 localhost:5001/api:latest`, then `docker run --rm localhost:5001/api:latest`, then `docker run --rm localhost:5001/api@sha256:...` with the digest from step 2.',
			'List the tags and clean up: `curl -s http://localhost:5001/v2/api/tags/list`, then `docker rm -f lab-registry`.'
		],
		done: [
			'`docker run --rm localhost:5001/api:latest` prints `api v2`: the tag moved.',
			'`docker run --rm localhost:5001/api@sha256:...` prints `api v1`, and the pull output shows the same `Digest:` you noted.',
			'`curl` lists `latest`, `1.0` and `2.0` in the `api` repository.'
		],
		solution: [
			'Both pushes of `latest` were accepted: the registry let the tag point at new content without complaint.',
			'A server that pulled `latest` after step 2 runs v1, one that pulled after step 3 runs v2. Same name, different bytes.',
			'The digest from step 2 still pulls v1, which is why the deploy pins `acme/api@sha256:...` and a rollback puts the old digest back.'
		]
	},
	recall: {
		q: 'Two servers pulled `acme/api:latest` a week apart. Why can they run different code, and what reference makes them pull the same image?',
		a: 'A push moved `latest` to a new image between the two pulls. `acme/api@sha256:...`, the digest, always names the same bytes.'
	},
	sources: [
		{ title: 'Docker docs, What is a registry?', url: 'https://docs.docker.com/get-started/docker-concepts/the-basics/what-is-a-registry/' },
		{ title: 'Docker docs, docker image tag (image name format)', url: 'https://docs.docker.com/reference/cli/docker/image/tag/' },
		{ title: 'Docker docs, docker image pull (pull by digest)', url: 'https://docs.docker.com/reference/cli/docker/image/pull/' },
		{ title: 'Docker docs, Pin base image versions', url: 'https://docs.docker.com/build/building/best-practices/' },
		{ title: 'GitHub docs, Working with the Container registry', url: 'https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry' }
	]
};
