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
		'Your shop wants to rename a column: `orders.amount` becomes `orders.total`. In Rails that is one `rename_column`, in one migration, run by the deploy pipeline.',
		'During a rolling deploy, old and new pods serve at the same time. Run the rename first, and **the old pods query a column that is gone**. Run it last, and **the new pods query a column that is not there yet**. One step cannot suit two versions of the code.',
		'The fix: grow the new shape next to the old one and move over in small steps. **Expand** so both versions work, **migrate** the data and the code, then **contract** what nobody reads any more. GitLab\'s migration guide spells out each step, so that GitLab.com and self-managed servers can upgrade without downtime.'
	],
	terms: [
		{ term: 'Expand / contract', def: 'Also called parallel change. Add the new shape next to the old one, move readers and writers over, remove the old shape last. Three steps, often three releases.' },
		{ term: 'Mixed versions', def: 'During a rolling deploy, old and new code run at the same time against one database. Every state of the schema must work for both.' },
		{ term: 'Additive change', def: 'A new nullable column or a new table. Old code ignores it, so it can ship before the code that uses it.' },
		{ term: 'Backfill', def: 'Filling the new shape for rows written before it existed. Inside the migration, as a background job in batches, or not at all if the code reads "empty" safely.' },
		{ term: 'Contract', def: 'Dropping the old column or table. Safe only when no running version, and no version you may roll back to, still reads it.' },
		{ term: 'Post-deployment migration', def: 'A migration that runs only after every server runs the new code. It is where the contract step goes.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['mig["Regular migration, before the new code"] -->|"add updated_at_timestamp, copy in batches"| users[("users table")]'],
				highlight: ['mig', 'users'],
				note: '**Expand and backfill.** GitLab\'s doc example renames `users.updated_at` to `updated_at_timestamp`. `rename_column_concurrently` adds the new column with the same type, then copies every existing row into it in batches. The old column is untouched.'
			},
			{
				add: ['users --> trig["Trigger: on insert or update, copy old into new"]', 'oldp["Old pods: write updated_at"] --> users'],
				highlight: ['trig', 'oldp'],
				note: '**Keep the copy current.** The same helper installs a database trigger. Every insert or update copies the old column into the new one. A row an old pod writes **during the rollout** still reaches the new column. The backfill cannot miss it.'
			},
			{
				add: ['newp["New pods: ignore_column updated_at"] --> users'],
				highlight: ['newp'],
				note: '**Mixed versions.** The new code marks the old column ignored. GitLab\'s guide explains why: ActiveRecord caches the table\'s columns when it boots, so a column that disappears under a running process can break it even if no code names it. An ignored column is never referenced in SQL queries.'
			},
			{
				add: ['post["Post-deployment migration, after every server is updated"] -->|"drop trigger, drop updated_at"| users'],
				highlight: ['post'],
				note: '**Contract.** `cleanup_concurrent_column_rename` removes the trigger and the old column. It sits in `db/post_migrate`, which a zero-downtime upgrade runs **only once all servers run the new code**. A release later, the ignore rule is removed too.'
			},
			{
				add: ['bbm["Batched background migration, over several releases"] -.->|"for large tables"| users'],
				highlight: ['bbm'],
				note: '**When the table is big.** The doc warns that this procedure is "only appropriate for small tables", because the copy runs inside the migration. For large ones, a background job copies the data in batches, and the rename spreads over several releases.'
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
			'**Expand, then backfill.** [`create_column_from`](' + HELPERS + '#L757-L792) adds the new column with the old one\'s type, limit and scale, sets the default **after** adding it, then copies the data with `update_column_in_batches`. Only then does it add the NOT NULL constraint and copy indexes, foreign keys and check constraints. The helper refuses to run inside an open transaction.',
			'**The trigger covers the gap.** [`UnidirectionalCopyTrigger`](' + REPO + '/lib/gitlab/database/unidirectional_copy_trigger.rb#L38-L49) runs `BEFORE INSERT OR UPDATE ... FOR EACH ROW`, and its [assignment](' + REPO + '/lib/gitlab/database/unidirectional_copy_trigger.rb#L86-L103) sets `NEW.new := NEW.old`. As its name says, it copies one way: from the old column into the new one.',
			'**Contract has a clock.** GitLab\'s [`ignore_columns`](' + REPO + '/app/models/concerns/ignorable_columns.rb#L18-L30) raises unless you give `remove_after` (a date) and `remove_with` (a release), or opt out with `remove_never: true`, then adds the column to Rails\' own [`ignored_columns`](' + RAILS + '/activerecord/lib/active_record/model_schema.rb#L372-L379). The Rails comment gives the reason: no code "raises errors due to having a cached schema in memory at the time the schema migration is run".',
			'**Contract runs last.** [Post-deployment migrations](' + REPO + '/doc/development/database/post_deployment_migrations.md?plain=1#L8-L12) run with the others by default. Set `SKIP_POST_DEPLOYMENT_MIGRATIONS` while you deploy, then run them again once [all servers have been updated](' + REPO + '/doc/development/database/post_deployment_migrations.md?plain=1#L44-L45).',
			'**Dropping takes three releases.** For a plain drop, the [doc](' + DOWNTIME + '#L14-L33) spreads ignore, drop and un-ignore over releases M, M+1 and M+2, because "dropping a column is a destructive operation that can\'t be rolled back easily". And for a rename, it warns about the [state between the two migrations](' + DOWNTIME + '#L339-L340): "With Canary it is possible that the system runs in this state for a significant amount of time."'
		]
	},
	tradeoff: {
		gain: [
			'No downtime: every state of the schema works for the release before and the release after, so a rolling deploy never breaks.',
			'Rollback stays possible: until the contract step, the previous release still runs on the current schema.',
			'Each step is small and can be checked on its own: the column exists, the copy counted its rows, nothing reads the old column.'
		],
		cost: [
			'One change becomes two or three releases, and for a while the database holds the same data twice.',
			'The contract step is easy to forget. The bliki entry warns: "If the contract phase is not executed you might end up in a worse state than you started".',
			'A copy on a big table takes time and load. GitLab moves those to batched background migrations: one more moving part that must finish before the next step.',
			'Triggers are hidden behavior. A write you see in the code is not the only write the database does until the cleanup runs.'
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
			why: 'An additive, nullable column is invisible to code that does not name it. That is what lets the expand step ship before the code, and what keeps a rollback working.'
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
			why: 'The trigger runs before every insert and update and sets the new column from the old one. That is the point of installing it in the expand step: rows written by old code during the rollout are not lost.'
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
	takeaway: 'Change a schema in steps that each work for the code before and after: expand, backfill, switch, and contract only when nothing reads the old shape.',
	sources: [
		{ title: 'Danilo Sato, martinfowler.com: ParallelChange', url: 'https://martinfowler.com/bliki/ParallelChange.html' },
		{ title: 'Pramod Sadalage and Martin Fowler, Evolutionary Database Design', url: 'https://martinfowler.com/articles/evodb.html' },
		{ title: 'GitLab docs, Avoiding downtime in migrations', url: 'https://docs.gitlab.com/development/database/avoiding_downtime_in_migrations/' },
		{ title: 'GitLab docs, Post Deployment Migrations', url: 'https://docs.gitlab.com/development/database/post_deployment_migrations/' },
		{ title: 'Rails API, ActiveRecord::ModelSchema ignored_columns=', url: 'https://api.rubyonrails.org/classes/ActiveRecord/ModelSchema/ClassMethods.html#method-i-ignored_columns-3D' }
	]
};
