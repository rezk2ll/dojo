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
