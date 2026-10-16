const SYNAPSE = 'https://github.com/element-hq/synapse/blob/26a92c711161be9f9b8c69b33144ba7fe5b31063';
const DB = `${SYNAPSE}/synapse/storage/database.py`;
const ENGINE = `${SYNAPSE}/synapse/storage/engines/postgres.py`;
const MVCC = 'https://github.com/postgres/postgres/blob/92d47d544bf64274b6a7aa8775f7b35bcf71f339/doc/src/sgml/mvcc.sgml';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'isolation',
	part: 'Many at once',
	title: 'Isolation levels',
	minutes: 10,
	hook: [
		'One item left in stock. Two customers click "buy" in the same second. Each checkout reads `stock = 1`, decides there is enough, and writes `stock = 0`. **Both orders go through. You sold one item twice.**',
		'Each checkout ran in a transaction, and nothing failed or was half done. The problem is between them: **each one acted on a value the other was about to change**. Atomicity (day 17) does not cover that. The isolation level decides what a transaction sees of the others, and which of these races PostgreSQL stops.',
		'PostgreSQL has three levels. Read Committed, the default, takes a new snapshot (day 18) for each statement. Repeatable Read keeps the snapshot of the first statement for the whole transaction, and Serializable also tracks what each transaction read. When a stricter level catches a race, it **aborts your transaction**, and your code has to run it again.'
	],
	terms: [
		{ term: 'Lost update', def: 'Two transactions read a value, compute a new one in the app, and write it back. The second write silently erases the first.' },
		{ term: 'Write skew', def: 'Two transactions read the same rows, check a rule, and each writes a different row. Each write is fine alone. Together they break the rule.' },
		{ term: 'Serialization failure', def: 'The error PostgreSQL raises to stop an anomaly, always with SQLSTATE 40001. The fix is to roll back and run the whole transaction again.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['rc["Read Committed (default): new snapshot per statement"] -->|"read in app, write back"| lost["Lost update: both commit, one write is gone"]'],
				highlight: ['rc', 'lost'],
				note: 'Each checkout runs `SELECT stock`, then `UPDATE ... SET stock = 0`. The second UPDATE waits for the first to commit, then applies its own value on top, and both succeed. Read Committed is "fast and simple to use", but the docs say it "is not sufficient for all cases".'
			},
			{
				add: ['rr["Repeatable Read: one snapshot per transaction"] -->|"row changed since my snapshot"| err1["ERROR 40001: could not serialize access due to concurrent update"]'],
				highlight: ['rr', 'err1'],
				note: 'Under Repeatable Read, the second checkout\'s snapshot shows `stock = 1`. By the time it updates, another transaction has changed and committed the row, so PostgreSQL rolls the second transaction back instead of writing over it. The docs: such a transaction "cannot modify or lock rows changed by other transactions after the repeatable read transaction began".'
			},
			{
				add: ['rr -.->|"different rows written"| skew["Write skew: still allowed"]'],
				highlight: ['skew'],
				note: 'Repeatable Read misses write skew. The docs\' example: transaction A sums the rows of class 1 and inserts the total as a class 2 row, and B sums class 2 and inserts into class 1. They write different rows, so there is no update conflict. Under Repeatable Read "both would be allowed to commit", with a result no serial order could give.'
			},
			{
				add: ['ser["Serializable: tracks read/write dependencies"] -->|"no serial order fits"| err2["ERROR 40001: read/write dependencies among transactions"]'],
				highlight: ['ser', 'err2'],
				note: 'Serializable works like Repeatable Read, but also notes what each transaction read. When the commits could not match any one-at-a-time order, one transaction fails. This tracking "does not introduce any blocking beyond that present in repeatable read", but it costs some overhead.'
			},
			{
				add: ['err1 --> retry["Roll back, run the whole transaction again"]', 'err2 --> retry'],
				highlight: ['retry'],
				note: 'The docs: both levels "must be prepared to retry transactions due to serialization failures". Retry the **whole** transaction, reads included. The second time, its snapshot already holds the other commit, so it decides on fresh data.'
			}
		]
	},
	example: {
		title: 'synapse/storage/database.py: the Matrix server retries a transaction on 40001',
		repo: 'element-hq/synapse',
		url: `${DB}#L737-L876`,
		lang: 'python',
		code: `        """Start a new database transaction with the given connection.

        Note: The given func may be called multiple times under certain
        failure modes. This is normally fine when in a standard transaction,
        but care must be taken if the connection is in \`autocommit\` mode that
        the function will correctly handle being aborted and retried half way
        through its execution.
…
        try:
            MAX_NUMBER_OF_ATTEMPTS = 5
            for attempt_number in range(1, MAX_NUMBER_OF_ATTEMPTS + 1):
…
                try:
…
                        r = func(cursor, *args, **kwargs)
                        opentracing.log_kv({"message": "commit"})
                        conn.commit()
                        return r
…
                except self.engine.module.DatabaseError as e:
                    if self.engine.is_deadlock(e):
                        transaction_logger.warning(
                            "[TXN DEADLOCK] {%s} %d/%d",
                            name,
                            attempt_number,
                            MAX_NUMBER_OF_ATTEMPTS,
                        )
                        try:
                            with opentracing.start_active_span("db.rollback"):
                                conn.rollback()
                        except self.engine.module.Error as e1:
                            transaction_logger.warning(
                                "[TXN EROLL] {%s} %s",
                                name,
                                e1,
                            )
                        # Keep retrying if we haven't reached max attempts
                        if attempt_number < MAX_NUMBER_OF_ATTEMPTS:
                            continue
                    raise`,
		notes: [
			'Synapse replaces PostgreSQL\'s Read Committed: its engine [sets REPEATABLE READ](' + ENGINE + '#L88-L95) as `default_isolation_level` and applies it to every new connection. So every transaction it runs can get a serialization failure, and every one goes through this loop.',
			'Line 21 decides what is retryable. Despite its name, [`is_deadlock`](' + ENGINE + '#L224-L229) returns true for two codes: `40001` (serialization_failure) and `40P01` (deadlock_detected). The PostgreSQL docs recommend the same list: 40001 always, and "It may also be advisable to retry deadlock failures."',
			'Lines 28 to 30 roll back, and line 39 continues the loop, which calls `func` again from the start (line 15), up to 5 attempts in all (line 10). After the last one, line 40 raises. The docs: "abort the current transaction and retry the whole transaction from the beginning. The second time through, the transaction will see the previously-committed change" ([source](' + MVCC + '#L549-L554)).',
			'Lines 3 to 7 warn that the function must be safe to run twice: "The given func may be called multiple times under certain failure modes." Side effects outside the database, like sending a message, must wait for the commit, or they happen once per attempt.'
		]
	},
	tradeoff: {
		gain: [
			'Repeatable Read stops lost updates with no code change in the query: the second writer fails instead of overwriting.',
			'Serializable lets you reason about each transaction alone: if it is right when run by itself, it is right in any mix, or it does not commit.',
			'Neither level makes readers wait: predicate locks in Serializable "do not cause any blocking".'
		],
		cost: [
			'Every transaction under Repeatable Read or Serializable can fail with 40001, so every call site needs a retry loop around the whole transaction.',
			'Retries cost work and latency, and under heavy contention the same transaction may fail several times.',
			'Serializable tracks reads, which costs memory and CPU, and its read locks "often need to be kept past transaction commit".',
			'Read Committed never raises 40001, so a lost update goes unnoticed: the stock is wrong and no error is logged.'
		]
	},
	task: {
		prompt: 'Rule: a shop must always keep at least one admin. Two admins, Ana and Ben, each open the settings page and click "remove my admin role" at the same time. The code runs `SELECT count(*) FROM users WHERE admin` and, if the count is above 1, `UPDATE users SET admin = false WHERE id = me`. What happens under Read Committed, Repeatable Read and Serializable? Then sketch the retry loop.',
		hint: 'Each transaction updates a different row. Which level looks beyond row conflicts?',
		answer: [
			'Read Committed: both count 2, both update their own row. No conflict on any row, both commit. The shop has zero admins.',
			'Repeatable Read: both commit too. Each snapshot shows 2 admins, and the two UPDATEs touch different rows, so no 40001. This is write skew.',
			'Serializable: each read the rows the other wrote. No serial order gives "zero admins", so one of the two fails with 40001. On retry, it counts 1 and refuses.',
			'Retry loop: `for attempt in 1..5: BEGIN ISOLATION LEVEL SERIALIZABLE; run the whole function; COMMIT; return`. On SQLSTATE 40001 (and 40P01): ROLLBACK, maybe wait a little, loop. After the last attempt, raise.',
			'Without Serializable, lock what the rule reads: `SELECT ... FROM users WHERE admin FOR UPDATE` makes the second admin wait for the first (day 20).'
		]
	},
	quiz: [
		{
			q: 'Under Read Committed, two checkouts each `SELECT stock` (1), then each runs `UPDATE items SET stock = 0`. What is the result?',
			options: [
				'The second UPDATE fails with a serialization error and must be retried',
				'Both commit, stock is 0, and the item has been sold twice',
				'The second UPDATE sees stock 0 and skips the row because it changed',
				'The second checkout blocks at its SELECT until the first one commits'
			],
			answer: 1,
			why: 'Read Committed does not raise serialization errors. The second UPDATE waits for the first, then writes its own value. The value was computed from a stale read in the app, so one sale is lost. `SET stock = stock - 1 WHERE stock > 0` or a stricter level fixes it.'
		},
		{
			q: 'Under Repeatable Read, your transaction updates a row that another transaction changed and committed after yours began. What happens?',
			options: [
				'Your UPDATE applies on top of the newer version of that row',
				'Your UPDATE waits, then silently skips the row that changed',
				'Your transaction fails with 40001 and must be run again',
				'Your UPDATE overwrites the newer version with your own value'
			],
			answer: 2,
			why: 'A Repeatable Read transaction cannot modify a row changed by others after it began. PostgreSQL raises "could not serialize access due to concurrent update". The fix is to retry the whole transaction, which then starts from the new version.'
		},
		{
			q: 'Two transactions each read the same rows, check a rule, and write to different rows. Together they break the rule. Which level is the lowest that stops it?',
			options: [
				'Read Committed, because each statement takes a fresh snapshot',
				'Repeatable Read, because the whole transaction has one snapshot',
				'Serializable, because it tracks what each transaction read',
				'None of them: only an explicit table lock can prevent this'
			],
			answer: 2,
			why: 'This is write skew. There is no conflict on any single row, so Repeatable Read lets both commit. Serializable tracks read/write dependencies and fails one of them. Explicit locks also work, but they are not the only way.'
		}
	],
	recall: {
		q: 'Two admins remove their own admin role at the same time, and the shop ends with zero admins. Which isolation level stops it, and what must your code do then?',
		a: 'Serializable. It fails one of the two transactions with SQLSTATE 40001, and your code rolls back and retries the whole transaction, which then counts 1 admin and refuses.'
	},
	sources: [
		{ title: 'PostgreSQL docs, Transaction Isolation', url: 'https://www.postgresql.org/docs/18/transaction-iso.html' },
		{ title: 'PostgreSQL docs, Serialization Failure Handling', url: 'https://www.postgresql.org/docs/18/mvcc-serialization-failure-handling.html' },
		{ title: 'PostgreSQL docs, SET TRANSACTION', url: 'https://www.postgresql.org/docs/18/sql-set-transaction.html' },
		{ title: 'Synapse, engines/postgres.py (isolation level set on each new connection)', url: `${ENGINE}#L191-L192` }
	]
};
