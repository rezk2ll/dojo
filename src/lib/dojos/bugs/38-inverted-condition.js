const RUBY = 'https://github.com/ruby/ruby';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'inverted-condition',
	part: 'Logic',
	title: 'Hashes that were never freed',
	minutes: 10,
	hook: [
		'A short script on Ruby\'s master branch builds 100,000 hashes of 9 entries, drops them, and calls `GC.start`. It does that 10 times and prints the memory of the process each time. The numbers go **58816, 97056, 135296, ... 403088 KB**. `GC.start` collects the hashes, and the process still grows by about 38 MB each round.',
		'The garbage collector has a fast path for dead objects that own no extra memory: it frees the slot and skips the full cleanup. The function below decides which objects may take it.'
	],
	terms: [
		{ term: 'Sweep', def: 'The phase of the garbage collector that walks dead objects and frees them.' },
		{ term: 'Flag bit', def: 'A bit in the object header that records a fact about the object, tested with `flags & SOME_FLAG`.' },
		{ term: 'st_table', def: 'The hash table Ruby uses for bigger hashes. Its entries live in memory allocated with malloc, outside the object.' },
		{ term: 'Embedded', def: 'An object whose data fits inside its own slot, so there is nothing else to free.' }
	],
	bug: {
		title: 'Fix memory leak when sweeping hashes with st_table',
		repo: 'ruby/ruby',
		url: `${RUBY}/blob/7a4de4748a11c380323d9c5f52b7f9d44b5d2f6b/gc.c#L1396-L1466`,
		fix: `${RUBY}/commit/120c8fa88c222636f5e292224d3c8fba0ef254a8`,
		lang: 'c',
		code: `/*
 * Returns true if the object requires a full rb_gc_obj_free() call during sweep,
 * false if it can be freed quickly without calling destructors or cleanup.
…
 */
bool
rb_gc_obj_needs_cleanup_p(VALUE obj)
{
    VALUE flags = RBASIC(obj)->flags;

    if (flags & FL_FINALIZE) return true;
…
    switch (flags & RUBY_T_MASK) {
…
      case T_STRING:
        return (flags & (RSTRING_NOEMBED | RSTRING_FSTR));

      case T_ARRAY:
        return !(flags & RARRAY_EMBED_FLAG);

      case T_HASH:
        return !(flags & RHASH_ST_TABLE_FLAG);
…
      case T_BIGNUM:
        return !(flags & BIGNUM_EMBED_FLAG);
…
    }`,
		lines: [22],
		diff: `       case T_HASH:
-        return !(flags & RHASH_ST_TABLE_FLAG);
+        return (flags & RHASH_ST_TABLE_FLAG);`,
		notes: [
			'On line 19 the array flag means "embedded", so an array needs cleanup when the flag is not set: `!(flags & RARRAY_EMBED_FLAG)`. Line 22 keeps the same `!` for hashes. But `RHASH_ST_TABLE_FLAG` is set when the hash has an st_table outside the object, so a hash needs cleanup when the flag **is** set.',
			'The script in the pull request says: "Hashes with more than 8 elements use st_table with a malloc\'d entries array". A hash with 9 entries has the flag set, so line 22 returns false. The sweep takes the fast path, never calls `rb_gc_obj_free()`, and the entries array is never freed. Each round of 100,000 such hashes added about 38 MB.',
			'The fix drops the `!` on line 22, so hashes with an st_table go to the full cleanup. Small hashes keep their entries inside the object, and they now take the fast path. The comment on lines 1 to 5 reserves that path for objects freed "without calling destructors or cleanup".',
			'Pull request [#18096](' + RUBY + '/pull/18096) gives the script and the numbers. After the fix, the same 10 rounds print 27696 KB every time.'
		]
	},
	quiz: [
		{
			q: 'A hash with 9 entries dies. What does the buggy function return for it?',
			options: [
				'true, so the full free runs',
				'false, so its st_table is never freed',
				'true, because FL_FINALIZE is set',
				'false, because hashes are always embedded'
			],
			answer: 1,
			why: 'With 9 entries the hash uses an st_table, so the flag is set. `!(flags & RHASH_ST_TABLE_FLAG)` is then false, and the sweep skips the cleanup.'
		},
		{
			q: 'Why is the `!` right for `T_ARRAY` and wrong for `T_HASH`?',
			options: [
				'The array flag means embedded, the hash flag means external',
				'Arrays are freed by a finalizer, and hashes never are',
				'`T_HASH` objects are swept before `T_ARRAY` objects',
				'`RHASH_ST_TABLE_FLAG` is zero on most platforms'
			],
			answer: 0,
			why: 'Both lines ask "does this object own memory outside its slot?". For arrays that is the absence of a flag, for hashes the presence of one.'
		},
		{
			q: 'Which check would have caught this before merge?',
			options: [
				'Watch memory while creating and dropping big hashes in a loop',
				'Run the test suite with a smaller heap size',
				'Count how often rb_gc_obj_free runs for small strings',
				'Check that GC.start returns without raising'
			],
			answer: 0,
			why: 'The leak raises no error and breaks no result. Only the memory of the process shows it, as the script in the pull request does.'
		}
	],
	recall: {
		q: 'Why does `!` belong on the `T_ARRAY` line and not on the `T_HASH` line?',
		a: '`RARRAY_EMBED_FLAG` is set when the array is embedded, so cleanup is needed when it is absent. `RHASH_ST_TABLE_FLAG` is set when the hash has a malloc\'d st_table, so cleanup is needed when it is present.'
	},
	sources: [
		{ title: 'ruby pull request #18096', url: `${RUBY}/pull/18096` }
	]
};
