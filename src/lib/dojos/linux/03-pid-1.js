const TINI = 'https://github.com/krallin/tini/blob/369448a167e8b3da4ca5bca0b3307500c3371828/src/tini.c';
const LINUX = 'https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'pid-1',
	part: 'Processes',
	title: 'PID 1 in a container',
	minutes: 10,
	hook: [
		'A worker image ends with `CMD ["python", "worker.py"]`, and the worker never registers a SIGTERM handler. On a VM, `kill -TERM` stops it at once. In the container, `docker stop` waits the full 10 seconds every time, then Docker sends SIGKILL.',
		'In the container, `python` is PID 1 of its own PID namespace. pid_namespaces(7) says other processes can send that PID 1 a signal "only if the "init" process has established a handler for that signal". Python registers no SIGTERM handler, so **the kernel drops the SIGTERM**. SIGKILL sent from outside the namespace is the exception: it is "forcibly delivered".',
		'PID 1 has a second job: orphaned processes in the namespace are re-parented to it, and only its `wait()` calls remove their zombies. `docker run --init` starts tini as PID 1, and tini runs your program as its child.'
	],
	terms: [
		{ term: 'PID namespace', def: 'A separate numbering of process IDs. The first process in it gets PID 1, and processes inside cannot see processes in the parent namespace.' },
		{ term: 'Init process', def: 'PID 1 of a PID namespace. It adopts orphaned processes, and when it exits the kernel kills every process in the namespace with SIGKILL.' },
		{ term: 'Zombie', def: 'A process that has exited but whose exit status no parent has read yet. It keeps its PID and a slot in the kernel\'s process table.' },
		{ term: 'Reaping', def: 'Calling `wait()` or `waitpid()` on a zombie: the parent reads the status and the kernel frees the PID.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['run["docker run worker"] --> py["python worker.py, PID 1 in a new PID namespace"]'],
				highlight: ['run', 'py'],
				note: 'The first process created in a new PID namespace gets PID 1. In `kernel/fork.c`, when the new process is the namespace\'s child reaper, the kernel sets `SIGNAL_UNKILLABLE` in its signal flags (lines 2558 to 2561 at v6.12).'
			},
			{
				add: ['stop["docker stop: SIGTERM"] --> chk{"PID 1 has a SIGTERM handler?"}', 'chk -->|"no: disposition SIG_DFL"| drop["Kernel drops the signal"]'],
				highlight: ['stop', 'chk', 'drop'],
				note: 'On delivery, `sig_task_ignored()` in `kernel/signal.c` returns true when the target has `SIGNAL_UNKILLABLE` and the handler is `SIG_DFL`. The signal is thrown away before it is queued. Python only catches SIGINT and ignores SIGPIPE, so SIGTERM has `SIG_DFL` and is dropped.'
			},
			{
				add: ['drop -->|"10 s later: SIGKILL from the host"| dead["PID 1 dies, the kernel kills every process in the namespace"]'],
				highlight: ['dead'],
				note: 'SIGKILL from an ancestor namespace is forced through. pid_namespaces(7): "If the "init" process of a PID namespace terminates, the kernel terminates all of the processes in the namespace via a SIGKILL signal." No process in the container gets a chance to clean up.'
			},
			{
				add: ['tini["docker run --init: tini is PID 1"] -->|"sigtimedwait, then kill child SIGTERM"| py2["python, now a child of tini"]', 'py2 --> code["Default action: python ends, tini exits 128 + 15 = 143"]'],
				highlight: ['tini', 'py2', 'code'],
				note: 'tini blocks the signals and waits for them with `sigtimedwait()`. `sig_ignored()` never drops a blocked signal, so SIGTERM reaches tini, which forwards it with `kill()`. Python is not PID 1, so the default action applies and it terminates. tini then exits with 128 plus the signal number.'
			},
			{
				add: ['orph["An orphaned grandchild exits: zombie, re-parented to PID 1"] --> reap["tini: waitpid -1, WNOHANG, in a loop"]'],
				highlight: ['orph', 'reap'],
				note: 'When a parent dies before its child, the child is re-parented to the namespace\'s init. When it exits, it stays a zombie until PID 1 calls `wait()`. wait(2) warns that each zombie "will consume a slot in the kernel process table". tini calls `waitpid(-1, ..., WNOHANG)` until no zombie is left.'
			}
		]
	},
	example: {
		title: 'src/tini.c: wait for one signal, forward it, then reap',
		repo: 'krallin/tini',
		url: `${TINI}#L508-L688`,
		lang: 'c',
		code: `int wait_and_forward_signal(sigset_t const* const parent_sigset_ptr, pid_t const child_pid) {
	siginfo_t sig;

	if (sigtimedwait(parent_sigset_ptr, &sig, &ts) == -1) {
		switch (errno) {
			case EAGAIN:
				break;
			case EINTR:
				break;
			default:
				PRINT_FATAL("Unexpected error in sigtimedwait: '%s'", strerror(errno));
				return 1;
		}
	} else {
		/* There is a signal to handle here */
		switch (sig.si_signo) {
			case SIGCHLD:
				/* Special-cased, as we don't forward SIGCHLD. Instead, we'll
				 * fallthrough to reaping processes.
				 */
				PRINT_DEBUG("Received SIGCHLD");
				break;
			default:
				PRINT_DEBUG("Passing signal: '%s'", strsignal(sig.si_signo));
				/* Forward anything else */
				if (kill(kill_process_group ? -child_pid : child_pid, sig.si_signo)) {
					if (errno == ESRCH) {
						PRINT_WARNING("Child was dead when forwarding signal");
					} else {
						PRINT_FATAL("Unexpected error when forwarding signal: '%s'", strerror(errno));
						return 1;
					}
				}
				break;
		}
	}

	return 0;
}
…
	while (1) {
		/* Wait for one signal, and forward it */
		if (wait_and_forward_signal(&parent_sigset, child_pid)) {
			return 1;
		}

		/* Now, reap zombies */
		if (reap_zombies(child_pid, &child_exitcode)) {
			return 1;
		}

		if (child_exitcode != -1) {
			PRINT_TRACE("Exiting: child has exited");
			return child_exitcode;
		}
	}
}`,
		notes: [
			'Line 4 waits for a signal from `parent_sigset`, the set tini blocked at startup with `sigprocmask()`. tini installs no handler for SIGTERM. The kernel still delivers it, because [`sig_ignored()`](' + LINUX + '/kernel/signal.c#L104-L123) returns false for any signal in `blocked` or `real_blocked`.',
			'`ts` is one second, so `sigtimedwait()` returns `EAGAIN` (line 6) at least once a second when nothing arrives. The loop then goes on to reap zombies anyway.',
			'Line 26 forwards every signal except SIGCHLD with `kill()`. By default it goes to the child\'s PID only. With `tini -g`, `kill_process_group` is set and the signal goes to the child\'s whole process group, so a shell script\'s own children get it too.',
			'Line 48 calls `reap_zombies()`, which loops on `waitpid(-1, &current_status, WNOHANG)`: `-1` means any child, `WNOHANG` means return at once if none has exited. When the reaped PID is the main child, it records the exit code, as `128 + WTERMSIG` if a signal killed it.',
			'Lines 52 to 54 exit tini once the main child is gone, with the child\'s code. Captured in this session: `docker-init -s -- sleep 30` (tini 0.19.0), sent `kill -TERM`, forwarded the signal to `sleep` and exited with 143.'
		]
	},
	tradeoff: {
		gain: [
			'SIGTERM reaches a program that never registered a handler, and the default action ends it before Docker\'s SIGKILL.',
			'Zombies re-parented to PID 1 are reaped by tini\'s `waitpid()` loop, so they do not pile up in the process table.'
		],
		cost: [
			'By default tini sends each signal to the PID of its direct child. A shell script\'s background jobs get no SIGTERM unless you start tini with `-g`.',
			'One more process in every container, and the exit code you see is tini\'s: 143 when SIGTERM ended the child, not the code your program would have chosen.'
		]
	},
	task: {
		prompt: 'Inside a container, `grep -E "Name|SigCgt" /proc/1/status` prints `Name: python3` and `SigCgt: 0000000000000002`. Predict what `docker stop` does. Then say what changes with `docker run --init`.',
		hint: 'Bit n-1 of the mask is signal n. Which signal is bit 1? Is SIGTERM (15) in the mask?',
		answer: [
			'0x2 is bit 1, signal 2: SIGINT. Captured in this session, a plain `python3` process shows exactly `SigCgt: 0000000000000002`: Python catches SIGINT to raise `KeyboardInterrupt`, and nothing else.',
			'SIGTERM is not caught, so its disposition is `SIG_DFL`. PID 1 of the namespace is `SIGNAL_UNKILLABLE`, and the kernel drops the SIGTERM. `docker stop` waits 10 seconds and sends SIGKILL.',
			'With `--init`, PID 1 is `docker-init`, which is tini. It collects SIGTERM with `sigtimedwait()` and forwards it to python, which is no longer PID 1, so the default action ends it at once.',
			'The container then exits with code 143, 128 plus 15, the value tini computes in `reap_zombies()`.'
		],
		steps: [
			{
				title: 'Decode the mask',
				questions: [
					{ q: '`SigCgt: 0000000000000002`. Which bit is set?', options: ['Bit 2', 'Bit 0', 'Bit 1', 'Bit 15'], answer: 2, why: '0x2 is 2 to the power 1, so only bit 1 is set.' },
					{ q: 'Bit 1 stands for which signal?', options: ['Signal 2, SIGINT', 'Signal 1, SIGHUP', 'Signal 15, SIGTERM', 'Signal 9, SIGKILL'], answer: 0, why: 'Bit n-1 is signal n, so bit 1 is signal 2: SIGINT.' },
					{ q: 'Why does a plain `python3` catch that signal?', options: ['To flush its buffers before a `docker stop`', 'To raise `KeyboardInterrupt`', 'Because PID 1 must catch it', 'To forward it to its children'], answer: 1, why: 'Python catches SIGINT to raise `KeyboardInterrupt`, and catches nothing else by default.' },
					{ q: 'Is SIGTERM in the mask?', options: ['Yes, every process catches it', 'Yes, it is bit 1', 'Only when the container runs as root', 'No, bit 14 is not set'], answer: 3, why: 'SIGTERM is 15, so it would be bit 14, 0x4000. That bit is 0.' }
				]
			},
			{
				title: 'Check what PID 1 does with SIGTERM',
				questions: [
					{ q: 'SIGTERM is not caught. What is its disposition?', options: ['`SIG_DFL`, the default action', '`SIG_IGN`, set by Docker', 'Blocked until the program reads stdin', 'Caught by the kernel for the program'], answer: 0, why: 'No handler and no ignore means the default disposition, `SIG_DFL`.' },
					{ q: 'What flag does the kernel set on PID 1 of a new PID namespace?', options: ['`SIGCHLD`', '`SIG_IGN`', '`SIGNAL_UNKILLABLE`', '`WNOHANG`'], answer: 2, why: '`kernel/fork.c` sets `SIGNAL_UNKILLABLE` when the new process is the namespace\'s child reaper.' },
					{ q: 'Which kernel function decides, on delivery, that this SIGTERM is ignored?', options: ['`sigtimedwait()`', '`waitpid()`', '`reap_zombies()`', '`sig_task_ignored()`'], answer: 3, why: '`sig_task_ignored()` in `kernel/signal.c` returns true for a `SIG_DFL` signal sent to an unkillable init, so the signal is thrown away.' },
					{ q: 'You run `docker exec app kill -INT 1` instead. What happens?', options: ['The kernel drops it, like SIGTERM', 'Python gets it and raises `KeyboardInterrupt`', 'Docker turns it into SIGKILL', 'Nothing until the 10 second grace period ends'], answer: 1, why: 'The drop rule only hits signals left at `SIG_DFL`. Bit 1 of the mask says python has a SIGINT handler, so the signal is delivered.' }
				]
			},
			{
				title: 'Predict docker stop',
				questions: [
					{ q: '`docker stop` sends SIGTERM to PID 1. What does python do?', options: ['Nothing: the signal never reaches it', 'Raises `KeyboardInterrupt` and exits cleanly', 'Exits with 143', 'Forwards it to its children'], answer: 0, why: 'The kernel drops it, so python never sees it and keeps running.' },
					{ q: 'How long does `docker stop` take?', options: ['Under a second', 'Until python finishes the work it was doing', 'About 10 seconds, the default grace period', 'Forever, until you press Ctrl-C in the terminal'], answer: 2, why: 'Docker waits its 10 seconds for an exit that never comes.' },
					{ q: 'What ends python at second 10?', options: ['A second SIGTERM', 'SIGKILL from the host, which is forced through', 'SIGINT, since python catches that one and exits', 'The kernel\'s OOM killer'], answer: 1, why: 'SIGKILL from an ancestor namespace is "forcibly delivered", even to init.' },
					{ q: 'Which exit code does `docker ps -a` show for the container after this stop?', options: ['143', '0', '1', '137'], answer: 3, why: 'SIGKILL ended python at second 10, so the runtime reports 128 + 9.' }
				]
			},
			{
				title: 'Add --init',
				questions: [
					{ q: 'With `docker run --init`, which process is PID 1?', options: ['python3', '`docker-init`, which is tini', 'The host\'s systemd', 'A shell that Docker starts to run your command'], answer: 1, why: '`--init` starts tini as PID 1, and tini runs your program as its child.' },
					{ q: 'Suppose python ran a shell script with background jobs. With plain `--init`, do those jobs get the SIGTERM?', options: ['Yes, tini signals every process in the container', 'Yes, the kernel copies it down the whole tree', 'No: only tini started with `-g` signals the whole process group', 'No: tini drops SIGTERM for every process but PID 1'], answer: 2, why: 'tini forwards the signal to its child with `kill()`. With `-g` it goes to the child\'s process group, so a script\'s own children get it too.' },
					{ q: 'tini forwards SIGTERM to python. Why does python now stop at once?', options: ['Python is not PID 1 now, so the default applies', 'tini sends SIGKILL instead', 'Python now catches SIGTERM', 'Docker shortens the grace period when `--init` is set'], answer: 0, why: 'Only a namespace\'s init gets the drop rule. As a child, python takes the default action: terminate.' },
					{ q: 'What exit code does the container report?', options: ['137', '0', '15', '143'], answer: 3, why: 'tini exits with 128 plus the signal number: 128 + 15 = 143.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'A container\'s PID 1 has no SIGTERM handler. `docker exec app kill -TERM 1` runs as root and the process keeps running. Why?',
			options: [
				'The kernel delivers to a namespace\'s init only the signals it has a handler for',
				'`docker exec` runs in the host PID namespace, so PID 1 there is the host\'s systemd',
				'Root inside a container lacks the capability needed to signal other processes',
				'SIGTERM stays queued until the program next reads from its standard input'
			],
			answer: 0,
			why: 'pid_namespaces(7): only signals for which init "has established a signal handler" can be sent to it by other members of the namespace, and the rule "applies even to privileged processes". In the kernel, `sig_task_ignored()` drops the signal when the target is `SIGNAL_UNKILLABLE` and the handler is `SIG_DFL`.'
		},
		{
			q: 'PID 1 of a container exits while 12 other processes still run in it. What happens to them?',
			options: [
				'They are re-parented to the host\'s PID 1 and keep running',
				'The kernel sends SIGKILL to every one of them',
				'They keep running until someone runs `docker rm` on the container',
				'They each receive SIGHUP and may choose to continue'
			],
			answer: 1,
			why: 'pid_namespaces(7): "If the "init" process of a PID namespace terminates, the kernel terminates all of the processes in the namespace via a SIGKILL signal." After that, a `fork()` into the namespace fails with `ENOMEM`.'
		},
		{
			q: '`ps` in a container shows 200 processes in state `Z` with PPID 1. What removes them?',
			options: [
				'Sending SIGKILL to each zombie PID from the host',
				'Raising the container\'s `pids.max` limit so new processes still fit',
				'Sending SIGCONT to PID 1 so it resumes its children',
				'A PID 1 that calls `waitpid()`, such as tini started with `--init`'
			],
			answer: 3,
			why: 'A zombie has already exited, so a signal does nothing to it. wait(2): it stays "as long as a zombie is not removed from the system via a wait". Only its parent, here PID 1, can do that wait, and tini calls `waitpid(-1, ..., WNOHANG)` in a loop.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Watch a container\'s PID 1 drop SIGTERM, then fix it with `--init`.',
		steps: [
			'Start Python as PID 1: `docker run -d --name pid1-lab python:3.12-alpine python3 -c \'import time; time.sleep(600)\'`.',
			'Read its name and mask: `docker exec pid1-lab grep -E "Name|SigCgt" /proc/1/status`.',
			'Stop it and time it: `time docker stop pid1-lab`, then `docker inspect -f \'{{.State.ExitCode}}\' pid1-lab`.',
			'Remove it and start it again with tini: `docker rm pid1-lab && docker run -d --init --name pid1-lab python:3.12-alpine python3 -c \'import time; time.sleep(600)\'`. Check who is PID 1 with `docker exec pid1-lab ps -o pid,comm`.',
			'Stop and inspect again: `time docker stop pid1-lab`, `docker inspect -f \'{{.State.ExitCode}}\' pid1-lab`, then clean up with `docker rm pid1-lab`.'
		],
		done: [
			'The first container shows `Name: python3` and `SigCgt: 0000000000000002`.',
			'The first `docker stop` takes about 10 seconds and the exit code is 137.',
			'With `--init`, PID 1 is `docker-init` and python has another PID.',
			'The second `docker stop` returns in about a second and the exit code is 143.'
		],
		solution: [
			'Python catches only SIGINT (bit 1). SIGTERM keeps `SIG_DFL`, and the kernel drops it for an `SIGNAL_UNKILLABLE` PID 1. Docker sends SIGKILL at second 10: 128 + 9 = 137.',
			'With `--init`, tini is PID 1. It collects SIGTERM with `sigtimedwait()` and forwards it to python, which is a normal child now and terminates. tini exits with 128 + 15 = 143.',
			'Without `--init`, the other fix is a SIGTERM handler in the program: a caught signal is not dropped, even at PID 1.'
		]
	},
	recall: {
		q: 'Why does a container\'s PID 1 ignore SIGTERM when it has no handler, and how does tini get the signal through?',
		a: 'The kernel marks a namespace\'s init `SIGNAL_UNKILLABLE` and drops signals whose disposition is `SIG_DFL`. tini blocks the signals, collects them with `sigtimedwait()` and forwards them with `kill()` to your program, which is not PID 1 and gets the default action.'
	},
	sources: [
		{ title: 'pid_namespaces(7), Linux manual page', url: 'https://man7.org/linux/man-pages/man7/pid_namespaces.7.html' },
		{ title: 'wait(2), Linux manual page', url: 'https://man7.org/linux/man-pages/man2/wait.2.html' },
		{ title: 'Linux v6.12, kernel/signal.c, sig_task_ignored and sig_ignored', url: LINUX + '/kernel/signal.c#L82-L123' },
		{ title: 'Linux v6.12, kernel/fork.c, SIGNAL_UNKILLABLE for the child reaper', url: LINUX + '/kernel/fork.c#L2558-L2561' },
		{ title: 'tini README', url: 'https://github.com/krallin/tini/blob/369448a167e8b3da4ca5bca0b3307500c3371828/README.md' },
		{ title: 'Docker docs, docker container run, Specify an init process', url: 'https://docs.docker.com/reference/cli/docker/container/run/#init' },
		{ title: 'Python docs, signal module, General rules', url: 'https://docs.python.org/3/library/signal.html' }
	]
};
