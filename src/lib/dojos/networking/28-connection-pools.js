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
