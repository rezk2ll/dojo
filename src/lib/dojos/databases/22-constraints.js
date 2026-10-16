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
