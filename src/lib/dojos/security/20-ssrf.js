const GL = 'https://github.com/gitlabhq/gitlabhq/blob/28f70ed3725bbc2bb6cbfa635ab6dd9bfa57af9a';
const BLOCKER = `${GL}/gems/gitlab-http/lib/gitlab/http_v2/url_blocker.rb`;
const CVE = 'https://gitlab.com/gitlab-org/cves/-/blob/master/2021/CVE-2021-22214.json';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'ssrf',
	part: 'Input and output',
	title: 'Server-side request forgery',
	minutes: 10,
	hook: [
		'GitLab lets a project owner type a webhook URL, and the GitLab server sends an HTTP request to it on events such as a push. On 8 June 2021, CVE-2021-22214 was published: "When requests to the internal network for webhooks are enabled, a server-side request forgery vulnerability in GitLab CE/EE affecting all versions starting from 10.5 was possible to exploit for an unauthenticated attacker". Fixed versions: 13.10.5, 13.11.5 and 13.12.2.',
		'The request leaves from the server, so it reaches what the server reaches: services on `localhost`, the private network, and on a cloud VM the metadata service at `169.254.169.254`. A comment in GitLab\'s URL blocker gives the stake: "On IaaS these can return IAM credentials".'
	],
	terms: [
		{ term: 'SSRF', def: 'Server-side request forgery: the attacker gives the server a URL, and the server sends the request from inside its own network.' },
		{ term: 'Metadata service', def: 'An HTTP endpoint on cloud VMs at `169.254.169.254` that answers questions about the instance. On AWS this service is called IMDS.' },
		{ term: 'Link-local address', def: 'An address in `169.254.0.0/16` (IPv4) or `fe80::/10` (IPv6), reachable only on the local network segment. The metadata IP is one of them.' },
		{ term: 'DNS rebinding', def: 'A hostname resolves to a public IP when the app checks it and to an internal IP when the app connects. GitLab\'s docs: it makes "a malicious domain name resolve to an internal network resource".' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['hook["Webhook URL: http://169.254.169.254/latest/meta-data/"] --> srv["GitLab server sends the request on the next push"]'],
				highlight: ['hook', 'srv'],
				note: 'The attacker never connects to the metadata IP. They only type it in a form. On the next push, the GitLab server, which runs on the VM, sends the request.'
			},
			{
				add: ['srv --> inside["Reaches 127.0.0.1, 10.0.0.0/8, 169.254.169.254"]'],
				highlight: ['inside'],
				note: 'From inside, the server reaches what a firewall hides from the internet. GitLab\'s webhook docs: an attacker "can get the GitLab server to make POST HTTP requests to endpoints that delete resources" on services that trust local callers.'
			},
			{
				add: ['srv --> resolve["UrlBlocker: resolve the hostname, check every IP"]', 'resolve -->|"loopback, private, link-local, metadata"| blocked["BlockedUrlError"]'],
				highlight: ['resolve', 'blocked'],
				note: 'GitLab\'s `UrlBlocker` resolves the hostname with `getaddrinfo` and tests each address it gets back. A hostname like `internal.attacker.example` that points to `10.0.0.5` fails the same test as the literal IP.'
			},
			{
				add: ['resolve -->|"dns_rebind_protection"| pin["Connect to the checked IP, keep the hostname for TLS"]'],
				highlight: ['pin'],
				note: 'Between the check and the connection, DNS could answer differently. With `dns_rebind_protection`, GitLab returns the URI with the checked IP as its host and keeps the original hostname to verify the TLS certificate. The client makes no second DNS lookup.'
			},
			{
				add: ['pin --> imds["Cloud side: IMDSv2 needs a PUT for a token, hop limit 1"]'],
				highlight: ['imds'],
				note: 'A second layer on AWS: an IMDSv2 request needs a session token, obtained by a `PUT` to `/latest/api/token`. The OWASP cheat sheet advises moving to IMDSv2 and disabling IMDSv1. AWS: "PUT requests are rejected if they contain an X-Forwarded-For header", and the token response has a hop limit of 1 by default.'
			}
		]
	},
	example: {
		title: 'gems/gitlab-http/lib/gitlab/http_v2/url_blocker.rb: pin the IP, then refuse local addresses',
		repo: 'gitlabhq/gitlabhq',
		url: `${BLOCKER}#L216-L458`,
		lang: 'ruby',
		code: `        def enforce_uri_hostname(ip_address, uri, dns_rebind_protection, proxy_in_use)
          unless dns_rebind_protection && ip_address && ip_address != uri.hostname
            return Result.new(uri, nil, proxy_in_use)
          end

          new_uri = uri.dup
          new_uri.hostname = ip_address
          Result.new(new_uri, uri.hostname, proxy_in_use)
        end
…
        def validate_local_request(
          address_info:,
          allow_localhost:,
          allow_local_network:)
          return if allow_local_network && allow_localhost

          unless allow_localhost
            validate_localhost(address_info)
            validate_loopback(address_info)
          end

          return if allow_local_network

          validate_local_network(address_info)
          validate_link_local(address_info)
          validate_shared_address(address_info)
          validate_limited_broadcast_address(address_info)
        end
…
        def validate_loopback(addrs_info)
          return unless addrs_info.any? { |addr| addr.ipv4_loopback? || addr.ipv6_loopback? }

          raise BlockedUrlError, "Requests to loopback addresses are not allowed"
        end

        def validate_local_network(addrs_info)
          return unless addrs_info.any? { |addr| addr.ipv4_private? || addr.ipv6_sitelocal? || addr.ipv6_unique_local? }

          raise BlockedUrlError, "Requests to the local network are not allowed"
        end

        def validate_link_local(addrs_info)
          netmask = IPAddr.new('169.254.0.0/16')
          return unless addrs_info.any? { |addr| addr.ipv6_linklocal? || netmask.include?(addr.ip_address) }

          raise BlockedUrlError, "Requests to the link local network are not allowed"
        end`,
		notes: [
			'Lines 6 to 8 pin the address. The returned URI has the checked IP as its host, and `uri.hostname` travels next to it for the TLS check. GitLab\'s secure coding guide warns: "if we ignore this returned value, we will not be protected against DNS rebinding".',
			'Line 22, `return if allow_local_network`, is the admin setting from the hook. CVE-2021-22214 needed "requests to the internal network for webhooks" to be enabled. The [webhook docs](https://docs.gitlab.com/security/webhooks/) list what is blocked when it is off: `127.0.0.1`, `::1`, `0.0.0.0`, `10.0.0.0/8`, `172.16.0.0/12` and `192.168.0.0/16`.',
			'Lines 31, 37 and 44 use `any?`. A hostname with one public and one private A record is refused, because the client might connect to either.',
			'Line 43 blocks all of `169.254.0.0/16`, the metadata IP included. A separate check, [`validate_cloud_metadata!`](' + BLOCKER + '#L460-L467), runs before the allowlist and is not skipped by `allow_local_network`. The webhook docs date it: "Introduced in GitLab 19.5".'
		]
	},
	tradeoff: {
		gain: [
			'One class holds the rules for outgoing URLs, and webhooks and integrations go through the same admin settings.',
			'Checking the resolved IPs catches hostnames that point inside, and pinning the IP stops a second DNS answer from changing the target.'
		],
		cost: [
			'A block list must know every internal range. The OWASP cheat sheet: "Deny-lists are bypass-prone. Prefer allow-lists." A block list stays only where users may enter any external URL, as with webhooks.',
			'Some admins need webhooks to reach an internal Jenkins. Ticking "Allow requests to the local network from webhooks and integrations" opens every private range at once, which was the precondition of CVE-2021-22214.',
			'`UrlBlocker` checks the URL of the first request only. GitLab\'s guide asks to "Disable redirects or validate the redirect destination", because a public URL can answer with a redirect to `169.254.169.254`.'
		]
	},
	task: {
		prompt: 'A GitLab instance runs on a cloud VM with default outbound settings: local network requests from webhooks are not allowed. For each webhook URL, say whether `UrlBlocker` accepts it and, if not, which check refuses it. (1) `http://127.0.0.1:6379/` (2) `http://169.254.169.254/latest/meta-data/` (3) `https://hooks.attacker.example/` whose DNS A record is `10.0.0.5` (4) `https://ci.example.org/hook` whose A record is a public address.',
		hint: 'The checks run on the IP addresses after DNS, and the metadata check also runs on the hostname before DNS.',
		answer: [
			'(1) Refused. `allow_localhost` is false, so `validate_localhost` and `validate_loopback` run, and `127.0.0.1` is a loopback address.',
			'(2) Refused before DNS: `validate_cloud_metadata_hostname!` matches the literal IP and raises "Requests to cloud metadata endpoints are not allowed". Without that check, line 43 of the example would still catch it as link-local.',
			'(3) Refused after DNS. The hostname looks public, but `getaddrinfo` returns `10.0.0.5`, and `ipv4_private?` is true: "Requests to the local network are not allowed".',
			'(4) Accepted. With `dns_rebind_protection`, the request goes to the IP that was checked, with `ci.example.org` kept for TLS. A redirect from that server to an internal address must be checked again or refused.'
		]
	},
	quiz: [
		{
			q: 'Why does GitLab check the IP addresses returned by DNS, and not only the hostname typed in the webhook form?',
			options: [
				'Because hostnames are case-insensitive and hard to compare',
				'Because the attacker controls their DNS and can point any name inside',
				'Because `getaddrinfo` is faster than a regular expression on the URL',
				'Because a TLS certificate can only be checked against an IP address'
			],
			answer: 1,
			why: 'Anyone who owns a domain can give it an A record of `10.0.0.5` or `127.0.0.1`. GitLab\'s guide: "validate the destination IP addresses themselves, not just domain names, as the attacker can control DNS."'
		},
		{
			q: 'With `dns_rebind_protection` on, what does `enforce_uri_hostname` return when `hooks.example.com` resolves to `203.0.113.9`?',
			options: [
				'The original URI, so the HTTP client resolves the name again',
				'An error, because a hostname that resolves is suspicious',
				'A URI with `203.0.113.9` as host, plus the original name for TLS',
				'A URI with `127.0.0.1` as host, to route the call through a proxy'
			],
			answer: 2,
			why: 'Lines 6 to 8 set `new_uri.hostname = ip_address` and pass `uri.hostname` next to it. The client connects to the address that passed the checks, so a second DNS answer cannot move the request to an internal IP.'
		},
		{
			q: 'A webhook URL passes every check, but its server answers `302 Location: http://169.254.169.254/latest/meta-data/`. What should the HTTP client do?',
			options: [
				'Refuse the redirect, or run the same checks on the new URL',
				'Follow it, since the first URL was already validated',
				'Follow it only if the redirect uses the same scheme',
				'Follow it, since 302 responses are always cached by GitLab'
			],
			answer: 0,
			why: 'The checks covered the first URL only. GitLab\'s secure coding guide: "Disable redirects or validate the redirect destination". The OWASP cheat sheet also asks to disable redirect following in the web client.'
		}
	],
	recall: {
		q: 'Which three address families does `UrlBlocker#validate_local_request` refuse for webhooks by default, and what is the metadata IP?',
		a: 'Loopback (`127.0.0.1`, `::1`), private networks (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`) and link-local `169.254.0.0/16`, which holds the metadata IP `169.254.169.254`.'
	},
	sources: [
		{ title: 'GitLab CVE record CVE-2021-22214', url: CVE },
		{ title: 'GitLab source (GitHub mirror), url_blocker.rb', url: BLOCKER },
		{ title: 'GitLab docs, Webhooks and insecure internal web services', url: 'https://docs.gitlab.com/security/webhooks/' },
		{ title: 'GitLab docs, Secure coding guidelines for Ruby: SSRF', url: 'https://docs.gitlab.com/development/secure_coding_guidelines/ruby/' },
		{ title: 'OWASP Server-Side Request Forgery Prevention Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html' },
		{ title: 'AWS docs, Use the Instance Metadata Service to access instance metadata', url: 'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/configuring-instance-metadata-service.html' }
	]
};
