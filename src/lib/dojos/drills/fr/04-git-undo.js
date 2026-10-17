/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'git-undo',
	part: 'Git',
	title: 'Annuler',
	minutes: 10,
	hook: [
		'Tu as indexé le mauvais fichier, laissé une faute dans un message de commit, puis poussé un commit qui fausse les totaux de TVA. Git a une commande d’annulation pour chaque cas. Certaines ne touchent que tes fichiers, d’autres déplacent la branche, et une dernière retrouve des commits qui semblent perdus.',
		'Tu es sur `main` dans le dépôt `invoices` des chapitres précédents, sans modification en cours. Les 3 derniers commits de `main`, du plus récent au plus ancien : `Add the reduced VAT rate` (2 lignes ajoutées à `app/tax.py`), `Merge branch \'fix-rounding\'` et `Skip empty invoice lines`. Chaque exercice part de cet état, plus ce que décrit sa consigne.'
	],
	terms: [
		{ term: 'HEAD', def: 'Le commit sur lequel tu es. Sur une branche, c’est son commit le plus récent, et `HEAD~2` est son grand-parent en suivant les premiers parents.' },
		{ term: 'index', def: 'La zone de préparation : ce que contiendra le prochain commit. `git add` y copie un fichier.' },
		{ term: 'reflog', def: 'Un journal local de chaque commit vers lequel `HEAD` a pointé, du plus récent au plus ancien, numérotés `HEAD@{0}`, `HEAD@{1}` et ainsi de suite.' }
	],
	reps: [
		{
			prompt: 'Tu as modifié `app/billing.py` sans l’indexer. Jette cette modification.',
			accept: [
				'git restore app/billing.py',
				'git restore -- app/billing.py',
				'git checkout app/billing.py',
				'git checkout -- app/billing.py'
			],
			why: 'Sans `--staged`, `git restore` recopie le fichier de l’index vers l’arbre de travail. Ta modification non indexée de `app/billing.py` est écrasée.'
		},
		{
			prompt: 'Tu as modifié `app/tax.py` et lancé `git add app/tax.py` trop tôt. Retire-le de l’index en gardant la modification.',
			accept: [
				'git restore --staged app/tax.py',
				'git restore --staged -- app/tax.py',
				'git restore -S app/tax.py',
				'git restore -S -- app/tax.py',
				'git reset app/tax.py',
				'git reset -- app/tax.py',
				'git reset HEAD app/tax.py',
				'git reset HEAD -- app/tax.py',
				'git reset -q app/tax.py'
			],
			why: '`--staged` ne restaure que l’index, depuis `HEAD`. Le fichier sur disque garde ta modification, et `git status --short` affiche ` M app/tax.py`.'
		},
		{
			prompt: 'Remets `app/tax.py` tel qu’il était dans `HEAD~2`, dans l’arbre de travail seulement.',
			accept: [
				'git restore --source=HEAD~2 app/tax.py',
				'git restore --source=HEAD~2 -- app/tax.py',
				'git restore --source HEAD~2 app/tax.py',
				'git restore --source HEAD~2 -- app/tax.py',
				'git restore -s HEAD~2 app/tax.py',
				'git restore -s HEAD~2 -- app/tax.py',
				'git restore -sHEAD~2 app/tax.py'
			],
			why: '`--source=HEAD~2` prend le fichier dans ce commit au lieu de l’index. Tu retrouves sur disque la version `round(amount * RATE, 2)`, non indexée, et aucun commit ne bouge.'
		},
		{
			prompt: 'Tu as oublié `README.md` dans le dernier commit. Il est indexé maintenant. Ajoute-le au dernier commit en gardant le message.',
			accept: [
				'git commit --amend --no-edit',
				'git commit --no-edit --amend'
			],
			why: '`--amend` remplace le dernier commit par un nouveau construit depuis l’index, qui contient donc `README.md`. `--no-edit` garde l’ancien message sans ouvrir d’éditeur. Le nouveau commit a un nouveau hash.'
		},
		{
			prompt: 'Remplace le message du dernier commit par `Add the reduced VAT rate of 5.5%`. Tu n’as rien d’indexé.',
			accept: [
				'git commit --amend -m "Add the reduced VAT rate of 5.5%"',
				"git commit --amend -m 'Add the reduced VAT rate of 5.5%'",
				'git commit --amend --message="Add the reduced VAT rate of 5.5%"',
				'git commit -m "Add the reduced VAT rate of 5.5%" --amend',
				"git commit -m 'Add the reduced VAT rate of 5.5%' --amend",
				'git commit --message="Add the reduced VAT rate of 5.5%" --amend'
			],
			why: '`-m` donne le nouveau message, et `--amend` le pose sur un nouveau commit qui remplace le dernier. Rien n’est indexé, donc les fichiers du commit ne changent pas.'
		},
		{
			prompt: 'Le dernier commit est déjà poussé et fausse les totaux. Annule-le par un nouveau commit, avec le message par défaut et sans éditeur.',
			accept: [
				'git revert --no-edit HEAD',
				'git revert HEAD --no-edit'
			],
			why: '`git revert HEAD` enregistre un nouveau commit qui retire les 2 lignes ajoutées par `HEAD` dans `app/tax.py`. `--no-edit` garde le message par défaut `Revert "Add the reduced VAT rate"`. Le commit d’origine reste dans l’historique.'
		},
		{
			prompt: 'Annule le dernier commit, mais garde ses changements indexés.',
			accept: [
				'git reset --soft HEAD~1',
				'git reset --soft HEAD~',
				'git reset --soft HEAD^',
				'git reset --soft @~'
			],
			why: '`--soft` recule `main` d’un commit sans toucher à l’index ni à l’arbre de travail. `git status --short` montre le changement annulé comme indexé : `M  app/tax.py`.'
		},
		{
			prompt: 'Annule les 2 derniers commits et garde leurs changements sur disque, non indexés.',
			accept: [
				'git reset HEAD~2',
				'git reset --mixed HEAD~2',
				'git reset HEAD^^',
				'git reset --mixed HEAD^^',
				'git reset HEAD~~',
				'git reset -q HEAD~2'
			],
			why: 'Sans mode, `git reset` utilise `--mixed`. Il place `main` sur `HEAD~2` et remet l’index au même état, mais laisse les fichiers sur disque : les changements apparaissent en ` M app/tax.py`.'
		},
		{
			prompt: 'Tu as lancé `git reset --hard HEAD~3` et les 3 commits ont disparu de `git log`. Liste les positions successives de `HEAD`.',
			accept: [
				'git reflog',
				'git reflog show',
				'git reflog show HEAD',
				'git reflog HEAD'
			],
			why: '`git reflog` affiche le reflog de `HEAD`, le plus récent en haut. `HEAD@{0}` est `reset: moving to HEAD~3`, et `HEAD@{1}` est `commit: Add the reduced VAT rate`, ta position avant le reset.'
		},
		{
			prompt: 'Après ce `git reset --hard HEAD~3`, ramène `main` là où était `HEAD` un mouvement plus tôt.',
			accept: [
				'git reset --hard HEAD@{1}',
				"git reset --hard 'HEAD@{1}'",
				'git reset --hard "HEAD@{1}"'
			],
			why: '`HEAD@{1}` désigne la position de `HEAD` il y a un mouvement. `--hard` y place `main` et aligne l’index et l’arbre de travail, donc les 3 commits reviennent.'
		}
	],
	quiz: [],
	recall: {
		q: 'Tu as retiré 3 commits avec `git reset --hard HEAD~3`. Quelle commande liste les positions passées de `HEAD`, et quel nom désigne l’ancien sommet ?',
		a: '`git reflog`. L’ancien sommet est `HEAD@{1}`, donc `git reset --hard HEAD@{1}` ramène les 3 commits.'
	},
	sources: [
		{ title: 'Documentation Git, git-restore', url: 'https://git-scm.com/docs/git-restore' },
		{ title: 'Documentation Git, git-reset', url: 'https://git-scm.com/docs/git-reset' },
		{ title: 'Documentation Git, git-commit', url: 'https://git-scm.com/docs/git-commit' },
		{ title: 'Documentation Git, git-revert', url: 'https://git-scm.com/docs/git-revert' },
		{ title: 'Documentation Git, git-reflog', url: 'https://git-scm.com/docs/git-reflog' },
		{ title: 'Documentation Git, gitrevisions', url: 'https://git-scm.com/docs/gitrevisions' }
	]
};
