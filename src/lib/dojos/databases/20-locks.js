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
