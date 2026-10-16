const OH = 'https://github.com/OpenHands/software-agent-sdk/blob/bf9b6057b00e1b2b532ecff508c0d92d818adced/openhands-sdk/openhands/sdk';
const LOOP = `${OH}/conversation/impl/local_conversation.py`;
const STUCK = `${OH}/conversation/stuck_detector.py`;
const RUNNER = 'https://github.com/anthropics/anthropic-sdk-python/blob/bcd55fe1d3f0f1240765f8cef04295b67337f55a/src/anthropic/lib/tools/_beta_runner.py';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'agent-loop',
	part: 'Tools and agents',
	title: 'The agent loop',
	minutes: 10,
	hook: [
		'You ask an agent to make a failing test pass and go for coffee. It runs `pytest tests/test_dates.py`, reads the error, calls the same tool with the same arguments, gets the same error, and does it again. When you come back, the log shows dozens of identical calls and a bill for every one.',
		'Each call made sense to the model: the last observation still said "test failed", so the next step looked like "try again". **No code outside the model counted the calls or stopped them.**'
	],
	terms: [
		{ term: 'Agent', def: 'Anthropic\'s definition: a system where models "dynamically direct their own processes and tool usage". In code, a model calling tools in a loop until a stop condition holds.' },
		{ term: 'Observation', def: 'What the environment returns after an action: a tool result, a command\'s output, an error. The model reads it before it picks the next action.' },
		{ term: 'Stop condition', def: 'A check outside the model that ends the loop: the task is marked done, an iteration cap or a cost budget is reached, or a repeat pattern is detected.' },
		{ term: 'Stuck pattern', def: 'A sequence in the history that shows no progress, such as the same action with the same observation 4 times in a row (OpenHands\' default).' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['task["User task: make tests/test_dates.py pass"] --> think["Think: the model reads the history and picks a next step"]'],
				highlight: ['task', 'think'],
				note: 'The loop starts with a task from the user, and the model reads the whole history so far and writes its reasoning and a tool call. The ReAct paper (2022) calls this interleaving of "reasoning traces and task-specific actions".'
			},
			{
				add: ['think --> act["Act: tool call, e.g. run pytest"]', 'act --> env[("Environment: files, shell, APIs")]'],
				highlight: ['act', 'env'],
				note: 'Your code runs the tool call (day 17). The action changes something or reads something: a file, a shell command, a web page.'
			},
			{
				add: ['env -->|"observation: output or error"| obs["Observe: the result goes back into the history"]', 'obs --> think'],
				highlight: ['obs'],
				note: 'The result goes back into the context and the model thinks again. Anthropic\'s post says agents must gain "ground truth" from the environment at each step, such as tool results or code execution, to assess progress.'
			},
			{
				add: ['think -->|"finish tool or end_turn"| done["Stop: task done"]', 'cap["Stop checks outside the model: iteration cap, budget, stuck detector"] -.->|"break"| think'],
				highlight: ['done', 'cap'],
				note: 'The model ends the loop when it decides the task is done. Your code ends it when a limit is hit. Anthropic\'s post: "it\'s also common to include stopping conditions (such as a maximum number of iterations) to maintain control."'
			},
			{
				add: ['rep["Same action, same error, 3 times"] -->|"nudge, then STUCK"| cap'],
				highlight: ['rep'],
				note: 'Loops go wrong when the observation does not change the model\'s next choice. The coffee break agent ran one call, got one error, and repeated it. A detector that compares the last few actions and observations can catch this exact repeat.'
			}
		]
	},
	example: {
		title: 'openhands/sdk/conversation/impl/local_conversation.py: the run loop and its stop checks',
		repo: 'OpenHands/software-agent-sdk',
		url: `${LOOP}#L1974-L2085`,
		lang: 'python',
		code: `while True:
    with self._state:
        if self._state.execution_status in [
            ConversationExecutionStatus.PAUSED,
            ConversationExecutionStatus.STUCK,
        ]:
            break

        # Handle stop hooks on FINISHED
        if (
            self._state.execution_status
            == ConversationExecutionStatus.FINISHED
        ):
…
            # No hooks or hooks allowed stopping
            break

        # Check for stuck patterns if enabled
        if self._check_stuck_or_nudge():
            continue
…
            self.agent.step(
                self, on_event=self._on_event, on_token=self._on_token
            )
        iteration += 1
…
        budget_detail = self._budget_exceeded_detail()
        if budget_detail and (
            self._state.execution_status
            != ConversationExecutionStatus.FINISHED
        ):
            self._emit_run_limit_error("MaxBudgetReached", budget_detail)
            break

        if iteration >= self.max_iteration_per_run:
…
            error_msg = (
                f"Agent reached maximum iterations limit "
                f"({self.max_iteration_per_run})."
            )
            logger.error(error_msg)
            self._state.execution_status = ConversationExecutionStatus.ERROR
            self._on_event(
                ConversationErrorEvent(
                    source="environment",
                    code="MaxIterationsReached",
                    detail=error_msg,
                )
            )
            break`,
		notes: [
			'The `break` near the top exits before the next model call when the status is `PAUSED` or `STUCK`. A `FINISHED` status also ends the loop: the agent sets it after the model calls `FinishTool`, whose description says to use it when the task is done or "You cannot proceed further".',
			'`_check_stuck_or_nudge()` runs before every step. When the same tool call with the same arguments has failed 3 times in a row, it first adds a user message: "You\'ve called `{action.tool_name}` with the same arguments {threshold} times in a row and gotten the same error each time". If the next call repeats again, the [stuck detector](' + STUCK + '#L104-L154) sets `STUCK`.',
			'The detector\'s default thresholds: 4 identical action and observation pairs, 3 identical failing calls, 3 agent messages in a row with no user input, and 6 for an alternating pattern. It compares the action, the tool name and the model\'s thought, so a call that changes one character is not a repeat.',
			'The last two checks are limits that do not depend on the model at all: `max_budget_per_run` in dollars (off by default), and `max_iteration_per_run`, 500 by default. Hitting either sets `ERROR` with the code `MaxBudgetReached` or `MaxIterationsReached`.'
		]
	},
	tradeoff: {
		gain: [
			'The model picks each step from real output, so it can handle tasks where the number of steps is unknown in advance. In the ReAct paper, this beat imitation and reinforcement learning methods by 34 and 10 points of success rate on ALFWorld and WebShop.',
			'Checks outside the model put a ceiling on cost: in OpenHands, at most 500 steps per run, plus a dollar budget if you set `max_budget_per_run`, whatever the model decides.'
		],
		cost: [
			'Each step resends the whole history, so the input grows with every observation and so does the price of the next call. Anthropic\'s post names "higher costs, and the potential for compounding errors".',
			'An iteration cap stops a stuck agent late: 500 steps of a stuck agent are 500 model calls, each one resending the history. The Anthropic Python SDK\'s tool runner has `max_iterations=None` by default, so it has no cap unless you pass one.',
			'Exact repeat detection misses a loop that varies: an agent that edits a different line each time and gets the same failing test is not caught by these rules.'
		]
	},
	task: {
		prompt: 'Your agent\'s last six tool calls, oldest first: `run_tests()` returns "FAILED test_parse_date", `edit(file="dates.py", line=12)` returns "ok", and that pair twice more. The edit text and the model\'s thought are identical each time. Which OpenHands rule fires, and what would you add so the loop ends sooner?',
		hint: 'No call returns a tool error, and no two consecutive actions are the same. Count the actions and the observations separately.',
		answer: [
			'The action and error rule does not fire: `run_tests` returns a normal observation that contains a failure message, and the rule counts only tool errors. The identical action rule does not fire either: the actions alternate.',
			'The alternating pattern rule is the one that fires. It takes the last 6 actions and 6 observations and checks that each one equals the one two places earlier: A, B, A, B, A, B. That holds here, so the run stops as `STUCK`.',
			'To stop sooner: give the run a `max_budget_per_run` and a lower `max_iteration_per_run`, such as 30 for a single test fix.',
			'Also make `run_tests` return more detail. If it returns the assertion and the diff, the model has new information after each edit and is less likely to repeat the same one.'
		]
	},
	quiz: [
		{
			q: 'An agent has called the same tool with the same arguments and got the same error 3 times. What does OpenHands do first?',
			options: [
				'It stops the run at once with the status `ERROR` and the code `MaxIterationsReached`',
				'It retries the call with a higher temperature so the model picks other arguments',
				'It adds a user message saying the call failed 3 times and asking for a different approach',
				'It removes the failing tool from the tool list for the rest of the run'
			],
			answer: 2,
			why: '`get_action_error_nudge` returns a nudge when the streak equals the threshold of 3, and `_check_stuck_or_nudge` adds it as a user message. Only if the streak goes past 3 does `is_stuck()` return true and set `STUCK`.'
		},
		{
			q: 'Why does a loop with only "the model decides when it is done" as a stop condition risk running for ever?',
			options: [
				'The model can keep choosing "try again", and no code outside it counts the steps',
				'The API refuses to return `end_turn` while tools are defined in the request',
				'The context window empties after each step, so the model forgets the task',
				'Tool results are hidden from the model, so it never sees that the task is done'
			],
			answer: 0,
			why: 'Each step looks reasonable from inside: the last observation still says the test fails. An iteration cap, a budget or a repeat detector is code outside the model, and it ends the loop whatever the model writes next.'
		},
		{
			q: 'You use the Anthropic Python SDK\'s tool runner and pass no `max_iterations`. What limits the number of loops?',
			options: [
				'A default cap of 500 iterations, the same as OpenHands',
				'A default cap of 10 iterations, set by the API for every tool request',
				'The SDK\'s built-in stuck detector, which stops repeated identical calls',
				'No count: it runs until a stop reason such as `end_turn`, or a reply with no tool call'
			],
			answer: 3,
			why: '`max_iterations` defaults to `None`, and `_should_stop` only checks the count when it is set. The runner otherwise stops on a terminal stop reason like `end_turn`, `max_tokens` or `refusal`, or when the reply has no tool call.'
		}
	],
	recall: {
		q: 'Name the stop checks in the OpenHands run loop, with the default iteration cap.',
		a: 'The model calls `FinishTool` (status `FINISHED`), the stuck detector sets `STUCK` (after a nudge at 3 identical failing calls), the dollar budget `max_budget_per_run`, and `max_iteration_per_run`, 500 by default.'
	},
	sources: [
		{ title: 'Yao et al., ReAct: Synergizing Reasoning and Acting in Language Models, arXiv 2210.03629', url: 'https://arxiv.org/abs/2210.03629' },
		{ title: 'Anthropic, Building effective agents (2024-12-19), read 2026-10-17', url: 'https://www.anthropic.com/engineering/building-effective-agents' },
		{ title: 'OpenHands/software-agent-sdk, stuck_detector.py at bf9b605', url: STUCK },
		{ title: 'OpenHands/software-agent-sdk, local_conversation.py at bf9b605', url: LOOP },
		{ title: 'anthropics/anthropic-sdk-python, _beta_runner.py at bcd55fe (stop reason table)', url: `${RUNNER}#L114-L136` }
	]
};
