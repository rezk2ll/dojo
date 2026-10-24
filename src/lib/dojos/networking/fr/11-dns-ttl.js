const COREDNS = 'https://github.com/coredns/coredns/blob/d116ecb98cebc576576a93766ab4c155ecdbe31d';
const CACHE = `${COREDNS}/plugin/cache/cache.go`;
const TTLGO = `${COREDNS}/plugin/pkg/dnsutil/ttl.go`;
const README = `${COREDNS}/plugin/cache/README.md`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'dns-ttl',
	part: 'Noms et adresses',
	title: 'TTL et cache DNS',
	minutes: 10,
	hook: [
		'Le 30 septembre 2021, Slack publie un enregistrement DS pour slack.com dans la zone `.com` afin d’activer DNSSEC. Derrière certains résolveurs, des utilisateurs voient `ERR_NAME_NOT_RESOLVED`. L’équipe retire le DS chez le registrar. Une heure plus tard, rien n’a bougé : "After nearly an hour, there were no signs of improvement".',
		'L’équipe pensait que le DS n’était jamais mis en cache. Le postmortem de Slack : "The \'.com.\' zone will ask resolvers to cache the slack.com DS record for 24h by default". Google Public DNS le limitait à 6 heures. Quand Slack a ensuite coupé la signature, les résolveurs qui validaient et gardaient encore le DS ont répondu `SERVFAIL` pour tous les noms de slack.com.',
		'La panne a touché moins de 1 % des utilisateurs pendant 24 heures. Elle s’est terminée quand les opérateurs de résolveurs ont vidé leur cache à la demande de Slack, et quand **le TTL de 24 heures du DS a expiré**.'
	],
	terms: [
		{ term: 'TTL', def: 'Time to live : un nombre de secondes présent dans chaque enregistrement DNS. La RFC 1035 le définit comme l’intervalle "that the resource record may be cached before it should be discarded" (la durée de mise en cache autorisée).' },
		{ term: 'Résolveur récursif', def: 'Le serveur auquel ta machine pose ses questions (celui de ton FAI, `1.1.1.1`, CoreDNS dans un cluster). Il interroge les serveurs faisant autorité et garde chaque réponse en cache pendant le TTL.' },
		{ term: 'Cache négatif', def: 'La mise en cache d’une réponse qui dit qu’un nom n’existe pas (`NXDOMAIN`) ou n’a aucun enregistrement du type demandé (`NODATA`). La question identique suivante reçoit la réponse depuis le cache.' },
		{ term: 'SOA MINIMUM', def: 'Le dernier nombre de l’enregistrement SOA d’une zone. Depuis la RFC 2308, il plafonne la durée de cache d’une réponse négative venant de cette zone.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['client["Portable : A example.com ?"] --> res["Résolveur récursif"]', 'res -->|"absent du cache"| auth["Serveur faisant autorité"]', 'auth -->|"example.com 300 IN A"| res'],
				highlight: ['res', 'auth'],
				note: 'Le résolveur n’a rien en cache, il interroge donc le serveur faisant autorité. La réponse porte un TTL de 300 secondes, choisi par la personne qui gère la zone. J’ai lancé cette requête vers `hera.ns.cloudflare.com` pendant cette session et obtenu 300.'
			},
			{
				add: ['res --> cache[("Cache : example.com A, stocké il y a 182 s")]', 'cache -->|"example.com 118 IN A"| client2["Deuxième portable"]'],
				highlight: ['cache', 'client2'],
				note: 'Le résolveur garde la réponse et sert les clients suivants depuis son cache, en retirant le temps déjà écoulé. La même requête vers `1.1.1.1` a renvoyé un TTL de 118 : cette copie était en cache depuis 182 secondes et sera jetée dans 118 secondes.'
			},
			{
				add: ['admin["Tu modifies l’enregistrement A"] --> auth', 'cache -.->|"ancienne adresse jusqu’à TTL 0"| client2'],
				highlight: ['admin', 'cache'],
				note: 'Le serveur faisant autorité a la nouvelle adresse tout de suite. Le résolveur ne repose la question qu’à l’expiration de sa copie : ses clients gardent l’ancienne adresse jusqu’à 300 secondes. Avec un TTL de 86400, le pire cas dure une journée.'
			},
			{
				add: ['client3["Portable : A new.example.com ?"] --> res', 'auth -->|"NXDOMAIN + SOA ... 1800"| ncache[("Cache négatif")]'],
				highlight: ['ncache'],
				note: 'Un nom qui n’existe pas encore revient en `NXDOMAIN`, avec le SOA de la zone dans la section authority. La RFC 2308 prend comme TTL négatif le plus petit entre le TTL du SOA et son champ MINIMUM. Pour `example.com`, les deux valent 1800 : la réponse « ce nom n’existe pas » reste 30 minutes en cache.'
			},
			{
				add: ['lower["2 jours avant : TTL 86400 vers 300"] --> admin'],
				highlight: ['lower'],
				note: 'RFC 1034 : "If a change can be anticipated, the TTL can be reduced prior to the change to minimize inconsistency during the change". Baisse le TTL au moins un ancien TTL à l’avance : les copies prises avec 86400 vivent une journée. Après le changement, remonte-le.'
			}
		]
	},
	example: {
		title: 'CoreDNS plugin/cache/cache.go : combien de temps chaque réponse reste en cache',
		repo: 'coredns/coredns',
		url: `${CACHE}#L330-L616`,
		lang: 'go',
		code: `func computeTTL(msgTTL, minTTL, maxTTL time.Duration) time.Duration {
	ttl := min(max(msgTTL, minTTL), maxTTL)
	return ttl
}
…
	var duration time.Duration
	switch mt {
	case response.NameError, response.NoData:
		msgTTL := dnsutil.MinimalTTLWithMaximum(res, mt, w.nttl)
		duration = computeTTL(msgTTL, w.minnttl, w.nttl)
	case response.ServerError:
		duration = w.failttl
	default:
		msgTTL := dnsutil.MinimalTTLWithMaximum(res, mt, w.pttl)
		duration = computeTTL(msgTTL, w.minpttl, w.pttl)
	}

	// Apply capped TTL to this reply to avoid jarring TTL experience 1799 -> 8 (e.g.)
	ttl := uint32(duration.Seconds())
	res.Answer = filterRRSlice(res.Answer, ttl, false)
	res.Ns = filterRRSlice(res.Ns, ttl, false)
…
const (
	maxTTL  = dnsutil.MaximumDefaultTTL
	minTTL  = dnsutil.MinimalDefaultTTL
	maxNTTL = dnsutil.MaximumDefaultTTL / 2
	minNTTL = dnsutil.MinimalDefaultTTL`,
		notes: [
			'La ligne 2 coince le TTL de la réponse entre un plancher et un plafond. Un enregistrement avec un TTL de 30 reste 30 secondes. Le README précise que le plafond "does not extend it" : il ne rallonge jamais un TTL.',
			'Les lignes 8 à 10 traitent `NXDOMAIN` et `NODATA`, les réponses négatives, avec leur propre plafond `w.nttl`. Sa valeur par défaut est `maxNTTL` à la ligne 26, la moitié de `MaximumDefaultTTL`, que [ttl.go](' + TTLGO + '#L53-L57) fixe à 1 heure. Une réponse négative reste donc 30 minutes au plus, une positive 1 heure.',
			'`MinimalTTLWithMaximum`, aux lignes 9 et 14, retient le plus petit TTL de tous les enregistrements de la réponse. Dans une réponse négative, le seul enregistrement est le SOA de la section authority : c’est son TTL qui compte.',
			'Les lignes 11 et 12 gardent un `SERVFAIL` pendant `w.failttl`. Le README donne la valeur par défaut : "SERVFAIL responses will be cached for 5 seconds".',
			'Les lignes 19 à 21 écrivent le TTL plafonné dans la réponse elle-même. Avec `cache 8`, un enregistrement de TTL 1799 arrive au client avec 8 dès la première requête, ce que le commentaire de la ligne 18 appelle éviter un "jarring TTL experience".'
		]
	},
	tradeoff: {
		gain: [
			'Avec un TTL long, les résolveurs répondent depuis leur cache sans interroger le serveur faisant autorité. La RFC 1034 recommande des TTL "on the order of days for the typical host".',
			'Le cache négatif évite qu’un résolveur redemande un nom absent : `.com` répond `NXDOMAIN` avec un SOA de TTL 900, et l’absence est gardée 15 minutes.'
		],
		cost: [
			'Un client ne voit un changement qu’à l’expiration de la copie de son résolveur. Avec un TTL de 86400, certains utilisateurs voient l’ancien enregistrement jusqu’à 24 heures.',
			'Tu ne peux pas raccourcir un TTL déjà en cache chez les résolveurs. Le DS de Slack a gardé ses 24 heures parce que la zone `.com` les fixait, et seuls les vidages faits par chaque opérateur les ont écourtées.',
			'Un nom interrogé juste avant sa création reste en `NXDOMAIN` pendant le TTL négatif : 30 minutes pour une zone dont le TTL du SOA et le MINIMUM valent 1800.'
		]
	},
	task: {
		prompt: 'À 09:58, un script de déploiement interroge `api.shop.example` avant que l’enregistrement existe, via CoreDNS avec les réglages `cache` par défaut. La section authority contient `shop.example. 3600 IN SOA ns1.shop.example. admin.shop.example. 2026101701 7200 900 1209600 86400`. Tu crées l’enregistrement A à 10:00 avec un TTL de 300. Quand le script le voit-il ? Ensuite : tu déplaces `api.shop.example` vers un nouveau serveur demain à 14:00, et son TTL vaut 86400 aujourd’hui. Que changes-tu, et quand ?',
		hint: 'TTL négatif : le plus petit entre le TTL du SOA (deuxième champ) et MINIMUM (dernier champ). Applique ensuite le plafond de CoreDNS pour les réponses négatives.',
		answer: [
			'RFC 2308 : min(3600, 86400) = 3600 secondes. CoreDNS plafonne les réponses négatives à `maxNTTL`, 30 minutes. CoreDNS garde le `NXDOMAIN` de 09:58 à 10:28 : le script voit l’enregistrement à 10:28, 28 minutes après sa création.',
			'Pour le déplacement : passe le TTL de 86400 à 300 aujourd’hui avant 14:00, au moins 24 heures avant. Un résolveur qui a pris l’enregistrement juste avant ta baisse le garde 86400 secondes, donc sa copie a disparu demain à 14:00.',
			'À 14:00, change l’adresse. Chaque copie en cache a désormais 300 secondes au plus à vivre : les clients atteignent le nouveau serveur avant 14:05. Remets le TTL à 86400 quand le nouveau serveur est stable.'
		],
		steps: [
			{
				title: 'Lis le SOA',
				questions: [
					{ q: 'Dans `shop.example. 3600 IN SOA ns1 admin 2026101701 7200 900 1209600 86400`, quel champ est le TTL du SOA lui-même ?', options: ['2026101701', '7200', '3600', '86400'], answer: 2, why: 'Le TTL suit le nom du propriétaire, comme dans tout enregistrement. `2026101701` est le serial.' },
					{ q: 'Quel champ est MINIMUM ?', options: ['Le dernier, 86400', 'Le premier nombre après les noms, 2026101701', 'Le troisième nombre, 900', 'Le quatrième nombre, 1209600'], answer: 0, why: 'MINIMUM est le dernier nombre du SOA. Depuis la RFC 2308, il plafonne la durée de cache d’une réponse négative.' },
					{ q: 'Quel TTL la RFC 2308 donne-t-elle à ce `NXDOMAIN` ?', options: ['86400, le champ MINIMUM', '3600, le plus petit entre TTL et MINIMUM', '900, le champ retry', '7200, le champ refresh'], answer: 1, why: 'Le TTL négatif est le plus petit entre le TTL du SOA et son champ MINIMUM : min(3600, 86400) = 3600.' },
					{ q: 'À quoi servent les champs refresh, retry et expire ?', options: ['Ils plafonnent les réponses positives en cache', 'Ils fixent combien de temps un client attend', 'Ils disent aux serveurs secondaires comment copier la zone', 'Ils remplacent MINIMUM quand il manque'], answer: 2, why: 'Refresh, retry et expire disent aux serveurs secondaires comment tenir leur copie de la zone. Ils ne jouent aucun rôle dans le cache négatif.' }
				]
			},
			{
				title: 'Applique le plafond de CoreDNS',
				questions: [
					{ q: 'Combien de temps CoreDNS garde-t-il au plus une réponse négative avec les réglages `cache` par défaut ?', options: ['1 heure, `MaximumDefaultTTL`', '5 secondes, comme un `SERVFAIL`', '24 heures, comme le DS de `.com`', '30 minutes, `maxNTTL`'], answer: 3, why: '`maxNTTL` vaut la moitié de `MaximumDefaultTTL`, qui fait 1 heure : les réponses négatives restent 30 minutes au plus.' },
					{ q: 'Le SOA autorise 3600 secondes et CoreDNS plafonne à 1800. Combien de temps le `NXDOMAIN` est-il gardé ?', options: ['3600 secondes', '1800 secondes', '5400 secondes', '86400 secondes'], answer: 1, why: 'La ligne 2 de `computeTTL` borne le TTL sous le plafond : 3600 devient 1800.' },
					{ q: 'Le `NXDOMAIN` est entré en cache à 09:58. Quand le script voit-il l’enregistrement A pour la première fois ?', options: ['10:00, quand tu le crées', '10:05, après le TTL de 300 de l’enregistrement', '10:28, quand la copie négative expire', '10:58, après le TTL du SOA de 3600'], answer: 2, why: 'CoreDNS répond depuis son cache négatif jusqu’à 09:58 plus 30 minutes : la première vraie requête part à 10:28.' },
					{ q: 'Pourquoi le TTL de 300 du nouvel enregistrement A n’aide-t-il pas ici ?', options: ['CoreDNS ignore les TTL sous 1800', 'L’enregistrement doit d’abord atteindre chaque secondaire', 'Les TTL ne s’appliquent qu’au-delà de 3600 secondes', 'Le cache tient la réponse « ce nom n’existe pas », pas l’enregistrement'], answer: 3, why: 'Ce qui est en cache, c’est le `NXDOMAIN` avec son propre TTL. Le TTL du nouvel enregistrement ne compte qu’une fois qu’un résolveur le récupère.' }
				]
			},
			{
				title: 'Prépare le changement de TTL',
				questions: [
					{ q: 'Le déplacement a lieu demain à 14:00 et le TTL vaut 86400. Que changes-tu d’abord ?', options: ['Baisser le TTL à 300, au moins 24 heures avant', 'Changer l’adresse maintenant, pour laisser du temps aux caches', 'Monter le TTL, pour que les caches gardent l’enregistrement', 'Demander aux opérateurs de résolveurs de vider à 14:00'], answer: 0, why: 'RFC 1034 : si un changement est prévisible, baisse le TTL avant. Les copies prises avec 86400 vivent une journée, donc baisse-le une journée entière avant.' },
					{ q: 'Un résolveur a pris l’enregistrement une seconde avant ta baisse de TTL. Combien de temps garde-t-il cette copie ?', options: ['300 secondes, le nouveau TTL', '86400 secondes, le TTL qu’il a reçu', 'Jusqu’au changement de serial de la zone', '1800 secondes, le plafond de CoreDNS'], answer: 1, why: 'Tu ne peux pas raccourcir un TTL déjà en cache chez les résolveurs. Cette copie vit ses 86400 secondes.' },
					{ q: 'Tu baisses le TTL aujourd’hui à 15:00 au lieu d’avant 14:00. Que se passe-t-il demain à 14:00 ?', options: ['Rien ne change : 300 secondes, c’est court', 'La zone refuse le changement jusqu’à 15:00', 'Des copies prises juste avant 15:00 aujourd’hui gardent l’ancienne adresse', 'Tous les résolveurs vident leur cache à minuit'], answer: 2, why: 'Une copie prise à 14:59 aujourd’hui garde le TTL de 86400 jusqu’à 14:59 demain, après le déplacement.' },
					{ q: 'Pourquoi ne pas garder le TTL à 300 pour toujours ?', options: ['Un TTL de 300 casse le cache négatif', 'La RFC 1035 interdit les TTL sous une heure', 'Les TTL courts font ignorer l’enregistrement', 'Un TTL long laisse les résolveurs répondre depuis leur cache'], answer: 3, why: 'La RFC 1034 dit que les TTL "should be on the order of days for the typical host". Un TTL long évite des requêtes au serveur faisant autorité.' }
				]
			},
			{
				title: 'Fais le déplacement',
				questions: [
					{ q: 'Demain à 14:00, tu changes l’adresse. Pendant combien de temps un client peut-il encore recevoir l’ancienne ?', options: ['Jusqu’à 300 secondes', 'Jusqu’à 86400 secondes', 'Jusqu’à 1800 secondes', 'Pas du tout'], answer: 0, why: 'Chaque copie en cache a désormais 300 secondes au plus à vivre : les clients atteignent le nouveau serveur avant 14:05.' },
					{ q: 'Pourquoi garder l’ancien serveur allumé jusque vers 14:05 ?', options: ['Les secondaires en ont besoin pour copier la zone', 'Des clients gardent l’ancienne adresse jusqu’à 300 s', 'Le nouveau serveur en a besoin pour chauffer son cache', 'CoreDNS teste l’ancienne adresse avant la nouvelle'], answer: 1, why: 'Tant que la dernière copie de 300 secondes n’a pas expiré, des clients se connectent encore à l’ancienne adresse.' },
					{ q: 'Quand remets-tu le TTL à 86400 ?', options: ['À 14:00, en même temps que l’adresse', 'Jamais : une fois baissé, il doit rester bas', 'Quand le nouveau serveur est stable', 'Avant le déplacement, pour protéger l’ancienne adresse'], answer: 2, why: 'Remonte-le après le changement, une fois sûr de ne pas devoir revenir en arrière vite.' },
					{ q: 'Un collègue change l’adresse avec un TTL toujours à 86400. Quel est le pire cas ?', options: ['Cinq minutes de réponses mélangées', 'Trente minutes, le plafond de CoreDNS', 'Une minute, le temps de recharger la zone', 'Des utilisateurs voient l’ancienne adresse une journée entière'], answer: 3, why: 'Avec un TTL de 86400, une copie prise juste avant le changement vit 24 heures.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Un enregistrement A a un TTL de 86400. Tu changes l’adresse à 10:00. À partir de quand chaque résolveur qui respecte les TTL a-t-il la nouvelle adresse ?',
			options: [
				'À 10:00, puisque le serveur faisant autorité donne la nouvelle adresse',
				'Vers 10:05, le temps qu’un résolveur remarque le nouveau serial de zone',
				'Le lendemain à 10:00, quand expire une copie prise à 09:59',
				'Jamais, les résolveurs gardent tout jusqu’à ce qu’on vide leur cache'
			],
			answer: 2,
			why: 'Un résolveur ne réinterroge le serveur faisant autorité que quand le TTL de sa copie atteint 0. Une copie prise une minute avant le changement vit 86400 secondes : les dernières réponses périmées expirent environ 24 heures après.'
		},
		{
			q: 'Le SOA d’une zone est `example.org. 3600 IN SOA ns1 host 2026101701 7200 900 1209600 300`. Combien de temps un résolveur peut-il garder un `NXDOMAIN` de cette zone ?',
			options: ['3600 secondes, le TTL porté par le SOA lui-même', '300 secondes, le plus petit entre TTL et MINIMUM', '900 secondes, la valeur du champ retry du SOA', '1209600 secondes, la valeur du champ expire'],
			answer: 1,
			why: 'RFC 2308, section 5 : le TTL de la réponse négative "is taken from the minimum of the SOA.MINIMUM field and SOA\'s TTL". Ici, min(3600, 300) = 300. Refresh, retry et expire servent aux serveurs secondaires qui copient la zone.'
		},
		{
			q: 'Slack a retiré son DS de la zone `.com`, mais les résolveurs qui validaient ont échoué pendant des heures. Pourquoi ?',
			options: [
				'Le registrar met 24 heures à publier un changement dans `.com`',
				'Les résolveurs avaient le DS en cache, et `.com` le sert avec un TTL de 24 h',
				'La zone de Slack servait encore le DS avec un TTL long',
				'Le résultat d’une validation DNSSEC n’est jamais en cache, chaque requête échouait'
			],
			answer: 1,
			why: 'Le DS vit dans la zone parente, et `.com` lui donne un TTL de 86400 que le propriétaire du domaine ne peut pas changer. Les résolveurs qui l’avaient récupéré ont continué à valider slack.com jusqu’à l’expiration de leur copie ou un vidage par leur opérateur.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Voir un cache CoreDNS garder un `NXDOMAIN` alors que l’enregistrement existe.',
		steps: [
			'Crée un dossier : `mkdir -p ~/dns-lab && cd ~/dns-lab`. Crée `db.shop.example` avec ces lignes : `$ORIGIN shop.example.`, `@ 120 IN SOA ns1.shop.example. admin.shop.example. 1 7200 900 1209600 120`, `@ 300 IN NS ns1.shop.example.`, `ns1 300 IN A 127.0.0.1`, `www 300 IN A 192.0.2.10`.',
			'Crée `Corefile` avec une ligne chacun : `shop.example:1053 {`, `file /lab/db.shop.example {`, `reload 5s`, `}`, `}`, `.:53 {`, `cache`, `forward . 127.0.0.1:1053`, `}`. Le premier bloc est le serveur faisant autorité, le second un résolveur avec cache devant lui.',
			'Lance-le : `docker run -d --rm --name dnslab -p 127.0.0.1:8053:53/udp -p 127.0.0.1:8054:1053/udp -v "$PWD":/lab coredns/coredns:1.11.3 -conf /lab/Corefile`. Le port 8053 est le cache, le 8054 le serveur faisant autorité.',
			'Interroge le cache deux fois à quelques secondes d’écart : `dig @127.0.0.1 -p 8053 www.shop.example +noall +answer`. Regarde le TTL baisser.',
			'Demande un nom qui n’existe pas encore : `dig @127.0.0.1 -p 8053 api.shop.example +noall +comments +authority`. Puis modifie `db.shop.example` : passe le serial de `1` à `2` et ajoute `api 300 IN A 192.0.2.20`. Attends 10 secondes et interroge les deux ports.'
		],
		done: [
			'La deuxième requête `www` montre un TTL inférieur à 300.',
			'`dig @127.0.0.1 -p 8054 api.shop.example +short` affiche `192.0.2.20`, alors que la même requête sur le port 8053 dit encore `NXDOMAIN` avec un TTL de SOA qui décompte.',
			'Environ deux minutes après la première requête `api`, le port 8053 renvoie aussi `192.0.2.20`.'
		],
		solution: [
			'Le serveur faisant autorité a l’enregistrement dès qu’il recharge la zone. Le cache ne repose pas la question avant l’expiration de sa copie négative.',
			'Cette copie vit le TTL du SOA de la section authority, ici 120 secondes. Avec `3600` à cet endroit, CoreDNS le plafonnerait à 1800.',
			'Arrête le lab avec `docker stop dnslab`.'
		]
	},
	recall: {
		q: 'Qu’est-ce qui fixe la durée de cache d’un `NXDOMAIN`, et combien de temps CoreDNS en garde-t-il un au plus par défaut ?',
		a: 'Le SOA de la section authority : le plus petit entre son TTL et son champ MINIMUM (RFC 2308). CoreDNS plafonne les réponses négatives à 30 minutes, la moitié de son maximum par défaut de 1 heure.'
	},
	sources: [
		{ title: 'Slack Engineering, What happened during Slack\'s DNSSEC rollout?', url: 'https://slack.engineering/what-happened-during-slacks-dnssec-rollout/' },
		{ title: 'RFC 2308, Negative Caching of DNS Queries (DNS NCACHE)', url: 'https://www.rfc-editor.org/rfc/rfc2308' },
		{ title: 'RFC 1034, Domain Names: Concepts and Facilities', url: 'https://www.rfc-editor.org/rfc/rfc1034' },
		{ title: 'RFC 1035, Domain Names: Implementation and Specification', url: 'https://www.rfc-editor.org/rfc/rfc1035' },
		{ title: 'README du plugin cache de CoreDNS', url: README }
	]
};
