const K8S = 'https://github.com/kubernetes/kubernetes/blob/53fa80f55b15df3612f84b4ca8add27af9361379';
const HELPER = `${K8S}/cluster/gce/gci/configure-helper.sh`;
const AUDIT_DOCS = 'https://kubernetes.io/docs/tasks/debug/debug-cluster/audit/';
const AUDIT_API = 'https://kubernetes.io/docs/reference/config-api/apiserver-audit.v1/';
const OWASP = 'https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'audit-logs',
	part: 'Running safely',
	title: 'Logs that help after a breach',
	minutes: 10,
	hook: [
		'In August 2019, a security audit of Kubernetes found that kube-apiserver wrote bearer tokens into its system logs at verbosity `--v 10`. The finding became CVE-2019-11250. Its exploit scenario: "Eve, who has access to the logs but not the production Kubernetes cluster, replays Alice’s Bearer token, and can masquerade as Alice to the cluster."',
		'In October 2020, CVE-2020-8565 reported that the fix was incomplete. At log level 9 or higher, "authorization and bearer tokens will be written to log files", in API server logs and in `kubectl` output. Kubernetes 1.20.0, 1.19.6, 1.18.14 and 1.17.16 fixed it.',
		'After a breach, someone reads the logs to find out who did what, and when. The same logs must not give a reader a working token.'
	],
	terms: [
		{ term: 'Audit log', def: 'A record of security events in time order: who acted, on what, from where, when, and with what result. Kubernetes writes one per API request when kube-apiserver gets an audit policy.' },
		{ term: 'Bearer token', def: 'A string that proves a past login. Whoever holds it is treated as its owner, with no further check.' },
		{ term: 'Audit level', def: 'How much of a request Kubernetes records: `None`, `Metadata` (user, time, verb, resource), `Request` (plus the request body) or `RequestResponse` (plus the response body).' },
		{ term: 'Retention period', def: 'The number of days a log file is kept before deletion. OWASP says logs "must not be destroyed before the duration of the required data retention period, and must not be kept beyond this time".' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['req["kubectl get secret db-password, header Authorization: Bearer token"] --> api["kube-apiserver running with --v=10"]'],
				highlight: ['req', 'api'],
				note: 'Alice runs `kubectl`, which sends her bearer token in the `Authorization` header. The API server runs at verbosity 10, a debug level meant for chasing bugs.'
			},
			{
				add: ['api --> syslog[("System log: request headers, token included")]', 'eve["Eve: may read the logs, has no cluster account"] --> syslog'],
				highlight: ['syslog', 'eve'],
				note: 'At that level the server writes the request headers to its system log, token included (CVE-2019-11250). Eve can read the log files but has no account on the cluster.'
			},
			{
				add: ['eve -->|"replays Alice’s token"| api'],
				highlight: ['eve', 'api'],
				note: 'Eve copies the token and sends her own requests with it. The API server sees a valid token and treats every request as Alice’s. Nothing in the request shows that someone else sent it.'
			},
			{
				add: ['fix["Fixed versions strip tokens; production runs at a low verbosity"] -.->|"no token to copy"| syslog'],
				highlight: ['fix'],
				note: 'The defence starts with the log line: tokens, passwords and session ids never go in it, at any level. The CVE-2020-8565 advisory adds: "Do not enable verbose logging in production, limit access to logs."'
			},
			{
				add: ['api --> audit[("Audit log: user, sourceIPs, verb, objectRef, response code")]', 'inv["Investigator: who read db-password, from which IP, at what time"] --> audit'],
				highlight: ['audit', 'inv'],
				note: 'The audit log is a separate record that keeps the facts and leaves out the secrets. For a `get` on a Secret at the `Metadata` level, it records the user, the source IPs, the verb, the object and the status code, with no body.'
			}
		]
	},
	example: {
		title: 'cluster/gce/gci/configure-helper.sh: the audit policy Kubernetes ships for GCE',
		repo: 'kubernetes/kubernetes',
		url: `${HELPER}#L1224-L1287`,
		lang: 'yaml',
		code: `  # Don't log these read-only URLs.
  - level: None
    nonResourceURLs:
      - /healthz*
      - /version
      - /swagger*

  # Don't log events requests because of performance impact.
  - level: None
    resources:
      - group: "" # core
        resources: ["events"]
…
  # Secrets, ConfigMaps, TokenRequest and TokenReviews can contain sensitive & binary data,
  # so only log at the Metadata level.
  - level: Metadata
    resources:
      - group: "" # core
        resources: ["secrets", "configmaps", "serviceaccounts/token"]
      - group: authentication.k8s.io
        resources: ["tokenreviews"]
    omitStages:
      - "RequestReceived"
  # Get responses can be large; skip them.
  - level: Request
    verbs: ["get", "list", "watch"]
    resources: \${known_apis}
    omitStages:
      - "RequestReceived"
  # Default level for known APIs
  - level: RequestResponse
    resources: \${known_apis}
    omitStages:
      - "RequestReceived"
  # Default level for all other requests.
  - level: Metadata
    omitStages:
      - "RequestReceived"`,
		notes: [
			'Kubernetes checks the rules from top to bottom. The [auditing docs](' + AUDIT_DOCS + '): "The first matching rule sets the _audit level_ of the event." So the `None` rules for `/healthz*` and `events` sit at the top, and the `Metadata` catch-all sits last.',
			'The `Metadata` rule for `secrets`, `serviceaccounts/token` and `tokenreviews` comes before the `Request` and `RequestResponse` rules. A `get` on a Secret matches it first, so the log records who read the Secret but never the response body that holds its value.',
			'The `RequestResponse` rule records both bodies for writes to known APIs. When someone patches a Deployment, the event shows the new image name and who sent the patch.',
			'`omitStages: RequestReceived` drops the event written when the request arrives. The `ResponseComplete` event still carries the response code. The [Event reference](' + AUDIT_API + ') warns about `sourceIPs`: "All but the last IP can be arbitrarily set by the client."'
		]
	},
	tradeoff: {
		gain: [
			'Each event names the user, the verb, the object and the source IPs, so an investigator can list every read of `db-password` in the last 30 days.',
			'The `Metadata` level on Secrets records the read without storing the Secret value, so a person who reads the audit log gets no credential.',
			'Dropping `/healthz*` and `events` at the top of the policy removes the most frequent, lowest risk requests from the volume.'
		],
		cost: [
			'The docs: "The audit logging feature increases the memory consumption of the API server". `RequestResponse` on every write adds the full bodies to each event.',
			'In webhook `batch` mode, events are dropped when the buffer of 10000 events overflows. The metric `apiserver_audit_error_total` counts the losses.',
			'Without `--audit-policy-file`, "no events are logged". A cluster that never set the flag has no audit trail to read after a breach.',
			'`--audit-log-maxage` deletes old files after a set number of days. A breach found after that window has no audit trail for its first weeks.'
		]
	},
	task: {
		prompt: 'Here are five lines from a web app log. Mark each line: keep, change or remove. Then say what one line is missing.\n\n```\n09:14:07 INFO  login ok user=alice ip=203.0.113.7\n09:14:07 DEBUG session created sid=9f2c4e1a7b3d\n09:15:42 INFO  POST /admin/users role=admin target=bob\n09:16:03 WARN  login failed user=bob password=Summer2026! ip=198.51.100.23\n09:17:30 INFO  GET /api/orders Authorization="Bearer eyJhbGciOi..."\n```',
		hint: 'Check each value against the OWASP list of data to keep out of logs: session ids, access tokens, passwords. Then check each event for when, where, who and what.',
		answer: [
			'Line 1: keep. A login success with the user and the IP is an event OWASP says to always log.',
			'Line 2: change. A session id in a log works like a password for that session. OWASP says to consider "replacing with a hashed value" when you need to follow one session across events.',
			'Line 4: change. Keep the failed login, the user and the IP, because repeated failures show credential stuffing. Remove `password=Summer2026!`: OWASP lists authentication passwords among the values to keep out of logs.',
			'Line 5: remove the `Authorization` value. It is a bearer token, the same mistake as CVE-2019-11250. Line 3 is missing who acted and the result: `actor=alice action=grant_role role=admin target=bob result=success`.'
		]
	},
	quiz: [
		{
			q: 'An audit policy has `- level: Metadata` as its first rule and `- level: None` for `/healthz*` as its second. What happens to health check requests?',
			options: [
				'They are dropped, because a `None` rule always wins over other rules',
				'They are logged at `Metadata`, because the first matching rule sets the level',
				'They are logged twice, once for each rule that matches them',
				'The API server refuses to start, because two rules match the same path'
			],
			answer: 1,
			why: 'Kubernetes compares each request with the rules in order and stops at the first match. A catch-all at the top matches everything, so no rule below it ever applies.'
		},
		{
			q: 'Why does the GCE policy log `secrets` at `Metadata` and not at `RequestResponse`?',
			options: [
				'Secrets are encrypted at rest, so logging their body would show only ciphertext',
				'The response body of a `get` on a Secret holds its value, and `Metadata` keeps no body',
				'`RequestResponse` is only allowed for non-resource URLs like `/healthz`',
				'Secrets change too rarely for their events to be worth any detail'
			],
			answer: 1,
			why: '`Metadata` records the user, timestamp, resource and verb but no request or response body. The log still shows who read the Secret, and a person who reads the log does not get the value.'
		},
		{
			q: 'CVE-2020-8565: kube-apiserver at log level 9 writes bearer tokens to its logs. Before you can upgrade, what does the advisory tell you to do?',
			options: [
				'Rotate the API server TLS certificate so that old tokens stop working',
				'Turn on audit logging at `RequestResponse` to see who used the tokens',
				'Keep verbose logging off in production and limit who can read the logs',
				'Move the log files to a disk mounted with the `noexec` option'
			],
			answer: 2,
			why: 'The advisory says: "Do not enable verbose logging in production, limit access to logs." The token only reaches the log at level 9 or higher, and only a reader of the log can replay it. A TLS certificate does not sign bearer tokens, so rotating it leaves them valid.'
		}
	],
	recall: {
		q: 'In a Kubernetes audit policy, which level records who read a Secret without storing its value?',
		a: '`Metadata`: user, timestamp, resource and verb, with no request or response body. The GCE policy uses it for `secrets`, `configmaps`, `serviceaccounts/token` and `tokenreviews`.'
	},
	sources: [
		{ title: 'OWASP Logging Cheat Sheet', url: OWASP },
		{ title: 'Kubernetes docs, Auditing', url: AUDIT_DOCS },
		{ title: 'Kubernetes docs, kube-apiserver Audit Configuration (v1)', url: AUDIT_API },
		{ title: 'kubernetes/kubernetes#81114, CVE-2019-11250: Bearer tokens are revealed in logs', url: 'https://github.com/kubernetes/kubernetes/issues/81114' },
		{ title: 'kubernetes/kubernetes#95623, CVE-2020-8565: token leak in logs when logLevel >= 9', url: 'https://github.com/kubernetes/kubernetes/issues/95623' },
		{ title: 'Kubernetes source, cluster/gce/gci/configure-helper.sh (audit policy)', url: `${HELPER}#L1128-L1288` }
	]
};
