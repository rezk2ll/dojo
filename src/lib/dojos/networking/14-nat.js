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
		],
		steps: [
			{
				title: 'Find the limit',
				questions: [
					{ q: 'The same kube-proxy also runs on a 2 core node. What `nf_conntrack_max` does it set there?', options: ['131,072, the `Min` floor', '65,536', '32,768', '262,144'], answer: 0, why: '2 x 32,768 = 65,536 is below the `Min` floor, so `getConntrackMax` returns 131,072.' },
					{ q: 'The 24 core node gets 786,432. With TCP alone, each closed connection kept 120 s, how many new connections per second fill that?', options: ['About 786', 'About 26,200', 'About 6,550', 'About 65,500'], answer: 2, why: 'Entries = new flows per second times 120 s, so 786,432 / 120 is about 6,550 per second. The 7,000 of part (3) is above it even before UDP.' },
					{ q: 'Does the `Min` floor change that result?', options: ['Yes, it raises it to 1,048,576', 'No, 786,432 is above the 131,072 floor', 'Yes, it caps it at 131,072', 'No, `Min` only applies to UDP'], answer: 1, why: '`Min` (131,072 by default) is a floor. The scaled value is already above it.' },
					{ q: 'What does kube-proxy do with the hash size?', options: ['Sets it to the entry limit', 'Leaves it to the kernel default', 'Doubles it to 1,572,864', 'Raises it to a quarter of the limit if smaller'], answer: 3, why: 'kube-proxy raises the hash size to `max / 4`, here 196,608, if it is smaller.' }
				]
			},
			{
				title: 'Count the entries in steady state',
				questions: [
					{ q: 'How long does an entry for a closed TCP connection stay by default?', options: ['A few milliseconds', '30 seconds', '120 seconds, in TIME_WAIT', 'Until the table is full'], answer: 2, why: 'Entries outlive the last packet. A closed TCP flow stays 120 seconds in TIME_WAIT.' },
					{ q: 'How many TCP entries do 5,000 new connections per second keep in the table?', options: ['600,000', '5,000', '150,000', '60,000'], answer: 0, why: 'Entries = new flows per second times the seconds each stays: 5,000 x 120 = 600,000.' },
					{ q: 'How many UDP entries do 3,000 DNS queries per second keep?', options: ['3,000', '90,000', '360,000', '6,000'], answer: 1, why: 'Each query is its own flow, kept 30 seconds: 3,000 x 30 = 90,000.' },
					{ q: 'What share of the limit is in use?', options: ['About 50%', 'About 77%', 'About 100%', 'About 88%'], answer: 3, why: '600,000 + 90,000 = 690,000 of 786,432, about 88%.' }
				]
			},
			{
				title: 'Grow the traffic',
				questions: [
					{ q: 'At 7,000 TCP connections per second, how many entries in all?', options: ['790,000', '930,000', '840,000', '1,048,576'], answer: 1, why: '7,000 x 120 = 840,000 for TCP, plus 90,000 for UDP: 930,000.' },
					{ q: 'Which of this node\'s entries can `early_drop` free to make room?', options: ['The closed TCP connections in TIME_WAIT', 'Any entry, oldest first', 'The one-shot DNS flows, which are never assured', 'None: `early_drop` frees TCP entries only'], answer: 2, why: '`early_drop` frees only entries not marked assured. The TCP connections reached ESTABLISHED, so they are assured. A one-shot DNS query never is.' },
					{ q: 'A Pod\'s HTTP health check opens a new connection each time. What do you expect?', options: ['It keeps passing, since health checks skip conntrack', 'It fails, and the kubelet restarts the Pod', 'It gets slower but never fails', 'It switches to UDP'], answer: 1, why: 'Each check is a new flow, so its first packet can be dropped. That is what issue #71261 reported: Pods restarting often.' },
					{ q: 'Why does a full table also break the Pods\' DNS lookups?', options: ['Each query is its own flow, so its first packet needs a new entry', 'UDP packets bypass conntrack', 'DNS moves to TCP when the table is full', 'The kernel drops all UDP before any TCP'], answer: 0, why: 'Every DNS query here is a new UDP flow. Its first packet goes through the full-table check, and can be dropped like a new TCP connection.' }
				]
			},
			{
				title: 'Raise the limit',
				questions: [
					{ q: 'With `maxPerCore: 60000`, what is the scaled value before any cap?', options: ['1,048,576', '786,432', '1,440,000', '60,000'], answer: 2, why: '24 x 60,000 = 1,440,000.' },
					{ q: 'What limit does today\'s kube-proxy set?', options: ['1,440,000', '1,048,576', '131,072', '786,432'], answer: 1, why: '`getConntrackMax` caps the scaled value at 1,048,576.' },
					{ q: 'Is that enough for 930,000 entries?', options: ['Yes, with room to spare', 'No, it is 100,000 short', 'Only if UDP stops', 'Only after a node reboot'], answer: 0, why: '1,048,576 is above 930,000.' },
					{ q: 'Why did the reporter in 2018 get 1,440,000?', options: ['They set it by hand with sysctl', 'The kernel doubled it at boot', 'Their node had more cores', 'The code had no cap then'], answer: 3, why: 'The cap at 1,048,576 came later. In 2018 kube-proxy used the scaled value as is.' }
				]
			}
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
	lab: {
		minutes: 20,
		goal: 'Build a fake ClusterIP with one DNAT rule, then watch conntrack entries pile up after the connections close.',
		steps: [
			'Start a shell in its own network namespace, so nothing touches your host\'s rules: `docker run -it --rm --cap-add NET_ADMIN nicolaka/netshoot:v0.13`.',
			'Inside it, start a backend: `python3 -m http.server 8080 >/dev/null 2>&1 &`.',
			'Add the "Service" rule: `iptables -t nat -A OUTPUT -p tcp -d 10.96.0.10 --dport 80 -j DNAT --to-destination $(hostname -i):8080`.',
			'Call the fake ClusterIP once and read the table: `curl -s -o /dev/null -w "%{http_code}\\n" http://10.96.0.10/`, then `conntrack -L`.',
			'Open 50 short connections and count the entries: `for i in $(seq 50); do curl -s -o /dev/null http://10.96.0.10/; done; conntrack -C`. Run `conntrack -L | head -3` a few times over the next two minutes, and read the limit with `cat /proc/sys/net/netfilter/nf_conntrack_max`.'
		],
		done: [
			'`curl` prints `200`, although nothing listens on `10.96.0.10`.',
			'`conntrack -L` shows one line with two tuples: `dst=10.96.0.10 dport=80`, then a reply tuple with `sport=8080`.',
			'After the loop, `conntrack -C` prints about 51 although every connection has closed, and the entries show `TIME_WAIT` with a timer counting down from 120.'
		],
		solution: [
			'The first packet hit the DNAT rule and conntrack stored both tuples. The reply from port 8080 matched the reply tuple and was rewritten back to `10.96.0.10:80`, with no rule walked again.',
			'Each closed TCP flow holds its entry for 120 seconds. 50 connections in a few seconds keep about 50 entries for two minutes: the same steady state sum as the task, at a smaller rate.',
			'Writing to `nf_conntrack_max` from the container fails with "Read-only file system": Docker mounts `/proc/sys` read-only. Type `exit` to remove the container and its rules.'
		]
	},
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
