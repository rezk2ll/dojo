/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'git-find',
	part: 'Git',
	title: 'Retrouver des choses dans git',
	minutes: 10,
	hook: [
		'Depuis ce matin, les requêtes de `notes-api` vers le service de recherche expirent, et `npm test` échoue sur `main`. Au tag `v2.0`, les tests passaient. Tu veux savoir où le délai est réglé, qui a écrit le code de nouvelle tentative, et quel commit a cassé les tests.',
		'Le dépôt compte 8 commits sur `main`, signés Sara Lopez et Tom Weber. `src/config.js` contient une seule ligne, `export const TIMEOUT_MS = 2000;`. La valeur était 5000 au tag `v1.0`, 8000 au tag `v2.0`, et Tom l’a baissée à 2000 dans l’avant-dernier commit. `src/http.js` lit `TIMEOUT_MS`, et ses lignes 13 à 19 contiennent la fonction `fetchJson`, qui retente un GET 3 fois. `src/notes.js` appelait `slugify(` jusqu’à ce que Tom retire l’appel. Tu es sur `main`, sans modification en cours.'
	],
	terms: [
		{ term: 'pickaxe', def: 'Les options `-S` et `-G` de `git log`. Elles ne gardent que les commits dont le diff touche une chaîne ou une expression régulière donnée.' },
		{ term: 'bisect', def: 'Une recherche dichotomique dans l’historique. Tu marques un commit mauvais et un bon, et Git extrait le commit à mi-chemin pour que tu le testes.' },
		{ term: '`<rev>:<path>`', def: 'Le fichier `<path>` tel qu’il était enregistré dans le commit `<rev>`, par exemple `HEAD~2:src/config.js`.' }
	],
	reps: [
		{
			prompt: 'Trouve chaque ligne des fichiers suivis qui contient `TIMEOUT_MS`, avec son numéro de ligne.',
			accept: ['git grep -n TIMEOUT_MS', 'git grep -n "TIMEOUT_MS"', "git grep -n 'TIMEOUT_MS'", 'git grep --line-number TIMEOUT_MS'],
			why: '`git grep` cherche dans les fichiers suivis de la copie de travail, et `-n` ajoute le numéro de ligne après le nom du fichier, comme `src/http.js:5:`. Les options se placent avant le motif : `git grep TIMEOUT_MS -n` s’arrête sur `option \'-n\' must come before non-option arguments`.'
		},
		{
			prompt: 'Cherche `TIMEOUT_MS` dans les fichiers tels qu’ils étaient au tag `v1.0`, sans extraire le tag.',
			accept: ['git grep TIMEOUT_MS v1.0', 'git grep "TIMEOUT_MS" v1.0', "git grep 'TIMEOUT_MS' v1.0", 'git grep -e TIMEOUT_MS v1.0'],
			why: 'Un nom d’arbre après le motif fait chercher `git grep` dans les blobs de ce commit au lieu de la copie de travail. La sortie est `v1.0:src/config.js:export const TIMEOUT_MS = 5000;` : le tag précède chaque nom de fichier.'
		},
		{
			prompt: 'Liste, un par ligne, les commits qui ont ajouté ou retiré la chaîne `slugify`.',
			accept: [
				'git log -S slugify --oneline',
				'git log -Sslugify --oneline',
				'git log -S "slugify" --oneline',
				'git log --oneline -S slugify',
				'git log --oneline -Sslugify',
				'git log --oneline -S "slugify"',
				"git log --oneline -S 'slugify'"
			],
			why: '`-S slugify` garde les commits qui changent le nombre d’occurrences de `slugify` dans un fichier. Ici : le premier commit, qui l’a ajoutée, et "Use the title as the note id" de Tom, qui a retiré l’appel.'
		},
		{
			prompt: '`git log -S TIMEOUT_MS` rate les commits qui ont seulement changé la valeur, car le nombre d’occurrences n’a pas bougé. Liste, un par ligne, les commits dont le diff ajoute ou retire une ligne contenant `TIMEOUT_MS`.',
			accept: [
				'git log -G TIMEOUT_MS --oneline',
				'git log -GTIMEOUT_MS --oneline',
				'git log -G "TIMEOUT_MS" --oneline',
				'git log --oneline -G TIMEOUT_MS',
				'git log --oneline -GTIMEOUT_MS',
				'git log --oneline -G "TIMEOUT_MS"',
				"git log --oneline -G 'TIMEOUT_MS'"
			],
			why: '`-G TIMEOUT_MS` garde les commits dont le patch a une ligne ajoutée ou retirée qui correspond à cette expression régulière. Il trouve 4 commits, dont "Raise timeout to 8000 ms" et "Lower timeout to 2000 ms", que `-S` ignore.'
		},
		{
			prompt: 'Affiche qui a modifié en dernier chacune des lignes 13 à 19 de `src/http.js`.',
			accept: [
				'git blame -L 13,19 src/http.js',
				'git blame -L13,19 src/http.js',
				'git blame -L 13,+7 src/http.js',
				'git blame -L13,+7 src/http.js',
				'git blame src/http.js -L 13,19',
				'git blame -L :fetchJson src/http.js'
			],
			why: '`-L 13,19` limite la sortie à ces lignes, chacune avec le hash court, l’auteur et la date du dernier commit qui l’a touchée. Les 7 lignes affichent `391f28e4 (Tom Weber`. `-L 13,+7` compte 7 lignes à partir de la ligne 13 et donne la même plage.'
		},
		{
			prompt: 'Ouvre une session bisect pour trouver le commit qui a cassé `npm test`.',
			accept: ['git bisect start'],
			why: '`git bisect start` ouvre la session et attend. Git affiche `status: waiting for both good and bad commits`.'
		},
		{
			prompt: 'Le commit où tu es fait échouer `npm test`. Dis-le à bisect.',
			accept: ['git bisect bad', 'git bisect bad HEAD'],
			why: 'Sans argument, `git bisect bad` marque `HEAD` comme mauvais, ici le sommet de `main`. Git attend ensuite au moins un bon commit.'
		},
		{
			prompt: 'Les tests passaient au tag `v2.0`. Dis-le à bisect.',
			accept: ['git bisect good v2.0'],
			why: '`git bisect good v2.0` marque le tag comme bon. Avec les deux bouts, Git extrait un commit entre eux, ici "Retry failed GET requests 3 times", et affiche `Bisecting: 2 revisions left to test after this (roughly 1 step)`.'
		},
		{
			prompt: 'Tu as lancé `npm test` sur le commit extrait par bisect, et il passe. Dis-le à bisect.',
			accept: ['git bisect good', 'git bisect good HEAD'],
			why: 'Sans argument, `git bisect good` marque le commit extrait. Git passe au suivant, "Lower timeout to 2000 ms", avec 0 révision restante à tester.'
		},
		{
			prompt: 'Bisect a désigné le premier mauvais commit. Termine la session et reviens sur `main`.',
			accept: ['git bisect reset'],
			why: '`git bisect reset` efface l’état de bisect et ré-extrait la branche où tu étais avant `git bisect start`, ici `main`.'
		},
		{
			prompt: 'Lance une nouvelle session bisect en une commande, avec le `HEAD` actuel comme mauvais et `v2.0` comme bon.',
			accept: ['git bisect start HEAD v2.0', 'git bisect start main v2.0'],
			why: '`git bisect start` prend d’abord le mauvais commit, puis un ou plusieurs bons. `git bisect start HEAD v2.0` remplace les trois commandes `start`, `bad` et `good v2.0`.'
		},
		{
			prompt: 'Affiche `src/config.js` tel qu’il était 2 commits avant `HEAD`, sans toucher à ta copie de travail.',
			accept: [
				'git show HEAD~2:src/config.js',
				'git show HEAD^^:src/config.js',
				'git show HEAD~~:src/config.js',
				'git show main~2:src/config.js',
				'git show HEAD~2:./src/config.js',
				'git cat-file -p HEAD~2:src/config.js'
			],
			why: '`HEAD~2` est le grand-parent de `HEAD`, et `:src/config.js` désigne ce fichier dans ce commit. `git show` l’affiche : `export const TIMEOUT_MS = 8000;`, la valeur d’avant la baisse de Tom.'
		}
	],
	quiz: [],
	recall: {
		q: 'Un commit a remplacé `TIMEOUT_MS = 8000` par `TIMEOUT_MS = 2000`. Lequel de `git log -S TIMEOUT_MS` et `git log -G TIMEOUT_MS` le liste, et pourquoi ?',
		a: '`-G TIMEOUT_MS`. Le diff retire une ligne et en ajoute une, et les deux correspondent. `-S` compte les occurrences, et ce nombre est resté à 1.'
	},
	sources: [
		{ title: 'Documentation Git, git-grep', url: 'https://git-scm.com/docs/git-grep' },
		{ title: 'Documentation Git, git-log', url: 'https://git-scm.com/docs/git-log' },
		{ title: 'Documentation Git, git-blame', url: 'https://git-scm.com/docs/git-blame' },
		{ title: 'Documentation Git, git-bisect', url: 'https://git-scm.com/docs/git-bisect' },
		{ title: 'Documentation Git, git-show', url: 'https://git-scm.com/docs/git-show' }
	]
};
