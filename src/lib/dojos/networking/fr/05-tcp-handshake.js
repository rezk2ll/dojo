const LINUX = 'https://github.com/torvalds/linux/blob/70dd4ee72eb2d5793c62e71c14e3aba78e5a4e56';
const IPV4 = `${LINUX}/net/ipv4/tcp_ipv4.c`;
const INPUT = `${LINUX}/net/ipv4/tcp_input.c`;
const TIMER = `${LINUX}/net/ipv4/tcp_timer.c`;
const SYSCTL = `${LINUX}/Documentation/networking/ip-sysctl.rst`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'tcp-handshake',
	part: 'Les paquets',
	title: 'La poignée de main TCP',
	minutes: 10,
	hook: [
		'Deux appels `curl -v` vers le même serveur, 10.78.0.10. Le port 82 échoue tout de suite : `connect to 10.78.0.10 port 82 from 10.78.0.20 port 46574 failed: Connection refused`, puis `after 0 ms`. Le port 81 affiche `Trying 10.78.0.10:81...`, puis plus rien pendant plus de deux minutes.',
		'Le second appel finit par `failed: Operation timed out` et `after 135262 ms`. Les deux erreurs viennent des trois premiers paquets de TCP, la poignée de main. **Sur le port 82, le serveur a répondu par un reset ; sur le port 81, personne n’a répondu.** Une règle de pare-feu sur le serveur jette chaque paquet vers le port 81.',
		'« Refused » veut dire qu’un RST est revenu : quelque chose est actif à cette adresse et répond. « Timed out » veut dire que les SYN du client sont partis et que rien n’est revenu.'
	],
	terms: [
		{ term: 'Poignée de main', def: 'Les trois paquets qui ouvrent une connexion TCP : SYN du client, SYN-ACK du serveur, ACK du client. Chaque côté choisit un premier numéro de séquence, et l’autre l’acquitte.' },
		{ term: 'SYN-SENT', def: 'L’état du client entre l’envoi du SYN et la réception du SYN-ACK. RFC 9293 : "waiting for a matching connection request after having sent a connection request".' },
		{ term: 'RST', def: 'Le flag de reset. Une machine envoie un segment avec RST pour un port où aucune socket n’écoute. Le noyau du client fait alors échouer `connect()` avec `ECONNREFUSED`.' },
		{ term: 'tcp_syn_retries', def: 'Le sysctl Linux qui fixe combien de fois un SYN sans réponse est renvoyé. Valeur par défaut : 6. La doc du noyau dit que la tentative expire alors "after 131seconds", et l’essai de ce chapitre a pris 135 secondes.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['cli["Client 10.78.0.20 : connect(), état SYN-SENT"] -->|"SYN seq 4237063974"| srv["Serveur 10.78.0.10:80, état LISTEN"]'],
				highlight: ['cli', 'srv'],
				note: 'curl appelle `connect()`. Le noyau choisit le port source 42338, passe la socket en SYN-SENT et envoie un SYN sans données. Le SYN porte le premier numéro de séquence du client, 4237063974, et des options comme `mss 1460`.'
			},
			{
				add: ['srv -->|"SYN-ACK seq 4164281932, ack 4237063975"| cli'],
				highlight: ['srv'],
				note: 'Le port 80 a une socket en écoute, donc le serveur répond 36 microsecondes plus tard. Son SYN-ACK porte son propre premier numéro, 4164281932, et acquitte 4237063975 : le numéro du client plus 1, car un SYN compte pour un octet dans l’espace des séquences.'
			},
			{
				add: ['cli -->|"ACK, 8 µs plus tard"| est["Les deux côtés en ESTABLISHED"]'],
				highlight: ['est'],
				note: 'Le client acquitte le SYN du serveur et passe en ESTABLISHED. curl annonce un `time_connect` de 0,000157 seconde. C’est seulement maintenant qu’il peut envoyer `GET /`.'
			},
			{
				add: ['cli -->|"SYN vers le port 82"| closed["Port 82 : aucune socket"]', 'closed -->|"RST, ACK, 26 µs plus tard"| ref["connect() échoue : Connection refused"]'],
				highlight: ['closed', 'ref'],
				note: 'Rien n’écoute sur le port 82. RFC 9293 : "A SYN segment that does not match an existing connection is rejected by this means", c’est-à-dire par un reset. Le client est en SYN-SENT quand le RST arrive, donc son noyau renvoie `ECONNREFUSED`.'
			},
			{
				add: ['cli -->|"SYN vers le port 81, envoyé 7 fois"| drop["Port 81 : DROP du pare-feu, aucune réponse"]', 'drop -.->|"au bout de 135 s"| to["connect() échoue : Operation timed out"]'],
				highlight: ['drop', 'to'],
				note: 'Le pare-feu jette chaque SYN sans répondre. `tcpdump` côté client montre le même SYN à 0, 1, 2, 3, 4, 5 et 7 secondes : 1 SYN et 6 renvois. `ss -tan` affiche la socket en `SYN-SENT` pendant tout ce temps. Le noyau abandonne à 135 secondes avec `ETIMEDOUT`.'
			}
		]
	},
	example: {
		title: 'net/ipv4/tcp_ipv4.c : tcp_v4_connect, ce que fait connect() avant le départ du SYN',
		repo: 'torvalds/linux',
		url: `${IPV4}#L253-L362`,
		lang: 'c',
		code: `	rt = ip_route_connect(fl4, nexthop, inet->inet_saddr,
			      sk->sk_bound_dev_if, IPPROTO_TCP, orig_sport,
			      orig_dport, sk);
	if (IS_ERR(rt)) {
		err = PTR_ERR(rt);
		if (err == -ENETUNREACH)
			IP_INC_STATS(net, IPSTATS_MIB_OUTNOROUTES);
		return err;
	}
…
	/* Socket identity is still unknown (sport may be zero).
	 * However we set state to SYN-SENT and not releasing socket
	 * lock select source port, enter ourselves into the hash tables and
	 * complete initialization after this.
	 */
	tcp_set_state(sk, TCP_SYN_SENT);
	err = inet_hash_connect(tcp_death_row, sk);
	if (err)
		goto failure;
…
	if (likely(!tp->repair)) {
		union tcp_seq_and_ts_off st;

		st = secure_tcp_seq_and_ts_off(net,
					       inet->inet_saddr,
					       inet->inet_daddr,
					       inet->inet_sport,
					       usin->sin_port);
		if (!tp->write_seq)
			WRITE_ONCE(tp->write_seq, st.seq);
		WRITE_ONCE(tp->tsoffset, st.ts_off);
	}
…
	err = tcp_connect(sk);

	if (err)
		goto failure;

	return 0;

failure:
	/*
	 * This unhashes the socket and releases the local port,
	 * if necessary.
	 */
	tcp_set_state(sk, TCP_CLOSE);
	inet_bhash2_reset_saddr(sk);
	ip_rt_put(rt);
	sk->sk_route_caps = 0;
	inet->inet_dport = 0;
	return err;`,
		notes: [
			'Les lignes 1 à 9 cherchent d’abord la route. Sans route, `connect()` renvoie `-ENETUNREACH` tout de suite et aucun SYN ne part : c’est le `Network unreachable` du jour 3.',
			'La ligne 16 passe l’état à SYN-SENT, et la ligne 17 choisit le port source, comme l’annonce le commentaire de la ligne 13. Ce port, 53158 dans l’appel qui a expiré, est celui que `ss -tan` affiche à côté de `SYN-SENT`.',
			'Les lignes 24 à 30 calculent le premier numéro de séquence à partir des deux adresses et des deux ports. La capture montre le résultat dans le SYN : `seq 4237063974`.',
			'La ligne 34 appelle `tcp_connect`, dont le commentaire dit "Build a SYN and send it off." La réponse arrive plus tard : [`tcp_reset`](' + INPUT + '#L4902-L4914) transforme un RST reçu en SYN-SENT en `ECONNREFUSED`, et un RST sur une connexion ouverte en `ECONNRESET`.',
			'Si aucune réponse n’arrive, le timer de retransmission termine la tentative dans [`tcp_write_err`](' + TIMER + '#L77-L79) avec `ETIMEDOUT`. curl sous Alpine l’a affiché comme `Operation timed out`.'
		]
	},
	tradeoff: {
		gain: [
			'Chaque côté vérifie le premier numéro de séquence de l’autre avant toute donnée : le serveur a acquitté 4237063975, et le client 4164281932 + 1.',
			'Le RST du port fermé 82 est revenu en 26 microsecondes, et curl a annoncé `after 0 ms`.'
		],
		cost: [
			'La poignée de main coûte un aller-retour complet avant que la requête puisse partir : 44 microsecondes ici entre deux conteneurs, un délai réseau à l’aller et un au retour sur un vrai lien.',
			'Un SYN jeté ressemble à un serveur lent. Avec `tcp_syn_retries = 6`, le client a attendu 135 secondes avant la moindre erreur, sauf si le programme fixe son propre délai de connexion.'
		]
	},
	task: {
		prompt: 'Trois sorties d’un client, toutes pour le même serveur. Pour chacune, dis si la machine serveur a répondu et ce que tu vérifierais ensuite. Écris ensuite l’option `curl` qui fait abandonner le client au bout de 3 secondes dans le troisième cas.\n\n1. `connect to 10.78.0.10 port 82 from 10.78.0.20 port 46574 failed: Connection refused`\n2. `ss -tan` affiche `SYN-SENT 0 1 10.78.0.20:57886 10.78.0.10:81` pendant plusieurs secondes.\n3. `tcpdump` montre `Flags [S]` de `10.78.0.20.53158` vers `10.78.0.10.81` sept fois, avec le même `seq 2848897320`, et rien en retour.',
		hint: 'Un refus est un paquet. Une socket en SYN-SENT et un SYN répété avec le même numéro de séquence veulent tous deux dire que le SYN-ACK n’est jamais arrivé.',
		answer: [
			'1 : le serveur a répondu par un RST. La machine est active et joignable, mais aucun programme n’écoute sur le port 82. Vérifie que le service tourne et écoute sur le bon port et la bonne adresse, avec `ss -tlnp` sur le serveur.',
			'2 et 3 : le serveur n’a pas répondu. Le SYN est parti, et les renvois gardent le même numéro de séquence parce que ce sont des copies d’un seul SYN. Vérifie un pare-feu qui jette le port 81, un security group, ou si la machine est éteinte.',
			'`curl --connect-timeout 3 http://10.78.0.10:81/` a abandonné au bout de 3002 ms avec `curl: (28) Connection timed out after 3002 milliseconds`, au lieu de 135 secondes.',
			'La limite du noyau est `net.ipv4.tcp_syn_retries`. Le noyau la lit par espace de noms réseau (`net->ipv4.sysctl_tcp_syn_retries`) : la baisser change toutes les connexions de cet espace. Un délai sur l’appel ne change que cet appel.'
		],
		steps: [
			{
				title: 'Lis la sortie 1',
				questions: [
					{ q: 'La sortie 1 indique `from 10.78.0.20 port 46574`. Qui a choisi le port 46574 ?', options: ['Le noyau du client, pendant `connect()`', 'Le serveur, dans sa réponse', 'curl, depuis son fichier de config', 'Le pare-feu devant le port 82'], answer: 0, why: 'Le noyau choisit un port local libre quand `connect()` s’exécute, avant le départ du SYN. Le serveur ne fait que répondre vers ce port.' },
					{ q: 'La machine serveur a-t-elle donc répondu ?', options: ['Non : refusé veut dire que la machine est éteinte', 'Oui : la machine est active et joignable', 'Non : seul un pare-feu a répondu', 'Impossible à dire avec cette ligne'], answer: 1, why: 'Quelque chose à cette adresse a envoyé le RST, donc la machine tourne et le chemin jusqu’à elle marche.' },
					{ q: 'Dans quel état était la socket du client quand le RST est arrivé ?', options: ['ESTABLISHED', 'LISTEN', 'SYN-SENT', 'TIME_WAIT'], answer: 2, why: 'Le client avait envoyé son SYN et attendait le SYN-ACK. Un RST reçu en SYN-SENT fait échouer `connect()` avec `ECONNREFUSED`.' },
					{ q: 'Que vérifies-tu ensuite ?', options: ['Les règles de pare-feu du port 82', 'La route du client vers le serveur', 'Si le serveur est allumé', 'Le service, avec `ss -tlnp` sur le serveur'], answer: 3, why: 'La machine répond, donc regarde le programme : tourne-t-il, et sur quel port et quelle adresse écoute-t-il ?' }
				]
			},
			{
				title: 'Lis les sorties 2 et 3',
				questions: [
					{ q: 'La sortie 2 montre le port source 57886 et la sortie 3 le port 53158. Qu’est-ce que ça t’apprend ?', options: ['Ce sont deux tentatives séparées, chacune avec son port source', 'Le noyau change de port source à chaque renvoi', 'Le serveur a réécrit le port dans sa réponse', 'Le port 53158 est le port de réponse du serveur'], answer: 0, why: 'Le noyau choisit un port source une seule fois, dans `connect()`, et le garde pour chaque renvoi de ce SYN. Deux ports veulent dire deux appels à `connect()`.' },
					{ q: 'Les sept SYN de la sortie 3 portent tous `seq 2848897320`. Pourquoi le numéro ne change-t-il pas ?', options: ['Le serveur a demandé ce numéro', 'Un renvoi réexpédie le même SYN, avec le premier numéro de séquence choisi une seule fois', 'curl utilise un numéro de séquence fixe', 'tcpdump n’affiche que le premier numéro de séquence'], answer: 1, why: 'Le client choisit son premier numéro de séquence à l’ouverture de la connexion. Chaque renvoi est une copie de ce SYN, donc le port et le numéro restent les mêmes.' },
					{ q: 'La machine serveur a-t-elle répondu dans les cas 2 et 3 ?', options: ['Oui, par un RST à chaque fois', 'Oui, mais son SYN-ACK est arrivé trop tard', 'Non : rien n’est revenu', 'Oui, par un SYN-ACK que le client a ignoré'], answer: 2, why: 'Toute réponse ferait sortir de SYN-SENT : un SYN-ACK ouvre la connexion et un RST la refuse.' },
					{ q: 'Que vérifies-tu ensuite ?', options: ['Si un programme écoute sur le port 81', 'Le nom DNS du serveur', 'Les sockets TIME_WAIT du client', 'Un pare-feu qui jette le port 81, un security group, ou si la machine est éteinte'], answer: 3, why: 'Quelque chose a avalé le SYN sans rien dire. Dans ce chapitre, c’était une règle DROP sur le serveur.' }
				]
			},
			{
				title: 'Limite l’attente',
				questions: [
					{ q: 'Sans option, quelle erreur le noyau renvoie-t-il à curl quand il abandonne sur le port 81 ?', options: ['`ECONNREFUSED`', '`EHOSTUNREACH`', '`EADDRNOTAVAIL`', '`ETIMEDOUT`'], answer: 3, why: 'Aucune réponse n’a fait sortir la socket de SYN-SENT, donc une fois les renvois épuisés, le noyau fait échouer `connect()` avec `ETIMEDOUT`. curl l’affiche comme `Operation timed out`.' },
					{ q: 'Quelle option de `curl` abandonne la connexion au bout de 3 secondes ?', options: ['`--retry 3`', '`--connect-timeout 3`', '`--keepalive-time 3`', '`--limit-rate 3`'], answer: 1, why: '`--connect-timeout` borne le temps que curl attend pour ouvrir la connexion.' },
					{ q: 'Qu’affiche curl quand cette limite tombe ?', options: ['`curl: (28) Connection timed out after 3002 milliseconds`', '`Connection refused`', '`Network unreachable`', '`Could not resolve host`'], answer: 0, why: 'Dans cette session, il a abandonné au bout de 3002 ms avec l’erreur 28, au lieu de 135 secondes.' },
					{ q: 'Pourquoi le noyau a-t-il renvoyé le SYN 6 fois de lui-même ?', options: ['curl a demandé 6 essais', 'Le pare-feu autorisait 6 essais', '`net.ipv4.tcp_syn_retries` vaut 6 par défaut', '`tcp_retries2` vaut 6'], answer: 2, why: '`tcp_syn_retries` fixe combien de fois un SYN sans réponse est renvoyé. `tcp_retries2` concerne les données d’une connexion ouverte.' }
				]
			},
			{
				title: 'Choisis où poser la limite',
				questions: [
					{ q: 'À quel niveau le noyau lit-il `tcp_syn_retries` ?', options: ['Par espace de noms réseau', 'Par processus', 'Par socket', 'Par adresse de destination'], answer: 0, why: 'Le code lit `net->ipv4.sysctl_tcp_syn_retries`, une valeur par espace de noms réseau.' },
					{ q: 'Si tu la baisses, qu’est-ce qui change ?', options: ['Seulement l’appel curl', 'Toutes les connexions de cet espace de noms', 'Seulement les connexions vers le port 81', 'Seulement les connexions déjà en échec'], answer: 1, why: 'Une seule valeur couvre toutes les connexions de l’espace de noms, y compris celles qui ont besoin d’un connect patient.' },
					{ q: 'Pourquoi préférer `--connect-timeout` sur l’appel ?', options: ['Il fait arriver le SYN au serveur', 'Il retire la règle de pare-feu', 'Il ne change que cet appel', 'Il ne marche qu’en root'], answer: 2, why: 'Un délai sur l’appel pose la limite là où il en faut une et laisse le reste de la machine tranquille.' },
					{ q: 'Une règle DROP sur le serveur bloque le port 81. Qu’est-ce qui fait marcher l’appel ?', options: ['Baisser `tcp_syn_retries` à 1', 'Lancer un second programme sur le port 81', 'Relancer curl en boucle', 'Autoriser le port 81 dans cette règle ou ce security group'], answer: 3, why: 'Le délai rend seulement l’échec rapide. Le SYN n’atteint le service qu’une fois que la règle le laisse passer.' }
				]
			}
		]
	},
	quiz: [
		{
			q: '`connect()` échoue avec `Connection refused` en moins d’une milliseconde. Que s’est-il passé sur le réseau ?',
			options: [
				'Un pare-feu a jeté le SYN et le noyau a abandonné plus tôt',
				'Le serveur a répondu au SYN par un RST, car aucune socket n’écoute',
				'Le serveur a envoyé un SYN-ACK, mais le client a rejeté son numéro',
				'Aucun paquet n’est sorti du client, faute de route vers le serveur'
			],
			answer: 1,
			why: 'En SYN-SENT, un RST reçu fait renvoyer `ECONNREFUSED` par `tcp_reset`. Une route absente donne `Network unreachable`, et un SYN jeté donne un timeout après les renvois.'
		},
		{
			q: 'Le SYN du client porte `seq 1000`. Quel numéro d’acquittement porte le SYN-ACK ?',
			options: ['1000', '0', '1001', '1460'],
			answer: 2,
			why: 'Le SYN occupe un numéro de séquence, donc le serveur acquitte le suivant, 1001. Dans la capture, le SYN `seq 4237063974` a reçu `ack 4237063975`. 1460 est l’option MSS.'
		},
		{
			q: 'Le port 81 est derrière une règle qui jette les paquets. Que montre `ss -tan` côté client pendant que `curl` attend ?',
			options: [
				'La socket en `ESTABLISHED`, qui attend la réponse HTTP',
				'La socket en `TIME-WAIT`, après sa fermeture par le serveur',
				'Rien : la socket n’apparaît qu’à la fin de la poignée de main',
				'La socket en `SYN-SENT`, avec le SYN renvoyé encore et encore'
			],
			answer: 3,
			why: '`tcp_v4_connect` passe en SYN-SENT avant le départ du premier SYN, et l’état ne bouge plus jusqu’à un SYN-ACK, un RST ou le timeout final. Les renvois répètent le même SYN.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Reproduire sur ton portable les trois cas de l’exercice : un port ouvert, un port fermé et un port jeté.',
		steps: [
			'Crée un réseau et un serveur qui répond sur le port 80, n’a rien sur le 82 et jette le 81 : `docker network create tcplab && docker run -d --name srv --network tcplab --cap-add NET_ADMIN nicolaka/netshoot:v0.13 sh -c "iptables -A INPUT -p tcp --dport 81 -j DROP && python3 -m http.server 80"`.',
			'Ouvre un shell client sur le même réseau : `docker run --rm -it --network tcplab nicolaka/netshoot:v0.13`.',
			'Dedans, essaie le port ouvert et le port fermé : `curl -s -o /dev/null -w "%{http_code}\\n" http://srv/`, puis `curl -sv http://srv:82/ 2>&1 | grep -i refused`.',
			'Observe le port jeté : `timeout 5 tcpdump -l -i eth0 -n "tcp port 81" & sleep 1; curl -s --connect-timeout 3 http://srv:81/; echo "curl exit $?"`. Attends que tcpdump s’arrête.',
			'Regarde la socket pendant qu’elle attend : `curl -s --connect-timeout 3 http://srv:81/ & sleep 1; ss -tan | grep :81`.',
			'Tape `exit`. Sur ton portable, regarde ce qui écoute sur le serveur avec `docker exec srv ss -tlnp`, puis nettoie : `docker rm -f srv && docker network rm tcplab`.'
		],
		done: [
			'Le port 80 affiche `200`.',
			'Le port 82 affiche tout de suite `connect to ... port 82 ... failed: Connection refused`.',
			'tcpdump montre trois lignes `Flags [S]` vers le port 81 avec le même `seq`, à environ 1 s d’écart, et curl sort avec `28`.',
			'`ss -tan` montre la socket vers le port 81 en `SYN-SENT`.',
			'`ss -tlnp` sur le serveur liste `python3` sur le port 80 et rien sur le 81 ni le 82.'
		],
		solution: [
			'Port 82 : le noyau du serveur répond au SYN par un RST, car aucune socket n’écoute là. La machine tourne.',
			'Port 81 : la règle DROP jette chaque SYN et rien ne revient. Le noyau renvoie le même SYN après environ 1 et 2 secondes, et `--connect-timeout 3` arrête curl bien avant la fin des 6 renvois par défaut.',
			'Le code de sortie 28 est l’erreur de timeout de curl, le même `(28)` que dans l’exercice. L’autre ligne, sur 127.0.0.11 dans `ss -tlnp`, est le serveur DNS de Docker.'
		]
	},
	recall: {
		q: 'Que reçoit le client quand un port est fermé, et quand un pare-feu jette le SYN ?',
		a: 'Un port fermé renvoie un RST, donc `connect()` échoue tout de suite avec `Connection refused`. Un SYN jeté ne reçoit rien : le client le renvoie 6 fois et échoue sur un timeout, au bout de 135 secondes dans cet essai.'
	},
	sources: [
		{ title: 'RFC 9293, Transmission Control Protocol (TCP), section 3.5', url: 'https://www.rfc-editor.org/rfc/rfc9293#section-3.5' },
		{ title: 'Doc du noyau Linux, ip-sysctl : tcp_syn_retries et tcp_syn_linear_timeouts', url: `${SYSCTL}?plain=1#L1081-L1087` },
		{ title: 'Manuel de curl, --connect-timeout', url: 'https://curl.se/docs/manpage.html#--connect-timeout' },
		{ title: 'Page de manuel ss(8)', url: 'https://man7.org/linux/man-pages/man8/ss.8.html' }
	]
};
