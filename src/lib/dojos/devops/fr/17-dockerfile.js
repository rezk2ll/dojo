const COMPOSE = 'https://github.com/docker/awesome-compose/blob/30f4b7f6a6c3b0c0ecf4d4efb0de203c48d11562';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'dockerfile',
	part: 'Les conteneurs',
	title: 'Le Dockerfile : un script de build qui se met en cache',
	minutes: 10,
	hook: [
		'Tu as une page de wiki « Installer le serveur d’appli » : installer Node, copier le code, lancer `npm ci`, démarrer. À chaque nouveau serveur tu la suis à la main, et chaque serveur finit un peu différent.',
		'Un **Dockerfile**, c’est cette page transformée en script que le builder exécute pareil à chaque fois. Le résultat est une image, pas un serveur.',
		'Un détail le rend rapide : chaque étape est sauvée comme **couche** et réutilisée au build suivant si rien n’a changé. Mets les étapes dans le mauvais ordre et un changement d’une ligne de code réinstalle toutes les dépendances. Aujourd’hui tu apprends l’ordre qui garde les builds rapides.'
	],
	terms: [
		{ term: 'Dockerfile', def: 'Un fichier texte d’instructions (`FROM`, `COPY`, `RUN`, `CMD`...) que le builder exécute de haut en bas pour produire une image.' },
		{ term: 'Instruction', def: 'Une ligne du Dockerfile. `FROM` choisit l’image de base, `COPY` ajoute des fichiers, `RUN` lance une commande, `CMD` fixe la commande par défaut.' },
		{ term: 'Couche', def: 'L’ensemble des changements de fichiers faits par une instruction. `RUN`, `COPY` et `ADD` ajoutent des couches, `CMD` ou `EXPOSE` ne changent que des réglages.' },
		{ term: 'Cache de build', def: 'Les couches gardées des builds précédents. Si une instruction et ses entrées sont identiques, le builder réutilise la couche au lieu de la relancer.' },
		{ term: 'Contexte de build', def: 'Les fichiers que tu donnes au builder, en général le dossier courant (`docker build .`). Un `COPY` simple ne peut lire que là.' }
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
				note: 'Copie d’abord **seulement les fichiers de dépendances**, puis installe. Ils changent rarement, donc cette couche lente vient presque toujours du **cache**.'
			},
			{
				add: [
					'src["COPY . /code"]',
					'cmd["CMD node src/index.js"]',
					'inst --> src --> cmd'
				],
				highlight: ['src', 'cmd'],
				note: 'Copie le code **en dernier**. Il change à chaque commit. `CMD` n’ajoute pas de couche, il enregistre juste la commande par défaut.'
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
				note: 'Inverse l’ordre et n’importe quelle modif, même une coquille dans le README, casse le cache **au dessus** de `npm ci`. Chaque build réinstalle tout. **Règle : ce qui change le moins en premier, ce qui change le plus en dernier.**'
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
			'Le commentaire le dit sans détour : **« copy in our source code last, as it changes the most »**. Toute la règle du cache tient en une ligne.',
			'`package.json` et le lock file sont copiés seuls avant `npm ci`. Tu modifies du code : `npm ci` vient du cache. Tu ajoutes une dépendance : là seulement il est relancé.',
			'`FROM node:lts` suit un tag qui bouge. Le fichier lui-même prévient, quelques lignes plus haut, qu’il faut fixer une version précise dès qu’on sort du portable. C’est tout le sujet du jour 19.',
			'`CMD [ "node", "src/index.js" ]` utilise la forme JSON (exec) : node tourne en PID 1 et reçoit les signaux d’arrêt directement, sans shell au milieu.'
		]
	},
	tradeoff: {
		gain: [
			'Les étapes de build vivent dans Git à côté du code, relues comme n’importe quel changement.',
			'Même Dockerfile, même image, sur ton portable et dans la CI.',
			'Avec un bon ordre, la plupart des rebuilds réutilisent toutes les couches lentes et prennent quelques secondes.'
		],
		cost: [
			'Les règles du cache sont strictes : un fichier modifié invalide toutes les couches qui suivent.',
			'Un `RUN apt-get update` en cache peut cacher des paquets périmés, parce que le builder compare seulement le texte de la commande, pas ce que le réseau renverrait aujourd’hui.',
			'Un mauvais ordre n’est pas une erreur. Il rend juste chaque build lent, et personne ne le remarque pendant des mois.'
		]
	},
	task: {
		prompt: 'Un collègue a écrit ce Dockerfile Python : `FROM python:3.12-slim`, `WORKDIR /app`, `COPY . .`, `RUN pip install -r requirements.txt`, `CMD ["python", "app.py"]`. Chaque build prend quatre minutes, même pour une ligne modifiée. Réordonne-le, et dis quelles couches sont reconstruites quand tu modifies `app.py`.',
		hint: 'Quel fichier décide de ce que fait `pip install` ? Copie seulement celui-là avant l’installation.',
		answer: [
			'`FROM python:3.12-slim`, `WORKDIR /app`, `COPY requirements.txt .`, `RUN pip install -r requirements.txt`, `COPY . .`, `CMD ["python", "app.py"]`.',
			'Tu modifies `app.py` : seul `COPY . .` (et ce qui suit) est reconstruit. `pip install` vient du cache.',
			'Tu modifies `requirements.txt` : l’installation est relancée, et c’est ce que tu veux.',
			'Bonus : ajoute un `.dockerignore` pour que `.git`, les virtualenvs et le bazar local restent hors du contexte de build et hors de l’image.'
		]
	},
	quiz: [
		{
			q: 'Pourquoi copier `package.json` et installer les dépendances avant de copier le reste du code ?',
			options: [
				'Parce que `npm ci` ne voit pas les fichiers copiés après',
				'Pour qu’un changement de code n’invalide pas la couche d’installation, qui vient alors du cache',
				'Parce que Docker impose de copier les fichiers de dépendances en premier',
				'Pour rendre l’image finale plus petite'
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
				'Le build échoue parce que la liste des paquets est verrouillée',
				'La couche `apt-get update` vient du cache, donc l’installation peut utiliser une vieille liste de paquets',
				'Les deux lignes sont toujours relancées, donc le build est lent',
				'Rien : Docker relance `apt-get update` quand les paquets changent'
			],
			answer: 1,
			why: 'Le builder compare seulement le texte de la commande `RUN`. La ligne update n’a pas changé, donc elle vient du cache. Docker recommande `apt-get update && apt-get install` dans un seul `RUN`.'
		}
	],
	takeaway: 'Un Dockerfile, c’est ton runbook d’installation en code. Ordonne-le de ce qui change le moins à ce qui change le plus, pour garder les couches lentes en cache.',
	sources: [
		{ title: 'Doc Docker, référence Dockerfile', url: 'https://docs.docker.com/reference/dockerfile/' },
		{ title: 'Doc Docker, le cache de build', url: 'https://docs.docker.com/build/cache/' },
		{ title: 'Doc Docker, invalidation du cache de build', url: 'https://docs.docker.com/build/cache/invalidation/' },
		{ title: 'Doc Docker, bonnes pratiques de build', url: 'https://docs.docker.com/build/building/best-practices/' }
	]
};
