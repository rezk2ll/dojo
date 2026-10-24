const NGINX = 'https://github.com/geerlingguy/ansible-role-nginx/blob/5ff0b235006390a0d5666fd4cce7477410982cdf';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'ansible-roles',
	part: 'Infrastructure as code',
	title: 'Ansible roles: one folder per job',
	minutes: 10,
	hook: [
		'Your playbook is now 400 lines. nginx, PostgreSQL, users, firewall, all in one file. A second project needs the nginx part, so you copy it. A month later the two copies are different.',
		'Worse, you edit `nginx.conf` in the playbook and nginx needs a reload. You add a "reload nginx" task at the end, and now it reloads on **every** run, even when nothing changed.',
		'A **role** solves both problems. It is a folder with a fixed layout of tasks, defaults, templates and handlers. You write it once, give it variables with default values, and reuse it in every project.'
	],
	terms: [
		{ term: 'Role', def: 'A folder with a known layout (`tasks/`, `handlers/`, `defaults/`, `vars/`, `templates/`, `files/`, `meta/`). Ansible loads each `main.yml` for you.' },
		{ term: 'Role defaults', def: '`defaults/main.yml`: the variables a user of the role is expected to change, at the lowest precedence. Almost any other variable overrides them.' },
		{ term: 'Template', def: 'A Jinja2 file (`.j2`) where Ansible replaces `{{ nginx_worker_processes }}` with the value for each host. The `template` module renders it onto the server.' },
		{ term: 'Handler', def: 'A task that runs only when another task **notifies** it and reports `changed`. Typical use: reload a service after its config changed.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: [
					'pb["site.yml: roles: nginx"] --> role["roles/nginx"]',
					'role --> t["tasks/main.yml"]',
					'role --> d["defaults/main.yml"]'
				],
				highlight: ['role', 't', 'd'],
				note: 'The playbook shrinks to a list of roles. The role holds the tasks and its **defaults**, the values a user is expected to change.'
			},
			{
				add: [
					'tpl["templates/nginx.conf.j2"]',
					'role --> tpl',
					't -->|template module| conf["/etc/nginx/nginx.conf"]'
				],
				highlight: ['tpl', 'conf'],
				note: 'You stop editing `nginx.conf` by hand. The file is a **template**: the same text for every server, with variables filled in per host.'
			},
			{
				add: ['h["handlers/main.yml: reload nginx"]', 'role --> h', 'conf -.->|notify, only if changed| h'],
				highlight: ['h'],
				note: 'The template task **notifies** the handler. The reload only happens if the file actually changed, and only once, after the tasks of the play, however many tasks notified it.'
			},
			{
				add: ['gv["group_vars and host_vars"] -->|override| d', 'ev["-e extra vars: always win"] -->|override| d'],
				highlight: ['gv', 'ev'],
				note: 'Precedence, the light version: role defaults lose to inventory `group_vars` and `host_vars`, and `-e` on the command line beats everything. The Ansible docs advise you to **define each variable in one place**.'
			},
			{
				add: ['vault["group_vars/prod/vault.yml, encrypted"] -.->|decrypted at run time| t'],
				highlight: ['vault'],
				note: 'Secrets go in a file encrypted with `ansible-vault encrypt`. It is safe to commit. Run with `--ask-vault-pass` (or `--vault-password-file`) and Ansible decrypts it in memory.'
			}
		]
	},
	example: {
		title: 'tasks/main.yml',
		repo: 'geerlingguy/ansible-role-nginx',
		url: `${NGINX}/tasks/main.yml#L37-L52`,
		lang: 'yaml',
		code: `- name: Copy nginx configuration in place.
  template:
    src: "{{ nginx_conf_template }}"
    dest: "{{ nginx_conf_file_path }}"
    owner: root
    group: "{{ root_group }}"
    mode: 0644
    validate: nginx -t -c %s
  notify:
    - reload nginx

- name: Ensure nginx service is running as configured.
  service:
    name: nginx
    state: "{{ nginx_service_state }}"
    enabled: "{{ nginx_service_enabled }}"`,
		notes: [
			'Line 8, `validate: nginx -t -c %s`, runs `nginx -t` on a temporary copy **before** the real file is replaced. A broken template fails the task, and the old config stays in place.',
			'Lines 9 and 10, `notify: reload nginx`, point at the [handler](https://github.com/geerlingguy/ansible-role-nginx/blob/5ff0b235006390a0d5666fd4cce7477410982cdf/handlers/main.yml#L9-L11). It is a reload, not a restart: no dropped connections for a config change.',
			'Lines 3, 4, 6, 14 and 15 read variables in `{{ }}`. Their defaults live in [`defaults/main.yml`](https://github.com/geerlingguy/ansible-role-nginx/blob/5ff0b235006390a0d5666fd4cce7477410982cdf/defaults/main.yml#L18-L22): `nginx_service_state: started`, `nginx_conf_template: "nginx.conf.j2"`. Override them in your `group_vars`, never by editing the role.',
			'The same role installs nginx on Debian, Red Hat, Arch and others: [`tasks/main.yml`](https://github.com/geerlingguy/ansible-role-nginx/blob/5ff0b235006390a0d5666fd4cce7477410982cdf/tasks/main.yml#L11-L31) picks a setup file from the OS facts. When you reuse the role, you do not write that OS handling yourself.'
		]
	},
	tradeoff: {
		gain: [
			'One nginx role serves every project, so a fix is written and tested in one place.',
			'Handlers restart or reload a service only when its config really changed.',
			'Vault keeps secrets in the same repo as the code, encrypted, so a fresh clone can still deploy.'
		],
		cost: [
			'Variables can come from more than twenty places. Two people setting the same variable in two places will lose an afternoon to precedence.',
			'Handlers run at the end of the play. If a later task needs the reloaded service, you must add `meta: flush_handlers`.',
			'Everyone who has the vault password can read every secret it protects. Rotating it means `ansible-vault rekey` on each encrypted file. Single encrypted values cannot be rekeyed: you encrypt them again.'
		]
	},
	task: {
		prompt: 'Turn yesterday\'s web server playbook into a role called `web`. The motd text should be a variable with a default. nginx must reload only when its config changes. Sketch the folders and the key lines.',
		hint: 'Which folder holds a value that users should override easily? Which folder holds the thing that runs only on change?',
		answer: [
			'`roles/web/tasks/main.yml`: the package, service and motd tasks, plus a `template` task for the nginx config.',
			'`roles/web/defaults/main.yml`: `web_motd: "Managed by Ansible"`. The motd task uses `content: "{{ web_motd }}"`.',
			'`roles/web/templates/site.conf.j2` for the nginx config, and the template task has `notify: reload nginx`.',
			'`roles/web/handlers/main.yml`: `- name: reload nginx` with `ansible.builtin.service: name=nginx state=reloaded`.',
			'`site.yml` now holds only `- hosts: web`, `become: yes`, `roles: [web]`. A second run: no change, no reload.'
		],
		steps: [
			{
				title: 'Lay out the folders',
				questions: [
					{ q: 'Where do the package, service and motd tasks go?', options: ['`roles/web/handlers/main.yml`', '`roles/web/tasks/main.yml`', '`roles/web/defaults/main.yml`', '`roles/web/meta/main.yml`'], answer: 1, why: '`tasks/` holds the work the role does. Ansible loads its `main.yml` for you.' },
					{ q: 'Which file does Ansible load from each role folder?', options: ['Every `.yml` file in it', '`role.yml`', '`main.yml`', '`index.yml`'], answer: 2, why: 'The layout is fixed: Ansible looks for `main.yml` in each folder.' },
					{ q: 'What is left in `site.yml`?', options: ['`- hosts: web`, `become: yes`, `roles: [web]`', 'All the tasks, plus `roles: [web]`', 'Only the handler', 'Only the variables'], answer: 0, why: 'The playbook shrinks to a list of roles.' },
					{ q: 'A second project needs the same web server. Why a role and not a copy of the playbook?', options: ['Ansible refuses to run two copies of a playbook', 'A role runs faster than a playbook', 'Copies need their own inventory', 'Copies drift apart, and a role is written once and reused'], answer: 3, why: 'One role serves every project, so a fix is written and tested in one place.' }
				]
			},
			{
				title: 'Make the motd a variable',
				questions: [
					{ q: 'One server in the `web` group needs a different motd from the rest of the group. Where do you set it?', options: ['In `roles/web/defaults/main.yml`, with an `if`', 'In a second copy of the role', 'In that server\'s `host_vars`', 'In `roles/web/handlers/main.yml`'], answer: 2, why: '`host_vars` set a value for one host and beat the role default. The role itself stays the same for everyone.' },
					{ q: 'How does the motd task read the variable?', options: ['`content: "{{ web_motd }}"`', '`content: "$web_motd"`', '`content: web_motd`', '`vars: web_motd`'], answer: 0, why: 'Ansible fills in `{{ }}` with the value for each host.' },
					{ q: 'Why not put `web_motd` in `vars/main.yml`?', options: ['`vars/` only takes numbers', 'Role `vars` win over inventory, so users could not override it easily', 'Ansible does not load `vars/`', '`vars/` is for secrets only'], answer: 1, why: 'You want the opposite: a value that `group_vars` and `host_vars` can beat.' },
					{ q: 'You run the play once with `-e web_motd="Maintenance tonight"`, and `group_vars` also sets `web_motd`. What do the servers show?', options: ['The `group_vars` value', 'The role default, "Managed by Ansible"', 'An error: the variable is set twice', '"Maintenance tonight": `-e` beats everything'], answer: 3, why: 'Extra vars on the command line always win. That is also why the docs advise you to define each variable in one place.' }
				]
			},
			{
				title: 'Template the config',
				questions: [
					{ q: 'Where does the nginx config live?', options: ['`roles/web/templates/site.conf.j2`', '`roles/web/files/nginx.conf`, edited by hand on each server', '`roles/web/defaults/site.conf`', 'In `site.yml`, as a long string'], answer: 0, why: 'A template is the same text for every server, with variables filled in per host.' },
					{ q: 'Which module puts it on the server?', options: ['`ansible.builtin.copy`', '`ansible.builtin.command`', '`ansible.builtin.service`', '`ansible.builtin.template`'], answer: 3, why: 'The `template` module renders the Jinja2 file onto the server.' },
					{ q: 'Which line on the template task asks for a reload?', options: ['`state: reloaded`', '`notify: reload nginx`', '`handler: true`', '`when: changed`'], answer: 1, why: '`notify` points at the handler by name. It fires only if the task reports `changed`.' },
					{ q: 'In the geerlingguy nginx role, which line stops a broken config from replacing the good one?', options: ['`mode: 0644`', '`owner: root`', '`validate: nginx -t -c %s`', '`enabled: yes`'], answer: 2, why: '`validate` runs `nginx -t` on a temporary copy before the real file is replaced.' }
				]
			},
			{
				title: 'Reload only on change',
				questions: [
					{ q: 'A later task in the same play checks the site and needs nginx already reloaded with the new config. What do you add before it?', options: ['A second `notify: reload nginx`', '`meta: flush_handlers`', '`state: restarted` on the template task', 'Nothing: handlers run right after the task that notifies them'], answer: 1, why: 'Handlers run at the end of the play. `meta: flush_handlers` runs the pending ones at that point.' },
					{ q: 'What does the `reload nginx` handler do?', options: ['`ansible.builtin.service: name=nginx state=reloaded`', '`ansible.builtin.service: name=nginx state=restarted`', '`ansible.builtin.command: nginx -s stop`', '`ansible.builtin.package: name=nginx state=latest`'], answer: 0, why: 'A reload picks up the new config with no dropped connections.' },
					{ q: 'Your template has a typo, and `validate: nginx -t -c %s` fails. Does nginx reload?', options: ['Yes, with the broken config', 'Yes, with the old config', 'Only after `meta: flush_handlers`', 'No: the task fails, the old file stays, and nothing reported `changed`'], answer: 3, why: 'The real file is replaced only after the check passes. A failed task does not notify the handler.' },
					{ q: 'You change only `web_motd` in `group_vars` and run the role again. Does nginx reload?', options: ['Yes, a role reloads nginx on every run', 'Yes, because a variable changed', 'No: only the template task notifies the handler, and the nginx config did not change', 'Only if you also run with `--check`'], answer: 2, why: 'The motd task reports `changed`, but it does not notify `reload nginx`. The template task reports `ok`.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Three tasks in a play change config files and all notify the `reload nginx` handler. How many times does nginx reload?',
			options: [
				'Three times, right after each task',
				'Once, after the tasks of the play have run',
				'Never, unless you add `meta: flush_handlers`',
				'Once per task that reported `ok`'
			],
			answer: 1,
			why: 'A handler runs once, however many tasks notify it. By default notified handlers run after the tasks section of the play.'
		},
		{
			q: 'You write a role and want users to change the listen port easily from their inventory. Where do you put `web_port: 80`?',
			options: [
				'`vars/main.yml`',
				'`defaults/main.yml`',
				'In a `set_fact` task in `tasks/main.yml`',
				'`meta/main.yml`'
			],
			answer: 1,
			why: 'Role defaults have the lowest precedence, so inventory `group_vars` and `host_vars` override them. Role `vars` and `set_fact` win over inventory, which is the opposite of what you want.'
		},
		{
			q: 'What does `ansible-vault encrypt group_vars/prod/vault.yml` give you?',
			options: [
				'The file is removed from Git history and stored only on the control node, outside the repo',
				'The file is encrypted (AES256) so you can commit it, and Ansible decrypts it at run time with the vault password',
				'The values are uploaded to a HashiCorp Vault server, and the file keeps only references to them',
				'The values are hidden in log output when tasks run, but stay readable as plain text in the file'
			],
			answer: 1,
			why: 'Ansible Vault is file or value encryption. The encrypted text lives in your repo, and you pass the password with `--ask-vault-pass` or `--vault-password-file` when you run.'
		}
	],
	lab: {
		minutes: 25,
		goal: 'Turn the web playbook into a `web` role and watch the handler reload nginx only when its config changes.',
		steps: [
			'Start from the day 26 lab: the virtualenv in `~/ansible-lab`, the `web1` container with Python, and `hosts.ini`. Redo those steps if you cleaned up.',
			'Create the layout with `ansible-galaxy role init roles/web`. In `defaults/main.yml` put `web_motd: "Managed by Ansible"` and `web_port: 8080`.',
			'Write `templates/site.conf.j2`: `server { listen {{ web_port }}; return 200 "{{ web_motd }}\\n"; }`. In `tasks/main.yml`: the package task, a `template` task to `/etc/nginx/conf.d/site.conf` with `notify: reload nginx`, the service task, and the motd task with `content: "{{ web_motd }}\\n"`. In `handlers/main.yml`: `reload nginx` with `state: reloaded`.',
			'Write `web.yml` with `- hosts: web`, `become: yes`, `roles: [web]`. Run `ansible-playbook -i hosts.ini web.yml` twice.',
			'Override the default from the inventory side: `mkdir -p group_vars && printf \'web_motd: "Hello from group_vars"\\n\' > group_vars/web.yml`, then run the playbook again.'
		],
		done: [
			'The first run prints `RUNNING HANDLER [web : reload nginx]`. The second run prints no handler line and `changed=0`.',
			'After the `group_vars` run, the handler runs once more and `docker exec web1 cat /etc/motd` prints `Hello from group_vars`.',
			'`roles/web/defaults/main.yml` still says `Managed by Ansible`: you changed the value without editing the role.'
		],
		solution: [
			'Template task: `ansible.builtin.template:` with `src: site.conf.j2` and `dest: /etc/nginx/conf.d/site.conf`, then `notify: reload nginx` at the task level.',
			'Handler: `- name: reload nginx` then `ansible.builtin.service:` with `name: nginx` and `state: reloaded`. The name must match the `notify` text exactly.',
			'Run once with `-e web_motd=cli`: extra vars beat `group_vars`, which beat the role defaults.'
		]
	},
	recall: {
		q: 'In a role, which file holds the values users override from their inventory, and which one holds the reload that runs only after a config change?',
		a: '`defaults/main.yml` holds the values at the lowest precedence, so `group_vars` override them. `handlers/main.yml` holds `reload nginx`, which runs once after the play\'s tasks, and only if a task that notified it reported `changed`.'
	},
	sources: [
		{ title: 'Ansible docs, Roles', url: 'https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_reuse_roles.html' },
		{ title: 'Ansible docs, Handlers: running operations on change', url: 'https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_handlers.html' },
		{ title: 'Ansible docs, Using variables (precedence)', url: 'https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_variables.html' },
		{ title: 'Ansible docs, Encrypting content with Ansible Vault', url: 'https://docs.ansible.com/ansible/latest/vault_guide/vault_encrypting_content.html' },
		{ title: 'geerlingguy/ansible-role-nginx', url: `${NGINX}/README.md` }
	]
};
