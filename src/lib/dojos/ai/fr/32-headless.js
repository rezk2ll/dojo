const CCA = 'https://github.com/anthropics/claude-code-action/blob/f27be6b65a4652f08a2ba3cff79114829b588967';
const FLAKY = `${CCA}/examples/test-failure-analysis.yml`;
const ACTION = `${CCA}/action.yml`;
const SECURITY = `${CCA}/docs/security.md`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'headless',
	part: 'Claude Code',
	title: 'Claude Code dans les scripts et la CI',
	minutes: 10,
	hook: [
		'La CI de ta branche échoue à 2 h du matin. Le matin, tu colles le log d’échec dans Claude Code et tu demandes : test instable ou vrai bug ? Tu refais la même chose trois fois dans la semaine, à la main, avec la même question.',
		'`claude -p "ta question"` lance le même agent sans fenêtre de chat. Il fait tourner la boucle d’agent, affiche le résultat et sort avec le code 0 en cas de succès, un code non nul en cas d’échec. **Un script shell ou un workflow GitHub peut l’appeler comme n’importe quelle autre commande.**'
	],
	terms: [
		{ term: 'Mode print', def: 'Claude Code lancé avec `-p` (ou `--print`) : un prompt en entrée, le résultat sur stdout, puis la sortie. Pas de fenêtre de chat, et personne pour répondre à une demande de permission.' },
		{ term: 'Sortie structurée', def: 'L’objet JSON que renvoie une exécution lancée avec `--output-format json` et `--json-schema`. Il respecte ton schéma et arrive dans le champ `structured_output`.' },
		{ term: 'Mode bare', def: 'Le flag `--bare` : Claude Code ignore les hooks, skills, plugins, serveurs MCP, la mémoire auto et les CLAUDE.md qu’il trouverait sur la machine. Il lui faut `ANTHROPIC_API_KEY`, car il ne lit jamais ta connexion d’abonnement.' },
		{ term: 'Mode automation', def: 'La façon dont `claude-code-action` tourne quand le workflow passe un input `prompt` : Claude démarre tout de suite, sans attendre un commentaire `@claude`.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['ci["Le workflow CI échoue"] -->|"workflow_run: completed"| job["job detect-flaky sur ubuntu-latest"]'],
				highlight: ['ci', 'job'],
				note: 'Un second workflow attend la fin de celui qui s’appelle `CI` et ne tourne que si sa conclusion vaut `failure`. Avant de lancer Claude, l’action vérifie que l’acteur a un accès en écriture. Pour `workflow_run`, elle vérifie aussi l’acteur qui a lancé l’exécution en amont.'
			},
			{
				add: ['job -->|"input prompt"| claude["claude-code-action : Claude Code sur le runner"]'],
				highlight: ['claude'],
				note: 'Le workflow passe un `prompt`, donc l’action tourne en mode automation. Sans `prompt`, elle attendrait `@claude` dans un commentaire. L’input `claude_args` part « directly to Claude CLI » (tel quel vers la CLI) : chaque flag de `claude -p` y fonctionne.'
			},
			{
				add: ['claude -->|"--json-schema"| out["structured_output : is_flaky, confidence, summary"]'],
				highlight: ['out'],
				note: 'Le schéma exige trois champs : un booléen, un nombre entre 0 et 1 et une chaîne. L’action expose l’objet comme sortie d’étape `structured_output`. Une étape suivante lit un champ avec `fromJSON(steps.detect.outputs.structured_output).confidence`.'
			},
			{
				add: ['out -->|"is_flaky et confidence >= 0.7"| retry["gh workflow run : relance la CI"]', 'out -->|"confidence < 0.7"| human["Ligne de log : revue manuelle conseillée"]'],
				highlight: ['retry', 'human'],
				note: 'Le modèle répond à une seule question, et du YAML ordinaire décide quoi faire de la réponse. La seule action automatique est une relance de la CI, qui ne fusionne rien et ne supprime rien. Un score bas affiche une ligne et laisse la décision à une personne.'
			},
			{
				add: ['claude --> caps["Plafonds : --max-turns, --max-budget-usd, timeout du job"]'],
				highlight: ['caps'],
				note: '`--max-turns` n’a pas de limite par défaut, et l’exécution « Exits with an error when the limit is reached » (sort en erreur à la limite). `--max-budget-usd` arrête l’exécution quand la dépense estimée atteint le montant. La doc GitHub Actions de Claude Code conseille aussi des timeouts de workflow et des contrôles de concurrence contre les jobs qui s’emballent.'
			}
		]
	},
	example: {
		title: 'examples/test-failure-analysis.yml : Claude classe un échec de CI',
		repo: 'anthropics/claude-code-action',
		url: `${FLAKY}#L8-L59`,
		lang: 'yaml',
		code: `on:
  workflow_run:
    workflows: ["CI"]
    types: [completed]

permissions:
  contents: read
  actions: write

jobs:
  detect-flaky:
    runs-on: ubuntu-latest
    if: \${{ github.event.workflow_run.conclusion == 'failure' }}
…
      - name: Detect flaky test failures
        id: detect
        uses: anthropics/claude-code-action@main
        with:
          anthropic_api_key: \${{ secrets.ANTHROPIC_API_KEY }}
          prompt: |
            The CI workflow failed: \${{ github.event.workflow_run.html_url }}

            Check the logs: gh run view \${{ github.event.workflow_run.id }} --log-failed

            Determine if this looks like a flaky test failure by checking for:
            - Timeout errors
            - Race conditions
            - Network errors
            - "Expected X but got Y" intermittent failures
            - Tests that passed in previous commits

            Return:
            - is_flaky: true if likely flaky, false if real bug
            - confidence: number 0-1 indicating confidence level
            - summary: brief one-sentence explanation
          claude_args: |
            --json-schema '{"type":"object","properties":{"is_flaky":{"type":"boolean","description":"Whether this appears to be a flaky test failure"},"confidence":{"type":"number","minimum":0,"maximum":1,"description":"Confidence level in the determination"},"summary":{"type":"string","description":"One-sentence explanation of the failure"}},"required":["is_flaky","confidence","summary"]}'

      # Auto-retry only if flaky AND high confidence (>= 0.7)
      - name: Retry flaky tests
        if: |
          fromJSON(steps.detect.outputs.structured_output).is_flaky == true &&
          fromJSON(steps.detect.outputs.structured_output).confidence >= 0.7
        env:
          GH_TOKEN: \${{ github.token }}
          WORKFLOW_NAME: \${{ github.event.workflow_run.name }}
          HEAD_BRANCH: \${{ github.event.workflow_run.head_branch }}
        run: |
          OUTPUT='\${{ steps.detect.outputs.structured_output }}'`,
		notes: [
			'Les lignes 13 à 15 donnent au token du job `contents: read` et `actions: write`, et rien d’autre. La doc GitHub Actions de Claude Code : « Grant the workflow only the permissions it needs » (donne au workflow seulement les permissions dont il a besoin).',
			'La ligne 47 passe `--json-schema` par `claude_args`. Dans [action.yml](' + ACTION + '#L182-L184), l’action décrit `structured_output` comme une chaîne JSON à lire avec `fromJSON()`, ce que font les lignes 52 et 53.',
			'La ligne 33 demande à Claude de lancer `gh run view`, et `claude_args` ne contient aucun `--allowedTools`. Dans une exécution `-p` sans personne pour répondre, un appel d’outil qui demanderait une permission est refusé. Si tu copies ce fichier, ajoute `--allowedTools "Bash(gh run view *)"` pour que la lecture du log ne dépende pas du mode de permission de départ.',
			'La ligne 59 colle la sortie du modèle dans un script shell. GitHub évalue `${{ }}` avant que le shell tourne, donc un `\'` dans `summary` ferme la chaîne entre quotes. Ce résumé, le modèle l’a écrit après avoir lu des logs de CI qu’une pull request peut influencer. GitHub recommande une variable d’environnement intermédiaire, comme la ligne 56 le fait déjà pour `WORKFLOW_NAME`.'
		]
	},
	tradeoff: {
		gain: [
			'Le même agent tourne sur ton portable et en CI avec une seule commande, et le code de sortie dit au script si l’exécution a réussi.',
			'`--json-schema` renvoie des champs comme `is_flaky` et `confidence`, qu’un `if` de workflow ou `jq` testent sans analyser de prose.',
			'`--bare` ignore les hooks du `~/.claude` d’un collègue et les serveurs de `.mcp.json`. La doc le dit « useful for CI and scripts where you need the same result on every machine » (utile quand il faut le même résultat sur chaque machine).'
		],
		cost: [
			'Chaque exécution de l’action consomme des minutes GitHub Actions et des tokens d’API, et un long `CLAUDE.md` est relu à chaque exécution.',
			'Sans `--bare`, une session `-p` lance les hooks du `.claude/settings.json` du projet et connecte les serveurs de son `.mcp.json`, sans dialogue de confiance, même dans un dossier que tu n’as jamais approuvé.',
			'Dans une exécution `-p` sans personne pour répondre, un appel d’outil qu’aucune règle ni aucun flag n’autorise est refusé, et l’exécution continue sans ce résultat.',
			'La sortie du modèle est une entrée non fiable pour chaque étape qui suit : un résumé collé dans un script `run:` peut contenir de la syntaxe shell.'
		]
	},
	task: {
		prompt: 'Écris un seul pipeline shell pour une vérification avant merge. Il envoie `git diff main` à Claude, demande les fautes de frappe en JSON `{"typos":[{"file","line","issue"}]}`, s’arrête après 3 tours, ignore la configuration de la machine, et fait échouer le script quand la liste n’est pas vide.',
		hint: 'Si tu envoies le diff par un pipe, Claude n’a besoin d’aucun outil pour le lire. `jq -e` fixe son code de sortie d’après la dernière valeur qu’il affiche.',
		answer: [
			'`git diff main | claude --bare -p "List every typo in this diff." --output-format json --max-turns 3 --json-schema \'{"type":"object","properties":{"typos":{"type":"array","items":{"type":"object","properties":{"file":{"type":"string"},"line":{"type":"integer"},"issue":{"type":"string"}},"required":["file","line","issue"]}}},"required":["typos"]}\' | jq -e \'.structured_output.typos == []\'`',
			'`--bare` ignore les hooks, plugins, serveurs MCP et CLAUDE.md de la machine de CI, et demande `ANTHROPIC_API_KEY` dans l’environnement.',
			'Le diff arrive sur stdin, donc Claude n’a besoin d’aucune permission `Bash` pour le lire. La doc headless donne la même raison pour son script `lint:claude`.',
			'`jq -e` sort avec 1 quand la dernière valeur vaut `false`. Une seule faute rend la comparaison `false`, tout comme une exécution sans `structured_output`. Lance l’étape avec `set -o pipefail`, pour qu’une erreur de `claude` à la limite `--max-turns 3` la fasse aussi échouer.'
		],
		steps: [
			{
				title: 'Envoie le diff',
				questions: [
					{ q: 'Quel flag lance Claude Code sans fenêtre de chat ?', options: ['`--bare`', '`-p`', '`--output-format json`', '`--max-turns`'], answer: 1, why: 'Le mode print, `-p`, prend un prompt, affiche le résultat et sort.' },
					{ q: 'Comment le diff arrive-t-il à Claude dans le pipeline ?', options: ['Claude lance `git diff main` avec `Bash`', 'Tu le colles dans la chaîne du prompt', 'Sur stdin, par `git diff main |`', 'Claude le lit dans `.git` avec `Read`'], answer: 2, why: 'Le pipe envoie le diff sur stdin, donc Claude l’a avant le premier tour.' },
					{ q: 'Pourquoi envoyer le diff par un pipe plutôt que laisser Claude le chercher ?', options: ['Claude n’a alors besoin d’aucune permission `Bash` pour le lire', 'Un pipe rend chaque token moins cher', '`-p` ne peut lancer aucun outil', 'Le diff serait trop long pour un outil'], answer: 0, why: 'La doc headless donne la même raison pour son script `lint:claude` : l’entrée arrive sur stdin.' },
					{ q: 'Une exécution `-p` fait un appel d’outil qu’aucune règle ni aucun flag n’autorise. Que se passe-t-il ?', options: ['L’exécution attend que tu l’approuves', 'L’exécution sort avec une erreur', 'L’outil tourne, puisque personne ne peut refuser', 'Il est refusé, et l’exécution continue sans ce résultat'], answer: 3, why: 'Personne n’est là pour répondre à une demande de permission, donc l’appel est refusé.' }
				]
			},
			{
				title: 'Demande du JSON',
				questions: [
					{ q: 'Que décrit la racine de ton `--json-schema` ?', options: ['Un objet avec un tableau `typos` obligatoire', 'Un simple tableau de fautes', 'Une chaîne que le script découpe sur les virgules', 'Un booléen qui dit s’il y a des fautes'], answer: 0, why: 'Le schéma de la réponse est `{"type":"object", ... "required":["typos"]}`, et `typos` est un tableau d’objets.' },
					{ q: 'Le modèle signale une faute sans `line`. Cet objet peut-il arriver dans `structured_output` ?', options: ['Oui : les champs absents sont remplis avec `null`', 'Oui, mais seulement dans `result`', 'Non : `structured_output` respecte le schéma, et `line` est obligatoire', 'Non : l’exécution te demande de corriger'], answer: 2, why: 'La sortie structurée respecte ton schéma, et le schéma met `line` dans `required` pour chaque faute.' },
					{ q: 'Qu’est-ce que le schéma rend obligatoire pour chaque faute ?', options: ['Seulement `issue`', '`file`, `line` et `issue`', '`file` et `issue`', 'Rien : tous les champs sont facultatifs'], answer: 1, why: 'Le prompt demande `{"file","line","issue"}`, donc le schéma exige les trois.' },
					{ q: 'Quel type convient à `line` dans le schéma ?', options: ['`string`', '`boolean`', '`array`', '`integer`'], answer: 3, why: 'Un numéro de ligne est un entier, donc la réponse lui donne `"type":"integer"`.' }
				]
			},
			{
				title: 'Pose les limites',
				questions: [
					{ q: 'Combien de tours `claude -p` permet-il par défaut ?', options: ['3', '10', 'Aucune limite', 'Un par outil'], answer: 2, why: '`--max-turns` n’a pas de limite par défaut, donc une exécution sans plafond peut boucler jusqu’au timeout du job.' },
					{ q: 'Tu veux aussi plafonner ce que la vérification peut dépenser. Quel flag fait ça ?', options: ['`--max-turns 1`', '`--bare`', '`--max-budget-usd`', '`--output-format json`'], answer: 2, why: '`--max-budget-usd` arrête l’exécution dès que la dépense estimée atteint le montant.' },
					{ q: 'Quel flag ignore les hooks, plugins, serveurs MCP et CLAUDE.md de la machine de CI ?', options: ['`--max-turns 3`', '`--output-format json`', '`-p`', '`--bare`'], answer: 3, why: 'Le mode bare ignore ce que Claude Code trouverait sinon sur la machine.' },
					{ q: 'De quoi `--bare` a-t-il besoin dans l’environnement ?', options: ['De ta connexion d’abonnement', 'De `ANTHROPIC_API_KEY`', 'D’un fichier `.mcp.json`', 'D’un fichier `CLAUDE.md`'], answer: 1, why: 'Le mode bare ne lit jamais ta connexion d’abonnement, il lui faut donc une clé d’API.' }
				]
			},
			{
				title: 'Échoue sur les fautes',
				questions: [
					{ q: 'Quel filtre fait échouer le script quand la liste n’est pas vide ?', options: ['`jq \'.structured_output.typos\'`', '`jq -e \'.result == ""\'`', '`jq -e \'.structured_output.typos == []\'`', '`jq -e \'.typos | length\'`'], answer: 2, why: 'La comparaison vaut `false` dès qu’il y a une faute, et `jq -e` en fait un code de sortie en échec.' },
					{ q: 'Quel code de sortie renvoie `jq -e` quand la dernière valeur vaut `false` ?', options: ['1', '0', '2', 'Il affiche `false` et sort avec 0'], answer: 0, why: '`jq -e` fixe son code de sortie d’après la dernière valeur qu’il affiche, et `false` donne 1.' },
					{ q: 'L’exécution ne renvoie pas de `structured_output`. Que fait le filtre ?', options: ['Il passe, puisqu’il n’y a pas de faute', 'Il bloque jusqu’au timeout du job', 'Il affiche une liste vide et sort avec 0', 'Il échoue, car la comparaison vaut `false`'], answer: 3, why: 'Un champ absent n’est pas égal à `[]`, donc une exécution cassée fait aussi échouer la vérification.' },
					{ q: 'Pourquoi lancer l’étape avec `set -o pipefail` ?', options: ['Pour que `jq` lise tout le diff', 'Pour qu’une erreur de `claude`, comme la limite de tours, fasse échouer l’étape', 'Pour que le diff arrive sur stdin', 'Pour que `--bare` trouve la clé d’API'], answer: 1, why: 'Sans lui, le code de sortie du pipeline est celui de `jq`, et un échec de `claude` pourrait passer inaperçu.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Tu lances `claude -p "Extract the function names" --output-format json --json-schema \'{...}\'`. Où se trouve l’objet conforme à ton schéma ?',
			options: [
				'Dans le champ `result`, sous forme de chaîne JSON à parser une deuxième fois',
				'Dans le champ `structured_output`, à côté de l’ID de session et de l’usage',
				'Seul sur stdout, avec les métadonnées écrites sur stderr',
				'Dans un fichier nommé d’après l’ID de session sous `~/.claude`'
			],
			answer: 1,
			why: 'Avec `--json-schema`, la réponse JSON contient des métadonnées comme l’ID de session et l’usage, et l’objet validé dans `structured_output`. La réponse texte reste dans `result`.'
		},
		{
			q: 'Un job de CI récupère une pull request et lance `claude -p "Review this"` sans `--bare`. Que charge l’exécution depuis le checkout ?',
			options: [
				'Rien, car `-p` ne lit jamais la configuration du projet',
				'Seulement `CLAUDE.md`, car les hooks exigent une session interactive',
				'Les hooks de `.claude/settings.json` et les serveurs de `.mcp.json`, sans dialogue de confiance',
				'Rien avant d’afficher le dialogue de confiance, donc le job attend jusqu’au timeout'
			],
			answer: 2,
			why: 'Sans `--bare`, `claude -p` découvre la configuration comme une session interactive. Une session `-p` n’affiche ni dialogue de confiance ni demande d’approbation par serveur : une pull request qui ajoute un hook le fait exécuter.'
		},
		{
			q: 'Ton workflow passe `--max-turns 5` dans `claude_args`, et Claude travaille encore au tour 5. Que se passe-t-il ?',
			options: [
				'Claude arrête d’appeler des outils et écrit une réponse finale avec le code 0',
				'L’action poste un commentaire qui te demande d’autoriser plus de tours',
				'L’exécution continue, car la limite ne vaut que pour les sessions interactives',
				'L’exécution sort en erreur, et l’étape échoue'
			],
			answer: 3,
			why: 'La référence CLI dit que `--max-turns` marche en mode print et « Exits with an error when the limit is reached ». Il n’y a pas de limite par défaut : une exécution sans plafond peut boucler jusqu’au timeout du job.'
		}
	],
	recall: {
		q: 'Quels deux flags font renvoyer à `claude -p` des champs qu’un `if` de workflow peut tester, et quel champ les contient ?',
		a: '`--output-format json` avec `--json-schema`. L’objet arrive dans `structured_output`, que `claude-code-action` expose comme `steps.<id>.outputs.structured_output`.'
	},
	sources: [
		{ title: 'Doc Claude Code, Run Claude Code programmatically, lue le 2026-10-17', url: 'https://code.claude.com/docs/en/headless' },
		{ title: 'Doc Claude Code, CLI reference, lue le 2026-10-17', url: 'https://code.claude.com/docs/en/cli-reference' },
		{ title: 'Doc Claude Code, Claude Code GitHub Actions, lue le 2026-10-17', url: 'https://code.claude.com/docs/en/github-actions' },
		{ title: 'anthropics/claude-code-action, examples/test-failure-analysis.yml', url: FLAKY },
		{ title: 'anthropics/claude-code-action, docs/security.md', url: SECURITY },
		{ title: 'Doc GitHub, Script injections, lue le 2026-10-17', url: 'https://docs.github.com/en/actions/concepts/security/script-injections' }
	]
};
