const LINUX = 'https://github.com/torvalds/linux/blob/70dd4ee72eb2d5793c62e71c14e3aba78e5a4e56';
const IPV4 = `${LINUX}/net/ipv4/tcp_ipv4.c`;
const INPUT = `${LINUX}/net/ipv4/tcp_input.c`;
const TIMER = `${LINUX}/net/ipv4/tcp_timer.c`;
const SYSCTL = `${LINUX}/Documentation/networking/ip-sysctl.rst`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'tcp-handshake',
	part: 'Packets',
	title: 'The TCP handshake',
	minutes: 10,
	hook: [
		'Two `curl -v` calls to the same server, 10.78.0.10. Port 82 fails at once: `connect to 10.78.0.10 port 82 from 10.78.0.20 port 46574 failed: Connection refused`, then `after 0 ms`. Port 81 prints `Trying 10.78.0.10:81...` and then nothing for more than two minutes.',
		'The second call ends with `failed: Operation timed out` and `after 135262 ms`. Both errors come from the first three packets of TCP, the handshake. **On port 82 the server answered with a reset; on port 81 nothing answered at all.** A firewall rule on the server drops every packet to port 81.',
		'"Refused" means an RST came back, so something at that address is up and answering. "Timed out" means the client\'s SYNs went out and nothing came back.'
	],
	terms: [
		{ term: 'Handshake', def: 'The three packets that open a TCP connection: SYN from the client, SYN-ACK from the server, ACK from the client. Each side picks a first sequence number, and the other acknowledges it.' },
		{ term: 'SYN-SENT', def: 'The client state between sending the SYN and receiving the SYN-ACK. RFC 9293: "waiting for a matching connection request after having sent a connection request".' },
		{ term: 'RST', def: 'The reset flag. A host sends a segment with RST for a port where no socket listens. The client\'s kernel then fails `connect()` with `ECONNREFUSED`.' },
		{ term: 'tcp_syn_retries', def: 'The Linux sysctl for how many times an unanswered SYN is sent again. Default 6. The kernel docs say the attempt then times out "after 131seconds", and the run in this chapter took 135.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['cli["Client 10.78.0.20: connect(), state SYN-SENT"] -->|"SYN seq 4237063974"| srv["Server 10.78.0.10:80, state LISTEN"]'],
				highlight: ['cli', 'srv'],
				note: 'curl calls `connect()`. The kernel picks the source port 42338, sets the socket to SYN-SENT and sends a SYN with no data. The SYN carries the client\'s first sequence number, 4237063974, and options such as `mss 1460`.'
			},
			{
				add: ['srv -->|"SYN-ACK seq 4164281932, ack 4237063975"| cli'],
				highlight: ['srv'],
				note: 'Port 80 has a listening socket, so the server answers 36 microseconds later. Its SYN-ACK carries its own first sequence number, 4164281932, and acknowledges 4237063975: the client\'s number plus 1, because a SYN counts as one byte of sequence space.'
			},
			{
				add: ['cli -->|"ACK, 8 µs later"| est["Both sides ESTABLISHED"]'],
				highlight: ['est'],
				note: 'The client acknowledges the server\'s SYN and moves to ESTABLISHED. curl reports `time_connect` 0.000157 seconds. Only now can it send `GET /`.'
			},
			{
				add: ['cli -->|"SYN to port 82"| closed["Port 82: no socket"]', 'closed -->|"RST, ACK, 26 µs later"| ref["connect() fails: Connection refused"]'],
				highlight: ['closed', 'ref'],
				note: 'Nothing listens on port 82. RFC 9293: "A SYN segment that does not match an existing connection is rejected by this means", a reset. The client is in SYN-SENT when the RST arrives, so its kernel returns `ECONNREFUSED`.'
			},
			{
				add: ['cli -->|"SYN to port 81, sent 7 times"| drop["Port 81: firewall DROP, no reply"]', 'drop -.->|"after 135 s"| to["connect() fails: Operation timed out"]'],
				highlight: ['drop', 'to'],
				note: 'The firewall discards each SYN without a reply. `tcpdump` on the client shows the same SYN at 0, 1, 2, 3, 4, 5 and 7 seconds: 1 SYN and 6 retries. `ss -tan` lists the socket as `SYN-SENT` the whole time. The kernel gives up at 135 seconds with `ETIMEDOUT`.'
			}
		]
	},
	example: {
		title: 'net/ipv4/tcp_ipv4.c: tcp_v4_connect, what connect() does before the SYN leaves',
		repo: 'torvalds/linux',
		url: `${IPV4}#L253-L362`,
		lang: 'c',
		code: `	rt = ip_route_connect(fl4, nexthop, inet->inet_saddr,
			      sk->sk_bound_dev_if, IPPROTO_TCP, orig_sport,
			      orig_dport, sk);
	if (IS_ERR(rt)) {
		err = PTR_ERR(rt);
		if (err == -ENETUNREACH)
			IP_INC_STATS(net, IPSTATS_MIB_OUTNOROUTES);
		return err;
	}
…
	/* Socket identity is still unknown (sport may be zero).
	 * However we set state to SYN-SENT and not releasing socket
	 * lock select source port, enter ourselves into the hash tables and
	 * complete initialization after this.
	 */
	tcp_set_state(sk, TCP_SYN_SENT);
	err = inet_hash_connect(tcp_death_row, sk);
	if (err)
		goto failure;
…
	if (likely(!tp->repair)) {
		union tcp_seq_and_ts_off st;

		st = secure_tcp_seq_and_ts_off(net,
					       inet->inet_saddr,
					       inet->inet_daddr,
					       inet->inet_sport,
					       usin->sin_port);
		if (!tp->write_seq)
			WRITE_ONCE(tp->write_seq, st.seq);
		WRITE_ONCE(tp->tsoffset, st.ts_off);
	}
…
	err = tcp_connect(sk);

	if (err)
		goto failure;

	return 0;

failure:
	/*
	 * This unhashes the socket and releases the local port,
	 * if necessary.
	 */
	tcp_set_state(sk, TCP_CLOSE);
	inet_bhash2_reset_saddr(sk);
	ip_rt_put(rt);
	sk->sk_route_caps = 0;
	inet->inet_dport = 0;
	return err;`,
		notes: [
			'Lines 1 to 9 look up the route first. With no route, `connect()` returns `-ENETUNREACH` at once and no SYN is sent: the `Network unreachable` of day 3.',
			'Line 16 sets the state to SYN-SENT, and line 17 picks the source port, as the comment on line 13 says. That port, 53158 in the timed-out call, is what `ss -tan` shows next to `SYN-SENT`.',
			'Lines 24 to 30 compute the first sequence number from the two addresses and the two ports. The capture shows the result in the SYN: `seq 4237063974`.',
			'Line 34 calls `tcp_connect`, whose comment is "Build a SYN and send it off." The answer comes later: [`tcp_reset`](' + INPUT + '#L4902-L4914) turns an RST in SYN-SENT into `ECONNREFUSED`, and an RST in an open connection into `ECONNRESET`.',
			'If no answer ever comes, the retransmit timer ends the attempt in [`tcp_write_err`](' + TIMER + '#L77-L79) with `ETIMEDOUT`. curl on Alpine printed it as `Operation timed out`.'
		]
	},
	tradeoff: {
		gain: [
			'Both sides check each other\'s first sequence number before any data: the server acknowledged 4237063975 and the client 4164281932 + 1.',
			'The RST for the closed port 82 came back in 26 microseconds, and curl reported `after 0 ms`.'
		],
		cost: [
			'The handshake takes a full round trip before the request can go out: 44 microseconds here between two containers, one network delay to the server and one back on a real link.',
			'A dropped SYN looks like a slow server. With `tcp_syn_retries = 6`, the client waited 135 seconds before any error, unless the program sets its own connect timeout.'
		]
	},
	task: {
		prompt: 'Three outputs from a client, all for the same server. For each, say whether the server machine replied, and what you would check next. Then write the `curl` option that makes the client give up on the third case after 3 seconds.\n\n1. `connect to 10.78.0.10 port 82 from 10.78.0.20 port 46574 failed: Connection refused`\n2. `ss -tan` shows `SYN-SENT 0 1 10.78.0.20:57886 10.78.0.10:81` for several seconds.\n3. `tcpdump` shows `Flags [S]` from `10.78.0.20.53158` to `10.78.0.10.81` seven times, with the same `seq 2848897320`, and nothing coming back.',
		hint: 'A refusal is a packet. A SYN-SENT socket and a repeated SYN with the same sequence number both mean the SYN-ACK never arrived.',
		answer: [
			'1: the server replied with an RST. The machine is up and reachable, but no program listens on port 82. Check that the service runs and listens on the right port and address, with `ss -tlnp` on the server.',
			'2 and 3: the server did not reply. The SYN left, and the retries show the same sequence number because they are copies of one SYN. Check a firewall that drops port 81, a security group, or whether the host is down.',
			'`curl --connect-timeout 3 http://10.78.0.10:81/` gave up after 3002 ms with `curl: (28) Connection timed out after 3002 milliseconds`, instead of 135 seconds.',
			'The kernel limit is `net.ipv4.tcp_syn_retries`. The kernel reads it per network namespace (`net->ipv4.sysctl_tcp_syn_retries`), so lowering it changes every connection in that namespace. A timeout on the one call changes only that call.'
		]
	},
	quiz: [
		{
			q: '`connect()` fails with `Connection refused` in under a millisecond. What happened on the wire?',
			options: [
				'The SYN was dropped by a firewall and the kernel gave up early',
				'The server answered the SYN with an RST because no socket listens there',
				'The server sent a SYN-ACK, but the client rejected its sequence number',
				'No packet left the client, because it has no route to the server'
			],
			answer: 1,
			why: 'In SYN-SENT, an incoming RST makes `tcp_reset` return `ECONNREFUSED`. A missing route gives `Network unreachable` instead, and a dropped SYN gives a timeout after the retries.'
		},
		{
			q: 'The client\'s SYN has `seq 1000`. Which acknowledgment number does the SYN-ACK carry?',
			options: ['1000', '0', '1001', '1460'],
			answer: 2,
			why: 'The SYN takes one sequence number, so the server acknowledges the next one, 1001. In the capture, SYN `seq 4237063974` got `ack 4237063975`. 1460 is the MSS option.'
		},
		{
			q: 'Port 81 is behind a rule that drops packets. What does `ss -tan` on the client show while `curl` waits?',
			options: [
				'The socket in `ESTABLISHED`, waiting for the HTTP response',
				'The socket in `TIME-WAIT`, after the server closed it',
				'Nothing: the socket only appears once the handshake ends',
				'The socket in `SYN-SENT`, with the SYN sent again and again'
			],
			answer: 3,
			why: '`tcp_v4_connect` sets SYN-SENT before the first SYN leaves, and the state stays there until a SYN-ACK, an RST or the final timeout. The retries resend the same SYN.'
		}
	],
	recall: {
		q: 'What does the client receive when a port is closed, and what when a firewall drops the SYN?',
		a: 'A closed port sends back an RST, so `connect()` fails at once with `Connection refused`. A dropped SYN gets no reply: the client resends it 6 times and fails with a timeout, after 135 seconds in this run.'
	},
	sources: [
		{ title: 'RFC 9293, Transmission Control Protocol (TCP), section 3.5', url: 'https://www.rfc-editor.org/rfc/rfc9293#section-3.5' },
		{ title: 'Linux kernel docs, ip-sysctl: tcp_syn_retries and tcp_syn_linear_timeouts', url: `${SYSCTL}?plain=1#L1081-L1087` },
		{ title: 'curl manual, --connect-timeout', url: 'https://curl.se/docs/manpage.html#--connect-timeout' },
		{ title: 'ss(8) manual page', url: 'https://man7.org/linux/man-pages/man8/ss.8.html' }
	]
};
