/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'link-previews',
	part: 'Small services',
	title: 'Link previews',
	minutes: 10,
	hook: [
		'Sami pastes a news link in a team chat. Under the message, a card appears with the article’s title, a short description and a photo. Nobody in the chat had to open the page.',
		'Someone fetched that page. If it was your server, an attacker can paste `http://169.254.169.254/` instead, the address of the cloud metadata service. OWASP notes that SSRF "is often used to access and steal credentials and access tokens from metadata services".',
		'You design the preview service: fetch the title and the image of any public page, and never reach an address inside your own network.'
	],
	terms: [
		{ term: 'Open Graph tags', def: '`<meta property="og:title">` and `og:image` tags in a page’s `<head>` that give the title and image a preview should show.' },
		{ term: 'SSRF', def: 'Server-side request forgery: a user makes your server send a request to an address they choose, such as an internal one.' },
		{ term: 'DNS rebinding', def: 'A domain answers with a public IP when you check it, then with an internal IP when you connect.' }
	],
	kata: {
		brief: [
			'A chat app carries 2 million messages a day. About 1 message in 10 holds a link. 60% of those links were already posted by someone in the last 24 hours.',
			'Each link gets a card with the page title and its description, plus one image from the page. The message must show at once. The card should appear within 3 seconds.',
			'The servers run in a cloud network with private addresses in `10.0.0.0/8` and the metadata address `169.254.169.254`. An admin panel listens on `10.0.4.7`. Some linked pages are 20 MB, and some never finish sending.'
		],
		minutes: 10,
		checklist: [
			'Your design says which machine fetches the page: the sender’s phone, each reader’s phone, or your servers.',
			'Your design lists the address ranges a fetch refuses. The list covers `169.254.169.254` and `10.0.0.0/8`.',
			'Your design says how the address it checked is the address it connects to, so DNS rebinding fails.',
			'Your design says what happens when a public page redirects to `http://10.0.4.7/`.',
			'Your design gives a time limit and a size limit for one fetch.',
			'Your design says whether a message waits for its card.',
			'Your design counts the fetches per day after the cache.'
		],
		sample: [
			'The chat server stores and delivers the message at once, then puts the URL on a queue. A preview worker fetches the page and pushes the card as an update to the message. Readers’ phones never contact the linked site, so the site never sees their IP addresses.',
			'200 000 links a day, minus the 60% already in a cache keyed by URL for 24 hours, leaves 80 000 fetches a day: about 1 per second. One cached card is about 1 KB of text, so a day of cards takes about 80 MB. The worker also downloads `og:image`, shrinks it to a 50 KB thumbnail and stores it. 80 000 thumbnails take 4 GB a day.',
			'The worker accepts only `http` and `https` on ports 80 and 443. It resolves the host name once and refuses the URL if any address falls in `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `fc00::/7` or `fe80::/10` (the OWASP deny list, widened from `169.254.169.254` to the whole `169.254.0.0/16` link-local range).',
			'The worker then connects to the IP it checked and sends the original name in the `Host` header and in TLS SNI. A second DNS lookup would let a rebinding domain switch to `10.0.4.7` after the check. OWASP warns: "A second, unchecked DNS lookup between validation and connection can bypass these checks".',
			'The HTTP client follows no redirect by itself. The worker reads the `Location` header and runs the same checks on the new host, at most 3 times. A redirect to `http://10.0.4.7/` fails the range check and the card is not shown.',
			'One fetch has 5 seconds in total. The worker reads at most 512 KB of HTML and stops after `</head>`, where the Open Graph tags sit. It reads at most 5 MB of image. A 20 MB page or a page that never ends costs one worker 5 seconds and 512 KB.',
			'The workers also run in their own subnet, with a firewall that allows outgoing traffic to the internet and nothing inside `10.0.0.0/8`. A bug in the address check then still hits the firewall. The cost of the design: cards appear 1 to 5 seconds after the message, and a cached card can be up to 24 hours old when the page changes.'
		]
	},
	quiz: [],
	recall: {
		q: 'In the sample, why does the worker connect to the IP it checked instead of looking the name up again?',
		a: 'A second DNS lookup could return an internal address like `10.0.4.7` after the check passed (DNS rebinding). Connecting to the checked IP, with the name kept in `Host` and SNI, closes that gap.'
	},
	sources: [
		{ title: 'OWASP: Server Side Request Forgery Prevention Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html' },
		{ title: 'The Open Graph protocol', url: 'https://ogp.me/' }
	]
};
