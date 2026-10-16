/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'caching-news',
	part: 'Architecture',
	title: 'Mettre en cache un site d’actualité',
	minutes: 10,
	hook: [
		'21 h 02. Une ministre démissionne. La rédaction publie un court article à 21 h 03 et le place en haut de la une. En moins d’une minute, 50 000 personnes par seconde chargent cette une.',
		'Le CMS met 150 ms à construire une page et tourne sur 6 serveurs. Sans cache, ces 6 serveurs devraient construire 50 000 pages par seconde.',
		'Avec un cache qui garde les pages une heure, les serveurs ne font presque rien, mais les lecteurs voient l’ancienne une jusqu’à 22 h. La rédactrice en chef veut les nouveaux articles à l’écran en moins de 30 secondes.'
	],
	terms: [
		{ term: 'TTL', def: 'Time to live : le nombre de secondes pendant lequel un cache sert une page stockée avant de la considérer comme périmée.' },
		{ term: 'Grace', def: 'Dans Varnish, un délai après le TTL pendant lequel le cache sert encore la page périmée, le temps d’en chercher une nouvelle en arrière-plan.' },
		{ term: 'Request coalescing', def: 'Quand beaucoup de clients demandent la même page absente, le cache envoie une seule requête au backend et fait attendre les autres jusqu’à la réponse.' },
		{ term: 'Origine', def: 'Les serveurs qui construisent les pages, ici les 6 serveurs du CMS derrière le cache.' }
	],
	kata: {
		brief: [
			'Un site d’actualité a 10 millions de lecteurs par jour. Un soir de dernière minute, les requêtes HTML montent à 50 000 par seconde. Environ 500 URL (la une, les rubriques et les articles récents) reçoivent presque tout ce trafic.',
			'Le CMS construit une page en 150 ms. Il y a 6 serveurs CMS. Les images, le CSS et le JS ont des noms de fichiers versionnés et passent déjà par un CDN avec un cache d’un an.',
			'Un article nouveau ou modifié doit être visible par tous les lecteurs moins de 30 secondes après le clic de l’éditeur sur Publier. Environ 3 % des lecteurs sont des abonnés connectés, qui voient leur nom dans l’en-tête.',
			'Conçois le cache HTML : où il se place, combien de temps il garde une page, comment la promesse des 30 secondes tient, et ce que voient les lecteurs quand le CMS est en panne.'
		],
		minutes: 10,
		checklist: [
			'Ton design donne l’âge maximal d’une page en cache, en secondes, et il est sous 30.',
			'Ton design compte les deux caches : le cache partagé et le navigateur du lecteur.',
			'Ton design donne le nombre de requêtes par seconde qui arrivent au CMS au pic, calculé à partir des 500 URL chaudes.',
			'Ton design dit ce qui se passe quand 10 000 lecteurs demandent la même page expirée dans la même seconde.',
			'Ton design dit ce que voient les lecteurs quand les 6 serveurs CMS renvoient des erreurs.',
			'Ton design dit comment le nom d’un abonné arrive dans l’en-tête sans une copie en cache par abonné.'
		],
		sample: [
			'Place 8 serveurs Varnish entre les lecteurs et le CMS. Le CMS envoie `Cache-Control: max-age=15` sur chaque page HTML. Varnish calcule le TTL à partir de `max-age`, et ajoute un en-tête `Age` qui dit depuis combien de temps il garde la page.',
			'Dans le VCL, mets `beresp.grace = 10s`. Une requête qui arrive après les 15 s de TTL reçoit tout de suite la page périmée, et Varnish va chercher une nouvelle copie en arrière-plan. Varnish ne sert donc jamais une page construite il y a plus de 15 + 10 = 25 secondes, plus les 150 ms du chargement.',
			'Le navigateur compte `max-age` depuis la construction de la page par le CMS, et retire la valeur de `Age`. Une page restée 12 s dans Varnish reste fraîche 3 s dans le navigateur. Le navigateur n’ajoute donc rien aux 25 secondes.',
			'Varnish envoie une seule requête au backend par page expirée et fait attendre les autres requêtes pour cette page : la doc Varnish appelle ça le request coalescing. Chaque serveur Varnish recharge chaque URL chaude au plus une fois toutes les 15 s : 8 × 500 / 15 ≈ 267 requêtes par seconde arrivent au CMS. À 150 ms chacune, ça occupe environ 40 workers CMS, répartis sur 6 serveurs.',
			'Pour une panne, reprends le schéma de la doc Varnish : mets `beresp.grace = 24h`, et dans `vcl_recv` mets `req.grace = 10s` quand `std.healthy(req.backend_hint)` est vrai. Avec un CMS en bonne santé, la grace reste à 10 s. Avec un CMS malade, les lecteurs reçoivent des pages vieilles d’un jour au plus, à la place d’erreurs.',
			'Par défaut, Varnish contourne le cache quand la requête porte un en-tête `Cookie`, et ne stocke pas une réponse avec `Set-Cookie`. `vcl_recv` retire donc `req.http.Cookie` sur toutes les URL sauf `/me`, comme l’exemple `/admin/` de la doc Varnish. Chaque lecteur reçoit le même HTML en cache. Un script de l’en-tête charge ensuite le nom de l’abonné depuis `/me`, qui va jusqu’au CMS.',
			'Le prix à payer : un titre faux reste lui aussi jusqu’à 25 secondes après la correction, car ce design ne purge rien au clic sur Publier. Une purge ramènerait ce délai presque à zéro, mais chaque publication devrait alors atteindre les 8 serveurs Varnish. Les appels à `/me` ne passent pas non plus par le cache : 3 % de 50 000 font 1 500 par seconde, donc `/me` doit coûter bien moins qu’une page à 150 ms.'
		]
	},
	quiz: [],
	recall: {
		q: 'Avec `max-age=15` et une grace de 10 secondes, quel âge peut avoir la une, et combien de requêtes par seconde arrivent au CMS au pic ?',
		a: '25 secondes au plus (15 s de TTL et 10 s de grace). Environ 267 requêtes par seconde : 8 serveurs Varnish × 500 URL chaudes / 15 s.'
	},
	sources: [
		{ title: 'Varnish, Grace mode and keep', url: 'https://www.varnish.org/docs/users-guide/vcl-grace/' },
		{ title: 'Varnish, Achieving a high hitrate (Cache-Control, Age, cookies)', url: 'https://www.varnish.org/docs/users-guide/increasing-your-hitrate/' },
		{ title: 'MDN, Cache-Control (max-age et l’en-tête Age)', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control' }
	]
};
