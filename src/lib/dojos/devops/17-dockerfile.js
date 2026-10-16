const COMPOSE = 'https://github.com/docker/awesome-compose/blob/30f4b7f6a6c3b0c0ecf4d4efb0de203c48d11562';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'dockerfile',
	part: 'Containers',
	title: 'The Dockerfile: a build script that caches itself',
	minutes: 10,
	hook: [
		'You have a wiki page called "Set up the app server": install Node, copy the code, run `npm ci`, start it. Every new server, you follow it by hand, and every server ends up a little different.',
		'A **Dockerfile** is that page turned into a script the builder runs the same way every time. The result is an image, not a server.',
		'One twist makes it fast: each step is saved as a **layer** and reused on the next build if nothing changed. Put the steps in the wrong order and a one-line code change reinstalls every dependency. Today you learn the order that keeps builds quick.'
	],
	terms: [
		{ term: 'Dockerfile', def: 'A text file of instructions (`FROM`, `COPY`, `RUN`, `CMD`...) that the builder runs top to bottom to produce an image.' },
		{ term: 'Instruction', def: 'One line of the Dockerfile. `FROM` picks the base image, `COPY` adds files, `RUN` runs a command, `CMD` sets the default command.' },
		{ term: 'Layer', def: 'The set of filesystem changes one instruction makes. `RUN`, `COPY` and `ADD` add layers, `CMD` or `EXPOSE` only change settings.' },
		{ term: 'Build cache', def: 'Saved layers from earlier builds. If an instruction and its inputs match, the builder reuses the layer instead of running it again.' },
		{ term: 'Build context', def: 'The files you hand to the builder, usually the current directory (`docker build .`). A plain `COPY` can only read from it.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['base["FROM node:lts"]'],
				highlight: ['base'],
				note: '`FROM` starts from an existing image. Everything after it builds on top.'
			},
			{
				add: [
					'deps["COPY package.json, package-lock.json"]',
					'inst["RUN npm ci"]',
					'base --> deps --> inst'
				],
				highlight: ['deps', 'inst'],
				note: 'Copy **only the dependency files** first, then install. These change rarely, so this slow layer is almost always taken from the **cache**.'
			},
			{
				add: [
					'src["COPY . /code"]',
					'cmd["CMD node src/index.js"]',
					'inst --> src --> cmd'
				],
				highlight: ['src', 'cmd'],
				note: 'Copy the source **last**. It changes on every commit. `CMD` adds no layer, it just records the default command.'
			},
			{
				add: [
					'edit["You edit src/index.js"]',
					'edit -.->|invalidates| src',
					'class edit ext'
				],
				highlight: ['edit', 'src'],
				note: 'Change one source file: the `COPY . /code` layer is rebuilt, and **every layer after it**. The layers before it, including `npm ci`, come from cache. Build takes seconds.'
			},
			{
				add: [
					'bad["Wrong order: COPY . before RUN npm ci"]',
					'bad -.->|any edit reruns| inst',
					'class bad ext'
				],
				highlight: ['bad'],
				note: 'Swap the order and any edit, even a README typo, breaks the cache **above** `npm ci`. Every build reinstalls everything. **Rule: least often changed first, most often changed last.**'
			}
		]
	},
	example: {
		title: 'react-express-mysql/backend/Dockerfile',
		repo: 'docker/awesome-compose',
		url: `${COMPOSE}/react-express-mysql/backend/Dockerfile#L4-L35`,
		lang: 'dockerfile',
		code: `FROM node:lts AS development
…
WORKDIR /code
…
COPY package.json /code/package.json
COPY package-lock.json /code/package-lock.json
COPY .npmrc .
COPY .yarnrc.yml .
RUN npm ci

# check every 30s to ensure this service returns HTTP 200
HEALTHCHECK --interval=30s \\
  CMD node healthcheck.js

# copy in our source code last, as it changes the most
COPY . /code
…
CMD [ "node", "src/index.js" ]`,
		notes: [
			'The comment says it plainly: **"copy in our source code last, as it changes the most"**. That is the whole cache rule in one line.',
			'`package.json` and the lock file are copied alone before `npm ci`. Edit code, and `npm ci` is a cache hit. Add a dependency, and only then does it run again.',
			'`FROM node:lts` follows a moving tag. The file itself warns, a few lines up, to pin a specific version for anything beyond your laptop. Day 19 is about exactly that.',
			'`CMD [ "node", "src/index.js" ]` uses the JSON (exec) form: node runs as PID 1 and receives stop signals directly, with no shell in between.'
		]
	},
	tradeoff: {
		gain: [
			'The build steps live in Git next to the code, reviewed like any other change.',
			'Same Dockerfile, same image, on your laptop and in CI.',
			'With a good order, most rebuilds reuse every slow layer and take seconds.'
		],
		cost: [
			'Cache rules are strict: one changed file invalidates every layer after it.',
			'A cached `RUN apt-get update` can hide stale packages, because the builder only compares the command text, not what the network would return today.',
			'A wrong order is not an error. It just makes every build slow, and nobody notices for months.'
		]
	},
	task: {
		prompt: 'A colleague wrote this Python Dockerfile: `FROM python:3.12-slim`, `WORKDIR /app`, `COPY . .`, `RUN pip install -r requirements.txt`, `CMD ["python", "app.py"]`. Every build takes four minutes, even for a one-line change. Reorder it, and say which layers are rebuilt when you change `app.py`.',
		hint: 'Which file decides what `pip install` does? Copy only that one before the install.',
		answer: [
			'`FROM python:3.12-slim`, `WORKDIR /app`, `COPY requirements.txt .`, `RUN pip install -r requirements.txt`, `COPY . .`, `CMD ["python", "app.py"]`.',
			'Change `app.py`: only `COPY . .` (and anything after it) is rebuilt. `pip install` is a cache hit.',
			'Change `requirements.txt`: the install runs again, which is what you want.',
			'Bonus: add a `.dockerignore` so `.git`, virtualenvs and local junk stay out of the build context and out of the image.'
		]
	},
	quiz: [
		{
			q: 'Why do you copy `package.json` and install dependencies before copying the rest of the source?',
			options: [
				'Because `npm ci` cannot see files copied later',
				'So a source change does not invalidate the dependency install layer, which then comes from cache',
				'Because Docker requires dependency files to be copied first',
				'To make the final image smaller'
			],
			answer: 1,
			why: 'When a layer is invalidated, every layer after it is rebuilt. Putting the rarely changed install before the often changed source keeps the slow step cached.'
		},
		{
			q: 'Which of these instructions does NOT add a filesystem layer?',
			options: ['RUN', 'COPY', 'CMD', 'ADD'],
			answer: 2,
			why: '`CMD` only records the default command in the image settings. `RUN`, `COPY` and `ADD` change the filesystem.'
		},
		{
			q: 'Your Dockerfile has `RUN apt-get update` and, on the next line, `RUN apt-get install -y curl`. You add `nginx` to the install line. What can go wrong?',
			options: [
				'The build fails because the package list is locked',
				'The `apt-get update` layer comes from cache, so the install can use an old package list',
				'Both lines always rerun, so the build is slow',
				'Nothing: Docker reruns `apt-get update` when packages change'
			],
			answer: 1,
			why: 'The builder compares only the `RUN` command text. The update line did not change, so it is a cache hit. Docker recommends `apt-get update && apt-get install` in one `RUN`.'
		}
	],
	takeaway: 'A Dockerfile is your setup runbook as code. Order it from least to most often changed, so the slow layers stay in cache.',
	sources: [
		{ title: 'Docker docs, Dockerfile reference', url: 'https://docs.docker.com/reference/dockerfile/' },
		{ title: 'Docker docs, Docker build cache', url: 'https://docs.docker.com/build/cache/' },
		{ title: 'Docker docs, Build cache invalidation', url: 'https://docs.docker.com/build/cache/invalidation/' },
		{ title: 'Docker docs, Building best practices', url: 'https://docs.docker.com/build/building/best-practices/' }
	]
};
