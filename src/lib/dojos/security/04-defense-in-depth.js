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
		],
		steps: [
			{
				title: 'Picture the attack',
				questions: [
					{ q: 'What does a real-time phishing page do with what the victim types?', options: ['Stores it to sell later', 'Checks it against a list of leaks', 'Shows an error and asks again', 'Forwards it to the attacker within seconds'], answer: 3, why: 'At Cloudflare, the page sent each username, password and one-time code over Telegram as soon as it was typed.' },
					{ q: 'How many login attempts does the attacker make per victim?', options: ['Thousands, to guess the password', 'One, right after the victim types', 'Five, then a pause of one minute', 'None: they steal the session cookie'], answer: 1, why: 'They already have the password and the code. One attempt, within seconds, is enough.' },
					{ q: 'From where does the attacker log in?', options: ['Their own machine', 'The victim\'s laptop', 'The company office network', 'The phishing domain\'s DNS server'], answer: 0, why: 'The page relays the secrets, and the attacker types them into the real login page from their own machine.' },
					{ q: 'What makes two controls weak together against this attack?', options: ['Both run on the same server', 'Both come from one vendor', 'The user types both into the page', 'Both expire after 30 seconds'], answer: 2, why: 'A password and a TOTP code are both typed into the page, so one fake page beats both at once.' }
				]
			},
			{
				title: 'Test the password and the code',
				questions: [
					{ q: '(a) The password: does it stop the attack?', options: ['Yes, if it is long', 'Yes, if it changes every month', 'No: it is relayed as it is typed', 'Yes, if it is unique to this site'], answer: 2, why: 'The page sends it to the attacker as soon as it is typed. How strong it is does not matter.' },
					{ q: 'What time step does RFC 6238 recommend for TOTP?', options: ['30 seconds', '5 minutes', '1 second', '24 hours'], answer: 0, why: '30 seconds is plenty for the attacker: the page relays the code within seconds.' },
					{ q: '(b) The TOTP code: does it stop the attack?', options: ['Yes: the code changes every 30 seconds', 'Yes: the code is tied to the phone', 'Only if the app asks for a fingerprint', 'No: the page relays it before it expires'], answer: 3, why: 'Cloudflare says a relayed code defeats "most two-factor authentication implementations".' },
					{ q: 'Does a TOTP code depend on the site where it is typed?', options: ['Yes: it hashes the page origin', 'No: the same code works wherever it is relayed', 'Yes: it includes the user\'s IP', 'Only when the app runs in strict mode'], answer: 1, why: 'Nothing about the site goes into the code. That is the gap a security key closes.' }
				]
			},
			{
				title: 'Test the limit and the email',
				questions: [
					{ q: '(c) 5 attempts per minute per IP: does it stop the attack?', options: ['No: one attempt per victim is far below it', 'Yes: the attacker IP gets blocked', 'Yes: phishing needs many attempts', 'Only for the first victim'], answer: 0, why: 'The attacker already has the right password and code. One attempt passes.' },
					{ q: '(d) The new-device email: when does it go out?', options: ['Before the password is checked', 'When the victim opens the phishing link', 'When the DNS filter blocks the domain', 'After the attacker is already logged in'], answer: 3, why: 'It reports a login that already happened. It detects; it does not stop.' },
					{ q: 'What does that email need to be any use?', options: ['A link to reset the TOTP secret', 'A user who reads it and someone who acts fast', 'A copy sent to the security team only', 'A shorter 30-second time step'], answer: 1, why: 'It only helps if the user reads it and someone acts before the attacker does damage.' },
					{ q: 'So how many of the four controls stop this attack?', options: ['Four', 'Two', 'None', 'One'], answer: 2, why: 'The password and the code are relayed, the limit sees one attempt, and the email comes after the login.' }
				]
			},
			{
				title: 'Pick the change',
				questions: [
					{ q: 'Which control stopped the attack at Cloudflare?', options: ['A stricter rate limit', 'A FIDO2 key, required by every app', 'A shorter TOTP time step', 'Training staff to spot fake pages'], answer: 1, why: 'Every employee had a FIDO2 key and every internal app required it. Three passwords leaked and nobody got in.' },
					{ q: 'Why can the phishing page not relay a key signature?', options: ['The key only signs during office hours', 'The key encrypts the password first', 'The browser writes the phishing origin into the signed data', 'The key needs the victim\'s IP address'], answer: 2, why: 'The origin is `https://cloudflare-okta.com`, and the key has no credential for that site.' },
					{ q: 'Which server check rejects a response made on the wrong site?', options: ['`expected_challenge != client_data.challenge`', '`verify_signature(...)` on its own', 'A check on the browser user agent', '`expected_origin != client_data.origin`'], answer: 3, why: 'The browser fills `origin` itself, so a phishing page cannot write the real one there. A relayed response stops at this line.' },
					{ q: 'You add security keys. Is the new-device email still worth keeping?', options: ['Yes: it is one more layer if the key layer fails', 'No: one strong layer is enough', 'No: it would block the key login', 'Yes, but only for the password step'], answer: 0, why: 'Defence in depth plans for each layer to fail. At Cloudflare, endpoint security was still waiting behind the key.' }
				]
			}
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
	lab: {
		minutes: 15,
		goal: 'Compute TOTP codes yourself and see why a code relayed a few seconds later still logs in.',
		steps: [
			'Make a folder: `mkdir -p ~/totp-lab && cd ~/totp-lab`. Save this one line as `totp.py`. It prints the 6-digit RFC 6238 code of the RFC test secret at a given Unix time: `import hmac,struct,sys; t=int(sys.argv[1])//30; h=hmac.new(b"12345678901234567890",struct.pack(">Q",t),"sha1").digest(); o=h[-1]&15; print("%06d"%((struct.unpack(">I",h[o:o+4])[0]&0x7fffffff)%1000000))`.',
			'Check it against the RFC test value: `python3 totp.py 59`.',
			'Play the victim and the relay. `t0` is the start of the current 30-second step: `t0=$(( $(date +%s) / 30 * 30 ))`, then `python3 totp.py $t0` (the victim types), `python3 totp.py $((t0+5))` (the page relays 5 seconds later) and `python3 totp.py $((t0+40))` (a code from 40 seconds later).',
			'Read `totp.py` again and list everything that goes into `hmac.new`.'
		],
		done: [
			'`python3 totp.py 59` prints `287082`, the last 6 digits of the RFC 6238 test value `94287082`.',
			'The codes for `t0` and `t0+5` are the same. The code for `t0+40` is different.',
			'You can name the only two inputs: the shared secret and the time step.'
		],
		solution: [
			'A TOTP code depends only on the shared secret and `time // 30`. A page that relays it within seconds hands the attacker a code the real server still accepts.',
			'Nothing in the inputs names the site, so the code works wherever it is typed. That is why the password and the code fall to the same phishing page.',
			'A WebAuthn key adds what TOTP lacks: the browser writes the page origin into the signed data, and the server compares it with `expected_origin`.'
		]
	},
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
