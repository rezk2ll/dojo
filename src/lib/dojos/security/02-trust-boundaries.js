const NEXT = 'https://github.com/vercel/next.js/blob/9704c8e9fcc58236349ed787903831579440a879';
const BEFORE = 'https://github.com/vercel/next.js/blob/a43e5711a6c82b3d6000306544107f4e12b194b6';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'trust-boundaries',
	part: 'Threats',
	title: 'Trust boundaries',
	minutes: 10,
	hook: [
		'On March 21, 2025, Next.js published advisory GHSA-f82v-jwr5-mffw (CVE-2025-29927), scored 9.1: "It is possible to bypass authorization checks within a Next.js application, if the authorization check occurs in middleware." Fixes shipped in 15.2.3, 14.2.25, 13.5.9 and 12.3.5.',
		'Next.js uses a header, `x-middleware-subrequest`, to mark requests that the middleware sends to the app itself, so the middleware does not run on them a second time. The server read that header on every request, including requests from the internet. A visitor who sent it with the right value skipped the middleware, and with it the login check.',
		'The header was meant to come from inside the server, and the server accepted it from outside. A **trust boundary** is the line where data passes from a part you do not control to a part you do. Below: where those lines are in one web request, and why the check has to sit on the line.'
	],
	terms: [
		{ term: 'Trust boundary', def: 'A line in the data flow where data moves from a component you do not control (a browser, another company, the internet) to one you do (your proxy, your app, your database).' },
		{ term: 'Untrusted data', def: 'Anything that crossed a trust boundary without a check: the URL, every header, every cookie and the body of an HTTP request.' },
		{ term: 'Middleware', def: 'Code that runs on every request before the route handler. In Next.js, many apps used it to read the session cookie and redirect visitors who are not logged in.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['net["Internet: browser or script"] -->|"boundary 1"| proxy["Reverse proxy"]', 'proxy -->|"boundary 2"| srv["Next.js server"]', 'srv --> mw["Middleware: is the session cookie valid?"]', 'mw --> page["/admin page"]'],
				highlight: ['net', 'proxy', 'srv'],
				note: 'A request crosses two lines before it reaches your code: from the internet to the proxy, and from the proxy to the app. The sender chose every header, cookie and byte of the body. The middleware is the only place that checks the cookie before `/admin` renders.'
			},
			{
				add: ['mw -->|"fetch to itself, x-middleware-subrequest: middleware"| srv'],
				highlight: ['mw'],
				note: 'When the middleware itself fetches a page of the same app, Next.js adds `x-middleware-subrequest` with the middleware name. The server counts the names and skips the middleware when the count reaches `MAX_RECURSION_DEPTH = 5`, so a loop cannot run forever. That header is only meaningful for requests made inside the process.'
			},
			{
				add: ['atk["Attacker: x-middleware-subrequest: middleware x5"] -->|"boundary 1"| proxy'],
				highlight: ['atk'],
				note: 'The attacker sends the header from outside with `middleware:middleware:middleware:middleware:middleware`. The proxy forwards it, the server counts 5 names, and it answers with `x-middleware-next: 1` without running the middleware. `/admin` renders with no cookie at all.'
			},
			{
				add: ['srv -->|"filterInternalHeaders: delete unless the id matches"| mw'],
				highlight: ['srv'],
				note: 'The fix sits on boundary 2, at the first line of the request handler. **`filterInternalHeaders` deletes the header** unless `x-middleware-subrequest-id` carries a random value the server made at startup. The advisory gives a workaround for one layer up: stop external requests that carry `x-middleware-subrequest` before they reach Next.js.'
			},
			{
				add: ['dj["Django: SECURE_PROXY_SSL_HEADER trusts X-Forwarded-Proto"] -.->|"only if the proxy strips it"| proxy'],
				highlight: ['dj'],
				note: 'Every framework has the same question for headers set by a proxy. Django trusts `X-Forwarded-Proto` only if you set `SECURE_PROXY_SSL_HEADER`, and its docs require that "Your proxy strips the `X-Forwarded-Proto` header from all incoming requests". If the proxy forwards the client value, a plain HTTP request can claim to be HTTPS.'
			}
		]
	},
	example: {
		title: 'packages/next/src/server/lib/server-ipc/utils.ts: the fix drops internal headers at the entry point',
		repo: 'vercel/next.js',
		url: `${NEXT}/packages/next/src/server/lib/server-ipc/utils.ts#L40-L72`,
		lang: 'typescript',
		code: `// These are headers that are only used internally and should
// not be honored from the external request
const INTERNAL_HEADERS = [
  'x-middleware-rewrite',
  'x-middleware-redirect',
  'x-middleware-set-cookie',
  'x-middleware-skip',
  'x-middleware-override-headers',
  'x-middleware-next',
  'x-now-route-matches',
  'x-matched-path',
]

export const filterInternalHeaders = (
  headers: Record<string, undefined | string | string[]>
) => {
  for (const header in headers) {
    if (INTERNAL_HEADERS.includes(header)) {
      delete headers[header]
    }

    // If this request didn't origin from this session we filter
    // out the "x-middleware-subrequest" header so we don't skip
    // middleware incorrectly
    if (
      header === 'x-middleware-subrequest' &&
      headers['x-middleware-subrequest-id'] !==
        (globalThis as any)[Symbol.for('@next/middleware-subrequest-id')]
    ) {
      delete headers['x-middleware-subrequest']
    }
  }
}`,
		notes: [
			'Lines 3 to 12 list 8 headers that Next.js uses between its own parts, and lines 18 to 20 delete each of them from an incoming request. Before the fix, `x-middleware-subrequest` was missing from this treatment.',
			'Lines 25 to 31 keep `x-middleware-subrequest` only when `x-middleware-subrequest-id` equals a value stored on `globalThis`. The same commit creates that value at startup in `router-server.ts` from 8 bytes of `crypto.getRandomValues`, and the middleware adds it to its own fetches.',
			'[`requestHandlerImpl`](' + NEXT + '/packages/next/src/server/lib/router-server.ts#L180-L184) calls `filterInternalHeaders(req.headers)` as its first statement, under the comment "internal headers should not be honored by the request handler". Routing and middleware run after it, so no later code sees the outside value.',
			'The check it protects is in [`sandbox.ts` before the fix](' + BEFORE + '/packages/next/src/server/web/sandbox/sandbox.ts#L94-L114): it splits the header on `:`, counts entries equal to the middleware name, and returns `x-middleware-next: 1` when the count reaches 5. The commit adds a test that sends exactly that header and expects the redirect to still happen.'
		]
	},
	tradeoff: {
		gain: [
			'One check at the entry point covers every route: `filterInternalHeaders` runs once per request, before any of the app code that reads headers.',
			'A short list of names is easy to review. The 8 entries of `INTERNAL_HEADERS` say which headers the outside may never set.'
		],
		cost: [
			'A boundary check that misses one header lets that header through to every route behind it. Apps that checked login only in middleware had no second check, and Vercel\'s postmortem says "We do not recommend Middleware to be the sole method of protecting routes".',
			'The boundary depends on parts you deploy around the app. Django\'s warning lists three conditions on the proxy before `SECURE_PROXY_SSL_HEADER` is safe, and the app cannot check them itself.'
		]
	},
	task: {
		prompt: 'A Flask app listens on `0.0.0.0:8000` behind nginx on port 443. It reads `X-User` (set by an auth proxy after login), uses the leftmost `X-Forwarded-For` value as the client IP for its rate limit, and nginx has `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`. Mark the trust boundaries and list what an attacker can forge, with the fix for each.',
		hint: 'Ask, for each header, who wrote it last before the app read it. Then ask whether a request can reach port 8000 without passing nginx.',
		answer: [
			'Boundaries: internet to nginx, and nginx to Flask. Everything the client sends is untrusted until nginx overwrites or deletes it.',
			'`X-User`: nginx forwards it untouched, so a client can send `X-User: admin`. Set it only in the auth proxy, and delete the client copy with `proxy_set_header X-User "";`. The nginx docs: if the value "is an empty string then this field will not be passed to a proxied server".',
			'`X-Forwarded-For`: `$proxy_add_x_forwarded_for` appends the real address to whatever the client sent. The leftmost value is the client\'s own text, so each request can pick a new IP and dodge the rate limit. Use `proxy_set_header X-Forwarded-For $remote_addr;`, or read the rightmost value that nginx added.',
			'Port 8000 on `0.0.0.0` is open on every interface, so an attacker may skip nginx entirely and set any header. Bind Flask to `127.0.0.1:8000` or a private network that only nginx can reach.'
		]
	},
	quiz: [
		{
			q: 'Why could an internet visitor skip the middleware in Next.js before 15.2.3?',
			options: [
				'The middleware ran after the page had already rendered for that path',
				'The session cookie was signed with a key that was public in the repo',
				'The server accepted an internal header from external requests',
				'The proxy cached the /admin page and served it to every visitor'
			],
			answer: 2,
			why: '`x-middleware-subrequest` was meant only for fetches made by the middleware itself. The server did not remove it from incoming requests, so a value with the middleware name 5 times hit the recursion limit and the middleware returned `x-middleware-next: 1` without running.'
		},
		{
			q: 'Where should the code that removes `x-middleware-subrequest` from outside requests run?',
			options: [
				'In each page that needs a login, before it reads the session',
				'In the middleware itself, as its first line of code',
				'At the first line of the request handler, before routing',
				'In the browser, before the request is sent to the server'
			],
			answer: 2,
			why: 'The header decides whether the middleware runs, so the middleware cannot check it: it never starts. The browser is on the attacker\'s side of the boundary. The fix calls `filterInternalHeaders` first in `requestHandlerImpl`, where every request enters.'
		},
		{
			q: 'You set Django\'s `SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")`. What must the proxy in front do?',
			options: [
				'Strip any `X-Forwarded-Proto` the client sends, then set its own',
				'Forward the client `X-Forwarded-Proto` unchanged to Django',
				'Encrypt the connection from the proxy to Django with TLS',
				'Add `X-Forwarded-Proto` only to requests with a session cookie'
			],
			answer: 0,
			why: 'Django believes the header, so it must come from the proxy alone. The docs require that the proxy "strips the `X-Forwarded-Proto` header from all incoming requests" and sets it only for requests that came in over HTTPS. TLS between proxy and Django does not stop a forged header.'
		}
	],
	recall: {
		q: 'Which header did CVE-2025-29927 let outsiders send, and where does the fix remove it?',
		a: '`x-middleware-subrequest`. `filterInternalHeaders` deletes it at the first line of `requestHandlerImpl` unless `x-middleware-subrequest-id` matches a random value made at startup.'
	},
	sources: [
		{ title: 'GitHub advisory GHSA-f82v-jwr5-mffw, Authorization Bypass in Next.js Middleware', url: 'https://github.com/advisories/GHSA-f82v-jwr5-mffw' },
		{ title: 'Vercel, Postmortem on Next.js Middleware bypass (March 25, 2025)', url: 'https://vercel.com/blog/postmortem-on-next-js-middleware-bypass' },
		{ title: 'vercel/next.js commit 9704c8e, Update middleware request header (#77201)', url: 'https://github.com/vercel/next.js/commit/9704c8e9fcc58236349ed787903831579440a879' },
		{ title: 'Django docs, SECURE_PROXY_SSL_HEADER', url: 'https://docs.djangoproject.com/en/stable/ref/settings/#secure-proxy-ssl-header' },
		{ title: 'nginx docs, proxy_set_header', url: 'https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_set_header' },
		{ title: 'OWASP Cheat Sheet Series, Input Validation', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html' }
	]
};
