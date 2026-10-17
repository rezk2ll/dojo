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
