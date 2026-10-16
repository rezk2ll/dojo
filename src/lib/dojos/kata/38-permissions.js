/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'permissions',
	part: 'Architecture',
	title: 'A permissions system',
	minutes: 10,
	hook: [
		'Lina is a designer at a company that uses a project tool. She is in the team "Brand", which is inside the team "Marketing". Marketing can edit the project "Spring launch". Lina opens a file in that project and clicks Edit.',
		'Before the editor opens, the tool has to answer one question: can Lina edit this file? The answer depends on the file, its project, two nested teams and her company’s admin list.',
		'Every API call asks that question, often several times. If one answer takes 20 ms, a page that lists 50 files takes a second just for permissions.'
	],
	terms: [
		{ term: 'Relation tuple', def: 'One stored fact of the form object, relation, user, like `project:p1#editor@team:t1#member` (members of team t1 are editors of p1).' },
		{ term: 'Check', def: 'The question "does user U have relation R on object O?", answered by following tuples from O to U.' },
		{ term: 'Flattened membership', def: 'For each user, the precomputed list of every team they belong to, directly or through nested teams.' },
		{ term: 'New enemy problem', def: 'A user removed from a team still gets access because a server checked against data from before the removal.' }
	],
	kata: {
		brief: [
			'The tool has 4 000 organisations, 200 000 users, 400 000 projects and 30 million files. Teams can contain teams, up to 4 levels deep.',
			'An organisation admin can edit everything in the organisation. A project grants editor or viewer to users or teams. A file inherits from its project, and can also be shared with one user directly.',
			'The API makes 3 000 permission checks per second at peak. Each check must answer in under 5 ms. One indexed PostgreSQL lookup takes about 1 ms here.',
			'Design how you store permissions, how a check is answered, and how fast a removal takes effect.'
		],
		minutes: 10,
		checklist: [
			'Your design writes down the rule for "can edit a file" as a chain: file, project, team, user, organisation.',
			'Your design counts the lookups in the slowest check, nested teams included, and that count fits in 5 ms.',
			'Your design gives the size of the permission data, worked out from 30 million files.',
			'Your design says whether a check reads that data from a database or from memory.',
			'Your design says how long after Lina leaves the team "Brand" every server refuses her an edit.',
			'Your design says what a server does right after a restart, before it has loaded the data.'
		],
		sample: [
			'Store permissions as relation tuples, the format of Google’s Zanzibar paper: `file:f1#parent@project:p1`, `project:p1#editor@team:t1#member`, `team:t1#member@team:t2#member`, `team:t2#member@user:lina`. A user can edit a file when they are a direct editor, an editor of its parent project, or an admin of the project’s organisation. The OpenFGA docs model the middle rule with folders: an editor of a `parent` folder is an editor of each document in it.',
			'The tuple count is mostly files: 30 million parent tuples, plus a few million for grants, memberships and direct shares, about 34 million in all. At 64 bytes each with an index, that is about 2.2 GB, small enough to hold in memory.',
			'Walking tuples in PostgreSQL is too slow. The slowest check reads the file, the project grants, up to 4 levels of teams, and the organisation admins: 7 lookups at 1 ms is 7 ms. So each of 3 permission servers loads all tuples into memory at start and follows them there.',
			'Nested teams cost the most hops. As Zanzibar does with its Leopard index, keep a flattened membership: for Lina, the set {Brand, Marketing}. The check then asks three things: is the file shared with Lina, does the project’s editor list share a team with her set, is she an admin of the organisation? With the file’s parent, it needs 4 lookups in memory and no database call.',
			'Writes go to a PostgreSQL `tuples` table, each with an increasing `seq` number. The permission servers read new rows every 100 ms and update their memory, including the flattened sets of everyone under a changed team. A removal reaches all 3 servers in about a second.',
			'During that second, a server may still let Lina edit. The Zanzibar paper calls this the "new enemy" problem and handles it with a token called a zookie. Here the write returns its `seq`, and the app can pass `at_least_seq` on the next check. A server that has not applied that `seq` yet waits for it before it answers.',
			'The cost: every permission server holds 2.2 GB and must load 34 million rows before it can answer, so a restarted server stays out of the load balancer until it has loaded them. Moving one large team under another also rewrites the flattened set of each of its members.'
		]
	},
	quiz: [],
	recall: {
		q: 'Why does the sample keep the tuples in memory, and what does it keep for nested teams?',
		a: 'The slowest check needs 7 lookups, which is 7 ms at 1 ms per PostgreSQL lookup. In memory, with a flattened set of teams for each user, a check is 4 lookups and no database call.'
	},
	sources: [
		{ title: 'Pang et al., Zanzibar: Google’s Consistent, Global Authorization System (USENIX ATC 2019)', url: 'https://www.usenix.org/system/files/atc19-pang.pdf' },
		{ title: 'OpenFGA, Parent-Child Objects', url: 'https://openfga.dev/docs/modeling/parent-child' }
	]
};
