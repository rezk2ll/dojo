const LINUX = 'https://github.com/torvalds/linux/blob/70dd4ee72eb2d5793c62e71c14e3aba78e5a4e56';
const TIMER = `${LINUX}/net/ipv4/tcp_timer.c`;
const SYSCTL = `${LINUX}/Documentation/networking/ip-sysctl.rst`;
const CF = 'https://blog.cloudflare.com/when-tcp-sockets-refuse-to-die/';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'tcp-retransmission',
	part: 'Les paquets',
	title: 'Paquets perdus et retransmission',
	minutes: 10,
	hook: [
		'Des ingénieurs de Cloudflare ouvrent une connexion TCP, puis font jeter tous les paquets par un pare-feu et envoient 11 octets. Le noyau Linux renvoie ces 11 octets 15 fois. L’application reçoit `ETIMEDOUT` au bout de 15 minutes et 39 secondes.',
		'L’écart entre deux copies grandit : 0,4 s, 0,8 s, 1,7 s, 3,5 s, et ainsi de suite jusqu’à environ 2 minutes. Pendant ces 15 minutes, `ss` affiche le socket en `ESTAB` avec 11 octets dans sa file d’envoi.',
		'Une connexion inactive s’en sort encore moins bien : sans données en vol, aucun timer ne tourne. Le même article note que ces sockets "will remain in that state forever, even if the communication is broken" (ils restent dans cet état pour toujours).'
	],
	terms: [
		{ term: 'RTO', def: 'Retransmission timeout : le temps pendant lequel l’émetteur attend un ACK avant de renvoyer le plus ancien segment non acquitté. Linux le garde entre 200 ms et 120 s.' },
		{ term: 'Backoff exponentiel', def: 'À chaque expiration du timer de retransmission, l’émetteur double le RTO avant de réarmer le timer.' },
		{ term: '`tcp_retries2`', def: 'Le sysctl Linux qui décide quand une connexion avec des données non acquittées abandonne. Par défaut 15, soit au moins 924,6 secondes.' },
		{ term: '`TCP_USER_TIMEOUT`', def: 'Une option de socket, en millisecondes : la durée maximale pendant laquelle des données envoyées peuvent rester sans ACK avant que le noyau ferme la connexion avec `ETIMEDOUT`.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['app["App : write() de 11 octets"] --> tx["Noyau émetteur : segment parti, timer RTO armé"]', 'tx -->|"données"| fw["Pare-feu qui jette tous les paquets"]'],
				highlight: ['tx'],
				note: 'Le noyau envoie le segment et arme un timer d’un RTO. Une fois l’aller-retour mesuré, la RFC 6298 fixe le RTO à environ SRTT + 4 × RTTVAR : l’aller-retour lissé plus quatre fois sa variation. Linux ne descend jamais sous 200 ms (`TCP_RTO_MIN`).'
			},
			{
				add: ['tx --> rtx["Le timer expire : renvoi du plus ancien segment non acquitté, RTO × 2"]', 'rtx -->|"les mêmes 11 octets"| fw'],
				highlight: ['rtx'],
				note: 'Aucun ACK ne revient, donc le timer expire. La règle 5.4 de la RFC 6298 renvoie le plus ancien segment non acquitté, et la règle 5.5 double le RTO. Dans la trace de Cloudflare, les copies partent à 0,62 s, 1,05 s, 1,88 s, 3,54 s et 7,00 s.'
			},
			{
				add: ['rtx --> cap["RTO plafonné à 120 s"]'],
				highlight: ['cap'],
				note: 'Le doublement s’arrête à `tcp_rto_max_ms`, 120 000 ms par défaut. Dans la trace, la 10e copie part à 3:34, puis les copies 11 à 15 partent à environ 121 s d’intervalle.'
			},
			{
				add: ['cap --> err["tcp_retries2 = 15 épuisé : erreur ETIMEDOUT sur le socket"]', 'err -->|"read() ou write() échoue"| app'],
				highlight: ['err'],
				note: 'À chaque expiration, `tcp_write_timeout` compare le temps écoulé depuis la première retransmission à un modèle de 15 essais avec backoff : 924,6 s. Le premier RTO qui finit au-delà tue la connexion. Le noyau met l’erreur `ETIMEDOUT` sur le socket, et l’appel suivant la renvoie. Ici, à 15:39,5.'
			},
			{
				add: ['srv["Pair de nouveau joignable : ACK"] -.->|"nouvelle mesure de RTT"| tx'],
				highlight: ['srv'],
				note: 'Si un ACK de nouvelles données arrive avant, la mesure de RTT suivante recalcule le RTO à partir de SRTT et RTTVAR. La RFC 6298 parle de "collapsing" : le RTO retombe après le backoff. La connexion continue comme si de rien n’était.'
			}
		]
	},
	example: {
		title: 'net/ipv4/tcp_timer.c : le délai modélisé et le doublement',
		repo: 'torvalds/linux',
		url: `${TIMER}#L188-L687`,
		lang: 'c',
		code: `static unsigned int tcp_model_timeout(struct sock *sk,
				      unsigned int boundary,
				      unsigned int rto_base)
{
	unsigned int linear_backoff_thresh, timeout;

	linear_backoff_thresh = ilog2(tcp_rto_max(sk) / rto_base);
	if (boundary <= linear_backoff_thresh)
		timeout = ((2 << boundary) - 1) * rto_base;
	else
		timeout = ((2 << linear_backoff_thresh) - 1) * rto_base +
			(boundary - linear_backoff_thresh) * tcp_rto_max(sk);
	return jiffies_to_msecs(timeout);
}
…
	} else if (sk->sk_state != TCP_SYN_SENT ||
		   tp->total_rto >
		   READ_ONCE(net->ipv4.sysctl_tcp_syn_linear_timeouts)) {
		/* Use normal (exponential) backoff unless linear timeouts are
		 * activated.
		 */
		icsk->icsk_backoff++;
		icsk->icsk_rto = min(icsk->icsk_rto << 1, tcp_rto_max(sk));
	}
	tcp_reset_xmit_timer(sk, ICSK_TIME_RETRANS,
			     tcp_clamp_rto_to_user_timeout(sk), false);`,
		notes: [
			'La ligne 7 compte combien de doublements tiennent sous le plafond. Pour une connexion établie, `rto_base` vaut `TCP_RTO_MIN`, 200 ms. 120 s / 200 ms = 600, et `ilog2(600)` vaut 9.',
			'Les lignes 11 et 12 s’appliquent pour `boundary` = 15, la valeur par défaut de `tcp_retries2` : (2^10 − 1) × 0,2 s = 204,6 s de doublements, plus (15 − 9) × 120 s = 720 s au plafond. Total : 924,6 s, le chiffre de la [doc ip-sysctl](' + SYSCTL + '?plain=1#L829-L844).',
			'La ligne 23 code la règle 5.5 de la RFC 6298 : décaler le RTO d’un bit à gauche (le doubler), sans jamais dépasser `tcp_rto_max`.',
			'La ligne 26 arme le timer suivant. `tcp_clamp_rto_to_user_timeout` le raccourcit si `TCP_USER_TIMEOUT` est réglé et qu’il reste moins de temps. Le socket échoue alors à cette limite, sans attendre le RTO doublé suivant.',
			'Les lignes 16 à 18 sautent le doublement pour un `SYN` pendant ses 4 premiers essais (`tcp_syn_linear_timeouts`). La doc donne le résultat pour un `connect()` vers un hôte muet : la tentative échoue après 131 secondes.'
		]
	},
	tradeoff: {
		gain: [
			'Un lien qui perd des paquets parce qu’il est plein reçoit de moins en moins de copies de chaque émetteur : 15 essais prennent 924,6 s, et seuls 10 tombent dans les 205 premières secondes.',
			'Une connexion survit à une coupure de quelques minutes, par exemple le redémarrage d’un routeur, sans rien demander à l’application. Le premier ACK après la coupure remet le RTO à sa valeur mesurée.'
		],
		cost: [
			'Avec les réglages par défaut, un client ne voit qu’au bout d’environ 15 minutes et demie qu’un pair mort garde ses données non acquittées.',
			'Une connexion inactive vers un pair mort reste en `ESTAB`. Les sondes keepalive sont coupées tant que l’app ne règle pas `SO_KEEPALIVE`, et la première attend ensuite `tcp_keepalive_time`, 2 heures par défaut.',
			'Baisser `tcp_retries2` touche toutes les connexions de l’hôte. `TCP_USER_TIMEOUT` fixe la limite pour un seul socket, mais c’est à l’application de le régler.'
		]
	},
	task: {
		prompt: 'Une équipe règle `net.ipv4.tcp_retries2 = 8` sur ses serveurs d’API. Avec la formule de `tcp_model_timeout`, un RTO de base de 200 ms et un plafond de 120 s, combien de temps tient une connexion établie avec des données non acquittées quand le pair meurt ? Calcule ensuite pour 5.',
		hint: '8 est-il plus grand que 9 (le nombre de doublements sous le plafond) ? Sinon, seule la première formule, `((2 << boundary) - 1) * rto_base`, s’applique.',
		answer: [
			'8 est sous 9, donc c’est la ligne 9 : (2 << 8) − 1 = 511, et 511 × 0,2 s = 102,2 s. La doc ip-sysctl le confirme : "RFC 1122 recommends at least 100 seconds for the timeout, which corresponds to a value of at least 8."',
			'Pour 5 : (2 << 5) − 1 = 63, et 63 × 0,2 s = 12,6 s.',
			'Ce sont des bornes basses. Le vrai RTO part de l’aller-retour mesuré, au moins 200 ms, donc sur un chemin lent chaque essai attend plus. La doc : "TCP will effectively time out at the first RTO which exceeds the hypothetical timeout."',
			'Pour ne limiter que les sockets clients de l’API, règle `TCP_USER_TIMEOUT` sur eux, par exemple 30000 ms, et laisse `tcp_retries2` à 15 pour le reste de l’hôte.'
		]
	},
	quiz: [
		{
			q: 'En plein upload, le serveur perd son alimentation. Le client tourne sous Linux avec les sysctls par défaut et sans `TCP_USER_TIMEOUT`. Quand son prochain `write()` échoue-t-il ?',
			options: [
				'Après environ 3 secondes, le RTO initial utilisé avant toute mesure d’aller-retour',
				'Après environ 15 minutes et demie, quand 15 retransmissions doublées ont expiré',
				'Après environ 2 heures, quand la première sonde keepalive reste sans réponse',
				'Après 131 secondes, la limite que la doc du noyau donne pour une tentative de connexion'
			],
			answer: 1,
			why: 'La connexion a des données non acquittées, donc le timer de retransmission tourne et double jusqu’à 120 s. `tcp_retries2 = 15` donne un délai modélisé de 924,6 s, et le socket échoue au premier RTO qui finit après. Les 131 s concernent les essais de `SYN` pendant `connect()`.'
		},
		{
			q: 'Une connexion ne transporte rien. On débranche l’hôte d’en face. Personne n’a réglé `SO_KEEPALIVE`. Que montre `ss` côté survivant une heure plus tard ?',
			options: [
				'Rien : le noyau a fermé le socket après `tcp_retries2` essais',
				'Le socket en `TIME_WAIT`, qui attend d’expirer',
				'Le socket en `ESTAB` sans timer, comme avant le débranchement',
				'Le socket en `CLOSE_WAIT`, qui attend que l’app le ferme'
			],
			answer: 2,
			why: 'Rien n’est en vol, donc aucun timer de retransmission n’est armé, et sans keepalive aucune sonde ne part. Le noyau ne découvre la panne que quand un des deux côtés envoie quelque chose.'
		},
		{
			q: 'Le timer de retransmission expire pour la 4e fois sur une connexion dont le RTO valait 300 ms. Quel RTO Linux arme-t-il ensuite ?',
			options: [
				'Encore 300 ms, car le RTO ne change qu’avec une nouvelle mesure de RTT',
				'1,2 s, car le RTO double une fois par segment perdu',
				'120 s, car un timer qui expire plus de 3 fois saute au plafond',
				'4,8 s, car le RTO a doublé à chacune des 4 expirations'
			],
			answer: 3,
			why: 'Chaque expiration exécute `icsk_rto << 1`, plafonné à 120 s : 0,6, 1,2, 2,4 puis 4,8 s. Une nouvelle mesure de RTT ferait redescendre le RTO, mais aucun ACK n’arrive tant que le timer expire.'
		}
	],
	recall: {
		q: 'Que fait Linux au RTO à chaque expiration du timer de retransmission, et combien de temps tient une connexion avec des données non acquittées face à un pair mort, avec `tcp_retries2 = 15` ?',
		a: 'Il double le RTO, jusqu’à un plafond de 120 s. Avec 15 essais, le délai modélisé est de 924,6 s, et Cloudflare a vu `ETIMEDOUT` à 15:39.'
	},
	sources: [
		{ title: 'Doc du noyau Linux, IP sysctl (tcp_retries2, tcp_syn_retries, tcp_rto_max_ms)', url: SYSCTL },
		{ title: 'Source Linux, net/ipv4/tcp_timer.c', url: TIMER },
		{ title: 'RFC 6298, Computing TCP’s Retransmission Timer', url: 'https://www.rfc-editor.org/rfc/rfc6298' },
		{ title: 'tcp(7), TCP_USER_TIMEOUT', url: 'https://man7.org/linux/man-pages/man7/tcp.7.html' },
		{ title: 'Blog Cloudflare, When TCP sockets refuse to die (2019)', url: CF }
	]
};
