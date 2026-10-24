const LINUX = 'https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a';
const SHOW_MEM = `${LINUX}/mm/show_mem.c`;
const PROC_RST = `${LINUX}/Documentation/filesystems/proc.rst`;
const COMMIT = 'https://github.com/torvalds/linux/commit/34e431b0ae398fc54ea69ff85ec700722c9da773';
const SYSCTL_VM = `${LINUX}/Documentation/admin-guide/sysctl/vm.rst`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'page-cache',
	part: 'La mémoire',
	title: 'Le cache de pages',
	minutes: 10,
	hook: [
		'`free -h` sur le portable de ce chapitre : `total 27Gi`, `used 6.1Gi`, `free 1.6Gi`, `buff/cache 20Gi`, `available 20Gi`. Seulement 1,6 GiB est libre, et 20 GiB restent disponibles pour les programmes.',
		'Les 20 GiB de buff/cache sont des données de fichiers et de disque que le noyau a lues, plus des caches du noyau. **Le noyau garde les pages de fichiers en RAM au cas où quelqu’un les relirait, et les rend quand un programme a besoin de mémoire.**',
		'En 2014, Rik van Riel a ajouté `MemAvailable` à `/proc/meminfo`. Son message de commit donne la raison : les programmes estimaient la mémoire libre « by adding up "free" and "cached", which was fine ten years ago, but is pretty much guaranteed to be wrong today. »'
	],
	terms: [
		{ term: 'Cache de pages', def: 'Des pages de RAM qui contiennent le contenu de fichiers, remplies quand un processus lit ou écrit un fichier. `/proc/meminfo` le montre sous `Cached`, avec tmpfs et la mémoire partagée.' },
		{ term: 'MemFree', def: 'La RAM qui ne contient rien du tout. `free` l’affiche dans la colonne `free`.' },
		{ term: 'MemAvailable', def: 'L’estimation du noyau « of how much memory is available for starting new applications, without swapping » : les pages libres, plus le cache de pages et la mémoire slab qu’il peut récupérer. `free` l’affiche dans `available`.' },
		{ term: 'Page sale', def: 'Une page du cache modifiée par un `write` et pas encore écrite sur le disque. Le noyau doit l’écrire avant de pouvoir réutiliser la page.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['r1["Première lecture de med.bin, 256 MiB"] -->|"page absente du cache"| disk[("Disque")]', 'disk --> pc["Cache de pages : 65536 pages de med.bin"]', 'pc --> u1["Copie dans le tampon du lecteur"]'],
				highlight: ['r1', 'disk', 'pc'],
				note: 'Le noyau cherche chaque page du fichier dans le cache de pages, ne la trouve pas, la lit sur le disque dans une page libre et la copie au processus. `/proc/self/io` a montré `read_bytes` à 268435456 : chaque octet venait du disque. La lecture a pris 0,07 s.'
			},
			{
				add: ['r2["Deuxième lecture, par un nouveau processus"] -->|"page trouvée"| pc'],
				highlight: ['r2'],
				note: 'Un deuxième processus Python a lu le même fichier. `read_bytes` valait 0, `rchar` toujours 268435564, et la lecture a pris 0,01 s. Le cache de pages appartient au noyau : tout processus qui lit le fichier profite des pages en cache.'
			},
			{
				add: ['pc --> meminfo["/proc/meminfo : Cached monte, MemFree baisse"]'],
				highlight: ['meminfo'],
				note: 'Ces pages quittent `MemFree` et comptent dans `Cached`. `free` additionne `Buffers`, `Cached` et `SReclaimable` dans buff/cache : 7061852 + 10194356 + 3816928 = 21073136 kB sur ce portable.'
			},
			{
				add: ['app["Un programme demande 2 GiB"] -->|"MemFree insuffisant"| reclaim["Le noyau récupère des pages propres du cache"]', 'reclaim --> pc'],
				highlight: ['app', 'reclaim'],
				note: 'Quand un programme demande plus de pages qu’il n’y en a de libres, le noyau les prend au cache de pages. Une page propre est identique au fichier sur le disque : le noyau peut la lâcher sans rien écrire. La doc de `drop_caches` précise que même un vidage manuel « will not free any dirty objects » : celles-là doivent d’abord partir sur le disque. `Dirty` valait 1248 kB ici.'
			},
			{
				add: ['reclaim --> avail["MemAvailable = libre + une part du cache de fichiers + une part du slab"]', 'avail --> used["free : used = total - available"]'],
				highlight: ['avail', 'used'],
				note: '`si_mem_available()` suppose qu’une part du cache doit rester, la retire, puis ajoute le reste aux pages libres. `free` affiche ensuite `used` comme le total moins le disponible : 28365352 - 22012500 = 6352852 kB, le `6.1Gi` du début.'
			}
		]
	},
	example: {
		title: 'mm/show_mem.c (Linux v6.12) : si_mem_available, l’estimation de MemAvailable',
		repo: 'torvalds/linux',
		url: `${SHOW_MEM}#L32-L72`,
		lang: 'c',
		code: `long si_mem_available(void)
{
	long available;
	unsigned long pagecache;
	unsigned long wmark_low = 0;
	unsigned long reclaimable;
	struct zone *zone;

	for_each_zone(zone)
		wmark_low += low_wmark_pages(zone);

	/*
	 * Estimate the amount of memory available for userspace allocations,
	 * without causing swapping or OOM.
	 */
	available = global_zone_page_state(NR_FREE_PAGES) - totalreserve_pages;

	/*
	 * Not all the page cache can be freed, otherwise the system will
	 * start swapping or thrashing. Assume at least half of the page
	 * cache, or the low watermark worth of cache, needs to stay.
	 */
	pagecache = global_node_page_state(NR_ACTIVE_FILE) +
		global_node_page_state(NR_INACTIVE_FILE);
	pagecache -= min(pagecache / 2, wmark_low);
	available += pagecache;

	/*
	 * Part of the reclaimable slab and other kernel memory consists of
	 * items that are in use, and cannot be freed. Cap this estimate at the
	 * low watermark.
	 */
	reclaimable = global_node_page_state_pages(NR_SLAB_RECLAIMABLE_B) +
		global_node_page_state(NR_KERNEL_MISC_RECLAIMABLE);
	reclaimable -= min(reclaimable / 2, wmark_low);
	available += reclaimable;

	if (available < 0)
		available = 0;
	return available;
}`,
		notes: [
			'Les lignes 9 et 10 additionnent le filigrane « low » de chaque zone. La doc sysctl relie ces filigranes au réveil de `kswapd`, le thread de récupération en arrière-plan. L’estimation se sert de cette somme comme plafond du cache qu’elle met de côté.',
			'La ligne 16 part des pages libres et retire `totalreserve_pages`, que `calculate_totalreserve_pages()` construit à partir du filigrane haut et de la réserve lowmem de chaque zone.',
			'Les lignes 23 à 26 ajoutent le cache de fichiers : les listes de fichiers actifs et inactifs. La ligne 25 en garde de côté la moitié ou le filigrane bas, selon le plus petit. Le commentaire explique pourquoi : « Not all the page cache can be freed, otherwise the system will start swapping or thrashing. »',
			'Les lignes 33 à 36 font de même pour le slab récupérable, des objets du noyau « like dentries and inodes » selon la doc sysctl, car certains « are in use, and cannot be freed ». `free` lit le résultat sur la ligne `MemAvailable` de [`/proc/meminfo`](' + PROC_RST + '#L1076-L1084).'
		]
	},
	tradeoff: {
		gain: [
			'Relire un fichier en cache ne coûte aucune I/O disque : 0 octet lu sur le stockage et 0,01 s pour 256 MiB, contre 0,07 s la première fois.',
			'La RAM qu’aucun programme n’utilise garde des données de fichiers au lieu de rester vide, et le noyau la reprend sans rien écrire quand les pages sont propres.'
		],
		cost: [
			'`free` et les tableaux de bord qui tracent `MemFree` montrent une machine à 1,6 GiB libres sur 27 GiB alors que 20 GiB sont disponibles.',
			'Le noyau ne peut réutiliser une page sale qu’après l’avoir écrite sur le disque : un cache plein de pages sales libère la mémoire à la vitesse du disque.',
			'Quand le noyau lâche les pages d’un fichier qui est relu, la lecture suivante repart sur le disque : 0,07 s au lieu de 0,01 s pour 256 MiB ici.'
		]
	},
	task: {
		prompt: 'Un serveur affiche `MemTotal 28365352 kB`, `MemFree 1670320`, `MemAvailable 22012500`, `Buffers 7061852`, `Cached 10194356`, `SReclaimable 3816928`, `Active(file) 1814824`, `Inactive(file) 15170572`. Ta supervision t’alerte à « 94 % de mémoire utilisée ». Le serveur manque-t-il de mémoire ? Recalcule les colonnes `used` et `buff/cache` de `free`, puis estime MemAvailable à la main.',
		hint: 'free(1) : `used` vaut le total moins le disponible, et buff/cache vaut Buffers + Cached + SReclaimable. Le noyau ajoute les listes de fichiers et le slab récupérable aux pages libres, moins une réserve.',
		answer: [
			'L’alerte se base sur MemFree : 1670320 / 28365352 donne 5,9 % de libre, d’où « 94 % utilisés ». Ce chiffre compte le cache de pages comme utilisé.',
			'`used` = 28365352 - 22012500 = 6352852 kB (6,1 GiB, 22 %). buff/cache = 7061852 + 10194356 + 3816928 = 21073136 kB.',
			'À la main : 1670320 libres + 16985396 de listes de fichiers + 3816928 de slab = 22472644 kB. Le noyau annonce 22012500 kB, soit 460144 kB de moins : la réserve et le cache qu’il garde de côté.',
			'Le serveur va bien : 21 GiB sont disponibles. Alerte plutôt sur `MemAvailable`, ou sur le swap et les OOM kills (chapitres 11 et 12), qu’à partir de `MemFree`.'
		],
		steps: [
			{
				title: 'Vérifie ce que l’alerte a mesuré',
				questions: [
					{ q: 'Quelle ligne donne « 94 % utilisés » ?', options: ['`MemAvailable` sur `MemTotal`', '`MemFree` : 5,9 % de libre', '`Cached` sur `MemTotal`', '`SReclaimable`'], answer: 1, why: '100 % moins 5,9 % de libre font environ 94 %. L’alerte a lu `MemFree`.' },
					{ q: 'Que laisse de côté `MemFree` ?', options: ['Le swap en cours d’usage', 'La RAM qui ne contient rien du tout', 'Du cache de pages qu’il peut rendre', 'La mémoire des processus de root'], answer: 2, why: 'Les pages de fichiers gardées au cas où on les relise sortent de `MemFree`, alors que les programmes peuvent encore les obtenir.' },
					{ q: 'Le trafic s’arrête pour la nuit. L’alerte cesse-t-elle de sonner ?', options: ['Non : les fichiers en cache restent en RAM jusqu’à ce qu’on ait besoin de la mémoire', 'Oui : le noyau vide le cache quand le serveur est au repos', 'Oui : `MemFree` est remis à zéro chaque minute', 'Oui : le page cache expire au bout de 15 minutes'], answer: 0, why: 'Le noyau ne reprend le cache que quand la mémoire manque. Sur un serveur calme, `MemFree` reste bas, et une alerte dessus continue de sonner.' },
					{ q: 'Quelle colonne de `free -h` montre le même nombre que `MemFree` ?', options: ['`available`', '`buff/cache`', '`used`', '`free`'], answer: 3, why: 'La colonne `free`, c’est `MemFree` : 1670320 kB, environ 1,6 GiB. L’alerte repose sur ce nombre.' }
				]
			},
			{
				title: 'Recalcule used',
				questions: [
					{ q: 'Si `used` valait le total moins `MemFree`, comme le suppose l’alerte, combien ferait-il ?', options: ['6352852 kB', '26695032 kB', '21073136 kB', '1670320 kB'], answer: 1, why: '28365352 - 1670320 = 26695032 kB, 94 % de la RAM : le nombre de l’alerte.' },
					{ q: 'free(1) retranche `MemAvailable` au lieu de `MemFree`. De combien ça fait baisser `used` ?', options: ['1670320 kB', '22012500 kB', '20342180 kB', '6352852 kB'], answer: 2, why: '22012500 - 1670320 = 20342180 kB, environ 19,4 GiB que le noyau peut rendre aux programmes.' },
					{ q: 'Le `used` de free vaut 6352852 kB. Quelle part de la RAM est-ce ?', options: ['Environ 22 %', 'Environ 94 %', 'Environ 6 %', 'Environ 78 %'], answer: 0, why: '6352852 / 28365352 font environ 22 %, loin des 94 % de l’alerte.' },
					{ q: 'Combien est disponible pour de nouveaux programmes ?', options: ['Environ 1,6 GiB', 'Environ 6,1 GiB', 'Environ 10 GiB', 'Environ 21 GiB'], answer: 3, why: '`MemAvailable` vaut 22012500 kB, environ 21 GiB.' }
				]
			},
			{
				title: 'Recalcule buff/cache',
				questions: [
					{ q: 'Quelles trois lignes s’additionnent pour donner buff/cache ?', options: ['`Buffers`, `Cached`, `SReclaimable`', '`MemFree`, `Cached`, `Buffers`', '`Active(file)`, `Inactive(file)`, `Cached`', '`Cached`, `SReclaimable`, `MemAvailable`'], answer: 0, why: 'free(1) additionne `Buffers`, `Cached` et `SReclaimable`.' },
					{ q: 'Que vaut buff/cache ici ?', options: ['17256208 kB', '21073136 kB', '22012500 kB', '16985396 kB'], answer: 1, why: '7061852 + 10194356 + 3816928 = 21073136 kB.' },
					{ q: 'Quelle part de la RAM représente buff/cache ici ?', options: ['Environ 22 %', 'Environ 94 %', 'Environ 74 %', 'Environ 6 %'], answer: 2, why: '21073136 / 28365352 font environ 74 % : l’essentiel de la RAM que l’alerte disait utilisée contient du cache.' },
					{ q: 'Que doit-il se passer avant que le noyau réutilise une page sale ?', options: ['Rien, il la lâche', 'Un processus doit fermer le fichier', 'La page doit partir en swap', 'Elle doit être écrite sur le disque'], answer: 3, why: 'Une page sale diffère du fichier sur disque : elle est d’abord réécrite.' }
				]
			},
			{
				title: 'Estime MemAvailable',
				questions: [
					{ q: 'Quelles lignes forment les listes de fichiers que le noyau compte ?', options: ['`Active(file)` et `Inactive(file)`', '`Cached` et `Buffers`', '`Cached` seul', '`Buffers` et `SReclaimable`'], answer: 0, why: '`si_mem_available()` additionne `NR_ACTIVE_FILE` et `NR_INACTIVE_FILE`.' },
					{ q: 'Que vaut cette somme ici ?', options: ['10194356 kB', '15170572 kB', '16985396 kB', '21073136 kB'], answer: 2, why: '1814824 + 15170572 = 16985396 kB.' },
					{ q: 'Libre + listes de fichiers + slab récupérable, ça donne quoi ?', options: ['22012500 kB', '22472644 kB', '21073136 kB', '28365352 kB'], answer: 1, why: '1670320 + 16985396 + 3816928 = 22472644 kB.' },
					{ q: 'Le noyau annonce 22012500 kB, soit 460144 kB de moins. Pourquoi ?', options: ['Un arrondi de `free` au MiB près', 'Les pages sales qui attendent le disque', 'Le swap utilisé', 'Il garde de côté une réserve, du cache et du slab'], answer: 3, why: 'Il retire `totalreserve_pages` et garde de côté, pour le cache comme pour le slab, la moitié ou le filigrane bas, le plus petit des deux.' }
				]
			}
		]
	},
	quiz: [
		{
			q: '`free -h` affiche `free 1.6Gi` et `available 20Gi` sur une machine de 27 GiB. Qu’est-ce que cela veut dire ?',
			options: [
				'La machine n’a plus de mémoire et va bientôt utiliser le swap',
				'La RAM contient surtout du cache de fichiers que le noyau peut céder',
				'20 GiB sont réservés au noyau et ne peuvent pas servir',
				'Un programme a une fuite mémoire et sera bientôt tué par l’OOM killer'
			],
			answer: 1,
			why: 'Le cache de pages garde des pages de fichiers en RAM, ce qui fait baisser `MemFree`. `MemAvailable` ajoute le cache et le slab que le noyau peut récupérer : environ 20 GiB peuvent aller à de nouveaux programmes sans swap.'
		},
		{
			q: 'Un processus lit deux fois un fichier de 256 MiB. `/proc/self/io` montre `read_bytes` à 268435456 après la première lecture, puis rien de plus après la deuxième. Pourquoi ?',
			options: [
				'La deuxième lecture est servie par le cache de pages, sans accès disque',
				'Le processus a gardé le fichier dans son propre tas après la première lecture',
				'`read_bytes` ne compte que la première lecture de chaque fichier',
				'Le disque a son propre cache, et `read_bytes` l’ignore'
			],
			answer: 0,
			why: '`read_bytes` compte les octets « really fetched from the storage layer ». La première lecture a rempli le cache de pages. La deuxième y a trouvé chaque page et l’a copiée depuis la RAM, comme le montre `rchar`.'
		},
		{
			q: 'Pourquoi le noyau ne compte-t-il pas tout `Cached` comme disponible ?',
			options: [
				'`Cached` est compté en pages, et `MemAvailable` en kB',
				'Les pages en cache appartiennent au premier processus qui les a lues',
				'Une part est du tmpfs ou de la mémoire partagée, et un peu de cache doit rester',
				'`Cached` n’est mis à jour qu’une fois par minute'
			],
			answer: 2,
			why: '`Cached` inclut tmpfs et la mémoire partagée, que le noyau ne peut pas lâcher. `si_mem_available()` ne compte que les listes de fichiers, moins leur moitié ou le filigrane bas : le système garde assez de cache pour tourner.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Lire un fichier depuis le disque puis depuis le cache de pages, et recalculer les colonnes de `free` à partir de `/proc/meminfo`.',
		steps: [
			'Crée un dossier de travail et un fichier de 256 MiB : `mkdir -p ~/cache-lab && cd ~/cache-lab && head -c 268435456 /dev/urandom > med.bin && sync`. Ce lab demande Linux.',
			'Écris un script qui retire ce seul fichier du cache, sans root : `printf \'import os, sys\\nfd = os.open(sys.argv[1], os.O_RDONLY)\\nos.posix_fadvise(fd, 0, 0, os.POSIX_FADV_DONTNEED)\\n\' > evict.py`.',
			'Écris un script qui lit un fichier et affiche ses octets lus sur disque : `printf \'import sys, time\\nt = time.time()\\nwith open(sys.argv[1], "rb") as f:\\n    while f.read(1 << 20): pass\\nio = dict(l.split(": ") for l in open("/proc/self/io").read().split("\\\\n") if l)\\nprint("read_bytes", io["read_bytes"], "seconds", round(time.time() - t, 3))\\n\' > readit.py`.',
			'Vide le cache du fichier, puis lis deux fois : `python3 evict.py med.bin; python3 readit.py med.bin; python3 readit.py med.bin`.',
			'Recalcule `free` : lance `free -k` et `grep -E \'^(MemTotal|MemFree|MemAvailable|Buffers|Cached|SReclaimable):\' /proc/meminfo`. Nettoie avec `rm med.bin`.'
		],
		done: [
			'La première lecture affiche `read_bytes 268435456`, et la deuxième affiche `read_bytes 0` et prend moins de temps.',
			'Le `used` de `free` égale `MemTotal` moins `MemAvailable`, à quelques kB près qui ont changé entre les deux commandes.',
			'Le `buff/cache` de `free` égale `Buffers` + `Cached` + `SReclaimable`, au même petit écart près.'
		],
		solution: [
			'`read_bytes` compte les octets « really fetched from the storage layer ». La première lecture a rempli le cache de pages, et le deuxième processus y a trouvé chaque page.',
			'Le cache appartient au noyau, pas au processus : un nouveau processus obtient les pages en cache.',
			'`posix_fadvise(POSIX_FADV_DONTNEED)` demande au noyau de lâcher les pages propres en cache de ce seul fichier. `drop_caches` le fait pour toute la machine et demande root.',
			'`used` vaut le total moins le disponible : il laisse de côté le cache que le noyau peut rendre.'
		]
	},
	recall: {
		q: 'Quelle ligne de `/proc/meminfo` dit combien de mémoire un nouveau programme peut obtenir sans swap, et comment `free` en tire-t-il `used` ?',
		a: '`MemAvailable`, la colonne `available`. `used` = total - available, par exemple 28365352 - 22012500 = 6352852 kB.'
	},
	sources: [
		{ title: 'free(1), page de manuel Linux', url: 'https://man7.org/linux/man-pages/man1/free.1.html' },
		{ title: 'Linux v6.12, Documentation/filesystems/proc.rst (meminfo)', url: PROC_RST },
		{ title: 'Commit Linux 34e431b0ae39, /proc/meminfo: provide estimated available memory', url: COMMIT },
		{ title: 'Linux v6.12, mm/show_mem.c', url: SHOW_MEM },
		{ title: 'Linux v6.12, Documentation/admin-guide/sysctl/vm.rst (drop_caches, watermark_scale_factor)', url: SYSCTL_VM },
		{ title: 'proc_pid_io(5), page de manuel Linux', url: 'https://man7.org/linux/man-pages/man5/proc_pid_io.5.html' }
	]
};
