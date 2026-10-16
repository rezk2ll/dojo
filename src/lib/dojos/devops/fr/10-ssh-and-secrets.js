const HOOKS = 'https://github.com/pre-commit/pre-commit-hooks/blob/2ee68084ed80421ef5a6d062cf1637825adfcb22';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'ssh-and-secrets',
	part: 'Les fondamentaux',
	title: 'Clés SSH et secrets : hors de Git',
	minutes: 10,
	hook: [
		'Tu as une seule clé SSH, sans passphrase, copiée sur tous les portables que tu as eus. Elle ouvre quarante serveurs. La semaine dernière, un collègue a collé le mot de passe de la base dans `deploy.sh` et l’a poussé.',
		'L’automatisation multiplie ces deux problèmes. Les pipelines se connectent aux serveurs et parlent aux bases de données, donc **les secrets se répandent** : dans les scripts, les fichiers env, les logs et l’historique Git.',
		'Aujourd’hui : des clés faites correctement, `ssh-agent` et `~/.ssh/config` pour arrêter de tout retaper, et la règle la plus importante. **Un secret poussé dans Git est un secret qui a fuité.** La solution, c’est de le faire tourner (rotation).'
	],
	terms: [
		{ term: 'Paire de clés', def: 'Une clé privée qui reste chez toi et une clé publique que tu poses sur les serveurs, dans `~/.ssh/authorized_keys`. Crée-la avec `ssh-keygen -t ed25519 -C "toi@portable"`.' },
		{ term: 'Passphrase', def: 'Chiffre le fichier de la clé privée sur le disque. Un portable volé ne veut alors pas dire une clé volée.' },
		{ term: 'ssh-agent', def: 'Un processus qui garde tes clés déverrouillées en mémoire, pour que tu tapes la passphrase une fois par session, pas une fois par connexion.' },
		{ term: 'Secret', def: 'Tout ce qui donne un accès : un mot de passe, un token, une clé privée, une clé d’API. S’il fuit, quelqu’un d’autre peut agir à ta place.' },
		{ term: 'Rotation', def: 'Remplacer un secret par un nouveau et révoquer l’ancien. La seule vraie solution une fois qu’un secret a fuité.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['key["Clé privée : id_ed25519"]', 'pub["Clé publique dans authorized_keys"]', 'key -.->|"prouve que tu la détiens"| pub'],
				highlight: ['key', 'pub'],
				note: 'La clé privée ne quitte jamais ta machine. Le serveur n’a que la moitié publique. `ssh` **ignore tout simplement un fichier de clé privée lisible par d’autres**, donc garde-le en `chmod 600`.'
			},
			{
				add: ['agent["ssh-agent"]', 'key -->|"ssh-add, passphrase une fois"| agent'],
				highlight: ['agent'],
				note: 'La passphrase protège le fichier, l’agent t’évite de la retaper. `ssh-add -t 8h` retire la clé au bout de huit heures. `ssh-add -l` liste ce que l’agent détient.'
			},
			{
				add: ['cfg["~/.ssh/config"]', 'bast["bastion"]', 'web["web1, réseau privé"]', 'agent --> bast', 'bast -->|"ProxyJump"| web', 'cfg -.-> bast'],
				highlight: ['cfg', 'bast', 'web'],
				note: '`Host web1`, `HostName 10.0.1.5`, `User deploy`, `ProxyJump bastion`, et `ssh web1` marche tout seul. La première valeur trouvée l’emporte, donc mets les blocs `Host` précis en premier et `Host *` à la fin. La doc d’OpenSSH présente le jump host comme **plus sûr que le transfert d’agent**.'
			},
			{
				add: ['sec["Secret : mot de passe de la base"]', 'repo["Dépôt Git"]', 'sec -->|"jamais"| repo'],
				highlight: ['sec', 'repo'],
				note: 'Une fois poussé, un secret vit dans l’historique, dans chaque clone et chaque fork. Supprimer le fichier dans un nouveau commit n’enlève rien. La doc de GitHub elle-même dit que la première étape est de **révoquer ou faire tourner** le secret.'
			},
			{
				add: ['store["Coffre à secrets : secrets de CI, un vault, credentials systemd"]', 'app["Service ou pipeline"]', 'store -->|"injecté à l’exécution"| app', 'class store ext'],
				highlight: ['store', 'app'],
				note: 'Les secrets vivent **en dehors du code** et arrivent à l’exécution. Les variables d’environnement sont courantes, mais la doc de systemd prévient qu’elles ne conviennent pas aux secrets. Pour un service, `LoadCredential=` met plutôt le secret dans un fichier sous `$CREDENTIALS_DIRECTORY`.'
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
			'Toute la vérification tient dans une liste de lignes d’en-tête. Si un fichier que tu t’apprêtes à commiter en contient une, le hook affiche son nom et **renvoie 1**. Un code de sortie non nul fait échouer le commit : encore le contrat du jour 6.',
			'Le hook est déclaré dans [`.pre-commit-hooks.yaml`](https://github.com/pre-commit/pre-commit-hooks/blob/2ee68084ed80421ef5a6d062cf1637825adfcb22/.pre-commit-hooks.yaml#L125-L130) avec `types: [text]`. Le même fichier fournit aussi `detect-aws-credentials`.',
			'Il ne connaît que les en-têtes de clés. Un mot de passe de base dans `deploy.sh` passe. Il existe des scanners plus larges, comme le [secret scanning de GitHub](https://docs.github.com/en/code-security/secret-scanning/introduction/about-secret-scanning), qui tourne côté serveur.',
			'Un hook local est une ceinture de sécurité, pas un verrou. `git commit --no-verify` le saute. Garde les vrais secrets là où un commit ne peut pas les atteindre.'
		]
	},
	tradeoff: {
		gain: [
			'Une passphrase plus l’agent : un fichier de clé volé est inutilisable, et tu ne tapes quand même la passphrase qu’une fois.',
			'`~/.ssh/config` transforme des commandes à rallonge en `ssh web1`, et les scripts raccourcissent aussi.',
			'Les secrets injectés à l’exécution peuvent tourner sans modifier ni redéployer le code.'
		],
		cost: [
			'Un coffre à secrets, c’est un système de plus à faire tourner, sauvegarder et ouvrir aux bonnes personnes.',
			'Le transfert d’agent est pratique mais risqué : root sur la machine distante peut utiliser tes clés chargées via la socket transférée.',
			'Les variables d’environnement fuient. La fiche OWASP note qu’elles peuvent finir dans des logs ou des dumps système, et le `--environ` de Caddy vu au jour 6 les affiche toutes au démarrage.'
		]
	},
	task: {
		prompt: 'Il y a une heure, un collègue a poussé `DB_PASSWORD=S3cret!` dans `deploy.sh`, sur un dépôt GitHub partagé. Liste ce que tu fais, dans l’ordre.',
		hint: 'Demande-toi ce qu’un attaquant peut faire tout de suite, et quelle étape lui retire vraiment ce pouvoir.',
		answer: [
			'**Rotation d’abord** : change le mot de passe de la base maintenant. Tant que ce n’est pas fait, quiconque a cloné le dépôt peut se connecter.',
			'Vérifie dans les logs de la base les connexions avec l’ancien mot de passe depuis le push.',
			'Sors le secret du code : `deploy.sh` le lit à l’exécution, depuis le coffre à secrets de la CI ou depuis un fichier que seul l’utilisateur du service peut lire (`chmod 600`), jamais depuis le script lui-même.',
			'Réécrire l’historique est facultatif et lent : le secret reste dans chaque clone et chaque fork. La doc de GitHub liste les effets de bord. C’est la rotation qui te protège.',
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
				'chmod a changé le format de la clé',
				'ssh-agent verrouille les clés qui ont le mauvais mode',
				'Le serveur refuse les clés stockées en mode 644'
			],
			answer: 0,
			why: 'Le manuel de ssh dit qu’il ignore tout simplement un fichier de clé privée accessible par d’autres. `chmod 600` règle le problème. Le serveur ne voit jamais le mode du fichier.'
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
	takeaway: 'Les clés privées restent sur ta machine, derrière une passphrase et un agent. Les secrets vivent hors de Git et arrivent à l’exécution. Quand l’un d’eux fuit, fais-le tourner en premier.',
	sources: [
		{ title: 'Page de manuel ssh(1) (permissions de la clé privée, transfert d’agent)', url: 'https://man7.org/linux/man-pages/man1/ssh.1.html' },
		{ title: 'Page de manuel ssh_config(5) (Host, ProxyJump, ForwardAgent)', url: 'https://man7.org/linux/man-pages/man5/ssh_config.5.html' },
		{ title: 'Doc GitHub, supprimer des données sensibles d’un dépôt', url: 'https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository' },
		{ title: 'Fiche OWASP sur la gestion des secrets', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html' },
		{ title: 'systemd.exec, Credentials (LoadCredential=)', url: 'https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html#Credentials' }
	]
};
