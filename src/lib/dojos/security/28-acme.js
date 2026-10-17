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
