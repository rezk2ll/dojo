const HUGO = 'https://github.com/gohugoio/hugo';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'unescaped-input',
	part: 'Inputs',
	title: 'A quote in a heading ID',
	minutes: 10,
	hook: [
		'In Hugo, a Markdown heading can set its own ID: `## Intro {id="intro"}`. A page has this heading instead: `## Intro {id="x\\"><img src=x onerror=alert(1)><a class=\\""}`.',
		'The heading itself comes out safe: `<h2 id="x&quot;&gt;&lt;img ...">`. The table of contents for the same page, printed with `{{ .TableOfContents }}`, holds **a real `<img>` element**. Its `onerror` handler runs when the page loads.'
	],
	terms: [
		{ term: 'Table of contents (ToC)', def: 'The list of links to the headings of a page. Hugo builds its HTML in `tocBuilder` by writing strings to a buffer.' },
		{ term: 'Attribute breakout', def: 'A value placed inside `attr="..."` that contains a `"`. The quote ends the attribute early and the rest is read as new HTML.' },
		{ term: 'template.HTMLEscapeString', def: 'A Go function that replaces `<`, `>`, `&`, `\'` and `"` with HTML entities, so the browser reads them as text.' }
	],
	bug: {
		title: 'markup/tableofcontents: Escape heading IDs in ToC HTML',
		repo: 'gohugoio/hugo',
		url: `${HUGO}/blob/c7e1a8e639bc6569af5fe1ae8157e973b9721813/markup/tableofcontents/tableofcontents.go#L242-L256`,
		fix: `${HUGO}/commit/671fbf2c11ef721996dc3fcb7dd6dd0d8d2ac8df`,
		lang: 'go',
		code: `func (b *tocBuilder) writeHeading(level, indent int, h *Heading) {
	b.indent(indent)
	b.s.WriteString("<li>")
	if !h.IsZero() {
		b.s.WriteString("<a href=\\"#" + h.ID + "\\">" + h.Title + "</a>")
	}
	b.writeHeadings(level, indent, h.Headings)
	b.s.WriteString("</li>\\n")
}

func (b *tocBuilder) indent(n int) {
	for range n {
		b.s.WriteString("  ")
	}
}`,
		lines: [5],
		diff: ` 	if !h.IsZero() {
-		b.s.WriteString("<a href=\\"#" + h.ID + "\\">" + h.Title + "</a>")
+		b.s.WriteString("<a href=\\"#" + template.HTMLEscapeString(h.ID) + "\\">" + h.Title + "</a>")
 	}`,
		notes: [
			'Line 5 joins `h.ID` between `href="#` and `">` with `+`. No code on that line changes a quote or a `<`. The commit message: "Explicit heading IDs (e.g. `## Foo {id="..."}`) were written unescaped into the ToC href, allowing attribute breakout."',
			'With the ID from the hook, line 5 writes `<a href="#x"><img src=x onerror=alert(1)><a class="">Intro</a>`. The first `"` closes `href`, and the `>` closes the link. The browser then reads an `<img>` whose source `x` fails to load, so `onerror` runs.',
			'A different renderer writes the `<h2>`, and it escapes its attributes. The fix does not touch that renderer. Only `writeHeading` builds its HTML by joining strings, so only the ToC let the quote through.',
			'Line 5 now passes the ID through `template.HTMLEscapeString(h.ID)`, which writes it as `x&#34;&gt;&lt;img src=x onerror=alert(1)&gt;&lt;a class=&#34;`. The test added with the fix checks that `a&b<c>` comes out as `a&amp;b&lt;c&gt;` and that the page contains no `<img src=x`.'
		]
	},
	quiz: [
		{
			q: 'The ID is `x"><img src=x onerror=alert(1)><a class="`. What does the buggy ToC put in the page?',
			options: [
				'A link whose `href` holds the whole ID as plain text',
				'A link closed early, followed by a real `<img>` element',
				'Nothing, because Hugo rejects IDs that contain quotes',
				'A link whose quotes were turned into `&quot;` entities'
			],
			answer: 1,
			why: 'The first `"` in the ID ends the `href` value and `>` ends the `<a>` tag. The browser then parses `<img src=x onerror=alert(1)>` as a new element.'
		},
		{
			q: 'The same ID was safe in the `<h2>` of the page. Why?',
			options: [
				'Browsers do not run event handlers inside headings',
				'The ToC is built before the heading IDs are parsed',
				'Hugo strips `onerror` from heading attributes',
				'Its renderer escapes the ID; the ToC joins strings'
			],
			answer: 3,
			why: 'The fix changes only `writeHeading` in the ToC builder. The `<h2 id="x&quot;...">` output was already escaped by the renderer that writes headings.'
		},
		{
			q: 'You write a test for a function that builds HTML from strings. Which value should it use?',
			options: [
				'An ID with `"`, `<` and `&`, checked for escaping',
				'A very long ID, to check the buffer grows',
				'An ID in lowercase letters only, to check the link',
				'Two headings with the same ID, to check duplicates'
			],
			answer: 0,
			why: 'Only characters that mean something in HTML show whether the value is escaped. The quote matters most inside an attribute.'
		}
	],
	recall: {
		q: 'The same heading ID was safe in the `<h2>` and ran `onerror` in the ToC. Why?',
		a: 'Line 5 of `writeHeading` joined the raw `h.ID` into `href="#..."`, so its `"` closed the attribute. The heading renderer escaped the ID. The fix wraps it in `template.HTMLEscapeString`.'
	},
	sources: [
		{ title: 'The fix commit, with its test', url: `${HUGO}/commit/671fbf2c11ef721996dc3fcb7dd6dd0d8d2ac8df` }
	]
};
