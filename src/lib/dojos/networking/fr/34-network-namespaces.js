const CNI = 'https://github.com/containernetworking/plugins/blob/268232e54c89bae2bf2b1548e03ff183a7a6f9e9';
const MOBY = 'https://github.com/moby/moby/blob/3f38b15147b14ce0ce7b11558a1aa9e9f14db103/daemon/libnetwork/drivers/bridge/bridge_linux.go';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'network-namespaces',
	part: 'Déboguer le réseau',
	title: 'Les namespaces réseau',
	minutes: 10,
	hook: [
		'PostgreSQL tourne sur ton portable et écoute sur 127.0.0.1:5432. Ton app tourne dans un conteneur Docker et se connecte à `localhost:5432`. La connexion est refusée, alors que `psql -h localhost` marche très bien sur le portable.',
		'Dans le conteneur, `localhost` désigne le loopback du conteneur lui-même. Le conteneur tourne dans son propre namespace réseau, avec ses interfaces, ses adresses, ses routes, ses règles de pare-feu et ses ports. Là-dedans, rien n’écoute sur le port 5432.',
		'Une paire veth relie ce namespace à l’hôte, et son extrémité côté hôte est rattachée au bridge `docker0`. Le trafic du conteneur entre dans le routage et le pare-feu de l’hôte par cette extrémité.'
	],
	terms: [
		{ term: 'Namespace réseau', def: 'Une copie séparée de la pile réseau du noyau, avec ses propres interfaces, routes, règles de pare-feu et ports. Un processus appartient à un seul namespace et en hérite de son parent.' },
		{ term: 'Paire veth', def: 'Deux interfaces Ethernet virtuelles reliées dos à dos : un paquet émis sur l’une est reçu aussitôt sur l’autre. Les deux extrémités peuvent être dans des namespaces différents.' },
		{ term: 'Bridge', def: 'Un switch virtuel dans le noyau, comme `docker0`. Les interfaces qu’on y rattache avec `master` échangent des trames Ethernet comme si elles étaient branchées sur un même switch.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['ns["netns du conteneur : lo seulement"]', 'host["netns de l’hôte : eth0, docker0 172.17.0.1/16"]'],
				highlight: ['ns', 'host'],
				note: 'Le runtime crée un nouveau namespace réseau, comme le ferait `ip netns add app`. ip-netns(8) : « A network namespace is logically another copy of the network stack, with its own routes, firewall rules, and network devices. » Au départ, il ne contient que `lo`.'
			},
			{
				add: ['ns --- c0["eth0 dans le conteneur"]', 'c0 ===|"paire veth"| v["vetha14c4f7 sur l’hôte"]', 'host --- v'],
				highlight: ['c0', 'v'],
				note: 'Une paire veth est créée, comme avec `ip link add vetha14c4f7 type veth peer eth0 netns app`, qui place directement l’extrémité `eth0` dans le namespace du conteneur. veth(4) : « Packets transmitted on one device in the pair are immediately received on the other device. »'
			},
			{
				add: ['v -->|"master docker0"| br["bridge docker0 172.17.0.1"]'],
				highlight: ['br'],
				note: 'L’extrémité côté hôte rejoint le bridge, comme avec `ip link set vetha14c4f7 master docker0`. Chaque conteneur de ce bridge a une telle extrémité sur `docker0` : les conteneurs se joignent sur 172.17.0.0/16 et joignent l’hôte en 172.17.0.1.'
			},
			{
				add: ['c0 -.->|"172.17.0.6/16, défaut via 172.17.0.1"| br'],
				highlight: ['c0'],
				note: 'Dans le namespace, `eth0` reçoit 172.17.0.6/16 et une route par défaut via 172.17.0.1, l’adresse du bridge. Un paquet vers 8.8.8.8 sort par `eth0`, ressort par `vetha14c4f7` et arrive sur l’hôte par `docker0`.'
			},
			{
				add: ['br -->|"hook forward, masquerade"| out["eth0 de l’hôte vers Internet"]'],
				highlight: ['out'],
				note: 'À partir de `docker0`, l’hôte route le paquet comme n’importe quel autre. Il traverse le hook forward, et la règle masquerade du chapitre 33 remplace 172.17.0.6 par l’adresse de l’hôte avant la sortie par le `eth0` de l’hôte.'
			}
		]
	},
	example: {
		title: 'Plugins CNI, plugins/main/bridge/bridge.go : setupVeth',
		repo: 'containernetworking/plugins',
		url: `${CNI}/plugins/main/bridge/bridge.go#L428-L469`,
		lang: 'go',
		code: `func setupVeth(
	netns ns.NetNS,
	br *netlink.Bridge,
	ifName string,
	mtu int,
	hairpinMode bool,
	vlanID int,
	vlans []int,
	preserveDefaultVlan bool,
	mac string,
	portIsolation bool,
) (*current.Interface, *current.Interface, error) {
	contIface := &current.Interface{}
	hostIface := &current.Interface{}

	err := netns.Do(func(hostNS ns.NetNS) error {
		// create the veth pair in the container and move host end into host netns
		hostVeth, containerVeth, err := ip.SetupVeth(ifName, mtu, mac, hostNS)
		if err != nil {
			return err
		}
		contIface.Name = containerVeth.Name
		contIface.Mac = containerVeth.HardwareAddr.String()
		contIface.Sandbox = netns.Path()
		hostIface.Name = hostVeth.Name
		return nil
	})
	if err != nil {
		return nil, nil, err
	}

	// need to lookup hostVeth again as its index has changed during ns move
	hostVeth, err := netlinksafe.LinkByName(hostIface.Name)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to lookup %q: %v", hostIface.Name, err)
	}
	hostIface.Mac = hostVeth.Attrs().HardwareAddr.String()

	// connect host veth end to the bridge
	if err := netlink.LinkSetMaster(hostVeth, br); err != nil {
		return nil, nil, fmt.Errorf("failed to connect %q to bridge %v: %v", hostVeth.Attrs().Name, br.Attrs().Name, err)
	}`,
		notes: [
			'Le plugin `bridge` du projet CNI (Container Network Interface) câble chaque conteneur avec cette fonction. La ligne 16 exécute la closure dans le namespace du conteneur. `hostNS` est le namespace d’où vient le plugin, celui de l’hôte.',
			'La ligne 18 crée la paire depuis le conteneur. Dans [`makeVethPair`](' + CNI + '/pkg/ip/link_linux.go#L40-L44), le pair reçoit `PeerNamespace: netlink.NsFd(int(hostNS.Fd()))` : l’extrémité hôte naît directement dans le namespace de l’hôte.',
			'Les lignes 32 et 33 recherchent à nouveau l’extrémité hôte par son nom. Le commentaire de la ligne 32 donne la raison : l’index de l’interface « has changed during ns move ».',
			'La ligne 40 est la version code de `ip link set <veth> master <bridge>`. Le driver bridge de Docker fait le même appel sur son extrémité hôte dans [bridge_linux.go](' + MOBY + '#L1055).',
			'Sortie réelle d’un conteneur lancé pendant cette session avec `docker run alpine:3.20` : dedans, `ip link` affiche `2: eth0@if559` et `ip route` affiche `default via 172.17.0.1 dev eth0`. Sur l’hôte, l’interface 559 est `vetha14c4f7@if2 ... master docker0`.'
		]
	},
	tradeoff: {
		gain: [
			'Les ports existent par namespace : deux conteneurs peuvent écouter tous les deux sur le port 80 sans conflit.',
			'network_namespaces(7) : « When a namespace is freed, the veth(4) devices that it contains are destroyed. » Quand le dernier processus d’un conteneur se termine, sa paire veth disparaît.',
			'Chaque namespace a ses propres routes et règles de pare-feu : une règle posée dans un conteneur ne touche ni l’hôte ni les autres conteneurs.'
		],
		cost: [
			'`localhost` dans un conteneur, c’est le conteneur. Un service de l’hôte doit écouter sur une adresse que le conteneur peut router, comme 172.17.0.1.',
			'Un paquet d’un conteneur vers Internet traverse la paire veth, le bridge, le hook forward et une règle masquerade. Une panne à l’un de ces quatre endroits donne le même symptôme côté app : aucune réponse.',
			'Docker garde ses namespaces sous `/var/run/docker/netns`, et `ip netns list` ne lit que `/var/run/netns`. Les conteneurs de cet hôte n’apparaissent pas dans cette liste.'
		]
	},
	task: {
		prompt: 'Sortie réelle de cette session. Dans le conteneur : `2: eth0@if559: <BROADCAST,MULTICAST,UP,LOWER_UP,M-DOWN> mtu 1500`, `inet 172.17.0.6/16`, `default via 172.17.0.1 dev eth0`, et `cat /sys/class/net/eth0/iflink` affiche `559`. Sur l’hôte : `559: vetha14c4f7@if2: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc noqueue master docker0`. Quelle interface de l’hôte est l’autre bout de `eth0`, quel bridge la porte, et quelle adresse l’app doit-elle utiliser pour joindre un PostgreSQL sur l’hôte ?',
		hint: 'Dans `name@ifN`, N est l’index de l’interface paire dans l’autre namespace.',
		answer: [
			'`eth0@if559` et `iflink` à 559 disent que le pair a l’index 559 dans un autre namespace. Sur l’hôte, l’index 559 est `vetha14c4f7`, et son propre `@if2` renvoie vers l’index 2, le `eth0` du conteneur.',
			'`master docker0` sur l’extrémité hôte dit que la paire est rattachée au bridge `docker0`, d’adresse 172.17.0.1/16.',
			'La route du conteneur `default via 172.17.0.1` envoie le trafic destiné à l’hôte vers `docker0`. PostgreSQL doit écouter sur 172.17.0.1 (ou sur toutes les adresses) et accepter 172.17.0.0/16, et l’app se connecte à 172.17.0.1:5432.'
		],
		steps: [
			{
				title: 'Lis le côté conteneur',
				questions: [
					{ q: 'Dans `2: eth0@if559`, que vaut `2` ?', options: ['L’index de `eth0` dans le namespace du conteneur', 'Le nombre d’adresses sur `eth0`', 'L’index du pair sur l’hôte', 'Le VLAN de l’interface'], answer: 0, why: 'Le nombre avant les deux-points est l’index de l’interface dans son propre namespace.' },
					{ q: 'Que t’apprend `@if559` ?', options: ['`eth0` a 559 paquets en file d’attente', 'L’interface paire a l’index 559 dans un autre namespace', '`eth0` est le 559e conteneur de l’hôte', 'Le bridge a l’index 559'], answer: 1, why: 'Dans `name@ifN`, N est l’index de l’interface paire dans l’autre namespace.' },
					{ q: 'Qu’apporte `cat /sys/class/net/eth0/iflink` qui affiche `559` ?', options: ['Il donne le MTU du lien', 'Il donne le nombre de sauts jusqu’à l’hôte', 'Il confirme le même index de pair, 559', 'Il donne le PID du conteneur'], answer: 2, why: '`iflink` contient l’index de l’interface liée. Il correspond au `@if559` qu’affiche `ip link`.' },
					{ q: 'Qu’est-ce que `inet 172.17.0.6/16` ?', options: ['L’adresse de l’hôte sur `docker0`', 'L’adresse de l’extrémité hôte de la paire', 'La passerelle par défaut', 'L’adresse du conteneur sur le réseau du bridge'], answer: 3, why: 'C’est l’adresse de `eth0` dans le namespace du conteneur. La passerelle vient de la ligne de route.' }
				]
			},
			{
				title: 'Trouve l’extrémité hôte',
				questions: [
					{ q: 'Le conteneur s’arrête et son namespace est libéré. Que devient `vetha14c4f7` ?', options: ['Elle reste sur `docker0`, sans pair', 'Elle est détruite avec le `eth0` du conteneur', 'Elle passe dans le namespace de l’hôte sous le nom `eth0`', 'Elle garde l’index 559 pour le conteneur suivant'], answer: 1, why: 'network_namespaces(7) : quand un namespace est libéré, ses interfaces veth sont détruites. Perdre un bout détruit toute la paire, extrémité hôte comprise.' },
					{ q: 'Dans `vetha14c4f7@if2`, vers quoi pointe `@if2` ?', options: ['Le `eth0` du conteneur, index 2', 'Le deuxième bridge de l’hôte', 'Le deuxième conteneur lancé', 'L’interface 2 de l’hôte'], answer: 0, why: 'Chaque bout donne l’index de son pair. L’index 2 est `eth0` dans le namespace du conteneur.' },
					{ q: 'Le conteneur envoie un paquet vers 8.8.8.8. Dans quel ordre traverse-t-il les interfaces de l’hôte ?', options: ['Le `eth0` de l’hôte, puis `docker0`, puis `vetha14c4f7`', '`docker0` seulement', '`vetha14c4f7`, puis `docker0`, puis le `eth0` de l’hôte', '`docker0`, puis `vetha14c4f7`'], answer: 2, why: 'Le paquet sort par l’extrémité hôte de la paire, entre dans l’hôte par le bridge auquel elle est rattachée, et l’hôte le route vers son propre `eth0`.' },
					{ q: 'Sur l’hôte, `ip link` montre aussi `560: veth7c2e9b1@if2`. Qu’est-ce que cela t’apprend ?', options: ['C’est une deuxième extrémité hôte de la même paire', 'Deux interfaces ne peuvent pas pointer vers l’index 2, donc l’une est cassée', 'C’est le port du bridge `docker0` lui-même', 'Elle appartient à un autre conteneur, dont le `eth0` a aussi l’index 2 dans son propre namespace'], answer: 3, why: 'Les index d’interface se comptent par namespace. Chaque conteneur numérote ses propres interfaces, donc plusieurs extrémités hôte peuvent pointer vers un index 2.' }
				]
			},
			{
				title: 'Trouve le bridge',
				questions: [
					{ q: 'Si la ligne hôte n’avait pas `master docker0`, que pourrait encore joindre le conteneur ?', options: ['Rien au-delà de `vetha14c4f7` : 172.17.0.1 et les autres conteneurs disparaissent', 'Tout, comme avant', 'Seulement les autres conteneurs', 'Seulement Internet'], answer: 0, why: 'La paire veth relie seulement les deux namespaces. Sans le bridge, les trames qui sortent de `vetha14c4f7` ne vont nulle part, et 172.17.0.1 vit sur `docker0`.' },
					{ q: 'Quelle est l’adresse de `docker0` ?', options: ['172.17.0.6/16', '127.0.0.1', '172.17.0.1/16', '172.17.0.0/16'], answer: 2, why: 'Le bridge a 172.17.0.1/16. 172.17.0.6 est le conteneur, et 172.17.0.0/16 le réseau.' },
					{ q: 'Que fait `default via 172.17.0.1 dev eth0` ?', options: ['Elle fait de 172.17.0.1 l’adresse du conteneur', 'Elle envoie le trafic vers les autres réseaux à l’adresse du bridge', 'Elle fait suivre le trafic de l’hôte dans le conteneur', 'Elle publie le port 5432'], answer: 1, why: 'Tout paquet sans route plus précise sort par `eth0` vers 172.17.0.1, le bridge, et entre dans l’hôte par là.' },
					{ q: 'Un autre conteneur a lui aussi son extrémité hôte sur `docker0`. Les deux peuvent-ils se joindre ?', options: ['Non, chaque namespace est totalement isolé', 'Seulement via le `eth0` de l’hôte', 'Seulement avec un port publié', 'Oui, sur 172.17.0.0/16 à travers le bridge'], answer: 3, why: 'Un bridge se comporte comme un seul switch. Chaque conteneur dont l’extrémité hôte est sur `docker0` partage 172.17.0.0/16.' }
				]
			},
			{
				title: 'Joins PostgreSQL sur l’hôte',
				questions: [
					{ q: 'Le conteneur est recréé et reçoit 172.17.0.9, tandis que `docker0` garde 172.17.0.1. Que faut-il changer ?', options: ['Rien : l’app vise toujours 172.17.0.1, et 172.17.0.9 est dans 172.17.0.0/16', 'L’app doit se connecter à 172.17.0.9', 'PostgreSQL doit écouter sur 172.17.0.9', 'PostgreSQL ne doit accepter que 172.17.0.9'], answer: 0, why: 'L’app vise l’adresse du bridge, qui n’a pas bougé. Le serveur écoute côté hôte et accepte tout le réseau du bridge : une nouvelle adresse de conteneur ne change rien.' },
					{ q: 'À quelle adresse l’app doit-elle se connecter ?', options: ['172.17.0.6:5432', '172.17.0.1:5432', '127.0.0.1:5432', '0.0.0.0:5432'], answer: 1, why: '172.17.0.1 est l’hôte sur le bridge, joignable par la route par défaut du conteneur.' },
					{ q: 'Sur quoi PostgreSQL doit-il écouter ?', options: ['127.0.0.1 seulement', '172.17.0.6', '172.17.0.1, ou toutes les adresses', 'L’index de `vetha14c4f7`'], answer: 2, why: 'Un serveur sur 127.0.0.1 n’est joignable que depuis le loopback de l’hôte. Il doit écouter sur une adresse que le conteneur peut router.' },
					{ q: 'Quel réseau client PostgreSQL doit-il accepter ?', options: ['127.0.0.0/8', 'Seulement 172.17.0.1', 'Le réseau public de l’hôte', '172.17.0.0/16'], answer: 3, why: 'Le conteneur se connecte depuis 172.17.0.6, dans 172.17.0.0/16. Tout autre conteneur du bridge aussi.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Un service de l’hôte écoute sur 127.0.0.1:8080. Un conteneur du bridge par défaut lance `curl http://localhost:8080/`. Que se passe-t-il ?',
			options: [
				'Il joint le service de l’hôte, car le loopback est partagé avec l’hôte',
				'La connexion est refusée : le conteneur a son propre `lo`, où rien n’écoute sur 8080',
				'Elle expire, car le bridge jette les paquets vers 127.0.0.1',
				'Il joint le service seulement si le port 8080 est publié avec `-p`'
			],
			answer: 1,
			why: 'Chaque namespace réseau a ses propres interfaces et ports, loopback compris. Dans le conteneur, 127.0.0.1 désigne le conteneur, et son noyau répond par un RST à un SYN vers un port fermé.'
		},
		{
			q: 'Sur l’hôte, tu lances `ip link set vetha14c4f7 down`. Que voit le conteneur sur `eth0` ?',
			options: [
				'Rien ne change, car les deux extrémités vivent dans des namespaces différents',
				'`eth0` reste up mais perd son adresse IP',
				'`eth0` est supprimée du namespace du conteneur',
				'Le lien de `eth0` tombe : une extrémité down met toute la paire down'
			],
			answer: 3,
			why: 'veth(4) : « When either device is down, the link state of the pair is down. » Mettre une interface down ne la supprime pas : `eth0` est toujours là, avec son lien down.'
		},
		{
			q: 'Un hôte Docker fait tourner 12 conteneurs, et pourtant `ip netns list` n’affiche rien. Pourquoi ?',
			options: [
				'Les conteneurs partagent le namespace réseau de l’hôte',
				'`ip netns list` ne montre que les namespaces qui ont une paire veth',
				'Docker range ses namespaces hors de `/var/run/netns`, le dossier que lit `ip netns`',
				'`ip netns list` demande l’option `-all` pour montrer ceux des autres utilisateurs'
			],
			answer: 2,
			why: '`ip netns list` affiche les namespaces nommés de `/var/run/netns`. Docker enregistre le namespace de chaque conteneur ailleurs, par exemple `/var/run/docker/netns/727b28c428b4` dans la sortie de `docker inspect`.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Suivre le `eth0` d’un conteneur jusqu’à son pair veth et au bridge, puis voir pourquoi `localhost` n’est pas la bonne adresse pour un service de l’hôte.',
		steps: [
			'Lance un conteneur : `docker run -d --name ns-lab alpine:3.20 sleep 3600`. Il faut Docker sous Linux : sous macOS, le côté hôte vit dans la VM de Docker.',
			'Regarde dedans : `docker exec ns-lab ip link`, `docker exec ns-lab ip route` et `docker exec ns-lab cat /sys/class/net/eth0/iflink`.',
			'Trouve le pair sur l’hôte : `ip -o link | grep "^$(docker exec ns-lab cat /sys/class/net/eth0/iflink):"`.',
			'Lance un serveur web sur le loopback de l’hôte : `python3 -m http.server 8099 --bind 127.0.0.1 &`, puis `docker exec ns-lab wget -qO- -T 3 http://localhost:8099/`. Arrête-le avec `kill %1`.',
			'Relance-le sur l’adresse du bridge (`ip -4 addr show docker0` l’affiche, 172.17.0.1 par défaut) : `python3 -m http.server 8099 --bind 172.17.0.1 & sleep 1`, puis `docker exec ns-lab wget -qO- -T 3 http://172.17.0.1:8099/`. Nettoie avec `kill %1 && docker rm -f ns-lab`.'
		],
		done: [
			'Dedans, `ip link` montre `eth0@ifN` et `iflink` affiche le même N.',
			'Sur l’hôte, l’interface N est une ligne `veth...@if2` avec `master docker0`.',
			'`wget` vers `localhost:8099` échoue avec `Connection refused`.',
			'`wget` vers `172.17.0.1:8099` affiche un listing HTML de dossier.'
		],
		solution: [
			'`ip route` dans le conteneur montre `default via 172.17.0.1 dev eth0` : l’adresse du bridge est le chemin du conteneur vers l’hôte.',
			'Le refus vient du `lo` du conteneur : rien n’écoute sur 8099 dans son namespace, et son noyau répond au SYN par un RST.',
			'Si le second `wget` expire au lieu de répondre, un pare-feu de l’hôte sur le hook input jette le trafic venu de `docker0`. C’est à nouveau le chapitre 33.'
		]
	},
	recall: {
		q: 'Comment le `eth0` d’un conteneur rejoint-il le bridge `docker0` de l’hôte ?',
		a: 'Par une paire veth. Un bout est `eth0` dans le namespace du conteneur, le pair (ici `vetha14c4f7`, index 559) est dans le namespace de l’hôte avec `master docker0`. Un paquet émis sur un bout arrive aussitôt sur l’autre.'
	},
	sources: [
		{ title: 'Page de manuel ip-netns(8)', url: 'https://man7.org/linux/man-pages/man8/ip-netns.8.html' },
		{ title: 'Page de manuel veth(4)', url: 'https://man7.org/linux/man-pages/man4/veth.4.html' },
		{ title: 'Page de manuel network_namespaces(7)', url: 'https://man7.org/linux/man-pages/man7/network_namespaces.7.html' },
		{ title: 'Page de manuel ip-link(8)', url: 'https://man7.org/linux/man-pages/man8/ip-link.8.html' },
		{ title: 'Doc Docker, Bridge network driver', url: 'https://docs.docker.com/engine/network/drivers/bridge/' },
		{ title: 'Code source des plugins CNI, plugins/main/bridge/bridge.go', url: `${CNI}/plugins/main/bridge/bridge.go` }
	]
};
