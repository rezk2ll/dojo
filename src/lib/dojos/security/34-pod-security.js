const K8S = 'https://github.com/kubernetes/kubernetes/blob/949f064e6d9e32f0a597795c265fcd50c6aad66e';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'pod-security',
	part: 'Running safely',
	title: 'Pod Security Standards',
	minutes: 10,
	hook: [
		'On 13 September 2021, Kubernetes published CVE-2021-25741 in the kubelet, rated High. A user could "create a container with subpath volume mounts to access files & directories outside of the volume, including on the host filesystem". The fixes shipped in 1.22.2, 1.21.5, 1.20.11 and 1.19.15.',
		'The advisory named the clusters hit hardest: those where admins had "restricted the ability to create hostPath mounts". The bug gave "hostPath-like access" without a `hostPath` field. One mitigation was to "use admission control to prevent less-trusted users from running containers as root".',
		'That admission control ships with Kubernetes. Pod Security Admission checks every new Pod against one of three **Pod Security Standards** levels, chosen by a label on the namespace.'
	],
	terms: [
		{ term: 'Pod Security Standards', def: 'Three policy levels defined by Kubernetes: `privileged` (no restriction), `baseline` (blocks known privilege escalations) and `restricted` (current hardening practice).' },
		{ term: 'Pod Security Admission', def: 'The admission controller built into the API server, stable since 1.25. It checks Pods against a level when they are created.' },
		{ term: 'Mode', def: 'What the controller does on a violation: `enforce` rejects the Pod, `audit` adds an annotation to the audit log, `warn` returns a warning to the user.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['dev["kubectl apply: Pod with hostPath / and privileged: true"] --> ns["Namespace shop, no pod-security label"]', 'ns -->|"default level: privileged"| node["Pod runs privileged, with the node’s / mounted"]'],
				highlight: ['dev', 'node'],
				note: 'The attack path. Without a label, the default configuration applies `enforce: "privileged"`, which has no restriction. Anyone allowed to create Pods in `shop` can mount `/` from the node and run a privileged container. The Standards page: privileged Pods "disable most security mechanisms".'
			},
			{
				add: ['lbl["Label: pod-security.kubernetes.io/enforce=baseline"] --> ns', 'ns -->|"checks: hostPath, privileged, host namespaces, added capabilities"| deny["Rejected: violates PodSecurity baseline:latest, hostPath volumes"]'],
				highlight: ['lbl', 'deny'],
				note: 'The defence. With `enforce=baseline`, the API server runs every baseline check on the Pod spec. The `hostPath` volume fails `CheckHostPathVolumes`, `privileged: true` fails the privileged check, and the request returns an error before anything is scheduled.'
			},
			{
				add: ['rst["restricted adds: runAsNonRoot, allowPrivilegeEscalation=false, drop ALL, seccomp RuntimeDefault"] --> lbl'],
				highlight: ['rst'],
				note: '`restricted` contains every baseline check and adds more. The Pod must set `runAsNonRoot: true`, `allowPrivilegeEscalation: false`, drop `ALL` capabilities and pick a seccomp profile. Only 8 volume types are allowed, among them `secret` and `emptyDir`.'
			},
			{
				add: ['warn["warn=restricted, audit=restricted"] -.->|"warnings and audit annotations, Pod still admitted"| ns'],
				highlight: ['warn'],
				note: 'To move up a level safely, set `warn` and `audit` to `restricted` while `enforce` stays at `baseline`. kubectl prints `Warning: would violate PodSecurity "restricted:latest"`, and the Pod is still created.'
			},
			{
				add: ['dep["Deployment created OK"] --> rs["ReplicaSet cannot create Pods: forbidden"]'],
				highlight: ['dep', 'rs'],
				note: 'The trap. The docs: "enforce mode is **not** applied to workload resources, only to the resulting pod objects". `kubectl apply` of a Deployment succeeds, then its ReplicaSet fails to create Pods. Only `warn` and `audit` look at the Deployment itself.'
			}
		]
	},
	example: {
		title: 'pod-security-admission/policy/check_hostPathVolumes.go: the baseline hostPath check',
		repo: 'kubernetes/kubernetes',
		url: `${K8S}/staging/src/k8s.io/pod-security-admission/policy/check_hostPathVolumes.go#L37-L76`,
		lang: 'go',
		code: `func init() {
	addCheck(CheckHostPathVolumes)
}

const checkHostPathVolumesID CheckID = "hostPathVolumes"

// CheckHostPathVolumes returns a baseline level check
// that requires hostPath=undefined/null in 1.0+
func CheckHostPathVolumes() Check {
	return Check{
		ID:    checkHostPathVolumesID,
		Level: api.LevelBaseline,
		Versions: []VersionedCheck{
			{
				MinimumVersion: api.MajorMinorVersion(1, 0),
				CheckPod:       hostPathVolumes_1_0,
			},
		},
	}
}

func hostPathVolumes_1_0(podMetadata *metav1.ObjectMeta, podSpec *corev1.PodSpec) CheckResult {
	var hostVolumes []string

	for _, volume := range podSpec.Volumes {
		if volume.HostPath != nil {
			hostVolumes = append(hostVolumes, volume.Name)
		}
	}

	if len(hostVolumes) > 0 {
		return CheckResult{
			Allowed:         false,
			ForbiddenReason: "hostPath volumes",
			ForbiddenDetail: fmt.Sprintf("%s %s", pluralize("volume", "volumes", len(hostVolumes)), joinQuote(hostVolumes)),
		}
	}

	return CheckResult{Allowed: true}
}`,
		notes: [
			'Line 38 registers the check through `init` when the package loads. Lines 27 to 35 of the file, above this excerpt, copy the control from the Standards page: "HostPath volumes must be forbidden."',
			'Line 48 sets `Level: api.LevelBaseline`. A namespace at `baseline` or `restricted` runs it, and `privileged` runs none.',
			'Lines 51 and 52 say the rule applies from policy version 1.0. The `enforce-version` label can pin a namespace to the checks of an older Kubernetes minor version.',
			'Lines 61 to 72 reject any volume with a `hostPath` field. For a volume named `host`, the user sees `violates PodSecurity "baseline:latest": hostPath volumes (volume "host")`.'
		]
	},
	tradeoff: {
		gain: [
			'No extra component to install: the controller is in the API server, and one label per namespace turns it on.',
			'`warn` and `audit` let you see which Pods would fail `restricted` before you enforce it.'
		],
		cost: [
			'Without labels or a cluster-wide default in the admission configuration, every namespace is `privileged`.',
			'Each level is a fixed set of checks. Allowing a known list of host ports, for example, is "not supported by the built-in Pod Security Admission controller".',
			'A Deployment that violates the enforced level is still created at `kubectl apply`. Only the Pods its ReplicaSet tries to create are rejected.'
		]
	},
	task: {
		prompt: 'Namespace `shop` runs with `enforce=baseline`. You add `warn=restricted`, apply the Pod `nginx` (image `nginx`, no `securityContext`), and get: `Warning: would violate PodSecurity "restricted:latest": allowPrivilegeEscalation != false (container "nginx" must set securityContext.allowPrivilegeEscalation=false), unrestricted capabilities (container "nginx" must set securityContext.capabilities.drop=["ALL"]), runAsNonRoot != true (pod or container "nginx" must set securityContext.runAsNonRoot=true), seccompProfile (pod or container "nginx" must set securityContext.seccompProfile.type to "RuntimeDefault" or "Localhost")`. Write the `securityContext` that makes the warning go away, and say what can still go wrong at start.',
		hint: 'Each item in the warning names one field. The `runAsNonRoot` field is also checked a second time, by the kubelet, against the image.',
		answer: [
			'Container level: `allowPrivilegeEscalation: false` and `capabilities: { drop: ["ALL"] }`.',
			'Pod or container level: `runAsNonRoot: true` and `seccompProfile: { type: RuntimeDefault }`. The restricted check accepts either level for these two.',
			'At start: the API doc for `runAsNonRoot` says the kubelet will "validate the image at runtime" and fail to start the container if it runs as UID 0. If the image’s user is root, also set `runAsUser` to a non-zero uid, or use an image with a non-root `USER`.',
			'Then switch the label to `pod-security.kubernetes.io/enforce=restricted`. Pods that still violate it are rejected from then on.'
		]
	},
	quiz: [
		{
			q: 'A namespace has no `pod-security.kubernetes.io` labels and the cluster uses the default admission configuration. Which level is enforced?',
			options: [
				'`restricted`, because Kubernetes 1.25 made it the default',
				'`baseline`, because it allows the default Pod configuration',
				'`privileged`, so the controller rejects nothing in that namespace',
				'None until the PodSecurity webhook is installed by hand'
			],
			answer: 2,
			why: 'The default `PodSecurityConfiguration` sets `enforce: "privileged"` when a mode label is not set. The privileged level is "defined by an absence of restrictions", so every Pod is admitted.'
		},
		{
			q: 'The namespace enforces `restricted`. You apply a Deployment whose Pod template runs as root. What do you see?',
			options: [
				'`kubectl apply` fails with a PodSecurity error on the Deployment',
				'The Deployment is created, and its ReplicaSet cannot create any Pod',
				'The Pods start, and the admission controller kills them a minute later',
				'The Pods start, because restricted only applies to Pods created by hand'
			],
			answer: 1,
			why: 'Enforce mode checks Pod objects only: the docs say it is "**not** applied to workload resources". The Deployment passes, and each Pod its ReplicaSet tries to create is rejected. `warn` and `audit` do check the Pod template.'
		},
		{
			q: 'Which of these does `baseline` allow but `restricted` rejects?',
			options: [
				'A container running as root with the default capabilities',
				'A Pod with a `hostPath` volume mounting `/var/log`',
				'A container with `privileged: true`',
				'A Pod with `hostNetwork: true`'
			],
			answer: 0,
			why: 'Baseline "allows the default (minimally specified) Pod configuration", which runs as the image’s user with the default capabilities. Restricted adds `runAsNonRoot: true` and drop `ALL`. hostPath, privileged and hostNetwork are already rejected by baseline.'
		}
	],
	recall: {
		q: 'Which label makes the API server reject Pods that mount a hostPath volume, and what does the error start with?',
		a: '`pod-security.kubernetes.io/enforce=baseline` (or `restricted`). The error starts with `violates PodSecurity "baseline:latest": hostPath volumes`.'
	},
	sources: [
		{ title: 'Kubernetes issue 104980, CVE-2021-25741: Symlink Exchange Can Allow Host Filesystem Access', url: 'https://github.com/kubernetes/kubernetes/issues/104980' },
		{ title: 'Kubernetes docs, Pod Security Standards', url: 'https://kubernetes.io/docs/concepts/security/pod-security-standards/' },
		{ title: 'Kubernetes docs, Pod Security Admission', url: 'https://kubernetes.io/docs/concepts/security/pod-security-admission/' },
		{ title: 'Kubernetes docs, Enforce Pod Security Standards by configuring the built-in admission controller', url: 'https://kubernetes.io/docs/tasks/configure-pod-container/enforce-standards-admission-controller/' },
		{ title: 'Kubernetes tutorial, Apply Pod Security Standards at the namespace level', url: 'https://kubernetes.io/docs/tutorials/security/ns-level-pss/' },
		{ title: 'Kubernetes source, pod-security-admission admission.go', url: `${K8S}/staging/src/k8s.io/pod-security-admission/admission/admission.go#L475-L484` },
		{ title: 'Kubernetes source, runAsNonRoot in core/v1 types.go', url: `${K8S}/staging/src/k8s.io/api/core/v1/types.go#L5276-L5283` }
	]
};
