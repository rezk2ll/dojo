const AIDER = 'https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c';
const LINTER = `${AIDER}/aider/linter.py`;
const META = 'https://engineering.fb.com/2026/06/25/security/privacy-aware-infrastructure-in-the-ai-native-era-an-asset-classification-case-study/';
const AGENTS = 'https://www.anthropic.com/engineering/building-effective-agents';
const FLAKE8 = 'https://flake8.pycqa.org/en/latest/user/error-codes.html';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'when-not-to',
	part: 'Building with the API',
	title: 'When not to use a model',
	minutes: 10,
	hook: [
		'Meta classifies its data assets (columns, log keys, ML features) so that its privacy controls know what they protect. A field named `age` can be a person\'s age, which needs strict protection, or a cache time-to-live in an infrastructure pipeline. Telling those two apart takes judgment, and an LLM is good at that.',
		'Yet in Meta\'s production system, the LLM does not decide the common case. Its engineers write that deterministic rules "resolve the large majority of traffic, roughly 85%, in single-digit milliseconds". The LLM handles the other 15% or so, takes seconds, and costs "roughly 400 times the compute".',
		'Anthropic\'s agent guide says the same thing for any LLM app: find "the simplest solution possible, and only increasing complexity when needed".'
	],
	terms: [
		{ term: 'Deterministic', def: 'Same input, same output, every run. You can replay a past decision and get the same answer, and a test can check it with `==`.' },
		{ term: 'Rule', def: 'Code that maps an input to an answer without a model: a regex, a SQL query, a lookup table, a compiler check.' },
		{ term: 'Fallback', def: 'The path an input takes when no rule matches. In a hybrid system, the model is the fallback.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['task["A task you want to automate"] --> enum{"Can you write down every valid answer and the rule that picks it?"}', 'enum -->|"yes"| code["Write code: regex, SQL, lookup table"]'],
				highlight: ['enum', 'code'],
				note: 'Extracting `ORD-123456` from an email is a regex. Counting tickets per product is a `GROUP BY`. Mapping `FR` to `France` is a lookup table. Each one costs no tokens and gives the same answer every time.'
			},
			{
				add: ['enum -->|"no"| audit{"Must the decision be replayed and explained later?"}', 'audit -->|"yes"| rules["Rules for the known cases, a person reviews new rules"]'],
				highlight: ['audit', 'rules'],
				note: 'Meta\'s enforcement needs "decisions that can be explained and reproduced later". A model call can give a different answer on a later run, so Meta moves stable patterns into "versioned, auditable rules that run without the LLM". A person approves each rule that could change how sensitive data is protected.'
			},
			{
				add: ['audit -->|"no"| data{"May this data leave your systems?"}', 'data -->|"no"| local["Keep it in code you run"]'],
				highlight: ['data', 'local'],
				note: 'A model API call sends the input to someone else\'s servers. For example, the Claude batch docs say batch processing "stores request and response data for up to 29 days after batch creation". A regex on your own machine sends nothing anywhere.'
			},
			{
				add: ['data -->|"yes"| model["Use the model for what rules cannot cover"]', 'model -.->|"stable answers become new rules"| rules'],
				highlight: ['model'],
				note: 'What is left is ambiguous or new input, such as free text or the `age` field. Meta uses the LLM "to interpret novel or ambiguous assets", then distills what it learns into rules, which "steadily shrinks the LLM\'s role in production over time".'
			}
		]
	},
	example: {
		title: 'aider/linter.py: the compiler and flake8 check each edit the model makes',
		repo: 'Aider-AI/aider',
		url: `${LINTER}#L82-L180`,
		lang: 'python',
		code: `    def lint(self, fname, cmd=None):
        rel_fname = self.get_rel_fname(fname)
        try:
            code = Path(fname).read_text(encoding=self.encoding, errors="replace")
…
        if callable(cmd):
            lintres = cmd(fname, rel_fname, code)
        elif cmd:
            lintres = self.run_cmd(cmd, rel_fname, code)
        else:
            lintres = basic_lint(rel_fname, code)

        if not lintres:
            return

        res = "# Fix any errors below, if possible.\\n\\n"
        res += lintres.text
        res += "\\n"
        res += tree_context(rel_fname, code, lintres.lines)

        return res

    def py_lint(self, fname, rel_fname, code):
        basic_res = basic_lint(rel_fname, code)
        compile_res = lint_python_compile(fname, code)
        flake_res = self.flake8_lint(rel_fname)
…
    def flake8_lint(self, rel_fname):
        fatal = "E9,F821,F823,F831,F406,F407,F701,F702,F704,F706"
        flake8_cmd = [
            sys.executable,
            "-m",
            "flake8",
            f"--select={fatal}",
            "--show-source",
            "--isolated",
            rel_fname,
        ]
…
def lint_python_compile(fname, code):
    try:
        compile(code, fname, "exec")  # USE TRACEBACK BELOW HERE
        return`,
		notes: [
			'Aider is a coding agent, and after the model edits a Python file, `py_lint` runs three checks: a tree-sitter parse (`basic_lint`), Python\'s own `compile()`, and flake8. None of the three calls a model, so the same file gives the same errors on every run.',
			'The `fatal` line keeps only codes that mean broken code. In the [flake8 list](' + FLAKE8 + '), F821 is "undefined name", F706 is "a return statement outside of a function/method", and E9 covers syntax and IO errors. An invented function name from day 38 shows up here as F821, without any judgment call.',
			'The `res = "# Fix any errors below, if possible."` line is where the two parts meet. Code finds the error and the exact lines. If you answer yes to "Attempt to fix lint errors?", aider sends that text back to the model, which writes the fix.',
			'Claude Code makes the same split between hooks and CLAUDE.md. Its best practices page: "Unlike CLAUDE.md instructions which are advisory, hooks are deterministic and guarantee the action happens."'
		]
	},
	tradeoff: {
		gain: [
			'Speed and cost: Meta\'s rules answer in single-digit milliseconds, while its LLM path takes seconds and roughly 400 times the compute.',
			'A rule gives the same answer on every run, so you can test it with `==` and replay a decision months later.',
			'A regex or a SQL query on your own machine sends no data to an outside API.'
		],
		cost: [
			'A rule covers only the cases it was written for. A field like `age` in a new pipeline needs context that no rule had, so Meta keeps the LLM for the roughly 15% of novel or ambiguous cases.',
			'Each rule costs people time: Meta tests every candidate rule on a held-out reviewed set and in shadow mode before it affects any decision.',
			'You maintain two paths, the rules and the model prompt. Meta makes both return the same result format, so downstream systems do not need to know which path answered.'
		]
	},
	task: {
		prompt: 'Your support team asks for five automations. For each, choose code (regex, SQL, lookup table) or a model, and say why in one line. (1) Pull order numbers like `ORD-123456` out of incoming emails. (2) Count last week\'s tickets per product. (3) Show the country name for each two-letter country code. (4) Write a one-sentence summary of each angry complaint for the team lead. (5) Flag ticket fields that hold personal data, across 300 field names, some of them unclear like `age` or `id2`.',
		hint: 'For each one, ask whether you can list every valid answer and the rule that picks it. Then ask whether a wrong or changing answer would matter.',
		answer: [
			'(1) Code: the regex `ORD-\\d{6}` finds every order number and never invents one. (2) Code: a `GROUP BY product` over last week\'s rows gives an exact count that is the same on every run.',
			'(3) Code: a lookup table with one row per code. The answer list is finite and known in advance.',
			'(4) Model: there is no list of valid summaries to write down. Check a sample by hand or with a judge (day 37).',
			'(5) Both: rules for the clear names (`email`, `phone`, `birth_date`), then a model with context for the unclear ones such as `age`. When the model gives the same answer for a pattern many times, a person reviews the pattern and adds it as a rule, as in Meta\'s funnel.'
		],
		steps: [
			{
				title: 'Sort the clear cases',
				questions: [
					{ q: '(1) Pull `ORD-123456` out of incoming emails. Code or model?', options: ['A model, since emails are free text', 'Code: the regex `ORD-\\d{6}`', 'A model, with a regex to check it', 'A person, since order numbers matter'], answer: 1, why: 'The format is fixed, so a regex finds every order number and never invents one.' },
					{ q: '(2) Count last week\'s tickets per product. Code or model?', options: ['Code: a `GROUP BY product`', 'A model that reads every ticket', 'A model with a SQL tool', 'A judge model that checks the count'], answer: 0, why: 'A `GROUP BY` gives an exact count that is the same on every run, and costs no tokens.' },
					{ q: '(3) Show the country name for each two-letter code. Code or model?', options: ['A model, since country names change', 'A model with a cache', 'A regex on the code', 'Code: a lookup table, one row per code'], answer: 3, why: 'The list of answers is finite and known in advance.' },
					{ q: 'Which question tells you a task belongs to code?', options: ['Is the input written in English?', 'Is the task boring?', 'Can you list every valid answer and the rule that picks it?', 'Does the team want it fast?'], answer: 2, why: 'When you can write the answers and the rule down, a rule gives the same answer every time.' }
				]
			},
			{
				title: 'Choose for the summary',
				questions: [
					{ q: '(4) A one-sentence summary of each angry complaint. Code or model?', options: ['Code: the first sentence of the complaint', 'A model: there is no list of valid summaries', 'A lookup table of common complaints', 'A regex on angry words'], answer: 1, why: 'A summary takes judgment over free text, which is what a model is good at.' },
					{ q: 'How do you check the summaries?', options: ['A sample by hand or with a judge', 'An `==` against an expected summary', 'Nothing: the model is deterministic', 'Count the words of each summary'], answer: 0, why: 'Free text fails `==`, so you grade a sample, as on day 37.' },
					{ q: 'What changes when the summary goes through a model API?', options: ['Nothing leaves your machine', 'The answer is the same on every run', 'It costs no tokens', 'The complaint text goes to someone else\'s servers'], answer: 3, why: 'A model API call sends the input out. A regex on your own machine sends nothing anywhere.' },
					{ q: 'Does a different summary on a later run matter here?', options: ['Yes: it must be replayable for an audit', 'Yes: the count of tickets changes', 'Little: it is a note for a person, not an enforced decision', 'It cannot happen with a model'], answer: 2, why: 'A changing answer matters when a decision must be reproduced later. A note for the team lead is read once.' }
				]
			},
			{
				title: 'Split the field scan',
				questions: [
					{ q: '(5) Flag personal data in 300 field names. Which approach fits?', options: ['Only a model, for all 300', 'Only rules, for all 300', 'Rules for the clear names, a model for the unclear ones', 'A person reads all 300'], answer: 2, why: 'Clear names need no judgment, and unclear ones such as `age` need context no rule has.' },
					{ q: 'Which fields go to the rules?', options: ['`email`, `phone`, `birth_date`', '`age`, `id2`', 'All fields with a number in the name', 'Fields the model is unsure about'], answer: 0, why: 'Their names say what they hold, so a rule can match them every time.' },
					{ q: 'Why does `age` go to the model?', options: ['It is the longest name', 'Rules cannot read three letters', 'Models are faster on short names', 'It can be a person\'s age or a cache time-to-live'], answer: 3, why: 'Telling those two apart takes context, which is the case Meta keeps the LLM for.' },
					{ q: 'In Meta\'s funnel, what share of traffic do the rules resolve?', options: ['About 15%', 'Roughly 85%', 'About 50%', 'All of it'], answer: 1, why: 'Rules "resolve the large majority of traffic, roughly 85%, in single-digit milliseconds". The LLM handles the rest.' }
				]
			},
			{
				title: 'Grow the rules',
				questions: [
					{ q: 'The model gives the same answer for a pattern many times. What do you do?', options: ['A person reviews the pattern and adds it as a rule', 'Let the model keep answering it', 'Remove the pattern from the scan', 'Ask a second model to confirm each time'], answer: 0, why: 'Meta distills what the LLM learns into rules, which shrinks its role over time.' },
					{ q: 'Why should a person approve a rule that touches personal data?', options: ['Rules cannot run without a signature', 'The model cannot write rules', 'The rule could change how sensitive data is protected', 'It makes the rule faster'], answer: 2, why: 'Meta has a person approve each rule that could change how sensitive data is protected.' },
					{ q: 'What does a new rule gain over the model path?', options: ['It handles new, unclear names', 'It needs no maintenance', 'It understands context better', 'Milliseconds instead of seconds, and the same answer on replay'], answer: 3, why: 'Meta\'s rules answer in single-digit milliseconds, while the LLM takes seconds and roughly 400 times the compute.' },
					{ q: 'You keep both paths. How do downstream systems stay simple?', options: ['They call the model again to check', 'Both paths return the same result format', 'They only read rule results', 'They store which path answered and branch on it'], answer: 1, why: 'Meta makes both return the same format, so downstream systems do not need to know which path answered.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'In Meta\'s asset classification funnel, what decides the common case?',
			options: [
				'The LLM, with rules only as a backup when the API is down',
				'Deterministic rules, about 85% of traffic in single-digit milliseconds',
				'A person, who reviews each asset before any label is applied',
				'Three LLM judges that take a majority vote on every asset'
			],
			answer: 1,
			why: 'Rules match first, and the LLM is the fallback for the roughly 15% that is novel or ambiguous. That path takes seconds and roughly 400 times the compute. Meta uses its three-judge panel to check the classifier\'s quality.'
		},
		{
			q: 'Why does Meta want enforcement decisions to come from versioned rules instead of a model call?',
			options: [
				'Rules are always more accurate than a model on every kind of asset',
				'Regulators forbid any use of LLMs on personal data',
				'A versioned rule gives the same decision when replayed later, so it can be audited',
				'Model calls cannot return a structured result with a category'
			],
			answer: 2,
			why: 'Enforcement needs decisions "that can be explained and reproduced later". A rule with a version returns the same answer for the same input, while a model call can change between runs. The post keeps the LLM for ambiguous cases, where rules do worse.'
		},
		{
			q: 'Aider\'s model edits a Python file and calls a function that does not exist. Which part of aider reports it?',
			options: [
				'A second model call that reads the diff and looks for mistakes',
				'Nothing, until the user runs the program and sees a crash',
				'The model itself, which re-reads its edit before saving',
				'flake8, run by `py_lint`, which reports F821 "undefined name"'
			],
			answer: 3,
			why: 'The `fatal` list passed to flake8 includes F821. The check is deterministic: the same file gives the same error every run, and aider can send the result back to the model under "# Fix any errors below, if possible."'
		}
	],
	recall: {
		q: 'In Meta\'s funnel, what share of traffic do deterministic rules handle, and what does the LLM path cost in comparison?',
		a: 'About 85% goes through rules, in single-digit milliseconds. The LLM handles the other 15% or so, takes seconds and needs roughly 400 times the compute.'
	},
	sources: [
		{ title: 'Meta Engineering, Privacy-aware infrastructure in the AI-native era: an asset classification case study (25 June 2026)', url: META },
		{ title: 'Anthropic, Building effective agents', url: AGENTS },
		{ title: 'aider, aider/linter.py', url: LINTER },
		{ title: 'flake8 docs, Error / Violation Codes', url: FLAKE8 },
		{ title: 'Claude Code docs, Best practices, read 2026-10-17', url: 'https://code.claude.com/docs/en/best-practices' },
		{ title: 'Claude docs, Batch processing (data retention), read 2026-10-17', url: 'https://platform.claude.com/docs/en/build-with-claude/batch-processing' }
	]
};
