const MASTODON = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'gateways-and-tokens',
	part: 'Between services',
	title: 'Gateways, tokens and SSO',
	minutes: 10,
	hook: [
		'You have five services. Each one needs to know who is calling. Say each one builds its own login page and stores its own passwords. You get five login screens, five password leaks to worry about, and five ways to get it wrong.',
		'So you split the job. **One system proves who you are** (the SSO), and gives you a token. Every service checks the token. That is **authentication**: who is calling.',
		'Then a second question: **may this caller do this, on this data?** That is **authorization**, and yesterday told you where it belongs: with the owner of the data. A gateway can check the token at the door. It cannot know whether Alice may see that one private post.'
	],
	terms: [
		{ term: 'Authentication', def: 'Proving who the caller is. Answered by checking a password once, then a token on each request.' },
		{ term: 'Authorization', def: 'Deciding what this caller may do on this data. Needs the data\'s rules, so it lives with the owner.' },
		{ term: 'SSO / identity provider', def: 'One login for many apps. It issues tokens that other services trust. Keycloak is a well-known open source one.' },
		{ term: 'Token', def: 'A signed proof the caller sends on every request. A JWT carries its own claims, such as who issued it, for which audience, and until when.' },
		{ term: 'Gateway', def: 'A service that every request goes through, so cross-cutting checks (rate limits, token checks, CORS) are written once.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['user(["User"]) -->|"logs in once"| sso["Keycloak: SSO"]', 'sso -->|"OIDC token"| app["Client app"]', 'class sso ext'],
				highlight: ['user', 'sso', 'app'],
				note: 'The SSO is the **only place that sees the password**. It speaks OpenID Connect and hands the app a signed token, not the password.'
			},
			{
				add: ['app -->|"Bearer token"| gw["Gateway: Envoy jwt_authn"]', 'gw -.->|"public keys, cached"| sso'],
				highlight: ['gw'],
				note: 'The gateway **authenticates**. Envoy\'s JWT filter checks the signature against the provider\'s published keys (JWKS), the issuer, the audience and the expiry. Bad token: the request stops here.'
			},
			{
				add: ['gw -->|"verified identity"| svc["Posts service"]'],
				highlight: ['svc'],
				note: 'The service gets a request it knows is from Alice. Envoy\'s docs: the payload "can be forwarded to the upstream for **further authorization** if desired". The gateway does not finish the job.'
			},
			{
				add: ['svc --> pol["Policy: may Alice see this post?"]', 'pol --> db[("Posts, follows, blocks")]'],
				highlight: ['pol', 'db'],
				note: 'The data owner does **authorization**. Is the post public, private or direct? Does Alice follow the author? Has the author blocked her? Only the service holding posts and follows can answer.'
			}
		]
	},
	example: {
		title: 'app/policies/status_policy.rb: the owner decides who sees a post',
		repo: 'mastodon/mastodon',
		url: `${MASTODON}/app/policies/status_policy.rb#L4-L36`,
		lang: 'ruby',
		code: `  def show?
    return false if author.unavailable?

    if requires_mention?
      owned? || mention_exists?
    elsif private?
      owned? || following_author? || mention_exists?
    else
      current_account.nil? || (!author_blocking? && !author_blocking_domain?)
    end
  end
…
  def destroy?
    owned?
  end

  alias unreblog? destroy?

  def update?
    owned?
  end`,
		notes: [
			'**Authentication** comes first, in the [controller](' + MASTODON + '/app/controllers/api/v1/statuses_controller.rb#L7-L8): `doorkeeper_authorize! :write, :\'write:statuses\'` checks the OAuth token and its **scope**. A scope is coarse: it says this app may write posts, not which posts.',
			'**Authorization** is this policy. It reads the post\'s visibility, its mentions, follows and blocks. All of that is data Mastodon owns. No gateway in front could decide it.',
			'When `show?` says no, [`set_status`](' + MASTODON + '/app/controllers/api/v1/statuses_controller.rb#L99-L104) answers **not found**, the same as for a post that does not exist. A stranger cannot even learn that a private post is there.',
			'Token checks have their own traps. Envoy\'s docs on `audiences`: "If not specified, the audiences in JWT will not be checked." Leave it out, and a token your SSO minted for one service is accepted by another.'
		]
	},
	tradeoff: {
		gain: [
			'One login, one password store, one place to add MFA.',
			'Cross-cutting checks (CORS, rate limits, token signature and expiry) are written and tested once, in the gateway.',
			'Services behind it stay small: they trust a verified identity and focus on their own rules.'
		],
		cost: [
			'The SSO and the gateway sit on every request path. If they are down, everything is down.',
			'An extra hop, and a call to the identity provider unless its keys or answers are cached (tomorrow\'s topic).',
			'Tempting to push authorization into the gateway. Its rules then drift away from the data they protect.'
		]
	},
	task: {
		prompt: 'Sort these five checks into "gateway" or "data owner": (1) rate limit per IP, (2) CORS preflight, (3) is this token signed by our SSO and not expired, (4) may Alice edit this invoice, (5) is this token meant for the invoicing API (its audience). Then answer: the gateway cannot reach the identity provider to check a token. Should it answer 401 or 503?',
		hint: 'Ask of each check: does it need to read the data to decide? If yes, only the owner can answer it.',
		answer: [
			'Gateway: 1, 2, 3 and 5. None of them needs to know anything about the invoice.',
			'Data owner: 4. Only the invoicing service knows who created the invoice, whether it is already sent, and Alice\'s role in that company.',
			'503. The gateway does not know if the token is bad, so it must not say "unauthorized". 401 means "your credentials are not valid", and a client may react by logging the user out. 503 says "try again later".',
			'Bonus: the owner can repeat 3 and 5 cheaply. That protects it if someone reaches it without going through the gateway.'
		]
	},
	quiz: [
		{
			q: 'Where should "may Alice edit this shared invoice?" be decided?',
			options: [
				'In the service that owns the invoice and its sharing rules',
				'In the gateway, so the rule is written once and applies to every service behind it',
				'In the SSO, because it knows who Alice is',
				'In the browser app, before the request is sent'
			],
			answer: 0,
			why: 'Authentication says who Alice is, and the gateway or SSO can do that. Authorization needs the data\'s rules, so it belongs to the data owner. A copy of those rules in a gateway drifts.'
		},
		{
			q: 'A Mastodon app holds a token with the `read:statuses` scope. It asks for a private post by someone the user does not follow. What happens?',
			options: [
				'The post is returned, because the scope allows reading statuses',
				'401, because the token is not valid for private posts',
				'Not found: the scope passes, but the post policy says no',
				'403, with a message saying the post is private'
			],
			answer: 2,
			why: 'The scope is authentication plus a coarse permission. `StatusPolicy#show?` then checks visibility and follows. Mastodon answers not found, so the post\'s existence is not revealed.'
		},
		{
			q: 'Envoy\'s JWT filter is configured without `audiences`. What does it accept?',
			options: [
				'No token at all, until audiences are set',
				'Only tokens without an `aud` claim',
				'Only tokens whose audience is the gateway\'s own name',
				'Any token with a valid signature and issuer, whatever service it was meant for'
			],
			answer: 3,
			why: 'The docs say: "If not specified, the audiences in JWT will not be checked." A token issued for another service from the same SSO then passes. Set the audience.'
		}
	],
	takeaway: 'Authenticate at the door, once. Authorize where the data lives.',
	sources: [
		{ title: 'Chris Richardson, API gateway pattern', url: 'https://microservices.io/patterns/apigateway.html' },
		{ title: 'OpenID Connect Core 1.0', url: 'https://openid.net/specs/openid-connect-core-1_0.html' },
		{ title: 'RFC 7519, JSON Web Token (JWT)', url: 'https://datatracker.ietf.org/doc/html/rfc7519' },
		{ title: 'Envoy docs, JWT Authentication filter', url: 'https://www.envoyproxy.io/docs/envoy/latest/configuration/http/http_filters/jwt_authn_filter' },
		{ title: 'Kubernetes docs, Controlling access to the Kubernetes API (authentication, then authorization)', url: 'https://kubernetes.io/docs/concepts/security/controlling-access/' }
	]
};
