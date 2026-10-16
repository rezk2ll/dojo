const CC = 'https://github.com/anthropics/claude-code/blob/c017428c8c27e604840435048d5bce6a9a22c040';
const SKILLS = 'https://code.claude.com/docs/en/skills';
const PLUGINS = 'https://code.claude.com/docs/en/plugins/overview';
const COMPONENTS = 'https://code.claude.com/docs/en/plugins/components';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'commands-and-plugins',
	part: 'Claude Code',
	title: 'Commandes slash et plugins',
	minutes: 10,
	hook: [
		'Trois fois par semaine, tu tapes le même paragraphe : regarde `git status` et le diff, crée une branche si tu es sur `main`, commite, pousse, ouvre une pull request avec `gh pr create`.',
		'Le dépôt de Claude Code range ce paragraphe dans un fichier de 19 lignes, `.claude/commands/commit-push-pr.md`. **Quiconque clone le dépôt tape `/commit-push-pr`, et Claude reçoit les mêmes instructions avec le `git status` du moment déjà collé dedans.**'
	],
	terms: [
		{ term: 'Commande perso', def: 'Un fichier Markdown dans `.claude/commands/` que tu lances par son nom de fichier : `deploy.md` se lance avec `/deploy`. La doc a fusionné les commandes avec les skills, et les deux formats marchent toujours.' },
		{ term: 'Injection de contexte', def: 'Une ligne comme `` !`git status` `` dans une commande ou un skill. Claude Code lance la commande avant que Claude lise le fichier, et met sa sortie à la place de la ligne.' },
		{ term: 'Plugin', def: 'Un dossier avec un manifeste dans `.claude-plugin/plugin.json`, qui contient des skills, des commandes, des agents, des hooks ou des serveurs MCP. Claude Code l’installe et le charge d’un bloc.' },
		{ term: 'Marketplace', def: 'Un dépôt ou un dossier avec un fichier `.claude-plugin/marketplace.json` qui liste des plugins et l’endroit où récupérer chacun. Tu installes depuis lui avec `/plugin install nom@marketplace`.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['you["Tu tapes /commit-push-pr"] --> file[".claude/commands/commit-push-pr.md"]'],
				highlight: ['you', 'file'],
				note: 'Le nom de la commande vient du nom du fichier. Un sous-dossier ajoute un segment avec deux-points : `.claude/commands/frontend/component.md` se lance avec `/frontend:component`. Un skill dans `.claude/skills/commit-push-pr/SKILL.md` donnerait le même `/commit-push-pr`.'
			},
			{
				add: ['file --> inject["Claude Code lance git status, git diff HEAD, git branch --show-current"]', 'inject --> prompt["Prompt avec la vraie sortie à la place de chaque ligne !"]'],
				highlight: ['inject', 'prompt'],
				note: 'Avant que Claude voie le fichier, Claude Code lance chaque `` !`commande` `` avec l’outil Bash et remplace la ligne par la sortie, avec le délai de 2 minutes de l’outil Bash pour chaque commande. Claude part du vrai diff, sans dépenser d’appel d’outil pour le chercher.'
			},
			{
				add: ['prompt --> claude["Claude : branche, commit, push, gh pr create"]'],
				highlight: ['claude'],
				note: 'La ligne `allowed-tools` de l’en-tête laisse les commandes listées tourner sans demande, pendant ce tour seulement. Claude crée alors la branche, commite, pousse et ouvre la pull request. Une commande que la liste ne couvre pas passe toujours par les règles de permission.'
			},
			{
				add: ['plugin["Plugin commit-commands : .claude-plugin/plugin.json"] --> pcmd["commands/commit-push-pr.md se lance avec /commit-commands:commit-push-pr"]', 'plugin --> parts["skills/, agents/, hooks/hooks.json, .mcp.json"]'],
				highlight: ['plugin', 'pcmd', 'parts'],
				note: 'Le même fichier existe aussi dans un plugin du dépôt, `plugins/commit-commands`. Dans un plugin, `commands/<fichier>.md` se lance avec `/<plugin>:<fichier>`. Le plugin peut aussi porter des skills, des sous-agents dans `agents/`, des hooks dans `hooks/hooks.json` et des serveurs MCP dans `.mcp.json`.'
			},
			{
				add: ['market[".claude-plugin/marketplace.json"] -->|"/plugin install commit-commands@claude-plugins-official"| plugin'],
				highlight: ['market'],
				note: 'Une marketplace liste des plugins et leurs dossiers sources. `/plugin install commit-commands@claude-plugins-official` ouvre la fiche du plugin pour que tu choisisses une portée : utilisateur (tous tes projets), projet (toute l’équipe, via le `.claude/settings.json` commité) ou local (toi, dans ce dépôt).'
			}
		]
	},
	example: {
		title: '.claude/commands/commit-push-pr.md dans anthropics/claude-code',
		repo: 'anthropics/claude-code',
		url: `${CC}/.claude/commands/commit-push-pr.md#L1-L19`,
		lang: 'markdown',
		code: `---
allowed-tools: Bash(git checkout --branch:*), Bash(git add:*), Bash(git status:*), Bash(git push:*), Bash(git commit:*), Bash(gh pr create:*)
description: Commit, push, and open a PR
---

## Context

- Current git status: !\`git status\`
- Current git diff (staged and unstaged changes): !\`git diff HEAD\`
- Current branch: !\`git branch --show-current\`

## Your task

Based on the above changes:
1. Create a new branch if on main
2. Create a single commit with an appropriate message
3. Push the branch to origin
4. Create a pull request using \`gh pr create\`
5. You have the capability to call multiple tools in a single response. You MUST do all of the above in a single message. Do not use any other tools or do anything else. Do not send any other text or messages besides these tool calls.`,
		notes: [
			'La ligne 2 utilise l’ancien suffixe `:*`. D’après la doc des permissions, `Bash(ls:*)` "matches the same commands as `Bash(ls *)`" : `Bash(git push:*)` couvre donc `git push -u origin fix-cart`.',
			'La ligne 2 autorise aussi `git checkout --branch`, mais git 2.43 répond "unknown option `branch\'". La vraie option est `-b`, donc `git checkout -b fix-cart` ne correspond à aucune entrée et passe par le circuit de permission normal.',
			'Les lignes 8 à 10 sont de l’injection de contexte. Leur sortie remplace chaque ligne avant que Claude lise le fichier : l’étape 1, ligne 15, peut vérifier le nom de la branche sans appel d’outil.',
			'Le même texte, avec une ligne vide de plus après la ligne 14, se trouve dans [`plugins/commit-commands/commands/commit-push-pr.md`](' + CC + '/plugins/commit-commands/commands/commit-push-pr.md). À côté, `.claude-plugin/plugin.json` fixe `"name": "commit-commands"` et `"version": "1.0.0"`.'
		]
	},
	tradeoff: {
		gain: [
			'Un paragraphe tapé trois fois par semaine tient dans un fichier de 19 lignes dans git, et toute l’équipe lance le même `/commit-push-pr`.',
			'Les lignes `!` donnent à Claude le vrai `git status` et le vrai diff : il n’a pas à deviner l’état de l’arbre de travail ni à dépenser des appels d’outils pour le lire.',
			'Un plugin installe commandes, skills, agents, hooks et serveurs MCP en une fois, et sa marketplace livre les mises à jour.'
		],
		cost: [
			'Pour un plugin activé, le nom et la description de chaque skill, agent et commande que Claude peut lancer restent dans le contexte à chaque tour, même quand rien du plugin ne tourne.',
			'La doc : "a plugin you install can run code with your user privileges", quelle que soit sa marketplace.',
			'Une entrée `allowed-tools` fausse échoue sans erreur, comme le montre `git checkout --branch:*` : la commande demande simplement ton accord.'
		]
	},
	task: {
		prompt: 'Chaque matin, tu colles « Lis l’issue GitHub N avec gh, ajoute le label bug ou feature, et poste un résumé d’une ligne. » Transforme ça en `/triage 1234`. Ensuite, range-la avec une deuxième commande, `/triage-week`, dans un plugin nommé `triage-tools` que ton équipe peut installer. Note le chemin de chaque fichier et le nom que tu tapes pour chaque commande.',
		hint: 'Les arguments arrivent dans le fichier par `$ARGUMENTS` ou `$0`. Un plugin a besoin d’un manifeste, et ses commandes prennent un préfixe.',
		answer: [
			'`.claude/commands/triage.md` avec l’en-tête `description: Label and summarize one GitHub issue` et `allowed-tools: Bash(gh issue view *) Bash(gh issue edit *)`. Corps : « Lance `gh issue view $0`, ajoute le label `bug` ou `feature` avec `gh issue edit $0 --add-label`, puis réponds par un résumé d’une ligne. »',
			'`/triage 1234` met `1234` à la place de `$0`. Les deux commandes `gh` tournent sans demande, pendant ce tour seulement.',
			'Arborescence du plugin : `triage-tools/.claude-plugin/plugin.json` avec `{ "name": "triage-tools", "version": "1.0.0" }`, `triage-tools/commands/triage.md` et `triage-tools/commands/triage-week.md`.',
			'Une fois installé, les commandes se lancent avec `/triage-tools:triage 1234` et `/triage-tools:triage-week`. Ajoute le plugin à un `.claude-plugin/marketplace.json` avec `"source": "./triage-tools"`, et l’équipe l’installe avec `/plugin install triage-tools@<marketplace>`.'
		]
	},
	quiz: [
		{
			q: 'Tu enregistres un fichier dans `.claude/commands/db/migrate.md`. Que tapes-tu pour le lancer ?',
			options: [
				'`/migrate`',
				'`/db/migrate`',
				'`/db:migrate`',
				'`/db-migrate`'
			],
			answer: 2,
			why: 'Pour un fichier dans un sous-dossier de `.claude/commands/`, Claude Code prend le chemin relatif à `commands/`, remplace chaque `/` par `:` et retire l’extension.'
		},
		{
			q: 'Un fichier de commande contient la ligne `` - Current branch: !`git branch --show-current` ``. Quand `git` tourne-t-il ?',
			options: [
				'Quand Claude juge qu’il a besoin du nom de branche et appelle l’outil Bash',
				'Avant que Claude lise la commande, et la sortie remplace la ligne',
				'Une fois, au démarrage de Claude Code, avec le résultat gardé pour la session',
				'Jamais : Claude lit la ligne comme du texte et devine la branche'
			],
			answer: 1,
			why: 'L’injection de contexte lance chaque `` !`commande` `` avant d’envoyer le contenu à Claude. La sortie est insérée en texte brut, donc Claude reçoit directement le nom de la branche, par exemple `fix-cart`.'
		},
		{
			q: 'Tu actives un plugin avec 12 skills que Claude peut lancer. Pendant une session, tu n’utilises aucun de ces 12 skills. Que te coûte le plugin dans cette session ?',
			options: [
				'Rien, car les fichiers d’un plugin ne se chargent que quand tu lances une commande',
				'Le texte complet des 12 skills à chaque tour',
				'Les 12 noms et descriptions dans le contexte à chaque tour',
				'Une ligne avec le nom du plugin, et rien d’autre'
			],
			answer: 2,
			why: 'Claude Code charge un plugin activé dans chaque session. Le nom et la description de chaque skill, agent et commande que Claude peut lancer restent dans le contexte pour que Claude sache qu’ils existent, et le texte complet ne se charge qu’à l’usage.'
		}
	],
	recall: {
		q: 'Que contient un plugin, et quelle commande te donne `commands/about.md` dans un plugin nommé `my-plugin` ?',
		a: 'Un manifeste dans `.claude-plugin/plugin.json` plus des skills, commandes, agents, hooks et serveurs MCP, installés d’un bloc. Le fichier se lance avec `/my-plugin:about`.'
	},
	sources: [
		{ title: 'Doc Claude Code, Extend Claude with skills (commandes perso), lue le 2026-10-17', url: SKILLS },
		{ title: 'Doc Claude Code, Plugins overview, lue le 2026-10-17', url: PLUGINS },
		{ title: 'Doc Claude Code, Plugin components, lue le 2026-10-17', url: COMPONENTS },
		{ title: 'Doc Claude Code, Install and manage plugins, lue le 2026-10-17', url: 'https://code.claude.com/docs/en/plugins/install' },
		{ title: 'anthropics/claude-code, .claude/commands/commit-push-pr.md', url: `${CC}/.claude/commands/commit-push-pr.md` },
		{ title: 'anthropics/claude-code, plugins/commit-commands/.claude-plugin/plugin.json', url: `${CC}/plugins/commit-commands/.claude-plugin/plugin.json` }
	]
};
