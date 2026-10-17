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
