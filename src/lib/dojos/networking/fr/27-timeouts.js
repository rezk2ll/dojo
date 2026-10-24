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
		],
		steps: [
			{
				title: 'Trouve chaque idle timeout',
				questions: [
					{ q: 'Après combien de secondes d’inactivité le service A ferme-t-il une connexion ?', options: ['30 s', '60 s', 'Jamais : il n’a pas de limite', '120 s'], answer: 0, why: '`IdleTimeout: 30 * time.Second` est posé directement sur A.' },
					{ q: 'Le service B n’a pas d’`IdleTimeout`. Que prend Go à la place ?', options: ['Aucune limite : les connexions inactives restent ouvertes pour de bon', '`ReadTimeout`, donc 10 s', 'Une valeur par défaut intégrée de 60 s', '`ReadHeaderTimeout`, que B ne pose pas'], answer: 1, why: 'Le commentaire dit : "If zero, the value of ReadTimeout is used." B a `ReadTimeout: 10 * time.Second`.' },
					{ q: 'Après combien de secondes d’inactivité le service C ferme-t-il ?', options: ['5 s, via `ReadHeaderTimeout`', '60 s, comme le balancer', '120 s', '10 s, comme B'], answer: 2, why: 'C pose lui-même `IdleTimeout: 120 * time.Second`, donc aucun repli ne s’applique.' },
					{ q: 'Que limite le `ReadHeaderTimeout` de 5 s de C ?', options: ['Le temps d’inactivité entre deux requêtes', 'Le temps d’écrire toute la réponse', 'La connexion TCP depuis le balancer', 'Le temps de lire les en-têtes de chaque requête'], answer: 3, why: 'Il ne couvre que la lecture des en-têtes de la requête. Il ne joue aucun rôle dans la course à l’inactivité.' }
				]
			},
			{
				title: 'Compare avec le balancer',
				questions: [
					{ q: 'Quel côté doit fermer une connexion inactive en premier ?', options: ['L’appli, pour que le balancer n’attende jamais', 'Le balancer, donc l’idle timeout de l’appli doit être plus long', 'L’un ou l’autre, tant que les deux restent sous 60 s', 'Aucun : il faut couper le keep-alive'], answer: 1, why: 'AWS recommande un idle timeout d’appli "larger than the idle timeout configured for the load balancer". Le balancer n’écrit alors jamais sur une connexion que l’appli a fermée.' },
					{ q: 'Le service A peut-il produire la course aux 502 ?', options: ['Oui : il ferme à 30 s, et le balancer peut réutiliser la connexion jusqu’à 60 s', 'Non : 30 s est la moitié de 60 s, donc ils ne se croisent jamais', 'Non : Go retente la requête pour le balancer', 'Seulement quand l’appli est très chargée'], answer: 0, why: 'Entre 30 s et 60 s d’inactivité, le balancer croit la connexion utilisable alors que A l’a fermée.' },
					{ q: 'Le service B peut-il la produire ?', options: ['Non : `ReadTimeout` ne couvre que la lecture d’une requête', 'Non : sans `IdleTimeout`, il ne ferme jamais', 'Seulement pour les requêtes POST', 'Oui : il ferme à 10 s, encore plus probable que A'], answer: 3, why: 'Le repli donne à B un idle timeout de 10 s. L’écart jusqu’aux 60 s du balancer est plus large que pour A.' },
					{ q: 'Le service C peut-il la produire ?', options: ['Oui : 120 s, c’est trop long', 'Oui : `ReadHeaderTimeout` ferme les connexions inactives à 5 s', 'Non : le balancer ferme en premier, à 60 s', 'Seulement quand le balancer redémarre'], answer: 2, why: 'C garde les connexions inactives plus longtemps que le balancer, donc seul le balancer les ferme.' }
				]
			},
			{
				title: 'Visualise la course',
				questions: [
					{ q: 'Qu’est-ce qui se passe mal dans la course ?', options: ['Le balancer écrit une requête sur une connexion que l’appli vient de fermer', 'Le balancer ouvre plus de connexions que l’appli n’en accepte', 'L’appli met plus de 60 s à répondre', 'Le health check marque l’appli comme down'], answer: 0, why: 'Le FIN de l’appli est encore en route quand le balancer choisit la connexion inactive et écrit dessus.' },
					{ q: 'Que reçoit le client ?', options: ['Un `504 Gateway Timeout` après 60 s', 'Un `200` en retard', 'Un `502 Bad Gateway`', 'Une connexion refusée'], answer: 2, why: 'La requête reçoit un RST ou un FIN au lieu d’une réponse, et le balancer en fait un 502.' },
					{ q: 'Pourquoi le journal de l’appli est-il vide à ce moment-là ?', options: ['Ses journaux perdent des requêtes sous charge', 'Elle n’a jamais lu la requête', 'Elle a planté puis redémarré', 'La requête est partie vers une autre instance'], answer: 1, why: 'L’appli avait déjà fermé le socket. La requête n’a jamais atteint son code HTTP.' },
					{ q: 'Pourquoi B risque-t-il la course plus que A ?', options: ['Il a un `ReadTimeout`, A non', 'Ses requêtes sont plus grosses', 'Il tourne sur une autre version de Go', 'Il ferme à 10 s, donc la fenêtre à risque jusqu’à 60 s fait 50 s au lieu de 30 s'], answer: 3, why: 'Toute réutilisation entre la fermeture par l’appli et les 60 s du balancer peut tomber dans la course. Plus l’appli ferme tôt, plus la fenêtre est large.' }
				]
			},
			{
				title: 'Corrige',
				questions: [
					{ q: 'Comment corriger A et B ?', options: ['Mettre l’idle timeout du balancer à 120 s', 'Mettre `ReadTimeout: 0` sur les deux', 'Mettre `IdleTimeout` au-dessus de 60 s, par exemple `75 * time.Second`', 'Ajouter un retry dans chaque client du balancer'], answer: 2, why: 'Un idle timeout d’appli au-dessus de celui du balancer veut dire que seul le balancer ferme les connexions inactives.' },
					{ q: 'B a maintenant `IdleTimeout: 75 * time.Second`. Que fait encore son `ReadTimeout` de 10 s ?', options: ['Il limite toujours la lecture de chaque requête, mais ne fixe plus le temps d’inactivité', 'Il ferme toujours les connexions inactives à 10 s', 'Il faut le retirer, sinon il écrase `IdleTimeout`', 'Il passe lui aussi à 75 s'], answer: 0, why: 'Le repli ne s’applique que si `IdleTimeout` vaut zéro. Une fois posé, `ReadTimeout` ne couvre plus que la lecture de la requête.' },
					{ q: 'Tu ajoutes nginx entre le balancer et l’appli. Que dois-tu ordonner en plus ?', options: ['Rien : nginx supprime la course', '`proxy_read_timeout` au-dessus de 60 s', 'Le timeout client de nginx égal à celui de l’appli', 'Le `keepalive_timeout` upstream de nginx (60 s par défaut) sous celui de l’appli'], answer: 3, why: 'nginx ajoute une seconde connexion, donc une seconde paire d’idle timeouts. Le côté qui réutilise les connexions doit fermer en premier.' },
					{ q: 'Un client Go tombe dans la course avec un `GET` sur une connexion réutilisée. Que fait le `Transport` de Go ?', options: ['Il renvoie l’erreur à ton code', 'Il renvoie la requête sur une nouvelle connexion', 'Il attend 60 s, puis réessaie', 'Il réessaie sur la même connexion'], answer: 1, why: '`errServerClosedIdle` sur une connexion réutilisée donne lieu à un nouvel essai, et un `GET` est rejouable. Un `POST` simple ne le serait pas.' }
				]
			}
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
	lab: {
		minutes: 15,
		goal: 'Mesurer quand un serveur Node.js ferme une connexion keep-alive inactive, relever cette limite, et voir un timeout total côté client couper un appel lent.',
		steps: [
			'Crée un dossier : `mkdir -p ~/timeout-lab && cd ~/timeout-lab`. Crée `server.js` avec cette ligne : `const s = require(\'http\').createServer((q, r) => { if (q.url === \'/slow\') setTimeout(() => r.end(\'slow\\n\'), 8000); else r.end(\'ok\\n\'); }); if (process.env.KA) s.keepAliveTimeout = Number(process.env.KA); s.listen(3000, () => console.log(\'keepAliveTimeout\', s.keepAliveTimeout));`',
			'Crée `idle.js`, un client qui envoie une requête puis reste inactif : `const t = Date.now(); const c = require(\'net\').connect(3000, \'localhost\', () => c.write(\'GET / HTTP/1.1\\r\\nHost: localhost\\r\\n\\r\\n\')); c.on(\'data\', () => {}); c.on(\'close\', () => { console.log(\'server closed the idle connection after\', ((Date.now() - t) / 1000).toFixed(1), \'s\'); process.exit(); }); setTimeout(() => { console.log(\'still open at 30 s\'); process.exit(); }, 30000);`',
			'Lance `node server.js` dans un terminal et `node idle.js` dans un autre.',
			'Appelle l’endpoint lent avec et sans timeout total : `curl -sS --max-time 5 localhost:3000/slow`, puis `curl -sS localhost:3000/slow -w "%{time_total}\\n"`.',
			'Arrête le serveur, relance-le avec `KA=65000 node server.js`, et relance `node idle.js`.'
		],
		done: [
			'Avec les valeurs par défaut, le serveur affiche `keepAliveTimeout 5000` et `idle.js` affiche `server closed the idle connection after` environ 6 s, par exemple `6.1 s` (environ 5 s avec un Node antérieur à 24.6).',
			'`curl --max-time 5` échoue avec `curl: (28) Operation timed out after` environ 5000 millisecondes `with 0 bytes received`, et l’appel sans limite affiche `slow` après environ 8 s.',
			'Avec `KA=65000`, `idle.js` affiche `still open at 30 s`.'
		],
		solution: [
			'Node.js détruit un socket inactif après `keepAliveTimeout` plus `keepAliveTimeoutBuffer` : 5 s plus 1 s. Un balancer avec un idle timeout de 60 s continuerait d’utiliser cette connexion pendant 54 s : la fenêtre de la course.',
			'`--max-time` est un timeout total comme le `Client.Timeout` de Go : il couvre tout l’appel, donc l’endpoint de 8 s échoue à 5 s.',
			'65 s dépasse un balancer à 60 s, donc le balancer fermerait toujours en premier.'
		]
	},
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
