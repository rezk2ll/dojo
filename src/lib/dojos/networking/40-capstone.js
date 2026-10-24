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
		],
		steps: [
			{
				title: 'Work out the DNS TTL',
				questions: [
					{ q: 'The stub shows TTL 122 on the A records. How much longer may it keep them?', options: ['300 seconds', '178 seconds', '122 seconds', 'Until the next reboot'], answer: 2, why: 'A cache returns a record with the TTL it has left. 122 is what remains.' },
					{ q: 'Why does `dig +trace` show 300 for the same records?', options: ['It asks the authoritative server, which gives the full TTL', 'The trace doubles every TTL', 'The two servers disagree', 'The trace uses IPv6'], answer: 0, why: 'mitch.ns.cloudflare.com hands out the record fresh, with its full lifetime of 300 seconds.' },
					{ q: 'How long had a cache held the records?', options: ['122 seconds', '300 seconds', '422 seconds', '178 seconds'], answer: 3, why: '300 minus 122 is 178 seconds since the cache got the answer.' },
					{ q: 'What happens when the 122 seconds run out?', options: ['The stub keeps the old answer forever', 'The stub asks again and gets a fresh TTL of 300', 'curl stops resolving example.org', 'The TTL goes negative'], answer: 1, why: 'Once the TTL is spent the cache must ask again. This belongs to chapter 11.' }
				]
			},
			{
				title: 'Work out the HTTP cache',
				questions: [
					{ q: 'What does `age: 11173` say?', options: ['The copy will expire in 11173 seconds', 'The server took 11173 ms', 'The copy has been in a cache for 11173 seconds', 'The page has 11173 bytes'], answer: 2, why: 'Cloudflare sets `Age` on cached responses: how old this stored copy is.' },
					{ q: 'When is a response fresh, according to RFC 9111?', options: ['While its freshness lifetime is greater than its age', 'While `cf-cache-status` is `HIT`', 'Until the DNS TTL runs out', 'Until the next request'], answer: 0, why: 'Freshness compares the lifetime, here `max-age=14400`, with the age.' },
					{ q: 'How long until a browser cache must revalidate this copy?', options: ['14400 seconds', '11173 seconds', 'About 4 hours', '3227 seconds, about 54 minutes'], answer: 3, why: '14400 minus 11173 is 3227 seconds.' },
					{ q: 'Which chapter does this value belong to?', options: ['Chapter 11, DNS', 'Chapter 22, HTTP caching', 'Chapter 21, certificates', 'Chapter 19, HTTP/3'], answer: 1, why: '`cache-control` and `age` are HTTP cache headers, chapter 22.' }
				]
			},
			{
				title: 'Work out the Alt-Svc',
				questions: [
					{ q: 'What does `alt-svc: h3=":443"` offer?', options: ['A second TLS certificate', 'A redirect to port 443', 'HTTP/3 on UDP port 443', 'HTTP/2 on TCP port 443'], answer: 2, why: '`h3` is HTTP/3, which runs over QUIC on UDP.' },
					{ q: 'From when does `ma=86400` count?', options: ['From the moment the response was generated', 'From the first request of the day', 'From when the certificate was issued', 'From when the DNS answer was cached'], answer: 0, why: 'RFC 7838 says `ma` counts seconds "since the response was generated".' },
					{ q: 'How long is 86400 seconds?', options: ['One hour', 'One week', '90 days', 'One day'], answer: 3, why: '86400 is 24 × 3600.' },
					{ q: 'Which chapter covers this header?', options: ['Chapter 22', 'Chapter 19', 'Chapter 11', 'Chapter 38'], answer: 1, why: '`h3` in Alt-Svc offers HTTP/3, and chapter 19 is the HTTP/3 chapter. The diagram step for this header names it first.' }
				]
			},
			{
				title: 'Work out the certificate',
				questions: [
					{ q: 'The run was on Oct 17 at 00:10 UTC, and the certificate expires on Dec 25 at 22:13 GMT. How long is left?', options: ['69 days and 22 hours', '90 days', '68 days and 2 hours', '2 months exactly'], answer: 0, why: 'October has 14 more days after the 17th, November 30, December 25: 69 days, plus 22 hours from 00:10 to 22:13.' },
					{ q: 'The certificate was issued on Sep 26. What is its whole lifetime?', options: ['About one year', 'About 30 days', 'About 90 days', 'About 69 days'], answer: 2, why: 'From Sep 26 to Dec 25 is about 90 days. The 69 days are only what was left.' },
					{ q: 'Which line of `curl -v` tells you the chain was checked?', options: ['`ALPN: server accepted h2`', '`cf-cache-status: HIT`', '`Connection #0 ... left intact`', '`SSL certificate verify ok.`'], answer: 3, why: 'curl prints that line once the certificate chain is verified.' },
					{ q: 'Which of the four values runs out first?', options: ['The certificate', 'The DNS TTL, in 122 seconds', 'The HTTP cache copy', 'The Alt-Svc entry'], answer: 1, why: '122 seconds, then 3227 seconds, then one day, then about 70 days.' }
				]
			}
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
	lab: {
		minutes: 15,
		goal: 'Repeat the chapter\'s run against example.org from your own machine and work out the four lifetimes from your numbers.',
		steps: [
			'Time and trace one request: `curl -sv -o /dev/null -w \'dns=%{time_namelookup} connect=%{time_connect} tls=%{time_appconnect} start=%{time_starttransfer} total=%{time_total}\\n\' https://example.org/`.',
			'In the output, find the address curl connected to, the TLS version, the ALPN result, the certificate `expire date`, and the `age`, `cache-control`, `cf-cache-status` and `alt-svc` headers.',
			'Ask your stub resolver: `dig example.org A +noall +answer`. Note the TTL.',
			'Ask from the root down: `dig +trace example.org`. Note the TTL in the answer from the Cloudflare name server.',
			'Run the `curl` again a minute later and compare `dns=` and `age`.'
		],
		done: [
			'You have the four phases of your run in milliseconds: DNS, TCP, TLS and first byte.',
			'You have the TTL from the stub and the TTL of 300 from the trace, and the gap between them.',
			'You have `max-age` minus `age` in seconds, and the days left on the certificate.',
			'On the second `curl`, `age` has grown by about the time you waited, unless the edge fetched a fresh copy in between.'
		],
		solution: [
			'Each phase is one timer minus the one before it, as in chapter 38. A `dns=` under a millisecond means a cache answered.',
			'Stub TTL below 300: a cache has held the record for 300 minus that TTL seconds.',
			'If `cf-cache-status` is `HIT`, your bytes came from the Cloudflare data center named at the end of `cf-ray`, not from example.org\'s own server.',
			'If `curl` shows an IPv4 address, your network has no working IPv6 route, or IPv6 did not connect within the 200 ms Happy Eyeballs delay.'
		]
	},
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
