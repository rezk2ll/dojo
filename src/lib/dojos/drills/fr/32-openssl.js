/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'openssl',
	part: 'Texte et données',
	title: 'openssl pour TLS',
	minutes: 10,
	hook: [
		'La supervision t’alerte : le certificat de `shop.example.org` expire le 5 novembre 2026. Avant de le renouveler, tu regardes ce que contient le certificat actuel, si le serveur l’envoie bien, et si la clé sur le disque va avec. Toutes les répétitions utilisent OpenSSL 3.0.',
		'Dans le dossier courant : `shop.crt` est le certificat actuel (sujet `O = Shop, CN = shop.example.org`, SAN `shop.example.org` et `www.shop.example.org`), `shop.key` est sa clé privée, et `new.key` une clé neuve pour le renouvellement. Une instance de test du site écoute sur `localhost:8443` et sert `shop.crt` pour le nom `shop.example.org`.'
	],
	terms: [
		{ term: 'PEM', def: 'La forme texte d’un certificat ou d’une clé : du base64 entre des lignes comme `-----BEGIN CERTIFICATE-----` et `-----END CERTIFICATE-----`.' },
		{ term: 'SAN', def: 'Subject Alternative Name : une extension du certificat qui contient une liste de noms, comme `DNS:www.shop.example.org`.' },
		{ term: 'SNI', def: 'Server Name Indication : le nom d’hôte que le client place dans son ClientHello, le premier message de la poignée de main TLS.' },
		{ term: 'CSR', def: 'Demande de signature de certificat (PKCS#10) : un fichier qui contient ta clé publique et le sujet demandé, signé avec ta propre clé privée.' }
	],
	reps: [
		{
			prompt: 'Affiche `shop.crt` en texte lisible, sans le bloc PEM.',
			accept: [
				'openssl x509 -in shop.crt -noout -text',
				'openssl x509 -in shop.crt -text -noout',
				'openssl x509 -noout -in shop.crt -text',
				'openssl x509 -noout -text -in shop.crt',
				'openssl x509 -text -in shop.crt -noout',
				'openssl x509 -text -noout -in shop.crt'
			],
			why: '`-in shop.crt` lit le certificat et `-text` en affiche tous les champs, l’extension SAN comprise. `-noout` empêche `x509` d’ajouter le bloc PEM à la fin.'
		},
		{
			prompt: 'Affiche seulement le sujet de `shop.crt`.',
			accept: [
				'openssl x509 -in shop.crt -noout -subject',
				'openssl x509 -in shop.crt -subject -noout',
				'openssl x509 -noout -in shop.crt -subject',
				'openssl x509 -noout -subject -in shop.crt',
				'openssl x509 -subject -in shop.crt -noout',
				'openssl x509 -subject -noout -in shop.crt'
			],
			why: '`-subject` affiche une ligne, ici `subject=O = Shop, CN = shop.example.org`. `-issuer` affiche le signataire ; `shop.crt` est autosigné, donc son émetteur porte le même nom.'
		},
		{
			prompt: 'Affiche seulement la date d’expiration de `shop.crt`.',
			accept: [
				'openssl x509 -in shop.crt -noout -enddate',
				'openssl x509 -in shop.crt -enddate -noout',
				'openssl x509 -noout -in shop.crt -enddate',
				'openssl x509 -noout -enddate -in shop.crt',
				'openssl x509 -enddate -in shop.crt -noout',
				'openssl x509 -enddate -noout -in shop.crt'
			],
			why: '`-enddate` affiche la date notAfter, ici `notAfter=Nov  5 23:27:17 2026 GMT`. `-startdate` affiche notBefore, et `-dates` les deux.'
		},
		{
			prompt: 'Affiche seulement l’extension Subject Alternative Name de `shop.crt`.',
			accept: [
				'openssl x509 -in shop.crt -noout -ext subjectAltName',
				'openssl x509 -in shop.crt -ext subjectAltName -noout',
				'openssl x509 -noout -in shop.crt -ext subjectAltName',
				'openssl x509 -noout -ext subjectAltName -in shop.crt',
				'openssl x509 -ext subjectAltName -in shop.crt -noout',
				'openssl x509 -ext subjectAltName -noout -in shop.crt'
			],
			why: '`-ext subjectAltName` n’affiche que cette extension : `DNS:shop.example.org, DNS:www.shop.example.org`. `-ext` accepte aussi plusieurs noms d’extensions séparés par des virgules.'
		},
		{
			prompt: 'Dans une tâche cron, vérifie si `shop.crt` expire dans les 30 prochains jours (2592000 secondes). La réponse est le code de sortie.',
			accept: [
				'openssl x509 -in shop.crt -noout -checkend 2592000',
				'openssl x509 -in shop.crt -checkend 2592000 -noout',
				'openssl x509 -noout -in shop.crt -checkend 2592000',
				'openssl x509 -noout -checkend 2592000 -in shop.crt',
				'openssl x509 -checkend 2592000 -in shop.crt -noout',
				'openssl x509 -checkend 2592000 -noout -in shop.crt'
			],
			why: '`-checkend 2592000` sort avec un code non nul si le certificat expire dans ce nombre de secondes (30 × 86400). Pour `shop.crt`, la commande affiche `Certificate will expire` et sort avec 1.'
		},
		{
			prompt: 'Première moitié du contrôle de la clé : affiche la clé publique contenue dans `shop.crt`, en PEM.',
			accept: [
				'openssl x509 -in shop.crt -noout -pubkey',
				'openssl x509 -in shop.crt -pubkey -noout',
				'openssl x509 -noout -in shop.crt -pubkey',
				'openssl x509 -noout -pubkey -in shop.crt',
				'openssl x509 -pubkey -in shop.crt -noout',
				'openssl x509 -pubkey -noout -in shop.crt'
			],
			why: '`-pubkey` affiche la clé publique du certificat sous forme d’un bloc `-----BEGIN PUBLIC KEY-----`. La répétition suivante compare ce bloc avec `shop.key`.'
		},
		{
			prompt: 'Seconde moitié : affiche la clé publique qui correspond à la clé privée `shop.key`, en PEM.',
			accept: ['openssl pkey -in shop.key -pubout', 'openssl pkey -pubout -in shop.key'],
			why: '`pkey -in shop.key` lit la clé privée et `-pubout` n’en affiche que la partie publique. Si cette sortie est identique à celle de `-pubkey` sur `shop.crt`, la clé et le certificat vont ensemble ; `new.key` donne un autre bloc.'
		},
		{
			prompt: 'Ouvre une connexion TLS vers `localhost:8443`, envoie le nom SNI `shop.example.org`, et ferme-la dès la fin de la poignée de main.',
			accept: [
				'openssl s_client -connect localhost:8443 -servername shop.example.org </dev/null',
				'openssl s_client -connect localhost:8443 -servername shop.example.org < /dev/null',
				'openssl s_client -servername shop.example.org -connect localhost:8443 </dev/null',
				'openssl s_client -servername shop.example.org -connect localhost:8443 < /dev/null'
			],
			why: '`-connect localhost:8443` choisit l’hôte et le port, `-servername` règle le nom SNI. `s_client` lit sur stdin ce qu’il doit envoyer ; avec `</dev/null`, il reçoit tout de suite la fin de fichier et ferme la connexion après avoir affiché la chaîne de certificats.'
		},
		{
			prompt: 'Affiche la date d’expiration du certificat que `localhost:8443` envoie pour `shop.example.org`, en passant la sortie de `s_client` à `x509` par un pipe.',
			accept: [
				'openssl s_client -connect localhost:8443 -servername shop.example.org </dev/null | openssl x509 -noout -enddate',
				'openssl s_client -connect localhost:8443 -servername shop.example.org </dev/null | openssl x509 -enddate -noout',
				'openssl s_client -connect localhost:8443 -servername shop.example.org < /dev/null | openssl x509 -noout -enddate',
				'openssl s_client -connect localhost:8443 -servername shop.example.org < /dev/null | openssl x509 -enddate -noout',
				'openssl s_client -servername shop.example.org -connect localhost:8443 </dev/null | openssl x509 -noout -enddate',
				'openssl s_client -servername shop.example.org -connect localhost:8443 </dev/null | openssl x509 -enddate -noout',
				'openssl s_client -servername shop.example.org -connect localhost:8443 < /dev/null | openssl x509 -noout -enddate',
				'openssl s_client -servername shop.example.org -connect localhost:8443 < /dev/null | openssl x509 -enddate -noout'
			],
			why: '`s_client` affiche le certificat du serveur en PEM au milieu du reste. Sans `-in`, `x509` lit stdin, trouve ce bloc PEM et affiche `notAfter=Nov  5 23:27:17 2026 GMT`, la même date que `shop.crt`.'
		},
		{
			prompt: 'Crée la demande de renouvellement `shop.csr` à partir de `new.key`, avec le sujet `/CN=shop.example.org` passé en ligne de commande pour qu’aucune question ne s’affiche.',
			accept: [
				"openssl req -new -key new.key -out shop.csr -subj '/CN=shop.example.org'",
				"openssl req -new -key new.key -subj '/CN=shop.example.org' -out shop.csr",
				"openssl req -new -out shop.csr -key new.key -subj '/CN=shop.example.org'",
				"openssl req -new -out shop.csr -subj '/CN=shop.example.org' -key new.key",
				"openssl req -new -subj '/CN=shop.example.org' -key new.key -out shop.csr",
				"openssl req -new -subj '/CN=shop.example.org' -out shop.csr -key new.key",
				'openssl req -new -key new.key -out shop.csr -subj "/CN=shop.example.org"',
				'openssl req -new -key new.key -out shop.csr -subj /CN=shop.example.org'
			],
			why: '`-new` crée une demande, `-key new.key` y met la partie publique de cette clé et la signe, `-out shop.csr` nomme le fichier. Sans `-subj`, `req` te demande chaque champ du sujet dans le terminal.'
		},
		{
			prompt: 'Affiche `shop.csr` en texte lisible, sans le bloc PEM, pour vérifier son sujet avant de l’envoyer.',
			accept: [
				'openssl req -in shop.csr -noout -text',
				'openssl req -in shop.csr -text -noout',
				'openssl req -noout -in shop.csr -text',
				'openssl req -noout -text -in shop.csr',
				'openssl req -text -in shop.csr -noout',
				'openssl req -text -noout -in shop.csr'
			],
			why: '`req -in shop.csr -text` affiche la demande, qui commence par `Certificate Request:` et `Subject: CN = shop.example.org`. `-noout` retire le bloc PEM ; ajoute `-verify` pour contrôler aussi l’autosignature.'
		}
	],
	quiz: [],
	recall: {
		q: 'Quelle commande affiche la date d’expiration de `shop.crt`, et par quoi commence sa sortie ?',
		a: '`openssl x509 -in shop.crt -noout -enddate`. Elle affiche une ligne qui commence par `notAfter=`, ici `notAfter=Nov  5 23:27:17 2026 GMT`.'
	},
	sources: [
		{ title: 'openssl-x509 (OpenSSL 3.0)', url: 'https://docs.openssl.org/3.0/man1/openssl-x509/' },
		{ title: 'openssl-s_client (OpenSSL 3.0)', url: 'https://docs.openssl.org/3.0/man1/openssl-s_client/' },
		{ title: 'openssl-req (OpenSSL 3.0)', url: 'https://docs.openssl.org/3.0/man1/openssl-req/' },
		{ title: 'openssl-pkey (OpenSSL 3.0)', url: 'https://docs.openssl.org/3.0/man1/openssl-pkey/' }
	]
}
