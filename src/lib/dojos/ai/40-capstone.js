const AGENTS = 'https://www.anthropic.com/engineering/building-effective-agents';
const LOOP = 'https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works';
const BP = 'https://code.claude.com/docs/en/best-practices';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'capstone',
	part: 'Building with the API',
	title: 'Capstone: a small coding agent',
	minutes: 10,
	hook: [
		'When Anthropic built a coding agent for SWE-bench, its engineers "spent more time optimizing our tools than the overall prompt". One fix: the model made mistakes with relative file paths after it left the root directory, so they changed the tool to require absolute paths.',
		'Your task is to design a small coding agent on paper, end to end: its tools, its loop, its permissions and the eval that tells you whether a change made it better. Each part uses a chapter you have already done, marked with its day number.'
	],
	terms: [
		{ term: 'Tool', def: 'A name, a description and an input schema that the model sees, plus the code that you run when the model asks for it (day 17).' },
		{ term: 'Stop condition', def: 'A rule that ends the loop: a `stop_reason` other than `tool_use`, or a limit you set, such as a maximum number of iterations (day 18).' },
		{ term: 'Eval set', def: 'A fixed list of past cases with a known right outcome, run again after every change to the prompt, the tools or the model (day 23).' }
	],
	kata: {
		brief: [
			'Your team wants a bot for failing tests. When a pull request\'s CI run fails a pytest test, the bot gets a checkout of the branch and the failing test id, such as `tests/test_dates.py::test_leap_day`. It must push a proposed fix as a commit on a new branch, for a person to review. It calls the Claude Messages API with tools that your code runs.',
			'The bot runs at night with nobody watching it. The checkout contains a `.env` file with real credentials, and the CI container has network access. The team kept 40 past failing tests, each with the fix a person merged.',
			'Design it on one sheet: the tools (name and inputs), the loop and when it stops, what the bot may do on its own and what needs a person, and how you measure that version 2 of the prompt beats version 1.'
		],
		minutes: 10,
		checklist: [
			'Three to five tools, each with narrow inputs, and file paths that must be absolute.',
			'A loop that continues only while `stop_reason` is `tool_use`, plus your own limits on iterations and tokens.',
			'Real test output returned to the model after each edit, so it judges its progress from pytest and not from its own reading.',
			'No general shell: the bot can run pytest and flake8 only, and it cannot read `.env` or reach the network.',
			'A person reviews every fix: the bot pushes to a new branch, never to `main`, and never merges.',
			'An eval on the 40 past cases, graded by code, with a check that the new test fails without the fix.',
			'Deterministic checks before model calls wherever a rule can answer (day 39).'
		],
		sample: [
			'Tools: the bot gets `read_file(path)`, `edit_file(path, old_text, new_text)`, `run_tests(test_id)` and `lint(path)`. Paths must be absolute and inside the checkout, and the tool returns an error otherwise. `edit_file` fails if `old_text` is not found exactly once, so the model cannot edit the wrong spot. There is no `git` tool: your code commits and pushes after the loop ends.',
			'Loop: the docs give the shape, "while `stop_reason == "tool_use"`, execute the tools and continue the conversation". Any other stop reason (`end_turn`, `max_tokens`, `stop_sequence`, `refusal`) ends the loop. You add a cap of 30 iterations and a token budget, and when one runs out, the bot reports "gave up" instead of pushing half a fix.',
			'Ground truth: `run_tests` returns the real pytest output, and `lint` runs flake8 with the fatal codes aider uses, so an invented name shows up as F821 before any test runs. The agent guide asks agents to "gain \'ground truth\' from the environment at each step". The model never decides on its own that the test passes.',
			'Permissions: the bot runs in a container with no network and without `.env` mounted, so the model cannot read the secrets even if a file in the repo tells it to (day 16). The only commands are the pytest and flake8 calls inside `run_tests` and `lint`. Your code pushes to `bot/fix-<test-id>` and opens a PR, and a person merges it (day 24).',
			'Eval: replay the 40 past failures with prompt version 1, then version 2. A case passes when the failing test now passes, the full suite stays green, and the diff touches no file outside the module under test. Code grades all three, so no model judge is needed (day 37). Report 31/40 against 35/40, plus iterations and tokens per case.',
			'Review: for each passing case, revert the bot\'s change and run the test again: it must fail, or the bot only weakened the test (day 38). Read the diff of five random cases by hand before you switch versions.'
		]
	},
	quiz: [],
	recall: {
		q: 'Which conditions end the agent loop in your design?',
		a: 'Any `stop_reason` other than `tool_use` (`end_turn`, `max_tokens`, `stop_sequence`, `refusal`), or one of your own limits, such as 30 iterations or the token budget.'
	},
	sources: [
		{ title: 'Anthropic, Building effective agents', url: AGENTS },
		{ title: 'Claude docs, How tool use works, read 2026-10-17', url: LOOP },
		{ title: 'Claude Code docs, Best practices, read 2026-10-17', url: BP }
	]
};
