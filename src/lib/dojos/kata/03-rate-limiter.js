/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'rate-limiter',
	part: 'Small services',
	title: 'A rate limiter',
	minutes: 10,
	hook: [
		'Monday, 9:02. A customer deploys a sync script with a bug: when a call fails, it retries at once, forever. Within a minute it sends 40 000 requests to your public API.',
		'Your 8 app servers spend their time on that one API key. Requests from the 3 999 other customers start to time out, and your support inbox fills up.',
		'The contract says each key may make 100 requests per minute. Nothing in the code checks it yet.'
	],
	terms: [
		{ term: 'Fixed window', def: 'A counter per key for each calendar minute (12:00, 12:01...). The count starts again at 0 when the minute changes.' },
		{ term: '429 Too Many Requests', def: 'The HTTP status for a client that sent too many requests in a given time. It may carry a `Retry-After` header saying when to try again.' },
		{ term: 'Fail open', def: 'When the limiter itself is down, let requests through instead of refusing them all.' }
	],
	kata: {
		brief: [
			'A public API runs on **8 app servers** behind a load balancer. 4 000 customers call it, each with an API key. Together they send 3 000 requests per second at peak.',
			'Each API key may make **100 requests per minute**, counted across all 8 servers. A request over the limit gets an error that tells the client when to try again.',
			'A short burst over the limit at the turn of a minute is acceptable. A steady rate above 100 per minute is not. The check may add one network round trip to each request.'
		],
		minutes: 10,
		checklist: [
			'Your design says where the count for one key lives, so that all 8 servers see the same number.',
			'Your design says what happens to the count when a minute ends, and what removes old counts.',
			'Your design says how many operations per second the counter store receives at peak.',
			'Your design names the response a client gets over the limit, and what it tells the client.',
			'Your design says how many requests one key can get through in the 2 seconds around a minute boundary.',
			'Your design says what the API does with a request when the counter store does not answer.'
		],
		sample: [
			'Why the count must be shared: the 8 servers could each allow 100 / 8, about 12 requests per minute. But a client on one keep-alive connection stays on one server, and would only get 12. So the count lives in one Redis instance that all 8 app servers call.',
			'Each request runs `INCR rl:<key>:<minute>` and `EXPIRE rl:<key>:<minute> 120` inside `MULTI` / `EXEC`. `<minute>` is the Unix time divided by 60. The Redis docs use this same shape in their "rate limiter 1" pattern, with `MULTI` and `EXEC` "to make sure that we\'ll both increment and set the expire at every API call".',
			'If `INCR` returns more than 100, the server answers `429 Too Many Requests` with `Retry-After` set to the seconds left in the minute. RFC 6585 says a 429 response "MUST NOT be stored by a cache", so no proxy serves it to the client again later.',
			'Load: 3 000 requests per second at peak is 3 000 transactions of 2 commands each, 6 000 commands per second, on one Redis. At most 4 000 keys exist per minute, and `EXPIRE 120` keeps at most 2 minutes of them: 8 000 small keys.',
			'The cost of fixed windows: a client can send 100 requests at 12:00:59 and 100 more at 12:01:00. So one key gets **200 requests in 2 seconds**, which the brief accepts. A sliding log would stop this, but it stores one timestamp per request, up to 100 per key, instead of one counter.',
			'If Redis does not answer within 50 ms, the app server lets the request through and logs it. While Redis is down, there is no limit at all, and the 8 servers take whatever traffic arrives. Refusing every request instead would turn a Redis outage into a full API outage.'
		]
	},
	quiz: [],
	recall: {
		q: 'With the fixed window in the sample, how many requests can one key get through around a minute boundary?',
		a: '200 in about 2 seconds: 100 at the end of one minute and 100 at the start of the next. The brief accepts this burst.'
	},
	sources: [
		{ title: 'Redis documentation, INCR (Pattern: rate limiter)', url: 'https://redis.io/docs/latest/commands/incr/' },
		{ title: 'RFC 6585, Additional HTTP Status Codes, 4. 429 Too Many Requests', url: 'https://www.rfc-editor.org/rfc/rfc6585#section-4' }
	]
};
