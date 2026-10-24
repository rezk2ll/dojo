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
		],
		steps: [
			{
				title: 'Count the connections',
				questions: [
					{ q: 'How many long-lived connections reach HAProxy?', options: ['8: 2 services with 4 each', '4: the two pools are shared', '2: one per service', '12: 4 for each server'], answer: 0, why: 'Each of the 2 services opens a pool of 4 connections at startup and keeps them.' },
					{ q: 'In `mode tcp`, when does `roundrobin` pick a server?', options: ['For every request on the connection', 'Once, when a connection opens', 'At every health check', 'Each time a server is added'], answer: 1, why: 'In `mode tcp` HAProxy sees only addresses and ports, so it picks once per connection and then copies bytes.' },
					{ q: 'How do the 8 connections spread over the 3 servers?', options: ['4, 2 and 2', '8, 0 and 0', '3, 3 and 2', '8 on each server'], answer: 2, why: '`roundrobin` hands out the 8 connections in turn: servers 1, 2, 3, 1, 2, 3, 1, 2.' },
					{ q: 'Do the 3 servers then get the same share of requests?', options: ['Yes: `roundrobin` evens out the requests', 'Yes: HAProxy moves requests to the least busy server', 'No: the first server gets them all', 'No: each serves what its own connections carry, so a busy connection loads its server more'], answer: 3, why: 'HAProxy makes no new choice inside a connection. Load follows connections, not requests.' }
				]
			},
			{
				title: 'Add the 4th server',
				questions: [
					{ q: 'The 4th server passes its health check. How many of the 8 connections move to it?', options: ['None', '2 of them', 'All 8', 'Half of them'], answer: 0, why: 'Every connection already has a server, and nothing in `mode tcp` moves an open connection.' },
					{ q: 'Why?', options: ['HAProxy waits for a warm-up period first', '`roundrobin` runs again only for a new connection', 'The health check needs a second pass', 'The config must be reloaded first'], answer: 1, why: 'The algorithm runs at connect time. No new connection means no new choice.' },
					{ q: 'What finally sends traffic to the 4th server?', options: ['The next request on any connection', 'A switch to `balance source`', 'A caller that restarts, or a connection that drops and reopens', 'Its health check passing a second time'], answer: 2, why: 'Only a new connection runs `roundrobin` again and can land on the new server.' },
					{ q: 'Which measurement in the hook shows the same effect?', options: ['`mode tcp`: 100 requests on one keep-alive connection went 100 to `web1`, 0 to `web2`', '`mode http`: 50 requests to each server', 'A new connection per request split 50/50', 'The kubeadm `/healthz` probe expects `200`'], answer: 0, why: 'One long connection stayed on one server. `web2` was up and got nothing, like the 4th server here.' }
				]
			},
			{
				title: 'Switch to `mode http`',
				questions: [
					{ q: 'In `mode http`, when does HAProxy pick a server?', options: ['Once per client connection', 'Once per minute', 'Only when a server is added', 'For each request'], answer: 3, why: 'In `mode http` HAProxy parses each request, and `balance` runs for each one.' },
					{ q: 'How much traffic does the 4th server get once it is up?', options: ['None until a caller restarts', 'About a quarter of the requests, right away', 'Every new request, until it catches up', 'Half of the requests'], answer: 1, why: 'With 4 servers and a choice per request, `roundrobin` gives each about a quarter.' },
					{ q: 'Do the 2 services need to change their 8 connections?', options: ['No: the same 8 client connections work, HAProxy picks per request', 'Yes: they must reconnect after each request', 'Yes: they must turn off keep-alive', 'Yes: they need one connection per server'], answer: 0, why: 'In the hook, one keep-alive connection was split 50/50 in `mode http`. The client side does not change.' },
					{ q: 'What does `mode http` do with a request that is not RFC-compliant?', options: ['It forwards it as raw bytes', 'It sends it to the first server', 'It rejects it', 'It retries it on another server'], answer: 2, why: 'The manual says HAProxy rejects any request "which is not RFC-compliant" in `mode http`.' }
				]
			},
			{
				title: 'Weigh the cost',
				questions: [
					{ q: 'The API uses HTTPS. What must HAProxy do in `mode http`?', options: ['Nothing more than in `mode tcp`', 'Terminate TLS, so it holds the keys and decrypts', 'Ask each client for a certificate', 'Read the path from the SNI'], answer: 1, why: 'The request is inside the TLS stream. To parse it, HAProxy must decrypt it.' },
					{ q: 'Would `balance source` in `mode tcp` fix the 4th server problem?', options: ['No: it still picks per connection, and a change in server count moves many clients', 'Yes: it spreads requests by source IP', 'Yes: it rebalances open connections', 'No: `balance source` only works in `mode http`'], answer: 0, why: 'It hashes the source at connect time. The manual warns that when the number of servers changes, many clients go to a different server.' },
					{ q: 'Which is a real reason to keep `mode tcp`?', options: ['It spreads requests better than `mode http`', 'It can insert a persistence cookie', 'It can route on the request path', 'No certificate on the balancer: TLS passes through, as in kubeadm'], answer: 3, why: 'The kubeadm setup uses `mode tcp` so the TLS session runs from `kubectl` to the API server.' },
					{ q: 'In `mode http`, how do you keep one user on one server if you need to?', options: ['With `balance source` only', 'You cannot in `mode http`', 'With a cookie, such as `cookie SRV insert indirect nocache`', 'With `mode tcp` on the backend'], answer: 2, why: 'HAProxy inserts a cookie in the first response, and later requests that carry it go to the same server.' }
				]
			}
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
	lab: {
		minutes: 15,
		goal: 'Run HAProxy in `mode tcp` and `mode http` in front of two servers, and count where 100 keep-alive requests land.',
		steps: [
			'Write the config: `mkdir -p ~/lb-lab && cd ~/lb-lab`, then `printf \'defaults\\n  timeout connect 5s\\n  timeout client 30s\\n  timeout server 30s\\nfrontend l4\\n  mode tcp\\n  bind :8401\\n  default_backend b4\\nbackend b4\\n  mode tcp\\n  balance roundrobin\\n  server web1 127.0.0.1:9001\\n  server web2 127.0.0.1:9002\\nfrontend l7\\n  mode http\\n  bind :8402\\n  default_backend b7\\nbackend b7\\n  mode http\\n  balance roundrobin\\n  server web1 127.0.0.1:9001\\n  server web2 127.0.0.1:9002\\n\' > haproxy.cfg`.',
			'Start two servers that answer with their name, then HAProxy in the same network: `docker run -d --rm --name lb-web -p 8401:8401 -p 8402:8402 node:24-alpine node -e "for (const [p, n] of [[9001, \'web1\'], [9002, \'web2\']]) require(\'http\').createServer((q, r) => r.end(n + \'\\n\')).listen(p)"`, then `docker run -d --rm --name lb --network container:lb-web -v "$PWD/haproxy.cfg:/usr/local/etc/haproxy/haproxy.cfg:ro" haproxy:3.0`.',
			'Send 100 requests on one keep-alive connection through `mode tcp`. curl reuses the connection for a URL range: `curl -s "localhost:8401/[1-100]" | sort | uniq -c`.',
			'Do the same through `mode http`: `curl -s "localhost:8402/[1-100]" | sort | uniq -c`.',
			'Back on `mode tcp`, open a new connection for each request: `for i in $(seq 1 10); do curl -s localhost:8401/; done | sort | uniq -c`. Clean up with `docker rm -f lb lb-web`.'
		],
		done: [
			'Port 8401 with one connection prints `100 web1` and no `web2` line.',
			'Port 8402 prints `50 web1` and `50 web2`.',
			'The loop on port 8401 prints `5 web1` and `5 web2`.'
		],
		solution: [
			'`mode tcp` runs `roundrobin` once, when the connection opens, and then copies bytes. All requests on that connection reach the same server.',
			'`mode http` parses each request and runs `balance` for each one, so one connection is split evenly.',
			'With a new connection per request, `mode tcp` alternates too. That is why the 4th server in the task waits for new connections.'
		]
	},
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
