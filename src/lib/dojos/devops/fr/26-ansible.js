const AFD = 'https://github.com/geerlingguy/ansible-for-devops/blob/86e1bf80098239cd995d54217585e8d61117d2e7';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'ansible',
	part: 'L’infrastructure as code',
	title: 'Ansible : ton runbook, exécuté pour toi',
	minutes: 10,
	hook: [
		'Tu as vingt serveurs. Un nouveau doit avoir chrony installé et démarré. Tu te connectes en ssh, tu lances `dnf install chrony`, `systemctl enable --now chronyd`, tu te déconnectes. Puis le suivant. Puis celui que tu as oublié.',
		'Ta boucle for sur ssh marche, jusqu’au jour où un serveur est à moitié fait, ou déjà fait, ou différent. La boucle n’en sait rien. Elle relance juste les commandes.',
		'**Ansible** transforme cette boucle en un fichier qui dit à quoi chaque serveur doit ressembler. Il se connecte en SSH, vérifie, et ne change **que ce qui n’est pas déjà bon**. Aucun agent à installer sur les serveurs.'
	],
	terms: [
		{ term: 'Nœud de contrôle', def: 'La machine où tu lances Ansible : ton portable ou un runner de CI. Ansible n’est normalement pas installé sur les nœuds gérés.' },
		{ term: 'Inventaire', def: 'La liste des nœuds gérés, rangés en groupes comme `[app]` et `[db]`. Ansible ajoute toujours les groupes `all` et `ungrouped`.' },
		{ term: 'Module', def: 'Un petit programme qui fait un seul travail, comme `dnf`, `service` ou `copy`. Ansible le copie sur le nœud géré et l’exécute là-bas.' },
		{ term: 'Playbook', def: 'Un fichier YAML avec un ou plusieurs plays. Un play associe un groupe d’hôtes à une liste de tâches. Chaque tâche appelle un module.' },
		{ term: 'Idempotent', def: 'Le lancer deux fois donne le même résultat que le lancer une fois. Une bonne tâche répond `ok` quand il n’y a rien à faire.' },
		{ term: 'Check mode', def: '`--check` : un essai à blanc. Les modules qui le gèrent disent ce qu’ils changeraient, et ne changent rien.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['inv["inventaire : hosts.ini"] --> cn["Nœud de contrôle : ton portable"]'],
				highlight: ['inv', 'cn'],
				note: 'Tout part de l’**inventaire**. C’est la liste de serveurs que tu gardais en tête, ou dans une page de wiki, maintenant dans un fichier qu’Ansible lit.'
			},
			{
				add: [
					'subgraph app["groupe app"]',
					'a1["192.168.56.4"]',
					'a2["192.168.56.5"]',
					'end',
					'subgraph dbg["groupe db"]',
					'd1["192.168.56.6"]',
					'end',
					'cn -->|SSH| a1',
					'cn -->|SSH| a2',
					'cn -->|SSH| d1'
				],
				highlight: ['a1', 'a2', 'd1'],
				note: 'Ansible parle aux nœuds gérés en **SSH tout simple**, avec les clés que tu as déjà. Le type de connexion par défaut est `ssh`. Rien ne tourne sur les serveurs entre deux exécutions.'
			},
			{
				add: ['pb["playbook.yml : tâches dans l’ordre"] --> cn'],
				highlight: ['pb'],
				note: 'Le **playbook** s’exécute de haut en bas. Chaque tâche passe sur tous les hôtes du play avant que la suivante commence. Si une tâche échoue sur un hôte, cet hôte est écarté pour le reste de l’exécution.'
			},
			{
				add: ['res["Chaque tâche répond : ok ou changed"]', 'a1 -.-> res', 'a2 -.-> res', 'd1 -.-> res'],
				highlight: ['res'],
				note: 'La plupart des modules vérifient d’abord, puis agissent. chrony déjà installé ? La tâche répond **`ok`** et ne fait rien. Absent ? Elle l’installe et répond **`changed`**. Lance le playbook dix fois, les serveurs finissent identiques.'
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
			'Lis les noms des tâches : **« Ensure ... is installed »** (s’assurer que c’est installé), pas « install ». Tu décris l’état final. Le module `dnf` décide s’il y a du travail.',
			'`become: yes`, c’est ton `sudo`. Ansible se connecte avec ton utilisateur, puis passe root pour les tâches.',
			'Le second play fait la même chose en forme `key=value`. C’est aussi la syntaxe d’une **commande ad-hoc** : `ansible all -m ansible.builtin.dnf -a "name=chrony state=present" --become` lance un module une fois, sans playbook.',
			'Tous les modules ne savent pas vérifier d’abord. Le module `command` lance n’importe quelle commande, donc Ansible ne peut pas savoir ce qu’elle a fait. Le [playbook Node.js](https://github.com/geerlingguy/ansible-for-devops/blob/86e1bf80098239cd995d54217585e8d61117d2e7/nodejs/provisioning/playbook.yml#L40-L47) du même repo ajoute l’idempotence à la main : `changed_when: false` sur la vérification, et `when:` pour ne démarrer l’appli que si elle ne tourne pas déjà.'
		]
	},
	tradeoff: {
		gain: [
			'Ton runbook devient un fichier dans Git : relu, versionné, et identique sur chaque serveur.',
			'Sans risque à relancer. Une exécution interrompue se répare en la relançant.',
			'Sans agent : SSH et les clés que tu as déjà. Rien de nouveau à installer ou à patcher sur les serveurs.'
		],
		cost: [
			'Il ne gère que ce que tu as écrit. Supprime une tâche et le paquet reste installé. Il faut un `state: absent` explicite pour défaire.',
			'Les tâches `command` et `shell` ne sont pas idempotentes par défaut. À toi d’ajouter `creates`, `changed_when` ou `when`.',
			'SSH vers beaucoup d’hôtes est plus lent qu’un agent. Par défaut Ansible travaille sur cinq hôtes à la fois (change-le avec `-f`).'
		]
	},
	task: {
		prompt: 'Ton runbook pour un nouveau serveur web dit : installer nginx, s’assurer qu’il démarre au boot, et poser un `/etc/motd` qui dit « Managed by Ansible ». Écris le playbook pour le groupe `web`. Puis dis ce que la deuxième exécution doit afficher.',
		hint: 'Trois tâches, trois modules : un pour le paquet, un pour le service, un pour poser un fichier. Nomme chaque tâche comme un état final.',
		answer: [
			'`- hosts: web` avec `become: yes`.',
			'Tâche 1 : `ansible.builtin.package` (ou `dnf`/`apt`) avec `name: nginx` et `state: present`.',
			'Tâche 2 : `ansible.builtin.service` avec `name: nginx`, `state: started`, `enabled: yes`.',
			'Tâche 3 : `ansible.builtin.copy` avec `content: "Managed by Ansible\\n"` et `dest: /etc/motd`.',
			'Essaie d’abord avec `ansible-playbook site.yml --check`. La deuxième vraie exécution doit montrer chaque tâche en **`ok`** et `changed=0`. Si une tâche répond `changed` à chaque fois, elle n’est pas idempotente.'
		]
	},
	quiz: [
		{
			q: 'Tu lances deux fois le même playbook sur un serveur. La première exécution a tout installé. Que doit afficher la deuxième ?',
			options: [
				'Chaque tâche en `changed`, parce que chaque tâche a tourné à nouveau',
				'Chaque tâche en `ok`, avec `changed=0`',
				'Une erreur, parce que les paquets existent déjà',
				'Rien : Ansible saute les hôtes qu’il a déjà configurés'
			],
			answer: 1,
			why: 'Les modules idempotents vérifient d’abord l’état actuel et ne font rien s’il correspond déjà. Les tâches tournent quand même, elles ne trouvent juste rien à faire.'
		},
		{
			q: 'Tu tapes `ansible web -a "uptime"` sans `-m`. Quel module tourne ?',
			options: [
				'`ansible.builtin.shell`',
				'`ansible.builtin.command`',
				'`ansible.builtin.raw`',
				'`ansible.builtin.ping`'
			],
			answer: 1,
			why: 'Le module par défaut de la commande `ansible` est `command`. Il ne passe pas par un shell, donc les pipes et redirections demandent `-m ansible.builtin.shell`.'
		},
		{
			q: 'Tu lances `ansible-playbook site.yml --check`. Une tâche est `ansible.builtin.command: /opt/app/migrate.sh`, sans `creates` ni `removes`. Que devient le script ?',
			options: [
				'Il tourne, parce que le check mode ne concerne que les modules qui gèrent des fichiers et des paquets',
				'Il ne tourne pas : Ansible ne peut pas prévoir ce que ferait une commande quelconque, donc la tâche est sautée',
				'Il tourne deux fois, une pour vérifier ce qui changerait et une pour appliquer le changement',
				'Le playbook entier refuse de démarrer en check mode tant qu’il contient une tâche command'
			],
			answer: 1,
			why: 'Le module `command` ne gère le check mode que partiellement. Sans `creates` ni `removes`, il ne peut pas savoir ce qui changerait, donc en check mode il ne fait rien.'
		}
	],
	takeaway: 'Ansible, c’est ton runbook en fichier : un inventaire de serveurs, et des tâches qui décrivent l’état final. Écris des tâches qui disent « s’assurer que », et la deuxième exécution ne doit rien changer.',
	sources: [
		{ title: 'Doc Ansible, Introduction aux playbooks', url: 'https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_intro.html' },
		{ title: 'Doc Ansible, Construire ton inventaire', url: 'https://docs.ansible.com/ansible/latest/inventory_guide/intro_inventory.html' },
		{ title: 'Doc Ansible, Introduction aux commandes ad hoc', url: 'https://docs.ansible.com/ansible/latest/command_guide/intro_adhoc.html' },
		{ title: 'Doc Ansible, Check mode et diff mode', url: 'https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_checkmode.html' },
		{ title: 'Ansible for DevOps, playbooks d’exemple', url: `${AFD}/README.md` }
	]
};
