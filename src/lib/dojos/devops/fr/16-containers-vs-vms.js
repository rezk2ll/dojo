const COMPOSE = 'https://github.com/docker/awesome-compose/blob/30f4b7f6a6c3b0c0ecf4d4efb0de203c48d11562';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'containers-vs-vms',
	part: 'Les conteneurs',
	title: 'Un conteneur est un processus, pas une petite VM',
	minutes: 10,
	hook: [
		'Tu lances `ps aux` sur un hôte Docker et tu vois `postgres` dans la liste, à côté de `sshd` et `cron`. Pas d’OS invité, pas d’hyperviseur. La base « dans le conteneur » est **un processus normal sur ton noyau**.',
		'Une VM démarre son propre noyau sur du matériel virtuel. Un conteneur saute tout ça. Le noyau donne simplement au processus une vue privée du système (ses propres PID, son réseau, ses montages) et un budget de CPU et de mémoire.',
		'Aujourd’hui tu découvres les deux fonctions du noyau qui rendent ça possible, les **namespaces** et les **cgroups**, et la chose à ne jamais oublier : tous les conteneurs d’un hôte **partagent le noyau de l’hôte**.'
	],
	terms: [
		{ term: 'Conteneur', def: 'Un processus (ou un groupe de processus) que le noyau isole avec des namespaces et limite avec des cgroups. Il tourne sur le noyau de l’hôte.' },
		{ term: 'Namespace', def: 'Une fonction du noyau qui donne à un processus sa propre copie privée d’une ressource : PID, pile réseau, points de montage, nom d’hôte, utilisateurs.' },
		{ term: 'cgroup', def: 'Control group. Une fonction du noyau qui compte et limite ce qu’un groupe de processus consomme : mémoire, CPU, I/O.' },
		{ term: 'Image', def: 'Une pile de couches de fichiers en lecture seule, plus des réglages (commande, utilisateur, env). Elle ne change plus une fois construite.' },
		{ term: 'Couche du conteneur', def: 'La fine couche inscriptible posée sur l’image au démarrage du conteneur. Toutes les écritures y vont, et elle disparaît quand le conteneur est supprimé.' },
		{ term: 'Capability', def: 'Une part du pouvoir de root, comme `NET_ADMIN` ou `SYS_MODULE`. Docker démarre les conteneurs avec un jeu réduit.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: [
					'subgraph vmside["Machine virtuelle"]',
					'gk["Noyau invité"] --> vapp["Appli"]',
					'end',
					'hw["Matériel du serveur"] --> hyp["Hyperviseur"] --> gk'
				],
				highlight: ['hyp', 'gk'],
				note: 'Une **VM** fait tourner un OS complet avec **son propre noyau** sur du matériel virtuel. Isolation forte, mais tu démarres et patches un OS entier pour une seule appli.'
			},
			{
				add: [
					'hk["Noyau de l’hôte"]',
					'hw --> hk',
					'hk --> c1["Conteneur : postgres"]',
					'hk --> c2["Conteneur : nginx"]'
				],
				highlight: ['hk', 'c1', 'c2'],
				note: 'Les conteneurs n’ont **pas de noyau à eux**. Ce sont des processus sur le noyau de l’hôte. C’est pour ça qu’ils démarrent en une seconde et que `ps` sur l’hôte les montre.'
			},
			{
				add: [
					'ns["Namespaces : PID, réseau, montages, nom d’hôte"]',
					'ns -.->|vue privée| c1'
				],
				highlight: ['ns'],
				note: 'Les **namespaces** décident de ce que le processus **voit**. Dedans, postgres croit être le PID 1 et a son propre `eth0`. Sur l’hôte, c’est juste un PID de plus.'
			},
			{
				add: [
					'cg["cgroups : limites mémoire et CPU"]',
					'cg -.->|budget| c2'
				],
				highlight: ['cg'],
				note: 'Les **cgroups** décident de ce que le processus peut **consommer**. Par défaut un conteneur n’a aucune limite. Fixes-en une (`docker run --memory 512m`) et le noyau l’applique.'
			},
			{
				add: [
					'img[("Image : couches en lecture seule")]',
					'img -.->|démarre en| c1',
					'img -.->|démarre en| c2'
				],
				highlight: ['img'],
				note: 'Une **image** peut lancer plusieurs **conteneurs**. Chacun reçoit sa propre fine couche inscriptible par dessus. Supprime le conteneur et cette couche disparaît, l’image reste intacte.'
			}
		]
	},
	example: {
		title: 'wireguard/compose.yaml',
		repo: 'docker/awesome-compose',
		url: `${COMPOSE}/wireguard/compose.yaml#L1-L27`,
		lang: 'yaml',
		code: `version: '3.7'
services:
  wireguard:
    image: linuxserver/wireguard
    container_name: wireguard
    cap_add:
      - NET_ADMIN
      - SYS_MODULE
…
    volumes:
      - /usr/share/appdata/wireguard/config:/config
      - /usr/src:/usr/src # location of kernel headers
      - /lib/modules:/lib/modules
    ports:
      - 51820:51820/udp
    sysctls:
      - net.ipv4.conf.all.src_valid_mark=1
    restart: unless-stopped`,
		notes: [
			'Le conteneur monte le `/lib/modules` et les headers du noyau **de l’hôte**. Il n’a pas de noyau à lui, donc un VPN qui a besoin d’un module noyau doit utiliser celui que l’hôte fait tourner.',
			'`SYS_MODULE` autorise le processus à charger des modules noyau. Un module chargé depuis ce conteneur va dans le **noyau de l’hôte**, partagé par tous les autres conteneurs. La [référence de docker run](https://docs.docker.com/engine/containers/run/) range `SYS_MODULE` parmi les capabilities **non** accordées par défaut, donc cette ligne rend beaucoup de pouvoir.',
			'`NET_ADMIN` et `sysctls` modifient des réglages réseau, mais dans le namespace réseau du conteneur. C’est le namespace qui fait son travail.',
			'Compare avec [l’exemple minecraft](https://github.com/docker/awesome-compose/blob/30f4b7f6a6c3b0c0ecf4d4efb0de203c48d11562/minecraft/compose.yaml#L8-L11) : `deploy.resources.limits.memory: 1.5G`. C’est une limite cgroup, l’autre moitié de l’histoire.'
		]
	},
	tradeoff: {
		gain: [
			'Démarre en une seconde environ, parce qu’il n’y a pas d’OS à booter.',
			'Des dizaines de conteneurs tiennent sur un hôte qui porterait une poignée de VM.',
			'L’image est la même sur ton portable, dans la CI et en production.'
		],
		cost: [
			'Un seul noyau partagé : un bug noyau ou un conteneur trop puissant peut atteindre l’hôte et ses voisins.',
			'Impossible de faire tourner un autre noyau, ou une appli Windows sur un hôte Linux, dans un conteneur.',
			'Tout ce qui est écrit dans le conteneur est perdu à sa suppression, sauf si tu le mets dans un volume.'
		]
	},
	task: {
		prompt: 'Sur un hôte Docker, lance `docker run -d --name web nginx`. Trouve le processus nginx côté hôte, puis depuis l’intérieur du conteneur. Explique pourquoi les PID diffèrent, puis supprime le conteneur et dis ce qu’est devenu un fichier que tu y avais créé.',
		hint: 'Essaie `ps -ef | grep nginx` sur l’hôte, et `docker exec web ls /proc` ou `docker top web`. Quel namespace cache les processus de l’hôte ?',
		answer: [
			'Sur l’hôte, `ps` montre le master et les workers nginx avec des PID normaux de l’hôte. `docker top web` montre les mêmes processus.',
			'Dedans, le master est le PID 1 : le **namespace PID** donne au conteneur sa propre numérotation et cache tous les processus de l’hôte.',
			'Même processus, deux vues. Aucun second noyau en jeu.',
			'Après `docker rm -f web`, tout fichier écrit dedans a disparu : il vivait dans la couche du conteneur. L’image `nginx` n’a pas changé et peut relancer un conteneur neuf.'
		]
	},
	quiz: [
		{
			q: 'Quelle est la différence principale entre un conteneur et une machine virtuelle ?',
			options: [
				'Un conteneur fait tourner son propre noyau, en plus petit',
				'Un conteneur partage le noyau de l’hôte, une VM démarre le sien',
				'Un conteneur tourne toujours avec un utilisateur non root',
				'Une VM ne peut pas faire tourner plus d’un processus'
			],
			answer: 1,
			why: 'Un conteneur est un processus isolé par des namespaces et limité par des cgroups sur le noyau de l’hôte. Une VM a son propre noyau sur du matériel virtuel.'
		},
		{
			q: 'Quelle fonction du noyau te permet de plafonner un conteneur à 512 Mo de mémoire ?',
			options: ['Les namespaces de montage', 'Les capabilities', 'Les cgroups', 'Le namespace PID'],
			answer: 2,
			why: 'Les namespaces contrôlent ce qu’un processus voit. Les cgroups contrôlent ce qu’il consomme, mémoire et CPU compris.'
		},
		{
			q: 'Tu lances trois conteneurs depuis la même image et chacun écrit un fichier de log. Qu’arrive-t-il à l’image ?',
			options: [
				'Elle grossit de trois fichiers de log',
				'Rien : chaque conteneur écrit dans sa propre couche inscriptible, au dessus de l’image en lecture seule',
				'Le deuxième conteneur échoue parce que l’image est verrouillée',
				'L’image est copiée trois fois sur le disque'
			],
			answer: 1,
			why: 'Les images sont en lecture seule. Chaque conteneur reçoit une fine couche inscriptible, donc l’image reste la même et elle est partagée par les trois.'
		}
	],
	takeaway: 'Un conteneur est un processus de l’hôte avec une vue privée (namespaces) et un budget (cgroups). Il partage le noyau de l’hôte : vois ça comme de l’isolation, pas comme une machine à part.',
	sources: [
		{ title: 'Doc Docker, What is a container?', url: 'https://docs.docker.com/get-started/docker-concepts/the-basics/what-is-a-container/' },
		{ title: 'Doc Docker, sécurité de Docker Engine', url: 'https://docs.docker.com/engine/security/' },
		{ title: 'Doc Docker, storage drivers (images, couches, couche du conteneur)', url: 'https://docs.docker.com/engine/storage/drivers/' },
		{ title: 'Page de man Linux, namespaces(7)', url: 'https://man7.org/linux/man-pages/man7/namespaces.7.html' },
		{ title: 'Page de man Linux, cgroups(7)', url: 'https://man7.org/linux/man-pages/man7/cgroups.7.html' }
	]
};
