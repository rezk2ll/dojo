const LINUX = 'https://github.com/torvalds/linux/blob/70dd4ee72eb2d5793c62e71c14e3aba78e5a4e56';
const TIMER = `${LINUX}/net/ipv4/tcp_timer.c`;
const OUTPUT = `${LINUX}/net/ipv4/tcp_output.c`;
const WGQUICK = 'https://github.com/WireGuard/wireguard-tools/blob/a998407747005ea7e4e0258d96f105c97241e1d3/src/wg-quick/linux.bash';
const CF = 'https://blog.cloudflare.com/path-mtu-discovery-in-practice/';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'mtu',
	part: 'Noms et adresses',
	title: 'MTU et fragmentation',
	minutes: 10,
	hook: [
		'Fin janvier 2015, quelques utilisateurs de Cloudflare n’arrivent plus du tout à joindre ses services. Tous passent par un tunnel IP pour sortir sur internet, le plus souvent de l’IPv6 transporté dans de l’IPv4.',
		'La panne tient à un message ICMP livré à la mauvaise machine. Un routeur du tunnel renvoie « paquet trop gros » vers Cloudflare, et le routage ECMP interne de Cloudflare ne hache l’ICMP que sur les deux adresses IP. **Le message arrive sur un autre serveur que celui qui tient la connexion TCP**, et ce serveur-là continue d’envoyer des paquets que le tunnel ne peut pas porter.',
		'Le manuel d’iptables décrit ce que voit l’utilisateur quand un chemin jette ces messages : "Web browsers connect, then hang with no data received" (le navigateur se connecte puis ne reçoit rien), et "ssh works fine, but scp hangs after initial handshaking".'
	],
	terms: [
		{ term: 'MTU', def: 'Maximum transmission unit : la taille du plus gros paquet IP qu’un lien transporte d’un seul bloc, en-têtes compris. Ethernet utilise 1500 octets.' },
		{ term: 'Path MTU', def: 'Le plus petit MTU parmi tous les liens entre deux hôtes. La RFC 1191 le définit comme "the minimum of the MTUs of each hop in the path".' },
		{ term: 'MSS', def: 'Maximum segment size : la plus grosse charge utile TCP qu’un hôte accepte, annoncée dans son SYN. En IPv4, c’est le MTU moins 40 octets (20 d’en-tête IP, 20 d’en-tête TCP), donc 1460 sur Ethernet.' },
		{ term: 'ICMP black hole', def: 'Un chemin où un routeur jette un paquet trop gros sans que son message ICMP « fragmentation needed » arrive jusqu’à l’émetteur, souvent parce qu’un pare-feu jette l’ICMP.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['client["Portable, MTU du LAN 1500"] -->|"SYN, mss 1460"| router["Routeur du bureau, wg0 MTU 1420"]', 'router -->|"tunnel"| server["Serveur, MTU 1500"]'],
				highlight: ['client', 'server'],
				note: 'Le portable est sur un LAN à 1500 octets et annonce `mss 1460` dans son SYN. Le serveur fait pareil. Aucun des deux ne sait que le routeur du bureau envoie tout dans un tunnel WireGuard au MTU de 1420. La poignée de main et la requête HTTP tiennent dans de petits paquets, elles passent.'
			},
			{
				add: ['server -->|"paquet de 1500 octets, DF mis"| router', 'router -->|"ICMP type 3 code 4, Next-Hop MTU 1420"| server'],
				highlight: ['router'],
				note: 'Le serveur répond avec des paquets pleins de 1500 octets, bit Don’t Fragment (DF) mis. Le routeur ne peut pas les faire entrer dans le tunnel à 1420, et il n’a pas le droit de les couper : il les jette. La RFC 1191 l’oblige alors à renvoyer un ICMP type 3 code 4, "fragmentation needed and DF set", avec le MTU du saut suivant, 1420, dans l’en-tête.'
			},
			{
				add: ['server -->|"PMTU 1420 : charges de 1380 octets"| router', 'router --> client'],
				highlight: ['server'],
				note: 'Quand l’ICMP arrive, le serveur baisse à 1420 son Path MTU vers l’adresse du portable et renvoie les données en charges TCP de 1380 octets. Linux garde cette valeur pendant `mtu_expires` secondes. La RFC 1191 interdit de descendre sous 68 octets, et Linux s’arrête à `min_pmtu`, 552 par défaut.'
			},
			{
				add: ['fw["Pare-feu : jette tout l’ICMP"]', 'router -.->|"ICMP jeté"| fw'],
				highlight: ['fw'],
				note: 'Si un pare-feu jette le message ICMP, le serveur n’apprend jamais le 1420. Il retransmet le même paquet de 1500 octets, le routeur le jette encore, et le téléchargement reste bloqué alors que la connexion est ouverte. Tu retrouves le symptôme du manuel d’iptables : le navigateur se connecte, puis ne reçoit rien.'
			},
			{
				add: ['router -->|"réécrit le SYN : mss 1380"| server'],
				highlight: ['router'],
				note: 'Le routeur peut contourner le problème avec le MSS clamping : `iptables -t mangle -A FORWARD -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu`. La règle réécrit le MSS de chaque SYN qui la traverse avec le MTU de sortie moins 40, ici 1380. Le serveur n’envoie alors plus aucun segment TCP trop gros pour le tunnel.'
			}
		]
	},
	example: {
		title: 'net/ipv4/tcp_timer.c : la détection de trou noir de TCP dans Linux',
		repo: 'torvalds/linux',
		url: `${TIMER}#L166-L269`,
		lang: 'c',
		code: `static void tcp_mtu_probing(struct inet_connection_sock *icsk, struct sock *sk)
{
	const struct net *net = sock_net(sk);
	int mss;

	/* Black hole detection */
	if (!READ_ONCE(net->ipv4.sysctl_tcp_mtu_probing))
		return;

	if (!icsk->icsk_mtup.enabled) {
		icsk->icsk_mtup.enabled = 1;
		icsk->icsk_mtup.probe_timestamp = tcp_jiffies32;
	} else {
		mss = tcp_mtu_to_mss(sk, icsk->icsk_mtup.search_low) >> 1;
		mss = min(READ_ONCE(net->ipv4.sysctl_tcp_base_mss), mss);
		mss = max(mss, READ_ONCE(net->ipv4.sysctl_tcp_mtu_probe_floor));
		mss = max(mss, READ_ONCE(net->ipv4.sysctl_tcp_min_snd_mss));
		icsk->icsk_mtup.search_low = tcp_mss_to_mtu(sk, mss);
	}
	tcp_sync_mss(sk, icsk->icsk_pmtu_cookie);
}
…
static int tcp_write_timeout(struct sock *sk)
{
…
	} else {
		if (retransmits_timed_out(sk, READ_ONCE(net->ipv4.sysctl_tcp_retries1), 0)) {
			/* Black hole detection */
			tcp_mtu_probing(icsk, sk);

			__dst_negative_advice(sk);
		}`,
		notes: [
			'La ligne 27 tourne à chaque expiration du délai de retransmission d’une connexion ouverte. Quand les retransmissions ont duré autant que `tcp_retries1` délais doublés (3 par défaut, au moins 3 secondes avec un délai minimum de 200 ms), la ligne 29 appelle `tcp_mtu_probing`.',
			'Les lignes 7 et 8 sortent tout de suite si le sysctl `tcp_mtu_probing` vaut 0. Sur le portable qui a servi pour ce chapitre (noyau 6.17), `cat /proc/sys/net/ipv4/tcp_mtu_probing` a affiché `0` : avec ce réglage, le noyau ne baisse jamais le MSS d’une connexion bloquée.',
			'Avec la valeur 1, le premier appel passe par les lignes 10 à 12 et active le sondage. La ligne 20 appelle ensuite [`tcp_sync_mss`](' + OUTPUT + '#L2079-L2098), qui plafonne le MSS à `search_low`. `tcp_mtup_init` a calculé `search_low` depuis `tcp_base_mss`, 1024 octets par défaut, et un segment de 1024 octets passe dans le tunnel à 1420.',
			'Si la connexion bloque encore au délai suivant, les lignes 14 à 18 divisent le MSS par deux, de 1024 à 512, sans descendre sous `tcp_mtu_probe_floor` et `tcp_min_snd_mss` (48 chacun). L’article de Cloudflare de 2015 donne encore 512 comme valeur par défaut de `tcp_base_mss`. Le code actuel fixe `TCP_BASE_MSS` à 1024.'
		]
	},
	tradeoff: {
		gain: [
			'Avec le PMTUD, un serveur envoie des charges de 1460 octets sur un chemin à 1500. Avant la RFC 1191, les hôtes prenaient "the lesser of 576 and the first-hop MTU" pour tout réseau distant, soit un MSS de 536.',
			'Une seule règle de MSS clamping sur le routeur du tunnel répare toutes les connexions TCP qui le traversent, sans toucher aux portables ni aux serveurs.'
		],
		cost: [
			'Le PMTUD suppose qu’un message ICMP atteigne le bon émetteur. Un pare-feu qui jette l’ICMP, ou un ECMP qui l’envoie à un autre serveur comme chez Cloudflare, crée un trou noir.',
			'La règle de clamping ne réécrit que les SYN TCP : le trafic UDP qui passe par le même tunnel, DNS ou QUIC par exemple, bute toujours sur la limite de 1420 octets.',
			'Avec `tcp_mtu_probing = 1`, Linux ne réagit qu’après `tcp_retries1` expirations : une connexion bloquée attend donc d’abord au moins 3 secondes.'
		]
	},
	task: {
		prompt: 'Ton bureau joint le datacenter par WireGuard, lancé avec `wg-quick`, sur une liaison montante au MTU de 1500. Les utilisateurs disent que `git clone https://git.internal/...` bloque après quelques kilo-octets, alors que `curl -I` sur le même hôte marche. Calcule le MTU que `wg-quick` donne à `wg0`, le MSS qu’annoncent les portables, le MSS qu’écrirait une règle de clamping sur le routeur, et une commande `ping` qui prouve la limite du tunnel.',
		hint: '`wg-quick` lit le MTU de la liaison et retire un nombre fixe. Un echo ICMP ajoute 8 octets d’en-tête ICMP et 20 d’en-tête IP à la taille passée à `-s`.',
		answer: [
			'Sans ligne `MTU =`, `wg-quick` prend le plus petit MTU de la route vers chaque pair et lance `ip link set mtu $(( mtu - 80 ))` : 1500 moins 80 donne 1420.',
			'Les portables sont sur le LAN à 1500, donc ils annoncent `mss 1460`. Le serveur envoie des paquets de 1500 octets que le routeur ne peut pas mettre dans `wg0`. `curl -I` marche parce que sa réponse tient dans de petits paquets.',
			'`--clamp-mss-to-pmtu` écrit dans chaque SYN le MTU de sortie moins 40 : 1420 moins 40 donne `mss 1380`.',
			'Depuis un hôte derrière le routeur, `ping -M do -s 1392 <server>` envoie un paquet de 1420 octets (1392 + 8 + 20) avec DF et reçoit une réponse. `-s 1393` ne reçoit rien, ou un ICMP « frag needed » si l’ICMP revient. Sur un lien à 1500, un vrai essai a affiché `1473(1501) bytes` puis `ping: local error: message too long, mtu=1500`.'
		]
	},
	quiz: [
		{
			q: 'Un nouveau pare-feu jette tout l’ICMP. Les connexions TCP s’ouvrent, les petites réponses d’API arrivent, mais les gros téléchargements bloquent pour toujours. Pourquoi ?',
			options: [
				'Le pare-feu bloque la poignée de main TCP des paquets de plus de 1460 octets',
				'Les messages « fragmentation needed » n’atteignent pas l’émetteur, qui renvoie des paquets pleins',
				'Les routeurs arrêtent de fragmenter quand le pare-feu jette les echo requests ICMP',
				'TCP a besoin de l’ICMP pour acquitter chaque gros segment, et ces acquittements sont perdus'
			],
			answer: 1,
			why: 'Le routeur jette chaque paquet avec DF qui ne tient pas dans le saut suivant et répond par un ICMP type 3 code 4. Si ce message est jeté, l’émetteur ne baisse jamais son Path MTU et retransmet le même paquet trop gros. Les petits paquets tiennent, donc la poignée de main et les réponses courtes passent.'
		},
		{
			q: 'Un portable Linux sur un LAN Ethernet à 1500 octets ouvre une connexion TCP en IPv4. Quel MSS annonce son SYN ?',
			options: ['1500', '1480', '1460', '1420'],
			answer: 2,
			why: 'Le MSS ne compte que la charge utile TCP. Le portable retire du MTU de 1500 l’en-tête IPv4 de 20 octets et l’en-tête TCP de 20 octets : 1460. L’article de Cloudflare montre le même `mss 1460` dans un SYN capturé.'
		},
		{
			q: 'Tu mets `net.ipv4.tcp_mtu_probing = 1` sur un serveur derrière un trou noir ICMP. Qu’est-ce qui change pour une connexion bloquée ?',
			options: [
				'Le noyau ne met plus le bit DF, et les routeurs fragmentent les gros paquets',
				'Chaque connexion démarre avec un MSS de 1024 octets dès le premier SYN',
				'Après `tcp_retries1` expirations, le noyau baisse le MSS vers 1024, puis le divise par deux',
				'Le noyau envoie des sondes ICMP à chaque routeur du chemin pour lire son MTU'
			],
			answer: 2,
			why: 'En mode 1, `tcp_write_timeout` appelle `tcp_mtu_probing` une fois les retransmissions au-delà de `tcp_retries1`. Le premier appel active le sondage, et `tcp_sync_mss` plafonne le MSS à `search_low`, calculé depuis `tcp_base_mss` (1024). Un appel suivant le divise par deux. C’est le mode 2 qui démarre chaque connexion à `tcp_base_mss`.'
		}
	],
	recall: {
		q: 'Sur quel message ICMP repose la découverte du Path MTU, et que voit l’utilisateur quand un pare-feu le jette ?',
		a: 'ICMP type 3 code 4, "fragmentation needed and DF set", qui porte le MTU du saut suivant. Sans lui, l’émetteur renvoie sans fin des paquets pleins : la connexion s’ouvre, puis reste bloquée sans données.'
	},
	sources: [
		{ title: 'RFC 1191, Path MTU Discovery', url: 'https://www.rfc-editor.org/rfc/rfc1191' },
		{ title: 'RFC 8200, spécification d’IPv6, section 5 : Packet Size Issues', url: 'https://www.rfc-editor.org/rfc/rfc8200#section-5' },
		{ title: 'Blog de Cloudflare, Path MTU discovery in practice (2015)', url: CF },
		{ title: 'Documentation du noyau Linux, IP Sysctl (tcp_mtu_probing, tcp_base_mss, min_pmtu)', url: 'https://docs.kernel.org/networking/ip-sysctl.html' },
		{ title: 'iptables-extensions(8), cible TCPMSS', url: 'https://man7.org/linux/man-pages/man8/iptables-extensions.8.html' },
		{ title: 'wireguard-tools, set_mtu_up de wg-quick', url: `${WGQUICK}#L126-L143` },
		{ title: 'Code de Linux, net/ipv4/tcp_timer.c', url: TIMER }
	]
};
