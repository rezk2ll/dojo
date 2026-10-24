const LINUX = 'https://github.com/torvalds/linux/blob/70dd4ee72eb2d5793c62e71c14e3aba78e5a4e56';
const ARP = `${LINUX}/net/ipv4/arp.c`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'arp',
	part: 'Les paquets',
	title: 'ARP et adresses MAC',
	minutes: 10,
	hook: [
		'Trois conteneurs partagent le réseau 10.77.0.0/24. Le conteneur A a l’adresse 10.77.0.10. Quelqu’un ajoute la même adresse au conteneur B avec `ip addr add 10.77.0.10/24 dev eth0`. Après un ping de C vers 10.77.0.10, `ip neigh` sur C associe cette adresse à la MAC de B, `32:ad:ae:a5:3f:f5` : les paquets de C partent chez B.',
		'`tcpdump` sur C montre pourquoi. C a posé la question une fois, "who-has 10.77.0.10", et deux réponses sont arrivées à 1 microseconde d’écart : B d’abord, puis A. **Linux a gardé la première réponse.** Rien sur C n’a affiché d’avertissement.',
		'La RFC 5227 qualifie deux machines avec la même adresse IP de "an annoying and hard-to-diagnose problem" (un problème agaçant et difficile à diagnostiquer). `arping -D -c 2 -I eth0 10.77.0.10` le détecte : il envoie une sonde depuis 0.0.0.0, et ici il a renvoyé le code 1 parce qu’une machine a répondu.'
	],
	terms: [
		{ term: 'Adresse MAC', def: 'L’adresse matérielle de 6 octets d’une interface réseau, comme `56:2a:92:53:89:1c`. L’en-tête Ethernet porte une MAC de destination et une MAC source.' },
		{ term: 'ARP', def: 'Address Resolution Protocol (RFC 826) : une requête en broadcast "qui a cette IP" et une réponse "cette IP est à cette MAC", 28 octets chacune sur Ethernet.' },
		{ term: 'Broadcast', def: 'Une trame envoyée à `ff:ff:ff:ff:ff:ff`, que reçoit chaque machine du réseau local.' },
		{ term: 'Table des voisins', def: 'Le cache du noyau qui associe IP et MAC d’après ARP, affiché par `ip neigh`, avec un état comme `REACHABLE` ou `STALE` sur chaque entrée.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['C["C 10.77.0.30 : ping 10.77.0.10"] --> tbl["Table des voisins : rien pour 10.77.0.10"]'],
				highlight: ['C', 'tbl'],
				note: 'La route vers 10.77.0.10 n’a pas de `via` : C doit envoyer la trame directement à cette machine. Pour écrire l’en-tête Ethernet, il lui faut la MAC de 10.77.0.10. Après `ip neigh flush all`, la table de C est vide.'
			},
			{
				add: ['C -->|"vers ff:ff:ff:ff:ff:ff : who-has 10.77.0.10 tell 10.77.0.30"| A["A 10.77.0.10, MAC 56:2a:92:53:89:1c"]'],
				highlight: ['C', 'A'],
				note: 'C envoie une requête ARP en broadcast : une trame de 42 octets, 14 d’Ethernet et 28 d’ARP, de type `0x0806`. Elle porte la MAC et l’IP de C, et l’IP recherchée. Le champ MAC cible est à zéro, puisque C ne la connaît pas encore.'
			},
			{
				add: ['A -->|"vers C seul : 10.77.0.10 is-at 56:2a:92:53:89:1c"| C'],
				highlight: ['A'],
				note: 'A voit sa propre adresse dans le champ cible et répond à la seule MAC de C, 73 microsecondes plus tard dans la capture. A garde aussi la MAC de C tirée de la requête. La RFC 826 le justifie : "if A has some reason to talk to B, then B will probably have some reason to talk to A".'
			},
			{
				add: ['C --> state["ip neigh : 10.77.0.10 lladdr 56:2a:92:53:89:1c REACHABLE"]'],
				highlight: ['state'],
				note: 'C enregistre la réponse, et `ip neigh` affiche `REACHABLE`. 40 secondes plus tard, sans nouveau trafic, la même entrée passe à `STALE`, que la page de manuel définit comme "valid but suspicious" (valide mais suspecte). Le `reachable_time` par défaut dans `arp.c` est de 30 secondes.'
			},
			{
				add: ['B["B a aussi 10.77.0.10, MAC 32:ad:ae:a5:3f:f5"] -->|"réponse 1"| C', 'A -.->|"réponse 2, 1 µs plus tard"| C'],
				highlight: ['B'],
				note: 'Avec l’adresse en double, une requête reçoit deux réponses. B a répondu à `.158318`, A à `.158319`. C a gardé la MAC de B, donc ses trames pour 10.77.0.10 partent chez B. `arping -c 3` lancé sur C a affiché `Received 4 response(s)` pour 3 sondes, venues de deux MAC différentes.'
			}
		]
	},
	example: {
		title: 'net/ipv4/arp.c : arp_process, répondre à une requête et garder la première réponse',
		repo: 'torvalds/linux',
		url: `${ARP}#L840-L939`,
		lang: 'c',
		code: `	if (arp->ar_op == htons(ARPOP_REQUEST) &&
	    ip_route_input_noref(skb, tip, sip, 0, dev) == 0) {

		rt = skb_rtable(skb);
		addr_type = rt->rt_type;

		if (addr_type == RTN_LOCAL) {
			int dont_send;

			dont_send = arp_ignore(in_dev, sip, tip);
			if (!dont_send && IN_DEV_ARPFILTER(in_dev))
				dont_send = arp_filter(sip, tip, dev);
			if (!dont_send) {
				n = neigh_event_ns(&arp_tbl, sha, &sip, dev);
				if (n) {
					arp_send_dst(ARPOP_REPLY, ETH_P_ARP,
						     sip, dev, tip, sha,
						     dev->dev_addr, sha,
						     reply_dst);
					neigh_release(n);
				}
			}
			goto out_consume_skb;
…
	if (n) {
		int state = NUD_REACHABLE;
		int override;

		/* If several different ARP replies follows back-to-back,
		   use the FIRST one. It is possible, if several proxy
		   agents are active. Taking the first reply prevents
		   arp trashing and chooses the fastest router.
		 */
		override = time_after(jiffies,
				      n->updated +
				      NEIGH_VAR(n->parms, LOCKTIME)) ||
			   is_garp;

		/* Broadcast replies and request packets
		   do not assert neighbour reachability.
		 */
		if (arp->ar_op != htons(ARPOP_REPLY) ||
		    skb->pkt_type != PACKET_HOST)
			state = NUD_STALE;
		neigh_update(n, sha, state,
			     override ? NEIGH_UPDATE_F_OVERRIDE : 0, 0);
		neigh_release(n);
	}`,
		notes: [
			'La ligne 7 vérifie que l’IP cible `tip` est l’une des adresses de cette machine. Sur B, après `ip addr add 10.77.0.10/24`, c’est le cas : B répond donc comme A.',
			'La ligne 14 enregistre la MAC du demandeur, `sha`, pour son IP `sip`, avant de répondre. Les lignes 16 à 19 renvoient un `ARPOP_REPLY` à `sha`, avec la MAC de l’interface, `dev->dev_addr`, comme réponse.',
			'Les lignes 34 à 37 n’activent `override` que si plus de `LOCKTIME` s’est écoulé depuis la dernière modification de l’entrée. La [valeur par défaut](' + ARP + '#L177) est `1 * HZ`, une seconde. Une seconde réponse arrivée 1 microseconde après ne peut pas remplacer la première MAC.',
			'Les lignes 42 à 44 marquent l’entrée `STALE` au lieu de `REACHABLE` quand le paquet est une requête ou un broadcast. Le commentaire des lignes 39 et 40 : "Broadcast replies and request packets do not assert neighbour reachability."'
		]
	},
	tradeoff: {
		gain: [
			'Aucune configuration : C a appris la MAC de A avec une requête et une réponse, à 73 microsecondes d’écart.',
			'A a gardé la MAC de C à partir de la requête elle-même, donc il peut répondre au ping de C sans demander d’abord la MAC de C.'
		],
		cost: [
			'N’importe quelle machine du lien peut répondre pour n’importe quelle adresse. Le paquet ARP n’a aucun champ qui prouve à qui appartient l’IP, et C a accepté la réponse de B pour l’adresse de A.',
			'Chaque requête est un broadcast : toutes les machines du réseau reçoivent la trame envoyée à `ff:ff:ff:ff:ff:ff` et regardent dedans.'
		]
	},
	task: {
		prompt: 'Voici la première trame ARP envoyée par C, sortie de `tcpdump -e -XX`. Décode les 28 octets d’ARP qui suivent les 14 octets d’en-tête Ethernet : type de matériel, type de protocole, longueurs d’adresse, opération et les quatre adresses.\n\n`0x0000:  ffff ffff ffff c201 a766 6b1b 0806 0001`\n`0x0010:  0800 0604 0001 c201 a766 6b1b 0a4d 001e`\n`0x0020:  0000 0000 0000 0a4d 000a`',
		hint: 'Suis l’ordre des champs de la RFC 826 ou de `struct arphdr` : 2 octets de type de matériel, 2 octets de type de protocole, 1 octet pour chaque longueur, 2 octets d’opcode, puis MAC de l’émetteur, IP de l’émetteur, MAC cible, IP cible.',
		answer: [
			'Ethernet : destination `ff:ff:ff:ff:ff:ff` (broadcast), source `c2:01:a7:66:6b:1b`, type `0806`, ARP.',
			'`0001` : matériel de type 1, Ethernet. `0800` : protocole IPv4. `06` et `04` : une MAC fait 6 octets, une adresse IPv4 en fait 4. `0001` : opcode 1, une requête. Une réponse porte `0002`.',
			'MAC de l’émetteur `c2:01:a7:66:6b:1b`, IP de l’émetteur `0a4d 001e` = 10.77.0.30. MAC cible à zéro, car C ne la connaît pas. IP cible `0a4d 000a` = 10.77.0.10.',
			'14 + 28 = 42 octets : le `length 42` que tcpdump affiche pour chaque trame ARP de ce réseau.'
		],
		steps: [
			{
				title: 'Lis l’en-tête Ethernet',
				questions: [
					{ q: 'La MAC de destination vaut `ffff ffff ffff`. Qu’est-ce que ça veut dire ?', options: ['Broadcast : chaque machine du lien reçoit la trame', 'La cible est inconnue et sera remplie plus tard', 'La trame part vers la passerelle par défaut', 'La capture a perdu ces octets'], answer: 0, why: '`ff:ff:ff:ff:ff:ff` est l’adresse de broadcast. C ne sait pas à qui appartient l’IP, donc il demande à tout le monde.' },
					{ q: 'Quelle MAC est la source ?', options: ['`ff:ff:ff:ff:ff:ff`', '`c2:01:a7:66:6b:1b`, la MAC de C', '`08:06:00:01:08:00`', 'La MAC de 10.77.0.10'], answer: 1, why: 'La MAC source suit la destination : les six octets `c201 a766 6b1b`, l’interface de C.' },
					{ q: 'Le type vaut `0806`. Qu’est-ce qui suit ?', options: ['Un paquet IPv4', 'Une trame de 2054 octets', 'Un message ARP', 'Un segment TCP'], answer: 2, why: '`0x0806` est le type d’ARP. IPv4 serait `0x0800`.' },
					{ q: 'Où commencent les 28 octets d’ARP ?', options: ['Au premier `ffff`', 'À `0800` sur la deuxième ligne', 'Au premier `0a4d`', 'Au `0001` juste après `0806`'], answer: 3, why: 'L’en-tête Ethernet finit par le type sur 2 octets, donc ARP commence à l’octet 14.' }
				]
			},
			{
				title: 'Décode les champs fixes',
				questions: [
					{ q: 'Le premier champ ARP vaut `0001`. Qu’est-ce que c’est ?', options: ['Le type de matériel 1, Ethernet', 'L’opcode 1, une requête', 'Le protocole IPv4', 'La version 1 d’ARP'], answer: 0, why: 'La RFC 826 commence par le type de matériel, et 1 veut dire Ethernet. L’opcode vient plus loin et vaut aussi `0001`.' },
					{ q: 'Vient ensuite `0800`. Que dit ce champ ?', options: ['Le type Ethernet, répété', 'L’adresse cherchée est une adresse IPv4', '2048 octets d’ARP suivent', 'La réponse doit aller au port 2048'], answer: 1, why: 'Le type de protocole reprend la valeur du type Ethernet d’IPv4 : C cherche à résoudre une adresse IPv4.' },
					{ q: 'Puis `06` et `04`. Que sont-ils ?', options: ['6 adresses suivent, dont 4 en IPv4', 'La version 6.4 d’ARP', 'Une MAC fait 6 octets et une adresse IPv4 en fait 4', 'Six essais, à quatre secondes d’écart'], answer: 2, why: 'Ce sont les longueurs des adresses matérielle et protocole, pour que le destinataire sache où finit chaque adresse.' },
					{ q: 'L’opcode vaut `0001`. Quel genre de message est-ce ?', options: ['Une réponse', 'Une annonce gratuite', 'Le premier renvoi d’une requête', 'Une requête'], answer: 3, why: 'L’opcode 1 est une requête et 2 une réponse.' }
				]
			},
			{
				title: 'Décode les quatre adresses',
				questions: [
					{ q: 'Quelle est la MAC de l’émetteur ?', options: ['`c2:01:a7:66:6b:1b`', '`ff:ff:ff:ff:ff:ff`', '`00:00:00:00:00:00`', '`0a:4d:00:1e:00:00`'], answer: 0, why: 'Elle répète la source Ethernet : C met sa propre MAC dans la requête.' },
					{ q: 'L’IP de l’émetteur vaut `0a4d 001e`. Quelle adresse est-ce ?', options: ['10.77.0.10', '10.77.0.30', '10.77.0.1', '10.77.1.30'], answer: 1, why: '`0a` vaut 10, `4d` vaut 77, `00` vaut 0 et `1e` vaut 30 : l’adresse de C.' },
					{ q: 'Pourquoi la MAC cible est-elle à zéro ?', options: ['Les zéros sont une autre façon d’écrire broadcast', 'La machine cible est éteinte', 'La capture a coupé ces octets', 'C ne la connaît pas encore : c’est ce qu’il demande'], answer: 3, why: 'La requête porte l’IP cherchée et laisse la MAC vide. La réponse la remplit.' },
					{ q: 'L’IP cible vaut `0a4d 000a`. Quelle adresse est-ce ?', options: ['10.77.0.30', '10.77.0.0', '10.77.0.10', '10.77.0.255'], answer: 2, why: '`0a` vaut 10 dans le dernier octet : C cherche 10.77.0.10.' }
				]
			},
			{
				title: 'Vérifie la taille et la réponse',
				questions: [
					{ q: 'Combien mesure la trame entière ?', options: ['28 octets, tout en ARP', '64 octets, avec du remplissage', '42 octets : 14 d’Ethernet et 28 d’ARP', '48 octets : 20 d’IP et 28 d’ARP'], answer: 2, why: 'ARP vient juste après Ethernet, sans en-tête IP. tcpdump affiche `length 42`.' },
					{ q: 'Qui répond à cette requête, et vers quelle MAC ?', options: ['A, uniquement vers la MAC de C', 'A, vers l’adresse de broadcast', 'Toutes les machines du réseau', 'La passerelle, à la place de A'], answer: 0, why: 'A voit sa propre adresse dans le champ cible et répond à la MAC de l’émetteur de la requête.' },
					{ q: 'Quel opcode porte la réponse ?', options: ['`0001`', '`0002`', '`0806`', '`0800`'], answer: 1, why: 'Une réponse a l’opcode 2.' },
					{ q: 'B a aussi 10.77.0.10 et sa réponse arrive en premier. Que garde C ?', options: ['La MAC de A, car A avait l’adresse avant', 'Les deux MAC, en alternant', 'Rien : l’entrée passe à `FAILED`', 'La MAC de B, donc ses trames pour 10.77.0.10 vont à B'], answer: 3, why: 'Linux garde la première réponse, et une seconde dans le délai de `LOCKTIME` ne peut pas l’écraser. ARP n’a aucun champ qui prouve à qui appartient l’IP.' }
				]
			}
		]
	},
	quiz: [
		{
			q: '`ip neigh` affiche `10.0.0.7 dev eth0 INCOMPLETE`. Qu’est-ce que ça veut dire ?',
			options: [
				'Des requêtes ARP sont parties pour 10.0.0.7 et aucune réponse n’est revenue',
				'La MAC de 10.0.0.7 est connue, mais la machine répond lentement',
				'Aucune route n’existe vers 10.0.0.7, donc le noyau a abandonné',
				'L’entrée a été posée à la main et n’expire jamais'
			],
			answer: 0,
			why: 'La page de manuel ip-neighbour : une entrée incomplete "has not (yet) been validated/resolved". Le noyau attend une réponse ARP. Si les sondes s’épuisent sans réponse, le noyau passe l’état à `FAILED`.'
		},
		{
			q: 'Quelle MAC de destination une requête ARP utilise-t-elle ?',
			options: [
				'La MAC de la passerelle par défaut',
				'`ff:ff:ff:ff:ff:ff`, l’adresse de broadcast',
				'Que des zéros, car la cible est inconnue',
				'La MAC de la dernière entrée de la table des voisins'
			],
			answer: 1,
			why: 'L’émetteur ne sait pas à qui appartient l’IP, donc la requête part vers toutes les machines du lien. La valeur à zéro va dans le champ MAC cible du paquet ARP, et l’en-tête Ethernet porte l’adresse de broadcast.'
		},
		{
			q: 'Deux machines répondent à la même requête ARP, à 1 microseconde d’écart. Quelle MAC un client Linux garde-t-il ?',
			options: [
				'La seconde, car une réponse plus récente remplace toujours l’entrée',
				'Aucune : le noyau marque l’entrée `FAILED` tant que les deux répondent',
				'Les deux, et le noyau alterne les trames entre les deux MAC',
				'La première : une réponse dans la seconde ne peut pas l’écraser'
			],
			answer: 3,
			why: '`arp_process` n’active `override` qu’une fois `LOCKTIME` (1 seconde par défaut) écoulé depuis la dernière mise à jour. Le commentaire dit : "If several different ARP replies follows back-to-back, use the FIRST one."'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Capturer un vrai échange ARP, le décoder à la main, puis créer une adresse en double et voir qui gagne.',
		steps: [
			'Crée un réseau et trois conteneurs qui ont le droit de changer leurs adresses : `docker network create --subnet 10.77.0.0/24 arplab`, puis `for n in a b c; do docker run -d --name arp-$n --network arplab --cap-add NET_ADMIN nicolaka/netshoot:v0.13 sleep infinity; done`.',
			'Vérifie les adresses avec `for n in a b c; do docker exec arp-$n ip -br addr show eth0; done`. La suite suppose que A a reçu 10.77.0.2 et C 10.77.0.4 ; prends les tiennes si elles diffèrent.',
			'Depuis C, vide la table des voisins, capture l’ARP entre C et A, et ping A : `docker exec arp-c sh -c "ip neigh flush all; tcpdump -i eth0 -n -e -XX -c 2 arp host 10.77.0.2 and arp host 10.77.0.4 & sleep 1; ping -c1 10.77.0.2 >/dev/null; wait; ip neigh"`.',
			'Décode à la main les 28 octets d’ARP de la requête, comme dans l’exercice, puis la réponse de la même façon.',
			'Donne à B la même adresse que A, et redemande : `docker exec arp-b ip addr add 10.77.0.2/24 dev eth0`, puis `docker exec arp-c sh -c "ip neigh flush all; timeout 3 tcpdump -i eth0 -n arp host 10.77.0.2 and arp host 10.77.0.4 & sleep 1; ping -c1 -W1 10.77.0.2 >/dev/null; wait; ip neigh"`.',
			'Lance le test de conflit de l’accroche : `docker exec arp-c arping -D -c 2 -I eth0 10.77.0.2; echo $?`. Puis nettoie : `docker rm -f arp-a arp-b arp-c && docker network rm arplab`.'
		],
		done: [
			'La requête fait 42 octets, porte l’opcode `0001` et une MAC cible à zéro. La réponse porte l’opcode `0002`.',
			'Après l’étape 5, tcpdump affiche une ligne `who-has` et deux lignes `is-at` avec deux MAC différentes.',
			'`ip neigh` sur C garde la MAC de la première ligne `is-at`.',
			'`arping -D` sort avec le code `1`.'
		],
		solution: [
			'Requête : `0001 0800 0604 0001`, puis la MAC de C et `0a4d 0004` (10.77.0.4), six octets à zéro, puis `0a4d 0002` (10.77.0.2).',
			'Réponse : la même structure avec l’opcode `0002`, la MAC et l’IP de A comme émetteur, et la MAC et l’IP de C comme cible. Elle part vers la MAC de C, pas vers l’adresse de broadcast.',
			'Avec deux propriétaires, les deux noyaux répondent, et C garde la première réponse, car une seconde dans le délai de `LOCKTIME` ne peut pas l’écraser. Le conteneur qui répond en premier peut changer d’un essai à l’autre.',
			'`arping -D` envoie sa sonde depuis 0.0.0.0 et sort avec 1 parce qu’une machine a répondu : l’adresse est déjà prise.'
		]
	},
	recall: {
		q: 'Comment une machine trouve-t-elle la MAC de 10.77.0.10 sur son propre réseau, et où garde-t-elle la réponse ?',
		a: 'Elle envoie une requête ARP en broadcast à `ff:ff:ff:ff:ff:ff`, le propriétaire répond avec sa MAC, et le noyau la range dans la table des voisins affichée par `ip neigh`, d’abord en `REACHABLE`, puis en `STALE`.'
	},
	sources: [
		{ title: 'RFC 826, An Ethernet Address Resolution Protocol', url: 'https://www.rfc-editor.org/rfc/rfc826' },
		{ title: 'RFC 5227, IPv4 Address Conflict Detection', url: 'https://www.rfc-editor.org/rfc/rfc5227' },
		{ title: 'Page de manuel ip-neighbour(8)', url: 'https://man7.org/linux/man-pages/man8/ip-neighbour.8.html' },
		{ title: 'Page de manuel arping(8)', url: 'https://man7.org/linux/man-pages/man8/arping.8.html' },
		{ title: 'Source Linux, include/uapi/linux/if_arp.h (struct arphdr)', url: `${LINUX}/include/uapi/linux/if_arp.h#L145-L162` }
	]
};
