const XNET = 'https://github.com/golang/net/blob/7e562009b3884a0845019b5f886f0242a7c0b970/http2';
const FRAME = `${XNET}/frame.go`;
const CF = 'https://blog.cloudflare.com/technical-breakdown-http2-rapid-reset-ddos-attack/';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'http2',
	part: 'HTTP et TLS',
	title: 'HTTP/2',
	minutes: 10,
	hook: [
		'À partir du 25 août 2023, Cloudflare voit des attaques HTTP/2 qui culminent juste au-dessus de 201 millions de requêtes par seconde. Le botnet derrière compte environ 20 000 machines.',
		'Cloudflare reproduit l’attaque contre un serveur de test qui annonce une limite de 100 streams simultanés. **Un seul paquet TCP du client porte 525 requêtes, jusqu’au stream 1051**, chacune annulée aussitôt par une trame `RST_STREAM`. Un stream annulé ne compte plus dans la limite, donc le client n’attend jamais.',
		'La faille s’appelle CVE-2023-44487, « Rapid Reset ». Les proxys de Cloudflare transmettaient chaque requête à un service amont dès sa lecture, et les serveurs amont saturaient avant que les annulations les rattrapent.'
	],
	terms: [
		{ term: 'Stream', def: 'Une requête et sa réponse à l’intérieur d’une connexion HTTP/2, numérotées par un stream ID de 31 bits. Les streams ouverts par le client ont des ID impairs : 1, 3, 5.' },
		{ term: 'Frame', def: 'L’unité qu’envoie HTTP/2 : un en-tête de 9 octets (longueur, type, flags, stream ID) puis une charge. `HEADERS` porte les en-têtes de la requête, `DATA` le corps, `RST_STREAM` annule un stream.' },
		{ term: 'HPACK', def: 'La compression d’en-têtes de HTTP/2 (RFC 7541). Un en-tête courant tient en un octet, un index dans une table statique de 61 entrées. Les en-têtes déjà envoyés sur la connexion vont dans une table dynamique de 4 096 octets par défaut.' },
		{ term: 'ALPN', def: 'Une extension TLS où le client liste les protocoles qu’il parle et le serveur en choisit un. curl propose `h2,http/1.1`, et le serveur répond `h2` pour choisir HTTP/2.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['client["curl --http2 --parallel, 3 URL"] -->|"TLS ClientHello, ALPN : h2,http/1.1"| server["example.org:443"]', 'server -->|"ALPN : server accepted h2"| client'],
				highlight: ['client', 'server'],
				note: 'Le protocole se choisit pendant la poignée de main TLS. Dans un essai fait pour ce chapitre, curl a affiché `ALPN: curl offers h2,http/1.1` puis `ALPN: server accepted h2`. Chaque côté envoie ensuite une préface : le client commence par la chaîne de 24 octets `PRI * HTTP/2.0`, et les deux envoient une trame `SETTINGS`.'
			},
			{
				add: ['client -->|"HEADERS stream 1 : GET /"| server', 'client -->|"HEADERS stream 3 : GET /index.html"| server', 'client -->|"HEADERS stream 5 : GET /a"| server'],
				highlight: ['client'],
				note: 'curl a affiché `[HTTP/2] [1] OPENED stream`, puis `Multiplexed connection found` et les streams `[3]` et `[5]`. Les trois requêtes partagent une seule connexion TCP, et aucune n’attend la réponse d’une autre. La RFC 9113 recommande qu’un serveur accepte au moins 100 streams simultanés.'
			},
			{
				add: ['server -->|"DATA s1, DATA s5, DATA s1, DATA s3"| client'],
				highlight: ['server'],
				note: 'Le serveur entrelace les trames `DATA` de plusieurs streams, et chaque en-tête de trame nomme son stream. Une grosse réponse sur le stream 1 ne retient plus la petite du stream 5, comme elle le ferait sur une seule connexion HTTP/1.1. Une trame `DATA` porte au plus 16 384 octets, sauf si le destinataire relève `SETTINGS_MAX_FRAME_SIZE`.'
			},
			{
				add: ['hpack["HPACK : :method GET = 0x82, :path / = 0x84"] -.-> client'],
				highlight: ['hpack'],
				note: 'Les en-têtes voyagent compressés. Dans l’exemple de la RFC 7541, `:method: GET` est l’entrée statique 2 et part en un seul octet, `0x82`. La première requête envoie `:authority: www.example.com` en 17 octets et le range dans la table dynamique. La deuxième l’envoie en un octet, `0xbe`, l’index 62.'
			},
			{
				add: ['lost["Segment TCP avec DATA s1 perdu"] -->|"le noyau garde les segments suivants"| stall["s3 et s5 attendent la retransmission"]'],
				highlight: ['lost', 'stall'],
				note: 'TCP livre les octets dans l’ordre et ne connaît pas les streams. Si un segment avec des données du stream 1 se perd, le noyau qui reçoit garde les segments suivants, avec les données des streams 3 et 5, jusqu’à ce que la retransmission comble le trou. RFC 9114 : "a lost or reordered packet causes all active transactions to experience a stall".'
			}
		]
	},
	example: {
		title: 'golang.org/x/net/http2/frame.go : l’en-tête de trame de 9 octets',
		repo: 'golang/net',
		url: `${FRAME}#L23-L261`,
		lang: 'go',
		code: `const frameHeaderLen = 9

const (
	FrameData           FrameType = 0x0
	FrameHeaders        FrameType = 0x1
	FramePriority       FrameType = 0x2
	FrameRSTStream      FrameType = 0x3
	FrameSettings       FrameType = 0x4
	FramePushPromise    FrameType = 0x5
	FramePing           FrameType = 0x6
	FrameGoAway         FrameType = 0x7
	FrameWindowUpdate   FrameType = 0x8
	FrameContinuation   FrameType = 0x9
	FramePriorityUpdate FrameType = 0x10
)
…
func readFrameHeader(buf []byte, r io.Reader) (FrameHeader, error) {
	_, err := io.ReadFull(r, buf[:frameHeaderLen])
	if err != nil {
		return FrameHeader{}, err
	}
	return FrameHeader{
		Length:   (uint32(buf[0])<<16 | uint32(buf[1])<<8 | uint32(buf[2])),
		Type:     FrameType(buf[3]),
		Flags:    Flags(buf[4]),
		StreamID: binary.BigEndian.Uint32(buf[5:]) & (1<<31 - 1),
		valid:    true,
	}, nil
}`,
		notes: [
			'La ligne 18 lit exactement 9 octets, le `frameHeaderLen` de la ligne 1, avant de regarder quoi que ce soit d’autre. Chaque trame de la connexion commence ainsi, et le lecteur sait toujours où débute la suivante.',
			'La ligne 23 construit la longueur de la charge à partir de 3 octets, soit 24 bits. La RFC 9113 interdit de dépasser 16 384 sauf si le destinataire a fixé un `SETTINGS_MAX_FRAME_SIZE` plus grand.',
			'La ligne 26 lit le stream ID dans les octets 5 à 8 et masque le bit de poids fort, que la RFC 9113 réserve. Le côté client du même paquet attribue les ID dans [`addStreamLocked`](' + XNET + '/transport.go#L1744-L1753) : `cs.ID = cc.nextStreamID`, puis `cc.nextStreamID += 2`, à partir de 1.',
			'La ligne 7 est le type `0x3`, `RST_STREAM` : la trame qui annule un stream en laissant la connexion ouverte. Rapid Reset l’envoyait juste après chaque trame `HEADERS` (type `0x1`, ligne 5).'
		]
	},
	tradeoff: {
		gain: [
			'Une seule connexion TCP et TLS porte toutes les requêtes vers un hôte : curl a fait passer 3 requêtes en streams 1, 3 et 5 sur la connexion #0.',
			'Une grosse réponse sur un stream ne retient pas les autres, parce que le serveur entrelace les trames `DATA`.',
			'HPACK envoie un en-tête répété en un octet : `:authority: www.example.com` passe de 17 octets à `0xbe` à la deuxième requête.'
		],
		cost: [
			'Un seul segment TCP perdu bloque tous les streams de la connexion jusqu’à sa retransmission. La RFC 9113 : "TCP head-of-line blocking is not addressed by this protocol".',
			'Ouvrir un stream coûte au client une petite trame, et l’annuler une autre : c’est ce qui a permis à Rapid Reset d’atteindre 201 millions de requêtes par seconde avec 20 000 machines.',
			'Les trames sont binaires : pour les lire, il te faut un décodeur comme `curl -v` ou Wireshark, que Cloudflare a utilisé sur sa capture de Rapid Reset.'
		]
	},
	task: {
		prompt: 'Partie 1 : dans l’exemple C.3 de la RFC 7541, la première requête code `:method: GET`, `:scheme: http`, `:path: /` et `:authority: www.example.com` en 20 octets. La deuxième envoie les 4 mêmes en-têtes plus `cache-control: no-cache`. Combien d’octets prennent les 4 en-têtes répétés la deuxième fois, et pourquoi ? Partie 2 : un téléphone sur un réseau qui perd des paquets charge 20 images sur une connexion HTTP/2. Un segment TCP avec une partie de l’image 1 se perd, et la retransmission arrive 300 ms plus tard. Qu’arrive-t-il aux images 2 à 20 pendant ces 300 ms ?',
		hint: 'Après la première requête, `:authority` est dans la table dynamique à l’index 62. Pour la partie 2, demande-toi ce que TCP remet à l’application quand un segment manque.',
		answer: [
			'Partie 1 : 4 octets, `82 86 84 be`. `:method: GET`, `:scheme: http` et `:path: /` sont les entrées statiques 2, 6 et 4. La première requête a ajouté `:authority: www.example.com` à la table dynamique, donc la deuxième envoie l’index 62 (`0xbe`).',
			'En HTTP/1.1, la seule ligne `Host: www.example.com` fait 21 octets de texte, 23 avec son CRLF, à chaque requête.',
			'Partie 2 : TCP livre les octets dans l’ordre. Le noyau garde les segments arrivés après le trou, y compris les données des autres images, et la couche HTTP/2 n’en reçoit aucun avant la retransmission.',
			'Les 20 images sont donc bloquées pendant ces 300 ms, alors que seule l’image 1 a perdu des données. En HTTP/1.1 avec 6 connexions, seule la connexion qui a perdu le segment serait bloquée.'
		],
		steps: [
			{
				title: 'Cherche les entrées statiques',
				questions: [
					{ q: 'Comment HPACK envoie-t-il `:method: GET` ?', options: ['En texte, `:method: GET`', 'En un octet, `0x82` : l’entrée statique 2', 'Avec l’index 62 de la table dynamique', 'Il l’omet, GET étant la valeur par défaut'], answer: 1, why: '`:method: GET` est l’entrée 2 de la table statique de 61 entrées, envoyée comme l’octet unique `0x82`.' },
					{ q: 'Quelles entrées statiques couvrent `:scheme: http` et `:path: /` ?', options: ['62 et 63', '1 et 2', '6 et 4', '82 et 84'], answer: 2, why: 'Ce sont les entrées statiques 6 et 4, envoyées en `0x86` et `0x84`.' },
					{ q: 'Pourquoi `:authority: www.example.com` prend-il 17 octets la première fois ?', options: ['La table statique n’a aucune entrée avec cette valeur', 'HPACK ne compresse jamais l’authority', 'Il est envoyé deux fois par sécurité', 'Il porte un checksum'], answer: 0, why: 'Aucune entrée statique ne contient `www.example.com` : la première requête envoie la valeur et range l’en-tête dans la table dynamique.' },
					{ q: 'Quelle taille a la table dynamique par défaut ?', options: ['61 entrées', '16 384 octets', '100 entrées', '4 096 octets'], answer: 3, why: 'Les en-têtes déjà envoyés sur la connexion vont dans une table dynamique de 4 096 octets par défaut.' }
				]
			},
			{
				title: 'Code la répétition',
				questions: [
					{ q: 'Où se trouve `:authority: www.example.com` après la première requête ?', options: ['Entrée statique 1', 'Table dynamique, index 62', 'Nulle part : chaque requête repart de zéro', 'Table dynamique, index 1'], answer: 1, why: 'Les entrées dynamiques sont numérotées après les 61 statiques : la première ajoutée a l’index 62.' },
					{ q: 'Quel octet envoie l’index 62 ?', options: ['`0x82`', '`0x62`', '`0xbe`', '`0x84`'], answer: 2, why: 'La deuxième requête envoie `:authority` en un octet, `0xbe`.' },
					{ q: 'Combien d’octets prennent les 4 en-têtes répétés dans la deuxième requête ?', options: ['4', '20', '17', '8'], answer: 0, why: '`82 86 84 be` : un octet chacun.' },
					{ q: 'Pourquoi l’astuce ne marche-t-elle que sur la même connexion ?', options: ['Le serveur refuse les index venus d’autres hôtes', 'Les entrées statiques changent à chaque connexion', 'Les clés TLS changent à chaque requête', 'La table dynamique contient les en-têtes déjà envoyés sur cette connexion'], answer: 3, why: 'La table dynamique se construit avec ce que cette connexion a transporté. Une nouvelle connexion part d’une table vide.' }
				]
			},
			{
				title: 'Suis le segment perdu',
				questions: [
					{ q: 'Combien de connexions TCP portent les 20 images ?', options: ['Une par image', 'Une', 'Six', 'Deux : une par sens'], answer: 1, why: 'Tous les streams partagent une seule connexion TCP et TLS.' },
					{ q: 'Que sait TCP des 20 streams ?', options: ['Rien : il livre une seule suite d’octets ordonnée', 'Il garde un numéro de séquence par stream', 'Il acquitte chaque stream à part', 'Il livre chaque stream dès son arrivée'], answer: 0, why: 'TCP a une seule suite d’octets pour toute la connexion et ne connaît pas les streams.' },
					{ q: 'Les segments après le trou portent des données des images 2 à 20. Qu’en fait le noyau ?', options: ['Il les jette pour qu’ils soient renvoyés', 'Il les remet tout de suite à HTTP/2', 'Il les garde jusqu’à ce que le trou soit comblé', 'Il les renvoie au serveur'], answer: 2, why: 'Le noyau qui reçoit garde les segments suivants et ne livre rien au-delà du trou avant la retransmission.' },
					{ q: 'Qu’arrive-t-il aux images 2 à 20 pendant les 300 ms ?', options: ['Elles continuent de charger', 'Seule l’image 2 est bloquée', 'Elles passent sur une nouvelle connexion', 'Elles sont toutes bloquées'], answer: 3, why: 'La couche HTTP/2 ne reçoit aucun octet après le trou : chaque stream attend. RFC 9113 : "TCP head-of-line blocking is not addressed by this protocol".' }
				]
			},
			{
				title: 'Compare avec HTTP/1.1',
				questions: [
					{ q: 'Combien d’octets prend `Host: www.example.com` à chaque requête HTTP/1.1 ?', options: ['1', '17', '23, avec son CRLF', '4'], answer: 2, why: 'La ligne fait 21 octets de texte, 23 avec CRLF, répétés en entier à chaque fois.' },
					{ q: 'En HTTP/1.1 avec 6 connexions, un segment se perd. Qu’est-ce qui est bloqué ?', options: ['Seulement la connexion qui l’a perdu', 'Les 6 connexions', 'Toutes les images de la page', 'Rien : HTTP/1.1 réessaie tout de suite'], answer: 0, why: 'Chaque connexion a sa propre suite d’octets TCP : les 5 autres continuent de livrer.' },
					{ q: 'Pourquoi HTTP/1.1 a-t-il besoin de ces 6 connexions ?', options: ['TLS n’autorise qu’une requête par poignée de main', 'Une connexion porte une seule réponse à la fois', 'Les serveurs limitent chaque connexion à 6 images', 'TCP ne peut pas envoyer plus de 6 segments à la fois'], answer: 1, why: 'Le head-of-line blocking de HTTP/1.1 : les réponses partent dans l’ordre, une à la fois, alors les clients ouvrent plusieurs connexions.' },
					{ q: 'Que gagne alors HTTP/2 sur un réseau propre ?', options: ['Des segments TCP plus gros', 'Pas de poignée de main TLS', 'Des résolutions DNS plus rapides', 'Toutes les requêtes sur une connexion, sans attente entre elles'], answer: 3, why: 'Les streams 1, 3 et 5 partagent une connexion et aucun n’attend une réponse précédente. En échange, un seul segment perdu les bloque tous.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'curl affiche `[HTTP/2] [1] OPENED stream`, puis `[3]`, puis `[5]`, tous sur la connexion #0. Pourquoi les ID sont-ils impairs ?',
			options: [
				'Les ID pairs sont gardés de côté pour rejouer les requêtes qui ont échoué',
				'Le client ouvre ses streams avec des ID impairs, le serveur avec des ID pairs',
				'curl saute un ID pour chaque réponse que le serveur lui a déjà envoyée',
				'Chaque requête prend deux ID, un pour ses en-têtes et un autre pour son corps'
			],
			answer: 1,
			why: 'RFC 9113, section 5.1.1 : les streams ouverts par le client ont des identifiants impairs, ceux ouverts par le serveur des identifiants pairs, et l’ID 0 porte les trames de contrôle de la connexion. Le client Go ajoute 2 à `nextStreamID` à chaque nouveau stream.'
		},
		{
			q: 'Une page vidéo utilise une seule connexion HTTP/2. Un segment TCP avec des données du stream 7 se perd. Qu’arrive-t-il au stream 9, dont les données sont arrivées dans des segments suivants ?',
			options: [
				'Rien ne change, parce que chaque stream a ses propres numéros de séquence et acquittements TCP',
				'Le serveur renvoie le stream 9 sur une nouvelle connexion TCP ouverte rien que pour lui',
				'Il attend la retransmission du segment perdu, parce que TCP livre les octets dans l’ordre',
				'Le client envoie `RST_STREAM` sur le stream 7 pour que le stream 9 continue seul'
			],
			answer: 2,
			why: 'TCP a une seule suite d’octets pour toute la connexion et ne connaît pas les streams. Le noyau qui reçoit garde les octets suivants jusqu’à ce que le trou soit comblé, donc tous les streams attendent. HTTP/3 place les streams dans QUIC pour éviter cela.'
		},
		{
			q: 'Un serveur annonce 100 streams simultanés. Comment les clients de Rapid Reset ont-ils pu envoyer bien plus de 100 requêtes sur une seule connexion ?',
			options: [
				'Ils ouvraient une nouvelle connexion TCP toutes les 100 requêtes pour remettre le compte à zéro',
				'Ils envoyaient leurs propres trames `SETTINGS` qui relevaient la limite du serveur',
				'Ils annulaient chaque stream par `RST_STREAM`, et un stream fermé ne compte pas dans la limite',
				'Ils utilisaient des ID pairs, que la limite de streams simultanés ne couvre pas'
			],
			answer: 2,
			why: 'Seuls les streams ouverts ou à moitié fermés comptent dans `SETTINGS_MAX_CONCURRENT_STREAMS`. Un `RST_STREAM` fait passer le stream à fermé tout de suite, et le client peut ouvrir le suivant pendant que le serveur traite encore les requêtes annulées.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Faire tourner HTTP/2 sur ton portable, et voir ALPN choisir `h2` et trois requêtes partager une connexion en streams 1, 3 et 5.',
		steps: [
			'Crée un dossier et un certificat jetable : `mkdir -p ~/h2-lab && cd ~/h2-lab && openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 7 -subj /CN=localhost`.',
			'Crée `h2.conf` avec une ligne chacun : `server {`, `listen 443 ssl;`, `http2 on;`, `ssl_certificate /lab/cert.pem;`, `ssl_certificate_key /lab/key.pem;`, `root /usr/share/nginx/html;`, `}`.',
			'Lance nginx avec ce fichier : `docker run -d --rm --name h2-lab -p 127.0.0.1:8443:443 -v "$PWD":/lab -v "$PWD/h2.conf":/etc/nginx/conf.d/default.conf:ro nginx:1.27-alpine`.',
			'Envoie trois requêtes en parallèle : `curl -sk -v --http2 --parallel -o /dev/null -o /dev/null -o /dev/null https://localhost:8443/ https://localhost:8443/index.html https://localhost:8443/50x.html 2>&1 | grep -E "ALPN|OPENED|Multiplexed"`.',
			'Demande HTTP/1.1 à la place et affiche la version utilisée : `curl -sk -o /dev/null -w "%{http_version}\\n" --http1.1 https://localhost:8443/`.'
		],
		done: [
			'L’étape 4 affiche `ALPN: curl offers h2,http/1.1` et `ALPN: server accepted h2`.',
			'Elle montre ensuite `[HTTP/2] [1] OPENED stream`, `[3]` et `[5]`, avec `Multiplexed connection found` avant le deuxième et le troisième.',
			'L’étape 5 affiche `1.1`.'
		],
		solution: [
			'Le protocole se choisit dans la poignée de main TLS : curl liste ce qu’il parle, nginx répond `h2`. Avec `--http1.1`, curl ne propose que `http/1.1`.',
			'Les trois requêtes sont trois streams client sur une seule connexion TCP, avec des ID impairs qui montent de 2.',
			'`-k` saute la vérification du certificat seulement parce que ce certificat est autosigné et local. Arrête le lab avec `docker stop h2-lab`.'
		]
	},
	recall: {
		q: 'Que met HTTP/2 dans une seule connexion TCP, et que se passe-t-il quand un segment TCP se perd ?',
		a: 'Plusieurs streams, numérotés 1, 3, 5 côté client, transportés en trames avec un en-tête de 9 octets. Un segment perdu bloque tous les streams jusqu’à sa retransmission, parce que TCP livre les octets dans l’ordre.'
	},
	sources: [
		{ title: 'RFC 9113, HTTP/2', url: 'https://www.rfc-editor.org/rfc/rfc9113' },
		{ title: 'RFC 7541, HPACK : compression des en-têtes de HTTP/2 (annexe C.3)', url: 'https://www.rfc-editor.org/rfc/rfc7541' },
		{ title: 'RFC 9114, HTTP/3, section 1.1 : Prior Versions of HTTP', url: 'https://www.rfc-editor.org/rfc/rfc9114#section-1.1' },
		{ title: 'Blog de Cloudflare, HTTP/2 Rapid Reset: deconstructing the record-breaking attack (2023)', url: CF },
		{ title: 'golang.org/x/net, http2/frame.go', url: FRAME }
	]
};
