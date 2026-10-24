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
		],
		steps: [
			{
				title: 'Read output 1',
				questions: [
					{ q: '`Connection refused`: what came back to the client?', options: ['An RST from the server machine', 'Nothing at all', 'A SYN-ACK that the client rejected', 'An error from a router on the way'], answer: 0, why: 'A refusal is a packet. In SYN-SENT, an incoming RST makes the kernel fail `connect()` with `ECONNREFUSED`.' },
					{ q: 'So did the server machine reply?', options: ['No: refused means the host is down', 'Yes: the machine is up and reachable', 'No: only a firewall answered', 'You cannot tell from this line'], answer: 1, why: 'Something at that address sent the RST, so the machine is up and the path to it works.' },
					{ q: 'Why did it send an RST?', options: ['A firewall drops port 82', 'The server is overloaded', 'No program listens on port 82', 'The client sent a wrong sequence number'], answer: 2, why: 'A host answers a SYN with an RST when no socket listens on that port. A dropping firewall would send nothing.' },
					{ q: 'What do you check next?', options: ['The firewall rules for port 82', 'The route from the client to the server', 'Whether the server is powered on', 'The service, with `ss -tlnp` on the server'], answer: 3, why: 'The machine answers, so look at the program: is it running, and on which port and address does it listen?' }
				]
			},
			{
				title: 'Read outputs 2 and 3',
				questions: [
					{ q: '`ss -tan` shows `SYN-SENT` for several seconds. What does that mean?', options: ['The SYN left and no SYN-ACK came back', 'The handshake ended and the client waits for data', 'The server closed the connection', 'The client has not sent anything yet'], answer: 0, why: 'SYN-SENT is the state between sending the SYN and getting the SYN-ACK. It stays there until a SYN-ACK, an RST or the final timeout.' },
					{ q: 'tcpdump shows seven SYNs from port 53158 with the same `seq`. What are they?', options: ['Seven separate attempts made by curl', 'Copies of one SYN: the first one and 6 retries', 'Seven connections from seven ports', 'The server sending the SYN back'], answer: 1, why: 'A retry is the same SYN sent again, so the source port and the sequence number do not change.' },
					{ q: 'Did the server machine reply in cases 2 and 3?', options: ['Yes, with an RST each time', 'Yes, but its SYN-ACK came too late', 'No: nothing came back', 'Yes, with a SYN-ACK that the client ignored'], answer: 2, why: 'Any reply would end SYN-SENT: a SYN-ACK opens the connection and an RST refuses it.' },
					{ q: 'What do you check next?', options: ['Whether a program listens on port 81', 'The DNS name of the server', 'The client\'s TIME_WAIT sockets', 'A firewall that drops port 81, a security group, or whether the host is down'], answer: 3, why: 'Something swallowed the SYN without a word. In this chapter it was a DROP rule on the server.' }
				]
			},
			{
				title: 'Cap the wait',
				questions: [
					{ q: 'With no option, how long did curl wait on port 81 in this chapter\'s run?', options: ['3 seconds', '15 minutes', 'Until you press Ctrl-C', 'About 135 seconds'], answer: 3, why: 'The kernel sent 1 SYN and 6 retries, then failed with `ETIMEDOUT` after 135262 ms.' },
					{ q: 'Which `curl` option gives up on the connection after 3 seconds?', options: ['`--retry 3`', '`--connect-timeout 3`', '`--keepalive-time 3`', '`--limit-rate 3`'], answer: 1, why: '`--connect-timeout` bounds the time curl waits for the connection to open.' },
					{ q: 'What does curl print when that limit hits?', options: ['`curl: (28) Connection timed out after 3002 milliseconds`', '`Connection refused`', '`Network unreachable`', '`Could not resolve host`'], answer: 0, why: 'In this session it gave up after 3002 ms with error 28, instead of 135 seconds.' },
					{ q: 'Why did the kernel send the SYN 6 more times on its own?', options: ['curl asked for 6 retries', 'The firewall allowed 6 tries', '`net.ipv4.tcp_syn_retries` defaults to 6', '`tcp_retries2` is set to 6'], answer: 2, why: '`tcp_syn_retries` is the number of times an unanswered SYN is sent again. `tcp_retries2` is for data on an open connection.' }
				]
			},
			{
				title: 'Choose where to set the limit',
				questions: [
					{ q: 'Where does the kernel read `tcp_syn_retries`?', options: ['Per network namespace', 'Per process', 'Per socket', 'Per destination address'], answer: 0, why: 'The code reads `net->ipv4.sysctl_tcp_syn_retries`, one value per network namespace.' },
					{ q: 'If you lower it, what changes?', options: ['Only the curl call', 'Every connection in that namespace', 'Only connections to port 81', 'Only connections that already failed'], answer: 1, why: 'One value covers every connection in the namespace, including the ones that need a patient connect.' },
					{ q: 'Why prefer `--connect-timeout` on the one call?', options: ['It makes the SYN reach the server', 'It removes the firewall rule', 'It changes only that one call', 'It works only as root'], answer: 2, why: 'A timeout on the call sets the limit where it is needed and leaves the rest of the host alone.' },
					{ q: 'A DROP rule on the server blocks port 81. What makes the call work?', options: ['Lower `tcp_syn_retries` to 1', 'Start a second program on port 81', 'Retry curl in a loop', 'Allow port 81 in that rule or security group'], answer: 3, why: 'The timeout only makes the failure fast. The SYN reaches the service only once the rule lets it through.' }
				]
			}
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
	lab: {
		minutes: 15,
		goal: 'Produce the three cases of the task on your laptop: an open port, a closed port and a dropped port.',
		steps: [
			'Create a network and a server that answers on port 80, has nothing on 82 and drops port 81: `docker network create tcplab && docker run -d --name srv --network tcplab --cap-add NET_ADMIN nicolaka/netshoot:v0.13 sh -c "iptables -A INPUT -p tcp --dport 81 -j DROP && python3 -m http.server 80"`.',
			'Open a client shell on the same network: `docker run --rm -it --network tcplab nicolaka/netshoot:v0.13`.',
			'Inside it, try the open port and the closed one: `curl -s -o /dev/null -w "%{http_code}\\n" http://srv/`, then `curl -sv http://srv:82/ 2>&1 | grep -i refused`.',
			'Watch the dropped port: `timeout 5 tcpdump -l -i eth0 -n "tcp port 81" & sleep 1; curl -s --connect-timeout 3 http://srv:81/; echo "curl exit $?"`. Wait until tcpdump stops.',
			'Look at the socket while it waits: `curl -s --connect-timeout 3 http://srv:81/ & sleep 1; ss -tan | grep :81`.',
			'Type `exit`. On your laptop, check what listens on the server with `docker exec srv ss -tlnp`, then clean up: `docker rm -f srv && docker network rm tcplab`.'
		],
		done: [
			'Port 80 prints `200`.',
			'Port 82 prints `connect to ... port 82 ... failed: Connection refused` at once.',
			'tcpdump shows three `Flags [S]` lines to port 81 with the same `seq`, about 1 s apart, and curl exits with `28`.',
			'`ss -tan` shows the socket to port 81 in `SYN-SENT`.',
			'`ss -tlnp` on the server lists `python3` on port 80 and nothing on 81 or 82.'
		],
		solution: [
			'Port 82: the server kernel answers the SYN with an RST, because no socket listens there. The machine is up.',
			'Port 81: the DROP rule discards each SYN and nothing comes back. The kernel sends the same SYN again after about 1 and 2 seconds, and `--connect-timeout 3` stops curl long before the 6 default retries run out.',
			'Exit code 28 is curl\'s timeout error, the same `(28)` as in the task. The other line in `ss -tlnp`, on 127.0.0.11, is Docker\'s own DNS server.'
		]
	},
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
