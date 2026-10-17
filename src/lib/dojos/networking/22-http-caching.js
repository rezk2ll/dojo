const NGINX = 'https://github.com/nginx/nginx/blob/1725db9059e8d4057ce8d5090673d16e20713b45/src/http/ngx_http_upstream.c';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'http-caching',
	part: 'HTTP and TLS',
	title: 'HTTP caching',
	minutes: 10,
	hook: [
		'December 25, 2015, Steam Store. Between 11:50 and 13:20 PST, Valve says store page requests for about 34k users "may have been returned and seen by other users". Some pages showed a billing address, a purchase history or the last two digits of a credit card.',
		'The Store was under a DoS attack, with traffic 2000% above the Steam Sale average. A web caching partner deployed caching rules to absorb it. The second configuration "incorrectly cached web traffic for authenticated users". A shared cache stored a page built for one logged-in user and served it to the next user who asked for the same URL.',
		'HTTP lets the origin mark a response as single-user: `Cache-Control: private` means "a shared cache MUST NOT store the response". A cache configuration can override that. In nginx, `proxy_ignore_headers Cache-Control Set-Cookie` makes the cache skip both headers.'
	],
	terms: [
		{ term: 'Shared cache', def: 'A cache that serves many users: a CDN edge, or nginx with `proxy_cache`. A page it stores can reach anyone who asks for the same cache key.' },
		{ term: 'Private cache', def: 'A cache used by one user, such as the browser\'s disk cache. `Cache-Control: private` allows this cache and forbids shared caches.' },
		{ term: 'Cache key', def: 'What a cache uses to find a stored response. RFC 9111 sets the minimum to the method and the URI. nginx\'s default is `$scheme$proxy_host$request_uri`.' },
		{ term: 'ETag', def: 'A validator: an opaque string the origin sends with a response, like `"6acfc371-36ae"`. A cache sends it back in `If-None-Match` to ask whether its copy is still current.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['u1["User A: GET /en/docs/"] --> c["nginx proxy_cache"]', 'c -->|"miss"| o["Origin"]'],
				highlight: ['u1', 'c'],
				note: 'nginx builds the key `$scheme$proxy_host$request_uri`, finds nothing stored and forwards the request. The cookie and the user are not part of the default key.'
			},
			{
				add: ['o -->|"200, Cache-Control: max-age=60, ETag 6acfc371-36ae, 13998 bytes"| c'],
				highlight: ['o'],
				note: 'The origin sends 13998 bytes with `Cache-Control: max-age=60`. nginx stores the response and marks it valid until now + 60 seconds. RFC 9111: the response is fresh while "freshness_lifetime > current_age".'
			},
			{
				add: ['u2["User B, 20 s later: GET /en/docs/"] -->|"hit"| c'],
				highlight: ['u2'],
				note: 'Same key, age 20 seconds, lifetime 60: the copy is fresh. nginx answers from disk and the origin sees no request. User B gets the bytes the origin built for user A.'
			},
			{
				add: ['c -.->|"90 s later: If-None-Match 6acfc371-36ae"| o', 'o -.->|"304 Not Modified, no body"| c'],
				highlight: ['c', 'o'],
				note: 'At age 90 seconds the copy is stale. With `proxy_cache_revalidate on`, nginx sends a conditional request with `If-None-Match`. The origin answers `304 Not Modified` with headers only, and nginx serves its stored 13998 bytes again.'
			},
			{
				add: ['acc["GET /account"] --> c', 'c -->|"Cache-Control: private: never stored"| o'],
				highlight: ['acc'],
				note: 'The origin marks `/account` with `Cache-Control: private`, or sends a `Set-Cookie`. nginx stores neither response, so each user\'s request goes to the origin. The browser may still keep its own private copy.'
			}
		]
	},
	example: {
		title: 'src/http/ngx_http_upstream.c: how nginx reads Cache-Control from the origin',
		repo: 'nginx/nginx',
		url: `${NGINX}#L5101-L5168`,
		lang: 'c',
		code: `static ngx_int_t
ngx_http_upstream_process_cache_control(ngx_http_request_t *r,
    ngx_table_elt_t *h, ngx_uint_t offset)
{
…
#if (NGX_HTTP_CACHE)
    {
    u_char     *p, *start, *last;
    ngx_int_t   n;

    if (u->conf->ignore_headers & NGX_HTTP_UPSTREAM_IGN_CACHE_CONTROL) {
        return NGX_OK;
    }

    if (r->cache == NULL) {
        return NGX_OK;
    }

    start = h->value.data;
    last = start + h->value.len;

    if (r->cache->valid_sec != 0 && u->headers_in.x_accel_expires != NULL) {
        goto extensions;
    }

    if (ngx_strlcasestrn(start, last, (u_char *) "no-cache", 8 - 1) != NULL
        || ngx_strlcasestrn(start, last, (u_char *) "no-store", 8 - 1) != NULL
        || ngx_strlcasestrn(start, last, (u_char *) "private", 7 - 1) != NULL)
    {
        u->headers_in.no_cache = 1;
        return NGX_OK;
    }

    p = ngx_strlcasestrn(start, last, (u_char *) "s-maxage=", 9 - 1);
    offset = 9;

    if (p == NULL) {
        p = ngx_strlcasestrn(start, last, (u_char *) "max-age=", 8 - 1);
        offset = 8;
    }

    if (p) {
        n = ngx_http_upstream_process_delta_seconds(p + offset, last);

        if (n == NGX_ERROR) {
            u->cacheable = 0;
            return NGX_OK;
        }

        if (n == 0) {
            u->headers_in.no_cache = 1;
            return NGX_OK;
        }

        r->cache->valid_sec = ngx_min((ngx_uint_t) ngx_time() + n,
                                      NGX_MAX_INT_T_VALUE);
        u->headers_in.expired = 0;
    }`,
		notes: [
			'Line 11 returns before any directive is read when the config has `proxy_ignore_headers Cache-Control`. From then on, a `private` from the origin has no effect on this cache.',
			'Lines 26 to 28 search the header value for `no-cache`, `no-store` or `private`. Any one of them sets `no_cache` on line 30, and later code turns that into `u->cacheable = 0`: the response is not stored.',
			'Line 34 looks for `s-maxage=` first and line 38 falls back to `max-age=`. RFC 9111 gives a shared cache the same order. `Cache-Control: max-age=600, s-maxage=60` keeps a copy 600 seconds in the browser and 60 seconds in nginx.',
			'Line 50 treats `max-age=0` like `no-cache`. Line 55 sets the expiry to the current time plus the number of seconds.',
			'A `Set-Cookie` header blocks caching too: [`ngx_http_upstream_process_set_cookie`](' + NGINX + '#L5091-L5095) sets `u->cacheable = 0` unless `proxy_ignore_headers Set-Cookie` is set.'
		]
	},
	tradeoff: {
		gain: [
			'A fresh hit never reaches the origin: during `max-age`, the origin serves one request per cache key. Valve deployed caching rules "to both minimize the impact on Steam Store servers and continue to route legitimate user traffic".',
			'A revalidation of `nginx.org/en/docs/` moves headers only. The page is 13998 bytes, and the `304 Not Modified` it returned to an `If-None-Match` request had no body.'
		],
		cost: [
			'One wrong rule in a shared cache sends personal pages to strangers: about 34k Steam users in 90 minutes.',
			'A page changed at the origin stays old in every cache until its `max-age` runs out. Without `Cache-Control` or `Expires`, RFC 9111 allows a heuristic, "typical" 10% of the time since `Last-Modified`.',
			'The default nginx key has no cookie in it. Personal pages stay out of the cache only if the origin sends `private`, `no-store` or `Set-Cookie`, or the config adds `proxy_no_cache`.'
		]
	},
	task: {
		prompt: 'Real `curl -sI https://nginx.org/en/docs/` output from this session: `HTTP/1.1 200 OK`, `Date: Fri, 16 Oct 2026 23:54:57 GMT`, `Last-Modified: Wed, 14 Oct 2026 18:01:21 GMT`, `ETag: "6acfc371-36ae"`, `Content-Length: 13998`. There is no `Cache-Control` and no `Expires`. (1) For how long may a shared cache that uses RFC 9111\'s typical 10% heuristic reuse this response without asking the origin? (2) What does it send after that, and what comes back if the page has not changed?',
		hint: 'Count the seconds between `Last-Modified` and `Date`, then take 10%. For (2), the cache sends the `ETag` back.',
		answer: [
			'From Oct 14 18:01:21 to Oct 16 23:54:57 is 53 h 53 min 36 s, or 194016 seconds. 10% is about 19402 seconds: the response stays fresh for about 5 h 23 min. A 200 is "heuristically cacheable" per RFC 9110, so the heuristic applies.',
			'After that, the cache sends `GET /en/docs/` with `If-None-Match: "6acfc371-36ae"`. In this session the server answered `HTTP/1.1 304 Not Modified` with the same `ETag` and no body, so the cache reuses its 13998 bytes and resets the age.',
			'If the docs team publishes a fix right after the cache stored the page, readers behind that cache can see the old page for up to 5 h 23 min. A `Cache-Control: max-age=300` from the origin would cap it at 5 minutes.'
		]
	},
	quiz: [
		{
			q: 'The origin sends `/account` with `Cache-Control: private, max-age=300`. Which caches may store it?',
			options: [
				'Every cache, for 300 seconds, as `max-age` wins over `private`',
				'Only the user\'s browser cache; a CDN or nginx proxy cache must not',
				'No cache at all, as `private` means the same as `no-store`',
				'Only the CDN, as `private` stops the browser from storing it'
			],
			answer: 1,
			why: 'RFC 9111: `private` "indicates that a shared cache MUST NOT store the response", while a private cache may. nginx checks for `private` before it reads `max-age` and marks the response as not cacheable.'
		},
		{
			q: 'Your page sends `Cache-Control: max-age=3600`. You fix a typo and deploy at 10:00. A shared cache fetched the page from the origin at 9:50. When can a user behind that cache first get the fixed page?',
			options: [
				'At 10:00, as the deploy purges every cache in front of the origin',
				'At 10:50, when the stored copy reaches an age of 3600 seconds',
				'At 10:00, as the cache checks the ETag on every request',
				'At 11:00, an hour after the deploy that changed the page'
			],
			answer: 1,
			why: 'The cache counts the age from 9:50, when the origin generated its copy. Until age 3600 s it answers from that copy without contacting the origin. Your deploy changes only the origin; emptying the cache earlier needs a purge on the cache itself.'
		},
		{
			q: 'A cache holds a stale copy with `ETag: "6acfc371-36ae"`. The origin page has not changed. What travels between the cache and the origin?',
			options: [
				'A `GET` with `If-None-Match`, then a `304` with headers and no body',
				'A `HEAD`, then a `200` with the full 13998-byte body again',
				'A `GET` with `Cache-Control: no-cache`, then the full body',
				'Nothing: a stale copy is served until the origin pushes a new one'
			],
			answer: 0,
			why: 'The cache sends the stored validator back in `If-None-Match`. The origin compares it with the current `ETag` and answers `304 Not Modified`, which per RFC 9110 has no content, and the cache serves its stored body.'
		}
	],
	recall: {
		q: 'Which `Cache-Control` directive keeps a personal page out of a CDN or nginx cache but lets the browser keep it, and what did Steam lose without it in December 2015?',
		a: '`Cache-Control: private`: shared caches must not store the response. On December 25, 2015, a caching rule cached pages for logged-in users, and pages for about 34k users may have been shown to other users.'
	},
	sources: [
		{ title: 'Valve, Update on Christmas Issues (December 30, 2015)', url: 'https://store.steampowered.com/news/19852/' },
		{ title: 'RFC 9111, HTTP Caching', url: 'https://www.rfc-editor.org/rfc/rfc9111' },
		{ title: 'RFC 9110, HTTP Semantics, section 15.4.5 304 Not Modified', url: 'https://www.rfc-editor.org/rfc/rfc9110#section-15.4.5' },
		{ title: 'nginx docs, ngx_http_proxy_module (proxy_cache_key, proxy_ignore_headers, proxy_cache_revalidate)', url: 'https://nginx.org/en/docs/http/ngx_http_proxy_module.html' },
		{ title: 'nginx source, src/http/ngx_http_upstream.c', url: NGINX }
	]
};
