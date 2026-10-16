const STARTER = 'https://github.com/actions/starter-workflows/blob/e3c451d60f119b71caebf13c98ac45da6e15b4b7';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'github-actions',
	part: 'CI/CD',
	title: 'GitHub Actions : un pipeline qui vit à côté du code',
	minutes: 10,
	hook: [
		'Tu as un serveur de build quelque part. Un cron, ou un hook, lance `make test` et t’envoie un mail quand ça casse. Tu le patches, tu le mets à jour, et tu es le seul à savoir comment il marche.',
		'Avec GitHub Actions, le pipeline est **un fichier YAML dans le dépôt**, sous `.github/workflows/`. GitHub surveille les événements (un push, une pull request), démarre une machine neuve et y exécute tes étapes.',
		'Aujourd’hui : workflows, événements, jobs, steps, runners et actions, plus deux choses qui piègent vite : les **secrets** et la **matrice**.'
	],
	terms: [
		{ term: 'Workflow', def: 'Un fichier YAML dans `.github/workflows/`. Il dit quand tourner (`on:`) et quoi exécuter (`jobs:`).' },
		{ term: 'Événement', def: 'Ce qui lance un workflow : un `push`, une `pull_request`, une planification ou un clic manuel.' },
		{ term: 'Job et step', def: 'Un job est une liste de steps exécutés dans l’ordre **sur le même runner**. Les jobs tournent en parallèle, sauf si l’un a besoin (`needs`) d’un autre.' },
		{ term: 'Runner', def: 'La machine qui exécute un job. Les runners hébergés par GitHub sont des machines virtuelles neuves (Ubuntu, Windows, macOS). Tu peux aussi héberger les tiens.' },
		{ term: 'Action', def: 'Un step réutilisable empaqueté par quelqu’un, appelé avec `uses:`, comme `actions/checkout`. Un simple step shell utilise `run:` à la place.' },
		{ term: 'Matrice', def: 'Exécuter le même job plusieurs fois avec des valeurs différentes, par exemple trois versions de Node.js, sans copier le job.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['ev["Événement : push ou pull_request"] --> wf["Workflow : .github/workflows/node.js.yml"]'],
				highlight: ['ev', 'wf'],
				note: 'Un **événement** dans le dépôt lance le **workflow**. Pas de serveur qui interroge Git, pas de hook à installer : le fichier dans le dépôt, c’est toute la configuration.'
			},
			{
				add: ['wf --> job["Job : build"]', 'job -.->|runs-on| run["Runner : VM ubuntu-latest"]', 'class run ext'],
				highlight: ['job', 'run'],
				note: 'Chaque job demande un **runner** avec `runs-on`. Sur un runner hébergé par GitHub, le job démarre sur une machine propre, il ne peut donc pas dépendre de restes du build d’hier.'
			},
			{
				add: [
					'subgraph steps["Steps, dans l’ordre, même runner"]',
					's1["uses: actions/checkout"]',
					's2["uses: actions/setup-node"]',
					's3["run: npm ci, npm test"]',
					'end',
					'job --> s1',
					's1 --> s2',
					's2 --> s3'
				],
				highlight: ['s1', 's2', 's3'],
				note: 'Les **steps** partagent le disque du runner, donc le step 3 voit le code que le step 1 a récupéré. `uses:` appelle une **action**. `run:` c’est du shell, la partie que tu connais déjà.'
			},
			{
				add: ['mx["Matrice : un job par node-version, 18, 20, 22"]', 'wf --> mx', 'mx -.-> job'],
				highlight: ['mx'],
				note: 'Une **matrice** transforme un job en trois, un par version de Node.js, en parallèle. Par défaut, si l’un échoue, GitHub **annule les autres**.'
			},
			{
				add: ['sec["Secrets : secrets.DEPLOY_KEY"]', 'sec -.-> s3', 'class sec ext'],
				highlight: ['sec'],
				note: 'Les **secrets** vivent dans les paramètres du dépôt, pas dans le YAML. Un step en lit un avec `${{ secrets.NAME }}`, et GitHub masque sa valeur dans les logs. Ce masquage n’est pas garanti : un secret transformé (encodé, ou dans du JSON) peut quand même fuiter.'
			}
		]
	},
	example: {
		title: 'ci/node.js.yml',
		repo: 'actions/starter-workflows',
		url: `${STARTER}/ci/node.js.yml#L4-L31`,
		lang: 'yaml',
		code: `name: Node.js CI

on:
  push:
    branches: [ $default-branch ]
  pull_request:
    branches: [ $default-branch ]

jobs:
  build:

    runs-on: ubuntu-latest

    strategy:
      matrix:
        node-version: [18.x, 20.x, 22.x]
        # See supported Node.js release schedule at https://nodejs.org/en/about/releases/

    steps:
    - uses: actions/checkout@v4
    - name: Use Node.js \${{ matrix.node-version }}
      uses: actions/setup-node@v4
      with:
        node-version: \${{ matrix.node-version }}
        cache: 'npm'
    - run: npm ci
    - run: npm run build --if-present
    - run: npm test`,
		notes: [
			'C’est le workflow de démarrage que GitHub propose pour les projets Node.js. `$default-branch` est un [paramètre](https://github.com/actions/starter-workflows/blob/e3c451d60f119b71caebf13c98ac45da6e15b4b7/README.md?plain=1#L68) que GitHub remplace par le nom de ta branche (`main`) quand tu ajoutes le template.',
			'La matrice crée **trois jobs**. [`strategy.fail-fast`](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategyfail-fast) vaut `true` par défaut : si le job 18.x échoue, GitHub annule les jobs 20.x et 22.x encore en cours ou en attente.',
			'`actions/checkout@v4` pointe vers un **tag**, et un tag peut être déplacé. Le [guide de sécurité](https://docs.github.com/en/actions/reference/security/secure-use) de GitHub recommande d’épingler les actions sur un SHA de commit complet, et sur un tag seulement si tu fais confiance à l’auteur. Même idée que les digests d’image du jour 19.',
			'`cache: \'npm\'` fait garder par `setup-node` les données globales des paquets npm d’un run à l’autre. Son [README](https://github.com/actions/setup-node/blob/949feb2413d6458794dcd2491c4babbbce0c15c1/README.md?plain=1#L162-L168) précise qu’il ne met pas `node_modules` en cache. `npm ci` installe ensuite exactement ce que dit le fichier lock.'
		]
	},
	tradeoff: {
		gain: [
			'Pas de serveur de build à patcher : les runners hébergés par GitHub sont des machines neuves que quelqu’un d’autre maintient.',
			'Le pipeline est relu dans la même pull request que le code qu’il teste.',
			'Des actions toutes prêtes pour les étapes courantes : checkout, installation d’un langage, connexion au cloud. Tu écris moins de shell.'
		],
		cost: [
			'Chaque `uses:` est du code de quelqu’un d’autre qui tourne avec ton token et tes secrets. Il faut les choisir et les épingler avec soin.',
			'Ça lie ton pipeline à GitHub. Passer à GitLab ou Jenkins veut dire le réécrire.',
			'Une machine propre à chaque run veut dire que rien n’est en cache sauf si tu le demandes, donc les installations lentes reviennent à chaque fois.'
		]
	},
	task: {
		prompt: 'Ajoute un job `deploy` à ce workflow. Il doit tourner seulement après le succès de **tous** les jobs de la matrice, seulement sur les pushs vers `main` (jamais sur les pull requests), et il a besoin d’une clé SSH appelée `DEPLOY_KEY`. Écris les lignes clés et dis où vit la clé.',
		hint: 'Regarde `needs`, `if` et le contexte `secrets`. Pense à ce qu’une pull request venant d’un fork devrait pouvoir toucher.',
		answer: [
			'`needs: build` : le job attend le job build, avec chaque copie de la matrice, et il est sauté si l’une d’elles échoue.',
			'`if: github.event_name == \'push\' && github.ref == \'refs/heads/main\'` : une pull request ne déploie jamais.',
			'La clé vit dans les paramètres du dépôt, comme secret, jamais dans le YAML. Le step la lit avec `env: DEPLOY_KEY: ${{ secrets.DEPLOY_KEY }}`.',
			'Bonus : GitHub ne transmet pas les secrets (à part `GITHUB_TOKEN`, qui y est en lecture seule) aux workflows lancés depuis un fork. La pull request d’un inconnu ne peut pas lire ta clé de déploiement. L’événement `pull_request_target` est l’exception : il tourne dans le contexte de ton dépôt, avec tes secrets, donc ne construis jamais le code de la pull request dedans.'
		]
	},
	quiz: [
		{
			q: 'Dans GitHub Actions, qu’est-ce qu’un runner ?',
			options: [
				'Le fichier YAML dans `.github/workflows/`',
				'La machine qui exécute un job',
				'Un step réutilisable venant de la Marketplace',
				'L’événement qui lance un workflow'
			],
			answer: 1,
			why: 'Le workflow est le fichier, l’événement le lance, une action est un step réutilisable. Le runner est la machine (hébergée par GitHub ou la tienne) où les steps d’un job tournent vraiment.'
		},
		{
			q: 'Une matrice lance le même job sur Node.js 18, 20 et 22. Le workflow ne définit pas `fail-fast`. Le job 18 échoue pendant que les deux autres tournent encore. Que se passe-t-il ?',
			options: [
				'Les deux autres continuent, et le workflow est marqué réussi',
				'GitHub annule les jobs de cette matrice encore en cours ou en attente',
				'GitHub relance le job 18 trois fois',
				'Les deux autres finissent, puis le job 18 est relancé'
			],
			answer: 1,
			why: '`strategy.fail-fast` vaut `true` par défaut. Un job de matrice en échec annule les autres. Mets-le à `false` quand tu veux tous les résultats, par exemple pour voir quelles versions cassent.'
		},
		{
			q: 'Quelqu’un ouvre une pull request depuis un fork de ton dépôt. Ton workflow tourne sur `pull_request` et lit `secrets.DEPLOY_KEY`. Que reçoit le job ?',
			options: [
				'La vraie clé, parce que c’est le fichier de workflow de ton dépôt qui tourne',
				'La vraie clé, mais GitHub la masque en *** partout où elle apparaît dans les logs',
				'Aucune valeur : les secrets autres que `GITHUB_TOKEN` ne sont pas transmis aux runs d’un fork',
				'Une erreur qui fait échouer le workflow avant même sa première étape'
			],
			answer: 2,
			why: 'GitHub n’envoie pas tes secrets à un run lancé depuis un dépôt forké. Sinon n’importe qui pourrait ouvrir une pull request qui les affiche.'
		}
	],
	takeaway: 'Un événement lance un workflow, un workflow lance des jobs, chaque job exécute ses steps sur un runner. Garde les secrets dans les paramètres, et épingle les actions que tu utilises.',
	sources: [
		{ title: 'Doc GitHub, Understanding GitHub Actions', url: 'https://docs.github.com/en/actions/get-started/understand-github-actions' },
		{ title: 'Doc GitHub, syntaxe des workflows GitHub Actions', url: 'https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax' },
		{ title: 'Doc GitHub, utiliser des secrets dans GitHub Actions', url: 'https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets' },
		{ title: 'Doc GitHub, lancer des variantes d’un job (matrice)', url: 'https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/run-job-variations' },
		{ title: 'actions/starter-workflows, ci/node.js.yml', url: `${STARTER}/ci/node.js.yml` }
	]
};
