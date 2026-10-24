const RAILS = 'https://github.com/rails/rails/blob/ccaef690ee7a1f1d02642edd5f710daf031e7e04/activerecord/lib/active_record';
const OPT = `${RAILS}/locking/optimistic.rb`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'optimistic-locking',
	part: 'Many at once',
	title: 'Optimistic locking',
	minutes: 10,
	hook: [
		'Two support agents open the same customer record. One fixes the phone number, the other fixes the address. Both click Save. **The second save silently wipes the first fix**, and nobody sees an error.',
		'Here the later write overwrote the earlier one: a lost update. A row lock (day 20) would stop it, but the agent keeps the form open for five minutes. The lock would have to last across two HTTP requests, and every other writer of that row would wait the whole time.',
		'With optimistic locking, each row carries a version number. **A write succeeds only if the version is still the one you read.** If someone saved first, your UPDATE changes zero rows, and the app knows its copy is stale.'
	],
	terms: [
		{ term: 'Lost update', def: 'Two writers read the same row, both change it, and the later write overwrites the earlier one as if it never happened.' },
		{ term: 'Version column', def: 'An integer stored on the row (Rails calls it `lock_version`). Every successful update adds one to it.' },
		{ term: 'Compare-and-set', def: 'An UPDATE whose WHERE clause includes the value you expect. It writes only if the row still holds that value, in one atomic statement.' },
		{ term: 'Stale object', def: 'A copy of a row in memory whose version no longer matches the database. Saving it must fail rather than overwrite.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['a["Agent A reads id 1"] -->|"lock_version = 3"| row[("customers row")]', 'b["Agent B reads id 1"] -->|"lock_version = 3"| row'],
				highlight: ['a', 'b', 'row'],
				note: 'Both agents read version 3, and no lock is taken. Each agent keeps the version it saw, in memory or in a hidden form field. They can now edit for as long as they like.'
			},
			{
				add: ['a -->|"UPDATE ... SET lock_version = 4 WHERE id = 1 AND lock_version = 3"| row'],
				highlight: ['a', 'row'],
				note: 'A saves first. The WHERE clause still matches, so the row is updated and the version moves to 4. The database reports one row affected, and Rails reads only that count to know the save worked.'
			},
			{
				add: ['b -->|"same UPDATE, WHERE lock_version = 3"| row', 'row -->|"0 rows"| err["StaleObjectError"]'],
				highlight: ['b', 'err'],
				note: 'B saves with version 3. The row now says 4, so the WHERE clause matches nothing and zero rows change. Rails turns that zero into `ActiveRecord::StaleObjectError`, and B\'s address fix is not written.'
			},
			{
				add: ['err --> retry["Reload, merge or ask the user, then try again"]'],
				highlight: ['retry'],
				note: 'The database only refused the write. Your code reloads the row, then retries, merges the two edits, or shows B what changed. Nobody waited on a lock, and A\'s fix is still in the row.'
			}
		]
	},
	example: {
		title: 'activerecord/lib/active_record/locking/optimistic.rb: the version check inside every save',
		repo: 'rails/rails',
		url: `${OPT}#L122-L194`,
		lang: 'ruby',
		code: `        def _update_row(attribute_names, attempted_action = "update")
          return super unless locking_enabled?
          return super if attempted_action == "touch" && _skip_locking_column_on_touch?

          begin
            locking_column = self.class.locking_column
            lock_attribute_was = @attributes[locking_column]

            update_constraints = _query_constraints_hash

            attribute_names = attribute_names.dup if attribute_names.frozen?
            attribute_names << locking_column

            if self[locking_column].nil?
              raise(<<-MSG.squish)
                For optimistic locking, locking_column ('#{locking_column}') can't be nil.
                Are you missing a default value or validation on '#{locking_column}'?
              MSG
            end

            self[locking_column] += 1

            affected_rows = self.class._update_record(
              attributes_with_values(attribute_names),
              update_constraints
            )

            if affected_rows != 1
              raise ActiveRecord::StaleObjectError.new(self, attempted_action)
            end

            affected_rows

          # If something went wrong, revert the locking_column value.
          rescue Exception
            @attributes[locking_column] = lock_attribute_was
            raise
          end
        end
…
        def _query_constraints_hash
          return super unless locking_enabled?

          locking_column = self.class.locking_column
          super.merge(locking_column => _lock_value_for_database(locking_column))
        end`,
		notes: [
			'Lines 41 to 46 put the old version into the WHERE: `_query_constraints_hash` adds `lock_version => <value read>` next to the primary key. Line 21 sets the version plus one for the SET list. [`_build_update_manager`](' + RAILS + '/persistence.rb#L289-L303) turns the constraints into the WHERE clause, so one statement checks and writes.',
			'Lines 28 to 30 trust the count the database returns: anything other than 1 raises `StaleObjectError`. The code does not read the row again to compare. Lines 35 to 37 put the in-memory version back, so a retry starts from the version that was read. [`destroy_row`](' + OPT + '#L166-L174) applies the same rule to deletes.',
			'Two saves cannot both pass the check. In PostgreSQL\'s Read Committed mode, a second UPDATE on a row being changed waits for the first to finish. Then, from the [isolation docs](https://www.postgresql.org/docs/current/transaction-iso.html#XACT-READ-COMMITTED): "The search condition of the command (the WHERE clause) is re-evaluated to see if the updated version of the row still matches the search condition." Version 3 no longer matches, so B updates nothing.',
			'Across HTTP requests, the form must carry the version. The [module comment](' + OPT + '#L42-L43): "To make it work across all web requests, the recommended approach is to add +lock_version+ as a hidden field to your form." Without that field, the second request reloads the row, reads the new version, and the check passes.',
			'Bulk writes skip the check. [`update_all`](' + RAILS + '/relation.rb#L620-L629) with a hash bumps `lock_version` so open forms go stale, but it adds no version to its WHERE clause. It never raises `StaleObjectError`. Given a raw SQL string, it does not even bump the version.'
		]
	},
	tradeoff: {
		gain: [
			'No lock is held between read and write, so a user can keep a form open for an hour and nobody waits on them.',
			'The late writer gets an error it can show, instead of quietly erasing someone else\'s work.',
			'It costs one integer column and one extra condition in the WHERE clause. It works with any isolation level and any connection pooler.'
		],
		cost: [
			'Under heavy contention most writes fail and retry. A hot row (a stock counter, a balance) does better with a row lock or an atomic `UPDATE ... SET n = n - 1`.',
			'The `StaleObjectError` reaches the user or the caller. Someone must decide what a conflict means: retry, merge, or show both versions.',
			'Every write path must go through the check. A raw SQL update, a bulk `update_all`, or a second app that ignores the column can still overwrite a newer row.'
		]
	},
	task: {
		prompt: 'In `psql`, create `docs(id int primary key, body text, lock_version int not null default 0)` and insert row 1. Open two sessions. Both read row 1. Session A saves "draft A", then session B saves "draft B". Write the exact UPDATE each session sends, the row count each one gets, and what B should do next.',
		hint: 'Both sessions read `lock_version = 0`. Put that value in the WHERE clause and set it to one more in the SET list.',
		answer: [
			'Session A: `UPDATE docs SET body = \'draft A\', lock_version = 1 WHERE id = 1 AND lock_version = 0;` reports `UPDATE 1`. The row is now at version 1.',
			'Session B: `UPDATE docs SET body = \'draft B\', lock_version = 1 WHERE id = 1 AND lock_version = 0;` reports `UPDATE 0`. Nothing changed: the row says 1, not 0.',
			'B must not retry the same statement blindly. It reads the row again (now "draft A", version 1), merges or asks the user, and sends a new UPDATE with `WHERE lock_version = 1`.',
			'If both sessions run inside open transactions and B\'s UPDATE starts before A commits, B waits on A\'s row lock. When A commits, PostgreSQL re-checks B\'s WHERE clause on the new row version, finds version 1, and still reports `UPDATE 0`.'
		],
		steps: [
			{
				title: 'Set up and read',
				questions: [
					{ q: 'Both sessions run `SELECT body, lock_version FROM docs WHERE id = 1` on the fresh row. What does each one keep?', options: ['A row lock on id 1 until it saves', '`lock_version = 0`, the version it saw', '`lock_version = 1`, the next version', 'Nothing: the version stays in the database'], answer: 1, why: 'Each writer keeps the version it read. That value goes into the WHERE clause of its save.' },
					{ q: 'Does reading row 1 take a lock here?', options: ['Yes, a row lock until the session saves', 'Yes, but only against other writers', 'No: optimistic locking takes no lock at all', 'Only when the session runs under Serializable'], answer: 2, why: 'Both sessions read freely. The check happens later, inside the UPDATE.' },
					{ q: 'Why is `lock_version` declared `not null default 0`?', options: ['The check compares against a real value, so it must never be NULL', 'PostgreSQL needs a default to build an index on the column', 'A default makes the column faster to update than a plain int', 'Without it the primary key on `id` would not be unique'], answer: 0, why: 'The WHERE compares the version you read with the row. Rails even refuses to save when the locking column is nil.' },
					{ q: 'In a web app, where does the version live while the user edits the form?', options: ['In a row lock held by the request', 'In the database session of the first request', 'In a server-side cache keyed by user', 'In a hidden field of the form'], answer: 3, why: 'The Rails module comment recommends a hidden `lock_version` field. Without it, the save reloads the row and the check always passes.' }
				]
			},
			{
				title: 'Write A\'s save',
				questions: [
					{ q: 'Which UPDATE does session A send?', options: ['`UPDATE docs SET body = \'draft A\', lock_version = 1 WHERE id = 1;`', '`UPDATE docs SET body = \'draft A\' WHERE id = 1 AND lock_version = 0;`', '`UPDATE docs SET body = \'draft A\', lock_version = 1 WHERE id = 1 AND lock_version = 0;`', '`UPDATE docs SET body = \'draft A\', lock_version = 0 WHERE id = 1 AND lock_version = 1;`'], answer: 2, why: 'The WHERE carries the version A read, and the SET moves it one up. Without the bump, B\'s save would still match.' },
					{ q: 'What does psql report for A?', options: ['`UPDATE 1`', '`UPDATE 0`', '`ERROR: could not serialize access`', '`UPDATE 1`, then a wait for B'], answer: 0, why: 'The row still says 0, so the WHERE matches and one row changes.' },
					{ q: 'Why put the version check in the UPDATE instead of a SELECT just before it?', options: ['A SELECT cannot read the `lock_version` column', 'One statement checks and writes atomically, with no gap for another writer', 'PostgreSQL forbids a SELECT and an UPDATE in the same session', 'The SELECT would take a lock that blocks session B'], answer: 1, why: 'That is compare-and-set. A separate SELECT leaves a gap between the check and the write.' },
					{ q: 'What version does row 1 hold after A\'s save?', options: ['0', '2', 'Still 0 until B saves', '1'], answer: 3, why: 'A\'s SET moved it to 1. Every successful update adds one.' }
				]
			},
			{
				title: 'Write B\'s save',
				questions: [
					{ q: 'Which version does B put in its WHERE clause?', options: ['`lock_version = 0`, the one it read', '`lock_version = 1`, the current one', 'None: B only filters on `id`', '`lock_version = 2`, the next one'], answer: 0, why: 'B saves with what it saw. It does not know A saved first, and the check is how it finds out.' },
					{ q: 'B sends `UPDATE docs SET body = \'draft B\', lock_version = 1 WHERE id = 1 AND lock_version = 0;`. What comes back?', options: ['`UPDATE 1`, overwriting draft A', '`UPDATE 0`', 'A duplicate key error on `lock_version`', 'A deadlock error'], answer: 1, why: 'The row now says 1, not 0, so the WHERE matches nothing.' },
					{ q: 'What does row 1 hold after B\'s UPDATE?', options: ['"draft B", version 1', '"draft B", version 2', '"draft A", version 1', '"empty", version 0'], answer: 2, why: 'Zero rows changed. A\'s fix is still there.' },
					{ q: 'Rails raises `StaleObjectError` for B\'s save. What does it leave in B\'s in-memory `lock_version`?', options: ['1, the value it tried to write', '1, read again from the database', 'nil, so the next save is refused', '0, the version B read'], answer: 3, why: 'The rescue block puts back `lock_attribute_was`, so a retry starts from the version that was read.' }
				]
			},
			{
				title: 'Decide what B does next',
				questions: [
					{ q: 'B reads row 1 again and merges its text into "draft A". Which UPDATE does it send?', options: ['`UPDATE docs SET body = \'merged\', lock_version = 1 WHERE id = 1 AND lock_version = 0;`', '`UPDATE docs SET body = \'merged\', lock_version = 2 WHERE id = 1;`', '`UPDATE docs SET body = \'merged\', lock_version = 1 WHERE id = 1 AND lock_version = 1;`', '`UPDATE docs SET body = \'merged\', lock_version = 2 WHERE id = 1 AND lock_version = 1;`'], answer: 3, why: 'The new read gave version 1. The WHERE carries it, and the SET moves it to 2, so a third writer would still be caught.' },
					{ q: 'B resends its first UPDATE unchanged. What happens?', options: ['`UPDATE 0` again, since the row still says 1', '`UPDATE 1`, since A has committed by now', 'It waits until A releases its lock', 'PostgreSQL merges the two drafts'], answer: 0, why: 'The statement still asks for version 0. It will never match again.' },
					{ q: 'Now both sessions run in open transactions, and B\'s UPDATE starts before A commits. What does B see first?', options: ['`UPDATE 0` at once', '`UPDATE 1`, since A has not committed', 'B waits on A\'s row lock', 'A serialization error'], answer: 2, why: 'A second UPDATE on a row being changed waits for the first transaction to finish.' },
					{ q: 'A commits. What does B\'s waiting UPDATE get?', options: ['`UPDATE 1`, because it started first', '`UPDATE 0`, because PostgreSQL re-checks the WHERE on the new row version', 'A deadlock error', '`UPDATE 1`, and A\'s write is rolled back'], answer: 1, why: 'In Read Committed, PostgreSQL re-evaluates the WHERE clause on the updated row. Version 1 no longer matches 0.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'A Rails save raises `StaleObjectError`. What did the database actually see?',
			options: [
				'An UPDATE whose WHERE clause on `lock_version` matched no row',
				'A deadlock between two transactions on the same customer row',
				'A row lock held too long by a `SELECT ... FOR UPDATE` query',
				'A unique index violation on the `lock_version` integer column'
			],
			answer: 0,
			why: 'Optimistic locking takes no lock at all. Rails sends one UPDATE with the old version in the WHERE clause and raises when the affected row count is not 1.'
		},
		{
			q: 'Users edit a wiki page in a browser form for several minutes. Why is optimistic locking a better fit here than `SELECT ... FOR UPDATE`?',
			options: [
				'A row lock is faster to take, but PostgreSQL drops it after one minute',
				'A row lock would block every reader of the page until the form is saved',
				'A row lock lives in one transaction, which cannot stay open across requests',
				'A row lock works only under Serializable, which most apps do not use'
			],
			answer: 2,
			why: 'A row lock ends with its transaction, and a transaction lives on one connection. Keeping it open while a person types would pin a connection and make every other writer queue. Plain readers are not blocked by it (day 18), which rules out the second option.'
		},
		{
			q: 'Hundreds of checkouts per second decrement `stock` on the same product row, each with an optimistic version check. What happens?',
			options: [
				'Each decrement waits its turn on a lock, so all of them succeed slowly',
				'Most attempts find a newer version, fail, and retry, wasting work',
				'PostgreSQL merges the concurrent decrements into one combined write',
				'The version column overflows quickly and the row becomes read only'
			],
			answer: 1,
			why: 'On a hot row nearly every writer finds a newer version, gets zero rows, and retries. An atomic `UPDATE products SET stock = stock - 1 WHERE id = $1 AND stock > 0` needs no version at all.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Watch a version check turn a lost update into `UPDATE 0`, in two real `psql` sessions.',
		steps: [
			'Start PostgreSQL in Docker: `docker run -d --name dojo-pg -e POSTGRES_PASSWORD=dojo postgres:17`. Wait until `docker exec dojo-pg pg_isready` prints `accepting connections`.',
			'Open two terminals, A and B. In each one, run `docker exec -it dojo-pg psql -U postgres`.',
			'In A: `CREATE TABLE docs (id int PRIMARY KEY, body text, lock_version int NOT NULL DEFAULT 0);` then `INSERT INTO docs (id, body) VALUES (1, \'empty\');`',
			'In both: `SELECT body, lock_version FROM docs WHERE id = 1;` and note the version.',
			'In A: `UPDATE docs SET body = \'draft A\', lock_version = 1 WHERE id = 1 AND lock_version = 0;`. Then in B, the same statement with `\'draft B\'`.',
			'In B, read the row again, then save with the version you just read: `UPDATE docs SET body = \'draft B\', lock_version = 2 WHERE id = 1 AND lock_version = 1;`',
			'Now the race inside transactions. In A: `BEGIN;` then `UPDATE docs SET body = \'tx A\', lock_version = 3 WHERE id = 1 AND lock_version = 2;` and do not commit. In B: the same UPDATE with `\'tx B\'`. Then `COMMIT;` in A.'
		],
		done: [
			'In step 5, A prints `UPDATE 1` and B prints `UPDATE 0`.',
			'After step 6, `SELECT body, lock_version FROM docs;` shows `draft B` and `2`.',
			'In step 7, B hangs until A commits, then prints `UPDATE 0`. The row holds `tx A` at version 3.'
		],
		solution: [
			'B\'s first UPDATE matches nothing: the row says 1 and the WHERE asks for 0. That zero is the count Rails reads before it raises `StaleObjectError`.',
			'The save that works reads the row first, so its WHERE carries the current version. In an app, that is where you merge or ask the user.',
			'In step 7, B waits on A\'s row lock. When A commits, PostgreSQL re-checks B\'s WHERE on the new row version, finds 3, and updates nothing.',
			'Clean up with `docker rm -f dojo-pg`.'
		]
	},
	recall: {
		q: 'Rails sends `UPDATE ... WHERE id = 1 AND lock_version = 3` and the database reports 0 rows. What happened, and what must the app do?',
		a: 'Another writer saved first and moved the row past version 3. Rails raises `StaleObjectError`, and the app reloads the row, then retries, merges, or shows the user what changed.'
	},
	sources: [
		{ title: 'PostgreSQL docs, Transaction Isolation', url: 'https://www.postgresql.org/docs/current/transaction-iso.html' },
		{ title: 'Rails API, ActiveRecord::Locking::Optimistic', url: 'https://api.rubyonrails.org/classes/ActiveRecord/Locking/Optimistic.html' },
		{ title: 'Rails API, ActiveRecord::Locking::Pessimistic', url: 'https://api.rubyonrails.org/classes/ActiveRecord/Locking/Pessimistic.html' }
	]
};
