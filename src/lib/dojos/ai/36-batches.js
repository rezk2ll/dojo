const SDK = 'https://github.com/anthropics/anthropic-sdk-python/blob/bcd55fe1d3f0f1240765f8cef04295b67337f55a';
const BATCHES = `${SDK}/src/anthropic/resources/messages/batches.py`;
const DOCS = 'https://platform.claude.com/docs/en/build-with-claude/batch-processing';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'batches',
	part: 'Building with the API',
	title: 'Batch processing',
	minutes: 10,
	hook: [
		'Your team wants 10,000 old support tickets tagged by product area before Monday. The first script calls `messages.create` in a `for` loop. It makes 10,000 calls one after the other, each one counts against your rate limit, and each one is billed at the full price.',
		'Nobody reads these tags until Monday, so the answers can wait a few hours. The Message Batches API is built for that case. You send all 10,000 requests in one call, the API works through them on its own schedule, and the docs say: "All usage is charged at 50% of the standard API prices."'
	],
	terms: [
		{ term: 'Message Batch', def: 'One object that holds up to 100,000 Messages API requests (or 256 MB), processed asynchronously. Each request is handled independently of the others.' },
		{ term: 'custom_id', def: 'The name you give each request in the batch, 1 to 64 letters, digits, hyphens or underscores. It is the only way to match a result to its request.' },
		{ term: 'processing_status', def: 'The batch field you poll: `in_progress` while requests run, `canceling` after a cancel, `ended` when every request has a result.' },
		{ term: 'Result type', def: 'Each request ends as one of four: `succeeded`, `errored`, `canceled` or `expired`. Only `succeeded` is billed.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['reqs["10,000 requests: { custom_id, params }"] -->|"POST /v1/messages/batches"| batch["Batch: in_progress, results_url null"]'],
				highlight: ['reqs', 'batch'],
				note: 'Each request is a `custom_id` such as `ticket-0042` plus the usual `params` of a Messages call: model, `max_tokens`, messages. The create call returns at once with `processing_status: "in_progress"` and `results_url: null`. The response also carries `expires_at`, 24 hours after `created_at`.'
			},
			{
				add: ['batch -->|"retrieve every 60 s"| poll{"processing_status?"}', 'poll -->|"in_progress"| batch'],
				highlight: ['poll'],
				note: 'You poll the batch with `retrieve`; the docs example sleeps 60 seconds between calls. The docs say "most batches completing within 1 hour". While it runs, `request_counts.processing` goes down, and the other four counts stay at zero until the whole batch has ended.'
			},
			{
				add: ['poll -->|"ended"| file[("results_url: one .jsonl file")]'],
				highlight: ['file'],
				note: 'At `ended`, `results_url` is set. The file has one JSON line per request, in any order: in the docs example, the result of `my-second-request` comes back before `my-first-request`. You stream the file line by line and look up each `custom_id` in your own table.'
			},
			{
				add: ['file --> ok["succeeded: billed at 50%"]', 'file --> err["errored: fix if invalid_request_error, else retry"]', 'file --> exp["expired or canceled: send again"]'],
				highlight: ['ok', 'err', 'exp'],
				note: 'Each line has a `result.type`. An `errored` result with `invalid_request_error` needs a fixed request body; other errors can be retried as they are. A request still waiting when the 24 hours run out ends as `expired`. The docs: "You will not be billed for these requests."'
			}
		]
	},
	example: {
		title: 'src/anthropic/resources/messages/batches.py: results() checks results_url, then streams the JSONL',
		repo: 'anthropics/anthropic-sdk-python',
		url: `${BATCHES}#L366-L430`,
		lang: 'python',
		code: `    def results(
        self,
        message_batch_id: str,
        *,
…
    ) -> JSONLDecoder[MessageBatchIndividualResponse]:
        """
        Streams the results of a Message Batch as a \`.jsonl\` file.

        Each line in the file is a JSON object containing the result of a single request
        in the Message Batch. Results are not guaranteed to be in the same order as
        requests. Use the \`custom_id\` field to match results to requests.
…
        """
…
        batch = self.retrieve(message_batch_id=message_batch_id, workspace_id=workspace_id)
        if not batch.results_url:
            raise AnthropicError(
                f"No \`results_url\` for the given batch; Has it finished processing? {batch.processing_status}"
            )

        extra_headers = {"Accept": "application/binary", **(extra_headers or {})}
…
        return self._get(
            path_template(batch.results_url, message_batch_id=message_batch_id),
…
            cast_to=JSONLDecoder[MessageBatchIndividualResponse],
            stream=True,
        )`,
		notes: [
			'The `batch = self.retrieve(...)` line fetches the batch before anything else. If `results_url` is still empty, the next line raises `AnthropicError` with the current `processing_status` in the message. Calling `results()` on a batch that is `in_progress` fails, so you poll until `ended` first.',
			'The `return self._get(...)` call downloads from `batch.results_url` with `stream=True`, and `JSONLDecoder` parses one line at a time while you loop. The [docs](' + DOCS + '#retrieving-batch-results) recommend streaming "because of the potentially large size of the results".',
			'The docstring repeats the rule that matters most: "Results are not guaranteed to be in the same order as requests." The 42nd line of the file can hold the result of any request. Store your inputs in a dict keyed by `custom_id` before you submit.',
			'The whole collection side fits in a loop. The SDK\'s own [examples/batch_results.py](' + SDK + '/examples/batch_results.py#L17-L19) calls `client.messages.batches.results(batch_id)` and prints each result. A real job replaces the print with a `match` on `result.result.type`, as the docs example does.'
		]
	},
	tradeoff: {
		gain: [
			'Half the price on input and output tokens. On the pricing page read 2026-10-17, Claude Sonnet 5.5 costs $2 and $10 per million input and output tokens, and $1 and $5 in a batch.',
			'One call submits up to 100,000 requests, and the docs say batch usage "does not affect rate limits in the Messages API", so your live traffic keeps its full limit.',
			'Failed, canceled and expired requests cost nothing, and one failed request does not stop the others.'
		],
		cost: [
			'You wait: most batches end within 1 hour, but any request still waiting after 24 hours expires and must be sent again.',
			'A batch cannot stream (`stream: true` is a validation error), and a mistake in `params` shows up only when the whole batch has ended. The docs suggest sending one request through the Messages API first.',
			'Prompt caching works on a best-effort basis: the docs report cache hit rates "ranging from 30% to 98%", because requests run concurrently and in any order (day 34).',
			'Results are stored for 29 days after creation. A script that collects them later than that gets nothing.'
		]
	},
	task: {
		prompt: 'You must label 250,000 product reviews as positive, negative or neutral with Claude Sonnet 5.5. Each request is about 400 input tokens and 10 output tokens. Nobody needs the labels before tomorrow. Plan the batches, the `custom_id` scheme and the collection script, and estimate the cost with and without the Batches API, using the prices from the tradeoff above.',
		hint: 'Start with the limit of 100,000 requests per batch. Then multiply tokens by price, one line for input and one for output.',
		answer: [
			'Batches: 250,000 is more than the 100,000 limit, so you need at least three batches, for example 100,000, 100,000 and 50,000. Each must also stay under 256 MB.',
			'`custom_id`: the review id, such as `review-000123`. It matches `^[a-zA-Z0-9_-]{1,64}$`, and it lets you write each label back to the right row whatever order the results come in.',
			'Cost: input is 250,000 × 400 = 100 million tokens, so $200 at $2 or $100 at $1. Output is 250,000 × 10 = 2.5 million tokens, so $25 at $10 or $12.50 at $5. Total $225 without batches, $112.50 with them.',
			'Collection: poll each batch until `ended`, stream its results, and save each `succeeded` label by `custom_id`. Fix and resend `invalid_request_error` results. Put the other errors and every `expired` request into a new batch.'
		]
	},
	quiz: [
		{
			q: 'You submitted requests `a`, `b` and `c` in that order. How do you know which result line belongs to `b`?',
			options: [
				'It is the second line of the results file, because lines follow the input order',
				'Each line carries the `custom_id` you gave `b` in the request',
				'The message `id` inside each result is derived from the request position',
				'You cannot know, so each batch must hold one request at a time'
			],
			answer: 1,
			why: 'The docs and the SDK docstring both say results may come back in any order. Each JSONL line holds the `custom_id` from its request, and that field is the only link between the two.'
		},
		{
			q: 'A batch of 5,000 requests ends with 4,980 `succeeded`, 15 `errored` (all `invalid_request_error`) and 5 `expired`. What do you pay for, and what do you do next?',
			options: [
				'All 5,000 at the batch price, then resend all 20 failed requests as they are',
				'The 4,980 successes and the 15 errors, then resend only the 5 expired ones',
				'The 4,980 successes; fix the 15 request bodies, then resend those and the 5 expired',
				'Nothing until you download the file, then the 4,980 at the full price'
			],
			answer: 2,
			why: 'Errored, canceled and expired requests are not billed. An `invalid_request_error` means the request body itself is wrong, so sending it again unchanged fails again. Expired requests never reached the model and can go in a new batch as they are.'
		},
		{
			q: 'Every request in your 50,000-request batch has a mistake in its `params`. When do you find out?',
			options: [
				'At once: the create call rejects the batch with a 400 error',
				'After the first request fails, because the batch then stops and reports it',
				'Never: the API fixes small mistakes in `params` before it runs the batch',
				'When processing of the whole batch has ended, as `errored` results'
			],
			answer: 3,
			why: 'The docs say validation of each `params` object "is performed asynchronously", and the errors are returned when the whole batch has ended. So the docs suggest sending one request through the Messages API before you submit the batch.'
		}
	],
	recall: {
		q: 'What does the Message Batches API cost compared with normal calls, and how long can a request wait before it expires?',
		a: '50% of the standard price on input and output tokens. Most batches end within 1 hour, and a request still waiting after 24 hours expires, unbilled.'
	},
	sources: [
		{ title: 'Claude docs, Batch processing, read 2026-10-17', url: DOCS },
		{ title: 'Claude docs, Pricing, read 2026-10-17', url: 'https://platform.claude.com/docs/en/about-claude/pricing' },
		{ title: 'anthropic-sdk-python, src/anthropic/resources/messages/batches.py', url: BATCHES },
		{ title: 'anthropic-sdk-python, examples/batch_results.py', url: `${SDK}/examples/batch_results.py` }
	]
};
