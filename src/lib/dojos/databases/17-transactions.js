const DJANGO = 'https://github.com/django/django/blob/d430084791a61b31cecec132bce3dca19194f7f2';
const TX = `${DJANGO}/django/db/transaction.py`;
const DOCS = `${DJANGO}/docs/topics/db/transactions.txt`;
const TCOP = 'https://github.com/postgres/postgres/blob/92d47d544bf64274b6a7aa8775f7b35bcf71f339/src/backend/tcop/postgres.c';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'transactions',
	part: 'Many at once',
	title: 'Transactions and savepoints',
	minutes: 10,
	hook: [
		'A checkout view saves the order, then lowers the stock. The second query fails on a constraint. The customer sees an error page, and **the order is in the database anyway**, with no stock taken.',
		'Django runs in autocommit mode by default. Its docs: "Each query is immediately committed to the database, unless a transaction is active." So **the two queries are two separate commits**, and the first one is kept whatever happens to the second.',
		'A transaction groups several statements: either all of them are committed, or none are. Other sessions see none of the changes until COMMIT. In Django, `transaction.atomic()` opens one, and a nested `atomic` block takes a savepoint inside it.'
	],
	terms: [
		{ term: 'Transaction', def: 'A group of statements the database treats as one unit. It ends with COMMIT (keep everything) or ROLLBACK (keep nothing).' },
		{ term: 'Autocommit', def: 'With no BEGIN, PostgreSQL wraps each statement in its own transaction and commits it if it succeeds. Django runs in this mode by default.' },
		{ term: 'Savepoint', def: 'A marker inside a transaction. ROLLBACK TO undoes what came after it and keeps what came before, without ending the transaction.' },
		{ term: 'Aborted transaction', def: 'After an error inside a transaction, PostgreSQL refuses every further statement until you ROLLBACK, or ROLLBACK TO a savepoint.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['begin["BEGIN"] --> debit["UPDATE accounts: Alice minus 100"]', 'debit --> credit["UPDATE accounts: Bob plus 100"]'],
				highlight: ['begin', 'debit', 'credit'],
				note: 'The PostgreSQL tutorial uses this example: money leaves Alice\'s account and reaches Bob\'s, in two separate UPDATEs. Between them, the money has left Alice and not reached Bob. No other session should see that state.'
			},
			{
				add: ['credit --> commit["COMMIT: both changes visible at once"]'],
				highlight: ['commit'],
				note: 'Until COMMIT, other sessions see neither update. After it, they see both at the same moment. The tutorial: the updates "are invisible to other transactions until the transaction completes, whereupon all the updates become visible simultaneously".'
			},
			{
				add: ['credit -.->|"error or crash"| rollback["ROLLBACK: neither change happened"]'],
				highlight: ['rollback'],
				note: 'If anything fails before COMMIT, or you decide to stop, ROLLBACK cancels every change so far. After a crash and restart (day 15), an uncommitted transaction has no effect either.'
			},
			{
				add: ['debit --> sp["SAVEPOINT before a risky step"]', 'sp -.->|"ROLLBACK TO"| debit'],
				highlight: ['sp'],
				note: 'A savepoint marks a point inside the transaction. ROLLBACK TO discards what came after it and keeps what came before. Short of rolling back everything, it is the only way to continue a transaction that an error put in the aborted state.'
			},
			{
				add: ['auto["Autocommit: no BEGIN sent"] -->|"each statement commits on its own"| commit'],
				highlight: ['auto'],
				note: 'Without BEGIN, every statement is its own transaction. For two queries that belong together, the first can commit while the second fails. Open the transaction yourself: `transaction.atomic()` in Django.'
			}
		]
	},
	example: {
		title: 'django/db/transaction.py: atomic opens a transaction outside, a savepoint inside',
		repo: 'django/django',
		url: `${TX}#L165-L309`,
		lang: 'python',
		code: `    When it's used as a context manager, __enter__ creates a transaction or a
    savepoint, depending on whether a transaction is already in progress, and
    __exit__ commits the transaction or releases the savepoint on normal exit,
    and rolls back the transaction or to the savepoint on exceptions.
…
        if connection.in_atomic_block:
            # We're already in a transaction; create a savepoint, unless we
            # were told not to or we're already waiting for a rollback. The
            # second condition avoids creating useless savepoints and prevents
            # overwriting needs_rollback until the rollback is performed.
            if self.savepoint and not connection.needs_rollback:
                sid = connection.savepoint()
                connection.savepoint_ids.append(sid)
            else:
                connection.savepoint_ids.append(None)
        else:
            connection.set_autocommit(
                False, force_begin_transaction_with_broken_autocommit=True
            )
            connection.in_atomic_block = True
…
            else:
                # This flag will be set to True again if there isn't a
                # savepoint allowing to perform the rollback at this level.
                connection.needs_rollback = False
                if connection.in_atomic_block:
                    # Roll back to savepoint if there is one, mark for rollback
                    # otherwise.
                    if sid is None:
                        connection.needs_rollback = True
                    else:
                        try:
                            connection.savepoint_rollback(sid)
…
                else:
                    # Roll back transaction
                    try:
                        connection.rollback()`,
		notes: [
			'Lines 16 to 20 run when no transaction is open: `set_autocommit(False)` turns autocommit off, so the next query runs inside a transaction. Lines 11 to 13 run when a block is already open: `connection.savepoint()` sends a SAVEPOINT and pushes its id on a stack. The [docs list the four cases](' + DOCS + '#L228-L233): open, create a savepoint, release or roll back to it, commit or roll back.',
			'Lines 26 to 33 handle an error in an inner block: with a savepoint, line 33 rolls back to it, then releases it. With no savepoint (`atomic(savepoint=False)`), line 30 sets `needs_rollback`, and the whole transaction rolls back when the outermost block exits (line 38).',
			'The docs warn: ["Avoid catching exceptions inside atomic!"](' + DOCS + '#L165-L180) After a database error, "the transaction is broken". PostgreSQL then fails every next statement with "current transaction is aborted, commands ignored until end of transaction block". Catch the error around an inner `atomic` block, which rolls back to its savepoint first.',
			'A rollback undoes rows in the database and leaves your Python objects as they are: "The values of a model\'s fields won\'t be reverted when a transaction rollback happens" ([docs](' + DOCS + '#L192-L194)). For an email, a cache write or a job, use `on_commit`. Its callbacks run after a successful commit, and on rollback they are "discarded, and never called".'
		]
	},
	tradeoff: {
		gain: [
			'No half-done work: an order and its stock change are committed together or not at all, even if the server crashes in between.',
			'Others never see the in-between state, so a report that sums balances does not catch money in flight.',
			'Savepoints let one part fail and be retried (a duplicate key, for example) without throwing away the rest.'
		],
		cost: [
			'An open transaction holds the row locks it took and can keep old row versions alive. Keep it short, or VACUUM falls behind (day 16).',
			'Wrapping every request in one transaction (Django\'s `ATOMIC_REQUESTS`) is simple, but the docs warn it "makes it inefficient when traffic increases".',
			'ROLLBACK does not undo an email sent or an API called inside the transaction.',
			'Each nested block adds two queries: a SAVEPOINT on the way in, a RELEASE on the way out. `atomic(savepoint=False)` skips them, and then an error in that block rolls back the whole transaction.'
		]
	},
	task: {
		prompt: 'In `psql`, create `accounts(name text primary key, balance numeric check (balance >= 0))` with Alice at 50 and Bob at 0. Move 100 from Alice to Bob in a transaction, crediting Bob first. What happens at each step, and what are the balances at the end? Then write the Django version that cannot leave Bob credited alone.',
		hint: 'The CHECK constraint fails on Alice\'s UPDATE. Think about what PostgreSQL accepts after an error inside a transaction block.',
		answer: [
			'`BEGIN;` then `UPDATE accounts SET balance = balance + 100 WHERE name = \'Bob\';` succeeds. Bob shows 100, but only inside this session.',
			'`UPDATE accounts SET balance = balance - 100 WHERE name = \'Alice\';` fails: the CHECK constraint rejects -50. The transaction is now aborted.',
			'Any next statement, even a `SELECT`, fails with "current transaction is aborted". `COMMIT;` answers `ROLLBACK`. Alice still has 50, Bob still has 0.',
			'Without `BEGIN`, autocommit would have committed Bob\'s credit on its own, and the failed debit would leave 100 created from nothing.',
			'In Django: `with transaction.atomic():` around both `update()` calls. The IntegrityError leaves the block, Django rolls back, and you catch the error outside the block to show a message.'
		],
		steps: [
			{
				title: 'Credit Bob first',
				questions: [
					{ q: 'Which statement opens the transaction in `psql`?', options: ['`BEGIN;`', '`SAVEPOINT start;`', '`SET autocommit = off;` on the server', 'Nothing: psql opens one for you'], answer: 0, why: 'Without `BEGIN`, PostgreSQL runs each statement in its own transaction and commits it.' },
					{ q: 'You run `UPDATE accounts SET balance = balance + 100 WHERE name = \'Bob\';`. What happens?', options: ['It fails, because Alice has not been debited yet', 'It succeeds, and Bob shows 100 inside this session only', 'It succeeds, and every session sees Bob at 100', 'It waits until the debit runs'], answer: 1, why: 'The update is valid on its own. Other sessions see none of it until COMMIT.' },
					{ q: 'A second `psql` reads Bob\'s balance now. What does it see?', options: ['100', '50', 'An error, since the row is locked', '0'], answer: 3, why: 'Changes in a transaction are invisible to others until it completes, so the second session still reads the committed 0.' },
					{ q: 'Without `BEGIN`, what would that same UPDATE have done?', options: ['Waited for the next statement', 'Failed, since autocommit needs two statements', 'Committed at once, on its own', 'Opened a savepoint'], answer: 2, why: 'In autocommit, each statement is its own transaction and is committed if it succeeds.' }
				]
			},
			{
				title: 'Debit Alice',
				questions: [
					{ q: 'You run `UPDATE accounts SET balance = balance - 100 WHERE name = \'Alice\';`. What happens?', options: ['It succeeds and Alice goes to -50', 'It succeeds and Alice goes to 0', 'It fails: the CHECK constraint rejects -50', 'It waits for Bob\'s update to commit'], answer: 2, why: '`check (balance >= 0)` refuses the new value, so the statement raises an error.' },
					{ q: 'What state is the transaction in now?', options: ['Aborted', 'Committed up to Bob\'s update', 'Still normal, minus the failed statement', 'Rolled back to the last savepoint'], answer: 0, why: 'After an error inside a transaction, PostgreSQL refuses every further statement until you roll back.' },
					{ q: 'The same CHECK let Bob\'s credit through a moment ago. Why does it stop only the debit?', options: ['It runs only at COMMIT, and the debit came last', 'It checks the sum of all balances, which went over 50', 'It applies only to rows that already hold money', 'It checks each new row value: Bob at 100 passes, Alice at -50 does not'], answer: 3, why: '`check (balance >= 0)` looks at the row being written, when the statement runs. 100 is fine, -50 is not.' },
					{ q: 'What would have let the transaction go on after the error?', options: ['Running the SELECT twice', 'A `ROLLBACK TO` a savepoint taken before the debit', 'A `COMMIT`, then the debit again', 'Raising the CHECK limit inside the transaction'], answer: 1, why: 'Short of rolling back everything, a savepoint is the only way to continue an aborted transaction.' }
				]
			},
			{
				title: 'End it and read the balances',
				questions: [
					{ q: 'You type `COMMIT;`. What does `psql` print?', options: ['`COMMIT`', '`ROLLBACK`', 'An error, and the transaction stays open', '`COMMIT 1`'], answer: 1, why: 'An aborted transaction cannot commit. PostgreSQL ends it with a rollback and says so.' },
					{ q: 'What are the balances at the end?', options: ['Alice 50, Bob 0', 'Alice 50, Bob 100', 'Alice -50, Bob 100', 'Alice 0, Bob 50'], answer: 0, why: 'The rollback cancelled Bob\'s credit. Nothing changed.' },
					{ q: 'A report in another session sums all balances again and again during the transfer. Which total does it see?', options: ['150 while Bob is credited', 'No total until the transaction ends', '50, before, during and after', '-50 once the debit fails'], answer: 2, why: 'Other sessions see none of the changes before COMMIT, and here nothing is committed. A report never catches money in flight.' },
					{ q: 'The server crashes after Bob\'s credit, before `COMMIT`. What is in the database after restart?', options: ['Bob at 100, since the update was logged', 'Alice at -50', 'The transaction, waiting for a COMMIT', 'Alice 50, Bob 0: the uncommitted transaction has no effect'], answer: 3, why: 'After a crash and restart, an uncommitted transaction has no effect.' }
				]
			},
			{
				title: 'Write the Django version',
				questions: [
					{ q: 'Inside the outer `atomic()` block, you wrap the debit in a second `atomic()`. What does Django send on entering it?', options: ['A `SAVEPOINT`', 'A second `BEGIN`', 'Nothing at all', 'A `COMMIT` of Bob\'s credit'], answer: 0, why: 'A transaction is already open, so `atomic` creates a savepoint. On an error it rolls back to it, and the outer transaction goes on.' },
					{ q: 'Where do you catch the `IntegrityError`?', options: ['Inside the block, right after the debit', 'In the model\'s `save()` method', 'Outside the `atomic` block', 'Nowhere: Django hides it'], answer: 2, why: 'The error leaves the block, Django rolls back, and you show a message outside.' },
					{ q: 'Why not catch it inside the block?', options: ['Django does not raise errors inside `atomic`', 'After a database error the transaction is broken, and later queries fail', 'The error would be caught twice', 'Python does not allow `try` inside `with`'], answer: 1, why: 'The docs: "Avoid catching exceptions inside atomic!" PostgreSQL then fails every next statement.' },
					{ q: 'The inner block is `atomic(savepoint=False)` instead, and the debit fails. What is rolled back?', options: ['Only the debit', 'Nothing: without a savepoint there is no rollback', 'Only Bob\'s credit', 'The whole transaction, when the outer block exits'], answer: 3, why: 'With no savepoint, Django marks the transaction `needs_rollback`, and the outermost block rolls everything back on exit.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'A Django view calls `order.save()` and then `stock.save()`, with no `atomic` and default settings. The second save raises. What is in the database?',
			options: [
				'The order, because each query was committed on its own in autocommit mode',
				'Nothing, because Django wraps each view in a transaction unless told not to',
				'Nothing, because the error rolls back every query of the same connection',
				'The order and the stock change, because the error was raised after the query'
			],
			answer: 0,
			why: 'Django runs in autocommit by default: each query is committed as soon as it runs. Per-request transactions only happen if you set `ATOMIC_REQUESTS`. To tie the two saves, wrap them in `transaction.atomic()`.'
		},
		{
			q: 'Inside a transaction, an INSERT fails on a unique constraint. Your code catches the error and runs a SELECT. What does PostgreSQL do?',
			options: [
				'It runs the SELECT, since only the failed INSERT was undone',
				'It refuses the SELECT until you roll back the transaction',
				'It commits what came before the INSERT and runs the SELECT',
				'It retries the INSERT once, then runs the SELECT after it'
			],
			answer: 1,
			why: 'An error puts the whole transaction in the aborted state: every statement fails with "current transaction is aborted" until ROLLBACK. ROLLBACK TO a savepoint taken before the INSERT is the way to continue, which is what a nested `atomic` block does for you.'
		},
		{
			q: 'Inside `transaction.atomic()`, you send a confirmation email and then the transaction rolls back. How should the code have been written?',
			options: [
				'Send the email in a nested atomic block, so its savepoint can undo it',
				'Send the email first, before the block, so it is out of the transaction',
				'Register the email with `on_commit`, so it runs only after a commit',
				'Send it inside the block, and send an apology email after a rollback'
			],
			answer: 2,
			why: 'ROLLBACK only undoes database changes. `on_commit` callbacks run after a successful commit and are discarded on rollback, so the email goes out only if the order really exists.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Hit an aborted transaction, then use a savepoint to skip one failed insert and keep the rest.',
		steps: [
			'Start a throwaway PostgreSQL 18 and open `psql` in two terminals: `docker run --rm -d --name pg-lab -e POSTGRES_PASSWORD=lab postgres:18`, wait a few seconds, then `docker exec -it pg-lab psql -U postgres` in each.',
			'In terminal 1: `CREATE TABLE tags (name text primary key); INSERT INTO tags VALUES (\'sql\');`',
			'Without a savepoint: `BEGIN; INSERT INTO tags VALUES (\'db\');`. In terminal 2, run `SELECT name FROM tags;`. Back in terminal 1: `INSERT INTO tags VALUES (\'sql\'); SELECT count(*) FROM tags; COMMIT;` then `SELECT name FROM tags ORDER BY name;`',
			'With a savepoint: `BEGIN; INSERT INTO tags VALUES (\'db\'); SAVEPOINT before_dup; INSERT INTO tags VALUES (\'sql\');` then `ROLLBACK TO SAVEPOINT before_dup; INSERT INTO tags VALUES (\'wal\'); COMMIT;` and `SELECT name FROM tags ORDER BY name;`. Stop with `docker stop pg-lab`.'
		],
		done: [
			'Terminal 2 sees only `sql` while terminal 1 has `db` uncommitted.',
			'Without a savepoint, the duplicate fails, the `SELECT` fails with `current transaction is aborted`, `COMMIT` prints `ROLLBACK`, and the table still holds only `sql`.',
			'With the savepoint, `COMMIT` prints `COMMIT` and the table holds `db`, `sql` and `wal`.'
		],
		solution: [
			'One error aborts the whole transaction: even the good `db` insert is lost when it ends.',
			'`ROLLBACK TO SAVEPOINT` undoes only what came after the savepoint and clears the aborted state, so the transaction goes on.',
			'This is what a nested `transaction.atomic()` does in Django: a SAVEPOINT on the way in, a rollback to it on an error.'
		]
	},
	recall: {
		q: 'Django runs in autocommit. A view saves an order, then the stock update fails. How do you keep the order from being committed alone?',
		a: 'Wrap both writes in `transaction.atomic()`. The error rolls back the whole transaction, so neither row is committed. Catch the error outside the block.'
	},
	sources: [
		{ title: 'PostgreSQL docs, Tutorial: Transactions', url: 'https://www.postgresql.org/docs/18/tutorial-transactions.html' },
		{ title: 'PostgreSQL docs, SAVEPOINT', url: 'https://www.postgresql.org/docs/18/sql-savepoint.html' },
		{ title: 'Django docs, Database transactions', url: 'https://docs.djangoproject.com/en/stable/topics/db/transactions/' },
		{ title: 'PostgreSQL source, postgres.c (aborted transaction error)', url: `${TCOP}#L1136-L1140` }
	]
};
