const SDK = 'https://github.com/anthropics/anthropic-sdk-python/blob/bcd55fe1d3f0f1240765f8cef04295b67337f55a';
const EXAMPLE = `${SDK}/examples/tools_stream.py`;
const DOCS = 'https://platform.claude.com/docs/en/build-with-claude/streaming';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'streaming',
	part: 'Building with the API',
	title: 'Streaming',
	minutes: 10,
	hook: [
		'Your chat page calls `client.messages.create()` and shows a spinner until the full answer is back. For a long answer the user stares at the spinner for the whole generation, and with a large `max_tokens` the Python SDK raises a `ValueError`: "Streaming is required for operations that may take longer than 10 minutes."',
		'With `"stream": true` the API sends the answer as server-sent events while the model writes it. In the docs example, the text "Hello!" arrives as two events, one with "Hello" and one with "!".'
	],
	terms: [
		{ term: 'Server-sent events (SSE)', def: 'An HTTP response that stays open and carries a sequence of events. Each event has a line `event: <name>` and a line `data: <json>`, and the JSON repeats the name in its `type` field.' },
		{ term: 'Delta', def: 'The content of one `content_block_delta` event: a `text_delta` with a few characters of text, or an `input_json_delta` with a piece of a tool input as a string.' },
		{ term: 'Content block index', def: 'The `index` on every block event. It is the position the block will have in the `content` array of the final message, so index 1 is the second block.' },
		{ term: 'Snapshot', def: 'In the Python SDK stream helpers, the text or tool input accumulated so far, returned with each `text` or `input_json` event next to the new delta.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['start["message_start: Message with empty content, usage input_tokens 472"]'],
				highlight: ['start'],
				note: 'Every stream opens with `message_start`, which carries a `Message` object whose `content` is empty and whose `stop_reason` is `null`. In the docs example with the `get_weather` tool, it reports 472 input tokens.'
			},
			{
				add: ['start --> text["Block 0, text: content_block_start, text_delta Okay, text_delta \' let\', ..., content_block_stop"]'],
				highlight: ['text'],
				note: 'Each content block opens with `content_block_start`, receives one or more `content_block_delta` events and closes with `content_block_stop`. In the example, the sentence "Okay, let\'s check the weather for San Francisco, CA:" arrives in 13 text deltas of one word or one punctuation mark each.'
			},
			{
				add: ['text --> tool["Block 1, tool_use get_weather: input_json_delta pieces, then content_block_stop"]'],
				highlight: ['tool'],
				note: 'The `content_block_start` of block 1 already names the tool, `get_weather`, with `input: {}`. Its deltas are strings such as `{"location":` and ` "San`, and the docs say the final `tool_use.input` "is always an *object*". The input is valid JSON only once `content_block_stop` arrives.'
			},
			{
				add: ['tool --> delta["message_delta: stop_reason tool_use, usage output_tokens 89"]', 'delta --> stop["message_stop"]'],
				highlight: ['delta', 'stop'],
				note: 'The `stop_reason` arrives near the end, in `message_delta`, and the stream closes with `message_stop`. The docs warn that the `usage` counts in `message_delta` are cumulative: 89 is the total output of the response up to that event.'
			},
			{
				add: ['ping["ping events, error events such as overloaded_error, new event types"] -.-> text'],
				highlight: ['ping'],
				note: 'Any number of `ping` events can appear between the others. The API can also send an `error` event in the middle of a stream, such as an `overloaded_error`, which "would normally correspond to an HTTP 529". The docs ask your code to ignore event types it does not know, because new ones may be added.'
			}
		]
	},
	example: {
		title: 'examples/tools_stream.py: printing a tool input while it streams',
		repo: 'anthropics/anthropic-sdk-python',
		url: `${EXAMPLE}#L1-L40`,
		lang: 'python',
		code: `import asyncio

from anthropic import AsyncAnthropic

client = AsyncAnthropic()


async def main() -> None:
    async with client.messages.stream(
        max_tokens=1024,
        model="claude-sonnet-5-5",
        tools=[
            {
                "name": "get_weather",
                "description": "Get the weather at a specific location",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "location": {"type": "string", "description": "The city and state, e.g. San Francisco, CA"},
                        "unit": {
                            "type": "string",
                            "enum": ["celsius", "fahrenheit"],
                            "description": "Unit for the output",
                        },
                    },
                    "required": ["location"],
                },
            }
        ],
        messages=[{"role": "user", "content": "What is the weather in SF?"}],
    ) as stream:
        async for event in stream:
            if event.type == "input_json":
                print(f"delta: {repr(event.partial_json)}")
                print(f"snapshot: {event.snapshot}")

    print()


asyncio.run(main())`,
		notes: [
			'Line 9 uses `client.messages.stream()`, the SDK helper. It returns a context manager, and the stream is cancelled when the `async with` block exits.',
			'Lines 33 to 35 handle the `input_json` event, which the SDK adds on top of the raw `input_json_delta`. `event.partial_json` is the new string piece, and `event.snapshot` is the input parsed so far, as a Python object.',
			'The SDK builds that snapshot by appending each piece to a buffer and running [`from_json(json_buf, partial_mode=True)`](' + SDK + '/src/anthropic/lib/streaming/_messages.py#L501-L514) from the `jiter` library, on every delta. A parse error there raises a `ValueError` that names the tool parameter JSON.',
			'The loop prints the tool input but never runs the tool. To run `get_weather`, the code waits until the stream is done and reads the full `tool_use` block from `await stream.get_final_message()`, then sends a `tool_result` as on day 17.'
		]
	},
	tradeoff: {
		gain: [
			'The first words of the answer reach the screen with the first `text_delta`, instead of after the last token.',
			'Requests with a large `max_tokens` work: the SDK requires streaming for them to avoid HTTP timeouts, and `get_final_message()` still returns one complete `Message`.',
			'Your UI can show "calling get_weather" as soon as `content_block_start` names the tool, before its input is complete.'
		],
		cost: [
			'A tool input is a string that is not valid JSON until `content_block_stop`. Calling `json.loads` on each delta fails.',
			'Your code handles more cases than with `create()`: `ping` events, an `error` event after part of the answer has arrived, and event types added later.',
			'Current models emit one complete key and value of a tool input at a time, so a stream can pause for a while during a tool call.',
			'When a stream breaks, only text can be resumed: the docs say tool use and thinking blocks "cannot be partially recovered".'
		]
	},
	task: {
		prompt: 'A raw HTTP client reads the stream for a `get_weather` call and does `args = json.loads(event["delta"]["partial_json"])` on every `input_json_delta`. It crashes on the second delta, which is `{"location":`. Explain the crash and rewrite the handling so that `args` holds the full input when the tool runs.',
		hint: 'Each delta is a piece of one JSON string. Which event tells you that the last piece has arrived?',
		answer: [
			'Each `partial_json` is a fragment of the input, so `{"location":` alone is not valid JSON, and `json.loads` raises. The docs say the deltas are "partial JSON strings".',
			'Keep one buffer per block: on `content_block_delta` with `input_json_delta`, do `bufs[event["index"]] += event["delta"]["partial_json"]`.',
			'On `content_block_stop` for that index, parse once: `args = json.loads(bufs[event["index"]] or "{}")`. The first delta in the docs example is an empty string, so the buffer can start empty.',
			'With the Python SDK, the same result is `block.input` for the `tool_use` block of `await stream.get_final_message()`, already parsed.'
		],
		steps: [
			{
				title: 'Explain the crash',
				questions: [
					{ q: 'What is `partial_json` in an `input_json_delta`?', options: ['The full tool input, sent again each time', 'A fragment of the tool input as a string', 'A parsed Python dict of the new keys', 'The tool name and its schema'], answer: 1, why: 'The docs call the deltas "partial JSON strings": pieces of one JSON text.' },
					{ q: 'Why does `json.loads(\'{"location":\')` raise?', options: ['`location` is not a known parameter', 'The SDK expects bytes, not a string', '`{"location":` alone is not valid JSON', 'The tool name is missing'], answer: 2, why: 'The piece stops after the key. The value and the closing brace come in later deltas.' },
					{ q: 'Before the first `input_json_delta` of block 1, what does its `content_block_start` already carry?', options: ['The full input `{"location": "San Francisco, CA"}`', 'Nothing but the `index`', 'The tool name `get_weather`, with `input: {}`', 'The `stop_reason` of the response'], answer: 2, why: 'The block opens with the tool name and an empty input. The input itself arrives only in the deltas that follow.' },
					{ q: 'What type does the final `tool_use.input` have?', options: ['A string', 'A list of deltas', 'A number', 'Always an object'], answer: 3, why: 'The docs say the final `tool_use.input` "is always an *object*", even though the deltas are strings.' }
				]
			},
			{
				title: 'Buffer the pieces',
				questions: [
					{ q: 'How many buffers do you keep?', options: ['One for the whole stream', 'One per content block, keyed by `index`', 'One per event type', 'None: you parse each delta alone'], answer: 1, why: 'A response can hold several blocks, and `index` tells you which block each delta belongs to.' },
					{ q: 'What does the content block `index` mean?', options: ['The position of the block in the final `content` array', 'The number of deltas received so far', 'The order of the event in the stream', 'The id of the tool'], answer: 0, why: 'Index 1 is the second block of the final message, here the `tool_use` block after the text.' },
					{ q: 'Which line fills the buffer on each `input_json_delta`?', options: ['`bufs[event["index"]] = event["delta"]["partial_json"]`', '`bufs.append(json.loads(event["delta"]["partial_json"]))`', '`bufs[event["index"]] += event["delta"]["partial_json"]`', '`bufs[event["type"]] += event["delta"]`'], answer: 2, why: 'Appending each string piece rebuilds the full JSON text of that block.' },
					{ q: 'A `ping` event arrives between two deltas. What do you do with it?', options: ['Clear the buffers', 'Treat it as the end of the block', 'Append it to the buffer', 'Ignore it'], answer: 3, why: 'Any number of `ping` events can appear between the others. Only the deltas of a block go into its buffer.' }
				]
			},
			{
				title: 'Parse at the end',
				questions: [
					{ q: 'On which event do you call `json.loads`?', options: ['`content_block_stop` for that index', '`message_delta`', 'Every `content_block_delta`', '`content_block_start`'], answer: 0, why: 'It is the event that says the last piece of that block has arrived.' },
					{ q: 'Why write `json.loads(bufs[event["index"]] or "{}")`?', options: ['To merge the input with the defaults', 'To skip tools that have no schema', 'Because `json.loads` cannot read objects', 'Because a buffer can stay empty, and `""` is not valid JSON'], answer: 3, why: 'The first delta in the docs example is an empty string, so a buffer can start empty, and `json.loads("")` raises.' },
					{ q: 'How many times do you parse each tool input?', options: ['Once per delta', 'Once, when the block closes', 'Twice: at start and at stop', 'Once per `ping`'], answer: 1, why: 'Parsing once on the full buffer avoids the crash on fragments.' },
					{ q: 'A `content_block_stop` arrives. How do you know which buffer to parse?', options: ['Take the last buffer you wrote to', 'Read the tool name in the event', 'Use its `index` field', 'Use its `type` field'], answer: 2, why: 'Every block event carries the `index` of its block, the same key you used to fill the buffer.' }
				]
			},
			{
				title: 'Use the SDK instead',
				questions: [
					{ q: 'With the Python SDK, where is the parsed input once the stream is done?', options: ['In the last `input_json` event', '`block.input` on the `tool_use` block of `await stream.get_final_message()`', '`event.partial_json` of the final delta', 'In `message_delta.usage`'], answer: 1, why: 'The final message holds the full `tool_use` block, already parsed.' },
					{ q: 'What does `event.snapshot` hold on an SDK `input_json` event?', options: ['The input parsed so far, as a Python object', 'Only the new string piece', 'The raw SSE line', 'The tool result'], answer: 0, why: '`event.partial_json` is the new piece, and `event.snapshot` is the input accumulated and parsed so far.' },
					{ q: 'When should the code actually run `get_weather`?', options: ['On the first `input_json` event', 'As soon as `content_block_start` names the tool', 'On each snapshot, to show live results', 'After the stream is done, from the full `tool_use` block'], answer: 3, why: 'The example loop prints the input but runs the tool only from the final message, then sends a `tool_result`.' },
					{ q: 'An `error` event such as `overloaded_error` arrives mid-stream. What does it usually match?', options: ['An HTTP 400', 'A finished response', 'An HTTP 529', 'A `max_tokens` stop'], answer: 2, why: 'The docs say it "would normally correspond to an HTTP 529".' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'The `message_delta` event near the end of a stream carries `"usage": {"output_tokens": 89}`. What is 89?',
			options: [
				'The output tokens generated since the previous `message_delta` event',
				'The total output tokens of the response so far, because the counts are cumulative',
				'The tokens in the last content block, here the `tool_use` block',
				'The output tokens that the stream has not sent yet'
			],
			answer: 1,
			why: 'The docs warn that the token counts in the `usage` field of `message_delta` are cumulative. Adding the values of several `message_delta` events would count the same tokens twice.'
		},
		{
			q: 'Where in the stream do you first learn that the response ends with `stop_reason: "tool_use"`?',
			options: [
				'In `message_start`, because it carries the full `Message` object',
				'In the `content_block_start` event of the `tool_use` block',
				'In a `ping` event sent just before the tool block opens',
				'In the `message_delta` event, after the last content block closes'
			],
			answer: 3,
			why: '`message_start` carries a `Message` with empty `content` and `stop_reason: null`. The stop reason is a top-level change to the message, and top-level changes arrive in `message_delta`, after the last `content_block_stop`.'
		},
		{
			q: 'A stream from Claude Sonnet 4.6 breaks after a full text block and half of a `tool_use` block. What can you resume?',
			options: [
				'The text, by sending it in a user message that asks the model to continue',
				'The tool input, by sending the partial JSON back as an `assistant` message',
				'Both blocks, by reopening the same stream with the message `id`',
				'Nothing, because a broken stream has to be sent again from the start'
			],
			answer: 0,
			why: 'Tool use and thinking blocks cannot be partially recovered, and you resume from the latest text block. For Claude 4.6 and later, the docs put the partial response in a user message with an instruction to continue.'
		}
	],
	recall: {
		q: 'In what order do the events of a stream arrive, and when is a streamed tool input valid JSON?',
		a: '`message_start`, then for each block `content_block_start`, deltas and `content_block_stop`, then `message_delta` and `message_stop`. A tool input is valid JSON only at its `content_block_stop`.'
	},
	sources: [
		{ title: 'Claude docs, Streaming messages, read 2026-10-17', url: DOCS },
		{ title: 'anthropics/anthropic-sdk-python, helpers.md (stream helpers)', url: `${SDK}/helpers.md` },
		{ title: 'anthropics/anthropic-sdk-python, examples/tools_stream.py', url: EXAMPLE },
		{ title: 'anthropics/anthropic-sdk-python, src/anthropic/_base_client.py (the 10 minute check)', url: `${SDK}/src/anthropic/_base_client.py#L858-L863` }
	]
};
