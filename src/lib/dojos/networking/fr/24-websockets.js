const NGX = 'https://github.com/nginx/nginx/blob/1725db9059e8d4057ce8d5090673d16e20713b45/src/http';
const UPSTREAM = `${NGX}/ngx_http_upstream.c`;
const PROXY = `${NGX}/modules/ngx_http_proxy_module.c`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'websockets',
	part: 'HTTP et TLS',
	title: 'Les WebSockets derrière un proxy',
	minutes: 10,
	hook: [
		'Une page de chat marche jusqu’à ce que personne n’écrive pendant une minute, puis le socket tombe. Reproduit pour ce chapitre avec nginx 1.27.5 devant un backend qui n’envoie rien : le client `WebSocket` de Node a affiché `closed after 60.1 s, code 1006 wasClean false`.',
		'La doc nginx : « By default, the connection will be closed if the proxied server does not transmit any data within 60 seconds. » Sans données du backend pendant 60 secondes, nginx ferme. RFC 6455 réserve le code 1006 à une connexion « closed abnormally, e.g., without sending or receiving a Close control frame ». Personne n’a envoyé de trame Close : nginx a fermé les connexions TCP.',
		'Même montage, avec un backend qui envoie une trame ping toutes les 30 secondes : le socket était encore ouvert à 130 secondes. Le client a répondu à chaque ping par un pong, opcode `0xA`.'
	],
	terms: [
		{ term: 'Handshake d’upgrade', def: 'Un `GET` HTTP/1.1 avec `Upgrade: websocket` et `Connection: Upgrade`. Une réponse `101 Switching Protocols` transforme la connexion TCP en WebSocket.' },
		{ term: 'En-tête hop-by-hop', def: 'Un en-tête valable pour une seule connexion, comme `Upgrade` et `Connection`. Un proxy ne le transmet pas au serveur suivant, sauf si on le configure.' },
		{ term: 'Trame ping', def: 'Une trame de contrôle WebSocket d’opcode `0x9`. L’autre côté « MUST send a Pong frame in response », opcode `0xA`.' },
		{ term: '`proxy_read_timeout`', def: 'La limite de nginx entre deux lectures depuis le backend, 60 s par défaut. Dans un tunnel WebSocket, elle ferme une connexion où le backend n’envoie rien pendant ce temps.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['cl["Navigateur"] -->|"GET /ws, Upgrade: websocket, Connection: Upgrade, Sec-WebSocket-Key"| ng["nginx"]'],
				highlight: ['cl', 'ng'],
				note: 'Le client ouvre une requête HTTP/1.1 normale. `Sec-WebSocket-Key` est une valeur base64 aléatoire, comme `dGhlIHNhbXBsZSBub25jZQ==` dans l’exemple de RFC 6455.'
			},
			{
				add: ['ng -->|"proxy_set_header Upgrade $http_upgrade; Connection upgrade"| be["Backend :9001"]'],
				highlight: ['be'],
				note: 'nginx ne transmet `Upgrade` que si la config le pose. Dans le test, une location sans ces deux lignes a envoyé au backend `connection: close` et aucun `upgrade`. Le backend a répondu `200`, et le client a échoué tout de suite avec le code 1006.'
			},
			{
				add: ['be -->|"101 Switching Protocols, Sec-WebSocket-Accept"| ng', 'ng -->|"101"| cl'],
				highlight: ['be', 'cl'],
				note: 'Le backend calcule `Sec-WebSocket-Accept` : base64 du SHA-1 de la clé suivie du GUID `258EAFA5-E914-47DA-95CA-C5AB0DC85B11`. Pour la clé d’exemple de la RFC, ça donne `s3pPLMBiTxaQ9kYGzzhZRbK+xOo=`. nginx voit le `101` et passe en mode tunnel.'
			},
			{
				add: ['cl <-->|"trames dans les deux sens"| ng', 'ng <-->|"trames dans les deux sens, minuteur : proxy_read_timeout 60s"| be'],
				highlight: ['ng'],
				note: 'nginx copie maintenant les octets dans les deux sens. Chaque fois qu’il attend des données du backend, il arme un minuteur de `proxy_read_timeout`, 60 s par défaut. N’importe quelle trame du backend, ping compris, efface ce minuteur.'
			},
			{
				add: ['ng -.->|"60 s sans données du backend : fermeture TCP"| cl'],
				highlight: ['ng', 'cl'],
				note: 'Après 60 s de silence, le minuteur expire et nginx ferme les deux connexions. Aucune trame Close ne part, donc le navigateur affiche le code 1006. Un ping du backend toutes les 30 s empêche le minuteur d’expirer.'
			}
		]
	},
	example: {
		title: 'src/http/ngx_http_upstream.c : le minuteur de lecture d’une connexion upgradée',
		repo: 'nginx/nginx',
		url: `${UPSTREAM}#L3713-L3875`,
		lang: 'c',
		code: `ngx_http_upstream_process_upgraded(ngx_http_request_t *r,
    ngx_uint_t from_upstream, ngx_uint_t do_write)
{
…
    downstream = c;
    upstream = u->peer.connection;

    if (downstream->write->timedout) {
        c->timedout = 1;
        ngx_connection_error(c, NGX_ETIMEDOUT, "client timed out");
        ngx_http_upstream_finalize_request(r, u, NGX_HTTP_REQUEST_TIME_OUT);
        return;
    }

    if (upstream->read->timedout || upstream->write->timedout) {
        ngx_connection_error(c, NGX_ETIMEDOUT, "upstream timed out");
        ngx_http_upstream_finalize_request(r, u, NGX_HTTP_GATEWAY_TIME_OUT);
        return;
    }
…
    if (upstream->read->active && !upstream->read->ready) {
        ngx_add_timer(upstream->read, u->conf->read_timeout);

    } else if (upstream->read->timer_set) {
        ngx_del_timer(upstream->read);
    }`,
		notes: [
			'nginx appelle cette fonction pour chaque événement du tunnel, dans les deux sens. Les lignes 5 et 6 nomment les deux côtés : `downstream` est le navigateur, `upstream` le backend.',
			'Les lignes 21 et 22 arment un minuteur de `read_timeout`, réglé par `proxy_read_timeout`, chaque fois que nginx attend des données du backend. Les lignes 24 et 25 le suppriment quand des données sont prêtes.',
			'La ligne 15 s’exécute quand ce minuteur a expiré. La ligne 16 écrit `upstream timed out` dans le log et la ligne 17 termine la requête. Le WebSocket a déjà reçu son `101`, donc le navigateur ne voit qu’une connexion fermée : code 1006.',
			'Le passage dans ce mode se fait dans [`ngx_http_proxy_module.c`](' + PROXY + '#L2039-L2045) : sur un `101` du backend, nginx pose `u->upgrade = 1` seulement si la requête du client portait un en-tête `Upgrade`.'
		]
	},
	tradeoff: {
		gain: [
			'Après le `101`, une seule connexion TCP porte les messages dans les deux sens, et le backend peut pousser sans requête du navigateur. nginx se contente de copier les octets.',
			'Une trame ping du serveur fait 2 octets dans le backend de test (`0x89 0x00`). Une toutes les 30 s a gardé le socket ouvert au-delà des 60 s de nginx.'
		],
		cost: [
			'Chaque proxy du chemin a besoin d’une config WebSocket. nginx supprime `Upgrade` sauf si `proxy_set_header` le transmet, et avant la 1.29.7 la doc demande aussi `proxy_http_version 1.1`.',
			'Monter `proxy_read_timeout` à plusieurs heures vaut pour toutes les requêtes de cette `location` : un backend HTTP classique bloqué garde lui aussi sa connexion aussi longtemps.',
			'Une coupure par timeout de proxy donne le code 1006, le même qu’une panne réseau. Le client doit se reconnecter et ne peut pas distinguer les deux cas avec le code seul.'
		]
	},
	task: {
		prompt: 'Ton appli `app:8080` sert des WebSockets sur `/socket/`. Derrière nginx, les utilisateurs signalent une coupure après exactement une minute sans message. Écris le bloc `location` nginx qui transmet l’upgrade, puis choisis l’une des deux corrections : un `proxy_read_timeout` plus long, ou des pings côté serveur. Donne les valeurs que tu prendrais et pourquoi.',
		hint: 'Pars de l’exemple de la doc nginx avec `map $http_upgrade $connection_upgrade`. Le `proxy_read_timeout` par défaut vaut 60s, et il compte le temps entre deux lectures depuis le backend.',
		answer: [
			'Dans `http` : `map $http_upgrade $connection_upgrade { default upgrade; \'\' close; }`. Dans le server : `location /socket/ { proxy_pass http://app:8080; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection $connection_upgrade; }`. `proxy_http_version 1.1` est nécessaire avant nginx 1.29.7.',
			'Pings : le serveur envoie une trame ping toutes les 30 s, la moitié des 60 s. Chaque ping est une donnée du backend, donc nginx remet son minuteur à zéro. Dans le test avec nginx 1.27.5, des pings toutes les 30 s ont gardé le socket ouvert au-delà de 130 s.',
			'Timeout : `proxy_read_timeout 3600s;` dans cette location garde les sockets inactifs une heure. Une requête HTTP bloquée dans `/socket/` peut alors aussi attendre une heure, et ça ne change rien dans les autres proxies du chemin.'
		]
	},
	quiz: [
		{
			q: 'Derrière nginx avec les réglages par défaut, un WebSocket se ferme après 60 s avec le code 1006 quand le serveur se tait. Qui le ferme ?',
			options: [
				'Le navigateur, qui envoie une trame Close après 60 s sans message',
				'nginx, dont le `proxy_read_timeout` de 60s a expiré sans données',
				'Le backend, qui doit fermer tout socket qui n’a envoyé aucun pong',
				'Le keepalive TCP du noyau, qui sonde toutes les 60 secondes'
			],
			answer: 1,
			why: 'En mode tunnel, nginx arme un minuteur `read_timeout` pendant qu’il attend des données du backend. Quand il expire, `ngx_http_upstream_process_upgraded` écrit `upstream timed out` et ferme. Aucune trame Close ne part, donc le navigateur affiche 1006.'
		},
		{
			q: 'Une `location` ne contient que `proxy_pass http://backend;`. Le WebSocket du navigateur échoue tout de suite. Qu’a reçu le backend ?',
			options: [
				'La requête d’upgrade complète, refusée à cause de l’`Origin`',
				'Un `GET` simple avec `Connection: close` et sans en-tête `Upgrade`',
				'Rien, car nginx refuse les requêtes `GET` qui ont un corps',
				'Une requête `CONNECT`, que nginx envoie pour chaque WebSocket'
			],
			answer: 1,
			why: '`Upgrade` et `Connection` sont hop-by-hop, et nginx envoie `Connection: close` par défaut. Le backend a vu une requête normale et a répondu `200` : aucun `101` n’est revenu et le handshake a échoué.'
		},
		{
			q: 'Quel changement côté serveur garde un WebSocket inactif ouvert malgré le `proxy_read_timeout` de 60 s par défaut ?',
			options: [
				'Envoyer une trame ping toutes les 30 secondes',
				'Répondre à chaque ping du client en moins de 120 secondes',
				'Mettre `Sec-WebSocket-Version: 13` dans la réponse 101',
				'Envoyer `Keep-Alive: timeout=120` dans la réponse 101'
			],
			answer: 0,
			why: 'Le minuteur de nginx compte le temps entre deux lectures depuis le backend. Un ping toutes les 30 s est une donnée du backend, donc le minuteur repart avant les 60 s. La doc nginx propose exactement ça : « periodically send WebSocket ping frames to reset the timeout ».'
		}
	],
	recall: {
		q: 'Un WebSocket derrière nginx tombe après exactement 60 s de silence avec le code 1006. Quel réglage est en cause, et quelles sont les deux corrections ?',
		a: '`proxy_read_timeout`, 60s par défaut. Soit tu le montes dans la `location` du WebSocket, soit le serveur envoie une trame ping (opcode `0x9`) plus souvent que toutes les 60 s, par exemple toutes les 30 s.'
	},
	sources: [
		{ title: 'RFC 6455, The WebSocket Protocol', url: 'https://www.rfc-editor.org/rfc/rfc6455' },
		{ title: 'Doc nginx, WebSocket proxying', url: 'https://nginx.org/en/docs/http/websocket.html' },
		{ title: 'Doc nginx, ngx_http_proxy_module (proxy_read_timeout, proxy_set_header)', url: 'https://nginx.org/en/docs/http/ngx_http_proxy_module.html' },
		{ title: 'Source nginx, src/http/ngx_http_upstream.c', url: UPSTREAM }
	]
};
