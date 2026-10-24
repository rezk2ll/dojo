const GO = 'https://github.com/golang/go/blob/c3a068eec992b5ae783abce1a9d03f617b671ea2/src/crypto';
const VERIFY = `${GO}/x509/verify.go`;
const CLIENT = `${GO}/tls/handshake_client.go`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'certificates',
	part: 'HTTP et TLS',
	title: 'Les chaînes de certificats',
	minutes: 10,
	hook: [
		'Tu lances `curl https://incomplete-chain.badssl.com/` et tu obtiens `curl: (60) SSL certificate problem: unable to get local issuer certificate`. Un petit client Go sur la même machine échoue aussi, avec `x509: certificate signed by unknown authority`.',
		'`openssl s_client -showcerts` montre la cause. Le serveur n’envoie qu’un certificat, `CN = *.badssl.com`, émis par `CN = YR1`. L’hôte `badssl.com` en envoie trois : la même feuille, puis `YR1`, puis `Root YR`. Ton client fait confiance à `ISRG Root X1` dans `/etc/ssl/certs`, mais il n’a aucune copie de `YR1` : il ne peut pas remonter de la feuille à une racine.',
		'La page peut pourtant s’ouvrir dans ton navigateur. La doc nginx l’explique : les navigateurs « usually store intermediate certificates which they receive » (ils gardent les intermédiaires reçus), donc un navigateur très utilisé « may not complain about a certificate sent without a chained bundle ».'
	],
	terms: [
		{ term: 'Certificat feuille', def: 'Le certificat du serveur lui-même, en tête de la liste qu’il envoie. Il porte les noms d’hôte et la clé publique du serveur.' },
		{ term: 'Certificat intermédiaire', def: 'Un certificat d’AC qui signe des feuilles et qui est lui-même signé par une racine ou un autre intermédiaire. C’est au serveur de l’envoyer.' },
		{ term: 'Magasin de confiance', def: 'Les certificats racines déjà présents sur le disque du client, par exemple les 122 certificats de `/etc/ssl/certs/ca-certificates.crt` sur la machine qui a servi à ce chapitre.' },
		{ term: 'SAN', def: 'Subject Alternative Name : la liste des noms DNS et des adresses IP pour lesquels un certificat est valide. Le client compare le nom d’hôte à cette liste.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['c["Client : curl https://badssl.com/"] -->|"ClientHello, SNI badssl.com"| s["Serveur badssl.com:443"]'],
				highlight: ['c', 's'],
				note: 'Le client met le nom d’hôte dans l’extension SNI de son ClientHello. Le serveur s’en sert pour choisir le certificat de `badssl.com`.'
			},
			{
				add: ['s -->|"Message Certificate"| list["0 : *.badssl.com, émetteur YR1<br/>1 : YR1, émetteur Root YR<br/>2 : Root YR, émetteur ISRG Root X1"]'],
				highlight: ['list'],
				note: 'RFC 8446 : « The sender\'s certificate MUST come in the first CertificateEntry in the list. Each following certificate SHOULD directly certify the one immediately preceding it. » Le certificat du serveur vient en premier, et chacun des suivants signe celui d’avant. La sortie de `openssl s_client -showcerts` pour `badssl.com` les donne dans cet ordre, numérotés de 0 à 2.'
			},
			{
				add: ['list --> leaf["Contrôle de la feuille : NotBefore, NotAfter, SAN"]'],
				highlight: ['leaf'],
				note: 'La feuille est valide du 29 septembre au 28 décembre 2026, soit 90 jours. Sa liste SAN est `DNS:*.badssl.com, DNS:badssl.com`, et l’hôte `badssl.com` correspond à la deuxième entrée. Si l’horloge a dépassé NotAfter, le contrôle s’arrête ici avec `certificate has expired`.'
			},
			{
				add: ['leaf -->|"signature vérifiée avec la clé publique de YR1"| mid["YR1, puis Root YR"]', 'mid -->|"signature vérifiée avec la clé publique de la racine"| root[("Magasin de confiance : ISRG Root X1")]'],
				highlight: ['mid', 'root'],
				note: 'Pour chaque certificat, le client cherche un parent dont le sujet est l’émetteur de l’enfant, puis vérifie la signature de l’enfant avec la clé publique du parent. La remontée s’arrête sur `ISRG Root X1`, que le serveur n’a jamais envoyé. RFC 8446 : un certificat qui désigne une ancre de confiance « MAY be omitted from the chain ». Go compte 4 certificats dans cette chaîne.'
			},
			{
				add: ['bad["incomplete-chain.badssl.com n’envoie que la feuille"] -.->|"aucun certificat de sujet YR1"| err["curl: (60) unable to get local issuer certificate"]'],
				highlight: ['bad', 'err'],
				note: 'Même feuille, mais pas de `YR1` derrière. Le magasin de confiance n’a aucun certificat de sujet `YR1`, donc la remontée s’arrête à la profondeur 0. openssl affiche `verify error:num=20:unable to get local issuer certificate`, et Go renvoie `x509: certificate signed by unknown authority`.'
			}
		]
	},
	example: {
		title: 'src/crypto/x509/verify.go : buildChains, de la feuille jusqu’à une racine',
		repo: 'golang/go',
		url: `${VERIFY}#L731-L812`,
		lang: 'go',
		code: `func (c *Certificate) buildChains(currentChain []*Certificate, sigChecks *int, opts *VerifyOptions) (chains [][]*Certificate, err error) {
…
	considerCandidate := func(certType int, candidate potentialParent) {
…
		if candidate.cert.PublicKey == nil || alreadyInChain(candidate.cert, currentChain) {
			return
		}

		if err := c.CheckSignatureFrom(candidate.cert); err != nil {
			if hintErr == nil {
				hintErr = err
				hintCert = candidate.cert
			}
			return
		}

		err = candidate.cert.isValid(certType, currentChain, opts)
		if err != nil {
			if hintErr == nil {
				hintErr = err
				hintCert = candidate.cert
			}
			return
		}
…
		switch certType {
		case rootCertificate:
			chains = append(chains, appendToFreshChain(currentChain, candidate.cert))
		case intermediateCertificate:
			var childChains [][]*Certificate
			childChains, err = candidate.cert.buildChains(appendToFreshChain(currentChain, candidate.cert), sigChecks, opts)
			chains = append(chains, childChains...)
		}
	}

candidateLoop:
	for _, parents := range []struct {
		certType   int
		potentials []potentialParent
	}{
		{rootCertificate, opts.Roots.findPotentialParents(c)},
		{intermediateCertificate, opts.Intermediates.findPotentialParents(c)},
	} {
		for _, parent := range parents.potentials {
			considerCandidate(parents.certType, parent)
			if err == errSignatureLimit {
				break candidateLoop
			}
		}
	}

	if len(chains) > 0 {
		err = nil
	}
	if len(chains) == 0 && err == nil {
		err = UnknownAuthorityError{c, hintErr, hintCert}
	}

	return
}`,
		notes: [
			'Les lignes 41 et 42 listent les parents possibles du certificat courant : d’abord dans `opts.Roots`, le magasin de confiance, puis dans `opts.Intermediates`. Dans [`crypto/tls`](' + CLIENT + '#L1153-L1164), le client remplit `Intermediates` avec `certs[1:]`, tous les certificats que le serveur a envoyés après la feuille.',
			'La ligne 9 vérifie la signature de l’enfant avec la clé publique du parent. La ligne 17 appelle `isValid`, qui écarte le parent si son sujet n’est pas l’émetteur de l’enfant, ou si l’heure courante tombe avant `NotBefore` ou après `NotAfter`.',
			'La ligne 28 ferme une chaîne quand le parent est une racine. La ligne 31 rappelle `buildChains` depuis un intermédiaire : chaque appel monte d’un niveau.',
			'La ligne 56 s’exécute quand aucun parent n’a marché. Son message est `x509: certificate signed by unknown authority`, exactement ce que le client Go a affiché pour `incomplete-chain.badssl.com`.',
			'Avant tout ça, [`Verify`](' + VERIFY + '#L590-L600) contrôle les dates de la feuille et appelle `VerifyHostname`, qui compare le nom d’hôte à la liste SAN. Un joker ne couvre qu’un label : Go refuse `wrong.host.badssl.com` avec `x509: certificate is valid for *.badssl.com, badssl.com, not wrong.host.badssl.com`.'
		]
	},
	tradeoff: {
		gain: [
			'Le client ne stocke que les racines : 122 fichiers sur la machine de test. Le serveur fournit les intermédiaires, donc une AC peut signer avec un nouvel intermédiaire comme `YR1` sans rien changer chez les clients.',
			'Un certificat contresigné permet aux vieux clients d’atteindre une racine plus ancienne. `badssl.com` envoie `Root YR` signé par `ISRG Root X1`, et Let’s Encrypt a utilisé une contresignature de `DST Root CA X3` « to make sure the certificates we issue are trusted on older devices ».',
			'Une seule feuille peut servir plusieurs noms : la liste SAN `*.badssl.com, badssl.com` couvre l’apex et chaque nom un label en dessous.'
		],
		cost: [
			'Un serveur qui oublie l’intermédiaire casse curl, Go et d’autres clients, alors qu’un navigateur qui a déjà l’intermédiaire en cache n’affiche aucune erreur. Si tu testes seulement dans un navigateur, tu ne vois pas le bug.',
			'Chaque certificat de la chaîne a son propre NotAfter. Avant l’expiration de `DST Root CA X3` le 30 septembre 2021, Let’s Encrypt prévenait que les appareils sans `ISRG Root X1` « will start getting certificate warnings ».',
			'Un joker couvre un seul label : `*.badssl.com` ne couvre pas `wrong.host.badssl.com`, et les noms plus profonds ont besoin de leur propre entrée SAN.'
		]
	},
	task: {
		prompt: 'Voici une vraie sortie de `openssl s_client -connect expired.badssl.com:443`, capturée pour ce chapitre. Le serveur a envoyé 3 certificats. 0 : `*.badssl.com`, NotAfter `Apr 12 23:59:59 2015 GMT`. 1 : `COMODO RSA Domain Validation Secure Server CA`, NotAfter `Feb 11 23:59:59 2029 GMT`. 2 : `COMODO RSA Certification Authority` émis par `AddTrust External CA Root`, NotAfter `May 30 10:48:38 2020 GMT`. Les lignes de vérification donnent `depth=2 ... CN = COMODO RSA Certification Authority`, puis `depth=1 ... Domain Validation Secure Server CA`, puis `depth=0 ... *.badssl.com` avec `verify error:num=10:certificate has expired`. Deux certificats ont expiré. Lequel fait échouer la vérification, et pourquoi l’autre ne gêne pas ?',
		hint: 'Les lignes `depth=` montrent la chaîne qu’openssl a construite. Elle peut différer de la liste envoyée par le serveur. D’où vient le certificat de profondeur 2 ?',
		answer: [
			'C’est la feuille, en position 0 : son NotAfter est le 12 avril 2015 à 23:59:59, et openssl signale `num=10:certificate has expired` à `depth=0`. Il faut un nouveau certificat feuille.',
			'Le certificat 2 a expiré le 30 mai 2020, mais openssl ne s’en est pas servi. À `depth=2`, openssl a pris le `COMODO RSA Certification Authority` autosigné de `/etc/ssl/certs/COMODO_RSA_Certification_Authority.pem`, valide jusqu’au 18 janvier 2038.',
			'Le serveur a envoyé une copie de `COMODO RSA Certification Authority` signée par `AddTrust External CA Root`. Le client a trouvé une racine de même sujet dans son magasin de confiance et s’est arrêté là : la contresignature expirée n’est jamais entrée dans la chaîne.'
		],
		steps: [
			{
				title: 'Lis ce que le serveur a envoyé',
				questions: [
					{ q: 'Quel certificat de la liste du serveur est la feuille ?', options: ['Le certificat 0, `*.badssl.com`', 'Le certificat 2, `COMODO RSA Certification Authority`', 'Le certificat 1, l’AC Domain Validation', '`AddTrust External CA Root`, le dernier émetteur cité'], answer: 0, why: 'La RFC 8446 impose que le certificat de l’expéditeur arrive en premier. La position 0 est celle qui porte les noms d’hôte.' },
					{ q: 'Qu’est-ce que le certificat 1, `COMODO RSA Domain Validation Secure Server CA` ?', options: ['Une racine que le client a déjà sur disque', 'Un intermédiaire entre la feuille et une racine', 'Une deuxième feuille pour un autre nom d’hôte', 'Une copie de la feuille avec des dates plus récentes'], answer: 1, why: 'Chaque certificat suivant devrait certifier celui d’avant. Le certificat 1 est l’AC qui a signé la feuille, et le serveur doit l’envoyer.' },
					{ q: 'Quels deux certificats de la liste ont un NotAfter dans le passé ?', options: ['0 et 1', '1 et 2', '0 et 2', 'Seulement 2'], answer: 2, why: 'Le certificat 0 a pris fin le 12 avril 2015 et le certificat 2 le 30 mai 2020. Le certificat 1 est valide jusqu’au 11 février 2029.' },
					{ q: 'Le certificat 2 est `COMODO RSA Certification Authority` émis par `AddTrust External CA Root`. Qu’est-ce que c’est ?', options: ['Une copie contresignée d’un certificat d’AC', 'Une racine autosignée du magasin de confiance', 'Une feuille pour l’hôte `addtrust.com`', 'Un second intermédiaire dont la feuille a besoin'], answer: 0, why: 'Le même sujet existe en racine autosignée. Cette copie est signée par une racine plus ancienne : c’est une contresignature.' }
				]
			},
			{
				title: 'Lis la chaîne construite par openssl',
				questions: [
					{ q: 'Que montrent les lignes `depth=` ?', options: ['L’ordre dans lequel le serveur a envoyé les certificats', 'La chaîne qu’openssl a construite, de la feuille en profondeur 0 vers le haut', 'Le nombre d’enregistrements TLS de chaque certificat', 'Les certificats que le client a téléchargés chez l’AC'], answer: 1, why: 'Les lignes `depth=` sont la chaîne construite par le client. Elle peut différer de la liste envoyée par le serveur.' },
					{ q: 'À `depth=2`, d’où vient `COMODO RSA Certification Authority` ?', options: ['Du certificat 2 de la liste du serveur', 'D’un téléchargement chez l’AC pendant la poignée de main', 'Du magasin de confiance, `/etc/ssl/certs/COMODO_RSA_Certification_Authority.pem`', 'D’un cache d’intermédiaires vus lors de visites précédentes'], answer: 2, why: 'openssl a pris la copie autosignée sur disque, valide jusqu’au 18 janvier 2038, et pas celle envoyée par le serveur.' },
					{ q: 'Comment un client choisit-il le parent d’un certificat ?', options: ['Il prend le certificat suivant de la liste, quel qu’il soit', 'Il cherche celui dont le sujet égale l’émetteur de l’enfant, puis vérifie la signature', 'Il prend le candidat au NotAfter le plus lointain', 'Il compare le nom d’hôte au SAN de chaque candidat'], answer: 1, why: 'Le sujet du parent doit égaler l’émetteur de l’enfant, et la clé publique du parent doit vérifier la signature de l’enfant.' },
					{ q: 'Quelle copie de `COMODO RSA Certification Authority` se trouve dans le magasin de confiance ?', options: ['Une copie autosignée, valide jusqu’au 18 janvier 2038', 'Une copie signée par AddTrust, valide jusqu’au 30 mai 2020', 'Une copie signée par l’AC Domain Validation', 'Une copie sans signature, car les racines n’en ont pas'], answer: 0, why: 'Le magasin de confiance contient des racines, et une racine se signe elle-même. La copie signée par AddTrust vient du serveur.' }
				]
			},
			{
				title: 'Trouve ce qui casse',
				questions: [
					{ q: 'À quelle profondeur openssl signale-t-il `num=10:certificate has expired` ?', options: ['`depth=2`', '`depth=1`', '`depth=0`', 'À toutes les profondeurs'], answer: 2, why: 'La ligne d’erreur suit `depth=0 ... *.badssl.com`, la feuille.' },
					{ q: 'Quel certificat fait donc échouer la vérification ?', options: ['Le certificat 2, la contresignature expirée', 'La feuille `*.badssl.com`, expirée depuis le 12 avril 2015', 'Le certificat 1, l’intermédiaire', '`AddTrust External CA Root`, le plus ancien'], answer: 1, why: 'La seule erreur d’expiration est à la profondeur 0. Le NotAfter de la feuille est le 12 avril 2015 à 23:59:59.' },
					{ q: 'Quelle vérification rejette un certificat expiré ?', options: ['La comparaison du nom d’hôte avec la liste SAN', 'La vérification de signature avec la clé publique du parent', 'La comparaison de NotBefore et NotAfter avec l’heure actuelle', 'Le contrôle SNI que fait le serveur sur le ClientHello'], answer: 2, why: 'Une horloge au-delà de NotAfter fait échouer le contrôle des dates. La signature et le SAN peuvent être bons, le certificat échoue quand même.' },
					{ q: 'Qu’est-ce qui corrige l’erreur ?', options: ['Un nouveau certificat feuille', 'Retirer le certificat 2 de la liste du serveur', 'Ajouter `AddTrust External CA Root` au magasin de confiance', 'Désactiver le SNI dans le client'], answer: 0, why: 'C’est la feuille elle-même qui a expiré. Rien d’autre dans la chaîne ne peut rendre valide une feuille expirée.' }
				]
			},
			{
				title: 'Explique pourquoi l’autre ne gêne pas',
				questions: [
					{ q: 'Le certificat 2 est-il entré dans la chaîne construite par openssl ?', options: ['Oui, à la profondeur 2', 'Oui, à la profondeur 3, au-dessus de la racine', 'Non : la remontée s’est arrêtée à une racine de même sujet', 'Non : openssl ne lit que les deux premiers certificats'], answer: 2, why: 'Le client a trouvé `COMODO RSA Certification Authority` comme racine dans son magasin de confiance, il n’a donc jamais eu besoin de la copie du serveur.' },
					{ q: 'Pourquoi la remontée s’arrête-t-elle à `COMODO RSA Certification Authority` ?', options: ['C’est une racine du magasin de confiance, donc la chaîne est close', 'Une chaîne contient au plus trois certificats', 'openssl ne connaît pas `AddTrust External CA Root`', 'Le serveur l’a marqué comme dernier certificat'], answer: 0, why: 'Une chaîne s’arrête quand le parent est une racine de confiance. Le `buildChains` de Go fait pareil : il clôt la chaîne quand le candidat est une racine.' },
					{ q: 'Le serveur n’envoie plus le certificat 2. Le résultat change-t-il pour ce client ?', options: ['Oui, la vérification passe', 'Non : le client ne s’en servait pas, et la feuille est toujours expirée', 'Oui, la vérification échoue maintenant à la profondeur 1', 'Non, mais l’intermédiaire est désormais rejeté'], answer: 1, why: 'Le certificat 2 n’était pas dans la chaîne construite, le retirer ne change rien. La feuille échoue toujours.' },
					{ q: 'Quelle phrase résume la tâche ?', options: ['Deux certificats expirés, donc deux corrections distinctes', 'Un certificat expiré n’importe où dans la liste du serveur fait échouer la poignée de main', 'L’expiration n’est vérifiée que sur la feuille, jamais sur les certificats d’AC', 'Seule la chaîne construite par le client est vérifiée, et la feuille y est expirée'], answer: 3, why: 'Le client vérifie les certificats de la chaîne qu’il a construite. La contresignature expirée a été envoyée mais jamais utilisée.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'curl affiche `unable to get local issuer certificate` pour ton API. Chrome, sur ton portable, ouvre la même URL sans avertissement. Quelle est la cause la plus probable ?',
			options: [
				'Le serveur envoie la feuille sans le certificat intermédiaire',
				'La liste SAN du certificat ne contient pas le nom d’hôte de l’API',
				'La feuille a expiré, et Chrome ne vérifie pas les dates',
				'curl ne gère pas la poignée de main TLS 1.3 du serveur'
			],
			answer: 0,
			why: 'Le client doit relier la feuille à une racine de son magasin de confiance. Sans l’intermédiaire, il ne trouve aucun certificat dont le sujet est l’émetteur de la feuille. La doc nginx note que les navigateurs gardent les intermédiaires déjà vus, donc ils peuvent ne rien signaler.'
		},
		{
			q: 'Un certificat a la liste SAN `*.badssl.com, badssl.com`. Quel nom d’hôte `VerifyHostname` de Go accepte-t-il ?',
			options: [
				'`wrong.host.badssl.com`, car le joker couvre autant de labels qu’il faut',
				'`www.badssl.com`, car le joker remplace exactement un label',
				'`badssl.com.example.org`, car le nom commence par `badssl.com`',
				'Aucun, car Go ne compare que le Common Name du sujet'
			],
			answer: 1,
			why: '`matchHostnames` découpe le motif et l’hôte en labels et exige le même nombre. Seul le premier label peut valoir `*`. `wrong.host.badssl.com` a 4 labels contre 3 dans le motif, donc Go le refuse.'
		},
		{
			q: 'Le serveur `badssl.com` envoie trois certificats. Pourquoi `ISRG Root X1`, en haut de la chaîne, n’en fait pas partie ?',
			options: [
				'La racine est trop grosse pour tenir dans un seul enregistrement TLS',
				'Le client télécharge la racine auprès de l’AC pendant la poignée de main',
				'Le client l’a déjà, et RFC 8446 permet au serveur de l’omettre',
				'Les racines ne sont envoyées que sur les connexions HTTP/2'
			],
			answer: 2,
			why: 'Une racine n’est fiable que parce qu’elle est déjà dans le magasin de confiance du client. RFC 8446 dit qu’un certificat qui désigne une ancre de confiance « MAY be omitted from the chain ». `buildChains` de Go cherche les racines dans `opts.Roots`, le pool local.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Construire une chaîne à trois niveaux sur ton portable, la servir sans puis avec l’intermédiaire, et voir le client échouer puis réussir.',
		steps: [
			'Crée un dossier et une CA racine. Il te faut OpenSSL 3 (sur macOS, `brew install openssl`) : `mkdir -p ~/chain-lab && cd ~/chain-lab`, puis `openssl req -x509 -newkey rsa:2048 -nodes -keyout root.key -out root.pem -days 30 -subj "/CN=Lab Root"`.',
			'Crée l’intermédiaire et signe-le avec la racine : `openssl req -newkey rsa:2048 -nodes -keyout mid.key -out mid.csr -subj "/CN=Lab Intermediate"`, puis `printf "basicConstraints=critical,CA:TRUE\\nkeyUsage=critical,keyCertSign\\n" > ca.ext`, puis `openssl x509 -req -in mid.csr -CA root.pem -CAkey root.key -CAcreateserial -out mid.pem -days 30 -extfile ca.ext`.',
			'Crée la feuille pour `localhost` et signe-la avec l’intermédiaire : `openssl req -newkey rsa:2048 -nodes -keyout leaf.key -out leaf.csr -subj "/CN=localhost"`, puis `printf "subjectAltName=DNS:localhost\\n" > leaf.ext`, puis `openssl x509 -req -in leaf.csr -CA mid.pem -CAkey mid.key -CAcreateserial -out leaf.pem -days 30 -extfile leaf.ext`.',
			'Sers la feuille seule : `openssl s_server -accept 8443 -cert leaf.pem -key leaf.key -www -quiet`. Dans un second terminal, dans le même dossier, lance `curl --cacert root.pem https://localhost:8443/` et `openssl s_client -connect localhost:8443 -CAfile root.pem </dev/null 2>&1 | grep -E "depth|verify error|Verify return"`.',
			'Arrête le serveur avec Ctrl+C et relance-le avec l’intermédiaire : ajoute `-cert_chain mid.pem` à la même commande. Relance les deux commandes client, puis `curl --cacert root.pem https://127.0.0.1:8443/`.'
		],
		done: [
			'Avec la feuille seule, curl échoue avec `(60) SSL certificate problem: unable to get local issuer certificate`, et s_client affiche `verify error:num=20` à `depth=0`.',
			'Avec `-cert_chain mid.pem`, s_client affiche `depth=2 CN = Lab Root`, `depth=1 CN = Lab Intermediate`, `depth=0 CN = localhost` et `Verify return code: 0 (ok)`, et curl affiche la page de s_server.',
			'`curl --cacert root.pem https://127.0.0.1:8443/` échoue avec `no alternative certificate subject name matches target host name \'127.0.0.1\'`.'
		],
		solution: [
			'Dans ce lab, le magasin de confiance se limite à `root.pem`. Avec la feuille seule, le client n’a aucun certificat de sujet `Lab Intermediate`, donc la remontée s’arrête à la profondeur 0.',
			'`-cert_chain mid.pem` fait envoyer l’intermédiaire après la feuille. Dans nginx, la même correction est un fichier `ssl_certificate` construit avec `cat leaf.pem mid.pem > chained.pem`.',
			'La liste SAN de la feuille ne contient que `DNS:localhost`. Le client compare le nom qu’il a appelé à cette liste, donc `127.0.0.1` échoue même avec une chaîne complète.'
		]
	},
	recall: {
		q: 'curl affiche `unable to get local issuer certificate`. Que manque-t-il au client, et que doit contenir le fichier pointé par `ssl_certificate` dans nginx ?',
		a: 'Le client ne trouve pas l’émetteur de la feuille, en général un intermédiaire que le serveur n’a pas envoyé. Le fichier doit contenir la feuille d’abord, puis les intermédiaires : `cat www.example.com.crt bundle.crt > www.example.com.chained.crt`.'
	},
	sources: [
		{ title: 'RFC 5280, profil des certificats X.509 et des CRL (section 6.1, validation de chemin)', url: 'https://www.rfc-editor.org/rfc/rfc5280' },
		{ title: 'RFC 8446, TLS 1.3, section 4.4.2 Certificate', url: 'https://www.rfc-editor.org/rfc/rfc8446#section-4.4.2' },
		{ title: 'Doc nginx, Configuring HTTPS servers : SSL certificate chains', url: 'https://nginx.org/en/docs/http/configuring_https_servers.html' },
		{ title: 'Source Go, src/crypto/x509/verify.go', url: VERIFY },
		{ title: 'Let’s Encrypt, DST Root CA X3 Expiration (September 2021)', url: 'https://letsencrypt.org/docs/dst-root-ca-x3-expiration-september-2021/' },
		{ title: 'badssl.com, hôtes de test aux certificats cassés', url: 'https://badssl.com/' }
	]
};
