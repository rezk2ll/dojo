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
		'The `ALTER TABLE` itself was instant, but it waited a minute for its lock. A report had been reading `orders` for a minute, and the migration queued behind it for an exclusive lock. Then **every query that arrived after the migration queued behind the migration**.',
		'PostgreSQL has eight table lock modes, and each statement takes one: a `SELECT` takes `ACCESS SHARE`, an `UPDATE` takes `ROW EXCLUSIVE`. The safer forms of a migration use `lock_timeout`, `CREATE INDEX CONCURRENTLY` and `NOT VALID` constraints. strong_migrations, a Rails gem, checks for each one before a migration runs.'
	],
	terms: [
		{ term: 'ACCESS EXCLUSIVE', def: 'The strongest lock mode. It conflicts with every other mode, plain reads included. Most `ALTER TABLE` forms take it unless the docs say otherwise.' },
		{ term: 'Lock queue', def: 'Requests that cannot be granted wait in line. A new request waits if it conflicts with a lock already held, **or with one still waiting**.' },
		{ term: 'lock_timeout', def: 'A setting that aborts a statement once it has waited longer than the limit for a lock. The default is 0, and 0 means the statement waits with no limit.' },
		{ term: 'CREATE INDEX CONCURRENTLY', def: 'Builds an index without blocking writes. It costs two table scans, more time, and it cannot run inside a transaction block.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['rep["Report: a long SELECT, holds ACCESS SHARE"] --> orders[("orders table")]'],
				highlight: ['rep', 'orders'],
				note: 'A report has been reading `orders` for a minute. A `SELECT` takes `ACCESS SHARE`, which conflicts only with `ACCESS EXCLUSIVE`. Other reads and writes go on beside it.'
			},
			{
				add: ['mig["Migration: ALTER TABLE, wants ACCESS EXCLUSIVE"] -.->|"waits"| orders'],
				highlight: ['mig'],
				note: '`ALTER TABLE orders ADD COLUMN` needs `ACCESS EXCLUSIVE`, which conflicts with the report. So the migration joins the lock\'s wait queue. The report, and any query that started before the migration, keep running.'
			},
			{
				add: ['app["App queries: SELECT, UPDATE"] -.->|"wait behind the migration"| mig'],
				highlight: ['app'],
				note: 'The lock manager README says a request "is granted immediately if it does not conflict with any existing or waiting lock request". The app\'s `SELECT` does not conflict with the report, but it conflicts with the migration **waiting** ahead of it. So it waits too, and so does every query after it. Every page that reads `orders` now hangs until the report finishes.'
			},
			{
				add: ['lt["lock_timeout = 5s"] -->|"cancels the migration"| mig'],
				highlight: ['lt'],
				note: 'With `SET lock_timeout = \'5s\'`, the migration aborts after five seconds of waiting. The queue drains, the app recovers, and you retry later. The app sees five seconds of slow pages instead of a minute of 502 errors.'
			},
			{
				add: ['safe["Safer forms: CONCURRENTLY, NOT VALID then VALIDATE"] -->|"weaker locks"| orders'],
				highlight: ['safe'],
				note: 'Some changes have a form that takes a weaker lock. `CREATE INDEX CONCURRENTLY` and `VALIDATE CONSTRAINT` take `SHARE UPDATE EXCLUSIVE`, which lets reads and writes through. Adding a `NOT VALID` constraint still takes a strong lock, but only for an instant, because no row is scanned.'
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
			'Lines 38 to 45: on PostgreSQL, `check_add_index` raises unless `algorithm: :concurrently` is set or the table was created in the same migration. The [error message](' + ERRORS + '#L167-L176) says "Adding an index non-concurrently blocks writes" and wraps the fix in `disable_ddl_transaction!`, because `CREATE INDEX CONCURRENTLY` cannot run inside a transaction block.',
			'Lines 12 to 14: `check_add_foreign_key` turns one `add_foreign_key` into two migrations, one with `validate: false` (`NOT VALID` in SQL), then one with `validate_foreign_key`. The [message](' + ERRORS + '#L250-L264) says "Adding a foreign key blocks writes on both tables". The PostgreSQL docs agree: `ADD FOREIGN KEY` takes `SHARE ROW EXCLUSIVE` on the table and on the referenced table.',
			'Lines 7 to 10 and 39 to 42: with `safe_by_default` on, the gem rewrites the migration instead of raising. [`safe_add_index`](' + SAFE + '#L7-L10) commits the open transaction and adds `algorithm: :concurrently`. `safe_add_foreign_key` (in the sources) adds the key with `validate: false`, commits, then validates.',
			'The README says: "It’s extremely important to set a short lock timeout for migrations." Its example is 10 seconds. Outside development and test, the PostgreSQL adapter [reads `SHOW lock_timeout`](' + SM + '/lib/strong_migrations/adapters/postgresql_adapter.rb#L35-L43) and warns "DANGER: No lock timeout set" when it is zero.',
			'The experimental [`retry_lock_timeouts`](' + SM + '/lib/strong_migrations/checker.rb#L132-L146) catches `ActiveRecord::LockWaitTimeout`, sleeps `lock_timeout_retry_delay`, and runs the statement again, up to `lock_timeout_retries` times. `lock_timeout_retries` defaults to 0, so the gem does not retry unless you set it.'
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
			'One change takes two or three migrations outside a transaction, so a failure halfway leaves a state you clean up by hand.',
			'A short `lock_timeout` means migrations fail on a busy table, and someone has to run them again.'
		]
	},
	task: {
		prompt: 'Your shop\'s `orders` table has 50 million rows and takes writes every second. You need an index on `orders(customer_id)`, a foreign key from `orders.customer_id` to `customers.id`, and a check `total >= 0`. Write the SQL, in order, so no step blocks writes for more than a few seconds.',
		hint: 'For each statement, ask which lock it takes and for how long. Long scans must happen under a lock that lets writes through.',
		answer: [
			'First, in the session that runs the migration: `SET lock_timeout = \'5s\';`. Any step that cannot get its lock quickly fails, instead of queueing the app behind it.',
			'`CREATE INDEX CONCURRENTLY orders_customer_id_idx ON orders (customer_id);` outside any transaction. A failed build leaves an `INVALID` index: run `DROP INDEX CONCURRENTLY orders_customer_id_idx;` and build it again.',
			'`ALTER TABLE orders ADD CONSTRAINT orders_customer_fk FOREIGN KEY (customer_id) REFERENCES customers (id) NOT VALID;` takes `SHARE ROW EXCLUSIVE` on both tables, but only for an instant, since no row is scanned. Then `ALTER TABLE orders VALIDATE CONSTRAINT orders_customer_fk;` scans under `SHARE UPDATE EXCLUSIVE` while writes go on.',
			'Same two steps for the check: `ADD CONSTRAINT orders_total_check CHECK (total >= 0) NOT VALID;`, then `VALIDATE CONSTRAINT orders_total_check;`. Put each step in its own migration, so a lock timeout retries one step and leaves the others done.'
		],
		steps: [
			{
				title: 'Spot the forms that block',
				questions: [
					{ q: 'What does a plain `CREATE INDEX ON orders (customer_id)` do to the app?', options: ['Nothing: index builds never lock the table', 'It blocks reads but not writes', 'It blocks writes for the whole build on 50 million rows', 'It blocks only other index builds'], answer: 2, why: 'strong_migrations\' message says it: "Adding an index non-concurrently blocks writes".' },
					{ q: 'A plain `ADD FOREIGN KEY` takes which lock?', options: ['`ACCESS SHARE` on `orders` only', '`SHARE ROW EXCLUSIVE` on both tables, while it scans every row', '`SHARE UPDATE EXCLUSIVE` on `customers` only', 'No lock: constraints are checked later'], answer: 1, why: 'The docs say it takes `SHARE ROW EXCLUSIVE` on the table and the referenced table. The check of existing rows happens under that lock.' },
					{ q: 'A plain `ALTER TABLE orders ADD CONSTRAINT orders_total_check CHECK (total >= 0)` checks all 50 million rows. Under which lock?', options: ['`ACCESS SHARE`, like a SELECT', '`SHARE UPDATE EXCLUSIVE`, which lets writes through', '`ROW EXCLUSIVE`, like an UPDATE', '`ACCESS EXCLUSIVE`, which blocks reads and writes for the whole scan'], answer: 3, why: 'Most `ALTER TABLE` forms take the strongest lock. A plain CHECK holds it while it scans every row.' },
					{ q: 'So what must each step of the migration avoid?', options: ['Holding a strong lock during a long scan, or waiting for one with no limit', 'Running outside a transaction', 'Touching more than one table', 'Taking any lock at all'], answer: 0, why: 'Long scans must run under a lock that lets writes through. Strong locks are fine only for an instant.' }
				]
			},
			{
				title: 'Guard the session first',
				questions: [
					{ q: 'A step hits its lock timeout. Which strong_migrations setting would run it again for you?', options: ['`safe_by_default`', '`statement_timeout`', '`lock_timeout_retries`, which is 0 unless you set it', '`deadlock_timeout`'], answer: 2, why: '`retry_lock_timeouts` catches `LockWaitTimeout`, sleeps, and retries up to `lock_timeout_retries` times. With the default 0, nothing is retried.' },
					{ q: 'What does `lock_timeout = 0` mean?', options: ['The statement waits for its lock with no limit', 'The statement fails if the lock is not free at once', 'The statement takes no lock', 'The default of 5 seconds applies'], answer: 0, why: '0 is the default, and it means no limit. That is how a migration waited a minute in the hook.' },
					{ q: 'The ALTER hits the 5 second limit. What does the app see?', options: ['A minute of 502 errors', 'About five seconds of slow pages, then normal service', 'Nothing at all', 'A table left half altered'], answer: 1, why: 'The migration aborts, the queue behind it drains, and you retry later.' },
					{ q: 'What does strong_migrations do when `SHOW lock_timeout` returns zero outside dev and test?', options: ['It sets 10 seconds for you', 'It refuses to run any migration', 'It retries every statement three times', 'It warns "DANGER: No lock timeout set"'], answer: 3, why: 'The README calls a short lock timeout "extremely important". The adapter checks for it and warns.' }
				]
			},
			{
				title: 'Build the index',
				questions: [
					{ q: 'Which statement builds the index without blocking writes?', options: ['`CREATE INDEX orders_customer_id_idx ON orders (customer_id);`', '`CREATE INDEX CONCURRENTLY orders_customer_id_idx ON orders (customer_id);`', '`REINDEX TABLE orders;`', '`ALTER TABLE orders ADD INDEX (customer_id);`'], answer: 1, why: 'The concurrent build takes `SHARE UPDATE EXCLUSIVE`, which lets reads and writes through.' },
					{ q: 'With `safe_by_default` on, what does strong_migrations do with a plain `add_index :orders, :customer_id`?', options: ['It commits the open transaction and builds the index with `algorithm: :concurrently`', 'It raises and stops the migration', 'It builds the index on a replica first', 'It adds the index `NOT VALID`'], answer: 0, why: '`safe_add_index` rewrites the call instead of raising. The commit is needed because a concurrent build cannot run in a transaction block.' },
					{ q: 'The concurrent build fails halfway. What is left?', options: ['Nothing: PostgreSQL rolls it back', 'A valid index that covers half the rows', 'A lock on `orders` until you restart', 'An `INVALID` index that still costs on every write'], answer: 3, why: 'Run `DROP INDEX CONCURRENTLY orders_customer_id_idx;` and build it again.' },
					{ q: 'What is the price of building it concurrently?', options: ['It blocks reads for a moment', 'It needs a superuser', 'Two table scans, more time, and extra CPU and I/O', 'It cannot be used by queries until a restart'], answer: 2, why: 'The docs say it takes "significantly longer". It scans twice and waits for older transactions.' }
				]
			},
			{
				title: 'Add the constraints in two steps',
				questions: [
					{ q: 'Which statement adds the foreign key without a long lock?', options: ['`ALTER TABLE orders ADD CONSTRAINT orders_customer_fk FOREIGN KEY (customer_id) REFERENCES customers (id) NOT VALID;`', '`ALTER TABLE orders ADD CONSTRAINT orders_customer_fk FOREIGN KEY (customer_id) REFERENCES customers (id);`', '`CREATE INDEX CONCURRENTLY ON customers (id);`', '`ALTER TABLE customers ADD CONSTRAINT orders_customer_fk NOT VALID;`'], answer: 0, why: 'It still takes `SHARE ROW EXCLUSIVE` on both tables, but only for an instant, since no row is scanned.' },
					{ q: 'You added `orders_total_check` with `NOT VALID`. Which statement, in its own migration, checks the old rows?', options: ['`ALTER TABLE orders ADD CONSTRAINT orders_total_check CHECK (total >= 0);`', '`VACUUM ANALYZE orders;`', '`ALTER TABLE orders VALIDATE CONSTRAINT orders_total_check;`', '`REINDEX TABLE CONCURRENTLY orders;`'], answer: 2, why: 'VALIDATE checks the old rows that the `NOT VALID` step skipped. A plain `ADD CONSTRAINT` would do that scan under `ACCESS EXCLUSIVE`.' },
					{ q: 'Which lock does `VALIDATE CONSTRAINT` take while it scans?', options: ['`ACCESS EXCLUSIVE`', '`SHARE ROW EXCLUSIVE`', '`ROW EXCLUSIVE`', '`SHARE UPDATE EXCLUSIVE`, so writes go on'], answer: 3, why: 'The long scan happens under a lock that lets reads and writes through.' },
					{ q: 'Why put each step in its own migration?', options: ['Rails allows one statement per migration', 'A lock timeout then retries one step and leaves the others done', 'Each migration gets a fresh `lock_timeout` default of 5s', 'PostgreSQL needs a commit between two ALTERs'], answer: 1, why: 'The steps run outside one transaction, so a failure halfway leaves a state you would otherwise clean up by hand.' }
				]
			}
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
	lab: {
		minutes: 25,
		goal: 'Watch a waiting `ALTER TABLE` freeze plain reads, cut it short with `lock_timeout`, then add an index, a foreign key and a check without blocking writes.',
		steps: [
			'Start PostgreSQL: `docker run -d --name dojo-pg -e POSTGRES_PASSWORD=dojo postgres:17`. Wait until `docker exec dojo-pg pg_isready` prints `accepting connections`. Open three terminals, each with `docker exec -it dojo-pg psql -U postgres`: report, migration and app.',
			'In report: `CREATE TABLE customers (id bigint PRIMARY KEY); INSERT INTO customers SELECT g FROM generate_series(1, 1000) g;` then `CREATE TABLE orders (id bigserial PRIMARY KEY, customer_id bigint NOT NULL, total int NOT NULL); INSERT INTO orders (customer_id, total) SELECT 1 + g % 1000, g % 500 FROM generate_series(1, 200000) g;`',
			'In report, play the long report: `BEGIN; SELECT count(*) FROM orders;` and leave the transaction open.',
			'In migration: `ALTER TABLE orders ADD COLUMN note text;`. In app: `SELECT count(*) FROM orders;`. Both hang. In a fourth shell, look: `docker exec dojo-pg psql -U postgres -c "SELECT pid, mode, granted FROM pg_locks WHERE relation = \'orders\'::regclass"`. Then `COMMIT;` in report.',
			'Again with a guard. In report: `BEGIN; SELECT count(*) FROM orders;`. In migration: `SET lock_timeout = \'5s\';` then `ALTER TABLE orders ADD COLUMN note2 text;`. After it fails, `COMMIT;` in report.',
			'The safe way, in migration: `CREATE INDEX CONCURRENTLY orders_customer_id_idx ON orders (customer_id);`, then `ALTER TABLE orders ADD CONSTRAINT orders_customer_fk FOREIGN KEY (customer_id) REFERENCES customers (id) NOT VALID;` and `ALTER TABLE orders VALIDATE CONSTRAINT orders_customer_fk;`, then the same two steps for `CHECK (total >= 0)` named `orders_total_check`.',
			'Try the index inside a transaction: `BEGIN; CREATE INDEX CONCURRENTLY orders_total_idx ON orders (total);` then `ROLLBACK;`'
		],
		done: [
			'In step 4, `pg_locks` shows a granted `AccessShareLock` for the report, a waiting `AccessExclusiveLock` for the migration, and a waiting `AccessShareLock` for the app\'s SELECT.',
			'In step 5, the ALTER fails after five seconds with `canceling statement due to lock timeout`, and a SELECT in app answers at once right after, while the report is still open.',
			'After step 6, `\\d orders` lists `orders_customer_id_idx`, `orders_customer_fk` and `orders_total_check`, and `INSERT INTO orders (customer_id, total) VALUES (1, -1);` fails on `orders_total_check`.',
			'Step 7 fails with `CREATE INDEX CONCURRENTLY cannot run inside a transaction block`.'
		],
		solution: [
			'The app\'s SELECT does not conflict with the report. It conflicts with the `AccessExclusiveLock` already waiting, and a request is granted only if it conflicts with no held and no waiting lock.',
			'`lock_timeout` makes the migration give up, so the queue behind it drains. Retry when the report is done.',
			'`NOT VALID` takes its strong lock only for an instant, and `VALIDATE CONSTRAINT` scans under `SHARE UPDATE EXCLUSIVE`. To see it, run the VALIDATE inside `BEGIN` and look at `pg_locks` from another shell: an INSERT still goes through.',
			'Clean up with `docker rm -f dojo-pg`.'
		]
	},
	recall: {
		q: 'A migration waits for `ACCESS EXCLUSIVE` behind a long report. Why do plain `SELECT`s on the table hang too, and which setting limits how long?',
		a: 'A new request waits if it conflicts with a held lock or with one still waiting, so each `SELECT` queues behind the waiting migration. `SET lock_timeout = \'5s\'` makes the migration give up after 5 seconds.'
	},
	sources: [
		{ title: 'PostgreSQL docs, Explicit Locking', url: 'https://www.postgresql.org/docs/current/explicit-locking.html' },
		{ title: 'PostgreSQL docs, ALTER TABLE', url: 'https://www.postgresql.org/docs/current/sql-altertable.html' },
		{ title: 'PostgreSQL docs, Building Indexes Concurrently', url: 'https://www.postgresql.org/docs/current/sql-createindex.html#SQL-CREATEINDEX-CONCURRENTLY' },
		{ title: 'PostgreSQL docs, lock_timeout', url: 'https://www.postgresql.org/docs/current/runtime-config-client.html#GUC-LOCK-TIMEOUT' },
		{ title: 'PostgreSQL source, src/backend/storage/lmgr/README', url: `${PG}/src/backend/storage/lmgr/README#L364-L368` },
		{ title: 'strong_migrations README', url: `${SM}/README.md` },
		{ title: 'strong_migrations, safe_add_foreign_key', url: `${SAFE}#L46-L59` }
	]
};
