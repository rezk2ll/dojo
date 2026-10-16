const PG = 'https://github.com/postgres/postgres/blob/92d47d544bf64274b6a7aa8775f7b35bcf71f339';
const DEADLOCK = `${PG}/src/backend/storage/lmgr/deadlock.c`;
const README = `${PG}/src/backend/storage/lmgr/README`;
const MVCC = `${PG}/doc/src/sgml/mvcc.sgml`;
const CONFIG = `${PG}/doc/src/sgml/config.sgml`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'locks',
	part: 'Many at once',
	title: 'Locks and deadlocks',
	minutes: 10,
	hook: [
		'A refund job moves money from account A to account B. At the same moment, a transfer moves money from B to A. Both hang for a second, then one fails with **`ERROR: deadlock detected`**. Nobody wrote a lock in the code.',
		'MVCC (day 18) lets readers and writers pass each other. **Two writers on the same row still take turns.** Every UPDATE or DELETE takes a row lock, held until the transaction ends. The next writer on that row waits.',
		'Waiting is fine until two transactions wait for each other. Each holds one row and wants the other\'s. **Neither can move.** PostgreSQL notices, aborts one of them, and the other goes on. This chapter is about how it notices, and the one habit that stops it from happening at all.'
	],
	terms: [
		{ term: 'Row lock', def: 'Taken by UPDATE, DELETE and SELECT FOR UPDATE on each row they touch. It blocks other writers and lockers of that row, never plain readers. Released when the transaction ends.' },
		{ term: 'SELECT FOR UPDATE', def: 'Reads rows and locks them as if you were about to update them. Others who want to change or lock those rows wait until your transaction ends.' },
		{ term: 'Lock queue', def: 'Each locked object has a wait queue. Conflicting requests are granted in order of arrival, so a waiter can also block everyone who comes after it.' },
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
				note: '**Each takes a row.** The docs\' example: transaction 1 updates account 11111, transaction 2 updates account 22222. Each UPDATE takes a row-level lock on its row. No conflict yet, both succeed.'
			},
			{
				add: ['t2 -.->|"waits for"| r1'],
				highlight: ['r1'],
				note: '**One waits.** Transaction 2 now updates 11111 too. That row is locked by transaction 1, so transaction 2 waits for it to commit or roll back. Waiting is normal: most waits end as soon as the other transaction finishes.'
			},
			{
				add: ['t1 -.->|"waits for"| r2'],
				highlight: ['r2'],
				note: '**A cycle.** Transaction 1 now updates 22222, which transaction 2 holds. Transaction 1 waits for 2, and 2 waits for 1. "So long as no deadlock situation is detected", a lock wait lasts indefinitely. Here nothing will ever release.'
			},
			{
				add: ['det["Deadlock check after deadlock_timeout"] -->|"finds the cycle, aborts one"| t1'],
				highlight: ['det'],
				note: '**PostgreSQL breaks it.** After waiting `deadlock_timeout` (1 second by default), the waiter looks for a cycle in the graph of who waits for whom. It finds one, so it cancels its own lock request and its transaction fails with `deadlock detected`. The other one gets the lock and goes on. Which one fails is "difficult to predict and should not be relied upon".'
			},
			{
				add: ['order["Fix: every transaction locks 11111, then 22222"] -.-> r1'],
				highlight: ['order'],
				note: '**Lock in one order.** If both transactions had updated the rows in the same order, the second would simply have waited at the first row, and no cycle could form. The docs call this "the best defense against deadlocks".'
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
			'**Wait first, check later.** The lock manager uses ["optimistic waiting"](' + README + '#L346-L360): a process that cannot get a lock goes to sleep without any check, and sets a timer. Only if the timer fires does it run this code. Most waits end before that, so they never pay for the check. The [config docs](' + CONFIG + '#L11255-L11270) give the default, one second, and suggest it "should exceed your typical transaction time".',
			'**The waits-for graph.** The [README](' + README + '#L393-L410) draws an edge from A to B "if A waits for B". "There is a deadlock condition if and only if the WFG contains a cycle." To break it, PostgreSQL cancels the lock request of the process that ran the check: "it\'s sufficient to cancel one request to remove the cycle".',
			'**Sometimes nobody dies.** If A only waits because it is queued behind B, that is a ["soft" edge](' + README + '#L428-L442), and reordering the wait queue can remove the cycle. In the [lines skipped here](' + DEADLOCK + '#L248-L277), the code rebuilds the wait queues and returns `DS_SOFT_DEADLOCK`. Only when no order works does it return `DS_HARD_DEADLOCK`, and the transaction is aborted.',
			'**What you see.** [`DeadLockReport`](' + DEADLOCK + '#L1106-L1112) writes one line per process: "Process %d waits for %s on %s; blocked by process %d." The error code is `40P01`, the one Synapse retries (day 19). The [docs](' + MVCC + '#L1491-L1501) say retrying is the fallback when you cannot guarantee a consistent lock order.'
		]
	},
	tradeoff: {
		gain: [
			'Row locks are automatic: two UPDATEs on the same row never interleave, and the second one works on the committed result of the first.',
			'Plain SELECTs never take row locks, so locks only slow down writers on the same rows.',
			'Deadlocks do not hang forever. PostgreSQL finds the cycle and aborts one transaction so the rest can finish.'
		],
		cost: [
			'Every lock is held until the transaction ends. A slow transaction, or one waiting on user input, makes every other writer of those rows wait.',
			'A wait has no limit by default. Without `lock_timeout`, one stuck transaction can pile up a queue of requests behind it.',
			'Deadlock detection costs one `deadlock_timeout` of waiting, then one aborted transaction you must retry.',
			'SELECT FOR UPDATE makes contention explicit: correct, but every caller that locks the same rows now runs one at a time.'
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
	takeaway: 'Writers on the same row take turns, and locks last until commit. Keep transactions short, take locks in one fixed order, set a lock_timeout, and retry the rare deadlock.',
	sources: [
		{ title: 'PostgreSQL docs, Explicit Locking', url: 'https://www.postgresql.org/docs/18/explicit-locking.html' },
		{ title: 'PostgreSQL docs, Lock Management settings', url: 'https://www.postgresql.org/docs/18/runtime-config-locks.html' },
		{ title: 'PostgreSQL source, src/backend/storage/lmgr/README', url: `${README}` },
		{ title: 'PostgreSQL source, deadlock.c', url: `${DEADLOCK}` }
	]
};
