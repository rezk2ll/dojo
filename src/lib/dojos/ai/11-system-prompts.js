const AIDER = 'https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c';
const BEST = 'https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices';
const MIDSYS = 'https://platform.claude.com/docs/en/build-with-claude/mid-conversation-system-messages';
const HAIKU = 'https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-haiku-5-5';
const CREATE = 'https://platform.claude.com/docs/en/api/messages/create';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'system-prompts',
	part: 'Prompting',
	title: 'System prompts and roles',
	minutes: 10,
	hook: [
		'You run aider with `--chat-mode ask` and type "what does `parse_args` return?". Before your question reaches the model, aider builds a list of messages. The first one has role `system` and starts with "Act as an expert code analyst." Your question is the last one.',
		'Between the two sit the files you added, a map of the repo and the earlier turns. Aider decides, for each piece of text, which slot it goes in.'
	],
	terms: [
		{ term: 'System prompt', def: 'The text in the top-level `system` field of a Messages API request. It sits ahead of every message in the conversation.' },
		{ term: 'User turn', def: 'A message with `role: "user"` in the `messages` array: a question, a pasted file, a list of tool results.' },
		{ term: 'Role', def: 'A sentence in the system prompt that says who the model acts as, like "You are a helpful coding assistant specializing in Python."' },
		{ term: 'Mid-conversation system message', def: 'A `{"role": "system"}` entry appended inside `messages` at the turn where a new instruction starts to apply.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['req["POST /v1/messages"] --> sys["system: role and rules for the whole session"]'],
				highlight: ['req', 'sys'],
				note: 'The system prompt is its own field, next to `model` and `max_tokens`. The API reference describes it as "a way of providing context and instructions to Claude, such as specifying a particular goal or role."'
			},
			{
				add: ['sys --> msgs["messages: user and assistant turns, alternating"]'],
				highlight: ['msgs'],
				note: 'The `messages` array holds the conversation. The API is stateless, so your code sends the whole array, and the same `system`, on every request. Two `user` turns in a row are combined into one turn.'
			},
			{
				add: ['msgs --> user["last user turn: the question, the files, the logs"]'],
				highlight: ['user'],
				note: 'Text that changes on each request goes in the user turn: the question, a stack trace, the file contents. Aider sends added files as a user message that starts "I have *added these files to the chat*".'
			},
			{
				add: ['sys -.->|"unchanged across turns"| cache[("cached prefix")]'],
				highlight: ['cache'],
				note: 'The docs say the system prompt "is part of the stable prefix, so subsequent turns hit the cache". Editing `system` at turn 30 "invalidates the cache for everything that follows".'
			},
			{
				add: ['user --> mid["role: system message appended at turn 30"]'],
				highlight: ['mid'],
				note: 'For a rule you only need from turn 30 on, append a `{"role": "system"}` message there, and turns 1 to 29 keep their cached prefix. The docs list this for Opus 5.5, Sonnet 5.5 and Haiku 5.5, among others, and not for Sonnet 5.'
			}
		]
	},
	example: {
		title: 'aider/coders/base_coder.py: format_chat_chunks, the system prompt first and a reminder last',
		repo: 'Aider-AI/aider',
		url: `${AIDER}/aider/coders/base_coder.py#L1226-L1331`,
		lang: 'python',
		code: `    def format_chat_chunks(self):
        self.choose_fence()
        main_sys = self.fmt_system_prompt(self.gpt_prompts.main_system)
…
        if self.gpt_prompts.system_reminder:
            main_sys += "\\n" + self.fmt_system_prompt(self.gpt_prompts.system_reminder)

        chunks = ChatChunks()

        if self.main_model.use_system_prompt:
            chunks.system = [
                dict(role="system", content=main_sys),
            ]
        else:
            chunks.system = [
                dict(role="user", content=main_sys),
                dict(role="assistant", content="Ok."),
            ]

        chunks.examples = example_messages

        self.summarize_end()
        chunks.done = self.done_messages

        chunks.repo = self.get_repo_messages()
        chunks.readonly_files = self.get_readonly_files_messages()
        chunks.chat_files = self.get_chat_files_messages()
…
        chunks.cur = list(self.cur_messages)
        chunks.reminder = []
…
        max_input_tokens = self.main_model.info.get("max_input_tokens") or 0
        # Add the reminder prompt if we still have room to include it.
        if (
            not max_input_tokens
            or total_tokens < max_input_tokens
            and self.gpt_prompts.system_reminder
        ):
            if self.main_model.reminder == "sys":
                chunks.reminder = reminder_message
            elif self.main_model.reminder == "user" and final and final["role"] == "user":
                # stuff it into the user message
                new_content = (
                    final["content"]
                    + "\\n\\n"
                    + self.fmt_system_prompt(self.gpt_prompts.system_reminder)
                )
                chunks.cur[-1] = dict(role=final["role"], content=new_content)`,
		notes: [
			'Line 3 fills `main_sys` from `main_system`. In ask mode that is the text in [ask_prompts.py](' + AIDER + '/aider/coders/ask_prompts.py#L7-L12): "Act as an expert code analyst. Answer questions about the supplied code. Always reply to the user in {language}." A role, a task and a language rule.',
			'The `if self.main_model.use_system_prompt` branch sends `main_sys` with role `system`. For a model without system prompt support, the `else` branch sends it as a user message and adds a fake assistant reply, "Ok.".',
			'The `chunks.repo`, `chunks.readonly_files` and `chunks.chat_files` lines fill the slots after the system prompt with the repo map and the files. These change between requests, so they stay out of `main_sys`.',
			'The last block repeats `system_reminder` after your newest message, as a `system` message or appended to your user turn. When aider knows the model limit, it adds the reminder only while `total_tokens < max_input_tokens`.'
		]
	},
	tradeoff: {
		gain: [
			'With prompt caching on, a `system` field that stays the same is part of the cached prefix. The cache order is `tools`, `system`, then `messages`, so turns 2 to 40 can read it from the cache.',
			'A rule written once in `system` applies to every turn. The Haiku 5.5 guide suggests adding "The rules in this system prompt hold for the whole conversation." for a support chatbot.',
			'Keeping the question and the files in the user turn lets you swap them each request without touching the cached `system` text.'
		],
		cost: [
			'A rule you add to `system` mid-session changes the start of the prompt and invalidates the cache for every later turn.',
			'A mid-conversation system message avoids that, but only on the models the docs list. On Sonnet 5 you are back to editing `system`.',
			'Aider sends `system_reminder` twice per request, once inside `main_sys` and once after your newest message, so every request pays for those tokens again.'
		]
	},
	task: {
		prompt: 'You build a support bot for a CLI called `acme`. Sort these six pieces of text into the `system` field, the user turn, or a mid-conversation system message: (1) "You are the support assistant for the acme CLI." (2) "Reply in French." (3) the stack trace the user pasted (4) "Never promise a refund." (5) the section of the v2.3 README your code fetched for this question (6) at turn 30, your billing service reports that this user is now on the free plan.',
		hint: 'Ask of each piece: does it hold from the first turn to the last, does it change with every question, or does it start to hold partway through?',
		answer: [
			'`system`: (1), (2) and (4). They hold for the whole session and stay byte for byte the same, so they stay in the cached prefix.',
			'User turn: (3) and (5). The next question brings a different trace and a different README section. Aider does the same with files: they go in a user message, never in `main_sys`.',
			'Mid-conversation system message: (6). It starts to apply at turn 30. Appending `{"role": "system"}` there keeps the cache for turns 1 to 29.',
			'On a model without mid-conversation system messages, such as Sonnet 5, put (6) in the next user turn as text from your app, or edit `system` and accept one cache miss.'
		],
		steps: [
			{
				title: 'Find what holds all session',
				questions: [
					{ q: 'Where does (1), "You are the support assistant for the acme CLI.", go?', options: ['The `system` field', 'The user turn', 'A mid-conversation system message', 'A tool definition'], answer: 0, why: 'It is a role. It holds from the first turn to the last, so it belongs in `system`.' },
					{ q: 'Where does (4), "Never promise a refund.", go?', options: ['The user turn, next to each question', 'A mid-conversation system message', 'The `system` field', 'A final assistant message'], answer: 2, why: 'A rule for the whole session, written once, applies to every turn.' },
					{ q: 'Why does it matter that (1), (2) and (4) stay byte for byte the same?', options: ['They stay in the cached prefix, so later turns hit the cache', 'The API rejects a `system` field that changes', 'The model reads `system` only on the first request', 'Two identical `system` fields are merged into one'], answer: 0, why: 'The docs say the system prompt "is part of the stable prefix, so subsequent turns hit the cache".' },
					{ q: 'In what order does prompt caching read the prefix?', options: ['`messages`, `system`, then `tools`', '`system`, `tools`, then `messages`', '`tools`, `system`, then `messages`', '`tools`, `messages`, then `system`'], answer: 2, why: 'The cache order is `tools`, `system`, then `messages`, so a stable `system` sits early in the prefix.' }
				]
			},
			{
				title: 'Sort what changes each question',
				questions: [
					{ q: 'Where does (3), the stack trace the user pasted, go?', options: ['The `system` field', 'The user turn', 'A mid-conversation system message', 'The `metadata` field'], answer: 1, why: 'The next question brings a different trace. Text that changes on each request goes in the user turn.' },
					{ q: 'Where does (5), the README section your code fetched, go?', options: ['The user turn', 'The `system` field, since docs rarely change', 'A mid-conversation system message', 'A tool definition'], answer: 0, why: 'Your code fetched it for this question. The next question needs a different section.' },
					{ q: 'What happens if you put (5) in `system`?', options: ['The model treats it as the user question', 'The API drops long text from `system`', 'Nothing: `system` is not part of the cache', '`system` changes each request, so the cache misses'], answer: 3, why: 'A change to `system` changes the start of the prompt and invalidates the cache for everything after it.' },
					{ q: 'How does aider send the files you add?', options: ['Inside `main_sys`, after the role line', 'As a user message that starts "I have *added these files to the chat*"', 'As a mid-conversation system message', 'As a tool result'], answer: 1, why: 'Aider keeps files out of `main_sys` because they change between requests.' }
				]
			},
			{
				title: 'Place the turn 30 change',
				questions: [
					{ q: 'Where does (6), the move to the free plan at turn 30, go?', options: ['An edit to the `system` field at turn 30', 'The user turn, as if the user asked it', 'A `{"role": "system"}` message appended at turn 30', 'Nowhere: the API is stateless'], answer: 2, why: 'It starts to apply partway through, which is what a mid-conversation system message is for.' },
					{ q: 'Why not just edit `system` at turn 30?', options: ['Editing `system` invalidates the cache for everything that follows', 'The API refuses changes to `system` after turn 1', 'The model reads only the first `system` it sees', 'An edit to `system` applies only to the next reply'], answer: 0, why: 'The docs warn that editing `system` at turn 30 "invalidates the cache for everything that follows".' },
					{ q: 'What does appending the system message at turn 30 keep?', options: ['A cached copy of the reply at turn 30', 'The cached prefix for turns 1 to 29', 'The cache for the `tools` field only', 'The user turn from turn 29 only'], answer: 1, why: 'The earlier prefix stays unchanged, so turns 1 to 29 keep their cache.' },
					{ q: 'The API is stateless. What does your code send at turn 31?', options: ['Only the newest user turn', 'The `system` field and the newest user turn', 'Only the system message from turn 30', 'The same `system` and the whole `messages` array, turn 30 message included'], answer: 3, why: 'Your code sends the whole array, and the same `system`, on every request.' }
				]
			},
			{
				title: 'Plan for older models',
				questions: [
					{ q: 'Which model do the docs leave out of the mid-conversation system message list?', options: ['Opus 5.5', 'Sonnet 5.5', 'Haiku 5.5', 'Sonnet 5'], answer: 3, why: 'The docs list Opus 5.5, Sonnet 5.5 and Haiku 5.5, among others, and not Sonnet 5.' },
					{ q: 'On Sonnet 5, what is one way to deliver (6)?', options: ['In the next user turn, as text from your app', 'As `role: "system"` anyway', 'In the `metadata` field', 'Drop it: the bot cannot learn mid-session'], answer: 0, why: 'The user turn takes text that starts to matter now, without touching the cached `system`.' },
					{ q: 'What is the other way on Sonnet 5, and its cost?', options: ['Start a new conversation with no history', 'Edit `system` and accept one cache miss', 'Edit `system` for free, since caching is off', 'Add a tool whose description holds the rule'], answer: 1, why: 'Editing `system` works on any model. You pay with one cache miss for the turns that follow.' },
					{ q: 'Whatever you do with (6), which pieces stay unchanged in `system`?', options: ['Only (1)', '(3) and (5)', '(1), (2) and (4)', '(1), (2), (4) and (5)'], answer: 2, why: 'The role, the language rule and the refund rule hold for the whole session.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Where does the system prompt go in a Messages API request?',
			options: [
				'In the top-level `system` field, next to `model` and `messages`',
				'In the first user message, after the prefix `SYSTEM:`',
				'In the `metadata` field, which the model reads before any message',
				'In a final assistant message that the model continues from'
			],
			answer: 0,
			why: 'The API reference lists `system` as a body parameter, a string or an array of text blocks. The model reads it ahead of every message in `messages`.'
		},
		{
			q: 'In aider, `use_system_prompt` is false for the current model. What does `format_chat_chunks` send in place of a system message?',
			options: [
				'Nothing: the rules in `main_system` are dropped for that model',
				'The rules appended to the end of your newest user message',
				'A user message holding `main_sys`, then an assistant message "Ok."',
				'A tool definition whose description holds the rules'
			],
			answer: 2,
			why: 'The `else` branch builds two messages: `dict(role="user", content=main_sys)` and `dict(role="assistant", content="Ok.")`. The model sees the rules as a user turn that it already answered.'
		},
		{
			q: 'At turn 30 you need a new rule. Why do the docs suggest appending a `role: "system"` message over editing the `system` field?',
			options: [
				'The API rejects any change to `system` after the first request',
				'Editing `system` changes the start of the prompt, so later turns miss the cache',
				'The model reads only the first 1,000 tokens of the `system` field',
				'A `system` edit applies only to the response that comes right after it'
			],
			answer: 1,
			why: 'Prompt caching reuses a prefix in the order `tools`, `system`, then `messages`. A change to `system` changes that prefix, so the cache for everything after it is invalidated. An appended message leaves the earlier prefix unchanged.'
		}
	],
	recall: {
		q: 'In aider ask mode, where does "Act as an expert code analyst." go, and where does your question go?',
		a: 'The role line is in `main_system`, sent as the first message with role `system`. Your question is the last user message in the list that `format_chat_chunks` builds.'
	},
	sources: [
		{ title: 'Claude docs, Prompting best practices: Give Claude a role, read 2026-10-17', url: `${BEST}#give-claude-a-role` },
		{ title: 'Claude API reference, Create a Message, read 2026-10-17', url: CREATE },
		{ title: 'Claude docs, Mid-conversation system messages and tool changes, read 2026-10-17', url: MIDSYS },
		{ title: 'Claude docs, Prompting Claude Haiku 5.5: Keep chatbots to their system prompt, read 2026-10-17', url: `${HAIKU}#keep-chatbots-to-their-system-prompt` },
		{ title: 'Claude docs, Prompt caching, read 2026-10-17', url: 'https://platform.claude.com/docs/en/build-with-claude/prompt-caching' },
		{ title: 'Aider-AI/aider, aider/coders/ask_prompts.py', url: `${AIDER}/aider/coders/ask_prompts.py` },
		{ title: 'Aider-AI/aider, aider/coders/base_coder.py', url: `${AIDER}/aider/coders/base_coder.py#L1226-L1331` }
	]
};
