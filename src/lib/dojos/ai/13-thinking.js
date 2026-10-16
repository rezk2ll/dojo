const SDK = 'https://github.com/anthropics/anthropic-sdk-python/blob/bcd55fe1d3f0f1240765f8cef04295b67337f55a';
const CB = 'https://github.com/anthropics/claude-cookbooks/blob/b2b0aa1ff7d8980b005b225d3802969c87bedad5';
const DOCS = 'https://platform.claude.com/docs/en/build-with-claude';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'thinking',
	part: 'Prompting',
	title: 'Letting the model think',
	minutes: 10,
	hook: [
		'Your support app shows a one-line answer to a customer. The `usage` block of the same response reads `output_tokens: 348`, and under `output_tokens_details`, `thinking_tokens: 312`. The one line cost 36 tokens. The other 312 went to reasoning you never saw.',
		'Current Claude models can work through a problem in `thinking` blocks before they write the answer. You pay for those tokens as output tokens, whether or not the API returns their text.'
	],
	terms: [
		{ term: 'Thinking block', def: 'A `thinking` content block that arrives before the `text` blocks. It holds a summary of the reasoning, or an empty string, plus an encrypted `signature`.' },
		{ term: 'Adaptive thinking', def: 'The mode set by `thinking: {"type": "adaptive"}`: the model decides on each request whether to think and how much.' },
		{ term: 'Effort', def: 'The `output_config.effort` setting, from `low` to `max`. It tells the model how many tokens to spend on the whole response, thinking included.' },
		{ term: 'budget_tokens', def: 'The older fixed thinking budget, `thinking: {"type": "enabled", "budget_tokens": N}`, at least 1,024. Claude 4.7 and later models reject it with a 400 error.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['req["Request: thinking adaptive, effort high, max_tokens 16000"] --> decide{"Think first or answer directly?"}'],
				highlight: ['req', 'decide'],
				note: 'The model makes this choice on each request. The docs: "A simple factual question may get a direct response with no thinking block at all; a multistep math problem or a tricky debugging task triggers deeper reasoning."'
			},
			{
				add: ['decide -->|"hard request"| think["thinking block: summary or empty text, plus signature"]'],
				highlight: ['think'],
				note: 'The block text is a summary written by a different model, never the raw reasoning. On Opus 5.5, Sonnet 5.5 and Haiku 5.5, `display` defaults to `"omitted"`, so the `thinking` field comes back empty unless you ask for `"summarized"`.'
			},
			{
				add: ['think --> text["text block: the answer"]', 'decide -->|"simple request"| text'],
				highlight: ['text'],
				note: 'At `medium` effort the model "may skip thinking for simple queries", and at `low` it skips thinking for simple tasks. A turn with no thinking has no thinking block, so your code must not expect one in every response.'
			},
			{
				add: ['text --> usage["usage: output_tokens 348, of which thinking_tokens 312"]'],
				highlight: ['usage'],
				note: '`output_tokens` is the billed total, thinking included. `thinking_tokens` counts the raw reasoning, not the summary you see, so `output_tokens - thinking_tokens` approximates the answer text.'
			},
			{
				add: ['usage -.->|"thinking plus text reach the cap"| cap["stop_reason: max_tokens"]'],
				highlight: ['cap'],
				note: '`max_tokens` is a hard cap on thinking plus text. A `max_tokens` sized for an answer with no thinking is often too small. The docs give two fixes: raise `max_tokens`, or lower `effort` so less of it goes to thinking.'
			}
		]
	},
	example: {
		title: 'examples/thinking.py: adaptive thinking with a visible summary',
		repo: 'anthropics/anthropic-sdk-python',
		url: `${SDK}/examples/thinking.py#L1-L22`,
		lang: 'python',
		code: `import anthropic

client = anthropic.Anthropic()

response = client.messages.create(
    model="claude-sonnet-5-5",
    max_tokens=16000,
    thinking={"type": "adaptive", "display": "summarized"},
    output_config={"effort": "high"},
    messages=[
        {
            "role": "user",
            "content": "Create a haiku about Anthropic. Think carefully about syllable counts before answering.",
        }
    ],
)

for block in response.content:
    if block.type == "thinking":
        print(f"Thinking: {block.thinking}")
    elif block.type == "text":
        print(f"Text: {block.text}")`,
		notes: [
			'Line 8 asks for adaptive thinking with `display: "summarized"`. Without `display`, Sonnet 5.5 returns the thinking block with an empty `thinking` field and bills the same tokens.',
			'Line 9 sets `effort` to `high`, which is already the Sonnet 5.5 default on the Claude API. The docs say that setting the default "produces exactly the same behavior as omitting the `effort` parameter entirely."',
			'Line 7 gives 16,000 tokens for thinking and the haiku together. Above 21,333 the SDK requires streaming. [thinking_stream.py](' + SDK + '/examples/thinking_stream.py#L5-L9) sends the same request through `client.messages.stream`.',
			'Line 13 steers in plain words: "Think carefully about syllable counts before answering." That sentence asks for more thinking inside the thinking block. A prompt that asks for the reasoning inside the answer text, like a `<scratchpad>` section, may be refused on Sonnet 5.5 with `stop_details.category: "reasoning_extraction"`.'
		]
	},
	tradeoff: {
		gain: [
			'The docs name the tasks that improve: "math, coding, analysis, and long-running agentic work", where the answer depends on intermediate steps.',
			'Adaptive thinking spends nothing on requests it judges simple: at `low` or `medium` effort the response can have no thinking block at all.',
			'With `display: "omitted"`, streaming skips the thinking text, so the first text token arrives sooner.'
		],
		cost: [
			'Thinking is billed as output tokens even when hidden: 312 of the 348 output tokens in the docs\' usage example.',
			'Thinking counts toward `max_tokens`. A cap that fit the answer alone can end the response with `stop_reason: "max_tokens"`.',
			'The thinking configuration and the effort level are part of the prompt. Changing either between requests starts the prompt cache over.',
			'Code that sets `budget_tokens` gets a 400 error on Claude 4.7 and later. On those models you steer with `effort` and cap with `max_tokens`.'
		]
	},
	task: {
		prompt: 'The cookbook classifier `rag_chain_of_thought_classify` (day 12) runs on `claude-haiku-4-5` at temperatures 0 to 0.8. Its prompt says "First you will think step-by-step about the problem in scratchpad tags" and asks for `<scratchpad>` then `<category>` inside `<response>`. You move it to Sonnet 5.5. List what you change, and how you check the cost.',
		hint: 'Look at three things: the scratchpad, the `temperature` values in `promptfooconfig.yaml`, and which effort level a one-label answer needs.',
		answer: [
			'Remove the `<scratchpad>` instruction and keep `<category>`. The refusals docs list "A `<thinking>`, `<reasoning>`, or scratchpad section that the model fills in before it answers" as a common cause of `reasoning_extraction`. Sonnet 5.5 thinks in thinking blocks by default.',
			'Remove the `temperature` settings. On Sonnet 5.5 any non-default `temperature` returns a 400 error, and the default is `1.0`, so 0, 0.2, 0.4, 0.6 and 0.8 all fail.',
			'Run the test set at `low` and `medium` effort as well as the default `high`. The effort docs give `low` for "Simpler tasks that need the best speed and lowest costs", and a ticket label is one short string. If you want no up-front thinking at all, Sonnet 5.5 takes `thinking: {"type": "between_tools"}` at `high` or below.',
			'Record `usage.output_tokens` and `usage.output_tokens_details.thinking_tokens` for each run, next to the share of correct labels. Pick the lowest effort that keeps the score.'
		]
	},
	quiz: [
		{
			q: 'A response has `display: "omitted"`, an empty `thinking` field, `output_tokens: 348` and `thinking_tokens: 312`. How many output tokens are billed?',
			options: [
				'36, because only the visible answer text is billed when thinking is omitted',
				'348, because the hidden thinking is billed in full like any output token',
				'312, because the API bills the thinking and gives the answer text for free',
				'None of the thinking tokens, because omitted thinking is never generated'
			],
			answer: 1,
			why: '`output_tokens` is the billed total and includes the thinking. `display` changes only what you see: "You\'re still charged for the full thinking tokens. Omitting reduces latency, not cost."'
		},
		{
			q: 'An old script sends `thinking: {"type": "enabled", "budget_tokens": 4000}` to Opus 5.5. What happens?',
			options: [
				'The model thinks for at most 4,000 tokens, then writes its answer',
				'The API ignores the budget and runs with adaptive thinking instead',
				'The API rejects the request with a 400 error',
				'The budget is turned into the nearest effort level, here `medium`'
			],
			answer: 2,
			why: 'The extended thinking docs: Claude 4.7 and later models "do not support it and reject requests that use it, returning a 400 error." On Opus 5.5 thinking is always adaptive and `effort` is the control.'
		},
		{
			q: 'Haiku 5.5 thinks before simple FAQ answers and your chat feels slow. What do the docs suggest first?',
			options: [
				'Add "Answer directly without thinking" to the system prompt',
				'Lower `output_config.effort`, for example to `low`',
				'Set `budget_tokens` to the minimum of 1,024 tokens',
				'Raise `max_tokens` so the thinking finishes sooner'
			],
			answer: 1,
			why: 'Effort is the main control for how often the model thinks. The docs note that in Anthropic\'s testing, telling Haiku 5.5 in the prompt to answer directly "didn\'t stop it from thinking", and `budget_tokens` is rejected on Claude 4.7 and later.'
		}
	],
	recall: {
		q: 'On a current Claude model, which two settings bound what thinking costs, and which one is a hard limit?',
		a: '`output_config.effort`, soft guidance from `low` to `max`, and `max_tokens`, the hard cap on thinking plus answer text. `thinking_tokens` in `usage` shows what was spent.'
	},
	sources: [
		{ title: 'Claude docs, Thinking, read 2026-10-17', url: `${DOCS}/thinking` },
		{ title: 'Claude docs, Steering thinking and cost, read 2026-10-17', url: `${DOCS}/thinking-steering-and-cost` },
		{ title: 'Claude docs, Effort, read 2026-10-17', url: `${DOCS}/effort` },
		{ title: 'Claude docs, Extended thinking, read 2026-10-17', url: `${DOCS}/extended-thinking` },
		{ title: 'Claude docs, Refusals and fallback: Keep reasoning in thinking blocks, read 2026-10-17', url: `${DOCS}/refusals-and-fallback#keep-reasoning-in-thinking-blocks` },
		{ title: 'Claude API reference, Create a Message (temperature, usage), read 2026-10-17', url: 'https://platform.claude.com/docs/en/api/messages/create' },
		{ title: 'anthropics/anthropic-sdk-python, examples/thinking.py', url: `${SDK}/examples/thinking.py` },
		{ title: 'anthropics/claude-cookbooks, classification prompts.py', url: `${CB}/capabilities/classification/evaluation/prompts.py#L124-L169` }
	]
};
