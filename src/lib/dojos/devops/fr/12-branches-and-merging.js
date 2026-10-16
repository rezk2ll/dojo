const K8S = 'https://github.com/kubernetes/community/blob/440e496d3a172234d81728df1bfe43849b589adf';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'branches-and-merging',
	part: 'Git',
	title: 'Branches, merge et rebase',
	minutes: 10,
	hook: [
		'Deux admins modifient la même config sur le même serveur le même jour. Le dernier qui enregistre gagne. L’autre modification est **perdue sans un bruit**.',
		'Avec Git, chacun travaille sur une **branche**. Une branche n’est qu’un pointeur vers un commit, donc en créer une ne copie aucun fichier et ne coûte rien.',
		'Quand le travail se rejoint, Git fait soit un **merge** (il relie les deux lignes avec un nouveau commit), soit un **rebase** (il rejoue tes commits au-dessus de l’autre ligne). Si vous avez changé les mêmes lignes tous les deux, Git s’arrête et te demande. C’est un **conflit**, et c’est une bonne chose : rien ne se perd en silence.'
	],
	terms: [
		{ term: 'Branche', def: 'Un pointeur mobile vers un commit. Chaque nouveau commit sur la branche fait avancer le pointeur.' },
		{ term: 'Ancêtre commun', def: 'Le dernier commit que deux branches partagent, le point où elles se séparent.' },
		{ term: 'Fast-forward', def: 'Un merge où la branche cible n’a pas bougé depuis la séparation. Git déplace juste le pointeur, sans nouveau commit.' },
		{ term: 'Commit de merge', def: 'Un commit avec deux parents, écrit par un merge à trois points : les deux bouts de branche plus leur ancêtre commun.' },
		{ term: 'Rebase', def: 'Rejouer tes commits au-dessus d’une autre branche. Mêmes changements, nouveaux commits avec de nouveaux hashes.' },
		{ term: 'Conflit', def: 'Les deux côtés ont changé les mêmes lignes. Git marque le fichier et attend que tu choisisses.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['c1["C1"] --> c2["C2"]'],
				highlight: ['c2'],
				note: 'Deux commits sur `main`. Dans ce schéma, les flèches vont **dans le sens du temps**. La branche `main` est un pointeur vers C2.'
			},
			{
				add: ['c2 --> c3["C3 sur feature"]'],
				highlight: ['c3'],
				note: '`git switch -c feature` crée un nouveau pointeur sur C2. Ton commit C3 fait avancer seulement `feature`. `main` reste où il était.'
			},
			{
				add: ['c2 --> c4["C4 sur main : hotfix"]'],
				highlight: ['c4', 'c2'],
				note: 'Pendant ce temps, un hotfix C4 arrive sur `main`, qui pointe maintenant vers C4. L’historique a **divergé**. C2 est l’**ancêtre commun** des deux bouts.'
			},
			{
				add: ['c3 --> m["M : commit de merge, deux parents"]', 'c4 --> m'],
				highlight: ['m'],
				note: '`git merge feature` depuis `main` : Git compare C3, C4 et leur ancêtre commun C2 (un **merge à trois points**), puis écrit M avec deux parents. `main` avance sur M. Rien n’est réécrit.'
			},
			{
				add: ['c4 -.->|"ou : git rebase main"| c3r["C3 prime : même changement, nouveau hash"]'],
				highlight: ['c3r'],
				note: 'L’autre façon : sur `feature`, `git rebase main` rejoue C3 au-dessus de C4 sous forme d’un nouveau commit. Le snapshot final est le même que M, mais l’historique est **une ligne droite**. Ensuite `main` peut faire un fast-forward dessus.'
			}
		]
	},
	example: {
		title: 'contributors/guide/github-workflow.md',
		repo: 'kubernetes/community',
		url: `${K8S}/contributors/guide/github-workflow.md#L79-L99`,
		lang: 'markdown',
		code: `## 4. Keep your branch in sync

You will need to periodically fetch changes from the \`upstream\`
repository to keep your working branch in sync. Note that depending on which repository you are working from,
the default branch may be called 'main' instead of 'master'.

Make sure your local repository is on your working branch and run the
following commands to keep it in sync:

\`\`\`sh
git fetch upstream
git rebase upstream/master
\`\`\`

Please don't use \`git pull\` instead of the above \`fetch\` and
\`rebase\`. Since \`git pull\` executes a merge, it creates merge commits. These make the commit history messy
and violate the principle that commits ought to be individually understandable
and useful (see below).

You might also consider changing your \`.git/config\` file via
\`git config branch.autoSetupRebase always\` to change the behavior of \`git pull\`, or another non-merge option such as \`git pull --rebase\`.`,
		notes: [
			'Kubernetes choisit le **rebase** pour garder une branche à jour : `git fetch` télécharge les nouveaux commits, `git rebase` rejoue ton travail par-dessus. Ta branche reste une ligne droite au-dessus de `master`.',
			'Le guide part du principe que `git pull`, c’est `fetch` plus `merge` : chaque synchro d’une branche qui a divergé ajouterait un commit de merge qui ne dit rien. C’est l’historique « messy » qu’ils refusent. Les versions récentes de Git s’arrêtent à la place et te demandent de choisir `--rebase` ou `--no-rebase`.',
			'Le rebase crée de nouveaux commits, donc la copie déjà poussée sur ton fork ne correspond plus. C’est pour ça que le même guide pousse avec [`git push -f`](https://github.com/kubernetes/community/blob/440e496d3a172234d81728df1bfe43849b589adf/contributors/guide/github-workflow.md#L111-L118), et plus loin avec `--force-with-lease`, plus sûr.',
			'Ici c’est sans risque parce que la branche est **à toi seul**, sur ton fork. La règle unique de Pro Git : ne rebase pas des commits qui existent en dehors de ton dépôt et sur lesquels d’autres ont pu baser leur travail.'
		]
	},
	tradeoff: {
		gain: [
			'Le merge garde un historique fidèle : tu vois que le travail s’est fait en parallèle, et aucun commit n’est réécrit.',
			'Le rebase donne une ligne droite : `git log` se lit comme une histoire, un changement après l’autre.',
			'Les branches ne coûtent rien, donc tu peux tester une idée, jeter la branche, et rien n’est perdu sur `main`.'
		],
		cost: [
			'Les commits de merge s’empilent. Un log plein de « Merge branch main into feature » cache les vrais changements.',
			'Le rebase réécrit les hashes. Si la branche était déjà poussée, tu dois faire un force push, et quiconque a construit sur les anciens commits se retrouve dans le pétrin.',
			'Plus deux branches vivent longtemps séparées, plus le conflit est gros quand elles se retrouvent.'
		]
	},
	task: {
		prompt: 'Tu lances `git merge feature` sur `main` et Git s’arrête avec `CONFLICT (content): Merge conflict in nginx.conf`. Le fichier contient maintenant `<<<<<<< HEAD`, puis `worker_connections 2048;`, puis `=======`, puis `worker_connections 4096;`, puis `>>>>>>> feature`. Explique chaque partie et termine le merge.',
		hint: 'Un côté est la branche sur laquelle tu es, l’autre est la branche que tu merges. Git veut que les marqueurs disparaissent et que le fichier soit stagé.',
		answer: [
			'Entre `<<<<<<< HEAD` et `=======` : la version de la branche sur laquelle tu es, `main`. Entre `=======` et `>>>>>>> feature` : la version venue de `feature`.',
			'Choisis la bonne valeur (demande à l’auteur de l’autre côté si tu ne sais pas), supprime les trois lignes de marqueurs, enregistre. Lance `nginx -t` au passage.',
			'`git add nginx.conf` marque le conflit comme résolu. Ensuite `git commit` écrit le commit de merge.',
			'Perdu ? `git merge --abort` essaie de te ramener à l’état d’avant le merge, pour repartir de zéro.'
		]
	},
	quiz: [
		{
			q: 'Qu’est-ce qu’une branche Git ?',
			options: [
				'Un pointeur mobile vers un commit',
				'Une copie complète des fichiers du projet dans un autre dossier',
				'Une liste de diffs en attente de merge',
				'Une copie du dépôt sur un autre serveur'
			],
			answer: 0,
			why: 'Une branche est une petite ref qui contient un hash de commit. Commiter dessus fait avancer le pointeur. Aucun fichier n’est copié.'
		},
		{
			q: '`main` n’a pas bougé depuis que tu as créé `feature`. Tu lances `git merge feature` sur `main`. Que se passe-t-il ?',
			options: [
				'Git écrit un commit de merge avec deux parents',
				'Git fait un fast-forward : il déplace `main` au bout de `feature`, sans nouveau commit',
				'Git rebase `feature` sur `main`',
				'Git signale un conflit'
			],
			answer: 1,
			why: 'Quand le bout de `feature` est juste devant `main`, il n’y a rien à combiner. Git avance simplement le pointeur.'
		},
		{
			q: 'Quel rebase est risqué ?',
			options: [
				'Rebaser une branche locale que personne d’autre n’a récupérée',
				'Rebaser sur le dernier `main` avant d’ouvrir une pull request',
				'Rebaser pour écraser des commits de typo avant que quelqu’un les voie',
				'Rebaser des commits déjà poussés, sur lesquels d’autres ont construit'
			],
			answer: 3,
			why: 'Le rebase remplace des commits par de nouveaux. Si d’autres ont construit sur les anciens, leur historique et le tien ne correspondent plus.'
		}
	],
	takeaway: 'Une branche est un pointeur, donc créer une branche est gratuit. Le merge relie deux lignes avec un nouveau commit, le rebase rejoue les tiens par-dessus, et tu ne rebases que ce sur quoi personne n’a construit.',
	sources: [
		{ title: 'Pro Git, Basic Branching and Merging', url: 'https://git-scm.com/book/en/v2/Git-Branching-Basic-Branching-and-Merging' },
		{ title: 'Pro Git, Rebasing', url: 'https://git-scm.com/book/en/v2/Git-Branching-Rebasing' },
		{ title: 'Doc Git, git-merge', url: 'https://git-scm.com/docs/git-merge' },
		{ title: 'Kubernetes, GitHub Workflow', url: `${K8S}/contributors/guide/github-workflow.md` }
	]
};
