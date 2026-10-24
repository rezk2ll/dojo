const GO = 'https://github.com/golang/go/blob/c3a068eec992b5ae783abce1a9d03f617b671ea2/src/net';
const CONSUL_STATIC = 'https://developer.hashicorp.com/consul/docs/discover/service/static';
const CONSUL_CFG = 'https://developer.hashicorp.com/consul/docs/discover/dns/configure';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'service-discovery',
	part: 'Between services',
	title: 'Service discovery',
	minutes: 10,
	hook: [
		'`checkout` calls `payments` at three IP addresses written in its config file. Ops replaces one VM: 10.0.2.15 goes away and 10.0.2.31 comes up. One call in three now hangs until the connect timeout, and it stays that way until someone edits the file and restarts `checkout`.',
		'With service discovery, each instance of `payments` registers its address and port in a registry, and `checkout` asks the registry at call time. HashiCorp Consul keeps such a registry. It answers DNS queries on 127.0.0.1 port 8600 and leaves out every instance that fails its health check.',
		'The choice of instance happens in one of two places. Either the caller gets the list and picks one, or the caller sends every request to one fixed address and a proxy there picks the instance.'
	],
	terms: [
		{ term: 'Service registry', def: 'A database of running instances: service name, address, port and health. Consul and the Kubernetes API server both keep one.' },
		{ term: 'SRV record', def: 'A DNS record of type 33 (RFC 2782) named `_service._proto.name`, whose answer holds a priority, a weight, a port and a target host name.' },
		{ term: 'Client-side discovery', def: 'The caller reads the list of instances from the registry and chooses which one to connect to.' },
		{ term: 'Server-side discovery', def: 'The caller connects to one fixed address, and a load balancer or proxy behind it reads the registry and chooses the instance.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['web1["web on 10.0.2.15:8080"] -->|"register, HTTP check every 10s"| agent["Consul agent"]', 'web2["web on 10.0.2.16:8080"] -->|"register, HTTP check every 10s"| agent', 'agent --> catalog[("Consul catalog")]'],
				highlight: ['web1', 'web2', 'agent'],
				note: 'Each instance of `web` registers with the local Consul agent, together with a health check such as `GET /health` every 10 seconds. The Consul docs: a new check gets "a critical status by default", so an instance joins the answers only after its first passing check.'
			},
			{
				add: ['client["checkout"] -->|"SRV query web.service.consul"| dns["Consul DNS 127.0.0.1:8600"]', 'dns --> catalog'],
				highlight: ['client', 'dns'],
				note: '`checkout` sends a DNS query of type SRV for `web.service.consul` to port 8600. Consul serves SRV records "only if the client specifically requests them". A plain A query returns addresses without the port.'
			},
			{
				add: ['dns -->|"SRV 1 1 8080 for web1 and web2, TTL 0"| client', 'client -->|"connect 10.0.2.16:8080"| web2'],
				highlight: ['client', 'web2'],
				note: 'The answer lists both instances with port 8080 and a TTL of 0, so no resolver caches it. Consul shuffles the records in each answer. `checkout` picks one target and opens the TCP connection itself: this is client-side discovery.'
			},
			{
				add: ['web1 -.->|"GET /health fails: critical"| agent', 'dns -.->|"next answer: web2 only"| client'],
				highlight: ['web1', 'dns'],
				note: 'The check on 10.0.2.15 fails and turns critical. The docs: "Services that fail their health check or that fail a node system check are omitted from the results." The next query returns only 10.0.2.16, and nobody edits a config file.'
			},
			{
				add: ['k8s["checkout in a Pod"] -->|"web.prod.svc.cluster.local: one ClusterIP"| vip["Service web, ClusterIP"]', 'vip -->|"proxy picks a Pod"| pods["Pods of web"]'],
				highlight: ['k8s', 'vip'],
				note: 'In Kubernetes the name `web.prod.svc.cluster.local` resolves to one ClusterIP. The caller always connects to that address, and kube-proxy rules on the node pick a Pod (chapter 35). In this server-side discovery, the caller never sees the list of Pods.'
			}
		]
	},
	example: {
		title: 'Go src/net/dnsclient.go: ordering SRV records as RFC 2782 says',
		repo: 'golang/go',
		url: `${GO}/dnsclient.go#L163-L214`,
		lang: 'go',
		code: `// An SRV represents a single DNS SRV record.
type SRV struct {
	Target   string
	Port     uint16
	Priority uint16
	Weight   uint16
}

// byPriorityWeight sorts SRV records by ascending priority and weight.
type byPriorityWeight []*SRV

// shuffleByWeight shuffles SRV records by weight using the algorithm
// described in RFC 2782.
func (addrs byPriorityWeight) shuffleByWeight() {
	sum := 0
	for _, addr := range addrs {
		sum += int(addr.Weight)
	}
	for sum > 0 && len(addrs) > 1 {
		s := 0
		n := randIntn(sum)
		for i := range addrs {
			s += int(addrs[i].Weight)
			if s > n {
				if i > 0 {
					addrs[0], addrs[i] = addrs[i], addrs[0]
				}
				break
			}
		}
		sum -= int(addrs[0].Weight)
		addrs = addrs[1:]
	}
}

// sort reorders SRV records as specified in RFC 2782.
func (addrs byPriorityWeight) sort() {
	slices.SortFunc(addrs, func(a, b *SRV) int {
		if r := cmp.Compare(a.Priority, b.Priority); r != 0 {
			return r
		}
		return cmp.Compare(a.Weight, b.Weight)
	})
	i := 0
	for j := 1; j < len(addrs); j++ {
		if addrs[i].Priority != addrs[j].Priority {
			addrs[i:j].shuffleByWeight()
			i = j
		}
	}
	addrs[i:].shuffleByWeight()
}`,
		notes: [
			'Lines 2 to 7 are the four fields of an SRV answer that a client uses. `net.LookupSRV` returns them in the order this code builds; its [doc comment](' + GO + '/lookup.go#L503-L506) says "sorted by priority and randomized by weight within a priority".',
			'Lines 38 to 43 sort by priority, lowest first, then by weight. Lines 45 to 51 cut the list into groups of equal priority and shuffle each group. The RFC: a client "MUST attempt to contact the target host with the lowest-numbered priority it can reach".',
			'Line 21 draws `n` between 0 and `sum - 1`. Lines 22 to 29 walk the running sum of weights and move the first record whose running sum exceeds `n` to the front. A record with weight 60 out of a total of 100 wins 60 draws out of 100.',
			'Line 31 removes the chosen record from the sum and line 32 repeats the draw on the rest. A weight 0 record adds nothing to `s` on line 23, so it can never pass the test on line 24 while `sum > 0`. It ends up last in its group.'
		]
	},
	tradeoff: {
		gain: [
			'Any program that can resolve a name can use Consul without a client library: `dig @127.0.0.1 -p 8600 web.service.consul SRV` is enough.',
			'An instance that fails its health check leaves the DNS answers on the next query, and no config file has to change.',
			'With client-side discovery the caller connects straight to the instance, with no proxy hop in between.'
		],
		cost: [
			'Consul serves a TTL of 0 by default. Its docs: this "adds a latency hit for each lookup and can potentially exhaust the query throughput of a datacenter".',
			'A resolver that caches a "not found" answer keeps a service down for its own cache time. Consul exposes `soa.min_ttl` to tune that negative TTL.',
			'Consul warns that a DNS answer has a size limit: with "more than 500 instances, you may not be able to retrieve the complete list of instances".',
			'A plain A lookup carries no port and no weight. RFC 2782 also notes that "some programs only try the first address they get back".'
		]
	},
	task: {
		prompt: '`dig _api._tcp.example.com SRV +short` prints four lines: `10 60 8080 a.example.com.`, `10 20 8080 b.example.com.`, `10 20 8080 c.example.com.` and `20 0 8080 d.example.com.`. A client orders them with the Go code above. What share of first attempts goes to `a`? When does `d` get any traffic?',
		hint: 'The first two numbers are priority and weight. Group by priority first, then add the weights in the group.',
		answer: [
			'Priority 10 holds `a`, `b` and `c`, with weights 60 + 20 + 20 = 100. Line 21 draws `n` from 0 to 99.',
			'Sorted by weight, the running sums are 20 (`b`), 40 (`c`) and 100 (`a`). `a` wins when `n` is 40 to 99: 60 draws out of 100, so 60% of first attempts. `b` and `c` get 20% each.',
			'`d` has priority 20, a higher number, so it sits after the whole priority 10 group. A client reaches `d` only after it has failed to connect to `a`, `b` and `c`.'
		],
		steps: [
			{
				title: 'Read the four fields',
				questions: [
					{ q: 'In the query name `_api._tcp.example.com`, which part names the transport protocol?', options: ['`_api`', '`_tcp`', '`example.com`', '`_api._tcp`'], answer: 1, why: 'An SRV record is named `_service._proto.name`. `_api` is the service, `_tcp` the protocol and `example.com` the domain.' },
					{ q: '`b` and `c` both carry weight 20. What does that say about them?', options: ['They are tried only after `a` has failed', 'They are backups for `d`', 'They get the same share of first attempts in their group', 'They are tried in the order the answer lists them'], answer: 2, why: 'Weight decides the share inside one priority group. Two records with the same weight in the same group win the draw equally often.' },
					{ q: 'What is `8080`?', options: ['The port the client connects to', 'The DNS server port', 'The weight of the record', 'The TTL of the answer'], answer: 0, why: 'The third field is the port. That is what a plain A lookup cannot give you.' },
					{ q: 'What is `a.example.com.`?', options: ['The name the client queried', 'The DNS zone that holds the record', 'The service name with its protocol', 'The target host the client connects to'], answer: 3, why: 'The last field is the target host name. The query name was `_api._tcp.example.com`.' }
				]
			},
			{
				title: 'Group by priority',
				questions: [
					{ q: 'Which records share the priority the client tries first?', options: ['`a`, `b` and `c`', '`d` alone', '`a` and `d`', 'All four'], answer: 0, why: 'The client must try the lowest-numbered priority it can reach. `a`, `b` and `c` all carry priority 10.' },
					{ q: 'Why does `d` not compete with `a`, `b` and `c`?', options: ['Its weight is 0, so it is skipped', 'Its priority 20 puts it in a later group', 'It listens on another port', 'It is the last line of the answer'], answer: 1, why: 'Lines 38 to 43 sort by priority first. Weight only orders records inside the same priority group.' },
					{ q: 'What is the total weight of the priority 10 group?', options: ['60', '80', '120', '100'], answer: 3, why: '60 + 20 + 20 = 100. The weight of `d` does not count, because it is in another group.' },
					{ q: 'With that total, what range does line 21 draw `n` from?', options: ['1 to 100', '0 to 60', '0 to 99', '0 to 100'], answer: 2, why: '`randIntn(sum)` returns a number from 0 to `sum - 1`, so 0 to 99 here.' }
				]
			},
			{
				title: 'Work out the share of `a`',
				questions: [
					{ q: 'After the sort by weight, what are the running sums in the priority 10 group?', options: ['20 (`b`), 40 (`c`), 100 (`a`)', '60 (`a`), 80 (`b`), 100 (`c`)', '20 (`b`), 20 (`c`), 60 (`a`)', '100 (`a`), 40 (`c`), 20 (`b`)'], answer: 0, why: 'The sort puts the lowest weight first: `b` and `c` at 20, then `a` at 60. Adding them up gives 20, 40 and 100.' },
					{ q: 'For which values of `n` does `a` win the first draw?', options: ['0 to 59', '40 to 99', '60 to 99', '40 to 100'], answer: 1, why: '`a` is chosen when its running sum, 100, is the first one above `n`. That happens when `n` is 40 or more.' },
					{ q: '`a` wins the first draw, and line 31 takes its 60 out of `sum`. What share of the second picks goes to `b`?', options: ['20%', '40%', '50%', '0%, `d` comes second'], answer: 2, why: 'The second draw runs on `b` and `c` only, with `sum` = 40. `b` wins when `n` is 0 to 19: 20 values out of 40.' },
					{ q: 'What share goes to `b`?', options: ['40%', '0%, it comes after `a`', '33%', '20%'], answer: 3, why: '`b` wins when `n` is 0 to 19: 20 draws out of 100. `c` gets the same 20%.' }
				]
			},
			{
				title: 'Place `d`',
				questions: [
					{ q: 'Where does `d` end up in the ordered list?', options: ['First, because its weight is 0', 'After the whole priority 10 group', 'In a random place among the four', 'Between `a` and `b`'], answer: 1, why: 'Priority 20 is a higher number than 10, so the whole group of 10 comes before it.' },
					{ q: 'When does `d` get any traffic?', options: ['Only after the client failed to connect to `a`, `b` and `c`', 'On 0% of first attempts, but 25% of retries', 'Whenever the random draw returns 0', 'Only when the DNS answer is cached'], answer: 0, why: 'The RFC says a client must try the lowest-numbered priority it can reach. `d` is a backup for when that group is unreachable.' },
					{ q: 'Does the weight 0 of `d` change anything here?', options: ['Yes: weight 0 removes it from the answer', 'Yes: weight 0 makes it the first choice', 'No: priority wins, and weight 0 means 50%', 'No: `d` is alone in its group, so weight orders nothing'], answer: 3, why: 'Weight only orders records that share a priority. With one record in the group, there is nothing to order.' },
					{ q: 'You add `20 10 8080 e.example.com.`. Which of `d` and `e` comes first in group 20?', options: ['`d`, because it was in the answer first', 'Either one, half the time each', '`e`, because a weight 0 record ends up last in its group', '`d`, because a lower weight wins'], answer: 2, why: 'A weight 0 record adds nothing to the running sum, so it never passes the test on line 24 while `sum > 0`.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'An SRV answer holds `10 50 443 a.example.com.`, `10 50 443 b.example.com.` and `5 0 443 c.example.com.`. Which host does an RFC 2782 client try first?',
			options: [
				'`a` or `b`, half the time each, because they carry the higher weight',
				'`c`, because priority 5 is the lowest number and priority comes before weight',
				'`a`, because it is the first record in the answer section',
				'Any of the three at random, because the client shuffles the whole answer'
			],
			answer: 1,
			why: 'The client must try the lowest-numbered priority it can reach. Weight only orders records that share the same priority, so the weights of `a` and `b` matter only if `c` is unreachable.'
		},
		{
			q: 'The HTTP check of one `web` instance in Consul turns critical. What does the next `dig @127.0.0.1 -p 8600 web.service.consul SRV` return?',
			options: [
				'All instances, with the failing one moved to the end of the answer',
				'An empty answer until the failing instance is deregistered by hand',
				'All instances, with weight 0 on the failing one so clients avoid it',
				'Only the instances whose checks pass; the failing one is left out'
			],
			answer: 3,
			why: 'Consul omits services that fail their health check from DNS results. Clients that query again stop seeing the broken instance, without any change to its weight or registration.'
		},
		{
			q: 'Inside Kubernetes, `checkout` connects to `web.prod.svc.cluster.local`, which resolves to one ClusterIP. Who chooses the Pod that serves the request?',
			options: [
				'`checkout`, which reads the list of Pod IPs from CoreDNS',
				'CoreDNS, which returns a different Pod IP for each query',
				'The kube-proxy rules on the node, because the caller only knows the ClusterIP',
				'The `web` Pod with the lowest IP, which forwards to the others'
			],
			answer: 2,
			why: 'A normal Service name resolves to its cluster IP only. The caller connects to that one address and the node\'s proxy rules pick a backend Pod, which is server-side discovery.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Register two instances in a local Consul, read them back as SRV records, and watch a failing health check drop one.',
		steps: [
			'Start a Consul dev agent: `docker run -d --name consul-lab -p 8500:8500 -p 8600:8600/udp hashicorp/consul:1.20 agent -dev -client=0.0.0.0`.',
			'Register two instances of `web` with a TTL check: `curl -X PUT localhost:8500/v1/agent/service/register -d \'{"ID":"web1","Name":"web","Address":"10.0.2.15","Port":8080,"Check":{"TTL":"10m"}}\'`, then the same with `"ID":"web2"` and `"Address":"10.0.2.16"`.',
			'Query right away: `dig @127.0.0.1 -p 8600 web.service.consul SRV +short`. Note what comes back.',
			'Report both checks as passing: `curl -X PUT localhost:8500/v1/agent/check/pass/service:web1`, and the same for `service:web2`. Run the `dig` again, then once more without `SRV`.',
			'Fail the first one: `curl -X PUT localhost:8500/v1/agent/check/fail/service:web1`, and run the SRV `dig` again. Clean up with `docker rm -f consul-lab`.'
		],
		done: [
			'Before any check passes, the SRV `dig` prints nothing.',
			'After both pass, it prints two lines of the form `1 1 8080 <target>`.',
			'The plain `dig` without `SRV` prints `10.0.2.15` and `10.0.2.16`, with no port.',
			'After the fail, the SRV `dig` prints one line only.'
		],
		solution: [
			'The empty first answer is the Consul default: a new check starts critical, so an instance joins the answers only after its first passing check.',
			'`dig @127.0.0.1 -p 8600 web.service.consul SRV` without `+short` shows the TTL column at `0`, so no resolver caches the answer.',
			'The SRV targets look like `0a00020f.addr.dc1.consul.`: that is 10.0.2.15 in hex. The port 8080 is only in the SRV answer, not in the A answer.',
			'Nobody edited a config file when `web1` failed. The next query just left it out.'
		]
	},
	recall: {
		q: 'In the SRV answer `10 60 8080 a.example.com.`, what are 10 and 60, and which records does a client try first?',
		a: '10 is the priority and 60 the weight. The client tries the lowest priority number first. Within one priority it picks by weight, so 60 out of a total of 100 means 60% of first picks.'
	},
	sources: [
		{ title: 'RFC 2782, A DNS RR for specifying the location of services (DNS SRV)', url: 'https://www.rfc-editor.org/rfc/rfc2782' },
		{ title: 'Consul docs, Perform static DNS queries', url: CONSUL_STATIC },
		{ title: 'Consul docs, Configure Consul DNS behavior', url: CONSUL_CFG },
		{ title: 'Consul docs, Define health checks', url: 'https://developer.hashicorp.com/consul/docs/register/health-check/vm' },
		{ title: 'Kubernetes docs, DNS for Services and Pods', url: 'https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/' },
		{ title: 'Go source, src/net/dnsclient.go', url: `${GO}/dnsclient.go` }
	]
};
