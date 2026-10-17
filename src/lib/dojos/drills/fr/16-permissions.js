/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'permissions',
	part: 'Le shell',
	title: 'Les permissions',
	minutes: 10,
	hook: [
		'Tu as copié une petite boutique en ligne sur le serveur, et sa tâche cron échoue avec `./deploy.sh: Permission denied`. L’application tourne sous l’utilisateur `www-data` et ne peut pas écrire son journal. Le mot de passe de la base est dans un fichier que tous les comptes du serveur peuvent lire. Tu es connecté en root, dans `/srv/shop`.',
		'`deploy.sh` et `config/db.env` sont tous deux en `-rw-r--r--`, à `alice:alice`. `releases/` et `releases/v1/` sont en `drwx------` et `releases/v1/app.js` en `-rw-------`, tous à `alice:alice`. `logs/app.log` est en `-rw-r--r--`, à `root:root`.',
		'Le groupe `deploy` existe et alice en fait partie. L’utilisateur `www-data` a un groupe de connexion du même nom. Chaque exercice repart de ces fichiers.'
	],
	terms: [
		{ term: 'mode', def: 'Les 9 bits de permission d’un fichier : lecture, écriture et exécution pour le propriétaire, pour le groupe et pour tous les autres.' },
		{ term: 'mode octal', def: 'Le mode écrit en chiffres, un par catégorie, chacun la somme de lecture (4), écriture (2) et exécution (1). `640` vaut `rw-r-----`.' },
		{ term: 'mode symbolique', def: 'Le mode écrit avec une catégorie, un opérateur et des lettres, comme `u+x` ou `go-rwx`. Il ne touche que les bits qu’il nomme.' },
		{ term: 'umask', def: 'Un masque gardé par le shell. Chaque bit présent dans le masque est retiré des fichiers et dossiers que créent les commandes de ce shell.' }
	],
	reps: [
		{
			prompt: 'Affiche `deploy.sh` au format long de `ls`, avec son mode et son propriétaire.',
			accept: ['ls -l deploy.sh', 'ls -l ./deploy.sh'],
			why: '`-l` est le format long. Le premier caractère donne le type (`-` pour un fichier normal), puis viennent 3 groupes `rwx` pour propriétaire, groupe et autres, le nombre de liens physiques, le propriétaire, le groupe, la taille en octets et la date de modification. `-rw-r--r--` n’a aucun `x`, donc le noyau refuse de lancer le script.'
		},
		{
			prompt: 'Affiche au format long le dossier `releases` lui-même, sans lister son contenu.',
			accept: ['ls -ld releases', 'ls -dl releases', 'ls -l -d releases', 'ls -d -l releases', 'ls -ld releases/', 'ls -dl releases/', 'ls -l --directory releases', 'ls --directory -l releases'],
			why: '`-d` affiche le dossier comme une seule entrée au lieu de son contenu, et `-l` donne le format long. Tu lis `drwx------` : `d` pour un dossier, et seul le propriétaire peut le lister ou y entrer.'
		},
		{
			prompt: 'Autorise le propriétaire à exécuter `deploy.sh`, sans changer aucun autre bit.',
			accept: ['chmod u+x deploy.sh', 'chmod u+x ./deploy.sh'],
			why: '`u` désigne le propriétaire, `+` ajoute des bits, `x` est l’exécution. Le mode passe de `rw-r--r--` à `rwxr--r--`. Un simple `chmod +x` ajouterait `x` aux 3 catégories, moins les bits présents dans le umask.'
		},
		{
			prompt: 'Avec un mode octal, mets `deploy.sh` en `rwxr-xr-x`.',
			accept: ['chmod 755 deploy.sh', 'chmod 0755 deploy.sh', 'chmod 755 ./deploy.sh'],
			why: 'Chaque chiffre additionne lecture (4), écriture (2) et exécution (1) pour une catégorie. `rwx` pour le propriétaire fait 4+2+1 = 7, `r-x` pour le groupe fait 4+1 = 5, et pareil pour les autres. Un mode octal fixe les 9 bits d’un coup, quelle que soit leur valeur avant.'
		},
		{
			prompt: 'Avec un mode octal, fais que `config/db.env` soit lisible et modifiable par son propriétaire, et par personne d’autre.',
			accept: ['chmod 600 config/db.env', 'chmod 0600 config/db.env', 'chmod 600 ./config/db.env'],
			why: '`6` additionne lecture (4) et écriture (2) pour le propriétaire, et les deux `0` ne donnent rien au groupe ni aux autres. `ls -l` affiche ensuite `-rw-------`.'
		},
		{
			prompt: 'Avec un mode symbolique, retire toutes les permissions du groupe et des autres sur `config/db.env`, de sorte que le propriétaire garde `rw-`.',
			accept: [
				'chmod go-rwx config/db.env',
				'chmod og-rwx config/db.env',
				'chmod go= config/db.env',
				'chmod og= config/db.env',
				'chmod g-rwx,o-rwx config/db.env',
				'chmod o-rwx,g-rwx config/db.env',
				'chmod g=,o= config/db.env',
				'chmod o=,g= config/db.env'
			],
			why: '`go` vise le groupe et les autres, et `-rwx` leur retire lecture, écriture et exécution. `go=` fait pareil : `=` fixe exactement les lettres qui suivent, et ici il n’y en a aucune. Le propriétaire garde `rw-`, et le fichier finit en `600`.'
		},
		{
			prompt: 'Récursivement, laisse le groupe lire chaque fichier sous `releases` et entrer dans chaque dossier, sans rendre les fichiers normaux exécutables.',
			accept: [
				'chmod -R g+rX releases',
				'chmod -R g+Xr releases',
				'chmod -R g+rX releases/',
				'chmod --recursive g+rX releases',
				'chmod --recursive g+Xr releases',
				'chmod g+rX -R releases',
				'chmod -R g+r,g+X releases'
			],
			why: '`-R` parcourt tout l’arbre. Le `X` majuscule ajoute l’exécution seulement aux dossiers et aux fichiers qui ont déjà un `x` pour quelqu’un. `releases/v1/` reçoit donc `r-x` pour le groupe et `app.js` reçoit `r--`.'
		},
		{
			prompt: 'Donne `logs/app.log` à l’utilisateur `www-data`, avec `www-data` comme groupe.',
			accept: ['chown www-data:www-data logs/app.log', 'chown www-data: logs/app.log', 'chown www-data:www-data ./logs/app.log'],
			why: '`chown PROPRIÉTAIRE:GROUPE` change les deux en un appel. Avec `www-data:` sans rien après les deux-points, chown prend le groupe de connexion de cet utilisateur, qui s’appelle aussi `www-data` ici.'
		},
		{
			prompt: 'Change seulement le groupe de `releases` et de tout ce qu’il contient, pour `deploy`.',
			accept: [
				'chgrp -R deploy releases',
				'chgrp --recursive deploy releases',
				'chgrp -R deploy releases/',
				'chown -R :deploy releases',
				'chown --recursive :deploy releases',
				'chown -R :deploy releases/'
			],
			why: '`chgrp deploy` change le groupe et laisse `alice` comme propriétaire. `chown :deploy` fait la même chose, car un propriétaire absent avant les deux-points reste tel quel. `-R` l’applique à chaque fichier et dossier de l’arbre.'
		},
		{
			prompt: 'Règle le umask de ce shell pour que les nouveaux fichiers sortent en `rw-r-----` et les nouveaux dossiers en `rwxr-x---`.',
			accept: ['umask 027', 'umask 0027', 'umask u=rwx,g=rx,o='],
			why: 'Le umask liste les bits à retirer : `0` laisse tout au propriétaire, `2` retire l’écriture au groupe, `7` retire tout aux autres. Ensuite, `touch new.txt` crée un fichier en `640` et `mkdir newdir` un dossier en `750`. Le réglage ne vaut que pour le shell courant.'
		},
		{
			prompt: 'Affiche seulement le mode octal de `config/db.env`, par exemple `644`.',
			accept: [
				'stat -c %a config/db.env',
				"stat -c '%a' config/db.env",
				'stat -c "%a" config/db.env',
				'stat --format=%a config/db.env',
				"stat --format='%a' config/db.env",
				'stat --format="%a" config/db.env',
				'stat --format %a config/db.env'
			],
			why: '`-c` donne à stat un format à la place de son long rapport par défaut. `%a` sort les bits de permission en octal : `644` avant ta correction, `600` après.'
		},
		{
			prompt: 'Affiche le nom du propriétaire et le nom du groupe de `logs/app.log`, séparés par deux-points, par exemple `root:root`.',
			accept: [
				'stat -c %U:%G logs/app.log',
				"stat -c '%U:%G' logs/app.log",
				'stat -c "%U:%G" logs/app.log',
				'stat --format=%U:%G logs/app.log',
				"stat --format='%U:%G' logs/app.log",
				'stat --format="%U:%G" logs/app.log',
				'stat --format %U:%G logs/app.log'
			],
			why: '`%U` sort le nom d’utilisateur du propriétaire et `%G` le nom du groupe. Le reste du format, ici le `:`, s’affiche tel quel.'
		}
	],
	quiz: [],
	recall: {
		q: 'Dans `chmod 640 config/db.env`, que donne chacun des 3 chiffres, et à qui ?',
		a: '6 = lecture (4) + écriture (2) pour le propriétaire, 4 = lecture pour le groupe, 0 = rien pour les autres : `rw-r-----`.'
	},
	sources: [
		{ title: 'Page de manuel chmod(1)', url: 'https://man7.org/linux/man-pages/man1/chmod.1.html' },
		{ title: 'Page de manuel chown(1)', url: 'https://man7.org/linux/man-pages/man1/chown.1.html' },
		{ title: 'Page de manuel stat(1)', url: 'https://man7.org/linux/man-pages/man1/stat.1.html' },
		{ title: 'Page de manuel ls(1)', url: 'https://man7.org/linux/man-pages/man1/ls.1.html' },
		{ title: 'Page de manuel umask(1p), POSIX', url: 'https://man7.org/linux/man-pages/man1/umask.1p.html' },
		{ title: 'Page de manuel umask(2)', url: 'https://man7.org/linux/man-pages/man2/umask.2.html' }
	]
};
