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
