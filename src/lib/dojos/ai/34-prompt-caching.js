const COOKBOOK = 'https://github.com/anthropics/claude-cookbooks/blob/b2b0aa1ff7d8980b005b225d3802969c87bedad5';
const NOTEBOOK = `${COOKBOOK}/misc/prompt_caching.ipynb`;
const DOCS = 'https://platform.claude.com/docs/en/build-with-claude/prompt-caching';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'prompt-caching',
	part: 'Building with the API',
	title: 'Prompt caching',
	minutes: 10,
	hook: [
		'Your app sends the full text of a 187,000-token book with every question about it. Each call takes about 5 seconds, and the model reads the whole book again every time (day 33: the API keeps nothing between calls).',
		'Prompt caching stores the processed start of a prompt for a few minutes. In the Anthropic cookbook run, the same book question took 4.89 s with no cache and **1.48 s when the book came from the cache**.'
	],
	terms: [
		{ term: 'Prefix', def: 'The part of a request from its first token up to a cache breakpoint, in the order `tools`, then `system`, then `messages`.' },
		{ term: 'Cache breakpoint', def: 'A `cache_control: {"type": "ephemeral"}` marker on a content block, or once at the top level of the request. The cached prefix ends at that block, and a request can have up to 4 of them.' },
		{ term: 'Cache write', def: 'The first request with a new prefix stores it, shown as `cache_creation_input_tokens`. Later requests with the same prefix get a cache read, shown as `cache_read_input_tokens`.' },
		{ term: 'TTL', def: 'How long a cache entry lives: 5 minutes by default, or 1 hour at a higher write price. Each read refreshes the entry at no extra cost.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['req1["Request 1: book (187,361 tokens) + question, cache_control on"] --> hash["Hash of the prefix up to the breakpoint"]'],
				highlight: ['req1', 'hash'],
				note: 'The API hashes everything from the start of `tools` to the block with the breakpoint. The docs: "changing any block at or before the breakpoint produces a different hash on the next request". On Claude Sonnet 4.6, a prefix under 1,024 tokens is never cached.'
			},
			{
				add: ['hash -->|"no entry yet"| write["Cache write: 187,361 tokens at 1.25x the input price, 4.28 s"]'],
				highlight: ['write'],
				note: 'The first call finds no entry, processes the whole prompt and stores the prefix. A 5 minute write costs 1.25 times the base input price, so the first call is a little more expensive than no caching. A second request can read the entry only after this first response has begun.'
			},
			{
				add: ['req2["Request 2: same prefix, within 5 minutes"] --> hash', 'hash -->|"entry found"| read["Cache read: 187,361 tokens at 0.1x, 1.48 s"]'],
				highlight: ['req2', 'read'],
				note: 'The second call matches the stored hash and skips processing the book. A read costs 0.1 times the base input price on most models, and 0.05 times on Claude Opus 5.5 and Claude Sonnet 5.5. The 5 minutes count from the start of the request that reads, so each read restarts them.'
			},
			{
				add: ['req3["Request 3: one character changed before the breakpoint"] --> hash', 'hash -->|"different hash"| miss["Miss: full price, and a new write"]'],
				highlight: ['req3', 'miss'],
				note: 'A timestamp at the top of the system prompt changes the hash on every request, so each one pays for a write and never gets a read. Changing a tool definition invalidates the `tools`, `system` and `messages` caches. Changing `tool_choice` only invalidates the `messages` part.'
			},
			{
				add: ['read --> usage["usage: cache_read + cache_creation + input_tokens = total input"]'],
				highlight: ['usage'],
				note: '`input_tokens` counts only the tokens after the last breakpoint: 3 in the cookbook run, against 187,361 read from the cache. If `cache_creation_input_tokens` and `cache_read_input_tokens` are both 0, nothing was cached, and the API returns no error.'
			}
		]
	},
	example: {
		title: 'misc/prompt_caching.ipynb: the same book question, cached and uncached',
		repo: 'anthropics/claude-cookbooks',
		url: NOTEBOOK,
		lang: 'python',
		code: `client = anthropic.Anthropic()
MODEL_NAME = "claude-sonnet-4-6"

# Unique prefix to ensure we don't hit a stale cache from a previous run
TIMESTAMP = int(time.time())
…
start = time.time()
write_response = client.messages.create(
    model=MODEL_NAME,
    max_tokens=300,
    cache_control={"type": "ephemeral"},  # <-- one-line change
    messages=[
        {
            "role": "user",
            "content": str(TIMESTAMP)
            + "<book>"
            + book_content
            + "</book>"
            + "\\n\\nWhat is the title of this book? Only output the title.",
        }
    ],
)
write_time = time.time() - start
…
    response = client.messages.create(
        model=MODEL_NAME,
        max_tokens=300,
        system=[
            {
                "type": "text",
                "text": system_message,
                "cache_control": {"type": "ephemeral"},  # explicit breakpoint on system
            },
        ],
        messages=conv.get_messages(),
    )`,
		notes: [
			'The `cache_control` line in the first call is automatic caching. It goes at the top level, and the API puts the breakpoint on the last cacheable block. The notebook ran this exact call twice: 4.28 s and 187,361 tokens written, then 1.48 s and 187,361 tokens read.',
			'The `TIMESTAMP` at the start of `content` is there on purpose: a new number at each run of the notebook gives a new prefix, so an entry left by an earlier run cannot match. A timestamp in your own prompt does the same thing on every request.',
			'The last call puts `cache_control` on the `system` block itself, an explicit breakpoint. The book sits in `system_message`, which stays the same while the questions in `messages` change at each turn.',
			'With the Claude Sonnet 4.6 prices in the docs table ($3, $3.75 and $0.30 per million tokens for input, 5 minute writes and reads), 187,361 tokens cost about $0.56 uncached, $0.70 for the write and $0.056 for each read.'
		]
	},
	tradeoff: {
		gain: [
			'In the cookbook run, a cache hit cut the call from 4.89 s to 1.48 s, 3.3 times faster.',
			'Each read of the 187,361-token book costs about $0.056 on Claude Sonnet 4.6, against $0.56 without the cache.',
			'A breakpoint adds no cost of its own. You pay for the tokens written, read and left after the last breakpoint.'
		],
		cost: [
			'The first request pays 1.25 times the input price for a 5 minute write, and 2 times for a 1 hour write.',
			'An entry left unread for 5 minutes is gone, and the next call pays for a full write again.',
			'A changed byte before the breakpoint, a changed tool definition or a prompt under the model minimum gives a miss without any error. Only the `usage` fields show it.',
			'A request can read an entry only after the response that wrote it has begun, so 10 requests sent at the same moment all miss.'
		]
	},
	task: {
		prompt: 'A support bot on Claude Sonnet 4.6 sends a 20,000-token policy text as `system`, with "Current time: 14:02:31" on the first line, and `cache_control` on the system block. Every response shows `cache_creation_input_tokens: 20000` and `cache_read_input_tokens: 0`. Explain why, compare the cost per request with no caching at all, and fix it.',
		hint: 'What is the first thing in the prefix hash, and how often does it change?',
		answer: [
			'The time is inside the prefix, at its very start. It changes every second, so every request has a new hash and the lookup never finds an entry that an earlier request wrote.',
			'Each request pays a write: 20,000 × $3.75 per million = $0.075. Without `cache_control` it would pay $0.06. The broken cache costs 25% more than no cache.',
			'Fix: move the time out of `system` and into the user message, after the breakpoint, and keep `cache_control` on the policy block. The policy text is then the same on every request.',
			'Within 5 minutes of a previous request, each one then reads the policy for 20,000 × $0.30 per million = $0.006, and `cache_read_input_tokens` shows 20000.'
		],
		steps: [
			{
				title: 'Read the usage',
				questions: [
					{ q: '`cache_creation_input_tokens: 20000` on a response means what?', options: ['The request read 20,000 tokens from the cache', 'The request wrote a 20,000-token prefix to the cache', 'The cache is full and refused the prefix', 'The policy is under the minimum length'], answer: 1, why: 'A cache write shows as `cache_creation_input_tokens`. A read shows as `cache_read_input_tokens`.' },
					{ q: 'Every response shows `cache_read_input_tokens: 0`. What does that tell you?', options: ['No request ever found an earlier entry', 'Caching is turned off for the account', 'The reads are free, so they show as 0', 'The TTL is set to 1 hour'], answer: 0, why: 'Every request writes and none reads, so each one misses the entry the last one stored.' },
					{ q: 'Is the policy long enough to be cached on Claude Sonnet 4.6?', options: ['No, the minimum is 32,000 tokens', 'Only with the 1 hour TTL', 'Yes: 20,000 is above the 1,024-token minimum', 'Only with a top-level `cache_control`'], answer: 2, why: 'A prefix under 1,024 tokens is never cached on Claude Sonnet 4.6. This one is well above it, and the writes prove it is stored.' },
					{ q: 'In which order does the API build the prefix?', options: ['`messages`, then `system`, then `tools`', '`system`, then `messages`, then `tools`', '`system`, then `tools`, then `messages`', '`tools`, then `system`, then `messages`'], answer: 3, why: 'The prefix runs from the start of `tools` to the block with the breakpoint.' }
				]
			},
			{
				title: 'Find the cause',
				questions: [
					{ q: 'Where does "Current time: 14:02:31" sit in the prefix?', options: ['After the breakpoint, outside the cache', 'At its very start, inside the cached part', 'In the user message', 'In the tool definitions'], answer: 1, why: 'It is the first line of `system`, before the policy and before the breakpoint.' },
					{ q: 'Why does the timestamp break the cache?', options: ['It changes the hash on every request', 'Timestamps are not allowed in `system`', 'It makes the prompt too long', 'It turns off `cache_control`'], answer: 0, why: '"Changing any block at or before the breakpoint produces a different hash on the next request."' },
					{ q: 'How often does that first line change?', options: ['Every 5 minutes', 'Once a day', 'Every second', 'Only when the policy changes'], answer: 2, why: 'A clock to the second gives a new prefix each request, so no lookup finds an earlier entry.' },
					{ q: 'Does the API return an error when no read ever happens?', options: ['Yes, a 400 on the second request', 'Yes, a warning in `stop_reason`', 'Only after 4 breakpoints', 'No: the usage fields are the only sign'], answer: 3, why: 'A cache miss is not an error. You see it in `cache_creation_input_tokens` and `cache_read_input_tokens`.' }
				]
			},
			{
				title: 'Compare the cost',
				questions: [
					{ q: 'At $3.75 per million for 5 minute writes, what does each request pay for the policy?', options: ['$0.006', '$0.06', '$0.075', '$0.75'], answer: 2, why: '20,000 × $3.75 per million is $0.075.' },
					{ q: 'At the $3 per million base input price, what would it pay with no caching?', options: ['$0.06', '$0.075', '$0.006', '$0.6'], answer: 0, why: '20,000 × $3 per million is $0.06.' },
					{ q: 'How does the broken cache compare with no cache?', options: ['It costs the same', 'It costs 10% less', 'It costs 90% less', 'It costs 25% more'], answer: 3, why: 'A write costs 1.25 times the base input price, and here every request pays one.' },
					{ q: 'What would a cache read of the policy cost at $0.30 per million?', options: ['$0.06', '$0.006', '$0.0006', '$0.03'], answer: 1, why: '20,000 × $0.30 per million is $0.006, a tenth of the base price.' }
				]
			},
			{
				title: 'Fix the prefix',
				questions: [
					{ q: 'Where does the time go?', options: ['At the end of `system`, before the breakpoint', 'In a tool description', 'In the user message, after the breakpoint', 'Nowhere: the bot cannot know the time'], answer: 2, why: 'After the breakpoint it no longer changes the hash, so the policy prefix stays the same.' },
					{ q: 'Where does `cache_control` stay?', options: ['On the policy block in `system`', 'On the user message', 'On the first tool', 'Removed entirely'], answer: 0, why: 'The breakpoint on the policy block makes the 20,000 tokens the cached prefix.' },
					{ q: 'After the fix, a request comes 3 minutes after the last one. What does `usage` show?', options: ['`cache_creation_input_tokens: 20000`', 'Both cache fields at 0', '`input_tokens: 20000`', '`cache_read_input_tokens: 20000`'], answer: 3, why: 'Within 5 minutes of a previous request, the policy comes from the cache.' },
					{ q: 'A request arrives every minute, all day. Does the entry expire every 5 minutes?', options: ['Yes, after 5 minutes from the first write', 'No: each read refreshes it at no extra cost', 'Yes, unless you pay for the 1 hour TTL', 'No: entries never expire'], answer: 1, why: 'Each read restarts the 5 minutes, so a steady stream of requests keeps the entry alive.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'You change the description of one tool in `tools` and keep everything else the same. Which cached parts are still valid?',
			options: [
				'The `system` and `messages` parts, because only the `tools` part changed',
				'The `messages` part, because it comes last and holds the conversation',
				'All of them, because tool definitions are never part of the cache',
				'None of them: `tools`, `system` and `messages` are all invalidated'
			],
			answer: 3,
			why: 'The prefix is built in the order `tools`, `system`, `messages`, and a change at one level invalidates that level and every level after it. Tools come first, so a changed tool description invalidates the whole cache.'
		},
		{
			q: 'On Claude Sonnet 4.6, you put `cache_control` on a 300-token system prompt. Both cache fields in `usage` are 0, and no error came back. Why?',
			options: [
				'The prompt is under the 1,024-token minimum, so it was processed without caching',
				'`cache_control` only works at the top level of the request, not on a block',
				'A cache write only appears on the second request with the same prefix',
				'Prompt caching has to be turned on for the account before it works'
			],
			answer: 0,
			why: 'The minimum cacheable length on Claude Sonnet 4.6 is 1,024 tokens. Shorter prompts "will be processed without caching, and no error is returned", so the two usage fields are the only sign.'
		},
		{
			q: 'A response that read a cached prefix takes 4 minutes to stream. With the default TTL, when must the follow-up request start to read the same entry?',
			options: [
				'Within 5 minutes after the response finishes',
				'Within about 1 minute after the response finishes',
				'At any time in the next hour, because each read extends it',
				'Only after you send a request that refreshes the entry'
			],
			answer: 1,
			why: 'The 5 minute lifetime counts from the start of the request that wrote or read the entry. 4 of those minutes went to streaming, so the docs say the follow-up "must start within about 1 minute".'
		}
	],
	recall: {
		q: 'In the cookbook run on the 187,361-token book, how long did the uncached call take, and how long did the call that read the cache take?',
		a: '4.89 s without the cache and 1.48 s with a cache read, 3.3 times faster. The read shows up as `cache_read_input_tokens: 187361`.'
	},
	sources: [
		{ title: 'Claude docs, Prompt caching (pricing table and minimums), read 2026-10-17', url: DOCS },
		{ title: 'anthropics/claude-cookbooks, misc/prompt_caching.ipynb', url: NOTEBOOK }
	]
};
