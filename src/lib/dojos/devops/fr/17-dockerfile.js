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
		],
		steps: [
			{
				title: 'Trouve l’étape lente',
				questions: [
					{ q: 'Quelle étape prend l’essentiel des quatre minutes ?', options: ['`FROM python:3.12-slim`', '`WORKDIR /app`', '`RUN pip install -r requirements.txt`', '`CMD ["python", "app.py"]`'], answer: 2, why: 'Installer toutes les dépendances, c’est le travail lent. Les autres lignes copient des fichiers ou changent des réglages.' },
					{ q: 'Tu modifies une ligne de `app.py`. Pourquoi `pip install` est-il relancé ?', options: ['`COPY . .` est au-dessus, donc sa couche et toutes les suivantes sont reconstruites', '`RUN` n’est jamais en cache', 'pip ignore toujours le cache', 'L’image de base a changé'], answer: 0, why: 'Un fichier modifié invalide sa couche et toutes les couches qui suivent. `app.py` fait partie de `COPY . .`.' },
					{ q: 'Quel fichier décide de ce que fait `pip install` ?', options: ['`app.py`', 'Le Dockerfile', '`.dockerignore`', '`requirements.txt`'], answer: 3, why: 'L’installation ne lit que le fichier de dépendances. C’est le seul fichier dont elle a besoin avant de tourner.' },
					{ q: 'Le builder te prévient-il de ce mauvais ordre ?', options: ['Oui, il affiche un avertissement de cache', 'Non : aucune erreur, chaque build réinstalle simplement tout', 'Oui, `docker build` échoue', 'Seulement au premier build'], answer: 1, why: 'Un mauvais ordre n’est pas une erreur. Les builds restent lents et personne ne le remarque pendant des mois.' }
				]
			},
			{
				title: 'Réordonne le Dockerfile',
				questions: [
					{ q: 'Après `WORKDIR /app`, où `COPY requirements.txt .` place-t-il le fichier dans l’image ?', options: ['En `/requirements.txt`', 'En `/app/requirements.txt`', 'Dans le contexte de build', 'Nulle part tant que `RUN` ne le lit pas'], answer: 1, why: 'Le `.` est relatif au dossier de travail fixé par `WORKDIR`, donc le fichier arrive là où tourne `pip install`.' },
					{ q: 'Où va `COPY . .` maintenant ?', options: ['Après `RUN pip install`', 'Juste après `FROM`', 'Avant `WORKDIR`', 'Il ne sert plus'], answer: 0, why: 'Le code change à chaque commit, donc il passe en dernier, après l’installation lente.' },
					{ q: 'Quelle règle suit cet ordre ?', options: ['Les lignes les plus courtes d’abord', 'L’ordre alphabétique des instructions', 'Ce qui change le moins souvent d’abord, le plus souvent en dernier', 'Toutes les lignes `COPY` ensemble'], answer: 2, why: 'Une couche n’est réutilisée que si elle et tout ce qui est au-dessus n’ont pas changé. Le stable va en haut.' },
					{ q: 'La dernière ligne doit-elle rester sous la forme JSON `CMD ["python", "app.py"]` ?', options: ['Non : la forme shell `CMD python app.py` est plus sûre', 'Non : mets plutôt `RUN python app.py`', 'Ça ne change rien', 'Oui : python tourne en PID 1 et reçoit directement les signaux d’arrêt'], answer: 3, why: 'La forme exec lance le programme sans shell entre les deux, donc `docker stop` atteint python lui-même.' }
				]
			},
			{
				title: 'Prévois le rebuild',
				questions: [
					{ q: 'Un même commit modifie `app.py` et ajoute une bibliothèque à `requirements.txt`. Où commence le rebuild ?', options: ['À `FROM` : tout est relancé', 'À `COPY requirements.txt .`, donc l’installation et `COPY . .` sont relancés', 'À `COPY . .`, puisque `app.py` a changé', 'À `CMD`, la dernière ligne'], answer: 1, why: 'C’est la première entrée modifiée qui décide. `requirements.txt` est copié au-dessus de l’installation, donc le rebuild commence là et relance toutes les couches suivantes.' },
					{ q: 'Tu inverses seulement deux lignes de `requirements.txt`, mêmes bibliothèques. `pip install` vient-il du cache ?', options: ['Non : le fichier a changé, donc sa couche `COPY` et l’installation sont relancées', 'Oui : les bibliothèques sont les mêmes', 'Oui : le builder compare seulement le texte du `RUN`', 'Seulement si tu passes `--no-cache`'], answer: 0, why: 'Pour `COPY`, le builder compare le contenu du fichier. Le moindre changement invalide cette couche et toutes les suivantes.' },
					{ q: 'Tu ajoutes une bibliothèque à `requirements.txt`. Que se passe-t-il ?', options: ['Rien n’est relancé', 'Seul `COPY . .` est relancé', 'Le build échoue tant que tu ne vides pas le cache', 'L’installation est relancée, et c’est ce que tu veux'], answer: 3, why: 'Son entrée a changé, donc sa couche et les suivantes sont reconstruites.' },
					{ q: 'Combien de temps prend à peu près le rebuild après la modif de `app.py` ?', options: ['Toujours environ quatre minutes', 'Plus, puisqu’il y a un `COPY` de plus', 'Quelques secondes', 'Ça dépend de la taille de `requirements.txt`'], answer: 2, why: 'Avec un bon ordre, les rebuilds réutilisent toutes les couches lentes et prennent quelques secondes.' }
				]
			},
			{
				title: 'Allège le contexte de build',
				questions: [
					{ q: 'Qu’est-ce que le contexte de build ?', options: ['Les fichiers que `docker build .` envoie au builder', 'La liste des couches en cache', 'L’image de base', 'Les fichiers du conteneur qui tourne'], answer: 0, why: 'Le `.` de `docker build .` est le contexte : chaque fichier dedans part au builder.' },
					{ q: 'Quel fichier garde `.git` et les virtualenvs hors du contexte ?', options: ['`.gitignore`', '`requirements.txt`', '`.dockerignore`', 'La ligne `WORKDIR`'], answer: 2, why: 'Un `.dockerignore` liste les chemins que le builder ne reçoit jamais.' },
					{ q: 'Sans `.dockerignore`, qu’est-ce qui peut aussi casser le cache de `COPY . .` ?', options: ['Rien d’autre', 'Des changements dans le bazar local comme `.git`, qui finit aussi dans l’image', 'Seulement des changements du Dockerfile', 'Lancer le conteneur'], answer: 1, why: '`COPY . .` copie tout le contexte. Le moindre changement dedans invalide la couche.' },
					{ q: 'Le dossier du projet contient un répertoire `data/` de 2 Go dont l’appli n’a pas besoin. Que change le fait de le lister dans `.dockerignore` ?', options: ['Rien : `COPY . .` saute déjà les gros dossiers', 'Le build échoue, car `COPY . .` l’attend', '`data/` est supprimé de ton disque', 'Le builder ne le reçoit plus, donc il reste hors de l’image'], answer: 3, why: 'Les chemins ignorés n’arrivent jamais au builder. Le contexte est plus petit, et `COPY . .` ne peut pas copier ce qu’il n’a jamais reçu.' }
				]
			}
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
	lab: {
		minutes: 20,
		goal: 'Construire le Dockerfile lent du collègue, voir une modif d’une ligne relancer `pip install`, puis corriger l’ordre et le voir venir du cache.',
		steps: [
			'Crée l’appli : `mkdir -p ~/build-lab && cd ~/build-lab && printf \'requests==2.32.3\\n\' > requirements.txt && printf \'print("hello v1")\\n\' > app.py`.',
			'Écris le Dockerfile lent et construis-le une fois : `printf \'FROM python:3.12-slim\\nWORKDIR /app\\nCOPY . .\\nRUN pip install -r requirements.txt\\nCMD ["python", "app.py"]\\n\' > Dockerfile && docker build -t lab-py . && docker run --rm lab-py`.',
			'Modifie une ligne et reconstruis : `printf \'print("hello v2")\\n\' > app.py && docker build --progress=plain -t lab-py . 2>&1 | grep -E "^#[0-9]+ (\\[[0-9]|CACHED)"`.',
			'Réordonne : `printf \'FROM python:3.12-slim\\nWORKDIR /app\\nCOPY requirements.txt .\\nRUN pip install -r requirements.txt\\nCOPY . .\\nCMD ["python", "app.py"]\\n\' > Dockerfile && docker build -t lab-py .`. Puis modifie encore `app.py` (`printf \'print("hello v3")\\n\' > app.py`), relance le même build en `--progress=plain`, et lance `docker run --rm lab-py`.',
			'Regarde les couches : `docker history lab-py`. Nettoie avec `docker rmi lab-py`.'
		],
		done: [
			'À l’étape 3, l’étape `RUN pip install` est relancée (pas de `CACHED` dessous) et prend autant de temps que le premier build.',
			'À l’étape 4, après la modif de `app.py`, `RUN pip install` est suivi de `CACHED`, et seul `COPY . .` n’a pas de ligne `CACHED`.',
			'`docker run --rm lab-py` affiche `hello v3`.',
			'`docker history lab-py` montre `CMD ["python" "app.py"]` avec une taille de `0B`.'
		],
		solution: [
			'L’ordre lent met `COPY . .` au-dessus de l’installation, donc toute modif invalide la couche d’installation.',
			'L’ordre corrigé copie d’abord `requirements.txt` seul. L’installation ne dépend que de lui, donc elle reste en cache tant que les dépendances ne changent pas.',
			'`CMD` affiche `0B` parce qu’il n’ajoute aucune couche de fichiers : il règle seulement la commande par défaut.'
		]
	},
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
