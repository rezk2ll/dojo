const REDIS = 'https://github.com/redis/redis';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'number-parsing',
	part: 'Inputs',
	title: 'A database called notanumber',
	minutes: 10,
	hook: [
		'Redis keeps several numbered databases: 0, 1, 2 and so on. `MOVE key db` moves a key from the current database to database `db`, and replies 1 when it moved the key.',
		'A user sent `MOVE key qwefklqfklsdbsdjhqwef`. There is no database with that name, so an error was expected. Redis replied that the move worked, and the key was now **in database 0**. The bug report says the user "doesn\'t know where to look for his key now".'
	],
	terms: [
		{ term: '`atoi`', def: 'A C function that turns the start of a string into an `int`. It stops at the first character that is not a digit, and returns 0 when there is no number at all. It never reports an error.' },
		{ term: '`selectDb`', def: 'Points the client at database `id`. It returns `REDIS_ERR` only when `id` is below 0 or not below the number of databases (16 by default).' },
		{ term: '`argv[2]`', def: 'The third word of the command. For `MOVE key 5`, it is the string `"5"`.' }
	],
	bug: {
		title: 'Reject MOVE to non-integer DBs',
		repo: 'redis/redis',
		url: `${REDIS}/blob/25791550e085930c196b9234465f6538fe8ee383/src/db.c#L706-L752`,
		fix: `${REDIS}/commit/498ad7482b2eb4ebc6f4c7458fe6a35f244adaf6`,
		lang: 'c',
		code: `void moveCommand(redisClient *c) {
    robj *o;
    redisDb *src, *dst;
    int srcid;

    if (server.cluster_enabled) {
        addReplyError(c,"MOVE is not allowed in cluster mode");
        return;
    }

    /* Obtain source and target DB pointers */
    src = c->db;
    srcid = c->db->id;
    if (selectDb(c,atoi(c->argv[2]->ptr)) == REDIS_ERR) {
        addReply(c,shared.outofrangeerr);
        return;
    }
    dst = c->db;
    selectDb(c,srcid); /* Back to the source DB */

    /* If the user is moving using as target the same
     * DB as the source DB it is probably an error. */
    if (src == dst) {
        addReply(c,shared.sameobjecterr);
        return;
    }
…
    dbAdd(dst,c->argv[1],o);
    incrRefCount(o);

    /* OK! key moved, free the entry in the source DB */
    dbDelete(src,c->argv[1]);
    server.dirty++;
    addReply(c,shared.cone);
}`,
		lines: [14],
		diff: `     srcid = c->db->id;
-    if (selectDb(c,atoi(c->argv[2]->ptr)) == REDIS_ERR) {
+
+    if (getLongLongFromObject(c->argv[2],&dbid) == REDIS_ERR ||
+        dbid < INT_MIN || dbid > INT_MAX ||
+        selectDb(c,dbid) == REDIS_ERR)
+    {
         addReply(c,shared.outofrangeerr);`,
		notes: [
			'Line 14 is the only check on the target: `selectDb` rejects numbers outside 0 to 15. `atoi` has no error value, so `selectDb` never sees that the string was not a number. `atoi("qwefklqfklsdbsdjhqwef")` returns 0, and 0 is a valid database.',
			'The client is on database 1 and sends `MOVE mykey notanumber`. On line 14 `atoi` gives 0 and `selectDb(c, 0)` succeeds, so `dst` is database 0 and the key moves there with the reply 1. From database 0, the same command gets "source and destination objects are the same" from line 24. `atoi` also accepts junk after digits: `atoi("3abc")` returns 3.',
			'The fix replaces line 14. `getLongLongFromObject` parses with `strtoll` and returns `REDIS_ERR` unless the whole string is a number (`eptr[0] != \'\\0\'` catches trailing junk). The range check `dbid < INT_MIN || dbid > INT_MAX` stops a huge value from being cut down to some other `int` when it is passed to `selectDb`. Any failure now replies "ERR index out of range".',
			'Issue #1428: "Move command uses `atoi()` to convert the second argument to a number, which returns `0` in case of error." The commit adds a test that sends `move mykey notanumber` and expects the error.'
		]
	},
	quiz: [
		{
			q: 'The client is on database 2 and sends `MOVE mykey 7x`. What does the buggy code do?',
			options: [
				'It replies "ERR index out of range"',
				'It moves the key to database 7',
				'It moves the key to database 0',
				'It replies that source and destination are the same'
			],
			answer: 1,
			why: '`atoi("7x")` reads the 7 and stops at the x. Database 7 exists, so the move goes through.'
		},
		{
			q: 'Why did `selectDb` not catch `MOVE mykey notanumber`?',
			options: [
				'It only checks the source database, not the target',
				'It receives 0, which is a valid database number',
				'It runs after the key has already been moved',
				'It treats any string as database 0 on purpose'
			],
			answer: 1,
			why: 'The string never reaches `selectDb`. `atoi` has already turned it into 0, and 0 is between 0 and 15.'
		},
		{
			q: 'You replace `atoi` with `strtol(s, &end, 10)`. What else must you check to reject `"12abc"`?',
			options: [
				'That the result is not 0',
				'That `*end` is the string terminator',
				'That `errno` is still 0 after the call',
				'That the first character of `s` is a digit'
			],
			answer: 1,
			why: '`strtol` stops at the a and returns 12 with no error. Only `end` tells you that characters were left over.'
		}
	],
	recall: {
		q: 'Why did `MOVE key qwefklqfklsdbsdjhqwef` move the key to database 0?',
		a: '`atoi` returns 0 for a string with no digits and reports no error, and `selectDb` accepts 0. The fix parses with `getLongLongFromObject`, which returns `REDIS_ERR` unless the whole string is a number.'
	},
	sources: [
		{ title: 'redis issue #1428', url: `${REDIS}/issues/1428` },
		{ title: 'redis commit 498ad74', url: `${REDIS}/commit/498ad7482b2eb4ebc6f4c7458fe6a35f244adaf6` }
	]
};
