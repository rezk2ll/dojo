const NGINX = 'https://github.com/nginx/nginx/blob/1725db9059e8d4057ce8d5090673d16e20713b45';
const CORE = `${NGINX}/src/http/ngx_http_core_module.c`;
const REALIP = `${NGINX}/src/http/modules/ngx_http_realip_module.c`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'reverse-proxy',
	part: 'Between services',
	title: 'Reverse proxies and forwarded headers',
	minutes: 10,
	hook: [
		'A security advisory for Litestar 2.17.0 shows a rate limit of 2 requests per minute. The third `curl http://localhost:8000/api/data` gets `429 Too Many Requests`. Then the reporter adds `-H "X-Forwarded-For: 192.168.1.100"`, then `.101`, then `.102`, and every request gets `200 OK`.',
		'The middleware used the header value as the client\'s identity. The advisory: "Since clients can set arbitrary X-Forwarded-For values, each different spoofed IP creates a separate rate limit bucket." Version 2.18.0 fixed it.',
		'Behind a reverse proxy, the app\'s TCP peer is the proxy, so every request seems to come from the proxy\'s address. The proxy writes the real client address into a header. **A client can send that same header itself**, so only the entries added by your own proxies are worth reading.'
	],
	terms: [
		{ term: 'Reverse proxy', def: 'A server in front of your app that accepts client connections and opens its own connections to the app. In nginx, `proxy_pass http://127.0.0.1:8000;` makes a location a reverse proxy.' },
		{ term: 'X-Forwarded-For', def: 'A request header holding a comma-separated list of addresses. Each proxy appends the address of the peer it received the request from, so the last entry was added by the nearest proxy.' },
		{ term: 'Trusted proxy', def: 'An address you list as one of your own proxies, like nginx\'s `set_real_ip_from 10.0.1.0/24;`. Only a request arriving from a trusted proxy gets its forwarded header read.' },
		{ term: 'Forwarded', def: 'The standard header from RFC 7239 that carries the same information in one field: `Forwarded: for=192.0.2.43;proto=https;by=203.0.113.60`.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['c["Client 198.51.100.23"] -->|"X-Forwarded-For: 192.168.1.100"| edge["Edge nginx 10.0.1.10"]'],
				highlight: ['c', 'edge'],
				note: 'The client typed the `X-Forwarded-For` header itself. The edge nginx sees the TCP peer address in `$remote_addr`: 198.51.100.23. The header is only text, and nginx does not check it.'
			},
			{
				add: ['edge -->|"X-Forwarded-For: 192.168.1.100, 198.51.100.23"| inner["Inner nginx 10.0.2.20"]'],
				highlight: ['edge', 'inner'],
				note: 'The edge has `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`. That variable is the incoming header "with the $remote_addr variable appended to it, separated by a comma". The forged entry stays first, and the real address is added last.'
			},
			{
				add: ['inner --> realip["realip: set_real_ip_from 10.0.1.0/24"]'],
				highlight: ['realip'],
				note: 'The inner nginx gets the connection from 10.0.1.10, which is inside `10.0.1.0/24`, so it reads the header. It takes the last entry, 198.51.100.23, and puts it in `$remote_addr`. The entry 192.168.1.100 is never used.'
			},
			{
				add: ['inner -->|"X-Real-IP: 198.51.100.23"| app["App 10.0.3.30"]', 'app -.->|"leftmost entry"| bad["192.168.1.100: a new rate limit bucket per forged value"]'],
				highlight: ['app', 'bad'],
				note: 'The inner nginx passes the corrected address with `proxy_set_header X-Real-IP $remote_addr;`, and an app that reads it rate limits 198.51.100.23. If the app reads the first entry of `X-Forwarded-For` instead, it gets 192.168.1.100. Litestar had this bug: the client picks a new value per request and gets a new bucket each time.'
			}
		]
	},
	example: {
		title: 'src/http/ngx_http_core_module.c: walking X-Forwarded-For from the right',
		repo: 'nginx/nginx',
		url: `${CORE}#L2896-L2938`,
		lang: 'c',
		code: `static ngx_int_t
ngx_http_get_forwarded_addr_internal(ngx_http_request_t *r, ngx_addr_t *addr,
    u_char *xff, size_t xfflen, ngx_array_t *proxies, int recursive)
{
    u_char      *p;
    ngx_addr_t   paddr;
    ngx_uint_t   found;

    found = 0;

    do {

        if (ngx_cidr_match(addr->sockaddr, proxies) != NGX_OK) {
            return found ? NGX_DONE : NGX_DECLINED;
        }

        for (p = xff + xfflen - 1; p > xff; p--, xfflen--) {
            if (*p != ' ' && *p != ',') {
                break;
            }
        }

        for ( /* void */ ; p > xff; p--) {
            if (*p == ' ' || *p == ',') {
                p++;
                break;
            }
        }

        if (ngx_parse_addr_port(r->pool, &paddr, p, xfflen - (p - xff))
            != NGX_OK)
        {
            return found ? NGX_DONE : NGX_DECLINED;
        }

        *addr = paddr;
        found = 1;
        xfflen = p - 1 - xff;

    } while (recursive && p > xff);

    return NGX_OK;
}`,
		notes: [
			'The [realip module](' + REALIP + '#L229-L235) calls this function with `addr` set to the connection\'s peer address and `proxies` set to the `set_real_ip_from` list.',
			'Line 13 checks the current address against the trusted list. If the TCP peer is not trusted, the function returns `NGX_DECLINED` on the first pass and nginx ignores the header completely.',
			'Lines 17 to 28 start at the end of the header, skip trailing spaces and commas, then move back to the previous comma. The result is the last entry of the list, which line 30 parses as an address.',
			'Line 36 replaces `addr` with that entry. With `real_ip_recursive on`, line 40 loops: the new address goes through the trust check on line 13 again. The walk stops at the first entry that is not a trusted proxy.'
		]
	},
	tradeoff: {
		gain: [
			'The app logs and rate limits the client\'s address, 198.51.100.23, instead of the proxy\'s 10.0.1.10 for every request.',
			'Reading from the right with a trusted list ignores anything the client wrote: the forged 192.168.1.100 never reaches `$remote_addr`.'
		],
		cost: [
			'The `set_real_ip_from` list must match your proxies. If the load balancer moves to an address outside the list, line 13 returns `NGX_DECLINED` and every request shows the balancer\'s address again.',
			'RFC 7239 warns that the header "can reveal internal structures of the network setup", so it "should never be copied into response messages".',
			'Each proxy hop must append to `X-Forwarded-For`. A hop that overwrites or drops it loses the entries before it, and a hop that only passes it through lets the client\'s value arrive last.'
		]
	},
	task: {
		prompt: 'An inner nginx has `set_real_ip_from 10.0.1.0/24;`, `set_real_ip_from 10.0.2.0/24;` and `real_ip_header X-Forwarded-For;`. A request arrives from 10.0.2.20 with `X-Forwarded-For: 192.168.1.100, 198.51.100.23, 10.0.1.10`. What is `$remote_addr` with `real_ip_recursive off`, and with `real_ip_recursive on`?',
		hint: 'Start from the TCP peer, then read the list from the right. Stop when the address you hold is not in a trusted range.',
		answer: [
			'With `real_ip_recursive off`: the peer 10.0.2.20 is trusted, so nginx takes the last entry, 10.0.1.10, and stops. `$remote_addr` is 10.0.1.10, the edge proxy, which is wrong for logging.',
			'With `real_ip_recursive on`: 10.0.1.10 is in `10.0.1.0/24`, so the loop continues with the next entry from the right, 198.51.100.23. That address is not trusted, so the walk stops there: `$remote_addr` is 198.51.100.23.',
			'192.168.1.100 is never used in either case. The client wrote it, and the walk stops at the first untrusted entry before reaching it.'
		],
		steps: [
			{
				title: 'Start from the TCP peer',
				questions: [
					{ q: 'Which hop appended 10.0.1.10, the last entry, to the header?', options: ['The proxy at 10.0.2.20, which got the request from 10.0.1.10', 'The proxy at 10.0.1.10, writing its own address', 'The client', 'This inner nginx'], answer: 0, why: 'Each proxy appends the address of the peer it received the request from. 10.0.1.10 was the peer of 10.0.2.20, which is the inner nginx\'s own peer.' },
					{ q: 'Is the peer 10.0.2.20 trusted?', options: ['No: it is private, but private does not mean listed', 'Yes: it is inside `10.0.2.0/24`', 'Only with `real_ip_recursive on`', 'Yes: every 10.x address is trusted by default'], answer: 1, why: '`set_real_ip_from 10.0.2.0/24;` covers 10.0.2.20, so nginx goes on to read the header.' },
					{ q: 'What would nginx do if the peer were not in a trusted range?', options: ['Take the first entry of the header', 'Take the last entry anyway', 'Ignore the header and keep the peer address', 'Reject the request with `400`'], answer: 2, why: 'Line 13 returns `NGX_DECLINED` on the first pass, and nginx ignores the header completely.' },
					{ q: 'How many of your own proxies handled the request before this inner nginx?', options: ['None: the header came from the client', 'One: 10.0.2.20', 'Three: one per header entry', 'Two: 10.0.1.10 and 10.0.2.20'], answer: 3, why: 'The TCP peer 10.0.2.20 is one. The last entry, 10.0.1.10, is the peer that 10.0.2.20 saw, and it sits in `10.0.1.0/24`, so it is the hop before.' }
				]
			},
			{
				title: 'Walk with `real_ip_recursive off`',
				questions: [
					{ q: 'The peer is trusted. Which line of the code turns the entry 10.0.1.10 into an address?', options: ['Line 13, `ngx_cidr_match`', 'Line 30, `ngx_parse_addr_port`', 'Line 40, the `while` test', 'Line 11, the start of the `do` loop'], answer: 1, why: 'Lines 17 to 28 find where the last entry starts, and line 30 parses it with `ngx_parse_addr_port`. Line 36 then puts it in `addr`.' },
					{ q: 'Does nginx then check 10.0.1.10 against the trusted list?', options: ['No: with `off`, it stops after one entry', 'Yes, and it goes on to the next entry', 'Yes, and it rejects the request', 'Only if the entry is a private address'], answer: 0, why: 'The loop on line 40 runs again only when `recursive` is set. With `off`, one entry is all it reads.' },
					{ q: 'So what is `$remote_addr` with `real_ip_recursive off`?', options: ['10.0.2.20', '198.51.100.23', '192.168.1.100', '10.0.1.10'], answer: 3, why: 'nginx replaced the peer address with the last entry, then stopped.' },
					{ q: 'Why is that result wrong for logging?', options: ['It is the forged entry', 'It is the inner nginx itself', 'It is the edge proxy, not the client', 'It is not a valid address'], answer: 2, why: '10.0.1.10 is your own edge nginx. Every request would seem to come from it.' }
				]
			},
			{
				title: 'Walk with `real_ip_recursive on`',
				questions: [
					{ q: 'nginx holds 10.0.1.10. Which trusted range covers it?', options: ['`10.0.2.0/24`, the peer range', 'None, so the walk stops', '`10.0.1.0/24`, so the walk goes on', 'Both ranges at once'], answer: 2, why: 'With `recursive on`, the new address goes through the trust check again. 10.0.1.10 is inside `10.0.1.0/24`.' },
					{ q: 'Which entry comes next from the right?', options: ['198.51.100.23', '192.168.1.100', '10.0.2.20', 'The walk restarts from the left'], answer: 0, why: 'The walk moves one entry left each pass. Before 10.0.1.10 comes 198.51.100.23.' },
					{ q: 'Is 198.51.100.23 trusted?', options: ['Yes: public addresses are trusted', 'Yes: it appears in the header', 'No, so nginx falls back to the peer 10.0.2.20', 'No, so the walk stops and it becomes `$remote_addr`'], answer: 3, why: 'It is in neither `set_real_ip_from` range. The walk stops at the first untrusted entry and keeps it.' },
					{ q: 'So what is `$remote_addr` with `real_ip_recursive on`?', options: ['10.0.1.10', '198.51.100.23', '192.168.1.100', '10.0.2.20'], answer: 1, why: 'The walk skipped the trusted edge proxy and stopped at the first address that is not one of yours: the client.' }
				]
			},
			{
				title: 'Check the forged entry',
				questions: [
					{ q: 'The client sends `X-Forwarded-For: 10.0.1.99` instead, an address inside the trusted `10.0.1.0/24`. What is `$remote_addr` with `real_ip_recursive on`?', options: ['10.0.1.99, since it is in a trusted range', '10.0.1.10', '10.0.2.20', '198.51.100.23: the walk stops there and never reaches the first entry'], answer: 3, why: 'The walk goes from the right: 10.0.1.10 is trusted, 198.51.100.23 is not, so it stops there. A trusted-looking value further left is never checked.' },
					{ q: 'Who wrote 192.168.1.100 into the header?', options: ['The edge nginx', 'The client', 'The inner nginx', 'The app'], answer: 1, why: 'Each proxy appends the peer it saw. The entry left of the client\'s real address can only come from the client.' },
					{ q: 'An app reads the first `X-Forwarded-For` entry. What does it get?', options: ['192.168.1.100, which the client can change on every request', '198.51.100.23, the real client', '10.0.1.10, the edge proxy', '10.0.2.20, the inner peer'], answer: 0, why: 'That is the Litestar bug: each forged value became a new rate limit bucket.' },
					{ q: 'Which setting fits this inner nginx, with two proxy hops?', options: ['`real_ip_recursive off`, so it reads one entry only', '`set_real_ip_from 0.0.0.0/0`, to trust every hop', '`real_ip_recursive on`, so it skips over its own proxies', 'No `set_real_ip_from`, to read the header as is'], answer: 2, why: 'With two trusted hops, `on` walks past the edge proxy and stops at the client. Trusting everything would let the client\'s entry win.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'An app runs behind nginx with `proxy_pass http://127.0.0.1:8000;` and no extra headers. Every request in its log comes from 127.0.0.1. Why?',
			options: [
				'nginx opens its own TCP connection to the app, so the app\'s peer is nginx',
				'nginx rewrites the source address of each client packet to its own address',
				'The app reads `X-Forwarded-For`, and nginx fills it with 127.0.0.1 by default',
				'The client resolves the app\'s name to 127.0.0.1 and connects to it directly'
			],
			answer: 0,
			why: 'A reverse proxy ends the client\'s connection and opens a new one to the backend. The backend sees only that second connection, whose source is the proxy. The client address reaches the app only if the proxy adds it in a header.'
		},
		{
			q: 'A client at 198.51.100.23 sends `X-Forwarded-For: 1.2.3.4` to nginx with `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`. What does the backend receive?',
			options: [
				'`X-Forwarded-For: 198.51.100.23`, because nginx replaces the client\'s value',
				'`X-Forwarded-For: 1.2.3.4`, because nginx forwards the header unchanged',
				'`X-Forwarded-For: 1.2.3.4, 198.51.100.23`, the client value then the peer',
				'`X-Forwarded-For: 198.51.100.23, 1.2.3.4`, the peer first then the client value'
			],
			answer: 2,
			why: '`$proxy_add_x_forwarded_for` is the incoming `X-Forwarded-For` with `$remote_addr` appended after a comma. The client\'s text stays at the front, and the address nginx saw on the socket is added at the end.'
		},
		{
			q: 'With one nginx in front of your app, which `X-Forwarded-For` entry should a rate limiter use?',
			options: [
				'The first entry, because it is the address of the original client',
				'The last entry, because your nginx appended it from the socket address',
				'Any entry from a private range, because those come from your own network',
				'The entry that appears most often, because forged values change per request'
			],
			answer: 1,
			why: 'Each proxy appends the peer address it saw, so the last entry comes from your nginx and the client cannot change it. Everything before it was sent by the client and can be any text, as the Litestar advisory showed with 192.168.1.100, .101 and .102.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Run an edge nginx and two inner nginx servers with realip, send forged `X-Forwarded-For` headers, and see which address wins.',
		steps: [
			'Create the config: `mkdir -p ~/rp-lab/conf && cd ~/rp-lab`, then put this one line in `conf/default.conf`. Port 8090 is the edge, 8091 an inner server with `real_ip_recursive off`, 8092 the same with `on`: `server { listen 8090; location / { proxy_pass http://127.0.0.1:8091; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; } } server { listen 8091; set_real_ip_from 127.0.0.1; set_real_ip_from 10.0.1.0/24; real_ip_header X-Forwarded-For; return 200 "remote_addr=$remote_addr xff=$http_x_forwarded_for\\n"; } server { listen 8092; set_real_ip_from 127.0.0.1; set_real_ip_from 10.0.1.0/24; real_ip_header X-Forwarded-For; real_ip_recursive on; return 200 "remote_addr=$remote_addr xff=$http_x_forwarded_for\\n"; }`',
			'Start it: `docker run -d --rm --name rp-lab -p 8090:8090 -p 8091:8091 -v "$PWD/conf:/etc/nginx/conf.d:ro" nginx:1.27-alpine`.',
			'Forge a header through the edge: `curl -s localhost:8090/ -H "X-Forwarded-For: 192.168.1.100"`. Then send the same header straight to the inner server: `curl -s localhost:8091/ -H "X-Forwarded-For: 192.168.1.100"`.',
			'Replay the task from inside the container, where the peer is the trusted 127.0.0.1: `docker exec rp-lab wget -qO- --header "X-Forwarded-For: 192.168.1.100, 198.51.100.23, 10.0.1.10" http://127.0.0.1:8091/`, then the same with port 8092. Clean up with `docker rm -f rp-lab`.'
		],
		done: [
			'Through the edge, `xff` ends with your Docker gateway address (for example `192.168.1.100, 172.17.0.1` on Linux), and `remote_addr` is that gateway address, not 192.168.1.100.',
			'Straight to port 8091, `remote_addr` is the gateway address and the forged header is ignored.',
			'Port 8091 from inside prints `remote_addr=10.0.1.10`, and port 8092 prints `remote_addr=198.51.100.23`.'
		],
		solution: [
			'The edge appends the peer it saw with `$proxy_add_x_forwarded_for`. The inner server trusts 127.0.0.1, takes the last entry, and the forged first entry is never read.',
			'From your host, the peer of port 8091 is the Docker gateway, which is not in `set_real_ip_from`. nginx ignores the header, so a client that skips your proxy cannot spoof anything.',
			'With `off`, nginx takes one entry: the edge proxy 10.0.1.10. With `on`, it walks past the trusted 10.0.1.10 and stops at 198.51.100.23, the first untrusted address.'
		]
	},
	recall: {
		q: 'How does nginx\'s realip module pick the client address out of `X-Forwarded-For`, and what stops a forged entry?',
		a: 'It starts from the TCP peer and reads the list from the right. It takes an entry only while the address it holds is in `set_real_ip_from`, and stops at the first untrusted one, so a forged first entry like 192.168.1.100 is never reached.'
	},
	sources: [
		{ title: 'nginx docs, Module ngx_http_realip_module', url: 'https://nginx.org/en/docs/http/ngx_http_realip_module.html' },
		{ title: 'nginx docs, Module ngx_http_proxy_module', url: 'https://nginx.org/en/docs/http/ngx_http_proxy_module.html' },
		{ title: 'RFC 7239, Forwarded HTTP Extension', url: 'https://www.rfc-editor.org/rfc/rfc7239' },
		{ title: 'GHSA-hm36-ffrh-c77c, Litestar X-Forwarded-For Header Spoofing Vulnerability Enables Rate Limit Evasion', url: 'https://github.com/advisories/GHSA-hm36-ffrh-c77c' }
	]
};
