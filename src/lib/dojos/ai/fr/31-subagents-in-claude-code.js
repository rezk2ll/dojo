const CC = 'https://github.com/anthropics/claude-code/blob/c017428c8c27e604840435048d5bce6a9a22c040';
const EXPLORER = `${CC}/plugins/feature-dev/agents/code-explorer.md`;
const COMMAND = `${CC}/plugins/feature-dev/commands/feature-dev.md`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'subagents-in-claude-code',
	part: 'Claude Code',
	title: 'Les subagents dans Claude Code',
	minutes: 10,
	hook: [
		'Tu demandes à Claude Code pourquoi les tests d’auth échouent. Il lance `npm test`, et 2 000 lignes de tests verts et de stack traces arrivent dans ta conversation. Une heure plus tard, tu demandes un correctif d’une ligne : ce log occupe toujours la fenêtre de contexte, à côté de tes consignes (jour 3).',
		'Un subagent lance la même suite dans sa propre fenêtre de contexte. La doc de Claude Code : le subagent « does that work in its own context and returns only the summary » (fait ce travail dans son propre contexte et ne renvoie que le résumé). **Ta conversation reçoit les trois tests en échec, et les 2 000 lignes restent chez le subagent.**'
	],
	terms: [
		{ term: 'Subagent', def: 'Une instance séparée de Claude que Claude Code lance avec l’outil `Agent`. Elle a sa propre fenêtre de contexte, son prompt système et ses outils, et renvoie un seul rapport à la conversation qui l’a lancée.' },
		{ term: 'Fichier d’agent', def: 'Un fichier Markdown avec un frontmatter YAML qui définit un subagent. Le corps après le `---` de fermeture est son prompt système. Seuls `name` et `description` sont obligatoires.' },
		{ term: 'Message de délégation', def: 'Le prompt de tâche que Claude écrit quand il confie un travail à un subagent. Le subagent lit ce message à la place de l’historique de ta conversation (sauf un fork, lancé avec `/subtask`).' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['user["Toi : pourquoi les tests d’auth échouent ?"] --> main["Conversation principale : a la description de chaque subagent"]'],
				highlight: ['user', 'main'],
				note: 'Claude choisit un subagent d’après ta demande, le champ `description` de chaque fichier d’agent et le contexte en cours. Chaque description prend de la place dans le contexte, et la doc demande donc de les garder courtes. Au-delà de 15 000 tokens de descriptions personnalisées cumulées, Claude Code affiche un avertissement au démarrage.'
			},
			{
				add: ['main -->|"outil Agent + message de délégation"| sub["subagent test-runner : une fenêtre de contexte neuve"]'],
				highlight: ['sub'],
				note: 'Le subagent démarre avec son propre prompt système, le message de délégation, tes fichiers CLAUDE.md et un instantané du git status. Il ne voit ni ton historique ni les fichiers que Claude a déjà lus. Une règle que tu as tapée plus tôt dans le chat, comme « ignore `vendor/` », ne lui parvient que si Claude la met dans le message de délégation.'
			},
			{
				add: ['sub --> tools["Seulement son champ tools : Read, Grep, Glob, Bash"]'],
				highlight: ['tools'],
				note: 'Le champ `tools` est une liste d’autorisation, et `disallowedTools` une liste d’interdiction. Certains outils n’arrivent jamais jusqu’à un subagent, comme `AskUserQuestion` et `EnterPlanMode` : il ne peut donc pas s’arrêter pour te poser une question. Un subagent en arrière-plan affiche ses demandes de permission dans ta session principale, avec son nom dessus.'
			},
			{
				add: ['tools -->|"2 000 lignes de sortie de tests"| sub', 'sub -->|"un rapport : 3 tests en échec"| main'],
				highlight: ['sub', 'main'],
				note: 'Le log de tests remplit la fenêtre de contexte du subagent et n’entre jamais dans la tienne. Claude Code analyse le rapport final avant que Claude le lise, et insère une barre oblique inverse dans tout texte qui imite une balise `<system-reminder>`. Ta conversation principale lit ensuite le rapport avec ton CLAUDE.md complet chargé.'
			},
			{
				add: ['main -->|"SendMessage avec l’ID de l’agent"| resume["Le même subagent repris, avec son propre historique"]'],
				highlight: ['resume'],
				note: 'Chaque appel à `Agent` crée une nouvelle instance. Pour poursuivre un travail, Claude reprend le subagent avec `SendMessage` et l’ID d’agent qu’il a reçu. Les agents intégrés Explore et Plan ne renvoient pas d’ID : Claude ne peut pas les reprendre.'
			}
		]
	},
	example: {
		title: 'plugins/feature-dev/agents/code-explorer.md : un explorateur en lecture seule',
		repo: 'anthropics/claude-code',
		url: `${EXPLORER}#L1-L51`,
		lang: 'markdown',
		code: `---
name: code-explorer
description: Deeply analyzes existing codebase features by tracing execution paths, mapping architecture layers, understanding patterns and abstractions, and documenting dependencies to inform new development
tools: Glob, Grep, LS, Read, NotebookRead, WebFetch, TodoWrite, WebSearch, KillShell, BashOutput
model: sonnet
color: yellow
---

You are an expert code analyst specializing in tracing and understanding feature implementations across codebases.

## Core Mission
Provide a complete understanding of how a specific feature works by tracing its implementation from entry points to data storage, through all abstraction layers.
…
## Output Guidance

Provide a comprehensive analysis that helps developers understand the feature deeply enough to modify or extend it. Include:

- Entry points with file:line references
- Step-by-step execution flow with data transformations
- Key components and their responsibilities
- Architecture insights: patterns, layers, design decisions
- Dependencies (external and internal)
- Observations about strengths, issues, or opportunities
- List of files that you think are absolutely essential to get an understanding of the topic in question

Structure your response for maximum clarity and usefulness. Always include specific file paths and line numbers.`,
		notes: [
			'Ligne 3, `description` : c’est ce que Claude compare à une demande pour choisir un subagent. Le plugin ne s’en remet pas au hasard : sa commande `/feature-dev` dit « Launch 2-3 code-explorer agents in parallel » ([feature-dev.md ligne 41](' + COMMAND + '#L41)).',
			'Ligne 4, `tools` : ni `Edit`, ni `Write`, ni `Bash`. L’agent peut chercher et lire des fichiers, mais aucun outil de la liste ne les modifie. La référence des outils lue le 2026-10-17 ne contient aucun outil nommé `LS`, `NotebookRead`, `KillShell` ou `BashOutput`. Un subagent refuse de démarrer seulement quand aucune entrée ne correspond à un outil, et `Glob`, `Grep` et `Read` correspondent ici.',
			'Ligne 5, `model: sonnet`, est un alias. Claude Code prend d’abord le paramètre `model` de l’appel `Agent`, puis ce champ, puis `CLAUDE_CODE_SUBAGENT_MODEL`, puis le modèle de la conversation principale.',
			'Les lignes 9 à 51 forment le prompt système. Le subagent reçoit ce texte et des détails d’environnement comme le répertoire de travail, mais pas le prompt système de Claude Code. La partie sortie demande des références fichier:ligne et une courte liste de fichiers, que la commande dit ensuite à la conversation principale de lire.',
			'Le fichier est dans le dossier `agents/` d’un plugin, il s’enregistre donc sous `feature-dev:code-explorer`. Les subagents de plugin ignorent `hooks`, `mcpServers` et `permissionMode`. Pour utiliser ces champs, copie le fichier dans `.claude/agents/` (ce projet) ou `~/.claude/agents/` (tous tes projets).'
		]
	},
	tradeoff: {
		gain: [
			'Le log de tests, les résultats de recherche et les fichiers lus par le subagent restent dans sa fenêtre de contexte, et ta conversation ne reçoit que le rapport.',
			'Une ligne `tools` comme `Read, Grep, Glob` donne un relecteur incapable de modifier un fichier, quoi que demande le message de délégation.',
			'Un subagent avec `model: haiku` fait une recherche ou un tri de logs sur un modèle moins cher, pendant que la conversation principale garde son modèle.'
		],
		cost: [
			'Un subagent part d’un contexte neuf et peut mettre du temps à retrouver ce que la conversation principale savait déjà. La doc conseille la conversation principale quand « Latency matters » (la latence compte).',
			'Chaque subagent envoie ses propres requêtes, et elles comptent dans les mêmes limites d’usage que ta conversation principale.',
			'Cinq subagents en parallèle qui renvoient chacun un long rapport mettent cinq longs rapports dans ton contexte. La doc prévient que cela « can consume significant context » (peut consommer beaucoup de contexte).',
			'Un subagent n’a pas l’outil `AskUserQuestion` : il ne peut pas s’arrêter au milieu d’une tâche pour te demander ce que tu voulais dire.'
		]
	},
	task: {
		prompt: 'Écris `.claude/agents/test-runner.md` pour ton projet. Claude doit lui déléguer le travail après des changements de code. Il lance la suite de tests et ne renvoie que les tests en échec avec leurs messages d’erreur. Il ne doit pas modifier de fichiers, et ne doit jamais lancer `git push`. Écris le frontmatter, un prompt système de deux lignes, et dis où va la règle sur `git push`.',
		hint: 'Une entrée `disallowedTools` comme `Bash(git push *)` retire plus que tu ne crois. Quel fichier porte les règles qui bloquent une commande, y compris pour les subagents ?',
		answer: [
			'Frontmatter : `name: test-runner`, `description: Runs the test suite and reports only failing tests with their error messages. Use proactively after code changes.`, `tools: Read, Grep, Glob, Bash`. La doc conseille « use proactively » dans la description pour encourager la délégation.',
			'Corps : « Lance la commande de tests du projet. Réponds avec le nom de chaque test en échec, son fichier et la première ligne d’erreur, rien sur les tests qui passent. » Le subagent reçoit ce corps comme prompt système, avec des détails d’environnement comme le répertoire de travail.',
			'Sans `Edit` ni `Write` dans `tools`, l’agent ne peut pas modifier de fichier avec ces outils. `Bash` reste, parce que l’agent doit lancer les tests. Une commande shell peut encore écrire un fichier, alors le corps dit quoi faire et rien de plus.',
			'La règle sur `git push` va dans `permissions.deny` de `.claude/settings.json`, sous la forme `Bash(git push *)`. La même entrée dans `disallowedTools` retirerait tout l’outil `Bash`, alors qu’une règle deny des réglages s’applique à la conversation principale et aux subagents.'
		]
	},
	quiz: [
		{
			q: 'Tu ajoutes `.claude/agents/db-reader.md` avec `name: db-reader` et `tools: Read, Grep`, mais sans `description`. Que fait Claude Code ?',
			options: [
				'Il charge l’agent et prend la première ligne du corps comme description',
				'Il ignore le fichier et écrit la raison dans le log de debug',
				'Il charge l’agent, que Claude ne peut lancer que par une @-mention',
				'Il s’arrête au démarrage avec une erreur qui nomme le champ manquant'
			],
			answer: 1,
			why: 'Seuls `name` et `description` sont obligatoires, et un fichier qui a un `name` sans `description` est ignoré sans message dans la session. La raison apparaît dans le log de debug quand tu lances Claude Code avec `--debug`.'
		},
		{
			q: 'Un subagent doit garder `Bash` mais ne jamais lancer `git push`. Tu ajoutes `disallowedTools: Bash(git push *)` à son fichier. Que se passe-t-il ?',
			options: [
				'Seules les commandes qui correspondent à `git push *` sont bloquées',
				'L’entrée est ignorée, car `disallowedTools` n’accepte pas de précision',
				'`git push` te demande désormais la permission avant de partir',
				'Tout l’outil `Bash` est retiré à ce subagent'
			],
			answer: 3,
			why: 'Dans `disallowedTools`, une entrée avec une précision entre parenthèses retire quand même tout l’outil. Pour garder `Bash` et bloquer une commande, la doc dit d’ajouter `Bash(git push *)` à `permissions.deny` dans tes réglages.'
		},
		{
			q: 'Claude lance ton subagent personnalisé `test-runner`. Qu’y a-t-il dans sa fenêtre de contexte au départ ?',
			options: [
				'Son prompt système, le message de délégation, tes CLAUDE.md et un instantané git status',
				'Toute la conversation jusqu’ici, pour qu’il sache ce que tu as demandé il y a une heure',
				'Le prompt système de Claude Code et chaque fichier lu par la conversation principale',
				'Le message de délégation seul, sans prompt système ni fichier CLAUDE.md'
			],
			answer: 0,
			why: 'Un subagent qui n’est pas un fork part d’un contexte neuf. Il reçoit son prompt avec des détails d’environnement, le message de tâche écrit par Claude, la hiérarchie des CLAUDE.md et le git status. Ton historique et les fichiers déjà lus restent dans la conversation principale.'
		}
	],
	recall: {
		q: 'Où enregistres-tu un subagent pour un seul projet, et quel champ du frontmatter Claude lit-il pour décider quand l’utiliser ?',
		a: 'Dans le dossier `.claude/agents/` du projet, par exemple `.claude/agents/test-runner.md`. Claude lit son champ `description`.'
	},
	sources: [
		{ title: 'Doc Claude Code, Create custom subagents, lue le 2026-10-17', url: 'https://code.claude.com/docs/en/sub-agents' },
		{ title: 'Doc Claude Code, Tools reference, lue le 2026-10-17', url: 'https://code.claude.com/docs/en/tools-reference' },
		{ title: 'anthropics/claude-code, plugins/feature-dev/agents/code-explorer.md', url: EXPLORER },
		{ title: 'anthropics/claude-code, plugins/feature-dev/commands/feature-dev.md', url: COMMAND }
	]
};
