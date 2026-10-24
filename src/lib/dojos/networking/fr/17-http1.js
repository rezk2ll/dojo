const GO = 'https://github.com/golang/go/blob/022c8636110ebac86a9b88724cda168ed713c21f/src/net/http';
const TRANSPORT = `${GO}/transport.go`;
const RFC = 'https://www.rfc-editor.org/rfc/rfc9112';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'http1',
	part: 'HTTP et TLS',
	title: 'HTTP/1.1 sur le fil',
	minutes: 10,
	hook: [
		'Un service Go appelle une API interne en boucle. Pour chaque réponse, il regarde `resp.StatusCode`, puis lance `resp.Body.Close()` sans lire le corps.',
		'Dans un essai fait pour ce chapitre, avec Go 1.24.4 et un serveur local qui répond 10 000 octets, 10 appels de suite ont affiché "0 of 10 requests reused a connection". Chaque appel a ouvert une nouvelle connexion TCP. La même boucle avec `io.Copy(io.Discard, resp.Body)` avant `Close` a affiché "9 of 10 requests reused a connection".',
		'La RFC 9112 pose la règle : "a client MUST read the entire response message body if it intends to reuse the same connection for a subsequent request". **Sur une connexion HTTP/1.1, la réponse suivante commence juste après le dernier octet du corps en cours** : un client qui arrête de lire au milieu ne sait plus où il en est.'
	],
	terms: [
		{ term: 'Persistent connection', def: 'Une connexion TCP qui porte plusieurs requêtes et réponses l’une après l’autre. HTTP/1.1 garde la connexion ouverte par défaut, sauf si un message porte `Connection: close`.' },
		{ term: 'Content-Length', def: 'Un en-tête qui donne la taille du corps en octets, en décimal. Le destinataire lit exactement ce nombre d’octets après la ligne vide qui termine les en-têtes.' },
		{ term: 'Chunked transfer coding', def: 'Un corps envoyé en morceaux, chacun précédé de sa taille en hexadécimal et d’un CRLF. Un morceau de taille `0` marque la fin. Le serveur s’en sert quand il ne connaît pas la longueur à l’avance.' },
		{ term: 'Head-of-line blocking', def: 'Sur une connexion HTTP/1.1, une réponse doit partir en entier avant que la suivante commence : une réponse lente ou grosse retarde toutes les requêtes en file derrière elle.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['client["curl --http1.1 http://example.org/"] -->|"GET / HTTP/1.1, Host : example.org, ligne vide"| server["example.org port 80"]'],
				highlight: ['client'],
				note: 'Après la poignée de main TCP, curl écrit du texte : la ligne de requête `GET / HTTP/1.1`, puis un en-tête par ligne (`Host`, `User-Agent`, `Accept`), chacun terminé par CRLF. Une ligne vide clôt les en-têtes. La RFC 9112 rend `Host` obligatoire dans toute requête HTTP/1.1.'
			},
			{
				add: ['server -->|"HTTP/1.1 200 OK, Transfer-Encoding : chunked, Connection : keep-alive"| client'],
				highlight: ['server'],
				note: 'Le serveur répond par une ligne de statut et ses propres en-têtes. Dans un `curl -v` lancé pour ce chapitre, example.org a envoyé `Transfer-Encoding: chunked` et `Connection: keep-alive`. Il n’a pas envoyé de `Content-Length` : ce sont les morceaux qui diront à curl où finit le corps.'
			},
			{
				add: ['server -->|"241 CRLF, 577 octets de HTML, CRLF, 0 CRLF CRLF"| body["Corps décodé : 577 octets"]'],
				highlight: ['body'],
				note: '`curl --raw` montre les octets avant décodage. La première ligne vaut `241`, soit 577 en hexadécimal, suivie de 577 octets de HTML. Viennent ensuite une ligne `0` et une ligne vide. curl sait alors que le corps est complet et que la connexion est libre.'
			},
			{
				add: ['client -->|"2e GET / sur la même connexion"| server'],
				highlight: ['client'],
				note: 'Avec une deuxième URL sur la ligne de commande, curl affiche `Re-using existing connection with host example.org` et envoie la requête suivante sur la même connexion TCP, sans nouvelle poignée de main. Il ne le peut que parce qu’il a lu tout le premier corps.'
			},
			{
				add: ['slow["GET /report : 2 MB, lent"] -->|"doit finir d’abord"| fast["GET /logo.png attend"]'],
				highlight: ['slow', 'fast'],
				note: 'Une connexion porte une réponse à la fois. Même en pipelining, la RFC 9112 exige que le serveur "MUST send the corresponding responses in the same order that the requests were received". Un petit `/logo.png` attend derrière un rapport lent. La RFC note que les clients ouvrent plusieurs connexions pour éviter ce head-of-line blocking.'
			}
		]
	},
	example: {
		title: 'src/net/http/transport.go dans Go 1.27.2 : quand un corps fermé rend la connexion',
		repo: 'golang/go',
		url: `${TRANSPORT}#L2420-L2640`,
		lang: 'go',
		code: `const maxPostCloseReadBytes = 256 << 10
…
const maxPostCloseReadTime = 50 * time.Millisecond

func maybeDrainBody(r io.Reader) bool {
	drainedCh := make(chan bool, 1)
	go func() {
…
		if _, err := io.CopyN(io.Discard, r, maxPostCloseReadBytes+1); err == io.EOF {
			drainedCh <- true
		} else {
			drainedCh <- false
		}
	}()
	select {
	case drained := <-drainedCh:
		return drained
	case <-time.After(maxPostCloseReadTime):
		return false
	}
}
…
		select {
		case err := <-waitForBodyRead:
			tryPutIdle := func() {
				alive = alive &&
					!pc.sawEOF &&
					pc.wroteRequest() &&
					tryPutIdleConn(rc.treq)
			}
			switch err {
			case io.EOF:
				tryPutIdle()
				eofc <- struct{}{}
			case errClosedEarly:
				// Read resp before signaling eofc: the send lets the caller's
				// Close return, and resp belongs to the caller after that.
				tryDrain := alive && resp.ContentLength <= maxPostCloseReadBytes
				eofc <- struct{}{}
				if tryDrain && maybeDrainBody(body.body) {
					tryPutIdle()
				} else {
					alive = false
				}
			default:
				alive = false
			}`,
		notes: [
			'Lignes 32 à 34 : l’appelant a lu le corps jusqu’à `io.EOF`. `tryPutIdle`, ligne 33, appelle `tryPutIdleConn`, qui range la connexion dans le pool inactif. La requête suivante vers cet hôte la reprend.',
			'Lignes 35 à 44 : l’appelant a fermé le corps avant la fin. La ligne 38 ne tente une vidange que si le `Content-Length` annoncé fait au plus 256 KiB, la constante de la ligne 1. Un corps chunked a un `ContentLength` de -1, il passe donc ce test.',
			'Lignes 5 à 21 : `maybeDrainBody` lit et jette au plus 256 KiB plus un octet. Elle ne renvoie `true` que si elle atteint la fin du corps en moins de 50 ms (ligne 3). Sinon la ligne 43 met `alive = false`, et la connexion est fermée.',
			'Le même programme de test avec Go 1.27.2 : 10 000 octets fermés sans lecture ont donné "9 of 10 requests reused a connection", et 300 000 octets "0 of 10". Go 1.26.0 n’a pas `maxPostCloseReadBytes` : la vidange arrive avec Go 1.27. La [doc de `Client.Do`](' + GO + '/client.go#L565-L572) demande toujours de lire le corps jusqu’à EOF puis de le fermer.'
		]
	},
	tradeoff: {
		gain: [
			'Une connexion persistante évite la poignée de main TCP à 9 requêtes sur 10, et celle de TLS en HTTPS.',
			'Le format est du texte avec des fins de ligne CRLF : `curl -v` et `curl --raw` montrent la ligne de requête, chaque en-tête et chaque taille de morceau tels qu’envoyés.',
			'Le codage chunked permet au serveur d’envoyer un corps de taille inconnue en gardant la connexion ouverte.'
		],
		cost: [
			'Une connexion porte une réponse à la fois, dans l’ordre des requêtes : un rapport de 2 MB retarde les petites requêtes derrière lui.',
			'Pour paralléliser, le client ouvre d’autres connexions, et chacune coûte une poignée de main TCP et de la mémoire côté serveur.',
			'Un client qui arrête de lire un corps perd la connexion : Go 1.24 a ouvert 10 connexions pour 10 appels.',
			'Chaque requête répète ses en-têtes en texte complet : curl a envoyé deux fois de suite les mêmes lignes `Host`, `User-Agent` et `Accept`.'
		]
	},
	task: {
		prompt: 'Un client reçoit ces octets sur une connexion persistante, chaque ligne finie par CRLF : `HTTP/1.1 200 OK` / `Content-Type: text/plain` / `Transfer-Encoding: chunked` / (ligne vide) / `5` / `hello` / `7` / `, world` / `0` / (ligne vide). Quelle est la longueur du corps, comment le client sait-il qu’il est complet, et peut-il envoyer la requête suivante sur cette connexion ? Réponds ensuite pour une réponse `HTTP/1.1 200 OK` / `Connection: close` / (ligne vide) suivie du texte `hello`, sans en-tête de longueur.',
		hint: 'Lis chaque taille de morceau comme un nombre hexadécimal. La section 6.3 de la RFC 9112 liste, dans l’ordre, comment un client trouve la fin d’un corps.',
		answer: [
			'Les morceaux font 5 et 7 octets (`5` et `7` valent 5 et 7 en hexadécimal) : `hello` et `, world`, 12 octets en tout, « hello, world ».',
			'Le morceau de taille `0` suivi de la ligne vide termine le corps. La réponse est en HTTP/1.1 sans `Connection: close` : la connexion reste ouverte et la requête suivante peut partir dessus.',
			'La deuxième réponse n’a ni `Content-Length` ni `Transfer-Encoding`. La règle 8 de la RFC 9112 s’applique : le corps est tout ce qui est "received prior to the server closing the connection".',
			'Le client ne sait que le corps est complet qu’à la fermeture par le serveur, et `Connection: close` annonce déjà que la connexion ne durera pas. La requête suivante demande une nouvelle connexion TCP.'
		],
		steps: [
			{
				title: 'Lis les tailles des morceaux',
				questions: [
					{ q: 'Quel en-tête dit au client comment le corps est découpé ?', options: ['`Content-Type: text/plain`', '`Transfer-Encoding: chunked`', '`HTTP/1.1 200 OK`', 'La ligne vide après les en-têtes'], answer: 1, why: 'Il n’y a pas de `Content-Length` : ce sont les morceaux eux-mêmes qui disent où le corps finit.' },
					{ q: 'Dans quelle base chaque taille de morceau est-elle écrite ?', options: ['Hexadécimal', 'Décimal', 'Octal', 'Binaire'], answer: 0, why: 'Les tailles de morceau sont en hexadécimal. C’est `Content-Length` qui s’écrit en décimal.' },
					{ q: 'Combien d’octets contient le morceau après `7` ?', options: ['5', '12', '16', '7'], answer: 3, why: '`7` en hexadécimal vaut 7 : les 7 octets de `, world`, espace compris.' },
					{ q: 'Quelle est la longueur du corps entier ?', options: ['5 octets', '12 octets', '7 octets', '18 octets'], answer: 1, why: '5 octets de `hello` plus 7 de `, world` : 12 octets, « hello, world ». Les lignes de taille et les CRLF ne font pas partie du corps.' }
				]
			},
			{
				title: 'Trouve la fin du corps',
				questions: [
					{ q: 'Qu’est-ce qui dit au client que le corps est complet ?', options: ['La fermeture de la connexion', 'Un `Content-Length` de 12', 'Un morceau de taille `0`, puis une ligne vide', 'Le timeout de lecture du client'], answer: 2, why: 'En chunked, un morceau de taille `0` marque la fin.' },
					{ q: 'Que voudrait dire une ligne de taille `1a` ?', options: ['26 octets suivent', '1 octet, puis la lettre a', '10 octets suivent', '1a n’est pas une taille valide'], answer: 0, why: '`1a` vaut 1 x 16 + 10 = 26 en hexadécimal.' },
					{ q: 'Pourquoi un serveur choisit-il le chunked ?', options: ['Le corps est plus petit sur le réseau', 'Il ne connaît pas la longueur à l’avance', 'HTTP/1.1 l’impose pour du texte', 'Le client peut sauter des morceaux'], answer: 1, why: 'Le chunked laisse un serveur envoyer en flux un corps de taille inconnue tout en gardant la connexion ouverte.' },
					{ q: 'Où commence la réponse suivante sur cette connexion ?', options: ['Après une nouvelle poignée de main du serveur', 'Au prochain `HTTP/1.1` que le client trouve', 'Après un bloc fixe de 64 Ko', 'Juste après la ligne vide qui suit le `0`'], answer: 3, why: 'Sur une connexion HTTP/1.1, la réponse suivante commence juste après le dernier octet de la réponse en cours.' }
				]
			},
			{
				title: 'Décide de la réutilisation',
				questions: [
					{ q: 'Le client peut-il envoyer sa requête suivante sur cette connexion ?', options: ['Non, une réponse chunked la ferme toujours', 'Seulement après une nouvelle poignée de main TLS', 'Oui : HTTP/1.1, pas de `Connection: close`, corps lu', 'Seulement s’il envoie d’abord `Connection: keep-alive`'], answer: 2, why: 'HTTP/1.1 garde la connexion ouverte par défaut, et le client a lu tout le corps : il sait où il en est.' },
					{ q: 'Le client arrête de lire après `hello`. Que dit la RFC 9112 ?', options: ['Il doit lire tout le corps pour réutiliser la connexion', 'Il peut réutiliser la connexion tout de suite', 'Il doit envoyer `0` au serveur', 'Le serveur renvoie la suite à la requête suivante'], answer: 0, why: '"A client MUST read the entire response message body if it intends to reuse the same connection".' },
					{ q: 'Un client Go 1.24 ferme un corps de 10 000 octets sans le lire. Combien d’appels sur 10 ont réutilisé une connexion ?', options: ['9', '10', '5', '0'], answer: 3, why: 'Go 1.24 ne vide pas un corps fermé trop tôt, il abandonne la connexion : "0 of 10 requests reused a connection".' },
					{ q: 'Qu’est-ce qui corrige cette boucle en Go 1.24 ?', options: ['Mettre `Connection: close` sur chaque requête', '`io.Copy(io.Discard, resp.Body)` avant `Close`', 'Appeler `Close` deux fois', 'Ne lire que les en-têtes'], answer: 1, why: 'Lire le corps jusqu’à EOF laisse le transport remettre la connexion dans le pool : 9 sur 10 réutilisées.' }
				]
			},
			{
				title: 'Lis la réponse qui ferme',
				questions: [
					{ q: 'La deuxième réponse n’a ni `Content-Length` ni `Transfer-Encoding`. Où finit son corps ?', options: ['Au premier CRLF', 'Après 5 octets, la longueur de `hello`', 'Quand le serveur ferme la connexion', 'À la prochaine ligne vide'], answer: 2, why: 'Règle 8 de la RFC 9112 : le corps est tout ce qui est "received prior to the server closing the connection".' },
					{ q: 'Que dit `Connection: close` au client ?', options: ['La connexion ne durera pas après cette réponse', 'Le serveur s’arrête', 'Le client doit fermer son côté d’abord', 'Le corps est vide'], answer: 0, why: 'C’est la sortie de la connexion persistante par défaut de HTTP/1.1.' },
					{ q: 'La requête suivante peut-elle partir sur cette connexion ?', options: ['Oui, une fois le corps lu', 'Oui, si elle porte `Host`', 'Seulement dans les 5 secondes', 'Non : il faut une nouvelle connexion TCP'], answer: 3, why: 'Le serveur ferme pour marquer la fin du corps : plus rien ne peut passer sur cette connexion.' },
					{ q: 'Pourquoi le client ne peut-il pas distinguer ici un `hello` complet d’un `hello` coupé ?', options: ['Le corps n’a pas de checksum', 'Sans longueur, une fermeture ressemble à une autre', 'Un texte brut n’est jamais complet', 'La ligne de statut manque'], answer: 1, why: 'Le seul marqueur de fin est la fermeture. Une connexion qui tombe trop tôt termine le corps de la même façon.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Un client Go 1.24 ferme chaque corps de réponse de 10 KB sans le lire. Qu’arrive-t-il à la connexion ?',
			options: [
				'Elle retourne dans le pool, parce que `Close` rend toujours la connexion au pool',
				'Le transport la ferme, parce que les octets non lus seraient pris pour la réponse suivante',
				'Elle reste ouverte, mais le transport envoie `Connection: close` à la requête suivante',
				'Le serveur la coupe, parce qu’il voit que le client n’a pas acquitté le corps'
			],
			answer: 1,
			why: 'Sur une connexion persistante, la réponse suivante commence juste après le corps en cours. Go 1.24 ne vide pas un corps fermé trop tôt : il marque la connexion comme morte, et la requête suivante en ouvre une nouvelle. Go 1.27 tente d’abord de lire jusqu’à 256 KiB en 50 ms.'
		},
		{
			q: 'Une réponse porte `Transfer-Encoding: chunked` et la première ligne du corps est `1a`. Combien d’octets contient le premier morceau ?',
			options: ['1', '10', '16', '26'],
			answer: 3,
			why: 'La taille est en hexadécimal : `1a` vaut 1 x 16 + 10 = 26 octets. Le client lit 26 octets, un CRLF, puis la ligne de taille suivante, jusqu’à une taille de `0`.'
		},
		{
			q: 'Une page envoie 6 petites requêtes sur une seule connexion HTTP/1.1, et la première est un export lent de 2 MB. Pourquoi les 5 autres attendent-elles ?',
			options: [
				'TCP limite chaque connexion à une requête en vol jusqu’à la remise à zéro de la fenêtre',
				'Le serveur doit répondre dans l’ordre, donc les réponses suivantes attendent derrière l’export',
				'HTTP/1.1 interdit d’envoyer une deuxième requête avant les en-têtes de la première réponse',
				'Le navigateur attend que l’export remplisse son cache avant de lire les autres réponses'
			],
			answer: 1,
			why: 'Une connexion HTTP/1.1 porte une réponse à la fois. En pipelining, la RFC 9112 impose les réponses dans l’ordre des requêtes, donc l’export bloque le reste. Les clients ouvrent d’autres connexions pour l’éviter.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Parler HTTP/1.1 à la main : deux requêtes sur une connexion, un `Host` manquant, et un corps chunked vu brut.',
		steps: [
			'Lance nginx sur ton portable : `docker run -d --rm --name http1-lab -p 127.0.0.1:8089:80 nginx:1.27-alpine`.',
			'Envoie deux requêtes sur une seule connexion TCP, la seconde demandant la fermeture : `printf \'GET / HTTP/1.1\\r\\nHost: localhost\\r\\n\\r\\nGET / HTTP/1.1\\r\\nHost: localhost\\r\\nConnection: close\\r\\n\\r\\n\' | nc 127.0.0.1 8089`.',
			'Envoie une requête sans en-tête `Host` : `printf \'GET / HTTP/1.1\\r\\n\\r\\n\' | nc 127.0.0.1 8089 | head -1`.',
			'Laisse curl réutiliser la connexion : `curl -sv -o /dev/null -o /dev/null http://localhost:8089/ http://localhost:8089/ 2>&1 | grep -iE "connected|re-us"`.',
			'Sers la réponse chunked de l’exercice à deux clients : `python3 -c \'import socket;s=socket.socket();s.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1);s.bind(("127.0.0.1",9000));s.listen();R=b"HTTP/1.1 200 OK\\r\\nTransfer-Encoding: chunked\\r\\n\\r\\n5\\r\\nhello\\r\\n7\\r\\n, world\\r\\n0\\r\\n\\r\\n";[(lambda c:(c.recv(4096),c.sendall(R),c.close()))(s.accept()[0]) for _ in range(2)]\' &`. Lance ensuite `curl -s --raw localhost:9000` et `curl -s localhost:9000`.'
		],
		done: [
			'L’étape 2 affiche deux réponses `HTTP/1.1 200 OK` : la première avec `Connection: keep-alive`, la seconde avec `Connection: close`, puis `nc` se termine.',
			'L’étape 3 affiche `HTTP/1.1 400 Bad Request`.',
			'L’étape 4 affiche une fois `Connected to localhost` et une fois `Re-using existing connection with host localhost`.',
			'`curl --raw` montre `5`, `hello`, `7`, `, world`, `0`. `curl` seul affiche `hello, world`.'
		],
		solution: [
			'nginx a mis un `Content-Length` sur chaque réponse : `nc` a vu où finissait le premier corps et où commençait la seconde réponse, sur la même connexion.',
			'HTTP/1.1 rend `Host` obligatoire : nginx refuse la requête nue.',
			'En chunked, curl trouve la fin au morceau `0`. `--raw` saute le décodage et montre les lignes de taille. Arrête nginx avec `docker stop http1-lab`.'
		]
	},
	recall: {
		q: 'Comment un client HTTP/1.1 trouve-t-il la fin d’un corps de réponse, et que doit-il faire pour réutiliser la connexion ?',
		a: 'Par `Content-Length`, ou par le codage chunked où un morceau de taille `0` clôt le corps, sinon à la fermeture par le serveur. Il doit lire tout le corps : Go 1.24 a réutilisé 0 connexion sur 10 quand le corps était fermé sans lecture.'
	},
	sources: [
		{ title: 'RFC 9112, HTTP/1.1 (sections 2.1, 6.3, 7.1 et 9.3)', url: RFC },
		{ title: 'Code de Go 1.27.2, src/net/http/transport.go', url: TRANSPORT },
		{ title: 'Code de Go 1.27.2, src/net/http/client.go, Client.Do', url: `${GO}/client.go#L565-L572` },
		{ title: 'Documentation du paquet Go net/http', url: 'https://pkg.go.dev/net/http' },
		{ title: 'Page de manuel de curl, --raw et --verbose', url: 'https://curl.se/docs/manpage.html' }
	]
};
