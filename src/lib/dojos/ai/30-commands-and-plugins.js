const CC = 'https://github.com/anthropics/claude-code/blob/c017428c8c27e604840435048d5bce6a9a22c040';
const SKILLS = 'https://code.claude.com/docs/en/skills';
const PLUGINS = 'https://code.claude.com/docs/en/plugins/overview';
const COMPONENTS = 'https://code.claude.com/docs/en/plugins/components';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'commands-and-plugins',
	part: 'Claude Code',
	title: 'Slash commands and plugins',
	minutes: 10,
	hook: [
		'Three times a week you type the same paragraph: look at `git status` and the diff, make a branch if you are on `main`, commit, push, open a pull request with `gh pr create`.',
		'The Claude Code repo keeps that paragraph in a 19 line file, `.claude/commands/commit-push-pr.md`. **Anyone who clones the repo types `/commit-push-pr` and Claude gets the same instructions, with the live `git status` already pasted in.**'
	],
	terms: [
		{ term: 'Custom command', def: 'A Markdown file in `.claude/commands/` that you run by its file name: `deploy.md` runs as `/deploy`. The docs merged commands into skills, and both formats keep working.' },
		{ term: 'Dynamic context injection', def: 'A line like `` !`git status` `` in a command or skill. Claude Code runs the command before Claude reads the file and puts its output in place of the line.' },
		{ term: 'Plugin', def: 'A directory with a manifest at `.claude-plugin/plugin.json` that holds skills, commands, agents, hooks or MCP servers. Claude Code installs and loads it as one unit.' },
		{ term: 'Marketplace', def: 'A repository or directory with a `.claude-plugin/marketplace.json` file listing plugins and where to fetch each one. You install from it with `/plugin install name@marketplace`.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['you["You type /commit-push-pr"] --> file[".claude/commands/commit-push-pr.md"]'],
				highlight: ['you', 'file'],
				note: 'The command name comes from the file name. A file in a subdirectory adds a segment with a colon, so `.claude/commands/frontend/component.md` runs as `/frontend:component`. A skill at `.claude/skills/commit-push-pr/SKILL.md` would give the same `/commit-push-pr`.'
			},
			{
				add: ['file --> inject["Claude Code runs git status, git diff HEAD, git branch --show-current"]', 'inject --> prompt["Prompt with the real output in place of each ! line"]'],
				highlight: ['inject', 'prompt'],
				note: 'Before Claude sees the file, Claude Code runs each `` !`command` `` through the Bash tool and replaces the line with the output, with the Bash tool\'s 2 minute timeout per command. Claude starts from the actual diff, and spends no tool calls looking for it.'
			},
			{
				add: ['prompt --> claude["Claude: branch, commit, push, gh pr create"]'],
				highlight: ['claude'],
				note: 'The `allowed-tools` line in the frontmatter lets the listed commands run without a prompt during this turn only. Claude then creates the branch, commits, pushes and opens the pull request. A command the list does not match still goes through the permission rules.'
			},
			{
				add: ['plugin["Plugin commit-commands: .claude-plugin/plugin.json"] --> pcmd["commands/commit-push-pr.md runs as /commit-commands:commit-push-pr"]', 'plugin --> parts["skills/, agents/, hooks/hooks.json, .mcp.json"]'],
				highlight: ['plugin', 'pcmd', 'parts'],
				note: 'The same file also ships inside a plugin in the repo, `plugins/commit-commands`. In a plugin, `commands/<file>.md` runs as `/<plugin>:<file>`. The plugin can also carry skills, subagents in `agents/`, hooks in `hooks/hooks.json` and MCP servers in `.mcp.json`.'
			},
			{
				add: ['market[".claude-plugin/marketplace.json"] -->|"/plugin install commit-commands@claude-plugins-official"| plugin'],
				highlight: ['market'],
				note: 'A marketplace lists plugins and their source folders. `/plugin install commit-commands@claude-plugins-official` opens the plugin\'s details so you can pick a scope: user (all your projects), project (everyone, through the committed `.claude/settings.json`) or local (you, in this repo).'
			}
		]
	},
	example: {
		title: '.claude/commands/commit-push-pr.md in anthropics/claude-code',
		repo: 'anthropics/claude-code',
		url: `${CC}/.claude/commands/commit-push-pr.md#L1-L19`,
		lang: 'markdown',
		code: `---
allowed-tools: Bash(git checkout --branch:*), Bash(git add:*), Bash(git status:*), Bash(git push:*), Bash(git commit:*), Bash(gh pr create:*)
description: Commit, push, and open a PR
---

## Context

- Current git status: !\`git status\`
- Current git diff (staged and unstaged changes): !\`git diff HEAD\`
- Current branch: !\`git branch --show-current\`

## Your task

Based on the above changes:
1. Create a new branch if on main
2. Create a single commit with an appropriate message
3. Push the branch to origin
4. Create a pull request using \`gh pr create\`
5. You have the capability to call multiple tools in a single response. You MUST do all of the above in a single message. Do not use any other tools or do anything else. Do not send any other text or messages besides these tool calls.`,
		notes: [
			'Line 2 uses the older `:*` suffix. The permissions docs say `Bash(ls:*)` "matches the same commands as `Bash(ls *)`", so `Bash(git push:*)` covers `git push -u origin fix-cart`.',
			'Line 2 also allows `git checkout --branch`, but git 2.43 answers that with "unknown option `branch\'". The real flag is `-b`, so `git checkout -b fix-cart` matches no entry and goes through the normal permission flow.',
			'Lines 8 to 10 are dynamic context injection. Their output replaces each line before Claude reads the file, so step 1 on line 15 can check the branch name without a tool call.',
			'The same text, with one extra blank line after line 14, is [`plugins/commit-commands/commands/commit-push-pr.md`](' + CC + '/plugins/commit-commands/commands/commit-push-pr.md). Next to it, `.claude-plugin/plugin.json` sets `"name": "commit-commands"` and `"version": "1.0.0"`.'
		]
	},
	tradeoff: {
		gain: [
			'A paragraph you typed three times a week is one 19 line file in git, and every teammate runs the same `/commit-push-pr`.',
			'The `!` lines give Claude the real `git status` and diff, so it does not have to guess the state of the working tree or spend tool calls on it.',
			'A plugin installs commands, skills, agents, hooks and MCP servers in one step, and its marketplace delivers updates.'
		],
		cost: [
			'For an enabled plugin, the name and description of each skill, agent and command that Claude can invoke are in the context on every turn, even when nothing from it runs.',
			'The docs: "a plugin you install can run code with your user privileges", whatever marketplace it comes from.',
			'A wrong `allowed-tools` entry fails without an error, as `git checkout --branch:*` shows: the command just prompts.'
		]
	},
	task: {
		prompt: 'Every morning you paste "Read GitHub issue N with gh, add the labels bug or feature, and post a one line summary." Turn it into `/triage 1234`. Then package it with a second command, `/triage-week`, as a plugin named `triage-tools` that your team can install. Write down each file path and the name you type for each command.',
		hint: 'Arguments reach the file through `$ARGUMENTS` or `$0`. A plugin needs a manifest, and its commands get a prefix.',
		answer: [
			'`.claude/commands/triage.md` with frontmatter `description: Label and summarize one GitHub issue` and `allowed-tools: Bash(gh issue view *) Bash(gh issue edit *)`. Body: "Run `gh issue view $0`, add the label `bug` or `feature` with `gh issue edit $0 --add-label`, then reply with a one line summary."',
			'`/triage 1234` puts `1234` in place of `$0`. The two `gh` commands run without a prompt during that turn only.',
			'Plugin layout: `triage-tools/.claude-plugin/plugin.json` with `{ "name": "triage-tools", "version": "1.0.0" }`, `triage-tools/commands/triage.md` and `triage-tools/commands/triage-week.md`.',
			'Installed, the commands run as `/triage-tools:triage 1234` and `/triage-tools:triage-week`. Add the plugin to a `.claude-plugin/marketplace.json` with `"source": "./triage-tools"`, and teammates install it with `/plugin install triage-tools@<marketplace>`.'
		],
		steps: [
			{
				title: 'Write the command file',
				questions: [
					{ q: 'Which file gives you `/triage`?', options: ['`.claude/triage.md`', '`.claude/commands/triage.md`', '`.claude/commands/triage/run.md`', '`.claude/commands/triage.json`'], answer: 1, why: 'The command name comes from the file name in `.claude/commands/`. A subfolder would give `/triage:run`.' },
					{ q: 'How does `1234` reach the body of the file?', options: ['Through a line `` !`1234` ``', 'Through an `ISSUE` environment variable', 'Through `$0`, or `$ARGUMENTS`', 'Claude asks you for it'], answer: 2, why: 'Arguments reach the file through `$ARGUMENTS` or `$0`.' },
					{ q: 'Which `allowed-tools` lets the two `gh` steps run, and no other `gh` command?', options: ['`Bash(gh issue view *) Bash(gh issue edit *)`', '`Bash(gh *)`', '`Bash(git push:*)`', '`Read`'], answer: 0, why: 'One entry per command the task needs. `Bash(gh *)` would also let `gh pr merge` through.' },
					{ q: 'How long does that grant last?', options: ['For the rest of the session', 'Until the plugin is updated', 'Forever, once you approve it', 'During that turn only'], answer: 3, why: '`allowed-tools` lets the listed commands run without a prompt during the turn that runs the command.' }
				]
			},
			{
				title: 'Run it once',
				questions: [
					{ q: 'You type `/triage 1234`. What replaces `$0`?', options: ['`/triage`', '`1234`', 'The issue title', 'Nothing until Claude calls `gh`'], answer: 1, why: 'The first argument after the command name fills `$0`.' },
					{ q: 'You add a line `` !`gh issue view $0` `` to the file. How long may that command run?', options: ['Up to the Bash tool\'s 2 minute timeout', 'As long as it needs', '10 seconds, then it is skipped', 'Until the turn ends'], answer: 0, why: 'Claude Code runs each `!` line through the Bash tool, with its 2 minute timeout per command.' },
					{ q: 'During `/triage`, Claude tries `gh issue close 1234`. What happens?', options: ['It runs, since `gh issue` is allowed', 'It is blocked by the command file', 'It goes through the normal permission rules', 'The command stops with an error'], answer: 2, why: 'A command the `allowed-tools` list does not match still goes through the permission rules.' },
					{ q: 'You mistype an entry in `allowed-tools`. What do you see?', options: ['An error when Claude Code loads the file', 'A warning in `/context`', 'The command refuses to run', 'No error: the command just prompts'], answer: 3, why: 'As `git checkout --branch:*` shows, a wrong entry fails silently and the command falls back to a prompt.' }
				]
			},
			{
				title: 'Package the plugin',
				questions: [
					{ q: 'Where does the plugin manifest go?', options: ['`triage-tools/.claude-plugin/plugin.json`', '`triage-tools/plugin.json`', '`triage-tools/.claude/settings.json`', '`.claude-plugin/marketplace.json`'], answer: 0, why: 'A plugin is a directory with a manifest at `.claude-plugin/plugin.json`.' },
					{ q: 'What does the answer put in that manifest?', options: ['The list of command files', '`"name": "triage-tools"` and `"version": "1.0.0"`', 'The `allowed-tools` of each command', 'The URL of the marketplace'], answer: 1, why: 'The manifest names the plugin and its version. The `commit-commands` plugin does the same.' },
					{ q: 'Where do `triage.md` and `triage-week.md` go inside the plugin?', options: ['`triage-tools/.claude/commands/`', '`triage-tools/.claude-plugin/`', '`triage-tools/commands/`', '`triage-tools/skills/`'], answer: 2, why: 'In a plugin, commands live in `commands/<file>.md`.' },
					{ q: 'You later add a hook to `triage-tools`. Where does it go?', options: ['`triage-tools/.claude/settings.json`', '`triage-tools/commands/hooks.md`', '`triage-tools/.claude-plugin/plugin.json`', '`triage-tools/hooks/hooks.json`'], answer: 3, why: 'A plugin keeps hooks in `hooks/hooks.json`, next to `commands/`, `skills/`, `agents/` and `.mcp.json`.' }
				]
			},
			{
				title: 'Name the commands and ship',
				questions: [
					{ q: 'Once installed, what do you type to triage issue 1234?', options: ['`/triage 1234`', '`/triage-tools:triage 1234`', '`/triage-tools/triage 1234`', '`/plugin triage 1234`'], answer: 1, why: 'Plugin commands get the plugin name as a prefix.' },
					{ q: 'You pick the project scope when you install. Where is that recorded?', options: ['In `~/.claude/settings.json`', 'In `.claude/settings.local.json`', 'In the committed `.claude/settings.json`, for everyone', 'In the plugin\'s `plugin.json`'], answer: 2, why: 'Project scope goes through the committed `.claude/settings.json`. User scope covers all your projects, local scope only you in this repo.' },
					{ q: 'How do teammates install the plugin?', options: ['`/plugin install triage-tools@<marketplace>`', 'Copy the files into `.claude/commands/`', '`git clone` the plugin folder', '`npm install triage-tools`'], answer: 0, why: 'You list it in a `marketplace.json` with `"source": "./triage-tools"`, and they install from that marketplace.' },
					{ q: 'A teammate wants to install a plugin from another marketplace too. What do the docs warn?', options: ['Only official marketplaces can run commands', 'Plugins run in a sandbox, so nothing', 'A plugin can run code with your user privileges, whatever marketplace it comes from', 'Two plugins cannot be enabled at once'], answer: 2, why: 'The docs: "a plugin you install can run code with your user privileges". Read it before you install it.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'You save a file at `.claude/commands/db/migrate.md`. What do you type to run it?',
			options: [
				'`/migrate`',
				'`/db/migrate`',
				'`/db:migrate`',
				'`/db-migrate`'
			],
			answer: 2,
			why: 'For a file in a subdirectory of `.claude/commands/`, Claude Code takes the path relative to `commands/`, replaces each `/` with `:` and drops the extension.'
		},
		{
			q: 'A command file contains the line `` - Current branch: !`git branch --show-current` ``. When does `git` run?',
			options: [
				'When Claude decides it needs the branch name and calls the Bash tool',
				'Before Claude reads the command, and the output replaces the line',
				'Once, when Claude Code starts, and the result is cached for the session',
				'Never: Claude reads the line as text and guesses the branch'
			],
			answer: 1,
			why: 'Dynamic context injection runs each `` !`command` `` before the content is sent to Claude. The output is inserted as plain text, so Claude receives the branch name and not the command.'
		},
		{
			q: 'You enable a plugin with 12 skills that Claude can invoke. You use none of them in a session. What does the plugin cost you there?',
			options: [
				'Nothing, because plugin files load only when you run a command',
				'The full text of all 12 skills in every turn',
				'The 12 names and descriptions in the context on every turn',
				'One line naming the plugin, and nothing else'
			],
			answer: 2,
			why: 'Claude Code loads an enabled plugin in every session. The name and description of each skill, agent and command that Claude can invoke stay in the context so Claude knows it exists, and the full text loads only when used.'
		}
	],
	recall: {
		q: 'What does a plugin hold, and what command does `commands/about.md` in a plugin named `my-plugin` give you?',
		a: 'A manifest at `.claude-plugin/plugin.json` plus skills, commands, agents, hooks and MCP servers, installed as one unit. The file runs as `/my-plugin:about`.'
	},
	sources: [
		{ title: 'Claude Code docs, Extend Claude with skills (custom commands), read 2026-10-17', url: SKILLS },
		{ title: 'Claude Code docs, Plugins overview, read 2026-10-17', url: PLUGINS },
		{ title: 'Claude Code docs, Plugin components, read 2026-10-17', url: COMPONENTS },
		{ title: 'Claude Code docs, Install and manage plugins, read 2026-10-17', url: 'https://code.claude.com/docs/en/plugins/install' },
		{ title: 'anthropics/claude-code, .claude/commands/commit-push-pr.md', url: `${CC}/.claude/commands/commit-push-pr.md` },
		{ title: 'anthropics/claude-code, plugins/commit-commands/.claude-plugin/plugin.json', url: `${CC}/plugins/commit-commands/.claude-plugin/plugin.json` }
	]
};
