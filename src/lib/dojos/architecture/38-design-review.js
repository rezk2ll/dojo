const KEP = 'https://github.com/kubernetes/enhancements/blob/6ebe0a94771723b3f27cb4a757f0cc22f29e38a2/keps/sig-node/4781-kublet-restart-pod-status';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'design-review',
	part: "The architect's job",
	title: 'Reviewing a design: scenarios, doors, failures',
	minutes: 10,
	hook: [
		'A teammate sends you a design doc and asks for a review. The easy comments come first: rename this field, fix a typo in the title, add a diagram. All fair. **None of them changes what the system does.**',
		'An architecture review reads for three things only: which **scenarios** the design hurts, which parts are **one-way doors**, and how it **fails**. Days 3, 5 and 15 in one pass.',
		'And you write them as **questions**, not verdicts. The author knows things you do not. Today\'s doc is real: Kubernetes KEP-4781, still **provisional** at this commit. The change has since shipped in Kubernetes 1.35, so read it as the proposal it was, when a review was cheapest.'
	],
	terms: [
		{ term: 'Design review', def: 'Reading a proposal for the decisions that are expensive to change. Not for style, not for wording.' },
		{ term: 'KEP', def: 'Kubernetes Enhancement Proposal: the design doc a change to Kubernetes goes through, with a fixed template and a status (provisional, implementable, implemented).' },
		{ term: 'Failure mode', def: 'One specific way it breaks: what fails, what the user sees, how it recovers.' },
		{ term: 'Blocking question', def: 'One that must be answered before the design is accepted. Mark it, so it does not drown among the small ones.' },
		{ term: 'Contract', def: 'Anything other teams build against: an API, a message format, a default behavior. Usually the most one-way part of a design.' }
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
				note: 'Walk through the scenarios that matter (day 3). Not only the happy path: an app that hangs while the kubelet is down, a node down for minutes, a clock that is off.'
			},
			{
				add: ['kep --> door["One-way doors: what is hard to undo?"]'],
				highlight: ['door'],
				note: 'Find the contracts (day 5). Pod readiness decides where traffic goes. Once the new behavior is the default and the old one is gone, everyone builds on it.'
			},
			{
				add: ['kep --> fail["Failure modes: what if a step dies or repeats?"]'],
				highlight: ['fail'],
				note: 'For each step, ask: what if a dependency is down, or the step runs at the wrong time (day 15)? The KEP template asks these questions itself. Look for the ones left blank.'
			},
			{
				add: ['q["Short list of questions, blocking ones marked"]', 'sc --> q', 'door --> q', 'fail --> q'],
				highlight: ['q'],
				note: 'The output is a **short list of questions**, the blocking ones marked. Five sharp questions beat thirty comments.'
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
			'Start with what is good, and say so. The KEP names its own biggest risk: traffic can go to a pod that is reported Ready but is no longer healthy. Many design docs never write down their downside.',
			'The template does half the review for you. It asks about rollback, version skew, metrics and failure modes. **Empty answers are where your questions go.** Here, both Troubleshooting questions are blank.',
			`Read the design literally. [Line 119](${KEP}/README.md#L119) says the kubelet will get the \`Started\` field "via the API server" after a restart. The question on line 368, what if the API server is down, has no answer yet.`,
			`[Read the whole KEP](${KEP}/README.md) before the task. It is under 400 lines, and much of it is template comments. About 10 minutes.`
		]
	},
	tradeoff: {
		gain: [
			'One-way doors are caught while they are still text, not behavior in production.',
			'Questions keep the author owning the design and get you the context you were missing.',
			'The review itself becomes a record of what was considered.'
		],
		cost: [
			'A good review takes an hour of careful reading. It competes with your own work.',
			'A doc review misses what only the code reveals. Some questions only appear in the PR.',
			'Too many questions bury the important ones. Marking "blocking" is not optional.'
		]
	},
	task: {
		prompt: 'Read KEP-4781. Write **one question per lens**: a scenario it hurts, a one-way door, a failure mode. Mark which one, if any, should block acceptance.',
		hint: 'Compare line 115 (what the feature gate does by default) with line 201 (what it takes to reach GA). Then read line 119 next to line 368, and line 249.',
		answer: [
			'**Scenario.** An app hangs while the kubelet is down. Line 125 says its status is fixed "in the next probe cycle". Given the probe\'s period and failure threshold, how long can a pod that broke during the restart keep getting traffic? Should the doc state the worst case?',
			'**One-way door.** Line 115: the new behavior is on by default from the first release, and the gate only restores the old one. Line 201: GA needs only "no issues reported by users". Once the gate is removed, the old behavior is gone for everyone. What evidence, beyond silence, moves it to GA?',
			'**Failure mode.** Line 119: after a restart the kubelet takes `Started` from the API server. Line 368 asks what happens if the API server is unavailable, and is blank. Does the kubelet fall back to the old reset, or keep stale status?',
			'**Blocking.** The failure-mode question, together with line 249: "What specific metrics should inform a rollback?" is `N/A`. A change to a default that steers traffic needs a known fallback and a signal to roll back. I would ask for both before it becomes implementable.',
			'Non-blocking, worth asking: line 147 uses a 10-second tolerance for clock skew. What happens on a node whose clock is off by more?'
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
			why: 'Other components and users build on how readiness behaves. Once the old behavior cannot be switched back on, changing it again means a new proposal and a new migration. The others are internal and cheap to change.'
		}
	],
	takeaway: 'Review for scenarios, one-way doors and failure modes. Ask questions, mark the blocking ones, skip the style.',
	sources: [
		{ title: 'KEP-4781, Restarting kubelet does not change pod status (provisional)', url: `${KEP}/README.md` },
		{ title: 'KEP-4781, kep.yaml (status and feature gate)', url: `${KEP}/kep.yaml` },
		{ title: 'Kubernetes v1.35.0, ChangeContainerStatusOnKubeletRestart feature gate', url: 'https://github.com/kubernetes/kubernetes/blob/66452049f3d692768c39c797b21b793dce80314e/pkg/features/kube_features.go#L1189-L1192' },
		{ title: 'Kubernetes enhancements, KEP template', url: 'https://github.com/kubernetes/enhancements/blob/6ebe0a94771723b3f27cb4a757f0cc22f29e38a2/keps/NNNN-kep-template/README.md' },
		{ title: 'Malte Ubl, Design Docs at Google', url: 'https://www.industrialempathy.com/posts/design-docs-at-google/' }
	]
};
