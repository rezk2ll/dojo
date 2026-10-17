/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'processes',
	part: 'The shell',
	title: 'Processes',
	minutes: 10,
	hook: [
		'You start the API on a test server and it stops at once: port 8080 is already in use. Yesterday’s server is still running in a terminal nobody closed. You need to find it, stop it cleanly, and start a long backup that keeps running after your SSH session closes.',
		'The reps use this state. PID 4242 is `python3 -m http.server 8080`, the old server, still listening on port 8080. PID 5150 is `python3 worker.py`, which must keep running. `./backup.sh` takes an hour, prints progress on standard output and warnings on standard error. You run all commands in bash.'
	],
	terms: [
		{ term: 'PID', def: 'The process ID: the number the kernel gives each running process, such as 4242.' },
		{ term: 'signal', def: 'A numbered message the kernel delivers to a process. `kill` sends one; SIGTERM is 15 and SIGKILL is 9.' },
		{ term: 'job', def: 'A command that bash started from this terminal, numbered from 1. `jobs` lists them and `%1` refers to job 1.' }
	],
	reps: [
		{
			prompt: 'List every process on the machine, with its user, CPU and memory use.',
			accept: ['ps aux', 'ps axu'],
			why: '`a` and `x` lift the "only yourself" and "must have a tty" limits, so `ps` shows every process. `u` adds the user-oriented columns, among them `USER`, `%CPU` and `%MEM`.'
		},
		{
			prompt: 'Print the PID and the full command line of every process named `python3`.',
			accept: ['pgrep -a python3', 'pgrep --list-full python3'],
			why: '`pgrep python3` matches process names and prints PIDs. `-a` adds the command line, so you can tell `4242 python3 -m http.server 8080` from `5150 python3 worker.py`.'
		},
		{
			prompt: 'Print only the PIDs of processes whose command line contains `http.server`.',
			accept: ['pgrep -f http.server', 'pgrep --full http.server', "pgrep -f 'http.server'", 'pgrep -f "http.server"'],
			why: 'Both processes are named `python3`. `-f` matches the pattern against the full command line instead, so 4242 matches and 5150 does not.'
		},
		{
			prompt: 'Show which process has port 8080 open.',
			accept: ['lsof -i :8080', 'lsof -i:8080', 'lsof -i TCP:8080', 'lsof -iTCP:8080', 'lsof -i tcp:8080', 'sudo lsof -i :8080', 'sudo lsof -i:8080', 'sudo lsof -i TCP:8080'],
			why: '`-i` lists open network files whose address matches, and `:8080` is the port part of the address. The `COMMAND` and `PID` columns show `python3` and `4242`.'
		},
		{
			prompt: 'Ask PID 4242 to stop with the default signal, which the process can catch to clean up.',
			accept: ['kill 4242', 'kill -15 4242', 'kill -TERM 4242', 'kill -SIGTERM 4242', 'kill -s TERM 4242', 'kill -s SIGTERM 4242', 'kill -s 15 4242'],
			why: 'With no signal given, `kill` sends SIGTERM, number 15. A process can install a handler for it and run its clean-up steps before it exits.'
		},
		{
			prompt: '30 seconds later PID 4242 is still running. Send the signal that the process cannot catch.',
			accept: ['kill -9 4242', 'kill -KILL 4242', 'kill -SIGKILL 4242', 'kill -s KILL 4242', 'kill -s SIGKILL 4242', 'kill -s 9 4242'],
			why: '`-9` sends SIGKILL. A process cannot catch it, so the process ends without running any clean-up steps.'
		},
		{
			prompt: 'You started `./backup.sh` in the foreground, then pressed Ctrl+Z. List the jobs of this shell with their PIDs.',
			accept: ['jobs -l'],
			why: '`jobs` lists the jobs of this shell with their number in brackets and their state, here `[1]+ Stopped`. `-l` adds the PID of each job.'
		},
		{
			prompt: '`./backup.sh` is job 1 and stopped. Let it continue in the background.',
			accept: ['bg %1', 'bg', 'bg %%', 'bg %+', 'bg 1', '%1 &'],
			why: '`bg %1` resumes job 1 as if you had started it with `&`, and you get the prompt back. With no argument, `bg` acts on the current job, marked `+` in `jobs`.'
		},
		{
			prompt: 'Bring job 1 back to the foreground.',
			accept: ['fg %1', 'fg', 'fg %%', 'fg %+', 'fg 1', '%1'],
			why: '`fg %1` puts job 1 back in the foreground, so it reads your keyboard and Ctrl+C reaches it. Typing `%1` alone does the same.'
		},
		{
			prompt: 'Start `./backup.sh` in the background so it keeps running after your SSH session closes. Send both of its output streams to `backup.log`.',
			accept: [
				'nohup ./backup.sh > backup.log 2>&1 &',
				'nohup ./backup.sh >backup.log 2>&1 &',
				'nohup ./backup.sh &> backup.log &',
				'nohup ./backup.sh &>backup.log &',
				'nohup ./backup.sh > backup.log &'
			],
			why: 'When the SSH session closes, bash gets SIGHUP and sends it on to all its jobs; `nohup` makes `./backup.sh` ignore it. `> backup.log 2>&1` sends both streams to the file and the last `&` starts the job in the background. Without a redirect, `nohup` appends the output to `nohup.out`.'
		}
	],
	quiz: [],
	recall: {
		q: 'What signal does `kill 4242` send, and how does it differ from `kill -9 4242`?',
		a: 'SIGTERM, number 15, which the process can catch to clean up before it exits. `-9` sends SIGKILL, which cannot be caught, so the process ends with no clean-up.'
	},
	sources: [
		{ title: 'ps(1)', url: 'https://man7.org/linux/man-pages/man1/ps.1.html' },
		{ title: 'pgrep(1)', url: 'https://man7.org/linux/man-pages/man1/pgrep.1.html' },
		{ title: 'kill(1)', url: 'https://man7.org/linux/man-pages/man1/kill.1.html' },
		{ title: 'signal(7)', url: 'https://man7.org/linux/man-pages/man7/signal.7.html' },
		{ title: 'bash(1): JOB CONTROL', url: 'https://man7.org/linux/man-pages/man1/bash.1.html' },
		{ title: 'nohup(1)', url: 'https://man7.org/linux/man-pages/man1/nohup.1.html' },
		{ title: 'lsof(8)', url: 'https://man7.org/linux/man-pages/man8/lsof.8.html' }
	]
};
