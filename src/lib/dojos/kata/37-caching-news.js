/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'caching-news',
	part: 'Architecture',
	title: 'Caching a news site',
	minutes: 10,
	hook: [
		'9:02 p.m. A minister resigns. The newsroom publishes a short article at 9:03 and puts it at the top of the front page. Within a minute, 50 000 people per second load that front page.',
		'The page is built by a CMS that takes 150 ms per page and runs on 6 servers. Without a cache, those 6 servers would have to build 50 000 pages per second.',
		'With a cache that keeps pages for an hour, the servers stay idle, but readers see the old front page until 10 p.m. The editor-in-chief wants new stories on screen within 30 seconds.'
	],
	terms: [
		{ term: 'TTL', def: 'Time to live: how many seconds a cache serves a stored page before it counts as stale.' },
		{ term: 'Grace', def: 'In Varnish, extra time after the TTL during which the cache still serves the stale page while it fetches a new one in the background.' },
		{ term: 'Request coalescing', def: 'When many clients ask for the same missing page, the cache sends one request to the backend and holds the others until it answers.' },
		{ term: 'Origin', def: 'The servers that build the pages, here the 6 CMS servers behind the cache.' }
	],
	kata: {
		brief: [
			'A news site has 10 million readers a day. On a breaking news night, HTML requests peak at 50 000 per second. About 500 URLs (the front page, section pages and recent articles) get almost all of that traffic.',
			'The CMS builds a page in 150 ms. There are 6 CMS servers. Images, CSS and JS have versioned file names and are already served from a CDN with a one year cache.',
			'A new or changed story must be visible to every reader within 30 seconds of the editor pressing Publish. About 3% of readers are logged-in subscribers who see their name in the header.',
			'Design the HTML caching: where the cache sits, how long it keeps a page, how the 30 second promise holds, and what readers see when the CMS is down.'
		],
		minutes: 10,
		checklist: [
			'Your design gives a number of seconds a cached page can be old, and it is under 30.',
			'Your design counts both caches: the shared cache and the reader’s browser.',
			'Your design gives the requests per second that reach the CMS at peak, worked out from the 500 hot URLs.',
			'Your design says what happens when 10 000 readers ask for the same expired page in the same second.',
			'Your design says what readers see when all 6 CMS servers return errors.',
			'Your design says how a subscriber’s name gets into the header without one cached copy per subscriber.'
		],
		sample: [
			'Put 8 Varnish servers between readers and the CMS. The CMS sends `Cache-Control: max-age=15` on every HTML page. Varnish uses `max-age` to set the TTL, and adds an `Age` header saying how long it has held the page.',
			'In VCL, set `beresp.grace = 10s`. A request that arrives after the 15 s TTL gets the stale page at once, and Varnish fetches a new copy in the background. So Varnish never serves a page built more than 15 + 10 = 25 seconds ago, plus the 150 ms the fetch takes.',
			'Browsers count `max-age` from when the CMS built the page, and subtract the `Age` header. A page that has sat 12 s in Varnish stays fresh 3 s in the browser. The browser adds no time on top of the 25 seconds.',
			'Varnish sends one backend request per expired page and holds the other requests for that page: the Varnish docs call this request coalescing. Each Varnish server fetches each hot URL at most once per 15 s: 8 × 500 / 15 ≈ 267 requests per second reach the CMS. At 150 ms each, that keeps about 40 CMS workers busy, spread over 6 servers.',
			'For an outage, follow the pattern in the Varnish docs: set `beresp.grace = 24h`, and in `vcl_recv` set `req.grace = 10s` when `std.healthy(req.backend_hint)` is true. With a healthy CMS, grace stays at 10 s. With a sick CMS, readers get pages up to a day old instead of errors.',
			'By default, Varnish skips the cache when the request carries a `Cookie` header, and does not store a response with `Set-Cookie`. So `vcl_recv` unsets `req.http.Cookie` on every URL except `/me`, like the `/admin/` example in the Varnish docs. Every reader gets the same cached HTML. A script in the header then loads the subscriber’s name from `/me`, which goes to the CMS.',
			'The cost: a wrong headline also stays up to 25 seconds after the fix, since this design has no purge on Publish. Adding a purge would bring that close to zero, but every Publish then has to reach all 8 Varnish servers. The `/me` calls also skip the cache: 3% of 50 000 is 1 500 per second, so `/me` must be much cheaper than a 150 ms page.'
		]
	},
	quiz: [],
	recall: {
		q: 'With `max-age=15` and a grace of 10 seconds, how old can a front page be, and how many requests per second reach the CMS at peak?',
		a: 'At most 25 seconds (15 s TTL plus 10 s grace). About 267 requests per second: 8 Varnish servers × 500 hot URLs / 15 s.'
	},
	sources: [
		{ title: 'Varnish, Grace mode and keep', url: 'https://www.varnish.org/docs/users-guide/vcl-grace/' },
		{ title: 'Varnish, Achieving a high hitrate (Cache-Control, Age, cookies)', url: 'https://www.varnish.org/docs/users-guide/increasing-your-hitrate/' },
		{ title: 'MDN, Cache-Control (max-age and the Age header)', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control' }
	]
};
