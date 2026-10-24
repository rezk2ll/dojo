const LINUX = 'https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a';
const UTIL = `${LINUX}/mm/util.c`;
const OVERCOMMIT = `${LINUX}/Documentation/mm/overcommit-accounting.rst`;
const SYSCTL_VM = `${LINUX}/Documentation/admin-guide/sysctl/vm.rst`;
const MEMINFO = `${LINUX}/fs/proc/meminfo.c`;
const PAGE_TABLES = `${LINUX}/Documentation/mm/page_tables.rst`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'virtual-memory',
	part: 'La mémoire',
	title: 'La mémoire virtuelle',
	minutes: 10,
	hook: [
		'La machine de ce chapitre est un portable avec 27 GiB de RAM et 3,8 GiB de swap. Un script Python appelle `mmap` pour 100 GiB de mémoire anonyme, et l’appel rend la main tout de suite. `/proc/self/status` affiche alors `VmSize: 104918924 kB` et `VmRSS: 10748 kB`.',
		'Le processus possède une plage de 100 GiB d’adresses et utilise 10 MiB de RAM. **Le noyau donne la RAM page par page, 4 KiB à la fois, à la première écriture dans chaque page.** Le script écrit un octet tous les 4096 octets sur 200 MiB : `VmRSS` grandit de 204800 kB, et le processus prend 51200 défauts de page.',
		'La FAQ de Go répond à la même surprise pour les programmes Go : « The Go memory allocator reserves a large region of virtual memory as an arena for allocations », et « the reservation does not deprive other processes of memory ». Elle conseille de lire plutôt la colonne RES de `top`.'
	],
	terms: [
		{ term: 'Page', def: 'L’unité dans laquelle le noyau découpe la mémoire : 4096 octets ici (`getconf PAGESIZE`). Une page d’un processus a une page de RAM derrière elle, ou pas encore.' },
		{ term: 'Table des pages', def: 'La table propre à chaque processus que le CPU lit pour traduire une adresse virtuelle en adresse de RAM. La ligne `VmPTE` de `status` donne sa taille.' },
		{ term: 'VSZ et RSS', def: 'VSZ (`VmSize`) est la taille de toutes les plages d’adresses que le processus a mappées. RSS (`VmRSS`) est la part qui est en RAM maintenant. `ps` affiche les deux, en KiB.' },
		{ term: 'Overcommit', def: 'Le fait de laisser les processus mapper plus de mémoire que RAM plus swap, en pariant qu’ils n’y toucheront pas en entier. `vm.overcommit_memory` choisit la politique.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['map["mmap(100 GiB, MAP_PRIVATE, MAP_ANONYMOUS)"] --> acct["__vm_enough_memory : le processus peut-il engager 26214400 pages ?"]'],
				highlight: ['map', 'acct'],
				note: 'Un mapping privé, inscriptible et anonyme compte pour toute sa taille dans la mémoire engagée du noyau. Avant de créer le mapping, le noyau ajoute les pages à `Committed_AS` et consulte la politique d’overcommit. 100 GiB font 26214400 pages de 4 KiB.'
			},
			{
				add: ['acct -->|"mode 1 ici : toujours oui"| vma["Nouvelle plage d’adresses : VmSize +100 GiB, VmRSS inchangé"]', 'acct -.->|"mode 0 : plus que RAM + swap"| enomem["mmap échoue avec ENOMEM"]'],
				highlight: ['vma', 'enomem'],
				note: 'Ce portable tourne avec `vm.overcommit_memory = 1`, donc la réponse est oui. Dans le mode 0, celui par défaut, le noyau refuse une demande plus grande que la RAM totale plus le swap : 100 GiB dépassent 27 + 3,8 GiB, et le même `mmap` échouerait. Dans les deux cas, aucune RAM n’est encore utilisée.'
			},
			{
				add: ['vma -->|"première écriture à l’offset 0"| fault["Défaut de page : aucune entrée pour cette adresse"]', 'fault --> page["Le noyau fournit une page de 4 KiB à zéro, puis l’écriture reprend"]'],
				highlight: ['fault', 'page'],
				note: 'À la première écriture, la MMU ne trouve aucune traduction pour l’adresse et déclenche un défaut de page. La doc du noyau appelle ça la « Lazy Allocation ». Le noyau associe une page de RAM à l’adresse, remplie de zéros pour `MAP_ANONYMOUS`, et l’écriture est rejouée. `getrusage` la compte dans `ru_minflt`, un défaut « serviced without any I/O activity ».'
			},
			{
				add: ['page -->|"51200 écritures, à 4096 octets d’écart"| rss["VmRSS +204800 kB, VmPTE de 80 à 488 kB, minflt +51200"]'],
				highlight: ['rss'],
				note: '200 MiB divisés par 4 KiB donnent 51200 pages, et le script a pris exactement 51200 défauts mineurs de plus. Le RSS a grandi de 204800 kB, la taille des pages touchées. La table des pages est passée de 80 kB à 488 kB pour ranger les nouvelles entrées.'
			},
			{
				add: ['rss --> left["99,8 GiB jamais touchés : pas de RAM, mais comptés dans Committed_AS"]'],
				highlight: ['left'],
				note: 'Les 99,8 GiB restants ne coûtent aucune RAM. Ils comptent quand même dans `Committed_AS`, qui valait 24291668 kB sur ce portable pour une `CommitLimit` de 18183952 kB. Seul le mode 2 applique cette limite : les nouveaux mappings y échouent dès que `Committed_AS` la dépasserait.'
			}
		]
	},
	example: {
		title: 'mm/util.c (Linux v6.12) : __vm_enough_memory, le contrôle d’overcommit',
		repo: 'torvalds/linux',
		url: `${UTIL}#L1032-L1076`,
		lang: 'c',
		code: `int __vm_enough_memory(struct mm_struct *mm, long pages, int cap_sys_admin)
{
	long allowed;
	unsigned long bytes_failed;

	vm_acct_memory(pages);

	/*
	 * Sometimes we want to use more memory than we have
	 */
	if (sysctl_overcommit_memory == OVERCOMMIT_ALWAYS)
		return 0;

	if (sysctl_overcommit_memory == OVERCOMMIT_GUESS) {
		if (pages > totalram_pages() + total_swap_pages)
			goto error;
		return 0;
	}

	allowed = vm_commit_limit();
	/*
	 * Reserve some for root
	 */
	if (!cap_sys_admin)
		allowed -= sysctl_admin_reserve_kbytes >> (PAGE_SHIFT - 10);

	/*
	 * Don't let a single process grow so big a user can't recover
	 */
	if (mm) {
		long reserve = sysctl_user_reserve_kbytes >> (PAGE_SHIFT - 10);

		allowed -= min_t(long, mm->total_vm / 32, reserve);
	}

	if (percpu_counter_read_positive(&vm_committed_as) < allowed)
		return 0;
error:
	bytes_failed = pages << PAGE_SHIFT;
	pr_warn_ratelimited("%s: pid: %d, comm: %s, bytes: %lu not enough memory for the allocation\\n",
			    __func__, current->pid, current->comm, bytes_failed);
	vm_unacct_memory(pages);

	return -ENOMEM;
}`,
		notes: [
			'La ligne 6 ajoute la demande à `vm_committed_as` avant tout contrôle. [`meminfo.c`](' + MEMINFO + '#L128) affiche ce compteur sous le nom `Committed_AS`. La ligne 42 retire les pages quand la demande échoue.',
			'Les lignes 11 et 12 sont le mode 1, `OVERCOMMIT_ALWAYS` : la fonction renvoie 0 et tout mapping réussit. La doc sysctl dit que le noyau « pretends there is always enough memory until it actually runs out ».',
			'Les lignes 14 à 17 sont le mode 0, par défaut. La ligne 15 compare cette seule demande à la RAM totale plus le swap, en pages. Un `mmap` de 100 GiB sur ce portable de 27 GiB avec 3,8 GiB de swap échoue ici, et un de 20 GiB passe, quelle que soit la mémoire déjà engagée.',
			'Les lignes 20 à 37 sont le mode 2. `vm_commit_limit()` renvoie la RAM multipliée par `overcommit_ratio` / 100, plus le swap, moins des réserves pour root et pour le processus. La ligne 36 refuse la demande dès que le total engagé atteint cette limite, et la ligne 40 écrit « not enough memory for the allocation » dans le journal du noyau.'
		]
	},
	tradeoff: {
		gain: [
			'Un processus ne paie en RAM que les pages qu’il écrit : 200 MiB d’écritures coûtent 204800 kB de RSS, sur un mapping de 100 GiB.',
			'Un programme peut réserver de grandes plages d’avance, comme l’arène de l’allocateur Go, sans prendre de mémoire aux autres processus.'
		],
		cost: [
			'Chaque première écriture dans une page passe par le noyau : 51200 défauts mineurs pour remplir 200 MiB.',
			'Avec l’overcommit, `mmap` et `malloc` réussissent pour de la mémoire qui n’existe peut-être pas. Si les processus l’écrivent vraiment, le noyau ne peut plus faire échouer l’appel, et l’OOM killer termine un processus à la place (chapitre 11).',
			'Un tableau de bord qui trace la VSZ affiche 100 GiB pour un processus qui utilise 210 MiB de RAM.'
		]
	},
	task: {
		prompt: 'Sur une machine en `vm.overcommit_memory = 1`, un processus affiche `VmSize: 104918924 kB`, `VmRSS: 215548 kB` et `VmPTE: 488 kB`. `/proc/meminfo` montre `CommitLimit: 18183952 kB` et `Committed_AS: 24291668 kB`. Combien de RAM le processus utilise-t-il ? Qu’aurait fait son `mmap` de 100 GiB en mode 0, puis en mode 2 ?',
		hint: 'Le mode 0 compare une seule demande à RAM plus swap (27 GiB + 3,8 GiB ici). Le mode 2 compare le total engagé à `CommitLimit`.',
		answer: [
			'RAM : environ 210 MiB, la valeur de `VmRSS`, plus 488 kB de tables des pages. `VmSize` compte des adresses sans RAM derrière elles.',
			'Mode 0 : 100 GiB dépassent 27 GiB de RAM plus 3,8 GiB de swap, donc la ligne 15 de `__vm_enough_memory` refuse et `mmap` renvoie `ENOMEM`.',
			'Mode 2 : `Committed_AS` vaut déjà 24291668 kB, au-dessus de la `CommitLimit` de 18183952 kB. Ce mapping et toute nouvelle mémoire engagée échouent avec `ENOMEM`.',
			'Regarde ta machine avec `sysctl vm.overcommit_memory` et `grep -i commit /proc/meminfo`. La valeur par défaut est 0.'
		],
		steps: [
			{
				title: 'Lis les lignes du processus',
				questions: [
					{ q: 'Quelle ligne te dit combien de RAM le processus utilise ?', options: ['`VmSize: 104918924 kB`', '`VmRSS: 215548 kB`', '`VmPTE: 488 kB`', '`Committed_AS: 24291668 kB`'], answer: 1, why: 'Le RSS est la part de la mémoire mappée qui est en RAM maintenant.' },
					{ q: '`VmRSS: 215548 kB`, ça fait environ combien ?', options: ['Environ 210 MiB', 'Environ 2 GiB', 'Environ 21 MiB', 'Environ 100 GiB'], answer: 0, why: '215548 kB divisés par 1024 font environ 210 MiB.' },
					{ q: 'Que compte `VmSize: 104918924 kB` ?', options: ['La RAM plus le swap utilisés par le processus', 'Les pages où le processus a écrit', 'Chaque plage mappée, avec RAM ou non', 'La mémoire en RAM de tous ses threads'], answer: 2, why: 'Le VSZ est la taille de chaque mapping, y compris les 100 GiB que le processus n’a jamais écrits.' },
					{ q: 'Qu’est-ce que `VmPTE: 488 kB` ?', options: ['La mémoire partie en swap', 'Les bibliothèques partagées qu’il mappe', 'La pile du thread principal', 'Ses tables des pages'], answer: 3, why: 'La table des pages grandit avec les pages qui ont de la RAM. Ajoute-la au RSS pour le vrai coût.' }
				]
			},
			{
				title: 'Lis les lignes d’engagement',
				questions: [
					{ q: 'Que compte `Committed_AS` ?', options: ['La RAM utilisée maintenant par tous les processus', 'La mémoire promise par les mappings, écrite ou non', 'Le swap utilisé maintenant', 'Le cache de pages qui garde les fichiers'], answer: 1, why: '`__vm_enough_memory` ajoute chaque mapping privé et inscriptible à `vm_committed_as`, affiché comme `Committed_AS`.' },
					{ q: '`Committed_AS` vaut 24291668 kB et `CommitLimit` 18183952 kB. Est-ce une erreur ?', options: ['Non : en mode 1, seul le mode 2 applique la limite', 'Oui : le noyau manque de mémoire', 'Oui : l’OOM killer va tourner tout de suite', 'Non : les deux nombres ne sont pas dans la même unité'], answer: 0, why: 'Seul le mode 2 refuse les nouveaux engagements au-delà de `CommitLimit`. Le mode 1 ne vérifie jamais.' },
					{ q: 'En mode 1, que répond le noyau au `mmap` de 100 GiB ?', options: ['Il demande root', 'Non, si RAM plus swap est plus petit', 'Oui, mais seulement pour les 27 premiers GiB', 'Toujours oui'], answer: 3, why: '`OVERCOMMIT_ALWAYS` renvoie 0 tout de suite : le noyau « pretends there is always enough memory ».' },
					{ q: 'Pourquoi le mapping de 100 GiB n’a-t-il coûté presque aucune RAM ?', options: ['Il a été compressé', 'Il est parti en swap', 'La RAM arrive page par page, à l’écriture', 'Le noyau le partage avec d’autres processus'], answer: 2, why: 'Seuls les 200 MiB que le processus a écrits ont reçu des pages de RAM.' }
				]
			},
			{
				title: 'Applique le mode 0',
				questions: [
					{ q: 'À quoi le mode 0 compare-t-il une demande ?', options: ['À la RAM totale plus le swap total', 'À la RAM libre seulement, sans le swap', 'À `CommitLimit`', 'Au RSS du processus'], answer: 0, why: 'Ligne 15 de `__vm_enough_memory` : `pages > totalram_pages() + total_swap_pages`.' },
					{ q: 'La RAM fait 27 GiB et le swap 3,8 GiB. Que devient un `mmap` de 100 GiB ?', options: ['Il passe, le contrôle se fait par page', 'Il passe, seules les écritures sont contrôlées', 'Il échoue avec `ENOMEM`', 'L’OOM killer tourne'], answer: 2, why: '100 GiB dépassent 27 + 3,8 GiB : la demande est refusée.' },
					{ q: 'En mode 0, un `mmap` de 20 GiB passerait-il sur le même portable ?', options: ['Non, `Committed_AS` dépasse la limite', 'Non, toute demande au-dessus de la RAM libre échoue', 'Seulement pour root', 'Oui, quel que soit le total déjà engagé'], answer: 3, why: 'Le mode 0 ne regarde que la demande, pas le total engagé.' },
					{ q: 'En mode 0, de la RAM est-elle utilisée quand le mapping réussit ?', options: ['Oui, toute la taille, d’un coup', 'Non, pas avant qu’il écrive dans les pages', 'La moitié, le reste à la première écriture', 'Seulement les tables des pages, en entier'], answer: 1, why: 'Le contrôle porte sur l’engagement. La RAM arrive toujours page par page, à la première écriture.' }
				]
			},
			{
				title: 'Applique le mode 2',
				questions: [
					{ q: 'Que compare le mode 2 ?', options: ['Le total engagé à `CommitLimit`', 'Une demande à RAM plus swap', 'Le RSS au VSZ', 'La RAM libre à la demande'], answer: 0, why: 'La ligne 36 refuse la demande dès que `vm_committed_as` atteint la limite.' },
					{ q: 'Ici, `Committed_AS` dépasse déjà `CommitLimit`. Que fait le `mmap` de 100 GiB ?', options: ['Il passe, puisque de la RAM est libre', 'Il passe, puis l’OOM killer tourne', 'Il attend que de la mémoire se libère', 'Il échoue avec `ENOMEM`'], answer: 3, why: 'Le total engagé dépasse la limite : chaque nouvel engagement est refusé.' },
					{ q: 'Et un `mmap` privé et inscriptible de 1 MiB venant d’un autre processus ?', options: ['Il passe : les petites demandes sont exemptées', 'Il échoue aussi : tout nouvel engagement est refusé', 'Il passe pour n’importe quel utilisateur', 'Il est déplacé en swap'], answer: 1, why: 'Le mode 2 contrôle le total, et ce total dépasse déjà la limite : les petites demandes échouent aussi.' },
					{ q: 'Que voit un programme en mode 2 qu’il ne verrait pas en mode 1 ?', options: ['Un SIGKILL de l’OOM killer plus tard', 'Un RSS plus haut qu’en mode 0', 'Un `mmap` raté tout de suite', 'Une table des pages plus grande'], answer: 2, why: 'Le mode 2 fait échouer l’appel d’emblée. Le mode 1 le laisse passer, et l’OOM killer peut agir plus tard.' }
				]
			}
		]
	},
	quiz: [
		{
			q: '`ps` montre un processus avec une VSZ de 100 GiB et un RSS de 210 MiB sur une machine de 27 GiB. Combien de RAM utilise-t-il ?',
			options: [
				'100 GiB, et le reste est dans le swap',
				'Environ 210 MiB, le RSS',
				'100 GiB moins 210 MiB',
				'Rien, puisque la mémoire est virtuelle'
			],
			answer: 1,
			why: 'Le RSS compte les pages présentes en RAM maintenant. La VSZ compte toutes les adresses mappées, y compris celles que le processus n’a jamais écrites et qui n’ont aucune page de RAM derrière elles.'
		},
		{
			q: 'Un programme appelle `malloc(1 GiB)` et n’y écrit rien. Comment évolue son RSS ?',
			options: [
				'Il grandit de 1 GiB d’un coup, car `malloc` met la mémoire à zéro',
				'Il reste à peu près le même jusqu’à ce que le programme écrive dans les pages',
				'Il grandit de 1 GiB, et le noyau le reprend au bout d’une minute',
				'Il diminue, car le noyau envoie d’autres pages dans le swap pour faire de la place'
			],
			answer: 1,
			why: 'Un gros `malloc` mappe de l’espace d’adresses. Le noyau ne donne une page de RAM au processus qu’à la première écriture dans cette page, par un défaut de page : le RSS suit les écritures.'
		},
		{
			q: 'Tu règles `vm.overcommit_memory = 2`. Qu’est-ce qui change quand la mémoire manque ?',
			options: [
				'L’OOM killer passe plus tôt et choisit le plus gros processus',
				'Le noyau arrête de compter `Committed_AS`',
				'Le swap est coupé, et les pages restent en RAM',
				'Les nouvelles allocations échouent avec `ENOMEM` une fois la limite atteinte'
			],
			answer: 3,
			why: 'En mode 2, `__vm_enough_memory` refuse une demande quand `Committed_AS` atteint le swap plus `overcommit_ratio` pour cent de la RAM. Le programme voit un `mmap` raté ou un NULL de `malloc` au lieu d’être tué plus tard.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Mapper une grande plage de mémoire, voir le RSS rester plat, puis la payer un défaut de page à la fois.',
		steps: [
			'Crée un dossier de travail : `mkdir -p ~/vm-lab && cd ~/vm-lab`. Ce lab demande Linux.',
			'Regarde la politique et la taille de page : `sysctl vm.overcommit_memory; getconf PAGESIZE; grep -i commit /proc/meminfo`.',
			'Écris le script : `printf \'import mmap, resource, sys\\ndef show(label):\\n    f = [" ".join(l.split()) for l in open("/proc/self/status") if l.startswith(("VmSize", "VmRSS", "VmPTE"))]\\n    print(label, f, "minflt", resource.getrusage(resource.RUSAGE_SELF).ru_minflt)\\nshow("start")\\nm = mmap.mmap(-1, int(sys.argv[1]) << 30, flags=mmap.MAP_PRIVATE | mmap.MAP_ANONYMOUS)\\nshow("mapped")\\nfor off in range(0, 200 << 20, 4096): m[off] = 1\\nshow("touched")\\n\' > vm.py`.',
			'Mappe 2 GiB et touches-en 200 MiB : `python3 vm.py 2`.',
			'Demande maintenant 100 GiB : `python3 vm.py 100`.'
		],
		done: [
			'Après `mapped`, `VmSize` a grandi d’environ 2097152 kB et `VmRSS` a à peine bougé.',
			'De `mapped` à `touched`, `VmRSS` grandit d’environ 204800 kB, `VmPTE` grandit, et `minflt` monte d’exactement 51200.',
			'Avec 100 GiB : en mode 0, sur une machine avec moins de 100 GiB de RAM plus swap, `mmap` échoue avec `[Errno 12] Cannot allocate memory`. En mode 1, il réussit et `VmSize` affiche environ 104900000 kB.'
		],
		solution: [
			'`mmap` ne crée qu’une plage d’adresses. Le noyau donne une page de RAM à la première écriture, par un défaut de page mineur.',
			'200 MiB divisés par des pages de 4 KiB font 51200 pages : 51200 défauts et 204800 kB de RSS. La table des pages grandit pour tenir les nouvelles entrées.',
			'Le mode 0 compare une seule demande à RAM plus swap, et refuse 100 GiB sur un portable. Le mode 1 dit oui à tout. Le mode 2 comparerait `Committed_AS` à `CommitLimit`.'
		]
	},
	recall: {
		q: 'Un processus mappe 100 GiB puis en écrit 200 MiB. Que valent sa VSZ et son RSS, et quand a-t-il reçu chaque page de RAM ?',
		a: 'VSZ d’environ 100 GiB, RSS d’environ 200 MiB de plus qu’avant. Chaque page de 4 KiB a reçu de la RAM à sa première écriture, par un défaut de page : 51200 défauts pour 200 MiB.'
	},
	sources: [
		{ title: 'Linux v6.12, Documentation/mm/overcommit-accounting.rst', url: OVERCOMMIT },
		{ title: 'Linux v6.12, Documentation/admin-guide/sysctl/vm.rst (overcommit_memory)', url: SYSCTL_VM },
		{ title: 'Linux v6.12, mm/util.c', url: UTIL },
		{ title: 'Linux v6.12, Documentation/mm/page_tables.rst (MMU, TLB, and Page Faults)', url: PAGE_TABLES },
		{ title: 'proc_pid_status(5), page de manuel Linux', url: 'https://man7.org/linux/man-pages/man5/proc_pid_status.5.html' },
		{ title: 'getrusage(2), page de manuel Linux', url: 'https://man7.org/linux/man-pages/man2/getrusage.2.html' },
		{ title: 'FAQ Go, Why does my Go process use so much virtual memory?', url: 'https://go.dev/doc/faq#Why_does_my_Go_process_use_so_much_virtual_memory' }
	]
};
