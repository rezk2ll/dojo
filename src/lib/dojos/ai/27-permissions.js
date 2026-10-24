const CC = 'https://github.com/anthropics/claude-code/blob/c017428c8c27e604840435048d5bce6a9a22c040';
const PERMS = 'https://code.claude.com/docs/en/permissions';
const MODES = 'https://code.claude.com/docs/en/permission-modes';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'permissions',
	part: 'Claude Code',
	title: 'Permission modes',
	minutes: 10,
	hook: [
		'You ask Claude Code to fix a failing test. It asks before it edits `src/cart.ts`, asks before `npm test`, asks again for the next edit. By the fifteenth prompt you press Enter without reading the command.',
		'Each of those prompts came from one setting: the permission mode. **You can change what runs without asking, per tool and per command, in a JSON file.** The same file can also block a command in every mode.'
	],
	terms: [
		{ term: 'Permission mode', def: 'The baseline that decides which tool calls need your approval. The CLI cycles through `default` (shown as Manual), `acceptEdits` and `plan` with `Shift+Tab`.' },
		{ term: 'Permission rule', def: 'A string like `Bash(npm run *)` or `Read(./.env)` in the `allow`, `ask` or `deny` list of a settings file. It names a tool and, in parentheses, which uses of it match.' },
		{ term: 'Managed settings', def: 'A `managed-settings.json` file or MDM policy that an organization deploys to each machine. No user, project or command line setting can override a key it sets.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['call["Claude asks to run: git push origin main"] --> deny{"A deny rule matches?"}', 'deny -->|"yes"| blocked["Blocked, in every mode"]'],
				highlight: ['call', 'deny', 'blocked'],
				note: 'The Claude Code client checks each tool call against the rules before it runs. Deny rules come first, from every settings file at once. A `deny` of `Bash(git push *)` in your user settings blocks the push even if the project settings allow it, and even in `bypassPermissions` mode.'
			},
			{
				add: ['deny -->|"no"| ask{"An ask rule matches?"}', 'ask -->|"yes"| prompt["You get a prompt"]'],
				highlight: ['ask', 'prompt'],
				note: 'The docs: "Rules are evaluated in order: deny, then ask, then allow." An ask rule for `Bash(git push *)` prompts even when an allow rule for `Bash(git push origin main)` also matches. The docs list explicit ask rules among the actions that no mode auto-approves, `bypassPermissions` included.'
			},
			{
				add: ['ask -->|"no"| allow{"An allow rule matches?"}', 'allow -->|"yes"| run["Runs without a prompt"]'],
				highlight: ['allow', 'run'],
				note: 'An allow rule like `Bash(npm run *)` lets `npm run build` run with no prompt. Everything before the first `*` must match as written, so `Bash(git log *)` covers only `git log` and `Bash(git *)` covers every git command.'
			},
			{
				add: ['allow -->|"no"| mode{"Permission mode"}', 'mode -->|"default"| prompt', 'mode -->|"acceptEdits: file edit, mkdir, mv in the project"| run', 'mode -->|"plan: edit to source"| blocked'],
				highlight: ['mode'],
				note: 'When no rule matches the call, the permission mode decides. `default` runs reads only and asks for the rest. `acceptEdits` also runs file edits and `mkdir`, `touch`, `rm`, `mv`, `cp` and `sed` on paths inside the working directory. `plan` lets Claude read and explore but blocks edits to source until you approve the plan.'
			},
			{
				add: ['prompt -->|"Yes, and don\'t ask again"| saved[".claude/settings.local.json at the repo root"]'],
				highlight: ['saved'],
				note: 'Answering "Yes, and don\'t ask again" to a Bash command saves a rule to `.claude/settings.local.json` at the root of the git repository, and later sessions anywhere in that repo use it. An approval for a file edit is not saved and lasts until the session ends.'
			}
		]
	},
	example: {
		title: 'examples/settings/settings-strict.json in anthropics/claude-code',
		repo: 'anthropics/claude-code',
		url: `${CC}/examples/settings/settings-strict.json#L1-L14`,
		lang: 'json',
		code: `{
  "permissions": {
    "disableBypassPermissionsMode": "disable",
    "ask": [
      "Bash"
    ],
    "deny": [
      "WebSearch",
      "WebFetch"
    ]
  },
  "allowManagedPermissionRulesOnly": true,
  "allowManagedHooksOnly": true,
  "strictKnownMarketplaces": [],`,
		notes: [
			'Line 3 stops anyone from entering `bypassPermissions`. The settings reference says Claude Code "then rejects the `--dangerously-skip-permissions` flag".',
			'Lines 4 to 6 put the bare tool name `Bash` in `ask`, which matches every Bash command. Read-only commands such as `ls` and `cat` normally run without a prompt, and the docs say an `ask` or `deny` rule is the way to make them prompt.',
			'Lines 7 to 10 deny `WebSearch` and `WebFetch` with no parentheses. A bare tool name in `deny` removes the tool from Claude\'s context, so Claude never sees it. A scoped rule like `Bash(rm *)` instead keeps the tool and blocks the matching calls.',
			'Line 12 only works in managed settings. With it, Claude Code ignores `allow`, `ask` and `deny` rules in user, project and local files and hides the "don\'t ask again" choices, so the three rules above are the only ones.'
		]
	},
	tradeoff: {
		gain: [
			'Claude Code enforces a `deny` rule before the tool runs, whatever the prompt or `CLAUDE.md` told Claude.',
			'`acceptEdits` removes the prompt for every edit inside the working directory, and you review the result with `git diff` afterwards.',
			'A `.claude/settings.json` committed to the repo gives every teammate the same allow and deny lists. Its allow rules apply only after each person accepts the workspace trust dialog.'
		],
		cost: [
			'`Bash(git push *)` in `deny` stops `git push origin main` but not `git -C . push origin main` or `git \'push\' origin main`, because a Bash rule matches the command text.',
			'A broad allow rule like `Bash(git *)` also allows `git push` and `git reset --hard`.',
			'`bypassPermissions` skips prompts even for writes to `.git` and `.claude`, so the docs keep it to containers and VMs.'
		]
	},
	task: {
		prompt: 'Write `.claude/settings.json` for a repo where Claude may run any `npm run` script and `git commit` without asking, must ask before `git push`, must never read `.env`, and starts each session in plan mode. Then say what still happens when Claude runs `git -C . push origin main`.',
		hint: 'You need the `allow`, `ask` and `deny` lists and one `defaultMode` key. For the last part, compare the text `git -C . push` with the rule `Bash(git push *)`.',
		answer: [
			'`{ "permissions": { "allow": ["Bash(npm run *)", "Bash(git commit *)"], "ask": ["Bash(git push *)"], "deny": ["Read(./.env)"], "defaultMode": "plan" } }`.',
			'`npm run test` and `git commit -m "fix"` run with no prompt. `git push origin main` prompts even after you approve a plan, because ask rules are checked before allow rules and no mode auto-approves them.',
			'`Read(./.env)` blocks the Read tool on `.env`, and also `cat .env` or `head .env` in Bash. It does not stop `grep -r KEY .` or a Node script that opens the file itself. The sandbox blocks those at the OS level.',
			'`git -C . push origin main` does not match `Bash(git push *)`, because the rule matches the text `git push`. With no other rule, the mode decides: plan mode prompts or sends it to the classifier, and Manual mode prompts.'
		],
		steps: [
			{
				title: 'Write the allow list',
				questions: [
					{ q: 'Which rule lets any `npm run` script run without a prompt?', options: ['`Bash(npm run)`', '`Bash(npm *)`', '`Bash(npm run *)`', '`Bash(run *)`'], answer: 2, why: '`npm run` then `*` covers `npm run build`, `npm run test` and every other script, and nothing else.' },
					{ q: 'Which rule allows `git commit -m "fix"` and no other git command?', options: ['`Bash(git commit)`', '`Bash(git commit *)`', '`Bash(git *)`', '`Bash(commit *)`'], answer: 1, why: 'The `*` after `git commit` covers any message and flags. Without it, only the bare command matches.' },
					{ q: 'Why not allow `Bash(git *)` and be done?', options: ['Wildcards are not allowed in allow rules', 'It matches no git command', 'It would block `git commit`', 'It also allows `git push` and `git reset --hard`'], answer: 3, why: 'A broad allow rule covers every command that starts with the same text.' },
					{ q: 'In a rule like `Bash(git log *)`, what about the text before the `*`?', options: ['It must match as written', 'It is ignored', 'Its words can come in any order', 'It only has to match the first word'], answer: 0, why: 'Everything before the first `*` must match as written, so `Bash(git log *)` covers only `git log`.' }
				]
			},
			{
				title: 'Add the ask and deny rules',
				questions: [
					{ q: 'Where does `Bash(git push *)` go?', options: ['In `allow`', 'In `ask`', 'In `deny`', 'In `defaultMode`'], answer: 1, why: 'The task wants a prompt before every push, not a block.' },
					{ q: 'Which entry keeps Claude from reading `.env`?', options: ['`Read(./.env)` in `ask`', '`Edit(./.env)` in `deny`', '"Never read .env" in CLAUDE.md', '`Read(./.env)` in `deny`'], answer: 3, why: 'A deny rule is enforced by the client before the tool runs.' },
					{ q: 'Does `Read(./.env)` in deny also stop `cat .env` in Bash?', options: ['No, it only covers the Read tool', 'Yes, it blocks `cat .env` and `head .env` too', 'Only in plan mode', 'Only with the sandbox on'], answer: 1, why: 'The answer lists `cat .env` and `head .env` among the commands that rule blocks.' },
					{ q: 'Which call can still reach `.env` despite that rule?', options: ['`cat .env`', '`head .env`', '`grep -r KEY .`', 'The Read tool on `.env`'], answer: 2, why: 'A recursive `grep` opens the file without naming it. The sandbox blocks that at the OS level.' }
				]
			},
			{
				title: 'Start in plan mode',
				questions: [
					{ q: 'Which key makes every session start in plan mode?', options: ['`"defaultMode": "plan"`', '`"mode": "plan"`', '`"plan": true`', '`"startMode": "plan"`'], answer: 0, why: '`defaultMode` sets the mode a session starts in.' },
					{ q: 'Where does `defaultMode` sit in the file?', options: ['At the top level, next to `permissions`', 'Inside `permissions`, next to the three lists', 'Inside the `allow` list', 'In CLAUDE.md'], answer: 1, why: 'The answer puts it inside `permissions`, with `allow`, `ask` and `deny`.' },
					{ q: 'What does plan mode let Claude do?', options: ['Edit any file in the working directory', 'Run every Bash command with no prompt', 'Nothing until you type a plan', 'Read and explore, with no edits to source until you approve the plan'], answer: 3, why: '`plan` blocks edits to source until you approve the plan.' },
					{ q: 'You approve the plan. Does `git push origin main` still prompt?', options: ['Yes, ask rules come before allow and no mode auto-approves them', 'No, the approved plan covers it', 'No, plan mode allows pushes', 'Only if the push goes to `main`'], answer: 0, why: 'The docs list explicit ask rules among what no mode auto-approves, `bypassPermissions` included.' }
				]
			},
			{
				title: 'Test `git -C . push`',
				questions: [
					{ q: 'Does `git -C . push origin main` match `Bash(git push *)`?', options: ['Yes, it is still a push', 'Yes, Claude Code reads git options', 'No, the rule matches the text `git push`', 'Only in plan mode'], answer: 2, why: 'A Bash rule matches the command text, and `git -C . push` does not start with `git push`.' },
					{ q: 'You want `git -C . push origin main` to ask as well. Which rule do you add?', options: ['`Bash(git push -C *)` in `ask`', '`Bash(git -C . push *)` in `ask`', '`Bash(push *)` in `ask`', 'None: `Bash(git push *)` already covers it'], answer: 1, why: 'A Bash rule matches the command text, so this spelling needs its own rule. Everything before the `*` must match as written.' },
					{ q: 'In Manual mode, what happens to that push?', options: ['It prompts you', 'It runs with no prompt', 'It is blocked', 'It is saved as a new rule'], answer: 0, why: '`default` runs reads only and asks for the rest.' },
					{ q: 'Which other push also slips past `Bash(git push *)`?', options: ['`git push origin main`', '`git push --force origin main`', '`git push origin dev`', '`git \'push\' origin main`'], answer: 3, why: 'Quoting the word changes the text, so the rule no longer matches.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'User settings allow `Bash(git push *)`. The project `.claude/settings.json` denies `Bash(git push *)`. Claude runs `git push origin main`. What happens?',
			options: [
				'It runs, because user settings sit above project settings',
				'It is blocked, because deny rules from every scope are checked first',
				'It prompts, because the two rules cancel each other out',
				'It runs, because the more specific rule wins and they are equal'
			],
			answer: 1,
			why: 'Claude Code evaluates deny, then ask, then allow, across all settings files. A deny at any level blocks the call, and an allow at another level cannot carve an exception out of it.'
		},
		{
			q: 'You switch to `acceptEdits` with `Shift+Tab`. Which call still prompts you?',
			options: [
				'An edit to `src/cart.ts` inside the working directory',
				'`mkdir tests/fixtures` inside the working directory',
				'`npm install left-pad` with no allow rule for it',
				'`mv old.ts new.ts` inside the working directory'
			],
			answer: 2,
			why: '`acceptEdits` auto-approves file edits and a fixed set of filesystem commands (`mkdir`, `touch`, `rm`, `rmdir`, `mv`, `cp`, `sed`) on paths in the working directory. Other Bash commands outside the read-only set still prompt.'
		},
		{
			q: 'The project denies `Bash(rm *)`. Which command does that rule not stop?',
			options: [
				'`rm -rf build/`',
				'`FOO=bar rm -rf tmp/`',
				'`bash -c \'rm -rf build/\'`',
				'`rm build/app.js`'
			],
			answer: 2,
			why: 'A Bash rule matches the command text after Claude Code splits compound commands and strips known wrappers and leading variable assignments. `bash -c` passes the command as a string, so the rule does not see `rm`. A sandbox restricts the files no matter how the command is written.'
		}
	],
	recall: {
		q: 'In which order does Claude Code check permission rules, and what decides when no rule matches?',
		a: 'Deny, then ask, then allow, across all settings files. When none matches, the permission mode decides, for example `acceptEdits` runs file edits in the working directory and `default` prompts.'
	},
	sources: [
		{ title: 'Claude Code docs, Configure permissions, read 2026-10-17', url: PERMS },
		{ title: 'Claude Code docs, Choose a permission mode, read 2026-10-17', url: MODES },
		{ title: 'Claude Code docs, Settings reference, read 2026-10-17', url: 'https://code.claude.com/docs/en/settings-reference' },
		{ title: 'anthropics/claude-code, examples/settings/settings-strict.json', url: `${CC}/examples/settings/settings-strict.json` }
	]
};
