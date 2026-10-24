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
		],
		steps: [
			{
				title: 'Put the desired state in Git',
				questions: [
					{ q: 'Today, what is wrong with the GitLab job from a security view?', options: ['It runs Helm, which is deprecated', 'It deploys too slowly', 'It holds admin credentials to the cluster', 'It cannot roll back'], answer: 2, why: 'In a push deploy, CI needs admin credentials to the cluster. That kubeconfig is the thing to remove.' },
					{ q: 'What goes into the Git repo first?', options: ['The chart and the values for each environment', 'The cluster-admin kubeconfig', 'The built image', 'A copy of `kubectl get all -o yaml`'], answer: 0, why: 'Git becomes the desired state, so the chart and its per-environment values must live there.' },
					{ q: 'Which repo can hold them?', options: ['Only the Argo CD repo', 'Only a repo with no code in it', 'Only the GitLab CI repo', 'The app repo or a separate config repo'], answer: 3, why: 'Both work. What matters is one path per environment that Argo CD can watch.' },
					{ q: 'What should never go in that repo in plain text?', options: ['The image tag', 'Secrets', 'The replica count', 'The Service port'], answer: 1, why: 'You cannot commit secrets in plain text. Add a tool that encrypts them or fetches them from a vault.' }
				]
			},
			{
				title: 'Let Argo CD apply it',
				questions: [
					{ q: 'Argo CD deploys to the cluster it runs in. Which `destination.server` does each Application use?', options: ['`https://kubernetes.default.svc`', 'The GitLab runner\'s address', 'The URL of the config repo', 'The API server address from the old cluster-admin kubeconfig'], answer: 0, why: '`https://kubernetes.default.svc` is the in-cluster address of the API server. Argo CD reaches it from inside, with no kubeconfig handed out.' },
					{ q: 'How many Applications do you create?', options: ['One for the whole company', 'One per Git commit', 'One per environment', 'One per Pod'], answer: 2, why: 'An Application links one path in Git to one namespace in a cluster, so each environment gets its own.' },
					{ q: 'Which three blocks does an Application need?', options: ['`image`, `replicas`, `ports`', '`source`, `destination`, `syncPolicy`', '`metadata`, `status`, `events`', '`values`, `chart`, `kubeconfig`'], answer: 1, why: 'Where the manifests are, where they go, and how to sync.' },
					{ q: 'How fast does Argo CD notice a new commit by default?', options: ['Instantly, through a hook in CI', 'Once a day', 'Only when you click Sync', 'Within 3 minutes, by polling'], answer: 3, why: 'It polls the repo every 3 minutes at most by default.' }
				]
			},
			{
				title: 'Find the drift, then heal it',
				questions: [
					{ q: 'Why start with `selfHeal` off?', options: ['To see the drift first, before Argo CD overwrites it', 'Because self-heal needs a paid plan', 'Because `automated` sync breaks with it', 'Because Argo CD cannot detect drift with it on'], answer: 0, why: 'Hand edits may hide real fixes. Read the OutOfSync reports, move what matters into Git, then turn self-heal on.' },
					{ q: 'The drift report shows production at 5 replicas, set by hand, while the values file says 3. What do you do before turning self-heal on?', options: ['Turn self-heal on and let it pick', 'Delete the Application and create it again', 'Decide which count is right and commit it to the values file', 'Run `helm upgrade` from CI one last time'], answer: 2, why: 'Self-heal puts Git\'s version back. If 5 is the count production needs, it must be in Git first, or self-heal drops it to 3.' },
					{ q: 'Self-heal is on. The team needs more memory for the app on Friday. Where does that change go?', options: ['`kubectl edit` on the Deployment', 'A pull request to the values file in Git', 'A new GitLab job with the old kubeconfig', 'The Argo CD dashboard, by hand'], answer: 1, why: 'A hand edit is undone within seconds. Git is the desired state, so the change goes through review and Argo CD applies it.' },
					{ q: 'In an incident you need a hand fix right away. What do you do?', options: ['Edit and hope self-heal is slow', 'Delete Argo CD', 'Turn off RBAC', 'Fix forward through Git, or pause auto-sync first'], answer: 3, why: 'An emergency edit gets reverted. Go through Git, or pause sync on purpose.' }
				]
			},
			{
				title: 'Strip CI down',
				questions: [
					{ q: 'What does the CI job do now, after building and pushing the image?', options: ['Runs `helm upgrade` with a smaller kubeconfig', 'Commits the new image tag to the values file', 'Calls the Argo CD API to deploy', 'Nothing more'], answer: 1, why: 'CI only writes to Git. Argo CD sees the new tag and applies it.' },
					{ q: 'Does the CI job still talk to the cluster?', options: ['No', 'Yes, to check Pods', 'Yes, to run migrations', 'Only on failure'], answer: 0, why: 'In the pull model, CI needs write access to a repo and nothing else.' },
					{ q: 'What happens to the cluster-admin kubeconfig?', options: ['Kept as a backup in CI', 'Moved to another CI variable', 'Deleted from the CI variables', 'Given to Argo CD'], answer: 2, why: 'CI then holds no credential for the cluster at all.' },
					{ q: 'A bad tag reaches production. How do you roll back?', options: ['`helm rollback` from your laptop', '`kubectl edit` the Deployment', 'Wait for self-heal', '`git revert` the commit that bumped the tag'], answer: 3, why: 'Every change is a commit, so going back is a revert, reviewed like any other change.' }
				]
			}
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
	lab: {
		minutes: 20,
		goal: 'Build a tiny pull agent with Git and `kubectl`, and watch it undo a hand edit, apply a commit, and leave a deleted file\'s object alone, as Argo CD does without `prune`.',
		steps: [
			'Start a local cluster with `minikube start`. Make a bare repo as the "Git server", and a working copy: `mkdir -p ~/gitops-lab && cd ~/gitops-lab && git init -q --bare remote.git && git clone -q remote.git config`.',
			'Commit the desired state: `cd ~/gitops-lab/config && kubectl create deployment web --image=nginx:1.27 --replicas=2 --dry-run=client -o yaml > web.yaml && git add web.yaml && git commit -qm "web: 2 replicas" && git push -q origin HEAD`.',
			'In a second terminal, start the agent. It pulls Git and applies only when the cluster differs: `cd ~/gitops-lab && git clone -q remote.git agent && cd agent && while true; do git pull -q; kubectl diff -f . >/dev/null || kubectl apply -f .; sleep 10; done`.',
			'Make a Friday edit: `kubectl scale deployment web --replicas=5`, wait 15 seconds, then `kubectl get deployment web`.',
			'Change it the GitOps way: in `~/gitops-lab/config`, change `replicas: 2` to `replicas: 3` in `web.yaml`, then `git commit -qam "web: 3 replicas" && git push -q origin HEAD`. Then add and remove a ConfigMap: `kubectl create configmap motd --from-literal=msg=hello --dry-run=client -o yaml > motd.yaml && git add motd.yaml && git commit -qm "add motd" && git push -q origin HEAD`, wait 20 seconds, then `git rm -q motd.yaml && git commit -qm "remove motd" && git push -q origin HEAD`. Stop the agent with Ctrl-C and clean up with `kubectl delete deployment web && kubectl delete configmap motd`.'
		],
		done: [
			'After `kubectl scale --replicas=5`, `kubectl get deployment web` is back to `2/2` within about 10 seconds, and the agent printed `deployment.apps/web configured`.',
			'After the push of `replicas: 3`, the Deployment shows `3/3` with no `kubectl` command from you.',
			'After `git rm motd.yaml` and a sync, `kubectl get configmap motd` still finds it.',
			'`git log --oneline` in `config` lists every change you made to the cluster.'
		],
		solution: [
			'`kubectl diff` exits non-zero when the live state differs from the files. That is drift, and the agent applies Git again: a self-heal.',
			'Only the agent ever talks to the cluster here. Your "CI" is a `git push`, which is the point of a pull deploy.',
			'`kubectl apply -f .` never deletes an object whose file is gone, like Argo CD with `prune` off. You delete it by hand, or turn pruning on.'
		]
	},
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
