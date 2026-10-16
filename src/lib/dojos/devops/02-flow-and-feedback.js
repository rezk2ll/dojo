const STARTER = 'https://github.com/actions/starter-workflows/blob/e3c451d60f119b71caebf13c98ac45da6e15b4b7';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'flow-and-feedback',
	part: 'The DevOps mindset',
	title: 'Small batches, fast feedback',
	minutes: 10,
	hook: [
		'Monthly maintenance window, Saturday night. You apply thirty changes in one go: a kernel update, a new nginx config, two app releases, a firewall rule. Sunday morning, **latency has doubled**.',
		'Which of the thirty did it? You do not know. You roll back everything, lose the month\'s work, and the next window is even bigger.',
		'Now picture one change at a time, each checked within minutes. When latency doubles, **you know exactly which change to look at**. That is the whole idea of today: small batches and fast feedback.'
	],
	terms: [
		{ term: 'Value stream', def: 'Every step a change goes through, from idea to running in production for users.' },
		{ term: 'The Three Ways', def: 'Gene Kim\'s three principles behind DevOps: flow, feedback, and continual experimentation and learning.' },
		{ term: 'Batch size', def: 'How much change you ship at once. One commit is a small batch. A quarterly release is a huge one.' },
		{ term: 'Feedback loop', def: 'The path information takes back to the people who made a change: a failing test, an alert, a user complaint. Shorter is better.' },
		{ term: 'Work in progress (WIP)', def: 'Work that is started but not finished. A WIP limit caps how many items can be in one step at the same time.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: [
					'idea["Idea"] --> build["Build"]',
					'build --> test["Test"]',
					'test --> prod["Run in production"]',
					'prod --> users["Users"]',
					'class users ext'
				],
				highlight: ['idea', 'build', 'test', 'prod'],
				note: '**The First Way: flow.** Look at the whole value stream, left to right, not at one team. A fast Build step is useless if work then waits two weeks in Test. Never pass a known defect downstream.'
			},
			{
				add: [
					'prod -.->|"alerts, logs"| build',
					'users -.->|"complaints, usage"| idea'
				],
				highlight: ['prod', 'users'],
				note: '**The Second Way: feedback.** Information flows right to left, back to the people who can act on it. The goal is to make these loops **shorter and louder**, so mistakes are fixed while they are still small.'
			},
			{
				add: [
					'ci["CI: lint and tests on every push"]',
					'build -->|"minutes"| ci',
					'ci -.->|"red or green"| build'
				],
				highlight: ['ci'],
				note: 'The shortest loop you can build. Every small change is checked automatically and the answer comes back in minutes, not at the end of the month. Small batches only work when checking them is cheap.'
			},
			{
				add: ['wip["WIP limit: max 3 cards in Build"]', 'wip -.-> build'],
				highlight: ['wip'],
				note: 'Start less, finish more. A WIP limit stops people juggling ten half-done tasks. DORA\'s advice: when you hit the limit and someone is idle, **do not raise the limit**. Help unblock the step that is stuck.'
			},
			{
				add: ['learn["Learn and practice"]', 'prod -.->|"postmortem"| learn', 'learn --> idea'],
				highlight: ['learn'],
				note: '**The Third Way: experimentation and learning.** Take risks, learn from failure, and practice until it is routine. Time to improve daily work is planned, not left for "later".'
			}
		]
	},
	example: {
		title: 'ci/python-app.yml',
		repo: 'actions/starter-workflows',
		url: `${STARTER}/ci/python-app.yml#L6-L39`,
		lang: 'yaml',
		code: `on:
  push:
    branches: [ $default-branch ]
  pull_request:
    branches: [ $default-branch ]
…
    - name: Lint with flake8
      run: |
        # stop the build if there are Python syntax errors or undefined names
        flake8 . --count --select=E9,F63,F7,F82 --show-source --statistics
        # exit-zero treats all errors as warnings. The GitHub editor is 127 chars wide
        flake8 . --count --exit-zero --max-complexity=10 --max-line-length=127 --statistics
    - name: Test with pytest
      run: |
        pytest`,
		notes: [
			'The workflow runs on **every push and every pull request** to the default branch. `$default-branch` is a template placeholder: GitHub replaces it with your repo\'s default branch name when you create the workflow ([docs](https://docs.github.com/en/actions/how-tos/reuse-automations/create-workflow-templates)). You will learn GitHub Actions in part 5.',
			'The first `flake8` call only selects a few serious codes: `E9` (errors such as a file that does not even parse) and `F` codes such as `F82` (undefined names). Those fail the job. Cheap checks first, so the most common mistakes come back in seconds.',
			'The second call adds `--exit-zero`: flake8 then exits with status 0 even when it finds problems ([flake8 options](https://flake8.pycqa.org/en/latest/user/options.html)). Style issues are reported, but they never stop the line. Choosing **which feedback blocks and which only informs** is a design decision.',
			'Steps run in order. By default a step only runs if all previous steps succeeded ([status check functions](https://docs.github.com/en/actions/reference/workflows-and-actions/expressions)), so a broken lint skips `pytest`. You get the first failure fast instead of every failure slowly.'
		]
	},
	tradeoff: {
		gain: [
			'When something breaks, you know which small change to look at, and rolling back one change loses little.',
			'Feedback arrives while the change is still fresh in the author\'s head.',
			'Lower WIP means work actually finishes, and blockers become visible instead of hidden behind busy people.'
		],
		cost: [
			'Small batches need cheap checks and cheap deploys. Without automation, shipping thirty times costs thirty times the manual effort.',
			'Unfinished features have to ship hidden (feature flags, dark launches), which is extra work and extra code paths.',
			'WIP limits sometimes leave people waiting. That feels wasteful even when it is the right call.'
		]
	},
	task: {
		prompt: 'Take the monthly maintenance window from the hook: thirty changes, applied together on Saturday night, latency doubled and nobody knows why. Redesign it using the Three Ways. Name at least one concrete change for flow, one for feedback and one for learning.',
		hint: 'Ask three questions. How can each change travel alone? How soon would you know it hurt latency? What will the team do differently next month?',
		answer: [
			'**Flow:** stop batching. Apply each change on its own (one kernel update, then the nginx config, then each release), ideally on a schedule of small daily or weekly changes instead of one big window.',
			'**Feedback:** after each change, check a few key numbers (latency, error rate) before the next one. Automate those checks so the answer comes in minutes. Test config changes in CI before they reach a server.',
			'**WIP:** do not start the next change until the current one is checked and done.',
			'**Learning:** hold a short blameless review of the Saturday incident. The output is a change to the process (for example "each change has a rollback step written before it is applied"), not a person to blame.'
		]
	},
	quiz: [
		{
			q: 'In Gene Kim\'s Three Ways, what is the Second Way about?',
			options: [
				'Making work flow left to right through the whole system',
				'Shortening and amplifying feedback loops from right to left',
				'A culture of continual experimentation and learning',
				'Automating every server with configuration management'
			],
			answer: 1,
			why: 'First Way: flow. Second Way: feedback loops, made shorter and louder. Third Way: experimentation and learning.'
		},
		{
			q: 'Why does shipping in small batches make failures easier to fix?',
			options: [
				'Fewer changes go out at once, so you know which change to look at and can roll back just that one',
				'Small batches never cause failures, because each change is too small to break anything',
				'Small batches can skip the slow test suite, so the fix reaches production sooner',
				'Small batches need fewer servers, so there are fewer places for a failure to hide'
			],
			answer: 0,
			why: 'One change per deploy means one suspect per incident. Thirty changes per deploy means thirty suspects.'
		},
		{
			q: 'Your team has reached its WIP limit in the "In progress" column and two people have nothing to pick up. What does DORA recommend?',
			options: [
				'Raise the WIP limit so they can start new work from the backlog',
				'Give each idle person two tasks to work on in parallel',
				'Keep the limit and have them help unblock the stuck part of the value stream',
				'Track their new work in a separate, hidden column so the limit holds'
			],
			answer: 2,
			why: 'The limit exists to expose bottlenecks. Raising it, splitting people or hiding work all bury the problem the limit just revealed.'
		}
	],
	takeaway: 'Ship less at once and learn sooner. Flow left to right, feedback right to left, and time set aside to learn from both.',
	sources: [
		{ title: 'Gene Kim, The Three Ways: The Principles Underpinning DevOps', url: 'https://itrevolution.com/articles/the-three-ways-principles-underpinning-devops/' },
		{ title: 'DORA, Working in small batches', url: 'https://dora.dev/capabilities/working-in-small-batches/' },
		{ title: 'DORA, Work in process limits', url: 'https://dora.dev/capabilities/wip-limits/' },
		{ title: 'GitHub docs, Building and testing Python', url: 'https://docs.github.com/en/actions/automating-builds-and-tests/building-and-testing-python' },
		{ title: 'actions/starter-workflows, python-app.yml', url: `${STARTER}/ci/python-app.yml` }
	]
};
