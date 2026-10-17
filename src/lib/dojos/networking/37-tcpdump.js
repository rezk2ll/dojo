const TCPDUMP = 'https://github.com/the-tcpdump-group/tcpdump/blob/3a2f6acd865e5b845d9f63caf5f2c23cb73a2bc9';
const SYSCTL = 'https://github.com/torvalds/linux/blob/70dd4ee72eb2d5793c62e71c14e3aba78e5a4e56/Documentation/networking/ip-sysctl.rst';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'tcpdump',
	part: 'Debugging the network',
	title: 'Reading tcpdump',
	minutes: 10,
	hook: [
		'Two `curl` calls to the same server fail. The first prints `Failed to connect to 192.168.128.2:8081 after 0 ms: Could not connect to server`. The second prints `Connection timed out after 8001 milliseconds` for port 9090. Both messages say the client could not connect.',
		'tcpdump on the client shows two different failures. On 8081, the server answered the SYN 55 microseconds later with a reset. On 9090, the client sent the same SYN 7 times in 8 seconds and got nothing back.',
		'The captures in this chapter were taken on 2026-10-17 between two Docker containers on one host, with tcpdump 4.99.4. **The server had an iptables rule that dropped every packet to port 9090.**'
	],
	terms: [
		{ term: 'Capture filter', def: 'The expression after the options, in the pcap-filter(7) language, such as `tcp and host 192.168.128.2`. tcpdump dumps only the packets for which it is true.' },
		{ term: 'Flags', def: 'The TCP control bits, printed in brackets as letters: `S` SYN, `F` FIN, `P` PSH, `R` RST and `.` for ACK. `[S.]` is a SYN with an ACK.' },
		{ term: 'Relative sequence number', def: 'By default tcpdump subtracts the first sequence number it saw in a conversation, so the first data byte each way is `1`. The `-S` option prints the raw numbers.' },
		{ term: 'Retransmission', def: 'A segment sent again because no ACK came back for it in time. In tcpdump it shows as the same sender and the same `seq` range printed again.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['c["client 192.168.128.3"] -->|"Flags [S], seq 112890493, mss 1460, wscale 10"| s["server 192.168.128.2:8080"]'],
				highlight: ['c', 's'],
				note: 'Captured with `tcpdump -i eth0 -nn -S "tcp and host 192.168.128.2"`. The client opens from port 37296 with its initial sequence number, 112890493. The options offer an MSS of 1460 bytes and a window scale of 10.'
			},
			{
				add: ['s -->|"Flags [S.], seq 3443821786, ack 112890494"| c', 'c -->|"Flags [.], ack 3443821787"| s'],
				highlight: ['s', 'c'],
				note: 'The server picks its own initial number and acknowledges the client\'s plus one: 112890493 + 1 = 112890494. The client\'s `[.]` acknowledges 3443821786 + 1. All 3 packets of the handshake fit in 56 microseconds on this host.'
			},
			{
				add: ['c -->|"Flags [P.], seq 112890494:112890576, length 82"| s', 's -->|"Flags [P.], length 155, then length 874"| c'],
				highlight: ['c', 's'],
				note: 'The client sends 82 bytes: 112890576 minus 112890494, the `GET / HTTP/1.1` request. The server replies in 2 segments: 155 bytes that start with `HTTP/1.0 200 OK`, then 874 more bytes. Each side ACKs what it got.'
			},
			{
				add: ['c -->|"Flags [F.]"| s', 's -->|"Flags [F.], then the client sends [.]"| c'],
				highlight: ['c', 's'],
				note: 'The client sends `[F.]`, a FIN with an ACK. The server answers with its own `[F.]` and the client sends the last `[.]`. A FIN consumes one sequence number, so the server acks 112890577.'
			},
			{
				add: ['c -->|"Flags [S] to port 8081"| p8081["server port 8081: nothing listening"]', 'p8081 -->|"Flags [R.], seq 0, win 0"| c'],
				highlight: ['p8081'],
				note: 'No process listens on 8081, so the server\'s kernel answers the SYN with `[R.]`, a reset, 55 microseconds later. RFC 9293 gives the reset "sequence number zero" and acks the SYN: 1529160888 + 1 = 1529160889. curl gave up after 0 ms.'
			},
			{
				add: ['c -->|"Flags [S] x7, same seq 4085220262"| p9090["server port 9090: iptables DROP"]'],
				highlight: ['p9090'],
				note: 'Nothing comes back, so the client resends the same SYN. The gaps are 1, 1, 1, 1, 1 and 2 seconds. That matches the kernel docs for `tcp_syn_linear_timeouts = 4`: "1, 1, 1, 1, 1, 2, 4, ...". curl stopped at its `--connect-timeout 8`.'
			}
		]
	},
	example: {
		title: 'print-tcp.c in tcpdump: how a TCP line gets its flags and sequence numbers',
		repo: 'the-tcpdump-group/tcpdump',
		url: `${TCPDUMP}/print-tcp.c#L105-L460`,
		lang: 'c',
		code: `const struct tok tcp_flag_values[] = {
        { TH_FIN, "F" },
        { TH_SYN, "S" },
        { TH_RST, "R" },
        { TH_PUSH, "P" },
        { TH_ACK, "." },
        { TH_URG, "U" },
        { TH_ECNECHO, "E" },
        { TH_CWR, "W" },
        { TH_AE, "e" },
        { 0, NULL }
};
…
        flags = tcp_get_flags(tp);
        ND_PRINT("Flags [%s]", bittok2str_nosep(tcp_flag_values, "none", flags));

        if (!ndo->ndo_Sflag && (flags & TH_ACK)) {
…
                        if (!th->nxt || (flags & TH_SYN)) {
                                /* didn't find it or new conversation */
…
                                th->addr = tha;
                                if (rev) {
                                        th->ack = seq;
                                        th->seq = ack - 1;
                                } else {
                                        th->seq = seq;
                                        th->ack = ack - 1;
                                }
                        } else {
                                if (rev) {
                                        seq -= th->ack;
                                        ack -= th->seq;
                                } else {
                                        seq -= th->seq;
                                        ack -= th->ack;
                                }
                        }
…
        length -= hlen;
        if (ndo->ndo_vflag > 1 || length > 0 || flags & (TH_SYN | TH_FIN | TH_RST)) {
                ND_PRINT(", seq %u", seq);

                if (length > 0) {
                        ND_PRINT(":%u", seq + length);
                }
        }`,
		notes: [
			'Lines 1 to 12 map each flag bit to one letter, and line 6 maps ACK to `.`. Line 15 prints the letters for the bits that are set, or `none`. So `[R.]` from port 8081 is RST and ACK.',
			'Line 17 enters the relative numbering only for a packet with ACK set and without `-S`. A bare SYN has no ACK, so it always prints its raw number.',
			'Lines 19 to 29 record the initial numbers the first time a conversation is seen, or on a SYN, and print that packet raw. Lines 30 to 37 subtract them on every later packet. So the SYN-ACK of a capture without `-S` shows `seq 2994088075` and the next ACK shows `ack 1`.',
			'Lines 41 to 45 print `seq first:last`, where the man page says last is "up to but not including". `seq 1:38` carries bytes 1 to 37. Nothing in this file compares a packet with earlier ones, so tcpdump never labels a retransmission: you spot the repeated range yourself.'
		]
	},
	tradeoff: {
		gain: [
			'tcpdump shows what crossed the interface: here a reset in 55 microseconds on 8081 and 7 unanswered SYNs on 9090, where curl printed one error line each time.',
			'`-w file` saves the packets for later, and reading a saved file needs no special privileges.',
			'A filter like `tcp[tcpflags] & (tcp-rst) != 0` keeps a capture on a busy host down to the packets you care about.'
		],
		cost: [
			'Run as a normal user to capture from `lo`, tcpdump 4.99.4 printed "You don\'t have permission to perform this capture on that device".',
			'On a busy link the kernel can drop packets before tcpdump sees them. tcpdump reports them as "dropped by kernel" when it exits.',
			'For HTTPS, the payload after the TLS handshake is encrypted. You see flags, sizes and timing, and no request line.'
		]
	},
	task: {
		prompt: 'A client hangs on a request. You run `tcpdump -i eth0 -nn "tcp port 8080"` on the client and get these lines (options cut):\n`23:54:12.111171 IP 192.168.128.3.55880 > 192.168.128.2.8080: Flags [S], seq 1934350538`\n`23:54:12.111241 IP 192.168.128.2.8080 > 192.168.128.3.55880: Flags [S.], seq 2994088075, ack 1934350539`\n`23:54:12.111254 IP 192.168.128.3.55880 > 192.168.128.2.8080: Flags [.], ack 1`\n`23:54:15.111383 ... > 192.168.128.2.8080: Flags [P.], seq 1:38, ack 1, length 37: HTTP: GET / HTTP/1.1`\n`23:54:15.319701 ... Flags [P.], seq 1:38, ack 1, length 37`\n`23:54:15.527713 ... Flags [P.], seq 1:38, ack 1, length 37`\n`23:54:15.935701 ... Flags [P.], seq 1:38, ack 1, length 37`\n`23:54:16.799701 ... Flags [P.], seq 1:38, ack 1, length 37`\n`23:54:18.464694 ... Flags [P.], seq 1:38, ack 1, length 37`\n`23:54:21.727700 ... Flags [P.], seq 1:38, ack 1, length 37`\nDid the connection open? What is wrong, and is the server refusing or silent?',
		hint: 'Read the first 3 lines as a handshake. Then look for any line from 192.168.128.2 after 23:54:12, and at the gaps between the repeated lines.',
		answer: [
			'The connection opened: `[S]`, `[S.]` with `ack 1934350539`, then `[.]` with `ack 1`, all within 83 microseconds.',
			'At 23:54:15.111 the client sends the 37 byte request, `seq 1:38`. The server never ACKs it, and the same `seq 1:38` goes out 6 more times. These are retransmissions.',
			'The gaps grow: 208, 208, 408, 864, 1665 and 3263 ms. The client waits about twice as long before each new try, after the first two.',
			'The server is silent, with no `[R]` at all. In this capture, an iptables rule added on the server after the handshake dropped every packet to port 8080. A closed port would have answered with a reset.'
		]
	},
	quiz: [
		{
			q: 'You send a SYN to port 8081 and get `Flags [R.], seq 0, ack 1529160889, win 0` 55 microseconds later. What does it mean?',
			options: [
				'A firewall on the path dropped the SYN, and the client will retry it',
				'The host is up and no process listens on port 8081',
				'The server accepted the connection and closed it after the request',
				'The server\'s receive window is full, so the client must wait'
			],
			answer: 1,
			why: 'RFC 9293 has a host answer a SYN for a port with no connection by a reset. `connect()` then fails with `ECONNREFUSED`, "no one listening on the remote address". A dropped SYN gives silence and retransmissions instead.'
		},
		{
			q: 'Which capture filter keeps only the packets that open or close TCP connections, the ones with SYN or FIN set?',
			options: [
				'`tcp[tcpflags] == (tcp-syn|tcp-fin)`',
				'`tcp and (syn or fin)`',
				'`tcp[tcpflags] & (tcp-syn|tcp-fin) != 0`',
				'`tcp port syn or tcp port fin`'
			],
			answer: 2,
			why: 'The `&` keeps only the SYN and FIN bits of the flags byte, and `!= 0` is true if either is set. The `==` version matches only a flags byte equal to SYN plus FIN, so a plain SYN fails it.'
		},
		{
			q: 'The SYN shows `wscale 10`. Later packets from the same side show `win 63`. How many bytes may the other side send before waiting?',
			options: [
				'63 bytes, the number printed',
				'64,512 bytes: 63 shifted left by 10',
				'630 bytes: 63 times the scale of 10',
				'1460 bytes, one MSS per window'
			],
			answer: 1,
			why: 'RFC 7323 has the sender right-shift its real window by the agreed shift count. tcpdump prints the raw 16 bit field, so 63 << 10 = 64,512 bytes. The window in the SYN itself is never scaled, which is why it showed 64240.'
		}
	],
	recall: {
		q: 'In tcpdump, what does a refused connection look like, and what does a dropped SYN look like on Linux defaults?',
		a: 'Refused: the server answers the SYN at once with `Flags [R.]`. Dropped: the same `Flags [S]` with the same `seq` repeats with gaps of 1, 1, 1, 1, 1, then 2 seconds, and nothing comes back.'
	},
	sources: [
		{ title: 'tcpdump(1) man page, tcpdump.org, read 2026-10-17', url: 'https://www.tcpdump.org/manpages/tcpdump.1.html' },
		{ title: 'pcap-filter(7) man page, tcpdump.org', url: 'https://www.tcpdump.org/manpages/pcap-filter.7.html' },
		{ title: 'tcpdump source, print-tcp.c', url: `${TCPDUMP}/print-tcp.c` },
		{ title: 'Linux kernel docs, ip-sysctl: tcp_syn_retries and tcp_syn_linear_timeouts', url: `${SYSCTL}#L1081-L1158` },
		{ title: 'RFC 9293, Transmission Control Protocol, section 3.5.2 Reset Generation', url: 'https://www.rfc-editor.org/rfc/rfc9293#section-3.5.2' },
		{ title: 'connect(2), man7.org', url: 'https://man7.org/linux/man-pages/man2/connect.2.html' },
		{ title: 'RFC 7323, TCP Extensions for High Performance (window scale)', url: 'https://www.rfc-editor.org/rfc/rfc7323#section-2.2' }
	]
};
