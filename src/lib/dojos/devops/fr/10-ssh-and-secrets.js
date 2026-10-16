const HOOKS = 'https://github.com/pre-commit/pre-commit-hooks/blob/2ee68084ed80421ef5a6d062cf1637825adfcb22';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'ssh-and-secrets',
	part: 'Les fondamentaux',
	title: 'Clés SSH et secrets : hors de Git',
	minutes: 10,
	hook: [
		'Tu as une seule clé SSH, sans passphrase, copiée sur tous les portables que tu as eus. Elle ouvre quarante serveurs. La semaine dernière, un collègue a collé le mot de passe de la base dans `deploy.sh` et l’a poussé.',
		'Les pipelines se connectent aux serveurs et parlent aux bases de données, donc il leur faut aussi des clés et des mots de passe. Ces secrets finissent dans les scripts, les fichiers env, les logs et l’historique Git.',
		'Tu protèges la clé avec une passphrase, et `ssh-agent` et `~/.ssh/config` t’évitent de tout retaper. Un secret poussé dans Git se retrouve dans chaque clone du dépôt, donc **il faut le faire tourner** (rotation).'
	],
	terms: [
		{ term: 'Paire de clés', def: 'Une clé privée qui reste chez toi et une clé publique que tu poses sur les serveurs, dans `~/.ssh/authorized_keys`. Crée-la avec `ssh-keygen -t ed25519 -C "toi@portable"`.' },
		{ term: 'ssh-agent', def: 'Un processus qui garde tes clés déverrouillées en mémoire, pour que tu tapes la passphrase une fois par session, pas une fois par connexion.' },
		{ term: 'Secret', def: 'Tout ce qui donne un accès : un mot de passe, un token, une clé privée, une clé d’API. S’il fuit, quelqu’un d’autre peut agir à ta place.' },
		{ term: 'Rotation', def: 'Remplacer un secret par un nouveau et révoquer l’ancien. Après une fuite, la rotation rend inutilisable la valeur qui a fuité.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['key["Clé privée : id_ed25519"]', 'pub["Clé publique dans authorized_keys"]', 'key -.->|"prouve que tu la détiens"| pub'],
				highlight: ['key', 'pub'],
				note: 'La clé privée ne quitte jamais ta machine. Le serveur n’a que la moitié publique. `ssh` **ignore un fichier de clé privée lisible par d’autres**, donc garde-le en `chmod 600`.'
			},
			{
				add: ['agent["ssh-agent"]', 'key -->|"ssh-add, passphrase une fois"| agent'],
				highlight: ['agent'],
				note: 'La passphrase chiffre le fichier de clé sur le disque : un portable volé ne livre pas la clé. L’agent garde la clé déverrouillée, donc tu tapes la passphrase une seule fois. `ssh-add -t 8h` retire la clé au bout de huit heures, et `ssh-add -l` liste ce que l’agent détient.'
			},
			{
				add: ['cfg["~/.ssh/config"]', 'bast["bastion"]', 'web["web1, réseau privé"]', 'agent --> bast', 'bast -->|"ProxyJump"| web', 'cfg -.-> bast'],
				highlight: ['cfg', 'bast', 'web'],
				note: 'Avec `Host web1`, `HostName 10.0.1.5`, `User deploy` et `ProxyJump bastion` dans la config, `ssh web1` se connecte en passant par le bastion. ssh prend la première valeur qu’il trouve pour chaque option, donc mets les blocs `Host` précis en premier et `Host *` à la fin. La doc d’OpenSSH présente le jump host comme **plus sûr que le transfert d’agent**.'
			},
			{
				add: ['sec["Secret : mot de passe de la base"]', 'repo["Dépôt Git"]', 'sec -->|"jamais"| repo'],
				highlight: ['sec', 'repo'],
				note: 'Une fois poussé, un secret reste dans l’historique, dans chaque clone et chaque fork. Supprimer le fichier dans un nouveau commit n’enlève rien. La doc de GitHub dit que la première étape est de **révoquer ou faire tourner** le secret.'
			},
			{
				add: ['store["Coffre à secrets : secrets de CI, un vault, credentials systemd"]', 'app["Service ou pipeline"]', 'store -->|"injecté à l’exécution"| app', 'class store ext'],
				highlight: ['store', 'app'],
				note: 'Le secret est stocké **en dehors du code** et arrive au service à l’exécution. Les variables d’environnement sont courantes, mais la doc de systemd prévient qu’elles ne conviennent pas aux secrets. Pour un service, `LoadCredential=` met plutôt le secret dans un fichier sous `$CREDENTIALS_DIRECTORY`.'
			}
		]
	},
	example: {
		title: 'pre_commit_hooks/detect_private_key.py',
		repo: 'pre-commit/pre-commit-hooks',
		url: `${HOOKS}/pre_commit_hooks/detect_private_key.py#L6-L38`,
		lang: 'python',
		code: `BLACKLIST = [
    b'BEGIN RSA PRIVATE KEY',
    b'BEGIN DSA PRIVATE KEY',
    b'BEGIN EC PRIVATE KEY',
    b'BEGIN OPENSSH PRIVATE KEY',
    b'BEGIN PRIVATE KEY',
    b'PuTTY-User-Key-File-2',
    b'BEGIN SSH2 ENCRYPTED PRIVATE KEY',
    b'BEGIN PGP PRIVATE KEY BLOCK',
    b'BEGIN ENCRYPTED PRIVATE KEY',
    b'BEGIN OpenVPN Static key V1',
]
…
    for filename in args.filenames:
        with open(filename, 'rb') as f:
            content = f.read()
            if any(line in content for line in BLACKLIST):
                private_key_files.append(filename)

    if private_key_files:
        for private_key_file in private_key_files:
            print(f'Private key found: {private_key_file}')
        return 1
    else:
        return 0`,
		notes: [
			'Les lignes 1 à 12 listent les lignes d’en-tête de clés que le hook cherche. Si un fichier que tu t’apprêtes à commiter en contient une, les lignes 20 à 23 affichent son nom et **renvoient 1**. Un code de sortie non nul fait échouer le commit, comme au jour 6.',
			'Le hook est déclaré dans [`.pre-commit-hooks.yaml`](https://github.com/pre-commit/pre-commit-hooks/blob/2ee68084ed80421ef5a6d062cf1637825adfcb22/.pre-commit-hooks.yaml#L125-L130) avec `types: [text]`. Le même fichier fournit aussi `detect-aws-credentials`.',
			'La ligne 17 ne reconnaît que les en-têtes de clés, donc un mot de passe de base dans `deploy.sh` passe. Il existe des scanners plus larges, comme le [secret scanning de GitHub](https://docs.github.com/en/code-security/secret-scanning/introduction/about-secret-scanning), qui tourne côté serveur.',
			'`git commit --no-verify` saute un hook local. Garde les vrais secrets là où un commit ne peut pas les atteindre.'
		]
	},
	tradeoff: {
		gain: [
			'Avec une passphrase, un fichier de clé volé est inutilisable, et avec l’agent tu ne tapes quand même la passphrase qu’une fois par session.',
			'Avec `~/.ssh/config`, toi et tes scripts tapez `ssh web1` au lieu de l’utilisateur, de l’adresse et du jump host complets.',
			'Tu peux faire tourner les secrets injectés à l’exécution sans modifier ni redéployer le code.'
		],
		cost: [
			'Un coffre à secrets, c’est un système de plus à faire tourner, sauvegarder et ouvrir aux bonnes personnes.',
			'Avec le transfert d’agent, root sur la machine distante peut utiliser tes clés chargées via la socket transférée.',
			'La fiche OWASP note que les variables d’environnement peuvent finir dans des logs ou des dumps système, et le `--environ` de Caddy vu au jour 6 les affiche toutes au démarrage.'
		]
	},
	task: {
		prompt: 'Il y a une heure, un collègue a poussé `DB_PASSWORD=S3cret!` dans `deploy.sh`, sur un dépôt GitHub partagé. Liste ce que tu fais, dans l’ordre.',
		hint: 'Demande-toi ce qu’un attaquant peut faire tout de suite, et quelle étape lui retire vraiment ce pouvoir.',
		answer: [
			'Rotation d’abord : change le mot de passe de la base maintenant. Tant que ce n’est pas fait, quiconque a cloné le dépôt peut se connecter.',
			'Vérifie dans les logs de la base les connexions avec l’ancien mot de passe depuis le push.',
			'Sors le secret du code : `deploy.sh` le lit à l’exécution, depuis le coffre à secrets de la CI ou depuis un fichier que seul l’utilisateur du service peut lire (`chmod 600`), jamais depuis le script lui-même.',
			'Réécrire l’historique est facultatif et lent : le secret reste dans chaque clone et chaque fork, et la doc de GitHub liste les effets de bord. Seul le nouveau mot de passe bloque l’attaquant.',
			'Évite le prochain : un hook pre-commit, le secret scanning côté serveur, et les fichiers `.env` dans `.gitignore`.'
		]
	},
	quiz: [
		{
			q: 'Tu trouves un mot de passe commité la semaine dernière dans un dépôt Git partagé. Que fais-tu en premier ?',
			options: [
				'Réécrire l’historique et faire un force push',
				'Faire tourner le mot de passe',
				'Passer le dépôt en privé',
				'Supprimer le fichier dans un nouveau commit'
			],
			answer: 1,
			why: 'Le mot de passe est déjà dans des clones, des forks et peut-être dans les notes de quelqu’un. Seule la rotation rend la valeur qui a fuité inutile. La doc de GitHub met révoquer ou faire tourner en première étape.'
		},
		{
			q: 'Après `chmod 644 ~/.ssh/id_ed25519`, ssh n’utilise plus cette clé. Pourquoi ?',
			options: [
				'ssh ignore un fichier de clé privée accessible par d’autres',
				'chmod a réécrit le fichier de clé dans un format que ssh ne sait pas lire',
				'ssh-agent verrouille toute clé qui a le mauvais mode de fichier',
				'Le serveur refuse les clés qui sont stockées en mode 644'
			],
			answer: 0,
			why: 'Le manuel de ssh dit qu’il ignore un fichier de clé privée accessible par d’autres. `chmod 600` règle le problème. Le serveur ne voit jamais le mode du fichier.'
		},
		{
			q: 'Tu dois atteindre `web1` en passant par un bastion. D’après la doc d’OpenSSH, quelle est l’option la plus sûre ?',
			options: [
				'`ForwardAgent yes`, puis un nouveau ssh depuis le bastion',
				'`ProxyJump bastion` dans `~/.ssh/config`',
				'Copier ta clé privée sur le bastion',
				'Désactiver la vérification des clés d’hôte sur le bastion'
			],
			answer: 1,
			why: 'Avec le transfert d’agent, quiconque peut contourner les permissions de fichiers sur le bastion peut utiliser tes clés chargées. ProxyJump fait un tunnel à travers le bastion et tes clés restent sur ta machine.'
		}
	],
	recall: {
		q: 'Un mot de passe a été poussé dans un dépôt Git partagé. Quelle est la première étape, et pourquoi supprimer le fichier ne suffit pas ?',
		a: 'Faire tourner le mot de passe : le remplacer et révoquer l’ancien. Un nouveau commit qui supprime le fichier laisse le mot de passe dans l’historique, dans chaque clone et dans chaque fork.'
	},
	sources: [
		{ title: 'Page de manuel ssh(1) (permissions de la clé privée, transfert d’agent)', url: 'https://man7.org/linux/man-pages/man1/ssh.1.html' },
		{ title: 'Page de manuel ssh_config(5) (Host, ProxyJump, ForwardAgent)', url: 'https://man7.org/linux/man-pages/man5/ssh_config.5.html' },
		{ title: 'Doc GitHub, supprimer des données sensibles d’un dépôt', url: 'https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository' },
		{ title: 'Fiche OWASP sur la gestion des secrets', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html' },
		{ title: 'systemd.exec, Credentials (LoadCredential=)', url: 'https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html#Credentials' }
	]
};
