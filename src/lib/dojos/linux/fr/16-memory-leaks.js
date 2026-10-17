const LINUX = 'https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a';
const TASK_MMU = `${LINUX}/fs/proc/task_mmu.c`;
const GLIBC = 'https://github.com/bminor/glibc/blob/74f59e9271cbb4071671e5a474e7d4f1622b186f';
const ISSUE = 'https://github.com/goauthentik/authentik/issues/25683';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'memory-leaks',
	part: 'La mémoire',
	title: 'Trouver une fuite mémoire',
	minutes: 10,
	hook: [
		'Septembre 2026, ticket authentik #25683. Un worker web gunicorn garde 2 Gio alors qu’il ne sert aucune requête. Son `/proc/<pid>/smaps_rollup` affiche `Rss: 2110844 kB`, `Private_Dirty: 2002740 kB` et `Anonymous: 2090156 kB`. Une semaine plus tard, un nouveau pod est tué par l’OOM killer 7 minutes après son démarrage, `exit code 137`, avec une limite de 4 Gio.',
		'L’auteur du ticket pose `MALLOC_ARENA_MAX=2` et `MALLOC_TRIM_THRESHOLD_=131072`. Après une rafale de requêtes, le worker ne garde plus qu’environ 640 Mio au lieu de 2 Gio. Pour lui, c’était de la mémoire que Python avait libérée et que la glibc gardait.',
		'Il se corrige ensuite : gunicorn redémarre chaque worker après environ 1000 requêtes, et les remplaçants tournent à 282 Mio sous la même charge. **La mémoire appartenait à chaque processus worker et elle est partie avec lui.** Les lignes de `smaps` et les noms des mappings te disent quel type de mémoire a grossi.'
	],
	terms: [
		{ term: 'RSS', def: 'Resident set size : la partie des mappings d’un processus présente en RAM à cet instant, la ligne `Rss:` de `smaps` et `VmRSS` dans `status`.' },
		{ term: 'Mémoire anonyme', def: 'Des pages qui n’appartiennent à aucun fichier : le tas, les piles, un `mmap` avec `MAP_ANONYMOUS`, et les copies privées des pages de fichier que le processus a modifiées.' },
		{ term: 'Private_Dirty', def: 'Les pages que ce processus est seul à mapper et qu’il a écrites depuis leur chargement. Le noyau ne peut pas les jeter, seulement les envoyer en swap.' },
		{ term: 'Arène', def: 'Une réserve de mémoire dans laquelle `malloc` de la glibc puise, avec son propre verrou. L’arène principale agrandit le `[heap]` avec `brk` ; les autres vivent dans des régions `mmap` de 64 Mio au plus.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['small["Thread principal : malloc(100)"] -->|"brk agrandit le tas"| heap["Mapping [heap] : l’arène principale"]'],
				highlight: ['small', 'heap'],
				note: 'malloc(3) : "Normally, malloc() allocates memory from the heap, and adjusts the size of the heap as required, using sbrk(2)." Dans `/proc/<pid>/maps`, le noyau affiche `[heap]` pour le mapping situé entre `start_brk` et `brk`.'
			},
			{
				add: ['big["malloc(1 MB)"] -->|"128 kB ou plus : mmap"| anon1["Mapping anonyme privé, sans nom dans maps"]'],
				highlight: ['big', 'anon1'],
				note: 'Pour un bloc de 128 kB ou plus, la glibc crée un mapping anonyme privé rien que pour lui. Dans `maps`, sa colonne de chemin reste vide. Ce seuil de 128 kB monte quand le programme libère de plus gros blocs, jusqu’à 32 Mio en 64 bits.'
			},
			{
				add: ['threads["8 threads appellent malloc en même temps"] -->|"verrou disputé : nouvelles arènes"| anon2["D’autres mappings sans nom, 64 Mio au plus chacun"]'],
				highlight: ['threads', 'anon2'],
				note: 'Quand des threads attendent le verrou d’une arène, la glibc crée d’autres arènes. En 64 bits, la limite est de 8 arènes par CPU, donc 48 sur un nœud à 6 CPU. Chaque arène hors de la principale est un tas `mmap` de 64 Mio au plus, encore un mapping anonyme sans nom.'
			},
			{
				add: ['anon2 -->|"première écriture : défaut de page"| rss["Rss, Anonymous, Private_Dirty montent"]', 'heap --> rss'],
				highlight: ['rss'],
				note: 'Un mapping ne fait que réserver des adresses. La doc du noyau : "When the program performs a write, a regular physical page will be allocated to hold the written data." Cette page compte alors dans `Rss`, dans `Anonymous`, et dans `Private_Dirty` puisqu’aucun autre processus ne la mappe.'
			},
			{
				add: ['free["free() de la plupart des objets"] -->|"les blocs retournent dans les listes libres de l’arène"| rss'],
				highlight: ['free'],
				note: 'Un bloc libéré retourne dans son arène et sert au prochain `malloc`. mallopt(3) : "the heap can be trimmed only if memory is freed at the top end". Un seul objet vivant en haut d’une arène retient toutes les pages en dessous, et `Rss` reste haut alors que les objets ont disparu.'
			},
			{
				add: ['read["cat /proc/PID/smaps_rollup"] -->|"le noyau parcourt chaque mapping et additionne"| rss'],
				highlight: ['read'],
				note: '`smaps_rollup` contient les mêmes champs que `smaps`, additionnés sur tous les mappings, plus `Pss_Anon`, `Pss_File` et `Pss_Shmem`. D’après la doc du noyau, `smaps` donne les mêmes totaux "at a significantly higher cost". Lis `smaps` quand tu veux le détail mapping par mapping.'
			}
		]
	},
	example: {
		title: 'fs/proc/task_mmu.c : smaps_account, le chemin de chaque page vers les lignes de smaps',
		repo: 'torvalds/linux',
		url: `${TASK_MMU}#L703-L749`,
		lang: 'c',
		code: `static void smaps_account(struct mem_size_stats *mss, struct page *page,
		bool compound, bool young, bool dirty, bool locked,
		bool present)
{
	struct folio *folio = page_folio(page);
	int i, nr = compound ? compound_nr(page) : 1;
	unsigned long size = nr * PAGE_SIZE;

	/*
	 * First accumulate quantities that depend only on |size| and the type
	 * of the compound page.
	 */
	if (folio_test_anon(folio)) {
		mss->anonymous += size;
		if (!folio_test_swapbacked(folio) && !dirty &&
		    !folio_test_dirty(folio))
			mss->lazyfree += size;
	}

	if (folio_test_ksm(folio))
		mss->ksm += size;

	mss->resident += size;
	/* Accumulate the size in pages that have been accessed. */
	if (young || folio_test_young(folio) || folio_test_referenced(folio))
		mss->referenced += size;

	/*
	 * Then accumulate quantities that may depend on sharing, or that may
	 * differ page-by-page.
	 *
	 * refcount == 1 for present entries guarantees that the folio is mapped
	 * exactly once. For large folios this implies that exactly one
	 * PTE/PMD/... maps (a part of) this folio.
	 *
	 * Treat all non-present entries (where relying on the mapcount and
	 * refcount doesn't make sense) as "maybe shared, but not sure how
	 * often". We treat device private entries as being fake-present.
	 *
	 * Note that it would not be safe to read the mapcount especially for
	 * pages referenced by migration entries, even with the PTL held.
	 */
	if (folio_ref_count(folio) == 1 || !present) {
		smaps_page_accumulate(mss, folio, size, size << PSS_SHIFT,
				      dirty, locked, present);
		return;
	}`,
		notes: [
			'Le noyau appelle cette fonction pour chaque page trouvée en parcourant les tables de pages d’un mapping. Une page en swap s’ajoute à la ligne `Swap:` dans `smaps_pte_entry` et n’arrive jamais ici : `Rss` ne la compte pas.',
			'Les lignes 13 et 14 ajoutent la page à `Anonymous` quand elle n’appartient à aucun fichier. La doc du noyau précise qu’une page modifiée d’un mapping de fichier `MAP_PRIVATE` est "replaced by a private anonymous copy" : elle compte donc ici aussi.',
			'La ligne 23 ajoute à `resident`, affiché comme `Rss:`, chaque page qui arrive jusque-là. Les pages de fichier, comme un `libc.so.6` mappé, y comptent aussi. Pour une fuite, c’est donc la ligne `Anonymous` que tu surveilles.',
			'Les lignes 43 à 45 traitent une page que ce processus est seul à mapper. [`smaps_page_accumulate`](' + TASK_MMU + '#L673-L700) lui donne sa taille entière dans `Pss` et l’ajoute à `Private_Dirty` si elle est sale. Une page partagée passe à une boucle qui divise `Pss` par le nombre de processus qui la mappent.'
		]
	},
	tradeoff: {
		gain: [
			'`MALLOC_ARENA_MAX=2` limite la glibc à 2 arènes. Dans le ticket authentik, la mémoire gardée après une rafale est passée d’environ 2 Gio à environ 640 Mio, et le niveau au repos d’environ 850 Mio à environ 480 Mio.',
			'Le réglage gunicorn `max_requests` redémarre un worker après ce nombre de requêtes, "a simple method to help limit the damage of memory leaks". authentik le met à 1000, et les nouveaux workers tournaient à 282 Mio contre 1,1 Gio pour les anciens.',
			'Une seule lecture de `smaps_rollup` donne les totaux d’un processus. Tu peux la relever chaque minute et tracer `Anonymous` sans analyser des centaines de mappings.'
		],
		cost: [
			'mallopt(3) sur les arènes : "The more arenas you have, the lower the per-thread contention, but the higher the memory usage." Avec 2 arènes, 8 threads se partagent 2 verrous.',
			'Dans le même ticket, la première requête sur les événements coûte environ 100 Mio à un nouveau worker, pour charger un lecteur GeoLite2 de 63 MB. Les requêtes suivantes ne coûtent presque rien.',
			'Avec `max_requests`, un worker peut quand même atteindre la limite de 4 Gio avant son redémarrage : une session d’administration a ajouté 1,3 Gio en 15 secondes. Aucun des deux réglages ne montre quel code alloue.'
		]
	},
	task: {
		prompt: 'Deux relevés de `/proc/<pid>/smaps_rollup` tirés du ticket authentik, même charge. Ancien worker, pid 49 : `Rss 1196664 kB`, `Private_Dirty 1096568 kB`, `Anonymous 1178592 kB`, `Shared_Clean 17692 kB`. Son remplaçant après redémarrage, pid 2179 : `Rss 282820 kB`, `Private_Dirty 181156 kB`, `Anonymous 265636 kB`. Quelle part du Rss du pid 49 est anonyme ? Les bibliothèques partagées ou les pages de fichier expliquent-elles l’écart ? Quelle commande montre les mappings qui le contiennent ?',
		hint: 'Divise `Anonymous` par `Rss`. Les bibliothèques mappées tombent surtout dans `Shared_Clean`. Pour la dernière question, la ligne d’en-tête de chaque mapping dans `smaps` porte le nom en 6e colonne.',
		answer: [
			'1178592 / 1196664 = 98,5 % de la mémoire résidente est anonyme. Les pages adossées à un fichier pèsent au plus 18 MB environ.',
			'`Shared_Clean` vaut 17692 kB, environ 17 Mio : les bibliothèques et les autres pages partagées propres pèsent peu. Entre les deux workers, l’écart est de 1196664 − 282820 = 913844 kB, environ 892 Mio, dont 912956 kB d’`Anonymous`. Presque tout l’écart est de la mémoire anonyme écrite par l’ancien processus.',
			'Le redémarrage l’a libérée : ni le noyau ni le cache de pages ne la tenaient. Le processus la tenait, en objets Python vivants ou en blocs libérés gardés dans les arènes de la glibc.',
			'Liste les mappings par taille : `awk \'/^[0-9a-f]+-[0-9a-f]+ /{n=($6==""?"[anon]":$6)} /^Rss:/{print $2, n}\' /proc/49/smaps | sort -n | tail`. L’auteur du ticket a trouvé 61 mappings anonymes de 1 Mio ou plus, 1039848 kB en tout, contre 76392 kB pour le plus gros `[heap]`.'
		]
	},
	quiz: [
		{
			q: 'Un worker au repos affiche `Rss: 2110844 kB` et `Anonymous: 2090156 kB` dans `smaps_rollup`. Où est cette mémoire ?',
			options: [
				'Dans le cache de pages, qui garde les fichiers lus pendant la rafale',
				'Dans la mémoire écrite par le processus : tas, arènes malloc, blocs mmap',
				'Dans les bibliothèques partagées, comptées une fois par worker qui les mappe',
				'Dans des objets slab du noyau, facturés au RSS du worker'
			],
			answer: 1,
			why: '`smaps_account` ajoute une page à `Anonymous` seulement si elle n’appartient à aucun fichier. 2090156 kB sur 2110844 kB laissent environ 20 MB aux pages de fichier comme les bibliothèques. La mémoire slab du noyau ne figure dans aucun mapping du processus.'
		},
		{
			q: 'Un programme C alloue 500 MB en objets de 100 octets, les libère tous sauf le dernier alloué, et `Rss` reste vers 500 MB. Pourquoi ?',
			options: [
				'Le noyau garde les pages libérées dans le RSS jusqu’à manquer de mémoire',
				'free() marque seulement les objets, et un ramasse-miettes les rend plus tard',
				'La glibc garde les blocs libérés dans le tas et ne le réduit que par le haut',
				'Le programme fuit encore, car chaque octet libéré devrait quitter le RSS'
			],
			answer: 2,
			why: 'Les petits blocs viennent du tas `brk`. free() les remet dans les listes libres de l’arène, et la glibc ne rend des pages avec `sbrk` que depuis le haut du tas. Le seul objet vivant, en haut, retient tout le tas en dessous.'
		},
		{
			q: 'Un processus à 8 threads grossit. Dans `/proc/<pid>/maps`, où attends-tu l’essentiel de la croissance due aux petits `malloc` de ces threads ?',
			options: [
				'Dans des mappings anonymes sans nom : les arènes glibc en plus, 64 Mio au plus',
				'Dans le mapping `[heap]`, que chaque thread agrandit avec `brk`',
				'Dans le mapping `[stack]`, car chaque thread alloue sur la pile principale',
				'Dans `[vdso]`, la zone partagée que le noyau donne à chaque processus'
			],
			answer: 0,
			why: 'Les threads qui se disputent le verrou de l’arène principale reçoivent leurs propres arènes, jusqu’à 8 par CPU en 64 bits. Ces arènes sont des tas `mmap` de 64 Mio au plus, sans nom dans `maps`. Seule l’arène principale agrandit `[heap]`.'
		}
	],
	recall: {
		q: 'Quel fichier donne en une lecture les totaux mémoire d’un processus, et quelle ligne montre que la croissance vient de mémoire écrite par le processus lui-même ?',
		a: '`/proc/<pid>/smaps_rollup`, et sa ligne `Anonymous:`, avec `Private_Dirty:` à côté. Le worker authentik au repos avait 2090156 kB d’`Anonymous` sur 2110844 kB de `Rss`.'
	},
	sources: [
		{ title: 'Ticket authentik #25683, mémoire du serveur et arènes glibc', url: ISSUE },
		{ title: 'Doc du noyau Linux, The /proc Filesystem (smaps, smaps_rollup)', url: 'https://docs.kernel.org/filesystems/proc.html' },
		{ title: 'proc_pid_smaps(5)', url: 'https://man7.org/linux/man-pages/man5/proc_pid_smaps.5.html' },
		{ title: 'malloc(3)', url: 'https://man7.org/linux/man-pages/man3/malloc.3.html' },
		{ title: 'mallopt(3)', url: 'https://man7.org/linux/man-pages/man3/mallopt.3.html' },
		{ title: 'Doc du noyau Linux, Concepts overview (mémoire anonyme)', url: 'https://docs.kernel.org/admin-guide/mm/concepts.html' },
		{ title: 'Source glibc 2.41, malloc/arena.c (tas mmap pour les threads)', url: `${GLIBC}/malloc/arena.c#L26-L42` },
		{ title: 'Source glibc 2.41, malloc/malloc.c (8 arènes par cœur en 64 bits)', url: `${GLIBC}/malloc/malloc.c#L1923-L1924` },
		{ title: 'Source gunicorn, réglage max_requests', url: 'https://github.com/benoitc/gunicorn/blob/afc7d2fd5dd9f1de455b1be6c10044030c0adf8e/gunicorn/config.py#L851-L868' }
	]
};
