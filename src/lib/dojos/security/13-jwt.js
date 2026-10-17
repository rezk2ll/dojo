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
