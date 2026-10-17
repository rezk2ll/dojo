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
