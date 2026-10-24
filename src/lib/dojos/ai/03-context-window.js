const AIDER = 'https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c';
const CW = 'https://platform.claude.com/docs/en/build-with-claude/context-windows';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'context-window',
	part: 'How models work',
	title: 'The context window',
	minutes: 10,
	hook: [
		'Your first message in a coding chat said "use 4 spaces, never tabs". Two hours and 80 messages later, the model writes a function indented with tabs. When you scroll up, message 1 still shows the rule.',
		'The model does not remember earlier turns. On every turn, the program sends the whole conversation again, and the model reads **only what is in that request**. If the program shortened the history to fit, your first message may be gone or replaced by a summary.'
	],
	terms: [
		{ term: 'Context window', def: 'The maximum number of tokens one request can hold: everything the model reads plus everything it writes back in that turn.' },
		{ term: 'Harness', def: 'The program between you and the model (a chat app, aider, Claude Code) that builds each request and decides what history to send.' },
		{ term: 'Context rot', def: 'Anthropic’s name for the drop in accuracy and recall as the number of tokens in the context grows.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['sys["System prompt + tool definitions"] --> win["One request: the context window"]', 'hist["Every earlier message, tool result, image"] --> win'],
				highlight: ['sys', 'hist', 'win'],
				note: 'Anthropic’s docs list what counts: "the system prompt, every message in `messages` (including tool results, images, and documents), and your tool definitions." The response’s `usage` field reports how many tokens the request used.'
			},
			{
				add: ['win --> out["Output for this turn, thinking included"]'],
				highlight: ['out'],
				note: 'The output counts against the same window. The docs, read 2026-10-17, give 1M tokens for models such as Claude Opus 5.5 and Claude Sonnet 5.5, with up to 128k output tokens per request. Other models, such as Claude Sonnet 4.5, have 200k.'
			},
			{
				add: ['out -->|"appended to history"| hist'],
				highlight: ['hist'],
				note: 'Each reply goes into the history for the next turn, and the docs say "previous turns are preserved completely". A 2,000-token reply makes every later request 2,000 tokens bigger until the harness removes it.'
			},
			{
				add: ['win -->|"input alone too big"| err["400 invalid_request_error: prompt is too long"]', 'win -->|"generation hits the limit"| stop["stop_reason: model_context_window_exceeded"]'],
				highlight: ['err', 'stop'],
				note: 'If the input alone is larger than the window, the API returns a 400 error with "prompt is too long". On Claude 4.5 models and newer, input plus `max_tokens` may exceed the window. Generation then stops at the limit with `stop_reason: "model_context_window_exceeded"`.'
			},
			{
				add: ['hist -->|"harness trims"| sum["aider: old messages replaced by a summary"]'],
				highlight: ['sum'],
				note: 'A harness keeps requests under the limit by dropping or summarising history. aider summarises once history passes `max_chat_history_tokens`, which is 1/16 of the model’s input limit, between 1,024 and 8,192 tokens. Your first rule survives only if the summary repeats it.'
			}
		]
	},
	example: {
		title: 'aider/history.py: ChatSummary keeps the recent tail and summarises the head',
		repo: 'Aider-AI/aider',
		url: `${AIDER}/aider/history.py#L37-L96`,
		lang: 'python',
		code: `        sized = self.tokenize(messages)
        total = sum(tokens for tokens, _msg in sized)
        if total <= self.max_tokens and depth == 0:
            return messages

        min_split = 4
        if len(messages) <= min_split or depth > 3:
            return self.summarize_all(messages)

        tail_tokens = 0
        split_index = len(messages)
        half_max_tokens = self.max_tokens // 2

        # Iterate over the messages in reverse order
        for i in range(len(sized) - 1, -1, -1):
            tokens, _msg = sized[i]
            if tail_tokens + tokens < half_max_tokens:
                tail_tokens += tokens
                split_index = i
            else:
                break

        # Ensure the head ends with an assistant message
        while messages[split_index - 1]["role"] != "assistant" and split_index > 1:
            split_index -= 1

        if split_index <= min_split:
            return self.summarize_all(messages)

        # Split head and tail
        tail = messages[split_index:]
…
        summary = self.summarize_all(keep)

        # If the combined summary and tail still fits, return directly
        summary_tokens = self.token_count(summary)
        tail_tokens = sum(tokens for tokens, _ in sized[split_index:])
        if summary_tokens + tail_tokens < self.max_tokens:
            return summary + tail

        # Otherwise recurse with increased depth
        return self.summarize_real(summary + tail, depth + 1)`,
		notes: [
			'Lines 39 and 40 return the history untouched while it fits in `self.max_tokens`. In [`models.py`](' + AIDER + '/aider/models.py#L356-L358) that limit is `min(max(max_input_tokens / 16, 1024), 8192)`: 8,192 tokens for a model with a 200k input limit.',
			'Lines 51 to 57 walk backwards from the newest message and keep messages while they total less than half of `max_tokens`. With the 8,192 limit, about the last 4,096 tokens stay word for word.',
			'Line 87 sends the older head to a model with the [`summarize` prompt](' + AIDER + '/aider/prompts.py#L46-L58), which asks for "less detail about older parts and more detail about the most recent messages". The "4 spaces" rule from message 1 is in that head.',
			'Line 96 calls the function again on summary plus tail if the result is still too big, up to `depth > 3`. Each extra pass summarises the previous summary again.'
		]
	},
	tradeoff: {
		gain: [
			'A 1M-token window holds a large codebase excerpt or several long documents in one request, without a harness splitting it.',
			'Summarising the head lets an aider chat run for hours while each request stays near 8,192 tokens of history.'
		],
		cost: [
			'The whole history is sent again on every turn and counts toward the window each time. Prompt caching changes the price of a repeated prefix, and the docs say it does not change "whether they count".',
			'In "Lost in the Middle", GPT-3.5-Turbo with 20 or 30 documents did worse with the answer in the middle than with no documents at all (56.1%).',
			'A summary keeps what the summarising model judged important. A formatting rule from message 1 can be dropped without any error.'
		]
	},
	task: {
		prompt: 'You use aider with a model whose `max_input_tokens` is 200,000. Your chat history reaches 12,000 tokens over 40 messages, and the last 10 messages total 3,900 tokens. Using `history.py`, say what aider sends as history on the next turn. Then name two ways to keep "use 4 spaces" in force.',
		hint: 'Compute `max_chat_history_tokens` first, then half of it for the tail.',
		answer: [
			'`max_chat_history_tokens` is `min(max(200000 / 16, 1024), 8192)`, so 8,192. The history is 12,000 tokens, more than 8,192, so summarising starts.',
			'The tail limit is 8,192 // 2 = 4,096. The loop keeps older messages while the tail stays under 4,096, so the last 10 (3,900 tokens) stay word for word, plus message 30 if it is under 196 tokens.',
			'The older messages, including the "4 spaces" rule, go to `summarize_all`. aider sends one user message starting "I spoke to you previously about a number of things." followed by the tail.',
			'To keep the rule: put it in `CONVENTIONS.md` and load it with `/read CONVENTIONS.md`. aider rebuilds read-only files into every request apart from the summarised history. Or repeat the rule in your current message.'
		],
		steps: [
			{
				title: 'Compute the history limit',
				questions: [
					{ q: 'What is `max_chat_history_tokens` for a model with a 200,000 input limit?', options: ['12,500', '8,192', '1,024', '200,000'], answer: 1, why: '`min(max(200000 / 16, 1024), 8192)`: 200,000 / 16 is 12,500, and the `min` caps it at 8,192.' },
					{ q: 'Why is the limit not 12,500, which is 200,000 / 16?', options: ['aider rounds down to a power of two', 'The `max` raises it to 1,024', 'The `min` caps the result at 8,192', 'The output tokens are taken off first'], answer: 2, why: 'The formula clamps the result between 1,024 and 8,192. 12,500 is above the cap.' },
					{ q: 'The history is 12,000 tokens. What does aider do with it?', options: ['It returns the history untouched', 'It starts summarising, since 12,000 is over 8,192', 'It gets a 400 "prompt is too long" error', 'It drops the 4 oldest messages'], answer: 1, why: 'Lines 39 and 40 only return the history untouched while it fits in `self.max_tokens`.' },
					{ q: 'Would a 6,000-token history be summarised?', options: ['No: it fits under 8,192, so it is returned untouched', 'Yes: every history gets summarised', 'Yes: it is over the 4,096 tail limit', 'Only if it has more than 4 messages'], answer: 0, why: 'The check `total <= self.max_tokens` comes first. Under the limit, nothing changes.' }
				]
			},
			{
				title: 'Find the tail',
				questions: [
					{ q: 'What is the tail limit?', options: ['4,096', '8,192', '6,000', '3,900'], answer: 0, why: '`half_max_tokens = self.max_tokens // 2`, so 8,192 // 2.' },
					{ q: 'In which order does the loop look at messages?', options: ['From message 1 forwards', 'From the middle outwards', 'Largest message first', 'From the newest message backwards'], answer: 3, why: '`range(len(sized) - 1, -1, -1)` starts at the last message and walks back.' },
					{ q: 'Do the last 10 messages, 3,900 tokens, stay word for word?', options: ['No: they get summarised with the rest', 'Yes: 3,900 is under 4,096', 'Only the last 4, set by `min_split`', 'No: the tail must be exactly 4,096'], answer: 1, why: 'The loop keeps adding messages while the tail stays under `half_max_tokens`.' },
					{ q: 'When does message 30 also join the tail?', options: ['If it is under 196 tokens', 'If it is an assistant message', 'Never: the tail is always 10 messages', 'If it is under 4,096 tokens'], answer: 0, why: '4,096 minus 3,900 leaves 196. Message 30 fits only if the tail stays under 4,096 with it.' }
				]
			},
			{
				title: 'Say what aider sends',
				questions: [
					{ q: 'Where does the "4 spaces" rule from message 1 end up?', options: ['In the head, sent to `summarize_all`', 'In the tail, kept word for word', 'In the system prompt', 'Deleted, with no summary at all'], answer: 0, why: 'Message 1 is far older than the tail, so it is in the head that gets summarised.' },
					{ q: 'What does aider’s `summarize` prompt ask for?', options: ['Every rule copied word for word', 'Only the code blocks from each message', '"less detail about older parts and more detail about the most recent messages"', 'The same detail for every message'], answer: 2, why: 'The prompt favours recent messages. A rule from message 1 is in the part that gets the least detail.' },
					{ q: 'How does the summary appear in the next request?', options: ['As one user message starting "I spoke to you previously about a number of things."', 'As an extra system prompt', 'As a tool result', 'As a comment at the top of the edited file'], answer: 0, why: 'aider sends that user message, then the tail word for word.' },
					{ q: 'Why might the model now write tabs?', options: ['The API rejects requests that contain old rules', 'The rule survives only if the summary repeats it', 'The tail always overrides the head', 'aider strips formatting rules on purpose'], answer: 1, why: 'A summary keeps what the summarising model judged important. A formatting rule can be dropped without any error.' }
				]
			},
			{
				title: 'Keep the rule in force',
				questions: [
					{ q: 'Which way keeps the rule in every request, whatever the summary says?', options: ['Write it again in message 1 with "important"', 'Put it in `CONVENTIONS.md` and load it with `/read CONVENTIONS.md`', 'Raise the model’s `max_input_tokens`', 'Ask the model to remember it'], answer: 1, why: 'This is the way the aider docs give for coding conventions.' },
					{ q: 'Why does a read-only file survive the summary?', options: ['The summarising model never shortens files', 'The API caches files between turns', 'Read-only files are part of the model’s training data', 'aider rebuilds read-only files into every request, apart from the summarised history'], answer: 3, why: 'The file is not part of the chat history, so `summarize_all` never touches it.' },
					{ q: 'What is a second way to keep the rule?', options: ['Repeat it in your current message', 'Lower the temperature', 'Switch to a model with a 1M-token window', 'Turn on prompt caching'], answer: 0, why: 'A bigger window does not help: aider caps history at 8,192 tokens. Caching changes the price, not what counts.' },
					{ q: 'Why does repeating the rule in your current message work?', options: ['The API only reads the last message', 'Repeated rules get extra weight from training', 'The newest messages stay word for word in the tail', 'aider marks repeated text as read-only'], answer: 2, why: 'The tail is kept as is, and "Lost in the Middle" found models use information at the end of the context well.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Which of these does Anthropic’s context window page not list as counting toward the window?',
			options: [
				'The tool definitions sent with the request',
				'The text of earlier assistant replies in `messages`',
				'The model’s training data about your library',
				'The output Claude writes for this turn'
			],
			answer: 2,
			why: 'The window is the request: system prompt, every message, tool definitions, and this turn’s output. The docs separate it from "the large corpus of data the language model was trained on".'
		},
		{
			q: 'On a Claude 4.5 or newer model, input plus `max_tokens` is larger than the context window, but the input alone fits. What happens?',
			options: [
				'The API rejects the request with "prompt is too long"',
				'The API drops the oldest messages to make room',
				'The API accepts it and stops at the limit with `model_context_window_exceeded`',
				'The API lowers `max_tokens` and returns `stop_reason: "max_tokens"`'
			],
			answer: 2,
			why: 'The docs: on Claude 4.5 models and newer, "if input tokens plus `max_tokens` exceeds the context window size, the API accepts the request." If generation reaches the limit, `stop_reason` is `"model_context_window_exceeded"`. Only an input that is already too big gets the 400.'
		},
		{
			q: 'Where did "Lost in the Middle" find models used relevant information best?',
			options: [
				'At the beginning or the end of the input context',
				'Evenly anywhere in the context, if it fits',
				'In the middle, where it is furthest from the noise',
				'Only in the very last 100 tokens of the input'
			],
			answer: 0,
			why: 'The paper reports "a distinctive U-shaped performance curve": accuracy is highest when the relevant document is first or last, and drops when it is in the middle.'
		}
	],
	recall: {
		q: 'What does the Claude API return when the input alone is larger than the context window, and what does aider do before that happens?',
		a: 'A 400 `invalid_request_error`, "prompt is too long". aider summarises older messages once history passes `max_chat_history_tokens` (1/16 of the input limit, 1,024 to 8,192 tokens).'
	},
	sources: [
		{ title: 'Claude docs, Context windows, read 2026-10-17', url: CW },
		{ title: 'Liu et al. 2023, Lost in the Middle: How Language Models Use Long Contexts (arXiv 2307.03172)', url: 'https://arxiv.org/abs/2307.03172' },
		{ title: 'Aider-AI/aider, aider/history.py', url: `${AIDER}/aider/history.py` },
		{ title: 'Aider-AI/aider, aider/coders/base_coder.py (format_chat_chunks)', url: `${AIDER}/aider/coders/base_coder.py#L1279-L1294` },
		{ title: 'aider docs, Specifying coding conventions', url: `${AIDER}/aider/website/docs/usage/conventions.md` }
	]
};
