const AK = 'https://github.com/goauthentik/authentik/blob/a24ae91a24767a8ef90a6f2d04a52da4d1ef6b7c';
const GRANT = `${AK}/authentik/providers/oauth2/token/authorization_code.py`;
const UTILS = `${AK}/authentik/providers/oauth2/utils.py`;
const GO_PKCE = 'https://github.com/golang/oauth2/blob/c624b89dadc3221560b7345c090bbe69e90808ee/pkce.go';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'oauth2',
	part: 'Identity',
	title: 'OAuth 2 in plain words',
	minutes: 10,
	hook: [
		'On 21 November 2023, authentik, an open-source identity provider for single sign-on, published advisory GHSA-fm34-v8xq-f2c3. When an app started a login with a `code_challenge`, authentik checked the `code_verifier` "ONLY when it is provided". A token request that left the verifier out got a token anyway.',
		'The advisory gives the attack. A malicious mobile app registers the same link as the real app, such as `mycoolapp://oauth2`, and receives the authorization code. With the check in place, that code "would not work" without the verifier. Without it, the code was enough. Versions 2023.8.5 and 2023.10.4 fixed it.',
		'Two months later, on 29 January 2024, a second advisory (CVE-2024-23647, CVSS 6.5) showed the other half: an attacker who removed `code_challenge` from the authorization request skipped the check too. Below: the authorization code flow with PKCE, what each party sees, and the two checks a server must make.'
	],
	terms: [
		{ term: 'Authorization code', def: 'A short-lived, single-use string the login server puts in the redirect back to the app. The app trades it for an access token at the token endpoint. RFC 6749 recommends a lifetime of 10 minutes at most.' },
		{ term: 'Public client', def: 'An app that cannot keep a secret, such as a mobile app or a single-page app. Anyone can unpack it and read any client secret inside.' },
		{ term: 'code_verifier', def: 'A random string of 43 to 128 characters that the app creates for one login and keeps to itself until the token request.' },
		{ term: 'code_challenge', def: 'With method `S256`, the base64url-encoded SHA-256 hash of the code_verifier. The app sends it in the first request, and the server stores it with the code.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['app["App creates code_verifier (32 random bytes, 43 chars)"] -->|"code_challenge = BASE64URL(SHA256(verifier))"| authz["Browser: GET /authorize?response_type=code&code_challenge=...&state=..."]'],
				highlight: ['app', 'authz'],
				note: 'The app creates a fresh `code_verifier` and keeps it in memory. It opens the browser on `/authorize` with `client_id`, `redirect_uri`, `state` and the `code_challenge`, which is the SHA-256 hash of the verifier. The verifier itself stays in the app.'
			},
			{
				add: ['authz --> login["User logs in and consents on the login server"]', 'login -->|"store challenge with the code"| redirect["Redirect to mycoolapp://oauth2?code=...&state=..."]'],
				highlight: ['login', 'redirect'],
				note: 'The user types the password on the login server’s page, never in the app. The server stores the `code_challenge` with the new authorization code. It then redirects the browser to `redirect_uri` with the code and the same `state`.'
			},
			{
				add: ['redirect -->|"same custom scheme registered"| evil["Malicious app receives the code"]', 'evil -->|"POST /token with code, no verifier"| deny["Server: invalid_grant"]'],
				highlight: ['evil', 'deny'],
				note: 'A second app on the phone has registered `mycoolapp://` too and catches the code. It sends the code to `/token`. The code has a stored challenge and the request has no verifier, so a correct server answers `invalid_grant`. Before 2023.8.5, authentik issued the token here.'
			},
			{
				add: ['redirect --> real["Real app: POST /token with code and code_verifier"]', 'real -->|"SHA256(verifier) matches stored challenge"| token["Access token for the real app"]'],
				highlight: ['real', 'token'],
				note: 'The real app sends `grant_type=authorization_code`, the code, the `redirect_uri` and its `code_verifier`. The server hashes the verifier, base64url-encodes it and compares the result with the stored challenge. They match, so the app gets an access token. It has never seen the user’s password.'
			}
		]
	},
	example: {
		title: 'authentik/providers/oauth2/token/authorization_code.py: checking the code and PKCE',
		repo: 'goauthentik/authentik',
		url: `${GRANT}#L14-L55`,
		lang: 'python',
		code: `    def parse(self, request: HttpRequest) -> None:
        super().parse(request)
        raw_code = request.POST.get("code", "")
        if not raw_code:
            self.logger.warning("Missing authorization code")
            raise TokenError("invalid_grant")

        self.check_redirect_uri(request)

        self.authorization_code = AuthorizationCode.objects.filter(code=raw_code).first()
        if not self.authorization_code:
            self.logger.warning("Code does not exist", code=raw_code)
            raise TokenError("invalid_grant")

        if self.authorization_code.is_expired:
            self.logger.warning(
                "Code is expired",
                token=raw_code,
            )
            raise TokenError("invalid_grant")

        if self.authorization_code.provider != self.provider or self.authorization_code.is_expired:
            self.logger.warning("Invalid code: invalid client or code has expired")
            raise TokenError("invalid_grant")

        # Validate PKCE parameters.
        if self.authorization_code.code_challenge:
            # Authorization code had PKCE but we didn't get one
            if not self.code_verifier:
                raise TokenError("invalid_grant")
            if self.authorization_code.code_challenge_method == PKCE_METHOD_S256:
                new_code_challenge = pkce_s256_challenge(self.code_verifier)
            else:
                new_code_challenge = self.code_verifier

            if new_code_challenge != self.authorization_code.code_challenge:
                self.logger.warning("Code challenge not matching")
                raise TokenError("invalid_grant")
        # Token request had a code_verifier but code did not have a code challenge
        # Prevent downgrade
        if not self.authorization_code.code_challenge and self.code_verifier:
            raise TokenError("invalid_grant")`,
		notes: [
			'Lines 8 to 24 run before PKCE: the `redirect_uri` must match, the code must exist, must not be expired and must have been issued by this provider. Each failure returns the same `invalid_grant`.',
			'Lines 29 and 30 refuse a token request with no verifier when the code was issued with a challenge. The November 2023 advisory asked for this check, and the malicious app’s request stops here.',
			'Line 32 hashes the verifier with [`pkce_s256_challenge`](' + UTILS + '#L115-L121): `urlsafe_b64encode(sha256(verifier))` with the `=` padding removed, the formula of RFC 7636 section 4.6. Line 36 compares it with the stored challenge.',
			'Lines 41 and 42 refuse a verifier when the code has no challenge. RFC 9700 requires it: servers "MUST mitigate PKCE downgrade attacks by ensuring that a token request containing a code_verifier parameter is accepted only if a code_challenge parameter was present in the authorization request".',
			'On the client side, Go’s `golang.org/x/oauth2` does the other half. [`GenerateVerifier`](' + GO_PKCE + '#L27-L62) reads 32 bytes from `crypto/rand` and returns 43 base64url characters. `S256ChallengeOption(verifier)` goes to `AuthCodeURL`, and `VerifierOption(verifier)` goes to `Exchange`.'
		]
	},
	tradeoff: {
		gain: [
			'A code caught by another app on the phone is useless: the token endpoint needs the verifier, and only its SHA-256 hash ever left the real app.',
			'PKCE works for public clients, which have no client secret to prove who they are at the token endpoint.'
		],
		cost: [
			'The app must keep one verifier per login between the redirect out and the callback, and send it back unchanged.',
			'The server must store the challenge with every code and run both checks. authentik missed the first until 2023.8.5 and the second until 2023.8.7.',
			'With method `plain`, the challenge is the verifier itself. RFC 7636 warns that an attacker who observes the challenge then holds the verifier.'
		]
	},
	task: {
		prompt: 'Here is a token endpoint. Find every check it is missing, and name the attack each gap allows.\n\n```python\ndef token(request):\n    code = Code.objects.get(value=request.POST["code"])\n    verifier = request.POST.get("code_verifier")\n    if verifier and code.challenge:\n        if s256(verifier) != code.challenge:\n            return error("invalid_grant")\n    return issue_token(code.user)\n```\n\nThen check one value by hand: RFC 7636 appendix B uses the verifier `dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk`. Compute its S256 challenge in a terminal.',
		hint: 'Compare with lines 8 to 42 of the authentik excerpt: what happens when `verifier` is `None` but `code.challenge` is set, and the other way round? For the hash: `printf %s VERIFIER | openssl dgst -sha256 -binary | base64 | tr "+/" "-_" | tr -d "="`.',
		answer: [
			'Missing verifier: when `code.challenge` is set and `verifier` is `None`, the `if` is skipped and a token is issued. A malicious app that caught the code redeems it. authentik had this bug as CVE-2023-48228.',
			'Downgrade: when `code.challenge` is empty and a verifier is sent, the request passes. An attacker who removed `code_challenge` from their own authorization request can inject that code into the victim’s session. authentik had this bug as CVE-2024-23647, and RFC 9700 section 4.8 describes the attack.',
			'Also missing: the code is never checked for expiry or reuse (RFC 6749 recommends 10 minutes at most and says the client "MUST NOT use the authorization code more than once"), it is never checked against the client, and `redirect_uri` is never compared.',
			'The hash: the command prints `E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM`, the `code_challenge` given in RFC 7636 appendix B.'
		]
	},
	quiz: [
		{
			q: 'A malicious app on the phone catches the authorization code sent to `mycoolapp://oauth2`. The server checks PKCE correctly. What happens when that app calls `/token` with the code?',
			options: [
				'It gets a token, because the code alone proves the user consented',
				'It gets `invalid_grant`, because it has no verifier that hashes to the stored challenge',
				'It gets a token limited to read scopes until the user approves again',
				'It gets a token, but the token stops working once the real app logs in'
			],
			answer: 1,
			why: 'The server stored the `code_challenge` with the code. At the token endpoint it hashes the received `code_verifier` and compares. The malicious app saw only the code and, at most, the challenge, and SHA-256 cannot be reversed to get the verifier.'
		},
		{
			q: 'During the authorization step, what does the login server store alongside the new code?',
			options: [
				'The `code_verifier`, so it can compare it with the one sent later',
				'The user’s password hash, so the token endpoint can log the user in again',
				'The `code_challenge` and its method, bound to that code',
				'The client secret, copied from the app’s first request'
			],
			answer: 2,
			why: 'RFC 7636 says the server "records the code_challenge and code_challenge_method along with the code". The verifier is sent only once, in the token request, so the server never has it before that moment.'
		},
		{
			q: 'An attacker removes `code_challenge` from an authorization request they start on their own device, then slips the resulting code into the victim’s session. Which server rule stops this?',
			options: [
				'Reject any authorization request that has no `state` parameter',
				'Reject a token request with a `code_verifier` if the code has no challenge',
				'Reject a token request whose `redirect_uri` uses a custom scheme',
				'Reject a code that is older than 60 seconds at the token endpoint'
			],
			answer: 1,
			why: 'The victim’s app sends its own verifier with the attacker’s code. The server sees a verifier for a code issued without a challenge, which RFC 9700 says it must refuse. authentik added this check in 2023.8.7 and 2023.10.7.'
		}
	],
	recall: {
		q: 'At the token endpoint, which two cases must a PKCE server refuse with `invalid_grant`?',
		a: 'A code issued with a `code_challenge` but no `code_verifier` in the request (CVE-2023-48228), and a `code_verifier` sent for a code issued without a challenge (CVE-2024-23647).'
	},
	sources: [
		{ title: 'authentik advisory GHSA-fm34-v8xq-f2c3, OAuth2: Insufficient PKCE check', url: 'https://github.com/goauthentik/authentik/security/advisories/GHSA-fm34-v8xq-f2c3' },
		{ title: 'authentik advisory GHSA-mrx3-gxjx-hjqj, PKCE downgrade attack', url: 'https://github.com/goauthentik/authentik/security/advisories/GHSA-mrx3-gxjx-hjqj' },
		{ title: 'RFC 6749, The OAuth 2.0 Authorization Framework', url: 'https://www.rfc-editor.org/rfc/rfc6749' },
		{ title: 'RFC 7636, Proof Key for Code Exchange by OAuth Public Clients', url: 'https://www.rfc-editor.org/rfc/rfc7636' },
		{ title: 'RFC 9700, Best Current Practice for OAuth 2.0 Security', url: 'https://www.rfc-editor.org/rfc/rfc9700' },
		{ title: 'golang.org/x/oauth2, pkce.go (GenerateVerifier, S256ChallengeOption)', url: GO_PKCE }
	]
};
