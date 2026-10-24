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
		],
		steps: [
			{
				title: 'Spot the risk',
				questions: [
					{ q: 'During a rolling update across the 4 servers, what talks to the database?', options: ['Only v2, once the first server is updated', 'v1 and v2, at the same time', 'Only v1, until the last server switches', 'Nothing: the update locks the database'], answer: 1, why: 'A rolling update replaces copies a few at a time, so both versions answer users for a while.' },
					{ q: 'Why is that a problem for the schema change?', options: ['A change v1 does not expect breaks the v1 copies still running', 'Two versions cannot open the same table', 'The load balancer reads the schema', 'v2 cannot start until v1 has stopped'], answer: 0, why: 'v1 and v2 must be compatible, and that includes the database they share.' },
					{ q: 'Does blue-green avoid the problem?', options: ['Yes: blue and green each get their own database', 'Yes: only one version runs at a time', 'No: blue and green usually share the database', 'Only when the switch is instant'], answer: 2, why: 'Two full app environments, one database. The schema still has to suit both.' },
					{ q: 'What must the plan keep, whatever the strategy?', options: ['A short window of downtime', 'A copy of every row', 'Only one version running at a time', 'A way back to v1 that works on the new schema'], answer: 3, why: 'Every strategy needs a rollback to the last version that worked.' }
				]
			},
			{
				title: 'Add the column first',
				questions: [
					{ q: 'What does the first deploy contain?', options: ['A migration that only adds the column, nullable or with a default', 'The new column and v2, shipped together', 'A rename of an old column to the new name', 'A copy of `orders` into a new table'], answer: 0, why: 'Adding is safe on its own. v2 comes in a second deploy.' },
					{ q: 'Why nullable or with a default?', options: ['Postgres requires it for every column', 'v1 keeps inserting rows without that column', 'It makes the migration run faster', 'v2 cannot write a column that has no default'], answer: 1, why: 'v1 knows nothing about the column, so its inserts must still be valid without it.' },
					{ q: 'After this migration, what does v1 do?', options: ['It crashes until it is restarted', 'It starts writing the new column', 'It ignores the column and keeps working', 'It needs a new release to read `orders`'], answer: 2, why: 'v1 never asks for the column, so nothing it does changes.' },
					{ q: 'What does this first deploy give you?', options: ['A faster checkout', 'A feature flag for the column', 'Double the capacity', 'A rollback point'], answer: 3, why: 'The schema now suits v1 and v2. You can move between them freely.' }
				]
			},
			{
				title: 'Ship v2',
				questions: [
					{ q: 'How do you ship v2, which writes the column?', options: ['As a rolling or canary update', 'With recreate: stop all four servers, then start v2', 'Together with the migration, in one step', 'By hand, one server per day'], answer: 0, why: 'The schema already suits both versions, so you can update with no downtime.' },
					{ q: 'v2 misbehaves. What do you roll back?', options: ['The app and the column', 'Only the column', 'The app only, the column stays', 'Nothing: you fix forward'], answer: 2, why: 'v1 ignores the column, so it runs fine with it in place.' },
					{ q: 'You ship v2 as a canary. Who is hurt if it is bad?', options: ['Every user, as with recreate', 'Only the small share of users sent to v2', 'Nobody, because the canary has no traffic', 'Only the users still on v1'], answer: 1, why: 'A canary limits a bad release to a small share of real traffic.' },
					{ q: 'What does a canary need to tell you v2 is worse?', options: ['A second database', 'A feature flag on every page', 'A longer pause between steps', 'Metrics that compare v2 with v1'], answer: 3, why: 'Without metrics good enough to show "v2 is worse", the canary tells you nothing.' }
				]
			},
			{
				title: 'Clean up later',
				questions: [
					{ q: 'When can you drop or rename a column?', options: ['When no running version needs it', 'In the same release that stops using it', 'Before v2 ships, to keep the table clean', 'Never: columns stay forever'], answer: 0, why: 'Removing it while a version still reads it breaks that version, and your rollback.' },
					{ q: 'Why not drop the old column in the release that stops using it?', options: ['Postgres forbids it', 'The v1 copies still running, and your rollback target, still use it', 'The migration would be too slow', 'Feature flags would stop working'], answer: 1, why: 'For a while v1 still serves users, and it is also where you go back to.' },
					{ q: 'You switch to blue-green next quarter. Do you still need the two deploys?', options: ['No: green gets a fresh database', 'No: the router handles the schema', 'Yes: blue and green usually share the database', 'Only if you also use a canary'], answer: 2, why: 'Both colours read the same tables, so the schema must suit both.' },
					{ q: 'When should you first run the rollback?', options: ['The day v2 breaks', 'Never: a plan on paper is enough', 'After the column is dropped', 'Once, before you need it'], answer: 3, why: 'A rollback you have never run is a guess. Test it while nothing is on fire.' }
				]
			}
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
	lab: {
		minutes: 15,
		goal: 'See for yourself which schema change lets v1 keep running, and which one breaks it.',
		steps: [
			'Start a database: `docker run -d --name orders-db -e POSTGRES_PASSWORD=lab postgres:16`. Wait until `docker exec orders-db pg_isready -U postgres` prints `accepting connections`.',
			'Open a shell with `docker exec -it orders-db psql -U postgres` and create the v1 table: `CREATE TABLE orders (id serial PRIMARY KEY, total numeric NOT NULL);`.',
			'Play v1: `INSERT INTO orders (total) VALUES (10);`. Then the first deploy: `ALTER TABLE orders ADD COLUMN coupon text;`. Play v1 again with the same insert.',
			'Play v2: `INSERT INTO orders (total, coupon) VALUES (30, \'SPRING\');`. Then roll back to v1, run the v1 insert once more, and look at the table: `SELECT id, total, coupon FROM orders;`.',
			'Now try the change you must never ship with v2: `ALTER TABLE orders RENAME COLUMN total TO amount;`, and run the v1 insert.',
			'Leave psql with `\\q` and clean up with `docker rm -f orders-db`.'
		],
		done: [
			'Every v1 insert after `ADD COLUMN` prints `INSERT 0 1`.',
			'The `SELECT` in step 4 shows `SPRING` on the v2 row and an empty `coupon` on the v1 rows.',
			'After the rename, the v1 insert fails with `column "total" of relation "orders" does not exist`.'
		],
		solution: [
			'A nullable column with no default leaves every v1 statement valid, so v1 and v2 can run side by side and you can roll the app back.',
			'The rename breaks every running v1 copy at once, and the rollback with them. Rename or drop a column only once no running version needs it.',
			'Try `ALTER TABLE orders ADD COLUMN note text NOT NULL;` on the table with rows: Postgres refuses it, because the existing rows have no value.'
		]
	},
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
