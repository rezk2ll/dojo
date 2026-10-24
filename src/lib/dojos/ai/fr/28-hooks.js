const CC = 'https://github.com/anthropics/claude-code/blob/c017428c8c27e604840435048d5bce6a9a22c040';
const GUIDE = 'https://code.claude.com/docs/en/hooks-guide';
const REF = 'https://code.claude.com/docs/en/hooks';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'hooks',
	part: 'Claude Code',
	title: 'Les hooks',
	minutes: 10,
	hook: [
		'Ton `CLAUDE.md` dit « Lance Prettier sur chaque fichier que tu modifies. » Dans une tâche, Claude modifie 12 fichiers et lance Prettier après 11 d’entre eux. Le contrôle de format de la CI échoue sur le douzième.',
		'La doc présente les hooks comme des commandes shell que Claude Code lance "at specific points in its lifecycle", pour que "certain actions always happen rather than relying on the LLM to choose to run them". **C’est le processus Claude Code qui lance le hook, Claude ne peut pas le sauter.**'
	],
	terms: [
		{ term: 'Hook', def: 'Une commande, une URL, un prompt ou un agent que Claude Code lance quand un événement se produit. Il se déclare sous `hooks` dans un fichier de réglages, un plugin ou un skill.' },
		{ term: 'PreToolUse', def: 'L’événement qui part avant l’exécution d’un appel d’outil. Un hook branché dessus peut bloquer l’appel avant que Claude Code le lance. `PostToolUse` part après un appel réussi et ne peut pas l’annuler.' },
		{ term: 'Matcher', def: 'La chaîne qui choisit quels appels d’outils un hook voit. `Bash` ne vise que l’outil Bash, et `Edit|Write` vise l’un ou l’autre de ces deux outils.' },
		{ term: 'Code de sortie 2', def: 'Le code de sortie qui fait bloquer l’action par Claude Code. Pour `PreToolUse`, le stderr du hook part chez Claude comme raison du refus.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['claude["Claude demande : Bash, grep -r TODO src"] --> pre["Hooks PreToolUse au matcher Bash"]'],
				highlight: ['claude', 'pre'],
				note: 'Claude veut lancer `grep -r TODO src` avec l’outil Bash. Claude Code déclenche `PreToolUse` et lance en parallèle chaque hook dont le matcher correspond. Chaque hook de type commande reçoit sur stdin un JSON avec `hook_event_name`, `tool_name` et `tool_input` : `tool_input.command` contient `grep -r TODO src`.'
			},
			{
				add: ['pre -->|"exit 2"| blocked["Bloqué : stderr envoyé à Claude"]', 'blocked -.->|"Claude réessaie avec rg"| claude'],
				highlight: ['blocked'],
				note: 'Le hook écrit une raison sur stderr et sort avec le code 2. Claude Code bloque l’appel et transmet le stderr à Claude, qui peut essayer une autre commande. Quand deux hooks ne sont pas d’accord, la décision la plus stricte l’emporte, dans l’ordre `deny`, `defer`, `ask`, `allow`.'
			},
			{
				add: ['pre -->|"exit 0"| perms["Règles de permission et mode"]', 'perms --> tool["L’outil tourne"]'],
				highlight: ['perms', 'tool'],
				note: 'Le code 0 veut dire « pas d’objection », et la doc précise qu’il "doesn\'t approve the tool call: the normal permission flow still applies". Tout autre code avec du texte simple sur stdout est une erreur non bloquante : la transcription affiche une erreur de hook et l’outil tourne quand même.'
			},
			{
				add: ['tool --> post["PostToolUse, matcher Edit|Write"]', 'post --> fmt["npx prettier --write sur le fichier modifié"]'],
				highlight: ['post', 'fmt'],
				note: 'Après un `Edit` ou un `Write` réussi, un hook `PostToolUse` au matcher `Edit|Write` lance `jq -r \'.tool_input.file_path\' | xargs npx prettier --write`. Le guide des hooks donne exactement cette commande comme exemple de formatage après modification. Ici, le code 2 montre seulement le stderr à Claude, car le fichier est déjà écrit.'
			}
		]
	},
	example: {
		title: 'examples/hooks/bash_command_validator_example.py dans anthropics/claude-code',
		repo: 'anthropics/claude-code',
		url: `${CC}/examples/hooks/bash_command_validator_example.py#L13-L79`,
		lang: 'python',
		code: `{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "python3 /path/to/claude-code/examples/hooks/bash_command_validator_example.py"
          }
        ]
      }
    ]
  }
}
…
def main():
    try:
        input_data = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON input: {e}", file=sys.stderr)
        # Exit code 1 shows stderr to the user but not to Claude
        sys.exit(1)

    tool_name = input_data.get("tool_name", "")
    if tool_name != "Bash":
        sys.exit(0)

    tool_input = input_data.get("tool_input", {})
    command = tool_input.get("command", "")

    if not command:
        sys.exit(0)

    issues = _validate_command(command)
    if issues:
        for message in issues:
            print(f"• {message}", file=sys.stderr)
        # Exit code 2 blocks tool call and shows stderr to Claude
        sys.exit(2)`,
		notes: [
			'Les lignes 13 à 27 sont le bloc de réglages tiré de la docstring du fichier. Il enregistre le script comme hook `PreToolUse` au matcher `Bash` : le script tourne avant chaque appel Bash, et jamais avant un `Edit`.',
			'La ligne 58 lit le JSON de l’événement sur stdin, et les lignes 64 à 69 en tirent `tool_name` et `tool_input.command`. Les lignes 36 à 45, au-dessus de l’extrait, contiennent les règles : une commande qui correspond à `^grep\\b(?!.*\\|)` reçoit le message "Use \'rg\' (ripgrep) instead of \'grep\'".',
			'La ligne 79 sort avec le code 2 après avoir écrit les messages sur stderr. Claude Code bloque `grep -r TODO src`, et Claude lit le message et peut relancer la recherche avec `rg`.',
			'La ligne 62 sort avec le code 1 quand stdin n’est pas du JSON valide. Le commentaire dit que ce code montre le stderr "to the user but not to Claude". Pour le guide, tout code autre que 0 et 2 est une erreur non bloquante : l’appel Bash part quand même.'
		]
	},
	tradeoff: {
		gain: [
			'Un hook `PreToolUse` qui sort avec le code 2 bloque l’appel dans tous les modes de permission, `bypassPermissions` et `--dangerously-skip-permissions` compris.',
			'Un hook peut lire toute la commande et lui appliquer n’importe quelle logique, alors qu’une règle comme `Bash(grep *)` compare seulement le texte à un motif.',
			'Un hook `PostToolUse` lance Prettier après chaque `Edit` et `Write`, sans aucune consigne dans `CLAUDE.md`.'
		],
		cost: [
			'La doc : "Command hooks execute shell commands with your full user permissions." Un hook lent retarde chaque appel d’outil, jusqu’au délai par défaut de 10 minutes pour les hooks de type commande.',
			'Un hook qui sort avec le code 1 par erreur ne bloque rien. L’outil tourne et la transcription affiche une erreur de hook.',
			'La regex de l’exemple commence par `^grep`, donc `cd src && grep -r TODO .` passe le contrôle. Un hook n’attrape que les cas que son code teste.'
		]
	},
	task: {
		prompt: 'Dans un dépôt Python, tu veux deux choses dans `.claude/settings.json` : Claude ne doit jamais modifier un fichier sous `migrations/`, et chaque fichier `.py` que Claude modifie passe par `ruff format`. Écris le bloc `hooks` et le script qui bloque.',
		hint: 'Une entrée `PreToolUse` et une entrée `PostToolUse`, toutes deux au matcher `Edit|Write`. Le chemin modifié est dans `tool_input.file_path`. Quel code de sortie bloque ?',
		answer: [
			'Script `.claude/hooks/no-migrations.sh` : `FILE=$(jq -r \'.tool_input.file_path // empty\')`, puis `if [[ "$FILE" == *migrations/* ]]; then echo "Blocked: $FILE is a migration, write a new one with alembic" >&2; exit 2; fi; exit 0`. Lance `chmod +x` dessus.',
			'`"PreToolUse": [{ "matcher": "Edit|Write", "hooks": [{ "type": "command", "command": "\\"$CLAUDE_PROJECT_DIR\\"/.claude/hooks/no-migrations.sh" }] }]`.',
			'`"PostToolUse": [{ "matcher": "Edit|Write", "hooks": [{ "type": "command", "command": "jq -r \'.tool_input.file_path\' | grep \'\\\\.py$\' | xargs -r ruff format" }] }]`. Le `grep` écarte les fichiers qui ne sont pas du Python.',
			'Le code 2 compte : avec `exit 1`, Claude Code signale une erreur de hook et la modification de `migrations/0042_users.py` passe quand même. Le hook ne voit jamais un `sed -i` lancé en Bash. Une règle deny `Edit(migrations/**)` couvre aussi les commandes de fichiers que Claude Code reconnaît en Bash, comme `sed` et `tee`.'
		],
		steps: [
			{
				title: 'Choisis les événements',
				questions: [
					{ q: 'Quel événement peut arrêter une modification de `migrations/` avant qu’elle ait lieu ?', options: ['`PostToolUse`', '`PreToolUse`', 'Une ligne dans CLAUDE.md', 'N’importe lequel, s’il sort en 1'], answer: 1, why: '`PreToolUse` part avant l’exécution de l’appel d’outil, donc un hook branché dessus peut le bloquer.' },
					{ q: 'Quel événement lance `ruff format` sur un fichier que Claude vient de modifier ?', options: ['`PreToolUse`', 'L’un ou l’autre', '`PostToolUse`', 'Aucun : une ligne dans CLAUDE.md'], answer: 2, why: 'Le formatage a besoin du fichier écrit, et `PostToolUse` part après un appel réussi.' },
					{ q: 'Quel matcher les deux entrées utilisent-elles ?', options: ['`Edit|Write`', '`Bash`', '`*.py`', '`migrations/`'], answer: 0, why: 'Un matcher choisit des outils, pas des chemins. `Edit|Write` vise l’un ou l’autre des deux outils de fichiers.' },
					{ q: 'Pourquoi un hook pour le formatage plutôt qu’une ligne dans CLAUDE.md ?', options: ['Un hook consomme moins de tokens', 'CLAUDE.md ne peut pas nommer de commandes', 'Un hook tourne plus vite que Claude', 'Claude Code lance le hook, donc Claude ne peut pas le sauter'], answer: 3, why: 'Dans l’histoire du début, Claude a lancé Prettier après 11 modifications sur 12. Un hook tourne à chaque fois.' }
				]
			},
			{
				title: 'Écris le script qui bloque',
				questions: [
					{ q: 'Où se trouve, dans le JSON de l’événement, le chemin du fichier que Claude veut modifier ?', options: ['`tool_input.command`', '`tool_input.file_path`', '`tool_name`', '`hook_event_name`'], answer: 1, why: 'Pour `Edit` et `Write`, le chemin visé est dans `tool_input.file_path`.' },
					{ q: 'Comment le script reçoit-il ce JSON ?', options: ['En premier argument, `$1`', 'Par une variable d’environnement', 'Sur stdin, lu avec `jq`', 'Dans un fichier écrit par Claude Code'], answer: 2, why: 'Chaque hook de type commande reçoit l’événement en JSON sur stdin.' },
					{ q: 'Quel code de sortie fait bloquer la modification par Claude Code ?', options: ['0', '1', '-1', '2'], answer: 3, why: 'Seul le code 2 bloque. Le code 0 veut dire « pas d’objection ».' },
					{ q: 'Où va le message « Blocked: … is a migration » écrit sur stderr ?', options: ['Chez Claude, comme raison du blocage', 'Seulement dans ton terminal', 'Dans un fichier de log sous `.claude/`', 'Nulle part : stderr est jeté'], answer: 0, why: 'Pour `PreToolUse`, le stderr du hook part chez Claude, qui peut alors écrire une nouvelle migration à la place.' }
				]
			},
			{
				title: 'Déclare les deux hooks',
				questions: [
					{ q: 'Que lances-tu sur `no-migrations.sh` pour que le hook puisse le démarrer ?', options: ['`source` dessus', '`chmod +x` dessus', '`ruff format` dessus', 'Rien : un hook lance n’importe quel fichier'], answer: 1, why: 'La commande du hook lance le script directement, il doit donc être exécutable.' },
					{ q: 'Dans la commande `PostToolUse`, à quoi sert `grep \'\\.py$\'` ?', options: ['Il écarte les fichiers qui ne sont pas du Python', 'Il trouve les fichiers de migration', 'Il bloque la modification s’il trouve quelque chose', 'Il formate le fichier'], answer: 0, why: 'Le matcher voit chaque `Edit` et `Write`, donc le filtre sur le chemin doit vivre dans la commande.' },
					{ q: 'Que passe `jq -r \'.tool_input.file_path\'` à `ruff format` ?', options: ['Tout le JSON de l’événement', 'Le texte de la commande', 'Le chemin du fichier modifié', 'Le nom de l’outil'], answer: 2, why: '`jq -r` affiche le chemin brut, et `xargs` le donne à `ruff format`.' },
					{ q: 'Le hook `PostToolUse` sort en 2. Peut-il annuler la modification ?', options: ['Oui, Claude Code remet le fichier d’avant', 'Oui, Claude Code te demande d’abord', 'Il bloque la modification suivante à la place', 'Non : le fichier est écrit, et stderr part chez Claude'], answer: 3, why: '`PostToolUse` part après la réussite de l’outil. Le code 2 n’y fait que montrer stderr à Claude.' }
				]
			},
			{
				title: 'Vérifie les trous',
				questions: [
					{ q: 'Le script sort en 1 par erreur. Que devient une modification de `migrations/0042_users.py` ?', options: ['Elle est bloquée quand même', 'Elle passe, et le transcript montre une erreur de hook', 'Claude Code te demande ton accord', 'La session s’arrête'], answer: 1, why: 'Tout code autre que 0 et 2 est une erreur non bloquante, donc l’outil tourne.' },
					{ q: 'Claude lance `sed -i` sur une migration en Bash. Le hook le voit-il ?', options: ['Oui, il voit chaque changement de fichier', 'Oui, `sed` compte comme un `Edit`', 'Non : le matcher est `Edit|Write`, pas `Bash`', 'Seulement si le chemin contient `migrations/`'], answer: 2, why: 'Le hook ne part que pour les outils que nomme son matcher.' },
					{ q: 'Quel ajout couvre aussi `sed` et `tee` sur les migrations ?', options: ['Une règle deny `Edit(migrations/**)`', 'Un second hook qui sort en 1', 'Une ligne dans CLAUDE.md', 'Un hook `PostToolUse` sur `Bash`'], answer: 0, why: 'Cette règle deny couvre les commandes de fichiers que Claude Code reconnaît en Bash, comme `sed` et `tee`.' },
					{ q: 'Quelqu’un lance la session avec `--dangerously-skip-permissions`. Le hook bloque-t-il encore ?', options: ['Non, cette option saute toutes les vérifications', 'Non, il ne fait que noter sa décision', 'Seulement pour `Write`, pas pour `Edit`', 'Oui, il bloque dans tous les modes de permission'], answer: 3, why: 'Un hook `PreToolUse` qui sort en 2 bloque l’appel dans tous les modes, `bypassPermissions` compris.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Ton hook `PreToolUse` écrit « no rm -rf » sur stderr et sort avec le code 1. Claude lance `rm -rf build/`. Que se passe-t-il ?',
			options: [
				'La commande est bloquée et Claude lit « no rm -rf »',
				'La commande tourne, et la transcription affiche une erreur de hook',
				'Claude Code te demande de valider la commande',
				'La session s’arrête jusqu’à ce que tu répares le hook'
			],
			answer: 1,
			why: 'Seul le code 2 bloque. Tout autre code non nul avec du texte simple sur stdout est une erreur non bloquante : Claude Code note l’erreur de hook et l’appel d’outil continue.'
		},
		{
			q: 'Un hook `PostToolUse` sur `Edit|Write` lance le linter et sort avec le code 2 s’il trouve une erreur. Qu’arrive-t-il à la modification ?',
			options: [
				'Claude Code remet le fichier dans son état d’avant',
				'La modification reste, et la sortie du linter sur stderr part chez Claude',
				'La modification reste, et l’erreur ne s’affiche que pour toi',
				'Claude Code te demande s’il faut garder la modification'
			],
			answer: 1,
			why: '`PostToolUse` part après la réussite de l’outil : le fichier est déjà écrit et un hook ne peut pas l’annuler. Pour cet événement, le code 2 montre le stderr à Claude, qui peut corriger l’erreur dans une nouvelle modification.'
		},
		{
			q: 'Une session tourne avec `--dangerously-skip-permissions`. Un hook `PreToolUse` sur `Bash` renvoie une décision `deny` pour `git push --force`. Que se passe-t-il ?',
			options: [
				'Le push part, car ce flag saute tous les contrôles',
				'Le push part, mais Claude Code journalise la décision du hook',
				'Claude Code t’affiche une demande pour le push',
				'Le push est bloqué, car les hooks passent avant le contrôle du mode'
			],
			answer: 3,
			why: 'Les hooks `PreToolUse` partent avant tout contrôle du mode de permission, dans tous les modes. Un `deny` de hook bloque l’outil même en `bypassPermissions` : une équipe peut imposer une règle qu’un changement de mode ne lève pas.'
		}
	],
	recall: {
		q: 'Que fait chaque code de sortie d’un hook `PreToolUse` de type commande ?',
		a: 'Le code 2 bloque l’appel d’outil et envoie le stderr à Claude. Le code 0 laisse la décision aux règles de permission et au mode. Tout autre code est une erreur non bloquante, et l’outil tourne.'
	},
	sources: [
		{ title: 'Doc Claude Code, Automate actions with hooks, lue le 2026-10-17', url: GUIDE },
		{ title: 'Doc Claude Code, Hooks reference, lue le 2026-10-17', url: REF },
		{ title: 'anthropics/claude-code, examples/hooks/bash_command_validator_example.py', url: `${CC}/examples/hooks/bash_command_validator_example.py` }
	]
};
