const DEMO = 'https://github.com/argoproj/rollouts-demo/blob/4e8c844fe9e23b7586f95b5f6b5365693cf318ad';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'deploy-strategies',
	part: 'CI/CD',
	title: 'Deploy strategies: how the new version meets real users',
	minutes: 10,
	hook: [
		'Friday, 6 p.m. You stop the service, copy the new version, start it again. For thirty seconds the site is down. If the new version is broken, it is broken **for everyone**, and going back means doing it all again, by hand, in a hurry.',
		'The pipeline can now build and test every change. The last question is **how** the new version replaces the old one in production. There are a few well-known answers, and each one trades speed, cost and risk differently.',
		'Today: recreate, rolling, blue-green, canary, feature flags, and the one thing every strategy needs: a **rollback** you have practised.'
	],
	terms: [
		{ term: 'Recreate', def: 'Stop every old copy, then start the new ones. Simple, with downtime in between.' },
		{ term: 'Rolling update', def: 'Replace copies a few at a time. No downtime, but old and new versions serve users at the same moment.' },
		{ term: 'Blue-green', def: 'Run the new version (green) beside the live one (blue), then switch the router. Switching back is the rollback.' },
		{ term: 'Canary', def: 'Send a small share of real traffic to the new version, watch it, then increase step by step.' },
		{ term: 'Feature flag', def: 'A switch in the code that turns a feature on or off without a new deploy. It separates **deploying** code from **releasing** a feature.' },
		{ term: 'Rollback', def: 'Going back to the last version that worked. Each strategy makes it faster or slower.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['v1["v1 live on 4 servers"] --> rec["Recreate: stop all v1, start v2"]'],
				highlight: ['v1', 'rec'],
				note: '**Recreate** is what you did by hand. Easy to reason about: only one version ever runs. The cost is a gap with no service. Kubernetes, which you meet on day 31, has it built in as `Recreate`.'
			},
			{
				add: ['v1 --> roll["Rolling: replace 1 server at a time"]'],
				highlight: ['roll'],
				note: '**Rolling** is what Kubernetes does by default: during the update, at most 25% of the copies are down and at most 25% extra copies are started. No downtime, but for a while **v1 and v2 both answer users**, so they must be compatible.'
			},
			{
				add: ['v1 --> bg["Blue-green: v2 beside v1, switch the router"]'],
				highlight: ['bg'],
				note: '**Blue-green** keeps two full environments. You test green, then flip the router. Rollback is flipping it back. The cost: double the capacity, and a database schema that works for both versions.'
			},
			{
				add: ['v1 --> can["Canary: 20 percent to v2, watch, then more"]'],
				highlight: ['can'],
				note: '**Canary** sends a small share of real users to v2 first. If errors rise, only that share is hurt, and you send everyone back. It needs good metrics, or you are watching nothing.'
			},
			{
				add: [
					'rb["Rollback: back to the last good version"]',
					'can -.-> rb',
					'bg -.-> rb',
					'ff["Feature flag: code deployed off, released later"]'
				],
				highlight: ['rb', 'ff'],
				note: 'A **feature flag** works on another level: the code is deployed but turned off, and you release it with a switch, to everyone or to a few users. And whatever the strategy, **rollback** must be one command, tested before you need it.'
			}
		]
	},
	example: {
		title: 'examples/canary/canary-rollout.yaml',
		repo: 'argoproj/rollouts-demo',
		url: `${DEMO}/examples/canary/canary-rollout.yaml#L1-L39`,
		lang: 'yaml',
		code: `apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: canary-demo
spec:
  replicas: 5
…
  strategy:
    canary:
      canaryService: canary-demo-preview
      steps:
      - setWeight: 20
      - pause: {}
      - setWeight: 40
      - pause: {duration: 10}
      - setWeight: 60
      - pause: {duration: 10}
      - setWeight: 80
      - pause: {duration: 10}`,
		notes: [
			'You meet Kubernetes on day 31. For now, read this as "run 5 copies of the app". [Argo Rollouts](https://argoproj.github.io/argo-rollouts/) is a Kubernetes add-on that adds blue-green and canary to the built-in rolling update.',
			'`setWeight: 20` sends 20% to the new version. With no traffic router, Argo Rollouts gets there [by counting copies](https://argoproj.github.io/argo-rollouts/features/canary/): 20% of 5 copies is **1 new copy and 4 old ones**.',
			'`pause: {}` has no duration, so the rollout **waits forever** until a human runs `kubectl argo rollouts promote canary-demo` (the Argo Rollouts command line). That is your moment to check the dashboards. The later pauses are 10 seconds each.',
			'`canaryService` names a stable address (a Kubernetes Service) that sends traffic only to the new copies, so you can test v2 directly. If v2 looks bad, [`kubectl argo rollouts abort`](https://argoproj.github.io/argo-rollouts/generated/kubectl-argo-rollouts/kubectl-argo-rollouts_abort/) reverts the steps and the previous version is active again. The Rollout still describes v2, though: put the old version back in it, or it tries v2 again.',
			'The same repo has a [blue-green version](https://github.com/argoproj/rollouts-demo/blob/4e8c844fe9e23b7586f95b5f6b5365693cf318ad/examples/blue-green/bluegreen-rollout.yaml#L30-L34): an `activeService` for users, a `previewService` for testing green, and `autoPromotionEnabled: false` so the switch waits for a human.'
		]
	},
	tradeoff: {
		gain: [
			'Rolling and canary update with no downtime, and canary limits a bad release to a small share of users.',
			'Blue-green gives the fastest rollback: switch the router back, the old version is still running.',
			'Feature flags let you deploy any time and release when the business is ready, or turn a feature off without a deploy.'
		],
		cost: [
			'Every strategy except recreate runs two versions at once. Database changes and APIs must work with both.',
			'Blue-green needs double the capacity during the switch. Canary needs metrics good enough to tell "v2 is worse".',
			'Each feature flag is an extra code path to test, and old flags pile up unless you remove them.'
		]
	},
	task: {
		prompt: 'Your web app runs on 4 servers behind a load balancer. The next release adds a column to the `orders` table and starts writing to it. Pick a strategy, and plan the database change so that **rollback stays possible**.',
		hint: 'During a rolling or canary update, v1 and v2 run at the same time against the same database. What happens to v1 if the schema changes under it?',
		answer: [
			'Split it in two deploys. First: a migration that only **adds** the column (nullable or with a default). v1 ignores it, so nothing breaks, and you have a rollback point.',
			'Second: deploy v2, which writes the column, as a **rolling** or **canary** update. If v2 misbehaves, roll back the app only. The column stays, v1 still works.',
			'Never drop or rename a column in the same release that stops using it. Wait until no running version needs it.',
			'Blue-green does not save you here: blue and green usually share the database, so the same rule applies.'
		]
	},
	quiz: [
		{
			q: 'What is the main difference between a blue-green deploy and a canary release?',
			options: [
				'Blue-green is for databases, canary is for web servers',
				'Blue-green switches all traffic at once from the old environment to the new one. Canary sends a small share of real users to the new version first, then increases it',
				'Canary has downtime, blue-green does not',
				'Blue-green runs only one version at a time, canary runs three'
			],
			answer: 1,
			why: 'Both keep the old version running. Blue-green flips everyone at once, with an instant flip back. Canary exposes a few users first, so a bad release hurts only that share.'
		},
		{
			q: 'Kubernetes (day 31) runs several copies of your app. You ship a new version there and choose no strategy. What does Kubernetes do?',
			options: [
				'Recreate: kill all old copies, then start new ones',
				'Blue-green: start a full copy, then switch',
				'Rolling update: replace copies progressively, with at most 25% down and at most 25% extra by default',
				'Nothing until you approve the change'
			],
			answer: 2,
			why: 'Rolling update is the default strategy, and both limits (`maxUnavailable` and `maxSurge`) default to 25%. `Recreate` must be asked for.'
		},
		{
			q: 'A new checkout page is deployed to production, but hidden behind a feature flag that is off. What is true?',
			options: [
				'The code is deployed but not released: users see it only when the flag is turned on',
				'The code is not deployed until the flag is turned on',
				'Turning the flag on triggers a new deploy',
				'Feature flags only work with blue-green deploys'
			],
			answer: 0,
			why: 'A flag separates deploy (the code is on the servers) from release (users get the feature). You can turn it on, or back off, without touching the pipeline.'
		}
	],
	takeaway: 'Recreate is simple with downtime, rolling has none but mixes versions, blue-green flips with an instant way back, canary tests on a few real users. Whatever you choose, keep both versions compatible and practise the rollback.',
	sources: [
		{ title: 'Kubernetes docs, Deployments: strategy and rolling back', url: 'https://kubernetes.io/docs/concepts/workloads/controllers/deployment/' },
		{ title: 'Martin Fowler, Blue Green Deployment', url: 'https://martinfowler.com/bliki/BlueGreenDeployment.html' },
		{ title: 'Danilo Sato, Canary Release', url: 'https://martinfowler.com/bliki/CanaryRelease.html' },
		{ title: 'Pete Hodgson, Feature Toggles (aka Feature Flags)', url: 'https://martinfowler.com/articles/feature-toggles.html' },
		{ title: 'Argo Rollouts docs, Canary deployment strategy', url: 'https://argoproj.github.io/argo-rollouts/features/canary/' }
	]
};
