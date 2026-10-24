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
		],
		steps: [
			{
				title: 'Développe l’adresse',
				questions: [
					{ q: 'Combien de groupes montre `2001:db8::8:800:200c:417a` ?', options: ['8', '6', '5', '4'], answer: 1, why: '`2001`, `db8`, puis `8`, `800`, `200c`, `417a` : six groupes autour du `::`.' },
					{ q: 'Combien de groupes à zéro `::` remplace-t-il ici ?', options: ['2', '1', '3', '6'], answer: 0, why: 'Une adresse a huit groupes : `::` comble les deux qui manquent.' },
					{ q: 'Quelle est la forme complète ?', options: ['`2001:db8:0:8:800:200c:417a:0`', '`2001:db8:0:0:0:8:800:200c:417a`', '`2001:0:0:db8:8:800:200c:417a`', '`2001:db8:0:0:8:800:200c:417a`'], answer: 3, why: 'Les deux groupes à zéro vont à la place du `::`, entre `db8` et `8`. Cela fait huit groupes.' },
					{ q: 'Pourquoi `2001:db8::8::417a` n’est-elle pas une adresse valide ?', options: ['`::` ne peut apparaître qu’une fois', 'Un groupe ne peut pas avoir un seul chiffre', 'Une adresse ne peut pas commencer par `2001`', 'Elle a trop de groupes'], answer: 0, why: 'Avec deux `::`, personne ne saurait combien de zéros chacun cache. La RFC 4291 n’en autorise qu’un.' }
				]
			},
			{
				title: 'Lis la route par défaut',
				questions: [
					{ q: 'Dans `default via fe80::… dev wlp194s0 proto ra metric 600`, quelle partie est le prochain saut ?', options: ['`wlp194s0`, après `dev`', '`600`, après `metric`', '`fe80::…`, après `via`', '`ra`, après `proto`'], answer: 2, why: '`via` nomme la passerelle à qui l’on remet les paquets. `dev` est l’interface, `proto` l’origine de la route.' },
					{ q: 'Le portable rejoint un autre réseau Wi-Fi. Garde-t-il cette passerelle `fe80::…` ?', options: ['Oui : les passerelles link-local sont les mêmes sur tous les réseaux', 'Non : les annonces du nouveau routeur lui donnent un nouveau prochain saut `fe80::`', 'Oui, jusqu’à ce que la métrique change', 'Non : il lui faut DHCPv6 pour trouver un routeur'], answer: 1, why: 'La passerelle est l’adresse link-local du routeur de ce lien. Sur un nouveau lien, l’hôte réapprend la route par défaut par les annonces de ce routeur-là.' },
					{ q: 'Un prochain saut en `fe80::` suffit-il pour joindre Internet ?', options: ['Non : une passerelle doit avoir une adresse globale', 'Seulement pour le trafic dans `fe80::/10`', 'Seulement si DHCPv6 tourne aussi', 'Oui : le prochain saut doit juste être joignable sur le lien'], answer: 3, why: 'L’hôte ne fait que remettre les paquets au routeur sur le lien local. Le routeur les transmet ensuite avec ses propres adresses.' },
					{ q: 'Pourquoi la route nomme-t-elle `dev wlp194s0` ?', options: ['Une adresse link-local n’est valable que sur un lien', 'La route ne sert qu’aux clients Wi-Fi', 'Le noyau choisit l’interface la plus rapide', 'Les routes IPv6 nomment toujours une interface pour les logs'], answer: 0, why: 'Des adresses `fe80::` existent sur chaque lien : l’interface dit à quel lien celle-ci appartient.' }
				]
			},
			{
				title: 'Explique les adresses globales',
				questions: [
					{ q: 'D’où viennent les adresses globales `dynamic` ?', options: ['Un serveur DHCP les a louées', 'De SLAAC : le préfixe annoncé plus l’identifiant d’interface de l’hôte', 'Le FAI les a posées à la main', 'Ce sont des adresses link-local avec un nouveau préfixe'], answer: 1, why: 'Avec SLAAC, le routeur annonce un préfixe et l’hôte y ajoute son identifiant d’interface de 64 bits, sans serveur DHCP.' },
					{ q: 'Combien de bits l’hôte ajoute-t-il au préfixe ?', options: ['32', '48', '64', '128'], answer: 2, why: 'SLAAC utilise un identifiant d’interface de 64 bits.' },
					{ q: 'Quelle adresse chaque interface IPv6 a-t-elle, même sans routeur ?', options: ['Une adresse globale SLAAC', 'Une adresse dans `2001:db8::/32`', 'Une adresse IPv4 mappée', 'Une adresse link-local dans `fe80::/10`'], answer: 3, why: 'La RFC 4291 impose à chaque interface IPv6 d’avoir une adresse link-local.' },
					{ q: 'La route et les adresses viennent d’une même source. Laquelle ?', options: ['Les annonces du routeur', 'Le résolveur DNS', 'Les valeurs par défaut du noyau', 'Le serveur DHCPv6 du FAI'], answer: 0, why: 'Une Router Advertisement porte l’adresse link-local du routeur et le préfixe : l’une donne la route, l’autre les adresses.' }
				]
			},
			{
				title: 'Chronomètre le repli',
				questions: [
					{ q: 'Dans `cf-ip-happy.c`, quel message de trace marque le moment où curl lance la tentative IPv4 ?', options: ['`Connection timed out`', '`happy eyeballs timeout expired, start next attempt`', '`check for next AAAA address: none`', '`Trying [2001:db8::1]:80...`'], answer: 1, why: 'Une fois `attempt_delay_ms` écoulé avec la tentative IPv6 toujours en attente, curl écrit cette ligne et prend l’adresse suivante, une adresse A.' },
					{ q: 'IPv4 se connecte en 5 ms. Combien de temps met curl avec `--happy-eyeballs-timeout-ms 1000` ?', options: ['Environ 205 ms', 'Environ 1 000 ms', 'Environ 1 005 ms', 'Environ 5 ms'], answer: 2, why: 'curl attend maintenant 1 000 ms sur IPv6 avant de lancer IPv4, puis 5 ms pour la connexion IPv4. Le test du chapitre affichait 1,004 s avec une connexion de 4 ms.' },
					{ q: 'Combien pour un client avec un délai de 300 ms, comme Firefox ou Chrome ?', options: ['Environ 305 ms', 'Environ 300 ms', 'Environ 205 ms', 'Environ 600 ms'], answer: 0, why: '300 ms de délai plus les 5 ms de la connexion IPv4.' },
					{ q: 'Le site répare son chemin IPv6, qui se connecte maintenant en 5 ms. Combien de temps met curl ?', options: ['Environ 205 ms', 'Environ 200 ms', 'Environ 10 ms, une connexion par famille', 'Environ 5 ms, en IPv6'], answer: 3, why: 'La première tentative est en IPv6. Elle aboutit avant la fin du délai de 200 ms, donc curl ne lance jamais IPv4.' }
				]
			}
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
	lab: {
		minutes: 15,
		goal: 'Casser exprès le chemin IPv6 et chronométrer le repli Happy Eyeballs de curl.',
		steps: [
			'Ouvre un shell jetable avec IPv6 activé et son propre namespace réseau : `docker run -it --rm --cap-add NET_ADMIN --sysctl net.ipv6.conf.all.disable_ipv6=0 nicolaka/netshoot:v0.13`.',
			'Dedans, lance un serveur web en IPv4 seulement : `python3 -m http.server 8000 --bind 127.0.0.1 >/dev/null 2>&1 &`.',
			'Fais de `2001:db8::/32` un trou noir silencieux : `ip link add dummy0 type dummy && ip link set dummy0 up && ip -6 addr add 2001:db8:ffff::2/64 dev dummy0 && ip -6 route add 2001:db8::/32 dev dummy0`.',
			'Donne les deux adresses à curl, IPv6 d’abord, et chronomètre la connexion : `curl -s -o /dev/null -w "%{time_connect} %{remote_ip}\\n" --resolve demo.test:8000:[2001:db8::1],127.0.0.1 http://demo.test:8000/`.',
			'Relance avec `--happy-eyeballs-timeout-ms 1000`, puis avec `-4`, puis avec `-6 --connect-timeout 5`.'
		],
		done: [
			'Le premier essai affiche environ `0.200` et `127.0.0.1`.',
			'Avec `--happy-eyeballs-timeout-ms 1000`, il affiche environ `1.00`, et avec `-4` presque `0.000`.',
			'Avec `-6 --connect-timeout 5`, curl échoue après environ 5000 ms avec "Timeout was reached".'
		],
		solution: [
			'Le SYN vers `2001:db8::1` part sur `dummy0` et rien ne répond jamais, comme le chemin cassé de l’accroche. curl attend son délai de 200 ms, puis lance IPv4 à côté, et IPv4 gagne.',
			'Avec `-6`, il n’y a rien vers quoi se replier : seul le timeout met fin à l’attente. Sans `--connect-timeout`, les nouveaux essais de SYN du noyau prendraient environ 131 secondes.',
			'Tape `exit` : l’interface dummy et sa route disparaissent avec le conteneur.'
		]
	},
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
