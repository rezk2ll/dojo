const COSIGN = 'https://github.com/sigstore/cosign/blob/cfeaa4a435c9d42cf724b3e1aac20c1cc09c4be7';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'least-privilege',
	part: 'Threats',
	title: 'Least privilege',
	minutes: 10,
	hook: [
		'Between March 14 and March 15, 2025, someone moved the version tags of `tj-actions/changed-files`, a GitHub Action used by over 23,000 repositories, to a malicious commit, `0e58ed8`. Workflows that used a tag such as `@v44.5.1` ran the new code with no change on their side. The advisory is CVE-2025-30066.',
		'The new code downloaded a Python script that read the memory of the runner\'s worker process. It printed the secrets it found, base64 encoded, into the build log. In a public repository, anyone can read that log.',
		'Every affected repository ran the same script. What an attacker could do next was different in each one: it depended on what each leaked secret was allowed to do, and for how long. **Least privilege** limits each secret to what its job needs, so a leaked one can do less.'
	],
	terms: [
		{ term: 'Least privilege', def: 'Each process, user and token gets only the permissions its task needs, for only as long as it needs them.' },
		{ term: 'Blast radius', def: 'Everything an attacker can do with one stolen credential before it expires or someone revokes it.' },
		{ term: 'GITHUB_TOKEN', def: 'A token GitHub creates at the start of each workflow job. It works only on the repository of the workflow, has the permissions set by `permissions:`, and expires when the job finishes or after 24 hours at most.' },
		{ term: 'Role', def: 'In Kubernetes RBAC, a list of verbs allowed on resources in one namespace. A RoleBinding gives a Role to a user or a ServiceAccount.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['tag["tag v44.5.1 moved to 0e58ed8"] --> job["Workflow job runs the action"]', 'job --> dump["Script reads the runner memory"]', 'dump --> log["Secrets printed in the public log"]'],
				highlight: ['tag', 'dump', 'log'],
				note: 'The attack path is the same for every repository: the tag moves, the job runs the new code, the code dumps memory, the log shows the secrets. The defence in this chapter does not stop this path. It decides what the printed secrets can do afterwards.'
			},
			{
				add: ['log --> pat["Stored classic PAT: valid until someone revokes it"]'],
				highlight: ['pat'],
				note: 'A classic personal access token stored as a secret acts for the person who made it. GitHub\'s docs: it "can access every repository that you can access". It stays valid after the job ends, so the blast radius is every repo of that person, until someone rotates the token.'
			},
			{
				add: ['log --> wide["GITHUB_TOKEN, no permissions key, repo default read and write"]'],
				highlight: ['wide'],
				note: 'The `GITHUB_TOKEN` is limited to one repository and dies when the job finishes, at most 6 hours on GitHub-hosted runners. With a read and write default and no `permissions:` key, it can still write to the repository contents, for example create a release, while it lives.'
			},
			{
				add: ['log --> narrow["GITHUB_TOKEN with permissions: contents: read"]'],
				highlight: ['narrow'],
				note: 'With `permissions: contents: read`, the same leaked token can only read code the attacker may already see in a public repo. The docs: "If you specify the access for any of these permissions, all of those that are not specified are set to `none`." **The leak is the same, but the token can no longer write anything.**'
			},
			{
				add: ['sa["Kubernetes pod token: Role get on configmaps/app-config"] -.->|"same rule in a cluster"| narrow'],
				highlight: ['sa'],
				note: 'A pod gets a ServiceAccount token, and the same question applies when someone steals it. A Role with `resourceNames: ["app-config"]` and `verbs: ["get"]` lets the stolen token read one ConfigMap. A ClusterRoleBinding to `edit` would let it read Secrets in every namespace.'
			}
		]
	},
	example: {
		title: '.github/workflows/build.yaml in sigstore/cosign: no default access, three grants for one job',
		repo: 'sigstore/cosign',
		url: `${COSIGN}/.github/workflows/build.yaml#L32-L86`,
		lang: 'yaml',
		code: `permissions: {}

jobs:
  build:
    name: build
    runs-on: ubuntu-latest

    if: github.repository == 'sigstore/cosign'

    permissions:
      id-token: write
      contents: read
      packages: write

    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false

      - uses: sigstore/cosign-installer@6f9f17788090df1f26f669e9d70d6ae9567deba6 # v4.1.2
…
      - name: Login to GitHub Container Registry
        uses: docker/login-action@dbcb813823bdd20940b903addbd779551569679f # v4.6.0
        with:
          registry: ghcr.io
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}

      - name: containers-cosign
        run: make sign-ci-containers
        env:
          KO_PREFIX: ghcr.io/sigstore/cosign/cosign/ci
          COSIGN_PASSWORD: "\${{secrets.COSIGN_PASSWORD}}"
          LATEST_TAG: \${{ github.ref == 'refs/heads/main' && ',latest' || '' }}`,
		notes: [
			'`permissions: {}` at the top sets every permission to none for every job that does not set its own. The docs: "You can use the following syntax to disable permissions for all of the available permissions". A new job added to this file starts with a token that can do nothing.',
			'The `build` job then asks for three permissions, and each one matches a step. `contents: read` lets checkout fetch the code. `packages: write` lets `docker/login-action` push images to ghcr.io with `secrets.GITHUB_TOKEN`. `id-token: write` lets the job fetch an OIDC token, which the Google Cloud login step trades for short-lived cloud credentials.',
			'`persist-credentials: false` opts out of a checkout default. The checkout README: keeping the token "enables your scripts to run authenticated git commands", and it "is removed during post-job cleanup". Each `uses:` line also names a full 40-character commit SHA, which the tj-actions attackers could not move the way they moved tags. GitHub\'s guide: an attacker "would need to generate a SHA-1 collision for a valid Git object payload".',
			'If a step here leaked `GITHUB_TOKEN`, the attacker could publish packages for this repository until the job ends. It could not push a commit, since `contents` is `read`. `COSIGN_PASSWORD` is a stored secret that does not expire with the job, so it would still need rotation.'
		]
	},
	tradeoff: {
		gain: [
			'A leaked `GITHUB_TOKEN` with `contents: read` cannot push code, and it stops working when the job ends, at most 6 hours later on a GitHub-hosted runner.',
			'`permissions: {}` at the top makes each job list what it uses, so a reviewer can match `packages: write` to the one step that pushes an image.'
		],
		cost: [
			'Each new step that needs more access fails until someone adds the permission to the job.',
			'A narrow `permissions:` key does not limit stored secrets. In the tj-actions incident, the advisory asked users to "rotate any secrets that may have been exposed" whatever their token settings were.',
			'In Kubernetes, `resourceNames` cannot limit `create` or `deletecollection`. A pod that creates one ConfigMap gets the right to create any ConfigMap in its namespace.'
		]
	},
	task: {
		prompt: 'In namespace `shop`, a nightly pod `report` reads one ConfigMap, `report-config`, and nothing else. Its ServiceAccount `report` is bound to the built-in ClusterRole `edit` with a ClusterRoleBinding. Write down what a stolen token from this pod can do today, then the Role and RoleBinding that leave only what the pod needs, and the command that proves it.',
		hint: 'Look at two things: the binding kind (RoleBinding or ClusterRoleBinding) decides the namespaces, and the Role rules decide the verbs and objects.',
		answer: [
			'Today: a ClusterRoleBinding grants the ClusterRole "across the entire cluster (all namespaces)". The Kubernetes docs say `edit` "allows accessing Secrets and running Pods as any ServiceAccount in the namespace". So the token can read every Secret and start Pods in every namespace.',
			'Role in `shop`: `rules: [{ apiGroups: [""], resources: ["configmaps"], resourceNames: ["report-config"], verbs: ["get"] }]`. Then a RoleBinding in `shop` with `subjects: [{ kind: ServiceAccount, name: report, namespace: shop }]` and `roleRef: { apiGroup: rbac.authorization.k8s.io, kind: Role, name: report-reader }`. Delete the ClusterRoleBinding.',
			'Check: `kubectl auth can-i get configmaps/report-config -n shop --as system:serviceaccount:shop:report` answers `yes`, and `kubectl auth can-i list secrets -n shop --as system:serviceaccount:shop:report` answers `no`.',
			'Blast radius after: one ConfigMap, read only, in one namespace. Pods that call no API at all can also set `automountServiceAccountToken: false`, so there is no token to steal.'
		]
	},
	quiz: [
		{
			q: 'A workflow has `permissions: contents: read` at the top and nothing else. What can its `GITHUB_TOKEN` do with issues?',
			options: [
				'Read and write issues, because the repository default still applies',
				'Read issues only, because read access is given to every scope',
				'Nothing, because unlisted permissions are set to none',
				'Write issues only in pull requests opened from a fork'
			],
			answer: 2,
			why: 'Once you list any permission, GitHub sets every unlisted one to `none`. The repository default applies only when the workflow has no `permissions:` key at all.'
		},
		{
			q: 'Which secret printed in a public log on March 14, 2025 was still usable a day later?',
			options: [
				'The job\'s `GITHUB_TOKEN`, as long as it had write permissions',
				'A personal access token stored as a repository secret',
				'The cloud token the job got through OIDC with `id-token: write`',
				'None of them, because GitHub masks secrets in logs'
			],
			answer: 1,
			why: 'The `GITHUB_TOKEN` expires when the job finishes, 24 hours at most, and a cloud token from OIDC is "only valid for a single job". A stored personal access token stays valid until someone revokes it. Masking did not help: the script printed the secrets base64 encoded, and GitHub warns that redaction of a transformed secret "is not guaranteed".'
		},
		{
			q: 'Why does a ClusterRoleBinding to `edit` give a pod more than a RoleBinding to `edit` in its namespace?',
			options: [
				'A ClusterRoleBinding also grants permission to change RBAC roles',
				'A ClusterRoleBinding grants the role in every namespace of the cluster',
				'A ClusterRoleBinding token never expires, while a RoleBinding token does',
				'A ClusterRoleBinding also lets the pod log in to the node over SSH'
			],
			answer: 1,
			why: 'The binding sets the scope: a RoleBinding grants a role inside one namespace, and a ClusterRoleBinding grants it across all namespaces. `edit` itself does not allow changing roles. Token lifetime does not depend on the binding.'
		}
	],
	recall: {
		q: 'In the tj-actions/changed-files leak, which two properties of a token decided its blast radius?',
		a: 'Its permissions and its lifetime. A `GITHUB_TOKEN` with `contents: read` dies when the job ends; a stored personal access token keeps its full access until someone rotates it.'
	},
	sources: [
		{ title: 'GitHub advisory GHSA-mrrh-fwg8-r2c3 (CVE-2025-30066), tj-actions/changed-files', url: 'https://github.com/advisories/GHSA-mrrh-fwg8-r2c3' },
		{ title: 'GitHub docs, GITHUB_TOKEN', url: 'https://docs.github.com/en/actions/concepts/security/github_token' },
		{ title: 'GitHub docs, workflow syntax: permissions', url: 'https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions' },
		{ title: 'GitHub docs, Secure use reference', url: 'https://docs.github.com/en/actions/reference/security/secure-use' },
		{ title: 'GitHub docs, Managing your personal access tokens', url: 'https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens' },
		{ title: 'actions/checkout README', url: 'https://github.com/actions/checkout/blob/f548e57e544e1ff5a4c46bf1e1b8685f8e4a348a/README.md' },
		{ title: 'Kubernetes docs, Using RBAC Authorization', url: 'https://kubernetes.io/docs/reference/access-authn-authz/rbac/' },
		{ title: 'Kubernetes docs, Role Based Access Control Good Practices', url: 'https://kubernetes.io/docs/concepts/security/rbac-good-practices/' }
	]
};
