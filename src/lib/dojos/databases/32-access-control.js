const SUPA = 'https://github.com/supabase/supabase/blob/5281766182090278491a5b0eeb4bf3fa1b49c408/examples/slack-clone/nextjs-slack-clone/supabase/migrations';
const PG = 'https://github.com/postgres/postgres/blob/26bd08fb5c069fbdf55867adc398cfca0f55d5c8/doc/src/sgml';
const PGRST = 'https://github.com/PostgREST/postgrest/blob/c042567494b1cbb5009005b82c78d9e5da8b4a2a/docs';
const AUTH = 'https://github.com/supabase/auth/blob/ce9a8eee0cc042be8c7a42981a7ddae631e41d91/migrations';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'access-control',
	part: 'Keeping it running',
	title: 'Roles, grants and row-level security',
	minutes: 10,
	hook: [
		'A support ticket: a customer opened an invoice page and saw **another company\'s invoice**. One new query in one controller forgot `WHERE tenant_id = ?`. Every other query had it. Code review missed it.',
		'Then the audit: the app connects as `postgres`, the superuser. A single SQL injection in any query could read every table, or drop them.',
		'PostgreSQL checks access at two levels. Roles and `GRANT` decide which tables a connection may touch at all. **Row-level security** decides which rows of those tables it sees: the database adds the filter to every query, including the one that forgot it.'
	],
	terms: [
		{ term: 'Role', def: 'A database identity. It can log in (a user), or hold privileges for others (a group). Roles can be members of other roles.' },
		{ term: 'Row-level security (RLS)', def: 'Per-table policies that filter which rows a query may read or write. Enabled with `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.' },
		{ term: 'USING / WITH CHECK', def: '`USING` filters the existing rows a command sees. `WITH CHECK` tests the new rows it tries to write. A failed check aborts the command.' },
		{ term: 'Bypass', def: 'Superusers and roles with `BYPASSRLS` skip all policies. The table owner does too, unless the table has `FORCE ROW LEVEL SECURITY`.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['req["HTTP request with a JWT"] --> api["PostgREST, connected as authenticator"]'],
				highlight: ['req', 'api'],
				note: 'PostgREST, the API layer under Supabase, keeps a pool of connections as one role, `authenticator`, with almost no rights. Its docs call it "a chameleon", because it switches to another role for each request.'
			},
			{
				add: ['api -->|"SET LOCAL ROLE authenticated"| role["Role authenticated"]'],
				highlight: ['role'],
				note: 'For each request, PostgREST checks the JWT and runs `SET LOCAL ROLE` with the role named in the token, for that transaction only. It also puts the claims in a setting, `request.jwt.claims`, that SQL can read.'
			},
			{
				add: ['role -->|"GRANT SELECT, INSERT, DELETE"| msgs[("messages")]'],
				highlight: ['msgs'],
				note: 'Without a grant on the table, the query fails with `permission denied` before any row is read. Grant each role only the commands it needs, down to single columns for `UPDATE`.'
			},
			{
				add: ['pol["Policy: auth.uid() = user_id"] -.->|"filters every row"| msgs'],
				highlight: ['pol'],
				note: 'With RLS on, each row must pass a policy expression, evaluated "prior to any conditions or functions coming from the user\'s query". A query with no `WHERE` at all still returns only the caller\'s rows. With RLS on and no policy, the answer is no rows.'
			},
			{
				add: ['owner["Owner, superuser, BYPASSRLS"] -->|"skips policies"| msgs'],
				highlight: ['owner'],
				note: 'The superuser and roles with `BYPASSRLS` skip policies, and so does the table owner by default. If the app connects as the role that ran the migrations, its queries skip every policy. Use a separate role, or `FORCE ROW LEVEL SECURITY`.'
			}
		]
	},
	example: {
		title: 'Supabase Slack clone, supabase/migrations/20240214102356_init.sql: policies per command and per role',
		repo: 'supabase/supabase',
		url: `${SUPA}/20240214102356_init.sql#L57-L92`,
		lang: 'sql',
		code: `create function public.authorize(
  requested_permission app_permission
)
returns boolean as $$
declare
  bind_permissions int;
begin
  select count(*)
  from public.role_permissions
  where role_permissions.permission = authorize.requested_permission
    and role_permissions.role = (auth.jwt() ->> 'user_role')::public.app_role
  into bind_permissions;
  
  return bind_permissions > 0;
end;
$$ language plpgsql security definer set search_path = public;
…
alter table public.users enable row level security;
alter table public.channels enable row level security;
alter table public.messages enable row level security;
alter table public.user_roles enable row level security;
alter table public.role_permissions enable row level security;
…
create policy "Allow logged-in read access" on public.messages for select using ( auth.role() = 'authenticated' );
create policy "Allow individual insert access" on public.messages for insert with check ( auth.uid() = user_id );
create policy "Allow individual update access" on public.messages for update using ( auth.uid() = user_id );
create policy "Allow individual delete access" on public.messages for delete using ( auth.uid() = user_id );
create policy "Allow authorized delete access" on public.messages for delete using ( authorize('messages.delete') );
create policy "Allow individual read access" on public.user_roles for select using ( auth.uid() = user_id );`,
		notes: [
			'Lines 24 to 29 call `auth.uid()`, which is plain SQL in [Supabase Auth\'s migration](' + AUTH + '/20220224000811_update_auth_functions.up.sql#L3-L12): it reads `sub` from `current_setting(\'request.jwt.claims\', true)`. PostgREST fills that setting and runs `SET LOCAL ROLE` per request. The policy trusts the token PostgREST checked, and ignores anything the client sends in the query.',
			'Lines 27 and 28 are two `for delete` policies on `messages`: the author, or a role holding `messages.delete`. Permissive policies, the default, are [combined using `OR`](' + PG + '/ddl.sgml#L2996-L3004), so either one lets the row go. A restrictive policy (`AS RESTRICTIVE`) would be combined with `AND` instead.',
			'Line 25 checks inserts with `with check ( auth.uid() = user_id )`, so nobody can post as someone else. The update policy on line 26 has only `using`, and [CREATE POLICY](' + PG + '/ref/create_policy.sgml#L372-L378) says that clause is then "used for both USING and WITH CHECK cases". You can only edit your own message, and you cannot hand it to another user.',
			'Line 22 turns RLS on for `role_permissions`, which has no policy, and with no policy "a default-deny policy is used". `authorize()` on lines 1 to 16 still reads it because it is `security definer`: it runs as its owner. The [CREATE FUNCTION docs](' + PG + '/ref/create_function.sgml#L788-L800) ask such functions to pin `search_path` and to put `pg_temp` last; this one pins it to `public` only.',
			'New functions get `EXECUTE` for the pseudo-role PUBLIC, meaning every role, by default. So the project\'s [auth hook migration](' + SUPA + '/20240214114147_auth-hook.sql#L37-L58) grants the hook to `supabase_auth_admin`, then revokes `execute` and all table rights on `user_roles` from `authenticated, anon`.'
		]
	},
	tradeoff: {
		gain: [
			'The tenant filter lives in one place, the database. A query that forgets `WHERE tenant_id = ?` still sees only the tenant\'s rows.',
			'A low-privilege role limits the damage of a SQL injection: no `DROP`, no reading tables the role was never granted.',
			'The same rules hold for every client: the web app, a cron script, a BI tool, or a developer in `psql` with that role.'
		],
		cost: [
			'Policies run on every row a query touches. A policy that calls a function or a subquery per row can make a fast query slow. Index the columns policies filter on.',
			'A missing policy returns zero rows and raises no error, so the only symptom is an empty list.',
			'Owners, superusers and `BYPASSRLS` roles skip every policy. Migrations, backups and admin tools need these roles, so the app must connect with a different one.',
			'Connection pools must not leak a role or a tenant setting from one request to the next. `SET LOCAL` inside a transaction is safe; a plain `SET` on a pooled session is not (day 25).'
		]
	},
	task: {
		prompt: 'Your app stores `invoices(id, tenant_id, amount)`. The app connects as `app_user`, which does not own the table. Each request starts a transaction and runs `SET LOCAL app.tenant_id = \'42\'`. In `psql`, write the grants and the policy so `app_user` can read and insert only its tenant\'s invoices, can never delete, and cannot insert a row for another tenant.',
		hint: 'Two layers: GRANT for which commands, a policy for which rows. `current_setting(\'app.tenant_id\', true)` returns NULL when the setting is missing.',
		answer: [
			'Grants: `GRANT SELECT, INSERT ON invoices TO app_user;`. Tables grant nothing to PUBLIC by default, so that is all `app_user` gets. No `DELETE` grant, so a delete fails with `permission denied` whatever the policy says.',
			'RLS: `ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;`. From now on, `app_user` sees no rows until a policy lets them through.',
			'Policy: `CREATE POLICY tenant_isolation ON invoices TO app_user USING (tenant_id = current_setting(\'app.tenant_id\', true)::bigint);`. With no `WITH CHECK`, the `USING` expression also checks inserted rows, so an insert with `tenant_id = 7` fails.',
			'If the setting is missing, `current_setting` returns NULL, the comparison is NULL, not true (day 6), and no rows pass. A request that skipped `SET LOCAL` sees no invoices.',
			'Test it: `SET ROLE app_user; BEGIN; SET LOCAL app.tenant_id = \'42\'; SELECT count(*) FROM invoices;` must count only tenant 42. Then run the same `SELECT` as the table owner and see that it counts everything: that is why the app must not be the owner.'
		],
		steps: [
			{
				title: 'Grant the commands',
				questions: [
					{ q: 'Which grant matches "read and insert, never delete"?', options: ['`GRANT SELECT, INSERT ON invoices TO app_user;`', '`GRANT ALL ON invoices TO app_user;`', '`GRANT SELECT, INSERT, DELETE ON invoices TO app_user;`', '`GRANT USAGE ON invoices TO app_user;`'], answer: 0, why: 'Grant each role only the commands it needs. Here that is `SELECT` and `INSERT`, nothing more.' },
					{ q: 'Does `app_user` get any other right on `invoices` without asking?', options: ['Yes: PUBLIC gets `SELECT` on every new table', 'No: tables grant nothing to PUBLIC by default', 'Yes: every role can read tables in `public`', 'Only `DELETE`, which you must revoke'], answer: 1, why: 'Tables grant nothing to PUBLIC by default, so the grant above is all `app_user` has. Functions are different: they get `EXECUTE` for PUBLIC.' },
					{ q: '`app_user` runs `DELETE FROM invoices`. What happens?', options: ['It deletes its own tenant\'s rows only', 'It returns `DELETE 0` and changes nothing', 'It fails with `permission denied`', 'It deletes every row of the table'], answer: 2, why: 'With no `DELETE` grant, the command fails before any row is read, whatever the policy says.' },
					{ q: 'The policy will filter rows. Why still keep the grants tight?', options: ['Policies cannot apply to `DELETE`', 'Grants decide which commands, the policy decides which rows', 'Grants make the policy run faster', 'RLS cannot be turned on without a grant'], answer: 1, why: 'They are two levels. A low-privilege role also limits what a SQL injection can do: no `DROP`, no tables it was never granted.' }
				]
			},
			{
				title: 'Turn on row-level security',
				questions: [
					{ q: 'Which statement turns it on for the table?', options: ['`ALTER ROLE app_user ENABLE ROW LEVEL SECURITY;`', '`GRANT ROW LEVEL SECURITY ON invoices TO app_user;`', '`ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;`', '`CREATE POLICY ON invoices ENABLE;`'], answer: 2, why: 'RLS is a per-table switch, set with `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.' },
					{ q: 'RLS is on and no policy exists yet. What does `app_user` see?', options: ['No rows, and no error', 'Every row, until a policy exists', 'An error saying a policy is missing', 'Only the rows it inserted itself'], answer: 0, why: 'With no policy, a default-deny policy applies. The only symptom is an empty result.' },
					{ q: 'Why does it matter that `app_user` does not own the table?', options: ['The owner cannot insert rows', 'Only the owner may run `SET LOCAL`', 'Policies apply only to the owner', 'The owner skips the policies by default'], answer: 3, why: 'The table owner, superusers and `BYPASSRLS` roles skip row security. An app that connects as the owner sees every tenant.' },
					{ q: 'In another app, the role that ran the migrations owns the table and the app connects with it. What makes the policies apply to it?', options: ['Adding a `WITH CHECK` clause', 'Granting it `BYPASSRLS`', 'Using `SET` instead of `SET LOCAL`', '`ALTER TABLE invoices FORCE ROW LEVEL SECURITY;`'], answer: 3, why: '`FORCE ROW LEVEL SECURITY` makes the owner go through the policies too. A separate app role is the other fix.' }
				]
			},
			{
				title: 'Write the policy',
				questions: [
					{ q: 'Which `USING` expression keeps only the request\'s tenant?', options: ['`tenant_id = current_user`', '`tenant_id = 42`', '`tenant_id = current_setting(\'app.tenant_id\', true)::bigint`', '`tenant_id IS NOT NULL`'], answer: 2, why: 'Each request sets `app.tenant_id` with `SET LOCAL`. The policy reads it and casts it to the column\'s type.' },
					{ q: 'The policy has `USING` and no `WITH CHECK`. What happens on `INSERT`?', options: ['Inserts are never checked', 'The `USING` expression also checks the new row', 'The row is inserted, then hidden', 'The insert needs a second policy to run at all'], answer: 1, why: 'Without `WITH CHECK`, the `USING` expression is used for both cases, so new rows must match the tenant too.' },
					{ q: 'With the tenant set to 42, `app_user` inserts a row with `tenant_id = 7`. What happens?', options: ['The row is stored with `tenant_id = 42` instead', 'The row is stored but nobody can see it', 'A warning is logged and the row goes in', 'The check fails and the command aborts'], answer: 3, why: 'A failed check aborts the command. Nobody can write a row for another tenant.' },
					{ q: 'What does `TO app_user` do in `CREATE POLICY tenant_isolation ON invoices TO app_user ...`?', options: ['It applies the policy to that role', 'It grants `app_user` the table', 'It makes `app_user` the owner', 'It makes the policy restrictive'], answer: 0, why: 'A policy can target roles. Here only `app_user` goes through it. Rights still come from `GRANT`.' }
				]
			},
			{
				title: 'Test it',
				questions: [
					{ q: 'As `app_user`, inside `BEGIN; SET LOCAL app.tenant_id = \'42\';`, what does `SELECT count(*) FROM invoices` count?', options: ['Every invoice', 'Only tenant 42\'s invoices', 'Zero, until you commit', 'An error, since there is no `WHERE`'], answer: 1, why: 'The policy is added to every query, so a query with no `WHERE` still sees only the tenant\'s rows.' },
					{ q: 'On a fresh connection that never set `app.tenant_id`, a request forgets the `SET LOCAL`. What does the same query return?', options: ['An error about an unknown setting', 'Every invoice', 'Zero rows', 'The rows of the last tenant on that connection'], answer: 2, why: 'With `true` as the second argument, `current_setting` returns NULL. `tenant_id = NULL` is not true, so no row passes.' },
					{ q: 'Why `SET LOCAL` and not a plain `SET`?', options: ['`SET` cannot hold a custom setting', '`SET LOCAL` is faster to read in a policy', '`SET` only works for superusers', '`SET LOCAL` ends with the transaction, so a pooled connection does not leak the tenant'], answer: 3, why: 'A plain `SET` stays on the session, and the next request on that pooled connection would inherit tenant 42.' },
					{ q: 'You run the same `SELECT` as the table owner and it counts every tenant. What does that show?', options: ['The owner skips the policies, so the app must not connect as it', 'The policy is wrong and needs `WITH CHECK`', '`SET LOCAL` did not apply', 'RLS turned itself off'], answer: 0, why: 'This is the bypass at work. It is why the app uses `app_user` and not the role that owns the table.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'You run `ALTER TABLE orders ENABLE ROW LEVEL SECURITY` and create no policy. The app role has `SELECT` on `orders`. What does `SELECT * FROM orders` return for it?',
			options: [
				'Every row, because a table with no policy is not filtered at all',
				'An error, because a table with RLS on needs at least one policy',
				'No rows, because with no policy a default-deny policy applies',
				'Only the rows that the app role inserted itself into the table'
			],
			answer: 2,
			why: 'With RLS enabled, every row must be allowed by a policy. With none, PostgreSQL uses a default-deny policy: no rows are visible, and no error tells you why.'
		},
		{
			q: 'A table has two permissive `FOR DELETE` policies: one allows the author, one allows moderators. Who can delete a row?',
			options: [
				'Only someone who is both the author and a moderator of the channel',
				'The author or a moderator, since permissive policies combine with OR',
				'Nobody, because two policies for one command conflict and both fail',
				'Only the moderators, because the policy created last wins over others'
			],
			answer: 1,
			why: 'Permissive policies, the default, are combined with OR: passing any one of them is enough. Restrictive policies are combined with AND and are how you add a condition every row must meet.'
		},
		{
			q: 'RLS is on for `invoices` with a tenant policy, and the app still sees every tenant\'s rows. What is the most likely cause?',
			options: [
				'The policy has a USING clause but forgot to add a WITH CHECK clause',
				'The app reads through a connection pool, which skips the policies',
				'The app has SELECT granted on the table instead of a policy grant',
				'The app connects as the table owner, which bypasses its policies'
			],
			answer: 3,
			why: 'Table owners, superusers and BYPASSRLS roles skip row security. Apps often connect as the role that ran the migrations, which owns the tables. Use a separate role, or FORCE ROW LEVEL SECURITY.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Lock a local `invoices` table so `app_user` sees and writes only its tenant\'s rows, and watch the owner skip the policy.',
		steps: [
			'Start PostgreSQL and open `psql` as the superuser: `docker run -d --name rls-lab -e POSTGRES_PASSWORD=lab postgres:16`, wait a few seconds, then `docker exec -it rls-lab psql -U postgres`.',
			'Create the table and two tenants: `CREATE TABLE invoices (id bigserial PRIMARY KEY, tenant_id bigint NOT NULL, amount numeric NOT NULL); INSERT INTO invoices (tenant_id, amount) VALUES (42, 100), (42, 250), (7, 999); CREATE ROLE app_user;`.',
			'Write the grants. The `bigserial` column also needs `GRANT USAGE ON SEQUENCE invoices_id_seq TO app_user;` for inserts. Check with `SET ROLE app_user; SELECT count(*) FROM invoices; RESET ROLE;`.',
			'Turn on RLS, run the same check, then write the tenant policy and run the check again, before any `SET LOCAL`.',
			'Test as `app_user` inside a transaction: `SET ROLE app_user; BEGIN; SET LOCAL app.tenant_id = \'42\';`, then a `SELECT count(*)`, an insert for tenant 7, an insert for tenant 42, and a `DELETE FROM invoices`. After each error, run `ROLLBACK;`, then `BEGIN; SET LOCAL app.tenant_id = \'42\';` again before the next statement.',
			'`RESET ROLE;` and count again as `postgres`. When you are done: `docker rm -f rls-lab`.'
		],
		done: [
			'Before RLS, `app_user` counts 3. With RLS on and no policy, it counts 0.',
			'Right after the policy, before any `SET LOCAL`, `app_user` counts 0. With `SET LOCAL app.tenant_id = \'42\'`, it counts 2, tenant 42\'s rows.',
			'The insert for tenant 7 fails with `new row violates row-level security policy for table "invoices"`, and the insert for tenant 42 works.',
			'`DELETE FROM invoices` fails with `permission denied for table invoices`.',
			'As `postgres`, `SELECT count(*) FROM invoices` counts every tenant.'
		],
		solution: [
			'`GRANT SELECT, INSERT ON invoices TO app_user; GRANT USAGE ON SEQUENCE invoices_id_seq TO app_user;`',
			'`ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;`',
			'`CREATE POLICY tenant_isolation ON invoices TO app_user USING (tenant_id = current_setting(\'app.tenant_id\', true)::bigint);`',
			'Once the session has set `app.tenant_id`, the setting comes back as an empty string after the transaction, not NULL, so a later query without `SET LOCAL` fails with `invalid input syntax for type bigint: ""`. Either way, no row leaks.',
			'`postgres` is a superuser, so it skips every policy. The app must connect as a role like `app_user`, never as the owner or a superuser.'
		]
	},
	recall: {
		q: 'What stops a query that forgot `WHERE tenant_id = ?` from reading other tenants\' rows, and which roles skip it?',
		a: 'A row-level security policy, such as `USING (tenant_id = current_setting(\'app.tenant_id\', true)::bigint)`, filters every query. The table owner, superusers and `BYPASSRLS` roles skip it, so the app connects as a separate role.'
	},
	sources: [
		{ title: 'PostgreSQL docs, Row Security Policies', url: 'https://www.postgresql.org/docs/current/ddl-rowsecurity.html' },
		{ title: 'PostgreSQL docs, Privileges', url: 'https://www.postgresql.org/docs/current/ddl-priv.html' },
		{ title: 'PostgREST docs, Database Authorization', url: `${PGRST}/explanations/db_authz.rst` },
		{ title: 'PostgREST docs, Authentication: SET LOCAL ROLE per request', url: `${PGRST}/references/auth.rst#L60-L64` },
		{ title: 'PostgreSQL source docs, ddl.sgml: default-deny policy', url: `${PG}/ddl.sgml#L2932-L2942` },
		{ title: 'PostgreSQL source docs, ddl.sgml: default privileges for PUBLIC', url: `${PG}/ddl.sgml#L2559-L2577` },
		{ title: 'Supabase docs, Row Level Security', url: 'https://supabase.com/docs/guides/database/postgres/row-level-security' }
	]
};
