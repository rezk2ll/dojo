const SPRING = 'https://github.com/spring-projects/spring-framework';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'leaked-handle',
	part: 'Resources',
	title: 'The close that a throw skips',
	minutes: 10,
	hook: [
		'Spring JDBC ships `MySQLMaxValueIncrementer`, which hands out ids from a counter table in MySQL. By default it takes a **separate connection** from the `DataSource` for each update of the counter, commits, and closes that connection.',
		'When the commit fails, the caller gets a `DataAccessResourceFailureException` with "Unable to commit new sequence value changes". The code has a `finally` block meant to clean up on every path. On this path the connection **stays open**.'
	],
	terms: [
		{ term: 'DataSource', def: 'The Java object that gives out database connections. It is often a pool that reuses a fixed number of them.' },
		{ term: 'finally', def: 'A Java block that runs after `try` and `catch`, whether they end normally or throw.' },
		{ term: 'Auto-commit', def: 'A connection mode where each statement is committed on its own. The incrementer turns it off to commit by hand.' }
	],
	bug: {
		title: 'Fix connection leak in MySQLMaxValueIncrementer',
		repo: 'spring-projects/spring-framework',
		url: `${SPRING}/blob/f03b76a53dfd87e53db0c4c72f37e2a87c94f7c2/spring-jdbc/src/main/java/org/springframework/jdbc/support/incrementer/MySQLMaxValueIncrementer.java#L127-L191`,
		fix: `${SPRING}/commit/5e45b9be1b742c7493e2bafbb0f1d1d0828194e3`,
		lang: 'java',
		code: `Connection con = null;
Statement stmt = null;
boolean mustRestoreAutoCommit = false;
try {
    if (this.useNewConnection) {
        con = getDataSource().getConnection();
        if (con.getAutoCommit()) {
            mustRestoreAutoCommit = true;
            con.setAutoCommit(false);
        }
    }
…
    this.nextId = this.maxId - getCacheSize() + 1;
}
catch (SQLException ex) {
    throw new DataAccessResourceFailureException("Could not obtain last_insert_id()", ex);
}
finally {
    JdbcUtils.closeStatement(stmt);
    if (con != null) {
        if (this.useNewConnection) {
            try {
                con.commit();
                if (mustRestoreAutoCommit) {
                    con.setAutoCommit(true);
                }
            }
            catch (SQLException ignore) {
                throw new DataAccessResourceFailureException(
                        "Unable to commit new sequence value changes for " + getIncrementerName());
            }
            JdbcUtils.closeConnection(con);
        }
        else {
            DataSourceUtils.releaseConnection(con, getDataSource());
        }
    }
}`,
		lines: [32],
		diff: `                         catch (SQLException ignore) {
                             throw new DataAccessResourceFailureException(
                                     "Unable to commit new sequence value changes for " + getIncrementerName());
                         }
-                        JdbcUtils.closeConnection(con);
+                        finally {
+                            JdbcUtils.closeConnection(con);
+                        }
                     }`,
		notes: [
			'**A throw inside the cleanup.** The outer `finally` runs on every path, but it contains its own `catch` that throws. When `con.commit()` or `con.setAutoCommit(true)` fails, that `throw` leaves the `finally` block at once. `JdbcUtils.closeConnection(con)` is the line after it, so it never runs.',
			'**What it costs.** The connection came from `getDataSource().getConnection()` and nobody holds it any more. If the `DataSource` is a pool of 10 connections, 10 failed commits leave all 10 checked out, and the next caller waits for a connection that never comes back.',
			'**The fix.** A `finally` on the inner `try` puts the close on every path out of it, including the `throw` in the `catch`. The exception still reaches the caller, after the connection is closed.',
			'**How it was found.** [Pull request #37321](' + SPRING + '/pull/37321) explains it: "the exception handler throws a `DataAccessResourceFailureException` before reaching `Connection.close()`." The commit message: "Move connection cleanup into a finally block so the connection is closed even if commit or auto-commit restoration fails."'
		]
	},
	quiz: [
		{
			q: '`con.commit()` throws an `SQLException`. Which of these lines still runs in the buggy code?',
			options: [
				'`JdbcUtils.closeConnection(con)`, at the end of the block',
				'`JdbcUtils.closeStatement(stmt)`, at the top of `finally`',
				'`con.setAutoCommit(true)`, to restore the setting',
				'`DataSourceUtils.releaseConnection(con, ...)` in the `else`'
			],
			answer: 1,
			why: '`closeStatement` runs before the commit. The `catch` then throws, which skips `closeConnection`. The `setAutoCommit` and `else` lines are not reached either.'
		},
		{
			q: 'The `DataSource` is a pool of 10 connections. What happens after 10 failed commits?',
			options: [
				'The pool closes the 10 connections and opens new ones',
				'All 10 stay checked out and the next caller waits',
				'MySQL rolls back and the connections return to the pool',
				'Nothing, since `getNextKey` is `synchronized`'
			],
			answer: 1,
			why: 'A pool only gets a connection back when `close` is called on it. None of the 10 was closed, so the pool has nothing left to give.'
		},
		{
			q: 'Which test shows this leak?',
			options: [
				'Call `getNextKey` many times with a working database',
				'Make `commit()` throw, then check that `close()` was called',
				'Set `useNewConnection` to false and call `getNextKey`',
				'Call `getNextKey` from two threads at the same time'
			],
			answer: 1,
			why: 'The leak only happens on the failure path. A mock connection whose `commit` throws, and a check that `close` was still called, covers it.'
		}
	],
	takeaway: 'Look inside every `finally` block for code that can throw before the last cleanup call. Put each cleanup in its own `finally`, or use try-with-resources, so a throw earlier in the block cannot skip it.',
	sources: [
		{ title: 'spring-framework pull request #37321', url: `${SPRING}/pull/37321` },
		{ title: 'The fix commit', url: `${SPRING}/commit/5e45b9be1b742c7493e2bafbb0f1d1d0828194e3` }
	]
};
