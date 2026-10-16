const EXAMPLES = 'https://github.com/kubernetes/examples/blob/d6b8cd27eacb51e651a1aa6f7c190a28713eff6e';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'config-and-health',
	part: 'Kubernetes',
	title: 'Config, health checks and resources',
	minutes: 10,
	hook: [
		'On a VM you had `/etc/myapp/app.conf`, a password in `/etc/myapp/secret`, and a Nagios check that paged you when `/health` stopped answering. The kernel decided who got RAM when the box was full.',
		'Kubernetes has a place for each of these. Config goes in a **ConfigMap**. Passwords go in a **Secret**. Health checks become **probes**, and the kubelet acts on them by itself.',
		'And RAM and CPU are no longer first come, first served. Each container says what it **needs** (requests) and the most it may **take** (limits). Get these wrong and your Pod never starts, or gets killed at the busiest hour.'
	],
	terms: [
		{ term: 'ConfigMap', def: 'An object holding plain settings as keys and values. Mounted as files or passed as environment variables. Not for secrets, and at most 1 MiB.' },
		{ term: 'Secret', def: 'Like a ConfigMap, for sensitive values. By default stored **unencrypted** in etcd. Values in `data` are base64, which hides nothing.' },
		{ term: 'Probe', def: 'A check the kubelet runs on a container: an HTTP GET, a TCP connect, a gRPC call or a command.' },
		{ term: 'Request', def: 'The CPU and memory the scheduler reserves for a container when it picks a node.' },
		{ term: 'Limit', def: 'The most a container may use. Over the CPU limit, it is throttled. Over the memory limit, it may be OOM killed.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: [
					'cm["ConfigMap app-config"]',
					'sec["Secret db-password"]',
					'subgraph pod["Pod"]',
					'c["container"]',
					'end',
					'cm -->|"files in /etc/app"| c',
					'sec -->|"env DB_PASSWORD"| c'
				],
				highlight: ['cm', 'sec'],
				note: 'Same image in every environment, different **ConfigMap** and **Secret**. Mounted as files (without `subPath`), a ConfigMap update reaches the Pod after a short delay. As environment variables, it needs a Pod restart.'
			},
			{
				add: [
					'kl["kubelet"]',
					'kl -.->|"startup probe"| c'
				],
				highlight: ['kl'],
				note: 'The **startup probe** runs first. Until it passes, the other probes wait. Use it for apps that take a long time to boot, so they are not killed while still starting.'
			},
			{
				add: [
					'kl -.->|"liveness probe"| c',
					'rst["restart the container"]',
					'kl --> rst'
				],
				highlight: ['rst'],
				note: '**Liveness** answers "is it stuck?". Fail it `failureThreshold` times in a row (3 by default) and the kubelet **restarts** the container. Good for deadlocks. Dangerous if the check depends on a database: one slow database restarts every Pod.'
			},
			{
				add: [
					'kl -.->|"readiness probe"| c',
					'svc["Service endpoints"]',
					'c -.->|"ready or not"| svc'
				],
				highlight: ['svc'],
				note: '**Readiness** answers "can it take traffic now?". When it fails, the container keeps running, but the Pod is marked not ready and the Service stops sending it traffic. No restart. It comes back when the probe passes again.'
			},
			{
				add: [
					'sch["scheduler"]',
					'sch -->|"node fits the requests?"| c'
				],
				highlight: ['sch'],
				note: 'The scheduler only places a Pod where the **sum of requests** still fits the node, whatever the real usage is. Requests decide where you run. Limits decide when you get throttled or killed.'
			}
		]
	},
	example: {
		title: 'web/guestbook/frontend-deployment.yaml',
		repo: 'kubernetes/examples',
		url: `${EXAMPLES}/web/guestbook/frontend-deployment.yaml#L20-L49`,
		lang: 'yaml',
		code: `        resources:
          requests:
            cpu: 100m
            memory: 100Mi
          limits:
            cpu: 200m
            memory: 100Mi
…
        ports:
        - containerPort: 80
        readinessProbe:
          httpGet:
            path: /
            port: 80
          initialDelaySeconds: 5
          periodSeconds: 10
        livenessProbe:
          httpGet:
            path: /
            port: 80
          initialDelaySeconds: 15
          periodSeconds: 20`,
		notes: [
			'`100m` is 100 millicpu, a tenth of a core. The scheduler reserves that much. The container may burst to `200m`, then the kernel throttles it.',
			'Memory request and limit are the **same**: `100Mi`. The container cannot borrow RAM beyond what was reserved, so a leak gets **this** container OOM killed instead of eating its neighbours\' memory.',
			'Readiness starts after 5 seconds and checks every 10. Liveness waits 15 seconds and checks every 20. The longer liveness delay gives the app time to boot before a failure can restart it.',
			'Secrets reach a container the same way as plain values. The [vLLM example](https://github.com/kubernetes/examples/blob/d6b8cd27eacb51e651a1aa6f7c190a28713eff6e/AI/vllm-deployment/vllm-deployment.yaml#L50-L54) reads a token with `secretKeyRef`, so the value never sits in the Deployment file.'
		]
	},
	tradeoff: {
		gain: [
			'Config is separate from the image: one image, many environments.',
			'The kubelet restarts stuck containers and takes unready ones out of the Service by itself, without a page.',
			'Requests let the scheduler pack nodes safely. Limits stop one noisy container from starving its neighbours.'
		],
		cost: [
			'Secrets are not secret by default. You still need encryption at rest for etcd and tight access rules, or an external secret store.',
			'A bad liveness probe causes the outages it was meant to prevent: restarts under load make things worse.',
			'Limits set too low cause throttling and OOM kills. Requests set too high waste nodes. You have to measure real usage.'
		]
	},
	task: {
		prompt: 'A Java service takes up to 90 seconds to start. Its liveness probe is `httpGet /health` with `initialDelaySeconds: 10`, `periodSeconds: 10` and the default `failureThreshold`. The Pod is in a restart loop and never serves. Explain why, and fix it **without** making liveness slower for the running app.',
		hint: 'Count how long the kubelet waits before the first restart. Then look for the probe that holds the others back.',
		answer: [
			'First check at 10 s, then every 10 s. After 3 failures in a row (at about 30 s) the kubelet restarts the container. The app needs 90 s, so it never finishes starting.',
			'Add a **startup probe** on the same endpoint, for example `periodSeconds: 10` and `failureThreshold: 12`: up to 120 s to start.',
			'While the startup probe has not passed, liveness and readiness do not run. Once it passes, liveness keeps its fast 10 s period.',
			'Also add a readiness probe, so the Pod only gets traffic once it can answer.'
		]
	},
	quiz: [
		{
			q: 'A container fails its readiness probe. What does Kubernetes do?',
			options: [
				'It restarts the container and keeps sending it traffic while it starts',
				'It stops sending Service traffic to the Pod and keeps the container running',
				'It deletes the Pod and the ReplicaSet creates a new one in its place',
				'It moves the Pod to a healthier node and retries the probe there'
			],
			answer: 1,
			why: 'Readiness controls traffic, not life. While the readiness probe fails, the Service sends the Pod no traffic, until it passes again. Restarting is what a failing liveness probe does.'
		},
		{
			q: 'A container tries to use more memory than its memory limit. What can happen?',
			options: [
				'It is throttled until usage drops',
				'Its limit is raised to the request',
				'The kernel can OOM kill it',
				'Nothing, limits are only used for scheduling'
			],
			answer: 2,
			why: 'Memory limits are enforced with OOM kills. Throttling is how CPU limits work. Scheduling uses requests, not limits.'
		},
		{
			q: 'Why is a Kubernetes Secret not safe just because its values are base64?',
			options: [
				'base64 is an encoding, not encryption, and etcd stores Secrets unencrypted by default',
				'Because Secrets are printed in plain text in the Pod logs at every container start',
				'Because base64 strings are capped at 1 MiB, so long keys get cut and stored in clear',
				'It is safe: base64 in Kubernetes is keyed with a cluster secret, so only the API can decode it'
			],
			answer: 0,
			why: 'Anyone who can read the Secret, or read etcd, gets the value. Encryption at rest and access rules (RBAC) are what protect it.'
		}
	],
	takeaway: 'Config and secrets live outside the image. Probes tell the kubelet when to restart and when to stop sending traffic. Requests say where a Pod fits, limits say when it gets throttled or killed.',
	sources: [
		{ title: 'Kubernetes docs, ConfigMaps', url: 'https://kubernetes.io/docs/concepts/configuration/configmap/' },
		{ title: 'Kubernetes docs, Secrets', url: 'https://kubernetes.io/docs/concepts/configuration/secret/' },
		{ title: 'Kubernetes docs, Liveness, Readiness, and Startup Probes', url: 'https://kubernetes.io/docs/concepts/workloads/pods/probes/' },
		{ title: 'Kubernetes docs, Configure Liveness, Readiness and Startup Probes', url: 'https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/' },
		{ title: 'Kubernetes docs, Resource Management for Pods and Containers', url: 'https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/' }
	]
};
