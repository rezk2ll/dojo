/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'git-log',
	part: 'Git',
	title: 'Lire l’historique',
	minutes: 10,
	hook: [
		'Une cliente signale que la facture 1042 compte 1 centime de TVA de trop. Le calcul de la TVA se trouve dans le dépôt `invoices`, et tu as un terminal ouvert dedans. Avant de modifier quoi que ce soit, tu veux savoir qui a changé `app/tax.py`, quand, et ce que chaque changement a fait.',
		'Le dépôt compte 10 commits sur les 30 derniers jours, signés Lea Martin et Omar Haddad (adresse `ohaddad@example.com`). Il contient `README.md`, `app/billing.py`, `app/tax.py` et `app/pdf.py`. La branche d’Omar, `fix-rounding`, a été fusionnée dans `main` il y a 4 jours. La branche de Lea, `feature/pdf`, porte 1 commit pas encore fusionné. Tu es sur `main`, et chaque exercice se tape dans ce dépôt.'
	],
	terms: [
		{ term: 'hash court', def: 'Les premiers caractères de l’identifiant de 40 caractères d’un commit, assez pour le désigner sans ambiguïté dans ce dépôt.' },
		{ term: 'patch', def: 'Les lignes qu’un commit a ajoutées (préfixe `+`) et retirées (préfixe `-`), fichier par fichier.' },
		{ term: 'diffstat', def: 'Une ligne par fichier modifié avec le nombre de lignes changées, puis un total comme `1 file changed, 2 insertions(+)`.' },
		{ term: '`--`', def: 'Un séparateur sur la ligne de commande. Git lit chaque mot placé après comme un chemin, jamais comme une option ou un nom de branche.' }
	],
	reps: [
		{
			prompt: 'Affiche les 5 derniers commits, un par ligne.',
			accept: [
				'git log --oneline -5',
				'git log --oneline -n 5',
				'git log --oneline -n5',
				'git log --oneline --max-count=5',
				'git log -5 --oneline',
				'git log -n 5 --oneline',
				'git log -n5 --oneline',
				'git log --max-count=5 --oneline'
			],
			why: '`--oneline` affiche chaque commit sous la forme hash court plus ligne de sujet. `-5` s’arrête après 5 commits ; `-n 5` et `--max-count=5` sont la même option.'
		},
		{
			prompt: 'Affiche uniquement les commits d’Omar, un par ligne.',
			accept: [
				'git log --oneline --author=Omar',
				'git log --oneline --author Omar',
				'git log --oneline --author="Omar"',
				"git log --oneline --author='Omar'",
				'git log --oneline --author="Omar Haddad"',
				"git log --oneline --author='Omar Haddad'",
				'git log --oneline --author "Omar Haddad"',
				'git log --author=Omar --oneline',
				'git log --author Omar --oneline',
				'git log --author="Omar" --oneline',
				"git log --author='Omar' --oneline",
				'git log --author="Omar Haddad" --oneline',
				"git log --author='Omar Haddad' --oneline",
				'git log --author "Omar Haddad" --oneline'
			],
			why: '`--author=Omar` garde les commits dont la ligne d’auteur correspond à l’expression régulière `Omar`. La casse compte : ici, `--author=omar` ne trouve rien, sauf si tu ajoutes `-i`.'
		},
		{
			prompt: 'Affiche les commits des 2 dernières semaines, un par ligne.',
			accept: [
				'git log --oneline --since="2 weeks ago"',
				"git log --oneline --since='2 weeks ago'",
				'git log --oneline --since "2 weeks ago"',
				'git log --oneline --after="2 weeks ago"',
				"git log --oneline --after='2 weeks ago'",
				'git log --oneline --since=2.weeks',
				'git log --oneline --since=2.weeks.ago',
				'git log --since="2 weeks ago" --oneline',
				"git log --since='2 weeks ago' --oneline",
				'git log --since "2 weeks ago" --oneline',
				'git log --after="2 weeks ago" --oneline',
				"git log --after='2 weeks ago' --oneline",
				'git log --since=2.weeks --oneline',
				'git log --since=2.weeks.ago --oneline'
			],
			why: '`--since="2 weeks ago"` garde les commits plus récents que cette date. Les guillemets font de `2 weeks ago` un seul argument, et `--after` est un autre nom de la même option.'
		},
		{
			prompt: 'Affiche les commits qui ont modifié `app/tax.py`, un par ligne.',
			accept: [
				'git log --oneline -- app/tax.py',
				'git log --oneline app/tax.py'
			],
			why: '`-- app/tax.py` ne garde que les commits qui ont touché ce fichier. Git lit tout ce qui suit `--` comme un chemin. Sans lui, une branche nommée `app/tax.py` arrêterait git avec `ambiguous argument \'app/tax.py\': both revision and filename`.'
		},
		{
			prompt: 'Avec `git log`, affiche le dernier commit qui a modifié `app/tax.py`, avec son diff.',
			accept: [
				'git log -p -1 -- app/tax.py',
				'git log -p -1 app/tax.py',
				'git log -p -n 1 -- app/tax.py',
				'git log -p -n 1 app/tax.py',
				'git log -1 -p -- app/tax.py',
				'git log -1 -p app/tax.py',
				'git log -n 1 -p -- app/tax.py',
				'git log -n 1 -p app/tax.py'
			],
			why: '`-p` affiche le patch sous chaque commit, et `-1` s’arrête au premier. À cause de `-- app/tax.py`, le patch ne montre que ce fichier, même si le commit en a modifié d’autres.'
		},
		{
			prompt: 'Affiche les 3 derniers commits avec le nombre de lignes changées par fichier.',
			accept: [
				'git log --stat -3',
				'git log --stat -n 3',
				'git log --stat -n3',
				'git log -3 --stat',
				'git log -n 3 --stat',
				'git log -n3 --stat'
			],
			why: '`--stat` affiche un diffstat sous chaque commit, et `-3` s’arrête après 3 commits. Le commit de fusion n’a pas de diffstat : par défaut, `git log` n’affiche aucun diff pour les commits de fusion.'
		},
		{
			prompt: 'Dessine l’historique de toutes les branches en graphe, un commit par ligne.',
			accept: [
				'git log --oneline --graph --all',
				'git log --oneline --all --graph',
				'git log --graph --oneline --all',
				'git log --graph --all --oneline',
				'git log --all --oneline --graph',
				'git log --all --graph --oneline'
			],
			why: '`--graph` trace les branches avec `*`, `|` et `/` à gauche de chaque commit. `--all` part de chaque ref sous `refs/` en plus de `HEAD`, donc le commit non fusionné de `feature/pdf` apparaît aussi.'
		},
		{
			prompt: 'Affiche les commits d’Omar qui ont modifié `app/tax.py`, un par ligne.',
			accept: [
				'git log --oneline --author=Omar -- app/tax.py',
				'git log --oneline --author=Omar app/tax.py',
				'git log --oneline --author Omar -- app/tax.py',
				'git log --oneline --author Omar app/tax.py',
				'git log --oneline --author="Omar" -- app/tax.py',
				'git log --oneline --author="Omar" app/tax.py',
				'git log --oneline --author="Omar Haddad" -- app/tax.py',
				'git log --oneline --author="Omar Haddad" app/tax.py',
				'git log --author=Omar --oneline -- app/tax.py',
				'git log --author=Omar --oneline app/tax.py',
				'git log --author Omar --oneline -- app/tax.py',
				'git log --author Omar --oneline app/tax.py',
				'git log --author="Omar" --oneline -- app/tax.py',
				'git log --author="Omar" --oneline app/tax.py',
				'git log --author="Omar Haddad" --oneline -- app/tax.py',
				'git log --author="Omar Haddad" --oneline app/tax.py'
			],
			why: '`--author=Omar` et `-- app/tax.py` retirent chacun des commits : il reste ceux qui passent les deux filtres. Ici, le commit d’Omar sur `app/billing.py` et celui de Lea sur `app/tax.py` disparaissent.'
		}
	],
	quiz: [],
	recall: {
		q: 'Tu veux que `git log` liste seulement les commits qui ont modifié `app/tax.py`. Qu’ajoutes-tu, et à quoi sert le `--` ?',
		a: '`-- app/tax.py`. Git lit chaque mot après `--` comme un chemin, donc il ne prend jamais `app/tax.py` pour une branche ou une option.'
	},
	sources: [{ title: 'Documentation Git, git-log', url: 'https://git-scm.com/docs/git-log' }]
};
