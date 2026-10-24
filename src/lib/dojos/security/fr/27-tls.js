const REQ = 'https://github.com/psf/requests/blob/611c6162cbc4ac2020a2f91c7cfa4f3abf9bbb60';
const URLLIB3 = 'https://github.com/urllib3/urllib3/blob/a37bc93b65d6bcf00d3dc43d966bab6bd130ecd8';
const GHSA = 'https://github.com/advisories/GHSA-9wx4-h78v-vm56';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'tls',
	part: 'Les secrets et la chaîne d’approvisionnement',
	title: 'TLS en une poignée de main',
	minutes: 10,
	hook: [
		'Le 20 mai 2024, GitHub publie [GHSA-9wx4-h78v-vm56](' + GHSA + ') (CVE-2024-35195) pour la bibliothèque Python requests : "if the first request to a given origin is made with `verify=False`, TLS certificate verification may remain disabled for all subsequent requests to that origin, even if `verify=True` is explicitly specified later." Un seul appel sans vérification suffisait à la couper pour les appels suivants vers la même origine.',
		'La cause : le pool de connexions. Une `Session` réutilisait la connexion ouverte au premier appel, et cette connexion avait été ouverte sans vérifier le certificat. Toutes les versions avant 2.32.0 sont touchées. Le correctif ajoute un test qui appelle `https://invalid.badssl.com` une fois avec `verify=False`, puis attend une `SSLError` à l’appel suivant.'
	],
	terms: [
		{ term: 'Chaîne de certificats', def: 'La liste que le serveur envoie dans son message `Certificate` : son propre certificat d’abord, puis chaque certificat d’AC qui a signé le précédent.' },
		{ term: 'Magasin d’AC', def: 'Le fichier ou le dossier de certificats d’AC racines auxquels un client fait confiance. requests prend le paquet du module `certifi` ; curl prend celui choisi à la compilation.' },
		{ term: 'CertificateVerify', def: 'Un message de la poignée de main où le serveur signe tout l’échange jusque-là avec la clé privée qui va avec le certificat qu’il vient d’envoyer.' },
		{ term: 'Vérification du nom', def: 'Le client compare le nom de l’URL aux noms DNS du Subject Alternative Name du certificat. Une chaîne valide pour `*.badssl.com` échoue sur `github.com`.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['ch["ClientHello + key_share"] --> sh["ServerHello + key_share"]', 'sh --> keys["Les deux côtés dérivent les clés de la poignée de main"]'],
				highlight: ['ch', 'sh', 'keys'],
				note: 'Le client envoie sa part Diffie-Hellman dans `key_share`, le serveur répond avec la sienne. RFC 8446 : "Everything after this phase is encrypted." À ce stade, le client partage un secret avec quelqu’un, sans savoir encore avec qui.'
			},
			{
				add: ['keys --> cert["{Certificate} : github.com, puis Sectigo CA DV E36, puis Sectigo Root E46"]', 'cert --> cv["{CertificateVerify} : signature de la poignée de main"]', 'cv --> fin["{Finished} : MAC de la poignée de main"]'],
				highlight: ['cert', 'cv', 'fin'],
				note: 'Pour `github.com:443` le 17 octobre 2026, `openssl s_client` affiche une chaîne de 3 : la feuille, l’intermédiaire `Sectigo Public Server Authentication CA DV E36` et sa racine. `CertificateVerify` prouve que le serveur détient la clé privée de la feuille envoyée. `Finished` est un MAC qui détecte toute modification des messages précédents.'
			},
			{
				add: ['fin --> check["Client : la chaîne finit sur une AC de son magasin, le nom correspond, les dates sont valides"]', 'check -->|"Verify return code: 0 (ok)"| app["[Application Data]"]'],
				highlight: ['check', 'app'],
				note: 'La RFC 8446 laisse cette partie de côté : "detailed certificate validation procedures are out of scope for TLS (see [RFC5280])". C’est le client qui s’en charge. La doc de curl : il vérifie "the signature and making sure the certificate was crafted for the server name provided in the URL".'
			},
			{
				add: ['mitm["Une machine sur le chemin répond avec son propre certificat auto-signé et sa clé"] --> cv', 'mitm -->|"verify=False : CERT_NONE"| app'],
				highlight: ['mitm'],
				note: 'Un attaquant sur le réseau peut mener la même poignée de main avec son propre certificat. Son `CertificateVerify` est valide, puisqu’il signe avec sa propre clé. Seule la vérification de la chaîne l’arrête : sur `self-signed.badssl.com`, OpenSSL affiche `Verify return code: 18 (self-signed certificate)`. Avec `verify=False`, le client saute ce contrôle et envoie ses données, chiffrées, à l’attaquant.'
			},
			{
				add: ['ca["verify=\'/etc/ssl/internal-ca.pem\' ou REQUESTS_CA_BUNDLE"] --> check'],
				highlight: ['ca'],
				note: 'Quand un serveur a un certificat signé par une AC privée, donne cette AC au client au lieu de couper la vérification. requests accepte un chemin dans `verify` ou dans `REQUESTS_CA_BUNDLE`, curl prend `--cacert`. La vérification de la chaîne et celle du nom restent actives.'
			}
		]
	},
	example: {
		title: 'src/requests/adapters.py : de l’argument verify aux réglages urllib3',
		repo: 'psf/requests',
		url: `${REQ}/src/requests/adapters.py#L85-L119`,
		lang: 'python',
		code: `def _urllib3_request_context(
    request: PreparedRequest,
    verify: bool | str | None,
    client_cert: tuple[str, str] | str | None,
    poolmanager: PoolManager,
) -> tuple[dict[str, Any], dict[str, Any]]:
    host_params: dict[str, Any] = {}
    pool_kwargs: dict[str, Any] = {}
    parsed_request_url = urlparse(request.url)
    scheme = parsed_request_url.scheme.lower()
    port = parsed_request_url.port

    cert_reqs = "CERT_REQUIRED"
    if verify is False:
        cert_reqs = "CERT_NONE"
    elif isinstance(verify, str):
        if not os.path.isdir(verify):
            pool_kwargs["ca_certs"] = verify
        else:
            pool_kwargs["ca_cert_dir"] = verify
    pool_kwargs["cert_reqs"] = cert_reqs
    if client_cert is not None:
        if isinstance(client_cert, tuple) and len(client_cert) == 2:
            pool_kwargs["cert_file"] = client_cert[0]
            pool_kwargs["key_file"] = client_cert[1]
        else:
            # According to our docs, we allow users to specify just the client
            # cert path
            pool_kwargs["cert_file"] = client_cert
    host_params = {
        "scheme": scheme,
        "host": parsed_request_url.hostname,
        "port": port,
    }
    return host_params, pool_kwargs`,
		notes: [
			'La ligne 13 part toujours de `CERT_REQUIRED`. Seul `verify is False`, ligne 14, passe à `CERT_NONE`. La doc de requests : avec `False`, requests "will accept any TLS certificate presented by the server, and will ignore hostname mismatches and/or expired certificates".',
			'Les lignes 16 à 20 traitent une chaîne : un fichier va dans `ca_certs`, un dossier dans `ca_cert_dir`. C’est par cette branche que tu fais confiance à une AC privée. Avec `verify=True`, requests se rabat sur `DEFAULT_CA_BUNDLE_PATH`, qui vaut `certs.where()` de certifi.',
			'La ligne 21 met `cert_reqs` dans `pool_kwargs`. urllib3 construit sa clé de pool à partir de ces valeurs, et [`PoolKey`](' + URLLIB3 + '/src/urllib3/poolmanager.py#L58-L82) a un champ `key_cert_reqs`. Depuis 2.32.0, le correctif de la CVE-2024-35195, une connexion `CERT_NONE` vit dans son propre pool.',
			'Avant le correctif, `send()` appelait `get_connection(request.url, proxies)`, qui choisissait le pool d’après la seule URL. Une connexion ouverte en `CERT_NONE` restait dans le pool de cette origine et servait les appels suivants faits avec `verify=True`.'
		]
	},
	tradeoff: {
		gain: [
			'Avec la vérification de la chaîne et du nom, une machine sur le chemin ne peut pas se faire passer pour `github.com` : il lui faudrait un certificat à ce nom signé par une AC du magasin du client.',
			'TLS 1.3 chiffre le message `Certificate` du serveur : un observateur passif de la poignée de main ne voit pas quel certificat le serveur a envoyé.',
			'Pointer `verify` vers le fichier d’une AC privée garde les deux vérifications pour les services internes, sans rien changer côté serveur.'
		],
		cost: [
			'Le client fait confiance à toutes les AC de son magasin. Un certificat émis à tort par n’importe laquelle passe la vérification de la chaîne.',
			'Le magasin d’AC vieillit : un vieux `certifi` ou une vieille image de base ignore les racines récentes, et les connexions échouent en `CERTIFICATE_VERIFY_FAILED` jusqu’à la mise à jour.',
			'`verify=False` ne lève aucune erreur. Il émet seulement l’`InsecureRequestWarning` d’urllib3, et un appel à `urllib3.disable_warnings()` le fait taire.'
		]
	},
	task: {
		prompt: 'Dans un terminal, lance `echo | openssl s_client -connect self-signed.badssl.com:443 -servername self-signed.badssl.com`, puis la même chose pour `wrong.host.badssl.com`. Note le `Verify return code` de chacun. Relance le second avec `-verify_hostname wrong.host.badssl.com`. Explique les trois résultats, et dis lequel `requests.get(url)` refuserait.',
		hint: 'Regarde les lignes `s:` (sujet) et `i:` (émetteur) du certificat 0. Et vérifie ce que `s_client` compare quand tu ne passes pas `-verify_hostname`.',
		answer: [
			'`self-signed.badssl.com` : `Verify return code: 18 (self-signed certificate)`. Le certificat 0 a le même sujet et le même émetteur, `CN = *.badssl.com`, et aucune AC du magasin ne l’a signé.',
			'`wrong.host.badssl.com` sans l’option : `Verify return code: 0 (ok)`. La chaîne remonte jusqu’à `ISRG Root YR`, une racine du magasin. `s_client` vérifie la chaîne mais pas le nom, sauf si tu le demandes.',
			'Avec `-verify_hostname wrong.host.badssl.com` : `Verify return code: 62 (hostname mismatch)`. Le certificat porte `*.badssl.com`, et la RFC 9525 dit : "A wildcard in a presented identifier can only match one label". `wrong.host` fait deux labels.',
			'`requests.get` refuse les deux hôtes avec une `SSLError`, car urllib3 vérifie la chaîne et le nom. Un outil qui ne vérifie que la chaîne, comme `s_client` sans l’option, accepterait le second.'
		],
		steps: [
			{
				title: 'Lis le résultat auto-signé',
				questions: [
					{ q: 'Quel `Verify return code` donne `self-signed.badssl.com` ?', options: ['`0 (ok)`', '`62 (hostname mismatch)`', '`18 (self-signed certificate)`', '`10 (certificate has expired)`'], answer: 2, why: 'OpenSSL affiche `Verify return code: 18 (self-signed certificate)` pour cet hôte.' },
					{ q: 'Que montrent les lignes `s:` et `i:` du certificat 0 ?', options: ['Le même nom, `CN = *.badssl.com`', 'Un sujet et une AC différente', 'Aucun émetteur', 'Deux noms d’hôte différents'], answer: 0, why: 'Le sujet et l’émetteur sont identiques : le certificat s’est signé lui-même.' },
					{ q: 'Tu ajoutes ce certificat précis au magasin du client et relances `s_client`. Qu’est-ce qui change ?', options: ['Rien : un certificat auto-signé ne passe jamais', 'La vérification de la chaîne passe : la chaîne finit maintenant sur un certificat du magasin', 'Seules les connexions TLS 1.2 passent', 'C’est la vérification du nom qui échoue à la place'], answer: 1, why: 'La vérification de la chaîne demande si la chaîne finit sur un élément du magasin, pas si une entreprise d’AC l’a signée. Un fichier d’AC privée marche de la même façon. Le nom `*.badssl.com` couvre toujours `self-signed.badssl.com`.' },
					{ q: 'La poignée de main elle-même a-t-elle abouti ?', options: ['Non, le MAC de `Finished` a échoué', 'Non, l’échange de clés a échoué', 'Seulement en TLS 1.2', 'Oui : le serveur signe avec sa propre clé, la poignée de main est valide'], answer: 3, why: 'N’importe qui peut mener une poignée de main valide avec sa propre paire de clés. Seule la vérification de la chaîne l’arrête.' }
				]
			},
			{
				title: 'Lis le résultat du mauvais hôte',
				questions: [
					{ q: 'Sans `-verify_hostname`, quel code donne `wrong.host.badssl.com` ?', options: ['`0 (ok)`', '`18 (self-signed certificate)`', '`62 (hostname mismatch)`', '`21 (unable to verify the first certificate)`'], answer: 0, why: 'La chaîne est bonne, et rien n’a demandé à `s_client` de vérifier le nom.' },
					{ q: 'Pourquoi la vérification de la chaîne passe-t-elle ?', options: ['La feuille s’est signée elle-même', 'badssl.com a sa propre AC', 'La chaîne remonte à une AC racine du magasin du client', 'Le client saute la chaîne sans `-CAfile`'], answer: 2, why: 'Contrairement à l’hôte auto-signé, cette feuille a été signée par une AC, et sa chaîne finit sur une racine à laquelle le magasin fait confiance.' },
					{ q: 'Pourquoi `s_client` dit-il ok ici ?', options: ['badssl.com est sur une liste d’autorisation', 'Il vérifie la chaîne, mais pas le nom sauf si tu le demandes', 'Le joker accepte n’importe quel nom', 'Il ignore le certificat 0'], answer: 1, why: '`s_client` ne compare le nom que si tu passes `-verify_hostname`.' },
					{ q: 'Une sonde de santé lance cette commande `s_client`, sans `-verify_hostname`, sur `wrong.host.badssl.com`. Que signale-t-elle ?', options: ['Un échec sur le code 62', 'Un échec sur le code 18', 'Une erreur DNS', 'Tout va bien, alors que tout client qui vérifie le nom refuse l’hôte'], answer: 3, why: 'Elle voit `0 (ok)` parce que seule la chaîne a été vérifiée. Les navigateurs et requests vérifient aussi le nom : la sonde est verte pendant que les vrais clients échouent.' }
				]
			},
			{
				title: 'Ajoute la vérification du nom',
				questions: [
					{ q: 'Avec `-verify_hostname wrong.host.badssl.com`, quel est le code ?', options: ['`0 (ok)`', '`62 (hostname mismatch)`', '`18 (self-signed certificate)`', '`20 (unable to get local issuer certificate)`'], answer: 1, why: 'La chaîne passe toujours, mais le nom ne correspond pas au certificat.' },
					{ q: 'Quel nom porte le certificat ?', options: ['`*.badssl.com`', '`wrong.host.badssl.com`', '`*.host.badssl.com`', '`badssl.com` seulement'], answer: 0, why: 'C’est un joker pour un niveau sous `badssl.com`.' },
					{ q: 'Pourquoi `*.badssl.com` ne couvre-t-il pas `wrong.host.badssl.com` ?', options: ['Les jokers sont interdits en TLS 1.3', 'Le nom est trop long', 'Un joker ne couvre qu’un label, et `wrong.host` en fait deux', 'Les jokers ne couvrent que `www`'], answer: 2, why: 'La RFC 9525 : "A wildcard in a presented identifier can only match one label".' },
					{ q: 'Où le client trouve-t-il les noms à comparer ?', options: ['Dans le champ émetteur', 'Dans le `ServerHello`', 'Dans le magasin d’AC', 'Dans le Subject Alternative Name du certificat'], answer: 3, why: 'Le client compare le nom de l’URL aux noms DNS du SAN.' }
				]
			},
			{
				title: 'Prédis requests',
				questions: [
					{ q: 'Que fait `requests.get("https://self-signed.badssl.com")` ?', options: ['Il lève une `SSLError`', 'Il renvoie 200 avec un avertissement', 'Il renvoie 200 sans rien dire', 'Il réessaie en HTTP'], answer: 0, why: 'requests part toujours de `CERT_REQUIRED`, et la chaîne ne finit pas sur une AC de confiance.' },
					{ q: 'Et `requests.get("https://wrong.host.badssl.com")` ?', options: ['Il renvoie 200, comme `s_client`', 'Il renvoie 200 avec un `InsecureRequestWarning`', 'Il lève une `SSLError`, car urllib3 vérifie aussi le nom', 'Il lève une `ConnectionError` de DNS'], answer: 2, why: 'urllib3 vérifie la chaîne et le nom, il refuse donc les deux hôtes.' },
					{ q: 'Quel appel accepterait les deux hôtes ?', options: ['`requests.get(url, verify=True)`', '`requests.get(url, verify="/etc/ssl/internal-ca.pem")`', '`requests.get(url, timeout=5)`', '`requests.get(url, verify=False)`'], answer: 3, why: '`verify is False` passe en `CERT_NONE` : n’importe quel certificat, n’importe quel nom, n’importe quelles dates.' },
					{ q: 'Avec `verify=False`, qu’affiche `requests.get("https://self-signed.badssl.com")` en plus de renvoyer la réponse ?', options: ['Une `SSLError`', 'Seulement l’`InsecureRequestWarning` d’urllib3', 'Une erreur `CERTIFICATE_VERIFY_FAILED`', 'Une erreur de dépréciation de requests'], answer: 1, why: '`verify=False` ne lève aucune erreur. L’avertissement est la seule trace, et un appel à `urllib3.disable_warnings()` le cache aussi.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Un attaquant sur le Wi-Fi répond à ta poignée de main TLS 1.3 avec son propre certificat auto-signé. Quel contrôle fait échouer l’échange ?',
			options: [
				'Le MAC de `Finished`, car l’attaquant ne peut pas le calculer sur la poignée de main',
				'La signature de `CertificateVerify`, car l’attaquant n’a pas de clé valide',
				'La vérification de la chaîne par le client, car aucune AC du magasin n’a signé ce certificat',
				'L’échange `key_share`, car l’attaquant ne peut pas produire de part Diffie-Hellman'
			],
			answer: 2,
			why: 'L’attaquant mène une poignée de main complète avec sa propre paire de clés : son `key_share`, son `CertificateVerify` et son `Finished` sont tous valides. Ce qu’il ne peut pas produire, c’est une chaîne qui finit sur une AC à laquelle le client fait confiance pour ce nom.'
		},
		{
			q: 'Avant requests 2.32.0, une `Session` fait un appel avec `verify=False`, puis un appel vers la même origine avec `verify=True`. Que se passe-t-il au second ?',
			options: [
				'requests lève une erreur : `verify` ne peut pas changer dans une même `Session`',
				'Il réutilise la connexion du pool ouverte en `CERT_NONE`, donc aucun contrôle',
				'Il vérifie le certificat, car `verify=True` vide tout le pool de connexions',
				'Il vérifie le certificat seulement si la première réponse avait le statut 200'
			],
			answer: 1,
			why: 'Le pool était choisi d’après la seule URL, donc les deux appels partageaient un même pool urllib3. Le correctif de 2.32.0 ajoute `cert_reqs` à la clé de pool, ce qui donne aux connexions `CERT_NONE` leur propre pool.'
		},
		{
			q: 'Ton service appelle une API interne dont le certificat vient de l’AC de ton entreprise. requests échoue en `CERTIFICATE_VERIFY_FAILED`. Que changes-tu ?',
			options: [
				'Mettre `verify=False` sur les appels vers cet hôte seulement, et le garder ailleurs',
				'Couper la vérification du nom et garder celle de la chaîne',
				'Appeler l’API en `http://` simple, puisqu’elle ne sort pas du réseau interne',
				'Passer le fichier de l’AC à `verify` ou y pointer `REQUESTS_CA_BUNDLE`'
			],
			answer: 3,
			why: 'Un chemin dans `verify` fait construire à urllib3 la chaîne jusqu’à ton AC, et il vérifie toujours le nom et les dates. `verify=False` et le HTTP simple laissent toute machine sur le chemin lire et modifier le trafic.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Monter une AC privée sur ton portable, servir du TLS sur localhost, et voir la vérification de la chaîne et celle du nom passer puis échouer.',
		steps: [
			'Crée une AC, avec OpenSSL 3 : `mkdir ~/tls-lab && cd ~/tls-lab && openssl req -x509 -newkey rsa:2048 -nodes -keyout ca.key -out ca.pem -days 7 -subj "/CN=Lab Root CA"`.',
			'Émets un certificat pour `localhost` : `openssl req -newkey rsa:2048 -nodes -keyout server.key -out server.csr -subj "/CN=localhost"`, puis `printf \'subjectAltName=DNS:localhost\\n\' > san.ext && openssl x509 -req -in server.csr -CA ca.pem -CAkey ca.key -CAcreateserial -out server.pem -days 7 -extfile san.ext`.',
			'Dans un second terminal : `cd ~/tls-lab && openssl s_server -accept 8443 -cert server.pem -key server.key -www`.',
			'Vérifie la chaîne : `echo | openssl s_client -connect localhost:8443 -servername localhost | grep "Verify return code"`, puis la même chose avec `-CAfile ca.pem`.',
			'Vérifie le nom : ajoute `-verify_hostname example.com` à la commande avec `-CAfile`.',
			'Refais-le avec curl : `curl https://localhost:8443/`, puis `curl -k https://localhost:8443/`, puis `curl --cacert ca.pem https://localhost:8443/`.'
		],
		done: [
			'Sans `-CAfile`, `s_client` affiche `Verify return code: 21 (unable to verify the first certificate)`.',
			'Avec `-CAfile ca.pem`, il affiche `Verify return code: 0 (ok)`, et avec `-verify_hostname example.com` il affiche `62 (hostname mismatch)`.',
			'`curl` seul échoue avec le code de sortie 60, `curl -k` et `curl --cacert ca.pem` reçoivent tous deux la page.'
		],
		solution: [
			'Ton AC n’est pas dans le magasin du système : la chaîne ne peut pas finir sur une racine de confiance tant que tu ne donnes pas `ca.pem` au client.',
			'Le certificat ne nomme que `localhost`, donc une vérification contre `example.com` échoue même avec une bonne chaîne.',
			'`curl -k`, c’est le `verify=False` de curl : il reçoit la page, et il la recevrait tout aussi bien de n’importe quelle machine sur le chemin. `--cacert`, comme `verify="ca.pem"` dans requests, garde les deux vérifications.'
		]
	},
	recall: {
		q: 'Dans une poignée de main TLS 1.3, que prouve `CertificateVerify`, et que doit encore vérifier le client lui-même ?',
		a: 'Il prouve que le serveur détient la clé privée du certificat envoyé. Le client vérifie encore que la chaîne finit sur une AC de son magasin et que le nom correspond à l’URL ; `verify=False` saute les deux.'
	},
	sources: [
		{ title: 'RFC 8446, The Transport Layer Security (TLS) Protocol Version 1.3', url: 'https://www.rfc-editor.org/rfc/rfc8446' },
		{ title: 'GHSA-9wx4-h78v-vm56 (CVE-2024-35195), la Session de requests ne vérifie plus après verify=False', url: 'https://github.com/advisories/GHSA-9wx4-h78v-vm56' },
		{ title: 'requests, pull request 6655, Use TLS settings in selecting connection pool', url: 'https://github.com/psf/requests/pull/6655' },
		{ title: 'Doc requests, SSL Cert Verification', url: 'https://requests.readthedocs.io/en/latest/user/advanced/#ssl-cert-verification' },
		{ title: 'Doc curl, SSL CA Certificates', url: 'https://curl.se/docs/sslcerts.html' },
		{ title: 'RFC 9525, Service Identity in TLS', url: 'https://www.rfc-editor.org/rfc/rfc9525' },
		{ title: 'Doc urllib3, TLS Warnings', url: 'https://urllib3.readthedocs.io/en/latest/advanced-usage.html#tls-warnings' },
		{ title: 'Hôtes de test badssl.com', url: 'https://badssl.com/' }
	]
};
