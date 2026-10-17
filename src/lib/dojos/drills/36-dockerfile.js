/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'dockerfile',
	part: 'Ops tools',
	title: 'Dockerfile lines',
	minutes: 10,
	hook: [
		'The `orders` service is a small Node.js API. You write its Dockerfile from an empty file, one line per rep, so that the image runs as a normal user and starts with `docker run orders`.',
		'The build context is the folder `orders/`. It holds `package.json` (one dependency, `ms`, and one dev dependency, `is-number`), `package-lock.json`, `server.js` (an HTTP server on port 3000) and `worker.js` (prints `worker run` and exits). The base image is `node:22-bookworm-slim`, a Debian image that has a `node` user with uid 1000. The app goes in `/app`.'
	],
	terms: [
		{ term: 'build context', def: 'The folder you pass to `docker build`. `COPY` can only read files from it.' },
		{ term: 'layer', def: 'The file changes one instruction adds to the image. When a layer changes, Docker rebuilds it and every layer after it.' },
		{ term: 'exec form', def: 'An instruction written as a JSON array, like `CMD ["node", "server.js"]`. Docker runs the program directly, with no `/bin/sh -c` around it.' }
	],
	reps: [
		{
			prompt: 'Write the first line: start from the image `node` with the tag `22-bookworm-slim`.',
			accept: ['FROM node:22-bookworm-slim', 'from node:22-bookworm-slim', 'FROM docker.io/library/node:22-bookworm-slim'],
			why: '`FROM` sets the base image, and the part after `:` is the tag. Docker also reads `from` in lowercase, but the docs write instructions in UPPERCASE by convention.'
		},
		{
			prompt: 'Make `/app` the working directory for every later line and for the running container.',
			accept: ['WORKDIR /app', 'WORKDIR /app/'],
			why: '`WORKDIR /app` sets the directory for the `RUN`, `CMD`, `ENTRYPOINT`, `COPY` and `ADD` lines after it. Docker creates `/app` if it does not exist.'
		},
		{
			prompt: 'Copy only `package.json` and `package-lock.json` into the working directory, before the source code.',
			accept: [
				'COPY package.json package-lock.json ./',
				'COPY package-lock.json package.json ./',
				'COPY package*.json ./',
				'COPY package.json package-lock.json /app/',
				'COPY package*.json /app/',
				'COPY package.json package-lock.json .',
				'COPY package*.json .'
			],
			why: 'With two sources, the last argument `./` is the destination directory, here `/app`. A change in `server.js` then leaves this layer and the next `npm ci` layer in the build cache.'
		},
		{
			prompt: 'Install the dependencies from the lockfile with `npm ci`, without the dev dependencies.',
			accept: ['RUN npm ci --omit=dev', 'RUN npm ci --omit dev', 'RUN npm clean-install --omit=dev', 'RUN npm ci --production'],
			why: '`npm ci` installs exactly what `package-lock.json` lists and stops with an error if it does not match `package.json`. `--omit=dev` skips `is-number`, so `node_modules` holds only `ms`.'
		},
		{
			prompt: 'In one `RUN` line, refresh the apt package lists, install `curl` with no prompt and no recommended packages, then delete `/var/lib/apt/lists/*`.',
			accept: [
				'RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*',
				'RUN apt-get update && apt-get install --no-install-recommends -y curl && rm -rf /var/lib/apt/lists/*',
				'RUN apt-get update && apt-get install --yes --no-install-recommends curl && rm -rf /var/lib/apt/lists/*',
				'RUN apt-get update && apt-get install --no-install-recommends --yes curl && rm -rf /var/lib/apt/lists/*',
				'RUN apt-get update && apt-get --no-install-recommends install -y curl && rm -rf /var/lib/apt/lists/*',
				'RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -fr /var/lib/apt/lists/*'
			],
			why: '`-y` answers yes to every prompt, so `apt-get` runs without waiting for input. The `rm` runs in the same `RUN` as `apt-get update`, so the package lists are never stored in a layer and the image stays smaller.'
		},
		{
			prompt: 'Copy the rest of the build context into the working directory, with every file owned by user `node` and group `node`.',
			accept: [
				'COPY --chown=node:node . .',
				'COPY --chown=node:node . ./',
				'COPY --chown=node:node . /app',
				'COPY --chown=node:node . /app/',
				'COPY --chown=node . .',
				'COPY --chown=node: . .',
				'COPY --chown=1000:1000 . .'
			],
			why: 'The first `.` is the build context and the second `.` is `/app`. Without `--chown`, the copied files belong to uid 0 and gid 0 (root).'
		},
		{
			prompt: 'Run every later line and the container itself as the `node` user.',
			accept: ['USER node', 'USER node:node', 'USER 1000', 'USER 1000:1000'],
			why: '`USER node` applies to the `RUN` lines after it and to the process started by `ENTRYPOINT` and `CMD`. `id` in the container then prints `uid=1000(node)`.'
		},
		{
			prompt: 'Record in the image that the server listens on TCP port 3000.',
			accept: ['EXPOSE 3000', 'EXPOSE 3000/tcp'],
			why: '`EXPOSE 3000` adds `3000/tcp` to the image metadata, since TCP is the default protocol. It publishes nothing: `docker run -p 3000:3000` still does that.'
		},
		{
			prompt: 'There is no `ENTRYPOINT` in this file. Write the line, in exec form, that runs `node server.js` when the container starts, so that `docker run orders node -v` replaces it.',
			accept: ['CMD ["node", "server.js"]', 'CMD ["node","server.js"]', 'CMD [ "node", "server.js" ]', 'CMD ["node", "./server.js"]', 'CMD ["node", "/app/server.js"]'],
			why: '`CMD` sets the default command, and any arguments after the image name in `docker run` replace all of it. The JSON array needs double quotes: a line that is not valid JSON is treated as shell form.'
		},
		{
			prompt: 'Now make the container always run the program `node`, in exec form, whatever arguments `docker run` gets.',
			accept: ['ENTRYPOINT ["node"]', 'ENTRYPOINT [ "node" ]', 'ENTRYPOINT ["/usr/local/bin/node"]'],
			why: '`docker run` appends its arguments after every element of an exec form `ENTRYPOINT`. `docker run orders worker.js` then runs `node worker.js` and prints `worker run`.'
		},
		{
			prompt: 'With `ENTRYPOINT ["node"]` in place, write the `CMD` line so that a plain `docker run orders` runs `node server.js`.',
			accept: ['CMD ["server.js"]', 'CMD [ "server.js" ]', 'CMD ["./server.js"]', 'CMD ["/app/server.js"]'],
			why: '`CMD ["server.js"]` holds only the default argument for the `ENTRYPOINT`. The docs ask for both lines in exec form when `CMD` gives arguments to `ENTRYPOINT`.'
		}
	],
	quiz: [],
	recall: {
		q: 'With `ENTRYPOINT ["node"]` and `CMD ["server.js"]`, what does `docker run orders worker.js` run?',
		a: '`node worker.js`. The arguments after the image name replace the whole `CMD` and are appended to the `ENTRYPOINT`.'
	},
	sources: [
		{ title: 'Dockerfile reference', url: 'https://docs.docker.com/reference/dockerfile/' },
		{ title: 'Docker docs: building best practices (apt-get)', url: 'https://docs.docker.com/build/building/best-practices/' },
		{ title: 'Docker docs: optimize cache usage in builds', url: 'https://docs.docker.com/build/cache/optimize/' },
		{ title: 'apt-get(8) manual page (Debian bookworm)', url: 'https://manpages.debian.org/bookworm/apt/apt-get.8.en.html' },
		{ title: 'npm docs: npm ci', url: 'https://docs.npmjs.com/cli/v10/commands/npm-ci' },
		{ title: 'Node.js Docker image: best practices (non-root user)', url: 'https://github.com/nodejs/docker-node/blob/02641286c1f5041d9025d3cf6d38a64b84cd72e5/docs/BestPractices.md#non-root-user' }
	]
};
