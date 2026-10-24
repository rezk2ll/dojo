const K8S = 'https://github.com/kubernetes/kubernetes/blob/949f064e6d9e32f0a597795c265fcd50c6aad66e/pkg/proxy/iptables/proxier.go';
const VIPS = 'https://kubernetes.io/docs/reference/networking/virtual-ips/';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'kubernetes-services',
	part: 'Debugging the network',
	title: 'Kubernetes Services and kube-proxy',
	minutes: 10,
	hook: [
		'A Pod cannot reach the `web` Service, so you open a shell in it and run `ping 10.96.0.20`, the ClusterIP. Every echo request goes unanswered: 100% packet loss. You start to suspect the network plugin.',
		'Then `curl http://10.96.0.20/` returns the page at once. The Service was fine all along. A ClusterIP is a virtual address: kube-proxy writes rules on every node that rewrite TCP, UDP or SCTP packets for the Service port to a Pod address.',
		'An ICMP echo matches none of those rules, so no rule sends it to a Pod. The rest of this chapter follows one connection through the rules kube-proxy writes in its default iptables mode.'
	],
	terms: [
		{ term: 'ClusterIP', def: 'The virtual IP address Kubernetes gives a Service, such as 10.96.0.20. kube-proxy rules on each node capture traffic to this address and port and rewrite it to a Pod.' },
		{ term: 'kube-proxy', def: 'The agent on every node that watches Services and EndpointSlices and writes the matching iptables, nftables or IPVS rules.' },
		{ term: 'Endpoint', def: 'One backend of a Service, usually a Pod address and port such as 10.244.2.7:8080, listed in an EndpointSlice.' },
		{ term: 'NodePort', def: 'A port from 30000 to 32767 by default, opened on every node, that leads to the same Service.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['pod["client Pod 10.244.1.5"] -->|"SYN to 10.96.0.20:80"| ks["nat PREROUTING and OUTPUT jump to KUBE-SERVICES"]'],
				highlight: ['pod', 'ks'],
				note: 'kube-proxy adds jumps from the nat `PREROUTING` and `OUTPUT` chains to its own `KUBE-SERVICES` chain. Packets that enter the node, and packets that a local process sends, pass through that chain.'
			},
			{
				add: ['ks -->|"-p tcp -d 10.96.0.20 --dport 80"| svc["KUBE-SVC chain of web:http"]'],
				highlight: ['svc'],
				note: '`KUBE-SERVICES` holds one rule per Service port. This one matches protocol TCP, destination 10.96.0.20 and port 80, and jumps to the chain of the `web` Service.'
			},
			{
				add: ['svc -->|"probability 0.3333333333"| e1["KUBE-SEP: DNAT 10.244.2.7:8080"]', 'svc -->|"probability 0.5"| e2["KUBE-SEP: DNAT 10.244.3.4:8080"]', 'svc -->|"last rule, always"| e3["KUBE-SEP: DNAT 10.244.1.9:8080"]'],
				highlight: ['e1', 'e2', 'e3'],
				note: 'With 3 endpoints, the first rule matches with probability 1/3. The second sees the remaining 2/3 and matches half of them. The last rule takes the rest. Each Pod gets 1/3 of new connections.'
			},
			{
				add: ['e1 -->|"destination rewritten"| p1["Pod 10.244.2.7:8080"]'],
				highlight: ['p1'],
				note: 'The endpoint chain rewrites the destination to 10.244.2.7:8080 and the packet is routed to that Pod. The docs: packets go to the backend "without rewriting the client IP address". Conntrack sends the rest of the connection to the same Pod.'
			},
			{
				add: ['icmp["ping 10.96.0.20: ICMP echo"] -.->|"no rule matches ICMP"| none["no DNAT, no Pod, no reply"]'],
				highlight: ['icmp', 'none'],
				note: 'The capture rule in step 2 names a protocol and a port. A Service port can only be TCP, UDP or SCTP, so an ICMP echo never matches. Nothing sends it to a Pod, and no reply comes back.'
			},
			{
				add: ['ext["client outside: node IP, port 30080"] -->|"KUBE-NODEPORTS"| svc'],
				highlight: ['ext'],
				note: 'A NodePort Service also opens the same port, here 30080, on every node. A rule in `KUBE-NODEPORTS` jumps to the same `KUBE-SVC` chain. The docs warn that on this path "the client IP address does get altered".'
			}
		]
	},
	example: {
		title: 'kubernetes pkg/proxy/iptables/proxier.go: writeServiceToEndpointRules',
		repo: 'kubernetes/kubernetes',
		url: `${K8S}#L1430-L1474`,
		lang: 'go',
		code: `func (proxier *Proxier) writeServiceToEndpointRules(natRules proxyutil.LineBuffer, svcPortNameString string, svcInfo proxy.ServicePort, svcChain utiliptables.Chain, endpoints []proxy.Endpoint, args []string) {
	// First write session affinity rules, if applicable.
	if svcInfo.SessionAffinityType() == v1.ServiceAffinityClientIP {
		for _, ep := range endpoints {
			epInfo, ok := ep.(*endpointInfo)
			if !ok {
				continue
			}
			comment := fmt.Sprintf(\`"%s -> %s"\`, svcPortNameString, epInfo.String())

			args = append(args[:0],
				"-A", string(svcChain),
			)
			args = proxier.appendServiceCommentLocked(args, comment)
			args = append(args,
				"-m", "recent", "--name", string(epInfo.ChainName),
				"--rcheck", "--seconds", strconv.Itoa(svcInfo.StickyMaxAgeSeconds()), "--reap",
				"-j", string(epInfo.ChainName),
			)
			natRules.Write(args)
		}
	}

	// Now write loadbalancing rules.
	numEndpoints := len(endpoints)
	for i, ep := range endpoints {
		epInfo, ok := ep.(*endpointInfo)
		if !ok {
			continue
		}
		comment := fmt.Sprintf(\`"%s -> %s"\`, svcPortNameString, epInfo.String())

		args = append(args[:0], "-A", string(svcChain))
		args = proxier.appendServiceCommentLocked(args, comment)
		if i < (numEndpoints - 1) {
			// Each rule is a probabilistic match.
			args = append(args,
				"-m", "statistic",
				"--mode", "random",
				"--probability", proxier.probability(numEndpoints-i))
		}
		// The final (or only if n == 1) rule is a guaranteed match.
		natRules.Write(args, "-j", string(epInfo.ChainName))
	}
}`,
		notes: [
			'Lines 33 to 40 write one rule per endpoint into the Service chain. Line 40 passes `numEndpoints - i`, and [`computeProbability`](' + K8S + '#L390-L392) formats `1.0/n` with 10 decimals: `0.3333333333`, then `0.5000000000` for 3 endpoints.',
			'Line 35 skips the probability on the last endpoint, and line 43 writes its jump with no condition. A new connection always ends in one endpoint chain, and each of n Pods gets 1/n of them.',
			'Each endpoint chain ends with the rewrite on [lines 1240 and 1241](' + K8S + '#L1240-L1241): `-m protocol -p protocol -j DNAT --to-destination` the Pod IP and port.',
			'Lines 3 to 22 handle `sessionAffinity: ClientIP`. The `recent` match on lines 16 and 17 sends a client back to the endpoint it used within `StickyMaxAgeSeconds`, before the random rules on lines 33 to 43 run.',
			'The capture rule that jumps here sits on [lines 922 to 930](' + K8S + '#L922-L930): `-m protocol -p protocol -d` the ClusterIP `--dport` the port. Without a protocol and a port, an ICMP packet has nothing to match.'
		]
	},
	tradeoff: {
		gain: [
			'No proxy process sits in the data path. The kernel rewrites the destination, and for ClusterIP traffic the Pod sees the real client IP.',
			'Every node holds the same rules, so a client on any node reaches the Service at the same ClusterIP.',
			'A Service with no endpoints gets a `REJECT` rule, so clients fail at once with "Connection refused" instead of waiting for a timeout.'
		],
		cost: [
			'kube-proxy picks a Pod once per new connection. A client that keeps one connection open, such as gRPC in chapter 32, stays on one Pod.',
			'`ping` to a ClusterIP never answers, so it cannot test a Service. Test the port with `curl` or `nc` instead.',
			'NodePort and load balancer traffic can lose the client IP: the docs say the address "does get altered" on that path.'
		]
	},
	task: {
		prompt: 'A Service `prod/api` with port `http` has 4 ready Pods. In `iptables-save -t nat`, its `KUBE-SVC` chain has four rules, as the code above writes them: `--probability 0.2500000000 -j KUBE-SEP-A`, `--probability 0.3333333333 -j KUBE-SEP-B`, `--probability 0.5000000000 -j KUBE-SEP-C`, then `-j KUBE-SEP-D`. What share of new connections reaches each Pod? Then someone scales the Deployment to 0 replicas. What does `curl http://<ClusterIP>/` print?',
		hint: 'Multiply the chance of reaching a rule by the chance that it matches. For the second question, look at the `!hasEndpoints` branch of the proxier.',
		answer: [
			'A: 0.25. B: 0.75 x 1/3 = 0.25. C: 0.75 x 2/3 x 1/2 = 0.25. D gets the remaining 0.25. Each Pod gets a quarter of new connections.',
			'With no endpoint, kube-proxy writes no nat chain for the Service. It writes a filter rule with comment `"prod/api:http has no endpoints"` and target `REJECT` ([lines 888 to 897](https://github.com/kubernetes/kubernetes/blob/949f064e6d9e32f0a597795c265fcd50c6aad66e/pkg/proxy/iptables/proxier.go#L888-L897)).',
			'`REJECT` with no option sends an ICMP port unreachable, and the kernel turns that into `ECONNREFUSED`. `curl` fails at once with "Connection refused". That error points at the Service having no Pods.'
		],
		steps: [
			{
				title: 'Read the chain',
				questions: [
					{ q: 'In what order does a new connection meet the four rules?', options: ['All four at once, and the kernel picks one', 'Top to bottom, until one matches', 'From D up to A', 'In a random order each time'], answer: 1, why: 'The rules of a chain run top to bottom. The first one that matches jumps to its endpoint chain.' },
					{ q: 'What does `--probability 0.2500000000` on the first rule mean?', options: ['A gets 25% of the bandwidth', '25% of packets in a connection go to A', 'The rule matches a quarter of the connections that reach it', 'A has a weight of 25 out of 100'], answer: 2, why: 'The `statistic` match in `random` mode matches with that chance. Only connections that reach the rule are tested.' },
					{ q: 'Why does the rule for D have no probability?', options: ['It is the last rule, so it always matches', 'D is the busiest Pod', 'kube-proxy forgot to write it', 'D gets no traffic'], answer: 0, why: 'Line 35 skips the probability on the last endpoint, so a connection that skipped the others always lands there.' },
					{ q: 'When do these rules run for a client?', options: ['On every HTTP request', 'On every packet, independently', 'Once a minute, when kube-proxy syncs', 'Once, when a new connection starts'], answer: 3, why: 'The nat rules choose when the connection starts. Conntrack sends the rest of it to the same Pod.' }
				]
			},
			{
				title: 'Work out A and B',
				questions: [
					{ q: 'What share of new connections goes to A?', options: ['0.25', '0.33', '0.5', '1.0'], answer: 0, why: 'Every new connection reaches the first rule, and it matches with probability 0.25.' },
					{ q: 'What share of connections reaches the rule for B?', options: ['0.25', '0.5', '0.75', '1.0'], answer: 2, why: 'The ones A did not take: 1 - 0.25 = 0.75.' },
					{ q: 'So what share goes to B?', options: ['0.33', '0.25', '0.75', '0.5'], answer: 1, why: '0.75 × 1/3 = 0.25. The rule matches a third of the three quarters that reach it.' },
					{ q: 'What share reaches the rule for C?', options: ['0.25', '0.33', '0.75', '0.5'], answer: 3, why: '0.75 reached B and 0.25 went to B, so 0.5 is left.' }
				]
			},
			{
				title: 'Work out C and D',
				questions: [
					{ q: 'What share goes to C?', options: ['0.5', '0.25', '0.125', '0.33'], answer: 1, why: '0.75 × 2/3 × 1/2 = 0.25: half of the half that reaches C.' },
					{ q: 'What share goes to D?', options: ['0.25', '0', '0.5', '0.125'], answer: 0, why: 'D takes every connection left after C: the remaining 0.25.' },
					{ q: 'Where do the numbers 0.25, 0.333 and 0.5 come from?', options: ['The CPU load of each Pod', 'The age of each Pod', '`1.0/n` for n = 4, 3, then 2 endpoints left', 'Weights set in the Service spec'], answer: 2, why: 'Line 40 passes `numEndpoints - i`, and `computeProbability` formats `1.0/n`. Each rule splits evenly among the endpoints still left.' },
					{ q: 'With 5 ready Pods, what probability does the first rule get?', options: ['0.25', '0.5', '0.1', '0.2'], answer: 3, why: '`1.0/5` is 0.2. The pattern always gives each of n Pods 1/n of new connections.' }
				]
			},
			{
				title: 'Scale to 0',
				questions: [
					{ q: 'With no endpoint left, what does kube-proxy write for `prod/api:http`?', options: ['A `KUBE-SVC` chain with no rules', 'A filter rule with target `REJECT` and comment "has no endpoints"', 'Nothing at all', 'A DNAT rule to the node IP'], answer: 1, why: 'The `!hasEndpoints` branch writes no nat chain and adds a `REJECT` rule in the filter table.' },
					{ q: 'What does `REJECT` with no option send back?', options: ['An ICMP port unreachable', 'A TCP RST', 'Nothing', 'An HTTP 503'], answer: 0, why: 'With no `--reject-with`, iptables `REJECT` answers with ICMP port unreachable.' },
					{ q: 'What does `curl http://<ClusterIP>/` print?', options: ['A timeout after about two minutes', 'An empty reply from the server', 'A 503 page from kube-proxy', '"Connection refused", at once'], answer: 3, why: 'The kernel turns the ICMP port unreachable into `ECONNREFUSED`, so `connect()` fails right away.' },
					{ q: 'What does that error tell you to check first?', options: ['The CNI plugin', 'The node firewall', 'Whether the Service has any ready Pods', 'DNS for the Service name'], answer: 2, why: 'kube-proxy rejects on purpose when a Service has no endpoints. A refused connection to a ClusterIP points there first.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'From inside a Pod, `ping 10.96.0.20` gets no reply, but `curl http://10.96.0.20/` works. Why?',
			options: [
				'The network plugin drops all ICMP traffic between Pods and Services by default',
				'kube-proxy rules match only the Service protocol and port, so ICMP never reaches a Pod',
				'The Service Pods run as non-root users and so cannot answer an ICMP echo request',
				'ping uses UDP, and the Service only defines a TCP port'
			],
			answer: 1,
			why: 'The capture rule matches `-p tcp -d 10.96.0.20 --dport 80`. A Service port can only be TCP, UDP or SCTP, so an ICMP echo matches no rule and is never rewritten to a Pod address.'
		},
		{
			q: 'A Service has 2 endpoints. Which rules does kube-proxy write in its `KUBE-SVC` chain?',
			options: [
				'One rule per endpoint, each with probability 0.5000000000',
				'One rule that sends packets to both endpoints in turn',
				'A rule with probability 0.5000000000 to the first, then an unconditional jump to the second',
				'One rule with probability 1.0 per endpoint, and the kernel picks the shorter queue'
			],
			answer: 2,
			why: 'Every endpoint but the last gets `-m statistic --mode random --probability 1/(n-i)`. The last rule has no condition, so a connection that skipped the first rule always reaches the second.'
		},
		{
			q: 'A client opens one TCP connection to a ClusterIP and sends 500 HTTP requests on it. How are they spread over 3 Pods?',
			options: [
				'All 500 go to one Pod, because the rules choose once per connection',
				'About 167 to each Pod, because each request is matched again',
				'In turn: request 1 to Pod 1, request 2 to Pod 2, and so on',
				'To the Pod with the lowest latency, measured by kube-proxy'
			],
			answer: 0,
			why: 'The nat rules run when the connection starts. Conntrack applies the same rewrite to every later packet of that connection, so all its requests reach the same Pod.'
		}
	],
	lab: {
		minutes: 25,
		goal: 'Read the rules kube-proxy writes for a Service, see why `ping` fails while `curl` works, and see the `REJECT` of a Service with no Pods.',
		steps: [
			'Start a local cluster: `minikube start -p svc-lab`.',
			'Create a Service with 3 Pods: `kubectl create deployment web --image=nginx:1.27 --replicas=3 && kubectl expose deployment web --port=80`. Start a client: `kubectl run client --image=nicolaka/netshoot:v0.13 -- sleep 3600`. Wait for both: `kubectl rollout status deployment web && kubectl wait --for=condition=Ready pod/client`.',
			'Read the ClusterIP with `kubectl get svc web`. Then `kubectl exec client -- ping -c 3 -W 1 <ClusterIP>` and `kubectl exec client -- curl -s -o /dev/null -w \'%{http_code}\\n\' http://web/`.',
			'Read the nat rules on the node: `minikube -p svc-lab ssh -- sudo iptables-save -t nat | grep default/web`.',
			'Scale to zero with `kubectl scale deployment web --replicas=0`, then run the `curl` again and `minikube -p svc-lab ssh -- sudo iptables-save -t filter | grep "has no endpoints"`. Clean up with `minikube delete -p svc-lab`.'
		],
		done: [
			'`ping` to the ClusterIP reports `100% packet loss`, and `curl` prints `200`.',
			'The nat dump shows one `KUBE-SERVICES` rule for the ClusterIP and port 80, and three rules in the `KUBE-SVC` chain of `default/web` that jump to a `KUBE-SEP` chain.',
			'Two of those three jumps carry `-m statistic --mode random --probability`, and the last one has none.',
			'After the scale to zero, `curl` fails at once (exit code 7), and the filter dump shows a `REJECT` rule for `default/web`.'
		],
		solution: [
			'The `KUBE-SERVICES` rule matches `-p tcp`, the ClusterIP and `--dport 80`. ICMP has no port, so `ping` matches nothing and nobody answers.',
			'The two probabilities are about 1/3 and 1/2: each of the 3 Pods gets a third of new connections.',
			'The fast failure is the `REJECT`: an ICMP port unreachable that the kernel turns into "Connection refused". A refused ClusterIP means "check the endpoints" before "check the network".'
		]
	},
	recall: {
		q: 'Why does a ClusterIP not answer `ping`, and how does kube-proxy choose among 3 Pods?',
		a: 'kube-proxy rules match only the Service protocol (TCP, UDP or SCTP) and port, so ICMP is never rewritten to a Pod. For 3 Pods it writes rules with probability 0.3333333333, then 0.5, then an unconditional last rule: 1/3 of new connections each.'
	},
	sources: [
		{ title: 'Kubernetes docs, Virtual IPs and Service Proxies', url: VIPS },
		{ title: 'Kubernetes docs, Service', url: 'https://kubernetes.io/docs/concepts/services-networking/service/' },
		{ title: 'Kubernetes docs, Protocols for Services', url: 'https://kubernetes.io/docs/reference/networking/service-protocols/' },
		{ title: 'Kubernetes source, pkg/proxy/iptables/proxier.go', url: K8S },
		{ title: 'iptables-extensions(8), statistic match and REJECT target', url: 'https://man7.org/linux/man-pages/man8/iptables-extensions.8.html' }
	]
};
