const GO = 'https://github.com/golang/go/blob/c3a068eec992b5ae783abce1a9d03f617b671ea2/src/net/http';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'timeouts',
	part: 'Between services',
	title: 'Timeouts',
	minutes: 10,
	hook: [
		'A Node.js app runs behind an AWS Application Load Balancer. The balancer\'s log shows a 502 now and then, and the app\'s log has no request at that time. The balancer keeps an idle connection to the app open for 60 seconds by default. Node.js destroys an idle keep-alive socket after `server.keepAliveTimeout` (5000 ms by default) plus `keepAliveTimeoutBuffer` (1000 ms since v24.6.0).',
		'The AWS troubleshooting page lists this case among the 502 causes: "The target closed the connection with a TCP RST or a TCP FIN while the load balancer had an outstanding request to the target." The app closed an idle connection at the moment the balancer sent a new request on it.',
		'Every hop on a request path has its own timeouts: one to connect, one to wait for a response, one for an idle connection, and sometimes one for the whole call. **The idle timeouts on both ends of one connection must be ordered**, or the race above happens.'
	],
	terms: [
		{ term: 'Connect timeout', def: 'How long a client waits for the TCP handshake to finish. Go\'s `DefaultTransport` dials with `Timeout: 30 * time.Second` and gives the TLS handshake 10 more seconds.' },
		{ term: 'Read timeout', def: 'How long one side waits for data from the other. nginx\'s `proxy_read_timeout 60s` counts between two reads from the backend, and Go\'s `ReadTimeout` covers reading the whole request.' },
		{ term: 'Idle timeout', def: 'How long a keep-alive connection may sit with no request before its owner closes it. Go\'s `http.Server` calls it `IdleTimeout`, Node.js calls it `keepAliveTimeout`.' },
		{ term: 'Total timeout', def: 'A limit on the whole call: connect, redirects, headers and body. Go\'s `http.Client{Timeout: 5 * time.Second}` is one.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['lb["Load balancer, idle timeout 60 s"] -->|"GET /a, 200, connection kept open"| app["Node.js app, keepAliveTimeout 5 s"]'],
				highlight: ['lb', 'app'],
				note: 'The balancer sends `GET /a` and gets a `200`. Both ends keep the TCP connection for the next request. The balancer may reuse it for 60 seconds, and the app keeps it for about 6.'
			},
			{
				add: ['app -.->|"t = 6 s: FIN, socket destroyed"| lb'],
				highlight: ['app'],
				note: 'Six seconds after its last response (5 s of `keepAliveTimeout` plus the 1 s buffer), the app destroys the socket and its kernel sends a FIN. The FIN takes some time to reach the balancer, and the balancer still lists the connection as idle and usable.'
			},
			{
				add: ['c["Client"] -->|"GET /b"| lb', 'lb -->|"GET /b on the same connection"| app'],
				highlight: ['c', 'lb'],
				note: 'A new client request arrives in that gap. The balancer picks the idle connection and writes `GET /b` on it before it has processed the FIN.'
			},
			{
				add: ['lb -->|"502 Bad Gateway"| c'],
				highlight: ['c'],
				note: 'The app\'s side is closed, so `GET /b` gets a TCP RST or the FIN back, never a response. The balancer answers the client with a 502. The app never parsed `GET /b`, so its log is empty for that moment.'
			},
			{
				add: ['fix["keepAliveTimeout 65 s, above the balancer\'s 60 s"] --> app'],
				highlight: ['fix'],
				note: 'AWS recommends that you "configure the idle timeout of your application to be larger than the idle timeout configured for the load balancer". With 65 s on the app, the balancer always closes an idle connection first, and it never writes to one the app has closed.'
			}
		]
	},
	example: {
		title: 'src/net/http/transport.go: the Go client retries the keep-alive race',
		repo: 'golang/go',
		url: `${GO}/transport.go#L836-L881`,
		lang: 'go',
		code: `func (pc *persistConn) shouldRetryRequest(req *Request, err error) bool {
	if http2isNoCachedConnError(err) {
		// Issue 16582: if the user started a bunch of
		// requests at once, they can all pick the same conn
		// and violate the server's max concurrent streams.
		// Instead, match the HTTP/1 behavior for now and dial
		// again to get a new TCP connection, rather than failing
		// this request.
		return true
	}
	if err == errMissingHost {
		// User error.
		return false
	}
	if !pc.isReused() {
		// This was a fresh connection. There's no reason the server
		// should've hung up on us.
		//
		// Also, if we retried now, we could loop forever
		// creating new connections and retrying if the server
		// is just hanging up on us because it doesn't like
		// our request (as opposed to sending an error).
		return false
	}
	if _, ok := err.(nothingWrittenError); ok {
		// We never wrote anything, so it's safe to retry, if there's no body or we
		// can "rewind" the body with GetBody.
		return req.outgoingLength() == 0 || req.GetBody != nil
	}
	if !req.isReplayable() {
		// Don't retry non-idempotent requests.
		return false
	}
	if _, ok := err.(transportReadFromServerError); ok {
		// We got some non-EOF net.Conn.Read failure reading
		// the 1st response byte from the server.
		return true
	}
	if err == errServerClosedIdle {
		// The server replied with io.EOF while we were trying to
		// read the response. Probably an unfortunately keep-alive
		// timeout, just as the client was writing a request.
		return true
	}
	return false // conservatively
}`,
		notes: [
			'This function runs on the client side, after a request failed on a pooled connection. It decides whether the `Transport` sends the request again on a new connection.',
			'Line 15 refuses a retry on a fresh connection. A server that hangs up on a new connection probably rejects the request, and a retry could loop forever.',
			'Lines 39 to 43 handle the race from the diagram. `errServerClosedIdle` means the server returned EOF on a reused connection, and the comment calls it "Probably an unfortunately keep-alive timeout".',
			'Line 30 stops the retry for a request that is not replayable. [`isReplayable`](' + GO + '/request.go#L1557-L1571) accepts GET, HEAD, OPTIONS, TRACE and QUERY, or a request with an `Idempotency-Key` header. A plain POST that hits the race returns an error to your code.'
		]
	},
	tradeoff: {
		gain: [
			'A Go client with `Timeout: 5 * time.Second` calling a handler that sleeps 8 s returns after 5.0 s with "context deadline exceeded (Client.Timeout exceeded while awaiting headers)" (go1.24.4, run for this chapter).',
			'An app idle timeout above the balancer\'s (65 s against 60 s) removes the keep-alive race: only the balancer closes idle connections.'
		],
		cost: [
			'`http.Client.Timeout` and `Transport.ResponseHeaderTimeout` are zero by default, which means no limit. A client using `http.DefaultClient` waits forever on a server that accepts the connection and never answers.',
			'`Client.Timeout` keeps running while you read the body. A 5 s limit cuts a 200 MB download that needs 20 s, even when every byte arrives on time.',
			'Adding nginx between the balancer and the app adds one more connection, so one more pair of idle timeouts to order: nginx\'s upstream `keepalive_timeout` (60 s by default) must stay below the app\'s.'
		]
	},
	task: {
		prompt: 'Three Go services sit behind a load balancer with the default 60 s idle timeout. Service A has `http.Server{IdleTimeout: 30 * time.Second}`. Service B has `http.Server{ReadTimeout: 10 * time.Second}` and no `IdleTimeout`. Service C has `http.Server{ReadHeaderTimeout: 5 * time.Second, IdleTimeout: 120 * time.Second}`. Which services can produce the 502 race, and after how many idle seconds do they close?',
		hint: 'Read the `IdleTimeout` doc comment in Go\'s `server.go`: what does a zero value fall back to?',
		answer: [
			'Service A closes an idle connection after 30 s. The balancer may still reuse it until 60 s, so A can produce 502s.',
			'Service B has no `IdleTimeout`, so Go uses `ReadTimeout`: "If zero, the value of ReadTimeout is used." It closes idle connections after 10 s, which is even more likely to race than A.',
			'Service C closes after 120 s, later than the balancer\'s 60 s. The balancer always closes first, so C is safe. Its `ReadHeaderTimeout` of 5 s only limits reading the headers of each request and plays no part in the idle race.',
			'Fix A and B by setting `IdleTimeout` above 60 s, for example `IdleTimeout: 75 * time.Second`.'
		],
		steps: [
			{
				title: 'Find each idle timeout',
				questions: [
					{ q: 'After how many idle seconds does Service A close a connection?', options: ['30 s', '60 s', 'Never: it has no limit', '120 s'], answer: 0, why: '`IdleTimeout: 30 * time.Second` is set directly on A.' },
					{ q: 'Service B has no `IdleTimeout`. What does Go use instead?', options: ['No limit: idle connections stay open for good', '`ReadTimeout`, so 10 s', 'A built-in default of 60 s', '`ReadHeaderTimeout`, which B does not set'], answer: 1, why: 'The doc comment says: "If zero, the value of ReadTimeout is used." B has `ReadTimeout: 10 * time.Second`.' },
					{ q: 'After how many idle seconds does Service C close?', options: ['5 s, from `ReadHeaderTimeout`', '60 s, the same as the balancer', '120 s', '10 s, like B'], answer: 2, why: 'C sets `IdleTimeout: 120 * time.Second` itself, so no fallback applies.' },
					{ q: 'What does C\'s `ReadHeaderTimeout` of 5 s limit?', options: ['The idle time between two requests', 'The time to write the whole response', 'The TCP connect from the balancer', 'The time to read the headers of each request'], answer: 3, why: 'It only covers reading the request headers. It plays no part in the idle race.' }
				]
			},
			{
				title: 'Compare with the balancer',
				questions: [
					{ q: 'A connection to Service A was last used 20 s ago, and the balancer reuses it now. Can that request hit the race?', options: ['Yes: any reused connection can race', 'No: A keeps an idle connection until 30 s', 'Yes: the balancer closes it at 20 s', 'No: Go retries it for the balancer'], answer: 1, why: 'The race needs the app to have closed the connection. At 20 s idle, A still holds it, so the request is served. The risk starts once A closes at 30 s.' },
					{ q: 'Can Service A produce the 502 race?', options: ['Yes: it closes at 30 s, and the balancer may reuse the connection until 60 s', 'No: 30 s is half of 60 s, so they never meet', 'No: Go retries the request for the balancer', 'Only when the app is under heavy load'], answer: 0, why: 'Between 30 s and 60 s of idle time, the balancer thinks the connection is usable while A has closed it.' },
					{ q: 'Can Service B produce it?', options: ['No: `ReadTimeout` only covers reading a request', 'No: without `IdleTimeout` it never closes', 'Only for POST requests', 'Yes: it closes at 10 s, even more likely than A'], answer: 3, why: 'The fallback gives B a 10 s idle timeout. The gap up to the balancer\'s 60 s is wider than for A.' },
					{ q: 'Can Service C produce it?', options: ['Yes: 120 s is too long', 'Yes: `ReadHeaderTimeout` closes idle connections at 5 s', 'No: the balancer closes first, at 60 s', 'Only when the balancer restarts'], answer: 2, why: 'C keeps idle connections longer than the balancer, so only the balancer ever closes them.' }
				]
			},
			{
				title: 'Picture the race',
				questions: [
					{ q: 'A connection to Service B reaches 10 s idle. What does B\'s kernel send the balancer?', options: ['A FIN, which takes some time to reach the balancer', 'A `502` response', 'An HTTP `Connection: close` header', 'Nothing until the next request arrives'], answer: 0, why: 'Go closes the socket and the kernel sends a FIN. Until the balancer has processed it, the connection still looks idle and usable.' },
					{ q: 'The balancer writes a `GET` on that closed connection. What comes back on it?', options: ['A `502` from B', 'A late `200`', 'A TCP RST or the FIN, never an HTTP response', 'A `408 Request Timeout` from B'], answer: 2, why: 'B\'s side is closed, so no HTTP code runs there. The balancer gets a RST or the FIN, and writes its own 502 for the client.' },
					{ q: 'Why is the app\'s log empty at that moment?', options: ['Its logging drops requests under load', 'It never parsed the request', 'It crashed and restarted', 'The request went to another instance'], answer: 1, why: 'The app had already closed the socket. The request never reached its HTTP code.' },
					{ q: 'Why is B more likely to race than A?', options: ['It has a `ReadTimeout`, which A does not', 'Its requests are larger', 'It uses a different Go version', 'It closes at 10 s, so the risky window up to 60 s is 50 s instead of 30 s'], answer: 3, why: 'Any reuse between the app\'s close and the balancer\'s 60 s can race. The earlier the app closes, the wider that window.' }
				]
			},
			{
				title: 'Fix it',
				questions: [
					{ q: 'How do you fix A and B?', options: ['Set the balancer\'s idle timeout to 120 s', 'Set `ReadTimeout: 0` on both', 'Set `IdleTimeout` above 60 s, for example `75 * time.Second`', 'Add a retry in every client of the balancer'], answer: 2, why: 'An app idle timeout above the balancer\'s means only the balancer closes idle connections.' },
					{ q: 'B now has `IdleTimeout: 75 * time.Second`. What does its `ReadTimeout` of 10 s still do?', options: ['It still limits reading each request, but no longer sets the idle time', 'It still closes idle connections at 10 s', 'It must be removed, or it overrides `IdleTimeout`', 'It becomes 75 s too'], answer: 0, why: 'The fallback only applies when `IdleTimeout` is zero. With it set, `ReadTimeout` goes back to covering the request read.' },
					{ q: 'You add nginx between the balancer and the app. What else must you order?', options: ['Nothing: nginx removes the race', '`proxy_read_timeout` above 60 s', 'The nginx client timeout equal to the app\'s', 'nginx\'s upstream `keepalive_timeout` (60 s by default) below the app\'s'], answer: 3, why: 'nginx adds a second connection, so a second pair of idle timeouts. The side that reuses connections must close first.' },
					{ q: 'Before the fix, a Go client sends a `GET` to the balancer and gets the 502 from B\'s race. Does Go\'s `Transport` retry it?', options: ['Yes: it retries every 502', 'No: the 502 is a valid HTTP response, not a closed connection', 'Yes, because a `GET` is replayable', 'No: Go never retries a request'], answer: 1, why: '`shouldRetryRequest` covers errors on the client\'s own reused connection, like `errServerClosedIdle`. Here the client\'s connection to the balancer works and carries a 502, so your code gets it. Only the timeout order fixes it.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'A load balancer with a 60 s idle timeout sits in front of an app whose keep-alive timeout is 5 s. Users see rare 502s that never appear in the app log. What is the cause?',
			options: [
				'The app is too slow and the balancer gives up waiting for its response',
				'The app closes an idle connection just as the balancer reuses it for a request',
				'The balancer opens too many connections and the app refuses new ones',
				'The balancer\'s health check marks the app down for a few seconds at a time'
			],
			answer: 1,
			why: 'The app closes idle connections after 5 s, while the balancer believes they are usable for 60 s. A request written on a connection the app just closed gets a RST or FIN instead of a response, and the balancer turns that into a 502. The app never parsed the request, so it logs nothing.'
		},
		{
			q: 'A Go client with `http.Client{Timeout: 5 * time.Second}` calls an endpoint that takes 8 s before it sends headers. What happens?',
			options: [
				'The call returns the response after 8 s, because the timeout only covers the connect',
				'The call waits forever, because `Timeout` only applies once headers arrive',
				'The call fails after 5 s with "Client.Timeout exceeded while awaiting headers"',
				'The call fails after 30 s, because `DefaultTransport` dials with a 30 s limit'
			],
			answer: 2,
			why: '`Client.Timeout` covers the whole call, connect, headers and body. The run for this chapter returned after 5.0 s with "context deadline exceeded (Client.Timeout exceeded while awaiting headers)". The 30 s dial limit only applies to the TCP connect.'
		},
		{
			q: 'Go\'s `Transport` gets `errServerClosedIdle` on a reused connection. Which request does it send again on a new connection?',
			options: [
				'Any request, because the server never received it',
				'A POST without a body, because it carries no data to repeat',
				'Only a request sent on a fresh connection that was never pooled',
				'A GET, but not a POST without an `Idempotency-Key` header'
			],
			answer: 3,
			why: '`shouldRetryRequest` returns false for a request that is not replayable before it reaches the `errServerClosedIdle` case. `isReplayable` accepts GET, HEAD, OPTIONS, TRACE and QUERY, or a request with an `Idempotency-Key`. On a fresh connection, `pc.isReused()` is false and the function returns false before any of these checks.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Measure when a Node.js server closes an idle keep-alive connection, raise that limit, and watch a client total timeout cut a slow call.',
		steps: [
			'Make a folder: `mkdir -p ~/timeout-lab && cd ~/timeout-lab`. Create `server.js` with this line: `const s = require(\'http\').createServer((q, r) => { if (q.url === \'/slow\') setTimeout(() => r.end(\'slow\\n\'), 8000); else r.end(\'ok\\n\'); }); if (process.env.KA) s.keepAliveTimeout = Number(process.env.KA); s.listen(3000, () => console.log(\'keepAliveTimeout\', s.keepAliveTimeout));`',
			'Create `idle.js`, a client that sends one request and then sits idle: `const t = Date.now(); const c = require(\'net\').connect(3000, \'localhost\', () => c.write(\'GET / HTTP/1.1\\r\\nHost: localhost\\r\\n\\r\\n\')); c.on(\'data\', () => {}); c.on(\'close\', () => { console.log(\'server closed the idle connection after\', ((Date.now() - t) / 1000).toFixed(1), \'s\'); process.exit(); }); setTimeout(() => { console.log(\'still open at 30 s\'); process.exit(); }, 30000);`',
			'Run `node server.js` in one terminal and `node idle.js` in another.',
			'Call the slow endpoint with and without a total timeout: `curl -sS --max-time 5 localhost:3000/slow`, then `curl -sS localhost:3000/slow -w "%{time_total}\\n"`.',
			'Stop the server, start it with `KA=65000 node server.js`, and run `node idle.js` again.'
		],
		done: [
			'With the defaults, the server prints `keepAliveTimeout 5000` and `idle.js` prints `server closed the idle connection after` about 6 s, for example `6.1 s` (about 5 s on Node older than 24.6).',
			'`curl --max-time 5` fails with `curl: (28) Operation timed out after` about 5000 milliseconds `with 0 bytes received`, and the call without it prints `slow` after about 8 s.',
			'With `KA=65000`, `idle.js` prints `still open at 30 s`.'
		],
		solution: [
			'Node.js destroys an idle socket after `keepAliveTimeout` plus `keepAliveTimeoutBuffer`: 5 s plus 1 s. A balancer with a 60 s idle timeout would keep using that connection for 54 more seconds: the race window.',
			'`--max-time` is a total timeout like Go\'s `Client.Timeout`: it covers the whole call, so the 8 s endpoint fails at 5 s.',
			'65 s is above a 60 s balancer, so the balancer would always close first.'
		]
	},
	recall: {
		q: 'Which idle timeout must be longer, the load balancer\'s or the app\'s, and what happens when it is the other way round?',
		a: 'The app\'s, for example 65 s against the balancer\'s 60 s. If the app closes first (Node.js defaults to 5 s plus a 1 s buffer), the balancer can send a request on a connection the app just closed and returns a 502.'
	},
	sources: [
		{ title: 'AWS docs, Troubleshoot your Application Load Balancers (HTTP 502)', url: 'https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-troubleshooting.html' },
		{ title: 'AWS docs, Edit attributes for your Application Load Balancer (connection idle timeout)', url: 'https://docs.aws.amazon.com/elasticloadbalancing/latest/application/edit-load-balancer-attributes.html' },
		{ title: 'Node.js docs, http: server.keepAliveTimeout', url: 'https://nodejs.org/api/http.html' },
		{ title: 'Go source, net/http/server.go: Server timeouts', url: 'https://github.com/golang/go/blob/c3a068eec992b5ae783abce1a9d03f617b671ea2/src/net/http/server.go#L3226-L3255' },
		{ title: 'Go source, net/http/client.go: Client.Timeout', url: 'https://github.com/golang/go/blob/c3a068eec992b5ae783abce1a9d03f617b671ea2/src/net/http/client.go#L92-L102' },
		{ title: 'nginx docs, Module ngx_http_proxy_module (proxy_read_timeout)', url: 'https://nginx.org/en/docs/http/ngx_http_proxy_module.html' },
		{ title: 'nginx docs, Module ngx_http_upstream_module (keepalive_timeout)', url: 'https://nginx.org/en/docs/http/ngx_http_upstream_module.html' }
	]
};
