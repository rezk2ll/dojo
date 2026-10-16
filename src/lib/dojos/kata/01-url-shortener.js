/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'url-shortener',
	part: 'Small services',
	title: 'A URL shortener',
	minutes: 10,
	hook: [
		'A marketing team prints a QR code on 20 000 flyers. The code points at `https://sho.rt/k3Xa9Qz`. The long URL behind it has 180 characters of tracking parameters.',
		'Six months later the campaign page moves. The team changes the target in your service, and every flyer keeps working. A week later someone reports one link as phishing, and you switch it off.',
		'Both changes only work if each scan still reaches your server.'
	],
	terms: [
		{ term: 'Short code', def: 'The few characters after the domain, like `k3Xa9Qz`. The service maps each code to one long URL.' },
		{ term: 'Base62', def: 'Writing a value with the 62 characters `0-9`, `a-z` and `A-Z`. A code of n characters has 62 to the power n possible values.' },
		{ term: '302 Found', def: 'The HTTP status that tells the browser the target is temporary. The browser follows the `Location` header and keeps using the short URL next time.' }
	],
	kata: {
		brief: [
			'Teams paste a long URL and get a short one back. Anyone who opens the short URL is redirected to the long one. The owner of a link can change its target or switch it off.',
			'The service must hold **100 million links** over 5 years. Each link is opened 100 times on average, so there are 100 reads for every write. Peak traffic is 10 times the average.',
			'A redirect must answer in under 50 ms. A long URL is 200 characters on average and at most 2 000. The team also wants a click count per link, which may be a few minutes late.'
		],
		minutes: 10,
		checklist: [
			'Your design says how many characters a code has, and how many codes that length gives.',
			'Your design says what happens when a new link gets a code that already exists.',
			'Your design names the HTTP status of the redirect, and says whether a second click still reaches your server.',
			'Your sketch shows the read path of a redirect, and nothing on that path waits for a write.',
			'Your design says where a click is counted, and how many counts you lose if a server crashes.',
			'Your design gives the storage for 100 million links and the peak reads per second.'
		],
		sample: [
			'Numbers first. 5 years is 157.7 million seconds, so 100 million links is 0.63 writes per second on average and about 6 at peak. Reads are 100 times that: 63 per second on average, **630 per second at peak**. One PostgreSQL primary with one read replica handles this.',
			'Storage: one row holds the code, the long URL, the owner, a created date and an active flag. Count about 500 bytes per row with the index. 100 million rows is about 50 GB, which fits on one disk.',
			'Codes are 7 random base62 characters. 62 to the power 7 is about 3.5 trillion codes. When the table holds 100 million links, a new random code hits a used one 0.003% of the time. The app inserts with `INSERT ... ON CONFLICT (code) DO NOTHING RETURNING code`. PostgreSQL returns only rows it actually inserted, so an empty result means a collision and the app draws a new code.',
			'Random codes cost one thing: two inserts can collide, so the insert needs that retry. A counter written in base62 never collides, but it lets anyone list every link by counting up from `aaaaaaa`.',
			'The redirect is a `302 Found` with the long URL in `Location`. RFC 9110 says "A 301 response is heuristically cacheable", so a browser may skip your server on the next click of a 301. With 302, a changed target or a switched off link applies on the very next click.',
			'The cost of 302: every click is a request to you, 630 per second at peak. Each app server keeps the 100 000 most opened codes in memory, about 30 MB at 300 bytes each, and asks the replica for the rest. A changed link is removed from those caches when its owner saves it.',
			'Click counts: each app server adds 1 to an in-memory counter per code. Once a minute it writes the totals to a `clicks` table and starts again. If a server crashes, the counts of its last minute are lost, which the brief allows.'
		]
	},
	quiz: [],
	recall: {
		q: 'How long are the codes in the sample, and how often does a new one collide with 100 million links stored?',
		a: '7 base62 characters, about 3.5 trillion codes. A new random code hits a used one 0.003% of the time, and the insert retries.'
	},
	sources: [
		{ title: 'RFC 9110, HTTP Semantics, 15.4 Redirection 3xx', url: 'https://www.rfc-editor.org/rfc/rfc9110#section-15.4' },
		{ title: 'PostgreSQL documentation, INSERT (ON CONFLICT and RETURNING)', url: 'https://www.postgresql.org/docs/current/sql-insert.html' }
	]
};
