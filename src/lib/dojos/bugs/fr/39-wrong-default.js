const OPENSSL = 'https://github.com/openssl/openssl';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'wrong-default',
	part: 'La logique',
	title: 'Une clé de 16 octets, lue comme 8',
	minutes: 10,
	hook: [
		'Un rapport de fuzzing sur OpenSSL chiffrait les mêmes 16 octets avec `EVP_cast5_cfb()`, la même clé de 16 octets et le même IV, sur deux versions. OpenSSL 1.1.1f affichait `62 F5 FE 05 ...`, comme Crypto++. La branche master affichait `CF 90 97 8A ...`.',
		'Le programme ne fixe jamais la longueur de clé. Il appelle `EVP_EncryptInit_ex` une fois avec le chiffrement, puis une seconde fois avec la clé, donc c’est la longueur de clé par défaut du chiffrement qui s’applique. Sur master, CAST5 venait du nouveau code de provider ci-dessous. Chaque ligne `IMPLEMENT_var_keylen_cipher` déclare un mode.'
	],
	terms: [
		{ term: 'CAST5', def: 'Un chiffrement par bloc avec des blocs de 64 bits et des clés de 5 à 16 octets. Sa clé normale fait 16 octets (128 bits).' },
		{ term: 'Provider', def: 'Dans OpenSSL 3, le module qui implémente un algorithme. `legacyprov.c` associe des noms comme "CAST5-CFB" à ces tables de fonctions.' },
		{ term: '`IMPLEMENT_var_keylen_cipher`', def: 'Arguments de la macro, dans l’ordre : algorithme, nom en majuscules, mode, mode en majuscules, flags, bits de clé, bits de bloc, bits d’IV, bloc ou flux. Les bits de clé donnent la longueur de clé par défaut et le nom de la table, comme dans `cast5128cbc_functions`.' }
	],
	bug: {
		title: 'Fix incorrect default keysize for CAST ofb and cfb modes.',
		repo: 'openssl/openssl',
		url: `${OPENSSL}/blob/b756626a3732869875c50f150bddacfbcac5a7ab/providers/implementations/ciphers/cipher_cast5.c#L22-L55`,
		fix: `${OPENSSL}/commit/95cf64404cabac96f32e72b5673e2702627e6b4c`,
		lang: 'c',
		code: `#define CAST5_FLAGS (EVP_CIPH_VARIABLE_LENGTH)

static OSSL_OP_cipher_freectx_fn cast5_freectx;
static OSSL_OP_cipher_dupctx_fn cast5_dupctx;

static void cast5_freectx(void *vctx)
{
    PROV_CAST_CTX *ctx = (PROV_CAST_CTX *)vctx;

    OPENSSL_clear_free(ctx,  sizeof(*ctx));
}

static void *cast5_dupctx(void *ctx)
{
    PROV_CAST_CTX *in = (PROV_CAST_CTX *)ctx;
    PROV_CAST_CTX *ret = OPENSSL_malloc(sizeof(*ret));

    if (ret == NULL) {
        ERR_raise(ERR_LIB_PROV, ERR_R_MALLOC_FAILURE);
        return NULL;
    }
    *ret = *in;

    return ret;
}

/* cast5128ecb_functions */
IMPLEMENT_var_keylen_cipher(cast5, CAST, ecb, ECB, CAST5_FLAGS, 128, 64, 0, block)
/* cast5128cbc_functions */
IMPLEMENT_var_keylen_cipher(cast5, CAST, cbc, CBC, CAST5_FLAGS, 128, 64, 64, block)
/* cast564ofb64_functions */
IMPLEMENT_var_keylen_cipher(cast5, CAST, ofb64, OFB, CAST5_FLAGS, 64, 8, 64, stream)
/* cast564cfb64_functions */
IMPLEMENT_var_keylen_cipher(cast5, CAST, cfb64,  CFB, CAST5_FLAGS, 64, 8, 64, stream)`,
		lines: [32, 34],
		diff: ` IMPLEMENT_var_keylen_cipher(cast5, CAST, cbc, CBC, CAST5_FLAGS, 128, 64, 64, block)
-/* cast564ofb64_functions */
-IMPLEMENT_var_keylen_cipher(cast5, CAST, ofb64, OFB, CAST5_FLAGS, 64, 8, 64, stream)
-/* cast564cfb64_functions */
-IMPLEMENT_var_keylen_cipher(cast5, CAST, cfb64,  CFB, CAST5_FLAGS, 64, 8, 64, stream)
+/* cast5128ofb64_functions */
+IMPLEMENT_var_keylen_cipher(cast5, CAST, ofb64, OFB, CAST5_FLAGS, 128, 8, 64, stream)
+/* cast5128cfb64_functions */
+IMPLEMENT_var_keylen_cipher(cast5, CAST, cfb64,  CFB, CAST5_FLAGS, 128, 8, 64, stream)`,
		notes: [
			'**Deux modes, une autre taille de clé.** ECB et CBC passent 128 comme bits de clé. OFB et CFB passent 64. Le chiffrement est le même dans les quatre modes, donc la longueur de clé par défaut devrait l’être aussi. Le commit : "It was incorrectly using 8 bytes instead of 16 as the default."',
			'**Ce que faisait le reproducteur.** Avec un défaut de 64 bits, le contexte attend une clé de 8 octets, et seuls les 8 premiers octets de la clé de 16 octets servent. La clé du fuzzer était faite de seize octets `0x20`, sauf l’octet 11 qui valait `0xff`. Cet octet était après les 8 premiers, donc master chiffrait avec une autre clé que 1.1.1f et affichait d’autres octets.',
			'**Pourquoi les tests l’ont raté.** Le commit : "evp_test.c hides this issue as it always calls EVP_CIPHER_CTX_set_key_length() before using EVP_CipherInit_ex(...., key, ..)." Un appelant qui fixe la longueur obtient la bonne clé, donc seuls ceux qui comptaient sur la valeur par défaut voyaient le problème.',
			'**Le correctif et la découverte.** OFB et CFB passent maintenant 128 comme ECB et CBC, et les tables sont renommées `cast5128ofb64_functions` et `cast5128cfb64_functions`, dans `legacyprov.c` aussi. L’issue #11459 était "a reproducer for OSS-Fuzz bug" (un reproducteur d’un bug OSS-Fuzz) qui comparait des sorties, et le correctif "was verified by expanding the macros used in e_cast.c".'
		]
	},
	quiz: [
		{
			q: 'Avec la table boguée, un appelant passe une clé de 16 octets à CAST5-CFB sans fixer la longueur de clé. Combien d’octets de clé servent ?',
			options: ['16, tous', '8, la première moitié', '5, le minimum de CAST5', '0, l’appel échoue'],
			answer: 1,
			why: 'La longueur de clé par défaut est de 64 bits, soit 8 octets. Le contexte ne lit que les 8 premiers octets de la clé.'
		},
		{
			q: 'Pourquoi le propre `evp_test.c` d’OpenSSL n’a-t-il pas attrapé la mauvaise valeur par défaut ?',
			options: [
				'Il ne teste jamais les modes CFB et OFB de CAST5',
				'Il fixe toujours la longueur avant de passer la clé',
				'Ses vecteurs de test n’utilisent que des clés de 8 octets',
				'Il ne tourne qu’avec le provider par défaut chargé'
			],
			answer: 1,
			why: 'Un appel explicite à `EVP_CIPHER_CTX_set_key_length()` remplace la valeur par défaut, donc celle-ci ne servait jamais dans ces tests.'
		},
		{
			q: 'Quel test aurait attrapé ce bug directement ?',
			options: [
				'Chiffrer puis déchiffrer avec chaque mode et vérifier l’aller-retour',
				'Lire la longueur de clé par défaut de chaque mode et les comparer',
				'Chiffrer avec une clé de 5 octets et vérifier que l’appel réussit',
				'Chronométrer chaque mode pour voir si l’un est anormalement lent'
			],
			answer: 1,
			why: 'Un aller-retour passe même avec le mauvais défaut, parce que chiffrement et déchiffrement utilisent les mêmes 8 octets. Vérifier le défaut lui-même, ou comparer la sortie avec une autre bibliothèque, le trouve.'
		}
	],
	takeaway: 'Quand plusieurs déclarations de la même chose ne diffèrent que par un argument, aligne-les et vérifie chaque colonne qui devrait concorder. Teste les valeurs par défaut sans les fixer, parce que des tests qui passent toujours la valeur n’utilisent jamais le défaut.',
	sources: [
		{ title: 'openssl, issue #11459', url: `${OPENSSL}/issues/11459` },
		{ title: 'openssl, pull request #11707', url: `${OPENSSL}/pull/11707` }
	]
};
