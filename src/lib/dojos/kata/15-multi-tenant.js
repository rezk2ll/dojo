/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'multi-tenant',
	part: 'Data',
	title: 'Multi-tenant SaaS data',
	minutes: 10,
	hook: [
		'An invoicing product serves 3 000 companies from one PostgreSQL database. Most are bakeries and small agencies with a few hundred invoices a month. One is a retail chain with 300 GB of data.',
		'On the last day of each month the chain runs its reports, and the bakeries\' invoice pages take 4 seconds to open.',
		'Last week a developer shipped a query without `WHERE tenant_id = ...`. A customer saw another company\'s invoice list for 20 minutes.'
	],
	terms: [
		{ term: 'Tenant', def: 'One customer company. Every row of data belongs to exactly one tenant, marked by a `tenant_id` column.' },
		{ term: 'Row-level security', def: 'A PostgreSQL feature: a policy on a table decides which rows each query can see or change, whatever the query\'s own `WHERE` says.' },
		{ term: 'Pool and silo', def: 'Pool: many tenants share the same tables. Silo: one tenant gets a database of its own.' }
	],
	kata: {
		brief: [
			'3 000 customer companies, 40 tables, one schema. 2 995 companies hold 900 GB together, about 300 MB each. The 5 largest hold 800 GB, the largest 300 GB.',
			'A query from one company must never return another company\'s rows, even when the developer forgot the `tenant_id` filter.',
			'One company\'s heavy reports must not slow the others: invoice pages stay under 500 ms for everyone.',
			'Any company can ask for an export of all its data as CSV files, delivered within 24 hours.'
		],
		minutes: 10,
		checklist: [
			'Your design says where the data of a 300 MB company lives, and where the 300 GB company\'s lives.',
			'Your design says what stops a query without a `tenant_id` filter from returning other companies\' rows.',
			'Your design says how the current tenant reaches the database on a pooled connection, and how it is cleared before the next request.',
			'Your design says how a request finds the right database for its tenant.',
			'Your design says how one company\'s export is produced, and which server runs it.',
			'Your design says how you restore one company\'s data after it deletes 1 000 invoices by mistake.'
		],
		sample: [
			'The 2 995 smaller companies share one PostgreSQL cluster (the pool, 900 GB). Each of the 5 largest gets its own cluster with the same schema (a silo). A routing table `tenant_id → cluster` is read at login and cached by the app.',
			'In the pool, every table has `tenant_id`, and every primary key and index starts with it. Every table has `ENABLE ROW LEVEL SECURITY` and a policy `USING (tenant_id = current_setting(\'app.tenant_id\', true)::bigint)`. The PostgreSQL docs: if a table has row security and no policy, "a default-deny policy is used".',
			'The docs also say "Superusers and roles with the BYPASSRLS attribute always bypass" row security, and table owners normally do too. So the app connects as a role that owns no table and has no `BYPASSRLS`. Migrations run as a separate owner role.',
			'Each transaction starts with `SET LOCAL app.tenant_id = \'123\'`. The docs: "The effects of SET LOCAL last only till the end of the current transaction, whether committed or not". A pooled connection therefore never hands tenant 123 to the next request. On a connection where it was never set, `current_setting(\'app.tenant_id\', true)` returns NULL and the policy matches no rows.',
			'The silos solve the month-end slowdown: the chain\'s reports run on its own cluster and its own disks. The cost is 6 clusters: each schema migration runs 6 times, and a small company that grows past 100 GB needs a copy job and a short write freeze to move to a silo.',
			'Exports run on a replica of the tenant\'s cluster, so the primary keeps serving pages. For each of the 40 tables, a job runs `COPY (SELECT * FROM invoices WHERE tenant_id = 123) TO STDOUT WITH (FORMAT csv)` and writes the result to a zip in object storage. At an assumed 50 MB/s, 300 MB takes 6 seconds and 300 GB about 100 minutes, well inside 24 hours.',
			'In the pool, restoring one company takes a detour. A backup restores the whole 900 GB cluster, so you restore it to a spare server and copy that company\'s rows back with the same `COPY` queries. A silo company restores alone.',
			'In the pool, only the policy keeps tenants apart. One plain `SET` instead of `SET LOCAL` keeps the tenant on the connection for the rest of the session, because the docs say plain `SET` lasts "until the end of the session". A code review rule and a test that greps for `SET app.tenant_id` cover that.'
		]
	},
	quiz: [],
	recall: {
		q: 'In the sample, what stops a query that forgot `WHERE tenant_id = ...` from returning another company\'s rows?',
		a: 'A row-level security policy `tenant_id = current_setting(\'app.tenant_id\', true)::bigint` on every pooled table, with `SET LOCAL app.tenant_id` at the start of each transaction and an app role that owns no table and has no `BYPASSRLS`.'
	},
	sources: [
		{ title: 'PostgreSQL docs, Row Security Policies', url: 'https://www.postgresql.org/docs/current/ddl-rowsecurity.html' },
		{ title: 'PostgreSQL docs, SET (SET LOCAL lasts until the end of the transaction)', url: 'https://www.postgresql.org/docs/current/sql-set.html' },
		{ title: 'PostgreSQL docs, COPY (copying the results of a SELECT)', url: 'https://www.postgresql.org/docs/current/sql-copy.html' }
	]
};
