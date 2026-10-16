const HA = 'https://github.com/home-assistant/core';
const PR = `${HA}/pull/141969`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'leaked-task',
	part: 'Resources',
	title: 'An OAuth task still waiting at shutdown',
	minutes: 10,
	hook: [
		'In Home Assistant, a user starts to add an integration that logs in with OAuth, such as SmartThings. Home Assistant sends them to the external login site. They close that page without logging in, then restart Home Assistant.',
		'The restart logs a warning: **"Task <Task pending name=\'Task-304\' coro=<CloudOAuth2Implementation.async_generate_authorize_url.<locals>.await_tokens() ...> was still running after final writes shutdown stage"**. The snippet below is `async_generate_authorize_url`, the method that started that task on line 24.'
	],
	terms: [
		{ term: 'OAuth', def: 'A login flow where the user signs in on another site, and that site then hands tokens back to the app.' },
		{ term: 'Tracked task', def: 'A task made with `hass.async_create_task`. Home Assistant keeps it in its `_tasks` set. If it is still running at the last shutdown stage, Home Assistant logs a warning and cancels it.' },
		{ term: 'Background task', def: 'A task made with `hass.async_create_background_task`. Its docstring says it "Will be automatically cancelled on shutdown".' }
	],
	bug: {
		title: 'Fix warning about unfinished oauth tasks on shutdown (#141969)',
		repo: 'home-assistant/core',
		url: `${HA}/blob/253293c986de7e0d154ff6234ba1f7605ac564af/homeassistant/components/cloud/account_link.py#L107-L132`,
		fix: `${HA}/commit/2305cb0131bb8a997199cfaa09f418d817ad39b0`,
		lang: 'python',
		code: `async def async_generate_authorize_url(self, flow_id: str) -> str:
    """Generate a url for the user to authorize."""
    helper = account_link.AuthorizeAccountHelper(
        self.hass.data[DATA_CLOUD], self.service
    )
    authorize_url = await helper.async_get_authorize_url()

    async def await_tokens() -> None:
        """Wait for tokens and pass them on when received."""
        try:
            tokens = await helper.async_get_tokens()

        except TimeoutError:
            _LOGGER.info("Timeout fetching tokens for flow %s", flow_id)
        except account_link.AccountLinkException as err:
            _LOGGER.info(
                "Failed to fetch tokens for flow %s: %s", flow_id, err.code
            )
        else:
            await self.hass.config_entries.flow.async_configure(
                flow_id=flow_id, user_input=tokens
            )

    self.hass.async_create_task(await_tokens())

    return authorize_url`,
		lines: [24],
		diff: `                 )

-        self.hass.async_create_task(await_tokens())
+        # It's a background task because it should be cancelled on shutdown and there's nothing else
+        # we can do in such case. There's also no need to wait for this during setup.
+        self.hass.async_create_background_task(
+            await_tokens(), name="Awaiting OAuth tokens"
+        )

         return authorize_url`,
		notes: [
			'Line 11 waits on `helper.async_get_tokens()`. The task ends when tokens arrive, when the wait times out (line 13), or when the link fails (line 15). Tokens only come after the user logs in on the other site, and closing the page triggers none of these three cases.',
			'Line 24 starts the task with `hass.async_create_task`, so it is a tracked task. When Home Assistant stops, it first cancels every background task. Tracked tasks keep running through the stop and final write stages. At the close stage, `async_stop` finds `await_tokens()` still pending, logs the warning from the hook and only then cancels it.',
			'The fix replaces line 24 with `async_create_background_task`. That call puts the same coroutine in the set of tasks that Home Assistant cancels at the start of shutdown. The new comment gives the reason: "it should be cancelled on shutdown and there\'s nothing else we can do in such case."',
			'The author of [pull request #141969](' + PR + ') wrote the steps to reproduce it: "Start authentication with integration using OAuth (e.g. SmartThings)", "When redirected to external login site, just close the page", then "Restart Home Assistant".'
		]
	},
	quiz: [
		{
			q: 'The user closed the login page. What is the `await_tokens()` task doing when Home Assistant restarts?',
			options: [
				'It has finished and logged a timeout',
				'It is still waiting in `async_get_tokens()`',
				'It is retrying the login in a loop',
				'It was cancelled when the page closed'
			],
			answer: 1,
			why: 'The task ends on tokens, a timeout or a link error. Closing the page is none of them, and the warning in the report shows the task still pending.'
		},
		{
			q: 'Why was this task not cancelled at the start of shutdown?',
			options: [
				'It held a lock that the shutdown code needed',
				'It was a tracked task, not a background task',
				'It caught `CancelledError` and kept running',
				'It started a new flow while shutdown was running'
			],
			answer: 1,
			why: 'Home Assistant cancels background tasks as soon as it stops. A tracked task stays alive until the close stage, where it gets the warning and is cancelled.'
		},
		{
			q: 'You start a task that waits for something outside your control. What should you decide when you create it?',
			options: [
				'Which thread it should run on',
				'How many times to log its result',
				'Who cancels it if the event never comes',
				'Whether it should be given a name'
			],
			answer: 2,
			why: 'A task waiting on a user or a remote service can wait longer than the app runs. Someone has to cancel it, on shutdown or after a deadline.'
		}
	],
	recall: {
		q: 'Which call did the fix use so that Home Assistant cancels the OAuth wait at the start of shutdown?',
		a: '`hass.async_create_background_task` instead of `hass.async_create_task`. Background tasks are cancelled as soon as Home Assistant stops. A tracked task runs until the close stage, which logs the "still running" warning.'
	},
	sources: [
		{ title: 'home-assistant/core pull request #141969', url: PR },
		{ title: 'The fix commit', url: `${HA}/commit/2305cb0131bb8a997199cfaa09f418d817ad39b0` }
	]
};
