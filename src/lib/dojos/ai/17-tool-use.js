const SDK = 'https://github.com/anthropics/anthropic-sdk-python/blob/bcd55fe1d3f0f1240765f8cef04295b67337f55a';
const RUNNER = `${SDK}/src/anthropic/lib/tools/_beta_runner.py`;
const DOCS = 'https://platform.claude.com/docs/en/agents-and-tools/tool-use';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'tool-use',
	part: 'Tools and agents',
	title: 'Tool use',
	minutes: 10,
	hook: [
		'You add a `get_weather` tool to your request and ask "What\'s the weather in San Francisco?". Your script prints the first text block of the reply: "I\'ll check the current weather in San Francisco for you." Then it exits without printing any weather.',
		'The model never called a weather service. **It cannot run code: it returned a request, a `tool_use` block that names the tool and its arguments.** Your code was supposed to run `get_weather`, send the result back, and ask again.'
	],
	terms: [
		{ term: 'Tool definition', def: 'An entry in the request\'s `tools` array: a `name`, a `description` and an `input_schema` (a JSON schema for the arguments). The model reads it to decide when to call the tool.' },
		{ term: 'tool_use block', def: 'A content block in the model\'s reply with an `id`, the tool `name` and an `input` object. It is a request for your code to run that tool.' },
		{ term: 'tool_result block', def: 'A content block you send back in a `user` message, with the `tool_use_id` it answers, the result as `content`, and `is_error: true` if the tool failed.' },
		{ term: 'stop_reason', def: 'The field that says why the model stopped writing. `tool_use` means it waits for tool results; `end_turn` means it has finished its answer.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['req1["Request 1: tools = get_weather, user: weather in San Francisco?"] --> api["Messages API"]'],
				highlight: ['req1'],
				note: 'You send the tool definitions with the question. With the default `tool_choice` of `auto`, the model decides on each turn whether to call a tool or answer directly. The tool definitions count as input tokens, and the API adds a tool system prompt: 286 tokens for Claude Opus 5.5 with `auto` (pricing table, read 2026-10-17).'
			},
			{
				add: ['api --> resp1["Reply 1: stop_reason tool_use, text plus tool_use id toolu_01A09, input location San Francisco, CA"]'],
				highlight: ['resp1'],
				note: 'The reply holds a text block and a `tool_use` block. Its `input` follows the tool\'s `input_schema`: `{"location": "San Francisco, CA", "unit": "celsius"}` in the docs example. At this point no code has run.'
			},
			{
				add: ['resp1 --> run["Your code: get_weather location San Francisco, CA returns 15 degrees"]'],
				highlight: ['run'],
				note: 'Your code reads `name`, `id` and `input`, and calls your own function. The database query, the HTTP call or the shell command happens here, in your process, with your credentials.'
			},
			{
				add: ['run --> req2["Request 2: history + assistant reply 1 + user tool_result for toolu_01A09"]', 'req2 --> api'],
				highlight: ['req2'],
				note: 'You append the assistant reply unchanged, then a `user` message whose content starts with the `tool_result` blocks. Each `tool_use_id` matches a `tool_use` id. If the model asked for two tools, both results go in this one message.'
			},
			{
				add: ['api --> resp2["Reply 2: stop_reason end_turn, 15 degrees Celsius with partly cloudy skies"]'],
				highlight: ['resp2'],
				note: 'The model reads the result and writes the answer, with `stop_reason: "end_turn"`. If it had asked for another tool, you would go around again: that repeated round trip is the agent loop (day 18).'
			}
		]
	},
	example: {
		title: 'src/anthropic/lib/tools/_beta_runner.py: the SDK runs the tool calls and builds the next user message',
		repo: 'anthropics/anthropic-sdk-python',
		url: `${RUNNER}#L645-L732`,
		lang: 'python',
		code: `    def _generate_tool_call_response(self) -> BetaMessageParam | None:
        content = self._get_last_assistant_message_content()
        if not content:
            return None

        tool_use_blocks = [block for block in content if block.type == "tool_use"]
        if not tool_use_blocks:
            return None

        results: list[BetaToolResultBlockParam] = []
…
                tool = self._tools_by_name.get(tool_use.name) if tool_use.name in available else None
…
                if tool is None:
…
                    result = {
                        "type": "tool_result",
                        "tool_use_id": tool_use.id,
                        "content": f"Error: Tool '{tool_use.name}' not found",
                        "is_error": True,
                    }
                else:
                    with self._tool_use_span(self._client, tool, tool_use) as run:
                        run.result = result = self._run_tool(tool, tool_use)
…
            results.append(result)

        return {"role": "user", "content": results}

    def _run_tool(self, tool: BetaRunnableTool, tool_use: BetaToolUseBlock) -> BetaToolResultBlockParam:
        try:
            return {
                "type": "tool_result",
                "tool_use_id": tool_use.id,
                "content": tool_result_content(tool.call(tool_use.input)),
            }
        except ToolError as exc:
            return {
                "type": "tool_result",
                "tool_use_id": tool_use.id,
                "content": tool_error_content(exc),
                "is_error": True,
            }
        except Exception as exc:
            log.exception(f"Error occurred while calling tool: {tool.name}", exc_info=exc)
            return {
                "type": "tool_result",
                "tool_use_id": tool_use.id,
                "content": tool_error_content(exc),
                "is_error": True,
            }`,
		notes: [
			'Line 650 keeps only the `tool_use` blocks of the last reply. If there are none, the method returns `None` and the runner stops: the model has answered.',
			'Lines 680 to 699: a tool name the runner does not know does not raise. The runner sends back a `tool_result` with `"Error: Tool \'...\' not found"` and `is_error: True`, so the model can see its mistake and try another call.',
			'Line 716, `tool.call(tool_use.input)`, is the only place your function runs. The two `except` branches turn any exception into a `tool_result` with `is_error: True`. The docs say that after such an error the model "will retry 2-3 times with corrections before apologizing to the user".',
			'Line 709 returns one `user` message that holds every result. The [parallel tool use docs](' + DOCS + '/parallel-tool-use) say all results of one reply belong "together in a single user message", and separate messages make the model call tools in parallel less often.'
		]
	},
	tradeoff: {
		gain: [
			'The model picks the tool and fills the arguments from your `description` and `input_schema`. You write no parsing code for the user\'s question.',
			'Your code decides what runs: you can log, check or refuse each `tool_use` block before line 716 would call your function.',
			'With `@beta_tool` and `client.beta.messages.tool_runner`, the SDK derives the schema from the function\'s type hints and docstring and runs the whole round trip for you.'
		],
		cost: [
			'Every round trip is one more request that resends the whole history, plus the tool definitions and the tool system prompt (286 tokens for Claude Opus 5.5).',
			'The model can fill a required argument you never gave: asked "What\'s the weather?" with no city, the docs show a call with `"location": "New York, NY"`.',
			'The tool runner runs every call it receives. For human approval before a tool runs, or custom logging, the docs point you to the manual loop.'
		]
	},
	task: {
		prompt: 'A reply has `stop_reason: "tool_use"` and three content blocks: a text block, `tool_use` id `toolu_A` for `get_weather` with `{"location": "Paris"}`, and `tool_use` id `toolu_B` for `calculate_sum` with `{"a": 15, "b": 27}`. Your weather service returns HTTP 500. Write the two messages you append before the next request.',
		hint: 'First the assistant message as it came back. Then one user message: which blocks, in which order, and which field marks the failure?',
		answer: [
			'Message 1: `{"role": "assistant", "content": <the three blocks of the reply, unchanged>}`.',
			'Message 2: `{"role": "user", "content": [{"type": "tool_result", "tool_use_id": "toolu_A", "content": "ConnectionError: weather service returned HTTP 500", "is_error": true}, {"type": "tool_result", "tool_use_id": "toolu_B", "content": "42"}]}`.',
			'Both results go in one user message, and no text block comes before them; text before a `tool_result` makes the request fail with a 400 error.',
			'The model then tells the user the weather is unavailable and gives 42 for the sum. An error message that says what to try next, such as "Retry after 60 seconds.", gives the model something to act on.'
		]
	},
	quiz: [
		{
			q: 'A reply ends with `stop_reason: "tool_use"`. What has happened to the tool?',
			options: [
				'Anthropic ran it and the result is in the next content block of the same reply',
				'Nothing yet: the reply is a request, and your code must run the tool and send a `tool_result`',
				'The model ran it in a sandbox, and you only need to read the text block',
				'The SDK ran it in the background, and the result arrives in a second streamed reply'
			],
			answer: 1,
			why: 'For a client tool, the model only writes a `tool_use` block with a name and an input. Your application runs the function and sends the output back in a `tool_result` block. Only server tools such as `web_search` run on Anthropic\'s side.'
		},
		{
			q: 'The model asked for two tools in one reply. How do you send the two results?',
			options: [
				'Two user messages, one per result, in the order the tools finished',
				'One user message with a text block first that explains the results, then the two `tool_result` blocks',
				'One user message with both `tool_result` blocks, each with the `tool_use_id` it answers',
				'One assistant message that appends the results after the `tool_use` blocks'
			],
			answer: 2,
			why: 'The docs require the results right after the assistant turn, with the `tool_result` blocks first in the user message. All results of one reply go together in a single user message; separate messages teach the model to call tools in parallel less often.'
		},
		{
			q: 'In the Python SDK\'s tool runner, what happens when your tool function raises an exception?',
			options: [
				'The runner re-raises it and the loop stops, so you must wrap each tool in try/except',
				'The runner retries the same call 3 times before giving up',
				'The runner drops the call and sends the other results without it',
				'The runner sends a `tool_result` with the error text and `is_error: True`, and the loop goes on'
			],
			answer: 3,
			why: '`_run_tool` catches `ToolError` and any other `Exception` and returns a `tool_result` with `is_error: True`. The model then sees the error and can correct its call or explain the failure to the user.'
		}
	],
	recall: {
		q: 'After a reply with `stop_reason: "tool_use"`, which two messages does your code append before it calls the API again?',
		a: 'The assistant reply unchanged, then one user message whose content starts with a `tool_result` block per `tool_use` block, each with the matching `tool_use_id` (and `is_error: true` if the tool failed).'
	},
	sources: [
		{ title: 'Claude docs, Tool use with Claude (overview and pricing), read 2026-10-17', url: `${DOCS}/overview` },
		{ title: 'Claude docs, Handle tool calls, read 2026-10-17', url: `${DOCS}/handle-tool-calls` },
		{ title: 'Claude docs, Parallel tool use, read 2026-10-17', url: `${DOCS}/parallel-tool-use` },
		{ title: 'Claude docs, Tool runner (SDK), read 2026-10-17', url: `${DOCS}/tool-runner` },
		{ title: 'anthropics/anthropic-sdk-python, src/anthropic/lib/tools/_beta_runner.py at bcd55fe', url: RUNNER }
	]
};
