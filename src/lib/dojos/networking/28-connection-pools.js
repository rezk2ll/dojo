const U3 = 'https://github.com/urllib3/urllib3/blob/a37bc93b65d6bcf00d3dc43d966bab6bd130ecd8/src/urllib3/connectionpool.py';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'connection-pools',
	part: 'Between services',
	title: 'Connection pools',
	minutes: 10,
	hook: [
		'A Go program sends 1000 GET requests to one local server, 50 at a time, with a clone of `http.DefaultTransport`. Run for this chapter (go1.24.4), it opened 749 new TCP connections, and `ss` then showed 747 client sockets in `TIME_WAIT`. The same program with `MaxIdleConnsPerHost: 50` opened 41 connections and left none in `TIME_WAIT`.',
		'Go keeps at most 2 idle connections per host by default: `DefaultMaxIdleConnsPerHost = 2`. After each round of 50 responses, the transport keeps 2 connections and closes the other 48, and the next round dials 48 new ones.',
		'Each new connection pays for its handshakes before the first byte. In this session, `curl` got its first byte from https://example.org/ after 42 ms on a new connection and after 11 ms on a reused one.'
	],
	terms: [
		{ term: 'Connection pool', def: 'A per-host list of open connections that a client library keeps between requests, so the next request can skip the TCP and TLS handshakes.' },
		{ term: 'Idle connection', def: 'A connection in the pool with no request in flight. Go closes one after `IdleConnTimeout`, 90 s in `DefaultTransport`.' },
		{ term: 'Pool size', def: 'How many idle connections the pool keeps per host: `MaxIdleConnsPerHost` in Go (default 2), `maxsize` in urllib3 (default 1), `pool_maxsize` in requests (default 10).' },
		{ term: 'Blocking pool', def: 'A pool that caps connections in use at its size. A request that finds no free connection waits instead of opening a new one: urllib3 with `block=True`, Go with `MaxConnsPerHost`.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['g["50 goroutines call Get at once"] --> tr["Transport: no idle connection for the host"]', 'tr -->|"50 dials"| s["Server"]'],
				highlight: ['g', 'tr'],
				note: 'The pool starts empty, so each of the 50 requests dials its own TCP connection. With HTTPS, each one also runs a TLS handshake. `MaxConnsPerHost` is 0 by default, which means no limit on dials.'
			},
			{
				add: ['s -->|"50 responses"| tr', 'tr --> keep["2 kept idle"]', 'tr --> drop["48 closed: errTooManyIdleHost"]'],
				highlight: ['keep', 'drop'],
				note: 'When a response is read, the transport offers the connection back to the pool. `tryPutIdleConn` returns `errTooManyIdleHost` once the host already has 2 idle connections, and the connection is closed. The client closes first, so its 48 sockets go to `TIME_WAIT`.'
			},
			{
				add: ['g2["Next 50 requests"] -->|"2 reuse"| keep', 'g2 -->|"48 new dials"| s'],
				highlight: ['g2'],
				note: 'The next round finds 2 idle connections and dials 48 again. Over 20 rounds that gave 749 connections for 1000 requests in the run above.'
			},
			{
				add: ['fix["MaxIdleConnsPerHost: 50"] --> keep'],
				highlight: ['fix'],
				note: 'With room for 50 idle connections, every connection goes back to the pool and the next round reuses it. The run dialed 41 connections in total. A connection nobody reuses for 90 s is closed by `IdleConnTimeout`.'
			},
			{
				add: ['py["urllib3 pool: maxsize 10, block=True"] -->|"11th thread"| wait["waits; EmptyPoolError after pool_timeout"]'],
				highlight: ['py', 'wait'],
				note: 'With a blocking pool, a request that finds the pool empty waits for another request to give a connection back. urllib3 waits with no limit, or raises `EmptyPoolError` after `pool_timeout` seconds if you set one. With `block=False`, the default, it opens an extra connection and drops it afterwards.'
			}
		]
	},
	example: {
		title: 'src/urllib3/connectionpool.py: taking a connection and giving it back',
		repo: 'urllib3/urllib3',
		url: `${U3}#L262-L341`,
		lang: 'python',
		code: `    def _get_conn(self, timeout: float | None = None) -> BaseHTTPConnection:
…
        conn = None

        if self.pool is None:
            raise ClosedPoolError(self, "Pool is closed.")

        try:
            conn = self.pool.get(block=self.block, timeout=timeout)

        except AttributeError:  # self.pool is None
            raise ClosedPoolError(self, "Pool is closed.") from None  # Defensive:

        except queue.Empty:
            if self.block:
                raise EmptyPoolError(
                    self,
                    "Pool is empty and a new connection can't be opened due to blocking mode.",
                ) from None
            pass  # Oh well, we'll create a new connection then

        # If this is a persistent connection, check if it got disconnected
        if conn and is_connection_dropped(conn):
            log.debug("Resetting dropped connection: %s", self.host)
            conn.close()

        return conn or self._new_conn()

    def _put_conn(self, conn: BaseHTTPConnection | None) -> None:
…
        if self.pool is not None:
            try:
                self.pool.put(conn, block=False)
                return  # Everything is dandy, done.
            except AttributeError:
                # self.pool is None.
                pass
            except queue.Full:
                # Connection never got put back into the pool, close it.
                if conn:
                    conn.close()

                if self.block:
                    # This should never happen if you got the conn from self._get_conn
                    raise FullPoolError(
                        self,
                        "Pool reached maximum size and no more connections are allowed.",
                    ) from None

                log.warning(
                    "Connection pool is full, discarding connection: %s. Connection pool size: %s",
                    self.host,
                    self.pool.qsize(),
                )

        # Connection never got put back into the pool, close it.
        if conn:
            conn.close()`,
		notes: [
			'`self.pool` is a `queue.LifoQueue` of `maxsize` slots, [filled with `None`](' + U3 + '#L214-L216) at creation. Line 9 takes the most recently returned connection, or a `None`, and for a `None` line 27 calls `_new_conn()`.',
			'Lines 14 to 20 run when the queue is empty, which means `maxsize` connections are already in use. With `block=True`, line 9 waited `timeout` seconds (forever if it is `None`, the default), and line 16 raises `EmptyPoolError`. With `block=False`, line 20 falls through and line 27 opens a connection beyond the pool size.',
			'Line 33 returns a connection without waiting. If the queue is full, lines 40 and 41 close it and line 50 logs the warning. A `requests.Session` shared by 32 threads, run for this chapter (requests 2.31.0), logged it 22 times in 320 calls: "Connection pool is full, discarding connection: 127.0.0.1. Connection pool size: 10".',
			'Line 23 checks a pooled connection before it is reused. If the server closed it while it sat idle, line 25 closes it and line 27 opens a fresh one.'
		]
	},
	tradeoff: {
		gain: [
			'A reused connection skips the TCP and TLS handshakes: 11 ms to first byte instead of 42 ms for example.org in this session.',
			'A pool sized to the client\'s concurrency stops the churn: 41 connections and 0 sockets in `TIME_WAIT` for 1000 requests, against 749 and 747 with Go\'s default of 2.'
		],
		cost: [
			'Each idle connection holds a socket and memory on both ends until `IdleConnTimeout` (90 s in Go) or the server\'s idle timeout closes it. 50 idle connections from each of 40 client pods are 2000 sockets on the server.',
			'A pooled connection can be closed by the server while it waits. urllib3 checks with `is_connection_dropped` before reuse, and Go retries some requests that hit a closed idle connection (chapter 27).',
			'A blocking pool caps load on the server but moves the wait to the client. With `block=True`, the 11th thread of a size 10 pool waits, with no limit unless `pool_timeout` is set.'
		]
	},
	task: {
		prompt: 'A Python worker runs 32 threads that share one `requests.Session` and call the same API host. Its log fills with "Connection pool is full, discarding connection: api.internal. Connection pool size: 10". Explain the warning, give the line that fixes it, and say what `pool_block=True` would change.',
		hint: 'requests builds its pool with `DEFAULT_POOLSIZE = 10` and `DEFAULT_POOLBLOCK = False`. Count how many connections the 32 threads hold at peak.',
		answer: [
			'Up to 32 threads hold a connection at the same time. The pool has `block=False`, so urllib3 opens up to 32 connections. Its queue keeps only 10 of them. Each connection returned to a full queue is closed and logged, and the next request opens a new one.',
			'Fix: `session.mount("https://", requests.adapters.HTTPAdapter(pool_maxsize=32))`. In the run for this chapter, the same change took the warnings from 22 to 0.',
			'With `pool_block=True` and size 10, at most 10 requests run at once. The other 22 threads wait for a connection to come back. That protects the API from more than 10 connections, but the threads spend time waiting. requests calls `urlopen` without `pool_timeout`, so that wait has no limit.'
		],
		steps: [
			{
				title: 'Count the connections',
				questions: [
					{ q: 'How many connections can be in use at the peak?', options: ['32, one per thread', '10, the pool size', '1, since the session is shared', '2, as in Go\'s default'], answer: 0, why: 'Each of the 32 threads holds a connection while its request runs, and they all call the same host.' },
					{ q: 'What pool size does requests give by default?', options: ['1, like urllib3', '10, from `DEFAULT_POOLSIZE`', '32, one per thread', 'No limit'], answer: 1, why: 'The log line says it: "Connection pool size: 10". requests sets `DEFAULT_POOLSIZE = 10`.' },
					{ q: 'The queue is empty and an 11th thread asks for a connection. With `block=False`, what does urllib3 do?', options: ['It waits for a connection to come back', 'It raises `EmptyPoolError`', 'It opens a new connection beyond the pool size', 'It shares a busy connection'], answer: 2, why: 'On `queue.Empty` with `block=False`, `_get_conn` falls through and calls `_new_conn()`.' },
					{ q: 'So how many connections can be open at once?', options: ['10, never more', '22, the ones beyond the pool', '1, reused in turn', 'Up to 32'], answer: 3, why: 'Every thread that finds the queue empty opens its own, so the count follows the threads, not the pool size.' }
				]
			},
			{
				title: 'Explain the warning',
				questions: [
					{ q: 'When does urllib3 log "Connection pool is full, discarding connection"?', options: ['When the server refuses a new connection', 'When a returned connection finds the queue already full', 'When a request waits longer than `pool_timeout`', 'When a dropped connection is replaced'], answer: 1, why: '`_put_conn` puts the connection back with `block=False`. On `queue.Full` it closes the connection and logs the warning.' },
					{ q: 'What happens to that connection?', options: ['It is closed', 'It stays open outside the pool', 'It goes to a waiting thread', 'It is sent back to the server for reuse'], answer: 0, why: 'Lines 40 and 41 close it. Its TCP and TLS handshakes are lost.' },
					{ q: 'What does a later request do when the queue is empty again?', options: ['It reuses the closed connection', 'It waits for the warning to clear', 'It opens a new connection, with new handshakes', 'It fails with `FullPoolError`'], answer: 2, why: 'With only 10 slots for 32 users, the queue empties again and `_new_conn()` runs. That churn is what the warning reports.' },
					{ q: 'Do the threads see an error?', options: ['Yes: each warning is a failed request', 'Yes: they get `EmptyPoolError`', 'Only for HTTPS calls', 'No: requests still succeed, the cost is extra connections'], answer: 3, why: 'The warning is about discarding a connection after its request finished. The cost is the handshakes for the new ones.' }
				]
			},
			{
				title: 'Write the fix',
				questions: [
					{ q: 'Which line fixes it?', options: ['`session.max_redirects = 32`', '`session.mount("https://", requests.adapters.HTTPAdapter(pool_connections=32))`', '`session.mount("https://", requests.adapters.HTTPAdapter(pool_maxsize=32))`', '`requests.Session(pool_block=True)`'], answer: 2, why: '`pool_maxsize` is the size of each host\'s queue. 32 slots fit every connection the threads open.' },
					{ q: 'Why 32?', options: ['It matches the threads that hold a connection at the peak', 'It is double the default of 16', 'It is the API\'s connection limit', 'It is Go\'s default for one host'], answer: 0, why: 'A pool sized to the client\'s concurrency stops the churn: every returned connection finds a slot.' },
					{ q: 'What did that change do in the run for this chapter?', options: ['Warnings went from 22 to 10', 'Warnings went from 22 to 0', 'Nothing changed', 'Warnings doubled'], answer: 1, why: 'With 32 slots, no returned connection hit a full queue.' },
					{ q: 'What does `pool_maxsize=32` cost?', options: ['Each request gets slower', 'More sockets in `TIME_WAIT`', 'Nothing at all', 'Up to 32 idle connections held on both ends until one side closes them'], answer: 3, why: 'An idle connection holds a socket and memory on the client and on the server until an idle timeout closes it.' }
				]
			},
			{
				title: 'Weigh `pool_block=True`',
				questions: [
					{ q: 'With `pool_block=True` and size 10, how many requests run at once?', options: ['10', '32', '22', '1'], answer: 0, why: 'A blocking pool caps connections in use at its size.' },
					{ q: 'What do the other 22 threads do?', options: ['Open extra connections', 'Fail with `FullPoolError`', 'Wait for a connection to come back', 'Share a busy connection'], answer: 2, why: '`_get_conn` calls `self.pool.get(block=True, ...)`, which waits for another thread to put one back.' },
					{ q: 'How long can they wait?', options: ['5 s, then `EmptyPoolError`', '90 s, the idle timeout', '60 s, like a balancer', 'With no limit: requests calls `urlopen` without `pool_timeout`'], answer: 3, why: 'With `timeout=None`, `queue.get` waits forever.' },
					{ q: 'When does `pool_block=True` make sense?', options: ['When the warning fills the log', 'When the API must never see more than 10 connections from this worker', 'Always, it is faster', 'Never, it is deprecated'], answer: 1, why: 'It protects the server from extra connections, and the price is threads waiting on the client.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'A Go service uses `http.DefaultClient` and sends 50 requests at a time to one host. After each burst, what happens to the 50 connections?',
			options: [
				'All 50 stay open in the pool until `IdleConnTimeout` closes them after 90 s',
				'2 stay idle in the pool and 48 are closed, leaving client sockets in `TIME_WAIT`',
				'All 50 are closed, because `DefaultClient` does not use keep-alive connections',
				'The 50 requests wait for one shared connection, because the pool size is 1'
			],
			answer: 1,
			why: '`DefaultMaxIdleConnsPerHost` is 2. `tryPutIdleConn` returns `errTooManyIdleHost` for the 3rd idle connection to the same host and later ones, and the transport closes them. The next burst has to dial 48 new connections.'
		},
		{
			q: 'urllib3 logs "Connection pool is full, discarding connection". What happened?',
			options: [
				'The server refused a new connection because it hit its own connection limit',
				'A request waited longer than the pool timeout and was cancelled',
				'More connections were open than `maxsize`, and a returned one had no room',
				'A pooled connection was found closed by the server and was replaced'
			],
			answer: 2,
			why: 'With `block=False`, `_get_conn` opens a new connection when the queue is empty, so more than `maxsize` can be in use. `_put_conn` puts the connection back with `block=False`. When the queue is full it closes the connection and logs this warning.'
		},
		{
			q: 'A urllib3 pool has `maxsize=10` and `block=True`, and requests pass `pool_timeout=5`. Ten threads are mid-request when an 11th asks for a connection. What does the 11th thread do?',
			options: [
				'It waits up to 5 s for a connection to come back, then raises `EmptyPoolError`',
				'It opens an 11th connection and closes it after the request',
				'It shares one of the 10 busy connections by pipelining its request',
				'It fails at once with `FullPoolError` because the pool is full'
			],
			answer: 0,
			why: '`_get_conn` calls `self.pool.get(block=True, timeout=5)`, which waits for another thread to put a connection back. If 5 s pass first, `queue.Empty` is raised and turned into `EmptyPoolError`. `FullPoolError` is only for putting back into a full blocking pool.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Reproduce the "Connection pool is full" warning with 32 threads and one `requests.Session`, then fix it and try a blocking pool.',
		steps: [
			'Set up: `mkdir -p ~/pool-lab && cd ~/pool-lab && python3 -m venv .venv && .venv/bin/pip install requests==2.31.0`.',
			'In a second terminal, start a keep-alive server that takes 50 ms per request: `node -e "require(\'http\').createServer((q, r) => setTimeout(() => r.end(\'ok\\n\'), 50)).listen(8093, \'127.0.0.1\')"`.',
			'Create `worker.py` with this line. It shares one session between 32 threads for 320 calls, and its arguments set `pool_maxsize` and `pool_block`: `import logging, sys, time, requests; from concurrent.futures import ThreadPoolExecutor; logging.basicConfig(level=logging.WARNING); s = requests.Session(); s.mount("http://", requests.adapters.HTTPAdapter(pool_maxsize=int(sys.argv[1]), pool_block=len(sys.argv) > 2)) if len(sys.argv) > 1 else None; t = time.time(); list(ThreadPoolExecutor(32).map(lambda _: s.get("http://127.0.0.1:8093/").status_code, range(320))); print(f"320 calls in {time.time() - t:.1f} s")`',
			'Run it three ways and count the warnings each time: `.venv/bin/python worker.py 2>&1 | grep -c "pool is full"`, then the same with `worker.py 32`, then with `worker.py 10 block`. Run each once more without `grep` to see the time.'
		],
		done: [
			'With no arguments, the count is about 22, and the log shows `Connection pool is full, discarding connection: 127.0.0.1. Connection pool size: 10`.',
			'With `32`, the count is `0`.',
			'With `10 block`, the count is `0` and the run takes clearly longer than with `32` (1.7 s against 0.5 s on the machine used to test this lab).'
		],
		solution: [
			'With the default size 10 and `block=False`, the 32 threads open up to 32 connections. Each one returned to a full queue is closed and logged.',
			'`pool_maxsize=32` gives every connection a slot. `pool_block=True` with size 10 keeps the warning away by making 22 threads wait, which is why that run is slower.'
		]
	},
	recall: {
		q: 'How many idle connections per host does Go\'s `http.Transport` keep by default, and what happened to 1000 requests sent 50 at a time with that default?',
		a: 'Two (`DefaultMaxIdleConnsPerHost = 2`). The run opened 749 TCP connections and left 747 sockets in `TIME_WAIT`. With `MaxIdleConnsPerHost: 50` it opened 41.'
	},
	sources: [
		{ title: 'Go source, net/http/transport.go: Transport pool fields and DefaultMaxIdleConnsPerHost', url: 'https://github.com/golang/go/blob/c3a068eec992b5ae783abce1a9d03f617b671ea2/src/net/http/transport.go#L47-L63' },
		{ title: 'Go source, net/http/transport.go: tryPutIdleConn', url: 'https://github.com/golang/go/blob/c3a068eec992b5ae783abce1a9d03f617b671ea2/src/net/http/transport.go#L1105-L1198' },
		{ title: 'urllib3 source, connectionpool.py: HTTPConnectionPool', url: 'https://github.com/urllib3/urllib3/blob/a37bc93b65d6bcf00d3dc43d966bab6bd130ecd8/src/urllib3/connectionpool.py#L127-L156' },
		{ title: 'requests source, adapters.py: HTTPAdapter pool defaults', url: 'https://github.com/psf/requests/blob/611c6162cbc4ac2020a2f91c7cfa4f3abf9bbb60/src/requests/adapters.py#L79-L80' },
		{ title: 'curl docs, --write-out', url: 'https://curl.se/docs/manpage.html#-w' }
	]
};
