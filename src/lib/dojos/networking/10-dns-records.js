const K8S = 'https://github.com/kubernetes/k8s.io/blob/a68665345a355394efddec7243ed41448ec166cd';
const ZONE = `${K8S}/dns/zone-configs/kubernetes.io._0_base.yaml`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'dns-records',
	part: 'Names and addresses',
	title: 'DNS records',
	minutes: 10,
	hook: [
		'Take a small zone for `example.org` with its SOA and NS records, and add one line to point the bare domain at a hosting provider: `@ IN CNAME myapp.netlify.app.`. In this session, `named-checkzone` from BIND 9.20.29 refuses the whole zone: "CNAME and other data", then "not loaded due to errors".',
		'The name `@` is the zone apex, and it already holds the SOA and NS records. RFC 1034: "If a CNAME RR is present at a node, no other data should be present".',
		'The Kubernetes project serves `kubernetes.io` from Netlify too. Its zone file puts two A records at the apex, with the comment "Netlify high performance CDN", and makes `www` a CNAME to `kubernetes.io.`.'
	],
	terms: [
		{ term: 'Resource record', def: 'One line of DNS data: an owner name, a TTL, a class (`IN`), a type and the data. `www.kubernetes.io. 3600 IN CNAME kubernetes.io.` is one.' },
		{ term: 'Zone apex', def: 'The top name of a zone, written `@` in a zone file. It always holds the zone\'s SOA record and its NS records.' },
		{ term: 'CNAME', def: 'A record that makes its owner name an alias of another name, the canonical name. A name with a CNAME may hold no other record, apart from DNSSEC records.' },
		{ term: 'MX', def: 'Mail exchange: a preference number and the name of a host that accepts mail for the owner name. Senders try the lowest preference value first.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['res["Resolver"] -->|"www.kubernetes.io A?"| ns["kubernetes.io servers (Google Cloud DNS)"]', 'ns -.->|"CNAME kubernetes.io. + 2 A"| res'],
				highlight: ['ns'],
				note: 'In this session, `dig www.kubernetes.io A` returned `www.kubernetes.io. 3600 IN CNAME kubernetes.io.` followed by two A records for `kubernetes.io`. Both names are in the same zone, so the server adds the A records itself. RFC 1034 shows the same case: "Both of these RRs would be returned in the response to the type A query".'
			},
			{
				add: ['res -->|"kubernetes.io AAAA?"| ns', 'ns -.->|"no AAAA record"| res'],
				highlight: ['ns'],
				note: 'An AAAA record holds one IPv6 address, 128 bits (RFC 3596), where an A record holds 32 bits of IPv4. In this session `dig kubernetes.io AAAA` returned an empty answer: the zone gives the apex IPv4 addresses only. `dyna.wikimedia.org` from chapter 09 has both, with the AAAA `2a02:ec80:600:ed1a::1`.'
			},
			{
				add: ['res -->|"kubernetes.io MX?"| ns', 'ns -.->|"MX 1 aspmx.l.google.com. ... MX 10 alt4..."| res'],
				highlight: ['res'],
				note: 'A mail server sending to `@kubernetes.io` asks for MX records and gets five. RFC 1035: "Lower values are preferred", so it tries `aspmx.l.google.com` (preference 1) first, then the two hosts with 5, then the two with 10.'
			},
			{
				add: ['res -->|"kubernetes.io TXT?"| ns', 'ns -.->|"v=spf1 include:_spf.google.com ...; site verification tokens"| res'],
				highlight: ['res'],
				note: 'TXT records hold strings. RFC 1035: "The semantics of the text depends on the domain where it is found." At the `kubernetes.io` apex, one string starts with `v=spf1` and lists who may send its mail, and others prove ownership of the domain to Google and 1Password.'
			},
			{
				add: ['res -->|"kubernetes.io SOA? NS?"| ns', 'ns -.->|"SOA ns-cloud-a1.googledomains.com. + 4 NS"| res', 'ns --> rule["Apex holds SOA and NS: a CNAME here is refused"]'],
				highlight: ['rule'],
				note: 'The apex answers with an SOA and four NS records, `ns-cloud-a1` to `a4.googledomains.com`. RFC 2181 allows a name either one CNAME or other records, never both. So the apex cannot be a CNAME, and the zone stores the provider\'s A records there.'
			}
		]
	},
	example: {
		title: 'dns/zone-configs/kubernetes.io._0_base.yaml: the kubernetes.io zone',
		repo: 'kubernetes/k8s.io',
		url: `${ZONE}#L1-L69`,
		lang: 'yaml',
		code: `# The top-level kubernetes.io zone
#
# In general, every name here has an equivalent in k8s.io.  For many of these
# we redirect from foo.kubernetes.io to foo.k8s.io, which is where the
# documentation for each name is attached.
'':
  - type: A
    values:
    - 15.197.167.90 # Netlify high performance CDN (@bentheelder)
    - 3.33.186.135  # Netlify high performance CDN (@bentheelder)
  - type: MX
    values:
    - exchange: aspmx.l.google.com.
      preference: 1
    - exchange: alt1.aspmx.l.google.com.
      preference: 5
    - exchange: alt2.aspmx.l.google.com.
      preference: 5
    - exchange: alt3.aspmx.l.google.com.
      preference: 10
    - exchange: alt4.aspmx.l.google.com.
      preference: 10
…
  - type: TXT
    values:
…
    - v=spf1 include:_spf.google.com mail.kubernetes.io ~all
…
www:
  type: CNAME
  value: kubernetes.io.

# Main docs site is a redirect (@chenopis)
docs:
  type: CNAME
  value: docs.k8s.io.
# All docs subdomains get sent to netlify (@chenopis)
'*.docs':
  type: CNAME
  value: kubernetes.netlify.app.`,
		notes: [
			'The file is an octoDNS config, and the repo\'s DNS README says the key `\'\'` stands "for the top-level domain": the apex. Lines 7 to 10 give the apex two A records with Netlify addresses, where a subdomain could have used a CNAME to Netlify.',
			'Lines 11 to 22 are the five MX records. Line 14 gives `aspmx.l.google.com.` the preference 1, the lowest, so senders try it first.',
			'Line 27 is one string of the apex TXT record set: an SPF policy that starts with `v=spf1`. The other values on the same name, cut here, are verification tokens.',
			'Lines 29 to 31 make `www` an alias of the apex. When the Netlify addresses on lines 9 and 10 change, only those lines need an edit. Lines 34 to 36 alias `docs` to a name in another zone, `docs.k8s.io.`, and a resolver must restart the lookup there.'
		]
	},
	tradeoff: {
		gain: [
			'A CNAME keeps one copy of the data: `www`, `docs` and dozens of vanity names in this file follow their target with no edit.',
			'A resolver can cache a CNAME and reuse it for every record type, because the alias holds nothing else. RFC 1034 gives this as one reason for the rule.'
		],
		cost: [
			'An alias to another zone costs a second lookup, as `en.wikipedia.org` to `dyna.wikimedia.org` did in chapter 09.',
			'The apex cannot be an alias, so `kubernetes.io` copies two Netlify A records into its zone and must change them if Netlify does.',
			'MX and NS targets must not be aliases. RFC 2181: they "must not be an alias", and BIND flags it as "(illegal)".'
		]
	},
	task: {
		prompt: 'Find what is wrong in this zone for `example.org`, then check your answer against `named-checkzone`. Line 1: `$TTL 3600`. Line 2: `@ IN SOA ns1.example.org. hostmaster.example.org. 1 7200 3600 1209600 300`. Line 3: `@ IN NS ns1.example.org.`. Line 4: `@ IN A 192.0.2.10`. Line 5: `@ IN MX 10 mail.example.org.`. Line 6: `ns1 IN A 192.0.2.53`. Line 7: `mail IN CNAME mx.mailhost.example.`. Line 8: `www IN CNAME example.org.`. Line 9: `blog IN CNAME example.ghost.io.`. Line 10: `blog IN TXT "v=spf1 -all"`.',
		hint: 'Check each name that has a CNAME: does the same name hold anything else? Then check where the MX record points.',
		answer: [
			'Lines 9 and 10 give `blog` both a CNAME and a TXT record. BIND 9.20.29 in this session: `dns_master_load: /z/task.zone:10: blog.example.org: CNAME and other data`, then `zone example.org/IN: not loaded due to errors.` The whole zone stays down, the apex and `www` included.',
			'With line 10 removed, the zone loads, with a warning: `example.org/MX \'mail.example.org\' is a CNAME (illegal)`. Line 5 points the MX at `mail`, which line 7 makes an alias. RFC 2181 says an MX value "must not be an alias". Point the MX at `mx.mailhost.example.` directly.',
			'Line 8 is fine: `www` holds only a CNAME, and its target `example.org` has its own A record on line 4. Line 4 is the right way to give the apex an address.'
		]
	},
	quiz: [
		{
			q: 'Why does the `kubernetes.io` zone put A records at the apex instead of a CNAME to its Netlify site?',
			options: [
				'A CNAME at the apex would add a lookup, and the apex must answer in one',
				'Google Cloud DNS does not support the CNAME type in any zone',
				'The apex holds the SOA and NS records, and a CNAME allows no other data',
				'Netlify asks for A records so that its CDN can see the client IP'
			],
			answer: 2,
			why: 'RFC 1034 and RFC 2181 allow a name either one CNAME or other records. Every zone apex has an SOA and NS records, so a CNAME there breaks the rule, and BIND refuses the zone with "CNAME and other data".'
		},
		{
			q: 'A domain has `MX 10 mx-b.example.net.`, `MX 1 mx-a.example.net.` and `MX 5 mx-c.example.net.`. Which host does a sender try first?',
			options: [
				'`mx-a`, because preference 1 is the lowest value',
				'`mx-b`, because preference 10 is the highest value',
				'`mx-b`, because it is the first record in the zone file',
				'Any of the three, chosen at random for load balancing'
			],
			answer: 0,
			why: 'RFC 1035 defines PREFERENCE as a 16-bit number where "Lower values are preferred". The order of lines in the zone file does not matter.'
		},
		{
			q: 'A resolver asks the `kubernetes.io` servers for `www.kubernetes.io A`. What does the answer section hold?',
			options: [
				'Only the CNAME, and the resolver sends a second query for `kubernetes.io`',
				'The CNAME to `kubernetes.io.` and the A records of `kubernetes.io`',
				'Only the A records, because the server hides the alias',
				'An empty answer, because `www` has no A record of its own'
			],
			answer: 1,
			why: 'When a name holds a CNAME, the server includes it and restarts the query at the target. `kubernetes.io` is in the same zone, so the server adds its A records to the same answer, as `dig` showed in this session.'
		}
	],
	recall: {
		q: 'Which records does every zone apex hold, and what does that mean for a CNAME on the bare domain?',
		a: 'The SOA record and the NS records. A name with a CNAME may hold no other data, so `@ IN CNAME ...` is refused: BIND reports "CNAME and other data", and `kubernetes.io` uses A records instead.'
	},
	sources: [
		{ title: 'RFC 1034, section 3.6.2, Aliases and canonical names', url: 'https://www.rfc-editor.org/rfc/rfc1034' },
		{ title: 'RFC 1035, Domain Names: Implementation and Specification', url: 'https://www.rfc-editor.org/rfc/rfc1035' },
		{ title: 'RFC 2181, Clarifications to the DNS Specification (CNAME, MX and NS)', url: 'https://www.rfc-editor.org/rfc/rfc2181' },
		{ title: 'RFC 3596, DNS Extensions to Support IPv6 (AAAA)', url: 'https://www.rfc-editor.org/rfc/rfc3596' },
		{ title: 'kubernetes/k8s.io, kubernetes.io zone config', url: ZONE },
		{ title: 'kubernetes/k8s.io, DNS README', url: `${K8S}/dns/README.md` }
	]
};
