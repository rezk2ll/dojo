const CORS = 'https://github.com/expressjs/cors/blob/5317ebe670db2aaebc1d496eb5d33493deefb3ed/lib/index.js';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'cors',
	part: 'HTTP et TLS',
	title: 'CORS',
	minutes: 10,
	hook: [
		'Un script sur `https://example.org` lance `fetch(\'https://nginx.org/en/docs/\')`. Dans Chrome, piloté par Playwright pour ce chapitre, la console affiche : `Access to fetch at \'https://nginx.org/en/docs/\' from origin \'https://example.org\' has been blocked by CORS policy: No \'Access-Control-Allow-Origin\' header is present on the requested resource.` Le script, lui, ne reçoit que `TypeError: Failed to fetch`.',
		'Depuis un terminal, `curl -si https://nginx.org/en/docs/ -H "Origin: https://example.org"` renvoie `HTTP/1.1 200 OK` et la page. curl ne vérifie pas les en-têtes CORS. Le navigateur, si, et MDN précise que « specifics about the error are not available to JavaScript » : le script ne voit pas la raison.',
		'Le même script récupère ensuite `https://api.github.com/repos/expressjs/cors` et obtient un `200` qu’il peut lire. La réponse de GitHub porte `access-control-allow-origin: *`.'
	],
	terms: [
		{ term: 'Origine', def: 'Le schéma, l’hôte et le port d’une page, comme `https://example.org`. Le navigateur l’envoie dans l’en-tête `Origin` d’une requête vers une autre origine.' },
		{ term: 'Same-origin policy', def: 'La règle du navigateur : un script ne lit que les réponses de sa propre origine, sauf si l’autre serveur l’autorise avec des en-têtes CORS.' },
		{ term: 'Preflight', def: 'Une requête `OPTIONS` que le navigateur envoie avant une requête non CORS-safelisted, avec `Access-Control-Request-Method` et `Access-Control-Request-Headers`.' },
		{ term: 'Méthode CORS-safelisted', def: 'La liste du standard Fetch : `GET`, `HEAD` ou `POST`. Les autres méthodes demandent un preflight.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['page["Script sur https://example.org"] -->|"GET, Origin: https://example.org"| api["api.github.com"]'],
				highlight: ['page', 'api'],
				note: '`GET` est une méthode CORS-safelisted et le script n’ajoute aucun en-tête, donc le navigateur envoie la requête tout de suite. Il ajoute lui-même `Origin: https://example.org`.'
			},
			{
				add: ['api -->|"200, access-control-allow-origin: *"| page'],
				highlight: ['api'],
				note: 'Quand la réponse arrive, le navigateur fait le contrôle CORS. `*` autorise toutes les origines pour une requête sans credentials : le script peut lire le corps.'
			},
			{
				add: ['page -.->|"OPTIONS, Access-Control-Request-Method: PUT, Access-Control-Request-Headers: content-type"| api'],
				highlight: ['page'],
				note: 'Le script envoie maintenant un `PUT` avec `Content-Type: application/json`. `PUT` n’est pas safelisted, et `application/json` ne fait pas partie des trois types autorisés. Le navigateur envoie d’abord un preflight `OPTIONS` et garde le `PUT` en attente.'
			},
			{
				add: ['api -.->|"204, allow-methods : GET, POST, PATCH, PUT, DELETE, max-age : 86400"| page', 'page -->|"PUT /repos/expressjs/cors"| api'],
				highlight: ['api'],
				note: 'GitHub répond `204` et cite `PUT` dans `access-control-allow-methods`. Le navigateur envoie alors le vrai `PUT`, qui a reçu un `404` pendant la capture. `access-control-max-age: 86400` permet de garder cette réponse jusqu’à un jour ; sans cet en-tête, le standard Fetch fixe 5 secondes.'
			},
			{
				add: ['page -.->|"GET avec l’en-tête X-Debug: 1"| block["Bloqué après le preflight : x-debug refusé"]'],
				highlight: ['block'],
				note: '`X-Debug` n’est pas un en-tête safelisted, donc ce `GET` demande lui aussi un preflight. `access-control-allow-headers` chez GitHub ne le cite pas. Chrome a écrit `Request header field x-debug is not allowed by Access-Control-Allow-Headers in preflight response`, et d’après le standard Fetch le `GET` n’est jamais envoyé.'
			}
		]
	},
	example: {
		title: 'expressjs/cors lib/index.js : les en-têtes que pose le middleware',
		repo: 'expressjs/cors',
		url: `${CORS}#L8-L189`,
		lang: 'js',
		code: `  var defaults = {
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    preflightContinue: false,
    optionsSuccessStatus: 204
  };
…
    if (!options.origin || options.origin === '*') {
      // allow any origin
      headers.push([{
        key: 'Access-Control-Allow-Origin',
        value: '*'
      }]);
…
    } else {
      isAllowed = isOriginAllowed(requestOrigin, options.origin);
      // reflect origin
      headers.push([{
        key: 'Access-Control-Allow-Origin',
        value: isAllowed ? requestOrigin : false
      }]);
      headers.push([{
        key: 'Vary',
        value: 'Origin'
      }]);
    }
…
    if (method === 'OPTIONS') {
      // preflight
      headers.push(configureOrigin(options, req));
      headers.push(configureCredentials(options))
      headers.push(configureMethods(options))
      headers.push(configureAllowedHeaders(options, req));
      headers.push(configureMaxAge(options))
      headers.push(configureExposedHeaders(options))
      applyHeaders(headers, res);

      if (options.preflightContinue) {
        next();
      } else {
        // Safari (and potentially other browsers) need content-length 0,
        //   for 204 or they just hang waiting for a body
        res.statusCode = options.optionsSuccessStatus;
        res.setHeader('Content-Length', '0');
        res.end();
      }
    } else {
      // actual response
      headers.push(configureOrigin(options, req));
      headers.push(configureCredentials(options))
      headers.push(configureExposedHeaders(options))
      applyHeaders(headers, res);
      next();
    }`,
		notes: [
			'La ligne 2 met l’origine par défaut à `*`. Avec `app.use(cors())` sans options, les lignes 8 à 13 ajoutent `Access-Control-Allow-Origin: *` à chaque réponse.',
			'La ligne 20 s’applique quand `origin` est une liste, une RegExp ou une fonction : le middleware renvoie l’`Origin` de la requête s’il est autorisé, et `false` sinon. `applyHeaders` saute une valeur `false` : une origine refusée ne reçoit aucun en-tête et le navigateur bloque la réponse. Les lignes 22 à 25 ajoutent `Vary: Origin`, pour qu’un cache partagé garde une copie par origine.',
			'Les lignes 28 à 45 répondent au preflight dans le middleware : statut `204`, `Content-Length: 0`, et le handler de la route ne tourne pas. La ligne 33 appelle [`configureAllowedHeaders`](' + CORS + '#L94-L115), qui recopie `Access-Control-Request-Headers` quand l’option `allowedHeaders` est absente.',
			'La ligne 53 appelle `next()` pour chaque vraie requête, origine autorisée ou pas. La route s’exécute et le serveur envoie sa réponse. Seul le navigateur décide si le script peut la lire.'
		]
	},
	tradeoff: {
		gain: [
			'Un script d’un autre site ne peut pas lire les réponses de ton API avec les cookies de l’utilisateur, sauf si la réponse cite exactement cette origine et envoie `Access-Control-Allow-Credentials: true`. Le standard Fetch interdit `*` pour les requêtes avec credentials.',
			'Un seul preflight peut couvrir beaucoup de requêtes : `access-control-max-age: 86400` chez GitHub permet au navigateur de réutiliser la réponse jusqu’à un jour.'
		],
		cost: [
			'Une requête non safelisted coûte un aller-retour de plus, l’`OPTIONS`, quand le navigateur n’a pas de réponse en cache. La durée de cache par défaut est de 5 secondes.',
			'CORS n’empêche pas une requête safelisted d’atteindre le serveur. Le navigateur l’envoie, puis regarde les en-têtes de la réponse. Un `POST` en `Content-Type: text/plain` fait tourner ton handler même si le script ne peut pas lire la réponse.',
			'Le script ne voit pas l’erreur : `fetch` lève `TypeError: Failed to fetch`, et la raison n’apparaît que dans la console du navigateur.'
		]
	},
	task: {
		prompt: 'Ton appli sur `https://app.example.com` appelle `fetch(\'https://api.example.com/orders\', { method: \'POST\', credentials: \'include\', headers: { \'Content-Type\': \'application/json\' }, body })`. L’API tourne sous Express avec `app.use(cors())`, sans options. La commande ne s’affiche jamais et la console signale une erreur CORS. D’après le code du middleware ci-dessus, quel en-tête fait échouer la requête, et quel est l’appel `cors(...)` corrigé ?',
		hint: 'Regarde l’`origin` par défaut ligne 2. Puis regarde ce que dit le standard Fetch de `*` quand la requête envoie des credentials.',
		answer: [
			'Sans options, `origin` vaut `*` : le preflight et la réponse au `POST` portent `Access-Control-Allow-Origin: *`. La requête utilise `credentials: \'include\'`, et le standard Fetch dit « `*` is not allowed when credentials are involved ». Le navigateur rejette la réponse.',
			'Il manque aussi `Access-Control-Allow-Credentials` : `configureCredentials` ne le pose que si `credentials === true`.',
			'Correction : `app.use(cors({ origin: \'https://app.example.com\', credentials: true }))`. Le middleware envoie alors `Access-Control-Allow-Origin: https://app.example.com`, `Vary: Origin` et `Access-Control-Allow-Credentials: true`. `POST` fait partie des méthodes par défaut, et `Content-Type` est recopié depuis le preflight.'
		]
	},
	quiz: [
		{
			q: '`curl https://api.example.com/data` renvoie le JSON. Le même `fetch` depuis ta page sur une autre origine échoue avec une erreur CORS. Pourquoi ?',
			options: [
				'curl envoie un certificat client TLS valide, et le navigateur non',
				'Le navigateur applique CORS à la réponse ; curl ignore ces en-têtes',
				'Le serveur bloque toute requête dont le `User-Agent` cite un navigateur',
				'curl repasse en HTTP/1.1, et CORS ne vaut que pour HTTP/2'
			],
			answer: 1,
			why: 'La same-origin policy vit dans le navigateur. Le serveur a envoyé la même réponse aux deux clients, mais le navigateur n’y a pas trouvé d’`Access-Control-Allow-Origin` pour ton origine et l’a cachée au script. curl ne fait pas ce contrôle.'
		},
		{
			q: 'Lequel de ces appels `fetch` fait envoyer d’abord un preflight `OPTIONS` ?',
			options: [
				'Un `GET` avec les seuls en-têtes par défaut',
				'Un `POST` avec `Content-Type: text/plain`',
				'Un `POST` avec `Content-Type: application/json`',
				'Un `HEAD` avec `Accept-Language: fr`'
			],
			answer: 2,
			why: '`Content-Type` n’est safelisted que pour `application/x-www-form-urlencoded`, `multipart/form-data` et `text/plain`. `application/json` sort de cette liste, donc le navigateur vérifie avec un preflight avant d’envoyer le `POST`.'
		},
		{
			q: 'Une API Express utilise `cors({ origin: [\'https://app.example.com\'] })`. Une requête arrive avec `Origin: https://evil.example`. Que fait le serveur ?',
			options: [
				'Il renvoie `403` avant que le handler de la route tourne',
				'Il exécute la route et répond sans `Access-Control-Allow-Origin`',
				'Il coupe la connexion TCP sans envoyer de réponse',
				'Il renvoie `Access-Control-Allow-Origin: https://evil.example`'
			],
			answer: 1,
			why: '`isOriginAllowed` renvoie false, donc la valeur de l’en-tête est `false` et `applyHeaders` la saute. Le middleware appelle quand même `next()`, et la route tourne. Le navigateur empêche ensuite le script de lire la réponse.'
		}
	],
	recall: {
		q: 'Un navigateur bloque un `fetch` vers une autre origine que curl termine sans souci. Qui applique CORS, et quel en-tête de réponse doit citer ton origine quand la requête envoie des cookies ?',
		a: 'Le navigateur, après l’arrivée de la réponse ; le serveur exécute quand même la requête. Avec credentials, la réponse doit porter `Access-Control-Allow-Origin: https://ton.origine` (pas `*`) et `Access-Control-Allow-Credentials: true`.'
	},
	sources: [
		{ title: 'Standard Fetch, 3.3 CORS protocol', url: 'https://fetch.spec.whatwg.org/#http-cors-protocol' },
		{ title: 'MDN, Cross-Origin Resource Sharing (CORS)', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS' },
		{ title: 'expressjs/cors, lib/index.js', url: CORS }
	]
};
