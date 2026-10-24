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
		],
		steps: [
			{
				title: 'Lis le symptôme',
				questions: [
					{ q: 'La coupure à une minute, c’est le `proxy_read_timeout` de nginx qui se déclenche. Quel message nginx écrit-il dans son journal d’erreurs ?', options: ['`upstream timed out`', '`client timed out`', '`connect() failed (111: Connection refused)`', 'Rien : les fermetures de tunnel ne sont jamais journalisées'], answer: 0, why: 'Le minuteur porte sur la lecture depuis le backend : la ligne 15 voit `upstream->read->timedout` et la ligne 16 journalise `upstream timed out`.' },
					{ q: 'Que compte ce minuteur ?', options: ['La durée de vie totale du socket', 'Le temps entre deux lectures depuis le backend', 'Le temps entre deux messages du navigateur', 'Le temps écoulé depuis la réponse `101`'], answer: 1, why: 'nginx arme le minuteur chaque fois qu’il attend des données du backend, et le supprime quand des données arrivent.' },
					{ q: 'Quand ce minuteur se déclenche, avec quel statut nginx termine-t-il la requête dans le code ?', options: ['`200`, puisque l’upgrade avait marché', '`101`, renvoyé pour fermer le tunnel', '`504` (`NGX_HTTP_GATEWAY_TIME_OUT`), que le navigateur ne voit jamais', '`502`, affiché à l’utilisateur comme page d’erreur'], answer: 2, why: 'La ligne 17 termine la requête avec `NGX_HTTP_GATEWAY_TIME_OUT`. Le navigateur a déjà reçu son `101`, il ne voit donc qu’une connexion fermée.' },
					{ q: 'Le backend envoie un message toutes les 90 s. Est-ce que ça évite la coupure ?', options: ['Oui : toute donnée du backend remet le minuteur à zéro', 'Oui, à condition que ce soient des pings', 'Non : nginx jette les trames du backend après 60 s', 'Non : 60 s passent sans donnée du backend avant chaque message'], answer: 3, why: 'Le minuteur se déclenche après 60 s sans donnée du backend. Un message toutes les 90 s arrive 30 s trop tard.' }
				]
			},
			{
				title: 'Transmets l’upgrade',
				questions: [
					{ q: 'Avec seulement `proxy_pass` dans la `location`, qu’a répondu le backend dans le test du chapitre ?', options: ['`200`, une réponse HTTP ordinaire', '`101 Switching Protocols`', '`426 Upgrade Required`', '`502 Bad Gateway`'], answer: 0, why: 'Il a reçu un `GET` ordinaire sans `upgrade`, et a répondu comme à toute requête HTTP : `200`. Sans `101`, le client a échoué tout de suite.' },
					{ q: 'Quelles deux lignes transmettent l’upgrade ?', options: ['`proxy_pass_header Upgrade;` et `proxy_buffering off;`', '`add_header Upgrade websocket;` et `add_header Connection upgrade;`', '`proxy_set_header Upgrade $http_upgrade;` et `proxy_set_header Connection $connection_upgrade;`', '`proxy_set_header Host $host;` et `proxy_set_header Origin $http_origin;`'], answer: 2, why: '`proxy_set_header` pose les en-têtes de la requête envoyée au backend. `add_header` ne touche que la réponse au navigateur.' },
					{ q: 'Que fait `map $http_upgrade $connection_upgrade { default upgrade; \'\' close; }` ?', options: ['Il bloque toute requête sans en-tête `Upgrade`', 'Il pose `Connection: upgrade` quand le client en a demandé un, et `close` sinon', 'Il réécrit les URL `http://` en `ws://`', 'Il met en cache la réponse `101` du backend'], answer: 1, why: 'Le map donne `upgrade` quand `$http_upgrade` a une valeur, et `close` quand il est vide : les requêtes normales gardent l’ancien comportement.' },
					{ q: 'Quelle ligne la doc exige-t-elle avant nginx 1.29.7 ?', options: ['`proxy_buffering off;`', '`keepalive 16;`', '`http2 on;`', '`proxy_http_version 1.1;`'], answer: 3, why: 'Le handshake d’upgrade est du HTTP/1.1, et avant 1.29.7 nginx a besoin de cette ligne pour parler HTTP/1.1 au backend.' }
				]
			},
			{
				title: 'Choisis la correction',
				questions: [
					{ q: 'Tu choisis les pings côté serveur, et un autre proxy du chemin ferme une connexion après 25 s de silence. Des pings toutes les 30 s gardent-ils le socket ouvert ?', options: ['Oui : seul le minuteur de 60 s de nginx compte', 'Oui : chaque ping remet tous les minuteurs à 60 s', 'Non : les pings doivent passer plus souvent que le plus court timeout du chemin', 'Non : les pings ne traversent jamais un second proxy'], answer: 2, why: 'Chaque saut a son propre minuteur d’inactivité. Avec 30 s entre deux pings, le proxy à 25 s se déclenche avant : l’intervalle doit descendre sous 25 s, par exemple 20 s.' },
					{ q: 'Pourquoi un ping du serveur remet-il le minuteur de nginx à zéro ?', options: ['C’est une donnée du backend, exactement ce que le minuteur attend', 'nginx lit les trames ping et prolonge le timeout', 'Un ping rouvre la connexion TCP', 'Seul le pong du navigateur le remet à zéro'], answer: 0, why: 'nginx ne fait que copier des octets. Toute trame du backend, ping compris, remet le minuteur à zéro.' },
					{ q: 'Que coûte `proxy_read_timeout 3600s;` dans `/socket/` ?', options: ['Toutes les locations du server attendent désormais une heure', 'Une requête HTTP bloquée dans `/socket/` peut aussi attendre une heure', 'Les pings ne marchent plus dans cette location', 'Rien : ça ne s’applique qu’aux WebSockets'], answer: 1, why: 'Le réglage vaut pour toutes les requêtes de cette `location`, pas seulement pour les connexions passées en upgrade.' },
					{ q: 'Quelle correction aide aussi avec les autres proxies du chemin ?', options: ['Un `proxy_read_timeout` plus long, puisque nginx le transmet', 'Les deux aident de la même façon', 'Aucune : chaque proxy a besoin de sa propre config', 'Les pings du serveur, puisque chaque saut voit passer les données'], answer: 3, why: 'Un timeout réglé dans nginx ne change rien aux autres proxies. Un ping est du vrai trafic qui traverse chaque saut.' }
				]
			},
			{
				title: 'Vérifie le résultat',
				questions: [
					{ q: 'Quel code de statut te dit que l’upgrade est passé à travers nginx ?', options: ['`200 OK`', '`101 Switching Protocols`', '`426 Upgrade Required`', '`204 No Content`'], answer: 1, why: 'Un `101` transforme la connexion en WebSocket, et nginx passe en mode tunnel.' },
					{ q: 'Que renvoie le navigateur pour chaque ping du serveur ?', options: ['Une trame Close', 'Un ping, opcode `0x9`', 'Rien du tout', 'Un pong, opcode `0xA`'], answer: 3, why: 'RFC 6455 : l’autre côté « MUST send a Pong frame in response ». Le client de test l’a fait à chaque ping.' },
					{ q: 'Avec des pings toutes les 30 s dans le test nginx 1.27.5, combien de temps le socket est-il resté ouvert ?', options: ['Au-delà de 130 s, toujours ouvert', 'Exactement 60,1 s, comme avant', 'Exactement 90 s, trois pings', 'Il s’est fermé tout de suite avec le code 1006'], answer: 0, why: 'Chaque ping a remis le minuteur à zéro, donc la limite de 60 s ne s’est jamais déclenchée.' },
					{ q: 'Un jour, un utilisateur voit encore le code 1006. Que peut conclure le client à partir du seul code ?', options: ['Le timeout de nginx s’est déclenché, c’est sûr', 'Le serveur a envoyé une trame Close', 'Rien de précis : un timeout de proxy et une panne réseau donnent tous deux 1006, donc il se reconnecte', 'Le navigateur a fermé le socket exprès'], answer: 2, why: 'Une coupure par timeout de proxy donne le même code qu’une panne réseau. Le client doit se reconnecter dans les deux cas.' }
				]
			}
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
	lab: {
		minutes: 20,
		goal: 'Placer nginx devant un backend WebSocket silencieux, voir le timeout de lecture couper le socket, puis le garder ouvert avec des pings côté serveur.',
		steps: [
			'Prépare le backend : `mkdir -p ~/ws-lab/conf && cd ~/ws-lab && npm init -y && npm install ws@8.18.0`. Crée `server.js` avec cette ligne : `const { WebSocketServer } = require(\'ws\'); const wss = new WebSocketServer({ port: 9001 }); wss.on(\'connection\', (ws) => { console.log(\'client connected\'); if (process.env.PING) setInterval(() => ws.ping(), 5000); });`',
			'Crée `conf/default.conf` avec cette ligne. Le timeout vaut 10 s au lieu de 60 s pour attendre moins, et `/plain/` n’a pas les en-têtes d’upgrade : `map $http_upgrade $connection_upgrade { default upgrade; \'\' close; } server { listen 8080; location /socket/ { proxy_pass http://127.0.0.1:9001; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection $connection_upgrade; proxy_read_timeout 10s; } location /plain/ { proxy_pass http://127.0.0.1:9001; } }`',
			'Démarre les deux. nginx partage le réseau du backend, donc `127.0.0.1:9001` l’atteint : `docker run -d --rm --name ws-backend -p 8080:8080 -v "$PWD:/app" -w /app node:24-alpine node server.js`, puis `docker run -d --rm --name ws-proxy --network container:ws-backend -v "$PWD/conf:/etc/nginx/conf.d:ro" nginx:1.27-alpine`.',
			'Crée `client.js` (Node 22 ou plus récent a `WebSocket` intégré) : `const t = Date.now(); const ws = new WebSocket(process.argv[2]); ws.onopen = () => console.log(\'open\'); ws.onclose = (e) => { console.log(\'closed after\', ((Date.now() - t) / 1000).toFixed(1), \'s, code\', e.code); process.exit(); }; setTimeout(() => { console.log(\'still open at 25 s\'); process.exit(); }, 25000);`. Lance `node client.js ws://localhost:8080/plain/`, puis `node client.js ws://localhost:8080/socket/`, puis `docker logs ws-proxy`.',
			'Active les pings : `docker rm -f ws-proxy ws-backend`, relance les deux commandes `docker run` en ajoutant `-e PING=1` à celle du backend, et relance `node client.js ws://localhost:8080/socket/`. Nettoie avec `docker rm -f ws-proxy ws-backend`.'
		],
		done: [
			'`/plain/` affiche `closed after 0.1 s, code 1006`, et le log nginx montre `"GET /plain/ HTTP/1.1" 426`.',
			'`/socket/` affiche `open`, puis `closed after 10.0 s, code 1006`, et le log nginx montre `"GET /socket/ HTTP/1.1" 101`.',
			'Avec `PING=1`, `/socket/` affiche `open`, puis `still open at 25 s`.'
		],
		solution: [
			'Sans les deux lignes `proxy_set_header`, le backend ne reçoit pas d’en-tête `Upgrade` et refuse avec `426`. Aucun `101` ne revient, donc le handshake échoue tout de suite.',
			'Sur `/socket/`, le backend n’envoie rien. Après `proxy_read_timeout`, ici 10 s, nginx ferme les deux connexions sans trame Close : code 1006.',
			'Un ping toutes les 5 s est une donnée du backend, donc nginx remet son minuteur à zéro avant les 10 s. En production, la même règle donne un ping toutes les 30 s pour les 60 s par défaut.'
		]
	},
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
