const H5BP = 'https://github.com/h5bp/server-configs-nginx/blob/d2f2c3e2fac76f429adb738894499b8fb756d2f3';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'networking',
	part: 'Fundamentals',
	title: 'Networking: debug one layer at a time',
	minutes: 10,
	hook: [
		'A user says the site is down, so you ssh in. `systemctl status nginx` says active, and `curl localhost` works. It works on the server. So **where** does it break?',
		'A request crosses four layers before nginx answers. DNS turns the name into an IP, TCP opens a connection to a port, TLS checks the certificate, and only then **HTTP asks for the page**.',
		'You test each layer on its own, with `dig`, `ss` and `curl`, from the name down to the page. Containers and clusters later in the course are debugged in the same order.'
	],
	terms: [
		{ term: 'DNS record', def: 'A name to value mapping. `A` gives an IPv4 address, `AAAA` an IPv6 address, `CNAME` another name. The TTL says how long resolvers may cache the answer.' },
		{ term: 'Port', def: 'A number that picks one listening program on a host. On Linux, by default, a process needs root or the `CAP_NET_BIND_SERVICE` capability to bind a port below 1024.' },
		{ term: 'TLS certificate', def: 'A file that proves a server owns a name. The client checks that the name matches the URL, that a trusted CA signed it, and that it has not expired.' },
		{ term: 'SNI', def: 'Server Name Indication: the client sends the host name inside the TLS handshake, so one IP can serve many certificates.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['cl["curl https://example.com"]', 'cl -->|"1. name"| dns["DNS: example.com to 203.0.113.10"]', 'class dns ext'],
				highlight: ['cl', 'dns'],
				note: '`dig example.com +short` asks the DNS server listed in `/etc/resolv.conf` directly. `getent hosts example.com` does the same lookup your programs do, **`/etc/hosts` included**. If the two print different addresses, look in `/etc/hosts` first.'
			},
			{
				add: ['cl -->|"2. TCP connect"| port["Port 443 on 203.0.113.10"]'],
				highlight: ['port'],
				note: 'Connection refused means the packet arrived and nothing listens there (or a firewall rejects it). A timeout means the packet was dropped on the way. On the server, `ss -tlnp` lists listening TCP sockets with **the process that owns each**.'
			},
			{
				add: ['subgraph srv["Server"]', 'ngx["nginx: server_name example.com"]', 'end', 'port -->|"3. TLS with SNI"| ngx'],
				highlight: ['ngx'],
				note: 'The client sends the name in SNI, and nginx picks a certificate. curl then checks that the **certificate name matches the URL** and that a trusted CA signed it. If either check fails, curl stops with exit code 60.'
			},
			{
				add: ['ngx -->|"4. HTTP with Host header"| app["Site files or app"]'],
				highlight: ['app'],
				note: 'Only now does HTTP start. nginx picks the `server` block by the **Host header**. If no block matches, the default server for that port answers. `curl -I` shows the status line and headers.'
			},
			{
				add: [],
				highlight: ['dns', 'port', 'ngx', 'app'],
				note: 'One curl line times every layer: `curl -s -o /dev/null -w \'%{time_namelookup} %{time_connect} %{time_appconnect} %{time_starttransfer}\\n\' https://example.com`. And `--resolve example.com:443:IP` skips DNS, to test a new server before you switch the record.'
			}
		]
	},
	example: {
		title: 'conf.d/templates/example.com.conf',
		repo: 'h5bp/server-configs-nginx',
		url: `${H5BP}/conf.d/templates/example.com.conf#L12-L37`,
		lang: 'nginx',
		code: `server {
  listen [::]:443 ssl http2;
  listen 443 ssl http2;

  server_name www.example.com;

  include h5bp/tls/ssl_engine.conf;
  include h5bp/tls/certificate_files.conf;
  include h5bp/tls/policy_balanced.conf;

  return 301 $scheme://example.com$request_uri;
}
…
server {
…
  listen [::]:443 ssl http2;
  listen 443 ssl http2;

  # The host name to respond to
  server_name example.com;

  include h5bp/tls/ssl_engine.conf;
  include h5bp/tls/certificate_files.conf;
  include h5bp/tls/policy_balanced.conf;`,
		notes: [
			'Lines 1 and 14 open two `server` blocks on the same port 443. nginx tells them apart by the names on lines 5 and 20: SNI during the TLS handshake, then the Host header. With no match, the first block for that port is the default.',
			'Lines 2 and 3 are separate sockets, one for IPv6, one for IPv4. If DNS publishes an `AAAA` record and you forget the IPv6 line, IPv6 users fail while your IPv4 test passes.',
			'Line 11: the `www` block only redirects, but it still needs a certificate that covers `www.example.com`. TLS comes **before** HTTP, so a wrong certificate stops the browser before it ever sees the 301.',
			'Line 8 includes [certificate_files.conf](https://github.com/h5bp/server-configs-nginx/blob/d2f2c3e2fac76f429adb738894499b8fb756d2f3/h5bp/tls/certificate_files.conf#L5-L24), which points at `default.crt`, served when a client sends no SNI. Replace it with your real certificate and key.',
			'Lines 2 and 3 use the `http2` parameter on `listen`, which [current nginx deprecates](https://nginx.org/en/docs/http/ngx_http_core_module.html#listen) in favour of the `http2` directive. Check a copied config against the docs of the nginx version you run.'
		]
	},
	tradeoff: {
		gain: [
			'Each tool answers one question: `dig` the name, `ss` the port, `curl -v` the TLS and HTTP. You can prove where it breaks instead of guessing.',
			'`--resolve` lets you test a new server under its real name before any DNS change.',
			'The same method works later inside a container or a Kubernetes cluster: name, port, TLS, HTTP.'
		],
		cost: [
			'`dig` does not read `/etc/hosts`, so `dig` and `curl` can return different addresses for the same name.',
			'Resolvers cache a DNS answer for its TTL, so after you change a record, some users get the old address until the TTL runs out.',
			'`curl -k` skips certificate checks. The error goes away, and the certificate problem you were debugging stays hidden.'
		]
	},
	task: {
		prompt: 'You move example.com to a new server, 198.51.100.7, and update DNS. Some users still get the old site, others get a certificate error. Write the checks you run, layer by layer.',
		hint: 'Test the new server under its real name **without** DNS first. Then look at what each resolver answers, for IPv4 and IPv6.',
		answer: [
			'TCP on the new server: `ss -tlnp` shows nginx listening on 443, on both `0.0.0.0` and `[::]`.',
			'TLS and HTTP without DNS: `curl -v --resolve example.com:443:198.51.100.7 https://example.com/`. Read the certificate subject and the status line. Repeat for `www.example.com`.',
			'DNS: `dig example.com +short` against your resolver and against a public one (`dig @1.1.1.1 example.com +short`). Old answers stay until the TTL runs out.',
			'Also `dig example.com AAAA +short`: an old IPv6 record still sends IPv6 users to the old server.',
			'Never "fix" the certificate error with `-k`. Find which name the certificate does not cover.'
		],
		steps: [
			{
				title: 'Check the port on the new server',
				questions: [
					{ q: 'Which layer do you check first on the new server itself?', options: ['HTTP, with `curl -I`', 'TCP: is nginx listening on 443?', 'DNS, with `dig`', 'The certificate expiry date'], answer: 1, why: 'Before any name or certificate matters, something must listen on the port.' },
					{ q: '`ss -tlnp` on the new server shows nginx on `0.0.0.0:443`. What does that line prove?', options: ['nginx accepts TCP connections on port 443 over IPv4, nothing more', 'The certificate covers `example.com`', 'DNS already points at 198.51.100.7', 'IPv6 users can connect too'], answer: 0, why: '`ss` only sees the port layer. The certificate, DNS and the `[::]` listener each need their own check.' },
					{ q: 'nginx listens on `0.0.0.0:443` but not on `[::]:443`. Who fails?', options: ['Nobody, IPv4 covers both', 'Only users with an old browser', 'Users who reach the server over IPv6', 'Only users of `www.example.com`'], answer: 2, why: 'IPv4 and IPv6 are separate sockets. If DNS publishes an `AAAA` record, IPv6 users need the `[::]` listener.' },
					{ q: 'A test from outside says "Connection refused". What does that tell you?', options: ['The name did not resolve', 'The certificate is wrong', 'The packet was dropped on the way', 'The packet arrived and nothing listens there, or a firewall rejects it'], answer: 3, why: 'Refused means the host answered. A timeout would mean the packet was dropped.' }
				]
			},
			{
				title: 'Test TLS and HTTP without DNS',
				questions: [
					{ q: 'How do you test the new server under its real name before trusting DNS?', options: ['`curl -k https://198.51.100.7/`', 'Edit the DNS record again', '`curl -v --resolve example.com:443:198.51.100.7 https://example.com/`', '`dig @198.51.100.7 example.com`'], answer: 2, why: '`--resolve` skips DNS and sends the real name in SNI and the Host header to the IP you choose.' },
					{ q: 'In that `curl -v` output, what do you read?', options: ['The certificate subject and the status line', 'Only the response body', 'The TTL of the record', 'The list of DNS servers'], answer: 0, why: 'The subject shows which names the certificate covers, and the status line shows HTTP works.' },
					{ q: 'Why repeat the test for `www.example.com`?', options: ['`www` uses a different port', 'The `www` block needs its own certificate name, even if it only redirects', '`www` skips TLS', 'DNS caches `www` longer'], answer: 1, why: 'TLS comes before HTTP, so a certificate that misses `www.example.com` fails before the 301 is ever sent.' },
					{ q: 'The new server uses the h5bp config. A client connects without sending SNI. Which certificate does it get?', options: ['The `www.example.com` certificate', 'None: nginx closes the connection', 'A certificate looked up in DNS', 'The `default.crt` from h5bp, unless you replaced it with your real one'], answer: 3, why: 'Line 8 includes `certificate_files.conf`, which points at `default.crt`, served when a client sends no SNI. Left in place, those clients get a certificate error.' }
				]
			},
			{
				title: 'Look at what DNS answers',
				questions: [
					{ q: 'Some users still get the old site. Why, if you updated DNS?', options: ['Resolvers cache the old answer until its TTL runs out', 'DNS changes need a server reboot', 'nginx caches the old IP', 'The certificate points at the old IP'], answer: 0, why: 'Resolvers may cache an answer for its TTL, so old answers linger after the change.' },
					{ q: 'How do you compare what different resolvers say?', options: ['`curl -I` twice', '`ss -tlnp` on both servers', '`dig example.com +short` against your resolver, then against a public one with `@`', '`getent hosts` on the new server'], answer: 2, why: '`dig @server` asks one specific DNS server, so you can see who still serves the old address.' },
					{ q: 'Which record can still send IPv6 users to the old server?', options: ['`A`', '`AAAA`', '`CNAME`', '`MX`'], answer: 1, why: 'An `AAAA` record gives the IPv6 address. Updating only the `A` record leaves IPv6 on the old box.' },
					{ q: 'On your laptop, which command does the same lookup `curl` does, so you can compare it with `dig`?', options: ['`dig example.com +short`', '`ss -tlnp`', '`curl -k https://example.com/`', '`getent hosts example.com`'], answer: 3, why: '`getent hosts` does the lookup your programs do, `/etc/hosts` included. If it prints a different address from `dig`, that answer did not come from DNS.' }
				]
			},
			{
				title: 'Fix the certificate error properly',
				questions: [
					{ q: 'A colleague suggests `curl -k` to get past the certificate error. What is wrong with that?', options: ['It skips the checks, so the problem you are debugging stays hidden', 'It is slower', 'It only works on IPv6', 'It disables SNI'], answer: 0, why: '`-k` makes the error go away and leaves the certificate problem in place for real users.' },
					{ q: 'Which three things does a client check on a certificate?', options: ['Its size, its port and its IP', 'The name matches the URL, a trusted CA signed it, it has not expired', 'Its TTL, its record type and its resolver', 'The Host header, the status line and the body'], answer: 1, why: 'Name, signer and expiry are the three checks.' },
					{ q: 'curl stops on a certificate check. Which exit code does it return?', options: ['7', '22', '60', '127'], answer: 2, why: 'curl exits with 60 when it cannot verify the peer certificate.' },
					{ q: 'Users who hit `www` get the certificate error. What do you look for?', options: ['A missing `AAAA` record', 'A closed port 80', 'A long TTL', 'Which name the certificate does not cover'], answer: 3, why: 'A name mismatch is the usual cause: the certificate covers `example.com` but not `www.example.com`, or the other way round.' }
				]
			}
		]
	},
	quiz: [
		{
			q: '`curl https://example.com` fails with "Connection refused". Which layer failed?',
			options: [
				'DNS: the name did not resolve to any address',
				'TCP: nothing accepted the connection on that port',
				'TLS: the server certificate expired and was rejected',
				'HTTP: the server answered with a 404 for that page'
			],
			answer: 1,
			why: 'Refused means the name resolved and a packet reached the host, but no program listens on that port (or a firewall rejected it). A DNS failure says "Could not resolve host" instead.'
		},
		{
			q: '`dig example.com +short` shows the new IP, but `curl` on your laptop still reaches the old server. Most likely cause?',
			options: [
				'An `/etc/hosts` entry, which `curl` uses and `dig` ignores',
				'`dig` uses a faster DNS server than the one `curl` asks',
				'The TLS session is cached for a week, so `curl` keeps the old host',
				'Port 443 is closed on the new server, so `curl` falls back to the old one'
			],
			answer: 0,
			why: '`dig` asks a DNS server directly. Programs like `curl` go through the system resolver, which also reads `/etc/hosts`. Compare with `getent hosts example.com`.'
		},
		{
			q: 'Why does nginx need SNI to choose a certificate, instead of the HTTP Host header?',
			options: [
				'The Host header only exists in HTTP/1.0, not in HTTP/2',
				'The TLS handshake happens before any HTTP is sent',
				'SNI is faster to parse than the full set of HTTP headers',
				'The Host header is removed by DNS before the request arrives'
			],
			answer: 1,
			why: 'The certificate is part of the TLS handshake, and HTTP only starts once TLS is set up. SNI puts the name inside the handshake itself.'
		}
	],
	lab: {
		minutes: 25,
		goal: 'Run a local HTTPS server for example.com and make each layer fail on purpose: port, TLS trust, certificate name, then a clean answer.',
		steps: [
			'Make a self-signed certificate for `example.com`: `mkdir -p ~/net-lab && cd ~/net-lab && openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 2 -subj /CN=example.com -addext subjectAltName=DNS:example.com`.',
			'Write `site.conf` with one `server` block: `listen 443 ssl;`, `server_name example.com;`, `ssl_certificate /etc/nginx/certs/cert.pem;`, `ssl_certificate_key /etc/nginx/certs/key.pem;` and `return 200 "new server\\n";`.',
			'Start it: `docker run -d --name netlab -p 8443:443 -v "$PWD/site.conf:/etc/nginx/conf.d/default.conf:ro" -v "$PWD:/etc/nginx/certs:ro" nginx:1.27-alpine`. Check the port with `ss -tln | grep 8443` (on macOS: `lsof -iTCP:8443 -sTCP:LISTEN`).',
			'Test each layer with `--resolve`, which skips DNS. Wrong port: `curl -s --resolve example.com:8444:127.0.0.1 https://example.com:8444/; echo $?`. Untrusted CA: `curl -s --resolve example.com:8443:127.0.0.1 https://example.com:8443/; echo $?`.',
			'Trust your CA, then try a name the certificate does not cover: `curl -s --cacert cert.pem --resolve example.com:8443:127.0.0.1 https://example.com:8443/`, then the same with `www.example.com` in both places, followed by `echo $?`.',
			'Time every layer: `curl -s -o /dev/null --cacert cert.pem --resolve example.com:8443:127.0.0.1 -w \'%{time_namelookup} %{time_connect} %{time_appconnect} %{time_starttransfer}\\n\' https://example.com:8443/`. Clean up with `docker rm -f netlab`.'
		],
		done: [
			'`ss -tln` shows 8443 listening on both `0.0.0.0` and `[::]`.',
			'The wrong port prints exit code `7` (connection refused).',
			'Without `--cacert`, curl exits with `60`. With it, it prints `new server`. With `www.example.com`, it exits with `60` again.',
			'The `-w` line prints four growing times, and `time_appconnect` is where TLS finished.'
		],
		solution: [
			'Exit 7 is TCP: nothing listens on 8444. Exit 60 is TLS: either the CA is unknown or the name does not match.',
			'The two `60` errors have different causes. `curl -v` shows which: "self-signed certificate" for trust, "no alternative certificate subject name matches target host name" for the name. The exact wording depends on the TLS library your curl uses.',
			'`curl -k` would print `new server` in both cases and hide both problems. Adding `DNS:www.example.com` to `subjectAltName` is the real fix for the second one.'
		]
	},
	recall: {
		q: 'In which order do you test the layers of a failing HTTPS request, and which tool checks each one?',
		a: 'Name, port, TLS, HTTP. `dig` checks the name, `ss -tlnp` the port, and `curl -v` the TLS and HTTP.'
	},
	sources: [
		{ title: 'curl manual (--resolve, -w, --fail, exit codes)', url: 'https://curl.se/docs/manpage.html' },
		{ title: 'BIND 9 manual pages, dig', url: 'https://bind9.readthedocs.io/en/stable/manpages.html#dig-dns-lookup-utility' },
		{ title: 'ss(8) manual page', url: 'https://man7.org/linux/man-pages/man8/ss.8.html' },
		{ title: 'nginx, Configuring HTTPS servers (SNI, certificate chains)', url: 'https://nginx.org/en/docs/http/configuring_https_servers.html' },
		{ title: 'nginx, How nginx processes a request', url: 'https://nginx.org/en/docs/http/request_processing.html' },
		{ title: 'RFC 7766, DNS transport over TCP', url: 'https://www.rfc-editor.org/rfc/rfc7766' }
	]
};
