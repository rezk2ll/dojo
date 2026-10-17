const CORS = 'https://github.com/expressjs/cors/blob/5317ebe670db2aaebc1d496eb5d33493deefb3ed/lib/index.js';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'cors',
	part: 'HTTP and TLS',
	title: 'CORS',
	minutes: 10,
	hook: [
		'A script on `https://example.org` runs `fetch(\'https://nginx.org/en/docs/\')`. In Chrome, driven by Playwright for this chapter, the console says: `Access to fetch at \'https://nginx.org/en/docs/\' from origin \'https://example.org\' has been blocked by CORS policy: No \'Access-Control-Allow-Origin\' header is present on the requested resource.` The script itself gets only `TypeError: Failed to fetch`.',
		'From a terminal, `curl -si https://nginx.org/en/docs/ -H "Origin: https://example.org"` returns `HTTP/1.1 200 OK` and the page. curl does not check CORS headers. The browser does, and MDN notes that "specifics about the error are not available to JavaScript".',
		'The same script then fetches `https://api.github.com/repos/expressjs/cors` and gets a `200` it can read. GitHub\'s response carries `access-control-allow-origin: *`.'
	],
	terms: [
		{ term: 'Origin', def: 'Scheme, host and port of a page, like `https://example.org`. The browser sends it in the `Origin` header of a cross-origin request.' },
		{ term: 'Same-origin policy', def: 'The browser rule that a script may read responses only from its own origin, unless the other server allows it with CORS headers.' },
		{ term: 'Preflight', def: 'An `OPTIONS` request the browser sends before a request that is not CORS-safelisted, with `Access-Control-Request-Method` and `Access-Control-Request-Headers`.' },
		{ term: 'CORS-safelisted method', def: 'The Fetch standard\'s list: `GET`, `HEAD` or `POST`. Other methods need a preflight.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['page["Script on https://example.org"] -->|"GET, Origin: https://example.org"| api["api.github.com"]'],
				highlight: ['page', 'api'],
				note: '`GET` is a CORS-safelisted method and the script adds no extra header, so the browser sends the request at once. It adds `Origin: https://example.org` itself.'
			},
			{
				add: ['api -->|"200, access-control-allow-origin: *"| page'],
				highlight: ['api'],
				note: 'After the response arrives, the browser runs the CORS check. `*` allows any origin for a request without credentials, so the script can read the body.'
			},
			{
				add: ['page -.->|"OPTIONS, Access-Control-Request-Method: PUT, Access-Control-Request-Headers: content-type"| api'],
				highlight: ['page'],
				note: 'Now the script sends `PUT` with `Content-Type: application/json`. `PUT` is not safelisted, and `application/json` is outside the three safelisted types. The browser first sends an `OPTIONS` preflight and holds back the `PUT`.'
			},
			{
				add: ['api -.->|"204, allow-methods: GET, POST, PATCH, PUT, DELETE, max-age: 86400"| page', 'page -->|"PUT /repos/expressjs/cors"| api'],
				highlight: ['api'],
				note: 'GitHub answers `204` and lists `PUT` in `access-control-allow-methods`. The browser then sends the real `PUT`, which got a `404` in this session. `access-control-max-age: 86400` lets the browser cache this answer for up to a day; without it, the Fetch standard sets 5 seconds.'
			},
			{
				add: ['page -.->|"GET with header X-Debug: 1"| block["Blocked after preflight: x-debug is not allowed"]'],
				highlight: ['block'],
				note: '`X-Debug` is not a safelisted header, so this `GET` needs a preflight too. GitHub\'s `access-control-allow-headers` does not list it. Chrome logged `Request header field x-debug is not allowed by Access-Control-Allow-Headers in preflight response`, and per the Fetch standard the `GET` itself is never sent.'
			}
		]
	},
	example: {
		title: 'expressjs/cors lib/index.js: which headers the middleware sets',
		repo: 'expressjs/cors',
		url: `${CORS}#L8-L189`,
		lang: 'js',
		code: `  var defaults = {
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    preflightContinue: false,
    optionsSuccessStatus: 204
  };
…
    if (!options.origin || options.origin === '*') {
      // allow any origin
      headers.push([{
        key: 'Access-Control-Allow-Origin',
        value: '*'
      }]);
…
    } else {
      isAllowed = isOriginAllowed(requestOrigin, options.origin);
      // reflect origin
      headers.push([{
        key: 'Access-Control-Allow-Origin',
        value: isAllowed ? requestOrigin : false
      }]);
      headers.push([{
        key: 'Vary',
        value: 'Origin'
      }]);
    }
…
    if (method === 'OPTIONS') {
      // preflight
      headers.push(configureOrigin(options, req));
      headers.push(configureCredentials(options))
      headers.push(configureMethods(options))
      headers.push(configureAllowedHeaders(options, req));
      headers.push(configureMaxAge(options))
      headers.push(configureExposedHeaders(options))
      applyHeaders(headers, res);

      if (options.preflightContinue) {
        next();
      } else {
        // Safari (and potentially other browsers) need content-length 0,
        //   for 204 or they just hang waiting for a body
        res.statusCode = options.optionsSuccessStatus;
        res.setHeader('Content-Length', '0');
        res.end();
      }
    } else {
      // actual response
      headers.push(configureOrigin(options, req));
      headers.push(configureCredentials(options))
      headers.push(configureExposedHeaders(options))
      applyHeaders(headers, res);
      next();
    }`,
		notes: [
			'Line 2 sets the default origin to `*`. With `app.use(cors())` and no options, lines 8 to 13 add `Access-Control-Allow-Origin: *` to every response.',
			'Line 20 runs when `origin` is a list, a RegExp or a function: the middleware echoes the request\'s `Origin` if it is allowed, and `false` if not. `applyHeaders` skips a `false` value, so a refused origin gets no header and the browser blocks the response. Lines 22 to 25 add `Vary: Origin`, so a shared cache keeps one copy per origin.',
			'Lines 28 to 45 answer the preflight inside the middleware: status `204`, `Content-Length: 0`, and the route handler never runs. Line 33 uses [`configureAllowedHeaders`](' + CORS + '#L94-L115), which echoes `Access-Control-Request-Headers` back when no `allowedHeaders` option is set.',
			'Line 53 calls `next()` for every real request, allowed origin or not. The route runs and the server sends its response. Only the browser decides whether the script may read it.'
		]
	},
	tradeoff: {
		gain: [
			'A script on another site cannot read your API\'s answers with the user\'s cookies unless the response names that exact origin and sends `Access-Control-Allow-Credentials: true`. The Fetch standard forbids `*` for requests with credentials.',
			'One preflight can cover many requests: GitHub\'s `access-control-max-age: 86400` lets the browser reuse the answer for up to a day.'
		],
		cost: [
			'A request that is not safelisted costs one extra round trip, the `OPTIONS`, when the browser has no cached answer. The default cache time is 5 seconds.',
			'CORS does not stop a safelisted request from reaching the server. The browser sends it, then checks the response headers. A `POST` with `Content-Type: text/plain` runs your handler even when the script cannot read the reply.',
			'The error is hidden from the script: `fetch` throws `TypeError: Failed to fetch`, and the reason appears only in the browser console.'
		]
	},
	task: {
		prompt: 'Your app on `https://app.example.com` calls `fetch(\'https://api.example.com/orders\', { method: \'POST\', credentials: \'include\', headers: { \'Content-Type\': \'application/json\' }, body })`. The API is Express with `app.use(cors())` and no options. The order is never shown and the console reports a CORS error. Using the middleware code above, which header breaks the request, and what is the fixed `cors(...)` call?',
		hint: 'Look at the default `origin` on line 2. Then look at what the Fetch standard says about `*` when credentials are included.',
		answer: [
			'With no options, `origin` is `*`, so both the preflight and the `POST` response carry `Access-Control-Allow-Origin: *`. The request uses `credentials: \'include\'`, and the Fetch standard says "`*` is not allowed when credentials are involved". The browser rejects the response.',
			'There is no `Access-Control-Allow-Credentials` header either: `configureCredentials` sets it only when `credentials === true`.',
			'Fix: `app.use(cors({ origin: \'https://app.example.com\', credentials: true }))`. The middleware then sends `Access-Control-Allow-Origin: https://app.example.com`, `Vary: Origin` and `Access-Control-Allow-Credentials: true`. `POST` is in the default methods, and `Content-Type` is echoed back from the preflight.'
		]
	},
	quiz: [
		{
			q: '`curl https://api.example.com/data` returns the JSON. The same `fetch` from your page on another origin fails with a CORS error. Why?',
			options: [
				'curl sends a valid TLS client certificate and the browser does not',
				'The browser enforces CORS on the response; curl ignores those headers',
				'The server blocks every request whose `User-Agent` names a browser',
				'curl falls back to HTTP/1.1, and CORS applies only to HTTP/2'
			],
			answer: 1,
			why: 'The same-origin policy lives in the browser. The server sent the same response to both clients, but the browser found no `Access-Control-Allow-Origin` for your origin and hid the response from the script. curl has no such check.'
		},
		{
			q: 'Which of these `fetch` calls makes the browser send an `OPTIONS` preflight first?',
			options: [
				'A `GET` with only the default headers',
				'A `POST` with `Content-Type: text/plain`',
				'A `POST` with `Content-Type: application/json`',
				'A `HEAD` with `Accept-Language: fr`'
			],
			answer: 2,
			why: '`Content-Type` is safelisted only for `application/x-www-form-urlencoded`, `multipart/form-data` and `text/plain`. `application/json` is outside that list, so the browser checks with a preflight before it sends the `POST`.'
		},
		{
			q: 'An Express API uses `cors({ origin: [\'https://app.example.com\'] })`. A request arrives with `Origin: https://evil.example`. What does the server do?',
			options: [
				'It returns `403` before the route handler runs',
				'It runs the route and responds without `Access-Control-Allow-Origin`',
				'It drops the TCP connection without sending any response',
				'It sends `Access-Control-Allow-Origin: https://evil.example` back'
			],
			answer: 1,
			why: '`isOriginAllowed` returns false, so the header value is `false` and `applyHeaders` skips it. The middleware still calls `next()`, so the route runs. The browser then blocks the script from reading the response.'
		}
	],
	recall: {
		q: 'A browser blocks a cross-origin `fetch` that curl completes. Who enforces CORS, and which response header must name your origin when the request sends cookies?',
		a: 'The browser enforces it after the response arrives; the server still runs the request. With credentials, the response needs `Access-Control-Allow-Origin: https://your.origin` (not `*`) and `Access-Control-Allow-Credentials: true`.'
	},
	sources: [
		{ title: 'Fetch standard, 3.3 CORS protocol', url: 'https://fetch.spec.whatwg.org/#http-cors-protocol' },
		{ title: 'MDN, Cross-Origin Resource Sharing (CORS)', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS' },
		{ title: 'expressjs/cors, lib/index.js', url: CORS }
	]
};
