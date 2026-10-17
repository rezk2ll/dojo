const CURL = 'https://github.com/curl/curl/blob/98979fe46bd6fe7d8bedd3126e6c0340e2f9cfa4';
const HAPPY = `${CURL}/lib/cf-ip-happy.c`;
const HEDOC = `${CURL}/docs/libcurl/opts/CURLOPT_HAPPY_EYEBALLS_TIMEOUT_MS.md`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'ipv6',
	part: 'Noms et adresses',
	title: 'IPv6 quand on connaît IPv4',
	minutes: 10,
	hook: [
		'RFC 6555, 2012 : "When IPv6 connectivity is impaired, today\'s IPv6-capable applications (e.g., web browsers, email clients, instant messaging clients) incur many seconds of delay before falling back to IPv4." La RFC ajoute que les utilisateurs finissent souvent par désactiver IPv6 complètement.',
		'Je l’ai mesuré dans cette session. Un petit script Python se connecte à `[2001:db8::1]:80`, une adresse qui ne répond jamais, puis à l’adresse IPv4 d’example.com, l’une après l’autre. La tentative IPv6 échoue avec `Connection timed out` au bout de 135,7 secondes, et c’est seulement ensuite qu’IPv4 se connecte.',
		'`curl` reçoit les deux mêmes adresses pour example.com, IPv6 en premier. Il se connecte en **0,205 seconde** : après 200 ms sans réponse en IPv6, il lance IPv4 en parallèle.'
	],
	terms: [
		{ term: 'Adresse IPv6', def: '128 bits, écrits en huit groupes de quatre chiffres hexadécimaux séparés par des deux-points. `::` remplace une suite de groupes à zéro, et ne peut apparaître qu’une fois.' },
		{ term: 'Adresse link-local', def: 'Une adresse dans `fe80::/10`, valable sur un seul lien. La RFC 4291 impose à chaque interface IPv6 d’en avoir une, et la RFC 4861 impose à un routeur d’envoyer ses annonces depuis son adresse link-local.' },
		{ term: 'SLAAC', def: 'L’autoconfiguration d’adresse sans état (RFC 4862) : le routeur annonce un préfixe, et l’hôte y ajoute son propre identifiant d’interface de 64 bits pour former une adresse globale, sans serveur DHCP.' },
		{ term: 'Happy Eyeballs', def: 'Un algorithme client (RFC 8305) pour les hôtes double pile : essayer IPv6 d’abord, et lancer une tentative IPv4 si IPv6 n’est pas connecté après un court délai, environ 250 ms.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['curl["curl example.com"] -->|"A? et AAAA?"| dns["Résolveur"]', 'dns -->|"2001:db8::1 et une IPv4"| curl'],
				highlight: ['curl', 'dns'],
				note: 'Un client double pile demande les deux types d’enregistrement. La RFC 8305 dit de commencer à se connecter dès que la réponse AAAA arrive, et de l’attendre au plus 50 ms après la réponse A. Dans ce test, `--resolve` a donné les deux adresses directement à curl.'
			},
			{
				add: ['curl -->|"t=0 : SYN vers [2001:db8::1]:80"| v6["Chemin IPv6 : aucune réponse"]'],
				highlight: ['v6'],
				note: 'curl essaie IPv6 en premier. `2001:db8::/32` est réservé à la documentation par la RFC 3849 : le SYN n’atteint aucun hôte et rien ne revient, ni SYN-ACK ni erreur.'
			},
			{
				add: ['curl -->|"t=200 ms : SYN vers IPv4:80"| v4["example.com en IPv4"]'],
				highlight: ['v4'],
				note: 'Après 200 ms sans réponse, curl ouvre une deuxième socket vers l’adresse IPv4. La socket IPv6 reste ouverte et peut encore gagner. La doc de curl : "libcurl currently defaults to 200 ms. Firefox and Chrome currently default to 300 ms."'
			},
			{
				add: ['v4 -->|"SYN-ACK après 4 ms"| curl', 'curl -.->|"ferme la tentative IPv6"| v6'],
				highlight: ['curl'],
				note: 'IPv4 répond. curl garde cette socket et ferme l’autre. `-w %{time_connect}` affiche 0,205 s : le délai de 200 ms plus l’aller-retour. Avec IPv4 seule, il affiche 0,004 s, et avec `--happy-eyeballs-timeout-ms 1000`, 1,004 s.'
			},
			{
				add: ['seq["Client qui essaie une adresse à la fois"] -->|"attend 135,7 s sur IPv6"| v6'],
				highlight: ['seq'],
				note: 'Un client sans Happy Eyeballs attend que le noyau abandonne le SYN. La doc du noyau : avec `tcp_syn_retries` à 6 par défaut, "the final timeout for an active TCP connection attempt will happen after 131seconds". Mon test a pris 135,7 s.'
			}
		]
	},
	example: {
		title: 'lib/cf-ip-happy.c : quand curl lance la tentative suivante, et dans quelle famille',
		repo: 'curl/curl',
		url: `${HAPPY}#L467-L506`,
		lang: 'c',
		code: `  /* no attempt connected yet, start another one? */
  pnow = Curl_pgrs_now(data);
  if(!ongoing) {
    do_more = TRUE;
  }
  else {
    bool more_possible = cf_ai_iter_has_more(&bs->addr_iter, data);
#ifdef USE_IPV6
    if(!more_possible)
      more_possible = cf_ai_iter_has_more(&bs->ipv6_iter, data);
#endif
    do_more = more_possible &&
      (curlx_ptimediff_ms(pnow, &bs->last_attempt_started) >=
       bs->attempt_delay_ms);
    if(do_more)
      CURL_TRC_CF(data, cf, "happy eyeballs timeout expired, "
                  "start next attempt");
  }

  if(do_more) {
    /* start the next attempt if there is another ip address to try.
     * Alternate between address families when possible. */
    const struct Curl_addrinfo *ai = NULL;
    int ai_family = 0;
    CURL_TRC_CF(data, cf, "want to do more");
#ifdef USE_IPV6
    if((bs->last_attempt_ai_family == AF_INET) ||
       !cf_ai_iter_has_more(&bs->addr_iter, data)) {
      ai = cf_ai_iter_next(&bs->ipv6_iter, data);
      ai_family = bs->ipv6_iter.ai_family;
      CURL_TRC_CF(data, cf, "check for next AAAA address: %s",
                  ai ? "found" : "none");
    }
#endif
    if(!ai) {
      ai = cf_ai_iter_next(&bs->addr_iter, data);
      ai_family = bs->addr_iter.ai_family;
      CURL_TRC_CF(data, cf, "check for next A address: %s",
                  ai ? "found" : "none");
    }`,
		notes: [
			'Lignes 3 et 4 : quand aucune tentative n’est encore en cours, par exemple parce que la dernière a échoué tout de suite, curl lance la suivante sans attendre.',
			'Lignes 12 à 14 : tant qu’une tentative attend encore, curl n’en lance une autre qu’une fois `attempt_delay_ms` écoulé depuis le dernier départ. Cette valeur est `data->set.happy_eyeballs_timeout`, 200 ms sauf si `--happy-eyeballs-timeout-ms` la change.',
			'Les lignes 27 à 29 choisissent IPv6 quand la tentative précédente était en IPv4. [`cf_ip_ballers_init`](' + HAPPY + '#L359-L361) pose `last_attempt_ai_family = AF_INET` avec le commentaire "so AF_INET6 is next" : c’est pour cela que la première tentative est en IPv6.',
			'Les lignes 35 à 37 se rabattent sur l’adresse A suivante. Au total, les tentatives alternent IPv6, IPv4, IPv6, comme le demande la RFC 8305 : "if the first address in the sorted list is IPv6, then the first IPv4 address should be moved up in the list to be second".'
		]
	},
	tradeoff: {
		gain: [
			'Un chemin IPv6 cassé coûte un délai au lieu d’un timeout TCP complet : 0,205 s contre 135,7 s dans cette session.',
			'IPv6 reste le premier choix. La RFC 6555 donne à IPv6 "a slight preference" pour "reduce the load on IPv4 network address translators".'
		],
		cost: [
			'Un hôte double pile a deux chemins à déboguer. Une connexion qui marche avec curl peut encore bloquer dans un client qui essaie une adresse à la fois.',
			'Happy Eyeballs cache un chemin IPv6 cassé. curl s’est connecté en 0,205 s au lieu de 0,004 s sans afficher d’avertissement : seul `-v` montrait la ligne `Trying [2001:db8::1]:80...`.',
			'La RFC 6555 signale la charge en plus : Happy Eyeballs envoie plus de tentatives de connexion au réseau et aux serveurs quand IPv6 ne se connecte pas vite.'
		]
	},
	task: {
		prompt: 'Trois choses à lire. (1) Écris `2001:db8::8:800:200c:417a` en entier, avec les huit groupes. (2) Sur la machine utilisée pour ce chapitre, `ip -6 route show default` affiche `default via fe80::… dev wlp194s0 proto ra metric 600`, et `ip -6 addr` montre des adresses globales marquées `dynamic`. D’où viennent la passerelle et les adresses, et pourquoi la passerelle est-elle une adresse `fe80::` ? (3) Le chemin IPv6 vers un site est cassé. Combien de temps met curl pour se connecter avec sa valeur par défaut, et combien met un client avec un délai de 300 ms, si la connexion IPv4 prend 5 ms ?',
		hint: 'Pour (1), `::` vaut autant de groupes à zéro qu’il en faut pour arriver à huit. Pour (2), regarde `proto ra`.',
		answer: [
			'(1) L’adresse montre 6 groupes, donc `::` en vaut 2 : `2001:0db8:0000:0000:0008:0800:200c:417a`. La RFC 4291 donne le même exemple, `2001:DB8:0:0:8:800:200C:417A`.',
			'(2) `proto ra` veut dire que la route a été apprise par une Router Advertisement. La RFC 4861 impose au routeur de l’envoyer depuis son adresse link-local : l’hôte connaît donc la passerelle sous une adresse `fe80::`, valable sur ce lien seulement. Les adresses globales `dynamic` viennent de SLAAC : le préfixe annoncé plus l’identifiant d’interface de 64 bits de l’hôte.',
			'(3) curl : 200 ms + 5 ms = environ 205 ms, comme mesuré. Un client avec un délai de 300 ms : environ 305 ms. Sans Happy Eyeballs, la connexion attend le timeout du SYN : environ 131 secondes avec `tcp_syn_retries` par défaut.'
		]
	},
	quiz: [
		{
			q: 'Quelle forme de `2001:0db8:0000:0000:0000:ff00:0042:8329` est valide ?',
			options: ['`2001:db8::ff00:42:8329`', '`2001:db8::ff00::42:8329`', '`2001:db8:ff00:42:8329`', '`2001:db8:0:ff00:42:8329`'],
			answer: 0,
			why: 'Les zéros en tête d’un groupe peuvent tomber, et `::` remplace la suite de trois groupes à zéro. `::` ne peut apparaître qu’une fois (RFC 4291), et une adresse écrite sans `::` doit garder ses huit groupes.'
		},
		{
			q: 'IPv6 vers un site est cassé, IPv4 marche. curl se connecte en 0,2 s environ. Un script Python qui essaie les adresses dans l’ordre met plus de 2 minutes. Pourquoi ?',
			options: [
				'Python résout les enregistrements AAAA plus lentement que curl',
				'curl lance IPv4 après 200 ms, alors que le script attend le timeout du SYN',
				'curl désactive IPv6 sur l’hôte quand il détecte un chemin cassé',
				'Le script envoie ses SYN en UDP, et le réseau les jette'
			],
			answer: 1,
			why: 'curl garde la tentative IPv6 ouverte et lance une tentative IPv4 en parallèle après son délai Happy Eyeballs. Le script reste bloqué dans `connect()` jusqu’à ce que le noyau abandonne après ses SYN répétés, environ 131 s par défaut, puis essaie IPv4.'
		},
		{
			q: '`ip -6 route` affiche `default via fe80::1 dev eth0 proto ra`. Qu’est-ce que cela t’apprend ?',
			options: [
				'L’hôte est mal configuré, car une passerelle par défaut doit avoir une adresse globale',
				'La route vient d’une Router Advertisement envoyée depuis une adresse link-local',
				'L’hôte n’a pas d’accès internet en IPv6, seulement du trafic sur le lien local',
				'Un serveur DHCPv6 a attribué la passerelle comme route statique'
			],
			answer: 1,
			why: 'La RFC 4861 impose que les Router Advertisements partent de l’adresse link-local du routeur, et le prochain saut n’a besoin d’être joignable que sur le lien. `proto ra` marque les routes apprises ainsi : c’est comme ça que les hôtes en SLAAC obtiennent leur route par défaut.'
		}
	],
	recall: {
		q: 'Avec un chemin IPv6 cassé, combien de temps ont mis curl et un client qui essaie une adresse à la fois pour se connecter dans ce chapitre, et d’où vient l’écart ?',
		a: 'curl : 0,205 s, parce qu’il lance IPv4 après son délai Happy Eyeballs de 200 ms. Le client séquentiel : 135,7 s, parce qu’il attend le timeout du SYN dans le noyau (environ 131 s avec `tcp_syn_retries` à 6).'
	},
	sources: [
		{ title: 'RFC 8305, Happy Eyeballs Version 2', url: 'https://www.rfc-editor.org/rfc/rfc8305' },
		{ title: 'RFC 6555, Happy Eyeballs: Success with Dual-Stack Hosts', url: 'https://www.rfc-editor.org/rfc/rfc6555' },
		{ title: 'RFC 4291, IP Version 6 Addressing Architecture', url: 'https://www.rfc-editor.org/rfc/rfc4291' },
		{ title: 'RFC 4862, IPv6 Stateless Address Autoconfiguration', url: 'https://www.rfc-editor.org/rfc/rfc4862' },
		{ title: 'RFC 4861, Neighbor Discovery for IP version 6', url: 'https://www.rfc-editor.org/rfc/rfc4861' },
		{ title: 'Doc curl, CURLOPT_HAPPY_EYEBALLS_TIMEOUT_MS', url: HEDOC },
		{ title: 'Doc du noyau Linux, IP sysctl (tcp_syn_retries)', url: 'https://docs.kernel.org/networking/ip-sysctl.html' }
	]
};
