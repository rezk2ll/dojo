/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'modular-monolith',
	part: 'Architecture',
	title: 'Splitting a monolith',
	minutes: 10,
	hook: [
		'An online shop runs on one Rails app of 300 000 lines. Four teams of 6 to 8 developers merge into it about 25 times a day. Last month, 18 merges from one team broke the tests of another.',
		'The Billing team changed how a refund rounds cents. The Orders team\'s order summary test failed the next morning, because the summary called the refund code directly. Nobody on Orders knew that call existed.',
		'The CTO asks for a plan. Someone says "microservices". Someone else says "fix the folders first". You have one quarter and you must name the first module to cut out.'
	],
	terms: [
		{ term: 'Modular monolith', def: 'One codebase and one deploy, with enforced boundaries between modules: a module calls another only through that module\'s public code.' },
		{ term: 'Packwerk', def: 'A Ruby gem from Shopify that groups files into packages and reports a violation when a package references a constant from a package it has not declared as a dependency.' },
		{ term: 'Inbound reference', def: 'A place in another module\'s code that uses a class of this module. Each one must change if this module moves out.' }
	],
	kata: {
		brief: [
			'A script counted the code by folder and the references between folders. Catalog: 80 000 lines, 1 400 inbound references, shares 9 of its 12 tables with other modules. Orders: 110 000 lines, 2 100 inbound references, shares 14 of 20 tables.',
			'Billing: 40 000 lines, 600 inbound references, shares 3 of its 8 tables. Notifications: 25 000 lines, 900 inbound references, owns no table and reads 11 tables of other modules. The remaining 45 000 lines are admin screens and shared helpers.',
			'Each of the 4 teams owns one of Catalog, Orders, Billing and Notifications. The full test suite takes 45 minutes on CI. The app is deployed 6 times a day.',
			'Decide which module is cut out first, what "cut out" means in the first quarter (its own folder, an enforced boundary, or its own service), and how the team stops new couplings while it removes the old ones.'
		],
		minutes: 10,
		checklist: [
			'Your design names one module to cut out first and gives the numbers that made you pick it.',
			'Your design says why the smallest module (Notifications, 25 000 lines) is or is not first.',
			'Your design says what happens to the tables that the module shares with other modules.',
			'Your design says which tool catches a new reference across the boundary, and at what step of a merge.',
			'Your design says what happens to the existing inbound references on day one, and how fast they go away.',
			'Your design says whether the module moves to a separate service this quarter, and what that adds or saves.'
		],
		sample: [
			'Billing goes first. One team owns it, it has the fewest inbound references (600), and it shares only 3 tables. Notifications is smaller, but it reads 11 tables of other modules. Cut out, it would need data from all three other teams on day one.',
			'In the first quarter, Billing stays in the same app and the same deploy. Shopify\'s 2019 post describes the same choice for its Rails monolith: "we would keep all of the code in one codebase, but ensure that boundaries were defined and respected between different components." A separate service would add a network call, its own pipeline and its own database before the boundary is even clean.',
			'Step one moves Billing\'s files into `components/billing`. Shopify did this move for about 6 000 classes "in one big bang PR built by automated scripts", and noted the cost: GitHub showed many moves as deletions and creations, so file history got harder to follow.',
			'Step two adds a Packwerk `package.yml` with `enforce_dependencies: true` to each module. `bin/packwerk update-todo` records the 600 existing violations in `package_todo.yml`. `bin/packwerk check` runs in CI and fails on any new one, so the count can only go down.',
			'Billing then publishes a small public API: charge, refund, and invoice for an order. Each week, the other teams replace direct calls with calls to that API. At 30 references a week, the 600 are gone in 20 weeks, a bit more than one quarter.',
			'The 3 shared tables move behind the API last: Orders reads refunds through Billing\'s code, and only Billing\'s code writes them. When `package_todo.yml` for Billing is empty and no other module touches its 8 tables, moving it to a separate service needs only a deploy change.',
			'What this design gives up: the 45-minute test suite and the shared deploy stay for now. Packwerk only sees constant references, and its README says "Method calls and objects passed around the application are completely ignored." Some coupling stays hidden until a test or a reviewer finds it.'
		]
	},
	quiz: [],
	recall: {
		q: 'Why does Billing go first and not Notifications, the smallest module?',
		a: 'Billing has the fewest inbound references (600) and shares 3 tables. Notifications reads 11 tables of other modules, so cutting it out first needs data from every other team.'
	},
	sources: [
		{ title: 'Shopify Engineering: Deconstructing the Monolith (2019)', url: 'https://shopify.engineering/deconstructing-monolith-designing-software-maximizes-developer-productivity' },
		{ title: 'Packwerk USAGE.md: enforcing dependencies and the package todo file', url: 'https://github.com/Shopify/packwerk/blob/31e534283f93a225b520cddab3c2d735557c76de/USAGE.md' },
		{ title: 'Packwerk README: Limitations', url: 'https://github.com/Shopify/packwerk/blob/31e534283f93a225b520cddab3c2d735557c76de/README.md#limitations' }
	]
};
