const QGO = 'https://github.com/quic-go/quic-go/blob/9abbbad05626e3e9609e850cd98d375b73a3d2e7';
const TRANSPORT = `${QGO}/transport.go`;
const RFC9000 = 'https://www.rfc-editor.org/rfc/rfc9000';
const RFC9114 = 'https://www.rfc-editor.org/rfc/rfc9114';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'http3',
	part: 'HTTP and TLS',
	title: 'HTTP/3 and QUIC',
	minutes: 10,
	hook: [
		'You run `curl -sI --http2 https://example.org/`. The answer comes back as `HTTP/2 200` over TCP port 443, with one header you did not ask for: `alt-svc: h3=":443"; ma=86400`.',
		'The server is telling the client that the same site speaks HTTP/3 on UDP port 443, and that the offer stays valid for 86,400 seconds, 24 hours. **A browser that reads it can open its next connection to example.org over UDP instead of TCP.**',
		'If a firewall drops UDP 443, that attempt fails. RFC 9114 covers the case: "clients SHOULD attempt to use TCP-based versions of HTTP", so the page still loads over HTTP/2.'
	],
	terms: [
		{ term: 'QUIC', def: 'A transport protocol over UDP (RFC 9000). It carries its own streams, retransmission, congestion control and TLS 1.3 handshake. HTTP/3 is HTTP mapped onto QUIC streams.' },
		{ term: 'Connection ID', def: 'A number in each QUIC packet header, chosen by the receiver of the packet. The receiver finds the connection by this ID, whatever IP address and port the packet came from.' },
		{ term: '0-RTT', def: 'Data a client sends in its very first flight, before any answer from the server, using keys from an earlier connection to the same server. RFC 9000: "0-RTT provides no protection against replay attacks".' },
		{ term: 'Alt-Svc', def: 'A response header that advertises another way to reach the same origin. `h3=":443"` means HTTP/3 on UDP port 443, and `ma` gives the number of seconds the offer stays fresh.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['phone["Phone on Wi-Fi 192.0.2.10:51000"] -->|"UDP: Initial, CRYPTO: ClientHello, ALPN h3, padded to 1200 bytes"| server["example.org UDP 443"]'],
				highlight: ['phone'],
				note: 'The first QUIC packet is an Initial packet. Its CRYPTO frame carries a TLS 1.3 ClientHello with the ALPN token `h3`. RFC 9000 makes the client pad the UDP payload to at least 1200 bytes. Until the server has validated the address, it may send back at most three times what it received: 3600 bytes here.'
			},
			{
				add: ['server -->|"Initial + Handshake: ServerHello, certificate, Finished"| phone', 'phone -->|"Handshake: Finished, then 1-RTT: HEADERS GET / on stream 0"| server'],
				highlight: ['server'],
				note: 'The server answers with its own Initial and Handshake packets, which carry the TLS ServerHello, certificate and Finished. The client completes the handshake and sends its request in the same flight. Transport and encryption are set up in one round trip, where TCP plus TLS needs a TCP handshake first.'
			},
			{
				add: ['lost["Packet with stream 0 data lost"] -.->|"stream 4 data still delivered"| app["HTTP/3 layer reads stream 4"]'],
				highlight: ['lost', 'app'],
				note: 'Requests go on client initiated bidirectional streams: IDs 0, 4, 8, because the two low bits of the ID give the stream type. QUIC places data by stream ID and offset, so it keeps order inside each stream only. A lost packet with stream 0 data does not hold back stream 4, unlike TCP under HTTP/2.'
			},
			{
				add: ['phone4g["Same phone on 4G 198.51.100.7:40312"] -->|"1-RTT, same connection ID"| server', 'server -->|"PATH_CHALLENGE"| phone4g'],
				highlight: ['phone4g'],
				note: 'The phone leaves Wi-Fi, and its packets now come from a new IP address and port. A TCP connection is found by those four values, so it would break. The QUIC server finds the connection by the connection ID in the header, then checks the new path with a `PATH_CHALLENGE` that the client must echo in a `PATH_RESPONSE`.'
			}
		]
	},
	example: {
		title: 'transport.go in quic-go: a packet is routed by its connection ID',
		repo: 'quic-go/quic-go',
		url: `${TRANSPORT}#L564-L589`,
		lang: 'go',
		code: `func (t *Transport) handlePacket(p receivedPacket) {
	if len(p.data) == 0 {
		return
	}
	if !wire.IsPotentialQUICPacket(p.data[0]) && !wire.IsLongHeaderPacket(p.data[0]) {
		t.handleNonQUICPacket(p)
		return
	}
	connID, err := wire.ParseConnectionID(p.data, t.connIDLen)
	if err != nil {
		t.logger.Debugf("error parsing connection ID on packet from %s: %s", p.remoteAddr, err)
…
		p.buffer.MaybeRelease()
		return
	}

	// If there's a connection associated with the connection ID, pass the packet there.
	if handler, ok := (*packetHandlerMap)(t).Get(connID); ok {
		handler.handlePacket(p)
		return
	}`,
		notes: [
			'Line 5 tests bits of the first byte. `IsPotentialQUICPacket` checks the fixed bit `0x40`, which RFC 9000 says "allows QUIC to coexist with other protocols" on the same port. Anything else goes to `handleNonQUICPacket` on line 6.',
			'Line 9 reads the destination connection ID. A 1-RTT packet header carries no length for it, so [`ParseConnectionID`](' + QGO + '/internal/wire/header.go#L14-L23) takes the `t.connIDLen` bytes right after the first byte.',
			'Line 18 looks the connection up by that ID alone. `p.remoteAddr` appears only in the log line 11, so a packet from the phone\'s new 4G address reaches the same connection handler.',
			'The 1200 byte rule is a constant in the same project: [`MinInitialPacketSize = 1200`](' + QGO + '/internal/protocol/protocol.go#L116-L117). RFC 9000 adds that "QUIC MUST NOT be used if the network path cannot support a maximum datagram size of at least 1200 bytes".'
		]
	},
	tradeoff: {
		gain: [
			'The transport and TLS handshakes share one round trip, and a returning client can send its request as 0-RTT data in the first flight.',
			'A lost packet only delays the stream whose data it carried: stream 4 keeps going while stream 0 waits for its retransmission.',
			'A download survives a move from Wi-Fi to 4G, because the server finds the connection by its connection ID.'
		],
		cost: [
			'A network that drops UDP 443 makes the HTTP/3 attempt fail, and the client must fall back to HTTP/2 over TCP.',
			'An attacker who records 0-RTT data can replay it. RFC 8470 lets clients put only safe methods such as `GET` in early data, and a server can answer `425 (Too Early)` to make the client retry after the handshake.',
			'A path must carry 1200 byte UDP datagrams. Below that, RFC 9000 forbids QUIC on the path.'
		]
	},
	task: {
		prompt: 'Three responses from three sites carry these headers: (a) `alt-svc: h3=":443"; ma=86400`, (b) `alt-svc: h3=":50781"`, (c) no `alt-svc` at all. For each one, say what a browser that supports HTTP/3 may try next, on which UDP port, and for how long it may remember the offer. Then: an office firewall drops all outbound UDP. What do users see on site (a)?',
		hint: 'RFC 7838 sets the default freshness of an Alt-Svc offer when `ma` is missing. RFC 9114 section 3.1 says what a client does when QUIC cannot connect.',
		answer: [
			'(a) QUIC to the same host on UDP 443, for 86,400 seconds (24 hours) after the response was generated.',
			'(b) QUIC on UDP port 50781, the example from RFC 9114 section 3.1.1. With no `ma`, RFC 7838 says the offer "is considered fresh for 24 hours", so the browser may remember it for 24 hours too.',
			'(c) This response makes no HTTP/3 offer, so the browser learns nothing new and keeps using TCP. RFC 9114 still says a client "MAY attempt" QUIC directly on the URL\'s port.',
			'Behind the UDP block, the QUIC attempt to site (a) gets no reply. The client falls back to TCP as RFC 9114 asks, so pages still load over HTTP/2, after the time the client spends on the failed attempt.'
		]
	},
	quiz: [
		{
			q: 'A phone downloads a file over HTTP/3, then moves from Wi-Fi to 4G and gets a new IP address. Why can the download continue?',
			options: [
				'The server keeps the old IP address and forwards packets to the new one',
				'Each packet carries a connection ID, and the server finds the connection by it',
				'UDP has no connections, so the server accepts packets from any address',
				'The phone opens a new TCP connection and resumes the download from its offset'
			],
			answer: 1,
			why: 'A QUIC packet header carries a destination connection ID chosen by the receiver. The server looks the connection up by that ID alone, then validates the new address with `PATH_CHALLENGE`.'
		},
		{
			q: 'Why must a QUIC client pad its first Initial packet to at least 1200 bytes?',
			options: [
				'To fill the server\'s TCP receive window before the TLS handshake can start',
				'Because a TLS 1.3 certificate chain never fits in a smaller UDP datagram',
				'So the server may send back 3 times as much, and the path is proven to carry 1200 bytes',
				'Because most routers on the internet drop UDP datagrams smaller than 1200 bytes'
			],
			answer: 2,
			why: 'Before it validates the client address, a server may send at most three times the bytes it received: the anti-amplification limit. A 1200 byte Initial lets it send 3600 bytes, and it also proves the path carries the 1200 byte datagrams that QUIC requires.'
		},
		{
			q: 'Over HTTP/3, a packet carrying data for request stream 0 is lost. Request stream 4 had data in the next packet. What happens to stream 4?',
			options: [
				'It waits for stream 0, because QUIC delivers all bytes of the connection in order',
				'Its data is delivered right away, because QUIC keeps order inside each stream only',
				'It is reset, because a loss on one stream closes the whole connection',
				'It is resent over TCP, because HTTP/3 falls back to HTTP/2 after a loss'
			],
			answer: 1,
			why: 'QUIC places STREAM frame data by stream ID and offset, and orders bytes per stream. Only stream 0 waits for the retransmission. Under HTTP/2, TCP would hold every stream behind the gap.'
		}
	],
	recall: {
		q: 'What does QUIC change for HTTP compared with HTTP/2 over TCP? Name the transport and two effects.',
		a: 'HTTP/3 runs over QUIC on UDP, often port 443. Loss only stalls the stream that lost data, and a connection survives an address change because packets carry a connection ID. The handshake also sets up TLS 1.3 in one round trip.'
	},
	sources: [
		{ title: 'RFC 9000, QUIC: A UDP-Based Multiplexed and Secure Transport', url: RFC9000 },
		{ title: 'RFC 9114, HTTP/3', url: RFC9114 },
		{ title: 'RFC 7838, HTTP Alternative Services', url: 'https://www.rfc-editor.org/rfc/rfc7838' },
		{ title: 'RFC 8470, Using Early Data in HTTP', url: 'https://www.rfc-editor.org/rfc/rfc8470' },
		{ title: 'quic-go, transport.go', url: TRANSPORT },
		{ title: 'quic-go, internal/protocol/protocol.go', url: `${QGO}/internal/protocol/protocol.go` }
	]
};
