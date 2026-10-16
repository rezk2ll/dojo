const SM = 'https://github.com/ankane/strong_migrations/blob/23d8e1f7d7aad502388a5dfcf49affa3b0cfb086';
const PG = 'https://github.com/postgres/postgres/blob/26bd08fb5c069fbdf55867adc398cfca0f55d5c8';
const ERRORS = `${SM}/lib/strong_migrations/error_messages.rb`;
const SAFE = `${SM}/lib/strong_migrations/safe_methods.rb`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'migration-locks',
	part: 'Keeping it running',
	title: 'Migrations that lock the table',
	minutes: 10,
	hook: [
		'Tuesday, 2 p.m. A migration adds one column to `orders`. On your laptop it ran in a second. In production, **every page that touches `orders` hangs for a minute**, then the load balancer starts answering 502.',
		'The `ALTER TABLE` itself was instant. It was **waiting**. A report had been reading `orders` for a minute, and the migration queued behind it for an exclusive lock. Then **every query that arrived after the migration queued behind the migration**.',
		'Today: which statements take which lock, why the queue turns one slow reader into an outage, and the safer forms: `lock_timeout`, `CREATE INDEX CONCURRENTLY` and `NOT VALID` constraints. strong_migrations, a Rails gem, checks for each one before a migration runs.'
	],
	terms: [
		{ term: 'Lock mode', def: 'PostgreSQL has eight table lock modes. They differ only in which other modes they conflict with. A `SELECT` takes `ACCESS SHARE`, an `UPDATE` takes `ROW EXCLUSIVE`, and the two share a table happily.' },
		{ term: 'ACCESS EXCLUSIVE', def: 'The strongest mode. It conflicts with every other mode, plain reads included. Most `ALTER TABLE` forms take it unless the docs say otherwise.' },
		{ term: 'Lock queue', def: 'Requests that cannot be granted wait in line. A new request waits if it conflicts with a lock already held, **or with one still waiting**.' },
		{ term: 'lock_timeout', def: 'A setting that aborts a statement once it has waited longer than the limit for a lock. Zero, the default, means wait forever.' },
		{ term: 'CREATE INDEX CONCURRENTLY', def: 'Builds an index without blocking writes. It costs two table scans, more time, and it cannot run inside a transaction block.' },
		{ term: 'NOT VALID', def: 'Adds a foreign key or `CHECK` constraint without scanning the rows already there. New writes are checked at once; `VALIDATE CONSTRAINT` checks the old rows later, under a weaker lock.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['rep["Report: a long SELECT, holds ACCESS SHARE"] --> orders[("orders table")]'],
				highlight: ['rep', 'orders'],
				note: '**A long reader.** A report has been reading `orders` for a minute. A `SELECT` takes `ACCESS SHARE`, which conflicts only with `ACCESS EXCLUSIVE`. Other reads and writes go on beside it.'
			},
			{
				add: ['mig["Migration: ALTER TABLE, wants ACCESS EXCLUSIVE"] -.->|"waits"| orders'],
				highlight: ['mig'],
				note: '**The migration waits.** `ALTER TABLE orders ADD COLUMN` needs `ACCESS EXCLUSIVE`, which conflicts with the report. So it joins the lock\'s wait queue. On its own that is harmless: the migration is just late.'
			},
			{
				add: ['app["App queries: SELECT, UPDATE"] -.->|"wait behind the migration"| mig'],
				highlight: ['app'],
				note: '**The queue blocks everyone.** The lock manager README says a request "is granted immediately if it does not conflict with any existing or waiting lock request". The app\'s `SELECT` does not conflict with the report, but it conflicts with the migration **waiting** ahead of it. So it waits too, and so does every query after it. That is the outage.'
			},
			{
				add: ['lt["lock_timeout = 5s"] -->|"cancels the migration"| mig'],
				highlight: ['lt'],
				note: '**Give up fast.** With `SET lock_timeout = \'5s\'`, the migration aborts after five seconds of waiting. The queue drains, the app recovers, and you retry later. Five seconds of slow pages beat a minute of errors.'
			},
			{
				add: ['safe["Safer forms: CONCURRENTLY, NOT VALID then VALIDATE"] -->|"weaker locks"| orders'],
				highlight: ['safe'],
				note: '**Ask for less.** Some changes have a form that takes a weaker lock. `CREATE INDEX CONCURRENTLY` and `VALIDATE CONSTRAINT` take `SHARE UPDATE EXCLUSIVE`, which lets reads and writes through. Adding a `NOT VALID` constraint still takes a strong lock, but only for an instant, because nothing is scanned.'
			}
		]
	},
	example: {
		title: 'lib/strong_migrations/checks.rb: refusing the forms that lock',
		repo: 'ankane/strong_migrations',
		url: `${SM}/lib/strong_migrations/checks.rb#L116-L165`,
		lang: 'ruby',
		code: `    def check_add_foreign_key(*args)
      options = args.extract_options!
      from_table, to_table = args

      validate = options.fetch(:validate, true)
      if postgresql? && validate
        if StrongMigrations.safe_by_default
          safe_add_foreign_key(*args, **options)
          throw :safe
        end

        raise_error :add_foreign_key,
          add_foreign_key_code: command_str("add_foreign_key", [from_table, to_table, options.merge(validate: false)]),
          validate_foreign_key_code: command_str("validate_foreign_key", [from_table, to_table])
      elsif mysql? || mariadb?
        raise_error :add_foreign_key_mysql,
          add_foreign_key_code: command_str("add_foreign_key", [from_table, to_table, options]),
          # TODO exclude some options?
          remove_foreign_key_code: command_str("remove_foreign_key", [from_table, to_table, options])
      end
    end

    def check_add_index(*args)
      options = args.extract_options!
      table, columns = args

      if columns.is_a?(Array) && columns.size > 3 && !options[:unique]
        raise_error :add_index_columns, header: "Best practice"
      end

      # safe_by_default goes through this path as well
      if postgresql? && options[:algorithm] == :concurrently && adapter.index_corruption?
        raise_error :add_index_corruption
      end

      # safe to add non-concurrently to new tables (even after inserting data)
      # since the table won't be in use by the application
      if postgresql? && options[:algorithm] != :concurrently && !new_table?(table)
        if StrongMigrations.safe_by_default
          safe_add_index(*args, **options)
          throw :safe
        end

        raise_error :add_index, command: command_str("add_index", [table, columns, options.merge(algorithm: :concurrently)])
      end

      check_algorithm_option("add_index", *args, **options)

      check_lock_option("add_index", *args, **options)
    end`,
		notes: [
			'**Index: ask for CONCURRENTLY.** On PostgreSQL, `check_add_index` raises unless `algorithm: :concurrently` is set or the table was created in the same migration. The [error message](' + ERRORS + '#L167-L176) says "Adding an index non-concurrently blocks writes" and wraps the fix in `disable_ddl_transaction!`, because `CREATE INDEX CONCURRENTLY` cannot run inside a transaction block.',
			'**Foreign key: split it in two.** `check_add_foreign_key` turns one `add_foreign_key` into two migrations: one with `validate: false`, which is `NOT VALID` in SQL, then one with `validate_foreign_key`. The [message](' + ERRORS + '#L250-L264) says "Adding a foreign key blocks writes on both tables". The PostgreSQL docs agree: `ADD FOREIGN KEY` takes `SHARE ROW EXCLUSIVE` on the table and on the referenced table.',
			'**Or fix it for you.** With `safe_by_default` on, the gem rewrites instead of raising. [`safe_add_index`](' + SAFE + '#L7-L10) commits the open transaction and adds `algorithm: :concurrently`. [`safe_add_foreign_key`](' + SAFE + '#L46-L59) adds the key with `validate: false`, commits, then validates.',
			'**A timeout, and a check that you set one.** The [README](' + SM + '/README.md?plain=1#L959) says: "It’s extremely important to set a short lock timeout for migrations." Its example is 10 seconds. Outside development and test, the PostgreSQL adapter [reads `SHOW lock_timeout`](' + SM + '/lib/strong_migrations/adapters/postgresql_adapter.rb#L35-L43) and warns "DANGER: No lock timeout set" when it is zero.',
			'**Retry instead of failing.** The experimental [`retry_lock_timeouts`](' + SM + '/lib/strong_migrations/checker.rb#L132-L146) catches `ActiveRecord::LockWaitTimeout`, sleeps `lock_timeout_retry_delay`, and runs the statement again, up to `lock_timeout_retries` times. The default is zero retries.'
		]
	},
	tradeoff: {
		gain: [
			'A migration that cannot get its lock fails in seconds, instead of queueing the whole app behind it.',
			'Index builds and constraint checks on big tables run while the app keeps reading and writing.',
			'A checker like strong_migrations catches the dangerous form in code review, before it reaches production.'
		],
		cost: [
			'`CREATE INDEX CONCURRENTLY` scans the table twice and waits for older transactions, so it takes "significantly longer" and adds CPU and I/O load.',
			'A failed concurrent build leaves an `INVALID` index that still costs on every write, until you drop it and build again.',
			'One change becomes two or three migrations outside a transaction, so a failure halfway leaves a state you clean up by hand.',
			'A short `lock_timeout` means migrations fail on a busy table, and someone has to run them again.'
		]
	},
	task: {
		prompt: 'Your shop\'s `orders` table has 50 million rows and takes writes every second. You need an index on `orders(customer_id)`, a foreign key from `orders.customer_id` to `customers.id`, and a check `total >= 0`. Write the SQL, in order, so no step blocks writes for more than a few seconds.',
		hint: 'For each statement, ask which lock it takes and for how long. Long scans must happen under a lock that lets writes through.',
		answer: [
			'First, in the session that runs the migration: `SET lock_timeout = \'5s\';`. Any step that cannot get its lock quickly fails, instead of queueing the app behind it.',
			'`CREATE INDEX CONCURRENTLY orders_customer_id_idx ON orders (customer_id);` outside any transaction. If it fails, it leaves an `INVALID` index: `DROP INDEX CONCURRENTLY orders_customer_id_idx;` and run it again.',
			'`ALTER TABLE orders ADD CONSTRAINT orders_customer_fk FOREIGN KEY (customer_id) REFERENCES customers (id) NOT VALID;` takes `SHARE ROW EXCLUSIVE` on both tables, but only for an instant, since no row is scanned. Then `ALTER TABLE orders VALIDATE CONSTRAINT orders_customer_fk;` scans under `SHARE UPDATE EXCLUSIVE` while writes go on.',
			'Same two steps for the check: `ADD CONSTRAINT orders_total_check CHECK (total >= 0) NOT VALID;`, then `VALIDATE CONSTRAINT orders_total_check;`. Put each step in its own migration, so a lock timeout retries one step, not all of them.'
		]
	},
	quiz: [
		{
			q: 'A report has been reading `orders` for two minutes. You run `ALTER TABLE orders ADD COLUMN note text` with no `lock_timeout`. What happens to a plain `SELECT` on `orders` sent one second later?',
			options: [
				'It waits, because it queues behind the migration that waits for the report',
				'It runs at once, because a read never conflicts with another read',
				'It fails at once with a lock error, since the table is being altered',
				'It runs at once, and then the migration waits for that read as well'
			],
			answer: 0,
			why: 'Its `ACCESS SHARE` does not conflict with the report, but it conflicts with the `ACCESS EXCLUSIVE` request already in the queue. A request is granted only if it conflicts with no held lock **and no waiting one** (day 20). So the migration and everyone behind it wait for the report.'
		},
		{
			q: 'Why does strong_migrations put `disable_ddl_transaction!` in a migration that adds an index with `algorithm: :concurrently`?',
			options: [
				'A transaction would keep the index locked until every later migration finished',
				'PostgreSQL refuses to run `CREATE INDEX CONCURRENTLY` inside a transaction block',
				'Rails cannot roll back an index build, so the transaction would not protect anything',
				'A concurrent build is only fast when it can skip writing the index to the WAL'
			],
			answer: 1,
			why: 'The CREATE INDEX docs say a regular build "can be performed within a transaction block, but CREATE INDEX CONCURRENTLY cannot". The concurrent build runs its own transactions: one to register the index as invalid, then one for each of its two table scans.'
		},
		{
			q: 'You add `CHECK (total >= 0) NOT VALID` to `orders`. Which is true right after it commits?',
			options: [
				'Old and new rows both go unchecked until you run `VALIDATE CONSTRAINT`',
				'Old rows are checked in the background while new writes are let through',
				'New inserts and updates are checked; old rows wait for `VALIDATE CONSTRAINT`',
				'The database already assumes the constraint holds for every row in the table'
			],
			answer: 2,
			why: 'The ALTER TABLE docs: "The constraint will still be applied against subsequent inserts or updates", but the database "will not assume that the constraint holds for all rows in the table, until it is validated". `VALIDATE CONSTRAINT` does that scan later, under `SHARE UPDATE EXCLUSIVE` (day 22).'
		}
	],
	takeaway: 'A migration hurts less by how long it runs than by the lock it waits for: set a short `lock_timeout`, and pick the form that takes the weakest lock.',
	sources: [
		{ title: 'PostgreSQL docs, Explicit Locking', url: 'https://www.postgresql.org/docs/current/explicit-locking.html' },
		{ title: 'PostgreSQL docs, ALTER TABLE', url: 'https://www.postgresql.org/docs/current/sql-altertable.html' },
		{ title: 'PostgreSQL docs, Building Indexes Concurrently', url: 'https://www.postgresql.org/docs/current/sql-createindex.html#SQL-CREATEINDEX-CONCURRENTLY' },
		{ title: 'PostgreSQL docs, lock_timeout', url: 'https://www.postgresql.org/docs/current/runtime-config-client.html#GUC-LOCK-TIMEOUT' },
		{ title: 'PostgreSQL source, src/backend/storage/lmgr/README', url: `${PG}/src/backend/storage/lmgr/README#L364-L368` },
		{ title: 'strong_migrations README', url: `${SM}/README.md` }
	]
};
