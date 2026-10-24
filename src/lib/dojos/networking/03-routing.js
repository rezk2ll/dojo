const LINUX = 'https://github.com/torvalds/linux/blob/70dd4ee72eb2d5793c62e71c14e3aba78e5a4e56';
const TRIE = `${LINUX}/net/ipv4/fib_trie.c`;
const TRIE_DOC = `${LINUX}/Documentation/networking/fib_trie.rst`;
const SEMANTICS = `${LINUX}/net/ipv4/fib_semantics.c`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'routing',
	part: 'Packets',
	title: 'Routing tables',
	minutes: 10,
	hook: [
		'Your machine has the route `10.0.0.0/8 via 172.17.0.1`, the way to the office network. A colleague adds a test bridge `br0` with the address 10.1.0.1/16. From then on, the database at 10.1.2.3 stops answering, while 10.2.0.5 still works.',
		'`ip route get 10.1.2.3` shows why: `10.1.2.3 dev br0 src 10.1.0.1`. Adding the address created a second route, `10.1.0.0/16 dev br0`. Both routes contain 10.1.2.3, and **the kernel picks the route with the longest prefix: 16 bits beat 8.** The packets now go out of an empty bridge instead of to the gateway.'
	],
	terms: [
		{ term: 'Routing table', def: 'The list of routes the kernel reads to decide where an outgoing packet goes. `ip route` prints it. Each route is a prefix and where to send packets for it.' },
		{ term: 'Next hop', def: 'The router a packet is handed to, shown as `via 172.17.0.1`. A route with no `via` means the destination is on that link and gets the packet directly.' },
		{ term: 'Default route', def: 'The route for `0.0.0.0/0`, printed as `default`. It contains every address, with a prefix length of 0, so it is used only when no other route matches.' },
		{ term: 'Longest prefix match', def: 'The rule for choosing between routes that contain the destination: the one with the largest prefix length wins.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['app["App sends to 10.1.2.3"] --> fib["Kernel routing table: 4 routes"]'],
				highlight: ['app', 'fib'],
				note: '`ip route` in the container lists 4 routes: `default via 172.17.0.1`, `10.0.0.0/8 via 172.17.0.1`, `10.1.0.0/16 dev br0` and `172.17.0.0/16 dev eth0`. The kernel looks up 10.1.2.3 in this table before any byte leaves.'
			},
			{
				add: ['fib --> keep["Contain 10.1.2.3: default /0, 10.0.0.0/8, 10.1.0.0/16"]', 'fib -.->|"discarded"| drop["172.17.0.0/16: does not contain it"]'],
				highlight: ['keep', 'drop'],
				note: 'RFC 1812 calls the first pass Basic Match: it "discards any routes to destinations other than the IP Destination Address of the packet". 172.17.0.0/16 cannot hold 10.1.2.3. Three routes remain, including the default route, which contains every address.'
			},
			{
				add: ['keep -->|"longest prefix: /16"| br["10.1.0.0/16 dev br0: sent on br0, no gateway"]'],
				highlight: ['br'],
				note: 'Longest Match keeps only the routes with the largest prefix length. /16 beats /8 and /0. `ip route get fibmatch 10.1.2.3` prints the winning route: `10.1.0.0/16 dev br0 proto kernel scope link`. There is no `via`, so the kernel will look for 10.1.2.3 directly on `br0` (day 4).'
			},
			{
				add: ['app2["App sends to 10.2.0.5"] --> eight["Only default /0 and 10.0.0.0/8 contain it"]', 'eight -->|"/8 wins"| gw["via 172.17.0.1 dev eth0"]'],
				highlight: ['app2', 'eight', 'gw'],
				note: '10.2.0.5 is outside 10.1.0.0/16, so only two routes contain it. /8 beats /0, and `ip route get 10.2.0.5` prints `via 172.17.0.1 dev eth0`, the same path as before the bridge existed.'
			},
			{
				add: ['app3["No default route, app sends to 1.1.1.1"] -->|"no route contains it"| err["sendto fails: Network unreachable"]'],
				highlight: ['app3', 'err'],
				note: 'After `ip route del default`, no route contains 1.1.1.1. `ip route get 1.1.1.1` prints `RTNETLINK answers: Network unreachable`, and `ping` fails with `sendto: Network unreachable`. The error comes from the local kernel, and no packet is sent.'
			}
		]
	},
	example: {
		title: 'net/ipv4/fib_trie.c: fib_table_lookup, the kernel\'s IPv4 route lookup',
		repo: 'torvalds/linux',
		url: `${TRIE}#L1418-L1613`,
		lang: 'c',
		code: `int fib_table_lookup(struct fib_table *tb, const struct flowi4 *flp,
		     struct fib_result *res, int fib_flags)
{
	struct trie *t = (struct trie *) tb->tb_data;
…
	const t_key key = ntohl(flp->daddr);
…
	/* Step 1: Travel to the longest prefix match in the trie */
	for (;;) {
		index = get_cindex(key, n);
…
	}

	/* Step 2: Sort out leaves and begin backtracing for longest prefix */
	for (;;) {
…
			/* strip the least significant bit from the cindex */
			cindex &= cindex - 1;
…
	}

found:
	/* this line carries forward the xor from earlier in the function */
	index = key ^ n->key;

	/* Step 3: Process the leaf, if that fails fall back to backtracing */
	hlist_for_each_entry_rcu(fa, &n->leaf, fa_list) {
		struct fib_info *fi = fa->fa_info;
…
		if ((BITS_PER_LONG > KEYLENGTH) || (fa->fa_slen < KEYLENGTH)) {
			if (index >= (1ul << fa->fa_slen))
				continue;
		}
…
		err = fib_props[fa->fa_type].error;
		if (unlikely(err < 0)) {
…
			return err;
		}
…
			res->prefix = htonl(n->key);
			res->prefixlen = KEYLENGTH - fa->fa_slen;`,
		notes: [
			'Line 6 turns the destination address into a 32-bit number, the key. For 10.1.2.3 that is `0x0A010203`. The routes are stored in a trie, a tree that branches on the bits of the key.',
			'Lines 8 to 11 walk down the trie to the most specific node for the key. If that node has no matching route, lines 14 to 18 back up. The [kernel docs](' + TRIE_DOC + '?plain=1#L129-L133) describe it: "The prefix length, starting out at the same as the key length, is reduced one step at a time".',
			'Line 31 is a prefix test. `fa_slen` is the number of host bits, 16 for a `/16`. The route matches only if the key and the route differ in the host bits alone, the same XOR test as Go\'s `Prefix.Contains` (day 2).',
			'Line 35 reads the error for the route\'s type. A normal route has 0. An `unreachable` route has [`-EHOSTUNREACH`](' + SEMANTICS + '#L117-L120), so a lookup can fail on purpose.',
			'Line 42 reports the prefix length of the winning route: 32 minus the host bits. `ip route get fibmatch` prints that route.'
		]
	},
	tradeoff: {
		gain: [
			'The 4 routes in the container are enough to reach the local network, the bridge, the office and the whole internet.',
			'A more specific route overrides a broader one without editing it. Adding `10.1.0.0/16` changed the path for 65,536 addresses and left the rest of `10.0.0.0/8` alone.'
		],
		cost: [
			'The bridge address took 10.1.2.3 away from the office route by accident, and neither `ip addr add` nor `ping` warned about it.',
			'`ping -c2 10.1.2.3` only prints `100% packet loss`. It does not say which route was used: you have to run `ip route get` to see `dev br0`.'
		]
	},
	task: {
		prompt: 'A node prints this `ip route`:\n\n`default via 172.17.0.1 dev eth0`\n`10.96.0.0/12 via 172.17.0.4 dev eth0`\n`10.244.0.0/24 dev br0 proto kernel scope link src 10.244.0.1`\n`10.244.0.0/16 via 172.17.0.3 dev eth0`\n`172.17.0.0/16 dev eth0 proto kernel scope link src 172.17.0.5`\n\nFor each destination, give the route that wins and where the packet goes: `10.244.0.17`, `10.244.3.9`, `10.100.0.10`, `10.112.0.1`.',
		hint: 'List every route that contains the address, then keep the longest prefix. A `/12` fixes the top 4 bits of the second byte, so `10.96.0.0/12` runs from 10.96 to 10.111.',
		answer: [
			'`10.244.0.17`: both `10.244.0.0/24` and `10.244.0.0/16` contain it, and /24 wins. It goes straight out of `br0`. `ip route get` prints `10.244.0.17 dev br0 src 10.244.0.1`.',
			'`10.244.3.9`: the third byte 3 is outside the `/24`, so `10.244.0.0/16` wins: `via 172.17.0.3 dev eth0`.',
			'`10.100.0.10`: 100 is between 96 and 111, so `10.96.0.0/12` wins: `via 172.17.0.4 dev eth0`.',
			'`10.112.0.1`: 112 is past 111, and only the default route contains it: `via 172.17.0.1 dev eth0`.'
		],
		steps: [
			{
				title: 'Read the table',
				questions: [
					{ q: 'Which addresses does `10.96.0.0/12` cover?', options: ['10.96.0.0 to 10.111.255.255', '10.96.0.0 to 10.96.255.255', '10.96.0.0 to 10.108.255.255', '10.0.0.0 to 10.255.255.255'], answer: 0, why: 'A `/12` fixes the top 4 bits of the second byte, so it spans 16 values: 96 to 111.' },
					{ q: 'Which routes have no `via`?', options: ['Only the default route', '`10.244.0.0/24` and `172.17.0.0/16`', '`10.96.0.0/12` and `10.244.0.0/16`', 'None of them'], answer: 1, why: 'A route with no `via` means the destination is on that link and gets the packet directly.' },
					{ q: 'Does the order of the lines change which route wins?', options: ['Yes: the first line that matches wins', 'Yes: the last line that matches wins', 'No: only the prefix length decides', 'Only for the default route'], answer: 2, why: 'Longest prefix match looks at every route that contains the address. The order `ip route` prints them in plays no part.' },
					{ q: 'What prefix length does the `default` route have?', options: ['32', '8', '0', '24'], answer: 2, why: '`default` is `0.0.0.0/0`. It contains every address but has the shortest prefix, so it wins only when nothing else matches.' }
				]
			},
			{
				title: 'Route 10.244.0.17',
				questions: [
					{ q: 'Which routes contain `10.244.0.17`?', options: ['`10.244.0.0/24`, `10.244.0.0/16` and the default', 'Only `10.244.0.0/24`', '`10.244.0.0/16` and `172.17.0.0/16`', 'Only the default route'], answer: 0, why: 'The `/24` covers 10.244.0.x, the `/16` covers 10.244.x.x, and the default covers everything.' },
					{ q: 'Which of them wins?', options: ['`10.244.0.0/16`, because it is listed after', '`10.244.0.0/24`', 'The default route', '`10.96.0.0/12`'], answer: 1, why: '24 is the largest prefix length of the three candidates.' },
					{ q: 'Where does the packet go?', options: ['To 172.17.0.3 on `eth0`', 'To 172.17.0.1 on `eth0`', 'To 10.244.0.1, as a gateway', 'Straight out of `br0`, with no gateway'], answer: 3, why: 'The winning route has no `via`, so the kernel delivers the packet directly on `br0`. 10.244.0.1 is the node\'s own address there.' },
					{ q: 'What does `ip route get 10.244.0.17` print?', options: ['`10.244.0.17 via 172.17.0.3 dev eth0`', '`10.244.0.17 dev br0 src 10.244.0.1`', '`RTNETLINK answers: Network unreachable`', '`10.244.0.17 via 172.17.0.1 dev eth0`'], answer: 1, why: 'It prints the route the kernel picked: `dev br0`, with the bridge address as the source.' }
				]
			},
			{
				title: 'Route 10.244.3.9 and 10.100.0.10',
				questions: [
					{ q: 'Is `10.244.3.9` inside `10.244.0.0/24`?', options: ['Yes: the first two bytes match', 'No: its third byte, 3, is outside the `/24`', 'Yes: a `/24` covers 10.244.0 to 10.244.3', 'No: a `/24` holds only one address'], answer: 1, why: 'A `/24` fixes the first three bytes, and 10.244.3 is not 10.244.0.' },
					{ q: 'So where does `10.244.3.9` go?', options: ['`via 172.17.0.3 dev eth0`', '`dev br0`', '`via 172.17.0.1 dev eth0`', '`via 172.17.0.4 dev eth0`'], answer: 0, why: '`10.244.0.0/16` and the default contain it, and /16 beats /0.' },
					{ q: 'Which route wins for `10.100.0.10`?', options: ['The default, because no line starts with 10.100', '`10.244.0.0/16`', '`10.96.0.0/12`, because 100 is between 96 and 111', '`172.17.0.0/16`'], answer: 2, why: 'A prefix covers a range, not a text match. 10.100 falls inside 10.96 to 10.111, and /12 beats /0.' },
					{ q: 'Where does `10.100.0.10` go?', options: ['`dev br0`', '`via 172.17.0.1 dev eth0`', '`via 172.17.0.3 dev eth0`', '`via 172.17.0.4 dev eth0`'], answer: 3, why: 'The winning `10.96.0.0/12` route hands the packet to 172.17.0.4.' }
				]
			},
			{
				title: 'Route 10.112.0.1, then check',
				questions: [
					{ q: 'Is `10.112.0.1` inside `10.96.0.0/12`?', options: ['Yes: 112 is close to 96', 'No: 112 is past 111', 'Yes: a `/12` covers 10.96 to 10.127', 'No: a `/12` covers only 10.96'], answer: 1, why: 'The block has 16 values, 96 to 111. 112 starts the next block.' },
					{ q: 'Where does `10.112.0.1` go?', options: ['Nowhere: no route contains it', '`via 172.17.0.4 dev eth0`', '`via 172.17.0.1 dev eth0`, the default route', '`dev br0`'], answer: 2, why: 'Only the default route contains it, so the packet goes to 172.17.0.1.' },
					{ q: 'With the default route deleted, what does `ip route get 10.112.0.1` print?', options: ['`RTNETLINK answers: Network unreachable`', '`10.112.0.1 via 172.17.0.4 dev eth0`', '`100% packet loss`', '`10.112.0.1 dev eth0 src 172.17.0.5`'], answer: 0, why: 'No route contains the address, so the local kernel fails the lookup and sends nothing.' },
					{ q: 'Which command shows the table line that matched?', options: ['`ip neigh show 10.112.0.1`', '`ping -c1 10.112.0.1`', '`ip addr show to 10.112.0.1`', '`ip route get fibmatch 10.112.0.1`'], answer: 3, why: '`ip route get` shows the route as the kernel sees it, and `fibmatch` prints the matched line from the table.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'The table has `10.0.0.0/8 via A`, `10.20.0.0/16 via B` and `default via C`. Where does a packet for 10.20.5.1 go?',
			options: [
				'To A, because 10.0.0.0/8 is listed first',
				'To B, because /16 is the longest prefix that contains it',
				'To C, because the default route is always tried first',
				'To A and B in turn, sharing the load between them'
			],
			answer: 1,
			why: 'Every route whose prefix contains 10.20.5.1 is a candidate, and the kernel keeps the one with the largest prefix length. The order of the lines in `ip route` plays no part.'
		},
		{
			q: '`ping 1.1.1.1` fails at once with `sendto: Network unreachable`. What does that tell you?',
			options: [
				'A router on the way sent back an error for 1.1.1.1',
				'1.1.1.1 is down and refused the ICMP echo request',
				'No local route contains 1.1.1.1, so nothing was sent',
				'The DNS server could not resolve the name 1.1.1.1'
			],
			answer: 2,
			why: 'The error comes from the local kernel at `sendto`: the route lookup found no match, often because the default route is missing. `ip route get 1.1.1.1` prints the same error.'
		},
		{
			q: 'Which command shows the route the kernel picks for 10.1.2.3?',
			options: ['`ip route get 10.1.2.3`', '`ip neigh show 10.1.2.3`', '`ping -c1 10.1.2.3`', '`ip addr show to 10.1.2.3`'],
			answer: 0,
			why: 'The ip-route man page says `ip route get` "gets a single route to a destination and prints its contents exactly as the kernel sees it". Add `fibmatch` to see the matched route line from the table.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Build the task\'s routing table in a container and let the kernel check your four answers.',
		steps: [
			'Start a container with no network and the right to change its routes: `docker run --rm -it --network none --cap-add NET_ADMIN nicolaka/netshoot:v0.13`.',
			'Create the task\'s two interfaces: `ip link add eth0 type bridge && ip link set eth0 up && ip addr add 172.17.0.5/16 dev eth0`, then `ip link add br0 type bridge && ip link set br0 up && ip addr add 10.244.0.1/24 dev br0`.',
			'Add the three routes that use a gateway: `ip route add default via 172.17.0.1 && ip route add 10.96.0.0/12 via 172.17.0.4 && ip route add 10.244.0.0/16 via 172.17.0.3`. Run `ip route` and compare with the task.',
			'Write your four answers down, then check them: `for a in 10.244.0.17 10.244.3.9 10.100.0.10 10.112.0.1; do ip route get fibmatch $a; done`.',
			'Delete the default route with `ip route del default`, then run `ip route get 10.112.0.1` and `ping -c1 10.112.0.1`. Type `exit` to leave.'
		],
		done: [
			'`ip route` prints the same five routes as the task.',
			'The four `fibmatch` lines are `10.244.0.0/24 dev br0 ...`, `10.244.0.0/16 via 172.17.0.3 dev eth0`, `10.96.0.0/12 via 172.17.0.4 dev eth0` and `default via 172.17.0.1 dev eth0`.',
			'Without the default route, `ip route get 10.112.0.1` prints `RTNETLINK answers: Network unreachable`.'
		],
		solution: [
			'The kernel keeps every route that contains the address, then the longest prefix: /24 beats /16 for 10.244.0.17, and /16 wins for 10.244.3.9.',
			'10.100 is inside `10.96.0.0/12` (10.96 to 10.111), and 10.112 is not, so only the default route catches 10.112.0.1.',
			'With no default route, `ping` fails at once with `Network unreachable`: the local kernel found no route and sent no packet.'
		]
	},
	recall: {
		q: 'Routes `10.0.0.0/8 via 172.17.0.1` and `10.1.0.0/16 dev br0` both contain 10.1.2.3. Which one does the kernel use, and why?',
		a: '`10.1.0.0/16 dev br0`, because longest prefix match keeps the largest prefix length: 16 beats 8.'
	},
	sources: [
		{ title: 'RFC 1812, Requirements for IP Version 4 Routers, section 5.2.4.3', url: 'https://www.rfc-editor.org/rfc/rfc1812#section-5.2.4.3' },
		{ title: 'ip-route(8) manual page', url: 'https://man7.org/linux/man-pages/man8/ip-route.8.html' },
		{ title: 'Linux kernel docs, LC-trie implementation notes (fib_trie.rst)', url: TRIE_DOC },
		{ title: 'Linux source, net/ipv4/fib_semantics.c (fib_props)', url: `${SEMANTICS}#L88-L137` }
	]
};
