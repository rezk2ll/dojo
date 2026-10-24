const REPO = 'https://github.com/discourse/discourse/blob/9252651c5c25df36cb0a3cf3f06e0c9c30974d5a';
const RAILS = 'https://github.com/rails/rails/blob/8b25b80042db6c5498976ed0f5fd01b6764c0146';
const SSRF = `${REPO}/lib/final_destination/ssrf_detector.rb`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'threat-modeling',
	part: 'Built to last',
	title: 'Threat modeling',
	minutes: 10,
	hook: [
		'Your shop adds a small feature: a seller pastes an image URL, and **your server downloads the picture** for the product page. It ships in a day. Discourse has the same shape: when someone pastes a link into a post, its server can fetch the page to build a preview (a onebox).',
		'So what stops a seller from pasting `http://169.254.169.254/` (the cloud metadata address) or `http://10.0.0.5/admin`, and making **your server fetch it from inside your network**? Or a 5 GB file, a thousand times? Reading the code line by line will not tell you, because you do not know yet which questions to ask. You need a drawing of where outside data enters your system, and a short list of questions to ask at each entry point.',
		'A **threat model** gives you both. The Threat Modeling Manifesto reduces it to four questions: "What are we working on? What can go wrong? What are we going to do about it? Did we do a good enough job?" On day 3 you wrote "secure" as testable scenarios, and a threat model tells you which scenarios to write.'
	],
	terms: [
		{ term: 'Data flow diagram', def: 'Boxes for processes and stores, arrows for data, outside parties drawn apart. The map a threat model is done on.' },
		{ term: 'Trust boundary', def: 'A line on that map where data passes from someone you trust less to someone you trust more, or the other way. Every arrow that crosses one is a place to look.' },
		{ term: 'STRIDE', def: 'Six kinds of threat to ask about at each crossing: Spoofing, Tampering, Repudiation, Information disclosure, Denial of service, Elevation of privilege.' },
		{ term: 'SSRF', def: 'Server-side request forgery. The attacker makes your server fetch a URL for them, and so reaches what only your server can reach.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['subgraph ours["Trust boundary: what we run"]', 'lb["Load balancer"]', 'app["Shop app"]', 'end', 'seller(["Seller browser"]) -->|"POST image_url"| lb', 'lb --> app'],
				highlight: ['seller', 'lb', 'app'],
				note: 'For the first question, what are we working on, draw the data flow, then the line around what you run. The browser is outside: anything it sends, header, cookie or URL, may be forged. Each arrow that **crosses the line** gets the six STRIDE questions.'
			},
			{
				add: ['lb -->|"X-Forwarded-For: client address"| app'],
				highlight: ['lb'],
				note: 'A seller can spoof their address. The rate limit counts requests per client address, and the address comes from the `X-Forwarded-For` header, which a seller can send too. The app must trust that header **only from the load balancer**, or anyone can pick the address they are counted under.'
			},
			{
				add: ['app -->|"GET image_url"| img["Image host on the internet"]', 'app -.->|"blocked: private address"| internal["10.0.0.5 or 169.254.169.254"]', 'class img ext'],
				highlight: ['img', 'internal'],
				note: 'SSRF is an elevation of privilege: the URL comes from outside, but the request leaves from inside. Resolve the host, drop every private or reserved address, and **connect only to the addresses that passed**. Discourse does exactly this for its link previews.'
			},
			{
				add: ['img -->|"bytes, redirects"| app'],
				highlight: ['img'],
				note: 'On the way back, the image host can cause denial of service or tampering. Cap the size, the time, and the number of redirects, and check each redirect target again. Check that the bytes are an image, whatever the `Content-Type` says.'
			},
			{
				add: ['app --> logs[("Audit log: seller, product, URL host")]'],
				highlight: ['logs'],
				note: 'For repudiation, log which seller asked for which host, so you can answer "who made us fetch that?". For information disclosure, do not return the fetch error body to the seller: it may hold an internal page. **Write each choice down**, including what you decided not to do.'
			}
		]
	},
	example: {
		title: 'lib/final_destination/ssrf_detector.rb: every outgoing fetch checks where it lands',
		repo: 'discourse/discourse',
		url: `${SSRF}#L85-L108`,
		lang: 'ruby',
		code: `    def self.ip_allowed?(ip)
      ip = ip.is_a?(IPAddr) ? ip : IPAddr.new(ip)
      ip = ip.native

      return false if ip_in_ranges?(ip, blocked_ip_blocks) || ip_in_ranges?(ip, PRIVATE_IP_RANGES)

      true
    end

    def self.lookup_and_filter_ips(name, timeout: nil)
      begin
        ips = lookup_ips(name, timeout: timeout)
      rescue SocketError
        raise LookupFailedError, "FinalDestination: lookup failed"
      end

      return ips if host_bypasses_checks?(name)

      ips.filter! { |ip| FinalDestination::SSRFDetector.ip_allowed?(ip) }

      raise DisallowedIpError, "FinalDestination: all resolved IPs were disallowed" if ips.empty?

      ips
    end`,
		notes: [
			'Line 5 refuses any address in `blocked_ip_blocks` or `PRIVATE_IP_RANGES`. `PRIVATE_IP_RANGES` is built from the [IANA special-purpose registries](' + SSRF + '#L11-L51), IPv4 and IPv6: loopback, private, link-local (which holds the cloud metadata address), documentation ranges. An admin can add more ranges with the `blocked_ip_blocks` setting. If no resolved address passes, line 21 raises `DisallowedIpError`, and nothing is fetched.',
			'[`FinalDestination::HTTP#connect`](' + REPO + '/lib/final_destination/http.rb#L8-L34) filters the addresses, then hands **those addresses** to the socket layer, through the Connector. The check and the connection use the same DNS answer.',
			'Against denial of service, the same class keeps at most five IPv4 and five IPv6 addresses, [`MAX_ADDRESSES_PER_FAMILY = 5`](' + REPO + '/lib/final_destination/http.rb#L4-L6): "Limit the total to avoid DoS via a high-ip-count DNS response." `FinalDestination` follows at most 5 redirects by default, and link previews can be set to follow none.',
			'[`allowed_internal_hosts`](' + SSRF + '#L64-L83) skips the checks for the site\'s own CDN, its base URL and any host an admin lists. Discourse records that accepted risk as a setting, so a reviewer can read it in the config.',
			'Rails\' [`RemoteIp`](' + RAILS + '/actionpack/lib/action_dispatch/middleware/remote_ip.rb#L8-L32) has the spoofing problem one layer down. It picks "the last-set address that is not on the list of trusted IPs", and warns in capitals: "IF YOU DON\'T USE A PROXY, THIS MAKES YOU VULNERABLE TO IP SPOOFING." Only a header set by your own proxy can be believed.'
		]
	},
	tradeoff: {
		gain: [
			'You ask STRIDE at the few arrows that cross a boundary, instead of reviewing every line of code.',
			'You find threats while they are a box on a whiteboard, when the fix is a design change instead of a hotfix.',
			'Accepted risks, like `allowed_internal_hosts`, are written down with a reason, so the next reviewer does not report them as bugs.',
			'Each mitigation gives a test you can name: "a URL that resolves to 10.0.0.5 is never fetched".'
		],
		cost: [
			'The model takes time, and it goes out of date: a new route or a new queue is a new crossing nobody has asked STRIDE about.',
			'Someone still has to rank the threats by impact and likelihood before anyone fixes them.',
			'A reviewer can stop at the obvious letters (spoofing, tampering) and skip repudiation and denial of service.',
			'A blocked private range can also block a legitimate internal host, so Discourse needs an allow list too.'
		]
	},
	task: {
		prompt: 'Your ticketing system adds webhooks: a customer registers a URL, and your server POSTs every new ticket to it. Draw it (customer admin, your API, a worker, the customer\'s endpoint) and mark the trust boundaries. Then write one threat per STRIDE letter and what you do about it. If you find nothing for a letter, write "none found".',
		hint: 'There are two outside parties: the admin who registers the URL, and the endpoint that receives the POST. Ask which one controls what, and what the worker can reach that they cannot.',
		answer: [
			'Boundaries: between the customer admin and your API, and between your worker and the customer\'s endpoint. The worker sits inside your network, so the URL is outside data driving an inside request.',
			'Spoofing: the receiver cannot tell your POST from a forged one. Sign each body with a per-customer secret (an HMAC header) so they can check it. Tampering: the same signature, plus a timestamp in it, so an old message cannot be replayed.',
			'Elevation of privilege: the URL is SSRF waiting to happen. Resolve it, refuse private and reserved ranges, connect only to the checked addresses, and check every redirect again (or follow none).',
			'Denial of service: a slow endpoint must not block the queue. Short timeouts, a cap on retries, and one queue per customer or a limit per customer. Information disclosure: send only the fields the customer may see, and never return the endpoint\'s response body in your UI as is.',
			'Repudiation: keep a delivery log with the ticket id, the time, the status code, and who registered the URL, so "we never got it" and "we never asked for it" both have an answer.'
		],
		steps: [
			{
				title: 'Draw the boundaries',
				questions: [
					{ q: 'Which two parties sit outside your trust boundary?', options: ['Your API and your worker', 'The customer admin and the customer\'s endpoint', 'The worker and the database', 'The customer admin and your worker'], answer: 1, why: 'The admin registers the URL and the endpoint receives the POST. You run neither, so both are outside.' },
					{ q: 'Where does the first trust boundary sit?', options: ['Between your API and the worker', 'Between the worker and its queue', 'Between the customer admin and your API', 'Between the database and its backups'], answer: 2, why: 'The registered URL enters there, from someone you trust less, so that arrow gets the STRIDE questions.' },
					{ q: 'Where does the second one sit?', options: ['Between your worker and the customer\'s endpoint', 'Between the customer admin and their browser', 'Between two of your own workers', 'Between your API and your load balancer'], answer: 0, why: 'The POST leaves your network there, and the reply comes back from a host you do not control.' },
					{ q: 'Why does the worker make this design risky?', options: ['It runs on a slower machine than the API', 'It has no access to the database', 'It sends data the customer already has', 'It sits inside your network, and the URL it calls is outside data'], answer: 3, why: 'Outside data drives an inside request. That is the shape of SSRF.' }
				]
			},
			{
				title: 'Ask spoofing and tampering',
				questions: [
					{ q: 'Spoofing: what can the receiver not tell apart?', options: ['Your POST from a forged one', 'A new ticket from an updated one', 'A slow reply from a fast one', 'Your worker from your API'], answer: 0, why: 'Anyone who knows the URL can POST to it. Without proof, the receiver has to trust whatever arrives.' },
					{ q: 'What lets the receiver check that a POST came from you?', options: ['Sending it from a fixed IP address', 'Signing each body with a per-customer secret, in an HMAC header', 'Adding the ticket id to the URL', 'Using HTTPS only, with no other check'], answer: 1, why: 'A signature with a secret only you and that customer hold proves who sent the body.' },
					{ q: 'Tampering: someone captures a signed message and sends it again later. What stops it?', options: ['A longer secret', 'A second signature with another secret', 'A timestamp inside the signed data', 'Sending each ticket twice'], answer: 2, why: 'The signature already covers the body. A signed timestamp lets the receiver refuse an old message.' },
					{ q: 'Which mitigation covers both spoofing and tampering here?', options: ['A rate limit per customer', 'A delivery log', 'Short timeouts', 'The same signature over the body'], answer: 3, why: 'A changed body no longer matches its signature, and a forged one has none that checks.' }
				]
			},
			{
				title: 'Ask elevation of privilege',
				questions: [
					{ q: 'A customer registers `http://169.254.169.254/` as their webhook URL. Which STRIDE letter is this?', options: ['Repudiation', 'Elevation of privilege', 'Information disclosure only', 'Spoofing'], answer: 1, why: 'SSRF is an elevation of privilege: the URL comes from outside, but the request leaves from inside.' },
					{ q: 'What does the worker do with the host before it connects?', options: ['Resolve it and refuse private and reserved addresses', 'Check it against a list of known bad domains', 'Ping it to see if it answers', 'Ask the customer admin to confirm it'], answer: 0, why: 'Discourse does the same: resolve, drop every private or reserved address, and fetch nothing if none is left.' },
					{ q: 'After the check, which addresses does the worker connect to?', options: ['Whatever a second DNS lookup returns', 'The first address the OS picks', 'Only the addresses that passed the check', 'Any address, since the host passed'], answer: 2, why: 'Check and connection must use the same DNS answer. Discourse hands those exact addresses to the socket layer.' },
					{ q: 'The endpoint answers with a redirect to `http://10.0.0.5/admin`. What do you do?', options: ['Follow it, since the first host passed', 'Follow it, but strip the headers', 'Follow it once, then stop', 'Check the target again, or follow no redirects at all'], answer: 3, why: 'Each redirect is a new destination. Check every one again, or follow none.' }
				]
			},
			{
				title: 'Ask the rest and write it down',
				questions: [
					{ q: 'Denial of service: one customer\'s endpoint takes minutes to answer. What protects everyone else?', options: ['Short timeouts, a cap on retries, and a queue or a limit per customer', 'Retrying until it answers', 'A bigger worker machine', 'Sending all tickets in one POST'], answer: 0, why: 'A slow endpoint must not block the queue for every other customer.' },
					{ q: 'Information disclosure: the endpoint returns an error page. What do you show in your UI?', options: ['The full response body, to help debugging', 'The response headers and body', 'The status code and a short error, never the raw body', 'Nothing, and you drop the delivery'], answer: 2, why: 'The body comes from outside your control and may hold anything. Show a status, not the raw page.' },
					{ q: 'Repudiation: a customer says "we never got it". What gives you an answer?', options: ['The customer\'s own logs', 'The ticket itself', 'A copy of the HMAC secret', 'A delivery log with ticket id, time, status code and who registered the URL'], answer: 3, why: 'The log answers both "we never got it" and "we never asked for it".' },
					{ q: 'You find no threat for one letter. What do you write?', options: ['Nothing: skip the letter', '"none found"', 'A threat from another letter', 'The letter with a question mark'], answer: 1, why: 'Writing "none found" shows you asked. A missing letter looks like one you skipped.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'You have a data flow diagram of your system. Where should you ask the STRIDE questions first?',
			options: [
				'On every arrow that crosses a trust boundary',
				'On the box with the most lines of code',
				'On the database, because that is where the data is',
				'On the arrows between your own internal services'
			],
			answer: 0,
			why: 'Threats enter where data passes from less trusted to more trusted hands. Internal arrows matter too, but the crossings are where an outsider controls the input, so they come first.'
		},
		{
			q: 'A Discourse user pastes a link whose host resolves only to `10.0.0.5`. What does `lookup_and_filter_ips` do?',
			options: [
				'It fetches the page, but strips any cookies from the request',
				'It removes the address and raises `DisallowedIpError`, so nothing is fetched',
				'It retries the lookup with a public DNS server to find another address',
				'It fetches the page, since the user who pasted it is logged in'
			],
			answer: 1,
			why: '10.0.0.0/8 is in `PRIVATE_IP_RANGES`. With every resolved address filtered out, the list is empty and the method raises "all resolved IPs were disallowed". The check looks only at the resolved addresses, so being logged in changes nothing.'
		},
		{
			q: 'Rails\' `RemoteIp` middleware runs on a server with no proxy in front of it. A client sends `X-Forwarded-For: 203.0.113.9`. What is the risk?',
			options: [
				'None: Rails always ignores the header when there is no proxy',
				'The request is refused, because the header comes from a client',
				'The server cannot start until a list of trusted proxies is configured',
				'The client can claim any address, so per-address limits can be dodged'
			],
			answer: 3,
			why: 'Its own comment says so: without a proxy, "any client can claim to have any IP address by setting the `X-Forwarded-For` header". With no proxy in front, the client writes that header itself.'
		}
	],
	recall: {
		q: 'Where on the data flow diagram do you ask the six STRIDE questions, and what does Discourse do against SSRF?',
		a: 'At every arrow that crosses a trust boundary. For a pasted URL, Discourse resolves the host, drops private and reserved addresses such as 10.0.0.5, and connects only to the addresses that passed.'
	},
	sources: [
		{ title: 'Discourse, lib/final_destination/connector.rb', url: `${REPO}/lib/final_destination/connector.rb#L3-L14` },
		{ title: 'Discourse, lib/final_destination.rb (redirect limit)', url: `${REPO}/lib/final_destination.rb#L52-L57` },
		{ title: 'Discourse, lib/oneboxer.rb (link preview redirects)', url: `${REPO}/lib/oneboxer.rb#L538-L552` },
		{ title: 'Threat Modeling Manifesto', url: 'https://www.threatmodelingmanifesto.org/' },
		{ title: 'OWASP, Threat Modeling Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Threat_Modeling_Cheat_Sheet.html' },
		{ title: 'OWASP, Threat Modeling Process (STRIDE)', url: 'https://owasp.org/www-community/Threat_Modeling_Process' },
		{ title: 'Jim Gumbley, Threat Modeling Guide for Software Teams (martinfowler.com)', url: 'https://martinfowler.com/articles/agile-threat-modelling.html' },
		{ title: 'OWASP, SSRF Prevention Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html' }
	]
};
