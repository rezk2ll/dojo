const UNBOUND = 'https://github.com/NLnetLabs/unbound/blob/d648eac68d7765440207f68077f96675f5bb36cc';
const ITER = `${UNBOUND}/iterator/iterator.c`;
const RFC1034 = 'https://www.rfc-editor.org/rfc/rfc1034';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'dns-resolution',
	part: 'Names and addresses',
	title: 'How a name is resolved',
	minutes: 10,
	hook: [
		'On the laptop used for this chapter, `dig en.wikipedia.org` answers in 6 ms from `127.0.0.53`. The answer holds two records: a CNAME from `en.wikipedia.org` to `dyna.wikimedia.org`, and an A record for `dyna.wikimedia.org`.',
		'`dig +trace` asks the same question with no cache, one server at a time. A root server answered in 9 ms with the servers for `org.`. An `org.` server answered in 16 ms with the servers for `wikipedia.org.`. Then `ns0.wikimedia.org` answered in 86 ms with the CNAME.',
		'A recursive resolver walks that path once and keeps each answer for its TTL. Two `dig` runs 3 seconds apart, in the same session, showed the TTL of the cached A record drop from 115 to 112.'
	],
	terms: [
		{ term: 'Stub resolver', def: 'The resolver in or next to the application. It sends every question, with the RD (recursion desired) bit set, to the servers in `/etc/resolv.conf` and waits for a full answer.' },
		{ term: 'Recursive resolver', def: 'A server that finds the answer for its clients by asking other servers, then caches what it learns. Unbound, BIND and the resolvers of ISPs and public DNS services do this job.' },
		{ term: 'Authoritative server', def: 'A server that holds a zone, such as `ns0.wikimedia.org` for `wikipedia.org`, and answers for it from its own data.' },
		{ term: 'Referral', def: 'A reply with no answer and a list of NS records for a zone closer to the name. The root sends a referral to the `org.` servers.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['app["curl: getaddrinfo(en.wikipedia.org)"] --> stub["Stub 127.0.0.53"]', 'stub -->|"A? RD set"| rec["Recursive resolver"]'],
				highlight: ['stub', 'rec'],
				note: 'The application calls the C library, and the stub reads `nameserver 127.0.0.53` from `/etc/resolv.conf`. That address is systemd-resolved on this laptop, which forwards to the network\'s resolver. RFC 1034 says a stub only needs "a list of name server addresses that will perform the recursive requests".'
			},
			{
				add: ['rec -->|"A? en.wikipedia.org"| root["Root server a.root-servers.net"]', 'root -.->|"referral: org. NS, TTL 172800"| rec'],
				highlight: ['root'],
				note: 'With an empty cache, the resolver starts at one of the 13 root server names. The root does not know the address. It replies with the NS records for `org.`, cached for 172800 s, which is 2 days.'
			},
			{
				add: ['rec -->|"A? en.wikipedia.org"| tld["org. server b0.org.afilias-nst.org"]', 'tld -.->|"referral: wikipedia.org. NS, TTL 3600"| rec'],
				highlight: ['tld'],
				note: 'The `org.` server replies with another referral: `ns0`, `ns1` and `ns2.wikimedia.org` serve `wikipedia.org.`, with a TTL of 3600 s. The same reply carries the A and AAAA records of those three servers, so the resolver can reach `ns0.wikimedia.org` without another lookup.'
			},
			{
				add: ['rec -->|"A? en.wikipedia.org"| auth["Authoritative ns0.wikimedia.org"]', 'auth -.->|"CNAME dyna.wikimedia.org"| rec'],
				highlight: ['auth'],
				note: 'The authoritative server answers from its zone, with the `aa` flag: `en.wikipedia.org` is a CNAME for `dyna.wikimedia.org`, TTL 86400. The reply holds only the CNAME, because `dyna.wikimedia.org` is in another zone. RFC 1034 step 4c: the resolver caches the CNAME, changes the name it looks for to `dyna.wikimedia.org`, and starts over.'
			},
			{
				add: ['rec -.->|"CNAME + A, flags qr rd ra"| stub'],
				highlight: ['rec'],
				note: 'Once it has the A record for `dyna.wikimedia.org`, the resolver sends both records back. `dig` prints `flags: qr rd ra`: a response, recursion desired by the client, recursion available on the server. The next client that asks within the TTL gets the answer from the cache.'
			}
		]
	},
	example: {
		title: 'iterator/iterator.c: Unbound follows a referral, then a CNAME',
		repo: 'NLnetLabs/unbound',
		url: `${ITER}#L3456-L3698`,
		lang: 'c',
		code: `	} else if(type == RESPONSE_TYPE_REFERRAL) {
		struct delegpt* old_dp = NULL;
		/* REFERRAL type responses get a reset of the
		 * delegation point, and back to the QUERYTARGETS_STATE. */
		verbose(VERB_DETAIL, "query response was REFERRAL");
…
			/* Store the referral under the current query */
			/* no prefetch-leeway, since its not the answer */
			iter_dns_store(qstate->env, &iq->response->qinfo,
				iq->response->rep, 1, 0, 0, NULL, 0,
				qstate->qstarttime, qstate->is_valrec);
…
		/* Reset the event state, setting the current delegation
		 * point to the referral. */
		iq->deleg_msg = iq->response;
		iq->dp = delegpt_from_message(iq->response, qstate->region,
			deleg_port_number(qstate->env));
…
		/* Count this as a referral. */
		iq->referral_count++;
		iq->sent_count = 0;
…
		return next_state(iq, QUERYTARGETS_STATE);
	} else if(type == RESPONSE_TYPE_CNAME) {
		uint8_t* sname = NULL;
		size_t snamelen = 0;
		/* CNAME type responses get a query restart (i.e., get a
		 * reset of the query state and go back to INIT_REQUEST_STATE).
		 */
		verbose(VERB_DETAIL, "query response was CNAME");
…
		/* set the current request's qname to the new value. */
		iq->qchase.qname = sname;
		iq->qchase.qname_len = snamelen;
…
		iq->query_restart_count++;
…
		/* go to INIT_REQUEST_STATE for new qname. */
		return next_state(iq, INIT_REQUEST_STATE);`,
		notes: [
			'Lines 9 to 11 store the referral in the cache. The next question under `org.` skips the root, because the `org.` NS records are already there.',
			'Lines 16 and 17 build the new delegation point from the NS records in the reply: for the second hop, the three `wikimedia.org` servers. Line 23 goes back to `QUERYTARGETS_STATE`, which picks one of them and sends the same question.',
			'Line 20 counts referrals. Elsewhere in the same file, a query with more than `MAX_REFERRAL_COUNT` (130) referrals fails with SERVFAIL, so a broken delegation loop cannot run forever.',
			'Lines 33 and 39 are RFC 1034 step 4c in code. Line 33 sets the name being chased to `dyna.wikimedia.org`, and line 39 starts the state machine again at `INIT_REQUEST_STATE`, cache lookup first.',
			'Unbound has `qname-minimisation` on by default: it sends each server only the labels that server needs. With it, the root sees a question about `org.` only, where `dig +trace` sent it the full `en.wikipedia.org`.'
		]
	},
	tradeoff: {
		gain: [
			'One recursive resolver caches for every client behind it. RFC 1034 lists this use: "a network where we want to concentrate the cache".',
			'The application needs only a stub: one address in `/etc/resolv.conf` and one question per lookup.'
		],
		cost: [
			'A cold lookup costs one round trip per zone level, plus one more walk for each CNAME target. In this trace the three hops after the root list took 111 ms, against 6 ms from the cache.',
			'When the resolver in `/etc/resolv.conf` stops answering, every lookup on the host fails, even for zones whose authoritative servers are fine.'
		]
	},
	task: {
		prompt: 'Here is the `dig +trace +nodnssec en.wikipedia.org A` output from this session, with the record lines shortened: `. 138582 NS a.root-servers.net.` (13 such lines, from 127.0.0.53), then `org. 172800 NS b0.org.afilias-nst.org.` (6 lines, from a.root-servers.net in 9 ms), then `wikipedia.org. 3600 NS ns0.wikimedia.org.` (3 lines, from b0.org.afilias-nst.org in 16 ms), then `en.wikipedia.org. 86400 CNAME dyna.wikimedia.org.` (from ns0.wikimedia.org in 86 ms). Which server is authoritative for `wikipedia.org`? How long may a resolver keep the `org.` delegation? What question does a recursive resolver ask next?',
		hint: 'Only the last server answered the question itself. The others sent referrals. A CNAME is an answer about the name, but it is not the A record curl asked for.',
		answer: [
			'`ns0.wikimedia.org` (with `ns1` and `ns2`) is authoritative for `wikipedia.org`: it answered from its zone, where the root and the `org.` server only sent referrals.',
			'The root sent the `org.` NS records with a TTL of 172800 s, so a resolver may keep them for 2 days. The `wikipedia.org.` NS records came with 3600 s, one hour.',
			'The trace stops at the CNAME because `dig +trace` prints each server\'s reply. A recursive resolver restarts with `dyna.wikimedia.org A`, beginning at its cache. It holds the addresses of `ns0.wikimedia.org` but no NS records for the zone `wikimedia.org.`. RFC 1034 step 2 walks up the name to the closest NS records it has, those of `org.`, so it asks an `org.` server first.',
			'The first block came from `127.0.0.53` because dig asks its configured server for the root NS list. The BIND docs: "If @server is also specified, it affects only the initial query for the root zone name servers."'
		],
		steps: [
			{
				title: 'Sort answers from referrals',
				questions: [
					{ q: 'How many `org.` servers did `a.root-servers.net` name in its referral?', options: ['6', '13', '3', '1'], answer: 0, why: 'The trace shows 6 `org. NS` lines from `a.root-servers.net`. The 13 lines before them are the root servers, from `127.0.0.53`.' },
					{ q: 'The `org.` referral names `ns0.wikimedia.org`, a name outside `wikipedia.org`. How does the resolver reach it without another lookup?', options: ['It first asks a root server for `ns0.wikimedia.org A`', 'The same referral carries the A and AAAA records of the three servers', 'It sends the question to `127.0.0.53`', 'It asks `b0.org.afilias-nst.org` a second question'], answer: 1, why: 'The `org.` reply holds the addresses of `ns0`, `ns1` and `ns2.wikimedia.org` next to the NS records, so the resolver goes straight to `ns0`.' },
					{ q: 'The two referrals took 9 and 16 ms, the final answer 86 ms. How long did the walk from the root take?', options: ['86 ms', '9 ms', 'About 111 ms', 'About 6 ms'], answer: 2, why: '9 + 16 + 86 = 111 ms. A resolver pays that once, then answers from its cache, like the 6 ms reply from `127.0.0.53`.' },
					{ q: 'Why did the first block come from `127.0.0.53`?', options: ['`127.0.0.53` is authoritative for the root zone', '`127.0.0.53` is a root server', 'dig asked it for the A record first', 'dig asks its configured server only for the list of root servers'], answer: 3, why: 'The BIND docs: "If @server is also specified, it affects only the initial query for the root zone name servers."' }
				]
			},
			{
				title: 'Name the authoritative server',
				questions: [
					{ q: 'Ten minutes later, the same resolver needs `fr.wikipedia.org A`. Which server does it ask?', options: ['One of `ns0`, `ns1` or `ns2.wikimedia.org`, from its cached NS records', 'A root server', 'An `org.` server', '`127.0.0.53`'], answer: 0, why: 'The `wikipedia.org.` NS records stay cached for 3600 s. Those servers are authoritative for every name in the zone, so the resolver skips the root and `org.`.' },
					{ q: 'Which flag marks an authoritative reply in `dig`?', options: ['`ra`', '`aa`', '`rd`', '`qr`'], answer: 1, why: '`aa` means the answer comes from the zone itself. `qr` only marks a response.' },
					{ q: 'Why is the `org.` server not authoritative for `wikipedia.org`?', options: ['It answered too slowly, in 16 ms', 'It does not know the name at all', 'It holds only the delegation, so it sends a referral', 'It serves IPv6 only'], answer: 2, why: 'The `org.` zone holds the NS records that delegate `wikipedia.org.`, not the records inside it.' },
					{ q: 'The reply from `127.0.0.53` has no `aa`. Why?', options: ['It forgot to set the flag', 'DNSSEC removed the flag', 'Only root servers set `aa`', 'It answered from its cache, not from a zone it holds'], answer: 3, why: '`aa` is set only by a server answering from its own zone data. `127.0.0.53` is a resolver that repeats what it has learned.' }
				]
			},
			{
				title: 'Read the TTLs',
				questions: [
					{ q: 'How long may a resolver keep the `org.` delegation?', options: ['172800 s, which is 2 days', '3600 s, one hour', '86400 s, one day', '138582 s'], answer: 0, why: 'The root sent the `org.` NS records with a TTL of 172800.' },
					{ q: 'And the `wikipedia.org.` NS records?', options: ['172800 s, like `org.`', '3600 s, one hour', '86400 s, like the CNAME', '16 ms, the reply time'], answer: 1, why: 'The `org.` server sent them with 3600. Each zone sets the TTL of the records it hands out.' },
					{ q: 'How long may a resolver keep the CNAME, with TTL 86400?', options: ['One hour', 'Two days', 'One day', '86 seconds'], answer: 2, why: '86400 s is 24 hours. The 86 in the trace is the reply time in milliseconds.' },
					{ q: 'Why is the root NS TTL 138582, not a round number?', options: ['Root records have random TTLs', 'dig rounds every TTL down', 'It is the zone serial number', 'It came from the cache of `127.0.0.53`, which counts the TTL down'], answer: 3, why: 'A cache keeps each record for its TTL and shows the time left, like the A record that dropped from 115 to 112.' }
				]
			},
			{
				title: 'Ask the next question',
				questions: [
					{ q: 'Why does the reply from `ns0.wikimedia.org` hold the CNAME and no A record?', options: ['`dyna.wikimedia.org` is in another zone, `wikimedia.org.`', 'The A record had expired', 'dig asked for CNAME records only', 'The A record went in the authority section'], answer: 0, why: 'An authoritative server answers from its own zone. The target of the CNAME lives in `wikimedia.org.`, so the reply stops at the alias.' },
					{ q: 'To answer the client, the resolver now needs the A record of `dyna.wikimedia.org`. Once it has it, what does it send back for `en.wikipedia.org A`?', options: ['Only the A record of `dyna.wikimedia.org`', 'The CNAME and the A record of `dyna.wikimedia.org`', 'Only the CNAME', 'A referral to the `wikimedia.org.` servers'], answer: 1, why: 'The resolver returns the whole chain: the CNAME, then the A record of its target. That is the two-record answer `dig en.wikipedia.org` printed from `127.0.0.53`.' },
					{ q: 'Where does the resolver look first?', options: ['At a root server, always', 'At `ns0.wikimedia.org`, whose address it holds', 'In its own cache', 'Back at the client'], answer: 2, why: 'Unbound goes back to `INIT_REQUEST_STATE`, which starts with a cache lookup.' },
					{ q: 'Which server does it ask first for `dyna.wikimedia.org`?', options: ['A root server, because the name changed', '`ns0.wikimedia.org`, because it holds its address', '`127.0.0.53`', 'An `org.` server: the closest NS records it has'], answer: 3, why: 'It holds the address of `ns0` but no NS records for `wikimedia.org.`. RFC 1034 step 2 walks up the name to the closest NS records in the cache, those of `org.`.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'A recursive resolver with an empty cache asks a root server for `en.wikipedia.org A`. What does the root server send back?',
			options: [
				'The A record, because root servers hold a copy of every zone',
				'A referral: NS records for the `org.` zone and no answer',
				'An NXDOMAIN, because the root zone has no `en.wikipedia.org`',
				'A SERVFAIL, because root servers refuse recursive queries'
			],
			answer: 1,
			why: 'A root server answers only from the root zone. It has no record for the name, but it has the delegation for `org.`, so it returns a referral to a server "closer" to the answer, as RFC 1034 says. The resolver then asks an `org.` server.'
		},
		{
			q: '`dig` prints `flags: qr rd ra` for an answer from `127.0.0.53`. What does `ra` tell you?',
			options: [
				'The answer came straight from an authoritative server',
				'The record has a TTL, so the resolver will cache it',
				'The server offers recursion, whatever the query asked for',
				'The answer was validated with DNSSEC by the resolver'
			],
			answer: 2,
			why: 'RFC 1034: the RA bit "is true if the name server is willing to provide recursive service for the client", and "RA signals availability rather than use". `rd` is the bit the client set. An authoritative answer would carry `aa`.'
		},
		{
			q: 'The authoritative server answers `en.wikipedia.org CNAME dyna.wikimedia.org` and nothing else. What does a recursive resolver do next?',
			options: [
				'Returns the CNAME alone, and the client must look up the target itself',
				'Asks the same server again with the RD bit set',
				'Asks the root again, because CNAME targets are never cached',
				'Caches the CNAME and restarts the lookup for `dyna.wikimedia.org`'
			],
			answer: 3,
			why: 'RFC 1034 step 4c: cache the CNAME, change the name to the canonical name and go back to step 1. Unbound does this in its CNAME branch with `next_state(iq, INIT_REQUEST_STATE)`. The client gets the CNAME and the A record in one reply.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Walk the delegation of `en.wikipedia.org` by hand with `dig`, one server at a time, the way a recursive resolver does.',
		steps: [
			'Ask a root server, with recursion off: `dig +norecurse @a.root-servers.net en.wikipedia.org A`. Read the `flags` line and the AUTHORITY section. If `dig` is missing, run every step inside `docker run --rm -it nicolaka/netshoot:v0.13`.',
			'Ask one of the `org.` servers it named: `dig +norecurse @b0.org.afilias-nst.org en.wikipedia.org A`.',
			'Ask a server it named for `wikipedia.org.`: `dig +norecurse @ns0.wikimedia.org en.wikipedia.org A`.',
			'Follow the CNAME the way a resolver would: `dig +norecurse @b0.org.afilias-nst.org dyna.wikimedia.org A`, then `dig +norecurse @ns0.wikimedia.org dyna.wikimedia.org A`.',
			'Compare with your own resolver, twice, a few seconds apart: `dig en.wikipedia.org`, then `sleep 3; dig en.wikipedia.org`.'
		],
		done: [
			'Steps 1 and 2 print `flags: qr` with `ANSWER: 0`, and NS records in the AUTHORITY section.',
			'Step 3 prints `flags: qr aa` and the CNAME to `dyna.wikimedia.org`, with a TTL of 86400.',
			'In step 4, the `org.` server refers you to the `wikimedia.org.` servers, and `ns0.wikimedia.org` answers the A record with `aa`.',
			'In step 5, the replies carry `flags: qr rd ra`, and the A record\'s TTL is a few seconds lower in the second reply, unless it ran out in between.'
		],
		solution: [
			'The root and `org.` servers hold only delegations, so they reply with referrals and no `aa`. `ns0.wikimedia.org` holds the zone and answers from it.',
			'The CNAME target is in another zone, `wikimedia.org.`, so a second walk starts. It skips the root, because the `org.` NS records are already known.',
			'Your resolver did this walk once and now answers from its cache, with the CNAME and the A record in one reply, counting the TTL down.'
		]
	},
	recall: {
		q: 'With an empty cache, which servers does a recursive resolver ask for `en.wikipedia.org`, and what does each one send back?',
		a: 'A root server sends a referral to the `org.` servers. An `org.` server sends a referral to `ns0`, `ns1` and `ns2.wikimedia.org`. `ns0.wikimedia.org` answers with the CNAME to `dyna.wikimedia.org`, and the resolver restarts for that name.'
	},
	sources: [
		{ title: 'RFC 1034, Domain Names: Concepts and Facilities', url: RFC1034 },
		{ title: 'Unbound source, iterator/iterator.c', url: ITER },
		{ title: 'unbound.conf(5), qname-minimisation', url: `${UNBOUND}/doc/unbound.conf.rst` },
		{ title: 'BIND 9.18 manual pages, dig', url: 'https://bind9.readthedocs.io/en/v9.18.39/manpages.html' }
	]
};
