const LINUX = 'https://github.com/torvalds/linux/blob/70dd4ee72eb2d5793c62e71c14e3aba78e5a4e56';
const TCPV4 = `${LINUX}/net/ipv4/tcp_ipv4.c`;
const HASH = `${LINUX}/net/ipv4/inet_hashtables.c`;
const SYSCTL = `${LINUX}/Documentation/networking/ip-sysctl.rst`;
const CF = 'https://blog.cloudflare.com/how-to-stop-running-out-of-ephemeral-ports-and-start-to-love-long-lived-connections/';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'ports-and-time-wait',
	part: 'Packets',
	title: 'Ports, sockets and TIME_WAIT',
	minutes: 10,
	hook: [
		'A test run in this session, on Linux 6.17: a Python client limited to the 100 source ports 40100 to 40199 connects to a server on the same host, then closes each connection after the reply. Connection 101 fails 4 ms after the start with `[Errno 99] Cannot assign requested address`.',
		'The server process keeps accepting the whole time. `ss -tno state time-wait` lists 100 client sockets toward the server\'s port, each with `timer:(timewait,59sec,0)`. A poll every 5 s still finds all 100 at 60 s, and none at 65 s, when `connect()` works again.',
		'With the default range of 28,232 ports and Linux\'s 60-second TIME_WAIT, the same client runs out at about 470 new connections per second to one server.'
	],
	terms: [
		{ term: 'Ephemeral port', def: 'The source port the kernel picks for an outgoing connection when the program does not choose one, from `ip_local_port_range`: 32768 to 60999 by default.' },
		{ term: '4-tuple', def: 'Source IP, source port, destination IP, destination port. Each TCP connection on a host needs a 4-tuple no other connection uses.' },
		{ term: 'TIME_WAIT', def: 'The state of a socket on the side that closed first, after the last ACK. Linux keeps it 60 seconds (`TCP_TIMEWAIT_LEN`), and `ss` prints it as `TIME-WAIT`.' },
		{ term: '`tcp_tw_reuse`', def: 'The sysctl that lets a new outgoing connection take over a 4-tuple still in TIME_WAIT. The default, 2, allows it only for loopback traffic.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['c["Client: connect() to 10.0.0.9:443"] --> k["Kernel picks a free source port, say 40312"]'],
				highlight: ['k'],
				note: 'The program gives only the destination. The kernel picks the source IP from the routing table and a source port from 32768 to 60999. The 4-tuple `10.0.0.5:40312 → 10.0.0.9:443` must not belong to any other socket.'
			},
			{
				add: ['k -->|"SYN, request, response"| s["Server 10.0.0.9:443"]', 'k -->|"close(): FIN"| s'],
				highlight: ['s'],
				note: 'After the response, the client calls `close()` first and sends a FIN. The server ACKs it, sends its own FIN, and the client ACKs that. The server side, which closed second, is gone once that last ACK arrives.'
			},
			{
				add: ['s -.->|"FIN, last ACK"| tw["Client socket in TIME_WAIT for 60 s"]'],
				highlight: ['tw'],
				note: 'RFC 9293: "When a connection is closed actively, it MUST linger in the TIME-WAIT state for a time 2xMSL", with MSL "taken to be 2 minutes". Linux uses 60 seconds. For that minute, port 40312 cannot carry a new connection to 10.0.0.9:443.'
			},
			{
				add: ['tw --> full["28,232 ports to 10.0.0.9:443 in TIME_WAIT: EADDRNOTAVAIL"]'],
				highlight: ['full'],
				note: 'The port search in `__inet_hash_connect` skips every port whose 4-tuple is taken. When none is left, `connect()` returns `EADDRNOTAVAIL`. 28,232 ports held 60 s each allow about 470 new connections per second to one destination. Connections to another IP or port do not compete for these 4-tuples.'
			},
			{
				add: ['pool["Keep-alive pool: one 4-tuple, many requests"] -->|"request 2, 3, 4..."| s'],
				highlight: ['pool'],
				note: 'A client that keeps the connection open and sends the next request on it uses one port for thousands of requests. Only the connections it finally closes go to TIME_WAIT.'
			}
		]
	},
	example: {
		title: 'net/ipv4/tcp_ipv4.c: tcp_twsk_unique, may a TIME_WAIT 4-tuple be reused?',
		repo: 'torvalds/linux',
		url: `${TCPV4}#L118-L203`,
		lang: 'c',
		code: `int tcp_twsk_unique(struct sock *sk, struct sock *sktw, void *twp)
{
	int reuse = READ_ONCE(sock_net(sk)->ipv4.sysctl_tcp_tw_reuse);
	const struct inet_timewait_sock *tw = inet_twsk(sktw);
	const struct tcp_timewait_sock *tcptw = tcp_twsk(sktw);
	struct tcp_sock *tp = tcp_sk(sk);
	int ts_recent_stamp;
	u32 reuse_thresh;

	if (READ_ONCE(tw->tw_substate) == TCP_FIN_WAIT2)
		reuse = 0;

	if (reuse == 2) {
…
		if (!loopback)
			reuse = 0;
	}

	ts_recent_stamp = READ_ONCE(tcptw->tw_ts_recent_stamp);
	reuse_thresh = READ_ONCE(tw->tw_entry_stamp) +
		       READ_ONCE(sock_net(sk)->ipv4.sysctl_tcp_tw_reuse_delay);
	if (ts_recent_stamp &&
	    (!twp || (reuse && time_after32(tcp_clock_ms(), reuse_thresh)))) {
…
		if (likely(!tp->repair)) {
			u32 seq = tcptw->tw_snd_nxt + 65535 + 2;

			if (!seq)
				seq = 1;
			WRITE_ONCE(tp->write_seq, seq);
			tp->rx_opt.ts_recent	   = READ_ONCE(tcptw->tw_ts_recent);
			tp->rx_opt.ts_recent_stamp = ts_recent_stamp;
		}

		return 1;
	}

	return 0;
}`,
		notes: [
			'Line 3 reads `tcp_tw_reuse`. Lines 13 to 17 keep the default value 2 only when an address is a loopback address or the socket is bound to `lo`. For 10.0.0.9, `reuse` drops to 0.',
			'Lines 22 and 23 need two things before reuse: a TCP timestamp from the peer (`ts_recent_stamp`), and `tcp_tw_reuse_delay`, 1000 ms by default, since the socket entered TIME_WAIT.',
			'Line 26 starts the new connection\'s sequence numbers 65,537 past where the old one stopped. Timestamps then let the receiver drop a delayed segment from the old connection.',
			'A return of 0 tells [`__inet_check_established`](' + HASH + '#L614-L626) that the 4-tuple is taken, and the port search tries the next port.',
			'Two runs in this session sent 300 connections through 100 source ports over 6.1 s. Against `127.0.0.1`, 0 failed: with the default of 2, line 23 lets a loopback 4-tuple be reused after 1 second. Against the host\'s `172.17.0.1` address, 200 failed.'
		]
	},
	tradeoff: {
		gain: [
			'A delayed segment from a closed connection cannot land in a new connection with the same 4-tuple. RFC 9293 gives this as the reason for the state.',
			'If the last ACK is lost, the side in TIME_WAIT still knows the connection and can answer the peer\'s repeated FIN.'
		],
		cost: [
			'A client that opens and closes one connection per request is limited to about 470 new connections per second to one destination with the defaults.',
			'`tcp_tw_reuse = 1` lifts the limit only when both sides send TCP timestamps, and it applies to every outgoing connection of the host.',
			'A test against `127.0.0.1` hides the problem, because the default reuses loopback 4-tuples after 1 second.'
		]
	},
	task: {
		prompt: 'A batch job on Linux logs `connect: Cannot assign requested address` when it talks to Redis at `10.0.0.12:6379`. `ss -s` shows `timewait 28190`, and `sysctl net.ipv4.ip_local_port_range` prints `32768 60999`. The job opens one connection per command and closes it. What is the highest rate of new connections it can sustain to Redis, and what are two fixes?',
		hint: 'Count the ports in the range, and divide by how long each one stays in TIME_WAIT on Linux.',
		answer: [
			'The range holds 60999 − 32768 + 1 = 28,232 ports. Each one stays in TIME_WAIT for 60 s after the job closes it, so the job can open about 28,232 / 60 ≈ 470 new connections per second to `10.0.0.12:6379`. `timewait 28190` shows the job is at that limit.',
			'Fix 1: reuse connections. A Redis client with a connection pool sends many commands on each socket, so the job needs a few ports instead of one per command.',
			'Fix 2, if the code cannot change soon: widen the range, for example `1024 65535`, which gives 64,512 ports, about 1,075 per second. The range must start at or above `ip_unprivileged_port_start` (1024), and `ip_local_reserved_ports` must list any server ports inside it.',
			'`tcp_tw_reuse = 1` also works, but only if Redis sends TCP timestamps, and it changes every outgoing connection of the host.'
		]
	},
	quiz: [
		{
			q: 'A client sends a request, the server sends the response and calls `close()` first. Which side keeps a socket in TIME_WAIT?',
			options: [
				'The client, because the client opened the connection',
				'The server, because it closed first',
				'Both sides, for 60 seconds each',
				'Neither side, because the response was complete'
			],
			answer: 1,
			why: 'TIME_WAIT belongs to the side that closes actively, the one that sends the first FIN. Who opened the connection does not matter. Busy HTTP servers that close after each response collect TIME_WAIT sockets on their side.'
		},
		{
			q: 'A client has 28,232 sockets in TIME_WAIT to `10.0.0.9:443`. Can it open a connection to `10.0.0.10:443` right now?',
			options: [
				'No, every ephemeral port is in TIME_WAIT for the next 60 seconds',
				'No, unless `tcp_tw_reuse` is set to 1 on the client',
				'Yes, but only after `tcp_tw_reuse_delay` of 1 second',
				'Yes, a 4-tuple with another destination IP is a new tuple'
			],
			answer: 3,
			why: 'A connection needs a unique 4-tuple, and the destination IP is part of it. Port 40312 is in TIME_WAIT only toward 10.0.0.9:443, so the kernel can use it again toward 10.0.0.10:443.'
		},
		{
			q: 'A load test against `127.0.0.1` opens and closes 5,000 connections per second without errors. In production, against another host, the same client fails. Why?',
			options: [
				'Loopback connections never enter TIME_WAIT',
				'The default `tcp_tw_reuse = 2` reuses TIME_WAIT 4-tuples only for loopback',
				'Production hosts use a smaller `ip_local_port_range` by default',
				'The loopback interface has its own separate set of 65,535 ports'
			],
			answer: 1,
			why: 'In `tcp_twsk_unique`, a value of 2 drops to 0 when neither address is loopback. On loopback, a 4-tuple in TIME_WAIT is reused after 1 second, so the test never runs out of ports.'
		}
	],
	recall: {
		q: 'How many ephemeral ports does Linux have by default, how long does a closed connection hold one in TIME_WAIT, and what rate of new connections to one destination does that allow?',
		a: '28,232 ports (32768 to 60999), held 60 s by the side that closed first. The client can open about 470 new connections per second to one destination IP and port.'
	},
	sources: [
		{ title: 'Linux kernel docs, IP sysctl (ip_local_port_range, tcp_tw_reuse)', url: SYSCTL },
		{ title: 'Linux source, net/ipv4/tcp_ipv4.c', url: TCPV4 },
		{ title: 'RFC 9293, Transmission Control Protocol (TIME-WAIT)', url: 'https://www.rfc-editor.org/rfc/rfc9293' },
		{ title: 'connect(2), EADDRNOTAVAIL', url: 'https://man7.org/linux/man-pages/man2/connect.2.html' },
		{ title: 'IP_LOCAL_PORT_RANGE(2const)', url: 'https://man7.org/linux/man-pages/man2/IP_LOCAL_PORT_RANGE.2const.html' },
		{ title: 'Cloudflare blog, How to stop running out of ephemeral ports (2022)', url: CF }
	]
};
