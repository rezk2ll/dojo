const TOKIO = 'https://github.com/tokio-rs/tokio';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'locked-twice',
	part: 'Resources',
	title: 'A destructor that runs under the lock',
	minutes: 10,
	hook: [
		'A Tokio `JoinSet` holds a group of spawned tasks, and `join_next()` waits for the next one to finish. In September 2026 a report showed a program that **hung forever** inside a `JoinSet` poll. Its last log line was "child completing, about to wake the JoinSet entry".',
		'The method below runs on each poll. It saves the caller’s waker so the set can wake the caller later. When a child task finishes, its wake code takes the same `self.lists` mutex to move its entry to the `notified` list.',
		'The program used its own waker type. Dropping the old waker ran the runtime until a child task finished.'
	],
	terms: [
		{ term: 'Waker', def: 'A handle a future gives to whoever must wake it later. An executor can make its own waker type, with its own `Drop` code.' },
		{ term: 'Drop', def: 'Rust runs a value’s destructor when the value goes away. Assigning a new value to a field drops the old one on that line.' },
		{ term: 'Mutex', def: 'A lock that one thread holds at a time. This one cannot be taken twice by the same thread: the second `lock()` waits forever.' }
	],
	bug: {
		title: 'task: drop replaced waker outside lock in JoinSet (#8554)',
		repo: 'tokio-rs/tokio',
		url: `${TOKIO}/blob/6fa334aee7b106aadc5c98d550dc4dc0a163cff3/tokio/src/util/idle_notified_set.rs#L172-L204`,
		fix: `${TOKIO}/commit/babd90dee5933869084f4c21f30a4bd47ef7733d`,
		lang: 'rust',
		code: `pub(crate) fn pop_notified(&mut self, waker: &Waker) -> Option<EntryInOneOfTheLists<'_, T>> {
    // We don't decrement the length because this call moves the entry to
    // the idle list rather than removing it.
    if self.length == 0 {
        // Fast path.
        return None;
    }

    let mut lock = self.lists.lock();

    let should_update_waker = match lock.waker.as_mut() {
        Some(cur_waker) => !waker.will_wake(cur_waker),
        None => true,
    };
    if should_update_waker {
        lock.waker = Some(waker.clone());
    }

    // Pop the entry, returning None if empty.
    let entry = lock.notified.pop_back()?;

    lock.idle.push_front(entry.clone());

    // Safety: We are holding the lock.
    entry.my_list.with_mut(|ptr| unsafe {
        *ptr = List::Idle;
    });

    drop(lock);

    // Safety: We just put the entry in the idle list, so it is in one of the lists.
    Some(EntryInOneOfTheLists { entry, set: self })
}`,
		lines: [16],
		diff: `
+        // Declare \`_old_waker\` before \`lock\` so that it is dropped after \`lock\`
+        // is released, including when returning early via \`?\`.
+        let _old_waker;
         let mut lock = self.lists.lock();
 …
         if should_update_waker {
-            lock.waker = Some(waker.clone());
+            _old_waker = lock.waker.replace(waker.clone());
         }`,
		notes: [
			'**The assignment runs a destructor.** `lock.waker = Some(waker.clone())` drops the waker that was stored before. That drop runs while `lock` still holds `self.lists`. A custom waker can run any code there. The issue says the trigger needs "an unusual executor/waker cleanup adapter, not an ordinary Tokio task waker."',
			'**How it hangs.** The report’s waker drives the runtime in its `Drop`. A child task finishes, and its `wake_by_ref` calls `me.parent.lock()`, the same mutex. The thread already holds it, inside `pop_notified`, so the second `lock()` never returns. The report: "The trigger hangs after the child finishes."',
			'**The fix.** `lock.waker.replace(...)` returns the old waker instead of dropping it, and `_old_waker` keeps it. Rust drops locals in reverse order of declaration, so `_old_waker`, declared before `lock`, is dropped after the mutex is released. The new comment says this covers the early `return` from `?` too.',
			'**The same file already did this once.** In `wake_by_ref`, the code takes the waker out with `lock.waker.take()`, calls `drop(lock)`, and only then calls `waker.wake()`. The reporters linked [issue #5429](' + TOKIO + '/issues/5429), which covers waker replacement in other Tokio primitives.',
			'**How it was found.** [Issue #8553](' + TOKIO + '/issues/8553), titled "JoinSet destroys a replaced parent waker under its list mutex", came with a small program that hangs, and a control run that keeps the old waker alive until after the poll and finishes.'
		]
	},
	quiz: [
		{
			q: 'Which line can run code you do not control while `self.lists` is locked?',
			options: [
				'`let mut lock = self.lists.lock();`',
				'`lock.waker = Some(waker.clone());`',
				'`let entry = lock.notified.pop_back()?;`',
				'`drop(lock);`'
			],
			answer: 1,
			why: 'The assignment drops the old waker on that line, and a waker’s `Drop` belongs to whoever made it. `waker.clone()` also runs waker code, but the report and the fix are about the drop.'
		},
		{
			q: 'Why does `let _old_waker;` go before `let mut lock`, and not after it?',
			options: [
				'Rust needs every variable declared before the first lock',
				'Locals drop in reverse order, so it drops after the lock does',
				'It makes the compiler check that the waker is never cloned',
				'A variable declared later could not be assigned inside the if'
			],
			answer: 1,
			why: 'Rust drops locals last-declared first. `lock` is declared after `_old_waker`, so the mutex is released first and the old waker is dropped with no lock held, also on the early return from `?`.'
		},
		{
			q: 'You hold a lock and must replace a value that has a custom `Drop`. What is the safe pattern?',
			options: [
				'Assign the new value, then release the lock as soon as possible',
				'Take the old value out under the lock, drop it after releasing',
				'Use a lock that the same thread is allowed to take twice',
				'Clone the old value before assigning, so its drop is skipped'
			],
			answer: 1,
			why: 'Moving the old value out (`replace`, `take`, `mem::replace`) keeps its destructor from running under the lock. A reentrant lock would let the child change the lists in the middle of `pop_notified`.'
		}
	],
	takeaway: 'Under a lock, look for every value that gets dropped, including the old value of a field you assign. If its destructor can call back into your code, move it out and drop it after the lock is released.',
	sources: [
		{ title: 'tokio issue #8553', url: `${TOKIO}/issues/8553` },
		{ title: 'tokio pull request #8554', url: `${TOKIO}/pull/8554` },
		{ title: 'tokio issue #5429', url: `${TOKIO}/issues/5429` }
	]
};
