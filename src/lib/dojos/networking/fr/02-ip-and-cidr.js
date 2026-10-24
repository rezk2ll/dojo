const GO = 'https://github.com/golang/go/blob/c3a068eec992b5ae783abce1a9d03f617b671ea2';
const NETIP = `${GO}/src/net/netip/netip.go`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'ip-and-cidr',
	part: 'Les paquets',
	title: 'Adresses IP et CIDR',
	minutes: 10,
	hook: [
		'Tu crées un subnet AWS `10.0.0.0/28` pour quelques machines de build. Un `/28` contient 16 adresses, mais seules 11 peuvent aller à des instances. La doc AWS : "The first four IP addresses and the last IP address in each subnet CIDR block are not available for your use".',
		'Le 16 vient du `/28`. Une adresse IPv4 fait 32 bits, et les 28 premiers désignent le réseau. **Les 4 bits restants numérotent les machines : 2^4 = 16.** Un `/24` laisse 8 bits, soit 256 adresses, et un `/16` en laisse 16, soit 65 536.',
		'La RFC 1918 réserve trois préfixes aux réseaux privés : `10/8`, `172.16/12` et `192.168/16`. `172.16/12` va de 172.16.0.0 à 172.31.255.255. Le 172.17.0.0/16 par défaut de Docker est donc privé, alors que 172.32.0.1 est une adresse publique.'
	],
	terms: [
		{ term: 'Préfixe', def: 'Une adresse suivie d’une barre oblique et d’un nombre de 0 à 32, comme `10.0.0.0/28`. Le nombre dit combien de bits de tête désignent le réseau. On appelle cette notation CIDR.' },
		{ term: 'Bits d’hôte', def: 'Les bits qui suivent la longueur du préfixe. Avec n bits d’hôte, le préfixe contient 2^n adresses.' },
		{ term: 'Adresse réseau', def: 'La première adresse d’un préfixe, avec tous les bits d’hôte à 0. `100.68.0.18/18` et `100.68.0.0/18` désignent le même réseau.' },
		{ term: 'Adresse privée', def: 'Une adresse dans l’un des trois blocs de la RFC 1918. Les routeurs d’internet sont censés rejeter les routes vers ces blocs, ce qui permet à chaque entreprise de réutiliser les mêmes.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['host["eth0 du conteneur : 172.17.0.5/16"] --> mask["16 bits de réseau : 172.17, 16 bits d’hôte : 0.5"]'],
				highlight: ['host', 'mask'],
				note: 'Dans un conteneur Docker, `ip addr` affiche `inet 172.17.0.5/16`. Les 16 premiers bits, 172.17, désignent le réseau. Les 16 derniers numérotent cette machine. Le réseau compte 2^16 = 65 536 adresses, de 172.17.0.0 à 172.17.255.255.'
			},
			{
				add: ['mask -->|"vers 172.17.200.9"| same["16 premiers bits égaux : 172.17 = 172.17"]', 'same --> direct["Envoyé directement par eth0"]'],
				highlight: ['same', 'direct'],
				note: 'Pour 172.17.200.9, le noyau compare les 16 premiers bits avec les siens : des deux côtés, 172.17. `ip route get 172.17.200.9` affiche `dev eth0 src 172.17.0.5`, sans `via`. Le paquet part directement vers cette machine du réseau local.'
			},
			{
				add: ['mask -->|"vers 172.18.0.1"| diff["16 premiers bits différents : 172.18 n’est pas 172.17"]', 'diff --> gw["Envoyé à la passerelle 172.17.0.1"]'],
				highlight: ['diff', 'gw'],
				note: 'Pour 172.18.0.1, le deuxième octet change, donc l’adresse est hors du `/16`. `ip route get 172.18.0.1` affiche `via 172.17.0.1 dev eth0`. Le paquet part vers la passerelle, qui sait où l’envoyer ensuite (jour 3).'
			},
			{
				add: ['wide["Même machine avec un masque /12 : 172.16.0.0 à 172.31.255.255"] -.->|"vers 172.18.0.1"| wrong["Semble local : pas de passerelle, personne ne répond"]'],
				highlight: ['wide', 'wrong'],
				note: 'Avec une longueur de préfixe trop courte, plus d’adresses paraissent locales. Un `/12` place 172.18.0.1 dans le réseau de la machine, qui essaierait alors de la joindre directement sur `eth0` au lieu de passer par la passerelle. Si cette machine se trouve derrière un routeur, le paquet n’arrive jamais.'
			}
		]
	},
	example: {
		title: 'src/net/netip/netip.go : Prefix.Contains, un test de préfixe en un XOR et un décalage',
		repo: 'golang/go',
		url: `${NETIP}#L1417-L1447`,
		lang: 'go',
		code: `// Contains reports whether the network p includes ip.
//
// An IPv4 address will not match an IPv6 prefix.
// An IPv4-mapped IPv6 address will not match an IPv4 prefix.
// A zero-value IP will not match any prefix.
// If ip has an IPv6 zone, Contains returns false,
// because Prefixes strip zones.
func (p Prefix) Contains(ip Addr) bool {
	if !p.IsValid() || ip.hasZone() {
		return false
	}
	if f1, f2 := p.ip.BitLen(), ip.BitLen(); f1 == 0 || f2 == 0 || f1 != f2 {
		return false
	}
	if ip.Is4() {
		// xor the IP addresses together; mismatched bits are now ones.
		// Shift away the number of bits we don't care about.
		// Shifts in Go are more efficient if the compiler can prove
		// that the shift amount is smaller than the width of the shifted type (64 here).
		// We know that p.bits is in the range 0..32 because p is Valid;
		// the compiler doesn't know that, so mask with 63 to help it.
		// Now truncate to 32 bits, because this is IPv4.
		// If all the bits we care about are equal, the result will be zero.
		return uint32((ip.addr.lo^p.ip.addr.lo)>>((32-p.Bits())&63)) == 0
	} else {
		// xor the IP addresses together.
		// Mask away the bits we don't care about.
		// If all the bits we care about are equal, the result will be zero.
		return ip.addr.xor(p.ip.addr).and(mask6(p.Bits())).isZero()
	}
}`,
		notes: [
			'La ligne 12 renvoie false quand les deux longueurs en bits diffèrent : une adresse IPv4 (32 bits) ne correspond jamais à un préfixe IPv6 (128 bits), pas même `::ffff:172.17.0.5`, comme le dit la ligne 4.',
			'La ligne 24 fait un XOR entre l’adresse et le préfixe, ce qui met à 1 chaque bit différent, puis décale pour jeter les bits d’hôte. Pour `172.16.0.0/12` et 172.31.255.9, le XOR vaut `0x000FFF09`. Un décalage de 32 - 12 = 20 bits vers la droite donne 0 : l’adresse est dedans.',
			'Pour 172.32.0.1, le XOR vaut `0x00300001`, car 32 XOR 16 donne 48, soit `0x30`. Après le décalage de 20 bits, il reste 3. Tout résultat autre que 0 place l’adresse dehors. Un programme de test sous Go 1.24 affiche `172.16.0.0/12 Contains 172.32.0.1 false`.',
			'Le décalage jette aussi les bits d’hôte gardés dans le préfixe. `netip.MustParsePrefix("100.68.0.18/18")` garde le `.18`, contient toujours 100.68.63.255 mais pas 100.68.64.0, et son [`Masked()`](' + NETIP + '#L1408-L1415) vaut `100.68.0.0/18`. AWS réécrit un subnet donné en 100.68.0.18/18 sous cette même forme canonique.'
		]
	},
	tradeoff: {
		gain: [
			'Un préfixe peut avoir n’importe quelle taille en puissance de deux. La RFC 4632 : les préfixes "may be defined to describe any power of two-sized block of between one and 2^32 end system addresses".',
			'Savoir si une adresse est dans un préfixe coûte un XOR et un décalage (ligne 24), quelle que soit la longueur du préfixe.'
		],
		cost: [
			'Une équipe qui a besoin de 300 adresses reçoit un `/23` de 512, car un `/24` n’en contient que 256 et aucune taille n’existe entre les deux.',
			'Toutes les entreprises peuvent prendre les mêmes blocs RFC 1918. Quand deux d’entre elles relient leurs réseaux, la RFC 1918 prévient : "there is a risk that address uniqueness would be violated". Elle conseille de tirer les sous-blocs au hasard pour réduire ce risque.'
		]
	},
	task: {
		prompt: 'Ton équipe reçoit `10.20.0.0/20` pour des nœuds Kubernetes sur AWS. Combien d’adresses contient-il, et quelle est la dernière ? `10.20.17.4` en fait-il partie ? Découpe-le en quatre subnets égaux, un par zone de disponibilité, et donne le nombre d’adresses qu’AWS laisse utilisables dans chacun.',
		hint: 'Un `/20` laisse 12 bits d’hôte. Dans le troisième octet, le réseau prend les 4 bits du haut : il avance donc par pas de 16. Quatre parts égales demandent 2 bits de réseau de plus.',
		answer: [
			'32 - 20 = 12 bits d’hôte, donc 2^12 = 4096 adresses : de 10.20.0.0 à 10.20.15.255.',
			'`10.20.17.4` est dehors : son troisième octet, 17, dépasse 15. Il appartient au `/20` suivant, 10.20.16.0/20.',
			'Quatre parts demandent 2 bits de plus, donc quatre `/22` : 10.20.0.0/22, 10.20.4.0/22, 10.20.8.0/22 et 10.20.12.0/22, de 1024 adresses chacun.',
			'AWS réserve 5 adresses par subnet (les quatre premières et la dernière), donc chaque `/22` laisse 1024 - 5 = 1019 adresses pour les nœuds.'
		],
		steps: [
			{
				title: 'Compte les adresses',
				questions: [
					{ q: 'Combien de bits d’hôte laisse un `/20` ?', options: ['20', '8', '12', '16'], answer: 2, why: 'Une adresse IPv4 fait 32 bits, et 32 - 20 = 12 restent pour numéroter les machines.' },
					{ q: 'Combien d’adresses contient `10.20.0.0/20` ?', options: ['1024', '4096', '2048', '65 536'], answer: 1, why: 'Avec 12 bits d’hôte, le préfixe contient 2^12 = 4096 adresses.' },
					{ q: 'Dans le troisième octet, comment avancent les blocs `/20` ?', options: ['Par pas de 16 : 0, 16, 32, etc.', 'Par pas de 20 : 0, 20, 40, etc.', 'Par pas de 4 : 0, 4, 8, etc.', 'Par pas de 8 : 0, 8, 16, etc.'], answer: 0, why: 'Le réseau prend les 4 bits du haut du troisième octet. Les 4 bits du bas comptent de 0 à 15, donc un nouveau bloc commence tous les 16.' },
					{ q: 'Quelle est la dernière adresse de `10.20.0.0/20` ?', options: ['10.20.0.255', '10.20.20.255', '10.20.255.255', '10.20.15.255'], answer: 3, why: 'Le troisième octet va de 0 à 15 dans ce bloc, et la dernière adresse a tous ses bits d’hôte à 1.' }
				]
			},
			{
				title: 'Teste 10.20.17.4',
				questions: [
					{ q: '`10.20.17.4` est-il dans `10.20.0.0/20` ?', options: ['Oui : il commence par 10.20', 'Non : son troisième octet, 17, dépasse 15', 'Oui : le bloc couvre tout 10.20', 'Non : ce n’est pas une adresse privée'], answer: 1, why: 'Le bloc s’arrête à 10.20.15.255. Les deux premiers octets ne suffisent pas quand le préfixe mord sur le troisième.' },
					{ q: 'Quel `/20` contient `10.20.17.4` ?', options: ['10.20.17.0/20', '10.20.0.0/20', '10.20.16.0/20', '10.20.32.0/20'], answer: 2, why: 'Les blocs `/20` commencent aux multiples de 16 dans le troisième octet, et 17 tombe entre 16 et 31.' },
					{ q: 'Un nœud en `10.20.0.5/20` envoie un paquet à `10.20.17.4`. Où part-il ?', options: ['À la passerelle du nœud, car l’adresse est hors de son `/20`', 'Directement par `eth0`, car les deux premiers octets sont les mêmes', 'Nulle part : le noyau le refuse', 'Directement, car les deux adresses sont privées'], answer: 0, why: 'Le noyau envoie à la passerelle tout paquet hors de son propre préfixe. Seul le préfixe du nœud décide.' },
					{ q: 'Selon la RFC 1918, `10.20.17.4` est-elle privée ?', options: ['Non : seules les adresses en 192.168 sont privées', 'Non : 10.20 appartient à AWS', 'Oui : toute adresse donnée par AWS est privée', 'Oui : elle est dans `10/8`'], answer: 3, why: 'La RFC 1918 réserve `10/8`, `172.16/12` et `192.168/16`. Tout ce qui commence par 10 est dans le premier.' }
				]
			},
			{
				title: 'Découpe-le en quatre',
				questions: [
					{ q: 'Combien de bits de réseau en plus faut-il pour quatre parts égales ?', options: ['1', '4', '2', '3'], answer: 2, why: '2 bits donnent 2^2 = 4 combinaisons, une par part.' },
					{ q: 'Quelle longueur de préfixe reçoit chaque part ?', options: ['`/24`', '`/22`', '`/18`', '`/21`'], answer: 1, why: '20 + 2 = 22. Un préfixe plus long donne un bloc plus petit, donc `/18` part dans le mauvais sens.' },
					{ q: 'Combien d’adresses contient chaque part ?', options: ['1024', '512', '256', '2048'], answer: 0, why: 'Un `/22` laisse 32 - 22 = 10 bits d’hôte, et 2^10 = 1024. Quatre font les 4096.' },
					{ q: 'Quelle liste donne les quatre subnets ?', options: ['10.20.0.0/22, 10.20.1.0/22, 10.20.2.0/22, 10.20.3.0/22', '10.20.0.0/22, 10.20.16.0/22, 10.20.32.0/22, 10.20.48.0/22', '10.20.0.0/22, 10.20.64.0/22, 10.20.128.0/22, 10.20.192.0/22', '10.20.0.0/22, 10.20.4.0/22, 10.20.8.0/22, 10.20.12.0/22'], answer: 3, why: 'Chaque `/22` couvre 4 valeurs du troisième octet, donc les débuts avancent de 4 et le dernier finit à 10.20.15.255.' }
				]
			},
			{
				title: 'Applique la réserve d’AWS',
				questions: [
					{ q: 'Combien d’adresses AWS garde-t-il dans chaque subnet ?', options: ['1, l’adresse réseau', '2, la première et la dernière', '5, les quatre premières et la dernière', '4, les quatre premières'], answer: 2, why: 'La doc AWS : "The first four IP addresses and the last IP address in each subnet CIDR block are not available for your use".' },
					{ q: 'Combien d’adresses restent pour les nœuds dans chaque `/22` ?', options: ['1024', '1019', '1022', '1020'], answer: 1, why: '1024 - 5 = 1019.' },
					{ q: 'Combien d’adresses de nœuds donnent les quatre subnets au total ?', options: ['4076', '4096', '4091', '4080'], answer: 0, why: '4 × 1019 = 4076.' },
					{ q: 'Pourquoi le découpage coûte-t-il des adresses par rapport à un seul grand subnet ?', options: ['Un `/22` ne peut pas utiliser sa propre adresse réseau', 'Kubernetes garde une adresse par zone', 'Les subnets doivent laisser un trou entre eux', 'Chaque subnet perd ses propres 5 adresses réservées'], answer: 3, why: 'La réserve s’applique par subnet : un `/20` en perd 5, quatre `/22` en perdent 20.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Combien d’adresses contient un `/26` ?',
			options: ['26', '64', '256', '1024'],
			answer: 1,
			why: 'Un `/26` prend 26 des 32 bits pour le réseau et laisse 6 bits d’hôte. 2^6 = 64 adresses.'
		},
		{
			q: 'Laquelle de ces adresses est privée selon la RFC 1918 ?',
			options: ['172.32.0.10', '192.169.1.1', '172.31.200.4', '11.0.0.1'],
			answer: 2,
			why: '`172.16/12` fixe les 4 bits hauts du deuxième octet, donc il couvre 172.16 à 172.31. 172.32 est la première valeur au-delà, 192.169 sort de `192.168/16`, et 11 sort de `10/8`.'
		},
		{
			q: 'Une machine est configurée en `192.168.1.73/24`. Où envoie-t-elle un paquet pour `192.168.2.10` ?',
			options: [
				'Directement par son interface, car les deux adresses sont privées',
				'À sa passerelle, car le troisième octet diffère du sien',
				'Nulle part : le noyau refuse les destinations privées hors de son /24',
				'Directement, car les deux premiers octets sont les mêmes'
			],
			answer: 1,
			why: 'Avec `/24`, les 3 premiers octets désignent le réseau, et 192.168.2 n’est pas 192.168.1. Le noyau envoie à la passerelle tout paquet hors de son propre préfixe. Le bloc RFC 1918 ne joue aucun rôle dans ce choix, seul le `/24` de la machine compte.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Vérifier les calculs de subnets de l’exercice avec Python, puis voir le noyau utiliser un préfixe pour choisir entre l’envoi direct et la passerelle.',
		steps: [
			'Compte et découpe le bloc : `python3 -c \'import ipaddress as ip; n = ip.ip_network("10.20.0.0/20"); print(n.num_addresses, n[-1], ip.ip_address("10.20.17.4") in n); [print(s, s.num_addresses - 5) for s in n.subnets(new_prefix=22)]\'`.',
			'Lance un conteneur sans réseau, avec le droit d’en configurer un : `docker run --rm -it --network none --cap-add NET_ADMIN nicolaka/netshoot:v0.13`.',
			'Dedans, donne à une interface une adresse de nœud du bloc, et une passerelle : `ip link add eth0 type bridge && ip link set eth0 up && ip addr add 10.20.0.5/20 dev eth0 && ip route add default via 10.20.0.1`.',
			'Interroge le noyau des deux côtés de la limite : `ip route get 10.20.15.200`, puis `ip route get 10.20.17.4`.',
			'Donne à la même adresse un préfixe trop court : `ip addr del 10.20.0.5/20 dev eth0 && ip addr add 10.20.0.5/12 dev eth0`, puis relance `ip route get 10.20.17.4`. Tape `exit` pour sortir.'
		],
		done: [
			'Python affiche `4096 10.20.15.255 False`, puis quatre lignes `/22` qui finissent chacune par `1019`.',
			'`ip route get 10.20.15.200` affiche `dev eth0` sans `via`.',
			'`ip route get 10.20.17.4` affiche `via 10.20.0.1` avec le `/20`, et aucun `via` avec le `/12`.'
		],
		solution: [
			'`num_addresses` vaut 2^12. `n[-1]` est l’adresse avec tous les bits d’hôte à 1. `in` fait le même test de préfixe que `Prefix.Contains` en Go.',
			'`subnets(new_prefix=22)` ajoute les 2 bits, et `- 5` applique la réserve d’AWS.',
			'Avec le `/20`, 10.20.17.4 est hors du réseau du nœud, donc le paquet part vers la passerelle. Avec le `/12`, elle paraît locale, et le noyau essaierait de la joindre directement sur `eth0` : l’erreur de la dernière étape du schéma.'
		]
	},
	recall: {
		q: 'Combien d’adresses dans un `/28`, et combien une instance AWS peut-elle en utiliser ?',
		a: '16, grâce à 4 bits d’hôte. AWS garde les quatre premières et la dernière, il en reste donc 11.'
	},
	sources: [
		{ title: 'RFC 1918, Address Allocation for Private Internets', url: 'https://www.rfc-editor.org/rfc/rfc1918' },
		{ title: 'RFC 4632, Classless Inter-domain Routing (CIDR)', url: 'https://www.rfc-editor.org/rfc/rfc4632' },
		{ title: 'AWS VPC User Guide, Subnet CIDR blocks', url: 'https://docs.aws.amazon.com/vpc/latest/userguide/subnet-sizing.html' },
		{ title: 'Source Go, src/net/netip/netip.go (Addr.IsPrivate)', url: `${NETIP}#L636-L664` }
	]
};
