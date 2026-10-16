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
		'That is a lost update. A row lock (day 20) would stop it, but **you cannot hold a lock while a person stares at a form for five minutes**. The lock would live across two HTTP requests, and every other writer would queue behind a coffee break.',
		'Optimistic locking bets that conflicts are rare. **Each row carries a version number. A write only succeeds if the version is still the one you read**. If someone got there first, your UPDATE touches zero rows, and the app knows it lost the race.'
	],
	terms: [
		{ term: 'Lost update', def: 'Two writers read the same row, both change it, and the later write overwrites the earlier one as if it never happened.' },
		{ term: 'Version column', def: 'An integer stored on the row (Rails calls it `lock_version`). Every successful update adds one to it.' },
		{ term: 'Compare-and-set', def: 'An UPDATE whose WHERE clause includes the value you expect. It writes only if the row still holds that value, in one atomic statement.' },
		{ term: 'Stale object', def: 'A copy of a row in memory whose version no longer matches the database. Saving it must fail rather than overwrite.' },
		{ term: 'Pessimistic lock', def: 'The opposite bet: take a row lock with `SELECT ... FOR UPDATE` before changing it, so others wait instead of failing (day 20).' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['a["Agent A reads id 1"] -->|"lock_version = 3"| row[("customers row")]', 'b["Agent B reads id 1"] -->|"lock_version = 3"| row'],
				highlight: ['a', 'b', 'row'],
				note: '**Both read version 3.** No lock is taken. Each agent keeps the version it saw, in memory or in a hidden form field. They can now edit for as long as they like.'
			},
			{
				add: ['a -->|"UPDATE ... SET lock_version = 4 WHERE id = 1 AND lock_version = 3"| row'],
				highlight: ['a', 'row'],
				note: '**A saves first.** The WHERE clause still matches, so the row is updated and the version moves to 4. The database reports one row affected. That count is the whole signal.'
			},
			{
				add: ['b -->|"same UPDATE, WHERE lock_version = 3"| row', 'row -->|"0 rows"| err["StaleObjectError"]'],
				highlight: ['b', 'err'],
				note: '**B saves with an old version.** The row now says 4, so the WHERE clause matches nothing and zero rows change. Rails turns that zero into `ActiveRecord::StaleObjectError`. B\'s change is not written.'
			},
			{
				add: ['err --> retry["Reload, merge or ask the user, then try again"]'],
				highlight: ['retry'],
				note: '**The app decides.** The database only refused the write. Your code reloads the row, then retries, merges the two edits, or shows B what changed. Nothing waited, and A\'s fix survived.'
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
			'**The old version goes into the WHERE.** [`_query_constraints_hash`](' + OPT + '#L189-L194) adds `lock_version => <value read>` next to the primary key. [`_build_update_manager`](' + RAILS + '/persistence.rb#L289-L303) turns those constraints into the WHERE clause, while the SET list carries the version plus one. One statement checks and writes.',
			'**Zero rows means you lost.** The code does not read the row again to compare. It trusts the count the database returns: anything other than 1 raises `StaleObjectError`, and the `rescue` puts the in-memory version back so a retry starts clean. [`destroy_row`](' + OPT + '#L166-L174) applies the same rule to deletes.',
			'**Why the check cannot race.** In PostgreSQL\'s Read Committed mode, a second UPDATE on a row being changed waits for the first to finish. Then, as the [isolation docs](https://www.postgresql.org/docs/current/transaction-iso.html#XACT-READ-COMMITTED) say, "The search condition of the command (the WHERE clause) is re-evaluated to see if the updated version of the row still matches the search condition." Version 3 no longer matches, so B updates nothing.',
			'**Across HTTP requests, carry the version.** The [module comment](' + OPT + '#L42-L43) is plain about it: "To make it work across all web requests, the recommended approach is to add +lock_version+ as a hidden field to your form." Without that field, the second request reloads the row, reads the new version, and the check passes.',
			'**Bulk writes skip the check.** [`update_all`](' + RAILS + '/relation.rb#L620-L629) with a hash bumps `lock_version` so open forms go stale, but it adds no version to its WHERE clause. It never raises `StaleObjectError`. Given a raw SQL string, it does not even bump the version.'
		]
	},
	tradeoff: {
		gain: [
			'No lock is held between read and write, so a user can keep a form open for an hour and nobody waits on them.',
			'Lost updates become loud: the late writer gets an error it can show, instead of quietly erasing someone else\'s work.',
			'It costs one integer column and one extra condition in the WHERE clause. It works with any isolation level and any connection pooler.'
		],
		cost: [
			'Under heavy contention most writes fail and retry. A hot row (a stock counter, a balance) does better with a row lock or an atomic `UPDATE ... SET n = n - 1`.',
			'The failure reaches the user or the caller. Someone must decide what a conflict means: retry, merge, or show both versions.',
			'Every write path must go through the check. A raw SQL update, a bulk `update_all`, or a second app that ignores the column quietly brings lost updates back.'
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
			why: 'Optimistic locking is cheap only when conflicts are rare. On a hot row nearly every writer loses the race and retries. An atomic `UPDATE products SET stock = stock - 1 WHERE id = $1 AND stock > 0` needs no version at all.'
		}
	],
	takeaway: 'Put the version you read into the WHERE clause of your UPDATE: one row changed means you won, zero means someone else wrote first and your code must decide what to do.',
	sources: [
		{ title: 'PostgreSQL docs, Transaction Isolation', url: 'https://www.postgresql.org/docs/current/transaction-iso.html' },
		{ title: 'Rails API, ActiveRecord::Locking::Optimistic', url: 'https://api.rubyonrails.org/classes/ActiveRecord/Locking/Optimistic.html' },
		{ title: 'Rails API, ActiveRecord::Locking::Pessimistic', url: 'https://api.rubyonrails.org/classes/ActiveRecord/Locking/Pessimistic.html' }
	]
};
