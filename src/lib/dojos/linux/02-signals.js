const PG = 'https://github.com/postgres/postgres/blob/92d47d544bf64274b6a7aa8775f7b35bcf71f339';
const PM = `${PG}/src/backend/postmaster/postmaster.c`;
const PGIMG = 'https://github.com/docker-library/postgres/blob/dfc76bb299b057785026eb2eea39556b6fe52983/17/bookworm/Dockerfile';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'signals',
	part: 'Processes',
	title: 'Signals',
	minutes: 10,
	hook: [
		'You run `docker stop db` on a PostgreSQL container started with `--stop-signal SIGTERM`, while a client runs a long query. The command sits there for 10 seconds, then returns. `docker logs db` shows `received smart shutdown request`.',
		'Docker sent SIGTERM to the main process, waited its default 10 seconds, then sent SIGKILL. PostgreSQL reads SIGTERM as Smart Shutdown: refuse new connections, then wait for every open session to end. The session with the long query did not end, so **the kernel killed the server at second 10** without running any of its code.',
		'The official `postgres` image ships with `STOPSIGNAL SIGINT` in its Dockerfile. For PostgreSQL, SIGINT means Fast Shutdown: it aborts the open transactions and stops cleanly.'
	],
	terms: [
		{ term: 'Signal', def: 'A numbered notice the kernel delivers to a process, sent by another process with `kill()` or by the kernel itself. SIGTERM is 15, SIGKILL is 9 on x86.' },
		{ term: 'Disposition', def: 'What a process does when a given signal arrives: the default action (often terminate), ignore it, or run a handler.' },
		{ term: 'Handler', def: 'A function the program registers with `sigaction()`. The kernel calls it when the signal arrives. SIGKILL and SIGSTOP cannot have one.' },
		{ term: 'Grace period', def: 'The seconds `docker stop` waits between the stop signal and SIGKILL. 10 by default, set with `--stop-timeout` or `docker stop -t`.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['dk["docker stop db"] -->|"kill SIGTERM"| pm["postgres, main process of the container"]'],
				highlight: ['dk', 'pm'],
				note: 'Docker sends the image\'s `StopSignal`, or SIGTERM when none is set, to the main process. It then waits up to the timeout: 10 seconds for Linux containers unless `--stop-timeout` or `-t` says otherwise.'
			},
			{
				add: ['pm --> h["Handler runs: pending_pm_shutdown_request = true"]'],
				highlight: ['h'],
				note: 'The kernel marks SIGTERM pending. At the next switch from kernel mode back to user mode, it sees a pending signal with a handler, saves the program counter and registers on the stack, and jumps to the handler. PostgreSQL\'s handler sets one flag and returns.'
			},
			{
				add: ['h --> smart["Smart Shutdown: no new connections, wait for every session"]', 'smart --> busy["One session still runs its query"]'],
				highlight: ['smart', 'busy'],
				note: 'The main loop sees the flag and logs `received smart shutdown request`. The docs: the server "lets existing sessions end their work normally. It shuts down only after all of the sessions terminate." A query that runs for 600 seconds keeps the server up for at least 600 seconds.'
			},
			{
				add: ['dk -->|"10 s later: SIGKILL"| dead["Kernel ends postgres, no code of it runs"]'],
				highlight: ['dead'],
				note: 'SIGKILL cannot be caught, blocked or ignored. The kernel ends the process, and no handler runs. The PostgreSQL docs warn that SIGKILL keeps the server from "releasing shared memory and semaphores" and from relaying the signal to its child processes.'
			},
			{
				add: ['img["STOPSIGNAL SIGINT in the image"] -->|"SIGINT"| fast["Fast Shutdown: children get SIGTERM, transactions abort"]'],
				highlight: ['img', 'fast'],
				note: 'With SIGINT, the server "sends all existing server processes SIGTERM, which will cause them to abort their current transactions and exit promptly". The official image sets this so a plain `docker stop` asks for Fast Shutdown.'
			}
		]
	},
	example: {
		title: 'src/backend/postmaster/postmaster.c: one handler, three shutdown modes',
		repo: 'postgres/postgres',
		url: `${PM}#L2042-L2153`,
		lang: 'c',
		code: `/*
 * pg_ctl uses SIGTERM, SIGINT and SIGQUIT to request different types of
 * shutdown.
 */
static void
handle_pm_shutdown_request_signal(SIGNAL_ARGS)
{
	switch (postgres_signal_arg)
	{
		case SIGTERM:
			/* smart is implied if the other two flags aren't set */
			pending_pm_shutdown_request = true;
			break;
		case SIGINT:
			pending_pm_fast_shutdown_request = true;
			pending_pm_shutdown_request = true;
			break;
		case SIGQUIT:
			pending_pm_immediate_shutdown_request = true;
			pending_pm_shutdown_request = true;
			break;
	}
	SetLatch(MyLatch);
}
…
	switch (mode)
	{
		case SmartShutdown:

			/*
			 * Smart Shutdown:
			 *
			 * Wait for children to end their work, then shut down.
			 */
			if (Shutdown >= SmartShutdown)
				break;
			Shutdown = SmartShutdown;
			ereport(LOG,
					(errmsg("received smart shutdown request")));
…
		case FastShutdown:

			/*
			 * Fast Shutdown:
			 *
			 * Abort all children with SIGTERM (rollback active transactions
			 * and exit) and shut down when they are gone.
			 */
			if (Shutdown >= FastShutdown)
				break;
			Shutdown = FastShutdown;
			ereport(LOG,
					(errmsg("received fast shutdown request")));`,
		notes: [
			'At startup, [lines 551 to 553](' + PM + '#L551-L553) register this one handler for SIGINT, SIGQUIT and SIGTERM. Lines 10 to 21 only record which signal came, in three flags.',
			'Line 23 `SetLatch()` wakes the main loop, and the handler returns. The real work happens later, outside the handler, when the loop calls `process_pm_shutdown_request()`. signal-safety(7) explains why: a handler that calls a function like `printf()` while the main program is inside it "will operate on inconsistent data".',
			'Lines 28 to 39 are the SIGTERM branch. The comment on line 33 says what it does: "Wait for children to end their work, then shut down." Line 39 writes the log line you see after `docker stop`.',
			'Lines 41 to 53 are the SIGINT branch. Line 46 states the plan: abort all children with SIGTERM, which rolls back their transactions.',
			'The switch has no `case SIGKILL`. sigaction(2) accepts "any valid signal except SIGKILL and SIGSTOP", so no program can register code for SIGKILL.'
		]
	},
	tradeoff: {
		gain: [
			'SIGTERM lets the program run its own shutdown: PostgreSQL stops taking connections and ends its sessions before it exits.',
			'SIGKILL cannot be caught, blocked or ignored, so `docker stop` returns after the grace period even when the program never handles SIGTERM.'
		],
		cost: [
			'A handler that waits for clients can take longer than 10 seconds. SIGKILL then lands in the middle, and PostgreSQL cannot release its shared memory and semaphores.',
			'Each program reads the signals its own way: SIGTERM is a slow, polite stop for PostgreSQL. The image must set `STOPSIGNAL` to the signal the program treats as a prompt stop.'
		]
	},
	task: {
		prompt: 'A container runs `python app.py` as its main process. `grep SigCgt /proc/<pid>/status` prints `SigCgt: 0000000000004000`. Which signals does it catch, and what happens on `docker stop`? Bit n-1 of the mask stands for signal n.',
		hint: 'Convert 0x4000 to binary and count from bit 0. Then look up signal 15 in signal(7).',
		answer: [
			'0x4000 is 2 to the power 14: only bit 14 is set, which is signal 15, SIGTERM. Captured in this session: a Python process with `signal.signal(signal.SIGTERM, ...)` shows exactly `0000000000004000`, and `sleep 60` shows all zeros.',
			'`docker stop` sends SIGTERM, so the program\'s handler runs. If the handler makes the program exit within 10 seconds, Docker never sends SIGKILL.',
			'If the handler only logs and returns, the program keeps running. Docker sends SIGKILL at second 10, and the handler cannot stop that.',
			'For comparison, captured in this session: `sleep 300` with no handler, sent `kill -TERM`, ends with status 143. A bash loop with `trap ... TERM` keeps running after `kill -TERM` and ends with 137 after `kill -KILL`.'
		],
		steps: [
			{
				title: 'Decode the mask',
				questions: [
					{ q: 'What does the `SigCgt` line in `/proc/<pid>/status` list?', options: ['The signals the process has sent', 'The signals the process ignores', 'The signals waiting in the queue to be delivered', 'The signals it catches with a handler'], answer: 3, why: '`SigCgt` is the caught mask: one bit per signal that has a handler.' },
					{ q: '`0x4000` is which power of 2?', options: ['2 to the power 14', '2 to the power 15', '2 to the power 12', '2 to the power 4'], answer: 0, why: '0x4000 is 16384, which is 2 to the power 14. Only one bit is set.' },
					{ q: 'Only bit 14 is set. With bit n-1 standing for signal n, which signal number is it?', options: ['14', '15', '13', '16'], answer: 1, why: 'Bit 14 is n-1 with n = 15. Counting starts at bit 0 for signal 1.' },
					{ q: '`sleep 60` shows `SigCgt: 0000000000000000`. What does that tell you?', options: ['`sleep` blocks every signal until it wakes up', '`sleep` cannot receive signals', '`sleep` has no handler: defaults apply', 'The kernel hides the mask for short programs'], answer: 2, why: 'All zeros means no handlers. SIGTERM then uses its default action: terminate.' }
				]
			},
			{
				title: 'Name the signal',
				questions: [
					{ q: 'Which signal is number 15?', options: ['SIGKILL', 'SIGINT', 'SIGQUIT', 'SIGTERM'], answer: 3, why: 'signal(7): SIGTERM is 15. SIGKILL is 9 on x86.' },
					{ q: 'Which Python line would give exactly this mask?', options: ['`signal.signal(signal.SIGTERM, handler)`', '`signal.signal(signal.SIGKILL, handler)`', '`os.kill(os.getpid(), 15)`', '`signal.pause()`'], answer: 0, why: 'Registering a SIGTERM handler sets bit 14. The chapter captured exactly `0000000000004000` for that.' },
					{ q: 'Could you add a bit for SIGKILL to this mask?', options: ['Yes, with `sigaction()` when the process runs as root', 'No: SIGKILL cannot be caught, blocked or ignored', 'Yes, but only inside a container', 'Only if SIGTERM is caught first'], answer: 1, why: 'sigaction(2) accepts "any valid signal except SIGKILL and SIGSTOP".' },
					{ q: 'What does the mask not tell you about the SIGTERM handler?', options: ['That a handler exists', 'Which signal it is for', 'Whether the handler makes the program exit', 'That the default action is replaced'], answer: 2, why: 'The bit only says a handler is registered. What it does, exit or just log, is in the code.' }
				]
			},
			{
				title: 'Follow docker stop',
				questions: [
					{ q: 'What does `docker stop` send first when the image sets no `STOPSIGNAL`?', options: ['SIGTERM', 'SIGKILL', 'SIGINT', 'SIGHUP'], answer: 0, why: 'Docker sends the image\'s `StopSignal`, or SIGTERM when none is set.' },
					{ q: 'The handler cleans up and exits within 10 seconds. What happens next?', options: ['Docker still sends SIGKILL at second 10', 'Docker restarts the container', 'The kernel runs the handler a second time', 'Docker never sends SIGKILL'], answer: 3, why: 'SIGKILL only comes when the process is still running at the end of the grace period.' },
					{ q: 'The handler only logs and returns. What happens?', options: ['The program exits on its own once the handler returns', 'It keeps running until SIGKILL at second 10', 'Docker waits forever for the program', 'The kernel turns SIGTERM into SIGKILL at once'], answer: 1, why: 'After a handler returns, the program carries on. Docker sends SIGKILL when the 10 seconds are up.' },
					{ q: 'How do you give the program more than 10 seconds?', options: ['Catch SIGKILL in the handler', 'Set `STOPSIGNAL SIGINT`', 'Pass `--stop-timeout` or `docker stop -t`', 'Restart the container with `--rm`'], answer: 2, why: 'The grace period is 10 seconds by default, and these two options change it.' }
				]
			},
			{
				title: 'Check the exit codes',
				questions: [
					{ q: '`sleep 300` with no handler gets `kill -TERM`. What status does the shell see?', options: ['143', '137', '15', '0'], answer: 0, why: 'Captured in the chapter: 143, which is 128 + 15 for SIGTERM.' },
					{ q: 'A bash loop with `trap ... TERM` gets `kill -TERM`. What happens?', options: ['It exits with 143', 'It exits with 0', 'It exits with 137', 'It keeps running'], answer: 3, why: 'The trap is a handler, so the default action no longer applies.' },
					{ q: 'That loop then gets `kill -KILL`. What status?', options: ['143', '137', '9', '1'], answer: 1, why: 'SIGKILL ends it whatever the trap says, and the status is 137, which is 128 + 9.' },
					{ q: 'After a stop that took 10 seconds, the main process ended with status 137. What does that point to?', options: ['The handler exited with an error', 'The healthcheck failed', 'SIGKILL ended it after the grace period', 'SIGTERM was delivered twice'], answer: 2, why: '137 means SIGKILL, and 10 seconds is the default grace period.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Why can a process run cleanup code after `kill -TERM` but never after `kill -KILL`?',
			options: [
				'`kill -KILL` sends SIGTERM nine times in a row, too fast for a handler',
				'The kernel cannot let a process catch, block or ignore SIGKILL',
				'The handler for SIGKILL runs, but the kernel discards its output',
				'Only processes running as root are allowed to register a SIGKILL handler'
			],
			answer: 1,
			why: 'signal(7): "The signals SIGKILL and SIGSTOP cannot be caught, blocked, or ignored." sigaction(2) refuses them, so there is no handler to run, and the kernel applies the default action: terminate.'
		},
		{
			q: '`docker stop api` takes exactly 10 seconds every time. What is the likely cause?',
			options: [
				'Docker always waits 10 seconds so the container logs can be flushed',
				'The kernel queues SIGTERM for 10 seconds before it delivers it',
				'The main process does not exit on SIGTERM, so Docker sends SIGKILL after the timeout',
				'The container\'s healthcheck runs every 10 seconds and blocks the stop'
			],
			answer: 2,
			why: 'Docker sends the stop signal, SIGTERM by default, then waits up to 10 seconds for Linux containers. A process that ignores SIGTERM, or handles it without exiting, is killed with SIGKILL when the timer ends.'
		},
		{
			q: 'The PostgreSQL main process receives SIGTERM while 3 sessions are open. What does it do?',
			options: [
				'Refuses new connections and waits for the 3 sessions to end on their own',
				'Sends SIGTERM to the 3 sessions, rolls back their transactions and exits',
				'Exits at once without a shutdown checkpoint, and replays the WAL at next start',
				'Ignores it, because only `pg_ctl stop` can shut the server down'
			],
			answer: 0,
			why: 'SIGTERM is Smart Shutdown: the handler sets `pending_pm_shutdown_request`, and the server waits for every session to end. Aborting the transactions is Fast Shutdown (SIGINT). Exiting without normal shutdown processing is Immediate Shutdown (SIGQUIT).'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Read a process\'s caught-signal mask, then see SIGTERM handled and SIGKILL not.',
		steps: [
			'Make a scratch folder: `mkdir -p ~/signal-lab && cd ~/signal-lab`.',
			'Write a program that catches SIGTERM and does not exit: `printf \'import signal, time\\nsignal.signal(signal.SIGTERM, lambda s, f: print("got SIGTERM, ignoring", flush=True))\\nwhile True: time.sleep(1)\\n\' > app.py`.',
			'Start it in the background and read its mask (Linux): `python3 app.py & p=$!; sleep 1; grep SigCgt /proc/$p/status`.',
			'Send SIGTERM, check it still runs, then send SIGKILL: `kill -TERM $p; sleep 1; kill -0 $p && echo still running; kill -KILL $p; wait $p; echo status=$?`.',
			'Compare with a program that has no handler: `sleep 300 & s=$!; grep SigCgt /proc/$s/status; kill -TERM $s; wait $s; echo status=$?`.'
		],
		done: [
			'The mask of `app.py` has bit 14 set: it ends in `4000`, or `4002` when Python also catches SIGINT for Ctrl-C.',
			'After `kill -TERM`, the program prints `got SIGTERM, ignoring` and `still running` appears.',
			'After `kill -KILL`, `status=137` appears.',
			'`sleep 300` shows an all-zero mask and ends with `status=143`.'
		],
		solution: [
			'0x4000 is bit 14, signal 15, SIGTERM. Bit 1 (0x2) is signal 2, SIGINT.',
			'The handler replaces the default action, so SIGTERM only prints a line. That is what makes `docker stop` wait its full 10 seconds.',
			'SIGKILL cannot be caught, so the kernel ends the process: 128 + 9 = 137. With no handler, SIGTERM terminates `sleep`: 128 + 15 = 143.',
			'On macOS there is no `/proc`: skip the `grep SigCgt` parts, the `kill` steps work the same.'
		]
	},
	recall: {
		q: 'What does `docker stop` send to the main process, and when does the second signal come?',
		a: 'The image\'s `StopSignal`, SIGTERM by default, then SIGKILL if the process is still running after 10 seconds. SIGKILL cannot be caught, so no cleanup code runs.'
	},
	sources: [
		{ title: 'signal(7), Linux manual page', url: 'https://man7.org/linux/man-pages/man7/signal.7.html' },
		{ title: 'sigaction(2), Linux manual page', url: 'https://man7.org/linux/man-pages/man2/sigaction.2.html' },
		{ title: 'signal-safety(7), Linux manual page', url: 'https://man7.org/linux/man-pages/man7/signal-safety.7.html' },
		{ title: 'Docker docs, docker container stop', url: 'https://docs.docker.com/reference/cli/docker/container/stop/' },
		{ title: 'PostgreSQL docs, Shutting Down the Server', url: 'https://www.postgresql.org/docs/current/server-shutdown.html' },
		{ title: 'docker-library/postgres, 17/bookworm/Dockerfile (STOPSIGNAL SIGINT)', url: PGIMG + '#L193-L215' }
	]
};
