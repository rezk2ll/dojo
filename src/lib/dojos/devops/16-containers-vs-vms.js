const COMPOSE = 'https://github.com/docker/awesome-compose/blob/30f4b7f6a6c3b0c0ecf4d4efb0de203c48d11562';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'containers-vs-vms',
	part: 'Containers',
	title: 'Containers and virtual machines',
	minutes: 10,
	hook: [
		'You run `ps aux` on a Docker host and see `postgres` in the list, next to `sshd` and `cron`. The host runs no guest OS and no hypervisor. The database "in the container" is **a normal process on your kernel**.',
		'A VM boots its own kernel on virtual hardware. A container boots nothing. The kernel gives the process a private view of the system (its own PIDs, network, mounts) and a budget for CPU and memory.',
		'Two kernel features do this work: namespaces and cgroups. Every container on the host runs on that one host kernel.'
	],
	terms: [
		{ term: 'Container', def: 'A process (or a group of processes) the kernel isolates with namespaces and limits with cgroups. It runs on the host kernel.' },
		{ term: 'Namespace', def: 'A kernel feature that gives a process its own private copy of one resource: process IDs, network stack, mount points, hostname, users.' },
		{ term: 'cgroup', def: 'Control group. A kernel feature that counts and limits what a group of processes uses: memory, CPU, I/O.' },
		{ term: 'Image', def: 'A read-only stack of filesystem layers plus settings (command, user, env). It never changes once built.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: [
					'subgraph vmside["Virtual machine"]',
					'gk["Guest kernel"] --> vapp["App"]',
					'end',
					'hw["Server hardware"] --> hyp["Hypervisor"] --> gk'
				],
				highlight: ['hyp', 'gk'],
				note: 'A VM runs a full OS with **its own kernel** on virtual hardware. The isolation is strong, but you boot and patch a whole OS to run one app.'
			},
			{
				add: [
					'hk["Host kernel"]',
					'hw --> hk',
					'hk --> c1["Container: postgres"]',
					'hk --> c2["Container: nginx"]'
				],
				highlight: ['hk', 'c1', 'c2'],
				note: 'Containers have **no kernel of their own**. They are processes on the host kernel, so they start in a second and `ps` on the host lists them.'
			},
			{
				add: [
					'ns["Namespaces: own PIDs, network, mounts, hostname"]',
					'ns -.->|private view| c1'
				],
				highlight: ['ns'],
				note: 'Namespaces decide what the process can **see**. Inside, postgres thinks it is PID 1 and has its own `eth0`. On the host it has an ordinary PID like any other process.'
			},
			{
				add: [
					'cg["cgroups: memory and CPU limits"]',
					'cg -.->|budget| c2'
				],
				highlight: ['cg'],
				note: 'cgroups decide how much the process can **use**. By default a container has no limit. Set one (`docker run --memory 512m`) and the kernel enforces it.'
			},
			{
				add: [
					'img[("Image: read-only layers")]',
					'img -.->|starts as| c1',
					'img -.->|starts as| c2'
				],
				highlight: ['img'],
				note: 'One image can start many containers. Each container gets its own thin **writable layer** on top. Remove the container and that layer is gone, while the image stays untouched.'
			}
		]
	},
	example: {
		title: 'wireguard/compose.yaml',
		repo: 'docker/awesome-compose',
		url: `${COMPOSE}/wireguard/compose.yaml#L1-L27`,
		lang: 'yaml',
		code: `version: '3.7'
services:
  wireguard:
    image: linuxserver/wireguard
    container_name: wireguard
    cap_add:
      - NET_ADMIN
      - SYS_MODULE
…
    volumes:
      - /usr/share/appdata/wireguard/config:/config
      - /usr/src:/usr/src # location of kernel headers
      - /lib/modules:/lib/modules
    ports:
      - 51820:51820/udp
    sysctls:
      - net.ipv4.conf.all.src_valid_mark=1
    restart: unless-stopped`,
		notes: [
			'Lines 12 and 13 mount the **host\'s** kernel headers and `/lib/modules`. The container has no kernel of its own, so a VPN that needs a kernel module must use the one the host runs.',
			'Line 8 adds `SYS_MODULE`, a capability (one slice of root\'s power) that lets the process load kernel modules. A module loaded from this container goes into the **host kernel**, shared by every other container. Docker\'s [run reference](https://docs.docker.com/engine/containers/run/) lists `SYS_MODULE` among the capabilities not granted by default.',
			'Lines 7 and 16 to 17 (`NET_ADMIN` and `sysctls`) change network settings inside the container\'s own network namespace. The host\'s network settings stay as they were.',
			'The [minecraft example](https://github.com/docker/awesome-compose/blob/30f4b7f6a6c3b0c0ecf4d4efb0de203c48d11562/minecraft/compose.yaml#L8-L11) sets `deploy.resources.limits.memory: 1.5G`. Docker turns that line into a cgroup memory limit.'
		]
	},
	tradeoff: {
		gain: [
			'A container starts in about a second, because there is no OS to boot.',
			'Dozens of containers fit on a host that would hold a handful of VMs.',
			'The image is the same on your laptop, in CI and in production.'
		],
		cost: [
			'All containers share one kernel: a kernel bug or a container with `SYS_MODULE` can reach the host and its neighbours.',
			'You cannot run a different kernel, or a Windows app on a Linux host, inside a container.',
			'Anything written inside the container is lost on removal unless you put it in a volume.'
		]
	},
	task: {
		prompt: 'On a Docker host, run `docker run -d --name web nginx`. Find the nginx process from the host side, then from inside the container. Explain why the PIDs differ, then remove the container and say what happened to any file you created inside it.',
		hint: 'Try `ps -ef | grep nginx` on the host, and `docker exec web ls /proc` or `docker top web`. Which namespace hides the host processes?',
		answer: [
			'On the host, `ps` shows the nginx master and workers with normal host PIDs. `docker top web` shows the same processes.',
			'Inside, the master is PID 1: the **PID namespace** gives the container its own numbering and hides every host process.',
			'The host and the container see the same process under two numbers. No second kernel runs.',
			'After `docker rm -f web`, any file you wrote inside is gone: it lived in the container\'s writable layer. The `nginx` image is unchanged and can start a fresh container.'
		]
	},
	quiz: [
		{
			q: 'What is the main difference between a container and a virtual machine?',
			options: [
				'A container runs its own smaller kernel, a VM runs a full one',
				'A container shares the host kernel, a VM boots its own',
				'A container always runs as a non-root user, a VM as root',
				'A VM cannot run more than one process at the same time'
			],
			answer: 1,
			why: 'A container is a process isolated by namespaces and limited by cgroups on the host kernel. A VM has its own kernel on virtual hardware.'
		},
		{
			q: 'Which kernel feature lets you cap a container at 512 MB of memory?',
			options: ['Mount namespaces', 'Capabilities', 'cgroups', 'The PID namespace'],
			answer: 2,
			why: 'Namespaces control what a process sees. cgroups control how much memory and CPU it uses.'
		},
		{
			q: 'You start three containers from the same image and each writes a log file. What happens to the image?',
			options: [
				'It grows by three log files, one written by each container',
				'Nothing, each container writes to its own writable layer above the image',
				'The second container fails because the first one locked the image',
				'The image is copied three times on disk, one copy per container'
			],
			answer: 1,
			why: 'Docker never writes to an image\'s layers. Each container writes to its own thin writable layer, so all three share the same unchanged image.'
		}
	],
	recall: {
		q: 'Which two kernel features make a process a container, and what does each one control?',
		a: 'Namespaces control what the process sees (its PIDs, network, mounts). cgroups control how much it uses (memory, CPU). The process still runs on the host kernel.'
	},
	sources: [
		{ title: 'Docker docs, What is a container?', url: 'https://docs.docker.com/get-started/docker-concepts/the-basics/what-is-a-container/' },
		{ title: 'Docker docs, Docker Engine security', url: 'https://docs.docker.com/engine/security/' },
		{ title: 'Docker docs, Storage drivers (images, layers, container layer)', url: 'https://docs.docker.com/engine/storage/drivers/' },
		{ title: 'Linux man page, namespaces(7)', url: 'https://man7.org/linux/man-pages/man7/namespaces.7.html' },
		{ title: 'Linux man page, cgroups(7)', url: 'https://man7.org/linux/man-pages/man7/cgroups.7.html' }
	]
};
