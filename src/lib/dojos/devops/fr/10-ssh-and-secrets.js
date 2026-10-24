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
		],
		steps: [
			{
				title: 'Mesure la fuite',
				questions: [
					{ q: 'Le push date d’il y a une heure. Qui a peut-être déjà le mot de passe ?', options: ['Personne, le dépôt n’est partagé qu’avec l’équipe', 'Quiconque a cloné ou forké le dépôt depuis', 'Seulement le personnel de GitHub', 'Seulement le collègue qui l’a poussé'], answer: 1, why: 'Un secret poussé est dans chaque clone et chaque fork, et tu ne peux pas rappeler ces copies.' },
					{ q: 'Que peut faire tout de suite un attaquant qui a ce mot de passe ?', options: ['Se connecter à la base', 'Pousser sur le dépôt', 'Lire tes clés SSH', 'Rien avant le prochain déploiement'], answer: 0, why: 'Un secret donne un accès. Tant qu’il ne change pas, quiconque l’a peut se faire passer pour le service.' },
					{ q: '`deploy.sh` définit aussi `DB_HOST`, `DB_USER` et `DB_PORT`. Quelle ligne est le secret ?', options: ['`DB_HOST=db1.internal`', '`DB_USER=deploy`', '`DB_PASSWORD=S3cret!`', '`DB_PORT=5432`'], answer: 2, why: 'Un secret, c’est tout ce qui donne un accès. L’hôte, l’utilisateur et le port disent à l’attaquant où est la porte ; seul le mot de passe l’ouvre.' },
					{ q: 'Un attaquant se connecte avec le mot de passe qui a fuité. Pourquoi est-ce difficile à repérer dans les logs de la base ?', options: ['Les bases ne journalisent pas les connexions', 'L’attaquant supprime d’abord le mot de passe de Git', 'Les connexions avec un mot de passe qui a fuité sont chiffrées', 'Ça ressemble à une connexion normale du compte de service'], answer: 3, why: 'Quiconque détient un secret peut se faire passer pour son propriétaire. La connexion est valide, donc seuls des détails comme l’adresse source ou l’heure la trahissent.' }
				]
			},
			{
				title: 'Fais la rotation et vérifie',
				questions: [
					{ q: 'Tu changes le mot de passe de la base et rien d’autre. Qu’est-ce qui échoue ?', options: ['Les nouvelles connexions du service, qui envoie encore l’ancien mot de passe', 'Rien : le service prend le nouveau tout seul', 'L’historique Git', 'L’agent SSH'], answer: 0, why: 'La rotation révoque l’ancienne valeur, et `deploy.sh` la contient encore. Mets le nouveau mot de passe là où le service le lit, dans le même changement.' },
					{ q: 'Juste après la rotation, que vérifies-tu ?', options: ['Les logs de la CI pour les temps de build', 'Les logs de la base pour les connexions avec l’ancien mot de passe depuis le push', 'La taille du dépôt', 'La config SSH du bastion'], answer: 1, why: 'Les logs te disent si quelqu’un a utilisé le mot de passe qui a fuité avant que tu le changes.' },
					{ q: 'Une fois l’ancien mot de passe révoqué, que devient la copie dans l’historique Git ?', options: ['Un mot de passe qui marche encore tant que tu ne réécris pas l’historique', 'Une valeur chiffrée par GitHub', 'Une valeur inutile : elle n’ouvre plus la base', 'Une valeur effacée de chaque clone'], answer: 2, why: 'La rotation rend inutile la valeur qui a fuité. Elle reste dans chaque clone et chaque fork, mais ne donne plus aucun accès.' },
					{ q: 'Pourquoi la rotation passe-t-elle avant la réécriture de l’historique ?', options: ['Réécrire l’historique est interdit', 'La rotation est plus lente', 'GitHub réécrit l’historique pour toi', 'La réécriture est lente, et le secret est déjà dans des clones et des forks'], answer: 3, why: 'Réécrire l’historique est facultatif et a des effets de bord. Seul le nouveau mot de passe bloque l’attaquant.' }
				]
			},
			{
				title: 'Sors le secret du code',
				questions: [
					{ q: 'D’où `deploy.sh` doit-il tirer le mot de passe ?', options: ['D’une constante en haut du script', 'D’un commentaire dans le README', 'À l’exécution, du coffre à secrets de la CI ou d’un fichier que seul l’utilisateur du service peut lire', 'Du message de commit'], answer: 2, why: 'Le secret est stocké hors du code et arrive au service à l’exécution.' },
					{ q: 'Quel mode convient à un fichier qui contient le mot de passe ?', options: ['`chmod 600`', '`chmod 644`', '`chmod 755`', '`chmod 777`'], answer: 0, why: '`600` ne laisse que le propriétaire le lire et l’écrire.' },
					{ q: 'Que dit la doc de systemd sur les variables d’environnement pour les secrets ?', options: ['C’est l’option la plus sûre', 'Elles ne conviennent pas aux secrets', 'Elles sont chiffrées par défaut', 'Seul root les voit'], answer: 1, why: 'La doc de systemd le déconseille. `LoadCredential=` met plutôt le secret dans un fichier sous `$CREDENTIALS_DIRECTORY`.' },
					{ q: 'Quel est un coût des secrets injectés à l’exécution depuis un coffre ?', options: ['On ne peut plus les faire tourner', 'Il faut redéployer le code à chaque changement', 'Le secret finit quand même dans Git', 'Le coffre est un système de plus à faire tourner, sauvegarder et ouvrir aux bonnes personnes'], answer: 3, why: 'Le gain, c’est la rotation sans redéploiement. Le coût, c’est de faire tourner le coffre.' }
				]
			},
			{
				title: 'Évite le prochain',
				questions: [
					{ q: 'Quelle vérification locale arrête une clé privée avant le commit ?', options: ['Un hook pre-commit comme `detect-private-key`', '`git log -p`', '`ssh-add -l`', '`chmod 600`'], answer: 0, why: 'Le hook cherche des en-têtes de clé dans les fichiers indexés et renvoie 1, ce qui fait échouer le commit.' },
					{ q: '`detect-private-key` aurait-il attrapé `DB_PASSWORD=S3cret!` ?', options: ['Oui, il lit chaque ligne', 'Oui, parce que ça finit par `!`', 'Non, il ne cherche que des en-têtes de clé', 'Seulement dans les fichiers `.env`'], answer: 2, why: 'Il cherche des lignes comme `BEGIN OPENSSH PRIVATE KEY`, donc un simple mot de passe passe.' },
					{ q: 'Pourquoi ajouter aussi le secret scanning côté serveur ?', options: ['Il remplace la rotation', '`git commit --no-verify` saute un hook local', 'Il efface les secrets qui ont fuité', 'Les hooks locaux ne tournent que sous Linux'], answer: 1, why: 'Un hook local se contourne. Le scanning côté serveur voit quand même le push.' },
					{ q: 'Quels fichiers vont dans `.gitignore` ?', options: ['`deploy.sh`', '`.gitignore` lui-même', '`README.md`', 'Les fichiers `.env`'], answer: 3, why: 'Les fichiers qui contiennent des secrets ne doivent jamais être indexés.' }
				]
			}
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
	lab: {
		minutes: 20,
		goal: 'Dans un dépôt jetable, voir un mot de passe « supprimé » survivre dans l’historique, le déplacer dans un fichier lu à l’exécution, puis protéger une clé avec une passphrase et un hook pre-commit.',
		steps: [
			'Crée un dépôt et fais fuiter un mot de passe : `mkdir -p ~/secrets-lab && cd ~/secrets-lab && git init -q && git config user.name lab && git config user.email lab@localhost`, puis `printf \'#!/usr/bin/env bash\\nDB_PASSWORD=S3cret!\\necho "deploying"\\n\' > deploy.sh && git add deploy.sh && git commit -qm "add deploy"`.',
			'« Corrige » dans un nouveau commit : `printf \'#!/usr/bin/env bash\\nset -euo pipefail\\nDB_PASSWORD=$(cat "${DB_PASSWORD_FILE:?}")\\necho "deploying with ${#DB_PASSWORD} chars"\\n\' > deploy.sh && git commit -qam "read password from file"`. Puis cherche : `grep -c S3cret deploy.sh` et `git log -p | grep S3cret`.',
			'Fais la rotation et garde la nouvelle valeur hors de Git : `printf \'N3wPass\\n\' > db_password && chmod 600 db_password && echo db_password >> .gitignore`. Lance `DB_PASSWORD_FILE=./db_password bash deploy.sh`, puis `bash deploy.sh; echo $?` sans la variable, et `git status --short`.',
			'Crée une clé avec une passphrase : `ssh-keygen -t ed25519 -C "lab@laptop" -f ./lab_key -N \'correct horse\'`. Essaie `ssh-keygen -y -P wrong -f lab_key`, puis `ssh-keygen -y -P \'correct horse\' -f lab_key`. Puis `chmod 644 lab_key`, relance la seconde commande, et remets le mode avec `chmod 600 lab_key`.',
			'Ajoute un hook pre-commit qui refuse les en-têtes de clé : `printf \'#!/bin/sh\\nif git diff --cached --name-only -z | xargs -0 grep -l "PRIVATE KEY" 2>/dev/null; then\\n  echo "Private key found, commit refused" >&2\\n  exit 1\\nfi\\n\' > .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit`. Essaie `git add lab_key && git commit -m oops; echo $?`, puis `git reset -q lab_key`.'
		],
		done: [
			'`grep -c S3cret deploy.sh` affiche `0`, et `git log -p | grep S3cret` affiche toujours le mot de passe.',
			'`deploy.sh` affiche `deploying with 7 chars`, `ls -l db_password` commence par `-rw-------`, et `git status --short` ne liste pas `db_password`.',
			'La mauvaise passphrase affiche `incorrect passphrase supplied`. En mode 644, ssh-keygen affiche `UNPROTECTED PRIVATE KEY FILE!`.',
			'Le commit de `lab_key` affiche `Private key found, commit refused` et sort avec `1`.'
		],
		solution: [
			'L’historique garde chaque version de `deploy.sh` : c’est la rotation, pas le deuxième commit, qui met fin à la fuite.',
			'Sans la variable, le script s’arrête avec `DB_PASSWORD_FILE: parameter null or not set` et sort avec `1`, au lieu de tourner sans mot de passe. `set -e` compte ici : sans lui, bash affiche l’erreur et lance quand même la ligne suivante.',
			'`git commit --no-verify` saute ce hook, c’est pourquoi le chapitre ajoute aussi le secret scanning côté serveur. Supprime `~/secrets-lab` à la fin : il contient une clé de test.'
		]
	},
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
