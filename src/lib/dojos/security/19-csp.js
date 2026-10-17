const MASTODON = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';
const ADVISORY = 'https://github.com/mastodon/mastodon/security/advisories/GHSA-2693-xr3m-jhqr';
const MDN = 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'csp',
	part: 'Input and output',
	title: 'Content Security Policy',
	minutes: 10,
	hook: [
		'On 19 September 2023, Mastodon published GHSA-2693-xr3m-jhqr (CVE-2023-42452, CVSS 8.3). An attacker could use the translation feature "to bypass the server-side HTML sanitization, allowing unescaped HTML to execute in the browser". The fix shipped in 4.0.10, 4.1.8 and 4.2.0-rc2.',
		'The sanitizer had failed, and the attacker\'s HTML reached the page. The advisory still rated the damage lower: "The impact is limited thanks to Mastodon\'s strict Content Security Policy, blocking inline scripts".'
	],
	terms: [
		{ term: 'Content Security Policy', def: 'A response header, `Content-Security-Policy`, that lists where the page may load scripts, styles, images and other resources from. The browser refuses what the policy does not allow.' },
		{ term: 'Nonce', def: 'A random value the server puts both in the header (`script-src \'nonce-R4nd0m\'`) and on each of its own `<script nonce="R4nd0m">` tags. It must be new for every response.' },
		{ term: 'strict-dynamic', def: 'A `script-src` keyword: a script allowed by a nonce or a hash may load more scripts, and those are allowed too.' },
		{ term: 'Report-only mode', def: 'The same policy sent as `Content-Security-Policy-Report-Only`. The browser enforces nothing and only reports what it would have blocked.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['bug["A sanitizer bug puts an img tag with an onerror handler in the page"] --> none["No CSP: the browser runs the handler"]'],
				highlight: ['bug', 'none'],
				note: 'Start from the XSS of day 18: escaping or sanitizing failed, and the attacker\'s markup is in the HTML. Without a policy, the browser has no reason to refuse the inline handler.'
			},
			{
				add: ['bug --> csp["Header: script-src self + assets host, no unsafe-inline"]', 'csp --> blocked["Browser refuses the inline handler and logs a violation"]'],
				highlight: ['csp', 'blocked'],
				note: 'MDN: if a policy has `default-src` or `script-src`, inline JavaScript does not run "unless extra measures are taken to enable it". The rule applies to `<script>` blocks, `onerror=` attributes and `javascript:` URLs. The XSS is still in the page, but its script does not run.'
			},
			{
				add: ['csp --> own["The site\'s own scripts load from files on allowed hosts"]'],
				highlight: ['own'],
				note: 'The site\'s own code must then live in `.js` files served from an allowed origin, such as `\'self\'` or the assets host. The keyword `\'unsafe-inline\'` would allow inline scripts again, and MDN warns that it "defeats much of the purpose of having a CSP".'
			},
			{
				add: ['nonce["Strict CSP: script-src nonce-R4nd0m, new value per response"] --> tag["Only script tags carrying nonce=R4nd0m run"]', 'tag -->|"strict-dynamic"| child["Scripts that a nonced script adds also run"]'],
				highlight: ['nonce', 'tag', 'child'],
				note: 'MDN recommends nonce- or hash-based policies, called strict CSP, over host lists. The attacker cannot guess this response\'s nonce, so an injected tag lacks it. `\'strict-dynamic\'` passes the trust on to scripts that a trusted script creates.'
			},
			{
				add: ['ro["Content-Security-Policy-Report-Only"] -->|"same policy, not enforced"| reports["Violation reports to the report-to endpoint"]'],
				highlight: ['ro', 'reports'],
				note: 'To try a policy without breaking the site, send it as `Content-Security-Policy-Report-Only`. MDN: "The policy is not enforced, but any violations are sent to the reporting endpoint specified in the policy." Once the app\'s own scripts no longer show up in the reports, send the same policy as `Content-Security-Policy`.'
			}
		]
	},
	example: {
		title: 'config/initializers/content_security_policy.rb: Mastodon\'s policy',
		repo: 'mastodon/mastodon',
		url: `${MASTODON}/config/initializers/content_security_policy.rb#L15-L58`,
		lang: 'ruby',
		code: `Rails.application.config.content_security_policy do |p|
  p.base_uri        :none
  p.default_src     :none
  p.frame_ancestors :none
  p.font_src        :self, assets_host
  p.img_src         :self, :data, :blob, *media_hosts
  p.media_src       :self, :data, *media_hosts
  p.manifest_src    :self, assets_host

  if policy.sso_host.present?
    p.form_action :self, policy.sso_host
  else
    p.form_action :self
  end

  p.child_src  :self, :blob, assets_host
  p.worker_src :self, :blob, assets_host

  p.connect_src :self, :data, :blob, *media_hosts, Rails.configuration.x.streaming_api_base_url
  p.script_src  :self, assets_host, "'wasm-unsafe-eval'"
  p.frame_src   :self, :https
  p.style_src   :self, assets_host
…
# Report CSP violations to a specified URI
# For further information see the following documentation:
# https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy-Report-Only
# Rails.application.config.content_security_policy_report_only = true

Rails.application.config.content_security_policy_nonce_generator = ->(_request) { SecureRandom.base64(16) }

Rails.application.config.content_security_policy_nonce_directives = %w(style-src)`,
		notes: [
			'Line 3, `default_src :none`, blocks every resource type that has no directive of its own. Each type the app needs is then opened on its own line.',
			'Line 20 is the line the advisory relied on. `script_src` allows `\'self\'`, the assets host and `\'wasm-unsafe-eval\'`, with no `\'unsafe-inline\'`. A `<script>` block or an `onerror=` attribute injected through the translation bug does not run.',
			'Line 2, `base_uri :none`, restricts the URLs allowed in a `<base>` element. Line 3 does not cover it: MDN\'s page for `base-uri` says it has no `default-src` fallback, and "Not setting this allows any URL."',
			'Line 29 builds a nonce with `SecureRandom.base64(16)`, and line 31 uses it for `style-src` only. The Rails guide: it "will generate a new random nonce for each request". On 17 October 2026, `curl -sI https://mastodon.social/about` showed a `\'nonce-…\'` in `style-src` and none in `script-src`.',
			'Line 27 keeps report-only mode as a commented-out switch. Setting `content_security_policy_report_only = true` sends the same policy as `Content-Security-Policy-Report-Only`.'
		]
	},
	tradeoff: {
		gain: [
			'An XSS that gets past escaping or sanitizing still has to get past the browser. Mastodon\'s advisory credits the policy for limiting CVE-2023-42452.',
			'The policy is one header, set in one Rails initializer, and it covers every page the app serves.'
		],
		cost: [
			'Every inline `<script>` and `onclick=` in the app must move to a file or carry a nonce before the policy can be enforced.',
			'A nonce must change per response, so the HTML cannot be a static cached file. The Rails guide notes that `SecureRandom.base64(16)` "is incompatible with conditional GET caching".',
			'A host allow-list trusts every script on that host. MDN cites a case where integrating Google Analytics asked for 187 Google domains in the list.',
			'`\'strict-dynamic\'` trusts whatever a trusted script loads. MDN: if those scripts create `<script>` elements "based on potential sources of XSS, then the CSP will not protect them".'
		]
	},
	task: {
		prompt: 'An app sends `Content-Security-Policy: default-src \'self\'; script-src \'self\' \'unsafe-inline\' https://cdn.example.com; object-src \'none\'`. A bug lets a user store `<img src=x onerror=alert(1)>` in their bio. Does the policy stop it? Then write a stricter `script-src` and say how you would deploy it.',
		hint: 'Look for the keyword that allows inline JavaScript. Then think about what the server must add to each of its own script tags.',
		answer: [
			'It does not stop it. `\'unsafe-inline\'` allows inline event handlers, so the `onerror` handler runs. The other directives do not matter for this attack.',
			'Stricter: `script-src \'nonce-{RANDOM}\' \'strict-dynamic\'; object-src \'none\'; base-uri \'none\'`, with a new `{RANDOM}` per response and the same value in `nonce="..."` on each of the app\'s own `<script>` tags. Without `strict-dynamic`, it matches the nonce-based strict CSP shown on MDN.',
			'Send the header on every response, not only on HTML pages. MDN: the policy "should be set on all responses to all requests, not just the main document".',
			'Deploy it first as `Content-Security-Policy-Report-Only` with a `report-to` endpoint, fix the app\'s own inline scripts that show up in the reports, then send it as `Content-Security-Policy`.'
		]
	},
	quiz: [
		{
			q: 'A page sends `script-src \'nonce-k3J9\' \'unsafe-inline\'`. An attacker injects `<script>steal()</script>` without a nonce. What does a current browser do?',
			options: [
				'It runs the script, because `\'unsafe-inline\'` allows inline code',
				'It blocks it: with a nonce present, `\'unsafe-inline\'` is ignored',
				'It runs the script only if it was in the HTML at page load',
				'It blocks the whole page and shows a CSP error instead'
			],
			answer: 1,
			why: 'MDN: "If a directive contains nonce or hash expressions, then the unsafe-inline keyword is ignored by browsers." Only `<script>` tags with `nonce="k3J9"` run, and the injected tag has none.'
		},
		{
			q: 'A team writes `script-src \'nonce-12345\'` in its nginx config and adds `nonce="12345"` to every script tag in its templates. What is wrong?',
			options: [
				'Nothing, as long as the value is long enough to guess',
				'Nonces only work on `<style>` tags, not on `<script>` tags',
				'nginx cannot send CSP headers, only the app server can',
				'The nonce never changes, so an attacker can read and reuse it'
			],
			answer: 3,
			why: 'MDN: "the nonce must be different for every HTTP response, and must not be predictable." A fixed value is visible in any page source, and an injected tag can carry it. Nonces work on both `<script>` and `<style>`.'
		},
		{
			q: 'What happens when a response carries a `Content-Security-Policy-Report-Only` header?',
			options: [
				'The browser enforces nothing and reports what the policy would block',
				'The browser blocks scripts but lets styles and images load',
				'The browser enforces the policy and also sends a report for each block',
				'The browser ignores it unless the page also has a `<meta>` CSP tag'
			],
			answer: 0,
			why: 'MDN: "The policy is not enforced, but any violations are sent to the reporting endpoint specified in the policy." If an enforcing header is present too, both are honored. A report-only policy cannot be delivered in a `<meta>` element.'
		}
	],
	recall: {
		q: 'In Mastodon\'s CVE-2023-42452, which `script_src` setting kept the injected HTML from running scripts?',
		a: '`p.script_src :self, assets_host, "\'wasm-unsafe-eval\'"`: no `\'unsafe-inline\'`, so the browser refuses inline `<script>` blocks and event handlers.'
	},
	sources: [
		{ title: 'Mastodon advisory GHSA-2693-xr3m-jhqr (CVE-2023-42452), stored XSS through the translation feature', url: ADVISORY },
		{ title: 'MDN, Content Security Policy (CSP) guide', url: MDN },
		{ title: 'MDN, Content-Security-Policy-Report-Only header', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy-Report-Only' },
		{ title: 'Rails guide, Securing Rails Applications: Content Security Policy header', url: 'https://guides.rubyonrails.org/security.html#content-security-policy-header' },
		{ title: 'Mastodon source, config/initializers/content_security_policy.rb', url: `${MASTODON}/config/initializers/content_security_policy.rb` }
	]
};
