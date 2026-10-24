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
		],
		steps: [
			{
				title: 'Représente-toi l’attaque',
				questions: [
					{ q: 'Que fait une page de phishing en temps réel de ce que tape la victime ?', options: ['Elle le stocke pour le revendre plus tard', 'Elle le compare à une liste de fuites', 'Elle affiche une erreur et redemande', 'Elle le transmet à l’attaquant en quelques secondes'], answer: 3, why: 'Chez Cloudflare, la page envoyait chaque identifiant, mot de passe et code à usage unique via Telegram dès qu’il était tapé.' },
					{ q: 'Combien de tentatives de connexion l’attaquant fait-il par victime ?', options: ['Des milliers, pour deviner le mot de passe', 'Une, juste après la saisie de la victime', 'Cinq, puis une pause d’une minute', 'Aucune : il vole le cookie de session'], answer: 1, why: 'Il a déjà le mot de passe et le code. Une tentative, en quelques secondes, suffit.' },
					{ q: 'D’où l’attaquant se connecte-t-il ?', options: ['Depuis sa propre machine', 'Depuis le portable de la victime', 'Depuis le réseau du bureau', 'Depuis le serveur DNS du domaine de phishing'], answer: 0, why: 'La page relaie les secrets, et l’attaquant les tape dans la vraie page de connexion depuis sa machine.' },
					{ q: 'Qu’est-ce qui rend deux contrôles faibles ensemble face à cette attaque ?', options: ['Ils tournent sur le même serveur', 'Ils viennent du même fournisseur', 'L’utilisateur tape les deux dans la page', 'Ils expirent tous deux après 30 secondes'], answer: 2, why: 'Le mot de passe et le code TOTP sont tous deux tapés dans la page : une seule fausse page bat les deux d’un coup.' }
				]
			},
			{
				title: 'Teste le mot de passe et le code',
				questions: [
					{ q: '(a) Le mot de passe : arrête-t-il l’attaque ?', options: ['Oui, s’il est long', 'Oui, s’il change tous les mois', 'Non : il est relayé dès la saisie', 'Oui, s’il est unique à ce site'], answer: 2, why: 'La page l’envoie à l’attaquant dès qu’il est tapé. Sa solidité n’y change rien.' },
					{ q: 'Quel pas de temps la RFC 6238 recommande-t-elle pour le TOTP ?', options: ['30 secondes', '5 minutes', '1 seconde', '24 heures'], answer: 0, why: '30 secondes, c’est large pour l’attaquant : la page relaie le code en quelques secondes.' },
					{ q: '(b) Le code TOTP : arrête-t-il l’attaque ?', options: ['Oui : le code change toutes les 30 secondes', 'Oui : le code est lié au téléphone', 'Seulement si l’appli demande une empreinte', 'Non : la page le relaie avant qu’il expire'], answer: 3, why: 'Cloudflare dit qu’un code relayé bat « most two-factor authentication implementations ».' },
					{ q: 'Un code TOTP dépend-il du site où il est tapé ?', options: ['Oui : il hache l’origine de la page', 'Non : le même code marche partout où il est relayé', 'Oui : il inclut l’IP de l’utilisateur', 'Seulement quand l’appli est en mode strict'], answer: 1, why: 'Rien du site n’entre dans le code. C’est le trou que bouche une clé de sécurité.' }
				]
			},
			{
				title: 'Teste la limite et le mail',
				questions: [
					{ q: '(c) 5 tentatives par minute et par IP : arrête-t-elle l’attaque ?', options: ['Non : une tentative par victime, c’est bien en dessous', 'Oui : l’IP de l’attaquant est bloquée', 'Oui : le phishing exige beaucoup de tentatives', 'Seulement pour la première victime'], answer: 0, why: 'L’attaquant a déjà le bon mot de passe et le bon code. Une tentative passe.' },
					{ q: '(d) Le mail de nouvel appareil : quand part-il ?', options: ['Avant la vérification du mot de passe', 'Quand la victime ouvre le lien de phishing', 'Quand le filtre DNS bloque le domaine', 'Une fois l’attaquant déjà connecté'], answer: 3, why: 'Il signale une connexion qui a déjà eu lieu. Il détecte ; il n’arrête pas.' },
					{ q: 'De quoi ce mail a-t-il besoin pour servir ?', options: ['D’un lien pour réinitialiser le secret TOTP', 'D’un utilisateur qui le lit et de quelqu’un qui réagit vite', 'D’une copie à l’équipe sécurité seulement', 'D’un pas de temps plus court que 30 secondes'], answer: 1, why: 'Il n’aide que si l’utilisateur le lit et que quelqu’un agit avant que l’attaquant fasse des dégâts.' },
					{ q: 'Combien des quatre contrôles arrêtent donc l’attaque ?', options: ['Quatre', 'Deux', 'Aucun', 'Un'], answer: 2, why: 'Le mot de passe et le code sont relayés, la limite voit une tentative, et le mail arrive après la connexion.' }
				]
			},
			{
				title: 'Choisis le changement',
				questions: [
					{ q: 'Quel contrôle a arrêté l’attaque chez Cloudflare ?', options: ['Une limite de débit plus stricte', 'Une clé FIDO2, exigée par chaque appli', 'Un pas TOTP plus court', 'Former le personnel à repérer les fausses pages'], answer: 1, why: 'Chaque employé avait une clé FIDO2, et chaque appli interne l’exigeait. Trois mots de passe ont fui et personne n’est entré.' },
					{ q: 'Pourquoi la page de phishing ne peut-elle pas relayer une signature de la clé ?', options: ['La clé ne signe qu’aux heures de bureau', 'La clé chiffre d’abord le mot de passe', 'Le navigateur écrit l’origine du phishing dans les données signées', 'La clé a besoin de l’IP de la victime'], answer: 2, why: 'L’origine est `https://cloudflare-okta.com`, et la clé n’a aucun identifiant pour ce site.' },
					{ q: 'Quel contrôle serveur refuse une réponse faite sur le mauvais site ?', options: ['`expected_challenge != client_data.challenge`', '`verify_signature(...)` tout seul', 'Un contrôle sur le user agent du navigateur', '`expected_origin != client_data.origin`'], answer: 3, why: 'Le navigateur remplit `origin` lui-même, donc une page de phishing ne peut pas y écrire la vraie. Une réponse relayée s’arrête à cette ligne.' },
					{ q: 'Tu ajoutes des clés de sécurité. Le mail de nouvel appareil vaut-il encore la peine ?', options: ['Oui : c’est une couche de plus si la clé cède', 'Non : une couche solide suffit', 'Non : il bloquerait la connexion par clé', 'Oui, mais seulement pour l’étape du mot de passe'], answer: 0, why: 'La défense en profondeur prévoit que chaque couche peut céder. Chez Cloudflare, la sécurité des postes attendait encore derrière la clé.' }
				]
			}
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
	lab: {
		minutes: 15,
		goal: 'Calcule toi-même des codes TOTP et vois pourquoi un code relayé quelques secondes plus tard ouvre encore la session.',
		steps: [
			'Crée un dossier : `mkdir -p ~/totp-lab && cd ~/totp-lab`. Enregistre cette ligne dans `totp.py`. Elle affiche le code RFC 6238 à 6 chiffres du secret de test de la RFC pour une heure Unix donnée : `import hmac,struct,sys; t=int(sys.argv[1])//30; h=hmac.new(b"12345678901234567890",struct.pack(">Q",t),"sha1").digest(); o=h[-1]&15; print("%06d"%((struct.unpack(">I",h[o:o+4])[0]&0x7fffffff)%1000000))`.',
			'Vérifie-le avec la valeur de test de la RFC : `python3 totp.py 59`.',
			'Joue la victime et le relais. `t0` est le début du pas de 30 secondes en cours : `t0=$(( $(date +%s) / 30 * 30 ))`, puis `python3 totp.py $t0` (la victime tape), `python3 totp.py $((t0+5))` (la page relaie 5 secondes plus tard) et `python3 totp.py $((t0+40))` (un code 40 secondes plus tard).',
			'Relis `totp.py` et liste tout ce qui entre dans `hmac.new`.'
		],
		done: [
			'`python3 totp.py 59` affiche `287082`, les 6 derniers chiffres de la valeur de test RFC 6238 `94287082`.',
			'Les codes de `t0` et `t0+5` sont identiques. Celui de `t0+40` est différent.',
			'Tu sais nommer les deux seules entrées : le secret partagé et le pas de temps.'
		],
		solution: [
			'Un code TOTP ne dépend que du secret partagé et de `time // 30`. Une page qui le relaie en quelques secondes donne à l’attaquant un code que le vrai serveur accepte encore.',
			'Rien dans les entrées ne nomme le site, donc le code marche partout où il est tapé. C’est pour ça que le mot de passe et le code tombent devant la même page de phishing.',
			'Une clé WebAuthn ajoute ce qui manque au TOTP : le navigateur écrit l’origine de la page dans les données signées, et le serveur la compare à `expected_origin`.'
		]
	},
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
