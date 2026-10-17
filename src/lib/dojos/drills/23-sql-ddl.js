/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'sql-ddl',
	part: 'SQL',
	title: 'Tables and indexes',
	minutes: 10,
	hook: [
		'Your team adds support tickets to the app. You write the migration: two new tables, then columns and indexes added later, while the app keeps writing tickets. A plain `CREATE INDEX` blocks inserts, updates and deletes on the table until the index is built.',
		'The database is PostgreSQL. It starts with the table `users (id bigint PRIMARY KEY, email text NOT NULL)` and a few users in it. Each rep runs on the database that the reps before it left. Rep 2 creates `tickets`, and the app adds a few tickets before rep 3.'
	],
	terms: [
		{ term: 'constraint', def: 'A rule on a column or a table that PostgreSQL checks on every insert and update, such as NOT NULL, UNIQUE, CHECK or a foreign key.' },
		{ term: 'foreign key', def: 'A constraint that only lets a column hold values that exist in a column of another table, here `tickets.user_id` and `users.id`.' },
		{ term: 'transaction block', def: 'The statements between `BEGIN` and `COMMIT`. Some commands, such as `CREATE INDEX CONCURRENTLY`, refuse to run inside one.' }
	],
	reps: [
		{
			prompt: 'Create the table `tags` with an `id int` primary key and a `name text` that is required and unique.',
			accept: [
				'CREATE TABLE tags (id int PRIMARY KEY, name text NOT NULL UNIQUE)',
				'create table tags (id int primary key, name text not null unique)',
				'CREATE TABLE tags (id int PRIMARY KEY, name text UNIQUE NOT NULL)',
				'create table tags (id int primary key, name text unique not null)',
				'CREATE TABLE tags(id int PRIMARY KEY, name text NOT NULL UNIQUE)',
				'create table tags(id int primary key, name text not null unique)',
				'CREATE TABLE tags (id integer PRIMARY KEY, name text NOT NULL UNIQUE)',
				'create table tags (id integer primary key, name text not null unique)'
			],
			why: '`PRIMARY KEY` makes `id` unique and not null. `NOT NULL UNIQUE` on `name` rejects a missing name and a second tag with the same name. PostgreSQL builds a unique index for each, `tags_pkey` and `tags_name_key`.'
		},
		{
			prompt: 'Create `tickets` with an `id bigint` primary key, a required `user_id bigint` that must match a `users.id`, and a required `title text`.',
			accept: [
				'CREATE TABLE tickets (id bigint PRIMARY KEY, user_id bigint NOT NULL REFERENCES users (id), title text NOT NULL)',
				'create table tickets (id bigint primary key, user_id bigint not null references users (id), title text not null)',
				'CREATE TABLE tickets (id bigint PRIMARY KEY, user_id bigint NOT NULL REFERENCES users(id), title text NOT NULL)',
				'create table tickets (id bigint primary key, user_id bigint not null references users(id), title text not null)',
				'CREATE TABLE tickets (id bigint PRIMARY KEY, user_id bigint NOT NULL REFERENCES users, title text NOT NULL)',
				'create table tickets (id bigint primary key, user_id bigint not null references users, title text not null)',
				'CREATE TABLE tickets(id bigint PRIMARY KEY, user_id bigint NOT NULL REFERENCES users (id), title text NOT NULL)'
			],
			why: '`REFERENCES users (id)` is a foreign key: an insert with a `user_id` that no user has fails. Written as `REFERENCES users`, it points at the primary key of `users`. `NOT NULL` matters too, because a NULL `user_id` passes a foreign key.'
		},
		{
			prompt: 'Add a column `status text` to `tickets`. It is required, and existing tickets get `\'open\'`.',
			accept: [
				"ALTER TABLE tickets ADD COLUMN status text NOT NULL DEFAULT 'open'",
				"alter table tickets add column status text not null default 'open'",
				"ALTER TABLE tickets ADD COLUMN status text DEFAULT 'open' NOT NULL",
				"alter table tickets add column status text default 'open' not null",
				"ALTER TABLE tickets ADD status text NOT NULL DEFAULT 'open'",
				"alter table tickets add status text not null default 'open'",
				"ALTER TABLE tickets ADD status text DEFAULT 'open' NOT NULL"
			],
			why: '`DEFAULT \'open\'` fills the existing rows, so `NOT NULL` holds from the start. Without the default, the `NOT NULL` would fail on a table that already has tickets. The word `COLUMN` is optional.'
		},
		{
			prompt: 'Add a column `priority int` to `tickets` that only accepts values from 1 to 4. Put the check on the column.',
			accept: [
				'ALTER TABLE tickets ADD COLUMN priority int CHECK (priority BETWEEN 1 AND 4)',
				'alter table tickets add column priority int check (priority between 1 and 4)',
				'ALTER TABLE tickets ADD priority int CHECK (priority BETWEEN 1 AND 4)',
				'alter table tickets add priority int check (priority between 1 and 4)',
				'ALTER TABLE tickets ADD COLUMN priority int CHECK (priority >= 1 AND priority <= 4)',
				'alter table tickets add column priority int check (priority >= 1 and priority <= 4)',
				'ALTER TABLE tickets ADD COLUMN priority int CHECK(priority BETWEEN 1 AND 4)'
			],
			why: 'An insert with `priority` 5 fails, because the check gives false. A NULL priority passes. The docs: "a check constraint is satisfied if the check expression evaluates to true or the null value."'
		},
		{
			prompt: 'Add an index named `tickets_user_id_idx` on `tickets.user_id`.',
			accept: [
				'CREATE INDEX tickets_user_id_idx ON tickets (user_id)',
				'create index tickets_user_id_idx on tickets (user_id)',
				'CREATE INDEX tickets_user_id_idx ON tickets(user_id)',
				'create index tickets_user_id_idx on tickets(user_id)',
				'CREATE INDEX tickets_user_id_idx ON tickets USING btree (user_id)',
				'create index tickets_user_id_idx on tickets using btree (user_id)'
			],
			why: 'The name comes after `CREATE INDEX`, the table and columns after `ON`. A foreign key does not create an index on `tickets.user_id`, so you add one yourself. The default index method is `btree`.'
		},
		{
			prompt: '`tickets` now has millions of rows and gets writes all day. Add an index named `tickets_status_idx` on `status` without blocking inserts and updates while it builds.',
			accept: [
				'CREATE INDEX CONCURRENTLY tickets_status_idx ON tickets (status)',
				'create index concurrently tickets_status_idx on tickets (status)',
				'CREATE INDEX CONCURRENTLY tickets_status_idx ON tickets(status)',
				'create index concurrently tickets_status_idx on tickets(status)'
			],
			why: 'A plain `CREATE INDEX` "locks out writes (but not reads) on the table until it\'s done". `CONCURRENTLY` scans the table twice and lets writes go on, so it takes longer. It cannot run inside a transaction block, and if it fails it leaves an index marked `INVALID` that you drop and build again.'
		},
		{
			prompt: 'Drop the index `tickets_status_idx` without blocking writes on `tickets`.',
			accept: [
				'DROP INDEX CONCURRENTLY tickets_status_idx',
				'drop index concurrently tickets_status_idx',
				'DROP INDEX CONCURRENTLY IF EXISTS tickets_status_idx',
				'drop index concurrently if exists tickets_status_idx'
			],
			why: '`DROP INDEX` takes an index name, with no `ON table`. A plain `DROP INDEX` blocks every read and write on `tickets` until it is done. `CONCURRENTLY` waits for the conflicting transactions to finish instead. Like the build, it refuses to run inside a transaction block and takes only one index name.'
		},
		{
			prompt: 'Drop the table `tags`, with no error if it is already gone.',
			accept: ['DROP TABLE IF EXISTS tags', 'drop table if exists tags'],
			why: '`IF EXISTS` turns the missing table into a notice: `table "tags" does not exist, skipping`. A migration that runs twice then does not stop on its second run.'
		},
		{
			prompt: 'Drop the table `users`, even though the foreign key on `tickets.user_id` points at it.',
			accept: ['DROP TABLE users CASCADE', 'drop table users cascade'],
			why: 'Without `CASCADE`, PostgreSQL refuses because `tickets` depends on `users`. With it, PostgreSQL drops `users` and the foreign key constraint on `tickets`, and the `tickets` table and its rows stay.'
		}
	],
	quiz: [],
	recall: {
		q: 'Which option builds an index on a busy table without blocking inserts and updates, and where can it not run?',
		a: '`CREATE INDEX CONCURRENTLY`. It cannot run inside a transaction block, between `BEGIN` and `COMMIT`.'
	},
	sources: [
		{ title: 'PostgreSQL: CREATE TABLE', url: 'https://www.postgresql.org/docs/current/sql-createtable.html' },
		{ title: 'PostgreSQL: Constraints', url: 'https://www.postgresql.org/docs/current/ddl-constraints.html' },
		{ title: 'PostgreSQL: ALTER TABLE', url: 'https://www.postgresql.org/docs/current/sql-altertable.html' },
		{ title: 'PostgreSQL: CREATE INDEX', url: 'https://www.postgresql.org/docs/current/sql-createindex.html' },
		{ title: 'PostgreSQL: DROP INDEX', url: 'https://www.postgresql.org/docs/current/sql-dropindex.html' },
		{ title: 'PostgreSQL: DROP TABLE', url: 'https://www.postgresql.org/docs/current/sql-droptable.html' }
	]
};
