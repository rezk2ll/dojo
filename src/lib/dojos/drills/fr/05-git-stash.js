/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'git-stash',
	part: 'Git',
	title: 'Le stash',
	minutes: 10,
	hook: [
		'Tu es au milieu d’une fonction de remise dans le dépôt `invoices` quand arrive un bug à corriger sur un `main` propre. Ton travail n’est pas prêt à être commité. `git stash` le met de côté, nettoie l’arbre de travail et te le rend quand tu as fini.',
		'Tu es sur `main`. `app/billing.py` est modifié (un nouvel argument `discount`), et `app/discount.py` est un nouveau fichier que git ne suit pas encore. À partir de l’exercice 3, tu as 2 entrées de stash : `discount wip` contient ce travail sur la remise, et la plus récente, `pdf wip`, contient 1 ligne ajoutée à `README.md`.'
	],
	terms: [
		{ term: 'entrée de stash', def: 'Un lot de changements non commités mis de côté, avec un message. `git stash push` en ajoute une et remet l’arbre de travail et l’index à l’état de `HEAD`.' },
		{ term: 'fichier non suivi', def: 'Un fichier de l’arbre de travail qui n’est jamais passé par `git add`. `git status --short` le marque `??`.' },
		{ term: '`stash@{n}`', def: 'Le nom d’une entrée : `stash@{0}` est la plus récente, `stash@{1}` la précédente. Tu peux aussi écrire le simple numéro `n`.' }
	],
	reps: [
		{
			prompt: 'Mets tes changements de côté avec le message `discount wip`.',
			accept: [
				'git stash push -m "discount wip"',
				"git stash push -m 'discount wip'",
				'git stash push --message "discount wip"',
				'git stash push --message="discount wip"',
				'git stash -m "discount wip"',
				"git stash -m 'discount wip'",
				'git stash --message "discount wip"',
				'git stash --message="discount wip"'
			],
			why: '`git stash push` met de côté les changements des fichiers suivis et les remet à l’état de `HEAD`, et `-m` fixe le message. Le fichier non suivi `app/discount.py` reste là : `git status --short` affiche toujours `?? app/discount.py`.'
		},
		{
			prompt: 'Mets tes changements de côté avec le message `discount wip`, en incluant le fichier non suivi `app/discount.py`.',
			accept: [
				'git stash push -u -m "discount wip"',
				"git stash push -u -m 'discount wip'",
				'git stash push --include-untracked -m "discount wip"',
				"git stash push --include-untracked -m 'discount wip'",
				'git stash push -m "discount wip" -u',
				'git stash push -m "discount wip" --include-untracked',
				"git stash push -m 'discount wip' -u",
				"git stash push -m 'discount wip' --include-untracked",
				'git stash -u -m "discount wip"',
				"git stash -u -m 'discount wip'",
				'git stash --include-untracked -m "discount wip"',
				"git stash --include-untracked -m 'discount wip'",
				'git stash -m "discount wip" -u',
				'git stash -m "discount wip" --include-untracked',
				"git stash -m 'discount wip' -u",
				"git stash -m 'discount wip' --include-untracked"
			],
			why: '`-u` (`--include-untracked`) met aussi de côté les fichiers non suivis, puis les retire de l’arbre de travail. Ensuite, `git status --short` n’affiche plus rien.'
		},
		{
			prompt: 'Liste tes entrées de stash.',
			accept: [
				'git stash list'
			],
			why: '`git stash list` affiche une ligne par entrée, la plus récente en premier : `stash@{0}: On main: pdf wip`, puis `stash@{1}: On main: discount wip`.'
		},
		{
			prompt: 'Affiche les fichiers modifiés par l’entrée `discount wip`, sous forme de diffstat.',
			accept: [
				'git stash show stash@{1}',
				"git stash show 'stash@{1}'",
				'git stash show "stash@{1}"',
				'git stash show 1',
				'git stash show --stat stash@{1}',
				'git stash show --stat 1'
			],
			why: 'Par défaut, `git stash show` affiche un diffstat, et `stash@{1}` désigne l’entrée la plus ancienne. Seul `app/billing.py` apparaît, car les fichiers non suivis sont exclus par défaut.'
		},
		{
			prompt: 'Affiche le même diffstat pour `discount wip`, avec ses fichiers non suivis.',
			accept: [
				'git stash show -u stash@{1}',
				'git stash show --include-untracked stash@{1}',
				'git stash show -u 1',
				'git stash show --include-untracked 1'
			],
			why: 'Avec `-u`, `git stash show` ajoute au diff les fichiers non suivis de l’entrée. La sortie liste maintenant `app/billing.py` et `app/discount.py`.'
		},
		{
			prompt: 'Affiche le diff complet de `discount wip`.',
			accept: [
				'git stash show -p stash@{1}',
				"git stash show -p 'stash@{1}'",
				'git stash show -p "stash@{1}"',
				'git stash show -p 1',
				'git stash show --patch stash@{1}',
				'git stash show --patch 1'
			],
			why: '`-p` demande le patch au lieu du diffstat. Tu vois les 2 lignes de `total()` retirées et les 2 nouvelles lignes avec `discount` ajoutées.'
		},
		{
			prompt: 'Applique `discount wip` à ton arbre de travail en le gardant dans la liste du stash.',
			accept: [
				'git stash apply stash@{1}',
				"git stash apply 'stash@{1}'",
				'git stash apply "stash@{1}"',
				'git stash apply 1'
			],
			why: '`git stash apply` restaure l’entrée et la laisse dans la liste. Ensuite, `git stash list` montre toujours 2 entrées, et `app/discount.py` est revenu, non suivi.'
		},
		{
			prompt: 'Supprime `pdf wip` de la liste du stash sans l’appliquer.',
			accept: [
				'git stash drop stash@{0}',
				'git stash drop',
				"git stash drop 'stash@{0}'",
				'git stash drop "stash@{0}"',
				'git stash drop 0'
			],
			why: '`git stash drop` retire une entrée, et `stash@{0}` est la plus récente, `pdf wip`. Sans nom, `drop` prend aussi `stash@{0}`. Ensuite, `discount wip` apparaît sous le nom `stash@{0}`.'
		},
		{
			prompt: 'Applique l’entrée la plus récente et retire-la de la liste, en une seule commande.',
			accept: [
				'git stash pop',
				'git stash pop stash@{0}',
				'git stash pop 0'
			],
			why: '`git stash pop` applique `stash@{0}` puis la supprime. Si l’application tombe sur un conflit, l’entrée reste dans la liste jusqu’à ce que tu la supprimes toi-même.'
		}
	],
	quiz: [],
	recall: {
		q: 'Tu lances `git stash push -m "discount wip"`, et `app/discount.py` est toujours dans `git status`. Quelle option l’aurait mis de côté ?',
		a: '`-u`, la forme courte de `--include-untracked`. Sans elle, git ne met de côté que les changements des fichiers suivis.'
	},
	sources: [{ title: 'Documentation Git, git-stash', url: 'https://git-scm.com/docs/git-stash' }]
};
