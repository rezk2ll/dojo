const EXA = 'https://github.com/Exa-Networks/exabgp/blob/685f772e4ede5c818d2ff5c84f4ae040afd37be6';
const FB = 'https://engineering.fb.com/2021/10/05/networking-traffic/outage-details/';
const CF = 'https://blog.cloudflare.com/october-2021-facebook-outage/';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'bgp',
	part: 'Déboguer le réseau',
	title: 'BGP et anycast',
	minutes: 10,
	hook: [
		'Le 4 octobre 2021 à 15:51 UTC, des ingénieurs de Cloudflare ouvrent un incident interne intitulé "Facebook DNS lookup returning SERVFAIL". `dig @1.1.1.1 facebook.com` répond `status: SERVFAIL`. Ils soupçonnent d’abord leur propre résolveur.',
		'À 15:58 UTC, ils voient que Facebook n’annonce plus les routes vers ses préfixes DNS. Sur un route server public, `show ip bgp 129.134.30.0/23` affiche `% Network not in table`. facebook.com reste injoignable via 1.1.1.1 jusque vers 21:20 UTC.',
		'Le post de Facebook : "our DNS servers became unreachable even though they were still operational." **Les serveurs avaient retiré eux-mêmes leurs routes, comme prévu, en perdant le contact avec les data centers.**'
	],
	terms: [
		{ term: 'Autonomous system', def: 'Un réseau avec une seule politique de routage et un numéro, l’ASN. Facebook est l’AS32934, Cloudflare l’AS13335.' },
		{ term: 'Announcement', def: 'Un message BGP UPDATE qui dit à un pair qu’il peut joindre un préfixe en passant par l’émetteur, avec un AS_PATH qui liste les AS traversés par la route.' },
		{ term: 'Withdrawal', def: 'La partie Withdrawn Routes d’un UPDATE. Elle dit aux pairs que le préfixe n’est plus joignable via l’émetteur, et ils relaient l’information.' },
		{ term: 'Anycast', def: 'RFC 4786 : "making a particular Service Address available in multiple, discrete, autonomous locations". Chaque routeur envoie les paquets pour cette adresse vers le site que ses routes BGP choisissent.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['edge["Sites edge de Facebook, AS32934"] -->|"UPDATE : préfixes de Facebook"| t6453["AS6453"]', 't6453 -->|"AS_PATH 6453 32934"| t3303["AS3303"]', 't3303 -->|"AS_PATH 3303 6453 32934"| rv["route-views"]'],
				highlight: ['edge', 'rv'],
				note: 'Chaque AS qui passe la route à un pair externe ajoute son propre numéro à l’AS_PATH. Le post de Cloudflare montre route-views avec le 129.134.0.0/17 de Facebook et le chemin `3303 6453 32934`, à lire de droite à gauche : Facebook, puis AS6453, puis AS3303.'
			},
			{
				add: ['res["Résolveurs, comme 1.1.1.1"] -->|"requête vers a.ns.facebook.com, 129.134.30.12"| t3303'],
				highlight: ['res'],
				note: 'Les petits sites edge de Facebook répondent aux requêtes DNS depuis des adresses bien connues, annoncées en BGP. Le 2026-10-17, `dig a.ns.facebook.com` renvoie 129.134.30.12, dans 129.134.30.0/23. Les paquets d’un résolveur suivent la route que son réseau a choisie. Entre routes de même préférence, la RFC 4271 garde celle dont l’AS_PATH contient le moins de numéros d’AS.'
			},
			{
				add: ['bb["Backbone entre data centers : tous les liens coupés"] -.->|"les serveurs DNS ne joignent plus les data centers"| edge'],
				highlight: ['bb'],
				note: 'Une commande de maintenance "unintentionally took down all the connections in our backbone network". Les serveurs DNS de Facebook "disable those BGP advertisements if they themselves can not speak to our data centers". Tout le backbone était coupé : chaque site edge s’est déclaré en mauvaise santé.'
			},
			{
				add: ['edge -->|"UPDATE : retrait de 129.134.30.0/23"| t6453', 'rv -->|"% Network not in table"| gone["Plus aucune route vers les préfixes DNS"]'],
				highlight: ['gone'],
				note: 'Cloudflare a vu un pic de changements de routage de Facebook vers 15:40 UTC, avec des routes retirées. Une fois tous les sites retirés, les résolveurs "had no way to connect to their nameservers". Ils ont renvoyé SERVFAIL et ont reçu 30 fois plus de requêtes que d’habitude, parce que les apps et les gens réessayaient.'
			},
			{
				add: ['back["21:00 UTC : reprise de l’activité BGP, pic à 21:17"] -->|"nouvelle annonce"| t6453'],
				highlight: ['back'],
				note: 'Des ingénieurs se sont rendus sur place pour remettre le backbone en route. Cloudflare a revu de l’activité BGP de Facebook vers 21:00 UTC, avec un pic à 21:17. facebook.com se résolvait de nouveau via 1.1.1.1 vers 21:20 UTC.'
			}
		]
	},
	example: {
		title: 'src/exabgp/application/healthcheck.py dans ExaBGP : annoncer ou retirer la route d’un service',
		repo: 'Exa-Networks/exabgp',
		url: `${EXA}/src/exabgp/application/healthcheck.py#L123-L618`,
		lang: 'python',
		code: `    g.add_argument('--rise', metavar='N', default=3, type=int, help='check N times before considering the service up')
    g.add_argument('--fall', metavar='N', default=3, type=int, help='check N times before considering the service down')
…
    g.add_argument('--withdraw-on-down', action='store_true', help='Instead of increasing the metric on health failure, withdraw the route')
…
        for ip in options.ips:
            if options.withdraw_on_down or target is States.EXIT:
                action = 'announce' if target is States.UP else 'withdraw'
            else:
                action = 'announce'
            command = f'{prefix} {action}'
            announce = f'route {ip} next-hop {options.next_hop or "self"}'

            if action == 'announce':
                announce = f'{announce} med {metric}'
…
            metric += options.increase

            # Send and flush command
            logger.debug(f'exabgp: {command} {announce}')
            sys.stdout.write(f'{command} {announce}\\n')
            sys.stdout.flush()
…
        elif state == States.FALLING:
            if not successful:
                checks += 1
                if checks >= options.fall:
                    state = trigger(States.DOWN)`,
		notes: [
			'Les lignes 24 à 28 comptent les checks ratés, et la ligne 2 fixe le seuil à 3. Les checks tournent toutes les 5 secondes, puis toutes les secondes dès que l’état commence à baisser. Un service mort passe donc DOWN environ 2 à 7 secondes après sa dernière réponse, plus la durée des checks.',
			'Lignes 6 à 10 : sans `--withdraw-on-down` (ligne 4), la route n’est jamais retirée tant que le processus tourne. La ligne 7 la retire aussi quand le processus s’arrête, dans l’état `EXIT`.',
			'La ligne 15 fixe le MED. Par défaut, `--up-metric 100` et `--down-metric 1000` : un nœud malade continue d’annoncer avec un MED moins bon. La RFC 4271 ne compare le MED qu’entre routes "learned from the same neighboring AS". Si tous les nœuds sont DOWN, la route reste et le trafic arrive encore quelque part.',
			'Les lignes 20 à 22 écrivent sur stdout une ligne comme `peer * announce route <ip> next-hop self med 100`. ExaBGP la lit depuis le processus déclaré dans sa config et envoie l’UPDATE BGP à ses pairs.'
		]
	},
	tradeoff: {
		gain: [
			'En anycast, une adresse comme 129.134.30.12 est servie depuis beaucoup de sites, et chaque réseau envoie ses utilisateurs vers l’un d’eux en suivant sa propre route BGP.',
			'Retirer la route d’un site malade déplace son trafic vers les autres sites, sans aucun changement DNS.',
			'Chaque AS du chemin ajoute son numéro à l’AS_PATH : un routeur peut écarter une route qui contient déjà son propre AS et éviter une boucle.'
		],
		cost: [
			'Si tous les sites retirent leur route au même moment, l’adresse disparaît d’Internet. Pour facebook.com via 1.1.1.1, ça a duré de 15:50 à 21:20 UTC environ.',
			'La RFC 4786 prévient que "rapid advertisement/withdrawal oscillations can cause operational problems". Un health check qui oscille a besoin d’un délai avant de réannoncer la route.',
			'Une route leak, selon la RFC 7908, est "the propagation of routing announcement(s) beyond their intended scope". Les AS qui la reçoivent envoient alors le trafic par ce mauvais chemin.',
			'BGP ne remarque un pair muet qu’à l’expiration du Hold Time : la RFC 4271 suggère 90 secondes, avec un KEEPALIVE toutes les 30.'
		]
	},
	task: {
		prompt: 'Tu fais tourner un DNS anycast sur `192.0.2.53` dans 3 sites. Chaque site lance `python3 -m exabgp healthcheck --ip 192.0.2.53/32 --cmd "dig @127.0.0.1 example.com +time=1"`. Dis où va le trafic dans deux cas : (a) le démon DNS meurt sur le site 2 seulement, et (b) la base de données dont dépendent les 3 sites tombe, donc le check échoue partout. Recommence ensuite avec `--withdraw-on-down`.',
		hint: 'Sans l’option, un site DOWN continue d’annoncer avec un autre MED. Avec, il envoie un retrait. Liste ensuite les sites qui annoncent encore `192.0.2.53/32` dans chaque cas.',
		answer: [
			'Par défaut, cas (a) : après 3 checks ratés, le site 2 annonce `med 1000` et les sites 1 et 3 gardent `med 100`. Là où les routeurs comparent le MED, ce qui demande des routes venant du même AS voisin, ils choisissent le site 1 ou 3.',
			'Par défaut, cas (b) : les 3 sites annoncent `med 1000`. La route reste, et les requêtes arrivent encore sur des sites dont le check échoue. L’adresse reste joignable, et les réponses dépendent de ce que le démon sait encore servir.',
			'Avec `--withdraw-on-down`, cas (a) : le site 2 retire `192.0.2.53/32` et les routeurs envoient ses utilisateurs vers les sites 1 et 3, quel que soit leur AS voisin.',
			'Avec `--withdraw-on-down`, cas (b) : les 3 sites retirent la route et `192.0.2.53` n’a plus de route du tout, la panne de Facebook en octobre 2021. Les résolveurs tombent en timeout et répondent SERVFAIL.'
		],
		steps: [
			{
				title: 'Lis les défauts',
				questions: [
					{ q: 'Le démon DNS d’un site cesse de répondre. Au bout de combien de temps environ le healthcheck marque-t-il le site DOWN ?', options: ['Aussitôt, au premier check raté', '90 secondes, le Hold Time BGP', 'Environ 2 à 7 secondes, plus la durée de chaque `dig`', '3 minutes'], answer: 2, why: 'Les checks tournent toutes les 5 secondes, puis chaque seconde dès que l’état commence à tomber, et 3 doivent échouer. Chaque `dig` peut ajouter jusqu’à sa seconde de `+time`.' },
					{ q: 'Quel MED annonce un site sain par défaut ?', options: ['100', '0', '1000', '3'], answer: 0, why: 'Les défauts sont `--up-metric 100` et `--down-metric 1000`.' },
					{ q: 'Combien de checks ratés avant qu’un site compte comme DOWN ?', options: ['1', '5', '10', '3'], answer: 3, why: 'La ligne 2 fixe `--fall` à 3 par défaut, et les lignes 24 à 28 comptent jusque-là.' },
					{ q: 'Sans l’option, quand la route est-elle retirée ?', options: ['Après 3 checks ratés', 'Quand le processus healthcheck s’arrête', 'Quand le MED atteint 1000', 'Jamais'], answer: 1, why: 'La ligne 7 ne retire qu’avec `--withdraw-on-down` ou dans l’état `EXIT`, à l’arrêt du processus.' }
				]
			},
			{
				title: 'Cas (a), par défaut',
				questions: [
					{ q: 'Le démon meurt sur le site 2. Qu’annonce le site 2 après 3 checks ratés ?', options: ['Un retrait', '`med 1000`', '`med 100`', 'Rien de nouveau'], answer: 1, why: 'Le check échoue, l’état passe DOWN, et la route est réannoncée avec la métrique DOWN.' },
					{ q: 'Qu’annoncent les sites 1 et 3 ?', options: ['`med 100`, comme avant', '`med 1000`', 'Un retrait', 'Une route vers le site 2'], answer: 0, why: 'Leurs checks passent toujours : rien ne change pour eux.' },
					{ q: 'Quels routeurs envoient les utilisateurs du site 2 vers les sites 1 ou 3 ?', options: ['Tous les routeurs d’Internet', 'Seulement les routeurs du site 2', 'Seulement les routeurs sans route vers le site 2', 'Les routeurs qui comparent le MED, entre routes venant du même AS voisin'], answer: 3, why: 'La RFC 4271 ne compare le MED qu’entre routes apprises du même AS voisin.' },
					{ q: 'Des requêtes peuvent-elles encore arriver au site 2 ?', options: ['Non, un MED de 1000 le bloque', 'Non, la route a disparu', 'Oui, là où les routeurs ne comparent pas son MED à celui des sites 1 et 3', 'Seulement les requêtes en TCP'], answer: 2, why: 'Un routeur qui apprend le site 2 par un autre AS voisin que les autres sites ne compare jamais leurs MED : il peut continuer à choisir le site 2.' }
				]
			},
			{
				title: 'Cas (b), par défaut',
				questions: [
					{ q: 'Chaque site porte maintenant la même métrique DOWN. Quel site un routeur choisit-il pour `192.0.2.53` ?', options: ['Le même qu’avant la panne : des MED égaux ne changent rien', 'Aucun, puisque aucun site n’est sain', 'Toujours le site 1, le premier tombé', 'Un site différent à chaque requête'], answer: 0, why: 'Le MED ne compte que s’il diffère. Avec 1000 partout, le routeur retombe sur le même choix qu’avant, par exemple l’AS_PATH le plus court.' },
					{ q: 'La base revient. Quand chaque site repasse-t-il à `med 100` ?', options: ['Aussitôt, au premier check réussi', 'Au redémarrage de la session BGP', 'Après 3 checks réussis d’affilée, la valeur par défaut de `--rise`', 'Seulement au redémarrage du processus healthcheck'], answer: 2, why: 'La ligne 1 fixe `--rise` à 3 : le service doit réussir 3 checks avant de compter comme UP et d’être réannoncé avec la métrique UP.' },
					{ q: 'Où vont les requêtes ?', options: ['Nulle part : elles sont jetées', 'Vers des sites dont le check échoue', 'Vers une adresse de secours', 'Retour au client'], answer: 1, why: 'Les trois annoncent le même MED dégradé : les routeurs choisissent encore un site, et chaque site rate son check.' },
					{ q: 'Que reçoivent les clients ?', options: ['Toujours SERVFAIL', 'Toujours un timeout', 'Toujours une bonne réponse', 'Ce que le démon sait encore servir sans la base'], answer: 3, why: 'L’adresse reste joignable. Ce qui revient dépend du démon, pas de BGP.' }
				]
			},
			{
				title: 'Ajoute `--withdraw-on-down`',
				questions: [
					{ q: 'Cas (a) : qu’envoie le site 2 maintenant ?', options: ['`med 1000`', 'Un retrait de `192.0.2.53/32`', '`med 100`', 'Seulement un KEEPALIVE'], answer: 1, why: 'Avec l’option, la ligne 8 choisit `withdraw` pour tout état autre que UP.' },
					{ q: 'Quels routeurs détournent les utilisateurs du site 2 ?', options: ['Tous, quel que soit leur AS voisin', 'Seulement ceux qui comparent le MED', 'Aucun avant l’expiration du Hold Time', 'Seulement les routeurs du même AS'], answer: 0, why: 'Un retrait supprime la route elle-même. Aucune comparaison de MED n’est nécessaire.' },
					{ q: 'Cas (b) : que reste-t-il de `192.0.2.53` sur Internet ?', options: ['Une route, celle du dernier site tombé', 'Trois routes avec `med 1000`', 'Aucune route', 'Une route vers la base'], answer: 2, why: 'Les trois sites retirent la route : aucun routeur n’a plus de chemin vers l’adresse.' },
					{ q: 'Avec l’option, le check du site 2 oscille entre succès et échec toutes les quelques secondes. Contre quoi la RFC 4786 met-elle en garde ?', options: ['Rien : BGP ignore les oscillations courtes', 'Le MED monte à 1000 et y reste', 'Le Hold Time de chaque pair expire', 'Des cycles rapides d’annonce et de retrait posent problème : la route a besoin d’un délai avant de revenir'], answer: 3, why: 'RFC 4786 : « rapid advertisement/withdrawal oscillations can cause operational problems ». Chaque oscillation propage un nouvel UPDATE à tous les pairs.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Les serveurs DNS de Facebook tournaient pendant la panne. Pourquoi aucun résolveur ne pouvait-il les joindre ?',
			options: [
				'Leurs certificats TLS avaient expiré, et les résolveurs refusaient les réponses',
				'Leurs enregistrements avaient un TTL de 0 seconde et les caches se sont vidés',
				'Chaque site avait retiré les routes BGP vers leurs préfixes',
				'Les serveurs racine avaient retiré facebook.com de la zone .com'
			],
			answer: 2,
			why: 'Les serveurs DNS retirent leurs annonces BGP quand ils ne joignent plus les data centers. La panne du backbone a coupé tous les sites d’un coup : chacun a retiré ses routes, et il ne restait aucune route vers 129.134.30.0/23.'
		},
		{
			q: 'Un routeur a deux routes de même préférence vers un préfixe anycast, d’AS_PATH `3303 6453 32934` et `174 32934`. Laquelle choisit-il selon la RFC 4271 ?',
			options: [
				'La première, parce qu’il l’a apprise en premier',
				'La seconde, parce qu’elle a moins de numéros d’AS',
				'La première, parce que l’AS3303 a un numéro plus petit',
				'Les deux, en partageant les paquets à parts égales'
			],
			answer: 1,
			why: 'Dans le départage de la section 9.1.2.2, la première règle écarte toute route qui n’a pas le plus petit nombre de numéros d’AS dans son AS_PATH. 2 bat 3.'
		},
		{
			q: 'Le healthcheck d’ExaBGP tourne avec ses réglages par défaut sur tous les sites anycast, et le check échoue partout. Que voient les routeurs ?',
			options: [
				'Aucune route, car chaque site envoie un retrait',
				'La même route depuis chaque site, avec `med 1000`',
				'Seulement le dernier site en panne, avec `med 100`',
				'Une route leak, parce que le MED a changé'
			],
			answer: 1,
			why: 'Sans `--withdraw-on-down`, l’état DOWN annonce toujours la route, simplement avec la métrique DOWN de 1000 au lieu de 100. La ligne 7 ne retire qu’avec cette option ou dans l’état `EXIT`, à l’arrêt du processus.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Faire tourner seul le healthcheck d’ExaBGP et voir les lignes exactes qu’il enverrait à BGP quand un service tombe, avec et sans `--withdraw-on-down`.',
		steps: [
			'Prépare un bac à sable : `mkdir bgp-lab && cd bgp-lab && python3 -m venv venv && venv/bin/pip install exabgp==4.2.25`.',
			'Crée le marqueur « service en marche » : `touch up`.',
			'Lance le healthcheck avec un intervalle d’une seconde et sans configuration d’IP : `venv/bin/python -m exabgp healthcheck --no-ip-setup --ip 192.0.2.53/32 --cmd "test -f up" -i 1`. Regarde quelques lignes.',
			'Dans un second terminal, dans le même dossier, casse le service avec `rm up`. Regarde environ 5 lignes de plus, puis arrête le healthcheck avec Ctrl-C.',
			'Lance `touch up` et refais l’étape 3 en ajoutant `--withdraw-on-down`. Casse le service avec `rm up`, rétablis-le avec `touch up`, puis arrête avec Ctrl-C.'
		],
		done: [
			'Le premier lancement affiche `neighbor * announce route 192.0.2.53/32 next-hop self med 100` tant que `up` existe.',
			'Après `rm up`, il affiche la même ligne avec `med 1000`, jamais de `withdraw`.',
			'À l’arrêt, il affiche une ligne `withdraw route 192.0.2.53/32`.',
			'Avec `--withdraw-on-down`, `rm up` donne des lignes `withdraw`, et `touch up` ramène `announce ... med 100`.'
		],
		solution: [
			'Ces lignes sont ce qu’ExaBGP lit sur stdout et transforme en messages BGP UPDATE pour ses pairs. Pas besoin de pair pour voir la décision.',
			'Le retrait au Ctrl-C, c’est l’état `EXIT` de la ligne 7 : arrêter le processus retire la route, même sans l’option.',
			'Après `rm up`, la sortie se tait environ 3 secondes avant le changement : aucune ligne ne s’affiche pendant que l’état descend, et il faut 3 checks ratés, le `--fall` par défaut. Imagine maintenant tous les sites qui perdent `up` en même temps avec l’option : c’est la panne de Facebook.'
		]
	},
	recall: {
		q: 'Qu’ont fait les serveurs DNS de Facebook le 4 octobre 2021 en perdant le backbone, et qu’ont vu les résolveurs ?',
		a: 'Ils ont retiré, sur chaque site, leurs annonces BGP pour les préfixes DNS comme 129.134.30.0/23. Sans route, les résolveurs comme 1.1.1.1 ont renvoyé SERVFAIL de 15:50 à 21:20 UTC environ.'
	},
	sources: [
		{ title: 'Facebook Engineering, More details about the October 4 outage', url: FB },
		{ title: 'Blog Cloudflare, Understanding how Facebook disappeared from the Internet', url: CF },
		{ title: 'RFC 4271, A Border Gateway Protocol 4 (BGP-4)', url: 'https://www.rfc-editor.org/rfc/rfc4271' },
		{ title: 'RFC 4786, Operation of Anycast Services', url: 'https://www.rfc-editor.org/rfc/rfc4786' },
		{ title: 'RFC 7908, Problem Definition and Classification of BGP Route Leaks', url: 'https://www.rfc-editor.org/rfc/rfc7908' },
		{ title: 'ExaBGP, healthcheck.py', url: `${EXA}/src/exabgp/application/healthcheck.py` },
		{ title: 'ExaBGP, etc/exabgp/example-healthcheck.conf', url: `${EXA}/etc/exabgp/example-healthcheck.conf` }
	]
};
