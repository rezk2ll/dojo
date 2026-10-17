const VARNISH = 'https://github.com/varnishcache/varnish-cache/blob/0038dd19804fd92cd8bd4bfe92e5a515a57d5e8e';
const BUILTIN = `${VARNISH}/bin/varnishd/builtin.vcl`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'cdn',
	part: 'Entre services',
	title: 'Les CDN',
	minutes: 10,
	hook: [
		'Le 25 décembre 2015, des utilisateurs du Steam Store ouvrent leur page de compte et tombent sur celle de quelqu’un d’autre. Le communiqué de Valve : "Between 11:50 PST and 13:20 PST store page requests for about 34k users, which contained sensitive personal information, may have been returned and seen by other users." (les pages de 34 000 comptes environ ont pu être montrées à d’autres).',
		'Steam subissait une attaque DoS, avec un trafic 2000 % au-dessus de la moyenne des soldes Steam. Son partenaire de cache web a déployé de nouvelles règles, et "a second caching configuration was deployed that incorrectly cached web traffic for authenticated users" (une deuxième configuration mettait en cache le trafic des utilisateurs connectés).',
		'Certains ont reçu la page d’accueil du store "displayed in the wrong language", d’autres "the account page of another user". Valve a gardé le store fermé jusqu’à ce que "all cached data on edge servers had been purged".'
	],
	terms: [
		{ term: 'POP de bord', def: 'Un point de présence : un site du CDN avec des serveurs de cache, proche des utilisateurs. Une requête arrive au plus proche, et seul un miss va plus loin vers l’origine.' },
		{ term: 'Clé de cache', def: 'La valeur que le cache utilise pour retrouver une réponse stockée. Par défaut, Fastly et Varnish prennent l’URL (chemin et query) plus l’en-tête `Host`.' },
		{ term: 'Purge', def: 'Un retrait explicite de contenu du cache avant la fin de son TTL : une URL, tous les objets marqués d’une surrogate key, ou tout le service.' },
		{ term: 'Origin shield', def: 'Un POP désigné vers lequel tous les autres envoient leurs miss. Fastly : "visitor requests from across the global network funnel through a single, designated shield POP".' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['u1["Utilisateur à Paris : GET /pricing"] --> e1["POP Paris : miss"]'],
				highlight: ['u1', 'e1'],
				note: 'Le POP de Paris calcule la clé de cache à partir de l’URL `/pricing` et de l’en-tête `Host`. Rien n’est encore stocké sous cette clé : c’est un miss, et la requête continue.'
			},
			{
				add: ['e1 -->|"miss"| sh["Shield POP : miss"]', 'sh -->|"une requête"| o["Origine"]', 'o -->|"200, Surrogate-Control: max-age=3600"| sh'],
				highlight: ['sh', 'o'],
				note: 'Le bord transmet le miss au shield POP, qui rate aussi et interroge l’origine. `Surrogate-Control: max-age=3600` fixe le TTL du CDN à une heure. Fastly retire cet en-tête avant que la réponse arrive à l’utilisateur, et le shield comme le bord stockent la réponse.'
			},
			{
				add: ['u2["Utilisateur à Madrid : GET /pricing"] --> e2["POP Madrid : miss"]', 'e2 -->|"hit"| sh'],
				highlight: ['u2', 'e2'],
				note: 'Un deuxième utilisateur arrive au POP de Madrid, qui n’a pas de copie. Son miss part vers le shield, qui en a une : l’origine ne voit aucune requête. Sans shield, chaque POP enverrait son propre miss à l’origine.'
			},
			{
				add: ['o2["Origine : nouveaux prix publiés"] -.->|"aucun message au CDN"| e1', 'e1 -->|"ancienne /pricing jusqu’à la fin du TTL"| u1'],
				highlight: ['o2'],
				note: 'Les prix changent à 10 h 00. Un POP qui a stocké la page à 9 h 59 sert l’ancienne jusqu’à 10 h 59, sans interroger l’origine. Une purge d’URL ou de surrogate key la retire tout de suite. Une soft purge la marque périmée, la sert encore une fois, et va chercher la nouvelle page en arrière-plan.'
			},
			{
				add: ['a["Utilisateur connecté : GET /account"] --> e1', 'e1 -.->|"clé : URL + Host seulement"| b["L’utilisateur suivant reçoit le /account en cache"]'],
				highlight: ['a', 'b'],
				note: 'Si une page qui dépend du cookie de session est stockée sous l’URL et le Host seulement, la requête suivante pour cette URL reçoit la page du premier utilisateur. La fuite de Steam à Noël 2015 a eu ce résultat. Le VCL intégré de Varnish refuse de mettre ces requêtes en cache, sauf si ton VCL le modifie.'
			}
		]
	},
	example: {
		title: 'bin/varnishd/builtin.vcl : ce que Varnish met en cache, et sous quelle clé',
		repo: 'varnishcache/varnish-cache',
		url: `${BUILTIN}#L99-L312`,
		lang: 'text',
		code: `sub vcl_req_authorization {
	if (req.http.Authorization) {
		# Not cacheable by default.
		return (pass);
	}
}

sub vcl_req_cookie {
	if (req.http.Cookie) {
		# Risky to cache by default.
		return (pass);
	}
}
…
sub vcl_builtin_hash {
	hash_data(req.url);
	if (req.http.host) {
		hash_data(req.http.host);
	} else {
		hash_data(server.ip);
	}
}
…
sub vcl_beresp_cookie {
	if (beresp.http.Set-Cookie) {
		call vcl_beresp_hitmiss;
	}
}

sub vcl_beresp_control {
	if (beresp.http.Surrogate-control ~ "(?i)no-store" ||
	    (!beresp.http.Surrogate-Control &&
	      beresp.http.Cache-Control ~ "(?i:no-cache|no-store|private)")) {
		call vcl_beresp_hitmiss;
	}
}
…
sub vcl_beresp_hitmiss {
	set beresp.ttl = param.uncacheable_ttl;
	set beresp.uncacheable = true;
	return (deliver);
}`,
		notes: [
			'Les lignes 1 à 13 envoient toute requête avec un en-tête `Authorization` ou `Cookie` en `pass` : Varnish la demande au backend sans jamais chercher dans le cache. Le commentaire de la ligne 10 : "Risky to cache by default." (risqué à mettre en cache par défaut).',
			'Les lignes 15 à 22 forment la clé de cache par défaut : `req.url`, puis l’en-tête `Host`, ou l’IP du serveur sans `Host`. Un cookie, une langue ou un identifiant d’utilisateur ne changent la clé que si ton VCL les ajoute avec `hash_data`, ou si la réponse envoie `Vary`.',
			'Les lignes 24 à 36 tournent sur la réponse du backend. Un `Set-Cookie`, ou un `Cache-Control` avec `no-cache`, `no-store` ou `private`, appelle `vcl_beresp_hitmiss` (lignes 38 à 42), qui marque l’objet comme non cachable. Un en-tête `Surrogate-Control`, quand il est présent, prend ici le pas sur `Cache-Control`.',
			'La [doc de Varnish](' + VARNISH + '/doc/sphinx/users-guide/vcl-built-in-code.rst) montre comment couper la ligne 9 avec un `sub vcl_req_cookie { return; }` vide, quand "you can trust your backend to always specify whether a response is cacheable or not". Après ce changement, une page de compte qui oublie `Cache-Control: private` est mise en cache et servie au visiteur suivant.'
		]
	},
	tradeoff: {
		gain: [
			'Un hit est servi par le POP le plus proche, et l’origine ne voit jamais la requête.',
			'Un shield remplace un miss par POP par une seule requête à l’origine par objet. Fastly cite "Reduces origin load" et un meilleur taux de hit parmi ses effets.',
			'Un TTL long plus une purge à chaque mise à jour du contenu garde peu de trafic vers l’origine et des pages à jour. Fastly juge cette approche "particularly useful when combined with setting a very long TTL".'
		],
		cost: [
			'Mettre en cache une page construite pour un utilisateur connecté la sert aux autres : environ 34 000 utilisateurs de Steam exposés en 90 minutes.',
			'Sans purge, une page modifiée reste périmée jusqu’à la fin de son TTL sur chaque POP. Fastly limite les purges d’URL et de surrogate key à 100 000 par heure en moyenne par client.',
			'Avec un shield, le code du bord "typically executes twice", une fois au POP de bord et une fois au shield, ce qui peut doubler des en-têtes s’il n’est pas écrit pour les deux.'
		]
	},
	task: {
		prompt: 'Un serveur Varnish tourne avec le VCL intégré, sans modification. Pour chaque requête, dis si la réponse est mise en cache, et sous quelle clé : (a) `GET /pricing` sans cookie, réponse `Cache-Control: max-age=300`. (b) `GET /account` avec `Cookie: session=81f2`. (c) `GET /news` sans cookie, réponse `Cache-Control: max-age=60` et `Set-Cookie: ab=B`. (d) `GET /pricing?utm_source=mail` juste après (a).',
		hint: 'Côté requête : lignes 1 à 13. Clé : lignes 15 à 22. Côté réponse : lignes 24 à 36.',
		answer: [
			'(a) En cache pour 300 s, sous la clé `/pricing` plus l’en-tête `Host`. Aucune ligne du VCL intégré ne l’empêche.',
			'(b) Pas en cache. La ligne 9 voit l’en-tête `Cookie` et la ligne 11 renvoie `pass` : Varnish ne regarde même pas dans le cache.',
			'(c) Pas en cache. La ligne 25 voit `Set-Cookie` et appelle `vcl_beresp_hitmiss`, qui marque l’objet non cachable : chaque requête pour `/news` part au backend.',
			'(d) Un miss. `req.url` vaut `/pricing?utm_source=mail`, une clé différente de `/pricing` : Varnish va chercher et stocke une deuxième copie de la même page. Retire les paramètres de suivi de `req.url` dans `vcl_recv` pour partager une seule entrée.'
		]
	},
	quiz: [
		{
			q: 'Tu publies de nouveaux prix sur l’origine. Elle les a renvoyés au CDN avec `Surrogate-Control: max-age=3600`. Des utilisateurs voient encore les anciens prix 40 minutes plus tard. Qu’est-ce qui règle le problème tout de suite ?',
			options: [
				'Redémarrer l’origine, pour que le CDN prenne une copie neuve',
				'Attendre : le CDN vérifie l’origine une fois par minute',
				'Baisser `Cache-Control: max-age` sur les prochaines réponses',
				'Purger l’URL, ou sa surrogate key, sur le CDN'
			],
			answer: 3,
			why: 'Chaque POP garde sa copie pendant le TTL de `Surrogate-Control`, une heure ici, sans interroger l’origine. Une purge invalide l’objet en cache, et la requête suivante part vers l’origine. Changer les en-têtes des réponses futures ne touche pas les copies déjà stockées.'
		},
		{
			q: 'Avec la clé de cache par défaut de Fastly ou de Varnish, quelles requêtes partagent un même objet en cache ?',
			options: [
				'`/pricing` et `/pricing?utm_source=mail` sur le même hôte',
				'`/pricing` sur le même hôte, pour deux cookies différents',
				'`/pricing` sur `www.example.com` et sur `shop.example.com`',
				'`/Pricing` et `/pricing` sur le même hôte'
			],
			answer: 1,
			why: 'La clé par défaut est l’URL, chemin et query, plus l’en-tête `Host`. Les cookies n’en font pas partie, et c’est pour cela que Varnish refuse de cacher les requêtes qui en portent. Une query, un hôte ou une casse de chemin différents donnent une autre clé.'
		},
		{
			q: 'Tu actives un origin shield sur un CDN de 60 POP. Une nouvelle image est demandée une fois depuis chaque POP. Combien de requêtes arrivent à l’origine ?',
			options: [
				'60, une par POP, car chaque POP a son propre cache',
				'1, car chaque POP envoie son miss au shield POP',
				'0, car le shield précharge toutes les images depuis l’origine',
				'120, car chaque miss part à la fois au shield et à l’origine'
			],
			answer: 1,
			why: 'Avec un shield, chaque POP transmet ses miss à un seul shield POP. Le premier miss fait venir l’image de l’origine jusqu’au shield, et les 59 autres POP la reçoivent du shield. Sans shield, chacun des 60 POP interrogerait l’origine.'
		}
	],
	recall: {
		q: 'Quelle est la clé de cache par défaut de Fastly et de Varnish, et que fait le VCL intégré de Varnish d’une requête qui porte un en-tête `Cookie` ?',
		a: 'L’URL (chemin et query) plus l’en-tête `Host`. Varnish envoie une requête avec `Cookie` ou `Authorization` en `pass` : elle part au backend et n’est jamais mise en cache.'
	},
	sources: [
		{ title: 'Steam, Update on Christmas Issues (décembre 2015)', url: 'https://store.steampowered.com/news/19852/' },
		{ title: 'Source Varnish, bin/varnishd/builtin.vcl', url: 'https://github.com/varnishcache/varnish-cache/blob/0038dd19804fd92cd8bd4bfe92e5a515a57d5e8e/bin/varnishd/builtin.vcl' },
		{ title: 'Guide Varnish, Hashing', url: 'https://github.com/varnishcache/varnish-cache/blob/0038dd19804fd92cd8bd4bfe92e5a515a57d5e8e/doc/sphinx/users-guide/vcl-hashing.rst' },
		{ title: 'Guide Varnish, Achieving a high hitrate (Cache-Control, Vary)', url: 'https://github.com/varnishcache/varnish-cache/blob/0038dd19804fd92cd8bd4bfe92e5a515a57d5e8e/doc/sphinx/users-guide/increasing-your-hitrate.rst' },
		{ title: 'Doc Fastly, Shielding', url: 'https://www.fastly.com/documentation/guides/concepts/shielding/' },
		{ title: 'Doc Fastly, Purging', url: 'https://www.fastly.com/documentation/guides/concepts/edge-state/cache/purging/' },
		{ title: 'Doc Fastly, Cache freshness and TTLs', url: 'https://www.fastly.com/documentation/guides/concepts/edge-state/cache/cache-freshness/' },
		{ title: 'Doc Fastly, Caching (clé de cache)', url: 'https://www.fastly.com/documentation/guides/concepts/edge-state/cache/' }
	]
};
