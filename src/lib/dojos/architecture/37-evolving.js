const GITLAB = 'https://github.com/gitlabhq/gitlabhq/blob/beea9497b60c127a5219ef142d0320918c6b20d5';
const HELPERS = `${GITLAB}/lib/gitlab/database/migration_helpers.rb`;
const TRIGGER = `${GITLAB}/lib/gitlab/database/unidirectional_copy_trigger.rb`;
const DOWNTIME = `${GITLAB}/doc/development/database/avoiding_downtime_in_migrations.md`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'evolving',
	part: "The architect's job",
	title: 'Evolving a live system without stopping it',
	minutes: 10,
	hook: [
		'Your online shop runs on a ten-year-old monolith. You want a new checkout service, and a cleaner name for a database column while you are at it. Customers buy things every minute. **You cannot stop the system to rebuild it.**',
		'The tempting plan is a big rewrite, then one switch-over day. Martin Fowler on that plan: "we\'ve seen this simple-sounding plan go down in flames most of the time."',
		'The alternative is the **strangler fig**. Grow the new thing next to the old one and move behavior over **one small piece at a time**. Delete the old part when nothing reaches it any more. Today: one piece is one route in your shop, and one column in GitLab\'s database.'
	],
	terms: [
		{ term: 'Strangler fig', def: 'Replace a system gradually: new code grows around the old, takes over piece by piece, the old part dies when unused (Fowler).' },
		{ term: 'Seam', def: 'The one place that decides "old or new" for a request or a piece of data. You need it before you can move anything.' },
		{ term: 'Transitional architecture', def: 'Code that lets old and new run side by side, and that you plan to delete. Fowler: "code that will go away once the modernization is complete".' },
		{ term: 'Post-deployment migration', def: 'In GitLab, a database migration kept in `db/post_migrate` so it can run after the new code is deployed, not before.' },
		{ term: 'Point of no return', def: 'The step after which you roll forward, not back. Good migrations make it one small step, as late as possible.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['req(["Shop request"]) --> proxy["Routing seam: reverse proxy"]', 'proxy -->|/checkout| newc["New checkout service"]', 'proxy -->|everything else| legacy["Old monolith"]'],
				highlight: ['req', 'proxy', 'newc', 'legacy'],
				note: 'The seam for behavior: one proxy rule sends `/checkout` to the new service, everything else to the monolith. Customers see one shop. Moving the next route is **one more rule**.'
			},
			{
				add: ['oldcol["Column updated_at"] -->|trigger copies on every write| newcol["Column updated_at_timestamp"]'],
				highlight: ['oldcol', 'newcol'],
				note: 'Data needs a seam too. GitLab renames a column without downtime by adding the new column next to the old one. A **database trigger** copies the old value into the new column on every insert and update.'
			},
			{
				add: ['code["New release: uses the new name"] --> newcol'],
				highlight: ['code'],
				note: 'The new release reads the new name and tells Rails to ignore the old column. Both columns still exist, so the change so far is cheap to undo.'
			},
			{
				add: ['cleanup["Post-deploy: drop trigger and old column"] -.->|drops| oldcol'],
				highlight: ['cleanup'],
				note: 'Only after the new code is live does a **post-deployment migration** remove the trigger and the old column. The transitional code is deleted with it.'
			},
			{
				add: [],
				highlight: ['cleanup'],
				note: 'The drop is the **point of no return**. GitLab\'s guide calls dropping a column "a destructive operation that can\'t be rolled back easily". So it is one step, and it comes last.'
			}
		]
	},
	example: {
		title: 'lib/gitlab/database/migration_helpers.rb',
		repo: 'gitlabhq/gitlabhq',
		url: `${HELPERS}#L226-L390`,
		lang: 'ruby',
		code: `      # Renames a column without requiring downtime.
      #
      # Concurrent renames work by using database triggers to ensure both the
      # old and new column are in sync. However, this method will _not_ remove
      # the triggers or the old column automatically; this needs to be done
      # manually in a post-deployment migration. This can be done using the
      # method \`cleanup_concurrent_column_rename\`.
…
      def rename_column_concurrently(table, old, new, type: nil, type_cast_function: nil, batch_column_name: :id)
…
        check_trigger_permissions!(table)

        create_column_from(table, old, new, type: type, batch_column_name: batch_column_name, type_cast_function: type_cast_function)

        install_rename_triggers(table, old, new)
      end
…
      def cleanup_concurrent_column_rename(table, old, new)
        trigger_name = rename_trigger_name(table, old, new)

        check_trigger_permissions!(table)

        remove_rename_triggers(table, trigger_name)

        remove_column(table, old)
      end`,
		notes: [
			`\`create_column_from\` [adds the new column](${HELPERS}#L757-L792), copies the existing values over in batches, then copies indexes, foreign keys and check constraints. The new column is a full copy before any code uses it.`,
			`The trigger is [one-way](${TRIGGER}#L43-L49): \`BEFORE INSERT OR UPDATE\`, it [sets the new column from the old one](${TRIGGER}#L94-L98). This is **transitional architecture**: it exists only for the length of the migration.`,
			'The two methods are split on purpose. The first runs before the deploy, the cleanup runs after it. Until the cleanup, `undo_rename_column_concurrently` just removes the trigger and the new column.',
			`The cleanup removes the trigger, then **removes the old column**. That last line is the point of no return. The [guide](${DOWNTIME}#L216-L345) asks you to think hard about the time between the two migrations on large tables.`
		]
	},
	tradeoff: {
		gain: [
			'The system stays shippable every day. Each move is small, and so is its risk.',
			'Rollback is per route or per column, not "restore last month\'s system".',
			'New features land in the new code from day one, so the old code stops growing.'
		],
		cost: [
			'Two generations run side by side for a long time. Both need fixing, both need understanding.',
			'The seam is hidden coupling: one proxy rule or one trigger quietly changes who answers.',
			'Transitional code is extra work, and the half-done state can quietly become permanent.'
		]
	},
	task: {
		prompt: 'You rename `users.updated_at` to `updated_at_timestamp` with GitLab\'s helpers. The post-deployment cleanup has run. Then the new release shows a bad bug, and someone wants to redeploy the previous release, which still reads `updated_at`. What breaks? How would you go back?',
		hint: `Read \`cleanup_concurrent_column_rename\` and the method right after it, \`undo_cleanup_concurrent_column_rename\` ([lines 382-420](${HELPERS}#L382-L420)).`,
		answer: [
			'**The old release breaks.** Its code asks for `updated_at`, and the cleanup dropped that column.',
			'Going back is **not an undo**. `undo_cleanup_concurrent_column_rename` creates `updated_at` again, copies the values from `updated_at_timestamp`, and reinstalls the trigger. It is a new copy, and on a big table it takes time.',
			'So the order is: run that undo migration first, then redeploy the old code. Never the other way round.',
			'Often the better move is to **fix forward**: patch the bug in the new release, and leave the schema alone.',
			'The design lesson: keep the point of no return **one small step, as late as possible**. GitLab puts the drop after the deploy for exactly this reason.'
		]
	},
	quiz: [
		{
			q: 'In a strangler fig migration, what is the **seam**?',
			options: ['The day you switch every user from the old system to the new one, all at once', 'The test suite that compares the old and new systems on the same requests', 'The one place that decides, per request or piece of data, if old or new code handles it', 'The database both systems share, so each one always sees the same data'],
			answer: 2,
			why: 'Without a seam you cannot move one piece at a time. With one, moving a route or a column is a small, reversible change.'
		},
		{
			q: 'GitLab renames a column without downtime. Which step is the **point of no return**?',
			options: ['Adding the new column and copying the data', 'The post-deployment cleanup that drops the old column', 'Installing the trigger that copies old into new', 'Deploying code that reads the new name'],
			answer: 1,
			why: 'Until the drop, both columns exist and the undo just removes the new one. After it, going back means recreating and recopying the old column.'
		},
		{
			q: 'What is the trigger from `rename_column_concurrently`, architecturally?',
			options: ['Transitional architecture: it keeps old and new working side by side until the move is done', 'A permanent part of the schema that keeps both column names valid for good', 'A security check that blocks writes to the old column during the rename', 'A cache that serves the new column\'s values while the batch copy is running'],
			answer: 0,
			why: 'It lives only between the two migrations. `cleanup_concurrent_column_rename` removes it together with the old column.'
		}
	],
	takeaway: 'Never switch everything at once. Find the seam, move one piece at a time, and keep the point of no return small and late.',
	sources: [
		{ title: 'Martin Fowler, Strangler Fig (2024)', url: 'https://martinfowler.com/bliki/StranglerFigApplication.html' },
		{ title: 'Cartwright, Horn, Lewis, Patterns of Legacy Displacement', url: 'https://martinfowler.com/articles/patterns-legacy-displacement/' },
		{ title: 'GitLab docs, Avoiding downtime in migrations: renaming columns', url: `${DOWNTIME}#L216-L345` },
		{ title: 'GitLab, rename_column_concurrently and cleanup_concurrent_column_rename', url: `${HELPERS}#L226-L420` },
		{ title: 'GitLab, UnidirectionalCopyTrigger', url: `${TRIGGER}#L16-L50` }
	]
};
