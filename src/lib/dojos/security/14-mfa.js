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
		],
		steps: [
			{
				title: 'Find the offset',
				questions: [
					{ q: 'Which byte of the HMAC gives the offset?', options: ['The first byte', 'The last byte', 'The byte at position 4', 'The middle byte'], answer: 1, why: 'Line 12: `offset = hmac_hash[-1] & 0xF`, the low 4 bits of the last byte.' },
					{ q: 'The HMAC ends in `5a`. What is the offset?', options: ['5', '90', '10', '15'], answer: 2, why: '`0x5a & 0xF` keeps the last hex digit, `a`, which is 10.' },
					{ q: 'How many bytes is an HMAC-SHA1 output?', options: ['16', '32', '8', '20'], answer: 3, why: 'The hex string has 40 digits, two per byte, so 20 bytes, numbered 0 to 19.' },
					{ q: 'Why can the offset never run past the end?', options: ['It is at most 15, and bytes 15 to 18 still fit in 20', 'pyotp wraps around to the start', 'The secret is padded to fit', 'SHA-1 always ends in a small byte'], answer: 0, why: '4 bits give 0 to 15. Reading 4 bytes from 15 ends at byte 18, inside the 20-byte output.' }
				]
			},
			{
				title: 'Read the code',
				questions: [
					{ q: 'Which 4 bytes start at offset 10?', options: ['`ca 16 61 85`', '`50 ef 7f 19`', '`ef 7f 19 da`', '`55 5a 1f 86`'], answer: 1, why: 'Counting from 0, two hex digits per byte, bytes 10 to 13 are `50 ef 7f 19`.' },
					{ q: 'What does `& 0x7F` on the first byte do?', options: ['It clears the top bit, so the number is 31 bits and never negative', 'It keeps only the last digit', 'It turns the number into base32', 'It adds the time step'], answer: 0, why: 'RFC 4226 clears the top bit "to avoid confusion about signed vs. unsigned modulo computations".' },
					{ q: '`0x50ef7f19` is 1357872921. What is the 6-digit code?', options: ['`135787`', '`357872`', '`921000`', '`872921`'], answer: 3, why: 'The code is `code % 10**6`, the last 6 digits. It matches the worked example in RFC 4226 section 5.4.' },
					{ q: 'The number mod 10^6 is 41234. What does pyotp show?', options: ['`41234`', '`412340`', '`041234`', '`0041234`'], answer: 2, why: 'Lines 19 and 20 add `10_000_000_000` and slice the last 6 characters, which keeps the leading zero.' }
				]
			},
			{
				title: 'Work out the window',
				questions: [
					{ q: 'With `valid_window=1`, which steps does the server accept a code for?', options: ['Only T', 'T and T+1', 'T-1, T and T+1', 'Any step in the last 10 minutes'], answer: 2, why: 'A window of 1 adds one step on each side of the current one.' },
					{ q: 'The user types the code for step T at 5 seconds into T. How much of T is left?', options: ['25 seconds', '30 seconds', '5 seconds', '55 seconds'], answer: 0, why: 'A step lasts 30 seconds, and 5 have passed.' },
					{ q: 'Is that step T code still accepted during step T+1?', options: ['No: it expired at the end of T', 'Yes: during T+1 the server also accepts T, as its T-1', 'Only for the first 5 seconds of T+1', 'Only if the user types it again'], answer: 1, why: 'At step T+1 the window is T, T+1 and T+2, so the step T code still passes.' },
					{ q: 'So for how long can the attacker use the code?', options: ['30 seconds', '25 seconds', '85 seconds', '55 seconds'], answer: 3, why: 'The remaining 25 seconds of T, plus the 30 seconds of T+1.' }
				]
			},
			{
				title: 'Count the uses and fix it',
				questions: [
					{ q: 'The server never records used codes. How many times can the attacker use the code in those 55 seconds?', options: ['Once', 'Twice', 'As many times as they like', 'None: the user used it first'], answer: 2, why: 'pyotp’s `verify` keeps no record, so the same code passes on every try inside the window.' },
					{ q: 'What does RFC 6238 ask the verifier to do?', options: ['Refuse a second use of an OTP after one succeeded', 'Shorten the step to 10 seconds', 'Send the code by SMS too', 'Accept any code within 10 minutes'], answer: 0, why: 'The verifier "MUST NOT accept the second attempt of the OTP after the successful validation".' },
					{ q: 'How do you refuse the replays with pyotp?', options: ['Call `verify` twice', 'Set `valid_window=0`', 'Store the code itself forever', 'Store the step from `verify_and_get_timecode` and refuse any step not greater than it'], answer: 3, why: 'Once a step is used, that step and every older one are refused, which leaves one use.' },
					{ q: 'With that fix, the attacker logs in with the relayed code, then tries it again 10 seconds later. What happens?', options: ['Accepted: it is still inside the 55 seconds', 'Refused: its step is already stored, and the same step is not greater', 'Accepted once more, then refused', 'Refused: the code expired 10 seconds after its first use'], answer: 1, why: 'The window still covers the code, but the stored step blocks it. The fix cuts the attacker down to one use, not to zero.' }
				]
			}
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
	lab: {
		minutes: 25,
		goal: 'Compute TOTP codes yourself, match the RFC test values, and add the replay check that pyotp’s `verify` leaves out.',
		steps: [
			'Make a folder: `mkdir -p ~/totp-lab && cd ~/totp-lab`.',
			'Write `totp.py` with a function `totp(secret, t, digits=6)`: base32-decode the secret, HMAC-SHA1 the step `int(t // 30)` packed as 8 big-endian bytes, then truncate as in lines 12 to 20 of pyotp. Make `python3 totp.py SECRET TIME` print the code.',
			'Check the RFC 6238 test value: `python3 -c \'from totp import totp; print(totp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 59, 8))\'`.',
			'Check the task by hand: `python3 -c \'n = int("50ef7f19", 16) & 0x7FFFFFFF; print(n, n % 10**6)\'`.',
			'See the step boundary: `python3 totp.py GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ 59`, then the same with `60` and `89`.',
			'Write `guard.py` with `verify(secret, code, now, last_step)`: try steps T-1, T and T+1, accept only a step greater than `last_step`, and return it, or `None`. Test it: `python3 -c \'from totp import totp; from guard import verify; s = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"; c = totp(s, 65); print(verify(s, c, 65, 0), verify(s, c, 70, 2), verify(s, c, 119, 0), verify(s, c, 120, 0))\'`.'
		],
		done: [
			'The RFC check prints `94287082`.',
			'The hand check prints `1357872921 872921`.',
			'Times `60` and `89` print the same code, and time `59` prints a different one.',
			'The guard test prints `2 None 2 None`.'
		],
		solution: [
			'`h = hmac.new(base64.b32decode(secret), struct.pack(">Q", int(t // 30)), hashlib.sha1).digest()`',
			'`o = h[-1] & 0xF`, then `n = int.from_bytes(h[o:o + 4], "big") & 0x7FFFFFFF`, then `return str(n % 10**digits).zfill(digits)`.',
			'In `guard.py`: `for step in (now // 30 - 1, now // 30, now // 30 + 1): if step > last_step and totp(secret, step * 30) == code: return step`, then `return None`.',
			'Read the guard test: a code typed at 65 (step 2) passes once, is refused when step 2 is stored, still passes at 119 for a fresh user, and fails at 120. That is the 55-second window. Clean up with `rm -rf ~/totp-lab`.'
		]
	},
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
