const CC = 'https://github.com/anthropics/claude-code/blob/c017428c8c27e604840435048d5bce6a9a22c040';
const PYSDK = 'https://github.com/modelcontextprotocol/python-sdk/blob/9f66f376d486e84e9810b368cf8be9d5908661ab/CLAUDE.md';
const LLAMA = 'https://github.com/ggml-org/llama.cpp/blob/27c7a769da1671c97b2e3f6cb88704a6e1e0d0cd/CLAUDE.md';
const MEMORY = 'https://code.claude.com/docs/en/memory';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'claude-md',
	part: 'Claude Code',
	title: 'CLAUDE.md',
	minutes: 10,
	hook: [
		'Lundi, tu dis à Claude Code « utilise pnpm, pas npm », et il s’exécute. Mardi, tu ouvres une nouvelle session dans le même dépôt, tu demandes une dépendance, et il lance `npm install`.',
		'La doc : "Each Claude Code session begins with a fresh context window." Chaque session part d’un contexte vide, et ta phrase de lundi est restée dans celui de lundi. **Une phrase écrite dans un fichier `CLAUDE.md` est relue au début de chaque session.**'
	],
	terms: [
		{ term: 'CLAUDE.md', def: 'Un fichier Markdown d’instructions que Claude Code lit au début de chaque session. Celui du projet se trouve dans `./CLAUDE.md` ou `./.claude/CLAUDE.md` et se commite avec le code.' },
		{ term: 'CLAUDE.local.md', def: 'Un `CLAUDE.md` personnel à la racine du projet, que tu ajoutes au `.gitignore`. Il se charge juste après le `CLAUDE.md` du même dossier.' },
		{ term: 'Import', def: 'Une ligne comme `@docs/git-instructions.md` dans un `CLAUDE.md`. Claude Code insère le fichier nommé dans le contexte au lancement, jusqu’à quatre niveaux d’imports.' },
		{ term: 'Règle à chemins', def: 'Un fichier Markdown dans `.claude/rules/` avec une liste `paths:` dans son en-tête YAML. Il ne se charge que quand Claude lit ou modifie un fichier qui correspond à un des globs.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['managed["/etc/claude-code/CLAUDE.md (politique gérée)"] --> user["~/.claude/CLAUDE.md (toi, tous les projets)"]'],
				highlight: ['managed', 'user'],
				note: 'Tu lances `claude` dans `repo/services/api`. Les fichiers les plus larges passent en premier : le fichier de politique qu’un admin déploie sous Linux dans `/etc/claude-code/CLAUDE.md`, puis ton fichier utilisateur `~/.claude/CLAUDE.md`. Aucun réglage ne peut exclure le fichier géré.'
			},
			{
				add: ['user --> root["repo/CLAUDE.md, puis repo/CLAUDE.local.md"]', 'root --> cwd["repo/services/api/CLAUDE.md"]'],
				highlight: ['root', 'cwd'],
				note: 'Viennent ensuite tous les `CLAUDE.md` de la racine du disque jusqu’au dossier de travail : `repo/CLAUDE.md` avant `repo/services/api/CLAUDE.md`. Les fichiers s’ajoutent bout à bout, le plus proche ne remplace pas son parent. Dans chaque dossier, `CLAUDE.local.md` passe après `CLAUDE.md`.'
			},
			{
				add: ['root -->|"@docs/git-instructions.md"| imp["Fichier importé, inséré au lancement"]'],
				highlight: ['imp'],
				note: 'Une ligne `@docs/git-instructions.md` charge ce fichier au lancement, avec un chemin relatif au fichier qui contient l’import. Découper un fichier de 600 lignes en imports ne change rien au contexte : selon la doc, les fichiers importés "also load at launch". Entre backticks, `@README` reste du texte.'
			},
			{
				add: ['cwd -.->|"Claude lit src/web/app.ts"| lazy["repo/services/api/src/web/CLAUDE.md et les .claude/rules/*.md qui correspondent"]'],
				highlight: ['lazy'],
				note: 'Un `CLAUDE.md` dans un sous-dossier du dossier de travail ne se charge pas au lancement. Il arrive la première fois que Claude lit, écrit ou modifie un fichier de ce sous-dossier. Une règle avec `paths: ["src/web/**"]` se charge de la même façon, quand Claude touche un fichier qui correspond.'
			},
			{
				add: ['cwd --> ctx["Contexte : prompt système, puis les fichiers en message utilisateur"]', 'ctx -->|"/compact"| reread["CLAUDE.md racine relu depuis le disque"]'],
				highlight: ['ctx', 'reread'],
				note: 'La doc : "CLAUDE.md content is delivered as a user message after the system prompt". Claude essaie de suivre ce message, sans garantie. Après `/compact`, Claude Code relit le `CLAUDE.md` à la racine du projet. Les fichiers imbriqués et les règles à chemins ne reviennent que quand Claude retouche un fichier qui correspond.'
			}
		]
	},
	example: {
		title: 'CLAUDE.md d’anthropics/claude-code : ce qu’une modification de workflow doit garder',
		repo: 'anthropics/claude-code',
		url: `${CC}/CLAUDE.md#L1-L40`,
		lang: 'markdown',
		code: `# CLAUDE.md

Guidance for Claude Code and other coding agents working in this repository.

## Security hardening for GitHub Actions

Workflow jobs in this repository that call Claude run with three protections.
Keep them when you add or edit a workflow.

1. **Egress-firewall runner.** The job has \`runs-on: ubuntu-24.04-firewall\`,
   a GitHub-hosted runner that filters the job's outbound network traffic. Do
   not move a job that calls Claude to another runner.
2. **Network allow list.** \`.github/egress-firewall.yaml\` lists the hosts
   those jobs may reach, besides any that GitHub's firewall allows by default.
   Keep \`mode: enforce\`, which is what makes the firewall block the rest. Follow
   that file's header when you add a host.
3. **Auto permission mode.** Every step that runs the Claude Code action
   (\`uses: anthropics/claude-code-action\`, or a local action with a
   \`claude_args\` input) passes \`--permission-mode auto\` in \`claude_args\`. A tool
   call that needs permission and that the allowed tools do not cover then runs
   only if Claude Code's safety review passes it. Allow only the tools the job
   needs, and keep any \`--disallowedTools\` list a step has. Use \`claude-opus-4-6\`
   or a newer model: on an older one Claude Code falls back to its default
   permission mode.

\`claude.yml\` answers \`@claude\` mentions. The Claude Code action sets
\`--permission-mode acceptEdits\` for those, and the \`--permission-mode auto\` in
the workflow's \`claude_args\`, which comes after it, replaces it.

\`.github/workflows/workflow-hardening.yml\` fails when a job that runs the Claude
Code action or mentions \`ANTHROPIC_FEDERATION_RULE_ID\` breaks protection 1 or 3,
or when the allow list is missing, empty, not \`mode: enforce\`, or names a host
with \`*\`. It cannot see a job that calls Claude another way, so check new
workflows by hand too. If a job cannot meet protection 1 or 3, add it with the
reason to the matching exemption table in
\`.github/scripts/check_workflow_hardening.py\`. A job in \`EXEMPT_FROM_AUTO_MODE\`
must set no permission mode at all. Do not skip or weaken the check.

Keep each workflow's \`permissions:\` block minimal, and never print tokens or
environment variables in workflow logs.`,
		notes: [
			'La ligne 10 donne la valeur exacte à garder, `runs-on: ubuntu-24.04-firewall`. La doc demande des instructions "concrete enough to verify", par exemple "Run `npm test` before committing" plutôt que "Test your changes". Claude peut comparer un workflow à la ligne 10 en le lisant.',
			'Les lignes 30 à 37 renvoient à `workflow-hardening.yml`, un job de CI qui échoue quand un workflow casse la protection 1 ou 3. Les règles du fichier ne font qu’orienter ce que Claude écrit. Le job de CI refuse la pull request même si Claude les a ignorées.',
			'Le fichier fait 40 lignes. La doc vise "under 200 lines per CLAUDE.md file", parce que "Longer files consume more context and reduce adherence".',
			'D’autres dépôts gardent un seul fichier pour tous les agents. Le [CLAUDE.md de modelcontextprotocol/python-sdk](' + PYSDK + ') tient en une ligne, `@AGENTS.md` : un import qui charge `AGENTS.md` au lancement. Celui de llama.cpp met un lien Markdown à la place, qui n’est pas un import : Claude doit ouvrir `AGENTS.md` avec un outil.'
		]
	},
	tradeoff: {
		gain: [
			'Tu écris une commande de build ou une convention une fois, et chaque session dans le dépôt démarre avec, pour tous ceux qui clonent le dépôt.',
			'Le `CLAUDE.md` à la racine du projet est relu depuis le disque après `/compact`, alors qu’une consigne tapée seulement dans le chat se perd dans le résumé.',
			'Les règles à chemins de `.claude/rules/` gardent les règles frontend hors du contexte tant que Claude ne touche pas un fichier de `src/web/`.'
		],
		cost: [
			'Chaque ligne se charge à chaque session, imports compris : un fichier de 600 lignes coûte le même contexte en un morceau ou en six.',
			'`CLAUDE.md` arrive chez Claude comme un message utilisateur, et Claude peut quand même lancer une commande que le fichier interdit. Une règle qui doit tenir va dans une règle `deny` ou un hook `PreToolUse`.',
			'Quand deux fichiers se contredisent, la doc prévient que "Claude may pick one arbitrarily" : il faut supprimer les vieilles lignes.'
		]
	},
	task: {
		prompt: 'Le `CLAUDE.md` de ton dépôt fait 450 lignes : 120 lignes décrivent l’arborescence, 200 lignes sont des règles React qui ne concernent que `src/web/`, 20 lignes donnent les commandes de build et de test, et une ligne dit « N’ouvre jamais `.env`, il contient les clés de prod ». Tu y gardes aussi ton URL de staging perso. Prévois le nouveau découpage : ce qui reste, ce qui part ailleurs, et ce qui sort du fichier.',
		hint: 'Pour chaque bloc : Claude en a-t-il besoin à chaque session, peut-il le retrouver en lisant le code, et faut-il que ça tienne même si Claude l’ignore ?',
		answer: [
			'Garde les 20 lignes de commandes de build et de test dans `CLAUDE.md` : Claude en a besoin à chaque session et ne peut pas toujours les deviner.',
			'Déplace les 200 lignes React dans `.claude/rules/web.md` avec `paths: ["src/web/**"]`. Elles ne se chargent plus que quand Claude lit ou modifie un fichier de `src/web/`.',
			'Supprime les 120 lignes d’arborescence. Claude peut lister les dossiers lui-même, et la doc cite l’arborescence parmi ce que `/doctor` propose de couper.',
			'Mets l’URL de staging dans `CLAUDE.local.md` et ajoute ce fichier au `.gitignore`. Pour `.env`, garde la ligne et ajoute une règle `deny` comme `Read(./.env)` dans `.claude/settings.json`, que le client applique. Le fichier tombe à environ 25 lignes.'
		],
		steps: [
			{
				title: 'Garde ce qu’il faut à chaque session',
				questions: [
					{ q: 'Où vont les 20 lignes de commandes de build et de test ?', options: ['Dans `.claude/rules/build.md`', 'Elles restent dans `CLAUDE.md`', 'Hors du fichier : Claude peut les deviner', 'Dans `CLAUDE.local.md`'], answer: 1, why: 'Il en faut à chaque session, et c’est le rôle du `CLAUDE.md` du projet.' },
					{ q: 'Pourquoi ces lignes restent-elles ?', options: ['Claude en a besoin à chaque session et ne peut pas toujours les deviner', 'C’est le bloc le plus long du fichier', 'Un fichier de règles ne peut pas contenir de commandes', 'La CI les lit dans `CLAUDE.md`'], answer: 0, why: 'Une commande que Claude se tromperait à deviner vaut une ligne à chaque session.' },
					{ q: 'Comment la doc veut-elle qu’une consigne soit écrite ?', options: ['La plus courte possible, comme « Test your changes »', 'En majuscules, pour qu’elle ressorte', 'Assez concrète pour se vérifier, comme « Run `npm test` before committing »', 'Comme un lien vers une page de wiki'], answer: 2, why: 'La doc demande des consignes "concrete enough to verify".' },
					{ q: 'Quelle taille la doc vise-t-elle pour un `CLAUDE.md` ?', options: ['Moins de 450 lignes', 'Moins de 25 lignes', 'Moins de 1 000 lignes', 'Moins de 200 lignes'], answer: 3, why: 'La doc vise "under 200 lines per CLAUDE.md file".' }
				]
			},
			{
				title: 'Cible les règles React',
				questions: [
					{ q: 'Où vont les 200 lignes de règles React ?', options: ['Dans `.claude/rules/web.md` avec `paths: ["src/web/**"]`', 'Dans cinq fichiers insérés par des imports `@path`', 'Dans `CLAUDE.local.md`', 'Dans `~/.claude/CLAUDE.md`'], answer: 0, why: 'Une règle à chemins porte un texte qui ne concerne que certains fichiers.' },
					{ q: 'Quand ce fichier de règle se charge-t-il ?', options: ['Au lancement, avec les autres fichiers', 'Quand Claude lit ou modifie un fichier de `src/web/`', 'Après chaque `/compact`', 'Quand tu lances `/memory`'], answer: 1, why: 'Une règle avec `paths:` ne se charge que quand Claude touche un fichier qui correspond.' },
					{ q: 'Pourquoi ne pas les mettre dans un fichier importé comme `@docs/react.md` ?', options: ['Les imports sont plafonnés à 20 lignes', 'Les imports ne marchent que dans le fichier utilisateur', 'Les fichiers importés se chargent aussi au lancement, donc ils coûtent le même contexte', 'Claude ne sait pas suivre un import'], answer: 2, why: 'La doc : les fichiers importés "also load at launch". Découper ne réduit pas le contexte.' },
					{ q: 'Après `/compact`, le fichier de règles React revient-il ?', options: ['Oui, il est relu tout de suite depuis le disque', 'Seulement quand un fichier qui correspond est de nouveau touché', 'Non, plus jamais dans cette session', 'Seulement si tu lances `/memory`'], answer: 1, why: 'Après `/compact`, seul le `CLAUDE.md` racine du projet est relu. Les règles à chemins reviennent quand un fichier qui correspond est touché.' }
				]
			},
			{
				title: 'Coupe ce que Claude sait lire seul',
				questions: [
					{ q: 'Que fais-tu des 120 lignes d’arborescence ?', options: ['Tu les gardes dans `CLAUDE.md`', 'Tu les mets dans une règle à chemins', 'Tu les importes depuis un fichier à part', 'Tu les supprimes'], answer: 3, why: 'Elles coûtent du contexte à chaque session et ne disent rien que Claude ne puisse trouver.' },
					{ q: 'Pourquoi peuvent-elles partir ?', options: ['Une arborescence casse le parseur Markdown', 'Claude peut lister les dossiers lui-même', 'Une arborescence doit rester privée', 'Tout bloc de plus de 100 lignes est ignoré'], answer: 1, why: 'Claude lit le code et liste les dossiers avec ses propres outils.' },
					{ q: 'Quelle commande, d’après la doc, propose de couper l’arborescence ?', options: ['`/doctor`', '`/compact`', '`/memory`', '`/context`'], answer: 0, why: 'La doc cite l’arborescence parmi ce que `/doctor` propose de couper.' },
					{ q: 'Pourquoi un fichier plus court compte-t-il, au-delà des tokens ?', options: ['Claude Code refuse les fichiers de plus de 200 lignes', 'Git refuse les gros fichiers Markdown', 'Un fichier plus long "reduce adherence"', 'Les imports cessent de marcher après 200 lignes'], answer: 2, why: 'La doc : "Longer files consume more context and reduce adherence".' }
				]
			},
			{
				title: 'Déplace le perso et le critique',
				questions: [
					{ q: 'Où va ton URL de staging perso ?', options: ['Elle reste dans `CLAUDE.md`', 'Dans `CLAUDE.local.md`, ajouté au `.gitignore`', 'Dans `.claude/settings.json`', 'Dans `.claude/rules/staging.md`'], answer: 1, why: 'Elle est à toi, pas à l’équipe, donc elle va dans le fichier perso qui n’est pas commité.' },
					{ q: 'Quand `CLAUDE.local.md` se charge-t-il ?', options: ['Juste après le `CLAUDE.md` du même dossier', 'Avant tous les autres fichiers', 'Seulement quand Claude l’ouvre avec un outil', 'Seulement après `/compact`'], answer: 0, why: 'Dans chaque dossier, `CLAUDE.local.md` s’ajoute après `CLAUDE.md`.' },
					{ q: 'Pourquoi la ligne « N’ouvre jamais `.env` » ne suffit-elle pas seule ?', options: ['Claude ne sait pas lire les fichiers cachés', 'Les lignes qui parlent de fichiers sont sautées', 'Elle est après la ligne 200, donc elle ne se charge pas', '`CLAUDE.md` est un message utilisateur que Claude suit sans garantie'], answer: 3, why: 'Claude essaie de suivre `CLAUDE.md`, mais rien ne l’y oblige.' },
					{ q: 'Qu’ajoutes-tu pour que `.env` reste fermé même si Claude ignore la ligne ?', options: ['La même ligne en majuscules', 'Une copie de la ligne dans `CLAUDE.local.md`', 'Une règle `deny` comme `Read(./.env)` dans `.claude/settings.json`', 'La ligne répétée dans `~/.claude/CLAUDE.md`'], answer: 2, why: 'Les règles de permission sont vérifiées par le client avant que l’outil tourne, quoi que Claude ait décidé.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Tu lances `claude` dans `repo/services/api`. Quels fichiers du projet sont dans le contexte avant que tu tapes quoi que ce soit ?',
			options: [
				'`repo/CLAUDE.md` et `repo/services/api/CLAUDE.md`, le parent en premier',
				'Seulement `repo/services/api/CLAUDE.md`, car le plus proche remplace ses parents',
				'Tous les `CLAUDE.md` du dépôt, y compris `repo/services/web/CLAUDE.md`',
				'Seulement `repo/CLAUDE.md`, car Claude Code lit le fichier à la racine git'
			],
			answer: 0,
			why: 'Claude Code charge les `CLAUDE.md` du dossier de travail et de tous les dossiers au-dessus, mis bout à bout depuis la racine. Ceux des dossiers voisins ou enfants ne se chargent que quand Claude y lit un fichier.'
		},
		{
			q: 'Ton `CLAUDE.md` de 600 lignes prend trop de contexte. Tu le découpes en cinq fichiers chargés par des imports `@path`. Qu’est-ce qui change dans le contexte ?',
			options: [
				'Les imports ne se chargent que quand Claude les juge utiles',
				'Rien : les fichiers importés sont insérés dans le contexte au lancement',
				'Seul le premier import se charge, les autres attendent un fichier qui correspond',
				'Les imports sont résumés au lancement, donc ils coûtent moins de tokens'
			],
			answer: 1,
			why: 'Les fichiers importés sont chargés au lancement, à côté du fichier qui les importe : le nombre de tokens ne bouge pas. Pour charger un texte seulement quand il sert, il faut une règle à chemins dans `.claude/rules/` ou un skill.'
		},
		{
			q: '`CLAUDE.md` dit « Ne lance jamais `git push`, je pousse moi-même ». Pendant une longue tâche, Claude lance `git push origin main`. Qu’est-ce qui l’empêche de recommencer ?',
			options: [
				'Écrire la ligne en majuscules tout en haut du fichier',
				'Déplacer la ligne de `CLAUDE.md` vers `CLAUDE.local.md`',
				'Une règle `deny` pour `Bash(git push *)` dans les réglages',
				'Répéter la ligne dans `~/.claude/CLAUDE.md` aussi'
			],
			answer: 2,
			why: '`CLAUDE.md` arrive comme un message utilisateur, et Claude le suit sans garantie. Les règles de permission des réglages sont vérifiées par le client avant que l’outil tourne, quoi que Claude ait décidé.'
		}
	],
	recall: {
		q: 'Quels `CLAUDE.md` se chargent quand tu lances Claude Code dans un dossier, et quand se charge celui d’un sous-dossier ?',
		a: 'Le fichier géré, `~/.claude/CLAUDE.md` et chaque `CLAUDE.md` de la racine du disque jusqu’au dossier de travail se chargent au lancement. Celui d’un sous-dossier se charge quand Claude lit ou modifie un fichier dedans pour la première fois.'
	},
	sources: [
		{ title: 'Doc Claude Code, How Claude remembers your project, lue le 2026-10-17', url: MEMORY },
		{ title: 'Doc Claude Code, Context window : ce qui survit à la compaction, lue le 2026-10-17', url: 'https://code.claude.com/docs/en/context-window' },
		{ title: 'anthropics/claude-code, CLAUDE.md', url: `${CC}/CLAUDE.md` },
		{ title: 'modelcontextprotocol/python-sdk, CLAUDE.md', url: PYSDK },
		{ title: 'ggml-org/llama.cpp, CLAUDE.md', url: LLAMA }
	]
};
