const RUNC = 'https://github.com/opencontainers/runc/blob/d2691cb3cb12a0d830d8bb65c3156e2c966d6f99';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'exit-codes',
	part: 'Processes',
	title: 'Exit codes',
	minutes: 10,
	hook: [
		'The Kubernetes docs have an exercise: a container with `limits: memory: "100Mi"` runs `stress --vm-bytes 250M`. `kubectl get pod` shows `OOMKilled`, and the Pod\'s YAML shows `exitCode: 137` and `reason: OOMKilled`.',
		'The `stress` program never returned 137. The kernel\'s OOM killer sent it SIGKILL, signal 9, and the process ended without calling `exit()`. **The runtime turned "killed by signal 9" into 128 + 9 = 137.** A process ended by SIGTERM shows 143 for the same reason: 128 + 15.'
	],
	terms: [
		{ term: 'Exit status', def: 'The number a process passes to `exit()` when it ends. Only the low 8 bits reach the parent, so it is between 0 and 255. 0 means success.' },
		{ term: 'Wait status', def: 'The integer the kernel gives the parent through `wait()`. It records either "exited with code n" or "killed by signal N", read with `WIFEXITED`, `WEXITSTATUS`, `WIFSIGNALED` and `WTERMSIG`.' },
		{ term: '128 + N', def: 'The rule bash, runc and tini use to fit a death by signal N into one exit code: SIGKILL (9) gives 137, SIGTERM (15) gives 143.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['p["Process in a container"] -->|"exit(300)"| st1["Wait status: exited, low 8 bits = 44"]'],
				highlight: ['p', 'st1'],
				note: 'wait(2): `WEXITSTATUS` returns "the least significant 8 bits of the status argument that the child specified". 300 is 256 + 44, so the parent reads 44. Captured in this session with bash: `exit 300` gives 44 and `exit 256` gives 0.'
			},
			{
				add: ['p -->|"SIGKILL from the OOM killer"| st2["Wait status: killed by signal 9, no exit code"]'],
				highlight: ['st2'],
				note: 'The OOM killer calls `do_send_sig_info(SIGKILL, ...)` on its victim (`mm/oom_kill.c` line 947 at v6.12). The process never calls `exit()`. `WIFSIGNALED` is true, `WTERMSIG` returns 9, and `WEXITSTATUS` must not be used.'
			},
			{
				add: ['st2 --> rt["runc: 128 + 9 = 137"]', 'st1 --> rt2["runc: 44"]'],
				highlight: ['rt', 'rt2'],
				note: 'The runtime needs one integer for both cases. runc\'s `ExitStatus()` returns 128 plus the signal number for a signal death and the low 8 bits otherwise. bash(1) applies the same rule: "When a command terminates on a fatal signal N, bash uses the value of 128+N as the exit status."'
			},
			{
				add: ['rt --> k8s["kubectl: exitCode 137, reason OOMKilled"]'],
				highlight: ['k8s'],
				note: 'For a container in the `Terminated` state, Kubernetes shows "a reason, an exit code, and the start and finish time". 137 alone says signal 9. The `OOMKilled` reason says the memory limit is what sent it.'
			},
			{
				add: ['sh["The shell cannot start the command"] -->|"not found"| c127["127"]', 'sh -->|"found, not executable"| c126["126"]'],
				highlight: ['sh', 'c127', 'c126'],
				note: 'bash(1): "If a command is not found, the child process created to execute it returns a status of 127. If a command is found but is not executable, the return status is 126." `docker run` uses 127 and 126 the same way for the container\'s command, and 125 for an error in the Docker daemon itself.'
			}
		]
	},
	example: {
		title: 'libcontainer/utils/utils.go: how runc turns a wait status into an exit code',
		repo: 'opencontainers/runc',
		url: `${RUNC}/libcontainer/utils/utils.go#L12-L23`,
		lang: 'go',
		code: `const (
	exitSignalOffset = 128
)

// ExitStatus returns the correct exit status for a process based on if it
// was signaled or exited cleanly
func ExitStatus(status unix.WaitStatus) int {
	if status.Signaled() {
		return exitSignalOffset + int(status.Signal())
	}
	return status.ExitStatus()
}`,
		notes: [
			'Line 2 is the 128 of the "128 + N" rule. runc uses the same offset as bash, so a container killed by SIGKILL shows the 137 you would see in a terminal.',
			'Lines 8 and 9: `Signaled()` is the Go name for `WIFSIGNALED`. When it is true, the code adds the signal number: 9 gives 137, 15 gives 143, 11 (SIGSEGV) gives 139.',
			'Line 11: `ExitStatus()` is `WEXITSTATUS`, the low 8 bits the program passed to `exit()`. Nothing stops a program from calling `exit(137)` itself, and the integer then looks the same as a SIGKILL.',
			'runc calls this function from [`reap()`](' + RUNC + '/signals.go#L104-L127), which loops on `unix.Wait4(-1, &ws, unix.WNOHANG, &rus)` and stores `utils.ExitStatus(ws)` for each child that ended.'
		]
	},
	tradeoff: {
		gain: [
			'One integer between 0 and 255 carries both outcomes: `$?`, `docker inspect` and the Pod\'s `exitCode` all show 137 for SIGKILL and 143 for SIGTERM.',
			'Codes 126 and 127 say the command never started, before you read any of the program\'s logs.'
		],
		cost: [
			'A program can call `exit(137)` or `exit(127)` itself, and the integer cannot tell that apart from a signal or a missing command. Kubernetes adds the `reason` field for that.',
			'Only 8 bits survive: `exit 256` reports success (0), and `exit 300` reports 44.'
		]
	},
	task: {
		prompt: 'A CronJob\'s Pods ended with these codes: 0, 1, 127, 126, 137 with reason `OOMKilled`, 143, 139. Say what happened in each case. Use bash(1), signal(7) and the 128 + N rule.',
		hint: 'Above 128, subtract 128 and look the number up in signal(7). For 1, read the program\'s own man page.',
		answer: [
			'0: success. 1: the program reported a failure in its own terms. For `grep`, grep(1) says 1 means "no lines were selected" and 2 means "an error occurred". Captured in this session: `grep -q nothing /etc/hostname` gives 1, `grep -q x /nonexistent` gives 2.',
			'127: the command was not found, for example a typo in `command:` or a binary missing from the image. 126: the file was found but could not be run. Captured in this session with bash: a script with mode 664 gives `Permission denied` and 126, `./nope` gives 127.',
			'137 = 128 + 9: SIGKILL. With reason `OOMKilled`, the container went over its memory limit and the OOM killer sent the signal.',
			'143 = 128 + 15: SIGTERM, the default stop signal of containerd and CRI-O when Kubernetes stops a Pod. 139 = 128 + 11: SIGSEGV, an invalid memory reference in the program.'
		]
	},
	quiz: [
		{
			q: 'During a rolling update, the old Pods end with exit code 143. What does that mean?',
			options: [
				'The container used more memory than its limit and the kernel stopped it',
				'The process was ended by SIGTERM, signal 15, as in a normal stop',
				'The image\'s entrypoint file exists but has no execute permission',
				'The container went over its CPU limit for longer than 15 seconds'
			],
			answer: 1,
			why: '143 is above 128, so it encodes a signal: 143 minus 128 is 15, SIGTERM. A process with no SIGTERM handler takes the default action, terminate, and the runtime reports 128 + 15.'
		},
		{
			q: '`docker run myimg` exits at once with code 127. What is the likely cause?',
			options: [
				'The Docker daemon itself failed, for example on an unknown flag',
				'The command was found, but the file cannot be executed',
				'The command in the image\'s `CMD` or `ENTRYPOINT` cannot be found',
				'The container\'s main process was killed by SIGKILL'
			],
			answer: 2,
			why: 'The Docker docs: "Exit code 127 indicates that the contained command can\'t be found." 125 is reserved for daemon errors, 126 for a command that "can\'t be invoked", and SIGKILL would give 137.'
		},
		{
			q: 'A program ends with `exit(256)`. What exit code does its parent shell see?',
			options: [
				'256, the value passed to `exit()`',
				'255, because larger values are capped at the maximum',
				'0, because only the low 8 bits reach the parent',
				'128, because values above 255 are treated as a signal'
			],
			answer: 2,
			why: 'wait(2): `WEXITSTATUS` keeps "the least significant 8 bits" of the value. 256 is 1 0000 0000 in binary, so the low 8 bits are all 0, and the shell reports success.'
		}
	],
	recall: {
		q: 'A container shows exit code 137. What happened to the process, and how is 137 computed?',
		a: 'It was killed by signal 9, SIGKILL, and never called `exit()`. runc and bash report a death by signal N as 128 + N, so 128 + 9 = 137. SIGTERM gives 143.'
	},
	sources: [
		{ title: 'bash(1), EXIT STATUS', url: 'https://man7.org/linux/man-pages/man1/bash.1.html' },
		{ title: 'wait(2), Linux manual page', url: 'https://man7.org/linux/man-pages/man2/wait.2.html' },
		{ title: 'signal(7), Signal numbering for standard signals', url: 'https://man7.org/linux/man-pages/man7/signal.7.html' },
		{ title: 'grep(1), EXIT STATUS', url: 'https://man7.org/linux/man-pages/man1/grep.1.html' },
		{ title: 'Kubernetes docs, Assign Memory Resources to Containers and Pods', url: 'https://kubernetes.io/docs/tasks/configure-pod-container/assign-memory-resource/' },
		{ title: 'Kubernetes docs, Pod Lifecycle, Container states', url: 'https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/' },
		{ title: 'Docker docs, Running containers, Exit status', url: 'https://docs.docker.com/engine/containers/run/' },
		{ title: 'Linux v6.12, mm/oom_kill.c', url: 'https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/mm/oom_kill.c#L947' }
	]
};
