const K = 'https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a';
const OOM = `${K}/mm/oom_kill.c`;
const ISSUE = 'https://github.com/systemd/systemd/issues/38492';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'oom-killer',
	part: 'La mémoire',
	title: 'L’OOM killer',
	minutes: 10,
	hook: [
		'Une machine sous Debian 13 manque de mémoire à 01:16:37. Le journal affiche `Out of memory: Killed process 1905 (pipewire-pulse)` : un serveur de son qui occupe 34 260 kB de mémoire anonyme. Dans les 18 secondes suivantes, le noyau tue 21 autres processus.',
		'La dernière ligne concerne un processus de contenu de Firefox avec 249 960 kB de mémoire anonyme, sept fois plus que la première victime. Les 21 premières victimes portent toutes `oom_score_adj:200`. Le processus Firefox porte `oom_score_adj:167`.',
		'L’auteur a ouvert l’[issue systemd 38492](' + ISSUE + '). Le noyau a appliqué son code : il ajoute à chaque score une part de la RAM et du swap, proportionnelle à `oom_score_adj`. **Les 33 unités de plus du serveur de son ont pesé plus lourd que les 215 MB que Firefox utilisait en plus.**'
	],
	terms: [
		{ term: 'OOM killer', def: 'Le code du noyau dans `mm/oom_kill.c` qui choisit un processus et lui envoie SIGKILL quand une allocation échoue et que la récupération de mémoire n’a rien libéré.' },
		{ term: 'Badness', def: 'Le score que `oom_badness()` donne à chaque processus : pages résidentes, pages dans le swap, pages de tables de pages, plus la part liée à `oom_score_adj`. Le score le plus haut est tué.' },
		{ term: 'oom_score_adj', def: 'Une valeur par processus, de -1000 à 1000, dans `/proc/<pid>/oom_score_adj`. Chaque unité ajoute un millième de la mémoire autorisée au badness. -1000 veut dire : ne jamais choisir ce processus.' },
		{ term: 'oom_score', def: 'Le fichier en lecture seule `/proc/<pid>/oom_score` : le badness remis à l’échelle pour l’affichage. 0 veut dire que le processus est exempté.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['alloc["Un processus touche une nouvelle page : l’allocateur a besoin d’une page libre"] --> reclaim["Récupération : vider le cache de pages, écrire dans le swap"]', 'reclaim -->|"rien de libéré"| oom["__alloc_pages_may_oom appelle out_of_memory()"]'],
				highlight: ['alloc', 'oom'],
				note: 'L’allocateur de pages essaie d’abord de libérer de la mémoire : il jette le cache de pages propre et écrit des pages anonymes dans le swap. Si rien ne se libère, `__alloc_pages_may_oom` appelle `out_of_memory()`. Un commentaire à cet endroit dit : "We have already exhausted all our reclaim opportunities without any success".'
			},
			{
				add: ['oom --> shortcut["L’appelant meurt-il déjà ? panic_on_oom est-il actif ?"]'],
				highlight: ['shortcut'],
				note: 'Si le processus courant a déjà un SIGKILL en attente, le noyau le laisse sortir et libérer sa mémoire. Avec `vm.panic_on_oom = 1`, le noyau panique au lieu de tuer. La valeur par défaut est 0 : le noyau choisit donc une victime.'
			},
			{
				add: ['shortcut -->|"par défaut"| scan["select_bad_process : oom_badness() pour chaque processus"]'],
				highlight: ['scan'],
				note: '`select_bad_process` parcourt tous les processus, ou seulement ceux d’un cgroup quand ce cgroup mémoire a atteint sa limite. Le PID 1 et les threads du noyau sont ignorés. Un processus à `oom_score_adj` -1000 reçoit `LONG_MIN` et ne peut jamais être choisi.'
			},
			{
				add: ['scan --> kill["oom_kill_process : SIGKILL, puis la ligne de log"]', 'kill --> log["Out of memory: Killed process 1905 (pipewire-pulse) ... oom_score_adj:200"]'],
				highlight: ['kill', 'log'],
				note: 'Le noyau envoie SIGKILL au processus qui a le score le plus haut. Le processus ne peut pas l’intercepter. Le noyau écrit ensuite une ligne avec les tailles mémoire de la victime et son `oom_score_adj`. Avec `vm.oom_dump_tasks = 1`, la valeur par défaut, un tableau de toutes les tâches la précède.'
			},
			{
				add: ['log --> reap["oom_reaper libère la mémoire de la victime"]', 'reap -.->|"toujours pas assez"| oom'],
				highlight: ['reap'],
				note: 'Un thread du noyau, l’OOM reaper, démappe la mémoire anonyme de la victime sans attendre qu’elle sorte, et écrit `oom_reaper: reaped process 1905`. Si l’allocation suivante échoue encore, toute la boucle recommence. La machine de l’introduction l’a parcourue 22 fois en 18 secondes.'
			}
		]
	},
	example: {
		title: 'mm/oom_kill.c : oom_badness, le score d’un processus',
		repo: 'torvalds/linux',
		url: `${OOM}#L202-L240`,
		lang: 'c',
		code: `long oom_badness(struct task_struct *p, unsigned long totalpages)
{
	long points;
	long adj;

	if (oom_unkillable_task(p))
		return LONG_MIN;

	p = find_lock_task_mm(p);
	if (!p)
		return LONG_MIN;

	/*
	 * Do not even consider tasks which are explicitly marked oom
	 * unkillable or have been already oom reaped or the are in
	 * the middle of vfork
	 */
	adj = (long)p->signal->oom_score_adj;
	if (adj == OOM_SCORE_ADJ_MIN ||
			test_bit(MMF_OOM_SKIP, &p->mm->flags) ||
			in_vfork(p)) {
		task_unlock(p);
		return LONG_MIN;
	}

	/*
	 * The baseline for the badness score is the proportion of RAM that each
	 * task's rss, pagetable and swap space use.
	 */
	points = get_mm_rss(p->mm) + get_mm_counter(p->mm, MM_SWAPENTS) +
		mm_pgtables_bytes(p->mm) / PAGE_SIZE;
	task_unlock(p);

	/* Normalize to oom_score_adj units */
	adj *= totalpages / 1000;
	points += adj;

	return points;
}`,
		notes: [
			'La ligne 6 appelle `oom_unkillable_task()`, qui renvoie vrai pour le PID 1 et pour les threads du noyau. Les lignes 19 à 23 renvoient `LONG_MIN` quand `oom_score_adj` vaut -1000 : l’appelant, `oom_evaluate_task`, ne choisit alors jamais ce processus.',
			'Les lignes 30 et 31 comptent des pages : les pages résidentes (`get_mm_rss`), les pages dans le swap (`MM_SWAPENTS`) et les pages de tables de pages. Ce code ne lit ni le temps CPU, ni l’âge du processus, ni son nombre d’enfants.',
			'La ligne 35 convertit `oom_score_adj` en pages : `totalpages / 1000` par unité. Pour un OOM de toute la machine, `totalpages` vaut RAM plus swap. Pour un cgroup mémoire, [`constrained_alloc`](' + OOM + '#L252-L262) y met la limite du cgroup.',
			'Calcul avec une taille supposée de 8 GiB de RAM et de swap (l’issue ne la donne pas) : 2 097 152 pages, soit 2 097 pages par unité. pipewire-pulse obtient 9 927 pages résidentes plus 200 × 2 097, environ 429 000. Firefox obtient 64 640 plus 167 × 2 097, environ 415 000. Le noyau tue donc pipewire-pulse en premier.'
		]
	},
	tradeoff: {
		gain: [
			'Avec `panic_on_oom = 0`, la machine continue de tourner : un seul SIGKILL libère tout un espace d’adressage et les autres processus continuent.',
			'`oom_score_adj = -1000` protège un processus dont tu as besoin pour joindre la machine. Sur la machine utilisée pour ce chapitre, `sshd` est à -1000 avec un `oom_score` de 0.',
			'Le kubelet met -997 aux conteneurs des pods Guaranteed et 1000 à ceux des pods BestEffort : les conteneurs BestEffort partent en premier.'
		],
		cost: [
			'La victime reçoit SIGKILL : aucun handler ne tourne, aucun buffer n’est vidé, les transactions ouvertes sont coupées. Un serveur de base de données qui a le plus haut score perd toutes ses connexions d’un coup.',
			'Le score ne tient compte que des pages et de `oom_score_adj`. Un service de 34 MB à `oom_score_adj` 200 peut mourir avant le processus de 250 MB qui grossit, comme dans l’introduction.',
			'Un processus à -1000 qui fuit n’est jamais choisi. Le noyau tue les autres un par un, puis panique avec "System is deadlocked on memory" s’il n’en reste aucun.'
		]
	},
	task: {
		prompt: 'Dans un terminal, lance `for p in $$ $(pgrep -o -x sshd); do echo $p $(cat /proc/$p/comm) $(cat /proc/$p/oom_score_adj) $(cat /proc/$p/oom_score); done`. Colonnes : PID, nom, `oom_score_adj`, `oom_score`. Lequel des deux le noyau tuerait-il en premier, et pourquoi un des scores vaut-il exactement 0 ?',
		hint: '`proc_oom_score()` dans `fs/proc/base.c` affiche `(1000 + badness * 1000 / totalpages) * 2 / 3`, et affiche 0 quand `oom_badness()` a renvoyé `LONG_MIN`.',
		answer: [
			'Sortie capturée pendant cette session sur un noyau 6.17 avec 27 GiB de RAM et 3,8 GiB de swap : `4049997 zsh 100 733` et `2313 sshd -1000 0`.',
			'Le shell occupe 4 748 kB, une part minuscule de 8 millions de pages : son badness vient presque entièrement de l’ajustement, 100 unités. (1000 + 100) × 2 / 3 donne 733.',
			'sshd est à -1000 : `oom_badness()` renvoie `LONG_MIN` et le fichier affiche 0. Il ne peut pas être choisi. Le shell partirait en premier, et tout processus avec un `oom_score` plus haut partirait avant lui.',
			'Le 100 du shell vient de systemd : `user@.service` fixe `OOMScoreAdjust=100` pour le gestionnaire utilisateur, et l’issue de l’introduction montre ses services à 200.'
		]
	},
	quiz: [
		{
			q: 'Toute la machine manque de mémoire, avec les sysctls par défaut. Quel processus l’OOM killer choisit-il ?',
			options: [
				'Le processus dont l’allocation a échoué, puisque c’est lui qui a déclenché l’OOM',
				'Celui qui a le plus de pages en RAM et dans le swap, plus sa part `oom_score_adj`',
				'Le processus qui a consommé le plus de temps CPU dans la dernière minute',
				'Le dernier processus lancé, parce qu’il a fait le moins de travail'
			],
			answer: 1,
			why: '`select_bad_process` appelle `oom_badness()` pour chaque processus et garde le plus haut. Tuer l’appelant n’arrive qu’avec `vm.oom_kill_allocating_task` différent de 0, et la valeur par défaut est 0. La formule de `oom_badness()` ne lit ni le temps CPU ni l’heure de démarrage.'
		},
		{
			q: 'Tu écris -1000 dans `/proc/<pid>/oom_score_adj` pour ta base de données. Quel effet ?',
			options: [
				'Le score baisse de 1000 points : la base ne meurt qu’après les autres',
				'Le noyau refuse les nouvelles allocations de la base de données',
				'La base sort des candidats : `oom_badness()` renvoie `LONG_MIN`',
				'Les pages de la base partent en premier dans le swap sous pression mémoire'
			],
			answer: 2,
			why: '`OOM_SCORE_ADJ_MIN` vaut -1000, et `oom_badness()` renvoie `LONG_MIN` pour cette valeur, que `oom_evaluate_task` ignore toujours. Le processus n’est jamais choisi, quelle que soit la mémoire qu’il occupe.'
		},
		{
			q: 'dmesg affiche `Memory cgroup out of memory: Killed process 4242 (java)`, alors que `free -h` sur l’hôte montre 20 GB disponibles. Que s’est-il passé ?',
			options: [
				'L’hôte a manqué de mémoire un instant, puis il a libéré 20 GB',
				'Le noyau a tué java parce qu’il utilisait le plus de CPU sur l’hôte',
				'`free` se trompe, parce qu’il ne compte pas le cache de pages',
				'Le conteneur a atteint sa limite de cgroup : seuls ses processus ont un score'
			],
			answer: 3,
			why: 'Pour un OOM de cgroup mémoire, `out_of_memory()` écrit "Memory cgroup out of memory" et `select_bad_process` ne parcourt que les tâches de ce cgroup. `totalpages` vaut la limite du cgroup : la mémoire libre de l’hôte n’entre pas en jeu.'
		}
	],
	recall: {
		q: 'Qu’est-ce que `oom_badness()` additionne pour chaque processus, et que fait `oom_score_adj` à -1000 ?',
		a: 'Les pages résidentes, les pages dans le swap et les pages de tables de pages, plus `oom_score_adj` × `totalpages` / 1000. Le score le plus haut reçoit SIGKILL. À -1000, la fonction renvoie `LONG_MIN` : le processus n’est jamais choisi.'
	},
	sources: [
		{ title: 'Linux v6.12, mm/oom_kill.c', url: OOM },
		{ title: 'Linux v6.12, Documentation/admin-guide/sysctl/vm.rst (panic_on_oom, oom_kill_allocating_task)', url: `${K}/Documentation/admin-guide/sysctl/vm.rst` },
		{ title: 'proc_pid_oom_score_adj(5), man7.org', url: 'https://man7.org/linux/man-pages/man5/proc_pid_oom_score_adj.5.html' },
		{ title: 'Issue systemd 38492 : le oom_score_adj=200 par défaut des services utilisateur', url: ISSUE },
		{ title: 'systemd-system.conf(5), DefaultOOMScoreAdjust=', url: 'https://www.freedesktop.org/software/systemd/man/latest/systemd-system.conf.html' },
		{ title: 'Documentation Kubernetes, Node-pressure eviction (oom_score_adj par classe QoS)', url: 'https://kubernetes.io/docs/concepts/scheduling-eviction/node-pressure-eviction/' }
	]
};
