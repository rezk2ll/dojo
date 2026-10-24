const GO = 'https://github.com/golang/go/blob/c3a068eec992b5ae783abce1a9d03f617b671ea2';
const NETIP = `${GO}/src/net/netip/netip.go`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'ip-and-cidr',
	part: 'Packets',
	title: 'IP addresses and CIDR',
	minutes: 10,
	hook: [
		'You create an AWS subnet `10.0.0.0/28` for a few build machines. A `/28` holds 16 addresses, but only 11 of them can go to instances. The AWS docs: "The first four IP addresses and the last IP address in each subnet CIDR block are not available for your use".',
		'The 16 comes from the `/28`. An IPv4 address has 32 bits, and the first 28 name the network. **The 4 bits left over number the hosts: 2^4 = 16.** A `/24` leaves 8 bits, so 256 addresses, and a `/16` leaves 16 bits, so 65,536.',
		'RFC 1918 sets aside three prefixes for private networks: `10/8`, `172.16/12` and `192.168/16`. `172.16/12` runs from 172.16.0.0 to 172.31.255.255, so Docker\'s default 172.17.0.0/16 is private and 172.32.0.1 is a public address.'
	],
	terms: [
		{ term: 'Prefix', def: 'An address followed by a slash and a number from 0 to 32, like `10.0.0.0/28`. The number says how many leading bits name the network. This notation is called CIDR.' },
		{ term: 'Host bits', def: 'The bits after the prefix length. With n host bits, the prefix holds 2^n addresses.' },
		{ term: 'Network address', def: 'The first address of a prefix, with every host bit at 0. `100.68.0.18/18` and `100.68.0.0/18` name the same network.' },
		{ term: 'Private address', def: 'An address in one of the three RFC 1918 blocks. Routers on the internet are expected to drop routes to them, so the same block can be reused in every company.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['host["Container eth0: 172.17.0.5/16"] --> mask["16 network bits: 172.17, 16 host bits: 0.5"]'],
				highlight: ['host', 'mask'],
				note: '`ip addr` in a Docker container prints `inet 172.17.0.5/16`. The first 16 bits, 172.17, name the network. The last 16 bits number this host. The network holds 2^16 = 65,536 addresses, from 172.17.0.0 to 172.17.255.255.'
			},
			{
				add: ['mask -->|"to 172.17.200.9"| same["First 16 bits equal: 172.17 = 172.17"]', 'same --> direct["Sent straight out of eth0"]'],
				highlight: ['same', 'direct'],
				note: 'For 172.17.200.9, the kernel compares the first 16 bits with its own: both are 172.17. `ip route get 172.17.200.9` prints `dev eth0 src 172.17.0.5` with no `via`. The packet goes straight to that machine on the local network.'
			},
			{
				add: ['mask -->|"to 172.18.0.1"| diff["First 16 bits differ: 172.18 is not 172.17"]', 'diff --> gw["Sent to the gateway 172.17.0.1"]'],
				highlight: ['diff', 'gw'],
				note: 'For 172.18.0.1, the second byte differs, so the address is outside the `/16`. `ip route get 172.18.0.1` prints `via 172.17.0.1 dev eth0`. The packet goes to the gateway, which knows where to send it next (day 3).'
			},
			{
				add: ['wide["Same host with a /12 mask: 172.16.0.0 to 172.31.255.255"] -.->|"to 172.18.0.1"| wrong["Looks local: no gateway, nobody answers"]'],
				highlight: ['wide', 'wrong'],
				note: 'With a prefix length that is too short, more addresses look local. A `/12` puts 172.18.0.1 inside the host\'s own network, so the host would try to reach it directly on `eth0` instead of through the gateway. If that machine sits behind a router, the packet never gets there.'
			}
		]
	},
	example: {
		title: 'src/net/netip/netip.go: Prefix.Contains, a prefix test in one XOR and one shift',
		repo: 'golang/go',
		url: `${NETIP}#L1417-L1447`,
		lang: 'go',
		code: `// Contains reports whether the network p includes ip.
//
// An IPv4 address will not match an IPv6 prefix.
// An IPv4-mapped IPv6 address will not match an IPv4 prefix.
// A zero-value IP will not match any prefix.
// If ip has an IPv6 zone, Contains returns false,
// because Prefixes strip zones.
func (p Prefix) Contains(ip Addr) bool {
	if !p.IsValid() || ip.hasZone() {
		return false
	}
	if f1, f2 := p.ip.BitLen(), ip.BitLen(); f1 == 0 || f2 == 0 || f1 != f2 {
		return false
	}
	if ip.Is4() {
		// xor the IP addresses together; mismatched bits are now ones.
		// Shift away the number of bits we don't care about.
		// Shifts in Go are more efficient if the compiler can prove
		// that the shift amount is smaller than the width of the shifted type (64 here).
		// We know that p.bits is in the range 0..32 because p is Valid;
		// the compiler doesn't know that, so mask with 63 to help it.
		// Now truncate to 32 bits, because this is IPv4.
		// If all the bits we care about are equal, the result will be zero.
		return uint32((ip.addr.lo^p.ip.addr.lo)>>((32-p.Bits())&63)) == 0
	} else {
		// xor the IP addresses together.
		// Mask away the bits we don't care about.
		// If all the bits we care about are equal, the result will be zero.
		return ip.addr.xor(p.ip.addr).and(mask6(p.Bits())).isZero()
	}
}`,
		notes: [
			'Line 12 returns false when the two bit lengths differ: an IPv4 address (32 bits) never matches an IPv6 prefix (128 bits), even `::ffff:172.17.0.5`, as line 4 says.',
			'Line 24 XORs the address with the prefix, which sets every differing bit to 1, then shifts out the host bits. For `172.16.0.0/12` and 172.31.255.9, the XOR is `0x000FFF09`. Shifting right by 32 - 12 = 20 bits gives 0, so the address is inside.',
			'For 172.32.0.1 the XOR is `0x00300001`, because 32 XOR 16 is 48, or `0x30`. Shifted by 20 bits it gives 3. Any result other than 0 means the address is outside. A test program on Go 1.24 prints `172.16.0.0/12 Contains 172.32.0.1 false`.',
			'The shift also drops host bits stored in the prefix. `netip.MustParsePrefix("100.68.0.18/18")` keeps the `.18`, still contains 100.68.63.255 and not 100.68.64.0, and its [`Masked()`](' + NETIP + '#L1408-L1415) is `100.68.0.0/18`. AWS rewrites a subnet given as 100.68.0.18/18 to that same canonical form.'
		]
	},
	tradeoff: {
		gain: [
			'A prefix can be any power of two in size. RFC 4632: prefixes "may be defined to describe any power of two-sized block of between one and 2^32 end system addresses".',
			'Testing whether an address is in a prefix costs one XOR and one shift (line 24), whatever the prefix length.'
		],
		cost: [
			'A team that needs 300 addresses gets a `/23` with 512, because a `/24` holds only 256 and no size sits between them.',
			'Every company can use the same RFC 1918 blocks. When two of them connect their networks, RFC 1918 warns "there is a risk that address uniqueness would be violated", and it recommends picking sub-blocks at random to lower that risk.'
		]
	},
	task: {
		prompt: 'Your team is given `10.20.0.0/20` for Kubernetes nodes on AWS. How many addresses does it hold, and what is the last one? Is `10.20.17.4` inside it? Split it into four equal subnets, one per availability zone, and say how many addresses AWS leaves usable in each.',
		hint: 'A `/20` leaves 12 host bits. In the third byte, the network uses the top 4 bits, so it moves in steps of 16. Four equal parts need 2 more network bits.',
		answer: [
			'32 - 20 = 12 host bits, so 2^12 = 4096 addresses: 10.20.0.0 to 10.20.15.255.',
			'`10.20.17.4` is outside: the third byte 17 is above 15. It belongs to the next `/20`, 10.20.16.0/20.',
			'Four parts need 2 more bits, so four `/22`: 10.20.0.0/22, 10.20.4.0/22, 10.20.8.0/22 and 10.20.12.0/22, with 1024 addresses each.',
			'AWS reserves 5 addresses per subnet (the first four and the last), so each `/22` leaves 1024 - 5 = 1019 for nodes.'
		],
		steps: [
			{
				title: 'Count the addresses',
				questions: [
					{ q: 'How many host bits does a `/20` leave?', options: ['20', '8', '12', '16'], answer: 2, why: 'An IPv4 address has 32 bits, and 32 - 20 = 12 are left to number the hosts.' },
					{ q: 'How many addresses does `10.20.0.0/20` hold?', options: ['1024', '4096', '2048', '65,536'], answer: 1, why: 'With 12 host bits, the prefix holds 2^12 = 4096 addresses.' },
					{ q: 'In the third byte, how do `/20` blocks move?', options: ['In steps of 16: 0, 16, 32 and so on', 'In steps of 20: 0, 20, 40 and so on', 'In steps of 4: 0, 4, 8 and so on', 'In steps of 8: 0, 8, 16 and so on'], answer: 0, why: 'The network takes the top 4 bits of the third byte. The low 4 bits count 0 to 15, so a new block starts every 16.' },
					{ q: 'What is the last address of `10.20.0.0/20`?', options: ['10.20.0.255', '10.20.20.255', '10.20.255.255', '10.20.15.255'], answer: 3, why: 'The third byte runs from 0 to 15 inside this block, and the last address has every host bit at 1.' }
				]
			},
			{
				title: 'Test 10.20.17.4',
				questions: [
					{ q: 'Is `10.20.17.4` inside `10.20.0.0/20`?', options: ['Yes: it starts with 10.20', 'No: its third byte, 17, is above 15', 'Yes: the block covers all of 10.20', 'No: it is not a private address'], answer: 1, why: 'The block ends at 10.20.15.255. Matching the first two bytes is not enough when the prefix reaches into the third.' },
					{ q: 'Which `/20` holds `10.20.17.4`?', options: ['10.20.17.0/20', '10.20.0.0/20', '10.20.16.0/20', '10.20.32.0/20'], answer: 2, why: '`/20` blocks start at multiples of 16 in the third byte, and 17 falls between 16 and 31.' },
					{ q: 'A node is set up by mistake as `10.20.0.5/12`. Where does it send a packet for `10.20.17.4`?', options: ['To the gateway, as with the `/20`', 'Straight out of `eth0`, because the `/12` makes the address look local', 'Nowhere: the kernel refuses a `/12` on a private address', 'To the gateway, because 17 is above 15'], answer: 1, why: 'A `/12` covers 10.16.0.0 to 10.31.255.255, so 10.20.17.4 looks local. The kernel tries to reach it on `eth0` with no gateway, and if it sits behind a router nobody answers.' },
					{ q: 'Under RFC 1918, is `10.20.17.4` private?', options: ['No: only 192.168 addresses are private', 'No: 10.20 belongs to AWS', 'Yes: every address AWS hands out is private', 'Yes: it is inside `10/8`'], answer: 3, why: 'RFC 1918 sets aside `10/8`, `172.16/12` and `192.168/16`. Anything that starts with 10 is in the first one.' }
				]
			},
			{
				title: 'Split it into four',
				questions: [
					{ q: 'How many more network bits do four equal parts need?', options: ['1', '4', '2', '3'], answer: 2, why: '2 bits give 2^2 = 4 combinations, one per part.' },
					{ q: 'What prefix length does each part get?', options: ['`/24`', '`/22`', '`/18`', '`/21`'], answer: 1, why: '20 + 2 = 22. A longer prefix means a smaller block, so `/18` goes the wrong way.' },
					{ q: 'How many addresses does each part hold?', options: ['1024', '512', '256', '2048'], answer: 0, why: 'A `/22` leaves 32 - 22 = 10 host bits, and 2^10 = 1024. Four of them make the 4096.' },
					{ q: 'Which list is the four subnets?', options: ['10.20.0.0/22, 10.20.1.0/22, 10.20.2.0/22, 10.20.3.0/22', '10.20.0.0/22, 10.20.16.0/22, 10.20.32.0/22, 10.20.48.0/22', '10.20.0.0/22, 10.20.64.0/22, 10.20.128.0/22, 10.20.192.0/22', '10.20.0.0/22, 10.20.4.0/22, 10.20.8.0/22, 10.20.12.0/22'], answer: 3, why: 'Each `/22` spans 4 values of the third byte, so the starts move by 4 and the last one ends at 10.20.15.255.' }
				]
			},
			{
				title: 'Apply the AWS reservation',
				questions: [
					{ q: 'Which addresses does AWS keep in `10.20.4.0/22`?', options: ['10.20.4.0 and 10.20.7.255', '10.20.4.0 to 10.20.4.4', '10.20.4.0 to 10.20.4.3, and 10.20.7.255', '10.20.4.0 to 10.20.4.3, and 10.20.4.255'], answer: 2, why: 'AWS keeps the first four addresses and the last one of each subnet. A `/22` spans 4 values of the third byte, 4 to 7, so its last address is 10.20.7.255, not 10.20.4.255.' },
					{ q: 'How many addresses are left for nodes in each `/22`?', options: ['1024', '1019', '1022', '1020'], answer: 1, why: '1024 - 5 = 1019.' },
					{ q: 'How many node addresses do the four subnets give in total?', options: ['4076', '4096', '4091', '4080'], answer: 0, why: '4 × 1019 = 4076.' },
					{ q: 'Why does the split cost addresses compared with one big subnet?', options: ['A `/22` cannot use its own network address', 'Kubernetes keeps one address per zone', 'Subnets must leave a gap between them', 'Each subnet loses 5 reserved addresses of its own'], answer: 3, why: 'The reservation applies per subnet: one `/20` loses 5, four `/22` lose 20.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'How many addresses does a `/26` hold?',
			options: ['26', '64', '256', '1024'],
			answer: 1,
			why: 'A `/26` uses 26 of the 32 bits for the network and leaves 6 host bits. 2^6 = 64 addresses.'
		},
		{
			q: 'Which of these addresses is private under RFC 1918?',
			options: ['172.32.0.10', '192.169.1.1', '172.31.200.4', '11.0.0.1'],
			answer: 2,
			why: '`172.16/12` keeps the top 4 bits of the second byte fixed, so it covers 172.16 to 172.31. 172.32 is the first value past it, 192.169 is past `192.168/16`, and 11 is past `10/8`.'
		},
		{
			q: 'A host is configured as `192.168.1.73/24`. Where does it send a packet for `192.168.2.10`?',
			options: [
				'Straight out of its interface, because both addresses are private',
				'To its gateway, because the third byte differs from its own',
				'Nowhere: the kernel rejects private destinations outside its own /24',
				'Straight out, because the first two bytes match its own address'
			],
			answer: 1,
			why: 'With `/24`, the first 3 bytes name the network, and 192.168.2 is not 192.168.1. The kernel sends packets outside its own prefix to the gateway. The RFC 1918 block plays no part in this choice, only the host\'s own `/24` does.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Check the task\'s subnet math with Python, then watch the kernel use a prefix to choose between direct delivery and the gateway.',
		steps: [
			'Count and split the block: `python3 -c \'import ipaddress as ip; n = ip.ip_network("10.20.0.0/20"); print(n.num_addresses, n[-1], ip.ip_address("10.20.17.4") in n); [print(s, s.num_addresses - 5) for s in n.subnets(new_prefix=22)]\'`.',
			'Start a container with no network and the right to configure one: `docker run --rm -it --network none --cap-add NET_ADMIN nicolaka/netshoot:v0.13`.',
			'Inside it, give an interface a node address from the block, and a gateway: `ip link add eth0 type bridge && ip link set eth0 up && ip addr add 10.20.0.5/20 dev eth0 && ip route add default via 10.20.0.1`.',
			'Ask the kernel about both sides of the edge: `ip route get 10.20.15.200`, then `ip route get 10.20.17.4`.',
			'Give the same address a prefix that is too short: `ip addr del 10.20.0.5/20 dev eth0 && ip addr add 10.20.0.5/12 dev eth0`, then run `ip route get 10.20.17.4` again. Type `exit` to leave.'
		],
		done: [
			'Python prints `4096 10.20.15.255 False`, then four `/22` lines that each end in `1019`.',
			'`ip route get 10.20.15.200` shows `dev eth0` with no `via`.',
			'`ip route get 10.20.17.4` shows `via 10.20.0.1` with the `/20`, and no `via` with the `/12`.'
		],
		solution: [
			'`num_addresses` is 2^12. `n[-1]` is the address with every host bit at 1. `in` runs the same prefix test as Go\'s `Prefix.Contains`.',
			'`subnets(new_prefix=22)` adds the 2 bits, and `- 5` applies the AWS reservation.',
			'With the `/20`, 10.20.17.4 is outside the node\'s network, so the packet goes to the gateway. With the `/12`, it looks local, and the kernel would try to reach it straight on `eth0`: the mistake from the last step of the diagram.'
		]
	},
	recall: {
		q: 'How many addresses are in a `/28`, and how many can an AWS instance use?',
		a: '16, from 4 host bits. AWS keeps the first four and the last one, so 11 are usable.'
	},
	sources: [
		{ title: 'RFC 1918, Address Allocation for Private Internets', url: 'https://www.rfc-editor.org/rfc/rfc1918' },
		{ title: 'RFC 4632, Classless Inter-domain Routing (CIDR)', url: 'https://www.rfc-editor.org/rfc/rfc4632' },
		{ title: 'AWS VPC User Guide, Subnet CIDR blocks', url: 'https://docs.aws.amazon.com/vpc/latest/userguide/subnet-sizing.html' },
		{ title: 'Go source, src/net/netip/netip.go (Addr.IsPrivate)', url: `${NETIP}#L636-L664` }
	]
};
