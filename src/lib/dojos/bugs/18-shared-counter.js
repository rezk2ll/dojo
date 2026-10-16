const CPY = 'https://github.com/python/cpython';
const ISSUE = `${CPY}/issues/56075`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'shared-counter',
	part: 'State and time',
	title: 'Two threads named Thread-35',
	minutes: 10,
	hook: [
		'A Python user wrote a script where each thread starts three more threads, five levels deep, and prints its name. He ran it about 100 times and counted duplicate names. The output shows `Thread-35` and `Thread-12`, each given to two threads.',
		'The docstring of `Thread.__init__` promises a unique name when you pass none. The name comes from a module-level counter in `threading.py`, and the constructor runs in whichever thread creates the new thread.'
	],
	terms: [
		{ term: 'GIL', def: 'The global interpreter lock in CPython. Only one thread runs Python bytecode at a time, but the interpreter can switch threads between two bytecode instructions.' },
		{ term: 'Read-modify-write', def: 'An update in three steps: read the value, compute the new one, store it. Another thread can run between the steps.' },
		{ term: 'itertools.count', def: 'An iterator that yields 0, 1, 2 and so on. Its `__next__` is written in C, so one call is a single step for Python code.' }
	],
	bug: {
		title: '#11866: Eliminate race condition in the computation of names for new threads.',
		repo: 'python/cpython',
		url: `${CPY}/blob/e1618491adc5c0ef214c25d4e3b882e8586a2fee/Lib/threading.py#L728-L789`,
		fix: `${CPY}/commit/b186f1df41da42d774ac9278588acc2bd11a59a8`,
		lang: 'python',
		code: `# Helper to generate new thread names
_counter = 0
def _newname(template="Thread-%d"):
    global _counter
    _counter += 1
    return template % _counter
…
    def __init__(self, group=None, target=None, name=None,
                 args=(), kwargs=None, *, daemon=None):
        …
        *name* is the thread name. By default, a unique name is constructed of
        the form "Thread-N" where N is a small decimal number.
        …
        self._target = target
        self._name = str(name or _newname())`,
		lines: [5],
		diff: ` # Helper to generate new thread names
-_counter = 0
+_counter = _count().__next__
+_counter() # Consume 0 so first non-main thread has id 1.
 def _newname(template="Thread-%d"):
-    global _counter
-    _counter += 1
-    return template % _counter
+    return template % _counter()`,
		notes: [
			'**One line, several bytecode steps.** `_counter += 1` reads the global, adds 1, then stores it. The report shows the bytecode: `LOAD_GLOBAL`, `BINARY_ADD`, `STORE_GLOBAL`. The interpreter can switch threads between any two of them, even with the GIL.',
			'**How two threads get 35.** The counter is 34. Thread A loads 34 and adds 1, then the interpreter switches. Thread B loads 34, adds 1, stores 35. A resumes and stores its own 35. Both then format `Thread-35`. One increment is lost and one name is used twice.',
			'**The fix.** `_count().__next__` is a C function. One call reads and advances the counter as one step, so no thread can run in the middle. The extra `_counter()` call consumes 0 so the first thread is still `Thread-1`. Antoine Pitrou noted on the issue: "this fix only works on implementations where itertools.count().next is atomic."',
			'**How it was found.** Peter Saveliev opened [issue #11866](' + ISSUE + '): "The _newname() function has no locking." He attached a script and ran it about 100 times to show duplicates. The fix has no test, because the committer said a test "would never be a consistent failure."'
		]
	},
	quiz: [
		{
			q: 'The counter is 34 and two threads call `_newname()` at the same time. What is the worst result?',
			options: [
				'Both threads get `Thread-35`',
				'One gets `Thread-35`, the other `Thread-36`',
				'One of the threads raises an error',
				'Both get `Thread-36` and 35 is skipped'
			],
			answer: 0,
			why: 'Both read 34 before either stores. Each computes 35 and formats it, so the two names are equal.'
		},
		{
			q: 'Why does the GIL not make `_counter += 1` safe?',
			options: [
				'The GIL is released for every global variable',
				'The GIL only protects C code, not Python code',
				'The interpreter can switch threads between bytecodes',
				'`+=` on an int creates a new thread'
			],
			answer: 2,
			why: 'The GIL keeps one bytecode instruction whole, not a whole line. The read and the store are separate instructions.'
		},
		{
			q: 'You need a counter shared by threads in your own Python code. Which choice holds under any Python implementation?',
			options: [
				'A global int updated with `+=`',
				'A global int updated inside a `threading.Lock`',
				'A list with one int, updated with `x[0] += 1`',
				'A global int that each thread copies first'
			],
			answer: 1,
			why: 'A lock makes the read and the store one step for every thread that takes it. The `itertools.count` trick depends on a C call being atomic, which the issue notes is an implementation detail.'
		}
	],
	takeaway: 'Look for `+=` on any variable that more than one thread can reach. Put the update under a lock, or use a single call that reads and writes in one step.',
	sources: [
		{ title: 'cpython issue #56075 (bpo-11866)', url: ISSUE },
		{ title: 'The fix commit', url: `${CPY}/commit/b186f1df41da42d774ac9278588acc2bd11a59a8` }
	]
};
