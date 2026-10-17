const K8S = 'https://github.com/kubernetes/kubernetes/blob/949f064e6d9e32f0a597795c265fcd50c6aad66e';
const KDNS = `${K8S}/pkg/kubelet/network/dns/dns.go`;
const ISSUE = 'https://github.com/kubernetes/kubernetes/issues/33554';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'resolv-conf',
	part: 'Names and addresses',
	title: 'resolv.conf, search and ndots',
	minutes: 10,
	hook: [
		'October 2016, Kubernetes issue #33554. A cluster operator writes that the Pod DNS default "results in something like 10+ dns queries per non-cluster domain attempted in our clusters".',
		'Their example is an app outside the cluster at `application.internal.my.domain`: "That\'s 12 DNS queries (A and AAAA for each search domain) which ultimately fail since `application.internal.my.domain` doesn\'t exist within our cluster." Only after those does the Pod ask for the name as written.',
		'The cause is one line kubelet writes into every Pod\'s `/etc/resolv.conf`: `options ndots:5`. I reproduced it in this session with a Debian container and the same file: one `getent ahosts api.github.com` sent **4 queries, and 3 of them came back `NXDOMAIN`**.'
	],
	terms: [
		{ term: 'Stub resolver', def: 'The DNS client inside your program, glibc\'s on most Linux systems. It reads `/etc/resolv.conf` and sends queries to the `nameserver` listed there.' },
		{ term: 'Search list', def: 'The `search` line of `/etc/resolv.conf`: domains the stub resolver appends to a name, one at a time, until one of them matches.' },
		{ term: 'ndots', def: 'An option in `/etc/resolv.conf`. A name with fewer dots than `ndots` goes through the search list before it is tried as written. The glibc default is 1; Kubernetes sets 5.' },
		{ term: 'FQDN', def: 'Fully qualified domain name: a name ending in a dot, like `api.github.com.`. The stub resolver sends it as is and skips the search list.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['app["App in Pod: connect api.github.com"] --> stub["glibc reads /etc/resolv.conf"]', 'stub --> rule{"2 dots < ndots:5"}'],
				highlight: ['stub', 'rule'],
				note: 'The Pod\'s `/etc/resolv.conf` has `search default.svc.cluster.local svc.cluster.local cluster.local` and `options ndots:5`. `api.github.com` has 2 dots, fewer than 5, so glibc tries the search list first.'
			},
			{
				add: ['rule -->|"query 1"| dns["Cluster DNS"]', 'dns -->|"NXDOMAIN: api.github.com.default.svc.cluster.local"| stub'],
				highlight: ['dns'],
				note: 'The first query appends the first search domain. No such name exists, so the answer is `NXDOMAIN`. In my run, CoreDNS logged it as `"A IN api.github.com.default.svc.cluster.local."` and answered in 9 ms.'
			},
			{
				add: ['stub -->|"queries 2 and 3: .svc.cluster.local, .cluster.local"| dns', 'dns -->|"NXDOMAIN, NXDOMAIN"| stub'],
				highlight: ['stub', 'dns'],
				note: 'glibc moves to the next search domain, then the next. Both fail. The man page warns that this "may be slow and will generate a lot of network traffic if the servers for the listed domains are not local".'
			},
			{
				add: ['stub -->|"query 4: api.github.com."| dns', 'dns -->|"NOERROR + A record"| app'],
				highlight: ['app'],
				note: 'With the search list used up, glibc sends the name as written and gets the address. In my run the three failed queries added 25 ms before this one. A program that also asks for AAAA records pays the same again.'
			},
			{
				add: ['fqdn["App uses api.github.com. (trailing dot)"] -->|"1 query"| dns'],
				highlight: ['fqdn'],
				note: 'A trailing dot makes the name absolute. The same container, asked for `api.github.com.`, sent one query and CoreDNS logged nothing else. Setting `ndots:1` in the Pod\'s `dnsConfig` had the same effect for this name.'
			}
		]
	},
	example: {
		title: 'pkg/kubelet/network/dns/dns.go: where ndots:5 and the search list come from',
		repo: 'kubernetes/kubernetes',
		url: `${KDNS}#L43-L455`,
		lang: 'go',
		code: `var (
	// The default dns opt strings.
	defaultDNSOptions = []string{"ndots:5"}
)
…
func (c *Configurer) generateSearchesForDNSClusterFirst(hostSearch []string, pod *v1.Pod) []string {
	if c.ClusterDomain == "" {
		return hostSearch
	}

	nsSvcDomain := fmt.Sprintf("%s.svc.%s", pod.Namespace, c.ClusterDomain)
	svcDomain := fmt.Sprintf("svc.%s", c.ClusterDomain)
	clusterSearch := []string{nsSvcDomain, svcDomain, c.ClusterDomain}

	return omitDuplicates(append(clusterSearch, hostSearch...))
}
…
	switch dnsType {
	case podDNSNone:
		// DNSNone should use empty DNS settings as the base.
		dnsConfig = &runtimeapi.DNSConfig{}
	case podDNSCluster:
		if len(c.clusterDNS) != 0 {
			// For a pod with DNSClusterFirst policy, the cluster DNS server is
			// the only nameserver configured for the pod. The cluster DNS server
			// itself will forward queries to other nameservers that is configured
			// to use, in case the cluster DNS server cannot resolve the DNS query
			// itself.
			dnsConfig.Servers = []string{}
			for _, ip := range c.clusterDNS {
				dnsConfig.Servers = append(dnsConfig.Servers, ip.String())
			}
			dnsConfig.Searches = c.generateSearchesForDNSClusterFirst(dnsConfig.Searches, pod)
			dnsConfig.Options = defaultDNSOptions
			break
		}`,
		notes: [
			'Line 3 is the only place the value 5 appears. Line 34 copies it into every Pod whose DNS policy is `ClusterFirst`, which the docs say is the default when `dnsPolicy` is not set.',
			'Lines 11 to 13 build the first three search domains from the Pod\'s namespace and the cluster domain: `shop.svc.cluster.local`, `svc.cluster.local`, `cluster.local` for a Pod in `shop`.',
			'Line 15 appends the node\'s own search domains after them. The operator in [issue #33554](' + ISSUE + ') reached 12 failed queries this way: with the node\'s search domains added, the list had 6 domains.',
			'Lines 19 to 21: with `dnsPolicy: None`, kubelet starts from an empty config and takes everything from the Pod\'s `dnsConfig`. With any other policy, `dnsConfig.options` is merged on top, so `{ name: ndots, value: "2" }` replaces the 5.'
		]
	},
	tradeoff: {
		gain: [
			'Short names work: in namespace `shop`, `redis` resolves as `redis.shop.svc.cluster.local` on the first query, and `redis.cache` as `redis.cache.svc.cluster.local` on the second.',
			'With `ndots:5`, names with up to 4 dots still use the search list, such as the SRV name `_http._tcp.my-svc.my-namespace.svc`.'
		],
		cost: [
			'Every external name with fewer than 5 dots costs 3 failed queries first, before the one that succeeds. In my run that added 25 ms to a lookup of `api.github.com`.',
			'Search domains inherited from the node add more failed queries per name: with 6 search domains in all, the operator in issue #33554 saw 12 failed queries.',
			'Lowering `ndots` for a Pod sends short names like `redis.cache` to the upstream servers first, as an absolute name, before the search list.'
		]
	},
	task: {
		prompt: 'A Pod in namespace `shop` has `search shop.svc.cluster.local svc.cluster.local cluster.local` and `options ndots:5`. A Service `redis` exists in namespace `cache`. For each name, list the A queries glibc sends, in order, until one succeeds: `redis.cache`, `api.stripe.com`, `api.stripe.com.`. Then write the `dnsConfig` that makes `api.stripe.com` a single query without touching the code.',
		hint: 'Count the dots, compare with 5, then try each search domain in order until one exists.',
		answer: [
			'`redis.cache` (1 dot): `redis.cache.shop.svc.cluster.local` (NXDOMAIN), then `redis.cache.svc.cluster.local` (found). 2 queries.',
			'`api.stripe.com` (2 dots): `.shop.svc.cluster.local`, `.svc.cluster.local`, `.cluster.local` appended, all NXDOMAIN, then `api.stripe.com` itself. 4 queries, 8 if the program also asks for AAAA. `api.stripe.com.` ends in a dot: 1 query.',
			'`dnsConfig: { options: [ { name: ndots, value: "2" } ] }`. Now `api.stripe.com` has 2 dots, which meets `ndots:2`, so glibc tries it as written first. `redis.cache` has 1 dot and still goes through the search list.'
		]
	},
	quiz: [
		{
			q: 'A Pod in namespace `default` with the Kubernetes default `resolv.conf` looks up `www.example.org`. What is the first name glibc asks the cluster DNS for?',
			options: ['`www.example.org`, the name as written', '`www.example.org.default.svc.cluster.local`', '`www.example.org.cluster.local`, the cluster domain', '`www.example.org.svc.cluster.local`, all Services'],
			answer: 1,
			why: '`www.example.org` has 2 dots, fewer than `ndots:5`, so glibc appends the search domains first, in the order of the `search` line. The first one is `default.svc.cluster.local`.'
		},
		{
			q: 'Your app calls `api.github.com` thousands of times a minute from a Pod. Which change in the app\'s config sends one query per lookup?',
			options: [
				'Add `options attempts:1` so the resolver stops after one try',
				'Write the host as `api.github.com.` with a trailing dot',
				'Add `github.com` as the first domain on the `search` line',
				'Add `options rotate` to spread queries over the name servers'
			],
			answer: 1,
			why: 'A trailing dot makes the name fully qualified, so the stub resolver skips the search list. `attempts` controls retries after timeouts, and `rotate` only picks which server gets each query.'
		},
		{
			q: 'In issue #33554, why did one lookup of `application.internal.my.domain` cause 12 failed queries?',
			options: [
				'CoreDNS retried each failed query 12 times before giving up',
				'6 search domains, each tried for A and AAAA, before the name itself',
				'The upstream server returned SERVFAIL, so glibc retried 12 times',
				'The name had 12 labels, and each label was resolved separately'
			],
			answer: 1,
			why: 'The name has 3 dots, fewer than 5, so every search domain is tried first. Kubelet put the node\'s search domains after the cluster ones, and the program asked for both A and AAAA for each.'
		}
	],
	recall: {
		q: 'With the Kubernetes default `ndots:5`, how many A queries does glibc send to resolve `api.github.com`, and what is the smallest change in the app that makes it one?',
		a: '4: the three cluster search domains appended in turn, all `NXDOMAIN`, then the name itself. Writing it as `api.github.com.` with a trailing dot makes it one query.'
	},
	sources: [
		{ title: 'Kubernetes issue #33554, ndots:5 and the extra queries it causes', url: ISSUE },
		{ title: 'Kubernetes docs, DNS for Services and Pods', url: 'https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/' },
		{ title: 'resolv.conf(5), Linux manual page', url: 'https://man7.org/linux/man-pages/man5/resolv.conf.5.html' },
		{ title: 'Kubernetes source, pkg/kubelet/network/dns/dns.go', url: KDNS }
	]
};
