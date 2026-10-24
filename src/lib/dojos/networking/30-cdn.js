const VARNISH = 'https://github.com/varnishcache/varnish-cache/blob/0038dd19804fd92cd8bd4bfe92e5a515a57d5e8e';
const BUILTIN = `${VARNISH}/bin/varnishd/builtin.vcl`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'cdn',
	part: 'Between services',
	title: 'CDNs',
	minutes: 10,
	hook: [
		'On 25 December 2015, Steam Store users opened their account page and saw someone else\'s. Valve\'s statement: "Between 11:50 PST and 13:20 PST store page requests for about 34k users, which contained sensitive personal information, may have been returned and seen by other users."',
		'Steam was under a DoS attack, with traffic 2000% above the average of the Steam Sale. Its web caching partner deployed new caching rules, and "a second caching configuration was deployed that incorrectly cached web traffic for authenticated users".',
		'Some users got the store front page "displayed in the wrong language", others "the account page of another user". Valve kept the store down until "all cached data on edge servers had been purged".'
	],
	terms: [
		{ term: 'Edge POP', def: 'A point of presence: one CDN location with cache servers, close to the users. A request lands on the nearest one, and only a miss goes further toward the origin.' },
		{ term: 'Cache key', def: 'The value the cache uses to find a stored response. By default Fastly and Varnish use the URL (path and query) plus the `Host` header.' },
		{ term: 'Purge', def: 'An explicit removal of content from the cache before its TTL ends: one URL, every object tagged with a surrogate key, or the whole service.' },
		{ term: 'Origin shield', def: 'One designated POP that every other POP sends its misses to. Fastly: "visitor requests from across the global network funnel through a single, designated shield POP".' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['u1["User in Paris: GET /pricing"] --> e1["Edge POP Paris: miss"]'],
				highlight: ['u1', 'e1'],
				note: 'The Paris POP computes the cache key from the URL `/pricing` and the `Host` header. Nothing is stored under that key yet, so the request is a miss and goes on.'
			},
			{
				add: ['e1 -->|"miss"| sh["Shield POP: miss"]', 'sh -->|"one request"| o["Origin"]', 'o -->|"200, Surrogate-Control: max-age=3600"| sh'],
				highlight: ['sh', 'o'],
				note: 'The edge forwards the miss to the shield POP, which misses too and asks the origin. `Surrogate-Control: max-age=3600` sets the CDN\'s TTL to one hour. Fastly removes that header before the response reaches the user, and the shield and the edge both store the response.'
			},
			{
				add: ['u2["User in Madrid: GET /pricing"] --> e2["Edge POP Madrid: miss"]', 'e2 -->|"hit"| sh'],
				highlight: ['u2', 'e2'],
				note: 'A second user lands on the Madrid POP, which has no copy. Its miss goes to the shield, which has one, so the origin sees no request. Without a shield, each POP would send its own miss to the origin.'
			},
			{
				add: ['o2["Origin: new prices published"] -.->|"no message to the CDN"| e1', 'e1 -->|"old /pricing until the TTL ends"| u1'],
				highlight: ['o2'],
				note: 'The prices change at 10:00. A POP that stored the page at 9:59 keeps serving the old one until 10:59, without asking the origin. A URL purge or a surrogate key purge removes it at once. A soft purge marks it stale, serves it one more time, and fetches the new page in the background.'
			},
			{
				add: ['a["Logged-in user: GET /account"] --> e1', 'e1 -.->|"key: URL + Host only"| b["Next user gets the cached /account"]'],
				highlight: ['a', 'b'],
				note: 'If a page that depends on the session cookie is stored under URL and Host only, the next request for that URL gets the first user\'s page. Steam\'s Christmas 2015 leak had this outcome. Varnish\'s built-in VCL refuses to cache such requests unless your VCL changes it.'
			}
		]
	},
	example: {
		title: 'bin/varnishd/builtin.vcl: what Varnish caches, and under which key',
		repo: 'varnishcache/varnish-cache',
		url: `${BUILTIN}#L99-L312`,
		lang: 'text',
		code: `sub vcl_req_authorization {
	if (req.http.Authorization) {
		# Not cacheable by default.
		return (pass);
	}
}

sub vcl_req_cookie {
	if (req.http.Cookie) {
		# Risky to cache by default.
		return (pass);
	}
}
…
sub vcl_builtin_hash {
	hash_data(req.url);
	if (req.http.host) {
		hash_data(req.http.host);
	} else {
		hash_data(server.ip);
	}
}
…
sub vcl_beresp_cookie {
	if (beresp.http.Set-Cookie) {
		call vcl_beresp_hitmiss;
	}
}

sub vcl_beresp_control {
	if (beresp.http.Surrogate-control ~ "(?i)no-store" ||
	    (!beresp.http.Surrogate-Control &&
	      beresp.http.Cache-Control ~ "(?i:no-cache|no-store|private)")) {
		call vcl_beresp_hitmiss;
	}
}
…
sub vcl_beresp_hitmiss {
	set beresp.ttl = param.uncacheable_ttl;
	set beresp.uncacheable = true;
	return (deliver);
}`,
		notes: [
			'Lines 1 to 13 send any request with an `Authorization` or `Cookie` header to `pass`: Varnish fetches it from the backend and never looks it up in the cache. The comment on line 10: "Risky to cache by default."',
			'Lines 15 to 22 are the default cache key: `req.url`, then the `Host` header, or the server IP if there is no `Host`. A cookie, a language or a user ID only changes the key if your VCL adds it with `hash_data` or the response sends `Vary`.',
			'Lines 24 to 36 run on the backend\'s response. A `Set-Cookie`, or a `Cache-Control` with `no-cache`, `no-store` or `private`, calls `vcl_beresp_hitmiss` (lines 38 to 42), which marks the object uncacheable. A `Surrogate-Control` header, when present, overrides `Cache-Control` here.',
			'The [Varnish docs](' + VARNISH + '/doc/sphinx/users-guide/vcl-built-in-code.rst) show how to switch off line 9 with an empty `sub vcl_req_cookie { return; }`, for when "you can trust your backend to always specify whether a response is cacheable or not". After that change, an account page that forgets `Cache-Control: private` is cached and served to the next visitor.'
		]
	},
	tradeoff: {
		gain: [
			'A hit is answered by the nearest POP, and the origin never sees the request.',
			'A shield turns one miss per POP into one request to the origin per object. Fastly lists "Reduces origin load" and a better cache hit ratio as its effects.',
			'A long TTL plus a purge on each content update keeps origin traffic low and pages current. Fastly calls this "particularly useful when combined with setting a very long TTL".'
		],
		cost: [
			'Caching a page built for one logged-in user serves it to others: about 34,000 Steam users were exposed in 90 minutes.',
			'Without a purge, a changed page stays stale for up to its TTL on every POP. Fastly limits URL and surrogate key purges to an average of 100,000 per hour per customer.',
			'With shielding, edge code "typically executes twice", once at the edge POP and once at the shield, which can add duplicate headers if it is not written for both.'
		]
	},
	task: {
		prompt: 'A Varnish server runs the built-in VCL with no changes. For each request, say whether the response is cached, and under which key: (a) `GET /pricing` with no cookie, response `Cache-Control: max-age=300`. (b) `GET /account` with `Cookie: session=81f2`. (c) `GET /news` with no cookie, response `Cache-Control: max-age=60` and `Set-Cookie: ab=B`. (d) `GET /pricing?utm_source=mail` right after (a).',
		hint: 'Request side: lines 1 to 13. Key: lines 15 to 22. Response side: lines 24 to 36.',
		answer: [
			'(a) Cached for 300 s under the key `/pricing` plus the `Host` header. No line of the built-in VCL stops it.',
			'(b) Not cached. Line 9 sees the `Cookie` header and line 11 returns `pass`, so Varnish never even looks in the cache.',
			'(c) Not cached. Line 25 sees `Set-Cookie` and calls `vcl_beresp_hitmiss`, which marks the object uncacheable, so every request for `/news` goes to the backend.',
			'(d) A miss. `req.url` is `/pricing?utm_source=mail`, a different key from `/pricing`, so Varnish fetches and stores a second copy of the same page. Strip tracking parameters from `req.url` in `vcl_recv` to share one entry.'
		],
		steps: [
			{
				title: 'Check request (a)',
				questions: [
					{ q: 'Does a request-side rule (lines 1 to 13) send (a) to `pass`?', options: ['Yes, line 4, because every GET goes to `pass`', 'No: it has no `Authorization` and no `Cookie` header', 'Yes, line 11, because the response has a `max-age`', 'No, but line 25 sends it to `pass` later'], answer: 1, why: 'Lines 2 and 9 only match requests that carry `Authorization` or `Cookie`. (a) carries neither, so Varnish looks it up in the cache.' },
					{ q: 'What is the cache key for (a)?', options: ['`/pricing` plus the server IP', '`/pricing` only', '`/pricing` plus the `Host` header', 'Every request header'], answer: 2, why: 'Lines 16 and 18 hash `req.url` and then `Host`. The server IP is used only when there is no `Host`.' },
					{ q: 'Does the response side mark it uncacheable?', options: ['No: no `Set-Cookie`, and `max-age=300` has no `no-cache`, `no-store` or `private`', 'Yes: any `Cache-Control` header marks it uncacheable', 'Yes: there is no `Surrogate-Control` header', 'Only if the TTL is under 600 s'], answer: 0, why: 'Lines 24 to 36 only call `vcl_beresp_hitmiss` for `Set-Cookie` or one of those three values.' },
					{ q: 'How long is (a) cached?', options: ['60 s', '3600 s', 'Until a purge, with no TTL', '300 s, from `max-age`'], answer: 3, why: 'With no `Surrogate-Control`, the TTL comes from `Cache-Control: max-age=300`.' }
				]
			},
			{
				title: 'Check request (b)',
				questions: [
					{ q: 'Which line catches (b)?', options: ['Line 25, `beresp.http.Set-Cookie`', 'Line 16, `hash_data(req.url)`', 'Line 9, `req.http.Cookie`', 'Line 31, the `Cache-Control` check'], answer: 2, why: 'The request carries `Cookie: session=81f2`, so line 9 matches.' },
					{ q: 'What does `return (pass)` on line 11 do?', options: ['It caches the page under the URL plus the cookie', 'It fetches from the backend and never looks in the cache', 'It serves a stale copy', 'It answers 403'], answer: 1, why: 'A passed request goes to the backend. Varnish neither looks it up nor stores the response.' },
					{ q: 'Why does the built-in VCL do this?', options: ['A page fetched with a cookie may belong to one user', 'Cookies make responses too big to store', 'Varnish cannot parse cookies', 'Cookies change the `Host` header'], answer: 0, why: 'The comment on line 10 says "Risky to cache by default." The default key has no cookie in it, so the next user would get the same page.' },
					{ q: 'Your VCL adds `sub vcl_req_cookie { return; }`, and the account page has no `Cache-Control: private`. What happens to (b)?', options: ['Line 11 still sends it to `pass`', 'Varnish adds the cookie to the key', 'The backend refuses the request', 'It is cached and served to the next visitor'], answer: 3, why: 'The empty sub returns before line 9 runs. Nothing on the response side stops it, so it is stored under URL and `Host` only.' }
				]
			},
			{
				title: 'Check request (c)',
				questions: [
					{ q: 'Does the request side send (c) to `pass`?', options: ['No: the request has no `Cookie` and no `Authorization`', 'Yes, line 9, because the response sets a cookie', 'Yes, line 2, because `/news` is dynamic', 'Yes, because `max-age=60` is short'], answer: 0, why: 'The request rules only read request headers. The cookie in (c) comes later, on the response.' },
					{ q: 'Which line marks the response?', options: ['Line 31, because of `max-age=60`', 'Line 9, because of `Set-Cookie`', 'Line 25, because of `Set-Cookie`', 'Line 16, because of the URL'], answer: 2, why: 'Line 25 checks `beresp.http.Set-Cookie` on the backend\'s response and calls `vcl_beresp_hitmiss`.' },
					{ q: 'What does `vcl_beresp_hitmiss` do?', options: ['It stores the page for 60 s', 'It sets `param.uncacheable_ttl` and marks the object uncacheable', 'It removes `Set-Cookie` and caches the page', 'It sends the page to the shield'], answer: 1, why: 'Lines 39 and 40 set the TTL to `param.uncacheable_ttl` and set `beresp.uncacheable = true`.' },
					{ q: 'So what does each request for `/news` do?', options: ['It gets a hit after the first one', 'It gets a hit for 60 s', 'It gets a 503', 'It goes to the backend'], answer: 3, why: 'An uncacheable object is never served from the cache, so every request for `/news` reaches the backend.' }
				]
			},
			{
				title: 'Check request (d)',
				questions: [
					{ q: 'What is `req.url` for (d)?', options: ['`/pricing`', '`/pricing?utm_source=mail`', '`utm_source=mail`', '`/pricing` plus the `Host` header'], answer: 1, why: '`req.url` holds the path and the query string.' },
					{ q: 'Is (d) a hit on the object stored by (a)?', options: ['Yes, the query string is ignored', 'Yes, because the `Host` is the same', 'No: the key includes the query, so it is a different key', 'No, because (a) has already expired'], answer: 2, why: 'Line 16 hashes the whole `req.url`. A different query gives a different key.' },
					{ q: 'What does Varnish store after (d)?', options: ['A second copy of the same page', 'Nothing, because the page is already cached', 'A redirect to `/pricing`', 'A copy that replaces the first one'], answer: 0, why: 'The miss goes to the backend, and the response is stored under its own key, next to the copy for `/pricing`.' },
					{ q: 'How do you make (a) and (d) share one entry?', options: ['Send `Vary: utm_source`', 'Purge `/pricing`', 'Lower `max-age`', 'Strip tracking parameters from `req.url` in `vcl_recv`'], answer: 3, why: 'With `utm_source` removed before hashing, both requests hash `/pricing` plus `Host`.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'You publish new prices at the origin. The CDN returned them with `Surrogate-Control: max-age=3600`. Some users still see the old prices 40 minutes later. What fixes it now?',
			options: [
				'Restart the origin, so the CDN fetches a fresh copy',
				'Wait: the CDN checks the origin for changes once per minute',
				'Lower `Cache-Control: max-age` on the next responses',
				'Purge the URL, or its surrogate key, on the CDN'
			],
			answer: 3,
			why: 'Each POP keeps its copy for the TTL from `Surrogate-Control`, one hour here, without asking the origin. A purge invalidates the cached object, so the next request goes to the origin. Changing headers on future responses does nothing for copies already stored.'
		},
		{
			q: 'With the default cache key of Fastly or Varnish, which two requests share one cached object?',
			options: [
				'`/pricing` and `/pricing?utm_source=mail` on the same host',
				'`/pricing` on the same host, from two users with different cookies',
				'`/pricing` on `www.example.com` and on `shop.example.com`',
				'`/Pricing` and `/pricing` on the same host'
			],
			answer: 1,
			why: 'The default key is the URL, path and query, plus the `Host` header. Cookies are not part of it, which is why Varnish refuses to cache requests that carry one. A different query string, host or path case gives a different key.'
		},
		{
			q: 'You enable an origin shield on a CDN with 60 POPs. A new image is requested once from every POP. How many requests reach the origin?',
			options: [
				'60, one per POP, because each POP caches on its own',
				'1, because every POP sends its miss to the shield POP',
				'0, because the shield prefetches every image from the origin',
				'120, because each miss is sent to both the shield and the origin'
			],
			answer: 1,
			why: 'With shielding, every POP forwards its misses to one shield POP. The first miss makes the shield fetch the image from the origin, and the other 59 POPs get it from the shield. Without a shield, each of the 60 POPs would ask the origin.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Run Varnish with its built-in VCL in front of a small origin, replay the four requests of Your turn, then switch off the cookie rule and watch one user\'s page reach another.',
		steps: [
			'Write a VCL with only a backend, so the built-in VCL does the rest: `mkdir -p ~/cdn-lab && cd ~/cdn-lab`, then `printf \'vcl 4.1;\\nbackend default { .host = "127.0.0.1"; .port = "9001"; }\\n\' > default.vcl`.',
			'Start an origin that numbers each request it builds, then Varnish in the same network: `docker run -d --rm --name cdn-origin -p 8095:80 node:24-alpine node -e "let n = 0; require(\'http\').createServer((q, r) => { n++; if (q.url.startsWith(\'/pricing\')) r.setHeader(\'Cache-Control\', \'max-age=300\'); if (q.url === \'/news\') { r.setHeader(\'Cache-Control\', \'max-age=60\'); r.setHeader(\'Set-Cookie\', \'ab=B\'); } r.end(\'page \' + q.url + \' built at request \' + n + \' for \' + (q.headers.cookie || \'nobody\') + \'\\n\'); }).listen(9001)"`, then `docker run -d --rm --name cdn --network container:cdn-origin -v "$PWD/default.vcl:/etc/varnish/default.vcl:ro" varnish:7.6`.',
			'Request (a) twice: `curl -s -D - localhost:8095/pricing | grep -E "X-Varnish|built"`. Then (b) with two users: `curl -s -H "Cookie: session=81f2" localhost:8095/account` and the same with `session=a9c4`. Then (c) twice: `curl -s localhost:8095/news`. Then (d): `curl -s "localhost:8095/pricing?utm_source=mail"`.',
			'Switch off the cookie rule: `printf \'sub vcl_req_cookie { return; }\\n\' >> default.vcl`, then `docker rm -f cdn` and run the same Varnish `docker run` again.',
			'Request `/account` as `session=81f2` and then as `session=a9c4`. Clean up with `docker rm -f cdn cdn-origin`.'
		],
		done: [
			'The second `/pricing` shows `X-Varnish` with two numbers and the same `built at request 1`: a hit.',
			'The two `/account` calls and the two `/news` calls each show a new request number: none of them is cached.',
			'`/pricing?utm_source=mail` shows a new request number, so it missed the copy of `/pricing`.',
			'After the change, both `/account` calls print `built at request 7 for session=81f2` (your number may differ): the second user gets the first user\'s page.'
		],
		solution: [
			'Varnish puts the ID of the current request in `X-Varnish`, and on a hit it adds the ID of the request that stored the object.',
			'`/account` goes to `pass` on its `Cookie` header, and `/news` is marked uncacheable by its `Set-Cookie`. `/pricing?utm_source=mail` is a different key, because the key includes the query string.',
			'The empty `vcl_req_cookie` skips the cookie check. The origin sends no `Cache-Control: private`, so the page is stored under URL and `Host` only, which is how Steam\'s account pages leaked.'
		]
	},
	recall: {
		q: 'What is the default cache key in Fastly and Varnish, and what does Varnish\'s built-in VCL do with a request that carries a `Cookie` header?',
		a: 'The URL (path and query) plus the `Host` header. Varnish sends a request with `Cookie` or `Authorization` to `pass`, so it is fetched from the backend and never cached.'
	},
	sources: [
		{ title: 'Steam, Update on Christmas Issues (December 2015)', url: 'https://store.steampowered.com/news/19852/' },
		{ title: 'Varnish source, bin/varnishd/builtin.vcl', url: 'https://github.com/varnishcache/varnish-cache/blob/0038dd19804fd92cd8bd4bfe92e5a515a57d5e8e/bin/varnishd/builtin.vcl' },
		{ title: 'Varnish users guide, Hashing', url: 'https://github.com/varnishcache/varnish-cache/blob/0038dd19804fd92cd8bd4bfe92e5a515a57d5e8e/doc/sphinx/users-guide/vcl-hashing.rst' },
		{ title: 'Varnish users guide, Achieving a high hitrate (Cache-Control, Vary)', url: 'https://github.com/varnishcache/varnish-cache/blob/0038dd19804fd92cd8bd4bfe92e5a515a57d5e8e/doc/sphinx/users-guide/increasing-your-hitrate.rst' },
		{ title: 'Fastly docs, Shielding', url: 'https://www.fastly.com/documentation/guides/concepts/shielding/' },
		{ title: 'Fastly docs, Purging', url: 'https://www.fastly.com/documentation/guides/concepts/edge-state/cache/purging/' },
		{ title: 'Fastly docs, Cache freshness and TTLs', url: 'https://www.fastly.com/documentation/guides/concepts/edge-state/cache/cache-freshness/' },
		{ title: 'Fastly docs, Caching (cache key)', url: 'https://www.fastly.com/documentation/guides/concepts/edge-state/cache/' }
	]
};
