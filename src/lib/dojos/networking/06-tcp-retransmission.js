const LINUX = 'https://github.com/torvalds/linux/blob/70dd4ee72eb2d5793c62e71c14e3aba78e5a4e56';
const TIMER = `${LINUX}/net/ipv4/tcp_timer.c`;
const SYSCTL = `${LINUX}/Documentation/networking/ip-sysctl.rst`;
const CF = 'https://blog.cloudflare.com/when-tcp-sockets-refuse-to-die/';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'tcp-retransmission',
	part: 'Packets',
	title: 'Lost packets and retransmission',
	minutes: 10,
	hook: [
		'Cloudflare engineers opened a TCP connection, then made a firewall drop every packet and sent 11 bytes. The Linux kernel sent those 11 bytes again 15 times. The application got `ETIMEDOUT` at 15 minutes 39 seconds.',
		'The gaps between the copies grew: 0.4 s, 0.8 s, 1.7 s, 3.5 s, and so on up to about 2 minutes. During those 15 minutes, `ss` showed the socket as `ESTAB` with 11 bytes in its send queue.',
		'An idle connection does worse. With no data in flight, no timer runs. The same post says such sockets "will remain in that state forever, even if the communication is broken".'
	],
	terms: [
		{ term: 'RTO', def: 'Retransmission timeout: how long the sender waits for an ACK before it sends the oldest unacknowledged segment again. Linux keeps it between 200 ms and 120 s.' },
		{ term: 'Exponential backoff', def: 'Each time the retransmission timer fires, the sender doubles the RTO before it arms the timer again.' },
		{ term: '`tcp_retries2`', def: 'The Linux sysctl that decides when a connection with unacknowledged data gives up. The default is 15, which gives at least 924.6 seconds.' },
		{ term: '`TCP_USER_TIMEOUT`', def: 'A socket option, in milliseconds: the longest time sent data may stay unacknowledged before the kernel closes the connection with `ETIMEDOUT`.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['app["App: write() 11 bytes"] --> tx["Sender kernel: segment out, RTO timer armed"]', 'tx -->|"data"| fw["Firewall drops every packet"]'],
				highlight: ['tx'],
				note: 'The kernel sends the segment and arms a timer for one RTO. With a measured round trip, RFC 6298 sets the RTO to about SRTT + 4 × RTTVAR: the smoothed round trip plus four times its variation. Linux never goes below 200 ms (`TCP_RTO_MIN`).'
			},
			{
				add: ['tx --> rtx["Timer fires: resend the oldest unacknowledged segment, RTO × 2"]', 'rtx -->|"same 11 bytes"| fw'],
				highlight: ['rtx'],
				note: 'No ACK comes back, so the timer fires. RFC 6298 rule 5.4 resends the earliest unacknowledged segment, and rule 5.5 doubles the RTO. In the Cloudflare trace the copies left at 0.62 s, 1.05 s, 1.88 s, 3.54 s and 7.00 s.'
			},
			{
				add: ['rtx --> cap["RTO capped at 120 s"]'],
				highlight: ['cap'],
				note: 'The doubling stops at `tcp_rto_max_ms`, 120,000 ms by default. In the trace the 10th copy left at 3:34, and copies 11 to 15 left about 121 s apart.'
			},
			{
				add: ['cap --> err["tcp_retries2 = 15 used up: socket error ETIMEDOUT"]', 'err -->|"read() or write() fails"| app'],
				highlight: ['err'],
				note: 'At each timeout, `tcp_write_timeout` compares the time since the first retransmission with a model of 15 backed-off retries: 924.6 s. The first RTO that ends past that point kills the connection. The kernel sets the socket error to `ETIMEDOUT`, and the next call on the socket returns it. Here that was 15:39.5.'
			},
			{
				add: ['srv["Peer reachable again: ACK"] -.->|"new RTT sample"| tx'],
				highlight: ['srv'],
				note: 'If an ACK for new data arrives first, the next RTT measurement recomputes the RTO from SRTT and RTTVAR. RFC 6298 calls this "collapsing" the RTO after the backoff. The connection then carries on as if nothing happened.'
			}
		]
	},
	example: {
		title: 'net/ipv4/tcp_timer.c: the modelled timeout and the doubling',
		repo: 'torvalds/linux',
		url: `${TIMER}#L188-L687`,
		lang: 'c',
		code: `static unsigned int tcp_model_timeout(struct sock *sk,
				      unsigned int boundary,
				      unsigned int rto_base)
{
	unsigned int linear_backoff_thresh, timeout;

	linear_backoff_thresh = ilog2(tcp_rto_max(sk) / rto_base);
	if (boundary <= linear_backoff_thresh)
		timeout = ((2 << boundary) - 1) * rto_base;
	else
		timeout = ((2 << linear_backoff_thresh) - 1) * rto_base +
			(boundary - linear_backoff_thresh) * tcp_rto_max(sk);
	return jiffies_to_msecs(timeout);
}
…
	} else if (sk->sk_state != TCP_SYN_SENT ||
		   tp->total_rto >
		   READ_ONCE(net->ipv4.sysctl_tcp_syn_linear_timeouts)) {
		/* Use normal (exponential) backoff unless linear timeouts are
		 * activated.
		 */
		icsk->icsk_backoff++;
		icsk->icsk_rto = min(icsk->icsk_rto << 1, tcp_rto_max(sk));
	}
	tcp_reset_xmit_timer(sk, ICSK_TIME_RETRANS,
			     tcp_clamp_rto_to_user_timeout(sk), false);`,
		notes: [
			'Line 7 counts how many doublings fit below the cap. For an established connection `rto_base` is `TCP_RTO_MIN`, 200 ms, and 120 s / 200 ms = 600, so `ilog2(600)` is 9.',
			'Lines 11 and 12 run for `boundary` = 15, the `tcp_retries2` default: (2^10 − 1) × 0.2 s = 204.6 s of doubling, plus (15 − 9) × 120 s = 720 s at the cap. The total is 924.6 s, the number in the [ip-sysctl docs](' + SYSCTL + '?plain=1#L829-L844).',
			'Line 23 is RFC 6298 rule 5.5 in code: shift the RTO left by one bit (double it), but never past `tcp_rto_max`.',
			'Line 26 arms the next timer. `tcp_clamp_rto_to_user_timeout` shortens it when `TCP_USER_TIMEOUT` is set and less time is left, so the socket fails at that limit and not at the next doubled RTO.',
			'Lines 16 to 18 skip the doubling for a `SYN` during its first 4 retries (`tcp_syn_linear_timeouts`). The docs give the result for a `connect()` to a silent host: the attempt fails after 131 seconds.'
		]
	},
	tradeoff: {
		gain: [
			'A link that drops packets because it is full gets fewer and fewer copies from each sender: 15 retries take 924.6 s, and only 10 of them fall in the first 205 s.',
			'A connection survives a network cut of several minutes, like a router reboot, with no help from the application. The first ACK after the cut resets the RTO.'
		],
		cost: [
			'With the defaults, a client notices a dead peer that holds its unacknowledged data only after about 15.5 minutes.',
			'An idle connection to a dead peer stays in `ESTAB`. Keepalive probes are off unless the app sets `SO_KEEPALIVE`, and the first probe then waits for `tcp_keepalive_time`, 2 hours by default.',
			'Lowering `tcp_retries2` changes every connection on the host. `TCP_USER_TIMEOUT` sets the limit for one socket, but the application must set it.'
		]
	},
	task: {
		prompt: 'A team sets `net.ipv4.tcp_retries2 = 8` on its API hosts. Using the formula from `tcp_model_timeout` with a base RTO of 200 ms and a cap of 120 s, how long does an established connection with unacknowledged data last when the peer dies? Then compute the value of 5.',
		hint: 'Is 8 bigger than 9 (the number of doublings below the cap)? If not, only the first formula, `((2 << boundary) - 1) * rto_base`, applies.',
		answer: [
			'8 is below 9, so line 9 applies: (2 << 8) − 1 = 511, and 511 × 0.2 s = 102.2 s. The ip-sysctl docs agree: "RFC 1122 recommends at least 100 seconds for the timeout, which corresponds to a value of at least 8."',
			'5 gives (2 << 5) − 1 = 63, and 63 × 0.2 s = 12.6 s.',
			'These are lower bounds. The real RTO starts from the measured round trip, at least 200 ms, so on a slow path each retry waits longer. The docs: "TCP will effectively time out at the first RTO which exceeds the hypothetical timeout."',
			'To limit only the API client sockets, set `TCP_USER_TIMEOUT` on them, for example 30000 ms, and leave `tcp_retries2` at 15 for the rest of the host.'
		],
		steps: [
			{
				title: 'Pick the formula',
				questions: [
					{ q: 'With a base RTO of 200 ms and a cap of 120 s, how many doublings fit below the cap?', options: ['9', '15', '600', '10'], answer: 0, why: '120 s / 200 ms = 600, and `ilog2(600)` is 9: after 9 doublings the next one would pass the cap.' },
					{ q: '`boundary` is 8. Which branch of `tcp_model_timeout` runs?', options: ['The second: the doublings plus time at the cap', 'The first: `((2 << boundary) - 1) * rto_base`', 'Neither: 8 is below the minimum', 'Both, added together'], answer: 1, why: '8 is not above 9, so the RTO never reaches the cap and only the doubling part counts.' },
					{ q: 'What does `boundary` stand for in this task?', options: ['The base RTO in milliseconds', 'The cap in seconds', 'The `tcp_retries2` value', 'The number of lost segments'], answer: 2, why: 'For an established connection, the kernel passes the retry count from `tcp_retries2` as the boundary.' },
					{ q: 'Which branch does the default of 15 use?', options: ['The first branch', 'The second branch, because 15 is above 9', 'No branch: 15 is the cap', 'The branch for `SYN` retries'], answer: 1, why: 'Past 9, the RTO stays at 120 s, so the formula adds (15 − 9) × 120 s to the 204.6 s of doubling.' }
				]
			},
			{
				title: 'Compute it for 8',
				questions: [
					{ q: 'What is (2 << 8) − 1?', options: ['255', '511', '256', '1023'], answer: 1, why: '`2 << 8` shifts 2 left by 8 bits: 512. Minus 1 gives 511.' },
					{ q: 'And 511 × 0.2 s?', options: ['102.2 s', '51.1 s', '204.6 s', '924.6 s'], answer: 0, why: '511 × 0.2 = 102.2. The connection gives up after at least 102.2 s.' },
					{ q: 'Does 8 meet the RFC 1122 advice?', options: ['No: RFC 1122 asks for 15 minutes', 'No: it asks for at least 200 seconds', 'RFC 1122 says nothing about this timeout', 'Yes: the docs say at least 100 seconds means a value of at least 8'], answer: 3, why: 'The ip-sysctl docs: "RFC 1122 recommends at least 100 seconds for the timeout, which corresponds to a value of at least 8."' },
					{ q: 'The team wants API calls to a dead host to fail within 30 s. Does `tcp_retries2 = 8` give that?', options: ['Yes: 8 retries take well under 30 s', 'Yes, because the RTO cap is 120 s', 'No: 102.2 s is still over three times 30 s', 'Only if `SO_KEEPALIVE` is also set'], answer: 2, why: 'The model gives 102.2 s for 8. A 30 s target needs a smaller value, like the 5 computed next, or `TCP_USER_TIMEOUT` on the socket.' }
				]
			},
			{
				title: 'Compute it for 5',
				questions: [
					{ q: 'What is (2 << 5) − 1?', options: ['31', '64', '63', '32'], answer: 2, why: '`2 << 5` is 64, and 64 − 1 = 63.' },
					{ q: 'And 63 × 0.2 s?', options: ['6.3 s', '12.6 s', '31.5 s', '1.26 s'], answer: 1, why: '63 × 0.2 = 12.6 s.' },
					{ q: 'Why are 102.2 s and 12.6 s only lower bounds?', options: ['The real RTO starts from the measured round trip, which is at least 200 ms', 'The kernel adds a random delay to each retry', 'Each retry also waits for a keepalive probe', 'The cap gets lower on slow paths'], answer: 0, why: 'The model assumes every RTO starts at 200 ms. On a slow path each retry waits longer.' },
					{ q: 'When does the connection really time out?', options: ['At exactly 12.6 s', 'After 5 retries, however long they took', 'When the application calls `close()`', 'At the first RTO that ends past the modelled time'], answer: 3, why: 'The docs: "TCP will effectively time out at the first RTO which exceeds the hypothetical timeout."' }
				]
			},
			{
				title: 'Limit only the API sockets',
				questions: [
					{ q: 'Which connections does `tcp_retries2 = 8` change?', options: ['Every connection on the host', 'Only the API client sockets', 'Only connections to port 443', 'Only the `SYN` retries'], answer: 0, why: 'A sysctl sets the limit for the whole host, not for one program.' },
					{ q: 'Which socket option sets the limit for one socket?', options: ['`SO_KEEPALIVE`', '`TCP_USER_TIMEOUT`', '`tcp_syn_retries`', '`SO_REUSEADDR`'], answer: 1, why: '`TCP_USER_TIMEOUT` is the longest time sent data may stay unacknowledged before the kernel closes that connection with `ETIMEDOUT`.' },
					{ q: 'In which unit do you give `TCP_USER_TIMEOUT`?', options: ['Seconds', 'Retries', 'Milliseconds', 'RTOs'], answer: 2, why: 'It is in milliseconds, so 30 seconds is `30000`.' },
					{ q: 'An API socket has `TCP_USER_TIMEOUT` set to 30000, and its peer dies mid-request. When does the call fail?', options: ['After 102.2 s, as `tcp_retries2 = 8` says', 'At the first doubled RTO that ends past 30 s', 'Never, because the option needs `SO_KEEPALIVE`', 'About 30 s after the data went unacknowledged, with `ETIMEDOUT`'], answer: 3, why: '`tcp_clamp_rto_to_user_timeout` shortens the last timer, so the socket fails at the 30 s limit and not at the next doubled RTO. The host-wide `tcp_retries2` does not decide for that socket.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Mid-upload, the server loses power. The client runs Linux with default sysctls and no `TCP_USER_TIMEOUT`. When does its next `write()` fail?',
			options: [
				'After about 3 seconds, the initial RTO used before any round trip is measured',
				'After about 15.5 minutes, once 15 doubled retransmissions have timed out',
				'After about 2 hours, when the first keepalive probe goes unanswered',
				'After 131 seconds, the limit the kernel docs give for a connection attempt'
			],
			answer: 1,
			why: 'The connection has unacknowledged data, so the retransmission timer runs and doubles up to 120 s. `tcp_retries2 = 15` models a timeout of 924.6 s, and the socket fails at the first RTO that ends after it. The 131 s figure is for `SYN` retries during `connect()`.'
		},
		{
			q: 'A connection carries no data. The peer host is unplugged. Nobody set `SO_KEEPALIVE`. What does `ss` show on the surviving side an hour later?',
			options: [
				'Nothing: the kernel closed the socket after `tcp_retries2` retries',
				'The socket in `TIME_WAIT`, waiting to expire',
				'The socket in `ESTAB` with no timer, as before the unplug',
				'The socket in `CLOSE_WAIT`, waiting for the app to close'
			],
			answer: 2,
			why: 'With nothing in flight, no retransmission timer is armed, and with no keepalive no probe is sent. The kernel only learns of the failure when one side sends something.'
		},
		{
			q: 'The retransmission timer fires for the 4th time on a connection whose RTO was 300 ms. What RTO does Linux arm next?',
			options: [
				'300 ms again, because the RTO only changes with a new RTT sample',
				'1.2 s, because the RTO doubles once per lost segment',
				'120 s, because a timer that fires more than 3 times jumps to the cap',
				'4.8 s, because the RTO has doubled at each of the 4 timeouts'
			],
			answer: 3,
			why: 'Each expiry runs `icsk_rto << 1`, capped at 120 s: 0.6, 1.2, 2.4 then 4.8 s. A new RTT sample would bring the RTO back down, but no ACK arrives while the timer keeps firing.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Cut a live connection, watch the kernel double its retransmissions, and compare `tcp_retries2 = 5` with `TCP_USER_TIMEOUT`.',
		steps: [
			'Start a web server on its own network: `docker network create rtxlab && docker run -d --name web --network rtxlab nginx:1.27-alpine`.',
			'Open a client whose network namespace has `tcp_retries2 = 5`: `docker run --rm -it --network rtxlab --cap-add NET_ADMIN --sysctl net.ipv4.tcp_retries2=5 nicolaka/netshoot:v0.13`.',
			'Inside it, print the client\'s outgoing packets in the background: `tcpdump -l -n -i eth0 "tcp dst port 80" &`.',
			'Connect, then drop every packet from the server and send one line: `time python3 -c \'import os, socket; s = socket.create_connection(("web", 80)); os.system("iptables -A INPUT -p tcp --sport 80 -j DROP"); s.send(b"GET / HTTP/1.1\\r\\n"); s.recv(1)\'`.',
			'Remove the rule with `iptables -D INPUT -p tcp --sport 80 -j DROP`, then run the same command with `s.setsockopt(socket.IPPROTO_TCP, socket.TCP_USER_TIMEOUT, 3000); ` inserted right after the `create_connection(...)` statement.',
			'Type `exit`, then clean up: `docker rm -f web && docker network rm rtxlab`.'
		],
		done: [
			'tcpdump shows the same 16 bytes, `Flags [P.]`, sent again and again, with gaps that double from about 0.2 s up to about 3.3 s.',
			'The first run ends with `TimeoutError: [Errno 110]` after about 13 seconds.',
			'The run with `TCP_USER_TIMEOUT` ends with the same error after about 3 seconds.'
		],
		solution: [
			'Between two containers the round trip is far below 200 ms, so the RTO starts at the 200 ms floor and doubles at each timeout.',
			'The model for 5 gives 12.6 s. The socket fails at the first RTO that ends past that point, so a little later than 12.6 s.',
			'`TCP_USER_TIMEOUT` shortens the timer to the time left, so that socket fails near 3 s while the namespace keeps `tcp_retries2 = 5` for every other connection.'
		]
	},
	recall: {
		q: 'What does Linux do to the RTO each time the retransmission timer fires, and how long does a connection with unacknowledged data last against a dead peer with `tcp_retries2 = 15`?',
		a: 'It doubles the RTO, up to a 120 s cap. With 15 retries the modelled timeout is 924.6 s, and Cloudflare saw `ETIMEDOUT` at 15:39.'
	},
	sources: [
		{ title: 'Linux kernel docs, IP sysctl (tcp_retries2, tcp_syn_retries, tcp_rto_max_ms)', url: SYSCTL },
		{ title: 'Linux source, net/ipv4/tcp_timer.c', url: TIMER },
		{ title: 'RFC 6298, Computing TCP\'s Retransmission Timer', url: 'https://www.rfc-editor.org/rfc/rfc6298' },
		{ title: 'tcp(7), TCP_USER_TIMEOUT', url: 'https://man7.org/linux/man-pages/man7/tcp.7.html' },
		{ title: 'Cloudflare blog, When TCP sockets refuse to die (2019)', url: CF }
	]
};
