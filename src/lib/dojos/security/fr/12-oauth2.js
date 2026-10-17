const AK = 'https://github.com/goauthentik/authentik/blob/a24ae91a24767a8ef90a6f2d04a52da4d1ef6b7c';
const GRANT = `${AK}/authentik/providers/oauth2/token/authorization_code.py`;
const UTILS = `${AK}/authentik/providers/oauth2/utils.py`;
const GO_PKCE = 'https://github.com/golang/oauth2/blob/c624b89dadc3221560b7345c090bbe69e90808ee/pkce.go';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'oauth2',
	part: 'L’identité',
	title: 'OAuth 2 en mots simples',
	minutes: 10,
	hook: [
		'Le 21 novembre 2023, authentik, un fournisseur d’identité open source pour le single sign-on, publie l’avis GHSA-fm34-v8xq-f2c3. Quand une appli démarrait une connexion avec un `code_challenge`, authentik vérifiait le `code_verifier` "ONLY when it is provided" (seulement s’il était fourni). Une requête de token sans verifier recevait quand même son token.',
		'L’avis décrit l’attaque. Une appli mobile malveillante enregistre le même lien que la vraie appli, par exemple `mycoolapp://oauth2`, et reçoit le code d’autorisation. Avec le contrôle, ce code "would not work" (ne marcherait pas) sans le verifier. Sans le contrôle, le code suffisait. Les versions 2023.8.5 et 2023.10.4 corrigent le bug.',
		'Deux mois plus tard, le 29 janvier 2024, un second avis (CVE-2024-23647, CVSS 6.5) montre l’autre moitié : un attaquant qui retire `code_challenge` de la requête d’autorisation saute lui aussi le contrôle.'
	],
	terms: [
		{ term: 'Code d’autorisation', def: 'Une chaîne à usage unique et de courte durée que le serveur de connexion met dans la redirection vers l’appli. L’appli l’échange contre un access token sur le token endpoint. La RFC 6749 recommande une durée de vie de 10 minutes au plus.' },
		{ term: 'Client public', def: 'Une appli incapable de garder un secret, comme une appli mobile ou une single-page app. N’importe qui peut la décompresser et lire le client secret qu’elle contiendrait.' },
		{ term: 'code_verifier', def: 'Une chaîne aléatoire de 43 à 128 caractères que l’appli crée pour une connexion et garde pour elle jusqu’à la requête de token.' },
		{ term: 'code_challenge', def: 'Avec la méthode `S256`, le hash SHA-256 du code_verifier encodé en base64url. L’appli l’envoie dans la première requête, et le serveur le garde avec le code.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['app["L’appli crée le code_verifier (32 octets aléatoires, 43 caractères)"] -->|"code_challenge = BASE64URL(SHA256(verifier))"| authz["Navigateur : GET /authorize?response_type=code&code_challenge=...&state=..."]'],
				highlight: ['app', 'authz'],
				note: 'L’appli crée un `code_verifier` neuf et le garde en mémoire. Elle ouvre le navigateur sur `/authorize` avec `client_id`, `redirect_uri`, `state` et le `code_challenge`, qui est le hash SHA-256 du verifier. Le verifier, lui, reste dans l’appli.'
			},
			{
				add: ['authz --> login["L’utilisateur se connecte et consent sur le serveur de connexion"]', 'login -->|"garde le challenge avec le code"| redirect["Redirection vers mycoolapp://oauth2?code=...&state=..."]'],
				highlight: ['login', 'redirect'],
				note: 'L’utilisateur tape son mot de passe sur la page du serveur de connexion, jamais dans l’appli. Le serveur garde le `code_challenge` avec le nouveau code d’autorisation. Puis il redirige le navigateur vers `redirect_uri` avec le code et le même `state`.'
			},
			{
				add: ['redirect -->|"même schéma enregistré"| evil["Une appli malveillante reçoit le code"]', 'evil -->|"POST /token avec le code, sans verifier"| deny["Serveur : invalid_grant"]'],
				highlight: ['evil', 'deny'],
				note: 'Une deuxième appli du téléphone a aussi enregistré `mycoolapp://` et attrape le code. Elle l’envoie à `/token`. Le code a un challenge stocké et la requête n’a pas de verifier : un serveur correct répond `invalid_grant`. Avant la 2023.8.5, authentik délivrait le token à ce moment-là.'
			},
			{
				add: ['redirect --> real["La vraie appli : POST /token avec le code et le code_verifier"]', 'real -->|"SHA256(verifier) égal au challenge stocké"| token["Access token pour la vraie appli"]'],
				highlight: ['real', 'token'],
				note: 'La vraie appli envoie `grant_type=authorization_code`, le code, la `redirect_uri` et son `code_verifier`. Le serveur hashe le verifier, l’encode en base64url et compare avec le challenge stocké. Les deux sont égaux, l’appli reçoit un access token. Elle n’a jamais vu le mot de passe de l’utilisateur.'
			}
		]
	},
	example: {
		title: 'authentik/providers/oauth2/token/authorization_code.py : vérifier le code et PKCE',
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
			'Les lignes 8 à 24 passent avant PKCE : la `redirect_uri` doit correspondre, le code doit exister, ne pas être expiré et venir de ce provider. Chaque échec renvoie le même `invalid_grant`.',
			'Les lignes 29 et 30 refusent une requête de token sans verifier quand le code a été émis avec un challenge. L’avis de novembre 2023 demandait ce contrôle, et la requête de l’appli malveillante s’arrête ici.',
			'La ligne 32 hashe le verifier avec [`pkce_s256_challenge`](' + UTILS + '#L115-L121) : `urlsafe_b64encode(sha256(verifier))` sans le remplissage `=`, la formule de la section 4.6 de la RFC 7636. La ligne 36 compare le résultat au challenge stocké.',
			'Les lignes 41 et 42 refusent un verifier quand le code n’a pas de challenge. La RFC 9700 l’exige : les serveurs "MUST mitigate PKCE downgrade attacks by ensuring that a token request containing a code_verifier parameter is accepted only if a code_challenge parameter was present in the authorization request".',
			'Côté client, le paquet Go `golang.org/x/oauth2` fait l’autre moitié. [`GenerateVerifier`](' + GO_PKCE + '#L27-L62) lit 32 octets dans `crypto/rand` et renvoie 43 caractères base64url. `S256ChallengeOption(verifier)` part dans `AuthCodeURL`, et `VerifierOption(verifier)` dans `Exchange`.'
		]
	},
	tradeoff: {
		gain: [
			'Un code attrapé par une autre appli du téléphone ne sert à rien : le token endpoint exige le verifier, et seul son hash SHA-256 a quitté la vraie appli.',
			'PKCE marche pour les clients publics, qui n’ont pas de client secret pour prouver leur identité au token endpoint.'
		],
		cost: [
			'L’appli doit garder un verifier par connexion entre la redirection et le retour, et le renvoyer tel quel.',
			'Le serveur doit stocker le challenge avec chaque code et faire les deux contrôles. authentik a raté le premier jusqu’à la 2023.8.5 et le second jusqu’à la 2023.8.7.',
			'Avec la méthode `plain`, le challenge est le verifier lui-même. La RFC 7636 prévient qu’un attaquant qui observe le challenge tient alors le verifier.'
		]
	},
	task: {
		prompt: 'Voici un token endpoint. Trouve chaque contrôle qui manque, et nomme l’attaque que chaque trou permet.\n\n```python\ndef token(request):\n    code = Code.objects.get(value=request.POST["code"])\n    verifier = request.POST.get("code_verifier")\n    if verifier and code.challenge:\n        if s256(verifier) != code.challenge:\n            return error("invalid_grant")\n    return issue_token(code.user)\n```\n\nVérifie ensuite une valeur à la main : l’annexe B de la RFC 7636 utilise le verifier `dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk`. Calcule son challenge S256 dans un terminal.',
		hint: 'Compare avec les lignes 8 à 42 de l’extrait d’authentik : que se passe-t-il quand `verifier` vaut `None` alors que `code.challenge` est rempli, et dans le cas inverse ? Pour le hash : `printf %s VERIFIER | openssl dgst -sha256 -binary | base64 | tr "+/" "-_" | tr -d "="`.',
		answer: [
			'Verifier absent : quand `code.challenge` est rempli et que `verifier` vaut `None`, le `if` est sauté et un token part. Une appli malveillante qui a attrapé le code l’échange. authentik avait ce bug, sous le nom CVE-2023-48228.',
			'Downgrade : quand `code.challenge` est vide et qu’un verifier arrive, la requête passe. Un attaquant qui a retiré `code_challenge` de sa propre requête d’autorisation peut glisser ce code dans la session de la victime. authentik avait ce bug, sous le nom CVE-2024-23647, et la section 4.8 de la RFC 9700 décrit l’attaque.',
			'Manquent aussi : l’expiration et la réutilisation du code (la RFC 6749 recommande 10 minutes au plus et dit que le client "MUST NOT use the authorization code more than once"), le lien entre le code et le client, et la comparaison de `redirect_uri`.',
			'Le hash : la commande affiche `E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM`, le `code_challenge` donné dans l’annexe B de la RFC 7636.'
		]
	},
	quiz: [
		{
			q: 'Une appli malveillante du téléphone attrape le code d’autorisation envoyé à `mycoolapp://oauth2`. Le serveur vérifie PKCE correctement. Que se passe-t-il quand cette appli appelle `/token` avec le code ?',
			options: [
				'Elle reçoit un token, car le code seul prouve que l’utilisateur a consenti',
				'Elle reçoit `invalid_grant` : aucun verifier à elle ne donne le challenge stocké',
				'Elle reçoit un token limité à la lecture jusqu’à une nouvelle approbation',
				'Elle reçoit un token, qui cesse de marcher dès que la vraie appli se connecte'
			],
			answer: 1,
			why: 'Le serveur a gardé le `code_challenge` avec le code. Au token endpoint, il hashe le `code_verifier` reçu et compare. L’appli malveillante n’a vu que le code, et au mieux le challenge, et SHA-256 ne se renverse pas pour retrouver le verifier.'
		},
		{
			q: 'Pendant l’étape d’autorisation, que garde le serveur de connexion avec le nouveau code ?',
			options: [
				'Le `code_verifier`, pour le comparer à celui qui arrivera plus tard',
				'Le hash du mot de passe, pour reconnecter l’utilisateur au token endpoint',
				'Le `code_challenge` et sa méthode, liés à ce code',
				'Le client secret, recopié depuis la première requête de l’appli'
			],
			answer: 2,
			why: 'La RFC 7636 dit que le serveur "records the code_challenge and code_challenge_method along with the code" (les enregistre avec le code). Le verifier n’est envoyé qu’une fois, dans la requête de token : le serveur ne l’a jamais avant ce moment.'
		},
		{
			q: 'Un attaquant retire `code_challenge` d’une requête d’autorisation qu’il lance sur son propre appareil, puis glisse le code obtenu dans la session de la victime. Quelle règle du serveur l’arrête ?',
			options: [
				'Refuser toute requête d’autorisation sans paramètre `state`',
				'Refuser une requête de token avec `code_verifier` si le code n’a pas de challenge',
				'Refuser une requête de token dont la `redirect_uri` a un schéma maison',
				'Refuser au token endpoint tout code âgé de plus de 60 secondes'
			],
			answer: 1,
			why: 'L’appli de la victime envoie son propre verifier avec le code de l’attaquant. Le serveur voit un verifier pour un code émis sans challenge, et la RFC 9700 lui demande de le refuser. authentik a ajouté ce contrôle dans les versions 2023.8.7 et 2023.10.7.'
		}
	],
	recall: {
		q: 'Au token endpoint, quels deux cas un serveur PKCE doit-il refuser avec `invalid_grant` ?',
		a: 'Un code émis avec un `code_challenge` mais une requête sans `code_verifier` (CVE-2023-48228), et un `code_verifier` envoyé pour un code émis sans challenge (CVE-2024-23647).'
	},
	sources: [
		{ title: 'Avis authentik GHSA-fm34-v8xq-f2c3, OAuth2: Insufficient PKCE check', url: 'https://github.com/goauthentik/authentik/security/advisories/GHSA-fm34-v8xq-f2c3' },
		{ title: 'Avis authentik GHSA-mrx3-gxjx-hjqj, PKCE downgrade attack', url: 'https://github.com/goauthentik/authentik/security/advisories/GHSA-mrx3-gxjx-hjqj' },
		{ title: 'RFC 6749, The OAuth 2.0 Authorization Framework', url: 'https://www.rfc-editor.org/rfc/rfc6749' },
		{ title: 'RFC 7636, Proof Key for Code Exchange by OAuth Public Clients', url: 'https://www.rfc-editor.org/rfc/rfc7636' },
		{ title: 'RFC 9700, Best Current Practice for OAuth 2.0 Security', url: 'https://www.rfc-editor.org/rfc/rfc9700' },
		{ title: 'golang.org/x/oauth2, pkce.go (GenerateVerifier, S256ChallengeOption)', url: GO_PKCE }
	]
};
