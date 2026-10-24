const SDK = 'https://github.com/anthropics/anthropic-sdk-python/blob/bcd55fe1d3f0f1240765f8cef04295b67337f55a';
const EXAMPLE = `${SDK}/examples/messages.py`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'messages-api',
	part: 'Building with the API',
	title: 'The Messages API',
	minutes: 10,
	hook: [
		'Your script sends "List the three slowest endpoints in this log" to the API and prints a correct answer. A second call sends "And why is the second one slow?", and the answer talks about something else: the model has no idea what "the second one" is.',
		'The API stores no conversation between your two calls, so the second request held one message and nothing else. The docs: "The Messages API is stateless, which means that you always send the full conversational history to the API." **Your code owns the history and sends all of it every time.**'
	],
	terms: [
		{ term: 'Message', def: 'An object with a `role`, either `user` or `assistant`, and a `content`. The `messages` array of a request holds the conversation so far, oldest first.' },
		{ term: 'Content block', def: 'One item of a `content` array, with a `type` such as `text`, `image`, `tool_use` or `thinking`. A plain string as `content` is shorthand for one `text` block.' },
		{ term: 'max_tokens', def: 'The most tokens the model may generate for this response. The model can stop earlier, and it stops here at the latest.' },
		{ term: 'stop_reason', def: 'The field of every successful response that says why the model stopped: `end_turn`, `max_tokens`, `tool_use` and four other values.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['req["Your code: model, max_tokens, messages = [user: Hello, Claude]"] -->|"POST /v1/messages"| api["Messages API"]'],
				highlight: ['req', 'api'],
				note: 'A request needs `model`, `max_tokens` and `messages`. Instructions for the whole conversation go in the top-level `system` field of the request. The reference allows up to 100,000 messages in one request.'
			},
			{
				add: ['api --> resp["Message: role assistant, content [text: Hello!], usage 12 in, 6 out"]'],
				highlight: ['resp'],
				note: 'The response is one `assistant` message. Its `content` is an array of blocks, here a single `text` block. In the docs example, `usage` reports 12 input tokens and 6 output tokens.'
			},
			{
				add: ['resp -->|"stop_reason"| check{"Why did it stop?"}', 'check -->|"end_turn"| done["Answer complete: use it"]'],
				highlight: ['check', 'done'],
				note: '`end_turn` means the model reached a natural stopping point. A stop reason comes with HTTP 200 and valid content. A failed request is different: it returns a 4xx or 5xx status with error details.'
			},
			{
				add: ['check -->|"max_tokens"| cut["Cut off: raise max_tokens or ask it to continue"]', 'check -->|"tool_use"| tool["Run the tool and send its result (day 17)"]'],
				highlight: ['cut', 'tool'],
				note: '`max_tokens` means the text stopped at your limit, often mid-sentence. `tool_use` means the model asks your code to run a tool. The other values are `stop_sequence`, `pause_turn`, `refusal` and `model_context_window_exceeded`.'
			},
			{
				add: ['done --> next["Next call: user, assistant, user, all sent again"]', 'next -->|"input_tokens grows: 30"| api'],
				highlight: ['next'],
				note: 'For a follow-up, your code appends the assistant message and the new user message, and sends the whole list. In the docs, the three-message example reports 30 input tokens against 12 for one message. Earlier assistant turns can be written by you: the docs allow "synthetic `assistant` messages".'
			}
		]
	},
	example: {
		title: 'examples/messages.py: two calls, the second one carries the first answer',
		repo: 'anthropics/anthropic-sdk-python',
		url: `${EXAMPLE}#L1-L35`,
		lang: 'python',
		code: `from anthropic import Anthropic

client = Anthropic()

response = client.messages.create(
    max_tokens=1024,
    messages=[
        {
            "role": "user",
            "content": "Hello!",
        }
    ],
    model="claude-sonnet-5-5",
)
print(response)

response2 = client.messages.create(
    max_tokens=1024,
    messages=[
        {
            "role": "user",
            "content": "Hello!",
        },
        {
            "role": response.role,
            "content": response.content,
        },
        {
            "role": "user",
            "content": "How are you?",
        },
    ],
    model="claude-sonnet-5-5",
)
print(response2)`,
		notes: [
			'Line 3 creates the client with no arguments. The [SDK README](' + SDK + '/README.md#L27-L29) shows that `api_key` defaults to `os.environ.get("ANTHROPIC_API_KEY")`.',
			'Lines 5 to 14 are the smallest valid call: `max_tokens`, `messages` and `model`. Line 10 passes a plain string, which the API reads as one `text` block.',
			'Lines 24 to 27 put the first answer back into the history. `response.content` is the list of blocks exactly as the API returned it, so the second call shows the model its own earlier reply.',
			'Neither call checks `response.stop_reason`. With `max_tokens=1024`, a long answer would come back cut, with HTTP 200 and `stop_reason` set to `max_tokens`, and line 15 would print it like a complete one.'
		]
	},
	tradeoff: {
		gain: [
			'Your code decides exactly what the model sees on each call: it can drop old turns, shorten a long tool result or add a synthetic assistant turn.',
			'Every response has the same shape: a list of typed blocks and a `stop_reason`. One loop handles a text answer and a `tool_use` request (day 17).'
		],
		cost: [
			'The history is sent again on every call, so `input_tokens` grows with each turn. Day 34 shows how prompt caching makes a repeated prefix cheaper.',
			'A cut answer returns HTTP 200, so error handling alone does not catch it. Your code has to read `stop_reason`.',
			'`response.content[0].text` assumes the first block is text. With tools or extended thinking on, `content` can also hold `tool_use` or `thinking` blocks, which have no `text` field.'
		]
	},
	task: {
		prompt: 'A summarizer does `r = client.messages.create(model=..., max_tokens=200, messages=[{"role": "user", "content": doc}])` and returns `r.content[0].text`. Users report summaries that end mid-sentence. Explain what happens and write the few lines that fix the return value.',
		hint: 'Look at `r.stop_reason` and `r.usage.output_tokens` for one of the bad summaries.',
		answer: [
			'For the bad summaries, `r.stop_reason` is `"max_tokens"` and `r.usage.output_tokens` is 200. The model hit the limit, and the API still answered with HTTP 200.',
			'Join the text blocks instead of taking index 0: `text = "".join(b.text for b in r.content if b.type == "text")`.',
			'Then branch on the stop reason: `if r.stop_reason == "max_tokens": raise SummaryTooLong(r.usage.output_tokens)`, or raise `max_tokens`, or send the partial text back as an `assistant` turn followed by a user turn that asks to continue.',
			'The stop reasons docs show that last pattern: up to 3 calls, each one with `"Please continue from where you left off."` until `stop_reason` is no longer `max_tokens`.'
		],
		steps: [
			{
				title: 'Read the bad response',
				questions: [
					{ q: 'Which field tells you why the model stopped?', options: ['`r.usage`', '`r.stop_reason`', '`r.role`', '`r.content[0].type`'], answer: 1, why: 'Every successful response carries a `stop_reason` that says why the model stopped.' },
					{ q: 'For a summary cut mid-sentence, what does `r.stop_reason` show?', options: ['`"end_turn"`', '`"tool_use"`', '`"max_tokens"`', '`"refusal"`'], answer: 2, why: '`max_tokens` means the text stopped at your limit, often mid-sentence.' },
					{ q: 'What does `r.usage.output_tokens` show for those summaries?', options: ['200, the limit in the request', 'Less than 200, since the model stopped early', '0, since the response failed', 'The length of `doc`'], answer: 0, why: 'The model used every token you allowed and stopped at `max_tokens=200`.' },
					{ q: 'Which HTTP status do those cut summaries come back with?', options: ['400', '500', '429', '200'], answer: 3, why: 'A stop reason is part of a successful response. A failed request returns a 4xx or 5xx status instead.' }
				]
			},
			{
				title: 'Explain the cause',
				questions: [
					{ q: 'What does `max_tokens=200` set?', options: ['The most tokens the model may generate for this response', 'The most tokens in the input document', 'The exact length of every answer', 'The size of the context window'], answer: 0, why: 'The model can stop earlier, and it stops at `max_tokens` at the latest.' },
					{ q: 'Why does the code not notice the cut?', options: ['The SDK hides `stop_reason`', 'The API returns an error the code ignores', 'It never checks `r.stop_reason`', 'The cut happens after the response is sent'], answer: 2, why: 'A cut answer looks like a complete one unless you read the stop reason.' },
					{ q: 'What is `r.content`?', options: ['A single string', 'The request history', 'An array of content blocks', 'The `system` prompt echoed back'], answer: 2, why: 'The response is one `assistant` message, and its `content` is an array of blocks.' },
					{ q: 'Why is `r.content[0].text` fragile?', options: ['Index 0 is always a `thinking` block', 'The answer may hold more than one block, not all of type `text`', '`text` is only filled when `stop_reason` is `end_turn`', 'The SDK reverses the block order'], answer: 1, why: 'A content block has a `type` such as `text`, `tool_use` or `thinking`, so the code should keep the text blocks and join them.' }
				]
			},
			{
				title: 'Join the text',
				questions: [
					{ q: 'Which line builds the summary from the response?', options: ['`text = r.content[-1].text`', '`text = str(r.content)`', '`text = r.content[0].text.strip()`', '`text = "".join(b.text for b in r.content if b.type == "text")`'], answer: 3, why: 'It keeps every `text` block and skips the other types.' },
					{ q: 'Why filter on `b.type == "text"`?', options: ['Other block types have no `text` field to join', 'Text blocks come back in random order', 'The API returns duplicates of each block', 'It makes the call cheaper'], answer: 0, why: 'Blocks such as `tool_use` or `thinking` carry other fields, not the summary text.' },
					{ q: 'After joining, is the summary safe to return?', options: ['Yes, joining fixes the cut', 'Yes, if it ends with a period', 'Not yet: check the stop reason first', 'Only if `output_tokens` is under 1024'], answer: 2, why: 'Joining fixes the index problem. The cut is still there when `stop_reason` is `max_tokens`.' },
					{ q: 'A plain string as `content` in the request is shorthand for what?', options: ['A `system` prompt', 'One `text` block', 'An `assistant` turn', 'A list of messages'], answer: 1, why: 'The API reads a plain string as one `text` block.' }
				]
			},
			{
				title: 'Handle the cut',
				questions: [
					{ q: 'Which branch catches a cut summary?', options: ['`if r.stop_reason == "end_turn":`', '`if not r.content:`', '`if r.usage.input_tokens > 200:`', '`if r.stop_reason == "max_tokens":`'], answer: 3, why: 'That is the stop reason a cut answer comes back with.' },
					{ q: 'Which is one of the fixes the answer names?', options: ['Retry the same request with a backoff', 'Raise `max_tokens`', 'Lower `max_tokens` so it fails faster', 'Drop the last sentence and return the rest'], answer: 1, why: 'A higher limit gives the summary room to finish. A retry with the same limit can hit it again.' },
					{ q: 'How do you ask the model to continue a cut summary?', options: ['Send the partial text as an `assistant` turn, then a user turn asking to continue', 'Send the same request again, since the API remembers the cut', 'Pass the response `id` in the next call', 'Put "continue" in the `system` field'], answer: 0, why: 'The API is stateless, so your code sends the partial answer back as history, then the new user turn.' },
					{ q: 'In the stop reasons docs, how many calls does that continue loop allow?', options: ['1', 'Up to 3', 'Up to 10', 'No limit'], answer: 1, why: 'The docs loop up to 3 calls, each one with `"Please continue from where you left off."`.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Your second call sends only `[{"role": "user", "content": "And why is the second one slow?"}]`. What does the model see?',
			options: [
				'Only that one message, because the API keeps no history between calls',
				'That message plus your earlier turns, which the API keeps for 5 minutes',
				'That message plus earlier turns, which the SDK client adds for you',
				'That message plus the turn whose `id` came back in the last response'
			],
			answer: 0,
			why: 'The Messages API is stateless: the model sees the `messages` array of this request and nothing else. The example in `messages.py` shows the fix, sending `response.role` and `response.content` back with the new user turn.'
		},
		{
			q: 'A response comes back with HTTP 200 and `stop_reason: "max_tokens"`. What does that tell you?',
			options: [
				'The request failed, and you should retry it with a backoff',
				'The answer stopped at your `max_tokens` limit and may be cut mid-sentence',
				'The model finished, and used exactly the number of tokens you allowed',
				'The conversation no longer fits in the model context window'
			],
			answer: 1,
			why: 'A stop reason is part of a successful response, and `max_tokens` means generation reached the limit in your request. A full context window has its own value, `model_context_window_exceeded`, and a failed request returns a 4xx or 5xx status instead.'
		},
		{
			q: 'Every answer in the conversation must be in French. Where does that instruction go?',
			options: [
				'In a first message with `"role": "system"` in `messages`',
				'In the `anthropic-version` header of each request',
				'In the top-level `system` field of the request',
				'In an `assistant` message placed before the first user turn'
			],
			answer: 2,
			why: 'The reference says to use the top-level `system` parameter for a system prompt. The guide adds that a `system` message with content "cannot be the first entry in `messages`".'
		}
	],
	recall: {
		q: 'Why does the second `messages.create` call in `messages.py` send the first answer back, and which field tells you an answer was cut short?',
		a: 'The Messages API is stateless, so each request carries the whole history. `stop_reason: "max_tokens"` marks an answer that hit the limit.'
	},
	sources: [
		{ title: 'Claude API reference, Messages, read 2026-10-17', url: 'https://platform.claude.com/docs/en/api/messages' },
		{ title: 'Claude docs, Using the Messages API, read 2026-10-17', url: 'https://platform.claude.com/docs/en/build-with-claude/working-with-messages' },
		{ title: 'Claude docs, Stop reasons and fallback, read 2026-10-17', url: 'https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons' },
		{ title: 'anthropics/anthropic-sdk-python, examples/messages.py', url: EXAMPLE }
	]
};
