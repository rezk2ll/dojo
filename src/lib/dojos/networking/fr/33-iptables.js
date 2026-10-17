const MOBY = 'https://github.com/moby/moby/blob/3f38b15147b14ce0ce7b11558a1aa9e9f14db103/daemon/libnetwork/drivers/bridge/internal/nftabler/testdata/TestNftabler';
const GOLDEN = `${MOBY}/hairpin=false,internal=false,icc=true,masq=true,snat=false,gwm=nat,bindlh=false__ip.golden`;
const LINUX = 'https://github.com/torvalds/linux/blob/70dd4ee72eb2d5793c62e71c14e3aba78e5a4e56';
const DOCKER_NFT = 'https://docs.docker.com/engine/network/firewall-nftables/';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'iptables',
	part: 'Déboguer le réseau',
	title: 'Le filtrage de paquets avec iptables et nftables',
	minutes: 10,
	hook: [
		'Tu actives ufw sur un hôte Docker et tu n’autorises que le port 22. Puis tu lances `docker run -p 8080:80 nginx`. Depuis une autre machine, `curl http://host:8080/` renvoie la page de nginx.',
		'La doc de Docker l’explique : « packets are diverted before it reaches the INPUT and OUTPUT chains that ufw uses ». Docker réécrit la destination vers l’adresse du conteneur au hook prerouting. Le noyau transfère ensuite le paquet vers le bridge, et le hook input, où ufw filtre, ne s’exécute jamais.',
		'Le noyau exécute les règles de filtrage à des points fixes du trajet de chaque paquet. Le point où se trouve une règle, et le choix entre drop et reject, déterminent ce que voit le client.'
	],
	terms: [
		{ term: 'Hook netfilter', def: 'Un point fixe du trajet des paquets dans le noyau où des règles s’exécutent, comme prerouting, input, forward, output et postrouting. iptables et nftables accrochent tous deux leurs règles à ces hooks.' },
		{ term: 'Chaîne de base', def: 'Une chaîne nftables accrochée à un hook avec un type et une priorité, par exemple `type filter hook forward priority filter`. Sur un même hook, les priorités les plus basses passent en premier.' },
		{ term: 'Drop', def: 'Un verdict qui jette le paquet sans rien renvoyer. Dans nftables, il arrête aussitôt l’évaluation de tout le ruleset.' },
		{ term: 'Reject', def: 'Une instruction qui renvoie une erreur (un ICMP port unreachable par défaut, ou un RST TCP avec `tcp reset`), puis jette le paquet.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['pkt["SYN vers l’hôte, port 8080, sur eth0"] --> raw["prerouting, priorité raw : raw-PREROUTING"]'],
				highlight: ['pkt', 'raw'],
				note: 'Le paquet passe d’abord par la chaîne `raw-PREROUTING` de Docker, qui jette les paquets envoyés directement à l’adresse du conteneur, 192.168.0.2, depuis une autre interface. Celui-ci vise l’hôte : il passe. Le suivi de connexions (conntrack) vient ensuite, à la priorité -200.'
			},
			{
				add: ['raw --> dnat["prerouting, priorité dstnat : dnat vers 192.168.0.2:80"]'],
				highlight: ['dnat'],
				note: 'À la priorité `dstnat` (-100), la règle du port publié 8080 réécrit la destination en 192.168.0.2, port 80. Le manuel de nft sur le NAT : « All future packets in this connection will also be mangled » (les paquets suivants de la connexion sont modifiés de la même façon).'
			},
			{
				add: ['dnat --> route{"routage : 192.168.0.2 est-elle une adresse locale ?"}', 'route -.->|"oui"| input["hook input : règles ufw"]', 'route -->|"non : transfert vers le bridge"| fwd["hook forward : filter-FORWARD"]'],
				highlight: ['route', 'fwd'],
				note: 'La décision de routage se fait sur la nouvelle destination. 192.168.0.2 est l’adresse du conteneur sur le réseau du bridge : le paquet prend le hook forward. Le hook input, où ufw range ses règles, ne le voit jamais.'
			},
			{
				add: ['fwd --> br["filter-forward-in__br-dummy : accept tcp dport 80"]', 'br --> ctr["conteneur 192.168.0.2:80"]'],
				highlight: ['br', 'ctr'],
				note: 'La chaîne de Docker propre au bridge accepte les paquets vers le port 80 publié du conteneur et jette le reste, avec le commentaire « UNPUBLISHED PORT DROP ». Le SYN arrive à nginx, et le client reçoit la page.'
			},
			{
				add: ['br -.->|"tcp dport 22 : drop"| silent["client : aucune réponse, SYN renvoyé, échec après 131 s"]', 'br -.->|"si la règle était : reject with tcp reset"| refused["client : RST, échec immédiat"]'],
				highlight: ['silent', 'refused'],
				note: 'Un SYN jeté ne reçoit aucune réponse. Le client le renvoie 6 fois par défaut et abandonne après 131 secondes, d’après la doc noyau de `tcp_syn_retries`. Un SYN rejeté reçoit un RST TCP, et `connect()` échoue en un aller-retour avec « Connection refused ».'
			}
		]
	},
	example: {
		title: 'moby, testdata de nftabler : le ruleset nftables que Docker écrit pour un bridge avec le port 8080 publié',
		repo: 'moby/moby',
		url: `${GOLDEN}#L22-L71`,
		lang: 'shell',
		code: `	chain filter-FORWARD {
		type filter hook forward priority filter; policy accept;
		oifname vmap @filter-forward-in-jumps
		iifname vmap @filter-forward-out-jumps
	}

	chain nat-OUTPUT {
		type nat hook output priority dstnat; policy accept;
		ip daddr != 127.0.0.0/8 fib daddr type local counter packets 0 bytes 0 jump nat-prerouting-and-output
	}

	chain nat-POSTROUTING {
		type nat hook postrouting priority srcnat; policy accept;
		iifname vmap @nat-postrouting-out-jumps
		oifname vmap @nat-postrouting-in-jumps
	}

	chain nat-PREROUTING {
		type nat hook prerouting priority dstnat; policy accept;
		fib daddr type local counter packets 0 bytes 0 jump nat-prerouting-and-output
	}

	chain nat-prerouting-and-output {
		iifname != "br-dummy" tcp dport 8080 counter packets 0 bytes 0 dnat to 192.168.0.2:80 comment "DNAT"
	}

	chain raw-PREROUTING {
		type filter hook prerouting priority raw; policy accept;
		ip daddr 192.168.0.2 iifname != "br-dummy" counter packets 0 bytes 0 drop comment "DROP DIRECT ACCESS"
	}

	chain filter-forward-in__br-dummy {
		ct state established,related counter packets 0 bytes 0 accept
		iifname "br-dummy" counter packets 0 bytes 0 accept comment "ICC"
		ip daddr 192.168.0.2 tcp dport 80 counter packets 0 bytes 0 accept
		counter packets 0 bytes 0 drop comment "UNPUBLISHED PORT DROP"
	}

	chain filter-forward-out__br-dummy {
		ct state established,related counter packets 0 bytes 0 accept
		counter packets 0 bytes 0 accept comment "OUTGOING"
	}

	chain nat-postrouting-in__br-dummy {
	}

	chain nat-postrouting-out__br-dummy {
		oifname != "br-dummy" ip saddr 192.168.0.0/24 counter packets 0 bytes 0 masquerade comment "MASQUERADE"
	}`,
		notes: [
			'Ce fichier est un golden file de test du dépôt moby : le ruleset que dockerd doit écrire pour un bridge, `br-dummy`, avec le port 8080 de l’hôte publié vers 192.168.0.2:80. Les lignes 2, 8, 13, 19 et 28 accrochent des chaînes de base aux hooks forward, output, postrouting et prerouting.',
			'La ligne 20 ne saute que pour les paquets dont la destination est une adresse locale (`fib daddr type local`). La ligne 24 réécrit alors le port TCP 8080 en 192.168.0.2:80. La ligne 9 fait de même pour les paquets émis par l’hôte lui-même, qui passent par le hook output au lieu de prerouting.',
			'La ligne 29 tourne à la priorité `raw` (-300), avant conntrack. Elle jette les paquets adressés directement au conteneur depuis l’extérieur du bridge. La [doc de Docker](' + DOCKER_NFT + ') précise : « Because a drop is final, a rule in one of your own tables cannot allow them. »',
			'Les lignes 33 à 36 filtrent le trafic qui entre dans le bridge. La ligne 33 accepte les réponses des connexions connues, la ligne 35 accepte le port publié, et la ligne 36 jette tout le reste. C’est un `drop` : un scan du port 22 du conteneur ne reçoit aucune réponse.',
			'La ligne 48 masque (masquerade) le trafic qui quitte le réseau 192.168.0.0/24 par une autre interface. Le manuel de nft : masquerade « always uses the outgoing interface\'s IP address », donc les paquets des conteneurs sortent avec l’adresse de l’hôte.'
		]
	},
	tradeoff: {
		gain: [
			'`reject with tcp reset` fait échouer un client TCP en un aller-retour. Le noyau transforme un RST reçu en `SYN_SENT` en `ECONNREFUSED`.',
			'`drop` ne renvoie aucun paquet : une règle qui attrape un flot de paquets n’ajoute aucun trafic de réponse.',
			'Le manuel d’iptables demande de jeter (DROP) les paquets en état INVALID : un reject sur un vieux doublon « would then terminate the healthy connection » (couperait une connexion saine).'
		],
		cost: [
			'Un client dont le SYN est jeté attend 131 secondes avec la valeur par défaut de `tcp_syn_retries`, 6, sauf si son propre timeout de connexion est plus court.',
			'Vu du client, un paquet jeté ressemble à un hôte mort ou à une route perdue. Rien n’indique à l’opérateur qu’une règle de pare-feu a matché.',
			'Un `accept` nftables ne termine que sa propre chaîne de base. Une autre chaîne de base sur le même hook peut encore jeter le paquet, comme le rappelle la doc de Docker pour les règles ajoutées à côté de ses tables.'
		]
	},
	task: {
		prompt: 'Un serveur de base de données a une seule table nftables : `table inet host { chain input { type filter hook input priority filter; policy drop; ct state established,related accept; iifname "lo" accept; tcp dport 22 accept; ip saddr 10.0.0.0/8 tcp dport 5432 accept; tcp dport 5432 reject with tcp reset } }`. Dis ce que voit chaque client : `psql` depuis 10.1.2.3, `psql` depuis 203.0.113.9, `curl` vers le port 8080 depuis 203.0.113.9, et `ping` depuis 10.1.2.3.',
		hint: 'Les règles s’évaluent de haut en bas, le premier verdict l’emporte, et un paquet qu’aucune règle n’attrape reçoit la politique de la chaîne.',
		answer: [
			'`psql` depuis 10.1.2.3 : le SYN correspond à `ip saddr 10.0.0.0/8 tcp dport 5432 accept`. Les paquets suivants de la session correspondent à `ct state established,related accept`. La connexion s’établit.',
			'`psql` depuis 203.0.113.9 : la règle sur la source ne correspond pas, la suivante si. L’hôte envoie un RST, et `psql` échoue aussitôt avec « Connection refused ».',
			'`curl` vers le port 8080 : aucune règle ne correspond, la politique `drop` s’applique. Le SYN reste sans réponse, le client le renvoie, et avec les réglages par défaut `connect()` échoue après 131 secondes.',
			'`ping` depuis 10.1.2.3 : aucune règle n’accepte les ICMP echo request, la politique les jette. `ping` n’affiche aucune réponse et annonce 100 % de perte, alors que l’hôte tourne.'
		]
	},
	quiz: [
		{
			q: 'ufw n’autorise que le port 22, et pourtant un port publié avec `docker run -p 8080:80` répond depuis l’extérieur. Pourquoi ?',
			options: [
				'Docker ouvre le port 8080 dans les règles de ufw au démarrage du conteneur',
				'Les règles ufw ne s’appliquent qu’à IPv6, et le client passe par IPv4',
				'Le DNAT en prerouting envoie le paquet au hook forward : les règles input de ufw ne tournent pas',
				'nginx écoute sur toutes les interfaces du conteneur, ce qui contourne le pare-feu'
			],
			answer: 2,
			why: 'Docker réécrit la destination vers l’adresse du conteneur avant la décision de routage. Le noyau transfère alors le paquet vers le bridge, et seul le hook input porte les règles de ufw.'
		},
		{
			q: '`curl http://10.0.0.5:9000/` n’affiche rien pendant environ deux minutes, puis échoue. Que fait le plus probablement le pare-feu de 10.0.0.5 du SYN ?',
			options: [
				'Il le rejette avec `tcp reset`, et curl réessaie après le RST',
				'Il le jette, et le noyau renvoie le SYN jusqu’au bout de `tcp_syn_retries`',
				'Il le rejette avec un ICMP port unreachable, que curl ignore',
				'Il l’accepte, et le serveur tarde à envoyer son SYN-ACK'
			],
			answer: 1,
			why: 'Un SYN jeté ne reçoit pas de réponse. Avec 6 essais par défaut, le noyau abandonne après 131 secondes. Un reject ferait échouer `connect()` tout de suite : un RST comme un ICMP port unreachable donnent `ECONNREFUSED`.'
		},
		{
			q: 'La chaîne `filter-FORWARD` de Docker jette un paquet. Tu ajoutes ta propre table avec une chaîne en `hook forward priority filter - 10` qui l’accepte. Que se passe-t-il ?',
			options: [
				'Le paquet est accepté, car ta chaîne passe en premier',
				'Le paquet est accepté, car une priorité plus basse l’emporte sur la suite',
				'nft refuse la règle, car deux tables ne peuvent pas partager un hook',
				'Le paquet est jeté, car accept ne termine que ta chaîne de base'
			],
			answer: 3,
			why: 'Dans nftables, accept termine la chaîne de base courante et le paquet passe à la suivante sur le même hook. La chaîne de Docker tourne après la tienne, et son drop arrête l’évaluation de tout le ruleset.'
		}
	],
	recall: {
		q: 'Un client se connecte à un port TCP filtré. Que voit-il quand la règle est `drop`, et quand elle est `reject with tcp reset` ?',
		a: 'Avec drop, rien ne revient : le noyau renvoie le SYN 6 fois et abandonne après 131 secondes. Avec tcp reset, un RST arrive en SYN_SENT et `connect()` échoue aussitôt avec ECONNREFUSED, « Connection refused ».'
	},
	sources: [
		{ title: 'Wiki nftables, Netfilter hooks', url: 'https://wiki.nftables.org/wiki-nftables/index.php/Netfilter_hooks' },
		{ title: 'Wiki nftables, Rejecting traffic', url: 'https://wiki.nftables.org/wiki-nftables/index.php/Rejecting_traffic' },
		{ title: 'Page de manuel nft(8)', url: 'https://www.netfilter.org/projects/nftables/manpage.html' },
		{ title: 'iptables-extensions(8), cible REJECT', url: 'https://man7.org/linux/man-pages/man8/iptables-extensions.8.html' },
		{ title: 'Doc Docker, Docker with nftables', url: DOCKER_NFT },
		{ title: 'Doc Docker, Packet filtering and firewalls', url: 'https://docs.docker.com/engine/network/packet-filtering-firewalls/' },
		{ title: 'Doc du noyau Linux, IP Sysctl (tcp_syn_retries)', url: 'https://docs.kernel.org/networking/ip-sysctl.html' },
		{ title: 'Code source de Linux, net/ipv4/icmp.c (icmp_err_convert)', url: `${LINUX}/net/ipv4/icmp.c#L124-L140` }
	]
};
