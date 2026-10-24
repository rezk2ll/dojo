const SPEC = 'https://modelcontextprotocol.io/specification/2026-07-28';
const TIME = 'https://github.com/modelcontextprotocol/servers/blob/bbb701e7ac1e57f3edd1c2836b94c5457eaf7b9c/src/time';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'mcp',
	part: 'Outils et agents',
	title: 'Model Context Protocol',
	minutes: 10,
	hook: [
		'Tu écris un petit serveur MCP en Python et tu mets `print("server started")` en haut du fichier pour vérifier qu’il démarre. Claude Code le lance comme sous-processus et lit sa sortie standard, où il attend un message JSON-RPC par ligne.',
		'La spec MCP dit qu’un serveur stdio "MUST NOT write anything to its stdout that is not a valid MCP message". `server started` est du texte brut : **ton serveur enfreint la règle dès sa première ligne**. Les logs vont sur stderr, par exemple avec `print(..., file=sys.stderr)`.'
	],
	terms: [
		{ term: 'Hôte', def: 'L’application où travaille l’utilisateur, comme Claude Code. La spec décrit les hôtes comme des "LLM applications that initiate connections", et un hôte crée un client MCP par serveur MCP.' },
		{ term: 'Client MCP', def: 'Le connecteur, dans l’hôte, qui parle à un serveur. Il envoie des requêtes JSON-RPC comme `tools/list` et `tools/call`.' },
		{ term: 'Serveur MCP', def: 'Un programme qui offre des outils, des ressources ou des prompts via MCP. La spec : "Services that provide context and capabilities".' },
		{ term: 'Transport', def: 'Le chemin des messages JSON-RPC : stdio (un message par ligne sur le stdin et le stdout d’un sous-processus) ou Streamable HTTP (chaque message est un POST vers un seul endpoint).' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['host["Hôte : Claude Code"] --> client["Client MCP"]', 'client -->|"lance uvx mcp-server-time, stdio"| server["Serveur MCP : mcp-server-time"]'],
				highlight: ['host', 'client', 'server'],
				note: 'Le README du serveur de temps le configure avec `"command": "uvx", "args": ["mcp-server-time"]`. Avec le transport stdio, le client lance cette commande comme sous-processus et écrit ses requêtes sur son stdin, un message JSON-RPC par ligne.'
			},
			{
				add: ['client -->|"tools/list"| server', 'server -->|"get_current_time, convert_time, avec inputSchema"| client'],
				highlight: ['client'],
				note: 'Le client demande au serveur la liste de ses outils. Chaque outil revient avec un `name`, une `description` et un `inputSchema` : les trois mêmes parties qu’une définition d’outil dans l’API Messages (jour 17).'
			},
			{
				add: ['client -->|"définitions d’outils"| model["Modèle"]', 'model -->|"tool_use get_current_time"| client', 'client -->|"tools/call name + arguments"| server'],
				highlight: ['model'],
				note: 'La spec dit que les outils sont "model-controlled" : c’est le modèle qui décide quand en appeler un. Quand il demande `get_current_time`, le client envoie `tools/call` avec le nom et les arguments, et le serveur renvoie des blocs `content` et `isError`.'
			},
			{
				add: ['server -.->|"resources/read : données par URI"| client', 'server -.->|"prompts/get : modèle choisi par l’utilisateur"| client'],
				highlight: ['server'],
				note: 'Un serveur peut aussi offrir des ressources et des prompts. Une ressource est une donnée identifiée par une URI, et la spec la dit "application-driven" : l’hôte décide ce qu’il met dans le contexte. Les prompts sont des modèles "user-controlled", affichés par exemple comme commandes slash.'
			},
			{
				add: ['remote["Serveur distant : Streamable HTTP, un seul endpoint"] -.->|"un POST HTTP par message"| client'],
				highlight: ['remote'],
				note: 'Le second transport standard est Streamable HTTP : chaque message est un POST HTTP, et la réponse est un objet JSON ou un flux SSE. Dans la révision 2026-07-28, chaque requête porte la version du protocole et les capacités du client dans son champ `_meta`. Les révisions précédentes ouvraient une session par une poignée de main `initialize`.'
			}
		]
	},
	example: {
		title: 'src/time/src/mcp_server_time/server.py : un serveur stdio officiel avec deux outils',
		repo: 'modelcontextprotocol/servers',
		url: `${TIME}/src/mcp_server_time/server.py#L188-L285`,
		lang: 'python',
		code: `@server.list_tools()
async def list_tools() -> list[Tool]:
    """List available time tools."""
    return [
        Tool(
            name=TimeTools.GET_CURRENT_TIME.value,
            description="Get current time in a specific timezone",
            inputSchema={
                "type": "object",
                "properties": {
                    "timezone": {
                        "type": "string",
                        "description": f"IANA timezone name (e.g., 'America/New_York', 'Europe/London'). Use '{local_tz}' as local timezone if no timezone provided by the user.",
                    }
                },
                "required": ["timezone"],
            },
            annotations=ToolAnnotations(
                readOnlyHint=True,
                destructiveHint=False,
                idempotentHint=True,
                openWorldHint=False,
            ),
        ),
…
@server.call_tool()
async def call_tool(
    name: str, arguments: dict
) -> Sequence[TextContent | ImageContent | EmbeddedResource]:
    """Handle tool calls for time queries."""
    try:
        match name:
            case TimeTools.GET_CURRENT_TIME.value:
                timezone = arguments.get("timezone")
                if not timezone:
                    raise ValueError("Missing required argument: timezone")

                result = time_server.get_current_time(timezone)
…
            case _:
                raise ValueError(f"Unknown tool: {name}")

        return [
            TextContent(type="text", text=json.dumps(result.model_dump(), indent=2))
        ]

    except Exception as e:
        raise ValueError(f"Error processing mcp-server-time query: {str(e)}")

options = server.create_initialization_options()
async with stdio_server() as (read_stream, write_stream):
    await server.run(read_stream, write_stream, options)`,
		notes: [
			'`@server.list_tools()` répond à `tools/list`. La `description` de l’argument `timezone` glisse le fuseau de l’hôte dans le texte, `Use \'{local_tz}\' as local timezone if no timezone provided by the user.`, pour que le modèle sache remplir l’argument quand l’utilisateur ne nomme aucun fuseau.',
			'Les `ToolAnnotations` disent que l’outil ne fait que lire et n’a pas d’effet de bord (`readOnlyHint=True`, `destructiveHint=False`). La spec prévient que ces annotations "should be considered untrusted, unless obtained from a trusted server", puisque n’importe quel serveur peut les écrire.',
			'`@server.call_tool()` répond à `tools/call`. Il aiguille sur `name`, lance la fonction Python et renvoie le résultat en un bloc `TextContent` de JSON. Un nom inconnu lève `ValueError(f"Unknown tool: {name}")`.',
			'Les trois dernières lignes démarrent le transport stdio : `stdio_server()` donne au SDK un flux de lecture sur stdin et un flux d’écriture sur stdout. Tout autre affichage du serveur doit partir sur stderr, que la spec autorise "for any logging purposes".'
		]
	},
	tradeoff: {
		gain: [
			'Tu écris un outil une fois, et n’importe quel hôte MCP peut s’en servir. Le README du serveur de temps donne la même commande `uvx mcp-server-time` pour Claude.app et pour d’autres éditeurs.',
			'Ni le modèle ni l’hôte n’ont besoin de code propre à chaque service : le client découvre les outils à l’exécution avec `tools/list`.'
		],
		cost: [
			'Chaque définition d’outil coûte des tokens d’entrée dans chaque requête (jour 17). La recherche d’outils de Claude Code ne charge que les noms des outils au début de la session pour limiter ce coût.',
			'Un serveur stdio tourne comme processus local avec les droits de ton utilisateur. La doc de Claude Code : "Stdio servers run as local processes on your machine."',
			'Chaque résultat d’outil MCP entre dans le contexte du modèle. Claude Code avertit au-delà de 10 000 tokens de sortie et coupe à 25 000 par défaut, et un texte venu d’un serveur peut porter une injection de prompt (jour 16).'
		]
	},
	task: {
		prompt: 'Tu veux brancher le système de tickets de ton équipe sur Claude Code. Trois besoins : le modèle cherche des tickets de lui-même, l’utilisateur peut joindre un ticket comme contexte grâce à son ID, et l’utilisateur peut lancer un modèle « résume ce sprint » depuis une commande slash. Associe chaque besoin à une primitive MCP et nomme la requête que le client envoie.',
		hint: 'Qui décide quand chacun sert : le modèle, l’application ou l’utilisateur ?',
		answer: [
			'Chercher des tickets de lui-même, c’est un outil : le modèle décide quand l’appeler. Le client envoie `tools/call` avec `name: "search_tickets"` et la recherche dans `arguments`.',
			'Joindre un ticket, c’est une ressource avec une URI comme `tickets://PROJ-123`. L’hôte décide de l’inclure, et le client envoie `resources/read` avec cette URI.',
			'Le modèle de sprint est un prompt, que l’utilisateur choisit. Le client le liste avec `prompts/list` et le récupère avec `prompts/get`, avec des arguments comme le numéro du sprint.',
			'Le serveur doit déclarer les capacités `tools`, `resources` et `prompts` pour que le client sache à quelles requêtes il répond.'
		],
		steps: [
			{
				title: 'Demande qui décide',
				questions: [
					{ q: 'Qui décide quand chercher des tickets ?', options: ['L’utilisateur, à chaque fois', 'L’application hôte', 'Le modèle', 'Le serveur MCP'], answer: 2, why: 'L’exercice dit que le modèle cherche des tickets de lui-même.' },
					{ q: 'Qui décide de mettre un ticket joint dans le contexte ?', options: ['L’application hôte', 'Le modèle', 'Le serveur MCP', 'Personne : il est toujours inclus'], answer: 0, why: 'La spec dit des ressources qu’elles sont "application-driven" : l’hôte décide ce qui va dans le contexte.' },
					{ q: 'Qui choisit le modèle de prompt « résume ce sprint » ?', options: ['Le modèle d’IA', 'L’application hôte', 'Le serveur MCP', 'L’utilisateur, depuis une commande slash'], answer: 3, why: 'La spec dit des prompts qu’ils sont "user-controlled", par exemple affichés en commandes slash.' },
					{ q: 'Comment la spec qualifie-t-elle les outils ?', options: ['"user-controlled"', '"model-controlled"', '"application-driven"', '"server-driven"'], answer: 1, why: 'C’est le modèle qui décide quand appeler un outil.' }
				]
			},
			{
				title: 'Associe la recherche',
				questions: [
					{ q: 'Quelle primitive correspond à « le modèle cherche des tickets de lui-même » ?', options: ['Un outil', 'Une ressource', 'Un prompt', 'Un transport'], answer: 0, why: 'Le modèle décide quand l’appeler : c’est donc un outil.' },
					{ q: 'Quelle requête le client envoie-t-il pour lancer la recherche ?', options: ['`resources/read`', '`prompts/get`', '`tools/list`', '`tools/call`'], answer: 3, why: '`tools/call` porte le nom de l’outil et ses arguments.' },
					{ q: 'Que porte cette requête ?', options: ['Une URI comme `tickets://PROJ-123`', '`name: "search_tickets"` et la recherche dans `arguments`', 'Seulement le numéro du sprint', 'La liste complète des outils'], answer: 1, why: 'Le serveur repère l’outil par `name` et lit la recherche dans `arguments`.' },
					{ q: 'Comment le client apprend-il que `search_tickets` existe ?', options: ['Par `prompts/list`', 'Par le README du serveur', 'Par `tools/list`', 'Par l’entraînement du modèle'], answer: 2, why: 'Le client découvre les outils à l’exécution avec `tools/list`, chacun avec un `name`, une `description` et un `inputSchema`.' }
				]
			},
			{
				title: 'Associe le ticket joint',
				questions: [
					{ q: 'Quelle primitive correspond à « joindre un ticket comme contexte grâce à son ID » ?', options: ['Un outil', 'Un prompt', 'Un transport', 'Une ressource'], answer: 3, why: 'Une ressource est une donnée identifiée par une URI, que l’hôte met dans le contexte.' },
					{ q: 'Comment le ticket est-il identifié ?', options: ['Par une URI comme `tickets://PROJ-123`', 'Par un nom d’outil', 'Par une commande slash', 'Par un numéro de ligne sur stdout'], answer: 0, why: 'Une ressource est une donnée identifiée par une URI.' },
					{ q: 'Quelle requête le client envoie-t-il pour lui ?', options: ['`tools/call`', '`resources/read`, avec cette URI', '`prompts/get`', '`tools/list`'], answer: 1, why: 'Le client lit la ressource grâce à son URI.' },
					{ q: 'Pourquoi n’est-ce pas un outil ?', options: ['Les outils ne peuvent pas renvoyer de texte', 'Les outils exigent Streamable HTTP', 'C’est l’hôte qui décide de l’inclure, pas le modèle', 'Les ressources coûtent moins cher à appeler'], answer: 2, why: 'Un outil est "model-controlled". Ici, le choix revient à l’application.' }
				]
			},
			{
				title: 'Associe le modèle et déclare',
				questions: [
					{ q: 'Quelle primitive correspond au modèle « résume ce sprint » ?', options: ['Un outil', 'Une ressource', 'Un prompt', 'Un modèle de ressource'], answer: 2, why: 'Un prompt est un modèle "user-controlled", affiché par exemple en commande slash.' },
					{ q: 'Comment le client trouve-t-il les modèles disponibles ?', options: ['Avec `prompts/list`', 'Avec `tools/list`', 'Avec `resources/read`', 'Avec la seule poignée de main `initialize`'], answer: 0, why: '`prompts/list` renvoie les prompts que le serveur propose.' },
					{ q: 'Comment le client récupère-t-il le modèle de sprint ?', options: ['`tools/call` avec le numéro du sprint', '`resources/read` avec une URI de sprint', '`prompts/list` avec un filtre', '`prompts/get`, avec des arguments comme le numéro du sprint'], answer: 3, why: '`prompts/get` renvoie le modèle, rempli avec les arguments que tu passes.' },
					{ q: 'Que doit déclarer le serveur pour que le client sache à quelles requêtes il répond ?', options: ['Seulement `tools`', 'Les capacités `tools`, `resources` et `prompts`', 'Un `readOnlyHint` sur chaque outil', 'Rien : le client essaie chaque requête'], answer: 1, why: 'Chaque primitive que le serveur offre demande sa capacité déclarée.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Ton serveur MCP stdio affiche des lignes de debug avec `print()`. Qu’est-ce qui coince ?',
			options: [
				'Rien : le client ignore toute ligne de stdout dont il n’a pas besoin',
				'Les lignes arrivent sur stdout, où le client n’attend que des messages JSON-RPC, un par ligne',
				'Le client les montre au modèle comme résultats d’outils, ce qui coûte des tokens',
				'Le serveur plante, car Python ne peut pas afficher tant que stdin est ouvert'
			],
			answer: 1,
			why: 'Dans le transport stdio, stdout ne transporte que des messages MCP : la spec dit que le serveur "MUST NOT write anything to its stdout that is not a valid MCP message". Les logs vont sur stderr, que le client peut capturer ou ignorer.'
		},
		{
			q: 'Quelle primitive MCP est prévue pour être choisie par l’utilisateur, par exemple comme commande slash ?',
			options: [
				'Un outil, listé avec `tools/list`',
				'Une ressource, lue avec `resources/read`',
				'Un prompt, récupéré avec `prompts/get`',
				'Un modèle de ressource, listé avec `resources/templates/list`'
			],
			answer: 2,
			why: 'La spec dit des prompts qu’ils sont "user-controlled", des outils "model-controlled" et des ressources "application-driven". La différence tient à qui décide quand chacun sert.'
		},
		{
			q: 'Un serveur marque son outil `readOnlyHint: true`. L’hôte peut-il être sûr que l’outil ne modifie rien ?',
			options: [
				'Oui, car le client vérifie chaque appel par rapport à l’annotation',
				'Oui, car la spec interdit à un outil en lecture seule d’écrire des données',
				'Seulement si l’outil déclare aussi `idempotentHint: true`',
				'Seulement si le serveur est fiable : tout serveur peut écrire cette annotation'
			],
			answer: 3,
			why: 'Le serveur écrit lui-même ses annotations, et rien dans le protocole ne les fait respecter. La spec dit qu’elles "should be considered untrusted, unless obtained from a trusted server", et demande aux hôtes l’accord de l’utilisateur avant tout appel d’outil.'
		}
	],
	recall: {
		q: 'Quelles deux requêtes JSON-RPC un client envoie-t-il pour découvrir puis lancer l’outil d’un serveur, et sur quels deux transports standard ?',
		a: '`tools/list` pour connaître les outils (name, description, inputSchema) et `tools/call` avec le nom et les arguments pour en lancer un, sur stdio (un message par ligne avec un sous-processus) ou Streamable HTTP (un POST par message).'
	},
	sources: [
		{ title: 'Spécification MCP 2026-07-28, vue d’ensemble, lue le 2026-10-17', url: SPEC },
		{ title: 'Doc MCP, Architecture overview, lue le 2026-10-17', url: 'https://modelcontextprotocol.io/docs/learn/architecture' },
		{ title: 'Spécification MCP 2026-07-28, Transports et stdio, lue le 2026-10-17', url: `${SPEC}/basic/transports` },
		{ title: 'Spécification MCP 2026-07-28, Tools, lue le 2026-10-17', url: `${SPEC}/server/tools` },
		{ title: 'Spécification MCP 2026-07-28, Resources et Prompts, lue le 2026-10-17', url: `${SPEC}/server/resources` },
		{ title: 'modelcontextprotocol/servers, src/time au commit bbb701e (serveur et README)', url: TIME },
		{ title: 'Doc Claude Code, Connect Claude Code to tools via MCP, lue le 2026-10-17', url: 'https://code.claude.com/docs/en/mcp' }
	]
};
