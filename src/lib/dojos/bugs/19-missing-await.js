const HA = 'https://github.com/home-assistant/core';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'missing-await',
	part: 'State and time',
	title: 'A missing await on asyncio.gather',
	minutes: 10,
	hook: [
		'A Home Assistant user writes an automation that runs when Home Assistant shuts down. It toggles a switch helper. The issue says: "Although the automation definitely runs, the action of toggling an `input_boolean` helper does not persist after a HA restart."',
		'Shutdown runs in two stages. Stage 1 starts the registered shutdown jobs and should give them up to 20 seconds (`STOPPING_STAGE_SHUTDOWN_TIMEOUT`) to finish. Stage 2 then stops the integrations. No error or warning shows up in the log.'
	],
	terms: [
		{ term: 'Coroutine', def: 'A function defined with `async def`. Calling it does not run it to the end; something has to `await` it or schedule it.' },
		{ term: 'asyncio.gather', def: 'Takes several tasks and returns one future that completes when all of them are done. Code waits for it with `await`.' },
		{ term: 'Future', def: 'An object for a result that will exist later. `await future` pauses the caller until the result is there.' }
	],
	bug: {
		title: 'Fix missing await when running shutdown jobs (#106632)',
		repo: 'home-assistant/core',
		url: `${HA}/blob/7702f971fbb6e89d6510c716352fd08d2e85d1f0/homeassistant/core.py#L882-L898`,
		fix: `${HA}/commit/a4e9a053c7b3a79f8222d0798d0cd9247cfdb7eb`,
		lang: 'python',
		code: `# Stage 1 - Run shutdown jobs
try:
    async with self.timeout.async_timeout(STOPPING_STAGE_SHUTDOWN_TIMEOUT):
        tasks: list[asyncio.Future[Any]] = []
        for job in self._shutdown_jobs:
            task_or_none = self.async_run_hass_job(job.job, *job.args)
            if not task_or_none:
                continue
            tasks.append(task_or_none)
        if tasks:
            asyncio.gather(*tasks, return_exceptions=True)
except asyncio.TimeoutError:
    _LOGGER.warning(
        "Timed out waiting for shutdown jobs to complete, the shutdown will"
        " continue"
    )
    self._async_log_running_tasks("run shutdown jobs")`,
		lines: [11],
		diff: `                 if tasks:
-                    asyncio.gather(*tasks, return_exceptions=True)
+                    await asyncio.gather(*tasks, return_exceptions=True)
         except asyncio.TimeoutError:`,
		notes: [
			'Line 11 calls `asyncio.gather(...)`, which returns a future right away. Without `await`, nothing waits for it. The `async with` block of line 3 ends a moment after the jobs start, and `async_stop` goes on to stage 2 while the jobs are still running.',
			'The block allows 20 seconds, but no line inside it pauses. So line 13 never logs "Timed out waiting for shutdown jobs to complete", even when a job is slow. The only sign is the missing result, here the `input_boolean` state that was not kept.',
			'A coroutine that is never awaited makes Python print "coroutine ... was never awaited". `gather` returns a future, and the tasks inside it are already scheduled. Python has no dropped coroutine object to report.',
			'With the fix, `await asyncio.gather(...)` pauses `async_stop` until every job is done or the 20 seconds run out. `return_exceptions=True` keeps one failing job from stopping the wait for the others.',
			'A user opened [issue #106606](' + HA + '/issues/106606), "Home Assistant shutdown trigger still not working", on version 2024.1.0b1. The pull request that fixed it links that issue.'
		]
	},
	quiz: [
		{
			q: 'A shutdown job takes 5 seconds. With the buggy code, when does stage 2 start?',
			options: ['After 5 seconds, when the job is done', 'Right away, while the job still runs', 'After 20 seconds, when the timeout ends', 'Never, the shutdown hangs on the job'],
			answer: 1,
			why: 'Nothing in the block waits for the future that gather returns. The block exits as soon as the tasks are scheduled.'
		},
		{
			q: 'Why did Python not print "coroutine was never awaited" for this line?',
			options: [
				'gather returns a future, and its tasks are already scheduled',
				'Home Assistant hides every RuntimeWarning in production',
				'return_exceptions=True silences the warning',
				'The warning only appears when a task raises an error'
			],
			answer: 0,
			why: 'That warning is about coroutine objects that are created and dropped. gather wraps the jobs in scheduled tasks and returns a future, so there is no dropped coroutine.'
		},
		{
			q: 'How would a test catch this bug?',
			options: [
				'Check that the shutdown timeout constant is 20',
				'Register a job that sleeps, then check it finished before stage 2',
				'Check that async_stop returns None',
				'Call async_stop twice and check the second call is ignored'
			],
			answer: 1,
			why: 'The bug only shows when a job takes time. A job that sleeps briefly and sets a flag, checked when stage 2 begins, fails with the missing await and passes with the fix.'
		}
	],
	recall: {
		q: 'Stage 1 wraps the shutdown jobs in a 20 second timeout. Why did stage 2 start before the jobs finished, with no timeout warning?',
		a: 'Line 11 called `asyncio.gather(...)` without `await`, so nothing in the block paused. The fix adds `await`, and `async_stop` now waits for the jobs for up to 20 seconds.'
	},
	sources: [
		{ title: 'home-assistant pull request #106632', url: `${HA}/pull/106632` },
		{ title: 'Issue #106606: shutdown trigger still not working', url: `${HA}/issues/106606` }
	]
};
