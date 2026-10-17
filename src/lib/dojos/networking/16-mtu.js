const LINUX = 'https://github.com/torvalds/linux/blob/70dd4ee72eb2d5793c62e71c14e3aba78e5a4e56';
const TIMER = `${LINUX}/net/ipv4/tcp_timer.c`;
const OUTPUT = `${LINUX}/net/ipv4/tcp_output.c`;
const WGQUICK = 'https://github.com/WireGuard/wireguard-tools/blob/a998407747005ea7e4e0258d96f105c97241e1d3/src/wg-quick/linux.bash';
const CF = 'https://blog.cloudflare.com/path-mtu-discovery-in-practice/';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'mtu',
	part: 'Names and addresses',
	title: 'MTU and fragmentation',
	minutes: 10,
	hook: [
		'In late January 2015, a small number of Cloudflare users could not reach Cloudflare\'s services at all. They reached the internet through IP tunnels, most of them IPv6 carried inside IPv4.',
		'The cause was one ICMP message that went to the wrong machine. A router on the tunnel path sent "packet too big" back to Cloudflare, and Cloudflare\'s internal ECMP routing hashed ICMP on the two IP addresses only. **The message landed on a different server than the one holding the TCP connection**, so that server kept sending packets the tunnel could not carry.',
		'The iptables manual lists the symptoms of a path that drops these messages: "Web browsers connect, then hang with no data received", and "ssh works fine, but scp hangs after initial handshaking".'
	],
	terms: [
		{ term: 'MTU', def: 'Maximum transmission unit: the largest IP packet a link carries in one piece, headers included. Ethernet uses 1500 bytes.' },
		{ term: 'Path MTU', def: 'The smallest MTU of all the links between two hosts. RFC 1191 defines it as "the minimum of the MTUs of each hop in the path".' },
		{ term: 'MSS', def: 'Maximum segment size: the largest TCP payload a host accepts, sent in its SYN. For IPv4 it is the MTU minus 40 bytes (20 of IP header, 20 of TCP header), so 1460 on Ethernet.' },
		{ term: 'ICMP black hole', def: 'A path where a router drops a packet that is too big, but its ICMP "fragmentation needed" message never reaches the sender, often because a firewall drops ICMP.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['client["Laptop, LAN MTU 1500"] -->|"SYN, mss 1460"| router["Office router, wg0 MTU 1420"]', 'router -->|"tunnel"| server["Server, MTU 1500"]'],
				highlight: ['client', 'server'],
				note: 'The laptop sits on a 1500 byte LAN and advertises `mss 1460` in its SYN. The server does the same. Neither one knows that the office router sends everything through a WireGuard tunnel with an MTU of 1420. The handshake and the HTTP request are small packets, so they pass.'
			},
			{
				add: ['server -->|"1500 byte packet, DF set"| router', 'router -->|"ICMP type 3 code 4, Next-Hop MTU 1420"| server'],
				highlight: ['router'],
				note: 'The server answers with full 1500 byte packets and the Don\'t Fragment (DF) bit set. The router cannot fit them into the 1420 byte tunnel and may not split them, so it drops each one. RFC 1191 says it must send back ICMP type 3 code 4, "fragmentation needed and DF set", with the next hop\'s MTU, 1420, in the header.'
			},
			{
				add: ['server -->|"PMTU 1420: 1380 byte payloads"| router', 'router --> client'],
				highlight: ['server'],
				note: 'When the ICMP message arrives, the server lowers its Path MTU for the laptop\'s address to 1420 and resends the data as 1380 byte TCP payloads. Linux keeps that value for `mtu_expires` seconds. RFC 1191 forbids a host to go below 68 bytes, and Linux stops at `min_pmtu`, 552 by default.'
			},
			{
				add: ['fw["Firewall: drop all ICMP"]', 'router -.->|"ICMP dropped"| fw'],
				highlight: ['fw'],
				note: 'If a firewall drops the ICMP message, the server never learns the 1420. It retransmits the same 1500 byte packet, the router drops it again, and the download hangs while the connection stays open. The iptables manual describes the same case: the browser connects, then receives nothing.'
			},
			{
				add: ['router -->|"rewrites SYN: mss 1380"| server'],
				highlight: ['router'],
				note: 'The router can work around it with MSS clamping: `iptables -t mangle -A FORWARD -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu`. It rewrites the MSS in each SYN that crosses it to the outgoing MTU minus 40, so 1380 here. The server then never sends a TCP segment too big for the tunnel.'
			}
		]
	},
	example: {
		title: 'net/ipv4/tcp_timer.c: TCP black hole detection in Linux',
		repo: 'torvalds/linux',
		url: `${TIMER}#L166-L269`,
		lang: 'c',
		code: `static void tcp_mtu_probing(struct inet_connection_sock *icsk, struct sock *sk)
{
	const struct net *net = sock_net(sk);
	int mss;

	/* Black hole detection */
	if (!READ_ONCE(net->ipv4.sysctl_tcp_mtu_probing))
		return;

	if (!icsk->icsk_mtup.enabled) {
		icsk->icsk_mtup.enabled = 1;
		icsk->icsk_mtup.probe_timestamp = tcp_jiffies32;
	} else {
		mss = tcp_mtu_to_mss(sk, icsk->icsk_mtup.search_low) >> 1;
		mss = min(READ_ONCE(net->ipv4.sysctl_tcp_base_mss), mss);
		mss = max(mss, READ_ONCE(net->ipv4.sysctl_tcp_mtu_probe_floor));
		mss = max(mss, READ_ONCE(net->ipv4.sysctl_tcp_min_snd_mss));
		icsk->icsk_mtup.search_low = tcp_mss_to_mtu(sk, mss);
	}
	tcp_sync_mss(sk, icsk->icsk_pmtu_cookie);
}
…
static int tcp_write_timeout(struct sock *sk)
{
…
	} else {
		if (retransmits_timed_out(sk, READ_ONCE(net->ipv4.sysctl_tcp_retries1), 0)) {
			/* Black hole detection */
			tcp_mtu_probing(icsk, sk);

			__dst_negative_advice(sk);
		}`,
		notes: [
			'Line 27 runs on a retransmission timeout of an open connection. Once the retransmissions have lasted as long as `tcp_retries1` backed off timeouts (3 by default, at least 3 seconds from the 200 ms minimum timeout), line 29 calls `tcp_mtu_probing`.',
			'Lines 7 and 8 return at once when the sysctl `tcp_mtu_probing` is 0. On the laptop used for this chapter (kernel 6.17), `cat /proc/sys/net/ipv4/tcp_mtu_probing` printed `0`: with that setting, the kernel never lowers the MSS of a stuck connection.',
			'With the value 1, the first call takes lines 10 to 12 and turns probing on. Line 20 then calls [`tcp_sync_mss`](' + OUTPUT + '#L2079-L2098), which caps the MSS at `search_low`. `tcp_mtup_init` set `search_low` from `tcp_base_mss`, 1024 bytes by default, and a 1024 byte segment fits the 1420 byte tunnel.',
			'If the connection is still stuck at the next timeout, lines 14 to 18 halve the MSS, from 1024 to 512, and never go below `tcp_mtu_probe_floor` and `tcp_min_snd_mss` (48 each). The 2015 Cloudflare post still calls 512 the default `tcp_base_mss`. The current source sets `TCP_BASE_MSS` to 1024.'
		]
	},
	tradeoff: {
		gain: [
			'With PMTUD, a server sends 1460 byte payloads on a 1500 byte path. Before RFC 1191, hosts used "the lesser of 576 and the first-hop MTU" for any remote network, an MSS of 536.',
			'One MSS clamping rule on the tunnel router fixes every TCP connection that crosses it, with no change on the laptops or the servers.'
		],
		cost: [
			'PMTUD depends on an ICMP message reaching the right sender. A firewall that drops ICMP, or ECMP that sends it to another server as at Cloudflare, gives a black hole.',
			'The clamp rule rewrites TCP SYNs and nothing else, so UDP traffic through the same tunnel, such as DNS or QUIC, still meets the 1420 byte limit.',
			'With `tcp_mtu_probing = 1`, Linux reacts only after `tcp_retries1` timeouts, so a stuck connection first waits at least 3 seconds.'
		]
	},
	task: {
		prompt: 'Your office reaches the datacenter through WireGuard, started with `wg-quick`, on an uplink with MTU 1500. Users say `git clone https://git.internal/...` hangs after a few kilobytes, while `curl -I` on the same host works. Work out: the MTU `wg-quick` gives `wg0`, the MSS the laptops advertise, the MSS a clamp rule on the router would write, and a `ping` command that proves the tunnel limit.',
		hint: '`wg-quick` reads the uplink MTU and subtracts a fixed number. An ICMP echo adds 8 bytes of ICMP header and 20 of IP header to the `-s` size.',
		answer: [
			'`wg-quick` without an `MTU =` line takes the lowest MTU on the route to each peer and runs `ip link set mtu $(( mtu - 80 ))`: 1500 minus 80 gives 1420.',
			'The laptops are on the 1500 byte LAN, so they advertise `mss 1460`. The server sends 1500 byte packets that the router cannot put in `wg0`. `curl -I` works because its response fits in small packets.',
			'`--clamp-mss-to-pmtu` writes the outgoing MTU minus 40 into each SYN: 1420 minus 40 gives `mss 1380`.',
			'From a host behind the router: `ping -M do -s 1392 <server>` sends a 1420 byte packet (1392 + 8 + 20) with DF set and gets an answer. `-s 1393` gets no answer, or an ICMP "frag needed" if ICMP comes back. On a 1500 byte link, a real run printed `1473(1501) bytes` and then `ping: local error: message too long, mtu=1500`.'
		]
	},
	quiz: [
		{
			q: 'A new firewall drops all ICMP. TCP connections open, small API answers arrive, but large downloads hang forever. Why?',
			options: [
				'The firewall blocks the TCP handshake for packets larger than 1460 bytes',
				'The "fragmentation needed" messages never reach the sender, which keeps resending full packets',
				'Routers stop fragmenting large packets when the firewall drops ICMP echo requests',
				'TCP needs ICMP to acknowledge each large segment, and those acknowledgments are lost'
			],
			answer: 1,
			why: 'The router drops each packet with DF set that does not fit the next hop and answers with ICMP type 3 code 4. With that message dropped, the sender never lowers its Path MTU and retransmits the same oversized packet. Small packets fit, so the handshake and short answers pass.'
		},
		{
			q: 'A Linux laptop on a 1500 byte Ethernet LAN opens a TCP connection over IPv4. What MSS does its SYN advertise?',
			options: ['1500', '1480', '1460', '1420'],
			answer: 2,
			why: 'The MSS counts only TCP payload. The laptop subtracts the 20 byte IPv4 header and the 20 byte TCP header from the 1500 byte MTU: 1460. The Cloudflare post shows the same `mss 1460` in a captured SYN.'
		},
		{
			q: 'You set `net.ipv4.tcp_mtu_probing = 1` on a server behind an ICMP black hole. What changes for a stuck connection?',
			options: [
				'The kernel stops setting the DF bit, so routers fragment the large packets',
				'Every connection starts with a 1024 byte MSS from the first SYN',
				'After `tcp_retries1` timeouts the kernel drops the MSS to about 1024, then halves it',
				'The kernel sends ICMP probes to each router on the path to read its MTU'
			],
			answer: 2,
			why: 'In mode 1, `tcp_write_timeout` calls `tcp_mtu_probing` once retransmissions pass `tcp_retries1`. The first call enables probing, so `tcp_sync_mss` caps the MSS at `search_low`, set from `tcp_base_mss` (1024). A later call halves it. Mode 2 is the one that starts every connection at `tcp_base_mss`.'
		}
	],
	recall: {
		q: 'Which ICMP message does Path MTU discovery rely on, and what does the user see when a firewall drops it?',
		a: 'ICMP type 3 code 4, "fragmentation needed and DF set", carrying the next hop\'s MTU. Without it the sender keeps resending full size packets: the connection opens, then hangs with no data.'
	},
	sources: [
		{ title: 'RFC 1191, Path MTU Discovery', url: 'https://www.rfc-editor.org/rfc/rfc1191' },
		{ title: 'RFC 8200, IPv6 Specification, section 5: Packet Size Issues', url: 'https://www.rfc-editor.org/rfc/rfc8200#section-5' },
		{ title: 'Cloudflare blog, Path MTU discovery in practice (2015)', url: CF },
		{ title: 'Linux kernel docs, IP Sysctl (tcp_mtu_probing, tcp_base_mss, min_pmtu)', url: 'https://docs.kernel.org/networking/ip-sysctl.html' },
		{ title: 'iptables-extensions(8), TCPMSS target', url: 'https://man7.org/linux/man-pages/man8/iptables-extensions.8.html' },
		{ title: 'wireguard-tools, wg-quick set_mtu_up', url: `${WGQUICK}#L126-L143` },
		{ title: 'Linux source, net/ipv4/tcp_timer.c', url: TIMER }
	]
};
