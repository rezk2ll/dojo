const OBAN = 'https://github.com/oban-bg/oban/blob/0704bf0018bfc915560998fbdfb899dd508f5aff/lib/oban';
const BASIC = `${OBAN}/engines/basic.ex`;
const PGSRC = 'https://github.com/postgres/postgres/blob/26bd08fb5c069fbdf55867adc398cfca0f55d5c8/src/backend/optimizer/plan/subselect.c?plain=1';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'job-queue',
	part: 'Many at once',
	title: 'A job queue in the database',
	minutes: 10,
	hook: [
		'You send welcome emails from a background job. You start a second worker to go faster, and **every new user now gets two emails**. Both workers ran `SELECT ... WHERE state = \'available\' LIMIT 1` and got the same row.',
		'So you add `FOR UPDATE`. The duplicates stop, but **the second worker now waits on the first one\'s lock** instead of taking the next job. With ten workers, one works and nine wait on its lock.',
		'PostgreSQL has a clause made for this: `FOR UPDATE SKIP LOCKED`. **Each worker locks the jobs it can get right now and walks past the ones another worker holds.** Oban, River and solid_queue use this clause to run a job queue inside the database you already have.'
	],
	terms: [
		{ term: 'SKIP LOCKED', def: 'A locking option for SELECT: rows that another transaction has locked are left out of the result instead of waited for.' },
		{ term: 'Claim', def: 'Moving a job from `available` to `executing` and recording who took it, in one short transaction, so no other worker picks it.' },
		{ term: 'Rescue', def: 'Putting a job back to `available` when its worker died while it was `executing`. Found by age: it has been running far too long.' },
		{ term: 'Transactional enqueue', def: 'Inserting the job in the same transaction as the data it is about. If the transaction rolls back, the job never existed.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['jobs[("oban_jobs: 1, 2, 3, 4 available")]', 'w1["Worker A: SELECT ... LIMIT 2 FOR UPDATE SKIP LOCKED"] -->|"locks 1, 2"| jobs'],
				highlight: ['w1', 'jobs'],
				note: 'Worker A asks for two available jobs in priority order and locks them. In the same transaction it sets them to `executing`, adds one to `attempt`, and commits. The lock lasts milliseconds, not the length of the job.'
			},
			{
				add: ['w2["Worker B: same query, at the same moment"] -->|"skips 1, 2, locks 3, 4"| jobs'],
				highlight: ['w2'],
				note: 'Worker B does not wait. Rows 1 and 2 are locked by A, so SKIP LOCKED leaves them out and B gets 3 and 4. Without SKIP LOCKED, B would block on row 1 until A commits, then find it no longer `available`.'
			},
			{
				add: ['w1 -->|"UPDATE state = completed"| done["Job finished"]', 'w2 -.->|"crashes while executing"| stuck["Job 3 stuck in executing"]'],
				highlight: ['done', 'stuck'],
				note: 'A marks its jobs `completed` with one more UPDATE. B\'s process dies mid-job. Job 3 is no longer locked (the claim already committed), but it still says `executing`, so nobody will pick it.'
			},
			{
				add: ['res["Rescue: executing and attempted_at older than the cutoff"] --> stuck', 'stuck -->|"back to available"| jobs'],
				highlight: ['res'],
				note: 'A periodic rescue query finds jobs that have been `executing` for too long and resets them to `available`, or to `discarded` if they used all their attempts. Job 3 can then run a second time, so jobs must be idempotent (day 23).'
			},
			{
				add: ['ins["App: INSERT job + NOTIFY, then COMMIT"] -->|"wake up"| w1'],
				highlight: ['ins'],
				note: 'Workers do not need to poll every second. The app can run `NOTIFY` when it inserts a job, and idle workers that ran `LISTEN` wake up at once. PostgreSQL delivers the message only when the inserting transaction commits, so a worker never wakes for a job that was rolled back.'
			}
		]
	},
	example: {
		title: 'lib/oban/engines/basic.ex: how an Oban worker claims jobs',
		repo: 'oban-bg/oban',
		url: `${BASIC}#L107-L144`,
		lang: 'elixir',
		code: `  def fetch_jobs(%Config{} = conf, %{} = meta, running) do
    demand = meta.limit - map_size(running)

    subset_query =
      Job
      |> select([:id])
      |> where([j], j.state == "available")
      |> where([j], j.queue == ^meta.queue)
      |> order_by(asc: :priority, asc: :scheduled_at, asc: :id)
      |> limit(^demand)
      |> lock("FOR UPDATE SKIP LOCKED")

    # The Postgres planner may choose to generate a plan that executes a nested loop over the
    # LIMITing subquery, causing more UPDATEs than LIMIT. That could cause unexpected updates,
    # including attempts > max_attempts in some cases. The solution is to use a CTE as an
    # "optimization fence" that forces Postgres _not_ to optimize the query.
    #
    # The odd "subset" fragment is required to prevent Ecto from applying the prefix to the name
    # of the CTE, e.g. "public"."subset".
    query =
      Job
      |> with_cte("subset", as: ^subset_query)
      |> join(:inner, [j], x in fragment(~s("subset")), on: true)
      |> where([j, x], j.id == x.id)
      |> where([j, _], j.attempt < j.max_attempts)
      |> select([j, _], j)

    updates = [
      set: [state: "executing", attempted_at: utc_now(), attempted_by: [meta.node, meta.uuid]],
      inc: [attempt: 1]
    ]

    Repo.transaction(conf, fn ->
      {_count, jobs} = Repo.update_all(conf, query, updates)

      {meta, jobs}
    end)
  end`,
		notes: [
			'Line 2 sets `demand` to the queue\'s limit minus the jobs already running in this node. Lines 4 to 11 ask for exactly that many, in priority order, and lock them with `FOR UPDATE SKIP LOCKED`. The [SELECT docs](https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE) name this use: SKIP LOCKED "can be used to avoid lock contention with multiple consumers accessing a queue-like table."',
			'Lines 28 to 34 claim the jobs in one UPDATE: it sets `state`, `attempted_at` and `attempted_by`, and adds one to `attempt`, for the ids the CTE returned. The transaction ends right after, on line 37. The row lock was only needed to stop two workers from claiming the same job. From then on the `executing` state says who owns it.',
			'Lines 13 to 16 explain the CTE: a nested loop could run the LIMIT subquery more than once and update more rows than asked. PostgreSQL never inlines a CTE that locks rows: [`contain_dml`](' + PGSRC + '#L1070-L1097) treats a SELECT with `FOR UPDATE` as having side effects, and the inlining check refuses those. PostgreSQL then computes the subset once.',
			'[`rescue_jobs`](' + BASIC + '#L194-L214) finds crashed workers by age: it looks for `state == "executing" and attempted_at < cut`. Jobs with attempts left go back to `available`; the others are set to `discarded`. A job can therefore run twice: once in the crashed worker, once after the rescue.',
			'Oban\'s [Postgres notifier](' + OBAN + '/notifiers/postgres.ex#L6-L11) warns that it "doesn\'t work with connection poolers like [PgBouncer][pgb] when configured in _transaction_ or _statement_ mode" (day 25). The NOTIFY docs add that a payload "must be shorter than 8000 bytes" by default.'
		]
	},
	tradeoff: {
		gain: [
			'You run no separate broker: the queue is in the database you already have, with its backups and its failover.',
			'Transactional enqueue: insert the order and its "send receipt" job in one transaction. Either both exist or neither does, so there is no email for an order that rolled back.',
			'Each job is a row, so you can query jobs, count them by state, retry them with an UPDATE, and join them to your own tables to debug.'
		],
		cost: [
			'Every job is at least an insert and two updates, and each update leaves a dead row (day 16). A busy queue table needs autovacuum to keep up, or scans slow down.',
			'Every claim and every update goes to one primary, which caps throughput. A broker built for streams scales differently once you need very high rates or many consumers per message.',
			'A long-running transaction anywhere in the database holds back vacuum, so the queue table bloats even if the queue itself is healthy.',
			'A job runs at least once, and sometimes twice: a rescued job may already have done part of its work. Jobs must be idempotent (day 23).'
		]
	},
	task: {
		prompt: 'In `psql`, create `jobs(id bigserial primary key, state text not null default \'available\', attempted_at timestamptz, attempt int not null default 0)` and insert 4 rows. Open two sessions. In each, run `BEGIN;` then a query that claims up to 2 available jobs without waiting on the other session. Write the query, say which ids each session gets, and what changes if you drop `SKIP LOCKED`.',
		hint: 'Lock the rows in a CTE with `ORDER BY id LIMIT 2 FOR UPDATE SKIP LOCKED`, then UPDATE the jobs whose id is in it, with `RETURNING id`.',
		answer: [
			'`WITH next AS (SELECT id FROM jobs WHERE state = \'available\' ORDER BY id LIMIT 2 FOR UPDATE SKIP LOCKED) UPDATE jobs SET state = \'executing\', attempted_at = now(), attempt = attempt + 1 FROM next WHERE jobs.id = next.id RETURNING jobs.id;`',
			'Session A (still in its transaction) gets ids 1 and 2. Session B gets 3 and 4 at once: rows 1 and 2 are locked by A, so they are skipped.',
			'Without `SKIP LOCKED`, session B blocks on row 1 until A commits or rolls back. If A commits, B re-checks its WHERE clause on the new row versions (day 21), finds `executing`, and drops rows 1 and 2. The LIMIT sits above the lock step in the plan, so it keeps pulling rows and B ends up with 3 and 4, only later.',
			'In a real worker, `COMMIT` right after the claim. The job runs outside the transaction, and the `executing` state plus `attempted_at` is what a rescue query looks at.'
		]
	},
	quiz: [
		{
			q: 'Two workers run `SELECT id FROM jobs WHERE state = \'available\' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED` at the same moment. What do they get?',
			options: [
				'The same job, because both statements started before either one committed',
				'Different jobs: the second skips the row the first one already locked',
				'One gets a job and the other gets an error saying the row is locked',
				'One gets a job and the other waits until that first transaction ends'
			],
			answer: 1,
			why: 'SKIP LOCKED leaves out rows another transaction holds, so the second worker gets the next available job. An error is what NOWAIT does; waiting is plain FOR UPDATE.'
		},
		{
			q: 'Why do queue libraries commit the claim right away instead of holding the row lock until the job finishes?',
			options: [
				'PostgreSQL cancels any row lock held for more than a few seconds',
				'A held row lock would make every other worker wait on that job',
				'A long open transaction pins a connection and holds back vacuum',
				'NOTIFY messages are dropped while the sender holds a row lock'
			],
			answer: 2,
			why: 'With SKIP LOCKED, other workers would not wait, so that is not the reason. A job can run for minutes: an open transaction for each one would use up connections and stop vacuum from cleaning dead rows across the database (day 16).'
		},
		{
			q: 'Your app inserts an order and runs `NOTIFY jobs` inside one transaction, which then rolls back. What do listening workers see?',
			options: [
				'The notification at once, and then a job row that no longer exists',
				'The notification only after a timeout set by `max_notify_delay`',
				'The notification, but with an empty payload since the data is gone',
				'Nothing, since a NOTIFY is delivered only if its transaction commits'
			],
			answer: 3,
			why: 'The NOTIFY docs say events "are not delivered until and unless the transaction is committed". That matches transactional enqueue: a rolled-back job never existed, and nobody is woken for it.'
		}
	],
	recall: {
		q: 'Ten workers claim jobs from the same table. Which clause lets each one take different jobs without waiting, and how long does it hold the row lock?',
		a: '`FOR UPDATE SKIP LOCKED`. The lock lasts only for the short claim transaction that sets `state = \'executing\'`; the job then runs outside any transaction.'
	},
	sources: [
		{ title: 'PostgreSQL source, subselect.c: the CTE inlining check', url: `${PGSRC}#L960-L968` },
		{ title: 'PostgreSQL docs, SELECT: the locking clause', url: 'https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE' },
		{ title: 'PostgreSQL docs, NOTIFY', url: 'https://www.postgresql.org/docs/current/sql-notify.html' },
		{ title: 'Oban docs, Oban.Notifiers.Postgres', url: 'https://oban.hexdocs.pm/Oban.Notifiers.Postgres.html' }
	]
};
