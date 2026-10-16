/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'slos',
	part: 'Reliability',
	title: 'Measuring a service',
	minutes: 10,
	hook: [
		'Mia is on call for an online shop\'s checkout API. Last week her phone woke her three times for "CPU above 80%". Each time, customers were paying normally and she went back to bed.',
		'On Thursday, the payment provider changed a TLS certificate and 4% of checkouts failed for two hours. No alert fired, because the CPU was fine. Support heard it first, from customers.',
		'The team wants pages that fire when customers cannot pay, and only then. That means choosing what to measure, what number counts as good enough, and when a human must wake up.'
	],
	terms: [
		{ term: 'SLI', def: 'Service level indicator: a measured ratio, the number of good events divided by the total number of events.' },
		{ term: 'SLO', def: 'Service level objective: the target for an SLI over a time window, such as 99.9% of checkouts succeed over 30 days.' },
		{ term: 'Error budget', def: 'The failures the SLO allows in its window. At 99.9%, it is 0.1% of the requests.' },
		{ term: 'Burn rate', def: 'How fast the service spends its error budget. A burn rate of 1 spends exactly the whole budget in the 30-day window.' }
	],
	kata: {
		brief: [
			'The checkout API serves `POST /checkout`, which charges the card through a payment provider. It handles 5 checkouts per second on average, about 13 million in 30 days. At night it drops to 1 per second.',
			'The load balancer in front of it logs every request with its status code and its duration. A declined card returns `402`. A bug or a provider timeout returns `500` or `504`.',
			'Most checkouts take 600 ms. Product says a checkout that takes more than 2 seconds loses the customer about as often as an error does.',
			'Pick the SLIs and SLOs for this API, then design the alerts: which ones wake Mia up, and which ones wait for the morning.'
		],
		minutes: 10,
		checklist: [
			'Your design says where each SLI is measured: in the app, at the load balancer, or in the browser.',
			'Your design says which status codes count as bad, and what happens to a declined card.',
			'Your design has a latency SLI with a threshold in milliseconds, and not only an average.',
			'Your design gives each SLO a percentage and a time window.',
			'Your design says how many failed checkouts the error budget allows in that window.',
			'Your design says how many failed checkouts in one hour wake someone up, and how long a full outage takes to page.',
			'Your design says what replaces the CPU page, or why it stays.'
		],
		sample: [
			'Both SLIs come from the load balancer logs. The SRE Workbook uses the load balancer for its own example, because its metrics "provide SLIs that are closer to the user’s experience than those from the application server’s logs." When an app process crashes, the load balancer still logs a 5xx for the request, and the app writes nothing.',
			'The availability SLI is the share of `POST /checkout` requests that do not end in a 5xx. A `402` for a declined card counts as good: the API did its job. The SLO is 99.9% over 30 days. With 13 million checkouts, the error budget is 13 000 failed checkouts.',
			'The latency SLI is the share of `POST /checkout` answered in under 2 000 ms. The SLO is 99% over 30 days, so 130 000 checkouts may be slow. An average would hide the slow 1%; this ratio counts each of them.',
			'Pages use the Workbook\'s multiwindow burn-rate rules. The first page fires when the error ratio is above 14.4 × 0.1% = 1.44% over the last hour and over the last 5 minutes. At 5 per second, an hour holds 18 000 checkouts, so that is about 260 failures: 2% of the budget.',
			'The second page fires above 6 × 0.1% = 0.6% over 6 hours and over 30 minutes, which is 5% of the budget. A ticket, read in the morning, opens above 0.1% over 3 days and over 6 hours. The latency SLO gets the same three rules against its 1% budget.',
			'The Workbook gives the time to fire as (1 − SLO) / error ratio × window × burn rate. A full outage pages after 0.001 / 1 × 60 min × 14.4 ≈ 52 seconds. Thursday\'s 4% failure rate pages after 0.001 / 0.04 × 60 × 14.4 ≈ 22 minutes, after about 260 failed checkouts.',
			'The CPU page is deleted, and CPU stays as a graph on the dashboard. The cost: a slow memory leak, or a disk filling up, now pages only once it fails checkouts. At night, at 1 checkout per second, 52 failures in an hour reach 1.44%, so a short provider blip can still wake Mia up.'
		]
	},
	quiz: [],
	recall: {
		q: 'With a 99.9% SLO over 30 days, what error ratio over the last hour makes the first page fire, and how much of the budget is gone by then?',
		a: '14.4 × 0.1% = 1.44% over 1 hour (and over 5 minutes). It fires after 2% of the 30-day budget is spent, about 260 checkouts at 5 per second.'
	},
	sources: [
		{ title: 'Google SRE Workbook: Alerting on SLOs', url: 'https://sre.google/workbook/alerting-on-slos/' },
		{ title: 'Google SRE Workbook: Implementing SLOs', url: 'https://sre.google/workbook/implementing-slos/' }
	]
};
