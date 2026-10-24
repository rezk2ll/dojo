const COSIGN = 'https://github.com/sigstore/cosign/blob/cfeaa4a435c9d42cf724b3e1aac20c1cc09c4be7';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'signing',
	part: 'Les secrets et la chaîne d’approvisionnement',
	title: 'Signer ce que tu livres',
	minutes: 10,
	hook: [
		'Le 1er avril 2021, un client de Codecov télécharge le script Bash Uploader depuis `https://codecov.io/bash` et calcule son SHA-256. La valeur ne correspond pas à la somme de contrôle que Codecov publie sur GitHub. Le client le signale le matin même.',
		'Codecov découvre que quelqu’un modifie le script depuis le 31 janvier 2021. L’attaquant avait récupéré un identifiant grâce à « an error in Codecov’s Docker image creation process » (une erreur dans la construction de leur image Docker). La ligne ajoutée envoyait la sortie de `env` de chaque job de CI, avec ses tokens et ses clés, vers un serveur hors de Codecov.',
		'Le client l’a vu parce que la somme de contrôle était sur GitHub et le script sur `codecov.io`. L’attaquant ne pouvait changer qu’un des deux. Une **signature** va plus loin : elle lie le fichier à l’identité qui l’a signé, et un fichier modifié échoue à la vérification.',
		'Ici, tu signes une image de conteneur avec cosign sans garder de clé privée, puis tu la vérifies avant de la lancer.'
	],
	terms: [
		{ term: 'Signature keyless', def: 'cosign crée une paire de clés, signe une fois et jette la clé privée. Un certificat de courte durée garde la trace de qui tenait la clé.' },
		{ term: 'Fulcio', def: 'L’autorité de certification de Sigstore. Elle vérifie un token OpenID Connect et émet un certificat X.509 valable 10 minutes, qui contient l’identité du token.' },
		{ term: 'Rekor', def: 'Le journal de transparence de Sigstore : un journal public en ajout seul, avec chaque signature, son certificat et le digest du fichier signé.' },
		{ term: 'Identité du signataire', def: 'La paire que `cosign verify` contrôle dans le certificat : le sujet (un email ou l’URL d’un workflow) et l’émetteur OIDC qui s’en porte garant.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['atk["Attaquant avec un identifiant d’upload volé"] -->|"remplace le fichier"| srv["Serveur de téléchargement ou registry : codecov.io/bash, ghcr.io"]', 'srv --> ci["CI du client : curl du script, puis exécution"]'],
				highlight: ['atk', 'srv'],
				note: 'Le chemin de l’attaque. L’attaquant modifie le fichier à l’endroit où les gens le téléchargent. Chaque job de CI qui lance `curl` puis `bash` exécute la nouvelle version, avec ses secrets dans l’environnement.'
			},
			{
				add: ['rel["Workflow de release dans GitHub Actions"] -->|"token OIDC"| ful["Fulcio : certificat valable 10 min, sujet = URL du workflow"]'],
				highlight: ['rel', 'ful'],
				note: 'La défense commence à la release. Le workflow lance `cosign sign` avec `id-token: write`. cosign envoie une nouvelle clé publique et le token OIDC du workflow à Fulcio, qui renvoie un certificat au nom de ce workflow.'
			},
			{
				add: ['ful --> sig["Signature du digest de l’image, clé privée jetée"]', 'sig --> rek[("Rekor : signature, certificat, digest")]'],
				highlight: ['sig', 'rek'],
				note: 'cosign signe le digest de l’image, attache la signature à l’image dans la registry et l’inscrit dans Rekor. La clé privée disparaît après cette signature : aucun fichier de clé n’attend un voleur.'
			},
			{
				add: ['srv -.->|"pull"| ver["cosign verify --certificate-identity ... --certificate-oidc-issuer ..."]', 'rek -.-> ver'],
				highlight: ['ver'],
				note: 'Avant de lancer l’image, tu passes `cosign verify` avec l’identité et l’émetteur attendus. cosign contrôle la signature contre le digest, la chaîne du certificat contre la racine Sigstore, l’identité, puis l’entrée Rekor.'
			},
			{
				add: ['ver -->|"digest ou identité différents"| stop["Erreur de vérification : pas de déploiement"]'],
				highlight: ['stop'],
				note: 'Une image remplacée a un nouveau digest, donc l’ancienne signature ne colle plus. Si l’attaquant la signe avec son propre compte, le certificat porte la mauvaise identité et le contrôle d’identité échoue.'
			}
		]
	},
	example: {
		title: 'pkg/cosign/verify.go : CheckCertificatePolicy compare l’identité du signataire',
		repo: 'sigstore/cosign',
		url: `${COSIGN}/pkg/cosign/verify.go#L467-L532`,
		lang: 'go',
		code: `func CheckCertificatePolicy(cert *x509.Certificate, co *CheckOpts) error {
	ce := CertExtensions{Cert: cert}

	if err := validateCertExtensions(ce, co); err != nil {
		return err
	}
	oidcIssuer := ce.GetIssuer()
	sans := cryptoutils.GetSubjectAlternateNames(cert)
…
			// Then the subject
			subjectMatches := false
			switch {
			case identity.SubjectRegExp != "":
				regex, err := regexp.Compile(identity.SubjectRegExp)
				if err != nil {
					return fmt.Errorf("malformed subject in identity: %s : %w", identity.SubjectRegExp, err)
				}
				for _, san := range sans {
					if regex.MatchString(san) {
						subjectMatches = true
						break
					}
				}
			case identity.Subject != "":
				for _, san := range sans {
					if san == identity.Subject {
						subjectMatches = true
						break
					}
				}
			default:
				// No subject constraint on this identity, so checks out
				subjectMatches = true
			}
			if subjectMatches && issuerMatches {
				// If both issuer / subject match, return verified
				return nil
			}
		}
		return &VerificationFailure{
			fmt.Errorf("none of the expected identities matched what was in the certificate, got subjects [%s] with issuer %s", strings.Join(sans, ", "), oidcIssuer),
		}
	}
	return nil
}`,
		notes: [
			'La ligne 473 lit l’émetteur OIDC dans l’extension `1.3.6.1.4.1.57264.1.1` du certificat. La ligne 474 lit le subject alternative name (SAN), que Fulcio remplit avec un email ou une URI.',
			'Les lignes 511 à 517 traitent `--certificate-identity` : un SAN doit être égal à la chaîne, caractère pour caractère. `https://github.com/acme/api/.github/workflows/release.yml@refs/heads/main` ne correspond qu’à ce workflow, sur cette branche.',
			'Les lignes 500 à 510 traitent `--certificate-identity-regexp` avec `MatchString` de Go. Sa doc : « MatchString reports whether the string s contains any match ». Un motif sans ancre peut tomber n’importe où dans le SAN.',
			'La ligne 522 ne valide que si le sujet et l’émetteur correspondent tous les deux. L’aide des options dans `options/certificate.go` exige un flag d’identité et un flag d’émetteur : « must be set for keyless flows ».'
		]
	},
	tradeoff: {
		gain: [
			'Aucun fichier de clé à faire fuiter ni à renouveler. La doc Sigstore : « the private key is discarded after a single signing ».',
			'Un projet peut surveiller Rekor pour sa propre identité et repérer une signature qu’il n’a pas faite.',
			'Le projet Kubernetes signe ainsi ses images de release, et n’importe qui les vérifie avec une seule commande `cosign verify`.'
		],
		cost: [
			'Tu dois connaître l’identité du signataire à l’avance. La doc Sigstore demande aux mainteneurs de la publier à un endroit que seules des personnes de confiance peuvent modifier.',
			'Si quelqu’un pousse du code sur la branche que ton workflow de release construit, le workflow signe ce code avec l’identité attendue.',
			'N’importe qui peut lire l’email ou l’URL de workflow de chaque certificat, puisque le journal Rekor est public.'
		]
	},
	task: {
		prompt: 'Ton script de déploiement lance ceci avant chaque mise en production : `cosign verify ghcr.io/acme/api@sha256:4f1c... --certificate-identity-regexp \'github.com/acme\' --certificate-oidc-issuer https://token.actions.githubusercontent.com`. L’image est construite par `.github/workflows/release.yml` dans `acme/api`, sur les tags. Trouve le trou et écris la commande corrigée.',
		hint: 'Les certificats GitHub Actions portent un SAN de la forme `https://github.com/OWNER/REPO/.github/workflows/FILE@REF`. Quels SAN contiennent le texte `github.com/acme` ?',
		answer: [
			'`MatchString` valide dès que le SAN contient le motif, à n’importe quelle position. `https://github.com/acme-tools/x/.github/workflows/a.yml@refs/heads/main` contient `github.com/acme`.',
			'Imagine un attaquant qui obtient le droit de pousser sur `ghcr.io/acme/api`. Il crée une organisation GitHub `acme-tools` et signe son image depuis un workflow de cette organisation. L’émetteur est bien celui de GitHub, donc ce contrôle passe aussi.',
			'N’importe quel workflow de n’importe quel dépôt `acme` passe aussi, par exemple un workflow de tests dans un autre dépôt qui ne construit jamais de release.',
			'Corrigé : `--certificate-identity-regexp \'^https://github\\.com/acme/api/\\.github/workflows/release\\.yml@refs/tags/v[0-9.]+$\'`. `^` et `$` ancrent le SAN entier, et les points échappés ne correspondent qu’à des points.'
		],
		steps: [
			{
				title: 'Lis ce que la commande vérifie',
				questions: [
					{ q: 'Quelles deux parties du certificat ce `cosign verify` compare-t-il à ce que tu attends ?', options: ['Le sujet (SAN) et l’émetteur OIDC', 'Le tag de l’image et le nom de la registry', 'Le fichier de clé privée et son mot de passe', 'L’index Rekor et l’heure du build'], answer: 0, why: 'Cette paire, c’est l’identité du signataire. L’aide des flags dit qu’un flag d’identité et un flag d’émetteur « must be set for keyless flows ».' },
					{ q: 'À quoi ressemble le SAN d’un certificat émis pour un workflow GitHub Actions ?', options: ['L’email de la personne qui a poussé le tag', '`https://github.com/OWNER/REPO/.github/workflows/FILE@REF`', 'Le SHA-256 de l’image signée', 'Le nom de l’organisation GitHub, rien de plus'], answer: 1, why: 'Fulcio remplit le SAN avec l’URL du workflow : le dépôt, le fichier du workflow et la ref.' },
					{ q: 'Que prouve `--certificate-oidc-issuer https://token.actions.githubusercontent.com` à lui seul ?', options: ['Que l’image vient de `acme/api`', 'Qu’un workflow GitHub Actions, n’importe lequel, a obtenu le certificat', 'Que le workflow de release a tourné sur un tag', 'Que personne n’a modifié l’image après le build'], answer: 1, why: 'Tous les workflows de GitHub reçoivent leur token de cet émetteur, y compris celui d’un attaquant. Le sujet doit faire le reste.' },
					{ q: 'Quand `CheckCertificatePolicy` renvoie-t-il « vérifié » ?', options: ['Quand le sujet correspond, quel que soit l’émetteur', 'Quand l’émetteur correspond, quel que soit le sujet', 'Quand le sujet et l’émetteur correspondent tous les deux', 'Quand le certificat est encore dans ses 10 minutes'], answer: 2, why: 'La ligne 522 ne renvoie `nil` que si `subjectMatches && issuerMatches`.' }
				]
			},
			{
				title: 'Teste le motif',
				questions: [
					{ q: 'Comment `MatchString` en Go traite-t-il le motif `github.com/acme` ?', options: ['Il doit être égal au SAN entier', 'Il doit correspondre au début du SAN', 'Il valide si le SAN contient une correspondance n’importe où', 'Il ne regarde que la partie hôte de l’URL'], answer: 2, why: 'La doc Go : « MatchString reports whether the string s contains any match ». Rien n’attache le motif au début ou à la fin.' },
					{ q: '`https://github.com/acme-tools/x/.github/workflows/a.yml@refs/heads/main` passe-t-il le motif ?', options: ['Oui : le SAN contient `github.com/acme`', 'Non : l’organisation est `acme-tools`, pas `acme`', 'Non : la ref est une branche, pas un tag', 'Seulement si son émetteur est différent'], answer: 0, why: '`github.com/acme` est le début de `github.com/acme-tools`, et une correspondance n’importe où suffit.' },
					{ q: 'Que reconnaît le `.` non échappé de `github.com` ?', options: ['Seulement un point', 'N’importe quel caractère', 'Rien, les points sont ignorés', 'Un point ou plus'], answer: 1, why: 'Dans une regexp, un point nu reconnaît n’importe quel caractère. Le motif corrigé échappe chacun en `\\.` pour ne reconnaître que des points.' },
					{ q: 'Un workflow de tests dans un autre dépôt `acme` signe une image. Passe-t-il ?', options: ['Non : seuls les workflows de release peuvent signer', 'Non : le contrôle de l’émetteur l’arrête', 'Oui : son SAN contient aussi `github.com/acme`', 'Oui, mais seulement s’il tourne sur un tag'], answer: 2, why: 'N’importe quel workflow de n’importe quel dépôt `acme` a un SAN qui contient le motif, même s’il ne construit jamais de release.' }
				]
			},
			{
				title: 'Imagine l’attaque',
				questions: [
					{ q: 'Dans le scénario du chapitre, de quoi l’attaquant a-t-il besoin d’abord ?', options: ['Du droit de pousser sur `ghcr.io/acme/api`', 'De la clé privée utilisée par cosign à la release', 'Du droit d’écrire dans le journal Rekor', 'De droits d’admin sur Fulcio'], answer: 0, why: 'Il doit mettre son image là où tu la tires. Il n’y a pas de clé de release à voler : elle a été jetée après une signature.' },
					{ q: 'Comment obtient-il ensuite une signature qui passe ton contrôle ?', options: ['Il copie l’ancienne signature sur la nouvelle image', 'Il crée une organisation `acme-tools` et signe depuis un workflow de celle-ci', 'Il demande à Fulcio un certificat qui nomme `acme/api`', 'Il supprime l’entrée Rekor de la vraie release'], answer: 1, why: 'Fulcio signe pour l’identité que le token prouve. `acme-tools` est une vraie identité, et elle contient ton motif.' },
					{ q: 'Pourquoi copier la vraie signature sur la nouvelle image échouerait-il ?', options: ['Rekor n’accepte qu’une signature par tag', 'La registry bloque les signatures copiées', 'La signature couvre l’ancien digest, et la nouvelle image en a un nouveau', 'cosign ne fait confiance qu’aux signatures de moins de 10 minutes'], answer: 2, why: 'cosign vérifie la signature contre le digest de l’image. Une image remplacée a un nouveau digest, donc l’ancienne signature ne correspond plus.' },
					{ q: 'Pourquoi le contrôle de l’émetteur ne sert-il à rien contre `acme-tools` ?', options: ['cosign ignore l’émetteur quand une regexp est donnée', 'Le flag d’émetteur ne vérifie que le domaine de l’email', 'Chaque organisation GitHub a sa propre URL d’émetteur', 'Son workflow obtient son certificat par le même émetteur GitHub'], answer: 3, why: 'L’émetteur est le vrai émetteur GitHub pour tous les workflows. Seul le sujet distingue `acme/api` de `acme-tools`.' }
				]
			},
			{
				title: 'Écris la correction',
				questions: [
					{ q: 'Quelle valeur de `--certificate-identity-regexp` bouche le trou ?', options: ['`\'github\\.com/acme/api\'`', '`\'^https://github.com/acme\'`', '`\'release\\.yml@refs/tags/v[0-9.]+$\'`', '`\'^https://github\\.com/acme/api/\\.github/workflows/release\\.yml@refs/tags/v[0-9.]+$\'`'], answer: 3, why: 'Il est ancré aux deux bouts, échappe chaque point, et nomme le seul dépôt, le seul workflow et le seul type de ref qui construisent les releases.' },
					{ q: 'Que font `^` et `$` dans le motif corrigé ?', options: ['Ils échappent les points', 'Ils attachent le motif au SAN entier', 'Ils rendent la correspondance insensible à la casse', 'Ils acceptent n’importe quel nom de tag'], answer: 1, why: 'Avec les deux ancres, le SAN doit correspondre de son premier caractère au dernier, donc aucune chaîne plus longue ne passe autour.' },
					{ q: 'Pourquoi terminer le motif par `@refs/tags/v[0-9.]+` ?', options: ['cosign rejette les SAN sans version', 'GitHub signe les tags mais pas les branches', 'L’image est construite sur les tags, donc un build de branche ne doit pas passer', 'La regexp s’exécute plus vite'], answer: 2, why: 'Le workflow de release tourne sur les tags. Le même fichier lancé sur une branche n’est pas une release et doit échouer.' },
					{ q: 'Après la correction, `https://github.com/acme-tools/x/.github/workflows/a.yml@refs/heads/main` passe-t-il encore ?', options: ['Non : il ne commence pas par `https://github.com/acme/api/`', 'Oui : il contient toujours `github.com/acme`', 'Oui : son émetteur est l’émetteur GitHub', 'Non, mais d’autres organisations avec `acme` dans le nom passent'], answer: 0, why: 'Le motif ancré fixe le dépôt juste après `https://github.com/`, donc `acme-tools` échoue au premier caractère qui diffère.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Le certificat Fulcio d’une signature d’image était valable 10 minutes en mars. Pourquoi `cosign verify` l’accepte-t-il encore en octobre ?',
			options: [
				'cosign ignore la date d’expiration du certificat pour toute signature d’image',
				'L’entrée Rekor montre que la signature date d’un moment où le certificat était valable',
				'Fulcio renouvelle le certificat toutes les 10 minutes tant que l’image existe',
				'La registry signe à nouveau l’image avec sa propre clé à chaque pull'
			],
			answer: 1,
			why: 'Rekor a enregistré la signature et son certificat au moment de la signature, et cosign vérifie la preuve d’inclusion. La doc Sigstore : grâce au journal, on peut « confirm that the certificate was valid at the time of signing ».'
		},
		{
			q: 'Un attaquant remplace ton image dans la registry et la signe avec cosign depuis son propre compte GitHub. Ton déploiement lance `cosign verify` avec ton identité exacte et ton émetteur. Que se passe-t-il ?',
			options: [
				'Ça passe, car la nouvelle image a une signature Fulcio valide dans Rekor',
				'Ça passe, car la registry garde les deux signatures et cosign prend la plus récente',
				'Ça échoue, car Rekor refuse une deuxième signature pour le même tag',
				'Ça échoue, car aucun certificat sur le nouveau digest n’a ton identité en SAN'
			],
			answer: 3,
			why: 'La signature de l’attaquant est valide, mais `CheckCertificatePolicy` compare le SAN à ta chaîne `--certificate-identity`. Son certificat porte son compte à lui, donc cosign renvoie « none of the expected identities matched ».'
		},
		{
			q: 'Pourquoi un signataire keyless n’a-t-il aucune clé privée à renouveler après une fuite ?',
			options: [
				'cosign garde la clé dans Fulcio, qui la renouvelle chaque nuit',
				'La clé est stockée chiffrée dans Rekor à côté de la signature',
				'cosign crée une clé pour une seule signature, puis la jette',
				'Le fournisseur OIDC garde la clé et signe à la place de l’utilisateur'
			],
			answer: 2,
			why: 'cosign génère la paire de clés en local, Fulcio lie la clé publique à l’identité pour 10 minutes, et la clé privée part à la poubelle après une signature. Pour signer à ta place, un attaquant a besoin d’un token OIDC pour ton identité.'
		}
	],
	lab: {
		minutes: 25,
		goal: 'Signer une image dans une registry locale avec cosign, voir la vérification échouer quand l’image est remplacée, et voir un motif d’identité non ancré laisser entrer le mauvais signataire.',
		steps: [
			'Crée un dossier de travail et lance une registry locale : `mkdir -p ~/sign-lab && cd ~/sign-lab && docker run -d --name sign-lab-reg -p 5055:5000 registry:2`.',
			'Lance cosign depuis son image, avec ton propre utilisateur pour qu’il puisse écrire ici : `cosign() { docker run --rm --network host -u "$(id -u)" -v "$PWD":/w -w /w -e COSIGN_PASSWORD= ghcr.io/sigstore/cosign/cosign:v2.4.1 "$@"; }`, puis `cosign generate-key-pair`. Le lab utilise une paire de clés, car la signature keyless demande une vraie connexion OIDC.',
			'Construis et pousse une image, puis garde son digest : `printf "FROM busybox:1.37\\nRUN echo v1 > /version\\n" | docker build -t localhost:5055/demo:v1 - && docker push localhost:5055/demo:v1`, puis `D=$(docker inspect --format "{{index .RepoDigests 0}}" localhost:5055/demo:v1)`.',
			'Signe le digest et vérifie-le, sans le journal public puisque le lab reste en local : `cosign sign --key cosign.key --tlog-upload=false -y "$D"`, puis `cosign verify --key cosign.pub --insecure-ignore-tlog "$D"`.',
			'Joue l’attaquant : reconstruis avec `echo evil` au lieu de `echo v1`, pousse sur le même tag `localhost:5055/demo:v1`, et lance `cosign verify --key cosign.pub --insecure-ignore-tlog localhost:5055/demo:v1`.',
			'Teste le motif d’identité : `printf "%s\\n" https://github.com/acme/api/.github/workflows/release.yml@refs/tags/v1.2.0 https://github.com/acme-tools/x/.github/workflows/a.yml@refs/heads/main > sans.txt`, puis compare `grep -E \'github.com/acme\' sans.txt` et `grep -E \'^https://github\\.com/acme/api/\\.github/workflows/release\\.yml@refs/tags/v[0-9.]+$\' sans.txt`.',
			'Nettoie : `docker stop sign-lab-reg && docker rm sign-lab-reg`.'
		],
		done: [
			'`cosign verify` sur `"$D"` sort avec le code 0 et affiche « The signatures were verified against the specified public key ».',
			'Après le remplacement, `cosign verify` sur le tag échoue avec `Error: no signatures found`.',
			'Le premier `grep -E` affiche les deux SAN. Le motif ancré n’affiche que le SAN de release de `acme/api`.'
		],
		solution: [
			'cosign range la signature à côté du digest qu’elle couvre. L’image remplacée a un nouveau digest, donc aucune signature ne pointe vers elle.',
			'C’est pour ça qu’un script de déploiement vérifie par digest (`@sha256:...`) : ce que tu as vérifié est ce que tu lances.',
			'`grep -E` utilise les regexps POSIX, pas celles de Go, mais pour ces deux motifs le comportement est le même : une correspondance n’importe où suffit tant que tu n’ancres pas.',
			'En dehors du lab, garde le journal de transparence : retire `--tlog-upload=false` et `--insecure-ignore-tlog`.'
		]
	},
	recall: {
		q: 'Quels deux flags faut-il donner à `cosign verify` pour une signature keyless, et quelles valeurs Kubernetes donne-t-il pour ses images de release ?',
		a: '`--certificate-identity krel-trust@k8s-releng-prod.iam.gserviceaccount.com` et `--certificate-oidc-issuer https://accounts.google.com`.'
	},
	sources: [
		{ title: 'Codecov, Bash Uploader Security Update (avril 2021)', url: 'https://about.codecov.io/security-update/' },
		{ title: 'Doc Sigstore, Overview', url: 'https://docs.sigstore.dev/about/overview/' },
		{ title: 'Doc Sigstore, Fulcio', url: 'https://docs.sigstore.dev/certificate_authority/overview/' },
		{ title: 'Doc Sigstore, Verifying Signatures', url: 'https://docs.sigstore.dev/cosign/verifying/verify/' },
		{ title: 'Doc Sigstore, OIDC Verification Cheat Sheet', url: 'https://docs.sigstore.dev/quickstart/verification-cheat-sheet/' },
		{ title: 'Doc Sigstore, The Importance of Verification', url: 'https://docs.sigstore.dev/about/the-importance-of-verification/' },
		{ title: 'Doc Kubernetes, Verify Signed Kubernetes Artifacts', url: 'https://kubernetes.io/docs/tasks/administer-cluster/verify-signed-artifacts/' },
		{ title: 'Doc Go, regexp.Regexp.MatchString', url: 'https://pkg.go.dev/regexp#Regexp.MatchString' }
	]
};
