const GO = 'https://github.com/golang/go/blob/c3a068eec992b5ae783abce1a9d03f617b671ea2';
const CLIENT = `${GO}/src/net/dnsclient_unix.go`;
const CONFIG = `${GO}/src/net/dnsconfig_unix.go`;
const ISSUE = 'https://github.com/kubernetes/kubernetes/issues/56903';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'udp',
	part: 'Names and addresses',
	title: 'UDP',
	minutes: 10,
	hook: [
		'December 2017, Kubernetes issue #56903, titled "DNS intermittent delays of 5s". The report: "DNS lookup is sometimes taking 5 seconds." The reproduction is a loop that runs `curl -w %{time_namelookup}` until one lookup takes more than a second.',
		'Other users on the thread see the same number. One captures the traffic: "tcpdump shows that the first AAAA requests get lost somehow". A query was sent, and no answer ever came back.',
		'DNS queries travel over UDP, and UDP never resends a lost datagram. The only part that notices is a timer in the resolver library, and **glibc\'s default `timeout` is 5 seconds**.'
	],
	terms: [
		{ term: 'UDP', def: 'User Datagram Protocol (RFC 768): an 8 byte header with source port, destination port, length and checksum, then the data. The kernel sends each datagram once, with no connection set up first, and never learns whether it arrived.' },
		{ term: 'Datagram', def: 'One UDP message. It arrives whole or not at all: the receiver gets the full message in one `recv`, or nothing.' },
		{ term: 'ICMP port unreachable', def: 'The reply a host sends when a UDP datagram reaches a port with no socket listening. Linux reports it on the sending socket as `ECONNREFUSED`.' },
		{ term: 'TC flag', def: 'The truncation bit in a DNS reply. It means the answer did not fit in the UDP datagram, and the client should ask again over TCP.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['app["App: getaddrinfo(api.github.com)"] -->|"1 datagram: query, port 53"| dns["DNS server"]', 'dns -->|"1 datagram: answer"| app'],
				highlight: ['app', 'dns'],
				note: 'A DNS lookup over UDP is two datagrams: the query and the answer. There is no connection to open first. RFC 768 lists "the Internet Name Server" as one of the major uses of the protocol.'
			},
			{
				add: ['app -->|"query lost on the way"| drop(("dropped"))', 'timer["Resolver timer: 5 s"] -->|"send again"| dns'],
				highlight: ['drop', 'timer'],
				note: 'When the query is lost, no kernel code resends it. The resolver library waits for its timeout, 5 seconds in glibc, then sends the query again. The lookup takes 5 seconds plus one round trip, the number seen in issue #56903.'
			},
			{
				add: ['app -->|"datagram to a closed port"| host["Host with no listener"]', 'host -->|"ICMP port unreachable"| app'],
				highlight: ['host'],
				note: 'I sent 5 bytes to `127.0.0.1:5999` with no listener in this session. `send()` returned 5, then `recv()` raised `ConnectionRefusedError [Errno 111]`. The error came from the ICMP reply, after the send had already succeeded.'
			},
			{
				add: ['dns -->|"reply with TC flag, 39 bytes"| app', 'app -->|"same query over TCP"| dns'],
				highlight: ['dns'],
				note: 'An answer too big for the datagram comes back truncated. In this session, `dig TXT google.com +bufsize=512` got a 39 byte reply with the `tc` flag, printed "Truncated, retrying in TCP mode.", and received 1187 bytes over TCP.'
			}
		]
	},
	example: {
		title: 'src/net/dnsclient_unix.go: Go\'s resolver sends one query, UDP first',
		repo: 'golang/go',
		url: `${CLIENT}#L168-L219`,
		lang: 'go',
		code: `// exchange sends a query on the connection and hopes for a response.
func (r *Resolver) exchange(ctx context.Context, server string, q dnsmessage.Question, timeout time.Duration, useTCP, ad bool) (dnsmessage.Parser, dnsmessage.Header, error) {
	q.Class = dnsmessage.ClassINET
	id, udpReq, tcpReq, err := newRequest(q, ad)
	if err != nil {
		return dnsmessage.Parser{}, dnsmessage.Header{}, errCannotMarshalDNSMessage
	}
	var networks []string
	if useTCP {
		networks = []string{"tcp"}
	} else {
		networks = []string{"udp", "tcp"}
	}
	for _, network := range networks {
		ctx, cancel := context.WithDeadline(ctx, time.Now().Add(timeout))
		defer cancel()

		c, err := r.dial(ctx, network, server)
		if err != nil {
			return dnsmessage.Parser{}, dnsmessage.Header{}, err
		}
		if d, ok := ctx.Deadline(); ok && !d.IsZero() {
			c.SetDeadline(d)
		}
		var p dnsmessage.Parser
		var h dnsmessage.Header
		if _, ok := c.(PacketConn); ok {
			p, h, err = dnsPacketRoundTrip(c, id, q, udpReq)
		} else {
			p, h, err = dnsStreamRoundTrip(c, id, q, tcpReq)
		}
		c.Close()
		if err != nil {
			return dnsmessage.Parser{}, dnsmessage.Header{}, mapErr(err)
		}
		if err := p.SkipQuestion(); err != dnsmessage.ErrSectionDone {
			return dnsmessage.Parser{}, dnsmessage.Header{}, errInvalidDNSResponse
		}
		// RFC 5966 indicates that when a client receives a UDP response with
		// the TC flag set, it should take the TC flag as an indication that it
		// should retry over TCP instead.
		// The case when the TC flag is set in a TCP response is not well specified,
		// so this implements the glibc resolver behavior, returning the existing
		// dns response instead of returning a "errNoAnswerFromDNSServer" error.
		// See go.dev/issue/64896
		if h.Truncated && network == "udp" {
			continue
		}
		return p, h, nil
	}
	return dnsmessage.Parser{}, dnsmessage.Header{}, errNoAnswerFromDNSServer
}`,
		notes: [
			'Line 12 lists the transports in order: `"udp"` first, `"tcp"` only if needed. `useTCP` is set when `resolv.conf` has `options use-vc` or `tcp`.',
			'Lines 15 and 23 put a deadline on the socket. For UDP this deadline is the only way the code learns that a datagram was lost: `c.Read` returns a timeout error once it passes.',
			'Line 28 calls `dnsPacketRoundTrip`, which does one `Write` and then reads until a reply with the right ID and question arrives. Its comment says it ignores other datagrams "as they may be malicious forgery attempts".',
			'Lines 46 to 48: a UDP reply with the TC flag is dropped and the loop asks again over TCP, as `dig` did in step 4.',
			'This function sends one query. The retries live in the caller, which loops `cfg.attempts` times over every server. [dnsconfig_unix.go](' + CONFIG + '#L20-L24) sets the defaults to `timeout: 5 * time.Second` and `attempts: 2`, the same as glibc.'
		]
	},
	tradeoff: {
		gain: [
			'A DNS lookup is one datagram each way. TCP would need a handshake before the query could be sent.',
			'An application can put its own reliability on top. QUIC does this, and RFC 9000 says QUIC packets are carried in UDP datagrams "to better facilitate deployment in existing systems and networks".'
		],
		cost: [
			'A lost datagram is noticed only by the application\'s timer. With glibc or Go defaults, one lost DNS query adds 5 seconds.',
			'RFC 8085: UDP "does not retransmit any lost packets", and an application "may receive multiple copies of the same UDP datagram". The application must reorder datagrams, drop duplicates and slow down on congestion itself.',
			'Firewalls and NATs keep UDP state only until a timer runs out. RFC 8085: "Return traffic that arrives after the per-flow state has timed out is dropped".'
		]
	},
	task: {
		prompt: 'Three outputs from this session. (a) `dig +tries=2 +time=2 example.com @192.0.2.1` printed `;; communications error to 192.0.2.1#53: timed out` twice, then `;; no servers could be reached`. `+time=2` makes dig wait 2 seconds per try. (b) A Python UDP socket connected to `127.0.0.1:5999`: `send` returned 5, `recv` raised `ConnectionRefusedError`. (c) `dig TXT google.com @1.1.1.1 +bufsize=512` printed `;; Truncated, retrying in TCP mode.` Say what happened on the wire in each. Then: a Go program uses `resolv.conf` with two `nameserver` lines and no options, and both servers drop every packet. How long until the lookup fails?',
		hint: 'For (b), think about which packet could carry an error back for a datagram that was already sent. For the last part, read the loop in the caller: attempts times servers.',
		answer: [
			'(a) Each query left, and nothing came back: no answer, no ICMP error. RFC 5737 reserves `192.0.2.0/24` for documentation, and nothing answered there. dig waited its 2 second timer each time.',
			'(b) The datagram reached localhost, no socket was bound to port 5999, and the kernel answered with ICMP port unreachable. Linux delivered it to the socket as `ECONNREFUSED` on the next call. (c) The answer did not fit in 512 bytes, the reply came back with the TC flag, and dig repeated the query over TCP.',
			'Go tries each server once per attempt: 2 attempts times 2 servers is 4 queries, each with a 5 second deadline. The lookup fails after about 20 seconds.'
		],
		steps: [
			{
				title: 'Read the timeouts in (a)',
				questions: [
					{ q: 'dig printed `timed out` twice. What came back from `192.0.2.1` for each query?', options: ['An ICMP port unreachable', 'A reply with the TC flag', 'Nothing at all', 'A TCP reset'], answer: 2, why: 'A timeout means dig heard nothing: no answer and no ICMP error. Only its own timer ended the wait.' },
					{ q: 'Who sent the second query?', options: ['The kernel\'s UDP code', 'dig, when its 2 second timer ran out', 'A router on the way', 'The DNS server, asking back'], answer: 1, why: 'UDP never resends a lost datagram. The application\'s timer is the only part that notices.' },
					{ q: 'Why did nothing answer at `192.0.2.1`?', options: ['RFC 5737 reserves `192.0.2.0/24` for documentation', 'Port 53 is closed on every public host', 'dig blocks private addresses by default', 'The address only accepts TCP'], answer: 0, why: '`192.0.2.0/24` is a documentation range, so no DNS server sits there to reply.' },
					{ q: 'About how long did dig spend before `no servers could be reached`?', options: ['2 seconds', '5 seconds', '10 seconds', '4 seconds'], answer: 3, why: '`+tries=2` with `+time=2` means two tries of 2 seconds each.' }
				]
			},
			{
				title: 'Read the refusal in (b)',
				questions: [
					{ q: '`send` returned 5. What does that tell you?', options: ['The kernel sent the datagram, nothing more', 'A server received the 5 bytes', 'The connection was set up first', 'The datagram was resent 5 times'], answer: 0, why: 'UDP has no connection and no acknowledgement. `send` only says the kernel took the bytes and sent them.' },
					{ q: 'Which packet carried the error back?', options: ['A UDP datagram with an error code', 'A TCP reset from port 5999', 'An ICMP port unreachable', 'A DNS reply with `REFUSED`'], answer: 2, why: 'No socket was bound to port 5999, so the kernel answered with ICMP port unreachable.' },
					{ q: 'Why did the error show up on `recv` and not on `send`?', options: ['`recv` is the only call that can fail on UDP', 'The ICMP reply arrived after `send` had already returned', 'Python hides errors from `send`', 'The kernel waits for a second send before reporting'], answer: 1, why: 'The error comes back after the datagram leaves. Linux stores it and returns it on the next call on that socket.' },
					{ q: 'Now a program listens on port 5999 but never replies. What does `recv` do?', options: ['Raises `ConnectionRefusedError` at once', 'Returns an empty datagram', 'Returns the 5 bytes it sent', 'Waits, since no ICMP error comes back'], answer: 3, why: 'With a socket bound, the kernel delivers the datagram and sends no ICMP error. The sender hears nothing, as in (a).' }
				]
			},
			{
				title: 'Read the truncation in (c)',
				questions: [
					{ q: 'What does `+bufsize=512` tell the server?', options: ['Send at most 512 queries', 'Wait 512 ms before answering', 'Use TCP for anything over 512 bytes', 'The client can take a UDP reply of up to 512 bytes'], answer: 3, why: 'It caps the size of the UDP reply the client will accept.' },
					{ q: 'What did the server send back over UDP?', options: ['A short reply with the TC flag', 'The full answer, split in two datagrams', 'Nothing, so dig timed out', 'An ICMP error'], answer: 0, why: 'An answer too big for the datagram comes back truncated, with the TC flag set. In this session it was 39 bytes.' },
					{ q: 'What did dig do next?', options: ['Asked again over UDP with a larger buffer', 'Sent the same query over TCP', 'Gave up and printed the partial answer', 'Moved on to another server'], answer: 1, why: '"Truncated, retrying in TCP mode." The TC flag tells the client to ask again over TCP, which Go\'s `exchange` does too.' },
					{ q: 'Why not split a big answer into several UDP datagrams?', options: ['UDP forbids more than one datagram per port', 'A datagram over 512 bytes is always dropped', 'Each datagram stands alone, and nothing puts them back in order', 'DNS servers cannot send two packets in a row'], answer: 2, why: 'A datagram arrives whole or not at all, and the application must reorder and drop duplicates itself. TCP gives an ordered stream.' }
				]
			},
			{
				title: 'Count the worst case',
				questions: [
					{ q: 'With no options in `resolv.conf`, what are Go\'s defaults?', options: ['`timeout` 2 s, `attempts` 5', '`timeout` 5 s, `attempts` 1', '`timeout` 5 s, `attempts` 2', '`timeout` 1 s, `attempts` 3'], answer: 2, why: '`dnsconfig_unix.go` sets `timeout: 5 * time.Second` and `attempts: 2`, the same as glibc.' },
					{ q: 'How does the caller of `exchange` loop?', options: ['Over every server, once per attempt', 'Over attempts on the first server, then the second', 'Once per server, with no retries', 'Until one server answers, with no limit'], answer: 0, why: 'The caller loops `cfg.attempts` times over every server, sending one query per `exchange`.' },
					{ q: 'How many queries go out before the lookup fails?', options: ['2', '4', '5', '10'], answer: 1, why: '2 attempts times 2 servers is 4 queries.' },
					{ q: 'Both servers drop every packet. How long until the lookup fails?', options: ['About 5 seconds', 'About 10 seconds', 'About 40 seconds', 'About 20 seconds'], answer: 3, why: 'Each of the 4 queries waits its full 5 second deadline: about 20 seconds.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'A Pod\'s DNS query over UDP is dropped by the network. What sends it again?',
			options: [
				'The kernel\'s UDP code, after one retransmission timeout',
				'The resolver library in the app, when its own timer runs out',
				'The DNS server, which notices the missing query and asks back',
				'Nothing: the lookup fails at once with an error'
			],
			answer: 1,
			why: 'UDP has no acknowledgements, so neither kernel knows the datagram was lost. glibc and Go wait for their `timeout`, 5 seconds by default, then send the query again, up to `attempts` times.'
		},
		{
			q: 'On a connected UDP socket, you `send()` a datagram to a port where nothing listens. `send()` returns the byte count. What happens next?',
			options: [
				'Nothing: UDP never reports anything about a datagram after `send()`',
				'The next call on the socket fails with `ECONNREFUSED`',
				'The kernel resends the datagram until a listener appears',
				'The kernel opens a TCP connection to report the error'
			],
			answer: 1,
			why: 'The target host replies with ICMP port unreachable. The `send()` already returned, so Linux stores the error and returns it on a later call on that socket. udp(7) says "You may get an error for an earlier packet that was sent on the same socket."'
		},
		{
			q: 'Go\'s resolver receives a UDP reply with the TC flag set. What does `exchange` do?',
			options: [
				'Returns the partial answer, since some records are better than none',
				'Sends the same query over TCP to the same server',
				'Retries over UDP with a larger buffer size',
				'Moves on to the next nameserver in `resolv.conf`'
			],
			answer: 1,
			why: 'The loop over `networks` holds `"udp"` then `"tcp"`. When `h.Truncated && network == "udp"`, it hits `continue`, so the next pass dials TCP to the same server and sends the query again.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'See what UDP does and does not tell the sender: whole datagrams, a late error, a silent loss.',
		steps: [
			'Start a receiver that prints three datagrams: `python3 -c \'import socket;s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM);s.bind(("127.0.0.1",9999));[print(s.recvfrom(2048)) for _ in range(3)]\' &`.',
			'Send three messages to it: `python3 -c \'import socket;s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM);[s.sendto(m,("127.0.0.1",9999)) for m in (b"one",b"two",b"three")]\'`.',
			'Send to a port with no listener and read the socket: `python3 -c \'import socket;s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM);s.connect(("127.0.0.1",5999));print(s.send(b"hello"));s.recv(100)\'`.',
			'Start a listener that takes queries and never answers: `python3 -c \'import socket,time;s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM);s.bind(("127.0.0.1",9053));time.sleep(30)\' &`.',
			'Ask it a DNS question and time it: `time dig +tries=2 +time=2 example.test @127.0.0.1 -p 9053`.'
		],
		done: [
			'The receiver prints `b\'one\'`, `b\'two\'` and `b\'three\'` on three separate lines, never glued together.',
			'Step 3 prints `5`, then raises `ConnectionRefusedError`.',
			'dig prints `timed out` twice, then `no servers could be reached`, and `time` shows about 4 seconds.'
		],
		solution: [
			'Each `sendto` is one datagram and each `recvfrom` returns one whole datagram.',
			'In step 3 the kernel sent the datagram, then got ICMP port unreachable back. `send` had already returned, so the error came on `recv`.',
			'In step 5 the port is open but nobody replies, so there is no ICMP error either. Only dig\'s 2 second timer, run twice, ends the wait.'
		]
	},
	recall: {
		q: 'Why does one lost DNS packet add about 5 seconds to a lookup on Linux?',
		a: 'UDP never resends a lost datagram. The resolver (glibc or Go) waits for its `timeout`, 5 seconds by default, then sends the query again.'
	},
	sources: [
		{ title: 'RFC 768, User Datagram Protocol', url: 'https://www.rfc-editor.org/rfc/rfc768' },
		{ title: 'RFC 8085, UDP Usage Guidelines', url: 'https://www.rfc-editor.org/rfc/rfc8085' },
		{ title: 'udp(7), Linux manual page', url: 'https://man7.org/linux/man-pages/man7/udp.7.html' },
		{ title: 'Kubernetes issue #56903, DNS intermittent delays of 5s', url: ISSUE },
		{ title: 'resolv.conf(5), Linux manual page', url: 'https://man7.org/linux/man-pages/man5/resolv.conf.5.html' },
		{ title: 'RFC 9000, QUIC: A UDP-Based Multiplexed and Secure Transport', url: 'https://www.rfc-editor.org/rfc/rfc9000' }
	]
};
