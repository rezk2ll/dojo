const COMPOSE = 'https://github.com/docker/awesome-compose/blob/30f4b7f6a6c3b0c0ecf4d4efb0de203c48d11562';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'small-safe-images',
	part: 'Containers',
	title: 'Small, safe images',
	minutes: 10,
	hook: [
		'You would never leave `gcc`, `make` and a root shell on a production web server "just in case". Yet a naive image ships the compiler, the package cache and the test files, all running as root.',
		'Every extra package is something to patch and something an attacker can use. Every node pulls every extra megabyte on every deploy.',
		'Four changes fix most of it: a multi-stage build, a non-root user, a `.dockerignore` file and a **minimal base image**.'
	],
	terms: [
		{ term: 'Multi-stage build', def: 'A Dockerfile with several `FROM` lines. Early stages build, the last stage copies only the result with `COPY --from`. Build tools stay behind.' },
		{ term: 'Stage', def: 'Everything from one `FROM` to the next. You can name it with `AS builder` and build only up to it with `--target`.' },
		{ term: 'Non-root user', def: 'A `USER` line so the app does not run as UID 0. Without one, in your Dockerfile or in the base image, the default user in a container is root.' },
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
				note: 'The builder stage has the full Go toolchain, so it is big. Its size does not matter, because **it never ships**.'
			},
			{
				add: [
					'subgraph f["Stage 2: final"]',
					'scr["FROM scratch"] --> app["only the binary"]',
					'end',
					'bin -->|COPY --from=builder| app'
				],
				highlight: ['scr', 'app'],
				note: 'The final stage starts from an empty image and copies **just the binary**. The compiler and the sources stay in the builder stage, and the final image does not contain them.'
			},
			{
				add: [
					'ign[".dockerignore: .git, node_modules"]',
					'ign -.->|keeps out of context| sdk',
					'class ign ext'
				],
				highlight: ['ign'],
				note: '`.dockerignore` lists paths to remove from the build context **before** they reach the builder. Builds send less data, and a `COPY . .` cannot put `.git` or `.env` into the image.'
			},
			{
				add: [
					'usr["USER 10001:10001"]',
					'app --> usr'
				],
				highlight: ['usr'],
				note: 'Add a `USER` line in the final stage. Give a group too: if the user has no primary group, the process runs with the **root group**.'
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
			'Line 2 starts the `builder` stage, with Go, Alpine and the source. Line 18 starts the last stage, `FROM scratch`: an **empty** image holding one static binary (`CGO_ENABLED 0` is set in the lines cut here).',
			'Lines 6 to 10 use the cache order from yesterday: `go.mod` and `go.sum` first, then `go mod download`, then the rest. `--mount=type=cache` also keeps Go\'s download cache between builds without putting it in a layer.',
			'The file has no `USER` line, so the binary runs as root. Root in an empty filesystem has few tools to misuse, and `USER 10001:10001` after line 19 would remove root entirely.',
			'The [compose file](https://github.com/docker/awesome-compose/blob/30f4b7f6a6c3b0c0ecf4d4efb0de203c48d11562/nginx-golang-postgres/compose.yaml#L2-L5) builds with `target: builder`, the big stage, because it is a dev setup. A plain `docker build` builds the last stage.'
		]
	},
	tradeoff: {
		gain: [
			'An image with fewer packages has fewer CVEs to patch and fewer tools for an attacker.',
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
			'Multi-stage: build in a `node:22` stage (`npm ci`, `npm run build`), then copy only the build output and production dependencies into a final stage.',
			'Minimal base for the final stage: a slim variant or a distroless Node image instead of the full `node:22`.',
			'`.dockerignore`: list `.git`, `node_modules`, `.env` and test data, so they never reach the builder or the image.',
			'`USER`: set a non-root user and group in the final stage (the official Node images [ship a `node` user](https://github.com/nodejs/docker-node/blob/02641286c1f5041d9025d3cf6d38a64b84cd72e5/docs/BestPractices.md#non-root-user) with UID 1000), then check the app can still write where it needs to.'
		],
		steps: [
			{
				title: 'Split the build',
				questions: [
					{ q: 'Which change cuts the most from a 1 GB image that ships its build tools?', options: ['A `.dockerignore`', 'A `USER` line', 'A multi-stage build', 'A shorter `CMD`'], answer: 2, why: 'Build tools, caches and sources stay in the build stage. Only the result reaches the final image.' },
					{ q: 'What runs in the first stage?', options: ['`npm ci` and `npm run build`, in a `node:22` stage', 'Only the final `CMD`', 'Nothing: the first stage is empty', 'The vulnerability scanner'], answer: 0, why: 'The build stage can be big. Its size does not matter, because it never ships.' },
					{ q: 'The final stage copies the whole `node_modules` from the build stage, dev dependencies included. What is the result?', options: ['Nothing changes: `COPY --from` drops dev dependencies', 'The build fails', 'The final image is the same size as the build stage', 'Test and build tools ship again: more megabytes and more packages to patch'], answer: 3, why: '`COPY --from` takes exactly what you name. Copy only the build output and production dependencies, or the tools you left behind come back.' },
					{ q: 'You want an image of the build stage only, to debug `npm run build`. What do you pass to `docker build`?', options: ['`--no-cache`', '`--target` with the stage name, like `--target build`', '`--from=build`', 'Nothing: comment out the final stage'], answer: 1, why: 'Name the stage with `AS build`, then `--target` builds only up to it.' }
				]
			},
			{
				title: 'Pick a minimal base',
				questions: [
					{ q: 'What should the final stage start from instead of the full `node:22`?', options: ['A slim variant or a distroless Node image', '`node:22` again, to be safe', 'An Ubuntu image with Node installed', 'The build stage itself'], answer: 0, why: 'A minimal base holds little besides what the app needs.' },
					{ q: 'Why does a smaller base mean fewer CVEs?', options: ['Scanners skip small images', 'Small images are always newer', 'Fewer packages means fewer things to patch', 'CVEs only affect compilers'], answer: 2, why: 'Every extra package is something to patch and something an attacker can use.' },
					{ q: 'What do you lose with distroless?', options: ['The ability to run Node', 'Image layers', 'Multi-stage builds', 'A shell, so `docker exec ... sh` fails'], answer: 3, why: 'Distroless has no shell and no package manager. Its `debug` tags exist for that case.' },
					{ q: 'What must you check after moving to a minimal base?', options: ['That the image is over 100 MB', 'That runtime files like CA certificates and time zone data are still there', 'That `gcc` is still installed', 'That the base runs as root'], answer: 1, why: 'Multi-stage files need care to copy every file the app needs at runtime.' }
				]
			},
			{
				title: 'Filter the build context',
				questions: [
					{ q: 'With no `.dockerignore`, what does `COPY . .` take?', options: ['Only tracked Git files', 'Only `package.json`', 'Everything in the context, `.git` and `.env` included', 'Nothing until you list the files'], answer: 2, why: 'The builder receives the whole context, and `COPY . .` copies all of it.' },
					{ q: 'Which paths go into `.dockerignore` here?', options: ['`.git`, `node_modules`, `.env` and test data', '`package.json` and the lock file', '`Dockerfile` only', 'The final stage\'s output'], answer: 0, why: 'They never reach the builder, so they cannot end up in the image.' },
					{ q: '`.env` is already listed in `.gitignore`. Does that keep it out of the build context?', options: ['Yes: the builder reads `.gitignore` too', 'Yes, if the file is untracked', 'Only for `git push`, and for `docker push`', 'No: the builder reads only `.dockerignore`'], answer: 3, why: 'The context is the folder on disk, not the Git repo. `.gitignore` keeps files out of commits; only `.dockerignore` keeps them away from the builder.' },
					{ q: 'Why ignore `node_modules` when `npm ci` runs in the image anyway?', options: ['npm refuses to run otherwise', 'So builds send less data, and your local copy stays out of the image', 'To make `CMD` faster', 'Because it holds the CVEs'], answer: 1, why: 'Ignored paths never reach the builder, so builds send less and `COPY . .` cannot pick them up.' }
				]
			},
			{
				title: 'Drop root',
				questions: [
					{ q: 'In the multi-stage file, which stage gets the `USER` line?', options: ['Only the build stage', 'The final stage, the one that ships', 'Both, or the build fails', 'Neither: only `docker run --user` can set it'], answer: 1, why: 'The final image is the last stage. A `USER` line in the build stage never reaches production.' },
					{ q: 'Which user can you use in the official Node images?', options: ['`admin`, UID 0', '`www-data`', 'Only a UID you create yourself', '`node`, with UID 1000'], answer: 3, why: 'The official Node images ship a `node` user with UID 1000.' },
					{ q: 'Why give a group as well, as in `USER 10001:10001`?', options: ['Without a primary group, the process runs with the root group', 'Docker rejects a user with no group', 'Groups make the image smaller', 'It sets file permissions on the host'], answer: 0, why: 'A user with no primary group gets the root group.' },
					{ q: 'The app now fails to write its upload folder. What fixes it?', options: ['Switch back to root', 'Remove the `USER` line in production only', 'Give the folder to the app user, for example with `COPY --chown`', 'Mount the host\'s `/`'], answer: 2, why: 'A non-root user cannot write to root-owned paths, so you fix ownership of what the app writes.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'In a multi-stage build, what ends up in the final image?',
			options: [
				'Every stage, stacked on top of each other as layers in the order they appear',
				'Only the last stage, plus whatever it copies from earlier stages with `COPY --from`',
				'Only the first stage, since later stages just add build steps on top of it',
				'The build cache of all stages, so the next build can start from it'
			],
			answer: 1,
			why: 'Each `FROM` starts a new stage. The image is the stage you build (by default the last one), and earlier stages contribute only what `COPY --from` takes from them.'
		},
		{
			q: 'Neither your Dockerfile nor its base image has a `USER` instruction. Which user does the container process run as?',
			options: ['nobody', 'The user who ran `docker build`', 'root (UID 0)', 'A random unprivileged UID'],
			answer: 2,
			why: 'Docker starts the process as root (UID 0) unless a `USER` line in the Dockerfile or the base image says otherwise.'
		},
		{
			q: 'What does a `.dockerignore` file do?',
			options: [
				'Removes matching files from the final image after the build',
				'Excludes matching files from the build context before it is sent to the builder',
				'Tells `docker push` which layers to skip when uploading to the registry',
				'Lists base images Docker should never pull, even when a `FROM` names them'
			],
			answer: 1,
			why: 'Files matching `.dockerignore` are removed from the context before the builder sees it, so `COPY` cannot pick them up.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Build a Go app in two stages, compare the builder with the final image, and watch `.dockerignore` and `USER` do their job.',
		steps: [
			'Make the app and a fake secret: `mkdir -p ~/image-lab && cd ~/image-lab && printf \'package main; import ("fmt"; "os"); func main() { fmt.Println("uid", os.Getuid(), "gid", os.Getgid()) }\\n\' > main.go && echo DB_PASSWORD=hunter2 > .env`.',
			'Write a two-stage Dockerfile: `printf \'FROM golang:1.22-alpine AS builder\\nWORKDIR /code\\nCOPY . .\\nRUN CGO_ENABLED=0 go build -o /app main.go\\n\\nFROM scratch\\nCOPY --from=builder /app /app\\nUSER 10001:10001\\nCMD ["/app"]\\n\' > Dockerfile`.',
			'Build both stages and compare: `docker build --target builder -t lab-go:builder . && docker build -t lab-go:final . && docker images lab-go`.',
			'Run and probe: `docker run --rm lab-go:final`, `docker run --rm lab-go:builder id`, `docker run --rm lab-go:final sh`, and `docker run --rm lab-go:builder ls -a /code`.',
			'Add the ignore file and rebuild the builder: `printf \'.env\\n.git\\n\' > .dockerignore && docker build --target builder -t lab-go:builder . && docker run --rm lab-go:builder ls -a /code`. Clean up with `docker rmi lab-go:builder lab-go:final`.'
		],
		done: [
			'`docker images lab-go` shows the final image at a few MB and the builder at hundreds of MB.',
			'`docker run --rm lab-go:final` prints `uid 10001 gid 10001`, while the builder\'s `id` prints `uid=0(root)`.',
			'`docker run --rm lab-go:final sh` fails with `exec: "sh": executable file not found`.',
			'Before step 5, `ls -a /code` lists `.env`; after it, `.env` is gone.'
		],
		solution: [
			'The final image is `FROM scratch` plus one static binary. Go, Alpine and the source stay in the builder stage.',
			'`USER 10001:10001` sets both user and group, so the process never runs as root or with the root group.',
			'Without `.dockerignore`, `COPY . .` took the secret along. With it, the builder never receives `.env`.'
		]
	},
	recall: {
		q: 'In the Go backend Dockerfile, what does the final image contain, and which user runs it?',
		a: 'Only the `backend` binary, copied with `COPY --from=builder` onto `FROM scratch`. With no `USER` line it runs as root, and `USER 10001:10001` would fix that.'
	},
	sources: [
		{ title: 'Docker docs, Multi-stage builds', url: 'https://docs.docker.com/build/building/multi-stage/' },
		{ title: 'Docker docs, Building best practices', url: 'https://docs.docker.com/build/building/best-practices/' },
		{ title: 'Docker docs, Build context and .dockerignore', url: 'https://docs.docker.com/build/concepts/context/' },
		{ title: 'Docker docs, Dockerfile reference (USER)', url: 'https://docs.docker.com/reference/dockerfile/' },
		{ title: 'GoogleContainerTools, distroless images', url: 'https://github.com/GoogleContainerTools/distroless/blob/7e55c167b7c993f738e933c3bc0f46190a5b367d/README.md' }
	]
};
