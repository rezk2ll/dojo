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
