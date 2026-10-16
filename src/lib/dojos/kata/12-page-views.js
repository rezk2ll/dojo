/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'page-views',
	part: 'Data',
	title: 'Counting page views',
	minutes: 10,
	hook: [
		'A recipe site shows each author a dashboard: how many people opened each of their recipes, hour by hour. Nadia posts a soup recipe at 9 a.m. and refreshes the dashboard at 9:05 to see if anyone came.',
		'Each page load sends one small request to the site: "page 48213 was viewed". On a Sunday evening that is 20 000 requests per second.',
		'The first version ran `UPDATE pages SET views = views + 1` for each request. Every view of a popular page waited for the same row lock.'
	],
	terms: [
		{ term: 'Upsert', def: 'One statement that inserts a row, or updates it if a row with the same key already exists.' },
		{ term: 'Pre-aggregation', def: 'Adding up counts in memory on the app server and writing the sums, instead of writing each event.' },
		{ term: 'Flush', def: 'The moment an app server writes the counts it holds in memory to the database and starts again from zero.' }
	],
	kata: {
		brief: [
			'20 000 page views per second at peak, received by 8 app servers behind a load balancer. The site has 500 000 pages.',
			'In any 30 seconds, at most 15 000 different pages get a view. In an hour, about 40 000 different pages do.',
			'The dashboard shows views per page per hour, and may lag 1 minute behind. Hourly counts are kept for 2 years. A few lost views are acceptable; a count that is double or wildly off is not.'
		],
		minutes: 10,
		checklist: [
			'Your design says how many database writes per second it sends for 20 000 views per second.',
			'Your design says what happens to the counts held by an app server that crashes.',
			'Your design says what happens if a write to the database times out and is retried.',
			'Your design gives the storage for 2 years of hourly counts.',
			'Your design says which query the dashboard runs, and which index serves it.',
			'Your design says how a view at 9:59:58 ends up in the 9 a.m. hour.'
		],
		sample: [
			'Each app server keeps a map in memory: key `(page_id, hour)`, value a count. A view only does `count += 1` in that map. The hour comes from the time the server received the view, so a view at 9:59:58 goes into the 9:00 key.',
			'Every 30 seconds the server swaps in an empty map and writes the old one to PostgreSQL. It sends batches of 1 000 rows: `INSERT INTO page_views (page_id, hour, views) VALUES ... ON CONFLICT (page_id, hour) DO UPDATE SET views = page_views.views + EXCLUDED.views`. The PostgreSQL docs say this form "guarantees an atomic INSERT or UPDATE outcome", "even under high concurrency".',
			'The map already holds one row per key, so a batch never names the same key twice. PostgreSQL raises "a cardinality violation error" if one statement would update the same row twice.',
			'Load: one server sees at most 15 000 different pages in 30 seconds. 8 servers send at most 120 000 rows per 30 seconds, which is 120 batches, or 4 statements per second. The first version sent 20 000 updates per second.',
			'Storage: about 40 000 rows per hour, so 350 million rows a year. The PostgreSQL docs give each row a 23-byte header, a 4-byte item pointer, and here 24 bytes of columns. About 51 bytes per row gives 18 GB a year and 36 GB for 2 years, before the index on `(page_id, hour)`.',
			'The dashboard runs `SELECT hour, views FROM page_views WHERE page_id = $1 AND hour >= $2 ORDER BY hour`. The primary key `(page_id, hour)` serves it. A view is in the database at most 30 seconds after it happened, inside the 1 minute allowed.',
			'The cost is in the failure cases. A crashed server loses up to 30 seconds of its views: at 2 500 views per second per server, about 75 000 views. A batch that times out after PostgreSQL committed it, then gets retried, counts those views twice.',
			'To stop double counts, each batch carries a random batch id. The same transaction inserts that id into a `flushed_batches` table with a unique key, so a retried batch fails on the unique key and adds nothing.'
		]
	},
	quiz: [],
	recall: {
		q: 'In the sample, how many database statements per second carry the 20 000 views per second, and why?',
		a: 'About 4. Each of the 8 servers sums views per `(page_id, hour)` in memory and flushes every 30 seconds: at most 120 000 rows per 30 seconds, sent in batches of 1 000 rows.'
	},
	sources: [
		{ title: 'PostgreSQL docs, INSERT and ON CONFLICT DO UPDATE', url: 'https://www.postgresql.org/docs/current/sql-insert.html' },
		{ title: 'PostgreSQL docs, Database Page Layout (row header size)', url: 'https://www.postgresql.org/docs/current/storage-page-layout.html' }
	]
};
