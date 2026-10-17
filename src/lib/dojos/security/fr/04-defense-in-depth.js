const PYWA = 'https://github.com/duo-labs/py_webauthn/blob/c9ba2b7dad6b76bec89e44c76c8ed81fc43287bb';
const VERIFY = `${PYWA}/webauthn/authentication/verify_authentication_response.py`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'defense-in-depth',
	part: 'Les menaces',
	title: 'La défense en profondeur',
	minutes: 10,
	hook: [
		'Le 20 juillet 2022 à 22 h 50 UTC, au moins 76 employés de Cloudflare reçoivent un SMS en moins d’une minute. Le lien mène à `cloudflare-okta.com`, une copie de la page de connexion Okta de l’entreprise, enregistrée moins de 40 minutes plus tôt. La page envoie chaque identifiant, mot de passe et code à usage unique à l’attaquant via Telegram, dès qu’il est tapé.',
		'Trois employés tapent leurs identifiants. L’attaquant les essaie ensuite sur la vraie page de connexion, sans succès : chaque employé de Cloudflare a une clé de sécurité FIDO2, et chaque appli interne l’exige. Aucun système de Cloudflare n’est compromis.',
		'Twilio subit à la même période une campagne aux caractéristiques très proches. Là, les attaquants entrent, et Twilio comptera 163 clients dont les données ont été consultées. Chez Cloudflare, plusieurs contrôles ont lâché cette nuit-là avant qu’un tienne. La **défense en profondeur** part de ce constat : chaque contrôle du chemin suppose que le précédent peut céder.'
	],
	terms: [
		{ term: 'Défense en profondeur', def: 'Plusieurs contrôles indépendants sur le même chemin d’attaque, que l’attaquant doit battre un par un. Quand l’un cède, il reste encore le suivant à battre.' },
		{ term: 'Phishing en temps réel', def: 'Une fausse page de connexion qui transmet à l’attaquant, en quelques secondes, ce que tape la victime, pour qu’il utilise un code à usage unique avant son expiration.' },
		{ term: 'Liaison à l’origine', def: 'Dans WebAuthn, le navigateur écrit l’origine de la page dans les données de connexion signées, et la clé ne signe que pour le site où elle a été enregistrée. Une réponse produite sur `cloudflare-okta.com` échoue au contrôle de `cloudflare.com`.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['sms["SMS à 76 employés : cloudflare-okta.com"] --> reg["Couche 1 : surveiller les nouveaux domaines avec la marque"]'],
				highlight: ['sms', 'reg'],
				note: 'Le domaine est enregistré à 22:13:04 UTC, et les SMS partent à 22:50. Cloudflare surveille les nouveaux domaines qui utilisent sa marque, mais celui-ci « had not yet been published as a new .com registration ». La couche 1 a échoué : personne ne connaissait encore le domaine.'
			},
			{
				add: ['reg -->|"raté"| dns["Couche 2 : filtre DNS qui bloque les domaines connus"]'],
				highlight: ['dns'],
				note: 'Cloudflare Gateway filtre le DNS et le HTTP des employés. Sa détection automatique a bien repéré et bloqué le domaine, mais seulement après les premiers clics. La couche 2 a échoué pour ces clics-là.'
			},
			{
				add: ['dns -->|"trop tard"| ppl["Couche 3 : les gens signalent, ou tapent le mot de passe"]'],
				highlight: ['ppl'],
				note: 'Des employés signalent les SMS à l’équipe sécurité, de garde 24 h sur 24. Trois employés tapent quand même leur mot de passe. La page demande aussi un code TOTP, ce qui selon Cloudflare met en échec « most two-factor authentication implementations », parce que le code est relayé avant d’expirer.'
			},
			{
				add: ['ppl -->|"3 mots de passe volés"| key["Couche 4 : la clé FIDO2 ne signe que pour la vraie origine"]'],
				highlight: ['key'],
				note: 'L’attaquant essaie les mots de passe volés sur la vraie connexion. Les logs de Cloudflare montrent des « login attempts blocked due to the hard key (U2F) requirements indicating that the correct password was used ». L’attaquant n’a pas de clé, et la page ne peut pas faire signer la clé de la victime pour Cloudflare : le navigateur a mis `https://cloudflare-okta.com` dans les données signées, et la clé n’a aucun identifiant pour ce site.'
			},
			{
				add: ['key -.->|"si elle avait cédé"| edr["Couche 5 : la sécurité des postes bloque l’installation d’AnyDesk"]'],
				highlight: ['edr'],
				note: 'Une victime passée au-delà de la connexion aurait téléchargé AnyDesk, un logiciel de prise en main à distance. Personne n’est allé jusque-là. Cloudflare précise que « our endpoint security would have stopped the installation ». La couche 5 attendait toujours derrière la couche 4.'
			},
			{
				add: ['key --> resp["Réponse : réinitialiser les 3 comptes et sessions, bloquer les IP de l’attaquant"]'],
				highlight: ['resp'],
				note: 'L’équipe réinitialise les identifiants et les sessions actives des trois employés, scanne leurs machines, bloque les IP de l’attaquant et fait fermer le serveur et le domaine. Les connexions bloquées lui ont aussi indiqué quels comptes avaient fuité.'
			}
		]
	},
	example: {
		title: 'webauthn/authentication/verify_authentication_response.py dans py_webauthn : les contrôles qui arrêtent une connexion relayée',
		repo: 'duo-labs/py_webauthn',
		url: `${VERIFY}#L112-L185`,
		lang: 'python',
		code: `    if expected_challenge != client_data.challenge:
        raise InvalidAuthenticationResponse("Client data challenge was not expected challenge")

    if isinstance(expected_origin, str):
        if expected_origin != client_data.origin:
            raise InvalidAuthenticationResponse(
                f'Unexpected client data origin "{client_data.origin}", expected "{expected_origin}"'
            )
    else:
        try:
            expected_origin.index(client_data.origin)
        except ValueError:
            raise InvalidAuthenticationResponse(
                f'Unexpected client data origin "{client_data.origin}", expected one of {expected_origin}'
            )
…
    # Generate a hash of the expected RP ID for comparison
    expected_rp_id_hash = hashlib.sha256()
    expected_rp_id_hash.update(expected_rp_id.encode("utf-8"))
    expected_rp_id_hash_bytes = expected_rp_id_hash.digest()

    if auth_data.rp_id_hash != expected_rp_id_hash_bytes:
        raise InvalidAuthenticationResponse("Unexpected RP ID hash")
…
    client_data_hash = hashlib.sha256()
    client_data_hash.update(client_data_bytes)
    client_data_hash_bytes = client_data_hash.digest()

    signature_base = authenticator_data_bytes + client_data_hash_bytes

    try:
        decoded_public_key = decode_credential_public_key(credential_public_key)
        crypto_public_key = decoded_public_key_to_cryptography(decoded_public_key)

        verify_signature(
            public_key=crypto_public_key,
            signature_alg=decoded_public_key.alg,
            signature=signature_bytes,
            data=signature_base,
        )
    except InvalidSignature:
        raise InvalidAuthenticationResponse("Could not verify authentication signature")`,
		notes: [
			'`expected_origin != client_data.origin` refuse une connexion dont les données du navigateur nomment un autre site. Le navigateur remplit `origin` lui-même : une page de phishing ne peut pas y écrire `https://cloudflare.com`. Une réponse relayée depuis `cloudflare-okta.com` s’arrête à cette ligne.',
			'`auth_data.rp_id_hash` est le SHA-256 du RP ID, écrit par la clé. La spec WebAuthn : « the authenticator ensures that credentials created by a Relying Party can only be used in operations requested by the same RP ID ». Sur le domaine de phishing, la clé n’a aucun identifiant correspondant et ne signe rien.',
			'`signature_base` réunit les données de l’authentificateur et le SHA-256 de `client_data_bytes`, et `verify_signature` la vérifie avec la clé publique gardée à l’enregistrement. L’origine et le challenge font partie des octets signés : l’attaquant ne peut pas les changer après la signature.',
			'`expected_challenge` est une valeur aléatoire que le serveur a créée pour cette seule connexion. Une réponse signée capturée plus tôt porte un ancien challenge et échoue au premier contrôle.'
		]
	},
	tradeoff: {
		gain: [
			'L’attaquant avait 3 mots de passe corrects et n’a pas pu se connecter. Les tentatives ratées ont en plus montré à Cloudflare exactement quels 3 comptes réinitialiser.',
			'Les couches 1 et 2 ont échoué pour des raisons sans effet sur la couche 4 : un domaine trop récent pour être listé ne change rien à ce que signe une clé de sécurité.'
		],
		cost: [
			'Des couches qui semblent séparées peuvent partager une faiblesse. Le mot de passe et le code TOTP se tapent tous les deux dans la page : une seule page de phishing en temps réel bat les deux.',
			'Chaque employé a besoin d’une clé physique, et chaque appli doit l’exiger. Twilio n’a commencé le « distributing FIDO2 tokens to all employees » qu’après son incident.',
			'Une couche faite de gens qui signalent des SMS donne du travail à une équipe sécurité. Chez Cloudflare, « More than 90 percent of the reports to SIRT turn out to not be threats ».'
		]
	},
	task: {
		prompt: 'Ton panneau d’admin interne a quatre contrôles à la connexion : (a) un mot de passe, (b) un code TOTP à 6 chiffres depuis une appli, (c) une limite de 5 tentatives par minute et par IP, (d) un mail à l’utilisateur après une connexion depuis un nouvel appareil. Un attaquant utilise la même page de phishing en temps réel que chez Cloudflare. Pour chaque contrôle, dis s’il arrête l’attaque et pourquoi. Puis nomme le seul changement qui l’a arrêtée chez Cloudflare.',
		hint: 'L’attaquant fait une seule tentative, depuis sa machine, quelques secondes après la saisie de la victime. Quel contrôle voit quelque chose d’anormal ?',
		answer: [
			'(a) Mot de passe : relayé à l’attaquant dès la saisie. Il n’arrête pas l’attaque.',
			'(b) TOTP : la RFC 6238 recommande un pas de 30 secondes, et la page relaie le code en quelques secondes. Il n’arrête pas l’attaque.',
			'(c) Limite de débit : l’attaquant fait une tentative par victime, bien en dessous de 5 par minute. Elle n’arrête pas l’attaque.',
			'(d) Mail de nouvel appareil : il part une fois l’attaquant connecté, donc il n’aide que si l’utilisateur le lit et que quelqu’un réagit vite. Il détecte, il n’arrête pas.',
			'Le changement : exiger une clé WebAuthn ou une passkey. Le navigateur met l’origine du phishing dans les données signées, et le contrôle serveur `expected_origin != client_data.origin` la refuse, comme la couche 4 chez Cloudflare.'
		]
	},
	quiz: [
		{
			q: 'Trois employés de Cloudflare ont tapé leur mot de passe sur la page de phishing. Pourquoi l’attaquant n’a-t-il pas pu se connecter ?',
			options: [
				'Le filtre DNS avait bloqué le domaine avant toute saisie',
				'La clé de sécurité n’avait aucun identifiant pour ce site et n’a rien signé',
				'Les codes TOTP relayés avaient déjà expiré au bout de 30 secondes',
				'Les IP de l’attaquant étaient sur une liste noire avant l’attaque'
			],
			answer: 1,
			why: 'Une clé WebAuthn ne signe que pour le RP ID où elle a été enregistrée, et le navigateur écrit la vraie origine de la page dans les données signées. La page pouvait relayer le mot de passe, pas obtenir une signature valable pour Cloudflare. Cloudflare n’utilise d’ailleurs pas TOTP, et le blocage DNS est arrivé trop tard.'
		},
		{
			q: 'Quelle paire de contrôles est la plus faible en défense en profondeur face au phishing en temps réel ?',
			options: [
				'Un mot de passe et une clé de sécurité FIDO2',
				'Un mot de passe et un code TOTP tapé par l’utilisateur',
				'Un filtre DNS et une clé de sécurité FIDO2',
				'Une clé de sécurité FIDO2 et la sécurité des postes'
			],
			answer: 1,
			why: 'L’utilisateur tape le mot de passe et le code TOTP dans la page : la même fausse page capture les deux et les relaie. Les autres paires échouent pour des raisons différentes : une clé ne se tape pas dans une page, et un filtre DNS ne dépend pas de l’utilisateur.'
		},
		{
			q: 'Dans py_webauthn, pourquoi le serveur vérifie-t-il `client_data.origin` alors que la signature est valide ?',
			options: [
				'La signature ne couvre que les données de l’authentificateur, pas l’origine',
				'Le contrôle d’origine est plus rapide et passe en premier pour économiser du CPU',
				'Une signature valide faite sur un autre site doit quand même être refusée',
				'On ne peut pas compter sur le navigateur pour envoyer l’origine'
			],
			answer: 2,
			why: 'L’origine est dans les données client signées, mais la signature prouve seulement que la clé a signé ces octets. Le serveur doit lire l’origine et la comparer à son propre site. Sans `expected_origin`, une réponse signée sur un autre site pourrait passer.'
		}
	],
	recall: {
		q: 'Dans l’attaque de phishing de juillet 2022 contre Cloudflare, quelle couche a tenu, et quel contrôle du code l’a fait tenir ?',
		a: 'La clé de sécurité FIDO2. Le navigateur a écrit l’origine du phishing dans les données signées, et un contrôle serveur comme `expected_origin != client_data.origin` la refuse.'
	},
	sources: [
		{ title: 'Blog Cloudflare, The mechanics of a sophisticated phishing scam and how we stopped it (9 août 2022)', url: 'https://blog.cloudflare.com/2022-07-sms-phishing-attacks/' },
		{ title: 'Twilio, Incident Report: Employee and Customer Account Compromise (août 2022)', url: 'https://www.twilio.com/en-us/blog/august-2022-social-engineering-attack' },
		{ title: 'W3C, Web Authentication Level 3', url: 'https://www.w3.org/TR/webauthn-3/' },
		{ title: 'py_webauthn, verify_authentication_response.py', url: 'https://github.com/duo-labs/py_webauthn/blob/c9ba2b7dad6b76bec89e44c76c8ed81fc43287bb/webauthn/authentication/verify_authentication_response.py' },
		{ title: 'RFC 6238, TOTP: Time-Based One-Time Password Algorithm', url: 'https://www.rfc-editor.org/rfc/rfc6238' }
	]
};
