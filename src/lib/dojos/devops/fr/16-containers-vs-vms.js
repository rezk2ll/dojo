const COMPOSE = 'https://github.com/docker/awesome-compose/blob/30f4b7f6a6c3b0c0ecf4d4efb0de203c48d11562';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'containers-vs-vms',
	part: 'Les conteneurs',
	title: 'Conteneurs et machines virtuelles',
	minutes: 10,
	hook: [
		'Tu lances `ps aux` sur un hôte Docker et tu vois `postgres` dans la liste, à côté de `sshd` et `cron`. L’hôte ne fait tourner ni OS invité ni hyperviseur. La base « dans le conteneur » est **un processus normal sur ton noyau**.',
		'Une VM démarre son propre noyau sur du matériel virtuel. Un conteneur ne démarre rien. Le noyau donne au processus une vue privée du système (ses propres PID, son réseau, ses montages) et un budget de CPU et de mémoire.',
		'Deux fonctions du noyau font ce travail : les namespaces et les cgroups. Tous les conteneurs de l’hôte tournent sur ce seul noyau de l’hôte.'
	],
	terms: [
		{ term: 'Conteneur', def: 'Un processus (ou un groupe de processus) que le noyau isole avec des namespaces et limite avec des cgroups. Il tourne sur le noyau de l’hôte.' },
		{ term: 'Namespace', def: 'Une fonction du noyau qui donne à un processus sa propre copie privée d’une ressource : PID, pile réseau, points de montage, nom d’hôte, utilisateurs.' },
		{ term: 'cgroup', def: 'Control group. Une fonction du noyau qui compte et limite ce qu’un groupe de processus consomme : mémoire, CPU, I/O.' },
		{ term: 'Image', def: 'Une pile de couches de fichiers en lecture seule, plus des réglages (commande, utilisateur, env). Elle ne change plus une fois construite.' }
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
				note: 'Une VM fait tourner un OS complet avec **son propre noyau** sur du matériel virtuel. L’isolation est forte, mais tu démarres et patches un OS entier pour une seule appli.'
			},
			{
				add: [
					'hk["Noyau de l’hôte"]',
					'hw --> hk',
					'hk --> c1["Conteneur : postgres"]',
					'hk --> c2["Conteneur : nginx"]'
				],
				highlight: ['hk', 'c1', 'c2'],
				note: 'Les conteneurs n’ont **pas de noyau à eux**. Ce sont des processus sur le noyau de l’hôte : ils démarrent en une seconde et `ps` sur l’hôte les affiche.'
			},
			{
				add: [
					'ns["Namespaces : PID, réseau, montages, nom d’hôte"]',
					'ns -.->|vue privée| c1'
				],
				highlight: ['ns'],
				note: 'Les namespaces décident de ce que le processus **voit**. Dedans, postgres croit être le PID 1 et a son propre `eth0`. Sur l’hôte, il a un PID ordinaire, comme les autres processus.'
			},
			{
				add: [
					'cg["cgroups : limites mémoire et CPU"]',
					'cg -.->|budget| c2'
				],
				highlight: ['cg'],
				note: 'Les cgroups décident de ce que le processus peut **consommer**. Par défaut, un conteneur n’a aucune limite. Fixes-en une (`docker run --memory 512m`) et le noyau l’applique.'
			},
			{
				add: [
					'img[("Image : couches en lecture seule")]',
					'img -.->|démarre en| c1',
					'img -.->|démarre en| c2'
				],
				highlight: ['img'],
				note: 'Une image peut lancer plusieurs conteneurs. Chaque conteneur reçoit sa propre fine **couche inscriptible** par dessus. Supprime le conteneur et cette couche disparaît, l’image reste intacte.'
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
			'Les lignes 12 et 13 montent les headers du noyau et le `/lib/modules` **de l’hôte**. Le conteneur n’a pas de noyau à lui : un VPN qui a besoin d’un module noyau utilise celui que l’hôte fait tourner.',
			'La ligne 8 ajoute `SYS_MODULE`, une capability (une part du pouvoir de root) qui autorise le chargement de modules noyau. Un module chargé depuis ce conteneur va dans le **noyau de l’hôte**, partagé par tous les autres conteneurs. La [référence de docker run](https://docs.docker.com/engine/containers/run/) range `SYS_MODULE` parmi les capabilities non accordées par défaut.',
			'Les lignes 7, 16 et 17 (`NET_ADMIN` et `sysctls`) modifient des réglages réseau dans le namespace réseau du conteneur. Les réglages réseau de l’hôte ne bougent pas.',
			'[L’exemple minecraft](https://github.com/docker/awesome-compose/blob/30f4b7f6a6c3b0c0ecf4d4efb0de203c48d11562/minecraft/compose.yaml#L8-L11) fixe `deploy.resources.limits.memory: 1.5G`. Docker traduit cette ligne en limite mémoire cgroup.'
		]
	},
	tradeoff: {
		gain: [
			'Un conteneur démarre en une seconde environ, parce qu’il n’y a pas d’OS à booter.',
			'Des dizaines de conteneurs tiennent sur un hôte qui porterait une poignée de VM.',
			'L’image est la même sur ton portable, dans la CI et en production.'
		],
		cost: [
			'Tous les conteneurs partagent un seul noyau : un bug noyau ou un conteneur avec `SYS_MODULE` peut atteindre l’hôte et ses voisins.',
			'Impossible de faire tourner un autre noyau, ou une appli Windows sur un hôte Linux, dans un conteneur.',
			'Tout ce qui est écrit dans le conteneur est perdu à sa suppression, sauf si tu le mets dans un volume.'
		]
	},
	task: {
		prompt: 'Sur un hôte Docker, lance `docker run -d --name web nginx`. Trouve le processus nginx côté hôte, puis depuis l’intérieur du conteneur. Explique pourquoi les PID diffèrent, puis supprime le conteneur et dis ce qui arrive à un fichier que tu y avais créé.',
		hint: 'Essaie `ps -ef | grep nginx` sur l’hôte, et `docker exec web ls /proc` ou `docker top web`. Quel namespace cache les processus de l’hôte ?',
		answer: [
			'Sur l’hôte, `ps` montre le master et les workers nginx avec des PID normaux de l’hôte. `docker top web` montre les mêmes processus.',
			'Dedans, le master est le PID 1 : le **namespace PID** donne au conteneur sa propre numérotation et cache tous les processus de l’hôte.',
			'L’hôte et le conteneur voient le même processus sous deux numéros. Aucun second noyau ne tourne.',
			'Après `docker rm -f web`, tout fichier écrit dedans a disparu : il vivait dans la couche inscriptible du conteneur. L’image `nginx` n’a pas changé et peut relancer un conteneur neuf.'
		],
		steps: [
			{
				title: 'Regarde depuis l’hôte',
				questions: [
					{ q: 'Après `docker run -d --name web nginx`, `ps -ef | grep nginx` sur l’hôte liste-t-il nginx ?', options: ['Non : il tourne dans un OS invité', 'Seulement si tu ajoutes `--privileged`', 'Oui : le master et les workers, avec des PID normaux de l’hôte', 'Seulement le processus client `docker`'], answer: 2, why: 'Un conteneur est un processus normal sur le noyau de l’hôte, donc le `ps` de l’hôte l’affiche.' },
					{ q: 'Que montre `docker top web` ?', options: ['Les mêmes processus nginx, vus depuis l’hôte', 'Une autre copie de nginx', 'Les threads du noyau du conteneur', 'Seulement les processus que Docker lance pour lui-même'], answer: 0, why: '`docker top` liste les processus du conteneur. Ce sont les mêmes que ceux du `ps` de l’hôte.' },
					{ q: 'Qu’est-ce que l’hôte a démarré pour lancer ce conteneur ?', options: ['Un petit noyau invité', 'Un hyperviseur et une VM', 'Un second système d’init', 'Rien : le processus tourne sur le noyau de l’hôte'], answer: 3, why: 'Un conteneur ne démarre aucun OS. C’est pour ça qu’il se lance en une seconde environ.' },
					{ q: 'Où passe la frontière entre un conteneur et une VM ici ?', options: ['Un conteneur a moins de fichiers', 'Un conteneur partage le noyau de l’hôte, une VM démarre le sien', 'Une VM ne peut pas faire tourner nginx', 'Un conteneur tourne toujours en non root'], answer: 1, why: 'Une VM fait tourner un OS complet avec son propre noyau sur du matériel virtuel. Un conteneur est un processus sur le noyau de l’hôte.' }
				]
			},
			{
				title: 'Regarde depuis l’intérieur',
				questions: [
					{ q: 'Dans le conteneur, quel PID a le master nginx ?', options: ['Le même PID que sur l’hôte', 'Le PID 1', 'Aucun : les conteneurs n’ont pas de PID', 'Un PID au hasard au-dessus de 1000'], answer: 1, why: 'Le conteneur a sa propre numérotation des PID, et le premier processus qu’il lance est le PID 1.' },
					{ q: '`docker exec web ls /proc` ne liste que quelques numéros. Où sont `sshd` et `cron` ?', options: ['Cachés par le namespace PID', 'Arrêtés pendant que le conteneur tourne', 'Déplacés dans l’image', 'Bloqués par une limite cgroup'], answer: 0, why: 'Le namespace PID cache tous les processus de l’hôte. Le conteneur ne voit que les siens.' },
					{ q: 'Quelle fonction du noyau décide de ce que le processus voit ?', options: ['Les cgroups', 'Les capabilities', 'Les namespaces', 'Les couches de l’image'], answer: 2, why: 'Les namespaces donnent au processus une vue privée : ses PID, son réseau, ses montages et son nom d’hôte.' },
					{ q: 'Quelle fonction du noyau plafonnerait sa mémoire si tu passais `--memory 512m` ?', options: ['Le namespace PID', 'La couche inscriptible', 'Le namespace de montage', 'Les cgroups'], answer: 3, why: 'Les cgroups décident de ce qu’un processus peut consommer. Par défaut, un conteneur n’a aucune limite.' }
				]
			},
			{
				title: 'Explique les deux PID',
				questions: [
					{ q: 'Pourquoi le même nginx a-t-il deux PID différents ?', options: ['Docker copie le processus dans le conteneur', 'Le namespace PID lui donne un second numéro dedans', 'nginx se lance une fois pour l’hôte et une fois pour le conteneur', 'La VM renumérote les processus'], answer: 1, why: 'L’hôte et le conteneur voient le même processus sous deux numéros. Seule la numérotation change.' },
					{ q: 'Combien de noyaux font tourner nginx en ce moment ?', options: ['Un seul : le noyau de l’hôte', 'Deux : hôte et conteneur', 'Un par worker', 'Aucun : Docker le fait tourner en espace utilisateur'], answer: 0, why: 'Tous les conteneurs de l’hôte tournent sur ce seul noyau de l’hôte.' },
					{ q: 'Que découle-t-il du partage d’un seul noyau ?', options: ['Les conteneurs peuvent faire tourner n’importe quel OS', 'Chaque conteneur peut charger sa propre version de noyau', 'Un bug noyau peut atteindre l’hôte et les autres conteneurs', 'Les conteneurs sont aussi isolés que des VM'], answer: 2, why: 'Tous les conteneurs partagent le noyau, donc un bug noyau ou un conteneur avec `SYS_MODULE` peut atteindre ses voisins.' },
					{ q: 'Peux-tu faire tourner une appli Windows dans un conteneur sur cet hôte Linux ?', options: ['Oui, avec la bonne image', 'Oui, si tu ajoutes `SYS_MODULE`', 'Seulement avec `--memory` réglé', 'Non : un conteneur ne peut pas apporter un autre noyau'], answer: 3, why: 'Le conteneur utilise le noyau de l’hôte. Un autre noyau demande une VM.' }
				]
			},
			{
				title: 'Supprime-le et vérifie les fichiers',
				questions: [
					{ q: 'Tu as écrit `/tmp/note.txt` dans le conteneur. Où est-il allé ?', options: ['Dans la couche inscriptible du conteneur', 'Dans l’image `nginx`', 'Dans le `/tmp` de l’hôte', 'Dans un volume créé par Docker'], answer: 0, why: 'Chaque conteneur reçoit sa propre fine couche inscriptible par-dessus l’image en lecture seule.' },
					{ q: 'Après `docker rm -f web`, que devient `/tmp/note.txt` ?', options: ['Il reste dans l’image', 'Il passe sur l’hôte', 'Il disparaît avec la couche inscriptible', 'Il attend le prochain conteneur nommé `web`'], answer: 2, why: 'Supprimer le conteneur supprime sa couche inscriptible. Le fichier ne vivait que là.' },
					{ q: 'Que devient l’image `nginx` ?', options: ['Elle contient maintenant ton fichier', 'Elle est supprimée aussi', 'Il faut la retélécharger', 'Rien : elle reste intacte'], answer: 3, why: 'Docker n’écrit jamais dans les couches d’une image, donc l’image peut relancer un conteneur neuf.' },
					{ q: 'Comment garder un fichier d’une suppression de conteneur à l’autre ?', options: ['L’écrire en root', 'Le mettre dans un volume', 'Donner un nom fixe au conteneur', 'Fixer une limite cgroup'], answer: 1, why: 'Tout ce qui est écrit dans le conteneur est perdu à sa suppression, sauf s’il est dans un volume.' }
				]
			}
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
			why: 'Les namespaces contrôlent ce qu’un processus voit. Les cgroups contrôlent la mémoire et le CPU qu’il consomme.'
		},
		{
			q: 'Tu lances trois conteneurs depuis la même image et chacun écrit un fichier de log. Qu’arrive-t-il à l’image ?',
			options: [
				'Elle grossit de trois fichiers de log, un écrit par chaque conteneur',
				'Rien, chaque conteneur écrit dans sa propre couche inscriptible au dessus de l’image',
				'Le deuxième conteneur échoue parce que le premier a verrouillé l’image',
				'L’image est copiée trois fois sur le disque, une copie par conteneur'
			],
			answer: 1,
			why: 'Docker n’écrit jamais dans les couches d’une image. Chaque conteneur écrit dans sa propre fine couche inscriptible, et les trois partagent la même image intacte.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Voir un même processus nginx sous deux PID, plafonner sa mémoire avec un cgroup, et voir un fichier disparaître avec son conteneur.',
		steps: [
			'Lance nginx avec une limite mémoire : `docker run -d --name lab-web --memory 256m nginx:1.27-alpine`.',
			'Regarde depuis l’hôte : `ps -fp "$(docker inspect -f \'{{.State.Pid}}\' lab-web)"`, puis `docker top lab-web`. Sur macOS ou Windows, Docker tourne dans une petite VM Linux, donc seul `docker top` marche.',
			'Regarde depuis l’intérieur : `docker exec lab-web cat /proc/1/cmdline`, `docker exec lab-web ls /proc`, puis compare `docker exec lab-web cat /etc/hostname` avec `hostname`.',
			'Vérifie le cgroup : `docker inspect -f \'{{.HostConfig.Memory}}\' lab-web` et `docker exec lab-web cat /sys/fs/cgroup/memory.max`.',
			'Écris un fichier, puis supprime le conteneur : `docker exec lab-web sh -c \'echo hello > /tmp/note.txt\' && docker diff lab-web`, puis `docker rm -f lab-web && docker run -d --name lab-web nginx:1.27-alpine && docker exec lab-web cat /tmp/note.txt`. Nettoie avec `docker rm -f lab-web`.'
		],
		done: [
			'Sur Linux, le `ps` de l’hôte montre `nginx: master process` sous le même PID que la première ligne de `docker top lab-web`, un grand nombre.',
			'Dedans, `/proc/1/cmdline` vaut `nginx: master process nginx -g daemon off;` : le master est le PID 1.',
			'`docker inspect` affiche `268435456`, et sur un hôte en cgroup v2, `memory.max` affiche le même nombre.',
			'`docker diff lab-web` liste `A /tmp/note.txt`, et après le nouveau lancement `cat /tmp/note.txt` échoue avec « No such file or directory ».'
		],
		solution: [
			'Le namespace PID donne au conteneur sa propre numérotation : un processus, deux PID, un seul noyau.',
			'Un autre namespace donne au conteneur son propre nom d’hôte : par défaut, l’ID court du conteneur.',
			'`--memory 256m` est devenu une limite cgroup de 256 × 1024 × 1024 octets, que le noyau applique.',
			'Le fichier vivait dans la couche inscriptible. `docker rm` a supprimé cette couche, et l’image n’a jamais changé.'
		]
	},
	recall: {
		q: 'Quelles deux fonctions du noyau font d’un processus un conteneur, et que contrôle chacune ?',
		a: 'Les namespaces contrôlent ce que le processus voit (ses PID, son réseau, ses montages). Les cgroups contrôlent ce qu’il consomme (mémoire, CPU). Le processus tourne toujours sur le noyau de l’hôte.'
	},
	sources: [
		{ title: 'Doc Docker, What is a container?', url: 'https://docs.docker.com/get-started/docker-concepts/the-basics/what-is-a-container/' },
		{ title: 'Doc Docker, sécurité de Docker Engine', url: 'https://docs.docker.com/engine/security/' },
		{ title: 'Doc Docker, storage drivers (images, couches, couche du conteneur)', url: 'https://docs.docker.com/engine/storage/drivers/' },
		{ title: 'Page de man Linux, namespaces(7)', url: 'https://man7.org/linux/man-pages/man7/namespaces.7.html' },
		{ title: 'Page de man Linux, cgroups(7)', url: 'https://man7.org/linux/man-pages/man7/cgroups.7.html' }
	]
};
