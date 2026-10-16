/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'file-sync',
	part: 'Data',
	title: 'File sync',
	minutes: 10,
	hook: [
		'Marc is a wedding photographer. He keeps one folder on his laptop and the same folder on his phone: client notes, contracts, and video clips up to 2 GB.',
		'On the train he edits `notes.md` on his phone with no signal. That evening, at home, he edits the same file on the laptop before the phone has synced.',
		'When both devices come back online, he expects to lose neither edit, and he does not want 2 GB resent over mobile data when he trims the end of a clip.'
	],
	terms: [
		{ term: 'Block', def: 'A fixed-size slice of a file, named by the hash of its bytes, so two devices can compare files block by block.' },
		{ term: 'Version vector', def: 'One counter per device on each file. A device adds 1 to its own counter each time it changes the file.' },
		{ term: 'Conflict copy', def: 'The second version of a file, kept under a new name when two edits cannot be ordered.' }
	],
	kata: {
		brief: [
			'One folder synced between a laptop and a phone: 30 GB in 8 000 files. Most files are under 5 MB; video clips go up to 2 GB.',
			'Either device can edit, create or delete files while offline, for days. The two devices are rarely online at the same time.',
			'The phone is often on mobile data at 10 Mbit/s. Sending a whole 2 GB file at that speed takes about 27 minutes.',
			'Every edit made on one device reaches the other, as the file itself or as a second copy. A sync that is cut halfway resumes where it stopped.'
		],
		minutes: 10,
		checklist: [
			'Your design says how much data moves when the last 3 MB of a 2 GB file change.',
			'Your design says how an upload of a 2 GB file that stopped at 60% resumes.',
			'Your design says how a device tells "the other side has a newer version" apart from "both sides edited".',
			'Your design says what the user sees after a conflict, and where each version is kept.',
			'Your design says what happens when one device deletes a file that the other edited offline.',
			'Your design says what each device stores to know what changed since the last sync.'
		],
		sample: [
			'Each device runs a sync client. A small server stores blocks and the folder index, so the laptop and the phone never need to be online together. Files are cut into blocks, and each block is named by its SHA-256 hash. Syncthing\'s protocol works the same way, with blocks "from 128 KiB (131072 bytes) to 16 MiB in size".',
			'Block size follows the Syncthing rule: "the smallest block size that results in fewer than 2000 blocks". A 2 GB file is 1.86 GiB, so it gets 1 MiB blocks, about 1 900 of them. Its block list is 1 900 hashes of 32 bytes, about 61 KB.',
			'Each device stores an index: for every file its name, size, modification time, version vector and block list. When a file\'s size or time changes, the client hashes it again and compares the new block list with the stored one. It asks the server which of the new hashes it lacks and uploads only those.',
			'Trimming the last 3 MB of a clip changes 3 or 4 blocks, about 4 MB, which takes 3 seconds at 10 Mbit/s. An upload stopped at 60% resumes the same way: the server already holds about 1 140 of the 1 900 blocks.',
			'Ordering edits: the laptop turns `{laptop: 4, phone: 2}` into `{laptop: 5, phone: 2}` when it saves. An incoming version replaces the local one only if each of its counters is greater than or equal to the local one. With `{laptop: 5, phone: 2}` on one side and `{laptop: 4, phone: 3}` on the other, neither replaces the other: that is a conflict.',
			'On a conflict both versions stay. One is renamed with Syncthing\'s pattern, `<filename>.sync-conflict-<date>-<time>-<modifiedBy>.<ext>`. In Syncthing, "The file with the older modification time" gets the new name. Marc sees `notes.md` and `notes.sync-conflict-20261017-183000-PHONE.md` side by side and merges them by hand.',
			'An edit beats a delete: if the phone deleted `contract.pdf` while the laptop edited it, the file comes back on the phone. Syncthing\'s docs describe another rule: when the deletion wins, the edited file is renamed to a conflict copy.',
			'Fixed-size blocks have one cost. Inserting one byte at the start of a 2 GB file shifts every block, so all 1 900 blocks get new hashes and the whole file is sent again. Conflicts also need Marc: the design never merges text on its own.'
		]
	},
	quiz: [],
	recall: {
		q: 'In the sample, how does a device decide that two edits of the same file are a conflict?',
		a: 'It compares version vectors. When each side has a counter higher than the other, like `{laptop: 5, phone: 2}` against `{laptop: 4, phone: 3}`, neither replaces the other and one copy is renamed `.sync-conflict-`.'
	},
	sources: [
		{ title: 'Syncthing, Block Exchange Protocol v1 (blocks and version vectors)', url: 'https://github.com/syncthing/docs/blob/25904513a60a95e0f9a61e52d3abc0a77ab7fea9/specs/bep-v1.rst#L18-L21' },
		{ title: 'Syncthing, Block Exchange Protocol v1, Selection of Block Size', url: 'https://github.com/syncthing/docs/blob/25904513a60a95e0f9a61e52d3abc0a77ab7fea9/specs/bep-v1.rst#L825-L845' },
		{ title: 'Syncthing docs, Conflicting Changes', url: 'https://github.com/syncthing/docs/blob/25904513a60a95e0f9a61e52d3abc0a77ab7fea9/users/syncing.rst#L84-L95' }
	]
};
