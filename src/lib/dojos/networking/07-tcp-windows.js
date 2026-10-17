const LINUX = 'https://github.com/torvalds/linux/blob/70dd4ee72eb2d5793c62e71c14e3aba78e5a4e56';
const CONG = `${LINUX}/net/ipv4/tcp_cong.c`;
const TCPH = `${LINUX}/include/net/tcp.h`;
const SYSCTL = `${LINUX}/Documentation/networking/ip-sysctl.rst`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'tcp-windows',
	part: 'Packets',
	title: 'Flow and congestion control',
	minutes: 10,
	hook: [
		'By default, a new TCP connection on Linux sends at most 10 segments before the first ACK comes back. With 1460-byte segments, that is 14,600 bytes in the first round trip.',
		'RFC 6928 counts the round trips for bigger transfers, with no loss and with delayed ACKs. With that start, 120 segments (about 175 KB) need 5 round trips. On a path with a 100 ms round trip, the last byte arrives after half a second, even on a 10 Gbit/s link.',
		'The receiver puts the number of bytes it can still buffer in every ACK. The sender keeps its own estimate of what the path can carry. The amount of unacknowledged data stays under the smaller of the two numbers.'
	],
	terms: [
		{ term: 'Receive window (rwnd)', def: 'The number of bytes the receiver says it can accept, sent in the 16-bit Window field of every segment and multiplied by the window scale factor.' },
		{ term: 'Congestion window (cwnd)', def: 'The sender\'s own limit on unacknowledged data, in segments on Linux. It starts at 10 (`TCP_INIT_CWND`) and changes with every ACK and every loss.' },
		{ term: 'Slow start', def: 'The phase where cwnd grows by one segment for each segment acknowledged, which doubles it every round trip.' },
		{ term: 'ssthresh', def: 'Slow start threshold: below it the sender is in slow start, above it cwnd grows by about one segment per round trip. A loss sets it to about half of cwnd.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['s["Sender: cwnd = 10 segments"] -->|"10 segments"| r["Receiver: advertises rwnd"]'],
				highlight: ['s'],
				note: 'After the handshake the sender may have 10 segments unacknowledged. RFC 5681: "The minimum of cwnd and rwnd governs data transmission." On Linux the default receive buffer of 131072 bytes "results in initial window of 65535" bytes. Here 10 segments are 14,600 bytes, so cwnd is the smaller limit.'
			},
			{
				add: ['r -.->|"ACKs for 10 segments"| s', 's -->|"20 segments"| r'],
				highlight: ['s'],
				note: 'In slow start, each acknowledged segment adds one to cwnd. A full round trip of ACKs for 10 segments brings cwnd to 20, the next one to 40, then 80. The window doubles every round trip while cwnd is below ssthresh and no segment is lost.'
			},
			{
				add: ['loss["One segment lost"] --> half["ssthresh = cwnd / 2, then + 1 segment per round trip"]', 's --> loss'],
				highlight: ['loss', 'half'],
				note: 'When the sender detects a loss, Reno sets ssthresh to half of cwnd, never below 2 segments. With cwnd above ssthresh, the sender is in congestion avoidance and adds about one segment per round trip. After a retransmission timeout, RFC 5681 drops cwnd to 1 segment and slow start runs again up to ssthresh.'
			},
			{
				add: ['idle["Connection idle longer than one RTO"] --> s'],
				highlight: ['idle'],
				note: 'With `tcp_slow_start_after_idle = 1`, the Linux default, a connection that sent nothing for more than one RTO halves cwnd for each RTO of silence, down to 10. A keep-alive HTTP connection that waited a few seconds between requests starts its next response almost like a new one.'
			}
		]
	},
	example: {
		title: 'net/ipv4/tcp_cong.c: slow start, additive increase and Reno',
		repo: 'torvalds/linux',
		url: `${CONG}#L456-L520`,
		lang: 'c',
		code: `__bpf_kfunc u32 tcp_slow_start(struct tcp_sock *tp, u32 acked)
{
	u32 cwnd = min(tcp_snd_cwnd(tp) + acked, tp->snd_ssthresh);

	acked -= cwnd - tcp_snd_cwnd(tp);
	tcp_snd_cwnd_set(tp, min(cwnd, tp->snd_cwnd_clamp));

	return acked;
}
…
__bpf_kfunc void tcp_cong_avoid_ai(struct tcp_sock *tp, u32 w, u32 acked)
{
	/* If credits accumulated at a higher w, apply them gently now. */
	if (tp->snd_cwnd_cnt >= w) {
		tp->snd_cwnd_cnt = 0;
		tcp_snd_cwnd_set(tp, tcp_snd_cwnd(tp) + 1);
	}

	tp->snd_cwnd_cnt += acked;
	if (tp->snd_cwnd_cnt >= w) {
		u32 delta = tp->snd_cwnd_cnt / w;

		tp->snd_cwnd_cnt -= delta * w;
		tcp_snd_cwnd_set(tp, tcp_snd_cwnd(tp) + delta);
	}
	tcp_snd_cwnd_set(tp, min(tcp_snd_cwnd(tp), tp->snd_cwnd_clamp));
}
…
__bpf_kfunc void tcp_reno_cong_avoid(struct sock *sk, u32 ack, u32 acked)
{
	struct tcp_sock *tp = tcp_sk(sk);

	if (!tcp_is_cwnd_limited(sk))
		return;

	/* In "safe" area, increase. */
	if (tcp_in_slow_start(tp)) {
		acked = tcp_slow_start(tp, acked);
		if (!acked)
			return;
	}
	/* In dangerous area, increase slowly. */
	tcp_cong_avoid_ai(tp, tcp_snd_cwnd(tp), acked);
}
…
__bpf_kfunc u32 tcp_reno_ssthresh(struct sock *sk)
{
	const struct tcp_sock *tp = tcp_sk(sk);

	return max(tcp_snd_cwnd(tp) >> 1U, 2U);
}`,
		notes: [
			'Line 3 is slow start: the new cwnd is the old one plus the number of segments this ACK covers, but never above ssthresh. Line 5 keeps the ACKed segments left over once ssthresh is reached, and line 8 hands them to congestion avoidance.',
			'Lines 19 to 24 count ACKed segments in `snd_cwnd_cnt`. Each time the count reaches `w`, the current cwnd, line 24 adds one segment. A full window of ACKs takes one round trip, so cwnd grows by one segment per round trip.',
			'Lines 33 and 34 skip all growth when the application did not fill the window. A sender that writes 2 KB every second keeps its cwnd where it was.',
			'Line 50 is the loss reaction: half of cwnd, at least 2. RFC 5681 writes it as `max (FlightSize / 2, 2*SMSS)`. Linux defaults to CUBIC, whose `cubictcp_cong_avoid` calls the same `tcp_slow_start` and then grows cwnd with a cubic curve.'
		]
	},
	tradeoff: {
		gain: [
			'A sender that knows nothing about the path puts 10 segments on it, then doubles only when ACKs prove the path delivered them.',
			'Halving cwnd on a loss makes every sender behind a full link slow down, so the queue drains and the link stays usable.'
		],
		cost: [
			'Short transfers pay in round trips: 120 segments need 5 of them with an initial window of 10, whatever the bandwidth.',
			'A receiver stuck at a 65,535-byte window, with window scaling off, caps a 100 ms path at 65,535 × 8 / 0.1 s, about 5.2 Mbit/s.',
			'With `tcp_slow_start_after_idle = 1`, a pooled connection that was quiet for 1 second with a 200 ms RTO halves its cwnd up to 4 times.'
		]
	},
	task: {
		prompt: 'This `ss -tin` line comes from an upload run in this session with `curl --data-binary` to `speed.cloudflare.com`, 0.3 s after the start: `cubic wscale:13,10 rto:205 rtt:4.781/0.586 mss:1388 cwnd:51 ssthresh:35 bytes_retrans:2776 send 118448860bps snd_wnd:229376`. Is the sender in slow start? Which limit, cwnd or the receive window, sets the amount in flight? Check the `send` figure.',
		hint: 'Compare cwnd with ssthresh. Turn cwnd into bytes with `mss`, then compare with `snd_wnd`, the peer\'s advertised window in bytes. `ss` computes `send` as cwnd × mss × 8 / rtt.',
		answer: [
			'cwnd is 51 and ssthresh is 35. Slow start runs only while cwnd < ssthresh, so the sender is in congestion avoidance. The `bytes_retrans:2776` shows a loss already happened, which is what set ssthresh.',
			'cwnd in bytes: 51 × 1388 = 70,788. The receiver advertises 229,376 bytes. The smaller value governs, so cwnd limits this upload.',
			'Rate: 70,788 × 8 = 566,304 bits per round trip, divided by 0.004781 s, gives 118.4 Mbit/s. That matches `send 118448860bps`.',
			'0.3 s later the same connection showed `cwnd:61 ssthresh:41`: cwnd keeps growing slowly in congestion avoidance.'
		]
	},
	quiz: [
		{
			q: 'A server sends a 120-segment response on a fresh connection with an initial window of 10, no loss, on a 100 ms path with 10 Gbit/s links. Roughly how long until the last byte arrives?',
			options: [
				'About 100 ms, because 10 Gbit/s sends 175 KB in a fraction of a millisecond',
				'About 1.2 s, because each segment waits for its own ACK',
				'About 500 ms, because cwnd needs 5 round trips to cover 120 segments',
				'About 200 ms, because the receive window is 65,535 bytes'
			],
			answer: 2,
			why: 'Slow start limits the data per round trip to cwnd, which starts at 10 and doubles. RFC 6928 counts 5 round trips for 120 segments with delayed ACKs. The link speed does not change the count.'
		},
		{
			q: 'During a transfer, a segment is lost while cwnd is 80. What does Reno set ssthresh to?',
			options: [
				'40, half of cwnd, and cwnd then grows by about 1 segment per round trip',
				'10, the initial window, and slow start runs again up to 80',
				'79, one less than cwnd, so the sender slows down only a little',
				'2, the minimum, so the sender restarts from almost nothing'
			],
			answer: 0,
			why: '`tcp_reno_ssthresh` returns `max(cwnd >> 1, 2)`, so 80 gives 40. Above ssthresh, `tcp_cong_avoid_ai` adds one segment per window of ACKs. The drop to 1 segment happens only after a retransmission timeout.'
		},
		{
			q: 'An API client sends one small request every 2 seconds on a keep-alive connection. The RTO is 200 ms. Why is each large response slow to start?',
			options: [
				'Keep-alive connections skip slow start and wait for the receive window to open',
				'The idle time is longer than one RTO, so Linux shrinks cwnd back toward 10',
				'The server closes and reopens the connection after 2 seconds of silence',
				'cwnd is reset to 1 segment after each response because no data was in flight'
			],
			answer: 1,
			why: 'With `tcp_slow_start_after_idle = 1`, `tcp_cwnd_restart` halves cwnd for each RTO of idle time, down to the initial window. Two seconds of silence allows 9 halvings, which brings a cwnd of up to 5,120 back to 10.'
		}
	],
	recall: {
		q: 'What sets the amount of unacknowledged data a TCP sender may have in flight, and what does cwnd do in slow start?',
		a: 'The smaller of cwnd and the receive window. In slow start cwnd starts at 10 segments on Linux and grows by one for each segment ACKed, so it doubles every round trip until ssthresh or a loss.'
	},
	sources: [
		{ title: 'RFC 5681, TCP Congestion Control', url: 'https://www.rfc-editor.org/rfc/rfc5681' },
		{ title: 'RFC 6928, Increasing TCP\'s Initial Window', url: 'https://www.rfc-editor.org/rfc/rfc6928' },
		{ title: 'Linux source, net/ipv4/tcp_cong.c', url: CONG },
		{ title: 'Linux source, include/net/tcp.h (TCP_INIT_CWND)', url: `${TCPH}#L268-L269` },
		{ title: 'Linux kernel docs, IP sysctl (tcp_rmem, tcp_slow_start_after_idle)', url: SYSCTL },
		{ title: 'ss(8) man page', url: 'https://man7.org/linux/man-pages/man8/ss.8.html' }
	]
};
