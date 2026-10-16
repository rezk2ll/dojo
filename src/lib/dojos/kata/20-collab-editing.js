/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'collab-editing',
	part: 'Real time',
	title: 'Shared document editing',
	minutes: 10,
	hook: [
		'Five people write the notes of a planning meeting in one shared document. Lea types the decisions in section 2 while Omar fixes a date in the paragraph just above. Two others add action items at the bottom.',
		'At 14:32 Omar’s Wi-Fi drops for 20 seconds. He keeps typing. When it comes back, his date fix and Lea’s decisions must both be in the document, in the right places, on all five screens.',
		'You design the server side of that editor, and the rule that decides whose change goes first.'
	],
	terms: [
		{ term: 'Step', def: 'One small change to the document, such as "insert 2026-11-03 at position 412". A client sends steps in batches.' },
		{ term: 'Version', def: 'An integer: the number of steps the server has accepted for a document. Each accepted step adds 1.' },
		{ term: 'Central authority', def: 'The one process that decides, for one document, the order in which steps are applied.' },
		{ term: 'Rebase', def: 'Rewriting your own unsent steps so they apply on top of steps other people had accepted first.' }
	],
	kata: {
		brief: [
			'A company of 6 000 people uses the editor. At the afternoon peak, 3 000 documents are open for editing, each by 2 to 10 people, and 2 500 people are typing at the same moment.',
			'A typing client sends one batch of steps every 500 ms. A batch is about 200 bytes. On a working day the service receives 40 million batches, and steps are kept for 30 days.',
			'A typed character must appear on the other screens within 1 second. No accepted text may be lost, even when a server crashes. A client that goes offline for a minute must be able to send what it typed when it comes back.',
			'You have 4 collaboration servers and one PostgreSQL primary. Your load tests show the primary takes 10 000 single row inserts per second.'
		],
		minutes: 10,
		checklist: [
			'Your design says which single process decides the order of steps for document 7781.',
			'Your design says what happens when Lea and Omar both send a batch based on version 120.',
			'Your design says where an accepted batch is stored before any other client is told about it.',
			'Your design says what Omar’s client does with its 20 seconds of offline typing when the Wi-Fi comes back.',
			'Your design says what a client receives when it reconnects at version 120 and the document is at version 160.',
			'Your design gives the batches per second at peak and compares them with 10 000 inserts per second.',
			'Your design says how a new owner of document 7781 rebuilds it after its server crashes.'
		],
		sample: [
			'Each document has one central authority. Requests for document 7781 go to the collaboration server picked by a hash of `7781` over the 4 servers. That server holds the document, its version and its recent steps in memory. The ProseMirror collab guide describes the same model: the authority accepts changes from one editor, broadcasts them, and the others rebase.',
			'A client sends `(version, steps, client_id)`. The authority accepts the batch only if `version` equals its current version. Lea and Omar both send version 120: Lea’s batch arrives first and moves the document to 123. Omar’s batch says 120, so the authority refuses it. Omar’s client fetches steps 121 to 123, rebases its own steps on top of them, and sends again with version 123.',
			'Before the authority broadcasts a batch, it inserts it into PostgreSQL as one row: `batches(doc_id, base_version, client_id, steps)` with primary key `(doc_id, base_version)`. Only then does it tell the clients. If two servers both believe they own 7781 after a network split, the second insert with base version 123 hits the primary key and fails, so only one order of steps can exist.',
			'Omar’s 20 seconds offline are unconfirmed steps that his client keeps. When the Wi-Fi returns, his client asks for every step after its version and gets them from the authority’s memory or from PostgreSQL. It rebases its local steps and sends them. Nothing is lost, because a step leaves the client’s unconfirmed list only when the client sees it come back from the authority.',
			'Numbers at peak: 2 500 typing clients at 2 batches per second is 5 000 inserts per second, half of the 10 000 the primary takes, and 1 250 batches per server. Storage: 40 million batches of 200 bytes is 8 GB a day, 240 GB for 30 days. Every 1 000 steps the authority writes a full snapshot of the document, so a new owner after a crash loads the last snapshot and replays at most 999 steps.',
			'The cost of one authority per document: every batch makes a round trip to one server before other clients see it. With 10 people typing at once, many batches arrive at an old version and are refused, so a client may rebase and resend several times. The ProseMirror author chose this central model because it is "relatively easy to implement and to reason about", and he notes that it does not guarantee that applying changes in a different order gives the same document.'
		]
	},
	quiz: [],
	recall: {
		q: 'In the sample, what does the authority do with Omar’s batch based on version 120 when the document is already at 123?',
		a: 'It refuses it. Omar’s client fetches steps 121 to 123, rebases its own steps on them, and resends with version 123.'
	},
	sources: [
		{ title: 'ProseMirror guide: Collaborative editing', url: 'https://github.com/ProseMirror/website/blob/a16b4ece45f135e5f001ab59d25f2d43c25974e1/markdown/guide/collab.md' },
		{ title: 'Marijn Haverbeke: Collaborative Editing in ProseMirror', url: 'https://marijnhaverbeke.nl/blog/collaborative-editing.html' }
	]
};
