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
