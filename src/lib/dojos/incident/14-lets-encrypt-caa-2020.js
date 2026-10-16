const PM = 'https://community.letsencrypt.org/t/2020-02-29-caa-rechecking-bug/114591';
const BZ = 'https://bugzilla.mozilla.org/show_bug.cgi?id=1619047';
const BZ2 = 'https://bugzilla.mozilla.org/show_bug.cgi?id=1619179';
const FAQ = 'https://community.letsencrypt.org/t/revoking-certain-certificates-on-march-4/114864';
const GO = 'https://go.dev/doc/go1.22';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'lets-encrypt-caa-2020',
	part: 'Data',
	title: 'Let\'s Encrypt 2020: the CAA recheck that checked one name',
	minutes: 10,
	hook: [
		'18 February 2020. A user posts on the Let\'s Encrypt community forum: a certificate request for many domain names failed on a CAA recheck, and the error holds 99 identical subproblems for one hostname.',
		'Let\'s Encrypt runs Boulder, its open-source certificate authority software. When Boulder validates control of a domain, it also checks the domain\'s CAA records. A validation stays good for 30 days, but the rules require a CAA check within 8 hours before issuance, so an older validation needs a recheck.',
		'Another forum member suggests a worse reading of the 99 identical errors: maybe some CAA records are not checked at all.'
	],
	terms: [
		{ term: 'CAA record', def: 'A DNS record where a domain owner lists the certificate authorities allowed to issue certificates for that domain.' },
		{ term: 'Authorization', def: 'Boulder\'s record that an account proved control of one domain name. Let\'s Encrypt reuses it for 30 days.' },
		{ term: 'Baseline Requirements (BRs)', def: 'The rules every publicly trusted certificate authority must follow, including when to check CAA and how fast to revoke.' },
		{ term: 'Revocation', def: 'The certificate authority marks a certificate as no longer valid before it expires. Clients that check revocation then refuse it.' }
	],
	incident: {
		org: 'Let\'s Encrypt',
		title: '2020.02.29 CAA Rechecking Bug',
		date: '2020-02-29',
		url: PM,
		steps: [
			{
				situation: [
					'18 February. The forum report shows one hostname with 99 identical error messages after a CAA recheck. One member thinks some CAA records may be skipped.'
				],
				q: 'What do you do with the report?',
				options: [
					'Request several names that need a recheck and log which ones get queried',
					'Fix the error formatting so each hostname appears once in the response',
					'Close it: a CAA failure comes from the subscriber\'s own DNS setup',
					'Halt all issuance until someone has read every line of the CAA code'
				],
				answer: 0,
				why: 'The team "checked the logs, confirmed that CAA was checked, and concluded the bug was not in the CAA checking itself but in the error message generation". They filed it at regular priority for the next sprint. The real bug was found 11 days later, on 29 February, "while working on a fix for the bug".'
			},
			{
				situation: [
					'29 February, 03:08 UTC. An engineer confirms it: when a request has N domain names that need a CAA recheck, Boulder picks one name and checks it N times. The other names are not rechecked.',
					'A name that allowed Let\'s Encrypt when validated can get certificates for 30 days, even if its owner adds a CAA record that forbids Let\'s Encrypt.'
				],
				q: 'What do you do first?',
				options: [
					'Disable issuance until a fixed Boulder is deployed',
					'Keep issuing and ship a fix in the next deploy',
					'Revoke every certificate issued since the last deploy',
					'Email every subscriber with a multi-name certificate'
				],
				answer: 0,
				why: 'Every new multi-name certificate with old validations could skip a CAA check, so each minute of issuance adds to the problem. The SRE team disabled issuance at 03:10, two minutes after the bug was confirmed. A fixed Boulder went out at 05:22 UTC, and issuance resumed.'
			},
			{
				situation: [
					'3 March. The team counts the affected certificates that are still valid: 3,048,289, out of about 116 million active, issued between 4 December 2019 and 29 February 2020.',
					'The BRs require revoking them. The deadline is 5 March, 03:00 UTC. Of the hostnames involved, 443 have CAA records that now reject Let\'s Encrypt.'
				],
				q: 'What do you do before the deadline?',
				options: [
					'Email the subscribers and publish the serials and a checker so they renew early',
					'Revoke all 3 million certificates today, before anyone can renew',
					'Revoke only the certificates for the 443 hostnames and close the incident',
					'Wait for the deadline, then revoke everything in one batch'
				],
				answer: 0,
				why: 'A certificate revoked before it is replaced breaks the site that uses it. The team emailed affected subscribers, posted a FAQ, and published the affected serial numbers at letsencrypt.org/caaproblem, with a link to an online checker. They also raised the duplicate certificate limit so fewer renewals would hit it.'
			},
			{
				situation: [
					'4 March, evening. More than 1.7 million affected certificates were replaced in under 48 hours. More than 1 million will likely not be replaced by the deadline.',
					'On 2 March Let\'s Encrypt asked the root programs, Mozilla among them, for an exemption. Mozilla answered that it "does not grant exceptions to the BR revocation requirements" and that the CA decides, and is responsible.'
				],
				q: 'What do you revoke at the deadline?',
				options: [
					'The replaced ones and those CAA now forbids; report the rest',
					'All 3 million: the rules leave no choice once Mozilla refused',
					'None: the risk is small and the certificates expire within 90 days',
					'The replaced ones only, and say nothing about the other million'
				],
				answer: 0,
				why: 'Let\'s Encrypt revoked 1,706,505 replaced certificates and 445 highest-priority ones whose CAA records forbade Let\'s Encrypt. For the rest: "Rather than potentially break so many sites and cause concern for their visitors, we have determined that it is in the best interest of the health of the Internet for us to not revoke those certificates by the deadline." The decision is tracked in Bugzilla bug 1619179.'
			},
			{
				situation: [
					'The bug was committed with a unit test, `TestGetValidOrderAuthorizations2`, that runs the broken code with several authorizations. An integration test also covers CAA rechecking. Both passed for months.'
				],
				q: 'Which test change would have caught this bug?',
				options: [
					'Request several names in the integration test and check every returned authorization',
					'Run the existing tests against a copy of the production database',
					'Raise the coverage threshold for the code that converts authorizations',
					'Add a load test that issues thousands of certificates per minute'
				],
				answer: 0,
				why: 'The unit test checked "only that there were the correct number" of authorizations, not their contents. The integration test "requests a certificate with only one FQDN in it", and the bug needs two or more. The team updated it and confirmed it "catches the bug on earlier versions of Boulder."'
			}
		],
		outcome: [
			'The cause was "a common mistake in Go: taking a reference to a loop iterator variable." In `authz2ModelMapToPB`, a `for k, v := range m` loop passed `&v` to `modelToAuthzPB`, which kept a pointer to `am.IdentifierValue`. Before Go 1.22, `v` was one variable reused by every iteration, so every authorization ended up pointing at the same domain name.',
			'The map keys still held the right names, so boulder-ra, the component that checks authorizations before issuance, saw every name present. But it took the name to recheck from the `Identifier` field, which was the same in every entry. The code was committed on 24 April 2019 behind a feature flag, and the flag was turned on in production on 23 August 2019.',
			'Of the 3,048,289 affected certificates, about 1 million were duplicates covering the same names. The certificates hit most often were the ones that are reissued very frequently.',
			'The fixes: a stronger `TestGetValidOrderAuthorizations2`, a new unit test for `modelToAuthzPB`, a review for other loop variable bugs (none found), the gosec linter, a move to proto3, and an automated check of the logs for CAA behavior. Gosec would have caught this variant of the mistake. The log check stopped issuance once during its rollout, when cross-datacenter log forwarding filled a message queue.'
		]
	},
	quiz: [
		{
			q: 'In Go before 1.22, why did `&v` inside `for k, v := range m` make every entry share one domain name?',
			options: [
				'The loop reuses one `v` variable, so every pointer points at it and sees the last value',
				'Go maps return keys in random order, so the names were shuffled between entries',
				'Taking `&v` copies the struct, and the copy is freed at the end of each iteration',
				'The RPC layer deduplicates identical structs before sending the map to boulder-ra'
			],
			answer: 0,
			why: 'The Go 1.22 release notes: "Previously, the variables declared by a “for” loop were created once and updated by each iteration." A pointer kept after the iteration sees later values. Go 1.22 creates new variables for each iteration.'
		},
		{
			q: 'Which certificate request triggered the bug?',
			options: [
				'One with 2 or more names whose validations were more than 8 hours old',
				'One with a single name validated within the last 8 hours',
				'One with any name that has no CAA record at all',
				'One for a wildcard name such as `*.example.com`'
			],
			answer: 0,
			why: 'Names validated in the last 8 hours do not need a recheck. With N names to recheck, Boulder checked one name N times, so the bug needs at least two. Certificates that are reissued very often were the most affected.'
		},
		{
			q: 'Why did the unit test committed with the bug pass?',
			options: [
				'It checked how many authorizations came back, not which domain each one held',
				'It ran with the feature flag off, so the broken code never executed',
				'It used a mock DNS server that returned no CAA records for any name',
				'It requested a single domain name, so there was nothing to mix up'
			],
			answer: 0,
			why: 'The test created and read back an order with several authorizations, so it did run the broken path. It verified "only that there were the correct number". The single-name problem was in the separate integration test.'
		}
	],
	recall: {
		q: 'What Go mistake caused the Let\'s Encrypt CAA rechecking bug, and how many valid certificates did it affect?',
		a: 'A reference to the loop variable `v` in `for k, v := range m`, so every authorization held the same domain name. It affected 3,048,289 certificates.'
	},
	sources: [
		{ title: 'Let\'s Encrypt community: 2020.02.29 CAA Rechecking Bug', url: PM },
		{ title: 'Bugzilla 1619047: Let\'s Encrypt: CAA Rechecking bug (incident report)', url: BZ },
		{ title: 'Bugzilla 1619179: Let\'s Encrypt: Incomplete revocation for CAA rechecking bug', url: BZ2 },
		{ title: 'Let\'s Encrypt community: Revoking certain certificates on March 4', url: FAQ },
		{ title: 'Go 1.22 release notes: changes to the language', url: GO }
	]
};
