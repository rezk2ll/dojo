const LINUX = 'https://github.com/torvalds/linux/blob/70dd4ee72eb2d5793c62e71c14e3aba78e5a4e56';
const ARP = `${LINUX}/net/ipv4/arp.c`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'arp',
	part: 'Packets',
	title: 'ARP and MAC addresses',
	minutes: 10,
	hook: [
		'Three containers share the network 10.77.0.0/24. Container A has 10.77.0.10. Someone adds the same address to container B with `ip addr add 10.77.0.10/24 dev eth0`. After container C pings 10.77.0.10, its `ip neigh` maps that address to B\'s MAC `32:ad:ae:a5:3f:f5`, so C\'s packets go to B.',
		'`tcpdump` on C shows why. C asked once, "who-has 10.77.0.10", and two replies came back 1 microsecond apart: B first, then A. **Linux kept the first reply.** Nothing on C printed a warning.',
		'RFC 5227 calls two hosts with the same IP address "an annoying and hard-to-diagnose problem". `arping -D -c 2 -I eth0 10.77.0.10` checks for it: it sends a probe from 0.0.0.0, and here it exited with code 1 because a host answered.'
	],
	terms: [
		{ term: 'MAC address', def: 'The 6-byte hardware address of a network interface, like `56:2a:92:53:89:1c`. The Ethernet header carries a destination MAC and a source MAC.' },
		{ term: 'ARP', def: 'Address Resolution Protocol (RFC 826): a broadcast request "who has this IP" and a reply "this IP is at this MAC", 28 bytes each on Ethernet.' },
		{ term: 'Broadcast', def: 'A frame sent to `ff:ff:ff:ff:ff:ff`, which every host on the local network receives.' },
		{ term: 'Neighbour table', def: 'The kernel\'s cache of IP to MAC mappings learned by ARP, shown by `ip neigh`, with a state like `REACHABLE` or `STALE` on each entry.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['C["C 10.77.0.30: ping 10.77.0.10"] --> tbl["Neighbour table: no entry for 10.77.0.10"]'],
				highlight: ['C', 'tbl'],
				note: 'The route for 10.77.0.10 has no `via`, so C must send the frame straight to that host. To write the Ethernet header, C needs the MAC for 10.77.0.10. After `ip neigh flush all`, C\'s table is empty.'
			},
			{
				add: ['C -->|"to ff:ff:ff:ff:ff:ff: who-has 10.77.0.10 tell 10.77.0.30"| A["A 10.77.0.10, MAC 56:2a:92:53:89:1c"]'],
				highlight: ['C', 'A'],
				note: 'C broadcasts an ARP request: a 42-byte frame, 14 bytes of Ethernet and 28 of ARP, with type `0x0806`. It carries C\'s own MAC and IP, and the IP it is looking for. The target MAC field is all zeros because C does not know it yet.'
			},
			{
				add: ['A -->|"to C only: 10.77.0.10 is-at 56:2a:92:53:89:1c"| C'],
				highlight: ['A'],
				note: 'A sees its own address in the target field and replies to C\'s MAC only, 73 microseconds later in the capture. A also stores C\'s MAC from the request. RFC 826 explains: "if A has some reason to talk to B, then B will probably have some reason to talk to A".'
			},
			{
				add: ['C --> state["ip neigh: 10.77.0.10 lladdr 56:2a:92:53:89:1c REACHABLE"]'],
				highlight: ['state'],
				note: 'C saves the reply, and `ip neigh` prints `REACHABLE`. 40 seconds later, with no new traffic, the same entry shows `STALE`, which the man page defines as "valid but suspicious". The default `reachable_time` in `arp.c` is 30 seconds.'
			},
			{
				add: ['B["B also has 10.77.0.10, MAC 32:ad:ae:a5:3f:f5"] -->|"reply 1"| C', 'A -.->|"reply 2, 1 µs later"| C'],
				highlight: ['B'],
				note: 'With the duplicate address, one request gets two replies. B answered at `.158318` and A at `.158319`. C kept B\'s MAC, so its frames for 10.77.0.10 now go to B. `arping -c 3` from C printed `Received 4 response(s)` for 3 probes, from two different MACs.'
			}
		]
	},
	example: {
		title: 'net/ipv4/arp.c: arp_process, answering a request and keeping the first reply',
		repo: 'torvalds/linux',
		url: `${ARP}#L840-L939`,
		lang: 'c',
		code: `	if (arp->ar_op == htons(ARPOP_REQUEST) &&
	    ip_route_input_noref(skb, tip, sip, 0, dev) == 0) {

		rt = skb_rtable(skb);
		addr_type = rt->rt_type;

		if (addr_type == RTN_LOCAL) {
			int dont_send;

			dont_send = arp_ignore(in_dev, sip, tip);
			if (!dont_send && IN_DEV_ARPFILTER(in_dev))
				dont_send = arp_filter(sip, tip, dev);
			if (!dont_send) {
				n = neigh_event_ns(&arp_tbl, sha, &sip, dev);
				if (n) {
					arp_send_dst(ARPOP_REPLY, ETH_P_ARP,
						     sip, dev, tip, sha,
						     dev->dev_addr, sha,
						     reply_dst);
					neigh_release(n);
				}
			}
			goto out_consume_skb;
…
	if (n) {
		int state = NUD_REACHABLE;
		int override;

		/* If several different ARP replies follows back-to-back,
		   use the FIRST one. It is possible, if several proxy
		   agents are active. Taking the first reply prevents
		   arp trashing and chooses the fastest router.
		 */
		override = time_after(jiffies,
				      n->updated +
				      NEIGH_VAR(n->parms, LOCKTIME)) ||
			   is_garp;

		/* Broadcast replies and request packets
		   do not assert neighbour reachability.
		 */
		if (arp->ar_op != htons(ARPOP_REPLY) ||
		    skb->pkt_type != PACKET_HOST)
			state = NUD_STALE;
		neigh_update(n, sha, state,
			     override ? NEIGH_UPDATE_F_OVERRIDE : 0, 0);
		neigh_release(n);
	}`,
		notes: [
			'Line 7 checks that the target IP `tip` is one of this host\'s own addresses. On B, after `ip addr add 10.77.0.10/24`, it is, so B answers just like A.',
			'Line 14 stores the requester\'s MAC `sha` for its IP `sip` before replying. Lines 16 to 19 send an `ARPOP_REPLY` back to `sha`, with this interface\'s MAC `dev->dev_addr` as the answer.',
			'Lines 34 to 37 set `override` only if more than `LOCKTIME` has passed since the entry last changed. The [default](' + ARP + '#L177) is `1 * HZ`, one second. A second reply 1 microsecond later cannot replace the first MAC.',
			'Lines 42 to 44 mark the entry `STALE` instead of `REACHABLE` when the packet is a request or a broadcast. The comment on lines 39 and 40: "Broadcast replies and request packets do not assert neighbour reachability."'
		]
	},
	tradeoff: {
		gain: [
			'No setup: C learned A\'s MAC with one request and one reply, 73 microseconds apart.',
			'A stored C\'s MAC from the request itself, so it can answer C\'s ping without asking for C\'s MAC first.'
		],
		cost: [
			'Any host on the link can answer for any address. The ARP packet has no field that proves who owns the IP, and C accepted B\'s reply for A\'s address.',
			'Every request is a broadcast: all hosts on the network receive the frame to `ff:ff:ff:ff:ff:ff` and look inside it.'
		]
	},
	task: {
		prompt: 'Here is the first ARP frame C sent, from `tcpdump -e -XX`. Decode the 28 bytes of ARP after the 14-byte Ethernet header: hardware type, protocol type, address lengths, operation, and the four addresses.\n\n`0x0000:  ffff ffff ffff c201 a766 6b1b 0806 0001`\n`0x0010:  0800 0604 0001 c201 a766 6b1b 0a4d 001e`\n`0x0020:  0000 0000 0000 0a4d 000a`',
		hint: 'Follow the field order in RFC 826 or `struct arphdr`: 2 bytes hardware type, 2 bytes protocol type, 1 byte each for the lengths, 2 bytes opcode, then sender MAC, sender IP, target MAC, target IP.',
		answer: [
			'Ethernet: destination `ff:ff:ff:ff:ff:ff` (broadcast), source `c2:01:a7:66:6b:1b`, type `0806`, ARP.',
			'`0001`: hardware type 1, Ethernet. `0800`: protocol IPv4. `06` and `04`: a MAC is 6 bytes, an IPv4 address 4. `0001`: opcode 1, a request. A reply has `0002`.',
			'Sender MAC `c2:01:a7:66:6b:1b`, sender IP `0a4d 001e` = 10.77.0.30. Target MAC all zeros, because C does not know it. Target IP `0a4d 000a` = 10.77.0.10.',
			'14 + 28 = 42 bytes, the `length 42` that tcpdump prints for every ARP frame on this network.'
		],
		steps: [
			{
				title: 'Read the Ethernet header',
				questions: [
					{ q: 'The destination MAC is `ffff ffff ffff`. What does that mean?', options: ['Broadcast: every host on the link receives the frame', 'The target is unknown and gets filled in later', 'The frame goes to the default gateway', 'The capture lost those bytes'], answer: 0, why: '`ff:ff:ff:ff:ff:ff` is the broadcast address. C does not know who owns the IP, so it asks everyone.' },
					{ q: 'Which MAC is the source?', options: ['`ff:ff:ff:ff:ff:ff`', '`c2:01:a7:66:6b:1b`, C\'s own MAC', '`08:06:00:01:08:00`', 'The MAC of 10.77.0.10'], answer: 1, why: 'The source MAC follows the destination: the six bytes `c201 a766 6b1b`, the interface of C.' },
					{ q: 'The type is `0806`. What follows?', options: ['An IPv4 packet', 'A frame of 2054 bytes', 'An ARP message', 'A TCP segment'], answer: 2, why: '`0x0806` is the type for ARP. IPv4 would be `0x0800`.' },
					{ q: 'Where do the 28 bytes of ARP start?', options: ['At the first `ffff`', 'At `0800` on the second line', 'At the first `0a4d`', 'At the `0001` right after `0806`'], answer: 3, why: 'The Ethernet header ends with the 2-byte type, so ARP begins on byte 14.' }
				]
			},
			{
				title: 'Decode the fixed fields',
				questions: [
					{ q: 'The first ARP field is `0001`. What is it?', options: ['Hardware type 1, Ethernet', 'Opcode 1, a request', 'Protocol IPv4', 'ARP version 1'], answer: 0, why: 'RFC 826 starts with the hardware type, and 1 means Ethernet. The opcode comes later and happens to be `0001` too.' },
					{ q: 'Next comes `0800`. What does it say?', options: ['The Ethernet type, repeated', 'The address being looked up is IPv4', '2048 bytes of ARP follow', 'The reply must go to port 2048'], answer: 1, why: 'The protocol type uses the same value as the Ethernet type for IPv4: C is resolving an IPv4 address.' },
					{ q: 'Then `06` and `04`. What are they?', options: ['6 addresses follow, 4 of them IPv4', 'ARP version 6.4', 'A MAC is 6 bytes and an IPv4 address is 4', 'Six retries, four seconds apart'], answer: 2, why: 'They are the hardware and protocol address lengths, so the receiver knows where each address ends.' },
					{ q: 'The opcode is `0001`. What kind of message is this?', options: ['A reply', 'A gratuitous announcement', 'The first retry of a request', 'A request'], answer: 3, why: 'Opcode 1 is a request and 2 is a reply.' }
				]
			},
			{
				title: 'Decode the four addresses',
				questions: [
					{ q: 'What is the sender MAC?', options: ['`c2:01:a7:66:6b:1b`', '`ff:ff:ff:ff:ff:ff`', '`00:00:00:00:00:00`', '`0a:4d:00:1e:00:00`'], answer: 0, why: 'It repeats the Ethernet source: C puts its own MAC inside the request.' },
					{ q: 'The sender IP is `0a4d 001e`. Which address is it?', options: ['10.77.0.10', '10.77.0.30', '10.77.0.1', '10.77.1.30'], answer: 1, why: '`0a` is 10, `4d` is 77, `00` is 0 and `1e` is 30: C\'s own address.' },
					{ q: 'Why is the target MAC all zeros?', options: ['Zeros are another way to write broadcast', 'The target host is down', 'The capture cut those bytes', 'C does not know it yet: that is what it asks for'], answer: 3, why: 'The request carries the IP it looks for and leaves the MAC empty. The reply fills it in.' },
					{ q: 'The target IP is `0a4d 000a`. Which address is it?', options: ['10.77.0.30', '10.77.0.0', '10.77.0.10', '10.77.0.255'], answer: 2, why: '`0a` is 10 in the last byte: C is looking for 10.77.0.10.' }
				]
			},
			{
				title: 'Check the size and the answer',
				questions: [
					{ q: 'How long is the whole frame?', options: ['28 bytes, all of it ARP', '64 bytes, padded', '42 bytes: 14 of Ethernet and 28 of ARP', '48 bytes: 20 of IP and 28 of ARP'], answer: 2, why: 'ARP sits right after Ethernet, with no IP header. tcpdump prints `length 42`.' },
					{ q: 'Who answers this request, and to which MAC?', options: ['A, to C\'s MAC only', 'A, to the broadcast address', 'Every host on the network', 'The gateway, on A\'s behalf'], answer: 0, why: 'A sees its own address in the target field and replies to the sender MAC from the request.' },
					{ q: 'Which opcode does the reply carry?', options: ['`0001`', '`0002`', '`0806`', '`0800`'], answer: 1, why: 'A reply has opcode 2.' },
					{ q: 'B also holds 10.77.0.10 and its reply arrives first. What does C keep?', options: ['A\'s MAC, because A had the address first', 'Both MACs, and it alternates between them', 'Nothing: the entry goes to `FAILED`', 'B\'s MAC, so its frames for 10.77.0.10 go to B'], answer: 3, why: 'Linux keeps the first reply, and a second one within `LOCKTIME` cannot override it. ARP has no field that proves who owns the IP.' }
				]
			}
		]
	},
	quiz: [
		{
			q: '`ip neigh` shows `10.0.0.7 dev eth0 INCOMPLETE`. What does that mean?',
			options: [
				'ARP requests went out for 10.0.0.7 and no reply has come back yet',
				'The MAC of 10.0.0.7 is known, but the host answers slowly',
				'No route exists for 10.0.0.7, so the kernel gave up',
				'The entry was set by hand and never expires'
			],
			answer: 0,
			why: 'The ip-neighbour man page: an incomplete entry "has not (yet) been validated/resolved". The kernel is waiting for an ARP reply. If the probes run out with no reply, the kernel sets the state to `FAILED`.'
		},
		{
			q: 'Which destination MAC does an ARP request use?',
			options: [
				'The MAC of the default gateway',
				'`ff:ff:ff:ff:ff:ff`, the broadcast address',
				'All zeros, because the target is unknown',
				'The MAC from the last entry in the neighbour table'
			],
			answer: 1,
			why: 'The sender does not know who owns the IP, so the request goes to every host on the link. The all-zero value goes in the target MAC field inside the ARP packet, and the Ethernet header carries the broadcast address.'
		},
		{
			q: 'Two hosts answer the same ARP request, 1 microsecond apart. Which MAC does a Linux client keep?',
			options: [
				'The second one, because a newer reply always replaces the old entry',
				'Neither: the kernel marks the entry `FAILED` until one host goes away',
				'Both, and the kernel alternates frames between the two MACs',
				'The first one: a reply within 1 second cannot override it'
			],
			answer: 3,
			why: '`arp_process` sets `override` only after `LOCKTIME` (1 second by default) has passed since the last update. The comment says: "If several different ARP replies follows back-to-back, use the FIRST one."'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Capture a real ARP exchange, decode it by hand, then create a duplicate address and watch who wins.',
		steps: [
			'Create a network and three containers that may change their own addresses: `docker network create --subnet 10.77.0.0/24 arplab`, then `for n in a b c; do docker run -d --name arp-$n --network arplab --cap-add NET_ADMIN nicolaka/netshoot:v0.13 sleep infinity; done`.',
			'Check the addresses with `for n in a b c; do docker exec arp-$n ip -br addr show eth0; done`. The steps below assume A got 10.77.0.2 and C got 10.77.0.4; use yours if they differ.',
			'From C, empty the neighbour table, capture the ARP between C and A, and ping A: `docker exec arp-c sh -c "ip neigh flush all; tcpdump -i eth0 -n -e -XX -c 2 arp host 10.77.0.2 and arp host 10.77.0.4 & sleep 1; ping -c1 10.77.0.2 >/dev/null; wait; ip neigh"`.',
			'Decode the 28 bytes of ARP in the request by hand, as in the task, then decode the reply the same way.',
			'Give B the same address as A, and ask again: `docker exec arp-b ip addr add 10.77.0.2/24 dev eth0`, then `docker exec arp-c sh -c "ip neigh flush all; timeout 3 tcpdump -i eth0 -n arp host 10.77.0.2 and arp host 10.77.0.4 & sleep 1; ping -c1 -W1 10.77.0.2 >/dev/null; wait; ip neigh"`.',
			'Run the conflict check from the hook: `docker exec arp-c arping -D -c 2 -I eth0 10.77.0.2; echo $?`. Then clean up: `docker rm -f arp-a arp-b arp-c && docker network rm arplab`.'
		],
		done: [
			'The request is 42 bytes long, has opcode `0001` and a target MAC of all zeros. The reply has opcode `0002`.',
			'After step 5, tcpdump shows one `who-has` line and two `is-at` lines with two different MACs.',
			'`ip neigh` on C holds the MAC from the first `is-at` line.',
			'`arping -D` exits with `1`.'
		],
		solution: [
			'Request: `0001 0800 0604 0001`, then C\'s MAC and `0a4d 0004` (10.77.0.4), six zero bytes, then `0a4d 0002` (10.77.0.2).',
			'Reply: the same layout with opcode `0002`, A\'s MAC and IP as the sender, and C\'s MAC and IP as the target. It goes to C\'s MAC, not to the broadcast address.',
			'With two owners, both kernels answer, and C keeps the first reply, because a second one within `LOCKTIME` cannot override it. Which container answers first can change from run to run.',
			'`arping -D` sends its probe from 0.0.0.0, and exits with 1 because a host answered: the address is already in use.'
		]
	},
	recall: {
		q: 'How does a host find the MAC for 10.77.0.10 on its own network, and where does it keep the answer?',
		a: 'It broadcasts an ARP request to `ff:ff:ff:ff:ff:ff`, the owner replies with its MAC, and the kernel stores it in the neighbour table shown by `ip neigh`, first as `REACHABLE`, later `STALE`.'
	},
	sources: [
		{ title: 'RFC 826, An Ethernet Address Resolution Protocol', url: 'https://www.rfc-editor.org/rfc/rfc826' },
		{ title: 'RFC 5227, IPv4 Address Conflict Detection', url: 'https://www.rfc-editor.org/rfc/rfc5227' },
		{ title: 'ip-neighbour(8) manual page', url: 'https://man7.org/linux/man-pages/man8/ip-neighbour.8.html' },
		{ title: 'arping(8) manual page', url: 'https://man7.org/linux/man-pages/man8/arping.8.html' },
		{ title: 'Linux source, include/uapi/linux/if_arp.h (struct arphdr)', url: `${LINUX}/include/uapi/linux/if_arp.h#L145-L162` }
	]
};
