const NODE = 'https://github.com/nodejs/node/blob/f59539b514344ed0a0945f8790d61121df88a5d4';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'pull-requests',
	part: 'Git',
	title: 'Pull requests, branches protégées et CODEOWNERS',
	minutes: 10,
	hook: [
		'Sur les anciens serveurs, la revue d’un changement, c’était un message sur le chat : « je redémarre nginx avec la nouvelle config, ok ? » Quelqu’un répondait « ok ». Personne n’avait vu le diff.',
		'Une pull request (PR) est une proposition : « merge ma branche dans `main` ». Elle montre le diff, lance la CI et rassemble les revues, tout ça **avant** que quoi que ce soit n’arrive sur `main`. GitLab appelle la même chose une merge request.',
		'Un jour de rush, quelqu’un saute la revue, alors tu demandes à GitHub de l’imposer. Une **branche protégée** peut exiger une PR, une approbation et des checks obligatoires au vert avant que `main` bouge. Un fichier CODEOWNERS décide à qui GitHub demande la revue.'
	],
	terms: [
		{ term: 'Pull request', def: 'Une demande de merge d’une branche dans une autre, avec le diff, la discussion, les revues et les résultats de CI au même endroit.' },
		{ term: 'Branche protégée', def: 'Une branche avec des règles : par défaut pas de force push ni de suppression, plus des règles en option comme les revues et les checks obligatoires.' },
		{ term: 'Status check obligatoire', def: 'Un job de CI qui doit finir en succès, skipped ou neutral avant que la PR puisse être mergée.' },
		{ term: 'CODEOWNERS', def: 'Un fichier qui associe des chemins à des personnes ou des équipes. Les owners sont sollicités automatiquement en revue quand une PR, une fois sortie du brouillon, touche leurs fichiers.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['br["branche feature"] -->|"ouvre une PR"| pr["Pull request : diff et discussion"]'],
				highlight: ['br', 'pr'],
				note: 'Tu pousses ta branche et tu ouvres une PR vers `main`. Rien n’a encore changé sur `main`. Les relecteurs lisent le diff et commentent dans la PR.'
			},
			{
				add: ['pr --> ci["CI : lint, tests"]'],
				highlight: ['ci'],
				note: 'La CI tourne sur la PR. La machine vérifie d’abord, donc les humains relisent un changement qui compile et passe déjà les tests.'
			},
			{
				add: ['co["CODEOWNERS"] -.->|"demande la revue"| rev["Relecteur : un code owner"]', 'rev -->|"approuve ou demande des changements"| pr'],
				highlight: ['co', 'rev'],
				note: 'La PR touche `prod/`. CODEOWNERS dit que `prod/` appartient à l’équipe ops, donc GitHub **lui demande la revue automatiquement**.'
			},
			{
				add: [
					'subgraph prot["Protection de branche sur main"]',
					'gate{"Approuvée et checks verts ?"}',
					'end',
					'pr --> gate',
					'gate -->|oui| main["main"]',
					'gate -->|non| blocked["le merge reste bloqué"]'
				],
				highlight: ['gate', 'main', 'blocked'],
				note: 'La règle de protection bloque le merge tant que les approbations manquent ou que les checks obligatoires ne sont pas verts. Avec les revues obligatoires, les collaborateurs ne peuvent changer `main` **que par une PR approuvée**.'
			},
			{
				add: ['br -.->|"nouveau push après approbation"| pr'],
				highlight: ['br'],
				note: 'Tu pousses un commit de plus après l’approbation. Avec « dismiss stale pull request approvals » activé, GitHub annule l’ancienne approbation : le diff a changé, donc quelqu’un doit approuver à nouveau.'
			}
		]
	},
	example: {
		title: '.github/CODEOWNERS',
		repo: 'nodejs/node',
		url: `${NODE}/.github/CODEOWNERS#L1-L23`,
		lang: 'ini',
		code: `# Node.js Project Codeowners

# This file does not define any requirements for landing PRs.
# Its purpose is to allow automation of courtesy pings to the
# relevant team(s) when any of the paths listed here are modified.
# Criteria for landing PRs are defined in
# https://github.com/nodejs/node/blob/main/doc/contributing/collaborator-guide.md#code-reviews.
#
# Codeowners must always be teams, never individuals.

# tsc

/.github/CODEOWNERS @nodejs/tsc
/.github/PULL_REQUEST_TEMPLATE.md @nodejs/tsc
/.github/ISSUE_TEMPLATE/* @nodejs/tsc
/CODE_OF_CONDUCT.md @nodejs/tsc
/CONTRIBUTING.md @nodejs/tsc
/doc/contributing/**/* @nodejs/tsc
/GOVERNANCE.md @nodejs/tsc
/SECURITY.md @nodejs/tsc
/BUILDING.md @nodejs/build @nodejs/tsc
/LICENSE @nodejs/tsc
/onboarding.md @nodejs/tsc`,
		notes: [
			'Les lignes 3 à 7 disent que ce fichier envoie des **pings de courtoisie** et ne décide pas de ce qui peut être mergé. Tout seul, CODEOWNERS ne fait que demander des revues. Il ne bloque un merge que si une règle de protection de branche (ou un ruleset, la forme plus récente des mêmes règles sur GitHub) active « Require review from Code Owners ».',
			'Ligne 9 : les owners doivent être des équipes, jamais des personnes. Une entrée d’équipe continue de marcher quand une personne quitte le projet. GitHub exige aussi que chaque owner, équipe ou personne, ait l’accès en écriture au dépôt.',
			'La ligne 13 rend le fichier propriétaire de lui-même : changer qui possède quoi demande l’équipe `@nodejs/tsc`. La doc GitHub présente un CODEOWNERS dans `.github/` qui se possède lui-même comme la méthode la plus sûre.',
			'Ligne 21 : `/BUILDING.md` liste deux équipes. Quand la revue des code owners est obligatoire, **l’approbation d’un seul owner** suffit.',
			'Quand deux motifs correspondent à un fichier, **c’est le dernier qui s’applique**. Mets la ligne fourre-tout `*` en premier et les chemins précis après. Une ligne à la syntaxe invalide est ignorée, et GitHub affiche l’erreur quand tu ouvres le fichier.'
		]
	},
	tradeoff: {
		gain: [
			'Chaque changement est relu et testé avant d’arriver sur `main`.',
			'La discussion reste à côté du diff : six mois plus tard, tu peux relire pourquoi un changement a été fait.',
			'CODEOWNERS envoie chaque changement aux gens qui connaissent la zone, sans que personne ait à faire le tri à la main.'
		],
		cost: [
			'Chaque PR attend un relecteur avant de pouvoir être mergée. Garde des PR petites : le [guide Kubernetes](https://github.com/kubernetes/community/blob/440e496d3a172234d81728df1bfe43849b589adf/contributors/guide/github-workflow.md#L141) dit que les très grosses PR sont très difficiles à relire.',
			'Par défaut, la protection de branche ne s’applique pas aux admins, sauf si tu actives « Do not allow bypassing the above settings ».',
			'La protection de branche se règle dans les paramètres du dépôt et dans aucun fichier Git, donc tu l’oublies facilement en créant le dépôt suivant.'
		]
	},
	task: {
		prompt: 'Tu gères un dépôt GitHub de playbooks Ansible qui déploient la production. Aujourd’hui, toute personne avec l’accès en écriture pousse directement sur `main`. Fais en sorte que : chaque changement passe par une PR, le job de CI `lint` doive passer, tout ce qui est sous `prod/` demande l’approbation de l’équipe `@acme/ops`, et personne (admins compris) ne puisse faire de force push sur `main`.',
		hint: 'Une règle de protection de branche sur `main` avec trois réglages, plus un fichier CODEOWNERS où l’ordre compte.',
		answer: [
			'Règle de protection sur `main` : « Require pull request reviews before merging » avec 1 approbation, et « Require review from Code Owners ».',
			'« Require status checks before merging », et sélectionne le check `lint`.',
			'Les force push et les suppressions sont déjà bloqués par défaut sur une branche protégée : laisse « Allow force pushes » désactivé. Active « Do not allow bypassing the above settings » pour que les admins suivent les règles aussi.',
			'`.github/CODEOWNERS` : `* @acme/devs` d’abord, puis `/prod/ @acme/ops`, puis `/.github/CODEOWNERS @acme/ops`. Le dernier motif gagne, donc les changements dans `prod/` vont à ops. Les deux équipes ont besoin de l’accès en écriture.'
		],
		steps: [
			{
				title: 'Exige une PR relue',
				questions: [
					{ q: 'Où règles-tu ce qui empêche les push directs sur `main` ?', options: ['Dans un fichier à la racine du dépôt', 'Dans une règle de protection de branche sur `main`, dans les paramètres du dépôt', 'Dans le job de CI `lint`', 'Dans le `.git/config` de chaque développeur'], answer: 1, why: 'La protection de branche vit dans les paramètres du dépôt, dans aucun fichier Git.' },
					{ q: 'Quel réglage fait passer chaque changement de `main` par une PR ?', options: ['« Require status checks before merging »', '« Allow force pushes »', '« Dismiss stale pull request approvals »', '« Require pull request reviews before merging »'], answer: 3, why: 'Avec les revues obligatoires, les collaborateurs ne peuvent changer `main` que par une PR approuvée.' },
					{ q: 'Quel réglage rend l’approbation d’ops obligatoire pour `prod/` ?', options: ['« Require review from Code Owners »', 'Un fichier CODEOWNERS tout seul', '« Require status checks before merging »', '« Do not allow bypassing the above settings »'], answer: 0, why: 'Tout seul, CODEOWNERS ne fait que demander des revues. C’est cette règle qui rend l’approbation de l’owner obligatoire.' },
					{ q: 'Quelqu’un pousse un nouveau commit après l’approbation. Avec « dismiss stale pull request approvals » activé, que se passe-t-il ?', options: ['La PR est mergée tout de suite', 'Le nouveau commit est refusé', 'L’ancienne approbation est annulée, donc quelqu’un doit approuver à nouveau', 'La CI est sautée pour ce commit'], answer: 2, why: 'Le diff a changé, donc l’approbation ne couvre plus ce qui sera mergé.' }
				]
			},
			{
				title: 'Exige le check lint',
				questions: [
					{ q: 'Quel réglage fait bloquer le merge par `lint` ?', options: ['« Require review from Code Owners »', '« Require status checks before merging », avec `lint` sélectionné', '« Require pull request reviews before merging »', 'Une ligne `lint` dans CODEOWNERS'], answer: 1, why: 'Un status check obligatoire est un job de CI qui doit finir en succès, skipped ou neutral avant que la PR puisse être mergée.' },
					{ q: 'Quels résultats de `lint` laissent la PR être mergée ?', options: ['N’importe lequel, une fois qu’il a tourné', 'Seulement succès', 'Succès, ou échec avec une approbation', 'Succès, skipped ou neutral'], answer: 3, why: 'GitHub accepte un check obligatoire qui finit en succès, skipped ou neutral. Un check en échec garde le merge bloqué.' },
					{ q: 'Pourquoi lancer la CI sur la PR avant la relecture humaine ?', options: ['Pour que les relecteurs lisent un changement qui passe déjà les checks', 'Pour que les relecteurs n’aient pas à lire le diff', 'Pour que la PR soit mergée sans approbation', 'Pour que `main` reçoive le commit plus tôt'], answer: 0, why: 'La machine vérifie d’abord. Les humains passent ensuite leur temps sur un changement qui compile et passe déjà.' },
					{ q: 'Où tourne le job `lint` dans ce flux ?', options: ['Seulement sur `main`, après le merge', 'Seulement sur le portable d’un développeur', 'Sur la PR, avant que quoi que ce soit n’arrive sur `main`', 'Seulement quand un admin le lance'], answer: 2, why: 'La CI tourne sur la PR, donc un changement cassé est repéré avant que `main` bouge.' }
				]
			},
			{
				title: 'Bloque les force push',
				questions: [
					{ q: 'Les force push sur un `main` protégé sont-ils bloqués par défaut ?', options: ['Oui : laisse « Allow force pushes » désactivé', 'Non : il faut ajouter un job de CI pour ça', 'Non : seul CODEOWNERS peut les bloquer', 'Seulement pour les utilisateurs sans accès en écriture'], answer: 0, why: 'Une branche protégée bloque par défaut les force push et les suppressions.' },
					{ q: 'Par défaut, les règles de protection s’appliquent-elles aux admins ?', options: ['Oui, toujours', 'Seulement pour les force push', 'Non, sauf si tu actives « Do not allow bypassing the above settings »', 'Seulement quand ils ouvrent une PR'], answer: 2, why: 'Par défaut, les admins peuvent contourner la protection de branche. Ce réglage les oblige à suivre les règles aussi.' },
					{ q: 'La consigne dit « admins compris ». Quel réglage couvre ça ?', options: ['« Require review from Code Owners »', '« Allow force pushes »', '« Dismiss stale pull request approvals »', '« Do not allow bypassing the above settings »'], answer: 3, why: 'C’est le seul réglage qui retire le contournement par les admins.' },
					{ q: 'Le mois prochain, tu crées un second dépôt de playbooks. De quoi dois-tu te souvenir ?', options: ['De rien : la protection est copiée depuis le premier dépôt', 'De régler à nouveau la protection de branche, qui n’est dans aucun fichier Git', 'De copier CODEOWNERS, qui porte la protection', 'De relancer `lint` une fois'], answer: 1, why: 'La protection de branche se règle dans les paramètres du dépôt, donc tu l’oublies facilement sur le dépôt suivant.' }
				]
			},
			{
				title: 'Écris CODEOWNERS',
				questions: [
					{ q: 'Quelle ligne vient en premier dans `.github/CODEOWNERS` ?', options: ['`/prod/ @acme/ops`', '`/.github/CODEOWNERS @acme/ops`', '`* @acme/devs`', 'N’importe laquelle : l’ordre ne compte pas'], answer: 2, why: 'Le dernier motif qui correspond gagne, donc le fourre-tout vient d’abord et les chemins précis après.' },
					{ q: 'Une PR ne change que `prod/hosts.ini`. Qui est sollicité pour la revue ?', options: ['Seulement `@acme/ops`', 'Les deux équipes', 'Seulement `@acme/devs`', 'Personne, car deux lignes correspondent'], answer: 0, why: '`/prod/ @acme/ops` vient après `*`, et le dernier motif gagne.' },
					{ q: 'Pourquoi ajouter `/.github/CODEOWNERS @acme/ops` ?', options: ['GitHub refuse le fichier sans elle', 'Elle rend ops owner de tous les fichiers', 'Elle cache le fichier aux devs', 'Changer qui possède quoi demande alors l’approbation d’ops'], answer: 3, why: 'La doc GitHub présente un CODEOWNERS dans `.github/` qui se possède lui-même comme la méthode la plus sûre.' },
					{ q: 'Que doivent avoir `@acme/devs` et `@acme/ops` pour que ça marche ?', options: ['Les droits admin sur le dépôt', 'L’accès en écriture au dépôt', 'Leur propre règle de protection de branche', 'Une entrée perso pour chaque membre'], answer: 1, why: 'GitHub exige que chaque code owner, équipe ou personne, ait l’accès en écriture.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Que fait un fichier CODEOWNERS tout seul, sans protection de branche ?',
			options: [
				'Il bloque les merges jusqu’à ce qu’un des owners listés approuve la PR',
				'Il donne aux owners les droits admin sur les chemins listés à côté d’eux',
				'Il empêche quiconque n’est pas owner de modifier ces fichiers',
				'Il demande la revue des owners sur les PR qui touchent leurs fichiers'
			],
			answer: 3,
			why: 'CODEOWNERS ne fait qu’envoyer les demandes de revue. C’est une règle de protection ou un ruleset avec « Require review from Code Owners » qui rend l’approbation obligatoire.'
		},
		{
			q: 'CODEOWNERS contient `* @acme/devs` en ligne 1 et `/prod/ @acme/ops` en ligne 2. Une PR ne change que `prod/hosts.ini`. Qui est sollicité pour la revue ?',
			options: [
				'Seulement `@acme/ops`, parce que le dernier motif qui correspond gagne',
				'Les deux équipes',
				'Seulement `@acme/devs`, parce que le premier motif qui correspond gagne',
				'Personne, parce que deux lignes correspondent au même fichier'
			],
			answer: 0,
			why: 'Dans CODEOWNERS, le dernier motif qui correspond a la priorité. La ligne fourre-tout ne s’applique qu’aux fichiers qu’aucune ligne suivante ne couvre.'
		},
		{
			q: 'Un status check obligatoire est configuré sur `main`. Quand une PR peut-elle être mergée ?',
			options: [
				'Dès que le check a tourné, quel que soit son résultat',
				'Quand le check est en succès, skipped ou neutral',
				'Dès qu’un relecteur approuve, les checks ne sont qu’indicatifs',
				'Seulement après qu’un admin a relancé le check à la main'
			],
			answer: 1,
			why: 'GitHub exige que chaque check obligatoire finisse en succès, skipped ou neutral. Un check en échec garde le merge bloqué.'
		}
	],
	lab: {
		minutes: 25,
		goal: 'Protéger `main` sur un dépôt GitHub jetable, puis le voir refuser un push direct et une PR au check rouge, venant de toi, l’admin.',
		steps: [
			'Il te faut un compte GitHub gratuit et `gh auth login`. Crée le dépôt avec un script et un fichier CODEOWNERS où un propriétaire n’existe pas : `mkdir -p ~/pr-lab && cd ~/pr-lab && git init -q -b main && echo \'echo deploying\' > deploy.sh && mkdir -p .github && printf \'* @%s\\n/prod/ @acme/ops\\n\' "$(gh api user --jq .login)" > .github/CODEOWNERS`.',
			'Ajoute un job `lint` qui vérifie le script, puis publie le dépôt : `mkdir -p .github/workflows && printf \'on: [push, pull_request]\\njobs:\\n  lint:\\n    runs-on: ubuntu-latest\\n    steps:\\n      - uses: actions/checkout@v4\\n      - run: bash -n deploy.sh\\n\' > .github/workflows/lint.yml && git add . && git commit -qm start && gh repo create pr-lab --public --source=. --push`. Il est public parce que les comptes gratuits n’ont la protection de branche que sur les dépôts publics. Demande ensuite à GitHub de vérifier CODEOWNERS : `gh api repos/{owner}/{repo}/codeowners/errors --jq \'.errors[] | {line, kind}\'`.',
			'Protège `main` : sur la page du dépôt, ouvre Settings, Branches, Add classic branch protection rule, avec le motif `main`. Active « Require a pull request before merging » et désactive « Require approvals », puisque tu ne peux pas approuver ta propre PR. Active « Require status checks to pass before merging » et choisis `lint`. Active « Do not allow bypassing the above settings » et enregistre. Vérifie avec `gh api repos/{owner}/{repo}/branches/main/protection --jq \'.required_status_checks.contexts, .enforce_admins.enabled\'`.',
			'Pousse un changement cassé directement sur `main` : `printf \'if then\\n\' >> deploy.sh && git commit -qam "break deploy" && git push origin main`. Déplace ensuite ce commit sur une branche et ouvre une PR : `git switch -c break && git branch -f main origin/main && git push -u origin break && gh pr create --fill`.',
			'Laisse quelques secondes au run pour démarrer, puis `gh pr checks --watch` et essaie `gh pr merge --merge`. Corrige le script sur la branche : `echo \'echo deploying v2\' > deploy.sh && git commit -qam "fix deploy" && git push`, puis `gh pr checks --watch` et `gh pr merge --merge --delete-branch`.',
			'Supprime le dépôt : `gh auth refresh -h github.com -s delete_repo`, puis `gh repo delete "$(gh api user --jq .login)/pr-lab" --yes` et `rm -rf ~/pr-lab`.'
		],
		done: [
			'L’étape 2 signale une erreur à la ligne 2, où GitHub ne connaît pas `@acme/ops`. La ligne 1, avec ton propre login, n’a pas d’erreur.',
			'L’étape 3 affiche `["lint"]` et `true`.',
			'Le push direct est refusé avec `GH006: Protected branch update failed`, alors que tu es admin du dépôt.',
			'Avec `lint` rouge, `gh pr merge` refuse. Après la correction, `lint` est vert et la PR est mergée.'
		],
		solution: [
			'GitHub ignore une ligne de CODEOWNERS qu’il ne peut pas utiliser et garde le reste. Un propriétaire doit exister et avoir l’accès en écriture, donc une faute de frappe dans un nom d’équipe coupe sans bruit les demandes de revue pour ce chemin, jusqu’à ce que quelqu’un lise les erreurs.',
			'« Require a pull request before merging » fait que `main` ne change que par une PR. « Do not allow bypassing the above settings » explique pourquoi ton push a échoué aussi : sans ce réglage, le push direct d’un admin passe.',
			'`bash -n` lit le script sans l’exécuter, et échoue sur `if then`. Le check obligatoire a gardé le merge bloqué jusqu’à ce qu’il soit vert, donc le script cassé n’a jamais atteint `main`.',
			'La règle vit dans les réglages du dépôt, pas dans Git : supprime le dépôt et la règle part avec lui. Sur un dépôt d’équipe, tu activerais aussi « Require approvals » et « Require review from Code Owners ».'
		]
	},
	recall: {
		q: 'CODEOWNERS contient `/prod/ @acme/ops`. Qu’est-ce qui rend l’approbation d’ops obligatoire avant qu’un changement dans `prod/` soit mergé ?',
		a: 'Une règle de protection de branche (ou un ruleset) sur `main` avec « Require review from Code Owners » activé. Tout seul, CODEOWNERS ne fait que demander la revue.'
	},
	sources: [
		{ title: 'GitHub Docs, About pull requests', url: 'https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/about-pull-requests' },
		{ title: 'GitHub Docs, About pull request reviews', url: 'https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/about-pull-request-reviews' },
		{ title: 'GitHub Docs, About protected branches', url: 'https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches' },
		{ title: 'GitHub Docs, About code owners', url: 'https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners' },
		{ title: 'GitLab Docs, Merge requests', url: 'https://docs.gitlab.com/user/project/merge_requests/' }
	]
};
