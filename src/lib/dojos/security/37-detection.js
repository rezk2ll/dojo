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
