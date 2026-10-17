const LINUX = 'https://github.com/torvalds/linux/blob/70dd4ee72eb2d5793c62e71c14e3aba78e5a4e56';
const TCPV4 = `${LINUX}/net/ipv4/tcp_ipv4.c`;
const HASH = `${LINUX}/net/ipv4/inet_hashtables.c`;
const SYSCTL = `${LINUX}/Documentation/networking/ip-sysctl.rst`;
const CF = 'https://blog.cloudflare.com/how-to-stop-running-out-of-ephemeral-ports-and-start-to-love-long-lived-connections/';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'ports-and-time-wait',
	part: 'Les paquets',
	title: 'Ports, sockets et TIME_WAIT',
	minutes: 10,
	hook: [
		'Un test lancé dans cette session, sous Linux 6.17 : un client Python limité aux 100 ports source 40100 à 40199 se connecte à un serveur sur la même machine, puis ferme chaque connexion après la réponse. La connexion 101 échoue 4 ms après le départ avec `[Errno 99] Cannot assign requested address`.',
		'Le processus serveur accepte toujours les connexions. `ss -tno state time-wait` liste 100 sockets clients vers le port du serveur, chacun avec `timer:(timewait,59sec,0)`. Un relevé toutes les 5 s les trouve encore tous les 100 à 60 s, et plus aucun à 65 s : `connect()` marche de nouveau.',
		'Avec la plage par défaut de 28 232 ports et le TIME_WAIT de 60 secondes de Linux, le même client tombe à court vers 470 nouvelles connexions par seconde vers un même serveur.'
	],
	terms: [
		{ term: 'Port éphémère', def: 'Le port source que le noyau choisit pour une connexion sortante quand le programme n’en fixe pas, dans `ip_local_port_range` : de 32768 à 60999 par défaut.' },
		{ term: '4-tuple', def: 'IP source, port source, IP de destination, port de destination. Chaque connexion TCP d’une machine a besoin d’un 4-tuple qu’aucune autre connexion n’utilise.' },
		{ term: 'TIME_WAIT', def: 'L’état d’un socket du côté qui a fermé en premier, après le dernier ACK. Linux le garde 60 secondes (`TCP_TIMEWAIT_LEN`), et `ss` l’affiche `TIME-WAIT`.' },
		{ term: '`tcp_tw_reuse`', def: 'Le sysctl qui permet à une nouvelle connexion sortante de reprendre un 4-tuple encore en TIME_WAIT. La valeur par défaut, 2, ne l’autorise que pour le trafic loopback.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['c["Client : connect() vers 10.0.0.9:443"] --> k["Le noyau choisit un port source libre, par exemple 40312"]'],
				highlight: ['k'],
				note: 'Le programme ne donne que la destination. Le noyau choisit l’IP source dans la table de routage et un port source entre 32768 et 60999. Le 4-tuple `10.0.0.5:40312 → 10.0.0.9:443` ne doit appartenir à aucun autre socket.'
			},
			{
				add: ['k -->|"SYN, requête, réponse"| s["Serveur 10.0.0.9:443"]', 'k -->|"close() : FIN"| s'],
				highlight: ['s'],
				note: 'Après la réponse, le client appelle `close()` en premier et envoie un FIN. Le serveur l’acquitte, envoie son propre FIN, et le client acquitte celui-ci. Côté serveur, qui a fermé en second, le socket disparaît dès l’arrivée de ce dernier ACK.'
			},
			{
				add: ['s -.->|"FIN, dernier ACK"| tw["Socket client en TIME_WAIT pendant 60 s"]'],
				highlight: ['tw'],
				note: 'La RFC 9293 : "When a connection is closed actively, it MUST linger in the TIME-WAIT state for a time 2xMSL", avec une MSL "taken to be 2 minutes". Linux utilise 60 secondes. Pendant cette minute, le port 40312 ne peut pas porter de nouvelle connexion vers 10.0.0.9:443.'
			},
			{
				add: ['tw --> full["28 232 ports vers 10.0.0.9:443 en TIME_WAIT : EADDRNOTAVAIL"]'],
				highlight: ['full'],
				note: 'La recherche de port de `__inet_hash_connect` saute chaque port dont le 4-tuple est pris. Quand il n’en reste aucun, `connect()` renvoie `EADDRNOTAVAIL`. 28 232 ports gardés 60 s chacun permettent environ 470 nouvelles connexions par seconde vers une destination. Les connexions vers une autre IP ou un autre port n’entrent pas en concurrence pour ces 4-tuples.'
			},
			{
				add: ['pool["Pool keep-alive : un 4-tuple, beaucoup de requêtes"] -->|"requêtes 2, 3, 4..."| s'],
				highlight: ['pool'],
				note: 'Un client qui garde la connexion ouverte et y envoie la requête suivante utilise un seul port pour des milliers de requêtes. Seules les connexions qu’il finit par fermer passent en TIME_WAIT.'
			}
		]
	},
	example: {
		title: 'net/ipv4/tcp_ipv4.c : tcp_twsk_unique, peut-on reprendre un 4-tuple en TIME_WAIT ?',
		repo: 'torvalds/linux',
		url: `${TCPV4}#L118-L203`,
		lang: 'c',
		code: `int tcp_twsk_unique(struct sock *sk, struct sock *sktw, void *twp)
{
	int reuse = READ_ONCE(sock_net(sk)->ipv4.sysctl_tcp_tw_reuse);
	const struct inet_timewait_sock *tw = inet_twsk(sktw);
	const struct tcp_timewait_sock *tcptw = tcp_twsk(sktw);
	struct tcp_sock *tp = tcp_sk(sk);
	int ts_recent_stamp;
	u32 reuse_thresh;

	if (READ_ONCE(tw->tw_substate) == TCP_FIN_WAIT2)
		reuse = 0;

	if (reuse == 2) {
…
		if (!loopback)
			reuse = 0;
	}

	ts_recent_stamp = READ_ONCE(tcptw->tw_ts_recent_stamp);
	reuse_thresh = READ_ONCE(tw->tw_entry_stamp) +
		       READ_ONCE(sock_net(sk)->ipv4.sysctl_tcp_tw_reuse_delay);
	if (ts_recent_stamp &&
	    (!twp || (reuse && time_after32(tcp_clock_ms(), reuse_thresh)))) {
…
		if (likely(!tp->repair)) {
			u32 seq = tcptw->tw_snd_nxt + 65535 + 2;

			if (!seq)
				seq = 1;
			WRITE_ONCE(tp->write_seq, seq);
			tp->rx_opt.ts_recent	   = READ_ONCE(tcptw->tw_ts_recent);
			tp->rx_opt.ts_recent_stamp = ts_recent_stamp;
		}

		return 1;
	}

	return 0;
}`,
		notes: [
			'La ligne 3 lit `tcp_tw_reuse`. Les lignes 13 à 17 ne gardent la valeur par défaut 2 que si une adresse est une adresse loopback ou si le socket est lié à `lo`. Pour 10.0.0.9, `reuse` retombe à 0.',
			'Les lignes 22 et 23 exigent deux choses avant de reprendre le 4-tuple : un timestamp TCP reçu du pair (`ts_recent_stamp`), et `tcp_tw_reuse_delay`, 1000 ms par défaut, écoulé depuis l’entrée en TIME_WAIT.',
			'La ligne 26 fait partir les numéros de séquence de la nouvelle connexion 65 537 plus loin que là où l’ancienne s’est arrêtée. Les timestamps permettent ensuite au récepteur de jeter un segment en retard de l’ancienne connexion.',
			'Un retour à 0 indique à [`__inet_check_established`](' + HASH + '#L614-L626) que le 4-tuple est pris, et la recherche passe au port suivant.',
			'Deux essais dans cette session ont fait passer 300 connexions par 100 ports source en 6,1 s. Vers `127.0.0.1`, aucune n’a échoué : avec la valeur 2, la ligne 23 laisse reprendre un 4-tuple loopback au bout d’une seconde. Vers l’adresse `172.17.0.1` de la machine, 200 ont échoué.'
		]
	},
	tradeoff: {
		gain: [
			'Un segment en retard d’une connexion fermée ne peut pas atterrir dans une nouvelle connexion au même 4-tuple. La RFC 9293 donne cette raison à l’état.',
			'Si le dernier ACK se perd, le côté en TIME_WAIT connaît encore la connexion et peut répondre au FIN répété du pair.'
		],
		cost: [
			'Un client qui ouvre et ferme une connexion par requête plafonne à environ 470 nouvelles connexions par seconde vers une destination avec les réglages par défaut.',
			'`tcp_tw_reuse = 1` ne lève la limite que si les deux côtés envoient des timestamps TCP, et il s’applique à toutes les connexions sortantes de la machine.',
			'Un test contre `127.0.0.1` masque le problème, car la valeur par défaut reprend les 4-tuples loopback au bout d’une seconde.'
		]
	},
	task: {
		prompt: 'Un batch sous Linux écrit `connect: Cannot assign requested address` quand il parle à Redis sur `10.0.0.12:6379`. `ss -s` affiche `timewait 28190`, et `sysctl net.ipv4.ip_local_port_range` affiche `32768 60999`. Le batch ouvre une connexion par commande et la ferme. Quel débit maximal de nouvelles connexions vers Redis peut-il tenir, et quels sont deux correctifs ?',
		hint: 'Compte les ports de la plage, et divise par la durée pendant laquelle chacun reste en TIME_WAIT sous Linux.',
		answer: [
			'La plage contient 60999 − 32768 + 1 = 28 232 ports. Chacun reste 60 s en TIME_WAIT après que le batch l’a fermé : le batch peut ouvrir environ 28 232 / 60 ≈ 470 nouvelles connexions par seconde vers `10.0.0.12:6379`. `timewait 28190` montre qu’il est à cette limite.',
			'Correctif 1 : réutiliser les connexions. Un client Redis avec un pool de connexions envoie beaucoup de commandes sur chaque socket, donc le batch n’a besoin que de quelques ports au lieu d’un par commande.',
			'Correctif 2, si le code ne peut pas changer tout de suite : élargir la plage, par exemple `1024 65535`, soit 64 512 ports, environ 1 075 par seconde. La plage doit commencer à `ip_unprivileged_port_start` (1024) ou au-dessus, et `ip_local_reserved_ports` doit lister les ports de serveurs qui tombent dedans.',
			'`tcp_tw_reuse = 1` marche aussi, mais seulement si Redis envoie des timestamps TCP, et il change toutes les connexions sortantes de la machine.'
		]
	},
	quiz: [
		{
			q: 'Un client envoie une requête, le serveur envoie la réponse et appelle `close()` en premier. Quel côté garde un socket en TIME_WAIT ?',
			options: [
				'Le client, car c’est lui qui a ouvert la connexion',
				'Le serveur, car il a fermé en premier',
				'Les deux côtés, 60 secondes chacun',
				'Aucun des deux, car la réponse était complète'
			],
			answer: 1,
			why: 'Le TIME_WAIT revient au côté qui ferme activement, celui qui envoie le premier FIN. Qui a ouvert la connexion ne compte pas. Un serveur HTTP chargé qui ferme après chaque réponse accumule les sockets en TIME_WAIT de son côté.'
		},
		{
			q: 'Un client a 28 232 sockets en TIME_WAIT vers `10.0.0.9:443`. Peut-il ouvrir tout de suite une connexion vers `10.0.0.10:443` ?',
			options: [
				'Non, tous les ports éphémères sont en TIME_WAIT pour encore 60 secondes',
				'Non, sauf si `tcp_tw_reuse` vaut 1 sur le client',
				'Oui, mais seulement après `tcp_tw_reuse_delay`, soit 1 seconde',
				'Oui, un 4-tuple avec une autre IP de destination est un nouveau tuple'
			],
			answer: 3,
			why: 'Une connexion a besoin d’un 4-tuple unique, et l’IP de destination en fait partie. Le port 40312 n’est en TIME_WAIT que vers 10.0.0.9:443, donc le noyau peut le réutiliser vers 10.0.0.10:443.'
		},
		{
			q: 'Un test de charge contre `127.0.0.1` ouvre et ferme 5 000 connexions par seconde sans erreur. En production, vers une autre machine, le même client échoue. Pourquoi ?',
			options: [
				'Les connexions loopback ne passent jamais en TIME_WAIT',
				'Le défaut `tcp_tw_reuse = 2` ne reprend les 4-tuples en TIME_WAIT qu’en loopback',
				'Les serveurs de production ont une `ip_local_port_range` plus petite par défaut',
				'L’interface loopback a son propre jeu séparé de 65 535 ports'
			],
			answer: 1,
			why: 'Dans `tcp_twsk_unique`, la valeur 2 retombe à 0 quand aucune des deux adresses n’est loopback. En loopback, un 4-tuple en TIME_WAIT est repris au bout d’une seconde, donc le test ne manque jamais de ports.'
		}
	],
	recall: {
		q: 'Combien de ports éphémères Linux a-t-il par défaut, combien de temps une connexion fermée en garde-t-elle un en TIME_WAIT, et quel débit de nouvelles connexions vers une destination cela permet-il ?',
		a: '28 232 ports (de 32768 à 60999), gardés 60 s par le côté qui a fermé en premier. Le client peut ouvrir environ 470 nouvelles connexions par seconde vers une même IP et un même port de destination.'
	},
	sources: [
		{ title: 'Doc du noyau Linux, IP sysctl (ip_local_port_range, tcp_tw_reuse)', url: SYSCTL },
		{ title: 'Source Linux, net/ipv4/tcp_ipv4.c', url: TCPV4 },
		{ title: 'RFC 9293, Transmission Control Protocol (TIME-WAIT)', url: 'https://www.rfc-editor.org/rfc/rfc9293' },
		{ title: 'connect(2), EADDRNOTAVAIL', url: 'https://man7.org/linux/man-pages/man2/connect.2.html' },
		{ title: 'IP_LOCAL_PORT_RANGE(2const)', url: 'https://man7.org/linux/man-pages/man2/IP_LOCAL_PORT_RANGE.2const.html' },
		{ title: 'Blog Cloudflare, How to stop running out of ephemeral ports (2022)', url: CF }
	]
};
