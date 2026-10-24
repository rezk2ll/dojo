const CURL = 'https://github.com/curl/curl/blob/98979fe46bd6fe7d8bedd3126e6c0340e2f9cfa4';
const MTR = 'https://github.com/traviscross/mtr/blob/e1ddc9e2b14add72288532dff9d965398bc12b32/man/mtr.8.in';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'latency',
	part: 'Debugging the network',
	title: 'Where the time goes',
	minutes: 10,
	hook: [
		'From a laptop, `curl https://ftp.jaist.ac.jp/` takes 1.31 seconds to return the mirror\'s home page. `ping` to the same host gives a round trip of 256 ms. 1.31 seconds is about 5 of those round trips.',
		'`curl -w` splits the 1.31 seconds: 274 ms to resolve the name, then 254 ms for the TCP connect, 516 ms for TLS and 270 ms until the first byte. **The last three phases add up to 1,040 ms, about 4 round trips of 256 ms.**',
		'All numbers in this chapter come from runs on 2026-10-17 with curl 8.5.0 and mtr 0.95, all from the same laptop.'
	],
	terms: [
		{ term: 'RTT', def: 'Round trip time: how long a packet takes to reach a host and the answer to come back. `ping` measured 256 ms to ftp.jaist.ac.jp and 339 ms to mirror.aarnet.edu.au.' },
		{ term: 'Write-out timer', def: 'A variable of `curl -w` such as `%{time_connect}`. Each one is the time in seconds from the start of the transfer until that step was done.' },
		{ term: 'Time to first byte', def: '`%{time_starttransfer}`: the time until curl received the first byte of the response. It includes every earlier step and the server\'s own work.' },
		{ term: 'Hop', def: 'One router on the path. mtr finds each hop by sending probes with a TTL of 1, 2, 3 and so on, and reports loss and RTT per hop.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['cl["curl on the laptop"] -->|"name lookup"| res["DNS resolver"]'],
				highlight: ['cl', 'res'],
				note: '`time_namelookup` was 0.274468: 274 ms before curl had an address. A later run printed 0.000774, under 1 ms, because the answer was cached.'
			},
			{
				add: ['cl -->|"SYN, SYN-ACK: 1 round trip"| srv["ftp.jaist.ac.jp 2001:df0:2ed:feed::feed"]'],
				highlight: ['srv'],
				note: '`time_connect` was 0.528700. Subtract the lookup: 528.7 minus 274.5 is 254 ms for the TCP handshake. It matches one `ping` round trip of 256 ms.'
			},
			{
				add: ['cl -->|"TLS 1.3 handshake"| srv'],
				highlight: ['cl', 'srv'],
				note: '`time_appconnect` was 1.044426, so TLS took 516 ms, about 2 round trips. `curl -v` showed `TLSv1.3` and `ALPN: server accepted http/1.1`. On mirror.aarnet.edu.au the same TLS 1.3 phase took 342 ms, one round trip of 339 ms.'
			},
			{
				add: ['cl -->|"GET / HTTP/1.1"| srv', 'srv -->|"first byte of 200 OK"| cl'],
				highlight: ['cl', 'srv'],
				note: '`time_starttransfer` was 1.314390, 270 ms after TLS: one round trip for the request and answer, plus about 14 ms. `time_total` was 1.314453, so the rest of the page took under 1 ms.'
			},
			{
				add: ['cl -->|"probes with TTL 1 to 21"| hops["mtr: hop 1 at 1.8 ms, hops 2 to 20 ???, hop 21 at 255.4 ms"]'],
				highlight: ['hops'],
				note: '`mtr -4 -U 30 --report -n ftp.jaist.ac.jp` sent 10 probes per hop. Hops 2 to 20 never answered and show `???` at 100% loss. The destination at hop 21 answered 10 of 10, so those routers forwarded every probe and only skipped their own reply.'
			}
		]
	},
	example: {
		title: 'lib/progress.c in curl: where each write-out timer is recorded',
		repo: 'curl/curl',
		url: `${CURL}/lib/progress.c#L264-L334`,
		lang: 'c',
		code: `void Curl_pgrsTimeWas(struct Curl_easy *data, timerid timer,
                      struct curltime timestamp)
{
  timediff_t *delta = NULL;

  switch(timer) {
…
  case TIMER_NAMELOOKUP:
    delta = &data->progress.total.nslookup_us;
    break;
  case TIMER_CONNECT:
    delta = &data->progress.total.connect_us;
    break;
  case TIMER_APPCONNECT:
    delta = &data->progress.total.appconnect_us;
    break;
  case TIMER_PRETRANSFER:
    delta = &data->progress.total.pretransfer_us;
    break;
  case TIMER_STARTTRANSFER:
    /* prevent updating t_starttransfer unless:
     *   1. this is the first time we are setting t_starttransfer
     *   2. a redirect has occurred since the last time t_starttransfer was set
     * This prevents repeated invocations of the function from incorrectly
     * changing the t_starttransfer time.
     */
    if(data->progress.startransfer_added) {
      CURL_TRC_M(data, "[%s] ignored", pgrs_timer_name(timer));
      return;
    }
    data->progress.startransfer_added = TRUE;
    delta = &data->progress.total.starttransfer_us;
    break;
…
  if(delta) {
    timediff_t us = curlx_ptimediff_us(&timestamp, &data->progress.start) -
                    data->progress.delta.startsingle_us;
    if(us < 1)
      us = 1; /* make sure at least one microsecond passed */
    *delta += us;`,
		notes: [
			'Lines 8 to 19 give each step its own counter. `nslookup_us` is what `%{time_namelookup}` prints, through [`getinfo.c`](' + CURL + '/lib/getinfo.c#L472-L474), and `connect_us` and `appconnect_us` back `time_connect` and `time_appconnect`.',
			'Lines 36 and 37 measure from `progress.start`, minus the start of this single request. So every timer counts from the beginning and includes the steps before it. To get one phase, subtract the timer before it: `time_connect - time_namelookup` gave the 254 ms TCP handshake.',
			'Lines 27 to 31 keep the first value of the first byte timer. Later calls during the same request are ignored, as the comment on lines 21 to 25 explains.',
			'Line 40 adds with `+=`. With `-L` and a redirect, each timer sums the values of every request in the chain, and `%{time_redirect}` reports the redirect steps on their own.'
		]
	},
	tradeoff: {
		gain: [
			'One `curl -w` run splits a slow request into DNS, TCP, TLS and server time, with no access to the server.',
			'Comparing a phase to the `ping` RTT tells you if it is distance or work: 254 ms of TCP connect on a 256 ms path is one round trip and nothing else.',
			'mtr shows RTT and loss per hop, and `-T` or `-u` probe with TCP SYN or UDP when ICMP is treated differently on the path.'
		],
		cost: [
			'curl measures from one client at one moment. The same command gave 274 ms of DNS, and 0.8 ms in a later run, from the cache.',
			'Routers may not answer mtr at all: 19 of 21 hops showed `???` here. With the default `--max-unknown 5`, the report stopped at hop 2 and never showed the destination.',
			'The mtr man page warns that routers that give ICMP ECHO a lower priority look "significantly lower" in reliability than they are.'
		]
	},
	task: {
		prompt: 'You run `curl -s -o /dev/null -w` with the timers against `https://mirror.aarnet.edu.au/` and get:\n`namelookup=0.000699 connect=0.338539 appconnect=0.680307 pretransfer=0.680390 starttransfer=1.054753 total=1.054808`\n`ping` to the host gives an average RTT of 339 ms. Split the 1.05 seconds into phases and say which ones are round trips and which part is the server\'s work.',
		hint: 'Each value counts from the start, so subtract the previous one. Then divide each phase by 339 ms.',
		answer: [
			'DNS: 0.7 ms, a cached answer. TCP: 338.5 minus 0.7 = 338 ms, one round trip.',
			'TLS: 680.3 minus 338.5 = 342 ms, one round trip. That fits TLS 1.3, which `curl -v` confirmed.',
			'First byte: 1054.8 minus 680.4 = 374 ms. One round trip for the request is 339 ms, so the server took about 35 ms.',
			'Download: 1054.808 minus 1054.753 = 0.055 ms. 3 round trips of 339 ms make up 1,017 ms of the 1,055, so 96% of the request is spent waiting on the path. A closer server, or a reused connection that skips TCP and TLS, would save the most.'
		],
		steps: [
			{
				title: 'Know the timers',
				questions: [
					{ q: 'If the mirror answered with a redirect and you ran `curl -L`, what would `connect` show?', options: ['Only the connect of the last request', 'Only the connect of the first request', 'The sum over every request in the chain', 'Nothing: redirects reset the timers'], answer: 2, why: 'Line 40 adds with `+=`. With `-L`, each timer sums the values of every request, and `%{time_redirect}` reports the redirect steps on their own.' },
					{ q: 'Which values in this output are less than 0.1 ms apart?', options: ['`appconnect` and `pretransfer`, and `starttransfer` and `total`', '`namelookup` and `connect`', '`connect` and `appconnect`', '`pretransfer` and `starttransfer`'], answer: 0, why: '0.680390 minus 0.680307 is 0.08 ms, and 1.054808 minus 1.054753 is 0.055 ms. Nothing happened on the network between those pairs.' },
					{ q: '`ping` gives 339 ms. What does comparing a phase with it tell you?', options: ['How fast the server CPU is', 'Whether the DNS answer was cached', 'Whether the certificate is valid', 'Whether the phase is distance, whole round trips, or work on top of them'], answer: 3, why: 'A phase that matches a whole number of RTTs is only travel. Anything left over is time spent at one end.' },
					{ q: 'Whose clock and which moment do these numbers describe?', options: ['The server\'s, averaged over its last requests', 'curl\'s on the client, for this one run', 'The resolver\'s, for the DNS part only', 'An average of many runs from the same host'], answer: 1, why: 'curl measures from one client at one moment. The chapter saw DNS take 274 ms in one run and under 1 ms in the next.' }
				]
			},
			{
				title: 'Split DNS and TCP',
				questions: [
					{ q: 'How long did DNS take?', options: ['339 ms', '0.7 ms', '7 ms', '338 ms'], answer: 1, why: '`namelookup=0.000699` is 0.7 ms.' },
					{ q: 'Why is it that short?', options: ['The answer came from a cache', 'The host has no DNS name', 'DNS runs after TCP', 'curl skips DNS for HTTPS'], answer: 0, why: 'Under 1 ms is too fast for any network round trip. The chapter saw the same thing in a later run against ftp.jaist.ac.jp.' },
					{ q: 'Here `connect=0.338539` read as it is almost equals the TCP handshake. Why?', options: ['`connect` never includes DNS', 'The handshake ran at the same time as DNS', 'DNS took only 0.7 ms, so subtracting it barely changes the value', '`ping` already removed DNS'], answer: 2, why: '`connect` counts from the start, DNS included. 338.539 minus 0.699 is still about 338 ms. With the 274 ms uncached lookup of ftp.jaist.ac.jp, the raw value would be far off.' },
					{ q: 'How many round trips of 339 ms is that?', options: ['Half of one', 'Two', 'Three', 'One'], answer: 3, why: 'SYN out, SYN-ACK back: one round trip, and nothing else.' }
				]
			},
			{
				title: 'Split TLS and the first byte',
				questions: [
					{ q: 'How long did TLS take?', options: ['342 ms', '680 ms', '374 ms', '35 ms'], answer: 0, why: '680.307 minus 338.539 is about 342 ms.' },
					{ q: 'Why is one round trip for TLS plausible here?', options: ['TLS always takes one round trip', 'It fits TLS 1.3, which `curl -v` confirmed', 'The certificate was cached', 'TLS runs at the same time as TCP'], answer: 1, why: 'On this host the TLS 1.3 phase took one round trip. On ftp.jaist.ac.jp the same phase took about two.' },
					{ q: 'Which subtraction gives the request phase?', options: ['`appconnect - connect`', '`total - starttransfer`', '`starttransfer - pretransfer`: 374 ms', '`starttransfer - connect`'], answer: 2, why: '1054.753 minus 680.390 is about 374 ms, from the request ready to the first byte.' },
					{ q: 'How much of that is the server\'s own work?', options: ['All 374 ms', 'None: it is all network', 'About 339 ms', 'About 35 ms'], answer: 3, why: 'One round trip carries the request and the answer: 339 ms. The 35 ms left is the server.' }
				]
			},
			{
				title: 'Say where the time goes',
				questions: [
					{ q: 'How long did the body take to download?', options: ['About 0.055 ms', 'About 55 ms', 'About 374 ms', 'About 1 s'], answer: 0, why: '`total` minus `starttransfer` is 1054.808 minus 1054.753: 0.055 ms.' },
					{ q: 'How many round trips are in the request, and how long are they together?', options: ['2, about 680 ms', '3, about 1,017 ms', '4, about 1,356 ms', '1, about 339 ms'], answer: 1, why: 'TCP, TLS and the request each cost one round trip of 339 ms.' },
					{ q: 'What share of the 1.05 s is spent waiting on the path?', options: ['About 35%', 'About 50%', 'About 96%', 'About 3%'], answer: 2, why: '1,017 ms of 1,055 ms is about 96%. The server and DNS are the small part.' },
					{ q: 'What would save the most time?', options: ['A faster server CPU', 'A bigger DNS cache', 'A smaller home page', 'Fewer or shorter round trips'], answer: 3, why: 'The cost is round trips. Fewer of them, or shorter ones, is the only big win.' }
				]
			}
		]
	},
	quiz: [
		{
			q: '`curl -w` prints `time_namelookup=0.20 time_connect=0.25 time_appconnect=0.31`. How long did the TCP handshake take?',
			options: [
				'0.25 seconds, the value of `time_connect`',
				'0.05 seconds, `time_connect` minus `time_namelookup`',
				'0.31 seconds, because TLS includes the handshake',
				'0.45 seconds, the lookup plus the connect'
			],
			answer: 1,
			why: 'Every write-out timer counts from the start of the transfer, so `time_connect` includes the 0.20 s of DNS. curl records each one as the time since the request started, and a phase is the difference between two timers.'
		},
		{
			q: 'mtr shows `???` with 100% loss at hops 4 to 9, and 0% loss at the destination, hop 10. What does that tell you?',
			options: [
				'Packets are lost at hop 4, and hop 10 answers from a cache',
				'Hops 4 to 9 forward the probes and do not send their own replies',
				'The path changes every probe, so hops 4 to 9 are random',
				'The destination is unreachable and mtr guessed its RTT'
			],
			answer: 1,
			why: 'A probe that reaches hop 10 passed through hops 4 to 9. Loss that stops before the last hop means those routers skip or delay their own replies to mtr. The probes going through them still arrive.'
		},
		{
			q: 'A request takes 1.3 s. `ping` says 256 ms, and `time_starttransfer` minus `time_pretransfer` is 270 ms. Where is the time?',
			options: [
				'The server is slow: 270 ms is spent computing the page',
				'The response body is large and takes most of the 1.3 s',
				'Mostly round trips: the server added about 14 ms to one RTT',
				'The client\'s CPU is slow at parsing the response'
			],
			answer: 2,
			why: 'The time from the request to the first byte includes one round trip for the request and answer. 270 minus 256 leaves about 14 ms of server work, so the rest of the 1.3 s is DNS, TCP and TLS round trips.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Add a known delay between two containers, then read it back in the `curl -w` timers as round trips.',
		steps: [
			'Create a network, a server and a client: `docker network create latlab`, `docker run -d --name lat-srv --network latlab nicolaka/netshoot:v0.13 python3 -m http.server 8080` and `docker run -d --name lat-cli --network latlab --cap-add NET_ADMIN nicolaka/netshoot:v0.13 sleep 3600`.',
			'Time a request with no delay: `docker exec lat-cli curl -s -o /dev/null -w \'dns=%{time_namelookup} connect=%{time_connect} appconnect=%{time_appconnect} pretransfer=%{time_pretransfer} starttransfer=%{time_starttransfer} total=%{time_total}\\n\' http://lat-srv:8080/`.',
			'Add 100 ms to every packet the client sends: `docker exec lat-cli tc qdisc add dev eth0 root netem delay 100ms`. Check it with `docker exec lat-cli ping -c 3 lat-srv`, then run the same `curl` again.',
			'Add TLS on the server: `docker exec lat-srv sh -c \'cd /tmp && openssl req -x509 -newkey rsa:2048 -nodes -keyout k.pem -out c.pem -subj /CN=lat-srv -days 1\'`, then `docker exec -d lat-srv sh -c \'cd /tmp && openssl s_server -accept 8443 -cert c.pem -key k.pem -www\'`.',
			'Run the same `curl` with `-k` against `https://lat-srv:8443/`, then once more with `--tls-max 1.2` added. Clean up with `docker rm -f lat-srv lat-cli && docker network rm latlab`.'
		],
		done: [
			'Without delay, every timer stays under about 20 ms.',
			'With the delay, `ping` shows about 100 ms, `connect` minus `dns` is about 100 ms, and `starttransfer` minus `pretransfer` is about 100 ms.',
			'Over HTTPS with TLS 1.3, `appconnect` minus `connect` is about 100 ms: one round trip.',
			'With `--tls-max 1.2`, the same phase is about 200 ms: two round trips.'
		],
		solution: [
			'`netem` delays packets leaving the client\'s `eth0`, so each request and answer pair costs one extra 100 ms. That is a fake RTT you can read back in each phase.',
			'DNS stays fast: Docker\'s resolver for the container answers on 127.0.0.11, a loopback address, so the query never leaves through the delayed `eth0`.',
			'The TLS 1.2 run costs one round trip more than TLS 1.3. On a 339 ms path like the task\'s, that is a third of a second per new connection.'
		]
	},
	recall: {
		q: 'Which `curl -w` timers mark the end of DNS, TCP, TLS and the first byte, and how do you get the length of one phase?',
		a: '`time_namelookup`, `time_connect`, `time_appconnect` and `time_starttransfer`. Each counts from the start, so subtract the previous timer: `time_connect - time_namelookup` is the TCP handshake.'
	},
	sources: [
		{ title: 'curl docs, --write-out (docs/cmdline-opts/write-out.md)', url: `${CURL}/docs/cmdline-opts/write-out.md` },
		{ title: 'curl source, lib/progress.c', url: `${CURL}/lib/progress.c` },
		{ title: 'mtr(8) man page source', url: MTR },
		{ title: 'curl man page, curl.se, read 2026-10-17', url: 'https://curl.se/docs/manpage.html' }
	]
};
