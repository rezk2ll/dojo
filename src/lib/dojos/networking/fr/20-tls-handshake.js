const GO = 'https://github.com/golang/go/blob/022c8636110ebac86a9b88724cda168ed713c21f/src/crypto/tls';
const CLIENT = `${GO}/handshake_client.go`;
const RFC = 'https://www.rfc-editor.org/rfc/rfc8446';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'tls-handshake',
	part: 'HTTP et TLS',
	title: 'La poignée de main TLS 1.3',
	minutes: 10,
	hook: [
		'Un health check appelle un site par son adresse IP : `curl https://<IPv4 of example.org>/`. Il échoue avant le moindre octet HTTP : `TLS alert, handshake failure (552)`, puis `sslv3 alert handshake failure`.',
		'Le même check avec `curl --resolve example.org:443:<same IPv4> https://example.org/` renvoie `200`. Même adresse, même port, même serveur. **Seul le premier message de la poignée de main TLS a changé : il nomme maintenant `example.org`.**',
		'Un client Go compilé avec Go 1.27.2 montre la même différence. Avec `ServerName: "example.org"`, il obtient TLS 1.3 en 23 ms. Avec l’adresse IP comme `ServerName`, il reçoit `remote error: tls: handshake failure`.'
	],
	terms: [
		{ term: 'ClientHello', def: 'Le premier message TLS, envoyé en clair par le client. Il liste les versions de TLS, les suites de chiffrement et les groupes d’échange de clés que le client gère, avec des extensions comme SNI et ALPN.' },
		{ term: 'Key share', def: 'L’extension `key_share` : la valeur publique du client pour un ou plusieurs groupes d’échange de clés, comme X25519. Avec celle du serveur, les deux côtés calculent le même secret sans jamais l’envoyer.' },
		{ term: 'SNI', def: 'Server Name Indication, l’extension `server_name` du ClientHello. Elle nomme l’hôte voulu par le client : une seule adresse IP peut ainsi servir plusieurs sites, chacun avec son certificat.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['client["Client, après la poignée de main TCP"] -->|"ClientHello : SNI example.org, ALPN h2, key_share X25519"| server["example.org:443"]'],
				highlight: ['client'],
				note: 'Le client envoie un seul ClientHello, en clair. Il nomme l’hôte dans le SNI, propose `h2,http/1.1` en ALPN, annonce TLS 1.3 dans `supported_versions` et joint déjà un key share. curl affiche cette étape sous la forme `TLSv1.3 (OUT), TLS handshake, Client hello (1)`.'
			},
			{
				add: ['server -->|"ServerHello : key_share X25519, TLS_AES_256_GCM_SHA384"| client'],
				highlight: ['server'],
				note: 'Le serveur choisit une version, une suite de chiffrement et un des groupes proposés, puis répond avec son propre key share. `openssl s_client` a affiché `Server Temp Key: X25519, 253 bits` et `TLSv1.3, Cipher is TLS_AES_256_GCM_SHA384`. RFC 8446 : "All handshake messages after the ServerHello are now encrypted".'
			},
			{
				add: ['server -->|"chiffré : EncryptedExtensions, Certificate, CertificateVerify, Finished"| client'],
				highlight: ['server'],
				note: 'Dans le même envoi, le serveur transmet, chiffrés, le protocole ALPN retenu (`ALPN: server accepted h2`), son certificat pour `CN=example.org`, une signature de toute la poignée de main avec la clé du certificat, et son Finished. Le client vérifie que le certificat correspond au nom qu’il a demandé.'
			},
			{
				add: ['client -->|"chiffré : Finished, puis GET / HTTP/2"| server'],
				highlight: ['client'],
				note: 'Le client envoie son Finished et sa première requête juste derrière. TLS a pris un seul aller-retour : le ClientHello part, l’envoi du serveur revient. Si le serveur n’avait accepté aucun des groupes du client, il aurait d’abord envoyé un HelloRetryRequest, et la poignée de main aurait pris un deuxième aller-retour.'
			},
			{
				add: ['ipclient["Client avec une IP littérale comme hôte"] -->|"ClientHello sans server_name"| server', 'server -->|"alerte handshake_failure (40)"| ipclient'],
				highlight: ['ipclient'],
				note: 'La RFC 6066 dit que "Literal IPv4 and IPv6 addresses are not permitted" dans le SNI. Go retire l’extension quand l’hôte est une adresse IP, comme le montre le code plus bas, et curl a échoué de la même façon. Un serveur qui choisit le certificat d’après le nom n’a alors rien pour choisir. example.org répond par l’alerte 40, `handshake_failure`.'
			}
		]
	},
	example: {
		title: 'src/crypto/tls/handshake_client.go dans Go 1.27.2 : construire le ClientHello',
		repo: 'golang/go',
		url: `${CLIENT}#L71-L1320`,
		lang: 'go',
		code: `	hello := &clientHelloMsg{
		vers:                         maxVersion,
		compressionMethods:           []uint8{compressionNone},
		random:                       make([]byte, 32),
…
		serverName:                   hostnameInSNI(config.ServerName),
		supportedCurves:              config.curvePreferences(maxVersion),
…
		alpnProtocols:                config.NextProtos,
		supportedVersions:            supportedVersions,
	}

	// The version at the beginning of the ClientHello was capped at TLS 1.2
	// for compatibility reasons. The supported_versions extension is used
	// to negotiate versions now. See RFC 8446, Section 4.2.1.
	if hello.vers > VersionTLS12 {
		hello.vers = VersionTLS12
	}
…
		// Since the order is fixed, the first one is always the one to send a
		// key share for. All the PQ hybrids sort first, and produce a fallback
		// ECDH share.
		curveID := hello.supportedCurves[0]
		ke, err := keyExchangeForCurveID(curveID)
…
		keyShareKeys, hello.keyShares, err = ke.keyShares(config.rand())
…
func hostnameInSNI(name string) string {
	host := name
	if len(host) > 0 && host[0] == '[' && host[len(host)-1] == ']' {
		host = host[1 : len(host)-1]
	}
	if i := strings.LastIndex(host, "%"); i > 0 {
		host = host[:i]
	}
	if net.ParseIP(host) != nil {
		return ""
	}
	for len(name) > 0 && name[len(name)-1] == '.' {
		name = name[:len(name)-1]
	}
	return name
}`,
		notes: [
			'La ligne 6 remplit le SNI avec `hostnameInSNI`. Les lignes 36 à 38 renvoient une chaîne vide quand le nom se lit comme une adresse IP : un client qui appelle avec `ServerName: "<IPv4>"` n’envoie aucun `server_name`, et l’essai Go du début a reçu `handshake failure`.',
			'Les lignes 16 à 18 écrivent TLS 1.2 dans l’ancien champ de version, même pour un client TLS 1.3. La vraie liste part dans `supportedVersions`, ligne 10, comme l’exige la section 4.2.1 de la RFC 8446.',
			'Les lignes 23 à 26 construisent le key share du premier groupe dans l’ordre fixe. Dans Go 1.27.2, [`curvePreferenceOrder`](' + GO + '/defaults.go#L38-L43) met `X25519MLKEM768` en tête, et ce groupe produit aussi un share `X25519`. L’essai Go a négocié `group=X25519MLKEM768`.',
			'La ligne 4 contient 32 octets aléatoires, et la ligne 9 porte `config.NextProtos` comme liste ALPN. Les deux passent en clair dans le ClientHello, comme le SNI de la ligne 6.'
		]
	},
	tradeoff: {
		gain: [
			'TLS 1.3 met les clés en place en un aller-retour, parce que le ClientHello porte déjà un key share.',
			'Tout ce qui suit le ServerHello est chiffré, y compris le certificat du serveur et le protocole ALPN retenu.',
			'La RFC 8446 a retiré le RSA statique et le Diffie-Hellman statique : tout échange de clés avec certificat a la confidentialité persistante. Une clé privée qui fuit après la poignée de main n’expose pas les clés de la session, une fois celles-ci effacées.'
		],
		cost: [
			'Le ClientHello est en clair : n’importe qui sur le chemin lit le SNI `example.org` et la liste ALPN.',
			'Si le serveur n’accepte aucun des groupes proposés, un HelloRetryRequest ajoute un deuxième aller-retour.',
			'Un client qui se connecte par adresse IP n’envoie pas de SNI, et un serveur qui héberge plusieurs noms peut le refuser avec `handshake_failure`.'
		]
	},
	task: {
		prompt: 'Deux essais de `openssl s_client` vers example.org:443. L’essai A, avec `-servername example.org`, a affiché `Server Temp Key: X25519, 253 bits`, `Verification: OK` et `New, TLSv1.3, Cipher is TLS_AES_256_GCM_SHA384`. L’essai B, avec `-noservername`, a affiché `sslv3 alert handshake failure ... SSL alert number 40` et `New, (NONE), Cipher is (NONE)`. Dis ce que t’apprend chaque ligne. Ensuite : l’aller-retour vers le serveur prend 40 ms. Combien de temps après l’envoi du SYN TCP le premier octet de la réponse HTTP peut-il arriver, avec une poignée de main TLS 1.3 complète ? Et si le serveur répond par un HelloRetryRequest ?',
		hint: 'Compte les trajets : TCP en demande un avant que le ClientHello puisse partir. La requête part avec le Finished du client.',
		answer: [
			'Essai A : l’échange de clés a utilisé X25519, la chaîne de certificats a été validée contre le magasin de confiance, et la session tourne en TLS 1.3 avec la suite AES 256 GCM.',
			'Essai B : l’alerte 40 est `handshake_failure`, que la RFC 8446 définit comme "unable to negotiate an acceptable set of security parameters". Aucune suite n’a été choisie. Sans SNI, ce serveur n’a pas de certificat à proposer.',
			'Temps : le SYN part à 0 ms, le SYN-ACK revient à 40. Le ClientHello part à 40, et l’envoi du serveur avec son Finished arrive à 80. Le client envoie son Finished et le `GET` à 80, et le premier octet de réponse arrive au plus tôt à 120 ms.',
			'Avec un HelloRetryRequest, le client envoie un deuxième ClientHello à 80 ms. L’envoi du serveur arrive alors à 120, la requête part à 120, et la réponse arrive au plus tôt à 160 ms.'
		]
	},
	quiz: [
		{
			q: 'Pourquoi un client TLS 1.3 peut-il envoyer sa requête HTTP après un seul aller-retour TLS ?',
			options: [
				'Le serveur pousse son certificat au client avant même que celui-ci dise bonjour',
				'Le ClientHello porte un key share : les deux côtés ont les clés dès le ServerHello',
				'TLS 1.3 envoie la requête en clair et ne chiffre que la réponse du serveur',
				'Le client réutilise les numéros de séquence TCP de la connexion comme clé de chiffrement'
			],
			answer: 1,
			why: 'Le client parie sur un groupe, comme X25519, et envoie sa valeur publique dans `key_share`. Le serveur répond avec la sienne dans le ServerHello, les deux calculent le même secret, et la suite de l’envoi du serveur est déjà chiffrée.'
		},
		{
			q: '`curl https://<IP address>/` reçoit `handshake failure`, mais la même IP avec `--resolve` et le nom d’hôte marche. Qu’est-ce qui diffère entre les deux ClientHello ?',
			options: [
				'Le premier ne propose que TLS 1.2, parce que l’hôte est numérique',
				'Le premier n’a pas d’extension `server_name`, et le serveur ne sait pas quel certificat choisir',
				'Le premier n’a pas de key share, parce qu’une adresse IP ne peut pas utiliser X25519',
				'Le premier propose une autre liste ALPN, que le serveur refuse'
			],
			answer: 1,
			why: 'La RFC 6066 interdit les IP littérales dans le SNI, donc le client omet l’extension. Un serveur qui sert plusieurs noms sur une IP choisit le certificat d’après le SNI. Sans nom, Cloudflare répond par l’alerte 40, `handshake_failure`.'
		},
		{
			q: 'Quelle partie d’une poignée de main TLS 1.3 un observateur sur le réseau peut-il lire ?',
			options: [
				'Le certificat du serveur, parce que les certificats sont publics de toute façon',
				'Le ClientHello, avec le nom d’hôte du SNI et la liste ALPN',
				'Le chemin de la requête HTTP, parce qu’il part avec le message Finished',
				'Rien, parce que TLS 1.3 chiffre chaque message dès le premier octet'
			],
			answer: 1,
			why: 'La RFC 8446 chiffre chaque message de la poignée de main après le ServerHello : le certificat et EncryptedExtensions sont cachés. Le ClientHello et le ServerHello passent en clair, et le ClientHello porte `server_name` et les protocoles ALPN.'
		}
	],
	recall: {
		q: 'Que porte un ClientHello TLS 1.3 qui permet de finir la poignée de main en un aller-retour, et que se passe-t-il quand il n’a pas de SNI ?',
		a: 'Un `key_share`, par exemple X25519 : les deux côtés dérivent les clés dès le ServerHello. Sans `server_name`, un serveur qui héberge plusieurs noms ne peut pas choisir de certificat : example.org a répondu par l’alerte 40, `handshake_failure`.'
	},
	sources: [
		{ title: 'RFC 8446, The Transport Layer Security (TLS) Protocol Version 1.3', url: RFC },
		{ title: 'RFC 6066, extensions TLS, section 3 : Server Name Indication', url: 'https://www.rfc-editor.org/rfc/rfc6066#section-3' },
		{ title: 'Code de Go 1.27.2, src/crypto/tls/handshake_client.go', url: CLIENT },
		{ title: 'Code de Go 1.27.2, src/crypto/tls/defaults.go', url: `${GO}/defaults.go` },
		{ title: 'Documentation d’OpenSSL, openssl-s_client', url: 'https://docs.openssl.org/3.0/man1/openssl-s_client/' }
	]
};
