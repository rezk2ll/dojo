const CC = 'https://github.com/anthropics/claude-code/blob/c017428c8c27e604840435048d5bce6a9a22c040';
const GUIDE = 'https://code.claude.com/docs/en/hooks-guide';
const REF = 'https://code.claude.com/docs/en/hooks';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'hooks',
	part: 'Claude Code',
	title: 'Hooks',
	minutes: 10,
	hook: [
		'Your `CLAUDE.md` says "Run Prettier on every file you edit." Claude edits 12 files in one task and runs Prettier after 11 of them. The CI format check fails on the twelfth file.',
		'The docs describe hooks as shell commands that Claude Code runs "at specific points in its lifecycle", so "certain actions always happen rather than relying on the LLM to choose to run them". **The Claude Code process runs the hook, so Claude cannot skip it.**'
	],
	terms: [
		{ term: 'Hook', def: 'A command, URL, prompt or agent that Claude Code runs when an event fires. It is declared under `hooks` in a settings file, a plugin or a skill.' },
		{ term: 'PreToolUse', def: 'The event that fires before a tool call runs. A hook on it can block the call before Claude Code runs it. `PostToolUse` fires after a tool call succeeds and cannot undo it.' },
		{ term: 'Matcher', def: 'The string that picks which tool calls a hook sees. `Bash` matches only the Bash tool, and `Edit|Write` matches either of those two tools.' },
		{ term: 'Exit code 2', def: 'The exit code that makes Claude Code block the action. For `PreToolUse`, the hook\'s stderr goes to Claude as the reason.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['claude["Claude asks: Bash, grep -r TODO src"] --> pre["PreToolUse hooks with matcher Bash"]'],
				highlight: ['claude', 'pre'],
				note: 'Claude asks to run `grep -r TODO src` with the Bash tool. Claude Code fires `PreToolUse` and runs every hook whose matcher matches, in parallel. Each command hook gets JSON on stdin with `hook_event_name`, `tool_name` and `tool_input`, so `tool_input.command` holds `grep -r TODO src`.'
			},
			{
				add: ['pre -->|"exit 2"| blocked["Blocked: stderr sent to Claude"]', 'blocked -.->|"Claude retries with rg"| claude'],
				highlight: ['blocked'],
				note: 'The hook prints a reason to stderr and exits 2. Claude Code blocks the call and passes the stderr to Claude, which can then try another command. When two hooks disagree, the most restrictive decision wins, in the order `deny`, `defer`, `ask`, `allow`.'
			},
			{
				add: ['pre -->|"exit 0"| perms["Permission rules and mode"]', 'perms --> tool["Tool runs"]'],
				highlight: ['perms', 'tool'],
				note: 'Exit 0 means "no objection", and the docs add that it "doesn\'t approve the tool call: the normal permission flow still applies". Any other exit code with plain text on stdout is a non-blocking error: the transcript shows a hook error and the tool still runs.'
			},
			{
				add: ['tool --> post["PostToolUse, matcher Edit|Write"]', 'post --> fmt["npx prettier --write on the edited file"]'],
				highlight: ['post', 'fmt'],
				note: 'After an `Edit` or `Write` succeeds, a `PostToolUse` hook with matcher `Edit|Write` runs `jq -r \'.tool_input.file_path\' | xargs npx prettier --write`. The hooks guide gives this exact command as its format-after-edit example. Exit 2 here only shows stderr to Claude, because the file is already written.'
			}
		]
	},
	example: {
		title: 'examples/hooks/bash_command_validator_example.py in anthropics/claude-code',
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
			'Lines 13 to 27 are the settings block from the file\'s docstring. It registers the script as a `PreToolUse` hook with matcher `Bash`, so the script runs before every Bash call and never before an `Edit`.',
			'Line 58 reads the event JSON from stdin, and lines 64 to 69 pull out `tool_name` and `tool_input.command`. Lines 36 to 45, above this excerpt, hold the rules: a command matching `^grep\\b(?!.*\\|)` gets the message "Use \'rg\' (ripgrep) instead of \'grep\'".',
			'Line 79 exits 2 after printing the messages to stderr. Claude Code blocks `grep -r TODO src`, and Claude reads the message and can rerun the search with `rg`.',
			'Line 62 exits 1 when stdin is not valid JSON. The comment says this shows stderr "to the user but not to Claude". The guide calls any exit code other than 0 and 2 a non-blocking error, so the Bash call still runs.'
		]
	},
	tradeoff: {
		gain: [
			'A `PreToolUse` hook that exits 2 blocks the call in every permission mode, `bypassPermissions` and `--dangerously-skip-permissions` included.',
			'A hook can read the whole command and run any logic on it, while a permission rule like `Bash(grep *)` only matches the command text against a pattern.',
			'A `PostToolUse` hook runs Prettier after every `Edit` and `Write`, with no instruction in `CLAUDE.md`.'
		],
		cost: [
			'The docs: "Command hooks execute shell commands with your full user permissions." A slow hook delays every tool call, up to the 10 minute default timeout for command hooks.',
			'A hook that exits 1 by mistake blocks nothing. The tool runs and the transcript shows a hook error.',
			'The example\'s regex starts with `^grep`, so `cd src && grep -r TODO .` passes the check. A hook only catches the cases its code tests for.'
		]
	},
	task: {
		prompt: 'In a Python repo, you want two things in `.claude/settings.json`: Claude must never edit a file under `migrations/`, and every `.py` file Claude edits gets `ruff format`. Write the `hooks` block and the blocking script.',
		hint: 'One `PreToolUse` and one `PostToolUse` entry, both with matcher `Edit|Write`. The edited path is in `tool_input.file_path`. Which exit code blocks?',
		answer: [
			'Script `.claude/hooks/no-migrations.sh`: `FILE=$(jq -r \'.tool_input.file_path // empty\')`, then `if [[ "$FILE" == *migrations/* ]]; then echo "Blocked: $FILE is a migration, write a new one with alembic" >&2; exit 2; fi; exit 0`. Run `chmod +x` on it.',
			'`"PreToolUse": [{ "matcher": "Edit|Write", "hooks": [{ "type": "command", "command": "\\"$CLAUDE_PROJECT_DIR\\"/.claude/hooks/no-migrations.sh" }] }]`.',
			'`"PostToolUse": [{ "matcher": "Edit|Write", "hooks": [{ "type": "command", "command": "jq -r \'.tool_input.file_path\' | grep \'\\\\.py$\' | xargs -r ruff format" }] }]`. The `grep` skips files that are not Python.',
			'Exit 2 matters: with `exit 1`, Claude Code reports a hook error and the edit to `migrations/0042_users.py` still goes through. The hook never sees a `sed -i` run through Bash. An `Edit(migrations/**)` deny rule also covers file commands that Claude Code recognizes in Bash, such as `sed` and `tee`.'
		],
		steps: [
			{
				title: 'Pick the events',
				questions: [
					{ q: 'Which event can stop an edit to `migrations/` before it happens?', options: ['`PostToolUse`', '`PreToolUse`', 'A line in CLAUDE.md', 'Any event, if it exits 1'], answer: 1, why: '`PreToolUse` fires before the tool call runs, so a hook on it can block the call.' },
					{ q: 'Which event runs `ruff format` on a file Claude just edited?', options: ['`PreToolUse`', 'Either one', '`PostToolUse`', 'Neither: a line in CLAUDE.md'], answer: 2, why: 'Formatting needs the written file, and `PostToolUse` fires after the tool call succeeds.' },
					{ q: 'Which matcher do both entries use?', options: ['`Edit|Write`', '`Bash`', '`*.py`', '`migrations/`'], answer: 0, why: 'A matcher picks tools, not paths. `Edit|Write` matches either of the two file tools.' },
					{ q: 'Why a hook for formatting instead of a line in CLAUDE.md?', options: ['Hooks use fewer tokens', 'CLAUDE.md cannot name commands', 'A hook runs faster than Claude', 'Claude Code runs the hook, so Claude cannot skip it'], answer: 3, why: 'In the hook story, Claude ran Prettier after 11 of 12 edits. A hook runs every time.' }
				]
			},
			{
				title: 'Write the blocking script',
				questions: [
					{ q: 'Where in the event JSON is the path of the file Claude wants to edit?', options: ['`tool_input.command`', '`tool_input.file_path`', '`tool_name`', '`hook_event_name`'], answer: 1, why: 'For `Edit` and `Write`, the target path is in `tool_input.file_path`.' },
					{ q: 'How does the script get that JSON?', options: ['As its first argument, `$1`', 'From an environment variable', 'On stdin, read with `jq`', 'From a file Claude Code writes'], answer: 2, why: 'Each command hook gets the event as JSON on stdin.' },
					{ q: 'Claude edits `app/migrations_helper.py`. Does the `*migrations/*` test block it?', options: ['Yes, the name contains "migrations"', 'Yes, every `.py` file is checked', 'Only if the file is new', 'No: the path has no `migrations/` with a slash'], answer: 3, why: 'The pattern needs the text `migrations/`. `migrations_helper.py` is a file name, not a directory, so the script exits 0.' },
					{ q: 'Where does the "Blocked: ... is a migration" message on stderr go?', options: ['To Claude, as the reason for the block', 'Only to your terminal', 'To a log file under `.claude/`', 'Nowhere: stderr is dropped'], answer: 0, why: 'For `PreToolUse`, the hook\'s stderr goes to Claude, which can then write a new migration instead.' }
				]
			},
			{
				title: 'Register both hooks',
				questions: [
					{ q: 'What do you run on `no-migrations.sh` so the hook can start it?', options: ['`source` on it', '`chmod +x` on it', '`ruff format` on it', 'Nothing: hooks run any file'], answer: 1, why: 'The hook command runs the script directly, so it has to be executable.' },
					{ q: 'In the `PostToolUse` command, what is `grep \'\\.py$\'` for?', options: ['It skips files that are not Python', 'It finds the migration files', 'It blocks the edit on a match', 'It formats the file'], answer: 0, why: 'The matcher sees every `Edit` and `Write`, so the path filter has to live in the command.' },
					{ q: 'What does `jq -r \'.tool_input.file_path\'` pass to `ruff format`?', options: ['The whole event JSON', 'The text of the command', 'The path of the edited file', 'The name of the tool'], answer: 2, why: '`jq -r` prints the raw path, and `xargs` hands it to `ruff format`.' },
					{ q: 'A teammate adds a second `PreToolUse` hook on `Edit|Write` that always allows. On a migration edit, `no-migrations.sh` blocks. What happens?', options: ['The edit runs: the allow came from a newer hook', 'You get a prompt to settle the tie', 'The hook listed first in the file wins', 'The edit is blocked: the most restrictive decision wins'], answer: 3, why: 'Matching hooks run in parallel, and when they disagree the order is `deny`, `defer`, `ask`, `allow`.' }
				]
			},
			{
				title: 'Check the gaps',
				questions: [
					{ q: '`ruff format` takes 30 seconds on a big file. What does that cost?', options: ['Nothing: hooks run in the background', 'The edit waits for it, up to the 10 minute default timeout', 'Claude Code kills it after 5 seconds', 'Claude skips formatting that file'], answer: 1, why: 'A slow hook delays the tool call it is attached to. Command hooks time out after 10 minutes by default.' },
					{ q: 'Claude runs `sed -i` on a migration through Bash. Does the hook see it?', options: ['Yes, it sees every file change', 'Yes, `sed` counts as `Edit`', 'No: the matcher is `Edit|Write`, not `Bash`', 'Only if the path contains `migrations/`'], answer: 2, why: 'The hook only fires for the tools its matcher names.' },
					{ q: 'Which addition also covers `sed` and `tee` on migrations?', options: ['An `Edit(migrations/**)` deny rule', 'A second hook that exits 1', 'A line in CLAUDE.md', 'A `PostToolUse` hook on `Bash`'], answer: 0, why: 'That deny rule covers file commands Claude Code recognizes in Bash, such as `sed` and `tee`.' },
					{ q: 'With which rights does `no-migrations.sh` run?', options: ['Inside the sandbox, read-only', 'With the model\'s rights, which you cannot see', 'As a separate user with no home directory', 'With your full user permissions'], answer: 3, why: 'The docs: "Command hooks execute shell commands with your full user permissions." Review a hook script like any code you run.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Your `PreToolUse` hook prints "no rm -rf" to stderr and exits 1. Claude runs `rm -rf build/`. What happens?',
			options: [
				'The command is blocked and Claude reads "no rm -rf"',
				'The command runs, and the transcript shows a hook error',
				'Claude Code asks you to approve the command',
				'The session stops until you fix the hook'
			],
			answer: 1,
			why: 'Only exit code 2 blocks. Any other non-zero exit with plain text on stdout is a non-blocking error: Claude Code notes the hook error and the tool call goes ahead.'
		},
		{
			q: 'A `PostToolUse` hook on `Edit|Write` runs the linter and exits 2 when it finds an error. What happens to the edit?',
			options: [
				'Claude Code reverts the file to its content before the edit',
				'The edit stays, and the linter output on stderr goes to Claude',
				'The edit stays, and the error is shown only to you',
				'Claude Code asks you whether to keep the edit'
			],
			answer: 1,
			why: '`PostToolUse` fires after the tool succeeded, so the file is already written and a hook cannot undo it. For this event, exit 2 shows stderr to Claude, which can then fix the lint error in a new edit.'
		},
		{
			q: 'A session runs with `--dangerously-skip-permissions`. A `PreToolUse` hook on `Bash` returns a `deny` decision for `git push --force`. What happens?',
			options: [
				'The push runs, because that flag skips every check',
				'The push runs, but Claude Code logs the hook\'s decision',
				'Claude Code shows you a prompt for the push',
				'The push is blocked, because hooks fire before the mode check'
			],
			answer: 3,
			why: '`PreToolUse` hooks fire before any permission mode check, in every mode. A hook `deny` blocks the tool even in `bypassPermissions` mode, so a team can enforce a rule that changing the mode does not lift.'
		}
	],
	recall: {
		q: 'What does each exit code of a `PreToolUse` command hook do?',
		a: 'Exit 2 blocks the tool call and sends stderr to Claude. Exit 0 leaves the decision to the permission rules and mode. Any other code is a non-blocking error, and the tool runs.'
	},
	sources: [
		{ title: 'Claude Code docs, Automate actions with hooks, read 2026-10-17', url: GUIDE },
		{ title: 'Claude Code docs, Hooks reference, read 2026-10-17', url: REF },
		{ title: 'anthropics/claude-code, examples/hooks/bash_command_validator_example.py', url: `${CC}/examples/hooks/bash_command_validator_example.py` }
	]
};
