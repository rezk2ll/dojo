/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'git-rebase',
	part: 'Git',
	title: 'Rebase et cherry-pick',
	minutes: 10,
	hook: [
		'Tu travailles dans le dépôt `shop-api`. Ta branche `feature/coupons` est partie de `main` au commit `a9e72ef` et porte 3 commits : `45b9cd6` "Add coupon codes", `25c65af` "Apply coupon in cart total" et `ae6dc34` "Test coupons". Pendant ce temps, `main` a reçu 2 commits : `2951c52` "Fix rounding in cart total" et `1c9f830` "Bump version to 1.5.0". Le correctif d’arrondi et `25c65af` modifient la même ligne de `src/cart.js`.',
		'Il existe deux autres branches. `release/1.4` pointe encore sur `a9e72ef`, et la version 1.4 a besoin du correctif d’arrondi. `feature/export` part du sommet de `feature/coupons` et ajoute 1 commit, `5051dd9` "Add CSV export", qui crée seulement `src/export.js`. Tu es sur `feature/coupons`, sans modification en cours. Les exercices 2 et 3 suivent l’exercice 1 ; tous les autres repartent de cet état.'
	],
	terms: [
		{ term: 'rebase', def: 'Git prend les commits d’une branche, les applique un par un au-dessus d’un autre commit, puis déplace la branche sur le dernier nouveau commit.' },
		{ term: 'cherry-pick', def: 'Git applique le changement d’un commit existant au-dessus de la branche courante et l’enregistre comme un nouveau commit, avec un nouveau hash.' },
		{ term: '`A..B`', def: 'Les commits atteignables depuis `B` qui ne le sont pas depuis `A`. `A` lui-même n’en fait pas partie.' }
	],
	reps: [
		{
			prompt: 'Rejoue les 3 commits de `feature/coupons` au-dessus du `main` actuel.',
			accept: ['git rebase main', 'git rebase main feature/coupons'],
			why: '`git rebase main` applique au-dessus de `main` chaque commit de la branche courante que `main` n’a pas. Ici, il s’arrête sur `25c65af` avec `CONFLICT (content): Merge conflict in src/cart.js`, car le correctif d’arrondi a touché la même ligne.'
		},
		{
			prompt: 'Le rebase s’est arrêté sur le conflit. Tu as corrigé `src/cart.js` pour garder les deux changements. Marque le fichier comme résolu.',
			accept: ['git add src/cart.js', 'git add ./src/cart.js', 'git stage src/cart.js', 'git add .', 'git add -A'],
			why: '`git add src/cart.js` indexe le fichier corrigé, et c’est en l’indexant que tu signales à Git que son conflit est résolu. `git status` affiche alors `M  src/cart.js` au lieu de `UU src/cart.js`.'
		},
		{
			prompt: '`src/cart.js` est indexé. Laisse le rebase appliquer les commits restants.',
			accept: ['git rebase --continue'],
			why: '`--continue` enregistre le commit résolu et applique le suivant, `Test coupons`. Git affiche ensuite `Successfully rebased and updated refs/heads/feature/coupons.`'
		},
		{
			prompt: 'On recommence : le rebase s’est arrêté sur le même conflit, et cette fois tu veux retrouver `feature/coupons` exactement comme avant le rebase.',
			accept: ['git rebase --abort'],
			why: '`--abort` arrête le rebase et remet la branche sur son ancien sommet, `ae6dc34`. `git status` montre ensuite `feature/coupons` sans aucune modification.'
		},
		{
			prompt: 'Tu es sur `release/1.4`. Copie dessus le correctif d’arrondi `2951c52`.',
			accept: ['git cherry-pick 2951c52', 'git cherry-pick main~1', 'git cherry-pick main^', 'git cherry-pick main~'],
			why: '`git cherry-pick 2951c52` applique le changement de ce commit sur `release/1.4` et crée un nouveau commit, même message, autre hash. `main~1` désigne le même commit : le parent du sommet de `main`.'
		},
		{
			prompt: 'De nouveau sur `release/1.4`, copie `2951c52` en faisant indiquer au message du nouveau commit d’où il vient.',
			accept: ['git cherry-pick -x 2951c52', 'git cherry-pick 2951c52 -x', 'git cherry-pick -x main~1', 'git cherry-pick -x main^'],
			why: '`-x` ajoute la ligne `(cherry picked from commit 2951c529b056bd8c38be55a17e98cfda4433de01)` au message. La doc précise que c’est "done only for cherry picks without conflicts" : seulement quand il n’y a pas eu de conflit.'
		},
		{
			prompt: 'Sur `main`, tu as lancé `git cherry-pick 25c65af` et il s’est arrêté sur un conflit dans `src/cart.js`. Annule-le pour revenir où était `main`.',
			accept: ['git cherry-pick --abort'],
			why: '`git cherry-pick --abort` annule l’opération et revient à l’état d’avant. `main` reste sur `1c9f830` et la copie de travail n’a plus de modification.'
		},
		{
			prompt: 'Sur `release/1.4`, copie en une commande tous les commits que `feature/coupons` a et que `main` n’a pas.',
			accept: [
				'git cherry-pick main..feature/coupons',
				'git cherry-pick ^main feature/coupons',
				'git cherry-pick feature/coupons ^main',
				'git cherry-pick HEAD..feature/coupons',
				'git cherry-pick ..feature/coupons',
				'git cherry-pick release/1.4..feature/coupons'
			],
			why: '`main..feature/coupons` désigne les commits atteignables depuis `feature/coupons`, moins ceux atteignables depuis `main` : ici `45b9cd6`, `25c65af` et `ae6dc34`. Git les applique du plus ancien au plus récent et crée 3 commits sur `release/1.4`.'
		},
		{
			prompt: 'Sur `release/1.4`, copie seulement `45b9cd6` et `25c65af`, avec une seule plage qui inclut `45b9cd6`.',
			accept: [
				'git cherry-pick 45b9cd6^..25c65af',
				'git cherry-pick 45b9cd6~..25c65af',
				'git cherry-pick 45b9cd6~1..25c65af',
				'git cherry-pick a9e72ef..25c65af'
			],
			why: '`A..B` exclut `A` : `45b9cd6..25c65af` ne copierait que `25c65af`. `45b9cd6^` est le parent de `45b9cd6`, donc `45b9cd6^..25c65af` commence un commit plus tôt et l’inclut.'
		},
		{
			prompt: 'Tu es sur `feature/export`. Déplace sur `main` uniquement son propre commit, `5051dd9`, sans emporter les 3 commits des coupons.',
			accept: [
				'git rebase --onto main feature/coupons',
				'git rebase --onto main feature/coupons feature/export',
				'git rebase --onto=main feature/coupons',
				'git rebase --onto=main feature/coupons feature/export',
				'git rebase feature/coupons --onto main'
			],
			why: '`feature/coupons` sert d’upstream : Git ne prend que les commits de `feature/export` absents de `feature/coupons`, ici `5051dd9`. `--onto main` les pose sur `main` au lieu de l’upstream. Un simple `git rebase main` rejouerait aussi les 3 commits des coupons et buterait sur le conflit de `src/cart.js`.'
		}
	],
	quiz: [],
	recall: {
		q: 'Quelle plage copie `45b9cd6` et `25c65af` en un seul `git cherry-pick`, et pourquoi `45b9cd6..25c65af` ne suffit pas ?',
		a: '`45b9cd6^..25c65af`. Dans `A..B`, Git exclut `A` et tout ce qui le précède : la plage doit donc partir du parent, `45b9cd6^`.'
	},
	sources: [
		{ title: 'Documentation Git, git-rebase', url: 'https://git-scm.com/docs/git-rebase' },
		{ title: 'Documentation Git, git-cherry-pick', url: 'https://git-scm.com/docs/git-cherry-pick' },
		{ title: 'Documentation Git, gitrevisions', url: 'https://git-scm.com/docs/gitrevisions' }
	]
};
