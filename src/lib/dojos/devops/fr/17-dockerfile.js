const COMPOSE = 'https://github.com/docker/awesome-compose/blob/30f4b7f6a6c3b0c0ecf4d4efb0de203c48d11562';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'dockerfile',
	part: 'Les conteneurs',
	title: 'Le Dockerfile et son cache de build',
	minutes: 10,
	hook: [
		'Tu as une page de wiki « Installer le serveur d’appli » : installer Node, copier le code, lancer `npm ci`, démarrer. À chaque nouveau serveur tu la suis à la main, et chaque serveur finit un peu différent.',
		'Un **Dockerfile** contient les mêmes étapes sous forme de script, et le builder les exécute à l’identique à chaque fois. Il produit une image, que tu lances ensuite sur n’importe quel serveur.',
		'Le builder sauve chaque étape comme une couche et la réutilise au build suivant si rien n’a changé. Mets les étapes dans le mauvais ordre, et une ligne de code modifiée réinstalle toutes les dépendances.'
	],
	terms: [
		{ term: 'Dockerfile', def: 'Un fichier texte d’instructions (`FROM`, `COPY`, `RUN`, `CMD`...) que le builder exécute de haut en bas pour produire une image.' },
		{ term: 'Instruction', def: 'Une ligne du Dockerfile. `FROM` choisit l’image de base, `COPY` ajoute des fichiers, `RUN` lance une commande, `CMD` fixe la commande par défaut.' },
		{ term: 'Couche', def: 'L’ensemble des changements de fichiers faits par une instruction. `RUN`, `COPY` et `ADD` ajoutent des couches, `CMD` ou `EXPOSE` ne changent que des réglages.' },
		{ term: 'Cache de build', def: 'Les couches gardées des builds précédents. Si une instruction et ses entrées sont identiques, le builder réutilise la couche au lieu de la relancer.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['base["FROM node:lts"]'],
				highlight: ['base'],
				note: '`FROM` part d’une image existante. Tout le reste se construit par dessus.'
			},
			{
				add: [
					'deps["COPY package.json, package-lock.json"]',
					'inst["RUN npm ci"]',
					'base --> deps --> inst'
				],
				highlight: ['deps', 'inst'],
				note: 'Copie d’abord **seulement les fichiers de dépendances**, puis installe. Ces fichiers changent rarement, donc le builder prend presque toujours cette couche lente dans le cache.'
			},
			{
				add: [
					'src["COPY . /code"]',
					'cmd["CMD node src/index.js"]',
					'inst --> src --> cmd'
				],
				highlight: ['src', 'cmd'],
				note: 'Copie le code **en dernier**, parce qu’il change à chaque commit. `CMD` n’ajoute pas de couche : il enregistre la commande par défaut dans les réglages de l’image.'
			},
			{
				add: [
					'edit["Tu modifies src/index.js"]',
					'edit -.->|invalide| src',
					'class edit ext'
				],
				highlight: ['edit', 'src'],
				note: 'Change un fichier source : la couche `COPY . /code` est reconstruite, et **toutes les couches après**. Celles d’avant, `npm ci` compris, viennent du cache. Le build prend quelques secondes.'
			},
			{
				add: [
					'bad["Mauvais ordre : COPY . avant RUN npm ci"]',
					'bad -.->|chaque modif relance| inst',
					'class bad ext'
				],
				highlight: ['bad'],
				note: 'Inverse l’ordre et n’importe quelle modif, même une coquille dans le README, casse le cache **au dessus** de `npm ci`. Chaque build réinstalle alors toutes les dépendances. Place en premier les fichiers qui changent le moins, et en dernier ceux qui changent le plus.'
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
			'Le commentaire de la ligne 15 dit : « copy in our source code last, as it changes the most ». La ligne 16 copie ensuite le code, après l’installation de la ligne 9.',
			'Les lignes 5 et 6 copient `package.json` et le lock file seuls, avant `npm ci`. Tu modifies du code : `npm ci` vient du cache. Tu ajoutes une dépendance : là seulement il est relancé.',
			'La ligne 1, `FROM node:lts`, suit un tag qui bouge. Le fichier lui-même prévient, quelques lignes plus haut, qu’il faut fixer une version précise dès qu’on sort du portable. Le jour 19 traite de ce point.',
			'La ligne 18, `CMD [ "node", "src/index.js" ]`, utilise la forme JSON (exec) : node tourne en PID 1 et reçoit les signaux d’arrêt directement, sans shell au milieu.'
		]
	},
	tradeoff: {
		gain: [
			'Les étapes de build vivent dans Git à côté du code, relues comme n’importe quel changement.',
			'Même Dockerfile, même image, sur ton portable et dans la CI.',
			'Avec un bon ordre, la plupart des rebuilds réutilisent toutes les couches lentes et prennent quelques secondes.'
		],
		cost: [
			'Un fichier modifié invalide sa couche et toutes les couches qui suivent.',
			'Un `RUN apt-get update` en cache peut cacher des paquets périmés, parce que le builder compare seulement le texte de la commande, pas ce que le réseau renverrait aujourd’hui.',
			'Le builder ne signale aucune erreur pour un mauvais ordre : chaque build réinstalle toutes les dépendances, et personne ne le remarque pendant des mois.'
		]
	},
	task: {
		prompt: 'Un collègue a écrit ce Dockerfile Python : `FROM python:3.12-slim`, `WORKDIR /app`, `COPY . .`, `RUN pip install -r requirements.txt`, `CMD ["python", "app.py"]`. Chaque build prend quatre minutes, même pour une ligne modifiée. Réordonne-le, et dis quelles couches sont reconstruites quand tu modifies `app.py`.',
		hint: 'Quel fichier décide de ce que fait `pip install` ? Copie seulement celui-là avant l’installation.',
		answer: [
			'`FROM python:3.12-slim`, `WORKDIR /app`, `COPY requirements.txt .`, `RUN pip install -r requirements.txt`, `COPY . .`, `CMD ["python", "app.py"]`.',
			'Tu modifies `app.py` : seul `COPY . .` (et ce qui suit) est reconstruit. `pip install` vient du cache.',
			'Tu modifies `requirements.txt` : l’installation est relancée, et c’est ce que tu veux.',
			'Bonus : ajoute un `.dockerignore` pour que `.git`, les virtualenvs et le bazar local restent hors du contexte de build (les fichiers que `docker build .` envoie au builder) et hors de l’image.'
		]
	},
	quiz: [
		{
			q: 'Pourquoi copier `package.json` et installer les dépendances avant de copier le reste du code ?',
			options: [
				'Parce que `npm ci` ne voit pas les fichiers copiés après lui dans le Dockerfile',
				'Pour qu’un changement de code n’invalide pas la couche d’installation, qui vient alors du cache',
				'Parce que Docker impose de copier les fichiers de dépendances avant tout autre fichier',
				'Pour rendre l’image finale plus petite, car `node_modules` part dans sa propre couche'
			],
			answer: 1,
			why: 'Quand une couche est invalidée, toutes les couches suivantes sont reconstruites. Mettre l’installation, qui change rarement, avant le code, qui change souvent, garde l’étape lente en cache.'
		},
		{
			q: 'Laquelle de ces instructions n’ajoute PAS de couche de fichiers ?',
			options: ['RUN', 'COPY', 'CMD', 'ADD'],
			answer: 2,
			why: '`CMD` enregistre seulement la commande par défaut dans les réglages de l’image. `RUN`, `COPY` et `ADD` modifient les fichiers.'
		},
		{
			q: 'Ton Dockerfile a `RUN apt-get update` et, à la ligne suivante, `RUN apt-get install -y curl`. Tu ajoutes `nginx` à la ligne d’installation. Qu’est-ce qui peut mal tourner ?',
			options: [
				'Le build échoue parce qu’apt garde un verrou sur la liste des paquets de la couche précédente',
				'La couche `apt-get update` vient du cache, donc l’installation peut utiliser une vieille liste de paquets',
				'Les deux lignes sont toujours relancées car `RUN` n’est jamais en cache, donc le build est lent',
				'Rien : Docker voit que la ligne d’installation a changé et relance aussi `apt-get update`'
			],
			answer: 1,
			why: 'Le builder compare seulement le texte de la commande `RUN`. La ligne update n’a pas changé, donc elle vient du cache. Docker recommande `apt-get update && apt-get install` dans un seul `RUN`.'
		}
	],
	recall: {
		q: 'Dans un Dockerfile Node, que copies-tu avant `RUN npm ci`, et pourquoi ?',
		a: 'Seulement `package.json` et le lock file. Une modif du code ne reconstruit alors que la couche `COPY . /code` et les suivantes, et `npm ci` vient du cache.'
	},
	sources: [
		{ title: 'Doc Docker, référence Dockerfile', url: 'https://docs.docker.com/reference/dockerfile/' },
		{ title: 'Doc Docker, le cache de build', url: 'https://docs.docker.com/build/cache/' },
		{ title: 'Doc Docker, invalidation du cache de build', url: 'https://docs.docker.com/build/cache/invalidation/' },
		{ title: 'Doc Docker, bonnes pratiques de build', url: 'https://docs.docker.com/build/building/best-practices/' }
	]
};
