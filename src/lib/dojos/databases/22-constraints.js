const OP = 'https://github.com/opf/openproject/blob/e7ec68bf4763a0f538988fb51194b563a77b825d';
const RAILS = 'https://github.com/rails/rails/blob/ccaef690ee7a1f1d02642edd5f710daf031e7e04/activerecord/lib/active_record';
const PGDOC = 'https://www.postgresql.org/docs/current/ddl-constraints.html';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'constraints',
	part: 'Many at once',
	title: 'Constraints: UNIQUE, CHECK and exclusion',
	minutes: 10,
	hook: [
		'Your `User` model says `validates :email, uniqueness: true`. The tests pass. Then support finds **two accounts with the same email**, created 40 milliseconds apart by a double click on "Sign up".',
		'The validation runs a SELECT, finds nothing, and lets the INSERT go. **The second request ran the same SELECT before the first INSERT committed**, so it found nothing too. The SELECT in the app and the INSERT that follows are two steps, and another request fits between them.',
		'PostgreSQL checks a constraint inside the write itself, under its own locks, so no request can slip in between. Keep the validation for a friendly error message, and let a unique index reject the duplicate.'
	],
	terms: [
		{ term: 'Check-then-act race', def: 'Code reads to decide ("is this email free?"), then writes. Another writer can change the answer between the read and the write.' },
		{ term: 'UNIQUE', def: 'No two rows share the same value in these columns. PostgreSQL enforces it with a unique B-tree index.' },
		{ term: 'CHECK', def: 'A boolean expression on one row, tested on every insert and update: `price > 0`, `ends_at > starts_at`.' },
		{ term: 'Exclusion constraint', def: 'A generalised UNIQUE: no two rows may match on all the listed operators. With `&&` on a range, it means "no two bookings overlap".' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['r1["Request 1: SELECT 1 FROM users WHERE email = ?"] --> none["No row found"]', 'r2["Request 2: same SELECT, a few ms later"] --> none'],
				highlight: ['r1', 'r2', 'none'],
				note: 'Both checks pass. Neither request has written yet, so both SELECTs find nothing. Under Read Committed (day 19) each sees only what was committed when it ran, so neither can see the other request\'s row.'
			},
			{
				add: ['none --> ins1["Request 1: INSERT, commits"]', 'none --> ins2["Request 2: INSERT"]', 'ins1 --> users[("users")]'],
				highlight: ['ins1', 'ins2'],
				note: 'Both requests go on to INSERT. Without a constraint, both rows land and you have a duplicate. Nothing failed, so nothing was logged. You find out weeks later from a confused customer.'
			},
			{
				add: ['users --> idx["Unique index on email"]', 'ins2 --> idx', 'idx -->|"SQLSTATE 23505"| err["ActiveRecord::RecordNotUnique"]'],
				highlight: ['idx', 'err'],
				note: 'With a unique index, the second INSERT fails. It must place its key in the index, finds the same key (waiting first if the other insert has not committed yet), and gets a `duplicate key` error. Rails turns code `23505` into `RecordNotUnique`.'
			},
			{
				add: ['err --> msg["Rescue it: show \'email already taken\'"]'],
				highlight: ['msg'],
				note: 'The app catches the exception and shows the same "email already taken" message the validation would have shown. The validation still catches the common case before the INSERT, and the index catches the race.'
			}
		]
	},
	example: {
		title: 'db/migrate/tables/journals.rb in OpenProject: unique, check and exclusion on one table',
		repo: 'opf/openproject',
		url: `${OP}/db/migrate/tables/journals.rb#L34-L63`,
		lang: 'ruby',
		code: `    create_table migration do |t|
      t.references :journable, polymorphic: true, index: false
      t.bigint :user_id, null: false, index: true
      t.text :notes, null: true
      t.datetime :created_at, precision: nil, null: false, index: true
      t.integer :version, default: 0, null: false
      t.datetime :updated_at, precision: nil, default: -> { "CURRENT_TIMESTAMP" }
      t.references :data, polymorphic: true, index: false, null: false
      t.jsonb :cause, default: {}
      t.tstzrange :validity_period
      t.boolean :restricted, default: false, null: false

      t.index :journable_id
      t.index :journable_type
      t.index %i[journable_type journable_id version],
              unique: true
      t.index %i[data_id data_type],
              unique: true
      t.index :notes,
              using: "gin",
              opclass: :gin_trgm_ops

      t.check_constraint "NOT isempty(validity_period) AND validity_period IS NOT NULL",
                         name: "journals_validity_period_not_empty"

      t.exclusion_constraint "journable_id WITH =, journable_type WITH =, validity_period WITH &&",
                             name: "non_overlapping_journals_validity_periods",
                             using: :gist,
                             deferrable: :immediate
    end`,
		notes: [
			'Lines 15 and 16 give each object one row per version number. A journal is one entry in a work package\'s history. The [unique index](' + OP + '/db/migrate/tables/journals.rb#L48-L49) on `(journable_type, journable_id, version)` means two saves racing on the same work package cannot both write version 7. One of them gets `23505`.',
			'Line 23 spells out `IS NOT NULL` because `isempty(NULL)` is NULL. The [docs](' + PGDOC + '#DDL-CONSTRAINTS-CHECK-CONSTRAINTS): "a check constraint is satisfied if the check expression evaluates to true or the null value." Without the second half, a row with no period at all would pass.',
			'Lines 26 to 29 forbid two journals of the same object from having overlapping `validity_period`s. The docs define an exclusion constraint: "if any two rows are compared on the specified columns or expressions using the specified operators, at least one of these operator comparisons will return false or null." Comparing plain ids with `=` in a GiST index needs the [`btree_gist`](' + OP + '/db/migrate/extensions/btree_gist.rb#L32-L34) extension, which OpenProject installs.',
			'When a new journal is written, [`update_predecessor_sql`](' + OP + '/app/services/journals/create_service.rb#L405-L417) first ends the previous one with `tstzrange(lower(validity_period), ..., \'[)\')`. The upper bound is excluded, so the old and the new period touch without overlapping. On line 29, `deferrable: :immediate` makes Rails emit `DEFERRABLE INITIALLY IMMEDIATE`: checked after each statement unless a transaction runs `SET CONSTRAINTS ... DEFERRED`.',
			'The Rails PostgreSQL adapter maps each SQLSTATE (`23505` unique, `23514` check, `23503` foreign key, `23P01` exclusion) to its own exception: [`RecordNotUnique`, `InvalidForeignKey`, `CheckViolation`, `ExclusionViolation`](' + RAILS + '/connection_adapters/postgresql_adapter.rb#L991-L1004) and more. You can rescue exactly the one you expect and let the others crash with a stack trace.'
		]
	},
	tradeoff: {
		gain: [
			'The rule holds for every writer: two app servers, a background job, a console session, a script someone runs at 2 a.m.',
			'The second writer in a race gets an error instead of writing a duplicate. A failed insert shows up in the logs; a duplicate row does not.',
			'The Rails docs on `validates_uniqueness_of` recommend the same fix: "The best way to work around this problem is to add a unique index to the database table".'
		],
		cost: [
			'Each constraint costs work on every write, and UNIQUE and EXCLUDE each maintain an index. A foreign key also needs an index on the referencing side, which PostgreSQL does not create for you.',
			'A CHECK sees only the row being written. The docs: "PostgreSQL does not support CHECK constraints that reference table data other than the new or updated row being checked."',
			'Adding a constraint to a big live table scans it under a lock. That needs the careful steps of day 26.',
			'The app must catch the database error and turn it into a message. Otherwise users get a 500 page instead of "already taken".'
		]
	},
	task: {
		prompt: 'In `psql`, design `bookings(id bigint primary key, room_id bigint not null, during tstzrange not null, price_cents int not null)`. Add constraints so that: a room is never booked twice at the same time, the price is positive, and every booking has a real room. Then predict which of these inserts for room 1 fails: 10:00 to 11:00, 11:00 to 12:00, 10:30 to 11:30.',
		hint: '`tstzrange(a, b)` uses `[)` bounds by default: the start is in, the end is out. Mixing `=` on a bigint with `&&` on a range in one GiST constraint needs an extension.',
		answer: [
			'`CREATE EXTENSION btree_gist;` then `ALTER TABLE bookings ADD CONSTRAINT no_double_booking EXCLUDE USING gist (room_id WITH =, during WITH &&);`',
			'`ALTER TABLE bookings ADD CONSTRAINT price_positive CHECK (price_cents > 0);` and `ALTER TABLE bookings ADD FOREIGN KEY (room_id) REFERENCES rooms (id);` plus `CREATE INDEX ON bookings (room_id);`, since the foreign key does not index it.',
			'10:00 to 11:00 succeeds. 11:00 to 12:00 also succeeds: with `[)` bounds the first range ends just before 11:00, so the two only touch.',
			'10:30 to 11:30 overlaps both and fails with `conflicting key value violates exclusion constraint "no_double_booking"`, SQLSTATE `23P01`. Two sessions inserting it at once cannot both win. The later one waits for the first to finish, then fails. If both insert before either checks, the deadlock detector aborts one of them, so the error you see may be a deadlock instead.'
		],
		steps: [
			{
				title: 'Match each rule to a constraint',
				questions: [
					{ q: '"A room is never booked twice at the same time." Which constraint fits?', options: ['A CHECK on `during`', 'A UNIQUE index on `(room_id, during)`', 'An exclusion constraint with `=` on `room_id` and `&&` on `during`', 'A foreign key from `during` to `rooms`'], answer: 2, why: 'The rule compares one row with other rows by overlap. UNIQUE only catches equal values, and two overlapping ranges are not equal.' },
					{ q: '"The price is positive." Which constraint fits?', options: ['`CHECK (price_cents > 0)`', 'An exclusion constraint on `price_cents`', 'A UNIQUE index on `price_cents`', 'A foreign key to a `prices` table'], answer: 0, why: 'The rule looks at one row only, which is exactly what a CHECK sees.' },
					{ q: '"Every booking has a real room." Which constraint fits?', options: ['`CHECK (room_id > 0)`', 'A UNIQUE index on `room_id`', '`NOT NULL` on `room_id` alone', 'A foreign key from `room_id` to `rooms (id)`'], answer: 3, why: 'Only a foreign key checks that the value exists in another table. `NOT NULL` only says a value is there.' },
					{ q: 'The app also keeps an overlap validation in the model. What is it still good for once the constraint exists?', options: ['Closing the race, so the constraint can stay optional', 'A friendly message in the common case, while the constraint catches the race', 'Making each INSERT skip the GiST index', 'Nothing: Rails ignores a validation when a constraint exists'], answer: 1, why: 'The validation catches most conflicts early with a clear message. Only the constraint holds when two requests race.' }
				]
			},
			{
				title: 'Write the no-overlap rule',
				questions: [
					{ q: 'What must run before the exclusion constraint can be created?', options: ['`CREATE EXTENSION btree_gist;`', '`CREATE INDEX ON bookings (during);`', '`SET CONSTRAINTS ALL DEFERRED;`', '`CREATE EXTENSION pg_trgm;`'], answer: 0, why: 'Comparing a plain bigint with `=` in a GiST index needs `btree_gist`. OpenProject installs it for the same reason.' },
					{ q: 'Which statement adds the rule?', options: ['`ALTER TABLE bookings ADD CONSTRAINT no_double_booking UNIQUE (room_id, during);`', '`ALTER TABLE bookings ADD CONSTRAINT no_double_booking CHECK (NOT during && during);`', '`ALTER TABLE bookings ADD CONSTRAINT no_double_booking EXCLUDE USING btree (room_id WITH =, during WITH &&);`', '`ALTER TABLE bookings ADD CONSTRAINT no_double_booking EXCLUDE USING gist (room_id WITH =, during WITH &&);`'], answer: 3, why: 'Two rows conflict when the room is equal and the ranges overlap. GiST is the index that can answer `&&`.' },
					{ q: 'How does PostgreSQL read `room_id WITH =, during WITH &&`?', options: ['Two rows conflict if any one of the comparisons is true', 'Two rows conflict only if every comparison is true', 'Each row is checked against itself', 'The second comparison runs only when the first is false'], answer: 1, why: 'The docs: at least one comparison must return false or null. So a conflict needs the same room and an overlap.' },
					{ q: 'You declare the rule `DEFERRABLE INITIALLY IMMEDIATE`, as OpenProject does. When is it checked?', options: ['After each statement, unless the transaction runs `SET CONSTRAINTS ... DEFERRED`', 'Only at COMMIT, always', 'Only when the GiST index is rebuilt', 'Never for rows written in a transaction'], answer: 0, why: '`INITIALLY IMMEDIATE` checks after each statement. `DEFERRABLE` only lets one transaction push the check to its COMMIT.' }
				]
			},
			{
				title: 'Add the other two rules',
				questions: [
					{ q: 'Which statement adds the price rule?', options: ['`ALTER TABLE bookings ADD CONSTRAINT price_positive CHECK (price_cents >= 0);`', '`ALTER TABLE bookings ADD CONSTRAINT price_positive CHECK (price_cents > 0);`', '`ALTER TABLE bookings ALTER price_cents SET DEFAULT 1;`', '`ALTER TABLE bookings ADD CONSTRAINT price_positive UNIQUE (price_cents);`'], answer: 1, why: 'Positive means strictly above zero. `>= 0` would still let a free booking through.' },
					{ q: 'You add `FOREIGN KEY (room_id) REFERENCES rooms (id)`. What else do you add?', options: ['Nothing: the foreign key indexes `room_id` for you', 'A UNIQUE index on `rooms (id)`, since the key needs it', '`CREATE INDEX ON bookings (room_id);`', 'A CHECK that `room_id` is positive'], answer: 2, why: 'PostgreSQL does not index the referencing side of a foreign key. You create that index yourself.' },
					{ q: 'A booking with `price_cents = 0` hits `price_positive`. Which Rails exception does the app rescue?', options: ['`ActiveRecord::CheckViolation`', '`ActiveRecord::RecordNotUnique`', '`ActiveRecord::InvalidForeignKey`', '`ActiveRecord::ExclusionViolation`'], answer: 0, why: 'The CHECK fails with SQLSTATE `23514`, which the Rails adapter maps to `CheckViolation`. Rescue that one and let the others crash.' },
					{ q: 'A booking for room 2 arrives, and `rooms` has no row 2. What happens?', options: ['The insert succeeds, and the room is created later', 'The insert fails on the CHECK constraint', 'The insert fails on the exclusion constraint', 'The insert fails on the foreign key'], answer: 3, why: 'The foreign key checks that `rooms` holds the id. Rails maps that error to `InvalidForeignKey`.' }
				]
			},
			{
				title: 'Predict the three inserts',
				questions: [
					{ q: 'First insert for room 1: 10:00 to 11:00. What happens?', options: ['It fails: the room has no bookings yet', 'It waits for the exclusion index to build', 'It succeeds', 'It fails on the CHECK'], answer: 2, why: 'Nothing else is booked, so nothing overlaps.' },
					{ q: 'Second insert: 11:00 to 12:00. What happens?', options: ['It succeeds: with `[)` bounds the first range ends just before 11:00', 'It fails: both ranges contain 11:00', 'It fails: two bookings cannot share a boundary', 'It succeeds only if you write `[]` bounds'], answer: 0, why: '`tstzrange(a, b)` includes the start and excludes the end. The two ranges touch without overlapping.' },
					{ q: 'Third insert: 10:30 to 11:30. What does it get?', options: ['`23505`, a duplicate key error', '`23514`, a check violation', 'Success, since it does not match either range exactly', '`23P01`, a conflict on `no_double_booking`'], answer: 3, why: 'It overlaps both bookings. `23P01` is the SQLSTATE for an exclusion violation.' },
					{ q: 'Two sessions insert 10:30 to 11:30 for room 1 at the same moment, in an empty table. What happens?', options: ['Both succeed, since neither sees the other', 'The later one waits for the first to finish, then fails', 'PostgreSQL keeps the shorter booking', 'Both fail with `23P01`'], answer: 1, why: 'The second insert waits on the first one\'s index entry. If both insert before either checks, the deadlock detector aborts one instead.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'A model has `validates :slug, uniqueness: true` and no index. Two requests save the same slug at the same moment. What usually happens?',
			options: [
				'The second save fails validation, since Rails locks the table while it checks',
				'Both saves pass validation and both rows are written, leaving a duplicate',
				'PostgreSQL detects two equal values and quietly drops the second row',
				'The second save waits until the first commits, then fails validation'
			],
			answer: 1,
			why: 'The validation is a SELECT followed by an INSERT, with no lock between them. Both SELECTs can run before either INSERT commits. Only a unique index makes the second INSERT fail.'
		},
		{
			q: 'You add `CHECK (ends_at > starts_at)`. A row is inserted with `ends_at` set to NULL. What happens?',
			options: [
				'The insert fails, because NULL is not greater than any timestamp value',
				'The insert fails, because CHECK implies that both columns are NOT NULL',
				'The insert succeeds, and the CHECK runs later when the value is set',
				'The insert succeeds, because a CHECK that evaluates to NULL passes'
			],
			answer: 3,
			why: '`NULL > starts_at` is NULL, not false, and a CHECK only rejects false (day 6). Add `NOT NULL` on the column, or `IS NOT NULL` in the expression, as OpenProject does.'
		},
		{
			q: 'Why can a CHECK constraint not enforce "a room has at most one booking at a time"?',
			options: [
				'A CHECK sees only the row being written, not the other rows in the table',
				'A CHECK cannot use range operators such as `&&` in its boolean expression',
				'A CHECK is skipped for rows written inside an explicit open transaction',
				'A CHECK runs before the row gets its id, so it cannot tell rows apart'
			],
			answer: 0,
			why: 'The rule compares a row with other rows. A CHECK sees one row, and a subquery inside it is not supported. An exclusion constraint compares the new row with existing ones through its index.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Let PostgreSQL refuse a double booking, a free booking and a booking for a room that does not exist.',
		steps: [
			'Start PostgreSQL: `docker run -d --name dojo-pg -e POSTGRES_PASSWORD=dojo postgres:17`. Wait until `docker exec dojo-pg pg_isready` prints `accepting connections`, then open `docker exec -it dojo-pg psql -U postgres`.',
			'Create the tables: `CREATE TABLE rooms (id bigint PRIMARY KEY); INSERT INTO rooms VALUES (1);` then `CREATE TABLE bookings (id bigint PRIMARY KEY, room_id bigint NOT NULL, during tstzrange NOT NULL, price_cents int NOT NULL);`',
			'Try the overlap rule first without the extension: `ALTER TABLE bookings ADD CONSTRAINT no_double_booking EXCLUDE USING gist (room_id WITH =, during WITH &&);`. Read the error, run `CREATE EXTENSION btree_gist;` and send the same ALTER again.',
			'Add the other rules: `ALTER TABLE bookings ADD CONSTRAINT price_positive CHECK (price_cents > 0);`, `ALTER TABLE bookings ADD FOREIGN KEY (room_id) REFERENCES rooms (id);` and `CREATE INDEX ON bookings (room_id);`',
			'Run `\\set VERBOSITY verbose` so errors show their SQLSTATE. Then insert the three bookings: `INSERT INTO bookings VALUES (1, 1, tstzrange(\'2026-11-02 10:00+00\', \'2026-11-02 11:00+00\'), 9000);`, the same with id 2 and 11:00 to 12:00, and with id 3 and 10:30 to 11:30.',
			'Break the other two rules: an insert with `price_cents` 0, and one for `room_id` 2.',
			'Race it: open a second terminal with the same `psql` command. In the first, `BEGIN;` and insert room 1 on another day, 10:00 to 11:00. In the second, insert the same slot with a new id. Then `COMMIT;` in the first.'
		],
		done: [
			'Without `btree_gist`, the ALTER fails with `data type bigint has no default operator class for access method "gist"`.',
			'Bookings 1 and 2 print `INSERT 0 1`. Booking 3 fails with `23P01` and `conflicting key value violates exclusion constraint "no_double_booking"`.',
			'The free booking fails on `price_positive`, and room 2 fails on `bookings_room_id_fkey`.',
			'In the race, the second insert hangs until the first commits, then fails on `no_double_booking`.'
		],
		solution: [
			'11:00 to 12:00 passes because `tstzrange` uses `[)` bounds: 10:00 to 11:00 ends just before 11:00.',
			'The DETAIL line of the `23P01` error names both keys: the new booking and the one it conflicts with.',
			'The second session waits on the first one\'s index entry, so a SELECT-then-INSERT in the app could never give the same guarantee.',
			'Clean up with `docker rm -f dojo-pg`.'
		]
	},
	recall: {
		q: 'Two sign-ups with the same email arrive 40 ms apart, and the model has `validates :email, uniqueness: true`. What stops the duplicate, and what does the second request get?',
		a: 'A unique index on `email`. The second INSERT fails with SQLSTATE `23505`, Rails raises `ActiveRecord::RecordNotUnique`, and the app rescues it to show "email already taken".'
	},
	sources: [
		{ title: 'PostgreSQL docs, Constraints', url: PGDOC },
		{ title: 'PostgreSQL docs, Range Types: constraints on ranges', url: 'https://www.postgresql.org/docs/current/rangetypes.html#RANGETYPES-CONSTRAINT' },
		{ title: 'PostgreSQL docs, btree_gist', url: 'https://www.postgresql.org/docs/current/btree-gist.html' },
		{ title: 'Rails API, validates_uniqueness_of', url: 'https://api.rubyonrails.org/classes/ActiveRecord/Validations/ClassMethods.html#method-i-validates_uniqueness_of' }
	]
};
