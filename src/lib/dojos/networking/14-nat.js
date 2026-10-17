const LINUX = 'https://github.com/torvalds/linux/blob/70dd4ee72eb2d5793c62e71c14e3aba78e5a4e56';
const CORE = `${LINUX}/net/netfilter/nf_conntrack_core.c`;
const K8S = 'https://github.com/kubernetes/kubernetes/blob/949f064e6d9e32f0a597795c265fcd50c6aad66e';
const SYSCTLS = `${K8S}/pkg/proxy/conntrack/sysctls.go`;
const ISSUE = 'https://github.com/kubernetes/kubernetes/issues/71261';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'nat',
	part: 'Names and addresses',
	title: 'NAT and conntrack',
	minutes: 10,
	hook: [
		'November 2018, Kubernetes issue #71261. On a node running Kubernetes 1.12.2, `dmesg -T` shows the same line again and again, three times within one second at 22:30:27: `nf_conntrack: table full, dropping packet`.',
		'The reporter: "This issue may break pod http health check, pod will restart frequently." The `ingress-nginx-controller` Pod goes unavailable, and every request through it fails.',
		'The kube-proxy log holds the limit it had set: `Setting nf_conntrack_max to 786432`. A maintainer did the arithmetic: 24 CPU cores times the default 32,768 per core. **Raising `nf_conntrack_max` to 1048576 fixed it.**'
	],
	terms: [
		{ term: 'NAT', def: 'Network address translation: rewriting the source address (SNAT) or the destination address (DNAT) of packets as they cross a machine.' },
		{ term: 'conntrack', def: 'The Linux connection tracking table. It holds one entry per flow with the original addresses and ports and the ones expected in replies, so NAT can apply to every packet of the flow.' },
		{ term: 'nf_conntrack_max', def: 'The sysctl that caps the number of entries in the conntrack table. `nf_conntrack_count` shows how many are in use.' },
		{ term: 'MASQUERADE', def: 'An iptables SNAT target that rewrites the source to the address of the interface the packet leaves by, so the rule needs no fixed IP.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['pod["Pod 10.244.1.5:40000"] -->|"to 1.1.1.1:53"| node["Node: netfilter"]', 'node --> ct[("conntrack: new entry")]'],
				highlight: ['node', 'ct'],
				note: 'The Pod sends a DNS query to `1.1.1.1:53`. When the first packet of a flow reaches netfilter on the node, conntrack creates an entry for it. The entry is keyed on the protocol plus the source and destination addresses and ports.'
			},
			{
				add: ['node -->|"SNAT: from 203.0.113.7:40000"| net["Internet"]'],
				highlight: ['net'],
				note: 'A MASQUERADE rule rewrites the source to the node\'s address, here `203.0.113.7`, because `10.244.1.5` is a private address the internet cannot route back to. The entry now also records the reply it expects: from `1.1.1.1:53` to `203.0.113.7:40000`.'
			},
			{
				add: ['net -->|"reply to 203.0.113.7:40000"| node', 'node -->|"un-NAT: to 10.244.1.5:40000"| pod'],
				highlight: ['ct', 'pod'],
				note: 'The reply matches the entry, and netfilter rewrites the destination back to the Pod. No rule is evaluated again: the iptables man page says that after SNAT or DNAT "all future packets in this connection will also be mangled".'
			},
			{
				add: ['client["Pod: to ClusterIP 10.96.0.10:53"] -->|"DNAT: to 10.244.2.8:53"| dnspod["CoreDNS Pod"]'],
				highlight: ['client', 'dnspod'],
				note: 'kube-proxy uses the opposite rewrite for Services. The Kubernetes docs: its rules "redirect traffic (using destination NAT) to the backends". Each flow to a ClusterIP gets its own conntrack entry too.'
			},
			{
				add: ['ct -->|"count > nf_conntrack_max"| full["New flows dropped: table full"]'],
				highlight: ['full'],
				note: 'Entries stay after the last packet until a timer expires: 30 seconds for UDP and 120 seconds for TCP in TIME_WAIT, by default. When the count reaches `nf_conntrack_max`, the kernel drops the first packet of new flows and logs "table full".'
			}
		]
	},
	example: {
		title: 'net/netfilter/nf_conntrack_core.c: what the kernel does with a new flow when the table is full',
		repo: 'torvalds/linux',
		url: `${CORE}#L1649-L1675`,
		lang: 'c',
		code: `static struct nf_conn *
__nf_conntrack_alloc(struct net *net,
		     const struct nf_conntrack_zone *zone,
		     const struct nf_conntrack_tuple *orig,
		     const struct nf_conntrack_tuple *repl,
		     gfp_t gfp, u32 hash)
{
	struct nf_conntrack_net *cnet = nf_ct_pernet(net);
	unsigned int ct_count;
	struct nf_conn *ct;

	/* We don't want any race condition at early drop stage */
	ct_count = atomic_inc_return(&cnet->count);

	if (unlikely(ct_count > nf_conntrack_max)) {
		if (!early_drop(net, hash)) {
			if (!conntrack_gc_work.early_drop)
				conntrack_gc_work.early_drop = true;
			atomic_dec(&cnet->count);
			if (net == &init_net)
				net_warn_ratelimited("nf_conntrack: table full, dropping packet\\n");
			else
				net_warn_ratelimited("nf_conntrack: table full in netns %u, dropping packet\\n",
						     net->ns.inum);
			return ERR_PTR(-ENOMEM);
		}
	}`,
		notes: [
			'Lines 4 and 5 take two tuples: `orig`, the addresses as the first packet carried them, and `repl`, the addresses a reply will carry after NAT. One entry holds both directions of the flow.',
			'Line 13 counts the new entry, and line 15 compares the count with `nf_conntrack_max`. This function runs only for the first packet of a flow, so packets of flows already in the table never reach this check.',
			'Line 16 calls `early_drop`, which scans 8 hash buckets near the new entry and frees one entry that is not marked assured. The kernel marks a TCP flow assured once it reaches ESTABLISHED. A UDP flow needs a reply and traffic still flowing after 2 seconds, so a one-shot DNS query never does.',
			'If nothing can be freed, lines 19 to 25 undo the count, print the message from issue #71261 and return an error. The packet is dropped, and the client gets no reply and no error.',
			'kube-proxy sets the limit at start. [`getConntrackMax`](' + SYSCTLS + '#L131-L153) returns `MaxPerCore` times the number of CPUs, at least `Min` (131072 by default) and at most 1048576. It then raises the hash size to a quarter of that if it is smaller.'
		]
	},
	tradeoff: {
		gain: [
			'Many Pods with private `10.244.x.x` addresses reach the internet through the node\'s one public address, and replies find their way back through the conntrack entry.',
			'iptables evaluates the NAT rules for the first packet of a flow only. netfilter rewrites every later packet from the conntrack entry.'
		],
		cost: [
			'Each flow holds an entry after its last packet: a DNS query over UDP for 30 seconds, a closed TCP connection for 120 seconds in TIME_WAIT. A node making short connections fills the table with finished flows.',
			'A full table drops new flows and leaves existing ones running. A health check that opens a new connection each time fails, and the kubelet restarts the Pod, as in issue #71261.',
			'The kernel sizes the table from RAM: the default bucket count is total memory divided by 16384, at most 262144, and `nf_conntrack_max` defaults to the bucket count. On the 29 GB machine I used for this chapter, both read 262144.'
		]
	},
	task: {
		prompt: 'A 24 core node runs kube-proxy with default conntrack settings. Its Pods open 5,000 short TCP connections per second to other services, each closed after a few milliseconds, and send 3,000 DNS queries per second over UDP, each its own flow. (1) What `nf_conntrack_max` does kube-proxy set? (2) How many entries are in the table in steady state? (3) Traffic grows to 7,000 TCP connections per second. What happens? (4) You set `conntrack.maxPerCore: 60000` as in the issue. What limit do you get with today\'s kube-proxy?',
		hint: 'In steady state, entries = new flows per second times the seconds each entry stays. Use 120 s for closed TCP (TIME_WAIT) and 30 s for UDP.',
		answer: [
			'(1) 24 times 32,768 = 786,432, which is above the 131,072 minimum. kube-proxy also raises the hash size to 786,432 / 4 = 196,608 if it is smaller.',
			'(2) TCP: 5,000 x 120 = 600,000. UDP: 3,000 x 30 = 90,000. Total 690,000 entries, 88% of the limit.',
			'(3) TCP: 7,000 x 120 = 840,000, plus 90,000 for UDP, is 930,000, above 786,432. The kernel drops the first packet of new flows and logs `nf_conntrack: table full, dropping packet`. Connections already open keep working.',
			'(4) 24 x 60,000 = 1,440,000, but the code at this commit caps the scaled value at 1,048,576. That covers 930,000. In 2018 the code had no cap, so the reporter got 1,440,000.'
		]
	},
	quiz: [
		{
			q: 'A Pod at `10.244.1.5` queries `1.1.1.1`. The node masquerades it to `203.0.113.7`. How does the reply reach the Pod?',
			options: [
				'The reply carries the Pod\'s address in an extra header added by SNAT',
				'The node matches the reply to the conntrack entry and rewrites it',
				'The node broadcasts the reply to every Pod, and the right one keeps it',
				'The MASQUERADE rule is evaluated again in reverse on the reply'
			],
			answer: 1,
			why: 'Conntrack stored the expected reply tuple when the first packet was translated. The reply to `203.0.113.7:40000` matches it, and netfilter rewrites the destination back to `10.244.1.5:40000` without walking the rules again.'
		},
		{
			q: 'The conntrack table is full. Which traffic fails?',
			options: [
				'All traffic on the node, because every packet needs a free entry',
				'New flows, while packets of flows already in the table keep passing',
				'Only UDP, because TCP entries are always marked assured',
				'Only traffic to ClusterIPs, because SNAT never uses conntrack'
			],
			answer: 1,
			why: 'The kernel allocates an entry only for the first packet of a flow. When the count exceeds `nf_conntrack_max` and `early_drop` frees nothing, that packet is dropped. Packets of known flows match their existing entry.'
		},
		{
			q: 'kube-proxy logs `Setting nf_conntrack_max to 786432` on a node with default settings. How did it get that number?',
			options: [
				'Total memory divided by 16384, the kernel\'s default',
				'24 CPUs times the default 32,768 entries per core',
				'Its fixed default of 786,432, the same on every node',
				'The kernel default of 262,144, multiplied by 3 for safety'
			],
			answer: 1,
			why: '`getConntrackMax` multiplies `MaxPerCore`, 32 x 1024 by default, by the CPU count, and uses `Min` (131,072) as a floor. 786,432 / 32,768 = 24, the maintainer\'s guess in issue #71261.'
		}
	],
	recall: {
		q: 'What does the kernel do with the first packet of a new flow when `nf_conntrack_count` has reached `nf_conntrack_max`?',
		a: 'It tries `early_drop`: free one entry that is not assured from 8 nearby hash buckets. When no entry can be freed, it drops the packet and logs `nf_conntrack: table full, dropping packet`.'
	},
	sources: [
		{ title: 'Kubernetes issue #71261, nf_conntrack: table full, dropping packet', url: ISSUE },
		{ title: 'Linux kernel docs, Netfilter Conntrack Sysfs variables', url: 'https://docs.kernel.org/networking/nf_conntrack-sysctl.html' },
		{ title: 'iptables-extensions(8), SNAT, DNAT and MASQUERADE targets', url: 'https://man7.org/linux/man-pages/man8/iptables-extensions.8.html' },
		{ title: 'Kubernetes docs, Virtual IPs and Service Proxies', url: 'https://kubernetes.io/docs/reference/networking/virtual-ips/' },
		{ title: 'Kubernetes source, pkg/proxy/conntrack/sysctls.go', url: SYSCTLS }
	]
};
