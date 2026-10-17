const GO = 'https://github.com/golang/go/blob/c3a068eec992b5ae783abce1a9d03f617b671ea2/src';
const EXAMPLE = `${GO}/crypto/cipher/example_test.go`;
const GCM = `${GO}/crypto/cipher/gcm.go`;
const PAPER = 'https://eprint.iacr.org/2016/475';
const RFC5116 = 'https://www.rfc-editor.org/rfc/rfc5116#section-5.1.1';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'crypto-misuse',
	part: 'En production',
	title: 'Bien utiliser la crypto',
	minutes: 10,
	hook: [
		'En 2016, une équipe de chercheurs scanne Internet à la recherche de serveurs HTTPS en AES-GCM. Ils trouvent 184 serveurs qui répètent un nonce, ce qui « fully breaks the authenticity of the connections » : l’authenticité des connexions tombe entièrement. Leur preuve de concept injecte du contenu dans des sessions chiffrées. Plus de 70 000 autres serveurs tirent leurs nonces au hasard et risquent une répétition sur les longues connexions.',
		'Le 13 mai 2008, l’avis Debian DSA-1571 annonce que le générateur aléatoire du paquet OpenSSL de Debian est prévisible, à cause d’une modification propre à Debian livrée depuis 2006. Les clés SSH, OpenVPN et TLS créées sur ces systèmes pouvaient être devinées. Debian demande de recréer « from scratch » toutes les clés générées par OpenSSL depuis la version 0.9.8c-1.',
		'Dans les deux cas, personne n’a cassé l’algorithme lui-même. C’est le code autour qui a mal choisi un nonce ou un nombre aléatoire.'
	],
	terms: [
		{ term: 'Nonce', def: 'Une valeur passée à chaque chiffrement, qui ne doit jamais se répéter pour une même clé. AES-GCM utilise 12 octets (96 bits).' },
		{ term: 'AEAD', def: 'Authenticated encryption with associated data : un seul appel chiffre le message et ajoute un tag, et le déchiffrement échoue si un seul octet a changé. AES-GCM et ChaCha20-Poly1305 sont des AEAD.' },
		{ term: 'CSPRNG', def: 'Un générateur aléatoire sûr pour la cryptographie : on ne peut pas prédire sa sortie à partir des sorties précédentes. `crypto/rand` en Go et `secrets` en Python en sont ; `math/rand` et `random` n’en sont pas.' },
		{ term: 'Recette', def: 'Une API de haut niveau qui choisit pour toi l’algorithme, le nonce et le format, comme `Fernet` en Python ou `cipher.NewGCMWithRandomNonce` en Go.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['m1["Message 1 scellé avec la clé K, nonce N"] --> wire["L’attaquant enregistre les deux chiffrés"]', 'm2["Message 2 scellé avec la clé K, même nonce N"] --> wire'],
				highlight: ['m1', 'm2', 'wire'],
				note: 'Un serveur garde la clé K et envoie deux messages avec le même nonce N. La cause peut être un nonce fixe dans le code, ou un compteur qui repart de 0 à chaque redémarrage. Un attaquant sur le réseau enregistre les deux chiffrés.'
			},
			{
				add: ['wire --> broken["Les deux clairs exposés ; des messages forgés acceptés sous K"]'],
				highlight: ['broken'],
				note: 'Selon la [RFC 5116](' + RFC5116 + '), un nonce GCM répété « undermines the confidentiality of the plaintexts protected in those two invocations, and undermines all of the authenticity and integrity protection provided by that key ». L’attaquant peut forger des messages qui passent la vérification du tag, comme dans le scan HTTPS de 2016.'
			},
			{
				add: ['counter["Nonce compteur : partie fixe + compteur de 4 octets, jamais remis à zéro pour K"] -.-> m2', 'random["Nonce aléatoire de 96 bits tiré d’un CSPRNG, 2^32 messages max par clé"] -.-> m2'],
				highlight: ['counter', 'random'],
				note: 'Deux façons gardent le nonce unique. La RFC 5116 recommande une partie fixe plus un compteur qui ne se répète jamais pour une clé. La doc Go accepte des nonces aléatoires de 96 bits tirés de `crypto/rand`, avec une limite : « Never use more than 2^32 random nonces with a given key because of the risk of a repeat. »'
			},
			{
				add: ['weak["Nonce ou clé tirés de math/rand ou random"] --> guess["L’attaquant prédit les valeurs suivantes"]', 'csprng["crypto/rand, secrets, os.urandom"] -.->|"remplace"| weak'],
				highlight: ['weak', 'guess', 'csprng'],
				note: 'Les octets aléatoires doivent venir d’un CSPRNG. La doc Go de `math/rand/v2` : « This package’s outputs might be easily predictable regardless of how it’s seeded. » La doc Python de `random` dit qu’il « should not be used for security purposes » et renvoie vers `secrets`.'
			},
			{
				add: ['recipe["API recette : Fernet, NewGCMWithRandomNonce"] -.->|"choisit le nonce, ajoute le tag, fixe le format"| m1'],
				highlight: ['recipe'],
				note: 'Une recette enlève le choix. `NewGCMWithRandomNonce` tire un nonce aléatoire à chaque `Seal` et le place devant le chiffré. `Fernet` en Python utilise AES-CBC avec un tag HMAC-SHA256 et tire chaque IV d’un CSPRNG. pyca/cryptography appelle la couche basse « hazmat » et recommande « using the recipes layer whenever possible ».'
			}
		]
	},
	example: {
		title: 'src/crypto/cipher/example_test.go : l’exemple AES-GCM de Go lui-même',
		repo: 'golang/go',
		url: `${EXAMPLE}#L18-L45`,
		lang: 'go',
		code: `func ExampleNewGCM_encrypt() {
	// Load your secret key from a safe place and reuse it across multiple
	// Seal/Open calls. (Obviously don't use this example key for anything
	// real.) If you want to convert a passphrase to a key, use a suitable
	// package like bcrypt or scrypt.
	// When decoded the key should be 16 bytes (AES-128) or 32 (AES-256).
	key, _ := hex.DecodeString("6368616e676520746869732070617373776f726420746f206120736563726574")
	plaintext := []byte("exampleplaintext")

	block, err := aes.NewCipher(key)
	if err != nil {
		panic(err.Error())
	}

	aesgcm, err := cipher.NewGCM(block)
	if err != nil {
		panic(err.Error())
	}

	// Never use more than 2^32 random nonces with a given key because of the risk of a repeat.
	nonce := make([]byte, aesgcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		panic(err.Error())
	}

	ciphertext := aesgcm.Seal(nil, nonce, plaintext, nil)
	fmt.Printf("%x\\n", ciphertext)
}`,
		notes: [
			'La clé de la ligne `hex.DecodeString` est le texte ASCII « change this password to a secret », 32 octets, donc AES-256. Le commentaire demande de charger la vraie clé « from a safe place » et de dériver une clé d’une phrase de passe avec bcrypt ou scrypt, plutôt que de prendre les octets de la phrase tels quels.',
			'`rand.Reader` vient ici de `crypto/rand`. Sous Linux, il appelle `getrandom(2)`. `aesgcm.NonceSize()` renvoie 12 : chaque appel à `ExampleNewGCM_encrypt` reçoit un nonce neuf de 96 bits.',
			'`Seal` ne renvoie que le chiffré et le tag. L’appelant doit garder ou envoyer `nonce` à côté, car `Open` a besoin du même nonce. L’interface `AEAD` exige un nonce de « NonceSize() bytes long and unique for all time, for a given key ».',
			'Depuis Go 1.24, [`cipher.NewGCMWithRandomNonce`](' + GCM + '#L79-L89) gère le nonce à ta place : il « generates a random 96-bit nonce, which is prepended to the ciphertext by Seal, and is extracted from the ciphertext by Open ». Son `Overhead` vaut 28 octets : 12 pour le nonce, 16 pour le tag.'
		]
	},
	tradeoff: {
		gain: [
			'Un nonce aléatoire de 96 bits ne demande aucun état : deux serveurs peuvent partager une clé sans se coordonner sur un compteur, jusqu’à 2^32 messages par clé.',
			'Une recette comme `Fernet` ou `NewGCMWithRandomNonce` retire les choix du nonce et du format, les deux étapes ratées par les serveurs HTTPS de 2016.',
			'Le tag AEAD fait échouer `Open` dès qu’un octet a changé : le code n’agit jamais sur des données modifiées.'
		],
		cost: [
			'Les nonces aléatoires limitent une clé à 2^32 messages. Un service qui en envoie plus doit changer de clé, ou passer à un compteur, qui demande un état qui survit aux redémarrages.',
			'Un nonce compteur casse si le compteur repart en arrière : après une restauration depuis un vieux snapshot, le serveur réutilise des nonces déjà envoyés.',
			'Une recette vient avec son propre format de token : un service Go ne lit un token `Fernet` que s’il implémente la spec Fernet.',
			'AES-GCM ne protège pas contre un nonce répété. La RFC 8452 définit AES-GCM-SIV pour ce cas, avec un chiffrement à environ deux tiers de la vitesse d’AES-GCM.'
		]
	},
	task: {
		prompt: 'Trouve les deux trous dans ce module Python, et écris les lignes corrigées.\n\n```python\nimport os, random\nfrom cryptography.hazmat.primitives.ciphers.aead import AESGCM\n\nKEY = AESGCM.generate_key(bit_length=256)\nNONCE = os.urandom(12)\n\ndef encrypt(msg: bytes) -> bytes:\n    return AESGCM(KEY).encrypt(NONCE, msg, None)\n\ndef reset_code() -> str:\n    return "%06d" % random.randint(0, 999999)\n```',
		hint: 'Combien de fois la ligne `NONCE = os.urandom(12)` s’exécute-t-elle ? De quel module vient `random.randint` ?',
		answer: [
			'Trou 1 : `NONCE` est tiré une seule fois, à l’import du module. Chaque appel à `encrypt` le réutilise avec la même clé. D’après la RFC 5116, dès le deuxième message, la confidentialité des deux et l’authenticité de tout message sous `KEY` tombent.',
			'Correction 1 : tire un nonce à chaque appel et envoie-le avec le chiffré :\n```python\ndef encrypt(msg: bytes) -> bytes:\n    nonce = os.urandom(12)\n    return nonce + AESGCM(KEY).encrypt(nonce, msg, None)\n```\nOu quitte la couche hazmat et utilise `Fernet(key).encrypt(msg)`, qui le fait pour toi.',
			'Trou 2 : `random` n’est pas un CSPRNG. La doc Python dit qu’il « should not be used for security purposes ». Un attaquant qui voit assez de sorties peut prédire les prochains codes de réinitialisation.',
			'Correction 2 : `import secrets` et `return "%06d" % secrets.randbelow(1_000_000)`. Six chiffres se devinent toujours en 10^6 essais : l’endpoint de réinitialisation a encore besoin d’une limite de débit (jour 15).'
		]
	},
	quiz: [
		{
			q: 'Un service chiffre deux messages différents en AES-GCM, avec la même clé et le même nonce. Que perd-il selon la RFC 5116 ?',
			options: [
				'Rien, tant que les deux messages ont des longueurs différentes',
				'Seulement le second message, car le premier a utilisé le nonce à bon droit',
				'La confidentialité des deux messages et toute l’authenticité sous cette clé',
				'Seulement le tag du second message, que le serveur va désormais rejeter'
			],
			answer: 2,
			why: 'La RFC 5116 dit que la répétition « undermines the confidentiality of the plaintexts protected in those two invocations, and undermines all of the authenticity and integrity protection provided by that key ». Après une seule répétition, un attaquant peut forger des messages qui passent la vérification du tag pour cette clé.'
		},
		{
			q: 'Tu génères des ids de session avec `math/rand/v2` en Go, initialisé avec l’heure courante en nanosecondes. Est-ce sûr ?',
			options: [
				'Oui, car une graine en nanosecondes a trop de valeurs pour être devinée',
				'Non, sa doc dit que la sortie se prédit quelle que soit la graine',
				'Oui, à condition d’utiliser la source `ChaCha8` plutôt que `PCG`',
				'Non, car `math/rand/v2` n’est pas sûr entre plusieurs goroutines'
			],
			answer: 1,
			why: 'La doc du paquet `math/rand/v2` dit qu’il « should not be used for security-sensitive work » et renvoie vers `crypto/rand`. Elle ajoute que la sortie « might be easily predictable regardless of how it’s seeded » : une graine en nanosecondes n’y change rien.'
		},
		{
			q: 'Avec `cipher.NewGCMWithRandomNonce`, combien de messages une clé peut-elle chiffrer ?',
			options: [
				'Au plus 2^32 messages, pour garder le risque de collision de nonce négligeable',
				'Autant qu’on veut, car le nonce est aléatoire et les répétitions sont vérifiées',
				'Au plus 2^96 messages, un par valeur possible du nonce de 96 bits',
				'Au plus 2^64 messages, la limite d’AES pour une seule clé'
			],
			answer: 0,
			why: 'La doc Go : « A given key MUST NOT be used to encrypt more than 2^32 messages, to limit the risk of a random nonce collision to negligible levels. » Personne ne vérifie les répétitions de nonces aléatoires, donc la limite est fixée bien en dessous de 2^96 pour garder une chance de collision minuscule.'
		}
	],
	recall: {
		q: 'Quelles deux règles gardent AES-GCM sûr dans ton code, et quel appel Go applique les deux pour toi ?',
		a: 'Un nonce ne se répète jamais pour une clé (au plus 2^32 nonces aléatoires de 96 bits), et les octets aléatoires viennent d’un CSPRNG comme `crypto/rand`. `cipher.NewGCMWithRandomNonce` fait les deux.'
	},
	sources: [
		{ title: 'Böck et al., Nonce-Disrespecting Adversaries: Practical Forgery Attacks on GCM in TLS (2016)', url: PAPER },
		{ title: 'Debian DSA-1571-1, openssl : générateur aléatoire prévisible', url: 'https://www.debian.org/security/2008/dsa-1571' },
		{ title: 'RFC 5116, An Interface and Algorithms for Authenticated Encryption, 5.1.1 Nonce Reuse', url: RFC5116 },
		{ title: 'RFC 8452, AES-GCM-SIV: Nonce Misuse-Resistant Authenticated Encryption', url: 'https://www.rfc-editor.org/rfc/rfc8452' },
		{ title: 'Source Go, src/crypto/cipher/gcm.go', url: GCM },
		{ title: 'Doc Go, math/rand/v2', url: 'https://pkg.go.dev/math/rand/v2' },
		{ title: 'Doc pyca/cryptography, Fernet et la couche hazmat', url: 'https://cryptography.io/en/latest/' },
		{ title: 'Doc Python, random (avertissement de sécurité)', url: 'https://docs.python.org/3/library/random.html' }
	]
};
