const GRPCGO = 'https://github.com/grpc/grpc-go/blob/3d85ab3cf6bf8c3e19d1a763baadd0062be2fca7';
const GRPC = 'https://github.com/grpc/grpc/blob/00224790d3bdded7a4fafe9425116874cea04d62/doc';
const K8S_BLOG = 'https://kubernetes.io/blog/2018/11/07/grpc-load-balancing-on-kubernetes-without-tears/';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'grpc',
	part: 'Entre services',
	title: 'gRPC sur HTTP/2',
	minutes: 10,
	hook: [
		'Une équipe déploie une petite app gRPC sur Kubernetes. Le service de vote tourne sur plusieurs Pods derrière un Service normal. Les graphes CPU de Kubernetes montrent un seul Pod au travail, les autres à zéro.',
		'William Morgan a décrit ce cas sur le blog Kubernetes en 2018 : « only one of the pods is receiving any traffic » (un seul Pod reçoit du trafic). Le Service répartit des connexions TCP, et un client gRPC envoie tous ses appels sur une seule connexion HTTP/2.',
		'Un appel gRPC est un POST HTTP/2. Ses en-têtes nomment la méthode et peuvent porter un `grpc-timeout`, et son corps contient des messages Protobuf. Pour répartir les appels, le load balancer doit lire ces streams, et c’est au client de fixer la deadline.'
	],
	terms: [
		{ term: 'Stream', def: 'Une requête et sa réponse dans une connexion HTTP/2, avec son propre identifiant. Chaque appel gRPC utilise un stream, et de nombreux streams partagent en même temps une connexion TCP.' },
		{ term: 'Deadline', def: 'L’instant après lequel le client n’attend plus la réponse. gRPC l’envoie au serveur dans l’en-tête `grpc-timeout`, sous forme de durée restante.' },
		{ term: 'Répartition par connexion', def: 'Un load balancer de couche 4 choisit un backend à l’ouverture d’une connexion TCP et lui envoie tous les octets de cette connexion.' },
		{ term: 'Répartition par requête', def: 'Une bibliothèque cliente ou un proxy HTTP/2 choisit un backend pour chaque appel, et les appels d’un même client se répartissent sur plusieurs backends.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['client["client orders : 1 channel"] -->|"une connexion TCP + TLS"| kp["ClusterIP 10.96.0.20:50051"]', 'kp -->|"backend choisi à la connexion"| p1["Pod orders-1"]'],
				highlight: ['client', 'kp', 'p1'],
				note: 'Le client ouvre une connexion vers l’adresse du Service. La règle kube-proxy du nœud choisit un Pod pour cette connexion à son ouverture, ici `orders-1`. Avec la politique par défaut `pick_first`, gRPC envoie « all RPCs sent on the channel » (tous les appels du channel) vers cette seule adresse.'
			},
			{
				add: ['client -.->|"stream 1 : HEADERS :path /orders.Orders/Create, grpc-timeout 2000000u ; DATA"| kp'],
				highlight: ['client'],
				note: 'Chaque appel ouvre un nouveau stream d’identifiant impair : 1, 3, 5. Sa trame HEADERS porte `:method POST`, `:path /orders.Orders/Create` et `grpc-timeout`. Ses trames DATA portent le message Protobuf, précédé d’un drapeau de compression sur 1 octet et d’une longueur sur 4 octets.'
			},
			{
				add: ['p2["Pod orders-2 : inactif"]', 'p3["Pod orders-3 : inactif"]', 'kp -.-|"aucune nouvelle connexion"| p2', 'kp -.-|"aucune nouvelle connexion"| p3'],
				highlight: ['p2', 'p3'],
				note: 'Les streams 3, 5 et tous les appels suivants passent par la même connexion TCP : le nœud ne refait jamais de choix. `orders-2` et `orders-3` ne reçoivent aucun appel. Le blog Kubernetes : « Once the connection is established, there\'s no more balancing to be done. »'
			},
			{
				add: ['p1 -->|"après 2 s : DEADLINE_EXCEEDED"| client'],
				highlight: ['p1'],
				note: 'Le client a donné 2 secondes à l’appel. Une fois écoulées, il fait échouer l’appel avec `DEADLINE_EXCEEDED` (statut 4), et le serveur annule l’appel de son côté. La doc gRPC : l’application serveur « is responsible for stopping any activity it has spawned » (doit arrêter elle-même le travail lancé).'
			},
			{
				add: ['rr["client en round_robin, dns:/// sur un Service headless"] -->|"appel 1"| p1', 'rr -->|"appel 2"| p2', 'rr -->|"appel 3"| p3'],
				highlight: ['rr'],
				note: 'Un client grpc-go peut aussi répartir lui-même chaque appel. Le nom d’un Service headless se résout en toutes les IP de Pods, et la politique `round_robin` ouvre une connexion vers chacune. Elle envoie « each successive RPC to the next successive subchannel ». L’autre correction est un proxy HTTP/2 comme Envoy ou Linkerd.'
			}
		]
	},
	example: {
		title: 'grpc-go internal/transport/http2_client.go : les en-têtes de chaque appel',
		repo: 'grpc/grpc-go',
		url: `${GRPCGO}/internal/transport/http2_client.go#L591-L627`,
		lang: 'go',
		code: `	headerFields := make([]hpack.HeaderField, 0, hfLen)
	headerFields = append(headerFields, hpack.HeaderField{Name: ":method", Value: "POST"})
	headerFields = append(headerFields, hpack.HeaderField{Name: ":scheme", Value: t.scheme})
	headerFields = append(headerFields, hpack.HeaderField{Name: ":path", Value: callHdr.Method})
	headerFields = append(headerFields, hpack.HeaderField{Name: ":authority", Value: callHdr.Host})
	headerFields = append(headerFields, hpack.HeaderField{Name: "content-type", Value: grpcutil.ContentType(callHdr.ContentSubtype)})
	headerFields = append(headerFields, hpack.HeaderField{Name: "user-agent", Value: t.userAgent})
	headerFields = append(headerFields, hpack.HeaderField{Name: "te", Value: "trailers"})
…
	if dl, ok := ctx.Deadline(); ok {
		// Send out timeout regardless its value. The server can detect timeout context by itself.
		// TODO(mmukhi): Perhaps this field should be updated when actually writing out to the wire.
		timeout := time.Until(dl)
		if timeout <= 0 {
			return nil, status.Error(codes.DeadlineExceeded, context.DeadlineExceeded.Error())
		}
		headerFields = append(headerFields, hpack.HeaderField{Name: "grpc-timeout", Value: grpcutil.EncodeDuration(timeout)})
	}`,
		notes: [
			'La ligne 2 fait de chaque appel un `POST` HTTP/2. La ligne 4 met le nom de la méthode dans `:path`, par exemple `/orders.Orders/Create`. Un proxy HTTP/2 lit cet en-tête pour router ou répartir chaque appel ; un load balancer de couche 4 ne le voit jamais.',
			'La ligne 8 envoie `te: trailers`. Le [document du protocole gRPC](' + GRPC + '/PROTOCOL-HTTP2.md?plain=1#L30) dit que cet en-tête sert à détecter les proxys incompatibles (« Used to detect incompatible proxies »). Le statut `grpc-status` revient dans les trailers, après le corps de la réponse.',
			'La ligne 10 lit la deadline dans le `context` Go. La ligne 13 la convertit en temps restant, et la ligne 17 l’envoie dans `grpc-timeout`. Un contexte sans deadline n’envoie pas d’en-tête, et le document du protocole dit qu’un serveur « should assume an infinite timeout ».',
			'Les lignes 14 et 15 font échouer l’appel avec `DeadlineExceeded` avant d’envoyer le moindre octet si le temps est déjà écoulé. Côté serveur, [http2_server.go](' + GRPCGO + '/internal/transport/http2_server.go#L535-L539) enveloppe le stream dans `context.WithTimeout(ctx, timeout)` : le handler voit la même deadline.'
		]
	},
	tradeoff: {
		gain: [
			'Une seule connexion TCP et TLS porte de nombreux appels en même temps : aucun appel ne paie de handshake.',
			'La deadline voyage avec chaque appel dans l’en-tête `grpc-timeout`. Selon la doc gRPC, Go et Java la propagent par défaut aux appels sortants, en retirant le temps déjà passé.',
			'`round_robin` dans le client répartit les appels sur tous les Pods sans passer par un proxy, grâce au nom d’un Service headless.'
		],
		cost: [
			'Un load balancer de couche 4, comme un Service Kubernetes normal, envoie tous les appels d’une connexion au même backend.',
			'gRPC ne fixe aucune deadline par défaut, et un client peut donc « end up waiting for a response effectively forever » (attendre indéfiniment).',
			'Un appel annulé n’arrête que le stream gRPC. Le code serveur doit vérifier son contexte et arrêter le travail qu’il a lancé.'
		]
	},
	task: {
		prompt: 'Un client Go appelle un serveur gRPC avec un contexte à deadline. [`EncodeDuration`](' + GRPCGO + '/internal/grpcutil/encode_duration.go#L26-L62) prend la plus petite unité parmi `n`, `u`, `m`, `S`, `M`, `H` dont la valeur tient sur 8 chiffres (99 999 999 au plus). Écris l’en-tête `grpc-timeout` envoyé quand il reste 50 ms, 1,5 s et 10 minutes.',
		hint: 'Convertis d’abord en nanosecondes. Si le nombre a plus de 8 chiffres, passe aux microsecondes, puis aux millisecondes.',
		answer: [
			'50 ms font 50 000 000 ns : 8 chiffres, ça tient. L’en-tête est `grpc-timeout: 50000000n`.',
			'1,5 s font 1 500 000 000 ns : 10 chiffres, c’est trop. En microsecondes, on a 1 500 000, donc l’en-tête est `1500000u`.',
			'10 minutes font 600 000 000 000 ns, puis 600 000 000 µs (9 chiffres) : trop dans les deux cas. En millisecondes, on a 600 000 : `600000m`.',
			'En pratique, `time.Until` ligne 13 renvoie un peu moins que la valeur ronde, et `div` arrondit la dernière unité vers le haut. Un vrai en-tête pour 1,5 s vaut quelques microsecondes de moins que `1500000u`.'
		]
	},
	quiz: [
		{
			q: 'Un client grpc-go aux réglages par défaut ouvre un channel vers un Service Kubernetes normal à 3 Pods et envoie 1000 appels. Où vont-ils ?',
			options: [
				'Environ 333 par Pod, car kube-proxy répartit chaque appel',
				'Les 1000 vers le Pod choisi à l’ouverture de la connexion TCP',
				'Vers le Pod qui a le moins de connexions ouvertes à chaque appel',
				'Vers les 3 Pods, car HTTP/2 ouvre une connexion par stream'
			],
			answer: 1,
			why: 'kube-proxy choisit un backend par connexion TCP. La politique par défaut `pick_first` garde une seule connexion, et chaque appel est un stream dessus : le choix n’a lieu qu’une fois.'
		},
		{
			q: 'Un client Go appelle `GetUserProfile` avec une deadline de 2 s. Le serveur passe 0,5 s, puis appelle `GetTransactionHistory` avec le contexte entrant. Quelle deadline reçoit le second serveur ?',
			options: [
				'2 s, car la deadline est recopiée telle quelle à chaque appel',
				'Aucune, car une deadline ne vaut que pour le premier saut',
				'Environ 1,5 s, car le temps déjà passé est retiré',
				'2 s plus l’écart d’horloge entre les deux serveurs'
			],
			answer: 2,
			why: 'Go propage la deadline du contexte entrant. gRPC la convertit en durée, temps écoulé déjà retiré, et l’envoie dans `grpc-timeout`, ce qui évite aussi les écarts d’horloge entre serveurs.'
		},
		{
			q: 'Un client ne fixe aucune deadline et le serveur reste bloqué pour toujours sur un verrou de base de données. Que voit le client ?',
			options: [
				'`DEADLINE_EXCEEDED` après le timeout gRPC par défaut de 30 s',
				'`UNAVAILABLE` quand la connexion HTTP/2 atteint son timeout d’inactivité',
				'`CANCELLED`, car le serveur annule les appels sans deadline',
				'Rien : l’appel attend, aucun en-tête `grpc-timeout` n’est parti'
			],
			answer: 3,
			why: 'Sans deadline dans le contexte, la ligne 10 n’envoie pas de `grpc-timeout`, et le serveur suppose un timeout infini. gRPC ne fixe aucune deadline par défaut : l’appel attend jusqu’à ce que la connexion casse pour une autre raison.'
		}
	],
	recall: {
		q: 'Pourquoi un Service Kubernetes normal envoie-t-il tous les appels d’un client gRPC au même Pod ?',
		a: 'kube-proxy choisit un Pod une fois par connexion TCP, et gRPC envoie chaque appel comme un stream sur une seule connexion HTTP/2 durable. La répartition par requête (`round_robin` dans le client, ou un proxy HTTP/2) répartit les appels.'
	},
	sources: [
		{ title: 'gRPC over HTTP2 (PROTOCOL-HTTP2.md)', url: `${GRPC}/PROTOCOL-HTTP2.md` },
		{ title: 'Doc gRPC, Deadlines', url: 'https://grpc.io/docs/guides/deadlines/' },
		{ title: 'gRPC, Load Balancing in gRPC (load-balancing.md)', url: `${GRPC}/load-balancing.md` },
		{ title: 'Blog gRPC, gRPC Load Balancing', url: 'https://grpc.io/blog/grpc-load-balancing/' },
		{ title: 'Blog Kubernetes, gRPC Load Balancing on Kubernetes without Tears (2018)', url: K8S_BLOG },
		{ title: 'Code source de grpc-go, internal/transport/http2_client.go', url: `${GRPCGO}/internal/transport/http2_client.go` }
	]
};
