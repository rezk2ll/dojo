const PYJWT = 'https://github.com/jpadilla/pyjwt/blob/16231abfd1d8eab4953e8779b3017b859c88565e';
const JWS = `${PYJWT}/jwt/api_jws.py`;
const ALGS = `${PYJWT}/jwt/algorithms.py`;
const JWT_PY = `${PYJWT}/jwt/api_jwt.py`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'jwt',
	part: 'Identity',
	title: 'JWT pitfalls',
	minutes: 10,
	hook: [
		'A JWT names its own signing algorithm in its header, in the `alg` field. In 2015, Tim McLean found libraries, `pyjwt` and `node-jsonwebtoken` among them, that let this field pick how the signature was checked. An attacker could set `alg` to `none` and skip the signature, or switch `RS256` to `HS256` and sign with the server’s public key.',
		'PyJWT blocked the second trick with a list of strings it refused inside an HMAC secret, such as `ssh-rsa` and `-----BEGIN PUBLIC KEY-----`. From 2.0.0 it also accepted Ed25519 keys written as `ssh-ed25519 ...`, a string missing from that list. On 24 May 2022, advisory GHSA-ffqj-6fqr-9h24 (CVE-2022-29217, CVSS 7.4) showed a token signed with HS256 and the public key passing as valid.',
		'The attack needed an app that called `jwt.decode(..., algorithms=jwt.algorithms.get_default_algorithms())`, which accepts every algorithm. Version 2.4.0 fixed it. Below: what a verifier must check in a JWT, and why a JWT stays valid after the user logs out.'
	],
	terms: [
		{ term: 'JWT', def: 'JSON Web Token: three base64url parts joined by dots, `header.payload.signature`. Anyone holding the token can decode and read the first two parts.' },
		{ term: 'alg', def: 'The header field that names the signing algorithm, such as `RS256` (RSA signature) or `HS256` (HMAC with a shared secret). The sender of the token chooses it.' },
		{ term: 'Algorithm confusion', def: 'Tricking a verifier into checking a signature with a different algorithm than the issuer used, for example HMAC keyed with the issuer’s RSA public key.' },
		{ term: 'exp', def: 'The expiry claim: a Unix time in seconds after which the token must be refused. A verifier that finds no `exp` has no date after which to refuse the token.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['issuer["Auth server signs RS256 with its private key"] --> tok["JWT: header alg=RS256, payload sub=42 role=user"]', 'issuer -.->|"publishes"| pub["Public key, known to everyone"]'],
				highlight: ['issuer', 'tok', 'pub'],
				note: 'The auth server signs each token with its RSA private key. Every API checks the signature with the matching public key. The public key is published, so anyone can download it, the attacker included.'
			},
			{
				add: ['tok --> forged["Attacker edits: alg=HS256, role=admin, HMAC-SHA256 keyed with the public key"]'],
				highlight: ['forged'],
				note: 'The attacker decodes the token, sets `alg` to `HS256` and `role` to `admin`. They compute an HMAC-SHA256 over `header.payload`, using the bytes of the public key as the HMAC secret.'
			},
			{
				add: ['forged --> naive["Naive verifier: takes alg from the header, verifies HMAC with its configured key"]', 'naive -->|"HMAC matches"| admin["Request runs as admin"]'],
				highlight: ['naive', 'admin'],
				note: 'A naive verifier reads `alg: HS256` and picks HMAC. Its configured key is the public key, the same bytes the attacker used. The HMAC matches and the forged token passes.'
			},
			{
				add: ['forged --> strict["PyJWT: algorithms=[RS256]"]', 'strict -->|"HS256 not in the list"| reject["InvalidAlgorithmError"]'],
				highlight: ['strict', 'reject'],
				note: 'PyJWT requires the caller to pass `algorithms`. With `algorithms=["RS256"]`, the token’s `HS256` is not in the list and `decode` raises `InvalidAlgorithmError` before any key is used. Even with `HS256` allowed, PyJWT refuses a PEM or SSH public key as an HMAC secret.'
			},
			{
				add: ['tok --> logout["User logs out at 10:00, token has exp=10:15"]', 'logout -->|"signature and exp still valid"| still["Token works until 10:15"]'],
				highlight: ['logout', 'still'],
				note: 'PyJWT checks the signature and the `exp` claim, and never asks the auth server whether the token was revoked. A token stolen before logout keeps working until `exp`, unless every API also checks a denylist keyed on the `jti` claim.'
			}
		]
	},
	example: {
		title: 'jwt/api_jws.py: PyJWT’s _verify_signature',
		repo: 'jpadilla/pyjwt',
		url: `${JWS}#L397-L446`,
		lang: 'python',
		code: `    def _verify_signature(
        self,
        signing_input: bytes,
        header: dict[str, Any],
        signature: bytes,
        key: AllowedPublicKeys | PyJWK | str | bytes = "",
        algorithms: Sequence[str] | None = None,
        options: SigOptions | None = None,
    ) -> None:
        effective_options = options if options is not None else self.options

        if algorithms is None and isinstance(key, PyJWK):
            algorithms = [key.algorithm_name]
        try:
            alg = header["alg"]
        except KeyError:
            raise InvalidAlgorithmError("Algorithm not specified") from None

        if not alg or (algorithms is not None and alg not in algorithms):
            raise InvalidAlgorithmError("The specified alg value is not allowed")

        if isinstance(key, PyJWK):
            # The PyJWK has a fixed algorithm bound at construction time.
            # Verification must use that algorithm, not whatever the token
            # header advertises, otherwise the caller's allow-list check
            # above degenerates into a string compare with no behavioural
            # effect on which algorithm actually verifies the signature.
            if alg != key.algorithm_name:
                raise InvalidAlgorithmError(
                    f"Token algorithm {alg!r} does not match the key's "
                    f"algorithm {key.algorithm_name!r}"
                )
            alg_obj = key.Algorithm
            prepared_key = alg_obj.prepare_key(key.key)
        else:
            try:
                alg_obj = self.get_algorithm_by_name(alg)
            except NotImplementedError as e:
                raise InvalidAlgorithmError("Algorithm not supported") from e
            prepared_key = alg_obj.prepare_key(key)

        key_length_msg = alg_obj.check_key_length(prepared_key)
        if key_length_msg:
            if effective_options.get("enforce_minimum_key_length", False):
                raise InvalidKeyError(key_length_msg)
            else:
                warnings.warn(key_length_msg, InsecureKeyLengthWarning, stacklevel=4)

        if not alg_obj.verify(signing_input, prepared_key, signature):
            raise InvalidSignatureError("Signature verification failed")`,
		notes: [
			'Line 15 reads `alg` from the token header, which the sender controls. Line 19 refuses it unless it is in the caller’s `algorithms` list. Before that, [`decode_complete`](' + JWS + '#L247-L250) raises an error if the caller passed no list at all.',
			'Lines 22 to 34 handle a `PyJWK` key, which is bound to one algorithm: a token whose `alg` differs is refused at line 28. RFC 8725 asks for this: "each key MUST be used with exactly one algorithm".',
			'Line 40 calls `prepare_key`. For HMAC, [`prepare_key`](' + ALGS + '#L346-L360) refuses any key in PEM, SSH or DER form as "an asymmetric key or x509 certificate". The 2.4.0 fix replaced a list of four fixed strings with format checks.',
			'Line 49 is the only place a signature is checked. For `alg: none`, PyJWT’s `NoneAlgorithm.verify` always returns `False`, so line 50 raises `InvalidSignatureError` for every unsigned token.',
			'Expiry is checked elsewhere, in [`api_jwt.py`](' + JWT_PY + '#L399-L410), and only `if "exp" in payload`. A token issued without `exp` passes unless the caller sets `options={"require": ["exp"]}`.'
		]
	},
	tradeoff: {
		gain: [
			'An API can verify a JWT with only the public key and the clock, with no call to the auth server on each request.',
			'With `algorithms=["RS256"]` fixed in code, the token header cannot pick HMAC or `none`, whatever it says.'
		],
		cost: [
			'A stolen token keeps working until `exp`. Logging out or disabling the user changes nothing in the token.',
			'Revoking early needs server state again: a denylist of `jti` values that every API checks, or a token status list.',
			'The payload is only base64url-encoded. Anyone who sees the token, in a log or in browser storage, can read every claim.'
		]
	},
	task: {
		prompt: 'Find the problems in this Flask helper, which reads a token signed by your auth server with RS256. Then write the fixed `decode` call.\n\n```python\ndef current_user():\n    token = request.headers["Authorization"].removeprefix("Bearer ")\n    header = jwt.get_unverified_header(token)\n    claims = jwt.decode(token, PUBLIC_KEY, algorithms=[header["alg"]])\n    return User.query.get(claims["sub"])\n```\n\nThe auth server issues tokens without an `exp` claim. Users click "Log out" and the front end deletes the token from local storage.',
		hint: 'Who chooses the value of `header["alg"]`? What does PyJWT do with a token that has no `exp`? What happens to a copy of the token taken before the user logged out?',
		answer: [
			'`algorithms=[header["alg"]]` takes the allow-list from the token itself, so line 19 of `_verify_signature` can never refuse anything. A current PyJWT still blocks `HS256` with a PEM public key in `prepare_key`, but PyJWT before 2.4.0 accepted an `ssh-ed25519` public key as an HMAC secret.',
			'No `exp`: PyJWT validates expiry only `if "exp" in payload`, so these tokens never expire. A token copied from a log a year ago still works.',
			'Log out deletes the browser’s copy only. Any other copy stays valid, because the API checks nothing but the signature and the claims.',
			'Fix: `jwt.decode(token, PUBLIC_KEY, algorithms=["RS256"], options={"require": ["exp", "sub"]})`, have the auth server set a short `exp` (for example 15 minutes), and for logout add the token’s `jti` to a denylist that the API checks until that `exp`.'
		],
		steps: [
			{
				title: 'Read the helper',
				questions: [
					{ q: 'Where does `header["alg"]` come from?', options: ['The auth server’s config', 'The token itself, which the sender controls', 'PyJWT’s default algorithm list', 'The `PUBLIC_KEY` file'], answer: 1, why: '`get_unverified_header` decodes the first part of the token. Whoever sent the token chose that value.' },
					{ q: 'What does `algorithms=[header["alg"]]` do to the check at line 19?', options: ['It makes it stricter', 'It turns it into the RS256-only check', 'It makes it never refuse anything', 'It skips the signature check at line 49'], answer: 2, why: 'The allow-list is built from the token, so the token’s `alg` is always in it.' },
					{ q: 'What can anyone holding the token read?', options: ['Only the header', 'Nothing, the payload is encrypted', 'Only the signature', 'The header and every claim in the payload'], answer: 3, why: 'The first two parts are only base64url-encoded, so anyone can decode them.' },
					{ q: 'Which key does the API use to verify RS256 tokens?', options: ['The auth server’s public key, known to everyone', 'The auth server’s private key', 'A secret shared with each user', 'The user’s password hash'], answer: 0, why: 'The auth server signs with its private key, and every API checks with the published public key.' }
				]
			},
			{
				title: 'Spot the algorithm problem',
				questions: [
					{ q: 'Who should choose which algorithms the API accepts?', options: ['The token header', 'The API code, as a fixed list', 'The user, at login', 'The front end'], answer: 1, why: 'With `algorithms=["RS256"]` in code, the header cannot pick HMAC or `none`, whatever it says.' },
					{ q: 'What does a current PyJWT still do for `HS256` with a PEM public key?', options: ['It accepts it as a normal secret', 'It converts the key to RSA', 'It refuses the key in `prepare_key`', 'It only logs a warning'], answer: 2, why: '`prepare_key` for HMAC refuses any key in PEM, SSH or DER form. That is a second line of defense, not a reason to keep the header-derived list.' },
					{ q: 'With `algorithms=[header["alg"]]`, an attacker sends a token with `alg: none` and no signature. What stops it?', options: ['PyJWT itself: its `none` algorithm never accepts a token', 'Line 19: `none` is never in the list', 'Nothing: the helper returns the attacker’s `sub`', 'The `removeprefix("Bearer ")` call'], answer: 0, why: 'The header-built list lets `none` through line 19. PyJWT’s `NoneAlgorithm` never verifies, so this one is saved by the library, not by the helper.' },
					{ q: 'What does RFC 8725 ask about keys and algorithms?', options: ['Each key may be used with any algorithm', 'Keys must rotate every day', 'Algorithms must be read from the header', 'Each key must be used with exactly one algorithm'], answer: 3, why: 'Binding a key to one algorithm stops a verifier from being pushed onto a different one.' }
				]
			},
			{
				title: 'Spot the lifetime problems',
				questions: [
					{ q: 'The tokens have no `exp`. What does PyJWT do by default?', options: ['It refuses them', 'It accepts them: expiry is checked only `if "exp" in payload`', 'It gives them a 15-minute lifetime', 'It asks the auth server'], answer: 1, why: 'Without `options={"require": ["exp"]}`, a token with no `exp` passes, so it never expires.' },
					{ q: 'A token from this auth server was copied into a log a year ago. Someone sends it to the API today. What happens?', options: ['PyJWT refuses it as too old', 'The API asks the auth server whether it is still valid', 'The API accepts it: with no `exp`, it never expires', 'It fails the signature check, since the key is a year older'], answer: 2, why: 'Nothing in the token or the check limits its age. The signature is still correct, and PyJWT checks expiry only when `exp` is present.' },
					{ q: 'What does the API check on each request in this design?', options: ['The signature and the claims, with the public key and the clock', 'A session row in the database', 'The auth server, through a live call', 'The user’s IP address'], answer: 0, why: 'That is the gain of a JWT: no call per request. It is also why revoking needs extra server state.' },
					{ q: 'What ends a token early, before its `exp`?', options: ['Deleting it from local storage', 'Rotating the user’s password', 'Changing the `sub` claim', 'A server-side denylist keyed on `jti` that every API checks'], answer: 3, why: 'Only server state can revoke a token that is still correctly signed and unexpired.' }
				]
			},
			{
				title: 'Write the fix',
				questions: [
					{ q: 'The fixed call passes `algorithms=["RS256"]`. What happens to the `get_unverified_header` line?', options: ['It must stay, to pick the key', 'It can go: `decode` reads `alg` itself and checks it against the fixed list', 'It must move after `decode`', 'It must stay, so PyJWT can read `exp`'], answer: 1, why: 'The helper read the header only to build the allow-list. With a fixed list, line 19 of `_verify_signature` does the check, and the unverified header has no use left.' },
					{ q: 'You ship `options={"require": ["exp", "sub"]}` today. What happens to the tokens the auth server issues now?', options: ['They pass: `require` applies only to tokens issued after the change', 'They pass with a warning', 'Each one is refused, because none of them has an `exp`', 'PyJWT gives each a default `exp`'], answer: 2, why: '`require` refuses any token missing a listed claim. Every token this auth server issues has no `exp`, so the auth server change has to ship first.' },
					{ q: 'What should the auth server change?', options: ['Set a short `exp`, for example 15 minutes', 'Remove the signature to save bytes', 'Switch to `HS256` with the public key', 'Put the password in the payload'], answer: 0, why: 'A short `exp` limits how long a copied token works.' },
					{ q: 'How long must the API keep a `jti` on the denylist after logout?', options: ['Forever', 'One hour', 'Until the user logs in again', 'Until that token’s `exp`'], answer: 3, why: 'After `exp` the token is refused anyway, so the entry can go.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Your API verifies RS256 tokens. An attacker sends a token with `alg: HS256`, signed with HMAC using your public key as the secret. Which PyJWT call refuses it before any key is used?',
			options: [
				'`jwt.decode(token, PUBLIC_KEY, algorithms=jwt.algorithms.get_default_algorithms())`',
				'`jwt.decode(token, PUBLIC_KEY, algorithms=["RS256"])`',
				'`jwt.decode(token, options={"verify_signature": False})`',
				'`jwt.decode(token, PUBLIC_KEY, algorithms=[jwt.get_unverified_header(token)["alg"]])`'
			],
			answer: 1,
			why: 'With an explicit list, `_verify_signature` compares the header’s `alg` with it and raises `InvalidAlgorithmError` for `HS256`. The default-algorithms list and the header-derived list both let `HS256` through to `prepare_key`, and turning off signature checks accepts anything.'
		},
		{
			q: 'A user logs out at 10:00. Their RS256 token has `exp` at 10:15 and the API has no denylist. An attacker copied the token at 9:55. What happens at 10:05?',
			options: [
				'The API refuses it, because the auth server revoked the session',
				'The API refuses it, because the signature changes when the user logs out',
				'The API accepts it, because the signature and `exp` are still valid',
				'The API accepts it once, then the token is marked as used'
			],
			answer: 2,
			why: 'The API verifies the token with the public key and the clock only. Nothing in the token changed at logout, and the API never asks the auth server. Only `exp` or a server-side denylist on `jti` can end it early.'
		},
		{
			q: 'Before PyJWT 2.4.0, why did an Ed25519 public key in `ssh-ed25519` form pass the HMAC key check?',
			options: [
				'Ed25519 keys are short enough to look like normal HMAC secrets',
				'The check refused a fixed list of key strings without `ssh-ed25519`',
				'PyJWT skipped key checks for any algorithm added after 2.0.0',
				'The check looked only at PEM keys and ignored every SSH key'
			],
			answer: 1,
			why: 'The old `prepare_key` refused keys containing `-----BEGIN PUBLIC KEY-----`, `-----BEGIN CERTIFICATE-----`, `-----BEGIN RSA PUBLIC KEY-----` or `ssh-rsa`. `ssh-ed25519` matches none of them. The fix checks the key format with `is_pem_format` and `is_ssh_key`.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Play the auth server with your own RSA key, then see which PyJWT setting stops a token with no `exp` and an HS256 token forged with the public key.',
		steps: [
			'Make a folder with PyJWT in it: `mkdir -p ~/jwt-lab && cd ~/jwt-lab && python3 -m venv .venv && . .venv/bin/activate && pip install pyjwt cryptography`.',
			'Make the auth server’s key pair: `openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out private.pem && openssl pkey -in private.pem -pubout -out public.pem`.',
			'Issue a token with no `exp`, as the task’s auth server does: `python3 -c \'import jwt; print(jwt.encode({"sub": "42", "role": "user"}, open("private.pem").read(), algorithm="RS256"))\' > token.txt`. Then decode it: `python3 -c \'import jwt; print(jwt.decode(open("token.txt").read().strip(), open("public.pem").read(), algorithms=["RS256"]))\'`.',
			'Decode it again with the fix’s option: `python3 -c \'import jwt; print(jwt.decode(open("token.txt").read().strip(), open("public.pem").read(), algorithms=["RS256"], options={"require": ["exp", "sub"]}))\'`.',
			'Write `forge.py`: build `header.payload` from `{"alg": "HS256", "typ": "JWT"}` and `{"sub": "42", "role": "admin"}` in base64url with no padding, sign it with HMAC-SHA256 keyed with the bytes of `public.pem`, then call `jwt.decode` twice, first with the task’s `algorithms=[jwt.get_unverified_header(t)["alg"]]`, then with `algorithms=["RS256"]`. Print the exception name each time. Run `python3 forge.py`.'
		],
		done: [
			'Step 3 prints `{\'sub\': \'42\', \'role\': \'user\'}`: a token with no `exp` passes.',
			'Step 4 fails with `MissingRequiredClaimError` and `Token is missing the "exp" claim`.',
			'In step 5, the header-derived list fails with `InvalidKeyError`: `prepare_key` refuses the PEM key as an HMAC secret.',
			'With `algorithms=["RS256"]`, step 5 fails with `InvalidAlgorithmError` instead.'
		],
		solution: [
			'`b = lambda d: base64.urlsafe_b64encode(d).rstrip(b"=")`, then `si = b(json.dumps(header).encode()) + b"." + b(json.dumps(payload).encode())` and `t = (si + b"." + b(hmac.new(open("public.pem", "rb").read(), si, hashlib.sha256).digest())).decode()`.',
			'Wrap each `jwt.decode` in `try:` and `except Exception as e: print(type(e).__name__, e)`.',
			'With the header-derived list, `HS256` reaches `prepare_key`, and only the key format check stops it. Before 2.4.0, an `ssh-ed25519` public key passed that check. With `["RS256"]`, line 19 refuses the token before any key is used. Clean up with `rm -rf ~/jwt-lab`.'
		]
	},
	recall: {
		q: 'Which two arguments make PyJWT refuse a token whose header says `HS256` and a token with no expiry?',
		a: '`algorithms=["RS256"]` (the header’s `alg` must be in that list) and `options={"require": ["exp"]}` (otherwise `exp` is checked only when present).'
	},
	sources: [
		{ title: 'GitHub Advisory GHSA-ffqj-6fqr-9h24, PyJWT key confusion (CVE-2022-29217)', url: 'https://github.com/advisories/GHSA-ffqj-6fqr-9h24' },
		{ title: 'PyJWT fix commit 9c52867 (v2.4.0)', url: 'https://github.com/jpadilla/pyjwt/commit/9c528670c455b8d948aff95ed50e22940d1ad3fc' },
		{ title: 'RFC 8725, JSON Web Token Best Current Practices', url: 'https://www.rfc-editor.org/rfc/rfc8725' },
		{ title: 'Tim McLean, Critical vulnerabilities in JSON Web Token libraries', url: 'https://auth0.com/blog/critical-vulnerabilities-in-json-web-token-libraries/' },
		{ title: 'OWASP JSON Web Token Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_Cheat_Sheet.html' }
	]
};
