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
		],
		steps: [
			{
				title: 'Read the setup',
				questions: [
					{ q: 'With `SameSite=Lax`, when does the browser attach `sessionid` to a request started by another site?', options: ['On any request, as long as it uses HTTPS', 'Only on a top-level navigation with a safe method such as GET', 'Never: Lax blocks every cross-site request', 'Only on a POST sent with `fetch()`'], answer: 1, why: 'Lax sends the cookie cross-site only on a top-level navigation with a safe method. A cross-site POST arrives without it.' },
					{ q: 'Are `shop.example` and `blog.shop.example` same-site?', options: ['No: the hosts differ', 'Only if they use the same port', 'Yes: same scheme and same registrable domain', 'Only if `blog` is listed in `CSRF_TRUSTED_ORIGINS`'], answer: 2, why: 'Same-site compares the scheme and the registrable domain. Subdomains of `shop.example` are same-site, so Lax always sends the cookie between them.' },
					{ q: 'Which methods does `CsrfViewMiddleware` accept with no check at line 12?', options: ['GET, HEAD, OPTIONS and TRACE', 'GET and POST', 'Only GET', 'Every method when the cookie is Lax'], answer: 0, why: 'Django treats the RFC 9110 safe methods as harmless and accepts them at once. That is why a GET must never change data.' },
					{ q: 'What does `@csrf_exempt` do to a view?', options: ['It skips only the token check and keeps the Origin check', 'It turns on the `X-CSRFToken` header check instead', 'It returns early at line 7, with no Origin check and no token check', 'It sets `SameSite=Strict` on the session cookie'], answer: 2, why: 'Line 7 returns `None` for an exempt view before any check runs. Nothing warns about it.' }
				]
			},
			{
				title: 'Check `delete_photo`',
				questions: [
					{ q: 'A page on `evil.example` links to `https://shop.example/photos/42/delete`. Alice clicks it. Is `sessionid` sent?', options: ['No: Lax leaves the cookie out of every cross-site request', 'Yes: it is a top-level GET navigation', 'No: the link comes from another registrable domain', 'Only if the link opens in a new tab'], answer: 1, why: 'A link is a top-level navigation with GET, the one cross-site case where Lax still sends the cookie.' },
					{ q: 'The GET reaches Django with Alice’s session. What does the middleware do?', options: ['It rejects it: the token is missing', 'It checks the `Origin` header first', 'It accepts it at line 12 with no check', 'It asks for the `X-CSRFToken` header'], answer: 2, why: 'GET is a safe method for Django, so line 12 accepts it. The view then deletes the photo.' },
					{ q: 'Can a page on `blog.shop.example` forge the same delete?', options: ['Yes: it is same-site, the cookie goes along, and GET is not checked', 'No: `blog.shop.example` is not in `CSRF_TRUSTED_ORIGINS`', 'No: Lax blocks requests between subdomains', 'Only with a POST form'], answer: 0, why: 'Same-site requests always carry the cookie, and the Origin check never runs on a GET.' },
					{ q: 'What is the real flaw in `delete_photo`?', options: ['The cookie is Lax instead of Strict', 'It changes data on a GET, which Django never checks', 'It forgot `@csrf_exempt`', 'It takes the photo `id` from the URL'], answer: 1, why: 'Django assumes safe methods have no dangerous side effects. A view that deletes on GET breaks that and is open to any link.' }
				]
			},
			{
				title: 'Check `api_invite`',
				questions: [
					{ q: 'A page on `evil.example` calls `fetch()` with a POST to `api_invite`. Is `sessionid` sent?', options: ['Yes: `fetch()` with `credentials: "include"` always sends cookies', 'No: it is cross-site and not a top-level navigation, so Lax leaves it out', 'Yes: Lax only applies to form posts', 'No: the browser blocks the request before it leaves'], answer: 1, why: 'A cross-site `fetch()` POST is not a top-level navigation. Lax drops the cookie, and the request arrives anonymous.' },
					{ q: 'So can `evil.example` invite a user through `api_invite`?', options: ['Yes: `@csrf_exempt` skips every check', 'Yes: JSON bodies are never checked', 'Only if the Origin header is missing', 'No: the request carries no session, so it is anonymous'], answer: 3, why: 'Without the cookie the server sees no logged-in user. Lax saves this case, not Django.' },
					{ q: 'A page on `blog.shop.example` sends the same `fetch()` POST. What happens?', options: ['It works: the cookie goes along and `@csrf_exempt` skips both checks', 'It fails: the Origin check rejects the subdomain', 'It fails: Lax drops cookies on every POST', 'It fails: the token check runs because the body is JSON'], answer: 0, why: 'Same-site means the cookie is attached, and the exempt view returns at line 7 before the Origin or token check.' },
					{ q: 'Which past bug is this second case?', options: ['A view that deletes on GET', 'A missing `{% csrf_token %}` in a template', 'The Grafana case: Lax on, but the attack page was same-site', 'A token compared without `constant_time_compare`'], answer: 2, why: 'Grafana relied on Lax, and the attack page sat on a same-site origin, where Lax still sends the cookie.' }
				]
			},
			{
				title: 'Fix both views',
				questions: [
					{ q: 'How do you fix `delete_photo`?', options: ['Set `SESSION_COOKIE_SAMESITE = "Strict"` and keep the GET', 'Accept only POST with `@require_POST` and put `{% csrf_token %}` in the form', 'Check the `Referer` header inside the view', 'Mark it `@csrf_exempt` and check the session by hand'], answer: 1, why: 'Once the delete is a POST, the middleware runs the Origin and token checks on it.' },
					{ q: 'How do you fix `api_invite`?', options: ['Keep `@csrf_exempt` and add `blog.shop.example` to `CSRF_TRUSTED_ORIGINS`', 'Switch the body from JSON to a form', 'Remove `@csrf_exempt` and send the token in an `X-CSRFToken` header', 'Ask the front end to send `credentials: "omit"`'], answer: 2, why: 'Without the exemption the middleware checks the header token, which `fetch()` calls send as `X-CSRFToken`.' },
					{ q: 'After the fix, a page on `blog.shop.example` POSTs to `api_invite`. Which check stops it first?', options: ['The token check at line 36', 'SameSite=Lax on the cookie', 'The safe-method check at line 12', 'The Origin check at lines 21 to 25'], answer: 3, why: '`https://blog.shop.example` is not the app’s own origin and not in `CSRF_TRUSTED_ORIGINS`, so the Origin check rejects it before the token is read.' },
					{ q: 'Why can the blog page not just copy the token into its request?', options: ['It cannot read `shop.example`’s pages or the `csrftoken` value', 'The token changes every second', 'Browsers strip the `X-CSRFToken` header cross-origin', 'The token is signed with Alice’s password'], answer: 0, why: 'The token is a random secret in `shop.example`’s own pages and cookie. Another origin can make the browser send a request, but it cannot read that secret.' }
				]
			}
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
	lab: {
		minutes: 20,
		goal: 'Run Django’s `CsrfViewMiddleware` on localhost and watch it accept a GET, skip an exempt view, and refuse a POST with no token or a foreign `Origin`.',
		steps: [
			'Make a folder with Django in it: `mkdir -p ~/csrf-lab && cd ~/csrf-lab && python3 -m venv .venv && . .venv/bin/activate && pip install django`.',
			'Write a one-file app with three URLs (`/token`, `/email`, and `/invite` marked `csrf_exempt`): `printf \'%s\\n\' \'import sys\' \'from django.conf import settings\' \'settings.configure(DEBUG=True, SECRET_KEY="lab", ROOT_URLCONF=__name__, MIDDLEWARE=["django.middleware.csrf.CsrfViewMiddleware"])\' \'from django.http import HttpResponse\' \'from django.middleware.csrf import get_token\' \'from django.urls import path\' \'from django.views.decorators.csrf import csrf_exempt\' \'ok = lambda r: HttpResponse(r.method + " accepted\\n")\' \'urlpatterns = [path("token", lambda r: HttpResponse(get_token(r))), path("email", ok), path("invite", csrf_exempt(ok))]\' \'from django.core.management import execute_from_command_line\' \'execute_from_command_line(sys.argv)\' > app.py`',
			'Start it in terminal A: `python app.py runserver 8000`. Keep an eye on its log.',
			'In terminal B, `cd ~/csrf-lab`, then send what a forged request would send: `curl -s -o /dev/null -w "%{http_code}\\n" -X POST localhost:8000/email`, then `curl -s localhost:8000/email`, then `curl -s -X POST localhost:8000/invite`.',
			'Now play the real page. Fetch a token and its cookie: `tok=$(curl -s -c jar -b jar localhost:8000/token); echo "$tok"`. Then `curl -s -b jar -H "X-CSRFToken: $tok" -X POST localhost:8000/email`.',
			'Send the same request with a foreign origin: `curl -s -o /dev/null -w "%{http_code}\\n" -b jar -H "X-CSRFToken: $tok" -H "Origin: http://evil.example" -X POST localhost:8000/email`. Stop the server with Ctrl+C when you are done.'
		],
		done: [
			'The POST to `/email` with no token prints `403`, and the log in A says `CSRF cookie not set`.',
			'`curl -s localhost:8000/email` prints `GET accepted`, and the POST to `/invite` prints `POST accepted`.',
			'`echo "$tok"` prints 64 characters, and the POST with that token prints `POST accepted`.',
			'The POST with `Origin: http://evil.example` prints `403`, and the log says `Origin checking failed`.'
		],
		solution: [
			'The GET passes because line 12 accepts safe methods with no check. A view that deletes on GET would delete here too.',
			'`/invite` passes because `csrf_exempt` returns at line 7, before the Origin and token checks.',
			'The token POST passes because the `X-CSRFToken` header unmasks to the same secret as the `csrftoken` cookie in `jar`. A page on another site cannot read either one.',
			'The foreign `Origin` fails before the token is even read: `http://evil.example` is neither the app’s own origin nor in `CSRF_TRUSTED_ORIGINS`. Clean up with `rm -rf ~/csrf-lab`.'
		]
	},
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
