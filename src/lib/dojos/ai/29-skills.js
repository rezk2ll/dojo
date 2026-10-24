const SK = 'https://github.com/anthropics/skills/blob/dbd4588f9e1033efb41dad4bef2f7947c8993d44';
const DOCS = 'https://code.claude.com/docs/en/skills';
const POST = 'https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'skills',
	part: 'Claude Code',
	title: 'Skills',
	minutes: 10,
	hook: [
		'Your `CLAUDE.md` has 180 lines on how to cut a release: changelog format, version bump, tag, publish. You release on the first Monday of each month, yet those 180 lines load in every session, including the 30 where you only fix a typo.',
		'The skills docs: "Unlike CLAUDE.md content, a skill\'s body loads only when it\'s used". **A skill is a folder with a `SKILL.md` file, and until it is used only its name and description sit in the context.**'
	],
	terms: [
		{ term: 'Skill', def: 'A folder such as `.claude/skills/release/` holding a `SKILL.md` file: YAML frontmatter, then Markdown instructions. You run this one by typing `/release`.' },
		{ term: 'Description', def: 'The `description` field of the frontmatter. Claude reads it at startup and uses it to decide when to load the skill.' },
		{ term: 'Progressive disclosure', def: 'Loading a skill in three levels: name and description at startup, the `SKILL.md` body when the skill is used, other files in the folder only when Claude opens them.' },
		{ term: 'disable-model-invocation', def: 'The frontmatter field that decides whether Claude may start the skill. With `true`, only you can start the skill by typing `/name`, and its description stays out of the context.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['start["Session start"] --> list["Skill listing: name and description of each skill"]'],
				highlight: ['start', 'list'],
				note: 'At startup Claude Code puts a listing of skills in the context: every skill name, and descriptions as far as a budget allows. The docs: "The budget scales at 1% of the model\'s context window." Each entry\'s `description` plus `when_to_use` is cut at 1,536 characters.'
			},
			{
				add: ['user["You: fill in the form in lease.pdf"] --> match["Claude matches the pdf description"]', 'list --> match', 'match --> body["Claude reads pdf/SKILL.md"]'],
				highlight: ['user', 'match', 'body'],
				note: 'Your request mentions a `.pdf` file, and the pdf skill\'s description says to use it then. Claude loads the skill and its rendered `SKILL.md` enters the conversation as one message. It stays there for later turns, and Claude Code does not read the file again.'
			},
			{
				add: ['body -->|"SKILL.md: read FORMS.md"| forms["forms.md, read only for a form"]', 'body -.->|"not needed here"| ref["reference.md stays on disk"]'],
				highlight: ['forms', 'ref'],
				note: 'The body points to other files in the folder. The Anthropic engineering post on skills says the author moved form filling into `forms.md`, "trusting that Claude will read forms.md only when filling out a form". `reference.md` costs no tokens in this session.'
			},
			{
				add: ['forms --> script["scripts/: run, output only"]'],
				highlight: ['script'],
				note: 'Scripts in the folder are meant to be executed, and only their output enters the context. The docs\' layout shows `scripts/helper.py` as "executed, not loaded". The `webapp-testing` skill tells Claude to run its scripts with `--help` first and not to read their source.'
			},
			{
				add: ['body -->|"/compact"| keep["First 5,000 tokens of each recent skill re-attached"]'],
				highlight: ['keep'],
				note: 'When the conversation is compacted, Claude Code re-attaches the most recent invocation of each skill after the summary. It keeps the first 5,000 tokens of each, with 25,000 tokens for all skills together, newest first. A skill you used early in a long session can be dropped.'
			}
		]
	},
	example: {
		title: 'skills/pdf/SKILL.md in anthropics/skills: frontmatter and first screen',
		repo: 'anthropics/skills',
		url: `${SK}/skills/pdf/SKILL.md#L1-L26`,
		lang: 'markdown',
		code: `---
name: pdf
description: Use this skill whenever the user wants to do anything with PDF files. This includes reading or extracting text/tables from PDFs, combining or merging multiple PDFs into one, splitting PDFs apart, rotating pages, adding watermarks, creating new PDFs, filling PDF forms, encrypting/decrypting PDFs, extracting images, and OCR on scanned PDFs to make them searchable. If the user mentions a .pdf file or asks to produce one, use this skill.
license: Proprietary. LICENSE.txt has complete terms
---

# PDF Processing Guide

## Overview

This guide covers essential PDF processing operations using Python libraries and command-line tools. For advanced features, JavaScript libraries, and detailed examples, see REFERENCE.md. If you need to fill out a PDF form, read FORMS.md and follow its instructions.

## Quick Start

\`\`\`python
from pypdf import PdfReader, PdfWriter

# Read a PDF
reader = PdfReader("document.pdf")
print(f"Pages: {len(reader.pages)}")

# Extract text
text = ""
for page in reader.pages:
    text += page.extract_text()
\`\`\``,
		notes: [
			'Lines 2 and 3 are the only part in the context before the skill is used. The description lists tasks ("merging", "filling PDF forms", "OCR") and ends with a trigger: "If the user mentions a .pdf file or asks to produce one, use this skill."',
			'Line 11 is the third level. It sends Claude to `REFERENCE.md` for advanced features and to `FORMS.md` only "If you need to fill out a PDF form". Those files sit next to `SKILL.md` and load only when Claude opens them.',
			'The whole `SKILL.md` is 314 lines. The docs ask to keep it "under 500 lines" and to move detailed reference material to separate files, as this skill does.',
			'The [webapp-testing skill](' + SK + '/skills/webapp-testing/SKILL.md#L14) says its scripts "exist to be called directly as black-box scripts rather than ingested into your context window".'
		]
	},
	tradeoff: {
		gain: [
			'A 180 line release procedure costs one description line in the 30 sessions that do not release.',
			'Files next to `SKILL.md` cost nothing until Claude opens them, so one skill can carry a long API reference.',
			'`disable-model-invocation: true` on `/deploy` means a deploy starts only when you type `/deploy`, never because Claude decided the code looked ready.'
		],
		cost: [
			'Claude loads a skill only if your request matches its description. A description without the words people use leaves the skill unused.',
			'With many skills, the listing goes over its 1% budget and Claude Code drops descriptions, starting with the skills you invoke least.',
			'`allowed-tools` in a skill committed to a repo applies even in a `-p` run in a folder you never trusted, so read it before you run Claude Code there.'
		]
	},
	task: {
		prompt: 'Move the 180 line release procedure out of `CLAUDE.md` into a skill. It bumps the version with `npm version`, writes `CHANGELOG.md` in a fixed format described in 120 of those lines, tags and runs `npm publish`. Write down the folder layout and the frontmatter of `SKILL.md`.',
		hint: 'Should Claude start `npm publish` on its own because the code looks ready? Which 120 lines does Claude need only while writing the changelog?',
		answer: [
			'Layout: `.claude/skills/release/SKILL.md` with the steps in about 40 lines, and `.claude/skills/release/changelog-format.md` with the 120 format lines. `SKILL.md` says "Before you write CHANGELOG.md, read changelog-format.md".',
			'Frontmatter: `name: release`, `description: Cut a release: bump the version, update CHANGELOG.md, tag and publish to npm. Use when the user asks to release or publish.`, `disable-model-invocation: true`.',
			'`disable-model-invocation: true` keeps `npm publish` behind you typing `/release`. It also takes the description out of the listing, so the skill costs no context until you run it.',
			'Optional: `allowed-tools: Bash(npm version *) Bash(git tag *)` lets those commands run without a prompt during the `/release` turn only. `npm publish` stays outside it and still prompts. Delete the 180 lines from `CLAUDE.md`.'
		],
		steps: [
			{
				title: 'Lay out the folder',
				questions: [
					{ q: 'Where does the release skill live?', options: ['`.claude/release.md`', 'Under a `## Release` heading in `CLAUDE.md`', '`.claude/skills/release/SKILL.md`', '`.claude/rules/release.md`'], answer: 2, why: 'A skill is a folder under `.claude/skills/` with a `SKILL.md` file in it.' },
					{ q: 'Where do the 120 lines of changelog format go?', options: ['In `changelog-format.md`, next to `SKILL.md`', 'In the body of `SKILL.md`', 'They stay in `CLAUDE.md`', 'In the `description` field'], answer: 0, why: 'Claude needs them only while it writes the changelog, so they go in a file of their own.' },
					{ q: 'What length do the docs ask you to keep `SKILL.md` under?', options: ['40 lines', '500 lines', '180 lines', '1,536 lines'], answer: 1, why: 'The docs ask for "under 500 lines" and for long reference material in separate files. The release steps take about 40.' },
					{ q: 'How does Claude know to open it?', options: ['An `@changelog-format.md` import line', 'A `paths:` field in the frontmatter', 'Claude Code opens every file in the folder', '`SKILL.md` says "Before you write CHANGELOG.md, read changelog-format.md"'], answer: 3, why: 'The body points to the file, as the pdf skill does with "read FORMS.md".' }
				]
			},
			{
				title: 'Write the frontmatter',
				questions: [
					{ q: 'Which `name` gives you the `/release` command?', options: ['`SKILL`', '`release`', '`release-procedure.md`', '`CLAUDE.release`'], answer: 1, why: 'The skill in `.claude/skills/release/` is named `release`, and you run it by typing `/release`.' },
					{ q: 'What belongs in the `description`?', options: ['The 40 lines of steps', 'The current version number', 'What the skill does and when to use it', 'The license terms'], answer: 2, why: 'The description is what Claude reads to decide when a skill applies.' },
					{ q: 'In the listing, where is each entry\'s `description` plus `when_to_use` cut?', options: ['At 500 lines', 'At 5,000 tokens', 'At 1% of the context window', 'At 1,536 characters'], answer: 3, why: 'Each entry is cut at 1,536 characters. The 1% is the budget for the whole listing.' },
					{ q: 'Which field keeps `npm publish` behind you?', options: ['`disable-model-invocation: true`', '`allowed-tools: Bash(npm publish *)`', '`license`', '`when_to_use`'], answer: 0, why: 'With that field, only you can start the skill.' }
				]
			},
			{
				title: 'Keep the publish in your hands',
				questions: [
					{ q: 'Why not leave the field out and write "only when the user asks" in the description?', options: ['Descriptions cannot mention the user', 'The description would be cut at 40 characters', 'Claude reads the description, so it may still start the skill when it decides the code looks ready', 'Then `/release` would stop working'], answer: 2, why: 'A description only steers Claude\'s choice. The field is what takes the choice away from Claude.' },
					{ q: 'What happens to its description in the skill listing?', options: ['It loads in full', 'It stays out of the context', 'It is cut to 1,536 characters', 'It moves to `CLAUDE.md`'], answer: 1, why: 'With that field set, the description stays out of the context.' },
					{ q: 'You ran `/release` early in a long session, and the conversation is then compacted. What of the skill is kept?', options: ['Nothing: skills never survive compaction', 'The whole `SKILL.md` and `changelog-format.md`', 'Only its description', 'Up to its first 5,000 tokens, re-attached after the summary'], answer: 3, why: 'Claude Code re-attaches the most recent invocation of each skill, up to 5,000 tokens each and 25,000 in all, newest first. An early skill can still be dropped.' },
					{ q: 'With that field set, how much context does the skill take before you type `/release`?', options: ['None', 'One description line', 'The 40 lines of steps', 'All 180 lines'], answer: 0, why: 'The description is out of the listing, so nothing loads until you run it.' }
				]
			},
			{
				title: 'Grant tools, then clean up',
				questions: [
					{ q: 'What does `allowed-tools: Bash(npm version *) Bash(git tag *)` do?', options: ['It allows those commands for the rest of the session', 'It lets them run without a prompt during the `/release` turn', 'It saves them to `.claude/settings.local.json`', 'It forbids every other tool'], answer: 1, why: 'The grant applies during the turn that invokes the skill.' },
					{ q: 'Does `npm publish` still prompt during `/release`?', options: ['No, the skill approves every step', 'No, `npm version` covers it', 'Yes, it is not in `allowed-tools`', 'Only on the first release'], answer: 2, why: 'Leaving it out keeps one prompt on the step that cannot be taken back.' },
					{ q: 'The skill is committed. A teammate runs `claude -p` in a fresh clone they never trusted. Does `allowed-tools` apply there?', options: ['Yes, so they should read it before running Claude Code there', 'No, untrusted folders ignore skills', 'No, `-p` runs have no skills', 'Only after they accept the trust dialog'], answer: 0, why: 'The docs warn that `allowed-tools` in a committed skill applies even in a `-p` run in a folder you never trusted.' },
					{ q: 'What is the last step of the move?', options: ['Keep the 180 lines as a backup', 'Import the skill from `CLAUDE.md`', 'Move the lines to `CLAUDE.local.md`', 'Delete the 180 lines from `CLAUDE.md`'], answer: 3, why: 'Left in place, they would still load in every session, which is what the move was for.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'You have a project skill with a default frontmatter. Before you type anything, what of it is in the context?',
			options: [
				'The whole `SKILL.md` body, so Claude can follow it at once',
				'Its name and description, in the skill listing',
				'Nothing, until you type its name with a slash',
				'The body and every file in its folder, compressed'
			],
			answer: 1,
			why: 'By default the description is always in context and the full skill loads when invoked. Files next to `SKILL.md` load only when Claude opens them, which is what keeps unused skills cheap.'
		},
		{
			q: 'A `deploy` skill has `disable-model-invocation: true`. You reply "looks good, ship it" with no slash command. What does Claude do?',
			options: [
				'It runs the deploy skill, because the request matches it',
				'It reads `SKILL.md` and asks you to confirm each step',
				'It cannot start the skill on its own and suggests `/deploy`',
				'It copies the deploy steps into Bash commands and runs them'
			],
			answer: 2,
			why: 'With `disable-model-invocation: true`, the description is not in context and Claude cannot invoke the skill. If Claude tries anyway, Claude Code blocks the call and tells it not to reproduce the steps another way.'
		},
		{
			q: 'A skill has `allowed-tools: Bash(git commit *)`. You invoke it, Claude commits, then you send another message. Does the next `git commit` prompt?',
			options: [
				'No, the grant lasts until the session ends',
				'No, the grant is saved to `.claude/settings.local.json`',
				'Yes, unless the skill is invoked again or an allow rule covers it',
				'Yes, because `allowed-tools` only restricts tools'
			],
			answer: 2,
			why: 'The `allowed-tools` grant applies during the turn that invokes the skill and clears when you send your next message, even though the skill text stays in context. A session-wide approval needs an allow rule in settings.'
		}
	],
	recall: {
		q: 'Which part of a skill is in the context at startup, and when do the rest load?',
		a: 'Only the name and description, in a listing capped at 1% of the context window. The `SKILL.md` body loads when the skill is invoked, and files like `forms.md` only when Claude opens them.'
	},
	sources: [
		{ title: 'Claude Code docs, Extend Claude with skills, read 2026-10-17', url: DOCS },
		{ title: 'Anthropic engineering, Equipping agents for the real world with Agent Skills', url: POST },
		{ title: 'anthropics/skills, skills/pdf/SKILL.md', url: `${SK}/skills/pdf/SKILL.md` },
		{ title: 'anthropics/skills, skills/webapp-testing/SKILL.md', url: `${SK}/skills/webapp-testing/SKILL.md` }
	]
};
