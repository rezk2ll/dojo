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
