const TCPDUMP = 'https://github.com/the-tcpdump-group/tcpdump/blob/3a2f6acd865e5b845d9f63caf5f2c23cb73a2bc9';
const SYSCTL = 'https://github.com/torvalds/linux/blob/70dd4ee72eb2d5793c62e71c14e3aba78e5a4e56/Documentation/networking/ip-sysctl.rst';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'tcpdump',
	part: 'Déboguer le réseau',
	title: 'Lire tcpdump',
	minutes: 10,
	hook: [
		'Deux appels `curl` vers le même serveur échouent. Le premier affiche `Failed to connect to 192.168.128.2:8081 after 0 ms: Could not connect to server`. Le second affiche `Connection timed out after 8001 milliseconds` pour le port 9090. Dans les deux cas, le client n’a pas pu se connecter.',
		'tcpdump côté client raconte deux pannes différentes. Sur 8081, le serveur a répondu au SYN par un reset, 55 microsecondes plus tard. Sur 9090, le client a envoyé le même SYN 7 fois en 8 secondes sans rien recevoir.',
		'Les captures de ce chapitre ont été faites le 2026-10-17 entre deux conteneurs Docker sur une même machine, avec tcpdump 4.99.4. **Le serveur avait une règle iptables qui jetait tous les paquets vers le port 9090.**'
	],
	terms: [
		{ term: 'Capture filter', def: 'L’expression placée après les options, dans le langage de pcap-filter(7), par exemple `tcp and host 192.168.128.2`. tcpdump n’affiche que les paquets pour lesquels elle est vraie.' },
		{ term: 'Flags', def: 'Les bits de contrôle TCP, affichés entre crochets sous forme de lettres : `S` SYN, `F` FIN, `P` PSH, `R` RST et `.` pour ACK. `[S.]` est un SYN avec un ACK.' },
		{ term: 'Relative sequence number', def: 'Par défaut, tcpdump soustrait le premier numéro de séquence vu dans une conversation : le premier octet de données de chaque sens porte le numéro `1`. L’option `-S` affiche les numéros bruts.' },
		{ term: 'Retransmission', def: 'Un segment renvoyé parce qu’aucun ACK n’est revenu à temps. Dans tcpdump, tu vois le même émetteur et la même plage `seq` réapparaître.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['c["client 192.168.128.3"] -->|"Flags [S], seq 112890493, mss 1460, wscale 10"| s["serveur 192.168.128.2:8080"]'],
				highlight: ['c', 's'],
				note: 'Capture faite avec `tcpdump -i eth0 -nn -S "tcp and host 192.168.128.2"`. Le client ouvre depuis le port 37296 avec son numéro de séquence initial, 112890493. Les options proposent une MSS de 1460 octets et un window scale de 10.'
			},
			{
				add: ['s -->|"Flags [S.], seq 3443821786, ack 112890494"| c', 'c -->|"Flags [.], ack 3443821787"| s'],
				highlight: ['s', 'c'],
				note: 'Le serveur choisit son propre numéro initial et acquitte celui du client plus un : 112890493 + 1 = 112890494. Le `[.]` du client acquitte 3443821786 + 1. Les 3 paquets de la poignée de main tiennent en 56 microsecondes sur cette machine.'
			},
			{
				add: ['c -->|"Flags [P.], seq 112890494:112890576, length 82"| s', 's -->|"Flags [P.], length 155, puis length 874"| c'],
				highlight: ['c', 's'],
				note: 'Le client envoie 82 octets, 112890576 moins 112890494 : la requête `GET / HTTP/1.1`. Le serveur répond en 2 segments, 155 octets qui commencent par `HTTP/1.0 200 OK`, puis 874 octets de plus. Chaque côté acquitte ce qu’il a reçu.'
			},
			{
				add: ['c -->|"Flags [F.]"| s', 's -->|"Flags [F.], puis le client envoie [.]"| c'],
				highlight: ['c', 's'],
				note: 'Le client envoie `[F.]`, un FIN avec un ACK. Le serveur répond par son propre `[F.]` et le client envoie le dernier `[.]`. Un FIN consomme un numéro de séquence : le serveur acquitte donc 112890577.'
			},
			{
				add: ['c -->|"Flags [S] vers le port 8081"| p8081["port 8081 du serveur : personne n’écoute"]', 'p8081 -->|"Flags [R.], seq 0, win 0"| c'],
				highlight: ['p8081'],
				note: 'Aucun processus n’écoute sur 8081 : le noyau du serveur répond au SYN par `[R.]`, un reset, 55 microsecondes plus tard. La RFC 9293 donne au reset "sequence number zero" et lui fait acquitter le SYN : 1529160888 + 1 = 1529160889. curl abandonne après 0 ms.'
			},
			{
				add: ['c -->|"Flags [S] x7, même seq 4085220262"| p9090["port 9090 du serveur : DROP iptables"]'],
				highlight: ['p9090'],
				note: 'Rien ne revient, alors le client renvoie le même SYN. Les écarts valent 1, 1, 1, 1, 1 puis 2 secondes. C’est ce que la doc du noyau annonce pour `tcp_syn_linear_timeouts = 4` : "1, 1, 1, 1, 1, 2, 4, ...". curl s’arrête à son `--connect-timeout 8`.'
			}
		]
	},
	example: {
		title: 'print-tcp.c dans tcpdump : d’où viennent les flags et les numéros de séquence d’une ligne TCP',
		repo: 'the-tcpdump-group/tcpdump',
		url: `${TCPDUMP}/print-tcp.c#L105-L460`,
		lang: 'c',
		code: `const struct tok tcp_flag_values[] = {
        { TH_FIN, "F" },
        { TH_SYN, "S" },
        { TH_RST, "R" },
        { TH_PUSH, "P" },
        { TH_ACK, "." },
        { TH_URG, "U" },
        { TH_ECNECHO, "E" },
        { TH_CWR, "W" },
        { TH_AE, "e" },
        { 0, NULL }
};
…
        flags = tcp_get_flags(tp);
        ND_PRINT("Flags [%s]", bittok2str_nosep(tcp_flag_values, "none", flags));

        if (!ndo->ndo_Sflag && (flags & TH_ACK)) {
…
                        if (!th->nxt || (flags & TH_SYN)) {
                                /* didn't find it or new conversation */
…
                                th->addr = tha;
                                if (rev) {
                                        th->ack = seq;
                                        th->seq = ack - 1;
                                } else {
                                        th->seq = seq;
                                        th->ack = ack - 1;
                                }
                        } else {
                                if (rev) {
                                        seq -= th->ack;
                                        ack -= th->seq;
                                } else {
                                        seq -= th->seq;
                                        ack -= th->ack;
                                }
                        }
…
        length -= hlen;
        if (ndo->ndo_vflag > 1 || length > 0 || flags & (TH_SYN | TH_FIN | TH_RST)) {
                ND_PRINT(", seq %u", seq);

                if (length > 0) {
                        ND_PRINT(":%u", seq + length);
                }
        }`,
		notes: [
			'Les lignes 1 à 12 associent une lettre à chaque bit de flag, et la ligne 6 associe ACK à `.`. La ligne 15 affiche les lettres des bits à 1, ou `none`. Le `[R.]` du port 8081 porte donc RST et ACK.',
			'La ligne 17 n’active la numérotation relative que pour un paquet avec ACK et sans `-S`. Un SYN seul n’a pas d’ACK : il affiche toujours son numéro brut.',
			'Les lignes 19 à 29 notent les numéros initiaux la première fois qu’une conversation apparaît, ou sur un SYN, et affichent ce paquet en brut. Les lignes 30 à 37 les soustraient sur tous les paquets suivants. Dans une capture sans `-S`, le SYN-ACK affiche donc `seq 2994088075` et l’ACK suivant `ack 1`.',
			'Les lignes 41 à 45 affichent `seq first:last`, où last est exclu selon le man ("up to but not including"). `seq 1:38` transporte les octets 1 à 37. Rien dans ce fichier ne compare un paquet aux précédents : tcpdump ne signale jamais une retransmission, c’est à toi de repérer la plage répétée.'
		]
	},
	tradeoff: {
		gain: [
			'tcpdump montre ce qui est passé sur l’interface : ici un reset en 55 microsecondes sur 8081 et 7 SYN sans réponse sur 9090, là où curl n’affichait qu’une ligne d’erreur à chaque fois.',
			'`-w file` enregistre les paquets pour plus tard, et relire un fichier enregistré ne demande aucun privilège.',
			'Un filtre comme `tcp[tcpflags] & (tcp-rst) != 0` réduit la capture d’une machine chargée aux seuls paquets qui t’intéressent.'
		],
		cost: [
			'Lancé en utilisateur normal pour capturer sur `lo`, tcpdump 4.99.4 a affiché "You don\'t have permission to perform this capture on that device".',
			'Sur un lien chargé, le noyau peut jeter des paquets avant que tcpdump les voie. tcpdump les compte en "dropped by kernel" en sortant.',
			'En HTTPS, la charge utile après la poignée de main TLS est chiffrée. Tu vois les flags, les tailles et les temps. La ligne de requête reste illisible.'
		]
	},
	task: {
		prompt: 'Un client reste bloqué sur une requête. Tu lances `tcpdump -i eth0 -nn "tcp port 8080"` sur le client et tu obtiens ces lignes (options coupées) :\n`23:54:12.111171 IP 192.168.128.3.55880 > 192.168.128.2.8080: Flags [S], seq 1934350538`\n`23:54:12.111241 IP 192.168.128.2.8080 > 192.168.128.3.55880: Flags [S.], seq 2994088075, ack 1934350539`\n`23:54:12.111254 IP 192.168.128.3.55880 > 192.168.128.2.8080: Flags [.], ack 1`\n`23:54:15.111383 ... > 192.168.128.2.8080: Flags [P.], seq 1:38, ack 1, length 37: HTTP: GET / HTTP/1.1`\n`23:54:15.319701 ... Flags [P.], seq 1:38, ack 1, length 37`\n`23:54:15.527713 ... Flags [P.], seq 1:38, ack 1, length 37`\n`23:54:15.935701 ... Flags [P.], seq 1:38, ack 1, length 37`\n`23:54:16.799701 ... Flags [P.], seq 1:38, ack 1, length 37`\n`23:54:18.464694 ... Flags [P.], seq 1:38, ack 1, length 37`\n`23:54:21.727700 ... Flags [P.], seq 1:38, ack 1, length 37`\nLa connexion s’est-elle ouverte ? Qu’est-ce qui ne va pas, et le serveur refuse-t-il ou se tait-il ?',
		hint: 'Lis les 3 premières lignes comme une poignée de main. Cherche ensuite une ligne venant de 192.168.128.2 après 23:54:12, et regarde les écarts entre les lignes répétées.',
		answer: [
			'La connexion s’est ouverte : `[S]`, `[S.]` avec `ack 1934350539`, puis `[.]` avec `ack 1`, le tout en 83 microsecondes.',
			'À 23:54:15.111, le client envoie la requête de 37 octets, `seq 1:38`. Le serveur ne l’acquitte jamais, et le même `seq 1:38` repart 6 fois. Ce sont des retransmissions.',
			'Les écarts grandissent : 208, 208, 408, 864, 1665 puis 3263 ms. Après les deux premiers, le client attend à peu près deux fois plus longtemps avant chaque nouvel essai.',
			'Le serveur se tait, aucun `[R]` n’apparaît. Dans cette capture, une règle iptables ajoutée sur le serveur après la poignée de main jetait tous les paquets vers le port 8080. Un port fermé aurait répondu par un reset.'
		],
		steps: [
			{
				title: 'Lis la poignée de main',
				questions: [
					{ q: 'Que sont les 3 premières lignes ?', options: ['Trois essais du même SYN', 'Un reset et deux relances', 'Une poignée de main TCP : `[S]`, `[S.]`, `[.]`', 'La requête et sa réponse'], answer: 2, why: 'Un SYN, un SYN avec ACK, puis un ACK seul. C’est ainsi que s’ouvre toute connexion TCP.' },
					{ q: 'Pourquoi le serveur envoie-t-il `ack 1934350539` ?', options: ['C’est le `seq` du client plus un', 'C’est un nombre au hasard', 'C’est le propre `seq` du serveur', 'Il compte les octets reçus'], answer: 0, why: 'Un SYN consomme un numéro de séquence : le serveur acquitte 1934350538 + 1.' },
					{ q: 'Pourquoi la troisième ligne affiche-t-elle `ack 1` et pas un grand nombre ?', options: ['Le serveur a remis le compteur à zéro', 'Un seul octet a été reçu', 'La capture a perdu des paquets', 'tcpdump affiche des numéros relatifs'], answer: 3, why: 'Sans `-S`, tcpdump soustrait les numéros initiaux qu’il a notés : le premier octet de chaque sens vaut `1`.' },
					{ q: 'La connexion s’est-elle donc ouverte ?', options: ['Non, le serveur n’a jamais répondu', 'Oui, les trois paquets de la poignée de main sont là', 'À moitié : le serveur attend', 'Non, `[.]` veut dire que le client abandonne'], answer: 1, why: 'Les trois paquets tiennent en 83 microsecondes à 23:54:12. La connexion est ouverte.' }
				]
			},
			{
				title: 'Trouve la requête',
				questions: [
					{ q: 'Quand le client envoie-t-il sa requête ?', options: ['À 23:54:12.111254, avec l’ACK', 'À 23:54:15.111383, dans le premier `[P.]`', 'À 23:54:21.727700, la dernière ligne', 'Jamais : aucune ligne ne parle d’HTTP'], answer: 1, why: 'La première ligne `[P.]` porte `HTTP: GET / HTTP/1.1`, trois secondes après la poignée de main.' },
					{ q: 'Que veut dire `seq 1:38, length 37` ?', options: ['38 octets, numérotés de 1 à 38', '37 paquets à la suite', 'Les octets 1 à 37, fin exclue', 'Le paquet 1 sur 38'], answer: 2, why: 'tcpdump affiche `seq premier:dernier`, où le dernier est « up to but not including ». 38 - 1 = 37 octets.' },
					{ q: 'Y a-t-il une ligne venant de 192.168.128.2 après 23:54:12 ?', options: ['Non, aucune', 'Oui, un ACK pour `seq 1:38`', 'Oui, un reset', 'Oui, la réponse HTTP'], answer: 0, why: 'Après le SYN-ACK, toutes les lignes vont du client au serveur. Rien ne revient.' },
					{ q: 'Que t’apprend l’absence d’ACK pour la requête ?', options: ['Le serveur l’a reçue et tarde à répondre', 'Le client l’a envoyée au mauvais port', 'Les octets ou leur ACK se sont perdus', 'La requête était trop grosse'], answer: 2, why: 'Un serveur qui a reçu les octets les acquitte, même avant de répondre. Pas d’ACK veut dire que des paquets se sont perdus en route, dans un sens ou dans l’autre.' }
				]
			},
			{
				title: 'Repère les retransmissions',
				questions: [
					{ q: 'Comment repères-tu une retransmission dans tcpdump ?', options: ['tcpdump écrit `retransmit` sur la ligne', 'Le même émetteur renvoie la même plage `seq`', 'Les flags passent à `[R]`', 'La longueur double'], answer: 1, why: 'Rien dans `print-tcp.c` ne compare les paquets : tcpdump n’en signale jamais. C’est toi qui repères la plage répétée.' },
					{ q: 'Combien de fois `seq 1:38` repart-il après le premier essai ?', options: ['3', '7', '1', '6'], answer: 3, why: 'Il y a 7 lignes avec `seq 1:38` : le premier envoi, puis 6 retransmissions.' },
					{ q: 'Quels sont les écarts entre les essais ?', options: ['208, 208, 408, 864, 1665 et 3263 ms', '1 s à chaque fois', '200 ms à chaque fois', '1, 1, 1, 1, 1 et 2 s'], answer: 0, why: 'Soustrais chaque horodatage du suivant. 1, 1, 1, 1, 1, 2 s, c’est le schéma des relances de SYN, pas celui-ci.' },
					{ q: 'Que montre la croissance des écarts ?', options: ['Le réseau ralentit', 'Le serveur envoie plus de données', 'Le client double son attente à chaque essai', 'tcpdump prend du retard'], answer: 2, why: 'Après les deux premiers, chaque écart vaut environ le double du précédent. C’est le client qui espace ses essais en attendant un ACK.' }
				]
			},
			{
				title: 'Refuse ou se tait ?',
				questions: [
					{ q: 'Y a-t-il un `[R]` dans la capture ?', options: ['Oui, après le dernier essai', 'Non, aucun', 'Oui, dans la poignée de main', 'Seulement du côté client'], answer: 1, why: 'Aucune ligne ne porte le flag `R`. Le serveur n’a jamais envoyé de reset.' },
					{ q: 'Sur un client chargé, quel filtre fait ressortir tout de suite un reset sur le port 8080 ?', options: ['`tcp port 8080 and tcp[tcpflags] & (tcp-rst) != 0`', '`tcp port 8080 and tcp[tcpflags] & (tcp-syn|tcp-fin) != 0`', '`tcp port 8080 and len > 37`', '`host 192.168.128.3`'], answer: 0, why: 'Le test `tcp-rst` ne garde que les paquets qui portent le flag reset. Une capture vide confirme alors d’un coup d’œil que le serveur n’a jamais refusé.' },
					{ q: 'Le serveur refuse-t-il ou se tait-il ?', options: ['Il refuse : il a fermé le port', 'Il refuse : la fenêtre est pleine', 'Ni l’un ni l’autre : le client est cassé', 'Il se tait : les paquets vers 8080 restent sans réponse'], answer: 3, why: 'Silence et retransmissions désignent un drop. Dans cette capture, une règle iptables ajoutée après la poignée de main jetait tous les paquets vers 8080.' },
					{ q: 'La poignée de main a marché, puis plus rien n’est revenu pendant plus de 6 s de relances. Quelle cause colle aux deux faits ?', options: ['Un port sans processus à l’écoute', 'Un client qui vise une mauvaise adresse de serveur', 'Un drop qui a commencé après la poignée de main', 'Un serveur qui ne répond qu’aux SYN, sur tous les ports'], answer: 2, why: 'Un port fermé ou une mauvaise adresse auraient aussi cassé la poignée de main. Dans cette capture, une règle iptables ajoutée sur le serveur après la poignée de main jetait tous les paquets vers 8080.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Tu envoies un SYN au port 8081 et tu reçois `Flags [R.], seq 0, ack 1529160889, win 0` 55 microsecondes plus tard. Qu’est-ce que ça veut dire ?',
			options: [
				'Un pare-feu sur le chemin a jeté le SYN, et le client va le renvoyer',
				'La machine répond et aucun processus n’écoute sur le port 8081',
				'Le serveur a accepté la connexion puis l’a fermée après la requête',
				'La fenêtre de réception du serveur est pleine, le client doit attendre'
			],
			answer: 1,
			why: 'La RFC 9293 fait répondre par un reset à un SYN qui vise un port sans connexion. `connect()` échoue alors avec `ECONNREFUSED`, "no one listening on the remote address". Un SYN jeté donne au contraire du silence et des retransmissions.'
		},
		{
			q: 'Quel filtre de capture garde seulement les paquets qui ouvrent ou ferment une connexion TCP, ceux qui ont SYN ou FIN ?',
			options: [
				'`tcp[tcpflags] == (tcp-syn|tcp-fin)`',
				'`tcp and (syn or fin)`',
				'`tcp[tcpflags] & (tcp-syn|tcp-fin) != 0`',
				'`tcp port syn or tcp port fin`'
			],
			answer: 2,
			why: 'Le `&` ne garde que les bits SYN et FIN de l’octet de flags, et `!= 0` est vrai si l’un des deux est à 1. La version `==` exige un octet égal à SYN plus FIN exactement : un SYN seul ne passe pas.'
		},
		{
			q: 'Le SYN affiche `wscale 10`. Les paquets suivants du même côté affichent `win 63`. Combien d’octets l’autre côté peut-il envoyer avant d’attendre ?',
			options: [
				'63 octets, la valeur affichée par tcpdump',
				'64 512 octets : 63 << 10',
				'630 octets : 63 fois le facteur 10',
				'1460 octets, une MSS par fenêtre'
			],
			answer: 1,
			why: 'Selon la RFC 7323, l’émetteur décale sa vraie fenêtre vers la droite du nombre de bits convenu. tcpdump affiche le champ brut de 16 bits : 63 << 10 = 64 512 octets. La fenêtre du SYN n’est jamais mise à l’échelle, d’où le 64240 affiché.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Capturer une connexion qui marche, une refusée et une jetée entre deux conteneurs, puis lire chacune dans tcpdump.',
		steps: [
			'Crée un réseau et deux conteneurs : `docker network create tcpdlab`, `docker run -d --name tcpd-srv --network tcpdlab --cap-add NET_ADMIN nicolaka/netshoot:v0.13 python3 -m http.server 8080` et `docker run -d --name tcpd-cli --network tcpdlab nicolaka/netshoot:v0.13 sleep 3600`.',
			'Lance une capture sur le client : `docker exec -d tcpd-cli tcpdump -i eth0 -nn -w /tmp/c.pcap "tcp port 8080 or tcp port 8081"`.',
			'Fais deux appels : `docker exec tcpd-cli curl -s -o /dev/null -w \'%{http_code}\\n\' http://tcpd-srv:8080/`, puis `docker exec tcpd-cli curl -sS http://tcpd-srv:8081/`.',
			'Jette le port 8080 sur le serveur et rappelle : `docker exec tcpd-srv iptables -A INPUT -p tcp --dport 8080 -j DROP`, puis `docker exec tcpd-cli curl -sS --connect-timeout 8 http://tcpd-srv:8080/`.',
			'Arrête et lis : `docker exec tcpd-cli pkill tcpdump`, puis `docker exec tcpd-cli tcpdump -nn -r /tmp/c.pcap`. Nettoie avec `docker rm -f tcpd-srv tcpd-cli && docker network rm tcpdlab`.'
		],
		done: [
			'Le premier appel affiche `200`, et la capture montre `[S]`, `[S.]`, `[.]`, puis des lignes `[P.]` et un `[F.]` de chaque côté.',
			'L’appel vers 8081 échoue avec `curl: (7)`, et la capture montre `[S]` puis `[R.], seq 0` venant du serveur.',
			'L’appel jeté échoue avec `curl: (28)` au bout de 8 s, et la capture montre plusieurs fois le même `[S]` avec le même `seq`, sans réponse.'
		],
		solution: [
			'Dans la première connexion, vérifie le calcul : l’`ack` du serveur dans `[S.]` vaut le `seq` du SYN client plus un, et la ligne client suivante affiche `ack 1`.',
			'Le `[R.]` revient en bien moins d’une milliseconde : c’est le noyau du serveur qui dit que rien n’écoute sur 8081.',
			'Les SYN répétés sont des retransmissions que tu repères à l’œil. Les écarts suivent les réglages `tcp_syn_linear_timeouts` et `tcp_syn_retries` de ton noyau. Sur un hôte Linux, `sysctl net.ipv4.tcp_syn_linear_timeouts` affiche le premier ; les noyaux plus anciens ne l’ont pas.'
		]
	},
	recall: {
		q: 'Dans tcpdump, à quoi ressemble une connexion refusée, et à quoi ressemble un SYN jeté avec les réglages Linux par défaut ?',
		a: 'Refusée : le serveur répond tout de suite au SYN par `Flags [R.]`. Jeté : le même `Flags [S]` avec le même `seq` revient avec des écarts de 1, 1, 1, 1, 1 puis 2 secondes, et rien ne revient.'
	},
	sources: [
		{ title: 'Page de man tcpdump(1), tcpdump.org, lue le 2026-10-17', url: 'https://www.tcpdump.org/manpages/tcpdump.1.html' },
		{ title: 'Page de man pcap-filter(7), tcpdump.org', url: 'https://www.tcpdump.org/manpages/pcap-filter.7.html' },
		{ title: 'Source de tcpdump, print-tcp.c', url: `${TCPDUMP}/print-tcp.c` },
		{ title: 'Doc du noyau Linux, ip-sysctl : tcp_syn_retries et tcp_syn_linear_timeouts', url: `${SYSCTL}#L1081-L1158` },
		{ title: 'RFC 9293, Transmission Control Protocol, section 3.5.2 Reset Generation', url: 'https://www.rfc-editor.org/rfc/rfc9293#section-3.5.2' },
		{ title: 'connect(2), man7.org', url: 'https://man7.org/linux/man-pages/man2/connect.2.html' },
		{ title: 'RFC 7323, TCP Extensions for High Performance (window scale)', url: 'https://www.rfc-editor.org/rfc/rfc7323#section-2.2' }
	]
};
