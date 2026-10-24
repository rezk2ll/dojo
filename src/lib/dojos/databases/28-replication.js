const RAILS = 'https://github.com/rails/rails/blob/ccaef690ee7a1f1d02642edd5f710daf031e7e04';
const SELECTOR = `${RAILS}/activerecord/lib/active_record/middleware/database_selector`;
const LB = 'https://github.com/gitlabhq/gitlabhq/blob/28f70ed3725bbc2bb6cbfa635ab6dd9bfa57af9a/lib/gitlab/database/load_balancing';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'replication',
	part: 'Keeping it running',
	title: 'Replication and lag',
	minutes: 10,
	hook: [
		'A user edits their profile, clicks Save, and the page reloads with **the old name**. They click Save again. Support gets a ticket: "the site does not save".',
		'Nothing was lost. The write went to the primary. The page after the redirect read from a replica that was **a few hundred milliseconds behind**, and had not replayed that commit yet.',
		'The primary streams its WAL to each replica, and the replica replays it a little later. `synchronous_commit` decides whether a commit waits for that replay, `pg_stat_replication` shows the lag, and Rails sends a user who just wrote back to the primary.'
	],
	terms: [
		{ term: 'Asynchronous replication', def: 'PostgreSQL\'s default: a commit returns once the primary has flushed its own WAL. Replicas catch up a little later.' },
		{ term: 'Synchronous replication', def: 'A commit also waits for named standbys. `synchronous_commit` chooses how far: written (`remote_write`), flushed (`on`), or replayed and visible (`remote_apply`).' },
		{ term: 'Replication lag', def: 'How far a replica is behind, in bytes of WAL or in seconds. Shown per replica in `pg_stat_replication` on the primary.' },
		{ term: 'Read your own writes', def: 'A promise to one user: after they write, their next read sees it. Replicas alone do not give it; the app has to route for it.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['save["Save: UPDATE users SET name"] -->|"COMMIT"| prim[("Primary")]'],
				highlight: ['save', 'prim'],
				note: 'The commit is a WAL record flushed on the primary (day 15). With the default settings, the app gets its answer right then. No replica has been asked anything.'
			},
			{
				add: ['prim -->|"WAL stream"| rep[("Replica")]'],
				highlight: ['rep'],
				note: 'The primary sends the WAL to the replica over a connection as it is written. The replica writes it, flushes it and replays it, and accepts read-only queries meanwhile. The docs: there is "a small delay between committing a transaction in the primary and the changes becoming visible in the standby", "typically under one second" if the replica keeps up.'
			},
			{
				add: ['page["Next page: SELECT name"] -.->|"before replay"| rep'],
				highlight: ['page'],
				note: 'The redirect lands on the replica inside that gap and reads the old row. On the primary, `pg_stat_replication` shows the gap per replica: `write_lag`, `flush_lag` and `replay_lag`. Reads depend on `replay_lag`, because a query on the replica sees a row only after replay.'
			},
			{
				add: ['sync["synchronous_commit = remote_apply"] -.->|"commit waits for replay"| prim'],
				highlight: ['sync'],
				note: 'With a synchronous standby and `remote_apply`, the commit returns only once that standby has replayed it. Every commit then pays a network round trip, and the docs warn such commits "may never be completed if any one of the synchronous standbys should crash".'
			},
			{
				add: ['stick["Rails: wrote less than 2 s ago"] -->|"read from primary"| prim'],
				highlight: ['stick'],
				note: 'The app can instead send a user\'s reads to the primary for a short window after that user writes. Rails does it on a timer. GitLab does it by WAL position, and only goes back to a replica once it has caught up.'
			}
		]
	},
	example: {
		title: 'activerecord/lib/active_record/middleware/database_selector/resolver.rb: reads go to the primary for 2 seconds after a write',
		repo: 'rails/rails',
		url: `${SELECTOR}/resolver.rb#L17-L88`,
		lang: 'ruby',
		code: `      # By default the Resolver class will send read traffic to the replica
      # if it's been 2 seconds since the last write.
      class Resolver # :nodoc:
        SEND_TO_REPLICA_DELAY = 2.seconds

        def self.call(context, options = {})
          new(context, options)
        end

        def initialize(context, options = {})
          @context = context
          @options = options
          @delay = @options && @options[:delay] ? @options[:delay] : SEND_TO_REPLICA_DELAY
          @instrumenter = ActiveSupport::Notifications.instrumenter
        end

        attr_reader :context, :delay, :instrumenter

        def read(&blk)
          if read_from_primary?
            read_from_primary(&blk)
          else
            read_from_replica(&blk)
          end
        end

        def write(&blk)
          write_to_primary(&blk)
        end
…
          def write_to_primary
            ActiveRecord::Base.connected_to(role: ActiveRecord.writing_role, prevent_writes: false) do
              instrumenter.instrument("database_selector.active_record.wrote_to_primary") do
                yield
              ensure
                context.update_last_write_timestamp
              end
            end
          end

          def read_from_primary?
            !time_since_last_write_ok?
          end

          def send_to_replica_delay
            delay
          end

          def time_since_last_write_ok?
            Time.now - context.last_write_timestamp >= send_to_replica_delay
          end`,
		notes: [
			'Lines 19 to 29: the [middleware](' + SELECTOR + '.rb#L72-L84) calls `read` when `reading_request?` is true (GET, HEAD or QUERY) and `write` for every other request. `read` then picks the primary while less than `delay` (2 seconds, line 4) has passed since this user\'s last write.',
			'Lines 35 and 36: `write_to_primary` updates the timestamp in an `ensure`, so a write that raised still counts. [`Session`](' + SELECTOR + '/resolver/session.rb#L34-L40) stores it in milliseconds under `session[:last_write]`. Each user has their own session, so the window applies only to the user who wrote, in that browser.',
			'The guide: "Rails guarantees "read your own write" and will send your GET or HEAD request to the writer if it\'s within the `delay` window." It also says Rails "doesn\'t guarantee "read a recent write" for other users", and that you [should change the delay](' + RAILS + '/guides/source/active_record_multiple_databases.md?plain=1#L330-L334) "based on your database infrastructure". With a replica 3 seconds behind, a 2 second window sends the user to stale data for 1 second.',
			'GitLab measures the replica instead of using a timer. `stick` (in the sources) saves "the latest WAL pointer from the primary" for a user. Later, [`caught_up?`](' + LB + '/host.rb#L274-L281) asks a replica how far it is behind that pointer, using `pg_wal_lsn_diff` against `pg_last_wal_replay_lsn()`, and accepts the replica only when the difference is zero or less.',
			'GitLab also computes lag in seconds, as [`now() - pg_last_xact_replay_timestamp()`](' + LB + '/host.rb#L57-L59). That timestamp is when the last replayed commit was generated on the primary, so on a quiet primary the number grows even when the replica is missing nothing.'
		]
	},
	tradeoff: {
		gain: [
			'Read traffic spreads over replicas, and the primary keeps its capacity for writes.',
			'A replica holds nearly current data if the primary dies.',
			'Asynchronous replication costs the commit nothing: the primary never waits for the network.'
		],
		cost: [
			'Asynchronous means a crash can lose commits: "The amount of data loss is proportional to the replication delay at the time of failover."',
			'Synchronous means every commit waits a round trip, and a dead synchronous standby can stall commits until another takes its place.',
			'Every read path now has to choose: primary for fresh data, replica for scale. A wrong choice shows a stale page and raises no error.',
			'A bulk import or a long query on the replica can push the lag from milliseconds to minutes.'
		]
	},
	task: {
		prompt: 'After Save, your app redirects and the next GET goes to a replica unless Rails\' 2 second window applies. `pg_stat_replication` shows `replay_lag` around 0.4 s, and 6 s during the nightly import. Who sees stale data, and when? Then give two fixes and what each one costs.',
		hint: 'Compare the lag to the window for the user who wrote, then for everyone else.',
		answer: [
			'Normal hours: 0.4 s of lag is inside the 2 s window, so the user who saved reads from the primary and sees the new name. Other users may read data up to 0.4 s old, which is usually fine.',
			'During the import: 6 s of lag is past the window. Between 2 s and 6 s after Save, the user\'s GET goes to a replica that has not replayed the write: they see the old name. Everyone else sees data 6 s old.',
			'Fix 1: raise the window, `delay: 10.seconds`. Simple, but more reads hit the primary, and it is still a guess about the worst lag.',
			'Fix 2: track the WAL position like GitLab. After the write, store `pg_current_wal_lsn()` for the user; before using a replica, check `pg_wal_lsn_diff(stored, pg_last_wal_replay_lsn()) <= 0` on it. Exact, at the cost of one more query and somewhere to store the position.',
			'Fix 3, for the few writes that matter: `SET LOCAL synchronous_commit = remote_apply` in that transaction, with a synchronous standby. The commit waits until the standby shows the change. It costs latency on those commits, and they stall if the standby is down.'
		],
		steps: [
			{
				title: 'Compare the lag to the window',
				questions: [
					{ q: 'Which `pg_stat_replication` column tells you when a replica read will see the write?', options: ['`write_lag`', '`flush_lag`', '`replay_lag`', '`sync_state`'], answer: 2, why: 'A query on the replica sees a row only after replay. Written or flushed WAL is not visible yet.' },
					{ q: 'Normal hours: lag 0.4 s, window 2 s. What does the user who saved see?', options: ['The new name: their GET goes to the primary', 'The old name for 0.4 s', 'The old name for 2 s', 'An error until the replica catches up'], answer: 0, why: 'They wrote less than 2 s ago, so Rails reads from the primary. The lag is inside the window.' },
					{ q: 'During the import, lag is 6 s. Does the 2 s window still cover the writer?', options: ['Yes, the window grows with the lag', 'Yes, Rails waits for the replica', 'Only if they reload twice', 'No: from 2 s to 6 s after Save, they read a replica that has not replayed the write'], answer: 3, why: 'The window is a fixed timer. Once it ends, reads go back to a replica that is still behind.' },
					{ q: 'Who else sees stale data, and how old?', options: ['Nobody, since the writer\'s window covers the site', 'Everyone else: up to 0.4 s old normally, 6 s during the import', 'Only users on the same pod', 'Only users who also wrote recently'], answer: 1, why: 'The window is per session. Rails "doesn\'t guarantee "read a recent write"" for other users.' }
				]
			},
			{
				title: 'Fix it with a longer window',
				questions: [
					{ q: 'What is the first fix?', options: ['Drop the replicas', 'Turn on `remote_apply` for every commit', 'Raise the window, for example `delay: 10.seconds`', 'Lower `max_connections`'], answer: 2, why: 'A longer window keeps the writer on the primary past the worst lag seen so far.' },
					{ q: 'What does it cost?', options: ['More reads hit the primary, and it is still a guess about the worst lag', 'Every commit waits a network round trip', 'Users lose their session after a write', 'Nothing'], answer: 0, why: 'A timer does not know the real lag. A bigger import could still pass 10 s.' },
					{ q: 'Does a longer window help the other users?', options: ['Yes, everyone reads the primary during the window', 'Yes, the replica speeds up', 'Only for GET requests', 'No: it only covers the session that wrote'], answer: 3, why: 'Each user has their own `last_write` timestamp. Other users still read the replica.' },
					{ q: 'Where does Rails keep the time of the last write?', options: ['In a server-side cache', 'In the user\'s session, as `session[:last_write]`', 'In a column on the `users` table', 'In `pg_stat_replication`'], answer: 1, why: 'The resolver\'s `Session` stores it in milliseconds. That is why the window is per user and per browser.' }
				]
			},
			{
				title: 'Fix it by WAL position',
				questions: [
					{ q: 'After the write, what does the app store for the user?', options: ['`pg_current_wal_lsn()` from the primary', '`now()` from the replica', 'The replica\'s `replay_lag`', 'The id of the row written'], answer: 0, why: 'GitLab saves "the latest WAL pointer from the primary". It marks exactly what the replica must have replayed.' },
					{ q: 'Before using a replica, what does the app check on it?', options: ['`SELECT pg_is_in_recovery()`', '`now() - pg_last_xact_replay_timestamp() < 2 seconds`', '`pg_wal_lsn_diff(stored, pg_last_wal_replay_lsn()) <= 0`', '`SELECT count(*) FROM pg_stat_replication`'], answer: 2, why: 'A difference of zero or less means the replica has replayed past the user\'s write.' },
					{ q: 'Why not use `now() - pg_last_xact_replay_timestamp()` as the test?', options: ['It only works on the primary', 'On a quiet primary it grows even when the replica is missing nothing', 'It returns bytes, not seconds', 'It requires a synchronous standby'], answer: 1, why: 'The timestamp is when the last replayed commit was made. With no new commits, the number keeps rising.' },
					{ q: 'What does the WAL position fix cost?', options: ['A restart of the replica', 'Every commit waits for replay', 'A wider window for every user', 'One more query and somewhere to store the position'], answer: 3, why: 'It is exact, but the app must keep the LSN per user and ask the replica before each read.' }
				]
			},
			{
				title: 'Weigh synchronous commit',
				questions: [
					{ q: 'Which setting makes a commit wait until the standby shows the change?', options: ['`synchronous_commit = on`', '`synchronous_commit = remote_apply`', '`synchronous_commit = remote_write`', '`synchronous_commit = off`'], answer: 1, why: '`on` waits for the flush and `remote_write` for the write. Only `remote_apply` waits for replay, which is what reads see.' },
					{ q: 'Where do you set it, for the few writes that matter?', options: ['`SET LOCAL synchronous_commit = remote_apply` in that transaction', 'In `postgresql.conf` for every commit', 'On the replica', 'In the Rails `delay` option'], answer: 0, why: '`SET LOCAL` limits the cost to the transactions that need it.' },
					{ q: 'What does each such commit pay?', options: ['Nothing, replicas are fast', 'A table lock', 'A network round trip and the standby\'s replay time', 'A full WAL segment'], answer: 2, why: 'The commit returns only once the standby has replayed it.' },
					{ q: 'The only synchronous standby dies. What happens to those commits?', options: ['They fall back to asynchronous', 'They fail with an error at once', 'They commit and replay at restart', 'They wait, and may never complete until another standby takes its place'], answer: 3, why: 'The docs warn of exactly this. Name several potential standbys in `synchronous_standby_names`.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'You run asynchronous replication, the default. The primary crashes one second after a commit returned to the client. What can happen to that commit?',
			options: [
				'It may be missing on the replica that is promoted in the primary\'s place',
				'It is safe on every replica, because the commit waited for their answer',
				'It is rolled back on the primary too, so both servers agree once again',
				'It is replayed on the replica later, from the primary\'s crashed WAL files'
			],
			answer: 0,
			why: 'The docs: "If the primary server crashes then some transactions that were committed may not have been replicated to the standby server, causing data loss." An asynchronous commit waits only for the primary\'s own flush (day 15).'
		},
		{
			q: 'With Rails\' default resolver, user A saves a comment. Half a second later user B loads the page from a replica that is 1 s behind. What does B see?',
			options: [
				'The new comment, because A\'s write keeps the whole site on the primary',
				'The new comment, because Rails waits for the replica before it replies',
				'An error, because the replica refuses reads while it is behind the primary',
				'The page without the comment, because B has not written anything recently'
			],
			answer: 3,
			why: 'The window is per session: only the user who wrote is sent to the primary. The guide says Rails "doesn\'t guarantee "read a recent write" for other users within the delay window". B reads the replica, one second behind.'
		},
		{
			q: 'You set `synchronous_commit = remote_apply` with one named synchronous standby. That standby\'s server dies. What happens to new commits on the primary?',
			options: [
				'They go on asynchronously until the standby comes back and catches up',
				'They wait, because no synchronous standby can confirm the replay',
				'They fail at once with an error telling the client to retry later',
				'They commit on the primary and get replayed on the standby at restart'
			],
			answer: 1,
			why: 'The docs warn that such commits "may never be completed if any one of the synchronous standbys should crash", and advise naming several potential synchronous standbys in `synchronous_standby_names` so another can take over.'
		}
	],
	lab: {
		minutes: 25,
		goal: 'Build a primary and a streaming replica, read a stale row from the replica, detect it by WAL position, then make one commit wait for replay.',
		steps: [
			'Start the primary: `docker run -d --name dojo-pg -e POSTGRES_PASSWORD=dojo postgres:17`. Wait until `docker exec dojo-pg pg_isready` prints `accepting connections`. Then `docker exec dojo-pg psql -U postgres -c "CREATE TABLE users (id int PRIMARY KEY, name text)" -c "INSERT INTO users VALUES (1, \'Ada\')"`.',
			'Start a replica in the primary\'s network namespace, on port 5433: `docker run -d --name dojo-replica --network container:dojo-pg -u postgres postgres:17 sh -c \'pg_basebackup -h localhost -U postgres -D /tmp/replica -R -X stream && exec postgres -D /tmp/replica -c port=5433\'`. Wait until `docker logs dojo-replica` shows `started streaming WAL from primary`.',
			'Check the stream from the primary: `docker exec dojo-pg psql -U postgres -c "SELECT application_name, state, sync_state, replay_lag FROM pg_stat_replication"`. Read from the replica: `docker exec dojo-replica psql -p 5433 -U postgres -c "SELECT pg_is_in_recovery(), name FROM users"`.',
			'Make lag on purpose: `docker exec dojo-replica psql -p 5433 -U postgres -c "SELECT pg_wal_replay_pause()"`. On the primary: `docker exec dojo-pg psql -U postgres -At -c "UPDATE users SET name = \'Grace\' WHERE id = 1" -c "SELECT pg_current_wal_lsn()"` and note the LSN.',
			'Read the replica, and check it the GitLab way with your LSN: `docker exec dojo-replica psql -p 5433 -U postgres -c "SELECT name FROM users" -c "SELECT pg_wal_lsn_diff(\'<your lsn>\', pg_last_wal_replay_lsn())"`',
			'Make the replica synchronous: `docker exec dojo-pg psql -U postgres -c "ALTER SYSTEM SET synchronous_standby_names = \'walreceiver\'" -c "SELECT pg_reload_conf()"`. Then, with replay still paused: `docker exec dojo-pg psql -U postgres -c "SET synchronous_commit = remote_apply" -c "UPDATE users SET name = \'Lovelace\' WHERE id = 1"`.',
			'In a second terminal, while that commit waits: `docker exec dojo-replica psql -p 5433 -U postgres -c "SELECT pg_wal_replay_resume()"`.'
		],
		done: [
			'In step 3, `pg_stat_replication` shows one `walreceiver` row, `streaming` and `async`, and the replica answers `t` and `Ada`.',
			'In step 5, the replica still says `Ada`, and `pg_wal_lsn_diff` is above zero.',
			'After step 6, `pg_stat_replication` shows `sync_state` as `sync`, and the `remote_apply` UPDATE hangs.',
			'In step 7, the UPDATE returns as soon as replay resumes, and the replica reads `Lovelace`.'
		],
		solution: [
			'The primary committed `Grace` without asking the replica: that is asynchronous replication. A read on the replica sees a row only after replay, so it served the old name.',
			'`pg_wal_lsn_diff` above zero says the replica has not replayed up to the user\'s write. An app would send that read to the primary.',
			'With `remote_apply`, the commit waits for replay on the synchronous standby. With replay paused, it could wait forever, which is what a dead standby does to such commits.',
			'Clean up with `docker rm -f dojo-replica dojo-pg`.'
		]
	},
	recall: {
		q: 'For how long does Rails send a user\'s reads to the primary after they write, and when does that user still see stale data?',
		a: 'For 2 seconds (`delay`), tracked in that user\'s session. If replay lag is longer than the window, like 6 s during an import, their reads go back to a replica that has not replayed the write.'
	},
	sources: [
		{ title: 'PostgreSQL docs, Log-Shipping Standby Servers (streaming and synchronous replication)', url: 'https://www.postgresql.org/docs/current/warm-standby.html' },
		{ title: 'PostgreSQL docs, synchronous_commit', url: 'https://www.postgresql.org/docs/current/runtime-config-wal.html#GUC-SYNCHRONOUS-COMMIT' },
		{ title: 'PostgreSQL docs, pg_stat_replication', url: 'https://www.postgresql.org/docs/current/monitoring-stats.html#MONITORING-PG-STAT-REPLICATION-VIEW' },
		{ title: 'Rails Guides, Multiple Databases with Active Record', url: 'https://guides.rubyonrails.org/active_record_multiple_databases.html' },
		{ title: 'GitLab source, lib/gitlab/database/load_balancing', url: `${LB}/sticking.rb` },
		{ title: 'GitLab source, Sticking#stick', url: `${LB}/sticking.rb#L111-L120` }
	]
};
