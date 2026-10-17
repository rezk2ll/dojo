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
