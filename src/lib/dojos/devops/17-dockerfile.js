const COMPOSE = 'https://github.com/docker/awesome-compose/blob/30f4b7f6a6c3b0c0ecf4d4efb0de203c48d11562';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'dockerfile',
	part: 'Containers',
	title: 'The Dockerfile and its build cache',
	minutes: 10,
	hook: [
		'You have a wiki page called "Set up the app server": install Node, copy the code, run `npm ci`, start it. Every new server, you follow it by hand, and every server ends up a little different.',
		'A **Dockerfile** holds the same steps as a script, and the builder runs them the same way every time. It produces an image, which you then start on any server.',
		'The builder saves each step as a layer and reuses it on the next build if nothing changed. Put the steps in the wrong order and a one-line code change reinstalls every dependency.'
	],
	terms: [
		{ term: 'Dockerfile', def: 'A text file of instructions (`FROM`, `COPY`, `RUN`, `CMD`...) that the builder runs top to bottom to produce an image.' },
		{ term: 'Instruction', def: 'One line of the Dockerfile. `FROM` picks the base image, `COPY` adds files, `RUN` runs a command, `CMD` sets the default command.' },
		{ term: 'Layer', def: 'The set of filesystem changes one instruction makes. `RUN`, `COPY` and `ADD` add layers, `CMD` or `EXPOSE` only change settings.' },
		{ term: 'Build cache', def: 'Saved layers from earlier builds. If an instruction and its inputs match, the builder reuses the layer instead of running it again.' }
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
				note: 'Copy **only the dependency files** first, then install. These files change rarely, so the builder almost always takes this slow layer from the cache.'
			},
			{
				add: [
					'src["COPY . /code"]',
					'cmd["CMD node src/index.js"]',
					'inst --> src --> cmd'
				],
				highlight: ['src', 'cmd'],
				note: 'Copy the source **last**, because it changes on every commit. `CMD` adds no layer: it records the default command in the image settings.'
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
				note: 'Swap the order and any edit, even a README typo, breaks the cache **above** `npm ci`. Every build then reinstalls all dependencies. Put the files that change least often first and the ones that change most often last.'
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
			'The comment on line 15 reads: "copy in our source code last, as it changes the most". Line 16 then copies the source, after the install on line 9.',
			'Lines 5 and 6 copy `package.json` and the lock file alone before `npm ci`. Edit code, and `npm ci` is a cache hit. Add a dependency, and only then does it run again.',
			'Line 1, `FROM node:lts`, follows a moving tag. The file itself warns, a few lines up, to pin a specific version for anything beyond your laptop. Day 19 covers pinning.',
			'Line 18, `CMD [ "node", "src/index.js" ]`, uses the JSON (exec) form: node runs as PID 1 and receives stop signals directly, with no shell in between.'
		]
	},
	tradeoff: {
		gain: [
			'The build steps live in Git next to the code, reviewed like any other change.',
			'Same Dockerfile, same image, on your laptop and in CI.',
			'With a good order, most rebuilds reuse every slow layer and take seconds.'
		],
		cost: [
			'One changed file invalidates its layer and every layer after it.',
			'A cached `RUN apt-get update` can hide stale packages, because the builder only compares the command text, not what the network would return today.',
			'The builder raises no error for a wrong order, so every build reinstalls all dependencies and nobody notices for months.'
		]
	},
	task: {
		prompt: 'A colleague wrote this Python Dockerfile: `FROM python:3.12-slim`, `WORKDIR /app`, `COPY . .`, `RUN pip install -r requirements.txt`, `CMD ["python", "app.py"]`. Every build takes four minutes, even for a one-line change. Reorder it, and say which layers are rebuilt when you change `app.py`.',
		hint: 'Which file decides what `pip install` does? Copy only that one before the install.',
		answer: [
			'`FROM python:3.12-slim`, `WORKDIR /app`, `COPY requirements.txt .`, `RUN pip install -r requirements.txt`, `COPY . .`, `CMD ["python", "app.py"]`.',
			'Change `app.py`: only `COPY . .` (and anything after it) is rebuilt. `pip install` is a cache hit.',
			'Change `requirements.txt`: the install runs again, which is what you want.',
			'Bonus: add a `.dockerignore` so `.git`, virtualenvs and local junk stay out of the build context (the files `docker build .` sends to the builder) and out of the image.'
		],
		steps: [
			{
				title: 'Find the slow step',
				questions: [
					{ q: 'Which step takes most of the four minutes?', options: ['`FROM python:3.12-slim`', '`WORKDIR /app`', '`RUN pip install -r requirements.txt`', '`CMD ["python", "app.py"]`'], answer: 2, why: 'Installing every dependency is the slow work. The other lines copy files or change settings.' },
					{ q: 'You change one line of `app.py`. Why does `pip install` run again?', options: ['`COPY . .` sits above it, so its layer and every layer after are rebuilt', '`RUN` is never cached', 'pip always ignores the cache', 'The base image changed'], answer: 0, why: 'One changed file invalidates its layer and every layer after it. `app.py` is part of `COPY . .`.' },
					{ q: 'Which file decides what `pip install` does?', options: ['`app.py`', 'The Dockerfile', '`.dockerignore`', '`requirements.txt`'], answer: 3, why: 'The install reads only the requirements file. That is the one file it needs before running.' },
					{ q: 'Does the builder warn you about this order?', options: ['Yes, it prints a cache warning', 'No: it raises no error, every build just reinstalls', 'Yes, `docker build` fails', 'Only on the first build'], answer: 1, why: 'A wrong order is not an error. Builds stay slow and nobody notices for months.' }
				]
			},
			{
				title: 'Reorder the Dockerfile',
				questions: [
					{ q: 'After `WORKDIR /app`, where does `COPY requirements.txt .` put the file in the image?', options: ['At `/requirements.txt`', 'At `/app/requirements.txt`', 'In the build context', 'Nowhere until `RUN` reads it'], answer: 1, why: 'The `.` is relative to the working directory that `WORKDIR` set, so the file lands next to where `pip install` runs.' },
					{ q: 'Where does `COPY . .` go now?', options: ['After `RUN pip install`', 'Right after `FROM`', 'Before `WORKDIR`', 'It is no longer needed'], answer: 0, why: 'The source changes on every commit, so it goes last, after the slow install.' },
					{ q: 'What rule does this order follow?', options: ['Shortest lines first', 'Alphabetical by instruction', 'Files that change least often first, most often last', 'All `COPY` lines together'], answer: 2, why: 'A layer is reused only if it and everything above it are unchanged. Stable things go on top.' },
					{ q: 'Should the last line stay in the JSON form `CMD ["python", "app.py"]`?', options: ['No: the shell form `CMD python app.py` is safer', 'No: use `RUN python app.py` instead', 'It makes no difference', 'Yes: python runs as PID 1 and gets stop signals directly'], answer: 3, why: 'The exec form starts the program with no shell in between, so `docker stop` reaches python itself.' }
				]
			},
			{
				title: 'Predict the rebuild',
				questions: [
					{ q: 'One commit changes `app.py` and adds a library to `requirements.txt`. Where does the rebuild start?', options: ['At `FROM`: everything reruns', 'At `COPY requirements.txt .`, so the install and `COPY . .` both rerun', 'At `COPY . .`, since `app.py` changed', 'At `CMD`, the last line'], answer: 1, why: 'The first changed input decides. `requirements.txt` is copied above the install, so the rebuild starts there and runs every layer after it.' },
					{ q: 'You only swap the order of two lines in `requirements.txt`, same libraries. Is `pip install` a cache hit?', options: ['No: the file changed, so its `COPY` layer and the install rerun', 'Yes: the libraries are the same', 'Yes: the builder only compares the `RUN` text', 'Only if you pass `--no-cache`'], answer: 0, why: 'For `COPY`, the builder compares the file content. Any change to it invalidates that layer and every layer after it.' },
					{ q: 'You add a library to `requirements.txt`. What happens?', options: ['Nothing reruns', 'Only `COPY . .` reruns', 'The build fails until you clear the cache', 'The install runs again, which is what you want'], answer: 3, why: 'Its input changed, so its layer and the ones after are rebuilt.' },
					{ q: 'Roughly how long does the `app.py` rebuild take now?', options: ['Still about four minutes', 'Longer, since there is one more `COPY`', 'Seconds', 'It depends on the size of `requirements.txt`'], answer: 2, why: 'With a good order, rebuilds reuse every slow layer and take seconds.' }
				]
			},
			{
				title: 'Trim the build context',
				questions: [
					{ q: 'What is the build context?', options: ['The files `docker build .` sends to the builder', 'The list of cached layers', 'The base image', 'The running container\'s filesystem'], answer: 0, why: 'The `.` in `docker build .` is the context: every file in it goes to the builder.' },
					{ q: 'Which file keeps `.git` and virtualenvs out of the context?', options: ['`.gitignore`', '`requirements.txt`', '`.dockerignore`', 'The `WORKDIR` line'], answer: 2, why: 'A `.dockerignore` lists paths the builder never receives.' },
					{ q: 'Without `.dockerignore`, what else can break the cache of `COPY . .`?', options: ['Nothing else', 'Changes in local junk like `.git`, which then land in the image too', 'Only changes to the Dockerfile', 'Running the container'], answer: 1, why: '`COPY . .` copies everything in the context. Any change there invalidates the layer.' },
					{ q: 'The project folder holds a 2 GB `data/` directory the app does not need. What does listing it in `.dockerignore` change?', options: ['Nothing: `COPY . .` skips large folders anyway', 'The build fails, since `COPY . .` expects it', '`data/` is deleted from your disk', 'The builder no longer receives it, so it stays out of the image'], answer: 3, why: 'Ignored paths never reach the builder. The context is smaller, and `COPY . .` cannot copy what it never got.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Why do you copy `package.json` and install dependencies before copying the rest of the source?',
			options: [
				'Because `npm ci` cannot see files that are copied after it in the Dockerfile',
				'So a source change does not invalidate the dependency install layer, which stays cached',
				'Because Docker requires dependency manifests to be copied before any other file',
				'To make the final image smaller, since `node_modules` then lands in its own layer'
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
				'The build fails because apt holds a lock on the package list from the previous layer',
				'The `apt-get update` layer comes from cache, so the install can use an old package list',
				'Both lines always rerun because `RUN` is never cached, so the build is slow',
				'Nothing: Docker sees the install line changed and reruns `apt-get update` too'
			],
			answer: 1,
			why: 'The builder compares only the `RUN` command text. The update line did not change, so it is a cache hit. Docker recommends `apt-get update && apt-get install` in one `RUN`.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Build the colleague\'s slow Dockerfile, watch a one-line change rerun `pip install`, then fix the order and watch it come from cache.',
		steps: [
			'Make the app: `mkdir -p ~/build-lab && cd ~/build-lab && printf \'requests==2.32.3\\n\' > requirements.txt && printf \'print("hello v1")\\n\' > app.py`.',
			'Write the slow Dockerfile and build it once: `printf \'FROM python:3.12-slim\\nWORKDIR /app\\nCOPY . .\\nRUN pip install -r requirements.txt\\nCMD ["python", "app.py"]\\n\' > Dockerfile && docker build -t lab-py . && docker run --rm lab-py`.',
			'Change one line and rebuild: `printf \'print("hello v2")\\n\' > app.py && docker build --progress=plain -t lab-py . 2>&1 | grep -E "^#[0-9]+ (\\[[0-9]|CACHED)"`.',
			'Reorder: `printf \'FROM python:3.12-slim\\nWORKDIR /app\\nCOPY requirements.txt .\\nRUN pip install -r requirements.txt\\nCOPY . .\\nCMD ["python", "app.py"]\\n\' > Dockerfile && docker build -t lab-py .`. Then change `app.py` again (`printf \'print("hello v3")\\n\' > app.py`), rerun the same `--progress=plain` build, and run `docker run --rm lab-py`.',
			'Look at the layers: `docker history lab-py`. Clean up with `docker rmi lab-py`.'
		],
		done: [
			'In step 3, the `RUN pip install` step runs again (no `CACHED` under it) and takes as long as the first build.',
			'In step 4, after the `app.py` edit, `RUN pip install` is followed by `CACHED`, and only `COPY . .` has no `CACHED` line.',
			'`docker run --rm lab-py` prints `hello v3`.',
			'`docker history lab-py` shows `CMD ["python" "app.py"]` with a size of `0B`.'
		],
		solution: [
			'The slow order puts `COPY . .` above the install, so any edit invalidates the install layer.',
			'The fixed order copies `requirements.txt` alone first. The install depends only on it, so it stays cached until the requirements change.',
			'`CMD` shows `0B` because it adds no filesystem layer: it only sets the default command.'
		]
	},
	recall: {
		q: 'In a Node Dockerfile, what do you copy before `RUN npm ci`, and why?',
		a: 'Only `package.json` and the lock file. A source edit then rebuilds only the `COPY . /code` layer and after, and `npm ci` comes from the cache.'
	},
	sources: [
		{ title: 'Docker docs, Dockerfile reference', url: 'https://docs.docker.com/reference/dockerfile/' },
		{ title: 'Docker docs, Docker build cache', url: 'https://docs.docker.com/build/cache/' },
		{ title: 'Docker docs, Build cache invalidation', url: 'https://docs.docker.com/build/cache/invalidation/' },
		{ title: 'Docker docs, Building best practices', url: 'https://docs.docker.com/build/building/best-practices/' }
	]
};
