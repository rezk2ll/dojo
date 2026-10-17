const CERTBOT = 'https://github.com/certbot/certbot/blob/990a59a814c8d4c53cc896f3c376c1c14e6c099c';
const REVOKE = 'https://community.letsencrypt.org/t/revoking-certain-certificates-on-march-4/114864';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'acme',
	part: 'Les secrets et la chaîne d’approvisionnement',
	title: 'Des certificats qui se renouvellent seuls',
	minutes: 10,
	hook: [
		'Le 29 février 2020, Let’s Encrypt trouve un bug dans les vérifications CAA de Boulder, son logiciel d’AC. Le 3 mars, il [annonce](' + REVOKE + ') qu’il doit révoquer les certificats touchés : 3 048 289 au total. La date limite de conformité tombe le 5 mars 2020 à 03:00 UTC, environ deux jours plus tard.',
		'À cette date, Let’s Encrypt a révoqué 1 706 505 certificats dont il était sûr qu’ils avaient été remplacés. Sa FAQ expliquait aux abonnés touchés comment "to avoid problems by renewing affected certificates early", en renouvelant tôt. Plus d’un million de certificats restaient "either unknown or not replaced" le 5 mars.',
		'Let’s Encrypt émet aujourd’hui des certificats de 90 jours, et en émettra de 45 jours d’ici 2028.'
	],
	terms: [
		{ term: 'ACME', def: 'Le protocole de la RFC 8555 : un client envoie du JSON signé en HTTPS à une AC pour ouvrir un compte, commander un certificat, prouver le contrôle de chaque nom et récupérer le résultat.' },
		{ term: 'Challenge', def: 'Une épreuve que l’AC impose pour vérifier que tu contrôles un nom. `http-01` demande un fichier à `http://<domain>/.well-known/acme-challenge/<token>`, `dns-01` un enregistrement TXT à `_acme-challenge.<domain>`.' },
		{ term: 'Key authorization', def: 'La chaîne que le challenge vérifie : le token, un point, puis l’empreinte SHA-256 en base64url de la clé de compte du client.' },
		{ term: 'ARI', def: 'ACME Renewal Information : l’AC indique au client une fenêtre pour renouveler chaque certificat, et peut l’avancer, par exemple avant une révocation de masse.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['acct["Client : nouvelle paire de clés, requête newAccount signée avec elle"] --> order["Commande : example.com"]', 'order --> authz["Autorisation : pending, challenges http-01 et dns-01"]'],
				highlight: ['acct', 'order', 'authz'],
				note: 'Le client génère une paire de clés de compte et signe chaque requête avec. Il commande un certificat pour `example.com`. L’AC répond avec une autorisation par nom et une liste de challenges, chacun avec un token aléatoire d’au moins 128 bits.'
			},
			{
				add: ['authz --> http["http-01 : fichier à /.well-known/acme-challenge/TOKEN = TOKEN.empreinte"]', 'http -->|"GET sur le port 80"| ca["L’AC compare le contenu à la key authorization qu’elle a calculée"]'],
				highlight: ['http', 'ca'],
				note: 'Pour `http-01`, le client sert la key authorization à `/.well-known/acme-challenge/<token>`. L’AC la récupère en HTTP simple. RFC 8555 : "This request MUST be sent to TCP port 80 on the HTTP server." Let’s Encrypt la récupère depuis plusieurs points d’observation.'
			},
			{
				add: ['authz --> dns["dns-01 : TXT _acme-challenge.example.com = base64url(SHA-256(key authorization))"]', 'dns -->|"requête DNS"| ca'],
				highlight: ['dns'],
				note: 'Pour `dns-01`, le client publie la key authorization hachée dans un enregistrement TXT. Des deux, c’est le seul que Let’s Encrypt accepte pour un wildcard comme `*.example.com`. Let’s Encrypt prévient que des identifiants d’API DNS posés sur le serveur web aggravent les dégâts si ce serveur est piraté.'
			},
			{
				add: ['ca --> csr["Finalisation : le client envoie un CSR"]', 'csr --> cert["Certificat : 90 jours aujourd’hui, 45 jours d’ici 2028"]'],
				highlight: ['csr', 'cert'],
				note: 'Une fois chaque autorisation validée, le client envoie un CSR et télécharge le certificat. Let’s Encrypt réutilise aujourd’hui une autorisation validée pendant 30 jours, et passera à 7 heures d’ici 2028. Dès lors, un renouvellement 30 jours après le précédent repasse toujours un challenge.'
			},
			{
				add: ['timer["certbot renew via cron ou un timer systemd, deux fois par jour"] -->|"fenêtre ARI, ou 2/3 de la durée de vie"| order', 'timer -->|"port 80 fermé, DNS déplacé"| fail["5 autorisations échouées par nom et par heure, puis blocage"]'],
				highlight: ['timer', 'fail'],
				note: 'Un timer lance `certbot renew`, et certbot ne renouvelle que les certificats arrivés à échéance. Un changement de pare-feu sur le port 80 ou un nom déplacé vers un autre hôte fait échouer chaque renouvellement. Let’s Encrypt autorise "5 authorization failures per identifier" par compte et par heure. Il n’envoie plus d’e-mail d’expiration depuis le 4 juin 2025 : c’est ta propre supervision qui doit repérer un renouvellement en échec.'
			}
		]
	},
	example: {
		title: 'certbot/_internal/renewal.py : quand certbot décide de renouveler',
		repo: 'certbot/certbot',
		url: `${CERTBOT}/certbot/src/certbot/_internal/renewal.py#L413-L489`,
		lang: 'python',
		code: `def _default_renewal_time(cert_pem: bytes) -> datetime.datetime:
…
    cert = x509.load_pem_x509_certificate(cert_pem)

    not_before = cert.not_valid_before_utc
    lifetime = cert.not_valid_after_utc - not_before
    if lifetime.total_seconds() < 10 * 86400:
        default_rt = not_before + lifetime / 2
    else:
        default_rt = not_before + lifetime * 2 / 3

    return default_rt

def should_autorenew(lineage: storage.RenewableCert,
                     ari_clients: AriClientPool) -> bool:
…
    if not lineage.autorenewal_is_enabled():
        return False

    cert = lineage.version("cert", lineage.latest_common_version())
    with open(cert, 'rb') as f:
        cert_pem = f.read()

    renewal_time = _ari_renewal_time(lineage, cert_pem, ari_clients)

    now = datetime.datetime.now(datetime.timezone.utc)

    if renewal_time and now > renewal_time:
        return True

    # Renewals on the basis of revocation
    if lineage.ocsp_revoked(lineage.latest_common_version()):
        logger.debug("Should renew, certificate is revoked.")
        return True

    # If the renew_before_expiry config field is set, check if it says we should renew
    config_interval = lineage.configuration.get("renew_before_expiry")
    if config_interval is not None:
        notAfter = crypto_util.notAfter(cert)
        if notAfter < storage.add_time_interval(now, config_interval):
            logger.debug("Should renew, less than %s before certificate "
                            "expiry %s.", config_interval,
                            notAfter.strftime("%Y-%m-%d %H:%M:%S %Z"))
            return True
    # Only use the default if we don't have an ARI or renew_before_expiry value
    elif renewal_time is None:
        default_renewal_time = _default_renewal_time(cert_pem)
        if now > default_renewal_time:
            return True

    return False`,
		notes: [
			'La ligne `lifetime * 2 / 3` fixe la règle par défaut : un certificat de 90 jours se renouvelle après 60 jours, un de 45 jours après 30. Sous 10 jours de durée de vie (`10 * 86400` secondes), certbot renouvelle à la moitié : un certificat de 6 jours se renouvelle après 3 jours.',
			'`_ari_renewal_time` demande d’abord à l’AC sa fenêtre de renouvellement. Quand `now > renewal_time`, certbot renouvelle quel que soit l’âge du certificat. Let’s Encrypt recommande ARI pour qu’un client renouvelle à temps quand la durée de vie tombera à 45 jours.',
			'`lineage.ocsp_revoked(...)` renouvelle un certificat que son répondeur OCSP déclare révoqué. Pour une révocation de masse comme en mars 2020, la RFC 9773 permet plutôt à l’AC d’avancer la fenêtre ARI : la première branche se déclenche alors avant la révocation.',
			'Comme chaque passage renvoie `False` tant qu’aucun certificat n’est à échéance, la [doc de certbot](' + CERTBOT + '/certbot/docs/using.rst) propose une ligne cron qui lance `certbot renew -q` à `0 0,12 * * *`, après une pause aléatoire d’au plus une heure. Le lancer souvent ne coûte rien.'
		]
	},
	tradeoff: {
		gain: [
			'Une clé volée ne sert à un attaquant que jusqu’à l’expiration du certificat : 90 jours aujourd’hui, 45 jours à partir de 2028.',
			'Le renouvellement se passe de toute intervention : un timer, un challenge et un CSR, deux fois par jour, avec `certbot renew --dry-run` pour tester tout le parcours sur le serveur de staging.',
			'Avec ARI, l’AC peut demander à tous les clients de renouveler tôt avant une révocation de masse, sans écrire à chaque abonné.'
		],
		cost: [
			'Chaque renouvellement dépend du chemin du challenge : le port 80 ouvert sur internet pour `http-01`, ou un jeton d’API DNS sur la machine pour `dns-01`.',
			'Un calendrier codé en dur casse quand la durée de vie raccourcit. Let’s Encrypt : "renewing at a hardcoded interval of 60 days will no longer be sufficient" pour des certificats de 45 jours.',
			'Un renouvellement qui échoue à chaque passage écrit une erreur dans le log de certbot, et personne n’est alerté si tu n’as pas ajouté d’alerte. Depuis le 4 juin 2025, Let’s Encrypt n’envoie plus d’e-mail d’expiration.'
		]
	},
	task: {
		prompt: 'Après le 16 février 2028, le profil par défaut de Let’s Encrypt émet des certificats de 45 jours. Ton certificat pour `shop.example.com` a été émis le 1er mars 2028 à 00:00 UTC. certbot tourne à 00:00 et à 12:00, sans ARI ni `renew_before_expiry`. Le 30 mars, un changement de pare-feu ferme le port 80. Quand certbot tente-t-il de renouveler la première fois, combien de tentatives ont lieu avant l’expiration, et comment t’en rendrais-tu compte ? 10 minutes, sur papier.',
		hint: 'Utilise `_default_renewal_time` : la durée de vie dépasse 10 jours, donc le facteur est 2/3. L’expiration vaut `notBefore` plus 45 jours.',
		answer: [
			'L’heure de renouvellement vaut 1er mars plus 2/3 de 45 jours, soit 30 jours : le 31 mars 2028 à 00:00 UTC. certbot essaie au premier passage où `now > default_renewal_time`, au plus tard le 31 mars à 12:00.',
			'Le certificat expire le 1er mars plus 45 jours : le 15 avril 2028 à 00:00. Du 31 mars au 15 avril, il y a 15 jours de deux passages, donc environ 30 tentatives. Toutes échouent, car le `GET` de l’AC vers le port 80 n’aboutit pas.',
			'Chaque passage fait une tentative `http-01`, bien en dessous de la limite de 5 autorisations échouées par nom et par heure : ce n’est pas la limite de débit qui te bloque, c’est le pare-feu.',
			'Rien ne te prévient par défaut : plus d’e-mail de Let’s Encrypt depuis juin 2025. Vérifie qu’il reste plus de 14 jours au certificat servi (`openssl s_client` et `-checkend 1209600`), ou alerte sur la variable `FAILED_DOMAINS` que certbot passe aux post hooks.'
		]
	},
	quiz: [
		{
			q: 'Pour un challenge `http-01` sur `example.com`, que récupère l’AC, et comment ?',
			options: [
				'`https://example.com/.well-known/acme-challenge/<token>` sur le port 443, en vérifiant l’ancien certificat',
				'`http://example.com/.well-known/acme-challenge/<token>` sur le port 80, puis elle compare la key authorization',
				'Un enregistrement TXT à `_acme-challenge.example.com`, dont elle compare le hash au token',
				'La page `http://example.com/` sur le port 80, en cherchant le token dans une balise meta HTML'
			],
			answer: 1,
			why: 'La RFC 8555 construit l’URL `http://{domain}/.well-known/acme-challenge/{token}` et envoie le GET sur le port TCP 80. Le contenu doit valoir le token, un point et l’empreinte de la clé de compte. L’enregistrement TXT, c’est `dns-01`.'
		},
		{
			q: 'Il te faut un certificat pour `*.example.com` chez Let’s Encrypt. Quel challenge marche ?',
			options: [
				'`http-01` sur n’importe quel hôte sous ce nom, l’AC en choisit un au hasard',
				'`http-01` sur `example.com` lui-même, qui couvre tous les sous-domaines',
				'`dns-01`, avec un enregistrement TXT à `_acme-challenge.example.com`',
				'`tls-alpn-01` sur le port 443 d’`example.com`, qui couvre les wildcards'
			],
			answer: 2,
			why: 'La doc de Let’s Encrypt dit que `http-01` "cannot be used to issue wildcard certificates". Le challenge `dns-01` prouve le contrôle de la zone DNS, qui couvre tous les noms en dessous.'
		},
		{
			q: 'Ton script renouvelle chaque certificat à date fixe, tous les 60 jours. Que se passe-t-il quand l’AC passe aux certificats de 45 jours ?',
			options: [
				'Rien, car l’AC prolonge un certificat quand son renouvellement est en retard',
				'L’AC refuse la commande, car 60 jours dépasse la nouvelle durée de vie',
				'certbot prend la main sur le script et renouvelle aux 2/3 de la durée de vie',
				'Chaque certificat expire 15 jours avant que le script ne le renouvelle'
			],
			answer: 3,
			why: 'Un certificat de 45 jours n’est plus valide à partir du jour 45, et le script attend le jour 60. Un client qui renouvelle à une fraction de la durée de vie (2/3 pour certbot) ou qui suit ARI continue de marcher quand la durée change.'
		}
	],
	recall: {
		q: 'Quand certbot renouvelle-t-il un certificat par défaut, et qu’est-ce que ça donne pour un certificat de 90 jours et un de 45 jours ?',
		a: 'Après 2/3 de sa durée de vie (la moitié sous 10 jours), sauf si ARI ou `renew_before_expiry` dit autre chose : après 60 jours pour un certificat de 90 jours, après 30 jours pour un de 45 jours.'
	},
	sources: [
		{ title: 'RFC 8555, Automatic Certificate Management Environment (ACME)', url: 'https://www.rfc-editor.org/rfc/rfc8555' },
		{ title: 'Communauté Let’s Encrypt, Revoking certain certificates on March 4', url: 'https://community.letsencrypt.org/t/revoking-certain-certificates-on-march-4/114864' },
		{ title: 'Communauté Let’s Encrypt, 2020.02.29 CAA Rechecking Bug', url: 'https://community.letsencrypt.org/t/2020-02-29-caa-rechecking-bug/114591' },
		{ title: 'Let’s Encrypt, Decreasing Certificate Lifetimes to 45 Days', url: 'https://letsencrypt.org/2025/12/02/from-90-to-45/' },
		{ title: 'Let’s Encrypt, Ending Support for Expiration Notification Emails', url: 'https://letsencrypt.org/2025/01/22/ending-expiration-emails/' },
		{ title: 'RFC 9773, ACME Renewal Information (ARI) Extension', url: 'https://www.rfc-editor.org/rfc/rfc9773' },
		{ title: 'Doc Let’s Encrypt, Challenge Types', url: 'https://letsencrypt.org/docs/challenge-types/' },
		{ title: 'Doc Let’s Encrypt, Rate Limits', url: 'https://letsencrypt.org/docs/rate-limits/' },
		{ title: 'Doc certbot, User Guide (renouveler les certificats)', url: 'https://eff-certbot.readthedocs.io/en/stable/using.html#renewing-certificates' }
	]
};
