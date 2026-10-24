const STARTER = 'https://github.com/actions/starter-workflows/blob/e3c451d60f119b71caebf13c98ac45da6e15b4b7';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'github-actions',
	part: 'CI/CD',
	title: 'GitHub Actions : un pipeline dans le dépôt',
	minutes: 10,
	hook: [
		'Tu as un serveur de build quelque part. Un cron, ou un hook, lance `make test` et t’envoie un mail quand ça casse. Tu le patches, tu le mets à jour, et tu es le seul à savoir comment il marche.',
		'Avec GitHub Actions, le pipeline est **un fichier YAML dans le dépôt**, sous `.github/workflows/`. GitHub surveille les événements (un push, une pull request), démarre une machine neuve et y exécute tes étapes.',
		'Deux réglages posent problème très tôt : les secrets, et la matrice qui lance un même job plusieurs fois.'
	],
	terms: [
		{ term: 'Workflow', def: 'Un fichier YAML dans `.github/workflows/`. Il dit quand tourner (`on:`) et quoi exécuter (`jobs:`).' },
		{ term: 'Job et step', def: 'Un job est une liste de steps exécutés dans l’ordre **sur le même runner**. Les jobs tournent en parallèle, sauf si l’un a besoin (`needs`) d’un autre.' },
		{ term: 'Runner', def: 'La machine qui exécute un job. Les runners hébergés par GitHub sont des machines virtuelles neuves (Ubuntu, Windows, macOS). Tu peux aussi héberger les tiens.' },
		{ term: 'Matrice', def: 'Une liste de valeurs pour laquelle GitHub lance le même job une fois par valeur, par exemple trois versions de Node.js, sans que tu copies le job.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['ev["Événement : push ou pull_request"] --> wf["Workflow : .github/workflows/node.js.yml"]'],
				highlight: ['ev', 'wf'],
				note: 'Un événement dans le dépôt, un `push` ou une `pull_request`, lance le **workflow**. Tu n’installes ni serveur ni hook : GitHub lit le fichier dans `.github/workflows/`, et rien d’autre.'
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
				note: 'Les steps partagent le disque du runner, donc le step 3 voit le code que le step 1 a récupéré. `uses:` appelle une **action**, un step réutilisable que quelqu’un a empaqueté, comme `actions/checkout`. `run:` lance de simples commandes shell.'
			},
			{
				add: ['mx["Matrice : un job par node-version, 18, 20, 22"]', 'wf --> mx', 'mx -.-> job'],
				highlight: ['mx'],
				note: 'La matrice lance le job trois fois en parallèle, une fois par version de Node.js. Par défaut, si l’un échoue, GitHub **annule les autres**.'
			},
			{
				add: ['sec["Secrets : secrets.DEPLOY_KEY"]', 'sec -.-> s3', 'class sec ext'],
				highlight: ['sec'],
				note: 'Tu ranges les secrets dans les paramètres du dépôt, hors du YAML. Un step en lit un avec `${{ secrets.NAME }}`, et GitHub masque sa valeur dans les logs. Ce masquage n’est pas garanti : un secret transformé (encodé, ou dans du JSON) peut quand même fuiter.'
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
			'GitHub propose ce workflow de démarrage pour les projets Node.js. Aux lignes 5 et 7, `$default-branch` est un [paramètre](https://github.com/actions/starter-workflows/blob/e3c451d60f119b71caebf13c98ac45da6e15b4b7/README.md?plain=1#L68) que GitHub remplace par le nom de ta branche (`main`) quand tu ajoutes le template.',
			'Les lignes 14 à 16 créent **trois jobs**, un par version de Node.js. [`strategy.fail-fast`](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategyfail-fast) vaut `true` par défaut : si le job 18.x échoue, GitHub annule les jobs 20.x et 22.x encore en cours ou en attente.',
			'La ligne 20, `actions/checkout@v4`, pointe vers un **tag**, et l’auteur peut déplacer ce tag vers un autre code. Le [guide de sécurité](https://docs.github.com/en/actions/reference/security/secure-use) de GitHub recommande d’épingler les actions sur un SHA de commit complet, et sur un tag seulement si tu fais confiance à l’auteur. Au jour 19, tu as épinglé les images sur un digest pour la même raison.',
			'La ligne 25, `cache: \'npm\'`, fait garder par `setup-node` les données globales des paquets npm d’un run à l’autre. Son [README](https://github.com/actions/setup-node/blob/949feb2413d6458794dcd2491c4babbbce0c15c1/README.md?plain=1#L162-L168) précise qu’il ne met pas `node_modules` en cache. `npm ci` installe ensuite exactement ce que dit le fichier lock.'
		]
	},
	tradeoff: {
		gain: [
			'Pas de serveur de build à patcher : les runners hébergés par GitHub sont des machines neuves que quelqu’un d’autre maintient.',
			'Le pipeline est relu dans la même pull request que le code qu’il teste.',
			'Des actions toutes prêtes couvrent les étapes courantes (checkout, installation d’un langage, connexion au cloud), donc tu écris moins de shell.'
		],
		cost: [
			'Chaque `uses:` fait tourner le code de quelqu’un d’autre avec ton token et tes secrets. Tu dois choisir chaque action et l’épingler sur un commit.',
			'La syntaxe des workflows ne marche que sur GitHub. Pour passer à GitLab ou Jenkins, tu réécris le pipeline.',
			'Chaque run démarre sur une machine propre : rien n’est en cache sauf si tu le demandes, donc les installations lentes reviennent à chaque run.'
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
		],
		steps: [
			{
				title: 'Attends la matrice',
				questions: [
					{ q: 'Quelle clé fait attendre le job build à `deploy` ?', options: ['`runs-on: build`', '`strategy: build`', '`needs: build`', '`uses: build`'], answer: 2, why: '`needs` ordonne les jobs. `runs-on` choisit un runner et `uses` appelle une action.' },
					{ q: 'Le job build a une matrice de trois versions de Node.js. Qu’attend `needs: build` ?', options: ['Chaque copie de la matrice du job build', 'Seulement la première copie qui finit', 'Seulement la copie 22.x', 'Rien : les copies de la matrice comptent comme des workflows à part'], answer: 0, why: 'La matrice crée trois jobs sous un seul identifiant de job. `needs` les attend tous.' },
					{ q: 'La copie 18.x échoue. Que fait `deploy` ?', options: ['Il tourne avec les résultats 20.x et 22.x', 'Il attend que quelqu’un relance la 18.x', 'Il tourne, marqué d’un avertissement', 'Il est sauté'], answer: 3, why: 'Un job est sauté quand un job dont il a besoin (`needs`) échoue.' },
					{ q: 'Sans `needs`, quand `deploy` démarrerait-il ?', options: ['Après les jobs build quand même, parce qu’il est plus bas dans le fichier', 'Tout de suite, en parallèle des jobs build', 'Jamais, parce qu’il n’a pas de déclencheur', 'Seulement à la fin de tout le workflow'], answer: 1, why: 'Les jobs tournent en parallèle, sauf si l’un a besoin (`needs`) d’un autre. L’ordre dans le fichier ne compte pas.' }
				]
			},
			{
				title: 'Limite-le à main',
				questions: [
					{ q: 'Quelle ligne réserve `deploy` aux pushs sur `main` ?', options: ['`if: github.event_name == \'push\' && github.ref == \'refs/heads/main\'`', '`if: github.event_name == \'pull_request\'`', '`if: github.ref == \'main\' || github.event_name == \'push\'`', '`if: matrix.node-version == \'22.x\'`'], answer: 0, why: 'Les deux conditions doivent tenir : l’événement est un push, et la ref est la branche `main`.' },
					{ q: 'Pourquoi ne pas simplement retirer `pull_request` du `on:` du workflow ?', options: ['GitHub refuse un workflow avec seulement `push`', 'Les secrets ont besoin d’un déclencheur `pull_request`', 'Le build et les tests doivent toujours tourner sur les pull requests', 'La matrice ne marche que sur les pull requests'], answer: 2, why: 'Tu veux que chaque pull request soit testée. Seul le job `deploy` est limité.' },
					{ q: 'Quelqu’un pousse sur une branche `feature-x`. `deploy` tourne-t-il ?', options: ['Oui, c’est un push', 'Oui, mais sans les secrets', 'Seulement si tous les jobs de la matrice passent', 'Non : la ref n’est pas `refs/heads/main`'], answer: 3, why: 'La condition sur l’événement passe, celle sur la branche échoue, donc le `if` est faux.' },
					{ q: 'Où va le `if` ?', options: ['Sur le job `deploy`, à côté de `needs`', 'Dans la matrice du job build', 'Sur le step `actions/checkout`', 'Sous la clé `on:` du workflow'], answer: 0, why: 'Un `if` au niveau du job décide si ce seul job tourne. Les jobs build ne sont pas touchés.' }
				]
			},
			{
				title: 'Range la clé',
				questions: [
					{ q: 'Où vit `DEPLOY_KEY` ?', options: ['Dans le YAML, sous `env:`', 'Dans les paramètres du dépôt, comme secret', 'Dans un fichier commité sous `.github/`', 'Dans l’image du runner'], answer: 1, why: 'Les secrets vivent dans les paramètres du dépôt, hors du YAML, donc la clé n’est jamais dans le code.' },
					{ q: 'Comment le step de déploiement lit-il la clé ?', options: ['`run: cat DEPLOY_KEY`', '`with: secrets.DEPLOY_KEY`', '`uses: secrets/DEPLOY_KEY`', '`env: DEPLOY_KEY: ${{ secrets.DEPLOY_KEY }}`'], answer: 3, why: 'Le contexte `secrets` contient la valeur. `env:` la passe au shell du step.' },
					{ q: 'La clé finit dans une ligne de log. Que fait GitHub ?', options: ['Il masque la valeur, au mieux', 'Il supprime tout le log', 'Il fait échouer le job et change la clé', 'Rien : les logs montrent les secrets tels quels'], answer: 0, why: 'GitHub masque les secrets dans les logs. Un secret transformé (encodé, ou dans du JSON) peut quand même fuiter.' },
					{ q: 'Pourquoi ne pas coller la clé dans le fichier de workflow ?', options: ['Le YAML ne sait pas stocker de texte sur plusieurs lignes', 'Toute personne qui lit le dépôt pourrait lire la clé', 'Le runner efface les valeurs du YAML avant de démarrer', 'GitHub refuse les fichiers plus longs qu’une clé'], answer: 1, why: 'Le workflow est du code dans le dépôt. Les secrets restent dans les paramètres pour que le code puisse être partagé et relu.' }
				]
			},
			{
				title: 'Vérifie les forks',
				questions: [
					{ q: 'Un inconnu ouvre une pull request depuis un fork. Que contient `secrets.DEPLOY_KEY` dans ce run ?', options: ['La vraie clé', 'La vraie clé, affichée en ***', 'Aucune valeur', 'Une erreur avant le premier step'], answer: 2, why: 'GitHub ne transmet pas les secrets aux runs d’un fork.' },
					{ q: 'Quel jeton un run depuis un fork reçoit-il quand même ?', options: ['`DEPLOY_KEY`, en lecture seule', '`GITHUB_TOKEN`, en lecture seule dans ce cas', 'Tous les secrets, en lecture seule', 'Aucun'], answer: 1, why: '`GITHUB_TOKEN` est la seule exception, et il est en lecture seule pour un fork.' },
					{ q: 'L’événement `pull_request_target` tourne dans le contexte de ton dépôt, avec tes secrets. Que ne dois-tu jamais y faire ?', options: ['Lire `GITHUB_TOKEN`', 'Utiliser une matrice', 'Tourner sur `ubuntu-latest`', 'Construire le code de la pull request'], answer: 3, why: 'Le code de la pull request tournerait à côté de tes secrets et pourrait les afficher.' },
					{ q: 'Pourquoi GitHub retient-il les secrets pour les runs d’un fork ?', options: ['Sinon n’importe qui pourrait ouvrir une pull request qui les affiche', 'Les runs de fork sont trop lents pour les secrets', 'Les forks tournent toujours sur des runners auto-hébergés', 'Le masquage ne marche pas dans les forks'], answer: 0, why: 'Une pull request peut changer les steps du workflow. Sans cette règle, un seul `echo` ferait fuiter ta clé.' }
				]
			}
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
	lab: {
		minutes: 25,
		goal: 'Faire tourner sur ton portable un workflow avec une matrice, un job `deploy` conditionnel et un secret, avec `act` et Docker.',
		steps: [
			'Installe [act](https://github.com/nektos/act), qui lance les workflows GitHub dans des conteneurs Docker locaux : `brew install act` sur macOS, ou décompresse `act_Linux_x86_64.tar.gz` depuis sa page de releases.',
			'Crée un dépôt : `mkdir -p ~/gha-lab/.github/workflows && cd ~/gha-lab && git init -b main`.',
			'Écris `.github/workflows/ci.yml` : `on: [push, pull_request]`, un job `build` avec une matrice `version: [18, 20, 22]` et un step `run: echo "testing on $VERSION"` (avec `env: VERSION: ${{ matrix.version }}`), et un job `deploy` avec les lignes `needs`, `if` et le secret de l’exercice. Son step lance `echo "key is $DEPLOY_KEY"`. Commite-le.',
			'Lance `act push -P ubuntu-latest=node:24-slim --secret DEPLOY_KEY=s3cr3t`, puis la même chose avec `act pull_request`.',
			'Fais échouer la copie 18 : remplace le step de build par `run: test "$VERSION" != 18` et relance la même commande `act push`, avec ses options `-P` et `--secret`.'
		],
		done: [
			'Le run push affiche `testing on 18`, `20` et `22`, puis `key is ***` : la valeur est masquée.',
			'Le run `pull_request` montre seulement les trois jobs build. `deploy` n’apparaît jamais.',
			'Avec la copie 18 en échec, act finit par `Error: Job \'build\' failed` et `deploy` ne démarre pas.'
		],
		solution: [
			'`deploy:` puis `needs: build`, `if: github.event_name == \'push\' && github.ref == \'refs/heads/main\'`, `runs-on: ubuntu-latest`.',
			'Son step : `- run: echo "key is $DEPLOY_KEY"` avec `env:` puis `DEPLOY_KEY: ${{ secrets.DEPLOY_KEY }}`.',
			'`-P ubuntu-latest=node:24-slim` associe le label du runner à une petite image qui a `bash`. Sur GitHub, le même fichier tourne sur une vraie VM Ubuntu.',
			'Sur GitHub, la valeur vient des paramètres du dépôt. `--secret` remplace cette page dans act.'
		]
	},
	recall: {
		q: 'Dans le workflow de démarrage Node.js, le job de matrice 18.x échoue. Qu’arrive-t-il aux jobs 20.x et 22.x, et quel réglage en décide ?',
		a: 'GitHub les annule s’ils tournent encore ou attendent, parce que `strategy.fail-fast` vaut `true` par défaut. Mets-le à `false` pour avoir tous les résultats.'
	},
	sources: [
		{ title: 'Doc GitHub, Understanding GitHub Actions', url: 'https://docs.github.com/en/actions/get-started/understand-github-actions' },
		{ title: 'Doc GitHub, syntaxe des workflows GitHub Actions', url: 'https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax' },
		{ title: 'Doc GitHub, utiliser des secrets dans GitHub Actions', url: 'https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets' },
		{ title: 'Doc GitHub, lancer des variantes d’un job (matrice)', url: 'https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/run-job-variations' },
		{ title: 'actions/starter-workflows, ci/node.js.yml', url: `${STARTER}/ci/node.js.yml` }
	]
};
