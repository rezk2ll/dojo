/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'dockerfile',
	part: 'Outils d’exploitation',
	title: 'Les lignes d’un Dockerfile',
	minutes: 10,
	hook: [
		'Le service `orders` est une petite API Node.js. Tu écris son Dockerfile à partir d’un fichier vide, une ligne par répétition. À la fin, l’image tourne avec un utilisateur normal et démarre avec `docker run orders`.',
		'Le contexte de build est le dossier `orders/`. Il contient `package.json` (une dépendance, `ms`, et une dépendance de dev, `is-number`), `package-lock.json`, `server.js` (un serveur HTTP sur le port 3000) et `worker.js` (affiche `worker run` puis s’arrête). L’image de base est `node:22-bookworm-slim`, une image Debian qui a un utilisateur `node` d’uid 1000. L’appli va dans `/app`.'
	],
	terms: [
		{ term: 'contexte de build', def: 'Le dossier que tu passes à `docker build`. `COPY` ne lit que des fichiers de ce dossier.' },
		{ term: 'couche', def: 'Les changements de fichiers qu’une instruction ajoute à l’image. Quand une couche change, Docker la reconstruit, ainsi que toutes les couches suivantes.' },
		{ term: 'forme exec', def: 'Une instruction écrite comme un tableau JSON, par exemple `CMD ["node", "server.js"]`. Docker lance le programme directement, sans `/bin/sh -c` autour.' }
	],
	reps: [
		{
			prompt: 'Écris la première ligne : pars de l’image `node` avec le tag `22-bookworm-slim`.',
			accept: ['FROM node:22-bookworm-slim', 'from node:22-bookworm-slim', 'FROM docker.io/library/node:22-bookworm-slim'],
			why: '`FROM` choisit l’image de base, et ce qui suit `:` est le tag. Docker lit aussi `from` en minuscules, mais la doc écrit les instructions en MAJUSCULES par convention.'
		},
		{
			prompt: 'Fais de `/app` le répertoire de travail pour toutes les lignes suivantes et pour le conteneur lancé.',
			accept: ['WORKDIR /app', 'WORKDIR /app/'],
			why: '`WORKDIR /app` fixe le répertoire des lignes `RUN`, `CMD`, `ENTRYPOINT`, `COPY` et `ADD` qui suivent. Docker crée `/app` s’il n’existe pas.'
		},
		{
			prompt: 'Copie seulement `package.json` et `package-lock.json` dans le répertoire de travail, avant le code source.',
			accept: [
				'COPY package.json package-lock.json ./',
				'COPY package-lock.json package.json ./',
				'COPY package*.json ./',
				'COPY package.json package-lock.json /app/',
				'COPY package*.json /app/',
				'COPY package.json package-lock.json .',
				'COPY package*.json .'
			],
			why: 'Avec deux sources, le dernier argument `./` est le dossier de destination, ici `/app`. Si tu modifies `server.js`, Docker garde en cache cette couche et la couche `npm ci` qui suit.'
		},
		{
			prompt: 'Installe les dépendances du lockfile avec `npm ci`, sans les dépendances de dev.',
			accept: ['RUN npm ci --omit=dev', 'RUN npm ci --omit dev', 'RUN npm clean-install --omit=dev', 'RUN npm ci --production'],
			why: '`npm ci` installe exactement ce que liste `package-lock.json`, et s’arrête en erreur si ce fichier ne correspond pas à `package.json`. `--omit=dev` saute `is-number` : `node_modules` ne contient que `ms`.'
		},
		{
			prompt: 'Dans une seule ligne `RUN`, mets à jour les listes de paquets apt, installe `curl` sans question et sans paquets recommandés, puis supprime `/var/lib/apt/lists/*`.',
			accept: [
				'RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*',
				'RUN apt-get update && apt-get install --no-install-recommends -y curl && rm -rf /var/lib/apt/lists/*',
				'RUN apt-get update && apt-get install --yes --no-install-recommends curl && rm -rf /var/lib/apt/lists/*',
				'RUN apt-get update && apt-get install --no-install-recommends --yes curl && rm -rf /var/lib/apt/lists/*',
				'RUN apt-get update && apt-get --no-install-recommends install -y curl && rm -rf /var/lib/apt/lists/*',
				'RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -fr /var/lib/apt/lists/*'
			],
			why: '`-y` répond oui à chaque question, donc `apt-get` n’attend aucune saisie. Le `rm` tourne dans le même `RUN` que `apt-get update` : les listes de paquets ne sont stockées dans aucune couche et l’image reste plus petite.'
		},
		{
			prompt: 'Copie le reste du contexte de build dans le répertoire de travail, avec tous les fichiers à l’utilisateur `node` et au groupe `node`.',
			accept: [
				'COPY --chown=node:node . .',
				'COPY --chown=node:node . ./',
				'COPY --chown=node:node . /app',
				'COPY --chown=node:node . /app/',
				'COPY --chown=node . .',
				'COPY --chown=node: . .',
				'COPY --chown=1000:1000 . .'
			],
			why: 'Le premier `.` est le contexte de build, le second `.` est `/app`. Sans `--chown`, les fichiers copiés appartiennent à l’uid 0 et au gid 0 (root).'
		},
		{
			prompt: 'Lance toutes les lignes suivantes et le conteneur lui-même avec l’utilisateur `node`.',
			accept: ['USER node', 'USER node:node', 'USER 1000', 'USER 1000:1000'],
			why: '`USER node` s’applique aux lignes `RUN` qui suivent et au processus lancé par `ENTRYPOINT` et `CMD`. Dans le conteneur, `id` affiche alors `uid=1000(node)`.'
		},
		{
			prompt: 'Indique dans l’image que le serveur écoute sur le port TCP 3000.',
			accept: ['EXPOSE 3000', 'EXPOSE 3000/tcp'],
			why: '`EXPOSE 3000` ajoute `3000/tcp` aux métadonnées de l’image, car TCP est le protocole par défaut. Rien n’est publié : c’est toujours `docker run -p 3000:3000` qui publie le port.'
		},
		{
			prompt: 'Ce fichier n’a pas d’`ENTRYPOINT`. Écris la ligne, en forme exec, qui lance `node server.js` au démarrage du conteneur, de façon que `docker run orders node -v` la remplace.',
			accept: ['CMD ["node", "server.js"]', 'CMD ["node","server.js"]', 'CMD [ "node", "server.js" ]', 'CMD ["node", "./server.js"]', 'CMD ["node", "/app/server.js"]'],
			why: '`CMD` fixe la commande par défaut, et les arguments placés après le nom de l’image dans `docker run` la remplacent en entier. Le tableau JSON demande des guillemets doubles : une ligne qui n’est pas du JSON valide est traitée en forme shell.'
		},
		{
			prompt: 'Fais maintenant que le conteneur lance toujours le programme `node`, en forme exec, quels que soient les arguments de `docker run`.',
			accept: ['ENTRYPOINT ["node"]', 'ENTRYPOINT [ "node" ]', 'ENTRYPOINT ["/usr/local/bin/node"]'],
			why: '`docker run` ajoute ses arguments après tous les éléments d’un `ENTRYPOINT` en forme exec. `docker run orders worker.js` lance donc `node worker.js`, qui affiche `worker run`.'
		},
		{
			prompt: 'Avec `ENTRYPOINT ["node"]` en place, écris la ligne `CMD` pour qu’un simple `docker run orders` lance `node server.js`.',
			accept: ['CMD ["server.js"]', 'CMD [ "server.js" ]', 'CMD ["./server.js"]', 'CMD ["/app/server.js"]'],
			why: '`CMD ["server.js"]` ne contient que l’argument par défaut de l’`ENTRYPOINT`. Quand `CMD` donne des arguments à `ENTRYPOINT`, la doc demande les deux lignes en forme exec.'
		}
	],
	quiz: [],
	recall: {
		q: 'Avec `ENTRYPOINT ["node"]` et `CMD ["server.js"]`, que lance `docker run orders worker.js` ?',
		a: '`node worker.js`. Les arguments après le nom de l’image remplacent tout le `CMD` et s’ajoutent après l’`ENTRYPOINT`.'
	},
	sources: [
		{ title: 'Référence Dockerfile (en anglais)', url: 'https://docs.docker.com/reference/dockerfile/' },
		{ title: 'Docker : bonnes pratiques de build, apt-get (en anglais)', url: 'https://docs.docker.com/build/building/best-practices/' },
		{ title: 'Docker : optimiser le cache de build (en anglais)', url: 'https://docs.docker.com/build/cache/optimize/' },
		{ title: 'Page de manuel apt-get(8), Debian bookworm', url: 'https://manpages.debian.org/bookworm/apt/apt-get.8.en.html' },
		{ title: 'npm : npm ci (en anglais)', url: 'https://docs.npmjs.com/cli/v10/commands/npm-ci' },
		{ title: 'Image Docker Node.js : utilisateur non root (en anglais)', url: 'https://github.com/nodejs/docker-node/blob/02641286c1f5041d9025d3cf6d38a64b84cd72e5/docs/BestPractices.md#non-root-user' }
	]
};
