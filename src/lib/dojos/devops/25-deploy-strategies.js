const DEMO = 'https://github.com/argoproj/rollouts-demo/blob/4e8c844fe9e23b7586f95b5f6b5365693cf318ad';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'deploy-strategies',
	part: 'CI/CD',
	title: 'Deploy strategies: replacing the version in production',
	minutes: 10,
	hook: [
		'Friday, 6 p.m. You stop the service, copy the new version, start it again. For thirty seconds the site is down. If the new version is broken, it is broken **for everyone**, and going back means doing it all again, by hand, in a hurry.',
		'The pipeline can now build and test every change. The strategy decides how the new version replaces the old one in production. Each strategy differs in downtime, in extra servers, and in how many users a bad release reaches.',
		'Every strategy also needs a rollback, a way back to the last version that worked, and you should run it once before you need it.'
	],
	terms: [
		{ term: 'Rolling update', def: 'Replace copies a few at a time. There is no downtime, and old and new versions serve users at the same moment.' },
		{ term: 'Blue-green', def: 'Run the new version (green) beside the live one (blue), then switch the router. To roll back, you switch the router to blue again.' },
		{ term: 'Canary', def: 'Send a small share of real traffic to the new version, watch it, then increase step by step.' },
		{ term: 'Feature flag', def: 'A switch in the code that turns a feature on or off without a new deploy. Deploying puts the code on the servers, and **releasing** turns the feature on for users.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['v1["v1 live on 4 servers"] --> rec["Recreate: stop all v1, start v2"]'],
				highlight: ['v1', 'rec'],
				note: 'With the recreate strategy, you stop every old copy and then start the new ones, as you did by hand. Only one version ever runs, and users get no service in between. Kubernetes, which you meet on day 31, has it built in as `Recreate`.'
			},
			{
				add: ['v1 --> roll["Rolling: replace 1 server at a time"]'],
				highlight: ['roll'],
				note: 'Kubernetes does a rolling update by default: during the update, at most 25% of the copies are down and at most 25% extra copies are started. There is no downtime, but for a while **v1 and v2 both answer users**, so they must be compatible.'
			},
			{
				add: ['v1 --> bg["Blue-green: v2 beside v1, switch the router"]'],
				highlight: ['bg'],
				note: 'Blue-green keeps two full environments. You test green, then flip the router, and to roll back you flip it to blue again. You pay for **double the capacity**, and the database schema must work for both versions.'
			},
			{
				add: ['v1 --> can["Canary: 20 percent to v2, watch, then more"]'],
				highlight: ['can'],
				note: 'A canary release sends a small share of real users, here 20%, to v2 first. If errors rise, only that share is hurt, and you send everyone back to v1. You need metrics that show whether v2 is worse than v1.'
			},
			{
				add: [
					'rb["Rollback: back to the last good version"]',
					'can -.-> rb',
					'bg -.-> rb',
					'ff["Feature flag: code deployed off, released later"]'
				],
				highlight: ['rb', 'ff'],
				note: 'A **feature flag** works inside the code: the code is deployed but turned off, and you release it with a switch, to everyone or to a few users. Whatever the strategy, the rollback should be one command that you have tested before you need it.'
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
			'You meet Kubernetes on day 31. For now, read line 6 as "run 5 copies of the app". [Argo Rollouts](https://argoproj.github.io/argo-rollouts/) is a Kubernetes add-on that adds blue-green and canary to the built-in rolling update.',
			'Line 12, `setWeight: 20`, sends 20% to the new version. With no traffic router, Argo Rollouts gets there [by counting copies](https://argoproj.github.io/argo-rollouts/features/canary/): 20% of 5 copies is **1 new copy and 4 old ones**.',
			'Line 13, `pause: {}`, has no duration, so the rollout **waits forever** until a human runs `kubectl argo rollouts promote canary-demo` (the Argo Rollouts command line). You check the dashboards before you run it. The later pauses, on lines 15, 17 and 19, are 10 seconds each.',
			'Line 10, `canaryService`, names a stable address (a Kubernetes Service) that sends traffic only to the new copies, so you can test v2 directly. If v2 looks bad, [`kubectl argo rollouts abort`](https://argoproj.github.io/argo-rollouts/generated/kubectl-argo-rollouts/kubectl-argo-rollouts_abort/) reverts the steps and the previous version is active again. The Rollout still describes v2, though: put the old version back in it, or it tries v2 again.',
			'The same repo has a [blue-green version](https://github.com/argoproj/rollouts-demo/blob/4e8c844fe9e23b7586f95b5f6b5365693cf318ad/examples/blue-green/bluegreen-rollout.yaml#L30-L34) with an `activeService` for users, a `previewService` for testing green, and `autoPromotionEnabled: false` so the switch waits for a human.'
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
			'Second: deploy v2, which writes the column, as a **rolling** or canary update. If v2 misbehaves, roll back the app only. The column stays, v1 still works.',
			'Never drop or rename a column in the same release that stops using it. Wait until no running version needs it.',
			'Blue-green needs the same two steps: blue and green usually share the database.'
		]
	},
	quiz: [
		{
			q: 'What is the main difference between a blue-green deploy and a canary release?',
			options: [
				'Blue-green is for database changes, which need two copies. Canary is only for stateless web servers',
				'Blue-green moves all traffic to the new version at once. Canary sends a small share of users first, then more',
				'Canary stops the old version while the new one starts, so it has downtime. Blue-green has none',
				'Blue-green runs one version at a time. Canary runs three at once: old, new and a test copy'
			],
			answer: 1,
			why: 'Both keep the old version running. Blue-green flips everyone at once, with an instant flip back. Canary exposes a few users first, so a bad release hurts only that share.'
		},
		{
			q: 'Kubernetes (day 31) runs several copies of your app. You ship a new version there and choose no strategy. What does Kubernetes do?',
			options: [
				'Recreate: kill all old copies first, then start the new ones once they are gone',
				'Blue-green: start a full set of new copies, then switch all traffic at once',
				'Rolling update: replace copies progressively, by default at most 25% down and 25% extra',
				'Nothing: the new version waits until you approve the change with `kubectl`'
			],
			answer: 2,
			why: 'Rolling update is the default strategy, and both limits (`maxUnavailable` and `maxSurge`) default to 25%. `Recreate` must be asked for.'
		},
		{
			q: 'A new checkout page is deployed to production, but hidden behind a feature flag that is off. What is true?',
			options: [
				'The code is deployed but not released: users see it only when the flag is turned on',
				'The code is not deployed yet, the pipeline waits until the flag is turned on',
				'Turning the flag on triggers a new deploy of the checkout page to production',
				'Nothing is live yet, since feature flags only work with blue-green deploys'
			],
			answer: 0,
			why: 'A flag separates deploy (the code is on the servers) from release (users get the feature). You can turn it on, or back off, without touching the pipeline.'
		}
	],
	recall: {
		q: 'In the Argo Rollouts canary with 5 copies, what does `setWeight: 20` followed by `pause: {}` do?',
		a: 'It runs 1 new copy and 4 old ones, so about 20% of traffic reaches v2. The rollout then waits until a human runs `kubectl argo rollouts promote canary-demo`.'
	},
	sources: [
		{ title: 'Kubernetes docs, Deployments: strategy and rolling back', url: 'https://kubernetes.io/docs/concepts/workloads/controllers/deployment/' },
		{ title: 'Martin Fowler, Blue Green Deployment', url: 'https://martinfowler.com/bliki/BlueGreenDeployment.html' },
		{ title: 'Danilo Sato, Canary Release', url: 'https://martinfowler.com/bliki/CanaryRelease.html' },
		{ title: 'Pete Hodgson, Feature Toggles (aka Feature Flags)', url: 'https://martinfowler.com/articles/feature-toggles.html' },
		{ title: 'Argo Rollouts docs, Canary deployment strategy', url: 'https://argoproj.github.io/argo-rollouts/features/canary/' }
	]
};
