const CC = 'https://github.com/anthropics/claude-code/blob/c017428c8c27e604840435048d5bce6a9a22c040';
const PYSDK = 'https://github.com/modelcontextprotocol/python-sdk/blob/9f66f376d486e84e9810b368cf8be9d5908661ab/CLAUDE.md';
const LLAMA = 'https://github.com/ggml-org/llama.cpp/blob/27c7a769da1671c97b2e3f6cb88704a6e1e0d0cd/CLAUDE.md';
const MEMORY = 'https://code.claude.com/docs/en/memory';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'claude-md',
	part: 'Claude Code',
	title: 'CLAUDE.md',
	minutes: 10,
	hook: [
		'Monday you tell Claude Code "use pnpm, not npm" and it switches. Tuesday you open a new session in the same repo, ask for a dependency, and it runs `npm install`.',
		'The docs: "Each Claude Code session begins with a fresh context window." What you typed on Monday lived in Monday\'s context. **A sentence written in a `CLAUDE.md` file is read again at the start of every session.**'
	],
	terms: [
		{ term: 'CLAUDE.md', def: 'A Markdown file of instructions that Claude Code reads at the start of every session. The project one lives at `./CLAUDE.md` or `./.claude/CLAUDE.md` and is committed with the code.' },
		{ term: 'CLAUDE.local.md', def: 'A personal `CLAUDE.md` at the project root that you add to `.gitignore`. It loads after the project `CLAUDE.md` in the same directory.' },
		{ term: 'Import', def: 'A line like `@docs/git-instructions.md` inside a `CLAUDE.md`. Claude Code expands the named file into the context at launch, up to four hops deep.' },
		{ term: 'Path-scoped rule', def: 'A Markdown file in `.claude/rules/` with a `paths:` list in its frontmatter. It loads only when Claude reads or edits a file that matches one of the globs.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['managed["/etc/claude-code/CLAUDE.md (managed policy)"] --> user["~/.claude/CLAUDE.md (you, all projects)"]'],
				highlight: ['managed', 'user'],
				note: 'You launch `claude` in `repo/services/api`. The broadest files load first: the managed policy file that an admin deploys on Linux at `/etc/claude-code/CLAUDE.md`, then your user file at `~/.claude/CLAUDE.md`. The managed file cannot be excluded by any setting.'
			},
			{
				add: ['user --> root["repo/CLAUDE.md, then repo/CLAUDE.local.md"]', 'root --> cwd["repo/services/api/CLAUDE.md"]'],
				highlight: ['root', 'cwd'],
				note: 'Next comes every `CLAUDE.md` from the filesystem root down to the working directory: `repo/CLAUDE.md` before `repo/services/api/CLAUDE.md`. The files are concatenated, so a closer file does not replace a parent one. In each directory, `CLAUDE.local.md` is appended after `CLAUDE.md`.'
			},
			{
				add: ['root -->|"@docs/git-instructions.md"| imp["Imported file, expanded at launch"]'],
				highlight: ['imp'],
				note: 'A line `@docs/git-instructions.md` pulls that file in at launch, relative to the file that holds the import. Splitting a 600 line file into imports changes nothing for the context: the docs say imported files "also load at launch". Inside backticks, `@README` stays plain text.'
			},
			{
				add: ['cwd -.->|"Claude reads src/web/app.ts"| lazy["repo/services/api/src/web/CLAUDE.md and matching .claude/rules/*.md"]'],
				highlight: ['lazy'],
				note: 'A `CLAUDE.md` in a subdirectory below the working directory does not load at launch. It loads the first time Claude reads, writes or edits a file in that subdirectory. A rule with `paths: ["src/web/**"]` loads the same way, when Claude touches a matching file.'
			},
			{
				add: ['cwd --> ctx["Context: system prompt, then the files as a user message"]', 'ctx -->|"/compact"| reread["repo root CLAUDE.md read again from disk"]'],
				highlight: ['ctx', 'reread'],
				note: 'The docs: "CLAUDE.md content is delivered as a user message after the system prompt". Claude tries to follow it, with no guarantee. After `/compact`, Claude Code reads the project root `CLAUDE.md` from disk again. Nested files and path rules come back only when a matching file is touched again.'
			}
		]
	},
	example: {
		title: 'CLAUDE.md in anthropics/claude-code: rules a workflow edit must keep',
		repo: 'anthropics/claude-code',
		url: `${CC}/CLAUDE.md#L1-L40`,
		lang: 'markdown',
		code: `# CLAUDE.md

Guidance for Claude Code and other coding agents working in this repository.

## Security hardening for GitHub Actions

Workflow jobs in this repository that call Claude run with three protections.
Keep them when you add or edit a workflow.

1. **Egress-firewall runner.** The job has \`runs-on: ubuntu-24.04-firewall\`,
   a GitHub-hosted runner that filters the job's outbound network traffic. Do
   not move a job that calls Claude to another runner.
2. **Network allow list.** \`.github/egress-firewall.yaml\` lists the hosts
   those jobs may reach, besides any that GitHub's firewall allows by default.
   Keep \`mode: enforce\`, which is what makes the firewall block the rest. Follow
   that file's header when you add a host.
3. **Auto permission mode.** Every step that runs the Claude Code action
   (\`uses: anthropics/claude-code-action\`, or a local action with a
   \`claude_args\` input) passes \`--permission-mode auto\` in \`claude_args\`. A tool
   call that needs permission and that the allowed tools do not cover then runs
   only if Claude Code's safety review passes it. Allow only the tools the job
   needs, and keep any \`--disallowedTools\` list a step has. Use \`claude-opus-4-6\`
   or a newer model: on an older one Claude Code falls back to its default
   permission mode.

\`claude.yml\` answers \`@claude\` mentions. The Claude Code action sets
\`--permission-mode acceptEdits\` for those, and the \`--permission-mode auto\` in
the workflow's \`claude_args\`, which comes after it, replaces it.

\`.github/workflows/workflow-hardening.yml\` fails when a job that runs the Claude
Code action or mentions \`ANTHROPIC_FEDERATION_RULE_ID\` breaks protection 1 or 3,
or when the allow list is missing, empty, not \`mode: enforce\`, or names a host
with \`*\`. It cannot see a job that calls Claude another way, so check new
workflows by hand too. If a job cannot meet protection 1 or 3, add it with the
reason to the matching exemption table in
\`.github/scripts/check_workflow_hardening.py\`. A job in \`EXEMPT_FROM_AUTO_MODE\`
must set no permission mode at all. Do not skip or weaken the check.

Keep each workflow's \`permissions:\` block minimal, and never print tokens or
environment variables in workflow logs.`,
		notes: [
			'Line 10 names the exact value to keep, `runs-on: ubuntu-24.04-firewall`. The memory docs ask for instructions "concrete enough to verify", like "Run `npm test` before committing" instead of "Test your changes". Claude can check a workflow file against line 10 by reading it.',
			'Lines 30 to 37 point at `workflow-hardening.yml`, a CI job that fails when a workflow breaks protection 1 or 3. The rules in this file only shape what Claude writes. The CI job rejects the pull request even when Claude ignored them.',
			'The whole file is 40 lines. The docs target "under 200 lines per CLAUDE.md file", because "Longer files consume more context and reduce adherence".',
			'Other repos keep one shared file for every agent. The [modelcontextprotocol/python-sdk CLAUDE.md](' + PYSDK + ') is one line, `@AGENTS.md`, an import that loads `AGENTS.md` at launch. The llama.cpp `CLAUDE.md` uses a Markdown link instead, which is not an import: Claude has to open `AGENTS.md` with a tool.'
		]
	},
	tradeoff: {
		gain: [
			'You write a build command or a convention once, and every session in the repo starts with it, for everyone who clones the repo.',
			'The project root `CLAUDE.md` is read again from disk after `/compact`, while an instruction typed only in chat is lost in the summary.',
			'Path-scoped rules in `.claude/rules/` keep frontend rules out of the context until Claude touches a file under `src/web/`.'
		],
		cost: [
			'Every line loads in every session, imports included, so a 600 line file costs the same context whether it is one file or six.',
			'`CLAUDE.md` reaches Claude as a user message, so Claude can still run a command the file forbids. A rule that must hold belongs in a permission deny rule or a `PreToolUse` hook.',
			'When two files contradict each other, the docs say "Claude may pick one arbitrarily", so old lines need deleting.'
		]
	},
	task: {
		prompt: 'Your repo `CLAUDE.md` is 450 lines: 120 lines describe the directory layout, 200 lines are React rules that only apply under `src/web/`, 20 lines give build and test commands, and one line says "Never open `.env`, it holds production keys". You also keep your own staging URL in it. Plan the new layout: which lines stay, which move where, and which leave the file.',
		hint: 'Ask of each block: does Claude need it in every session, can Claude read it from the code, and does it have to hold even when Claude ignores it?',
		answer: [
			'Keep the 20 lines of build and test commands in `CLAUDE.md`: Claude needs them in every session and cannot always guess them.',
			'Move the 200 React lines to `.claude/rules/web.md` with `paths: ["src/web/**"]`. They now load only when Claude reads or edits a file under `src/web/`.',
			'Cut the 120 lines of directory layout. Claude can list the directories itself, and the docs list directory layouts among the content `/doctor` proposes to trim.',
			'Move the staging URL to `CLAUDE.local.md` and add that file to `.gitignore`. For `.env`, keep the line and add a `deny` rule such as `Read(./.env)` in `.claude/settings.json`, which the client enforces. The file is now about 25 lines.'
		],
		steps: [
			{
				title: 'Keep what every session needs',
				questions: [
					{ q: 'Where do the 20 lines of build and test commands go?', options: ['To `.claude/rules/build.md`', 'They stay in `CLAUDE.md`', 'Out of the file: Claude can guess them', 'To `CLAUDE.local.md`'], answer: 1, why: 'They are needed in every session, which is what the project `CLAUDE.md` is for.' },
					{ q: 'Why do those lines stay?', options: ['Claude needs them in every session and cannot always guess them', 'They are the longest block in the file', 'Rule files cannot hold commands', 'CI reads them from `CLAUDE.md`'], answer: 0, why: 'A command Claude would otherwise get wrong is worth a line in every session.' },
					{ q: 'How do the docs want an instruction written?', options: ['As short as possible, like "Test your changes"', 'In capital letters, so it stands out', 'Concrete enough to verify, like "Run `npm test` before committing"', 'As a link to a wiki page'], answer: 2, why: 'The docs ask for instructions "concrete enough to verify".' },
					{ q: 'What size do the docs target for one `CLAUDE.md`?', options: ['Under 450 lines', 'Under 25 lines', 'Under 1,000 lines', 'Under 200 lines'], answer: 3, why: 'The docs target "under 200 lines per CLAUDE.md file".' }
				]
			},
			{
				title: 'Scope the React rules',
				questions: [
					{ q: 'Where do the 200 lines of React rules go?', options: ['`.claude/rules/web.md` with `paths: ["src/web/**"]`', 'Five files pulled in with `@path` imports', '`CLAUDE.local.md`', '`~/.claude/CLAUDE.md`'], answer: 0, why: 'A path-scoped rule holds text that only matters for some files.' },
					{ q: 'When does that rule file load?', options: ['At launch, with the other files', 'When Claude reads or edits a file under `src/web/`', 'After every `/compact`', 'When you run `/memory`'], answer: 1, why: 'A rule with `paths:` loads only when Claude touches a matching file.' },
					{ q: 'Where in `web.md` does `paths: ["src/web/**"]` go?', options: ['In a comment at the end of the file', 'In `.claude/settings.json`, next to the rules', 'In the frontmatter at the top of the file', 'In `CLAUDE.md`, as an import line'], answer: 2, why: 'A path-scoped rule is a Markdown file in `.claude/rules/` with a `paths:` list in its frontmatter.' },
					{ q: 'After `/compact`, does the React rule file come back?', options: ['Yes, it is read again from disk at once', 'Only when a matching file is touched again', 'No, never again in that session', 'Only if you run `/memory`'], answer: 1, why: 'Only the project root `CLAUDE.md` is re-read after `/compact`. Path rules return when a matching file is touched.' }
				]
			},
			{
				title: 'Cut what Claude can read itself',
				questions: [
					{ q: 'What do you do with the 120 lines of directory layout?', options: ['Keep them in `CLAUDE.md`', 'Move them to a path rule', 'Import them from a separate file', 'Cut them'], answer: 3, why: 'They cost context in every session and tell Claude nothing it cannot find.' },
					{ q: 'Why can they go?', options: ['A layout breaks the Markdown parser', 'Claude can list the directories itself', 'Layouts must stay private', 'Any block over 100 lines is dropped'], answer: 1, why: 'Claude reads the code and lists directories with its own tools.' },
					{ q: 'Which command do the docs say proposes to trim directory layouts?', options: ['`/doctor`', '`/compact`', '`/memory`', '`/context`'], answer: 0, why: 'The docs list directory layouts among the content `/doctor` proposes to trim.' },
					{ q: 'Why does a shorter file matter, beyond the token count?', options: ['Claude Code refuses files over 200 lines', 'Git rejects large Markdown files', 'Longer files "reduce adherence"', 'Imports stop working past 200 lines'], answer: 2, why: 'The docs: "Longer files consume more context and reduce adherence".' }
				]
			},
			{
				title: 'Move the personal and the critical',
				questions: [
					{ q: 'Where does your own staging URL go?', options: ['It stays in `CLAUDE.md`', '`CLAUDE.local.md`, added to `.gitignore`', '`.claude/settings.json`', '`.claude/rules/staging.md`'], answer: 1, why: 'It is yours, not the team\'s, so it goes in the personal file that is not committed.' },
					{ q: 'When does `CLAUDE.local.md` load?', options: ['Right after `CLAUDE.md` in the same directory', 'Before every other file', 'Only when Claude opens it with a tool', 'Only after `/compact`'], answer: 0, why: 'In each directory, `CLAUDE.local.md` is appended after `CLAUDE.md`.' },
					{ q: 'Why is the line "Never open `.env`" not enough on its own?', options: ['Claude cannot read dotfiles anyway', 'Lines about files are skipped', 'It sits past line 200, so it never loads', '`CLAUDE.md` is a user message Claude follows with no guarantee'], answer: 3, why: 'Claude tries to follow `CLAUDE.md`, but nothing enforces it.' },
					{ q: 'Once every block has moved or gone, about how long is `CLAUDE.md`?', options: ['About 330 lines', 'About 200 lines', 'About 25 lines', 'Still 450 lines'], answer: 2, why: 'Only the 20 build and test lines and the `.env` line stay, plus a few headings. The React rules, the layout and the staging URL have left.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'You run `claude` in `repo/services/api`. Which project files are in the context before you type anything?',
			options: [
				'`repo/CLAUDE.md` and `repo/services/api/CLAUDE.md`, the parent one first',
				'Only `repo/services/api/CLAUDE.md`, because the closest file replaces its parents',
				'Every `CLAUDE.md` in the repo, including `repo/services/web/CLAUDE.md`',
				'Only `repo/CLAUDE.md`, because Claude Code reads the file at the git root'
			],
			answer: 0,
			why: 'Claude Code loads `CLAUDE.md` from the working directory and every directory above it, and concatenates them from the root down. Files in sibling or child directories load only when Claude reads a file there.'
		},
		{
			q: 'Your 600 line `CLAUDE.md` uses too much context. You split it into five files pulled in with `@path` imports. What changes in the context?',
			options: [
				'The imports load only when Claude decides they are relevant',
				'Nothing: imported files expand into the context at launch',
				'Only the first import loads, and the others wait for a matching file',
				'The imports are summarized at launch, so they cost fewer tokens'
			],
			answer: 1,
			why: 'Imported files are expanded and loaded at launch next to the file that imports them, so the token count stays the same. Path-scoped rules in `.claude/rules/` or skills are the way to load text only when it is needed.'
		},
		{
			q: '`CLAUDE.md` says "Never run `git push`, I push myself". During a long task, Claude runs `git push origin main`. What stops it from happening again?',
			options: [
				'Writing the line in capital letters at the top of the file',
				'Moving the line from `CLAUDE.md` into `CLAUDE.local.md`',
				'A `deny` rule for `Bash(git push *)` in settings',
				'Repeating the line in `~/.claude/CLAUDE.md` as well'
			],
			answer: 2,
			why: '`CLAUDE.md` is delivered as a user message, and Claude follows it with no guarantee. Permission rules in settings are checked by the client before the tool runs, whatever Claude decided.'
		}
	],
	recall: {
		q: 'Which `CLAUDE.md` files load when you launch Claude Code in a directory, and when does a subdirectory\'s file load?',
		a: 'The managed file, `~/.claude/CLAUDE.md`, and every `CLAUDE.md` from the filesystem root down to the working directory load at launch. A subdirectory\'s `CLAUDE.md` loads when Claude first reads or edits a file in it.'
	},
	sources: [
		{ title: 'Claude Code docs, How Claude remembers your project, read 2026-10-17', url: MEMORY },
		{ title: 'Claude Code docs, Context window: what survives compaction, read 2026-10-17', url: 'https://code.claude.com/docs/en/context-window' },
		{ title: 'anthropics/claude-code, CLAUDE.md', url: `${CC}/CLAUDE.md` },
		{ title: 'modelcontextprotocol/python-sdk, CLAUDE.md', url: PYSDK },
		{ title: 'ggml-org/llama.cpp, CLAUDE.md', url: LLAMA }
	]
};
