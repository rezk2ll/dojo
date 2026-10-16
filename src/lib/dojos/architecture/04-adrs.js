const BACKSTAGE = 'https://github.com/backstage/backstage/blob/b717df252896a9e12b0bca1f84cfe453ecba3283';
const ADRS = `${BACKSTAGE}/docs/architecture-decisions`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'adrs',
	part: 'Thinking like an architect',
	title: 'Architecture decision records: writing down the why',
	minutes: 10,
	hook: [
		'Backstage is an open-source developer portal made of many plugins. Picture a newcomer who opens one plugin that imports `node-fetch`, then another that calls the built-in `fetch`. Which one is right? If the answer is only in a review thread, they will guess, and the next plugin may pick a third library.',
		'The second law of software architecture: **why is more important than how**. Anyone can read how in the code. The why survives only if someone writes the decision down.',
		'An Architecture Decision Record (ADR) holds one decision on one page. Backstage keeps them in `docs/architecture-decisions`, numbered, next to the code. Two of them answer the newcomer, and show how a decision changes while its history stays readable.'
	],
	terms: [
		{ term: 'ADR', def: 'Architecture Decision Record: a short file with Title, Status, Context, Decision and Consequences (Michael Nygard, 2011).' },
		{ term: 'Consequences', def: 'Everything that follows from the decision, the good **and** the bad. If you listed no downside, look again (first law).' },
		{ term: 'Superseded', def: 'The status of an ADR that a newer ADR replaced. You never edit an accepted ADR to change the decision: you write a new one and link the two.' },
		{ term: 'Y-statement', def: 'A one-sentence ADR: "In the context of…, facing…, we decided for… and neglected…, to achieve…, accepting…"' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['draft["Proposed: a pull request, no number yet"]'],
				highlight: ['draft'],
				note: 'An ADR starts as **Proposed**: a question with a suggested answer, open for review. In Backstage it is a pull request from the template, and the guide says "Do not assign an ADR number" until feedback is in.'
			},
			{
				add: ['draft -->|agreed| accepted["Accepted: ADR013, Dec 2021"]', 'draft -->|not this| rejected["Rejected"]'],
				highlight: ['accepted', 'rejected'],
				note: 'Review ends with the ADR Accepted or Rejected. ADR013 was accepted in December 2021: backend packages should use the `node-fetch` package.'
			},
			{
				add: ['accepted -->|context changed| superseded["ADR013 marked superseded"]', 'adr14["ADR014, Nov 2024: native fetch"] -.->|replaces| superseded'],
				highlight: ['superseded', 'adr14'],
				note: 'Backstage raised its minimum to Node.js 20, where the built-in `fetch` works without a flag. Backstage left ADR013\'s decision as it was and wrote **ADR014**. ADR013 now opens with "This ADR has been superseded by ADR014 and no longer applies." Both stay readable.'
			},
			{
				add: ['inplace["First commit: edit ADR013 in place"] -.->|same pull request| adr14'],
				highlight: ['inplace'],
				note: 'Even Backstage first edited in place. In the pull request that made ADR014, the first commit rewrote ADR013\'s Decision directly. A later commit in the same pull request moved the change into a new record, as the project rule asks: "Records are never deleted but can be marked as superseded."'
			}
		]
	},
	example: {
		title: 'docs/architecture-decisions/adr014-use-fetch.md (excerpt)',
		repo: 'backstage/backstage',
		url: `${ADRS}/adr014-use-fetch.md?plain=1#L7-L79`,
		lang: 'md',
		code: `## Context

Until now we have been recommending the use of \`node-fetch\` in Node.js contexts
through [ADR013](./adr013-use-node-fetch.md). Since then, Backstage has had its
minimum requirements upgraded to Node.js 20 or newer. The Node.js platform has
established a stable, reliable \`undici\` based native \`fetch\` in these versions.
Additionally, there are [some issues](https://github.com/backstage/backstage/issues/24590)
with using third party libraries that only appeared in newer versions of
Node.js.

## Decision

All code that is executed in Node.js (including backend and CLIs) should use the
native \`fetch\` for HTTP data fetching, and \`typeof fetch\` as the TypeScript type
in code where a \`fetch\` implementation can be injected or is referred to.
…
## Consequences

We will gradually transition away from third party \`fetch\` replacement packages
such as \`node-fetch\` and others on the Node.js platform.
…`,
		notes: [
			'Lines 1 to 9, the Context, say what changed since ADR013, without arguing: a new Node.js minimum, a stable native `fetch`, known issues with the old libraries. Because the context changed, a new ADR is justified.',
			'Lines 11 to 15, the Decision, use full sentences in active voice, as the [template](https://github.com/backstage/backstage/blob/b717df252896a9e12b0bca1f84cfe453ecba3283/docs/architecture-decisions/adr000-template.md?plain=1#L9-L22) asks. The template comes from Nygard\'s 2011 blog post and says "All consequences should be listed here", the negative ones too.',
			'Lines 17 to 20 start the Consequences, and the section lists a negative one. Its last paragraph warns that `msw` 1.x [does not intercept native fetch properly](https://github.com/backstage/backstage/blob/b717df252896a9e12b0bca1f84cfe453ecba3283/docs/architecture-decisions/adr014-use-fetch.md?plain=1#L79), so some tests will fail and need rewriting.',
			'Neither record has an **Alternatives considered** section, which lists the rejected options and why. ADR013 names `axios` and `got` as packages to move away from, but neither record says why they lost. A newcomer who asks "why not `axios`?" still has to go and ask.'
		]
	},
	tradeoff: {
		gain: [
			'The why stays in the repo after its authors leave, and reviewers can argue with the written reasoning.',
			'Writing the consequences makes you look for the downside before shipping, like the broken `msw` tests.',
			'A superseded ADR keeps the history: a reader sees what was decided in 2021, what changed, and what holds now.'
		],
		cost: [
			'Nearly two years after ADR014, the [Kubernetes backend plugin](https://github.com/backstage/backstage/blob/b717df252896a9e12b0bca1f84cfe453ecba3283/plugins/kubernetes-backend/src/service/KubernetesConnection.ts#L24) still imports `node-fetch`, because the record only asks to move away "gradually".',
			'Writing one for every small choice hides the important ones among them. Keep ADRs for decisions that are expensive to change.'
		]
	},
	task: {
		prompt: 'Write ADR014 as a **Y-statement** (one sentence). Everything you need is in the excerpt and the diagram.',
		hint: 'In the context of… (which code), facing… (what changed), we decided for… and neglected… (the old option), to achieve… (the gain), accepting… (the cost).',
		answer: [
			'In the context of Backstage code that runs in Node.js and makes HTTP calls,',
			'facing a Node.js 20 minimum with a built-in native `fetch`, and issues with third party libraries on newer Node.js versions,',
			'we decided for the native `fetch` everywhere in Node.js and neglected keeping `node-fetch` as ADR013 asked,',
			'to achieve one `fetch` with no extra package to keep up to date,',
			'accepting that tests built on `msw` 1.x may stop catching traffic and need a rewrite for `msw` 2.x.'
		]
	},
	quiz: [
		{
			q: 'A year after an ADR is accepted, the team changes the decision. What happens to the old ADR?',
			options: ['Edit its Decision section to match the new choice', 'Write a new ADR, and mark the old one "superseded by" it', 'Delete it, the code is the truth', 'Add a comment in the code that used it'],
			answer: 1,
			why: 'Accepted ADRs keep the history. You supersede them, so readers see both what was decided and why it changed. Backstage\'s ADR013 opens with a note pointing to ADR014.'
		},
		{
			q: 'ADR014 warns that `msw` 1.x tests may fail with native fetch. Why does that line belong under Consequences?',
			options: ['It is a bug in `msw` 1.x, so it belongs in the issue tracker, not in the ADR', 'It belongs in Context, because it describes a fact that was true before the decision', 'It belongs in the Decision, since it is part of the plan for moving to native fetch', 'Consequences hold the good and the bad that follow from the decision, and this is a price paid'],
			answer: 3,
			why: 'If Consequences has no downside, the first law says you have not found it yet. Naming it also tells every plugin author what to expect.'
		},
		{
			q: 'In Backstage, when does a new ADR get its number?',
			options: ['As soon as the file is created from the template, before any review', 'Only when it is superseded, so the replacement can point back to it', 'Near the end of review, once the pull request has gathered feedback', 'Never, ADRs are named by date so two pull requests cannot collide'],
			answer: 2,
			why: 'The guide says to copy the template without assigning a number, gather feedback on the pull request, and "Eventually, assign a number". A number marks a decision that was actually made.'
		}
	],
	recall: {
		q: 'Backstage moved from `node-fetch` to native `fetch`. What did it do with ADR013, and why?',
		a: 'It wrote ADR014 and marked ADR013 superseded, without editing ADR013\'s decision. Accepted records are never deleted, so a reader still sees the 2021 decision, what changed (Node.js 20), and what holds now.'
	},
	sources: [
		{ title: 'Backstage ADR014, Proper use of HTTP fetching libraries', url: `${ADRS}/adr014-use-fetch.md` },
		{ title: 'Backstage ADR013 (superseded), the node-fetch decision', url: `${ADRS}/adr013-use-node-fetch.md` },
		{ title: 'Backstage, ADR overview: creating and superseding', url: `${ADRS}/index.md?plain=1#L12-L37` },
		{ title: 'Michael Nygard, Documenting Architecture Decisions (2011)', url: 'https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions' },
		{ title: 'adr.github.io, ADR templates including the Y-statement', url: 'https://adr.github.io/adr-templates/' }
	]
};
