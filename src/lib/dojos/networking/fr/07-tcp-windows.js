const LINUX = 'https://github.com/torvalds/linux/blob/70dd4ee72eb2d5793c62e71c14e3aba78e5a4e56';
const CONG = `${LINUX}/net/ipv4/tcp_cong.c`;
const TCPH = `${LINUX}/include/net/tcp.h`;
const SYSCTL = `${LINUX}/Documentation/networking/ip-sysctl.rst`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'tcp-windows',
	part: 'Les paquets',
	title: 'Contrôle de flux et de congestion',
	minutes: 10,
	hook: [
		'Par défaut, une nouvelle connexion TCP sous Linux envoie au plus 10 segments avant le retour du premier ACK. Avec des segments de 1460 octets, cela fait 14 600 octets au premier aller-retour.',
		'La RFC 6928 compte les allers-retours pour des transferts plus gros, sans perte et avec des ACK retardés. Avec ce départ, 120 segments (environ 175 KB) demandent 5 allers-retours. Sur un chemin à 100 ms d’aller-retour, le dernier octet arrive au bout d’une demi-seconde, même sur un lien à 10 Gbit/s.',
		'Le récepteur met dans chaque ACK le nombre d’octets qu’il peut encore mettre en tampon. L’émetteur garde sa propre estimation de ce que le chemin supporte. Les données non acquittées restent sous le plus petit des deux nombres.'
	],
	terms: [
		{ term: 'Fenêtre de réception (rwnd)', def: 'Le nombre d’octets que le récepteur dit pouvoir accepter, envoyé dans le champ Window de 16 bits de chaque segment et multiplié par le facteur de window scaling.' },
		{ term: 'Fenêtre de congestion (cwnd)', def: 'La limite propre à l’émetteur sur les données non acquittées, en segments sous Linux. Elle part de 10 (`TCP_INIT_CWND`) et bouge à chaque ACK et à chaque perte.' },
		{ term: 'Slow start', def: 'La phase où cwnd gagne un segment par segment acquitté, ce qui la double à chaque aller-retour.' },
		{ term: 'ssthresh', def: 'Seuil de slow start : en dessous, l’émetteur est en slow start, au-dessus, cwnd gagne environ un segment par aller-retour. Une perte le fixe à environ la moitié de cwnd.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['s["Émetteur : cwnd = 10 segments"] -->|"10 segments"| r["Récepteur : annonce rwnd"]'],
				highlight: ['s'],
				note: 'Après la poignée de main, l’émetteur peut avoir 10 segments non acquittés. La RFC 5681 : "The minimum of cwnd and rwnd governs data transmission." Sous Linux, le tampon de réception par défaut de 131072 octets "results in initial window of 65535" octets. Ici, 10 segments font 14 600 octets : cwnd est donc la plus petite des deux limites.'
			},
			{
				add: ['r -.->|"ACK des 10 segments"| s', 's -->|"20 segments"| r'],
				highlight: ['s'],
				note: 'En slow start, chaque segment acquitté ajoute un à cwnd. Un aller-retour complet d’ACK pour 10 segments porte cwnd à 20, le suivant à 40, puis 80. La fenêtre double à chaque aller-retour tant que cwnd reste sous ssthresh et qu’aucun segment n’est perdu.'
			},
			{
				add: ['loss["Un segment perdu"] --> half["ssthresh = cwnd / 2, puis + 1 segment par aller-retour"]', 's --> loss'],
				highlight: ['loss', 'half'],
				note: 'Quand l’émetteur détecte une perte, Reno fixe ssthresh à la moitié de cwnd, jamais sous 2 segments. Avec cwnd au-dessus de ssthresh, l’émetteur est en évitement de congestion et ajoute environ un segment par aller-retour. Après un timeout de retransmission, la RFC 5681 ramène cwnd à 1 segment et le slow start repart jusqu’à ssthresh.'
			},
			{
				add: ['idle["Connexion inactive plus d’un RTO"] --> s'],
				highlight: ['idle'],
				note: 'Avec `tcp_slow_start_after_idle = 1`, le défaut sous Linux, une connexion qui n’a rien envoyé pendant plus d’un RTO divise cwnd par deux pour chaque RTO de silence, jusqu’à 10. Une connexion HTTP keep-alive qui attend quelques secondes entre deux requêtes démarre sa réponse suivante presque comme une connexion neuve.'
			}
		]
	},
	example: {
		title: 'net/ipv4/tcp_cong.c : slow start, croissance additive et Reno',
		repo: 'torvalds/linux',
		url: `${CONG}#L456-L520`,
		lang: 'c',
		code: `__bpf_kfunc u32 tcp_slow_start(struct tcp_sock *tp, u32 acked)
{
	u32 cwnd = min(tcp_snd_cwnd(tp) + acked, tp->snd_ssthresh);

	acked -= cwnd - tcp_snd_cwnd(tp);
	tcp_snd_cwnd_set(tp, min(cwnd, tp->snd_cwnd_clamp));

	return acked;
}
…
__bpf_kfunc void tcp_cong_avoid_ai(struct tcp_sock *tp, u32 w, u32 acked)
{
	/* If credits accumulated at a higher w, apply them gently now. */
	if (tp->snd_cwnd_cnt >= w) {
		tp->snd_cwnd_cnt = 0;
		tcp_snd_cwnd_set(tp, tcp_snd_cwnd(tp) + 1);
	}

	tp->snd_cwnd_cnt += acked;
	if (tp->snd_cwnd_cnt >= w) {
		u32 delta = tp->snd_cwnd_cnt / w;

		tp->snd_cwnd_cnt -= delta * w;
		tcp_snd_cwnd_set(tp, tcp_snd_cwnd(tp) + delta);
	}
	tcp_snd_cwnd_set(tp, min(tcp_snd_cwnd(tp), tp->snd_cwnd_clamp));
}
…
__bpf_kfunc void tcp_reno_cong_avoid(struct sock *sk, u32 ack, u32 acked)
{
	struct tcp_sock *tp = tcp_sk(sk);

	if (!tcp_is_cwnd_limited(sk))
		return;

	/* In "safe" area, increase. */
	if (tcp_in_slow_start(tp)) {
		acked = tcp_slow_start(tp, acked);
		if (!acked)
			return;
	}
	/* In dangerous area, increase slowly. */
	tcp_cong_avoid_ai(tp, tcp_snd_cwnd(tp), acked);
}
…
__bpf_kfunc u32 tcp_reno_ssthresh(struct sock *sk)
{
	const struct tcp_sock *tp = tcp_sk(sk);

	return max(tcp_snd_cwnd(tp) >> 1U, 2U);
}`,
		notes: [
			'La ligne 3 est le slow start : la nouvelle cwnd vaut l’ancienne plus le nombre de segments couverts par cet ACK, sans dépasser ssthresh. La ligne 5 garde les segments acquittés en trop une fois ssthresh atteint, et la ligne 8 les passe à l’évitement de congestion.',
			'Les lignes 19 à 24 comptent les segments acquittés dans `snd_cwnd_cnt`. Chaque fois que le compte atteint `w`, la cwnd actuelle, la ligne 24 ajoute un segment. Une fenêtre complète d’ACK prend un aller-retour, donc cwnd gagne un segment par aller-retour.',
			'Les lignes 33 et 34 bloquent toute croissance quand l’application n’a pas rempli la fenêtre. Un émetteur qui écrit 2 KB par seconde garde sa cwnd telle quelle.',
			'La ligne 50 est la réaction à une perte : la moitié de cwnd, au moins 2. La RFC 5681 l’écrit `max (FlightSize / 2, 2*SMSS)`. Linux utilise CUBIC par défaut : son `cubictcp_cong_avoid` appelle le même `tcp_slow_start`, puis fait croître cwnd selon une courbe cubique.'
		]
	},
	tradeoff: {
		gain: [
			'Un émetteur qui ne sait rien du chemin y met 10 segments, puis ne double que quand les ACK prouvent que le chemin les a livrés.',
			'Diviser cwnd par deux à chaque perte fait ralentir tous les émetteurs derrière un lien plein : la file se vide et le lien reste utilisable.'
		],
		cost: [
			'Les petits transferts paient en allers-retours : 120 segments en demandent 5 avec une fenêtre initiale de 10, quelle que soit la bande passante.',
			'Un récepteur bloqué à une fenêtre de 65 535 octets, sans window scaling, limite un chemin à 100 ms à 65 535 × 8 / 0,1 s, environ 5,2 Mbit/s.',
			'Avec `tcp_slow_start_after_idle = 1`, une connexion de pool restée muette 1 seconde avec un RTO de 200 ms divise sa cwnd par deux jusqu’à 4 fois.'
		]
	},
	task: {
		prompt: 'Cette ligne de `ss -tin` vient d’un upload lancé dans cette session avec `curl --data-binary` vers `speed.cloudflare.com`, 0,3 s après le départ : `cubic wscale:13,10 rto:205 rtt:4.781/0.586 mss:1388 cwnd:51 ssthresh:35 bytes_retrans:2776 send 118448860bps snd_wnd:229376`. L’émetteur est-il en slow start ? Quelle limite, cwnd ou la fenêtre de réception, fixe la quantité en vol ? Vérifie le chiffre `send`.',
		hint: 'Compare cwnd et ssthresh. Convertis cwnd en octets avec `mss`, puis compare avec `snd_wnd`, la fenêtre annoncée par le pair, en octets. `ss` calcule `send` comme cwnd × mss × 8 / rtt.',
		answer: [
			'cwnd vaut 51 et ssthresh 35. Le slow start ne tourne que tant que cwnd < ssthresh : l’émetteur est donc en évitement de congestion. `bytes_retrans:2776` montre qu’une perte a déjà eu lieu, et c’est elle qui a fixé ssthresh.',
			'cwnd en octets : 51 × 1388 = 70 788. Le récepteur annonce 229 376 octets. La plus petite valeur gouverne : c’est cwnd qui limite cet upload.',
			'Débit : 70 788 × 8 = 566 304 bits par aller-retour, divisés par 0,004781 s, donnent 118,4 Mbit/s. Cela correspond à `send 118448860bps`.',
			'0,3 s plus tard, la même connexion affichait `cwnd:61 ssthresh:41` : en évitement de congestion, cwnd continue de grandir lentement.'
		],
		steps: [
			{
				title: 'Lis les champs',
				questions: [
					{ q: 'Que compte `cwnd:51` ?', options: ['51 segments que l’émetteur peut avoir sans ACK', '51 Ko de données en vol', '51 ACK reçus jusqu’ici', '51 ms d’aller-retour'], answer: 0, why: 'Sous Linux, cwnd se compte en segments. C’est la limite propre à l’émetteur sur les données non acquittées.' },
					{ q: 'Qu’est-ce que `snd_wnd:229376` ?', options: ['La cwnd de l’émetteur, en octets', 'La fenêtre de réception annoncée par le pair, en octets', 'Les octets envoyés depuis le départ', 'Le tampon d’envoi de curl'], answer: 1, why: '`snd_wnd` est la fenêtre de réception annoncée par le pair, déjà ramenée en octets. C’est le côté rwnd de la comparaison.' },
					{ q: 'Pourquoi as-tu besoin de `mss:1388` ?', options: ['C’est le RTO, en millisecondes', 'C’est le facteur de window scaling', 'Il convertit cwnd de segments en octets', 'C’est le nombre de segments par seconde'], answer: 2, why: 'cwnd compte des segments et la fenêtre de réception des octets. Multiplier par la taille de segment permet de les comparer.' },
					{ q: 'Que te donne `rtt:4.781/0.586` ?', options: ['Un RTO de 4,781 s', '4,781 retransmissions par seconde', 'Un upload qui a duré 4,781 s', 'Un aller-retour lissé de 4,781 ms, avec une variation de 0,586 ms'], answer: 3, why: '`ss` affiche l’aller-retour lissé et sa variation en millisecondes. Le RTO est le champ séparé `rto:205`.' }
				]
			},
			{
				title: 'Dis si c’est du slow start',
				questions: [
					{ q: 'cwnd vaut 51 et ssthresh 35. Dans quelle phase est l’émetteur ?', options: ['En slow start, car cwnd grandit encore', 'En évitement de congestion, car cwnd est au-dessus de ssthresh', 'En slow start, car ssthresh est sous 64', 'En reprise après un timeout, avec cwnd revenue à 1'], answer: 1, why: 'Le slow start ne tourne que tant que cwnd < ssthresh. cwnd grandit dans les deux phases, juste plus lentement en évitement de congestion.' },
					{ q: 'Que t’apprend `bytes_retrans:2776` ?', options: ['Deux segments de 1388 octets ont été renvoyés : une perte a eu lieu', 'Rien n’a encore été perdu', 'Le récepteur a refusé 2776 octets', 'L’upload a envoyé 2776 octets jusqu’ici'], answer: 0, why: '2776 vaut 2 × 1388. Des octets ont été retransmis, donc l’émetteur a détecté une perte.' },
					{ q: 'Qu’est-ce qui a fixé ssthresh à 35 ?', options: ['La fenêtre initiale de 10 segments', 'La fenêtre de réception du pair', 'La perte que montre `bytes_retrans`', 'Le RTO de 205 ms'], answer: 2, why: 'Une perte fixe ssthresh à environ la moitié de cwnd, ce qui termine le slow start. `bytes_retrans` montre que cette perte a eu lieu.' },
					{ q: '0,3 s plus tard, la ligne affiche `cwnd:61 ssthresh:41`. Que s’est-il passé ?', options: ['L’émetteur est revenu en slow start', 'Une autre perte a divisé cwnd par deux', 'La fenêtre de réception a rétréci', 'cwnd a continué de grandir lentement en évitement de congestion'], answer: 3, why: 'cwnd est passée de 51 à 61 et reste au-dessus de ssthresh, donc l’émetteur est toujours en évitement de congestion.' }
				]
			},
			{
				title: 'Trouve la limite',
				questions: [
					{ q: 'Combien d’octets cwnd laisse-t-elle en vol ?', options: ['51 × 1388 = 70 788 octets', '51 × 1460 = 74 460 octets', '35 × 1388 = 48 580 octets', '51 × 8 = 408 octets'], answer: 0, why: 'Prends le `mss` de cette connexion, 1388, pas le 1460 habituel.' },
					{ q: 'Quel nombre est le plus petit ?', options: ['La fenêtre de réception, 229 376 octets', 'cwnd, 70 788 octets', 'Ils sont égaux', 'ssthresh en octets'], answer: 1, why: '70 788 fait moins du tiers de 229 376.' },
					{ q: 'Quelle valeur gouverne les données en vol ?', options: ['La fenêtre de réception seule', 'La plus grande de cwnd et de la fenêtre de réception', 'La plus petite de cwnd et de la fenêtre de réception', 'cwnd plus la fenêtre de réception'], answer: 2, why: 'La RFC 5681 : "The minimum of cwnd and rwnd governs data transmission."' },
					{ q: 'Qu’est-ce qui limite donc cet upload ?', options: ['Le tampon du récepteur', 'Le facteur de window scaling', 'Le RTO', 'cwnd, l’estimation par l’émetteur de ce que le chemin supporte'], answer: 3, why: 'Le récepteur pourrait en prendre trois fois plus. L’émetteur se retient à cause de sa propre fenêtre de congestion.' }
				]
			},
			{
				title: 'Vérifie le chiffre send',
				questions: [
					{ q: 'Comment `ss` calcule-t-il `send` ?', options: ['cwnd × mss × 8 / rtt', 'snd_wnd × 8 / rtt', 'cwnd / rtt', 'mss × 8 / rto'], answer: 0, why: 'Une fenêtre d’octets par aller-retour, fois 8 pour avoir des bits.' },
					{ q: 'Combien de bits partent par aller-retour ?', options: ['70 788', '566 304', '229 376', '1 835 008'], answer: 1, why: '70 788 octets × 8 = 566 304 bits.' },
					{ q: 'Par quel rtt divises-tu ?', options: ['4,781 s', '0,205 s', '0,004781 s', '0,000586 s'], answer: 2, why: '4,781 ms font 0,004781 s. Le 205 est le RTO et le 0,586 la variation.' },
					{ q: 'Qu’obtiens-tu ?', options: ['Environ 566 Mbit/s', 'Environ 11,8 Mbit/s', 'Environ 1,18 Gbit/s', 'Environ 118,4 Mbit/s, ce qui correspond à `send 118448860bps`'], answer: 3, why: '566 304 / 0,004781 donne environ 118,4 millions de bits par seconde.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Un serveur envoie une réponse de 120 segments sur une connexion neuve avec une fenêtre initiale de 10, sans perte, sur un chemin à 100 ms avec des liens à 10 Gbit/s. Combien de temps environ avant l’arrivée du dernier octet ?',
			options: [
				'Environ 100 ms, car 10 Gbit/s envoie 175 KB en une fraction de milliseconde',
				'Environ 1,2 s, car chaque segment attend son propre ACK',
				'Environ 500 ms, car cwnd met 5 allers-retours à couvrir 120 segments',
				'Environ 200 ms, car la fenêtre de réception fait 65 535 octets'
			],
			answer: 2,
			why: 'Le slow start limite les données par aller-retour à cwnd, qui part de 10 et double. La RFC 6928 compte 5 allers-retours pour 120 segments avec des ACK retardés. La vitesse du lien ne change pas ce compte.'
		},
		{
			q: 'En plein transfert, un segment est perdu alors que cwnd vaut 80. À combien Reno fixe-t-il ssthresh ?',
			options: [
				'40, la moitié de cwnd, puis cwnd gagne environ 1 segment par aller-retour',
				'10, la fenêtre initiale, et le slow start repart jusqu’à 80',
				'79, un de moins que cwnd, pour ralentir à peine',
				'2, le minimum, et l’émetteur repart presque de zéro'
			],
			answer: 0,
			why: '`tcp_reno_ssthresh` renvoie `max(cwnd >> 1, 2)`, donc 80 donne 40. Au-dessus de ssthresh, `tcp_cong_avoid_ai` ajoute un segment par fenêtre d’ACK. La chute à 1 segment n’arrive qu’après un timeout de retransmission.'
		},
		{
			q: 'Un client d’API envoie une petite requête toutes les 2 secondes sur une connexion keep-alive. Le RTO vaut 200 ms. Pourquoi chaque grosse réponse démarre-t-elle lentement ?',
			options: [
				'Les connexions keep-alive sautent le slow start et attendent que la fenêtre de réception s’ouvre',
				'L’inactivité dure plus d’un RTO, donc Linux ramène cwnd vers 10',
				'Le serveur ferme et rouvre la connexion après 2 secondes de silence',
				'cwnd repasse à 1 segment après chaque réponse, faute de données en vol'
			],
			answer: 1,
			why: 'Avec `tcp_slow_start_after_idle = 1`, `tcp_cwnd_restart` divise cwnd par deux pour chaque RTO d’inactivité, jusqu’à la fenêtre initiale. Deux secondes de silence permettent 9 divisions, ce qui ramène une cwnd allant jusqu’à 5 120 à 10.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Voir le slow start coûter des allers-retours sur un lien rapide : ajouter 100 ms d’aller-retour au loopback et chronométrer un petit et un gros téléchargement.',
		steps: [
			'Lance un conteneur qui a le droit de changer son propre réseau : `docker run --rm -it --cap-add NET_ADMIN nicolaka/netshoot:v0.13`.',
			'Dedans, fais ressembler le loopback à un vrai chemin, avec des paquets de 1500 octets et 50 ms dans chaque sens : `ip link set lo mtu 1500 && tc qdisc add dev lo root netem delay 50ms`. Vérifie avec `ping -c2 127.0.0.1`.',
			'Sers un fichier de 10 Ko et un de 175 Ko : `cd /tmp && head -c 10000 /dev/zero > small && head -c 175000 /dev/zero > big && python3 -m http.server 8000 >/dev/null 2>&1 &`.',
			'Chronomètre les deux, chacun sur une connexion neuve : `for f in small big; do curl -s -o /dev/null -w "$f connect=%{time_connect} first_byte=%{time_starttransfer} total=%{time_total}\\n" http://127.0.0.1:8000/$f; done`.',
			'Monte la fenêtre initiale vers 127.0.0.1 de 10 à 40 segments, puis relance la boucle de l’étape 4 : `ip route change local 127.0.0.1 dev lo table local proto kernel scope host src 127.0.0.1 initcwnd 40`. Tape `exit` pour sortir.'
		],
		done: [
			'`ping` affiche environ 100 ms par aller-retour.',
			'`small` finit vers 0,2 s : un aller-retour pour la poignée de main, un pour la requête et toute la réponse.',
			'`big` finit vers 0,5 s, alors que le loopback déplace bien plus que 175 Ko en 0,3 s.',
			'Avec `initcwnd 40`, `big` finit vers 0,4 s.'
		],
		solution: [
			'Le fichier de 175 Ko fait environ 120 segments, l’exemple de la RFC 6928. Le premier envoi n’en porte que 10, puis 20, puis 40, puis 80, un envoi par aller-retour.',
			'`big` passe 3 allers-retours de plus que `small` après le premier octet. La vitesse du lien ne joue aucun rôle : chaque envoi attend les ACK du précédent.',
			'Une fenêtre initiale plus grande met plus de segments dans le premier envoi et fait gagner un aller-retour. La valeur par défaut de 10 est `TCP_INIT_CWND`.'
		]
	},
	recall: {
		q: 'Qu’est-ce qui fixe la quantité de données non acquittées qu’un émetteur TCP peut avoir en vol, et que fait cwnd en slow start ?',
		a: 'Le plus petit de cwnd et de la fenêtre de réception. En slow start, cwnd part de 10 segments sous Linux et gagne un segment par segment acquitté : elle double à chaque aller-retour jusqu’à ssthresh ou une perte.'
	},
	sources: [
		{ title: 'RFC 5681, TCP Congestion Control', url: 'https://www.rfc-editor.org/rfc/rfc5681' },
		{ title: 'RFC 6928, Increasing TCP’s Initial Window', url: 'https://www.rfc-editor.org/rfc/rfc6928' },
		{ title: 'Source Linux, net/ipv4/tcp_cong.c', url: CONG },
		{ title: 'Source Linux, include/net/tcp.h (TCP_INIT_CWND)', url: `${TCPH}#L268-L269` },
		{ title: 'Doc du noyau Linux, IP sysctl (tcp_rmem, tcp_slow_start_after_idle)', url: SYSCTL },
		{ title: 'Page de manuel ss(8)', url: 'https://man7.org/linux/man-pages/man8/ss.8.html' }
	]
};
