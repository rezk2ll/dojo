const LINUX = 'https://github.com/torvalds/linux/blob/70dd4ee72eb2d5793c62e71c14e3aba78e5a4e56';
const IP_H = `${LINUX}/include/uapi/linux/ip.h`;
const TCP_H = `${LINUX}/include/uapi/linux/tcp.h`;
const ETHER_H = `${LINUX}/include/uapi/linux/if_ether.h`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'layers',
	part: 'Packets',
	title: 'What a request is made of',
	minutes: 10,
	hook: [
		'You run `curl http://example.org/` in a container and get 577 bytes of HTML back. `tcpdump` in the same container counts 12 packets for that one call. The packet that carries the request is 141 bytes long, and only 75 of them are the `GET` that curl wrote.',
		'The other 66 bytes are three headers, one per layer: 32 bytes of TCP, 20 bytes of IP and 14 bytes of Ethernet. **A router reads the IP header and rebuilds the Ethernet header at every hop.** The server reads the TCP ports to find the web server\'s connection.',
		'A failed request often stops in one of these headers. An IP address nobody answers ARP for is day 4, an address with no route is day 3, and a port with nothing listening is day 5.'
	],
	terms: [
		{ term: 'Frame', def: 'The unit Ethernet sends: a 14-byte header with the destination MAC, the source MAC and a type, then the packet.' },
		{ term: 'Packet', def: 'The unit IP routes: a header of at least 20 bytes with the source and destination IP addresses, a TTL and a protocol number, then the segment.' },
		{ term: 'Segment', def: 'The unit TCP sends: a header of at least 20 bytes with the two ports, sequence numbers and flags, then the application bytes.' },
		{ term: 'TTL', def: 'Time to live: one byte in the IP header. Each router lowers it by at least 1 and drops the packet when it reaches 0.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['curl["curl: 75 bytes, GET / HTTP/1.1 then Host, User-Agent, Accept"] --> tcp["TCP header, 32 bytes: port 45702 to 80, flags PSH ACK"]'],
				highlight: ['curl', 'tcp'],
				note: 'curl writes 75 bytes into its socket: the request line, three header lines and an empty line, each ending in CRLF. The kernel puts a TCP header in front. It holds the ports 45702 and 80, a sequence number, the flags PSH and ACK, and 12 bytes of timestamp options.'
			},
			{
				add: ['tcp --> ip["IP header, 20 bytes: 172.17.0.5 to 104.20.26.136, TTL 64, protocol 6"]'],
				highlight: ['ip'],
				note: 'The IP header goes in front of the segment. It holds the two addresses, a TTL of 64, and protocol 6, which means TCP. Its total length field says 127: 20 bytes of IP, 32 of TCP and 75 of HTTP.'
			},
			{
				add: ['ip --> eth["Ethernet header, 14 bytes: to MAC ca:20:8c:72:3c:8c, type 0x0800"]'],
				highlight: ['eth'],
				note: 'The destination 104.20.26.136 is not on the container\'s network, so the frame goes to the gateway 172.17.0.1. Its MAC `ca:20:8c:72:3c:8c` is the host\'s `docker0` bridge. Type `0x0800` tells the receiver that an IPv4 packet follows. 14 + 127 = 141 bytes leave `eth0`.'
			},
			{
				add: ['eth -->|"141 bytes on eth0"| gw["Router: removes the Ethernet header, lowers the TTL, adds a new Ethernet header"]'],
				highlight: ['gw'],
				note: 'RFC 1812 describes what each router does: it "removes the Link Layer header a message was received with, modifies the IP header, and replaces the Link Layer header for retransmission". The TCP header and the 75 bytes of HTTP stay as they are.'
			},
			{
				add: ['gw -->|"more routers"| srv["Server 104.20.26.136: reads the ports, hands 75 bytes to the web server"]', 'srv -->|"961 bytes: HTTP/1.1 200 OK"| curl'],
				highlight: ['srv'],
				note: 'The server strips the Ethernet and IP headers and finds the connection by its two sockets, each an IP address plus a port. The web server answers with 961 bytes of HTTP headers and HTML. They travel back inside three new headers.'
			}
		]
	},
	example: {
		title: 'include/uapi/linux/ip.h: struct iphdr, the 20 bytes in front of every TCP segment',
		repo: 'torvalds/linux',
		url: `${IP_H}#L87-L109`,
		lang: 'c',
		code: `struct iphdr {
#if defined(__LITTLE_ENDIAN_BITFIELD)
	__u8	ihl:4,
		version:4;
#elif defined (__BIG_ENDIAN_BITFIELD)
	__u8	version:4,
  		ihl:4;
#else
#error	"Please fix <asm/byteorder.h>"
#endif
	__u8	tos;
	__be16	tot_len;
	__be16	id;
	__be16	frag_off;
	__u8	ttl;
	__u8	protocol;
	__sum16	check;
	__struct_group(/* no tag */, addrs, /* no attrs */,
		__be32	saddr;
		__be32	daddr;
	);
	/*The options start here. */
};`,
		notes: [
			'Lines 2 to 10 split the first byte into two 4-bit fields. In the captured GET it is `45`: version 4, and `ihl` 5. RFC 791 counts `ihl` "in 32 bit words", so 5 means 5 x 4 = 20 bytes, the size with no options.',
			'Line 12, `tot_len`, is the next two bytes: `007f`, which is 127. That covers the IP header and everything after it, but not the 14-byte Ethernet header.',
			'Lines 15 and 16 are `40` and `06`: a TTL of 64 and protocol 6. Lines 19 and 20 are `ac11 0005` and `6814 1a88`, which read as 172.17.0.5 and 104.20.26.136. The `__be32` type means the bytes are in network order, big end first.',
			'After `daddr` comes the TCP header, described by [`struct tcphdr`](' + TCP_H + '#L25-L60). Its first four bytes are `b286 0050`, ports 45702 and 80. Then `doff` is 8, so the TCP header is 8 x 4 = 32 bytes, and the flag byte `18` sets ACK and PSH.'
		]
	},
	tradeoff: {
		gain: [
			'The protocol byte lets IP carry more than TCP: 6 means TCP and 17 means UDP. RFC 9293 says this split "allows for the existence of host-level protocols other than TCP".',
			'A router only rewrites the Ethernet header and the IP header (RFC 1812). It forwards an HTTP request and a DNS query with the same code, without reading either.'
		],
		cost: [
			'Headers take room. 66 of the 141 bytes in the GET packet are headers, and the 7 bare ACK and FIN packets in the capture are 66 bytes each with no data at all.',
			'Over the whole call, 1849 bytes crossed `eth0` to move 1041 bytes of HTTP: 75 for the request, 961 and then 5 for the chunked response.'
		]
	},
	task: {
		prompt: 'Below is the second packet of the same capture, from `tcpdump -e -XX`. Without the decoded line, find: the IP protocol, the source and destination addresses, the TTL, the two ports, the TCP header length and the flags.\n\n`0x0000:  069c f20c df7a ca20 8c72 3c8c 0800 4500`\n`0x0010:  003c da7f 4000 3406 3d8a 6814 1a88 ac11`\n`0x0020:  0005 0050 b286 e76d 93de 8da6 9128 a012`',
		hint: 'The first 14 bytes are Ethernet. The IP header starts at `45`. The TCP header starts 20 bytes later, with the source port. The data offset is the high 4 bits of byte 12 of the TCP header, and the flags are byte 13.',
		answer: [
			'Ethernet: destination `06:9c:f2:0c:df:7a` (the container), source `ca:20:8c:72:3c:8c` (the gateway), type `0800`, IPv4.',
			'IP: `45`, so 20 bytes of header. Total length `003c` is 60. TTL `34` is 52. Protocol `06` is TCP. Source `6814 1a88` is 104.20.26.136 and destination `ac11 0005` is 172.17.0.5.',
			'TCP: source port `0050` is 80 and destination port `b286` is 45702. `a0` gives a data offset of 10 words, 40 bytes. 20 + 40 = 60, so this packet carries no data.',
			'Flag byte `12` is SYN plus ACK: this is the server\'s SYN-ACK. The acknowledgment number `8da6 9128` is 2376503592, one more than the client\'s first sequence number 2376503591.'
		]
	},
	quiz: [
		{
			q: '`tcpdump -e` shows `length 141` for a frame that carries 75 bytes of HTTP. What are the other 66 bytes?',
			options: [
				'The Ethernet, IP and TCP headers: 14, 20 and 32 bytes',
				'Padding up to the minimum size of an Ethernet frame',
				'The Host, User-Agent and Accept header lines of the request',
				'The TLS record header and the encryption tag of the request'
			],
			answer: 0,
			why: 'Each layer adds its own header in front of the bytes it receives. The HTTP header lines are part of the 75 bytes curl wrote, and plain `http://` has no TLS.'
		},
		{
			q: 'What does a plain IP router, as RFC 1812 describes it, change in a packet it forwards?',
			options: [
				'Nothing: it only reads the destination address and sends the packet on',
				'The TCP ports, so that the reply can find its way back',
				'The Ethernet header, and the TTL in the IP header',
				'The Host header, to point at the next server on the path'
			],
			answer: 2,
			why: 'A router removes the link layer header, lowers the TTL by at least 1, and adds a new link layer header for the next hop. It does not read or change TCP or HTTP.'
		},
		{
			q: 'The first byte of an IP header is `45`. What does the 5 mean?',
			options: [
				'Five routers may still forward the packet before it is dropped',
				'The packet has priority class 5 in the router queues',
				'Five option fields follow the destination address',
				'The IP header is 5 words of 32 bits, so 20 bytes'
			],
			answer: 3,
			why: 'The low 4 bits are the IHL, the header length in 32-bit words. 5 is the minimum, a header with no options. The hop limit is the TTL, a separate byte.'
		}
	],
	recall: {
		q: 'In the 141-byte frame that carried curl\'s `GET`, how many bytes did each layer take?',
		a: 'Ethernet 14, IP 20, TCP 32 (20 plus 12 bytes of timestamp options) and HTTP 75.'
	},
	sources: [
		{ title: 'RFC 791, Internet Protocol', url: 'https://www.rfc-editor.org/rfc/rfc791' },
		{ title: 'RFC 9293, Transmission Control Protocol (TCP)', url: 'https://www.rfc-editor.org/rfc/rfc9293' },
		{ title: 'RFC 1812, Requirements for IP Version 4 Routers', url: 'https://www.rfc-editor.org/rfc/rfc1812' },
		{ title: 'RFC 9112, HTTP/1.1', url: 'https://www.rfc-editor.org/rfc/rfc9112' },
		{ title: 'Linux source, include/uapi/linux/if_ether.h (struct ethhdr)', url: `${ETHER_H}#L183-L187` },
		{ title: 'Linux source, include/uapi/linux/in.h (IPPROTO_TCP and IPPROTO_UDP)', url: `${LINUX}/include/uapi/linux/in.h#L32-L44` },
		{ title: 'tcpdump(8) manual page', url: 'https://www.tcpdump.org/manpages/tcpdump.1.html' }
	]
};
