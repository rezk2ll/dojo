const NGINX = 'https://github.com/geerlingguy/ansible-role-nginx/blob/5ff0b235006390a0d5666fd4cce7477410982cdf';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'ansible-roles',
	part: 'L’infrastructure as code',
	title: 'Les rôles Ansible : un dossier par métier',
	minutes: 10,
	hook: [
		'Ton playbook fait maintenant 400 lignes. nginx, PostgreSQL, utilisateurs, pare-feu, tout dans un fichier. Un deuxième projet a besoin de la partie nginx, alors tu la copies. Un mois plus tard, les deux copies ont divergé.',
		'Pire : tu modifies `nginx.conf` dans le playbook et nginx doit être rechargé. Tu ajoutes une tâche « reload nginx » à la fin, et maintenant il recharge à **chaque** exécution, même quand rien n’a changé.',
		'Un **rôle** règle les deux. C’est un dossier avec une structure fixe : tâches, defaults, templates, handlers. Tu l’écris une fois, tu lui donnes des réglages, et tu le réutilises partout.'
	],
	terms: [
		{ term: 'Rôle', def: 'Un dossier avec une structure connue (`tasks/`, `handlers/`, `defaults/`, `vars/`, `templates/`, `files/`, `meta/`). Ansible charge chaque `main.yml` pour toi.' },
		{ term: 'Defaults du rôle', def: '`defaults/main.yml` : les réglages du rôle, à la priorité la plus basse. Presque n’importe quelle autre variable les écrase.' },
		{ term: 'Template', def: 'Un fichier Jinja2 (`.j2`) où `{{ nginx_worker_processes }}` devient une valeur. Le module `template` le génère sur le serveur.' },
		{ term: 'Handler', def: 'Une tâche qui ne tourne que si une autre tâche la **notifie** et répond `changed`. Usage typique : recharger un service après un changement de sa config.' },
		{ term: 'Ansible Vault', def: 'Chiffre un fichier de variables ou une valeur seule, pour que les secrets puissent vivre dans Git. Ansible les déchiffre à l’exécution avec le mot de passe du vault.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: [
					'pb["site.yml : roles: nginx"] --> role["roles/nginx"]',
					'role --> t["tasks/main.yml"]',
					'role --> d["defaults/main.yml"]'
				],
				highlight: ['role', 't', 'd'],
				note: 'Le playbook se réduit à une liste de rôles. Le rôle contient les **tâches** et ses **defaults**, les valeurs que l’utilisateur est censé changer.'
			},
			{
				add: [
					'tpl["templates/nginx.conf.j2"]',
					'role --> tpl',
					't -->|module template| conf["/etc/nginx/nginx.conf"]'
				],
				highlight: ['tpl', 'conf'],
				note: 'Fini d’éditer `nginx.conf` à la main. Le fichier est un **template** : le même texte pour chaque serveur, avec les variables remplies par hôte.'
			},
			{
				add: ['h["handlers/main.yml : reload nginx"]', 'role --> h', 'conf -.->|notify, seulement si changé| h'],
				highlight: ['h'],
				note: 'La tâche template **notifie** le handler. Le reload n’a lieu que si le fichier a vraiment changé, et une seule fois, après les tâches du play, quel que soit le nombre de tâches qui l’ont notifié.'
			},
			{
				add: ['gv["group_vars et host_vars"] -->|écrasent| d', 'ev["extra vars -e : gagnent toujours"] -->|écrasent| d'],
				highlight: ['gv', 'ev'],
				note: 'La priorité, en version légère : les defaults du rôle perdent face aux `group_vars` et `host_vars` de l’inventaire, et `-e` en ligne de commande bat tout. Le conseil d’Ansible lui-même : **définis chaque variable à un seul endroit**.'
			},
			{
				add: ['vault["group_vars/prod/vault.yml, chiffré"] -.->|déchiffré à l’exécution| t'],
				highlight: ['vault'],
				note: 'Les secrets vont dans un fichier chiffré avec `ansible-vault encrypt`. Tu peux le committer sans risque. Lance avec `--ask-vault-pass` (ou `--vault-password-file`) et Ansible le déchiffre en mémoire.'
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
			'`validate: nginx -t -c %s` lance `nginx -t` sur une copie temporaire **avant** de remplacer le vrai fichier. Un template cassé fait échouer la tâche, et l’ancienne config reste en place.',
			'`notify: reload nginx` pointe vers le [handler](https://github.com/geerlingguy/ansible-role-nginx/blob/5ff0b235006390a0d5666fd4cce7477410982cdf/handlers/main.yml#L9-L11). C’est un reload, pas un restart : pas de connexions coupées pour un changement de config.',
			'Chaque valeur entre `{{ }}` est un réglage. Les valeurs par défaut sont dans [`defaults/main.yml`](https://github.com/geerlingguy/ansible-role-nginx/blob/5ff0b235006390a0d5666fd4cce7477410982cdf/defaults/main.yml#L18-L22) : `nginx_service_state: started`, `nginx_conf_template: "nginx.conf.j2"`. Écrase-les dans tes `group_vars`, jamais en modifiant le rôle.',
			'Le même rôle installe nginx sur Debian, Red Hat, Arch et d’autres : [`tasks/main.yml`](https://github.com/geerlingguy/ansible-role-nginx/blob/5ff0b235006390a0d5666fd4cce7477410982cdf/tasks/main.yml#L11-L31) choisit un fichier d’installation selon les facts de l’OS. Ce travail, tu l’as gratuitement en réutilisant un rôle.'
		]
	},
	tradeoff: {
		gain: [
			'Réutilisation : un seul rôle nginx pour tous les projets, testé une fois, amélioré à un seul endroit.',
			'Les handlers redémarrent ou rechargent un service seulement quand sa config a vraiment changé.',
			'Vault garde les secrets dans le même repo que le code, chiffrés, donc un clone tout neuf peut quand même déployer.'
		],
		cost: [
			'Les variables peuvent venir de plus de vingt endroits. Deux personnes qui posent la même variable à deux endroits vont perdre un après-midi sur la priorité.',
			'Les handlers tournent à la fin du play. Si une tâche suivante a besoin du service rechargé, il faut ajouter `meta: flush_handlers`.',
			'Un mot de passe de vault est un secret partagé. Qui l’a lit tous les secrets qu’il protège, et le changer veut dire `ansible-vault rekey` sur chaque fichier chiffré. Une valeur chiffrée seule ne peut pas passer par `rekey` : tu la chiffres à nouveau.'
		]
	},
	task: {
		prompt: 'Transforme le playbook de serveur web d’hier en un rôle appelé `web`. Le texte du motd doit être une variable avec une valeur par défaut. nginx ne doit recharger que quand sa config change. Esquisse les dossiers et les lignes clés.',
		hint: 'Quel dossier contient une valeur que les utilisateurs doivent pouvoir écraser facilement ? Quel dossier contient ce qui ne tourne que sur changement ?',
		answer: [
			'`roles/web/tasks/main.yml` : les tâches paquet, service et motd, plus une tâche `template` pour la config nginx.',
			'`roles/web/defaults/main.yml` : `web_motd: "Managed by Ansible"`. La tâche motd utilise `content: "{{ web_motd }}"`.',
			'`roles/web/templates/site.conf.j2` pour la config nginx, et la tâche template a `notify: reload nginx`.',
			'`roles/web/handlers/main.yml` : `- name: reload nginx` avec `ansible.builtin.service: name=nginx state=reloaded`.',
			'`site.yml` devient `- hosts: web`, `become: yes`, `roles: [web]`. Deuxième exécution : aucun changement, aucun reload.'
		]
	},
	quiz: [
		{
			q: 'Trois tâches d’un play modifient des fichiers de config et notifient toutes le handler `reload nginx`. Combien de fois nginx recharge-t-il ?',
			options: [
				'Trois fois, juste après chaque tâche',
				'Une fois, après l’exécution des tâches du play',
				'Jamais, sauf si tu ajoutes `meta: flush_handlers`',
				'Une fois par tâche qui a répondu `ok`'
			],
			answer: 1,
			why: 'Un handler tourne une seule fois, quel que soit le nombre de tâches qui le notifient. Par défaut les handlers notifiés tournent après la section des tâches du play.'
		},
		{
			q: 'Tu écris un rôle et tu veux que les utilisateurs changent facilement le port d’écoute depuis leur inventaire. Où mets-tu `web_port: 80` ?',
			options: [
				'`vars/main.yml`',
				'`defaults/main.yml`',
				'Dans une tâche `set_fact` de `tasks/main.yml`',
				'`meta/main.yml`'
			],
			answer: 1,
			why: 'Les defaults du rôle ont la priorité la plus basse, donc les `group_vars` et `host_vars` de l’inventaire les écrasent. Les `vars` du rôle et `set_fact` passent devant l’inventaire, l’inverse de ce que tu veux.'
		},
		{
			q: 'Que t’apporte `ansible-vault encrypt group_vars/prod/vault.yml` ?',
			options: [
				'Le fichier est retiré de l’historique Git et stocké sur le nœud de contrôle',
				'Le fichier est chiffré (AES256) pour que tu puisses le committer, et Ansible le déchiffre à l’exécution avec le mot de passe du vault',
				'Les valeurs sont envoyées sur un serveur HashiCorp Vault',
				'Les valeurs sont masquées dans les logs mais restent lisibles dans le fichier'
			],
			answer: 1,
			why: 'Ansible Vault chiffre un fichier ou une valeur. Le texte chiffré vit dans ton repo, et tu passes le mot de passe avec `--ask-vault-pass` ou `--vault-password-file` à l’exécution.'
		}
	],
	takeaway: 'Un rôle est un dossier à la forme fixe : les tâches font le travail, les defaults sont les réglages, les templates remplacent les fichiers édités à la main, les handlers ne réagissent qu’aux changements. Mets les secrets dans Vault, et chaque variable à un seul endroit.',
	sources: [
		{ title: 'Doc Ansible, Roles', url: 'https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_reuse_roles.html' },
		{ title: 'Doc Ansible, Handlers : agir sur changement', url: 'https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_handlers.html' },
		{ title: 'Doc Ansible, Utiliser les variables (priorité)', url: 'https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_variables.html' },
		{ title: 'Doc Ansible, Chiffrer du contenu avec Ansible Vault', url: 'https://docs.ansible.com/ansible/latest/vault_guide/vault_encrypting_content.html' },
		{ title: 'geerlingguy/ansible-role-nginx', url: `${NGINX}/README.md` }
	]
};
