const PGB = 'https://github.com/pgbouncer/pgbouncer/blob/7df84b712d836201994b561adf12372226423f2b/src/server.c?plain=1';
const RAILS = 'https://github.com/rails/rails/blob/ccaef690ee7a1f1d02642edd5f710daf031e7e04/activerecord/lib/active_record/connection_adapters';
const CONFIG = 'https://www.pgbouncer.org/config.html';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'connections',
	part: 'Keeping it running',
	title: 'Connections and pooling',
	minutes: 10,
	hook: [
		'A sale starts and you scale the web tier from 10 pods to 40. Two minutes later, the logs fill with `FATAL: sorry, too many clients already`. **The server refuses new logins because every connection slot is taken.**',
		'Each pod runs 4 processes, and each process keeps a pool of 5 connections. That was 200 connections at 10 pods. At 40 it is 800, and the server allows 100. **Most of those connections sit idle**, waiting for a request that might use them.',
		'In PostgreSQL every connection is a whole operating system process, so raising the limit tenfold would start hundreds more of them. The usual answer is a pooler such as PgBouncer: hundreds of clients talk to it, and it shares a few real connections among them. **Its pooling mode decides which session features still work.**'
	],
	terms: [
		{ term: 'Backend process', def: 'The server process PostgreSQL starts for one connection. It lives as long as the connection and holds that session\'s state.' },
		{ term: 'Session pooling', def: 'PgBouncer gives a client one server connection until the client disconnects. Everything works, but idle clients still hold a connection.' },
		{ term: 'Transaction pooling', def: 'PgBouncer gives a client a server connection only for the length of one transaction, then hands it to someone else.' },
		{ term: 'Session state', def: 'Anything that lives on a connection between transactions: `SET` values, `LISTEN`, session advisory locks, SQL `PREPARE`, temp tables.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['app["40 pods x 4 processes x 5 connections"] -->|"800 connections"| pm["postmaster"]', 'pm -->|"one process each, max 100"| be[("backend processes")]'],
				highlight: ['app', 'pm'],
				note: 'Without a pooler, the postmaster starts a new backend process for every new connection. Once the 100 slots run out, the next connection is refused at login with "too many clients already". Most of the connections that got in sit idle.'
			},
			{
				add: ['app -->|"800 client connections"| pgb["PgBouncer"]', 'pgb -->|"20 server connections"| be'],
				highlight: ['pgb'],
				note: 'With a pooler in front, clients connect to PgBouncer instead. It is light (its docs put it at 2 kB per connection by default), holds hundreds of client connections, and keeps a small pool of real ones: `default_pool_size` is 20 per user and database pair.'
			},
			{
				add: ['sess["Session mode: one server connection per client, until it disconnects"] -.-> pgb'],
				highlight: ['sess'],
				note: 'Session mode is the default, and it supports every feature. But app pools keep their connections open all day, so each one still pins a server connection. 800 clients would need 800 server connections.'
			},
			{
				add: ['tx["Transaction mode: server connection back to the pool at COMMIT"] --> pgb'],
				highlight: ['tx'],
				note: 'In transaction mode, a client holds a server connection only while a transaction runs. Requests that spend most of their time outside the database leave it free. 800 clients can share 20 connections if, at any moment, at most 20 are inside a transaction.'
			},
			{
				add: ['tx -->|"SET, LISTEN, advisory locks, PREPARE"| lost["Session state lands on whichever connection ran it"]'],
				highlight: ['lost'],
				note: 'In transaction mode, the next transaction may run on another server connection. A `SET statement_timeout` from an earlier transaction may not apply, a `LISTEN` hears nothing, and a session advisory lock may be released from the wrong connection or never.'
			}
		]
	},
	example: {
		title: 'src/server.c in PgBouncer: the packet that decides when a connection goes back',
		repo: 'pgbouncer/pgbouncer',
		url: `${PGB}#L432-L914`,
		lang: 'c',
		code: `	/* pooling decisions will be based on this packet */
	case PqMsg_ReadyForQuery:

		/* if partial pkt, wait */
		if (!mbuf_get_char(&pkt->data, &state))
			return false;
…
		/* set ready only if no tx */
		if (state == 'I') {
			ready = true;
		} else if (connection_pool_mode(server) == POOL_STMT) {
			disconnect_server(server, true, "transaction blocks not allowed in statement pooling mode");
			return false;
		} else if (state == 'T' || state == 'E') {
			idle_tx = true;
		}
		break;
…
	server->idle_tx = idle_tx;
	server->ready = ready;
…
	case SBUF_EV_FLUSH:
		res = true;
		if (!server->ready)
			break;
…
		if (connection_pool_mode(server) != POOL_SESSION || server->state == SV_TESTED || server->resetting) {
			server->resetting = false;
			switch (server->state) {
			case SV_ACTIVE:
			case SV_ACTIVE_CANCEL:
			case SV_TESTED:
…
				/* retval does not matter here */
				release_server(server);
				break;`,
		notes: [
			'Lines 2 to 16 read the ReadyForQuery packet, which PostgreSQL sends after every query with one status byte. The [protocol docs](https://www.postgresql.org/docs/current/protocol-message-formats.html) define it: "\'I\' if idle (not in a transaction block); \'T\' if in a transaction block; or \'E\' if in a failed transaction block". Only `I`, on line 9, marks the server connection `ready`.',
			'Lines 11 to 13 handle statement mode: if the status is not idle, PgBouncer drops the connection with "transaction blocks not allowed in statement pooling mode". The [config docs](' + CONFIG + '#pool_mode) sum up the three modes: released "after client disconnects", "after transaction finishes", or "after query finishes".',
			'Lines 22 to 35 run once the reply is flushed. A ready server is [released](' + PGB + '#L888-L914) unless the pool is in session mode (line 27). In session mode it stays linked to its client until disconnect, and `server_reset_query` (default `DISCARD ALL`) cleans it before the next client.',
			'In transaction mode PgBouncer runs no reset query. The docs say the reset query "is not used, because in that mode, clients must not use any session-based features, since each transaction ends up in a different connection and thus gets a different session state." Protocol-level prepared statements work if [`max_prepared_statements`](' + CONFIG + '#max_prepared_statements) is non-zero, but SQL `PREPARE`, `EXECUTE` and `DEALLOCATE` "are forwarded straight to Postgres".',
			'Rails migrations take a session lock with [`pg_try_advisory_lock`](' + RAILS + '/postgresql_adapter.rb#L559-L571) and release it with `pg_advisory_unlock`. Through a transaction pooler, the two calls can reach different server connections. Rails has an `advisory_locks` setting to turn the lock off for this case.'
		]
	},
	tradeoff: {
		gain: [
			'Hundreds or thousands of app processes can share a few dozen server connections, so the server spends its memory on queries instead of idle processes.',
			'Scaling the web tier no longer means a database restart to raise `max_connections`.',
			'Clients get a connection from PgBouncer quickly, and the pooler queues them when all server connections are busy instead of the database refusing them.'
		],
		cost: [
			'Transaction mode breaks session features: `SET`, `LISTEN`, session advisory locks, SQL `PREPARE`, `WITH HOLD` cursors and temp tables that outlive a transaction. PgBouncer\'s feature table marks them "Never".',
			'PgBouncer adds a network hop and a service you must run, monitor and fail over. If PgBouncer goes down, every client loses the database.',
			'A slow transaction now holds a shared connection. Twenty slow requests can stall everyone queued behind the pool, so `pool_size` and timeouts need tuning.',
			'Pools stack: an app pool, then PgBouncer, then `max_connections`. Each layer\'s limits must make sense against the next one.'
		]
	},
	task: {
		prompt: 'Your app runs 8 web pods with 4 processes each and a client pool of 5, plus 3 worker pods with a pool of 10. PostgreSQL has `max_connections = 100` and the default `superuser_reserved_connections`. Count the client connections and say whether they fit. Then you put PgBouncer in transaction mode with `default_pool_size = 20`. List three things in a typical Rails app you must check before switching.',
		hint: 'Multiply pods, processes and pool size. The docs say three slots are reserved for superusers by default. For the checklist, look for anything that expects the next transaction to run on the same connection.',
		answer: [
			'Web: 8 x 4 x 5 = 160. Workers: 3 x 10 = 30. Total 190 possible client connections, against 97 slots for ordinary users (100 minus 3 reserved). It does not fit once pools fill up.',
			'Behind PgBouncer: 190 client connections share 20 server connections for the app\'s user and database. That works as long as no more than 20 transactions run at the same moment; the rest wait in PgBouncer\'s queue.',
			'Check 1: migrations. Set `advisory_locks: false`, or run migrations through a direct connection, since they take a session advisory lock.',
			'Check 2: prepared statements. Rails uses protocol-level ones by default, so set PgBouncer\'s `max_prepared_statements` above zero, or `prepared_statements: false` in Rails. Check 3: any `SET` outside a transaction (a per-request `statement_timeout`, a tenant `search_path`) and any `LISTEN`. Use `SET LOCAL` inside the transaction, and give listeners a direct connection.'
		],
		steps: [
			{
				title: 'Count the client connections',
				questions: [
					{ q: 'How many connections can the web pods open?', options: ['40', '160', '20', '32'], answer: 1, why: '8 pods × 4 processes × a pool of 5 is 160.' },
					{ q: 'And the worker pods?', options: ['13', '10', '30', '300'], answer: 2, why: '3 pods × a pool of 10 is 30.' },
					{ q: 'How many slots can the app\'s ordinary user get, with `max_connections = 100`?', options: ['97', '100', '103', '90'], answer: 0, why: 'Three slots are reserved for superusers by default, so ordinary users get 100 minus 3.' },
					{ q: 'Do the 190 possible connections fit?', options: ['Yes, since most of them sit idle', 'Yes, PostgreSQL queues the extra logins', 'Only after a restart', 'No: once the pools fill up, logins are refused'], answer: 3, why: '190 is almost twice the 97 slots. The server refuses the extra logins instead of queuing them.' }
				]
			},
			{
				title: 'Size it behind PgBouncer',
				questions: [
					{ q: 'With transaction mode and `default_pool_size = 20`, how many server connections serve the app\'s user and database?', options: ['20', '190', '97', '100'], answer: 0, why: 'The pool size is per user and database pair. All 190 clients share those 20.' },
					{ q: 'When does that work?', options: ['Always: PgBouncer multiplexes queries on one connection', 'Only if the clients connect one at a time', 'As long as no more than 20 transactions run at the same moment', 'Only in session mode'], answer: 2, why: 'A client holds a server connection only while its transaction runs. Requests that spend most of their time outside the database leave it free.' },
					{ q: 'A 21st transaction starts while 20 are running. What happens to it?', options: ['PostgreSQL refuses the login', 'It waits in PgBouncer\'s queue', 'PgBouncer opens a 21st server connection', 'It runs on a connection already in a transaction'], answer: 1, why: 'The pooler queues clients when all server connections are busy, instead of the database refusing them.' },
					{ q: 'About how much memory does PgBouncer spend on the 190 client connections, at its default cost per connection?', options: ['About 190 MB, one backend process each', 'About 2 kB in all', 'About 20 MB, one per server connection', 'About 380 kB'], answer: 3, why: 'PgBouncer\'s docs put a client connection at about 2 kB by default. 190 × 2 kB is about 380 kB, far less than 190 backend processes.' }
				]
			},
			{
				title: 'Find what breaks in transaction mode',
				questions: [
					{ q: 'Why are Rails migrations at risk behind a transaction pooler?', options: ['They take a session advisory lock, and the unlock can reach another server connection', 'They run DDL, which PgBouncer refuses', 'They need a superuser slot', 'They open more than 20 connections'], answer: 0, why: '`pg_try_advisory_lock` and `pg_advisory_unlock` are separate calls. In transaction mode they can land on different server connections.' },
					{ q: 'Rails uses protocol-level prepared statements by default. What do you check in PgBouncer?', options: ['That `pool_mode` is `statement`', 'That `server_reset_query` is `DISCARD ALL`', 'That `default_pool_size` is above 100', 'That `max_prepared_statements` is above zero'], answer: 3, why: 'PgBouncer tracks protocol-level prepared statements only when that setting is non-zero. Otherwise turn them off in Rails.' },
					{ q: 'A report runs SQL `PREPARE totals AS ...`, then `EXECUTE totals` in a later transaction. What does PgBouncer do with them in transaction mode?', options: ['It tracks them like protocol-level prepared statements', 'It forwards them straight to Postgres, so the EXECUTE may reach a connection that never saw the PREPARE', 'It rejects them with an error', 'It turns them into plain queries'], answer: 1, why: '`max_prepared_statements` covers only protocol-level statements. The docs say SQL `PREPARE` and `EXECUTE` "are forwarded straight to Postgres".' },
					{ q: 'A worker runs `LISTEN jobs` through PgBouncer in transaction mode. What does it hear?', options: ['Every NOTIFY, like a direct connection', 'Only NOTIFYs from its own transactions', 'Possibly nothing: the LISTEN stays on whichever server connection ran it', 'An error at the next COMMIT'], answer: 2, why: '`LISTEN` is session state. PgBouncer\'s feature table marks it "Never" for transaction mode.' }
				]
			},
			{
				title: 'Fix each one',
				questions: [
					{ q: 'How do you fix migrations?', options: ['Set `advisory_locks: false`, or run migrations through a direct connection', 'Raise `default_pool_size` to 100', 'Run migrations twice', 'Switch PgBouncer to statement mode'], answer: 0, why: 'Rails has an `advisory_locks` setting for exactly this case. A direct connection keeps the lock on one session.' },
					{ q: 'How do you set a per-request `statement_timeout` safely?', options: ['`SET statement_timeout` once at boot', '`SET SESSION statement_timeout` before each request', '`ALTER SYSTEM SET statement_timeout`', '`SET LOCAL statement_timeout` inside the transaction'], answer: 3, why: '`SET LOCAL` ends with the transaction, so it never leaks to the next client on that server connection.' },
					{ q: 'Where do listeners go?', options: ['Through the same transaction-mode pool, with a bigger `default_pool_size`', 'Through PgBouncer with `max_prepared_statements` set', 'On a direct connection to PostgreSQL', 'On a read replica'], answer: 2, why: 'A listener needs one connection that stays its own. Oban\'s Postgres notifier warns it does not work through a transaction pooler.' },
					{ q: 'Which part of the stack must make sense against `max_connections` now?', options: ['Only the app pools', 'Each layer: app pools, then PgBouncer\'s pools, then `max_connections`', 'Only PgBouncer\'s `max_client_conn`', 'None: PgBouncer handles it'], answer: 1, why: 'Pools stack. PgBouncer\'s server connections, plus any direct ones, must still fit in the server\'s slots.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Why is raising `max_connections` from 100 to 2000 a poor fix for "too many clients already"?',
			options: [
				'Every connection is a server process, so most of the memory goes to idle ones',
				'PostgreSQL refuses any value of `max_connections` above 1024 at startup',
				'Clients must then reconnect each time, which makes every request slower',
				'The setting applies only to superusers, not to the app\'s own database user'
			],
			answer: 0,
			why: 'Each connection gets its own backend process, and the docs note that PostgreSQL sizes shared resources from `max_connections`. Thousands of mostly idle processes cost memory for nothing. A pooler shares a few connections instead.'
		},
		{
			q: 'Behind PgBouncer in transaction mode, a request runs `SET statement_timeout = \'2s\'` and then, in a new transaction, a slow query. What happens?',
			options: [
				'The query is stopped after 2 seconds, since SET lasts for the session',
				'PgBouncer turns the SET into SET LOCAL so it covers the next transaction',
				'The query may run on another server connection that never saw the SET',
				'PgBouncer rejects the SET because it is a session-level command'
			],
			answer: 2,
			why: 'SET changes the server connection, not the client. The next transaction can get a different server connection, so the timeout may be missing there, and the SET may surprise whichever client gets the first connection next. Use `SET LOCAL` inside the transaction.'
		},
		{
			q: 'Your app keeps 300 connections open all day in its pools. You put PgBouncer in front in session mode with `pool_size = 300`. How many server connections does it end up holding?',
			options: [
				'About 20, because session mode shares connections between transactions',
				'Close to 300, since each client keeps its server connection until it leaves',
				'Exactly one, because session mode sends every client through a single link',
				'None while idle, because PgBouncer closes server connections between queries'
			],
			answer: 1,
			why: 'In session mode a server connection is "released back to pool after client disconnects". App pools rarely disconnect, so PgBouncer saves almost nothing. With a smaller `pool_size`, the clients beyond it would wait until another client disconnects.'
		}
	],
	lab: {
		minutes: 25,
		goal: 'Run out of connection slots on a tiny server, then let PgBouncer share one connection among ten clients and watch a `SET` leak between them.',
		steps: [
			'Create a network and a server with only 10 slots: `docker network create dojo-net` then `docker run -d --name dojo-pg --network dojo-net -e POSTGRES_PASSWORD=dojo postgres:17 -c max_connections=10`. Wait until `docker exec dojo-pg pg_isready` prints `accepting connections`.',
			'Create an ordinary app user: `docker exec dojo-pg psql -U postgres -c "CREATE ROLE app LOGIN PASSWORD \'app\';"`',
			'Fill the slots: `for i in 1 2 3 4 5 6 7; do docker exec -d dojo-pg psql postgres://app:app@localhost/postgres -c "SELECT pg_sleep(60)"; done`. Then try one more: `docker exec dojo-pg psql postgres://app:app@localhost/postgres -c "SELECT 1"`, and the same as superuser: `docker exec dojo-pg psql -U postgres -c "SELECT count(*) FROM pg_stat_activity WHERE usename = \'app\'"`.',
			'Wait a minute for the sleeps to end. Start PgBouncer in transaction mode with a pool of one: `docker run -d --name dojo-pgb --network dojo-net -e DATABASE_URL=postgres://app:app@dojo-pg:5432/postgres -e POOL_MODE=transaction -e DEFAULT_POOL_SIZE=1 -e AUTH_TYPE=scram-sha-256 edoburu/pgbouncer:v1.26.1-p0`',
			'Send ten clients through it at once: `for i in 1 2 3 4 5 6 7 8 9 10; do docker exec dojo-pg psql postgres://app:app@dojo-pgb:5432/postgres -c "SELECT pg_sleep(1)" & done; wait`. Then run the `pg_stat_activity` count from step 3 again.',
			'Leak a setting. Client one: `docker exec dojo-pg psql postgres://app:app@dojo-pgb:5432/postgres -c "SELECT pg_backend_pid()" -c "SET statement_timeout = \'2s\'"`. Client two: `docker exec dojo-pg psql postgres://app:app@dojo-pgb:5432/postgres -c "SELECT pg_backend_pid()" -c "SHOW statement_timeout" -c "SELECT pg_sleep(3)"`.',
			'Fix it. Undo the leak: `docker exec dojo-pg psql postgres://app:app@dojo-pgb:5432/postgres -c "RESET statement_timeout"`. Set the timeout inside one transaction: `docker exec dojo-pg psql postgres://app:app@dojo-pgb:5432/postgres -c "BEGIN" -c "SET LOCAL statement_timeout = \'2s\'" -c "SELECT pg_sleep(3)" -c "COMMIT"`. Then a new client: `docker exec dojo-pg psql postgres://app:app@dojo-pgb:5432/postgres -c "SHOW statement_timeout"`.'
		],
		done: [
			'In step 3, the eighth `app` login fails with `remaining connection slots are reserved for roles with the SUPERUSER attribute`, and the superuser still gets in and counts 7.',
			'In step 5, all ten clients finish, some after `client being queued`, and the count shows 1 `app` connection.',
			'In step 6, both clients print the same backend pid. Client two shows `2s` and its sleep fails with `canceling statement due to statement timeout`.',
			'In step 7, the `SET LOCAL` sleep is cancelled, and the next client shows `statement_timeout` as `0`.'
		],
		solution: [
			'With `max_connections = 10`, three slots are kept for superusers, so ordinary users get 7. The server refuses the eighth login; it never queues it.',
			'PgBouncer queues clients and hands them its single server connection one transaction at a time. Ten clients cost the server one process.',
			'Client two ran on the server connection client one changed. Transaction mode runs no reset query between clients, so session state travels to whoever comes next.',
			'`SET LOCAL` ends with its transaction, so it cannot leak. Clean up with `docker rm -f dojo-pgb dojo-pg` and `docker network rm dojo-net`.'
		]
	},
	recall: {
		q: '40 pods with 4 processes and a pool of 5 each open 800 connections against `max_connections = 100`. What fixes it, and what must the code stop relying on?',
		a: 'PgBouncer in transaction mode, sharing about 20 server connections among the 800 clients. The code must not keep session state across transactions: `SET`, `LISTEN`, session advisory locks, SQL `PREPARE`.'
	},
	sources: [
		{ title: 'Rails, abstract_adapter.rb: the advisory_locks setting', url: `${RAILS}/abstract_adapter.rb#L253-L254` },
		{ title: 'PostgreSQL docs, How Connections Are Established', url: 'https://www.postgresql.org/docs/current/connect-estab.html' },
		{ title: 'PostgreSQL docs, Connections and Authentication settings', url: 'https://www.postgresql.org/docs/current/runtime-config-connection.html' },
		{ title: 'PgBouncer, Features and SQL feature map for pooling modes', url: 'https://www.pgbouncer.org/features.html' },
		{ title: 'PgBouncer, Configuration', url: CONFIG }
	]
};
