const ARGO = 'https://github.com/argoproj/argo-cd/blob/2a78031ddbdd9e26cee81f84dc47f152fc23e5c8';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'gitops',
	part: 'Running in production',
	title: 'GitOps: Git is the source of truth',
	minutes: 10,
	hook: [
		'Friday, 6 p.m. Someone ran `kubectl edit` on production to "just bump the memory". Nobody wrote it down. Monday, the next deploy puts the old value back and the app falls over.',
		'You know this story from the server days: the hand-edited `nginx.conf` that nobody had in Git. `kubectl edit` does the same on Kubernetes: it changes the live object and leaves nothing in Git.',
		'With GitOps, the desired state of the cluster lives in a Git repo. An agent **inside the cluster** pulls that repo and keeps applying it to the cluster. To change production, you open a pull request.'
	],
	terms: [
		{ term: 'Pull deploy', def: 'An agent running in the cluster watches Git and applies changes itself. CI never touches the cluster.' },
		{ term: 'Argo CD Application', def: 'A Kubernetes object that says: take the manifests at this repo, revision and path, and keep them applied in this cluster and namespace.' },
		{ term: 'Drift', def: 'The live state in the cluster no longer matches Git. Argo CD shows the app as **OutOfSync**.' },
		{ term: 'Self-heal', def: 'Argo CD option: when the live state drifts from Git, sync again on its own. Off by default.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: [
					'dev["You: pull request"] --> repo[("Config repo in Git")]',
					'ci["CI pipeline"] -->|"kubectl apply"| k8s["Cluster"]',
					'class repo ext'
				],
				highlight: ['ci'],
				note: 'In a push deploy, as in the CI/CD part, the pipeline runs `kubectl apply` or `helm upgrade` itself. CI then needs admin credentials to the cluster. Nothing notices when someone changes the cluster by hand.'
			},
			{
				add: [
					'subgraph inside["Inside the cluster"]',
					'argo["Argo CD"]',
					'end',
					'argo -->|"pulls"| repo'
				],
				highlight: ['argo'],
				note: 'In a pull deploy, Argo CD runs in the cluster and polls the repo (every 3 minutes at most by default). The cluster credentials stay inside the cluster. CI only has to push to Git.'
			},
			{
				add: [
					'app["Application: repo, path, destination"]',
					'argo --> app',
					'app -->|"sync"| k8s'
				],
				highlight: ['app'],
				note: 'An **Application** links one path in Git to one namespace in a cluster. Argo CD compares the target state (Git) with the live state (cluster) and shows Synced or OutOfSync.'
			},
			{
				add: [
					'hand["kubectl edit by hand"] -.->|"drift"| k8s',
					'argo -.->|"self-heal: undo"| k8s',
					'class hand ext'
				],
				highlight: ['hand', 'argo'],
				note: 'Someone edits the cluster by hand. Argo CD sees the drift. With **self-heal** on, it puts Git\'s version back within seconds. The Friday edit now has to go through a pull request.'
			}
		]
	},
	example: {
		title: 'docs/operator-manual/application.yaml',
		repo: 'argoproj/argo-cd',
		url: `${ARGO}/docs/operator-manual/application.yaml#L1-L233`,
		lang: 'yaml',
		code: `apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: guestbook
  # You'll usually want to add your resources to the argocd namespace.
  namespace: argocd
…
spec:
  # The project the application belongs to.
  project: default

  # Source of the application manifests
  source:
    repoURL: https://github.com/argoproj/argocd-example-apps.git  # Can point to either a Helm chart repo or a git repo.
    targetRevision: HEAD  # For Helm, this refers to the chart version.
    path: guestbook  # This has no meaning for Helm charts pulled directly from a Helm repo instead of git.
…
  # Destination cluster and namespace to deploy the application
  destination:
    # cluster API URL
    server: https://kubernetes.default.svc
    # or cluster name
    # name: in-cluster
    # The namespace will only be set for namespace-scoped resources that have not set a value for .metadata.namespace
    namespace: guestbook
…
  # Sync policy
  syncPolicy:
    automated: # automated sync by default retries failed attempts 5 times with following delays between attempts ( 5s, 10s, 20s, 40s, 80s ); retry controlled using \`retry\` field.
      enabled: true # Enables automated syncing of the application ( true by default ).
      prune: true # Specifies if resources should be pruned during auto-syncing ( false by default ).
      selfHeal: true # Specifies if partial app sync should be executed when resources are changed only in target Kubernetes cluster and no git change detected ( false by default ).`,
		notes: [
			'Argo CD\'s reference file has a comment on every field. A real Application needs only the three blocks kept here: `source`, `destination` and `syncPolicy`.',
			'Lines 13 to 16, `source`, point at a real repo, [argocd-example-apps](https://github.com/argoproj/argocd-example-apps/tree/8088f4c0d970abb09e250248cc97e35623447cb5/guestbook), folder `guestbook`: a plain Deployment and Service.',
			'Line 21, `server: https://kubernetes.default.svc`, is the cluster Argo CD itself runs in. The same Argo CD can also manage other clusters.',
			'Line 31, `prune: true`, deletes objects you removed from Git. Line 32, `selfHeal: true`, undoes manual changes. As a safety net, Argo CD sets **both to `false`** by default.'
		]
	},
	tradeoff: {
		gain: [
			'Every change is a commit: reviewed, signed off, and easy to revert with `git revert`.',
			'CI only needs write access to a Git repo, and the cluster credentials never leave the cluster.',
			'Argo CD shows drift as OutOfSync on its dashboard, and self-heal can undo it.'
		],
		cost: [
			'You run and upgrade Argo CD, with its own RBAC and its own outages.',
			'An emergency `kubectl edit` gets reverted. In an incident, you fix forward through Git, or pause auto-sync first.',
			'Secrets need care: you cannot commit them in plain text, so you add a tool that encrypts them or fetches them from a vault.'
		]
	},
	task: {
		prompt: 'Your team deploys with `helm upgrade` from a GitLab job that holds a cluster-admin kubeconfig. Write the steps to move to Argo CD, and say what the CI job does afterwards.',
		hint: 'Where does the desired state live, who applies it, and what happens to that kubeconfig?',
		answer: [
			'Put the chart and the per-environment values in a Git repo (the app repo or a separate config repo).',
			'Install Argo CD in the cluster. Create one Application per environment pointing at that path, with `automated` sync.',
			'Start with `selfHeal` off and watch the OutOfSync reports. Fix the drift you find, then turn self-heal on.',
			'The CI job now builds the image, pushes it, and **commits the new image tag** to the values file. It no longer talks to the cluster.',
			'Delete the cluster-admin kubeconfig from CI variables. CI then holds no credential for the cluster.'
		]
	},
	quiz: [
		{
			q: 'In a pull-based GitOps setup, who applies changes to the cluster?',
			options: [
				'The CI pipeline, with `kubectl apply` after each merge to the config repo',
				'The developer, from their laptop, once the pull request is approved',
				'An agent in the cluster, like Argo CD, that pulls the desired state from Git',
				'The Git server, through a webhook that runs `kubectl` on every push'
			],
			answer: 2,
			why: 'In the pull model the agent inside the cluster fetches the desired state and reconciles. CI only writes to Git and needs no cluster credentials.'
		},
		{
			q: 'An Argo CD Application has automated sync, but `selfHeal` is not set. Someone scales a Deployment by hand. What happens?',
			options: [
				'Argo CD reverts it within seconds, since automated sync is on',
				'Argo CD shows the app as OutOfSync but does not revert it on its own',
				'Argo CD deletes the Deployment, then recreates it from what is in Git',
				'Nothing: Argo CD cannot see changes that were made with kubectl'
			],
			answer: 1,
			why: 'By default, changes made to the live cluster do not trigger automated sync. Argo CD detects the drift, but only self-heal makes it act on it.'
		},
		{
			q: 'You delete a ConfigMap\'s file from the Git repo. Automated sync is on, `prune` is not set. What happens to the ConfigMap in the cluster?',
			options: [
				'It is deleted on the next sync, since it is no longer in Git',
				'It stays. Automated sync does not delete resources unless prune is enabled',
				'Argo CD recreates the missing file in Git from the live ConfigMap',
				'The whole Application is deleted, since its source has changed'
			],
			answer: 1,
			why: 'As a safety mechanism, automated sync will not delete resources missing from Git. You prune by hand, or set `prune: true`.'
		}
	],
	recall: {
		q: 'Someone runs `kubectl edit` on an app that Argo CD manages with automated sync. What does Argo CD do, with and without `selfHeal`?',
		a: 'It compares the live state with Git and shows the app as OutOfSync. Only with `selfHeal: true` does it put the Git version back on its own.'
	},
	sources: [
		{ title: 'OpenGitOps, the four principles', url: 'https://opengitops.dev/' },
		{ title: 'Argo CD docs, Core concepts', url: 'https://argo-cd.readthedocs.io/en/stable/core_concepts/' },
		{ title: 'Argo CD docs, Automated sync policy', url: 'https://argo-cd.readthedocs.io/en/stable/user-guide/auto_sync/' },
		{ title: 'Argo CD docs, Declarative setup', url: 'https://argo-cd.readthedocs.io/en/stable/operator-manual/declarative-setup/' }
	]
};
