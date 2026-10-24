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
		'Fowler names the alternative the **strangler fig**: you build the new code next to the old and move behavior over one small piece at a time. You delete an old part when no request reaches it any more. Here one piece is one route in your shop, and one column in GitLab\'s database.'
	],
	terms: [
		{ term: 'Strangler fig', def: 'Replace a system gradually: new code grows around the old, takes over piece by piece, and you delete each old part when nothing uses it (Fowler).' },
		{ term: 'Seam', def: 'The one place that decides "old or new" for a request or a piece of data. You need it before you can move anything.' },
		{ term: 'Transitional architecture', def: 'Code that lets old and new run side by side, and that you plan to delete. Fowler: "code that will go away once the modernization is complete".' },
		{ term: 'Point of no return', def: 'The step after which you can only fix forward, because rolling back needs a new migration. Good migrations make it one small step, as late as possible.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['req(["Shop request"]) --> proxy["Routing seam: reverse proxy"]', 'proxy -->|/checkout| newc["New checkout service"]', 'proxy -->|everything else| legacy["Old monolith"]'],
				highlight: ['req', 'proxy', 'newc', 'legacy'],
				note: 'The seam for behavior: one proxy rule sends `/checkout` to the new service, everything else to the monolith. Customers see one shop. To move the next route, you add **one more rule** to the proxy.'
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
				note: 'GitLab keeps some migrations in `db/post_migrate`, and they run after the new code is deployed. Once the new code is live, one of these **post-deployment migrations** removes the trigger and the old column.'
			},
			{
				add: [],
				highlight: ['cleanup'],
				note: 'Dropping the old column is the **point of no return**. GitLab\'s guide calls dropping a column "a destructive operation that can\'t be rolled back easily". So the drop is a single step, and it runs last.'
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
			`Line 13: \`create_column_from\` [adds the new column](${HELPERS}#L757-L792), copies the existing values over in batches, then copies indexes, foreign keys and check constraints. The new column is a full copy before any code uses it.`,
			`Line 15 installs a [one-way](${TRIGGER}#L43-L49) \`BEFORE INSERT OR UPDATE\` trigger that sets the new column from the old one. This trigger is **transitional architecture**: it exists only for the length of the migration.`,
			'Lines 9 and 18 are two separate methods: `rename_column_concurrently` runs before the deploy, and `cleanup_concurrent_column_rename` runs after it. Until the cleanup, `undo_rename_column_concurrently` just removes the trigger and the new column.',
			`Line 23 removes the trigger, then line 25 **removes the old column**. Line 25 is the point of no return. The [guide](${DOWNTIME}#L216-L345) asks you to think hard about the time between the two migrations on large tables.`
		]
	},
	tradeoff: {
		gain: [
			'The shop keeps taking orders during every step. A failed step touches one route or one column.',
			'Rollback is per route or per column, not "restore last month\'s system".',
			'New features land in the new code from day one, so the old code stops growing.'
		],
		cost: [
			'The monolith and the new service run side by side for a long time, and the team fixes bugs in both.',
			'One proxy rule or one trigger changes which code answers, and nothing in the application code shows it.',
			'You write the trigger and the proxy rules only to delete them later. If nobody runs the cleanup, they stay in production for good.'
		]
	},
	task: {
		prompt: 'You rename `users.updated_at` to `updated_at_timestamp` with GitLab\'s helpers. The post-deployment cleanup has run. Then the new release shows a bad bug, and someone wants to redeploy the previous release, which still reads `updated_at`. What breaks? How would you go back?',
		hint: `Read \`cleanup_concurrent_column_rename\` and the method right after it, \`undo_cleanup_concurrent_column_rename\` ([lines 382-420](${HELPERS}#L382-L420)).`,
		answer: [
			'The old release breaks: its code asks for `updated_at`, and the cleanup dropped that column.',
			'Going back needs a new migration. `undo_cleanup_concurrent_column_rename` creates `updated_at` again, copies the values from `updated_at_timestamp`, and reinstalls the trigger. It is a new copy, and on a big table it takes time.',
			'So the order is: run that undo migration first, then redeploy the old code. Never the other way round.',
			'Often the better move is to **fix forward**: patch the bug in the new release, and leave the schema alone.',
			'For the design: keep the point of no return **one small step, as late as possible**. GitLab puts the drop after the deploy for this reason.'
		],
		steps: [
			{
				title: 'See what the cleanup left',
				questions: [
					{ q: 'What did `cleanup_concurrent_column_rename` remove?', options: ['Only the trigger', 'The new column `updated_at_timestamp`', 'The trigger and the old column `updated_at`', 'Nothing yet: it only marks the column'], answer: 2, why: 'It removes the rename triggers, then calls `remove_column(table, old)`.' },
					{ q: 'Which columns exist on `users` now?', options: ['Only `updated_at_timestamp`', 'Both `updated_at` and `updated_at_timestamp`', 'Only `updated_at`', 'Neither, until the next migration'], answer: 0, why: 'The old column was dropped. Only the new name is left.' },
					{ q: 'Before the cleanup, which way did the trigger copy?', options: ['From the new column into the old one', 'Both ways', 'Only on deletes', 'From the old column into the new one, on every insert and update'], answer: 3, why: 'It was a one-way `BEFORE INSERT OR UPDATE` trigger that set the new column from the old one.' },
					{ q: 'The new release told Rails to ignore one column. Which one?', options: ['`updated_at_timestamp`', '`updated_at`', 'Both', 'Neither: Rails reads every column'], answer: 1, why: 'The new code reads the new name and ignores the old column, so the drop could not surprise a running process.' }
				]
			},
			{
				title: 'Say what breaks',
				questions: [
					{ q: 'You redeploy the previous release as is. What happens?', options: ['It works: Rails maps the old name to the new one', 'It works: the trigger copies the value back', 'It breaks: its code asks for `updated_at`, which is gone', 'It works, but more slowly'], answer: 2, why: 'The old code reads `updated_at`, and the cleanup dropped that column.' },
					{ q: 'Why can\'t the trigger save you here?', options: ['It was removed in the cleanup, together with the old column', 'It only runs on inserts, not on reads', 'It copies new into old, not old into new', 'It is disabled during a redeploy'], answer: 0, why: 'The trigger was transitional architecture. It lived only between the two migrations.' },
					{ q: 'Before the cleanup, how cheap was going back?', options: ['Impossible without a backup', 'It needed a full table copy', 'It needed downtime', 'Cheap: `undo_rename_column_concurrently` just removes the trigger and the new column'], answer: 3, why: 'Until the cleanup, the old column still held every value, so undoing only removed what was added.' },
					{ q: 'What kind of rollback is this now?', options: ['A plain redeploy of the old image', 'A rollback that needs a new migration first', 'A config change in Rails', 'A revert of the last commit'], answer: 1, why: 'Past the point of no return, you can only go back by building the old shape again.' }
				]
			},
			{
				title: 'Plan the way back',
				questions: [
					{ q: 'Which helper builds the old column again?', options: ['`undo_rename_column_concurrently`', '`rename_column_concurrently` with the names swapped', '`undo_cleanup_concurrent_column_rename`', '`cleanup_concurrent_column_rename`'], answer: 2, why: 'It is the method right after the cleanup, and it reverses what the cleanup did.' },
					{ q: 'What does that helper do?', options: ['Recreates `updated_at`, copies the values from `updated_at_timestamp`, reinstalls the trigger', 'Renames `updated_at_timestamp` back to `updated_at` in place', 'Restores `updated_at` from last night\'s backup', 'Adds a view called `updated_at`'], answer: 0, why: 'It is a new copy of the data, so on a big table it takes time.' },
					{ q: 'In what order do you go back?', options: ['Redeploy the old code, then run the undo migration', 'Both at once, in one deploy', 'Run the undo migration only, and keep the new code', 'Run the undo migration first, then redeploy the old code'], answer: 3, why: 'The old code needs `updated_at` from its first request. Deploy it first and it breaks until the copy ends.' },
					{ q: 'Why does the undo take time on a big table?', options: ['It locks every user out', 'It copies every row into the recreated column', 'It must rebuild the trigger for each row', 'It waits for the next release'], answer: 1, why: 'Recreating the column means copying all the values again, not flipping a name.' }
				]
			},
			{
				title: 'Choose, and design for next time',
				questions: [
					{ q: 'What is often the better move than going back?', options: ['Fix forward: patch the bug in the new release', 'Restore the whole database', 'Run both releases side by side', 'Drop `updated_at_timestamp` too'], answer: 0, why: 'Fixing forward leaves the schema alone and avoids a second copy of a big table.' },
					{ q: 'How should a migration place its point of no return?', options: ['As early as possible, to get it over with', 'Spread over several steps', 'One small step, as late as possible', 'In the same step as the deploy'], answer: 2, why: 'The later and smaller it is, the longer every other step stays cheap to undo.' },
					{ q: 'Next time, nobody runs the cleanup for months. What stays in production?', options: ['Nothing: Rails removes it at boot', 'Only the new column', 'A backup of the table', 'The trigger and the old column, copying on every write'], answer: 3, why: 'Transitional code you plan to delete stays for good if nobody deletes it. Put the cleanup in the plan, with a date.' },
					{ q: 'In strangler fig terms, when do you delete an old part?', options: ['On a fixed date', 'When no request reaches it any more', 'As soon as the new part is deployed', 'Never: old parts stay as a backup'], answer: 1, why: 'Fowler: move behavior one piece at a time, and delete each old part when nothing uses it.' }
				]
			}
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
	recall: {
		q: 'GitLab renames a column without downtime. Which step cannot be rolled back easily, and when does it run?',
		a: 'Dropping the old column in `cleanup_concurrent_column_rename`. It runs last, in a post-deployment migration after the new code is live.'
	},
	sources: [
		{ title: 'Martin Fowler, Strangler Fig (2024)', url: 'https://martinfowler.com/bliki/StranglerFigApplication.html' },
		{ title: 'Cartwright, Horn, Lewis, Patterns of Legacy Displacement', url: 'https://martinfowler.com/articles/patterns-legacy-displacement/' },
		{ title: 'GitLab docs, Avoiding downtime in migrations: renaming columns', url: `${DOWNTIME}#L216-L345` },
		{ title: 'GitLab, rename_column_concurrently and cleanup_concurrent_column_rename', url: `${HELPERS}#L226-L420` },
		{ title: 'GitLab, UnidirectionalCopyTrigger', url: `${TRIGGER}#L16-L50` },
		{ title: 'GitLab, UnidirectionalCopyTrigger, the copy function', url: `${TRIGGER}#L94-L98` }
	]
};
