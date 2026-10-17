const PYOTP = 'https://github.com/pyauth/pyotp/blob/cc156832fa9f3d5af7fb9e4e6b86b29dfc5b69f1/src/pyotp';
const OTP = `${PYOTP}/otp.py`;
const TOTP = `${PYOTP}/totp.py`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'mfa',
	part: 'Identity',
	title: 'Second factors',
	minutes: 10,
	hook: [
		'On 20 July 2022 at 22:50 UTC, at least 76 Cloudflare employees received a text message in less than a minute. The link pointed to `cloudflare-okta.com`, a domain registered less than 40 minutes earlier. The page looked like Cloudflare’s Okta login page.',
		'The page sent each username and password to the attacker over Telegram as soon as it was typed, then asked for a TOTP code. The attacker could type both into the real login page before the code expired. Cloudflare wrote that this real-time relay defeats "most two-factor authentication implementations".',
		'Three employees entered their credentials. Cloudflare did not use TOTP: every employee had a FIDO2 security key, and the attacker "could not get past the hard key requirement". Below: how a TOTP code is computed, why a typed code can be relayed, why a security key cannot, and where SMS fits.'
	],
	terms: [
		{ term: 'TOTP', def: 'Time-based one-time password (RFC 6238): an HMAC of the current 30-second time step, keyed with a secret that the phone app and the server share, cut down to 6 digits.' },
		{ term: 'Time step', def: 'The counter TOTP feeds to the HMAC: `T = floor(unix_time / 30)`. At Unix time 59, T is 1. At 60, T is 2.' },
		{ term: 'Phishing-resistant', def: 'An authenticator whose output is bound to the site it is used on, so a fake site cannot pass it on to the real one. NIST counts no code that the user types as phishing-resistant.' },
		{ term: 'WebAuthn', def: 'The browser API (`navigator.credentials.get()`) through which a security key or passkey signs a server’s random challenge with a private key it never reveals.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['enrol["Enrolment: server creates a random secret K, shows it as a QR code"] --> both["Phone app and server both store K"]'],
				highlight: ['enrol', 'both'],
				note: 'At enrolment the server creates a random secret and shows it as a QR code. The phone app scans it, and from then on both sides hold the same secret. RFC 6238 test vectors use the ASCII secret `12345678901234567890`.'
			},
			{
				add: ['both --> step["T = floor(unix_time / 30): at time 59, T = 1"]', 'step --> mac["HMAC-SHA1(K, T as 8 bytes): 75a48a19…397eea747a2d33ab"]'],
				highlight: ['step', 'mac'],
				note: 'Both sides divide the Unix time by 30 and drop the remainder. At time 59, T is 1. They compute HMAC-SHA1 of T, written as 8 bytes, with the secret. RFC 4226 gives the 20-byte result for counter 1: `75a48a19d4cbe100644e8ac1397eea747a2d33ab`.'
			},
			{
				add: ['mac -->|"offset = last byte & 0xF = 11"| code["4 bytes from offset 11: c1397eea & 0x7fffffff = 1094287082"]', 'code -->|"mod 10^6"| six["287082"]'],
				highlight: ['code', 'six'],
				note: 'The last byte is `0xab`, and its low 4 bits give offset 11. The 4 bytes at offset 11 are `c1397eea`. Clearing the top bit gives `41397eea`, which is 1094287082. The last 6 digits, `287082`, are the code.'
			},
			{
				add: ['six --> fake["User types 287082 on cloudflare-okta.com"]', 'fake -->|"relayed within the 30 s step"| real["Real login page accepts it"]'],
				highlight: ['fake', 'real'],
				note: 'The code says nothing about which page the user typed it on. The fake page forwards it, and the real server sees a correct code for the current step. NIST: manual entry "does not bind the authenticator output to the specific session being authenticated".'
			},
			{
				add: ['key["Security key: WebAuthn signs the server challenge and the page origin"] -->|"origin is cloudflare-okta.com"| no["Real server rejects the signature"]'],
				highlight: ['key', 'no'],
				note: 'With WebAuthn, the browser passes the page’s origin to the key along with the server’s challenge, and the key signs both. MDN: an attacker on a fake site "can\'t login as the user because the signature changes with the origin of the website". Cloudflare’s logs showed correct passwords with the second factor failing.'
			}
		]
	},
	example: {
		title: 'src/pyotp/otp.py: pyotp’s generate_otp, RFC 4226 truncation',
		repo: 'pyauth/pyotp',
		url: `${OTP}#L30-L56`,
		lang: 'python',
		code: `    def generate_otp(self, input: int) -> str:
        """
        :param input: the HMAC counter value to use as the OTP input.
            Usually either the counter, or the computed integer based on the Unix timestamp
        """
        if input < 0:
            raise ValueError("input must be positive integer")
        hasher = hmac.new(self.byte_secret(), self.int_to_bytestring(input), self.digest)
        if hasher.digest_size < 18:
            raise ValueError("digest size is lower than 18 bytes, which will trigger error on otp generation")
        hmac_hash = bytearray(hasher.digest())
        offset = hmac_hash[-1] & 0xF
        code = (
            (hmac_hash[offset] & 0x7F) << 24
            | (hmac_hash[offset + 1] & 0xFF) << 16
            | (hmac_hash[offset + 2] & 0xFF) << 8
            | (hmac_hash[offset + 3] & 0xFF)
        )
        str_code = str(10_000_000_000 + (code % 10**self.digits))
        return str_code[-self.digits :]

    def byte_secret(self) -> bytes:
        secret = self.secret
        missing_padding = len(secret) % 8
        if missing_padding != 0:
            secret += "=" * (8 - missing_padding)
        return base64.b32decode(secret, casefold=True)`,
		notes: [
			'Line 8 computes the HMAC of the counter, packed into 8 big-endian bytes by `int_to_bytestring`, with SHA-1 by default. Lines 22 to 27 decode the secret from base32, the format inside the QR code.',
			'Line 12 takes the low 4 bits of the last byte as the offset. Lines 13 to 18 read 4 bytes from there, and the `& 0x7F` on line 14 clears the top bit. RFC 4226 does this "to avoid confusion about signed vs. unsigned modulo computations".',
			'Lines 19 and 20 keep the last 6 digits (`code % 10**6`), with leading zeros: adding `10_000_000_000` and slicing keeps a code like `041234` at 6 characters.',
			'The counter comes from [`timecode`](' + TOTP + '#L137-L147) in totp.py: `int(unix_time / self.interval)`, with `interval = 30` by default. With the RFC secret, `pyotp.TOTP("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", digits=8).at(59)` returns `94287082`, the RFC 6238 test value.',
			'RFC 6238 says the verifier "MUST NOT accept the second attempt of the OTP after the successful validation". pyotp’s `verify` does not track this. [`verify_and_get_timecode`](' + TOTP + '#L88-L115) returns the matching step, so the app can store it and refuse any code for the same step or an older one.'
		]
	},
	tradeoff: {
		gain: [
			'A stolen password alone no longer logs anyone in: the attacker also needs a code made from a secret that stays on the phone.',
			'TOTP needs no network on the phone and no SMS provider, only the shared secret and a correct clock.',
			'A FIDO2 key stopped a phishing page that three Cloudflare employees typed their passwords into.'
		],
		cost: [
			'A TOTP code can be relayed by a fake page within its 30-second step, so NIST does not count it as phishing-resistant.',
			'The server must keep every user’s TOTP secret in a form it can read to compute codes. RFC 6238 asks that keys "SHOULD be protected against unauthorized access and usage".',
			'An SMS code goes to a phone number, and the number can move to another SIM. NIST restricts codes sent over the phone network and tells verifiers to check for "SIM change, number porting" first.'
		]
	},
	task: {
		prompt: 'Part 1, on paper. An HMAC-SHA1 output for some time step is `1f8698690e02ca16618550ef7f19da8e945b555a`. Find the offset, the 4 bytes, the 31-bit number and the 6-digit TOTP code.\n\nPart 2. Your server calls `totp.verify(code, valid_window=1)` and never records used codes. A user types a code on a phishing page 5 seconds into its step. For how long can the attacker use that code, and how many times?',
		hint: 'The offset is the value of the last hex digit. Count bytes from 0, two hex digits per byte. For part 2: with `valid_window=1`, the server accepts the codes for steps T-1, T and T+1.',
		answer: [
			'Last byte `5a`, low 4 bits `a`: offset 10. Bytes 10 to 13: `50 ef 7f 19`, so `0x50ef7f19`. The top bit is already 0, so the number is 1357872921. The last 6 digits give `872921`, the result of the worked example in section 5.4 of RFC 4226.',
			'Part 2: the code for step T is accepted while the server is at step T-1, T or T+1. The user typed it 5 seconds into step T, so it stays valid for the remaining 25 seconds of T plus the 30 seconds of T+1: 55 seconds.',
			'Because `verify` keeps no record, the attacker can use it as many times as they like in those 55 seconds. Storing the step returned by `verify_and_get_timecode` and refusing any step not greater than it cuts this to one use.',
			'Neither fix stops the first relayed use. Only a WebAuthn key, which signs the page origin, makes the code from the fake page useless.'
		]
	},
	quiz: [
		{
			q: 'At Unix time 59, with the default 30-second step, which counter value do the phone and the server feed to HMAC?',
			options: ['0', '1', '2', '59'],
			answer: 1,
			why: 'RFC 6238 defines T = floor((time - T0) / 30) with T0 = 0. 59 / 30 is 1.97, and the floor is 1. At time 60 the counter is 2.'
		},
		{
			q: 'A phishing page asks for the password and then the TOTP code, and relays both to the real site within seconds. Why does the real site accept the code?',
			options: [
				'The attacker can compute the code from the stolen password alone',
				'The code depends only on the secret and the current time step',
				'TOTP codes stay valid for 10 minutes, so the relay has time',
				'The real site skips the TOTP check when the password is correct'
			],
			answer: 1,
			why: 'The code is HMAC(secret, time step), truncated to 6 digits. Nothing in it names the page where it was typed, so a code passed on within the step is identical to one the user typed on the real site.'
		},
		{
			q: 'The same relay is tried against a user with a FIDO2 security key. Why does it fail?',
			options: [
				'The key refuses to work on any page that has no padlock icon',
				'The key signs the fake page’s origin, and the real server rejects it',
				'The key changes its code every 5 seconds instead of every 30',
				'The key sends the password straight to the real login server'
			],
			answer: 1,
			why: 'With WebAuthn, the browser hands the page origin to the key along with the server challenge, and the key signs both. The signature made on `cloudflare-okta.com` names that origin, so the real server’s check fails.'
		}
	],
	recall: {
		q: 'In TOTP, how is the 6-digit code built from the HMAC-SHA1 output?',
		a: 'Take the low 4 bits of the last byte as an offset, read 4 bytes there, clear the top bit, and keep the number mod 1,000,000. For counter 1 with the RFC secret: offset 11, `41397eea`, 1094287082, code `287082`.'
	},
	sources: [
		{ title: 'Cloudflare blog, The mechanics of a sophisticated phishing scam and how we stopped it', url: 'https://blog.cloudflare.com/2022-07-sms-phishing-attacks/' },
		{ title: 'RFC 6238, TOTP: Time-Based One-Time Password Algorithm', url: 'https://www.rfc-editor.org/rfc/rfc6238' },
		{ title: 'RFC 4226, HOTP: An HMAC-Based One-Time Password Algorithm', url: 'https://www.rfc-editor.org/rfc/rfc4226' },
		{ title: 'MDN, Web Authentication API', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API' },
		{ title: 'MDN, AuthenticatorAssertionResponse: signature', url: 'https://developer.mozilla.org/en-US/docs/Web/API/AuthenticatorAssertionResponse/signature' },
		{ title: 'NIST SP 800-63B, Authentication and Authenticator Management', url: 'https://pages.nist.gov/800-63-4/sp800-63b.html' }
	]
};
