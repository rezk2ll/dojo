const CC = 'https://github.com/anthropics/claude-code/blob/c017428c8c27e604840435048d5bce6a9a22c040';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'clear-instructions',
	part: 'Prompting',
	title: 'Clear instructions',
	minutes: 10,
	hook: [
		'You paste a slow function into a chat with Claude and type: "Can you suggest some changes to improve this function?" You get back a list of ideas. The file on disk has not changed, although you wanted the edits made.',
		'Anthropic’s prompting guide describes this exact case: "Claude will sometimes provide suggestions rather than implementing them, even if making changes might be what you intended." **The model did what the sentence asked: it suggested.**'
	],
	terms: [
		{ term: 'Instruction', def: 'The sentence in a prompt that names the action you want, with a verb: change, list, summarize, label.' },
		{ term: 'Context', def: 'What the model cannot guess: who reads the result, why a rule exists, what the result is used for.' },
		{ term: 'Golden rule', def: 'Anthropic’s test for a prompt: give it to a colleague who knows little about the task and ask them to follow it. If they would be confused, the guide says Claude will be confused too.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['v["Can you suggest some changes to improve this function?"] --> s["A list of suggestions, no edit"]'],
				highlight: ['v', 's'],
				note: 'The request asks Claude to "suggest" changes and never asks it to make them. The guide says current Claude models "are trained for precise instruction following". A list of suggestions is a correct answer to this sentence.'
			},
			{
				add: ['a["Instruction: Change this function to improve its performance."] --> e["The function is edited"]'],
				highlight: ['a'],
				note: 'The guide’s fix is to name the action: "Change this function to improve its performance." The same goes for size: the guide rates "Create an analytics dashboard" as less effective than a version that adds "Include as many relevant features and interactions as possible".'
			},
			{
				add: ['c["Context: the reply is read aloud by a text-to-speech engine"] --> a'],
				highlight: ['c'],
				note: 'A rule with its reason works better than the bare rule. The guide compares "NEVER use ellipses" with a version that explains a text-to-speech engine "will not know how to pronounce them". It adds: "Claude is smart enough to generalize from the explanation."'
			},
			{
				add: ['f["Format: 3 numbered steps, under 200 words"] --> a', 'd["Done: apply to every function in the file, not just the first"] --> a'],
				highlight: ['f', 'd'],
				note: 'Say the output format and where the task ends. The guide asks for numbered steps "when the order or completeness of steps matters". The Opus 4.8 guide warns that the model "does not silently generalize an instruction from one item to another", so you state the scope.'
			},
			{
				add: ['g["Golden rule: a colleague with no context follows the prompt"] -->|"confused?"| c'],
				highlight: ['g'],
				note: 'Before you send the prompt, apply the golden rule: "Show your prompt to a colleague with minimal context on the task and ask them to follow it. If they\'d be confused, Claude will be too." Each question the colleague asks is a line missing from the prompt.'
			}
		]
	},
	example: {
		title: '.claude/commands/dedupe.md: the prompt Claude Code’s repo uses to find duplicate issues',
		repo: 'anthropics/claude-code',
		url: `${CC}/.claude/commands/dedupe.md#L1-L18`,
		lang: 'markdown',
		code: `---
allowed-tools: Bash(./scripts/gh.sh:*), Bash(./scripts/comment-on-duplicates.sh:*)
description: Find duplicate GitHub issues
---

Find up to 3 likely duplicate issues for a given GitHub issue.

To do this, follow these steps precisely:

1. Use an agent to check if the Github issue (a) is closed, (b) does not need to be deduped (eg. because it is broad product feedback without a specific solution, or positive feedback), or (c) already has a duplicates comment that you made earlier. If so, do not proceed.
2. Use an agent to view a Github issue, and ask the agent to return a summary of the issue
3. Then, launch 5 parallel agents to search Github for duplicates of this issue, using diverse keywords and search approaches, using the summary from #1
4. Next, feed the results from #1 and #2 into another agent, so that it can filter out false positives, that are likely not actually duplicates of the original issue. If there are no duplicates remaining, do not proceed.
5. Finally, use the comment script to post duplicates:
   \`\`\`
   ./scripts/comment-on-duplicates.sh --potential-duplicates <dup1> <dup2> <dup3>
   \`\`\`
`,
		notes: [
			'Line 6 is the instruction, with a verb and a limit: "Find up to 3 likely duplicate issues". A colleague knows the goal and the maximum size of the result before reading any step.',
			'Lines 10 and 13 say when to stop: a closed issue, broad feedback, an earlier comment, or no duplicates left all end in "do not proceed". These lines tell the model when the right output is no comment at all.',
			'Lines 14 to 17 fix the output: one script, one flag, at most three issue numbers. The model has no choice of format left to guess.',
			'Run the golden rule on line 12. The summary comes from step 2, but the line says "using the summary from #1", and line 13 says "results from #1 and #2" for the outputs of steps 2 and 3. A colleague would ask which steps those numbers mean.'
		]
	},
	tradeoff: {
		gain: [
			'Naming the action gets the action: "Change this function" edits the code where "Can you suggest" returns a list.',
			'The Opus 4.8 guide says literal instruction following "generally performs better for API use cases with carefully tuned prompts, structured extraction, and pipelines".',
			'A stated stop condition, like "If so, do not proceed" in `dedupe.md`, stops the work before the model posts a wrong comment.'
		],
		cost: [
			'Each line of context is input tokens on every call. On a job that runs 200,000 times a month (day 7), 100 extra tokens are 20 million more input tokens.',
			'The Opus 4.8 guide says the model "does not infer requests you didn\'t make". If you want a rule applied to every section, you must write "every section".',
			'A precise prompt can still hold mistakes, like the step numbers in `dedupe.md`. Only a reader who follows it step by step finds them.'
		]
	},
	task: {
		prompt: 'A CI bot gets this prompt with a failing test log: "Look at the failing tests and tell me what\'s up." Rewrite it so a colleague with no context could follow it. The reader of the bot’s output is the developer who opened the pull request, and the reply goes into a pull request comment.',
		hint: 'Write one line each for the action, the context, the format and when the task is done.',
		answer: [
			'Instruction: "For each failing test in the log below, find the line of the diff most likely to have caused the failure." The verb is "find", and the unit of work is one failing test.',
			'Context: "The reply is posted as a comment on the pull request and read by its author, who knows the code but has not seen the CI log."',
			'Format: "For each test, write the test name, the file and line from the diff, and one sentence on why. Use a numbered list, at most 5 items." Done: "If the failure is not caused by the diff, such as a network timeout, say so and stop."',
			'Golden rule check: a colleague can now answer "what do I produce, for whom, in what shape, and when do I stop" from the prompt alone.'
		]
	},
	quiz: [
		{
			q: 'You type "Can you suggest some changes to improve this function?" and Claude lists ideas without editing the file. What happened?',
			options: [
				'The model followed the verb in the request and suggested',
				'The model ran out of output tokens before it could edit',
				'The model needs tool access to change any text at all',
				'The model refuses to change code it did not write'
			],
			answer: 0,
			why: 'Current Claude models are trained for precise instruction following, so "suggest" gets suggestions. The guide’s fix is to name the action: "Change this function to improve its performance."'
		},
		{
			q: 'What is the golden rule in Anthropic’s prompting guide?',
			options: [
				'Put the most important instruction in the last sentence',
				'Write every rule in capital letters so the model sees it',
				'Have a colleague with minimal context follow the prompt',
				'Keep every prompt under 100 tokens to avoid confusion'
			],
			answer: 2,
			why: 'The guide: "Show your prompt to a colleague with minimal context on the task and ask them to follow it. If they\'d be confused, Claude will be too." The model, like that colleague, sees only what the prompt says.'
		},
		{
			q: 'Why does the guide prefer "never use ellipses since the text-to-speech engine will not know how to pronounce them" over "NEVER use ellipses"?',
			options: [
				'Capital letters make the model ignore an instruction',
				'With the reason, the model can apply it to cases the rule omits',
				'Longer prompts always score higher on Anthropic’s evals',
				'The model only follows rules that contain the word "since"'
			],
			answer: 1,
			why: 'The guide says "Claude is smart enough to generalize from the explanation". Knowing the text is read aloud, the model can also avoid other things a speech engine cannot say, which the bare rule does not cover.'
		}
	],
	recall: {
		q: 'What four things should a prompt say, and what is the guide’s golden rule to check it?',
		a: 'The action (with a verb), the context, the format, and when it is done. Golden rule: a colleague with minimal context follows the prompt; if they’d be confused, Claude will be too.'
	},
	sources: [
		{ title: 'Claude docs, Prompting best practices (Be clear and direct, Add context, Tool usage), read 2026-10-17', url: 'https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices' },
		{ title: 'Claude docs, Prompting Claude Opus 4.8 (More literal instruction following), read 2026-10-17', url: 'https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-4-8' },
		{ title: 'anthropics/claude-code, .claude/commands/dedupe.md', url: `${CC}/.claude/commands/dedupe.md` }
	]
};
