const CERTBOT = 'https://github.com/certbot/certbot/blob/990a59a814c8d4c53cc896f3c376c1c14e6c099c';
const REVOKE = 'https://community.letsencrypt.org/t/revoking-certain-certificates-on-march-4/114864';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'acme',
	part: 'Secrets and supply chain',
	title: 'Certificates that renew themselves',
	minutes: 10,
	hook: [
		'On 29 February 2020, Let\'s Encrypt found a bug in the CAA checks of Boulder, its CA software. On 3 March it [announced](' + REVOKE + ') that it had to revoke the affected certificates: 3,048,289 of them. The compliance deadline was 5 March 2020 at 03:00 UTC, about two days later.',
		'By that deadline, Let\'s Encrypt had revoked 1,706,505 certificates that it was confident had been replaced. Its FAQ told affected subscribers how "to avoid problems by renewing affected certificates early". More than 1 million certificates were still "either unknown or not replaced" on 5 March.',
		'Let\'s Encrypt issues 90-day certificates today and will issue 45-day ones by 2028.'
	],
	terms: [
		{ term: 'ACME', def: 'The protocol of RFC 8555: a client sends signed JSON over HTTPS to a CA to open an account, order a certificate, prove control of each name and download the result.' },
		{ term: 'Challenge', def: 'A task the CA sets to check that you control a name. `http-01` asks for a file at `http://<domain>/.well-known/acme-challenge/<token>`, `dns-01` for a TXT record at `_acme-challenge.<domain>`.' },
		{ term: 'Key authorization', def: 'The string the challenge checks: the token, a dot, then the base64url SHA-256 thumbprint of the client\'s account key.' },
		{ term: 'ARI', def: 'ACME Renewal Information: the CA tells the client a window in which to renew each certificate, and can move that window earlier, for example before a mass revocation.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['acct["Client: new key pair, newAccount request signed with it"] --> order["Order: example.com"]', 'order --> authz["Authorization: pending, challenges http-01 and dns-01"]'],
				highlight: ['acct', 'order', 'authz'],
				note: 'The client generates an account key pair and signs every request with it. It orders a certificate for `example.com`. The CA answers with an authorization per name and a list of challenges, each with a random token of at least 128 bits.'
			},
			{
				add: ['authz --> http["http-01: file at /.well-known/acme-challenge/TOKEN = TOKEN.thumbprint"]', 'http -->|"GET on port 80"| ca["CA compares the body with the key authorization it computed"]'],
				highlight: ['http', 'ca'],
				note: 'For `http-01`, the client serves the key authorization at `/.well-known/acme-challenge/<token>`. The CA fetches it over plain HTTP. RFC 8555: "This request MUST be sent to TCP port 80 on the HTTP server." Let\'s Encrypt fetches it from several vantage points.'
			},
			{
				add: ['authz --> dns["dns-01: TXT _acme-challenge.example.com = base64url(SHA-256(key authorization))"]', 'dns -->|"DNS query"| ca'],
				highlight: ['dns'],
				note: 'For `dns-01`, the client publishes the hashed key authorization as a TXT record. It is the only one of the two that Let\'s Encrypt accepts for a wildcard such as `*.example.com`. Let\'s Encrypt warns that DNS API credentials on the web server raise the damage if that server is hacked.'
			},
			{
				add: ['ca --> csr["Finalize: client sends a CSR"]', 'csr --> cert["Certificate: 90 days today, 45 days by 2028"]'],
				highlight: ['csr', 'cert'],
				note: 'Once every authorization is valid, the client sends a CSR and downloads the certificate. Let\'s Encrypt reuses a validated authorization for 30 days today, and will cut that to 7 hours by 2028. From then on, a renewal 30 days after the last one always runs a fresh challenge.'
			},
			{
				add: ['timer["certbot renew from cron or a systemd timer, twice a day"] -->|"ARI window, or 2/3 of the lifetime"| order', 'timer -->|"port 80 closed, DNS moved"| fail["5 failed authorizations per name per hour, then blocked"]'],
				highlight: ['timer', 'fail'],
				note: 'A timer runs `certbot renew`, and certbot renews only when a certificate is due. A firewall change on port 80 or a name moved to another host makes each renewal fail. Let\'s Encrypt allows "5 authorization failures per identifier" per account per hour. It stopped sending expiry emails on 4 June 2025, so your own monitoring has to catch a renewal that keeps failing.'
			}
		]
	},
	example: {
		title: 'certbot/_internal/renewal.py: when certbot decides to renew',
		repo: 'certbot/certbot',
		url: `${CERTBOT}/certbot/src/certbot/_internal/renewal.py#L413-L489`,
		lang: 'python',
		code: `def _default_renewal_time(cert_pem: bytes) -> datetime.datetime:
…
    cert = x509.load_pem_x509_certificate(cert_pem)

    not_before = cert.not_valid_before_utc
    lifetime = cert.not_valid_after_utc - not_before
    if lifetime.total_seconds() < 10 * 86400:
        default_rt = not_before + lifetime / 2
    else:
        default_rt = not_before + lifetime * 2 / 3

    return default_rt

def should_autorenew(lineage: storage.RenewableCert,
                     ari_clients: AriClientPool) -> bool:
…
    if not lineage.autorenewal_is_enabled():
        return False

    cert = lineage.version("cert", lineage.latest_common_version())
    with open(cert, 'rb') as f:
        cert_pem = f.read()

    renewal_time = _ari_renewal_time(lineage, cert_pem, ari_clients)

    now = datetime.datetime.now(datetime.timezone.utc)

    if renewal_time and now > renewal_time:
        return True

    # Renewals on the basis of revocation
    if lineage.ocsp_revoked(lineage.latest_common_version()):
        logger.debug("Should renew, certificate is revoked.")
        return True

    # If the renew_before_expiry config field is set, check if it says we should renew
    config_interval = lineage.configuration.get("renew_before_expiry")
    if config_interval is not None:
        notAfter = crypto_util.notAfter(cert)
        if notAfter < storage.add_time_interval(now, config_interval):
            logger.debug("Should renew, less than %s before certificate "
                            "expiry %s.", config_interval,
                            notAfter.strftime("%Y-%m-%d %H:%M:%S %Z"))
            return True
    # Only use the default if we don't have an ARI or renew_before_expiry value
    elif renewal_time is None:
        default_renewal_time = _default_renewal_time(cert_pem)
        if now > default_renewal_time:
            return True

    return False`,
		notes: [
			'The `lifetime * 2 / 3` line sets the default: a 90-day certificate renews after 60 days, a 45-day one after 30. Below 10 days of lifetime (`10 * 86400` seconds), certbot renews at half, so a 6-day certificate renews after 3 days.',
			'`_ari_renewal_time` asks the CA for its renewal window first. When `now > renewal_time`, certbot renews whatever the age of the certificate. Let\'s Encrypt recommends ARI so that a client renews on time when lifetimes drop to 45 days.',
			'`lineage.ocsp_revoked(...)` renews a certificate that its OCSP responder reports as revoked. For a mass revocation like March 2020, RFC 9773 lets the CA move the ARI window earlier instead, so the first branch fires before the revocation.',
			'Because each run returns `False` until a certificate is due, the [certbot docs](' + CERTBOT + '/certbot/docs/using.rst) suggest a cron line that runs `certbot renew -q` at `0 0,12 * * *`, after a random sleep of up to an hour. Running it often costs nothing.'
		]
	},
	tradeoff: {
		gain: [
			'A leaked key is useful to an attacker only until the certificate expires: 90 days today, 45 days from 2028.',
			'Renewal needs no person: a timer, a challenge and a CSR, twice a day, with `certbot renew --dry-run` to test the whole path against the staging server.',
			'With ARI, the CA can ask every client to renew early before a mass revocation, without an email to each subscriber.'
		],
		cost: [
			'Every renewal depends on the challenge path: port 80 open to the internet for `http-01`, or a DNS API token on the machine for `dns-01`.',
			'A hard-coded schedule breaks with shorter lifetimes. Let\'s Encrypt: "renewing at a hardcoded interval of 60 days will no longer be sufficient" for 45-day certificates.',
			'A renewal that fails on every run writes an error to certbot\'s log, and nobody gets paged unless you add an alert. Since 4 June 2025, Let\'s Encrypt sends no expiry email.'
		]
	},
	task: {
		prompt: 'After 16 February 2028, Let\'s Encrypt\'s default profile issues 45-day certificates. Your certificate for `shop.example.com` was issued on 1 March 2028 at 00:00 UTC. certbot runs at 00:00 and 12:00 with no ARI and no `renew_before_expiry`. On 30 March, a firewall change closes port 80. When does certbot first try to renew, how many attempts happen before expiry, and how would you notice? 10 minutes, on paper.',
		hint: 'Use `_default_renewal_time`: the lifetime is above 10 days, so the factor is 2/3. The expiry is `notBefore` plus 45 days.',
		answer: [
			'The renewal time is 1 March plus 2/3 of 45 days, so 30 days: 31 March 2028 at 00:00 UTC. certbot first tries at the run that follows `now > default_renewal_time`, on 31 March at 12:00 at the latest.',
			'The certificate expires on 1 March plus 45 days: 15 April 2028 at 00:00. From 31 March to 15 April there are 15 days of two runs each, so about 30 attempts. Every one fails, because the CA\'s `GET` to port 80 times out.',
			'Each run makes one `http-01` attempt, well under the limit of 5 failed authorizations per name per hour, so rate limits are not what blocks you. The firewall is.',
			'Nothing tells you by default: no email from Let\'s Encrypt since June 2025. Check that the served certificate has more than 14 days left (`openssl s_client` and `-checkend 1209600`), or alert on the `FAILED_DOMAINS` variable certbot gives to post hooks.'
		],
		steps: [
			{
				title: 'Find the renewal time',
				questions: [
					{ q: 'With no ARI and no `renew_before_expiry`, which function sets the renewal time?', options: ['`_ari_renewal_time`', '`_default_renewal_time`', '`lineage.ocsp_revoked`', '`crypto_util.notAfter`'], answer: 1, why: 'The last branch of `should_autorenew` falls back to `_default_renewal_time` when neither is set.' },
					{ q: 'Which factor applies to a 45-day certificate?', options: ['1/2, since 45 days is short', '3/4', '2/3, since the lifetime is above 10 days', '1/3'], answer: 2, why: 'certbot uses half only below `10 * 86400` seconds of lifetime.' },
					{ q: 'So when is the certificate due?', options: ['31 March 2028 at 00:00 UTC', '16 March 2028 at 00:00 UTC', '15 April 2028 at 00:00 UTC', '1 April 2028 at 12:00 UTC'], answer: 0, why: '2/3 of 45 days is 30 days after 1 March.' },
					{ q: 'When is the first attempt at the latest?', options: ['31 March at 00:00, exactly', '30 March at 12:00', '1 April at 00:00', '31 March at 12:00'], answer: 3, why: 'certbot renews on the first run where `now > default_renewal_time`, and the runs are at 00:00 and 12:00.' }
				]
			},
			{
				title: 'Find the expiry',
				questions: [
					{ q: 'When does the certificate expire?', options: ['30 April 2028', '15 April 2028 at 00:00 UTC', '31 March 2028', '1 June 2028'], answer: 1, why: 'The expiry is `notBefore` plus 45 days: 1 March plus 45 days.' },
					{ q: 'How many days lie between the first attempt and the expiry?', options: ['About 15', 'About 30', 'About 45', 'About 5'], answer: 0, why: 'From 31 March to 15 April is 15 days.' },
					{ q: 'What does the firewall change on 30 March do to `http-01`?', options: ['Nothing, the CA uses port 443', 'The CA switches to `dns-01`', 'The CA’s `GET` to port 80 times out', 'certbot opens the port itself'], answer: 2, why: 'RFC 8555: the request "MUST be sent to TCP port 80". A closed port fails every attempt.' },
					{ q: 'Would an old certificate keep working after 15 April?', options: ['Yes, the CA extends late renewals', 'Yes, browsers allow 30 days of grace', 'Only for visitors who saw it before', 'No, it is invalid from that moment'], answer: 3, why: 'A certificate past its expiry fails validation. Nothing extends it.' }
				]
			},
			{
				title: 'Count the attempts',
				questions: [
					{ q: 'How many attempts happen before expiry?', options: ['About 30', 'About 15', 'About 90', 'Just 1'], answer: 0, why: '15 days of two runs each is about 30 attempts, all failing.' },
					{ q: 'Do rate limits block these attempts?', options: ['Yes, after 5 attempts in total', 'No: one attempt per run stays under 5 failures per name per hour', 'Yes, after the first failure', 'No, rate limits do not apply to renewals'], answer: 1, why: 'Let’s Encrypt allows 5 failed authorizations per identifier per account per hour. Two runs a day never reach that.' },
					{ q: 'So what really blocks the renewal?', options: ['The rate limit', 'The 45-day profile', 'The closed port 80', 'certbot’s schedule'], answer: 2, why: 'Every attempt fails at the challenge, because the CA cannot reach the file.' },
					{ q: 'Does an authorization from the last order skip the challenge?', options: ['Yes, for 90 days', 'Yes, for 30 days', 'Yes, always', 'No: by 2028 reuse is cut to 7 hours, so a fresh challenge runs'], answer: 3, why: 'With 7 hours of reuse, a renewal 30 days later always runs a new challenge.' }
				]
			},
			{
				title: 'Plan the alert',
				questions: [
					{ q: 'Will Let’s Encrypt email you before expiry?', options: ['Yes, 20 days before', 'No: it stopped expiry emails on 4 June 2025', 'Only for paid accounts', 'Only if ARI is on'], answer: 1, why: 'Since June 2025 no expiry email is sent, so your own monitoring has to catch it.' },
					{ q: 'Which check catches a certificate close to expiry?', options: ['`openssl x509 -checkend 1209600` on the served certificate', '`certbot --version`', 'A `GET` on `/.well-known/acme-challenge/`', '`ping shop.example.com`'], answer: 0, why: '`-checkend 1209600` fails when fewer than 14 days are left.' },
					{ q: 'Which certbot value can feed an alert from a post hook?', options: ['`RENEWED_LINEAGE`', '`CERTBOT_TOKEN`', '`FAILED_DOMAINS`', '`ACME_SERVER`'], answer: 2, why: 'certbot gives `FAILED_DOMAINS` to post hooks, so a hook can page on a failed renewal.' },
					{ q: 'With the alert at 14 days left, when does it fire?', options: ['On 15 April', 'On 31 March', 'On 30 March', 'On 1 April'], answer: 3, why: '15 April minus 14 days is 1 April, which leaves two weeks to reopen port 80.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'For an `http-01` challenge on `example.com`, what does the CA fetch, and how?',
			options: [
				'`https://example.com/.well-known/acme-challenge/<token>` on port 443, checking the old certificate',
				'`http://example.com/.well-known/acme-challenge/<token>` on port 80, then compares the key authorization',
				'A TXT record at `_acme-challenge.example.com`, then compares its hash with the token',
				'The page `http://example.com/` on port 80, looking for the token in an HTML meta tag'
			],
			answer: 1,
			why: 'RFC 8555 builds the URL `http://{domain}/.well-known/acme-challenge/{token}` and sends the GET to TCP port 80. The body must equal the token, a dot and the account key thumbprint. The TXT record belongs to `dns-01`.'
		},
		{
			q: 'You need a certificate for `*.example.com` from Let\'s Encrypt. Which challenge works?',
			options: [
				'`http-01` on any host under the name, since the CA picks one host at random',
				'`http-01` on `example.com` itself, since it covers every subdomain',
				'`dns-01`, with a TXT record at `_acme-challenge.example.com`',
				'`tls-alpn-01` on port 443 of `example.com`, since it covers wildcards'
			],
			answer: 2,
			why: 'Let\'s Encrypt\'s docs say `http-01` "cannot be used to issue wildcard certificates". The `dns-01` challenge proves control of the DNS zone, which covers every name under it.'
		},
		{
			q: 'Your script renews every certificate on a fixed schedule, every 60 days. What happens when the CA switches to 45-day certificates?',
			options: [
				'Nothing changes, because the CA extends a certificate when its renewal is late',
				'The CA refuses the order, because 60 days is above the new lifetime',
				'certbot overrides the script and renews at 2/3 of the lifetime',
				'Each certificate expires 15 days before the script renews it'
			],
			answer: 3,
			why: 'A 45-day certificate is invalid from day 45, and the script waits until day 60. A client that renews at a share of the lifetime (certbot uses 2/3) or follows ARI keeps working when lifetimes change.'
		}
	],
	lab: {
		minutes: 25,
		goal: 'Run a real ACME exchange against Pebble, Let’s Encrypt’s test CA, on your laptop: issue a 45-day certificate, see certbot skip a renewal that is not due, then watch a renewal fail when the challenge port is closed.',
		steps: [
			'Write a Pebble config that issues 45-day certificates (3888000 seconds): `mkdir ~/acme-lab && cd ~/acme-lab && printf \'%s\\n\' \'{"pebble": {"listenAddress": "0.0.0.0:14000", "managementListenAddress": "0.0.0.0:15000", "certificate": "test/certs/localhost/cert.pem", "privateKey": "test/certs/localhost/key.pem", "httpPort": 5002, "tlsPort": 5001, "certificateValidityPeriod": 3888000}}\' > pebble.json`.',
			'Start Pebble, with `shop.test` pointing at itself: `docker run -d --rm --name pebble --add-host shop.test:127.0.0.1 -e PEBBLE_VA_NOSLEEP=1 -e PEBBLE_WFE_NONCEREJECT=0 -e PEBBLE_AUTHZREUSE=0 -v "$PWD/pebble.json:/test/config/pebble-config.json" ghcr.io/letsencrypt/pebble:2.6.0`. Pebble sends its `http-01` requests to port 5002 instead of 80. The two `0` settings turn off Pebble’s random nonce rejections and its reuse of old authorizations, so every order runs a fresh challenge.',
			'Order a certificate with certbot in the same network namespace: `docker run --rm --network container:pebble -v acme-le:/etc/letsencrypt certbot/certbot:v2.11.0 certonly --standalone --http-01-port 5002 --server https://localhost:14000/dir --no-verify-ssl --register-unsafely-without-email --agree-tos -d shop.test`.',
			'Check it and try a renewal: `docker run --rm -v acme-le:/etc/letsencrypt certbot/certbot:v2.11.0 certificates`, then the `certonly` command from step 3 with `renew --no-verify-ssl` in place of everything after the image name.',
			'Close the challenge port: run `renew --force-renewal --no-random-sleep-on-renew --http-01-port 5003 --no-verify-ssl` the same way, so certbot listens on 5003 while Pebble knocks on 5002. Without a terminal, `renew` first sleeps for up to 8 minutes, and `--no-random-sleep-on-renew` skips that.',
			'Clean up: `docker stop pebble && docker volume rm acme-le`.'
		],
		done: [
			'Step 3 prints `Successfully received certificate.` and an expiry 45 days from now.',
			'`certificates` shows `VALID: 44 days`, and `renew` prints `Certificate not yet due for renewal`.',
			'Step 5 prints `Type:   connection`, `connect: connection refused` and `1 renew failure(s)`.'
		],
		solution: [
			'The order runs the whole RFC 8555 flow: account, order, `http-01` challenge on the port Pebble checks, CSR, certificate.',
			'certbot renews a 45-day certificate after 2/3 of its life, so a fresh one is not due, and running `renew` often costs nothing.',
			'With nothing on the port the CA calls, every renewal fails, exactly like the firewall change in the task. Nothing emails you: the only signal is certbot’s output and log, so wire an alert on the days left.'
		]
	},
	recall: {
		q: 'When does certbot renew a certificate by default, and what does that give for a 90-day and a 45-day one?',
		a: 'After 2/3 of its lifetime (half when the lifetime is under 10 days), unless ARI or `renew_before_expiry` says otherwise: after 60 days for a 90-day certificate, after 30 days for a 45-day one.'
	},
	sources: [
		{ title: 'RFC 8555, Automatic Certificate Management Environment (ACME)', url: 'https://www.rfc-editor.org/rfc/rfc8555' },
		{ title: 'Let\'s Encrypt community, Revoking certain certificates on March 4', url: 'https://community.letsencrypt.org/t/revoking-certain-certificates-on-march-4/114864' },
		{ title: 'Let\'s Encrypt community, 2020.02.29 CAA Rechecking Bug', url: 'https://community.letsencrypt.org/t/2020-02-29-caa-rechecking-bug/114591' },
		{ title: 'Let\'s Encrypt, Decreasing Certificate Lifetimes to 45 Days', url: 'https://letsencrypt.org/2025/12/02/from-90-to-45/' },
		{ title: 'Let\'s Encrypt, Ending Support for Expiration Notification Emails', url: 'https://letsencrypt.org/2025/01/22/ending-expiration-emails/' },
		{ title: 'RFC 9773, ACME Renewal Information (ARI) Extension', url: 'https://www.rfc-editor.org/rfc/rfc9773' },
		{ title: 'Let\'s Encrypt docs, Challenge Types', url: 'https://letsencrypt.org/docs/challenge-types/' },
		{ title: 'Let\'s Encrypt docs, Rate Limits', url: 'https://letsencrypt.org/docs/rate-limits/' },
		{ title: 'certbot docs, User Guide (renewing certificates)', url: 'https://eff-certbot.readthedocs.io/en/stable/using.html#renewing-certificates' }
	]
};
