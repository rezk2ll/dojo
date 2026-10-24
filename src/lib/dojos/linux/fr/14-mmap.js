const LMDB = 'https://github.com/LMDB/lmdb/blob/028f61b6832032174f893484719ed4848d8d60db/libraries/liblmdb';
const PAPER = 'https://db.cs.cmu.edu/papers/2022/cidr2022-p13-crotty.pdf';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'mmap',
	part: 'La mémoire',
	title: 'mmap',
	minutes: 10,
	hook: [
		'Le premier moteur de stockage de MongoDB, MMAPv1, lisait et écrivait ses fichiers de données à travers `mmap`. MongoDB a fait de WiredTiger le moteur par défaut en 2015 et a supprimé MMAPv1 en 2019.',
		'Un [article de CIDR 2022](' + PAPER + ') a mesuré pourquoi. 100 threads lisent des pages au hasard sur un SSD NVMe. `fio` avec `pread` tient près de 900K lectures par seconde. **Avec `mmap`, les lectures suivent pendant 27 secondes, puis tombent presque à zéro pendant environ cinq secondes** quand le cache de pages se remplit, puis remontent à la moitié environ.',
		'LMDB, la base clé-valeur du projet OpenLDAP, fait le choix inverse. Son en-tête dit : "The entire database is exposed in a memory map, and all data fetches return data directly from the mapped memory".'
	],
	terms: [
		{ term: 'Projection de fichier', def: 'Une plage d’adresses virtuelles d’un processus que `mmap(2)` relie à un fichier. Lire une adresse de cette plage lit l’octet du fichier au décalage correspondant.' },
		{ term: 'MAP_SHARED', def: 'Le drapeau de projection avec lequel les écritures vont dans les pages du fichier en cache. Les autres processus qui projettent le même fichier les voient, et le noyau les écrit dans le fichier.' },
		{ term: 'MAP_PRIVATE', def: 'Le drapeau d’une projection en copie à l’écriture. La première écriture sur une page donne au processus sa propre copie, et le fichier ne voit jamais le changement.' },
		{ term: 'Buffer pool', def: 'Un cache de pages de fichiers qu’une base de données garde dans sa propre mémoire, en lisant et écrivant avec `pread` et `pwrite`. C’est ce que `mmap` remplace.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['call["p = mmap(NULL, 1 GB, PROT_READ, MAP_SHARED, fd, 0)"] --> vma["Le noyau réserve 1 GB d’adresses, ne lit rien"]'],
				highlight: ['call', 'vma'],
				note: 'L’appel renvoie une adresse et aucune donnée ne bouge encore. L’article CIDR : "The OS transparently loads pages only when the program references them." mmap(2) ajoute que le fd "can be closed immediately without invalidating the mapping".'
			},
			{
				add: ['vma --> read["Le processus lit p[4096]"]', 'read --> fault["Défaut de page : le noyau trouve la page 1 dans le cache de pages ou la lit sur le disque"]'],
				highlight: ['read', 'fault'],
				note: 'Le premier accès à chaque page provoque un défaut de page. Le noyau met la page du fichier dans le cache de pages si elle n’y est pas, et projette cette même page dans le processus. Aucune copie : la doc de SQLite dit qu’il "shares pages with the operating-system page cache".'
			},
			{
				add: ['fault -->|"écriture MAP_SHARED"| dirty["La page du cache est sale, écrite dans le fichier plus tard"]', 'fault -->|"écriture MAP_PRIVATE"| cow["Copie à l’écriture : une copie privée, fichier inchangé"]'],
				highlight: ['dirty', 'cow'],
				note: 'Avec `MAP_SHARED`, une écriture modifie la page du cache elle-même : les autres processus la voient, et la réécriture l’emporte vers le fichier. `msync(2)` fixe le moment. Avec `MAP_PRIVATE`, le noyau copie la page à la première écriture. La ligne `rw-p` de libc dans `/proc/<pid>/maps` est une projection de ce type.'
			},
			{
				add: ['dirty --> evict["La mémoire manque : le noyau retire des pages et vide le TLB de chaque CPU"]'],
				highlight: ['evict'],
				note: 'C’est le noyau qui choisit les pages projetées à évincer. Retirer une page que d’autres cœurs ont peut-être en cache exige une interruption pour vider leurs TLB : un TLB shootdown, "thousands of cycles" chacun. L’article CIDR a aussi trouvé le thread unique `kswapd` saturé en CPU et la table des pages très disputée.'
			},
			{
				add: ['evict --> again["La lecture suivante de cette page fait un défaut et attend le disque"]', 'again -.->|"erreur disque"| bus["SIGBUS au lieu d’un code d’erreur"]'],
				highlight: ['again', 'bus'],
				note: 'Le programme ne peut pas savoir à l’avance si une lecture touchera la RAM ou le disque. Une lecture qui tombe sur une page évincée bloque dans le défaut. Si la lecture disque échoue, aucune valeur de retour à vérifier : selon la doc de SQLite, l’erreur d’E/S "causes a signal which, if not caught by the application, results in a program crash".'
			}
		]
	},
	example: {
		title: 'LMDB mdb.c : mdb_env_map, toute la base dans une seule projection',
		repo: 'LMDB/lmdb',
		url: `${LMDB}/mdb.c#L4141-L4177`,
		lang: 'c',
		code: `	int mmap_flags = MAP_SHARED;
	int prot = PROT_READ;
#ifdef MAP_NOSYNC	/* Used on FreeBSD */
	if (flags & MDB_NOSYNC)
		mmap_flags |= MAP_NOSYNC;
#endif
	if (flags & MDB_WRITEMAP) {
		prot |= PROT_WRITE;
		if (ftruncate(env->me_fd, env->me_mapsize) < 0)
			return ErrCode();
	}
	env->me_map = mmap(addr, env->me_mapsize, prot, mmap_flags,
		env->me_fd, 0);
	if (env->me_map == MAP_FAILED) {
		env->me_map = NULL;
		return ErrCode();
	}

	if (flags & MDB_NORDAHEAD) {
		/* Turn off readahead. It's harmful when the DB is larger than RAM. */
#ifdef MADV_RANDOM
		madvise(env->me_map, env->me_mapsize, MADV_RANDOM);
#else
#ifdef POSIX_MADV_RANDOM
		posix_madvise(env->me_map, env->me_mapsize, POSIX_MADV_RANDOM);
#endif /* POSIX_MADV_RANDOM */
#endif /* MADV_RANDOM */
	}
#endif /* _WIN32 */

	/* Can happen because the address argument to mmap() is just a
	 * hint.  mmap() can pick another, e.g. if the range is in use.
	 * The MAP_FIXED flag would prevent that, but then mmap could
	 * instead unmap existing pages to make room for the new map.
	 */
	if (addr && env->me_map != addr)
		return EBUSY;	/* TODO: Make a new MDB_* error code? */`,
		notes: [
			'Les lignes 1 et 2 choisissent `MAP_SHARED` et `PROT_READ` : chaque processus qui ouvre la base voit les mêmes pages du cache, et aucun ne peut écrire à travers la projection. L’[en-tête](' + LMDB + '/lmdb.h#L13-L16) dit qu’avec une projection en lecture seule, "database integrity cannot be corrupted by stray pointer writes from application code".',
			'La ligne 12 projette `me_mapsize` octets du fichier en un seul appel. Cette taille est aussi la taille maximale de la base : 10485760 octets par défaut, soit 10 MB, et la doc demande de la choisir "as large as possible".',
			'Les lignes 7 à 11 gèrent `MDB_WRITEMAP` : elles ajoutent `PROT_WRITE`, et `ftruncate` agrandit d’abord le fichier à la taille complète de la projection. Sans ce drapeau, LMDB écrit les pages modifiées avec `pwrite` et `writev`, et ne fait que lire à travers la projection.',
			'Lignes 19 à 28 : avec `MDB_NORDAHEAD`, `madvise(MADV_RANDOM)` demande au noyau de ne pas lire en avance. Le commentaire de la ligne 20 donne la raison : la lecture anticipée est "harmful when the DB is larger than RAM".'
		]
	},
	tradeoff: {
		gain: [
			'Une recherche de clé dans LMDB renvoie un pointeur dans la page projetée, sans `malloc` ni `memcpy`.',
			'LMDB ne garde les pages de fichiers que dans le cache de pages du noyau. Son en-tête dit que la bibliothèque "requires no page caching layer of its own".'
		],
		cost: [
			'Le noyau décide quelles pages quittent la RAM, et quand. Dans le test de CIDR 2022, les lectures sont tombées presque à zéro pendant environ 5 secondes au début des évictions.',
			'Une erreur disque arrive sous forme de SIGBUS dans le code qui a touché la page, quel qu’il soit. Un buffer pool la reçoit comme valeur de retour de `pread`.',
			'Les octets en RAM doivent être identiques aux octets sur disque. L’article note que MMAPv1 ne pouvait pas compresser les données sur disque pour cette raison.'
		]
	},
	task: {
		prompt: 'Lance `awk \'$6 ~ /libc\\.so/\' /proc/$$/maps` pour voir comment ton shell projette libc. La deuxième colonne donne les permissions. Pourquoi toutes les lignes de libc sont-elles privées (`p`), et qu’arrive-t-il à la page `rw-p` quand le shell écrit une variable globale ?',
		hint: 'proc_pid_maps(5) : "s = shared", "p = private (copy on write)". Chaque ligne est une projection du même fichier à un décalage différent.',
		answer: [
			'Sortie capturée pendant cette session : cinq lignes pour `/usr/lib/x86_64-linux-gnu/libc.so.6`, avec les permissions `r--p`, `r-xp`, `r--p`, `r--p` et `rw-p`. La ligne `r-xp` au décalage `00028000` contient le code.',
			'Chaque ligne projette une partie du même fichier à un décalage différent, avec ses propres permissions. Le `p` veut dire copie à l’écriture : aucune écriture du shell ne peut atteindre le fichier libc sur le disque.',
			'La ligne `rw-p` contient les variables globales modifiables de libc. La première écriture sur une de ces pages donne au shell sa propre copie, et le fichier comme les autres processus gardent l’original.',
			'Le même shell a aussi une projection partagée, `r--s` sur `/usr/lib/x86_64-linux-gnu/gconv/gconv-modules.cache` : un fichier en lecture seule que tous les processus peuvent partager tel quel.'
		],
		steps: [
			{
				title: 'Lis les lignes',
				questions: [
					{ q: 'La commande affiche cinq lignes pour `libc.so.6`. Qu’est-ce que chaque ligne ?', options: ['Une copie de libc chargée depuis le disque', 'Une projection d’une partie du même fichier, à son propre décalage', 'Un thread du shell', 'Une version de libc installée sur la machine'], answer: 1, why: 'Chaque ligne est une projection du même fichier à un décalage différent, avec ses propres permissions.' },
					{ q: 'Quelle ligne contient le code de libc ?', options: ['La ligne `rw-p`', 'La première ligne `r--p`', 'La ligne `r-xp`', 'Aucune : le code n’est pas projeté'], answer: 2, why: 'Le `x` veut dire exécutable. La ligne `r-xp` au décalage `00028000` contient le code.' },
					{ q: 'Que dit le quatrième caractère de la colonne des permissions ?', options: ['Si la projection est partagée ou privée', 'Si la page est en RAM', 'Si le fichier est ouvert', 'Si la page est sale'], answer: 0, why: 'proc_pid_maps(5) : "s = shared", "p = private (copy on write)".' },
					{ q: 'La ligne `r-xp` affiche l’offset `00028000`. Que dit-il ?', options: ['L’adresse mémoire où commence libc', 'La taille du code de libc', 'Le numéro d’inode de `libc.so.6`', 'L’endroit du fichier où commence cette projection : 0x28000 octets plus loin'], answer: 3, why: 'La troisième colonne est l’offset dans le fichier. Chaque ligne projette la partie de `libc.so.6` qui commence là.' }
				]
			},
			{
				title: 'Explique le p',
				questions: [
					{ q: 'Pourquoi toutes les lignes de libc sont-elles privées ?', options: ['Pour qu’aucune écriture du shell ne puisse atteindre le fichier libc sur le disque', 'Parce que les projections partagées sont plus lentes à lire', 'Parce que seul root peut créer des projections partagées', 'Pour charger libc une fois par CPU'], answer: 0, why: 'Avec `MAP_PRIVATE`, les modifications n’atteignent pas le fichier. Un programme ne peut pas changer la libc que tous les autres processus exécutent.' },
					{ q: 'Les lignes `r--p` en lecture seule coûtent-elles à chaque processus sa propre copie de libc ?', options: ['Oui : privé veut dire copié tout de suite', 'Oui : chaque processus relit libc depuis le disque', 'Non : une page privée n’est copiée qu’à la première écriture', 'Non : les pages privées restent sur le disque'], answer: 2, why: 'La copie à l’écriture ne copie une page que quand le processus y écrit. Les pages jamais écrites restent partagées dans le cache de pages.' },
					{ q: 'Quel drapeau de `mmap` donne son `p` à une ligne ?', options: ['`MAP_SHARED`', '`MAP_PRIVATE`', '`MAP_ANONYMOUS`', '`MAP_FIXED`'], answer: 1, why: 'Le quatrième caractère des permissions vaut `p` pour une projection `MAP_PRIVATE` et `s` pour une projection `MAP_SHARED`.' },
					{ q: 'Quels drapeaux laisseraient une écriture égarée du shell changer libc pour tout le monde ?', options: ['`MAP_PRIVATE` avec `PROT_READ`', '`MAP_PRIVATE` avec `PROT_WRITE`', '`MAP_ANONYMOUS`', '`MAP_SHARED` avec `PROT_WRITE`'], answer: 3, why: 'Seule une projection partagée et modifiable écrit dans le fichier. Toutes les lignes de libc sont privées.' }
				]
			},
			{
				title: 'Suis une écriture',
				questions: [
					{ q: 'Que contient la ligne `rw-p` ?', options: ['Les variables globales modifiables de libc', 'Le code de libc', 'Le tas du shell', 'La pile du shell'], answer: 0, why: 'C’est la seule projection modifiable de libc. Les variables globales qui changent pendant l’exécution y vivent.' },
					{ q: 'Comment le noyau remarque-t-il la première écriture du shell sur cette page ?', options: ['Le shell appelle d’abord `msync`', 'libc prévient le noyau par un appel système', 'Un minuteur inspecte la page chaque seconde', 'L’écriture provoque un défaut : la page n’a pas le droit d’écriture tant qu’elle n’est pas copiée'], answer: 3, why: 'Jusqu’à la copie, la page est projetée sans droit d’écriture. L’écriture tombe dans le noyau, qui copie la page puis laisse l’écriture se faire.' },
					{ q: 'Un autre shell tourne en même temps. Voit-il le changement du premier ?', options: ['Oui, tout de suite', 'Oui, après la prochaine réécriture', 'Non : il garde la page d’origine', 'Seulement après `msync`'], answer: 2, why: 'La copie appartient à un seul processus. Le fichier et les autres processus gardent l’original.' },
					{ q: '`msync` pousserait-il le changement dans le fichier libc ?', options: ['Oui : `msync` écrit toutes les pages sales', 'Non : `msync` ne compte que pour les projections `MAP_SHARED`', 'Oui, si le shell tourne en root', 'Seulement si la page a été évincée'], answer: 1, why: 'Une copie privée n’a plus de lien avec le fichier. `msync` fixe le moment où les pages partagées atteignent le fichier.' }
				]
			},
			{
				title: 'Compare avec une ligne partagée',
				questions: [
					{ q: 'Le shell projette aussi `gconv-modules.cache` en `r--s`. Que veut dire le `s` ?', options: ['Sorti dans le swap', 'Partagé : la projection utilise directement les pages du fichier en cache', 'Sécurisé : seul root peut le lire', 'La pile (stack)'], answer: 1, why: '`s` veut dire partagé. Tous les processus qui projettent le fichier utilisent les mêmes pages du cache.' },
					{ q: 'Pourquoi ce fichier peut-il être partagé tel quel ?', options: ['Il est en lecture seule : aucun processus ne peut le changer par la projection', 'Il tient dans une seule page', 'Il est sur un `tmpfs`', 'Le noyau le compresse'], answer: 0, why: 'Sans `w`, il n’y a aucune écriture à copier ni à reporter. Tous les processus lisent les mêmes octets.' },
					{ q: 'LMDB projette sa base avec `MAP_SHARED` et `PROT_READ`. Pourquoi en lecture seule ?', options: ['Écrire par une projection est plus lent que `pwrite`', 'Linux interdit les projections partagées modifiables', 'Les écritures égarées de l’application ne peuvent pas corrompre la base', 'Ça économise du cache de pages'], answer: 2, why: 'L’en-tête de LMDB : une projection en lecture seule veut dire que "database integrity cannot be corrupted by stray pointer writes from application code".' },
					{ q: 'Une erreur disque touche une page projetée que le shell lit. Que reçoit le shell ?', options: ['EIO renvoyé par `read`', 'Une page remplie de zéros', 'Des octets périmés depuis le TLB', 'SIGBUS au lieu d’un code d’erreur'], answer: 3, why: 'Avec `mmap`, aucune valeur de retour à vérifier. L’erreur arrive sous forme de signal dans le code qui a touché la page.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Un processus projette un fichier avec `MAP_PRIVATE`, `PROT_READ | PROT_WRITE`, et écrit 4 octets au décalage 0. Qu’arrive-t-il au fichier sur le disque ?',
			options: [
				'Les 4 octets arrivent dans le fichier à la prochaine réécriture, comme toute page sale',
				'Rien : le processus a reçu sa propre copie de la page à la première écriture',
				'L’écriture échoue avec EACCES, car les projections privées sont en lecture seule',
				'Les 4 octets n’arrivent dans le fichier qu’après un appel à `msync`'
			],
			answer: 1,
			why: 'mmap(2) : `MAP_PRIVATE` crée "a private copy-on-write mapping", et les modifications "are not carried through to the underlying file". `msync` ne compte que pour les projections `MAP_SHARED`.'
		},
		{
			q: 'Deux processus projettent le même fichier avec `MAP_SHARED`. Le processus A écrit un octet à travers sa projection. Quand B le voit-il ?',
			options: [
				'Seulement après un `msync` ou un `fsync` de A',
				'Seulement après l’écriture de la page sur le disque par le noyau',
				'Tout de suite, car les deux projettent la même page du cache',
				'Jamais, car chaque processus a reçu sa propre copie au défaut de page'
			],
			answer: 2,
			why: 'Avec `MAP_SHARED`, "Updates to the mapping are visible to other processes mapping the same region". Les deux tables de pages pointent vers une seule page physique du cache. `msync` règle le moment où le fichier sur disque change. B lit le nouvel octet avant.'
		},
		{
			q: 'Une base de données lit à travers `mmap`. La page dont elle a besoin a été évincée il y a une seconde. Que fait le thread qui lit ?',
			options: [
				'Il reçoit EAGAIN à la lecture et retente la recherche plus tard',
				'Il lit des données périmées restées dans le TLB depuis le dernier accès',
				'Il lit des zéros, car les pages évincées sont effacées avant réutilisation',
				'Il bloque dans un défaut de page pendant que le noyau relit la page sur disque'
			],
			answer: 3,
			why: 'Une page évincée n’est plus projetée : l’accès provoque un défaut de page et le noyau recharge la page du fichier. Le thread attend dans le défaut jusqu’à la fin de la lecture disque. Aucun code d’erreur ni EAGAIN ne remonte à l’appelant.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Projeter un fichier des deux façons avec Python, et voir quelles écritures atteignent le fichier et lesquelles restent privées.',
		steps: [
			'Crée un dossier de test et un petit fichier : `mkdir -p ~/mmap-lab && cd ~/mmap-lab && printf \'hello world\\n\' > data.txt`.',
			'Sous Linux, regarde les deux sortes de projection : `python3 -c "import mmap, os; f = open(\'data.txt\', \'r+b\'); m = mmap.mmap(f.fileno(), 0); os.system(\'grep data.txt /proc/%d/maps\' % os.getpid())"`, puis la même chose avec `mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_COPY)`.',
			'Écris à travers une projection partagée pendant que le processus tourne encore, et lis le fichier depuis un autre processus : `python3 -c "import mmap, time; f = open(\'data.txt\', \'r+b\'); m = mmap.mmap(f.fileno(), 0); m[0:5] = b\'HELLO\'; time.sleep(3)" & sleep 1; cat data.txt; wait`.',
			'Écris à travers une projection privée : `python3 -c "import mmap; f = open(\'data.txt\', \'r+b\'); m = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_COPY); m[0:5] = b\'howdy\'; print(m[:11])"`, puis `cat data.txt`.'
		],
		done: [
			'L’étape 2 affiche une ligne `rw-s`, puis une ligne `rw-p`, pour `data.txt`.',
			'L’étape 3 affiche `HELLO world` pendant que le processus qui écrit dort encore.',
			'L’étape 4 affiche `b\'howdy world\'`, et `cat data.txt` affiche toujours `HELLO world`.'
		],
		solution: [
			'La projection par défaut de Python est `MAP_SHARED`. `cat` lit la même page du cache que celle que le processus a modifiée : il voit les octets avant tout `msync` et avant la sortie.',
			'`ACCESS_COPY` correspond à `MAP_PRIVATE`. La première écriture a copié la page pour ce seul processus : le fichier n’a jamais vu `howdy`.'
		]
	},
	recall: {
		q: 'Avec `mmap`, où se trouvent vraiment les octets que lit un processus, et quelle différence entre `MAP_SHARED` et `MAP_PRIVATE` à l’écriture ?',
		a: 'Dans le cache de pages du noyau, projeté dans le processus sans copie. Une écriture `MAP_SHARED` modifie cette page : les autres processus la voient et le fichier la reçoit. Une écriture `MAP_PRIVATE` crée une copie privée et le fichier ne change jamais.'
	},
	sources: [
		{ title: 'mmap(2), man7.org', url: 'https://man7.org/linux/man-pages/man2/mmap.2.html' },
		{ title: 'proc_pid_maps(5), man7.org', url: 'https://man7.org/linux/man-pages/man5/proc_pid_maps.5.html' },
		{ title: 'Documentation SQLite, Memory-Mapped I/O', url: 'https://www.sqlite.org/mmap.html' },
		{ title: 'LMDB 0.9.36, libraries/liblmdb/lmdb.h', url: `${LMDB}/lmdb.h` },
		{ title: 'Crotty, Leis, Pavlo : Are You Sure You Want to Use MMAP in Your Database Management System? (CIDR 2022)', url: PAPER }
	]
};
