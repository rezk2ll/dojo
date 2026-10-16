const NG = 'https://github.com/angular/angular';
const PARENT = 'fadfee43247acec7e450d5cc929a0a6780a54bd1';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'exclusive-end',
	part: 'Counting',
	title: 'One character past the template',
	minutes: 10,
	hook: [
		'Angular 17 ships a schematic that rewrites `*ngIf` templates into the new `@if` blocks. On some files it produced **broken HTML**. A user reported it on a template where `</ng-template></span` sat on one line.',
		'To migrate an `<ng-template>`, the schematic copies its source text into `contents`, writes the new block, then deletes `contents` from the file. The text it copied was **one character longer** than the template.'
	],
	terms: [
		{ term: 'Source span', def: 'The start and end offsets of an element in the template text, as the Angular parser records them.' },
		{ term: 'Exclusive end', def: 'An end offset that points just past the last character. `slice(start, end)` already stops before `end`.' },
		{ term: 'Schematic', def: 'An Angular CLI script that edits the files of a project, here to migrate templates to the new control flow.' }
	],
	bug: {
		title: 'fix(migrations): fix off by one issue with template removal in CF migration (#53255)',
		repo: 'angular/angular',
		url: `${NG}/blob/${PARENT}/packages/core/schematics/ng-generate/control-flow-migration/types.ts#L189-L228`,
		fix: `${NG}/commit/6291c8db092c0ab67f6789cc03c19dfa0bdc251d`,
		lang: 'typescript',
		code: `export class Template {
  el: Element;
  name: string;
  count: number = 0;
  contents: string = '';
  children: string = '';
  i18n: Attribute|null = null;
  attributes: Attribute[];
…
  generateContents(tmpl: string) {
    this.contents = tmpl.slice(this.el.sourceSpan.start.offset, this.el.sourceSpan.end.offset + 1);
    this.children = '';
    if (this.el.children.length > 0) {
      this.children = tmpl.slice(
          this.el.children[0].sourceSpan.start.offset,
          this.el.children[this.el.children.length - 1].sourceSpan.end.offset);
    }
  }`,
		lines: [11],
		diff: `   generateContents(tmpl: string) {
-    this.contents = tmpl.slice(this.el.sourceSpan.start.offset, this.el.sourceSpan.end.offset + 1);
+    this.contents = tmpl.slice(this.el.sourceSpan.start.offset, this.el.sourceSpan.end.offset);
     this.children = '';`,
		notes: [
			'**The end is already exclusive.** `sourceSpan.end.offset` points just past the last `>` of `</ng-template>`, and `slice` stops before its second argument. The `+ 1` adds the character after the template. Four lines below, the `children` slice uses `end.offset` with no `+ 1`, and that one is right.',
			'**Where the extra character goes.** Take `<ng-template #elseTmpl> 0 </ng-template></span>`. The template is 40 characters long. If it starts at offset 100, its end offset is 140, and `slice(100, 141)` also takes the `<` at offset 140. The migration then runs `template.replace(t.contents, \'\')` ([util.ts](' + NG + '/blob/' + PARENT + '/packages/core/schematics/ng-generate/control-flow-migration/util.ts#L348)), which deletes that `<` too and leaves `/span>` in the file.',
			'**Why most files came out fine.** When a space or a newline follows `</ng-template>`, the extra character is whitespace and losing it does not break the HTML. The commit message says it: "an extra space was being added when it was unnecessary. This resulted in malformed html if there was no space afterwards."',
			'**How it was found.** Issue [#53248](' + NG + '/issues/53248), "control-flow schematic fails on some multi-line elements", with a template that ends in `</ng-template></span`. The fix removes the `+ 1`, and its test puts `</span>` right after `</ng-template>`.'
		]
	},
	quiz: [
		{
			q: 'The template starts at offset 100 and is 40 characters long. What does the buggy `slice` return?',
			options: [
				'Offsets 100 to 140: the template plus the next `<`',
				'Offsets 100 to 139: exactly the template',
				'Offsets 101 to 140: the template minus its first `<`',
				'Offsets 99 to 139: the template plus the space before it'
			],
			answer: 0,
			why: 'The end offset is 140, one past the last character. `slice(100, 141)` returns offsets 100 to 140, so the character at 140 comes along.'
		},
		{
			q: 'Why did the migration work on most templates despite the `+ 1`?',
			options: [
				'The parser usually returned an end offset one too small',
				'The character after the template was usually a space or a newline',
				'`replace` ignores the last character when it does not match',
				'Most templates were removed by a different code path'
			],
			answer: 1,
			why: 'Deleting one whitespace character after `</ng-template>` leaves valid HTML. Only a tag written right after it, like `</span>`, loses its `<`.'
		},
		{
			q: 'Which test input exposes this off-by-one on the end of a range?',
			options: [
				'A template that is the only element in the file',
				'A template followed by a newline and an indented tag',
				'A template followed directly by a closing tag, with no space',
				'A template with no children inside it at all'
			],
			answer: 2,
			why: 'With no whitespace after the template, the extra character is the `<` of the next tag. That is the input the fix commit added as a test.'
		}
	],
	takeaway: 'Before adding 1 to an end offset, check whether the API already gives you the position after the last character. Test with something written right after the range, with no space in between.',
	sources: [
		{ title: 'angular pull request #53255', url: `${NG}/pull/53255` },
		{ title: 'angular issue #53248', url: `${NG}/issues/53248` }
	]
};
