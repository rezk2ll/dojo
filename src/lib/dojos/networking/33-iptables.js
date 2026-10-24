const MOBY = 'https://github.com/moby/moby/blob/3f38b15147b14ce0ce7b11558a1aa9e9f14db103/daemon/libnetwork/drivers/bridge/internal/nftabler/testdata/TestNftabler';
const GOLDEN = `${MOBY}/hairpin=false,internal=false,icc=true,masq=true,snat=false,gwm=nat,bindlh=false__ip.golden`;
const LINUX = 'https://github.com/torvalds/linux/blob/70dd4ee72eb2d5793c62e71c14e3aba78e5a4e56';
const DOCKER_NFT = 'https://docs.docker.com/engine/network/firewall-nftables/';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'iptables',
	part: 'Debugging the network',
	title: 'Packet filtering with iptables and nftables',
	minutes: 10,
	hook: [
		'You enable ufw on a Docker host and allow only port 22. Then you run `docker run -p 8080:80 nginx`. From another machine, `curl http://host:8080/` returns the nginx page.',
		'The Docker docs explain it: "packets are diverted before it reaches the INPUT and OUTPUT chains that ufw uses". Docker rewrites the destination to the container address at the prerouting hook. The kernel then forwards the packet to the bridge, and the input hook where ufw filters never runs.',
		'The kernel runs filter rules at fixed points on the path of each packet. Which point a rule sits at, and whether it drops or rejects, decides what the client sees.'
	],
	terms: [
		{ term: 'Netfilter hook', def: 'A fixed point in the kernel\'s packet path where rules run, such as prerouting, input, forward, output and postrouting. iptables and nftables both attach their rules to these hooks.' },
		{ term: 'Base chain', def: 'An nftables chain attached to a hook with a type and a priority, such as `type filter hook forward priority filter`. Lower priority numbers run first at the same hook.' },
		{ term: 'Drop', def: 'A verdict that discards the packet and sends nothing back. In nftables it ends the evaluation of the whole ruleset at once.' },
		{ term: 'Reject', def: 'A statement that sends an error back (an ICMP port unreachable by default, or a TCP RST with `tcp reset`) and then drops the packet.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['pkt["SYN to the host, port 8080, on eth0"] --> raw["prerouting, priority raw: raw-PREROUTING"]'],
				highlight: ['pkt', 'raw'],
				note: 'The packet first meets Docker\'s `raw-PREROUTING` chain, which drops packets sent straight to the container address 192.168.0.2 from another interface. This one is addressed to the host, so it passes. Connection tracking runs next, at priority -200.'
			},
			{
				add: ['raw --> dnat["prerouting, priority dstnat: dnat to 192.168.0.2:80"]'],
				highlight: ['dnat'],
				note: 'At priority `dstnat` (-100), the rule for published port 8080 rewrites the destination to 192.168.0.2 port 80. The nft manual on NAT: "All future packets in this connection will also be mangled."'
			},
			{
				add: ['dnat --> route{"routing: is 192.168.0.2 a local address?"}', 'route -.->|"yes"| input["input hook: ufw rules"]', 'route -->|"no: forward to the bridge"| fwd["forward hook: filter-FORWARD"]'],
				highlight: ['route', 'fwd'],
				note: 'The routing decision uses the new destination. 192.168.0.2 is the container address on the bridge network, so the packet takes the forward hook. The input hook, where ufw keeps its rules, never sees it.'
			},
			{
				add: ['fwd --> br["filter-forward-in__br-dummy: accept tcp dport 80"]', 'br --> ctr["container 192.168.0.2:80"]'],
				highlight: ['br', 'ctr'],
				note: 'Docker\'s per-bridge chain accepts packets to the published container port 80 and drops the rest with the comment "UNPUBLISHED PORT DROP". The SYN reaches nginx, and the client gets the page.'
			},
			{
				add: ['br -.->|"tcp dport 22: drop"| silent["client: no reply, SYN resent, connect fails after 131 s"]', 'br -.->|"if the rule were: reject with tcp reset"| refused["client: RST, connect fails at once"]'],
				highlight: ['silent', 'refused'],
				note: 'A dropped SYN gets no answer. The client resends it 6 times by default and gives up after 131 seconds, according to the kernel `tcp_syn_retries` docs. A rejected SYN gets a TCP RST, and `connect()` fails within one round trip with "Connection refused".'
			}
		]
	},
	example: {
		title: 'moby nftabler testdata: the nftables ruleset Docker writes for one bridge with port 8080 published',
		repo: 'moby/moby',
		url: `${GOLDEN}#L22-L71`,
		lang: 'shell',
		code: `	chain filter-FORWARD {
		type filter hook forward priority filter; policy accept;
		oifname vmap @filter-forward-in-jumps
		iifname vmap @filter-forward-out-jumps
	}

	chain nat-OUTPUT {
		type nat hook output priority dstnat; policy accept;
		ip daddr != 127.0.0.0/8 fib daddr type local counter packets 0 bytes 0 jump nat-prerouting-and-output
	}

	chain nat-POSTROUTING {
		type nat hook postrouting priority srcnat; policy accept;
		iifname vmap @nat-postrouting-out-jumps
		oifname vmap @nat-postrouting-in-jumps
	}

	chain nat-PREROUTING {
		type nat hook prerouting priority dstnat; policy accept;
		fib daddr type local counter packets 0 bytes 0 jump nat-prerouting-and-output
	}

	chain nat-prerouting-and-output {
		iifname != "br-dummy" tcp dport 8080 counter packets 0 bytes 0 dnat to 192.168.0.2:80 comment "DNAT"
	}

	chain raw-PREROUTING {
		type filter hook prerouting priority raw; policy accept;
		ip daddr 192.168.0.2 iifname != "br-dummy" counter packets 0 bytes 0 drop comment "DROP DIRECT ACCESS"
	}

	chain filter-forward-in__br-dummy {
		ct state established,related counter packets 0 bytes 0 accept
		iifname "br-dummy" counter packets 0 bytes 0 accept comment "ICC"
		ip daddr 192.168.0.2 tcp dport 80 counter packets 0 bytes 0 accept
		counter packets 0 bytes 0 drop comment "UNPUBLISHED PORT DROP"
	}

	chain filter-forward-out__br-dummy {
		ct state established,related counter packets 0 bytes 0 accept
		counter packets 0 bytes 0 accept comment "OUTGOING"
	}

	chain nat-postrouting-in__br-dummy {
	}

	chain nat-postrouting-out__br-dummy {
		oifname != "br-dummy" ip saddr 192.168.0.0/24 counter packets 0 bytes 0 masquerade comment "MASQUERADE"
	}`,
		notes: [
			'This file is a test golden file in the moby repo: the ruleset dockerd is expected to write for one bridge, `br-dummy`, with host port 8080 published to 192.168.0.2:80. Lines 2, 8, 13, 19 and 28 attach base chains to the forward, output, postrouting and prerouting hooks.',
			'Line 20 jumps only for packets whose destination is a local address (`fib daddr type local`). Line 24 then rewrites TCP port 8080 to 192.168.0.2:80. Line 9 does the same for packets sent by the host itself, which take the output hook instead of prerouting.',
			'Line 29 runs at priority `raw` (-300), before conntrack. It drops packets addressed straight to the container from outside the bridge. The [Docker docs](' + DOCKER_NFT + ') note that "Because a drop is final, a rule in one of your own tables cannot allow them."',
			'Lines 33 to 36 are the filter for traffic into the bridge. Line 33 accepts replies of known connections, line 35 accepts the published port, and line 36 drops everything else. It is a `drop`, so a scan of port 22 on the container gets no answer at all.',
			'Line 48 masquerades traffic that leaves the 192.168.0.0/24 network through another interface. The nft manual: masquerade "always uses the outgoing interface\'s IP address", so container packets leave with the host address.'
		]
	},
	tradeoff: {
		gain: [
			'`reject with tcp reset` makes a TCP client fail in one round trip. The kernel turns an RST in `SYN_SENT` into `ECONNREFUSED`.',
			'`drop` sends no packet back, so a rule that matches a flood of packets adds no reply traffic.',
			'The iptables manual says to drop packets in state INVALID: a reject for a late duplicate packet "would then terminate the healthy connection".'
		],
		cost: [
			'A client whose SYN is dropped waits 131 seconds with the default `tcp_syn_retries` of 6, unless its own connect timeout is shorter.',
			'A dropped packet looks like a dead host or a lost route from the client side. Nothing tells the operator that a firewall rule matched.',
			'An nftables `accept` ends only its own base chain. Another base chain at the same hook can still drop the packet, as the Docker docs warn for rules added beside Docker\'s tables.'
		]
	},
	task: {
		prompt: 'A database host has one nftables table: `table inet host { chain input { type filter hook input priority filter; policy drop; ct state established,related accept; iifname "lo" accept; tcp dport 22 accept; ip saddr 10.0.0.0/8 tcp dport 5432 accept; tcp dport 5432 reject with tcp reset } }`. Say what each client sees: `psql` from 10.1.2.3, `psql` from 203.0.113.9, `curl` to port 8080 from 203.0.113.9, and `ping` from 10.1.2.3.',
		hint: 'Rules run top to bottom, the first verdict wins, and a packet that matches no rule gets the chain policy.',
		answer: [
			'`psql` from 10.1.2.3: the SYN matches `ip saddr 10.0.0.0/8 tcp dport 5432 accept`. The later packets of the session match `ct state established,related accept`. It connects.',
			'`psql` from 203.0.113.9: the source rule does not match, the next one does. The host sends an RST, and `psql` fails at once with "Connection refused".',
			'`curl` to port 8080: no rule matches, so the policy `drop` applies. The SYN gets no answer, the client resends it, and with default settings `connect()` fails after 131 seconds.',
			'`ping` from 10.1.2.3: no rule accepts ICMP echo requests, so the policy drops them. `ping` prints no replies and reports 100% packet loss, even though the host is up.'
		],
		steps: [
			{
				title: 'Read the chain',
				questions: [
					{ q: 'In what order does this chain check its rules?', options: ['Most specific rule first', 'All rules, and the last match wins', 'Top to bottom, and the first verdict wins', 'Accept rules first, then reject rules'], answer: 2, why: 'Rules run top to bottom. The first `accept`, `drop` or `reject` ends the chain for that packet.' },
					{ q: 'When does `policy drop` apply?', options: ['To a packet that matches no rule', 'To every packet, before the rules', 'Only to packets from outside 10.0.0.0/8', 'Only to ICMP packets'], answer: 0, why: 'The policy is the verdict for a packet that reaches the end of the chain without a verdict.' },
					{ q: 'What is `ct state established,related accept` for?', options: ['It lets every new SYN in', 'It accepts the later packets of a connection already let in', 'It accepts only loopback traffic', 'It logs connections before the other rules'], answer: 1, why: 'Connection tracking knows the session. Once the first packet is accepted, the rest of the session matches this rule.' },
					{ q: 'What does `reject with tcp reset` send back?', options: ['Nothing at all', 'An ICMP port unreachable', 'A SYN-ACK, then a FIN', 'A TCP RST, then it drops the packet'], answer: 3, why: 'Reject sends an error back and then drops. With `tcp reset`, the error is a TCP RST.' }
				]
			},
			{
				title: 'Trace `psql` from 10.1.2.3',
				questions: [
					{ q: 'Which rule matches the first SYN to port 5432?', options: ['`ip saddr 10.0.0.0/8 tcp dport 5432 accept`', '`tcp dport 5432 reject with tcp reset`', '`ct state established,related accept`', 'None: the policy drops it'], answer: 0, why: '10.1.2.3 is inside 10.0.0.0/8, and this rule sits above the reject rule, so it wins.' },
					{ q: 'Why does the reject rule never see this SYN?', options: ['Reject rules only apply to UDP', 'The accept above it already ended the chain', 'It runs at another hook', 'The policy runs before it'], answer: 1, why: 'The first verdict wins. Once the SYN is accepted, no later rule runs for it.' },
					{ q: 'Which rule lets the rest of the session through?', options: ['`tcp dport 22 accept`', '`iifname "lo" accept`', '`ct state established,related accept`', 'The `policy drop` line'], answer: 2, why: 'After the handshake, conntrack marks the session as established, and the first rule accepts it.' },
					{ q: 'What does the user see?', options: ['"Connection refused"', 'A hang, then a timeout', 'An ICMP unreachable message', 'It connects to the database'], answer: 3, why: 'The connection is accepted, so `psql` reaches the database and connects.' }
				]
			},
			{
				title: 'Trace `psql` from 203.0.113.9',
				questions: [
					{ q: 'Which rule matches the SYN?', options: ['`ip saddr 10.0.0.0/8 tcp dport 5432 accept`', '`tcp dport 5432 reject with tcp reset`', '`ct state established,related accept`', 'None: the policy drops it'], answer: 1, why: 'The source is outside 10.0.0.0/8, so the accept rule does not match. The next rule on port 5432 does.' },
					{ q: 'What does the host send back?', options: ['A TCP RST', 'Nothing', 'An ICMP echo reply', 'A SYN-ACK'], answer: 0, why: '`reject with tcp reset` answers the SYN with an RST.' },
					{ q: 'How fast does `psql` fail?', options: ['After 131 seconds', 'After its own connect timeout', 'At once, within one round trip', 'Never: it keeps retrying'], answer: 2, why: 'The kernel turns an RST in `SYN_SENT` into `ECONNREFUSED`, so `connect()` fails right away.' },
					{ q: 'Which message does the user read?', options: ['"Connection timed out"', '"No route to host"', '"Host is down"', '"Connection refused"'], answer: 3, why: '`ECONNREFUSED` is the error the client prints as "Connection refused".' }
				]
			},
			{
				title: 'Trace `curl` to 8080 and `ping`',
				questions: [
					{ q: 'Which rule matches the `curl` SYN to port 8080?', options: ['`tcp dport 5432 reject with tcp reset`', 'None, so `policy drop` applies', '`tcp dport 22 accept`', '`ct state established,related accept`'], answer: 1, why: 'No rule mentions port 8080. The packet reaches the end of the chain and gets the policy.' },
					{ q: 'What does the `curl` client see?', options: ['No answer: it resends the SYN and fails after 131 s by default', '"Connection refused" at once', 'An HTTP 403 page', 'An ICMP port unreachable after one try'], answer: 0, why: 'A dropped SYN gets no reply. With the default `tcp_syn_retries` of 6, the kernel gives up after 131 seconds.' },
					{ q: 'What happens to `ping` from 10.1.2.3?', options: ['It works: 10.0.0.0/8 is trusted', 'It gets ICMP port unreachable', 'It reports 100% packet loss', 'It gets a TCP RST'], answer: 2, why: 'The 10.0.0.0/8 rule covers only TCP port 5432. No rule accepts ICMP echo requests, so the policy drops them.' },
					{ q: 'The host is up. What does `ping` make it look like?', options: ['A host that refuses connections', 'A host with a slow network', 'A host behind a load balancer', 'A dead host or a lost route'], answer: 3, why: 'A drop sends nothing back. From the client side, nothing tells it a firewall rule matched.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'ufw allows only port 22, yet a port published with `docker run -p 8080:80` is reachable from outside. Why?',
			options: [
				'Docker opens port 8080 in ufw\'s own rules when the container starts',
				'ufw rules apply only to IPv6, and the client connects over IPv4',
				'DNAT at prerouting sends the packet to the forward hook, so ufw\'s input rules never run',
				'nginx in the container listens on all interfaces, which bypasses the firewall'
			],
			answer: 2,
			why: 'Docker rewrites the destination to the container address before the routing decision. The kernel then forwards the packet to the bridge, and only the input hook carries ufw\'s rules.'
		},
		{
			q: '`curl http://10.0.0.5:9000/` prints nothing for about two minutes, then fails. What does the firewall on 10.0.0.5 most likely do with the SYN?',
			options: [
				'It rejects it with `tcp reset`, and curl retries the RST',
				'It drops it, so the kernel resends the SYN until `tcp_syn_retries` runs out',
				'It rejects it with ICMP port unreachable, which curl ignores',
				'It accepts it, and the server delays its SYN-ACK'
			],
			answer: 1,
			why: 'A dropped SYN gets no reply. With the default of 6 retries, the kernel gives up after 131 seconds. A reject would make `connect()` fail at once: an RST or an ICMP port unreachable both map to `ECONNREFUSED`.'
		},
		{
			q: 'Docker\'s `filter-FORWARD` chain drops a packet. You add your own table with a chain at `hook forward priority filter - 10` that accepts it. What happens?',
			options: [
				'The packet is accepted, because your chain runs first',
				'The packet is accepted, because a lower priority overrides later chains',
				'nft refuses the rule, because two tables cannot share a hook',
				'The packet is still dropped, because accept ends only your base chain'
			],
			answer: 3,
			why: 'In nftables, accept ends the current base chain and the packet moves on to the next one at the same hook. Docker\'s chain runs after yours, and its drop ends the evaluation of the whole ruleset.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Load the task\'s ruleset into a container, then see accept, reject and drop from three clients.',
		steps: [
			'Create a network: `docker network create --subnet 10.98.0.0/24 fwlab`.',
			'Start the "database" with two listeners: `docker run -d --name fw-db --network fwlab --ip 10.98.0.5 --cap-add NET_ADMIN nicolaka/netshoot:v0.13 sh -c \'python3 -m http.server 5432 & python3 -m http.server 8080\'`.',
			'Load the ruleset, with 10.98.0.10 as the only trusted source: `docker exec fw-db nft \'add table inet host { chain input { type filter hook input priority filter; policy drop; ct state established,related accept; iifname "lo" accept; ip saddr 10.98.0.10 tcp dport 5432 accept; tcp dport 5432 reject with tcp reset; }; }\'`.',
			'From the trusted address: `docker run --rm --network fwlab --ip 10.98.0.10 nicolaka/netshoot:v0.13 curl -sS -o /dev/null -w \'%{http_code}\\n\' http://10.98.0.5:5432/`.',
			'From an untrusted address, run the same `curl` with `--ip 10.98.0.20`. Then, still from 10.98.0.20, try port 8080 with `--connect-timeout 5` added. Last, from 10.98.0.10: `ping -c 3 -W 1 10.98.0.5`. Clean up with `docker rm -f fw-db && docker network rm fwlab`.'
		],
		done: [
			'From 10.98.0.10, port 5432 prints `200`.',
			'From 10.98.0.20, port 5432 fails at once: `curl: (7) Failed to connect ... after 0 ms`.',
			'From 10.98.0.20, port 8080 fails only when the 5 s timeout runs out: `curl: (28) ... Timeout was reached`.',
			'`ping` reports `100% packet loss`, although the container is running.'
		],
		solution: [
			'`docker exec fw-db nft list table inet host` prints the chain back, one rule per line, in the order they run.',
			'Exit code 7 after 0 ms is the RST from `reject with tcp reset`. Exit code 28 after 5 s is the dropped SYN: without `--connect-timeout`, the kernel would retry until 131 s.',
			'To see the difference flip, run `docker exec fw-db nft delete table inet host`, then step 3 again with `tcp dport 5432 drop` as the last rule. Port 5432 from 10.98.0.20, with `--connect-timeout 5`, now ends in `curl: (28)` too.'
		]
	},
	recall: {
		q: 'A client connects to a filtered TCP port. What does it see when the rule is `drop`, and when it is `reject with tcp reset`?',
		a: 'With drop, nothing comes back: the kernel resends the SYN 6 times and gives up after 131 seconds. With tcp reset, an RST arrives in SYN_SENT and `connect()` fails at once with ECONNREFUSED, "Connection refused".'
	},
	sources: [
		{ title: 'nftables wiki, Netfilter hooks', url: 'https://wiki.nftables.org/wiki-nftables/index.php/Netfilter_hooks' },
		{ title: 'nftables wiki, Rejecting traffic', url: 'https://wiki.nftables.org/wiki-nftables/index.php/Rejecting_traffic' },
		{ title: 'nft(8) manual page', url: 'https://www.netfilter.org/projects/nftables/manpage.html' },
		{ title: 'iptables-extensions(8), REJECT target', url: 'https://man7.org/linux/man-pages/man8/iptables-extensions.8.html' },
		{ title: 'Docker docs, Docker with nftables', url: DOCKER_NFT },
		{ title: 'Docker docs, Packet filtering and firewalls', url: 'https://docs.docker.com/engine/network/packet-filtering-firewalls/' },
		{ title: 'Linux kernel docs, IP Sysctl (tcp_syn_retries)', url: 'https://docs.kernel.org/networking/ip-sysctl.html' },
		{ title: 'Linux source, net/ipv4/icmp.c (icmp_err_convert)', url: `${LINUX}/net/ipv4/icmp.c#L124-L140` }
	]
};
