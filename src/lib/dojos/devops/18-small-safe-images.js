const COMPOSE = 'https://github.com/docker/awesome-compose/blob/30f4b7f6a6c3b0c0ecf4d4efb0de203c48d11562';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'small-safe-images',
	part: 'Containers',
	title: 'Small, safe images: ship the binary, not the toolbox',
	minutes: 10,
	hook: [
		'You would never leave `gcc`, `make` and a root shell on a production web server "just in case". Yet a naive image does exactly that: the compiler, the package cache, the test files, all running as root.',
		'Every extra package is something to patch and something an attacker can use. Every extra megabyte is pulled on every deploy.',
		'Four habits fix most of it: **multi-stage builds**, a **non-root user**, a **`.dockerignore`**, and a **minimal base image**. Today you apply all four.'
	],
	terms: [
		{ term: 'Multi-stage build', def: 'A Dockerfile with several `FROM` lines. Early stages build, the last stage copies only the result with `COPY --from`. Build tools stay behind.' },
		{ term: 'Stage', def: 'Everything from one `FROM` to the next. You can name it with `AS builder` and build only up to it with `--target`.' },
		{ term: 'Non-root user', def: 'A `USER` line so the app does not run as UID 0. Without one, in your Dockerfile or in the base image, the default user in a container is root.' },
		{ term: '.dockerignore', def: 'A file listing paths to leave out of the build context, like `.git` or `node_modules`. They never reach the builder.' },
		{ term: 'Minimal base image', def: 'A base with little or nothing besides what the app needs: `scratch` (empty), distroless (no shell, no package manager), or a slim variant.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: [
					'subgraph b["Stage 1: builder"]',
					'sdk["golang image with compiler"] --> bin["go build: one binary"]',
					'end'
				],
				highlight: ['sdk', 'bin'],
				note: 'The **builder stage** has the full toolchain. It is big, and that is fine: it never ships.'
			},
			{
				add: [
					'subgraph f["Stage 2: final"]',
					'scr["FROM scratch"] --> app["only the binary"]',
					'end',
					'bin -->|COPY --from=builder| app'
				],
				highlight: ['scr', 'app'],
				note: 'The **final stage** starts from an empty image and copies **just the binary**. The compiler and the sources are left behind, not saved in the result.'
			},
			{
				add: [
					'ign[".dockerignore: .git, node_modules"]',
					'ign -.->|keeps out of context| sdk',
					'class ign ext'
				],
				highlight: ['ign'],
				note: '`.dockerignore` removes files from the build context **before** they reach the builder. Faster builds, and no `.git` or `.env` sneaking into an image by a `COPY . .`.'
			},
			{
				add: [
					'usr["USER 10001:10001"]',
					'app --> usr'
				],
				highlight: ['usr'],
				note: 'Add a **`USER`** line in the final stage. Give a group too: if the user has no primary group, the process runs with the **root group**.'
			}
		]
	},
	example: {
		title: 'nginx-golang-postgres/backend/Dockerfile',
		repo: 'docker/awesome-compose',
		url: `${COMPOSE}/nginx-golang-postgres/backend/Dockerfile#L1-L41`,
		lang: 'dockerfile',
		code: `# syntax=docker/dockerfile:1.4
FROM --platform=$BUILDPLATFORM golang:1.18-alpine AS builder

WORKDIR /code
…
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod/cache \\
    go mod download

COPY . .

RUN --mount=type=cache,target=/go/pkg/mod/cache \\
    --mount=type=cache,target=/go-build \\
    go build -o bin/backend main.go

CMD ["/code/bin/backend"]
…
FROM scratch
COPY --from=builder /code/bin/backend /usr/local/bin/backend
CMD ["/usr/local/bin/backend"]`,
		notes: [
			'The `builder` stage has Go, Alpine and the source. The last stage is `FROM scratch`: an **empty** image holding one static binary (`CGO_ENABLED 0` is set in the lines cut here).',
			'Same cache trick as yesterday: `go.mod` and `go.sum` first, then `go mod download`, then the rest. `--mount=type=cache` also keeps Go\'s download cache between builds without putting it in a layer.',
			'There is **no `USER` line**, so the binary runs as root. It is root in an empty filesystem, which limits the damage, but `USER 10001:10001` in the last stage costs nothing.',
			'Watch the [compose file](https://github.com/docker/awesome-compose/blob/30f4b7f6a6c3b0c0ecf4d4efb0de203c48d11562/nginx-golang-postgres/compose.yaml#L2-L5): it builds with `target: builder`, the big stage, because it is a dev setup. A plain `docker build` builds the last stage.'
		]
	},
	tradeoff: {
		gain: [
			'Fewer packages, fewer CVEs to patch and fewer tools for an attacker.',
			'Smaller images pull faster on every deploy and every new node.',
			'A non-root process cannot write where root could, so a compromise stays smaller.'
		],
		cost: [
			'No shell in `scratch` or distroless: `docker exec ... sh` fails, so debugging needs other tools (distroless ships `debug` tags for that).',
			'Multi-stage Dockerfiles are longer and need care to copy every file the app needs at runtime (CA certificates, time zone data).',
			'A non-root user cannot write to root-owned paths, so you fix file ownership (`COPY --chown`) for anything the app writes.'
		]
	},
	task: {
		prompt: 'Your Node.js image is `FROM node:22`, does `COPY . .` and `RUN npm ci`, has no `.dockerignore`, and runs as root. It is over 1 GB and the scanner reports hundreds of CVEs. Write down the four changes you would make, in order of impact.',
		hint: 'One change each for: what is in the base, what reaches the builder, what ends up in the final stage, and who runs the process.',
		answer: [
			'**Multi-stage**: build in a `node:22` stage (`npm ci`, `npm run build`), then copy only the build output and production dependencies into a final stage.',
			'**Minimal base** for the final stage: a slim variant or a distroless Node image instead of the full `node:22`.',
			'**`.dockerignore`** with `.git`, `node_modules`, `.env` and test data, so they never reach the builder or the image.',
			'**`USER`** with a non-root user and group in the final stage (the official Node images [ship a `node` user](https://github.com/nodejs/docker-node/blob/02641286c1f5041d9025d3cf6d38a64b84cd72e5/docs/BestPractices.md#non-root-user) with UID 1000), then check the app can still write where it needs to.'
		]
	},
	quiz: [
		{
			q: 'In a multi-stage build, what ends up in the final image?',
			options: [
				'Every stage, stacked on top of each other',
				'Only the last stage, plus whatever it copies from earlier stages with `COPY --from`',
				'Only the first stage',
				'The build cache of all stages'
			],
			answer: 1,
			why: 'Each `FROM` starts a new stage. The image is the stage you build (by default the last one), and earlier stages contribute only what `COPY --from` takes from them.'
		},
		{
			q: 'Neither your Dockerfile nor its base image has a `USER` instruction. Which user does the container process run as?',
			options: ['nobody', 'The user who ran `docker build`', 'root (UID 0)', 'A random unprivileged UID'],
			answer: 2,
			why: 'The default user inside a container is root. You need a `USER` line to change it.'
		},
		{
			q: 'What does a `.dockerignore` file do?',
			options: [
				'Removes matching files from the final image after the build',
				'Excludes matching files from the build context before it is sent to the builder',
				'Tells `docker push` which layers to skip',
				'Lists images Docker should never pull'
			],
			answer: 1,
			why: 'Files matching `.dockerignore` are removed from the context before the builder sees it, so `COPY` cannot pick them up.'
		}
	],
	takeaway: 'Build with everything, ship with nothing: a multi-stage build onto a minimal base, a `.dockerignore`, and a `USER` that is not root.',
	sources: [
		{ title: 'Docker docs, Multi-stage builds', url: 'https://docs.docker.com/build/building/multi-stage/' },
		{ title: 'Docker docs, Building best practices', url: 'https://docs.docker.com/build/building/best-practices/' },
		{ title: 'Docker docs, Build context and .dockerignore', url: 'https://docs.docker.com/build/concepts/context/' },
		{ title: 'Docker docs, Dockerfile reference (USER)', url: 'https://docs.docker.com/reference/dockerfile/' },
		{ title: 'GoogleContainerTools, distroless images', url: 'https://github.com/GoogleContainerTools/distroless/blob/7e55c167b7c993f738e933c3bc0f46190a5b367d/README.md' }
	]
};
