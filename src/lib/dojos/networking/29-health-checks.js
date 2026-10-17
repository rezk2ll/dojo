const HAPROXY = 'https://github.com/haproxy/haproxy/blob/a383051731cfa80f0196bdecc4c6a2ab7c1ea234';
const CHECK = `${HAPROXY}/src/check.c`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'health-checks',
	part: 'Between services',
	title: 'Health checks',
	minutes: 10,
	hook: [
		'On 27 October 2019 around 18:30 UTC, one of the load balancers of Healthchecks.io "was intermittently unable to reach the backend servers over their private IP addresses". The incident report: "Haproxy was reporting backends sporadically flipping between healthy / unhealthy states."',
		'A monitoring script removed that load balancer from DNS rotation, and the second one kept serving. The hosting provider reported the network issue fixed at 22:21 UTC, almost 4 hours after it started.',
		'Each flip was HAProxy\'s health check changing its mind. By default HAProxy checks a server every 2000 ms, marks it down after 3 failed checks in a row, and marks it up again after 2 passed checks.'
	],
	terms: [
		{ term: 'Active health check', def: 'A probe the balancer sends on its own schedule, with no user request involved: a TCP connect, or an HTTP request like HAProxy\'s `option httpchk`.' },
		{ term: 'Passive health check', def: 'A verdict drawn from real traffic. Envoy calls it outlier detection: a host that returns 5 consecutive 5xx responses is ejected for 30 s by default.' },
		{ term: 'rise and fall', def: 'HAProxy\'s two thresholds: `fall 3` consecutive failed checks mark a server down, `rise 2` consecutive passed checks mark it up.' },
		{ term: 'Flapping', def: 'A server that keeps switching between up and down, so the balancer keeps adding it to and removing it from the pool.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['hap["HAProxy: server web1 check, server web2 check"] -->|"OPTIONS / every 2 s"| w1["web1"]', 'hap -->|"OPTIONS / every 2 s"| w2["web2"]'],
				highlight: ['hap'],
				note: 'With `option httpchk` and no arguments, HAProxy sends `OPTIONS /` over HTTP/1.0 to each server. The manual: "responses 2xx and 3xx are considered valid, while all other ones indicate a server failure, including the lack of any response."'
			},
			{
				add: ['w2 -->|"3 failed checks in a row"| down["web2 DOWN: all traffic to web1"]'],
				highlight: ['w2', 'down'],
				note: 'web2 crashes. Its next 3 checks fail, about 6 s at one check every 2 s, and HAProxy marks it DOWN. Requests sent to web2 during those 6 s reach a dead server. After that, only web1 gets traffic, and HAProxy keeps checking web2.'
			},
			{
				add: ['env["Envoy outlier detection"] -->|"5 consecutive 5xx on real requests"| ej["host ejected 30 s, then 60 s, then 90 s"]'],
				highlight: ['env', 'ej'],
				note: 'A passive check needs no probe. Envoy counts errors on real requests, ejects a host after 5 consecutive 5xx, and puts it back after `base_ejection_time` (30 s). Each new ejection in a row lasts one more multiple of 30 s, up to `max_ejection_time` (300 s). By default, at most 10% of a cluster\'s hosts can be ejected (`max_ejection_percent`).'
			},
			{
				add: ['net["Lossy network: some checks lost"] -.-> w2', 'w2 -.->|"DOWN, UP, DOWN, UP"| hap'],
				highlight: ['net'],
				note: 'When some checks fail and some pass, a server can cross both thresholds again and again. Healthchecks.io saw this while its load balancer could reach the backends only some of the time: each UP sent traffic back to backends the balancer could not reliably reach.'
			},
			{
				add: ['all["Every server DOWN"] -->|"HAProxy"| e503["503 to the client"]', 'all -->|"Envoy, under 50% healthy"| panic["panic: balance across all hosts"]'],
				highlight: ['all', 'e503', 'panic'],
				note: 'When no server is up, HAProxy answers 503, "when no server was available to handle the request". Envoy has a panic threshold, 50% by default: below it, Envoy ignores health and spreads traffic over all hosts. The docs give the reason: "to avoid a situation in which host failures cascade throughout the cluster as load increases".'
			}
		]
	},
	example: {
		title: 'src/check.c: set_server_check_status, the rise and fall counter',
		repo: 'haproxy/haproxy',
		url: `${CHECK}#L504-L538`,
		lang: 'c',
		code: `	switch (check->result) {
	case CHK_RES_FAILED:
		/* Failure to connect to the agent as a secondary check should not
		 * cause the server to be marked down.
		 */
		if ((!(check->state & CHK_ST_AGENT) ||
		    (check->status >= HCHK_STATUS_L57DATA)) &&
		    (check->health > 0)) {
			if (s->counters.shared.tg)
				_HA_ATOMIC_INC(&s->counters.shared.tg[tgid - 1]->failed_checks);
			report = 1;
			check->health--;
			if (check->health < check->rise)
				check->health = 0;
		}
		break;

	case CHK_RES_PASSED:
	case CHK_RES_CONDPASS:
		if (check->health < check->rise + check->fall - 1) {
			report = 1;
			check->health++;

			if (check->health >= check->rise)
				check->health = check->rise + check->fall - 1; /* OK now */
		}

		/* clear consecutive_errors if observing is enabled */
		if (s->onerror)
			HA_ATOMIC_STORE(&s->consecutive_errors, 0);
		break;

	default:
		break;
	}`,
		notes: [
			'`check->health` is one counter from 0 to `rise + fall - 1`, which is 4 with the defaults. The [log line](' + CHECK + '#L554-L557) shows the server as UP while `health >= rise`, and DOWN below that.',
			'Line 12 takes one off for a failed check. Lines 13 and 14 drop the counter to 0 once it falls below `rise`. From 4, failures give 3, then 2, then 0: the third failure marks the server DOWN.',
			'Line 22 adds one for a passed check, and lines 24 and 25 jump straight to 4 once the counter reaches `rise`. From 0, passes give 1, then 4: the second pass marks the server UP.',
			'Lines 29 and 30 reset `consecutive_errors` on a passed check. That counter belongs to `observe layer7`, HAProxy\'s passive check: after `error-limit` (10) consecutive bad responses, the default `on-error fail-check` counts one failed check.'
		]
	},
	tradeoff: {
		gain: [
			'An active check finds a dead server with no user traffic: HAProxy sends its probe every 2 s whether or not requests arrive.',
			'A passive check judges real requests: Envoy ejects a host after 5 consecutive 5xx even if its `/health` URL still returns 200.',
			'One lost check does not remove a server: an UP server at 4 drops to 3, and the next pass puts it back at 4 without ever leaving the pool.'
		],
		cost: [
			'Probes add load: 20 HAProxy instances checking 50 backends every 2 s send 500 checks per second.',
			'A check that also tests the database marks every backend DOWN at once when the database fails. HAProxy then answers 503 to every request, including ones that never needed the database.',
			'A crashed server keeps getting requests until the 3rd failed check, about 6 s with the defaults. Envoy\'s passive check has a similar gap: 5 failed user requests before the ejection.'
		]
	},
	task: {
		prompt: 'An HAProxy server line has `check` with the defaults (`inter 2s`, `rise 2`, `fall 3`). The server is UP with `health` at 4. The next 10 checks give: fail, pass, fail, fail, pass, fail, fail, fail, pass, pass. After which check is the server marked DOWN, and after which check is it UP again?',
		hint: 'Use lines 12 to 14 and 22 to 25 of the example. UP means `health >= 2`. Write the counter after each check.',
		answer: [
			'Counter after each check: 3, 4, 3, 2, 4, 3, 2, 0, 1, 4. A pass while UP refills the counter to 4 (lines 24 and 25), so the first two failures in a row never get it below 2.',
			'The server goes DOWN after check 8, the third failure in a row: the counter drops from 2 to 1, which is below `rise`, so line 14 sets it to 0.',
			'It goes UP after check 10: check 9 gives 1, check 10 gives 2, which reaches `rise`, and line 25 sets 4.',
			'With checks every 2 s, check 8 runs about 16 s after the first one. The failures at checks 1, 3 and 4 did not remove the server, because a pass came before a third failure in a row.'
		]
	},
	quiz: [
		{
			q: 'A backend behind HAProxy crashes. The server line has `check` and no other options. How long until HAProxy stops sending it traffic?',
			options: [
				'At once, because the first failed request marks the server down',
				'About 6 s: three failed checks in a row, one every 2 s',
				'About 4 s: two failed checks in a row, one every 2 s',
				'Never, because `check` alone only tests that a TCP connect works'
			],
			answer: 1,
			why: 'The defaults are `inter 2000` and `fall 3`. A crashed process refuses the TCP connect, so even a plain TCP check fails. HAProxy marks the server DOWN on the third consecutive failure. `rise 2` is the count for coming back up.'
		},
		{
			q: 'A service\'s `/health` returns 200, but 30% of real requests return 500 because one of its dependencies fails. Which check removes it from the pool?',
			options: [
				'HAProxy\'s `option httpchk GET /health`, because it runs every 2 s',
				'A plain TCP check, because the 500s close the connection',
				'A passive check like Envoy\'s outlier detection or HAProxy\'s `observe layer7`',
				'None of them, because a 500 response counts as a healthy answer'
			],
			answer: 2,
			why: 'The active check only sees `/health`, which still answers 200. A passive check counts errors on real requests: Envoy ejects after 5 consecutive 5xx, HAProxy counts one failed check after 10 consecutive errors with `observe layer7`. Both look for errors in a row, so a 30% error rate trips them only when enough 500s line up.'
		},
		{
			q: 'Envoy\'s active health checks mark 3 of a cluster\'s 4 hosts unhealthy. With default settings, where does traffic go?',
			options: [
				'To the one healthy host, which now takes all the traffic',
				'Nowhere: Envoy answers 503 until a second host is healthy again',
				'To the healthy host, plus the unhealthy ones with half the weight',
				'To all 4 hosts, because 25% healthy is below the 50% panic threshold'
			],
			answer: 3,
			why: 'Below the panic threshold, 50% by default, Envoy disregards health status and balances across all hosts. This keeps a burst of failures from sending the whole load to one host and taking it down too.'
		}
	],
	recall: {
		q: 'With HAProxy\'s default `rise` and `fall`, how many consecutive failed checks mark a server down, and how many passed checks bring it back?',
		a: '`fall 3`: 3 failed checks in a row, one every 2000 ms, mark it DOWN. `rise 2`: 2 passed checks in a row mark it UP. The counter runs from 0 to 4 in `check.c`.'
	},
	sources: [
		{ title: 'Healthchecks.io, Incident Report: 27 October 2019', url: 'https://blog.healthchecks.io/2019/10/incident-report-27-october-2019/' },
		{ title: 'HAProxy configuration manual (check, inter, rise, fall, observe, option httpchk)', url: 'https://github.com/haproxy/haproxy/blob/a383051731cfa80f0196bdecc4c6a2ab7c1ea234/doc/configuration.txt' },
		{ title: 'Envoy docs, Outlier detection', url: 'https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/outlier' },
		{ title: 'Envoy API, outlier_detection.proto (defaults)', url: 'https://github.com/envoyproxy/envoy/blob/fc9cbc5f8cf8ea60289b6110850b2a2649fb3627/api/envoy/config/cluster/v3/outlier_detection.proto' },
		{ title: 'Envoy docs, Panic threshold', url: 'https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/load_balancing/panic_threshold' }
	]
};
