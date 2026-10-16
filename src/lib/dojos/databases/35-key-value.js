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
		'Redis keeps the whole dataset **in memory**. That is what makes it fast. Whether a write also survives a restart depends on two settings most people never open: **snapshots** and the **append-only file**.',
		'So the first question about any key-value store is not "how fast". It is **"is this a cache, or the only copy?"**. A cache can lose everything and refill. The only copy needs the same care as PostgreSQL: a log, fsync, backups.'
	],
	terms: [
		{ term: 'Key-value store', def: 'A store where you read and write values by key, with no joins and no query planner. Redis adds typed values: strings, hashes, lists, sets, sorted sets, streams.' },
		{ term: 'TTL', def: 'A timeout on a key, set with `EXPIRE` or `SET ... EX`. Redis calls a key with one "volatile". When the time is up, the key is deleted.' },
		{ term: 'RDB snapshot', def: 'A point-in-time copy of the whole dataset in one compact file, written by a forked child at configured save points.' },
		{ term: 'AOF', def: 'The append-only file: every write command is logged and replayed at startup to rebuild the dataset. Off by default.' },
		{ term: 'appendfsync', def: 'How often the AOF is forced to disk: `always`, `everysec` (the default) or `no`, leaving it to the operating system.' },
		{ term: 'Eviction policy', def: 'What Redis does when it reaches `maxmemory`: drop keys by LRU, LFU, TTL or at random, or refuse writes with `noeviction`, the default.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['app["App: SET cart:42 ... EX 3600"] --> mem["Redis memory: the whole dataset"]'],
				highlight: ['app', 'mem'],
				note: '**Memory first.** The write changes the dataset in memory and the reply goes back. With persistence off, that is the whole story: a restart starts empty.'
			},
			{
				add: ['mem -->|"each write appended"| buf["AOF buffer"]', 'buf -->|"write(), fsync once a second"| aof[("appendonly file")]'],
				highlight: ['buf', 'aof'],
				note: '**The log.** With `appendonly yes`, each write command is added to a buffer, written to the file, and fsynced once a second by a background thread with the default `everysec`. It is the same idea as the WAL (day 15), with a weaker default.'
			},
			{
				add: ['mem -.->|"fork, snapshot at save points"| rdb[("dump.rdb")]'],
				highlight: ['rdb'],
				note: '**The snapshot.** At each save point, for example "after 300 seconds if at least 100 changes", Redis forks and the child writes the dataset to `dump.rdb`. Compact and perfect for backups, but a crash loses everything since the last one.'
			},
			{
				add: ['exp["Expiry: on access, plus a periodic random check"] -.->|"deletes expired keys"| mem'],
				highlight: ['exp'],
				note: '**TTLs.** A key past its timeout is deleted when someone reads it. Keys nobody reads are found by a periodic cycle that tests random keys among those with a TTL.'
			},
			{
				add: ['evict["maxmemory reached"] -.->|"evict by policy, or refuse writes"| mem'],
				highlight: ['evict'],
				note: '**Full memory.** With an `allkeys-*` policy, Redis drops any key to make room: right for a cache, fatal for carts. With `noeviction`, the default, writes that need memory fail and reads go on.'
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
			'**One second, or two.** The [docs](' + PERSIST + '#L160) say that with `everysec` "you may lose 1 second of data if there is a disaster". The code adds a detail: if the previous background fsync is still running, the write is postponed, and only after two seconds does Redis write anyway and count an `aof_delayed_fsync`. On a slow disk the window stretches.',
			'**`always` means stop on failure.** With `always`, the fsync runs in the main thread before the replies go out. If it fails, Redis [logs and exits](' + REDIS + '/src/aof.c?plain=1#L1595-L1602): a write it acknowledged must be on disk, so it would rather crash than lie. The docs call it "Very very slow, very safe", helped by group commit.',
			'**A hole during rewrites.** With `no-appendfsync-on-rewrite yes`, the `try_fsync` block returns while a child is saving. The [config file](' + CONF + '#L1584-L1587) warns that durability then drops to that of `appendfsync no`: it is "possible to lose up to 30 seconds of log in the worst scenario".',
			'**Defaults are a cache\'s defaults.** Out of the box, [`appendonly no`](' + CONF + '#L1511) and RDB [save points](' + CONF + '#L519-L522) at 1 hour, 5 minutes and 60 seconds. The docs say RDB users "should be prepared to lose the latest minutes of data", and recommend both RDB and AOF for ["a degree of data safety comparable to what PostgreSQL can provide you"](' + PERSIST + '#L61-L62).',
			'**TTLs have traps.** A timeout is [cleared](' + DOCS + '/commands/expire.md?plain=1#L81-L88) by commands that overwrite the key, such as `SET`, but `INCR`, `LPUSH` and `HSET` leave it alone. And the [default policy](' + CONF + '#L1284-L1286) is `noeviction`: a full Redis rejects writes like `SET` with an error.'
		]
	},
	tradeoff: {
		gain: [
			'Reads and writes are served from memory, with no planner and no disk read on the hot path.',
			'Data structures on the server: counters with `INCR`, leaderboards in sorted sets, queues in lists or streams, each update atomic.',
			'TTLs and eviction make a cache that cleans itself, without a cleanup job.'
		],
		cost: [
			'The dataset must fit in RAM. Memory is the bill, and `maxmemory` is a decision you must make.',
			'Durability is opt-in and weaker by default: `everysec` can drop about a second of acknowledged writes, RDB alone can drop minutes.',
			'No joins, no constraints, no secondary indexes of its own. Every access path is a key you designed up front.',
			'A cache in front of a database can serve stale data. Every write path must update or delete the cached key, or the TTL decides when the truth comes back.'
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
	takeaway: 'Decide first whether Redis holds a cache or the only copy: a cache gets TTLs and an eviction policy, the only copy gets AOF, RDB backups and noeviction, and still risks about a second of writes.',
	sources: [
		{ title: 'Redis docs, Redis persistence', url: 'https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/' },
		{ title: 'Redis docs, EXPIRE', url: 'https://redis.io/docs/latest/commands/expire/' },
		{ title: 'Redis source, redis.conf', url: CONF }
	]
};
