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
		],
		steps: [
			{
				title: 'Read the symptom',
				questions: [
					{ q: 'Users drop after exactly one minute without messages. Which nginx setting matches?', options: ['`proxy_read_timeout`, 60 s by default', '`proxy_connect_timeout`, which limits the handshake', 'TCP keepalive in the kernel', 'An idle limit built into the browser'], answer: 0, why: 'The default `proxy_read_timeout` is 60 s, and in a tunnel it closes a connection where the backend sends nothing for that long.' },
					{ q: 'What does that timer count?', options: ['The total lifetime of the socket', 'The time between two reads from the backend', 'The time between two messages from the browser', 'The time since the `101` reply'], answer: 1, why: 'nginx arms the timer each time it waits for backend data, and deletes it when data is ready.' },
					{ q: 'Which close code will the browser report?', options: ['1000, a normal close', '1001, going away', '1006, closed without a Close frame', '1011, an error on the server'], answer: 2, why: 'nginx closes the TCP connections and nobody sends a Close frame. RFC 6455 reserves 1006 for that.' },
					{ q: 'The backend sends one message every 90 s. Does that stop the drop?', options: ['Yes: any backend data resets the timer', 'Yes, as long as the messages are pings', 'No: nginx drops backend frames after 60 s', 'No: 60 s pass without backend data before each message'], answer: 3, why: 'The timer fires after 60 s with no data from the backend. A message every 90 s comes 30 s too late.' }
				]
			},
			{
				title: 'Pass the upgrade',
				questions: [
					{ q: 'Why does a `location` with only `proxy_pass` break the handshake?', options: ['`Upgrade` and `Connection` are hop-by-hop, so nginx does not forward them', 'nginx refuses any `GET` on `/socket/`', 'The backend expects a `CONNECT` request', 'nginx strips `Sec-WebSocket-Key`'], answer: 0, why: 'In the test, the backend got `connection: close` and no `upgrade`, answered `200`, and the client failed at once.' },
					{ q: 'Which two lines forward the upgrade?', options: ['`proxy_pass_header Upgrade;` and `proxy_buffering off;`', '`add_header Upgrade websocket;` and `add_header Connection upgrade;`', '`proxy_set_header Upgrade $http_upgrade;` and `proxy_set_header Connection $connection_upgrade;`', '`proxy_set_header Host $host;` and `proxy_set_header Origin $http_origin;`'], answer: 2, why: '`proxy_set_header` sets request headers sent to the backend. `add_header` only touches the response to the browser.' },
					{ q: 'What does `map $http_upgrade $connection_upgrade { default upgrade; \'\' close; }` do?', options: ['It blocks every request without an `Upgrade` header', 'It sets `Connection: upgrade` when the client asked for one, and `close` otherwise', 'It rewrites `http://` URLs to `ws://`', 'It caches the backend\'s `101` reply'], answer: 1, why: 'The map gives `upgrade` when `$http_upgrade` has a value, and `close` when it is empty, so plain requests keep the old behavior.' },
					{ q: 'Which line do the docs require before nginx 1.29.7?', options: ['`proxy_buffering off;`', '`keepalive 16;`', '`http2 on;`', '`proxy_http_version 1.1;`'], answer: 3, why: 'The upgrade handshake is HTTP/1.1, and before 1.29.7 nginx needs this line to talk HTTP/1.1 to the backend.' }
				]
			},
			{
				title: 'Choose the fix',
				questions: [
					{ q: 'You pick server pings. Which interval?', options: ['Every 60 s, the same as the timeout', 'Every 120 s, to save bandwidth', 'Every 30 s, half the 60 s timeout', 'Once, right after the `101`'], answer: 2, why: 'A ping every 30 s always lands before the 60 s timer fires. At 60 s it races the timer.' },
					{ q: 'Why does a server ping reset nginx\'s timer?', options: ['It is data from the backend, which is what the timer waits for', 'nginx reads ping frames and extends the timeout', 'A ping reopens the TCP connection', 'Only the browser\'s pong resets it'], answer: 0, why: 'nginx only copies bytes. Any frame from the backend, a ping included, clears the timer.' },
					{ q: 'What does `proxy_read_timeout 3600s;` in `/socket/` cost?', options: ['Every location in the server now waits an hour', 'A stuck HTTP request in `/socket/` can also wait an hour', 'Pings stop working in that location', 'Nothing: it only applies to WebSockets'], answer: 1, why: 'The setting applies to every request in that `location`, not only to upgraded ones.' },
					{ q: 'Which fix also helps with other proxies on the path?', options: ['A longer `proxy_read_timeout`, since nginx forwards it', 'Both help the same way', 'Neither: each proxy needs its own config', 'Server pings, since every hop sees the data'], answer: 3, why: 'A timeout set in nginx changes nothing in any other proxy. A ping is real traffic that crosses every hop.' }
				]
			},
			{
				title: 'Check the result',
				questions: [
					{ q: 'Which status code tells you the upgrade went through nginx?', options: ['`200 OK`', '`101 Switching Protocols`', '`426 Upgrade Required`', '`204 No Content`'], answer: 1, why: 'A `101` turns the connection into a WebSocket, and nginx switches to tunnel mode.' },
					{ q: 'What does the browser send back for each server ping?', options: ['A Close frame', 'A ping, opcode `0x9`', 'Nothing at all', 'A pong, opcode `0xA`'], answer: 3, why: 'RFC 6455: the other side "MUST send a Pong frame in response". The test client did so for each ping.' },
					{ q: 'With 30 s pings in the nginx 1.27.5 test, how long did the socket stay open?', options: ['Past 130 s, still open', 'Exactly 60.1 s, same as before', 'Exactly 90 s, three pings', 'It closed at once with code 1006'], answer: 0, why: 'Each ping reset the timer, so the 60 s limit never fired.' },
					{ q: 'A user still sees code 1006 one day. What can the client conclude from the code alone?', options: ['nginx\'s timeout fired, for sure', 'The server sent a Close frame', 'Nothing specific: a proxy timeout and a network failure both give 1006, so it reconnects', 'The browser closed the socket on purpose'], answer: 2, why: 'A drop by a proxy timeout gives the same code as a network failure. The client must reconnect either way.' }
				]
			}
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
	lab: {
		minutes: 20,
		goal: 'Put nginx in front of a silent WebSocket backend, watch the read timeout cut the socket, then keep it open with server pings.',
		steps: [
			'Set up the backend: `mkdir -p ~/ws-lab/conf && cd ~/ws-lab && npm init -y && npm install ws@8.18.0`. Create `server.js` with this line: `const { WebSocketServer } = require(\'ws\'); const wss = new WebSocketServer({ port: 9001 }); wss.on(\'connection\', (ws) => { console.log(\'client connected\'); if (process.env.PING) setInterval(() => ws.ping(), 5000); });`',
			'Create `conf/default.conf` with this line. The timeout is 10 s instead of 60 s so you wait less, and `/plain/` has no upgrade headers: `map $http_upgrade $connection_upgrade { default upgrade; \'\' close; } server { listen 8080; location /socket/ { proxy_pass http://127.0.0.1:9001; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection $connection_upgrade; proxy_read_timeout 10s; } location /plain/ { proxy_pass http://127.0.0.1:9001; } }`',
			'Start both. nginx shares the backend\'s network, so `127.0.0.1:9001` reaches it: `docker run -d --rm --name ws-backend -p 8080:8080 -v "$PWD:/app" -w /app node:24-alpine node server.js`, then `docker run -d --rm --name ws-proxy --network container:ws-backend -v "$PWD/conf:/etc/nginx/conf.d:ro" nginx:1.27-alpine`.',
			'Create `client.js` (Node 22 or newer has `WebSocket` built in): `const t = Date.now(); const ws = new WebSocket(process.argv[2]); ws.onopen = () => console.log(\'open\'); ws.onclose = (e) => { console.log(\'closed after\', ((Date.now() - t) / 1000).toFixed(1), \'s, code\', e.code); process.exit(); }; setTimeout(() => { console.log(\'still open at 25 s\'); process.exit(); }, 25000);`. Run `node client.js ws://localhost:8080/plain/`, then `node client.js ws://localhost:8080/socket/`, then `docker logs ws-proxy`.',
			'Turn on pings: `docker rm -f ws-proxy ws-backend`, run the two `docker run` commands again with `-e PING=1` added to the backend one, and run `node client.js ws://localhost:8080/socket/` again. Clean up with `docker rm -f ws-proxy ws-backend`.'
		],
		done: [
			'`/plain/` prints `closed after 0.1 s, code 1006`, and the nginx log shows `"GET /plain/ HTTP/1.1" 426`.',
			'`/socket/` prints `open`, then `closed after 10.0 s, code 1006`, and the nginx log shows `"GET /socket/ HTTP/1.1" 101`.',
			'With `PING=1`, `/socket/` prints `open`, then `still open at 25 s`.'
		],
		solution: [
			'Without the two `proxy_set_header` lines, the backend gets no `Upgrade` header and refuses with `426`. No `101` comes back, so the handshake fails at once.',
			'On `/socket/` the backend sends nothing. After `proxy_read_timeout`, here 10 s, nginx closes both connections without a Close frame: code 1006.',
			'A ping every 5 s is backend data, so nginx resets its timer before 10 s pass. In production, the same rule gives a ping every 30 s for the default 60 s.'
		]
	},
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
