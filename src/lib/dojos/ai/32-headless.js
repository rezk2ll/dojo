const CCA = 'https://github.com/anthropics/claude-code-action/blob/f27be6b65a4652f08a2ba3cff79114829b588967';
const FLAKY = `${CCA}/examples/test-failure-analysis.yml`;
const ACTION = `${CCA}/action.yml`;
const SECURITY = `${CCA}/docs/security.md`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'headless',
	part: 'Claude Code',
	title: 'Claude Code in scripts and CI',
	minutes: 10,
	hook: [
		'The CI run on your branch fails at 2 a.m. In the morning you paste the failed log into Claude Code and ask: flaky test or real bug? You do the same thing three times that week, by hand, with the same question.',
		'`claude -p "your question"` runs that same agent without a chat window. It runs the agent loop, prints the result and exits with code 0 on success and non-zero on failure. **A shell script or a GitHub workflow can call it like any other command.**'
	],
	terms: [
		{ term: 'Print mode', def: 'Claude Code run with `-p` (or `--print`): one prompt in, the result on stdout, then exit. There is no chat window and nobody to answer a permission prompt.' },
		{ term: 'Structured output', def: 'The JSON object a run returns when you pass `--output-format json` and `--json-schema`. It matches your schema and arrives in the `structured_output` field.' },
		{ term: 'Bare mode', def: 'The `--bare` flag: Claude Code skips hooks, skills, plugins, MCP servers, auto memory and CLAUDE.md that it would otherwise find on the machine. It needs `ANTHROPIC_API_KEY`, because it never reads your subscription login.' },
		{ term: 'Automation mode', def: 'How `claude-code-action` runs when the workflow passes a `prompt` input: Claude starts at once, without waiting for an `@claude` comment.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['ci["CI workflow fails"] -->|"workflow_run: completed"| job["detect-flaky job on ubuntu-latest"]'],
				highlight: ['ci', 'job'],
				note: 'A second workflow listens for the end of the one named `CI` and runs only when its conclusion is `failure`. Before Claude starts, the action checks that the actor has write access. For `workflow_run` it also checks the actor that started the upstream run.'
			},
			{
				add: ['job -->|"prompt input"| claude["claude-code-action: Claude Code on the runner"]'],
				highlight: ['claude'],
				note: 'The workflow passes a `prompt`, so the action runs in automation mode. Without a `prompt` it would wait for `@claude` in a comment. The `claude_args` input goes "directly to Claude CLI", so every flag of `claude -p` works there.'
			},
			{
				add: ['claude -->|"--json-schema"| out["structured_output: is_flaky, confidence, summary"]'],
				highlight: ['out'],
				note: 'The schema requires three fields: a boolean, a number between 0 and 1 and a string. The action exposes the object as the step output `structured_output`. A later step reads one field with `fromJSON(steps.detect.outputs.structured_output).confidence`.'
			},
			{
				add: ['out -->|"is_flaky and confidence >= 0.7"| retry["gh workflow run: start CI again"]', 'out -->|"confidence < 0.7"| human["Log line: manual review recommended"]'],
				highlight: ['retry', 'human'],
				note: 'The model answers one question, and plain YAML decides what to do with the answer. The only automatic action is a rerun of CI, which merges nothing and deletes nothing. A low score prints a line and leaves the decision to a person.'
			},
			{
				add: ['claude --> caps["Caps: --max-turns, --max-budget-usd, job timeout"]'],
				highlight: ['caps'],
				note: '`--max-turns` has no limit by default, and the run "Exits with an error when the limit is reached". `--max-budget-usd` stops the run once the estimated spend reaches the amount. The GitHub Actions docs also suggest workflow timeouts and concurrency controls against runaway jobs.'
			}
		]
	},
	example: {
		title: 'examples/test-failure-analysis.yml: let Claude label a failed CI run',
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
			'Lines 13 to 15 give the job token `contents: read` and `actions: write`, and nothing else. The Claude Code GitHub Actions docs: "Grant the workflow only the permissions it needs".',
			'Line 47 passes `--json-schema` through `claude_args`. In [action.yml](' + ACTION + '#L182-L184), the action describes `structured_output` as a JSON string to parse with `fromJSON()`, which lines 52 and 53 do.',
			'Line 33 asks Claude to run `gh run view`, and `claude_args` holds no `--allowedTools`. In a `-p` run with nobody to answer, a tool call that would prompt is denied. If you copy this file, add `--allowedTools "Bash(gh run view *)"` so reading the log does not depend on the starting permission mode.',
			'Line 59 pastes model output into a shell script. GitHub evaluates `${{ }}` before the shell runs, so a `\'` in `summary` ends the quoted string. The summary is text the model wrote after reading CI logs that a pull request can influence. GitHub prefers an intermediate environment variable, as line 56 already does for `WORKFLOW_NAME`.'
		]
	},
	tradeoff: {
		gain: [
			'The same agent runs on your laptop and in CI with one command, and the exit code tells the script whether the run succeeded.',
			'`--json-schema` returns fields such as `is_flaky` and `confidence`, which a workflow `if` or `jq` can test without parsing prose.',
			'`--bare` skips the hooks in a teammate `~/.claude` and the servers in `.mcp.json`. The docs call it "useful for CI and scripts where you need the same result on every machine".'
		],
		cost: [
			'Each Action run uses GitHub Actions minutes and API tokens, and a long `CLAUDE.md` is read again on every run.',
			'Without `--bare`, a `-p` session runs the hooks in the project `.claude/settings.json` and connects its `.mcp.json` servers, with no trust dialog, even in a folder you never trusted.',
			'In a `-p` run with no one to answer, a tool call that no rule or flag allows is denied, and the run goes on without that tool result.',
			'The model output is untrusted input for every step after it: a summary pasted into a `run:` script can carry shell syntax.'
		]
	},
	task: {
		prompt: 'Write one shell pipeline for a pre-merge check. It sends `git diff main` to Claude, asks for typos as JSON `{"typos":[{"file","line","issue"}]}`, stops after 3 turns, skips the machine configuration, and makes the script fail when the list is not empty.',
		hint: 'Piping the diff means Claude needs no tool to read it. `jq -e` sets its exit status from the last value it prints.',
		answer: [
			'`git diff main | claude --bare -p "List every typo in this diff." --output-format json --max-turns 3 --json-schema \'{"type":"object","properties":{"typos":{"type":"array","items":{"type":"object","properties":{"file":{"type":"string"},"line":{"type":"integer"},"issue":{"type":"string"}},"required":["file","line","issue"]}}},"required":["typos"]}\' | jq -e \'.structured_output.typos == []\'`',
			'`--bare` skips hooks, plugins, MCP servers and CLAUDE.md on the CI machine, and it needs `ANTHROPIC_API_KEY` in the environment.',
			'The diff arrives on stdin, so Claude needs no `Bash` permission to read it. The headless docs give the same reason for their `lint:claude` script.',
			'`jq -e` exits with 1 when the last value is `false`. One typo makes the comparison `false`, and so does a run with no `structured_output`. Run the step under `set -o pipefail`, so a `claude` error at the `--max-turns 3` limit fails it too.'
		],
		steps: [
			{
				title: 'Feed the diff',
				questions: [
					{ q: 'Which flag runs Claude Code without a chat window?', options: ['`--bare`', '`-p`', '`--output-format json`', '`--max-turns`'], answer: 1, why: 'Print mode, `-p`, takes one prompt, prints the result and exits.' },
					{ q: 'How does the diff reach Claude in the pipeline?', options: ['Claude runs `git diff main` with `Bash`', 'You paste it into the prompt string', 'On stdin, through `git diff main |`', 'Claude reads it from `.git` with `Read`'], answer: 2, why: 'The pipe sends the diff on stdin, so Claude has it before the first turn.' },
					{ q: 'Why pipe the diff instead of letting Claude fetch it?', options: ['Claude then needs no `Bash` permission to read it', 'A pipe makes the run cheaper per token', '`-p` cannot run any tools at all', 'The diff would be too long for a tool'], answer: 0, why: 'The headless docs give the same reason for their `lint:claude` script: the input arrives on stdin.' },
					{ q: 'A `-p` run makes a tool call that no rule or flag allows. What happens?', options: ['The run waits for you to approve it', 'The run exits with an error', 'The tool runs, since nobody can refuse it', 'It is denied, and the run goes on without that result'], answer: 3, why: 'Nobody is there to answer a permission prompt, so the call is denied.' }
				]
			},
			{
				title: 'Ask for JSON',
				questions: [
					{ q: 'What does the root of your `--json-schema` describe?', options: ['An object with a required `typos` array', 'A bare array of typos', 'A string the script splits on commas', 'A boolean that says whether typos exist'], answer: 0, why: 'The answer\'s schema is `{"type":"object", ... "required":["typos"]}`, and `typos` is an array of objects.' },
					{ q: 'The model reports a typo with no `line`. Can that object reach `structured_output`?', options: ['Yes: missing fields are filled with `null`', 'Yes, but only in `result`', 'No: `structured_output` matches the schema, and `line` is required', 'No: the run asks you to fix it'], answer: 2, why: 'Structured output matches your schema, and the schema lists `line` in `required` for each typo.' },
					{ q: 'What does the schema mark as required for each typo?', options: ['Only `issue`', '`file`, `line` and `issue`', '`file` and `issue`', 'Nothing: all fields are optional'], answer: 1, why: 'The prompt asks for `{"file","line","issue"}`, so the schema requires all three.' },
					{ q: 'Which type fits `line` in the schema?', options: ['`string`', '`boolean`', '`array`', '`integer`'], answer: 3, why: 'A line number is a whole number, so the answer gives it `"type":"integer"`.' }
				]
			},
			{
				title: 'Set the limits',
				questions: [
					{ q: 'How many turns does `claude -p` allow by default?', options: ['3', '10', 'No limit', 'One per tool'], answer: 2, why: '`--max-turns` has no limit by default, so a run with no cap can loop until the job timeout.' },
					{ q: 'You also want to cap what the check can spend. Which flag does that?', options: ['`--max-turns 1`', '`--bare`', '`--max-budget-usd`', '`--output-format json`'], answer: 2, why: '`--max-budget-usd` stops the run once the estimated spend reaches the amount.' },
					{ q: 'Which flag skips hooks, plugins, MCP servers and CLAUDE.md on the CI machine?', options: ['`--max-turns 3`', '`--output-format json`', '`-p`', '`--bare`'], answer: 3, why: 'Bare mode skips what Claude Code would otherwise find on the machine.' },
					{ q: 'What does `--bare` need in the environment?', options: ['Your subscription login', '`ANTHROPIC_API_KEY`', 'A `.mcp.json` file', 'A `CLAUDE.md` file'], answer: 1, why: 'Bare mode never reads your subscription login, so it needs an API key.' }
				]
			},
			{
				title: 'Fail on typos',
				questions: [
					{ q: 'Which filter makes the script fail when the list is not empty?', options: ['`jq \'.structured_output.typos\'`', '`jq -e \'.result == ""\'`', '`jq -e \'.structured_output.typos == []\'`', '`jq -e \'.typos | length\'`'], answer: 2, why: 'The comparison is `false` when there is a typo, and `jq -e` turns that into a failing exit status.' },
					{ q: 'What exit code does `jq -e` return when the last value is `false`?', options: ['1', '0', '2', 'It prints `false` and exits 0'], answer: 0, why: '`jq -e` sets its exit status from the last value it prints, and `false` gives 1.' },
					{ q: 'The run returns no `structured_output`. What does the filter do?', options: ['It passes, since there is no typo', 'It hangs until the job timeout', 'It prints an empty list and exits 0', 'It fails, since the comparison is `false`'], answer: 3, why: 'A missing field is not equal to `[]`, so a broken run fails the check too.' },
					{ q: 'Why run the step under `set -o pipefail`?', options: ['So `jq` reads the whole diff', 'So a `claude` error, such as the turn limit, fails the step', 'So the diff arrives on stdin', 'So `--bare` finds the API key'], answer: 1, why: 'Without it, the pipeline exit status is the one of `jq`, and a `claude` failure could pass unseen.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'You run `claude -p "Extract the function names" --output-format json --json-schema \'{...}\'`. Where is the object that matches your schema?',
			options: [
				'In the `result` field, as a JSON string you parse a second time',
				'In the `structured_output` field, next to the session ID and usage',
				'Alone on stdout, with the metadata written to stderr',
				'In a file named after the session ID under `~/.claude`'
			],
			answer: 1,
			why: 'With `--json-schema`, the JSON response carries request metadata such as the session ID and usage, and the validated object in `structured_output`. The plain text answer stays in `result`.'
		},
		{
			q: 'A CI job checks out a pull request and runs `claude -p "Review this"` without `--bare`. What does the run load from the checkout?',
			options: [
				'Nothing, because `-p` never reads project configuration',
				'Only `CLAUDE.md`, because hooks need an interactive session',
				'The hooks in `.claude/settings.json` and the servers in `.mcp.json`, with no trust dialog',
				'Nothing until the job shows the trust dialog, so it hangs until the timeout'
			],
			answer: 2,
			why: 'Without `--bare`, `claude -p` discovers configuration as an interactive session would. A `-p` session shows no workspace trust dialog and no per-server approval prompt, so a pull request that adds a hook gets it run.'
		},
		{
			q: 'Your workflow passes `--max-turns 5` in `claude_args`, and Claude is still working at turn 5. What happens?',
			options: [
				'Claude stops calling tools and writes a final answer with exit code 0',
				'The action posts a comment that asks you to approve more turns',
				'The run continues, because the limit applies only to interactive sessions',
				'The run exits with an error, so the step fails'
			],
			answer: 3,
			why: 'The CLI reference says `--max-turns` works in print mode and "Exits with an error when the limit is reached". There is no limit by default, so a run with no cap can loop until the job timeout.'
		}
	],
	recall: {
		q: 'Which two flags make `claude -p` return fields a workflow `if` can test, and which field holds them?',
		a: '`--output-format json` with `--json-schema`. The object arrives in `structured_output`, which `claude-code-action` exposes as `steps.<id>.outputs.structured_output`.'
	},
	sources: [
		{ title: 'Claude Code docs, Run Claude Code programmatically, read 2026-10-17', url: 'https://code.claude.com/docs/en/headless' },
		{ title: 'Claude Code docs, CLI reference, read 2026-10-17', url: 'https://code.claude.com/docs/en/cli-reference' },
		{ title: 'Claude Code docs, Claude Code GitHub Actions, read 2026-10-17', url: 'https://code.claude.com/docs/en/github-actions' },
		{ title: 'anthropics/claude-code-action, examples/test-failure-analysis.yml', url: FLAKY },
		{ title: 'anthropics/claude-code-action, docs/security.md', url: SECURITY },
		{ title: 'GitHub docs, Script injections, read 2026-10-17', url: 'https://docs.github.com/en/actions/concepts/security/script-injections' }
	]
};
