const GO = 'https://github.com/golang/go/blob/c3a068eec992b5ae783abce1a9d03f617b671ea2/src/html/template';
const ADVISORY = 'https://github.com/grafana/grafana/security/advisories/GHSA-vw7q-p2qg-4m5f';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'xss',
	part: 'Input and output',
	title: 'Cross-site scripting',
	minutes: 10,
	hook: [
		'On 19 June 2022 at 10:32 UTC, a researcher reported a stored XSS in the Unified Alerting feature of Grafana. Grafana triaged it the next day and published the fix on 14 July in 9.0.3, 8.5.9, 8.4.10 and 8.3.10 (CVE-2022-31097, CVSS 7.3).',
		'The impact, in the advisory: an attacker could "escalate privilege from editor to admin by tricking an authenticated admin to click on a link". In a stored XSS, Grafana saved the Editor\'s input and later served it inside a page. When an Admin opened that page, the script ran in the Admin\'s logged-in browser.'
	],
	terms: [
		{ term: 'Stored XSS', def: 'The script is saved on the server, in a comment or a profile field, and sent to every visitor who opens the page that shows it.' },
		{ term: 'Reflected XSS', def: 'The script travels in the request, such as `/search?q=<script>…`, and the server copies it into the response. The victim gets it by clicking a crafted link.' },
		{ term: 'Contextual escaping', def: 'Encoding a value for the exact place it is inserted: HTML text, an attribute, a URL or a JavaScript string. Each place needs a different encoding.' },
		{ term: 'Escape hatch', def: 'A framework feature that inserts a string with no escaping: `template.HTML` in Go, `{@html}` in Svelte, `dangerouslySetInnerHTML` in React.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['post["Attacker saves a comment: an img tag with src=x and an onerror handler"] --> db[("comments table")]'],
				highlight: ['post', 'db'],
				note: 'The textbook payload: an image with a broken source and an `onerror` handler. The server stores the comment as text. Nothing has run yet.'
			},
			{
				add: ['db --> concat["Server builds the page by concatenation: open div + comment + close div"]', 'concat --> run["Victim\'s browser parses an img tag and runs onerror"]'],
				highlight: ['concat', 'run'],
				note: 'The page puts the comment between two tags with no encoding. The browser cannot tell the comment from the page\'s own markup, so it builds an `<img>` element and runs the handler. The script runs inside the site\'s page, as the victim. OWASP lists "account impersonation" among the results.'
			},
			{
				add: ['link["Reflected: a script tag in /search?q=, sent as a link"] --> concat'],
				highlight: ['link'],
				note: 'The reflected variant skips the database. The server copies the `q` parameter into "No results for ...", and the attacker sends the link by e-mail or from another site. OWASP: "the injected script is reflected off the web server".'
			},
			{
				add: ['db --> esc["html/template: {{.}} in text runs the HTML escaper"]', 'esc --> text["The browser shows the img tag as characters"]'],
				highlight: ['esc', 'text'],
				note: 'With Go\'s `html/template`, `<div>{{.}}</div>` passes the value through the HTML escaper. It writes `<` as `&lt;` and `>` as `&gt;`, so the browser shows the characters and builds no element.'
			},
			{
				add: ['esc --> ctx["Same value in href, in a JS string, in an onclick: a different escaper for each"]'],
				highlight: ['ctx'],
				note: 'The HTML escaper alone is wrong inside `<script>` or `href`. The OWASP cheat sheet: "There are many different output encoding methods because browsers parse HTML, JS, URLs, and CSS differently." `html/template` tracks where each `{{.}}` sits and picks the escaper for that spot.'
			}
		]
	},
	example: {
		title: 'src/html/template/escape.go: escapeAction picks the escapers from the context',
		repo: 'golang/go',
		url: `${GO}/escape.go#L202-L279`,
		lang: 'go',
		code: `	s := make([]string, 0, 3)
	switch c.state {
	case stateError:
		return c
	case stateURL, stateCSSDqStr, stateCSSSqStr, stateCSSDqURL, stateCSSSqURL, stateCSSURL:
		switch c.urlPart {
		case urlPartNone:
			s = append(s, "_html_template_urlfilter")
			fallthrough
		case urlPartPreQuery:
			switch c.state {
			case stateCSSDqStr, stateCSSSqStr:
				s = append(s, "_html_template_cssescaper")
			default:
				s = append(s, "_html_template_urlnormalizer")
			}
		case urlPartQueryOrFrag:
			s = append(s, "_html_template_urlescaper")
…
	case stateJS:
		s = append(s, "_html_template_jsvalescaper")
		// A slash after a value starts a div operator.
		c.jsCtx = jsCtxDivOp
	case stateJSDqStr, stateJSSqStr:
		s = append(s, "_html_template_jsstrescaper")
	case stateJSTmplLit:
		s = append(s, "_html_template_jstmpllitescaper")
	case stateJSRegexp:
		s = append(s, "_html_template_jsregexpescaper")
	case stateCSS:
		s = append(s, "_html_template_cssvaluefilter")
	case stateText:
		s = append(s, "_html_template_htmlescaper")
	case stateRCDATA:
		s = append(s, "_html_template_rcdataescaper")
…
	switch c.delim {
	case delimNone:
		// No extra-escaping needed for raw text content.
	case delimSpaceOrTagEnd:
		s = append(s, "_html_template_nospaceescaper")
	default:
		s = append(s, "_html_template_attrescaper")
	}
	e.editActionNode(n, s)
	return c`,
		notes: [
			'`c.state` is where the parser stands when it reaches `{{.}}`: HTML text, a URL, a JavaScript string. Lines 32 and 33, `stateText`, are the plain case between two tags: only the HTML escaper.',
			'Line 8 adds `urlfilter` when the value starts a URL, as in `href="{{.}}"`. [`isSafeURL`](' + GO + '/url.go#L45-L54) accepts relative URLs and the `http`, `https` and `mailto` schemes. Anything else, such as `javascript:alert(1)`, is replaced by `#ZgotmplZ`.',
			'Line 24, `stateJSDqStr`, is a value inside a double-quoted JavaScript string. The JS string escaper turns `"` into `\\u0022` and `<` into `\\u003c`, so the value cannot close the string or the `<script>` tag.',
			'Lines 37 to 44 add a second layer for attributes. Inside a quoted attribute, `attrescaper` encodes the quotes so the value cannot end the attribute. The [package docs](' + GO + '/doc.go#L60-L73) show the result: at parse time, `href="/search?q={{.}}"` is rewritten to `{{. | urlescaper | attrescaper}}`.'
		]
	},
	tradeoff: {
		gain: [
			'Every `{{.}}` is escaped for its spot with no call to write. A developer who forgets is still covered.',
			'`href="{{.}}"` blocks `javascript:` URLs by default, a hole the HTML escaper alone leaves open.'
		],
		cost: [
			'`template.HTML` skips all escaping. Go\'s docs: "the encapsulated content should come from a trusted source, as it will be included verbatim in the template output." Svelte\'s `{@html}` is the same: "Never render unsanitized content."',
			'Escaping happens only for `html/template`. The same template parsed with `text/template` prints `<script>` as is, and the import line is the only difference.',
			'Code that builds HTML outside the template, with `innerHTML` in the browser or string concatenation on the server, gets no escaping at all.'
		]
	},
	task: {
		prompt: 'Predict the output. A Go handler uses `html/template` with `<p>Hello {{.Name}}</p>`, `<a href="{{.Site}}">site</a>`, `<script>var user = "{{.Name}}";</script>` and `<div>{{.Bio}}</div>`. The data: `Name` is `<b>"Bob"</b>`, `Site` is `javascript:alert(1)`, and `Bio` is a `template.HTML` built from a user\'s text, `<img src=x onerror=alert(1)>`. Which line is the hole?',
		hint: 'Three values are plain strings and one has a special type. Which escaper does each spot get?',
		answer: [
			'Line 1, HTML text: `Hello &lt;b&gt;&#34;Bob&#34;&lt;/b&gt;`. The browser shows the tags as characters.',
			'Line 2, URL start: `href="#ZgotmplZ"`. `javascript:` is not `http`, `https` or `mailto`, so `urlfilter` replaces the whole value.',
			'Line 3, JavaScript string: `"\\u003cb\\u003e\\u0022Bob\\u0022\\u003c\\/b\\u003e"`. The quotes cannot close the string, and `</` cannot close the script. Output checked with Go 1.24.',
			'Line 4 is the hole: `<div><img src=x onerror=alert(1)></div>`, printed as is because `template.HTML` marks it as trusted. Fix: pass `Bio` as a plain `string`, or run it through an HTML sanitizer before you convert it.'
		],
		steps: [
			{
				title: 'Name each context',
				questions: [
					{ q: 'Where does `{{.Name}}` sit in `<p>Hello {{.Name}}</p>`?', options: ['A URL', 'HTML text between two tags', 'A JavaScript string', 'An attribute name'], answer: 1, why: 'That is `stateText`, the plain case: only the HTML escaper.' },
					{ q: 'Where does `{{.Site}}` sit in `href="{{.Site}}"`?', options: ['HTML text', 'A JavaScript string', 'The start of a URL inside a quoted attribute', 'A CSS value'], answer: 2, why: 'The parser sees a URL start, so it adds `urlfilter`, plus `attrescaper` for the quoted attribute.' },
					{ q: 'Where does `{{.Name}}` sit in `var user = "{{.Name}}";`?', options: ['Inside a double-quoted JavaScript string', 'HTML text', 'A URL', 'A comment'], answer: 0, why: 'That is `stateJSDqStr`, which gets the JS string escaper.' },
					{ q: 'Which value has a special type?', options: ['`Name`', '`Site`', 'None of them', '`Bio`, a `template.HTML`'], answer: 3, why: '`template.HTML` is an escape hatch: it tells the template the string is already safe HTML.' }
				]
			},
			{
				title: 'Predict lines 1 and 2',
				questions: [
					{ q: 'What does line 1 print for `<b>"Bob"</b>`?', options: ['`Hello <b>"Bob"</b>`', '`Hello &lt;b&gt;&#34;Bob&#34;&lt;/b&gt;`', '`Hello Bob`', '`Hello #ZgotmplZ`'], answer: 1, why: 'The HTML escaper encodes `<`, `>` and `"`, so the browser shows the tags as characters.' },
					{ q: 'Say `Site` were `https://bob.example/?a=1&b=2`. What would line 2 print?', options: ['`href="#ZgotmplZ"`', '`href="https%3a%2f%2fbob.example%2f%3fa%3d1%26b%3d2"`', '`href="https://bob.example/?a=1&amp;b=2"`', '`href="https://bob.example/"`'], answer: 2, why: 'An `https` URL passes `urlfilter`. The normalizer keeps its `?`, `=` and `&`, and only the attribute escaper turns `&` into `&amp;`.' },
					{ q: 'A visitor clicks the `site` link that line 2 renders. What happens?', options: ['`alert(1)` runs', 'The browser blocks the click with an error', 'The link opens `javascript:alert(1)` in a new tab', 'The page jumps to the `#ZgotmplZ` fragment, and no script runs'], answer: 3, why: 'The value was swapped for `#ZgotmplZ`, a harmless fragment of the same page. Seeing it in the HTML tells you a filter refused a value.' },
					{ q: 'Say line 2 were `<a href="/go?u={{.Site}}">`. What would it print for `javascript:alert(1)`?', options: ['`href="/go?u=javascript%3aalert%281%29"`', '`href="/go?u=#ZgotmplZ"`', '`href="/go?u=javascript:alert(1)"`', '`href="#ZgotmplZ"`'], answer: 0, why: 'The value now sits in the query, not at the start of the URL, so it gets `urlescaper` and no filter. The link starts with `/go`, so the scheme cannot be `javascript:`.' }
				]
			},
			{
				title: 'Predict line 3',
				questions: [
					{ q: 'What does the JS string escaper turn `"` into?', options: ['`&#34;`', '`\\"`', '`\\u0022`', '`%22`'], answer: 2, why: 'It uses JavaScript unicode escapes, which the value cannot use to close the string.' },
					{ q: 'And `<`?', options: ['`\\u003c`', '`&lt;`', '`%3C`', 'It leaves it as is'], answer: 0, why: 'Encoding `<` stops the value from writing `</script>` and closing the tag.' },
					{ q: 'Why would the HTML escaper be wrong here?', options: ['It is too slow for scripts', 'Go forbids it inside `<script>`', 'It encodes too few characters', 'The browser does not decode HTML entities inside a script, so the right escaping depends on the place'], answer: 3, why: 'Each place needs its own encoding. That is what contextual escaping means.' },
					{ q: 'What does line 3 print?', options: ['`"<b>\\"Bob\\"</b>"`', '`"\\u003cb\\u003e\\u0022Bob\\u0022\\u003c\\/b\\u003e"`', '`"&lt;b&gt;&#34;Bob&#34;&lt;/b&gt;"`', '`"#ZgotmplZ"`'], answer: 1, why: 'The quotes cannot close the string, and `</` cannot close the script. Output checked with Go 1.24.' }
				]
			},
			{
				title: 'Find and fix the hole',
				questions: [
					{ q: 'Which line is the hole?', options: ['Line 1', 'Line 2', 'Line 4, `<div>{{.Bio}}</div>`', 'Line 3'], answer: 2, why: '`template.HTML` marks `Bio` as trusted, so it is printed as is: `<div><img src=x onerror=alert(1)></div>`.' },
					{ q: 'Who controls the text in `Bio`?', options: ['A user, which makes this a stored XSS', 'The developer', 'Go’s template package', 'The browser'], answer: 0, why: 'It is built from a user’s text and shown to others, the same shape as the Grafana bug.' },
					{ q: 'What is the simplest fix?', options: ['Wrap `Bio` in a second `template.HTML`', 'Move `{{.Bio}}` into a `<script>`', 'Strip the word `alert`', 'Pass `Bio` as a plain `string`'], answer: 3, why: 'A plain string gets the HTML escaper like line 1, and the tags show as characters.' },
					{ q: 'The product needs some HTML in bios. What then?', options: ['Keep `template.HTML` and trust users', 'Run the text through an HTML sanitizer before converting it', 'Block bios that contain `<`', 'Escape it twice'], answer: 1, why: 'A sanitizer keeps allowed tags and drops the rest. Only its output should become `template.HTML`.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'A site escapes `<`, `>`, `&` and quotes in every value. A user sets their homepage to `javascript:alert(1)` and the page renders `<a href="...">`. What happens on click?',
			options: [
				'Nothing, because the HTML escaper already encoded the colon',
				'The script runs: none of those characters are in the value',
				'The browser blocks it, since `javascript:` is not allowed in `href`',
				'The link opens a blank page, because the quotes were escaped'
			],
			answer: 1,
			why: 'HTML escaping encodes `<`, `>`, `&` and quotes, and `javascript:alert(1)` contains none of them. A URL needs its own check on the scheme, which is what `urlfilter` does in `html/template` before it outputs `#ZgotmplZ`.'
		},
		{
			q: 'What makes an XSS "stored" and not "reflected"?',
			options: [
				'The script is saved on the server and served to everyone who opens the page',
				'The script is inside a `<script>` tag and not in an event handler',
				'The script reads cookies that were stored in the browser',
				'The script is cached by a CDN in front of the server'
			],
			answer: 0,
			why: 'OWASP: stored attacks are those where "the injected script is permanently stored on the target servers", like a comment field. In reflected XSS the script comes in the request itself and the victim must open a crafted link. The tag or handler used does not change the type.'
		},
		{
			q: 'In Svelte, which line can run a script from `comment`, a string a visitor typed?',
			options: [
				'`<p>{comment}</p>`',
				'`<p>{comment.trim()}</p>`',
				'`<p>{@html comment}</p>`',
				'`<p>{String(comment)}</p>`'
			],
			answer: 2,
			why: 'For a text expression, the Svelte docs say: "The expression will be stringified and escaped to prevent code injections." `{@html}` skips that step and inserts the string as raw HTML, so the browser builds a real element from an `<img onerror>` in `comment`.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Run the task’s template with Go’s `html/template`, check each predicted line, then remove the escape hatch and see line 4 change.',
		steps: [
			'Make a folder and the template: `mkdir -p ~/xss-lab && cd ~/xss-lab && printf \'%s\\n\' \'<p>Hello {{.Name}}</p>\' \'<a href="{{.Site}}">site</a>\' \'<script>var user = "{{.Name}}";</script>\' \'<div>{{.Bio}}</div>\' > page.html`.',
			'Write `main.go`, which passes three arguments as `Name`, `Site` and `Bio`, with `Bio` as `template.HTML`: `printf \'%s\\n\' \'package main\' \'import ("html/template"; "os")\' \'func main() {\' \'t := template.Must(template.ParseFiles("page.html"))\' \'t.Execute(os.Stdout, map[string]any{"Name": os.Args[1], "Site": os.Args[2], "Bio": template.HTML(os.Args[3])})\' \'}\' > main.go`.',
			'Run it with the task’s data: `go run main.go \'<b>"Bob"</b>\' \'javascript:alert(1)\' \'<img src=x onerror=alert(1)>\'`.',
			'Run it with a normal link: `go run main.go Bob \'https://example.com/?a=1&b=2\' hi`.',
			'Fix the hole: in `main.go`, replace `template.HTML(os.Args[3])` with `os.Args[3]`. Run step 3 again.'
		],
		done: [
			'Step 3 prints `Hello &lt;b&gt;&#34;Bob&#34;&lt;/b&gt;`, `href="#ZgotmplZ"` and `"\\u003cb\\u003e\\u0022Bob\\u0022\\u003c\\/b\\u003e"`.',
			'Step 3 prints `<div><img src=x onerror=alert(1)></div>` unchanged.',
			'Step 4 keeps the `https` link, with `&` written as `&amp;`.',
			'After the fix, line 4 prints `<div>&lt;img src=x onerror=alert(1)&gt;</div>`.'
		],
		solution: [
			'The same value `<b>"Bob"</b>` comes out three ways because the parser picks an escaper for each place: HTML text, URL, JavaScript string.',
			'`javascript:` fails `isSafeURL`, so `urlfilter` swaps the value for `#ZgotmplZ`. An `https` URL passes and only gets `&` encoded for the attribute.',
			'`template.HTML` skips every escaper. As a plain string, `Bio` gets the same HTML escaping as line 1. Clean up with `rm -rf ~/xss-lab`.'
		]
	},
	recall: {
		q: 'What does Go\'s `html/template` output for `<a href="{{.}}">` when the value is `javascript:alert(1)`, and why?',
		a: '`href="#ZgotmplZ"`. A value at the start of a URL goes through `urlfilter`, which accepts only relative URLs and the `http`, `https` and `mailto` schemes.'
	},
	sources: [
		{ title: 'Grafana advisory GHSA-vw7q-p2qg-4m5f (CVE-2022-31097), stored XSS in Unified Alerting', url: ADVISORY },
		{ title: 'Go source, html/template package documentation (doc.go)', url: `${GO}/doc.go` },
		{ title: 'Go source, html/template content.go: the HTML type', url: `${GO}/content.go#L27-L35` },
		{ title: 'OWASP Cross Site Scripting Prevention Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html' },
		{ title: 'OWASP, Cross Site Scripting (XSS): stored and reflected attacks', url: 'https://owasp.org/www-community/attacks/xss/' },
		{ title: 'Svelte docs, {@html ...}', url: 'https://svelte.dev/docs/svelte/@html' }
	]
};
