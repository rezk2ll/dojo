const KUBEADM = 'https://github.com/kubernetes/kubeadm/blob/5bc6d39ca9ad65a5dc549dc388c80894044cf9af/docs/ha-considerations.md';
const HADOC = 'https://github.com/haproxy/haproxy/blob/a383051731cfa80f0196bdecc4c6a2ab7c1ea234/doc/configuration.txt';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'load-balancers',
	part: 'Between services',
	title: 'Layer 4 and layer 7 load balancing',
	minutes: 10,
	hook: [
		'You add a second server behind HAProxy, with `balance roundrobin`. A client sends 100 requests over one keep-alive connection. With `mode tcp`, HAProxy 3.0.30 sent all 100 to `web1` and none to `web2`. This was measured for this chapter with two small Node servers.',
		'Same client, same servers, `mode http`: 50 requests to `web1`, 50 to `web2`. With a new connection for each request, `mode tcp` also split 50/50.',
		'The HAProxy manual: "In layer 4 mode, HAProxy simply forwards bidirectional traffic between two sides. In layer 7 mode, HAProxy analyzes the protocol". In `mode tcp` it picks a server once per connection. In `mode http` it reads each request and picks a server for each one.'
	],
	terms: [
		{ term: 'Layer 4 load balancer', def: 'A balancer that sees only TCP: source and destination IP and port. It picks a server when a connection opens and then copies bytes. HAProxy `mode tcp`.' },
		{ term: 'Layer 7 load balancer', def: 'A balancer that parses HTTP: method, path, headers, cookies. It can pick a server for each request. HAProxy `mode http`.' },
		{ term: 'Persistence', def: 'Sending the same client to the same server every time, also called sticky sessions. In HAProxy, by a cookie in `mode http` or `balance source` in `mode tcp`.' },
		{ term: 'TLS termination', def: 'The balancer decrypts TLS itself. A layer 7 balancer must do it to read HTTPS requests; a layer 4 balancer can pass the encrypted bytes through.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['cl["Client, one keep-alive connection"] -->|"TCP connect :8401"| l4["HAProxy mode tcp"]', 'l4 -->|"roundrobin: pick web1 once"| w1["web1"]'],
				highlight: ['l4', 'w1'],
				note: 'When the connection opens, HAProxy knows only addresses and ports. `roundrobin` gives this connection to `web1`. The next connection, from any client, goes to `web2`.'
			},
			{
				add: ['cl -->|"requests 2 to 100, same connection"| l4', 'l4 -.->|"no new choice"| w1'],
				highlight: ['cl'],
				note: 'HAProxy copies bytes and does not look for request boundaries. All 100 requests on the connection reach `web1`. In the test, `web2` got 0 of them.'
			},
			{
				add: ['cl -->|"GET /a, GET /b on one connection"| l7["HAProxy mode http"]'],
				highlight: ['l7'],
				note: 'In `mode http`, HAProxy parses each request: method, path, headers, cookies. The manual says the request "will be analyzed in depth before connecting to any server". For HTTPS, it must terminate TLS to do this.'
			},
			{
				add: ['l7 -->|"GET /a"| x1["web1"]', 'l7 -->|"GET /b"| x2["web2"]'],
				highlight: ['x1', 'x2'],
				note: '`balance` runs for each request, so requests on the same client connection alternate between servers. In the test, one keep-alive connection gave 50 requests to each.'
			},
			{
				add: ['x1 -.->|"Set-Cookie: SRV=web1"| cl', 'cl -.->|"Cookie: SRV=web1"| l7'],
				highlight: ['cl'],
				note: 'With `cookie SRV insert indirect nocache` and `server web1 ... cookie web1`, HAProxy adds a cookie to the first response. Later requests carrying `SRV=web1` go to `web1`. The manual: the algorithm "only applies when no persistence information is available".'
			}
		]
	},
	example: {
		title: 'kubeadm docs/ha-considerations.md: HAProxy in front of the Kubernetes API servers',
		repo: 'kubernetes/kubeadm',
		url: `${KUBEADM}#L136-L156`,
		lang: 'bash',
		code: `frontend apiserver
    bind *:\${APISERVER_DEST_PORT}
    mode tcp
    option tcplog
    default_backend apiserverbackend

#---------------------------------------------------------------------
# round robin balancing for apiserver
#---------------------------------------------------------------------
backend apiserverbackend
    option httpchk

    http-check connect ssl
    http-check send meth GET uri /healthz
    http-check expect status 200

    mode tcp
    balance     roundrobin

    server \${HOST1_ID} \${HOST1_ADDRESS}:\${APISERVER_SRC_PORT} check verify none
    # [...]`,
		notes: [
			'Lines 3 and 17 set `mode tcp` on both sides. HAProxy never decrypts the traffic: the TLS session runs from `kubectl` to the API server, and HAProxy sees only addresses and ports. The manual says tcp mode "should be used for SSL, SSH, SMTP".',
			'Line 18 picks an API server per connection with `roundrobin`. A `kubectl` command that opens one connection talks to one API server for its whole run.',
			'Lines 11 to 15 add a health check at layer 7 while the traffic stays at layer 4. HAProxy opens its own TLS connection (line 13), sends `GET /healthz` (line 14) and expects `200` (line 15).',
			'Line 20 adds `check` to run that probe on each server, and `verify none` tells HAProxy not to verify the API server certificate on that TLS check. The `defaults` section above this excerpt sets `mode http`, which these two sections override.'
		]
	},
	tradeoff: {
		gain: [
			'Layer 4 needs no certificate on the balancer: the kubeadm setup passes TLS through to the API servers.',
			'Layer 7 spreads requests, not connections: one keep-alive client was split 50/50 in `mode http` and 100/0 in `mode tcp`.',
			'Layer 7 can route on content and keep a user on one server with a cookie, which `mode tcp` cannot insert. HAProxy offers `balance source` there instead.'
		],
		cost: [
			'Layer 4 ignores load inside long connections. One client with one connection sends all its requests to one server, and a new server gets only new connections.',
			'Layer 7 must parse every request and, for HTTPS, hold the TLS keys and decrypt. HAProxy rejects any request "which is not RFC-compliant" in `mode http`.',
			'`balance source` sends many clients to new servers when the server count changes: the manual says "If the hash result changes due to the number of running servers changing, many clients will be directed to a different server".'
		]
	},
	task: {
		prompt: 'An internal API has 3 servers behind HAProxy with `mode tcp` and `balance roundrobin`. Its only callers are 2 services, each opening a pool of 4 keep-alive connections at startup and never closing them. (1) How many connections does each server hold? (2) A 4th server, already in the config, passes its health check and comes up. How much traffic does it get? (3) What changes with `mode http`?',
		hint: 'In `mode tcp`, `roundrobin` runs only when a connection opens. Count the connections each server holds.',
		answer: [
			'(1) 8 connections in turn over 3 servers: 3, 3 and 2. Each server serves every request sent on its own connections, so a busy connection loads its server more.',
			'(2) Nothing. All 8 connections already have a server, and `roundrobin` runs again only for a new connection. The 4th server waits until a caller restarts or a connection drops and reopens.',
			'(3) In `mode http`, HAProxy picks a server for each request. The new server gets about a quarter of the requests as soon as it is up, with the same 8 client connections.'
		]
	},
	quiz: [
		{
			q: 'HAProxy runs `mode tcp` with `balance roundrobin` over 2 servers. One client sends 100 requests on a single keep-alive connection. Where do they go?',
			options: [
				'50 to each server, as `roundrobin` alternates on every request',
				'All 100 to the server chosen when the connection opened',
				'To the server with fewer open connections at each request',
				'To whichever server answers first, as HAProxy races them'
			],
			answer: 1,
			why: 'In `mode tcp` HAProxy forwards bytes and does not see where one request ends. It runs the algorithm once, at connect time. The test for this chapter gave 100 to `web1` and 0 to `web2`.'
		},
		{
			q: 'You want HAProxy to send `/api/` and `/static/` to different backends over HTTPS. What does that require?',
			options: [
				'`mode tcp`, with a separate `bind` line for each path',
				'`mode http` with TLS terminated on HAProxy, so it can read the path',
				'`balance source`, so each path hashes to a different server',
				'Nothing special: a layer 4 balancer reads the SNI and the path'
			],
			answer: 1,
			why: 'The path is inside the encrypted HTTP request. HAProxy must decrypt TLS and parse the request in `mode http` before it can route on it. In `mode tcp` it sees only addresses and ports.'
		},
		{
			q: 'Why does the kubeadm HAProxy config use `mode tcp` for the API servers?',
			options: [
				'Because `mode http` cannot run health checks over TLS',
				'Because it forwards TLS bytes without decrypting them',
				'Because `roundrobin` is only available in `mode tcp`',
				'Because the Kubernetes API does not use HTTP at all'
			],
			answer: 1,
			why: 'In `mode tcp` HAProxy copies the TLS stream without decrypting it, so the TLS session runs from the client to the API server. The same backend still runs a TLS `GET /healthz` probe with `http-check connect ssl`.'
		}
	],
	recall: {
		q: 'With `balance roundrobin`, when does HAProxy choose a server in `mode tcp`, and when in `mode http`?',
		a: 'In `mode tcp`, once per TCP connection: 100 requests on one keep-alive connection all went to `web1`. In `mode http`, for each request: the same client was split 50/50.'
	},
	sources: [
		{ title: 'HAProxy configuration manual (balance, mode, cookie)', url: HADOC },
		{ title: 'HAProxy 3.0 docs, balance', url: 'https://docs.haproxy.org/3.0/configuration.html#4.2-balance' },
		{ title: 'kubeadm, docs/ha-considerations.md', url: KUBEADM },
		{ title: 'Kubernetes blog, gRPC Load Balancing on Kubernetes without Tears', url: 'https://kubernetes.io/blog/2018/11/07/grpc-load-balancing-on-kubernetes-without-tears/' }
	]
};
