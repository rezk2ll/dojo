const GIT = 'https://github.com/git/git';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'out-of-order',
	part: 'State and time',
	title: 'Two signal handlers, pushed in the wrong order',
	minutes: 10,
	hook: [
		'During `git push`, the server runs the `pre-receive` hook and writes the list of updated refs to its stdin. Git’s test suite has a hook that exits without reading that input (test t5401.13, "pre-receive hook that forgets to read its input"). After the hook code moved to `run_processes_parallel()`, this test **started failing on the NonStop platform**.',
		'Writing to a pipe whose reader has exited raises `SIGPIPE`. Git means to ignore it here, and pushes `SIG_IGN` for it. The snippet shows two functions that push a handler for `SIGPIPE`, and the order they run in.'
	],
	terms: [
		{ term: 'SIGPIPE', def: 'The signal a process gets when it writes to a pipe that nobody reads any more. By default it kills the process.' },
		{ term: 'sigchain', def: 'Git’s stack of signal handlers. `sigchain_push` puts a handler on top, `sigchain_pop` removes the top one. When a signal arrives, the handler on top runs.' },
		{ term: '`sigchain_push_common`', def: 'Pushes the same handler for SIGINT, SIGHUP, SIGTERM, SIGQUIT and SIGPIPE.' }
	],
	bug: {
		title: 'run_processes_parallel(): fix order of sigpipe handling',
		repo: 'git/git',
		url: `${GIT}/blob/26c27dd3db0e1386fe541ebd7aae001c722e5c10/run-command.c#L1548-L1937`,
		fix: `${GIT}/commit/2226ffaacd93d3fe5554687a70d9190d72596f96`,
		lang: 'c',
		code: `static void handle_children_on_signal(int signo)
{
\tkill_children_signal(pp_for_signal, signo);
\tsigchain_pop(signo);
\traise(signo);
}

static void pp_init(struct parallel_processes *pp,
\t\t    const struct run_process_parallel_opts *opts,
\t\t    struct parallel_processes_for_signal *pp_sig)
{
\tconst size_t n = opts->processes;
…
\tpp_sig->pp = pp;
\tpp_sig->opts = opts;
\tpp_for_signal = pp_sig;
\tsigchain_push_common(handle_children_on_signal);
}
…
void run_processes_parallel(const struct run_process_parallel_opts *opts)
{
…
\t/*
\t * Child tasks might receive input via stdin, terminating early (or not), so
\t * ignore the default SIGPIPE which gets handled by each feed_pipe_fn which
\t * actually writes the data to children stdin fds.
\t */
\tsigchain_push(SIGPIPE, SIG_IGN);

\tpp_init(&pp, opts, &pp_sig);
\twhile (1) {
…
\t}

\tpp_cleanup(&pp, opts);

\tsigchain_pop(SIGPIPE);
…
}`,
		lines: [30, 35],
		diff: `+\tpp_init(&pp, opts, &pp_sig);
+
 \t/*
 …
 \tsigchain_push(SIGPIPE, SIG_IGN);

-\tpp_init(&pp, opts, &pp_sig);
 \twhile (1) {
 …
-\tpp_cleanup(&pp, opts);
-
 \tsigchain_pop(SIGPIPE);

+\tpp_cleanup(&pp, opts);
+`,
		notes: [
			'**The last push wins.** `sigchain_push(SIGPIPE, SIG_IGN)` runs first. Then `pp_init` calls `sigchain_push_common`, which puts `handle_children_on_signal` on top of it. When SIGPIPE arrives, the handler on top runs, not `SIG_IGN`.',
			'**What happens on SIGPIPE.** The hook exits without reading. Git writes to its stdin and gets SIGPIPE. `handle_children_on_signal` calls `kill()` on the children, pops itself, and calls `raise()`. The raised signal now meets `SIG_IGN` and is ignored, so git survives, but it has just tried to kill the hook. The commit: "a hook that exits without reading all of its input will cause us to get SIGPIPE, which will put us in a signal handler that then tries to kill() that same child."',
			'**Why only NonStop failed.** On Linux the child has already exited, and the `kill()` "does not affect the exit status of the process". The commit says this "seems not to be true on all platforms", and t5401.13 failed on NonStop. With several children, one early exit would make git "kill() all of the children (which might still actually be running)". The hook API does not run hooks in parallel yet, so no test covers that case.',
			'**The fix.** Call `pp_init()` first, then push `SIG_IGN`, so `SIG_IGN` is on top while git feeds the children. At the end, `sigchain_pop(SIGPIPE)` now comes before `pp_cleanup()`, so each pop removes the handler pushed last. The commit credits the report to Randall S. Becker.'
		]
	},
	quiz: [
		{
			q: 'In the buggy code, SIGPIPE arrives while git writes to a hook. Which handler runs first?',
			options: [
				'`SIG_IGN`, because it was pushed for SIGPIPE explicitly',
				'`handle_children_on_signal`, because it was pushed last',
				'The default action, which ends the git process',
				'Both at once, in the order they were pushed'
			],
			answer: 1,
			why: 'The sigchain is a stack. `pp_init` pushes its handler after `SIG_IGN`, so it sits on top and runs first.'
		},
		{
			q: 'Why did the test pass on Linux even with the bug?',
			options: [
				'Linux never sends SIGPIPE to a process writing to a pipe',
				'The hook had already exited, so the `kill()` changed nothing',
				'Linux runs the handlers from the bottom of the stack',
				'The test is skipped on Linux by the test suite'
			],
			answer: 1,
			why: 'The hook was gone, only not yet reaped by `wait()`. Killing it did not change its exit status on Linux.'
		},
		{
			q: 'Two pieces of setup each push a handler for the same signal. What decides which one handles it?',
			options: [
				'The handler with the more specific signal list',
				'The order of the pushes: the last one is on top',
				'The handler that was registered by the caller',
				'The order in which the handlers were written in the file'
			],
			answer: 1,
			why: 'With a stack of handlers, the push order is the only thing that matters. Here that meant calling `pp_init()` before pushing `SIG_IGN`.'
		}
	],
	takeaway: 'When a function you call installs its own handler for a signal, your override has to come after that call, and your pops should undo the pushes in reverse order. Check what each setup call pushes before you place yours.',
	sources: [
		{ title: 'git commit 2226ffaac', url: `${GIT}/commit/2226ffaacd93d3fe5554687a70d9190d72596f96` }
	]
};
