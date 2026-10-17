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
