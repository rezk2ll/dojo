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
		],
		steps: [
			{
				title: 'Design the table',
				questions: [
					{ q: 'What must `idempotency_key` have for the handler to work?', options: ['A default of `gen_random_uuid()`', 'A plain index, for fast lookups', 'A PRIMARY KEY or a UNIQUE index', 'A CHECK that it is not empty'], answer: 2, why: 'The unique index decides which attempt is the real one. Without it, PostgreSQL stops with "there is no unique or exclusion constraint matching the ON CONFLICT specification".' },
					{ q: 'Who picks the key?', options: ['The client, once per operation, and it resends the same key on retry', 'The server, with a new UUID on each request', 'The database, with a sequence', 'The payment provider, in its response'], answer: 0, why: 'The key must be the same on the first try and the retry. Only the client knows both are the same request.' },
					{ q: 'Why does the row get a `status` such as `pending`?', options: ['PostgreSQL needs it to detect the conflict', 'Stripe rejects a key without a status', 'It makes the unique index smaller', 'A retry must tell a finished charge from one still running'], answer: 3, why: 'The row is written before the charge. `pending` means the first attempt has not saved its result yet.' },
					{ q: 'When does the handler write the key row?', options: ['After the provider confirms the charge', 'Before it calls the provider', 'Only when a retry arrives', 'In a nightly batch'], answer: 1, why: 'Record the key before the side effect. Written after, two attempts could both charge before either row exists.' }
				]
			},
			{
				title: 'Write the first statement',
				questions: [
					{ q: 'Why does the handler need no savepoint and no rescue around the `ON CONFLICT ... DO NOTHING` INSERT?', options: ['PostgreSQL retries the INSERT by itself until it succeeds', 'A duplicate key raises no error, so the transaction stays usable', 'The primary key stops the client from sending a duplicate', 'The INSERT runs outside any transaction'], answer: 1, why: 'The conflict is handled inside the statement: PostgreSQL backs out its own row without aborting the transaction. A plain INSERT would fail with `23505` instead.' },
					{ q: 'Your expiry job prunes keys after 24 hours. A retry with key `k-42` arrives two days later. What does the INSERT do?', options: ['It returns one row, so the retry is treated as a new charge', 'It returns no row, since the key was used before', 'It fails with `23505`', 'It waits until VACUUM removes the old row'], answer: 0, why: 'The unique index only knows the keys still in the table. Once pruned, the same key looks new, so pick an expiry longer than any client retries.' },
					{ q: 'The INSERT returns one row. What does that mean?', options: ['A retry: the key was already there', 'The provider has charged the card', 'This request owns the charge', 'Another request is still running'], answer: 2, why: 'Only the attempt that inserted the row gets it back. That attempt runs the charge.' },
					{ q: 'Why `DO NOTHING` here and not River\'s no-op `DO UPDATE`?', options: ['`DO UPDATE` cannot use a primary key', '`DO NOTHING` takes a table lock', '`DO UPDATE` fails when the key exists', 'An empty result is the retry signal, and no dead row is left'], answer: 3, why: 'The handler only needs to know if it inserted. A no-op `DO UPDATE` returns the row but writes a new row version each time.' }
				]
			},
			{
				title: 'Call the provider, or answer the retry',
				questions: [
					{ q: 'The INSERT returned a row. What next?', options: ['Call the provider with the same key, then `UPDATE` the row to `done` with the response', 'Return the saved response', 'Answer 409 and wait for a retry', 'Call the provider with a new key, so it is not seen as a duplicate'], answer: 0, why: 'Passing the same key makes the provider\'s side idempotent too. Then the row holds the result for any retry.' },
					{ q: 'The INSERT returned no row. What does the handler run?', options: ['The same INSERT again', '`SELECT status, response FROM charges WHERE idempotency_key = $1`', '`DELETE` the row and start over', 'A call to the provider, to be sure'], answer: 1, why: 'It is a retry. The stored row says what happened to the first attempt.' },
					{ q: 'The row says `pending`. What does the handler answer?', options: ['The saved response', 'A new charge with a fresh key', '409 or "try again shortly"', '200 with an empty body'], answer: 2, why: 'The first attempt is still running. Charging again is the bug the key prevents.' },
					{ q: 'A retry reuses key `k-42` with a different amount. What should happen?', options: ['Charge the new amount', 'Update the row to the new amount', 'Return the saved response for the old amount', 'Refuse the request: the key was used with other parameters'], answer: 3, why: 'Stripe checks that the parameters match. A reused key with new values is a client bug, not a retry.' }
				]
			},
			{
				title: 'Race two identical requests',
				questions: [
					{ q: 'Two requests with the same key run the INSERT at the same moment. What does the second one do first?', options: ['It inserts a second row', 'It fails at once with `23505`', 'It waits on the first one\'s uncommitted key', 'It reads the first row as `pending`'], answer: 2, why: 'PostgreSQL makes the second INSERT wait on the key in the index until the first transaction ends.' },
					{ q: 'The first commits. What does the second INSERT get?', options: ['The conflict, and no row back', 'One row, since it started second', 'A deadlock error', 'The first row\'s response'], answer: 0, why: 'After the wait it sees the committed key. `DO NOTHING` returns nothing, so it takes the retry path.' },
					{ q: 'How many requests call the provider?', options: ['Two, one per request', 'Exactly one', 'None until a third retry', 'It depends on which commits first'], answer: 1, why: 'Only the request that got a row back owns the charge.' },
					{ q: 'The server crashes after the charge but before it saves the result. What is left?', options: ['Nothing: the row is rolled back with the charge', 'A `done` row with no response', 'Two rows with the same key', 'A `pending` row; finishing it is safe only if the provider call carried the same key'], answer: 3, why: 'The unique index protects only your database. The provider\'s own idempotency covers the charge itself.' }
				]
			}
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
	lab: {
		minutes: 15,
		goal: 'Send the same payment twice, once in a row and once at the same moment, and see the unique index pick one winner.',
		steps: [
			'Start PostgreSQL: `docker run -d --name dojo-pg -e POSTGRES_PASSWORD=dojo postgres:17`. Wait until `docker exec dojo-pg pg_isready` prints `accepting connections`, then open `docker exec -it dojo-pg psql -U postgres`.',
			'Create the table: `CREATE TABLE charges (idempotency_key text PRIMARY KEY, amount_cents int NOT NULL, status text NOT NULL, response jsonb, created_at timestamptz NOT NULL DEFAULT now());`',
			'Run the handler\'s first statement twice: `INSERT INTO charges (idempotency_key, amount_cents, status) VALUES (\'k-42\', 1999, \'pending\') ON CONFLICT (idempotency_key) DO NOTHING RETURNING idempotency_key;`',
			'Finish the first attempt: `UPDATE charges SET status = \'done\', response = \'{"charge":"ch_1"}\' WHERE idempotency_key = \'k-42\';` then read it the way a retry would: `SELECT status, response FROM charges WHERE idempotency_key = \'k-42\';`',
			'Point the conflict at a column with no unique index: the same INSERT with key `k-43` and `ON CONFLICT (status) DO NOTHING`.',
			'Race it: open a second terminal with the same `psql` command. In the first, `BEGIN;` and run the INSERT with key `k-77`. In the second, run the same INSERT. Then `COMMIT;` in the first.'
		],
		done: [
			'In step 3, the first run returns `k-42` and `INSERT 0 1`. The second returns `(0 rows)` and `INSERT 0 0`.',
			'Step 4 shows `done` and the saved response.',
			'Step 5 fails with `there is no unique or exclusion constraint matching the ON CONFLICT specification`.',
			'In step 6, the second terminal hangs until the commit, then prints `(0 rows)` and `INSERT 0 0`.'
		],
		solution: [
			'Only the attempt that inserted the row gets it back from RETURNING. That one calls the provider. Every other attempt reads the saved row.',
			'The second session waits on the first one\'s uncommitted key in the index. No SELECT before the INSERT could make it wait like that.',
			'Bonus: `INSERT INTO charges (idempotency_key, amount_cents, status) VALUES (\'k-50\', 1, \'pending\'), (\'k-50\', 2, \'pending\') ON CONFLICT (idempotency_key) DO UPDATE SET amount_cents = EXCLUDED.amount_cents;` fails with `ON CONFLICT DO UPDATE command cannot affect row a second time`. Deduplicate a batch first.',
			'Clean up with `docker rm -f dojo-pg`.'
		]
	},
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
