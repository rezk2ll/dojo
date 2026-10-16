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
