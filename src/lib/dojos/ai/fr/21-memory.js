const SDK = 'https://github.com/anthropics/anthropic-sdk-python/blob/bcd55fe1d3f0f1240765f8cef04295b67337f55a';
const MEMTOOL = `${SDK}/src/anthropic/lib/tools/_beta_builtin_memory_tool.py`;
const CC_MEMORY = 'https://code.claude.com/docs/en/memory';
const API_MEMORY = 'https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'memory',
	part: 'Outils et agents',
	title: 'La mémoire d’une session à l’autre',
	minutes: 10,
	hook: [
		'Lundi, dans Claude Code, tu tapes « use pnpm, not npm » et la session se passe bien. Mardi, tu ouvres une nouvelle session dans le même dépôt, et la première commande que Claude lance est `npm install`.',
		'Le modèle n’a pas bougé pendant la nuit. La doc de Claude Code : "Each Claude Code session begins with a fresh context window." Celle de l’API : "The Messages API is stateless, which means that you always send the full conversational history to the API."',
		'Le modèle ne retient donc rien d’une requête à l’autre. **Ce qui ressemble à de la mémoire, c’est un fichier qu’un programme a enregistré et qu’il recharge dans la requête suivante.**'
	],
	terms: [
		{ term: 'Stateless', def: 'L’API ne garde aucune conversation entre deux appels. Chaque requête porte tout l’historique que le modèle doit voir, et rien d’autre ne lui parvient.' },
		{ term: 'Harness', def: 'Le programme autour du modèle, comme Claude Code ou ton propre script. Il construit chaque requête, exécute les outils que le modèle demande et choisit ce qu’il écrit sur le disque.' },
		{ term: 'CLAUDE.md', def: 'Un fichier Markdown d’instructions que tu écris. Claude Code lit ceux de ton répertoire de travail et des répertoires au-dessus au début de chaque session.' },
		{ term: 'Outil memory', def: 'Un outil de l’API, `memory_20250818`, avec lequel le modèle demande des opérations sur des fichiers sous `/memories`. Ton code exécute chaque opération sur le stockage de ton choix.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['u1["Session 1 : retiens qu’Acme Corp préfère les relances par e-mail"] --> m1["Le modèle répond par un tool_use : memory create /memories/acme.xml"]', 'm1 --> h1["Ton handler écrit ./memory/memories/acme.xml"]'],
				highlight: ['m1', 'h1'],
				note: 'Le modèle n’a pas accès à ton disque, alors il renvoie un bloc `tool_use` qui demande une commande `create` sur un chemin sous `/memories`. Ton programme exécute la commande et renvoie un `tool_result`, comme pour tout appel d’outil (jour 17).'
			},
			{
				add: ['h1 --> end1["Fin de session : la liste des messages est jetée"]'],
				highlight: ['end1'],
				note: 'Quand ton script s’arrête, la liste de messages qu’il envoyait disparaît. Les poids du modèle sont les mêmes qu’avant la session 1. Il ne reste de la session 1 que le fichier écrit par ton handler.'
			},
			{
				add: ['u2["Session 2 : nouvelle liste de messages, même entrée tools"] --> sys["L’API ajoute : ALWAYS VIEW YOUR MEMORY DIRECTORY BEFORE DOING ANYTHING ELSE."]', 'sys --> v2["Le modèle demande : memory view /memories"]', 'v2 --> h1'],
				highlight: ['sys', 'v2'],
				note: 'Quand l’outil `memory` figure dans la requête, l’API ajoute au prompt système une consigne qui commence par "IMPORTANT: ALWAYS VIEW YOUR MEMORY DIRECTORY BEFORE DOING ANYTHING ELSE." Le modèle demande un `view` du dossier, ton handler liste `acme.xml`, et le modèle demande à le lire.'
			},
			{
				add: ['cc["Claude Code au lancement"] --> md["Les CLAUDE.md du répertoire de travail et de chaque parent"]', 'cc --> idx["MEMORY.md : 200 premières lignes ou 25KB"]', 'idx -.->|"lus à la demande"| topic["Fichiers de sujet comme feedback_testing.md"]'],
				highlight: ['md', 'idx'],
				note: 'Claude Code est un harness qui fait le même travail avec deux familles de fichiers. Il charge tes CLAUDE.md, puis les 200 premières lignes ou les 25KB de l’index de sa mémoire automatique, `MEMORY.md`, dans `~/.claude/projects/<project>/memory/`. Il n’ouvre les fichiers de sujet listés dans cet index que quand il en a besoin.'
			},
			{
				add: ['chat["Consigne tapée seulement dans le chat"] -->|"/compact la résume"| lost["Peut avoir disparu après la compaction"]', 'md -->|"relu depuis le disque après /compact"| md'],
				highlight: ['chat', 'lost'],
				note: 'La compaction peut aussi faire tomber une règle au sein d’une même session. D’après la doc, une consigne disparue après une compaction a souvent été donnée "only in conversation". Après `/compact`, Claude Code relit depuis le disque le CLAUDE.md à la racine du projet. Une règle que tu as seulement tapée dans le chat n’a aucun fichier d’où revenir.'
			}
		]
	},
	example: {
		title: 'anthropic-sdk-python : l’outil memory local fait correspondre /memories à un dossier',
		repo: 'anthropics/anthropic-sdk-python',
		url: `${MEMTOOL}#L387-L498`,
		lang: 'python',
		code: `class BetaLocalFilesystemMemoryTool(BetaAbstractMemoryTool):
    """File-based memory storage implementation for Claude conversations"""

    def __init__(self, base_path: str = "./memory"):
        super().__init__()
        self.base_path = Path(base_path)
        self.memory_root = self.base_path / "memories"
        _secure_mkdir(self.memory_root)

    def _validate_path(self, path: str) -> Path:
        """Validate and resolve memory paths"""
        if not path.startswith("/memories"):
            raise ToolError(f"Path must start with /memories, got: {path}")

        relative_path = path[len("/memories") :].lstrip("/")
        full_path = self.memory_root / relative_path if relative_path else self.memory_root

        resolved_path = full_path.resolve()
        resolved_root = self.memory_root.resolve()
        if resolved_path != resolved_root and not str(resolved_path).startswith(str(resolved_root) + os.sep):
            raise ToolError(f"Path {path} would escape /memories directory")

        _validate_no_symlink_escape(resolved_path, self.memory_root)

        return resolved_path
…
    @override
    def create(self, command: BetaMemoryTool20250818CreateCommand) -> str:
        full_path = self._validate_path(command.path)

        _secure_mkdir(full_path.parent)

        try:
            fd = os.open(full_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, _FILE_CREATE_MODE)
            try:
                os.write(fd, command.file_text.encode("utf-8"))
                os.fsync(fd)
            finally:
                os.close(fd)
        except FileExistsError as err:
            raise ToolError(f"File {command.path} already exists") from err

        return f"File created successfully at: {command.path}"`,
		notes: [
			'La ligne 7 fixe le vrai dossier : avec le `base_path` par défaut, le chemin `/memories/acme.xml` que voit le modèle correspond à `./memory/memories/acme.xml` sur ton disque. La doc de l’API : "Memory lives entirely in your application."',
			'Les lignes 18 à 21 résolvent le chemin et le refusent s’il sort de la racine de la mémoire. La [doc de l’outil memory](' + API_MEMORY + '#path-traversal-protection) donne l’attaque bloquée ici : "A malicious path such as `/memories/../../secrets.env` can reach files outside the `/memories` directory."',
			'Dans `create`, la ligne `os.open` passe `O_EXCL` : écrire un fichier qui existe déjà lève « File ... already exists ». La doc présente cette erreur comme le comportement de référence, et dit qu’écraser le fichier est aussi un choix valable pour ton propre handler.',
			'L’appel `os.fsync(fd)` pousse les octets sur le disque avant que `create` renvoie "File created successfully at:" au modèle.'
		]
	},
	tradeoff: {
		gain: [
			'Un fait enregistré dans une session arrive dans la suivante sans réentraînement : un appel `create` écrit un fichier, et la requête suivante le charge.',
			'Les souvenirs de Claude Code sont de simples fichiers Markdown. `/memory` liste tes CLAUDE.md et ouvre le dossier de la mémoire automatique pour l’éditer.',
			'Au départ, Claude Code lit au plus 200 lignes ou 25KB de `MEMORY.md` et ouvre les fichiers de sujet à la demande, donc un gros dossier de mémoire ne remplit pas le contexte.'
		],
		cost: [
			'Chaque ligne chargée part en tokens d’entrée avec chaque requête de la session. La doc vise moins de 200 lignes par CLAUDE.md, car "Longer files consume more context and reduce adherence."',
			'La doc dit que Claude Code traite CLAUDE.md "as context, not enforced configuration", sans "guarantee of strict compliance". Pour bloquer une action à coup sûr, elle renvoie vers un hook PreToolUse.',
			'La mémoire automatique de Claude Code reste sur ta machine : "Files are not shared across machines or cloud environments."',
			'Avec l’outil memory de l’API, ton handler doit plafonner la taille des fichiers, faire expirer les vieux, vérifier les chemins et retirer les données sensibles. La doc range ces quatre points sous "your responsibility".'
		]
	},
	task: {
		prompt: 'Tu lances Claude Code dans `~/work/shop/api`. Ces fichiers existent : `~/.claude/CLAUDE.md`, `~/work/CLAUDE.md`, `~/work/shop/CLAUDE.md`, `~/work/shop/api/CLAUDE.local.md` et `~/work/shop/api/src/billing/CLAUDE.md`. Lesquels sont dans le contexte au lancement, dans quel ordre, et quand celui de billing se charge-t-il ?',
		hint: 'Lis la section « How CLAUDE.md files load » de la doc memory : les fichiers au-dessus du répertoire de travail et ceux en dessous ne sont pas traités pareil.',
		answer: [
			'Au lancement : `~/.claude/CLAUDE.md` (portée utilisateur), puis `~/work/CLAUDE.md`, puis `~/work/shop/CLAUDE.md`, puis `~/work/shop/api/CLAUDE.local.md`. La doc range l’arborescence "from the filesystem root down to your working directory" : le fichier le plus proche de l’endroit où tu as lancé Claude est lu en dernier.',
			'Claude Code met les quatre fichiers bout à bout. Aucun ne remplace un autre, donc un conflit entre deux d’entre eux, c’est à toi de le régler : la doc prévient que Claude "may pick one arbitrarily".',
			'`src/billing/CLAUDE.md` est sous le répertoire de travail, il n’est donc pas chargé au lancement. Il se charge la première fois que Claude lit, écrit ou modifie un fichier dans `src/billing/`.',
			'Lance `/context` pour vérifier : les fichiers du lancement apparaissent sous Memory files. Celui de billing n’y est pas tant qu’il n’est pas chargé, puis une ligne `Loaded` avec son chemin s’affiche dans le terminal.'
		]
	},
	quiz: [
		{
			q: 'Au début d’une longue session Claude Code, tu as tapé « never edit files in migrations/ ». Après `/compact`, Claude modifie une migration. Quelle est la cause probable ?',
			options: [
				'La règle n’était que dans le chat, et la compaction a remplacé le chat par un résumé',
				'`/compact` a remis à zéro les poids du modèle et effacé ce qu’il avait appris',
				'La fenêtre de contexte était pleine, donc Claude Code a cessé de lire les CLAUDE.md',
				'La mémoire automatique était coupée, donc Claude Code a supprimé la règle du projet'
			],
			answer: 0,
			why: 'La compaction résume la conversation, et une consigne tapée seulement dans le chat peut s’y perdre. Claude Code relit depuis le disque le CLAUDE.md de la racine du projet après `/compact`, donc une règle écrite dans ce fichier revient.'
		},
		{
			q: 'Avec l’outil memory de l’API, le modèle crée `/memories/prefs.xml`. Où ce fichier est-il stocké ?',
			options: [
				'Sur les serveurs de l’API, dans un dossier lié à ta clé',
				'Là où ton handler fait pointer le préfixe `/memories`',
				'Dans le cache de prompt, tant que l’entrée du cache vit',
				'Dans les poids du modèle, mis à jour en fin de conversation'
			],
			answer: 1,
			why: 'L’outil memory tourne côté client : le modèle n’envoie qu’un bloc `tool_use`, et ton handler exécute la commande sur le stockage de ton choix. L’outil local du SDK fait pointer `/memories` vers `./memory/memories` par défaut.'
		},
		{
			q: 'L’index de ta mémoire automatique Claude Code, `MEMORY.md`, fait maintenant 350 lignes courtes. Que charge une nouvelle session au départ ?',
			options: [
				'Les 350 lignes, car le fichier est loin de la limite de 4 MiB',
				'Rien, car Claude Code ignore un index de plus de 200 lignes',
				'Les 200 premières ; les lignes 201 à 350 ne sont pas chargées',
				'Les 200 dernières, car ce sont les souvenirs les plus récents'
			],
			answer: 2,
			why: 'Claude Code charge les 200 premières lignes ou les 25KB de `MEMORY.md`, selon la limite atteinte en premier. Le reste n’est pas chargé au début de la session. La limite de 4 MiB concerne les fichiers CLAUDE.md.'
		}
	],
	recall: {
		q: 'Ta session Claude Code d’hier a appris que tu utilises pnpm. Qu’est-ce qui porte ce fait jusqu’à la session d’aujourd’hui, et quelle part en est chargée au départ ?',
		a: 'Un fichier sur le disque : l’index de mémoire automatique `MEMORY.md` dans `~/.claude/projects/<project>/memory/`, dont les 200 premières lignes ou 25KB sont chargées. Les poids du modèle ne gardent rien de la veille.'
	},
	sources: [
		{ title: 'Doc Claude Code, How Claude remembers your project, lue le 2026-10-17', url: CC_MEMORY },
		{ title: 'Doc de l’API Claude, Memory tool, lue le 2026-10-17', url: API_MEMORY },
		{ title: 'Doc de l’API Claude, Working with the Messages API, lue le 2026-10-17', url: 'https://platform.claude.com/docs/en/build-with-claude/working-with-messages' },
		{ title: 'anthropic-sdk-python, _beta_builtin_memory_tool.py', url: MEMTOOL }
	]
};
