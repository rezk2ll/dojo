const GO = 'https://github.com/golang/go/blob/c3a068eec992b5ae783abce1a9d03f617b671ea2/src/crypto';
const VERIFY = `${GO}/x509/verify.go`;
const CLIENT = `${GO}/tls/handshake_client.go`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'certificates',
	part: 'HTTP and TLS',
	title: 'Certificate chains',
	minutes: 10,
	hook: [
		'You run `curl https://incomplete-chain.badssl.com/` and get `curl: (60) SSL certificate problem: unable to get local issuer certificate`. A small Go client on the same machine fails too, with `x509: certificate signed by unknown authority`.',
		'`openssl s_client -showcerts` shows the cause. The server sends one certificate, `CN = *.badssl.com`, issued by `CN = YR1`. The host `badssl.com` sends three: the same leaf, then `YR1`, then `Root YR`. The client trusts `ISRG Root X1` from `/etc/ssl/certs`, but it has no copy of `YR1`, so it cannot get from the leaf to a root.',
		'The page can still open in your browser. The nginx docs explain: browsers "usually store intermediate certificates which they receive", so an active browser "may not complain about a certificate sent without a chained bundle".'
	],
	terms: [
		{ term: 'Leaf certificate', def: 'The certificate for the server itself, first in the list the server sends. It holds the host names and the server\'s public key.' },
		{ term: 'Intermediate certificate', def: 'A CA certificate that signs leaves and is itself signed by a root or another intermediate. The server must send it.' },
		{ term: 'Trust store', def: 'The root certificates the client already has on disk, for example the 122 certificates in `/etc/ssl/certs/ca-certificates.crt` on the machine used for this chapter.' },
		{ term: 'SAN', def: 'Subject Alternative Name: the list of DNS names and IP addresses a certificate is valid for. Clients match the host name against this list.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['c["Client: curl https://badssl.com/"] -->|"ClientHello, SNI badssl.com"| s["Server badssl.com:443"]'],
				highlight: ['c', 's'],
				note: 'The client puts the host name in the SNI extension of its ClientHello. The server uses it to pick the certificate for `badssl.com`.'
			},
			{
				add: ['s -->|"Certificate message"| list["0: *.badssl.com, issuer YR1<br/>1: YR1, issuer Root YR<br/>2: Root YR, issuer ISRG Root X1"]'],
				highlight: ['list'],
				note: 'RFC 8446: "The sender\'s certificate MUST come in the first CertificateEntry in the list. Each following certificate SHOULD directly certify the one immediately preceding it." The `openssl s_client -showcerts` output for `badssl.com` lists them in that order, numbered 0 to 2.'
			},
			{
				add: ['list --> leaf["Check the leaf: NotBefore, NotAfter, SAN"]'],
				highlight: ['leaf'],
				note: 'The leaf is valid from Sep 29 to Dec 28 2026, 90 days. Its SAN list is `DNS:*.badssl.com, DNS:badssl.com`, and the host `badssl.com` matches the second entry. With a clock past NotAfter, the check stops here with `certificate has expired`.'
			},
			{
				add: ['leaf -->|"signature checked with YR1 public key"| mid["YR1, then Root YR"]', 'mid -->|"signature checked with root public key"| root[("Trust store: ISRG Root X1")]'],
				highlight: ['mid', 'root'],
				note: 'For each certificate, the client looks for a parent whose subject equals the child\'s issuer, then checks the child\'s signature with the parent\'s public key. The walk ends at `ISRG Root X1`, which the server never sent. RFC 8446 says a certificate that specifies a trust anchor "MAY be omitted from the chain". Go reports this chain as 4 certificates long.'
			},
			{
				add: ['bad["incomplete-chain.badssl.com sends the leaf only"] -.->|"no certificate with subject YR1"| err["curl: (60) unable to get local issuer certificate"]'],
				highlight: ['bad', 'err'],
				note: 'Same leaf, no `YR1` after it. The trust store has no certificate with subject `YR1`, so the walk stops at depth 0. openssl prints `verify error:num=20:unable to get local issuer certificate`, and Go returns `x509: certificate signed by unknown authority`.'
			}
		]
	},
	example: {
		title: 'src/crypto/x509/verify.go: buildChains, from the leaf up to a root',
		repo: 'golang/go',
		url: `${VERIFY}#L731-L812`,
		lang: 'go',
		code: `func (c *Certificate) buildChains(currentChain []*Certificate, sigChecks *int, opts *VerifyOptions) (chains [][]*Certificate, err error) {
…
	considerCandidate := func(certType int, candidate potentialParent) {
…
		if candidate.cert.PublicKey == nil || alreadyInChain(candidate.cert, currentChain) {
			return
		}

		if err := c.CheckSignatureFrom(candidate.cert); err != nil {
			if hintErr == nil {
				hintErr = err
				hintCert = candidate.cert
			}
			return
		}

		err = candidate.cert.isValid(certType, currentChain, opts)
		if err != nil {
			if hintErr == nil {
				hintErr = err
				hintCert = candidate.cert
			}
			return
		}
…
		switch certType {
		case rootCertificate:
			chains = append(chains, appendToFreshChain(currentChain, candidate.cert))
		case intermediateCertificate:
			var childChains [][]*Certificate
			childChains, err = candidate.cert.buildChains(appendToFreshChain(currentChain, candidate.cert), sigChecks, opts)
			chains = append(chains, childChains...)
		}
	}

candidateLoop:
	for _, parents := range []struct {
		certType   int
		potentials []potentialParent
	}{
		{rootCertificate, opts.Roots.findPotentialParents(c)},
		{intermediateCertificate, opts.Intermediates.findPotentialParents(c)},
	} {
		for _, parent := range parents.potentials {
			considerCandidate(parents.certType, parent)
			if err == errSignatureLimit {
				break candidateLoop
			}
		}
	}

	if len(chains) > 0 {
		err = nil
	}
	if len(chains) == 0 && err == nil {
		err = UnknownAuthorityError{c, hintErr, hintCert}
	}

	return
}`,
		notes: [
			'Lines 41 and 42 list the possible parents of the current certificate: first in `opts.Roots`, the trust store, then in `opts.Intermediates`. In [`crypto/tls`](' + CLIENT + '#L1153-L1164), the client fills `Intermediates` with `certs[1:]`, every certificate the server sent after the leaf.',
			'Line 9 checks that the parent\'s public key verifies the child\'s signature. Line 17 calls `isValid`, which rejects the parent if its subject differs from the child\'s issuer, or if the current time is before `NotBefore` or after `NotAfter`.',
			'Line 28 closes a chain when the parent is a root. Line 31 calls `buildChains` again from an intermediate, so the walk climbs one level per call.',
			'Line 56 runs when no parent worked. Its error text is `x509: certificate signed by unknown authority`, the exact message the Go client printed for `incomplete-chain.badssl.com`.',
			'Before any of this, [`Verify`](' + VERIFY + '#L590-L600) checks the leaf\'s dates and calls `VerifyHostname`, which compares the host name with the SAN list. A wildcard matches one label only: Go rejects `wrong.host.badssl.com` with `x509: certificate is valid for *.badssl.com, badssl.com, not wrong.host.badssl.com`.'
		]
	},
	tradeoff: {
		gain: [
			'The client stores only roots: 122 files on the test machine. The server sends the intermediates, so a CA can issue from a new intermediate like `YR1` with no change on clients.',
			'A cross-signed certificate lets old clients reach an older root. `badssl.com` sends `Root YR` signed by `ISRG Root X1`, and Let\'s Encrypt used a cross-sign from `DST Root CA X3` "to make sure the certificates we issue are trusted on older devices".',
			'One leaf can serve several names: the SAN list `*.badssl.com, badssl.com` covers the apex and every name one label below it.'
		],
		cost: [
			'A server that forgets the intermediate breaks curl, Go and other clients, while a browser that cached the intermediate shows no error. Testing in a browser alone hides the bug.',
			'Every certificate in the chain has its own NotAfter. Before `DST Root CA X3` expired on September 30, 2021, Let\'s Encrypt wrote that devices without `ISRG Root X1` "will start getting certificate warnings".',
			'A wildcard covers one label: `*.badssl.com` does not cover `wrong.host.badssl.com`, so deeper names need their own SAN entries.'
		]
	},
	task: {
		prompt: 'Real `openssl s_client -connect expired.badssl.com:443` output from this session. The server sent 3 certificates. 0: `*.badssl.com`, NotAfter `Apr 12 23:59:59 2015 GMT`. 1: `COMODO RSA Domain Validation Secure Server CA`, NotAfter `Feb 11 23:59:59 2029 GMT`. 2: `COMODO RSA Certification Authority` issued by `AddTrust External CA Root`, NotAfter `May 30 10:48:38 2020 GMT`. The verify lines read `depth=2 ... CN = COMODO RSA Certification Authority`, then `depth=1 ... Domain Validation Secure Server CA`, then `depth=0 ... *.badssl.com` with `verify error:num=10:certificate has expired`. Two certificates have expired. Which one breaks verification, and why is the other one harmless?',
		hint: 'The `depth=` lines show the chain openssl built. This can differ from the list the server sent. Where did the certificate at depth 2 come from?',
		answer: [
			'The leaf at position 0 breaks it: NotAfter is Apr 12 23:59:59 2015, and openssl reports `num=10:certificate has expired` at `depth=0`. The fix is a new leaf certificate.',
			'Certificate 2 expired on May 30 2020, but openssl did not use it. At `depth=2`, openssl used the self-signed `COMODO RSA Certification Authority` from `/etc/ssl/certs/COMODO_RSA_Certification_Authority.pem`, valid until Jan 18 2038.',
			'The server sent a version of `COMODO RSA Certification Authority` signed by `AddTrust External CA Root`. The client found a root with the same subject in its trust store and stopped there, so the expired cross-sign never entered the chain.'
		],
		steps: [
			{
				title: 'Read what the server sent',
				questions: [
					{ q: 'Which certificate in the server list is the leaf?', options: ['Certificate 0, `*.badssl.com`', 'Certificate 2, `COMODO RSA Certification Authority`', 'Certificate 1, the Domain Validation CA', '`AddTrust External CA Root`, the last issuer named'], answer: 0, why: 'RFC 8446 says the sender\'s certificate MUST come first. Position 0 is the one that holds the host names.' },
					{ q: 'What is certificate 1, `COMODO RSA Domain Validation Secure Server CA`?', options: ['A root the client already has on disk', 'An intermediate between the leaf and a root', 'A second leaf for another host name', 'A copy of the leaf with newer dates'], answer: 1, why: 'Each following certificate should certify the one before it. Certificate 1 is the CA that signed the leaf, and the server must send it.' },
					{ q: 'Which two certificates in the list have a NotAfter in the past?', options: ['0 and 1', '1 and 2', '0 and 2', 'Only 2'], answer: 2, why: 'Certificate 0 ended on Apr 12 2015 and certificate 2 on May 30 2020. Certificate 1 is valid until Feb 11 2029.' },
					{ q: 'Certificate 2 is `COMODO RSA Certification Authority` issued by `AddTrust External CA Root`. What is it?', options: ['A cross-signed copy of a CA certificate', 'A self-signed root from the trust store', 'A leaf for the host `addtrust.com`', 'A second intermediate the leaf needs'], answer: 0, why: 'The same subject exists as a self-signed root. This copy is signed by an older root, which is what a cross-sign is.' }
				]
			},
			{
				title: 'Read the chain openssl built',
				questions: [
					{ q: 'What do the `depth=` lines show?', options: ['The order the server sent the certificates in', 'The chain openssl built, from the leaf at depth 0 upward', 'How many TLS records each certificate took', 'The certificates the client downloaded from the CA'], answer: 1, why: 'The `depth=` lines are the chain the client built. It can differ from the list the server sent.' },
					{ q: 'At `depth=2`, where did `COMODO RSA Certification Authority` come from?', options: ['Certificate 2 in the server list', 'A download from the CA during the handshake', 'The trust store, `/etc/ssl/certs/COMODO_RSA_Certification_Authority.pem`', 'A cache of intermediates seen on earlier visits'], answer: 2, why: 'openssl used the self-signed copy on disk, valid until Jan 18 2038, not the copy the server sent.' },
					{ q: 'How does a client pick the parent of a certificate?', options: ['It takes the next certificate in the server list, whatever it is', 'It finds one whose subject equals the child\'s issuer, then checks the signature', 'It picks the candidate with the latest NotAfter', 'It matches the host name against each candidate\'s SAN'], answer: 1, why: 'The parent\'s subject must equal the child\'s issuer, and the parent\'s public key must verify the child\'s signature.' },
					{ q: 'Which copy of `COMODO RSA Certification Authority` sits in the trust store?', options: ['A self-signed one, valid until Jan 18 2038', 'One signed by AddTrust, valid until May 30 2020', 'One signed by the Domain Validation CA', 'An unsigned one, since roots carry no signature'], answer: 0, why: 'The trust store holds roots, and a root signs itself. The AddTrust-signed copy came from the server.' }
				]
			},
			{
				title: 'Find what breaks it',
				questions: [
					{ q: 'At which depth does openssl report `num=10:certificate has expired`?', options: ['`depth=2`', '`depth=1`', '`depth=0`', 'At every depth'], answer: 2, why: 'The error line follows `depth=0 ... *.badssl.com`, the leaf.' },
					{ q: 'So which certificate breaks verification?', options: ['Certificate 2, the expired cross-sign', 'The leaf `*.badssl.com`, expired since Apr 12 2015', 'Certificate 1, the intermediate', '`AddTrust External CA Root`, the oldest one'], answer: 1, why: 'The only expiry error is at depth 0. The leaf\'s NotAfter is Apr 12 23:59:59 2015.' },
					{ q: 'Which check rejects an expired certificate?', options: ['The match of the host name against the SAN list', 'The signature check with the parent\'s public key', 'The comparison of NotBefore and NotAfter with the current time', 'The SNI check the server does on the ClientHello'], answer: 2, why: 'A clock past NotAfter fails the date check. The signature and the SAN can be fine and the certificate still fails.' },
					{ q: 'What fixes the error?', options: ['A new leaf certificate', 'Removing certificate 2 from the server list', 'Adding `AddTrust External CA Root` to the trust store', 'Turning off SNI in the client'], answer: 0, why: 'The leaf itself has expired. Nothing else in the chain can make an expired leaf valid.' }
				]
			},
			{
				title: 'Explain why the other is harmless',
				questions: [
					{ q: 'Did certificate 2 enter the chain openssl built?', options: ['Yes, at depth 2', 'Yes, at depth 3, above the root', 'No: the walk stopped at a root with the same subject', 'No: openssl reads only the first two certificates'], answer: 2, why: 'The client found `COMODO RSA Certification Authority` as a root in its trust store, so it never needed the server\'s copy.' },
					{ q: 'Why does the walk stop at `COMODO RSA Certification Authority`?', options: ['It is a root in the trust store, so the chain is closed', 'A chain may hold three certificates at most', 'openssl does not know `AddTrust External CA Root`', 'The server marked it as the last certificate'], answer: 0, why: 'A chain ends when the parent is a trusted root. Go\'s `buildChains` does the same: it closes the chain when the candidate is a root.' },
					{ q: 'The server stops sending certificate 2. Does this client\'s result change?', options: ['Yes, verification passes', 'No: the client never used it, and the leaf is still expired', 'Yes, verification now fails at depth 1', 'No, but the intermediate is now rejected'], answer: 1, why: 'Certificate 2 was not in the built chain, so removing it changes nothing. The leaf still fails.' },
					{ q: 'Which sentence sums up the task?', options: ['Two expired certificates means two separate fixes', 'An expired certificate anywhere in the server list fails the handshake', 'Expiry is checked on the leaf only, never on CA certificates', 'Only the chain the client builds is checked, and here the leaf in it has expired'], answer: 3, why: 'The client checks the certificates in the chain it built. The expired cross-sign was sent but never used.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'curl prints `unable to get local issuer certificate` for your API. Chrome on your laptop opens the same URL with no warning. What is the most likely cause?',
			options: [
				'The server sends the leaf without the intermediate certificate',
				'The SAN list of the certificate does not include the API host name',
				'The leaf has expired, and Chrome does not check expiry dates',
				'curl does not support the TLS 1.3 handshake the server uses'
			],
			answer: 0,
			why: 'The client must link the leaf to a root in its trust store. Without the intermediate, it finds no certificate with the leaf\'s issuer as subject. The nginx docs note that browsers store intermediates they have seen before, so they may not complain.'
		},
		{
			q: 'A certificate has the SAN list `*.badssl.com, badssl.com`. Which host name does Go\'s `VerifyHostname` accept?',
			options: [
				'`wrong.host.badssl.com`, as the wildcard covers any number of labels',
				'`www.badssl.com`, as the wildcard stands for exactly one label',
				'`badssl.com.example.org`, as the name starts with `badssl.com`',
				'None of them, as Go matches only the subject Common Name'
			],
			answer: 1,
			why: '`matchHostnames` splits the pattern and the host into labels and requires the same count. Only the first label may be `*`. `wrong.host.badssl.com` has 4 labels against 3 in the pattern, so Go rejects it.'
		},
		{
			q: 'The `badssl.com` server sends three certificates. Why is `ISRG Root X1`, the end of the chain, not among them?',
			options: [
				'The root is too large to fit in a single TLS record',
				'The client downloads the root from the CA during the handshake',
				'The client already has it, and RFC 8446 lets the server omit it',
				'Roots are only sent on connections that use HTTP/2'
			],
			answer: 2,
			why: 'A root is trusted only because it is already in the client\'s trust store. RFC 8446 says a certificate that specifies a trust anchor "MAY be omitted from the chain". Go\'s `buildChains` looks for roots in `opts.Roots`, the local pool.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Build a three-level chain on your laptop, serve it without and then with the intermediate, and watch the client fail and then pass.',
		steps: [
			'Make a folder and a root CA. You need OpenSSL 3 (on macOS, `brew install openssl`): `mkdir -p ~/chain-lab && cd ~/chain-lab`, then `openssl req -x509 -newkey rsa:2048 -nodes -keyout root.key -out root.pem -days 30 -subj "/CN=Lab Root"`.',
			'Make the intermediate and sign it with the root: `openssl req -newkey rsa:2048 -nodes -keyout mid.key -out mid.csr -subj "/CN=Lab Intermediate"`, then `printf "basicConstraints=critical,CA:TRUE\\nkeyUsage=critical,keyCertSign\\n" > ca.ext`, then `openssl x509 -req -in mid.csr -CA root.pem -CAkey root.key -CAcreateserial -out mid.pem -days 30 -extfile ca.ext`.',
			'Make the leaf for `localhost` and sign it with the intermediate: `openssl req -newkey rsa:2048 -nodes -keyout leaf.key -out leaf.csr -subj "/CN=localhost"`, then `printf "subjectAltName=DNS:localhost\\n" > leaf.ext`, then `openssl x509 -req -in leaf.csr -CA mid.pem -CAkey mid.key -CAcreateserial -out leaf.pem -days 30 -extfile leaf.ext`.',
			'Serve the leaf alone: `openssl s_server -accept 8443 -cert leaf.pem -key leaf.key -www -quiet`. In a second terminal, in the same folder, run `curl --cacert root.pem https://localhost:8443/` and `openssl s_client -connect localhost:8443 -CAfile root.pem </dev/null 2>&1 | grep -E "depth|verify error|Verify return"`.',
			'Stop the server with Ctrl+C and start it again with the intermediate: add `-cert_chain mid.pem` to the same command. Run the same two client commands, then `curl --cacert root.pem https://127.0.0.1:8443/`.'
		],
		done: [
			'With the leaf alone, curl fails with `(60) SSL certificate problem: unable to get local issuer certificate`, and s_client shows `verify error:num=20` at `depth=0`.',
			'With `-cert_chain mid.pem`, s_client shows `depth=2 CN = Lab Root`, `depth=1 CN = Lab Intermediate`, `depth=0 CN = localhost` and `Verify return code: 0 (ok)`, and curl prints the s_server page.',
			'`curl --cacert root.pem https://127.0.0.1:8443/` fails with `no alternative certificate subject name matches target host name \'127.0.0.1\'`.'
		],
		solution: [
			'The trust store in this lab is only `root.pem`. With the leaf alone, the client has no certificate whose subject is `Lab Intermediate`, so the walk stops at depth 0.',
			'`-cert_chain mid.pem` makes the server send the intermediate after the leaf. In nginx, the same fix is a `ssl_certificate` file built with `cat leaf.pem mid.pem > chained.pem`.',
			'The leaf\'s SAN list holds only `DNS:localhost`. The client matches the name it dialed against that list, so `127.0.0.1` fails even with a full chain.'
		]
	},
	recall: {
		q: 'curl says `unable to get local issuer certificate`. What is the client missing, and what goes in the file nginx\'s `ssl_certificate` points to?',
		a: 'The client cannot find the issuer of the leaf, usually an intermediate the server did not send. The file must hold the leaf first, then the intermediates: `cat www.example.com.crt bundle.crt > www.example.com.chained.crt`.'
	},
	sources: [
		{ title: 'RFC 5280, Internet X.509 PKI Certificate and CRL Profile (section 6.1, path validation)', url: 'https://www.rfc-editor.org/rfc/rfc5280' },
		{ title: 'RFC 8446, TLS 1.3, section 4.4.2 Certificate', url: 'https://www.rfc-editor.org/rfc/rfc8446#section-4.4.2' },
		{ title: 'nginx docs, Configuring HTTPS servers: SSL certificate chains', url: 'https://nginx.org/en/docs/http/configuring_https_servers.html' },
		{ title: 'Go source, src/crypto/x509/verify.go', url: VERIFY },
		{ title: 'Let\'s Encrypt, DST Root CA X3 Expiration (September 2021)', url: 'https://letsencrypt.org/docs/dst-root-ca-x3-expiration-september-2021/' },
		{ title: 'badssl.com, test hosts with broken certificates', url: 'https://badssl.com/' }
	]
};
