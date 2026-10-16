const PRETTIER = 'https://github.com/prettier/prettier';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'text-encoding',
	part: 'Inputs',
	title: 'Offsets after stripping a BOM',
	minutes: 10,
	hook: [
		'Prettier can format part of a file: you pass `rangeStart` and `rangeEnd`, and it leaves the rest alone. On files that start with a byte order mark, it formatted code **outside the range**.',
		'The changelog gives the case. The text is a BOM, then `foo = 1.0000;bar = 1.0000;`, with `rangeStart: 1` and `rangeEnd: 13`. Only `foo` should change. The result was `foo = 1.0;`, a new line, then **`bar = 1.0;`**.',
		'Before formatting, Prettier strips the BOM and shifts every offset it was given so that they still point at the same characters.'
	],
	terms: [
		{ term: 'BOM', def: 'Byte order mark: the character U+FEFF that some editors write at the very start of a UTF-8 file. It is invisible but counts as one character in a JavaScript string.' },
		{ term: 'Offset', def: 'A position in the text, counted in characters from 0.' },
		{ term: 'Range formatting', def: 'Formatting only the code between `rangeStart` and `rangeEnd`, used by editors for "format selection".' }
	],
	bug: {
		title: 'Fix wrong range format on files with BOM (#8936)',
		repo: 'prettier/prettier',
		url: `${PRETTIER}/blob/69d26582e7be8177f754ed6a52170c9d9772a2bd/src/main/core.js#L283-L323`,
		fix: `${PRETTIER}/commit/6833310f87c597f0a204b06f2e84cb1b3b33ff54`,
		lang: 'javascript',
		code: `const hasUnicodeBOM = text.charAt(0) === BOM;
if (hasUnicodeBOM) {
  text = text.slice(1);
  if (hasCursor) {
    opts.cursorOffset++;
  }
  if (hasRangeStart) {
    opts.rangeStart++;
  }
  if (hasRangeEnd) {
    opts.rangeEnd++;
  }
}

if (!hasCursor) {
  opts.cursorOffset = -1;
}
if (opts.rangeStart < 0) {
  opts.rangeStart = 0;
}
if (opts.rangeEnd > text.length) {
  opts.rangeEnd = text.length;
}
…
if (hasUnicodeBOM) {
  result.formatted = BOM + result.formatted;

  if (hasCursor) {
    result.cursorOffset++;
  }
}`,
		lines: [5, 8, 11],
		diff: `     text = text.slice(1);
     if (hasCursor) {
-      opts.cursorOffset++;
+      opts.cursorOffset--;
     }
     if (hasRangeStart) {
-      opts.rangeStart++;
+      opts.rangeStart--;
     }
     if (hasRangeEnd) {
-      opts.rangeEnd++;
+      opts.rangeEnd--;
     }`,
		notes: [
			'Line 3 removes the first character with `text.slice(1)`, so every character after it moves one place to the left. An offset that pointed at `f` (index 1) must now be 0. Lines 5, 8 and 11 add 1 instead, so the range ends up two characters to the right of where it should be.',
			'With the BOM, `rangeStart: 1` and `rangeEnd: 13` cover `foo = 1.0000`. After the slice, the right range is 0 to 12. The buggy code gives 2 to 14, which takes in the `;` and the `b` of `bar`. That range touches the second statement, so Prettier formats both ("the real range is wrongly calculated").',
			'Line 29, `result.cursorOffset++`, is correct. Line 26 puts the BOM back with `BOM + result.formatted`, so the text grows by one character and the cursor must move right by one. The fix changes only lines 5, 8 and 11, from `++` to `--`.',
			'The pull request says: "Found this in #8811, turns out this is simple to fix." Pull request #8811 was about test coverage. The fix adds tests with a BOM for the cursor and for a range.'
		]
	},
	quiz: [
		{
			q: 'The text starts with a BOM and `rangeStart` is 1, pointing at `f`. After `text.slice(1)`, what should `rangeStart` be?',
			options: ['0, one less, because every character moved left', '1, unchanged, because the BOM is invisible', '2, one more, to skip over the BOM', '-1, so the BOM is included in the range'],
			answer: 0,
			why: 'Removing the first character moves `f` from index 1 to index 0. The offset has to follow it, so it goes down by one.'
		},
		{
			q: 'Why did ordinary formatting of a whole file with a BOM still look right?',
			options: [
				'The BOM was removed before any offset was read',
				'Without a range or a cursor, no offset was shifted at all',
				'Prettier refuses to format files that start with a BOM',
				'The parser ignores the first character of every file'
			],
			answer: 1,
			why: 'The three `++` lines run only when a cursor or a range was passed. A plain format of the whole file never uses those offsets.'
		},
		{
			q: 'You strip a prefix from text before processing it, and keep offsets into the text. What should a test check?',
			options: [
				'That the prefix is added back at the end of the output',
				'That a file without the prefix gives the same output as before',
				'That a range on the first word after the prefix covers that word only',
				'That a very large file with the prefix is still fast enough'
			],
			answer: 2,
			why: 'An offset shifted the wrong way shows up as a range that grows into the next word or statement. A range on the first word makes that visible right away.'
		}
	],
	recall: {
		q: 'Prettier strips a one-character BOM before formatting. What must happen to `rangeStart`, `rangeEnd` and the cursor offset?',
		a: 'Each one goes down by 1, because every character after the BOM moved one place left. The buggy code added 1, so a range on `foo` reached into `bar`.'
	},
	sources: [
		{ title: 'prettier pull request #8936', url: `${PRETTIER}/pull/8936` },
		{ title: 'The changelog entry for #8936', url: `${PRETTIER}/blob/6833310f87c597f0a204b06f2e84cb1b3b33ff54/changelog_unreleased/api/pr-8936.md` }
	]
};
