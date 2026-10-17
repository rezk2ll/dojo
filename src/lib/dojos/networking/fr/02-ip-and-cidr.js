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
