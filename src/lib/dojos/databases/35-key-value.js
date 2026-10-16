const REDIS = 'https://github.com/redis/redis/blob/e0bb9316848db7950c2b18cdc59c2058f62b8a3d';
const CONF = `${REDIS}/redis.conf`;
const DOCS = 'https://github.com/redis/docs/blob/3b030c7ef066c0bb7f88ddec02c784e49783b0f8/content';
const PERSIST = `${DOCS}/operate/oss_and_stack/management/persistence.md?plain=1`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'key-value',
	part: 'Beyond one server',
	title: 'Key-value stores',
	minutes: 10,
	hook: [
		'A deploy restarts the Redis container. The product cache refills in a minute, nobody notices. But the shopping carts lived in Redis too, and **the carts from the last few minutes are gone**.',
		'Redis keeps the whole dataset **in memory** and serves reads and writes from there. Whether a write also survives a restart depends on two settings: RDB snapshots and the append-only file.',
		'Before you put data in a key-value store, decide whether it holds a cache or the only copy. A cache can lose everything and refill from the database. The only copy needs the same care as PostgreSQL: a log, fsync, backups.'
	],
	terms: [
		{ term: 'TTL', def: 'A timeout on a key, set with `EXPIRE` or `SET ... EX`. Redis calls a key with one "volatile". When the time is up, the key is deleted.' },
		{ term: 'RDB snapshot', def: 'A point-in-time copy of the whole dataset in one compact file, written by a forked child at configured save points.' },
		{ term: 'AOF', def: 'The append-only file: every write command is logged and replayed at startup to rebuild the dataset. Redis ships with it turned off.' },
		{ term: 'Eviction policy', def: 'What Redis does when it reaches `maxmemory`: drop keys by LRU, LFU, TTL or at random, or refuse writes with `noeviction`, the default.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['app["App: SET cart:42 ... EX 3600"] --> mem["Redis memory: the whole dataset"]'],
				highlight: ['app', 'mem'],
				note: 'The write changes the dataset in memory and the reply goes back. With persistence off, a restart starts with an empty dataset.'
			},
			{
				add: ['mem -->|"each write appended"| buf["AOF buffer"]', 'buf -->|"write(), fsync once a second"| aof[("appendonly file")]'],
				highlight: ['buf', 'aof'],
				note: 'With `appendonly yes`, each write command is added to a buffer, written to the file, and fsynced once a second by a background thread with the default `everysec`. It is the same idea as the WAL (day 15), with a weaker default.'
			},
			{
				add: ['mem -.->|"fork, snapshot at save points"| rdb[("dump.rdb")]'],
				highlight: ['rdb'],
				note: 'At each save point, for example "after 300 seconds if at least 100 changes", Redis forks and the child writes the dataset to `dump.rdb`. The file is compact and works well for backups, but a crash loses every write since the last snapshot.'
			},
			{
				add: ['exp["Expiry: on access, plus a periodic random check"] -.->|"deletes expired keys"| mem'],
				highlight: ['exp'],
				note: 'A key past its timeout is deleted when someone reads it. Keys nobody reads are found by a periodic cycle that tests random keys among those with a TTL.'
			},
			{
				add: ['evict["maxmemory reached"] -.->|"evict by policy, or refuse writes"| mem'],
				highlight: ['evict'],
				note: 'With an `allkeys-*` policy, Redis drops any key to make room. A cache refills a dropped key, but a dropped cart is gone. With `noeviction`, the default, writes that need memory fail and reads go on.'
			}
		]
	},
	example: {
		title: 'Redis, src/aof.c: flushAppendOnlyFile and the three fsync policies',
		repo: 'redis/redis',
		url: `${REDIS}/src/aof.c?plain=1#L1444-L1615`,
		lang: 'c',
		code: `    if (server.aof_fsync == AOF_FSYNC_EVERYSEC)
        sync_in_progress = aofFsyncInProgress();

    if (server.aof_fsync == AOF_FSYNC_EVERYSEC && !force) {
        /* With this append fsync policy we do background fsyncing.
         * If the fsync is still in progress we can try to delay
         * the write for a couple of seconds. */
        if (sync_in_progress) {
            if (server.aof_flush_postponed_start == 0) {
                /* No previous write postponing, remember that we are
                 * postponing the flush and return. */
                server.aof_flush_postponed_start = server.mstime;
                return;
            } else if (server.mstime - server.aof_flush_postponed_start < 2000) {
                /* We were already waiting for fsync to finish, but for less
                 * than two seconds this is still ok. Postpone again. */
                return;
            }
            /* Otherwise fall through, and go write since we can't wait
             * over two seconds. */
            server.aof_delayed_fsync++;
            serverLog(LL_NOTICE,"Asynchronous AOF fsync is taking too long (disk is busy?). Writing the AOF buffer without waiting for fsync to complete, this may slow down Redis.");
        }
    }
…
try_fsync:
    /* Don't fsync if no-appendfsync-on-rewrite is set to yes and there are
     * children doing I/O in the background. */
    if (server.aof_no_fsync_on_rewrite && hasActiveChildProcess())
        return;

    /* Perform the fsync if needed. */
    if (server.aof_fsync == AOF_FSYNC_ALWAYS) {
        /* redis_fsync is defined as fdatasync() for Linux in order to avoid
         * flushing metadata. */
        latencyStartMonitor(latency);
        /* Let's try to get this data on the disk. To guarantee data safe when
         * the AOF fsync policy is 'always', we should exit if failed to fsync
         * AOF (see comment next to the exit(1) after write error above). */
        if (redis_fsync(server.aof_fd) == -1) {
            serverLog(LL_WARNING,"Can't persist AOF for fsync error when the "
              "AOF fsync policy is 'always': %s. Exiting...", strerror(errno));
            exit(1);
        }
        latencyEndMonitor(latency);
        latencyAddSampleIfNeeded("aof-fsync-always",latency);
        server.aof_last_incr_fsync_offset = server.aof_last_incr_size;
        server.aof_last_fsync = server.mstime;
        atomicSet(server.fsynced_reploff_pending, server.master_repl_offset);
    } else if (server.aof_fsync == AOF_FSYNC_EVERYSEC &&
               server.mstime - server.aof_last_fsync >= 1000) {
        if (!sync_in_progress) {
            aof_background_fsync(server.aof_fd);
            server.aof_last_incr_fsync_offset = server.aof_last_incr_size;
        }
        server.aof_last_fsync = server.mstime;
    }`,
		notes: [
			'Lines 8 to 22 handle a slow disk. The [docs](' + PERSIST + '#L160) say that with `everysec` "you may lose 1 second of data if there is a disaster". If the previous background fsync is still running, line 13 postpones the write. Only after two seconds (line 14) does Redis write anyway and count an `aof_delayed_fsync` on line 21, so on a slow disk the loss window grows past one second.',
			'Lines 33 to 43: with `always`, the fsync runs in the main thread before the replies go out. If it fails, Redis logs and exits on line 43, because a write it acknowledged must be on disk. The docs call it "Very very slow, very safe", helped by group commit.',
			'Lines 29 and 30: with `no-appendfsync-on-rewrite yes`, the function returns without an fsync while a child is saving. The [config file](' + CONF + '#L1584-L1587) warns that durability then drops to that of `appendfsync no`: it is "possible to lose up to 30 seconds of log in the worst scenario".',
			'Out of the box, `redis.conf` sets `appendonly no` and RDB save points at 1 hour, 5 minutes and 60 seconds. The [docs](' + PERSIST + '#L61-L62) say RDB users "should be prepared to lose the latest minutes of data". They recommend both RDB and AOF for "a degree of data safety comparable to what PostgreSQL can provide you".',
			'Commands that overwrite the key, such as `SET`, [clear its timeout](' + DOCS + '/commands/expire.md?plain=1#L81-L88), but `INCR`, `LPUSH` and `HSET` leave it alone. The default policy in `redis.conf` is `noeviction`, so a full Redis rejects writes like `SET` with an error.'
		]
	},
	tradeoff: {
		gain: [
			'Reads and writes are served from memory, with no planner and no disk read on the hot path.',
			'Redis keeps data structures on the server: counters with `INCR`, leaderboards in sorted sets, queues in lists or streams, each update atomic.',
			'With TTLs and eviction, Redis deletes old cache entries itself, so no cleanup job is needed.'
		],
		cost: [
			'The whole dataset must fit in RAM, so RAM size sets the bill, and you must choose a `maxmemory` value.',
			'Once you turn on AOF, which ships off, `everysec` can drop about a second of acknowledged writes, and RDB alone can drop minutes.',
			'Redis has no joins, no constraints and no secondary indexes of its own. Every access path is a key you designed up front.',
			'A cache in front of a database can serve stale data. Every write path must update or delete the cached key, or readers get the old value until the TTL expires.'
		]
	},
	task: {
		prompt: 'Your shop wants Redis for three things: (1) rendered product fragments, (2) user sessions, (3) a rate limiter of 100 requests per minute per IP. For each, write the persistence and eviction settings you would use, and for (3) the commands, so the counter resets every minute and never lives forever.',
		hint: 'Ask of each: if Redis restarts empty, what breaks? Then check which commands keep a TTL and which clear it.',
		answer: [
			'(1) Cache: losing it costs a refill. Persistence can stay off, or RDB only. Set `maxmemory` and `maxmemory-policy allkeys-lru`, and give each fragment a TTL.',
			'(2) Sessions: losing them logs everyone out. Run `appendonly yes` with `everysec` and keep RDB for backups. Keep `noeviction` and leave memory headroom: a `volatile-*` policy would evict exactly the keys with a TTL, your sessions. Accept that about a second of writes can be lost, or keep sessions in PostgreSQL if that is not acceptable.',
			'(3) Rate limiter: `INCR rate:203.0.113.7:2026-10-17T10:42` then, if the result is 1, `EXPIRE rate:203.0.113.7:2026-10-17T10:42 60`. `INCR` leaves the TTL in place, so later increments keep it. Never rewrite the counter with a plain `SET`: that clears the TTL and the key lives forever.',
			'Losing the counters in a restart only resets the limits for a minute, so (3) can run without persistence, on the same instance as (1) if you accept that eviction may drop a counter early.'
		]
	},
	quiz: [
		{
			q: 'A key `session:9` has a TTL of one hour. The app runs `SET session:9 "{...}"` with no options. What is the TTL now?',
			options: [
				'Still about one hour, because a TTL survives any write to its key',
				'Reset to one hour from now, because SET restarts the existing timer',
				'Gone: SET overwrites the key and clears its timeout, so it never expires',
				'Zero, so the key is deleted the next time any client tries to read it'
			],
			answer: 2,
			why: 'Commands that overwrite the value, like SET, clear the timeout. Commands that alter it in place, like INCR or HSET, keep it. Use `SET ... EX` or `KEEPTTL` when you rewrite a volatile key.'
		},
		{
			q: 'Redis runs with `appendonly yes` and the default `appendfsync everysec`. The power goes out. What can be lost?',
			options: [
				'Nothing, because every write is fsynced before the client gets its reply',
				'Roughly the last second of writes, more if a slow fsync was delaying them',
				'Everything since the last RDB snapshot, which may be several minutes old',
				'Only the keys with a TTL, because volatile keys are never written to the AOF'
			],
			answer: 1,
			why: 'With everysec, fsync runs once a second in the background, so acknowledged writes since the last fsync can be lost. The docs say about one second; the code postpones writes up to two seconds when an fsync is slow.'
		},
		{
			q: 'Redis reaches `maxmemory` with the default `maxmemory-policy`. What happens to a new `SET`?',
			options: [
				'Redis evicts the least recently used key to make room for the new one',
				'Redis writes the oldest keys out to disk and loads them back on demand',
				'Redis deletes every key that has a TTL first, then accepts the new write',
				'Redis rejects the write with an error and keeps answering read commands'
			],
			answer: 3,
			why: 'The default is noeviction: commands that need more memory fail, reads still work. A cache should set an `allkeys-*` policy explicitly; a store that must not lose keys keeps noeviction and watches memory.'
		}
	],
	recall: {
		q: 'Redis holds the only copy of your shopping carts. Which settings do you set, and how much can a power cut still lose?',
		a: '`appendonly yes` with `appendfsync everysec`, RDB snapshots for backups, and `noeviction`. A power cut can still lose about one second of acknowledged writes, more if an fsync was slow.'
	},
	sources: [
		{ title: 'Redis docs, Redis persistence', url: 'https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/' },
		{ title: 'Redis docs, EXPIRE', url: 'https://redis.io/docs/latest/commands/expire/' },
		{ title: 'Redis source, redis.conf', url: CONF },
		{ title: 'Redis source, redis.conf: RDB save points', url: `${CONF}#L519-L522` },
		{ title: 'Redis source, redis.conf: default maxmemory-policy', url: `${CONF}#L1284-L1286` }
	]
};
