/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'offline-mobile',
	part: 'Architecture',
	title: 'An offline-first mobile app',
	minutes: 10,
	hook: [
		'Karim inspects valves for a water company. Most valves sit in pits by country roads, and half of them have no phone signal. He drives back to the depot on Friday.',
		'On Tuesday, in a pit with no signal, he marks valve V-2291 as "stuck closed" and takes 5 photos. The same morning, at the office, a planner changes the same valve’s next inspection date.',
		'The app has to let Karim work all week without a network, keep his photos safe, and merge both edits to V-2291 when his tablet comes back online.'
	],
	terms: [
		{ term: 'Offline-first', def: 'The app reads and writes a local database on the device, and syncs with the server whenever a network is there.' },
		{ term: 'Revision', def: 'In CouchDB and PouchDB, one saved version of a document, named like `2-c1592ce7...`, where the number counts edits since the first one.' },
		{ term: 'Conflict', def: 'Two revisions made from the same parent revision on two devices, which sync then puts side by side under one document id.' }
	],
	kata: {
		brief: [
			'300 inspectors each carry a tablet. Each covers one region of about 2 000 valves. A valve record is about 4 KB. An inspector may be offline for up to 5 days.',
			'Each inspector does about 8 inspections a day. An inspection is a form of about 4 KB and 5 photos of 2 MB each.',
			'Office planners edit valve records at the same time: next inspection date, priority, notes. Inspectors edit the status and the notes.',
			'Design where the data lives on the tablet, how it syncs, what happens to photos, and how two edits to the same valve are merged.'
		],
		minutes: 10,
		checklist: [
			'Your design says what the tablet stores, with a size in MB for 5 offline days.',
			'Your design says which records can never conflict, and why.',
			'Your design says what the app does when the network drops in the middle of a sync.',
			'Your design says how a photo is sent, and what stops the server from storing it twice after a retry.',
			'Your design says who merges two edits to the same valve, and when.',
			'Your design says what happens when Karim and a planner both changed the notes of V-2291.'
		],
		sample: [
			'Run the app in the tablet’s browser with PouchDB, which stores data on the device, and sync it with CouchDB on the server. Give each region its own CouchDB database, so a tablet holds 2 000 × 4 KB = 8 MB of valves. Start sync with `localDB.sync(remoteDB, { live: true, retry: true })`: the PouchDB guide says `retry` keeps retrying until the connection is back.',
			'Each inspection is a new document with an id made on the tablet, and nobody edits it after it is saved. Two tablets never write the same id, so inspections never conflict: the PouchDB guide calls this "every doc is a delta". Five days is 40 inspections, 160 KB of forms.',
			'Photos stay out of the database: 40 × 5 × 2 MB = 400 MB, too much to push through each sync. The tablet saves each photo as a file with an id made on the device, and the inspection lists those ids. An upload queue sends photos when the tablet is on the depot Wi-Fi, and the server stores one file per photo id, so a retried upload replaces itself.',
			'Valve records do conflict. When Karim’s tablet syncs, CouchDB keeps both revisions of V-2291. It picks a winner with a deterministic algorithm, so every device sees the same one, and lists the other in `_conflicts`.',
			'A server job looks for documents with `_conflicts` every minute, with the Mango query shown in the CouchDB docs. For each one, it merges field by field: the status from Karim, the inspection date from the planner. Then it writes the merged revision and deletes the losing one in one `_bulk_docs` call, the algorithm the CouchDB docs suggest.',
			'When both sides changed the same field, as with the notes, the job keeps both texts one after the other and flags the valve for a planner to read. It does not choose by device clock, since Karim’s tablet clock may be wrong.',
			'The cost: until the job runs, every device shows the arbitrary winner, which may hide Karim’s "stuck closed" for up to a minute. One database per region also means an inspector who changes region downloads a whole new database.'
		]
	},
	quiz: [],
	recall: {
		q: 'Why do inspections never conflict in this design, and what does CouchDB do with two edits to the same valve?',
		a: 'Each inspection is a new document with an id made on the tablet, never edited. For a valve, CouchDB keeps both revisions, picks the same winner on every device and lists the other in `_conflicts` until a job merges them.'
	},
	sources: [
		{ title: 'CouchDB, Replication and conflict model', url: 'https://docs.couchdb.org/en/stable/replication/conflicts.html' },
		{ title: 'PouchDB, Replication guide', url: 'https://pouchdb.com/guides/replication.html' },
		{ title: 'PouchDB, Conflicts guide', url: 'https://pouchdb.com/guides/conflicts.html' }
	]
};
