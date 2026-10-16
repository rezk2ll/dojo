const MOBY = 'https://github.com/moby/moby';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'loop-closure',
	part: 'State and time',
	title: 'A loop variable captured by a goroutine',
	minutes: 10,
	hook: [
		'When the Docker daemon starts, it loads every container from disk into a map keyed by container ID. Then it registers each one in its own goroutine, with a semaphore that limits how many run at once. A container that fails to register must be **removed from the map**, so the later steps of the start skip it.',
		'`go vet` flagged two lines in this loop. The goroutine gets the container as an argument. It also uses one more value from the loop.'
	],
	terms: [
		{ term: 'Goroutine', def: 'A function that Go runs at the same time as the code that started it, with `go func() { ... }()`.' },
		{ term: 'Closure', def: 'A function literal that uses variables from the code around it. It reads the variable itself, not a copy.' },
		{ term: 'Loop variable', def: 'The `id, c` of `for id, c := range`. Before Go 1.22 the loop declared them once and overwrote them on each turn.' }
	],
	bug: {
		title: 'Fix go vet issue in daemon/daemon.go',
		repo: 'moby/moby',
		url: `${MOBY}/blob/b958b430aa2bfe72ab93ae2eac72fb73c324c5c8/daemon/daemon.go#L263-L283`,
		fix: `${MOBY}/commit/7315a2bb11325bdab36d0325be5f780414e660a7`,
		lang: 'go',
		code: `for id, c := range containers {
	group.Add(1)
	go func(c *container.Container) {
		defer group.Done()
		_ = sem.Acquire(context.Background(), 1)
		defer sem.Release(1)

		if err := daemon.registerName(c); err != nil {
			logrus.Errorf("Failed to register container name %s: %s", c.ID, err)
			mapLock.Lock()
			delete(containers, id)
			mapLock.Unlock()
			return
		}
		if err := daemon.Register(c); err != nil {
			logrus.Errorf("Failed to register container %s: %s", c.ID, err)
			mapLock.Lock()
			delete(containers, id)
			mapLock.Unlock()
			return
		}`,
		lines: [11, 18],
		diff: ` 				logrus.Errorf("Failed to register container name %s: %s", c.ID, err)
 				mapLock.Lock()
-				delete(containers, id)
+				delete(containers, c.ID)
 				mapLock.Unlock()
 				return`,
		notes: [
			'Line 3 takes `c` as a parameter, so each goroutine gets a copy of the container of its own turn. `id` is not a parameter. Lines 11 and 18 read the one `id` variable of the loop, and the loop keeps writing a new key into it.',
			'Each goroutine first waits on `sem.Acquire` at line 5, so it can run long after the loop has moved on. Say container A fails `registerName` after the loop is done. `id` now holds the last key the loop visited, say C. Line 11 deletes C, a container that registered fine, and A stays in the map with a name that failed to register.',
			'The map is filled with `containers[container.ID] = container`, so `c.ID` is the key of this container. The fix writes `delete(containers, c.ID)`, which reads the parameter of this goroutine. The commit makes the same change on line 18 and drops `id` from the `for` line.',
			'No user reported the bug. The commit message quotes `go vet`: "daemon/daemon.go:273: loop variable id captured by func literal". Since Go 1.22 each turn of a `for` loop gets new variables, but code built with an older Go, as here in January 2019, shares them.'
		]
	},
	quiz: [
		{
			q: 'Containers A, B and C are in the map. The loop has finished when `registerName(A)` fails. Which key does the buggy code delete?',
			options: ['A, the container that failed', 'The key the loop visited last', 'None, `id` is empty after the loop', 'All three, `delete` clears the map'],
			answer: 1,
			why: '`id` is one variable for the whole loop. After the last turn it keeps the last key, and every goroutine that runs later reads that value.'
		},
		{
			q: 'Why is `c` correct inside the goroutine while `id` is not?',
			options: [
				'It is passed as an argument, so each goroutine gets a copy',
				'It is a pointer, and Go never shares pointers',
				'It is read before the goroutine waits on the semaphore',
				'The mutex protects `c`, but not `id`'
			],
			answer: 0,
			why: 'Go evaluates the arguments when `go func(...)(c)` runs, on that turn of the loop. A captured variable is read later, when the goroutine gets to that line.'
		},
		{
			q: 'Which check finds this bug without running the daemon?',
			options: [
				'`go vet`, which reports loop variables captured by func literals',
				'`go test -count=1`, which skips the test cache',
				'`gofmt -l`, which lists files that are not formatted',
				'The race detector, on a normal start with no errors'
			],
			answer: 0,
			why: 'The commit message quotes `go vet` itself: "loop variable id captured by func literal". The race detector only sees code that runs, and a start with no errors never reaches the `delete` lines.'
		}
	],
	recall: {
		q: 'A goroutine started in a `for id, c := range` loop fails and calls `delete(containers, id)` after the loop has ended. Which key does it delete, and what did the fix use instead?',
		a: 'It deletes the last key the loop visited, because before Go 1.22 `id` is one variable for the whole loop. The fix uses `c.ID`, read from the parameter of that goroutine.'
	},
	sources: [
		{ title: 'moby pull request #38497', url: `${MOBY}/pull/38497` },
		{ title: 'Go 1.22 release notes, loop variables', url: 'https://go.dev/doc/go1.22#language' }
	]
};
