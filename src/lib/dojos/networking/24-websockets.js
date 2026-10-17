const NGX = 'https://github.com/nginx/nginx/blob/1725db9059e8d4057ce8d5090673d16e20713b45/src/http';
const UPSTREAM = `${NGX}/ngx_http_upstream.c`;
const PROXY = `${NGX}/modules/ngx_http_proxy_module.c`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'websockets',
	part: 'HTTP and TLS',
	title: 'WebSockets through proxies',
	minutes: 10,
	hook: [
		'A chat page works until nobody types for a minute, then the socket drops. Reproduced for this chapter with nginx 1.27.5 in front of a backend that sends nothing: Node\'s `WebSocket` client logged `closed after 60.1 s, code 1006 wasClean false`.',
		'The nginx docs: "By default, the connection will be closed if the proxied server does not transmit any data within 60 seconds." RFC 6455 reserves code 1006 for a connection "closed abnormally, e.g., without sending or receiving a Close control frame". No side sent a Close frame; nginx closed the TCP connections.',
		'Same setup, with the backend sending a ping frame every 30 seconds: the socket was still open at 130 seconds. The client answered each ping with a pong, opcode `0xA`.'
	],
	terms: [
		{ term: 'Upgrade handshake', def: 'An HTTP/1.1 `GET` with `Upgrade: websocket` and `Connection: Upgrade`. A `101 Switching Protocols` reply turns the TCP connection into a WebSocket.' },
		{ term: 'Hop-by-hop header', def: 'A header meant for one connection only, such as `Upgrade` and `Connection`. A proxy does not forward it to the next server unless configured to.' },
		{ term: 'Ping frame', def: 'A WebSocket control frame with opcode `0x9`. The other side "MUST send a Pong frame in response", opcode `0xA`.' },
		{ term: '`proxy_read_timeout`', def: 'nginx\'s limit on the time between two reads from the backend, 60 s by default. In a WebSocket tunnel it closes a connection where the backend sends nothing for that long.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['cl["Browser"] -->|"GET /ws, Upgrade: websocket, Connection: Upgrade, Sec-WebSocket-Key"| ng["nginx"]'],
				highlight: ['cl', 'ng'],
				note: 'The client opens a normal HTTP/1.1 request. `Sec-WebSocket-Key` is a random base64 value, like the RFC 6455 example `dGhlIHNhbXBsZSBub25jZQ==`.'
			},
			{
				add: ['ng -->|"proxy_set_header Upgrade $http_upgrade; Connection upgrade"| be["Backend :9001"]'],
				highlight: ['be'],
				note: 'nginx forwards `Upgrade` only if the config sets it. In the test, a location without those two lines sent the backend `connection: close` and no `upgrade`. The backend answered `200`, and the client failed at once with code 1006.'
			},
			{
				add: ['be -->|"101 Switching Protocols, Sec-WebSocket-Accept"| ng', 'ng -->|"101"| cl'],
				highlight: ['be', 'cl'],
				note: 'The backend computes `Sec-WebSocket-Accept` as base64 of SHA-1 of the key plus the GUID `258EAFA5-E914-47DA-95CA-C5AB0DC85B11`. For the RFC example key this gives `s3pPLMBiTxaQ9kYGzzhZRbK+xOo=`. nginx sees `101` and switches to tunnel mode.'
			},
			{
				add: ['cl <-->|"frames both ways"| ng', 'ng <-->|"frames both ways, timer: proxy_read_timeout 60s"| be'],
				highlight: ['ng'],
				note: 'nginx now copies bytes in both directions. Each time it waits for data from the backend, it arms a timer of `proxy_read_timeout`, 60 s by default. Any frame from the backend, a ping included, clears that timer.'
			},
			{
				add: ['ng -.->|"60 s with no backend data: close TCP"| cl'],
				highlight: ['ng', 'cl'],
				note: 'After 60 s of silence the timer fires and nginx closes both connections. No Close frame is sent, so the browser reports code 1006. A backend ping every 30 s keeps the timer from firing.'
			}
		]
	},
	example: {
		title: 'src/http/ngx_http_upstream.c: the read timer on an upgraded connection',
		repo: 'nginx/nginx',
		url: `${UPSTREAM}#L3713-L3875`,
		lang: 'c',
		code: `ngx_http_upstream_process_upgraded(ngx_http_request_t *r,
    ngx_uint_t from_upstream, ngx_uint_t do_write)
{
…
    downstream = c;
    upstream = u->peer.connection;

    if (downstream->write->timedout) {
        c->timedout = 1;
        ngx_connection_error(c, NGX_ETIMEDOUT, "client timed out");
        ngx_http_upstream_finalize_request(r, u, NGX_HTTP_REQUEST_TIME_OUT);
        return;
    }

    if (upstream->read->timedout || upstream->write->timedout) {
        ngx_connection_error(c, NGX_ETIMEDOUT, "upstream timed out");
        ngx_http_upstream_finalize_request(r, u, NGX_HTTP_GATEWAY_TIME_OUT);
        return;
    }
…
    if (upstream->read->active && !upstream->read->ready) {
        ngx_add_timer(upstream->read, u->conf->read_timeout);

    } else if (upstream->read->timer_set) {
        ngx_del_timer(upstream->read);
    }`,
		notes: [
			'nginx calls this function for every event on the tunnel, in either direction. Lines 5 and 6 name the two sides: `downstream` is the browser, `upstream` is the backend.',
			'Lines 21 and 22 arm a timer of `read_timeout`, set by `proxy_read_timeout`, whenever nginx waits for backend data. Lines 24 and 25 delete it when data is ready.',
			'Line 15 runs when that timer has fired. Line 16 logs `upstream timed out` and line 17 ends the request. A WebSocket has already received its `101`, so the browser sees only a closed connection: code 1006.',
			'The switch to this mode happens in [`ngx_http_proxy_module.c`](' + PROXY + '#L2039-L2045): on a `101` from the backend, nginx sets `u->upgrade = 1` only if the client\'s request carried an `Upgrade` header.'
		]
	},
	tradeoff: {
		gain: [
			'After the `101`, one TCP connection carries messages both ways, and the backend can push with no request from the browser. nginx only copies bytes.',
			'A ping frame from the server is 2 bytes in the test backend (`0x89 0x00`). One every 30 s kept the socket alive past nginx\'s 60 s timeout.'
		],
		cost: [
			'Every proxy on the path needs WebSocket config. nginx drops `Upgrade` unless `proxy_set_header` passes it, and before 1.29.7 the docs also require `proxy_http_version 1.1`.',
			'Raising `proxy_read_timeout` to hours applies to every request in that `location`, so a stuck plain HTTP backend also holds its connection that long.',
			'A drop by a proxy timeout gives code 1006, the same code as a network failure. The client must reconnect and cannot tell the two apart from the code alone.'
		]
	},
	task: {
		prompt: 'Your app at `app:8080` serves WebSockets on `/socket/`. Behind nginx, users report a drop after exactly one minute without messages. Write the nginx `location` block that passes the upgrade, and choose one of two fixes for the drop: a longer `proxy_read_timeout`, or server pings. Give the values you would use and why.',
		hint: 'Start from the nginx docs example with `map $http_upgrade $connection_upgrade`. The default `proxy_read_timeout` is 60s, and it counts time between two reads from the backend.',
		answer: [
			'In `http`: `map $http_upgrade $connection_upgrade { default upgrade; \'\' close; }`. In the server: `location /socket/ { proxy_pass http://app:8080; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection $connection_upgrade; }`. `proxy_http_version 1.1` is needed before nginx 1.29.7.',
			'Pings: have the server send a ping frame every 30 s, half the 60 s timeout. Each ping is data from the backend, so nginx resets its timer. In the nginx 1.27.5 test, 30 s pings kept the socket open past 130 s.',
			'Timeout: `proxy_read_timeout 3600s;` in that location keeps idle sockets for an hour. It also lets a stuck HTTP request in `/socket/` wait an hour, and it changes nothing in any other proxy on the path.'
		]
	},
	quiz: [
		{
			q: 'Behind nginx with default settings, a WebSocket closes after 60 s with code 1006 when the server is silent. What closes it?',
			options: [
				'The browser, which sends a Close frame after 60 s without messages',
				'nginx, whose `proxy_read_timeout` of 60s fired with no backend data',
				'The backend, which must close any socket that has sent no pong',
				'TCP keepalive in the kernel, which probes every 60 seconds'
			],
			answer: 1,
			why: 'In tunnel mode nginx arms a `read_timeout` timer while it waits for backend data. When it fires, `ngx_http_upstream_process_upgraded` logs `upstream timed out` and closes. No Close frame is sent, so the browser reports 1006.'
		},
		{
			q: 'A `location` has only `proxy_pass http://backend;`. The browser\'s WebSocket fails at once. What did the backend receive?',
			options: [
				'The full upgrade request, which it refused because of the `Origin`',
				'A plain `GET` with `Connection: close` and no `Upgrade` header',
				'Nothing, because nginx refuses `GET` requests carrying a body',
				'A `CONNECT` request, which nginx sends for every WebSocket'
			],
			answer: 1,
			why: '`Upgrade` and `Connection` are hop-by-hop, and nginx sends `Connection: close` by default. The backend saw a normal request and answered `200`, so no `101` came back and the handshake failed.'
		},
		{
			q: 'Which server-side change keeps an idle WebSocket open through nginx\'s default 60 s `proxy_read_timeout`?',
			options: [
				'Sending a ping frame every 30 seconds',
				'Answering each client ping within 120 seconds',
				'Setting `Sec-WebSocket-Version: 13` on the 101 reply',
				'Sending HTTP `Keep-Alive: timeout=120` in the 101'
			],
			answer: 0,
			why: 'The nginx timer counts time between two reads from the backend. A ping every 30 s is backend data, so the timer is reset before 60 s pass. The nginx docs suggest exactly this: "periodically send WebSocket ping frames to reset the timeout".'
		}
	],
	recall: {
		q: 'A WebSocket behind nginx drops after exactly 60 s of silence with code 1006. Which setting is it, and what are the two fixes?',
		a: '`proxy_read_timeout`, 60s by default. Either raise it in the WebSocket `location`, or have the server send a ping frame (opcode `0x9`) more often than every 60 s, for example every 30 s.'
	},
	sources: [
		{ title: 'RFC 6455, The WebSocket Protocol', url: 'https://www.rfc-editor.org/rfc/rfc6455' },
		{ title: 'nginx docs, WebSocket proxying', url: 'https://nginx.org/en/docs/http/websocket.html' },
		{ title: 'nginx docs, ngx_http_proxy_module (proxy_read_timeout, proxy_set_header)', url: 'https://nginx.org/en/docs/http/ngx_http_proxy_module.html' },
		{ title: 'nginx source, src/http/ngx_http_upstream.c', url: UPSTREAM }
	]
};
