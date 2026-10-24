const KEP = 'https://github.com/kubernetes/enhancements/blob/6ebe0a94771723b3f27cb4a757f0cc22f29e38a2/keps/sig-node/4781-kublet-restart-pod-status';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'design-review',
	part: "The architect's job",
	title: 'Reviewing a design: scenarios, doors, failures',
	minutes: 10,
	hook: [
		'A teammate sends you a design doc and asks for a review. The easy comments come first: rename this field, fix a typo in the title, add a diagram. **None of them changes what the system does.**',
		'An architecture review looks for three things: the scenarios the design hurts (day 3), the parts that are **one-way doors** (day 5), and the ways it fails (day 15).',
		'You write each point as a question, because the author knows things you do not. The doc here is real: Kubernetes KEP-4781, still **provisional** at this commit. The change has since shipped in Kubernetes 1.35, so read it as the proposal it was, when a review cost the least.'
	],
	terms: [
		{ term: 'Design review', def: 'Reading a proposal to find the decisions that are expensive to change, like a default behavior other teams build on.' },
		{ term: 'KEP', def: 'Kubernetes Enhancement Proposal: the design doc a change to Kubernetes goes through, with a fixed template and a status (provisional, implementable, implemented).' },
		{ term: 'Failure mode', def: 'One specific way it breaks: what fails, what the user sees, how it recovers.' },
		{ term: 'Blocking question', def: 'A question that must be answered before the design is accepted. Mark it, so the author finds it among the small ones.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['kep["KEP-4781: keep pod status across kubelet restarts"]'],
				highlight: ['kep'],
				note: 'The design: before this KEP, when the kubelet (the agent on each node) restarts, it resets its containers to not Ready until their probes pass again. The KEP calls it a "Not Ready" storm, and proposes to **keep the last known status** instead.'
			},
			{
				add: ['kep --> sc["Scenarios: who does this hurt?"]'],
				highlight: ['sc'],
				note: 'Walk through the scenarios that matter (day 3), including the unhappy ones: an app that hangs while the kubelet is down, a node down for minutes, a clock that is off.'
			},
			{
				add: ['kep --> door["One-way doors: what is hard to undo?"]'],
				highlight: ['door'],
				note: 'Find the contracts (day 5): what other teams build against, like an API or a default behavior. Pod readiness decides where traffic goes. Once the new behavior is the default and the old one is gone, everyone builds on it.'
			},
			{
				add: ['kep --> fail["Failure modes: what if a step dies or repeats?"]'],
				highlight: ['fail'],
				note: 'For each step, ask: what if a dependency is down, or the step runs at the wrong time (day 15)? The KEP template asks these questions itself. Look for the ones left blank.'
			},
			{
				add: ['q["Short list of questions, blocking ones marked"]', 'sc --> q', 'door --> q', 'fail --> q'],
				highlight: ['q'],
				note: 'The review produces a **short list of questions**, with the blocking ones marked. With five questions, the author sees the blocking one at once. Among thirty comments, the author can miss it.'
			}
		]
	},
	example: {
		title: 'keps/sig-node/4781-kublet-restart-pod-status/README.md (excerpt)',
		repo: 'kubernetes/enhancements',
		url: `${KEP}/README.md#L105-L370`,
		lang: 'md',
		code: `### Risks and Mitigations

##### Inconsistency with other Kubernetes components
If other parts of Kubernetes (e.g., the API server, controllers) expect certain behavior regarding container readiness states, these changes might cause inconsistencies.

##### Delayed Health Check Updates
By preserving the old state without immediate health checks, there is a delay in recognizing containers that have become unhealthy during or after kubelet's downtime. Services relying on Pod readiness for service discovery might continue directing traffic to Pods with containers that are no longer healthy but are still reported as Ready.
…
### Troubleshooting

###### How does this feature react if the API server and/or etcd is unavailable?

###### What are other known failure modes?`,
		notes: [
			'Lines 6 and 7: the KEP names its own biggest risk. Traffic can go to a pod that is reported Ready but is no longer healthy. Many design docs never write down their downside, so say in your review that this one does.',
			'Lines 9 to 13 come from the KEP template, which asks about rollback, version skew, metrics and failure modes. **Your questions go where the answers are empty.** Here, both Troubleshooting questions (lines 11 and 13) have no answer.',
			`Read the design literally. [Line 119](${KEP}/README.md#L119) says the kubelet will get the \`Started\` field "via the API server" after a restart. The question on line 368, what if the API server is down, has no answer yet.`,
			`[Read the whole KEP](${KEP}/README.md) before the task. It is under 400 lines, and much of it is template comments, so it takes about 10 minutes.`
		]
	},
	tradeoff: {
		gain: [
			'You find the one-way doors while they are text in a doc, before the kubelet behaves that way in production.',
			'Questions leave the author owning the design and bring you the context you were missing.',
			'The review thread records which risks the team considered.'
		],
		cost: [
			'A good review takes an hour of careful reading, out of your own work time.',
			'A doc review misses what only the code shows. Some questions only appear in the PR.',
			'In a list of thirty questions, the author can miss the blocking one unless you mark it.'
		]
	},
	task: {
		prompt: 'Read KEP-4781. Write **one question per lens**: a scenario it hurts, a one-way door, a failure mode. Mark which one, if any, should block acceptance.',
		hint: 'Compare line 115 (what the feature gate does by default) with line 201 (what it takes to reach GA). Then read line 119 next to line 368, and line 249.',
		answer: [
			'Scenario: an app hangs while the kubelet is down. Line 125 says its status is fixed "in the next probe cycle". Given the probe\'s period and failure threshold, how long can a pod that broke during the restart keep getting traffic? Should the doc state the worst case?',
			'One-way door: on line 115, the new behavior is on by default from the first release, and the gate only restores the old one. Line 201: GA needs only "no issues reported by users". Once the gate is removed, the old behavior is gone for everyone. What evidence, beyond silence, moves it to GA?',
			'Failure mode: on line 119, after a restart the kubelet takes `Started` from the API server. Line 368 asks what happens if the API server is unavailable, and is blank. Does the kubelet fall back to the old reset, or keep stale status?',
			'Blocking: the failure-mode question, together with line 249, where "What specific metrics should inform a rollback?" is `N/A`. A change to a default that steers traffic needs a known fallback and a signal to roll back. I would ask for both before the KEP moves to implementable.',
			'Non-blocking, worth asking: line 147 uses a 10-second tolerance for clock skew. What happens on a node whose clock is off by more?'
		],
		steps: [
			{
				title: 'Read what the KEP changes',
				questions: [
					{ q: 'Before this KEP, what does the kubelet do to containers when it restarts?', options: ['Keeps their last known status', 'Resets them to not Ready until their probes pass again', 'Restarts every container on the node', 'Asks the API server for their status'], answer: 1, why: 'The KEP calls the result a "Not Ready" storm, and that is what it wants to stop.' },
					{ q: 'What does the KEP propose instead?', options: ['Keep the last known status across the restart', 'Skip probes for the first minute', 'Remove readiness probes from pods', 'Restart the kubelet less often'], answer: 0, why: 'The title says it: keep pod status across kubelet restarts.' },
					{ q: 'Which risk does the KEP itself name?', options: ['The kubelet may crash more often', 'Pods may restart twice', 'Clocks may drift between nodes', 'Traffic can go to a pod reported Ready but no longer healthy'], answer: 3, why: 'Its "Delayed Health Check Updates" section says so. Credit the doc for writing its own downside.' },
					{ q: 'Where do your questions belong first?', options: ['In the typos and field names', 'In the diagrams', 'Where the template\'s answers are empty', 'In the list of e2e tests'], answer: 2, why: 'The KEP template asks about rollback, skew, metrics and failure modes. A blank answer is where the review starts.' }
				]
			},
			{
				title: 'Ask a scenario it hurts',
				questions: [
					{ q: 'Which scenario does this design hurt?', options: ['An app that hangs while the kubelet is down', 'A pod that starts for the first time', 'A node that never restarts its kubelet', 'A container with no readiness probe'], answer: 0, why: 'Its status is kept as Ready, so it keeps getting traffic until a probe notices.' },
					{ q: 'According to line 125, when is that pod\'s status fixed?', options: ['Immediately after the kubelet starts', 'When the API server notices', 'Never, until the pod restarts', 'In the next probe cycle'], answer: 3, why: 'The status is corrected by the probes, so the delay depends on how the probe is set up.' },
					{ q: 'What decides how long a broken pod can keep getting traffic?', options: ['The number of nodes in the cluster', 'The probe\'s period and failure threshold', 'The size of the container image', 'The feature gate\'s name'], answer: 1, why: 'A probe must fail enough times, at its period, before the pod is marked not Ready.' },
					{ q: 'How do you phrase this point in the review?', options: ['"This is wrong, revert it."', '"Add a diagram here."', '"How long can such a pod keep getting traffic? Should the doc state the worst case?"', '"Please rename the gate."'], answer: 2, why: 'A question brings the author\'s context in, and still surfaces the problem if you are right.' }
				]
			},
			{
				title: 'Find the one-way door',
				questions: [
					{ q: 'On line 115, what does the feature gate do by default?', options: ['Turns the new behavior on from the first release', 'Keeps the old behavior until GA', 'Asks each cluster admin to choose', 'Turns the new behavior on only for new nodes'], answer: 0, why: 'The new behavior is the default, and the gate only restores the old one.' },
					{ q: 'Why is this a one-way door?', options: ['The gate name cannot change', 'Nodes cannot be downgraded', 'Once the gate is removed, the old behavior is gone for everyone', 'The KEP cannot go back to provisional'], answer: 2, why: 'Pod readiness decides where traffic goes, and others build on it. Without the gate, nobody can switch back.' },
					{ q: 'Line 201: what does GA need?', options: ['A full set of e2e tests and a metric', 'Two releases with the gate on by default', 'A sign-off from every SIG', '"No issues reported by users"'], answer: 3, why: 'That is the bar the KEP sets, and silence is weak evidence for a default that steers traffic.' },
					{ q: 'Which question do you ask about it?', options: ['Can the gate get a shorter name?', 'What evidence, beyond silence, moves it to GA?', 'Can GA happen one release earlier?', 'Who wrote the feature gate?'], answer: 1, why: 'It asks for a real signal before the door closes for everyone.' }
				]
			},
			{
				title: 'Find a failure mode and mark the blocker',
				questions: [
					{ q: 'Line 119: after a restart, where does the kubelet get `Started`?', options: ['From its local disk', 'From the container runtime only', 'From the API server', 'From the probes'], answer: 2, why: 'The KEP says the kubelet gets it "via the API server", so the API server becomes a dependency of the restart.' },
					{ q: 'Line 368 asks what happens if the API server is unavailable. What does it say?', options: ['The kubelet waits for it', 'The kubelet uses the old reset', 'Nothing: the answer is blank', 'The kubelet keeps stale status'], answer: 2, why: 'The question is in the template and has no answer yet. That gap is your failure-mode question.' },
					{ q: 'Which question should block acceptance?', options: ['The clock skew tolerance on line 147', 'The probe cycle timing from line 125', 'The folder name typo "kublet"', 'The API server failure mode, with line 249\'s `N/A` rollback metrics'], answer: 3, why: 'A change to a default that steers traffic needs a known fallback and a signal to roll back before it moves to implementable.' },
					{ q: 'Why mark the blocking question?', options: ['So the author finds it among the small ones', 'Because the template requires a label', 'So the other questions can be ignored', 'To speed up the merge'], answer: 0, why: 'In a list of thirty comments the author can miss it. Marked, it stands out at once.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Which comment is an **architecture** review comment?',
			options: ['Rename the feature gate to something shorter, it is hard to type in flags', 'Fix the typo "kublet" in the folder name before this gets merged', 'Add a table of contents so reviewers can jump to each section', 'If the API server is down when the kubelet restarts, which status does a pod get?'],
			answer: 3,
			why: 'It names a failure mode with a user-visible effect (traffic to the wrong pods, or a not-Ready storm). The others are style: worth fixing, cheap to change later.'
		},
		{
			q: 'Why phrase review points as questions?',
			options: ['Only to be polite, since the author decides what changes in the end anyway', 'The author may have context you lack. A question gets it or exposes the gap, without a fight', 'Questions do not need an answer, so the author can skip the minor ones', 'The KEP template requires every review point to be written as a question'],
			answer: 1,
			why: 'You might be wrong. A question costs nothing if you are, and still surfaces the problem if you are right.'
		},
		{
			q: 'In KEP-4781, which part is the most **one-way**?',
			options: ['Changing default readiness behavior that routing depends on, once the opt-out gate is removed', 'The 10-second clock skew tolerance in the kubelet, since nodes depend on it', 'The list of e2e test cases, since the CI jobs are built around each of them', 'The unit test coverage numbers, since they are reported in the KEP itself'],
			answer: 0,
			why: 'Other components and users build on how readiness behaves. Once the old behavior cannot be switched back on, changing it again means a new proposal and a new migration. The clock skew value, the tests and the coverage numbers are internal, and a later PR can change them.'
		}
	],
	recall: {
		q: 'What does an architecture review of KEP-4781 look for, and in what form do you write each point?',
		a: 'The scenarios it hurts, the one-way doors (the new default readiness behavior once the gate is removed), and the failure modes (the API server down when the kubelet restarts). Each point is a question, and the blocking ones are marked.'
	},
	sources: [
		{ title: 'KEP-4781, Restarting kubelet does not change pod status (provisional)', url: `${KEP}/README.md` },
		{ title: 'KEP-4781, kep.yaml (status and feature gate)', url: `${KEP}/kep.yaml` },
		{ title: 'Kubernetes v1.35.0, ChangeContainerStatusOnKubeletRestart feature gate', url: 'https://github.com/kubernetes/kubernetes/blob/66452049f3d692768c39c797b21b793dce80314e/pkg/features/kube_features.go#L1189-L1192' },
		{ title: 'Kubernetes enhancements, KEP template', url: 'https://github.com/kubernetes/enhancements/blob/6ebe0a94771723b3f27cb4a757f0cc22f29e38a2/keps/NNNN-kep-template/README.md' },
		{ title: 'Malte Ubl, Design Docs at Google', url: 'https://www.industrialempathy.com/posts/design-docs-at-google/' }
	]
};
