const CURL = 'https://github.com/curl/curl/blob/98979fe46bd6fe7d8bedd3126e6c0340e2f9cfa4';
const HAPPY = `${CURL}/lib/cf-ip-happy.c`;
const HEDOC = `${CURL}/docs/libcurl/opts/CURLOPT_HAPPY_EYEBALLS_TIMEOUT_MS.md`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'ipv6',
	part: 'Names and addresses',
	title: 'IPv6 for IPv4 people',
	minutes: 10,
	hook: [
		'RFC 6555, 2012: "When IPv6 connectivity is impaired, today\'s IPv6-capable applications (e.g., web browsers, email clients, instant messaging clients) incur many seconds of delay before falling back to IPv4." The RFC adds that users then often disable IPv6 entirely.',
		'I measured it in this session. A small Python script connected to `[2001:db8::1]:80`, an address that never answers, then to the IPv4 address of example.com, one after the other. The IPv6 attempt failed with `Connection timed out` after 135.7 seconds, and only then did IPv4 connect.',
		'`curl` got the same two addresses for example.com, IPv6 first. It connected in **0.205 seconds**: after 200 ms with no answer on IPv6, it started IPv4 in parallel.'
	],
	terms: [
		{ term: 'IPv6 address', def: '128 bits, written as eight groups of four hex digits separated by colons. `::` replaces one run of zero groups and may appear only once.' },
		{ term: 'Link-local address', def: 'An address in `fe80::/10`, valid only on one link. RFC 4291 requires every IPv6 interface to have one, and RFC 4861 requires a router to send its advertisements from its link-local address.' },
		{ term: 'SLAAC', def: 'Stateless address autoconfiguration (RFC 4862): the router advertises a prefix, and the host adds its own 64-bit interface identifier to form a global address, with no DHCP server.' },
		{ term: 'Happy Eyeballs', def: 'A client algorithm (RFC 8305) for dual-stack hosts: try IPv6 first, and start an IPv4 attempt if IPv6 has not connected after a short delay, about 250 ms.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['curl["curl example.com"] -->|"A? and AAAA?"| dns["Resolver"]', 'dns -->|"2001:db8::1 and one IPv4"| curl'],
				highlight: ['curl', 'dns'],
				note: 'A dual-stack client asks for both record types. RFC 8305 says to start connecting as soon as the AAAA answer arrives, and to wait at most 50 ms for it after the A answer. In this run, `--resolve` handed curl both addresses directly.'
			},
			{
				add: ['curl -->|"t=0: SYN to [2001:db8::1]:80"| v6["IPv6 path: no answer"]'],
				highlight: ['v6'],
				note: 'curl tries IPv6 first. `2001:db8::/32` is reserved for documentation by RFC 3849, so the SYN reaches no host and nothing comes back: no SYN-ACK, no error.'
			},
			{
				add: ['curl -->|"t=200 ms: SYN to IPv4:80"| v4["example.com over IPv4"]'],
				highlight: ['v4'],
				note: 'After 200 ms with no reply, curl opens a second socket to the IPv4 address. The IPv6 socket stays open and could still win. curl\'s docs: "libcurl currently defaults to 200 ms. Firefox and Chrome currently default to 300 ms."'
			},
			{
				add: ['v4 -->|"SYN-ACK after 4 ms"| curl', 'curl -.->|"close the IPv6 attempt"| v6'],
				highlight: ['curl'],
				note: 'IPv4 answers. curl keeps that socket and closes the other. `-w %{time_connect}` printed 0.205 s: the 200 ms delay plus the round trip. With IPv4 alone it printed 0.004 s, and with `--happy-eyeballs-timeout-ms 1000` it printed 1.004 s.'
			},
			{
				add: ['seq["Client trying one address at a time"] -->|"waits 135.7 s on IPv6"| v6'],
				highlight: ['seq'],
				note: 'A client without Happy Eyeballs waits for the kernel to give up on the SYN. The kernel docs: with the default `tcp_syn_retries` of 6, "the final timeout for an active TCP connection attempt will happen after 131seconds". My run took 135.7 s.'
			}
		]
	},
	example: {
		title: 'lib/cf-ip-happy.c: when curl starts the next attempt, and in which family',
		repo: 'curl/curl',
		url: `${HAPPY}#L467-L506`,
		lang: 'c',
		code: `  /* no attempt connected yet, start another one? */
  pnow = Curl_pgrs_now(data);
  if(!ongoing) {
    do_more = TRUE;
  }
  else {
    bool more_possible = cf_ai_iter_has_more(&bs->addr_iter, data);
#ifdef USE_IPV6
    if(!more_possible)
      more_possible = cf_ai_iter_has_more(&bs->ipv6_iter, data);
#endif
    do_more = more_possible &&
      (curlx_ptimediff_ms(pnow, &bs->last_attempt_started) >=
       bs->attempt_delay_ms);
    if(do_more)
      CURL_TRC_CF(data, cf, "happy eyeballs timeout expired, "
                  "start next attempt");
  }

  if(do_more) {
    /* start the next attempt if there is another ip address to try.
     * Alternate between address families when possible. */
    const struct Curl_addrinfo *ai = NULL;
    int ai_family = 0;
    CURL_TRC_CF(data, cf, "want to do more");
#ifdef USE_IPV6
    if((bs->last_attempt_ai_family == AF_INET) ||
       !cf_ai_iter_has_more(&bs->addr_iter, data)) {
      ai = cf_ai_iter_next(&bs->ipv6_iter, data);
      ai_family = bs->ipv6_iter.ai_family;
      CURL_TRC_CF(data, cf, "check for next AAAA address: %s",
                  ai ? "found" : "none");
    }
#endif
    if(!ai) {
      ai = cf_ai_iter_next(&bs->addr_iter, data);
      ai_family = bs->addr_iter.ai_family;
      CURL_TRC_CF(data, cf, "check for next A address: %s",
                  ai ? "found" : "none");
    }`,
		notes: [
			'Lines 3 and 4: when no attempt is still running, for example because the last one failed at once, curl starts the next one right away.',
			'Lines 12 to 14: while an attempt is still waiting, curl starts another only once `attempt_delay_ms` has passed since the last start. That value is `data->set.happy_eyeballs_timeout`, 200 ms unless `--happy-eyeballs-timeout-ms` changes it.',
			'Lines 27 to 29 pick IPv6 when the previous attempt was IPv4. [`cf_ip_ballers_init`](' + HAPPY + '#L359-L361) sets `last_attempt_ai_family = AF_INET` with the comment "so AF_INET6 is next", which is why the first attempt is IPv6.',
			'Lines 35 to 37 fall back to the next A address. Taken together, the attempts alternate IPv6, IPv4, IPv6, as RFC 8305 asks: "if the first address in the sorted list is IPv6, then the first IPv4 address should be moved up in the list to be second".'
		]
	},
	tradeoff: {
		gain: [
			'A broken IPv6 path costs one delay instead of a full TCP timeout: 0.205 s against 135.7 s in this session.',
			'IPv6 stays the first choice. RFC 6555 gives IPv6 "a slight preference" to "reduce the load on IPv4 network address translators".'
		],
		cost: [
			'A dual-stack host has two paths to debug. A connection that works through curl can still hang in a client that tries one address at a time.',
			'Happy Eyeballs hides a broken IPv6 path. curl connected in 0.205 s instead of 0.004 s and printed no warning: only `-v` showed the `Trying [2001:db8::1]:80...` line.',
			'RFC 6555 notes the extra load: Happy Eyeballs sends more connection attempts to the network and to servers when IPv6 does not complete quickly.'
		]
	},
	task: {
		prompt: 'Three things to read. (1) Write `2001:db8::8:800:200c:417a` in full, all eight groups. (2) On the machine used for this chapter, `ip -6 route show default` printed `default via fe80::… dev wlp194s0 proto ra metric 600`, and `ip -6 addr` showed global addresses marked `dynamic`. Where did the gateway and the addresses come from, and why is the gateway a `fe80::` address? (3) The IPv6 path to a site is broken. How long does curl take to connect with its default, and how long does a client with a 300 ms delay take, if the IPv4 connect takes 5 ms?',
		hint: 'For (1), `::` stands for as many zero groups as are needed to reach eight. For (2), look at `proto ra`.',
		answer: [
			'(1) The address shows 6 groups, so `::` stands for 2: `2001:0db8:0000:0000:0008:0800:200c:417a`. RFC 4291 gives the same example, `2001:DB8:0:0:8:800:200C:417A`.',
			'(2) `proto ra` means the route was learned from a Router Advertisement. RFC 4861 requires the router to send it from its link-local address, so the host learns the gateway as a `fe80::` address, valid on that link only. The `dynamic` global addresses came from SLAAC: the advertised prefix plus the host\'s 64-bit interface identifier.',
			'(3) curl: 200 ms + 5 ms = about 205 ms, as measured. A client with a 300 ms delay: about 305 ms. Without Happy Eyeballs, the connect waits for the SYN timeout: about 131 seconds with default `tcp_syn_retries`.'
		],
		steps: [
			{
				title: 'Expand the address',
				questions: [
					{ q: 'How many groups does `2001:db8::8:800:200c:417a` show?', options: ['8', '6', '5', '4'], answer: 1, why: '`2001`, `db8`, then `8`, `800`, `200c`, `417a`: six groups around the `::`.' },
					{ q: 'How many zero groups does `::` stand for here?', options: ['2', '1', '3', '6'], answer: 0, why: 'An address has eight groups, so `::` fills the two that are missing.' },
					{ q: 'Which is the full form?', options: ['`2001:db8:0:8:800:200c:417a:0`', '`2001:db8:0:0:0:8:800:200c:417a`', '`2001:0:0:db8:8:800:200c:417a`', '`2001:db8:0:0:8:800:200c:417a`'], answer: 3, why: 'The two zero groups go where the `::` was, between `db8` and `8`. That gives eight groups.' },
					{ q: 'Why is `2001:db8::8::417a` not a valid address?', options: ['`::` may appear only once', 'A group cannot be a single digit', 'Addresses cannot start with `2001`', 'It has too many groups'], answer: 0, why: 'With two `::`, nobody could tell how many zeros each one hides. RFC 4291 allows only one.' }
				]
			},
			{
				title: 'Read the default route',
				questions: [
					{ q: 'What does `proto ra` in the route mean?', options: ['A DHCPv6 server set the route', 'Someone added it with `ip route add`', 'It was learned from a Router Advertisement', 'It points to a remote access VPN'], answer: 2, why: '`proto ra` marks routes learned from Router Advertisements, which is how SLAAC hosts get their default route.' },
					{ q: 'Why is the gateway a `fe80::` address?', options: ['The router has no global address', 'RFC 4861 requires advertisements to come from the link-local address', 'The host hides the router\'s real address', 'Link-local addresses are faster to route'], answer: 1, why: 'The router must send its advertisements from its link-local address, so that is the address the host learns as next hop.' },
					{ q: 'Is a `fe80::` next hop enough to reach the internet?', options: ['No: a gateway needs a global address', 'Only for traffic inside `fe80::/10`', 'Only if DHCPv6 is also running', 'Yes: the next hop only has to be reachable on the link'], answer: 3, why: 'The host only hands packets to the router on the local link. The router then forwards them with its own addresses.' },
					{ q: 'Why does the route name `dev wlp194s0`?', options: ['A link-local address is valid only on one link', 'The route is for wireless clients only', 'The kernel picks the fastest interface', 'IPv6 routes always name an interface for logging'], answer: 0, why: '`fe80::` addresses exist on every link, so the interface says which link this one belongs to.' }
				]
			},
			{
				title: 'Explain the global addresses',
				questions: [
					{ q: 'Where did the `dynamic` global addresses come from?', options: ['A DHCP server leased them', 'SLAAC: the advertised prefix plus the host\'s interface identifier', 'The ISP set them by hand', 'They are link-local addresses with a new prefix'], answer: 1, why: 'With SLAAC, the router advertises a prefix and the host adds its own 64-bit interface identifier, with no DHCP server.' },
					{ q: 'How many bits does the host add to the prefix?', options: ['32', '48', '64', '128'], answer: 2, why: 'SLAAC uses a 64-bit interface identifier.' },
					{ q: 'Which address does every IPv6 interface have, even with no router?', options: ['A global address from SLAAC', 'An address in `2001:db8::/32`', 'An IPv4-mapped address', 'A link-local address in `fe80::/10`'], answer: 3, why: 'RFC 4291 requires every IPv6 interface to have a link-local address.' },
					{ q: 'Both the route and the addresses came from one source. Which one?', options: ['The router\'s advertisements', 'The DNS resolver', 'The host\'s kernel defaults', 'The ISP\'s DHCPv6 server'], answer: 0, why: 'A Router Advertisement carries the router\'s link-local address and the prefix: one gives the route, the other the addresses.' }
				]
			},
			{
				title: 'Time the fallback',
				questions: [
					{ q: 'What does curl do when IPv6 has not connected after 200 ms?', options: ['Closes IPv6 and starts IPv4', 'Starts IPv4 in parallel, and keeps IPv6 open', 'Retries IPv6 with a new SYN', 'Gives up and reports a timeout'], answer: 1, why: 'The IPv6 socket stays open and could still win. curl races an IPv4 attempt next to it.' },
					{ q: 'IPv4 connects in 5 ms. How long does curl take with its default?', options: ['About 5 ms', 'About 200 ms', 'About 205 ms', 'About 305 ms'], answer: 2, why: '200 ms of waiting on IPv6, then 5 ms for IPv4: about 205 ms, as measured.' },
					{ q: 'How long for a client with a 300 ms delay, like Firefox or Chrome?', options: ['About 305 ms', 'About 300 ms', 'About 205 ms', 'About 600 ms'], answer: 0, why: '300 ms of delay plus the 5 ms IPv4 connect.' },
					{ q: 'And for a client that tries one address at a time?', options: ['About 5 ms, it picks IPv4', 'About 1 second', 'About 30 seconds', 'About 131 seconds'], answer: 3, why: 'It waits for the kernel to give up on the SYN: about 131 seconds with the default `tcp_syn_retries` of 6.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Which form of `2001:0db8:0000:0000:0000:ff00:0042:8329` is valid?',
			options: ['`2001:db8::ff00:42:8329`', '`2001:db8::ff00::42:8329`', '`2001:db8:ff00:42:8329`', '`2001:db8:0:ff00:42:8329`'],
			answer: 0,
			why: 'Leading zeros in a group may be dropped, and `::` replaces the run of three zero groups. `::` may appear only once (RFC 4291), and an address written without `::` must keep all eight groups.'
		},
		{
			q: 'IPv6 to a site is broken, IPv4 works. curl connects in about 0.2 s. A Python script that tries the addresses in order takes over 2 minutes. Why?',
			options: [
				'Python resolves AAAA records more slowly than curl does',
				'curl starts IPv4 after 200 ms, while the script waits for the SYN timeout',
				'curl disables IPv6 on the host when it detects a broken path',
				'The script sends its SYNs over UDP, which the network drops'
			],
			answer: 1,
			why: 'curl keeps the IPv6 attempt open and races an IPv4 attempt after its Happy Eyeballs delay. The script blocks in `connect()` until the kernel gives up after its SYN retries, about 131 s by default, then tries IPv4.'
		},
		{
			q: '`ip -6 route` shows `default via fe80::1 dev eth0 proto ra`. What does that tell you?',
			options: [
				'The host is misconfigured, because a default gateway needs a global address',
				'It was learned from a Router Advertisement sent from a link-local address',
				'The host has no IPv6 internet access, only traffic on the local link',
				'A DHCPv6 server assigned the gateway as a static route'
			],
			answer: 1,
			why: 'RFC 4861 requires Router Advertisements to come from the router\'s link-local address, and the next hop only needs to be reachable on the link. `proto ra` marks routes learned that way, which is how SLAAC hosts get their default route.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Break the IPv6 path on purpose and time curl\'s Happy Eyeballs fallback.',
		steps: [
			'Start a throwaway shell with IPv6 on and its own network namespace: `docker run -it --rm --cap-add NET_ADMIN --sysctl net.ipv6.conf.all.disable_ipv6=0 nicolaka/netshoot:v0.13`.',
			'Inside it, start a web server on IPv4 only: `python3 -m http.server 8000 --bind 127.0.0.1 >/dev/null 2>&1 &`.',
			'Make `2001:db8::/32` a silent black hole: `ip link add dummy0 type dummy && ip link set dummy0 up && ip -6 addr add 2001:db8:ffff::2/64 dev dummy0 && ip -6 route add 2001:db8::/32 dev dummy0`.',
			'Give curl both addresses, IPv6 first, and time the connect: `curl -s -o /dev/null -w "%{time_connect} %{remote_ip}\\n" --resolve demo.test:8000:[2001:db8::1],127.0.0.1 http://demo.test:8000/`.',
			'Run it again with `--happy-eyeballs-timeout-ms 1000`, then with `-4`, then with `-6 --connect-timeout 5`.'
		],
		done: [
			'The first run prints about `0.200` and `127.0.0.1`.',
			'With `--happy-eyeballs-timeout-ms 1000` it prints about `1.00`, and with `-4` close to `0.000`.',
			'With `-6 --connect-timeout 5`, curl fails after about 5000 ms with "Timeout was reached".'
		],
		solution: [
			'The SYN to `2001:db8::1` goes out on `dummy0` and nothing ever answers, like the broken path in the hook. curl waits its 200 ms delay, then starts IPv4 next to it, and IPv4 wins.',
			'With `-6`, there is nothing to fall back to: only the timeout ends the wait. Without `--connect-timeout`, the kernel\'s SYN retries would take about 131 seconds.',
			'Type `exit`: the dummy interface and its route go away with the container.'
		]
	},
	recall: {
		q: 'With a broken IPv6 path, how long did curl and a one-address-at-a-time client take to connect in this chapter, and why the difference?',
		a: 'curl: 0.205 s, because it starts IPv4 after its 200 ms Happy Eyeballs delay. The sequential client: 135.7 s, because it waited for the kernel\'s SYN timeout (about 131 s with `tcp_syn_retries` 6).'
	},
	sources: [
		{ title: 'RFC 8305, Happy Eyeballs Version 2', url: 'https://www.rfc-editor.org/rfc/rfc8305' },
		{ title: 'RFC 6555, Happy Eyeballs: Success with Dual-Stack Hosts', url: 'https://www.rfc-editor.org/rfc/rfc6555' },
		{ title: 'RFC 4291, IP Version 6 Addressing Architecture', url: 'https://www.rfc-editor.org/rfc/rfc4291' },
		{ title: 'RFC 4862, IPv6 Stateless Address Autoconfiguration', url: 'https://www.rfc-editor.org/rfc/rfc4862' },
		{ title: 'RFC 4861, Neighbor Discovery for IP version 6', url: 'https://www.rfc-editor.org/rfc/rfc4861' },
		{ title: 'curl docs, CURLOPT_HAPPY_EYEBALLS_TIMEOUT_MS', url: HEDOC },
		{ title: 'Linux kernel docs, IP sysctl (tcp_syn_retries)', url: 'https://docs.kernel.org/networking/ip-sysctl.html' }
	]
};
