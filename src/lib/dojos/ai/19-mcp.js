const SPEC = 'https://modelcontextprotocol.io/specification/2026-07-28';
const TIME = 'https://github.com/modelcontextprotocol/servers/blob/bbb701e7ac1e57f3edd1c2836b94c5457eaf7b9c/src/time';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'mcp',
	part: 'Tools and agents',
	title: 'Model Context Protocol',
	minutes: 10,
	hook: [
		'You write a small MCP server in Python and put `print("server started")` at the top of the file to check that it runs. Claude Code launches it as a subprocess and reads its standard output, expecting one JSON-RPC message per line.',
		'The MCP spec says a stdio server "MUST NOT write anything to its stdout that is not a valid MCP message". `server started` is plain text, so **your server breaks that rule on its first line**. Logs belong on stderr, for example with `print(..., file=sys.stderr)`.'
	],
	terms: [
		{ term: 'Host', def: 'The application the user works in, such as Claude Code. The spec calls hosts "LLM applications that initiate connections", and a host creates one MCP client for each MCP server.' },
		{ term: 'MCP client', def: 'The connector inside the host that talks to one server. It sends JSON-RPC requests such as `tools/list` and `tools/call`.' },
		{ term: 'MCP server', def: 'A program that offers tools, resources or prompts over MCP. The spec: "Services that provide context and capabilities".' },
		{ term: 'Transport', def: 'How the JSON-RPC messages travel: stdio (one message per line on a subprocess\'s stdin and stdout) or Streamable HTTP (each message is a POST to one endpoint).' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['host["Host: Claude Code"] --> client["MCP client"]', 'client -->|"launches uvx mcp-server-time, stdio"| server["MCP server: mcp-server-time"]'],
				highlight: ['host', 'client', 'server'],
				note: 'The time server\'s README configures it with `"command": "uvx", "args": ["mcp-server-time"]`. With the stdio transport, the client starts that command as a subprocess and writes requests to its stdin, one JSON-RPC message per line.'
			},
			{
				add: ['client -->|"tools/list"| server', 'server -->|"get_current_time, convert_time, with inputSchema"| client'],
				highlight: ['client'],
				note: 'The client asks the server which tools it has. Each tool comes back with a `name`, a `description` and an `inputSchema`: the same three parts as a tool definition in the Messages API (day 17).'
			},
			{
				add: ['client -->|"tool definitions"| model["Model"]', 'model -->|"tool_use get_current_time"| client', 'client -->|"tools/call name + arguments"| server'],
				highlight: ['model'],
				note: 'The spec calls tools "model-controlled": the model decides when to call one. When it asks for `get_current_time`, the client sends `tools/call` with the name and the arguments, and the server returns `content` blocks and `isError`.'
			},
			{
				add: ['server -.->|"resources/read: data by URI"| client', 'server -.->|"prompts/get: template the user picks"| client'],
				highlight: ['server'],
				note: 'A server can also offer resources and prompts. Resources are data identified by a URI, and the spec calls them "application-driven": the host decides what to put in the context. Prompts are "user-controlled" templates, for example shown as slash commands.'
			},
			{
				add: ['remote["Remote server: Streamable HTTP, one endpoint"] -.->|"HTTP POST per message"| client'],
				highlight: ['remote'],
				note: 'The second standard transport is Streamable HTTP: each message is an HTTP POST, and the reply is a JSON object or an SSE stream. In the 2026-07-28 revision, every request carries the protocol version and the client capabilities in its `_meta` field. Earlier revisions opened a session with an `initialize` handshake.'
			}
		]
	},
	example: {
		title: 'src/time/src/mcp_server_time/server.py: an official stdio server with two tools',
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
			'`@server.list_tools()` answers `tools/list`. The `description` of the `timezone` argument puts the host\'s own zone into the text, `Use \'{local_tz}\' as local timezone if no timezone provided by the user.`, so the model can fill the argument when the user names no zone.',
			'The `ToolAnnotations` say the tool only reads and has no side effects (`readOnlyHint=True`, `destructiveHint=False`). The spec warns that annotations "should be considered untrusted, unless obtained from a trusted server", because any server can write them.',
			'`@server.call_tool()` answers `tools/call`. It matches on `name`, runs the Python function, and returns the result as one `TextContent` block of JSON. An unknown name raises `ValueError(f"Unknown tool: {name}")`.',
			'The last three lines start the stdio transport: `stdio_server()` gives the SDK a read stream on stdin and a write stream on stdout. Everything else the server prints must go to stderr, which the spec allows "for any logging purposes".'
		]
	},
	tradeoff: {
		gain: [
			'You write a tool once and any MCP host can use it. The time server\'s README gives the same `uvx mcp-server-time` command for Claude.app and for other editors.',
			'The model and the host need no code for each service: the client learns the tools at run time from `tools/list`.'
		],
		cost: [
			'Every tool definition is input tokens in every request (day 17). Claude Code\'s tool search loads only tool names at session start to keep this low.',
			'A stdio server runs as a local process with your user\'s rights. The Claude Code docs: "Stdio servers run as local processes on your machine."',
			'Every MCP tool result goes into the model\'s context. Claude Code warns when an MCP tool output passes 10,000 tokens and cuts it at 25,000 by default, and text from a server can carry a prompt injection (day 16).'
		]
	},
	task: {
		prompt: 'You want your team\'s ticket system in Claude Code. Three features: the model searches tickets on its own, the user can attach one ticket as context by its ID, and the user can run a "summarize this sprint" template from a slash command. Map each feature to an MCP primitive and name the request the client sends for it.',
		hint: 'Who decides when each one is used: the model, the application, or the user?',
		answer: [
			'Searching tickets on its own is a tool, because the model decides when to call it. The client sends `tools/call` with `name: "search_tickets"` and the query in `arguments`.',
			'Attaching one ticket is a resource with a URI such as `tickets://PROJ-123`. The host decides to include it, and the client sends `resources/read` with that URI.',
			'The sprint template is a prompt, which the user picks. The client lists it with `prompts/list` and fetches it with `prompts/get`, passing arguments such as the sprint number.',
			'The server must declare the `tools`, `resources` and `prompts` capabilities so that the client knows which requests it answers.'
		]
	},
	quiz: [
		{
			q: 'Your stdio MCP server prints debug lines with `print()`. What goes wrong?',
			options: [
				'Nothing: the client ignores any line on stdout that it does not need',
				'The lines land on stdout, where the client expects only JSON-RPC messages, one per line',
				'The client shows them to the model as tool results, which costs tokens',
				'The server crashes, because Python cannot print while stdin is open'
			],
			answer: 1,
			why: 'In the stdio transport, stdout carries only MCP messages: the spec says the server "MUST NOT write anything to its stdout that is not a valid MCP message". Logs belong on stderr, which the client may capture or ignore.'
		},
		{
			q: 'Which MCP primitive is meant to be picked by the user, for example as a slash command?',
			options: [
				'A tool, listed with `tools/list`',
				'A resource, read with `resources/read`',
				'A prompt, fetched with `prompts/get`',
				'A resource template, listed with `resources/templates/list`'
			],
			answer: 2,
			why: 'The spec calls prompts "user-controlled", tools "model-controlled" and resources "application-driven". The difference is who decides when each one is used.'
		},
		{
			q: 'A server marks its tool `readOnlyHint: true`. Can the host trust that the tool changes nothing?',
			options: [
				'Yes, because the client checks every call against the annotation',
				'Yes, because the spec forbids a read-only tool from writing data',
				'Only if the tool also declares `idempotentHint: true`',
				'Only if the server is trusted: any server can write that annotation'
			],
			answer: 3,
			why: 'The server writes its own annotations, and nothing in the protocol enforces them. The spec says tool annotations "should be considered untrusted, unless obtained from a trusted server", and asks hosts to get user consent before any tool call.'
		}
	],
	recall: {
		q: 'Which two JSON-RPC requests does a client send to find and run a server\'s tool, and over which two standard transports?',
		a: '`tools/list` to learn the tools (name, description, inputSchema) and `tools/call` with the name and arguments to run one, over stdio (one message per line on a subprocess) or Streamable HTTP (one POST per message).'
	},
	sources: [
		{ title: 'MCP specification 2026-07-28, overview, read 2026-10-17', url: SPEC },
		{ title: 'MCP docs, Architecture overview, read 2026-10-17', url: 'https://modelcontextprotocol.io/docs/learn/architecture' },
		{ title: 'MCP specification 2026-07-28, Transports and stdio, read 2026-10-17', url: `${SPEC}/basic/transports` },
		{ title: 'MCP specification 2026-07-28, Tools, read 2026-10-17', url: `${SPEC}/server/tools` },
		{ title: 'MCP specification 2026-07-28, Resources and Prompts, read 2026-10-17', url: `${SPEC}/server/resources` },
		{ title: 'modelcontextprotocol/servers, src/time at bbb701e (server and README)', url: TIME },
		{ title: 'Claude Code docs, Connect Claude Code to tools via MCP, read 2026-10-17', url: 'https://code.claude.com/docs/en/mcp' }
	]
};
