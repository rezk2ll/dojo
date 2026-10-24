const PG = 'https://github.com/postgres/postgres/blob/92d47d544bf64274b6a7aa8775f7b35bcf71f339';
const DEADLOCK = `${PG}/src/backend/storage/lmgr/deadlock.c`;
const README = `${PG}/src/backend/storage/lmgr/README`;
const MVCC = `${PG}/doc/src/sgml/mvcc.sgml`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'locks',
	part: 'Many at once',
	title: 'Locks and deadlocks',
	minutes: 10,
	hook: [
		'A refund job moves money from account A to account B. At the same moment, a transfer moves money from B to A. Both hang for a second, then one fails with **`ERROR: deadlock detected`**. Nobody wrote a lock in the code.',
		'MVCC (day 18) lets readers and writers pass each other, but **two writers on the same row still take turns**. Every UPDATE or DELETE takes a row lock, held until the transaction ends. The next writer on that row waits.',
		'A deadlock happens when two transactions wait for each other: each holds one row and wants the other\'s. PostgreSQL notices after about one second, aborts one of them, and the other goes on. Taking row locks in one fixed order prevents the deadlock.'
	],
	terms: [
		{ term: 'Row lock', def: 'Taken by UPDATE, DELETE and SELECT FOR UPDATE on each row they touch. It blocks other writers and lockers of that row, never plain readers. Released when the transaction ends.' },
		{ term: 'Deadlock', def: 'Two or more transactions each hold a lock that another one wants. None can proceed until one is aborted.' },
		{ term: 'deadlock_timeout', def: 'How long a waiting transaction sleeps before it checks for a deadlock. One second by default.' },
		{ term: 'lock_timeout', def: 'Aborts a statement that waits longer than this for any lock. Off (zero) by default, so a wait can last forever.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['t1["Tx 1: UPDATE account 11111"] -->|"holds row lock"| r1[("row 11111")]', 't2["Tx 2: UPDATE account 22222"] -->|"holds row lock"| r2[("row 22222")]'],
				highlight: ['t1', 't2'],
				note: 'The docs\' example: transaction 1 updates account 11111, and transaction 2 updates account 22222. Each UPDATE takes a row-level lock on its row. There is no conflict yet, and both succeed.'
			},
			{
				add: ['t2 -.->|"waits for"| r1'],
				highlight: ['r1'],
				note: 'Transaction 2 now updates 11111 too. That row is locked by transaction 1, so transaction 2 waits for it to commit or roll back. Most waits end as soon as the other transaction finishes.'
			},
			{
				add: ['t1 -.->|"waits for"| r2'],
				highlight: ['r2'],
				note: 'Transaction 1 now updates 22222, which transaction 2 holds. Transaction 1 waits for 2, and 2 waits for 1: a cycle. The docs: a lock wait lasts indefinitely "so long as no deadlock situation is detected", and here neither transaction will release its lock.'
			},
			{
				add: ['det["Deadlock check after deadlock_timeout"] -->|"finds the cycle, aborts one"| t1'],
				highlight: ['det'],
				note: 'After waiting `deadlock_timeout` (1 second by default), the waiter looks for a cycle in the graph of who waits for whom. It finds one, so it cancels its own lock request, and its transaction fails with `deadlock detected`. The other one gets the lock and goes on. Which one fails is "difficult to predict and should not be relied upon".'
			},
			{
				add: ['order["Fix: every transaction locks 11111, then 22222"] -.-> r1'],
				highlight: ['order'],
				note: 'If both transactions had updated the rows in the same order, the second would have waited at the first row, and no cycle could form. The docs call this "the best defense against deadlocks".'
			}
		]
	},
	example: {
		title: 'src/backend/storage/lmgr/deadlock.c: find the cycle, fix the queue or abort',
		repo: 'postgres/postgres',
		url: `${DEADLOCK}#L207-L1138`,
		lang: 'c',
		code: ` * This code looks for deadlocks involving the given process.  If any
 * are found, it tries to rearrange lock wait queues to resolve the
 * deadlock.  If resolution is impossible, return DS_HARD_DEADLOCK ---
 * the caller is then expected to abort the given proc's transaction.
…
DeadLockState
DeadLockCheck(PGPROC *proc)
{
…
	/* Search for deadlocks and possible fixes */
	if (DeadLockCheckRecurse(proc))
	{
		/*
		 * Call FindLockCycle one more time, to record the correct
		 * deadlockDetails[] for the basic state with no rearrangements.
		 */
		int			nSoftEdges;

		TRACE_POSTGRESQL_DEADLOCK_FOUND();

		nWaitOrders = 0;
		if (!FindLockCycle(proc, possibleConstraints, &nSoftEdges))
			elog(FATAL, "deadlock seems to have disappeared");

		return DS_HARD_DEADLOCK;	/* cannot find a non-deadlocked state */
	}
…
	/* Return code tells caller if we had to escape a deadlock or not */
	if (nWaitOrders > 0)
		return DS_SOFT_DEADLOCK;
	else if (blocking_autovacuum_proc != NULL)
		return DS_BLOCKED_BY_AUTOVACUUM;
	else
		return DS_NO_DEADLOCK;
}
…
	ereport(ERROR,
			(errcode(ERRCODE_T_R_DEADLOCK_DETECTED),
			 errmsg("deadlock detected"),
			 errdetail_internal("%s", clientbuf.data),
			 errdetail_log("%s", logbuf.data),
			 errhint("See server log for query details.")));`,
		notes: [
			'A process that cannot get a lock goes to sleep without any check and sets a timer, which the README calls ["optimistic waiting"](' + README + '#L346-L360). Only if the timer fires does it run `DeadLockCheck` (lines 6 to 35). Most waits end before that, so they never pay for the check. The config docs give the default, one second, and suggest it "should exceed your typical transaction time".',
			'The [README](' + README + '#L393-L410) draws an edge in the waits-for graph (WFG) from A to B "if A waits for B", and "There is a deadlock condition if and only if the WFG contains a cycle." To break it, PostgreSQL cancels the lock request of the process that ran the check: "it\'s sufficient to cancel one request to remove the cycle".',
			'If A only waits because it is queued behind B, the README calls that a ["soft" edge](' + README + '#L428-L442), and reordering the wait queue can remove the cycle. In lines skipped here, the code rebuilds the wait queues, and line 30 returns `DS_SOFT_DEADLOCK`: no transaction is aborted. Only when no order works does line 25 return `DS_HARD_DEADLOCK`, and the caller aborts the transaction.',
			'Lines 37 to 42 raise the error, and `DeadLockReport` writes one line per process: "Process %d waits for %s on %s; blocked by process %d." The error code is `40P01`, the one Synapse retries (day 19). The [docs](' + MVCC + '#L1491-L1501) say retrying is the fallback when you cannot guarantee a consistent lock order.'
		]
	},
	tradeoff: {
		gain: [
			'Row locks are automatic: two UPDATEs on the same row never interleave, and the second one works on the committed result of the first.',
			'Plain SELECTs never take row locks, so locks only slow down writers on the same rows.',
			'PostgreSQL finds a deadlock cycle after `deadlock_timeout` and aborts one transaction, so the others can finish.'
		],
		cost: [
			'Every lock is held until the transaction ends, so a slow transaction, or one waiting on user input, makes every other writer of those rows wait.',
			'With `lock_timeout` at zero (the default), a wait has no limit, and one stuck transaction can pile up a queue of requests behind it.',
			'Deadlock detection costs one `deadlock_timeout` of waiting, then one aborted transaction you must retry.',
			'With SELECT FOR UPDATE, every caller that locks the same rows runs one at a time.'
		]
	},
	task: {
		prompt: 'Open two `psql` sessions on the docs\' `accounts` table. Reproduce the deadlock: session 1 updates 11111, session 2 updates 22222 then 11111, session 1 updates 22222. Write what each session prints. Then rewrite the transfer so the two can never deadlock, and say what to set so a stuck lock fails fast instead of waiting.',
		hint: 'The order of the two UPDATEs inside a transfer depends on the direction of the money. Pick an order that does not.',
		answer: [
			'Session 2 blocks on its second UPDATE. Session 1 blocks on 22222. After about one second, one of them prints `ERROR: deadlock detected` with "Process N waits for ShareLock on transaction M; blocked by process P." lines. The other UPDATE then completes.',
			'The failed session\'s transaction is aborted: run `ROLLBACK`, then retry it from the start.',
			'Fix: lock the two rows in a fixed order, for example the lower account number first, whatever the direction: `UPDATE accounts ... WHERE acctnum = 11111;` then `... WHERE acctnum = 22222;`. Now the second transfer waits at the first row instead of grabbing the other one.',
			'Fail fast: `SET lock_timeout = \'2s\';` in the transaction. A statement that waits longer than 2 seconds for any lock is aborted, which is better than a request hanging. Use `SELECT ... FOR UPDATE NOWAIT` to fail at once instead.',
			'To see who blocks whom while it hangs: `SELECT pid, pg_blocking_pids(pid), query FROM pg_stat_activity WHERE wait_event_type = \'Lock\';`'
		],
		steps: [
			{
				title: 'Take the first locks',
				questions: [
					{ q: 'Session 1 runs `BEGIN;` and updates account 11111. What does it hold now?', options: ['Nothing until it commits', 'A row lock on 11111, until its transaction ends', 'A lock on the whole `accounts` table', 'A lock that ends with the statement'], answer: 1, why: 'Every UPDATE takes a row lock on each row it touches, held until the transaction ends.' },
					{ q: 'Session 2 runs `BEGIN;` and updates 22222. What happens?', options: ['It succeeds at once: no one holds that row', 'It waits for session 1 to commit', 'It fails with `deadlock detected`', 'It waits one `deadlock_timeout`, then succeeds'], answer: 0, why: 'Each transaction holds a different row. There is no conflict yet.' },
					{ q: 'Session 2 now updates 11111. What happens?', options: ['It succeeds, since it already holds a row lock', 'It fails at once with an error', 'It overwrites session 1\'s change', 'It blocks, waiting for session 1 to finish'], answer: 3, why: 'That row is locked by session 1, so session 2 waits for it to commit or roll back.' },
					{ q: 'While session 2 waits, a third session runs `UPDATE accounts ... WHERE acctnum = 22222`. What happens to it?', options: ['It succeeds at once, since session 2 is busy waiting', 'It fails with `deadlock detected`', 'It waits for session 2, which holds row 22222', 'It waits for session 1, which holds 11111'], answer: 2, why: 'Session 2 still holds the row lock it took on 22222, even while it waits for 11111. A second writer on that row queues behind it. There is no cycle, so no deadlock.' }
				]
			},
			{
				title: 'Close the cycle',
				questions: [
					{ q: 'Session 1 now updates 22222. What happens first?', options: ['It succeeds, since session 2 is waiting', 'Session 2\'s update completes', 'It blocks too: each session waits for the other', 'PostgreSQL aborts both sessions'], answer: 2, why: 'Session 1 waits for 2, and 2 waits for 1: a cycle in the waits-for graph.' },
					{ q: 'How long until PostgreSQL acts?', options: ['About one second, the default `deadlock_timeout`', 'Forever, since `lock_timeout` is 0', 'Until one of the clients disconnects', 'At the next checkpoint'], answer: 0, why: 'A waiter checks for a cycle only after sleeping `deadlock_timeout`, one second by default.' },
					{ q: 'What does the failing session print?', options: ['`ERROR: canceling statement due to lock timeout`', '`ERROR: deadlock detected`, with "Process N waits for ShareLock on transaction M; blocked by process P." lines', '`ERROR: could not serialize access due to concurrent update`', '`WARNING: lock wait too long`'], answer: 1, why: '`DeadLockReport` writes one line per process in the cycle. The error code is `40P01`.' },
					{ q: 'Why does a waiting session sleep a whole `deadlock_timeout` before it looks for a cycle?', options: ['The check needs a checkpoint to run first', 'It waits for the client to cancel the statement', 'A cycle only forms after one second', 'Most lock waits end on their own before that, so they never pay for the check'], answer: 3, why: 'The README calls it "optimistic waiting". The check is costly, and the config docs suggest a timeout above your typical transaction time.' }
				]
			},
			{
				title: 'Recover and fix the order',
				questions: [
					{ q: 'What does the failed session do next?', options: ['`ROLLBACK`, then run the whole transfer again', '`COMMIT`, since its first update worked', 'Run only the failed UPDATE again', 'Nothing: PostgreSQL retries it'], answer: 0, why: 'Its transaction is aborted. Roll it back and retry from the start.' },
					{ q: 'Can you know in advance which session will fail?', options: ['Yes: the one that started its transaction last is always aborted', 'Yes: the one holding fewer locks is always the one to fail', 'No: the docs say it is difficult to predict and should not be relied upon', 'Yes, always session 1'], answer: 2, why: 'So the code must be ready to retry either transaction.' },
					{ q: 'With the lower account number first, a transfer moves money from 22222 to 11111. Which UPDATE does it run first?', options: ['The debit of 22222, since the money leaves it first', 'The one on 11111, the lower number, even though it is the credit', 'Both rows in one statement, in no set order', 'Whichever row is not locked at that moment'], answer: 1, why: 'The order follows the account numbers, not the direction of the money. So both transfers start at 11111 whatever they do.' },
					{ q: 'With the fixed order, what does the second transfer do?', options: ['It takes the other row first, then waits for 11111', 'It fails at once with `could not obtain lock on row`', 'It still deadlocks, only after one second', 'It waits at the first row until the first transfer ends'], answer: 3, why: 'Both start with 11111, so the second one waits there and never holds a row the first one needs.' }
				]
			},
			{
				title: 'Fail fast instead of waiting',
				questions: [
					{ q: 'Which setting makes a stuck lock wait fail after 2 seconds?', options: ['`SET deadlock_timeout = \'2s\';`', '`SET statement_timeout = 0;`', '`SET lock_timeout = \'2s\';`', '`SET idle_in_transaction_session_timeout = \'2s\';`'], answer: 2, why: '`lock_timeout` aborts a statement that waits longer than that for any lock.' },
					{ q: 'What is `lock_timeout` by default?', options: ['0, which means off: a wait can last forever', '1 second, like `deadlock_timeout`', '30 seconds', '5 minutes'], answer: 0, why: 'Off by default, so one stuck transaction can pile up a queue of requests behind it.' },
					{ q: 'How do you fail at once if the row is locked?', options: ['`SELECT ... FOR SHARE`', '`SET lock_timeout = 0;`', '`SET deadlock_timeout = 0;`', '`SELECT ... FOR UPDATE NOWAIT`'], answer: 3, why: '`NOWAIT` raises an error instead of waiting for the lock. A `lock_timeout` of 0 turns the limit off.' },
					{ q: 'While a session hangs, how do you see who blocks it?', options: ['`SELECT * FROM pg_stat_user_tables;`', '`SELECT pid, pg_blocking_pids(pid), query FROM pg_stat_activity WHERE wait_event_type = \'Lock\';`', '`EXPLAIN ANALYZE` on the hanging UPDATE', '`SHOW deadlock_timeout;`'], answer: 1, why: '`pg_blocking_pids` returns the processes that hold the lock each waiter wants.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Transaction A has run `UPDATE orders SET status = \'paid\' WHERE id = 7` and not committed. Transaction B runs `SELECT * FROM orders WHERE id = 7`. What happens to B?',
			options: [
				'It waits until A commits or rolls back, then reads the new status',
				'It returns at once with the old status, because reads take no row lock',
				'It fails with a serialization error because the row is being changed',
				'It returns at once with the new status, because A holds the row lock'
			],
			answer: 1,
			why: 'Row-level locks "block only writers and lockers to the same row". A plain SELECT reads the version its snapshot allows (day 18), which is the old one until A commits.'
		},
		{
			q: 'Two transactions deadlock on two rows. What does PostgreSQL do?',
			options: [
				'It aborts both, so neither can leave half its changes behind',
				'It waits for `lock_timeout`, then cancels the newer transaction',
				'After `deadlock_timeout`, it aborts one, and the other continues',
				'It lets both continue, since row locks never block one another'
			],
			answer: 2,
			why: 'A waiter checks for a cycle after `deadlock_timeout`. When it finds one, cancelling one lock request is enough to break it. Which transaction fails is hard to predict, so the code must be ready to retry either.'
		},
		{
			q: 'Transfers between two accounts sometimes deadlock. What is the most reliable fix?',
			options: [
				'Raise `deadlock_timeout`, so the check happens less often',
				'Lock the two rows in the same order in every transaction',
				'Run transfers under Serializable so the database orders them',
				'Read both rows with a plain SELECT before you update them'
			],
			answer: 1,
			why: 'A deadlock needs a cycle, and a cycle needs two transactions taking locks in opposite orders. With one global order, the second transaction waits at the first lock and no cycle can form.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Cause a real deadlock, watch who blocks whom, then make the transfer deadlock-free and make waits fail fast.',
		steps: [
			'Start a throwaway PostgreSQL 18 and open `psql` in three terminals: `docker run --rm -d --name pg-lab -e POSTGRES_PASSWORD=lab postgres:18`, wait a few seconds, then `docker exec -it pg-lab psql -U postgres` in each. In terminal 1: `CREATE TABLE accounts (acctnum int primary key, balance numeric not null); INSERT INTO accounts VALUES (11111, 1000), (22222, 1000);`',
			'Opposite orders: in 1, `BEGIN; UPDATE accounts SET balance = balance + 100.00 WHERE acctnum = 11111;`. In 2, `BEGIN; UPDATE accounts SET balance = balance + 100.00 WHERE acctnum = 22222; UPDATE accounts SET balance = balance - 100.00 WHERE acctnum = 11111;` (it hangs). In 3: `SELECT pid, pg_blocking_pids(pid), query FROM pg_stat_activity WHERE wait_event_type = \'Lock\';`',
			'Close the cycle: in 1, `UPDATE accounts SET balance = balance - 100.00 WHERE acctnum = 22222;`. Wait about a second and read both terminals. Then run `ROLLBACK;` in both.',
			'Same order: in 1, `BEGIN; UPDATE accounts SET balance = balance - 100.00 WHERE acctnum = 11111;`. In 2, `BEGIN; UPDATE accounts SET balance = balance + 100.00 WHERE acctnum = 11111;` (it waits). In 1, `UPDATE accounts SET balance = balance + 100.00 WHERE acctnum = 22222; COMMIT;`. In 2, `UPDATE accounts SET balance = balance - 100.00 WHERE acctnum = 22222; COMMIT;`',
			'Fail fast: in 1, `BEGIN; SELECT * FROM accounts WHERE acctnum = 11111 FOR UPDATE;`. In 2, `BEGIN; SET lock_timeout = \'2s\'; UPDATE accounts SET balance = 0 WHERE acctnum = 11111;` then `ROLLBACK; SELECT * FROM accounts WHERE acctnum = 11111 FOR UPDATE NOWAIT;`. Run `ROLLBACK;` in 1, then `docker stop pg-lab`.'
		],
		done: [
			'In step 2, terminal 3 shows the waiting `UPDATE ... 11111` with the pid of terminal 1 in `pg_blocking_pids`.',
			'In step 3, one terminal prints `ERROR:  deadlock detected` with two "Process ... waits for ShareLock on transaction ...; blocked by process ..." lines, and the other one\'s UPDATE completes.',
			'In step 4, both terminals print `COMMIT` and no error. In step 5, the UPDATE fails with `canceling statement due to lock timeout` after about 2 seconds, and `NOWAIT` fails at once with `could not obtain lock on row in relation "accounts"`.'
		],
		solution: [
			'Opposite orders make each transaction hold one row and want the other: a cycle that only an abort can break, after `deadlock_timeout`.',
			'With one fixed order (lower account number first), the second transfer waits at the first row and cannot hold a row the first one needs.',
			'`lock_timeout` bounds every lock wait, and `NOWAIT` skips the wait. Either way the app gets an error it can retry instead of a hanging request.'
		]
	},
	recall: {
		q: 'A transfer from A to B and one from B to A sometimes fail with `deadlock detected`. Why, and what change stops it?',
		a: 'Each transfer locks one account row and waits for the row the other holds. Lock the two rows in one fixed order, for example the lower account number first, so the second transfer waits at the first row.'
	},
	sources: [
		{ title: 'PostgreSQL docs, Explicit Locking', url: 'https://www.postgresql.org/docs/18/explicit-locking.html' },
		{ title: 'PostgreSQL docs, Lock Management settings', url: 'https://www.postgresql.org/docs/18/runtime-config-locks.html' },
		{ title: 'PostgreSQL source, src/backend/storage/lmgr/README', url: `${README}` },
		{ title: 'PostgreSQL source, deadlock.c', url: `${DEADLOCK}` }
	]
};
