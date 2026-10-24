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
		],
		steps: [
			{
				title: 'Read offer (a)',
				questions: [
					{ q: 'The browser takes offer (a). Which ALPN token does its QUIC ClientHello carry?', options: ['`h2`', '`h3`', '`http/1.1`', '`quic`'], answer: 1, why: 'The offer names the protocol by its ALPN token, and the Initial packet\'s ClientHello asks for that same token, `h3`.' },
					{ q: 'Which port does the browser try?', options: ['TCP 443', 'UDP 80', 'UDP 443', 'TCP 8443'], answer: 2, why: '`":443"` with no host means the same host on port 443, and HTTP/3 uses UDP.' },
					{ q: 'How long may the browser remember the offer?', options: ['86,400 seconds, 24 hours', '443 seconds', 'Until the tab closes', 'One request only'], answer: 0, why: '`ma=86400` is the number of seconds the offer stays fresh.' },
					{ q: 'What carried this offer to the browser?', options: ['A DNS answer', 'A QUIC Initial packet', 'A TLS ServerHello', 'An HTTP response over TCP'], answer: 3, why: 'In the hook, `alt-svc` came back on an `HTTP/2 200` over TCP port 443. The browser can use it for its next connection.' }
				]
			},
			{
				title: 'Read offer (b)',
				questions: [
					{ q: 'Where does offer (b) point?', options: ['UDP port 443', 'UDP port 50781 on the same host', 'TCP port 50781', 'Another host named 50781'], answer: 1, why: '`h3=":50781"` keeps the host and changes the port. It is the example in RFC 9114 section 3.1.1.' },
					{ q: 'Offer (b) has no `ma`. How long is it fresh?', options: ['24 hours, the RFC 7838 default', 'Zero: it must be used at once', 'Forever, until the next offer', '86,400 days'], answer: 0, why: 'RFC 7838: with no `ma`, the offer "is considered fresh for 24 hours".' },
					{ q: 'Offers (a) and (b) both say `h3`. What differs between them?', options: ['The protocol: (b) is HTTP/2', 'The host: (b) points to another site', 'The UDP port, and nothing else in practice', 'The transport: (b) uses TCP'], answer: 2, why: '(a) says UDP 443 for 86,400 seconds, (b) says UDP 50781 with the default 24 hours: the same length of time.' },
					{ q: 'Which would be a mistake when reading (b)?', options: ['Trying QUIC on UDP 50781', 'Treating the offer as fresh for 24 hours', 'Keeping TCP as a fallback', 'Expecting `h3` to switch to TCP 50781'], answer: 3, why: 'HTTP/3 always runs over QUIC on UDP. The port changes, the transport does not.' }
				]
			},
			{
				title: 'Read (c), the missing header',
				questions: [
					{ q: 'Site (c) sends no `alt-svc`. What does the browser learn?', options: ['That the site forbids HTTP/3', 'Nothing new: no offer is made', 'That HTTP/3 runs on UDP 443', 'That the site runs HTTP/1.1 only'], answer: 1, why: 'The response makes no HTTP/3 offer, so the browser keeps using TCP.' },
					{ q: 'May the browser still try QUIC on (c)?', options: ['Yes: RFC 9114 says a client "MAY attempt" it on the URL\'s port', 'No: without Alt-Svc QUIC is forbidden', 'Only after 24 hours', 'Only with 0-RTT'], answer: 0, why: 'An Alt-Svc offer is one way to learn about HTTP/3, not the only one.' },
					{ q: 'Why does a site send Alt-Svc on an HTTP/2 response at all?', options: ['HTTP/2 cannot carry the page', 'To close the TCP connection', 'The client first connects over TCP, and learns about UDP there', 'To prove the TLS certificate'], answer: 2, why: 'A browser starts on TCP, where it can always reach the site, and moves to QUIC once told it is there.' },
					{ q: 'What does the `ma` value count from?', options: ['The browser\'s start', 'The first QUIC packet', 'The DNS TTL', 'When the response was generated'], answer: 3, why: 'The offer is fresh for `ma` seconds after the response was generated.' }
				]
			},
			{
				title: 'Block UDP',
				questions: [
					{ q: 'The office firewall drops outbound UDP. What happens to the QUIC attempt to (a)?', options: ['It gets no reply', 'It gets an HTTP 403', 'It is moved to TCP by the firewall', 'It connects slower'], answer: 0, why: 'QUIC runs over UDP, so the Initial packet is dropped and nothing comes back.' },
					{ q: 'What does RFC 9114 tell the client to do next?', options: ['Retry QUIC until it works', 'Attempt TCP based versions of HTTP', 'Show an error page', 'Lower the packet size below 1200 bytes'], answer: 1, why: '"Clients SHOULD attempt to use TCP-based versions of HTTP" when QUIC cannot connect.' },
					{ q: 'What do users see on site (a)?', options: ['A broken page', 'A certificate warning', 'Pages load over HTTP/2, after the failed attempt\'s delay', 'Pages load over HTTP/3 anyway'], answer: 2, why: 'The fallback keeps the site working. The only cost is the time spent on the failed QUIC attempt.' },
					{ q: 'Another office blocks only UDP port 443. Which of the three sites can the browser still use over HTTP/3?', options: ['Site (a)', 'Site (c)', 'None of them', 'Site (b)'], answer: 3, why: 'Offer (b) points at UDP 50781, which this firewall lets through. (a) offers UDP 443, and a direct attempt on (c) would use the URL\'s port, 443.' }
				]
			}
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
	lab: {
		minutes: 25,
		goal: 'Serve HTTP/3 from a local nginx, read its Alt-Svc offer over HTTP/2, and watch curl fall back to TCP when no QUIC listener answers.',
		steps: [
			'Make a folder and a throwaway certificate: `mkdir -p ~/h3-lab && cd ~/h3-lab && openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 7 -subj /CN=localhost`.',
			'Create `h3.conf` with one line each: `server {`, `listen 443 ssl;`, `listen 443 quic reuseport;`, `listen 8443 ssl;`, `http2 on;`, `ssl_certificate /lab/cert.pem;`, `ssl_certificate_key /lab/key.pem;`, `add_header Alt-Svc \'h3=":443"; ma=86400\';`, `root /usr/share/nginx/html;`, `}`. Port 443 speaks TCP and UDP, port 8443 only TCP.',
			'Start nginx: `docker run -d --rm --name h3-lab -v "$PWD":/lab -v "$PWD/h3.conf":/etc/nginx/conf.d/default.conf:ro nginx:1.27-alpine`.',
			'Define a curl with HTTP/3 support that shares nginx\'s network: `c() { docker run --rm --network container:h3-lab alpine/curl-http3@sha256:b0cb55696adcaf5714958926a28ce78a5fa72f6a4aa8df2ec5b72f1cde8038e3 curl -sk "$@"; }`. Read the offer over HTTP/2: `c -I --http2 https://localhost/`.',
			'Take the offer: `c -o /dev/null -w "%{http_version}\\n" --http3-only https://localhost/`. Then try a port with no UDP listener, first with `--http3-only`, then with `--http3`: `c -o /dev/null -w "%{http_version} %{errormsg}\\n" --http3-only https://localhost:8443/` and `c -o /dev/null -w "%{http_version}\\n" --http3 https://localhost:8443/`.'
		],
		done: [
			'Step 4 shows `HTTP/2 200` and `alt-svc: h3=":443"; ma=86400`.',
			'`--http3-only https://localhost/` prints `3`.',
			'On port 8443, `--http3-only` prints `0` and a QUIC error, while `--http3` prints `2`.'
		],
		solution: [
			'nginx speaks QUIC on UDP 443 and says so in `alt-svc` on its TCP responses, like example.org in the hook.',
			'Port 8443 has no UDP listener. `--http3-only` has nothing to fall back to, and `--http3` falls back to TCP, as RFC 9114 asks. Here the kernel refuses the UDP packet at once. Behind a firewall that drops UDP silently, the QUIC attempt would wait for a timeout first.',
			'Stop the lab with `docker stop h3-lab`.'
		]
	},
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
