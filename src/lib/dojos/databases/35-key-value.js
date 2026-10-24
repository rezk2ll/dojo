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
		],
		steps: [
			{
				title: 'Ask what a restart breaks',
				questions: [
					{ q: 'Redis restarts empty. What does losing the product fragments (1) cost?', options: ['A refill from the database', 'Every user is logged out', 'The rate limits reset', 'Orders are lost for good'], answer: 0, why: 'A cache can lose everything and refill. That is what makes it a cache.' },
					{ q: 'What does losing the sessions (2) cost?', options: ['Pages render slower for a minute', 'Everyone is logged out', 'The rate limits reset', 'Nothing: sessions rebuild themselves'], answer: 1, why: 'Redis holds the only copy of a session. Without it, the user must log in again.' },
					{ q: 'What does losing the rate limiter counters (3) cost?', options: ['Everyone is logged out', 'Every IP is blocked until a human steps in', 'The limits reset for at most a minute', 'Nothing, ever'], answer: 2, why: 'Each counter covers one minute. An empty Redis just starts counting again.' },
					{ q: 'Out of the box, what does `redis.conf` persist?', options: ['Every write, fsynced before the reply', 'An AOF with `everysec`', 'Nothing at all', 'RDB snapshots at save points, with AOF off'], answer: 3, why: 'It ships with `appendonly no` and RDB save points at 1 hour, 5 minutes and 60 seconds, so minutes of writes can be lost.' }
				]
			},
			{
				title: 'Pick the persistence',
				questions: [
					{ q: 'Which persistence fits the product fragments (1)?', options: ['Off, or RDB only', '`appendfsync always`', 'AOF with `everysec` plus RDB', 'A copy in PostgreSQL'], answer: 0, why: 'Losing the cache costs a refill, so there is no reason to pay for an fsync on every write.' },
					{ q: 'Which persistence fits the sessions (2)?', options: ['Off: sessions are short-lived', 'RDB snapshots only', '`appendonly yes` with `everysec`, and RDB for backups', '`no-appendfsync-on-rewrite yes` for speed'], answer: 2, why: 'The docs recommend both RDB and AOF for a degree of data safety close to PostgreSQL. RDB alone can drop minutes.' },
					{ q: 'With `appendfsync everysec`, what can a power cut lose?', options: ['Nothing, every write is on disk', 'About one second of writes, more if an fsync was slow', 'Everything since the last RDB snapshot', 'Only the keys that have a TTL'], answer: 1, why: 'The fsync runs once a second in the background, and Redis postpones writes up to two seconds when an fsync is slow.' },
					{ q: 'The business cannot accept losing even a second of sessions. What do you do?', options: ['Switch the sessions to RDB only', 'Turn on `no-appendfsync-on-rewrite`', 'Give each session a longer TTL', 'Keep the sessions in PostgreSQL'], answer: 3, why: 'The other three lose more, not less. If Redis\'s window is too wide, store the data where commits are durable.' }
				]
			},
			{
				title: 'Pick the eviction',
				questions: [
					{ q: 'Which memory settings fit the product fragments (1)?', options: ['`noeviction` and no `maxmemory`', '`maxmemory` with `allkeys-lru`, and a TTL on each fragment', '`volatile-ttl` with no TTLs set', 'No `maxmemory`, so nothing is ever dropped'], answer: 1, why: 'A cache should evict the least recently used entries when full, and the TTLs clean up old fragments with no job.' },
					{ q: 'Which eviction policy fits the sessions (2)?', options: ['`noeviction`, with memory headroom', '`allkeys-lru`', '`volatile-lru`', '`allkeys-random`'], answer: 0, why: 'A session must not vanish because memory is tight. A full Redis then refuses writes, so you watch memory and leave room.' },
					{ q: 'Why is a `volatile-*` policy the wrong choice for sessions?', options: ['It ignores the TTL of every key', 'It refuses every write when full', 'It evicts exactly the keys with a TTL, which are the sessions', 'It needs AOF to be turned off'], answer: 2, why: 'Sessions have TTLs, so `volatile-*` picks them first, the very keys you wanted to keep.' },
					{ q: 'A Redis with `noeviction` reaches `maxmemory`. What happens to a new `SET`?', options: ['Redis evicts the oldest key to make room', 'Redis writes old keys to disk', 'Redis deletes every key with a TTL first', 'Redis rejects it with an error, and reads still work'], answer: 3, why: '`noeviction` is the default: commands that need more memory fail, nothing is dropped.' }
				]
			},
			{
				title: 'Write the rate limiter',
				questions: [
					{ q: 'Which commands count a request so the counter ends after a minute?', options: ['`INCR` the key, then `EXPIRE` it for 60 seconds if the result is 1', '`SET key 1 EX 60` on every request', '`GET` the key, add one in the app, then `SET` it', '`EXPIRE` the key for 60 seconds, then `INCR` it'], answer: 0, why: '`INCR` creates the key at 1 the first time, and that is when it gets its timeout.' },
					{ q: 'Why set the TTL only when `INCR` returns 1?', options: ['`EXPIRE` fails on a key above 1', 'The key was just created, and later `INCR` calls keep its TTL', '`INCR` clears the TTL each time', 'Redis allows one `EXPIRE` per key'], answer: 1, why: 'Commands that alter a value in place, like `INCR`, leave the timeout alone, so one `EXPIRE` covers the minute.' },
					{ q: 'A script resets a counter with a plain `SET rate:... 0`. What happens?', options: ['The TTL is kept', 'The TTL goes back to 60 seconds', 'The key is deleted at once', 'The TTL is cleared, and the key lives forever'], answer: 3, why: 'Commands that overwrite the key, like `SET`, clear its timeout. Use `SET ... EX` or `KEEPTTL` if you must rewrite it.' },
					{ q: 'Where can the rate limiter (3) run?', options: ['Only on the sessions instance, with `appendfsync always`', 'On its own instance with AOF', 'Without persistence, even on the cache instance, if a counter evicted early is acceptable', 'Only in PostgreSQL'], answer: 2, why: 'A lost counter only resets a limit for a minute. Sharing with the cache means `allkeys-lru` may drop one early.' }
				]
			}
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
	lab: {
		minutes: 15,
		goal: 'Build the rate limiter in a local Redis, watch `SET` clear a TTL, and see `noeviction` and `allkeys-lru` behave when memory is full.',
		steps: [
			'Start Redis and open the CLI: `docker run -d --name kv-lab redis:7`, then `docker exec -it kv-lab redis-cli`.',
			'Read the defaults: `CONFIG GET appendonly`, `CONFIG GET save`, `CONFIG GET maxmemory-policy`.',
			'Count two requests from one IP: `INCR rate:203.0.113.7:2026-10-17T10:42`, then `EXPIRE rate:203.0.113.7:2026-10-17T10:42 60` because the result was 1, then `INCR` again and `TTL` on the key. Now overwrite it with `SET rate:203.0.113.7:2026-10-17T10:42 5` and run `TTL` again.',
			'Rewrite a session two ways: `SET session:9 x EX 3600`, then `SET session:9 y KEEPTTL`, then `TTL session:9`.',
			'Fill memory: `FLUSHALL`, then `EVAL "for i=1,20000 do redis.call(\'SET\',\'junk:\'..i,string.rep(\'x\',100)) end" 0`, then `CONFIG SET maxmemory 2mb`. Try `SET one more` and `GET junk:5`. Then `CONFIG SET maxmemory-policy allkeys-lru`, try `SET one more` again, and run `DBSIZE`.',
			'Leave the CLI and clean up: `docker rm -f kv-lab`.'
		],
		done: [
			'The defaults print `appendonly no`, save points `3600 1 300 100 60 10000`, and `noeviction`.',
			'After the second `INCR`, `TTL` shows about 60. After the plain `SET`, `TTL` shows `-1`: no timeout, the key lives forever.',
			'With `KEEPTTL`, `TTL session:9` still shows about 3600.',
			'Under `noeviction`, `SET one more` fails with `OOM command not allowed when used memory > \'maxmemory\'`, and `GET junk:5` still answers.',
			'Under `allkeys-lru`, the same `SET` returns `OK`, and `DBSIZE` is far below 20,000: Redis dropped keys to fit.'
		],
		solution: [
			'Rate limiter, per request: `INCR rate:<ip>:<minute>`. If the reply is `1`, `EXPIRE rate:<ip>:<minute> 60`. Never rewrite the counter with a plain `SET`.',
			'Cache instance (1) and (3): `maxmemory` set, `maxmemory-policy allkeys-lru`, persistence off or RDB only.',
			'Sessions instance (2): `appendonly yes`, `appendfsync everysec`, RDB kept for backups, `maxmemory-policy noeviction`, and memory alerts with headroom.'
		]
	},
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
