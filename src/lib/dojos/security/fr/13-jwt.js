const PYJWT = 'https://github.com/jpadilla/pyjwt/blob/16231abfd1d8eab4953e8779b3017b859c88565e';
const JWS = `${PYJWT}/jwt/api_jws.py`;
const ALGS = `${PYJWT}/jwt/algorithms.py`;
const JWT_PY = `${PYJWT}/jwt/api_jwt.py`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'jwt',
	part: 'L’identité',
	title: 'Les pièges des JWT',
	minutes: 10,
	hook: [
		'Un JWT annonce lui-même son algorithme de signature, dans le champ `alg` de son en-tête. En 2015, Tim McLean trouve des bibliothèques, dont `pyjwt` et `node-jsonwebtoken`, qui laissent ce champ décider de la façon de vérifier la signature. Un attaquant peut mettre `alg` à `none` et sauter la signature, ou passer de `RS256` à `HS256` et signer avec la clé publique du serveur.',
		'PyJWT bloquait la seconde astuce avec une liste de chaînes interdites dans un secret HMAC, comme `ssh-rsa` et `-----BEGIN PUBLIC KEY-----`. Depuis la 2.0.0, il acceptait aussi des clés Ed25519 écrites `ssh-ed25519 ...`, une chaîne absente de la liste. Le 24 mai 2022, l’avis GHSA-ffqj-6fqr-9h24 (CVE-2022-29217, CVSS 7.4) montre un token signé en HS256 avec la clé publique, accepté comme valide.',
		'L’attaque visait une appli qui appelait `jwt.decode(..., algorithms=jwt.algorithms.get_default_algorithms())`, ce qui accepte tous les algorithmes. La version 2.4.0 corrige le bug.'
	],
	terms: [
		{ term: 'JWT', def: 'JSON Web Token : trois parties en base64url séparées par des points, `header.payload.signature`. Quiconque a le token peut décoder et lire les deux premières.' },
		{ term: 'alg', def: 'Le champ d’en-tête qui nomme l’algorithme de signature, comme `RS256` (signature RSA) ou `HS256` (HMAC avec un secret partagé). C’est l’émetteur du token qui le remplit.' },
		{ term: 'Confusion d’algorithme', def: 'Pousser un vérificateur à contrôler la signature avec un autre algorithme que celui de l’émetteur, par exemple un HMAC dont la clé est la clé publique RSA de l’émetteur.' },
		{ term: 'exp', def: 'La claim d’expiration : un temps Unix en secondes après lequel le token doit être refusé. Un vérificateur qui ne trouve pas de `exp` n’a aucune date pour refuser le token.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['issuer["Le serveur d’auth signe en RS256 avec sa clé privée"] --> tok["JWT : header alg=RS256, payload sub=42 role=user"]', 'issuer -.->|"publie"| pub["Clé publique, connue de tous"]'],
				highlight: ['issuer', 'tok', 'pub'],
				note: 'Le serveur d’auth signe chaque token avec sa clé privée RSA. Chaque API vérifie la signature avec la clé publique correspondante. Cette clé est publiée : tout le monde peut la télécharger, l’attaquant aussi.'
			},
			{
				add: ['tok --> forged["L’attaquant modifie : alg=HS256, role=admin, HMAC-SHA256 avec la clé publique"]'],
				highlight: ['forged'],
				note: 'L’attaquant décode le token, met `alg` à `HS256` et `role` à `admin`. Il calcule un HMAC-SHA256 sur `header.payload`, avec les octets de la clé publique comme secret HMAC.'
			},
			{
				add: ['forged --> naive["Vérificateur naïf : prend alg dans l’en-tête, vérifie le HMAC avec sa clé"]', 'naive -->|"le HMAC correspond"| admin["La requête tourne en admin"]'],
				highlight: ['naive', 'admin'],
				note: 'Un vérificateur naïf lit `alg: HS256` et choisit HMAC. Sa clé configurée est la clé publique, les mêmes octets que ceux de l’attaquant. Le HMAC correspond et le token forgé passe.'
			},
			{
				add: ['forged --> strict["PyJWT : algorithms=[RS256]"]', 'strict -->|"HS256 absent de la liste"| reject["InvalidAlgorithmError"]'],
				highlight: ['strict', 'reject'],
				note: 'PyJWT oblige l’appelant à passer `algorithms`. Avec `algorithms=["RS256"]`, le `HS256` du token n’est pas dans la liste et `decode` lève `InvalidAlgorithmError` avant de toucher à une clé. Même avec `HS256` autorisé, PyJWT refuse une clé publique PEM ou SSH comme secret HMAC.'
			},
			{
				add: ['tok --> logout["L’utilisateur se déconnecte à 10:00, le token a exp=10:15"]', 'logout -->|"signature et exp toujours valides"| still["Le token marche jusqu’à 10:15"]'],
				highlight: ['logout', 'still'],
				note: 'PyJWT vérifie la signature et la claim `exp`, sans jamais demander au serveur d’auth si le token a été révoqué. Un token volé avant la déconnexion marche jusqu’à `exp`, sauf si chaque API consulte aussi une liste de refus indexée sur la claim `jti`.'
			}
		]
	},
	example: {
		title: 'jwt/api_jws.py : _verify_signature dans PyJWT',
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
			'La ligne 15 lit `alg` dans l’en-tête du token, que l’émetteur contrôle. La ligne 19 le refuse s’il n’est pas dans la liste `algorithms` de l’appelant. Avant ça, [`decode_complete`](' + JWS + '#L247-L250) lève une erreur si l’appelant n’a passé aucune liste.',
			'Les lignes 22 à 34 traitent une clé `PyJWK`, liée à un seul algorithme : un token dont l’`alg` diffère est refusé ligne 28. La RFC 8725 le demande : "each key MUST be used with exactly one algorithm" (une clé, un seul algorithme).',
			'La ligne 40 appelle `prepare_key`. Pour HMAC, [`prepare_key`](' + ALGS + '#L346-L360) refuse toute clé au format PEM, SSH ou DER comme "an asymmetric key or x509 certificate". Le correctif 2.4.0 a remplacé une liste de quatre chaînes fixes par des contrôles de format.',
			'La ligne 49 est le seul endroit où une signature est vérifiée. Pour `alg: none`, `NoneAlgorithm.verify` renvoie toujours `False` : la ligne 50 lève `InvalidSignatureError` pour tout token non signé.',
			'L’expiration se vérifie ailleurs, dans [`api_jwt.py`](' + JWT_PY + '#L399-L410), et seulement `if "exp" in payload`. Un token émis sans `exp` passe, sauf si l’appelant met `options={"require": ["exp"]}`.'
		]
	},
	tradeoff: {
		gain: [
			'Une API peut vérifier un JWT avec la seule clé publique et l’horloge, sans appeler le serveur d’auth à chaque requête.',
			'Avec `algorithms=["RS256"]` écrit dans le code, l’en-tête du token ne peut choisir ni HMAC ni `none`, quoi qu’il annonce.'
		],
		cost: [
			'Un token volé marche jusqu’à `exp`. Déconnecter ou désactiver l’utilisateur ne change rien au token.',
			'Révoquer plus tôt demande de nouveau un état côté serveur : une liste de refus des `jti` que chaque API consulte, ou une token status list.',
			'Le payload est seulement encodé en base64url. Quiconque voit le token, dans un log ou dans le stockage du navigateur, lit toutes les claims.'
		]
	},
	task: {
		prompt: 'Trouve les problèmes de ce helper Flask, qui lit un token signé en RS256 par ton serveur d’auth. Écris ensuite l’appel `decode` corrigé.\n\n```python\ndef current_user():\n    token = request.headers["Authorization"].removeprefix("Bearer ")\n    header = jwt.get_unverified_header(token)\n    claims = jwt.decode(token, PUBLIC_KEY, algorithms=[header["alg"]])\n    return User.query.get(claims["sub"])\n```\n\nLe serveur d’auth émet des tokens sans claim `exp`. Quand l’utilisateur clique sur « Se déconnecter », le front supprime le token du local storage.',
		hint: 'Qui choisit la valeur de `header["alg"]` ? Que fait PyJWT d’un token sans `exp` ? Que fait l’API d’une copie du token prise avant la déconnexion ?',
		answer: [
			'`algorithms=[header["alg"]]` prend la liste autorisée dans le token lui-même : la ligne 19 de `_verify_signature` ne refuse donc jamais rien. Un PyJWT récent bloque encore `HS256` avec une clé publique PEM dans `prepare_key`, mais avant la 2.4.0 il acceptait une clé publique `ssh-ed25519` comme secret HMAC.',
			'Pas de `exp` : PyJWT ne vérifie l’expiration que `if "exp" in payload`, donc ces tokens n’expirent jamais. Un token copié dans un log il y a un an marche encore.',
			'La déconnexion supprime seulement la copie du navigateur. Toute autre copie reste valide, car l’API ne vérifie que la signature et les claims.',
			'Correctif : `jwt.decode(token, PUBLIC_KEY, algorithms=["RS256"], options={"require": ["exp", "sub"]})`, un `exp` court posé par le serveur d’auth (15 minutes, par exemple), et à la déconnexion, le `jti` du token ajouté à une liste de refus que l’API consulte jusqu’à ce `exp`.'
		]
	},
	quiz: [
		{
			q: 'Ton API vérifie des tokens RS256. Un attaquant envoie un token avec `alg: HS256`, signé en HMAC avec ta clé publique comme secret. Quel appel PyJWT le refuse avant de toucher à une clé ?',
			options: [
				'`jwt.decode(token, PUBLIC_KEY, algorithms=jwt.algorithms.get_default_algorithms())`',
				'`jwt.decode(token, PUBLIC_KEY, algorithms=["RS256"])`',
				'`jwt.decode(token, options={"verify_signature": False})`',
				'`jwt.decode(token, PUBLIC_KEY, algorithms=[jwt.get_unverified_header(token)["alg"]])`'
			],
			answer: 1,
			why: 'Avec une liste explicite, `_verify_signature` compare l’`alg` de l’en-tête à cette liste et lève `InvalidAlgorithmError` pour `HS256`. La liste par défaut et la liste tirée de l’en-tête laissent toutes deux `HS256` aller jusqu’à `prepare_key`, et couper la vérification de signature accepte n’importe quoi.'
		},
		{
			q: 'Un utilisateur se déconnecte à 10:00. Son token RS256 a un `exp` à 10:15 et l’API n’a pas de liste de refus. Un attaquant a copié le token à 9:55. Que se passe-t-il à 10:05 ?',
			options: [
				'L’API le refuse, car le serveur d’auth a révoqué la session',
				'L’API le refuse, car la signature change à la déconnexion',
				'L’API l’accepte, car la signature et `exp` sont encore valides',
				'L’API l’accepte une fois, puis le token est marqué comme utilisé'
			],
			answer: 2,
			why: 'L’API vérifie le token avec la clé publique et l’horloge, rien d’autre. Rien n’a changé dans le token à la déconnexion, et l’API ne demande jamais rien au serveur d’auth. Seuls `exp` ou une liste de refus côté serveur sur `jti` peuvent l’arrêter plus tôt.'
		},
		{
			q: 'Avant PyJWT 2.4.0, pourquoi une clé publique Ed25519 au format `ssh-ed25519` passait-elle le contrôle de clé HMAC ?',
			options: [
				'Les clés Ed25519 sont assez courtes pour ressembler à des secrets HMAC',
				'Le contrôle refusait une liste fixe de chaînes, sans `ssh-ed25519`',
				'PyJWT sautait le contrôle pour tout algorithme ajouté après la 2.0.0',
				'Le contrôle ne regardait que les clés PEM et ignorait toute clé SSH'
			],
			answer: 1,
			why: 'L’ancien `prepare_key` refusait les clés contenant `-----BEGIN PUBLIC KEY-----`, `-----BEGIN CERTIFICATE-----`, `-----BEGIN RSA PUBLIC KEY-----` ou `ssh-rsa`. `ssh-ed25519` ne correspond à aucune. Le correctif vérifie le format de la clé avec `is_pem_format` et `is_ssh_key`.'
		}
	],
	recall: {
		q: 'Quels deux arguments font refuser à PyJWT un token dont l’en-tête annonce `HS256`, et un token sans expiration ?',
		a: '`algorithms=["RS256"]` (l’`alg` de l’en-tête doit être dans cette liste) et `options={"require": ["exp"]}` (sinon `exp` n’est vérifié que s’il est présent).'
	},
	sources: [
		{ title: 'GitHub Advisory GHSA-ffqj-6fqr-9h24, confusion de clé dans PyJWT (CVE-2022-29217)', url: 'https://github.com/advisories/GHSA-ffqj-6fqr-9h24' },
		{ title: 'Commit de correctif PyJWT 9c52867 (v2.4.0)', url: 'https://github.com/jpadilla/pyjwt/commit/9c528670c455b8d948aff95ed50e22940d1ad3fc' },
		{ title: 'RFC 8725, JSON Web Token Best Current Practices', url: 'https://www.rfc-editor.org/rfc/rfc8725' },
		{ title: 'Tim McLean, Critical vulnerabilities in JSON Web Token libraries', url: 'https://auth0.com/blog/critical-vulnerabilities-in-json-web-token-libraries/' },
		{ title: 'OWASP JSON Web Token Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_Cheat_Sheet.html' }
	]
};
