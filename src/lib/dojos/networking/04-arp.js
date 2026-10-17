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
