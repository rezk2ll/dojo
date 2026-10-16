const AFD = 'https://github.com/geerlingguy/ansible-for-devops/blob/86e1bf80098239cd995d54217585e8d61117d2e7';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'ansible',
	part: 'Infrastructure as code',
	title: 'Ansible: your runbook, run for you',
	minutes: 10,
	hook: [
		'You have twenty servers. A new one needs chrony installed and running. You ssh in, run `dnf install chrony`, `systemctl enable --now chronyd`, log out. Then the next one. Then the one you forgot.',
		'Your for-loop over ssh works until a server is half done, or already done, or different. The loop does not know. It just runs the commands again.',
		'**Ansible** turns that loop into a file that says what each server should look like. It connects over SSH, checks, and only changes **what is not already right**. No agent to install on the servers.'
	],
	terms: [
		{ term: 'Control node', def: 'The machine where you run Ansible: your laptop or a CI runner. Ansible is not normally installed on the managed nodes.' },
		{ term: 'Inventory', def: 'The list of managed nodes, sorted into groups like `[app]` and `[db]`. Ansible always adds the groups `all` and `ungrouped`.' },
		{ term: 'Module', def: 'A small program that does one job, like `dnf`, `service` or `copy`. Ansible copies it to the managed node and runs it there.' },
		{ term: 'Playbook', def: 'A YAML file with one or more plays. A play maps a group of hosts to a list of tasks. Each task calls one module.' },
		{ term: 'Idempotent', def: 'Running it twice gives the same result as running it once. A good task reports `ok` when there is nothing to do.' },
		{ term: 'Check mode', def: '`--check`: a dry run. Modules that support it report what they would change and change nothing.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['inv["inventory: hosts.ini"] --> cn["Control node: your laptop"]'],
				highlight: ['inv', 'cn'],
				note: 'Everything starts from the **inventory**. It is the list of servers you used to keep in your head, or in a wiki page, now in a file Ansible reads.'
			},
			{
				add: [
					'subgraph app["group app"]',
					'a1["192.168.56.4"]',
					'a2["192.168.56.5"]',
					'end',
					'subgraph dbg["group db"]',
					'd1["192.168.56.6"]',
					'end',
					'cn -->|SSH| a1',
					'cn -->|SSH| a2',
					'cn -->|SSH| d1'
				],
				highlight: ['a1', 'a2', 'd1'],
				note: 'Ansible talks to the managed nodes over **plain SSH**, with the keys you already have. The default connection type is `ssh`. Nothing runs on the servers between runs.'
			},
			{
				add: ['pb["playbook.yml: tasks in order"] --> cn'],
				highlight: ['pb'],
				note: 'The **playbook** runs top to bottom. Each task runs on every host of the play before the next task starts. If a task fails on a host, that host is dropped for the rest of the run.'
			},
			{
				add: ['res["Each task reports: ok or changed"]', 'a1 -.-> res', 'a2 -.-> res', 'd1 -.-> res'],
				highlight: ['res'],
				note: 'Most modules check first, then act. chrony already installed? The task says **`ok`** and does nothing. Missing? It installs it and says **`changed`**. Run the playbook ten times, the servers end up the same.'
			}
		]
	},
	example: {
		title: 'first-ansible-playbook/playbook.yml',
		repo: 'geerlingguy/ansible-for-devops',
		url: `${AFD}/first-ansible-playbook/playbook.yml#L1-L22`,
		lang: 'yaml',
		code: `---
- hosts: all
  become: yes

  tasks:
  - name: Ensure chrony (for time synchronization) is installed.
    dnf:
      name: chrony
      state: present

  - name: Ensure chrony is running.
    service:
      name: chronyd
      state: started
      enabled: yes

# The same as the above play, but in super-compact form!
- hosts: all
  become: yes
  tasks:
  - dnf: name=chrony state=present
  - service: name=chronyd state=started enabled=yes`,
		notes: [
			'Read the task names: **"Ensure ... is installed"**, not "install". You describe the end state. The `dnf` module decides if there is work to do.',
			'`become: yes` is your `sudo`. Ansible logs in as your user, then escalates to root for the tasks.',
			'The second play is the same thing in `key=value` form. That is also the syntax of an **ad-hoc command**: `ansible all -m ansible.builtin.dnf -a "name=chrony state=present" --become` runs one module once, without a playbook.',
			'Not every module can check first. The `command` module runs any command, so Ansible cannot know what it did. The [Node.js playbook](https://github.com/geerlingguy/ansible-for-devops/blob/86e1bf80098239cd995d54217585e8d61117d2e7/nodejs/provisioning/playbook.yml#L40-L47) in the same repo adds idempotency by hand: `changed_when: false` on the check, and `when:` so the app only starts if it is not running yet.'
		]
	},
	tradeoff: {
		gain: [
			'Your runbook becomes a file in Git: reviewed, versioned, and the same on every server.',
			'Safe to re-run. A half-finished run is fixed by running it again.',
			'Agentless: SSH and the keys you already have. Nothing new to install or patch on the servers.'
		],
		cost: [
			'It only manages what you wrote down. Remove a task and the package stays installed. You need an explicit `state: absent` to undo.',
			'`command` and `shell` tasks are not idempotent by default. You have to add `creates`, `changed_when` or `when` yourself.',
			'SSH to many hosts is slower than an agent. By default Ansible works on five hosts at a time (change it with `-f`).'
		]
	},
	task: {
		prompt: 'Your runbook for a new web server says: install nginx, make sure it starts at boot, and put a `/etc/motd` saying "Managed by Ansible". Write the playbook for the `web` group. Then say what the second run should print.',
		hint: 'Three tasks, three modules: one for the package, one for the service, one to put a file in place. Name each task as an end state.',
		answer: [
			'`- hosts: web` with `become: yes`.',
			'Task 1: `ansible.builtin.package` (or `dnf`/`apt`) with `name: nginx` and `state: present`.',
			'Task 2: `ansible.builtin.service` with `name: nginx`, `state: started`, `enabled: yes`.',
			'Task 3: `ansible.builtin.copy` with `content: "Managed by Ansible\\n"` and `dest: /etc/motd`.',
			'Try it first with `ansible-playbook site.yml --check`. The second real run should show every task as **`ok`** and `changed=0`. If one says `changed` every time, it is not idempotent.'
		]
	},
	quiz: [
		{
			q: 'You run the same playbook twice on a server. The first run set everything up. What should the second run report?',
			options: [
				'Every task `changed`, because every task ran again',
				'Every task `ok`, with `changed=0`',
				'A failure, because the packages already exist',
				'Nothing: Ansible skips hosts it has already configured'
			],
			answer: 1,
			why: 'Idempotent modules check the current state first and do nothing when it already matches. The tasks still run, they just find no work.'
		},
		{
			q: 'You type `ansible web -a "uptime"` without `-m`. Which module runs?',
			options: [
				'`ansible.builtin.shell`',
				'`ansible.builtin.command`',
				'`ansible.builtin.raw`',
				'`ansible.builtin.ping`'
			],
			answer: 1,
			why: 'The default module of the `ansible` command is `command`. It does not go through a shell, so pipes and redirects need `-m ansible.builtin.shell`.'
		},
		{
			q: 'You run `ansible-playbook site.yml --check`. One task is `ansible.builtin.command: /opt/app/migrate.sh` with no `creates` or `removes`. What happens to the script?',
			options: [
				'It runs, because check mode only applies to modules that manage files and packages',
				'It does not run: Ansible cannot predict what an arbitrary command would do, so the task is skipped',
				'It runs twice, once to check what would change and once to apply the change',
				'The whole playbook refuses to start in check mode while a command task is in it'
			],
			answer: 1,
			why: 'The `command` module supports check mode only partially. Without `creates` or `removes` it cannot tell what would change, so in check mode it does nothing.'
		}
	],
	takeaway: 'Ansible is your runbook as a file: an inventory of servers, and tasks that describe the end state. Write tasks that say "ensure", and the second run should change nothing.',
	sources: [
		{ title: 'Ansible docs, Introduction to playbooks', url: 'https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_intro.html' },
		{ title: 'Ansible docs, How to build your inventory', url: 'https://docs.ansible.com/ansible/latest/inventory_guide/intro_inventory.html' },
		{ title: 'Ansible docs, Introduction to ad hoc commands', url: 'https://docs.ansible.com/ansible/latest/command_guide/intro_adhoc.html' },
		{ title: 'Ansible docs, Check mode and diff mode', url: 'https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_checkmode.html' },
		{ title: 'Ansible for DevOps, example playbooks', url: `${AFD}/README.md` }
	]
};
