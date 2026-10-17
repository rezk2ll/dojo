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
