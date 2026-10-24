const AFD = 'https://github.com/geerlingguy/ansible-for-devops/blob/86e1bf80098239cd995d54217585e8d61117d2e7';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'ansible',
	part: 'Infrastructure as code',
	title: 'Ansible: playbooks over SSH',
	minutes: 10,
	hook: [
		'You have twenty servers. A new one needs chrony installed and running. You ssh in, run `dnf install chrony`, `systemctl enable --now chronyd`, log out. Then the next one. Then the one you forgot.',
		'Your for-loop over ssh works until a server is half done, or already done, or different. The loop cannot tell, so it runs every command again.',
		'Ansible reads a file that says what each server should look like. It connects over SSH, checks each server, and changes only **what is not already right**. You install no agent on the servers.'
	],
	terms: [
		{ term: 'Inventory', def: 'The list of managed nodes, sorted into groups like `[app]` and `[db]`. Ansible always adds the groups `all` and `ungrouped`.' },
		{ term: 'Module', def: 'A small program that does one job, like `dnf`, `service` or `copy`. Ansible copies it to the managed node and runs it there.' },
		{ term: 'Playbook', def: 'A YAML file with one or more plays. A play maps a group of hosts to a list of tasks. Each task calls one module.' },
		{ term: 'Idempotent', def: 'Running it twice gives the same result as running it once. A good task reports `ok` when there is nothing to do.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['inv["inventory: hosts.ini"] --> cn["Control node: your laptop"]'],
				highlight: ['inv', 'cn'],
				note: 'The control node is the machine where you run Ansible, here your laptop. It reads the **inventory**, a file that lists the servers you used to keep in your head or in a wiki page.'
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
				note: 'Most modules check first, then act. chrony already installed? The task reports `ok` and does nothing. Missing? It installs chrony and reports **`changed`**. Run the playbook ten times and the servers end up in the same state.'
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
			'Lines 6 and 11 name each task as an end state: "Ensure ... is installed", not "install". The `dnf` module on line 7 decides if there is work to do.',
			'Line 3, `become: yes`, is your `sudo`. Ansible logs in as your user, then escalates to root for the tasks.',
			'Lines 18 to 22 repeat the play in `key=value` form. An **ad-hoc command** uses the same syntax: `ansible all -m ansible.builtin.dnf -a "name=chrony state=present" --become` runs one module once, without a playbook.',
			'Not every module can check first. The `command` module runs any command, so Ansible cannot know what it did. The [Node.js playbook](https://github.com/geerlingguy/ansible-for-devops/blob/86e1bf80098239cd995d54217585e8d61117d2e7/nodejs/provisioning/playbook.yml#L40-L47) in the same repo adds idempotency by hand: `changed_when: false` on the check, and `when:` so the app only starts if it is not running yet.'
		]
	},
	tradeoff: {
		gain: [
			'The runbook is a playbook file in Git, so it is reviewed, versioned, and the same on every server.',
			'When a run stops halfway, you run the playbook again. The tasks that already finished report `ok`.',
			'Ansible needs only SSH and the keys you already have. There is no agent to install or patch on the servers.'
		],
		cost: [
			'Ansible manages only what the playbook lists. If you remove a task, the package stays installed until a task sets `state: absent`.',
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
			'Try it first with `ansible-playbook site.yml --check`, a dry run that changes nothing. The second real run should show every task as **`ok`** and `changed=0`. A task that reports `changed` on every run is not idempotent.'
		],
		steps: [
			{
				title: 'Target the group',
				questions: [
					{ q: 'Which line starts the play?', options: ['`- hosts: all`', '`- group: web`', '`- hosts: web`', '`- inventory: web`'], answer: 2, why: 'A play maps a group of hosts to a list of tasks. `hosts: web` picks the group.' },
					{ q: 'Where does Ansible learn which servers are in `web`?', options: ['From the inventory', 'From the playbook itself', 'From an agent on each server', 'From the servers\' hostnames'], answer: 0, why: 'The inventory lists the managed nodes and sorts them into groups.' },
					{ q: 'Why add `become: yes`?', options: ['It makes the tasks run in parallel', 'It turns on check mode', 'It installs Ansible on the servers', 'Installing a package and writing `/etc/motd` need root'], answer: 3, why: '`become` is your `sudo`. Ansible logs in as your user, then escalates for the tasks.' },
					{ q: 'What do you install on the web servers before the first run?', options: ['The Ansible agent', 'Nothing: Ansible needs only SSH and your keys', 'nginx, so Ansible can manage it', 'A copy of the playbook'], answer: 1, why: 'Ansible connects over plain SSH. Nothing runs on the servers between runs.' }
				]
			},
			{
				title: 'Pick one module per line',
				questions: [
					{ q: 'Which task installs nginx?', options: ['`ansible.builtin.copy` with `dest: nginx`', '`ansible.builtin.service` with `state: present`', '`ansible.builtin.package` with `name: nginx` and `state: present`', '`ansible.builtin.command: nginx`'], answer: 2, why: 'The package module checks if nginx is there and installs it only if it is missing.' },
					{ q: 'Which task makes nginx start now and at boot?', options: ['`ansible.builtin.service` with `state: started` and `enabled: yes`', '`ansible.builtin.service` with `state: started` only', '`ansible.builtin.package` with `enabled: yes`', '`ansible.builtin.command: systemctl start nginx`'], answer: 0, why: '`started` covers now, `enabled` covers the next boot.' },
					{ q: 'Which task puts the motd in place?', options: ['`ansible.builtin.service` with `name: motd`', '`ansible.builtin.shell: echo Managed by Ansible > /etc/motd`', '`ansible.builtin.package` with `name: motd`', '`ansible.builtin.copy` with `content: "Managed by Ansible\\n"` and `dest: /etc/motd`'], answer: 3, why: '`copy` compares the file with the content and writes it only when they differ.' },
					{ q: 'Why not use `ansible.builtin.command: apt-get install -y nginx`?', options: ['`command` cannot run `apt-get`', '`command` cannot check first, so Ansible cannot know what it did', '`command` needs `become: no`', '`command` only works in ad-hoc mode'], answer: 1, why: '`command` runs any command and is not idempotent unless you add `creates`, `changed_when` or `when` yourself.' }
				]
			},
			{
				title: 'Name and order the tasks',
				questions: [
					{ q: 'How do you name the first task?', options: ['`Ensure nginx is installed.`', '`Install nginx`', '`Run apt-get`', '`nginx`'], answer: 0, why: 'Name each task as an end state. The module decides if there is work to do.' },
					{ q: 'In what order do the three tasks run?', options: ['All at once on each host', 'In random order, per host', 'Top to bottom, each task on every host before the next', 'Alphabetically, by task name'], answer: 2, why: 'The playbook runs top to bottom, one task across all hosts at a time.' },
					{ q: 'The package task fails on one web server. What happens to it?', options: ['The whole run stops on every host', 'Ansible retries it until it passes', 'The failure is ignored and the next task runs there', 'That host is dropped for the rest of the run'], answer: 3, why: 'The other hosts carry on. You fix the broken one and run the playbook again.' },
					{ q: 'You have twenty web servers. How many does Ansible work on at a time by default?', options: ['All twenty', 'Five, unless you change it with `-f`', 'One', 'Ten'], answer: 1, why: 'The default is five hosts at a time.' }
				]
			},
			{
				title: 'Predict the second run',
				questions: [
					{ q: 'What does `ansible-playbook site.yml --check` do?', options: ['A dry run that changes nothing', 'It checks the YAML syntax only', 'It runs the playbook twice', 'It installs the modules on the servers'], answer: 0, why: 'Check mode reports what would change without changing it.' },
					{ q: 'Between two runs, someone edits `/etc/motd` by hand on one web server. What does the next run report for that server?', options: ['Every task `changed`', 'A failure on the motd task', 'The motd task `changed`, the other two `ok`', 'Every task `ok`: Ansible keeps hand edits'], answer: 2, why: '`copy` compares the file with the content and writes it back because they differ. nginx is still installed and running, so those tasks find no work.' },
					{ q: 'Later you delete the motd task from the playbook and run it again. What happens to `/etc/motd`?', options: ['Ansible deletes it', 'Ansible restores the file the server had before', 'The run fails until you put the task back', 'It stays as it is: Ansible manages only what the playbook lists'], answer: 3, why: 'Removing a task does not undo it. To remove the file, a task has to say so, for example with `state: absent`.' },
					{ q: 'One task reports `changed` on every run. What does that tell you?', options: ['The server is broken', 'The task is not idempotent', 'Check mode is on', 'The inventory is wrong'], answer: 1, why: 'An idempotent task reports `ok` when there is nothing to do.' }
				]
			}
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
	lab: {
		minutes: 25,
		goal: 'Run the web server playbook against a container, see the second run report `changed=0`, then catch a hand edit with check mode.',
		steps: [
			'Install Ansible in a virtualenv: `python3 -m venv ~/ansible-lab/venv && ~/ansible-lab/venv/bin/pip install ansible`, then `cd ~/ansible-lab && source venv/bin/activate`.',
			'Start a throwaway server and give it Python: `docker run -d --name web1 debian:12 sleep infinity`, then `docker exec web1 sh -c \'apt-get update && apt-get install -y python3 python3-apt\'`.',
			'Write `hosts.ini` with a `[web]` group and one line: `web1 ansible_connection=community.docker.docker ansible_become=false`. Ansible reaches the container with `docker exec` instead of SSH, and you are already root inside.',
			'Write `site.yml` from the task, then run `ansible-playbook -i hosts.ini site.yml` twice.',
			'Edit the server by hand: `docker exec web1 sh -c \'echo hacked > /etc/motd\'`. Run `ansible-playbook -i hosts.ini site.yml --check --diff`, then the playbook for real.',
			'Once the checks below pass, clean up with `docker rm -f web1`.'
		],
		done: [
			'The first run\'s recap shows `changed=3`, the second `changed=0`.',
			'`docker exec web1 cat /etc/motd` prints `Managed by Ansible`.',
			'The `--check --diff` run prints `-hacked` and `+Managed by Ansible`, yet the file still says `hacked` until the real run.'
		],
		solution: [
			'`- hosts: web`, `become: yes`, then three tasks: `ansible.builtin.package` (`name: nginx`, `state: present`), `ansible.builtin.service` (`name: nginx`, `state: started`, `enabled: yes`), `ansible.builtin.copy` (`content: "Managed by Ansible\\n"`, `dest: /etc/motd`).',
			'`ansible_become=false` in the inventory wins over `become: yes` in the play. On a real server with SSH you would drop it.',
			'Try `--check` before the very first run: the service task fails with `Could not find the requested service nginx`, because check mode did not really install the package.'
		]
	},
	recall: {
		q: 'You run a playbook a second time on a server the first run already set up. What should every task report, and why?',
		a: 'Every task reports `ok` and the recap shows `changed=0`. Each module checks the current state first and finds nothing to change.'
	},
	sources: [
		{ title: 'Ansible docs, Introduction to playbooks', url: 'https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_intro.html' },
		{ title: 'Ansible docs, How to build your inventory', url: 'https://docs.ansible.com/ansible/latest/inventory_guide/intro_inventory.html' },
		{ title: 'Ansible docs, Introduction to ad hoc commands', url: 'https://docs.ansible.com/ansible/latest/command_guide/intro_adhoc.html' },
		{ title: 'Ansible docs, Check mode and diff mode', url: 'https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_checkmode.html' },
		{ title: 'Ansible for DevOps, example playbooks', url: `${AFD}/README.md` }
	]
};
