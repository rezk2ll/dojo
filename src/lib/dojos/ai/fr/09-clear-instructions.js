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
		],
		steps: [
			{
				title: 'Nomme l’action',
				questions: [
					{ q: 'Qu’est-ce qui ne va pas dans "tell me what\'s up" ?', options: ['Il ne nomme ni action claire ni unité de travail', 'Il est trop poli pour un bot', 'Il est trop court pour que le modèle le lise', 'Il utilise une contraction'], answer: 0, why: 'Un collègue ne saurait pas quoi produire. Le modèle a le même problème.' },
					{ q: 'Quelle ligne d’instruction marche le mieux ?', options: ['« Regarde bien les tests en échec. »', '« Peux-tu suggérer pourquoi les tests échouent ? »', '« Pour chaque test en échec dans le log ci-dessous, trouve la ligne du diff qui a le plus de chances d’avoir causé l’échec. »', '« Explique tout sur ce run de CI. »'], answer: 2, why: 'Elle a un verbe, « trouve », une unité de travail et un résultat clair : une ligne du diff.' },
					{ q: 'Quelle est l’unité de travail de cette instruction ?', options: ['Un test en échec', 'Le log entier', 'Un commit', 'Un fichier du diff'], answer: 0, why: '« Pour chaque test en échec » fixe la portée. Le modèle n’étend pas de lui-même une consigne d’un élément à un autre.' },
					{ q: 'Le log contient 3 tests en échec. Combien de lignes du diff la réponse doit-elle désigner ?', options: ['Une, pour le premier test seulement', 'Trois, une par test en échec', 'Chaque ligne modifiée du diff', 'Aucune tant que l’auteur ne demande pas'], answer: 1, why: '« Pour chaque test en échec » étend la portée aux 3. Sans ça, le modèle "does not silently generalize an instruction from one item to another" et peut s’arrêter après le premier test.' }
				]
			},
			{
				title: 'Ajoute le contexte',
				questions: [
					{ q: 'Qui lit la sortie du bot ?', options: ['Le bot de CI lui-même', 'Un responsable des releases', 'Quiconque lit le log de CI', 'Le développeur qui a ouvert la pull request'], answer: 3, why: 'La tâche le dit. Le modèle ne peut pas le deviner : ça va dans le prompt.' },
					{ q: 'Quelle ligne de contexte convient ?', options: ['« La réponse est postée en commentaire sur la pull request et lue par son auteur, qui connaît le code mais n’a pas vu le log de CI. »', '« Tu es un expert en CI. »', '« Fais très attention. »', '« C’est très important. »'], answer: 0, why: 'Le contexte, c’est ce que le modèle ne peut pas deviner : qui lit le résultat et où il va.' },
					{ q: 'Pourquoi dire que l’auteur n’a pas vu le log de CI ?', options: ['Pour que le modèle lui cache le log', 'Pour que la réponse apporte les détails du log qui lui manquent', 'Pour que le modèle écrive en majuscules', 'Pour rallonger le prompt'], answer: 1, why: 'L’auteur connaît le code. Ce qui lui manque, c’est le log : la réponse doit l’apporter.' },
					{ q: 'Pourquoi la ligne de contexte dit-elle où la réponse est postée ?', options: ['Pour que le modèle poste lui-même le commentaire', 'Pour que l’API rattache la réponse à la pull request', 'Pour que le modèle sache à quoi sert le résultat et l’écrive pour cet endroit', 'Pour que le collègue puisse sauter la golden rule'], answer: 2, why: 'L’usage du résultat fait partie du contexte que le modèle ne peut pas deviner. Un commentaire lu par l’auteur sur la pull request n’appelle pas la même réponse qu’une note dans un log de CI.' }
				]
			},
			{
				title: 'Fixe le format et la fin',
				questions: [
					{ q: 'Quelle ligne de format ne laisse au modèle aucune forme à deviner ?', options: ['« Pour chaque test, donne le nom du test, le fichier et la ligne du diff, et une phrase d’explication. »', '« Mets bien la réponse en forme. »', '« Prends le format qui convient le mieux. »', '« Sois complet dans ta réponse. »'], answer: 0, why: 'Une forme fixe par test ne laisse au modèle aucun format à deviner.' },
					{ q: 'Pourquoi plafonner la liste, par exemple à « 5 éléments au plus » ?', options: ['L’API refuse les listes plus longues', 'Ça donne au modèle la taille maximale du résultat', 'Ça oblige le modèle à trouver exactement 5 causes', 'Un modèle ne sait pas compter au-delà de 5'], answer: 1, why: 'Une limite, comme « up to 3 » dans `dedupe.md`, donne au modèle la taille maximale du résultat.' },
					{ q: 'L’échec vient d’un timeout réseau, pas du diff. Que doit faire le bot ?', options: ['Trouver quand même la ligne du diff la plus proche', 'Le dire et s’arrêter', 'Relancer les tests jusqu’à ce qu’ils passent', 'Poster le log entier'], answer: 1, why: 'Le prompt doit dire quand la tâche est finie, y compris quand la bonne sortie est de ne rien trouver.' },
					{ q: 'Pourquoi écrire la condition d’arrêt dans le prompt ?', options: ['La réponse arrive plus vite', 'L’API en exige une', 'Elle arrête le travail avant que le bot poste un commentaire faux', 'Elle baisse la température'], answer: 2, why: 'Le modèle "does not infer requests you didn\'t make". `dedupe.md` fait pareil avec « do not proceed ».' }
				]
			},
			{
				title: 'Applique la golden rule',
				questions: [
					{ q: 'Un collègue reçoit l’original "Look at the failing tests and tell me what\'s up." Que demande-t-il d’abord ?', options: ['« Je dois produire quoi, et pour qui ? »', 'Rien : le prompt est clair', '« Quelle police pour la réponse ? »', '« Pourquoi ces tests existent-ils ? »'], answer: 0, why: 'L’original ne nomme ni résultat ni lecteur. Un collègue ne peut pas commencer sans les deux, et le guide dit que s’il est perdu, Claude le sera aussi.' },
					{ q: 'Le collègue demande « quels tests ? ». Qu’est-ce que ça t’apprend ?', options: ['Le collègue manque de compétences', 'Le modèle le saura de toute façon', 'Le prompt est trop long', 'Il manque une ligne au prompt'], answer: 3, why: 'Chaque question du collègue désigne une ligne qui manque au prompt.' },
					{ q: 'Un collègue suit `dedupe.md` étape par étape. Sur quoi bute-t-il à la ligne 12 ?', options: ['Le nom du script de l’étape 5 est faux', '« #1 » désigne l’étape 1, mais le résumé vient de l’étape 2', 'L’étape 1 n’a pas de condition d’arrêt', 'La limite de 3 doublons manque'], answer: 1, why: 'Le résumé est produit à l’étape 2, mais la ligne 12 dit "using the summary from #1". Même un prompt précis peut contenir ce genre d’erreur, et seul un lecteur qui le suit la trouve.' },
					{ q: 'Le nouveau prompt est plus long. Qu’est-ce que ça coûte ?', options: ['Rien du tout', 'Le modèle suit moins bien les longs prompts', 'Des tokens d’entrée à chaque appel', 'Deux fois plus de tokens de sortie'], answer: 2, why: 'Sur une tâche lancée 200 000 fois par mois, 100 tokens de plus font 20 millions de tokens d’entrée en plus. Mets-le en balance avec les commentaires faux.' }
				]
			}
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
