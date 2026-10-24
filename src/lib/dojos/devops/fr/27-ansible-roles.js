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
		'Un **rôle** règle les deux problèmes. C’est un dossier avec une structure fixe : tâches, defaults, templates et handlers. Tu l’écris une fois, tu lui donnes des variables avec des valeurs par défaut, et tu le réutilises dans chaque projet.'
	],
	terms: [
		{ term: 'Rôle', def: 'Un dossier avec une structure connue (`tasks/`, `handlers/`, `defaults/`, `vars/`, `templates/`, `files/`, `meta/`). Ansible charge chaque `main.yml` pour toi.' },
		{ term: 'Defaults du rôle', def: '`defaults/main.yml` : les variables que l’utilisateur du rôle est censé changer, à la priorité la plus basse. Presque n’importe quelle autre variable les écrase.' },
		{ term: 'Template', def: 'Un fichier Jinja2 (`.j2`) où Ansible remplace `{{ nginx_worker_processes }}` par la valeur de chaque hôte. Le module `template` le génère sur le serveur.' },
		{ term: 'Handler', def: 'Une tâche qui ne tourne que si une autre tâche la **notifie** et répond `changed`. Usage typique : recharger un service après un changement de sa config.' }
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
				note: 'Le playbook se réduit à une liste de rôles. Le rôle contient les tâches et ses **defaults**, les valeurs que l’utilisateur est censé changer.'
			},
			{
				add: [
					'tpl["templates/nginx.conf.j2"]',
					'role --> tpl',
					't -->|module template| conf["/etc/nginx/nginx.conf"]'
				],
				highlight: ['tpl', 'conf'],
				note: 'Tu n’édites plus `nginx.conf` à la main. Le fichier est un **template** : le même texte pour chaque serveur, avec les variables remplies par hôte.'
			},
			{
				add: ['h["handlers/main.yml : reload nginx"]', 'role --> h', 'conf -.->|notify, seulement si changé| h'],
				highlight: ['h'],
				note: 'La tâche template **notifie** le handler. Le reload n’a lieu que si le fichier a vraiment changé, et une seule fois, après les tâches du play, quel que soit le nombre de tâches qui l’ont notifié.'
			},
			{
				add: ['gv["group_vars et host_vars"] -->|écrasent| d', 'ev["extra vars -e : gagnent toujours"] -->|écrasent| d'],
				highlight: ['gv', 'ev'],
				note: 'La priorité, en version légère : les defaults du rôle perdent face aux `group_vars` et `host_vars` de l’inventaire, et `-e` en ligne de commande bat tout. La doc d’Ansible conseille de **définir chaque variable à un seul endroit**.'
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
			'Ligne 8, `validate: nginx -t -c %s` lance `nginx -t` sur une copie temporaire **avant** de remplacer le vrai fichier. Un template cassé fait échouer la tâche, et l’ancienne config reste en place.',
			'Lignes 9 et 10, `notify: reload nginx` pointe vers le [handler](https://github.com/geerlingguy/ansible-role-nginx/blob/5ff0b235006390a0d5666fd4cce7477410982cdf/handlers/main.yml#L9-L11). C’est un reload, pas un restart : pas de connexions coupées pour un changement de config.',
			'Les lignes 3, 4, 6, 14 et 15 lisent des variables entre `{{ }}`. Leurs valeurs par défaut sont dans [`defaults/main.yml`](https://github.com/geerlingguy/ansible-role-nginx/blob/5ff0b235006390a0d5666fd4cce7477410982cdf/defaults/main.yml#L18-L22) : `nginx_service_state: started`, `nginx_conf_template: "nginx.conf.j2"`. Écrase-les dans tes `group_vars`, jamais en modifiant le rôle.',
			'Le même rôle installe nginx sur Debian, Red Hat, Arch et d’autres : [`tasks/main.yml`](https://github.com/geerlingguy/ansible-role-nginx/blob/5ff0b235006390a0d5666fd4cce7477410982cdf/tasks/main.yml#L11-L31) choisit un fichier d’installation selon les facts de l’OS. Quand tu réutilises le rôle, tu n’écris pas cette gestion des OS toi-même.'
		]
	},
	tradeoff: {
		gain: [
			'Un seul rôle nginx sert tous les projets : tu écris et testes une correction à un seul endroit.',
			'Les handlers redémarrent ou rechargent un service seulement quand sa config a vraiment changé.',
			'Vault garde les secrets dans le même repo que le code, chiffrés, donc un clone tout neuf peut quand même déployer.'
		],
		cost: [
			'Les variables peuvent venir de plus de vingt endroits. Deux personnes qui posent la même variable à deux endroits vont perdre un après-midi sur la priorité.',
			'Les handlers tournent à la fin du play. Si une tâche suivante a besoin du service rechargé, il faut ajouter `meta: flush_handlers`.',
			'Toute personne qui a le mot de passe du vault peut lire tous les secrets qu’il protège. Le changer veut dire `ansible-vault rekey` sur chaque fichier chiffré. Une valeur chiffrée seule ne peut pas passer par `rekey` : tu la chiffres à nouveau.'
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
			'`site.yml` ne contient plus que `- hosts: web`, `become: yes`, `roles: [web]`. Deuxième exécution : aucun changement, aucun reload.'
		],
		steps: [
			{
				title: 'Pose les dossiers',
				questions: [
					{ q: 'Où vont les tâches paquet, service et motd ?', options: ['`roles/web/handlers/main.yml`', '`roles/web/tasks/main.yml`', '`roles/web/defaults/main.yml`', '`roles/web/meta/main.yml`'], answer: 1, why: '`tasks/` contient le travail du rôle. Ansible charge son `main.yml` pour toi.' },
					{ q: 'Quel fichier Ansible charge-t-il dans chaque dossier du rôle ?', options: ['Tous les fichiers `.yml` du dossier', '`role.yml`', '`main.yml`', '`index.yml`'], answer: 2, why: 'La structure est fixe : Ansible cherche `main.yml` dans chaque dossier.' },
					{ q: 'Que reste-t-il dans `site.yml` ?', options: ['`- hosts: web`, `become: yes`, `roles: [web]`', 'Toutes les tâches, plus `roles: [web]`', 'Seulement le handler', 'Seulement les variables'], answer: 0, why: 'Le playbook se réduit à une liste de rôles.' },
					{ q: 'Un deuxième projet a besoin du même serveur web. Pourquoi un rôle et pas une copie du playbook ?', options: ['Ansible refuse de lancer deux copies d’un playbook', 'Un rôle tourne plus vite qu’un playbook', 'Les copies demandent leur propre inventaire', 'Les copies divergent, et un rôle s’écrit une fois et se réutilise'], answer: 3, why: 'Un seul rôle sert tous les projets, donc une correction s’écrit et se teste à un seul endroit.' }
				]
			},
			{
				title: 'Fais du motd une variable',
				questions: [
					{ q: 'Où va `web_motd: "Managed by Ansible"` ?', options: ['`roles/web/vars/main.yml`', '`roles/web/tasks/main.yml`', '`roles/web/defaults/main.yml`', '`roles/web/templates/motd.j2`'], answer: 2, why: '`defaults/` contient les valeurs que les utilisateurs sont censés changer, à la priorité la plus basse.' },
					{ q: 'Comment la tâche motd lit-elle la variable ?', options: ['`content: "{{ web_motd }}"`', '`content: "$web_motd"`', '`content: web_motd`', '`vars: web_motd`'], answer: 0, why: 'Ansible remplace `{{ }}` par la valeur de chaque hôte.' },
					{ q: 'Pourquoi ne pas mettre `web_motd` dans `vars/main.yml` ?', options: ['`vars/` n’accepte que des nombres', 'Les `vars` du rôle l’emportent sur l’inventaire, donc les utilisateurs ne pourraient pas l’écraser facilement', 'Ansible ne charge pas `vars/`', '`vars/` est réservé aux secrets'], answer: 1, why: 'Tu veux l’inverse : une valeur que `group_vars` et `host_vars` peuvent écraser.' },
					{ q: 'Un projet veut un autre motd. Où le règle-t-il ?', options: ['En modifiant `roles/web/defaults/main.yml`', 'Dans une tâche `set_fact` du rôle', 'Dans `meta/main.yml`', 'Dans ses propres `group_vars`'], answer: 3, why: 'Écrase les defaults depuis l’inventaire, jamais en modifiant le rôle.' }
				]
			},
			{
				title: 'Passe la config en template',
				questions: [
					{ q: 'Où vit la config nginx ?', options: ['`roles/web/templates/site.conf.j2`', '`roles/web/files/nginx.conf`, modifié à la main sur chaque serveur', '`roles/web/defaults/site.conf`', 'Dans `site.yml`, en une longue chaîne'], answer: 0, why: 'Un template, c’est le même texte pour chaque serveur, avec les variables remplies par hôte.' },
					{ q: 'Quel module la pose sur le serveur ?', options: ['`ansible.builtin.copy`', '`ansible.builtin.command`', '`ansible.builtin.service`', '`ansible.builtin.template`'], answer: 3, why: 'Le module `template` génère le fichier Jinja2 sur le serveur.' },
					{ q: 'Quelle ligne de la tâche template demande un reload ?', options: ['`state: reloaded`', '`notify: reload nginx`', '`handler: true`', '`when: changed`'], answer: 1, why: '`notify` désigne le handler par son nom. Il ne part que si la tâche répond `changed`.' },
					{ q: 'Dans le rôle nginx de geerlingguy, quelle ligne empêche une config cassée de remplacer la bonne ?', options: ['`mode: 0644`', '`owner: root`', '`validate: nginx -t -c %s`', '`enabled: yes`'], answer: 2, why: '`validate` lance `nginx -t` sur une copie temporaire avant de remplacer le vrai fichier.' }
				]
			},
			{
				title: 'Recharge seulement sur changement',
				questions: [
					{ q: 'Où va le handler ?', options: ['`roles/web/tasks/main.yml`, en dernière tâche', '`roles/web/handlers/main.yml`', '`roles/web/defaults/main.yml`', '`site.yml`, sous `post_tasks`'], answer: 1, why: '`handlers/` contient les tâches qui ne tournent que si on les notifie.' },
					{ q: 'Que fait le handler `reload nginx` ?', options: ['`ansible.builtin.service: name=nginx state=reloaded`', '`ansible.builtin.service: name=nginx state=restarted`', '`ansible.builtin.command: nginx -s stop`', '`ansible.builtin.package: name=nginx state=latest`'], answer: 0, why: 'Un reload prend la nouvelle config sans couper de connexions.' },
					{ q: 'Tu relances le rôle et rien n’a changé. Que se passe-t-il ?', options: ['nginx recharge, comme à chaque exécution', 'Le handler tourne mais répond `ok`', 'Le rôle est sauté', 'Aucun changement, et aucun reload'], answer: 3, why: 'La tâche template répond `ok`, donc rien ne notifie le handler.' },
					{ q: 'Le template et deux autres tâches notifient tous `reload nginx`. Combien de reloads ?', options: ['Trois, un après chaque tâche', 'Aucun, sauf si tu ajoutes `meta: flush_handlers`', 'Un, après les tâches du play', 'Un par tâche qui a répondu `ok`'], answer: 2, why: 'Un handler tourne une seule fois, quel que soit le nombre de tâches qui le notifient.' }
				]
			}
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
				'Le fichier est retiré de l’historique Git et stocké seulement sur le nœud de contrôle, hors du repo',
				'Le fichier est chiffré (AES256) pour que tu puisses le committer, et Ansible le déchiffre à l’exécution avec le mot de passe',
				'Les valeurs sont envoyées sur un serveur HashiCorp Vault, et le fichier ne garde que des références',
				'Les valeurs sont masquées dans les logs à l’exécution, mais restent lisibles en clair dans le fichier'
			],
			answer: 1,
			why: 'Ansible Vault chiffre un fichier ou une valeur. Le texte chiffré vit dans ton repo, et tu passes le mot de passe avec `--ask-vault-pass` ou `--vault-password-file` à l’exécution.'
		}
	],
	lab: {
		minutes: 25,
		goal: 'Transformer le playbook web en rôle `web` et voir le handler recharger nginx seulement quand sa config change.',
		steps: [
			'Pars du lab du jour 26 : le virtualenv dans `~/ansible-lab`, le conteneur `web1` avec Python, et `hosts.ini`. Refais ces étapes si tu as tout nettoyé.',
			'Crée la structure avec `ansible-galaxy role init roles/web`. Dans `defaults/main.yml`, mets `web_motd: "Managed by Ansible"` et `web_port: 8080`.',
			'Écris `templates/site.conf.j2` : `server { listen {{ web_port }}; return 200 "{{ web_motd }}\\n"; }`. Dans `tasks/main.yml` : la tâche paquet, une tâche `template` vers `/etc/nginx/conf.d/site.conf` avec `notify: reload nginx`, la tâche service, et la tâche motd avec `content: "{{ web_motd }}\\n"`. Dans `handlers/main.yml` : `reload nginx` avec `state: reloaded`.',
			'Écris `web.yml` avec `- hosts: web`, `become: yes`, `roles: [web]`. Lance `ansible-playbook -i hosts.ini web.yml` deux fois.',
			'Écrase la valeur par défaut côté inventaire : `mkdir -p group_vars && printf \'web_motd: "Hello from group_vars"\\n\' > group_vars/web.yml`, puis relance le playbook.'
		],
		done: [
			'La première exécution affiche `RUNNING HANDLER [web : reload nginx]`. La deuxième n’affiche aucune ligne de handler, et `changed=0`.',
			'Après l’exécution avec `group_vars`, le handler tourne encore une fois et `docker exec web1 cat /etc/motd` affiche `Hello from group_vars`.',
			'`roles/web/defaults/main.yml` dit toujours `Managed by Ansible` : tu as changé la valeur sans modifier le rôle.'
		],
		solution: [
			'Tâche template : `ansible.builtin.template:` avec `src: site.conf.j2` et `dest: /etc/nginx/conf.d/site.conf`, puis `notify: reload nginx` au niveau de la tâche.',
			'Handler : `- name: reload nginx` puis `ansible.builtin.service:` avec `name: nginx` et `state: reloaded`. Le nom doit correspondre exactement au texte du `notify`.',
			'Lance une fois avec `-e web_motd=cli` : les extra vars battent `group_vars`, qui battent les defaults du rôle.'
		]
	},
	recall: {
		q: 'Dans un rôle, quel fichier contient les valeurs que l’utilisateur écrase depuis son inventaire, et lequel contient le reload qui ne tourne qu’après un changement de config ?',
		a: '`defaults/main.yml` contient les valeurs, à la priorité la plus basse, donc les `group_vars` les écrasent. `handlers/main.yml` contient `reload nginx`, qui tourne une fois après les tâches du play, et seulement si une tâche qui l’a notifié a répondu `changed`.'
	},
	sources: [
		{ title: 'Doc Ansible, Roles', url: 'https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_reuse_roles.html' },
		{ title: 'Doc Ansible, Handlers : agir sur changement', url: 'https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_handlers.html' },
		{ title: 'Doc Ansible, Utiliser les variables (priorité)', url: 'https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_variables.html' },
		{ title: 'Doc Ansible, Chiffrer du contenu avec Ansible Vault', url: 'https://docs.ansible.com/ansible/latest/vault_guide/vault_encrypting_content.html' },
		{ title: 'geerlingguy/ansible-role-nginx', url: `${NGINX}/README.md` }
	]
};
