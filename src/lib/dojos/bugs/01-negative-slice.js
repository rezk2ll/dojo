const VITE = 'https://github.com/vitejs/vite';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'negative-slice',
	part: 'Counting',
	title: 'One column too far',
	minutes: 10,
	hook: [
		'A Vite beta came out, and some projects stopped building. The HTML plugin crashed with **"end must be greater than start"**. Nothing in those projects had changed.',
		'The new code removed whitespace around tags in `index.html`. To do that, it looked back from each tag to the start of its line. In some files the start it computed was **one character before the start of the file**.'
	],
	terms: [
		{ term: 'Offset', def: 'A position in the whole file, counted in characters from 0.' },
		{ term: 'Column', def: 'A position inside one line. The HTML parser Vite uses counts columns from 1.' },
		{ term: 'Off-by-one', def: 'A count that is wrong by exactly one, often because one value starts at 0 and another at 1.' }
	],
	bug: {
		title: 'fix: off-by-one bug in HTML whitespace removal',
		repo: 'vitejs/vite',
		url: `${VITE}/blob/0a38e3b395d1e705321f6f18690acde5f0fc378c/packages/vite/src/node/plugins/html.ts#L326-L342`,
		fix: `${VITE}/commit/f54e6d8dad6daeaede55d6363ed7f1cf6899f914`,
		lang: 'typescript',
		code: `// Determines true start position for the node, either the < character
// position, or the newline at the end of the previous line's node.
const nodeStartWithLeadingWhitespace = (
  node: DefaultTreeAdapterMap['node'],
) => {
  if (node.sourceCodeLocation!.startOffset === 0)
    return node.sourceCodeLocation!.startOffset

  // Gets the offset for the start of the line including the
  // newline trailing the previous node
  const lineStartOffset =
    node.sourceCodeLocation!.startOffset -
    node.sourceCodeLocation!.startCol
  const line = s.slice(
    lineStartOffset,
    node.sourceCodeLocation!.startOffset,
  )`,
		lines: [15],
		diff: `           const line = s.slice(
-            lineStartOffset,
+            Math.max(0, lineStartOffset),
             node.sourceCodeLocation!.startOffset,
           )`,
		notes: [
			'**Two counts that start in different places.** `startOffset` counts from 0 and `startCol` counts from 1. The pull request says it: "`startCol` is 1-indexed, while `startOffset` is 0 indexed."',
			'**Where it breaks.** Take a tag on the first line of the file, at column 3. Its offset is 2. The code computes 2 minus 3, which is **-1**, and passes that to `s.slice`. On later lines the result is the newline before the line, which is what the comment wants. Only the first line has no newline before it.',
			'**The fix.** `Math.max(0, lineStartOffset)` never goes below the start of the file. The early return above it already handled a tag at offset 0, but not a tag further along the first line.',
			'**How it showed up.** A user reported the crash on the pull request that added this code ([comment](' + VITE + '/pull/14274#issuecomment-1758742149)): "[vite:build-html] end must be greater than start".'
		]
	},
	quiz: [
		{
			q: 'A tag sits on the first line of the file, at column 3. What does the buggy code compute for `lineStartOffset`?',
			options: ['0, the start of the file', '-1, one before the start of the file', '2, the offset of the tag itself', '3, the column of the tag'],
			answer: 1,
			why: 'Its offset is 2 (counted from 0) and its column is 3 (counted from 1). 2 minus 3 is -1.'
		},
		{
			q: 'Why did the early return for `startOffset === 0` not prevent the crash?',
			options: [
				'It only covers a tag at the very first character',
				'It runs after the slice, so it comes too late',
				'It compares the column, not the offset',
				'It is skipped when the file has a doctype'
			],
			answer: 0,
			why: 'Offset 0 is the first character. A tag later on the first line has an offset above 0, so it passes the check and still gets -1.'
		},
		{
			q: 'You mix a value counted from 0 with one counted from 1. Which input should a test use first?',
			options: [
				'A very long file, to see how fast the plugin runs',
				'Something on the first line, after its first character',
				'A file saved with Windows line endings (CRLF)',
				'Something on the last line, with no newline after it'
			],
			answer: 1,
			why: 'The first line has nothing before it, so a result that is one too small falls outside the file. Later lines hide the mistake because the character before them exists.'
		}
	],
	takeaway: 'When you subtract a 1-based column from a 0-based offset, the first line of the file gives -1. Clamp the result, or convert both values to the same base first.',
	sources: [
		{ title: 'vite pull request #14589', url: `${VITE}/pull/14589` },
		{ title: 'The bug report on pull request #14274', url: `${VITE}/pull/14274#issuecomment-1758742149` }
	]
};
