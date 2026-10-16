/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'autocomplete',
	part: 'Data',
	title: 'Search autocomplete',
	minutes: 10,
	hook: [
		'Yusuf types `iph` in the search box of an electronics shop. Before he types the next letter, a list drops down: "iPhone 15 Pro", "iPhone 15 case", "iPhone charger". He taps the first one.',
		'The shop’s first version ran `WHERE name ILIKE \'%iph%\'` on the products table at each keystroke. At 1 million rows, every keystroke read the whole table, and the list showed up after the user had finished typing.',
		'You design the suggestion service: 10 suggestions for what the user has typed so far, back before the next keystroke.'
	],
	terms: [
		{ term: 'Completion suggester', def: 'An Elasticsearch feature that returns indexed inputs starting with a given prefix, from a structure kept in memory.' },
		{ term: 'Debounce', def: 'The client waits a short time after the last keystroke and sends one request for the text at that moment.' },
		{ term: 'Weight', def: 'A number stored with each suggestion that ranks it, here the product’s sales over 30 days.' }
	],
	kata: {
		brief: [
			'An online shop sells 1 million products. A product name is about 30 characters and 4 words long, like "Apple iPhone 15 Pro". About 5 000 products are added each day.',
			'At peak, users start 400 searches per second and type 8 characters per search on average. The shop measured that a client waiting 100 ms after the last keystroke sends 4 requests per search instead of 8. Half of those requests are for a text of 2 or 3 characters.',
			'The list must show within 100 ms of a request. It must match a word anywhere in the name: `pro` should suggest "Apple iPhone 15 Pro". The best sellers come first.'
		],
		minutes: 10,
		checklist: [
			'Your design says where the 1 million names are searched, without a scan of the products table on each keystroke.',
			'Your design says how `pro` finds "Apple iPhone 15 Pro", where the matching word is not the first one.',
			'Your design says how the 10 suggestions are ranked.',
			'Your design counts the requests per second that reach the search backend at peak, after what the client does to send fewer.',
			'Your design says what the client does when the answer for `ip` arrives after the answer for `iph`.',
			'Your design says how a product added today shows up in the suggestions.',
			'Your design says what is cached, and for how long.'
		],
		sample: [
			'400 searches per second at 8 characters each is 3 200 keystrokes per second. The 100 ms wait cuts that to 1 600 requests per second.',
			'Half of those requests, for 2 or 3 characters, get a cached answer kept for 10 minutes. With lowercase letters and digits there are at most 36² + 36³ = 47 952 such texts, so the cache stays small. About 800 requests per second reach the backend.',
			'The backend is an Elasticsearch index with a `completion` field. The docs say the completion suggester "uses data structures that enable fast lookups, but are costly to build and are stored in-memory". A query sends `"prefix": "iph"` with `"size": 10` and gets the 10 matching inputs with the highest weight.',
			'The completion suggester matches from the start of an input. So each product is indexed with one input per word start: "apple iphone 15 pro", "iphone 15 pro", "15 pro" and "pro". 1 million names then give about 4 million inputs, each under the default `max_input_length` of 50 characters.',
			'Each input carries the product’s sales over 30 days as its weight, so best sellers come first. A nightly job recomputes the weights and reindexes the products. A product added during the day is indexed at once with weight 1, and the docs say new suggestions "can be made visible by refresh", so it shows up after the next index refresh.',
			'The docs warn that suggestions "return the full document _source by default". A full product with its description would make each answer larger. The query sets `"_source": "name"`, so an answer carries only the product id and its display name.',
			'Each request carries the text it was sent for. The client shows an answer only if that text still matches what is in the box. A late answer for `ip` that arrives after the one for `iph` is dropped.',
			'The cost of this design is a second system to run next to the products database, fed by a job that can fall behind. Weights lag by up to a day. The suggester matches word starts only, so `phone` does not find "iPhone".'
		]
	},
	quiz: [],
	recall: {
		q: 'In the sample, how many requests per second reach Elasticsearch at peak, and what brings 3 200 keystrokes per second down to that?',
		a: 'About 800. The 100 ms wait leaves 1 600 requests, and the 10 minute cache answers the half that are 2 or 3 characters long.'
	},
	sources: [
		{ title: 'Elasticsearch docs: Suggesters (completion suggester)', url: 'https://www.elastic.co/docs/reference/elasticsearch/rest-apis/search-suggesters' }
	]
};
