const KSM = 'https://github.com/kubernetes/kube-state-metrics/blob/7a6bbc2c40cf4506615cc299880fc1f7e84c6895';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'containers',
	part: 'Running safely',
	title: 'Hardening a container',
	minutes: 10,
	hook: [
		'On 11 February 2019, the runc maintainers announced CVE-2019-5736. runc is the runtime under Docker, containerd, cri-o and Kubernetes. A malicious container could "overwrite the host runc binary and thus gain root-level code execution on the host".',
		'The attack had one condition: run any command "as root within a container". An attacker-controlled image counted, and so did a `docker exec` into a container the attacker had written to. The default AppArmor policy did not block it.',
		'Docker starts the first process as `root` (uid 0) unless the image sets `USER`, and keeps 14 Linux capabilities by default. Here you take those defaults away one by one: a **non-root user**, a read-only filesystem, no capabilities, no shell.'
	],
	terms: [
		{ term: 'Capability', def: 'One piece of root’s power in Linux, such as `CAP_NET_RAW` (raw sockets) or `CAP_CHOWN` (change file owners). Docker keeps 14 of them for a container by default.' },
		{ term: 'Read-only root filesystem', def: 'The container’s own files are mounted read-only with `--read-only`. Writes go only to the volumes and tmpfs mounts you list.' },
		{ term: 'Distroless image', def: 'A base image from Google’s distroless project with the app’s runtime dependencies and no package manager or shell.' },
		{ term: 'no-new-privileges', def: 'A Docker security option that stops container processes from gaining new privileges. The Docker docs: commands such as `su` or `sudo` "no longer work".' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['bug["Attacker gets code execution in the app"] --> proc["Process: uid 0, 14 default capabilities"]'],
				highlight: ['bug', 'proc'],
				note: 'Start with the defaults. An image with no `USER` line runs its process as uid 0. Docker keeps 14 capabilities, among them `CAP_NET_RAW` for raw sockets and `CAP_SETUID` for switching users.'
			},
			{
				add: ['proc --> sh["Runs /bin/sh, downloads tools, writes to /usr/bin"]', 'proc --> esc["Meets the CVE-2019-5736 condition: a command as root"]'],
				highlight: ['sh', 'esc'],
				note: 'The attacker uses what the image offers. A shell runs their commands, a writable root filesystem keeps their tools, and root inside the container was enough for the runc breakout.'
			},
			{
				add: ['user["USER nobody (uid 65534)"] -.->|"blocks"| esc'],
				highlight: ['user'],
				note: 'Defence 1: a non-root user. With `USER nobody` in the Dockerfile, the process runs as uid 65534. The runc announcement required a command "as root within a container", so this condition is no longer met.'
			},
			{
				add: ['ro["--read-only, --tmpfs /tmp:noexec"] -.->|"blocks writes"| sh', 'caps["--cap-drop ALL, no-new-privileges"] -.->|"no raw sockets, no sudo"| proc'],
				highlight: ['ro', 'caps'],
				note: 'Defences 2 and 3. `--read-only` refuses writes outside the listed mounts, and `noexec` on `/tmp` stops files there from running. `--cap-drop ALL` removes the 14 capabilities, and with `no-new-privileges` the commands `su` and `sudo` stop working.'
			},
			{
				add: ['dl["Distroless base image: no shell, no package manager"] -.->|"sh: not found"| sh'],
				highlight: ['dl'],
				note: 'Defence 4: nothing to run. The distroless README: the images "do not contain package managers, shells or any other programs". `docker exec ... sh` fails, and so does the attacker’s `curl | sh`.'
			}
		]
	},
	example: {
		title: 'Dockerfile: kube-state-metrics on distroless, as nobody',
		repo: 'kubernetes/kube-state-metrics',
		url: `${KSM}/Dockerfile#L1-L18`,
		lang: 'dockerfile',
		code: `ARG GOVERSION=1.27
ARG GOARCH
FROM golang:\${GOVERSION} AS builder
ARG GOARCH
ENV GOARCH=\${GOARCH}
WORKDIR /go/src/k8s.io/kube-state-metrics/
COPY . /go/src/k8s.io/kube-state-metrics/

RUN make build-local

FROM gcr.io/distroless/static-debian13:latest-\${GOARCH}
COPY --from=builder /go/src/k8s.io/kube-state-metrics/kube-state-metrics /

USER nobody

ENTRYPOINT ["/kube-state-metrics", "--port=8080", "--telemetry-port=8081"]

EXPOSE 8080 8081`,
		notes: [
			'Lines 3 to 9 build the binary in the full `golang` image, with its compiler and shell. None of it reaches the final image.',
			'Line 11 starts the final image from `distroless/static`, which holds CA certificates, `/etc/passwd`, `/tmp` and tzdata. Line 12 copies in one file: the static binary.',
			'Line 14 sets `USER nobody`. Distroless defines `nobody` with uid 65534 and shell `/sbin/nologin`.',
			'Line 16 uses the JSON form of `ENTRYPOINT`. The distroless README asks for it because there is no shell to run a string command. Ports 8080 and 8081 are above 1024, so the process needs no `CAP_NET_BIND_SERVICE`.'
		]
	},
	tradeoff: {
		gain: [
			'The CVE-2019-5736 condition, a command running as root in the container, is not met by a process with uid 65534.',
			'After `--cap-drop ALL`, a process that does reach root still cannot open raw sockets, change file owners or create device nodes.',
			'The kube-state-metrics final image holds one binary plus the distroless files, so a shell-based attack has nothing to call.'
		],
		cost: [
			'You cannot open a shell in the running container to debug it. Distroless ships `:debug` tags with a busybox shell, and you have to switch the image to use one.',
			'An app that writes to its own directory fails under `--read-only` until you mount a volume or tmpfs at that path.',
			'An app that binds port 80 or 443 needs `CAP_NET_BIND_SERVICE` back, or a port above 1024.'
		]
	},
	task: {
		prompt: 'Here is a service. Dockerfile: `FROM python:3.12` / `COPY . /app` / `RUN pip install -r /app/requirements.txt` / `CMD python /app/server.py`. Run command: `docker run -d -p 8080:8080 --cap-add SYS_ADMIN shop-api`. The app listens on 8080 and writes temporary files to `/tmp`. List what to change, then write the new `docker run` line.',
		hint: 'Go through the four defences: user, filesystem, capabilities, shell. Which capability does a port above 1024 need?',
		answer: [
			'User: there is no `USER`, so the process runs as uid 0. Add `USER nonroot` to the final stage: distroless defines `nonroot` with uid 65532.',
			'Shell: `python:3.12` contains `/bin/sh` and `pip`. Install the requirements into a virtualenv in a build stage, then copy it and `/app` into `FROM gcr.io/distroless/python3-debian13`, which has neither. Its entrypoint is already Python, so write `CMD ["/app/server.py"]` in JSON form.',
			'Capabilities: `SYS_ADMIN` performs "a range of system administration operations" and nothing here needs it. Port 8080 needs no capability, so drop them all.',
			'New line: `docker run -d -p 8080:8080 --read-only --tmpfs /tmp:rw,noexec,nosuid --cap-drop ALL --security-opt no-new-privileges shop-api`.'
		]
	},
	quiz: [
		{
			q: 'Under which condition could a container exploit CVE-2019-5736 to overwrite the host runc binary?',
			options: [
				'Only when the container was started with `--privileged`',
				'When any command ran as root inside the container',
				'Only when the Docker socket was mounted into the container',
				'When the container had a writable volume shared with the host'
			],
			answer: 1,
			why: 'The runc announcement: the attacker needs to run any command "as root within a container", from their own image or through `docker exec` into a container they wrote to. A process with a non-root uid does not meet that condition.'
		},
		{
			q: 'You add `--read-only` to `docker run` and the app crashes writing `/tmp/upload-1.part`. What is the fix that keeps the protection?',
			options: [
				'Remove `--read-only` and run a nightly scan for new files instead',
				'Run the app as root so it can write despite the read-only mount',
				'Mount a tmpfs at `/tmp` with `--tmpfs /tmp:rw,noexec,nosuid`',
				'Add `--cap-add DAC_OVERRIDE` so the app can bypass file permissions'
			],
			answer: 2,
			why: '`--read-only` refuses writes outside the volumes and tmpfs mounts you list. A tmpfs on `/tmp` gives the app a writable directory in memory, and `noexec` stops files written there from running. The rest of the filesystem stays read-only.'
		},
		{
			q: 'During an incident, an engineer runs `docker exec -it app sh` on a container built on distroless. What happens?',
			options: [
				'The shell starts, because Docker injects busybox into every exec',
				'The shell starts as root, because exec ignores the image’s `USER`',
				'The command fails with an error asking for the root password',
				'The command fails, because the image has no `sh` binary to run'
			],
			answer: 3,
			why: 'Distroless images "do not contain package managers, shells or any other programs". The image has no `/bin/sh`, so `docker exec` has nothing to start. The `:debug` tags add a busybox shell for that reason.'
		}
	],
	recall: {
		q: 'Which four settings take away Docker’s defaults for a container process, and what uid does kube-state-metrics run as?',
		a: 'A non-root `USER`, `--read-only` with a tmpfs, `--cap-drop ALL` with `no-new-privileges`, and a distroless base with no shell. kube-state-metrics runs as `nobody`, uid 65534.'
	},
	sources: [
		{ title: 'Aleksa Sarai, CVE-2019-5736: runc container breakout (oss-security, 11 February 2019)', url: 'https://www.openwall.com/lists/oss-security/2019/02/11/2' },
		{ title: 'Docker docs, Docker Engine security', url: 'https://docs.docker.com/engine/security/' },
		{ title: 'Docker docs, Running containers', url: 'https://docs.docker.com/engine/containers/run/' },
		{ title: 'Docker docs, docker container run', url: 'https://docs.docker.com/reference/cli/docker/container/run/' },
		{ title: 'moby source, default capabilities', url: 'https://github.com/moby/moby/blob/3f38b15147b14ce0ce7b11558a1aa9e9f14db103/daemon/pkg/oci/caps/defaults.go#L4-L21' },
		{ title: 'distroless README', url: 'https://github.com/GoogleContainerTools/distroless/blob/7e55c167b7c993f738e933c3bc0f46190a5b367d/README.md' },
		{ title: 'distroless, user entries in common/BUILD.bazel', url: 'https://github.com/GoogleContainerTools/distroless/blob/7e55c167b7c993f738e933c3bc0f46190a5b367d/common/BUILD.bazel#L134-L164' },
		{ title: 'mount(8) man page, noexec', url: 'https://man7.org/linux/man-pages/man8/mount.8.html' }
	]
};
