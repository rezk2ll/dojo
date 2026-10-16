const COMPOSE = 'https://github.com/docker/awesome-compose/blob/30f4b7f6a6c3b0c0ecf4d4efb0de203c48d11562';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'small-safe-images',
	part: 'Les conteneurs',
	title: 'Des images petites et sûres : livre le binaire, pas la caisse à outils',
	minutes: 10,
	hook: [
		'Tu ne laisserais jamais `gcc`, `make` et un shell root sur un serveur web de prod « au cas où ». Pourtant une image naïve fait exactement ça : le compilateur, le cache des paquets, les fichiers de test, le tout en root.',
		'Chaque paquet en trop est une chose à patcher et un outil de plus pour un attaquant. Chaque mégaoctet en trop est tiré à chaque déploiement.',
		'Quatre habitudes règlent l’essentiel : les **builds multi-stage**, un **utilisateur non root**, un **`.dockerignore`** et une **image de base minimale**. Aujourd’hui tu appliques les quatre.'
	],
	terms: [
		{ term: 'Build multi-stage', def: 'Un Dockerfile avec plusieurs lignes `FROM`. Les premiers stages compilent, le dernier copie seulement le résultat avec `COPY --from`. Les outils de build restent derrière.' },
		{ term: 'Stage', def: 'Tout ce qui va d’un `FROM` au suivant. Tu peux le nommer avec `AS builder` et ne construire que jusqu’à lui avec `--target`.' },
		{ term: 'Utilisateur non root', def: 'Une ligne `USER` pour que l’appli ne tourne pas en UID 0. Sans elle, ni dans ton Dockerfile ni dans l’image de base, l’utilisateur par défaut dans un conteneur est root.' },
		{ term: '.dockerignore', def: 'Un fichier qui liste les chemins à laisser hors du contexte de build, comme `.git` ou `node_modules`. Ils n’arrivent jamais au builder.' },
		{ term: 'Image de base minimale', def: 'Une base qui ne contient presque rien d’autre que ce dont l’appli a besoin : `scratch` (vide), distroless (ni shell ni gestionnaire de paquets), ou une variante slim.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: [
					'subgraph b["Stage 1 : builder"]',
					'sdk["image golang avec compilateur"] --> bin["go build : un binaire"]',
					'end'
				],
				highlight: ['sdk', 'bin'],
				note: 'Le **stage builder** a toute la chaîne d’outils. Il est gros, et ce n’est pas grave : il n’est jamais livré.'
			},
			{
				add: [
					'subgraph f["Stage 2 : final"]',
					'scr["FROM scratch"] --> app["seulement le binaire"]',
					'end',
					'bin -->|COPY --from=builder| app'
				],
				highlight: ['scr', 'app'],
				note: 'Le **stage final** part d’une image vide et copie **juste le binaire**. Le compilateur et les sources restent derrière, ils ne sont pas dans le résultat.'
			},
			{
				add: [
					'ign[".dockerignore : .git, node_modules"]',
					'ign -.->|hors du contexte| sdk',
					'class ign ext'
				],
				highlight: ['ign'],
				note: '`.dockerignore` retire des fichiers du contexte de build **avant** qu’ils n’arrivent au builder. Des builds plus rapides, et pas de `.git` ni de `.env` qui se glissent dans une image via un `COPY . .`.'
			},
			{
				add: [
					'usr["USER 10001:10001"]',
					'app --> usr'
				],
				highlight: ['usr'],
				note: 'Ajoute une ligne **`USER`** dans le stage final. Donne aussi un groupe : si l’utilisateur n’a pas de groupe principal, le processus tourne avec le **groupe root**.'
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
			'Le stage `builder` contient Go, Alpine et les sources. Le dernier stage est `FROM scratch` : une image **vide** qui porte un seul binaire statique (`CGO_ENABLED 0` est posé dans les lignes coupées ici).',
			'Même astuce de cache qu’hier : `go.mod` et `go.sum` d’abord, puis `go mod download`, puis le reste. `--mount=type=cache` garde en plus le cache de téléchargement de Go entre les builds, sans le mettre dans une couche.',
			'Il n’y a **pas de ligne `USER`**, donc le binaire tourne en root. Root dans un système de fichiers vide, ce qui limite les dégâts, mais `USER 10001:10001` dans le dernier stage ne coûte rien.',
			'Regarde le [fichier compose](https://github.com/docker/awesome-compose/blob/30f4b7f6a6c3b0c0ecf4d4efb0de203c48d11562/nginx-golang-postgres/compose.yaml#L2-L5) : il build avec `target: builder`, le gros stage, parce que c’est un environnement de dev. Un simple `docker build` construit le dernier stage.'
		]
	},
	tradeoff: {
		gain: [
			'Moins de paquets, moins de CVE à patcher et moins d’outils pour un attaquant.',
			'Des images plus petites se tirent plus vite à chaque déploiement et sur chaque nouveau nœud.',
			'Un processus non root ne peut pas écrire là où root pourrait, donc une compromission reste plus petite.'
		],
		cost: [
			'Pas de shell dans `scratch` ni dans distroless : `docker exec ... sh` échoue, donc le debug demande d’autres outils (distroless fournit des tags `debug` pour ça).',
			'Les Dockerfiles multi-stage sont plus longs et il faut penser à copier chaque fichier dont l’appli a besoin à l’exécution (certificats CA, données de fuseau horaire).',
			'Un utilisateur non root ne peut pas écrire dans les chemins qui appartiennent à root, donc tu corriges les propriétaires (`COPY --chown`) de tout ce que l’appli écrit.'
		]
	},
	task: {
		prompt: 'Ton image Node.js est en `FROM node:22`, fait `COPY . .` et `RUN npm ci`, n’a pas de `.dockerignore` et tourne en root. Elle dépasse 1 Go et le scanner remonte des centaines de CVE. Note les quatre changements que tu ferais, par ordre d’impact.',
		hint: 'Un changement pour chacun : ce qu’il y a dans la base, ce qui arrive au builder, ce qui finit dans le stage final, et qui fait tourner le processus.',
		answer: [
			'**Multi-stage** : build dans un stage `node:22` (`npm ci`, `npm run build`), puis copie seulement le résultat du build et les dépendances de prod dans un stage final.',
			'**Base minimale** pour le stage final : une variante slim ou une image Node distroless au lieu du `node:22` complet.',
			'**`.dockerignore`** avec `.git`, `node_modules`, `.env` et les données de test, pour qu’ils n’arrivent jamais au builder ni dans l’image.',
			'**`USER`** avec un utilisateur et un groupe non root dans le stage final (les images Node officielles [fournissent un utilisateur `node`](https://github.com/nodejs/docker-node/blob/02641286c1f5041d9025d3cf6d38a64b84cd72e5/docs/BestPractices.md#non-root-user) avec l’UID 1000), puis vérifie que l’appli peut encore écrire là où elle en a besoin.'
		]
	},
	quiz: [
		{
			q: 'Dans un build multi-stage, qu’est-ce qui se retrouve dans l’image finale ?',
			options: [
				'Tous les stages, empilés les uns sur les autres en couches, dans leur ordre d’apparition',
				'Seulement le dernier stage, plus ce qu’il copie des stages précédents avec `COPY --from`',
				'Seulement le premier stage, puisque les suivants ne font qu’y ajouter des étapes de build',
				'Le cache de build de tous les stages, pour que le build suivant reparte de lui'
			],
			answer: 1,
			why: 'Chaque `FROM` démarre un nouveau stage. L’image est le stage que tu construis (par défaut le dernier), et les stages précédents n’apportent que ce que `COPY --from` leur prend.'
		},
		{
			q: 'Ni ton Dockerfile ni son image de base n’ont d’instruction `USER`. Avec quel utilisateur tourne le processus du conteneur ?',
			options: ['nobody', 'L’utilisateur qui a lancé `docker build`', 'root (UID 0)', 'Un UID non privilégié au hasard'],
			answer: 2,
			why: 'L’utilisateur par défaut dans un conteneur est root. Il faut une ligne `USER` pour changer ça.'
		},
		{
			q: 'Que fait un fichier `.dockerignore` ?',
			options: [
				'Il retire les fichiers correspondants de l’image finale après le build',
				'Il exclut les fichiers correspondants du contexte de build avant son envoi au builder',
				'Il dit à `docker push` quelles couches sauter lors de l’envoi au registry',
				'Il liste les images de base que Docker ne doit jamais tirer, même si un `FROM` les nomme'
			],
			answer: 1,
			why: 'Les fichiers qui correspondent au `.dockerignore` sont retirés du contexte avant que le builder ne le voie, donc `COPY` ne peut pas les prendre.'
		}
	],
	takeaway: 'Build avec tout, livre avec rien : un build multi-stage sur une base minimale, un `.dockerignore`, et un `USER` qui n’est pas root.',
	sources: [
		{ title: 'Doc Docker, builds multi-stage', url: 'https://docs.docker.com/build/building/multi-stage/' },
		{ title: 'Doc Docker, bonnes pratiques de build', url: 'https://docs.docker.com/build/building/best-practices/' },
		{ title: 'Doc Docker, contexte de build et .dockerignore', url: 'https://docs.docker.com/build/concepts/context/' },
		{ title: 'Doc Docker, référence Dockerfile (USER)', url: 'https://docs.docker.com/reference/dockerfile/' },
		{ title: 'GoogleContainerTools, images distroless', url: 'https://github.com/GoogleContainerTools/distroless/blob/7e55c167b7c993f738e933c3bc0f46190a5b367d/README.md' }
	]
};
