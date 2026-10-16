const NODE = 'https://github.com/nodejs/node';
const FILE = `${NODE}/blob/1847670c88da5a10cdae6380b21af696b329471d/src/node_crypto.cc`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'precedence',
	part: 'Logic',
	title: 'An empty IV that passed the length check',
	minutes: 10,
	hook: [
		'A Node.js 6.7 user encrypts the same 8-byte block 10 times with `crypto.createCipheriv(\'des\', key, Buffer.alloc(0))`, the same key each time. Iterations 0 to 3 print `959f39b6951d75e6`. Iterations 4 and 6 print `a3201c51a48d3df8`, and iteration 7 prints `7971aa42de5e626b`.',
		'The third argument is the IV, here 0 bytes long. `des` is DES in CBC mode, which needs an 8-byte IV. ECB mode takes no IV, and GCM mode accepts several lengths. The C++ check below is supposed to reject a wrong length with "Invalid IV length".'
	],
	terms: [
		{ term: 'IV', def: 'Initialization vector: extra bytes a cipher mixes into the first block. CBC mode needs one exactly as long as a block, 8 bytes for DES.' },
		{ term: 'ECB, CBC, GCM', def: 'Three cipher modes: ECB uses no IV, CBC needs an IV of a fixed length, GCM accepts IVs of different lengths.' },
		{ term: 'Precedence', def: 'The rules for how operators group when there are no parentheses. `a && b && c` must all be true; a parenthesis decides which part a condition belongs to.' }
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
			'On line 17, `iv_len > 0` sits outside every parenthesis, so it is one more term of the `&&` chain that starts on line 15. Line 18 throws only when `iv_len > 0` is true. Any IV of 0 bytes skips the throw, whatever the cipher. The commit message names it "a misplaced parenthesis in a \'is ECB cipher?\' check".',
			'For `des`, the cipher wants 8 bytes and gets 0. `8 != 0` is true. The cipher is not ECB, so the second term is true, and not GCM, so the third is true. `0 > 0` is false, so the whole `&&` is false and no error is thrown. With a 4-byte IV the last term is true and Node throws "Invalid IV length".',
			'The fix rewrites the check with two named values: `is_gcm_mode == false && iv_len != expected_iv_len`. Every non-GCM cipher now needs exactly the length OpenSSL reports, 0 for ECB and 8 for DES-CBC, so an empty IV for `des` is rejected.',
			'The commit says the bug was "a regression introduced in commit 2996b5c (\\"crypto: Allow GCM ciphers to have a longer IV length\\") from April 2016" and that it "made it possible to use empty IVs with non-ECB ciphers". It was reported in [issue #9024](' + NODE + '/issues/9024), "require(\'crypto\') & DES inconsistent".'
		]
	},
	quiz: [
		{
			q: 'Which input gets past the buggy check for a CBC cipher with an 8-byte IV?',
			options: ['An IV of 4 bytes', 'An IV of 0 bytes', 'An IV of 16 bytes', 'An IV of 7 bytes'],
			answer: 1,
			why: 'Every term but the last is true for any wrong length. The last term, iv_len > 0, is false only for 0, so only an empty IV avoids the error.'
		},
		{
			q: 'In `a && !(b && c) && !(d) && e`, which terms does `e` apply to?',
			options: [
				'Only to the term just before it, `!(d)`',
				'To the whole chain: all five must hold',
				'Only to `c`, inside the first parenthesis',
				'To nothing, the compiler drops it'
			],
			answer: 1,
			why: 'A chain of && is true only when every term is true. A term outside the parentheses joins the whole chain, not the clause next to it.'
		},
		{
			q: 'How would a test have caught this bug?',
			options: [
				'Encrypt with a valid 8-byte IV and compare the output',
				'Expect "Invalid IV length" for an empty IV with a CBC cipher',
				'Check that GCM accepts a 12-byte IV',
				'Check that ECB accepts an empty IV'
			],
			answer: 1,
			why: 'The other three cases all behave correctly with the buggy check. Only the empty IV on a non-ECB cipher reaches the broken branch.'
		}
	],
	recall: {
		q: 'Why did Node.js 6.7 accept an empty IV for `des` without "Invalid IV length"?',
		a: '`iv_len > 0` sat outside the parentheses, so it joined the whole `&&` chain, and with `iv_len` at 0 the chain was false. The fix checks `is_gcm_mode == false && iv_len != expected_iv_len`, which rejects 0 bytes when DES-CBC wants 8.'
	},
	sources: [
		{ title: 'node pull request #9032', url: `${NODE}/pull/9032` },
		{ title: 'Issue #9024: DES output inconsistent', url: `${NODE}/issues/9024` }
	]
};
