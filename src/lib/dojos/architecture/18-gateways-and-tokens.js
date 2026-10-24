const MASTODON = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'gateways-and-tokens',
	part: 'Between services',
	title: 'Gateways, tokens and SSO',
	minutes: 10,
	hook: [
		'You have five services, and each one needs to know who is calling. Say each one builds its own login page and stores its own passwords. You get five login screens, five password stores that can leak, and five implementations to get wrong.',
		'Instead, one system, the SSO, checks the password and gives the caller a token. Every service then checks that token to learn who is calling, and this check is called **authentication**.',
		'Deciding whether this caller may do this action on this data is called authorization. Yesterday\'s chapter put it with the owner of the data. A gateway, the service every request goes through, can check the token. It cannot know whether Alice may see one particular private post.'
	],
	terms: [
		{ term: 'Authentication', def: 'Checking who the caller is: a password once, then a token on each request.' },
		{ term: 'Authorization', def: 'Deciding what this caller may do on this data. It needs the data\'s rules, so the owner of the data does it.' },
		{ term: 'SSO / identity provider', def: 'One login for many apps. It issues tokens that other services trust. Keycloak is a widely used open source identity provider.' },
		{ term: 'Token', def: 'A signed proof the caller sends on every request. A JWT carries its own claims, such as who issued it, for which audience, and until when.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['user(["User"]) -->|"logs in once"| sso["Keycloak: SSO"]', 'sso -->|"OIDC token"| app["Client app"]', 'class sso ext'],
				highlight: ['user', 'sso', 'app'],
				note: 'The SSO is the **only place that sees the password**. It speaks OpenID Connect and hands the app a signed token instead of the password.'
			},
			{
				add: ['app -->|"Bearer token"| gw["Gateway: Envoy jwt_authn"]', 'gw -.->|"public keys, cached"| sso'],
				highlight: ['gw'],
				note: 'The gateway does the authentication. Envoy\'s JWT filter checks the signature against the provider\'s published keys (JWKS), then the issuer, the audience and the expiry. If any check fails, the request stops at the gateway.'
			},
			{
				add: ['gw -->|"verified identity"| svc["Posts service"]'],
				highlight: ['svc'],
				note: 'The service gets a request it knows is from Alice. Envoy\'s docs say the payload "can be forwarded to the upstream for **further authorization** if desired". The service still has to decide what Alice may do.'
			},
			{
				add: ['svc --> pol["Policy: may Alice see this post?"]', 'pol --> db[("Posts, follows, blocks")]'],
				highlight: ['pol', 'db'],
				note: 'The data owner does the authorization. Is the post public, private or direct? Does Alice follow the author? Has the author blocked her? **Only the service holding posts and follows can answer.**'
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
			'Authentication runs before this file, in the [controller](' + MASTODON + '/app/controllers/api/v1/statuses_controller.rb#L7-L8): `doorkeeper_authorize! :write, :\'write:statuses\'` checks the OAuth token and its **scope**. The scope says this app may write posts, but not which posts.',
			'Lines 1 to 11 are the authorization. `show?` reads the post\'s visibility, its mentions, follows and blocks, all data that Mastodon stores. A gateway in front has none of this data.',
			'When `show?` returns false, [`set_status`](' + MASTODON + '/app/controllers/api/v1/statuses_controller.rb#L99-L104) answers **not found**, the same as for a post that does not exist. A stranger cannot even learn that the private post exists.',
			'Token checks need care too. Envoy\'s docs on `audiences`: "If not specified, the audiences in JWT will not be checked." Leave it out, and a token your SSO minted for one service is accepted by another.'
		]
	},
	tradeoff: {
		gain: [
			'Users have one login and one password store, and you add MFA in one place.',
			'Cross-cutting checks (CORS, rate limits, token signature and expiry) are written and tested once, in the gateway.',
			'The services behind it trust a verified identity, and their code only checks their own rules, like `StatusPolicy`.'
		],
		cost: [
			'The SSO and the gateway sit on every request path, so when they are down, every service is unreachable.',
			'Each request takes an extra hop, and a call to the identity provider unless its keys or answers are cached (tomorrow\'s chapter).',
			'If you copy authorization rules into the gateway, they drift away from the data they protect.'
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
		],
		steps: [
			{
				title: 'Pick the test',
				questions: [
					{ q: 'Which question sorts each check into gateway or data owner?', options: ['Is the check fast to run?', 'Does it run before the user logs in?', 'Does it need to read the data to decide?', 'Is it written in the same language as the service?'], answer: 2, why: 'If the check needs the data, only the service holding that data can answer it.' },
					{ q: 'What is authentication?', options: ['Deciding what Alice may do on this invoice', 'Checking who the caller is', 'Limiting the requests per IP', 'Hiding a private post from strangers'], answer: 1, why: 'A password once, then a token on each request. It says who, not what they may do.' },
					{ q: 'What is authorization?', options: ['Checking a token\'s signature', 'Logging in once for many apps', 'Answering a CORS preflight', 'Deciding what this caller may do on this data'], answer: 3, why: 'It needs the data\'s rules, so the owner of the data does it.' },
					{ q: 'Why can a gateway not decide "may Alice see this post"?', options: ['It has none of the data the rule needs', 'It cannot read tokens', 'It runs after the service', 'It is not allowed to return 404'], answer: 0, why: 'Visibility, follows and blocks live in the posts service. A gateway in front has none of this.' }
				]
			},
			{
				title: 'Sort the gateway checks',
				questions: [
					{ q: '(1) A rate limit per IP. Where does it go?', options: ['Gateway: it needs no invoice data', 'Data owner: it knows the invoices', 'The SSO, at login time', 'The browser app, before sending'], answer: 0, why: 'A cross-cutting check, written and tested once, in the gateway.' },
					{ q: '(2) A CORS preflight. Where does it go?', options: ['The data owner, since it serves the invoice', 'The gateway, once for every service', 'The SSO, with the token', 'Each service, in its own way'], answer: 1, why: 'It is about the request, not the invoice. One place handles it for all services.' },
					{ q: '(3) Is this token signed by our SSO and not expired?', options: ['Only the data owner can check that', 'The SSO checks it on every request', 'The gateway, against the SSO\'s published keys', 'The browser app, before it sends'], answer: 2, why: 'Envoy\'s JWT filter checks the signature against the JWKS, then the issuer and the expiry.' },
					{ q: '(5) Is this token meant for the invoicing API?', options: ['Data owner: it needs the invoice to tell', 'Nobody: Envoy checks audiences by default', 'The SSO, when the user logs in', 'Gateway: set `audiences`, since Envoy skips the check without it'], answer: 3, why: '"If not specified, the audiences in JWT will not be checked." A token for another service would pass.' }
				]
			},
			{
				title: 'Give the rest to the owner',
				questions: [
					{ q: '(4) Alice asks for an invoice from another company, and the invoicing service says no. What should it answer, the way Mastodon does for a private post?', options: ['401, so she logs in again', '503, try again later', 'Not found, the same as for an invoice that does not exist', 'The invoice, read-only'], answer: 2, why: 'Mastodon\'s `set_status` answers not found when `show?` is false, so a stranger cannot even learn the record exists.' },
					{ q: 'What does the invoicing service know that the gateway does not?', options: ['Alice\'s IP address', 'Who created the invoice, whether it is sent, and Alice\'s role', 'The token\'s signature', 'The CORS rules'], answer: 1, why: 'Those are facts about the invoice and the company. They live with the owner.' },
					{ q: 'You also copy the edit rule into the gateway. What happens over time?', options: ['It drifts away from the data it protects', 'It makes the service faster', 'The SSO takes it over', 'Nothing, as long as both run'], answer: 0, why: 'When the owner changes its rule, the copy in the gateway falls out of date.' },
					{ q: 'In Mastodon, which owner rule lets Alice edit only her own posts?', options: ['`show?`, which reads the visibility', '`doorkeeper_authorize! :write`', 'Envoy\'s `audiences` setting', '`update?`, which returns `owned?`'], answer: 3, why: 'Edit rights depend on who wrote the post, a fact only the posts service holds. Your invoice edit rule belongs in the same kind of place.' }
				]
			},
			{
				title: 'Answer the outage',
				questions: [
					{ q: 'The gateway cannot reach the identity provider. What does it know about the token?', options: ['That it is bad', 'That it is good', 'Nothing: it cannot tell whether the token is valid', 'That it has expired'], answer: 2, why: 'No answer from the provider is not a "no". The token may be fine.' },
					{ q: 'Which status does the gateway return?', options: ['401', '403', '404', '503'], answer: 3, why: '503 says "try again later", which is the truth here.' },
					{ q: 'Why not 401?', options: ['401 says the credentials are not valid, and a client may log the user out', '401 is only for wrong passwords', '401 cannot carry a body', 'Browsers cache 401 forever'], answer: 0, why: 'The gateway does not know the token is bad, so it must not say "unauthorized".' },
					{ q: 'Why should the owner repeat checks 3 and 5 as well?', options: ['Because the gateway never checks them', 'To protect it if someone reaches it without the gateway', 'To make each request slower on purpose', 'Because the SSO requires two checks'], answer: 1, why: 'They are cheap to repeat, and they cover a path that skips the gateway.' }
				]
			}
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
			why: 'The gateway or the SSO can say who Alice is. The edit rule needs the invoice\'s data, so the invoicing service decides it. A copy of that rule in a gateway falls out of date when the service changes it.'
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
			why: 'The token and its scope pass the controller check. `StatusPolicy#show?` then checks visibility and follows and returns false. Mastodon answers not found, so the post\'s existence is not revealed.'
		},
		{
			q: 'Envoy\'s JWT filter is configured without `audiences`. What does it accept?',
			options: [
				'No token at all, the filter rejects every request until audiences are set',
				'Only tokens without an `aud` claim, since there is nothing to compare it to',
				'Only tokens whose audience is the gateway\'s own name, which Envoy fills in',
				'Any token with a valid signature and issuer, whatever service it was meant for'
			],
			answer: 3,
			why: 'The docs say: "If not specified, the audiences in JWT will not be checked." A token issued for another service by the same SSO then passes, so set `audiences`.'
		}
	],
	recall: {
		q: 'In Mastodon, which code checks the token, and which code decides whether Alice may see a private post?',
		a: 'The controller\'s `doorkeeper_authorize!` checks the OAuth token and its scope. `StatusPolicy#show?` decides, from the post\'s visibility, mentions, follows and blocks.'
	},
	sources: [
		{ title: 'Chris Richardson, API gateway pattern', url: 'https://microservices.io/patterns/apigateway.html' },
		{ title: 'OpenID Connect Core 1.0', url: 'https://openid.net/specs/openid-connect-core-1_0.html' },
		{ title: 'RFC 7519, JSON Web Token (JWT)', url: 'https://datatracker.ietf.org/doc/html/rfc7519' },
		{ title: 'Envoy docs, JWT Authentication filter', url: 'https://www.envoyproxy.io/docs/envoy/latest/configuration/http/http_filters/jwt_authn_filter' },
		{ title: 'Kubernetes docs, Controlling access to the Kubernetes API (authentication, then authorization)', url: 'https://kubernetes.io/docs/concepts/security/controlling-access/' }
	]
};
