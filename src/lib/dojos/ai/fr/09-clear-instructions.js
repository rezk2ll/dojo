const CC = 'https://github.com/anthropics/claude-code/blob/c017428c8c27e604840435048d5bce6a9a22c040';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'clear-instructions',
	part: 'Écrire un prompt',
	title: 'Des instructions claires',
	minutes: 10,
	hook: [
		'Tu colles une fonction lente dans une conversation avec Claude et tu tapes : "Can you suggest some changes to improve this function?" Tu reçois une liste d’idées. Le fichier sur le disque n’a pas bougé, alors que tu voulais les modifications.',
		'Le guide de prompting d’Anthropic décrit ce cas précis : "Claude will sometimes provide suggestions rather than implementing them, even if making changes might be what you intended." **Le modèle a fait ce que la phrase demandait : il a suggéré.**'
	],
	terms: [
		{ term: 'Instruction', def: 'La phrase du prompt qui nomme l’action voulue, avec un verbe : modifier, lister, résumer, étiqueter.' },
		{ term: 'Contexte', def: 'Ce que le modèle ne peut pas deviner : qui lit le résultat, pourquoi une règle existe, à quoi sert le résultat.' },
		{ term: 'Golden rule', def: 'Le test d’Anthropic pour un prompt : le donner à un collègue qui connaît peu la tâche et lui demander de le suivre. Si ce collègue est perdu, le guide dit que Claude le sera aussi.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['v["Can you suggest some changes to improve this function?"] --> s["Une liste de suggestions, aucune modification"]'],
				highlight: ['v', 's'],
				note: 'La demande dit à Claude de "suggest" des changements, jamais de les faire. Le guide dit que les modèles Claude actuels "are trained for precise instruction following". Une liste de suggestions répond correctement à cette phrase.'
			},
			{
				add: ['a["Instruction : Change this function to improve its performance."] --> e["La fonction est modifiée"]'],
				highlight: ['a'],
				note: 'La correction du guide : nommer l’action, "Change this function to improve its performance." Pareil pour l’ampleur : le guide juge "Create an analytics dashboard" moins efficace qu’une version qui ajoute "Include as many relevant features and interactions as possible".'
			},
			{
				add: ['c["Contexte : la réponse est lue à voix haute par un moteur de synthèse vocale"] --> a'],
				highlight: ['c'],
				note: 'Une règle avec sa raison marche mieux que la règle seule. Le guide compare "NEVER use ellipses" à une version qui explique que le moteur de synthèse vocale "will not know how to pronounce them". Il ajoute : "Claude is smart enough to generalize from the explanation."'
			},
			{
				add: ['f["Format : 3 étapes numérotées, moins de 200 mots"] --> a', 'd["Fini quand : appliqué à toutes les fonctions du fichier, pas seulement la première"] --> a'],
				highlight: ['f', 'd'],
				note: 'Donne le format de sortie et l’endroit où la tâche s’arrête. Le guide demande des étapes numérotées "when the order or completeness of steps matters". Le guide d’Opus 4.8 prévient que le modèle "does not silently generalize an instruction from one item to another" : écris toi-même la portée.'
			},
			{
				add: ['g["Golden rule : un collègue sans contexte suit le prompt"] -->|"perdu ?"| c'],
				highlight: ['g'],
				note: 'Avant d’envoyer le prompt, applique la golden rule : "Show your prompt to a colleague with minimal context on the task and ask them to follow it. If they\'d be confused, Claude will be too." Chaque question du collègue désigne une ligne qui manque au prompt.'
			}
		]
	},
	example: {
		title: '.claude/commands/dedupe.md : le prompt du dépôt Claude Code pour trouver les issues en double',
		repo: 'anthropics/claude-code',
		url: `${CC}/.claude/commands/dedupe.md#L1-L18`,
		lang: 'markdown',
		code: `---
allowed-tools: Bash(./scripts/gh.sh:*), Bash(./scripts/comment-on-duplicates.sh:*)
description: Find duplicate GitHub issues
---

Find up to 3 likely duplicate issues for a given GitHub issue.

To do this, follow these steps precisely:

1. Use an agent to check if the Github issue (a) is closed, (b) does not need to be deduped (eg. because it is broad product feedback without a specific solution, or positive feedback), or (c) already has a duplicates comment that you made earlier. If so, do not proceed.
2. Use an agent to view a Github issue, and ask the agent to return a summary of the issue
3. Then, launch 5 parallel agents to search Github for duplicates of this issue, using diverse keywords and search approaches, using the summary from #1
4. Next, feed the results from #1 and #2 into another agent, so that it can filter out false positives, that are likely not actually duplicates of the original issue. If there are no duplicates remaining, do not proceed.
5. Finally, use the comment script to post duplicates:
   \`\`\`
   ./scripts/comment-on-duplicates.sh --potential-duplicates <dup1> <dup2> <dup3>
   \`\`\`
`,
		notes: [
			'La ligne 6 est l’instruction, avec un verbe et une limite : "Find up to 3 likely duplicate issues". Un collègue connaît le but et la taille maximale du résultat avant de lire la moindre étape.',
			'Les lignes 10 et 13 disent quand s’arrêter : une issue fermée, un retour trop général, un commentaire déjà posté ou plus aucun doublon mènent tous à "do not proceed". Ces lignes disent au modèle quand la bonne sortie est de ne rien poster.',
			'Les lignes 14 à 17 fixent la sortie : un script, une option, au plus trois numéros d’issue. Le modèle n’a plus de format à deviner.',
			'Applique la golden rule à la ligne 12. Le résumé vient de l’étape 2, mais la ligne dit "using the summary from #1", et la ligne 13 parle des "results from #1 and #2" pour les sorties des étapes 2 et 3. Un collègue demanderait de quelles étapes il s’agit.'
		]
	},
	tradeoff: {
		gain: [
			'Nommer l’action obtient l’action : "Change this function" modifie le code, là où "Can you suggest" renvoie une liste.',
			'Le guide d’Opus 4.8 dit que suivre les instructions à la lettre "generally performs better for API use cases with carefully tuned prompts, structured extraction, and pipelines".',
			'Une condition d’arrêt écrite, comme "If so, do not proceed" dans `dedupe.md`, arrête le travail avant que le modèle poste un mauvais commentaire.'
		],
		cost: [
			'Chaque ligne de contexte coûte des tokens d’entrée à chaque appel. Sur une tâche lancée 200 000 fois par mois (jour 7), 100 tokens de plus font 20 millions de tokens d’entrée en plus.',
			'Le guide d’Opus 4.8 dit que le modèle "does not infer requests you didn\'t make". Si tu veux une règle appliquée à chaque section, écris « chaque section ».',
			'Un prompt précis peut quand même contenir des erreurs, comme les numéros d’étape de `dedupe.md`. Seul un lecteur qui le suit pas à pas les trouve.'
		]
	},
	task: {
		prompt: 'Un bot de CI reçoit ce prompt avec un log de tests en échec : "Look at the failing tests and tell me what\'s up." Réécris-le pour qu’un collègue sans contexte puisse le suivre. Le lecteur de la sortie est le développeur qui a ouvert la pull request, et la réponse est postée en commentaire sur la pull request.',
		hint: 'Écris une ligne pour l’action, une pour le contexte, une pour le format et une pour dire quand c’est fini.',
		answer: [
			'Instruction : « Pour chaque test en échec dans le log ci-dessous, trouve la ligne du diff qui a le plus de chances d’avoir causé l’échec. » Le verbe est « trouve », et l’unité de travail est un test en échec.',
			'Contexte : « La réponse est postée en commentaire sur la pull request et lue par son auteur, qui connaît le code mais n’a pas vu le log de CI. »',
			'Format : « Pour chaque test, donne le nom du test, le fichier et la ligne du diff, et une phrase d’explication. Liste numérotée, 5 éléments au plus. » Fini quand : « Si l’échec ne vient pas du diff, par exemple un timeout réseau, dis-le et arrête-toi. »',
			'Vérification avec la golden rule : un collègue peut maintenant répondre à « je produis quoi, pour qui, sous quelle forme, et quand je m’arrête » avec le seul prompt.'
		]
	},
	quiz: [
		{
			q: 'Tu tapes "Can you suggest some changes to improve this function?" et Claude liste des idées sans toucher au fichier. Que s’est-il passé ?',
			options: [
				'Le modèle a suivi le verbe de la demande et a suggéré',
				'Le modèle a manqué de tokens de sortie avant de modifier',
				'Le modèle a besoin d’un outil pour changer le moindre texte',
				'Le modèle refuse de modifier du code qu’il n’a pas écrit'
			],
			answer: 0,
			why: 'Les modèles Claude actuels sont entraînés à suivre les instructions avec précision : "suggest" donne des suggestions. La correction du guide est de nommer l’action : "Change this function to improve its performance."'
		},
		{
			q: 'Quelle est la golden rule du guide de prompting d’Anthropic ?',
			options: [
				'Mettre l’instruction la plus importante dans la dernière phrase',
				'Écrire chaque règle en majuscules pour que le modèle la voie',
				'Faire suivre le prompt par un collègue qui connaît peu la tâche',
				'Garder chaque prompt sous 100 tokens pour éviter la confusion'
			],
			answer: 2,
			why: 'Le guide : "Show your prompt to a colleague with minimal context on the task and ask them to follow it. If they\'d be confused, Claude will be too." Comme ce collègue, le modèle ne voit que ce que dit le prompt.'
		},
		{
			q: 'Pourquoi le guide préfère-t-il "never use ellipses since the text-to-speech engine will not know how to pronounce them" à "NEVER use ellipses" ?',
			options: [
				'Les majuscules font ignorer une instruction au modèle',
				'Avec la raison, le modèle peut l’appliquer à des cas non écrits',
				'Les prompts plus longs ont toujours de meilleurs scores',
				'Le modèle ne suit que les règles qui contiennent "since"'
			],
			answer: 1,
			why: 'Le guide dit "Claude is smart enough to generalize from the explanation". En sachant que le texte est lu à voix haute, le modèle peut aussi éviter d’autres choses qu’un moteur vocal ne sait pas dire, ce que la règle seule ne couvre pas.'
		}
	],
	recall: {
		q: 'Quelles quatre choses un prompt doit-il dire, et quelle golden rule du guide permet de le vérifier ?',
		a: 'L’action (avec un verbe), le contexte, le format, et quand c’est fini. Golden rule : un collègue qui connaît peu la tâche suit le prompt ; s’il est perdu, Claude le sera aussi.'
	},
	sources: [
		{ title: 'Doc Claude, Prompting best practices (Be clear and direct, Add context, Tool usage), lu le 2026-10-17', url: 'https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices' },
		{ title: 'Doc Claude, Prompting Claude Opus 4.8 (More literal instruction following), lu le 2026-10-17', url: 'https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-4-8' },
		{ title: 'anthropics/claude-code, .claude/commands/dedupe.md', url: `${CC}/.claude/commands/dedupe.md` }
	]
};
