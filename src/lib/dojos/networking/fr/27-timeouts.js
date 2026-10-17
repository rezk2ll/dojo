const GO = 'https://github.com/golang/go/blob/c3a068eec992b5ae783abce1a9d03f617b671ea2/src/net/http';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'timeouts',
	part: 'Entre services',
	title: 'Les timeouts',
	minutes: 10,
	hook: [
		'Une appli Node.js tourne derrière un AWS Application Load Balancer. Le journal du balancer montre un 502 de temps en temps, et celui de l’appli n’a aucune requête à ce moment-là. Le balancer garde une connexion inactive vers l’appli ouverte 60 secondes par défaut. Node.js détruit une socket keep-alive inactive après `server.keepAliveTimeout` (5000 ms par défaut) plus `keepAliveTimeoutBuffer` (1000 ms depuis la v24.6.0).',
		'La page de dépannage d’AWS range ce cas parmi les causes de 502 : "The target closed the connection with a TCP RST or a TCP FIN while the load balancer had an outstanding request to the target." L’appli a fermé une connexion inactive juste au moment où le balancer y envoyait une nouvelle requête.',
		'Chaque saut sur le chemin d’une requête a ses propres timeouts : un pour se connecter, un pour attendre la réponse, un pour une connexion inactive, et parfois un pour l’appel entier. **Les idle timeouts des deux bouts d’une même connexion doivent être ordonnés**, sinon la course ci-dessus se produit.'
	],
	terms: [
		{ term: 'Connect timeout', def: 'Le temps qu’un client attend la fin de la poignée de main TCP. Le `DefaultTransport` de Go se connecte avec `Timeout: 30 * time.Second` et laisse 10 secondes de plus à la poignée de main TLS.' },
		{ term: 'Read timeout', def: 'Le temps qu’un côté attend des données de l’autre. Le `proxy_read_timeout 60s` de nginx compte entre deux lectures depuis le backend, et le `ReadTimeout` de Go couvre la lecture de toute la requête.' },
		{ term: 'Idle timeout', def: 'Le temps qu’une connexion keep-alive peut rester sans requête avant que son propriétaire la ferme. Le `http.Server` de Go l’appelle `IdleTimeout`, Node.js l’appelle `keepAliveTimeout`.' },
		{ term: 'Timeout total', def: 'Une limite sur l’appel entier : connexion, redirections, en-têtes et corps. Le `http.Client{Timeout: 5 * time.Second}` de Go en est un.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['lb["Load balancer, idle timeout 60 s"] -->|"GET /a, 200, connexion gardée"| app["Appli Node.js, keepAliveTimeout 5 s"]'],
				highlight: ['lb', 'app'],
				note: 'Le balancer envoie `GET /a` et reçoit un `200`. Les deux bouts gardent la connexion TCP pour la requête suivante. Le balancer peut la réutiliser pendant 60 secondes, et l’appli la garde environ 6 secondes.'
			},
			{
				add: ['app -.->|"t = 6 s : FIN, socket détruite"| lb'],
				highlight: ['app'],
				note: 'Six secondes après sa dernière réponse (5 s de `keepAliveTimeout` plus 1 s de marge), l’appli détruit la socket et son noyau envoie un FIN. Le FIN met un peu de temps à arriver, et pendant ce temps le balancer voit toujours la connexion comme inactive et utilisable.'
			},
			{
				add: ['c["Client"] -->|"GET /b"| lb', 'lb -->|"GET /b sur la même connexion"| app'],
				highlight: ['c', 'lb'],
				note: 'Une nouvelle requête client tombe dans cet intervalle. Le balancer prend la connexion inactive et y écrit `GET /b` avant d’avoir traité le FIN.'
			},
			{
				add: ['lb -->|"502 Bad Gateway"| c'],
				highlight: ['c'],
				note: 'Le côté de l’appli est fermé : `GET /b` reçoit un RST TCP ou le FIN, jamais une réponse. Le balancer répond 502 au client. L’appli n’a jamais lu `GET /b`, et son journal reste vide à ce moment.'
			},
			{
				add: ['fix["keepAliveTimeout 65 s, au-dessus des 60 s du balancer"] --> app'],
				highlight: ['fix'],
				note: 'AWS recommande de "configure the idle timeout of your application to be larger than the idle timeout configured for the load balancer". Avec 65 s côté appli, le balancer ferme toujours la connexion inactive en premier, et il n’écrit jamais sur une connexion que l’appli a fermée.'
			}
		]
	},
	example: {
		title: 'src/net/http/transport.go : le client Go rejoue la course du keep-alive',
		repo: 'golang/go',
		url: `${GO}/transport.go#L836-L881`,
		lang: 'go',
		code: `func (pc *persistConn) shouldRetryRequest(req *Request, err error) bool {
	if http2isNoCachedConnError(err) {
		// Issue 16582: if the user started a bunch of
		// requests at once, they can all pick the same conn
		// and violate the server's max concurrent streams.
		// Instead, match the HTTP/1 behavior for now and dial
		// again to get a new TCP connection, rather than failing
		// this request.
		return true
	}
	if err == errMissingHost {
		// User error.
		return false
	}
	if !pc.isReused() {
		// This was a fresh connection. There's no reason the server
		// should've hung up on us.
		//
		// Also, if we retried now, we could loop forever
		// creating new connections and retrying if the server
		// is just hanging up on us because it doesn't like
		// our request (as opposed to sending an error).
		return false
	}
	if _, ok := err.(nothingWrittenError); ok {
		// We never wrote anything, so it's safe to retry, if there's no body or we
		// can "rewind" the body with GetBody.
		return req.outgoingLength() == 0 || req.GetBody != nil
	}
	if !req.isReplayable() {
		// Don't retry non-idempotent requests.
		return false
	}
	if _, ok := err.(transportReadFromServerError); ok {
		// We got some non-EOF net.Conn.Read failure reading
		// the 1st response byte from the server.
		return true
	}
	if err == errServerClosedIdle {
		// The server replied with io.EOF while we were trying to
		// read the response. Probably an unfortunately keep-alive
		// timeout, just as the client was writing a request.
		return true
	}
	return false // conservatively
}`,
		notes: [
			'Cette fonction tourne côté client, après l’échec d’une requête sur une connexion du pool. Elle décide si le `Transport` renvoie la requête sur une nouvelle connexion.',
			'La ligne 15 refuse de rejouer sur une connexion neuve. Un serveur qui raccroche sur une connexion neuve rejette sans doute la requête, et rejouer pourrait boucler sans fin.',
			'Les lignes 39 à 43 traitent la course du schéma. `errServerClosedIdle` veut dire que le serveur a renvoyé EOF sur une connexion réutilisée, et le commentaire parle de "Probably an unfortunately keep-alive timeout".',
			'La ligne 30 bloque le rejeu d’une requête non rejouable. [`isReplayable`](' + GO + '/request.go#L1557-L1571) accepte GET, HEAD, OPTIONS, TRACE et QUERY, ou une requête avec un en-tête `Idempotency-Key`. Un POST simple pris dans la course renvoie une erreur à ton code.'
		]
	},
	tradeoff: {
		gain: [
			'Un client Go avec `Timeout: 5 * time.Second` qui appelle un handler qui dort 8 s rend la main après 5,0 s avec "context deadline exceeded (Client.Timeout exceeded while awaiting headers)" (go1.24.4, lancé pour ce chapitre).',
			'Un idle timeout côté appli au-dessus de celui du balancer (65 s contre 60 s) supprime la course du keep-alive : seul le balancer ferme les connexions inactives.'
		],
		cost: [
			'`http.Client.Timeout` et `Transport.ResponseHeaderTimeout` valent zéro par défaut, donc aucune limite. Un client qui utilise `http.DefaultClient` attend sans fin un serveur qui accepte la connexion et ne répond jamais.',
			'`Client.Timeout` continue de tourner pendant la lecture du corps. Une limite de 5 s coupe un téléchargement de 200 MB qui demande 20 s, même si chaque octet arrive à temps.',
			'Ajouter nginx entre le balancer et l’appli ajoute une connexion, donc une paire d’idle timeouts de plus à ordonner : le `keepalive_timeout` upstream de nginx (60 s par défaut) doit rester sous celui de l’appli.'
		]
	},
	task: {
		prompt: 'Trois services Go sont derrière un load balancer avec l’idle timeout par défaut de 60 s. Le service A a `http.Server{IdleTimeout: 30 * time.Second}`. Le service B a `http.Server{ReadTimeout: 10 * time.Second}` et pas d’`IdleTimeout`. Le service C a `http.Server{ReadHeaderTimeout: 5 * time.Second, IdleTimeout: 120 * time.Second}`. Lesquels peuvent produire la course au 502, et après combien de secondes d’inactivité ferment-ils ?',
		hint: 'Lis le commentaire de `IdleTimeout` dans le `server.go` de Go : sur quoi se rabat une valeur nulle ?',
		answer: [
			'Le service A ferme une connexion inactive après 30 s. Le balancer peut encore la réutiliser jusqu’à 60 s : A peut produire des 502.',
			'Le service B n’a pas d’`IdleTimeout`, donc Go prend `ReadTimeout` : "If zero, the value of ReadTimeout is used." Il ferme les connexions inactives après 10 s, ce qui rend la course encore plus probable que chez A.',
			'Le service C ferme après 120 s, plus tard que les 60 s du balancer. Le balancer ferme toujours en premier : C ne risque rien. Son `ReadHeaderTimeout` de 5 s ne limite que la lecture des en-têtes de chaque requête et ne joue aucun rôle ici.',
			'Corrige A et B en mettant `IdleTimeout` au-dessus de 60 s, par exemple `IdleTimeout: 75 * time.Second`.'
		]
	},
	quiz: [
		{
			q: 'Un load balancer avec un idle timeout de 60 s est devant une appli dont le keep-alive timeout vaut 5 s. Les utilisateurs voient de rares 502 absents du journal de l’appli. Quelle est la cause ?',
			options: [
				'L’appli est trop lente et le balancer abandonne l’attente de sa réponse',
				'L’appli ferme une connexion inactive juste quand le balancer la réutilise',
				'Le balancer ouvre trop de connexions et l’appli refuse les nouvelles',
				'Le health check du balancer marque l’appli hors service quelques secondes'
			],
			answer: 1,
			why: 'L’appli ferme les connexions inactives après 5 s, alors que le balancer les croit utilisables pendant 60 s. Une requête écrite sur une connexion que l’appli vient de fermer reçoit un RST ou un FIN au lieu d’une réponse, et le balancer en fait un 502. L’appli n’a jamais lu la requête, donc elle ne journalise rien.'
		},
		{
			q: 'Un client Go avec `http.Client{Timeout: 5 * time.Second}` appelle un endpoint qui met 8 s avant d’envoyer ses en-têtes. Que se passe-t-il ?',
			options: [
				'L’appel rend la réponse après 8 s, car le timeout ne couvre que la connexion',
				'L’appel attend sans fin, car `Timeout` ne s’applique qu’après les en-têtes',
				'L’appel échoue après 5 s avec "Client.Timeout exceeded while awaiting headers"',
				'L’appel échoue après 30 s, car `DefaultTransport` se connecte avec 30 s de limite'
			],
			answer: 2,
			why: '`Client.Timeout` couvre l’appel entier : connexion, en-têtes et corps. Le test lancé pour ce chapitre a rendu la main après 5,0 s avec "context deadline exceeded (Client.Timeout exceeded while awaiting headers)". La limite de 30 s ne porte que sur la connexion TCP.'
		},
		{
			q: 'Le `Transport` de Go reçoit `errServerClosedIdle` sur une connexion réutilisée. Quelle requête renvoie-t-il sur une nouvelle connexion ?',
			options: [
				'N’importe laquelle, car le serveur ne l’a jamais reçue',
				'Un POST sans corps, car il n’a aucune donnée à répéter',
				'Seulement une requête partie sur une connexion neuve, jamais mise en pool',
				'Un GET, mais pas un POST sans en-tête `Idempotency-Key`'
			],
			answer: 3,
			why: '`shouldRetryRequest` renvoie false pour une requête non rejouable avant d’arriver au cas `errServerClosedIdle`. `isReplayable` accepte GET, HEAD, OPTIONS, TRACE et QUERY, ou une requête avec `Idempotency-Key`. Sur une connexion neuve, `pc.isReused()` vaut false et la fonction renvoie false avant tous ces tests.'
		}
	],
	recall: {
		q: 'Quel idle timeout doit être le plus long, celui du load balancer ou celui de l’appli, et que se passe-t-il dans l’autre sens ?',
		a: 'Celui de l’appli, par exemple 65 s contre 60 s pour le balancer. Si l’appli ferme en premier (Node.js : 5 s plus 1 s de marge par défaut), le balancer peut envoyer une requête sur une connexion que l’appli vient de fermer et renvoie un 502.'
	},
	sources: [
		{ title: 'Doc AWS, Troubleshoot your Application Load Balancers (HTTP 502)', url: 'https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-troubleshooting.html' },
		{ title: 'Doc AWS, Edit attributes for your Application Load Balancer (connection idle timeout)', url: 'https://docs.aws.amazon.com/elasticloadbalancing/latest/application/edit-load-balancer-attributes.html' },
		{ title: 'Doc Node.js, http : server.keepAliveTimeout', url: 'https://nodejs.org/api/http.html' },
		{ title: 'Source Go, net/http/server.go : timeouts du Server', url: 'https://github.com/golang/go/blob/c3a068eec992b5ae783abce1a9d03f617b671ea2/src/net/http/server.go#L3226-L3255' },
		{ title: 'Source Go, net/http/client.go : Client.Timeout', url: 'https://github.com/golang/go/blob/c3a068eec992b5ae783abce1a9d03f617b671ea2/src/net/http/client.go#L92-L102' },
		{ title: 'Doc nginx, module ngx_http_proxy_module (proxy_read_timeout)', url: 'https://nginx.org/en/docs/http/ngx_http_proxy_module.html' },
		{ title: 'Doc nginx, module ngx_http_upstream_module (keepalive_timeout)', url: 'https://nginx.org/en/docs/http/ngx_http_upstream_module.html' }
	]
};
