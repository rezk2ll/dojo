const EXAMPLES = 'https://github.com/ansible/ansible-examples/blob/b50586543c6c4be907fdc88f9f78a2b35d2a895f';
const ANSIBLE_DOCS = 'https://github.com/ansible/ansible-documentation/blob/8f66c43ba55198c517054bed5ccaf2b4bf6721c0/docs/docsite/rst/playbook_guide';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'toil-and-automation',
	part: 'L’état d’esprit DevOps',
	title: 'Le toil : repérer et automatiser le travail ops répétitif',
	minutes: 10,
	hook: [
		'Chaque lundi, tu te connectes en SSH sur six serveurs web. Tu vérifies le disque, tu supprimes les vieux fichiers dans `/tmp`, et tu relances l’appli si la mémoire paraît haute. Quarante minutes. **Le lundi suivant, exactement les mêmes quarante minutes.**',
		'À la fin de la matinée, les serveurs sont dans le même état que la semaine dernière. Quand la boîte ajoute six serveurs, ton lundi double.',
		'Les équipes SRE de Google appellent ce genre de travail du toil. Tu peux le repérer, le mesurer en minutes par semaine, et décider quoi automatiser en premier.'
	],
	terms: [
		{ term: 'Toil', def: 'Du travail lié à l’exploitation d’un service en prod qui tend à être manuel, répétitif, automatisable, tactique (déclenché par des interruptions, réactif), sans amélioration durable, et qui grandit avec la taille du service. Une tâche n’a pas besoin des six traits pour être du toil.' },
		{ term: 'Overhead', def: 'Le travail administratif qui n’est pas lié à l’exploitation du service : réunions, paperasse RH, fixation d’objectifs. Tu dois quand même le faire, et il ne compte pas comme du toil.' },
		{ term: 'Travail d’ingénierie', def: 'Du travail qui demande du jugement humain et apporte une amélioration durable : écrire de l’automatisation, corriger une cause racine, améliorer le monitoring.' },
		{ term: 'Runbook', def: 'Les étapes écrites d’une tâche ou d’une alerte récurrente : « se connecter à X, lancer ceci, vérifier la sortie, relancer Y si... ». Quelqu’un qui sait programmer y lit du pseudocode.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['alert["Alerte : /tmp à 95%"] --> human["Toi : ssh, find, rm, restart"]'],
				highlight: ['human'],
				note: 'Cette tâche a tous les traits du toil : manuelle, répétitive, déclenchée par une interruption, et le serveur n’est pas mieux après. Ça grandit aussi de façon linéaire : deux fois plus de serveurs, deux fois plus de travail.'
			},
			{
				add: ['human -.->|"l’écrire"| runbook["Runbook : étapes et vérifications"]'],
				highlight: ['runbook'],
				note: 'D’abord, tu écris les étapes. Le workbook SRE fait remarquer qu’un runbook qui dit « se connecter à X, lancer ceci, relancer Y si... » est **déjà du pseudocode** pour quelqu’un qui sait programmer.'
			},
			{
				add: ['runbook --> script["Script : un humain le lance"]'],
				highlight: ['script'],
				note: 'Un script lancé par un humain, c’est de l’automatisation partielle : plus rapide, avec les mêmes étapes à chaque fois. Le livre SRE compte quand même **le temps que tu passes à lancer un script comme du toil**.'
			},
			{
				add: ['script --> auto["Automatisation : détecte et corrige, sans humain"]'],
				highlight: ['auto'],
				note: 'Avec l’automatisation complète, le système repère le problème et le corrige sans humain. Une automatisation avec des droits admin a besoin de garde-fous, et doit **rendre la main à un humain** quand quelque chose paraît risqué.'
			},
			{
				add: ['auto -.->|"encore mieux"| fix["Cause racine corrigée : l’appli ne remplit plus /tmp"]'],
				highlight: ['fix'],
				note: 'Si l’appli arrête de remplir `/tmp`, aucune alerte ne se déclenche et aucun script n’est nécessaire. Demande-toi **pourquoi** `/tmp` se remplit, et fais-le corriger à la source. Un script de nettoyage peut cacher le bug qui le remplit.'
			}
		]
	},
	example: {
		title: 'lamp_haproxy/rolling_update.yml',
		repo: 'ansible/ansible-examples',
		url: `${EXAMPLES}/lamp_haproxy/rolling_update.yml#L14-L47`,
		lang: 'yaml',
		code: `- hosts: webservers
  serial: 1

  # These are the tasks to run before applying updates:
  pre_tasks:
  - name: disable nagios alerts for this host webserver service
    nagios: 'action=disable_alerts host={{ inventory_hostname }} services=webserver'
    delegate_to: "{{ item }}"
    with_items: "{{ groups.monitoring }}"

  - name: disable the server in haproxy
    haproxy: 'state=disabled backend=myapplb host={{ inventory_hostname }} socket=/var/lib/haproxy/stats'
    delegate_to: "{{ item }}"
    with_items: "{{ groups.lbservers }}"

  roles:
  - common
  - base-apache
  - web

  # These tasks run after the roles:
  post_tasks:
  - name: wait for webserver to come up
    wait_for: 'host={{ inventory_hostname }} port=80 state=started timeout=80'

  - name: enable the server in haproxy
    haproxy: 'state=enabled backend=myapplb host={{ inventory_hostname }} socket=/var/lib/haproxy/stats'
    delegate_to: "{{ item }}"
    with_items: "{{ groups.lbservers }}"
…`,
		notes: [
			'Ce playbook fait les étapes d’un runbook écrit, donc plus personne ne les tape. Les lignes 5 à 14 coupent les alertes et sortent le serveur de HAProxy, la ligne 16 le met à jour, la ligne 24 attend que le port 80 réponde, et les lignes 26 à 29 le remettent. Tu apprendras Ansible dans la partie 6.',
			'Ligne 2, `serial: 1` fait traiter par Ansible un hôte à la fois au lieu de tous en parallèle. Tu obtiens un rolling update : chaque serveur sort du load balancer pendant qu’il change, et les autres continuent de servir ([doc Ansible](https://github.com/ansible/ansible-documentation/blob/8f66c43ba55198c517054bed5ccaf2b4bf6721c0/docs/docsite/rst/playbook_guide/playbooks_strategies.rst#setting-the-batch-size-with-serial)).',
			'Lignes 8 et 13 : `delegate_to` lance une tâche sur une autre machine : les tâches HAProxy et Nagios tournent sur les hôtes load balancer et monitoring, pour le serveur web en cours de mise à jour ([doc sur la délégation](https://github.com/ansible/ansible-documentation/blob/8f66c43ba55198c517054bed5ccaf2b4bf6721c0/docs/docsite/rst/playbook_guide/playbooks_delegation.rst)). Ansible lance les `pre_tasks`, puis les rôles, puis les `post_tasks`.',
			'La ligne 24 sert de garde-fou. Si le port 80 ne répond pas en 80 secondes, `wait_for` échoue, et par défaut Ansible arrête de lancer des tâches sur cet hôte. Le serveur cassé n’est **jamais remis** dans HAProxy.',
			'Le dépôt est archivé et le style est ancien (arguments `key=value`, `with_items`). Les modules `haproxy` et `nagios` vivent maintenant dans la collection `community.general`. Un rolling update suit toujours cet ordre d’étapes.'
		]
	},
	tradeoff: {
		gain: [
			'Le temps passé à la main baisse, et il arrête de grandir à chaque fois que le parc grandit.',
			'Le playbook suit les mêmes étapes à chaque fois, y compris à 3 h du matin, quand on fait des erreurs.',
			'Les heures gagnées vont au travail d’ingénierie. Le SRE de Google plafonne le travail opérationnel à 50 % du temps de chaque SRE pour cette raison.'
		],
		cost: [
			'Tu passes du temps à construire et à maintenir l’automatisation. Le workbook SRE demande de comparer ce coût au temps gagné.',
			'Une automatisation avec des droits admin peut provoquer des pannes très vite. Elle a besoin de garde-fous et d’un moyen de s’arrêter et d’appeler un humain.',
			'Un script peut cacher une cause racine, et l’équipe peut oublier comment le système marche vraiment en dessous.'
		]
	},
	task: {
		prompt: 'Ta liste ops de la semaine : (a) nettoyer `/tmp` sur six serveurs web, 40 min ; (b) réunion d’équipe, 60 min ; (c) créer des comptes utilisateurs à la demande, environ 10 tickets de 15 min, de plus en plus à chaque embauche ; (d) écrire un rôle Ansible pour nginx, une fois, environ 6 heures ; (e) renouveler un certificat TLS à la main, 30 min chaque trimestre. Classe chacune en toil, overhead ou ingénierie. Puis choisis par quoi commencer et dis comment.',
		hint: 'Utilise la grille SRE : manuel, répétitif, automatisable, réactif, sans valeur durable, grandit avec le service. Puis mesure en minutes par semaine, et souviens-toi que refuser une tâche ou la supprimer à la source vaut mieux que l’automatiser.',
		answer: [
			'Toil : (a), (c) et (e). Overhead : (b). Ingénierie : (d), parce que c’est un travail ponctuel qui laisse une amélioration durable.',
			'Mesure d’abord. (c) fait environ 150 min par semaine **et grandit avec les effectifs**. (a) fait 40 min par semaine. (e) fait environ 30 min par trimestre.',
			'Attaque (c) en premier. Va vers le libre-service : un formulaire ou un script qui crée le compte, avec un retour au ticket seulement pour les cas particuliers.',
			'Pour (a), avant d’écrire un script de nettoyage, demande-toi pourquoi `/tmp` se remplit. Corriger l’appli ou mettre en place le nettoyage à la source supprime la tâche.',
			'Pour (e), automatise le renouvellement avec un client ACME comme certbot, et alerte sur les certificats proches de l’expiration. Ça prend 30 minutes par trimestre, et un renouvellement oublié met le site par terre.'
		]
	},
	quiz: [
		{
			q: 'D’après le livre SRE de Google, laquelle de ces tâches est du toil ?',
			options: [
				'Une réunion d’équipe hebdomadaire',
				'Un nettoyage unique de toute la configuration d’alerting existante',
				'Relancer le même service à la main chaque fois que la même alerte se déclenche',
				'Remplir de la paperasse RH'
			],
			answer: 2,
			why: 'Le livre SRE range les réunions et la paperasse dans l’overhead. Un nettoyage unique est ingrat mais laisse une amélioration durable. La relance manuelle répétée est manuelle, répétitive, réactive et ne change rien sur la durée.'
		},
		{
			q: 'Chaque semaine, tu lances à la main un script de nettoyage. Il fait gagner du temps par rapport à taper les commandes. Le temps passé à le lancer est-il encore du toil ?',
			options: [
				'Oui : le temps qu’un humain passe à lancer un script reste du toil',
				'Non : dès qu’il y a un script, la tâche compte comme du travail automatisé',
				'Non : seules les tâches de plus d’une heure par semaine comptent comme du toil',
				'Seulement si le script échoue et que tu dois finir les étapes à la main'
			],
			answer: 0,
			why: 'Le livre SRE est explicite : lancer un script peut être plus rapide que faire les étapes, mais le temps passé dessus reste du toil. L’automatisation complète sort l’humain de la boucle.'
		},
		{
			q: 'Le workbook SRE cite une option à envisager en premier pour une tâche chargée en toil. Laquelle ?',
			options: [
				'Concevoir un système complet qui supprime d’un coup tout le toil de l’équipe',
				'Refuser le toil : comparer le coût de le faire au coût de ne pas le faire',
				'La confier au dernier arrivé, pour que les seniors gardent du temps pour l’ingénierie',
				'La faire plus vite en sautant les vérifications qui ne trouvent jamais rien'
			],
			answer: 1,
			why: 'Le workbook dit que refuser une tâche chargée en toil devrait être la première option envisagée. Il met aussi en garde contre la recherche du système parfait, et recommande de commencer petit.'
		}
	],
	recall: {
		q: 'Tu lances à la main un script de nettoyage chaque semaine. Ce temps est-il du toil, et que conseille le workbook SRE d’envisager en premier pour une tâche chargée en toil ?',
		a: 'Oui, le temps passé à lancer un script reste du toil. La première option est de refuser la tâche : comparer le coût de la faire au coût de ne pas la faire.'
	},
	sources: [
		{ title: 'Livre SRE de Google, Eliminating Toil', url: 'https://sre.google/sre-book/eliminating-toil/' },
		{ title: 'Workbook SRE de Google, Eliminating Toil', url: 'https://sre.google/workbook/eliminating-toil/' },
		{ title: 'Doc Ansible, Controlling playbook execution (serial)', url: `${ANSIBLE_DOCS}/playbooks_strategies.rst` },
		{ title: 'Doc Ansible, Error handling in playbooks', url: `${ANSIBLE_DOCS}/playbooks_error_handling.rst` },
		{ title: 'ansible-examples, rolling update de lamp_haproxy', url: `${EXAMPLES}/lamp_haproxy/rolling_update.yml` }
	]
};
