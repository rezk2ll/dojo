const CC = 'https://github.com/anthropics/claude-code/blob/c017428c8c27e604840435048d5bce6a9a22c040';
const EXPLORER = `${CC}/plugins/feature-dev/agents/code-explorer.md`;
const COMMAND = `${CC}/plugins/feature-dev/commands/feature-dev.md`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'subagents-in-claude-code',
	part: 'Claude Code',
	title: 'Subagents in Claude Code',
	minutes: 10,
	hook: [
		'You ask Claude Code why the auth tests fail. It runs `npm test`, and 2,000 lines of passing tests and stack traces land in your conversation. An hour later you ask for a one-line fix, and that log still sits in the context window next to your instructions (day 3).',
		'A subagent runs the same suite in a context window of its own. The Claude Code docs: the subagent "does that work in its own context and returns only the summary". **Your conversation receives the three failing tests, and the 2,000 lines stay with the subagent.**'
	],
	terms: [
		{ term: 'Subagent', def: 'A separate Claude instance that Claude Code starts with the `Agent` tool. It has its own context window, system prompt and tools, and it returns one report to the conversation that started it.' },
		{ term: 'Agent file', def: 'A Markdown file with YAML frontmatter that defines a subagent. The body after the closing `---` is its system prompt. Only `name` and `description` are required.' },
		{ term: 'Delegation message', def: 'The task prompt Claude writes when it hands work to a subagent. The subagent reads this message instead of your conversation history (a fork, started with `/subtask`, is the exception).' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['user["You: why do the auth tests fail?"] --> main["Main conversation: has the description of every subagent"]'],
				highlight: ['user', 'main'],
				note: 'Claude picks a subagent from your request, the `description` field of each agent file and the current context. Every description takes room in the context, so the docs ask you to keep them short. Above 15,000 tokens of combined custom descriptions, Claude Code shows a warning at startup.'
			},
			{
				add: ['main -->|"Agent tool + delegation message"| sub["test-runner subagent: a fresh context window"]'],
				highlight: ['sub'],
				note: 'The subagent starts with its own system prompt, the delegation message, your CLAUDE.md files and a git status snapshot. It does not see your history or the files Claude already read. A rule you typed earlier in the chat, like "ignore `vendor/`", reaches it only if Claude puts it in the delegation message.'
			},
			{
				add: ['sub --> tools["Only its tools field: Read, Grep, Glob, Bash"]'],
				highlight: ['tools'],
				note: 'The `tools` field is an allowlist, and `disallowedTools` is a denylist. Some tools never reach a subagent, such as `AskUserQuestion` and `EnterPlanMode`, so it cannot stop to ask you a question. A background subagent shows its permission prompts in your main session with its name on them.'
			},
			{
				add: ['tools -->|"2,000 lines of test output"| sub', 'sub -->|"one report: 3 failing tests"| main'],
				highlight: ['sub', 'main'],
				note: 'The test log fills the subagent context window and never enters yours. Claude Code scans the final report before Claude reads it, and inserts a backslash into text that imitates a `<system-reminder>` tag. Your main conversation then reads the report with your full CLAUDE.md loaded.'
			},
			{
				add: ['main -->|"SendMessage with the agent ID"| resume["Same subagent resumed, with its own history"]'],
				highlight: ['resume'],
				note: 'Each `Agent` call creates a new instance. To continue earlier work, Claude resumes the subagent with `SendMessage` and the agent ID it got back. The built-in Explore and Plan agents return no ID, so Claude cannot resume them.'
			}
		]
	},
	example: {
		title: 'plugins/feature-dev/agents/code-explorer.md: a read-only explorer',
		repo: 'anthropics/claude-code',
		url: `${EXPLORER}#L1-L51`,
		lang: 'markdown',
		code: `---
name: code-explorer
description: Deeply analyzes existing codebase features by tracing execution paths, mapping architecture layers, understanding patterns and abstractions, and documenting dependencies to inform new development
tools: Glob, Grep, LS, Read, NotebookRead, WebFetch, TodoWrite, WebSearch, KillShell, BashOutput
model: sonnet
color: yellow
---

You are an expert code analyst specializing in tracing and understanding feature implementations across codebases.

## Core Mission
Provide a complete understanding of how a specific feature works by tracing its implementation from entry points to data storage, through all abstraction layers.
…
## Output Guidance

Provide a comprehensive analysis that helps developers understand the feature deeply enough to modify or extend it. Include:

- Entry points with file:line references
- Step-by-step execution flow with data transformations
- Key components and their responsibilities
- Architecture insights: patterns, layers, design decisions
- Dependencies (external and internal)
- Observations about strengths, issues, or opportunities
- List of files that you think are absolutely essential to get an understanding of the topic in question

Structure your response for maximum clarity and usefulness. Always include specific file paths and line numbers.`,
		notes: [
			'Line 3, `description`, is what Claude compares with a request when it chooses a subagent. The plugin does not leave that choice to chance: its `/feature-dev` command says "Launch 2-3 code-explorer agents in parallel" ([feature-dev.md line 41](' + COMMAND + '#L41)).',
			'Line 4, `tools`, lists no `Edit`, `Write` or `Bash`, so the agent can search and read files but cannot change them. The tools reference read on 2026-10-17 has no tool named `LS`, `NotebookRead`, `KillShell` or `BashOutput`. A subagent fails to launch only when no entry resolves, and `Glob`, `Grep` and `Read` resolve here.',
			'Line 5, `model: sonnet`, is an alias. Claude Code takes the model from the `model` parameter of the `Agent` call first, then this field, then `CLAUDE_CODE_SUBAGENT_MODEL`, then the main conversation model.',
			'Lines 9 to 51 are the system prompt. The subagent gets this text plus environment details such as the working directory, and not the Claude Code system prompt. The output section asks for file:line references and a short list of files, which the command then tells the main conversation to read.',
			'The file sits in a plugin `agents/` folder, so it registers as `feature-dev:code-explorer`. Plugin subagents ignore `hooks`, `mcpServers` and `permissionMode`. To use those fields, copy the file into `.claude/agents/` (this project) or `~/.claude/agents/` (all your projects).'
		]
	},
	tradeoff: {
		gain: [
			'The test log, the search results and the files the subagent read stay in its context window, and your conversation receives the report alone.',
			'A `tools` line such as `Read, Grep, Glob` makes a reviewer that cannot edit files, whatever the delegation message asks.',
			'A subagent with `model: haiku` runs a search or a log scan on a lower-cost model while the main conversation keeps its own model.'
		],
		cost: [
			'A subagent starts from a fresh context and may need time to gather what the main conversation already knew. The docs advise the main conversation when "Latency matters".',
			'Each subagent sends its own requests, and they count toward the same usage limits as your main conversation.',
			'Five parallel subagents that each return a long report put five long reports into your context. The docs warn that this "can consume significant context".',
			'A subagent has no `AskUserQuestion` tool, so it cannot stop in the middle of a task to ask you what you meant.'
		]
	},
	task: {
		prompt: 'Write `.claude/agents/test-runner.md` for your project. Claude should delegate to it after code changes. It runs the test suite and returns only the failing tests with their error messages. It must not edit files, and it must never run `git push`. Write the frontmatter, a two-line system prompt, and say where the `git push` rule goes.',
		hint: 'A `disallowedTools` entry like `Bash(git push *)` removes more than you think. Which file holds rules that block one command for subagents too?',
		answer: [
			'Frontmatter: `name: test-runner`, `description: Runs the test suite and reports only failing tests with their error messages. Use proactively after code changes.`, `tools: Read, Grep, Glob, Bash`. The docs suggest "use proactively" in the description to encourage delegation.',
			'Body: "Run the project test command. Reply with each failing test name, its file and the first error line, and nothing about passing tests." The subagent gets this body as its system prompt, plus environment details such as the working directory.',
			'Leaving `Edit` and `Write` out of `tools` blocks file edits through those tools. `Bash` stays, because the agent has to run the tests. A shell command can still write a file, so the body says what to do and nothing more.',
			'The `git push` rule goes in `permissions.deny` in `.claude/settings.json` as `Bash(git push *)`. The same entry in `disallowedTools` would remove the whole `Bash` tool, and a settings deny rule applies to the main conversation and to subagents.'
		],
		steps: [
			{
				title: 'Write the frontmatter',
				questions: [
					{ q: 'Which frontmatter fields does an agent file need at minimum?', options: ['`name` and `tools`', '`name` and `description`', '`description` and `model`', '`name` alone'], answer: 1, why: 'Only `name` and `description` are required. A file with a `name` but no `description` is skipped.' },
					{ q: 'Which field does Claude read to decide when to delegate to `test-runner`?', options: ['`name`', '`tools`', '`description`', 'The first line of the body'], answer: 2, why: 'Claude compares your request and the context with the `description` of each agent file.' },
					{ q: 'You want Claude to delegate after every code change. What do you add to the description?', options: ['"Use proactively after code changes"', 'The full list of test commands', 'A `model: haiku` line', 'A note that it must never push'], answer: 0, why: 'The docs suggest "use proactively" in the description to encourage delegation.' },
					{ q: 'Why keep the description short?', options: ['Claude only reads its first ten words', 'YAML cannot hold long strings', 'A long description becomes the system prompt', 'Every description takes room in the main context'], answer: 3, why: 'Every subagent description sits in the main conversation, and Claude Code warns above 15,000 tokens of custom descriptions.' }
				]
			},
			{
				title: 'Pick the tools',
				questions: [
					{ q: 'Which `tools` line fits a test runner that must not edit files?', options: ['`Read, Edit, Write, Bash`', '`Read, Grep, Glob`', '`Read, Grep, Glob, Bash`', '`Bash` alone'], answer: 2, why: 'It needs `Bash` to run the tests, and leaving out `Edit` and `Write` blocks edits through those tools.' },
					{ q: 'What kind of list is the `tools` field?', options: ['An allowlist', 'A denylist', 'A list of tools that ask for permission', 'A hint Claude may ignore'], answer: 0, why: 'The subagent gets only the tools you list. `disallowedTools` is the denylist.' },
					{ q: '`Bash` stays in the list. What can the agent still do with it?', options: ['Nothing: `Bash` without `Write` is read-only', 'Ask you a question with `AskUserQuestion`', 'Resume itself with `SendMessage`', 'Write a file through a shell command'], answer: 3, why: 'A shell command can still write a file, so the body says what to do and nothing more.' },
					{ q: 'Can the test runner stop mid-run to ask you which suite you meant?', options: ['Yes, through `AskUserQuestion`', 'No: that tool never reaches a subagent', 'Yes, if `Bash` is in its tools', 'Only when it runs in the background'], answer: 1, why: 'Some tools, such as `AskUserQuestion` and `EnterPlanMode`, never reach a subagent.' }
				]
			},
			{
				title: 'Write the system prompt',
				questions: [
					{ q: 'Where does the system prompt go in the agent file?', options: ['In a `prompt` field of the frontmatter', 'In `.claude/settings.json`', 'In the body after the closing `---`', 'In the delegation message'], answer: 2, why: 'The body after the closing `---` is the subagent system prompt.' },
					{ q: 'What should the two lines ask the agent to return?', options: ['Each failing test, its file and the first error line, nothing on passing tests', 'The full test log, so nothing is lost', 'A summary of every test, passing or failing', 'A patch that fixes the first failure'], answer: 0, why: 'The 2,000 lines stay with the subagent, and your conversation gets the failures alone.' },
					{ q: 'Besides this body, what does the subagent get in its system prompt?', options: ['The Claude Code system prompt', 'Environment details such as the working directory', 'Your whole conversation history', 'Every file the main conversation read'], answer: 1, why: 'The subagent gets the body plus environment details, not the Claude Code system prompt.' },
					{ q: 'Earlier in the chat you said "ignore `vendor/`". Does the subagent know?', options: ['Yes, it reads the whole conversation', 'Yes, rules typed in chat go to every subagent', 'No, and there is no way to tell it', 'Only if Claude puts it in the delegation message'], answer: 3, why: 'The subagent reads the delegation message instead of your history.' }
				]
			},
			{
				title: 'Place the git push rule',
				questions: [
					{ q: 'You add `disallowedTools: Bash(git push *)`. What happens?', options: ['Only `git push` is blocked', 'The whole `Bash` tool is removed', 'The entry is ignored', '`git push` asks for permission first'], answer: 1, why: 'In `disallowedTools`, an entry with a specifier still removes the whole tool, and the agent can no longer run the tests.' },
					{ q: 'Where does the `git push` rule go instead?', options: ['In the agent body, as a sentence', 'In the `tools` field', 'In `permissions.deny` in `.claude/settings.json`', 'In the `description` field'], answer: 2, why: 'A settings deny rule blocks that one command and keeps `Bash`.' },
					{ q: 'How do you write the deny entry?', options: ['`Bash(git push *)`', '`git push`', '`Bash`', '`deny: push`'], answer: 0, why: 'The entry names the tool and the command pattern, so only matching commands are blocked.' },
					{ q: 'Who does the settings deny rule apply to?', options: ['Only the test-runner subagent', 'Only the main conversation', 'Only background subagents', 'The main conversation and subagents'], answer: 3, why: 'A settings deny rule applies to both, so the push is blocked whoever tries it.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'You add `.claude/agents/db-reader.md` with `name: db-reader` and `tools: Read, Grep`, but no `description`. What does Claude Code do?',
			options: [
				'It loads the agent and uses the first line of the body as its description',
				'It skips the file and writes the reason to the debug log',
				'It loads the agent, which Claude can only start through an @-mention',
				'It stops at startup with an error that names the missing field'
			],
			answer: 1,
			why: 'Only `name` and `description` are required, and a file with a `name` but no `description` is skipped without a message in the session. The reason appears in the debug log when you start Claude Code with `--debug`.'
		},
		{
			q: 'A subagent must keep `Bash` but never run `git push`. You add `disallowedTools: Bash(git push *)` to its file. What happens?',
			options: [
				'Only commands that match `git push *` are blocked',
				'The entry is ignored, because `disallowedTools` takes no specifiers',
				'`git push` now asks you for permission before it runs',
				'The whole `Bash` tool is removed from that subagent'
			],
			answer: 3,
			why: 'In `disallowedTools`, an entry with a specifier still removes the whole tool. To keep `Bash` and block one command, the docs say to add `Bash(git push *)` to `permissions.deny` in your settings.'
		},
		{
			q: 'Claude starts your custom `test-runner` subagent. What is in its context window at the start?',
			options: [
				'Its own system prompt, the delegation message, your CLAUDE.md files and a git status snapshot',
				'The full conversation so far, so it knows what you asked an hour ago',
				'The Claude Code system prompt plus every file the main conversation has read',
				'The delegation message alone, with no system prompt and no CLAUDE.md files'
			],
			answer: 0,
			why: 'A subagent that is not a fork starts with a fresh context. It gets its own prompt plus environment details, the task message Claude writes, the CLAUDE.md hierarchy and git status. Your history and the files Claude already read stay in the main conversation.'
		}
	],
	recall: {
		q: 'Where do you save a subagent for one project, and which frontmatter field does Claude read to decide when to use it?',
		a: 'In the project `.claude/agents/` folder, for example `.claude/agents/test-runner.md`. Claude reads its `description` field.'
	},
	sources: [
		{ title: 'Claude Code docs, Create custom subagents, read 2026-10-17', url: 'https://code.claude.com/docs/en/sub-agents' },
		{ title: 'Claude Code docs, Tools reference, read 2026-10-17', url: 'https://code.claude.com/docs/en/tools-reference' },
		{ title: 'anthropics/claude-code, plugins/feature-dev/agents/code-explorer.md', url: EXPLORER },
		{ title: 'anthropics/claude-code, plugins/feature-dev/commands/feature-dev.md', url: COMMAND }
	]
};
