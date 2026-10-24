const SUDO = 'https://github.com/sudo-project/sudo/blob/ec6d49dd08d7498b0a8a2d58b71976272a978368';
const SUDOERS_IN = `${SUDO}/plugins/sudoers/sudoers.in`;
const VISUDO_C = `${SUDO}/plugins/sudoers/visudo.c`;
const LOGGING_C = `${SUDO}/plugins/sudoers/logging.c`;
const DEBIAN_SUDOERS = 'https://salsa.debian.org/sudo-team/sudo/-/blob/7d2097aa5fbbbb2608f973bc04a9f7e4106cde7a/debian/etc/sudoers';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'users-and-sudo',
	part: 'Le système en marche',
	title: 'Utilisateurs, groupes et sudo',
	minutes: 10,
	hook: [
		'Ta CI se connecte en `deploy` et lance `sudo systemctl restart shop`. Tu mets la règle `deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart shop.service` dans `/etc/sudoers.d/deploy.conf`. sudo répond `deploy is not in the sudoers file.` sudoers(5) donne la raison : sudo lit chaque fichier de `/etc/sudoers.d` en « skipping file names that end in ‘~’ or contain a ‘.’ character » (il saute les noms qui finissent par ~ ou contiennent un point).',
		'Tu renommes le fichier en `/etc/sudoers.d/deploy`. sudo affiche maintenant `Sorry, user deploy is not allowed to execute \'/usr/bin/systemctl restart shop\' as root on web1.` La règle dit `shop.service`, le script a tapé `shop`. Quand une règle donne des arguments, ceux de la ligne de commande doivent leur correspondre.',
		'Troisième piège : un deux-points oublié après `NOPASSWD`. Sous sudo 1.9.15p5, `visudo -c -f` affiche `bad.sudoers:1:67: syntax error` et sort avec le code 1. Le fichier sudoers livré avec sudo prévient qu’éditer sans visudo « may result in syntax or file permission errors that prevent sudo from running » (peut empêcher sudo de tourner).'
	],
	terms: [
		{ term: 'UID', def: 'Le numéro que le noyau utilise pour un utilisateur ; les noms sont dans `/etc/passwd`. Un processus d’UID effectif 0, appelé root, passe outre toutes les vérifications de droits du noyau.' },
		{ term: 'Utilisateur système', def: 'Un compte pour un démon, créé par `useradd --system` avec un UID dans la plage `SYS_UID_MIN` à `SYS_UID_MAX`, sous le premier UID normal de 1000 par défaut, en général avec `/usr/sbin/nologin` comme shell. `www-data` a l’UID 33.' },
		{ term: 'Règle sudoers', def: 'Une ligne `qui où = (en_tant_que) tags: commandes`, comme `%sudo ALL=(ALL:ALL) ALL`. `%` désigne un groupe, et la partie `(user:group)` dit sous quelle identité la commande peut tourner.' },
		{ term: 'visudo', def: 'L’enveloppe d’édition des fichiers sudoers. Elle verrouille le fichier, analyse ta modification et refuse de l’installer tant qu’il reste une erreur de syntaxe.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['cmd["deploy (UID 1001) lance : sudo systemctl restart shop.service"] --> sudo["/usr/bin/sudo, setuid root : tourne avec l’UID effectif 0"]'],
				highlight: ['cmd', 'sudo'],
				note: '`/usr/bin/sudo` a le mode `4755` : le bit setuid le fait tourner avec l’UID du propriétaire du fichier, 0, quel que soit l’utilisateur qui le lance. Avant de lancer quoi que ce soit, il vérifie que `deploy` a droit à cette commande précise.'
			},
			{
				add: ['sudo --> read["Lit /etc/sudoers, puis /etc/sudoers.d/* par ordre lexical"]', 'read -.->|"sautés"| skip["deploy.conf, deploy~"]'],
				highlight: ['read', 'skip'],
				note: 'sudo analyse `/etc/sudoers`. Sa ligne `@includedir /etc/sudoers.d` ajoute chaque fichier du dossier, triés par nom, sauf ceux dont le nom contient un `.` ou finit par `~`. `/etc/sudoers.d/deploy.conf` n’est jamais lu, et rien ne te prévient.'
			},
			{
				add: ['read --> match{"Règles de deploy sur cet hôte : la dernière qui correspond gagne"}', 'match -->|"chemin et arguments identiques"| ok["NOPASSWD : pas de mot de passe"]', 'match -->|"aucune"| deny["Sorry, user deploy is not allowed to execute ..."]'],
				highlight: ['match', 'ok', 'deny'],
				note: 'sudo compare dans l’ordre chaque règle pour `deploy` et cet hôte, et retient la dernière qui correspond. Une commande s’écrit avec son chemin complet. Si la règle donne des arguments, ceux de l’utilisateur doivent leur correspondre, et `""` n’autorise aucun argument.'
			},
			{
				add: ['ok --> run["systemctl tourne en UID 0, la commande est journalisée"]'],
				highlight: ['run'],
				note: 'Avec `NOPASSWD:`, sudo lance la commande tout de suite. Sans lui, sudo demande le mot de passe de `deploy` lui-même, puis ne le redemande plus pendant 5 minutes (`timestamp_timeout`). La règle `root ALL=(ALL:ALL) ALL` permet à root d’utiliser sudo lui aussi.'
			}
		]
	},
	example: {
		title: 'plugins/sudoers/sudoers.in : les règles utilisateur du fichier sudoers livré avec sudo',
		repo: 'sudo-project/sudo',
		url: `${SUDOERS_IN}#L119-L139`,
		lang: 'text',
		code: `##
## User privilege specification
##
root ALL=(ALL:ALL) ALL

## Uncomment to allow members of group wheel to execute any command
# %wheel ALL=(ALL:ALL) ALL

## Same thing without a password
# %wheel ALL=(ALL:ALL) NOPASSWD: ALL

## Uncomment to allow members of group sudo to execute any command
# %sudo ALL=(ALL:ALL) ALL

## Uncomment to allow any user to run sudo if they know the password
## of the user they are running the command as (root by default).
# Defaults targetpw  # Ask for the password of the target user
# ALL ALL=(ALL:ALL) ALL  # WARNING: only use this together with 'Defaults targetpw'

## Read drop-in files from @sysconfdir@/sudoers.d
@includedir @sysconfdir@/sudoers.d`,
		notes: [
			'La ligne 4 se lit : l’utilisateur `root`, sur `ALL` les hôtes, peut agir en tant que n’importe quel utilisateur et groupe `(ALL:ALL)`, pour la commande `ALL`. Toutes les autres règles du fichier ont ces quatre parties.',
			'Les lignes 7 et 13 utilisent `%` pour donner le même droit à tout un groupe. [Le sudoers packagé par Debian](' + DEBIAN_SUDOERS + '#L166) active la ligne `%sudo` : là, `usermod -aG sudo alice` donne à Alice les droits d’admin. La ligne 10 ajoute le tag `NOPASSWD:`, qui supprime la demande de mot de passe pour tout.',
			'La ligne 21 est le `@includedir` qui lit `/etc/sudoers.d`. `@sysconfdir@` est remplacé à la compilation, par `/etc` sur la plupart des distributions. Un paquet peut y déposer un fichier sans modifier `/etc/sudoers`.',
			'L’en-tête de ce fichier dit qu’il « MUST be edited with the \'visudo\' command as root ». Après une erreur de syntaxe, [whatnow()](' + VISUDO_C + '#L918-L949) de visudo demande `What now?` : `e` pour rééditer, `x` pour sortir sans enregistrer, `Q` pour enregistrer quand même, marqué `(DANGER!)`.'
		]
	},
	tradeoff: {
		gain: [
			'Une règle comme `deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart shop.service` laisse la CI faire une seule chose en root, sans mot de passe root ni clé SSH pour root.',
			'Chaque appel à sudo est journalisé avec l’utilisateur et la commande, et un refus affiche la commande exacte refusée.',
			'Un fichier par règle dans `/etc/sudoers.d/` s’ajoute ou se retire par un outil de config sans toucher à `/etc/sudoers`.'
		],
		cost: [
			'Une règle qui autorise `ALL`, un éditeur ou un shell donne root en entier : l’utilisateur peut lancer un shell root depuis cette commande.',
			'La comparaison des arguments est stricte : pour sudo, `restart shop` et `restart shop.service` sont deux commandes différentes.',
			'Un nom de fichier avec un point dans `/etc/sudoers.d/` est sauté sans avertissement : la règle a l’air de disparaître.'
		]
	},
	task: {
		prompt: 'Lis ces lignes et réponds. `/etc/passwd` : `www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin`. `/etc/group` : `sudo:x:27:alice,bob`. `/etc/sudoers.d/backup` : `backup ALL=(root) NOPASSWD: /usr/bin/rsync -a /srv/ /mnt/backup/`. (1) Que disent les 7 champs de la ligne passwd ? (2) Qui peut lancer n’importe quelle commande en root ? (3) `backup` peut-il lancer `sudo rsync -a /srv/ /tmp/x/` ? (4) Quelle commande vérifie le fichier sudoers après ta modification ?',
		hint: 'passwd(5) donne les champs dans l’ordre `name:password:UID:GID:GECOS:directory:shell`. Les arguments d’une règle sudoers doivent correspondre.',
		answer: [
			'(1) Nom `www-data`, mot de passe `x` (l’empreinte est dans `/etc/shadow`), UID 33, GID 33, commentaire `www-data`, dossier `/var/www`, shell `/usr/sbin/nologin` : personne ne peut ouvrir un shell avec ce compte.',
			'(2) `alice` et `bob`, si `/etc/sudoers` contient `%sudo ALL=(ALL:ALL) ALL` comme sur Debian. Ils sont dans le groupe `sudo` (GID 27) et tapent leur propre mot de passe.',
			'(3) Non. La règle fixe les arguments `-a /srv/ /mnt/backup/`, et `/tmp/x/` ne correspond pas : sudo affiche `Sorry, user backup is not allowed to execute ...`.',
			'(4) `visudo -c` vérifie `/etc/sudoers` et ses inclusions. `visudo -c -f /etc/sudoers.d/backup` vérifie un seul fichier et affiche `parsed OK` ou la ligne et la colonne de l’erreur.'
		],
		steps: [
			{
				title: 'Lis la ligne passwd',
				questions: [
					{ q: 'Dans `www-data:x:33:33:...`, que veut dire le `x` du deuxième champ ?', options: ['Le mot de passe est vide', 'Le compte est verrouillé pour toujours', 'L’empreinte du mot de passe est dans `/etc/shadow`', 'L’utilisateur peut lancer des programmes setuid'], answer: 2, why: 'Le deuxième champ est le mot de passe, et `x` renvoie vers `/etc/shadow`, où vit l’empreinte.' },
					{ q: 'Quels champs sont l’UID et le GID ?', options: ['Le troisième et le quatrième : 33 et 33', 'Le premier et le deuxième', 'Le cinquième et le sixième', 'Seulement le troisième : UID et GID le partagent'], answer: 0, why: 'passwd(5) donne `name:password:UID:GID:GECOS:directory:shell`.' },
					{ q: 'Que disent `/var/www` et `/usr/sbin/nologin` ?', options: ['La racine web et le binaire du serveur web', 'Le dossier des logs et l’outil de rotation', 'Le dossier personnel et le shell de connexion', 'Le point de montage et son type'], answer: 2, why: 'Le sixième champ est le dossier personnel, le septième le programme lancé à la connexion.' },
					{ q: 'L’UID 33 est sous 1000. Qu’est-ce que ça laisse penser de `www-data` ?', options: ['Il a les droits de root', 'C’est un utilisateur système, fait pour un démon', 'Il ne peut posséder aucun fichier', 'Il ne peut être dans aucun groupe'], answer: 1, why: '`useradd --system` prend des UID sous le premier UID ordinaire, 1000 par défaut. Ces comptes font tourner des démons comme le serveur web.' }
				]
			},
			{
				title: 'Lis la ligne group',
				questions: [
					{ q: 'Dans `sudo:x:27:alice,bob`, que liste le dernier champ ?', options: ['Les utilisateurs qui peuvent modifier le groupe', 'Seulement les administrateurs du groupe', 'Les utilisateurs retirés', 'Les membres du groupe'], answer: 3, why: 'Le dernier champ d’une ligne group est sa liste de membres : `alice` et `bob`.' },
					{ q: 'Être dans le groupe `sudo` donne-t-il les droits root à lui seul ?', options: ['Seulement si `/etc/sudoers` a une règle `%sudo`, comme sur Debian', 'Oui, sur tous les systèmes Linux', 'Oui, car le GID 27 est un groupe système', 'Non, jamais : seul l’UID 0 peut utiliser sudo'], answer: 0, why: 'Le groupe n’est qu’un nom. Le sudoers packagé par Debian active `%sudo ALL=(ALL:ALL) ALL`, et c’est cette règle qui donne le droit.' },
					{ q: 'Que veut dire `%` dans `%sudo ALL=(ALL:ALL) ALL` ?', options: ['Un commentaire', 'Un joker pour n’importe quel utilisateur', 'Un nom de groupe suit', 'La règle ne demande pas de mot de passe'], answer: 2, why: '`%` désigne un groupe : la règle vaut pour chaque membre de `sudo`.' },
					{ q: 'Avec cette règle, quel mot de passe tapent alice et bob ?', options: ['Le mot de passe de root', 'Leur propre mot de passe', 'Aucun mot de passe', 'Le mot de passe du groupe `sudo`'], answer: 1, why: 'Sans `NOPASSWD:`, sudo demande le mot de passe de l’utilisateur appelant lui-même, puis ne le redemande plus pendant 5 minutes.' }
				]
			},
			{
				title: 'Confronte la règle de backup',
				questions: [
					{ q: 'La règle donne `/usr/bin/rsync -a /srv/ /mnt/backup/`. Que doit taper `backup` pour qu’elle corresponde ?', options: ['N’importe quelle commande `rsync`', 'Toute commande qui commence par `rsync -a`', '`rsync` vers n’importe quelle cible sous `/mnt`', 'Exactement `rsync -a /srv/ /mnt/backup/`'], answer: 3, why: 'Quand une règle donne des arguments, ceux de l’utilisateur doivent leur correspondre.' },
					{ q: '`sudo rsync -a /srv/ /tmp/x/` correspond-il ?', options: ['Non : `/tmp/x/` n’est pas `/mnt/backup/`', 'Oui : le programme est le même', 'Oui : `NOPASSWD:` accepte tous les arguments', 'Seulement après une demande de mot de passe'], answer: 0, why: 'La destination diffère, donc aucune règle ne correspond.' },
					{ q: 'Qu’affiche alors sudo ?', options: ['`backup is not in the sudoers file.`', '`Sorry, user backup is not allowed to execute ...`', '`syntax error`', '`Permission denied`'], answer: 1, why: 'L’utilisateur a des règles, mais aucune ne correspond à cette ligne de commande : sudo cite la commande refusée.' },
					{ q: 'Pourquoi la règle fixe-t-elle les arguments ?', options: ['sudo a besoin d’arguments pour trouver le binaire', 'La règle s’analyse plus vite', 'Pour que le compte fasse une seule chose précise en root', 'NOPASSWD ne marche qu’avec des arguments'], answer: 2, why: 'Comme la règle `deploy` de la CI, une règle aux arguments fixés donne une seule tâche en root, sans mot de passe root ni shell root.' }
				]
			},
			{
				title: 'Vérifie le fichier',
				questions: [
					{ q: 'Quelle commande vérifie `/etc/sudoers` et tous les fichiers qu’il inclut ?', options: ['`sudo -l`', '`visudo -c`', '`sudoedit /etc/sudoers`', '`cat /etc/sudoers`'], answer: 1, why: '`visudo -c` analyse le fichier principal et ses inclusions sans ouvrir d’éditeur.' },
					{ q: 'Et un seul fichier ?', options: ['`visudo -c -f /etc/sudoers.d/backup`', '`visudo /etc/sudoers.d/backup -n`', '`sudo -c /etc/sudoers.d/backup`', '`bash -n /etc/sudoers.d/backup`'], answer: 0, why: 'Elle affiche `parsed OK`, ou la ligne et la colonne de l’erreur avec le code de sortie 1.' },
					{ q: 'Tu oublies le deux-points après `NOPASSWD`. Qu’affiche `visudo -c -f` ?', options: ['`parsed OK`, le deux-points est facultatif', 'Un avertissement, puis il installe le fichier', 'Rien, et il sort avec 0', '`<fichier>:1:<colonne>: syntax error`'], answer: 3, why: 'L’accroche le montre : `bad.sudoers:1:67: syntax error`, code 1.' },
					{ q: 'Ton éditeur a laissé une copie nommée `/etc/sudoers.d/backup~`. sudo la lit-il ?', options: ['Oui, après `backup`', 'Oui, à la place de `backup`', 'Non : sudo saute les noms qui finissent par `~`', 'Seulement si `visudo -c` passe'], answer: 2, why: 'sudo saute les noms de fichiers de `/etc/sudoers.d` qui finissent par `~` ou contiennent un `.` : les sauvegardes d’éditeur ne deviennent jamais des règles.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Tu crées `/etc/sudoers.d/ci.rules` avec une règle valide pour l’utilisateur `ci`. `sudo` dit toujours `ci is not in the sudoers file.` Pourquoi ?',
			options: [
				'sudo ne lit `/etc/sudoers.d` qu’après un reboot',
				'sudo saute les noms de fichiers de `/etc/sudoers.d` qui ont un point',
				'Les fichiers de `/etc/sudoers.d` doivent avoir le mode `0755` pour être lus',
				'L’utilisateur `ci` doit aussi être ajouté au groupe `sudo`'
			],
			answer: 1,
			why: 'La directive `@includedir` lit chaque fichier du dossier mais saute les noms qui finissent par `~` ou contiennent un `.`, pour ignorer les fichiers temporaires des gestionnaires de paquets et des éditeurs. Renomme-le en `/etc/sudoers.d/ci`.'
		},
		{
			q: 'Deux règles correspondent : d’abord `alice ALL=(ALL) NOPASSWD: ALL`, puis `%sudo ALL=(ALL:ALL) ALL`, et Alice est dans `sudo`. Doit-elle taper un mot de passe ?',
			options: [
				'Non, car la première règle qui correspond gagne',
				'Non, car `NOPASSWD:` l’emporte sur toute autre règle',
				'Oui, car c’est la dernière règle qui correspond qui compte',
				'Oui, car les règles de groupe passent toujours avant celles d’utilisateur'
			],
			answer: 2,
			why: 'sudoers(5) : quand plusieurs entrées correspondent, « the last match is used (which is not necessarily the most specific match) ». La ligne `%sudo` vient après, donc son comportement par défaut, demander le mot de passe, s’applique.'
		},
		{
			q: 'Pourquoi `www-data` a-t-il `/usr/sbin/nologin` comme shell ?',
			options: [
				'Pour que personne n’obtienne un shell interactif avec ce compte',
				'Pour que nginx démarre sans lire `/etc/passwd`',
				'Parce que les UID sous 1000 ne peuvent posséder aucun fichier',
				'Parce que le noyau refuse `execve()` aux utilisateurs système'
			],
			answer: 0,
			why: 'Le dernier champ d’une ligne passwd est le programme lancé à la connexion. `nologin` affiche un message et sort : le compte peut posséder des fichiers et faire tourner un démon, mais une connexion en `www-data` ne donne aucun shell. Le noyau traite l’UID 33 comme n’importe quel UID non nul.'
		}
	],
	lab: {
		minutes: 10,
		goal: 'Lire de vraies lignes de comptes sur ta machine et attraper une erreur de syntaxe sudoers avec `visudo` avant qu’elle te bloque, le tout sans root.',
		steps: [
			'Lis les lignes de la tâche sur ton propre système : `getent passwd www-data`, `getent group sudo` (sous Fedora, essaie `getent group wheel`), et `id`.',
			'Regarde pourquoi sudo peut agir en root : `stat -c "%a %U %n" /usr/bin/sudo`. Sous macOS, utilise `ls -l /usr/bin/sudo`.',
			'Dans un dossier de travail, écris une bonne règle : `printf \'backup ALL=(root) NOPASSWD: /usr/bin/rsync -a /srv/ /mnt/backup/\\n\' > good`.',
			'Écris la même règle sans le deux-points après `NOPASSWD` : `printf \'backup ALL=(root) NOPASSWD /usr/bin/rsync -a /srv/ /mnt/backup/\\n\' > bad`.',
			'Vérifie les deux avec `visudo -c -f good; echo $?` et `visudo -c -f bad; echo $?`. Si `visudo` est introuvable, appelle-le par `/usr/sbin/visudo`. Puis `rm good bad`.'
		],
		done: [
			'`getent passwd www-data` affiche 7 champs qui finissent par `/usr/sbin/nologin`, si le compte existe sur ton système.',
			'`stat` affiche `4755 root /usr/bin/sudo`.',
			'`visudo -c -f good` affiche `good: parsed OK` et le code de sortie 0.',
			'`visudo -c -f bad` affiche `bad:1:64: syntax error`, un `^` en fin de ligne, et le code de sortie 1.'
		],
		solution: [
			'`4755`, c’est le bit setuid (4) plus `rwxr-xr-x` : sudo tourne avec l’UID de son propriétaire, 0, quel que soit celui qui le lance.',
			'Le `^` est à la colonne 64, en fin de ligne, pas sous `NOPASSWD` : visudo n’abandonne qu’à la fin de la ligne, donc relis toute la ligne pour trouver le `:` manquant. Un fichier comme `bad` posé à la main dans `/etc/sudoers.d/` empêcherait sudo d’analyser ses règles.',
			'`visudo -c -f` ne fait que lire le fichier, donc il marche sans root sur une copie de travail. Vérifie une règle ainsi avant de la mettre dans `/etc/sudoers.d/`, sous un nom sans point.'
		]
	},
	recall: {
		q: 'Donne deux raisons pour lesquelles une règle sudoers d’apparence correcte pour `deploy` peut être refusée.',
		a: 'Le fichier est dans `/etc/sudoers.d/` avec un point dans son nom, comme `deploy.conf`, donc sudo le saute. Ou la règle fixe des arguments, comme `restart shop.service`, et la commande tapée en a d’autres, comme `restart shop`.'
	},
	sources: [
		{ title: 'sudoers(5)', url: 'https://www.sudo.ws/docs/man/sudoers.man/' },
		{ title: 'visudo(8)', url: 'https://www.sudo.ws/docs/man/visudo.man/' },
		{ title: 'passwd(5)', url: 'https://man7.org/linux/man-pages/man5/passwd.5.html' },
		{ title: 'login.defs(5)', url: 'https://man7.org/linux/man-pages/man5/login.defs.5.html' },
		{ title: 'capabilities(7)', url: 'https://man7.org/linux/man-pages/man7/capabilities.7.html' },
		{ title: 'sudo source, plugins/sudoers/logging.c', url: LOGGING_C }
	]
};
