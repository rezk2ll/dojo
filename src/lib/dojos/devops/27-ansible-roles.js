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
		'A **role** is the fix for both. It is a folder with a fixed layout: tasks, defaults, templates, handlers. You write it once, give it knobs, and reuse it everywhere.'
	],
	terms: [
		{ term: 'Role', def: 'A folder with a known layout (`tasks/`, `handlers/`, `defaults/`, `vars/`, `templates/`, `files/`, `meta/`). Ansible loads each `main.yml` for you.' },
		{ term: 'Role defaults', def: '`defaults/main.yml`: the knobs of the role, at the lowest precedence. Almost any other variable overrides them.' },
		{ term: 'Template', def: 'A Jinja2 file (`.j2`) where `{{ nginx_worker_processes }}` becomes a value. The `template` module renders it onto the server.' },
		{ term: 'Handler', def: 'A task that runs only when another task **notifies** it and reports `changed`. Typical use: reload a service after its config changed.' },
		{ term: 'Ansible Vault', def: 'Encrypts a variables file or a single value, so secrets can live in Git. Ansible decrypts them at run time with the vault password.' }
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
				note: 'The playbook shrinks to a list of roles. The role holds the **tasks** and its **defaults**, the values a user is expected to change.'
			},
			{
				add: [
					'tpl["templates/nginx.conf.j2"]',
					'role --> tpl',
					't -->|template module| conf["/etc/nginx/nginx.conf"]'
				],
				highlight: ['tpl', 'conf'],
				note: 'No more editing `nginx.conf` by hand. The file is a **template**: the same text for every server, with variables filled in per host.'
			},
			{
				add: ['h["handlers/main.yml: reload nginx"]', 'role --> h', 'conf -.->|notify, only if changed| h'],
				highlight: ['h'],
				note: 'The template task **notifies** the handler. The reload only happens if the file actually changed, and only once, after the tasks of the play, however many tasks notified it.'
			},
			{
				add: ['gv["group_vars and host_vars"] -->|override| d', 'ev["-e extra vars: always win"] -->|override| d'],
				highlight: ['gv', 'ev'],
				note: 'Precedence, the light version: role defaults lose to inventory `group_vars` and `host_vars`, and `-e` on the command line beats everything. Ansible\'s own advice: **define each variable in one place**.'
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
			'`validate: nginx -t -c %s` runs `nginx -t` on a temporary copy **before** the real file is replaced. A broken template fails the task, and the old config stays in place.',
			'`notify: reload nginx` points at the [handler](https://github.com/geerlingguy/ansible-role-nginx/blob/5ff0b235006390a0d5666fd4cce7477410982cdf/handlers/main.yml#L9-L11). It is a reload, not a restart: no dropped connections for a config change.',
			'Every value in `{{ }}` is a knob. The defaults live in [`defaults/main.yml`](https://github.com/geerlingguy/ansible-role-nginx/blob/5ff0b235006390a0d5666fd4cce7477410982cdf/defaults/main.yml#L18-L22): `nginx_service_state: started`, `nginx_conf_template: "nginx.conf.j2"`. Override them in your `group_vars`, never by editing the role.',
			'The same role installs nginx on Debian, Red Hat, Arch and others: [`tasks/main.yml`](https://github.com/geerlingguy/ansible-role-nginx/blob/5ff0b235006390a0d5666fd4cce7477410982cdf/tasks/main.yml#L11-L31) picks a setup file from the OS facts. You get that work for free when you reuse a role.'
		]
	},
	tradeoff: {
		gain: [
			'Reuse: one nginx role for every project, tested once, improved in one place.',
			'Handlers restart or reload a service only when its config really changed.',
			'Vault keeps secrets in the same repo as the code, encrypted, so a fresh clone can still deploy.'
		],
		cost: [
			'Variables can come from more than twenty places. Two people setting the same variable in two places will lose an afternoon to precedence.',
			'Handlers run at the end of the play. If a later task needs the reloaded service, you must add `meta: flush_handlers`.',
			'A vault password is a shared secret. Anyone who has it reads every secret it protects, and rotating it means `ansible-vault rekey` on each encrypted file. Single encrypted values cannot be rekeyed: you encrypt them again.'
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
			'`site.yml` becomes `- hosts: web`, `become: yes`, `roles: [web]`. A second run: no change, no reload.'
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
	takeaway: 'A role is a folder with a fixed shape: tasks do the work, defaults are the knobs, templates replace hand-edited files, handlers react only to change. Put secrets in Vault, and each variable in one place.',
	sources: [
		{ title: 'Ansible docs, Roles', url: 'https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_reuse_roles.html' },
		{ title: 'Ansible docs, Handlers: running operations on change', url: 'https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_handlers.html' },
		{ title: 'Ansible docs, Using variables (precedence)', url: 'https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_variables.html' },
		{ title: 'Ansible docs, Encrypting content with Ansible Vault', url: 'https://docs.ansible.com/ansible/latest/vault_guide/vault_encrypting_content.html' },
		{ title: 'geerlingguy/ansible-role-nginx', url: `${NGINX}/README.md` }
	]
};
