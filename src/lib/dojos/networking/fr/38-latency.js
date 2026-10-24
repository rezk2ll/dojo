const CURL = 'https://github.com/curl/curl/blob/98979fe46bd6fe7d8bedd3126e6c0340e2f9cfa4';
const MTR = 'https://github.com/traviscross/mtr/blob/e1ddc9e2b14add72288532dff9d965398bc12b32/man/mtr.8.in';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'latency',
	part: 'Déboguer le réseau',
	title: 'Où passe le temps',
	minutes: 10,
	hook: [
		'Depuis un portable, `curl https://ftp.jaist.ac.jp/` met 1,31 seconde à renvoyer la page d’accueil du miroir. `ping` vers la même machine donne un aller-retour de 256 ms. 1,31 seconde, c’est environ 5 de ces allers-retours.',
		'`curl -w` découpe les 1,31 seconde : 274 ms pour résoudre le nom, puis 254 ms pour la connexion TCP, 516 ms pour TLS et 270 ms jusqu’au premier octet. **Les trois dernières phases font 1 040 ms, à peu près 4 allers-retours de 256 ms.**',
		'Tous les chiffres de ce chapitre viennent de mesures du 2026-10-17 avec curl 8.5.0 et mtr 0.95, toutes depuis le même portable.'
	],
	terms: [
		{ term: 'RTT', def: 'Round trip time : le temps qu’un paquet met à atteindre une machine et sa réponse à revenir. `ping` a mesuré 256 ms vers ftp.jaist.ac.jp et 339 ms vers mirror.aarnet.edu.au.' },
		{ term: 'Write-out timer', def: 'Une variable de `curl -w` comme `%{time_connect}`. Chacune donne le temps en secondes entre le début du transfert et la fin de cette étape.' },
		{ term: 'Time to first byte', def: '`%{time_starttransfer}` : le temps jusqu’à la réception du premier octet de la réponse. Il contient toutes les étapes d’avant et le travail du serveur.' },
		{ term: 'Hop', def: 'Un routeur sur le chemin. mtr trouve chaque hop en envoyant des sondes avec un TTL de 1, 2, 3 et ainsi de suite, et affiche la perte et le RTT de chacun.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['cl["curl sur le portable"] -->|"résolution du nom"| res["Résolveur DNS"]'],
				highlight: ['cl', 'res'],
				note: '`time_namelookup` valait 0.274468 : 274 ms avant que curl ait une adresse. Une mesure suivante affichait 0.000774, moins d’1 ms, parce que la réponse était en cache.'
			},
			{
				add: ['cl -->|"SYN, SYN-ACK : 1 aller-retour"| srv["ftp.jaist.ac.jp 2001:df0:2ed:feed::feed"]'],
				highlight: ['srv'],
				note: '`time_connect` valait 0.528700. Retire la résolution : 528,7 moins 274,5 donne 254 ms pour la poignée de main TCP. Ça correspond à un aller-retour `ping` de 256 ms.'
			},
			{
				add: ['cl -->|"poignée de main TLS 1.3"| srv'],
				highlight: ['cl', 'srv'],
				note: '`time_appconnect` valait 1.044426 : TLS a pris 516 ms, environ 2 allers-retours. `curl -v` affichait `TLSv1.3` et `ALPN: server accepted http/1.1`. Vers mirror.aarnet.edu.au, la même phase TLS 1.3 a pris 342 ms, un seul aller-retour de 339 ms.'
			},
			{
				add: ['cl -->|"GET / HTTP/1.1"| srv', 'srv -->|"premier octet du 200 OK"| cl'],
				highlight: ['cl', 'srv'],
				note: '`time_starttransfer` valait 1.314390, soit 270 ms après TLS : un aller-retour pour la requête et la réponse, plus environ 14 ms. `time_total` valait 1.314453 : le reste de la page est arrivé en moins d’1 ms.'
			},
			{
				add: ['cl -->|"sondes avec TTL de 1 à 21"| hops["mtr : hop 1 à 1,8 ms, hops 2 à 20 ???, hop 21 à 255,4 ms"]'],
				highlight: ['hops'],
				note: '`mtr -4 -U 30 --report -n ftp.jaist.ac.jp` a envoyé 10 sondes par hop. Les hops 2 à 20 n’ont jamais répondu et affichent `???` avec 100 % de perte. La destination, au hop 21, a répondu 10 fois sur 10 : ces routeurs ont transmis toutes les sondes et n’ont juste pas envoyé leur propre réponse.'
			}
		]
	},
	example: {
		title: 'lib/progress.c dans curl : là où chaque timer de write-out est noté',
		repo: 'curl/curl',
		url: `${CURL}/lib/progress.c#L264-L334`,
		lang: 'c',
		code: `void Curl_pgrsTimeWas(struct Curl_easy *data, timerid timer,
                      struct curltime timestamp)
{
  timediff_t *delta = NULL;

  switch(timer) {
…
  case TIMER_NAMELOOKUP:
    delta = &data->progress.total.nslookup_us;
    break;
  case TIMER_CONNECT:
    delta = &data->progress.total.connect_us;
    break;
  case TIMER_APPCONNECT:
    delta = &data->progress.total.appconnect_us;
    break;
  case TIMER_PRETRANSFER:
    delta = &data->progress.total.pretransfer_us;
    break;
  case TIMER_STARTTRANSFER:
    /* prevent updating t_starttransfer unless:
     *   1. this is the first time we are setting t_starttransfer
     *   2. a redirect has occurred since the last time t_starttransfer was set
     * This prevents repeated invocations of the function from incorrectly
     * changing the t_starttransfer time.
     */
    if(data->progress.startransfer_added) {
      CURL_TRC_M(data, "[%s] ignored", pgrs_timer_name(timer));
      return;
    }
    data->progress.startransfer_added = TRUE;
    delta = &data->progress.total.starttransfer_us;
    break;
…
  if(delta) {
    timediff_t us = curlx_ptimediff_us(&timestamp, &data->progress.start) -
                    data->progress.delta.startsingle_us;
    if(us < 1)
      us = 1; /* make sure at least one microsecond passed */
    *delta += us;`,
		notes: [
			'Les lignes 8 à 19 donnent un compteur à chaque étape. `nslookup_us` est ce qu’affiche `%{time_namelookup}`, via [`getinfo.c`](' + CURL + '/lib/getinfo.c#L472-L474), et `connect_us` et `appconnect_us` alimentent `time_connect` et `time_appconnect`.',
			'Les lignes 36 et 37 mesurent depuis `progress.start`, moins le début de cette requête. Chaque timer compte donc depuis le départ et contient les étapes d’avant. Pour une seule phase, soustrais le timer précédent : `time_connect - time_namelookup` a donné les 254 ms de la poignée de main TCP.',
			'Les lignes 27 à 31 gardent la première valeur du timer de premier octet. Les appels suivants pendant la même requête sont ignorés, comme l’explique le commentaire des lignes 21 à 25.',
			'La ligne 40 additionne avec `+=`. Avec `-L` et une redirection, chaque timer cumule les valeurs de toutes les requêtes de la chaîne, et `%{time_redirect}` donne à part le temps des redirections.'
		]
	},
	tradeoff: {
		gain: [
			'Un seul `curl -w` découpe une requête lente en DNS, TCP, TLS et temps serveur, sans aucun accès au serveur.',
			'Comparer une phase au RTT de `ping` dit si c’est la distance ou le travail : 254 ms de connexion TCP sur un chemin à 256 ms, c’est un aller-retour et rien d’autre.',
			'mtr montre le RTT et la perte de chaque hop, et `-T` ou `-u` envoient des SYN TCP ou de l’UDP quand le chemin traite ICMP à part.'
		],
		cost: [
			'curl mesure depuis un client, à un instant. La même commande a donné 274 ms de DNS, puis 0,8 ms à une mesure suivante, grâce au cache.',
			'Les routeurs peuvent ne pas répondre du tout à mtr : 19 hops sur 21 affichaient `???` ici. Avec `--max-unknown 5` par défaut, le rapport s’arrêtait au hop 2 et ne montrait jamais la destination.',
			'Le man de mtr prévient que les routeurs qui donnent une priorité plus basse à ICMP ECHO paraissent "significantly lower" en fiabilité qu’ils ne le sont.'
		]
	},
	task: {
		prompt: 'Tu lances `curl -s -o /dev/null -w` avec les timers vers `https://mirror.aarnet.edu.au/` et tu obtiens :\n`namelookup=0.000699 connect=0.338539 appconnect=0.680307 pretransfer=0.680390 starttransfer=1.054753 total=1.054808`\n`ping` vers la machine donne un RTT moyen de 339 ms. Découpe les 1,05 seconde en phases, et dis lesquelles sont des allers-retours et quelle part revient au serveur.',
		hint: 'Chaque valeur compte depuis le départ : soustrais la précédente. Divise ensuite chaque phase par 339 ms.',
		answer: [
			'DNS : 0,7 ms, une réponse en cache. TCP : 338,5 moins 0,7 = 338 ms, un aller-retour.',
			'TLS : 680,3 moins 338,5 = 342 ms, un aller-retour. Ça colle avec TLS 1.3, que `curl -v` a confirmé.',
			'Premier octet : 1054,8 moins 680,4 = 374 ms. L’aller-retour de la requête fait 339 ms, donc le serveur a travaillé environ 35 ms.',
			'Téléchargement : 1054,808 moins 1054,753 = 0,055 ms. 3 allers-retours de 339 ms font 1 017 ms sur 1 055 : 96 % de la requête se passe à attendre le chemin. Un serveur plus proche, ou une connexion réutilisée qui évite TCP et TLS, ferait gagner le plus.'
		],
		steps: [
			{
				title: 'Connais les timers',
				questions: [
					{ q: 'Que mesure chaque timer de `curl -w` ?', options: ['La durée de sa propre phase seulement', 'Le temps depuis le timer précédent', 'Le temps du départ à cette étape', 'Le temps de traitement du serveur'], answer: 2, why: 'curl note chaque timer comme le temps écoulé depuis le début de la requête. Chaque valeur contient donc toutes les étapes d’avant.' },
					{ q: 'Comment obtiens-tu la durée d’une phase ?', options: ['Soustrais le timer d’avant', 'Lis le timer tel quel', 'Divise par le RTT', 'Soustrais-le de `total`'], answer: 0, why: 'Une phase est l’écart entre deux timers, comme `time_connect - time_namelookup` pour la poignée de main TCP.' },
					{ q: 'Quel timer marque la fin de la poignée de main TLS ?', options: ['`connect`', '`pretransfer`', '`starttransfer`', '`appconnect`'], answer: 3, why: '`time_appconnect` marque la fin de la poignée de main TLS. `connect`, c’est la poignée de main TCP.' },
					{ q: 'Que contient `starttransfer` ?', options: ['Seulement le travail du serveur', 'Tout jusqu’au premier octet', 'Seulement le téléchargement du corps', 'Seulement DNS et TCP'], answer: 1, why: 'C’est le temps jusqu’à l’arrivée du premier octet de la réponse, compté depuis le départ.' }
				]
			},
			{
				title: 'Découpe DNS et TCP',
				questions: [
					{ q: 'Combien de temps a pris le DNS ?', options: ['339 ms', '0,7 ms', '7 ms', '338 ms'], answer: 1, why: '`namelookup=0.000699`, c’est 0,7 ms.' },
					{ q: 'Pourquoi si peu ?', options: ['La réponse venait d’un cache', 'La machine n’a pas de nom DNS', 'Le DNS passe après TCP', 'curl saute le DNS en HTTPS'], answer: 0, why: 'Moins de 1 ms, c’est trop rapide pour un aller-retour réseau. Le chapitre a vu la même chose lors d’un second lancement vers ftp.jaist.ac.jp.' },
					{ q: 'Combien de temps a pris la poignée de main TCP ?', options: ['338,5 ms, la valeur de `connect`', '680 ms', '338 ms, `connect` moins `namelookup`', '0,7 ms'], answer: 2, why: '338,539 moins 0,699 font environ 338 ms.' },
					{ q: 'Combien d’allers-retours de 339 ms cela fait-il ?', options: ['La moitié d’un', 'Deux', 'Trois', 'Un'], answer: 3, why: 'Le SYN part, le SYN-ACK revient : un aller-retour, et rien d’autre.' }
				]
			},
			{
				title: 'Découpe TLS et le premier octet',
				questions: [
					{ q: 'Combien de temps a pris TLS ?', options: ['342 ms', '680 ms', '374 ms', '35 ms'], answer: 0, why: '680,307 moins 338,539 font environ 342 ms.' },
					{ q: 'Pourquoi un seul aller-retour pour TLS est-il plausible ici ?', options: ['TLS prend toujours un aller-retour', 'Ça colle avec TLS 1.3, que `curl -v` a confirmé', 'Le certificat était en cache', 'TLS tourne en même temps que TCP'], answer: 1, why: 'Sur cette machine, la phase TLS 1.3 a pris un aller-retour. Vers ftp.jaist.ac.jp, la même phase en a pris environ deux.' },
					{ q: 'Quelle soustraction donne la phase de la requête ?', options: ['`appconnect - connect`', '`total - starttransfer`', '`starttransfer - pretransfer` : 374 ms', '`starttransfer - connect`'], answer: 2, why: '1054,753 moins 680,390 font environ 374 ms, de la requête prête au premier octet.' },
					{ q: 'Quelle part revient au travail du serveur ?', options: ['Les 374 ms', 'Rien : tout est réseau', 'Environ 339 ms', 'Environ 35 ms'], answer: 3, why: 'Un aller-retour porte la requête et la réponse : 339 ms. Les 35 ms qui restent, c’est le serveur.' }
				]
			},
			{
				title: 'Dis où passe le temps',
				questions: [
					{ q: 'Combien de temps a pris le téléchargement du corps ?', options: ['Environ 0,055 ms', 'Environ 55 ms', 'Environ 374 ms', 'Environ 1 s'], answer: 0, why: '`total` moins `starttransfer`, c’est 1054,808 moins 1054,753 : 0,055 ms.' },
					{ q: 'Combien d’allers-retours la requête contient-elle, et combien pèsent-ils ensemble ?', options: ['2, environ 680 ms', '3, environ 1 017 ms', '4, environ 1 356 ms', '1, environ 339 ms'], answer: 1, why: 'TCP, TLS et la requête coûtent chacun un aller-retour de 339 ms.' },
					{ q: 'Quelle part des 1,05 s passe à attendre le chemin ?', options: ['Environ 35 %', 'Environ 50 %', 'Environ 96 %', 'Environ 3 %'], answer: 2, why: '1 017 ms sur 1 055 ms, c’est environ 96 %. Le serveur et le DNS sont la petite part.' },
					{ q: 'Qu’est-ce qui ferait gagner le plus de temps ?', options: ['Un CPU serveur plus rapide', 'Un plus gros cache DNS', 'Une page d’accueil plus légère', 'Moins d’allers-retours, ou des plus courts'], answer: 3, why: 'Le coût, ce sont les allers-retours. En faire moins, ou des plus courts, est le seul vrai gain.' }
				]
			}
		]
	},
	quiz: [
		{
			q: '`curl -w` affiche `time_namelookup=0.20 time_connect=0.25 time_appconnect=0.31`. Combien de temps a pris la poignée de main TCP ?',
			options: [
				'0,25 seconde, la valeur de `time_connect`',
				'0,05 seconde, `time_connect` moins `time_namelookup`',
				'0,31 seconde, car TLS inclut la poignée de main',
				'0,45 seconde, la résolution plus la connexion'
			],
			answer: 1,
			why: 'Chaque timer de write-out compte depuis le début du transfert : `time_connect` contient donc les 0,20 s de DNS. curl note chaque timer comme le temps écoulé depuis le début de la requête, et une phase est l’écart entre deux timers.'
		},
		{
			q: 'mtr affiche `???` avec 100 % de perte aux hops 4 à 9, et 0 % de perte à la destination, au hop 10. Qu’est-ce que ça t’apprend ?',
			options: [
				'Les paquets se perdent au hop 4, et le hop 10 répond depuis un cache',
				'Les hops 4 à 9 transmettent les sondes sans envoyer leur propre réponse',
				'Le chemin change à chaque sonde, donc les hops 4 à 9 sont aléatoires',
				'La destination est injoignable et mtr a deviné son RTT'
			],
			answer: 1,
			why: 'Une sonde qui atteint le hop 10 est passée par les hops 4 à 9. Une perte qui s’arrête avant le dernier hop veut dire que ces routeurs sautent ou retardent leurs propres réponses à mtr. Les sondes qui les traversent arrivent quand même.'
		},
		{
			q: 'Une requête prend 1,3 s. `ping` donne 256 ms, et `time_starttransfer` moins `time_pretransfer` vaut 270 ms. Où passe le temps ?',
			options: [
				'Le serveur est lent : il passe 270 ms à calculer la page',
				'Le corps de la réponse est gros et prend presque toute la 1,3 s',
				'Surtout en allers-retours : le serveur ajoute environ 14 ms à un RTT',
				'Le CPU du client est lent à parser la réponse'
			],
			answer: 2,
			why: 'Le temps entre la requête et le premier octet contient un aller-retour pour la requête et la réponse. 270 moins 256 laisse environ 14 ms de travail serveur, et le reste de la 1,3 s part en DNS et en allers-retours TCP et TLS.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Ajouter un délai connu entre deux conteneurs, puis le retrouver dans les timers de `curl -w` sous forme d’allers-retours.',
		steps: [
			'Crée un réseau, un serveur et un client : `docker network create latlab`, `docker run -d --name lat-srv --network latlab nicolaka/netshoot:v0.13 python3 -m http.server 8080` et `docker run -d --name lat-cli --network latlab --cap-add NET_ADMIN nicolaka/netshoot:v0.13 sleep 3600`.',
			'Mesure une requête sans délai : `docker exec lat-cli curl -s -o /dev/null -w \'dns=%{time_namelookup} connect=%{time_connect} appconnect=%{time_appconnect} pretransfer=%{time_pretransfer} starttransfer=%{time_starttransfer} total=%{time_total}\\n\' http://lat-srv:8080/`.',
			'Ajoute 100 ms à chaque paquet que le client envoie : `docker exec lat-cli tc qdisc add dev eth0 root netem delay 100ms`. Vérifie avec `docker exec lat-cli ping -c 3 lat-srv`, puis relance le même `curl`.',
			'Ajoute TLS sur le serveur : `docker exec lat-srv sh -c \'cd /tmp && openssl req -x509 -newkey rsa:2048 -nodes -keyout k.pem -out c.pem -subj /CN=lat-srv -days 1\'`, puis `docker exec -d lat-srv sh -c \'cd /tmp && openssl s_server -accept 8443 -cert c.pem -key k.pem -www\'`.',
			'Lance le même `curl` avec `-k` vers `https://lat-srv:8443/`, puis une fois de plus en ajoutant `--tls-max 1.2`. Nettoie avec `docker rm -f lat-srv lat-cli && docker network rm latlab`.'
		],
		done: [
			'Sans délai, chaque timer reste sous 20 ms environ.',
			'Avec le délai, `ping` montre environ 100 ms, `connect` moins `dns` vaut environ 100 ms, et `starttransfer` moins `pretransfer` environ 100 ms.',
			'En HTTPS avec TLS 1.3, `appconnect` moins `connect` vaut environ 100 ms : un aller-retour.',
			'Avec `--tls-max 1.2`, la même phase vaut environ 200 ms : deux allers-retours.'
		],
		solution: [
			'`netem` retarde les paquets qui sortent par le `eth0` du client : chaque paire requête et réponse coûte 100 ms de plus. C’est un faux RTT que tu retrouves dans chaque phase.',
			'Le DNS reste rapide : le résolveur Docker du conteneur répond sur 127.0.0.11, une adresse de loopback, donc la requête ne sort jamais par le `eth0` retardé.',
			'Le lancement en TLS 1.2 coûte un aller-retour de plus que TLS 1.3. Sur un chemin de 339 ms comme celui de l’exercice, c’est un tiers de seconde par nouvelle connexion.'
		]
	},
	recall: {
		q: 'Quels timers de `curl -w` marquent la fin du DNS, de TCP, de TLS et du premier octet, et comment obtiens-tu la durée d’une phase ?',
		a: '`time_namelookup`, `time_connect`, `time_appconnect` et `time_starttransfer`. Chacun compte depuis le départ : soustrais le timer précédent. `time_connect - time_namelookup` donne la poignée de main TCP.'
	},
	sources: [
		{ title: 'Doc de curl, --write-out (docs/cmdline-opts/write-out.md)', url: `${CURL}/docs/cmdline-opts/write-out.md` },
		{ title: 'Source de curl, lib/progress.c', url: `${CURL}/lib/progress.c` },
		{ title: 'Source de la page de man mtr(8)', url: MTR },
		{ title: 'Page de man de curl, curl.se, lue le 2026-10-17', url: 'https://curl.se/docs/manpage.html' }
	]
};
