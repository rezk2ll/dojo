const NODE = 'https://github.com/nodejs/node/blob/f59539b514344ed0a0945f8790d61121df88a5d4';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'pull-requests',
	part: 'Git',
	title: 'Pull requests, branches protégées et CODEOWNERS',
	minutes: 10,
	hook: [
		'Sur les anciens serveurs, la revue d’un changement, c’était un message sur le chat : « je redémarre nginx avec la nouvelle config, ok ? » Quelqu’un répondait « ok ». Personne n’avait vu le diff.',
		'Une **pull request** (PR) est une proposition : « merge ma branche dans `main` ». Elle montre le diff, lance la CI et rassemble les revues, tout ça **avant** que quoi que ce soit n’arrive sur `main`. GitLab appelle la même chose une merge request.',
		'Les bonnes habitudes sautent un jour de rush, alors tu en fais des règles. Sur GitHub, une **branche protégée** peut exiger une PR, une approbation et des **checks obligatoires** au vert avant que `main` bouge. Un fichier **CODEOWNERS** décide à qui on demande la revue.'
	],
	terms: [
		{ term: 'Pull request', def: 'Une demande de merge d’une branche dans une autre, avec le diff, la discussion, les revues et les résultats de CI au même endroit.' },
		{ term: 'Revue', def: 'Un relecteur commente, approuve ou demande des changements. Quand les revues sont obligatoires, la PR a besoin d’assez d’approbations pour être mergée.' },
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
				note: 'Tu pousses ta branche et tu ouvres une PR vers `main`. Rien n’a encore changé sur `main`. La PR est l’endroit où le changement est **regardé**.'
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
				note: 'La règle de protection est la **barrière**. Sans les approbations et les checks obligatoires au vert, le merge reste bloqué. Avec les revues obligatoires, les collaborateurs ne peuvent changer `main` **que par une PR approuvée**.'
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
			'L’en-tête le dit clairement : ce fichier envoie des **pings de courtoisie**, il ne décide pas de ce qui peut être mergé. C’est CODEOWNERS tout seul. Il ne devient une barrière que quand une règle de protection de branche (ou un ruleset, la forme plus récente des mêmes règles sur GitHub) active « Require review from Code Owners ».',
			'Les owners sont **des équipes, jamais des personnes**. Les gens changent de poste, les équipes restent. GitHub exige aussi que chaque owner, équipe ou personne, ait l’accès en écriture au dépôt.',
			'La ligne 13 rend le fichier propriétaire de lui-même : changer qui possède quoi demande l’équipe `@nodejs/tsc`. La doc GitHub présente un CODEOWNERS dans `.github/` qui se possède lui-même comme la méthode la plus sûre.',
			'`/BUILDING.md` liste deux équipes. Quand la revue des code owners est obligatoire, **l’approbation d’un seul owner** suffit.',
			'L’ordre compte : **le dernier motif qui correspond gagne**. Mets la ligne fourre-tout `*` en premier et les chemins précis après. Une ligne à la syntaxe invalide est ignorée, et GitHub affiche l’erreur quand tu ouvres le fichier.'
		]
	},
	tradeoff: {
		gain: [
			'Chaque changement sur `main` est relu et testé avant d’arriver, pas après avoir cassé quelque chose.',
			'La discussion reste à côté du diff : six mois plus tard, tu peux relire pourquoi un changement a été fait.',
			'CODEOWNERS envoie chaque changement aux gens qui connaissent la zone, sans que personne ait à faire le tri à la main.'
		],
		cost: [
			'Attendre une revue ralentit le flux. Garde des PR petites : le [guide Kubernetes](https://github.com/kubernetes/community/blob/440e496d3a172234d81728df1bfe43849b589adf/contributors/guide/github-workflow.md#L141) dit que les très grosses PR sont très difficiles à relire.',
			'Les règles ne sont strictes que si les réglages le sont. Par défaut, la protection de branche ne s’applique pas aux admins, sauf si tu le demandes.',
			'La protection de branche vit dans les réglages du dépôt, pas dans un fichier dans Git, donc on l’oublie facilement en créant le dépôt suivant.'
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
	takeaway: 'Une PR place le diff, la CI et la revue devant `main`. La protection de branche la rend obligatoire, et CODEOWNERS envoie chaque changement aux gens qui possèdent ce code.',
	sources: [
		{ title: 'GitHub Docs, About pull requests', url: 'https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/about-pull-requests' },
		{ title: 'GitHub Docs, About pull request reviews', url: 'https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/about-pull-request-reviews' },
		{ title: 'GitHub Docs, About protected branches', url: 'https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches' },
		{ title: 'GitHub Docs, About code owners', url: 'https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners' },
		{ title: 'GitLab Docs, Merge requests', url: 'https://docs.gitlab.com/user/project/merge_requests/' }
	]
};
