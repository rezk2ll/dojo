const REPO = 'https://github.com/kubernetes/kubernetes/blob/8d9877ea2fe0c69580c5d730bccab6dc16a5c841';
const COMMUNITY = 'https://github.com/kubernetes/community/blob/440e496d3a172234d81728df1bfe43849b589adf';
const APISERVER = `${REPO}/staging/src/k8s.io/apiserver/pkg`;
const FLOW = `${REPO}/staging/src/k8s.io/api/flowcontrol/v1beta3`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'api-versioning',
	part: 'Built to last',
	title: 'API design and versioning',
	minutes: 10,
	hook: [
		'Your invoicing API returns `amount` on every invoice. A new teammate wants to call it `total`, because that is what it is. Rename it, deploy, and **every client that reads `amount` breaks** the same night: the mobile app, the accounting export, three customers\' scripts you have never seen.',
		'You cannot upgrade these clients yourself. The mobile app ships through app stores. The scripts belong to other companies. So **any client version can meet any server version**, and both have to keep working.',
		'The callers of an API are people and programs you do not control. You can change the API without breaking them in two ways: add fields instead of changing them, and let the client ask what the server supports. To retire an old shape, you **deprecate, measure, then remove** it. Kubernetes does all three in code.'
	],
	terms: [
		{ term: 'Backward-compatible change', def: 'Old consumers keep working without a change on their side: a new endpoint, a new optional field. Removing, renaming or retyping a field, or giving it a new meaning, is a breaking change.' },
		{ term: 'Tolerant reader', def: 'A consumer that reads only the fields it needs and ignores the rest. It lets the provider add fields without asking anyone.' },
		{ term: 'Capability negotiation', def: 'The server lists what it supports, and the client checks the list before it uses a feature. One client then works with servers of different ages.' },
		{ term: 'Deprecation', def: 'Saying that something will go away while it still works. Then count who still calls it, and remove it on a date (the sunset).' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['client["kubectl or a controller"] -->|"GET /apis"| api["kube-apiserver"]', 'api --> disc["Discovery: every group version served"]'],
				highlight: ['client', 'api', 'disc'],
				note: 'Before it uses a resource, a client can ask the **Discovery API**. The server lists every group version and resource it serves, and the client does capability negotiation against that list. A client that needs `flowcontrol.apiserver.k8s.io/v1` checks it is there first.'
			},
			{
				add: ['oldc["Old client: flowcontrol v1beta3"] -->|"GET FlowSchema"| api', 'newc["New client: flowcontrol v1"] -->|"GET FlowSchema"| api', 'api --> etcd[("etcd: one stored object")]', 'class etcd ext'],
				highlight: ['oldc', 'newc', 'etcd'],
				note: 'Both clients read the same object in etcd. The Kubernetes docs: "all the different versions are actually representations of the same persisted data". When PriorityLevelConfiguration renamed `assuredConcurrencyShares` to `nominalConcurrencyShares`, the rename shipped in a **new version** (v1beta3), and v1beta2 kept the old name.'
			},
			{
				add: ['api -->|"Warning: 299, deprecated in v1.29+"| oldc'],
				highlight: ['oldc'],
				note: 'v1beta3 is deprecated from v1.29, and each request to it gets a standard `Warning` response header. The status and body do not change, so old clients still work. kubectl prints the warning on stderr.'
			},
			{
				add: ['api -->|"apiserver_requested_deprecated_apis = 1"| metrics[("metrics and audit log")]'],
				highlight: ['metrics'],
				note: 'The same request also sets a gauge labelled with group, version, resource and `removed_release`, and adds `k8s.io/deprecated` to the audit event. The admin can see **who still calls the old shape** before the upgrade that removes it.'
			},
			{
				add: ['api -.->|"v1.32: not served"| gone["v1beta3 routes"]'],
				highlight: ['gone'],
				note: 'At v1.32, a release known in advance, the server stops serving v1beta3. Objects stored through it are still readable through v1. An admin who was not ready can set one env var to serve removed APIs for one more release.'
			}
		]
	},
	example: {
		title: 'staging/src/k8s.io/apiserver/pkg/endpoints/installer.go: every deprecated route warns and is counted',
		repo: 'kubernetes/kubernetes',
		url: `${APISERVER}/endpoints/installer.go#L782-L815`,
		lang: 'go',
		code: `		// accumulate endpoint-level warnings
		var (
			warnings       []string
			deprecated     bool
			removedRelease string
		)

		{
			versionedPtrWithGVK := versionedPtr.DeepCopyObject()
			versionedPtrWithGVK.GetObjectKind().SetGroupVersionKind(fqKindToRegister)
			currentMajor, currentMinor, _ := deprecation.MajorMinor(versioninfo.Get())
			deprecated = deprecation.IsDeprecated(versionedPtrWithGVK, currentMajor, currentMinor)
			if deprecated {
				removedRelease = deprecation.RemovedRelease(versionedPtrWithGVK)
				warnings = append(warnings, deprecation.WarningMessage(versionedPtrWithGVK))
			}
		}

		switch action.Verb {
		case request.MethodGet: // Get a resource.
…
				handler = metrics.InstrumentRouteFunc(action.Verb, group, version, resource, subresource, requestScope, metrics.APIServerComponent, deprecated, removedRelease, handler)
			}
			handler = utilwarning.AddWarningsHandler(handler, warnings)`,
		notes: [
			'The dates come from the type. FlowSchema v1beta3 only says `introduced=1.26` and names its replacement. A generator derives [`APILifecycleDeprecated` 1.29 and `APILifecycleRemoved` 1.32](' + FLOW + '/zz_generated.prerelease-lifecycle.go#L28-L50) from it: "introduced plus three minor", then "deprecated plus three minor". So the deprecation schedule is Go code that the API server reads.',
			'Lines 12 to 15 run when a route is installed. `IsDeprecated` compares those dates with the running version. `WarningMessage` builds a text like "is deprecated in v1.29+, unavailable in v1.32+; use flowcontrol.apiserver.k8s.io/v1 FlowSchema". The recorder writes it as a [`Warning` header with code 299](' + APISERVER + '/endpoints/filters/warning.go#L101-L111).',
			'Line 22 passes `deprecated` and `removedRelease` to the metrics wrapper. [`MonitorRequest`](' + APISERVER + '/endpoints/metrics/metrics.go#L588-L594) then sets `apiserver_requested_deprecated_apis` to 1 for that group, version and resource, and adds `k8s.io/deprecated` and `k8s.io/removed-release` to the audit event. The metric is declared STABLE, so dashboards can rely on it across releases.',
			'Removal happens in another file. [`ShouldServeForVersion`](' + APISERVER + '/server/deleted_kinds.go#L150-L171) stops serving a kind once the running release reaches its removed release. An admin can set `KUBE_APISERVER_SERVE_REMOVED_APIS_FOR_ONE_RELEASE` to "kick the can one release down the road", and no further.',
			'The [API changes guide](' + COMMUNITY + '/contributors/devel/sig-architecture/api_changes.md?plain=1#L115-L141) defines a compatible change: "Any API call ... that succeeded before your change must succeed after your change", and "Existing clients need not be aware of your change". Adding an optional field passes. Renaming one does not, so it waits for a new version.'
		]
	},
	tradeoff: {
		gain: [
			'A client written for v1beta3 kept working for three releases after v1 shipped, so its owner could upgrade on their own schedule.',
			'Deprecation reaches the caller, not only the docs: a header on every response, a metric and an audit entry for the operator.',
			'Additive changes need no coordination: a new optional field ships with the server alone, and tolerant readers ignore it.'
		],
		cost: [
			'The Kubernetes API server converts objects between every version it serves, and each conversion is code to keep and test.',
			'A bad field name stays in its version until that whole version is removed.',
			'Each capability check is an `if` in the client that someone must test against old and new servers.',
			'Without a count per route and a published removal date, an API can stay "deprecated" forever.'
		]
	},
	task: {
		prompt: 'Your invoicing API (`/v1/invoices`) must rename `amount` to `total`, and add an optional `currency`. Old clients must keep working for six months. Write the plan in four lines: what you ship now, what an old client sees, how you know when old clients are gone, and what you do on the removal date.',
		hint: 'Split the two changes first. Which one is additive? For the other one, copy the Kubernetes sequence: new version next to the old one, warn, measure, remove.',
		answer: [
			'Now: add `currency` to `/v1` as an optional field, since it breaks no one. Ship `/v2/invoices` with `total`, reading the same rows as `/v1`, so both are views of one invoice.',
			'Old client: `/v1` still answers with `amount`, plus a `Deprecation` header and a `Sunset` header carrying the removal date. Its code does not change and nothing breaks.',
			'Measure: count `/v1` calls per API key. Write to the owners of the keys that still call it, a few weeks before the date, not on the day.',
			'Removal date: when the count is zero (or the date has passed and every owner was told), answer `/v1` with `410 Gone` and a link to the migration note. Keep that answer for a while instead of a bare 404.'
		]
	},
	quiz: [
		{
			q: 'Which change to an existing API version is backward compatible for the clients that already call it?',
			options: [
				'Renaming `amount` to `total`, since every new client prefers that name',
				'Answering 404 for a deleted invoice instead of 200 with `deleted: true`',
				'Adding an optional `currency` field that old clients can just ignore',
				'Turning `status` from a number into a string such as "paid"'
			],
			answer: 2,
			why: 'Only the addition leaves every existing reader working, as long as readers are tolerant. A rename, a new status code for the same case, or a new type all break a client that was right yesterday.'
		},
		{
			q: 'A client calls a deprecated Kubernetes API version that is still served. What changes in the response?',
			options: [
				'The status becomes 299, and the body is the same object',
				'A `Warning` header is added. Status and body stay the same',
				'The server answers with the replacement version of the object',
				'Nothing until the removal release, when it starts answering 410'
			],
			answer: 1,
			why: 'The warning travels in a standard `Warning` header (code 299 is the header\'s warn-code, not the HTTP status). The status and the body do not change, so an old client keeps working while a person reading kubectl\'s output gets told.'
		},
		{
			q: 'Before upgrading to the release that stops serving an API version, what should a cluster admin check?',
			options: [
				'That the Go types are marked with a `deprecated` tag in the source',
				'That the release notes listed the version as deprecated a while ago',
				'That the new version returns exactly the same fields as the old one',
				'That `apiserver_requested_deprecated_apis` shows no calls for that version'
			],
			answer: 3,
			why: 'A tag and a release note say what the project intends. Only the metric (or the audit log) says whether something in this cluster still depends on it.'
		}
	],
	recall: {
		q: 'Which three steps does Kubernetes follow to retire FlowSchema v1beta3, and what does each one produce?',
		a: 'Deprecate: from v1.29 each call gets a `Warning` header with code 299. Measure: the `apiserver_requested_deprecated_apis` gauge and a `k8s.io/deprecated` audit entry. Remove: v1.32 stops serving v1beta3.'
	},
	sources: [
		{ title: 'Kubernetes, flowcontrol v1beta3 types.go', url: `${FLOW}/types.go#L120-L129` },
		{ title: 'Kubernetes, apiserver deprecation.go (IsDeprecated, WarningMessage)', url: `${APISERVER}/endpoints/deprecation/deprecation.go#L61-L134` },
		{ title: 'Kubernetes, apiserver metrics.go (STABLE metric)', url: `${APISERVER}/endpoints/metrics/metrics.go#L64-L71` },
		{ title: 'Kubernetes, apiserver deleted_kinds.go (serve removed APIs for one release)', url: `${APISERVER}/server/deleted_kinds.go#L53-L56` },
		{ title: 'Kubernetes, Deprecation Policy', url: 'https://kubernetes.io/docs/reference/using-api/deprecation-policy/' },
		{ title: 'Kubernetes, Deprecated API Migration Guide', url: 'https://kubernetes.io/docs/reference/using-api/deprecation-guide/' },
		{ title: 'Kubernetes blog, Warning: Helpful Warnings Ahead', url: 'https://kubernetes.io/blog/2020/09/03/warnings/' },
		{ title: 'Martin Fowler, TolerantReader', url: 'https://martinfowler.com/bliki/TolerantReader.html' },
		{ title: 'RFC 9745, The Deprecation HTTP Response Header Field (with Sunset, RFC 8594)', url: 'https://datatracker.ietf.org/doc/html/rfc9745' }
	]
};
