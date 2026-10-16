const OPENSSL = 'https://github.com/openssl/openssl';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'wrong-default',
	part: 'Logic',
	title: 'A 16-byte key, used as 8',
	minutes: 10,
	hook: [
		'A fuzzing report on OpenSSL encrypted the same 16 bytes with `EVP_cast5_cfb()`, the same 16-byte key and the same IV, on two versions. OpenSSL 1.1.1f printed `62 F5 FE 05 ...`, which matched Crypto++. The master branch printed `CF 90 97 8A ...`.',
		'The program never sets the key length. It calls `EVP_EncryptInit_ex` once with the cipher, then again with the key, so the cipher’s default key length applies. On master, CAST5 came from the new provider code below. Each `IMPLEMENT_var_keylen_cipher` line declares one mode.'
	],
	terms: [
		{ term: 'CAST5', def: 'A block cipher with 64-bit blocks and keys of 5 to 16 bytes. Its normal key is 16 bytes (128 bits).' },
		{ term: 'Provider', def: 'In OpenSSL 3, the module that implements an algorithm. `legacyprov.c` maps names such as "CAST5-CFB" to these function tables.' },
		{ term: '`IMPLEMENT_var_keylen_cipher`', def: 'Macro arguments, in order: algorithm, upper-case name, mode, upper-case mode, flags, key bits, block bits, IV bits, block or stream. Key bits become the default key length and the table name, as in `cast5128cbc_functions`.' }
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
			'**Two modes, a different key size.** ECB and CBC pass 128 as the key bits. OFB and CFB pass 64. The cipher is the same in all four modes, so the default key length should be the same too. The commit: "It was incorrectly using 8 bytes instead of 16 as the default."',
			'**What the reproducer did.** With a default of 64 bits, the context expects an 8-byte key, and only the first 8 bytes of the 16-byte key are used. The fuzzer’s key was sixteen `0x20` bytes except byte 11, which was `0xff`. That byte was past the first 8, so master encrypted with a different key than 1.1.1f and printed different bytes.',
			'**Why the tests missed it.** The commit: "evp_test.c hides this issue as it always calls EVP_CIPHER_CTX_set_key_length() before using EVP_CipherInit_ex(...., key, ..)." Any caller that sets the length explicitly gets the right key, so only callers relying on the default saw it.',
			'**The fix and how it was found.** OFB and CFB now pass 128 like ECB and CBC, and the tables are renamed to `cast5128ofb64_functions` and `cast5128cfb64_functions` in `legacyprov.c` too. Issue #11459 was "a reproducer for OSS-Fuzz bug" comparing outputs, and the fix "was verified by expanding the macros used in e_cast.c".'
		]
	},
	quiz: [
		{
			q: 'With the buggy table, a caller passes a 16-byte key to CAST5-CFB without setting the key length. How many key bytes are used?',
			options: ['16, all of them', '8, the first half', '5, the CAST5 minimum', '0, the call fails'],
			answer: 1,
			why: 'The default key length is 64 bits, which is 8 bytes. The context reads only the first 8 bytes of the key.'
		},
		{
			q: 'Why did OpenSSL’s own `evp_test.c` not catch the wrong default?',
			options: [
				'It never tests the CFB and OFB modes of CAST5',
				'It always sets the key length before passing the key',
				'Its test vectors use keys of 8 bytes only',
				'It runs only with the default provider loaded'
			],
			answer: 1,
			why: 'An explicit `EVP_CIPHER_CTX_set_key_length()` overrides the default, so the default was never used in those tests.'
		},
		{
			q: 'Which test would have caught this bug directly?',
			options: [
				'Encrypt and decrypt with each mode and check the round trip',
				'Read each mode’s default key length and compare it across modes',
				'Encrypt with a 5-byte key and check the call succeeds',
				'Time each mode to check none is unusually slow'
			],
			answer: 1,
			why: 'A round trip passes even with the wrong default, because encrypt and decrypt use the same 8 bytes. Checking the default itself, or comparing output with another library, finds it.'
		}
	],
	takeaway: 'When several declarations of the same thing differ only in one argument, line them up and check every column that should match. Test defaults by not setting them, because tests that always pass the value never use the default.',
	sources: [
		{ title: 'openssl issue #11459', url: `${OPENSSL}/issues/11459` },
		{ title: 'openssl pull request #11707', url: `${OPENSSL}/pull/11707` }
	]
};
