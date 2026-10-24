const LINUX = 'https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a';
const SYSTEMD = 'https://github.com/systemd/systemd/blob/84b71c1525e792c2ba44670d2171386af8605edd';
const REDIS = 'https://github.com/redis/redis/blob/e0bb9316848db7950c2b18cdc59c2058f62b8a3d';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'sysctl',
	part: 'Le système en marche',
	title: 'Les paramètres du noyau',
	minutes: 10,
	hook: [
		'Tu démarres Redis sur un serveur dont le noyau est antérieur à 5.4, et il écrit dans son log : "WARNING: The TCP backlog setting of 511 cannot be enforced because /proc/sys/net/core/somaxconn is set to the lower value of 128."',
		'Redis demande au noyau une file de 511 connexions en attente d’`accept()` (`tcp-backlog 511` dans son `redis.conf` par défaut). La page de manuel listen(2) dit ce que le noyau fait d’une demande plus grande : "it is silently capped to that value", il la ramène à cette valeur sans rien dire. `listen()` renvoie quand même 0. Redis lit lui-même le fichier pour te prévenir, le noyau ne logue rien.',
		'`/proc/sys/net/core/somaxconn` fait partie des paramètres du noyau rangés sous `/proc/sys`. Tu les lis et les modifies avec `sysctl`. **Une valeur écrite là disparaît au prochain démarrage**, sauf si un fichier de `/etc/sysctl.d` la remet.'
	],
	terms: [
		{ term: 'Paramètre du noyau', def: 'Un réglage que le noyau en marche expose sous forme de fichier dans `/proc/sys`, par exemple `/proc/sys/net/core/somaxconn`. Son nom sysctl prend des points : `net.core.somaxconn`.' },
		{ term: 'sysctl', def: 'La commande de procps-ng qui lit et écrit les paramètres du noyau : `sysctl net.core.somaxconn` lit, `sysctl -w net.core.somaxconn=4096` écrit, `sysctl --system` charge tous les fichiers de configuration.' },
		{ term: '`/etc/sysctl.d`', def: 'Un dossier de fichiers `.conf` avec des lignes comme `net.core.somaxconn = 4096`. Au démarrage, `systemd-sysctl.service` les applique avec ceux de `/run/sysctl.d`, `/usr/local/lib/sysctl.d` et `/usr/lib/sysctl.d`.' },
		{ term: 'Listen backlog', def: 'La longueur de la file des connexions que le noyau a acceptées pour une socket en écoute et que le programme n’a pas encore prises avec `accept()`. Le programme la demande dans `listen(fd, backlog)`.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['admin["sysctl -w net.core.somaxconn=4096"] -->|"écrit 4096"| file["/proc/sys/net/core/somaxconn"]'],
				highlight: ['admin', 'file'],
				note: 'sysctl(8) fait correspondre le nom à un fichier : les paramètres "are those listed under /proc/sys/". En root, `echo 4096 > /proc/sys/net/core/somaxconn` fait la même écriture. La nouvelle valeur s’applique tout de suite, sans redémarrage.'
			},
			{
				add: ['file --> var["sysctl_somaxconn de ce namespace réseau"]'],
				highlight: ['var'],
				note: 'Le noyau déclare `somaxconn` dans `netns_core_table`, dans `net/core/sysctl_net_core.c`. Chaque namespace réseau a sa propre copie de la valeur. Sur l’hôte, `sysctl -w` ne change que la copie du namespace de l’hôte.'
			},
			{
				add: ['redis["Redis : listen(fd, 511)"] --> cap["__sys_listen_socket : si backlog > somaxconn, backlog = somaxconn"]', 'var --> cap'],
				highlight: ['redis', 'cap'],
				note: 'Dans `net/socket.c`, lignes 1887 à 1889, le noyau lit `sysctl_somaxconn` et y ramène tout backlog plus grand. Avec `somaxconn` à 128, Redis obtient 128 et `listen()` renvoie 0. Le plafond s’applique au moment du `listen()` : une socket déjà en écoute garde son ancienne longueur de file tant que le programme ne rappelle pas `listen()`.'
			},
			{
				add: ['boot["Redémarrage"] -->|"retour à SOMAXCONN = 4096"| var', 'conf["/etc/sysctl.d/90-redis.conf"] -->|"systemd-sysctl.service au démarrage"| file'],
				highlight: ['boot', 'conf'],
				note: 'La valeur posée par `sysctl -w` n’existe que dans la mémoire du noyau. Après un redémarrage, tu retrouves la valeur compilée, `SOMAXCONN` : 4096 depuis Linux 5.4, 128 avant. Une ligne dans un fichier de `/etc/sysctl.d` est réappliquée tôt à chaque démarrage par `systemd-sysctl.service`.'
			},
			{
				add: ['pod["Nouveau conteneur : son propre namespace réseau"] -->|"démarre à 4096"| var'],
				highlight: ['pod'],
				note: 'Le noyau pose `sysctl_somaxconn = SOMAXCONN` pour chaque nouveau namespace réseau (`preinit_net_sysctl` dans `net/core/net_namespace.c`). Un conteneur n’hérite pas de la valeur de l’hôte. Dans Kubernetes, tu la règles par pod dans `securityContext.sysctls`, et le nœud doit l’autoriser avec `kubelet --allowed-unsafe-sysctls`.'
			}
		]
	},
	example: {
		title: 'src/core/main.c : systemd relève fs.file-max au démarrage',
		repo: 'systemd/systemd',
		url: `${SYSTEMD}/src/core/main.c#L1364-L1383`,
		lang: 'c',
		code: `static void bump_file_max_and_nr_open(void) {

        /* Let's bump fs.file-max and fs.nr_open to their respective maximums. On current kernels large
         * numbers of file descriptors are no longer a performance problem and their memory is properly
         * tracked by memcg, thus counting them and limiting them in another two layers of limits is
         * unnecessary and just complicates things. This function hence turns off 2 of the 4 levels of limits
         * on file descriptors, and makes RLIMIT_NOLIMIT (soft + hard) the only ones that really matter. */

#if BUMP_PROC_SYS_FS_FILE_MAX || BUMP_PROC_SYS_FS_NR_OPEN
        int r;
#endif

#if BUMP_PROC_SYS_FS_FILE_MAX
        /* The maximum the kernel allows for this since 5.2 is LONG_MAX, use that. (Previously things were
         * different, but the operation would fail silently.) */
        r = sysctl_write("fs/file-max", LONG_MAX_STR);
        if (r < 0)
                log_full_errno(ERRNO_IS_NEG_FS_WRITE_REFUSED(r) ? LOG_DEBUG : LOG_WARNING, r,
                               "Failed to bump fs.file-max, ignoring: %m");
#endif`,
		notes: [
			'La ligne 16 écrit le plus grand `long` dans `fs/file-max`. `sysctl_write` aboutit à [`sysctl_write_full`](' + SYSTEMD + '/src/basic/sysctl-util.c#L80-L100), qui colle `/proc/sys/` devant le nom et écrit la chaîne dans ce fichier. systemd passe par la même interface fichier que `sysctl -w`.',
			'`fs.file-max` est le nombre de fichiers ouverts que le noyau entier acceptera d’allouer. Une fois atteint, [`alloc_empty_file`](' + LINUX + '/fs/file_table.c#L191-L230) renvoie `ENFILE` et logue "VFS: file-max limit <number> reached". Un processus qui a `CAP_SYS_ADMIN` peut dépasser la limite.',
			'Sans l’écriture de systemd, le noyau calcule `file-max` au démarrage pour ne pas consacrer plus de 10 % de la mémoire aux fichiers, à environ 1 Ko par fichier (`files_maxfiles_init`, lignes 535 à 549 du même fichier).',
			'Les lignes 3 à 7 donnent la raison : avec file-max et nr_open au maximum, la limite qui compte est `RLIMIT_NOFILE`, par processus (chapitre 5). Sur la machine où ce chapitre a été écrit (noyau 6.17), `sysctl fs.file-max` affiche `9223372036854775807`.'
		]
	},
	tradeoff: {
		gain: [
			'Tu changes le comportement du noyau sur un serveur en marche avec une écriture dans `/proc/sys`, sans redémarrage ni recompilation du noyau.',
			'Les paquets posent leurs réglages dans `/usr/lib/sysctl.d`, et tes fichiers de `/etc/sysctl.d` passent devant : un fichier du même nom remplace celui du paquet, un nom trié plus loin écrase des clés une par une.'
		],
		cost: [
			'Une valeur posée avec `sysctl -w` est perdue au prochain redémarrage. Le serveur revient avec l’ancien comportement tant que personne ne l’écrit dans `/etc/sysctl.d`.',
			'Les paramètres `net.*` existent par namespace réseau. Monter `net.core.somaxconn` sur l’hôte ne le change pas dans un conteneur.',
			'Le noyau plafonne un backlog de `listen()` trop grand sans erreur ni ligne de log. Tu ne le vois que si le programme affiche lui-même un avertissement, comme Redis.',
			'`systemd-sysctl.service` tourne tôt au démarrage. Un paramètre qui n’apparaît qu’au chargement d’un module du noyau n’est pas réglé, sauf si une règle udev ou `modules-load.d` charge le module avant.'
		]
	},
	task: {
		prompt: 'Sur une machine Linux, lance `sysctl net.core.somaxconn fs.file-max fs.file-nr` et `ls /usr/lib/sysctl.d /etc/sysctl.d`. Dis ce que veut dire chaque nombre. Écris ensuite le fichier qui règle `net.core.somaxconn` à 8192 à chaque démarrage, la commande qui l’applique tout de suite et celle qui le vérifie.',
		hint: '`fs.file-nr` contient trois nombres, décrits dans la page `admin-guide/sysctl/fs` de la doc du noyau. Pour le nom du fichier, la doc de systemd conseille un préfixe à deux chiffres entre 60 et 90 dans `/etc`.',
		answer: [
			'Sortie sur la machine où ce chapitre a été écrit (noyau 6.17) : `net.core.somaxconn = 4096`, `fs.file-max = 9223372036854775807`, `fs.file-nr = 17099 0 9223372036854775807`. 4096 est la valeur par défaut du noyau depuis 5.4. L’énorme file-max vient de l’écriture `LONG_MAX` de systemd vue dans l’exemple.',
			'`fs.file-nr` donne : les descripteurs de fichiers alloués (17099), ceux alloués mais libres (toujours 0 depuis Linux 2.6), et le maximum (file-max).',
			'Crée `/etc/sysctl.d/90-somaxconn.conf` avec une seule ligne : `net.core.somaxconn = 8192`. Applique tous les fichiers avec `sudo sysctl --system`, ou celui-ci seul avec `sudo sysctl -p /etc/sysctl.d/90-somaxconn.conf`. Vérifie avec `sysctl net.core.somaxconn` ou `cat /proc/sys/net/core/somaxconn`.',
			'Redémarre Redis ensuite. Sa socket a reçu sa longueur de file au moment de son `listen()`, donc la nouvelle valeur ne touche que les sockets qui appellent `listen()` après le changement.'
		],
		steps: [
			{
				title: 'Lis les nombres',
				questions: [
					{ q: '`net.core.somaxconn = 4096`. Que limite 4096 ?', options: ['Le nombre de sockets qu’un processus peut ouvrir', 'La plus longue file d’attente qu’un `listen()` peut obtenir', 'Le nombre de connexions TCP de toute la machine', 'La taille en octets du tampon de réception de chaque socket'], answer: 1, why: 'Un backlog de `listen()` plus grand que `somaxconn` est ramené à cette valeur. 4096 est la valeur par défaut du noyau depuis Linux 5.4.' },
					{ q: '`fs.file-max = 9223372036854775807`. Pourquoi est-ce si grand ?', options: ['Le noyau l’a calculé à partir de 10 % de la mémoire', 'Un admin l’a monté à la main après un crash', 'systemd y a écrit `LONG_MAX` au démarrage', 'Il n’est pas réglé, et le noyau affiche le maximum du type'], answer: 2, why: '`bump_file_max_and_nr_open` de systemd écrit le plus grand `long` dans `fs/file-max`. Sans cette écriture, le noyau le calculerait à partir de la mémoire.' },
					{ q: '`fs.file-nr = 17099 0 9223372036854775807`. Que vaut 17099 ?', options: ['Les descripteurs de fichiers alloués en ce moment', 'Les fichiers ouverts depuis le démarrage', 'Les descripteurs libres restants avant la limite', 'Les fichiers ouverts du shell courant'], answer: 0, why: 'Le premier nombre de `fs.file-nr` compte les descripteurs alloués. Le troisième est le maximum, le même que `fs.file-max`.' },
					{ q: 'Et le 0 au milieu de `fs.file-nr` ?', options: ['Les ouvertures ratées depuis le démarrage', 'Les processus qui ont atteint leur `RLIMIT_NOFILE`', 'Les fichiers que le noyau doit encore fermer', 'Les descripteurs alloués mais libres, toujours 0 depuis Linux 2.6'], answer: 3, why: 'La doc du noyau sur `/proc/sys/fs` le dit : depuis Linux 2.6, ce nombre vaut toujours 0. Ce n’est pas une erreur, les descripteurs alloués sont tous utilisés.' }
				]
			},
			{
				title: 'Lis les dossiers de config',
				questions: [
					{ q: 'Qui applique les fichiers de `/etc/sysctl.d` et `/usr/lib/sysctl.d` au démarrage ?', options: ['Le noyau, avant de monter le système de fichiers racine', '`systemd-sysctl.service`, tôt dans le démarrage', 'La commande `sysctl`, lancée par cron au démarrage', 'Le script post-installation de chaque paquet'], answer: 1, why: '`systemd-sysctl.service` lit les dossiers `sysctl.d` tôt à chaque démarrage et écrit chaque clé dans `/proc/sys`.' },
					{ q: 'Qui est censé poser des fichiers dans `/usr/lib/sysctl.d` ?', options: ['Toi, pour des réglages qui survivent aux mises à jour', 'Le noyau, quand un module se charge', 'Les paquets, pour leurs réglages par défaut', 'systemd, pour garder les valeurs posées avec `sysctl -w`'], answer: 2, why: 'Les paquets livrent leurs réglages dans `/usr/lib/sysctl.d`. Tes fichiers vont dans `/etc/sysctl.d` et passent devant.' },
					{ q: 'Un fichier de `/etc/sysctl.d` porte le même nom qu’un fichier de `/usr/lib/sysctl.d`. Que se passe-t-il ?', options: ['Le fichier de `/etc` remplace celui du paquet', 'Les deux sont appliqués, `/usr/lib` en dernier', 'systemd refuse de démarrer tant qu’il en reste deux', 'Seules les clés absentes du fichier du paquet sont prises'], answer: 0, why: 'Même nom : le fichier de `/etc` gagne et celui du paquet n’est pas lu. Avec des noms différents, c’est le dernier dans l’ordre de tri qui gagne pour chaque clé.' },
					{ q: 'Quelle plage de préfixes à deux chiffres la doc de systemd conseille-t-elle dans `/etc` ?', options: ['00 à 09', '10 à 40', '95 à 99', '60 à 90'], answer: 3, why: 'sysctl.d(5) conseille 10 à 40 pour les fichiers des paquets et 60 à 90 pour les tiens, pour que les tiens soient triés après.' }
				]
			},
			{
				title: 'Écris le fichier',
				questions: [
					{ q: 'Pourquoi ne pas simplement lancer `sysctl -w net.core.somaxconn=8192` ?', options: ['`sysctl -w` ne marche que sur les noyaux avant 5.4', 'La valeur ne s’applique qu’après un redémarrage', 'La valeur est perdue au prochain redémarrage', '`sysctl -w` ne peut pas écrire les clés `net.*`'], answer: 2, why: 'Une valeur écrite avec `sysctl -w` vit seulement dans la mémoire du noyau. Après un redémarrage, le noyau repart de sa valeur compilée.' },
					{ q: 'Où va le fichier ?', options: ['`/etc/sysctl.d/90-somaxconn.conf`', '`/usr/lib/sysctl.d/90-somaxconn.conf`', '`/proc/sys/net/core/somaxconn.conf`', '`/run/sysctl.d/somaxconn`'], answer: 0, why: '`/etc/sysctl.d` est fait pour les réglages locaux, et le suffixe `.conf` avec un préfixe entre 60 et 90 suit sysctl.d(5).' },
					{ q: 'Quelle ligne contient-il ?', options: ['`/proc/sys/net/core/somaxconn = 8192`', '`sysctl -w net.core.somaxconn=8192`', '`somaxconn: 8192`', '`net.core.somaxconn = 8192`'], answer: 3, why: 'Une ligne de `sysctl.d`, c’est le nom avec des points, `=`, puis la valeur. Le nom avec des points correspond au fichier sous `/proc/sys`.' },
					{ q: 'Redis tourne dans un conteneur sur ce serveur. Le fichier de l’hôte monte-t-il `somaxconn` dedans ?', options: ['Oui, chaque conteneur lit le `/etc/sysctl.d` de l’hôte', 'Non, chaque namespace réseau démarre de son côté à 4096', 'Oui, mais seulement après reconstruction de l’image', 'Non, un conteneur ne peut pas avoir de paramètres `net.*`'], answer: 1, why: 'Les valeurs `net.*` sont propres à chaque namespace réseau, et un nouveau démarre à `SOMAXCONN`. Règle-la par conteneur, par exemple avec `securityContext.sysctls`.' }
				]
			},
			{
				title: 'Applique et vérifie',
				questions: [
					{ q: 'Quelle commande charge tout de suite tous les fichiers `sysctl.d`, sans redémarrer ?', options: ['`sudo sysctl --system`', '`sudo systemctl daemon-reload`', '`sudo sysctl -a`', '`sudo modprobe sysctl`'], answer: 0, why: '`sysctl --system` lit tous les dossiers de config dans le même ordre qu’au démarrage. `sysctl -a` ne fait qu’afficher les valeurs.' },
					{ q: 'Quelle commande applique seulement ton nouveau fichier ?', options: ['`sudo sysctl -w /etc/sysctl.d/90-somaxconn.conf`', '`sudo sysctl -n /etc/sysctl.d/90-somaxconn.conf`', '`sudo sysctl -p /etc/sysctl.d/90-somaxconn.conf`', '`sudo cat /etc/sysctl.d/90-somaxconn.conf > /proc/sys`'], answer: 2, why: '`sysctl -p <fichier>` charge les réglages de ce seul fichier.' },
					{ q: 'Comment vérifies-tu la valeur en cours ?', options: ['`grep somaxconn /etc/sysctl.d/*.conf`', '`cat /proc/sys/net/core/somaxconn`', '`systemctl status systemd-sysctl`', '`journalctl -k | grep somaxconn`'], answer: 1, why: 'Le fichier sous `/proc/sys`, ou `sysctl net.core.somaxconn`, montre ce que le noyau utilise maintenant. Le fichier de config dit seulement ce que tu as demandé.' },
					{ q: 'Redis tournait déjà avant le changement. Que fais-tu encore ?', options: ['Rien, sa file grandit à la prochaine connexion', 'Relancer `sysctl --system` une deuxième fois', 'Redémarrer la machine, car les sockets lisent la valeur au boot', 'Redémarrer Redis pour qu’il rappelle `listen()`'], answer: 3, why: 'Le plafond s’applique au moment du `listen()`. Une socket déjà en écoute garde son ancienne longueur de file.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Redis a `tcp-backlog 1024` et `/proc/sys/net/core/somaxconn` contient 128. Que se passe-t-il quand Redis appelle `listen()` ?',
			options: [
				'`listen()` échoue avec `EINVAL` et Redis s’arrête au démarrage',
				'`listen()` renvoie 0 et la file est plafonnée à 128 sans un mot',
				'Le noyau monte `somaxconn` à 1024 pour toute la machine',
				'Le noyau garde 1024 et écrit un avertissement dans `dmesg`'
			],
			answer: 1,
			why: '`__sys_listen_socket`, dans `net/socket.c`, remplace tout backlog plus grand que `somaxconn` par `somaxconn` et continue. Aucune erreur n’est renvoyée et le noyau n’écrit rien dans le log. L’avertissement vient de Redis, qui lit le fichier lui-même.'
		},
		{
			q: '`/usr/lib/sysctl.d/99-vendor.conf` pose `net.core.somaxconn = 512`. Tu ajoutes `/etc/sysctl.d/60-local.conf` avec `net.core.somaxconn = 1024`. Quelle valeur a le serveur après un redémarrage ?',
			options: [
				'1024, car les fichiers de `/etc` passent toujours devant ceux de `/usr/lib`',
				'1024, car `/etc/sysctl.conf` est lu avant les autres fichiers',
				'512, car `99-vendor.conf` est trié après `60-local.conf` et appliqué plus tard',
				'4096, car `systemd-sysctl` refuse deux fichiers qui posent la même clé'
			],
			answer: 2,
			why: 'Tous les fichiers sont triés par nom, tous dossiers confondus, et pour une clé c’est le dernier dans l’ordre lexicographique qui gagne. `/etc` ne passe devant qu’un fichier du même nom. C’est pour ça que sysctl.d(5) conseille 10 à 40 pour les fichiers des paquets et 60 à 90 pour les tiens.'
		},
		{
			q: 'Tu lances `sysctl -w net.core.somaxconn=8192` sur un hôte Docker et tu redémarres le conteneur Redis. Redis y voit toujours une valeur plus basse. Pourquoi ?',
			options: [
				'Docker ne copie les valeurs de l’hôte dans un conteneur qu’au démarrage du démon',
				'La valeur demande un redémarrage avant qu’un processus puisse la lire',
				'Le conteneur voit la valeur de l’hôte seulement après reconstruction de l’image',
				'Le conteneur a son propre namespace réseau, qui démarre à 4096'
			],
			answer: 3,
			why: '`somaxconn` est stocké par namespace réseau, et `preinit_net_sysctl` le met à `SOMAXCONN` (4096) pour chaque nouveau namespace. L’écriture sur l’hôte n’a changé que le namespace de l’hôte. Règle-le pour le conteneur, par exemple avec `securityContext.sysctls` dans un pod Kubernetes.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Voir le noyau plafonner un backlog de `listen()` sans erreur, faire râler Redis, et écrire le fichier qui garde une valeur après un redémarrage.',
		steps: [
			'Lis les valeurs : `sysctl net.core.somaxconn fs.file-max fs.file-nr`, puis `cat /proc/sys/net/core/somaxconn`.',
			'Demande un backlog de 10000 et regarde ce que tu obtiens : `python3 -c \'import socket,subprocess; s=socket.socket(); s.bind(("127.0.0.1",8099)); s.listen(10000); print(subprocess.run(["ss","-lnt","sport = :8099"],capture_output=True,text=True).stdout)\'`.',
			'Lance Redis dans un conteneur dont le namespace réseau a `somaxconn` à 128 : `docker run --rm --sysctl net.core.somaxconn=128 redis:7-alpine sh -c \'redis-server --daemonize yes --logfile /tmp/r.log; sleep 1; grep -i backlog /tmp/r.log; cat /proc/sys/net/core/somaxconn\'`.',
			'Relance la même commande sans `--sysctl net.core.somaxconn=128`, puis `cat /proc/sys/net/core/somaxconn` sur l’hôte.',
			'Écris le fichier qui réglerait 8192 à chaque démarrage : `mkdir -p ~/sysctl-lab && printf \'net.core.somaxconn = 8192\\n\' > ~/sysctl-lab/90-somaxconn.conf`, puis essaie-le en simple utilisateur : `sysctl -p ~/sysctl-lab/90-somaxconn.conf; sysctl net.core.somaxconn`.'
		],
		done: [
			'À l’étape 2, la colonne `Send-Q` de la ligne `LISTEN` affiche 4096 (ton `somaxconn`), pas 10000, et Python n’a affiché aucune erreur.',
			'À l’étape 3, Redis écrit « The TCP backlog setting of 511 cannot be enforced because /proc/sys/net/core/somaxconn is set to the lower value of 128 », et le conteneur lit 128.',
			'À l’étape 4, Redis n’écrit aucun avertissement sur le backlog, le conteneur lit 4096, et la valeur de l’hôte n’a pas bougé.',
			'À l’étape 5, `sysctl -p` affiche `permission denied on key "net.core.somaxconn", ignoring` (puis répète la ligne lue, `= 8192`), et le dernier `sysctl net.core.somaxconn` affiche toujours 4096.'
		],
		solution: [
			'Pour une socket en écoute, `ss -lnt` montre le backlog dans `Send-Q`. Le noyau a ramené 10000 à `somaxconn` dans `__sys_listen_socket`, et `listen()` a renvoyé 0.',
			'`--sysctl` règle la valeur dans le namespace réseau du conteneur. Sans lui, le namespace démarre à `SOMAXCONN`, 4096, quelle que soit la valeur de l’hôte.',
			'`sysctl -p` a lu ton fichier et tenté de l’écrire, mais écrire dans `/proc/sys` demande root, donc il a ignoré la clé. Sur une machine à toi, copie le fichier dans `/etc/sysctl.d/90-somaxconn.conf`, lance `sudo sysctl --system` et vérifie avec `sysctl net.core.somaxconn`.'
		]
	},
	recall: {
		q: 'Un programme appelle `listen(fd, 511)` alors que `net.core.somaxconn` vaut 128. Quelle longueur de file obtient-il, et où mets-tu une valeur qui survit au redémarrage ?',
		a: '128 : le noyau plafonne le backlog dans `__sys_listen_socket`, sans erreur. Pour garder une nouvelle valeur, écris `net.core.somaxconn = 4096` dans un fichier `.conf` de `/etc/sysctl.d`, appliqué au démarrage par `systemd-sysctl.service` ou tout de suite par `sysctl --system`.'
	},
	sources: [
		{ title: 'sysctl(8), man7.org', url: 'https://man7.org/linux/man-pages/man8/sysctl.8.html' },
		{ title: 'sysctl.d(5), systemd', url: 'https://www.freedesktop.org/software/systemd/man/latest/sysctl.d.html' },
		{ title: 'listen(2), man7.org', url: 'https://man7.org/linux/man-pages/man2/listen.2.html' },
		{ title: 'Doc du noyau Linux, IP sysctl (somaxconn)', url: 'https://docs.kernel.org/networking/ip-sysctl.html' },
		{ title: 'Doc du noyau Linux, Documentation for /proc/sys/fs/', url: 'https://docs.kernel.org/admin-guide/sysctl/fs.html' },
		{ title: 'Doc Kubernetes, Using sysctls in a Kubernetes Cluster', url: 'https://kubernetes.io/docs/tasks/administer-cluster/sysctl-cluster/' },
		{ title: 'Source de Redis, redis.conf (tcp-backlog)', url: `${REDIS}/redis.conf#L141-L148` },
		{ title: 'Source de Linux, net/socket.c (__sys_listen_socket)', url: `${LINUX}/net/socket.c#L1883-L1895` }
	]
};
