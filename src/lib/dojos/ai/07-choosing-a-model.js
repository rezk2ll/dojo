const AIDER = 'https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'choosing-a-model',
	part: 'How models work',
	title: 'Choosing a model',
	minutes: 10,
	hook: [
		'Your team routes 200,000 support tickets a month into 5 queues. Each call sends about 500 input tokens and gets back a 10-token label. The prototype used the strongest model the team knew, and finance asks what it will cost in production.',
		'With the prices on Anthropic’s pricing page on 2026-10-17, Claude Opus 5.5 costs $4 per million input tokens and $20 per million output tokens. A month of tickets sends 100 million input tokens and gets 2 million output tokens back: $440. **Claude Haiku 5.5 costs $0.10 and $0.50 for prompts up to 100,000 tokens, so the same traffic costs $11.**',
		'The price list does not say whether Haiku 5.5 puts the tickets in the right queue.'
	],
	terms: [
		{ term: 'Model tier', def: 'One model in a vendor’s lineup, ordered by capability and price. Anthropic’s current tiers, from lowest to highest cost, are Haiku 5.5, Sonnet 5.5, Opus 5.5 and Fable 5.1.' },
		{ term: 'Effort', def: 'An API parameter that sets how much thinking, tool calling and checking a model does on one request. Lower effort costs less on the same model.' },
		{ term: 'Eval set', def: 'A list of real inputs from your task with the expected output for each, used to score a model before you ship it.' },
		{ term: 'Cost per completed task', def: 'What you paid in tokens divided by the number of tasks the model got right, retries included.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['task["Your task: 200,000 tickets, 5 queues"] --> eval["Eval set: 200 real tickets with the right queue"]'],
				highlight: ['task', 'eval'],
				note: 'The docs’ first step to decide on a model: "Create benchmark tests specific to your use case". They call a good evaluation set "the most important step in the process". Without one, you compare models on the vendor’s benchmarks, which are not your tickets.'
			},
			{
				add: ['eval --> small["Efficiency first: start with Haiku 5.5"]', 'small -->|"fails on some tickets"| up["Upgrade only for the gap"]'],
				highlight: ['small', 'up'],
				note: 'The docs give two ways to start testing models. Efficiency first: build with Claude Haiku 5.5, test, and "Upgrade only if necessary for specific capability gaps". They list it for prototypes, tight latency, tight budgets and "High-volume, straightforward tasks", which matches ticket routing.'
			},
			{
				add: ['eval --> big["Capability first: start with Opus 5.5 at medium effort"]', 'big -->|"passes"| down["Lower effort or move to a smaller tier"]'],
				highlight: ['big', 'down'],
				note: 'Capability first: build with Claude Opus 5.5, then lower effort or move down a tier once it passes. The selection matrix says "Most workloads start with Claude Opus 5.5". Claude Fable 5.1 is the next step if your evals at `xhigh` or `max` effort still fall short.'
			},
			{
				add: ['small --> cmp["Compare cost per completed task"]', 'down --> cmp'],
				highlight: ['cmp'],
				note: 'A model with twice the token prices can cost almost the same per task. On a SWE-bench Pro subset, Sonnet 5.5 at `high` solved 87.6% of tasks for $0.11 per solved task. Opus 5.5 at `low` solved 87.4% for $0.12, although each of its token prices is twice Sonnet’s.'
			},
			{
				add: ['cmp --> mix["Combine: a strong model for the hard steps, a cheap one for the rest"]'],
				highlight: ['mix'],
				note: 'Aider, an open-source coding agent, sends its commit messages and chat summaries to a "weak model" and the code edits to the main model. The docs describe the same pattern: "an orchestrator that delegates bulk work to lower-cost workers".'
			}
		]
	},
	example: {
		title: 'aider/resources/model-settings.yml: three models for one coding session',
		repo: 'Aider-AI/aider',
		url: `${AIDER}/aider/resources/model-settings.yml#L1788-L1800`,
		lang: 'yaml',
		code: `- name: claude-opus-4-20250514
  edit_format: diff
  weak_model_name: claude-3-5-haiku-20241022
  use_repo_map: true
  examples_as_sys_msg: false
  extra_params:
    extra_headers:
      anthropic-beta: prompt-caching-2024-07-31,pdfs-2024-09-25,output-128k-2025-02-19
    max_tokens: 32000
  cache_control: true
  editor_model_name: claude-sonnet-4-20250514
  editor_edit_format: editor-diff
  accepts_settings: ["thinking_tokens"]`,
		notes: [
			'Line 1 names the main model, Claude Opus 4. When you start aider with it, this block picks two helper models for you.',
			'Line 3 sets the weak model to Claude Haiku 3.5. The [aider options page](' + AIDER + '/aider/website/docs/config/options.md) says `--weak-model` is "the model to use for commit messages and chat history summarization". Those tasks are short and easy to check, so the cheapest tier does them.',
			'Line 11 sets the editor model to Claude Sonnet 4. In aider’s `architect` mode, "An architect model will propose changes and an editor model will translate that proposal into specific file edits". The expensive model plans, the cheaper one types the diff.',
			'All three names are dated snapshots from 2024 and 2025. On 2026-10-17, Anthropic’s pricing page lists Claude Opus 4 and Claude Haiku 3.5 as "retired, except on Google Cloud". A model name in a config needs a new test and a new pick when its model is retired.'
		]
	},
	tradeoff: {
		gain: [
			'On GPQA Diamond, Claude Haiku 5.5 scored 85% at about a twentieth of Opus 5.5’s cost per correct answer, in Anthropic’s measurements.',
			'The models overview lists Haiku 5.5’s comparative latency as "Fastest", against "Moderate" for Opus 5.5, which matters when a person waits for each answer.',
			'An eval set of your own tasks lets you re-run the comparison in minutes when a new model ships or an old one is retired.'
		],
		cost: [
			'The same GPQA run gave 91% to Opus 5.5 and Sonnet 5.5: Haiku 5.5 got 6 more questions wrong out of every 100.',
			'The docs on the cheaper model’s misses: "a failed task still bills its tokens, then the retry, then whatever the failure costs downstream".',
			'Haiku 5.5 costs 5 times more per token for a prompt over 100,000 tokens: $0.50 input and $2.50 output per million.'
		]
	},
	task: {
		prompt: 'Your eval set has 200 labeled tickets of about 500 input tokens and a 10-token answer each. Haiku 5.5 puts 184 in the right queue. Opus 5.5 gets 196 right. Using the prices on 2026-10-17 (Haiku 5.5: $0.10 in, $0.50 out per million; Opus 5.5: $4 in, $20 out), give each model’s accuracy and its cost per 1,000 correct tickets. Then say what you check before you pick one.',
		hint: 'One ticket costs 500 × input price + 10 × output price, divided by 1,000,000. Then divide by the share of tickets the model got right.',
		answer: [
			'Haiku 5.5: 184/200 = 92%. One ticket costs (500 × 0.10 + 10 × 0.50) / 1,000,000 = $0.000055. Per 1,000 correct tickets: 0.000055 × 1000 / 0.92 ≈ $0.06.',
			'Opus 5.5: 196/200 = 98%. One ticket costs (500 × 4 + 10 × 20) / 1,000,000 = $0.0022. Per 1,000 correct tickets: 0.0022 × 1000 / 0.98 ≈ $2.24, about 37 times more.',
			'Before picking, read the 16 tickets Haiku 5.5 got wrong. If they land in a queue where a person re-sorts them in a minute, Haiku 5.5 wins. If a wrong queue means a missed outage report, Opus 5.5 makes 12 fewer errors per 200 tickets for about $2.18 more per 1,000 correct tickets.',
			'These numbers count only the 10 visible output tokens. Opus 5.5 runs adaptive thinking always on, so measure the real `usage` of a few calls before you trust the estimate.'
		]
	},
	quiz: [
		{
			q: 'Two models solve almost the same share of your tasks. What should you compare to pick one?',
			options: [
				'The price per million input tokens on the pricing page',
				'Their scores on the public leaderboard of a coding benchmark',
				'The total tokens billed divided by the tasks each one got right',
				'The size of each model’s context window in tokens'
			],
			answer: 2,
			why: 'You pay for every attempt, including the ones that fail and their retries. A model with higher token prices can need fewer tokens per task: Opus 5.5 at `low` cost $0.12 per solved task against $0.11 for Sonnet 5.5, with token prices twice as high.'
		},
		{
			q: 'You send Claude Haiku 5.5 a prompt of 150,000 tokens. Which input price applies, per the pricing page read on 2026-10-17?',
			options: [
				'$0.10 per million, the price shown in the models overview',
				'$0.50 per million, because the prompt is over 100,000 tokens',
				'$0.10 for the first 100,000 tokens and $0.50 for the rest',
				'$4 per million, because long prompts are routed to Opus'
			],
			answer: 1,
			why: 'Haiku 5.5 is priced by prompt length, and the docs say "a request over the threshold pays the higher prices". All 150,000 tokens are billed at $0.50 per million, and the output at $2.50 per million.'
		},
		{
			q: 'In aider’s model settings for Claude Opus 4, which job goes to the model in `weak_model_name`?',
			options: [
				'Writing commit messages and summarizing the chat history',
				'Planning the change in `architect` mode',
				'Turning the plan into file edits in `architect` mode',
				'Retrying a request when the main model returns an error'
			],
			answer: 0,
			why: 'Aider’s options page says `--weak-model` is "the model to use for commit messages and chat history summarization". The editor model, set by `editor_model_name`, writes the file edits, and the main model plans them.'
		}
	],
	recall: {
		q: 'Which two ways to start does Anthropic’s "Choosing the right model" page give, and what number decides between models?',
		a: 'Efficiency first (start with Haiku 5.5, upgrade only for gaps) or capability first (start with Opus 5.5, then lower effort or tier). Compare cost per completed task on your own eval set.'
	},
	sources: [
		{ title: 'Claude docs, Models overview, read 2026-10-17', url: 'https://platform.claude.com/docs/en/models/overview' },
		{ title: 'Claude docs, Choosing the right model, read 2026-10-17', url: 'https://platform.claude.com/docs/en/about-claude/models/choosing-a-model' },
		{ title: 'Claude docs, Pricing, read 2026-10-17', url: 'https://platform.claude.com/docs/en/about-claude/pricing' },
		{ title: 'Claude docs, Optimizing for cost and intelligence, read 2026-10-17', url: 'https://platform.claude.com/docs/en/about-claude/models/optimizing-for-cost-and-intelligence' },
		{ title: 'Aider docs, Chat modes', url: `${AIDER}/aider/website/docs/usage/modes.md` }
	]
};
