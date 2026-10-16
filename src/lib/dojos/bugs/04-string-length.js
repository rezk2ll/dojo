const GO = 'https://github.com/golang/go';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'string-length',
	part: 'Counting',
	title: 'Two characters, six bytes',
	minutes: 10,
	hook: [
		'A Go program is built for WebAssembly and run under Node with `node wasm_exec.js main.wasm hello 世界`. It crashes before `main` starts, with **"RangeError: Source is too large"**. The same program run with `hello world` prints its arguments.',
		'Before Go starts, `wasm_exec.js` copies each argument into the WebAssembly memory as UTF-8 bytes ending with a zero byte. Then it moves `offset` forward so the next argument starts on a multiple of 8.'
	],
	terms: [
		{ term: 'UTF-16 code unit', def: 'What JavaScript strings are made of. `str.length` counts these units, not bytes.' },
		{ term: 'UTF-8', def: 'A text encoding where ASCII takes 1 byte and other characters take 2 to 4. `世` takes 3.' },
		{ term: 'TextEncoder', def: 'The browser and Node API whose `encode` method turns a string into its UTF-8 bytes, as a `Uint8Array`.' },
		{ term: 'Uint8Array view', def: '`new Uint8Array(buffer, offset, n)` is a window of `n` bytes on existing memory. `set` copies into it and throws if the source is longer.' }
	],
	bug: {
		title: 'misc/wasm: fix command line arguments containing multi-byte characters',
		repo: 'golang/go',
		url: `${GO}/blob/cbf90b0028265a6195257e31a03aae42d402dd64/misc/wasm/wasm_exec.js#L412-L429`,
		fix: `${GO}/commit/9308637e3c2babcb3695d9f9673cf2a2b840362d`,
		lang: 'javascript',
		code: `const mem = new DataView(this._inst.exports.mem.buffer)

// Pass command line arguments and environment variables to WebAssembly by writing them to the linear memory.
let offset = 4096;

const strPtr = (str) => {
	let ptr = offset;
	new Uint8Array(mem.buffer, offset, str.length + 1).set(encoder.encode(str + "\\0"));
	offset += str.length + (8 - (str.length % 8));
	return ptr;
};

const argc = this.argv.length;

const argvPtrs = [];
this.argv.forEach((arg) => {
	argvPtrs.push(strPtr(arg));
});`,
		lines: [8, 9],
		diff: ` const strPtr = (str) => {
-	let ptr = offset;
-	new Uint8Array(mem.buffer, offset, str.length + 1).set(encoder.encode(str + "\\0"));
-	offset += str.length + (8 - (str.length % 8));
+	const ptr = offset;
+	const bytes = encoder.encode(str + "\\0");
+	new Uint8Array(mem.buffer, offset, bytes.length).set(bytes);
+	offset += bytes.length;
+	if (offset % 8 !== 0) {
+		offset += 8 - (offset % 8);
+	}
 	return ptr;
 };`,
		notes: [
			'**Two lengths in two units.** `str.length` counts UTF-16 code units. `encoder.encode` returns UTF-8 bytes. The view is sized with the first and filled with the second. For ASCII text both give the same number, so `hello world` works.',
			'**Where it breaks.** Take `世界`. `str.length` is 2, so the view is 2 + 1 = **3 bytes**. Each character is 3 bytes in UTF-8, so `encode("世界\\0")` returns **7 bytes**. `set` cannot copy 7 bytes into a 3-byte window and throws "Source is too large".',
			'**Line 9 has the same mistake.** It moves `offset` by the character count. With only line 8 fixed, `ééééééé` (7 characters, 14 bytes plus the zero byte) would write 15 bytes, and `offset` would move by 7 + 1 = 8. The next argument would start inside this one and overwrite its last 7 bytes.',
			'**The fix.** It encodes once and uses `bytes.length` for both the view and the offset. Then it rounds `offset` up to the next multiple of 8 only when it is not one already.',
			'**How it was found.** Issue [#31645](' + GO + '/issues/31645), "misc/wasm: wrong string length in strPtr function in wasm_exec.js". The reporter showed it in the Node REPL: `"世界".length` gives 2 and the encoded bytes have length 6.'
		]
	},
	quiz: [
		{
			q: 'The argument is `世界`. What sizes meet in the buggy `set` call?',
			options: [
				'A 3-byte view and 7 encoded bytes',
				'A 7-byte view and 3 encoded bytes',
				'A 2-byte view and 6 encoded bytes',
				'A 7-byte view and 7 encoded bytes'
			],
			answer: 0,
			why: '`str.length + 1` is 2 + 1 = 3. The UTF-8 encoding of `世界` plus the zero byte is 3 + 3 + 1 = 7 bytes.'
		},
		{
			q: 'Why does the code work with arguments like `-test.v`?',
			options: [
				'TextEncoder returns UTF-16 units for ASCII text',
				'For ASCII text, `length` and the UTF-8 byte count are equal',
				'Node pads every string to 8 bytes before encoding it',
				'The zero byte is dropped when the text is ASCII'
			],
			answer: 1,
			why: 'Every ASCII character is one UTF-16 unit and one UTF-8 byte. The two counts only differ once a character outside ASCII appears.'
		},
		{
			q: 'You size a buffer for the encoded form of a string. Which test input catches this kind of bug?',
			options: [
				'A long ASCII string close to the buffer limit',
				'An empty string, so the buffer holds only the zero byte',
				'A string with characters outside ASCII, like é or 世',
				'A string with spaces and tabs in the middle'
			],
			answer: 2,
			why: 'Only non-ASCII characters make the encoded size differ from the character count. The other inputs keep both counts equal.'
		}
	],
	takeaway: 'When you size a buffer or move an offset for encoded text, take the length from the encoded bytes, not from the string. Test it with at least one character outside ASCII.',
	sources: [
		{ title: 'go issue #31645', url: `${GO}/issues/31645` },
		{ title: 'The review, CL 173877', url: 'https://go-review.googlesource.com/c/go/+/173877' }
	]
};
