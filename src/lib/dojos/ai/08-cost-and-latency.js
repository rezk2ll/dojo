const COOK = 'https://github.com/anthropics/claude-cookbooks/blob/b2b0aa1ff7d8980b005b225d3802969c87bedad5';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'cost-and-latency',
	part: 'How models work',
	title: 'Cost and latency',
	minutes: 10,
	hook: [
		'A Claude cookbook notebook sends the SQLite b-tree source, `btree.h` and `btree.c`, to Claude Sonnet 4.6 and asks: "What is the purpose of the BtShared structure?" The first word of the answer arrives after 20.87 seconds. The full answer of 362 tokens is done at 28.32 seconds.',
		'The same notebook sends the same question again with the source already cached. **The first word now arrives after 1.94 seconds.** The answer still takes about 6.5 more seconds to finish.'
	],
	terms: [
		{ term: 'Input tokens', def: 'Every token you send in a request: system prompt, earlier turns, documents, tool definitions and the question.' },
		{ term: 'Output tokens', def: 'Every token the model generates in its reply, thinking included. On every current Claude model, an output token costs 5 times an input token.' },
		{ term: 'TTFT', def: 'Time to first token: the time from sending the request to receiving the first token of the reply. Your code can measure it only on a streamed response.' },
		{ term: '`usage`', def: 'The object in every Messages API response that counts the tokens of that request, split by kind. Anthropic bills each request from these counts.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['req["Request: 151,629 tokens of SQLite source + a 22-token question"] --> api["Messages API, streaming"]'],
				highlight: ['req'],
				note: 'The notebook sends one user message: the two source files, marked with `cache_control`, then the question. The question is 22 tokens. The source is 151,629 tokens, almost 7,000 times more.'
			},
			{
				add: ['api -->|"20.87 s"| first["First text token arrives: TTFT"]'],
				highlight: ['first'],
				note: 'TTFT is how long the user stares at an empty answer box. The docs define it as "the time it takes for the model to generate the first token of the response, from when the prompt was sent". On this cold request it was 20.87 seconds.'
			},
			{
				add: ['first -->|"7.45 s for 362 tokens"| done["Last token: total 28.32 s"]'],
				highlight: ['done'],
				note: 'After the first token, the time depends on how much the model writes. 362 output tokens took 28.32 − 20.87 = 7.45 seconds, about 49 tokens per second. On the warm run, 330 tokens took 6.46 seconds, about the same speed.'
			},
			{
				add: ['done --> usage["usage: input_tokens 22, cache_creation_input_tokens 151,629, output_tokens 362"]'],
				highlight: ['usage'],
				note: 'The final message carries `usage`. The API reference: "Total input tokens in a request is the summation of `input_tokens`, `cache_creation_input_tokens`, and `cache_read_input_tokens`." Here `input_tokens` is only 22, because the source went into the cache.'
			},
			{
				add: ['usage -->|"Sonnet 4.6 prices, read 2026-10-17"| bill["$0.569 cache write + $0.005 output ≈ $0.574"]', 'warm["Same request, source read from cache"] -->|"TTFT 1.94 s"| bill2["$0.0455 cache read + $0.005 output ≈ $0.051"]'],
				highlight: ['bill', 'bill2'],
				note: 'With the pricing page’s Sonnet 4.6 rates, a 5-minute cache write costs $3.75 per million tokens and a cache hit $0.30. The cold request costs about $0.57, almost all of it input. The warm one costs about $0.05, and its TTFT drops by 90.7%.'
			}
		]
	},
	example: {
		title: 'misc/speculative_prompt_caching.ipynb: measuring TTFT and total time on a stream',
		repo: 'anthropics/claude-cookbooks',
		url: `${COOK}/misc/speculative_prompt_caching.ipynb`,
		lang: 'python',
		code: `    print("\\nSending request to API...")
    start_time = time.time()

    # Measure time to first token
    first_token_time = None
    async with client.messages.stream(
        messages=[full_message],
        model=MODEL,
        **DEFAULT_CLIENT_ARGS,
    ) as stream:
        async for text in stream.text_stream:
            if first_token_time is None and text.strip():
                first_token_time = time.time() - start_time
                print(f"\\n🕐 Time to first token: {first_token_time:.2f} seconds")
                break

        # Get the full response
        response = await stream.get_final_message()

    total_time = time.time() - start_time
    print(f"Total response time: {total_time:.2f} seconds")
    print_query_statistics(response, "Standard Caching")`,
		notes: [
			'Line 2 starts the clock just before the request. Line 6 uses `messages.stream`, so text arrives in chunks: without a stream, the first token and the last token reach your code at the same moment.',
			'Lines 12 and 13 record TTFT at the first chunk that holds visible text, `text.strip()`. Line 15 leaves the loop, and line 18 waits for the rest of the message with `get_final_message()`.',
			'Line 20 gives the total time, so total minus TTFT is the generation time. Measure both: a long prompt mostly raises TTFT, a long answer mostly raises the time after it.',
			'Line 22 prints `usage` from the final message: `input_tokens`, `output_tokens`, `cache_read_input_tokens` and `cache_creation_input_tokens`. These are the counts you multiply by the [pricing page](https://platform.claude.com/docs/en/about-claude/pricing) rates.'
		]
	},
	tradeoff: {
		gain: [
			'Reading the 151,629 tokens from the cache cut TTFT from 20.87 to 1.94 seconds and each question’s cost from about $0.57 to about $0.05.',
			'`max_tokens` puts a hard ceiling on output tokens, which are the expensive ones: $15 per million on Sonnet 4.6 against $3 for input.',
			'`usage` comes back on every response, so you can log real cost per request instead of estimating it from a price list.'
		],
		cost: [
			'A cache write costs more than a plain input token: $3.75 against $3 per million on Sonnet 4.6. If nobody asks a second question, the cache only added cost.',
			'The docs warn that at `max_tokens` "the response will be cut off, perhaps mid-sentence or mid-word". With `max_tokens: 50`, a 200-token answer stops after its first 50 tokens.',
			'`usage` counts do not map one to one onto the text you see. The API reference: "`output_tokens` will be non-zero, even for an empty string response from Claude."'
		]
	},
	task: {
		prompt: 'The notebook’s cold request reports `input_tokens: 22`, `cache_creation_input_tokens: 151629`, `output_tokens: 362`. The warm request reports `input_tokens: 22`, `cache_read_input_tokens: 151629`, `output_tokens: 330`. With Claude Sonnet 4.6 prices read on 2026-10-17 ($3 input, $3.75 for a 5-minute cache write, $0.30 for a cache hit, $15 output, per million tokens), compute the cost of each request. Then say what costs most in each one.',
		hint: 'Multiply each of the three counts by its own price, add them, and divide by 1,000,000.',
		answer: [
			'Cold: 22 × 3 = 66, plus 151,629 × 3.75 ≈ 568,609, plus 362 × 15 = 5,430. Total ≈ 574,105 / 1,000,000 ≈ $0.574. The cache write is 99% of it.',
			'Warm: 22 × 3 = 66, plus 151,629 × 0.30 ≈ 45,489, plus 330 × 15 = 4,950. Total ≈ 50,505 / 1,000,000 ≈ $0.051. The cache read is still about 90% of it.',
			'Output is a small part of both bills here because the answer is short. A 300-token prompt with a 4,000-token answer would flip it: output would be 98% of the cost at these prices.'
		],
		steps: [
			{
				title: 'Read the `usage` fields',
				questions: [
					{ q: 'How many input tokens does the cold request have in total?', options: ['22', '151,629', '151,651', '152,013'], answer: 2, why: 'Total input is `input_tokens` plus `cache_creation_input_tokens` plus `cache_read_input_tokens`: 22 + 151,629.' },
					{ q: 'Why is `input_tokens` only 22?', options: ['The source is counted in the cache fields instead', 'The API dropped the source to save tokens', 'Only the question is ever billed', 'The source was too long and got truncated'], answer: 0, why: 'The source was marked with `cache_control`, so its 151,629 tokens show up as a cache write, not as plain input.' },
					{ q: 'Which price applies to `cache_creation_input_tokens`?', options: ['$3 per million, plain input', '$3.75 per million, a 5-minute cache write', '$0.30 per million, a cache hit', '$15 per million, output'], answer: 1, why: 'Writing to the cache costs more than a plain input token on Sonnet 4.6.' },
					{ q: 'Which price applies to `cache_read_input_tokens`?', options: ['$3 per million', '$3.75 per million', '$0.30 per million', '$15 per million'], answer: 2, why: 'A cache hit is a tenth of the plain input price on Sonnet 4.6.' }
				]
			},
			{
				title: 'Price the cold request',
				questions: [
					{ q: 'What is 151,629 × 3.75, the cache write part?', options: ['About 568,609', 'About 454,887', 'About 45,489', 'About 5,430'], answer: 0, why: 'The cache write price is $3.75 per million, not the $3 of plain input.' },
					{ q: 'What is the output part, 362 × 15?', options: ['1,086', '4,950', '362', '5,430'], answer: 3, why: 'Output costs $15 per million on Sonnet 4.6.' },
					{ q: 'What does the cold request cost in total?', options: ['About $0.455', 'About $0.574', 'About $0.051', 'About $5.74'], answer: 1, why: '66 + 568,609 + 5,430 ≈ 574,105, divided by 1,000,000.' },
					{ q: 'What share of the cold cost is the cache write?', options: ['About 99%', 'About 50%', 'About 90%', 'About 1%'], answer: 0, why: '568,609 of 574,105. The question and the answer barely count next to the source.' }
				]
			},
			{
				title: 'Price the warm request',
				questions: [
					{ q: 'What is 151,629 × 0.30, the cache read part?', options: ['About 568,609', 'About 4,549', 'About 45,489', 'About 454,887'], answer: 2, why: 'The cache hit price is $0.30 per million.' },
					{ q: 'What is the output part, 330 × 15?', options: ['4,950', '5,430', '990', '330'], answer: 0, why: 'The warm answer is 330 tokens, a little shorter than the cold one.' },
					{ q: 'What does the warm request cost in total?', options: ['About $0.574', 'About $0.046', 'About $0.51', 'About $0.051'], answer: 3, why: '66 + 45,489 + 4,950 ≈ 50,505, divided by 1,000,000.' },
					{ q: 'What share of the warm cost is the cache read?', options: ['About 99%', 'About 90%', 'About 10%', 'About 50%'], answer: 1, why: '45,489 of 50,505. Reading 151,629 tokens is still most of the bill, even at the cache price.' }
				]
			},
			{
				title: 'Say what costs most',
				questions: [
					{ q: 'What costs most in the cold request?', options: ['Writing the source to the cache', 'The 362 output tokens', 'The 22-token question', 'The 20.87 seconds of TTFT'], answer: 0, why: 'It is 99% of the cold bill.' },
					{ q: 'What costs most in the warm request?', options: ['The 330 output tokens', 'Reading the source from the cache', 'The 22-token question', 'Writing the cache again'], answer: 1, why: 'At about 90% of the bill, the cache read still beats the output.' },
					{ q: 'Why is output a small part of both bills?', options: ['Output tokens cost less than input tokens', 'Output tokens are cached too', 'The answer is short', '`max_tokens` caps the output price'], answer: 2, why: 'An output token costs 5 times a plain input token, but there are only about 350 of them against 151,629 of source.' },
					{ q: 'A 300-token prompt gets a 4,000-token answer at these prices. What share of the cost is output?', options: ['About 50%', 'About 10%', 'About 75%', 'About 98%'], answer: 3, why: '4,000 × 15 = 60,000 against 300 × 3 = 900. A long answer flips the bill toward output.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Which `usage` fields add up to the total input tokens of a request?',
			options: [
				'Only `input_tokens`, which already includes the cached part',
				'`input_tokens` plus `output_tokens`, the two halves of one call',
				'`input_tokens`, `cache_creation_input_tokens` and `cache_read_input_tokens`',
				'`cache_read_input_tokens` alone, when prompt caching is on'
			],
			answer: 2,
			why: 'The API reference states that total input "is the summation of `input_tokens`, `cache_creation_input_tokens`, and `cache_read_input_tokens`". In the notebook, `input_tokens` was 22 while 151,629 more tokens went through the cache fields.'
		},
		{
			q: 'Claude Opus 5.5 thinks before each answer. Where do its thinking tokens appear in `usage`?',
			options: [
				'Nowhere: thinking tokens are free and not counted',
				'Inside `output_tokens`, with a breakdown in `output_tokens_details`',
				'Inside `input_tokens`, because the model reads its own thinking',
				'In `cache_creation_input_tokens`, since thinking is cached'
			],
			answer: 1,
			why: 'The API reference: "`output_tokens` remains the inclusive, authoritative total used for billing". `output_tokens_details.thinking_tokens` reports how many of those were reasoning. Thinking tokens are billed at the output price, $20 per million on Opus 5.5.'
		},
		{
			q: 'With the cache warm, TTFT is 1.94 s and the full answer ends at 8.40 s. What would most shorten the remaining 6.46 s?',
			options: [
				'Caching the 22-token question as well as the source',
				'Removing the system prompt from the request',
				'Raising `max_tokens` from 4096 to 8192',
				'Asking for a shorter answer, so fewer output tokens'
			],
			answer: 3,
			why: 'After the first token, the time follows the number of tokens generated: about 49 to 51 tokens per second in both runs. The input is already cached, so trimming it changes little, and a higher `max_tokens` only allows a longer answer.'
		}
	],
	recall: {
		q: 'In the cookbook run on Sonnet 4.6, what were TTFT and the cost per question with the 151,629-token source cold and then cached?',
		a: 'Cold: TTFT 20.87 s and about $0.57. Cached: TTFT 1.94 s and about $0.05. In both runs, generating about 350 output tokens took 6.5 to 7.5 s.'
	},
	sources: [
		{ title: 'Claude docs, Messages API reference (usage), read 2026-10-17', url: 'https://platform.claude.com/docs/en/api/messages' },
		{ title: 'Claude docs, Pricing, read 2026-10-17', url: 'https://platform.claude.com/docs/en/about-claude/pricing' },
		{ title: 'Claude docs, Reducing latency, read 2026-10-17', url: 'https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-latency' },
		{ title: 'anthropics/claude-cookbooks, Speculative prompt caching notebook', url: `${COOK}/misc/speculative_prompt_caching.ipynb` }
	]
};
