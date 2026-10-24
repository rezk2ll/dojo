const COREDNS = 'https://github.com/coredns/coredns/blob/d116ecb98cebc576576a93766ab4c155ecdbe31d';
const CACHE = `${COREDNS}/plugin/cache/cache.go`;
const TTLGO = `${COREDNS}/plugin/pkg/dnsutil/ttl.go`;
const README = `${COREDNS}/plugin/cache/README.md`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'dns-ttl',
	part: 'Names and addresses',
	title: 'TTLs and caching',
	minutes: 10,
	hook: [
		'On 30 September 2021, Slack published a DS record for slack.com at the `.com` zone to turn on DNSSEC. Users behind some resolvers started to see `ERR_NAME_NOT_RESOLVED`. The team removed the DS record at the registrar. "After nearly an hour, there were no signs of improvement".',
		'They had assumed the DS record was never cached. Slack\'s postmortem: "The \'.com.\' zone will ask resolvers to cache the slack.com DS record for 24h by default". Google Public DNS capped it at 6 hours. When Slack then turned off signing, validating resolvers that still held the DS record answered `SERVFAIL` for every slack.com name.',
		'The outage hit less than 1% of users and lasted 24 hours. It ended as resolver operators flushed their caches on request and **the 24 hour TTL on the DS record ran out**.'
	],
	terms: [
		{ term: 'TTL', def: 'Time to live: a number of seconds in each DNS record. RFC 1035 defines it as the interval "that the resource record may be cached before it should be discarded".' },
		{ term: 'Recursive resolver', def: 'The server your machine sends its questions to (your ISP\'s, `1.1.1.1`, CoreDNS in a cluster). It asks the authoritative servers and keeps each answer in its cache for the TTL.' },
		{ term: 'Negative caching', def: 'Keeping an answer that says a name does not exist (`NXDOMAIN`) or has no record of the asked type (`NODATA`), so the next identical question is answered from the cache.' },
		{ term: 'SOA MINIMUM', def: 'The last number in a zone\'s SOA record. Since RFC 2308 it caps how long a negative answer from that zone may be cached.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['client["Laptop: A example.com?"] --> res["Recursive resolver"]', 'res -->|"cache miss"| auth["Authoritative server"]', 'auth -->|"example.com 300 IN A"| res'],
				highlight: ['res', 'auth'],
				note: 'The resolver has nothing cached, so it asks the authoritative server. The answer carries a TTL of 300 seconds, set by whoever runs the zone. I ran this query against `hera.ns.cloudflare.com` in this session and got 300.'
			},
			{
				add: ['res --> cache[("Cache: example.com A, stored 182 s ago")]', 'cache -->|"example.com 118 IN A"| client2["Second laptop"]'],
				highlight: ['cache', 'client2'],
				note: 'The resolver stores the answer and serves the next clients from the cache with the time already spent subtracted. The same query to `1.1.1.1` returned a TTL of 118: that copy was cached 182 seconds earlier and will be dropped in 118 seconds.'
			},
			{
				add: ['admin["You change the A record"] --> auth', 'cache -.->|"old address until the TTL reaches 0"| client2'],
				highlight: ['admin', 'cache'],
				note: 'The authoritative server has the new address at once. The resolver does not ask again until its copy expires, so its clients keep the old address for up to 300 seconds. With a TTL of 86400, the worst case is a full day.'
			},
			{
				add: ['client3["Laptop: A new.example.com?"] --> res', 'auth -->|"NXDOMAIN + SOA ... 1800"| ncache[("Negative cache")]'],
				highlight: ['ncache'],
				note: 'A name that does not exist yet comes back as `NXDOMAIN`, with the zone\'s SOA record in the authority section. RFC 2308 sets the negative TTL to the smaller of the SOA\'s own TTL and its MINIMUM field. For `example.com` both are 1800, so the "no such name" answer is kept for 30 minutes.'
			},
			{
				add: ['lower["2 days before: TTL 86400 to 300"] --> admin'],
				highlight: ['lower'],
				note: 'RFC 1034: "If a change can be anticipated, the TTL can be reduced prior to the change to minimize inconsistency during the change". Lower it at least one old TTL ahead, because copies cached with 86400 live for a day. After the change, raise it back.'
			}
		]
	},
	example: {
		title: 'CoreDNS plugin/cache/cache.go: how long each answer is kept',
		repo: 'coredns/coredns',
		url: `${CACHE}#L330-L616`,
		lang: 'go',
		code: `func computeTTL(msgTTL, minTTL, maxTTL time.Duration) time.Duration {
	ttl := min(max(msgTTL, minTTL), maxTTL)
	return ttl
}
…
	var duration time.Duration
	switch mt {
	case response.NameError, response.NoData:
		msgTTL := dnsutil.MinimalTTLWithMaximum(res, mt, w.nttl)
		duration = computeTTL(msgTTL, w.minnttl, w.nttl)
	case response.ServerError:
		duration = w.failttl
	default:
		msgTTL := dnsutil.MinimalTTLWithMaximum(res, mt, w.pttl)
		duration = computeTTL(msgTTL, w.minpttl, w.pttl)
	}

	// Apply capped TTL to this reply to avoid jarring TTL experience 1799 -> 8 (e.g.)
	ttl := uint32(duration.Seconds())
	res.Answer = filterRRSlice(res.Answer, ttl, false)
	res.Ns = filterRRSlice(res.Ns, ttl, false)
…
const (
	maxTTL  = dnsutil.MaximumDefaultTTL
	minTTL  = dnsutil.MinimalDefaultTTL
	maxNTTL = dnsutil.MaximumDefaultTTL / 2
	minNTTL = dnsutil.MinimalDefaultTTL`,
		notes: [
			'Line 2 clamps the TTL from the answer between a floor and a ceiling. A record with a TTL of 30 is kept for 30 seconds. The README says the cap "does not extend it".',
			'Lines 8 to 10 handle `NXDOMAIN` and `NODATA`, the negative answers, with their own ceiling `w.nttl`. Its default is `maxNTTL` on line 26, half of `MaximumDefaultTTL`, which [ttl.go](' + TTLGO + '#L53-L57) defines as 1 hour. Negative answers are kept 30 minutes at most, positive ones 1 hour.',
			'`MinimalTTLWithMaximum` on lines 9 and 14 takes the lowest TTL of every record in the reply. For a negative reply, the only record is the SOA in the authority section, so its TTL decides.',
			'Lines 11 and 12 cache a `SERVFAIL` for `w.failttl`. The README gives the default: "SERVFAIL responses will be cached for 5 seconds".',
			'Lines 19 to 21 write the capped TTL into the reply itself. With `cache 8`, a record with TTL 1799 reaches the client as 8 on the first query too, which the comment on line 18 calls avoiding a "jarring TTL experience".'
		]
	},
	tradeoff: {
		gain: [
			'A long TTL lets resolvers answer from their cache without asking the authoritative server. RFC 1034 says "these times should be on the order of days for the typical host".',
			'Negative caching stops a resolver from asking the authoritative server again for a missing name: `.com` answers `NXDOMAIN` with an SOA of TTL 900, so the miss is kept 15 minutes.'
		],
		cost: [
			'A change reaches a client only when its resolver\'s copy expires. With a TTL of 86400, some users see the old record for up to 24 hours.',
			'You cannot shorten a TTL that resolvers already hold. Slack\'s DS record kept its 24 hours because the `.com` zone set it, and only flushes by each resolver operator cut it short.',
			'A name queried just before you create it stays `NXDOMAIN` for the negative TTL: 30 minutes for a zone whose SOA TTL and MINIMUM are 1800.'
		]
	},
	task: {
		prompt: 'At 09:58 a deploy script queries `api.shop.example` before the record exists, through CoreDNS with the default `cache` settings. The authority section says `shop.example. 3600 IN SOA ns1.shop.example. admin.shop.example. 2026101701 7200 900 1209600 86400`. You create the A record at 10:00 with TTL 300. When does the script see it? Then: you will move `api.shop.example` to a new server tomorrow at 14:00 and its TTL is 86400 today. What do you change, and when?',
		hint: 'Negative TTL: the smaller of the SOA\'s TTL (second field) and MINIMUM (last field). Then apply CoreDNS\'s cap for negative answers.',
		answer: [
			'RFC 2308: min(3600, 86400) = 3600 seconds. CoreDNS caps negative answers at `maxNTTL`, 30 minutes. CoreDNS keeps the `NXDOMAIN` from 09:58 to 10:28, so the script sees the record at 10:28, 28 minutes after you created it.',
			'For the move: lower the TTL from 86400 to 300 today before 14:00, at least 24 hours ahead. Resolvers that cached the record just before you lowered it keep it 86400 seconds, so their copies are gone by 14:00 tomorrow.',
			'At 14:00 change the address. Every cached copy now has at most 300 seconds left, so clients reach the new server by 14:05. Raise the TTL back to 86400 once the new server is stable.'
		],
		steps: [
			{
				title: 'Read the SOA',
				questions: [
					{ q: 'In `shop.example. 3600 IN SOA ns1 admin 2026101701 7200 900 1209600 86400`, which field is the SOA record\'s own TTL?', options: ['2026101701', '7200', '3600', '86400'], answer: 2, why: 'The TTL comes right after the owner name, as in every record. `2026101701` is the serial.' },
					{ q: 'Which field is MINIMUM?', options: ['The last one, 86400', 'The first number after the names, 2026101701', 'The third number, 900', 'The fourth number, 1209600'], answer: 0, why: 'MINIMUM is the last number in the SOA. Since RFC 2308 it caps how long a negative answer may be cached.' },
					{ q: 'What does RFC 2308 set as the TTL of this `NXDOMAIN`?', options: ['86400, the MINIMUM field', '3600, the smaller of TTL and MINIMUM', '900, the retry field', '7200, the refresh field'], answer: 1, why: 'The negative TTL is the smaller of the SOA\'s TTL and its MINIMUM field: min(3600, 86400) = 3600.' },
					{ q: 'What are the refresh, retry and expire fields for?', options: ['They cap positive answers in resolver caches', 'They set how long clients wait for a reply', 'They tell secondary servers how to copy the zone', 'They replace MINIMUM when it is missing'], answer: 2, why: 'Refresh, retry and expire tell secondary servers how to keep their copy of the zone. They play no part in negative caching.' }
				]
			},
			{
				title: 'Apply the CoreDNS cap',
				questions: [
					{ q: 'How long does CoreDNS keep a negative answer at most with the default `cache` settings?', options: ['1 hour, `MaximumDefaultTTL`', '5 seconds, like a `SERVFAIL`', '24 hours, like the `.com` DS record', '30 minutes, `maxNTTL`'], answer: 3, why: '`maxNTTL` is half of `MaximumDefaultTTL`, which is 1 hour, so negative answers stay 30 minutes at most.' },
					{ q: 'The SOA allows 3600 seconds and CoreDNS caps at 1800. How long is the `NXDOMAIN` kept?', options: ['3600 seconds', '1800 seconds', '5400 seconds', '86400 seconds'], answer: 1, why: 'Line 2 of `computeTTL` clamps the TTL under the ceiling, so 3600 becomes 1800.' },
					{ q: 'The `NXDOMAIN` was cached at 09:58. When does the script first see the A record?', options: ['10:00, when you create it', '10:05, after the record\'s TTL of 300', '10:28, when the negative copy expires', '10:58, after the SOA TTL of 3600'], answer: 2, why: 'CoreDNS answers from its negative cache until 09:58 plus 30 minutes, so the first fresh lookup is at 10:28.' },
					{ q: 'Why does the TTL of 300 on the new A record not help here?', options: ['CoreDNS ignores TTLs below 1800', 'The record has to reach every secondary first', 'TTLs only apply to records over 3600 seconds', 'The cache holds the old "no such name" answer, not the record'], answer: 3, why: 'What is cached is the `NXDOMAIN` with its own TTL. The new record\'s TTL counts only once a resolver fetches it.' }
				]
			},
			{
				title: 'Plan the TTL change',
				questions: [
					{ q: 'The move is tomorrow at 14:00 and the TTL is 86400. What do you change first?', options: ['Lower the TTL to 300, at least 24 hours before', 'Change the address now, so caches have time', 'Raise the TTL, so caches keep the record longer', 'Ask resolver operators to flush at 14:00'], answer: 0, why: 'RFC 1034: if a change can be anticipated, reduce the TTL before it. Copies cached with 86400 live a day, so lower it a full day ahead.' },
					{ q: 'A resolver cached the record one second before you lowered the TTL. How long does it keep that copy?', options: ['300 seconds, the new TTL', '86400 seconds, the TTL it was given', 'Until the zone serial changes', '1800 seconds, the CoreDNS cap'], answer: 1, why: 'You cannot shorten a TTL that resolvers already hold. That copy lives its full 86400 seconds.' },
					{ q: 'You lower the TTL today at 15:00 instead of before 14:00. What happens at 14:00 tomorrow?', options: ['Nothing changes: 300 seconds is short anyway', 'The zone refuses the change until 15:00', 'Copies cached just before 15:00 today still hold the old address', 'Every resolver flushes at midnight'], answer: 2, why: 'A copy taken at 14:59 today keeps the 86400 TTL until 14:59 tomorrow, past the move.' },
					{ q: 'Why not keep the TTL at 300 forever?', options: ['A TTL of 300 breaks negative caching', 'RFC 1035 forbids TTLs under one hour', 'Short TTLs make resolvers ignore the record', 'Long TTLs let resolvers answer from cache without asking'], answer: 3, why: 'RFC 1034 says TTLs "should be on the order of days for the typical host". A long TTL saves queries to the authoritative server.' }
				]
			},
			{
				title: 'Do the move',
				questions: [
					{ q: 'At 14:00 tomorrow you change the address. How long can a client still get the old one?', options: ['Up to 300 seconds', 'Up to 86400 seconds', 'Up to 1800 seconds', 'Not at all'], answer: 0, why: 'Every cached copy now has at most 300 seconds left, so clients reach the new server by 14:05.' },
					{ q: 'Why keep the old server running until about 14:05?', options: ['Secondary servers need it to copy the zone', 'Some clients still hold the old address for up to 300 s', 'The new server needs it to warm its cache', 'CoreDNS checks the old address before the new one'], answer: 1, why: 'Until the last 300 second copy expires, some clients still connect to the old address.' },
					{ q: 'When do you raise the TTL back to 86400?', options: ['At 14:00, together with the address', 'Never: once lowered, it must stay low', 'Once the new server is stable', 'Before the move, to protect the old address'], answer: 2, why: 'Raise it after the change, once you know you will not need to move back quickly.' },
					{ q: 'A colleague changes the address with the TTL still at 86400. What is the worst case?', options: ['Five minutes of mixed answers', 'Thirty minutes, the CoreDNS cap', 'One minute, the time to reload the zone', 'Some users see the old address for a full day'], answer: 3, why: 'With a TTL of 86400, a copy cached just before the change lives 24 hours.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'An A record has a TTL of 86400. You change the address at 10:00. When can you be sure every resolver that honours TTLs has the new address?',
			options: [
				'At 10:00, because the authoritative server answers with the new address',
				'About 10:05, the time a resolver takes to notice a new zone serial',
				'At 10:00 the next day, when a copy cached at 09:59 expires',
				'Never, because resolvers keep records until someone flushes them'
			],
			answer: 2,
			why: 'A resolver asks the authoritative server again only when its cached copy\'s TTL reaches 0. A copy cached one minute before the change lives 86400 seconds, so the last old answers expire about 24 hours after the change.'
		},
		{
			q: 'A zone\'s SOA is `example.org. 3600 IN SOA ns1 host 2026101701 7200 900 1209600 300`. How long may a resolver cache an `NXDOMAIN` from this zone?',
			options: ['3600 seconds, the SOA record\'s own TTL', '300 seconds, the smaller of the TTL and MINIMUM', '900 seconds, the retry field', '1209600 seconds, the expire field'],
			answer: 1,
			why: 'RFC 2308 section 5: the negative answer\'s TTL "is taken from the minimum of the SOA.MINIMUM field and SOA\'s TTL". Here min(3600, 300) is 300. Refresh, retry and expire are for secondary servers copying the zone.'
		},
		{
			q: 'Slack removed its DS record from the `.com` zone, but validating resolvers kept failing for hours. Why?',
			options: [
				'The registrar takes 24 hours to publish any change to `.com`',
				'Resolvers had cached the DS record, which `.com` serves with a 24 hour TTL',
				'Slack\'s own zone still served the DS record with a long TTL',
				'DNSSEC validation results are never cached, so each query failed again'
			],
			answer: 1,
			why: 'The DS record lives in the parent zone, and `.com` gives it a TTL of 86400 that the domain owner cannot change. Resolvers that had fetched it kept validating slack.com until the copy expired or their operator flushed it.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Watch a CoreDNS cache keep an `NXDOMAIN` after the record exists.',
		steps: [
			'Make a folder: `mkdir -p ~/dns-lab && cd ~/dns-lab`. Create `db.shop.example` with these lines: `$ORIGIN shop.example.`, `@ 120 IN SOA ns1.shop.example. admin.shop.example. 1 7200 900 1209600 120`, `@ 300 IN NS ns1.shop.example.`, `ns1 300 IN A 127.0.0.1`, `www 300 IN A 192.0.2.10`.',
			'Create `Corefile` with one line each: `shop.example:1053 {`, `file /lab/db.shop.example {`, `reload 5s`, `}`, `}`, `.:53 {`, `cache`, `forward . 127.0.0.1:1053`, `}`. The first block is the authoritative server, the second a caching resolver in front of it.',
			'Start it: `docker run -d --rm --name dnslab -p 127.0.0.1:8053:53/udp -p 127.0.0.1:8054:1053/udp -v "$PWD":/lab coredns/coredns:1.11.3 -conf /lab/Corefile`. Port 8053 is the cache, 8054 the authoritative server.',
			'Query the cache twice a few seconds apart: `dig @127.0.0.1 -p 8053 www.shop.example +noall +answer`. Watch the TTL go down.',
			'Ask for a name that does not exist yet: `dig @127.0.0.1 -p 8053 api.shop.example +noall +comments +authority`. Then edit `db.shop.example`: change the serial from `1` to `2` and add `api 300 IN A 192.0.2.20`. Wait 10 seconds and query both ports again.'
		],
		done: [
			'The second `www` query shows a TTL lower than 300.',
			'`dig @127.0.0.1 -p 8054 api.shop.example +short` prints `192.0.2.20`, while the same query on port 8053 still says `NXDOMAIN` with a counting SOA TTL.',
			'About two minutes after the first `api` query, port 8053 returns `192.0.2.20` too.'
		],
		solution: [
			'The authoritative server has the record as soon as it reloads the zone. The cache does not ask again until its negative copy expires.',
			'That copy lives the TTL of the SOA in the authority section, here 120 seconds. With `3600` there, CoreDNS would cap it at 1800.',
			'Stop the lab with `docker stop dnslab`.'
		]
	},
	recall: {
		q: 'What decides how long a resolver caches an `NXDOMAIN`, and how long does CoreDNS keep one at most by default?',
		a: 'The SOA record in the authority section: the smaller of its TTL and its MINIMUM field (RFC 2308). CoreDNS caps negative answers at 30 minutes, half of its 1 hour default maximum.'
	},
	sources: [
		{ title: 'Slack Engineering, What happened during Slack\'s DNSSEC rollout?', url: 'https://slack.engineering/what-happened-during-slacks-dnssec-rollout/' },
		{ title: 'RFC 2308, Negative Caching of DNS Queries (DNS NCACHE)', url: 'https://www.rfc-editor.org/rfc/rfc2308' },
		{ title: 'RFC 1034, Domain Names: Concepts and Facilities', url: 'https://www.rfc-editor.org/rfc/rfc1034' },
		{ title: 'RFC 1035, Domain Names: Implementation and Specification', url: 'https://www.rfc-editor.org/rfc/rfc1035' },
		{ title: 'CoreDNS cache plugin README', url: README }
	]
};
