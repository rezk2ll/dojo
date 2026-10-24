const SALEOR = 'https://github.com/saleor/saleor/blob/0c0e2697cc72aa999f7786ae8aeda7665bd4285f';
const ADV = 'https://github.com/saleor/saleor/security/advisories';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'capstone',
	part: 'Running safely',
	title: 'Capstone: securing a small shop',
	minutes: 10,
	hook: [
		'Saleor is an open-source commerce API with more than 23,000 stars on GitHub. On 21 January 2026 it published GHSA-666h-2p49-pg95: staff could upload HTML and SVG files with JavaScript, served from the dashboard’s domain, and steal other staff members’ tokens. Two days later came GHSA-r6fj-f4r9-36gr: an IDOR that let anyone without an account extract emails, addresses and phone numbers from old orders.',
		'In April 2024, GHSA-ff69-fwjf-3c9w reported a CSRF bypass in the `refreshToken` mutation, scored 4.2. Each of these advisories matches a day of this dojo: file uploads (day 24), XSS (day 18), authorization (day 16), CSRF (day 11).',
		'No new attack today. You secure a small shop from the threat model to the deployment, and every choice points back to the day it comes from.'
	],
	terms: [
		{ term: 'Threat model', def: 'A written list of what can go wrong with a feature, who would do it, and which control stops it (day 1).' },
		{ term: 'Trust boundary', def: 'A line where data passes from a party you do not control to one you do, like the browser to the API. Every check sits on that line (day 2).' },
		{ term: 'Secure default', def: 'A setting whose value without any configuration is the safe one. Saleor’s `HTTP_IP_FILTER_ENABLED` is `True` unless you turn it off (day 7).' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['browser["Browser: storefront and staff dashboard"] -->|"HTTPS, HttpOnly + Secure + SameSite cookie"| api["Shop API"]'],
				highlight: ['browser', 'api'],
				note: 'The first trust boundary is between the browser and the API. TLS protects the traffic (day 27). The session cookie is `HttpOnly`, `Secure` and `SameSite` (day 10), CSRF tokens protect state changes (day 11), and CORS allows only the shop’s own origins.'
			},
			{
				add: ['api --> login["Login: Argon2 hash, rate limit per account and IP, TOTP for staff"]'],
				highlight: ['login'],
				note: 'Passwords are stored with a slow salted hash (day 9). Login attempts are limited per account and per IP (day 15), and staff accounts need a second factor (day 14). Saleor locks the password reset request per user for 15 minutes by default.'
			},
			{
				add: ['api -->|"parameterized queries, owner check on every order id"| db[("Database")]'],
				highlight: ['db'],
				note: 'Queries take parameters, never string concatenation (day 17). Every query for an order checks that the order belongs to the caller or that the caller is staff (day 16). Saleor’s 2026 IDOR advisory is the case where that check failed.'
			},
			{
				add: ['api --> media[("Uploads on media.shop.example, Content-Disposition: attachment")]', 'api -->|"webhook URL, private IPs refused"| hook["Partner webhooks"]'],
				highlight: ['media', 'hook'],
				note: 'Uploads are checked by content and served from another domain with `Content-Disposition: attachment` (day 24), the two conditions in GHSA-666h. Outgoing webhook calls refuse private and loopback addresses, so a webhook URL cannot reach `169.254.169.254` (day 20).'
			},
			{
				add: ['deploy["Deployment: secrets from a secret manager, non-root read-only container, NetworkPolicy"] -.-> api', 'api -.-> logs[("Audit log and Falco alerts")]'],
				highlight: ['deploy', 'logs'],
				note: 'The `SECRET_KEY` and database password come from a secret manager, never from git (days 25, 26). The container runs as non-root with a read-only root filesystem (day 33), and a NetworkPolicy lets only the API reach the database (day 35). Logins and admin actions go to an audit log (day 36), and Falco watches the nodes (day 37).'
			}
		]
	},
	example: {
		title: 'saleor/settings.py: the security settings of an open-source shop',
		repo: 'saleor/saleor',
		url: `${SALEOR}/saleor/settings.py#L86-L1130`,
		lang: 'python',
		code: `DEBUG = get_bool_from_env("DEBUG", True)
…
ALLOWED_CLIENT_HOSTS = os.environ.get("ALLOWED_CLIENT_HOSTS")
if not ALLOWED_CLIENT_HOSTS:
    if DEBUG:
        ALLOWED_CLIENT_HOSTS = _DEFAULT_CLIENT_HOSTS
    else:
        raise ImproperlyConfigured(
            "ALLOWED_CLIENT_HOSTS environment variable must be set when DEBUG=False."
        )
…
if ENABLE_SSL:
    SECURE_SSL_REDIRECT = not DEBUG
…
# Make this unique, and don't share it with anybody.
SECRET_KEY = os.environ.get("SECRET_KEY")
…
if not SECRET_KEY and DEBUG:
    warnings.warn(
        "SECRET_KEY not configured, using a random temporary key.", stacklevel=1
    )
    SECRET_KEY = get_random_secret_key()
…
ALLOWED_HOSTS = get_list(os.environ.get("ALLOWED_HOSTS", "localhost,127.0.0.1"))
ALLOWED_GRAPHQL_ORIGINS: list[str] = get_list(
    os.environ.get("ALLOWED_GRAPHQL_ORIGINS", "*")
)
…
# When \`True\`, HTTP requests made from arbitrary URLs will be rejected (e.g., webhooks).
# if they try to access private IP address ranges, and loopback ranges (unless
# \`HTTP_IP_FILTER_ALLOW_LOOPBACK_IPS=False\`).
HTTP_IP_FILTER_ENABLED: bool = get_bool_from_env("HTTP_IP_FILTER_ENABLED", True)

# When \`False\` it rejects loopback IPs during external calls.
# Refer to \`HTTP_IP_FILTER_ENABLED\` for more details.
HTTP_IP_FILTER_ALLOW_LOOPBACK_IPS: bool = get_bool_from_env(
    "HTTP_IP_FILTER_ALLOW_LOOPBACK_IPS", False
)
…
JWT_TTL_ACCESS = datetime.timedelta(
    seconds=parse(os.environ.get("JWT_TTL_ACCESS", "5 minutes"))
)
JWT_TTL_APP_ACCESS = datetime.timedelta(
    seconds=parse(os.environ.get("JWT_TTL_APP_ACCESS", "5 minutes"))
)
JWT_TTL_REFRESH = datetime.timedelta(
    seconds=parse(os.environ.get("JWT_TTL_REFRESH", "30 days"))
)
…
# Lock time for request password reset mutation per user (seconds)
RESET_PASSWORD_LOCK_TIME = parse(
    os.environ.get("RESET_PASSWORD_LOCK_TIME", "15 minutes")
)`,
		notes: [
			'`DEBUG` defaults to `True`, so every deployment must set `DEBUG=False`. With `DEBUG` off, Saleor refuses to start until `ALLOWED_CLIENT_HOSTS` is set, and it only invents a random `SECRET_KEY` when `DEBUG` is on (day 7).',
			'`ALLOWED_GRAPHQL_ORIGINS` defaults to `*`. In [`cors_handler.py`](' + SALEOR + '/saleor/asgi/cors_handler.py#L31-L53), `fnmatchcase` matches every origin against `*` and echoes it back with `access-control-allow-credentials: true`. The 2024 CSRF advisory says browsers block the attack through CORS "unless configured to allow all hosts".',
			'`HTTP_IP_FILTER_ENABLED` is on by default: webhook calls to private and loopback ranges are rejected. You get the SSRF defence from day 20 without writing any configuration.',
			'Access tokens live 5 minutes and refresh tokens 30 days. A stolen access token expires 5 minutes after it was issued, which matters because a JWT cannot be revoked by itself (day 13). The refresh token is the one to protect, and the one the 2024 CSRF advisory targeted.'
		]
	},
	tradeoff: {
		gain: [
			'Each control maps to one advisory or one day, so a reviewer can check the list item by item against the code.',
			'Secure defaults like `HTTP_IP_FILTER_ENABLED=True` and the 5 minute access token protect a shop whose owner never read the settings.',
			'Serving uploads from a separate domain stops the GHSA-666h XSS even if a malicious file gets past the upload checks.'
		],
		cost: [
			'`DEBUG=True` and `ALLOWED_GRAPHQL_ORIGINS="*"` make the first local run easy and are unsafe in production. Every deployment has to change them.',
			'A second domain for media means another DNS name, another TLS certificate and another CDN or proxy config to keep right.',
			'Rate limits, a TOTP step for staff and a 15 minute reset lock all slow down honest users who mistype or forget.'
		]
	},
	task: {
		prompt: 'The kata. A friend sells mugs online. The shop has customer accounts, a staff dashboard, product photos uploaded by staff, card payments through a provider that calls your webhook, and a "notify me" feature that fetches a URL the customer gives. It runs as one container on Kubernetes with PostgreSQL. Write the threat model and the controls, one line per control, each with the day it comes from.',
		hint: 'Follow the request: browser to API, login, database, uploads and outgoing calls, then deployment and what happens after a breach.',
		answer: [
			'Threat model (day 1): STRIDE on login, password reset, checkout, uploads and the "notify me" fetch. Trust boundaries at the browser, the payment webhook and the outgoing fetch (day 2).',
			'Browser to API: HTTPS only (day 27). Session cookie `HttpOnly; Secure; SameSite=Lax`, rotated at login (day 10). CSRF token on every form (day 11). CSP with a nonce on the dashboard (day 19). CORS limited to the storefront and dashboard origins, never `*`.',
			'Accounts: Argon2id password hashes (day 9). Login limited per IP and per account, with a lockout that does not let an attacker lock out real users (day 15). TOTP required for staff (day 14). Reset tokens single use, short lived, from `secrets` (day 39).',
			'Data: parameterized queries only (day 17). Every order, address and invoice lookup checks the owner or a staff role (day 16). Output escaped per context, and rich text sanitized (day 18).',
			'Inputs from outside: uploads checked by content, size capped, re-encoded, stored outside the web root and served from `media.` with `Content-Disposition: attachment` (day 24). The webhook checks the provider’s signature with a constant-time compare. The "notify me" fetch refuses private, loopback and link-local addresses after DNS resolution (day 20).',
			'Supply chain and secrets: lockfile and `npm ci` or `pip --require-hashes` (day 30), dependency scanning (day 29), signed images (day 31). Secrets in a secret manager, never in git or the image (days 25, 26).',
			'Deployment: non-root, read-only root filesystem, all capabilities dropped (day 33), namespace labelled `restricted` (day 34), default-deny NetworkPolicy with the API allowed to PostgreSQL only (day 35).',
			'After a breach: audit log of logins, failed logins and staff actions, without tokens or passwords (day 36). Falco on the nodes (day 37). A written runbook: who cuts access, which secrets to rotate in which order, who tells customers (day 38).'
		],
		steps: [
			{
				title: 'Draw the threat model',
				questions: [
					{ q: 'How do you build the threat model?', options: ['STRIDE on login, reset, checkout, uploads and the "notify me" fetch', 'A pentest once the shop is live', 'A list of the CVEs in the dependencies', 'The order of the days in this dojo'], answer: 0, why: 'A threat model lists what can go wrong with each feature, who would do it, and which control stops it (day 1).' },
					{ q: 'Where are the trust boundaries of this shop?', options: ['Between the API and its own logs', 'At the browser, the payment webhook and the outgoing fetch', 'Between two staff members', 'Between PostgreSQL tables'], answer: 1, why: 'Those are the three places where data comes from a party you do not control.' },
					{ q: 'Why is the payment webhook a trust boundary?', options: ['It is the slowest call in the shop', 'It speaks JSON instead of HTML', 'Data arrives there from a party you do not control', 'It runs in a different container'], answer: 2, why: 'Anyone can send a request to that URL. Every check sits on the line where outside data comes in (day 2).' },
					{ q: 'What is a secure default?', options: ['A setting the attacker cannot see', 'A value you must set before the first start', 'A setting that stays off until you read the docs', 'A setting whose value with no configuration is the safe one'], answer: 3, why: 'Saleor’s `HTTP_IP_FILTER_ENABLED` is `True` unless you turn it off: a shop owner who never reads the settings is still covered (day 7).' }
				]
			},
			{
				title: 'Lock the browser and the accounts',
				questions: [
					{ q: 'Which session cookie do you set?', options: ['`Secure` only, the rest is optional', '`HttpOnly; Secure; SameSite=Lax`, rotated at login', '`SameSite=None`, so the dashboard works', 'No cookie: a token in `localStorage`'], answer: 1, why: 'Scripts cannot read it, it only travels over HTTPS, cross-site requests do not carry it, and a fresh one is issued at login (day 10).' },
					{ q: 'Which CORS setting fits the shop?', options: ['`*`, so the storefront works from anywhere', 'CORS turned off for every route', 'Only `localhost`, as in development', 'Only the storefront and dashboard origins'], answer: 3, why: 'With `*`, Saleor’s handler echoes any origin back with credentials allowed. A short list of your own origins closes that.' },
					{ q: 'How are customer passwords stored?', options: ['As a SHA-256 hash', 'Encrypted with the `SECRET_KEY`', 'As an Argon2id hash', 'As a hash with one salt for all users'], answer: 2, why: 'A slow salted hash makes each guess expensive for whoever steals the table (day 9).' },
					{ q: 'What do staff accounts get on top of a password?', options: ['TOTP, required', 'A longer session', 'A CAPTCHA on each page', 'Nothing: staff are trusted'], answer: 0, why: 'Staff can upload files and read every order, so their accounts need a second factor (day 14).' }
				]
			},
			{
				title: 'Guard the data and the outside inputs',
				questions: [
					{ q: 'The `order` query now checks the owner. Which other lookups need the same check?', options: ['None: the order is the only private object', 'Only the lookups that change data', 'Every address and invoice lookup too', 'Only the staff dashboard queries'], answer: 2, why: 'Addresses and invoices hold the same personal data the Saleor IDOR leaked. Each lookup by id needs its own owner or staff check (day 16).' },
					{ q: 'A staff upload `mug.svg` holds a `<script>` and gets past the content check. What still keeps the dashboard tokens safe?', options: ['Nothing: the script runs with the dashboard’s access', 'The file is served from `media.`, a different origin from the dashboard', 'The 5 minute access token', 'The CSRF token on the upload form'], answer: 1, why: 'A script on `media.` runs with that origin’s access, not the dashboard’s, so it cannot read the staff tokens. A short token life only limits how long a stolen token works (day 24).' },
					{ q: 'How does the webhook know a call comes from the payment provider?', options: ['It checks the `User-Agent` header', 'It checks the source IP and nothing else', 'It trusts any POST with a JSON body', 'It checks the provider’s signature with a constant-time compare'], answer: 3, why: 'The signature proves the sender holds the shared secret. A constant-time compare leaks nothing about it through timing.' },
					{ q: 'A customer gives `http://169.254.169.254/` to "notify me". What happens?', options: ['The fetch is refused: private, loopback and link-local addresses are blocked after DNS resolution', 'It is fetched, since the customer asked', 'It is fetched only over HTTPS', 'It is refused only if the name contains `169`'], answer: 0, why: 'Checking after resolution catches a harmless-looking name that points to an internal address (day 20).' }
				]
			},
			{
				title: 'Deploy it and plan for a breach',
				questions: [
					{ q: 'How does the container run?', options: ['As root, with `SYS_ADMIN` for maintenance', 'As non-root, read-only root filesystem, all capabilities dropped', 'With `--privileged`, to keep the setup simple', 'With Docker’s default settings'], answer: 1, why: 'A bug in the app then lands in a process with no root, nowhere to write and no extra powers (day 33).' },
					{ q: 'Which Pod Security level is the namespace labelled with?', options: ['`privileged`', '`baseline`', '`restricted`', 'None: the default is safe'], answer: 2, why: 'With no label the namespace is `privileged`. `restricted` makes the API server reject a Pod that does not set `runAsNonRoot: true` or keeps its capabilities (day 34).' },
					{ q: 'Which NetworkPolicy setup do you use?', options: ['None: the cluster is private', 'Allow all egress, deny ingress', 'Deny ingress only', 'A default deny, with the API allowed to reach PostgreSQL only'], answer: 3, why: 'Start closed, then open the one path the shop needs (day 35).' },
					{ q: 'What goes in the audit log?', options: ['Logins, failed logins and staff actions, without tokens or passwords', 'Every request body, for later review', 'Passwords, hashed', 'Nothing until a breach is suspected'], answer: 0, why: 'The log must answer who did what after a breach, and must not hand a working credential to whoever reads it (day 36).' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Customer A requests `order(id: 1042)`, and order 1042 belongs to customer B. Which check stops this IDOR?',
			options: [
				'Making order ids random UUIDs, so that nobody can guess another id',
				'In the resolver, checking that the caller owns the order or is staff',
				'Requiring a valid session cookie before any GraphQL query runs',
				'Rate limiting the `order` query to 10 requests per minute per IP'
			],
			answer: 1,
			why: 'An IDOR is a missing object-level check: the server finds the order by id and never asks whose it is. A session proves who the caller is, not that the order is theirs. Random ids and rate limits only make the guessing slower.'
		},
		{
			q: 'Staff can upload product images. According to GHSA-666h, which setup is not affected by the stored XSS?',
			options: [
				'Media under `example.com/media/` next to the dashboard at `example.com/dashboard/`',
				'Media on `media.example.com`, or served with `Content-Disposition: attachment`',
				'Media under `example.com/media/` behind a CDN with a long cache lifetime',
				'Media under `example.com/media/` with file names replaced by random UUIDs'
			],
			answer: 1,
			why: 'An HTML or SVG file served from the dashboard’s origin runs its script with that origin’s access, including the staff tokens. A different domain is a different origin, and `Content-Disposition: attachment` makes the browser download the file instead of rendering it.'
		},
		{
			q: 'Your Saleor deployment keeps the default `ALLOWED_GRAPHQL_ORIGINS`. What does the CORS handler do with a request from `https://evil.example`?',
			options: [
				'It rejects the request, because the default list only holds `localhost`',
				'It accepts it but strips the cookies, because the origin is unknown',
				'It matches `*` and echoes the origin back with credentials allowed',
				'It asks the browser to send a preflight and then always returns 400'
			],
			answer: 2,
			why: 'The default is `*`, and `fnmatchcase("https://evil.example", "*")` is true. The handler then returns `access-control-allow-origin: https://evil.example` with `access-control-allow-credentials: true`. Set the variable to your own storefront and dashboard origins in production.'
		}
	],
	lab: {
		minutes: 25,
		goal: 'Write the controls for the mug shop, then deploy one slice of it for real: an upload served as a download, from a container with no root, no writes and no capabilities.',
		steps: [
			'Write the plan: `mkdir -p ~/capstone-lab/media && cd ~/capstone-lab`, then write `controls.md` for the mug shop from the task, one line per control, each ending with its day, such as `(day 24)`.',
			'Plant a malicious upload and write the media config: `printf \'%s\\n\' \'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.domain)</script></svg>\' > media/evil.svg && printf \'%s\\n\' \'server {\' \'    listen 8080;\' \'    location /media/ {\' \'        alias /srv/media/;\' \'        add_header Content-Disposition attachment always;\' \'        add_header X-Content-Type-Options nosniff always;\' \'    }\' \'}\' > default.conf`.',
			'Deploy it hardened: `docker run -d --name capstone-lab --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges -p 127.0.0.1:8080:8080 -v "$PWD/default.conf":/etc/nginx/conf.d/default.conf:ro -v "$PWD/media":/srv/media:ro nginxinc/nginx-unprivileged:1.27-alpine`.',
			'Check the upload control: `curl -sI localhost:8080/media/evil.svg`, then open `http://localhost:8080/media/evil.svg` in your browser.',
			'Check the deployment controls: `docker exec capstone-lab id`, `docker exec capstone-lab touch /etc/x` and `docker exec capstone-lab grep CapEff /proc/1/status`.',
			'Copy `controls.md` out if you want to keep it, then clean up: `docker rm -f capstone-lab && rm -rf ~/capstone-lab`.'
		],
		done: [
			'`controls.md` has lines for the threat model, the browser, accounts, data, outside inputs, supply chain, deployment and after a breach, each with a day.',
			'The `curl` answer has `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`, and the browser downloads the file with no alert.',
			'`id` prints `uid=101(nginx)`, `touch` fails with `Read-only file system`, and `CapEff` is `0000000000000000`.'
		],
		solution: [
			'The SVG holds a script. Served inline from the shop’s own origin, it would run with the dashboard’s access, which is GHSA-666h. `attachment` makes the browser save it instead, and `nosniff` stops it from guessing another type (day 24).',
			'The container shows three day 33 controls at once: a non-root user from the image, `--read-only` with a `tmpfs` only for `/tmp`, and `--cap-drop ALL`. `no-new-privileges` stops a setuid binary from getting root back.',
			'The rest of `controls.md` does not fit in one container: TLS, cookies, Argon2id, owner checks, the webhook signature and the NetworkPolicy live in the app and the cluster. Keep the file as the checklist you review them against.',
			'In production the media would also move to `media.` on another domain. Either condition stops GHSA-666h, and having both is defense in depth (day 4).'
		]
	},
	recall: {
		q: 'Name the three Saleor advisories from this chapter and the day each one maps to.',
		a: 'GHSA-666h, stored XSS through uploaded HTML and SVG files (days 18 and 24). GHSA-r6fj, IDOR on old orders (day 16). GHSA-ff69, CSRF bypass in `refreshToken` (day 11).'
	},
	sources: [
		{ title: 'GHSA-666h-2p49-pg95, Saleor: Stored XSS via Unrestricted File Uploads', url: `${ADV}/GHSA-666h-2p49-pg95` },
		{ title: 'GHSA-r6fj-f4r9-36gr, Saleor: Insecure Direct Object Reference (IDOR) in GraphQL API', url: `${ADV}/GHSA-r6fj-f4r9-36gr` },
		{ title: 'GHSA-ff69-fwjf-3c9w, Saleor: CSRF bypass in refreshToken mutation', url: `${ADV}/GHSA-ff69-fwjf-3c9w` },
		{ title: 'Saleor source, saleor/settings.py', url: `${SALEOR}/saleor/settings.py` },
		{ title: 'Saleor source, saleor/asgi/cors_handler.py', url: `${SALEOR}/saleor/asgi/cors_handler.py` }
	]
};
