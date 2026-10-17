/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'networking',
	part: 'Ops tools',
	title: 'Network checks',
	minutes: 10,
	hook: [
		'The app on `web-01` logs `connection refused` when it calls the database. You are root on `web-01` and go through the usual checks: names, addresses, listening ports, then reachability.',
		'`web-01` has one network interface, `eth0`, and a service of its own listening on TCP port 8080. The database runs on `db-01`, port 5432. For DNS you check `example.com` against the default resolver and against the public resolver `1.1.1.1`. The `nc` installed is the OpenBSD netcat.'
	],
	terms: [
		{ term: 'resolver', def: 'The DNS server that answers your lookups. `dig` uses the one in `/etc/resolv.conf` unless you name another with `@`.' },
		{ term: 'A record', def: 'A DNS record that maps a name to an IPv4 address. `dig` asks for it when you give no type.' },
		{ term: 'listening socket', def: 'A socket that waits for incoming connections on a port, like the one a database opens on 5432.' }
	],
	reps: [
		{
			prompt: 'Look up the A record of `example.com` with `dig`, with the full output.',
			accept: ['dig example.com', 'dig example.com A', 'dig A example.com', 'dig -t A example.com', 'dig example.com -t A'],
			why: 'With no type, `dig` asks for an A record. The answer is in the `ANSWER SECTION`, one line per record with its TTL in seconds.'
		},
		{
			prompt: 'Print only the addresses for `example.com`, one per line, with no headers.',
			accept: ['dig +short example.com', 'dig example.com +short', 'dig +short example.com A', 'dig example.com A +short', 'dig +short A example.com'],
			why: '`+short` prints a terse answer: only the record data, here one IPv4 address per line, with no sections or comments.'
		},
		{
			prompt: 'Ask for the MX records of `example.com`.',
			accept: [
				'dig example.com MX',
				'dig MX example.com',
				'dig -t MX example.com',
				'dig example.com -t MX',
				'dig example.com mx',
				'dig mx example.com',
				'dig -t mx example.com'
			],
			why: 'The type comes after the name, or with `-t`. The answer line for `example.com` is `MX 0 .`, a priority then a mail server name.'
		},
		{
			prompt: 'Ask the resolver `1.1.1.1` directly for the A record of `example.com`, to compare with your default resolver.',
			accept: ['dig @1.1.1.1 example.com', 'dig example.com @1.1.1.1', 'dig @1.1.1.1 example.com A', 'dig example.com A @1.1.1.1'],
			why: '`@1.1.1.1` sends the query to that server instead of the one in `/etc/resolv.conf`. You then compare its `ANSWER SECTION` with the one from `dig example.com`.'
		},
		{
			prompt: 'Find the name behind the address `1.1.1.1`, printing only the name.',
			accept: ['dig -x 1.1.1.1 +short', 'dig +short -x 1.1.1.1'],
			why: '`-x` makes a reverse lookup: `dig` asks for the PTR record of `1.1.1.1.in-addr.arpa`. Here it prints `one.one.one.one.`.'
		},
		{
			prompt: 'Show the addresses of the interface `eth0`.',
			accept: [
				'ip addr show eth0',
				'ip address show eth0',
				'ip a show eth0',
				'ip addr show dev eth0',
				'ip address show dev eth0',
				'ip a show dev eth0',
				'ip a s eth0',
				'ip addr s eth0'
			],
			why: '`ip addr show eth0` prints each IPv4 address on an `inet` line and each IPv6 address on an `inet6` line, with its prefix length, like `/20`. `ip a` is the short form of `ip address`.'
		},
		{
			prompt: 'List the listening TCP sockets, with numeric ports and the process that owns each one.',
			accept: [
				'ss -tlnp', 'ss -tlpn', 'ss -tnlp', 'ss -tnpl', 'ss -tpln', 'ss -tpnl',
				'ss -ltnp', 'ss -ltpn', 'ss -lntp', 'ss -lnpt', 'ss -lptn', 'ss -lpnt',
				'ss -ntlp', 'ss -ntpl', 'ss -nltp', 'ss -nlpt', 'ss -nptl', 'ss -nplt',
				'ss -ptln', 'ss -ptnl', 'ss -pltn', 'ss -plnt', 'ss -pntl', 'ss -pnlt',
				'ss -t -l -n -p'
			],
			why: '`-t` keeps TCP, `-l` keeps listening sockets, `-n` shows `8080` instead of a service name, and `-p` adds the owner, like `users:(("nc",pid=7,fd=3))`.'
		},
		{
			prompt: 'Send exactly 4 pings to `db-01` and stop.',
			accept: ['ping -c 4 db-01', 'ping -c4 db-01', 'ping db-01 -c 4'],
			why: '`-c 4` stops after sending 4 echo requests. ping then prints a summary with the packet loss and the `min/avg/max` round trip times.'
		},
		{
			prompt: 'Check whether TCP port 5432 on `db-01` accepts connections, without sending any data, and print the result.',
			accept: ['nc -zv db-01 5432', 'nc -vz db-01 5432', 'nc -z -v db-01 5432', 'nc -v -z db-01 5432'],
			why: '`-z` only checks for a listener and sends nothing; `-v` prints the result. An open port gives `succeeded!`, a closed one `Connection refused` and exit code 1.'
		},
		{
			prompt: 'Print the route to `1.1.1.1` hop by hop, with numeric addresses only.',
			accept: ['traceroute -n 1.1.1.1', 'traceroute 1.1.1.1 -n'],
			why: '`-n` skips the reverse lookup of each hop. Each line is one hop with 3 probe times; a `*` means that probe got no reply before the timeout.'
		}
	],
	quiz: [],
	recall: {
		q: 'Which four `ss` flags list the listening TCP sockets with numeric ports and their processes?',
		a: '`ss -tlnp`: `-t` TCP, `-l` listening, `-n` numeric, `-p` processes.'
	},
	sources: [
		{ title: 'dig(1) manual page', url: 'https://manpages.debian.org/bookworm/bind9-dnsutils/dig.1.en.html' },
		{ title: 'ip-address(8) manual page', url: 'https://manpages.debian.org/bookworm/iproute2/ip-address.8.en.html' },
		{ title: 'ss(8) manual page', url: 'https://manpages.debian.org/bookworm/iproute2/ss.8.en.html' },
		{ title: 'ping(8) manual page', url: 'https://manpages.debian.org/bookworm/iputils-ping/ping.8.en.html' },
		{ title: 'nc(1) manual page (OpenBSD netcat)', url: 'https://manpages.debian.org/bookworm/netcat-openbsd/nc.1.en.html' },
		{ title: 'traceroute(1) manual page', url: 'https://manpages.debian.org/bookworm/traceroute/traceroute.1.en.html' }
	]
};
