const XNET = 'https://github.com/golang/net/blob/7e562009b3884a0845019b5f886f0242a7c0b970/http2';
const FRAME = `${XNET}/frame.go`;
const CF = 'https://blog.cloudflare.com/technical-breakdown-http2-rapid-reset-ddos-attack/';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'http2',
	part: 'HTTP and TLS',
	title: 'HTTP/2',
	minutes: 10,
	hook: [
		'From 25 August 2023, Cloudflare saw HTTP/2 floods that peaked just above 201 million requests per second. The botnet behind them had about 20,000 machines.',
		'Cloudflare reproduced the attack against a test server that advertised a limit of 100 concurrent streams. **A single TCP packet from the client carried 525 requests, up to stream 1051**, each one cancelled right away with a `RST_STREAM` frame. A cancelled stream no longer counts against the limit, so the client never had to wait.',
		'The flaw is CVE-2023-44487, "Rapid Reset". Cloudflare\'s proxies dispatched each request to an upstream service as soon as they read it, and the upstream servers ran out of capacity before the cancels caught up.'
	],
	terms: [
		{ term: 'Stream', def: 'One request and its response inside an HTTP/2 connection, numbered by a 31 bit stream ID. Streams opened by the client use odd IDs: 1, 3, 5.' },
		{ term: 'Frame', def: 'The unit HTTP/2 sends: a 9 byte header (length, type, flags, stream ID) and a payload. `HEADERS` carries the request headers, `DATA` the body, `RST_STREAM` cancels one stream.' },
		{ term: 'HPACK', def: 'The header compression of HTTP/2 (RFC 7541). A common header is sent as a one byte index into a 61 entry static table, and headers already sent on the connection go into a dynamic table of 4,096 bytes by default.' },
		{ term: 'ALPN', def: 'A TLS extension where the client lists the protocols it speaks and the server picks one. curl offers `h2,http/1.1`, and the server answers `h2` to choose HTTP/2.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['client["curl --http2 --parallel, 3 URLs"] -->|"TLS ClientHello, ALPN: h2,http/1.1"| server["example.org:443"]', 'server -->|"ALPN: server accepted h2"| client'],
				highlight: ['client', 'server'],
				note: 'The protocol is chosen inside the TLS handshake. In a run for this chapter, curl printed `ALPN: curl offers h2,http/1.1` and then `ALPN: server accepted h2`. Each side then sends a connection preface: the client starts with the 24 byte string `PRI * HTTP/2.0`, and both sides send a `SETTINGS` frame.'
			},
			{
				add: ['client -->|"HEADERS stream 1: GET /"| server', 'client -->|"HEADERS stream 3: GET /index.html"| server', 'client -->|"HEADERS stream 5: GET /a"| server'],
				highlight: ['client'],
				note: 'curl printed `[HTTP/2] [1] OPENED stream`, then `Multiplexed connection found` and streams `[3]` and `[5]`. All three requests share one TCP connection, and none waits for an earlier response. RFC 9113 recommends that a server allow at least 100 concurrent streams.'
			},
			{
				add: ['server -->|"DATA s1, DATA s5, DATA s1, DATA s3"| client'],
				highlight: ['server'],
				note: 'The server interleaves `DATA` frames from different streams, and each frame header names its stream. A large response on stream 1 no longer holds back the small one on stream 5, as it would on one HTTP/1.1 connection. A `DATA` frame carries at most 16,384 bytes of payload unless the receiver raises `SETTINGS_MAX_FRAME_SIZE`.'
			},
			{
				add: ['hpack["HPACK: :method GET = 0x82, :path / = 0x84"] -.-> client'],
				highlight: ['hpack'],
				note: 'Headers travel compressed. In the RFC 7541 example, `:method: GET` is static entry 2 and goes out as the single byte `0x82`. The first request sends `:authority: www.example.com` as 17 bytes and stores it in the dynamic table. The second request sends it as one byte, `0xbe`, index 62.'
			},
			{
				add: ['lost["TCP segment with DATA s1 lost"] -->|"kernel holds the later segments"| stall["s3 and s5 wait for the retransmission"]'],
				highlight: ['lost', 'stall'],
				note: 'TCP delivers bytes in order and knows nothing of streams. If a segment with stream 1 data is lost, the receiving kernel keeps the later segments, with stream 3 and 5 data, until the retransmission fills the gap. RFC 9114: "a lost or reordered packet causes all active transactions to experience a stall".'
			}
		]
	},
	example: {
		title: 'golang.org/x/net/http2/frame.go: the 9 byte frame header',
		repo: 'golang/net',
		url: `${FRAME}#L23-L261`,
		lang: 'go',
		code: `const frameHeaderLen = 9

const (
	FrameData           FrameType = 0x0
	FrameHeaders        FrameType = 0x1
	FramePriority       FrameType = 0x2
	FrameRSTStream      FrameType = 0x3
	FrameSettings       FrameType = 0x4
	FramePushPromise    FrameType = 0x5
	FramePing           FrameType = 0x6
	FrameGoAway         FrameType = 0x7
	FrameWindowUpdate   FrameType = 0x8
	FrameContinuation   FrameType = 0x9
	FramePriorityUpdate FrameType = 0x10
)
…
func readFrameHeader(buf []byte, r io.Reader) (FrameHeader, error) {
	_, err := io.ReadFull(r, buf[:frameHeaderLen])
	if err != nil {
		return FrameHeader{}, err
	}
	return FrameHeader{
		Length:   (uint32(buf[0])<<16 | uint32(buf[1])<<8 | uint32(buf[2])),
		Type:     FrameType(buf[3]),
		Flags:    Flags(buf[4]),
		StreamID: binary.BigEndian.Uint32(buf[5:]) & (1<<31 - 1),
		valid:    true,
	}, nil
}`,
		notes: [
			'Line 18 reads exactly 9 bytes, `frameHeaderLen` from line 1, before it looks at anything else. Every frame on the connection starts this way, so the reader always knows where the next frame begins.',
			'Line 23 builds the payload length from 3 bytes, 24 bits. RFC 9113 forbids lengths above 16,384 unless the receiver set a larger `SETTINGS_MAX_FRAME_SIZE`.',
			'Line 26 reads the stream ID from bytes 5 to 8 and masks the top bit, which RFC 9113 reserves. The client side of the same package assigns IDs in [`addStreamLocked`](' + XNET + '/transport.go#L1744-L1753): `cs.ID = cc.nextStreamID`, then `cc.nextStreamID += 2`, starting from 1.',
			'Line 7 is type `0x3`, `RST_STREAM`: the frame that cancels one stream and leaves the connection open. Rapid Reset sent it right after each `HEADERS` frame (type `0x1`, line 5).'
		]
	},
	tradeoff: {
		gain: [
			'One TCP and TLS connection carries all requests to a host: curl ran 3 requests as streams 1, 3 and 5 on connection #0.',
			'A large response on one stream does not hold back the others, because the server interleaves `DATA` frames.',
			'HPACK sends a repeated header as one byte: `:authority: www.example.com` drops from 17 bytes to `0xbe` on the second request.'
		],
		cost: [
			'One lost TCP segment stalls every stream on the connection until it is retransmitted. RFC 9113 says "TCP head-of-line blocking is not addressed by this protocol".',
			'A stream costs the client one small frame to open and one to cancel, which let Rapid Reset reach 201 million requests per second from 20,000 machines.',
			'The frames are binary: to read them you need a decoder, such as `curl -v` or Wireshark, which Cloudflare used on its Rapid Reset capture.'
		]
	},
	task: {
		prompt: 'Part 1: in RFC 7541 example C.3, the first request encodes `:method: GET`, `:scheme: http`, `:path: /` and `:authority: www.example.com` as 20 bytes. The second request sends the same 4 headers plus `cache-control: no-cache`. How many bytes do the 4 repeated headers take the second time, and why? Part 2: a phone on a lossy network loads 20 images over one HTTP/2 connection. One TCP segment carrying part of image 1 is lost, and the retransmission arrives 300 ms later. What happens to images 2 to 20 during those 300 ms?',
		hint: 'After the first request, `:authority` sits in the dynamic table at index 62. For part 2, think about what TCP hands to the application when a segment is missing.',
		answer: [
			'Part 1: 4 bytes, `82 86 84 be`. `:method: GET`, `:scheme: http` and `:path: /` are static entries 2, 6 and 4. `:authority: www.example.com` was added to the dynamic table by the first request, so the second sends index 62 (`0xbe`).',
			'In HTTP/1.1, the same `Host: www.example.com` line alone is 21 bytes of text, 23 with its CRLF, on every request.',
			'Part 2: TCP delivers bytes in order. The kernel keeps the segments that arrived after the gap, including data for the other images, and the HTTP/2 layer gets none of them until the retransmission arrives.',
			'So all 20 images stall for those 300 ms, even though only image 1 lost data. Over HTTP/1.1 with 6 connections, only the connection that lost the segment would stall.'
		],
		steps: [
			{
				title: 'Look up the static entries',
				questions: [
					{ q: 'How does HPACK send `:method: GET`?', options: ['As the text `:method: GET`', 'As one byte, `0x82`: static entry 2', 'As index 62 in the dynamic table', 'It is left out, since GET is the default'], answer: 1, why: '`:method: GET` is entry 2 of the 61 entry static table, sent as the single byte `0x82`.' },
					{ q: 'Which static entries cover `:scheme: http` and `:path: /`?', options: ['62 and 63', '1 and 2', '6 and 4', '82 and 84'], answer: 2, why: 'They are static entries 6 and 4, sent as `0x86` and `0x84`.' },
					{ q: 'Why does `:authority: www.example.com` take 17 bytes the first time?', options: ['The static table has no entry with that value', 'HPACK never compresses the authority', 'It is sent twice for safety', 'It carries a checksum'], answer: 0, why: 'No static entry holds `www.example.com`, so the first request sends the value and stores the header in the dynamic table.' },
					{ q: 'How big is the dynamic table by default?', options: ['61 entries', '16,384 bytes', '100 entries', '4,096 bytes'], answer: 3, why: 'Headers already sent on the connection go into a dynamic table of 4,096 bytes by default.' }
				]
			},
			{
				title: 'Encode the repeat',
				questions: [
					{ q: 'Where does `:authority: www.example.com` sit after the first request?', options: ['Static entry 1', 'Dynamic table, index 62', 'Nowhere: each request starts fresh', 'Dynamic table, index 1'], answer: 1, why: 'Dynamic entries are numbered after the 61 static ones, so the first one added is index 62.' },
					{ q: 'Which byte sends index 62?', options: ['`0x82`', '`0x62`', '`0xbe`', '`0x84`'], answer: 2, why: 'The second request sends `:authority` as one byte, `0xbe`.' },
					{ q: 'How many bytes do the 4 repeated headers take on the second request?', options: ['4', '20', '17', '8'], answer: 0, why: '`82 86 84 be`: one byte each.' },
					{ q: 'Why does the trick only work on the same connection?', options: ['The server rejects indexes from other hosts', 'Static entries change on each connection', 'TLS keys change every request', 'The dynamic table holds headers already sent on that connection'], answer: 3, why: 'The dynamic table is built from what this connection has carried. A new connection starts with an empty one.' }
				]
			},
			{
				title: 'Follow the lost segment',
				questions: [
					{ q: 'How many TCP connections carry the 20 images?', options: ['One per image', 'One', 'Six', 'Two: one each way'], answer: 1, why: 'All the streams share one TCP and TLS connection.' },
					{ q: 'What does TCP know about the 20 streams?', options: ['Nothing: it delivers one ordered byte sequence', 'It keeps a sequence number per stream', 'It acknowledges each stream on its own', 'It delivers each stream as it arrives'], answer: 0, why: 'TCP has one byte sequence for the whole connection and knows nothing of streams.' },
					{ q: 'Segments after the gap carry data for images 2 to 20. Does the server have to send them again?', options: ['Yes: every segment after the gap is sent again', 'Yes: HTTP/2 asks for each stream again', 'No: only the lost segment is retransmitted', 'Only the data for image 2'], answer: 2, why: 'The later segments arrived. The receiving kernel keeps them, and only the one missing segment comes again 300 ms later.' },
					{ q: 'The retransmission arrives at 300 ms. What happens to the data held for images 2 to 20?', options: ['It is dropped for waiting too long', 'The server sends it all again', 'Only image 1 gets its data, and the rest is fetched again', 'The kernel hands it all to HTTP/2, which gives each stream its frames'], answer: 3, why: 'With the gap filled, the byte sequence is complete again. HTTP/2 reads the frames in order, and each frame header names its stream.' }
				]
			},
			{
				title: 'Compare with HTTP/1.1',
				questions: [
					{ q: 'How many bytes does `Host: www.example.com` take on each HTTP/1.1 request?', options: ['1', '17', '23, with its CRLF', '4'], answer: 2, why: 'The line is 21 bytes of text, 23 with CRLF, repeated in full every time.' },
					{ q: 'Over HTTP/1.1 with 6 connections, one segment is lost. What stalls?', options: ['Only the connection that lost it', 'All 6 connections', 'Every image on the page', 'Nothing: HTTP/1.1 retries at once'], answer: 0, why: 'Each connection has its own TCP byte sequence, so the other 5 keep delivering.' },
					{ q: 'Why does HTTP/1.1 need those 6 connections at all?', options: ['TLS allows only one request per handshake', 'One connection carries one response at a time', 'Servers limit each connection to 6 images', 'TCP cannot send more than 6 segments at once'], answer: 1, why: 'HTTP/1.1 head-of-line blocking: responses go in order, one at a time, so clients open several connections.' },
					{ q: 'What does HTTP/2 gain on a clean network, then?', options: ['Larger TCP segments', 'No TLS handshake', 'Faster DNS lookups', 'All requests on one connection, with no waiting between them'], answer: 3, why: 'Streams 1, 3 and 5 share one connection and none waits for an earlier response. The trade is that one lost segment stalls them all.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'curl prints `[HTTP/2] [1] OPENED stream`, then `[3]`, then `[5]`, all on connection #0. Why are the IDs odd?',
			options: [
				'Even IDs are kept for retries of failed requests',
				'Streams the client opens must use odd IDs, and the server uses even ones',
				'curl skips one ID for each response the server has already sent',
				'Each request uses two IDs, one for headers and one for the body'
			],
			answer: 1,
			why: 'RFC 9113 section 5.1.1: client initiated streams use odd identifiers, server initiated ones use even identifiers, and ID 0 carries connection control frames. Go\'s client adds 2 to `nextStreamID` for each new stream.'
		},
		{
			q: 'A video page uses one HTTP/2 connection. A TCP segment with data for stream 7 is lost. What happens to stream 9, whose data arrived in later segments?',
			options: [
				'Nothing, because each stream has its own TCP sequence numbers and acknowledgments',
				'The server resends stream 9 on a fresh TCP connection opened just for it',
				'It waits until the lost segment is retransmitted, because TCP delivers bytes in order',
				'The client sends `RST_STREAM` on stream 7 so that stream 9 can carry on alone'
			],
			answer: 2,
			why: 'TCP has one byte sequence for the whole connection and does not know about streams. The receiving kernel holds the later bytes until the gap is filled, so every stream stalls. HTTP/3 moves streams into QUIC to avoid this.'
		},
		{
			q: 'A server advertises 100 concurrent streams. How could Rapid Reset clients send far more than 100 requests on one connection?',
			options: [
				'They opened a new TCP connection after every 100 requests to reset the count',
				'They sent their own `SETTINGS` frames that raised the server\'s stream limit',
				'They cancelled each stream with `RST_STREAM`, and closed streams do not count toward the limit',
				'They used even stream IDs, which the concurrency limit does not cover at all'
			],
			answer: 2,
			why: 'Only open and half closed streams count toward `SETTINGS_MAX_CONCURRENT_STREAMS`. A `RST_STREAM` moves a stream to closed at once, so the client can open the next one right away while the server still dispatches the cancelled requests.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Run HTTP/2 on your laptop and watch ALPN pick `h2` and three requests share one connection as streams 1, 3 and 5.',
		steps: [
			'Make a folder and a throwaway certificate: `mkdir -p ~/h2-lab && cd ~/h2-lab && openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 7 -subj /CN=localhost`.',
			'Create `h2.conf` with one line each: `server {`, `listen 443 ssl;`, `http2 on;`, `ssl_certificate /lab/cert.pem;`, `ssl_certificate_key /lab/key.pem;`, `root /usr/share/nginx/html;`, `}`.',
			'Start nginx with it: `docker run -d --rm --name h2-lab -p 127.0.0.1:8443:443 -v "$PWD":/lab -v "$PWD/h2.conf":/etc/nginx/conf.d/default.conf:ro nginx:1.27-alpine`.',
			'Send three requests in parallel: `curl -sk -v --http2 --parallel -o /dev/null -o /dev/null -o /dev/null https://localhost:8443/ https://localhost:8443/index.html https://localhost:8443/50x.html 2>&1 | grep -E "ALPN|OPENED|Multiplexed"`.',
			'Ask for HTTP/1.1 instead and print the version used: `curl -sk -o /dev/null -w "%{http_version}\\n" --http1.1 https://localhost:8443/`.'
		],
		done: [
			'Step 4 prints `ALPN: curl offers h2,http/1.1` and `ALPN: server accepted h2`.',
			'It then shows `[HTTP/2] [1] OPENED stream`, `[3]` and `[5]`, with `Multiplexed connection found` before the second and third.',
			'Step 5 prints `1.1`.'
		],
		solution: [
			'The protocol is picked inside the TLS handshake: curl lists what it speaks, nginx answers `h2`. With `--http1.1`, curl offers only `http/1.1`.',
			'The three requests are three client streams on one TCP connection, with odd IDs that go up by 2.',
			'`-k` skips certificate checks only because this certificate is self-signed and local. Stop the lab with `docker stop h2-lab`.'
		]
	},
	recall: {
		q: 'What does HTTP/2 put inside one TCP connection, and what happens to it when one TCP segment is lost?',
		a: 'Many streams, numbered 1, 3, 5 for the client, carried as frames with a 9 byte header. A lost segment stalls every stream until TCP retransmits it, because TCP delivers bytes in order.'
	},
	sources: [
		{ title: 'RFC 9113, HTTP/2', url: 'https://www.rfc-editor.org/rfc/rfc9113' },
		{ title: 'RFC 7541, HPACK: Header Compression for HTTP/2 (appendix C.3)', url: 'https://www.rfc-editor.org/rfc/rfc7541' },
		{ title: 'RFC 9114, HTTP/3, section 1.1: Prior Versions of HTTP', url: 'https://www.rfc-editor.org/rfc/rfc9114#section-1.1' },
		{ title: 'Cloudflare blog, HTTP/2 Rapid Reset: deconstructing the record-breaking attack (2023)', url: CF },
		{ title: 'golang.org/x/net, http2/frame.go', url: FRAME }
	]
};
