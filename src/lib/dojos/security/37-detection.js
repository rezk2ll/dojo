const RULES = 'https://github.com/falcosecurity/rules/blob/81dfa535284a3fb3c04470eaefa435ac8f5b6558/rules/falco_rules.yaml';
const FIX = 'https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/commit/?id=24f6008564183aa120d07c03d9289519c2fe02af';
const ISSUE = 'https://github.com/falcosecurity/falco/issues/3480';
const ADOPT = 'https://falco.org/docs/concepts/rules/adoption-rules/';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'detection',
	part: 'Running safely',
	title: 'Detecting an attack',
	minutes: 10,
	hook: [
		'On 20 January 2022, a Linux kernel commit titled "cgroup-v1: Require capabilities to set release_agent" closed a container escape. With cgroups v1, the kernel starts the program named in a cgroup’s `release_agent` file with a full set of capabilities, on the host. The flaw became CVE-2022-0492, scored 7.8.',
		'On 2 June 2026, CISA added CVE-2022-0492 to its Known Exploited Vulnerabilities catalog, with a due date of 5 June. Attackers were using it more than four years after the fix.',
		'The patch closes the hole. A detection rule tells you when someone tries it, or tries something no patch covers yet.'
	],
	terms: [
		{ term: 'Syscall', def: 'A request from a process to the kernel: `openat` opens a file, `execve` starts a program. Falco reads these events from the kernel and checks each one against its rules.' },
		{ term: 'Detection rule', def: 'A condition on an event, plus an output line and a priority. In Falco: `condition: open_write and container and fd.name endswith release_agent ...`.' },
		{ term: 'False positive', def: 'An alert on harmless activity, such as systemd reading `/etc/shadow` during an SSH login.' },
		{ term: 'Alert fatigue', def: 'People on call stop reading alerts of a kind when nearly all of them have been false positives, and so they miss the real one.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['shell["Attacker has a shell in a container with CAP_SYS_ADMIN"] --> write["openat(release_agent, O_WRONLY): writes a host path to run"]'],
				highlight: ['shell', 'write'],
				note: 'The attacker already runs code in a container through a bug in the app. The container keeps `CAP_SYS_ADMIN`, and the host uses cgroups v1. The attacker opens a cgroup’s `release_agent` file for writing and puts a program path in it.'
			},
			{
				add: ['write --> host["Kernel runs that program on the host, with every capability"]'],
				highlight: ['host'],
				note: 'When the last task leaves a cgroup with `notify_on_release` set to 1, the kernel runs the command in `release_agent`. The fix commit says the kernel starts it "with a full set" of capabilities. The program runs on the host, outside the container’s namespaces.'
			},
			{
				add: ['write -.->|"syscall event"| falco["Falco rule: open_write, container, endswith release_agent, CAP_SYS_ADMIN"]', 'falco --> alert["CRITICAL alert: file, cap_effective, process, command line"]'],
				highlight: ['falco', 'alert'],
				note: 'Falco reads the same `openat` event from the kernel. The rule "Detect release_agent File Container Escapes" matches a write, inside a container, to a file ending in `release_agent`, by a process with `CAP_SYS_ADMIN`. The alert names the file, the capabilities and the command line.'
			},
			{
				add: ['patch["Kernel fix: CAP_SYS_ADMIN in the init user namespace, else EPERM"] -.->|"write refused"| write', 'drop["Container drops CAP_SYS_ADMIN"] -.-> shell'],
				highlight: ['patch', 'drop'],
				note: 'Falco reports the write, and the program on the host still runs. Two other layers stop the escape: the patched kernel returns `-EPERM` unless the writer has `CAP_SYS_ADMIN` in the initial user namespace, and a container that drops `CAP_SYS_ADMIN` (day 33) never matches the rule.'
			},
			{
				add: ['fp["systemd-executor reads /etc/shadow after an SSH login"] --> noisy["WARNING: Sensitive file opened by non-trusted program"]'],
				highlight: ['fp', 'noisy'],
				note: 'Other rules fire on harmless work. In falco#3480, "Read sensitive file untrusted" fired often after SSH logins: systemd’s helper read `/etc/shadow` with `proc.name` reported as `9`. Each false positive like this one trains the on-call person to skip that alert.'
			}
		]
	},
	example: {
		title: 'rules/falco_rules.yaml: a default rule and the exceptions that keep it quiet',
		repo: 'falcosecurity/rules',
		url: `${RULES}#L397-L446`,
		lang: 'yaml',
		code: `- rule: Read sensitive file untrusted
…
  condition: >
    open_read
    and sensitive_files
    and proc_name_exists
    and not proc.name in (user_mgmt_binaries, userexec_binaries, package_mgmt_binaries,
     cron_binaries, read_sensitive_file_binaries, shell_binaries, hids_binaries,
     vpn_binaries, mail_config_binaries, nomachine_binaries, sshkit_script_binaries,
     in.proftpd, mandb, salt-call, salt-minion, postgres_mgmt_binaries,
     google_oslogin_
     )
    and not cmp_cp_by_passwd
    and not ansible_running_python
    and not run_by_qualys
    and not run_by_chef
    and not run_by_google_accounts_daemon
    and not user_read_sensitive_file_conditions
    and not mandb_postinst
    and not perl_running_plesk
    and not perl_running_updmap
    and not veritas_driver_script
    and not perl_running_centrifydc
    and not runuser_reading_pam
    and not linux_bench_reading_etc_shadow
    and not user_known_read_sensitive_files_activities
    and not user_read_sensitive_file_containers
    and not systemd_sensitive_file_readers
…
  priority: WARNING
  tags: [maturity_stable, host, container, filesystem, mitre_credential_access, T1555]

# systemd spawns short-lived helper processes that legitimately read sensitive
# account/PAM files (e.g. /etc/shadow, /etc/pam.d/*) during normal operation.
# These helpers report a bare-number or comm-truncated proc.name, so they cannot
# be matched by name; proc.exepath (kernel-resolved, unspoofable) is used instead,
# and each entry is anchored to its expected systemd parent to keep it tight.
#   - systemd-executor: unit (re)exec deserialize handoff (see falcosecurity/falco#3480)
#   - systemd-userwork: userdb (User/Group Record Lookup) query worker
# The rule "Read sensitive file untrusted" uses this macro to avoid FPs.
- macro: systemd_sensitive_file_readers
  condition: >
    ((proc.pname=systemd and proc.exepath=/usr/lib/systemd/systemd-executor) or
     (proc.pname=systemd-userdbd and proc.exepath=/usr/lib/systemd/systemd-userwork))`,
		notes: [
			'The first three lines of the condition are the detection: a file opened for reading, the file is in `sensitive_files` (`/etc/shadow`, `/etc/sudoers`, `/etc/pam.conf`, and files under `/etc/pam.d`), and the process has a name.',
			'The 16 `and not` macros after that skip programs that read these files for normal work: Ansible, Chef, Qualys, man-db, Plesk scripts. They come on top of the long list of trusted program names.',
			'The last macro is the fix for [falco#3480](' + ISSUE + '). The helper reported `proc.name` as `9`, so a name match could not work. The macro matches `proc.exepath`, which the comment calls "kernel-resolved, unspoofable", and the parent process.',
			'`user_known_read_sensitive_files_activities` is `never_true` by default. It is an empty slot for your own exceptions, so you can tune the rule in your own file and keep upstream updates.'
		]
	},
	tradeoff: {
		gain: [
			'Falco reads syscalls from the kernel, so one rule covers every container on the node, with nothing added to the images.',
			'The release_agent rule has 5 conditions and fires on a single `openat`. The alert carries the file, the capabilities and the command line.',
			'Exceptions that match `proc.exepath` and the parent process silence one known program and still catch `cat /etc/shadow` from an attacker.'
		],
		cost: [
			'Falco sends the alert after the `openat` has happened, so the patch and the dropped capabilities still have to stop the escape.',
			'Each exception is a hole: an exception that matches only `proc.name` lets any binary with that name through.',
			'The Falco docs say "Falco rules require constant tuning and maintenance". New software on the hosts brings new false positives.'
		]
	},
	task: {
		prompt: 'Every night, after the backup job logs in over SSH, Falco sends this WARNING a few dozen times:\n\n```\nrule=Read sensitive file untrusted file=/etc/shadow process=9\nproc_exepath=/usr/lib/systemd/systemd-executor parent=systemd\ncommand=9 --deserialize 88 --log-level info\n```\n\nWrite a tuning for your local rules file that stops these alerts and still alerts on `cat /etc/shadow` run by an attacker. Name two tunings you rejected and why.',
		hint: 'The rule already ends with `and not user_known_read_sensitive_files_activities`. Which fields of the alert does an attacker not control?',
		answer: [
			'Replace the empty macro in `/etc/falco/falco_rules.local.yaml`, loaded after the default file:\n```yaml\n- macro: user_known_read_sensitive_files_activities\n  condition: (proc.pname=systemd and proc.exepath=/usr/lib/systemd/systemd-executor)\n  override:\n    condition: replace\n```',
			'`cat /etc/shadow` from an attacker has `proc.exepath=/usr/bin/cat` and a shell as parent, so it still matches the rule. Upstream fixed falco#3480 with the same two fields in `systemd_sensitive_file_readers`.',
			'Rejected: adding `9` to a list of trusted names. Any program the attacker names `9` would then read `/etc/shadow` with no alert.',
			'Rejected: disabling the rule, or excluding `/etc/shadow`. Both silence the attacker too. Lowering the priority puts the attacker’s read in the same low bucket as the nightly noise.'
		],
		steps: [
			{
				title: 'Read the alert',
				questions: [
					{ q: 'Which rule sends this WARNING?', options: ['Read sensitive file untrusted', 'Terminal shell in container', 'Detect release_agent File Container Escapes', 'Write below etc'], answer: 0, why: 'The alert line starts with `rule=Read sensitive file untrusted`, and the file is `/etc/shadow`.' },
					{ q: 'Which program really opened `/etc/shadow`?', options: ['A program called `9`', '`/usr/lib/systemd/systemd-executor`, started by systemd', 'The backup job’s login shell', '`cat`'], answer: 1, why: '`process=9` is only the name it reports. `proc_exepath` and `parent` show systemd’s helper.' },
					{ q: 'When does the alert fire?', options: ['Every hour, on the hour', 'When an attacker logs in', 'After the nightly backup job logs in over SSH', 'Only when Falco restarts'], answer: 2, why: 'The prompt ties it to the backup job’s SSH login, the same pattern as falco#3480.' },
					{ q: 'Why is this a false positive?', options: ['The file is `/etc/sudoers`, not `/etc/shadow`', 'Falco is set up wrong on this host', 'The rule has no priority set', 'It is systemd’s own helper doing normal work after an SSH login'], answer: 3, why: 'An alert on harmless activity is a false positive. Systemd reading `/etc/shadow` during an SSH login is the chapter’s own example.' }
				]
			},
			{
				title: 'Pick fields the attacker cannot fake',
				questions: [
					{ q: 'Why is `process=9` a bad field to match on?', options: ['Any program can be named `9`', 'It changes every night', 'Falco cannot read it', 'It is too short to go in a list'], answer: 0, why: 'A process name can be set by any program, so a match on it can be copied.' },
					{ q: 'What does the upstream macro comment say about `proc.exepath`?', options: ['It is empty in containers', 'It is "kernel-resolved, unspoofable"', 'It is set by the program itself', 'It needs a Falco plugin'], answer: 1, why: 'The kernel resolves the path of the executable, so the program cannot pick a fake one.' },
					{ q: 'An attacker copies a binary to `/tmp/systemd-executor`, runs it, and it reads `/etc/shadow`. Does the exe path in your exception match?', options: ['Yes: the file name is the same', 'Yes, if the binary also names itself `9`', 'No: the kernel reports `/tmp/systemd-executor`, not `/usr/lib/systemd/systemd-executor`', 'No: Falco ignores binaries in `/tmp`'], answer: 2, why: 'The kernel resolves the full path of the executable, so a copy elsewhere carries its own path and the rule still fires.' },
					{ q: 'An attacker runs `cat /etc/shadow` from a shell. What does Falco see?', options: ['`proc.exepath=/usr/lib/systemd/systemd-executor`', 'Nothing: `cat` is a trusted program', '`process=9` and parent `systemd`', '`proc.exepath=/usr/bin/cat` and a shell as parent'], answer: 3, why: 'Neither field matches the exception, so the rule still fires for the attacker.' }
				]
			},
			{
				title: 'Write the tuning',
				questions: [
					{ q: 'Which file does the tuning go in?', options: ['`/etc/falco/falco_rules.yaml`, edited in place', '`/etc/falco/falco_rules.local.yaml`, loaded after the default file', 'A new file loaded before the default one', '`/etc/falco/falco.yaml`'], answer: 1, why: 'Your own file is loaded after the default rules, so you keep your change and still get upstream updates.' },
					{ q: 'Which macro do you replace?', options: ['`sensitive_files`', '`open_read`', '`user_known_read_sensitive_files_activities`', '`never_true`'], answer: 2, why: 'The rule already ends with `and not user_known_read_sensitive_files_activities`. It is `never_true` by default, an empty slot for your exceptions.' },
					{ q: 'What does `override: condition: replace` do?', options: ['It replaces the macro’s condition with yours', 'It adds your condition after the old one', 'It deletes the rule', 'It lowers the rule’s priority'], answer: 0, why: 'The default macro is `never_true`. Replacing it puts your exception in its place.' },
					{ q: 'Which condition goes in the macro?', options: ['`proc.name=9`', '`fd.name=/etc/shadow`', '`proc.pname=systemd`', '`(proc.pname=systemd and proc.exepath=/usr/lib/systemd/systemd-executor)`'], answer: 3, why: 'Both fields together match the helper and nothing else. The parent alone would trust every child of systemd.' }
				]
			},
			{
				title: 'Reject the bad tunings',
				questions: [
					{ q: 'Why reject adding `9` to the list of trusted names?', options: ['Any program the attacker names `9` would read `/etc/shadow` with no alert', 'Falco lists cannot hold numbers', 'It slows every rule down', 'It only works after a restart'], answer: 0, why: 'An exception that matches only a name lets any binary with that name through.' },
					{ q: 'Why reject removing `/etc/shadow` from the sensitive files?', options: ['The rule would stop loading', 'It silences the attacker’s read too', '`/etc/shadow` is not sensitive anyway', 'Falco would need a new kernel driver'], answer: 1, why: 'Without the file in the list, nobody reading it triggers anything, attacker included.' },
					{ q: 'Why reject lowering the priority to DEBUG?', options: ['DEBUG alerts are deleted at once', 'Falco does not allow it', 'The attacker’s read lands in the same low bucket as the noise', 'It costs more CPU'], answer: 2, why: 'The priority applies to every match of the rule, the real one too.' },
					{ q: 'No one is harmed by the nightly alerts. Why tune them at all?', options: ['They fill the disk', 'They make Falco crash', 'They slow down SSH logins', 'Alert fatigue: people stop reading that alert and miss the real one'], answer: 3, why: 'A few dozen false alerts a night train the on-call person to skip this rule.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Which event makes the rule "Detect release_agent File Container Escapes" fire?',
			options: [
				'Any process on the host that reads a file named `release_agent`',
				'A container process with `CAP_SYS_ADMIN` writing to a `release_agent` file',
				'A container that mounts a cgroup v1 filesystem at startup',
				'Any `execve` of a program listed in a cgroup `release_agent` file'
			],
			answer: 1,
			why: 'The condition is `open_write and container and fd.name endswith release_agent`, with uid 0 or `CAP_DAC_OVERRIDE`, and `CAP_SYS_ADMIN` in the effective capabilities. It watches the write that sets up the escape, before the kernel runs the program.'
		},
		{
			q: '"Read sensitive file untrusted" fires after SSH logins with `process=9` and `proc_exepath=/usr/lib/systemd/systemd-executor`. Which tuning did upstream choose?',
			options: [
				'Add `9` to the list of trusted program names for the rule',
				'Match `proc.exepath` together with the parent process `systemd`',
				'Lower the rule priority from WARNING to DEBUG on every host',
				'Remove `/etc/shadow` from the `sensitive_file_names` list'
			],
			answer: 1,
			why: 'The kernel resolves `proc.exepath`, and the macro comment calls it "unspoofable". A name like `9` can be set by any program, and removing the file or the priority would hide a real attacker as well.'
		},
		{
			q: 'Admins run `kubectl exec` all day, and "Terminal shell in container" sends a NOTICE each time. What does the rule’s own description suggest?',
			options: [
				'Disable the rule, because it cannot tell admins from attackers',
				'Raise it to CRITICAL so that on-call looks at every shell',
				'Use it as an audit record, read next to the alerts from other rules',
				'Add every admin’s user name to `shell_binaries`'
			],
			answer: 2,
			why: 'The description says it is "Common when using kubectl exec" and "may be best used as generic auditing rule while examining other triggered rules in this container/tty". It also suggests matching it with Kubernetes audit exec logs to find the user.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Load the task’s tuning into Falco, run it on your laptop, and check that a `cat /etc/shadow` in a container still raises the alert.',
		steps: [
			'Write the tuning to a local rules file: `mkdir -p ~/falco-lab && cd ~/falco-lab && printf \'%s\\n\' \'- macro: user_known_read_sensitive_files_activities\' \'  condition: (proc.pname=systemd and proc.exepath=/usr/lib/systemd/systemd-executor)\' \'  override:\' \'    condition: replace\' > local.yaml`.',
			'Check that Falco accepts it: `docker run --rm -v "$PWD/local.yaml":/etc/falco/falco_rules.local.yaml:ro falcosecurity/falco:0.42.0 falco -V /etc/falco/falco_rules.yaml -V /etc/falco/falco_rules.local.yaml`.',
			'In a first terminal, run Falco live. It needs `--privileged` to read kernel events, so do this only on your own machine: `docker run --rm -it --privileged -v /var/run/docker.sock:/var/run/docker.sock -v /proc:/host/proc:ro -v /etc:/host/etc:ro -v "$PWD/local.yaml":/etc/falco/falco_rules.local.yaml:ro falcosecurity/falco:0.42.0`.',
			'In a second terminal, play the attacker: `docker run --rm busybox:1.37 cat /etc/shadow`.',
			'Read the alert in the first terminal, then stop Falco with Ctrl+C.'
		],
		done: [
			'Step 2 prints `/etc/falco/falco_rules.local.yaml: Ok`.',
			'Falco prints `Warning Sensitive file opened for reading by non-trusted program` with `file=/etc/shadow` and, further along the same line, `process=cat`.'
		],
		solution: [
			'The alert line carries `proc_exepath`, the exe path the kernel resolved. That is the field the exception matches, and `cat` does not have the helper’s path.',
			'You may see the same WARNING for programs already running on your laptop, such as a database health check in another container. Each one is a candidate for its own exception on exe path and parent, never on name alone.',
			'This lab runs on Linux. On macOS, Docker Desktop runs containers in a VM, and the lab has not been tried there.'
		]
	},
	recall: {
		q: 'Which Falco default rule catches the CVE-2022-0492 escape attempt, and which syscall event does it watch?',
		a: '"Detect release_agent File Container Escapes", priority CRITICAL: an `openat` for writing on a file ending in `release_agent`, by a container process with `CAP_SYS_ADMIN`.'
	},
	sources: [
		{ title: 'falcosecurity/rules, rules/falco_rules.yaml', url: RULES },
		{ title: 'Falco docs, Adoption of Falco Rules in Production', url: ADOPT },
		{ title: 'Falco docs, Rule Exceptions', url: 'https://falco.org/docs/concepts/rules/exceptions/' },
		{ title: 'falcosecurity/falco#3480, false positives for sensitive file reads after SSH login', url: ISSUE },
		{ title: 'Linux kernel docs, cgroups v1 (notify_on_release and release_agent)', url: 'https://github.com/torvalds/linux/blob/70dd4ee72eb2d5793c62e71c14e3aba78e5a4e56/Documentation/admin-guide/cgroup-v1/cgroups.rst#L288-L302' },
		{ title: 'NVD, CVE-2022-0492', url: 'https://nvd.nist.gov/vuln/detail/CVE-2022-0492' },
		{ title: 'Linux kernel commit 24f6008, cgroup-v1: Require capabilities to set release_agent', url: FIX },
		{ title: 'CISA Known Exploited Vulnerabilities Catalog', url: 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog?field_cve=CVE-2022-0492' }
	]
};
