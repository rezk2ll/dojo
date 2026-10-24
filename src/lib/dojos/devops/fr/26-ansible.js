const AFD = 'https://github.com/geerlingguy/ansible-for-devops/blob/86e1bf80098239cd995d54217585e8d61117d2e7';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'ansible',
	part: 'L’infrastructure as code',
	title: 'Ansible : des playbooks en SSH',
	minutes: 10,
	hook: [
		'Tu as vingt serveurs. Un nouveau doit avoir chrony installé et démarré. Tu te connectes en ssh, tu lances `dnf install chrony`, `systemctl enable --now chronyd`, tu te déconnectes. Puis le suivant. Puis celui que tu as oublié.',
		'Ta boucle for sur ssh marche, jusqu’au jour où un serveur est à moitié fait, ou déjà fait, ou différent. La boucle ne voit pas la différence et relance toutes les commandes.',
		'Ansible lit un fichier qui décrit l’état voulu de chaque serveur. Il se connecte en SSH, vérifie chaque serveur, et ne change **que ce qui n’est pas déjà bon**. Tu n’installes aucun agent sur les serveurs.'
	],
	terms: [
		{ term: 'Inventaire', def: 'La liste des nœuds gérés, rangés en groupes comme `[app]` et `[db]`. Ansible ajoute toujours les groupes `all` et `ungrouped`.' },
		{ term: 'Module', def: 'Un petit programme qui fait un seul travail, comme `dnf`, `service` ou `copy`. Ansible le copie sur le nœud géré et l’exécute là-bas.' },
		{ term: 'Playbook', def: 'Un fichier YAML avec un ou plusieurs plays. Un play associe un groupe d’hôtes à une liste de tâches. Chaque tâche appelle un module.' },
		{ term: 'Idempotent', def: 'Le lancer deux fois donne le même résultat que le lancer une fois. Une bonne tâche répond `ok` quand il n’y a rien à faire.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['inv["inventaire : hosts.ini"] --> cn["Nœud de contrôle : ton portable"]'],
				highlight: ['inv', 'cn'],
				note: 'Le nœud de contrôle est la machine où tu lances Ansible, ici ton portable. Il lit l’**inventaire**, un fichier qui liste les serveurs que tu gardais en tête ou dans une page de wiki.'
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
				note: 'Ansible parle aux nœuds gérés en **SSH standard**, avec les clés que tu as déjà. Le type de connexion par défaut est `ssh`. Rien ne tourne sur les serveurs entre deux exécutions.'
			},
			{
				add: ['pb["playbook.yml : tâches dans l’ordre"] --> cn'],
				highlight: ['pb'],
				note: 'Le **playbook** s’exécute de haut en bas. Chaque tâche passe sur tous les hôtes du play avant que la suivante commence. Si une tâche échoue sur un hôte, cet hôte est écarté pour le reste de l’exécution.'
			},
			{
				add: ['res["Chaque tâche répond : ok ou changed"]', 'a1 -.-> res', 'a2 -.-> res', 'd1 -.-> res'],
				highlight: ['res'],
				note: 'La plupart des modules vérifient d’abord, puis agissent. chrony déjà installé ? La tâche répond `ok` et ne fait rien. Absent ? Elle installe chrony et répond **`changed`**. Lance le playbook dix fois : les serveurs finissent dans le même état.'
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
			'Les lignes 6 et 11 nomment chaque tâche par son état final : « Ensure ... is installed » (s’assurer que c’est installé), pas « install ». Le module `dnf` de la ligne 7 décide s’il y a du travail.',
			'Ligne 3, `become: yes` joue le rôle de ton `sudo`. Ansible se connecte avec ton utilisateur, puis passe root pour les tâches.',
			'Les lignes 18 à 22 répètent le play en forme `key=value`. Une **commande ad-hoc** utilise la même syntaxe : `ansible all -m ansible.builtin.dnf -a "name=chrony state=present" --become` lance un module une fois, sans playbook.',
			'Tous les modules ne savent pas vérifier d’abord. Le module `command` lance n’importe quelle commande, donc Ansible ne peut pas savoir ce qu’elle a fait. Le [playbook Node.js](https://github.com/geerlingguy/ansible-for-devops/blob/86e1bf80098239cd995d54217585e8d61117d2e7/nodejs/provisioning/playbook.yml#L40-L47) du même repo ajoute l’idempotence à la main : `changed_when: false` sur la vérification, et `when:` pour ne démarrer l’appli que si elle ne tourne pas déjà.'
		]
	},
	tradeoff: {
		gain: [
			'Ton runbook vit dans un playbook versionné dans Git : tu le relis, tu suis ses versions, et il s’applique pareil sur chaque serveur.',
			'Quand une exécution s’arrête à mi-chemin, tu relances le playbook. Les tâches déjà faites répondent `ok`.',
			'Ansible n’a besoin que de SSH et des clés que tu as déjà. Tu n’as aucun agent à installer ni à patcher sur les serveurs.'
		],
		cost: [
			'Ansible ne gère que ce que liste le playbook. Si tu supprimes une tâche, le paquet reste installé jusqu’à ce qu’une tâche pose `state: absent`.',
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
			'Essaie d’abord avec `ansible-playbook site.yml --check`, un essai à blanc qui ne change rien. La deuxième vraie exécution doit montrer chaque tâche en **`ok`** et `changed=0`. Si une tâche répond `changed` à chaque fois, elle n’est pas idempotente.'
		],
		steps: [
			{
				title: 'Vise le groupe',
				questions: [
					{ q: 'Quelle ligne commence le play ?', options: ['`- hosts: all`', '`- group: web`', '`- hosts: web`', '`- inventory: web`'], answer: 2, why: 'Un play associe un groupe d’hôtes à une liste de tâches. `hosts: web` choisit le groupe.' },
					{ q: 'Où Ansible apprend-il quels serveurs sont dans `web` ?', options: ['Dans l’inventaire', 'Dans le playbook lui-même', 'Auprès d’un agent sur chaque serveur', 'Dans le nom d’hôte des serveurs'], answer: 0, why: 'L’inventaire liste les nœuds gérés et les range en groupes.' },
					{ q: 'Pourquoi ajouter `become: yes` ?', options: ['Les tâches tournent en parallèle', 'Il active le check mode', 'Il installe Ansible sur les serveurs', 'Installer un paquet et écrire `/etc/motd` demandent root'], answer: 3, why: '`become`, c’est ton `sudo`. Ansible se connecte avec ton utilisateur, puis passe root pour les tâches.' },
					{ q: 'Qu’installes-tu sur les serveurs web avant la première exécution ?', options: ['L’agent Ansible', 'Rien : Ansible a seulement besoin de SSH et de tes clés', 'nginx, pour qu’Ansible puisse le gérer', 'Une copie du playbook'], answer: 1, why: 'Ansible se connecte en SSH standard. Rien ne tourne sur les serveurs entre deux exécutions.' }
				]
			},
			{
				title: 'Un module par ligne',
				questions: [
					{ q: 'Quelle tâche installe nginx ?', options: ['`ansible.builtin.copy` avec `dest: nginx`', '`ansible.builtin.service` avec `state: present`', '`ansible.builtin.package` avec `name: nginx` et `state: present`', '`ansible.builtin.command: nginx`'], answer: 2, why: 'Le module package vérifie si nginx est là et ne l’installe que s’il manque.' },
					{ q: 'Quelle tâche fait démarrer nginx maintenant et au boot ?', options: ['`ansible.builtin.service` avec `state: started` et `enabled: yes`', '`ansible.builtin.service` avec seulement `state: started`', '`ansible.builtin.package` avec `enabled: yes`', '`ansible.builtin.command: systemctl start nginx`'], answer: 0, why: '`started` couvre maintenant, `enabled` couvre le prochain boot.' },
					{ q: 'Quelle tâche pose le motd ?', options: ['`ansible.builtin.service` avec `name: motd`', '`ansible.builtin.shell: echo Managed by Ansible > /etc/motd`', '`ansible.builtin.package` avec `name: motd`', '`ansible.builtin.copy` avec `content: "Managed by Ansible\\n"` et `dest: /etc/motd`'], answer: 3, why: '`copy` compare le fichier au contenu et ne l’écrit que s’ils diffèrent.' },
					{ q: 'Pourquoi ne pas utiliser `ansible.builtin.command: apt-get install -y nginx` ?', options: ['`command` ne sait pas lancer `apt-get`', '`command` ne peut pas vérifier d’abord, donc Ansible ne sait pas ce qu’il a fait', '`command` demande `become: no`', '`command` ne marche qu’en mode ad hoc'], answer: 1, why: '`command` lance n’importe quelle commande et n’est pas idempotent, sauf si tu ajoutes toi-même `creates`, `changed_when` ou `when`.' }
				]
			},
			{
				title: 'Nomme et ordonne les tâches',
				questions: [
					{ q: 'Comment nommes-tu la première tâche ?', options: ['`Ensure nginx is installed.`', '`Install nginx`', '`Run apt-get`', '`nginx`'], answer: 0, why: 'Nomme chaque tâche comme un état final. Le module décide s’il y a du travail.' },
					{ q: 'Dans quel ordre tournent les trois tâches ?', options: ['Toutes en même temps sur chaque hôte', 'Dans un ordre aléatoire, hôte par hôte', 'De haut en bas, chaque tâche sur tous les hôtes avant la suivante', 'Par ordre alphabétique du nom de tâche'], answer: 2, why: 'Le playbook s’exécute de haut en bas, une tâche sur tous les hôtes à la fois.' },
					{ q: 'La tâche du paquet échoue sur un serveur web. Que lui arrive-t-il ?', options: ['Toute l’exécution s’arrête sur tous les hôtes', 'Ansible la relance jusqu’à ce qu’elle passe', 'L’échec est ignoré et la tâche suivante tourne sur ce serveur', 'Cet hôte est écarté pour le reste de l’exécution'], answer: 3, why: 'Les autres hôtes continuent. Tu répares celui qui a cassé et tu relances le playbook.' },
					{ q: 'Tu as vingt serveurs web. Sur combien Ansible travaille-t-il à la fois par défaut ?', options: ['Les vingt', 'Cinq, sauf si tu changes avec `-f`', 'Un', 'Dix'], answer: 1, why: 'La valeur par défaut est de cinq hôtes à la fois.' }
				]
			},
			{
				title: 'Prévois la deuxième exécution',
				questions: [
					{ q: 'Que fait `ansible-playbook site.yml --check` ?', options: ['Un essai à blanc qui ne change rien', 'Il vérifie seulement la syntaxe YAML', 'Il lance le playbook deux fois', 'Il installe les modules sur les serveurs'], answer: 0, why: 'Le check mode dit ce qui changerait sans le changer.' },
					{ q: 'Que doit afficher la deuxième vraie exécution ?', options: ['Chaque tâche en `changed`, parce qu’elle a tourné à nouveau', 'Un échec, parce que nginx existe', 'Chaque tâche en `ok`, et `changed=0`', 'Rien : Ansible saute les hôtes déjà configurés'], answer: 2, why: 'Les tâches tournent quand même, elles ne trouvent juste rien à faire.' },
					{ q: 'Pourquoi la deuxième exécution ne trouve-t-elle rien à faire ?', options: ['Ansible garde en cache le résultat de la première', 'Les serveurs verrouillent leur config après la première', 'La deuxième exécution utilise le check mode', 'Chaque module vérifie d’abord l’état actuel'], answer: 3, why: 'nginx est installé, lancé, activé, et le motd correspond. Chaque module le voit et ne fait rien.' },
					{ q: 'Une tâche répond `changed` à chaque exécution. Qu’est-ce que ça te dit ?', options: ['Le serveur est cassé', 'La tâche n’est pas idempotente', 'Le check mode est actif', 'L’inventaire est faux'], answer: 1, why: 'Une tâche idempotente répond `ok` quand il n’y a rien à faire.' }
				]
			}
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
			q: 'Tu lances `ansible-playbook site.yml --check`. Une tâche est `ansible.builtin.command: /opt/app/migrate.sh`, sans `creates` ni `removes`. Que se passe-t-il pour le script ?',
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
	lab: {
		minutes: 25,
		goal: 'Lancer le playbook du serveur web sur un conteneur, voir la deuxième exécution répondre `changed=0`, puis repérer une modification à la main avec le check mode.',
		steps: [
			'Installe Ansible dans un virtualenv : `python3 -m venv ~/ansible-lab/venv && ~/ansible-lab/venv/bin/pip install ansible`, puis `cd ~/ansible-lab && source venv/bin/activate`.',
			'Lance un serveur jetable et donne-lui Python : `docker run -d --name web1 debian:12 sleep infinity`, puis `docker exec web1 sh -c \'apt-get update && apt-get install -y python3 python3-apt\'`.',
			'Écris `hosts.ini` avec un groupe `[web]` et une ligne : `web1 ansible_connection=community.docker.docker ansible_become=false`. Ansible joint le conteneur avec `docker exec` au lieu de SSH, et tu es déjà root dedans.',
			'Écris `site.yml` à partir de l’exercice, puis lance `ansible-playbook -i hosts.ini site.yml` deux fois.',
			'Modifie le serveur à la main : `docker exec web1 sh -c \'echo hacked > /etc/motd\'`. Lance `ansible-playbook -i hosts.ini site.yml --check --diff`, puis le playbook pour de vrai.',
				'Une fois les vérifications ci-dessous passées, nettoie avec `docker rm -f web1`.'
		],
		done: [
			'Le récapitulatif de la première exécution montre `changed=3`, celui de la deuxième `changed=0`.',
			'`docker exec web1 cat /etc/motd` affiche `Managed by Ansible`.',
			'L’exécution `--check --diff` affiche `-hacked` et `+Managed by Ansible`, mais le fichier dit toujours `hacked` jusqu’à la vraie exécution.'
		],
		solution: [
			'`- hosts: web`, `become: yes`, puis trois tâches : `ansible.builtin.package` (`name: nginx`, `state: present`), `ansible.builtin.service` (`name: nginx`, `state: started`, `enabled: yes`), `ansible.builtin.copy` (`content: "Managed by Ansible\\n"`, `dest: /etc/motd`).',
			'`ansible_become=false` dans l’inventaire l’emporte sur `become: yes` dans le play. Sur un vrai serveur en SSH, tu l’enlèverais.',
			'Essaie `--check` avant la toute première exécution : la tâche service échoue avec `Could not find the requested service nginx`, parce que le check mode n’a pas vraiment installé le paquet.'
		]
	},
	recall: {
		q: 'Tu relances un playbook sur un serveur que la première exécution a déjà configuré. Que doit répondre chaque tâche, et pourquoi ?',
		a: 'Chaque tâche répond `ok` et le récap affiche `changed=0`. Chaque module vérifie d’abord l’état actuel et ne trouve rien à changer.'
	},
	sources: [
		{ title: 'Doc Ansible, Introduction aux playbooks', url: 'https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_intro.html' },
		{ title: 'Doc Ansible, Construire ton inventaire', url: 'https://docs.ansible.com/ansible/latest/inventory_guide/intro_inventory.html' },
		{ title: 'Doc Ansible, Introduction aux commandes ad hoc', url: 'https://docs.ansible.com/ansible/latest/command_guide/intro_adhoc.html' },
		{ title: 'Doc Ansible, Check mode et diff mode', url: 'https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_checkmode.html' },
		{ title: 'Ansible for DevOps, playbooks d’exemple', url: `${AFD}/README.md` }
	]
};
