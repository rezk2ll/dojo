const DJ = 'https://github.com/django/django/blob/d430084791a61b31cecec132bce3dca19194f7f2';
const CSRF = `${DJ}/django/middleware/csrf.py`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'csrf',
	part: 'Identity',
	title: 'Cross-site request forgery',
	minutes: 10,
	hook: [
		'On 18 January 2022, two researchers reported a bug to Grafana. They showed that a logged-in Grafana admin who opened their web page would invite the attacker as a new Admin user. Opening the page was enough: the admin clicked nothing.',
		'The page called `fetch()` on `/api/org/invites` with `credentials: "include"` and the header `Content-Type: text/plain; json`. The browser attached the admin’s `grafana_session` cookie, so Grafana treated the request as the admin’s own. Grafana relied on `SameSite=Lax` on that cookie since v6.0, and the attack page sat on a same-site origin, where Lax still sends the cookie.',
		'The bug became CVE-2022-21703, rated 6.8 by Grafana. Every version from 3.0-beta1 was affected, and the fix shipped in 8.3.5 and 7.5.15 on 8 February 2022. Below: how a page on another site uses your cookie, and the two checks Django runs to refuse that request.'
	],
	terms: [
		{ term: 'CSRF', def: 'Cross-site request forgery: a page on another site makes the victim’s browser send a request to your app, and the browser attaches the victim’s cookies to it.' },
		{ term: 'CSRF token', def: 'A random value the server puts in its own pages and checks on every unsafe request. A page on another site cannot read it, so it cannot send it.' },
		{ term: 'SameSite', def: 'A cookie attribute (`Strict`, `Lax` or `None`) that tells the browser whether to attach the cookie to a request that comes from another site.' },
		{ term: 'Same-site', def: 'Two URLs are same-site when they share a scheme and a registrable domain, such as `app.example.com` and `blog.example.com`. The port does not count.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['user["Alice logs in to shop.example"] --> cookie["Browser stores sessionid for shop.example"]'],
				highlight: ['user', 'cookie'],
				note: 'Alice logs in to `shop.example` and the browser stores her `sessionid` cookie. From now on the browser sends that cookie with every request to `shop.example`, whichever page started the request.'
			},
			{
				add: ['cookie --> evil["Alice opens evil.example in another tab"]', 'evil -->|"hidden form auto-submits"| post["POST shop.example/email with email=attacker@evil.example"]'],
				highlight: ['evil', 'post'],
				note: 'Alice opens a page on `evil.example`. It holds a hidden `<form method="POST" action="https://shop.example/email">` and a script that calls `submit()` on load. The form sets the account email to the attacker’s address.'
			},
			{
				add: ['post -->|"cookie attached"| server["shop.example sees a valid session and saves the new email"]'],
				highlight: ['server'],
				note: 'With `SameSite=None` on the cookie, or no SameSite in a browser that does not default to Lax, the browser attaches `sessionid` to the POST. The server sees Alice’s session and saves the new email. The attacker then asks for a password reset, which goes to that new address.'
			},
			{
				add: ['post -->|"no csrfmiddlewaretoken"| mw["Django CsrfViewMiddleware"]', 'mw -->|"token missing or wrong"| deny["403 Forbidden"]'],
				highlight: ['mw', 'deny'],
				note: 'With Django, every form on `shop.example` carries a hidden `csrfmiddlewaretoken` field. The middleware compares it with the secret in the `csrftoken` cookie. The page on `evil.example` cannot read either value, so its POST carries no token and gets a 403.'
			},
			{
				add: ['lax["SameSite=Lax on sessionid"] -.->|"cross-site POST: cookie left out"| post'],
				highlight: ['lax'],
				note: 'With `SameSite=Lax`, the browser sends the cookie cross-site only on a top-level navigation with a safe method such as GET. The forged POST from `evil.example` arrives without `sessionid`. A page on `blog.shop.example` is same-site, though, and its POST still gets the cookie: that was the Grafana case.'
			}
		]
	},
	example: {
		title: 'django/middleware/csrf.py: CsrfViewMiddleware.process_view',
		repo: 'django/django',
		url: `${CSRF}#L416-L472`,
		lang: 'python',
		code: `    def process_view(self, request, callback, callback_args, callback_kwargs):
        if getattr(request, "csrf_processing_done", False):
            return None

        # Wait until request.META["CSRF_COOKIE"] has been manipulated before
        # bailing out, so that get_token still works
        if getattr(callback, "csrf_exempt", False):
            return None

        # Assume that anything not defined as 'safe' by RFC 9110 needs
        # protection
        if request.method in ("GET", "HEAD", "OPTIONS", "TRACE"):
            return self._accept(request)

        if getattr(request, "_dont_enforce_csrf_checks", False):
…
            return self._accept(request)

        # Reject the request if the Origin header doesn't match an allowed
        # value.
        if "HTTP_ORIGIN" in request.META:
            if not self._origin_verified(request):
                return self._reject(
                    request, REASON_BAD_ORIGIN % request.META["HTTP_ORIGIN"]
                )
        elif request.is_secure():
            # If the Origin header wasn't provided, reject HTTPS requests if
            # the Referer header doesn't match an allowed value.
…
            try:
                self._check_referer(request)
            except RejectRequest as exc:
                return self._reject(request, exc.reason)

        try:
            self._check_token(request)
        except RejectRequest as exc:
            return self._reject(request, exc.reason)

        return self._accept(request)`,
		notes: [
			'Line 7 returns early for a view marked `@csrf_exempt`. Such a view gets no Origin check and no token check at all.',
			'Line 12 accepts GET, HEAD, OPTIONS and TRACE with no check. The Django docs explain why: these requests "ought never to have any potentially dangerous side effects". A view that deletes data on GET is open to any link on any site.',
			'Lines 21 to 25 compare the `Origin` header with the app’s own scheme and host, and with `CSRF_TRUSTED_ORIGINS`. A POST from `https://blog.shop.example` fails here unless that origin is listed, even though it is same-site.',
			'Line 36 runs `_check_token`. It takes `csrfmiddlewaretoken` from the POST body, or the `X-CSRFToken` header for `fetch()` calls, and [compares it with the cookie secret](' + CSRF + '#L143-L157) using `constant_time_compare`. The 64-character form token is a random 32-character mask followed by the secret shifted by that mask, so each page shows a different value.'
		]
	},
	tradeoff: {
		gain: [
			'A forged POST fails from any origin, including a same-site subdomain, because the attacker page cannot read the `csrftoken` value it would need to send.',
			'The Origin check rejects a POST from an unlisted origin before the token is even read, and works for JSON APIs called with `fetch()`.'
		],
		cost: [
			'Every form template needs `{% csrf_token %}` and every `fetch()` call needs the `X-CSRFToken` header, or users get a 403.',
			'GET handlers get no check, so a GET that changes data stays open to a plain link.',
			'Each `@csrf_exempt` on a view turns the whole check off for that view, and nothing warns about it.'
		]
	},
	task: {
		prompt: 'A Django shop runs on `shop.example` with the default `SESSION_COOKIE_SAMESITE = "Lax"` and `CsrfViewMiddleware` on. It has two views: `delete_photo(request, id)`, which deletes the photo when `request.method == "GET"`, and `api_invite(request)`, decorated with `@csrf_exempt`, which reads a JSON body from a POST and invites a user. For each view, say whether a page on `evil.example` can forge the request, and whether a page on `blog.shop.example` can. Then fix both.',
		hint: 'Lax sends the cookie cross-site on a top-level GET navigation. Same-site requests always get the cookie. Look at lines 7 and 12 of the middleware.',
		answer: [
			'`delete_photo` from `evil.example`: yes. A link to `https://shop.example/photos/42/delete` is a top-level GET navigation, so Lax sends `sessionid`. The middleware accepts GET at line 12 with no check. From `blog.shop.example`: yes as well.',
			'`api_invite` from `evil.example`: no. The `fetch()` POST is cross-site and is not a top-level navigation, so Lax leaves the cookie out and the request is anonymous. From `blog.shop.example`: yes. The request is same-site, the cookie goes along, and `@csrf_exempt` skips both checks at line 7.',
			'Fix `delete_photo`: accept only POST (Django’s `@require_POST`) and put `{% csrf_token %}` in the delete form. The token check then applies.',
			'Fix `api_invite`: remove `@csrf_exempt` and have the front end send the token in an `X-CSRFToken` header. The Origin check at lines 21 to 25 also rejects `https://blog.shop.example`, since it is not in `CSRF_TRUSTED_ORIGINS`.'
		]
	},
	quiz: [
		{
			q: 'Alice is logged in to `shop.example` in a browser that does not default to Lax, and the session cookie has no SameSite attribute. A page on `evil.example` auto-submits a POST form to `shop.example`. What does the browser send?',
			options: [
				'The POST without cookies, because the form comes from another domain',
				'Nothing, because the same-origin policy blocks cross-origin form posts',
				'The POST with Alice’s `sessionid` cookie attached',
				'The POST with only the cookies that `evil.example` set'
			],
			answer: 2,
			why: 'A browser attaches a site’s cookies to every request to that site, whichever page started it. The same-origin policy limits what the attacker page can read back, and it does not stop the request from being sent. Only SameSite or a server-side check stops it.'
		},
		{
			q: 'Why can the page on `evil.example` not include a valid `csrfmiddlewaretoken` in its forged form?',
			options: [
				'The token is a random value in shop.example’s pages and cookie, which other sites cannot read',
				'The token is signed with the user’s password, which the attacker does not know',
				'The browser strips hidden form fields from cross-site submissions',
				'The token is bound to the IP address of the user’s first login'
			],
			answer: 0,
			why: 'Django’s docs describe the CSRF cookie as "a random secret value, which other sites will not have access to". The attacker page can make the browser send a request, but it cannot read `shop.example`’s cookies or pages, so it has no secret to copy into the form.'
		},
		{
			q: 'Grafana set `SameSite=Lax` on `grafana_session`, yet a page served from `localhost:8081` forged a POST to Grafana on `localhost:3000`. Why did the browser attach the cookie?',
			options: [
				'Lax lets cookies through on any POST sent with `fetch()`',
				'The two origins differ only by port, so they are same-site',
				'The `text/plain` content type turns SameSite checks off',
				'Lax applies only to HTTPS, and the test used plain HTTP'
			],
			answer: 1,
			why: 'SameSite compares sites (scheme and registrable domain), and the port is not part of the site. The jub0bs write-up states that `http://localhost:8081` "is same-site with respect to" `http://localhost:3000`, so Lax sent the cookie. An Origin or token check would have caught it.'
		}
	],
	recall: {
		q: 'On a POST, which two values does Django’s `CsrfViewMiddleware` compare?',
		a: 'The `csrfmiddlewaretoken` form field (or the `X-CSRFToken` header), unmasked from 64 to 32 characters, against the secret in the `csrftoken` cookie, with `constant_time_compare`.'
	},
	sources: [
		{ title: 'GitHub Advisory GHSA-cmf4-h3xc-jw8w, Grafana CSRF (CVE-2022-21703)', url: 'https://github.com/advisories/GHSA-cmf4-h3xc-jw8w' },
		{ title: 'jub0bs, CVE-2022-21703: cross-origin request forgery against Grafana', url: 'https://jub0bs.com/posts/2022-02-08-cve-2022-21703-writeup/' },
		{ title: 'Django docs, Cross Site Request Forgery protection', url: 'https://docs.djangoproject.com/en/stable/ref/csrf/' },
		{ title: 'OWASP Cross-Site Request Forgery Prevention Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html' },
		{ title: 'MDN, Set-Cookie: SameSite', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie#samesitesamesite-value' }
	]
};
