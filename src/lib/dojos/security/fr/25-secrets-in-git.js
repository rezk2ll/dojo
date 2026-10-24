const GL = 'https://github.com/gitleaks/gitleaks/blob/b58d3f102cf3a2c84cb7f923d05c25c9b1aed84b';
const RSA = 'https://github.blog/news-insights/company-news/we-updated-our-rsa-ssh-host-key/';
const REMOVE = 'https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository';
const AWS_ROTATE = 'https://docs.aws.amazon.com/IAM/latest/UserGuide/id-credentials-access-keys-update.html';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'secrets-in-git',
	part: 'Les secrets et la chaîne d’approvisionnement',
	title: 'Les secrets dans git',
	minutes: 10,
	hook: [
		'Le 23 mars 2023, GitHub [annonce](' + RSA + ') que "GitHub.com’s RSA SSH private key was briefly exposed in a public GitHub repository" : sa clé privée SSH RSA a été visible un moment dans un dépôt public. Avec cette clé, un attaquant pouvait se faire passer pour github.com auprès des clients `git` qui passent par SSH.',
		'GitHub dit avoir "immediately acted to contain the exposure", puis change la clé : "At approximately 05:00 UTC on March 24, out of an abundance of caution, we replaced our RSA SSH host key". Les clients SSH qui avaient enregistré l’ancienne clé RSA affichent "WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!", et leurs utilisateurs doivent lancer `ssh-keygen -R github.com`. Les workflows GitHub Actions qui utilisent `actions/checkout` avec l’option `ssh-key` peuvent échouer.',
		'Le 1er avril 2025, GitHub écrit que "more than 39 million secrets were leaked across GitHub in 2024 alone" : plus de 39 millions de secrets ont fuité sur GitHub en 2024. Pour chacun, un commit qui supprime le fichier ne change rien : le commit précédent contient toujours le secret, comme chaque clone et chaque fork faits depuis le push.'
	],
	terms: [
		{ term: 'Secret', def: 'Une chaîne qui donne un accès à elle seule, sans autre contrôle : une clé d’accès AWS, un token d’API, une clé privée SSH.' },
		{ term: 'Rotation', def: 'Émettre un nouveau secret, y passer chaque programme, puis désactiver l’ancien. Ensuite, la copie qui a fuité est refusée partout où elle se trouve.' },
		{ term: 'Réécriture de l’historique', def: 'Reconstruire les commits sans un fichier, par exemple avec `git-filter-repo`, puis faire un force push. Chaque commit suivant reçoit un nouveau SHA.' },
		{ term: 'Push protection', def: 'Un contrôle de GitHub qui cherche les formats de secrets connus dans un push et le bloque avant que les commits n’arrivent dans le dépôt.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['add["Le commit a1b2c3d ajoute .env : AWS_ACCESS_KEY_ID=AKIAEXAMPLEEXAMPLE00"] -->|"git push"| repo[("Dépôt public sur GitHub")]'],
				highlight: ['add', 'repo'],
				note: 'Une développeuse commite `.env` avec une clé d’accès AWS et pousse vers un dépôt public. Dès cet instant, quiconque clone, forke ou ouvre la page du commit a la clé.'
			},
			{
				add: ['repo --> del["Commit e4f5a6b : git rm .env"]', 'del --> still["Toujours lisible : git show a1b2c3d:.env, clones, forks"]'],
				highlight: ['del', 'still'],
				note: 'Le commit suivant supprime le fichier, et la copie de travail a l’air propre. Le premier commit n’a pas changé : `git show a1b2c3d:.env` affiche encore la clé. La doc de GitHub ajoute qu’un commit réécrit peut rester accessible "In any clones or forks of your repository" et "Directly via their SHA-1 hashes in cached views".'
			},
			{
				add: ['still --> rotate["Rotation : create-access-key, déploiement, update-access-key --status Inactive"]', 'rotate --> dead["La clé qui a fuité est refusée partout"]'],
				highlight: ['rotate', 'dead'],
				note: 'Tu changes l’état de la clé chez AWS, donc toutes les copies sont touchées d’un coup. Crée une deuxième clé, passe l’appli dessus, puis mets l’ancienne en `Inactive`. La doc AWS : "Inactive means that the key cannot be used."'
			},
			{
				add: ['dead -.->|"optionnel"| rewrite["git-filter-repo --sensitive-data-removal, force push"]', 'dead --> guard["La prochaine fois : hook pre-commit gitleaks, push protection"]'],
				highlight: ['rewrite', 'guard'],
				note: 'La doc de GitHub sur le retrait d’un secret de l’historique : une fois le secret changé, "that may be sufficient to solve your problem" (ça peut suffire). Une réécriture change chaque SHA suivant. Un hook gitleaks arrête la prochaine clé avant que le commit existe, et la push protection l’arrête au push.'
			}
		]
	},
	example: {
		title: 'cmd/generate/config/rules/aws.go : la règle gitleaks pour les clés d’accès AWS',
		repo: 'gitleaks/gitleaks',
		url: `${GL}/cmd/generate/config/rules/aws.go#L10-L32`,
		lang: 'go',
		code: `func AWS() *config.Rule {
	// define rule
	r := config.Rule{
		RuleID:      "aws-access-token",
		Description: "Identified a pattern that may indicate AWS credentials, risking unauthorized cloud resource access and data breaches on AWS platforms.",
		Regex:       regexp.MustCompile(\`\\b((?:A3T[A-Z0-9]|AKIA|ASIA|ABIA|ACCA)[A-Z2-7]{16})\\b\`),
		Entropy:     3,
		Keywords: []string{
			// https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_identifiers.html#identifiers-unique-ids
			"A3T",  // todo: might not be a valid AWS token
			"AKIA", // Access key
			"ASIA", // Temporary (AWS STS) access key
			"ABIA", // AWS STS service bearer token
			"ACCA", // Context-specific credential
		},
		Allowlists: []*config.Allowlist{
			{
				Regexes: []*regexp.Regexp{
					regexp.MustCompile(\`.+EXAMPLE$\`),
				},
			},
		},
	}`,
		notes: [
			'La ligne 6 est le motif : un préfixe de 4 caractères comme `AKIA`, puis 16 caractères parmi `A-Z` et `2-7`, soit 20 en tout. La [table des identifiants AWS](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_identifiers.html) donne les mêmes préfixes : `AKIA` pour une "Access key", `ASIA` pour une "Temporary (AWS STS) access key".',
			'La ligne 7 fixe `Entropy: 3`. Le README de gitleaks la définit comme la "minimum shannon entropy a regex group must have to be considered a secret" (l’entropie minimale pour compter comme secret). Une même lettre répétée après `AKIA` correspond au motif, mais elle est écartée.',
			'Les lignes 8 à 15 listent des mots-clés, utilisés "for pre-regex check filtering". Une comparaison de chaînes rapide vérifie que le contenu contient l’une de ces 5 chaînes avant que gitleaks lance la regex.',
			'Les lignes 16 à 22 écartent toute correspondance qui finit par `EXAMPLE`. D’après le README, une regex d’allowlist porte par défaut sur le secret. La doc d’AWS écrit ses clés d’exemple avec cette fin, donc un exemple copié depuis la doc ne lève aucune alerte.',
			'Le README : "Under the hood, gitleaks uses the `git log -p` command to scan patches." `gitleaks git -v` lit donc le commit qui a ajouté une clé, même après qu’un commit suivant a supprimé le fichier.'
		]
	},
	tradeoff: {
		gain: [
			'Une fois l’ancienne clé en `Inactive`, AWS la refuse, que l’appelant l’ait copiée d’un fork ou du clone d’un inconnu. Personne n’a besoin de retrouver et d’effacer ces copies.',
			'gitleaks lit `git log -p`, donc il trouve une clé dans un commit de l’an dernier. En hook pre-commit, il marque "Detect hardcoded secrets" en Failed, et `git commit` s’arrête avant que le commit existe.',
			'La push protection pour les utilisateurs de GitHub "Is enabled by default" et "Stops you from pushing secrets to public repositories on GitHub" : rien à configurer de ton côté.'
		],
		cost: [
			'La rotation casse chaque programme qui garde l’ancien secret. La nouvelle clé d’hôte de GitHub a fait afficher l’alerte d’identification à chaque client RSA concerné, et des workflows `actions/checkout` ont échoué.',
			'Une réécriture change le SHA de chaque commit suivant, retire les signatures et casse la vue des diffs des pull requests fermées. La doc de GitHub liste ces effets et d’autres.',
			'`SKIP=gitleaks git commit` désactive le hook gitleaks. La doc de GitHub sur la push protection des dépôts : par défaut, "anyone with write access to the repository can bypass push protection by specifying a bypass reason" (toute personne qui peut écrire peut passer outre en donnant une raison).'
		]
	},
	task: {
		prompt: 'Vendredi, 17 h 10. Une développeuse pousse le commit `a1b2c3d` dans un dépôt public. Il ajoute `config/.env` avec la clé de l’utilisateur IAM `ci-deploy` (ici le faux `AKIAEXAMPLEEXAMPLE00`). À 17 h 25, elle pousse `e4f5a6b`, "remove .env", et te dit que c’est réglé. Note ce qui reste exposé, puis les commandes que tu lances, dans l’ordre. 10 minutes, sur papier.',
		hint: 'Demande-toi où se trouve la chaîne maintenant, puis quelle action unique rend toutes les copies inutiles d’un coup.',
		answer: [
			'Encore exposé : `git show a1b2c3d:config/.env` affiche la clé depuis n’importe quel clone. Chaque clone et chaque fork fait depuis 17 h 10 l’a, et GitHub sert la page du commit par son SHA. Supprimer le fichier n’a rien changé à tout ça.',
			'D’abord la rotation : `aws iam create-access-key --user-name ci-deploy`, range la nouvelle clé dans le coffre de secrets du déploiement, et vérifie qu’un déploiement passe. Puis `aws iam update-access-key --access-key-id AKIAEXAMPLEEXAMPLE00 --status Inactive --user-name ci-deploy`. À partir de là, AWS refuse la clé qui a fuité.',
			'Vérifie l’usage : `aws iam get-access-key-last-used --access-key-id AKIAEXAMPLEEXAMPLE00` ne renvoie que la date, le service et la région de la dernière requête, donc ton propre déploiement de 17 h 20 cacherait un usage plus ancien. Une dernière utilisation qui n’est pas la tienne, c’est un incident (jour 38). Supprime la clé avec `aws iam delete-access-key` quand plus rien ne casse.',
			'Ensuite, décide pour l’historique. GitHub dit qu’un secret changé "may be sufficient", et une réécriture avec `git-filter-repo --sensitive-data-removal --invert-paths --path config/.env` change chaque SHA suivant. Dans tous les cas, ajoute `.env` au `.gitignore`, installe le hook pre-commit gitleaks et active la push protection sur le dépôt.'
		],
		steps: [
			{
				title: 'Trouve ce qui reste exposé',
				questions: [
					{ q: 'Après que `e4f5a6b` a retiré le fichier, qu’affiche `git show a1b2c3d:config/.env` ?', options: ['Une erreur : le fichier a disparu', 'Rien, le commit a été réécrit', 'La clé, depuis n’importe quel clone', 'La clé, mais seulement sur le portable de la développeuse'], answer: 2, why: 'Un nouveau commit ajoute un instantané sans le fichier et laisse `a1b2c3d` tel quel.' },
					{ q: 'Qui d’autre peut avoir la clé maintenant ?', options: ['Chaque clone et chaque fork faits depuis 17 h 10', 'Seulement le personnel de GitHub', 'Personne, le dépôt n’a été public que 15 minutes', 'Seulement ceux qui ont mis une étoile au dépôt'], answer: 0, why: 'Chaque clone ou fork garde sa propre copie du commit, et GitHub sert la page du commit par son SHA.' },
					{ q: 'La développeuse dit que c’est réglé. Qu’a changé la suppression ?', options: ['Elle a révoqué la clé dans AWS', 'Elle a retiré le commit de GitHub', 'Elle a empêché les forks de se synchroniser', 'Seulement le dernier instantané des fichiers'], answer: 3, why: 'L’arbre de travail a l’air propre, mais l’historique et chacune de ses copies gardent la clé.' },
					{ q: 'Pourquoi un scan gitleaks trouve-t-il encore la clé ?', options: ['Il lit l’arbre de travail deux fois', 'Il lit les patchs avec `git log -p`', 'Il demande à GitHub les fichiers supprimés', 'Il ne lit que le reflog'], answer: 1, why: 'Le README : "gitleaks uses the `git log -p` command to scan patches", donc le commit qui a ajouté la clé ressort.' }
				]
			},
			{
				title: 'Choisis le premier geste',
				questions: [
					{ q: 'Quelle action unique rend toutes les copies inutiles d’un coup ?', options: ['Réécrire l’historique et faire un force push', 'Passer le dépôt en privé', 'Demander aux forks de supprimer leur copie', 'Faire la rotation de la clé dans AWS'], answer: 3, why: 'Le changement a lieu là où la clé est vérifiée, il couvre donc les clones que tu ne peux pas atteindre.' },
					{ q: 'Pourquoi ne pas réécrire l’historique d’abord ?', options: ['Une réécriture ne fait rien aux copies prises depuis 17 h 10', 'Git ne sait pas réécrire un dépôt public', 'Une réécriture supprime l’utilisateur IAM', '`git-filter-repo` ne marche que sur les dépôts privés'], answer: 0, why: 'La doc de GitHub : "as a first step you need to revoke and/or rotate that secret."' },
					{ q: 'Pourquoi ne pas simplement passer le dépôt en privé ?', options: ['Ça supprime le dépôt', 'Les clones et les forks ont déjà la clé', 'Ça coûte de l’argent', 'Ça désactive la push protection'], answer: 1, why: 'Un dépôt privé cache la page, pas les copies déjà prises.' },
					{ q: 'Que veut dire la rotation ici ?', options: ['Renommer l’utilisateur IAM', 'Déplacer le `.env` dans un autre dossier', 'Nouvelle clé, chaque programme y passe, puis l’ancienne est désactivée', 'Chiffrer l’ancienne clé'], answer: 2, why: 'Après la rotation, la copie qui a fuité est refusée partout où elle se trouve.' }
				]
			},
			{
				title: 'Fais la rotation',
				questions: [
					{ q: 'Quelle commande vient en premier ?', options: ['`aws iam create-access-key --user-name ci-deploy`', '`aws iam delete-access-key` sur la clé qui a fuité', '`aws iam update-access-key --status Inactive` sur la clé qui a fuité', '`git push --force`'], answer: 0, why: 'Crée d’abord la nouvelle clé et passe le déploiement dessus, pour que couper l’ancienne ne casse rien.' },
					{ q: 'Que vérifies-tu avant de couper l’ancienne clé ?', options: ['Que gitleaks passe', 'Que le dépôt est privé', 'Que l’utilisateur IAM n’a pas d’autre clé', 'Qu’un déploiement marche avec la nouvelle clé'], answer: 3, why: 'La rotation casse chaque programme qui tient encore l’ancien secret. Vérifie d’abord que le nouveau marche.' },
					{ q: 'Que fait `--status Inactive` ?', options: ['Il cache la clé dans la console', 'La clé ne peut plus servir', 'Il supprime la clé au bout de 30 jours', 'Il limite la clé à la lecture'], answer: 1, why: 'La doc AWS : "Inactive means that the key cannot be used."' },
					{ q: '`get-access-key-last-used` montre un usage à 17 h 20 par ton propre déploiement. Es-tu sûr que personne d’autre n’a utilisé la clé ?', options: ['Oui : le dernier usage est le tien', 'Oui : AWS aurait alerté', 'Non : il ne renvoie que la dernière requête, qui peut en cacher une plus ancienne', 'Non : il ne montre que les usages depuis la console'], answer: 2, why: 'Il ne renvoie que la date, le service et la région de la dernière requête. Un usage qui n’est pas le tien, c’est un incident.' }
				]
			},
			{
				title: 'Ferme la porte',
				questions: [
					{ q: 'Une fois la clé changée, une réécriture de l’historique est-elle obligatoire ?', options: ['Oui, sinon AWS garde la clé active', 'Oui, GitHub l’exige', 'Non : GitHub dit que la rotation "may be sufficient"', 'Non : les réécritures sont impossibles sur GitHub'], answer: 2, why: 'La réécriture est optionnelle, et elle change le SHA de chaque commit suivant.' },
					{ q: 'Si tu réécris, quelle commande retire le fichier ?', options: ['`git rm --cached config/.env`', '`git revert a1b2c3d`', '`git commit --amend`', '`git-filter-repo --sensitive-data-removal --invert-paths --path config/.env`'], answer: 3, why: '`git-filter-repo` reconstruit chaque commit sans le fichier. Un revert ou un nouveau commit laisse l’ancien intact.' },
					{ q: 'Qu’est-ce qui arrête la prochaine clé avant que le commit existe ?', options: ['Un hook pre-commit gitleaks', 'Un scan hebdomadaire de la branche par défaut', 'Une revue de code sur la pull request', 'Une protection de branche sur `main`'], answer: 0, why: 'Le hook marque "Detect hardcoded secrets" en Failed et `git commit` s’arrête.' },
					{ q: 'Qu’est-ce qui l’arrête au push, côté GitHub ?', options: ['Dependabot', 'La push protection', 'Une règle `.gitattributes`', 'Les commits signés'], answer: 1, why: 'La push protection cherche dans un push les formats de secrets connus et le bloque avant que les commits atteignent le dépôt.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Un développeur pousse `.env` avec un token, lance `git rm .env`, commite et pousse de nouveau. Où est le token maintenant ?',
			options: [
				'Nulle part sur GitHub : un fichier supprimé quitte l’historique dès que le commit est poussé',
				'Dans le commit précédent, et dans chaque clone et chaque fork faits depuis le premier push',
				'Seulement dans le reflog local du développeur, que git expire au bout de 90 jours',
				'Dans le stockage de GitHub pendant 30 jours, jusqu’au ramasse-miettes du blob'
			],
			answer: 1,
			why: 'Un nouveau commit ajoute un instantané sans le fichier et laisse le commit précédent tel quel. `git show <sha>:.env` affiche toujours le token, et chaque clone ou fork garde sa propre copie de ce commit.'
		},
		{
			q: 'Le secret scanning signale une clé AWS active, poussée il y a une heure. Que fais-tu d’abord ?',
			options: [
				'Lancer `git-filter-repo` pour retirer le fichier de chaque commit, puis un force push',
				'Passer le dépôt en privé pour que personne d’autre ne lise le commit',
				'Créer une nouvelle clé, y passer l’appli, puis mettre l’ancienne en `Inactive`',
				'Fermer l’alerte, puisque le fichier a déjà disparu de la branche par défaut'
			],
			answer: 2,
			why: 'Une fois la clé en `Inactive`, AWS la refuse dans toutes les copies, y compris les clones que tu ne peux pas atteindre. Une réécriture ou un dépôt privé ne fait rien aux copies prises pendant cette heure. La doc de GitHub : "as a first step you need to revoke and/or rotate that secret."'
		},
		{
			q: 'Une fixture de test contient la clé d’exemple documentée par AWS, qui finit par `EXAMPLE`. Pourquoi la règle gitleaks `aws-access-token` ne la signale-t-elle pas ?',
			options: [
				'Toute clé qui contient `EXAMPLE` a une entropie de Shannon sous 3',
				'La liste de mots-clés fait sauter les fichiers d’un dossier de tests',
				'Une regex d’allowlist `.+EXAMPLE$` écarte les secrets qui finissent par EXAMPLE',
				'gitleaks ne lit que le dernier commit, sauf si tu passes `--all`'
			],
			answer: 2,
			why: 'L’entrée `Allowlists` de la règle contient `.+EXAMPLE$`, et une regex d’allowlist porte par défaut sur le secret. Les mots-clés ne filtrent le contenu qu’avant la regex, et `gitleaks git` lit tout `git log -p`.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Commiter une fausse clé AWS dans un dépôt local, la supprimer, et voir que l’historique git et gitleaks l’ont encore.',
		steps: [
			'Crée un dépôt jetable : `mkdir ~/leak-lab && cd ~/leak-lab && git init`.',
			'Écris une fausse clé au format AWS (aléatoire, valide nulle part) : `mkdir config && echo "AWS_ACCESS_KEY_ID=AKIA$(LC_ALL=C tr -dc \'A-Z2-7\' </dev/urandom | head -c 16)" > config/.env`.',
			'Commite-la, puis supprime-la comme l’a fait la développeuse : `git add config/.env && git commit -m "add config" && git rm config/.env && git commit -m "remove .env"`.',
			'Cherche-la : `ls config`, puis `git show HEAD~1:config/.env`, puis `git log -p | grep AKIA`.',
			'Scanne avec gitleaks dans docker : `docker run --rm -v "$PWD:/repo" ghcr.io/gitleaks/gitleaks:v8.24.2 git /repo -v --redact`, puis la même chose avec `dir /repo` à la place de `git /repo`.',
			'Ajoute la clé d’exemple documentée par AWS, `echo "key = AKIAIOSFODNN7EXAMPLE" > sample.txt`, commite-la et relance le scan `git`.'
		],
		done: [
			'`ls config` échoue, mais `git show HEAD~1:config/.env` affiche toujours la clé.',
			'Le scan `git` signale `RuleID: aws-access-token` dans `config/.env` et finit par `leaks found: 1`.',
			'Le scan `dir` dit `no leaks found`, et après l’étape 6 le scan `git` ne trouve toujours qu’une fuite.'
		],
		solution: [
			'`git rm` ajoute seulement un instantané sans le fichier. Le commit qui l’a ajouté ne change pas, et `gitleaks git` le lit via `git log -p`.',
			'`dir` ne lit que les fichiers sur le disque, il rate donc une clé qui ne vit plus que dans l’historique.',
			'La clé d’exemple colle au motif mais finit par `EXAMPLE`, et l’allowlist `.+EXAMPLE$` de la règle l’écarte.',
			'Avec une vraie clé, l’étape suivante est la rotation dans AWS, rien dans ce dépôt.'
		]
	},
	recall: {
		q: 'Une clé a été poussée, puis supprimée au commit suivant. Que fais-tu d’abord, et pourquoi la suppression ne suffit-elle pas ?',
		a: 'La rotation : créer une nouvelle clé, la déployer, puis mettre l’ancienne en `Inactive` avec `aws iam update-access-key`. La clé reste dans le premier commit, dans chaque clone et chaque fork, et `git log -p` la montre.'
	},
	sources: [
		{ title: 'Blog GitHub, We updated our RSA SSH host key (23 mars 2023)', url: RSA },
		{ title: 'Blog GitHub, The next evolution of GitHub Advanced Security (1er avril 2025)', url: 'https://github.blog/security/application-security/next-evolution-github-advanced-security/' },
		{ title: 'Documentation GitHub, Removing sensitive data from a repository', url: REMOVE },
		{ title: 'Documentation GitHub, Push protection', url: 'https://docs.github.com/en/code-security/concepts/secret-security/push-protection' },
		{ title: 'Documentation GitHub, Secret scanning', url: 'https://docs.github.com/en/code-security/concepts/secret-security/secret-scanning' },
		{ title: 'README de gitleaks', url: `${GL}/README.md` },
		{ title: 'Documentation AWS IAM, Update access keys', url: AWS_ROTATE },
		{ title: 'Référence AWS CLI, iam update-access-key', url: 'https://docs.aws.amazon.com/cli/latest/reference/iam/update-access-key.html' }
	]
};
