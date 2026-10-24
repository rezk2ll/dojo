const QGO = 'https://github.com/quic-go/quic-go/blob/9abbbad05626e3e9609e850cd98d375b73a3d2e7';
const TRANSPORT = `${QGO}/transport.go`;
const RFC9000 = 'https://www.rfc-editor.org/rfc/rfc9000';
const RFC9114 = 'https://www.rfc-editor.org/rfc/rfc9114';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'http3',
	part: 'HTTP et TLS',
	title: 'HTTP/3 et QUIC',
	minutes: 10,
	hook: [
		'Tu lances `curl -sI --http2 https://example.org/`. La réponse revient en `HTTP/2 200` sur le port TCP 443, avec un en-tête que tu n’as pas demandé : `alt-svc: h3=":443"; ma=86400`.',
		'Le serveur annonce au client que le même site parle HTTP/3 sur le port UDP 443, et que l’offre reste valable 86 400 secondes, soit 24 heures. **Un navigateur qui lit cet en-tête peut ouvrir sa prochaine connexion vers example.org en UDP au lieu de TCP.**',
		'Si un pare-feu jette l’UDP 443, cette tentative échoue. La RFC 9114 prévoit le cas : "clients SHOULD attempt to use TCP-based versions of HTTP", et la page se charge quand même en HTTP/2.'
	],
	terms: [
		{ term: 'QUIC', def: 'Un protocole de transport sur UDP (RFC 9000). Il gère lui-même ses streams, ses retransmissions, son contrôle de congestion et sa poignée de main TLS 1.3. HTTP/3, c’est HTTP posé sur des streams QUIC.' },
		{ term: 'Connection ID', def: 'Un identifiant dans l’en-tête de chaque paquet QUIC, choisi par celui qui reçoit le paquet. Le destinataire retrouve la connexion grâce à lui, quelles que soient l’adresse IP et le port d’origine.' },
		{ term: '0-RTT', def: 'Des données que le client envoie dès son tout premier envoi, avant toute réponse du serveur, avec des clés tirées d’une connexion précédente au même serveur. RFC 9000 : "0-RTT provides no protection against replay attacks".' },
		{ term: 'Alt-Svc', def: 'Un en-tête de réponse qui annonce un autre moyen de joindre la même origine. `h3=":443"` veut dire HTTP/3 sur le port UDP 443, et `ma` donne le nombre de secondes pendant lequel l’offre reste fraîche.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['phone["Téléphone en Wi-Fi 192.0.2.10:51000"] -->|"UDP : Initial, CRYPTO : ClientHello, ALPN h3, complété à 1200 octets"| server["example.org UDP 443"]'],
				highlight: ['phone'],
				note: 'Le premier paquet QUIC est un paquet Initial. Sa trame CRYPTO porte un ClientHello TLS 1.3 avec le jeton ALPN `h3`. La RFC 9000 oblige le client à compléter la charge UDP jusqu’à au moins 1200 octets. Tant qu’il n’a pas validé l’adresse, le serveur peut renvoyer au plus trois fois ce qu’il a reçu : 3600 octets ici.'
			},
			{
				add: ['server -->|"Initial + Handshake : ServerHello, certificat, Finished"| phone', 'phone -->|"Handshake : Finished, puis 1-RTT : HEADERS GET / sur le stream 0"| server'],
				highlight: ['server'],
				note: 'Le serveur répond par ses propres paquets Initial et Handshake, qui portent le ServerHello TLS, le certificat et le Finished. Le client termine la poignée de main et envoie sa requête dans le même envoi. Transport et chiffrement sont prêts en un aller-retour, alors que TCP plus TLS demande d’abord la poignée de main TCP.'
			},
			{
				add: ['lost["Paquet avec des données du stream 0 perdu"] -.->|"les données du stream 4 sont livrées"| app["La couche HTTP/3 lit le stream 4"]'],
				highlight: ['lost', 'app'],
				note: 'Les requêtes partent sur des streams bidirectionnels ouverts par le client : ID 0, 4, 8, parce que les deux bits de poids faible de l’ID donnent le type de stream. QUIC range les données par ID de stream et par offset, et ne garde l’ordre qu’à l’intérieur de chaque stream. Un paquet perdu du stream 0 ne retient pas le stream 4, contrairement à TCP sous HTTP/2.'
			},
			{
				add: ['phone4g["Même téléphone en 4G 198.51.100.7:40312"] -->|"1-RTT, même connection ID"| server', 'server -->|"PATH_CHALLENGE"| phone4g'],
				highlight: ['phone4g'],
				note: 'Le téléphone quitte le Wi-Fi, et ses paquets arrivent maintenant d’une autre adresse IP et d’un autre port. Une connexion TCP est identifiée par ces quatre valeurs, elle casserait. Le serveur QUIC retrouve la connexion par le connection ID de l’en-tête, puis teste le nouveau chemin avec un `PATH_CHALLENGE` que le client doit renvoyer dans un `PATH_RESPONSE`.'
			}
		]
	},
	example: {
		title: 'transport.go dans quic-go : un paquet est aiguillé par son connection ID',
		repo: 'quic-go/quic-go',
		url: `${TRANSPORT}#L564-L589`,
		lang: 'go',
		code: `func (t *Transport) handlePacket(p receivedPacket) {
	if len(p.data) == 0 {
		return
	}
	if !wire.IsPotentialQUICPacket(p.data[0]) && !wire.IsLongHeaderPacket(p.data[0]) {
		t.handleNonQUICPacket(p)
		return
	}
	connID, err := wire.ParseConnectionID(p.data, t.connIDLen)
	if err != nil {
		t.logger.Debugf("error parsing connection ID on packet from %s: %s", p.remoteAddr, err)
…
		p.buffer.MaybeRelease()
		return
	}

	// If there's a connection associated with the connection ID, pass the packet there.
	if handler, ok := (*packetHandlerMap)(t).Get(connID); ok {
		handler.handlePacket(p)
		return
	}`,
		notes: [
			'La ligne 5 teste des bits du premier octet. `IsPotentialQUICPacket` vérifie le bit fixe `0x40`, qui selon la RFC 9000 "allows QUIC to coexist with other protocols" sur le même port. Tout le reste part vers `handleNonQUICPacket`, ligne 6.',
			'La ligne 9 lit le connection ID de destination. L’en-tête d’un paquet 1-RTT ne donne pas sa longueur, alors [`ParseConnectionID`](' + QGO + '/internal/wire/header.go#L14-L23) prend les `t.connIDLen` octets qui suivent le premier.',
			'La ligne 18 cherche la connexion par cet ID et rien d’autre. `p.remoteAddr` n’apparaît que dans le log de la ligne 11 : un paquet venu de la nouvelle adresse 4G du téléphone arrive au même gestionnaire de connexion.',
			'La règle des 1200 octets est une constante du même projet : [`MinInitialPacketSize = 1200`](' + QGO + '/internal/protocol/protocol.go#L116-L117). La RFC 9000 ajoute que "QUIC MUST NOT be used if the network path cannot support a maximum datagram size of at least 1200 bytes".'
		]
	},
	tradeoff: {
		gain: [
			'Les poignées de main du transport et de TLS tiennent dans un seul aller-retour, et un client qui revient peut envoyer sa requête en 0-RTT dès le premier envoi.',
			'Un paquet perdu ne retarde que le stream dont il portait les données : le stream 4 continue pendant que le stream 0 attend sa retransmission.',
			'Un téléchargement survit au passage du Wi-Fi à la 4G, parce que le serveur retrouve la connexion par son connection ID.'
		],
		cost: [
			'Sur un réseau qui jette l’UDP 443, la tentative HTTP/3 échoue, et le client doit se rabattre sur HTTP/2 en TCP.',
			'Un attaquant qui enregistre des données 0-RTT peut les rejouer. La RFC 8470 limite les clients aux méthodes sûres comme `GET` dans les early data, et un serveur peut répondre `425 (Too Early)` pour faire rejouer la requête après la poignée de main.',
			'Le chemin doit porter des datagrammes UDP de 1200 octets. En dessous, la RFC 9000 interdit QUIC sur ce chemin.'
		]
	},
	task: {
		prompt: 'Trois réponses de trois sites portent ces en-têtes : (a) `alt-svc: h3=":443"; ma=86400`, (b) `alt-svc: h3=":50781"`, (c) aucun `alt-svc`. Pour chacune, dis ce qu’un navigateur qui gère HTTP/3 peut tenter ensuite, sur quel port UDP, et combien de temps il peut garder l’offre. Ensuite : le pare-feu d’un bureau jette tout l’UDP sortant. Que voient les utilisateurs sur le site (a) ?',
		hint: 'La RFC 7838 fixe la fraîcheur par défaut d’une offre Alt-Svc quand `ma` manque. La section 3.1 de la RFC 9114 dit ce que fait un client quand QUIC ne se connecte pas.',
		answer: [
			'(a) QUIC vers le même hôte sur le port UDP 443, pendant 86 400 secondes (24 heures) après la génération de la réponse.',
			'(b) QUIC sur le port UDP 50781, l’exemple de la section 3.1.1 de la RFC 9114. Sans `ma`, la RFC 7838 dit que l’offre "is considered fresh for 24 hours" : le navigateur peut donc aussi la garder 24 heures.',
			'(c) Cette réponse ne propose pas HTTP/3, le navigateur n’apprend rien et reste en TCP. La RFC 9114 dit quand même qu’un client "MAY attempt" QUIC directement sur le port de l’URL.',
			'Derrière le blocage UDP, la tentative QUIC vers le site (a) ne reçoit aucune réponse. Le client se rabat sur TCP comme le demande la RFC 9114 : les pages se chargent en HTTP/2, après le temps perdu sur la tentative ratée.'
		],
		steps: [
			{
				title: 'Lis l’offre (a)',
				questions: [
					{ q: 'Que désigne `h3` dans `alt-svc: h3=":443"` ?', options: ['HTTP/2 sur TLS', 'HTTP/3, sur QUIC en UDP', 'Un troisième serveur pour le même site', 'HTTP/1.1 avec trois connexions'], answer: 1, why: '`h3` est le jeton ALPN de HTTP/3, qui tourne sur QUIC en UDP.' },
					{ q: 'Quel port le navigateur essaie-t-il ?', options: ['TCP 443', 'UDP 80', 'UDP 443', 'TCP 8443'], answer: 2, why: '`":443"` sans hôte veut dire le même hôte sur le port 443, et HTTP/3 passe par UDP.' },
					{ q: 'Combien de temps le navigateur peut-il garder l’offre ?', options: ['86 400 secondes, 24 heures', '443 secondes', 'Jusqu’à la fermeture de l’onglet', 'Une seule requête'], answer: 0, why: '`ma=86400` est le nombre de secondes pendant lequel l’offre reste fraîche.' },
					{ q: 'Qu’est-ce qui a apporté cette offre au navigateur ?', options: ['Une réponse DNS', 'Un paquet Initial QUIC', 'Un ServerHello TLS', 'Une réponse HTTP sur TCP'], answer: 3, why: 'Dans l’accroche, `alt-svc` revient sur un `HTTP/2 200` en TCP port 443. Le navigateur peut s’en servir pour sa connexion suivante.' }
				]
			},
			{
				title: 'Lis l’offre (b)',
				questions: [
					{ q: 'Où pointe l’offre (b) ?', options: ['Le port UDP 443', 'Le port UDP 50781 du même hôte', 'Le port TCP 50781', 'Un autre hôte nommé 50781'], answer: 1, why: '`h3=":50781"` garde l’hôte et change le port. C’est l’exemple de la section 3.1.1 de la RFC 9114.' },
					{ q: 'L’offre (b) n’a pas de `ma`. Combien de temps reste-t-elle fraîche ?', options: ['24 heures, la valeur par défaut de la RFC 7838', 'Zéro : elle doit servir tout de suite', 'Toujours, jusqu’à la prochaine offre', '86 400 jours'], answer: 0, why: 'RFC 7838 : sans `ma`, l’offre "is considered fresh for 24 hours".' },
					{ q: 'Les offres (a) et (b) disent toutes deux `h3`. Qu’est-ce qui change entre elles ?', options: ['Le protocole : (b) est en HTTP/2', 'L’hôte : (b) pointe vers un autre site', 'Le port UDP, et rien d’autre en pratique', 'Le transport : (b) passe par TCP'], answer: 2, why: '(a) dit UDP 443 pour 86 400 secondes, (b) dit UDP 50781 avec les 24 heures par défaut : la même durée.' },
					{ q: 'Quelle erreur commettrait-on en lisant (b) ?', options: ['Tenter QUIC sur UDP 50781', 'Considérer l’offre fraîche pendant 24 heures', 'Garder TCP en repli', 'Attendre de `h3` qu’il passe en TCP 50781'], answer: 3, why: 'HTTP/3 tourne toujours sur QUIC en UDP. Le port change, pas le transport.' }
				]
			},
			{
				title: 'Lis (c), l’en-tête absent',
				questions: [
					{ q: 'Le site (c) n’envoie pas d’`alt-svc`. Qu’apprend le navigateur ?', options: ['Que le site interdit HTTP/3', 'Rien de nouveau : aucune offre n’est faite', 'Que HTTP/3 tourne sur UDP 443', 'Que le site ne parle que HTTP/1.1'], answer: 1, why: 'La réponse ne propose pas HTTP/3 : le navigateur reste en TCP.' },
					{ q: 'Le navigateur peut-il quand même tenter QUIC sur (c) ?', options: ['Oui : la RFC 9114 dit qu’un client "MAY attempt" sur le port de l’URL', 'Non : sans Alt-Svc, QUIC est interdit', 'Seulement après 24 heures', 'Seulement en 0-RTT'], answer: 0, why: 'Une offre Alt-Svc est un moyen d’apprendre HTTP/3, pas le seul.' },
					{ q: 'Pourquoi un site envoie-t-il Alt-Svc sur une réponse HTTP/2 ?', options: ['HTTP/2 ne peut pas porter la page', 'Pour fermer la connexion TCP', 'Le client se connecte d’abord en TCP, et y apprend l’existence de l’UDP', 'Pour prouver le certificat TLS'], answer: 2, why: 'Un navigateur commence en TCP, où il joint toujours le site, et passe à QUIC une fois prévenu.' },
					{ q: 'À partir de quand compte la valeur `ma` ?', options: ['Du démarrage du navigateur', 'Du premier paquet QUIC', 'Du TTL DNS', 'De la génération de la réponse'], answer: 3, why: 'L’offre reste fraîche `ma` secondes après la génération de la réponse.' }
				]
			},
			{
				title: 'Bloque l’UDP',
				questions: [
					{ q: 'Le pare-feu du bureau jette l’UDP sortant. Qu’arrive-t-il à la tentative QUIC vers (a) ?', options: ['Elle ne reçoit aucune réponse', 'Elle reçoit un HTTP 403', 'Le pare-feu la bascule en TCP', 'Elle se connecte plus lentement'], answer: 0, why: 'QUIC tourne sur UDP : le paquet Initial est jeté et rien ne revient.' },
					{ q: 'Que dit la RFC 9114 au client de faire ensuite ?', options: ['Réessayer QUIC jusqu’à ce que ça marche', 'Tenter les versions de HTTP sur TCP', 'Afficher une page d’erreur', 'Descendre la taille des paquets sous 1200 octets'], answer: 1, why: '"Clients SHOULD attempt to use TCP-based versions of HTTP" quand QUIC ne se connecte pas.' },
					{ q: 'Que voient les utilisateurs sur le site (a) ?', options: ['Une page cassée', 'Un avertissement de certificat', 'Les pages se chargent en HTTP/2, après le délai de la tentative ratée', 'Les pages se chargent quand même en HTTP/3'], answer: 2, why: 'Le repli garde le site en marche. Le seul coût est le temps passé sur la tentative QUIC ratée.' },
					{ q: 'Baisser la taille des paquets ferait-il passer QUIC sur un chemin qui ne porte que des datagrammes de 1000 octets ?', options: ['Oui, QUIC s’adapte à toute taille', 'Oui, avec le 0-RTT', 'Seulement sur le port 443', 'Non : QUIC est interdit sous 1200 octets'], answer: 3, why: 'RFC 9000 : "QUIC MUST NOT be used if the network path cannot support a maximum datagram size of at least 1200 bytes".' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Un téléphone télécharge un fichier en HTTP/3, puis passe du Wi-Fi à la 4G et change d’adresse IP. Pourquoi le téléchargement peut-il continuer ?',
			options: [
				'Le serveur garde l’ancienne adresse IP et fait suivre les paquets vers la nouvelle',
				'Chaque paquet porte un connection ID, et le serveur retrouve la connexion grâce à lui',
				'UDP n’a pas de connexion, donc le serveur accepte des paquets de n’importe quelle adresse',
				'Le téléphone ouvre une nouvelle connexion TCP et reprend le fichier à son offset'
			],
			answer: 1,
			why: 'L’en-tête d’un paquet QUIC porte un connection ID de destination choisi par le destinataire. Le serveur cherche la connexion par cet ID seul, puis valide la nouvelle adresse avec `PATH_CHALLENGE`.'
		},
		{
			q: 'Pourquoi un client QUIC doit-il compléter son premier paquet Initial jusqu’à au moins 1200 octets ?',
			options: [
				'Pour remplir la fenêtre de réception TCP du serveur avant que TLS commence',
				'Parce qu’une chaîne de certificats TLS 1.3 ne tient jamais dans un datagramme plus petit',
				'Pour que le serveur puisse renvoyer 3 fois plus, et prouver que le chemin porte 1200 octets',
				'Parce que la plupart des routeurs jettent les datagrammes UDP de moins de 1200 octets'
			],
			answer: 2,
			why: 'Avant de valider l’adresse du client, un serveur peut envoyer au plus trois fois les octets reçus : c’est la limite anti-amplification. Un Initial de 1200 octets lui permet d’envoyer 3600 octets, et prouve aussi que le chemin porte les datagrammes de 1200 octets qu’exige QUIC.'
		},
		{
			q: 'En HTTP/3, un paquet qui portait des données du stream de requête 0 se perd. Le stream 4 avait des données dans le paquet suivant. Qu’arrive-t-il au stream 4 ?',
			options: [
				'Il attend le stream 0, parce que QUIC livre tous les octets de la connexion dans l’ordre',
				'Ses données sont livrées tout de suite, parce que QUIC ne garde l’ordre que par stream',
				'Il est réinitialisé, parce qu’une perte sur un stream ferme toute la connexion',
				'Il est renvoyé en TCP, parce que HTTP/3 se rabat sur HTTP/2 après une perte'
			],
			answer: 1,
			why: 'QUIC range les données des trames STREAM par ID de stream et par offset, et ordonne les octets stream par stream. Seul le stream 0 attend la retransmission. Sous HTTP/2, TCP retiendrait tous les streams derrière le trou.'
		}
	],
	lab: {
		minutes: 25,
		goal: 'Servir HTTP/3 depuis un nginx local, lire son offre Alt-Svc en HTTP/2, et voir curl se rabattre sur TCP quand aucun écouteur QUIC ne répond.',
		steps: [
			'Crée un dossier et un certificat jetable : `mkdir -p ~/h3-lab && cd ~/h3-lab && openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 7 -subj /CN=localhost`.',
			'Crée `h3.conf` avec une ligne chacun : `server {`, `listen 443 ssl;`, `listen 443 quic reuseport;`, `listen 8443 ssl;`, `http2 on;`, `ssl_certificate /lab/cert.pem;`, `ssl_certificate_key /lab/key.pem;`, `add_header Alt-Svc \'h3=":443"; ma=86400\';`, `root /usr/share/nginx/html;`, `}`. Le port 443 parle TCP et UDP, le 8443 seulement TCP.',
			'Lance nginx : `docker run -d --rm --name h3-lab -v "$PWD":/lab -v "$PWD/h3.conf":/etc/nginx/conf.d/default.conf:ro nginx:1.27-alpine`.',
			'Définis un curl qui gère HTTP/3 et partage le réseau de nginx : `c() { docker run --rm --network container:h3-lab alpine/curl-http3@sha256:b0cb55696adcaf5714958926a28ce78a5fa72f6a4aa8df2ec5b72f1cde8038e3 curl -sk "$@"; }`. Lis l’offre en HTTP/2 : `c -I --http2 https://localhost/`.',
			'Prends l’offre : `c -o /dev/null -w "%{http_version}\\n" --http3-only https://localhost/`. Essaie ensuite un port sans écouteur UDP, d’abord avec `--http3-only`, puis avec `--http3` : `c -o /dev/null -w "%{http_version} %{errormsg}\\n" --http3-only https://localhost:8443/` et `c -o /dev/null -w "%{http_version}\\n" --http3 https://localhost:8443/`.'
		],
		done: [
			'L’étape 4 montre `HTTP/2 200` et `alt-svc: h3=":443"; ma=86400`.',
			'`--http3-only https://localhost/` affiche `3`.',
			'Sur le port 8443, `--http3-only` affiche `0` et une erreur QUIC, alors que `--http3` affiche `2`.'
		],
		solution: [
			'nginx parle QUIC sur UDP 443 et l’annonce dans `alt-svc` sur ses réponses TCP, comme example.org dans l’accroche.',
			'Le port 8443 n’a pas d’écouteur UDP. `--http3-only` n’a rien vers quoi se replier, et `--http3` se rabat sur TCP, comme le demande la RFC 9114. Ici, le noyau refuse le paquet UDP tout de suite. Derrière un pare-feu qui jette l’UDP en silence, la tentative QUIC attendrait d’abord un timeout.',
			'Arrête le lab avec `docker stop h3-lab`.'
		]
	},
	recall: {
		q: 'Qu’est-ce que QUIC change pour HTTP par rapport à HTTP/2 sur TCP ? Donne le transport et deux effets.',
		a: 'HTTP/3 passe par QUIC sur UDP, souvent le port 443. Une perte ne bloque que le stream qui a perdu des données, et une connexion survit à un changement d’adresse parce que les paquets portent un connection ID. La poignée de main met aussi TLS 1.3 en place en un aller-retour.'
	},
	sources: [
		{ title: 'RFC 9000, QUIC: A UDP-Based Multiplexed and Secure Transport', url: RFC9000 },
		{ title: 'RFC 9114, HTTP/3', url: RFC9114 },
		{ title: 'RFC 7838, HTTP Alternative Services', url: 'https://www.rfc-editor.org/rfc/rfc7838' },
		{ title: 'RFC 8470, Using Early Data in HTTP', url: 'https://www.rfc-editor.org/rfc/rfc8470' },
		{ title: 'quic-go, transport.go', url: TRANSPORT },
		{ title: 'quic-go, internal/protocol/protocol.go', url: `${QGO}/internal/protocol/protocol.go` }
	]
};
