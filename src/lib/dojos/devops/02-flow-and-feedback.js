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
		'Now picture one change at a time, each checked within minutes. When latency doubles, **you know exactly which change to look at**.'
	],
	terms: [
		{ term: 'Value stream', def: 'Every step a change goes through, from idea to running in production for users.' },
		{ term: 'The Three Ways', def: 'Gene Kim\'s three principles behind DevOps: flow, feedback, and continual experimentation and learning.' },
		{ term: 'Batch size', def: 'How much change you ship at once. One commit is a small batch. A quarterly release is a huge one.' },
		{ term: 'Work in progress (WIP)', def: 'Work that someone has started and not finished. A WIP limit caps how many items can be in one step at the same time.' }
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
				note: 'The First Way is flow: look at the whole value stream, left to right, across every team. A fast Build step gains nothing if work then waits two weeks in Test. A known defect stays in the step where it was found.'
			},
			{
				add: [
					'prod -.->|"alerts, logs"| build',
					'users -.->|"complaints, usage"| idea'
				],
				highlight: ['prod', 'users'],
				note: 'The Second Way is feedback: alerts, logs and complaints flow right to left, back to the people who can act on them. You make each loop **shorter and harder to miss**, so they fix a mistake while it is still small.'
			},
			{
				add: [
					'ci["CI: lint and tests on every push"]',
					'build -->|"minutes"| ci',
					'ci -.->|"red or green"| build'
				],
				highlight: ['ci'],
				note: 'CI checks every push automatically, and the author gets red or green within minutes, while the change is still fresh in their head. Without a cheap check like this, thirty small changes mean thirty manual checks.'
			},
			{
				add: ['wip["WIP limit: max 3 cards in Build"]', 'wip -.-> build'],
				highlight: ['wip'],
				note: 'With a limit of 3 cards, nobody can juggle ten half-done tasks in Build. DORA\'s advice: when you hit the limit and someone is idle, **keep the limit**. The idle person helps unblock the step that is stuck.'
			},
			{
				add: ['learn["Learn and practice"]', 'prod -.->|"postmortem"| learn', 'learn --> idea'],
				highlight: ['learn'],
				note: 'The Third Way is experimentation and learning: the team takes risks, learns from failures in postmortems, and practices until a task is routine. The team puts time to improve daily work in the plan, so it does not wait for "later".'
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
			'Lines 1 to 5: the workflow runs on **every push and every pull request** to the default branch. `$default-branch` is a template placeholder: GitHub replaces it with your repo\'s default branch name when you create the workflow ([docs](https://docs.github.com/en/actions/how-tos/reuse-automations/create-workflow-templates)). You will learn GitHub Actions in part 5.',
			'Line 10: the first `flake8` call only selects a few serious codes: `E9` (errors such as a file that does not even parse) and `F` codes such as `F82` (undefined names). Those fail the job. These checks are cheap, so the most common mistakes come back in seconds.',
			'Line 12 adds `--exit-zero`: flake8 then exits with status 0 even when it finds problems ([flake8 options](https://flake8.pycqa.org/en/latest/user/options.html)). Style issues show in the log and never fail the job. The team chose **which checks block a merge and which only report**.',
			'Lines 13 to 15 run `pytest` after the lint step. By default a step only runs if all previous steps succeeded ([status check functions](https://docs.github.com/en/actions/reference/workflows-and-actions/expressions)), so a failing lint skips `pytest`. The author sees the lint failure after seconds instead of waiting for the full test suite.'
		]
	},
	tradeoff: {
		gain: [
			'When something breaks, you know which small change to look at, and rolling back one change loses little.',
			'Feedback arrives while the change is still fresh in the author\'s head.',
			'With a WIP limit, started work gets finished, and a stuck step shows up as a full column instead of hiding behind busy people.'
		],
		cost: [
			'Small batches need cheap checks and cheap deploys. Without automation, shipping thirty times costs thirty times the manual effort.',
			'Unfinished features have to ship hidden (feature flags, dark launches), which is extra work and extra code paths.',
			'A WIP limit sometimes leaves people with nothing to start, and the team has to accept that idle time.'
		]
	},
	task: {
		prompt: 'Take the monthly maintenance window from the hook: thirty changes, applied together on Saturday night, latency doubled and nobody knows why. Redesign it using the Three Ways. Name at least one concrete change for flow, one for feedback and one for learning.',
		hint: 'Ask three questions. How can each change travel alone? How soon would you know it hurt latency? What will the team do differently next month?',
		answer: [
			'Flow: stop batching. Apply each change on its own (one kernel update, then the nginx config, then each release), ideally on a schedule of small daily or weekly changes instead of one big window.',
			'Feedback: after each change, check a few key numbers (latency, error rate) before the next one. Automate those checks so the answer comes in minutes. Test config changes in CI before they reach a server.',
			'WIP: do not start the next change until the current one is checked and done.',
			'Learning: hold a short blameless review of the Saturday incident. It ends with a change to the process, for example "each change has a rollback step written before it is applied". It names no one to blame.'
		],
		steps: [
			{
				title: 'Name what went wrong',
				questions: [
					{ q: 'Latency doubled after the Saturday window. Why can nobody say which change did it?', options: ['Nobody looked at the logs', 'Thirty changes went out together, so there are thirty suspects', 'Latency cannot be measured', 'The kernel update hid the others'], answer: 1, why: 'With thirty changes per deploy, an incident has thirty suspects. With one, it has one.' },
					{ q: 'The team rolls back everything. What does that cost?', options: ['Nothing, the changes come back next window', 'Only the kernel update', 'The whole month\'s work, and the next window gets even bigger', 'One day of work'], answer: 2, why: 'A big batch can only be rolled back as a whole, and the delayed work piles into the next batch.' },
					{ q: 'In the chapter\'s words, what is a monthly window of thirty changes?', options: ['A huge batch', 'A small batch', 'A WIP limit', 'A value stream'], answer: 0, why: 'Batch size is how much change you ship at once. Thirty changes at once is a huge batch.' },
					{ q: 'Which of the Three Ways is about getting each change to production on its own?', options: ['Experimentation and learning', 'Feedback', 'Automation', 'Flow'], answer: 3, why: 'The First Way is flow: work moving left to right through the whole value stream.' }
				]
			},
			{
				title: 'Fix the flow',
				questions: [
					{ q: 'What is the first change for flow?', options: ['Move the window to Friday night', 'Apply each change on its own instead of batching them', 'Add more people to the window', 'Freeze all changes for a quarter'], answer: 1, why: 'One change at a time means one suspect when something breaks, and a small rollback.' },
					{ q: 'What schedule fits small batches better than one monthly window?', options: ['Small daily or weekly changes', 'One quarterly window', 'Two monthly windows of fifteen changes', 'Only changes that users request'], answer: 0, why: 'The answer suggests a schedule of small daily or weekly changes instead of one big window.' },
					{ q: 'What WIP rule goes with this?', options: ['Start as many changes as there are engineers', 'Start the next change while the current one deploys', 'Do not start the next change until the current one is checked and done', 'Keep ten changes in progress so nobody waits'], answer: 2, why: 'A WIP limit makes started work finish before new work begins.' },
					{ q: 'Two people have nothing to pick up because of the WIP limit. What does DORA say?', options: ['Raise the limit', 'Give them two tasks each', 'Track their work in a hidden column', 'Keep the limit and have them help unblock the stuck step'], answer: 3, why: 'The limit shows where work is stuck. Raising it hides that stuck step again.' }
				]
			},
			{
				title: 'Shorten the feedback',
				questions: [
					{ q: 'After each change, what do you check before the next one?', options: ['A few key numbers, such as latency and error rate', 'That the change was approved', 'That the server still pings', 'That the window is not over'], answer: 0, why: 'Checking latency and error rate after each change tells you which change hurt them.' },
					{ q: 'How do you make that answer come in minutes?', options: ['Ask users to report problems', 'Automate the checks', 'Check once a week', 'Read every log line by hand'], answer: 1, why: 'The Second Way makes feedback loops shorter and harder to miss. Automated checks do that.' },
					{ q: 'Where can you catch a bad nginx config before it reaches a server?', options: ['In the postmortem', 'In production, during the window', 'In CI, on every push', 'In the monthly report'], answer: 2, why: 'CI checks every push, and the author gets red or green while the change is still fresh.' },
					{ q: 'What is the cost of small batches the chapter warns about?', options: ['They cause more failures', 'They need more servers', 'They make rollbacks impossible', 'They need cheap checks and cheap deploys, or thirty deploys cost thirty times the effort'], answer: 3, why: 'Without automation, shipping thirty times means thirty manual checks.' }
				]
			},
			{
				title: 'Make the team learn',
				questions: [
					{ q: 'Which of the Three Ways covers what the team does after the incident?', options: ['Flow', 'Feedback', 'Experimentation and learning', 'Batch size'], answer: 2, why: 'The Third Way is experimentation and learning, including learning from failures in postmortems.' },
					{ q: 'What kind of review do you hold about the Saturday incident?', options: ['A short blameless review', 'A review that names who caused it', 'No review, the rollback fixed it', 'A review only for managers'], answer: 0, why: 'A blameless review looks for a process change and names no one to blame.' },
					{ q: 'What should that review end with?', options: ['A list of people to retrain', 'A promise to be more careful', 'A bigger window next month', 'A change to the process, such as a written rollback step for each change'], answer: 3, why: 'The review ends with a concrete process change, for example "each change has a rollback step written before it is applied".' },
					{ q: 'How does the team make sure improving daily work does not wait for "later"?', options: ['It improves things only after incidents', 'It puts that time in the plan', 'It asks volunteers to work weekends', 'It waits for a quiet month'], answer: 1, why: 'The team puts time to improve daily work in the plan, so it does not wait for "later".' }
				]
			}
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
			why: 'First Way: flow, left to right. Second Way: feedback loops from right to left, made shorter and harder to miss. Third Way: experimentation and learning.'
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
			why: 'With one change per deploy, an incident has one suspect, and you roll back only that change. With thirty changes per deploy, you have thirty suspects.'
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
			why: 'The limit shows where work is stuck. Raising it, splitting people or hiding work hides that stuck step again.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'See why one change per commit gives an incident one suspect: ship thirty small changes, one of them slow, and find it in a few automatic checks.',
		steps: [
			'Make a repo with a tiny app: `mkdir -p ~/batch-lab && cd ~/batch-lab && git init -q && git config user.name lab && git config user.email lab@localhost && echo \'echo ok\' > app.sh && git add app.sh && git commit -qm start`.',
			'Ship thirty small changes, one commit each. Change 17 quietly adds a 2-second delay, every other change adds a config file: `for i in $(seq 1 30); do if [ "$i" = 17 ]; then echo \'sleep 2\' >> app.sh; else echo "setting $i" > conf-$i.txt; fi; git add -A; git commit -qm "change $i"; done`.',
			'Notice the incident: `time bash app.sh` takes about 2 seconds. Look at it as one big batch: `git diff --stat HEAD~30 | tail -1` shows 30 files changed, and nothing says which one hurt.',
			'Let git test each small change for you. Mark HEAD bad and the start good, then give it the latency check: `git bisect start HEAD HEAD~30`, then `git bisect run bash -c \'SECONDS=0; bash app.sh >/dev/null; [ "$SECONDS" -lt 2 ]\'`.',
			'Read the suspect, end the bisect with `git bisect reset`, and roll back only that change: `git revert --no-edit <sha>` with the sha bisect printed.'
		],
		done: [
			'`git bisect run` prints `<sha> is the first bad commit` and the message `change 17`.',
			'After the revert, `time bash app.sh` returns at once and prints `ok`.',
			'`ls conf-*.txt | wc -l` still shows 29: the other 29 changes stayed in.'
		],
		solution: [
			'Bisect halves the range each time, so it needs about 5 checks for 30 commits instead of 30.',
			'This only works because each commit holds one change and a check runs in a second. With thirty changes in one commit, bisect would point at the whole batch.',
			'In a real pipeline, the latency check runs after each deploy, so you learn about change 17 the day it ships, without bisecting at all.'
		]
	},
	recall: {
		q: 'What are Gene Kim\'s Three Ways, and what does DORA say to do when a team hits its WIP limit?',
		a: 'Flow (left to right), feedback (right to left) and experimentation and learning. Keep the limit and have idle people help unblock the stuck step.'
	},
	sources: [
		{ title: 'Gene Kim, The Three Ways: The Principles Underpinning DevOps', url: 'https://itrevolution.com/articles/the-three-ways-principles-underpinning-devops/' },
		{ title: 'DORA, Working in small batches', url: 'https://dora.dev/capabilities/working-in-small-batches/' },
		{ title: 'DORA, Work in process limits', url: 'https://dora.dev/capabilities/wip-limits/' },
		{ title: 'GitHub docs, Building and testing Python', url: 'https://docs.github.com/en/actions/automating-builds-and-tests/building-and-testing-python' },
		{ title: 'actions/starter-workflows, python-app.yml', url: `${STARTER}/ci/python-app.yml` }
	]
};
