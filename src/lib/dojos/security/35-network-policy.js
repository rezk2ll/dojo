const ING = 'https://github.com/kubernetes/ingress-nginx/blob/dbb11b92ddb77bee9c35e462479129354c84f939';
const K8S = 'https://github.com/kubernetes/kubernetes/blob/949f064e6d9e32f0a597795c265fcd50c6aad66e';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'network-policy',
	part: 'Running safely',
	title: 'Network policies',
	minutes: 10,
	hook: [
		'On 24 March 2025, Wiz Research published IngressNightmare: four remote code execution bugs in the ingress-nginx controller. The worst, CVE-2025-1974, scored 9.8. The Kubernetes blog: it "allows anything on the Pod network" to inject configuration through the controller’s validating admission webhook.',
		'Wiz describes the webhook as "an unauthenticated HTTP endpoint" inside the controller Pod. The controller can read every Secret in the cluster by default. Wiz counted over 6,500 clusters that exposed this webhook to the public internet.',
		'The fix was ingress-nginx 1.12.1 or 1.11.5. One of Wiz’s mitigations: "Enforce strict network policies so only the Kubernetes API Server can access the admission controller." A **NetworkPolicy** lists which Pods, namespaces and IP ranges may open connections to a Pod.'
	],
	terms: [
		{ term: 'NetworkPolicy', def: 'A namespaced Kubernetes object that selects Pods by label and lists the connections allowed into them (`ingress`) and out of them (`egress`).' },
		{ term: 'Isolated Pod', def: 'A Pod selected by at least one policy for a direction. For that direction, only the connections some policy allows get through. A Pod no policy selects accepts everything.' },
		{ term: 'Default deny', def: 'A policy with an empty `podSelector` and no rules. It selects every Pod in the namespace and allows nothing, so other policies then open only what you list.' },
		{ term: 'Network plugin', def: 'The CNI component that enforces policies. The docs: a NetworkPolicy "without a controller that implements it will have no effect".' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['atk["Any Pod on the Pod network"] -->|"HTTPS to port 8443"| wh["ingress-nginx admission webhook"]', 'wh --> sec["Controller can read all Secrets in the cluster"]'],
				highlight: ['atk', 'wh'],
				note: 'The attack path. With no policy in the namespace, the controller Pod is "non-isolated for ingress", and "all inbound connections are allowed". Any compromised Pod can send a crafted admission request to port 8443.'
			},
			{
				add: ['deny["default-deny-all: podSelector empty, policyTypes Ingress and Egress"] -.->|"isolates every Pod in the namespace"| wh'],
				highlight: ['deny'],
				note: 'Step one of the defence. The docs’ `default-deny-all` policy selects every Pod and lists no rules, so no connection in or out is allowed. Policies are additive: the next ones can only open paths.'
			},
			{
				add: ['api["kube-apiserver"] -->|"admission review"| allow["Allow: ipBlock of the API server, TCP 8443"]', 'allow --> wh'],
				highlight: ['api', 'allow'],
				note: 'Allow by source. The webhook only needs calls from the API server, so the rule names the API server’s addresses with an `ipBlock`. A rule with `from` set allows "only if the traffic matches at least one item in the from list".'
			},
			{
				add: ['eg["Egress allow: kube-system Pods with k8s-app=kube-dns, port 53"] -.->|"DNS still resolves"| wh'],
				highlight: ['eg'],
				note: 'Egress rules. The docs warn that a default deny on egress "also blocks DNS traffic". The cluster DNS Pods carry `k8s-app=kube-dns` in `kube-system`, and the service listens on 53/UDP and 53/TCP.'
			},
			{
				add: ['cni["Network plugin without NetworkPolicy support"] -.->|"objects accepted, nothing enforced"| deny'],
				highlight: ['cni'],
				note: 'The trap. The docs: "Creating a NetworkPolicy resource without a controller that implements it will have no effect." The object is created, and every connection still goes through.'
			}
		]
	},
	example: {
		title: 'charts/ingress-nginx/templates/controller-networkpolicy.yaml: the policy the chart ships',
		repo: 'kubernetes/ingress-nginx',
		url: `${ING}/charts/ingress-nginx/templates/controller-networkpolicy.yaml#L1-L45`,
		lang: 'yaml',
		code: `{{- if .Values.controller.networkPolicy.enabled }}
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  labels:
    {{- include "ingress-nginx.labels" . | nindent 4 }}
    app.kubernetes.io/component: controller
    {{- with .Values.controller.labels }}
    {{- toYaml . | nindent 4 }}
    {{- end }}
  name: {{ include "ingress-nginx.controller.fullname" . }}
  namespace: {{ include "ingress-nginx.namespace" . }}
spec:
  podSelector:
    matchLabels:
      {{- include "ingress-nginx.selectorLabels" . | nindent 6 }}
      app.kubernetes.io/component: controller
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - ports:
      {{- range $key, $value := .Values.controller.containerPort }}
        - protocol: TCP
          port: {{ $value }}
      {{- end }}
      {{- if .Values.controller.metrics.enabled }}
        - protocol: TCP
          port: {{ .Values.controller.metrics.port }}
      {{- end }}
      {{- if .Values.controller.admissionWebhooks.enabled }}
        - protocol: TCP
          port: {{ .Values.controller.admissionWebhooks.port }}
      {{- end }}
      {{- range $key, $value := .Values.tcp }}
        - protocol: TCP
          port: {{ $key }}
      {{- end }}
      {{- range $key, $value := .Values.udp }}
        - protocol: UDP
          port: {{ $key }}
      {{- end }}
  egress:
    - {}
{{- end }}`,
		notes: [
			'Line 1 renders the policy only when `controller.networkPolicy.enabled` is true. The chart’s `values.yaml` sets it to `false`, so a default install ships no policy.',
			'Lines 14 to 20 select the controller Pods and isolate them in both directions. From here on, only the rules below let traffic through.',
			'Lines 21 to 34 hold one ingress rule with `ports` and no `from`: ports 80 and 443, and 8443 when the webhook is on. The API types say an empty `from` "matches all sources", so any Pod can still reach 8443.',
			'Lines 43 and 44 hold `egress: - {}`, one empty rule. It matches every destination and every port, so all outbound traffic is allowed.'
		]
	},
	tradeoff: {
		gain: [
			'With a default deny in place, a new Pod in the namespace gets no traffic until a policy names it. Pods added later start closed.',
			'An allow rule with a `from` list closes a port to every other source. The webhook on 8443 then answers only the listed API server range.'
		],
		cost: [
			'The docs say it "is not defined" whether source IP rewriting happens before or after policy processing. An `ipBlock` for the API server can match or miss, depending on the plugin and cloud.',
			'The docs’ list of what policies cannot do includes anything TLS related, targeting a Service by name, and logging blocked connections.',
			'A Pod cannot block traffic from its own node. The docs: traffic "to and from the node where a Pod is running is always allowed".'
		]
	},
	task: {
		prompt: 'Namespace `shop` has a `web` Deployment (label `app=web`, port 8080) and a `db` StatefulSet (label `app=db`, port 5432). Only the ingress controller in namespace `ingress-nginx` should reach `web`, and only `web` should reach `db`. Write the policies, and check that `web` can still resolve `db.shop.svc`.',
		hint: 'Start with a default deny for both directions. A connection between two Pods needs an egress allow on one side and an ingress allow on the other.',
		answer: [
			'Policy 1, `default-deny-all`: `podSelector: {}`, `policyTypes: [Ingress, Egress]`, no rules.',
			'Policy 2 on `app=web`: ingress `from` a `namespaceSelector` with `kubernetes.io/metadata.name: ingress-nginx`, TCP 8080. Egress `to` a `podSelector` `app=db`, TCP 5432.',
			'Policy 3 on `app=db`: ingress `from` a `podSelector` `app=web`, TCP 5432. Without it, the egress allow on `web` is not enough: the docs require "both the egress policy on the source pod and the ingress policy on the destination pod".',
			'Policy 4 on `podSelector: {}`: egress `to` one entry with both `namespaceSelector` `kubernetes.io/metadata.name: kube-system` and `podSelector` `k8s-app: kube-dns`, on UDP 53 and TCP 53. Without it, the default deny "also blocks DNS traffic".'
		],
		steps: [
			{
				title: 'Close everything first',
				questions: [
					{ q: 'Before any policy exists in `shop`, who can connect to `db` on 5432?', options: ['Only `web`', 'Any Pod: a Pod no policy selects accepts everything', 'Only Pods in `shop`', 'Nobody, until a Service exists'], answer: 1, why: 'A Pod is isolated only when some policy selects it. With none, "all inbound connections are allowed".' },
					{ q: 'Which spec is `default-deny-all`?', options: ['`podSelector: {}`, `policyTypes: [Ingress, Egress]`, no rules', '`podSelector: { app: web }`, no rules', '`podSelector: {}`, `ingress: [{}]`', '`podSelector: {}`, `policyTypes: [Ingress]`, no rules'], answer: 0, why: 'The empty selector picks every Pod, both directions are listed, and no rule allows anything. `ingress: [{}]` would allow everything instead.' },
					{ q: 'Policies are additive. What can the policies you add next do?', options: ['Close paths the deny left open', 'Override the deny for the whole namespace', 'Only open paths', 'Nothing, until the deny is removed'], answer: 2, why: 'Each allow rule adds to what gets through. No policy can take away what another allows.' },
					{ q: 'What makes the deny actually block traffic?', options: ['The API server', 'kube-proxy', 'The kubelet', 'A network plugin that supports NetworkPolicy'], answer: 3, why: 'The docs: a NetworkPolicy "without a controller that implements it will have no effect". The API server only stores it.' }
				]
			},
			{
				title: 'Open the way to web',
				questions: [
					{ q: 'Which selector picks the ingress controller as a source?', options: ['`podSelector` with `app: ingress-nginx`', '`namespaceSelector` with `kubernetes.io/metadata.name: ingress-nginx`', '`ipBlock` with the API server range', 'An empty `from`'], answer: 1, why: 'The controller lives in another namespace. Every namespace carries the `kubernetes.io/metadata.name` label with its own name.' },
					{ q: 'A rule on `web` has `ports: 8080` and no `from`. Who can reach `web` on 8080?', options: ['Only the ingress controller', 'Only Pods in `shop`', 'Any source: an empty `from` matches all sources', 'Nobody'], answer: 2, why: 'That is the hole in the ingress-nginx chart policy: ports with no `from` leave the port open to everyone.' },
					{ q: 'Which port does the ingress rule on `web` open?', options: ['TCP 8080', 'TCP 80', 'TCP 443', 'TCP 5432'], answer: 0, why: '`web` listens on 8080. The policy names the Pod’s port, not the ports the controller serves outside.' },
					{ q: 'A `podSelector` alone in a `from` list picks Pods from which namespace?', options: ['Every namespace', '`ingress-nginx`', '`kube-system`', 'The policy’s own namespace'], answer: 3, why: 'Without a `namespaceSelector`, a `podSelector` entry means Pods in the local namespace. To reach across namespaces you need the namespace selector.' }
				]
			},
			{
				title: 'Open web to db, on both sides',
				questions: [
					{ q: 'You add only an egress rule on `web` toward `app=db`. Does `web` reach `db`?', options: ['No: `db` is isolated for ingress and needs its own allow', 'Yes: egress on the source is enough', 'Yes: both Pods are in the same namespace', 'Only through the `db` Service'], answer: 0, why: 'The docs require "both the egress policy on the source pod and the ingress policy on the destination pod".' },
					{ q: 'What does the egress rule on `app=web` look like?', options: ['`to` a `namespaceSelector` for `shop`, any port', '`to` a `podSelector` `app=db`, TCP 5432', '`to` an empty list, TCP 5432', '`from` a `podSelector` `app=db`, TCP 5432'], answer: 1, why: 'It names the destination Pods and their port. `from` belongs to ingress rules, and a whole namespace is wider than needed.' },
					{ q: 'Which policy goes on `app=db`?', options: ['Ingress `from` a `namespaceSelector` for `shop`', 'Egress `to` a `podSelector` `app=web`', 'Ingress `from` a `podSelector` `app=web`, TCP 5432', 'Ingress with an empty `from`, TCP 5432'], answer: 2, why: 'Only `web` may reach `db`, so the source is `app=web` and nothing wider.' },
					{ q: 'With these policies, a Pod labelled `app=batch` in `shop` tries `db:5432`. What happens?', options: ['It connects: same namespace', 'It connects: no policy selects `app=batch`', 'It is blocked only if `batch` has its own policy', 'It is blocked: `db` allows only `app=web`, and the deny also isolates `batch`'], answer: 3, why: 'The default deny selects every Pod, `batch` included, and the ingress rule on `db` names only `web`.' }
				]
			},
			{
				title: 'Keep DNS working',
				questions: [
					{ q: 'After the deny, `web` looks up `db.shop.svc`. What happens?', options: ['It resolves as before', 'It fails: the egress deny also blocks DNS', 'It resolves through the node', 'It resolves over TCP only'], answer: 1, why: 'The docs warn that a default deny on egress "also blocks DNS traffic". DNS is just another outgoing connection.' },
					{ q: 'Which labels pick the cluster DNS Pods?', options: ['`k8s-app: kube-dns`, in namespace `kube-system`', '`app: coredns`, in namespace `default`', '`k8s-app: dns`, in namespace `shop`', '`app: kube-dns`, in namespace `ingress-nginx`'], answer: 0, why: 'The cluster DNS Pods carry `k8s-app=kube-dns` in `kube-system`.' },
					{ q: 'Which ports does the DNS rule open?', options: ['UDP 53 only', 'TCP 53 only', 'UDP 53 and TCP 53', 'TCP 8053'], answer: 2, why: 'The DNS service listens on 53/UDP and 53/TCP, so the rule opens both.' },
					{ q: 'Why put the `namespaceSelector` and the `podSelector` in one `to` entry?', options: ['The API server refuses two entries', 'One entry is faster to check', 'It makes no difference', 'Split into two, they would mean any Pod in `kube-system`, or `kube-dns` Pods in `shop`'], answer: 3, why: 'One entry with both selectors picks particular Pods in particular namespaces. Two entries are an OR, which is much wider.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Namespace `shop` holds one policy: it selects `app=db` and allows ingress from `app=web`. A Pod labelled `app=batch` runs in the same namespace. Who can connect to it?',
			options: [
				'Only Pods labelled `app=web`, because the namespace has a policy',
				'Nobody, because one policy in a namespace isolates all its Pods',
				'Only Pods in `shop`, because policies isolate each namespace',
				'Anyone, because no policy selects `app=batch`, so it stays open'
			],
			answer: 3,
			why: 'Each Pod is isolated or not on its own. A Pod is isolated for ingress only "if there is any NetworkPolicy that both selects the pod" and lists Ingress. No policy selects `app=batch`, so all inbound connections are allowed.'
		},
		{
			q: 'An ingress rule has one `from` entry holding both `namespaceSelector: {user: alice}` and `podSelector: {role: client}`. What does it allow?',
			options: [
				'Pods labelled `role=client` inside namespaces labelled `user=alice`',
				'Any Pod in `user=alice` namespaces, or `role=client` Pods anywhere',
				'Any Pod in `user=alice` namespaces, or `role=client` Pods locally',
				'Nothing, because one entry cannot hold two selectors at once'
			],
			answer: 0,
			why: 'One entry with both selectors "selects particular Pods within particular namespaces". Split into two list items, the same selectors mean `role=client` Pods in the local namespace or any Pod in a `user=alice` namespace.'
		},
		{
			q: 'You apply a `default-deny-all` policy and `kubectl apply` succeeds, but Pods in the namespace still talk to each other. What is the likely cause?',
			options: [
				'Policies apply only to Pods created after the policy, never to old ones',
				'The default deny needs a matching allow-all policy before it takes effect',
				'The cluster’s network plugin does not enforce NetworkPolicy objects',
				'The policy needs `kubectl rollout restart` on every Deployment first'
			],
			answer: 2,
			why: 'The API server stores the object whatever the plugin. The docs: creating a NetworkPolicy "without a controller that implements it will have no effect". Enforcement comes from a network plugin that supports it.'
		}
	],
	lab: {
		minutes: 30,
		goal: 'On a local cluster with a plugin that enforces policies, close a namespace with a default deny, watch DNS break, then open only `web` to `db`.',
		steps: [
			'Start a cluster with Calico, which enforces NetworkPolicy: `minikube start -p netpol-lab --cni=calico && kubectl create namespace shop`.',
			'Create two apps with a Service each. Both listen on 8080 here, to keep the lab small: `for a in web db; do kubectl -n shop create deployment $a --image=nginxinc/nginx-unprivileged:1.31-alpine && kubectl -n shop expose deployment $a --port=8080; done`.',
			'Check that anything reaches `db` today: `kubectl -n shop run probe --image=busybox:1.37 --rm -it --restart=Never -- wget -qO- -T 3 http://db:8080`.',
			'Apply the default deny, then run the same probe again: `echo \'{"apiVersion":"networking.k8s.io/v1","kind":"NetworkPolicy","metadata":{"name":"default-deny-all"},"spec":{"podSelector":{},"policyTypes":["Ingress","Egress"]}}\' | kubectl -n shop apply -f -`.',
			'Open DNS for every Pod: `echo \'{"apiVersion":"networking.k8s.io/v1","kind":"NetworkPolicy","metadata":{"name":"allow-dns"},"spec":{"podSelector":{},"policyTypes":["Egress"],"egress":[{"to":[{"namespaceSelector":{"matchLabels":{"kubernetes.io/metadata.name":"kube-system"}},"podSelector":{"matchLabels":{"k8s-app":"kube-dns"}}}],"ports":[{"protocol":"UDP","port":53},{"protocol":"TCP","port":53}]}]}}\' | kubectl -n shop apply -f -`.',
			'Open `web` to `db` on both sides: `echo \'{"apiVersion":"networking.k8s.io/v1","kind":"NetworkPolicy","metadata":{"name":"web"},"spec":{"podSelector":{"matchLabels":{"app":"web"}},"policyTypes":["Egress"],"egress":[{"to":[{"podSelector":{"matchLabels":{"app":"db"}}}],"ports":[{"protocol":"TCP","port":8080}]}]}}\' | kubectl -n shop apply -f -`, then `echo \'{"apiVersion":"networking.k8s.io/v1","kind":"NetworkPolicy","metadata":{"name":"db"},"spec":{"podSelector":{"matchLabels":{"app":"db"}},"policyTypes":["Ingress"],"ingress":[{"from":[{"podSelector":{"matchLabels":{"app":"web"}}}],"ports":[{"protocol":"TCP","port":8080}]}]}}\' | kubectl -n shop apply -f -`.',
			'Probe twice: once as before, once posing as `web` with `--labels=app=web` added to the `kubectl run` line. Then clean up: `minikube delete -p netpol-lab`.'
		],
		done: [
			'Step 3 prints the nginx welcome page.',
			'After the deny, the probe fails with `bad address \'db:8080\'`: the name no longer resolves.',
			'After the last policies, the probe without a label times out, and the probe with `app=web` prints the welcome page.'
		],
		solution: [
			'The first failure is DNS, not `db`. That is why the task asks you to check that `web` still resolves `db.shop.svc`.',
			'Delete the `db` policy and probe as `web` again: it times out. The egress allow alone is not enough.',
			'On a cluster without NetworkPolicy support, every `kubectl apply` above succeeds and every probe still gets through.'
		]
	},
	recall: {
		q: 'What does a default deny policy for both directions contain, and what does it break that you must allow again?',
		a: '`podSelector: {}` and `policyTypes: [Ingress, Egress]`, with no rules. It also blocks DNS, so add an egress rule to the `k8s-app=kube-dns` Pods in `kube-system` on port 53.'
	},
	sources: [
		{ title: 'Wiz Research, IngressNightmare: 9.8 critical unauthenticated RCE vulnerabilities in Ingress NGINX (24 March 2025)', url: 'https://www.wiz.io/blog/ingress-nginx-kubernetes-vulnerabilities' },
		{ title: 'Kubernetes blog, Ingress-nginx CVE-2025-1974: What You Need to Know', url: 'https://kubernetes.io/blog/2025/03/24/ingress-nginx-cve-2025-1974/' },
		{ title: 'Kubernetes issue 131009, CVE-2025-1974: ingress-nginx admission controller RCE escalation', url: 'https://github.com/kubernetes/kubernetes/issues/131009' },
		{ title: 'Kubernetes docs, Network Policies', url: 'https://kubernetes.io/docs/concepts/services-networking/network-policies/' },
		{ title: 'Kubernetes source, NetworkPolicyIngressRule in networking/v1 types.go', url: `${K8S}/staging/src/k8s.io/api/networking/v1/types.go#L111-L131` },
		{ title: 'ingress-nginx chart, controller.networkPolicy in values.yaml', url: `${ING}/charts/ingress-nginx/values.yaml#L118-L121` },
		{ title: 'Kubernetes docs, Debugging DNS Resolution', url: 'https://kubernetes.io/docs/tasks/administer-cluster/dns-debugging-resolution/' }
	]
};
