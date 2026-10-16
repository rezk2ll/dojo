/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'api-versioning',
	part: 'Architecture',
	title: 'Changing a public API',
	minutes: 10,
	hook: [
		'A shipping company\'s public API returns `"weight": "12.5 kg"`. The new warehouse scales weigh to the gram, and some customers ship in pounds. The team wants `"weight": { "value": 12.5, "unit": "kg" }`.',
		'2 000 customer integrations read that field today. One of them is a small shop\'s Node.js script that calls `parseFloat(shipment.weight)`. On `"12.5 kg"` it returns 12.5. On an object, `parseFloat` first converts it to the string `[object Object]` and returns `NaN`, and the label printer stops.',
		'Nobody at the shipping company can fix that script. The change must ship anyway, and no integration may break.'
	],
	terms: [
		{ term: 'Breaking change', def: 'A change after which code that worked against the API stops working: a removed field, a renamed field, a field with a new type.' },
		{ term: 'Version pinning', def: 'The API records which version each API key uses and answers that key in that version until its owner changes it.' },
		{ term: 'Version change module', def: 'A piece of code that turns a response from the current shape into the shape of one older version.' }
	],
	kata: {
		brief: [
			'The API serves `GET /v1/shipments/{id}` and 3 other endpoints that return shipments. 2 000 integrations, each with its own API key, send 40 million requests a day, about 460 per second.',
			'The API also sends 1.2 million webhook events a day, and each one contains a shipment with its `weight`. Some integrations never call the API: they only read webhooks.',
			'About 600 integrations have not changed their code in more than a year, judging by their unchanged user agent. Their owners rarely answer email.',
			'Design how `weight` changes from a string to an object, so that new integrations get the object and none of the 2 000 existing ones break.'
		],
		minutes: 10,
		checklist: [
			'Your design says how the API knows which shape of `weight` to send to a given API key.',
			'Your design says what an existing integration receives on the day of the release, with no action from its owner.',
			'Your design covers webhooks, not only the responses to `GET` requests.',
			'Your design says how an integration tests the new shape on one request before it switches over.',
			'Your design says where the code for the old shape lives, and whether the new endpoints have to know about it.',
			'Your design says how the team counts the keys still on the old shape.',
			'Your design says whether the old shape is ever removed, and what happens to the 600 silent integrations if it is.'
		],
		sample: [
			'The API gets dated versions, as Stripe describes for its own API. The current behavior is version `2026-10-01`, and the new `weight` arrives in version `2026-11-01`. Stripe\'s post: "The first time a user makes an API request, their account is automatically pinned to the most recent version available."',
			'On release day, all 2 000 keys are pinned to `2026-10-01`. A key created after the release is pinned to `2026-11-01` on its first request. The shop\'s Node.js script still gets `"12.5 kg"`, and its owner does nothing.',
			'The shipment code builds only the new object. One version change module, `WeightAsString`, turns `{ "value": 12.5, "unit": "kg" }` back into `"12.5 kg"` when the target version is older than `2026-11-01`. As in Stripe\'s design, the response layer "walks back through time" and applies each module until it reaches the key\'s version. The 4 endpoints never check a version themselves.',
			'Webhooks go through the same response layer with the receiving key\'s pinned version. Without that, the integrations that only read the 1.2 million webhook events a day would break on release day.',
			'An `Api-Version: 2026-11-01` header overrides the pin for one request, like Stripe\'s `Stripe-Version` header. A developer tries the new shape on one call, fixes their parser, then moves their key\'s pin in the dashboard. Every request logs its key and version, so a graph shows how many of the 2 000 keys remain on `2026-10-01`.',
			'The alternative is to add a new field, `weight_grams`, next to the old string. Stripe\'s post says it is "safe to add" a new field, and no version system is needed. The cost is two fields for one fact in every response, forever, and another new name at the next change.',
			'What the chosen design costs: the version layer is built once, and `WeightAsString` stays as long as one key is pinned before `2026-11-01`. RFC 8594 defines a `Sunset` header that could announce a removal date. Removing the old shape would break the 600 silent integrations, so this plan sets no `Sunset` date.'
		]
	},
	quiz: [],
	recall: {
		q: 'On release day, what does an existing integration whose owner does nothing receive, and why?',
		a: 'The old string `"12.5 kg"`. Its key is pinned to `2026-10-01`, and the `WeightAsString` module turns the new object back into the old string for that version, in every response and every webhook.'
	},
	sources: [
		{ title: 'Stripe blog: APIs as infrastructure: future-proofing Stripe with versioning', url: 'https://stripe.com/blog/api-versioning' },
		{ title: 'RFC 8594: The Sunset HTTP Header Field', url: 'https://www.rfc-editor.org/rfc/rfc8594' },
		{ title: 'MDN: parseFloat()', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/parseFloat' }
	]
};
