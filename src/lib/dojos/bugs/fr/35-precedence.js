const NODE = 'https://github.com/nodejs/node';
const FILE = `${NODE}/blob/1847670c88da5a10cdae6380b21af696b329471d/src/node_crypto.cc`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'precedence',
	part: 'La logique',
	title: 'Un IV vide qui passait le contrôle de longueur',
	minutes: 10,
	hook: [
		'Un utilisateur de Node.js 6.7 chiffre 10 fois le même bloc de 8 octets avec `crypto.createCipheriv(\'des\', key, Buffer.alloc(0))`, toujours avec la même clé. Les tours 0 à 3 affichent `959f39b6951d75e6`. Les tours 4 et 6 affichent `a3201c51a48d3df8`, et le tour 7 affiche `7971aa42de5e626b`.',
		'Le troisième argument est l’IV, ici long de 0 octet. `des` désigne DES en mode CBC, qui exige un IV de 8 octets. Le mode ECB ne prend pas d’IV, et le mode GCM accepte plusieurs longueurs. Le contrôle C++ ci-dessous doit refuser une mauvaise longueur avec "Invalid IV length".'
	],
	terms: [
		{ term: 'IV', def: 'Vecteur d’initialisation : des octets en plus que le chiffrement mélange au premier bloc. Le mode CBC en veut un exactement de la taille d’un bloc, 8 octets pour DES.' },
		{ term: 'ECB, CBC, GCM', def: 'Des modes de chiffrement. ECB n’utilise pas d’IV, CBC exige un IV de longueur fixe, GCM accepte des IV de longueurs différentes.' },
		{ term: 'Précédence', def: 'Les règles qui disent comment les opérateurs se groupent sans parenthèses. Dans `a && b && c`, tout doit être vrai ; une parenthèse décide à quelle partie appartient une condition.' }
	],
	bug: {
		title: 'crypto: fix faulty logic in iv size check',
		repo: 'nodejs/node',
		url: `${FILE}#L3249-L3267`,
		fix: `${NODE}/commit/6ef6d42cce8535aa3f25b07ede5942f74959033a`,
		lang: 'cpp',
		code: `void CipherBase::InitIv(const char* cipher_type,
                        const char* key,
                        int key_len,
                        const char* iv,
                        int iv_len) {
  HandleScope scope(env()->isolate());

  cipher_ = EVP_get_cipherbyname(cipher_type);
  if (cipher_ == nullptr) {
    return env()->ThrowError("Unknown cipher");
  }

  /* OpenSSL versions up to 0.9.8l failed to return the correct
     iv_length (0) for ECB ciphers */
  if (EVP_CIPHER_iv_length(cipher_) != iv_len &&
      !(EVP_CIPHER_mode(cipher_) == EVP_CIPH_ECB_MODE && iv_len == 0) &&
      !(EVP_CIPHER_mode(cipher_) == EVP_CIPH_GCM_MODE) && iv_len > 0) {
    return env()->ThrowError("Invalid IV length");
  }`,
		lines: [16, 17],
		diff: `   }

-  /* OpenSSL versions up to 0.9.8l failed to return the correct
-     iv_length (0) for ECB ciphers */
-  if (EVP_CIPHER_iv_length(cipher_) != iv_len &&
-      !(EVP_CIPHER_mode(cipher_) == EVP_CIPH_ECB_MODE && iv_len == 0) &&
-      !(EVP_CIPHER_mode(cipher_) == EVP_CIPH_GCM_MODE) && iv_len > 0) {
+  const int expected_iv_len = EVP_CIPHER_iv_length(cipher_);
+  const bool is_gcm_mode = (EVP_CIPH_GCM_MODE == EVP_CIPHER_mode(cipher_));
+
+  if (is_gcm_mode == false && iv_len != expected_iv_len) {
     return env()->ThrowError("Invalid IV length");
   }`,
		notes: [
			'**`iv_len > 0` porte sur toute la condition.** Il est hors de toute parenthèse, c’est donc un terme de plus dans la grande chaîne de `&&`. L’erreur n’est levée que si `iv_len > 0` est vrai. Un IV de 0 octet échappe au `throw`, quel que soit l’algorithme. Le commit parle de "a misplaced parenthesis in a \'is ECB cipher?\' check" (une parenthèse mal placée dans le test « est-ce de l’ECB ? »).',
			'**Les chiffres pour `des`.** L’algorithme attend 8 octets et en reçoit 0. `8 != 0` est vrai. Pas d’ECB, donc le deuxième terme est vrai. Pas de GCM, donc le troisième est vrai. `0 > 0` est faux, donc tout le `&&` est faux et aucune erreur n’est levée. Avec un IV de 4 octets, le dernier terme est vrai et Node lève l’erreur, comme prévu.',
			'**Le correctif.** Il réécrit le test avec deux valeurs nommées : `is_gcm_mode == false && iv_len != expected_iv_len`. Tout algorithme hors GCM exige maintenant exactement la longueur que donne OpenSSL, 0 pour ECB et 8 pour DES-CBC, donc un IV vide pour `des` est refusé.',
			'**Comment il est arrivé là.** Le commit parle d’"a regression introduced in commit 2996b5c (\\"crypto: Allow GCM ciphers to have a longer IV length\\") from April 2016", qui "made it possible to use empty IVs with non-ECB ciphers" (une régression d’avril 2016 qui permettait des IV vides hors ECB). Il a été signalé dans le [ticket #9024](' + NODE + '/issues/9024), "require(\'crypto\') & DES inconsistent".'
		]
	},
	quiz: [
		{
			q: 'Quelle entrée passe le test bogué pour un algorithme CBC avec un IV de 8 octets ?',
			options: ['Un IV de 4 octets', 'Un IV de 0 octet', 'Un IV de 16 octets', 'Un IV de 7 octets'],
			answer: 1,
			why: 'Tous les termes sauf le dernier sont vrais pour n’importe quelle mauvaise longueur. Le dernier, iv_len > 0, n’est faux que pour 0 : seul un IV vide évite l’erreur.'
		},
		{
			q: 'Dans `a && !(b && c) && !(d) && e`, sur quels termes porte `e` ?',
			options: [
				'Seulement sur le terme juste avant, `!(d)`',
				'Sur toute la chaîne : les cinq doivent tenir',
				'Seulement sur `c`, dans la première parenthèse',
				'Sur rien, le compilateur l’ignore'
			],
			answer: 1,
			why: 'Une chaîne de && n’est vraie que si chaque terme est vrai. Un terme hors des parenthèses rejoint toute la chaîne, pas la clause d’à côté.'
		},
		{
			q: 'Quel test aurait attrapé ce bug ?',
			options: [
				'Chiffrer avec un IV valide de 8 octets et comparer la sortie',
				'Attendre "Invalid IV length" pour un IV vide avec un algorithme CBC',
				'Vérifier que GCM accepte un IV de 12 octets',
				'Vérifier que ECB accepte un IV vide'
			],
			answer: 1,
			why: 'Les trois autres cas se comportent bien avec le test bogué. Seul un IV vide sur un algorithme hors ECB atteint la branche cassée.'
		}
	],
	takeaway: 'Quand une condition mélange `&&`, `||` et `!` sur plusieurs lignes, donne un nom à chaque partie ou ajoute des parenthèses qui montrent à quelle clause appartient chaque terme. Teste ensuite la valeur limite de chaque terme, ici un IV de longueur 0.',
	sources: [
		{ title: 'node, pull request #9032', url: `${NODE}/pull/9032` },
		{ title: 'Ticket #9024 : sortie DES incohérente', url: `${NODE}/issues/9024` }
	]
};
