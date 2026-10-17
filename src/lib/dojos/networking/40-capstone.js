const CURL = 'https://github.com/curl/curl/blob/98979fe46bd6fe7d8bedd3126e6c0340e2f9cfa4';
const CFD = 'https://github.com/cloudflare/cloudflare-docs/blob/efe20bd5f22d9b780243fce278f10fada77f0ccf/src/content/docs';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'capstone',
	part: 'Debugging the network',
	title: 'One request end to end',
	minutes: 10,
	hook: [
		'On 2026-10-17, `curl -v https://example.org/` on a laptop printed `HTTP/2 200` and downloaded 577 bytes. `curl -w` timed the whole request at 35.6 ms.',
		'In those 35.6 ms, curl got 4 addresses from a resolver, opened a TCP connection over IPv6 and ran a TLS 1.3 handshake. Then it sent one HTTP/2 request, and **a Cloudflare cache answered it from a stored copy.**',
		'All output in this chapter comes from that run, a `dig example.org` and a `dig +trace` made a few seconds before it, with curl 8.5.0 and dig 9.18.39. Each diagram step names the chapters that explain it.'
	],
	terms: [
		{ term: 'Stub resolver', def: 'The resolver a program asks first. On this laptop, `/etc/resolv.conf` says `nameserver 127.0.0.53`, the stub of systemd-resolved, which forwards misses and caches answers.' },
		{ term: 'Happy Eyeballs', def: 'curl\'s docs: an algorithm that tries IPv6 and IPv4 "giving IPv6 a head-start". If IPv6 has not connected after the delay, an IPv4 attempt starts in parallel, and the first to connect wins.' },
		{ term: 'ALPN', def: 'A TLS extension, RFC 7301, that picks the application protocol inside the handshake. curl offered `h2,http/1.1` and the server picked `h2`.' },
		{ term: 'cf-cache-status', def: 'A Cloudflare response header. `HIT` means "The resource was found in Cloudflare\'s cache."' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['cl["curl on the laptop"] -->|"resolve example.org"| stub["systemd-resolved, 127.0.0.53"]'],
				highlight: ['cl', 'stub'],
				note: 'Chapters 09 and 12. The stub returned 2 A records, 104.20.26.136 and 172.66.157.237, and 2 AAAA records. `time_namelookup` was 0.000789, under 1 ms, so the answer came from a cache.'
			},
			{
				add: ['stub -.->|"dig +trace: root, org, Cloudflare"| ns["mitch.ns.cloudflare.com"]'],
				highlight: ['ns'],
				note: 'Chapters 09 to 11. `dig +trace` asked m.root-servers.net (6 ms), then b0.org.afilias-nst.org (16 ms), then mitch.ns.cloudflare.com (9 ms). The last one gave the A records with a TTL of 300. Through the stub, the same records showed a TTL of 122, so a cache had held them for 178 seconds.'
			},
			{
				add: ['cl -->|"SYN to port 443 over IPv6"| edge["Cloudflare edge, 2606:4700:10::6814:1a88"]'],
				highlight: ['edge'],
				note: 'Chapters 03, 05, 15 and 39. curl printed `Trying [2606:4700:10::6814:1a88]:443...` and no IPv4 attempt. RIPEstat shows 2606:4700:10::/44 announced by AS13335, Cloudflare, whose docs call these addresses anycast. `time_connect` minus `time_namelookup` is 5.7 ms, and `ping -6` averaged 8.6 ms.'
			},
			{
				add: ['cl -->|"TLS 1.3, ALPN h2"| edge'],
				highlight: ['cl', 'edge'],
				note: 'Chapters 20 and 21. `time_appconnect` was 0.023349, so TLS took 16.9 ms. The certificate has `CN=example.org`, issued by `Cloudflare TLS Issuing ECC CA 3`, valid from Sep 26 to Dec 25 2026. curl printed `SSL certificate verify ok.` and `ALPN: server accepted h2`.'
			},
			{
				add: ['cl -->|"HTTP/2 stream 1: GET /"| edge', 'edge -->|"look up /"| cache["Edge cache, cf-ray ends in CDG"]'],
				highlight: ['cache'],
				note: 'Chapters 18, 22 and 30. curl sent the request as stream 1, with `:method: GET` and `:authority: example.org`. The response had `cf-cache-status: HIT`, `age: 11173` and `cache-control: max-age=14400`. Cloudflare\'s docs say the three-letter code at the end of `cf-ray` names the data center.'
			},
			{
				add: ['edge -->|"200, 577 bytes, alt-svc h3"| cl'],
				highlight: ['cl'],
				note: 'Chapters 19, 28 and 38. `time_starttransfer` was 0.035518, 12.2 ms after TLS, and `time_total` 0.035598. The header `alt-svc: h3=":443"; ma=86400` offers HTTP/3 for the next 86400 seconds. curl ended with `Connection #0 to host example.org left intact`.'
			}
		]
	},
	example: {
		title: 'lib/cf-ip-happy.c in curl: which address family is tried next',
		repo: 'curl/curl',
		url: `${CURL}/lib/cf-ip-happy.c#L361-L540`,
		lang: 'c',
		code: `  bs->last_attempt_ai_family = AF_INET; /* so AF_INET6 is next */
…
  /* no attempt connected yet, start another one? */
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
…
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
    }
…
      bs->last_attempt_started = *pnow;
      bs->last_attempt_ai_family = ai_family;
      /* and run everything again */`,
		notes: [
			'Line 1 records IPv4 as the last family tried, before any attempt. So the test on line 29 is true and lines 31 and 32 take an AAAA address first. The code above is from the pinned commit. The 8.5.0 run also tried the IPv6 address first.',
			'Lines 14 to 16 start a second attempt only once `attempt_delay_ms` has passed since the last one. That value is `happy_eyeballs_timeout`, which [curl\'s docs](' + CURL + '/docs/cmdline-opts/happy-eyeballs-timeout-ms.md) put at 200 ms by default. IPv6 connected in 5.7 ms, so no IPv4 attempt was needed.',
			'Lines 44 and 45 save the family just tried. If IPv6 has not connected after 200 ms, the next pass reaches lines 37 to 39 and tries 104.20.26.136 over IPv4.'
		]
	},
	tradeoff: {
		gain: [
			'One `curl -v` run shows the addresses, the address picked, the TLS version, the certificate, the ALPN result and every response header.',
			'Adding `-w` with the timers splits the 35.6 ms into DNS, TCP, TLS and first byte, as in chapter 38.',
			'`dig +trace` shows each referral from the root down, with the time each server took, without using the stub\'s cache.'
		],
		cost: [
			'Caches hide steps: the stub answered in under 1 ms, so this run says nothing about the root, .org or Cloudflare name servers.',
			'curl talks to the Cloudflare edge and to no other server. With `cf-cache-status: HIT`, nothing in the output says where example.org\'s own server is or how fast it is.',
			'curl shows no packets and no routers on the path. Retransmissions need `tcpdump` (chapter 37) and the path needs `mtr` (chapter 38).'
		]
	},
	task: {
		prompt: 'From the run: `dig example.org` through the stub showed TTL 122 on the A records. The response had `age: 11173`, `cache-control: max-age=14400` and `alt-svc: h3=":443"; ma=86400`. The certificate expires on Dec 25 22:13:27 2026 GMT, and the run was on Oct 17 at 00:10 UTC. For each one, say how much longer it stays valid and which chapter it belongs to.',
		hint: 'Each value is a lifetime or an age in seconds. A remaining lifetime is the lifetime minus the time already spent.',
		answer: [
			'DNS (chapter 11): the stub may keep the A records for 122 more seconds. Then it asks again, and the authoritative server gives a fresh TTL of 300.',
			'HTTP cache (chapter 22): RFC 9111 calls a response fresh while its freshness lifetime is greater than its age. 14400 minus 11173 leaves 3227 seconds, about 54 minutes, before a browser cache must revalidate this copy.',
			'Alt-Svc (chapter 19): RFC 7838 says `ma` counts seconds "since the response was generated". The client may try HTTP/3 on UDP port 443 for the next 86400 seconds, one day.',
			'Certificate (chapter 21): from Oct 17 00:10 to Dec 25 22:13 is 69 days and 22 hours. The certificate was issued on Sep 26, so its whole lifetime is about 90 days.'
		]
	},
	quiz: [
		{
			q: 'curl had 2 AAAA and 2 A addresses for example.org. Its output shows only `Trying [2606:4700:10::6814:1a88]:443`. Why no IPv4 attempt?',
			options: [
				'The laptop has no IPv4 route to Cloudflare',
				'IPv6 went first and connected before the 200 ms delay',
				'curl only uses IPv4 when the AAAA query fails',
				'The server refused the IPv4 address with a reset'
			],
			answer: 1,
			why: 'curl starts with an AAAA address, and it starts an IPv4 attempt only once `attempt_delay_ms`, 200 ms by default, has passed. The IPv6 handshake took 5.7 ms.'
		},
		{
			q: '`dig +trace` gets TTL 300 for example.org from mitch.ns.cloudflare.com. `dig example.org` through 127.0.0.53 shows TTL 122. What explains it?',
			options: [
				'The two name servers of example.org disagree',
				'systemd-resolved lowers every TTL by half',
				'A cache has held the record for 178 of its 300 seconds',
				'The stub rounds TTLs to the nearest 2 minutes'
			],
			answer: 2,
			why: 'A cache returns a record with the TTL it has left. 300 minus 122 is 178 seconds since that cache got the answer from the authoritative server.'
		},
		{
			q: 'The response has `cf-cache-status: HIT` and `age: 11173`. Which server sent the 577 bytes?',
			options: [
				'example.org\'s own server, through a Cloudflare tunnel',
				'A Cloudflare data center, from its cache',
				'The browser\'s cache, because the copy was 3 hours old',
				'mitch.ns.cloudflare.com, with the DNS answer'
			],
			answer: 1,
			why: '`HIT` means the resource was found in Cloudflare\'s cache, and Cloudflare sets `Age` on cached responses. curl never talked to example.org\'s own server.'
		}
	],
	recall: {
		q: 'Name the steps of `curl https://example.org/` in this run, in order, with the chapter and the time each took.',
		a: 'DNS from the stub cache in 0.8 ms (09, 11). TCP over IPv6 to an anycast Cloudflare address in 5.7 ms (05, 15, 39). TLS 1.3 with ALPN `h2` in 16.9 ms (20, 21). One HTTP/2 GET answered from the edge cache in 12.2 ms (18, 22, 30).'
	},
	sources: [
		{ title: 'curl source, lib/cf-ip-happy.c', url: `${CURL}/lib/cf-ip-happy.c` },
		{ title: 'curl docs, --happy-eyeballs-timeout-ms', url: `${CURL}/docs/cmdline-opts/happy-eyeballs-timeout-ms.md` },
		{ title: 'Cloudflare docs, How Cloudflare works', url: `${CFD}/fundamentals/concepts/how-cloudflare-works.mdx` },
		{ title: 'Cloudflare docs, Cloudflare HTTP headers (Cf-Ray)', url: `${CFD}/fundamentals/reference/http-headers.mdx` },
		{ title: 'Cloudflare docs, Cloudflare cache responses', url: `${CFD}/cache/concepts/cache-responses.mdx` },
		{ title: 'RFC 9111, HTTP Caching', url: 'https://www.rfc-editor.org/rfc/rfc9111' },
		{ title: 'RFC 7838, HTTP Alternative Services', url: 'https://www.rfc-editor.org/rfc/rfc7838' },
		{ title: 'RFC 7301, TLS Application-Layer Protocol Negotiation Extension', url: 'https://www.rfc-editor.org/rfc/rfc7301' }
	]
};
