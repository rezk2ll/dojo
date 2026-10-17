const DJ = 'https://github.com/django/django/blob/d430084791a61b31cecec132bce3dca19194f7f2';
const HASHERS = `${DJ}/django/contrib/auth/hashers.py`;
const SOPHOS = 'https://web.archive.org/web/20131107082752/http://nakedsecurity.sophos.com/2013/11/04/anatomy-of-a-password-disaster-adobes-giant-sized-cryptographic-blunder/';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'password-storage',
	part: 'L’identité',
	title: 'Stocker les mots de passe',
	minutes: 10,
	hook: [
		'En octobre 2013, Adobe confirme que des attaquants ont pris des Adobe ID et des "encrypted passwords for approximately 38 million active users", des mots de passe chiffrés pour environ 38 millions d’utilisateurs actifs. Peu après, un dump de 150 millions d’enregistrements apparaît en ligne, avec les indices de mot de passe rangés à côté des mots de passe.',
		'Sophos prend un échantillon de 1 000 000 d’enregistrements. Chaque bloc de mot de passe mesure un multiple de 8 octets : signe d’un chiffrement par blocs de 64 bits comme 3DES. Le même mot de passe donne toujours le même bloc, car le chiffrement tourne en mode ECB avec une seule clé pour tout le monde.',
		'Avec les indices et une liste de mots de passe courants, Sophos retrouve les cinq mots de passe les plus utilisés, choisis par 2,75 % de l’échantillon, sans la clé.'
	],
	terms: [
		{ term: 'Hachage', def: 'Une fonction à sens unique : du mot de passe on tire le hash, et rien ne permet de revenir du hash au mot de passe. Pour vérifier une connexion, on hache la tentative et on compare.' },
		{ term: 'Sel', def: 'Une chaîne aléatoire stockée à côté du hash de chaque utilisateur et mêlée à l’entrée. Deux utilisateurs au même mot de passe obtiennent des hashs différents. Les sels de Django font 22 caractères, au moins 128 bits.' },
		{ term: 'Facteur de travail', def: 'Le coût de calcul d’un hash : 1 800 000 itérations de PBKDF2-SHA256 dans Django au commit épinglé. Chaque essai d’un attaquant paie le même coût.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['pw["123456 pour l’utilisateur A et pour B"] -->|"3DES, ECB, une seule clé"| enc["Le même bloc deux fois dans la table"]'],
				highlight: ['pw', 'enc'],
				note: 'Adobe chiffre chaque mot de passe avec une seule clé et aucune valeur propre à l’utilisateur. A et B ont choisi le même mot de passe : leurs lignes contiennent le même bloc. Sophos compte la fréquence de chaque bloc et lit les indices à côté des plus fréquents.'
			},
			{
				add: ['enc --> key["Clé trouvée ou devinée : tout se déchiffre"]'],
				highlight: ['key'],
				note: 'Qui détient la clé d’Adobe déchiffre tous les blocs. Sophos : "Anyone who computes, guesses or acquires the decryption key immediately gets access to all the passwords in the database." Le code de connexion a besoin de cette clé à chaque vérification : elle vit donc sur les mêmes serveurs que la table.'
			},
			{
				add: ['enc --> fast["SHA-256 simple à la place : toujours une valeur par mot de passe"]'],
				highlight: ['fast'],
				note: 'Un hash simple supprime la clé mais garde les deux problèmes : deux mots de passe égaux donnent deux hashs égaux, et un hash ne coûte presque rien. L’OWASP : les fonctions rapides comme SHA-256 "allow attackers to perform large numbers of guesses quickly", elles permettent un très grand nombre d’essais.'
			},
			{
				add: ['salt["Sel par utilisateur + PBKDF2, 1 800 000 itérations"] -.->|"des hashs différents pour A et B"| enc', 'salt -.->|"chaque essai coûte 1 800 000 tours"| fast'],
				highlight: ['salt'],
				note: 'Django donne à chaque utilisateur un sel neuf de 22 caractères : A et B obtiennent des hashs différents. Chaque essai fait 1 800 000 tours de HMAC-SHA256, pour un seul utilisateur. Les minimums de l’OWASP : Argon2id avec 19 MiB et 2 itérations, ou PBKDF2-HMAC-SHA256 avec 600 000.'
			},
			{
				add: ['salt --> login["Prochaine connexion réussie : must_update vaut vrai, nouveau hash"]'],
				highlight: ['login'],
				note: 'Le facteur de travail est écrit dans chaque valeur stockée, donc on repère les vieux hashs. Quand un utilisateur se connecte avec un ancien nombre d’itérations, `check_password` reçoit `must_update = True` et appelle son `setter` pour stocker un hash au nombre actuel.'
			}
		]
	},
	example: {
		title: 'django/contrib/auth/hashers.py : PBKDF2PasswordHasher',
		repo: 'django/django',
		url: `${HASHERS}#L325-L370`,
		lang: 'python',
		code: `    algorithm = "pbkdf2_sha256"
    iterations = 1_800_000
    digest = hashlib.sha256

    def encode(self, password, salt, iterations=None):
        self._check_encode_args(password, salt)
        iterations = iterations or self.iterations
        salt = force_str(salt)
        hash = pbkdf2(password, salt, iterations, digest=self.digest)
        hash = base64.b64encode(hash).decode("ascii").strip()
        return "%s$%d$%s$%s" % (self.algorithm, iterations, salt, hash)

    def decode(self, encoded):
        algorithm, iterations, salt, hash = encoded.split("$", 3)
        assert algorithm == self.algorithm
        return {
            "algorithm": algorithm,
            "hash": hash,
            "iterations": int(iterations),
            "salt": salt,
        }

    def verify(self, password, encoded):
        decoded = self.decode(encoded)
        encoded_2 = self.encode(password, decoded["salt"], decoded["iterations"])
        return constant_time_compare(encoded, encoded_2)

…
    def must_update(self, encoded):
        decoded = self.decode(encoded)
        update_salt = must_update_salt(decoded["salt"], self.salt_entropy)
        return (decoded["iterations"] != self.iterations) or update_salt

    def harden_runtime(self, password, encoded):
        decoded = self.decode(encoded)
        extra_iterations = self.iterations - decoded["iterations"]
        if extra_iterations > 0:
            self.encode(password, decoded["salt"], extra_iterations)`,
		notes: [
			'Le `return` de `encode` écrit `pbkdf2_sha256$1800000$<salt>$<hash>`. Chaque ligne porte son algorithme, son facteur de travail et son sel : des lignes créées avec des réglages différents cohabitent dans la même table.',
			'`verify` hache à nouveau la tentative avec le sel et le nombre d’itérations lus dans la ligne, puis compare avec `constant_time_compare`. Rien n’est jamais déchiffré, puisqu’il n’y a pas de clé.',
			'`must_update` vaut vrai quand le nombre de la ligne diffère de `iterations`, ou quand le sel fait moins de 128 bits. Dans [`verify_password`](' + HASHERS + '#L61-L72), ce drapeau remonte à `check_password`, qui hache à nouveau le mot de passe que l’utilisateur vient de taper.',
			'`harden_runtime` lance les itérations manquantes après un échec de connexion sur une vieille ligne. Le temps de réponse reste ainsi proche de celui du facteur actuel : la mesure du temps en dit moins à un attaquant sur les comptes qui ont encore un vieux hash.',
			'La valeur par défaut de `iterations` est 1 800 000 à ce commit de la branche main de Django. La doc annonce que Django va "increase it with each release", l’augmenter à chaque version. Le même fichier contient `Argon2PasswordHasher` avec `time_cost = 2` et `memory_cost = 102400`, qu’argon2-cffi lit en kibioctets : 100 MiB.'
		]
	},
	tradeoff: {
		gain: [
			'Une table volée ne donne aucune clé à trouver. Chaque mot de passe doit être deviné seul, avec son propre sel, à 1 800 000 tours par essai.',
			'Le facteur de travail peut monter sans réinitialisation : chaque utilisateur qui se connecte après la mise à jour reçoit le nouveau nombre, via `must_update`.'
		],
		cost: [
			'Chaque connexion dépense volontairement 1 800 000 tours de CPU. L’OWASP prévient qu’un facteur trop élevé permet d’épuiser le CPU "with a large number of login attempts", et conseille moins d’une seconde par hash.',
			'Les utilisateurs qui ne reviennent jamais gardent leur vieux hash. La doc de Django décrit comment envelopper d’anciens hashs MD5 dans PBKDF2 pour les mettre à niveau sans connexion.',
			'Tu ne peux jamais afficher ni envoyer son mot de passe à un utilisateur. Le lien de réinitialisation est la seule voie de récupération.'
		]
	},
	task: {
		prompt: 'Une table d’utilisateurs a trois lignes. Ligne 1 : `5f4dcc3b5aa765d61d8327deb882cf99`. Ligne 2 : `pbkdf2_sha256$600000$Xq3...$9fK...`. Ligne 3 : une colonne `password_enc` qui contient un chiffré AES-GCM, avec la clé dans `settings.py`. L’appli tourne sur Django au commit épinglé. Classe les lignes de la pire à la meilleure, et dis ce qui arrive à la ligne 2 à sa prochaine connexion réussie.',
		hint: 'La ligne 1 fait 32 caractères hexadécimaux, sans `$`. Qu’est-ce qui a cette forme, et que dit la table de deux utilisateurs au même mot de passe ? Pour la ligne 2, compare 600000 à `iterations`.',
		answer: [
			'La ligne 1 est un MD5 sans sel : 32 caractères hexadécimaux, pas de sel, pas de facteur de travail. C’est le MD5 du mot `password` : n’importe quelle table de correspondance publique le retrouve tout de suite.',
			'La ligne 3 vient ensuite. AES-GCM avec un nonce neuf cache mieux les mots de passe égaux que l’ECB d’Adobe, mais quiconque lit `settings.py` déchiffre toutes les lignes. Même problème qu’Adobe : une seule clé pour tous.',
			'La ligne 2 est la meilleure : salée, lente, à sens unique. À la prochaine connexion réussie, `must_update` voit 600000, différent de 1 800 000 : `check_password` appelle `setter`, qui enregistre `pbkdf2_sha256$1800000$<nouveau sel>$<hash>` dans la ligne.',
			'Correction pour les lignes 1 et 3 : les passer en PBKDF2 ou Argon2 maintenant. La ligne 3 peut être déchiffrée et hachée dans une seule migration. La ligne 1 demande la méthode du hasher enveloppant décrite dans la doc de Django.'
		]
	},
	quiz: [
		{
			q: 'Sophos a pu voir quels utilisateurs d’Adobe partageaient un mot de passe, sans avoir la clé. Pourquoi ?',
			options: [
				'Le dump contenait aussi chaque mot de passe en clair à côté du bloc',
				'L’ECB avec une seule clé donne le même bloc pour le même mot de passe, sans sel',
				'3DES est cassé, donc chaque bloc se déchiffrait en quelques secondes',
				'Adobe hachait les mots de passe en MD5, et les tables MD5 sont publiques'
			],
			answer: 1,
			why: 'En mode ECB, le même bloc d’entrée avec la même clé donne toujours le même bloc de sortie. Sans sel ni nonce par utilisateur, des mots de passe égaux donnent des blocs égaux, et les indices à côté trahissent les mots de passe.'
		},
		{
			q: 'Une ligne contient `pbkdf2_sha256$600000$...`, et `iterations` vaut aujourd’hui 1 800 000 dans Django. L’utilisateur se connecte avec le bon mot de passe. Que se passe-t-il ?',
			options: [
				'La connexion échoue tant qu’un admin ne réinitialise pas le mot de passe',
				'Django hache à nouveau le mot de passe à 1 800 000 itérations et l’enregistre',
				'Django fait 1 800 000 itérations mais garde l’ancienne ligne',
				'Rien ne change : le nombre stocké reste pour toujours'
			],
			answer: 1,
			why: '`must_update` renvoie vrai, car 600000 diffère de `self.iterations`. `check_password` appelle alors `setter(password)` avec le mot de passe que l’utilisateur vient de taper, et la nouvelle valeur porte 1 800 000 itérations et un sel neuf.'
		},
		{
			q: 'Pourquoi un SHA-256 salé reste-t-il un mauvais choix pour des mots de passe ?',
			options: [
				'La sortie de SHA-256 est assez courte pour entrer en collision sur les mots courants',
				'Le sel doit rester secret, or il est stocké à côté du hash',
				'SHA-256 est rapide, donc un attaquant teste beaucoup d’essais par seconde',
				'SHA-256 est réversible, donc le hash se déchiffre avec le sel'
			],
			answer: 2,
			why: 'Le sel empêche seulement un essai de toucher plusieurs utilisateurs à la fois. L’OWASP : les hashs rapides comme SHA-256 "allow attackers to perform large numbers of guesses quickly". Un facteur de travail fait payer à chaque essai le prix d’une vraie connexion.'
		}
	],
	recall: {
		q: 'Que stocke Django pour un mot de passe, et que se passe-t-il quand le facteur de travail stocké est dépassé ?',
		a: '`pbkdf2_sha256$<iterations>$<salt>$<hash>`, avec 1 800 000 itérations au commit épinglé. À la prochaine connexion réussie, `must_update` vaut vrai et le mot de passe est haché à nouveau au nombre actuel.'
	},
	sources: [
		{ title: 'Sophos Naked Security, Anatomy of a password disaster : Adobe (archive, novembre 2013)', url: SOPHOS },
		{ title: 'Krebs on Security, la fuite d’Adobe touche au moins 38 millions d’utilisateurs (octobre 2013)', url: 'https://krebsonsecurity.com/2013/10/adobe-breach-impacted-at-least-38-million-users/' },
		{ title: 'OWASP, Password Storage Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html' },
		{ title: 'Doc Django, gestion des mots de passe', url: 'https://docs.djangoproject.com/en/stable/topics/auth/passwords/' },
		{ title: 'Code source de Django, django/contrib/auth/hashers.py', url: HASHERS }
	]
};
