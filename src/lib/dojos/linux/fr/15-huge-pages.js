const K = 'https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a';
const THP = `${K}/Documentation/admin-guide/mm/transhuge.rst`;
const REDIS = 'https://github.com/redis/redis/blob/4fa8bf356b4bf0f1ce345286a4f02d022a4badcb';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'huge-pages',
	part: 'La mémoire',
	title: 'Les grandes pages',
	minutes: 10,
	hook: [
		'Redis lit `/sys/kernel/mm/transparent_hugepage/enabled` au démarrage. Quand le fichier contient `[always]`, le journal dit : "You have Transparent Huge Pages (THP) support enabled in your kernel. This will create latency and memory usage issues with Redis."',
		'Le manuel de MongoDB 7.0 demande de couper THP : "database workloads often perform poorly with THP enabled, because they tend to have sparse rather than contiguous memory access patterns". **Le manuel 8.0 demande de vérifier que THP est activé avant le démarrage de `mongod`**, parce que la 8.0 embarque un TCMalloc mis à jour avec des caches par CPU.',
		'Les deux conseils portent sur un seul réglage du noyau, qui permet à une seule entrée de la table des pages de couvrir 2 MB au lieu de 4 KB.'
	],
	terms: [
		{ term: 'TLB', def: 'Le Translation Lookaside Buffer, le cache du CPU pour les traductions récentes d’adresses virtuelles en adresses physiques. La doc du noyau le dit "pretty scarce resource".' },
		{ term: 'Grande page', def: 'Une page projetée depuis un niveau plus haut de la table des pages. Sur x86, cela donne des pages de 2 MB ou 1 GB à côté des pages normales de 4 KB.' },
		{ term: 'THP', def: 'Transparent Huge Pages : le noyau sert la mémoire anonyme avec des pages de 2 MB de lui-même, sans que le programme le demande. Se règle dans `/sys/kernel/mm/transparent_hugepage/enabled` à `always`, `madvise` ou `never`.' },
		{ term: 'khugepaged', def: 'Le thread du noyau qui parcourt la mémoire et regroupe après coup des suites de 512 petites pages en une page de 2 MB.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['va["Lecture à une adresse virtuelle"] --> tlb{"Dans le TLB ?"}', 'tlb -->|"trouvée"| pa["Adresse physique, sans lecture mémoire pour la trouver"]'],
				highlight: ['va', 'tlb', 'pa'],
				note: 'Chaque accès mémoire demande de traduire son adresse virtuelle. La doc du noyau dit que la traduction "requires several memory accesses", donc le CPU garde les traductions récentes dans le TLB.'
			},
			{
				add: ['tlb -->|"absente"| walk["Parcours de la table des pages : plusieurs lectures mémoire"]', 'walk --> pa'],
				highlight: ['walk'],
				note: 'Le TLB a un nombre fixe d’entrées. Avec des pages de 4 KB, chaque entrée couvre 4 KB, avec une page de 2 MB elle couvre 512 fois plus. Un processus qui touche des gigaoctets au hasard rate beaucoup moins souvent le TLB avec des pages de 2 MB.'
			},
			{
				add: ['pa --> touch["Le processus touche une nouvelle plage de 2 MB du tas"]', 'touch -->|"THP permis ici"| huge["Une page de 2 MB : un défaut, une entrée TLB"]'],
				highlight: ['touch', 'huge'],
				note: 'Avec `always`, toute plage anonyme peut recevoir une grande page. Avec `madvise`, seulement les plages que le programme a marquées avec `madvise(MADV_HUGEPAGE)`. La doc du noyau : un seul défaut par région de 2 MB réduit les entrées dans le noyau "by a 512 times factor".'
			},
			{
				add: ['touch -->|"aucun bloc libre de 2 MB"| defrag["Réglage defrag : compacter la mémoire tout de suite, ou repli sur 4 KB"]'],
				highlight: ['defrag'],
				note: 'Une page de 2 MB demande 2 MB de mémoire physique libre et contiguë. Avec `defrag` à `always`, le programme "will stall on allocation failure and directly reclaim pages and compact memory". Avec la valeur par défaut, `madvise`, seules les plages marquées attendent, les autres se replient et `thp_fault_fallback` augmente de 1.'
			},
			{
				add: ['huge --> fork["fork() pour un instantané, puis le parent écrit 1 octet"]', 'fork --> cow["La copie à l’écriture copie 2 MB, pas 4 KB"]'],
				highlight: ['fork', 'cow'],
				note: 'Après `fork`, parent et enfant partagent chaque page jusqu’à ce que l’un d’eux écrive. Redis fait un `fork` pour sauvegarder ses données sur disque. Sa doc sur la latence : avec les grandes pages, "a few thousand of pages" écrites par les commandes provoquent "the copy on write of almost the whole process memory".'
			}
		]
	},
	example: {
		title: 'Redis server.c : couper THP pour le seul processus Redis',
		repo: 'redis/redis',
		url: `${REDIS}/src/server.c#L6604-L6636`,
		lang: 'c',
		code: `#ifdef __linux__
#include <sys/prctl.h>
/* since linux-3.5, kernel supports to set the state of the "THP disable" flag
 * for the calling thread. PR_SET_THP_DISABLE is defined in linux/prctl.h */
static int THPDisable(void) {
    int ret = -EINVAL;

    if (!server.disable_thp)
        return ret;

#ifdef PR_SET_THP_DISABLE
    ret = prctl(PR_SET_THP_DISABLE, 1, 0, 0, 0);
#endif

    return ret;
}

void linuxMemoryWarnings(void) {
    sds err_msg = NULL;
    if (checkOvercommit(&err_msg) < 0) {
        serverLog(LL_WARNING,"WARNING %s", err_msg);
        sdsfree(err_msg);
    }
    if (checkTHPEnabled(&err_msg) < 0) {
        server.thp_enabled = 1;
        if (THPDisable() == 0) {
            server.thp_enabled = 0;
        } else {
            serverLog(LL_WARNING, "WARNING %s", err_msg);
        }
        sdsfree(err_msg);
    }
}`,
		notes: [
			'La ligne 24 appelle [`checkTHPEnabled`](' + REDIS + '/src/syscheck.c#L146-L170), qui lit `/sys/kernel/mm/transparent_hugepage/enabled` et n’échoue que si elle trouve `[always]`. Avec `madvise` ou `never`, Redis ne fait rien.',
			'La ligne 12 pose le drapeau de désactivation de THP sur le processus Redis avec `prctl`. La [page de manuel](https://man7.org/linux/man-pages/man2/PR_SET_THP_DISABLE.2const.html) dit que ce drapeau est "inherited by a child created via fork(2)", donc l’enfant qui écrit l’instantané n’a pas THP non plus.',
			'Les lignes 8 et 9 sautent le `prctl` quand l’option `disable-thp` vaut `no`. `redis.conf` la livre à `disable-thp yes`. La ligne 29 n’écrit l’avertissement que si l’appel à `prctl` a échoué ou a été sauté.',
			'La ligne 25 met `thp_enabled` à 1 avant d’essayer. La valeur sert plus tard : l’[enfant](' + REDIS + '/src/server.c#L6994-L6995) saute `madvise(MADV_DONTNEED)` parce que cet appel "may not work if Transparent Huge Pages is enabled".'
		]
	},
	tradeoff: {
		gain: [
			'Une entrée du TLB couvre 2 MB au lieu de 4 KB, donc un processus avec beaucoup de mémoire active rate moins souvent le TLB et parcourt moins souvent la table des pages.',
			'Le premier accès à une plage de 2 MB coûte un défaut de page au lieu de 512.',
			'La doc du noyau dit de THP : "It requires no modifications for applications to take advantage of it."'
		],
		cost: [
			'Un programme qui projette une grande plage et n’en touche qu’un octet peut recevoir une page de 2 MB "instead of a 4k page for no good", selon la doc du noyau.',
			'Trouver 2 MB de mémoire libre contiguë peut demander une compaction pendant le défaut de page, un blocage au milieu d’une requête.',
			'Après `fork`, une écriture d’un octet copie une page de 2 MB. Un instantané Redis sous charge d’écriture peut doubler sa mémoire, comme le décrit sa doc sur la latence.'
		]
	},
	task: {
		prompt: 'Lance `cat /sys/kernel/mm/transparent_hugepage/enabled`, `grep AnonHugePages /proc/meminfo` et `grep -E "thp_fault_(alloc|fallback) " /proc/vmstat`. Avec THP en mode `madvise`, pourquoi `AnonHugePages` n’est-il pas à 0, et quel processus tient ces pages ?',
		hint: 'En mode `madvise`, seules les plages marquées `MADV_HUGEPAGE` reçoivent des grandes pages. proc_pid_smaps(5) donne pour chaque projection ses `AnonHugePages` et ses `VmFlags`, où `hg` est le "huge page advise flag".',
		answer: [
			'Sortie capturée pendant cette session sur un noyau 6.17 : `always [madvise] never`, `AnonHugePages: 36864 kB`, `thp_fault_alloc 110653`, `thp_fault_fallback 11882`. 36864 kB font 18 pages de 2 MB.',
			'La somme des `AnonHugePages` de chaque `/proc/<pid>/smaps` a trouvé deux processus `node` qui lancent `vite preview`, avec 18432 kB chacun, soit 9 grandes pages.',
			'Dans les deux, les pages sont dans une projection nommée `[anon:mimalloc]` dont les `VmFlags` contiennent `hg`. L’allocateur mimalloc a appelé `madvise(MADV_HUGEPAGE)` sur son tas, donc le noyau a donné des pages de 2 MB à cette plage.',
			'Les compteurs de vmstat courent depuis le démarrage. 11882 défauts sur 122535 pour une grande page, environ 1 sur 10, n’ont trouvé aucun bloc libre de 2 MB et se sont repliés sur des pages de 4 KB.'
		]
	},
	quiz: [
		{
			q: 'THP est en mode `madvise`. Un programme fait `malloc` de 1 GB, n’appelle jamais `madvise`, et écrit dans toute la plage. Quelle taille de page sert cette mémoire ?',
			options: [
				'4 KB : seules les plages marquées `MADV_HUGEPAGE` ont des grandes pages',
				'Des pages de 2 MB, car l’allocation dépasse largement 2 MB',
				'Des pages de 1 GB, car l’allocation fait exactement 1 GB',
				'Des pages de 4 KB au premier défaut, puis de 2 MB ensuite'
			],
			answer: 0,
			why: 'La doc du noyau : le mode `madvise` veut dire des grandes pages "only enabled inside MADV_HUGEPAGE regions". La taille de l’allocation ne joue aucun rôle. THP donne des pages de 2 MB ou plus petites, et les pages de 1 GB viennent de hugetlbfs.'
		},
		{
			q: 'Redis tourne avec THP à `always` et `disable-thp no`. Il fait un `fork` pour écrire un instantané pendant que les clients continuent d’écrire. Pourquoi la mémoire grossit-elle plus vite qu’avec des pages de 4 KB ?',
			options: [
				'Le processus enfant lit les données dans ses propres tampons de 2 MB',
				'Chaque écriture sur une page partagée copie 2 MB au lieu de 4 KB',
				'`khugepaged` double chaque grande page dès le retour de `fork`',
				'Le TLB doit garder une deuxième copie de chaque projection pour l’enfant'
			],
			answer: 1,
			why: 'Après `fork`, les pages sont partagées en copie à l’écriture. La première écriture sur une page partagée copie toute la page, et avec THP cette page fait 2 MB. La doc de Redis dit que cela provoque "the copy on write of almost the whole process memory".'
		},
		{
			q: '`defrag` est à `always`, THP aussi. Un programme touche une nouvelle plage de 2 MB du tas, et aucun bloc libre de 2 MB n’existe. Que voit le programme ?',
			options: [
				'Un SIGBUS, parce que la grande page n’a pas pu être allouée',
				'Un ENOMEM de `malloc`, qui réessaie ensuite avec des pages plus petites',
				'Son défaut de page bloque pendant que le noyau récupère et compacte la mémoire',
				'Rien, le noyau donne des pages de 4 KB tout de suite et khugepaged corrige plus tard'
			],
			answer: 2,
			why: 'La doc du noyau : avec `always`, l’application "will stall on allocation failure and directly reclaim pages and compact memory in an effort to allocate a THP immediately". Le repli immédiat, c’est ce que font `defer` et `never`.'
		}
	],
	recall: {
		q: 'Pourquoi les pages de 2 MB réduisent-elles les défauts de TLB, et pourquoi Redis coupe-t-il THP pour son propre processus ?',
		a: 'Une entrée du TLB couvre 512 fois plus de mémoire qu’avec des pages de 4 KB. Redis fait un `fork` pour ses instantanés, et après `fork` chaque écriture sur une grande page partagée copie 2 MB, ce qui coûte en latence et en mémoire.'
	},
	sources: [
		{ title: 'Linux v6.12, Documentation/admin-guide/mm/transhuge.rst', url: THP },
		{ title: 'Linux v6.12, Documentation/admin-guide/mm/concepts.rst (Huge Pages)', url: `${K}/Documentation/admin-guide/mm/concepts.rst` },
		{ title: 'Redis 8.2.0, src/server.c', url: `${REDIS}/src/server.c` },
		{ title: 'Documentation Redis, Diagnosing latency issues', url: 'https://redis.io/docs/latest/operate/oss_and_stack/management/optimization/latency/' },
		{ title: 'Manuel MongoDB 7.0, Disable Transparent Huge Pages', url: 'https://www.mongodb.com/docs/v7.0/tutorial/transparent-huge-pages/' },
		{ title: 'Manuel MongoDB, TCMalloc Performance Optimization', url: 'https://www.mongodb.com/docs/manual/administration/tcmalloc-performance/' },
		{ title: 'proc_pid_smaps(5), man7.org', url: 'https://man7.org/linux/man-pages/man5/proc_pid_smaps.5.html' }
	]
};
