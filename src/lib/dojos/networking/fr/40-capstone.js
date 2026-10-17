const CURL = 'https://github.com/curl/curl/blob/98979fe46bd6fe7d8bedd3126e6c0340e2f9cfa4';
const CFD = 'https://github.com/cloudflare/cloudflare-docs/blob/efe20bd5f22d9b780243fce278f10fada77f0ccf/src/content/docs';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'capstone',
	part: 'Déboguer le réseau',
	title: 'Une requête de bout en bout',
	minutes: 10,
	hook: [
		'Le 2026-10-17, `curl -v https://example.org/` sur un portable affiche `HTTP/2 200` et télécharge 577 octets. `curl -w` mesure la requête entière à 35,6 ms.',
		'En 35,6 ms, curl obtient 4 adresses d’un résolveur, ouvre une connexion TCP en IPv6 et fait une poignée de main TLS 1.3. Puis il envoie une seule requête HTTP/2, et **un cache de Cloudflare y répond avec une copie stockée.**',
		'Toutes les sorties de ce chapitre viennent de ce run, d’un `dig example.org` et d’un `dig +trace` lancés quelques secondes avant, avec curl 8.5.0 et dig 9.18.39. Chaque étape du diagramme cite les chapitres qui l’expliquent.'
	],
	terms: [
		{ term: 'Stub resolver', def: 'Le résolveur qu’un programme interroge en premier. Sur ce portable, `/etc/resolv.conf` indique `nameserver 127.0.0.53`, le stub de systemd-resolved, qui transmet les requêtes absentes de son cache et garde les réponses.' },
		{ term: 'Happy Eyeballs', def: 'Selon la doc de curl, un algorithme qui essaie IPv6 et IPv4 "giving IPv6 a head-start". Si IPv6 n’est pas connecté après le délai, une tentative IPv4 démarre en parallèle, et la première connectée gagne.' },
		{ term: 'ALPN', def: 'Une extension TLS, RFC 7301, qui choisit le protocole applicatif pendant la poignée de main. curl a proposé `h2,http/1.1` et le serveur a choisi `h2`.' },
		{ term: 'cf-cache-status', def: 'Un en-tête de réponse de Cloudflare. `HIT` veut dire "The resource was found in Cloudflare\'s cache."' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['cl["curl sur le portable"] -->|"résoudre example.org"| stub["systemd-resolved, 127.0.0.53"]'],
				highlight: ['cl', 'stub'],
				note: 'Chapitres 09 et 12. Le stub a renvoyé 2 enregistrements A, 104.20.26.136 et 172.66.157.237, et 2 enregistrements AAAA. `time_namelookup` valait 0.000789, moins de 1 ms : la réponse venait d’un cache.'
			},
			{
				add: ['stub -.->|"dig +trace : racine, org, Cloudflare"| ns["mitch.ns.cloudflare.com"]'],
				highlight: ['ns'],
				note: 'Chapitres 09 à 11. `dig +trace` a interrogé m.root-servers.net (6 ms), puis b0.org.afilias-nst.org (16 ms), puis mitch.ns.cloudflare.com (9 ms). Ce dernier a donné les enregistrements A avec un TTL de 300. Via le stub, les mêmes enregistrements avaient un TTL de 122 : un cache les gardait depuis 178 secondes.'
			},
			{
				add: ['cl -->|"SYN vers le port 443 en IPv6"| edge["Edge Cloudflare, 2606:4700:10::6814:1a88"]'],
				highlight: ['edge'],
				note: 'Chapitres 03, 05, 15 et 39. curl a affiché `Trying [2606:4700:10::6814:1a88]:443...` et aucune tentative IPv4. RIPEstat montre 2606:4700:10::/44 annoncé par l’AS13335, Cloudflare, dont la doc appelle ces adresses anycast. `time_connect` moins `time_namelookup` donne 5,7 ms, et `ping -6` a mesuré 8,6 ms en moyenne.'
			},
			{
				add: ['cl -->|"TLS 1.3, ALPN h2"| edge'],
				highlight: ['cl', 'edge'],
				note: 'Chapitres 20 et 21. `time_appconnect` valait 0.023349 : TLS a pris 16,9 ms. Le certificat porte `CN=example.org`, émis par `Cloudflare TLS Issuing ECC CA 3`, valide du 26 septembre au 25 décembre 2026. curl a affiché `SSL certificate verify ok.` et `ALPN: server accepted h2`.'
			},
			{
				add: ['cl -->|"HTTP/2 stream 1 : GET /"| edge', 'edge -->|"chercher /"| cache["Cache edge, cf-ray finit par CDG"]'],
				highlight: ['cache'],
				note: 'Chapitres 18, 22 et 30. curl a envoyé la requête sur le stream 1, avec `:method: GET` et `:authority: example.org`. La réponse contenait `cf-cache-status: HIT`, `age: 11173` et `cache-control: max-age=14400`. D’après la doc de Cloudflare, le code de trois lettres à la fin de `cf-ray` désigne le data center.'
			},
			{
				add: ['edge -->|"200, 577 octets, alt-svc h3"| cl'],
				highlight: ['cl'],
				note: 'Chapitres 19, 28 et 38. `time_starttransfer` valait 0.035518, 12,2 ms après TLS, et `time_total` 0.035598. L’en-tête `alt-svc: h3=":443"; ma=86400` propose HTTP/3 pour les 86400 secondes suivantes. curl a fini par `Connection #0 to host example.org left intact`.'
			}
		]
	},
	example: {
		title: 'lib/cf-ip-happy.c dans curl : quelle famille d’adresses essayer ensuite',
		repo: 'curl/curl',
		url: `${CURL}/lib/cf-ip-happy.c#L361-L540`,
		lang: 'c',
		code: `  bs->last_attempt_ai_family = AF_INET; /* so AF_INET6 is next */
…
  /* no attempt connected yet, start another one? */
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
…
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
    }
…
      bs->last_attempt_started = *pnow;
      bs->last_attempt_ai_family = ai_family;
      /* and run everything again */`,
		notes: [
			'La ligne 1 enregistre IPv4 comme dernière famille essayée, avant toute tentative. Le test de la ligne 29 est donc vrai, et les lignes 31 et 32 prennent d’abord une adresse AAAA. Ce code vient du commit épinglé. Le run en 8.5.0 a lui aussi essayé l’adresse IPv6 en premier.',
			'Les lignes 14 à 16 ne lancent une deuxième tentative qu’une fois `attempt_delay_ms` écoulé depuis la précédente. Cette valeur est `happy_eyeballs_timeout`, que [la doc de curl](' + CURL + '/docs/cmdline-opts/happy-eyeballs-timeout-ms.md) fixe à 200 ms par défaut. IPv6 s’est connecté en 5,7 ms, donc aucune tentative IPv4 n’a été nécessaire.',
			'Les lignes 44 et 45 gardent la famille qui vient d’être essayée. Si IPv6 n’est pas connecté après 200 ms, le passage suivant arrive aux lignes 37 à 39 et essaie 104.20.26.136 en IPv4.'
		]
	},
	tradeoff: {
		gain: [
			'Un seul `curl -v` montre les adresses, l’adresse choisie, la version de TLS, le certificat, le résultat d’ALPN et tous les en-têtes de réponse.',
			'Avec `-w` et les timers, les 35,6 ms se découpent en DNS, TCP, TLS et premier octet, comme au chapitre 38.',
			'`dig +trace` montre chaque délégation depuis la racine, avec le temps de chaque serveur, sans passer par le cache du stub.'
		],
		cost: [
			'Les caches cachent des étapes : le stub a répondu en moins de 1 ms, donc ce run ne dit rien des serveurs racine, de .org ni de ceux de Cloudflare.',
			'curl parle à l’edge Cloudflare et à aucun autre serveur. Avec `cf-cache-status: HIT`, rien dans la sortie ne dit où est le serveur d’example.org ni à quelle vitesse il répond.',
			'curl ne montre ni les paquets ni les routeurs du chemin. Pour les retransmissions, il faut `tcpdump` (chapitre 37), et pour le chemin, `mtr` (chapitre 38).'
		]
	},
	task: {
		prompt: 'Dans le run : `dig example.org` via le stub montrait un TTL de 122 sur les enregistrements A. La réponse avait `age: 11173`, `cache-control: max-age=14400` et `alt-svc: h3=":443"; ma=86400`. Le certificat expire le Dec 25 22:13:27 2026 GMT, et le run date du 17 octobre à 00:10 UTC. Pour chacun, dis combien de temps il reste valide et à quel chapitre il appartient.',
		hint: 'Chaque valeur est une durée de vie ou un âge en secondes. Ce qui reste, c’est la durée de vie moins le temps déjà passé.',
		answer: [
			'DNS (chapitre 11) : le stub peut garder les enregistrements A encore 122 secondes. Ensuite il redemande, et le serveur autoritaire donne un nouveau TTL de 300.',
			'Cache HTTP (chapitre 22) : pour la RFC 9111, une réponse est fraîche tant que sa durée de fraîcheur dépasse son âge. 14400 moins 11173 laisse 3227 secondes, environ 54 minutes, avant qu’un cache de navigateur doive revalider cette copie.',
			'Alt-Svc (chapitre 19) : la RFC 7838 compte `ma` en secondes "since the response was generated". Le client peut essayer HTTP/3 sur le port UDP 443 pendant les 86400 secondes suivantes, un jour.',
			'Certificat (chapitre 21) : du 17 octobre 00:10 au 25 décembre 22:13, il reste 69 jours et 22 heures. Il a été émis le 26 septembre, donc sa durée de vie totale est d’environ 90 jours.'
		]
	},
	quiz: [
		{
			q: 'curl avait 2 adresses AAAA et 2 adresses A pour example.org. Sa sortie ne montre que `Trying [2606:4700:10::6814:1a88]:443`. Pourquoi aucune tentative IPv4 ?',
			options: [
				'Le portable n’a aucune route IPv4 vers Cloudflare',
				'IPv6 est passé en premier et s’est connecté avant 200 ms',
				'curl n’utilise IPv4 que si la requête AAAA échoue',
				'Le serveur a refusé l’adresse IPv4 avec un reset'
			],
			answer: 1,
			why: 'curl commence par une adresse AAAA, et ne lance une tentative IPv4 qu’une fois `attempt_delay_ms` écoulé, 200 ms par défaut. La poignée de main IPv6 a pris 5,7 ms.'
		},
		{
			q: '`dig +trace` obtient un TTL de 300 pour example.org depuis mitch.ns.cloudflare.com. `dig example.org` via 127.0.0.53 montre un TTL de 122. Pourquoi ?',
			options: [
				'Les deux serveurs de noms d’example.org ne sont pas d’accord',
				'systemd-resolved divise chaque TTL par deux',
				'Un cache garde l’enregistrement depuis 178 des 300 secondes',
				'Le stub arrondit les TTL aux 2 minutes les plus proches'
			],
			answer: 2,
			why: 'Un cache renvoie un enregistrement avec le TTL qui lui reste. 300 moins 122 donne 178 secondes depuis que ce cache a reçu la réponse du serveur autoritaire.'
		},
		{
			q: 'La réponse contient `cf-cache-status: HIT` et `age: 11173`. Quel serveur a envoyé les 577 octets ?',
			options: [
				'Le serveur d’example.org lui-même, via un tunnel Cloudflare',
				'Un data center de Cloudflare, depuis son cache',
				'Le cache du navigateur, car la copie avait 3 heures',
				'mitch.ns.cloudflare.com, avec la réponse DNS'
			],
			answer: 1,
			why: '`HIT` veut dire que la ressource était dans le cache de Cloudflare, et Cloudflare met `Age` sur les réponses servies depuis le cache. curl n’a jamais parlé au serveur d’example.org.'
		}
	],
	recall: {
		q: 'Donne les étapes de `curl https://example.org/` dans ce run, dans l’ordre, avec le chapitre et la durée de chacune.',
		a: 'DNS depuis le cache du stub en 0,8 ms (09, 11). TCP en IPv6 vers une adresse anycast de Cloudflare en 5,7 ms (05, 15, 39). TLS 1.3 avec ALPN `h2` en 16,9 ms (20, 21). Un seul GET HTTP/2, servi par le cache edge en 12,2 ms (18, 22, 30).'
	},
	sources: [
		{ title: 'Source de curl, lib/cf-ip-happy.c', url: `${CURL}/lib/cf-ip-happy.c` },
		{ title: 'Doc de curl, --happy-eyeballs-timeout-ms', url: `${CURL}/docs/cmdline-opts/happy-eyeballs-timeout-ms.md` },
		{ title: 'Doc Cloudflare, How Cloudflare works', url: `${CFD}/fundamentals/concepts/how-cloudflare-works.mdx` },
		{ title: 'Doc Cloudflare, Cloudflare HTTP headers (Cf-Ray)', url: `${CFD}/fundamentals/reference/http-headers.mdx` },
		{ title: 'Doc Cloudflare, Cloudflare cache responses', url: `${CFD}/cache/concepts/cache-responses.mdx` },
		{ title: 'RFC 9111, HTTP Caching', url: 'https://www.rfc-editor.org/rfc/rfc9111' },
		{ title: 'RFC 7838, HTTP Alternative Services', url: 'https://www.rfc-editor.org/rfc/rfc7838' },
		{ title: 'RFC 7301, TLS Application-Layer Protocol Negotiation Extension', url: 'https://www.rfc-editor.org/rfc/rfc7301' }
	]
};
