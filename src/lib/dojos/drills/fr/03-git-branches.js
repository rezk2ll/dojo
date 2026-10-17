/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'git-branches',
	part: 'Git',
	title: 'Les branches',
	minutes: 10,
	hook: [
		'Le ticket 1042 signale que la facture 1042 compte 1 centime de TVA en trop, et il te faut une branche pour le correctif. Lea te demande de lire sa branche `feature/pdf`, et Omar a poussé une branche de tests que tu veux récupérer. Pendant ce temps, `git branch` liste de vieilles branches fusionnées que personne n’a touchées depuis.',
		'Tu es sur `main` dans le dépôt `invoices`, sans modification en cours, et `main` suit `origin/main`. Les autres branches locales : `fix-rounding` (fusionnée dans `main`), `feature/pdf` (1 commit absent de `main`, poussée sur `origin` mais sans upstream configuré) et `spike/xml` (1 commit absent de `main`, jamais poussée). Sur `origin`, la branche `fix/tax-tests` d’Omar existe, et tu l’as déjà récupérée avec `git fetch`. Chaque exercice part de cet état.'
	],
	terms: [
		{ term: 'branche', def: 'Un nom qui pointe vers un commit. Chaque nouveau commit sur la branche fait avancer ce nom jusqu’à lui.' },
		{ term: 'branche de suivi distante', def: 'Ta copie locale d’une branche d’un dépôt distant, comme `origin/fix/tax-tests`. `git fetch` la met à jour.' },
		{ term: 'upstream', def: 'La branche de suivi distante à laquelle une branche locale est liée. Sur cette branche, `git status` se compare à elle et un simple `git pull` tire depuis elle.' },
		{ term: 'fusionnée', def: 'Une branche est fusionnée dans `main` quand son dernier commit est atteignable depuis `main` : la supprimer ne fait perdre aucun commit.' }
	],
	reps: [
		{
			prompt: 'Crée une branche `fix/vat-1042` là où tu es, et bascule dessus.',
			accept: [
				'git switch -c fix/vat-1042',
				'git switch --create fix/vat-1042',
				'git switch -c fix/vat-1042 main',
				'git switch -c fix/vat-1042 HEAD',
				'git checkout -b fix/vat-1042',
				'git checkout -b fix/vat-1042 main',
				'git checkout -b fix/vat-1042 HEAD'
			],
			why: '`git switch -c fix/vat-1042` crée la branche sur le commit courant, puis bascule dessus. `git checkout -b` fait la même chose avec l’ancienne commande.'
		},
		{
			prompt: 'Crée une branche `release/2.4` sur le commit courant, en restant sur `main`.',
			accept: [
				'git branch release/2.4',
				'git branch release/2.4 main',
				'git branch release/2.4 HEAD'
			],
			why: '`git branch release/2.4` crée le nom sur `HEAD` sans changer de branche. Un `git branch` sans argument la liste ensuite sans l’`*` qui marque la branche courante.'
		},
		{
			prompt: 'Tu as lancé `git switch feature/pdf` pour lire le code de Lea. Reviens sur la branche d’avant, sans taper son nom.',
			accept: [
				'git switch -',
				'git switch @{-1}',
				'git checkout -',
				'git checkout @{-1}'
			],
			why: '`-` désigne la branche où tu étais avant le dernier changement. La doc : "You may also specify - which is synonymous to @{-1}." Ici, tu reviens sur `main`.'
		},
		{
			prompt: 'Liste les branches locales, chacune avec le hash court et le sujet de son dernier commit.',
			accept: [
				'git branch -v',
				'git branch --verbose',
				'git branch -v --list',
				'git branch --list -v',
				'git branch -l -v',
				'git branch -v -l'
			],
			why: '`-v` ajoute le hash court et la ligne de sujet du dernier commit de chaque branche. Ici, 4 lignes, avec `*` devant `main`.'
		},
		{
			prompt: 'Liste seulement les branches fusionnées dans `main`.',
			accept: [
				'git branch --merged main',
				'git branch --merged',
				'git branch --merged HEAD',
				'git branch --merged=main'
			],
			why: '`--merged main` garde les branches dont le dernier commit est atteignable depuis `main`. Ici : `fix-rounding` et `main` elle-même. Sans commit, `--merged` prend `HEAD`, c’est-à-dire `main` ici.'
		},
		{
			prompt: 'Supprime `fix-rounding`, avec la forme où git refuse si la branche contient des commits non fusionnés.',
			accept: [
				'git branch -d fix-rounding',
				'git branch --delete fix-rounding'
			],
			why: '`-d` ne supprime la branche que si elle est fusionnée dans son upstream, ou dans `HEAD` si elle n’en a pas. `fix-rounding` est fusionnée dans `main`, donc git affiche `Deleted branch fix-rounding`.'
		},
		{
			prompt: 'Supprime `spike/xml`, même si son commit n’est fusionné nulle part.',
			accept: [
				'git branch -D spike/xml',
				'git branch -d -f spike/xml',
				'git branch -df spike/xml',
				'git branch -d --force spike/xml',
				'git branch --delete --force spike/xml',
				'git branch --delete -f spike/xml'
			],
			why: '`-D` est le raccourci de `--delete --force`. Un simple `-d` s’arrête ici sur `error: the branch \'spike/xml\' is not fully merged.` et garde la branche.'
		},
		{
			prompt: 'Renomme `feature/pdf` en `feature/pdf-export` sans basculer dessus.',
			accept: [
				'git branch -m feature/pdf feature/pdf-export',
				'git branch --move feature/pdf feature/pdf-export',
				'git branch -M feature/pdf feature/pdf-export',
				'git branch -m -f feature/pdf feature/pdf-export',
				'git branch --move --force feature/pdf feature/pdf-export'
			],
			why: '`-m` prend l’ancien nom, puis le nouveau. Git déplace aussi la config et le reflog de la branche sous le nouveau nom. Avec un seul nom, `-m` renomme la branche où tu es.'
		},
		{
			prompt: 'Liste les branches de suivi distantes.',
			accept: [
				'git branch -r',
				'git branch --remotes',
				'git branch -r --list',
				'git branch --list -r',
				'git branch -l -r',
				'git branch -r -l'
			],
			why: '`-r` liste les branches de suivi distantes au lieu des branches locales. Ici, une ligne par branche de `origin`, dont `origin/fix/tax-tests`.'
		},
		{
			prompt: 'Crée une branche locale `fix/tax-tests` qui suit `origin/fix/tax-tests`, et bascule dessus.',
			accept: [
				'git switch fix/tax-tests',
				'git switch -c fix/tax-tests origin/fix/tax-tests',
				'git switch -c fix/tax-tests --track origin/fix/tax-tests',
				'git switch --track origin/fix/tax-tests',
				'git switch -t origin/fix/tax-tests',
				'git checkout fix/tax-tests',
				'git checkout -b fix/tax-tests origin/fix/tax-tests',
				'git checkout -b fix/tax-tests --track origin/fix/tax-tests',
				'git checkout --track origin/fix/tax-tests',
				'git checkout -t origin/fix/tax-tests'
			],
			why: '`git switch fix/tax-tests` ne trouve aucune branche locale de ce nom, mais trouve `origin/fix/tax-tests` sur un seul dépôt distant. Git fait alors comme `git switch -c fix/tax-tests --track origin/fix/tax-tests` : il crée la branche à cet endroit et règle son upstream.'
		},
		{
			prompt: 'Sans quitter `main`, règle l’upstream de `feature/pdf` sur `origin/feature/pdf`.',
			accept: [
				'git branch -u origin/feature/pdf feature/pdf',
				'git branch --set-upstream-to=origin/feature/pdf feature/pdf',
				'git branch --set-upstream-to origin/feature/pdf feature/pdf'
			],
			why: '`-u origin/feature/pdf` fixe l’upstream, et le dernier argument nomme la branche à modifier. Sans lui, git modifie la branche courante, ici `main`.'
		},
		{
			prompt: 'Liste les branches locales avec leur dernier commit et l’upstream que chacune suit.',
			accept: [
				'git branch -vv',
				'git branch -v -v',
				'git branch --verbose --verbose',
				'git branch -vv --list',
				'git branch --list -vv'
			],
			why: 'Donné deux fois, `-v` affiche aussi l’upstream entre crochets, comme `[origin/main]`. Ici, seule `main` en a un, car `feature/pdf` n’a pas encore d’upstream.'
		}
	],
	quiz: [],
	recall: {
		q: 'Quelle option de `git branch` supprime une branche seulement si elle est fusionnée, et laquelle la supprime quand même ?',
		a: '`-d` supprime seulement une branche fusionnée et refuse sinon. `-D`, raccourci de `--delete --force`, la supprime quand même.'
	},
	sources: [
		{ title: 'Documentation Git, git-branch', url: 'https://git-scm.com/docs/git-branch' },
		{ title: 'Documentation Git, git-switch', url: 'https://git-scm.com/docs/git-switch' },
		{ title: 'Documentation Git, git-checkout', url: 'https://git-scm.com/docs/git-checkout' }
	]
};
