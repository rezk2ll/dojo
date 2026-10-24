const CHARTS = 'https://github.com/bitnami/charts/blob/bb5e98a6e3c5ca196420d2414769b681c9284101/bitnami/redis';
const DOCS = 'https://kubernetes.io/docs/concepts/services-networking/network-policies/';
const SRC = 'https://github.com/kubernetes/website/blob/2f85f2802e59eb2128543dbfbf114ad641db4be0/content/en/docs/concepts/services-networking/network-policies.md';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'network-policies',
	part: 'Debugging the network',
	title: 'Kubernetes NetworkPolicy',
	minutes: 10,
	hook: [
		'You copy the `default-deny-egress` policy from the Kubernetes docs into the namespace `shop`. Right after, every pod there fails to resolve `payments`. The docs warn about it in a caution box: "A default deny-all egress policy also blocks DNS traffic."',
		'Each DNS query now waits for a reply that never comes. With glibc defaults from resolv.conf(5), the resolver waits 5 seconds for an answer and sends the query 2 times before it returns an error.',
		'On a second cluster you apply the same policy and nothing changes at all. That cluster runs flannel alone, and **the API server stores a NetworkPolicy whether or not anything enforces it.**'
	],
	terms: [
		{ term: 'Isolated pod', def: 'A pod selected by at least one NetworkPolicy for a direction (ingress or egress). In that direction it accepts only the connections some policy allows.' },
		{ term: 'policyTypes', def: 'The list `Ingress`, `Egress` or both in a policy. It says which directions the policy isolates for the pods it selects.' },
		{ term: 'podSelector', def: 'A label selector. In `spec` it picks the pods the policy applies to, and `{}` picks every pod in the namespace. In a `from` or `to` entry it picks allowed peers.' },
		{ term: 'Network plugin', def: 'The CNI plugin that wires pod networking, such as Calico or Cilium. It watches NetworkPolicy objects and enforces them on each node.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['web["Pod app=web"] -->|"TCP 6379"| db["Pod role=db"]', 'web -->|"UDP 53"| dns["CoreDNS k8s-app=kube-dns"]'],
				highlight: ['web', 'db', 'dns'],
				note: 'No policy exists in `shop`. The docs: "By default, a pod is non-isolated for egress; all outbound connections are allowed." The same holds for ingress. `web` reaches `db` on 6379 and CoreDNS on 53.'
			},
			{
				add: ['deny["default-deny-all: podSelector {}, policyTypes Ingress and Egress"] -.-> web', 'deny -.-> db'],
				highlight: ['deny'],
				note: 'The `default-deny-all` policy selects every pod with `podSelector: {}` and lists both directions, with no rules. Every pod in `shop` is now isolated both ways. The connection to `db` and the DNS query to CoreDNS are dropped.'
			},
			{
				add: ['dnsok["allow-dns: egress to kube-system, k8s-app=kube-dns, port 53"] -.-> web'],
				highlight: ['dnsok', 'dns'],
				note: 'A second policy adds one egress rule: UDP and TCP 53 to pods labelled `k8s-app: kube-dns` in the namespace whose `kubernetes.io/metadata.name` is `kube-system`. Policies add up: "the connections allowed in that direction from that pod is the union of what the applicable policies allow". Order does not matter.'
			},
			{
				add: ['out["web: egress to role=db on 6379"] -.-> web', 'in["db: ingress from app=web on 6379"] -.-> db'],
				highlight: ['out', 'in'],
				note: 'For `web` to reach `db`, both ends must agree. The docs: "both the egress policy on the source pod and the ingress policy on the destination pod need to allow the connection." One policy opens egress on `web`, another opens ingress on `db`. The docs say reply traffic for the `web` to `db` connection "will also be implicitly allowed".'
			},
			{
				add: ['cni["Network plugin on each node: Calico, Cilium"] -->|"enforces policies"| web', 'cni -->|"enforces policies"| db'],
				highlight: ['cni'],
				note: 'The API server only stores these objects. The network plugin watches them and enforces them on each node. "Creating a NetworkPolicy resource without a controller that implements it will have no effect." Flannel\'s README says `flanneld` "does not natively enforce Network Policies".'
			}
		]
	},
	example: {
		title: 'bitnami/redis/templates/networkpolicy.yaml: the policy the Redis chart installs',
		repo: 'bitnami/charts',
		url: `${CHARTS}/templates/networkpolicy.yaml#L16-L57`,
		lang: 'yaml',
		code: `spec:
  podSelector:
    matchLabels: {{- include "common.labels.matchLabels" ( dict "customLabels" .Values.commonLabels "context" $ ) | nindent 6 }}
  policyTypes:
    - Ingress
    - Egress
  {{- if .Values.networkPolicy.allowExternalEgress }}
  egress:
    - {}
  {{- else }}
  egress:
    {{- if eq .Values.architecture "replication" }}
    # Allow dns resolution
    - ports:
        - port: 53
          protocol: UDP
    # Allow outbound connections to other cluster pods
    - ports:
        - port: {{ .Values.master.containerPorts.redis }}
        {{- if .Values.sentinel.enabled }}
        - port: {{ .Values.sentinel.containerPorts.sentinel }}
        {{- end }}
      to:
        - podSelector:
            matchLabels: {{- include "common.labels.matchLabels" ( dict "customLabels" .Values.commonLabels "context" $ ) | nindent 14 }}
    {{- end }}
    {{- if .Values.networkPolicy.extraEgress }}
    {{- include "common.tplvalues.render" ( dict "value" .Values.networkPolicy.extraEgress "context" $ ) | nindent 4 }}
    {{- end }}
  {{- end }}
  ingress:
    # Allow inbound connections
    - ports:
        - port: {{ .Values.master.containerPorts.redis }}
        {{- if .Values.sentinel.enabled }}
        - port: {{ .Values.sentinel.containerPorts.sentinel }}
        {{- end }}
      {{- if not .Values.networkPolicy.allowExternal }}
      from:
        - podSelector:
            matchLabels:
              {{ template "common.names.fullname" . }}-client: "true"`,
		notes: [
			'Lines 2 to 6 select the chart\'s own Redis pods and list both directions, so those pods are isolated for ingress and egress. In the chart\'s `values.yaml`, `networkPolicy.enabled` is `true` by default.',
			'Lines 7 to 9: `allowExternalEgress` defaults to `true`, which renders `egress: - {}`. An empty rule matches every destination, the same rule as the docs\' `allow-all-egress` example. Egress stays open.',
			'Lines 10 to 30 render only when you set `allowExternalEgress: false`. With the default `architecture: replication`, lines 14 to 16 open port 53 on UDP only. RFC 7766 says a client that gets a truncated UDP answer should "retry over TCP instead", and this policy drops that retry.',
			'Lines 38 to 42 add the `from` list only when `allowExternal` is `false`, and the default is `true`. With defaults, the rule on lines 33 and 34 has ports and no `from`, so any pod in any namespace can reach port 6379. With `false`, line 42 requires the label `<fullname>-client: "true"`.'
		]
	},
	tradeoff: {
		gain: [
			'After a deny-all policy, a pod in `shop` can open only the connections some policy lists. Traffic with its own node stays allowed.',
			'Policies select pods by label, so a new `app=web` replica gets the same rules the moment it starts, with no IP to update.',
			'Policies only add allowed connections, so their order never changes the result.'
		],
		cost: [
			'Without an egress rule for port 53, every DNS lookup ends in a timeout, after 2 tries of 5 seconds with glibc defaults.',
			'There is no deny rule and no log of blocked connections in the API. The docs list both as things "you can\'t do with network policies".',
			'With a network plugin that ignores policies, such as flannel alone, every object applies cleanly and filters nothing.',
			'A deny-all policy is only guaranteed to deny TCP, UDP and SCTP. For ICMP the docs say "the behaviour is undefined", so `ping` may work while `curl` is blocked.'
		]
	},
	task: {
		prompt: 'The namespace `shop` already has `default-deny-all`. Pods `app=web` must call pods `app=api` on TCP 8080 and resolve names through CoreDNS (pods `k8s-app: kube-dns` in `kube-system`). Write the smallest set of NetworkPolicy objects that makes this work, and say which pod each one selects.',
		hint: 'Count the pods that need a new hole and the direction of each. DNS is egress from the client, on two protocols.',
		answer: [
			'`allow-dns`: `podSelector: {}`, `policyTypes: [Egress]`, one egress rule `to: [{ namespaceSelector: { matchLabels: { kubernetes.io/metadata.name: kube-system } }, podSelector: { matchLabels: { k8s-app: kube-dns } } }]` with ports UDP 53 and TCP 53. Both selectors sit in one `to` entry, so both must match.',
			'`web-to-api`: `podSelector: { matchLabels: { app: web } }`, `policyTypes: [Egress]`, egress `to: [{ podSelector: { matchLabels: { app: api } } }]`, port TCP 8080.',
			'`api-from-web`: `podSelector: { matchLabels: { app: api } }`, `policyTypes: [Ingress]`, ingress `from: [{ podSelector: { matchLabels: { app: web } } }]`, port TCP 8080.',
			'Three objects. The connection needs egress on `web` and ingress on `api`, because deny-all isolated both pods both ways. Replies need no rule.'
		],
		steps: [
			{
				title: 'Count the holes',
				questions: [
					{ q: 'After `default-deny-all`, which pods in `shop` are isolated?', options: ['Only pods with no labels', 'Every pod, for ingress and egress', 'Every pod, for ingress only', 'Only `web` and `api`'], answer: 1, why: '`podSelector: {}` selects every pod in the namespace, and both directions are listed with no rules.' },
					{ q: 'For `web` to reach `api` on 8080, what must be allowed?', options: ['Ingress on `api` only', 'Egress on `web` only', 'Egress on `web` and ingress on `api`', 'One policy on the `api` Service'], answer: 2, why: 'Both ends are isolated. The egress policy on the source and the ingress policy on the destination must both allow the connection.' },
					{ q: 'In which direction is the DNS query a new hole?', options: ['Egress from the client pods', 'Ingress on the client pods', 'Ingress on CoreDNS in `shop`', 'No hole: DNS is always allowed'], answer: 0, why: 'The client sends the query out. Deny-all blocked that egress, and the docs warn it also blocks DNS.' },
					{ q: 'Which protocols does DNS need on port 53?', options: ['UDP only', 'TCP only', 'ICMP and UDP', 'UDP and TCP'], answer: 3, why: 'Queries start on UDP. RFC 7766 says a client that gets a truncated UDP answer should retry over TCP.' }
				]
			},
			{
				title: 'Open DNS',
				questions: [
					{ q: 'In the answer, which pods does `allow-dns` select?', options: ['Only `app=web`', 'Every pod in `shop`, with `podSelector: {}`', 'The CoreDNS pods', 'Every pod in the cluster'], answer: 1, why: 'A spec `podSelector: {}` picks every pod in the policy\'s namespace, so all of `shop` can resolve names.' },
					{ q: 'Which `policyTypes` does it list?', options: ['`[Egress]`', '`[Ingress]`', '`[Ingress, Egress]`', 'None: the type is inferred from `to`'], answer: 0, why: 'It only opens the outbound query. The ingress side of `shop` stays as deny-all left it.' },
					{ q: 'The `to` entry holds both a `namespaceSelector` and a `podSelector`. What does that mean?', options: ['Either selector is enough', 'The namespace selector is ignored', 'Only the first selector counts', 'Both must match at once'], answer: 3, why: 'Selectors in one `to` item must all match. Two separate items would allow either one.' },
					{ q: 'Which label picks the `kube-system` namespace?', options: ['`k8s-app: kube-dns`', '`name: kube-system`', '`kubernetes.io/metadata.name: kube-system`', '`app: coredns`'], answer: 2, why: 'The answer and the diagram use the `kubernetes.io/metadata.name` label for the namespace, and `k8s-app: kube-dns` for the pods.' }
				]
			},
			{
				title: 'Open `web` to `api`',
				questions: [
					{ q: 'Which pods does `web-to-api` select?', options: ['`app: api`', '`app: web`', 'Every pod in `shop`', 'The CoreDNS pods'], answer: 1, why: 'It opens egress, so it selects the source pods, `app=web`, and lists `app=api` in `to`.' },
					{ q: 'Which pods does `api-from-web` select?', options: ['`app: api`', '`app: web`', 'Every pod in `shop`', 'No pods: it selects the Service'], answer: 0, why: 'It opens ingress, so it selects the destination pods, `app=api`, and lists `app=web` in `from`.' },
					{ q: 'Which port do both rules name?', options: ['UDP 53', 'TCP 6379', 'TCP 80', 'TCP 8080'], answer: 3, why: 'The task says `web` calls `api` on TCP 8080.' },
					{ q: 'Why not one policy that does both sides?', options: ['A policy cannot list ports', 'A policy cannot select by label', 'The two sides select different pods', 'Two policies are faster'], answer: 2, why: 'A policy applies to the pods its spec `podSelector` picks. The two directions sit on two different sets of pods.' }
				]
			},
			{
				title: 'Check the set',
				questions: [
					{ q: 'How many NetworkPolicy objects does the answer add?', options: ['Three', 'Two', 'One', 'Four'], answer: 0, why: '`allow-dns`, `web-to-api` and `api-from-web`. Each opens one hole on one set of pods.' },
					{ q: 'Do the replies from `api` back to `web` need a rule?', options: ['Yes, an egress rule on `api`', 'Yes, an ingress rule on `web`', 'Only for UDP', 'No, replies are implicitly allowed'], answer: 3, why: 'The docs say reply traffic for an allowed connection is implicitly allowed.' },
					{ q: 'Does the order you apply the three policies matter?', options: ['Yes, the last one wins', 'Yes, deny-all must be applied last', 'No, the allowed set is a union', 'Only within one namespace'], answer: 2, why: 'Policies only add allowed connections, so their order never changes the result.' },
					{ q: 'The cluster runs flannel alone. What do the three policies change?', options: ['Only the DNS policy works', 'Nothing: flannel does not enforce them', 'Everything, once kube-proxy restarts', 'They block all traffic'], answer: 1, why: 'The API server stores the objects, and only a network plugin that enforces policies turns them into filter rules.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'An ingress rule has `from:` with two list items, `- namespaceSelector: {user: alice}` and `- podSelector: {role: client}`. Which pods can connect?',
			options: [
				'Pods labelled `role=client` that run in namespaces labelled `user=alice`',
				'Any pod in a namespace labelled `user=alice`, or `role=client` pods in this namespace',
				'Only `role=client` pods, and only when this namespace is labelled `user=alice`',
				'No pod, because a rule cannot mix namespace and pod selectors'
			],
			answer: 1,
			why: 'Each item of `from` is a separate peer, and the rule allows any of them. Putting both selectors in one item would require both to match. The docs show the two YAML shapes side by side for this reason.'
		},
		{
			q: 'After `default-deny-all`, you add egress from `web` to `api` on 8080 and ingress on `api` from `web`. `curl http://api:8080` fails with "Could not resolve host". Why?',
			options: [
				'The `api` Service needs its own policy, separate from the `api` pods',
				'The egress rule must list the ClusterIP of `api`, not a podSelector',
				'Egress from `web` to CoreDNS on port 53 is still blocked by deny-all',
				'Ingress on `api` must also allow UDP, because curl starts with UDP'
			],
			answer: 2,
			why: 'The name `api` is resolved first, with a query to CoreDNS on port 53. Deny-all isolated `web` for egress, and no policy allows that query. The docs: "A default deny-all egress policy also blocks DNS traffic."'
		},
		{
			q: '`kubectl get networkpolicy` lists your deny-all policy, yet every pod still reaches every other pod. What is the most likely cause?',
			options: [
				'The policy must be restarted with `kubectl rollout restart`',
				'Policies apply only to pods created after a node reboot',
				'kube-proxy has to be reconfigured to read NetworkPolicy objects',
				'The cluster\'s network plugin does not enforce NetworkPolicy'
			],
			answer: 3,
			why: 'The API server stores the object, and only the network plugin turns it into filter rules on the nodes. A plugin like flannel on its own does not enforce policies, so the object has no effect.'
		}
	],
	lab: {
		minutes: 30,
		goal: 'Break DNS with a deny-all policy on a real cluster, then open exactly the three holes the task asks for.',
		steps: [
			'Start a cluster whose network plugin enforces policies: `minikube start -p netpol-lab --cni=calico`.',
			'Create the namespace and the pods: `kubectl create namespace shop`, `kubectl -n shop create deployment api --image=nginx:1.27`, `kubectl -n shop expose deployment api --port=80`, then `kubectl -n shop run web --image=nicolaka/netshoot:v0.13 --labels=app=web -- sleep 3600`. Wait for them: `kubectl -n shop wait --for=condition=Ready pod --all --timeout=180s`.',
			'Check the path works: `kubectl -n shop exec web -- curl -s -o /dev/null -w \'%{http_code}\\n\' --max-time 20 http://api/`.',
			'Apply deny-all: `echo \'{"apiVersion":"networking.k8s.io/v1","kind":"NetworkPolicy","metadata":{"name":"default-deny-all","namespace":"shop"},"spec":{"podSelector":{},"policyTypes":["Ingress","Egress"]}}\' | kubectl apply -f -`, and run the same `curl` again.',
			'Write `allow-dns`, `web-to-api` and `api-from-web` from the task, with port TCP 80 in place of 8080, apply them, and run the `curl` once more. Clean up with `minikube delete -p netpol-lab`.'
		],
		done: [
			'Before any policy, `curl` prints `200`.',
			'After deny-all, `curl` does not print `200`: it fails on the name `api` or hits the 20 s limit.',
			'After the three policies, `curl` prints `200` again.',
			'`kubectl -n shop delete networkpolicy api-from-web` makes the `curl` fail again, although DNS still works.'
		],
		solution: [
			'`allow-dns`: `{"apiVersion":"networking.k8s.io/v1","kind":"NetworkPolicy","metadata":{"name":"allow-dns","namespace":"shop"},"spec":{"podSelector":{},"policyTypes":["Egress"],"egress":[{"to":[{"namespaceSelector":{"matchLabels":{"kubernetes.io/metadata.name":"kube-system"}},"podSelector":{"matchLabels":{"k8s-app":"kube-dns"}}}],"ports":[{"protocol":"UDP","port":53},{"protocol":"TCP","port":53}]}]}}`',
			'`web-to-api`: `"podSelector":{"matchLabels":{"app":"web"}}`, `"policyTypes":["Egress"]`, `"egress":[{"to":[{"podSelector":{"matchLabels":{"app":"api"}}}],"ports":[{"protocol":"TCP","port":80}]}]`.',
			'`api-from-web`: `"podSelector":{"matchLabels":{"app":"api"}}`, `"policyTypes":["Ingress"]`, `"ingress":[{"from":[{"podSelector":{"matchLabels":{"app":"web"}}}],"ports":[{"protocol":"TCP","port":80}]}]`.',
			'The last check is the lesson: egress on `web` alone is not enough. The ingress side on `api` must agree too.'
		]
	},
	recall: {
		q: 'What does a pod in a namespace with no NetworkPolicy accept, and what must allow a connection from pod A to pod B once both are isolated?',
		a: 'With no policy, every inbound and outbound connection is allowed. Once isolated, an egress rule on A and an ingress rule on B must both allow it, and the network plugin (Calico, Cilium) must enforce them.'
	},
	sources: [
		{ title: 'Kubernetes docs, Network Policies, read 2026-10-17', url: DOCS },
		{ title: 'kubernetes/website, network-policies.md at the commit read', url: SRC },
		{ title: 'bitnami/charts, redis networkpolicy.yaml', url: `${CHARTS}/templates/networkpolicy.yaml` },
		{ title: 'bitnami/charts, redis values.yaml', url: `${CHARTS}/values.yaml#L1631-L1643` },
		{ title: 'flannel README, Network Policy', url: 'https://github.com/flannel-io/flannel/blob/0f70536f15f281279dab39fb9d575c646c7eea34/README.md#L23-L30' },
		{ title: 'resolv.conf(5), man7.org', url: 'https://man7.org/linux/man-pages/man5/resolv.conf.5.html' },
		{ title: 'RFC 7766, DNS Transport over TCP', url: 'https://www.rfc-editor.org/rfc/rfc7766' }
	]
};
