const UNBOUND = 'https://github.com/NLnetLabs/unbound/blob/d648eac68d7765440207f68077f96675f5bb36cc';
const ITER = `${UNBOUND}/iterator/iterator.c`;
const RFC1034 = 'https://www.rfc-editor.org/rfc/rfc1034';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'dns-resolution',
	part: 'Noms et adresses',
	title: 'Comment un nom est résolu',
	minutes: 10,
	hook: [
		'Sur le portable utilisé pour ce chapitre, `dig en.wikipedia.org` répond en 6 ms depuis `127.0.0.53`. La réponse contient deux enregistrements : un CNAME de `en.wikipedia.org` vers `dyna.wikimedia.org`, et un enregistrement A pour `dyna.wikimedia.org`.',
		'`dig +trace` pose la même question sans cache, un serveur après l’autre. Un serveur racine a répondu en 9 ms avec les serveurs de `org.`. Un serveur de `org.` a répondu en 16 ms avec les serveurs de `wikipedia.org.`. Puis `ns0.wikimedia.org` a répondu en 86 ms avec le CNAME.',
		'Un résolveur récursif fait ce parcours une fois et garde chaque réponse pendant son TTL. Deux `dig` à 3 secondes d’écart, dans la même session, ont montré le TTL de l’enregistrement A en cache passer de 115 à 112.'
	],
	terms: [
		{ term: 'Stub resolver', def: 'Le résolveur dans l’application ou juste à côté. Il envoie chaque question, avec le bit RD (recursion desired) levé, aux serveurs de `/etc/resolv.conf` et attend une réponse complète.' },
		{ term: 'Résolveur récursif', def: 'Un serveur qui trouve la réponse pour ses clients en interrogeant d’autres serveurs, puis met en cache ce qu’il apprend. Unbound, BIND et les résolveurs des FAI et des services DNS publics font ce travail.' },
		{ term: 'Serveur faisant autorité', def: 'Un serveur qui détient une zone, comme `ns0.wikimedia.org` pour `wikipedia.org`, et répond pour elle à partir de ses propres données.' },
		{ term: 'Referral', def: 'Une réponse sans réponse à la question, avec une liste d’enregistrements NS pour une zone plus proche du nom. La racine renvoie un referral vers les serveurs de `org.`.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['app["curl : getaddrinfo(en.wikipedia.org)"] --> stub["Stub 127.0.0.53"]', 'stub -->|"A? bit RD levé"| rec["Résolveur récursif"]'],
				highlight: ['stub', 'rec'],
				note: 'L’application appelle la bibliothèque C, et le stub lit `nameserver 127.0.0.53` dans `/etc/resolv.conf`. Sur ce portable, cette adresse est systemd-resolved, qui transmet au résolveur du réseau. La RFC 1034 dit qu’un stub n’a besoin que de "a list of name server addresses that will perform the recursive requests".'
			},
			{
				add: ['rec -->|"A? en.wikipedia.org"| root["Serveur racine a.root-servers.net"]', 'root -.->|"referral : NS de org., TTL 172800"| rec'],
				highlight: ['root'],
				note: 'Avec un cache vide, le résolveur commence par l’un des 13 noms de serveurs racine. La racine ne connaît pas l’adresse. Elle répond avec les enregistrements NS de `org.`, à garder 172800 s, soit 2 jours.'
			},
			{
				add: ['rec -->|"A? en.wikipedia.org"| tld["Serveur de org. b0.org.afilias-nst.org"]', 'tld -.->|"referral : NS de wikipedia.org., TTL 3600"| rec'],
				highlight: ['tld'],
				note: 'Le serveur de `org.` répond par un autre referral : `ns0`, `ns1` et `ns2.wikimedia.org` servent `wikipedia.org.`, avec un TTL de 3600 s. La même réponse porte les enregistrements A et AAAA de ces trois serveurs : le résolveur peut joindre `ns0.wikimedia.org` sans autre recherche.'
			},
			{
				add: ['rec -->|"A? en.wikipedia.org"| auth["Faisant autorité : ns0.wikimedia.org"]', 'auth -.->|"CNAME dyna.wikimedia.org"| rec'],
				highlight: ['auth'],
				note: 'Le serveur faisant autorité répond depuis sa zone, avec le flag `aa` : `en.wikipedia.org` est un CNAME vers `dyna.wikimedia.org`, TTL 86400. La réponse ne contient que le CNAME, car `dyna.wikimedia.org` est dans une autre zone. Étape 4c de la RFC 1034 : le résolveur met le CNAME en cache, cherche désormais `dyna.wikimedia.org` et recommence.'
			},
			{
				add: ['rec -.->|"CNAME + A, flags qr rd ra"| stub'],
				highlight: ['rec'],
				note: 'Une fois l’enregistrement A de `dyna.wikimedia.org` obtenu, le résolveur renvoie les deux enregistrements. `dig` affiche `flags: qr rd ra` : une réponse, récursion demandée par le client, récursion disponible sur le serveur. Le client suivant qui pose la question pendant le TTL reçoit la réponse du cache.'
			}
		]
	},
	example: {
		title: 'iterator/iterator.c : Unbound suit un referral, puis un CNAME',
		repo: 'NLnetLabs/unbound',
		url: `${ITER}#L3456-L3698`,
		lang: 'c',
		code: `	} else if(type == RESPONSE_TYPE_REFERRAL) {
		struct delegpt* old_dp = NULL;
		/* REFERRAL type responses get a reset of the
		 * delegation point, and back to the QUERYTARGETS_STATE. */
		verbose(VERB_DETAIL, "query response was REFERRAL");
…
			/* Store the referral under the current query */
			/* no prefetch-leeway, since its not the answer */
			iter_dns_store(qstate->env, &iq->response->qinfo,
				iq->response->rep, 1, 0, 0, NULL, 0,
				qstate->qstarttime, qstate->is_valrec);
…
		/* Reset the event state, setting the current delegation
		 * point to the referral. */
		iq->deleg_msg = iq->response;
		iq->dp = delegpt_from_message(iq->response, qstate->region,
			deleg_port_number(qstate->env));
…
		/* Count this as a referral. */
		iq->referral_count++;
		iq->sent_count = 0;
…
		return next_state(iq, QUERYTARGETS_STATE);
	} else if(type == RESPONSE_TYPE_CNAME) {
		uint8_t* sname = NULL;
		size_t snamelen = 0;
		/* CNAME type responses get a query restart (i.e., get a
		 * reset of the query state and go back to INIT_REQUEST_STATE).
		 */
		verbose(VERB_DETAIL, "query response was CNAME");
…
		/* set the current request's qname to the new value. */
		iq->qchase.qname = sname;
		iq->qchase.qname_len = snamelen;
…
		iq->query_restart_count++;
…
		/* go to INIT_REQUEST_STATE for new qname. */
		return next_state(iq, INIT_REQUEST_STATE);`,
		notes: [
			'Les lignes 9 à 11 mettent le referral en cache. La question suivante sous `org.` saute la racine, car les NS de `org.` sont déjà là.',
			'Les lignes 16 et 17 construisent le nouveau point de délégation à partir des NS de la réponse : au deuxième saut, les trois serveurs `wikimedia.org`. La ligne 23 revient à `QUERYTARGETS_STATE`, qui en choisit un et lui envoie la même question.',
			'La ligne 20 compte les referrals. Ailleurs dans le même fichier, une requête qui dépasse `MAX_REFERRAL_COUNT` (130) referrals échoue en SERVFAIL : une boucle de délégation cassée ne peut pas tourner sans fin.',
			'Les lignes 33 et 39 codent l’étape 4c de la RFC 1034. La ligne 33 remplace le nom recherché par `dyna.wikimedia.org`, et la ligne 39 relance la machine à états à `INIT_REQUEST_STATE`, en commençant par le cache.',
			'Unbound active `qname-minimisation` par défaut : il n’envoie à chaque serveur que les labels dont ce serveur a besoin. Avec ce réglage, la racine ne voit qu’une question sur `org.`, alors que `dig +trace` lui a envoyé `en.wikipedia.org` en entier.'
		]
	},
	tradeoff: {
		gain: [
			'Un seul résolveur récursif tient le cache pour tous les clients derrière lui. La RFC 1034 cite ce cas : "a network where we want to concentrate the cache".',
			'L’application n’a besoin que d’un stub : une adresse dans `/etc/resolv.conf` et une question par recherche.'
		],
		cost: [
			'Une recherche à froid coûte un aller-retour par niveau de zone, plus un parcours de plus pour chaque cible de CNAME. Dans cette trace, les trois sauts après la liste des racines ont pris 111 ms, contre 6 ms depuis le cache.',
			'Quand le résolveur de `/etc/resolv.conf` ne répond plus, toutes les recherches de la machine échouent, même pour des zones dont les serveurs faisant autorité vont bien.'
		]
	},
	task: {
		prompt: 'Voici la sortie de `dig +trace +nodnssec en.wikipedia.org A` de cette session, lignes raccourcies : `. 138582 NS a.root-servers.net.` (13 lignes de ce type, depuis 127.0.0.53), puis `org. 172800 NS b0.org.afilias-nst.org.` (6 lignes, depuis a.root-servers.net en 9 ms), puis `wikipedia.org. 3600 NS ns0.wikimedia.org.` (3 lignes, depuis b0.org.afilias-nst.org en 16 ms), puis `en.wikipedia.org. 86400 CNAME dyna.wikimedia.org.` (depuis ns0.wikimedia.org en 86 ms). Quel serveur fait autorité pour `wikipedia.org` ? Combien de temps un résolveur peut-il garder la délégation de `org.` ? Quelle question un résolveur récursif pose-t-il ensuite ?',
		hint: 'Seul le dernier serveur a répondu à la question elle-même. Les autres ont envoyé des referrals. Un CNAME est une réponse sur le nom, mais ce n’est pas l’enregistrement A que curl a demandé.',
		answer: [
			'`ns0.wikimedia.org` (avec `ns1` et `ns2`) fait autorité pour `wikipedia.org` : il a répondu depuis sa zone, alors que la racine et le serveur de `org.` n’ont envoyé que des referrals.',
			'La racine a envoyé les NS de `org.` avec un TTL de 172800 s : un résolveur peut les garder 2 jours. Les NS de `wikipedia.org.` sont venus avec 3600 s, une heure.',
			'La trace s’arrête au CNAME parce que `dig +trace` affiche la réponse de chaque serveur. Un résolveur récursif repart avec `dyna.wikimedia.org A`, en commençant par son cache. Il a les adresses de `ns0.wikimedia.org` mais aucun NS pour la zone `wikimedia.org.`. L’étape 2 de la RFC 1034 remonte le nom jusqu’aux NS les plus proches qu’il a, ceux de `org.` : il interroge donc d’abord un serveur de `org.`.',
			'Le premier bloc vient de `127.0.0.53` parce que dig demande la liste des NS racine à son serveur configuré. La doc de BIND : "If @server is also specified, it affects only the initial query for the root zone name servers."'
		],
		steps: [
			{
				title: 'Sépare réponses et referrals',
				questions: [
					{ q: 'Combien de serveurs de `org.` `a.root-servers.net` a-t-il nommés dans son referral ?', options: ['6', '13', '3', '1'], answer: 0, why: 'La trace montre 6 lignes `org. NS` venues de `a.root-servers.net`. Les 13 lignes d’avant sont les serveurs racine, venus de `127.0.0.53`.' },
					{ q: 'Le referral de `org.` nomme `ns0.wikimedia.org`, un nom hors de `wikipedia.org`. Comment le résolveur le joint-il sans autre recherche ?', options: ['Il demande d’abord `ns0.wikimedia.org A` à un serveur racine', 'Le même referral porte les enregistrements A et AAAA des trois serveurs', 'Il envoie la question à `127.0.0.53`', 'Il pose une seconde question à `b0.org.afilias-nst.org`'], answer: 1, why: 'La réponse de `org.` contient les adresses de `ns0`, `ns1` et `ns2.wikimedia.org` à côté des NS, donc le résolveur va droit à `ns0`.' },
					{ q: 'Les deux referrals ont pris 9 et 16 ms, la réponse finale 86 ms. Combien a duré la descente depuis la racine ?', options: ['86 ms', '9 ms', 'Environ 111 ms', 'Environ 6 ms'], answer: 2, why: '9 + 16 + 86 = 111 ms. Un résolveur paie ce prix une fois, puis répond depuis son cache, comme la réponse en 6 ms de `127.0.0.53`.' },
					{ q: 'Pourquoi le premier bloc vient-il de `127.0.0.53` ?', options: ['`127.0.0.53` fait autorité pour la zone racine', '`127.0.0.53` est un serveur racine', 'dig lui a d’abord demandé l’enregistrement A', 'dig ne demande à son serveur configuré que la liste des serveurs racine'], answer: 3, why: 'La doc de BIND : "If @server is also specified, it affects only the initial query for the root zone name servers."' }
				]
			},
			{
				title: 'Nomme le serveur faisant autorité',
				questions: [
					{ q: 'Dix minutes plus tard, le même résolveur cherche `fr.wikipedia.org A`. À quel serveur demande-t-il ?', options: ['À `ns0`, `ns1` ou `ns2.wikimedia.org`, d’après les NS en cache', 'À un serveur racine', 'À un serveur de `org.`', 'À `127.0.0.53`'], answer: 0, why: 'Les NS de `wikipedia.org.` restent en cache 3600 s. Ces serveurs font autorité pour tous les noms de la zone, donc le résolveur saute la racine et `org.`.' },
					{ q: 'Quel flag marque une réponse faisant autorité dans `dig` ?', options: ['`ra`', '`aa`', '`rd`', '`qr`'], answer: 1, why: '`aa` veut dire que la réponse vient de la zone elle-même. `qr` marque seulement une réponse.' },
					{ q: 'Pourquoi le serveur de `org.` ne fait-il pas autorité pour `wikipedia.org` ?', options: ['Il a répondu trop lentement, en 16 ms', 'Il ne connaît pas du tout le nom', 'Il ne détient que la délégation, donc il envoie un referral', 'Il ne sert qu’en IPv6'], answer: 2, why: 'La zone `org.` détient les NS qui délèguent `wikipedia.org.`, pas les enregistrements qu’elle contient.' },
					{ q: 'La réponse de `127.0.0.53` ne porte pas `aa`. Pourquoi ?', options: ['Il a oublié de lever le flag', 'DNSSEC a retiré le flag', 'Seuls les serveurs racine lèvent `aa`', 'Il a répondu depuis son cache, pas depuis une zone qu’il détient'], answer: 3, why: '`aa` n’est levé que par un serveur qui répond depuis les données de sa propre zone. `127.0.0.53` est un résolveur qui répète ce qu’il a appris.' }
				]
			},
			{
				title: 'Lis les TTL',
				questions: [
					{ q: 'Combien de temps un résolveur peut-il garder la délégation de `org.` ?', options: ['172800 s, soit 2 jours', '3600 s, une heure', '86400 s, un jour', '138582 s'], answer: 0, why: 'La racine a envoyé les NS de `org.` avec un TTL de 172800.' },
					{ q: 'Et les NS de `wikipedia.org.` ?', options: ['172800 s, comme `org.`', '3600 s, une heure', '86400 s, comme le CNAME', '16 ms, le temps de réponse'], answer: 1, why: 'Le serveur de `org.` les a envoyés avec 3600. Chaque zone fixe le TTL des enregistrements qu’elle donne.' },
					{ q: 'Combien de temps un résolveur peut-il garder le CNAME, au TTL de 86400 ?', options: ['Une heure', 'Deux jours', 'Un jour', '86 secondes'], answer: 2, why: '86400 s font 24 heures. Le 86 de la trace est le temps de réponse en millisecondes.' },
					{ q: 'Pourquoi le TTL des NS racine vaut-il 138582, et pas un nombre rond ?', options: ['Les enregistrements racine ont des TTL aléatoires', 'dig arrondit tous les TTL vers le bas', 'C’est le numéro de série de la zone', 'Il vient du cache de `127.0.0.53`, qui décompte le TTL'], answer: 3, why: 'Un cache garde chaque enregistrement pendant son TTL et affiche le temps restant, comme l’enregistrement A passé de 115 à 112.' }
				]
			},
			{
				title: 'Pose la question suivante',
				questions: [
					{ q: 'Pourquoi la réponse de `ns0.wikimedia.org` contient-elle le CNAME sans enregistrement A ?', options: ['`dyna.wikimedia.org` est dans une autre zone, `wikimedia.org.`', 'L’enregistrement A avait expiré', 'dig n’a demandé que des CNAME', 'L’enregistrement A est parti dans la section authority'], answer: 0, why: 'Un serveur faisant autorité répond depuis sa propre zone. La cible du CNAME vit dans `wikimedia.org.`, donc la réponse s’arrête à l’alias.' },
					{ q: 'Pour répondre au client, le résolveur doit maintenant trouver l’enregistrement A de `dyna.wikimedia.org`. Une fois trouvé, que renvoie-t-il pour `en.wikipedia.org A` ?', options: ['Seulement l’enregistrement A de `dyna.wikimedia.org`', 'Le CNAME et l’enregistrement A de `dyna.wikimedia.org`', 'Seulement le CNAME', 'Un referral vers les serveurs de `wikimedia.org.`'], answer: 1, why: 'Le résolveur renvoie toute la chaîne : le CNAME, puis l’enregistrement A de sa cible. C’est la réponse à deux enregistrements que `dig en.wikipedia.org` a affichée depuis `127.0.0.53`.' },
					{ q: 'Où le résolveur regarde-t-il d’abord ?', options: ['Chez un serveur racine, toujours', 'Chez `ns0.wikimedia.org`, dont il a l’adresse', 'Dans son propre cache', 'Chez le client'], answer: 2, why: 'Unbound revient à `INIT_REQUEST_STATE`, qui commence par une recherche dans le cache.' },
					{ q: 'Quel serveur interroge-t-il d’abord pour `dyna.wikimedia.org` ?', options: ['Un serveur racine, parce que le nom a changé', '`ns0.wikimedia.org`, parce qu’il a son adresse', '`127.0.0.53`', 'Un serveur de `org.` : les NS les plus proches qu’il a'], answer: 3, why: 'Il a l’adresse de `ns0` mais aucun NS pour `wikimedia.org.`. L’étape 2 de la RFC 1034 remonte le nom jusqu’aux NS les plus proches du cache, ceux de `org.`.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Un résolveur récursif au cache vide demande `en.wikipedia.org A` à un serveur racine. Que renvoie le serveur racine ?',
			options: [
				'L’enregistrement A, car les serveurs racine ont une copie de toutes les zones',
				'Un referral : les NS de la zone `org.`, sans réponse',
				'Un NXDOMAIN, car la zone racine n’a pas de `en.wikipedia.org`',
				'Un SERVFAIL, car les serveurs racine refusent les requêtes récursives'
			],
			answer: 1,
			why: 'Un serveur racine ne répond qu’à partir de la zone racine. Il n’a aucun enregistrement pour ce nom. Il a la délégation de `org.`, donc il renvoie un referral vers un serveur plus proche ("closer") de la réponse, comme le dit la RFC 1034. Le résolveur interroge ensuite un serveur de `org.`.'
		},
		{
			q: '`dig` affiche `flags: qr rd ra` pour une réponse de `127.0.0.53`. Que t’apprend `ra` ?',
			options: [
				'La réponse vient directement d’un serveur faisant autorité',
				'L’enregistrement a un TTL, donc le résolveur va le garder en cache',
				'Le serveur propose la récursion, quoi que la requête ait demandé',
				'La réponse a été validée avec DNSSEC par le résolveur'
			],
			answer: 2,
			why: 'RFC 1034 : le bit RA "is true if the name server is willing to provide recursive service for the client", et "RA signals availability rather than use". `rd` est le bit levé par le client. Une réponse faisant autorité porterait `aa`.'
		},
		{
			q: 'Le serveur faisant autorité répond `en.wikipedia.org CNAME dyna.wikimedia.org` et rien d’autre. Que fait ensuite un résolveur récursif ?',
			options: [
				'Il renvoie le CNAME seul, et le client doit chercher la cible lui-même',
				'Il repose la question au même serveur avec le bit RD levé',
				'Il retourne à la racine, car les cibles de CNAME ne sont jamais en cache',
				'Il met le CNAME en cache et relance la recherche pour `dyna.wikimedia.org`'
			],
			answer: 3,
			why: 'Étape 4c de la RFC 1034 : mettre le CNAME en cache, remplacer le nom par le nom canonique et revenir à l’étape 1. Unbound le fait dans sa branche CNAME avec `next_state(iq, INIT_REQUEST_STATE)`. Le client reçoit le CNAME et l’enregistrement A dans une seule réponse.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Suivre à la main la délégation de `en.wikipedia.org` avec `dig`, un serveur à la fois, comme le fait un résolveur récursif.',
		steps: [
			'Interroge un serveur racine, sans récursion : `dig +norecurse @a.root-servers.net en.wikipedia.org A`. Lis la ligne `flags` et la section AUTHORITY. Si `dig` manque, lance chaque étape dans `docker run --rm -it nicolaka/netshoot:v0.13`.',
			'Interroge un des serveurs de `org.` qu’il a nommés : `dig +norecurse @b0.org.afilias-nst.org en.wikipedia.org A`.',
			'Interroge un serveur nommé pour `wikipedia.org.` : `dig +norecurse @ns0.wikimedia.org en.wikipedia.org A`.',
			'Suis le CNAME comme le ferait un résolveur : `dig +norecurse @b0.org.afilias-nst.org dyna.wikimedia.org A`, puis `dig +norecurse @ns0.wikimedia.org dyna.wikimedia.org A`.',
			'Compare avec ton propre résolveur, deux fois, à quelques secondes d’écart : `dig en.wikipedia.org`, puis `sleep 3; dig en.wikipedia.org`.'
		],
		done: [
			'Les étapes 1 et 2 affichent `flags: qr` avec `ANSWER: 0`, et des NS dans la section AUTHORITY.',
			'L’étape 3 affiche `flags: qr aa` et le CNAME vers `dyna.wikimedia.org`, avec un TTL de 86400.',
			'À l’étape 4, le serveur de `org.` te renvoie vers les serveurs de `wikimedia.org.`, et `ns0.wikimedia.org` répond l’enregistrement A avec `aa`.',
			'À l’étape 5, les réponses portent `flags: qr rd ra`, et le TTL de l’enregistrement A est plus bas de quelques secondes dans la seconde réponse, sauf s’il a expiré entre-temps.'
		],
		solution: [
			'Les serveurs racine et de `org.` ne détiennent que des délégations : ils répondent par des referrals, sans `aa`. `ns0.wikimedia.org` détient la zone et répond à partir d’elle.',
			'La cible du CNAME est dans une autre zone, `wikimedia.org.`, donc une seconde descente commence. Elle saute la racine, car les NS de `org.` sont déjà connus.',
			'Ton résolveur a fait cette descente une fois et répond maintenant depuis son cache, avec le CNAME et l’enregistrement A dans une seule réponse, en décomptant le TTL.'
		]
	},
	recall: {
		q: 'Avec un cache vide, quels serveurs un résolveur récursif interroge-t-il pour `en.wikipedia.org`, et que renvoie chacun ?',
		a: 'Un serveur racine renvoie un referral vers les serveurs de `org.`. Un serveur de `org.` renvoie un referral vers `ns0`, `ns1` et `ns2.wikimedia.org`. `ns0.wikimedia.org` répond avec le CNAME vers `dyna.wikimedia.org`, et le résolveur recommence pour ce nom.'
	},
	sources: [
		{ title: 'RFC 1034, Domain Names: Concepts and Facilities', url: RFC1034 },
		{ title: 'Source Unbound, iterator/iterator.c', url: ITER },
		{ title: 'unbound.conf(5), qname-minimisation', url: `${UNBOUND}/doc/unbound.conf.rst` },
		{ title: 'Manuel de BIND 9.18, dig', url: 'https://bind9.readthedocs.io/en/v9.18.39/manpages.html' }
	]
};
