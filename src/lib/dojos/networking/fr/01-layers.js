const LINUX = 'https://github.com/torvalds/linux/blob/70dd4ee72eb2d5793c62e71c14e3aba78e5a4e56';
const IP_H = `${LINUX}/include/uapi/linux/ip.h`;
const TCP_H = `${LINUX}/include/uapi/linux/tcp.h`;
const ETHER_H = `${LINUX}/include/uapi/linux/if_ether.h`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'layers',
	part: 'Les paquets',
	title: 'De quoi est faite une requête',
	minutes: 10,
	hook: [
		'Tu lances `curl http://example.org/` dans un conteneur et tu récupères 577 octets de HTML. `tcpdump`, dans le même conteneur, compte 12 paquets pour cet unique appel. Le paquet qui porte la requête fait 141 octets, et le `GET` écrit par curl n’en occupe que 75.',
		'Les 66 autres octets forment trois en-têtes, un par couche : 32 octets de TCP, 20 d’IP et 14 d’Ethernet. **Un routeur lit l’en-tête IP et refait l’en-tête Ethernet à chaque saut.** Le serveur lit les ports TCP pour retrouver la connexion du serveur web.',
		'Une requête qui échoue s’arrête souvent dans l’un de ces en-têtes. Une adresse IP à laquelle personne ne répond en ARP, c’est le jour 4. Une adresse sans route, le jour 3. Un port sur lequel rien n’écoute, le jour 5.'
	],
	terms: [
		{ term: 'Trame', def: 'Ce qu’Ethernet envoie : un en-tête de 14 octets avec la MAC de destination, la MAC source et un type, puis le paquet.' },
		{ term: 'Paquet', def: 'Ce qu’IP route : un en-tête d’au moins 20 octets avec les adresses IP source et destination, un TTL et un numéro de protocole, puis le segment.' },
		{ term: 'Segment', def: 'Ce que TCP envoie : un en-tête d’au moins 20 octets avec les deux ports, les numéros de séquence et les flags, puis les octets de l’application.' },
		{ term: 'TTL', def: 'Time to live : un octet de l’en-tête IP. Chaque routeur le baisse d’au moins 1 et jette le paquet quand il arrive à 0.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['curl["curl : 75 octets, GET / HTTP/1.1 puis Host, User-Agent, Accept"] --> tcp["En-tête TCP, 32 octets : port 45702 vers 80, flags PSH ACK"]'],
				highlight: ['curl', 'tcp'],
				note: 'curl écrit 75 octets dans sa socket : la ligne de requête, trois lignes d’en-tête et une ligne vide, chacune terminée par CRLF. Le noyau place un en-tête TCP devant. On y trouve les ports 45702 et 80, un numéro de séquence, les flags PSH et ACK, et 12 octets d’options d’horodatage.'
			},
			{
				add: ['tcp --> ip["En-tête IP, 20 octets : 172.17.0.5 vers 104.20.26.136, TTL 64, protocole 6"]'],
				highlight: ['ip'],
				note: 'L’en-tête IP se place devant le segment. Il porte les deux adresses, un TTL de 64 et le protocole 6, qui désigne TCP. Son champ de longueur totale vaut 127 : 20 octets d’IP, 32 de TCP et 75 de HTTP.'
			},
			{
				add: ['ip --> eth["En-tête Ethernet, 14 octets : vers la MAC ca:20:8c:72:3c:8c, type 0x0800"]'],
				highlight: ['eth'],
				note: 'La destination 104.20.26.136 n’est pas sur le réseau du conteneur, donc la trame part vers la passerelle 172.17.0.1. Sa MAC `ca:20:8c:72:3c:8c` est celle du bridge `docker0` de l’hôte. Le type `0x0800` annonce un paquet IPv4. 14 + 127 = 141 octets sortent par `eth0`.'
			},
			{
				add: ['eth -->|"141 octets sur eth0"| gw["Routeur : retire l’en-tête Ethernet, baisse le TTL, remet un en-tête Ethernet"]'],
				highlight: ['gw'],
				note: 'La RFC 1812 décrit le travail de chaque routeur : il "removes the Link Layer header a message was received with, modifies the IP header, and replaces the Link Layer header for retransmission". L’en-tête TCP et les 75 octets de HTTP ne bougent pas.'
			},
			{
				add: ['gw -->|"d’autres routeurs"| srv["Serveur 104.20.26.136 : lit les ports, passe 75 octets au serveur web"]', 'srv -->|"961 octets : HTTP/1.1 200 OK"| curl'],
				highlight: ['srv'],
				note: 'Le serveur retire les en-têtes Ethernet et IP et retrouve la connexion grâce à ses deux sockets, chacune une adresse IP plus un port. Le serveur web répond par 961 octets d’en-têtes HTTP et de HTML. Ils repartent dans trois nouveaux en-têtes.'
			}
		]
	},
	example: {
		title: 'include/uapi/linux/ip.h : struct iphdr, les 20 octets devant chaque segment TCP',
		repo: 'torvalds/linux',
		url: `${IP_H}#L87-L109`,
		lang: 'c',
		code: `struct iphdr {
#if defined(__LITTLE_ENDIAN_BITFIELD)
	__u8	ihl:4,
		version:4;
#elif defined (__BIG_ENDIAN_BITFIELD)
	__u8	version:4,
  		ihl:4;
#else
#error	"Please fix <asm/byteorder.h>"
#endif
	__u8	tos;
	__be16	tot_len;
	__be16	id;
	__be16	frag_off;
	__u8	ttl;
	__u8	protocol;
	__sum16	check;
	__struct_group(/* no tag */, addrs, /* no attrs */,
		__be32	saddr;
		__be32	daddr;
	);
	/*The options start here. */
};`,
		notes: [
			'Les lignes 2 à 10 coupent le premier octet en deux champs de 4 bits. Dans le `GET` capturé, il vaut `45` : version 4 et `ihl` 5. La RFC 791 compte `ihl` "in 32 bit words" (en mots de 32 bits), donc 5 donne 5 x 4 = 20 octets, la taille sans options.',
			'Ligne 12, `tot_len` occupe les deux octets suivants : `007f`, soit 127. Ce total couvre l’en-tête IP et tout ce qui le suit, sans les 14 octets d’Ethernet.',
			'Les lignes 15 et 16 valent `40` et `06` : un TTL de 64 et le protocole 6. Les lignes 19 et 20 valent `ac11 0005` et `6814 1a88`, qui se lisent 172.17.0.5 et 104.20.26.136. Le type `__be32` indique l’ordre réseau, octet de poids fort en premier.',
			'Après `daddr` vient l’en-tête TCP, décrit par [`struct tcphdr`](' + TCP_H + '#L25-L60). Ses quatre premiers octets, `b286 0050`, sont les ports 45702 et 80. Ensuite `doff` vaut 8 : l’en-tête TCP fait 8 x 4 = 32 octets, et l’octet de flags `18` allume ACK et PSH.'
		]
	},
	tradeoff: {
		gain: [
			'L’octet de protocole permet à IP de transporter autre chose que TCP : 6 pour TCP, 17 pour UDP. La RFC 9293 dit que ce découpage "allows for the existence of host-level protocols other than TCP".',
			'Un routeur ne réécrit que l’en-tête Ethernet et l’en-tête IP (RFC 1812). Il fait suivre une requête HTTP et une requête DNS avec le même code, sans lire ni l’une ni l’autre.'
		],
		cost: [
			'Les en-têtes prennent de la place. 66 des 141 octets du paquet `GET` sont des en-têtes, et les 7 paquets ACK et FIN de la capture font 66 octets chacun, sans aucune donnée.',
			'Sur l’appel entier, 1849 octets sont passés par `eth0` pour 1041 octets de HTTP : 75 pour la requête, puis 961 et 5 pour la réponse en chunks.'
		]
	},
	task: {
		prompt: 'Voici le deuxième paquet de la même capture, sorti de `tcpdump -e -XX`. Sans la ligne décodée, trouve : le protocole IP, les adresses source et destination, le TTL, les deux ports, la longueur de l’en-tête TCP et les flags.\n\n`0x0000:  069c f20c df7a ca20 8c72 3c8c 0800 4500`\n`0x0010:  003c da7f 4000 3406 3d8a 6814 1a88 ac11`\n`0x0020:  0005 0050 b286 e76d 93de 8da6 9128 a012`',
		hint: 'Les 14 premiers octets sont l’Ethernet. L’en-tête IP commence à `45`. L’en-tête TCP commence 20 octets plus loin, par le port source. Le data offset est dans les 4 bits hauts de l’octet 12 de l’en-tête TCP, et les flags dans l’octet 13.',
		answer: [
			'Ethernet : destination `06:9c:f2:0c:df:7a` (le conteneur), source `ca:20:8c:72:3c:8c` (la passerelle), type `0800`, IPv4.',
			'IP : `45`, donc 20 octets d’en-tête. La longueur totale `003c` vaut 60. Le TTL `34` vaut 52. Le protocole `06` est TCP. La source `6814 1a88` est 104.20.26.136, la destination `ac11 0005` est 172.17.0.5.',
			'TCP : port source `0050`, soit 80, et port de destination `b286`, soit 45702. `a0` donne un data offset de 10 mots, 40 octets. 20 + 40 = 60 : ce paquet ne porte aucune donnée.',
			'L’octet de flags `12` vaut SYN plus ACK : c’est le SYN-ACK du serveur. Le numéro d’acquittement `8da6 9128` vaut 2376503592, un de plus que le premier numéro de séquence du client, 2376503591.'
		]
	},
	quiz: [
		{
			q: '`tcpdump -e` affiche `length 141` pour une trame qui porte 75 octets de HTTP. Que sont les 66 autres octets ?',
			options: [
				'Les en-têtes Ethernet, IP et TCP : 14, 20 et 32 octets',
				'Du remplissage jusqu’à la taille minimale d’une trame Ethernet',
				'Les lignes d’en-tête Host, User-Agent et Accept de la requête',
				'L’en-tête d’enregistrement TLS et le tag de chiffrement'
			],
			answer: 0,
			why: 'Chaque couche ajoute son en-tête devant les octets qu’elle reçoit. Les lignes d’en-tête HTTP font partie des 75 octets écrits par curl, et un `http://` simple n’a pas de TLS.'
		},
		{
			q: 'Que change un simple routeur IP, tel que le décrit la RFC 1812, dans un paquet qu’il fait suivre ?',
			options: [
				'Rien : il lit l’adresse de destination et renvoie le paquet tel quel',
				'Les ports TCP, pour que la réponse retrouve son chemin',
				'L’en-tête Ethernet, et le TTL dans l’en-tête IP',
				'L’en-tête Host, pour viser le serveur suivant sur le chemin'
			],
			answer: 2,
			why: 'Un routeur retire l’en-tête de liaison, baisse le TTL d’au moins 1 et ajoute un nouvel en-tête de liaison pour le saut suivant. Il ne lit ni ne modifie TCP ou HTTP.'
		},
		{
			q: 'Le premier octet d’un en-tête IP vaut `45`. Que signifie le 5 ?',
			options: [
				'Cinq routeurs peuvent encore faire suivre le paquet avant qu’il soit jeté',
				'Le paquet a la classe de priorité 5 dans les files des routeurs',
				'Cinq champs d’options suivent l’adresse de destination',
				'L’en-tête IP fait 5 mots de 32 bits, donc 20 octets'
			],
			answer: 3,
			why: 'Les 4 bits bas forment l’IHL, la longueur de l’en-tête en mots de 32 bits. 5 est le minimum, un en-tête sans options. La limite de sauts, c’est le TTL, un autre octet.'
		}
	],
	recall: {
		q: 'Dans la trame de 141 octets qui portait le `GET` de curl, combien d’octets prend chaque couche ?',
		a: 'Ethernet 14, IP 20, TCP 32 (20 plus 12 octets d’options d’horodatage) et HTTP 75.'
	},
	sources: [
		{ title: 'RFC 791, Internet Protocol', url: 'https://www.rfc-editor.org/rfc/rfc791' },
		{ title: 'RFC 9293, Transmission Control Protocol (TCP)', url: 'https://www.rfc-editor.org/rfc/rfc9293' },
		{ title: 'RFC 1812, Requirements for IP Version 4 Routers', url: 'https://www.rfc-editor.org/rfc/rfc1812' },
		{ title: 'RFC 9112, HTTP/1.1', url: 'https://www.rfc-editor.org/rfc/rfc9112' },
		{ title: 'Source Linux, include/uapi/linux/if_ether.h (struct ethhdr)', url: `${ETHER_H}#L183-L187` },
		{ title: 'Source Linux, include/uapi/linux/in.h (IPPROTO_TCP et IPPROTO_UDP)', url: `${LINUX}/include/uapi/linux/in.h#L32-L44` },
		{ title: 'Page de manuel tcpdump(8)', url: 'https://www.tcpdump.org/manpages/tcpdump.1.html' }
	]
};
