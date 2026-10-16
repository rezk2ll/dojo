/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'feature-flags',
	part: 'Small services',
	title: 'Feature flags',
	minutes: 10,
	hook: [
		'Friday, 4 p.m. A team ships a new checkout page behind an `if`. They want 10% of users to see it first, plus the 40 people of the support team.',
		'At 4:20 the error rate on the new page climbs. The team wants it off now. A deploy to 200 servers takes 25 minutes, and every one of those minutes loses orders.',
		'A feature flag service lets them change that `if` from an admin screen. You design that service, with at most 30 seconds between the click and the last server using the new rule.'
	],
	terms: [
		{ term: 'Feature flag', def: 'A named switch the code reads at run time, like `new-checkout`, whose rules live outside the code.' },
		{ term: 'Gradual rollout', def: 'A rule that turns a flag on for a percentage of users, chosen by a hash of the user id.' },
		{ term: 'Stickiness', def: 'The same user gets the same answer for a flag on every request and on every server.' },
		{ term: 'Refresh interval', def: 'How often each server fetches the flag rules from the flag service.' }
	],
	kata: {
		brief: [
			'A shop runs its backend on 200 servers. Product teams own 300 flags. Each flag has rules: on or off, on for a list of user ids, or on for a percentage of users.',
			'All 300 flags with their rules fit in 120 KB of JSON. The shop has 3 million users. Admins change about 20 flags a day, and the busiest flag check runs on every page view.',
			'A change in the admin screen must reach all 200 servers in under 30 seconds. A user inside the 10% must stay inside it on every request and every server.',
			'The flag service may go down. The shop must keep selling while it is down.'
		],
		minutes: 10,
		checklist: [
			'Your design says where a flag is evaluated: in the server’s own memory, or by a network call on each page view.',
			'Your design gives the longest time between a click on save and the moment the last of the 200 servers uses the new rule.',
			'Your design says how one user lands inside or outside the 10% the same way on every server.',
			'Your design says what happens to users already inside the rollout when an admin raises it from 10% to 25%.',
			'Your design counts the requests per second that reach the flag service from the 200 servers.',
			'Your design says what a server does when the flag service is down, both while running and when it starts.'
		],
		sample: [
			'Each server keeps the whole 120 KB rule set in memory and evaluates flags locally. A page view never waits on the network for a flag. Unleash backend SDKs work the same way: the SDK "serves flag values from memory, without making additional requests".',
			'Each server asks the flag service for the rules every 15 seconds, the default refresh interval of the Unleash backend SDKs. A save at second 0 that lands just after a poll reaches that server at second 15, plus one request time. The worst case stays under the 30 second limit, with 15 seconds to spare for a slow poll.',
			'200 servers polling every 15 seconds send about 13 requests per second. The server sends the version it holds in `If-None-Match`. When nothing changed, the flag service answers `304 Not Modified` with no body. After a change, each server downloads 120 KB once: 24 MB in total.',
			'For a percentage, the server hashes the flag name with the user id into a number from 1 to 100. The flag is on when the number is at most the percentage. Unleash hashes into a number between 0 and 100 with MurmurHash, and its docs add: "Increasing the percentage keeps existing users in the rollout and adds new ones." So at 10%, about 300 000 of the 3 million users see the new page, and raising to 25% keeps them in.',
			'The user list stays small: 40 support ids take under 1 KB. A list of 500 000 ids would add several MB to every download, so for groups that large the rule should use a user attribute, like `plan = beta`.',
			'When the flag service is down, servers keep the last rules they hold. Each server also writes the rules to a local file after each download, so a server that restarts during the outage starts with them. A brand new server with no file uses the default written in the code, which is off.',
			'The cost of polling is a window of up to 15 seconds where servers disagree. A user whose two requests hit two servers can see the new checkout, then the old one. Pushing changes over a held connection would shrink that window, but the flag service would then hold 200 open connections and must resend the state when one drops.'
		],
	},
	quiz: [],
	recall: {
		q: 'In the sample, how often does each server fetch the flags, and how many requests per second does the flag service get?',
		a: 'Every 15 seconds, so the 200 servers send about 13 requests per second, and most get a 304 with no body.'
	},
	sources: [
		{ title: 'Unleash docs: Stickiness', url: 'https://docs.getunleash.io/concepts/stickiness' },
		{ title: 'Unleash docs: SDK overview (default refresh intervals)', url: 'https://docs.getunleash.io/sdks' },
		{ title: 'MDN: If-None-Match', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/If-None-Match' }
	]
};
