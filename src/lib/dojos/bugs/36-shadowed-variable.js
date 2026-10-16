const GO = 'https://github.com/golang/go';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'shadowed-variable',
	part: 'Logic',
	title: 'The cancel function that stays nil',
	minutes: 10,
	hook: [
		'A `net.Dialer` has an old `Cancel` field: a channel that aborts the dial when it is closed. Take a program that sets it to a channel it closes only at shutdown, sets no `Timeout`, and calls `d.Dial("tcp", addr)` 1,000 times. After the dials have returned, **1,000 goroutines are still parked** inside `net`.',
		'Every dial goes through `dialCtx`. It wraps the context, starts a helper goroutine for `Cancel`, and returns a cleanup function. `DialContext` runs that cleanup with `defer cancel()`.'
	],
	terms: [
		{ term: 'Shadowing', def: 'Declaring a variable in an inner block with the same name as one outside. Inside the block, the name means the new variable, and the outer one is not changed.' },
		{ term: ':=', def: 'Go’s short declaration. In a new block it declares every name on its left, even if a variable with that name exists outside the block.' },
		{ term: 'context.CancelFunc', def: 'The function returned by `context.WithCancel`. Calling it closes the context’s `Done()` channel and frees what waits on it.' }
	],
	bug: {
		title: 'net: cancel2 should not be shadow',
		repo: 'golang/go',
		url: `${GO}/blob/78314e01407678a19b30bc11aba450808686155f/src/net/dial.go#L560-L593`,
		fix: `${GO}/commit/136332571bcc552b9cc3ff8ac44aeb370425e7d7`,
		lang: 'go',
		code: `func (d *Dialer) dialCtx(ctx context.Context) (context.Context, context.CancelFunc) {
	if ctx == nil {
		panic("nil context")
	}
	deadline := d.deadline(ctx, time.Now())
	var cancel1, cancel2 context.CancelFunc
	if !deadline.IsZero() {
		testHookStepTime()
		if d, ok := ctx.Deadline(); !ok || deadline.Before(d) {
			var subCtx context.Context
			subCtx, cancel1 = context.WithDeadline(ctx, deadline)
			ctx = subCtx
		}
	}
	if oldCancel := d.Cancel; oldCancel != nil {
		subCtx, cancel2 := context.WithCancel(ctx)
		go func() {
			select {
			case <-oldCancel:
				cancel2()
			case <-subCtx.Done():
			}
		}()
		ctx = subCtx
	}
	return ctx, func() {
		if cancel1 != nil {
			cancel1()
		}
		if cancel2 != nil {
			cancel2()
		}
	}
}`,
		lines: [16],
		diff: ` 	if oldCancel := d.Cancel; oldCancel != nil {
-		subCtx, cancel2 := context.WithCancel(ctx)
+		var subCtx context.Context
+		subCtx, cancel2 = context.WithCancel(ctx)
 		go func() {`,
		notes: [
			'Line 6 declares `cancel2` for the whole function. Line 16 is inside the `if` block, so its `:=` declares a second `cancel2` that lives only in that block. The goroutine on line 20 calls the inner one. The cleanup function on line 30 reads the outer one, which is still nil.',
			'In the program from the hook, `Dial` passes `context.Background()`, and with no `Timeout` there is no deadline, so `cancel1` stays nil too. The cleanup then calls no function. Each helper goroutine waits for `oldCancel` or `subCtx.Done()`, and neither closes before shutdown. 1,000 dials leave 1,000 goroutines and 1,000 live contexts.',
			'With a `Timeout`, the cleanup calls `cancel1`. `subCtx` is a child of that deadline context, so it is cancelled too, and the goroutine returns. Only dialers with `Cancel` set and no deadline keep the goroutine.',
			'Lines 10 and 11 already use the safe form: `var subCtx context.Context`, then `=`, so `cancel1` is the outer variable. The fix writes line 16 the same way. Someone found the bug by reading the code and reported it in issue [#78531](' + GO + '/issues/78531), "net: dialCtx shadow var".'
		]
	},
	quiz: [
		{
			q: 'After `dialCtx` returns, which `cancel2` does the cleanup function see?',
			options: [
				'The one from line 16, set by `context.WithCancel`',
				'The one from line 6, which is still nil',
				'Both, because Go merges variables with the same name',
				'Neither, the closure gets a copy made at line 26'
			],
			answer: 1,
			why: 'The closure is outside the `if` block, so the name `cancel2` there refers to the variable from line 6. Line 16 assigned a different variable.'
		},
		{
			q: 'Which dialer leaks a goroutine per dial with this code?',
			options: [
				'One with `Timeout` set and `Cancel` set',
				'One with `Timeout` set and no `Cancel`',
				'One with no `Timeout` and no `Cancel`',
				'One with `Cancel` set and no deadline at all'
			],
			answer: 3,
			why: 'Without `Cancel`, no goroutine starts. With a timeout, `cancel1` cancels the parent of `subCtx`, so the goroutine returns. Only `Cancel` with no deadline leaves it waiting.'
		},
		{
			q: 'An outer variable is assigned inside an `if` or `for` block in Go. What should you look for?',
			options: [
				'A `:=` that names it next to a new variable',
				'A `var` declaration placed above the block',
				'A `defer` statement placed inside the block',
				'A `go` statement started inside the block'
			],
			answer: 0,
			why: 'In a new block, `:=` declares all the names on its left, so the outer variable is never written. Here the deadline branch two lines above shows the safe form.'
		}
	],
	recall: {
		q: 'Why does the cleanup in `dialCtx` never call `cancel2`, and how does the fix change line 16?',
		a: 'Line 16 uses `:=` inside the `if` block, so it declares a new `cancel2` and the outer one stays nil. The fix declares `subCtx` with `var` first and assigns both with `=`.'
	},
	sources: [
		{ title: 'go issue #78531', url: `${GO}/issues/78531` },
		{ title: 'The review, CL 762780', url: 'https://go-review.googlesource.com/c/go/+/762780' }
	]
};
