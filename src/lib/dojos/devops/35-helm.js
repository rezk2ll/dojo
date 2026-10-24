const HELM = 'https://github.com/helm/examples/blob/4888ba8fb8180dd0c36d1e84c1fcafc6efd81532';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'helm',
	part: 'Kubernetes',
	title: 'Helm: a package manager for Kubernetes',
	minutes: 10,
	hook: [
		'Your app now has a Deployment, a Service, an Ingress, a ConfigMap and a PVC. Five YAML files. Staging needs 1 replica, production needs 3, and the image tag changes every release.',
		'You could copy the files per environment and edit them with `sed`. After a few releases the three copies differ, and nobody remembers which one is right.',
		'Helm does for Kubernetes what `apt` does for Debian. A **chart** is the package: templates (Kubernetes YAML with placeholders like `{{ .Values.replicaCount }}`) plus default values. You install it with your own values, and Helm records each install as a release with numbered revisions you can roll back.'
	],
	terms: [
		{ term: 'Chart', def: 'A Helm package: a `Chart.yaml`, a `values.yaml` with defaults, and a `templates/` folder of Kubernetes YAML with placeholders.' },
		{ term: 'Values', def: 'The settings fed into the templates. Defaults come from `values.yaml`, overrides from `-f file.yaml` or `--set key=value`.' },
		{ term: 'Release', def: 'One install of a chart in a cluster, with its own name. Install the same chart twice, you get two releases.' },
		{ term: 'Revision', def: 'A numbered version of a release. Every install, upgrade or rollback adds 1. The first is always 1.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: [
					'subgraph chart["Chart hello-world"]',
					'tpl["templates/deployment.yaml"]',
					'def["values.yaml: replicaCount 1"]',
					'end'
				],
				highlight: ['tpl', 'def'],
				note: 'A **chart** is a folder with `templates/` and `values.yaml`. The templates are your manifests with placeholders. `values.yaml` holds the defaults, so the chart installs with no extra values.'
			},
			{
				add: [
					'prod["prod.yaml: replicaCount 3"]',
					'set["--set image.tag=1.27"]',
					'helm["helm upgrade --install"]',
					'tpl --> helm',
					'def --> helm',
					'prod --> helm',
					'set --> helm'
				],
				highlight: ['prod', 'set', 'helm'],
				note: 'Values merge in order: chart defaults, then your `-f` files (the rightmost wins), then `--set` (wins over all). Each environment installs the same chart with its own values file, so no YAML is copied.'
			},
			{
				add: [
					'api["Kubernetes API server"]',
					'helm -->|"rendered manifests"| api'
				],
				highlight: ['api'],
				note: 'Helm renders the templates into plain YAML and sends it to the **API server**. From there, Kubernetes treats them like any other objects, and the controllers do their usual work.'
			},
			{
				add: [
					'rel[("Release my-app: revisions 1, 2, 3")]',
					'helm -->|"records"| rel'
				],
				highlight: ['rel'],
				note: 'Helm stores each **revision** of the release in the cluster, in Secrets in the release namespace by default. `helm history my-app` lists them.'
			},
			{
				add: [
					'rb["helm rollback my-app 2"]',
					'rb --> rel'
				],
				highlight: ['rb'],
				note: 'Revision 3 is broken? `helm rollback my-app 2` applies revision 2 again. Revisions 1 to 3 stay in the history, and the rollback is recorded as **revision 4**.'
			}
		]
	},
	example: {
		title: 'charts/hello-world/templates/deployment.yaml',
		repo: 'helm/examples',
		url: `${HELM}/charts/hello-world/templates/deployment.yaml#L1-L21`,
		lang: 'yaml',
		code: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "hello-world.fullname" . }}
  labels:
    {{- include "hello-world.labels" . | nindent 4 }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      {{- include "hello-world.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "hello-world.selectorLabels" . | nindent 8 }}
    spec:
      serviceAccountName: {{ include "hello-world.serviceAccountName" . }}
      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}`,
		notes: [
			'The Helm project publishes this example chart. It is a Deployment like the one from chapter 32, with `{{ }}` placeholders where values go.',
			'Line 8, `{{ .Values.replicaCount }}`, comes from [values.yaml](https://github.com/helm/examples/blob/4888ba8fb8180dd0c36d1e84c1fcafc6efd81532/charts/hello-world/values.yaml#L5-L11), where it is `1`. `--set replicaCount=3` changes it without touching the chart.',
			'On line 20, the image tag defaults to `.Chart.AppVersion`, the app version in [Chart.yaml](https://github.com/helm/examples/blob/4888ba8fb8180dd0c36d1e84c1fcafc6efd81532/charts/hello-world/Chart.yaml#L15-L24) (`1.16.0`). The chart\'s own `version` (`0.1.0`) is a separate field: `version` numbers the package, and `appVersion` numbers the app inside it.',
			'Lines 11 and 15 take the selector labels from a [helper](https://github.com/helm/examples/blob/4888ba8fb8180dd0c36d1e84c1fcafc6efd81532/charts/hello-world/templates/_helpers.tpl#L45-L51) that includes `.Release.Name`. Install the chart twice as two releases, and their Services never select each other\'s Pods.'
		]
	},
	tradeoff: {
		gain: [
			'Staging and production install the same chart and differ only in values, so their manifests keep the same shape.',
			'Helm keeps the history of each release, and `helm rollback` gets you back to a known good revision in one command.',
			'Ready-made charts for databases, monitoring stacks and ingress controllers, listed on [Artifact Hub](https://artifacthub.io), installed with your own values.'
		],
		cost: [
			'Templates in YAML are hard to read and easy to break: one wrong indent in `nindent` gives you invalid YAML.',
			'A third-party chart is code you run with cluster rights. Read its templates and values before you install it.',
			'If someone edits an object with `kubectl` by hand, the release no longer matches the cluster.'
		]
	},
	task: {
		prompt: 'Release `shop` is at revision 5 after `helm upgrade shop ./chart -f prod.yaml --set image.tag=2.4.0`. The new version crashes. Get back to the previous working state, then explain what the release history looks like afterwards, and how you would see the YAML Helm sends **before** the next upgrade.',
		hint: 'Rollback takes a revision number, and is itself recorded. One Helm command renders templates locally without touching the cluster.',
		answer: [
			'`helm history shop` to find the last good revision, say 4. Then `helm rollback shop 4` (with no number, Helm rolls back to the previous revision).',
			'History now shows revision **6**, a copy of revision 4. Revisions 1 to 5 are still there.',
			'Before the next upgrade, `helm template shop ./chart -f prod.yaml --set image.tag=2.4.1` prints the rendered manifests, so you can read or diff them first.',
			'Then fix the bug in the chart or the image, in Git, so the next upgrade does not bring it back.'
		],
		steps: [
			{
				title: 'Find the last good revision',
				questions: [
					{ q: 'Which command lists the revisions of `shop`?', options: ['`helm list shop`', '`helm history shop`', '`kubectl get revisions`', '`helm status shop --all`'], answer: 1, why: '`helm history` lists each numbered revision of a release.' },
					{ q: 'Where does Helm keep those revisions by default?', options: ['In Secrets in the release namespace', 'In a file next to `Chart.yaml`', 'In the chart repository', 'In your shell history'], answer: 0, why: 'Helm stores each revision in the cluster, in Secrets in the release namespace by default.' },
					{ q: 'The crash came with revision 5. Which revision is the likely last good one?', options: ['Revision 1, always', 'Revision 6', 'Revision 0', 'Revision 4, the one before the upgrade'], answer: 3, why: 'The upgrade that crashed created revision 5. The one before it was running fine.' },
					{ q: 'What added revision 5?', options: ['The crash itself', 'A `kubectl edit` by a teammate', 'The `helm upgrade` you ran', 'Helm, once a day'], answer: 2, why: 'Every install, upgrade or rollback adds 1 to the revision number.' }
				]
			},
			{
				title: 'Roll back',
				questions: [
					{ q: 'Which command goes back to revision 4?', options: ['`helm rollback shop 4`', '`helm upgrade shop --revision 4`', '`helm uninstall shop`', '`kubectl rollout undo shop`'], answer: 0, why: '`helm rollback` takes the release name and the revision to apply again.' },
					{ q: 'What does `helm rollback shop` do with no revision number?', options: ['It fails with a usage error', 'It rolls back to revision 1', 'It rolls back to the previous revision', 'It deletes revision 5'], answer: 2, why: 'With no number, Helm goes back to the previous revision.' },
					{ q: 'What does Helm send to the cluster on rollback?', options: ['Nothing: it only edits the history', 'A delete of every object in the release', 'The chart from your local folder again', 'The manifests of revision 4, sent again to the API server'], answer: 3, why: 'Helm applies revision 4 again. The controllers then roll the Pods back to the old image.' },
					{ q: 'A teammate fixed it with `kubectl set image` instead. What is the problem?', options: ['The release no longer matches the cluster', 'kubectl cannot change images', 'Helm deletes the Deployment', 'The Pods stop'], answer: 0, why: 'A hand edit is not in any revision. The next `helm upgrade` can undo it, and the history no longer tells the truth.' }
				]
			},
			{
				title: 'Read the history after',
				questions: [
					{ q: 'After the rollback, you run `helm upgrade` with the fixed tag `2.4.1`. Which revision does that upgrade create?', options: ['5, replacing the broken one', '6', '7', '1, a fresh start'], answer: 2, why: 'The rollback took 6, and every install, upgrade or rollback adds 1. Broken revision 5 is never reused, so the fix is 7.' },
					{ q: 'What does revision 6 contain?', options: ['A copy of revision 4', 'The broken image `2.4.0`', 'Nothing: it is a marker', 'Chart defaults only'], answer: 0, why: 'Revision 6 applies the content of revision 4 again.' },
					{ q: 'Is revision 5, the broken one, still in the history?', options: ['No: rollback deletes it', 'No: it is renamed to 4', 'Only if you passed `--keep`', 'Yes: revisions 1 to 5 stay'], answer: 3, why: 'Rollback never rewrites the past. The broken revision stays, which shows what happened.' },
					{ q: 'Why does it help that the rollback is a new revision?', options: ['It frees disk space', 'The history shows every change in order, rollbacks included', 'It makes the next upgrade faster', 'It hides the crash from the team'], answer: 1, why: 'You can read the release story top to bottom: what went out, what broke, what you went back to.' }
				]
			},
			{
				title: 'Preview the next upgrade',
				questions: [
					{ q: 'Which command prints the YAML Helm would send, without touching the cluster?', options: ['`helm install --force`', '`helm get values shop`', '`helm template shop ./chart -f prod.yaml --set image.tag=2.4.1`', '`kubectl diff shop`'], answer: 2, why: '`helm template` renders the templates locally with your values and prints plain manifests.' },
					{ q: 'Why pass the same `-f prod.yaml` to `helm template`?', options: ['Without it you see chart defaults, not what production gets', 'helm template refuses to run without a file', 'It uploads the file to the cluster', 'It locks the release'], answer: 0, why: 'Values change what the templates produce. Preview with the values you will really use.' },
					{ q: 'Your chart has the image line of the example. Neither `prod.yaml` nor `values.yaml` sets `image.tag`, and you drop the `--set`. Which tag does the template render?', options: ['`latest`', 'An empty tag, so the YAML is invalid', 'The chart\'s `version`', 'The chart\'s `appVersion` from `Chart.yaml`'], answer: 3, why: 'The image line uses `.Values.image.tag | default .Chart.AppVersion`. `version` numbers the chart package, not the app.' },
					{ q: 'Where does the real fix go, so the next upgrade does not bring the crash back?', options: ['A note in the release history', 'In Git, in the chart or the image', 'A `kubectl patch` on the Deployment', 'Nowhere: rollback is enough'], answer: 1, why: 'Rollback only buys time. The bug is still in `2.4.0` until someone fixes the code or the chart.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'In Helm, what is a release?',
			options: [
				'A packaged chart uploaded to a repository, with its own version number',
				'One install of a chart in a cluster, with its own name and revision history',
				'A Git tag on the chart\'s source, cut when the chart version is bumped',
				'The `values.yaml` file of a chart'
			],
			answer: 1,
			why: 'The chart is the package you install. A release is one install of it in a cluster, with its own name. Install the same chart twice and you have two releases.'
		},
		{
			q: 'You run `helm install my-app ./chart -f a.yaml -f b.yaml --set replicas=5`. Both files set `replicas`. Which value wins?',
			options: ['The one in `a.yaml`', 'The one in `b.yaml`', '`5`', 'The chart default in `values.yaml`'],
			answer: 2,
			why: 'Chart defaults are overridden by `-f` files (rightmost wins among them), and `--set` overrides them all.'
		},
		{
			q: 'Release `api` is at revision 3. You run `helm rollback api 1`. What is the revision number now?',
			options: ['1', '3', '4', '2'],
			answer: 2,
			why: 'Every install, upgrade or rollback adds a revision. The rollback is recorded as revision 4, with the content of revision 1.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Ship a bad upgrade with Helm, roll it back, read the history, and preview the YAML before the next upgrade.',
		steps: [
			'Start a local cluster with `minikube start`, then make a chart: `mkdir -p ~/helm-lab && cd ~/helm-lab && helm create shop`.',
			'Install it and upgrade it once: `helm install shop ./shop --set image.tag=1.27`, then `helm upgrade shop ./shop --set image.tag=1.27 --set replicaCount=2`.',
			'Ship a broken release: `helm upgrade shop ./shop --set image.tag=does-not-exist`. Wait a few seconds, then run `kubectl get pods -l app.kubernetes.io/instance=shop` and `helm history shop`.',
			'Go back to the last good revision: `helm rollback shop 2`, then `helm history shop` and `kubectl get secrets -l owner=helm`.',
			'Preview the next upgrade without touching the cluster: `helm template shop ./shop --set image.tag=1.27 | grep image:`. Clean up with `helm uninstall shop`.'
		],
		done: [
			'After the bad upgrade, one new Pod sits in `ErrImagePull` or `ImagePullBackOff`, and `helm history shop` shows revision 3 as `deployed`.',
			'After the rollback, `helm history shop` shows revision 4 with the description `Rollback to 2`, and revisions 1 to 3 are still listed.',
			'`kubectl get secrets -l owner=helm` lists one Secret per revision, `sh.helm.release.v1.shop.v1` to `v4`.',
			'`helm template` prints `image: "nginx:1.27"` for the Deployment (the `busybox` line is the chart\'s test Pod), and `helm list` is unchanged by it.'
		],
		solution: [
			'Revision 2 was the last good one: it set the tag `1.27` and 2 replicas. `helm rollback shop 2` sends its manifests again and records that as revision 4.',
			'`helm upgrade` with `--set` starts again from the chart defaults: that is why every upgrade above repeats `image.tag=1.27`.',
			'The broken revision stays in the history, so the record shows what went out and what you went back to. The real fix still goes in Git.'
		]
	},
	recall: {
		q: 'You run `helm upgrade` on a chart with defaults in `values.yaml`, two `-f` files and one `--set`. Which value wins?',
		a: '`--set` wins over everything. Among the `-f` files the rightmost wins, and the chart defaults in `values.yaml` come last.'
	},
	sources: [
		{ title: 'Helm docs, Introduction to Helm', url: 'https://helm.sh/docs/intro/introduction/' },
		{ title: 'Helm docs, Using Helm', url: 'https://helm.sh/docs/intro/using_helm/' },
		{ title: 'Helm docs, Values Files', url: 'https://helm.sh/docs/chart_template_guide/values_files/' },
		{ title: 'Helm docs, helm rollback', url: 'https://helm.sh/docs/helm/helm_rollback/' },
		{ title: 'helm/examples, hello-world chart', url: `${HELM}/charts/hello-world` }
	]
};
