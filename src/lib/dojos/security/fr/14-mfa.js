const PYOTP = 'https://github.com/pyauth/pyotp/blob/cc156832fa9f3d5af7fb9e4e6b86b29dfc5b69f1/src/pyotp';
const OTP = `${PYOTP}/otp.py`;
const TOTP = `${PYOTP}/totp.py`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'mfa',
	part: 'L’identité',
	title: 'Les seconds facteurs',
	minutes: 10,
	hook: [
		'Le 20 juillet 2022 à 22:50 UTC, au moins 76 employés de Cloudflare reçoivent un SMS en moins d’une minute. Le lien mène à `cloudflare-okta.com`, un domaine enregistré moins de 40 minutes plus tôt. La page imite la page de connexion Okta de Cloudflare.',
		'La page envoie chaque identifiant et mot de passe à l’attaquant par Telegram dès qu’il est tapé, puis demande un code TOTP. L’attaquant peut taper les deux sur la vraie page de connexion avant l’expiration du code. Cloudflare écrit que ce relais en temps réel met en échec "most two-factor authentication implementations" (la plupart des mises en œuvre de la double authentification).',
		'Trois employés saisissent leurs identifiants. Cloudflare n’utilise pas TOTP : chaque employé a une clé de sécurité FIDO2, et l’attaquant "could not get past the hard key requirement" (n’a pas pu passer l’exigence de clé physique).'
	],
	terms: [
		{ term: 'TOTP', def: 'Time-based one-time password (RFC 6238) : un HMAC du pas de temps de 30 secondes en cours, avec un secret partagé par l’appli du téléphone et le serveur, réduit à 6 chiffres.' },
		{ term: 'Pas de temps', def: 'Le compteur que TOTP donne au HMAC : `T = floor(unix_time / 30)`. Au temps Unix 59, T vaut 1. À 60, T vaut 2.' },
		{ term: 'Résistant au phishing', def: 'Se dit d’un authentifiant dont la sortie est liée au site où on l’utilise : un faux site ne peut pas la transmettre au vrai. Pour le NIST, aucun code tapé par l’utilisateur n’est résistant au phishing.' },
		{ term: 'WebAuthn', def: 'L’API du navigateur (`navigator.credentials.get()`) par laquelle une clé de sécurité ou une passkey signe le challenge aléatoire d’un serveur avec une clé privée qu’elle ne révèle jamais.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['enrol["Enrôlement : le serveur crée un secret aléatoire K, affiché en QR code"] --> both["L’appli du téléphone et le serveur gardent K"]'],
				highlight: ['enrol', 'both'],
				note: 'À l’enrôlement, le serveur crée un secret aléatoire et l’affiche en QR code. L’appli du téléphone le scanne : à partir de là, les deux côtés ont le même secret. Les vecteurs de test de la RFC 6238 utilisent le secret ASCII `12345678901234567890`.'
			},
			{
				add: ['both --> step["T = floor(unix_time / 30) : au temps 59, T = 1"]', 'step --> mac["HMAC-SHA1(K, T sur 8 octets) : 75a48a19…397eea747a2d33ab"]'],
				highlight: ['step', 'mac'],
				note: 'Les deux côtés divisent le temps Unix par 30 et jettent le reste. Au temps 59, T vaut 1. Ils calculent le HMAC-SHA1 de T, écrit sur 8 octets, avec le secret. La RFC 4226 donne le résultat de 20 octets pour le compteur 1 : `75a48a19d4cbe100644e8ac1397eea747a2d33ab`.'
			},
			{
				add: ['mac -->|"offset = dernier octet & 0xF = 11"| code["4 octets à partir de l’offset 11 : c1397eea & 0x7fffffff = 1094287082"]', 'code -->|"mod 10^6"| six["287082"]'],
				highlight: ['code', 'six'],
				note: 'Le dernier octet vaut `0xab`, et ses 4 bits de poids faible donnent l’offset 11. Les 4 octets à l’offset 11 sont `c1397eea`. En mettant le bit de poids fort à zéro, on obtient `41397eea`, soit 1094287082. Les 6 derniers chiffres, `287082`, forment le code.'
			},
			{
				add: ['six --> fake["L’utilisateur tape 287082 sur cloudflare-okta.com"]', 'fake -->|"relayé dans le pas de 30 s"| real["La vraie page de connexion l’accepte"]'],
				highlight: ['fake', 'real'],
				note: 'Le code ne dit rien de la page où l’utilisateur l’a tapé. La fausse page le transmet, et le vrai serveur voit un code correct pour le pas en cours. Le NIST : la saisie manuelle "does not bind the authenticator output to the specific session being authenticated" (ne lie pas la sortie à la session authentifiée).'
			},
			{
				add: ['key["Clé de sécurité : WebAuthn signe le challenge du serveur et l’origine de la page"] -->|"l’origine est cloudflare-okta.com"| no["Le vrai serveur rejette la signature"]'],
				highlight: ['key', 'no'],
				note: 'Avec WebAuthn, le navigateur passe l’origine de la page à la clé avec le challenge du serveur, et la clé signe les deux. MDN : un attaquant sur un faux site "can\'t login as the user because the signature changes with the origin of the website". Les logs de Cloudflare montraient des mots de passe corrects et un second facteur en échec.'
			}
		]
	},
	example: {
		title: 'src/pyotp/otp.py : generate_otp dans pyotp, la troncature de la RFC 4226',
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
			'La ligne 8 calcule le HMAC du compteur, rangé sur 8 octets big-endian par `int_to_bytestring`, en SHA-1 par défaut. Les lignes 22 à 27 décodent le secret depuis le base32, le format du QR code.',
			'La ligne 12 prend les 4 bits de poids faible du dernier octet comme offset. Les lignes 13 à 18 lisent 4 octets à partir de là, et le `& 0x7F` de la ligne 14 met le bit de poids fort à zéro. La RFC 4226 le fait "to avoid confusion about signed vs. unsigned modulo computations" (pour éviter toute ambiguïté entre modulo signé et non signé).',
			'Les lignes 19 et 20 gardent les 6 derniers chiffres (`code % 10**6`), zéros de tête compris : ajouter `10_000_000_000` puis découper garde un code comme `041234` sur 6 caractères.',
			'Le compteur vient de [`timecode`](' + TOTP + '#L137-L147) dans totp.py : `int(unix_time / self.interval)`, avec `interval = 30` par défaut. Avec le secret de la RFC, `pyotp.TOTP("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", digits=8).at(59)` renvoie `94287082`, la valeur de test de la RFC 6238.',
			'La RFC 6238 dit que le vérificateur "MUST NOT accept the second attempt of the OTP after the successful validation" (ne doit pas accepter deux fois le même code). Le `verify` de pyotp ne le suit pas. [`verify_and_get_timecode`](' + TOTP + '#L88-L115) renvoie le pas trouvé : l’appli peut le stocker et refuser tout code du même pas ou d’un pas plus ancien.'
		]
	},
	tradeoff: {
		gain: [
			'Un mot de passe volé ne suffit plus pour se connecter : l’attaquant a aussi besoin d’un code tiré d’un secret qui reste sur le téléphone.',
			'TOTP n’a besoin ni de réseau sur le téléphone ni de fournisseur SMS, seulement du secret partagé et d’une horloge juste.',
			'Une clé FIDO2 a arrêté une page de phishing où trois employés de Cloudflare avaient tapé leur mot de passe.'
		],
		cost: [
			'Une fausse page peut relayer un code TOTP pendant son pas de 30 secondes : le NIST ne le compte donc pas comme résistant au phishing.',
			'Le serveur doit garder le secret TOTP de chaque utilisateur sous une forme lisible pour calculer les codes. La RFC 6238 demande que les clés "SHOULD be protected against unauthorized access and usage".',
			'Un code SMS part vers un numéro de téléphone, et ce numéro peut passer sur une autre SIM. Le NIST restreint les codes envoyés par le réseau téléphonique et demande de vérifier d’abord les signes de "SIM change, number porting" (changement de SIM, portage du numéro).'
		]
	},
	task: {
		prompt: 'Partie 1, sur papier. La sortie HMAC-SHA1 d’un certain pas de temps est `1f8698690e02ca16618550ef7f19da8e945b555a`. Trouve l’offset, les 4 octets, le nombre sur 31 bits et le code TOTP à 6 chiffres.\n\nPartie 2. Ton serveur appelle `totp.verify(code, valid_window=1)` et n’enregistre jamais les codes utilisés. Un utilisateur tape un code sur une page de phishing 5 secondes après le début de son pas. Combien de temps l’attaquant peut-il utiliser ce code, et combien de fois ?',
		hint: 'L’offset est la valeur du dernier chiffre hexadécimal. Compte les octets à partir de 0, deux chiffres hexadécimaux par octet. Pour la partie 2 : avec `valid_window=1`, le serveur accepte les codes des pas T-1, T et T+1.',
		answer: [
			'Dernier octet `5a`, 4 bits de poids faible `a` : offset 10. Octets 10 à 13 : `50 ef 7f 19`, donc `0x50ef7f19`. Le bit de poids fort est déjà à 0, le nombre vaut 1357872921. Les 6 derniers chiffres donnent `872921`, le résultat de l’exemple détaillé de la section 5.4 de la RFC 4226.',
			'Partie 2 : le code du pas T est accepté tant que le serveur est au pas T-1, T ou T+1. L’utilisateur l’a tapé 5 secondes après le début de T : il reste valable pendant les 25 secondes restantes de T, plus les 30 secondes de T+1, soit 55 secondes.',
			'Comme `verify` ne garde aucune trace, l’attaquant peut l’utiliser autant de fois qu’il veut pendant ces 55 secondes. Stocker le pas renvoyé par `verify_and_get_timecode` et refuser tout pas qui n’est pas plus grand ramène ça à une seule utilisation.',
			'Aucun de ces correctifs n’empêche la première utilisation relayée. Seule une clé WebAuthn, qui signe l’origine de la page, rend inutile le code saisi sur la fausse page.'
		],
		steps: [
			{
				title: 'Trouve l’offset',
				questions: [
					{ q: 'Quel octet du HMAC donne l’offset ?', options: ['Le premier octet', 'Le dernier octet', 'L’octet en position 4', 'L’octet du milieu'], answer: 1, why: 'Ligne 12 : `offset = hmac_hash[-1] & 0xF`, les 4 bits de poids faible du dernier octet.' },
					{ q: 'Le HMAC se termine par `5a`. Quel est l’offset ?', options: ['5', '90', '10', '15'], answer: 2, why: '`0x5a & 0xF` garde le dernier chiffre hexadécimal, `a`, qui vaut 10.' },
					{ q: 'Combien d’octets fait une sortie HMAC-SHA1 ?', options: ['16', '32', '8', '20'], answer: 3, why: 'La chaîne hexadécimale a 40 chiffres, deux par octet, donc 20 octets, numérotés de 0 à 19.' },
					{ q: 'Pourquoi l’offset ne peut-il jamais dépasser la fin ?', options: ['Il vaut au plus 15, et les octets 15 à 18 tiennent dans 20', 'pyotp repart au début', 'Le secret est complété pour tenir', 'SHA-1 finit toujours par un petit octet'], answer: 0, why: '4 bits donnent 0 à 15. Lire 4 octets à partir de 15 s’arrête à l’octet 18, dans la sortie de 20 octets.' }
				]
			},
			{
				title: 'Lis le code',
				questions: [
					{ q: 'Quels 4 octets commencent à l’offset 10 ?', options: ['`ca 16 61 85`', '`50 ef 7f 19`', '`ef 7f 19 da`', '`55 5a 1f 86`'], answer: 1, why: 'En comptant à partir de 0, deux chiffres hexadécimaux par octet, les octets 10 à 13 sont `50 ef 7f 19`.' },
					{ q: 'Que fait `& 0x7F` sur le premier octet ?', options: ['Il met le bit de poids fort à 0 : le nombre tient sur 31 bits et n’est jamais négatif', 'Il ne garde que le dernier chiffre', 'Il passe le nombre en base32', 'Il ajoute le pas de temps'], answer: 0, why: 'La RFC 4226 efface le bit de poids fort "to avoid confusion about signed vs. unsigned modulo computations" (pour éviter la confusion entre modulo signé et non signé).' },
					{ q: '`0x50ef7f19` vaut 1357872921. Quel est le code à 6 chiffres ?', options: ['`135787`', '`357872`', '`921000`', '`872921`'], answer: 3, why: 'Le code est `code % 10**6`, les 6 derniers chiffres. C’est le résultat de l’exemple de la section 5.4 de la RFC 4226.' },
					{ q: 'Le nombre modulo 10^6 vaut 41234. Qu’affiche pyotp ?', options: ['`41234`', '`412340`', '`041234`', '`0041234`'], answer: 2, why: 'Les lignes 19 et 20 ajoutent `10_000_000_000` et gardent les 6 derniers caractères, ce qui garde le zéro de tête.' }
				]
			},
			{
				title: 'Calcule la fenêtre',
				questions: [
					{ q: 'Avec `valid_window=1`, pour quels pas le serveur accepte-t-il un code ?', options: ['Seulement T', 'T et T+1', 'T-1, T et T+1', 'Tout pas des 10 dernières minutes'], answer: 2, why: 'Une fenêtre de 1 ajoute un pas de chaque côté du pas en cours.' },
					{ q: 'L’utilisateur tape le code du pas T 5 secondes après le début de T. Combien reste-t-il de T ?', options: ['25 secondes', '30 secondes', '5 secondes', '55 secondes'], answer: 0, why: 'Un pas dure 30 secondes, et 5 sont passées.' },
					{ q: 'Ce code du pas T est-il encore accepté pendant le pas T+1 ?', options: ['Non : il a expiré à la fin de T', 'Oui : pendant T+1, le serveur accepte aussi T, qui est son T-1', 'Seulement pendant les 5 premières secondes de T+1', 'Seulement si l’utilisateur le retape'], answer: 1, why: 'Au pas T+1, la fenêtre couvre T, T+1 et T+2 : le code du pas T passe encore.' },
					{ q: 'Pendant combien de temps l’attaquant peut-il donc utiliser le code ?', options: ['30 secondes', '25 secondes', '85 secondes', '55 secondes'], answer: 3, why: 'Les 25 secondes restantes de T, plus les 30 secondes de T+1.' }
				]
			},
			{
				title: 'Compte les utilisations et corrige',
				questions: [
					{ q: 'Le serveur n’enregistre jamais les codes utilisés. Combien de fois l’attaquant peut-il utiliser le code pendant ces 55 secondes ?', options: ['Une fois', 'Deux fois', 'Autant de fois qu’il veut', 'Aucune : l’utilisateur l’a utilisé avant'], answer: 2, why: 'Le `verify` de pyotp ne garde aucune trace : le même code passe à chaque essai dans la fenêtre.' },
					{ q: 'Que demande la RFC 6238 au vérificateur ?', options: ['Refuser une seconde utilisation d’un OTP déjà validé', 'Réduire le pas à 10 secondes', 'Envoyer aussi le code par SMS', 'Accepter tout code pendant 10 minutes'], answer: 0, why: 'Le vérificateur "MUST NOT accept the second attempt of the OTP after the successful validation" (ne doit pas accepter un second essai après une validation réussie).' },
					{ q: 'Comment refuser les rejeux avec pyotp ?', options: ['Appeler `verify` deux fois', 'Passer `valid_window=0`', 'Stocker le code lui-même pour toujours', 'Stocker le pas renvoyé par `verify_and_get_timecode` et refuser tout pas qui n’est pas plus grand'], answer: 3, why: 'Une fois un pas utilisé, ce pas et tous les plus anciens sont refusés : il reste une seule utilisation.' },
					{ q: 'Avec ce correctif, l’attaquant se connecte avec le code relayé, puis le retente 10 secondes plus tard. Que se passe-t-il ?', options: ['Accepté : on est encore dans les 55 secondes', 'Refusé : son pas est déjà enregistré, et le même pas n’est pas plus grand', 'Accepté une fois de plus, puis refusé', 'Refusé : le code a expiré 10 secondes après sa première utilisation'], answer: 1, why: 'La fenêtre couvre encore le code, mais le pas enregistré le bloque. Le correctif ramène l’attaquant à une seule utilisation, pas à zéro.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Au temps Unix 59, avec le pas par défaut de 30 secondes, quelle valeur de compteur le téléphone et le serveur donnent-ils au HMAC ?',
			options: ['0', '1', '2', '59'],
			answer: 1,
			why: 'La RFC 6238 définit T = floor((time - T0) / 30) avec T0 = 0. 59 / 30 vaut 1,97, et la partie entière vaut 1. Au temps 60, le compteur vaut 2.'
		},
		{
			q: 'Une page de phishing demande le mot de passe puis le code TOTP, et relaie les deux au vrai site en quelques secondes. Pourquoi le vrai site accepte-t-il le code ?',
			options: [
				'L’attaquant peut calculer le code à partir du seul mot de passe volé',
				'Le code ne dépend que du secret et du pas de temps en cours',
				'Les codes TOTP restent valables 10 minutes, le relais a le temps',
				'Le vrai site saute le contrôle TOTP quand le mot de passe est bon'
			],
			answer: 1,
			why: 'Le code vaut HMAC(secret, pas de temps), tronqué à 6 chiffres. Rien dedans ne nomme la page où il a été tapé : un code transmis pendant le pas est identique à celui que l’utilisateur aurait tapé sur le vrai site.'
		},
		{
			q: 'Le même relais vise un utilisateur qui a une clé de sécurité FIDO2. Pourquoi échoue-t-il ?',
			options: [
				'La clé refuse de marcher sur toute page sans icône de cadenas',
				'La clé signe l’origine de la fausse page, que le vrai serveur rejette',
				'La clé change son code toutes les 5 secondes au lieu de 30',
				'La clé envoie le mot de passe directement au vrai serveur'
			],
			answer: 1,
			why: 'Avec WebAuthn, le navigateur passe l’origine de la page à la clé avec le challenge du serveur, et la clé signe les deux. La signature faite sur `cloudflare-okta.com` porte cette origine, et le contrôle du vrai serveur échoue.'
		}
	],
	lab: {
		minutes: 25,
		goal: 'Calcule des codes TOTP toi-même, retrouve les valeurs de test des RFC, et ajoute le contrôle anti-rejeu que le `verify` de pyotp laisse de côté.',
		steps: [
			'Crée un dossier : `mkdir -p ~/totp-lab && cd ~/totp-lab`.',
			'Écris `totp.py` avec une fonction `totp(secret, t, digits=6)` : décode le secret en base32, calcule le HMAC-SHA1 du pas `int(t // 30)` écrit sur 8 octets big-endian, puis tronque comme les lignes 12 à 20 de pyotp. Fais afficher le code par `python3 totp.py SECRET TEMPS`.',
			'Vérifie la valeur de test de la RFC 6238 : `python3 -c \'from totp import totp; print(totp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 59, 8))\'`.',
			'Vérifie l’exercice à la main : `python3 -c \'n = int("50ef7f19", 16) & 0x7FFFFFFF; print(n, n % 10**6)\'`.',
			'Regarde la frontière entre deux pas : `python3 totp.py GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ 59`, puis pareil avec `60` et `89`.',
			'Écris `guard.py` avec `verify(secret, code, now, last_step)` : essaie les pas T-1, T et T+1, n’accepte qu’un pas plus grand que `last_step`, et renvoie-le, ou `None`. Teste-le : `python3 -c \'from totp import totp; from guard import verify; s = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"; c = totp(s, 65); print(verify(s, c, 65, 0), verify(s, c, 70, 2), verify(s, c, 119, 0), verify(s, c, 120, 0))\'`.'
		],
		done: [
			'La vérification RFC affiche `94287082`.',
			'La vérification à la main affiche `1357872921 872921`.',
			'Les temps `60` et `89` affichent le même code, et le temps `59` un autre.',
			'Le test du garde affiche `2 None 2 None`.'
		],
		solution: [
			'`h = hmac.new(base64.b32decode(secret), struct.pack(">Q", int(t // 30)), hashlib.sha1).digest()`',
			'`o = h[-1] & 0xF`, puis `n = int.from_bytes(h[o:o + 4], "big") & 0x7FFFFFFF`, puis `return str(n % 10**digits).zfill(digits)`.',
			'Dans `guard.py` : `for step in (now // 30 - 1, now // 30, now // 30 + 1): if step > last_step and totp(secret, step * 30) == code: return step`, puis `return None`.',
			'Lis le test du garde : un code tapé à 65 (pas 2) passe une fois, est refusé quand le pas 2 est stocké, passe encore à 119 pour un utilisateur neuf, et échoue à 120. C’est la fenêtre de 55 secondes. Nettoie avec `rm -rf ~/totp-lab`.'
		]
	},
	recall: {
		q: 'Dans TOTP, comment le code à 6 chiffres sort-il de la sortie HMAC-SHA1 ?',
		a: 'Prendre les 4 bits de poids faible du dernier octet comme offset, lire 4 octets à cet endroit, mettre le bit de poids fort à zéro et garder le nombre modulo 1 000 000. Pour le compteur 1 avec le secret de la RFC : offset 11, `41397eea`, 1094287082, code `287082`.'
	},
	sources: [
		{ title: 'Blog Cloudflare, The mechanics of a sophisticated phishing scam and how we stopped it', url: 'https://blog.cloudflare.com/2022-07-sms-phishing-attacks/' },
		{ title: 'RFC 6238, TOTP: Time-Based One-Time Password Algorithm', url: 'https://www.rfc-editor.org/rfc/rfc6238' },
		{ title: 'RFC 4226, HOTP: An HMAC-Based One-Time Password Algorithm', url: 'https://www.rfc-editor.org/rfc/rfc4226' },
		{ title: 'MDN, Web Authentication API', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API' },
		{ title: 'MDN, AuthenticatorAssertionResponse: signature', url: 'https://developer.mozilla.org/en-US/docs/Web/API/AuthenticatorAssertionResponse/signature' },
		{ title: 'NIST SP 800-63B, Authentication and Authenticator Management', url: 'https://pages.nist.gov/800-63-4/sp800-63b.html' }
	]
};
