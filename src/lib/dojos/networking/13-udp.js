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
