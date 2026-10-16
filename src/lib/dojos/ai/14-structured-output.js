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
