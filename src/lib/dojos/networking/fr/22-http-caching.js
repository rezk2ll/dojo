const NGINX = 'https://github.com/nginx/nginx/blob/1725db9059e8d4057ce8d5090673d16e20713b45/src/http/ngx_http_upstream.c';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'http-caching',
	part: 'HTTP et TLS',
	title: 'Le cache HTTP',
	minutes: 10,
	hook: [
		'25 décembre 2015, Steam Store. Entre 11:50 et 13:20 PST, selon Valve, des requêtes de pages pour environ 34k utilisateurs « may have been returned and seen by other users » : d’autres utilisateurs ont pu les voir. Certaines pages montraient une adresse de facturation, un historique d’achats ou les deux derniers chiffres d’une carte bancaire.',
		'Le Store subissait une attaque DoS, avec un trafic 2000 % au-dessus de la moyenne des soldes Steam. Un prestataire de cache web a déployé des règles de cache pour l’absorber. La deuxième configuration « incorrectly cached web traffic for authenticated users ». Un cache partagé a stocké une page construite pour un utilisateur connecté et l’a servie au suivant qui demandait la même URL.',
		'HTTP permet à l’origine de marquer une réponse comme réservée à un seul utilisateur : `Cache-Control: private` signifie « a shared cache MUST NOT store the response ». Une configuration de cache peut passer outre. Dans nginx, `proxy_ignore_headers Cache-Control Set-Cookie` fait ignorer ces deux en-têtes au cache.'
	],
	terms: [
		{ term: 'Cache partagé', def: 'Un cache qui sert beaucoup d’utilisateurs : un nœud de CDN, ou nginx avec `proxy_cache`. Une page qu’il stocke peut partir chez quiconque demande la même clé de cache.' },
		{ term: 'Cache privé', def: 'Un cache utilisé par un seul utilisateur, comme le cache disque du navigateur. `Cache-Control: private` autorise ce cache et interdit les caches partagés.' },
		{ term: 'Clé de cache', def: 'Ce qu’un cache utilise pour retrouver une réponse stockée. RFC 9111 fixe le minimum à la méthode et l’URI. Dans nginx, la valeur par défaut est `$scheme$proxy_host$request_uri`.' },
		{ term: 'ETag', def: 'Un validateur : une chaîne opaque que l’origine envoie avec la réponse, comme `"6acfc371-36ae"`. Le cache la renvoie dans `If-None-Match` pour demander si sa copie est encore à jour.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['u1["Utilisateur A : GET /en/docs/"] --> c["nginx proxy_cache"]', 'c -->|"miss"| o["Origine"]'],
				highlight: ['u1', 'c'],
				note: 'nginx construit la clé `$scheme$proxy_host$request_uri`, ne trouve rien et transmet la requête. Ni le cookie ni l’utilisateur ne font partie de la clé par défaut.'
			},
			{
				add: ['o -->|"200, Cache-Control: max-age=60, ETag 6acfc371-36ae, 13998 octets"| c'],
				highlight: ['o'],
				note: 'L’origine envoie 13998 octets avec `Cache-Control: max-age=60`. nginx stocke la réponse et la marque valide jusqu’à maintenant + 60 secondes. RFC 9111 : la réponse est fraîche tant que « freshness_lifetime > current_age ».'
			},
			{
				add: ['u2["Utilisateur B, 20 s plus tard : GET /en/docs/"] -->|"hit"| c'],
				highlight: ['u2'],
				note: 'Même clé, âge 20 secondes, durée de vie 60 : la copie est fraîche. nginx répond depuis le disque et l’origine ne voit passer aucune requête. L’utilisateur B reçoit les octets que l’origine a produits pour A.'
			},
			{
				add: ['c -.->|"90 s plus tard : If-None-Match 6acfc371-36ae"| o', 'o -.->|"304 Not Modified, sans corps"| c'],
				highlight: ['c', 'o'],
				note: 'À 90 secondes, la copie est périmée. Avec `proxy_cache_revalidate on`, nginx envoie une requête conditionnelle avec `If-None-Match`. L’origine répond `304 Not Modified`, en-têtes seuls, et nginx ressert ses 13998 octets stockés.'
			},
			{
				add: ['acc["GET /account"] --> c', 'c -->|"Cache-Control: private : jamais stocké"| o'],
				highlight: ['acc'],
				note: 'L’origine marque `/account` avec `Cache-Control: private`, ou envoie un `Set-Cookie`. nginx ne stocke aucune de ces réponses : la requête de chaque utilisateur part vers l’origine. Le navigateur peut quand même garder sa propre copie privée.'
			}
		]
	},
	example: {
		title: 'src/http/ngx_http_upstream.c : comment nginx lit le Cache-Control de l’origine',
		repo: 'nginx/nginx',
		url: `${NGINX}#L5101-L5168`,
		lang: 'c',
		code: `static ngx_int_t
ngx_http_upstream_process_cache_control(ngx_http_request_t *r,
    ngx_table_elt_t *h, ngx_uint_t offset)
{
…
#if (NGX_HTTP_CACHE)
    {
    u_char     *p, *start, *last;
    ngx_int_t   n;

    if (u->conf->ignore_headers & NGX_HTTP_UPSTREAM_IGN_CACHE_CONTROL) {
        return NGX_OK;
    }

    if (r->cache == NULL) {
        return NGX_OK;
    }

    start = h->value.data;
    last = start + h->value.len;

    if (r->cache->valid_sec != 0 && u->headers_in.x_accel_expires != NULL) {
        goto extensions;
    }

    if (ngx_strlcasestrn(start, last, (u_char *) "no-cache", 8 - 1) != NULL
        || ngx_strlcasestrn(start, last, (u_char *) "no-store", 8 - 1) != NULL
        || ngx_strlcasestrn(start, last, (u_char *) "private", 7 - 1) != NULL)
    {
        u->headers_in.no_cache = 1;
        return NGX_OK;
    }

    p = ngx_strlcasestrn(start, last, (u_char *) "s-maxage=", 9 - 1);
    offset = 9;

    if (p == NULL) {
        p = ngx_strlcasestrn(start, last, (u_char *) "max-age=", 8 - 1);
        offset = 8;
    }

    if (p) {
        n = ngx_http_upstream_process_delta_seconds(p + offset, last);

        if (n == NGX_ERROR) {
            u->cacheable = 0;
            return NGX_OK;
        }

        if (n == 0) {
            u->headers_in.no_cache = 1;
            return NGX_OK;
        }

        r->cache->valid_sec = ngx_min((ngx_uint_t) ngx_time() + n,
                                      NGX_MAX_INT_T_VALUE);
        u->headers_in.expired = 0;
    }`,
		notes: [
			'La ligne 11 sort avant de lire la moindre directive quand la config contient `proxy_ignore_headers Cache-Control`. Dès lors, un `private` envoyé par l’origine n’a plus aucun effet sur ce cache.',
			'Les lignes 26 à 28 cherchent `no-cache`, `no-store` ou `private` dans la valeur de l’en-tête. Une seule suffit à poser `no_cache` ligne 30, que le code transforme plus loin en `u->cacheable = 0` : la réponse n’est pas stockée.',
			'La ligne 34 cherche d’abord `s-maxage=`, et la ligne 38 se rabat sur `max-age=`. RFC 9111 impose le même ordre à un cache partagé. Avec `Cache-Control: max-age=600, s-maxage=60`, le navigateur garde la copie 600 secondes et nginx 60 secondes.',
			'La ligne 50 traite `max-age=0` comme `no-cache`. La ligne 55 fixe l’expiration à l’heure courante plus le nombre de secondes.',
			'Un en-tête `Set-Cookie` bloque aussi le cache : [`ngx_http_upstream_process_set_cookie`](' + NGINX + '#L5091-L5095) pose `u->cacheable = 0`, sauf si `proxy_ignore_headers Set-Cookie` est configuré.'
		]
	},
	tradeoff: {
		gain: [
			'Un hit sur une copie fraîche n’atteint jamais l’origine : pendant `max-age`, l’origine sert une requête par clé de cache. Valve a déployé des règles de cache « to both minimize the impact on Steam Store servers and continue to route legitimate user traffic ».',
			'La revalidation de `nginx.org/en/docs/` ne transporte que des en-têtes. La page fait 13998 octets, et le `304 Not Modified` renvoyé à une requête `If-None-Match` n’avait pas de corps.'
		],
		cost: [
			'Une seule règle fausse dans un cache partagé envoie des pages personnelles à des inconnus : environ 34k utilisateurs Steam en 90 minutes.',
			'Une page modifiée à l’origine reste ancienne dans chaque cache jusqu’à la fin de son `max-age`. Sans `Cache-Control` ni `Expires`, RFC 9111 autorise une heuristique, « typiquement » 10 % du temps écoulé depuis `Last-Modified`.',
			'La clé par défaut de nginx ne contient aucun cookie. Les pages personnelles restent hors du cache seulement si l’origine envoie `private`, `no-store` ou `Set-Cookie`, ou si la config ajoute `proxy_no_cache`.'
		]
	},
	task: {
		prompt: 'Vraie sortie de `curl -sI https://nginx.org/en/docs/`, capturée pour ce chapitre : `HTTP/1.1 200 OK`, `Date: Fri, 16 Oct 2026 23:54:57 GMT`, `Last-Modified: Wed, 14 Oct 2026 18:01:21 GMT`, `ETag: "6acfc371-36ae"`, `Content-Length: 13998`. La réponse n’a ni `Cache-Control` ni `Expires`. (1) Combien de temps un cache partagé qui applique l’heuristique typique de 10 % de RFC 9111 peut-il réutiliser cette réponse sans demander à l’origine ? (2) Qu’envoie-t-il ensuite, et que reçoit-il si la page n’a pas changé ?',
		hint: 'Compte les secondes entre `Last-Modified` et `Date`, puis prends 10 %. Pour (2), le cache renvoie l’`ETag`.',
		answer: [
			'Du 14 octobre 18:01:21 au 16 octobre 23:54:57, il y a 53 h 53 min 36 s, soit 194016 secondes. 10 % font environ 19402 secondes : la réponse reste fraîche environ 5 h 23 min. Un 200 est « heuristically cacheable » selon RFC 9110, donc l’heuristique s’applique.',
			'Ensuite, le cache envoie `GET /en/docs/` avec `If-None-Match: "6acfc371-36ae"`. Pendant la capture, le serveur a répondu `HTTP/1.1 304 Not Modified` avec le même `ETag` et sans corps : le cache réutilise ses 13998 octets et remet l’âge à zéro.',
			'Si l’équipe publie une correction juste après le stockage, les lecteurs derrière ce cache peuvent voir l’ancienne page jusqu’à 5 h 23 min. Un `Cache-Control: max-age=300` envoyé par l’origine limiterait ça à 5 minutes.'
		],
		steps: [
			{
				title: 'Lis les en-têtes',
				questions: [
					{ q: 'Quels en-têtes donneraient à cette réponse une durée de vie explicite ?', options: ['`Cache-Control` ou `Expires`, et aucun n’est là', '`ETag`, qui contient la durée en hexadécimal', '`Content-Length`, lu comme un nombre de secondes', '`Date`, qui marque l’expiration de la copie'], answer: 0, why: 'Une durée de vie explicite vient de `Cache-Control` ou d’`Expires`. Cette réponse n’a ni l’un ni l’autre, le cache doit donc recourir à une heuristique.' },
					{ q: 'Sans durée de vie explicite, un cache partagé peut-il réutiliser ce 200 ?', options: ['Non : sans `Cache-Control`, rien ne peut être stocké', 'Oui : un 200 est « heuristically cacheable », donc une heuristique s’applique', 'Seulement si le client a demandé avec `Cache-Control: max-age`', 'Seul le navigateur le peut, jamais un cache partagé'], answer: 1, why: 'RFC 9110 classe le 200 comme cacheable par heuristique. RFC 9111 laisse alors le cache choisir une durée lui-même.' },
					{ q: 'Quels deux en-têtes l’heuristique des 10 % utilise-t-elle ?', options: ['`ETag` et `Content-Length`', '`Date` et `ETag`', '`Last-Modified` et `Date`', '`Content-Length` et `Last-Modified`'], answer: 2, why: 'L’heuristique prend 10 % du temps écoulé depuis `Last-Modified`, compté jusqu’à `Date`, le moment où la réponse a été produite.' },
					{ q: 'À quoi sert `ETag: "6acfc371-36ae"` ?', options: ['C’est la clé de cache que nginx utilise pour cette URL', 'C’est une somme de contrôle que le navigateur vérifie avant l’affichage', 'C’est le nombre de secondes pendant lesquelles la page reste fraîche', 'C’est un validateur que le cache renvoie pour savoir si sa copie est à jour'], answer: 3, why: 'Un ETag est une chaîne opaque. Le cache la renvoie dans `If-None-Match`, et l’origine la compare à la sienne.' }
				]
			},
			{
				title: 'Calcule la durée de vie',
				questions: [
					{ q: 'Combien de temps s’est écoulé entre `Last-Modified` et `Date` ?', options: ['53 h 53 min 36 s, soit 194016 secondes', '48 h pile, soit 172800 secondes', '5 h 23 min, soit environ 19402 secondes', '54 h, soit 194400 secondes'], answer: 0, why: 'Du 14 octobre 18:01:21 au 16 octobre 23:54:57, il y a deux jours, 5 h 53 min 36 s : 194016 secondes.' },
					{ q: 'Combien font 10 % de cette durée ?', options: ['Environ 1940 secondes, 32 minutes', 'Environ 19402 secondes, 5 h 23 min', 'Environ 194016 secondes, deux jours', 'Environ 600 secondes, 10 minutes'], answer: 1, why: '194016 / 10 font environ 19402 secondes, un peu plus de 5 h 23 min.' },
					{ q: 'Le cache a stocké la copie à l’heure de `Date`. Jusqu’à quand environ peut-il la réutiliser sans demander ?', options: ['Jusqu’au 16 octobre 23:59:57, cinq minutes plus tard', 'Jusqu’au 18 octobre 18:01, quatre jours après `Last-Modified`', 'Tant que l’ETag ne change pas', 'Jusqu’au 17 octobre vers 05:18, 5 h 23 min plus tard'], answer: 3, why: 'La copie est fraîche tant que son âge reste sous la durée de vie : 23:54:57 plus environ 5 h 23 min.' },
					{ q: 'Les 10 % sont-ils une règle fixe ?', options: ['Oui : RFC 9111 impose exactement 10 % pour toute réponse', 'Non : RFC 9111 autorise une heuristique et qualifie 10 % de « typical »', 'Oui : tous les navigateurs et CDN utilisent 10 %', 'Non : l’origine fixe le pourcentage dans l’`ETag`'], answer: 1, why: 'RFC 9111 autorise une durée de vie heuristique et donne 10 % du temps depuis `Last-Modified` comme valeur typique.' }
				]
			},
			{
				title: 'Revalide',
				questions: [
					{ q: 'Après environ 5 h 23 min, la copie est périmée. Qu’envoie le cache ?', options: ['`GET /en/docs/` avec `If-None-Match: "6acfc371-36ae"`', '`HEAD /en/docs/` avec `Cache-Control: no-cache`', 'Rien : il sert la copie périmée jusqu’à son éviction', '`GET /en/docs/` avec `ETag` placé en en-tête de requête'], answer: 0, why: 'Une copie périmée qui a un validateur se vérifie par une requête conditionnelle. Le validateur voyage dans `If-None-Match`.' },
					{ q: 'La page n’a pas changé. Que répond l’origine ?', options: ['`200 OK` avec les 13998 octets complets', '`304 Not Modified` avec le même `ETag` et sans corps', '`412 Precondition Failed` sans corps', '`204 No Content` avec un nouvel `ETag`'], answer: 1, why: 'Pendant la capture, le serveur a répondu `HTTP/1.1 304 Not Modified`, même `ETag`, sans corps.' },
					{ q: 'Que fait le cache de ce 304 ?', options: ['Il jette sa copie et récupère la page à nouveau', 'Il transmet le corps vide du 304 à l’utilisateur', 'Il réutilise ses 13998 octets stockés et remet l’âge à zéro', 'Il garde la copie, mais la marque périmée pour de bon'], answer: 2, why: 'Un 304 dit que la copie stockée est encore à jour : le cache la sert de nouveau et son âge repart de zéro.' },
					{ q: 'Qu’économise la revalidation par rapport à un téléchargement complet ?', options: ['Le corps : seuls les en-têtes circulent', 'La connexion TCP : aucun paquet n’est envoyé', 'Rien : l’origine envoie le corps quand même', 'La résolution DNS, et rien d’autre'], answer: 0, why: 'Le 304 ne contient que des en-têtes. La page de 13998 octets ne retraverse pas le réseau.' }
				]
			},
			{
				title: 'Pèse le risque',
				questions: [
					{ q: 'L’équipe publie une correction juste après le stockage. Combien de temps les lecteurs derrière ce cache peuvent-ils voir l’ancienne page ?', options: ['Jusqu’à 10 minutes', 'Pas du tout : l’ETag change tout de suite', 'Jusqu’à 5 h 23 min', 'Jusqu’à 53 h, tout le temps depuis `Last-Modified`'], answer: 2, why: 'Le cache ne demande rien à l’origine avant la fin de la durée heuristique. Un nouvel ETag à l’origine n’est vu qu’à la revalidation.' },
					{ q: 'Quel en-tête envoyé par l’origine limiterait ça à 5 minutes ?', options: ['`Cache-Control: private`', '`ETag: "300"`', '`Last-Modified` fixé à il y a cinq minutes', '`Cache-Control: max-age=300`'], answer: 3, why: 'Un `max-age` explicite remplace l’heuristique. 300 secondes font 5 minutes.' },
					{ q: 'Quelqu’un propose `Cache-Control: private` sur la page de docs. Qu’est-ce que ça ferait ?', options: ['Baisser l’heuristique de 10 % à 1 %', 'Empêcher tout cache partagé de stocker une page publique', 'Forcer le cache à revalider toutes les 5 minutes', 'Rien : les caches partagés ignorent `private`'], answer: 1, why: '`private` veut dire qu’un cache partagé ne doit pas stocker la réponse. C’est juste pour `/account`, et du gâchis pour une page de docs publique.' },
					{ q: 'Dans nginx, quelle directive fait revalider une copie périmée avec `If-None-Match` au lieu d’un téléchargement complet ?', options: ['`proxy_ignore_headers Cache-Control`', '`proxy_cache_key $request_uri`', '`proxy_cache_revalidate on`', '`proxy_no_cache`'], answer: 2, why: 'Avec `proxy_cache_revalidate on`, nginx envoie une requête conditionnelle et sert son corps stocké sur un 304.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'L’origine envoie `/account` avec `Cache-Control: private, max-age=300`. Quels caches peuvent la stocker ?',
			options: [
				'Tous les caches, 300 secondes, car `max-age` l’emporte sur `private`',
				'Seulement le navigateur ; un CDN ou un cache nginx ne doit pas',
				'Aucun cache, car `private` veut dire la même chose que `no-store`',
				'Seulement le CDN, car `private` empêche le navigateur de la stocker'
			],
			answer: 1,
			why: 'RFC 9111 : `private` « indicates that a shared cache MUST NOT store the response », alors qu’un cache privé le peut. nginx cherche `private` avant de lire `max-age` et marque la réponse comme non cachable.'
		},
		{
			q: 'Ta page envoie `Cache-Control: max-age=3600`. Tu corriges une faute et tu déploies à 10:00. Un cache partagé a récupéré la page auprès de l’origine à 9:50. Quand un utilisateur derrière ce cache peut-il voir la page corrigée au plus tôt ?',
			options: [
				'À 10:00, car le déploiement purge tous les caches devant l’origine',
				'À 10:50, quand la copie stockée atteint un âge de 3600 secondes',
				'À 10:00, car le cache vérifie l’ETag à chaque requête',
				'À 11:00, une heure après le déploiement qui a changé la page'
			],
			answer: 1,
			why: 'Le cache compte l’âge depuis 9:50, quand l’origine a produit sa copie. Jusqu’à 3600 s, il répond avec cette copie sans contacter l’origine. Ton déploiement ne change que l’origine ; pour vider le cache plus tôt, il faut une purge sur le cache lui-même.'
		},
		{
			q: 'Un cache garde une copie périmée avec `ETag: "6acfc371-36ae"`. La page n’a pas changé à l’origine. Qu’est-ce qui circule entre le cache et l’origine ?',
			options: [
				'Un `GET` avec `If-None-Match`, puis un `304` avec en-têtes et sans corps',
				'Un `HEAD`, puis un `200` avec à nouveau tout le corps de 13998 octets',
				'Un `GET` avec `Cache-Control: no-cache`, puis le corps complet',
				'Rien : la copie périmée sert jusqu’à ce que l’origine en pousse une neuve'
			],
			answer: 0,
			why: 'Le cache renvoie le validateur stocké dans `If-None-Match`. L’origine le compare à l’`ETag` courant et répond `304 Not Modified`, qui selon RFC 9110 n’a pas de contenu, et le cache sert le corps qu’il a gardé.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Placer un cache nginx devant une petite origine et observer un miss, un hit, une revalidation, une page `private` jamais stockée, et l’erreur de Steam.',
		steps: [
			'Crée deux pages : `mkdir -p ~/cache-lab/site ~/cache-lab/conf && cd ~/cache-lab`, puis `echo "<h1>docs</h1>" > site/docs.html` et `echo "<h1>account of user A</h1>" > site/account.html`.',
			'Crée `conf/default.conf` avec cette seule ligne. Le port 8081 est l’origine, le port 8080 le cache partagé : `proxy_cache_path /tmp/cache keys_zone=lab:1m; server { listen 8081; root /site; location = /docs.html { add_header Cache-Control "max-age=10"; } location = /account.html { add_header Cache-Control "private"; } } server { listen 8080; location / { proxy_pass http://127.0.0.1:8081; proxy_cache lab; proxy_cache_revalidate on; add_header X-Cache $upstream_cache_status; } }`',
			'Démarre-le : `docker run -d --rm --name cache-lab -p 8080:8080 -p 8081:8081 -v "$PWD/conf:/etc/nginx/conf.d:ro" -v "$PWD/site:/site:ro" nginx:1.27-alpine`.',
			'Demande la page de docs au cache deux fois, attends 10 secondes, redemande : `curl -sI localhost:8080/docs.html | grep -iE "x-cache|cache-control|etag"`. Puis interroge l’origine directement avec l’ETag vu : `curl -sI -H \'If-None-Match: "<etag>"\' localhost:8081/docs.html`.',
			'Demande `/account.html` deux fois via le cache. Ajoute ensuite `proxy_ignore_headers Cache-Control; proxy_cache_valid 200 1m;` après `proxy_cache_revalidate on;`, lance `docker exec cache-lab nginx -s reload`, et redemande `/account.html` deux fois. Nettoie avec `docker rm -f cache-lab`.'
		],
		done: [
			'La page de docs affiche `X-Cache: MISS`, puis `X-Cache: HIT`, puis `X-Cache: REVALIDATED` après les 10 secondes.',
			'La requête directe avec `If-None-Match` renvoie `HTTP/1.1 304 Not Modified`.',
			'`/account.html` affiche `X-Cache: MISS` les deux fois avec la première config, puis `MISS` et `HIT` après le rechargement.'
		],
		solution: [
			'`max-age=10` garde la copie fraîche 10 secondes, donc la deuxième requête n’atteint jamais l’origine. Ensuite, `proxy_cache_revalidate on` envoie `If-None-Match`, l’origine répond 304, et nginx affiche `REVALIDATED`.',
			'`Cache-Control: private` active `no_cache` dans nginx : la page de compte n’est jamais stockée.',
			'`proxy_ignore_headers Cache-Control` fait ignorer cet en-tête à nginx, et `proxy_cache_valid` lui donne une durée de vie. La page construite pour l’utilisateur A part maintenant du cache vers n’importe qui : le même genre de règle a fait fuiter des pages Steam en 2015.'
		]
	},
	recall: {
		q: 'Quelle directive `Cache-Control` garde une page personnelle hors d’un CDN ou d’un cache nginx tout en laissant le navigateur la garder, et que s’est-il passé chez Steam sans elle en décembre 2015 ?',
		a: '`Cache-Control: private` : les caches partagés ne doivent pas stocker la réponse. Le 25 décembre 2015, une règle de cache a mis en cache des pages d’utilisateurs connectés, et les pages d’environ 34k utilisateurs ont pu être vues par d’autres.'
	},
	sources: [
		{ title: 'Valve, Update on Christmas Issues (30 décembre 2015)', url: 'https://store.steampowered.com/news/19852/' },
		{ title: 'RFC 9111, HTTP Caching', url: 'https://www.rfc-editor.org/rfc/rfc9111' },
		{ title: 'RFC 9110, HTTP Semantics, section 15.4.5 304 Not Modified', url: 'https://www.rfc-editor.org/rfc/rfc9110#section-15.4.5' },
		{ title: 'Doc nginx, ngx_http_proxy_module (proxy_cache_key, proxy_ignore_headers, proxy_cache_revalidate)', url: 'https://nginx.org/en/docs/http/ngx_http_proxy_module.html' },
		{ title: 'Source nginx, src/http/ngx_http_upstream.c', url: NGINX }
	]
};
