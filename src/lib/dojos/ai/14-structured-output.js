const SDK = 'https://github.com/anthropics/anthropic-sdk-python/blob/bcd55fe1d3f0f1240765f8cef04295b67337f55a';
const SO = 'https://platform.claude.com/docs/en/build-with-claude/structured-outputs';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'structured-output',
	part: 'Prompting',
	title: 'Getting JSON back',
	minutes: 10,
	hook: [
		'Your script asks a model for JSON and calls `json.loads()` on the reply. On ticket 812 the reply starts with "Here is the JSON:", and `json.loads` raises `JSONDecodeError`. On ticket 813 the JSON parses, but `quantity` is `"2"`, a string.',
		'The docs list these failures for plain prompting: "Parsing errors from invalid JSON syntax", "Missing required fields", "Inconsistent data types".'
	],
	terms: [
		{ term: 'JSON schema', def: 'A JSON document that describes the shape you expect: the type of each field, which fields are required, which values are allowed.' },
		{ term: 'Structured outputs', def: 'A request with `output_config.format` set to `{"type": "json_schema", "schema": ...}`. The reply text is JSON that matches that schema.' },
		{ term: 'Constrained decoding', def: 'The API compiles the schema into a grammar and, at each step, lets the model pick only tokens that keep the output valid against it.' },
		{ term: 'Strict tool use', def: '`strict: true` on a tool definition. The same constraint applied to the tool name and the tool input.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['model["Order: product_name str, price float, quantity int with ge 1"] --> schema["transform_schema: additionalProperties false, minimum moved into description"]'],
				highlight: ['model', 'schema'],
				note: 'You write the `Order` class with pydantic. The SDK turns it into a JSON schema and rewrites it for the API: every object gets `additionalProperties: false`, and keys the API does not support, like `minimum`, move into the field description.'
			},
			{
				add: ['schema --> api["POST /v1/messages with output_config.format json_schema"]'],
				highlight: ['api'],
				note: 'The first request with a new schema waits while the grammar compiles. The compiled grammar is "cached for 24 hours from last use". The API also adds a system prompt that explains the format, and you pay its input tokens.'
			},
			{
				add: ['api --> text["text block: JSON that fits the sent schema"]'],
				highlight: ['text'],
				note: 'The reply arrives in the normal `text` block. With constrained decoding, an object schema gives a reply that starts with `{`, holds every required field, and has `2` where the schema says integer.'
			},
			{
				add: ['text --> check["SDK: validate_json against the original Order class"]'],
				highlight: ['check'],
				note: 'The SDK parses the text with your original class, constraints included. A `quantity` of `0` fits the sent schema, a plain integer, but fails `ge=1` here with a pydantic `ValidationError`.'
			},
			{
				add: ['check -->|"ValidationError, refusal or max_tokens"| retry["Your code: retry, or report the failure"]'],
				highlight: ['retry'],
				note: 'Two `stop_reason` values break the guarantee. With `"refusal"` you get a 200, a bill, and output that "may not match your schema". With `"max_tokens"` the JSON may be cut off, and the docs say to retry with a higher `max_tokens`.'
			}
		]
	},
	example: {
		title: 'examples/structured_outputs.py: a pydantic class as the output format',
		repo: 'anthropics/anthropic-sdk-python',
		url: `${SDK}/examples/structured_outputs.py#L1-L26`,
		lang: 'python',
		code: `import pydantic

import anthropic


class Order(pydantic.BaseModel):
    product_name: str
    price: float
    quantity: int


client = anthropic.Anthropic()

prompt = """
Extract the product name, price, and quantity from this customer message:
"Hi, I’d like to order 2 packs of Green Tea for 5.50 dollars each."
"""

parsed_message = client.messages.parse(
    model="claude-sonnet-5-5",
    messages=[{"role": "user", "content": prompt}],
    max_tokens=1024,
    output_format=Order,
)

print(parsed_message.parsed_output)  # Order(product_name='Green Tea', price=5.5, quantity=2)`,
		notes: [
			'Line 23 passes the class itself. Inside [`messages.parse`](' + SDK + '/src/anthropic/resources/messages/messages.py#L1289-L1293), the SDK calls `TypeAdapter(output_format).json_schema()`, runs `transform_schema` on it and sends the result as `output_config.format`.',
			'With `quantity: int = pydantic.Field(ge=1)`, `transform_schema` sends `{"type": "integer", "title": "Quantity", "description": "{minimum: 1}"}`. The comment in [_transform.py](' + SDK + '/src/anthropic/lib/_parse/_transform.py#L163-L172) says the leftover keys go into the description "so that the model *might* follow them."',
			'For each `text` block in the reply, `parse_text` in `_response.py` runs `adapted_type.validate_json(text)` with the original class. A `quantity` of `0` raises `ValidationError` with "Input should be greater than or equal to 1".',
			'Line 26 reads `parsed_output`, already an `Order`. Your code gets typed fields, or an exception it can catch and retry on.'
		]
	},
	tradeoff: {
		gain: [
			'No `JSONDecodeError`: outside refusals and `max_tokens` cuts, the reply text parses and has every required field.',
			'An `integer` field comes back as a JSON number. The strict tool use docs give the example: without it Claude "might provide `passengers: "two"` or `passengers: "2"`", with it the input "always contains `passengers: 2`".',
			'Constraints the API cannot enforce, like `minimum` or `maxLength`, are still checked by the SDK before your code reads the value.'
		],
		cost: [
			'The first request with a new schema is slower while the grammar compiles. Changing the schema structure compiles a new one.',
			'The injected format prompt adds input tokens, and changing `output_config.format` invalidates the prompt cache for that conversation.',
			'Schemas have limits: 20 strict tools, 24 optional parameters and 16 union-type parameters per request. Past those, or past internal limits, you get a 400 "Schema is too complex for compilation."',
			'The API does not guarantee the capitalization of `enum` values. The docs show `"Conversation Topic 3"` coming back for an enum value written `"Conversation topic 3"`, with no error.'
		]
	},
	task: {
		prompt: 'An invoice extractor written for an older model sends a `record_invoice` tool and `tool_choice: {"type": "tool", "name": "record_invoice"}` to force a tool call, then reads the tool input as its JSON. Fields: `vendor` (string), `total` (number, at least 0), `currency` (`"EUR"` or `"USD"`), `notes` (optional). You move it to Opus 5.5. What breaks, how do you rewrite it, and when does your code retry?',
		hint: 'Check what Opus 5.5 does with a forced `tool_choice`, then follow `total >= 0` through `transform_schema` and `validate_json`.',
		answer: [
			'The forced `tool_choice` breaks: Opus 5.5 rejects `{"type": "any"}` and `{"type": "tool", ...}` with a 400 error on every request. Use `messages.parse` with a pydantic `Invoice` class, or keep the tool with `strict: true` and `tool_choice: {"type": "auto"}`.',
			'Write `total: float = Field(ge=0)` and `currency: Literal["EUR", "USD"]`. The API gets `total` as a plain number with `{minimum: 0}` in its description, and the SDK checks `ge=0` on the reply. `notes` is optional, so it comes after the required fields in the output.',
			'Retry on `ValidationError`, once, with the error text added to the user turn. Retry on `stop_reason: "max_tokens"` with a higher `max_tokens`, as the docs say.',
			'Do not resend the same request on `stop_reason: "refusal"`: log it and look at the prompt. Compare `currency` case-insensitively, as the docs advise for enums.'
		],
		steps: [
			{
				title: 'Find what breaks',
				questions: [
					{ q: 'You plan to fall back to Sonnet 5.5 when Opus 5.5 is busy. Does the forced `tool_choice` work there?', options: ['Yes: only Opus 5.5 rejects forced tool use', 'Yes, as long as the tool has `strict: true`', 'No: Sonnet 5.5 also rejects forced tool use with a 400 error', 'Only when thinking is turned off'], answer: 2, why: 'The docs list Opus 5.5, Sonnet 5.5, Fable 5.1 and Mythos 5.1 as models that "reject forced tool use on every request with a 400 error".' },
					{ q: 'Would switching to `tool_choice: {"type": "any"}` help?', options: ['No: Opus 5.5 rejects it with a 400 error too', 'Yes: it forces some tool, not a named one', 'Yes, but only with `strict: true`', 'Yes: the API turns it into `auto`'], answer: 0, why: 'Both `{"type": "any"}` and `{"type": "tool", ...}` are forced tool use, and both are rejected.' },
					{ q: 'If you keep the tool, which `tool_choice` do you send?', options: ['`{"type": "none"}`', '`{"type": "auto"}`, with `strict: true` on the tool', '`{"type": "any"}`, with `strict: true` on the tool', 'No `tools` field at all'], answer: 1, why: 'The docs point to `auto` with strict tool use as the way to keep a tool on these models.' },
					{ q: 'What is the other path to the same JSON?', options: ['Ask for JSON in the prompt and call `json.loads`', 'Put the schema in the system prompt', 'Lower `temperature` to 0', '`messages.parse` with a pydantic `Invoice` class'], answer: 3, why: 'Structured outputs put the schema in `output_config.format`, and the SDK parses the reply into your class.' }
				]
			},
			{
				title: 'Write the schema',
				questions: [
					{ q: 'How do you write `currency`?', options: ['`currency: str`', '`currency: Literal["EUR", "USD"]`', '`currency: str = Field(max_length=3)`', '`currency: Optional[str]`'], answer: 1, why: 'A `Literal` gives the two allowed values, so the schema sends them as an `enum`.' },
					{ q: 'How do you write `total`?', options: ['`total: float = Field(ge=0)`', '`total: str`', '`total: int`', '`total: float = Field(gt=100)`'], answer: 0, why: 'A number, at least 0, as the task asks.' },
					{ q: '`notes` is optional. Where does it land in the output?', options: ['First, before `vendor`', 'Nowhere: optional fields are dropped', 'In a second text block', 'After the required fields'], answer: 3, why: 'Optional fields come after the required ones in the output.' },
					{ q: 'What does the SDK add to every object before it sends the schema?', options: ['`required: []`', '`strict: true`', '`additionalProperties: false`', 'A `title` per enum value'], answer: 2, why: 'The SDK rewrites the schema for the API and gives every object `additionalProperties: false`.' }
				]
			},
			{
				title: 'Follow `total >= 0`',
				questions: [
					{ q: 'A free trial invoice comes back with `"total": 0`. What does `Field(ge=0)` do with it?', options: ['It raises `ValidationError`: the total must be above 0', 'It accepts it: `ge` means greater than or equal', 'It turns the value into `null`', 'It sends the value back to the API'], answer: 1, why: '`ge=0` allows 0 itself. Only a negative total fails. `gt=0` would be the setting that rejects 0.' },
					{ q: 'Does constrained decoding stop a negative `total`?', options: ['Yes: the grammar has the minimum', 'Yes, but only with `strict: true`', 'Only on Opus 5.5', 'No: the model only *might* follow the description'], answer: 3, why: 'The API never sees `minimum` as a constraint. The comment in `_transform.py` says the model "*might* follow them."' },
					{ q: 'A reply with a negative `total` fails the `ge=0` check. Do you pay for that request?', options: ['Yes: the API answered normally, and the check runs in the SDK afterwards', 'No: the API refunds replies that fail validation', 'No: the request never left your machine', 'Only for the input tokens'], answer: 0, why: 'The JSON fits the schema the API received, so the API returns a normal billed reply. The `ge=0` check happens later, on your side.' },
					{ q: 'The reply has `"total": -5`. What does your code get?', options: ['An `Invoice` with `total` set to 0', 'A 400 error from the API', 'A pydantic `ValidationError`', 'A `JSONDecodeError`'], answer: 2, why: 'The JSON is valid for the sent schema, but fails `ge=0` when the SDK validates it.' }
				]
			},
			{
				title: 'Decide when to retry',
				questions: [
					{ q: 'The SDK raises `ValidationError`. What do you do?', options: ['Retry forever until it passes', 'Retry once, with the error text added to the user turn', 'Clamp the value and move on', 'Switch back to forced `tool_choice`'], answer: 1, why: 'One retry with the error gives the model what it got wrong. Endless retries just pay again.' },
					{ q: 'The retry with the error text raises `ValidationError` again. What do you do?', options: ['Retry again with the same error text', 'Clamp `total` to 0 and save the invoice', 'Switch back to forced `tool_choice`', 'Stop retrying and report the failure, for example flag the invoice for a person'], answer: 3, why: 'You retry once, then report the failure. Each extra retry pays for a new reply, and a clamped value would save a number nobody read.' },
					{ q: 'The response has `stop_reason: "refusal"`. What do you do?', options: ['Log it and look at the prompt, without resending the same request', 'Resend the same request right away', 'Parse the text as an `Invoice`', 'Raise `max_tokens`'], answer: 0, why: 'A refusal returns a 200 and output that may not match your schema. Look at the prompt before you pay for another one.' },
					{ q: 'How do you compare the `currency` value in your code?', options: ['Byte for byte with `"EUR"`', 'By its first letter only', 'Case-insensitively', 'Not at all: enums are guaranteed'], answer: 2, why: 'The API does not guarantee the capitalization of `enum` values, as the docs warn.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Your class has `quantity: int = pydantic.Field(ge=1)`. What does the API receive for `quantity`?',
			options: [
				'`{"type": "integer", "minimum": 1}`, the constraint as written',
				'`{"type": "integer", "title": "Quantity", "description": "{minimum: 1}"}`',
				'Nothing: the SDK raises before sending because `minimum` is unsupported',
				'`{"type": "string", "format": "text"}`, since every field is sent as text'
			],
			answer: 1,
			why: '`transform_schema` copies only the keys the API supports and appends the rest to the description. The API never sees `minimum`, so the SDK checks `ge=1` itself when it validates the reply.'
		},
		{
			q: 'A structured outputs response comes back with `stop_reason: "max_tokens"`. What do you do with its text?',
			options: [
				'Parse it: constrained decoding makes the JSON valid at any length',
				'Nothing: the API returns a 400 error instead of a partial response',
				'Pass it to the SDK, which closes the open brackets for you',
				'Treat it as possibly cut off, and retry with a higher `max_tokens`'
			],
			answer: 3,
			why: 'Constrained decoding keeps each token valid, but generation stopped at the cap. The docs: "The output may be incomplete and not match your schema", and "Retry with a higher `max_tokens` value".'
		},
		{
			q: 'Code sends `tool_choice: {"type": "tool", "name": "record_invoice"}` to Opus 5.5 to force JSON. What happens?',
			options: [
				'The tool call arrives, but its input is not checked against the schema',
				'The model ignores `tool_choice` and answers in plain text',
				'The API rejects the request with a 400 error',
				'The tool call arrives after a thinking block, as on older models'
			],
			answer: 2,
			why: 'Opus 5.5, Sonnet 5.5, Fable 5.1 and Mythos 5.1 "reject forced tool use on every request with a 400 error". The docs point to `tool_choice: {"type": "auto"}` with strict tool use, or to structured outputs.'
		}
	],
	recall: {
		q: 'With `client.messages.parse(output_format=Order)`, which two checks does the JSON go through, and where?',
		a: 'The API constrains decoding to the transformed schema sent in `output_config.format`. Then the SDK runs `validate_json` with the original `Order`, which also checks constraints like `ge=1`.'
	},
	sources: [
		{ title: 'Claude docs, Structured outputs, read 2026-10-17', url: SO },
		{ title: 'Claude docs, Strict tool use, read 2026-10-17', url: 'https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use' },
		{ title: 'Claude docs, Thinking: Response prefill and forced tool use, read 2026-10-17', url: 'https://platform.claude.com/docs/en/build-with-claude/thinking#limits-and-feature-compatibility' },
		{ title: 'anthropics/anthropic-sdk-python, examples/structured_outputs.py', url: `${SDK}/examples/structured_outputs.py` },
		{ title: 'anthropics/anthropic-sdk-python, src/anthropic/lib/_parse/_transform.py', url: `${SDK}/src/anthropic/lib/_parse/_transform.py` },
		{ title: 'anthropics/anthropic-sdk-python, src/anthropic/lib/_parse/_response.py', url: `${SDK}/src/anthropic/lib/_parse/_response.py#L16-L20` }
	]
};
