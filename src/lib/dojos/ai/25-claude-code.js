const CC = 'https://github.com/anthropics/claude-code/blob/c017428c8c27e604840435048d5bce6a9a22c040';
const REVIEW = 'https://github.com/anthropics/claude-cookbooks/blob/b2b0aa1ff7d8980b005b225d3802969c87bedad5/claude_agent_sdk/scheduled_repository_reviewer/scheduled_review.py';
const WORKS = 'https://code.claude.com/docs/en/how-claude-code-works';
const TOOLS = 'https://code.claude.com/docs/en/tools-reference';
const LOOP = 'https://code.claude.com/docs/en/agent-sdk/agent-loop';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'claude-code',
	part: 'Claude Code',
	title: 'Claude Code in one session',
	minutes: 10,
	hook: [
		'You open a terminal in your repository, run `claude`, and type "Fix the failing tests in auth.ts". The claude-code README gives the start as "Navigate to your project directory and run `claude`." You do not say which file to open or which command to run, and at the end the tests pass.',
		'In between, Claude ran `npm test`, read `auth.ts` and `auth.test.ts`, edited `auth.ts` and ran `npm test` again. Each of those steps was a tool call from the loop of day 18, and Claude Code wrote every message, tool call and result to a JSONL file under `~/.claude/projects/`.',
		'In Manual mode, the `npm test` runs and the edit each stopped to ask you first, and the two reads did not. The JSONL file is the **session**: `Esc` twice rewinds its edits, and `claude --resume` reopens it after you close the terminal.'
	],
	terms: [
		{ term: 'Session', def: 'One Claude Code conversation, tied to the directory you started it in. Claude Code saves it locally as JSONL, so `claude --continue` or `claude --resume` reopens it under the same session ID.' },
		{ term: 'Tool call', def: 'A request from the model to run one built-in tool, such as `Read`, `Edit` or `Bash`, with its input. Claude Code runs it and sends the result back to the model.' },
		{ term: 'Turn', def: 'One round trip: the model asks for tool calls, the tools run, and the results go back. The loop ends when the model answers with text and no tool call.' },
		{ term: 'Checkpoint', def: 'A snapshot of a file that Claude Code takes before Claude edits it. Pressing `Esc` twice rewinds to an earlier state.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['you["You: Fix the failing tests in auth.ts"] --> ctx["Context: your message, CLAUDE.md, MEMORY.md, tool definitions"]'],
				highlight: ['you', 'ctx'],
				note: 'Before the first model call, the context already holds more than your sentence: your CLAUDE.md files, the first 200 lines or 25KB of MEMORY.md, the system instructions and the definitions of the tools.'
			},
			{
				add: ['ctx --> t1["Turn 1: Bash npm test, 3 failures"]', 't1 --> t2["Turn 2: Read auth.ts and auth.test.ts"]'],
				highlight: ['t1', 't2'],
				note: 'In this phase, which the docs call "gather context", Claude picks each tool from what the last result showed. In Manual mode, `npm test` asks you first, because it is not in the built-in read-only set (`ls`, `cat`, `grep`, read-only forms of `git`) that runs with no prompt, while `Read` inside the working directory never asks.'
			},
			{
				add: ['t2 --> snap["Checkpoint: snapshot of auth.ts"]', 'snap --> t3["Turn 3: Edit auth.ts, then Bash npm test, all pass"]'],
				highlight: ['snap', 't3'],
				note: '`Edit` replaces an exact `old_string` with a `new_string`, with no fuzzy matching, and Claude Code snapshots the file first. In Manual mode the edit asks you, and "Yes, and don\'t ask again" for edits lasts until the session ends.'
			},
			{
				add: ['t3 --> done["Final turn: text only, Fixed the auth bug, all three tests pass now"]', 'done --> log[("~/.claude/projects/...jsonl")]'],
				highlight: ['done', 'log'],
				note: 'The loop stops when the model answers with no tool call. That was four turns, three of them with tool calls. The transcript on disk is what `--resume` reads back and what `Esc` twice rewinds through.'
			},
			{
				add: ['esc["You press Esc"] -.->|"cancels the running tool call"| t3'],
				highlight: ['esc'],
				note: 'You can step in at any point: `Esc` stops Claude and cancels the running tool call. A message you type and send with `Enter` while Claude works is queued, and Claude reads it as soon as its current tool calls finish.'
			}
		]
	},
	example: {
		title: 'claude-cookbooks: a repository review session run from a script',
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
			'The [Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview) gives a program "the same tools, agent loop, and context management that power Claude Code". This cookbook script runs one review session of a repository on a schedule, and its options are the choices you make by hand in a terminal session.',
			'Lines 238 to 246 set the session up: the working directory is the repository, `tools` limits the session to `Read`, `Glob` and `Grep` (line 71), and `dontAsk` mode "Auto-denies every call that would otherwise prompt", since nobody is there to answer.',
			'Lines 251 and 252 cap the session at 40 turns on a first run (line 77) and at a budget in dollars. The [agent loop docs](' + LOOP + ') say `max_turns` "counts tool-use turns only". Line 262 passes the saved session ID, so the next run continues the same conversation, as `claude --resume` does.',
			'Lines 331 to 342 read the session as it happens. Each `AssistantMessage` holds text or a tool call, and line 341 records the name of every tool Claude asked for. A terminal session records the same steps in its JSONL transcript.',
			'Lines 343 to 350 read the `ResultMessage` that closes the loop: the session ID, a `subtype` that says whether the task succeeded or hit a limit, the number of turns, the cost, and the calls that permissions denied.'
		]
	},
	tradeoff: {
		gain: [
			'You describe the outcome and Claude finds the files. The docs: "You don\'t need to specify which files to read or what commands to run."',
			'Edits are reversible within the session: Claude Code snapshots each file before an edit, and `Esc` twice rewinds to an earlier state.',
			'The whole session is a file on disk, so `--continue` picks up where you stopped, and `--fork-session` copies the history into a new session ID and leaves the original unchanged.'
		],
		cost: [
			'Checkpoints cover local files, and the docs say: "Actions that affect remote systems (databases, APIs, deployments) can\'t be checkpointed."',
			'Each turn adds tool output to the context. When the context fills, Claude Code clears older tool outputs and then summarizes, and "detailed instructions from early in the conversation may be lost".',
			'In Manual mode every edit and most shell commands stop for your answer, so a long task waits whenever you leave the terminal.'
		]
	},
	task: {
		prompt: 'You type "Rename the `getUser` helper to `fetchUser` everywhere and make sure the tests still pass" in a Manual mode session. List the tool calls you expect in order, mark the ones that ask you first, and say what you do if the second edit goes wrong.',
		hint: 'Group the steps as the docs do: gather context, take action, verify results. Check each tool against the permission table: reads, Bash commands, file edits.',
		answer: [
			'Gather context: `grep -rn getUser src` through Bash, then `Read` on each file it lists. `grep` is in the read-only set and `Read` stays in the working directory, so neither asks.',
			'Take action: one `Edit` per file, each replacing an exact `old_string`. The first edit asks you, and if you answer "Yes, and don\'t ask again", the later edits run without a prompt until the session ends.',
			'Verify: `npm test` through Bash. It asks you, because it is not a read-only command. If it fails, Claude reads the output and goes back to editing.',
			'If the second edit is wrong, press `Esc` to stop the running tool call, then `Esc` twice to rewind the files to the checkpoint before that edit, and tell Claude what was wrong.'
		],
		steps: [
			{
				title: 'Gather context',
				questions: [
					{ q: 'Which tool call do you expect first?', options: ['`Edit` on the first file', '`npm test` through Bash', '`grep -rn getUser src` through Bash', '`Read` on every file in the repo'], answer: 2, why: 'Claude has to find where `getUser` is used before it can read or change anything.' },
					{ q: 'In Manual mode, does that `grep` ask you first?', options: ['Yes, every Bash command asks', 'No, `grep` is in the built-in read-only set', 'Only the first time in a session', 'Only when it searches outside `src`'], answer: 1, why: 'A built-in set of read-only commands, `grep` among them, runs with no prompt.' },
					{ q: 'Do the `Read` calls on the files it lists ask you?', options: ['No, reads inside the working directory never ask', 'Yes, each file asks once', 'Only for test files', 'Yes, unless CLAUDE.md lists the file'], answer: 0, why: 'Reads inside the working directory need no approval.' },
					{ q: 'What tells Claude which files to read?', options: ['You list them in your message', 'The output of the `grep`', 'Your CLAUDE.md', 'The session JSONL file'], answer: 1, why: 'Claude picks each tool from what the last result showed. You describe the outcome, not the files.' }
				]
			},
			{
				title: 'Take action',
				questions: [
					{ q: 'How many `Edit` calls do you expect?', options: ['One for the whole repo', 'One per file that uses `getUser`', 'One per test', 'One per commit'], answer: 1, why: 'Each `Edit` changes one file, so the rename takes one call per file.' },
					{ q: 'How does `Edit` find the text to change?', options: ['It matches names that look similar', 'It rewrites the whole file', 'It runs `sed` on the file', 'It replaces an exact `old_string` with a `new_string`'], answer: 3, why: '`Edit` uses an exact match, with no fuzzy matching.' },
					{ q: 'What does Claude Code do just before each edit?', options: ['It commits the file to git', 'It runs the tests', 'It takes a checkpoint of the file', 'It reloads CLAUDE.md'], answer: 2, why: 'Claude Code snapshots the file first, which is what makes an edit reversible.' },
					{ q: 'You answer "Yes, and don\'t ask again" on the first edit. How long does that last?', options: ['Until the session ends', 'Forever, through `.claude/settings.local.json`', 'For the next edit only', 'Until the tests pass'], answer: 0, why: 'For file edits, that answer holds for the rest of the session. The later edits run with no prompt.' }
				]
			},
			{
				title: 'Verify the result',
				questions: [
					{ q: 'Which call checks that the tests still pass after the rename?', options: ['`Glob` for the test files', '`npm test` through Bash', '`Read` on the test file', '`Edit` on the test file'], answer: 1, why: 'The task says the tests must still pass, so Claude runs them.' },
					{ q: 'Does `npm test` ask you first?', options: ['No, tests only read files', 'No, you already approved the edits', 'Yes, it is not a read-only command', 'Only when a test fails'], answer: 2, why: '`npm test` is not in the read-only set, so in Manual mode it asks.' },
					{ q: 'The tests fail. What does Claude do next?', options: ['It reads the output and goes back to editing', 'It stops and reports the task done', 'It rewinds the files on its own', 'It opens a new session'], answer: 0, why: 'Verify feeds back into take action: the failure output is the next thing Claude works from.' },
					{ q: 'When does the loop for this request end?', options: ['After 10 tool calls', 'As soon as the tests pass', 'When the context window is full', 'When the model answers with text and no tool call'], answer: 3, why: 'The model keeps calling tools until it produces a reply with no tool call.' }
				]
			},
			{
				title: 'Recover from a bad edit',
				questions: [
					{ q: 'The second edit is going wrong while Claude works. What do you press first?', options: ['`Esc` once, to stop the running tool call', '`Enter`, to queue a message', '`Esc` three times', 'Close the terminal'], answer: 0, why: '`Esc` stops Claude and cancels the running tool call.' },
					{ q: 'How do you bring the files back to the state before that edit?', options: ['Run `claude --resume`', 'Press `Esc` twice and rewind', 'Run `/compact`', 'Start a new session'], answer: 1, why: '`Esc` twice rewinds to an earlier checkpoint.' },
					{ q: 'What can a rewind not bring back?', options: ['An edit to a local file', 'The checkpoint snapshot', 'An action on a remote system, such as a database', 'A file inside the working directory'], answer: 2, why: 'The docs: actions on databases, APIs or deployments "can\'t be checkpointed".' },
					{ q: 'The files are back. What do you do next?', options: ['Delete the session JSONL file', 'Switch out of Manual mode', 'Start the rename by hand', 'Tell Claude what was wrong'], answer: 3, why: 'The session keeps its history, so Claude can retry with your correction.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'In a session in Manual mode, which of these steps runs with no permission prompt?',
			options: [
				'`Edit` on a file inside the working directory',
				'`Bash` running `npm test` in the project folder',
				'`Read` on a file inside the working directory',
				'`WebFetch` on a page outside the documentation domains'
			],
			answer: 2,
			why: 'Reads inside the working directory need no approval. File edits ask until you allow them for the session, Bash asks except for a built-in read-only set, and WebFetch asks except for preapproved documentation domains.'
		},
		{
			q: 'Claude edited 3 files and ran a migration against the staging database. You press `Esc` twice and rewind. What comes back?',
			options: [
				'The 3 files and the staging database, both as they were',
				'The 3 files, and the database stays migrated',
				'Nothing, because rewinding only works on committed git history',
				'Only the database, because file changes need a git revert'
			],
			answer: 1,
			why: 'Checkpoints are snapshots of local files that Claude Code keeps apart from git. Actions on remote systems such as databases, APIs and deployments cannot be checkpointed, so permission modes and rules are the control for those.'
		},
		{
			q: 'When does the loop for one request end?',
			options: [
				'After a fixed number of 10 tool calls per request',
				'When a tool returns an error that the model cannot handle',
				'When the model answers with text and no tool call',
				'When the context window is full and needs a summary'
			],
			answer: 2,
			why: 'In each turn the model asks for tool calls and gets their results back. The model keeps calling tools until it produces a response with no tool calls, and that text is the answer you see. A cap such as `max_turns` can stop it earlier.'
		}
	],
	recall: {
		q: 'What are the three phases of one Claude Code request, and where does Claude Code keep the session?',
		a: 'Gather context, take action, verify results, repeated until a text-only answer. Every message, tool call and result goes to a JSONL file under `~/.claude/projects/`.'
	},
	sources: [
		{ title: 'Claude Code docs, How Claude Code works, read 2026-10-17', url: WORKS },
		{ title: 'Claude Code docs, Tools reference, read 2026-10-17', url: TOOLS },
		{ title: 'Claude Code docs, Configure permissions, read 2026-10-17', url: 'https://code.claude.com/docs/en/permissions' },
		{ title: 'Agent SDK docs, How the agent loop works, read 2026-10-17', url: LOOP },
		{ title: 'anthropics/claude-code, README.md', url: `${CC}/README.md` },
		{ title: 'claude-cookbooks, scheduled_repository_reviewer/scheduled_review.py', url: REVIEW }
	]
};
