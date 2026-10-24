const CC = 'https://github.com/anthropics/claude-code/blob/c017428c8c27e604840435048d5bce6a9a22c040';
const REVIEW = 'https://github.com/anthropics/claude-cookbooks/blob/b2b0aa1ff7d8980b005b225d3802969c87bedad5/claude_agent_sdk/scheduled_repository_reviewer/scheduled_review.py';
const WORKS = 'https://code.claude.com/docs/en/how-claude-code-works';
const TOOLS = 'https://code.claude.com/docs/en/tools-reference';
const LOOP = 'https://code.claude.com/docs/en/agent-sdk/agent-loop';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'claude-code',
	part: 'Claude Code',
	title: 'Une session de Claude Code',
	minutes: 10,
	hook: [
		'Tu ouvres un terminal dans ton dépôt, tu lances `claude` et tu tapes « Fix the failing tests in auth.ts ». Le README de claude-code résume le démarrage ainsi : "Navigate to your project directory and run `claude`." Tu ne dis ni quel fichier ouvrir ni quelle commande lancer, et à la fin les tests passent.',
		'Entre les deux, Claude a lancé `npm test`, lu `auth.ts` et `auth.test.ts`, modifié `auth.ts` puis relancé `npm test`. Chacune de ces étapes était un appel d’outil de la boucle du jour 18, et Claude Code a écrit chaque message, appel d’outil et résultat dans un fichier JSONL sous `~/.claude/projects/`.',
		'En mode Manual, les deux `npm test` et la modification t’ont chacun demandé ton accord, et les deux lectures non. Ce fichier JSONL, c’est la **session** : `Esc` deux fois annule ses modifications, et `claude --resume` la rouvre après que tu as fermé le terminal.'
	],
	terms: [
		{ term: 'Session', def: 'Une conversation Claude Code, liée au répertoire où tu l’as lancée. Claude Code l’enregistre en local en JSONL, donc `claude --continue` ou `claude --resume` la rouvre sous le même identifiant de session.' },
		{ term: 'Appel d’outil', def: 'Une demande du modèle pour lancer un outil intégré, comme `Read`, `Edit` ou `Bash`, avec ses paramètres. Claude Code l’exécute et renvoie le résultat au modèle.' },
		{ term: 'Tour', def: 'Un aller-retour : le modèle demande des appels d’outils, les outils tournent, et les résultats repartent vers lui. La boucle s’arrête quand le modèle répond par du texte sans appel d’outil.' },
		{ term: 'Checkpoint', def: 'Une copie d’un fichier que Claude Code prend avant que Claude le modifie. Appuyer deux fois sur `Esc` revient à un état antérieur.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['you["Toi : Fix the failing tests in auth.ts"] --> ctx["Contexte : ton message, CLAUDE.md, MEMORY.md, définitions des outils"]'],
				highlight: ['you', 'ctx'],
				note: 'Avant le premier appel au modèle, le contexte contient déjà plus que ta phrase : tes fichiers CLAUDE.md, les 200 premières lignes ou 25KB de MEMORY.md, les instructions système et les définitions des outils.'
			},
			{
				add: ['ctx --> t1["Tour 1 : Bash npm test, 3 échecs"]', 't1 --> t2["Tour 2 : Read auth.ts et auth.test.ts"]'],
				highlight: ['t1', 't2'],
				note: 'Dans cette phase, que la doc appelle "gather context", Claude choisit chaque outil d’après ce que le dernier résultat a montré. En mode Manual, `npm test` te demande d’abord ton accord, car il ne fait pas partie de la liste intégrée de commandes en lecture seule (`ls`, `cat`, `grep`, les formes en lecture seule de `git`) qui tournent sans demande, alors que `Read` dans le répertoire de travail ne demande jamais rien.'
			},
			{
				add: ['t2 --> snap["Checkpoint : copie de auth.ts"]', 'snap --> t3["Tour 3 : Edit auth.ts, puis Bash npm test, tout passe"]'],
				highlight: ['snap', 't3'],
				note: '`Edit` remplace un `old_string` exact par un `new_string`, sans correspondance approximative, et Claude Code copie le fichier avant. En mode Manual la modification te demande ton accord, et « Yes, and don’t ask again » vaut pour les modifications jusqu’à la fin de la session.'
			},
			{
				add: ['t3 --> done["Dernier tour : texte seul, Fixed the auth bug, all three tests pass now"]', 'done --> log[("~/.claude/projects/...jsonl")]'],
				highlight: ['done', 'log'],
				note: 'La boucle s’arrête quand le modèle répond sans appel d’outil. Cela fait quatre tours, dont trois avec des appels d’outils. La transcription sur disque est ce que `--resume` relit et ce que `Esc` deux fois remonte.'
			},
			{
				add: ['esc["Tu appuies sur Esc"] -.->|"annule l’appel d’outil en cours"| t3'],
				highlight: ['esc'],
				note: 'Tu peux intervenir à tout moment : `Esc` arrête Claude et annule l’appel d’outil en cours. Un message que tu tapes et envoies avec `Entrée` pendant que Claude travaille est mis en file, et Claude le lit dès que ses appels d’outils en cours sont finis.'
			}
		]
	},
	example: {
		title: 'claude-cookbooks : une session de revue de dépôt lancée par un script',
		repo: 'anthropics/claude-cookbooks',
		url: `${REVIEW}#L236-L351`,
		lang: 'python',
		code: `    options = ClaudeAgentOptions(
        # The agent works inside the reviewed repository.
        cwd=str(repo),
        system_prompt=REVIEWER_SYSTEM_PROMPT,
        tools=READ_ONLY_TOOLS,
        # The //-anchored form is deliberate: with a single leading slash
        # the rule anchors at the settings source, not the filesystem
        # root, matches nothing, and every read is denied under dontAsk.
        # repo is absolute, so the rendered rule keeps the double slash.
        allowed_tools=[f"Read(/{repo}/**)", "Glob", "Grep"],
        permission_mode="dontAsk",
        model=MODEL,
        # Keep machine- and account-configured MCP servers out of the
        # session.
        strict_mcp_config=True,
        max_turns=max_turns,
        max_budget_usd=FOLLOW_UP_BUDGET_USD if resume_session_id else FIRST_RUN_BUDGET_USD,
        hooks={
            "PreToolUse": [
                HookMatcher(matcher="Read|Grep|Glob", hooks=[deny_reads_outside_repo(repo)])
            ]
        },
        # Same behavior on a laptop and on the box that runs the cron job.
        setting_sources=[],
        output_format={"type": "json_schema", "schema": schema},
        # None on a cold run, and the persisted session id on a follow-up.
        resume=resume_session_id,
    )
…
    async for message in query(prompt=prompt, options=options):
        match message:
            case AssistantMessage(content=blocks):
                for block in blocks:
                    match block:
                        case TextBlock(text=text):
                            line = text.strip()
                            if line:
                                # Cap what a scheduled log absorbs per block.
                                print(f"[{label}] {clip(line)}")
                        case ToolUseBlock(name=tool_name):
                            outcome.tools_attempted.append(tool_name)
            case ResultMessage() as result:
                outcome.session_id = result.session_id
                outcome.subtype = result.subtype
                outcome.num_turns = result.num_turns
                outcome.total_cost_usd = result.total_cost_usd
                outcome.denials = len(result.permission_denials or [])
                if isinstance(result.structured_output, dict):
                    outcome.payload = result.structured_output
    return outcome`,
		notes: [
			'L’[Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview) donne à un programme "the same tools, agent loop, and context management that power Claude Code". Ce script du cookbook lance à heure fixe une session de revue d’un dépôt, et ses options sont les choix que tu fais à la main dans une session au terminal.',
			'Les lignes 238 à 246 préparent la session : le répertoire de travail est le dépôt, `tools` limite la session à `Read`, `Glob` et `Grep` (ligne 71), et le mode `dontAsk` "Auto-denies every call that would otherwise prompt", puisque personne n’est là pour répondre.',
			'Les lignes 251 et 252 plafonnent la session à 40 tours pour une première passe (ligne 77) et à un budget en dollars. La [doc de la boucle d’agent](' + LOOP + ') précise que `max_turns` "counts tool-use turns only". La ligne 262 passe l’identifiant de session enregistré, donc la passe suivante continue la même conversation, comme `claude --resume`.',
			'Les lignes 331 à 342 lisent la session pendant qu’elle tourne. Chaque `AssistantMessage` contient du texte ou un appel d’outil, et la ligne 341 note le nom de chaque outil que Claude a demandé. Une session au terminal enregistre les mêmes étapes dans sa transcription JSONL.',
			'Les lignes 343 à 350 lisent le `ResultMessage` qui ferme la boucle : l’identifiant de session, un `subtype` qui dit si la tâche a réussi ou a touché une limite, le nombre de tours, le coût, et les appels refusés par les permissions.'
		]
	},
	tradeoff: {
		gain: [
			'Tu décris le résultat voulu et Claude trouve les fichiers. La doc : "You don\'t need to specify which files to read or what commands to run."',
			'Les modifications s’annulent pendant la session : Claude Code copie chaque fichier avant de le modifier, et `Esc` deux fois revient à un état antérieur.',
			'Toute la session est un fichier sur disque, donc `--continue` reprend là où tu t’es arrêté, et `--fork-session` copie l’historique sous un nouvel identifiant de session sans toucher l’original.'
		],
		cost: [
			'Les checkpoints ne couvrent que les fichiers locaux, et la doc le dit : "Actions that affect remote systems (databases, APIs, deployments) can\'t be checkpointed."',
			'Chaque tour ajoute la sortie des outils au contexte. Quand le contexte se remplit, Claude Code efface d’abord les anciennes sorties d’outils puis résume, et "detailed instructions from early in the conversation may be lost".',
			'En mode Manual, chaque modification et la plupart des commandes shell attendent ta réponse, donc une longue tâche s’arrête dès que tu quittes le terminal.'
		]
	},
	task: {
		prompt: 'Dans une session en mode Manual, tu tapes « Rename the `getUser` helper to `fetchUser` everywhere and make sure the tests still pass ». Liste dans l’ordre les appels d’outils que tu attends, marque ceux qui te demandent ton accord, et dis ce que tu fais si la deuxième modification tourne mal.',
		hint: 'Regroupe les étapes comme la doc : gather context, take action, verify results. Compare chaque outil au tableau des permissions : lectures, commandes Bash, modifications de fichiers.',
		answer: [
			'Gather context : `grep -rn getUser src` via Bash, puis `Read` sur chaque fichier qu’il liste. `grep` fait partie de la liste en lecture seule et `Read` reste dans le répertoire de travail, donc aucun des deux ne demande.',
			'Take action : un `Edit` par fichier, chacun remplace un `old_string` exact. La première modification te demande ton accord, et si tu réponds « Yes, and don’t ask again », les suivantes tournent sans demande jusqu’à la fin de la session.',
			'Verify : `npm test` via Bash. Il te demande ton accord, car ce n’est pas une commande en lecture seule. S’il échoue, Claude lit la sortie et revient aux modifications.',
			'Si la deuxième modification est fausse, appuie sur `Esc` pour arrêter l’appel d’outil en cours, puis deux fois sur `Esc` pour ramener les fichiers au checkpoint d’avant cette modification, et dis à Claude ce qui n’allait pas.'
		],
		steps: [
			{
				title: 'Rassemble le contexte',
				questions: [
					{ q: 'Quel appel d’outil attends-tu en premier ?', options: ['`Edit` sur le premier fichier', '`npm test` via Bash', '`grep -rn getUser src` via Bash', '`Read` sur tous les fichiers du dépôt'], answer: 2, why: 'Claude doit trouver où `getUser` est utilisé avant de lire ou de changer quoi que ce soit.' },
					{ q: 'En mode Manual, ce `grep` te demande-t-il ton accord ?', options: ['Oui, chaque commande Bash demande', 'Non, `grep` fait partie de la liste intégrée en lecture seule', 'Seulement la première fois de la session', 'Seulement s’il cherche hors de `src`'], answer: 1, why: 'Une liste intégrée de commandes en lecture seule, dont `grep`, tourne sans demande.' },
					{ q: 'Avant que ce `grep` tourne, que contient déjà le contexte en plus de ta phrase ?', options: ['Tes fichiers CLAUDE.md, le début de MEMORY.md et les définitions des outils', 'Rien encore : le contexte part vide', 'Tous les fichiers de `src`', 'Les transcriptions JSONL de tes anciennes sessions'], answer: 0, why: 'Avant le premier appel au modèle, le contexte contient tes fichiers CLAUDE.md, les 200 premières lignes ou 25 Ko de MEMORY.md, les instructions système et les définitions des outils.' },
					{ q: 'Qu’est-ce qui dit à Claude quels fichiers lire ?', options: ['Tu les listes dans ton message', 'La sortie du `grep`', 'Ton CLAUDE.md', 'Le fichier JSONL de la session'], answer: 1, why: 'Claude choisit chaque outil d’après ce que le dernier résultat a montré. Tu décris le résultat voulu, pas les fichiers.' }
				]
			},
			{
				title: 'Passe à l’action',
				questions: [
					{ q: 'Combien d’appels `Edit` attends-tu ?', options: ['Un pour tout le dépôt', 'Un par fichier qui utilise `getUser`', 'Un par test', 'Un par commit'], answer: 1, why: 'Chaque `Edit` modifie un fichier, donc le renommage prend un appel par fichier.' },
					{ q: 'Comment `Edit` trouve-t-il le texte à changer ?', options: ['Il cherche des noms qui se ressemblent', 'Il réécrit tout le fichier', 'Il lance `sed` sur le fichier', 'Il remplace un `old_string` exact par un `new_string`'], answer: 3, why: '`Edit` cherche une correspondance exacte, sans approximation.' },
					{ q: 'Que fait Claude Code juste avant chaque modification ?', options: ['Il commite le fichier dans git', 'Il lance les tests', 'Il prend un checkpoint du fichier', 'Il recharge CLAUDE.md'], answer: 2, why: 'Claude Code fait d’abord une copie du fichier, et c’est ce qui rend une modification réversible.' },
					{ q: 'Tu réponds « Yes, and don’t ask again » à la première modification. Combien de temps cela dure-t-il ?', options: ['Jusqu’à la fin de la session', 'Pour toujours, via `.claude/settings.local.json`', 'Pour la modification suivante seulement', 'Jusqu’à ce que les tests passent'], answer: 0, why: 'Pour les modifications de fichiers, cette réponse vaut pour le reste de la session. Les suivantes tournent sans demande.' }
				]
			},
			{
				title: 'Vérifie le résultat',
				questions: [
					{ q: 'Quel appel vérifie que les tests passent encore après le renommage ?', options: ['`Glob` sur les fichiers de test', '`npm test` via Bash', '`Read` sur le fichier de test', '`Edit` sur le fichier de test'], answer: 1, why: 'La tâche dit que les tests doivent encore passer, donc Claude les lance.' },
					{ q: '`npm test` te demande-t-il ton accord ?', options: ['Non, les tests ne font que lire des fichiers', 'Non, tu as déjà validé les modifications', 'Oui, ce n’est pas une commande en lecture seule', 'Seulement quand un test échoue'], answer: 2, why: '`npm test` n’est pas dans la liste en lecture seule, donc en mode Manual il demande.' },
					{ q: 'Les tests échouent. Que fait Claude ensuite ?', options: ['Il lit la sortie et revient aux modifications', 'Il s’arrête et annonce la tâche finie', 'Il revient en arrière de lui-même', 'Il ouvre une nouvelle session'], answer: 0, why: 'Verify renvoie vers take action : la sortie de l’échec est ce dont Claude repart.' },
					{ q: 'Pendant que `npm test` tourne, tu tapes « mets aussi le README à jour » et tu appuies sur `Enter`. Quand Claude le lit-il ?', options: ['Seulement à la fin de toute la demande', 'Jamais : un message tapé pendant le travail est perdu', 'Tout de suite, en annulant `npm test`', 'Dès que ses appels d’outils en cours sont finis'], answer: 3, why: 'Un message envoyé pendant que Claude travaille est mis en file, et Claude le lit une fois les appels d’outils en cours terminés. Seul `Esc` annule un appel d’outil.' }
				]
			},
			{
				title: 'Rattrape une mauvaise modification',
				questions: [
					{ q: 'La deuxième modification tourne mal pendant que Claude travaille. Sur quoi appuies-tu d’abord ?', options: ['`Esc` une fois, pour arrêter l’appel d’outil en cours', '`Enter`, pour mettre un message en file', '`Esc` trois fois', 'Tu fermes le terminal'], answer: 0, why: '`Esc` arrête Claude et annule l’appel d’outil en cours.' },
					{ q: 'Comment ramènes-tu les fichiers à leur état d’avant cette modification ?', options: ['Tu lances `claude --resume`', 'Tu appuies deux fois sur `Esc` et tu reviens en arrière', 'Tu lances `/compact`', 'Tu ouvres une nouvelle session'], answer: 1, why: 'Deux fois `Esc` ramène à un checkpoint antérieur.' },
					{ q: 'Tu fermes le terminal avant la fin du renommage. Comment reprends-tu la même session demain ?', options: ['Tu appuies deux fois sur `Esc`', 'Tu recolles ton premier message', 'Tu lances `claude --resume` et tu la choisis', 'Tu lances `/compact`'], answer: 2, why: 'La session est un fichier JSONL sous `~/.claude/projects/`, et `claude --resume` la rouvre sous le même identifiant de session.' },
					{ q: 'Les fichiers sont revenus. Que fais-tu ensuite ?', options: ['Tu supprimes le fichier JSONL de la session', 'Tu quittes le mode Manual', 'Tu fais le renommage à la main', 'Tu dis à Claude ce qui n’allait pas'], answer: 3, why: 'La session garde son historique, donc Claude peut réessayer avec ta correction.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Dans une session en mode Manual, laquelle de ces étapes tourne sans demande de permission ?',
			options: [
				'`Edit` sur un fichier dans le répertoire de travail',
				'`Bash` qui lance `npm test` dans le dossier du projet',
				'`Read` sur un fichier dans le répertoire de travail',
				'`WebFetch` sur une page hors des domaines de documentation'
			],
			answer: 2,
			why: 'Les lectures dans le répertoire de travail ne demandent pas d’accord. Les modifications de fichiers demandent jusqu’à ce que tu les autorises pour la session, Bash demande sauf pour une liste intégrée en lecture seule, et WebFetch demande sauf pour des domaines de documentation déjà approuvés.'
		},
		{
			q: 'Claude a modifié 3 fichiers et lancé une migration sur la base de staging. Tu appuies deux fois sur `Esc` et tu reviens en arrière. Qu’est-ce qui revient ?',
			options: [
				'Les 3 fichiers et la base de staging, tous deux comme avant',
				'Les 3 fichiers, et la base reste migrée',
				'Rien, car le retour arrière ne marche que sur l’historique git commité',
				'Seulement la base, car les fichiers demandent un git revert'
			],
			answer: 1,
			why: 'Les checkpoints sont des copies de fichiers locaux que Claude Code garde à part de git. Les actions sur des systèmes distants comme les bases, les API et les déploiements ne passent pas par les checkpoints, donc ce sont les modes et les règles de permission qui les contrôlent.'
		},
		{
			q: 'Quand la boucle d’une requête se termine-t-elle ?',
			options: [
				'Après un nombre fixe de 10 appels d’outils par requête',
				'Quand un outil renvoie une erreur que le modèle ne sait pas gérer',
				'Quand le modèle répond par du texte sans appel d’outil',
				'Quand la fenêtre de contexte est pleine et doit être résumée'
			],
			answer: 2,
			why: 'À chaque tour, le modèle demande des appels d’outils et reçoit leurs résultats. Il continue d’appeler des outils jusqu’à produire une réponse sans appel d’outil, et ce texte est la réponse que tu vois. Une limite comme `max_turns` peut l’arrêter plus tôt.'
		}
	],
	recall: {
		q: 'Quelles sont les trois phases d’une requête à Claude Code, et où Claude Code garde-t-il la session ?',
		a: 'Gather context, take action, verify results, répétées jusqu’à une réponse en texte seul. Chaque message, appel d’outil et résultat va dans un fichier JSONL sous `~/.claude/projects/`.'
	},
	sources: [
		{ title: 'Doc Claude Code, How Claude Code works, lue le 2026-10-17', url: WORKS },
		{ title: 'Doc Claude Code, Tools reference, lue le 2026-10-17', url: TOOLS },
		{ title: 'Doc Claude Code, Configure permissions, lue le 2026-10-17', url: 'https://code.claude.com/docs/en/permissions' },
		{ title: 'Doc Agent SDK, How the agent loop works, lue le 2026-10-17', url: LOOP },
		{ title: 'anthropics/claude-code, README.md', url: `${CC}/README.md` },
		{ title: 'claude-cookbooks, scheduled_repository_reviewer/scheduled_review.py', url: REVIEW }
	]
};
