const REQ = 'https://github.com/psf/requests/blob/611c6162cbc4ac2020a2f91c7cfa4f3abf9bbb60';
const URLLIB3 = 'https://github.com/urllib3/urllib3/blob/a37bc93b65d6bcf00d3dc43d966bab6bd130ecd8';
const GHSA = 'https://github.com/advisories/GHSA-9wx4-h78v-vm56';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'tls',
	part: 'Secrets and supply chain',
	title: 'TLS in one handshake',
	minutes: 10,
	hook: [
		'On 20 May 2024, GitHub published [GHSA-9wx4-h78v-vm56](' + GHSA + ') (CVE-2024-35195) for the Python library requests: "if the first request to a given origin is made with `verify=False`, TLS certificate verification may remain disabled for all subsequent requests to that origin, even if `verify=True` is explicitly specified later."',
		'The cause was the connection pool. A `Session` reused the connection opened by the first call, and that connection had been opened with no certificate check. Every version before 2.32.0 was affected. The fix adds a test that calls `https://invalid.badssl.com` once with `verify=False`, then expects an `SSLError` on the next call.'
	],
	terms: [
		{ term: 'Certificate chain', def: 'The list the server sends in its `Certificate` message: its own certificate first, then each CA certificate that signed the one before it.' },
		{ term: 'CA store', def: 'The file or folder of root CA certificates a client trusts. requests uses the bundle from the `certifi` package; curl uses one chosen at build time.' },
		{ term: 'CertificateVerify', def: 'A handshake message where the server signs the whole handshake so far with the private key that matches the certificate it just sent.' },
		{ term: 'Hostname check', def: 'The client compares the name in the URL with the DNS names in the certificate\'s Subject Alternative Name. A valid chain for `*.badssl.com` fails it on `github.com`.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['ch["ClientHello + key_share"] --> sh["ServerHello + key_share"]', 'sh --> keys["Both sides derive the handshake keys"]'],
				highlight: ['ch', 'sh', 'keys'],
				note: 'The client sends its Diffie-Hellman share in `key_share`, and the server answers with its own. RFC 8446: "Everything after this phase is encrypted." At this point the client has a secret shared with someone, and it does not know with whom yet.'
			},
			{
				add: ['keys --> cert["{Certificate}: github.com, then Sectigo CA DV E36, then Sectigo Root E46"]', 'cert --> cv["{CertificateVerify}: signature over the handshake"]', 'cv --> fin["{Finished}: MAC over the handshake"]'],
				highlight: ['cert', 'cv', 'fin'],
				note: 'For `github.com:443` on 17 October 2026, `openssl s_client` showed a chain of 3: the leaf, the intermediate `Sectigo Public Server Authentication CA DV E36`, and its root. `CertificateVerify` proves that the server holds the private key for the leaf it sent. `Finished` is a MAC that detects any change to the earlier messages.'
			},
			{
				add: ['fin --> check["Client: chain ends at a CA in its store, name matches, dates valid"]', 'check -->|"Verify return code: 0 (ok)"| app["[Application Data]"]'],
				highlight: ['check', 'app'],
				note: 'RFC 8446 leaves this part out: "detailed certificate validation procedures are out of scope for TLS (see [RFC5280])". The client does it. curl\'s docs: it verifies "the signature and making sure the certificate was crafted for the server name provided in the URL".'
			},
			{
				add: ['mitm["A machine on the path answers with its own self-signed cert and key"] --> cv', 'mitm -->|"verify=False: CERT_NONE"| app'],
				highlight: ['mitm'],
				note: 'An attacker on the network can run the same handshake with its own certificate. Its `CertificateVerify` is valid, because it signs with its own key. Only the chain check stops it: against `self-signed.badssl.com`, OpenSSL reports `Verify return code: 18 (self-signed certificate)`. With `verify=False` the client skips that check and sends its data to the attacker, encrypted.'
			},
			{
				add: ['ca["verify=\'/etc/ssl/internal-ca.pem\' or REQUESTS_CA_BUNDLE"] --> check'],
				highlight: ['ca'],
				note: 'When a server uses a certificate from a private CA, give the client that CA instead of turning the check off. requests accepts a path in `verify` or in `REQUESTS_CA_BUNDLE`, and curl takes `--cacert`. The chain check and the hostname check stay on.'
			}
		]
	},
	example: {
		title: 'src/requests/adapters.py: from the verify argument to urllib3 settings',
		repo: 'psf/requests',
		url: `${REQ}/src/requests/adapters.py#L85-L119`,
		lang: 'python',
		code: `def _urllib3_request_context(
    request: PreparedRequest,
    verify: bool | str | None,
    client_cert: tuple[str, str] | str | None,
    poolmanager: PoolManager,
) -> tuple[dict[str, Any], dict[str, Any]]:
    host_params: dict[str, Any] = {}
    pool_kwargs: dict[str, Any] = {}
    parsed_request_url = urlparse(request.url)
    scheme = parsed_request_url.scheme.lower()
    port = parsed_request_url.port

    cert_reqs = "CERT_REQUIRED"
    if verify is False:
        cert_reqs = "CERT_NONE"
    elif isinstance(verify, str):
        if not os.path.isdir(verify):
            pool_kwargs["ca_certs"] = verify
        else:
            pool_kwargs["ca_cert_dir"] = verify
    pool_kwargs["cert_reqs"] = cert_reqs
    if client_cert is not None:
        if isinstance(client_cert, tuple) and len(client_cert) == 2:
            pool_kwargs["cert_file"] = client_cert[0]
            pool_kwargs["key_file"] = client_cert[1]
        else:
            # According to our docs, we allow users to specify just the client
            # cert path
            pool_kwargs["cert_file"] = client_cert
    host_params = {
        "scheme": scheme,
        "host": parsed_request_url.hostname,
        "port": port,
    }
    return host_params, pool_kwargs`,
		notes: [
			'Line 13 starts every request at `CERT_REQUIRED`. Only `verify is False` on line 14 switches to `CERT_NONE`. The requests docs: with `False`, requests "will accept any TLS certificate presented by the server, and will ignore hostname mismatches and/or expired certificates".',
			'Lines 16 to 20 handle a string: a file goes to `ca_certs`, a folder to `ca_cert_dir`. You use this branch to trust a private CA. With `verify=True`, requests falls back to `DEFAULT_CA_BUNDLE_PATH`, which is `certs.where()` from certifi.',
			'Line 21 puts `cert_reqs` into `pool_kwargs`. urllib3 builds its pool key from these values, and [`PoolKey`](' + URLLIB3 + '/src/urllib3/poolmanager.py#L58-L82) has a `key_cert_reqs` field. Since 2.32.0, the fix for CVE-2024-35195, a `CERT_NONE` connection lives in its own pool.',
			'Before the fix, `send()` called `get_connection(request.url, proxies)`, which picked the pool from the URL alone. A connection opened with `CERT_NONE` stayed in the pool for that origin and served later calls made with `verify=True`.'
		]
	},
	tradeoff: {
		gain: [
			'With the chain and hostname checks on, a machine on the path cannot pose as `github.com`: it would need a certificate for that name signed by a CA in the client\'s store.',
			'TLS 1.3 encrypts the server\'s `Certificate` message, so a passive observer of the handshake does not see which certificate the server sent.',
			'Pointing `verify` at a private CA file keeps both checks on for internal services, with no change to the server.'
		],
		cost: [
			'The client trusts every CA in its store. A certificate wrongly issued by any one of them passes the chain check.',
			'The CA store goes stale: an old `certifi` or base image misses newer roots, and connections fail with `CERTIFICATE_VERIFY_FAILED` until you update it.',
			'`verify=False` raises no error. It only emits urllib3\'s `InsecureRequestWarning`, and one call to `urllib3.disable_warnings()` hides that too.'
		]
	},
	task: {
		prompt: 'In a terminal, run `echo | openssl s_client -connect self-signed.badssl.com:443 -servername self-signed.badssl.com` and then the same for `wrong.host.badssl.com`. Note the `Verify return code` of each. Then run the second one again with `-verify_hostname wrong.host.badssl.com`. Explain the three results, and say which one `requests.get(url)` would reject.',
		hint: 'Look at the `s:` (subject) and `i:` (issuer) lines of certificate 0. And check what `s_client` compares when you do not pass `-verify_hostname`.',
		answer: [
			'`self-signed.badssl.com`: `Verify return code: 18 (self-signed certificate)`. Certificate 0 has the same subject and issuer, `CN = *.badssl.com`, and no CA in the store signed it.',
			'`wrong.host.badssl.com` without the flag: `Verify return code: 0 (ok)`. The chain goes up to `ISRG Root YR`, a root in the store. `s_client` checks the chain but not the name unless you ask.',
			'With `-verify_hostname wrong.host.badssl.com`: `Verify return code: 62 (hostname mismatch)`. The certificate names `*.badssl.com`, and RFC 9525: "A wildcard in a presented identifier can only match one label". `wrong.host` is two labels.',
			'`requests.get` rejects both hosts with `SSLError`, because urllib3 checks the chain and the hostname. A tool that checks only the chain, like `s_client` without the flag, would accept the second one.'
		],
		steps: [
			{
				title: 'Read the self-signed result',
				questions: [
					{ q: 'Which `Verify return code` does `self-signed.badssl.com` give?', options: ['`0 (ok)`', '`62 (hostname mismatch)`', '`18 (self-signed certificate)`', '`10 (certificate has expired)`'], answer: 2, why: 'OpenSSL reports `Verify return code: 18 (self-signed certificate)` for this host.' },
					{ q: 'What do the `s:` and `i:` lines of certificate 0 show?', options: ['The same name, `CN = *.badssl.com`', 'A subject and a different CA', 'No issuer at all', 'Two different hostnames'], answer: 0, why: 'The subject and the issuer are the same: the certificate signed itself.' },
					{ q: 'You add this exact certificate to the client’s store and run `s_client` again. What changes?', options: ['Nothing: a self-signed certificate never passes', 'The chain check passes: the chain now ends at a certificate in the store', 'Only TLS 1.2 connections pass', 'The name check now fails instead'], answer: 1, why: 'The chain check asks whether the chain ends at something in the store, not whether a CA company signed it. That is how a private CA file works too. The name `*.badssl.com` still covers `self-signed.badssl.com`.' },
					{ q: 'Did the handshake itself complete?', options: ['No, the `Finished` MAC failed', 'No, the key exchange failed', 'Only with TLS 1.2', 'Yes: the server signs with its own key, so the handshake is valid'], answer: 3, why: 'Anyone can run a valid handshake with their own key pair. Only the chain check catches it.' }
				]
			},
			{
				title: 'Read the wrong-host result',
				questions: [
					{ q: 'Without `-verify_hostname`, which code does `wrong.host.badssl.com` give?', options: ['`0 (ok)`', '`18 (self-signed certificate)`', '`62 (hostname mismatch)`', '`21 (unable to verify the first certificate)`'], answer: 0, why: 'The chain is fine, and nothing asked `s_client` to check the name.' },
					{ q: 'Why does the chain check pass?', options: ['The leaf signed itself', 'badssl.com runs its own CA', 'The chain climbs to a root CA in the client’s store', 'The client skips the chain without `-CAfile`'], answer: 2, why: 'Unlike the self-signed host, this leaf was signed by a CA, and its chain ends at a root the store trusts.' },
					{ q: 'Why does `s_client` say ok here?', options: ['badssl.com is on an allow-list', 'It checks the chain, but not the name unless you ask', 'The wildcard matches any name', 'It ignores certificate 0'], answer: 1, why: '`s_client` compares the name only when you pass `-verify_hostname`.' },
					{ q: 'A health check runs this `s_client` command, without `-verify_hostname`, against `wrong.host.badssl.com`. What does it report?', options: ['A failure on code 62', 'A failure on code 18', 'A DNS error', 'Healthy, though any client that checks the name refuses the host'], answer: 3, why: 'It sees `0 (ok)` because only the chain was checked. Browsers and requests check the name too, so the check is green while real clients fail.' }
				]
			},
			{
				title: 'Add the hostname check',
				questions: [
					{ q: 'With `-verify_hostname wrong.host.badssl.com`, what is the code now?', options: ['`0 (ok)`', '`62 (hostname mismatch)`', '`18 (self-signed certificate)`', '`20 (unable to get local issuer certificate)`'], answer: 1, why: 'The chain still passes, but the name does not match the certificate.' },
					{ q: 'Which name does the certificate carry?', options: ['`*.badssl.com`', '`wrong.host.badssl.com`', '`*.host.badssl.com`', '`badssl.com` only'], answer: 0, why: 'It is a wildcard for one level under `badssl.com`.' },
					{ q: 'Why does `*.badssl.com` not cover `wrong.host.badssl.com`?', options: ['Wildcards are not allowed in TLS 1.3', 'The name is too long', 'A wildcard matches only one label, and `wrong.host` is two', 'Wildcards only match `www`'], answer: 2, why: 'RFC 9525: "A wildcard in a presented identifier can only match one label".' },
					{ q: 'Where does the client find the names to compare?', options: ['In the issuer field', 'In the `ServerHello`', 'In the CA store', 'In the certificate’s Subject Alternative Name'], answer: 3, why: 'The client compares the URL’s name with the DNS names in the SAN.' }
				]
			},
			{
				title: 'Predict requests',
				questions: [
					{ q: 'What does `requests.get("https://self-signed.badssl.com")` do?', options: ['Raises `SSLError`', 'Returns 200 with a warning', 'Returns 200 silently', 'Retries over HTTP'], answer: 0, why: 'requests starts every call at `CERT_REQUIRED`, and the chain does not end at a trusted CA.' },
					{ q: 'And `requests.get("https://wrong.host.badssl.com")`?', options: ['Returns 200, like `s_client`', 'Returns 200 with an `InsecureRequestWarning`', 'Raises `SSLError`, because urllib3 checks the name too', 'Raises a `ConnectionError` for DNS'], answer: 2, why: 'urllib3 checks both the chain and the hostname, so it rejects both hosts.' },
					{ q: 'Which call would accept both hosts?', options: ['`requests.get(url, verify=True)`', '`requests.get(url, verify="/etc/ssl/internal-ca.pem")`', '`requests.get(url, timeout=5)`', '`requests.get(url, verify=False)`'], answer: 3, why: '`verify is False` switches to `CERT_NONE`: any certificate, any name, any dates.' },
					{ q: 'With `verify=False`, what does `requests.get("https://self-signed.badssl.com")` print besides returning the response?', options: ['An `SSLError`', 'Only urllib3’s `InsecureRequestWarning`', 'A `CERTIFICATE_VERIFY_FAILED` error', 'A deprecation error from requests'], answer: 1, why: '`verify=False` raises no error. The warning is the only trace, and one call to `urllib3.disable_warnings()` hides it too.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'An attacker on the Wi-Fi answers your TLS 1.3 handshake with its own self-signed certificate. Which check makes the handshake fail?',
			options: [
				'The `Finished` MAC, because the attacker cannot compute it over the handshake',
				'The `CertificateVerify` signature, because the attacker does not hold a valid key',
				'The client\'s chain check, because no CA in its store signed that certificate',
				'The `key_share` exchange, because the attacker cannot produce a Diffie-Hellman share'
			],
			answer: 2,
			why: 'The attacker runs a complete handshake with its own key pair, so its `key_share`, `CertificateVerify` and `Finished` are all valid. What it cannot produce is a chain that ends at a CA the client trusts for that name.'
		},
		{
			q: 'Before requests 2.32.0, a `Session` made one call with `verify=False`, then a call to the same origin with `verify=True`. What happened on the second call?',
			options: [
				'requests raised an error saying that `verify` cannot change inside one `Session`',
				'It reused the pooled connection opened with `CERT_NONE`, so no check took place',
				'It verified the certificate, because `verify=True` resets the whole connection pool',
				'It verified the certificate only if the first response had a status of 200'
			],
			answer: 1,
			why: 'The pool was chosen from the URL alone, so both calls shared one urllib3 pool. The fix in 2.32.0 adds `cert_reqs` to the pool key, which gives `CERT_NONE` connections their own pool.'
		},
		{
			q: 'Your service calls an internal API whose certificate comes from your company\'s own CA. requests fails with `CERTIFICATE_VERIFY_FAILED`. What do you change?',
			options: [
				'Set `verify=False` on calls to that host only, and keep it on elsewhere',
				'Turn off the hostname check and keep the chain check on',
				'Call the API over plain `http://`, since it never leaves the internal network',
				'Pass the company CA file to `verify` or set `REQUESTS_CA_BUNDLE` to it'
			],
			answer: 3,
			why: 'A path in `verify` makes urllib3 build the chain up to your CA, and it still checks the name and the dates. `verify=False` and plain HTTP both let any machine on the path read and change the traffic.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Build a private CA on your laptop, serve TLS on localhost, and watch the chain check and the hostname check pass and fail.',
		steps: [
			'Make a CA, with OpenSSL 3: `mkdir ~/tls-lab && cd ~/tls-lab && openssl req -x509 -newkey rsa:2048 -nodes -keyout ca.key -out ca.pem -days 7 -subj "/CN=Lab Root CA"`.',
			'Issue a certificate for `localhost`: `openssl req -newkey rsa:2048 -nodes -keyout server.key -out server.csr -subj "/CN=localhost"`, then `printf \'subjectAltName=DNS:localhost\\n\' > san.ext && openssl x509 -req -in server.csr -CA ca.pem -CAkey ca.key -CAcreateserial -out server.pem -days 7 -extfile san.ext`.',
			'In a second terminal: `cd ~/tls-lab && openssl s_server -accept 8443 -cert server.pem -key server.key -www`.',
			'Check the chain: `echo | openssl s_client -connect localhost:8443 -servername localhost | grep "Verify return code"`, then the same with `-CAfile ca.pem`.',
			'Check the name: add `-verify_hostname example.com` to the `-CAfile` command.',
			'Do the same with curl: `curl https://localhost:8443/`, then `curl -k https://localhost:8443/`, then `curl --cacert ca.pem https://localhost:8443/`.'
		],
		done: [
			'Without `-CAfile`, `s_client` prints `Verify return code: 21 (unable to verify the first certificate)`.',
			'With `-CAfile ca.pem`, it prints `Verify return code: 0 (ok)`, and with `-verify_hostname example.com` it prints `62 (hostname mismatch)`.',
			'Plain `curl` fails with exit code 60, `curl -k` and `curl --cacert ca.pem` both get the page.'
		],
		solution: [
			'Your CA is not in the system store, so the chain cannot end at a trusted root until you hand the client `ca.pem`.',
			'The certificate names only `localhost`, so a check against `example.com` fails even with a good chain.',
			'`curl -k` is the `verify=False` of curl: it gets the page, and it would get it just as well from any machine on the path. `--cacert`, like `verify="ca.pem"` in requests, keeps both checks on.'
		]
	},
	recall: {
		q: 'In a TLS 1.3 handshake, what does `CertificateVerify` prove, and what does the client still have to check itself?',
		a: 'It proves the server holds the private key of the certificate it sent. The client still checks that the chain ends at a CA in its store and that the name matches the URL; `verify=False` skips both.'
	},
	sources: [
		{ title: 'RFC 8446, The Transport Layer Security (TLS) Protocol Version 1.3', url: 'https://www.rfc-editor.org/rfc/rfc8446' },
		{ title: 'GHSA-9wx4-h78v-vm56 (CVE-2024-35195), requests Session does not verify after verify=False', url: 'https://github.com/advisories/GHSA-9wx4-h78v-vm56' },
		{ title: 'requests pull request 6655, Use TLS settings in selecting connection pool', url: 'https://github.com/psf/requests/pull/6655' },
		{ title: 'requests docs, SSL Cert Verification', url: 'https://requests.readthedocs.io/en/latest/user/advanced/#ssl-cert-verification' },
		{ title: 'curl docs, SSL CA Certificates', url: 'https://curl.se/docs/sslcerts.html' },
		{ title: 'RFC 9525, Service Identity in TLS', url: 'https://www.rfc-editor.org/rfc/rfc9525' },
		{ title: 'urllib3 docs, TLS Warnings', url: 'https://urllib3.readthedocs.io/en/latest/advanced-usage.html#tls-warnings' },
		{ title: 'badssl.com test hosts', url: 'https://badssl.com/' }
	]
};
