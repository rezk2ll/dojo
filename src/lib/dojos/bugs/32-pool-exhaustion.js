const GO = 'https://github.com/golang/go';
const PARENT = '478f4b67543824c039d2f7afec6af88a59148db2';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'pool-exhaustion',
	part: 'Resources',
	title: 'A connection counted but never pooled',
	minutes: 10,
	hook: [
		'Go 1.2 added `SetMaxOpenConns` to `database/sql`. On one high-traffic site, connections leaked "every few days". The commit message gives the result: "If SetMaxOpenConns is used, the application **eventually deadlocks**. Otherwise, the number of open connections just keep growing indefinitely."',
		'When a caller needs a connection and none is idle, a background goroutine opens a new one. When it is ready, the code counts it in `numOpen` and hands it over with `putConnDBLocked`: to a caller that is waiting, or to the idle list. The comment on `putConnDBLocked` says there is a third outcome.'
	],
	terms: [
		{ term: 'Connection pool', def: 'A set of open database connections that callers borrow and give back, so each query does not open a new one.' },
		{ term: 'Idle list', def: 'The open connections that no caller holds right now, kept in `freeConn` (at most 2 by default).' },
		{ term: 'numOpen', def: 'The pool\'s count of open connections. With `SetMaxOpenConns(n)`, callers wait once it reaches n.' }
	],
	bug: {
		title: 'database/sql: Fix connection leak and potential deadlock',
		repo: 'golang/go',
		url: `${GO}/blob/${PARENT}/src/pkg/database/sql/sql.go#L576-L793`,
		fix: `${GO}/commit/37db8804691f0a5e618cbc041909895c9709263c`,
		lang: 'go',
		code: `// Open one new connection
func (db *DB) openNewConnection() {
	ci, err := db.driver.Open(db.dsn)
	db.mu.Lock()
	defer db.mu.Unlock()
	if db.closed {
		if err == nil {
			ci.Close()
		}
		return
	}
	db.pendingOpens--
	if err != nil {
		db.putConnDBLocked(nil, err)
		return
	}
	dc := &driverConn{
		db: db,
		ci: ci,
	}
	db.addDepLocked(dc, dc)
	db.numOpen++
	db.putConnDBLocked(dc, err)
}
…
// If a connRequest was fullfilled or the *driverConn was placed in the
// freeConn list, then true is returned, otherwise false is returned.
func (db *DB) putConnDBLocked(dc *driverConn, err error) bool {
	if db.connRequests.Len() > 0 {
…
		return true
	} else if err == nil && !db.closed && db.maxIdleConnsLocked() > 0 && db.maxIdleConnsLocked() > db.freeConn.Len() {
		dc.listElem = db.freeConn.PushFront(dc)
		return true
	}
	return false
}`,
		lines: [23, 21, 22],
		diff: ` 		ci: ci,
 	}
-	db.addDepLocked(dc, dc)
-	db.numOpen++
-	db.putConnDBLocked(dc, err)
+	if db.putConnDBLocked(dc, err) {
+		db.addDepLocked(dc, dc)
+		db.numOpen++
+	} else {
+		ci.Close()
+	}
 }`,
		notes: [
			'Line 36 returns `false` when nobody is waiting and the idle list is full. Line 23 ignores that value, after line 22 has already added the connection to `numOpen`. The connection is then in no list, and nobody closes it.',
			'In the report, a caller asks for a connection, none is idle, so the opener starts dialing. While it waits on the network, 3 busy connections are released: the first goes to the waiting caller, the next 2 fill the idle list (2 is the default). The new connection arrives with no caller waiting and no idle slot, line 36 returns `false`, and the connection is lost.',
			'Each lost connection stays in `numOpen` forever. With `SetMaxOpenConns(10)`, after 10 such losses `numOpen` is 10 while no real connection is left. `conn()` waits when `db.numOpen >= db.maxOpen` and opens nothing new, so **every query waits**. Without a limit, the leaked connections pile up on the database server instead.',
			'The fix counts the connection only when `putConnDBLocked` returns `true`, and closes it otherwise. The reporter, on [issue #6593](' + GO + '/issues/6593): "it calls putConnDBLocked() without checking the return value, assuming the connection will either fulfill a pending request or be added to the idle queue, but that\'s not always the case."'
		]
	},
	quiz: [
		{
			q: 'The idle limit is 2. When the new connection is ready, nobody is waiting and 2 connections are idle. What happens in the buggy code?',
			options: [
				'It replaces the oldest idle connection, which gets closed',
				'It is counted in `numOpen`, then dropped without being closed',
				'It is closed right away, and `numOpen` stays the same',
				'It waits in the opener goroutine until a caller asks for it'
			],
			answer: 1,
			why: '`numOpen++` runs first, then `putConnDBLocked` returns `false` because the idle list is full. Nothing closes `ci` and nothing keeps a reference to it in the pool.'
		},
		{
			q: 'With `SetMaxOpenConns(10)`, why does the app end up stuck rather than just slow?',
			options: [
				'The database refuses new logins after 10 failed queries',
				'The opener goroutine panics on the eleventh connection',
				'`numOpen` reaches 10 from lost connections, so every caller waits',
				'The idle list grows past 10 and blocks the mutex'
			],
			answer: 2,
			why: 'The limit is checked against `numOpen`, which still counts the lost connections. Once they reach 10, callers wait for a connection that will never be released or opened.'
		},
		{
			q: 'A function hands a resource to a pool and returns a bool. What should the caller do?',
			options: [
				'Check the bool and close the resource when the pool refused it',
				'Ignore the bool, since the pool closes what it does not keep',
				'Retry the call in a loop until the pool accepts the resource',
				'Count the resource first, so the limit is never exceeded'
			],
			answer: 0,
			why: 'Here the pool does not close what it refuses. The caller owns the resource until the pool says yes, so it must count it only on `true` and close it on `false`.'
		}
	],
	recall: {
		q: 'In Go 1.2 `database/sql`, what happened to a new connection when `putConnDBLocked` returned `false`, and why did that end in a deadlock?',
		a: 'Nothing closed it and no list held it, but `numOpen` had already counted it. With `SetMaxOpenConns(10)`, 10 such losses left `numOpen` at 10 with no real connection, so every caller waited. The fix counts the connection only on `true` and closes it on `false`.'
	},
	sources: [
		{ title: 'go issue #6593', url: `${GO}/issues/6593` },
		{ title: 'Code review 14611045', url: 'https://golang.org/cl/14611045' }
	]
};
