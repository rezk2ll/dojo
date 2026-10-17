/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'git-diff',
	part: 'Git',
	title: 'Voir les changements',
	minutes: 10,
	hook: [
		'Tu vas faire un commit dans le dépôt `invoices`, sur `main`. Ce matin, tu as modifié 3 fichiers et lancé `git add` sur l’un d’eux. Avant le commit, tu veux voir exactement quelles lignes partent et lesquelles restent. Ensuite, Lea te demande ce que sa branche `feature/pdf` apporterait à `main`.',
		'`git status --short` affiche `M  app/billing.py` (indexé), puis ` M app/tax.py` et ` M README.md` (non indexés). Dans `app/tax.py`, tu as remplacé `REDUCED = Decimal("0.055")` par `Decimal("0.10")`. Dans `README.md`, tu as remplacé `python -m app` par `python3 -m app`. La branche `feature/pdf` de Lea ajoute `app/pdf.py`. Depuis qu’elle l’a créée, `main` a reçu un commit de plus, `Add the reduced VAT rate`, qui ajoute 2 lignes à `app/tax.py`.'
	],
	terms: [
		{ term: 'copie de travail', def: 'Les fichiers sur ton disque, tels que tu les modifies.' },
		{ term: 'index', def: 'La zone de préparation : l’instantané des fichiers que `git commit` va enregistrer. `git add` y copie un fichier depuis la copie de travail.' },
		{ term: 'base de fusion', def: 'Le commit le plus récent que deux branches ont en commun : le point où `feature/pdf` a quitté `main`.' }
	],
	reps: [
		{
			prompt: 'Affiche les changements que tu n’as pas encore indexés.',
			accept: [
				'git diff'
			],
			why: 'Sans argument, `git diff` compare la copie de travail avec l’index. Ici, il montre `README.md` et `app/tax.py`, mais pas `app/billing.py`, déjà indexé.'
		},
		{
			prompt: 'Affiche les changements indexés, ceux que le prochain commit va enregistrer.',
			accept: [
				'git diff --staged',
				'git diff --cached',
				'git diff --staged HEAD',
				'git diff --cached HEAD'
			],
			why: '`--staged` compare l’index avec le dernier commit, `HEAD`. La doc : "--staged is a synonym of --cached." Ici, seul `app/billing.py` apparaît.'
		},
		{
			prompt: 'Affiche tous les changements depuis le dernier commit, indexés ou non, dans un seul diff.',
			accept: [
				'git diff HEAD',
				'git diff @'
			],
			why: '`git diff HEAD` compare la copie de travail avec le commit pointé par `HEAD`, sans tenir compte de l’index. Les 3 fichiers apparaissent. `@` est un raccourci pour `HEAD`.'
		},
		{
			prompt: 'Liste seulement les noms des fichiers qui ont des changements non indexés.',
			accept: [
				'git diff --name-only'
			],
			why: '`--name-only` affiche un nom de fichier par ligne au lieu du patch. Ici : `README.md` et `app/tax.py`.'
		},
		{
			prompt: 'Affiche les changements non indexés de `app/tax.py` seulement.',
			accept: [
				'git diff -- app/tax.py',
				'git diff app/tax.py'
			],
			why: 'Un chemin après `--` limite le diff à ce fichier. `README.md` a changé aussi, mais il n’apparaît pas.'
		},
		{
			prompt: 'Affiche le changement non indexé de `README.md` mot par mot, au lieu de ligne par ligne.',
			accept: [
				'git diff --word-diff -- README.md',
				'git diff --word-diff README.md',
				'git diff --word-diff=plain -- README.md',
				'git diff --word-diff=plain README.md'
			],
			why: '`--word-diff` marque les mots changés à l’intérieur de la ligne : `Run with: [-python-]{+python3+} -m app`. Les mots sont séparés par les espaces, et `plain` est le mode par défaut.'
		},
		{
			prompt: 'Affiche la différence entre le bout de `main` et celui de `feature/pdf`, dans cet ordre.',
			accept: [
				'git diff main feature/pdf',
				'git diff main..feature/pdf'
			],
			why: '`git diff main feature/pdf` compare les deux commits désignés par les noms de branche. Tu vois l’ajout de `app/pdf.py`, et aussi la ligne `REDUCED` retirée : elle est sur `main` et pas sur la branche. Ici, `main..feature/pdf` donne la même chose.'
		},
		{
			prompt: 'Affiche la même comparaison en diffstat : une ligne par fichier avec son nombre de lignes changées.',
			accept: [
				'git diff --stat main feature/pdf',
				'git diff --stat main..feature/pdf',
				'git diff main feature/pdf --stat',
				'git diff main..feature/pdf --stat'
			],
			why: '`--stat` remplace le patch par un diffstat : `app/pdf.py | 2 ++` et `app/tax.py | 2 --`, puis `2 files changed, 2 insertions(+), 2 deletions(-)`.'
		},
		{
			prompt: 'Affiche seulement ce que `feature/pdf` a changé depuis qu’elle a quitté `main`, sans les commits reçus par `main` entre-temps.',
			accept: [
				'git diff main...feature/pdf',
				'git diff $(git merge-base main feature/pdf) feature/pdf',
				'git diff --merge-base main feature/pdf'
			],
			why: 'Avec trois points, git compare la base de fusion des deux branches avec `feature/pdf`. La doc : "git diff A...B is equivalent to git diff $(git merge-base A B) B." Il ne reste que `app/pdf.py`.'
		},
		{
			prompt: 'Liste seulement les noms des fichiers que `feature/pdf` a changés depuis qu’elle a quitté `main`.',
			accept: [
				'git diff --name-only main...feature/pdf',
				'git diff --name-only --merge-base main feature/pdf',
				'git diff main...feature/pdf --name-only',
				'git diff --merge-base main feature/pdf --name-only'
			],
			why: '`--name-only` affiche les noms au lieu du patch, et `main...feature/pdf` part de la base de fusion. La sortie tient en une ligne : `app/pdf.py`.'
		}
	],
	quiz: [],
	recall: {
		q: 'La branche de Lea a quitté `main`, et `main` a reçu des commits depuis. Quelle forme de `git diff` montre seulement ses changements à elle ?',
		a: '`git diff main...feature/pdf`, avec trois points. Git compare la base de fusion avec `feature/pdf`, donc les commits arrivés ensuite sur `main` n’apparaissent pas.'
	},
	sources: [
		{ title: 'Documentation Git, git-diff', url: 'https://git-scm.com/docs/git-diff' },
		{ title: 'Documentation Git, gitrevisions', url: 'https://git-scm.com/docs/gitrevisions' }
	]
};
