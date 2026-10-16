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
		'Today: how streaming replication ships the WAL to replicas, what asynchronous and synchronous really promise, how to measure lag, and how Rails sends a user back to the primary right after they write.'
	],
	terms: [
		{ term: 'Streaming replication', def: 'The primary sends its WAL to each replica over a connection as it is written. The replica replays it, so its data files follow the primary\'s.' },
		{ term: 'Hot standby', def: 'A replica that accepts read-only queries while it replays. Writes go to the primary only.' },
		{ term: 'Asynchronous replication', def: 'The default. A commit returns once the primary has flushed its own WAL. Replicas catch up a little later.' },
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
				note: '**The write.** The commit is a WAL record flushed on the primary (day 15). With the default settings, the app gets its answer right then. No replica has been asked anything.'
			},
			{
				add: ['prim -->|"WAL stream"| rep[("Replica")]'],
				highlight: ['rep'],
				note: '**The stream.** The primary sends the WAL to the replica, which writes it, flushes it and replays it. The docs: there is "a small delay between committing a transaction in the primary and the changes becoming visible in the standby", "typically under one second" if the replica keeps up.'
			},
			{
				add: ['page["Next page: SELECT name"] -.->|"before replay"| rep'],
				highlight: ['page'],
				note: '**The stale read.** The redirect lands on the replica inside that gap and reads the old row. On the primary, `pg_stat_replication` shows the gap per replica: `write_lag`, `flush_lag` and `replay_lag`. Replay is the one your reads feel.'
			},
			{
				add: ['sync["synchronous_commit = remote_apply"] -.->|"commit waits for replay"| prim'],
				highlight: ['sync'],
				note: '**Make the commit wait.** With a synchronous standby and `remote_apply`, the commit returns only once that standby has replayed it. The price: every commit pays a round trip, and the docs warn such commits "may never be completed if any one of the synchronous standbys should crash".'
			},
			{
				add: ['stick["Rails: wrote less than 2 s ago"] -->|"read from primary"| prim'],
				highlight: ['stick'],
				note: '**Or route the reader.** The cheaper fix: for a short window after a user writes, send that user\'s reads to the primary. Rails does it on a timer. GitLab does it by WAL position, and only goes back to a replica once it has caught up.'
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
			'**The HTTP verb decides first.** The [middleware](' + SELECTOR + '.rb#L72-L84) calls `read` when `reading_request?` is true (GET, HEAD or QUERY) and `write` for every other request. `read` then picks the primary while less than `delay` has passed since this user\'s last write.',
			'**The clock lives in the session.** `write_to_primary` updates the timestamp in an `ensure`, so a write that raised still counts. [`Session`](' + SELECTOR + '/resolver/session.rb#L34-L40) stores it in milliseconds under `session[:last_write]`. It follows one user in one browser, nobody else.',
			'**The guide states the limit.** "Rails guarantees "read your own write" and will send your GET or HEAD request to the writer if it\'s within the `delay` window." It also says Rails "doesn\'t guarantee "read a recent write" for other users", and that you [should change the delay](' + RAILS + '/guides/source/active_record_multiple_databases.md?plain=1#L330-L334) "based on your database infrastructure". A replica 3 seconds behind beats a 2 second window.',
			'**GitLab measures instead of guessing.** [`stick`](' + LB + '/sticking.rb#L111-L120) saves "the latest WAL pointer from the primary" for a user. Later, [`caught_up?`](' + LB + '/host.rb#L274-L281) asks a replica how far it is behind that pointer, using `pg_wal_lsn_diff` against `pg_last_wal_replay_lsn()`, and accepts the replica only when the difference is zero or less.',
			'**Lag in seconds has a catch.** GitLab also computes [`now() - pg_last_xact_replay_timestamp()`](' + LB + '/host.rb#L57-L59). That timestamp is when the last replayed commit was generated on the primary, so on a quiet primary the number grows even when the replica is missing nothing.'
		]
	},
	tradeoff: {
		gain: [
			'Read traffic spreads over replicas, and the primary keeps its capacity for writes.',
			'A replica is a warm copy: it holds nearly current data if the primary dies.',
			'Asynchronous replication costs the commit nothing: the primary never waits for the network.'
		],
		cost: [
			'Asynchronous means a crash can lose commits: "The amount of data loss is proportional to the replication delay at the time of failover."',
			'Synchronous means every commit waits a round trip, and a dead synchronous standby can stall commits until another takes its place.',
			'Every read path now has to choose: primary for fresh data, replica for scale. A wrong choice is a stale page, never an error.',
			'Lag is not steady. A bulk import or a long query on the replica can push it from milliseconds to minutes.'
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
		]
	},
	quiz: [
		{
			q: 'Replication is asynchronous, the default. The primary crashes one second after a commit returned to the client. What can happen to that commit?',
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
	takeaway: 'A replica is always a little behind: decide per read whether stale is fine, and send a user who just wrote to the primary until the replica has caught up.',
	sources: [
		{ title: 'PostgreSQL docs, Log-Shipping Standby Servers (streaming and synchronous replication)', url: 'https://www.postgresql.org/docs/current/warm-standby.html' },
		{ title: 'PostgreSQL docs, synchronous_commit', url: 'https://www.postgresql.org/docs/current/runtime-config-wal.html#GUC-SYNCHRONOUS-COMMIT' },
		{ title: 'PostgreSQL docs, pg_stat_replication', url: 'https://www.postgresql.org/docs/current/monitoring-stats.html#MONITORING-PG-STAT-REPLICATION-VIEW' },
		{ title: 'Rails Guides, Multiple Databases with Active Record', url: 'https://guides.rubyonrails.org/active_record_multiple_databases.html' },
		{ title: 'GitLab source, lib/gitlab/database/load_balancing', url: `${LB}/sticking.rb` }
	]
};
