const STARTER = 'https://github.com/actions/starter-workflows/blob/e3c451d60f119b71caebf13c98ac45da6e15b4b7';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'registries-and-tags',
	part: 'Containers',
	title: 'Registries and tags: "latest" is not a version',
	minutes: 10,
	hook: [
		'You know apt repositories: a server holds packages, you pin `nginx=1.24.0-1` so every server gets the same build. A **registry** is the same idea for images.',
		'The trap is the name. `myapp:latest` looks like a version. It is a **label someone can move**. Two servers that pulled `latest` a week apart can run different code, and the name on both says the same thing.',
		'Today you learn the difference between a **tag** (a movable name) and a **digest** (the content\'s fingerprint), and how to deploy something you can name exactly.'
	],
	terms: [
		{ term: 'Registry', def: 'A server that stores and serves images: Docker Hub, GitHub Container Registry (`ghcr.io`), your cloud\'s registry, or one you host.' },
		{ term: 'Repository', def: 'One image name in a registry, like `ghcr.io/acme/myapp`. It holds many versions of that image.' },
		{ term: 'Tag', def: 'A human name for one version, like `1.4.2` or `latest`. Tags are mutable: a push can point the same tag at a new image.' },
		{ term: 'Digest', def: 'A `sha256:...` hash of the image content. Same digest means same bytes. It cannot be moved to other content.' },
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
				note: 'CI builds the image and **pushes** it to a **registry**. Servers and clusters **pull** from there. No more copying tarballs with scp.'
			},
			{
				add: [
					'dg["sha256:aaa..."]',
					'reg --> dg',
					't1["tag 1.4.2"] -.-> dg',
					'tl["tag latest"] -.-> dg'
				],
				highlight: ['dg', 't1', 'tl'],
				note: 'The registry stores content by **digest**. Tags are just names pointing at a digest. Right now `1.4.2` and `latest` point at the same image.'
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
				note: 'Pull **by digest** and you get exactly that image, forever, whatever happens to the tags. Rollback is "deploy the previous digest", with no guessing.'
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
			'This is GitHub\'s starter workflow for publishing an image. It pushes to `ghcr.io`, GitHub\'s registry, under the repository\'s own name.',
			'Tags come from `docker/metadata-action` with its defaults: a branch push gives a tag named after the branch, a Git tag `v1.2.3` gives `v1.2.3` **and `latest`**, a nightly run gives `nightly`. Its [README](https://github.com/docker/metadata-action/blob/96383f45573cb7f253c731d3b3ab81c87ef81934/README.md#latest-tag) shows even `v2.0.8-beta.67` gets `latest` this way. A beta becomes "latest".',
			'The signing step signs `tag@digest`, not the tag alone. Tags move. The digest is the thing worth signing.',
			'Look at the `uses:` lines: the workflow pins the third-party actions by full commit SHA, with the version in a comment (only GitHub\'s own `actions/checkout@v4` uses a tag). Same idea as pinning an image by digest.'
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
			'Rollback becomes: put the previous digest back and redeploy.'
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
			why: 'Tags are mutable pointers. A digest (`sha256:...`) is computed from the content, so pulling by digest always returns the same image.'
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
	takeaway: 'Tags are for humans and they move. Digests are for machines and they do not. Deploy something you can name exactly.',
	sources: [
		{ title: 'Docker docs, What is a registry?', url: 'https://docs.docker.com/get-started/docker-concepts/the-basics/what-is-a-registry/' },
		{ title: 'Docker docs, docker image tag (image name format)', url: 'https://docs.docker.com/reference/cli/docker/image/tag/' },
		{ title: 'Docker docs, docker image pull (pull by digest)', url: 'https://docs.docker.com/reference/cli/docker/image/pull/' },
		{ title: 'Docker docs, Pin base image versions', url: 'https://docs.docker.com/build/building/best-practices/' },
		{ title: 'GitHub docs, Working with the Container registry', url: 'https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry' }
	]
};
