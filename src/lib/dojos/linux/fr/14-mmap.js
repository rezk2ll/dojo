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
