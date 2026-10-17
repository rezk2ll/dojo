const GO = 'https://github.com/golang/go/blob/022c8636110ebac86a9b88724cda168ed713c21f/src/net/http';
const TRANSPORT = `${GO}/transport.go`;
const RFC = 'https://www.rfc-editor.org/rfc/rfc9112';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'http1',
	part: 'HTTP and TLS',
	title: 'HTTP/1.1 on the wire',
	minutes: 10,
	hook: [
		'A Go service calls an internal API in a loop. For each response it checks `resp.StatusCode`, then runs `resp.Body.Close()` without reading the body.',
		'In a test run for this chapter, with Go 1.24.4 and a local server that answers 10,000 bytes, 10 calls in a row printed "0 of 10 requests reused a connection". Every call opened a new TCP connection. The same loop with `io.Copy(io.Discard, resp.Body)` before `Close` gave "9 of 10 requests reused a connection".',
		'RFC 9112 states the rule behind it: "a client MUST read the entire response message body if it intends to reuse the same connection for a subsequent request". **On one HTTP/1.1 connection, the next response starts right after the last byte of the current body**, so a client that stops reading in the middle has lost its place.'
	],
	terms: [
		{ term: 'Persistent connection', def: 'A TCP connection that carries several requests and responses one after the other. HTTP/1.1 keeps the connection open by default, unless a message carries `Connection: close`.' },
		{ term: 'Content-Length', def: 'A header that gives the body size in bytes, in decimal. The receiver reads exactly that many bytes after the blank line that ends the headers.' },
		{ term: 'Chunked transfer coding', def: 'A body sent as chunks, each one prefixed with its size in hexadecimal and a CRLF. A chunk of size `0` marks the end. A server uses it when it does not know the length in advance.' },
		{ term: 'Head-of-line blocking', def: 'On one HTTP/1.1 connection, a response must be fully sent before the next one starts, so a slow or large response delays every request queued behind it.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['client["curl --http1.1 http://example.org/"] -->|"GET / HTTP/1.1, Host: example.org, blank line"| server["example.org port 80"]'],
				highlight: ['client'],
				note: 'After the TCP handshake, curl writes plain text: the request line `GET / HTTP/1.1`, then one header per line (`Host`, `User-Agent`, `Accept`), each ending in CRLF. An empty line ends the headers. RFC 9112 makes `Host` mandatory in every HTTP/1.1 request.'
			},
			{
				add: ['server -->|"HTTP/1.1 200 OK, Transfer-Encoding: chunked, Connection: keep-alive"| client'],
				highlight: ['server'],
				note: 'The server answers with a status line and its own headers. In a run of `curl -v` for this chapter, example.org sent `Transfer-Encoding: chunked` and `Connection: keep-alive`. It sent no `Content-Length`, so the chunks must tell curl where the body ends.'
			},
			{
				add: ['server -->|"241 CRLF, 577 bytes of HTML, CRLF, 0 CRLF CRLF"| body["Body decoded: 577 bytes"]'],
				highlight: ['body'],
				note: '`curl --raw` shows the bytes before decoding. The first line is `241`, hexadecimal for 577, followed by 577 bytes of HTML. Then comes a line with `0` and an empty line. curl now knows the body is complete and the connection is free.'
			},
			{
				add: ['client -->|"2nd GET / on the same connection"| server'],
				highlight: ['client'],
				note: 'With a second URL on the command line, curl prints `Re-using existing connection with host example.org` and sends the next request on the same TCP connection: no new handshake. It could do that only because it had read the whole first body.'
			},
			{
				add: ['slow["GET /report: 2 MB, slow"] -->|"must finish first"| fast["GET /logo.png waits"]'],
				highlight: ['slow', 'fast'],
				note: 'One connection carries one response at a time. Even with pipelining, RFC 9112 says the server "MUST send the corresponding responses in the same order that the requests were received". A small `/logo.png` waits behind a slow report. RFC 9112 notes that clients open several connections to avoid this head-of-line blocking.'
			}
		]
	},
	example: {
		title: 'src/net/http/transport.go in Go 1.27.2: when a closed body gives the connection back',
		repo: 'golang/go',
		url: `${TRANSPORT}#L2420-L2640`,
		lang: 'go',
		code: `const maxPostCloseReadBytes = 256 << 10
…
const maxPostCloseReadTime = 50 * time.Millisecond

func maybeDrainBody(r io.Reader) bool {
	drainedCh := make(chan bool, 1)
	go func() {
…
		if _, err := io.CopyN(io.Discard, r, maxPostCloseReadBytes+1); err == io.EOF {
			drainedCh <- true
		} else {
			drainedCh <- false
		}
	}()
	select {
	case drained := <-drainedCh:
		return drained
	case <-time.After(maxPostCloseReadTime):
		return false
	}
}
…
		select {
		case err := <-waitForBodyRead:
			tryPutIdle := func() {
				alive = alive &&
					!pc.sawEOF &&
					pc.wroteRequest() &&
					tryPutIdleConn(rc.treq)
			}
			switch err {
			case io.EOF:
				tryPutIdle()
				eofc <- struct{}{}
			case errClosedEarly:
				// Read resp before signaling eofc: the send lets the caller's
				// Close return, and resp belongs to the caller after that.
				tryDrain := alive && resp.ContentLength <= maxPostCloseReadBytes
				eofc <- struct{}{}
				if tryDrain && maybeDrainBody(body.body) {
					tryPutIdle()
				} else {
					alive = false
				}
			default:
				alive = false
			}`,
		notes: [
			'Lines 32 to 34: the caller read the body to `io.EOF`. `tryPutIdle` on line 33 calls `tryPutIdleConn`, which puts the connection in the idle pool, and the next request to that host takes it.',
			'Lines 35 to 44: the caller closed the body early. Line 38 only tries a drain when the declared `Content-Length` is at most 256 KiB, the constant on line 1. A chunked body has `ContentLength` -1, so it passes this test.',
			'Lines 5 to 21: `maybeDrainBody` reads and discards up to 256 KiB plus one byte. It returns `true` only if it reaches the end of the body within 50 ms (line 3). Otherwise line 43 sets `alive = false`, and the connection is closed.',
			'The same test program run with Go 1.27.2: 10,000 bytes closed unread gave "9 of 10 requests reused a connection", and 300,000 bytes gave "0 of 10". Go 1.26.0 has no `maxPostCloseReadBytes`: the drain arrived in Go 1.27. The [`Client.Do` docs](' + GO + '/client.go#L565-L572) still say to read the body to EOF and close it.'
		]
	},
	tradeoff: {
		gain: [
			'A persistent connection lets 9 requests out of 10 skip the TCP handshake, and the TLS handshake on HTTPS.',
			'The format is text with CRLF line ends, so `curl -v` and `curl --raw` show the request line, every header and each chunk size as sent.',
			'Chunked coding lets a server stream a body of unknown size and still keep the connection open.'
		],
		cost: [
			'One connection carries one response at a time, in request order, so a 2 MB report delays the small requests behind it.',
			'To get parallel requests, a client opens more connections, and each one costs a TCP handshake and server memory.',
			'A client that stops reading a body loses the connection: Go 1.24 opened 10 connections for 10 calls.',
			'Every request repeats its headers in full text: curl sent the same `Host`, `User-Agent` and `Accept` lines twice in a row.'
		]
	},
	task: {
		prompt: 'A client receives these bytes on a persistent connection, with each line ending in CRLF: `HTTP/1.1 200 OK` / `Content-Type: text/plain` / `Transfer-Encoding: chunked` / (empty line) / `5` / `hello` / `7` / `, world` / `0` / (empty line). How long is the body, how does the client know it is complete, and can it send the next request on this connection? Then answer the same for a response with `HTTP/1.1 200 OK` / `Connection: close` / (empty line) and the text `hello`, with no length header.',
		hint: 'Read each chunk size as a hexadecimal number. RFC 9112 section 6.3 lists, in order, how a client finds the end of a body.',
		answer: [
			'The chunks are 5 and 7 bytes (`5` and `7` in hex are 5 and 7): `hello` and `, world`, 12 bytes in total, "hello, world".',
			'The chunk of size `0` followed by the empty line ends the body. The response is HTTP/1.1 with no `Connection: close`, so the connection stays open and the next request can go on it.',
			'The second response has no `Content-Length` and no `Transfer-Encoding`. RFC 9112 rule 8 applies: the body is every byte "received prior to the server closing the connection".',
			'The client knows the body is complete only when the server closes the connection, and `Connection: close` already says it will not persist. The next request needs a new TCP connection.'
		]
	},
	quiz: [
		{
			q: 'A Go 1.24 client closes each 10 KB response body without reading it. What happens to the connection?',
			options: [
				'It goes back to the idle pool, because `Close` always returns the connection to the pool',
				'The transport closes it, because unread bytes would be read as the next response',
				'It stays open but the transport sends `Connection: close` on the next request',
				'The server drops it, because it sees that the client did not acknowledge the body'
			],
			answer: 1,
			why: 'On a persistent connection the next response starts right after the current body. Go 1.24 does not drain a body closed early, so it marks the connection dead and the next request opens a new one. Go 1.27 drains up to 256 KiB within 50 ms first.'
		},
		{
			q: 'A response carries `Transfer-Encoding: chunked` and the first body line is `1a`. How many bytes does the first chunk hold?',
			options: ['1', '10', '16', '26'],
			answer: 3,
			why: 'The chunk size is hexadecimal: `1a` is 1 x 16 + 10 = 26 bytes. The client reads 26 bytes, a CRLF, then the next size line, until a size of `0`.'
		},
		{
			q: 'A page sends 6 small requests on one HTTP/1.1 connection, and the first one is a slow 2 MB export. Why do the other 5 wait?',
			options: [
				'TCP limits each connection to one request in flight until the window is reset',
				'The server must answer every request in order, so later responses queue behind the export',
				'HTTP/1.1 forbids sending a second request before the first response headers arrive',
				'The browser waits for the export to fill its cache before it parses other responses'
			],
			answer: 1,
			why: 'An HTTP/1.1 connection carries one response at a time. With pipelining, RFC 9112 requires responses in the order of the requests, so the export blocks the rest. Clients open more connections to avoid it.'
		}
	],
	recall: {
		q: 'How does an HTTP/1.1 client find the end of a response body, and what must it do before it can reuse the connection?',
		a: 'From `Content-Length`, or from chunked coding where a chunk of size `0` ends the body, or else when the server closes. It must read the whole body: Go 1.24 reused 0 of 10 connections when the body was closed unread.'
	},
	sources: [
		{ title: 'RFC 9112, HTTP/1.1 (sections 2.1, 6.3, 7.1 and 9.3)', url: RFC },
		{ title: 'Go 1.27.2 source, src/net/http/transport.go', url: TRANSPORT },
		{ title: 'Go 1.27.2 source, src/net/http/client.go, Client.Do', url: `${GO}/client.go#L565-L572` },
		{ title: 'Go net/http package docs', url: 'https://pkg.go.dev/net/http' },
		{ title: 'curl man page, --raw and --verbose', url: 'https://curl.se/docs/manpage.html' }
	]
};
