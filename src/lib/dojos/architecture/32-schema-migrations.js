const REPO = 'https://github.com/gitlabhq/gitlabhq/blob/beea9497b60c127a5219ef142d0320918c6b20d5';
const RAILS = 'https://github.com/rails/rails/blob/8b25b80042db6c5498976ed0f5fd01b6764c0146';
const HELPERS = `${REPO}/lib/gitlab/database/migration_helpers.rb`;
const DOWNTIME = `${REPO}/doc/development/database/avoiding_downtime_in_migrations.md?plain=1`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'schema-migrations',
	part: 'Built to last',
	title: 'Schema and data migrations',
	minutes: 10,
	hook: [
		'Your shop wants to rename the column `orders.amount` to `orders.total`. In Rails that is one `rename_column`, in one migration, run by the deploy pipeline.',
		'During a rolling deploy, old and new pods serve at the same time. Run the rename first, and **the old pods query a column that is gone**. Run it last, and the new pods query a column that is not there yet. No order of deploy and migration works for both versions of the code.',
		'GitLab\'s migration guide splits the change into three steps, **expand, migrate, contract**, so that GitLab.com and self-managed servers can upgrade without downtime. First you add the new column next to the old one, so both versions work. Then you move the data and the code. Last, you drop what no code reads any more.'
	],
	terms: [
		{ term: 'Expand / contract', def: 'Also called parallel change. Add the new shape next to the old one, move readers and writers over, remove the old shape last. The three steps often ship in three releases.' },
		{ term: 'Mixed versions', def: 'During a rolling deploy, old and new code run at the same time against one database. Every state of the schema must work for both.' },
		{ term: 'Backfill', def: 'Filling the new shape for rows written before it existed. Inside the migration, as a background job in batches, or not at all if the code reads "empty" safely.' },
		{ term: 'Post-deployment migration', def: 'A migration that runs only after every server runs the new code. The contract step goes there.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['mig["Regular migration, before the new code"] -->|"add updated_at_timestamp, copy in batches"| users[("users table")]'],
				highlight: ['mig', 'users'],
				note: 'GitLab\'s doc example renames `users.updated_at` to `updated_at_timestamp`. In the expand step, `rename_column_concurrently` adds the new column with the same type. Then it backfills: it copies every existing row into the new column in batches. `updated_at` keeps its name and its data.'
			},
			{
				add: ['users --> trig["Trigger: on insert or update, copy old into new"]', 'oldp["Old pods: write updated_at"] --> users'],
				highlight: ['trig', 'oldp'],
				note: 'The same helper installs a database trigger that keeps the copy current. Every insert or update copies the old column into the new one. A row an old pod writes **during the rollout** still reaches the new column, so the backfill cannot miss it.'
			},
			{
				add: ['newp["New pods: ignore_column updated_at"] --> users'],
				highlight: ['newp'],
				note: 'Old and new pods now run together, and the new code marks the old column ignored. GitLab\'s guide gives the reason: ActiveRecord caches the table\'s columns when it boots. A column that disappears under a running process can then break it, even if no code names it. An ignored column never appears in SQL queries.'
			},
			{
				add: ['post["Post-deployment migration, after every server is updated"] -->|"drop trigger, drop updated_at"| users'],
				highlight: ['post'],
				note: 'In the contract step, `cleanup_concurrent_column_rename` removes the trigger and the old column. It sits in `db/post_migrate`, which a zero-downtime upgrade runs **only once all servers run the new code**. One release later, the code drops the `ignore_column` rule too.'
			},
			{
				add: ['bbm["Batched background migration, over several releases"] -.->|"for large tables"| users'],
				highlight: ['bbm'],
				note: 'The doc warns that this procedure is "only appropriate for small tables", because the copy runs inside the migration. For large ones, a background job copies the data in batches, and the rename spreads over several releases.'
			}
		]
	},
	example: {
		title: 'lib/gitlab/database/migration_helpers.rb: a rename split into expand and contract',
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
        unless column_exists?(table, batch_column_name)
          raise "Column #{batch_column_name} does not exist on #{table}"
        end

        if transaction_open?
          raise 'rename_column_concurrently can not be run inside a transaction'
        end

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
			'Line 20 calls [`create_column_from`](' + HELPERS + '#L757-L792). It adds the new column with the old one\'s type, limit and scale, sets the default **after** adding it, then copies the data with `update_column_in_batches`. Only then does it add the NOT NULL constraint and copy indexes, foreign keys and check constraints. Lines 14 to 16 refuse to run inside an open transaction.',
			'Line 22 installs the trigger. [`UnidirectionalCopyTrigger`](' + REPO + '/lib/gitlab/database/unidirectional_copy_trigger.rb#L38-L49) runs `BEFORE INSERT OR UPDATE ... FOR EACH ROW` and sets `NEW.new := NEW.old`. As its name says, it copies one way: from the old column into the new one.',
			'GitLab\'s [`ignore_columns`](' + REPO + '/app/models/concerns/ignorable_columns.rb#L18-L30) puts a date on the contract step. It raises unless you give `remove_after` (a date) and `remove_with` (a release), or opt out with `remove_never: true`, then adds the column to Rails\' own `ignored_columns`. The Rails comment gives the reason: no code "raises errors due to having a cached schema in memory at the time the schema migration is run".',
			'Lines 25 to 32 are the contract step, and they go in a [post-deployment migration](' + REPO + '/doc/development/database/post_deployment_migrations.md?plain=1#L8-L12). Those run with the others by default. Set `SKIP_POST_DEPLOYMENT_MIGRATIONS` while you deploy, then run them again once all servers have been updated.',
			'For a plain drop, the [doc](' + DOWNTIME + '#L14-L33) spreads ignore, drop and un-ignore over releases M, M+1 and M+2, because "dropping a column is a destructive operation that can\'t be rolled back easily". For a rename, it warns about the state between the two migrations: "With Canary it is possible that the system runs in this state for a significant amount of time."'
		]
	},
	tradeoff: {
		gain: [
			'No downtime: every state of the schema works for the release before and the release after, so a rolling deploy never breaks.',
			'Rollback stays possible: until the contract step, the previous release still runs on the current schema.',
			'Each step is small and can be checked on its own: the column exists, the copy counted its rows, nothing reads the old column.'
		],
		cost: [
			'A rename takes two or three releases instead of one, and for a while the database holds the same data twice.',
			'The contract step is a separate release that someone must remember to ship. The bliki entry warns: "If the contract phase is not executed you might end up in a worse state than you started".',
			'A copy on a big table takes time and load. GitLab moves those copies to batched background migrations, which must finish before the next step.',
			'Until the cleanup runs, the trigger writes the new column on every insert or update, and that write appears nowhere in the application code.'
		]
	},
	task: {
		prompt: 'You must rename your shop\'s `orders.amount` to `total` with no failed request during a rolling deploy, and keep the option to roll back one release. You have no trigger helper. Write the releases, and for each one the migration and the code change.',
		hint: 'Each state of the schema must work for the code just before it and the code just after it. For each release, write which column the code reads and which ones it writes.',
		answer: [
			'Release 1 (expand): add `total`, nullable. The code writes both columns and still reads `amount`. Old pods ignore the new column.',
			'Backfill: once release 1 is fully out, copy `amount` into `total` where it is null, in batches. Run it after the rollout, so no old pod is still writing `amount` alone.',
			'Release 2 (migrate): the code reads `total` and still writes both. Rolling back to release 1 is safe, because `amount` is still current.',
			'Release 3 (contract): the code stops writing `amount` and marks it in `ignored_columns`. Drop the column in a post-deployment migration of a later release, once no version you might roll back to reads it.',
			'Or ask whether the rename is worth it. Rails\' `alias_attribute :total, :amount` lets the code say `total` while the column keeps its name: the code reads well and the schema never moves.'
		],
		steps: [
			{
				title: 'Expand the schema',
				questions: [
					{ q: 'Why can\'t you ship one `rename_column` with the deploy?', options: ['Rails has no `rename_column` for PostgreSQL', 'Old and new pods run together, and one of them misses its column', 'A rename always locks the table for hours', 'The rename would lose every value in `amount`'], answer: 1, why: 'Run the rename first and old pods query a column that is gone. Run it last and new pods query one that is not there yet.' },
					{ q: 'What does the release 1 migration do?', options: ['Rename `amount` to `total`', 'Add `total` as NOT NULL with a default of 0', 'Drop `amount` and add `total`', 'Add `total` as a nullable column'], answer: 3, why: 'A new nullable column is invisible to code that does not name it, so the running release keeps working.' },
					{ q: 'In release 1, which column does the code read?', options: ['`amount`', '`total`', 'Whichever one is not null', 'Both, and it compares them'], answer: 0, why: '`total` is still empty for old rows, so the code keeps reading `amount` until the backfill is done.' },
					{ q: 'In release 1, which columns does the code write?', options: ['Only `amount`, as before', 'Only `total`, the new name', 'Both `amount` and `total`', 'Neither: the backfill fills `total`'], answer: 2, why: 'Writing both keeps `total` current for new rows. With no trigger helper, the code does the copy that GitLab\'s trigger would do.' }
				]
			},
			{
				title: 'Backfill the old rows',
				questions: [
					{ q: 'When do you run the backfill?', options: ['Before release 1, so `total` is full from the start', 'Once release 1 is fully out', 'In the same migration that adds `total`', 'After release 3 drops `amount`'], answer: 1, why: 'Until every pod runs release 1, an old pod can still write `amount` alone. Run the copy after the rollout and it misses nothing.' },
					{ q: 'Which rows does the backfill touch?', options: ['Every row, overwriting `total`', 'Only rows created today', 'Only rows where `amount` is null', 'Rows where `total` is null'], answer: 3, why: 'Rows written by release 1 already have `total`. Only the older ones need the copy.' },
					{ q: 'How does it copy on a large `orders` table?', options: ['In batches', 'In one `UPDATE` inside a transaction', 'By exporting and reimporting the table', 'Row by row from the application on read'], answer: 0, why: 'GitLab copies in batches, and for large tables moves the copy to a batched background migration. One big update means long load and locks.' },
					{ q: 'GitLab\'s `rename_column_concurrently` copies inside the migration. What does its doc say about that?', options: ['It is the right choice for every table', 'It is only appropriate for small tables', 'It must run inside a transaction', 'It needs no trigger on PostgreSQL'], answer: 1, why: 'The doc warns the procedure is "only appropriate for small tables". Large ones use a background job over several releases.' }
				]
			},
			{
				title: 'Move the reads',
				questions: [
					{ q: 'In release 2, which column does the code read?', options: ['`amount`, as in release 1', '`total`', 'Both, preferring `amount`', 'Neither: it reads a view'], answer: 1, why: 'After the backfill, every row has `total`, so the code can read the new name.' },
					{ q: 'In release 2, which columns does the code still write?', options: ['Only `total`', 'Only `amount`', 'Neither: a trigger does it', 'Both `amount` and `total`'], answer: 3, why: 'Writing both keeps `amount` current, which is what makes a rollback to release 1 safe.' },
					{ q: 'You roll back from release 2 to release 1. Why does it work?', options: ['Release 1 reads `amount`, and `amount` is still current', 'Rails rebuilds `amount` from `total` on boot', 'The migration is reversed during the rollback', 'Release 1 also reads `total` when it exists'], answer: 0, why: 'Until the contract step, the previous release still runs on the current schema.' },
					{ q: 'Which rule must every state of the schema follow?', options: ['It must match the latest release exactly', 'It must have no duplicated data', 'It must work for the code just before it and just after it', 'It must be reached in a single migration'], answer: 2, why: 'In a rolling deploy, both versions of the code run against one database at the same time.' }
				]
			},
			{
				title: 'Contract last',
				questions: [
					{ q: 'In release 3, what does the code do with `amount`?', options: ['Drops it in a regular migration', 'Renames it to `amount_old`', 'Stops writing it and marks it in `ignored_columns`', 'Keeps writing it until the column is dropped'], answer: 2, why: 'An ignored column never appears in SQL queries, so a running process does not break when it disappears.' },
					{ q: 'Why mark the column ignored before dropping it?', options: ['ActiveRecord caches the columns at boot, and a vanished column can break a running process', 'Rails refuses to drop a column that is not ignored', 'It makes the drop migration run faster', 'It copies the data into `total` one last time'], answer: 0, why: 'GitLab\'s guide gives the reason: no code should raise errors from a cached schema when the migration runs.' },
					{ q: 'You drop `amount` in release 3 itself. Release 3 misbehaves and you roll back to release 2. What happens?', options: ['Nothing: release 2 reads `total`', 'Release 2 still writes `amount`, so its writes to `orders` fail', 'Rails recreates `amount` on boot', 'The drop is reversed with the rollback'], answer: 1, why: 'Release 2 writes both columns. Once `amount` is gone, the release you rolled back to no longer fits the schema.' },
					{ q: 'GitLab\'s `ignore_columns` raises unless you give it two things, or opt out. Which two?', options: ['A ticket id and an owner', 'A table name and a column type', 'A migration file and a test', '`remove_after`, a date, and `remove_with`, a release'], answer: 3, why: 'It puts a date on the contract step, so an ignored column does not stay in the table forever.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Why can a new nullable column be added before the code that uses it is deployed?',
			options: [
				'Code that does not select it does not see it, so the running release works as before',
				'The database holds a lock on the table until the new code starts using the column',
				'The new code would create the column on start, so adding it early only saves time',
				'The old code copies its values into any new column as soon as the column exists'
			],
			answer: 0,
			why: 'An additive, nullable column is invisible to code that does not name it. So the expand step can ship before the code, and a rollback to the old code still works.'
		},
		{
			q: 'GitLab ran `rename_column_concurrently :users, :updated_at, :updated_at_timestamp`. During the rollout, an old pod inserts a user and sets only `updated_at`. What does `updated_at_timestamp` hold?',
			options: [
				'Null, until the next batched copy reaches the new row',
				'Null forever, because the copy only covered rows that existed when it ran',
				'The database default, since the old pod does not know the column',
				'The same value: the trigger copies the old column into the new one'
			],
			answer: 3,
			why: 'The trigger runs before every insert and update and sets the new column from the old one. Because the expand step installs it, rows written by old code during the rollout reach the new column.'
		},
		{
			q: 'In an expand/contract change, when is it safe to drop the old column?',
			options: [
				'As soon as the backfill has copied every existing row into the new one',
				'When no running version, and no version you may roll back to, uses it',
				'Once the new release is running on at least one pod in production',
				'In the same migration as the expand step, so the schema stays tidy'
			],
			answer: 1,
			why: 'The contract step is a one-way door (day 5). Rolling back after it means running code that reads a column that is gone. So it comes last, in a post-deployment migration, often a release after the code stopped using the column.'
		}
	],
	recall: {
		q: 'In GitLab\'s column rename, what does each of the two migrations do, and when does each one run?',
		a: '`rename_column_concurrently` adds the new column, copies the rows in batches and installs a copy trigger, before the new code ships. `cleanup_concurrent_column_rename` drops the trigger and the old column in a post-deployment migration, once every server runs the new code.'
	},
	sources: [
		{ title: 'GitLab, unidirectional_copy_trigger.rb (trigger assignment)', url: `${REPO}/lib/gitlab/database/unidirectional_copy_trigger.rb#L86-L103` },
		{ title: 'Rails, active_record/model_schema.rb (ignored_columns)', url: `${RAILS}/activerecord/lib/active_record/model_schema.rb#L372-L379` },
		{ title: 'GitLab docs source, post deployment migrations (after all servers are updated)', url: `${REPO}/doc/development/database/post_deployment_migrations.md?plain=1#L44-L45` },
		{ title: 'GitLab docs source, avoiding downtime (state between the two migrations)', url: `${DOWNTIME}#L339-L340` },
		{ title: 'Danilo Sato, martinfowler.com: ParallelChange', url: 'https://martinfowler.com/bliki/ParallelChange.html' },
		{ title: 'Pramod Sadalage and Martin Fowler, Evolutionary Database Design', url: 'https://martinfowler.com/articles/evodb.html' },
		{ title: 'GitLab docs, Avoiding downtime in migrations', url: 'https://docs.gitlab.com/development/database/avoiding_downtime_in_migrations/' },
		{ title: 'GitLab docs, Post Deployment Migrations', url: 'https://docs.gitlab.com/development/database/post_deployment_migrations/' },
		{ title: 'Rails API, ActiveRecord::ModelSchema ignored_columns=', url: 'https://api.rubyonrails.org/classes/ActiveRecord/ModelSchema/ClassMethods.html#method-i-ignored_columns-3D' }
	]
};
