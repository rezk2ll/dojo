const LINUX = 'https://github.com/torvalds/linux/blob/70dd4ee72eb2d5793c62e71c14e3aba78e5a4e56';
const TRIE = `${LINUX}/net/ipv4/fib_trie.c`;
const TRIE_DOC = `${LINUX}/Documentation/networking/fib_trie.rst`;
const SEMANTICS = `${LINUX}/net/ipv4/fib_semantics.c`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'routing',
	part: 'Les paquets',
	title: 'Les tables de routage',
	minutes: 10,
	hook: [
		'Ta machine a la route `10.0.0.0/8 via 172.17.0.1`, le chemin vers le réseau du bureau. Une collègue ajoute un bridge de test `br0` avec l’adresse 10.1.0.1/16. À partir de là, la base de données en 10.1.2.3 ne répond plus, alors que 10.2.0.5 marche toujours.',
		'`ip route get 10.1.2.3` donne la raison : `10.1.2.3 dev br0 src 10.1.0.1`. L’ajout de l’adresse a créé une seconde route, `10.1.0.0/16 dev br0`. Les deux routes contiennent 10.1.2.3, et **le noyau choisit celle qui a le préfixe le plus long : 16 bits contre 8.** Les paquets sortent maintenant par un bridge vide au lieu d’aller à la passerelle.'
	],
	terms: [
		{ term: 'Table de routage', def: 'La liste des routes que le noyau lit pour décider où part un paquet sortant. `ip route` l’affiche. Chaque route associe un préfixe à l’endroit où envoyer ses paquets.' },
		{ term: 'Prochain saut', def: 'Le routeur à qui on confie le paquet, affiché `via 172.17.0.1`. Une route sans `via` veut dire que la destination est sur ce lien et reçoit le paquet directement.' },
		{ term: 'Route par défaut', def: 'La route de `0.0.0.0/0`, affichée `default`. Elle contient toutes les adresses avec une longueur de préfixe de 0, donc elle ne sert que si aucune autre route ne correspond.' },
		{ term: 'Longest prefix match', def: 'La règle qui départage les routes contenant la destination : celle qui a la plus grande longueur de préfixe l’emporte.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['app["L’app envoie vers 10.1.2.3"] --> fib["Table de routage du noyau : 4 routes"]'],
				highlight: ['app', 'fib'],
				note: 'Dans le conteneur, `ip route` liste 4 routes : `default via 172.17.0.1`, `10.0.0.0/8 via 172.17.0.1`, `10.1.0.0/16 dev br0` et `172.17.0.0/16 dev eth0`. Le noyau cherche 10.1.2.3 dans cette table avant qu’un seul octet sorte.'
			},
			{
				add: ['fib --> keep["Contiennent 10.1.2.3 : default /0, 10.0.0.0/8, 10.1.0.0/16"]', 'fib -.->|"écartée"| drop["172.17.0.0/16 : ne la contient pas"]'],
				highlight: ['keep', 'drop'],
				note: 'La RFC 1812 appelle ce premier tri Basic Match : il "discards any routes to destinations other than the IP Destination Address of the packet". 172.17.0.0/16 ne peut pas contenir 10.1.2.3. Il reste trois routes, dont la route par défaut, qui contient toutes les adresses.'
			},
			{
				add: ['keep -->|"préfixe le plus long : /16"| br["10.1.0.0/16 dev br0 : envoyé sur br0, sans passerelle"]'],
				highlight: ['br'],
				note: 'Longest Match ne garde que les routes de plus grande longueur de préfixe. /16 bat /8 et /0. `ip route get fibmatch 10.1.2.3` affiche la route gagnante : `10.1.0.0/16 dev br0 proto kernel scope link`. Pas de `via` : le noyau va chercher 10.1.2.3 directement sur `br0` (jour 4).'
			},
			{
				add: ['app2["L’app envoie vers 10.2.0.5"] --> eight["Seules default /0 et 10.0.0.0/8 la contiennent"]', 'eight -->|"/8 l’emporte"| gw["via 172.17.0.1 dev eth0"]'],
				highlight: ['app2', 'eight', 'gw'],
				note: '10.2.0.5 est hors de 10.1.0.0/16, donc deux routes seulement la contiennent. /8 bat /0, et `ip route get 10.2.0.5` affiche `via 172.17.0.1 dev eth0`, le même chemin qu’avant l’arrivée du bridge.'
			},
			{
				add: ['app3["Sans route par défaut, l’app envoie vers 1.1.1.1"] -->|"aucune route ne la contient"| err["sendto échoue : Network unreachable"]'],
				highlight: ['app3', 'err'],
				note: 'Après `ip route del default`, aucune route ne contient 1.1.1.1. `ip route get 1.1.1.1` affiche `RTNETLINK answers: Network unreachable`, et `ping` échoue avec `sendto: Network unreachable`. L’erreur vient du noyau local, et aucun paquet ne part.'
			}
		]
	},
	example: {
		title: 'net/ipv4/fib_trie.c : fib_table_lookup, la recherche de route IPv4 du noyau',
		repo: 'torvalds/linux',
		url: `${TRIE}#L1418-L1613`,
		lang: 'c',
		code: `int fib_table_lookup(struct fib_table *tb, const struct flowi4 *flp,
		     struct fib_result *res, int fib_flags)
{
	struct trie *t = (struct trie *) tb->tb_data;
…
	const t_key key = ntohl(flp->daddr);
…
	/* Step 1: Travel to the longest prefix match in the trie */
	for (;;) {
		index = get_cindex(key, n);
…
	}

	/* Step 2: Sort out leaves and begin backtracing for longest prefix */
	for (;;) {
…
			/* strip the least significant bit from the cindex */
			cindex &= cindex - 1;
…
	}

found:
	/* this line carries forward the xor from earlier in the function */
	index = key ^ n->key;

	/* Step 3: Process the leaf, if that fails fall back to backtracing */
	hlist_for_each_entry_rcu(fa, &n->leaf, fa_list) {
		struct fib_info *fi = fa->fa_info;
…
		if ((BITS_PER_LONG > KEYLENGTH) || (fa->fa_slen < KEYLENGTH)) {
			if (index >= (1ul << fa->fa_slen))
				continue;
		}
…
		err = fib_props[fa->fa_type].error;
		if (unlikely(err < 0)) {
…
			return err;
		}
…
			res->prefix = htonl(n->key);
			res->prefixlen = KEYLENGTH - fa->fa_slen;`,
		notes: [
			'La ligne 6 transforme l’adresse de destination en un nombre de 32 bits, la clé. Pour 10.1.2.3, c’est `0x0A010203`. Les routes sont rangées dans un trie, un arbre qui se divise selon les bits de la clé.',
			'Les lignes 8 à 11 descendent le trie jusqu’au nœud le plus précis pour la clé. Si ce nœud n’a pas de route qui convient, les lignes 14 à 18 remontent. La [doc du noyau](' + TRIE_DOC + '?plain=1#L129-L133) le décrit : "The prefix length, starting out at the same as the key length, is reduced one step at a time" (la longueur de préfixe baisse d’un cran à chaque fois).',
			'La ligne 31 est un test de préfixe. `fa_slen` est le nombre de bits d’hôte, 16 pour un `/16`. La route ne convient que si la clé et la route ne diffèrent que dans les bits d’hôte : le même test par XOR que `Prefix.Contains` en Go (jour 2).',
			'La ligne 35 lit l’erreur liée au type de la route. Une route normale a 0. Une route `unreachable` a [`-EHOSTUNREACH`](' + SEMANTICS + '#L117-L120) : une recherche peut donc échouer exprès.',
			'La ligne 42 renvoie la longueur de préfixe de la route gagnante : 32 moins les bits d’hôte. `ip route get fibmatch` affiche cette route.'
		]
	},
	tradeoff: {
		gain: [
			'Les 4 routes du conteneur suffisent pour joindre le réseau local, le bridge, le bureau et tout internet.',
			'Une route plus précise passe devant une route plus large sans la modifier. L’ajout de `10.1.0.0/16` a changé le chemin de 65 536 adresses et laissé le reste de `10.0.0.0/8` tranquille.'
		],
		cost: [
			'L’adresse du bridge a enlevé 10.1.2.3 à la route du bureau par accident, et ni `ip addr add` ni `ping` n’ont rien signalé.',
			'`ping -c2 10.1.2.3` affiche seulement `100% packet loss`. Il ne dit pas quelle route a servi : il faut lancer `ip route get` pour voir `dev br0`.'
		]
	},
	task: {
		prompt: 'Un nœud affiche cette sortie de `ip route` :\n\n`default via 172.17.0.1 dev eth0`\n`10.96.0.0/12 via 172.17.0.4 dev eth0`\n`10.244.0.0/24 dev br0 proto kernel scope link src 10.244.0.1`\n`10.244.0.0/16 via 172.17.0.3 dev eth0`\n`172.17.0.0/16 dev eth0 proto kernel scope link src 172.17.0.5`\n\nPour chaque destination, donne la route gagnante et où part le paquet : `10.244.0.17`, `10.244.3.9`, `10.100.0.10`, `10.112.0.1`.',
		hint: 'Liste les routes qui contiennent l’adresse, puis garde le préfixe le plus long. Un `/12` fixe les 4 bits hauts du deuxième octet, donc `10.96.0.0/12` va de 10.96 à 10.111.',
		answer: [
			'`10.244.0.17` : `10.244.0.0/24` et `10.244.0.0/16` la contiennent, et /24 l’emporte. Le paquet sort directement par `br0`. `ip route get` affiche `10.244.0.17 dev br0 src 10.244.0.1`.',
			'`10.244.3.9` : le troisième octet, 3, sort du `/24`, donc `10.244.0.0/16` l’emporte : `via 172.17.0.3 dev eth0`.',
			'`10.100.0.10` : 100 est entre 96 et 111, donc `10.96.0.0/12` l’emporte : `via 172.17.0.4 dev eth0`.',
			'`10.112.0.1` : 112 dépasse 111, et seule la route par défaut la contient : `via 172.17.0.1 dev eth0`.'
		],
		steps: [
			{
				title: 'Lis la table',
				questions: [
					{ q: 'Quelles adresses couvre `10.96.0.0/12` ?', options: ['De 10.96.0.0 à 10.111.255.255', 'De 10.96.0.0 à 10.96.255.255', 'De 10.96.0.0 à 10.108.255.255', 'De 10.0.0.0 à 10.255.255.255'], answer: 0, why: 'Un `/12` fixe les 4 bits hauts du deuxième octet, donc il couvre 16 valeurs : de 96 à 111.' },
					{ q: 'Quelles routes n’ont pas de `via` ?', options: ['Seulement la route par défaut', '`10.244.0.0/24` et `172.17.0.0/16`', '`10.96.0.0/12` et `10.244.0.0/16`', 'Aucune'], answer: 1, why: 'Une route sans `via` veut dire que la destination est sur ce lien et reçoit le paquet directement.' },
					{ q: 'L’ordre des lignes change-t-il la route gagnante ?', options: ['Oui : la première ligne qui correspond gagne', 'Oui : la dernière ligne qui correspond gagne', 'Non : seule la longueur de préfixe décide', 'Seulement pour la route par défaut'], answer: 2, why: 'Le longest prefix match regarde toutes les routes qui contiennent l’adresse. L’ordre d’affichage de `ip route` ne joue aucun rôle.' },
					{ q: 'Quelle longueur de préfixe a la route `default` ?', options: ['32', '8', '0', '24'], answer: 2, why: '`default` est `0.0.0.0/0`. Elle contient toutes les adresses mais a le préfixe le plus court, donc elle ne gagne que si rien d’autre ne correspond.' }
				]
			},
			{
				title: 'Route 10.244.0.17',
				questions: [
					{ q: 'Quelles routes contiennent `10.244.0.17` ?', options: ['`10.244.0.0/24`, `10.244.0.0/16` et la route par défaut', 'Seulement `10.244.0.0/24`', '`10.244.0.0/16` et `172.17.0.0/16`', 'Seulement la route par défaut'], answer: 0, why: 'Le `/24` couvre 10.244.0.x, le `/16` couvre 10.244.x.x, et la route par défaut couvre tout.' },
					{ q: 'Laquelle l’emporte ?', options: ['`10.244.0.0/16`, car elle est listée après', '`10.244.0.0/24`', 'La route par défaut', '`10.96.0.0/12`'], answer: 1, why: '24 est la plus grande longueur de préfixe des trois candidates.' },
					{ q: 'Où part le paquet ?', options: ['Vers 172.17.0.3 sur `eth0`', 'Vers 172.17.0.1 sur `eth0`', 'Vers 10.244.0.1, comme passerelle', 'Directement par `br0`, sans passerelle'], answer: 3, why: 'La route gagnante n’a pas de `via`, donc le noyau livre le paquet directement sur `br0`. 10.244.0.1 est l’adresse du nœud sur ce bridge.' },
					{ q: 'Qu’affiche `ip route get 10.244.0.17` ?', options: ['`10.244.0.17 via 172.17.0.3 dev eth0`', '`10.244.0.17 dev br0 src 10.244.0.1`', '`RTNETLINK answers: Network unreachable`', '`10.244.0.17 via 172.17.0.1 dev eth0`'], answer: 1, why: 'Elle affiche la route choisie par le noyau : `dev br0`, avec l’adresse du bridge comme source.' }
				]
			},
			{
				title: 'Route 10.244.3.9 et 10.100.0.10',
				questions: [
					{ q: '`10.244.3.9` est-elle dans `10.244.0.0/24` ?', options: ['Oui : les deux premiers octets sont les mêmes', 'Non : son troisième octet, 3, sort du `/24`', 'Oui : un `/24` couvre 10.244.0 à 10.244.3', 'Non : un `/24` ne contient qu’une adresse'], answer: 1, why: 'Un `/24` fixe les trois premiers octets, et 10.244.3 n’est pas 10.244.0.' },
					{ q: 'Où part donc `10.244.3.9` ?', options: ['`via 172.17.0.3 dev eth0`', '`dev br0`', '`via 172.17.0.1 dev eth0`', '`via 172.17.0.4 dev eth0`'], answer: 0, why: '`10.244.0.0/16` et la route par défaut la contiennent, et /16 l’emporte sur /0.' },
					{ q: 'Quelle route l’emporte pour `10.100.0.10` ?', options: ['La route par défaut, car aucune ligne ne commence par 10.100', '`10.244.0.0/16`', '`10.96.0.0/12`, car 100 est entre 96 et 111', '`172.17.0.0/16`'], answer: 2, why: 'Un préfixe couvre une plage, pas un début de texte. 10.100 tombe entre 10.96 et 10.111, et /12 l’emporte sur /0.' },
					{ q: 'Où part `10.100.0.10` ?', options: ['`dev br0`', '`via 172.17.0.1 dev eth0`', '`via 172.17.0.3 dev eth0`', '`via 172.17.0.4 dev eth0`'], answer: 3, why: 'La route gagnante `10.96.0.0/12` confie le paquet à 172.17.0.4.' }
				]
			},
			{
				title: 'Route 10.112.0.1, puis vérifie',
				questions: [
					{ q: '`10.112.0.1` est-elle dans `10.96.0.0/12` ?', options: ['Oui : 112 est proche de 96', 'Non : 112 dépasse 111', 'Oui : un `/12` couvre 10.96 à 10.127', 'Non : un `/12` ne couvre que 10.96'], answer: 1, why: 'Le bloc a 16 valeurs, de 96 à 111. 112 ouvre le bloc suivant.' },
					{ q: 'Où part `10.112.0.1` ?', options: ['Nulle part : aucune route ne la contient', '`via 172.17.0.4 dev eth0`', '`via 172.17.0.1 dev eth0`, la route par défaut', '`dev br0`'], answer: 2, why: 'Seule la route par défaut la contient, donc le paquet part vers 172.17.0.1.' },
					{ q: 'Sans la route par défaut, qu’affiche `ip route get 10.112.0.1` ?', options: ['`RTNETLINK answers: Network unreachable`', '`10.112.0.1 via 172.17.0.4 dev eth0`', '`100% packet loss`', '`10.112.0.1 dev eth0 src 172.17.0.5`'], answer: 0, why: 'Aucune route ne contient l’adresse, donc le noyau local échoue à la recherche et n’envoie rien.' },
					{ q: 'Quelle commande montre la ligne de la table qui a été retenue ?', options: ['`ip neigh show 10.112.0.1`', '`ping -c1 10.112.0.1`', '`ip addr show to 10.112.0.1`', '`ip route get fibmatch 10.112.0.1`'], answer: 3, why: '`ip route get` montre la route telle que le noyau la voit, et `fibmatch` affiche la ligne de la table qui correspond.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'La table contient `10.0.0.0/8 via A`, `10.20.0.0/16 via B` et `default via C`. Où part un paquet pour 10.20.5.1 ?',
			options: [
				'Vers A, car 10.0.0.0/8 est listée en premier',
				'Vers B, car /16 est le plus long préfixe qui la contient',
				'Vers C, car la route par défaut est toujours essayée d’abord',
				'Vers A puis B, pour répartir la charge entre les deux'
			],
			answer: 1,
			why: 'Chaque route dont le préfixe contient 10.20.5.1 est candidate, et le noyau garde celle qui a la plus grande longueur de préfixe. L’ordre des lignes de `ip route` ne compte pas.'
		},
		{
			q: '`ping 1.1.1.1` échoue tout de suite avec `sendto: Network unreachable`. Qu’est-ce que ça t’apprend ?',
			options: [
				'Un routeur sur le chemin a renvoyé une erreur pour 1.1.1.1',
				'1.1.1.1 est en panne et a refusé la requête ICMP echo',
				'Aucune route locale ne contient 1.1.1.1 : rien n’est parti',
				'Le serveur DNS n’a pas pu résoudre le nom 1.1.1.1'
			],
			answer: 2,
			why: 'L’erreur vient du noyau local, au moment de `sendto` : la recherche de route n’a rien trouvé, souvent parce que la route par défaut manque. `ip route get 1.1.1.1` affiche la même erreur.'
		},
		{
			q: 'Quelle commande montre la route que le noyau choisit pour 10.1.2.3 ?',
			options: ['`ip route get 10.1.2.3`', '`ip neigh show 10.1.2.3`', '`ping -c1 10.1.2.3`', '`ip addr show to 10.1.2.3`'],
			answer: 0,
			why: 'Selon la page de manuel ip-route, `ip route get` "gets a single route to a destination and prints its contents exactly as the kernel sees it". Ajoute `fibmatch` pour voir la ligne de la table qui a été retenue.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Monter la table de routage de l’exercice dans un conteneur et laisser le noyau vérifier tes quatre réponses.',
		steps: [
			'Lance un conteneur sans réseau, avec le droit de changer ses routes : `docker run --rm -it --network none --cap-add NET_ADMIN nicolaka/netshoot:v0.13`.',
			'Crée les deux interfaces de l’exercice : `ip link add eth0 type bridge && ip link set eth0 up && ip addr add 172.17.0.5/16 dev eth0`, puis `ip link add br0 type bridge && ip link set br0 up && ip addr add 10.244.0.1/24 dev br0`.',
			'Ajoute les trois routes qui passent par une passerelle : `ip route add default via 172.17.0.1 && ip route add 10.96.0.0/12 via 172.17.0.4 && ip route add 10.244.0.0/16 via 172.17.0.3`. Lance `ip route` et compare avec l’exercice.',
			'Note tes quatre réponses, puis vérifie-les : `for a in 10.244.0.17 10.244.3.9 10.100.0.10 10.112.0.1; do ip route get fibmatch $a; done`.',
			'Supprime la route par défaut avec `ip route del default`, puis lance `ip route get 10.112.0.1` et `ping -c1 10.112.0.1`. Tape `exit` pour sortir.'
		],
		done: [
			'`ip route` affiche les cinq mêmes routes que l’exercice.',
			'Les quatre lignes `fibmatch` sont `10.244.0.0/24 dev br0 ...`, `10.244.0.0/16 via 172.17.0.3 dev eth0`, `10.96.0.0/12 via 172.17.0.4 dev eth0` et `default via 172.17.0.1 dev eth0`.',
			'Sans route par défaut, `ip route get 10.112.0.1` affiche `RTNETLINK answers: Network unreachable`.'
		],
		solution: [
			'Le noyau garde toutes les routes qui contiennent l’adresse, puis le préfixe le plus long : /24 l’emporte sur /16 pour 10.244.0.17, et /16 gagne pour 10.244.3.9.',
			'10.100 est dans `10.96.0.0/12` (de 10.96 à 10.111), et 10.112 n’y est pas, donc seule la route par défaut attrape 10.112.0.1.',
			'Sans route par défaut, `ping` échoue tout de suite avec `Network unreachable` : le noyau local n’a trouvé aucune route et n’a envoyé aucun paquet.'
		]
	},
	recall: {
		q: 'Les routes `10.0.0.0/8 via 172.17.0.1` et `10.1.0.0/16 dev br0` contiennent toutes deux 10.1.2.3. Laquelle le noyau prend-il, et pourquoi ?',
		a: '`10.1.0.0/16 dev br0`, car le longest prefix match garde la plus grande longueur de préfixe : 16 contre 8.'
	},
	sources: [
		{ title: 'RFC 1812, Requirements for IP Version 4 Routers, section 5.2.4.3', url: 'https://www.rfc-editor.org/rfc/rfc1812#section-5.2.4.3' },
		{ title: 'Page de manuel ip-route(8)', url: 'https://man7.org/linux/man-pages/man8/ip-route.8.html' },
		{ title: 'Doc du noyau Linux, notes sur l’implémentation LC-trie (fib_trie.rst)', url: TRIE_DOC },
		{ title: 'Source Linux, net/ipv4/fib_semantics.c (fib_props)', url: `${SEMANTICS}#L88-L137` }
	]
};
