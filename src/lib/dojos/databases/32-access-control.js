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
		'Then the audit: the app connects as `postgres`, the superuser. A single SQL injection could read every table, or drop them. **The database trusts the app with everything**, so one bug in the app is a bug in all of it.',
		'PostgreSQL has two guards for this. **Roles and GRANT** decide which tables a connection may touch at all. **Row-level security** decides which rows of those tables it sees, by adding the filter inside the database, on every query, including the one someone forgot.'
	],
	terms: [
		{ term: 'Role', def: 'A database identity. It can log in (a user), or hold privileges for others (a group). Roles can be members of other roles.' },
		{ term: 'GRANT / REVOKE', def: 'Give or take a privilege on an object: `SELECT` on a table, `UPDATE` on one column, `EXECUTE` on a function, `USAGE` on a schema.' },
		{ term: 'PUBLIC', def: 'A pseudo-role meaning every role. Some objects grant to it by default: `EXECUTE` on new functions, `CONNECT` on databases.' },
		{ term: 'Row-level security (RLS)', def: 'Per-table policies that filter which rows a query may read or write. Enabled with `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.' },
		{ term: 'USING / WITH CHECK', def: '`USING` filters the existing rows a command sees. `WITH CHECK` tests the new rows it tries to write. A failed check aborts the command.' },
		{ term: 'Bypass', def: 'Superusers and roles with `BYPASSRLS` skip all policies. The table owner does too, unless the table has `FORCE ROW LEVEL SECURITY`.' },
		{ term: 'Security definer', def: 'A function that runs with its owner\'s privileges, not the caller\'s. The way to let a policy read a table the caller cannot.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['req["HTTP request with a JWT"] --> api["PostgREST, connected as authenticator"]'],
				highlight: ['req', 'api'],
				note: '**One login, many users.** PostgREST, the API layer under Supabase, keeps a pool of connections as one role, `authenticator`, with almost no rights. Its docs call it "a chameleon": its job is to become other users.'
			},
			{
				add: ['api -->|"SET LOCAL ROLE authenticated"| role["Role authenticated"]'],
				highlight: ['role'],
				note: '**Become the caller.** For each request, it checks the JWT and runs `SET LOCAL ROLE` to the role in the token, for that transaction only. It also puts the claims in a setting, `request.jwt.claims`, that SQL can read.'
			},
			{
				add: ['role -->|"GRANT SELECT, INSERT, DELETE"| msgs[("messages")]'],
				highlight: ['msgs'],
				note: '**Privileges first.** Without a grant on the table, the query fails with `permission denied` before any row is read. Grant each role only the commands it needs, down to single columns for `UPDATE`.'
			},
			{
				add: ['pol["Policy: auth.uid() = user_id"] -.->|"filters every row"| msgs'],
				highlight: ['pol'],
				note: '**Then the rows.** With RLS on, each row must pass a policy expression, evaluated "prior to any conditions or functions coming from the user\'s query". A query with no `WHERE` at all still returns only the caller\'s rows. With RLS on and no policy, the answer is no rows.'
			},
			{
				add: ['owner["Owner, superuser, BYPASSRLS"] -->|"skips policies"| msgs'],
				highlight: ['owner'],
				note: '**The hole to close.** The superuser and roles with `BYPASSRLS` skip policies, and so does the table owner by default. If the app connects as the role that ran the migrations, RLS does nothing for it. Use a separate role, or `FORCE ROW LEVEL SECURITY`.'
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
			'**Where `auth.uid()` comes from.** It is plain SQL in [Supabase Auth\'s migration](' + AUTH + '/20220224000811_update_auth_functions.up.sql#L3-L12): it reads `sub` from `current_setting(\'request.jwt.claims\', true)`. PostgREST fills that setting and runs [`SET LOCAL ROLE`](' + PGRST + '/references/auth.rst#L60-L64) per request. The policy trusts the token PostgREST checked, not anything the client sends in the query.',
			'**Two delete policies, one answer.** `messages` has two `for delete` policies: the author, or a role holding `messages.delete`. Permissive policies, the default, are [combined using `OR`](' + PG + '/ddl.sgml#L2996-L3004), so either one lets the row go. A restrictive policy (`AS RESTRICTIVE`) would be combined with `AND` instead.',
			'**Insert checks, update reuses.** Inserts use `with check ( auth.uid() = user_id )`, so nobody can post as someone else. The update policy has only `using`, and [CREATE POLICY](' + PG + '/ref/create_policy.sgml#L372-L378) says that clause is then "used for both USING and WITH CHECK cases": you can only edit your own message, and cannot hand it to another user.',
			'**Default deny, opened by a definer.** `role_permissions` has RLS on and no policy, and with no policy ["a default-deny policy is used"](' + PG + '/ddl.sgml#L2932-L2942). `authorize()` still reads it because it is `security definer`: it runs as its owner. The [CREATE FUNCTION docs](' + PG + '/ref/create_function.sgml#L788-L800) ask such functions to pin `search_path` and to put `pg_temp` last; this one pins it to `public` only.',
			'**Revoke what PUBLIC got for free.** New functions get `EXECUTE` for [PUBLIC by default](' + PG + '/ddl.sgml#L2559-L2577). So the project\'s [auth hook migration](' + SUPA + '/20240214114147_auth-hook.sql#L37-L58) grants the hook to `supabase_auth_admin`, then revokes `execute` and all table rights on `user_roles` from `authenticated, anon`.'
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
			'Errors get quiet: a missing policy returns zero rows, not an error. "Why is the list empty" is a new kind of bug.',
			'Owners, superusers and `BYPASSRLS` roles skip it all. Migrations, backups and admin tools need these, so you must keep the app off them.',
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
			'If the setting is missing, `current_setting` returns NULL, the comparison is NULL, not true (day 6), and no rows pass. Missing context fails closed.',
			'Test it: `SET ROLE app_user; BEGIN; SET LOCAL app.tenant_id = \'42\'; SELECT count(*) FROM invoices;` must count only tenant 42. Then run the same `SELECT` as the table owner and see that it counts everything: that is why the app must not be the owner.'
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
	takeaway: 'Give the app a role that owns nothing and holds only the grants it needs, then let row-level security add the tenant filter to every query, including the one someone forgets.',
	sources: [
		{ title: 'PostgreSQL docs, Row Security Policies', url: 'https://www.postgresql.org/docs/current/ddl-rowsecurity.html' },
		{ title: 'PostgreSQL docs, Privileges', url: 'https://www.postgresql.org/docs/current/ddl-priv.html' },
		{ title: 'PostgREST docs, Database Authorization', url: `${PGRST}/explanations/db_authz.rst` },
		{ title: 'Supabase docs, Row Level Security', url: 'https://supabase.com/docs/guides/database/postgres/row-level-security' }
	]
};
