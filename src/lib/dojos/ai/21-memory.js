const SDK = 'https://github.com/anthropics/anthropic-sdk-python/blob/bcd55fe1d3f0f1240765f8cef04295b67337f55a';
const MEMTOOL = `${SDK}/src/anthropic/lib/tools/_beta_builtin_memory_tool.py`;
const CC_MEMORY = 'https://code.claude.com/docs/en/memory';
const API_MEMORY = 'https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'memory',
	part: 'Tools and agents',
	title: 'Memory across sessions',
	minutes: 10,
	hook: [
		'Monday, in Claude Code, you type "use pnpm, not npm" and the session goes well. Tuesday you open a new session in the same repo, and the first thing Claude runs is `npm install`.',
		'The model weights are the same on Tuesday as on Monday. The Claude Code docs: "Each Claude Code session begins with a fresh context window." The API docs: "The Messages API is stateless, which means that you always send the full conversational history to the API."',
		'Between two requests, the model keeps no record of what you typed. **What looks like memory is a file that a program saved and loads back into the next request.**'
	],
	terms: [
		{ term: 'Stateless', def: 'The API keeps no conversation between calls. Each request carries the whole history the model should see, and nothing else reaches the model.' },
		{ term: 'Harness', def: 'The program around the model, such as Claude Code or your own script. It builds each request, runs the tools the model asks for, and decides what to save to disk.' },
		{ term: 'CLAUDE.md', def: 'A Markdown file of instructions you write. Claude Code reads the ones in your working directory and the directories above it at the start of every session.' },
		{ term: 'Memory tool', def: 'An API tool, `memory_20250818`, that lets the model ask for file operations under `/memories`. Your code runs each operation on storage you choose.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['u1["Session 1: Remember that Acme Corp prefers email follow-ups"] --> m1["Model replies with tool_use: memory create /memories/acme.xml"]', 'm1 --> h1["Your handler writes ./memory/memories/acme.xml"]'],
				highlight: ['m1', 'h1'],
				note: 'The model has no access to your disk, so it returns a `tool_use` block that asks for a `create` command on a path under `/memories`. Your program runs the command and sends back a `tool_result`, as in any tool call (day 17).'
			},
			{
				add: ['h1 --> end1["Session ends: the messages list is dropped"]'],
				highlight: ['end1'],
				note: 'When your script exits, the list of messages it was sending is gone. The model weights are the same as before session 1. The only trace of session 1 is the file your handler wrote.'
			},
			{
				add: ['u2["Session 2: new messages list, same tools entry"] --> sys["API adds: ALWAYS VIEW YOUR MEMORY DIRECTORY BEFORE DOING ANYTHING ELSE."]', 'sys --> v2["Model asks: memory view /memories"]', 'v2 --> h1'],
				highlight: ['sys', 'v2'],
				note: 'When the `memory` tool is in the request, the API adds an instruction to the system prompt that starts with "IMPORTANT: ALWAYS VIEW YOUR MEMORY DIRECTORY BEFORE DOING ANYTHING ELSE." The model asks to `view` the directory, your handler lists `acme.xml`, and the model asks to read it.'
			},
			{
				add: ['cc["Claude Code at launch"] --> md["CLAUDE.md files from the working directory and every parent"]', 'cc --> idx["MEMORY.md: first 200 lines or 25KB"]', 'idx -.->|"read on demand"| topic["Topic files such as feedback_testing.md"]'],
				highlight: ['md', 'idx'],
				note: 'Claude Code is a harness that does the same job with two sets of files. It loads your CLAUDE.md files, and the first 200 lines or 25KB of its own auto memory index, `MEMORY.md`, in `~/.claude/projects/<project>/memory/`. It reads the topic files listed in that index only when it needs them.'
			},
			{
				add: ['chat["Instruction typed only in the chat"] -->|"/compact summarizes it"| lost["May be gone after compaction"]', 'md -->|"re-read from disk after /compact"| md'],
				highlight: ['chat', 'lost'],
				note: 'Compaction can drop a rule inside one session too. The docs: if an instruction disappeared after compaction, "it was given only in conversation". After `/compact`, Claude Code re-reads the project-root CLAUDE.md from disk. A rule you only typed in the chat has no file to come back from.'
			}
		]
	},
	example: {
		title: 'anthropic-sdk-python: the local filesystem memory tool maps /memories to a folder',
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
			'Line 7 sets the real folder: with the default `base_path`, the path `/memories/acme.xml` that the model sees is `./memory/memories/acme.xml` on your disk. The API docs: "Memory lives entirely in your application."',
			'Lines 18 to 21 resolve the path and refuse it if it lands outside the memory root. The [memory tool docs](' + API_MEMORY + '#path-traversal-protection) give the attack this blocks: "A malicious path such as `/memories/../../secrets.env` can reach files outside the `/memories` directory."',
			'The `os.open` line in `create` passes `O_EXCL`, so writing to a file that already exists raises "File ... already exists". The docs call that error the reference behavior and say overwriting instead is a valid choice for your own handler.',
			'The `os.fsync(fd)` call pushes the bytes to disk before `create` returns "File created successfully at:" to the model.'
		]
	},
	tradeoff: {
		gain: [
			'A fact saved in one session reaches the next one with no retraining: a `create` call writes a file, and the next request loads it.',
			'Claude Code memories are plain Markdown files. `/memory` lists your CLAUDE.md files and opens the auto memory folder for editing.',
			'At start, Claude Code reads at most 200 lines or 25KB of `MEMORY.md` and opens topic files on demand, so a large memory folder does not fill the context.'
		],
		cost: [
			'Each loaded line is sent as input tokens with every request of the session. The docs target under 200 lines per CLAUDE.md because "Longer files consume more context and reduce adherence."',
			'The docs: Claude Code treats CLAUDE.md "as context, not enforced configuration", with "no guarantee of strict compliance". To block an action every time, the docs point to a PreToolUse hook.',
			'Claude Code auto memory is machine-local: "Files are not shared across machines or cloud environments."',
			'With the API memory tool, your handler must cap file sizes, expire old files, check paths and strip sensitive data. The docs list all four as "your responsibility".'
		]
	},
	task: {
		prompt: 'You start Claude Code in `~/work/shop/api`. These files exist: `~/.claude/CLAUDE.md`, `~/work/CLAUDE.md`, `~/work/shop/CLAUDE.md`, `~/work/shop/api/CLAUDE.local.md` and `~/work/shop/api/src/billing/CLAUDE.md`. Which ones are in the context at launch, in what order, and when does the billing one load?',
		hint: 'Read the "How CLAUDE.md files load" section of the memory docs: files above the working directory and files below it are treated differently.',
		answer: [
			'At launch: `~/.claude/CLAUDE.md` (user scope), then `~/work/CLAUDE.md`, then `~/work/shop/CLAUDE.md`, then `~/work/shop/api/CLAUDE.local.md`. The docs order the tree "from the filesystem root down to your working directory", so the file closest to where you launched is read last.',
			'Claude Code concatenates the four files. None of them replaces another, so a conflict between two of them is yours to fix: the docs say Claude "may pick one arbitrarily".',
			'`src/billing/CLAUDE.md` is below the working directory, so it is not loaded at launch. It loads the first time Claude reads, writes or edits a file in `src/billing/`.',
			'Run `/context` to check: the launch files are listed under Memory files. The billing file is not in that list until it loads, and then a `Loaded` line with its path appears in the terminal.'
		]
	},
	quiz: [
		{
			q: 'Early in a long Claude Code session you typed "never edit files in migrations/". After `/compact`, Claude edits a migration. What is the likely cause?',
			options: [
				'The rule was only in the chat, and compaction replaced the chat with a summary',
				'The model weights were reset by `/compact` and lost what they learned in the session',
				'The context window was full, so Claude Code stopped reading CLAUDE.md files',
				'Auto memory was turned off, so Claude Code deleted the rule from the project'
			],
			answer: 0,
			why: 'Compaction summarizes the conversation, and an instruction typed only in the chat can be lost there. Claude Code re-reads the project-root CLAUDE.md from disk after `/compact`, so a rule written in that file comes back.'
		},
		{
			q: 'With the API memory tool, the model creates `/memories/prefs.xml`. Where is that file stored?',
			options: [
				'On the API servers, in a folder tied to your API key',
				'Wherever your tool handler maps the `/memories` prefix',
				'Inside the prompt cache, for as long as the cache entry lives',
				'In the model weights, updated after each conversation ends'
			],
			answer: 1,
			why: 'The memory tool runs on the client: the model only sends a `tool_use` block, and your handler runs the command on storage you choose. The SDK local tool maps `/memories` to `./memory/memories` by default.'
		},
		{
			q: 'Your Claude Code auto memory index `MEMORY.md` has grown to 350 short lines. What does a new session load at start?',
			options: [
				'All 350 lines, since the file is far below the 4 MiB limit',
				'Nothing, since Claude Code skips an index over 200 lines',
				'The first 200 lines; lines 201 to 350 are not loaded at start',
				'The last 200 lines, since those hold the most recent memories'
			],
			answer: 2,
			why: 'Claude Code loads the first 200 lines or 25KB of `MEMORY.md`, whichever comes first. Content past that limit is dropped at session start. The 4 MiB limit applies to CLAUDE.md files.'
		}
	],
	recall: {
		q: 'Yesterday\'s Claude Code session learned that you use pnpm. What carries that fact into today\'s session, and how much of it loads at start?',
		a: 'A file on disk: the auto memory index `MEMORY.md` in `~/.claude/projects/<project>/memory/`, of which the first 200 lines or 25KB load. The model weights keep nothing from yesterday.'
	},
	sources: [
		{ title: 'Claude Code docs, How Claude remembers your project, read 2026-10-17', url: CC_MEMORY },
		{ title: 'Claude API docs, Memory tool, read 2026-10-17', url: API_MEMORY },
		{ title: 'Claude API docs, Working with the Messages API, read 2026-10-17', url: 'https://platform.claude.com/docs/en/build-with-claude/working-with-messages' },
		{ title: 'anthropic-sdk-python, _beta_builtin_memory_tool.py', url: MEMTOOL }
	]
};
