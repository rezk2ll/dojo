const RIVER = 'https://github.com/riverqueue/river/blob/f043d9813073c103d447739510745c14a4070f3c';
const PGX = `${RIVER}/riverdriver/riverpgxv5`;
const INSERT = 'https://www.postgresql.org/docs/current/sql-insert.html';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'upserts',
	part: 'Many at once',
	title: 'Upserts and safe retries',
	minutes: 10,
	hook: [
		'A customer taps "Pay" on a train. The request reaches your server and the charge goes through, but **the response is lost in a tunnel**. The app times out and sends the request again. The customer is charged twice.',
		'The retry was the right call: the client could not know whether the first try worked. **The bug is that the server treated the second request as new.** A client that retries after a timeout can send any request twice.',
		'The fix is to make the write idempotent: doing it twice has the same effect as doing it once. **Give each operation a key, and let a unique index decide which attempt is the real one.** `INSERT ... ON CONFLICT` checks the index and writes in one atomic statement.'
	],
	terms: [
		{ term: 'Idempotent', def: 'Running the operation twice leaves the system in the same state as running it once.' },
		{ term: 'Idempotency key', def: 'A unique value the client sends with a request (often a UUID) so the server can recognise a retry of the same request.' },
		{ term: 'Upsert', def: 'Insert a row, or update it if one with the same key exists. In PostgreSQL: `INSERT ... ON CONFLICT ... DO UPDATE`.' },
		{ term: 'Conflict target', def: 'The columns (and optional WHERE) in `ON CONFLICT (...)` that tell PostgreSQL which unique index decides what a duplicate is.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['c["Client: POST /charges, key k-42"] --> s["Server"]', 's -->|"INSERT ... ON CONFLICT (idempotency_key) DO NOTHING"| t[("charges")]'],
				highlight: ['c', 't'],
				note: 'On the first attempt, the server inserts a row keyed by `k-42` before it calls the payment provider. No row with that key exists, so the insert goes through. The request that inserted the row is the one that runs the charge.'
			},
			{
				add: ['t -->|"1 row inserted"| pay["Charge the card, store the result on the row"]'],
				highlight: ['pay'],
				note: 'The server charges the card and saves the outcome next to the key. Then the response is lost on the way back. The client only sees a timeout.'
			},
			{
				add: ['c2["Client retries: same key k-42"] --> s', 't -->|"0 rows, key exists"| saved["Return the saved result"]'],
				highlight: ['c2', 'saved'],
				note: 'The retry sends the same key. The same INSERT now conflicts with the unique index and inserts nothing. The server reads the stored result and sends it back. The card was charged once.'
			},
			{
				add: ['c3["Two retries at the same moment"] --> t', 't -->|"second waits, then conflicts"| saved'],
				highlight: ['c3'],
				note: 'If two copies arrive together, PostgreSQL makes the second INSERT wait on the first one\'s key in the index. When the first commits, the second sees the conflict. No SELECT before the INSERT could give that guarantee (day 22).'
			}
		]
	},
	example: {
		title: 'riverdriver/riverpgxv5/internal/dbsqlc/river_job.sql: River inserts a job only once',
		repo: 'riverqueue/river',
		url: `${PGX}/internal/dbsqlc/river_job.sql#L278-L336`,
		lang: 'sql',
		code: `-- name: JobInsertFastMany :many
WITH raw_job_data AS (
    SELECT
        unnest(@id::bigint[]) AS id,
        unnest(@args::jsonb[]) AS args,
…
        unnest(@unique_key::bytea[]) AS unique_key,
        unnest(@unique_states::integer[]) AS unique_states
)
INSERT INTO /* TEMPLATE: schema */river_job(
    id,
    args,
…
    unique_key,
    unique_states
) SELECT
    coalesce(nullif(id, 0), nextval('/* TEMPLATE: schema */river_job_id_seq'::regclass)),
    args,
…
    nullif(unique_key, '')::bytea,
    nullif(unique_states::integer, 0)::bit(8)
FROM raw_job_data
ON CONFLICT (unique_key)
    WHERE unique_key IS NOT NULL
        AND unique_states IS NOT NULL
        AND /* TEMPLATE: schema */river_job_state_in_bitmask(unique_states, state)
…
    DO UPDATE SET kind = river_job.kind
RETURNING
    sqlc.embed(river_job),
    /* TEMPLATE_BEGIN: unique_skipped_as_duplicate */ (xmax != 0) /* TEMPLATE_END */ AS unique_skipped_as_duplicate;`,
		notes: [
			'Line 7 carries the key, a hash of what makes a job "the same". [`UniqueKey`](' + RIVER + '/internal/dbunique/db_unique.go#L48-L55) takes a SHA-256 of a string that `buildUniqueKeyString` assembles from the kind, and optionally the args, a time period and the queue. Enqueue "send the welcome email to user 7" twice, and both attempts get the same `unique_key`.',
			'Lines 24 to 26 pick a partial index. River\'s [unique index](' + PGX + '/migration/main/006_bulk_unique.up.sql#L30-L33) only covers rows whose state is in the job\'s `unique_states`. The conflict target repeats that predicate, which the INSERT docs describe as "Used to allow inference of partial unique indexes." A finished job can drop out of the index, so the same work can be queued again later.',
			'Line 28 updates `kind` to its own value. With `DO NOTHING`, a duplicate returns no row: RETURNING is computed "based on each row actually inserted (or updated, if an ON CONFLICT DO UPDATE clause was used)". River wants the existing job back, so it does a no-op `DO UPDATE`. Each duplicate then costs a real row write, which leaves a dead row version for VACUUM (day 16).',
			'Line 31 tells an insert from a duplicate with `xmax`, documented as "The identity (transaction ID) of the deleting transaction, or zero for an undeleted row version." A fresh insert has zero. River relies on the conflict path leaving it non-zero, an internal detail. On PostgreSQL 18, `RETURNING old.id` is the documented way: the docs say old values "will be NULL for non-conflicting rows".',
			'Lines 10 to 31 are one statement, safe at any concurrency. The docs: "ON CONFLICT DO UPDATE guarantees an atomic INSERT or UPDATE outcome; provided there is no independent error, one of those two outcomes is guaranteed, even under high concurrency." Inside, PostgreSQL uses [speculative insertion](https://github.com/postgres/postgres/blob/26bd08fb5c069fbdf55867adc398cfca0f55d5c8/src/backend/executor/execIndexing.c?plain=1#L53-L67): it can back out its own row on a conflict "without aborting the whole transaction".'
		]
	},
	tradeoff: {
		gain: [
			'Clients, load balancers and job runners can resend after any timeout without creating a second charge, order or job.',
			'One round trip and no race: the unique index decides, inside the INSERT, which attempt wins. The handler needs no SELECT first, no exception to rescue and no savepoint.',
			'A batch import can run `ON CONFLICT (sku) DO UPDATE SET price = EXCLUDED.price` (`EXCLUDED` is the row you tried to insert) and load the same feed again and again without duplicates.'
		],
		cost: [
			'It needs a unique index whose columns, and partial predicate if any, match the conflict target. Without one, PostgreSQL stops with "there is no unique or exclusion constraint matching the ON CONFLICT specification".',
			'One statement cannot touch the same row twice: the docs warn that "a cardinality violation error will be raised" if two proposed rows share a key. Deduplicate a batch before sending it.',
			'Every request leaves a key row behind. Stripe\'s docs allow pruning keys once they are 24 hours old. You need your own expiry job, and a retry after expiry is treated as new.',
			'The unique index protects only the rows in your database. If the server crashes after the charge but before saving the result, the row stays `pending`. Finishing it is safe only if the provider call carried the same key, which Stripe accepts.'
		]
	},
	task: {
		prompt: 'Design `charges(idempotency_key text, amount_cents int, status text, response jsonb, created_at timestamptz)` for a payment endpoint. Write the SQL the handler runs first, what it does when that SQL returns no row, and when it calls the payment provider. Then say what happens if two identical requests run that SQL at the same time.',
		hint: 'Record the key before the side effect, not after. `RETURNING` with `DO NOTHING` returns a row only when a row was inserted.',
		answer: [
			'Schema: `idempotency_key text PRIMARY KEY` (or a UNIQUE index). First statement: `INSERT INTO charges (idempotency_key, amount_cents, status) VALUES ($1, $2, \'pending\') ON CONFLICT (idempotency_key) DO NOTHING RETURNING idempotency_key;`',
			'One row back: this request owns the charge. Call the provider, passing the same key so their side is idempotent too, then `UPDATE charges SET status = \'done\', response = $3 WHERE idempotency_key = $1`.',
			'No row back: it is a retry. `SELECT status, response FROM charges WHERE idempotency_key = $1`. If `done`, return the saved response. If still `pending`, answer 409 or "try again shortly", because the first attempt is still running. Also check the amount matches, as Stripe does, and refuse a reused key with different parameters.',
			'Two at once: the second INSERT waits on the first one\'s uncommitted key. When the first commits, the second gets the conflict and returns no row. Exactly one request calls the provider.'
		]
	},
	quiz: [
		{
			q: 'Your handler does `SELECT ... WHERE key = $1`, and if nothing is found, runs an INSERT. Two retries arrive together. What can happen?',
			options: [
				'The second SELECT waits on the first one, so only one insert is made',
				'Both SELECTs find nothing and both INSERTs run, so the work is done twice',
				'PostgreSQL merges the two transactions because they read the same key',
				'The second INSERT is silently turned into an UPDATE of the first row'
			],
			answer: 1,
			why: 'A plain SELECT takes no lock and sees only committed rows, so both can see nothing. Day 22 called it the check-then-act race. `INSERT ... ON CONFLICT` with a unique index is the atomic version.'
		},
		{
			q: 'You run `INSERT ... ON CONFLICT (key) DO NOTHING RETURNING id` and the key already exists. What comes back?',
			options: [
				'The id of the existing row, marked as a duplicate by the database',
				'An error with SQLSTATE 23505, which the client must catch and handle',
				'No row at all, since RETURNING covers only rows actually written',
				'A row of NULLs, one for each column listed after the RETURNING'
			],
			answer: 2,
			why: 'RETURNING is computed over rows inserted or updated. DO NOTHING writes nothing, so nothing is returned. To get the existing row back, River uses a no-op `DO UPDATE` instead.'
		},
		{
			q: 'A nightly import sends one `INSERT ... ON CONFLICT (sku) DO UPDATE` with 10,000 rows, and two of them share a SKU. What happens?',
			options: [
				'The whole statement fails, since it would update the same row twice',
				'The later of the two rows wins and overwrites the earlier one silently',
				'The earlier of the two rows wins and the later one is skipped quietly',
				'Both rows are inserted, since the conflict check runs only on old rows'
			],
			answer: 0,
			why: 'The docs call ON CONFLICT DO UPDATE "deterministic": one statement may not affect a row more than once, and raises a cardinality violation if it would. Deduplicate the batch first, for example with `DISTINCT ON (sku)`.'
		}
	],
	recall: {
		q: 'A payment request with key `k-42` arrives again after a timeout. Which statement does the handler run before charging the card, and how does it spot the retry?',
		a: '`INSERT ... ON CONFLICT (idempotency_key) DO NOTHING RETURNING idempotency_key`. No row back means the key already exists, so the handler returns the saved result instead of charging again.'
	},
	sources: [
		{ title: 'River, internal/dbunique/db_unique.go: buildUniqueKeyString', url: `${RIVER}/internal/dbunique/db_unique.go#L59-L122` },
		{ title: 'PostgreSQL docs, INSERT: ON CONFLICT clause', url: 'https://www.postgresql.org/docs/current/sql-insert.html#SQL-ON-CONFLICT' },
		{ title: 'Stripe API reference, Idempotent requests', url: 'https://docs.stripe.com/api/idempotent_requests' },
		{ title: 'River docs, Unique jobs', url: 'https://riverqueue.com/docs/unique-jobs' }
	]
};
