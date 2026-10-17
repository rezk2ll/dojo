const PYWA = 'https://github.com/duo-labs/py_webauthn/blob/c9ba2b7dad6b76bec89e44c76c8ed81fc43287bb';
const VERIFY = `${PYWA}/webauthn/authentication/verify_authentication_response.py`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'defense-in-depth',
	part: 'Threats',
	title: 'Layers of defence',
	minutes: 10,
	hook: [
		'On July 20, 2022, at 22:50 UTC, at least 76 Cloudflare employees got a text message in less than one minute. It linked to `cloudflare-okta.com`, a copy of the company Okta login page, registered less than 40 minutes earlier. The page sent each username, password and one-time code to the attacker over Telegram as soon as it was typed.',
		'Three employees typed their credentials. The attacker then tried them on the real login page and failed: every Cloudflare employee has a FIDO2 security key, and every internal app requires it. No Cloudflare system was compromised.',
		'Twilio was hit by a campaign with very similar characteristics around the same time. Its attackers got in, and Twilio later counted 163 customers whose data was accessed. At Cloudflare, several controls failed that night before one held. **Defence in depth** means you plan for that: each control on the path assumes the one before it can fail.'
	],
	terms: [
		{ term: 'Defence in depth', def: 'Several independent controls on the same attack path, so an attacker has to beat each one. When one fails, the next still has to be beaten.' },
		{ term: 'Real-time phishing', def: 'A fake login page that forwards what the victim types to the attacker within seconds, so the attacker can use a one-time code before it expires.' },
		{ term: 'Origin binding', def: 'In WebAuthn, the browser writes the origin of the page into the signed login data, and the key only signs for the site it was registered with. A response made on `cloudflare-okta.com` fails the check for `cloudflare.com`.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['sms["SMS to 76 employees: cloudflare-okta.com"] --> reg["Layer 1: watch for new domains with the brand"]'],
				highlight: ['sms', 'reg'],
				note: 'The domain was registered at 22:13:04 UTC and the texts started at 22:50. Cloudflare watches new registrations that use its brand, but this one "had not yet been published as a new .com registration". Layer 1 failed: nobody knew about the domain yet.'
			},
			{
				add: ['reg -->|"missed"| dns["Layer 2: DNS filter blocks known bad domains"]'],
				highlight: ['dns'],
				note: 'Cloudflare Gateway filters the DNS of employee devices. Its automatic detection did flag and block the domain, but only after some employees had already clicked. Layer 2 failed for the first clicks.'
			},
			{
				add: ['dns -->|"late"| ppl["Layer 3: people report, or type the password"]'],
				highlight: ['ppl'],
				note: 'Employees reported the texts to the security team, which runs 24x7. Three employees still entered their password. The page also asked for a TOTP code, which Cloudflare says would defeat "most two-factor authentication implementations" because it is relayed before it expires.'
			},
			{
				add: ['ppl -->|"3 passwords leaked"| key["Layer 4: FIDO2 key signs only for the real origin"]'],
				highlight: ['key'],
				note: 'The attacker tried the stolen passwords on the real login. Cloudflare\'s logs showed "login attempts blocked due to the hard key (U2F) requirements indicating that the correct password was used". The attacker had no key, and the page could not make the victim\'s key sign for Cloudflare: the browser put `https://cloudflare-okta.com` into the signed data, and the key had no credential for that site.'
			},
			{
				add: ['key -.->|"if it had failed"| edr["Layer 5: endpoint security blocks AnyDesk install"]'],
				highlight: ['edr'],
				note: 'A victim who got past login would have downloaded AnyDesk, remote access software. Nobody reached this step. Cloudflare says "our endpoint security would have stopped the installation". Layer 5 was still waiting behind layer 4.'
			},
			{
				add: ['key --> resp["Response: reset the 3 accounts and sessions, block the attacker IPs"]'],
				highlight: ['resp'],
				note: 'The team reset the three employees\' credentials and active sessions, scanned their devices, blocked the attacker IPs and had the server and domain taken down. The blocked logins also told them which accounts had leaked.'
			}
		]
	},
	example: {
		title: 'webauthn/authentication/verify_authentication_response.py in py_webauthn: the checks that stop a relayed login',
		repo: 'duo-labs/py_webauthn',
		url: `${VERIFY}#L112-L185`,
		lang: 'python',
		code: `    if expected_challenge != client_data.challenge:
        raise InvalidAuthenticationResponse("Client data challenge was not expected challenge")

    if isinstance(expected_origin, str):
        if expected_origin != client_data.origin:
            raise InvalidAuthenticationResponse(
                f'Unexpected client data origin "{client_data.origin}", expected "{expected_origin}"'
            )
    else:
        try:
            expected_origin.index(client_data.origin)
        except ValueError:
            raise InvalidAuthenticationResponse(
                f'Unexpected client data origin "{client_data.origin}", expected one of {expected_origin}'
            )
…
    # Generate a hash of the expected RP ID for comparison
    expected_rp_id_hash = hashlib.sha256()
    expected_rp_id_hash.update(expected_rp_id.encode("utf-8"))
    expected_rp_id_hash_bytes = expected_rp_id_hash.digest()

    if auth_data.rp_id_hash != expected_rp_id_hash_bytes:
        raise InvalidAuthenticationResponse("Unexpected RP ID hash")
…
    client_data_hash = hashlib.sha256()
    client_data_hash.update(client_data_bytes)
    client_data_hash_bytes = client_data_hash.digest()

    signature_base = authenticator_data_bytes + client_data_hash_bytes

    try:
        decoded_public_key = decode_credential_public_key(credential_public_key)
        crypto_public_key = decoded_public_key_to_cryptography(decoded_public_key)

        verify_signature(
            public_key=crypto_public_key,
            signature_alg=decoded_public_key.alg,
            signature=signature_bytes,
            data=signature_base,
        )
    except InvalidSignature:
        raise InvalidAuthenticationResponse("Could not verify authentication signature")`,
		notes: [
			'`expected_origin != client_data.origin` rejects a login whose browser data names another site. The browser fills `origin` itself, so a phishing page cannot write `https://cloudflare.com` there. A relayed response from `cloudflare-okta.com` stops at this line.',
			'`auth_data.rp_id_hash` is the SHA-256 of the RP ID, written by the key. The WebAuthn spec: "the authenticator ensures that credentials created by a Relying Party can only be used in operations requested by the same RP ID". On the phishing domain, the key has no matching credential and signs nothing.',
			'`signature_base` is the authenticator data plus the SHA-256 of `client_data_bytes`, and `verify_signature` checks it with the public key saved at registration. The origin and the challenge are inside the signed bytes, so an attacker cannot change them after the key signs.',
			'`expected_challenge` is a random value the server made for this one login. A signed response captured earlier carries an old challenge and fails the first check.'
		]
	},
	tradeoff: {
		gain: [
			'The attacker had 3 correct passwords and still could not log in. The failed attempts also showed Cloudflare exactly which 3 accounts to reset.',
			'Layers 1 and 2 failed for reasons that did not touch layer 4: a domain too new to be listed has no effect on what a security key signs.'
		],
		cost: [
			'Layers that look separate can share one weakness. A password and a TOTP code are both typed into the page, so one real-time phishing page beat both at once.',
			'Every employee needs a hardware key, and every app has to require it. Twilio only started "distributing FIDO2 tokens to all employees" after its breach.',
			'A layer made of people reporting texts sends work to a security team. At Cloudflare, "More than 90 percent of the reports to SIRT turn out to not be threats."'
		]
	},
	task: {
		prompt: 'Your internal admin panel has four controls on login: (a) a password, (b) a 6-digit TOTP code from an app, (c) a rate limit of 5 attempts per minute per IP, (d) an email to the user after a login from a new device. An attacker runs the same real-time phishing page as in the Cloudflare case. For each control, say whether it stops the attack and why. Then name the one change that would have stopped it at Cloudflare.',
		hint: 'The attacker makes one login attempt, from their own machine, within seconds of the victim typing. Which control sees anything unusual?',
		answer: [
			'(a) Password: relayed to the attacker as typed. It does not stop the attack.',
			'(b) TOTP: RFC 6238 recommends a 30-second time step, and the page relays the code within seconds. It does not stop the attack.',
			'(c) Rate limit: the attacker needs one attempt per victim, far below 5 per minute. It does not stop the attack.',
			'(d) New-device email: it fires after the attacker is in, so it only helps if the user reads it and someone acts fast. It detects, but does not stop.',
			'The change: require a WebAuthn key or passkey. The browser puts the phishing origin into the signed data, and the server check `expected_origin != client_data.origin` rejects it, as layer 4 did at Cloudflare.'
		]
	},
	quiz: [
		{
			q: 'Three Cloudflare employees typed their password into the phishing page. Why could the attacker still not log in?',
			options: [
				'The DNS filter had blocked the domain before anyone typed anything',
				'The security key had no credential for the phishing site and signed nothing',
				'The TOTP codes the page relayed had already expired after 30 seconds',
				'The attacker IP addresses were on a blocklist before the attack'
			],
			answer: 1,
			why: 'A WebAuthn key only signs for the RP ID it was registered with, and the browser writes the real page origin into the signed data. The phishing page could relay the password, but could not get a signature valid for Cloudflare. Cloudflare also does not use TOTP, and the DNS block came too late.'
		},
		{
			q: 'Which pair of controls is weakest as defence in depth against real-time phishing?',
			options: [
				'A password and a FIDO2 security key',
				'A password and a TOTP code typed by the user',
				'A DNS filter and a FIDO2 security key',
				'A FIDO2 security key and endpoint security'
			],
			answer: 1,
			why: 'The user types both the password and the TOTP code into the page, so the same fake page captures both and relays them. The other pairs fail for different reasons: a key cannot be typed into a page, and a DNS filter does not depend on the user.'
		},
		{
			q: 'In py_webauthn, why does the server check `client_data.origin` even though the signature is valid?',
			options: [
				'The signature only covers the authenticator data, not the origin',
				'The origin check is faster, so it runs first to save CPU time',
				'A valid signature made on another site must still be rejected',
				'The browser cannot be trusted to send the origin at all'
			],
			answer: 2,
			why: 'The origin is inside the signed client data, but the signature only proves that the key signed those bytes. The server has to read the origin and compare it to its own site. Without `expected_origin`, a response signed on another site could pass.'
		}
	],
	recall: {
		q: 'In the July 2022 phishing attack on Cloudflare, which layer held, and which check in the code made it hold?',
		a: 'The FIDO2 security key. The browser wrote the phishing origin into the signed data, and a server check like `expected_origin != client_data.origin` rejects it.'
	},
	sources: [
		{ title: 'Cloudflare blog, The mechanics of a sophisticated phishing scam and how we stopped it (August 9, 2022)', url: 'https://blog.cloudflare.com/2022-07-sms-phishing-attacks/' },
		{ title: 'Twilio, Incident Report: Employee and Customer Account Compromise (August 2022)', url: 'https://www.twilio.com/en-us/blog/august-2022-social-engineering-attack' },
		{ title: 'W3C, Web Authentication Level 3', url: 'https://www.w3.org/TR/webauthn-3/' },
		{ title: 'py_webauthn, verify_authentication_response.py', url: 'https://github.com/duo-labs/py_webauthn/blob/c9ba2b7dad6b76bec89e44c76c8ed81fc43287bb/webauthn/authentication/verify_authentication_response.py' },
		{ title: 'RFC 6238, TOTP: Time-Based One-Time Password Algorithm', url: 'https://www.rfc-editor.org/rfc/rfc6238' }
	]
};
